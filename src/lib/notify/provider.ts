// Customer notification wrapper — WhatsApp + Email. Same philosophy as the AI
// provider wrapper (src/lib/ai/provider.ts): NO keys are hard-coded, everything
// is env-driven, and a "mock" fallback runs when nothing is configured so the
// webhook works end-to-end on a fresh checkout (and in tests).

import { env } from "@/lib/env";

export interface SendResult {
  channel: "whatsapp" | "email";
  ok: boolean;
  provider: string;
  to: string;
  // Provider message id when available, or a short status note.
  detail?: string;
  error?: string;
}

// ---- WhatsApp (Meta Cloud API) ----------------------------------------------
// Provider chosen via WHATSAPP_PROVIDER: "meta" | "mock". Defaults to "mock"
// unless a Meta token + phone-number id are present.

function useMetaWhatsApp(): { token?: string; phoneId?: string; on: boolean } {
  const provider = (env("WHATSAPP_PROVIDER") || "").toLowerCase();
  const token = env("WHATSAPP_TOKEN");
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  return { token, phoneId, on: provider === "meta" || (!provider && !!token && !!phoneId) };
}

// Single place that talks to the Meta Graph API; both text and interactive
// sends build a `message` object and hand it here.
async function postToMeta(to: string, message: Record<string, unknown>): Promise<SendResult> {
  const { token, phoneId } = useMetaWhatsApp();
  if (!token || !phoneId) {
    return { channel: "whatsapp", ok: false, provider: "meta", to, error: "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set" };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), ...message }),
    });
    if (!res.ok) {
      return { channel: "whatsapp", ok: false, provider: "meta", to, error: `Meta error ${res.status}: ${await res.text()}` };
    }
    const data = await res.json();
    return { channel: "whatsapp", ok: true, provider: "meta", to, detail: data.messages?.[0]?.id };
  } catch (e) {
    return { channel: "whatsapp", ok: false, provider: "meta", to, error: e instanceof Error ? e.message : "request failed" };
  }
}

export async function sendWhatsApp(to: string, text: string): Promise<SendResult> {
  if (useMetaWhatsApp().on) {
    return postToMeta(to, { type: "text", text: { body: text } });
  }
  // Mock — log and succeed so the pipeline is observable without credentials.
  console.log(`[notify:mock:whatsapp] -> ${to}\n${text}\n`);
  return { channel: "whatsapp", ok: true, provider: "mock", to, detail: "logged (configure WHATSAPP_PROVIDER=meta to send live)" };
}

// Interactive reply buttons (max 3, WhatsApp limit). Each button carries an `id`
// (payload) we read back on the inbound webhook to match the confirmation.
export interface WaButton {
  id: string;
  title: string; // <= 20 chars per WhatsApp
}

export async function sendWhatsAppButtons(to: string, bodyText: string, buttons: WaButton[]): Promise<SendResult> {
  if (useMetaWhatsApp().on) {
    return postToMeta(to, {
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }
  const btns = buttons.map((b) => `[${b.title}]`).join(" ");
  console.log(`[notify:mock:whatsapp:buttons] -> ${to}\n${bodyText}\n${btns}\n`);
  return { channel: "whatsapp", ok: true, provider: "mock", to, detail: `logged buttons: ${buttons.map((b) => b.id).join(",")}` };
}

// ---- Email (Resend) ----------------------------------------------------------
// Provider chosen via EMAIL_PROVIDER: "resend" | "mock". Defaults to "mock"
// unless a RESEND_API_KEY is present.

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const provider = (env("EMAIL_PROVIDER") || "").toLowerCase();
  const key = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM") || "Beyond Style UAE <orders@beyondstyle.ae>";
  const useResend = provider === "resend" || (!provider && !!key);

  if (useResend) {
    if (!key) {
      return { channel: "email", ok: false, provider: "resend", to, error: "RESEND_API_KEY not set" };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      if (!res.ok) {
        return { channel: "email", ok: false, provider: "resend", to, error: `Resend error ${res.status}: ${await res.text()}` };
      }
      const data = await res.json();
      return { channel: "email", ok: true, provider: "resend", to, detail: data.id };
    } catch (e) {
      return { channel: "email", ok: false, provider: "resend", to, error: e instanceof Error ? e.message : "request failed" };
    }
  }

  console.log(`[notify:mock:email] -> ${to} | ${subject}\n${text}\n`);
  return { channel: "email", ok: true, provider: "mock", to, detail: "logged (configure EMAIL_PROVIDER=resend to send live)" };
}
