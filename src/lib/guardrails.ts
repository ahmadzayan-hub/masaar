// Guardrail engine — the "control tower". Every drafted reply runs through
// these checks before an operator is allowed to approve & send. Pure functions,
// no I/O, fully unit-testable (see tests/guardrails.test.ts).

import {
  GuardrailFinding,
  GuardrailResult,
  ReplyContext,
} from "./types";
import { resolveArabicName, replyUsesUnverifiedArabicName } from "./arabic-names";

// ---- §7 Product claim control ----
// Phrases that imply an unverified material/quality claim. Blocked unless the
// supplier evidence flag is provided.
const BLOCKED_CLAIMS: { pattern: RegExp; label: string; safe: string }[] = [
  { pattern: /\breal gold\b|ذهب حقيقي|ذهب اصلي|ذهب أصلي/i, label: "real gold", safe: "gold-tone fashion jewellery" },
  { pattern: /\breal silver\b|فضة حقيقية|فضة اصلية/i, label: "real silver", safe: "silver-tone fashion jewellery" },
  { pattern: /\bwaterproof\b|مقاوم للماء|ضد الماء/i, label: "waterproof", safe: "fashion accessory" },
  { pattern: /\banti[-\s]?tarnish\b|لا يتغير لونه|مايغير لونه/i, label: "anti-tarnish", safe: "plated finish" },
  { pattern: /\bhypoallergenic\b|مضاد للحساسية/i, label: "hypoallergenic", safe: "fashion accessory" },
  { pattern: /\blifetime colou?r\b|لون مدى الحياة/i, label: "lifetime colour", safe: "plated finish (subject to care)" },
  { pattern: /\bluxury material\b|خامة فاخرة/i, label: "luxury material", safe: "premium fashion accessory" },
  { pattern: /\bmedical grade\b/i, label: "medical grade", safe: "fashion accessory" },
  { pattern: /\boriginal brand\b|ماركة اصلية|ماركة أصلية/i, label: "original brand", safe: "fashion accessory" },
  { pattern: /\bguaranteed forever\b|مضمون مدى الحياة/i, label: "guaranteed forever", safe: "subject to availability" },
];

// ---- §14 Privacy: detect customer private data in text ----
const UAE_PHONE = /(?:\+?971|0)(?:\s?5\d)(?:[\s-]?\d){7}/;
const GENERIC_LONG_NUMBER = /\b\d{7,}\b/;
const ADDRESS_HINTS = /\b(villa|building|bldg|apartment|apt|flat|street|st\.|floor|room|p\.?o\.?\s?box|makani)\b/i;
const PAYMENT_HINTS = /\b(iban|card number|cvv|otp|transfer reference|tabby|tamara|stripe receipt)\b/i;

// ---- intent helpers ----
const PRICE_QUESTION = /\b(how much|price|cost|كم|بكم|السعر|كم سعر)\b/i;
const PAYMENT_NUDGE = /\b(pay|payment|link|order|reserve|احجز|نحجز|الدفع|رابط|الطلب)\b/i;

// Heuristic: does the reply quote a numeric price (AED)?
const PRICE_IN_REPLY = /(aed|درهم|aed\s?\d|\d+\s?(aed|درهم|dhs?))/i;

const PAYMENT_BLOCKERS = new Set(["needs_verification", "none", "link_sent"]);

export interface GuardrailInput {
  reply: string;
  // The original customer message (used for answered-question / intent checks).
  customerMessage: string;
  context: ReplyContext;
  // Owner attests supplier evidence exists for a material claim.
  claimEvidenceVerified?: boolean;
  // Set true when the reply is a dispatch / courier-promise action.
  isCourierPromise?: boolean;
  // Set true when the reply contains or implies a refund/exchange/complaint.
  isSensitiveAction?: boolean;
}

// A claim phrase is safe when it's explicitly negated, e.g. "not real gold"
// or "ليس ذهب حقيقي". We inspect the text shortly before the match.
const NEGATION = /\b(not|no|isn'?t|aren'?t)\b|مو|مش|ليس|ليست|بدون/i;
function isNegatedClaim(reply: string, pattern: RegExp): boolean {
  const m = reply.match(pattern);
  if (!m || m.index === undefined) return false;
  const before = reply.slice(Math.max(0, m.index - 18), m.index);
  return NEGATION.test(before);
}

function worst(findings: GuardrailFinding[]): "pass" | "warn" | "fail" {
  if (findings.some((f) => f.status === "fail")) return "fail";
  if (findings.some((f) => f.status === "warn")) return "warn";
  return "pass";
}

export function runGuardrails(input: GuardrailInput): GuardrailResult {
  const { reply, customerMessage, context } = input;
  const findings: GuardrailFinding[] = [];
  let revised = reply;

  // ---------- §7 Claim control ----------
  for (const claim of BLOCKED_CLAIMS) {
    if (claim.pattern.test(reply) && !isNegatedClaim(reply, claim.pattern)) {
      if (input.claimEvidenceVerified) {
        findings.push({
          code: "claim",
          status: "warn",
          message: `Reply states "${claim.label}" — allowed only because supplier evidence is on file. Confirm before sending.`,
          requiresHumanApproval: true,
        });
      } else {
        findings.push({
          code: "claim",
          status: "fail",
          message: `Blocked claim "${claim.label}" without supplier evidence. Use safe wording: "${claim.safe}".`,
          requiresHumanApproval: true,
        });
        revised = revised.replace(claim.pattern, claim.safe);
      }
    }
  }

  // ---------- §14 Privacy ----------
  const privacyHits: string[] = [];
  if (UAE_PHONE.test(reply) || (GENERIC_LONG_NUMBER.test(reply) && !PRICE_IN_REPLY.test(reply)))
    privacyHits.push("phone number");
  if (ADDRESS_HINTS.test(reply)) privacyHits.push("address");
  if (PAYMENT_HINTS.test(reply)) privacyHits.push("payment details");
  if (privacyHits.length) {
    findings.push({
      code: "privacy",
      status: "fail",
      message: `Reply appears to expose private data (${privacyHits.join(", ")}). Never echo customer phone/address/payment in a public-facing reply.`,
      requiresHumanApproval: true,
    });
  } else {
    findings.push({ code: "privacy", status: "pass", message: "No private data leak detected in reply." });
  }

  // ---------- §6 Price governance ----------
  if (PRICE_QUESTION.test(customerMessage)) {
    if (!PRICE_IN_REPLY.test(reply)) {
      findings.push({
        code: "price",
        status: "warn",
        message: "Customer asked about price but the reply does not state a clear AED figure. Answer price directly first (§5).",
      });
    }
    const hasActiveOffer = context.activeOffers.some(
      (o) => o.active && new Date(o.end_at).getTime() > Date.now()
    );
    if (context.quotedPrice != null && !hasActiveOffer) {
      findings.push({
        code: "price",
        status: "warn",
        message: "A price is being quoted but no active, unexpired offer is loaded. Verify active offer before quoting (§6).",
        requiresHumanApproval: true,
      });
    }
  }

  // ---------- §6/§9 VAT clarity ----------
  if (context.vatApplicable && PRICE_IN_REPLY.test(reply) && !/vat|ضريبة|5%/i.test(reply)) {
    findings.push({
      code: "vat",
      status: "warn",
      message: "VAT is applicable but the quoted total does not mention VAT. Show product + delivery + 5% VAT + total.",
    });
  }

  // ---------- §8 Stock control ----------
  // Detect an affirmative in-stock promise.
  const promisesStock = /\b(in stock|available now|متوفر|موجود عندنا|نعم متوفر)\b/i.test(reply);
  if (promisesStock && context.stockKnownAvailable !== true) {
    findings.push({
      code: "stock",
      status: "fail",
      message: 'Reply confirms stock that is not verified as available. Say "We will confirm availability for you." until stock is confirmed (§8).',
      requiresHumanApproval: true,
    });
  } else {
    findings.push({ code: "stock", status: "pass", message: "No unverified stock promise." });
  }

  // ---------- §10 Delivery control ----------
  const promisesSameDay = /\b(same.?day|today|اليوم|نفس اليوم)\b/i.test(reply);
  const promisesDelivery = /\b(deliver|delivery|توصيل|يوصل|نوصل)\b/i.test(reply);
  const isOutsideDubai = !!context.emirate && !/dubai|دبي/i.test(context.emirate);
  if (promisesSameDay && promisesDelivery && isOutsideDubai && context.courierConfirmed !== true) {
    findings.push({
      code: "delivery",
      status: "fail",
      message: `Reply promises same-day outside Dubai (${context.emirate}) without courier confirmation. Use "expected delivery, subject to courier confirmation" (§10).`,
      requiresHumanApproval: true,
    });
  } else if (promisesDelivery && context.courierConfirmed !== true && isOutsideDubai) {
    findings.push({
      code: "delivery",
      status: "warn",
      message: `Delivery referenced for ${context.emirate} before courier cost/timing confirmed. Word as "expected / subject to courier confirmation".`,
    });
  } else {
    findings.push({ code: "delivery", status: "pass", message: "Delivery wording safe." });
  }

  // ---------- §9 Payment control ----------
  if (input.isCourierPromise) {
    if (context.paymentStatus !== "confirmed") {
      findings.push({
        code: "payment",
        status: "fail",
        message: `No courier dispatch before payment is confirmed (current: ${context.paymentStatus ?? "none"}). Owner override required (§9).`,
        requiresHumanApproval: true,
      });
    }
  }

  // ---------- §4 Arabic name ----------
  const nameResult = resolveArabicName(
    context.customerNameDisplay,
    context.customerNameArabicVerified
  );
  if (context.language !== "en" && replyUsesUnverifiedArabicName(reply, nameResult)) {
    findings.push({
      code: "arabic_name",
      status: "warn",
      message: `${nameResult.note} Address the customer as "${nameResult.safeAddress}" instead of an unverified name.`,
    });
  } else {
    findings.push({ code: "arabic_name", status: "pass", message: nameResult.note });
  }

  // ---------- §5 Length ----------
  const wordCount = reply.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 70) {
    findings.push({
      code: "length",
      status: "warn",
      message: `Reply is long (${wordCount} words). Keep it short and clear (§5).`,
    });
  }

  // ---------- §29 Answered the exact question ----------
  if (PRICE_QUESTION.test(customerMessage) && !PRICE_IN_REPLY.test(reply)) {
    findings.push({
      code: "answered_question",
      status: "warn",
      message: "Customer's price question may not be directly answered.",
    });
  }

  // ---------- §29 Moves one step closer to payment ----------
  if (!PAYMENT_NUDGE.test(reply) && !input.isSensitiveAction) {
    findings.push({
      code: "moves_to_payment",
      status: "warn",
      message: "Reply has no clear next step toward order/payment. Consider a soft nudge (§5/§18).",
    });
  }

  // ---------- §24 Human approval matrix ----------
  if (input.isSensitiveAction) {
    findings.push({
      code: "human_escalation",
      status: "warn",
      message: "Refund / exchange / complaint / sensitive action — owner approval mandatory before sending (§24).",
      requiresHumanApproval: true,
    });
  }

  const worstStatus = worst(findings);
  const requiresHumanApproval = findings.some((f) => f.requiresHumanApproval);

  return {
    findings,
    worstStatus,
    requiresHumanApproval,
    revisedReply: revised !== reply ? revised : undefined,
  };
}

// Build the live total breakdown the customer must see before payment (§9).
export function buildTotalBreakdown(opts: {
  productPrice: number;
  deliveryCost: number;
  vatRule: "inclusive" | "exclusive" | "none";
}): {
  productPrice: number;
  deliveryCost: number;
  subtotal: number;
  vatAmount: number;
  total: number;
} {
  const subtotal = round2(opts.productPrice + opts.deliveryCost);
  let vatAmount = 0;
  let total = subtotal;
  if (opts.vatRule === "exclusive") {
    vatAmount = round2(subtotal * 0.05);
    total = round2(subtotal + vatAmount);
  } else if (opts.vatRule === "inclusive") {
    vatAmount = round2(subtotal - subtotal / 1.05);
    total = subtotal;
  }
  return {
    productPrice: round2(opts.productPrice),
    deliveryCost: round2(opts.deliveryCost),
    subtotal,
    vatAmount,
    total,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// §23 Fraud / scam screening — independent of reply wording.
export function screenFraudSignals(signals: {
  asksCourierBeforePayment?: boolean;
  unclearPaymentScreenshot?: boolean;
  largeOrderNoDeposit?: boolean;
  pressureUrgentNoPayment?: boolean;
  refusesPhoneOrArea?: boolean;
  repeatedUnpaidOrders?: boolean;
  fakeOrInvalidAddress?: boolean;
}): GuardrailFinding[] {
  const out: GuardrailFinding[] = [];
  const map: [keyof typeof signals, string][] = [
    ["asksCourierBeforePayment", "Customer asks for courier before payment."],
    ["unclearPaymentScreenshot", "Unclear payment screenshot — needs verification."],
    ["largeOrderNoDeposit", "Large order with no deposit."],
    ["pressureUrgentNoPayment", "Pressure for urgent delivery without payment."],
    ["refusesPhoneOrArea", "Customer refuses to share phone or delivery area."],
    ["repeatedUnpaidOrders", "Repeated unpaid orders from this customer."],
    ["fakeOrInvalidAddress", "Address looks fake or invalid."],
  ];
  for (const [key, msg] of map) {
    if (signals[key]) {
      out.push({
        code: "human_escalation",
        status: "warn",
        message: `Fraud signal: ${msg} Require payment/deposit & owner review before dispatch (§23).`,
        requiresHumanApproval: true,
      });
    }
  }
  return out;
}
