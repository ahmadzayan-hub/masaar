// WhatsApp order-confirmation copy + button payload helpers.
// The confirmation message shows the customer the EXACT number we messaged and
// the order summary, then asks them to tap a button. Tapping "Confirm" both
// proves the number is correct/reachable and authorizes order preparation.

import { CLOSING_LINE_AR, CLOSING_LINE_EN } from "@/lib/brand";

export type ConfirmAction = "confirm" | "edit" | "decline";

export interface ConfirmButton {
  id: string;
  title: string;
}

export function buttonId(action: ConfirmAction, token: string): string {
  return `${action}:${token}`;
}

export function parseButtonPayload(id: string): { action: ConfirmAction; token: string } | null {
  const m = /^(confirm|edit|decline):(.+)$/.exec(id || "");
  if (!m) return null;
  return { action: m[1] as ConfirmAction, token: m[2] };
}

export interface ConfirmationContext {
  token: string;
  customerName?: string | null;
  phone: string; // E.164 we messaged
  orderSummary?: string | null;
  // Single expected cash-collection total (order value + 25 delivery). Omit when
  // unknown — we never fabricate a cash figure (spec safety rule).
  totalAed?: number | null;
  // When true, the customer's Google Maps pin was missing/invalid — ask for a
  // live pin (spec fallback) instead of blocking.
  needsMapPin?: boolean;
}

// Programmatic Verification Handshake card. Deliberately a SINGLE total line (no
// multi-layer price breakdown), explicitly asks the customer to confirm their
// number takes delivery-driver voice calls, requests a live pin when missing,
// and closes with a reassuring line. Gulf-Arabic + elegant English.
export function buildConfirmationRequest(ctx: ConfirmationContext): {
  body: string;
  buttons: ConfirmButton[];
} {
  const name = (ctx.customerName || "").split(/\s+/)[0] || "";
  const summary = ctx.orderSummary && ctx.orderSummary.trim() ? ctx.orderSummary.trim() : "—";
  const totalAr = typeof ctx.totalAed === "number" ? `• الإجمالي عند الاستلام: ${ctx.totalAed} درهم (شامل التوصيل)\n` : "";
  const totalEn = typeof ctx.totalAed === "number" ? `• Total on delivery: ${ctx.totalAed} AED (delivery included)\n` : "";
  const pinAr = ctx.needsMapPin
    ? `• نحتاج رابط موقعك المباشر (Google Maps pin) لضمان وصول المندوب 📍\n`
    : "";
  const pinEn = ctx.needsMapPin
    ? `• Please drop your live Google Maps pin so the driver reaches you 📍\n`
    : "";

  const body =
    `🤍 يا هلا ومسهلا فيك في بيوند ستايل الإمارات\n` +
    `${name ? "حياك الله " + name + "! " : ""}قبل ما نجهّز طلبك للشحن، نبي تأكيدك:\n` +
    `• الطلب: ${summary}\n` +
    `• رقم التواصل/التوصيل: ${ctx.phone}\n` +
    totalAr +
    pinAr +
    `• تأكد أن رقمك جاهز لاستقبال مكالمات مندوب التوصيل الصوتية 📞\n` +
    `اضغط الزر المناسب تحت 👇\n\n` +
    `Beyond Style UAE — before we prepare your order, please confirm:\n` +
    `• Order: ${summary}\n` +
    `• Contact/delivery number: ${ctx.phone}\n` +
    totalEn +
    pinEn +
    `• Please confirm this number is ready to receive the delivery driver's voice calls 📞\n` +
    `Tap a button below 👇\n\n` +
    `${CLOSING_LINE_AR}\n${CLOSING_LINE_EN}`;

  const buttons: ConfirmButton[] = [
    { id: buttonId("confirm", ctx.token), title: "✅ تأكيد Confirm" },
    { id: buttonId("edit", ctx.token), title: "✏️ تعديل Edit" },
    { id: buttonId("decline", ctx.token), title: "❌ إلغاء Cancel" },
  ];
  return { body, buttons };
}

// Follow-up sent back after we record the customer's choice.
export function buildFollowUp(action: ConfirmAction, customerName?: string | null): string {
  const name = (customerName || "").split(/\s+/)[0] || "";
  switch (action) {
    case "confirm":
      return (
        `🤍 شكراً${name ? " " + name : ""}! تم تأكيد طلبك ✅ وجاري تجهيزه للشحن عبر هلال لوجستيك. ` +
        `رسوم التوصيل 25 درهم. سنوافيك بمواعيد التسليم.\n\n` +
        `Thank you${name ? " " + name : ""}! Your order is confirmed ✅ and is now being prepared ` +
        `for dispatch via Halan Logistics. Delivery fee 25 AED. We'll share the delivery time shortly.`
      );
    case "edit":
      return (
        `شكراً لك! يرجى إرسال البيانات الصحيحة (الرقم/العنوان/الطلب) وسنحدّثها قبل التجهيز.\n\n` +
        `Thanks! Please reply with the correct details (number / address / order) and we'll update them before preparing your order.`
      );
    case "decline":
      return (
        `تم إلغاء الطلب بناءً على طلبك. نتشرف بخدمتك في أي وقت 🤍\n\n` +
        `Your order has been cancelled as requested. We're here whenever you'd like to order again 🤍`
      );
  }
}

// Free-text reply fallback (we lead with buttons, but a customer may just type).
const YES_RE = /\b(yes|confirm|ok|okay|y)\b|نعم|تأكيد|اكد|أكد|تمام|موافق|اوكي|أوافق/i;
const NO_RE = /\b(no|cancel|stop)\b|لا|الغاء|إلغاء|الغ|كنسل|ارفض|أرفض/i;
const EDIT_RE = /\b(edit|change|wrong|correct)\b|تعديل|تغيير|غلط|خطأ|تصحيح|عدل/i;

export function classifyText(text: string): ConfirmAction | null {
  const t = (text || "").trim();
  if (!t) return null;
  // Order matters: an explicit edit/cancel intent should win over a stray "ok".
  if (EDIT_RE.test(t)) return "edit";
  if (NO_RE.test(t)) return "decline";
  if (YES_RE.test(t)) return "confirm";
  return null;
}
