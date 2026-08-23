"use client";
// Role-aware lifecycle actions. Status changes are consequential, so there is
// no optimistic update: the button shows a pending state, the API (backed by
// advance_order_status) decides, and the page refreshes with the audited truth.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_LABELS,
  nextStatusesFor,
  eventForTransition,
  type AppRole,
  type OrderStatus,
} from "@/lib/orders/lifecycle";
import clsx from "clsx";

interface Props {
  orderId: string;
  status: OrderStatus;
  role: AppRole;
  demoMode: boolean;
}

export function OrderActions({ orderId, status, role, demoMode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const targets = nextStatusesFor(role, status);

  async function advance(to: OrderStatus) {
    setBusy(to);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `Transition failed (${res.status})` });
        return;
      }
      const event = body.event ?? eventForTransition(to);
      setMessage({
        kind: "ok",
        text: demoMode
          ? `Demo: would move to ${STATUS_LABELS[to].en}${event ? ` and emit ${event}` : ""}. Nothing was persisted.`
          : `Moved to ${STATUS_LABELS[to].en}${event ? ` · event ${event} emitted` : ""}.`,
      });
      if (!demoMode) startTransition(() => router.refresh());
    } catch {
      setMessage({ kind: "error", text: "Network error — the order was not changed. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (targets.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        {status === "delivered" || status === "after_sales" || status === "cancelled"
          ? "This order is in a terminal stage — no further transitions."
          : `Your role (${role}) cannot advance an order from “${STATUS_LABELS[status].en}”.`}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {targets.map((to) => (
          <button
            key={to}
            type="button"
            disabled={busy !== null || isPending}
            onClick={() => advance(to)}
            className={clsx(
              "btn btn-sm",
              to === "cancelled" ? "btn-ghost text-red-700" : "btn-primary",
              (busy !== null || isPending) && "opacity-60",
            )}
          >
            {busy === to ? "Working…" : `→ ${STATUS_LABELS[to].en}`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Acting as <b>{role}</b> · every transition is validated, audited and emits its domain event.
      </p>
      {message && (
        <p
          role="status"
          className={clsx(
            "mt-2 rounded-lg px-3 py-2 text-xs",
            message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
