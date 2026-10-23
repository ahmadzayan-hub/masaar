import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySignature } from "../src/lib/confirm/inbound";
import { requireWebhookSecret, checkWebhookSecret } from "../src/lib/http/auth";
import { notPersisted, promoteIntakeOrder, recordIntakeOrder } from "../src/lib/orders/sink";

const req = (secret?: string) =>
  ({ headers: new Headers(secret ? { "x-webhook-secret": secret } : {}) }) as any;

afterEach(() => vi.unstubAllEnvs());

describe("inbound webhook gates fail closed", () => {
  it("refuses form intake when no WEBHOOK_SECRET is configured", () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    vi.stubEnv("MASAAR_ALLOW_UNSIGNED_WEBHOOKS", "");
    expect(requireWebhookSecret(req())).toBe(false);
  });

  it("accepts only the matching secret", () => {
    vi.stubEnv("WEBHOOK_SECRET", "synthetic-secret");
    expect(requireWebhookSecret(req("synthetic-secret"))).toBe(true);
    expect(requireWebhookSecret(req("synthetic-secreT"))).toBe(false);
    expect(requireWebhookSecret(req())).toBe(false);
  });

  it("honours the local-development opt-in, never on Vercel production", () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    vi.stubEnv("MASAAR_ALLOW_UNSIGNED_WEBHOOKS", "1");
    vi.stubEnv("VERCEL_ENV", "development");
    expect(requireWebhookSecret(req())).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(requireWebhookSecret(req())).toBe(false);
  });

  it("refuses an unsigned WhatsApp delivery when WHATSAPP_APP_SECRET is unset", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    vi.stubEnv("MASAAR_ALLOW_UNSIGNED_WEBHOOKS", "");
    expect(verifySignature("{}", null)).toBe(false);
  });

  it("verifies a correct X-Hub-Signature-256 and rejects a tampered body", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "synthetic-app-secret");
    const body = '{"entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "synthetic-app-secret").update(body).digest("hex");
    expect(verifySignature(body, sig)).toBe(true);
    expect(verifySignature(body + " ", sig)).toBe(false);
  });

  it("keeps the operator endpoint gate unchanged (session middleware covers it)", () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    expect(checkWebhookSecret(req())).toBe(true);
  });
});

describe("mock persistence is explicit", () => {
  it("never reports a durable write without Supabase, and fails on production", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_ENV", "development");
    const dev = await promoteIntakeOrder("TOK-SYN");
    expect(dev).toMatchObject({ ok: true, provider: "mock", persisted: false });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(notPersisted("x")).toMatchObject({ ok: false, provider: "mock", persisted: false });
    const prod = await recordIntakeOrder({
      token: "TOK-SYN", customerName: "SYNTHETIC", phone: "+971500000001", whatsappNumber: "+971500000001",
      emirate: "Dubai", criticalDataStatus: "DATA INTACT", orderStatus: "Awaiting Customer Confirmation",
    });
    expect(prod.supabase).toMatchObject({ ok: false, persisted: false });
  });
});
