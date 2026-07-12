import { fetchRows, formatAed, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, SectionTitle } from "@/components/ui";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [customersRes, ordersRes] = await Promise.all([
    fetchRows("customers", { order: "created_at" }),
    fetchRows("orders"),
  ]);

  const customers = customersRes.rows;
  const orders = ordersRes.rows;

  type Stats = { totalAed: number; orders: number; lastOrderAt?: string };
  const stats = new Map<string, Stats>();
  for (const o of orders) {
    const cid = o.customer_id as string;
    const s = stats.get(cid) ?? { totalAed: 0, orders: 0 };
    if (o.payment_status === "confirmed") s.totalAed += Number(o.total_amount) || 0;
    s.orders += 1;
    const at = o.created_at as string;
    if (!s.lastOrderAt || at > s.lastOrderAt) s.lastOrderAt = at;
    stats.set(cid, s);
  }

  const totalSpend = Array.from(stats.values()).reduce((s, x) => s + x.totalAed, 0);
  const vipCount = customers.filter((c) => c.vip).length;
  const repeatCount = customers.filter((c) => Number(c.purchase_count ?? 0) >= 2).length;
  const arabicShare = Math.round(
    (customers.filter((c) => c.language === "ar" || c.language === "mixed").length /
      Math.max(1, customers.length)) * 100
  );

  const enriched = customers
    .slice()
    .sort((a, b) => (stats.get(b.id as string)?.totalAed ?? 0) - (stats.get(a.id as string)?.totalAed ?? 0));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Customers" subtitle="Sales-relevant records only — no sensitive profiling, ever." />
      <DemoBanner demoMode={customersRes.demoMode} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="All customers" value={customers.length} />
        <Kpi label="VIP" value={vipCount} hint="3+ purchases — owner deliveries" />
        <Kpi label="Repeat" value={repeatCount} hint="2+ purchases" />
        <Kpi label="Arabic-speaking" value={`${arabicShare}%`} hint="Includes mixed-language" />
      </div>

      <div className="card">
        <SectionTitle action={<span className="muted">Total spend across all customers: <strong>{formatAed(totalSpend)}</strong></span>}>
          Customer book
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th><th>Arabic</th><th>Platform</th><th>Lang</th>
                <th>Segment</th><th>Orders</th><th>Spend (AED)</th><th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((c) => {
                const s = stats.get(c.id as string) ?? { totalAed: 0, orders: 0 } as Stats;
                return (
                <tr key={c.id as string}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name_display as string}</span>
                      {c.vip ? <span className="badge badge-vip">VIP</span> : null}
                      {!c.vip && Number(c.purchase_count) >= 2 ? <span className="badge badge-info">repeat</span> : null}
                    </div>
                  </td>
                  <td className="rtl">{(c.name_arabic_verified as string) ?? "—"}</td>
                  <td>{c.platform as string}</td>
                  <td><span className={clsx("badge", c.language === "ar" ? "badge-info" : c.language === "mixed" ? "badge-warn" : "badge-neutral")}>{c.language as string}</span></td>
                  <td>{c.segment as string}</td>
                  <td>{s.orders}</td>
                  <td>{formatAed(s.totalAed)}</td>
                  <td className="text-xs text-gray-500">{s.lastOrderAt ? formatRelative(s.lastOrderAt) : "—"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
