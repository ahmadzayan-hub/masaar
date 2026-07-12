import { fetchRows, formatAed, formatDate } from "@/lib/data";
import { DemoBanner, PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const PROVIDER = process.env.AI_PROVIDER ?? "mock";
const MODEL =
  PROVIDER === "anthropic" ? (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6") :
  PROVIDER === "openai" ? (process.env.OPENAI_MODEL ?? "gpt-4o") :
  PROVIDER === "groq" ? (process.env.GROQ_MODEL ?? "llama-3.1-70b-versatile") :
  PROVIDER === "together" ? (process.env.TOGETHER_MODEL ?? "Qwen/Qwen2.5-72B-Instruct-Turbo") :
  PROVIDER === "gemini" ? (process.env.GEMINI_MODEL ?? "gemini-1.5-pro") :
  "mock (no live calls)";

export default async function SettingsPage() {
  const [settingsRes, productsRes] = await Promise.all([
    fetchRows("settings", { order: "key" }),
    fetchRows("products", { order: "name" }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="Everything that affects pricing, VAT, reservation windows, and the AI is configurable. Nothing hard-coded." />
      <DemoBanner demoMode={settingsRes.demoMode} />

      <div className="card mb-4">
        <SectionTitle>AI provider</SectionTitle>
        <dl className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
          <Row k="Provider" v={PROVIDER} />
          <Row k="Model" v={MODEL} />
          <Row k="Owner approval matrix" v="14 actions blocked from auto-approval" />
          <Row k="Mock fallback" v="Safe placeholder when no API key is set" />
        </dl>
        <p className="mt-2 text-xs text-gray-500">
          Change provider by setting <code>AI_PROVIDER</code> (one of: <code>openai</code>, <code>anthropic</code>, <code>gemini</code>, <code>groq</code>, <code>together</code>, <code>openai_compatible</code>) and the matching API key on the host.
        </p>
      </div>

      <div className="card mb-4">
        <SectionTitle>System settings</SectionTitle>
        {settingsRes.rows.length === 0 ? (
          <p className="text-sm text-gray-500">No settings rows yet.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Key</th><th>Value</th><th>Updated</th></tr></thead>
            <tbody>
              {settingsRes.rows.map((s) => (
                <tr key={s.key as string}>
                  <td className="font-mono text-xs">{s.key as string}</td>
                  <td>{prettyValue(s.key as string, s.value)}</td>
                  <td className="text-xs text-gray-500">{formatDate(s.updated_at as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <SectionTitle>Product catalogue</SectionTitle>
        <table className="tbl">
          <thead><tr><th>Product</th><th>Category</th><th>Default price</th><th>Notes</th><th>Active</th></tr></thead>
          <tbody>
            {productsRes.rows.map((p) => (
              <tr key={p.id as string}>
                <td className="font-medium">{p.name as string}</td>
                <td className="text-xs text-gray-500">{(p.category as string).replace(/_/g, " ")}</td>
                <td>{formatAed(Number(p.default_price))}</td>
                <td className="text-xs text-gray-500">{(p.claim_notes as string) ?? "—"}</td>
                <td>{p.active ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (<div className="flex gap-2"><dt className="w-44 shrink-0 text-gray-500">{k}</dt><dd>{v}</dd></div>);
}

function prettyValue(key: string, value: unknown): string {
  if (typeof value === "number" && /aed|threshold/i.test(key)) return formatAed(value);
  if (typeof value === "number" && /rate|percent/.test(key)) return `${value}%`;
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
