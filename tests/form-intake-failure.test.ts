import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fake = vi.hoisted(() => ({ persist: vi.fn(), send: vi.fn() }));
vi.mock("../src/lib/http/auth", () => ({ requireWebhookSecret: () => true }));
vi.mock("../src/lib/confirm/store", () => ({ createConfirmation: vi.fn(), newToken: () => "TOK-SYN", usingMemory: () => false }));
vi.mock("../src/lib/orders/sink", () => ({ recordIntakeOrder: fake.persist }));
vi.mock("../src/lib/notify/provider", () => ({ sendWhatsAppButtons: fake.send, sendWhatsApp: fake.send, sendEmail: fake.send }));
import { POST } from "../src/app/api/webhook/form-intake/route";
const request = () => new NextRequest("http://localhost/api/webhook/form-intake", { method: "POST", body: JSON.stringify({
  fullName: "Synthetic Customer", mobileNumber: "+971500000001", emirate: "Dubai", area: "Synthetic Area",
  fullAddress: "Synthetic Building 1 Apartment 2", paymentMethod: "Cash on delivery", orderSummary: "Synthetic bracelet",
}) });
beforeEach(() => { vi.clearAllMocks(); fake.send.mockResolvedValue({ ok: false, provider: "mock" }); });
it("does not send buttons or claim success if durable intake persistence failed", async () => {
  fake.persist.mockResolvedValue({ supabase: { ok: false, persisted: false }, sheets: { ok: true, provider: "mock" } });
  const response = await POST(request());
  expect(response.status).toBe(503); expect((await response.json()).ok).toBe(false); expect(fake.send).not.toHaveBeenCalled();
});
it("does not claim delivery for a mock notification after persistence", async () => {
  fake.persist.mockResolvedValue({ supabase: { ok: true, persisted: true }, sheets: { ok: true, provider: "mock" } });
  const response = await POST(request());
  expect(response.status).toBe(503); expect((await response.json()).ok).toBe(false); expect(fake.send).toHaveBeenCalledOnce();
});
