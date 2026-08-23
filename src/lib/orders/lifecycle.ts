// Canonical order lifecycle — TypeScript mirror of supabase/migrations/0006_rbac_lifecycle.sql.
// The database (advance_order_status + orders_status_guard) is the enforcement
// authority; this module exists for UI state, demo mode, and validation before
// the round-trip.

export const ORDER_STATUSES = [
  "lead",
  "qualified",
  "confirmed",
  "paid",
  "design_approval",
  "production",
  "qc",
  "dispatched",
  "delivered",
  "after_sales",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const APP_ROLES = ["owner", "operator", "finance", "workshop", "readonly"] as const;
export type AppRole = (typeof APP_ROLES)[number];

// Mirrors the order_transitions reference table.
export const ORDER_TRANSITIONS: Record<string, { to: OrderStatus; roles: AppRole[] }[]> = {
  lead: [
    { to: "qualified", roles: ["owner", "operator"] },
    { to: "cancelled", roles: ["owner", "operator"] },
  ],
  qualified: [
    { to: "confirmed", roles: ["owner", "operator"] },
    { to: "cancelled", roles: ["owner", "operator"] },
  ],
  confirmed: [
    { to: "paid", roles: ["owner", "finance"] },
    { to: "cancelled", roles: ["owner", "operator"] },
  ],
  paid: [
    { to: "design_approval", roles: ["owner", "operator"] },
    { to: "cancelled", roles: ["owner"] },
  ],
  design_approval: [
    { to: "production", roles: ["owner", "operator", "workshop"] },
    { to: "cancelled", roles: ["owner"] },
  ],
  production: [
    { to: "qc", roles: ["owner", "workshop"] },
    { to: "cancelled", roles: ["owner"] },
  ],
  qc: [
    { to: "production", roles: ["owner", "workshop"] }, // rework
    { to: "dispatched", roles: ["owner", "operator", "workshop"] },
    { to: "cancelled", roles: ["owner"] },
  ],
  dispatched: [{ to: "delivered", roles: ["owner", "operator"] }],
  delivered: [{ to: "after_sales", roles: ["owner", "operator"] }],
  after_sales: [],
  cancelled: [],
};

// Legacy statuses still present in old rows / demo data / sheets exports.
const LEGACY_MAP: Record<string, OrderStatus> = {
  draft: "lead",
  awaiting_payment: "confirmed",
  complaint: "after_sales",
};

export function normalizeStatus(raw: string | null | undefined): OrderStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if ((ORDER_STATUSES as readonly string[]).includes(s)) return s as OrderStatus;
  return LEGACY_MAP[s] ?? "lead";
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).some((t) => t.to === to);
}

export function roleMayTransition(role: AppRole, from: OrderStatus, to: OrderStatus): boolean {
  const t = (ORDER_TRANSITIONS[from] ?? []).find((x) => x.to === to);
  return !!t && t.roles.includes(role);
}

export function nextStatusesFor(role: AppRole, from: OrderStatus): OrderStatus[] {
  return (ORDER_TRANSITIONS[from] ?? []).filter((t) => t.roles.includes(role)).map((t) => t.to);
}

// Domain event emitted when an order lands on a status (mirrors the RPC).
export function eventForTransition(to: OrderStatus): string | null {
  switch (to) {
    case "confirmed":
      return "customer.order_confirmed";
    case "paid":
      return "order.paid";
    case "dispatched":
      return "order.dispatched";
    case "delivered":
      return "order.delivered";
    case "after_sales":
      return "order.after_sales_opened";
    case "cancelled":
      return "order.cancelled";
    default:
      return null;
  }
}

export const STATUS_LABELS: Record<OrderStatus, { en: string; ar: string }> = {
  lead: { en: "Lead", ar: "عميل محتمل" },
  qualified: { en: "Qualified", ar: "مؤهل" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  paid: { en: "Paid", ar: "مدفوع" },
  design_approval: { en: "Design approval", ar: "اعتماد التصميم" },
  production: { en: "Production", ar: "تصنيع" },
  qc: { en: "QC", ar: "فحص الجودة" },
  dispatched: { en: "Dispatched", ar: "مع المندوب" },
  delivered: { en: "Delivered", ar: "تم التسليم" },
  after_sales: { en: "After-sales", ar: "ما بعد البيع" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};
