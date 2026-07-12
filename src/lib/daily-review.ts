// Pure aggregations + a deterministic bilingual narrative for the daily review.
// Used by the Reports page (server-rendered) and by /api/daily-review when the
// owner wants an AI-polished narrative.

const DAY = 86_400_000;

type Order = Record<string, unknown> & { created_at: string };
type Conv = Record<string, unknown> & { created_at: string };

export interface DailyMetrics {
  todayOrders: number;
  todayPaidAed: number;
  todayPendingAed: number;
  todayConversations: number;
  todayHotLeads: number;
  todayLost: number;
  todayComplaints: number;
  topProduct: string | null;
  topEmirate: string | null;
  avgOrderAed: number;
  conversionPercent: number;
}

function isToday(iso: string): boolean {
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
}

function topByKey<T extends string>(rows: Array<Record<string, unknown>>, key: string): T | null {
  const tally = new Map<string, number>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v !== "string") continue;
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  let bestK: string | null = null; let bestN = 0;
  for (const [k, n] of tally) if (n > bestN) { bestK = k; bestN = n; }
  return bestK as T | null;
}

export function computeDailyMetrics(orders: Order[], conversations: Conv[]): DailyMetrics {
  const today = orders.filter((o) => isToday(o.created_at));
  const paidToday = today.filter((o) => o.payment_status === "confirmed");
  const pendingToday = today.filter((o) => o.payment_status === "link_sent" || o.payment_status === "needs_verification");
  const convsToday = conversations.filter((c) => isToday(c.created_at));
  const todayPaidAed = paidToday.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const avg = paidToday.length ? Math.round(todayPaidAed / paidToday.length) : 0;
  return {
    todayOrders: today.length,
    todayPaidAed: Math.round(todayPaidAed),
    todayPendingAed: Math.round(pendingToday.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)),
    todayConversations: convsToday.length,
    todayHotLeads: convsToday.filter((c) => c.lead_temperature === "hot").length,
    todayLost: convsToday.filter((c) => c.stage === "lost_lead").length,
    todayComplaints: today.filter((o) => o.order_status === "complaint").length,
    topProduct: topByKey<string>(paidToday, "product_name"),
    topEmirate: topByKey<string>(paidToday, "delivery_area"),
    avgOrderAed: avg,
    conversionPercent: convsToday.length ? Math.round((paidToday.length / convsToday.length) * 100) : 0,
  };
}

export function deterministicNarrative(m: DailyMetrics): { en: string; ar: string } {
  const en = [
    `Today: ${m.todayConversations} conversations, ${m.todayOrders} orders (${m.todayHotLeads} hot leads).`,
    `Revenue today: AED ${m.todayPaidAed.toLocaleString()} from paid orders. Pending payment links worth AED ${m.todayPendingAed.toLocaleString()}.`,
    m.topProduct ? `Best mover: ${m.topProduct}.` : `No paid orders yet today — focus on hot leads.`,
    m.topEmirate ? `Top emirate today: ${m.topEmirate}.` : `No emirate concentration yet.`,
    `Conversion (today): ${m.conversionPercent}%.`,
    m.todayComplaints ? `⚠ ${m.todayComplaints} complaint(s) opened today — review the dispute queue before close.` : `No complaints today.`,
    m.todayLost ? `${m.todayLost} lost lead(s) — tag the lost-reason for the weekly review.` : ``,
  ].filter(Boolean).join("\n");

  const ar = [
    `اليوم: ${m.todayConversations} محادثة، ${m.todayOrders} طلب (${m.todayHotLeads} عميل جدّي).`,
    `الإيرادات اليوم: ${m.todayPaidAed.toLocaleString()} درهم من طلبات مدفوعة. روابط دفع معلّقة بقيمة ${m.todayPendingAed.toLocaleString()} درهم.`,
    m.topProduct ? `الأكثر مبيعاً: ${m.topProduct}.` : `لا توجد طلبات مدفوعة بعد اليوم — ركّز على العملاء الجدّيين.`,
    m.topEmirate ? `أكثر إمارة اليوم: ${m.topEmirate}.` : `لا تركّز حسب الإمارة بعد.`,
    `معدّل التحويل اليوم: ${m.conversionPercent}%.`,
    m.todayComplaints ? `⚠ ${m.todayComplaints} شكوى مفتوحة اليوم — راجع قائمة النزاعات قبل نهاية الدوام.` : `لا شكاوى اليوم.`,
    m.todayLost ? `${m.todayLost} عميل محتمل مفقود — سجّل السبب للمراجعة الأسبوعية.` : ``,
  ].filter(Boolean).join("\n");

  return { en, ar };
}
