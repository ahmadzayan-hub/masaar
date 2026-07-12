import { fetchRows, formatDate } from "@/lib/data";
import { DemoBanner, PageHeader, SectionTitle } from "@/components/ui";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, string> = {
  payment_confirmed: "badge-pass",
  order_dispatched: "badge-info",
  dispute_opened: "badge-fail",
  dispute_resolved: "badge-pass",
  prompt_updated: "badge-neutral",
  price_quoted: "badge-warn",
  owner_approval: "badge-pass",
  inventory_reorder: "badge-info",
};

export default async function AuditPage() {
  const { rows, demoMode } = await fetchRows("audit_logs", { order: "created_at" });

  // Group by day for readability.
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const k = (r.created_at as string).slice(0, 10);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Audit Log"
        subtitle="Every owner approval, payment confirmation, and policy change — for accountability and weekly review."
      />
      <DemoBanner demoMode={demoMode} />

      <div className="flex flex-col gap-4">
        {Array.from(groups.entries()).map(([day, items]) => (
          <div key={day} className="card">
            <SectionTitle action={<span className="muted">{items.length} events</span>}>{day}</SectionTitle>
            <ul className="flex flex-col gap-1.5">
              {items.map((r) => (
                <li key={r.id as string} className="flex items-start gap-3 text-sm">
                  <span className={clsx("badge shrink-0", ACTION_TONE[r.action as string] ?? "badge-neutral")}>
                    {(r.action as string).replace(/_/g, " ")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div>
                      <span className="text-gray-600">{r.entity as string} · </span>
                      <span className="font-mono text-xs">{(r.entity_id as string)}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {(r.user_id as string) ?? "system"} · {formatDate(r.created_at as string)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
