import { fetchKpis, fetchRows, formatAed, formatRelative } from "@/lib/data";
import { DemoBanner, Kpi, PageHeader, SectionTitle, OrderStatusPill, TempPill } from "@/components/ui";
import { PipelineBoard } from "@/components/orders/PipelineBoard";
import { stageCounts, todaySummary } from "@/lib/orders/pipeline";
import {
  RevenueAreaChart, StackedStatusChart, FunnelBarChart, TopProductsChart, PlatformPie,
} from "@/components/LazyCharts";
import {
  revenueByDay, stackedStatusByDay, conversionFunnel, topProducts, platformMix,
  buildAttentionQueue,
} from "@/lib/analytics";
import Link from "next/link";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [{ kpis, demoMode }, ordersRes, convsRes, paymentsRes, disputesRes, inventoryRes, reviewsRes] =
    await Promise.all([
      fetchKpis(),
      fetchRows("orders", { order: "created_at" }),
      fetchRows("conversations", { order: "created_at" }),
      fetchRows("payments", { order: "created_at" }),
      fetchRows("disputes", { order: "created_at" }),
      fetchRows("inventory", { order: "last_updated" }),
      fetchRows("reviews", { order: "created_at", limit: 4 }),
    ]);

  const orders = ordersRes.rows as Array<Record<string, unknown> & { created_at: string }>;
  const conversations = convsRes.rows as Array<Record<string, unknown> & { created_at: string }>;
  const revenueSeries = revenueByDay(orders);
  const statusSeries = stackedStatusByDay(orders);
  const funnel = conversionFunnel(conversations, orders);
  const top = topProducts(orders);
  const platforms = platformMix(conversations);
  const attention = buildAttentionQueue({
    orders,
    payments: paymentsRes.rows,
    disputes: disputesRes.rows,
    inventory: inventoryRes.rows,
    conversations,
  });

  const counts = stageCounts(orders);
  const today = todaySummary(counts);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Masaar — Mission Control"
        subtitle="What is happening, what needs you, and what to do next — the pipeline is the product."
        action={
          <Link href="/intake" className="btn btn-accent">+ New Conversation</Link>
        }
      />
      <DemoBanner demoMode={demoMode} />

      {/* Layer 1 — NOW: the control room band */}
      <section className="cr p-4 md:p-5" aria-label="Today">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/90">Today</h2>
          <span className="cr-muted text-xs">
            Revenue today <b className="text-white">{formatAed(kpis.revenueAedToday)}</b> · 7d {formatAed(kpis.revenueAed7d)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Link href="/inbox" className="cr-stat"><div className="text-lg font-semibold tabular-nums">{kpis.newToday}</div><div className="cr-muted text-[11px]">New leads today</div></Link>
          <Link href="/orders?stage=lead" className="cr-stat"><div className="text-lg font-semibold tabular-nums">{today.needConfirmation}</div><div className="cr-muted text-[11px]">Need confirmation</div></Link>
          <Link href="/orders?stage=confirmed" className="cr-stat"><div className="text-lg font-semibold tabular-nums">{today.awaitingPayment}</div><div className="cr-muted text-[11px]">Awaiting payment</div></Link>
          <Link href="/orders?stage=production" className="cr-stat"><div className="text-lg font-semibold tabular-nums">{today.inProduction}</div><div className="cr-muted text-[11px]">In production</div></Link>
          <Link href="/orders?stage=dispatched" className="cr-stat"><div className="text-lg font-semibold tabular-nums">{today.withCourier}</div><div className="cr-muted text-[11px]">With courier</div></Link>
          <Link href="/orders?stage=after_sales" className="cr-stat"><div className="text-lg font-semibold tabular-nums text-[#F7A6A6]">{today.problems + kpis.openDisputes}</div><div className="cr-muted text-[11px]">Problems</div></Link>
        </div>
        <div className="mt-4">
          <PipelineBoard counts={counts} />
        </div>
      </section>

      {/* Revenue + Attention queue */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <SectionTitle action={<span className="muted">14-day revenue (AED)</span>}>
            Revenue trend
          </SectionTitle>
          <RevenueAreaChart data={revenueSeries} />
        </div>
        <div className="card">
          <SectionTitle action={<Link className="muted text-xs underline" href="/inbox">Open inbox →</Link>}>
            Needs your attention
          </SectionTitle>
          {attention.length === 0 ? (
            <p className="text-sm text-gray-500">Inbox is clear — enjoy a quiet moment 🤍</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attention.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="flex items-start gap-2 rounded-lg p-2 hover:bg-gray-50">
                    <span className={clsx(
                      "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                      a.severity === "high" ? "bg-red-500" : a.severity === "medium" ? "bg-amber-500" : "bg-sky-500"
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.title}</div>
                      <div className="truncate text-xs text-gray-500">{a.detail}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Status + Funnel */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <SectionTitle>Order status (14 days)</SectionTitle>
          <StackedStatusChart data={statusSeries} />
        </div>
        <div className="card">
          <SectionTitle>Conversion funnel</SectionTitle>
          <FunnelBarChart data={funnel} />
        </div>
      </div>

      {/* Top products + Platform mix */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <SectionTitle action={<Link href="/inventory" className="muted text-xs underline">Inventory →</Link>}>
            Top products (paid orders)
          </SectionTitle>
          <TopProductsChart data={top} />
        </div>
        <div className="card">
          <SectionTitle>Where leads come from</SectionTitle>
          <PlatformPie data={platforms} />
        </div>
      </div>

      {/* Recent activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <SectionTitle action={<Link href="/orders" className="muted text-xs underline">All orders →</Link>}>
            Latest orders
          </SectionTitle>
          <table className="tbl">
            <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th><th>When</th></tr></thead>
            <tbody>
              {orders.slice(0, 7).map((o) => (
                <tr key={o.id as string}>
                  <td className="font-medium">
                    <Link href={`/orders/${o.id as string}`} className="hover:underline">
                      {o.product_summary as string}
                    </Link>
                  </td>
                  <td>{o.customer_name as string}</td>
                  <td>{formatAed(Number(o.total_amount))}</td>
                  <td><OrderStatusPill status={o.order_status as string} /></td>
                  <td><span className="text-xs text-gray-500">{(o.payment_status as string).replace(/_/g, " ")}</span></td>
                  <td className="text-xs text-gray-500">{formatRelative(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <SectionTitle action={<Link href="/reviews" className="muted text-xs underline">All →</Link>}>
            Recent reviews
          </SectionTitle>
          <ul className="flex flex-col gap-3">
            {(reviewsRes.rows as Array<Record<string, unknown>>).slice(0, 4).map((r) => (
              <li key={r.id as string} className="border-l-2 border-pink-300 pl-3">
                <div className="text-xs text-gray-500">
                  {"★".repeat(Number(r.rating) || 0)}{" "}
                  <span className="text-gray-400">·</span>{" "}
                  {r.customer_name as string}
                </div>
                <p className="mt-0.5 text-sm">{r.feedback as string}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Latest conversations */}
      <div className="mt-4 card">
        <SectionTitle action={<Link href="/inbox" className="muted text-xs underline">Open inbox →</Link>}>
          Latest conversations
        </SectionTitle>
        <ul className="flex flex-col">
          {conversations.slice(0, 6).map((c) => (
            <li key={c.id as string} className="flex items-start gap-3 border-t border-gray-100 py-2 first:border-t-0">
              <TempPill temp={c.lead_temperature as string} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">
                    {(c as Record<string, unknown>).customer_name as string} · <span className="text-gray-500">{c.platform as string}</span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{formatRelative(c.created_at)}</span>
                </div>
                <p className={clsx(
                  "truncate text-sm text-gray-700",
                  c.message_language === "ar" && "rtl"
                )}>{c.message_text as string}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
