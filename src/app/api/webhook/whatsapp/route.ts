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
import { getByToken, getLatestAwaitingByPhone, getReplyReceipt, wasProcessed, markProcessed } from "@/lib/confirm/store";
import { sendWhatsApp } from "@/lib/notify/provider";
import { applyConfirmationReply, mirrorOrderStatus } from "@/lib/orders/sink";

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
  let retryRequired = false;
  const results: Array<{
    from: string;
    action: ConfirmAction | null;
    status: string;
    persisted?: { supabase: string; sheets: string; coreOrder?: string };
  }> = [];

  for (const msg of messages) {
   try {
    if (!msg.messageId) throw new Error("message id required");
    // Idempotency: Meta redelivers on retry — skip ids we already handled.
    if (msg.messageId && (await wasProcessed(msg.messageId))) {
      results.push({ from: msg.from, action: null, status: "duplicate (already processed)" });
      continue;
    }

    // Resolve the action + the target confirmation.
    let action: ConfirmAction | null = null;
    let record = null;

    const receipt = await getReplyReceipt(msg.messageId);
    if (receipt) {
      action = receipt.action;
      record = await getByToken(receipt.token);
    }
    if (!receipt && msg.buttonId) {
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
      retryRequired = true;
      results.push({ from: msg.from, action, status: "no matching open confirmation" });
      continue;
    }
    if (record.phone !== `+${msg.from.replace(/^\+/, "")}`) {
      throw new Error("sender mismatch");
    }
    if (record.status !== "awaiting" && !receipt) {
      if (msg.messageId) await markProcessed(msg.messageId);
      results.push({ from: msg.from, action, status: `already ${record.status}` });
      continue;
    }

    // The RPC atomically commits confirmation, intake, core order and durable
    // event-to-token receipt. A failed promotion leaves the confirmation awaiting.
    const core = await applyConfirmationReply(record.token, msg.messageId, action, record.phone, { msg });
    if (!core.ok || !core.persisted) throw new Error("confirmation persistence failed");

    const sheets = await mirrorOrderStatus(record.token, action);
    // An explicitly unconfigured mirror is visible, not a durable write. A
    // configured mirror failure must be retried rather than silently acknowledged.
    if (!sheets.ok) throw new Error("sheet mirror failed");
    const notification = await sendWhatsApp(record.phone, buildFollowUp(action, record.customerName));
    if (!notification.ok || notification.provider === "mock") throw new Error("notification not sent");
    await markProcessed(msg.messageId);
    results.push({
      from: msg.from, action, status: ACTION_TO_STATUS[action],
      persisted: { supabase: core.provider, sheets: sheets.provider,
        ...(core.orderId ? { coreOrder: `linked ${core.orderId}` } : {}),
      },
    });
   } catch (err) {
     // Retry the batch; committed successful messages are skipped by their ids.
     // Never return database/provider details or acknowledge a dropped transition.
     retryRequired = true;
     console.error("[whatsapp] message processing failed");
     results.push({ from: msg.from, action: null, status: "retry required" });
   }
  }

  return NextResponse.json({ ok: !retryRequired, handled: results }, { status: retryRequired ? 503 : 200 });
}
