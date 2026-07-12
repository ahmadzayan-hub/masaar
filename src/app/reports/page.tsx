import { fetchKpis, fetchRows, formatAed } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, SectionTitle } from "@/components/ui";
import { OrdersBarChart, RevenueAreaChart, FunnelBarChart, TopProductsChart } from "@/components/LazyCharts";
import { revenueByDay, ordersByDay, conversionFunnel, topProducts } from "@/lib/analytics";
import { buildVatCsv, type OrderForTax } from "@/lib/growth";
import { computeDailyMetrics, deterministicNarrative } from "@/lib/daily-review";
import VatExportButton from "./VatExportButton";

export const dynamic = "force-dynamic";

const WEEKLY_SECTIONS = [
  "Best selling products", "Best selling colours", "Best converting scripts",
  "Worst converting scripts", "Courier SLA review", "Supplier risk review",
  "Pricing recommendation", "Inventory reorder recommendation",
  "Content recommendation", "Repeat purchase plan",
];

export default async function ReportsPage() {
  const [{ kpis, demoMode }, ordersRes, convsRes] = await Promise.all([
    fetchKpis(),
    fetchRows("orders", { order: "created_at" }),
    fetchRows("conversations", { order: "created_at" }),
  ]);
  const orders = ordersRes.rows as Array<Record<string, unknown> & { created_at: string }>;
  const conversations = convsRes.rows as Array<Record<string, unknown> & { created_at: string }>;

  const revenue = revenueByDay(orders, 30);
  const ordersTrend = ordersByDay(orders, 30);
  const funnel = conversionFunnel(conversations, orders);
  const top = topProducts(orders);
  const metrics = computeDailyMetrics(orders, conversations);
  const narrative = deterministicNarrative(metrics);
  const csv = buildVatCsv(
    orders
      .filter((o) => o.payment_status === "confirmed")
      .map((o) => ({
        id: o.id as string,
        created_at: o.created_at,
        product_summary: o.product_summary as string,
        product_price: Number(o.product_price),
        delivery_cost: Number(o.delivery_cost),
        vat_amount: Number(o.vat_amount),
        total_amount: Number(o.total_amount),
        payment_status: o.payment_status as string,
      })) as OrderForTax[]
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Reports &amp; Reviews"
        subtitle="The improvement loop. Use the daily review every evening and the weekly review every week — without it, the system repeats mistakes faster."
        action={<VatExportButton csv={csv} />}
      />
      <DemoBanner demoMode={demoMode} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Revenue 30d" value={formatAed(kpis.revenueAed30d)} />
        <Kpi label="Revenue 7d" value={formatAed(kpis.revenueAed7d)} />
        <Kpi label="Paid orders" value={kpis.paidOrders} />
        <Kpi label="Lead → payment" value={`${kpis.leadToPayment}%`} />
        <Kpi label="Open disputes" value={kpis.openDisputes} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <SectionTitle>Revenue (30 days)</SectionTitle>
          <RevenueAreaChart data={revenue} />
        </div>
        <div className="card">
          <SectionTitle>Conversion funnel</SectionTitle>
          <FunnelBarChart data={funnel} />
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <SectionTitle>Orders per day</SectionTitle>
          <OrdersBarChart data={ordersTrend} />
        </div>
        <div className="card">
          <SectionTitle>Top products (paid)</SectionTitle>
          <TopProductsChart data={top} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <SectionTitle action={<span className="muted text-xs">today, live</span>}>
            Daily operating review
          </SectionTitle>
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <Stat k="Conversations" v={metrics.todayConversations} />
            <Stat k="Hot leads" v={metrics.todayHotLeads} />
            <Stat k="Orders" v={metrics.todayOrders} />
            <Stat k="Paid (AED)" v={formatAed(metrics.todayPaidAed)} />
            <Stat k="Pending (AED)" v={formatAed(metrics.todayPendingAed)} />
            <Stat k="Avg order (AED)" v={formatAed(metrics.avgOrderAed)} />
            <Stat k="Conversion" v={`${metrics.conversionPercent}%`} />
            <Stat k="Complaints" v={metrics.todayComplaints} />
          </dl>
          <h3 className="h2 mt-3 mb-1">Narrative — English</h3>
          <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm">{narrative.en}</pre>
          <h3 className="h2 mt-3 mb-1">السرد — العربية</h3>
          <pre className="rtl whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm" dir="rtl">{narrative.ar}</pre>
          <p className="mt-2 text-xs text-gray-500">
            Wire your AI provider (Settings) to polish this narrative every evening from the day&apos;s conversations.
          </p>
        </div>
        <div className="card">
          <SectionTitle>Weekly improvement loop</SectionTitle>
          <ul className="list-disc pl-5 text-sm text-gray-700">
            {WEEKLY_SECTIONS.map((s) => <li key={s}>{s}</li>)}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Run every Sunday. The VAT-ready CSV above feeds the monthly tax report.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{k}</div>
      <div className="text-sm font-semibold">{v}</div>
    </div>
  );
}
