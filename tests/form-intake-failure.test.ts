import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fake = vi.hoisted(() => ({ ingest: vi.fn(), send: vi.fn(), mark: vi.fn(), mirror: vi.fn() }));
vi.mock("../src/lib/http/auth", () => ({ requireWebhookSecret: () => true }));
vi.mock("../src/lib/confirm/store", () => ({ newToken: () => "TOK-SYN-NEW" }));
vi.mock("../src/lib/orders/form-intake", () => ({ ingestSubmission: fake.ingest, markSubmissionNotified: fake.mark,
  mirrorNewSubmission: fake.mirror, IntakeConflict: class extends Error {} }));
vi.mock("../src/lib/notify/provider", () => ({ sendWhatsAppButtons: fake.send, sendWhatsApp: fake.send, sendEmail: fake.send }));
import { POST } from "../src/app/api/webhook/form-intake/route";
const request = (key: string | undefined = "SYN-SUBMISSION") => new NextRequest("http://localhost/api/webhook/form-intake", {
  method: "POST", headers: key ? { "x-idempotency-key": key } : {}, body: JSON.stringify({
  fullName: "Synthetic Customer", mobileNumber: "+971500000001", emirate: "Dubai", area: "Synthetic Area",
  fullAddress: "Synthetic Building 1 Apartment 2", paymentMethod: "Cash on delivery", orderSummary: "Synthetic bracelet",
}) });
beforeEach(() => {
  vi.clearAllMocks(); fake.send.mockResolvedValue({ ok: false, provider: "mock" });
  fake.mark.mockResolvedValue(undefined); fake.mirror.mockResolvedValue({ ok: true, provider: "mock" });
  fake.ingest.mockResolvedValue({ token: "TOK-SYN", created: true, notification_sent: false, status: "awaiting" });
});
it("does not send buttons or claim success if durable intake transaction failed", async () => {
  fake.ingest.mockRejectedValue(new Error("synthetic database failure"));
  const response = await POST(request());
  expect(response.status).toBe(503); expect((await response.json()).ok).toBe(false); expect(fake.send).not.toHaveBeenCalled();
});
it("does not claim delivery for a mock notification after persistence", async () => {
  const response = await POST(request());
  expect(response.status).toBe(503); expect((await response.json()).ok).toBe(false); expect(fake.send).toHaveBeenCalledOnce();
  expect(fake.mark).not.toHaveBeenCalled();
});
it("requires a stable id before any writes", async () => {
  const response = await POST(request(""));
  expect(response.status).toBe(400); expect(fake.ingest).not.toHaveBeenCalled();
});
it("reuses durable token on retry without appending the Sheet again", async () => {
  fake.ingest.mockResolvedValue({ token: "TOK-ORIGINAL", created: false, notification_sent: false, status: "awaiting" });
  fake.send.mockResolvedValue({ ok: true, provider: "meta" });
  const response = await POST(request());
  expect(response.status).toBe(200); expect((await response.json()).confirmation.token).toBe("TOK-ORIGINAL");
  expect(fake.mirror).not.toHaveBeenCalled(); expect(fake.mark).toHaveBeenCalledWith("SYN-SUBMISSION");
});
it("does not re-send already accepted confirmation invitation", async () => {
  fake.ingest.mockResolvedValue({ token: "TOK-ORIGINAL", created: false, notification_sent: true, status: "awaiting" });
  expect((await POST(request())).status).toBe(200); expect(fake.send).not.toHaveBeenCalled();
});
it("does not reset or re-invite a resolved confirmation", async () => {
  fake.ingest.mockResolvedValue({ token: "TOK-ORIGINAL", created: false, notification_sent: false, status: "confirmed" });
  const response = await POST(request());
  expect((await response.json()).confirmation.status).toBe("confirmed"); expect(fake.send).not.toHaveBeenCalled();
});
it("retries a failed delivery marker instead of acknowledging success", async () => {
  fake.send.mockResolvedValue({ ok: true, provider: "meta" }); fake.mark.mockRejectedValue(new Error("synthetic"));
  expect((await POST(request())).status).toBe(503);
});
