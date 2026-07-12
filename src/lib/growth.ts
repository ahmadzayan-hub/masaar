// Growth & operations engines (finalized build §2). Pure, testable logic:
//  - Inventory velocity / low-stock alerts
//  - VIP / repeat-buyer accelerator
//  - Trust engine (testimonial selection)
//  - Dispute / complaint protocol (order locking + resolution templates)
//  - Emirate-specific "expected delivery" buffers
//  - VAT-ready CSV export

// ---------- Inventory velocity ----------
export interface VelocityInput {
  quantityAvailable: number;
  // Average units sold per day (computed from order history or set manually).
  dailySalesRate: number;
  // Supplier lead time + a safety buffer, in days.
  reorderLeadDays?: number;
}

export type VelocityStatus = "ok" | "low" | "critical" | "out";

export interface VelocityResult {
  daysToStockout: number | null; // null when no sales velocity
  status: VelocityStatus;
  reorderSuggested: boolean;
  suggestedReorderQty: number;
  label: string;
}

export function computeVelocity(input: VelocityInput): VelocityResult {
  const lead = input.reorderLeadDays ?? 7;
  if (input.quantityAvailable <= 0) {
    return {
      daysToStockout: 0,
      status: "out",
      reorderSuggested: true,
      suggestedReorderQty: Math.max(1, Math.ceil(input.dailySalesRate * lead * 2)),
      label: "Out of stock — reorder now.",
    };
  }
  if (input.dailySalesRate <= 0) {
    return {
      daysToStockout: null,
      status: "ok",
      reorderSuggested: false,
      suggestedReorderQty: 0,
      label: "No recent sales velocity.",
    };
  }
  const days = Math.floor(input.quantityAvailable / input.dailySalesRate);
  let status: VelocityStatus = "ok";
  if (days <= Math.ceil(lead / 2)) status = "critical";
  else if (days <= lead * 2) status = "low";

  const reorderSuggested = status === "critical" || status === "low";
  // Reorder enough to cover the lead time plus one sales cycle.
  const suggestedReorderQty = reorderSuggested
    ? Math.ceil(input.dailySalesRate * lead * 2)
    : 0;

  return {
    daysToStockout: days,
    status,
    reorderSuggested,
    suggestedReorderQty,
    label:
      status === "ok"
        ? `~${days} days of stock left.`
        : `Out of stock in ~${days} days — reorder ${suggestedReorderQty} units.`,
  };
}

// ---------- VIP / repeat accelerator ----------
export type VipTier = "new" | "repeat" | "vip";

export interface VipResult {
  isVip: boolean;
  tier: VipTier;
  // Soft loyalty mention the AI may weave into a draft (never a hard promise).
  loyaltyMention: { en: string; ar: string } | null;
}

// 3rd-time (and beyond) buyers become VIP.
export function evaluateVip(purchaseCount: number): VipResult {
  if (purchaseCount >= 3) {
    return {
      isVip: true,
      tier: "vip",
      loyaltyMention: {
        en: "As a valued repeat customer, we've added a small thank-you with your order 🤍",
        ar: "كونك من عملائنا الدائمين، أضفنا لمسة شكر بسيطة مع طلبك 🤍",
      },
    };
  }
  if (purchaseCount === 2) {
    return {
      isVip: false,
      tier: "repeat",
      loyaltyMention: {
        en: "Lovely to have you back 🤍",
        ar: "سعداء بعودتك 🤍",
      },
    };
  }
  return { isVip: false, tier: "new", loyaltyMention: null };
}

// ---------- Trust engine ----------
export interface ReviewLike {
  id: string;
  order_id: string | null;
  rating: number | null;
  feedback: string | null;
  permission_to_share: boolean | null;
}

// Only verified (order-linked), high-rated, share-permitted reviews are eligible.
export function selectTestimonials(reviews: ReviewLike[], limit = 5): ReviewLike[] {
  return reviews
    .filter(
      (r) =>
        r.permission_to_share === true &&
        !!r.order_id &&
        (r.rating ?? 0) >= 4 &&
        !!r.feedback?.trim()
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, limit);
}

// ---------- Dispute / complaint protocol ----------
export type DisputeReason =
  | "damaged"
  | "wrong_item"
  | "delivery_delay"
  | "payment_issue"
  | "custom_dispute"
  | "material_claim"
  | "courier_failure"
  | "refund_request";

export type DisputeStatus = "open" | "in_review" | "resolved" | "rejected";

export interface DisputeLike {
  status: DisputeStatus;
}

// An order with any open/in-review dispute is LOCKED — no auto dispatch, no
// auto reply on that order. Resolution is manual (human-approved) only.
export function isOrderLocked(disputes: DisputeLike[]): boolean {
  return disputes.some((d) => d.status === "open" || d.status === "in_review");
}

// Standard resolution templates (bilingual). Never admit liability before review.
export const RESOLUTION_TEMPLATES: Record<DisputeReason, { en: string; ar: string }> = {
  damaged: {
    en: "We're sorry to hear this 🤍 Could you please share clear photos of the item so our team can review it right away?",
    ar: "نعتذر لسماع ذلك 🤍 ممكن ترسلين صور واضحة للقطعة حتى يراجعها فريقنا فوراً؟",
  },
  wrong_item: {
    en: "Apologies for the mix-up 🤍 Please share a photo of what you received so we can check and make it right.",
    ar: "نعتذر عن الخطأ 🤍 ممكن صورة لما استلمتيه حتى نتحقق ونصحح الوضع.",
  },
  delivery_delay: {
    en: "Thank you for your patience 🤍 We're checking with the courier now and will update you shortly.",
    ar: "شاكرين سعة صدرك 🤍 نتواصل مع شركة التوصيل الآن ونحدثك قريباً.",
  },
  payment_issue: {
    en: "Let's sort this out 🤍 Could you share the payment reference so we can verify it?",
    ar: "بنحل الموضوع 🤍 ممكن مرجع الدفع حتى نتأكد منه؟",
  },
  custom_dispute: {
    en: "We want you to be happy with your custom piece 🤍 Let us review the original request together.",
    ar: "يهمنا رضاك عن التصميم الخاص 🤍 خلينا نراجع الطلب الأصلي سوا.",
  },
  material_claim: {
    en: "Our pieces are fashion accessories (gold/silver-tone, plated). We'll review your concern and respond.",
    ar: "قطعنا إكسسوارات أزياء (طلاء ذهبي/فضي). راح نراجع ملاحظتك ونرد عليك.",
  },
  courier_failure: {
    en: "Sorry for the courier issue 🤍 We're escalating with them and will arrange a solution.",
    ar: "نعتذر عن مشكلة التوصيل 🤍 نصعّد معهم ونرتب حل مناسب.",
  },
  refund_request: {
    en: "We've noted your request 🤍 Refunds/exchanges are reviewed individually — our team will get back to you.",
    ar: "سجلنا طلبك 🤍 الاسترجاع/الاستبدال يُراجع حالة بحالة — فريقنا راح يتواصل معك.",
  },
};

// ---------- Emirate-specific expected-delivery buffers ----------
// Configurable defaults; courier confirmation still required outside Dubai.
export const EMIRATE_BUFFERS: Record<string, { minDays: number; maxDays: number }> = {
  dubai: { minDays: 0, maxDays: 1 },
  sharjah: { minDays: 1, maxDays: 2 },
  ajman: { minDays: 1, maxDays: 2 },
  "umm al quwain": { minDays: 2, maxDays: 3 },
  "ras al khaimah": { minDays: 2, maxDays: 3 },
  fujairah: { minDays: 2, maxDays: 3 },
  "abu dhabi": { minDays: 1, maxDays: 2 },
  "al ain": { minDays: 2, maxDays: 3 },
};

export function expectedDeliveryWindow(
  emirate: string | null | undefined,
  from: Date = new Date()
): { from: Date; to: Date; label: string; requiresCourierConfirm: boolean } {
  const key = (emirate ?? "").trim().toLowerCase();
  const buffer = EMIRATE_BUFFERS[key] ?? { minDays: 2, maxDays: 4 };
  const start = addDays(from, buffer.minDays);
  const end = addDays(from, buffer.maxDays);
  const requiresCourierConfirm = key !== "dubai";
  const suffix = requiresCourierConfirm ? " (subject to courier confirmation)" : "";
  return {
    from: start,
    to: end,
    label: `Expected delivery ${fmt(start)}–${fmt(end)}${suffix}`,
    requiresCourierConfirm,
  };
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------- VAT-ready CSV export (Monthly Tax Report) ----------
export interface OrderForTax {
  id: string;
  created_at: string;
  product_summary?: string | null;
  product_price?: number | null;
  delivery_cost?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
}

export function buildVatCsv(orders: OrderForTax[]): string {
  const header = [
    "order_id",
    "date",
    "description",
    "net_amount_aed",
    "vat_amount_aed",
    "total_amount_aed",
    "payment_status",
  ];
  const rows = orders.map((o) => {
    const net = (o.product_price ?? 0) + (o.delivery_cost ?? 0);
    return [
      o.id,
      (o.created_at ?? "").slice(0, 10),
      csvField(o.product_summary ?? ""),
      net.toFixed(2),
      (o.vat_amount ?? 0).toFixed(2),
      (o.total_amount ?? net).toFixed(2),
      o.payment_status ?? "",
    ].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

function csvField(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
