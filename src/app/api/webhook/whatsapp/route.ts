// WhatsApp Cloud API webhook (inbound).
//
// GET  — Meta verification handshake (hub.mode/hub.verify_token/hub.challenge).
// POST — receives the customer's reply to the confirmation request:
//          • interactive button tap (Confirm / Edit / Cancel), or
//          • a free-text reply (نعم / YES / لا / تعديل …) as a fallback.
//        We match it to the open confirmation, update its status, and reply with
//        the appropriate follow-up. A "confirm" releases the order to preparation.
//
// Configure the same URL + WHATSAPP_VERIFY_TOKEN in Meta → WhatsApp → Configuration.
// Set WHATSAPP_APP_SECRET to enforce X-Hub-Signature-256 verification.

import { NextRequest, NextResponse } from "next/server";
import { parseInbound, verifySignature } from "@/lib/confirm/inbound";
import {
  parseButtonPayload,
  classifyText,
  buildFollowUp,
  ConfirmAction,
} from "@/lib/confirm/messages";
import { getByToken, getLatestAwaitingByPhone, updateStatus, wasProcessed, markProcessed } from "@/lib/confirm/store";
import { sendWhatsApp } from "@/lib/notify/provider";
import { updateOrderStatus, statusForAction } from "@/lib/orders/sink";

export const runtime = "nodejs";

const ACTION_TO_STATUS: Record<ConfirmAction, "confirmed" | "edit_requested" | "declined"> = {
  confirm: "confirmed",
  edit: "edit_requested",
  decline: "declined",
};

// ---- GET: Meta verification handshake ----
export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "verification failed" }, { status: 403 });
}

// ---- POST: inbound messages ----
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const messages = parseInbound(body);
  const results: Array<{
    from: string;
    action: ConfirmAction | null;
    status: string;
    persisted?: { supabase: string; sheets: string };
  }> = [];

  for (const msg of messages) {
   try {
    // Idempotency: Meta redelivers on retry — skip ids we already handled.
    if (msg.messageId && (await wasProcessed(msg.messageId))) {
      results.push({ from: msg.from, action: null, status: "duplicate (already processed)" });
      continue;
    }

    // Resolve the action + the target confirmation.
    let action: ConfirmAction | null = null;
    let record = null;

    if (msg.buttonId) {
      const parsed = parseButtonPayload(msg.buttonId);
      if (parsed) {
        action = parsed.action;
        record = await getByToken(parsed.token);
      }
    }
    if (!action && msg.text) {
      action = classifyText(msg.text);
      if (action && msg.from) {
        record = await getLatestAwaitingByPhone(`+${msg.from.replace(/^\+/, "")}`);
      }
    }

    if (!action) {
      if (msg.messageId) await markProcessed(msg.messageId);
      results.push({ from: msg.from, action: null, status: "ignored (no actionable intent)" });
      continue;
    }
    if (!record) {
      // Do NOT mark processed — the matching confirmation may arrive moments
      // later, so a Meta retry should get another chance to match.
      results.push({ from: msg.from, action, status: "no matching open confirmation" });
      continue;
    }
    if (record.status !== "awaiting") {
      if (msg.messageId) await markProcessed(msg.messageId);
      results.push({ from: msg.from, action, status: `already ${record.status}` });
      continue;
    }

    const updated = await updateStatus(record.token, ACTION_TO_STATUS[action], { msg });
    // Mirror the lifecycle to the durable order record + Google Sheet. A confirm
    // sets Order Status = "Confirmed - In Preparation" (released to fulfillment).
    const persisted = await updateOrderStatus(record.token, statusForAction(action));
    await sendWhatsApp(record.phone, buildFollowUp(action, record.customerName));
    if (msg.messageId) await markProcessed(msg.messageId);

    results.push({
      from: msg.from,
      action,
      status: updated ? updated.status : "update failed",
      persisted: { supabase: persisted.supabase.provider, sheets: persisted.sheets.provider },
    });
    // action === "confirm" -> order released to preparation (status "confirmed").
   } catch (err) {
     // One bad message must not fail the whole batch (or trigger Meta retries).
     const message = err instanceof Error ? err.message : "processing failed";
     console.error("[whatsapp] message error:", message);
     results.push({ from: msg.from, action: null, status: `error: ${message}` });
   }
  }

  // Always 200 so Meta does not retry once we've accepted the event.
  return NextResponse.json({ ok: true, handled: results });
}
