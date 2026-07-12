// Server-side read helpers. Falls back to a substantial in-memory demo dataset
// when Supabase env is absent, so every page renders meaningful content
// immediately. When Supabase is configured, it queries live tables.
import { createClient, hasSupabaseEnv } from "./supabase/server";
import { buildDemoUniverse, getDemoTable } from "./demo/seed";

export interface FetchOpts {
  limit?: number;
  order?: string;
  /** Optional column filter — e.g. { stage: "hot_lead" }. Only used in demo mode. */
  where?: Record<string, string | number | boolean | null>;
}

export interface FetchResult {
  rows: Record<string, unknown>[];
  connected: boolean;
  demoMode: boolean;
  error?: string;
}

export async function fetchRows(table: string, opts: FetchOpts = {}): Promise<FetchResult> {
  if (!hasSupabaseEnv()) {
    let rows = getDemoTable(table);
    if (opts.where) {
      rows = rows.filter((r) =>
        Object.entries(opts.where!).every(([k, v]) => r[k] === v)
      );
    }
    if (opts.order) {
      const key = opts.order;
      rows = [...rows].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av < bv ? 1 : -1; // desc by default
      });
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return { rows, connected: false, demoMode: true };
  }
  try {
    const supabase = createClient();
    let q = supabase.from(table).select("*").limit(opts.limit ?? 100);
    if (opts.order) q = q.order(opts.order, { ascending: false });
    const { data, error } = await q;
    if (error) return { rows: [], connected: true, demoMode: false, error: error.message };
    return { rows: data ?? [], connected: true, demoMode: false };
  } catch (e) {
    return { rows: [], connected: true, demoMode: false, error: e instanceof Error ? e.message : "query failed" };
  }
}

export interface Kpis {
  totalLeads: number;
  newToday: number;
  priceInquiries: number;
  hotLeads: number;
  paymentLinksSent: number;
  paidOrders: number;
  deliveredOrders: number;
  lostLeads: number;
  complaints: number;
  leadToPayment: number; // %
  /** Live AED totals derived in demo mode for richer dashboards. */
  revenueAedToday: number;
  revenueAed7d: number;
  revenueAed30d: number;
  pendingPaymentAed: number;
  openDisputes: number;
}

const EMPTY_KPIS: Kpis = {
  totalLeads: 0, newToday: 0, priceInquiries: 0, hotLeads: 0,
  paymentLinksSent: 0, paidOrders: 0, deliveredOrders: 0, lostLeads: 0,
  complaints: 0, leadToPayment: 0,
  revenueAedToday: 0, revenueAed7d: 0, revenueAed30d: 0, pendingPaymentAed: 0, openDisputes: 0,
};

export async function fetchKpis(): Promise<{ kpis: Kpis; connected: boolean; demoMode: boolean }> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day7 = Date.now() - 7 * 86_400_000;
  const day30 = Date.now() - 30 * 86_400_000;

  if (!hasSupabaseEnv()) {
    const u = buildDemoUniverse();
    const c = u.conversations as Array<Record<string, unknown>>;
    const o = u.orders as Array<Record<string, unknown>>;
    const d = u.disputes as Array<Record<string, unknown>>;
    const paid = o.filter((x) => x.payment_status === "confirmed");
    const inWindow = (iso: unknown, from: number) =>
      typeof iso === "string" && new Date(iso).getTime() >= from;
    const sumTotal = (rows: Array<Record<string, unknown>>) =>
      rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const kpis: Kpis = {
      totalLeads: c.length,
      newToday: c.filter((x) => inWindow(x.created_at, today.getTime())).length,
      priceInquiries: c.filter((x) => x.stage === "price_lead").length,
      hotLeads: c.filter((x) => x.lead_temperature === "hot").length,
      paymentLinksSent: o.filter((x) => x.payment_status === "link_sent").length,
      paidOrders: paid.length,
      deliveredOrders: o.filter((x) => x.order_status === "delivered").length,
      lostLeads: c.filter((x) => x.stage === "lost_lead").length,
      complaints: o.filter((x) => x.order_status === "complaint").length,
      leadToPayment: c.length ? Math.round((paid.length / c.length) * 100) : 0,
      revenueAedToday: Math.round(sumTotal(paid.filter((x) => inWindow(x.created_at, today.getTime())))),
      revenueAed7d: Math.round(sumTotal(paid.filter((x) => inWindow(x.created_at, day7)))),
      revenueAed30d: Math.round(sumTotal(paid.filter((x) => inWindow(x.created_at, day30)))),
      pendingPaymentAed: Math.round(
        o.filter((x) => x.payment_status === "link_sent" || x.payment_status === "needs_verification")
          .reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
      ),
      openDisputes: d.filter((x) => x.status === "open" || x.status === "in_review").length,
    };
    return { kpis, connected: false, demoMode: true };
  }

  const supabase = createClient();
  const [convs, orders, disputes] = await Promise.all([
    supabase.from("conversations").select("stage,lead_temperature,intent,created_at"),
    supabase.from("orders").select("order_status,payment_status,total_amount,created_at"),
    supabase.from("disputes").select("status"),
  ]);
  const c = convs.data ?? [];
  const o = (orders.data ?? []) as Array<Record<string, unknown>>;
  const d = disputes.data ?? [];
  const paid = o.filter((x) => x.payment_status === "confirmed" || x.order_status === "paid");
  const sumTotal = (rows: Array<Record<string, unknown>>) =>
    rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const inWindow = (iso: unknown, from: number) =>
    typeof iso === "string" && new Date(iso).getTime() >= from;

  const kpis: Kpis = {
    ...EMPTY_KPIS,
    totalLeads: c.length,
    newToday: c.filter((x) => inWindow(x.created_at, today.getTime())).length,
    priceInquiries: c.filter((x) => x.stage === "price_lead").length,
    hotLeads: c.filter((x) => x.lead_temperature === "hot").length,
    paymentLinksSent: o.filter((x) => x.payment_status === "link_sent").length,
    paidOrders: paid.length,
    deliveredOrders: o.filter((x) => x.order_status === "delivered").length,
    lostLeads: c.filter((x) => x.stage === "lost_lead").length,
    complaints: o.filter((x) => x.order_status === "complaint").length,
    leadToPayment: c.length ? Math.round((paid.length / c.length) * 100) : 0,
    revenueAedToday: Math.round(sumTotal(paid.filter((x) => inWindow(x.created_at, today.getTime())))),
    revenueAed7d: Math.round(sumTotal(paid.filter((x) => inWindow(x.created_at, day7)))),
    revenueAed30d: Math.round(sumTotal(paid.filter((x) => inWindow(x.created_at, day30)))),
    pendingPaymentAed: Math.round(
      o.filter((x) => x.payment_status === "link_sent" || x.payment_status === "needs_verification")
        .reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
    ),
    openDisputes: d.filter((x) => x.status === "open" || x.status === "in_review").length,
  };
  return { kpis, connected: true, demoMode: false };
}

// ----------------------------- helpers for pages ----------------------------

export function formatAed(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(v);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-AE", { day: "2-digit", month: "short" });
}
