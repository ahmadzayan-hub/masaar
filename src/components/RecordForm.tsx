"use client";
// Create/edit form for one record (suppliers, couriers, customers). The field
// list and validation come from src/lib/records.ts, shared with the API route.
// Submits JSON to /api/records/{table}; in demo mode the server validates and
// persists nothing, and the form says so.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RECORD_TABLES, recordFormValues, type FieldSpec } from "@/lib/records";

interface Props {
  table: string;
  /** Existing row for edit mode; omit to create. */
  row?: Record<string, unknown>;
  demoMode: boolean;
}

type Msg = { kind: "ok" | "error"; text: string } | null;

export default function RecordForm({ table, row, demoMode }: Props) {
  const spec = RECORD_TABLES[table];
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    row ? recordFormValues(table, row) : Object.fromEntries((spec?.fields ?? []).map((f) => [f.key, ""]))
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!spec) return null;
  const editing = row?.id != null;
  const prefix = `${table}-${editing ? String(row?.id) : "new"}`;

  function set(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!spec) return;
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { ...values };
    if (editing) body.id = String(row?.id);
    try {
      const res = await fetch(`/api/records/${table}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error ?? `Could not save (${res.status}).` });
      } else if (data.demo) {
        setMsg({
          kind: "ok",
          text: `Demo: would ${editing ? "update" : "create"} the ${spec.title.toLowerCase()}. Nothing was persisted.`,
        });
      } else {
        setMsg({ kind: "ok", text: `${spec.title} ${editing ? "updated" : "created"}.` });
        if (!editing) setValues(Object.fromEntries(spec.fields.map((f) => [f.key, ""])));
        startTransition(() => router.refresh());
      }
    } catch {
      setMsg({ kind: "error", text: "Network error. Nothing was saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 text-sm md:grid-cols-2">
      {spec.fields.map((f) => (
        <Field key={f.key} id={`${prefix}-${f.key}`} spec={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
      ))}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {editing ? "Save changes" : `Add ${spec.title.toLowerCase()}`}
        </button>
        {demoMode ? <span className="muted text-xs">Demo mode: nothing is persisted.</span> : null}
        {msg ? (
          <span
            role={msg.kind === "error" ? "alert" : "status"}
            className={msg.kind === "error" ? "text-red-700" : "text-emerald-700"}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Field({ id, spec, value, onChange }: { id: string; spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  if (spec.type === "boolean") {
    return (
      <label className="flex items-center gap-2 md:col-span-2" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === "yes"} onChange={(e) => onChange(e.target.checked ? "yes" : "")} />
        {spec.label}
      </label>
    );
  }
  return (
    <div className={spec.type === "textarea" ? "md:col-span-2" : undefined}>
      <label className="label" htmlFor={id}>
        {spec.label}
        {spec.required ? " *" : ""}
      </label>
      {spec.type === "textarea" ? (
        <textarea id={id} className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : spec.type === "select" ? (
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {spec.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="input"
          type={spec.type === "number" ? "number" : "text"}
          step={spec.type === "number" ? "any" : undefined}
          required={spec.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {spec.hint ? <p className="muted mt-0.5 text-xs">{spec.hint}</p> : null}
    </div>
  );
}

/** Collapsible wrapper so a record page can offer create/edit without reflowing its tables. */
export function RecordEditor({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="rounded-xl border border-stone-200 bg-white p-3" open={open}>
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
