import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireWebhookSecret } from "../src/lib/http/auth";
import { verifySignature } from "../src/lib/confirm/inbound";

const io = vi.hoisted(() => ({ store: vi.fn(), send: vi.fn(), apply: vi.fn() }));
vi.mock("../src/lib/confirm/store", () => ({
  wasProcessed: io.store, getReplyReceipt: io.store, getByToken: io.store,
  getLatestAwaitingByPhone: io.store, markProcessed: io.store,
}));
vi.mock("../src/lib/orders/sink", () => ({ applyConfirmationReply: io.apply, mirrorOrderStatus: io.apply }));
vi.mock("../src/lib/notify/provider", () => ({ sendWhatsApp: io.send }));
import { POST } from "../src/app/api/webhook/whatsapp/route";

const secret = "synthetic-byte-test-secret";
const sign = (body: Buffer | string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const request = (body: Buffer, signedBody: Buffer | string = body) => new NextRequest("http://localhost/api/webhook/whatsapp", {
  method: "POST", body: new Uint8Array(body), headers: { "x-hub-signature-256": sign(signedBody) },
});
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("WHATSAPP_APP_SECRET", secret); });
afterEach(() => vi.unstubAllEnvs());

describe("webhook authentication uses exact bytes and production fails closed", () => {
  it("rejects a prepended UTF-8 BOM when only the decoded JSON was signed", async () => {
    const json = '{"entry":[]}';
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json)]);
    expect((await POST(request(body, json))).status).toBe(401);
    expect(io.store).not.toHaveBeenCalled(); expect(io.send).not.toHaveBeenCalled();
  });
  it("rejects invalid UTF-8 when the replacement-character text was signed", async () => {
    const body = Buffer.concat([Buffer.from('{"note":"'), Buffer.from([0xff]), Buffer.from('","entry":[]}')]);
    expect((await POST(request(body, body.toString("utf8")))).status).toBe(401);
    expect(io.apply).not.toHaveBeenCalled();
  });
  it("accepts a genuine byte signature on Unicode and whitespace without reserializing", async () => {
    const body = Buffer.from(' { "note": "تأكيد ✓", "entry": [] }\n');
    expect((await POST(request(body))).status).toBe(200);
    expect(io.store).not.toHaveBeenCalled(); expect(io.send).not.toHaveBeenCalled();
  });
  it("rejects authentically signed invalid UTF-8 after authentication", async () => {
    const body = Buffer.concat([Buffer.from('{"note":"'), Buffer.from([0xff]), Buffer.from('","entry":[]}')]);
    expect((await POST(request(body))).status).toBe(400);
    expect(io.store).not.toHaveBeenCalled();
  });
  it("rejects a signed invalid JSON body after authentication", async () => {
    expect((await POST(request(Buffer.from('{not-json')))).status).toBe(400);
    expect(io.store).not.toHaveBeenCalled();
  });
  it.each([undefined, "development", "preview"])("refuses unsigned self-hosted production (VERCEL_ENV=%s)", (vercelEnv) => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.stubEnv("MASAAR_ALLOW_UNSIGNED_WEBHOOKS", "1");
    vi.stubEnv("WHATSAPP_APP_SECRET", ""); vi.stubEnv("WEBHOOK_SECRET", "");
    expect(verifySignature("{}", null)).toBe(false);
    expect(requireWebhookSecret({ headers: new Headers() } as NextRequest)).toBe(false);
  });
});
