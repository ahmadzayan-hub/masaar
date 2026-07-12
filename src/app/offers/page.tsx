import { fetchRows, formatAed, formatDate } from "@/lib/data";
import { DemoBanner, PageHeader, Kpi, SectionTitle } from "@/components/ui";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const { rows, demoMode } = await fetchRows("offers", { order: "end_at" });
  const now = Date.now();
  const active = rows.filter((r) => r.active && new Date(r.end_at as string).getTime() > now);
  const expired = rows.filter((r) => !r.active || new Date(r.end_at as string).getTime() <= now);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Offers"
        subtitle="Active offers govern what the agent may quote. Anything quoted outside an active offer must be approved by the owner."
      />
      <DemoBanner demoMode={demoMode} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active offers" value={active.length} />
        <Kpi label="Expired" value={expired.length} />
        <Kpi label="Avg active price" value={formatAed(active.length ? active.reduce((s, o) => s + (Number(o.price) || 0), 0) / active.length : 0)} />
        <Kpi label="Free-Dubai offers" value={active.filter((o) => o.delivery_rule === "free_dubai").length} />
      </div>

      <div className="card mb-4">
        <SectionTitle>Active offers</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((o) => (
            <OfferCard key={o.id as string} o={o} />
          ))}
          {active.length === 0 && <p className="text-sm text-gray-500">No active offers. The agent can&apos;t quote prices until one is loaded.</p>}
        </div>
      </div>

      <div className="card">
        <SectionTitle>Past / inactive</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {expired.map((o) => (
            <OfferCard key={o.id as string} o={o} muted />
          ))}
          {expired.length === 0 && <p className="text-sm text-gray-500">No past offers.</p>}
        </div>
      </div>
    </div>
  );
}

function OfferCard({ o, muted }: { o: Record<string, unknown>; muted?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-3", muted ? "border-gray-200 bg-gray-50 text-gray-600" : "border-pink-200 bg-pink-50/60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{o.name as string}</span>
        <span className="text-sm font-semibold">{formatAed(Number(o.price))}</span>
      </div>
      <p className="mt-1 text-sm">{o.description as string}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Item label="Delivery" v={(o.delivery_rule as string).replace(/_/g, " ")} />
        <Item label="VAT" v={o.vat_rule as string} />
        <Item label="Ends" v={formatDate(o.end_at as string)} />
        <Item label="Status" v={o.active ? "active" : "inactive"} />
      </div>
      {Array.isArray(o.products_included) && o.products_included.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
          {(o.products_included as string[]).map((p) => <span key={p} className="badge badge-neutral">{p.replace(/_/g, " ")}</span>)}
        </div>
      )}
    </div>
  );
}

function Item({ label, v }: { label: string; v: string }) {
  return <div className="rounded-lg bg-white/60 px-2 py-1"><div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div><div>{v}</div></div>;
}
