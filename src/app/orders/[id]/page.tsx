// Order 360 — the single most important screen in Masaar: customer, money,
// design, delivery, transition history and the next allowed action, together.
import Link from "next/link";
import { fetchOrder360 } from "@/lib/orders/order360";
import { getCurrentRole } from "@/lib/auth/role";
import { STATUS_LABELS } from "@/lib/orders/lifecycle";
import { formatAed, formatRelative } from "@/lib/data";
import { DemoBanner, OrderStatusPill, PaymentStatusPill, CourierStatusPill, SectionTitle } from "@/components/ui";
import { OrderActions } from "@/components/orders/OrderActions";

export const dynamic = "force-dynamic";

export default async function Order360Page({ params }: { params: Promise<{ id: string }> }) {
  // Next 15: route params arrive as a promise.
  const { id } = await params;
  const [{ order, customer, payments, delivery, events, status, demoMode }, role] =
    await Promise.all([fetchOrder360(id), getCurrentRole()]);

  if (!order) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="card mt-10 text-center">
          <h1 className="h1">Order not found</h1>
          <p className="muted mt-2 text-sm">
            This order does not exist or you do not have access to it.
          </p>
          <Link href="/orders" className="btn btn-primary mt-4">← Back to orders</Link>
        </div>
      </div>
    );
  }

  const paid = payments.find((p) => p.status === "confirmed");

  return (
    <div className="mx-auto max-w-7xl">
      <DemoBanner demoMode={demoMode} />

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[color:rgb(var(--hairline))] pb-4">
        <div>
          <div className="text-xs text-gray-400">
            <Link href="/orders" className="hover:underline">Orders</Link> / <span className="font-mono">{String(order.id)}</span>
          </div>
          <h1 className="h1 mt-1">{String(order.product_summary ?? "Order")}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OrderStatusPill status={String(order.order_status)} />
            <PaymentStatusPill status={String(order.payment_status ?? "none")} />
            <CourierStatusPill status={String(order.courier_status ?? "none")} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{formatAed(Number(order.total_amount) || 0)}</div>
          <div className="text-xs text-gray-500">
            product {formatAed(Number(order.product_price) || 0)} · delivery {formatAed(Number(order.delivery_cost) || 0)} · VAT {formatAed(Number(order.vat_amount) || 0)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: customer + delivery */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <SectionTitle>Customer</SectionTitle>
            <div className="text-sm font-medium">{String(order.customer_name ?? customer?.name_display ?? "—")}</div>
            {customer?.name_arabic_verified ? (
              <div className="text-sm text-gray-600" dir="rtl">{String(customer.name_arabic_verified)}</div>
            ) : null}
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
              <dt className="text-gray-400">Phone</dt><dd className="font-mono" dir="ltr">{String(order.phone ?? customer?.phone ?? "—")}</dd>
              <dt className="text-gray-400">Platform</dt><dd>{String(customer?.platform ?? "—")}</dd>
              <dt className="text-gray-400">Segment</dt><dd>{String(customer?.segment ?? "—")}</dd>
              <dt className="text-gray-400">Language</dt><dd>{String(customer?.language ?? "—")}</dd>
            </dl>
          </div>

          <div className="card">
            <SectionTitle>Delivery</SectionTitle>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
              <dt className="text-gray-400">City</dt><dd>{String(order.delivery_city ?? "—")}</dd>
              <dt className="text-gray-400">Emirate</dt><dd>{String(order.delivery_area ?? "—")}</dd>
              <dt className="text-gray-400">Expected</dt><dd>{String(order.expected_delivery_date ?? "—")}</dd>
              <dt className="text-gray-400">Received</dt><dd>{String(order.actual_received_date ?? "—")}</dd>
              <dt className="text-gray-400">Receiver</dt><dd>{String(order.receiver_name ?? "—")}</dd>
              <dt className="text-gray-400">Courier status</dt><dd>{String(delivery?.delivery_status ?? order.courier_status ?? "—")}</dd>
            </dl>
            {order.notes ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{String(order.notes)}</p> : null}
          </div>

          <div className="card">
            <SectionTitle>Payments</SectionTitle>
            {payments.length === 0 ? (
              <p className="text-xs text-gray-500">No payment records yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-xs">
                {payments.map((p) => (
                  <li key={String(p.id)} className="flex items-center justify-between gap-2">
                    <span>{String(p.payment_method ?? "payment")}</span>
                    <span className="tabular-nums">{formatAed(Number(p.amount_expected) || 0)}</span>
                    <PaymentStatusPill status={String(p.status ?? "none")} />
                  </li>
                ))}
              </ul>
            )}
            {paid ? <p className="mt-2 text-[11px] text-emerald-700">Payment confirmed — dispatch unblocked (QC still required).</p> : null}
          </div>
        </div>

        {/* Middle: journey timeline */}
        <div className="card lg:col-span-1">
          <SectionTitle>Order journey</SectionTitle>
          {events.length === 0 ? (
            <p className="text-xs text-gray-500">
              No transitions recorded yet — the order is at “{STATUS_LABELS[status].en}”.
            </p>
          ) : (
            <ol className="relative ms-2 border-s border-[color:rgb(var(--hairline))]">
              {events.map((ev) => (
                <li key={ev.id} className="mb-4 ms-4">
                  <span className="absolute -start-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white bg-[color:rgb(var(--gold))]" aria-hidden="true" />
                  <div className="text-sm font-medium">
                    {STATUS_LABELS[ev.to_status as keyof typeof STATUS_LABELS]?.en ?? ev.to_status}
                    <span className="text-gray-400"> ← {STATUS_LABELS[ev.from_status as keyof typeof STATUS_LABELS]?.en ?? ev.from_status}</span>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {ev.actor_type}{ev.actor_role ? ` · ${ev.actor_role}` : ""} · {formatRelative(ev.created_at)}
                    {ev.reason ? ` · ${ev.reason}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Right: next action */}
        <div className="flex flex-col gap-4">
          <div className="card-accent">
            <SectionTitle>Next action</SectionTitle>
            <p className="mb-3 text-xs text-gray-600">
              Current stage: <b>{STATUS_LABELS[status].en}</b>. Only transitions allowed by the
              state machine — and by your role — are offered.
            </p>
            <OrderActions orderId={String(order.id)} status={status} role={role} demoMode={demoMode} />
          </div>

          <div className="card">
            <SectionTitle>Order facts</SectionTitle>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
              <dt className="text-gray-400">Quantity</dt><dd>{String(order.quantity ?? "—")}</dd>
              <dt className="text-gray-400">Colours</dt><dd>{String(order.colours ?? "—")}</dd>
              <dt className="text-gray-400">Created</dt><dd>{formatRelative(String(order.created_at))}</dd>
              <dt className="text-gray-400">QC</dt><dd>{order.qc ? "recorded" : "—"}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
