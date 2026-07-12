// Parse + verify inbound WhatsApp Cloud API webhook payloads.

import { createHmac, timingSafeEqual } from "crypto";

export interface InboundMessage {
  from: string; // sender phone (digits, no +)
  type: string; // "interactive" | "text" | ...
  buttonId?: string; // interactive.button_reply.id
  buttonTitle?: string;
  text?: string; // text.body
  messageId?: string;
}

// Meta posts: entry[].changes[].value.messages[]
export function parseInbound(body: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const messages = change?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg: InboundMessage = { from: m.from, type: m.type, messageId: m.id };
        if (m.type === "interactive") {
          const br = m.interactive?.button_reply;
          const lr = m.interactive?.list_reply;
          msg.buttonId = br?.id ?? lr?.id;
          msg.buttonTitle = br?.title ?? lr?.title;
        } else if (m.type === "button") {
          // Template quick-reply button.
          msg.buttonId = m.button?.payload;
          msg.buttonTitle = m.button?.text;
        } else if (m.type === "text") {
          msg.text = m.text?.body;
        }
        out.push(msg);
      }
    }
  }
  return out;
}

// Verify Meta's X-Hub-Signature-256 header (sha256=...) against the raw body.
// When WHATSAPP_APP_SECRET is unset we return true (dev/mock) but the route logs it.
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured — allow (dev/mock)
  if (!signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
