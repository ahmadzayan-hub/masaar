import { fetchRows } from "@/lib/data";

export interface Column {
  key: string;
  label: string;
}

export default async function RecordPage({
  title,
  description,
  table,
  columns,
  order = "created_at",
}: {
  title: string;
  description: string;
  table: string;
  columns: Column[];
  order?: string;
}) {
  const { rows, connected, error } = await fetchRows(table, { order });
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 text-xl font-semibold">{title}</h1>
      <p className="mb-4 text-sm text-gray-500">{description}</p>

      {!connected && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Connect Supabase to load <code>{table}</code>. See README for setup.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-400">
                  No records yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={(row.id as string) ?? i} className="border-b border-gray-100">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-top">
                      {format(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function format(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
