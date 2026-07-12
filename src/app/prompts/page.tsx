import { fetchRows } from "@/lib/data";
import { DEFAULT_PROMPTS } from "@/lib/ai/prompts";
import { DemoBanner, PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const { rows, demoMode } = await fetchRows("prompts", { order: "key" });
  const dbByKey = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = r.key as string | undefined;
    if (key) dbByKey.set(key, r);
  }
  const keys = Object.keys(DEFAULT_PROMPTS) as (keyof typeof DEFAULT_PROMPTS)[];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Prompt Management"
        subtitle="The owner-editable prompt library that drives the AI agent. DB rows override the code defaults at runtime."
      />
      <DemoBanner demoMode={demoMode} />
      <SectionTitle action={<span className="muted">{keys.length} prompt keys</span>}>Prompt library</SectionTitle>
      <div className="flex flex-col gap-3">
        {keys.map((k) => {
          const db = dbByKey.get(k);
          const body = (db?.body as string | undefined) ?? DEFAULT_PROMPTS[k];
          return (
            <details key={k} className="card">
              <summary className="cursor-pointer text-sm font-semibold">
                {k} {db ? <span className="badge badge-pass ml-2">DB override</span> : <span className="badge badge-warn ml-2">default</span>}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{body}</pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}
