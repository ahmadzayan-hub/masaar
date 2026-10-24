import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  processed: new Set<string>(), receipt: null as any, status: "awaiting", orders: 0,
  rpcFails: false, notifyFails: false, markFails: false,
  apply: vi.fn(), notify: vi.fn(), mirror: vi.fn(),
}));
vi.mock("../src/lib/confirm/inbound", () => ({ verifySignature: () => true,
  parseInbound: (body: any) => body.messages }));
const record = () => ({ token: "TOK-SYN", phone: "+971500000001", customerName: "SYNTHETIC", status: state.status });
vi.mock("../src/lib/confirm/store", () => ({
  wasProcessed: async (id: string) => state.processed.has(id),
  getReplyReceipt: async () => state.receipt,
  getByToken: async () => record(),
  getLatestAwaitingByPhone: async () => state.status === "awaiting" ? record() : null,
  markProcessed: async (id: string) => { if (state.markFails) throw new Error("synthetic storage failure"); state.processed.add(id); },
}));
vi.mock("../src/lib/orders/sink", () => ({ applyConfirmationReply: state.apply, mirrorOrderStatus: state.mirror }));
vi.mock("../src/lib/notify/provider", () => ({ sendWhatsApp: state.notify }));
import { POST } from "../src/app/api/webhook/whatsapp/route";
const request = (from = "971500000001") => new NextRequest("http://localhost/api/webhook/whatsapp", {
  method: "POST", body: JSON.stringify({ messages: [{ messageId: "SYN-EVENT", from, type: "text", text: "YES" }] }),
});
beforeEach(() => {
  vi.clearAllMocks(); state.processed.clear(); state.receipt = null; state.status = "awaiting"; state.orders = 0;
  state.rpcFails = false; state.notifyFails = false; state.markFails = false;
  state.apply.mockImplementation(async () => {
    if (state.rpcFails) return { ok: false, persisted: false };
    if (!state.receipt) { state.orders++; state.receipt = { token: "TOK-SYN", action: "confirm" }; }
    state.status = "confirmed";
    return { ok: true, persisted: true, provider: "supabase", orderId: "SYN-ORDER" };
  });
  state.mirror.mockResolvedValue({ ok: true, provider: "mock" });
  state.notify.mockImplementation(async () => ({ ok: !state.notifyFails, provider: "meta" }));
});
describe("durable confirmation retry orchestration (isolated database/provider fakes)", () => {
  it("returns 503 on transient RPC failure without notification or processed marker; retry succeeds once", async () => {
    state.rpcFails = true;
    expect((await POST(request())).status).toBe(503);
    expect(state.notify).not.toHaveBeenCalled(); expect(state.mirror).not.toHaveBeenCalled();
    expect(state.status).toBe("awaiting"); expect(state.processed.size).toBe(0);
    state.rpcFails = false;
    expect((await POST(request())).status).toBe(200); expect(state.orders).toBe(1);
    expect((await POST(request())).status).toBe(200); expect(state.orders).toBe(1);
    expect(state.notify).toHaveBeenCalledTimes(1);
  });
  it("resolves committed free-text replies from a durable receipt after a simulated process restart", async () => {
    state.notifyFails = true;
    expect((await POST(request())).status).toBe(503);
    expect(state.status).toBe("confirmed"); expect(state.orders).toBe(1); expect(state.processed.size).toBe(0);
    // Only persisted fake database state remains; route has no in-memory retry map.
    vi.resetModules(); state.notifyFails = false;
    const restarted = await import("../src/app/api/webhook/whatsapp/route");
    expect((await restarted.POST(request())).status).toBe(200); expect(state.orders).toBe(1);
  });
  it("does not acknowledge a failed processed-event write", async () => {
    state.markFails = true;
    expect((await POST(request())).status).toBe(503); expect(state.processed.size).toBe(0);
    state.markFails = false;
    expect((await POST(request())).status).toBe(200); expect(state.orders).toBe(1);
  });
  it("does not treat mock notifications as delivered", async () => {
    state.notify.mockResolvedValue({ ok: true, provider: "mock" });
    expect((await POST(request())).status).toBe(503); expect(state.processed.size).toBe(0);
  });
  it("rejects another sender without a transition", async () => {
    expect((await POST(request("971500000002"))).status).toBe(503);
    expect(state.apply).not.toHaveBeenCalled(); expect(state.notify).not.toHaveBeenCalled();
  });
});
