// GET /api/confirmations — live operator view of the confirmation queue.
// Returns recent order_confirmations with status counts. Stale awaiting rows are
// expired (T+24) on read. The /confirmations console page polls this endpoint.
//
//   /api/confirmations            -> latest 100
//   /api/confirmations?status=awaiting&limit=50
//
// Optional protection: when WEBHOOK_SECRET is set, require x-webhook-secret.

import { NextRequest, NextResponse } from "next/server";
import { listConfirmations, usingMemory, ConfirmationStatus } from "@/lib/confirm/store";
import { checkWebhookSecret } from "@/lib/http/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ConfirmationStatus[] = ["awaiting", "confirmed", "declined", "edit_requested", "expired"];

export async function GET(req: NextRequest) {
  if (!checkWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") as ConfirmationStatus | null;
  const status = statusParam && VALID.includes(statusParam) ? statusParam : undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  let items;
  try {
    items = await listConfirmations({ status, limit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "query failed";
    console.error("[confirmations] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const counts: Record<string, number> = { awaiting: 0, confirmed: 0, declined: 0, edit_requested: 0, expired: 0 };
  // Counts reflect the returned window; for global counts query without a status filter.
  for (const it of items) counts[it.status] = (counts[it.status] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    storage: usingMemory() ? "memory" : "supabase",
    total: items.length,
    counts,
    items: items.map((it) => ({
      token: it.token,
      orderId: it.orderId,
      customerName: it.customerName,
      phone: it.phone,
      status: it.status,
      orderSummary: it.orderSummary,
      attempts: it.attempts,
      createdAt: it.createdAt,
      respondedAt: it.respondedAt,
    })),
  });
}
