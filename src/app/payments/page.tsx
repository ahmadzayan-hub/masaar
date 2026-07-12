import { fetchRows, formatAed, formatRelative } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, PaymentStatusPill, SectionTitle } from "@/components/ui";
import { RESOLUTION_TEMPLATES, type DisputeReason } from "@/lib/growth";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function PaymentsPage() {
  const [paymentsRes, disputesRes] = await Promise.all([
    fetchRows("payments", { order: "created_at" }),
    fetchRows("disputes", { order: "created_at" }),
  ]);

  const payments = paymentsRes.rows;
  const disputes = disputesRes.rows;
  const now = Date.now();
  const sumExpected = payments.reduce((s, p) => s + (Number(p.amount_expected) || 0), 0);
  const sumReceived = payments.filter((p) => p.status === "confirmed").reduce((s, p) => s + (Number(p.amount_received) || 0), 0);
  const sumThisMonth = payments
    .filter((p) => p.status === "confirmed" && new Date(p.created_at as string).getTime() > now - 30 * DAY)
    .reduce((s, p) => s + (Number(p.amount_received) || 0), 0);
  const pendingCount = payments.filter((p) => p.status === "link_sent").length;
  const verifyCount = payments.filter((p) => p.status === "needs_verification").length;
  const openDisputes = disputes.filter((d) => d.status === "open" || d.status === "in_review").length;

  const verify = payments.filter((p) => p.status === "needs_verification");
  const sent = payments.filter((p) => p.status === "link_sent");
  const confirmed = payments.filter((p) => p.status === "confirmed").slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Payments"
        subtitle="No courier dispatch until you mark a payment confirmed. VAT is tracked per order for the monthly tax report."
      />
      <DemoBanner demoMode={paymentsRes.demoMode} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Received this month" value={formatAed(sumThisMonth)} hint="Confirmed payments" />
        <Kpi label="All-time received" value={formatAed(sumReceived)} />
        <Kpi label="Expected total" value={formatAed(sumExpected)} hint="Sum of all payment intents" />
        <Kpi label="Awaiting verification" value={verifyCount} />
        <Kpi label="Open disputes" value={openDisputes} hint={openDisputes ? "Order locked" : "Clear"} />
      </div>

      {/* Verify queue */}
      <div className="card mb-4">
        <SectionTitle>Verify these now ({verify.length})</SectionTitle>
        {verify.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing waiting on you. 🤍</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Reference</th><th>Method</th><th>Expected</th><th>Sent</th><th>Action</th></tr></thead>
              <tbody>
                {verify.map((p) => (
                  <tr key={p.id as string}>
                    <td>{p.customer_name as string}</td>
                    <td className="font-mono text-xs">{p.reference as string}</td>
                    <td>{p.payment_method as string}</td>
                    <td>{formatAed(Number(p.amount_expected))}</td>
                    <td className="text-xs text-gray-500">{formatRelative(p.created_at as string)}</td>
                    <td><button className="btn btn-primary btn-sm">Verify &amp; activate</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Outstanding links */}
      <div className="card mb-4">
        <SectionTitle>Outstanding payment links ({sent.length})</SectionTitle>
        {sent.length === 0 ? (
          <p className="text-sm text-gray-500">No outstanding links.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Link</th><th>Expected</th><th>Sent</th><th>Status</th></tr></thead>
              <tbody>
                {sent.map((p) => (
                  <tr key={p.id as string}>
                    <td>{p.customer_name as string}</td>
                    <td className="truncate text-xs text-blue-700"><a href={p.payment_link as string} className="hover:underline">{p.payment_link as string}</a></td>
                    <td>{formatAed(Number(p.amount_expected))}</td>
                    <td className="text-xs text-gray-500">{formatRelative(p.created_at as string)}</td>
                    <td><PaymentStatusPill status={p.status as string} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disputes */}
      <div className="card mb-4">
        <SectionTitle>Disputes ({disputes.length})</SectionTitle>
        {disputes.length === 0 ? (
          <p className="text-sm text-gray-500">No disputes — keep it clean. 🤍</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Order</th><th>Reason</th><th>Status</th><th>Suggested reply</th><th>Opened</th></tr></thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.id as string}>
                    <td>{d.customer_name as string}</td>
                    <td className="font-mono text-xs">{(d.order_id as string).slice(-6).toUpperCase()}</td>
                    <td>{(d.reason as string).replace(/_/g, " ")}</td>
                    <td>
                      <span className={`badge ${d.status === "open" ? "badge-fail" : d.status === "in_review" ? "badge-warn" : "badge-pass"}`}>
                        {d.status as string}
                      </span>
                    </td>
                    <td className="max-w-[24rem] text-xs text-gray-700">
                      {RESOLUTION_TEMPLATES[d.reason as DisputeReason]?.en ?? "—"}
                    </td>
                    <td className="text-xs text-gray-500">{formatRelative(d.created_at as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmed payments */}
      <div className="card">
        <SectionTitle>Recent confirmed payments</SectionTitle>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Order</th><th>Method</th><th>Received</th><th>VAT</th><th>When</th></tr></thead>
            <tbody>
              {confirmed.map((p) => (
                <tr key={p.id as string}>
                  <td>{p.customer_name as string}</td>
                  <td className="truncate">{p.order_summary as string}</td>
                  <td>{p.payment_method as string}</td>
                  <td>{formatAed(Number(p.amount_received))}</td>
                  <td>{formatAed(Number(p.vat_amount))}</td>
                  <td className="text-xs text-gray-500">{formatRelative(p.created_at as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
