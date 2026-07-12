// GET  /api/confirmations/[token] — poll a single confirmation's status.
// POST /api/confirmations/[token] { action: "resend" } — re-send the WhatsApp
//      confirmation request (policy: max 3 contact attempts) for an order still
//      awaiting a reply. Used by the operator console and by reminder automation.

import { NextRequest, NextResponse } from "next/server";
import { getByToken, incrementAttempt } from "@/lib/confirm/store";
import { sendWhatsAppButtons } from "@/lib/notify/provider";
import { buildConfirmationRequest } from "@/lib/confirm/messages";
import { checkWebhookSecret as authed } from "@/lib/http/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = Number(process.env.CONFIRMATION_MAX_ATTEMPTS || 3);

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const rec = await getByToken(params.token);
    if (!rec) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      token: rec.token,
      orderId: rec.orderId,
      status: rec.status,
      attempts: rec.attempts,
      respondedAt: rec.respondedAt,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "query failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — default to resend */
  }
  const action = body.action || "resend";
  if (action !== "resend") {
    return NextResponse.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  }

  try {
    const rec = await getByToken(params.token);
    if (!rec) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (rec.status !== "awaiting") {
      return NextResponse.json({ ok: false, error: `cannot resend — order is ${rec.status}` }, { status: 409 });
    }
    if ((rec.attempts ?? 1) >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { ok: false, error: `max ${MAX_ATTEMPTS} contact attempts reached`, attempts: rec.attempts },
        { status: 429 }
      );
    }

    const { body: text, buttons } = buildConfirmationRequest({
      token: rec.token,
      customerName: rec.customerName,
      phone: rec.phone,
      orderSummary: rec.orderSummary,
    });
    const send = await sendWhatsAppButtons(rec.phone, text, buttons);
    const updated = await incrementAttempt(rec.token);

    return NextResponse.json({ ok: send.ok, attempts: updated?.attempts, notification: send });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "resend failed" }, { status: 500 });
  }
}
