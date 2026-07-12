import { fetchRows, formatAed, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, CourierStatusPill, SectionTitle } from "@/components/ui";
import { EMIRATE_BUFFERS, expectedDeliveryWindow } from "@/lib/growth";

export const dynamic = "force-dynamic";

export default async function CouriersPage() {
  const [couriersRes, deliveriesRes, ordersRes] = await Promise.all([
    fetchRows("couriers", { order: "name" }),
    fetchRows("deliveries"),
    fetchRows("orders"),
  ]);

  const couriers = couriersRes.rows;
  const deliveries = deliveriesRes.rows;
  const orders = ordersRes.rows;

  const active = deliveries.filter((d) => d.delivery_status === "in_transit" || d.delivery_status === "confirmed" || d.delivery_status === "picked_up");
  const failures = deliveries.filter((d) => (Number(d.failed_attempts) || 0) > 0);
  const onTimeRate = (() => {
    const delivered = deliveries.filter((d) => d.delivery_status === "delivered");
    if (delivered.length === 0) return 100;
    const onTime = delivered.filter((d) => !d.actual_received_date || !d.expected_delivery_date || (d.actual_received_date as string) <= (d.expected_delivery_date as string));
    return Math.round((onTime.length / delivered.length) * 100);
  })();

  const orderById = new Map(orders.map((o) => [o.id as string, o]));
  // active deliveries paired with their orders
  const activeWithOrders = active.map((d) => {
    const order = orderById.get(d.order_id as string);
    const window = expectedDeliveryWindow(order?.delivery_area as string | undefined);
    return { delivery: d, order, window };
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Couriers &amp; Delivery"
        subtitle="Costs are configurable per courier. Outside Dubai requires courier confirmation before promising any window."
      />
      <DemoBanner demoMode={couriersRes.demoMode} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active deliveries" value={active.length} />
        <Kpi label="Delivered total" value={deliveries.filter((d) => d.delivery_status === "delivered").length} />
        <Kpi label="On-time rate" value={`${onTimeRate}%`} />
        <Kpi label="Failed attempts" value={failures.length} />
      </div>

      {/* Couriers grid */}
      <div className="card mb-4">
        <SectionTitle>Courier roster</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          {couriers.map((c) => (
            <div key={c.id as string} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name as string}</span>
                <span className="badge badge-neutral">{(c.service_type as string).replace(/_/g, " ")}</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">{c.notes as string}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Default: <strong className="text-gray-900">{formatAed(Number(c.default_cost))}</strong></span>
                <span>{c.vat_included ? "VAT incl." : "VAT excl."}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active deliveries */}
      <div className="card mb-4">
        <SectionTitle>Active deliveries</SectionTitle>
        {activeWithOrders.length === 0 ? (
          <p className="text-sm text-gray-500">No deliveries in flight right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Order</th><th>Customer</th><th>Emirate</th><th>Expected</th><th>Courier</th><th>Status</th></tr></thead>
              <tbody>
                {activeWithOrders.map(({ delivery, order, window }) => (
                  <tr key={delivery.id as string}>
                    <td className="truncate">{(order?.product_summary as string) ?? "—"}</td>
                    <td>{(order?.customer_name as string) ?? "—"}</td>
                    <td>{(order?.delivery_area as string) ?? "—"}</td>
                    <td className="text-xs text-gray-500">{window.label}</td>
                    <td>{(delivery.courier_name as string) ?? "—"}</td>
                    <td><CourierStatusPill status={delivery.delivery_status as string} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Emirate buffers */}
      <div className="card">
        <SectionTitle>Expected delivery windows by emirate</SectionTitle>
        <div className="grid gap-2 text-sm md:grid-cols-4">
          {Object.entries(EMIRATE_BUFFERS).map(([emirate, b]) => (
            <div key={emirate} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="font-medium capitalize">{emirate}</div>
              <div className="text-xs text-gray-500">{b.minDays}–{b.maxDays} day{b.maxDays > 1 ? "s" : ""}{emirate.toLowerCase() === "dubai" ? "" : " · courier confirm"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
