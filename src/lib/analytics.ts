// Pure read-side aggregations used by the dashboard + reports pages.
// Works on the demo universe by default; pages that fetch from Supabase pass in
// rows of the same shape.

const DAY = 86_400_000;

type Order = Record<string, unknown> & {
  created_at: string;
  total_amount?: number;
  product_name?: string;
  product_category?: string;
  order_status?: string;
  payment_status?: string;
  delivery_area?: string;
};
type Conversation = Record<string, unknown> & {
  created_at: string;
  stage?: string;
  lead_temperature?: string;
  platform?: string;
};

function dayKey(iso: string) { return iso.slice(0, 10); }
function shortDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AE", { day: "2-digit", month: "short" });
}

export function revenueByDay(orders: Order[], days = 14) {
  const cutoff = Date.now() - (days - 1) * DAY;
  const out = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    out.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of orders) {
    if (o.payment_status !== "confirmed") continue;
    const t = new Date(o.created_at).getTime();
    if (t < cutoff) continue;
    const k = dayKey(o.created_at);
    if (!out.has(k)) continue;
    out.set(k, (out.get(k) ?? 0) + (Number(o.total_amount) || 0));
  }
  return Array.from(out.entries()).map(([d, aed]) => ({
    day: shortDay(d), aed: Math.round(aed),
  }));
}

export function ordersByDay(orders: Order[], days = 14) {
  const out = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    out.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of orders) {
    const k = dayKey(o.created_at);
    if (out.has(k)) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return Array.from(out.entries()).map(([d, orders]) => ({ day: shortDay(d), orders }));
}

export function stackedStatusByDay(orders: Order[], days = 14) {
  const init = new Map<string, { paid: number; pending: number; complaints: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    init.set(d.toISOString().slice(0, 10), { paid: 0, pending: 0, complaints: 0 });
  }
  for (const o of orders) {
    const k = dayKey(o.created_at);
    const cell = init.get(k);
    if (!cell) continue;
    if (o.order_status === "complaint") cell.complaints += 1;
    else if (o.payment_status === "confirmed") cell.paid += 1;
    else if (o.payment_status === "link_sent" || o.payment_status === "needs_verification") cell.pending += 1;
  }
  return Array.from(init.entries()).map(([d, v]) => ({ day: shortDay(d), ...v }));
}

export function conversionFunnel(conversations: Conversation[], orders: Order[]) {
  const total = conversations.length;
  const price = conversations.filter((c) => c.stage === "price_lead").length;
  const warm = conversations.filter((c) => c.stage === "warm_lead").length;
  const hot = conversations.filter((c) => c.stage === "hot_lead" || c.lead_temperature === "hot").length;
  const paid = orders.filter((o) => o.payment_status === "confirmed").length;
  const delivered = orders.filter((o) => o.order_status === "delivered").length;
  return [
    { stage: "All leads", value: total },
    { stage: "Asked price", value: price + warm + hot },
    { stage: "Hot lead", value: hot + paid },
    { stage: "Paid", value: paid },
    { stage: "Delivered", value: delivered },
  ];
}

export function topProducts(orders: Order[], n = 6) {
  const tally = new Map<string, number>();
  for (const o of orders) {
    if (o.payment_status !== "confirmed") continue;
    const name = (o.product_name as string) ?? "(unknown)";
    tally.set(name, (tally.get(name) ?? 0) + (Number(o.quantity) || 1));
  }
  return Array.from(tally.entries())
    .map(([name, orders]) => ({ name, orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, n);
}

export function platformMix(conversations: Conversation[]) {
  const tally = new Map<string, number>();
  for (const c of conversations) {
    const p = (c.platform as string) ?? "other";
    tally.set(p, (tally.get(p) ?? 0) + 1);
  }
  return Array.from(tally.entries()).map(([name, value]) => ({ name, value }));
}

export function emirateMix(orders: Order[]) {
  const tally = new Map<string, number>();
  for (const o of orders) {
    if (o.payment_status !== "confirmed") continue;
    const k = (o.delivery_area as string) ?? "(unknown)";
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export interface AttentionItem {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
}

export function buildAttentionQueue(args: {
  orders: Order[];
  payments: Array<Record<string, unknown>>;
  disputes: Array<Record<string, unknown>>;
  inventory: Array<Record<string, unknown>>;
  conversations: Conversation[];
}): AttentionItem[] {
  const out: AttentionItem[] = [];
  // 1. Open disputes block dispatch.
  for (const d of args.disputes) {
    if (d.status === "open" || d.status === "in_review") {
      out.push({
        id: `dispute-${d.id}`,
        severity: "high",
        title: `Dispute: ${(d.reason as string).replace(/_/g, " ")}`,
        detail: `${d.customer_name} — order ${d.order_id}`,
        href: `/payments`,
      });
    }
  }
  // 2. Pending payment verifications.
  for (const p of args.payments) {
    if (p.status === "needs_verification") {
      out.push({
        id: `pay-${p.id}`,
        severity: "high",
        title: `Verify payment — AED ${p.amount_expected}`,
        detail: `${p.customer_name} · ref ${p.reference}`,
        href: `/payments`,
      });
    }
  }
  // 3. Orders in QC.
  for (const o of args.orders) {
    if (o.order_status === "qc") {
      out.push({
        id: `qc-${o.id}`,
        severity: "medium",
        title: `Run QC — ${o.product_summary}`,
        detail: `${o.customer_name} · ${o.delivery_area}`,
        href: `/orders`,
      });
    }
  }
  // 4. Hot leads with no payment yet.
  for (const c of args.conversations) {
    if (c.stage === "hot_lead") {
      out.push({
        id: `hot-${c.id}`,
        severity: "medium",
        title: `Hot lead — draft reply`,
        detail: `${(c as Record<string, unknown>).customer_name} on ${c.platform}`,
        href: `/inbox`,
      });
    }
  }
  // 5. Low / critical inventory.
  for (const inv of args.inventory) {
    const qty = Number(inv.quantity_available) || 0;
    const daily = Number(inv.daily_sales_rate) || 0;
    if (qty === 0) {
      out.push({
        id: `stock-out-${inv.id}`,
        severity: "high",
        title: `Out of stock — ${inv.product_name} (${inv.colour})`,
        detail: `Reorder via ${inv.supplier_source ?? "supplier"}`,
        href: `/inventory`,
      });
    } else if (daily > 0 && qty / daily <= 4) {
      out.push({
        id: `stock-low-${inv.id}`,
        severity: "medium",
        title: `Low stock — ${inv.product_name} (${inv.colour})`,
        detail: `~${Math.floor(qty / daily)} days left at current velocity`,
        href: `/inventory`,
      });
    }
  }
  return out
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1))
    .slice(0, 8);
}
