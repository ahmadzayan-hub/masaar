// Configurable AI provider wrapper (spec §25).
// The owner picks a provider via AI_PROVIDER env var. NO keys are hard-coded —
// everything comes from environment variables. Adding a provider = add a case.

// "groq" and "together" are OpenAI-compatible hosts for open models
// (Llama 3.1 70B, Qwen 2.5 72B). "openai_compatible" lets the owner point at
// any OpenAI-compatible endpoint via OPENAI_COMPATIBLE_BASE_URL.
import { env } from "@/lib/env";

export type AiProviderName =
  | "openai"
  | "groq"
  | "together"
  | "openai_compatible"
  | "anthropic"
  | "gemini"
  | "mock";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallOptions {
  // Force JSON-only output (used by the analysis pipeline).
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  // Optional base64 images (chat screenshots / product photos) for vision.
  images?: { mimeType: string; dataBase64: string }[];
}

export interface AiProvider {
  name: AiProviderName;
  model: string;
  complete(messages: ChatMessage[], opts?: AiCallOptions): Promise<string>;
}

// ---- OpenAI-compatible (OpenAI, Groq, Together, or any compatible host) ----
// Open models (Llama 3.1 70B / Qwen 2.5 72B) are served via Groq/Together using
// the same /chat/completions contract — one adapter covers all of them.
class OpenAiCompatibleProvider implements AiProvider {
  name: AiProviderName;
  model: string;
  private key: string | undefined;
  private baseUrl: string;
  private keyEnvName: string;

  constructor(name: AiProviderName, baseUrl: string, keyEnvName: string, model: string) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.keyEnvName = keyEnvName;
    this.key = env(keyEnvName);
    this.model = model;
  }

  async complete(messages: ChatMessage[], opts: AiCallOptions = {}): Promise<string> {
    if (!this.key) throw new Error(`${this.keyEnvName} is not set`);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.key}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 1200,
        response_format: opts.json ? { type: "json_object" } : undefined,
        messages: messages.map((m) =>
          m.role === "user" && opts.images?.length
            ? {
                role: m.role,
                content: [
                  { type: "text", text: m.content },
                  ...opts.images.map((img) => ({
                    type: "image_url",
                    image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
                  })),
                ],
              }
            : { role: m.role, content: m.content }
        ),
      }),
    });
    if (!res.ok) throw new Error(`${this.name} error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

// ---- Anthropic (Claude) ----
class AnthropicProvider implements AiProvider {
  name: AiProviderName = "anthropic";
  model = env("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
  private key = env("ANTHROPIC_API_KEY");

  async complete(messages: ChatMessage[], opts: AiCallOptions = {}): Promise<string> {
    if (!this.key) throw new Error("ANTHROPIC_API_KEY is not set");
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.4,
        system: opts.json ? `${system}\n\nRespond with valid JSON only.` : system,
        messages: rest.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content:
            m.role === "user" && opts.images?.length
              ? [
                  { type: "text", text: m.content },
                  ...opts.images.map((img) => ({
                    type: "image",
                    source: { type: "base64", media_type: img.mimeType, data: img.dataBase64 },
                  })),
                ]
              : m.content,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }
}

// ---- Google Gemini ----
class GeminiProvider implements AiProvider {
  name: AiProviderName = "gemini";
  model = env("GEMINI_MODEL") || "gemini-1.5-pro";
  private key = env("GEMINI_API_KEY");

  async complete(messages: ChatMessage[], opts: AiCallOptions = {}): Promise<string> {
    if (!this.key) throw new Error("GEMINI_API_KEY is not set");
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [
          { text: m.content },
          ...(m.role === "user" && opts.images?.length
            ? opts.images.map((img) => ({
                inlineData: { mimeType: img.mimeType, data: img.dataBase64 },
              }))
            : []),
        ],
      }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: opts.maxTokens ?? 1200,
          responseMimeType: opts.json ? "application/json" : undefined,
        },
        contents,
      }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}

// ---- Mock (no network) — used for local dev, tests, and when no key is set ----
class MockProvider implements AiProvider {
  name: AiProviderName = "mock";
  model = "mock";
  async complete(): Promise<string> {
    return JSON.stringify({
      customer_intent: "[mock] configure a real AI_PROVIDER + API key to enable live analysis",
      lead_temperature: "warm",
      customer_persona: "personal_buyer",
      product_identified: "unknown",
      name_check: "mock",
      correct_arabic_name: null,
      missing_information: ["product", "colour", "emirate"],
      risk_or_caution: ["mock provider — no live model call"],
      best_reply_to_send: "Hello 🤍 How can we help you today?",
      next_action: "Identify product interest.",
      follow_up_timing: "Next day if no reply.",
      internal_sales_note: "Mock output. Set AI_PROVIDER and the matching API key.",
      order_record_update: null,
      confidence_score: 0.1,
    });
  }
}

export function getProvider(): AiProvider {
  const name = (env("AI_PROVIDER") || "mock").toLowerCase() as AiProviderName;
  switch (name) {
    case "openai":
      return new OpenAiCompatibleProvider(
        "openai",
        "https://api.openai.com/v1",
        "OPENAI_API_KEY",
        env("OPENAI_MODEL") || "gpt-4o"
      );
    case "groq":
      return new OpenAiCompatibleProvider(
        "groq",
        "https://api.groq.com/openai/v1",
        "GROQ_API_KEY",
        env("GROQ_MODEL") || "llama-3.1-70b-versatile"
      );
    case "together":
      return new OpenAiCompatibleProvider(
        "together",
        "https://api.together.xyz/v1",
        "TOGETHER_API_KEY",
        env("TOGETHER_MODEL") || "Qwen/Qwen2.5-72B-Instruct-Turbo"
      );
    case "openai_compatible":
      return new OpenAiCompatibleProvider(
        "openai_compatible",
        env("OPENAI_COMPATIBLE_BASE_URL") || "https://api.openai.com/v1",
        "OPENAI_COMPATIBLE_API_KEY",
        env("OPENAI_COMPATIBLE_MODEL") || "llama-3.1-70b-versatile"
      );
    case "anthropic":
      return new AnthropicProvider();
    case "gemini":
      return new GeminiProvider();
    default:
      return new MockProvider();
  }
}
