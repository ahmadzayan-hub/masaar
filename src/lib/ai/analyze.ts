// Analysis pipeline (spec §17 + §29). Takes a customer message (+ optional
// screenshot) and context, calls the configured AI provider for a structured
// JSON analysis, validates it, then runs the drafted reply through the
// guardrail engine. The result is what the operator reviews & approves.

import { z } from "zod";
import { AnalysisOutput, ReplyContext } from "../types";
import { GuardrailResult } from "../types";
import { runGuardrails } from "../guardrails";
import { getProvider, ChatMessage } from "./provider";
import { DEFAULT_PROMPTS, PromptKey } from "./prompts";

const analysisSchema = z.object({
  customer_intent: z.string(),
  lead_temperature: z.enum(["cold", "warm", "hot"]),
  customer_persona: z.enum([
    "gift_buyer",
    "personal_buyer",
    "customization_buyer",
    "price_sensitive_buyer",
    "urgent_buyer",
    "hot_lead",
    "repeat_buyer",
    "vip_buyer",
    "supplier_or_platform_lead",
    "lost_lead",
    "hesitant_buyer",
  ]),
  product_identified: z.string(),
  name_check: z.string(),
  correct_arabic_name: z.string().nullable(),
  missing_information: z.array(z.string()),
  risk_or_caution: z.array(z.string()),
  best_reply_to_send: z.string(),
  next_action: z.string(),
  follow_up_timing: z.string(),
  internal_sales_note: z.string(),
  order_record_update: z.record(z.unknown()).nullable(),
  confidence_score: z.number().min(0).max(1),
});

export interface AnalyzeInput {
  customerMessage: string;
  context: ReplyContext;
  images?: { mimeType: string; dataBase64: string }[];
  // Owner-editable prompt overrides loaded from the DB (key -> text).
  promptOverrides?: Partial<Record<PromptKey, string>>;
  claimEvidenceVerified?: boolean;
  isCourierPromise?: boolean;
  isSensitiveAction?: boolean;
}

export interface AnalyzeResult {
  analysis: AnalysisOutput;
  guardrails: GuardrailResult;
  rawModelOutput: string;
  provider: string;
  model: string;
}

function prompt(key: PromptKey, overrides?: Partial<Record<PromptKey, string>>): string {
  return overrides?.[key] ?? DEFAULT_PROMPTS[key];
}

export async function analyzeConversation(input: AnalyzeInput): Promise<AnalyzeResult> {
  const { context, promptOverrides } = input;
  const provider = getProvider();

  const styleKey: PromptKey =
    context.language === "ar" ? "arabic_reply_style" : "english_reply_style";

  const offerLines = context.activeOffers
    .map(
      (o) =>
        `- ${o.name}: AED ${o.price} | delivery=${o.delivery_rule} | vat=${o.vat_rule} | active=${o.active} | ends=${o.end_at}`
    )
    .join("\n") || "- (no active offers loaded — you must NOT quote a price)";

  const inventoryLines = context.inventory
    .map((i) => `- ${i.product_id} ${i.colour}/${i.finish}: ${i.quantity_available} available`)
    .join("\n") || "- (no inventory loaded — say you will confirm availability)";

  const contextBlock = `CONTEXT
Language: ${context.language}
Customer display name: ${context.customerNameDisplay ?? "(unknown)"}
Verified Arabic name: ${context.customerNameArabicVerified ?? "(none)"}
Emirate: ${context.emirate ?? "(unknown)"}
Payment status: ${context.paymentStatus ?? "none"}
Courier confirmed: ${context.courierConfirmed ?? false}
Stock known available: ${context.stockKnownAvailable ?? false}
VAT applicable: ${context.vatApplicable ?? false}
ACTIVE OFFERS:
${offerLines}
INVENTORY:
${inventoryLines}`;

  const messages: ChatMessage[] = [
    { role: "system", content: prompt("master_agent", promptOverrides) },
    { role: "system", content: prompt(styleKey, promptOverrides) },
    { role: "system", content: prompt("product_recognition", promptOverrides) },
    { role: "system", content: prompt("price_guard", promptOverrides) },
    { role: "system", content: prompt("delivery_guard", promptOverrides) },
    { role: "system", content: prompt("payment_guard", promptOverrides) },
    { role: "system", content: contextBlock },
    {
      role: "user",
      content: `Customer message:\n"""${input.customerMessage}"""\n\nReturn ONLY the JSON analysis.`,
    },
  ];

  const raw = await provider.complete(messages, {
    json: true,
    images: input.images,
    temperature: 0.4,
  });

  const analysis = parseAnalysis(raw);

  const guardrails = runGuardrails({
    reply: analysis.best_reply_to_send,
    customerMessage: input.customerMessage,
    context,
    claimEvidenceVerified: input.claimEvidenceVerified,
    isCourierPromise: input.isCourierPromise,
    isSensitiveAction: input.isSensitiveAction,
  });

  return {
    analysis,
    guardrails,
    rawModelOutput: raw,
    provider: provider.name,
    model: provider.model,
  };
}

export function parseAnalysis(raw: string): AnalysisOutput {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("Model did not return valid JSON");
  }
  const parsed = analysisSchema.parse(json);
  // Normalise product_identified to a known category or "unknown".
  return parsed as AnalysisOutput;
}

// Tolerate models that wrap JSON in markdown fences or prose.
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return raw.slice(first, last + 1);
  return raw.trim();
}
