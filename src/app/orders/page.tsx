import { fetchRows, formatAed, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader, OrderStatusPill, PaymentStatusPill, CourierStatusPill, SectionTitle, Kpi } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STAGES = [
  { key: "draft", label: "Draft" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "paid", label: "Paid" },
  { key: "qc", label: "Quality check" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
  { key: "complaint", label: "Complaint" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function OrdersPage() {
  const { rows, demoMode } = await fetchRows("orders", { order: "created_at" });
  const totals = rows.reduce(
    (acc: { totalAed: number; paidAed: number; pendingAed: number; delivered: number; qc: number }, o) => {
      acc.totalAed += Number(o.total_amount) || 0;
      if (o.payment_status === "confirmed") acc.paidAed += Number(o.total_amount) || 0;
      if (o.payment_status === "link_sent" || o.payment_status === "needs_verification") acc.pendingAed += Number(o.total_amount) || 0;
      if (o.order_status === "delivered") acc.delivered += 1;
      if (o.order_status === "qc") acc.qc += 1;
      return acc;
    },
    { totalAed: 0, paidAed: 0, pendingAed: 0, delivered: 0, qc: 0 }
  );
  const byStage: Record<string, Array<Record<string, unknown>>> = {};
  for (const s of STAGES) byStage[s.key] = [];
  for (const o of rows) {
    const k = (o.order_status as string) || "draft";
    (byStage[k] ?? (byStage[k] = [])).push(o);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Orders"
        subtitle="Order lifecycle from draft to delivered. Dispatch is blocked until payment is confirmed and QC is signed off."
      />
      <DemoBanner demoMode={demoMode} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Total order value" value={formatAed(totals.totalAed)} />
        <Kpi label="Paid" value={formatAed(totals.paidAed)} />
        <Kpi label="Awaiting payment" value={formatAed(totals.pendingAed)} />
        <Kpi label="In QC" value={totals.qc} />
        <Kpi label="Delivered" value={totals.delivered} />
      </div>

      {/* Kanban board */}
      <SectionTitle action={<Link href="/inbox" className="muted text-xs underline">Customer Inbox →</Link>}>
        Order pipeline
      </SectionTitle>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((s) => (
          <div key={s.key} className="kanban">
            <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span>{s.label}</span>
              <span className="text-gray-400">{(byStage[s.key] ?? []).length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {(byStage[s.key] ?? []).slice(0, 8).map((o) => (
                <article key={o.id as string} className="card-tight">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{o.product_summary as string}</span>
                    <span className="shrink-0 text-gray-500">{formatAed(Number(o.total_amount))}</span>
                  </div>
                  <div className="mb-2 text-xs text-gray-500">{o.customer_name as string} · {o.delivery_area as string}</div>
                  <div className="flex flex-wrap gap-1">
                    <PaymentStatusPill status={o.payment_status as string} />
                    <CourierStatusPill status={o.courier_status as string} />
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">{formatRelative(o.created_at as string)}</div>
                  {o.locked_by_dispute ? <div className="mt-1 text-[11px] text-red-700">🔒 Locked — open dispute</div> : null}
                </article>
              ))}
              {(byStage[s.key] ?? []).length > 8 && (
                <div className="px-1 text-[11px] text-gray-400">+{(byStage[s.key] ?? []).length - 8} more</div>
              )}
              {(byStage[s.key] ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-[11px] text-gray-400">
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detailed table */}
      <div className="card mt-6">
        <SectionTitle>All orders</SectionTitle>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th>City</th><th>Total</th>
                <th>Status</th><th>Payment</th><th>Courier</th><th>ETA</th><th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id as string}>
                  <td className="font-medium">{o.product_summary as string}</td>
                  <td>{o.customer_name as string}</td>
                  <td>{(o.delivery_city as string)} <span className="text-xs text-gray-400">{o.delivery_area as string}</span></td>
                  <td>{formatAed(Number(o.total_amount))}</td>
                  <td><OrderStatusPill status={o.order_status as string} /></td>
                  <td><PaymentStatusPill status={o.payment_status as string} /></td>
                  <td><CourierStatusPill status={o.courier_status as string} /></td>
                  <td className="text-xs text-gray-500">{(o.expected_delivery_date as string) ?? "—"}</td>
                  <td className="text-xs text-gray-500">{formatRelative(o.created_at as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
