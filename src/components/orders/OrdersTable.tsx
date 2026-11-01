"use client";
// Searchable, filterable, sortable "All orders" table.
// Rows arrive pre-formatted from the server page; this component only narrows
// and orders what the server already returned. It never changes order data.
import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { OrderStatusPill, PaymentStatusPill, CourierStatusPill } from "@/components/ui";

export interface OrderRowView {
  id: string;
  product: string;
  customer: string;
  city: string;
  area: string;
  totalAed: number;
  totalLabel: string;
  orderStatus: string;
  paymentStatus: string;
  courierStatus: string;
  eta: string;
  createdAt: string;
  createdLabel: string;
}

type SortKey = "createdAt" | "totalAed" | "customer";
type SortDir = "asc" | "desc";

const PAYMENT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All payments" },
  { key: "none", label: "None" },
  { key: "link_sent", label: "Link sent" },
  { key: "needs_verification", label: "Needs verification" },
  { key: "confirmed", label: "Confirmed" },
  { key: "refunded", label: "Refunded" },
];

export function OrdersTable({ rows }: { rows: OrderRowView[] }) {
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (payment !== "all" && r.paymentStatus !== payment) return false;
      if (!q) return true;
      return [r.product, r.customer, r.city, r.area].some((v) => v.toLowerCase().includes(q));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      return av < bv ? -dir : dir;
    });
  }, [rows, query, payment, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "customer" ? "asc" : "desc");
    }
  }

  function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (key !== sortKey) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  function SortButton({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = k === sortKey;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={clsx(
          "inline-flex items-center gap-1 uppercase tracking-[0.12em] hover:text-[color:rgb(var(--ink))]",
          active && "text-[color:rgb(var(--gold-deep))]"
        )}
      >
        {children}
        <span aria-hidden className="text-[9px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    );
  }

  const filtersActive = query.trim() !== "" || payment !== "all";

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="orders-search">Search orders</label>
        <input
          id="orders-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product, customer, city or area"
          className="input sm:max-w-xs"
        />
        <label className="sr-only" htmlFor="orders-payment">Filter by payment status</label>
        <select
          id="orders-payment"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          className="input sm:w-48"
        >
          {PAYMENT_FILTERS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <span className="text-xs text-stone-500 sm:ml-auto" aria-live="polite">
          Showing {visible.length} of {rows.length}
        </span>
        {filtersActive && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setQuery(""); setPayment("all"); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:rgb(var(--hairline))] bg-white/50 p-8 text-center text-sm text-stone-500">
          <div className="font-medium text-[color:rgb(var(--ink))]">No orders match these filters</div>
          <div className="mt-1">Try a different search term or clear the filters.</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th aria-sort={ariaSort("customer")}><SortButton k="customer">Customer</SortButton></th>
                <th>City</th>
                <th aria-sort={ariaSort("totalAed")}><SortButton k="totalAed">Total</SortButton></th>
                <th>Status</th><th>Payment</th><th>Courier</th><th>ETA</th>
                <th aria-sort={ariaSort("createdAt")}><SortButton k="createdAt">When</SortButton></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id}>
                  <td className="font-medium"><Link href={`/orders/${o.id}`} className="hover:underline">{o.product}</Link></td>
                  <td>{o.customer}</td>
                  <td>{o.city} <span className="text-xs text-gray-400">{o.area}</span></td>
                  <td className="tabular-nums">{o.totalLabel}</td>
                  <td><OrderStatusPill status={o.orderStatus} /></td>
                  <td><PaymentStatusPill status={o.paymentStatus} /></td>
                  <td><CourierStatusPill status={o.courierStatus} /></td>
                  <td className="whitespace-nowrap text-xs text-gray-500">{o.eta}</td>
                  <td className="whitespace-nowrap text-xs text-gray-500">{o.createdLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
