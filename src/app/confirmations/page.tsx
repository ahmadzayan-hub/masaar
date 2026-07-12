"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Kpi } from "@/components/ui";

type Status = "awaiting" | "confirmed" | "declined" | "edit_requested" | "expired";

interface Item {
  token: string;
  orderId?: string | null;
  customerName?: string | null;
  phone: string;
  status: Status;
  orderSummary?: string | null;
  attempts: number;
  createdAt: string;
  respondedAt?: string | null;
}

const STATUS_BADGE: Record<Status, string> = {
  awaiting: "badge-warn",
  confirmed: "badge-pass",
  declined: "badge-fail",
  edit_requested: "badge-info",
  expired: "badge-neutral",
};

const STATUS_LABEL: Record<Status, string> = {
  awaiting: "Awaiting",
  confirmed: "Confirmed",
  declined: "Cancelled",
  edit_requested: "Edit asked",
  expired: "Expired",
};

const REFRESH_MS = 5000;

export default function ConfirmationsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storage, setStorage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const liveRef = useRef(live);
  liveRef.current = live;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/confirmations", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items);
      setCounts(data.counts);
      setStorage(data.storage);
      setUpdatedAt(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (liveRef.current) load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  async function resend(token: string) {
    setBusy(token);
    try {
      const res = await fetch(`/api/confirmations/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Resend failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const awaiting = counts.awaiting ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="WhatsApp Confirmations"
        subtitle="Live order-confirmation queue. Orders are held until the customer confirms on WhatsApp."
        action={
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live
            </label>
            <button className="btn btn-ghost" onClick={load}>Refresh</button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Awaiting" value={awaiting} hint="held for customer reply" />
        <Kpi label="Confirmed" value={counts.confirmed ?? 0} hint="released to prep" />
        <Kpi label="Edit asked" value={counts.edit_requested ?? 0} />
        <Kpi label="Cancelled" value={counts.declined ?? 0} />
        <Kpi label="Expired" value={counts.expired ?? 0} hint="T+24 no reply" />
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
        <span>
          Storage: <strong>{storage || "…"}</strong>
          {storage === "memory" && " (dev — configure Supabase for durable state)"}
        </span>
        <span>{updatedAt && `Updated ${updatedAt}`}{live ? " · auto every 5s" : " · paused"}</span>
      </div>

      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Attempts</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  No confirmations yet. They appear here the moment a customer submits the form.
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.token} className="border-b border-gray-100">
                <td className="px-3 py-2">{it.customerName || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.phone}</td>
                <td className="px-3 py-2">
                  <div>{it.orderSummary || "—"}</div>
                  {it.orderId && <div className="text-[11px] text-gray-400">{it.orderId}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className={`badge ${STATUS_BADGE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                </td>
                <td className="px-3 py-2">{it.attempts}/3</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2 text-right">
                  {it.status === "awaiting" && (
                    <button
                      className="btn btn-ghost text-xs"
                      disabled={busy === it.token || it.attempts >= 3}
                      onClick={() => resend(it.token)}
                      title={it.attempts >= 3 ? "Max 3 attempts reached" : "Resend WhatsApp confirmation"}
                    >
                      {busy === it.token ? "Sending…" : "Resend"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
