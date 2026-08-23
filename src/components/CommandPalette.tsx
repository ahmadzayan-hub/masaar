"use client";
// ⌘K / Ctrl+K command palette: navigate + create, keyboard-first.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Command {
  label: string;
  hint: string;
  href: string;
  keywords: string;
}

const COMMANDS: Command[] = [
  { label: "Go to Mission Control", hint: "Home", href: "/", keywords: "home dashboard mission control today" },
  { label: "Create order / conversation", hint: "New", href: "/intake", keywords: "new order lead conversation intake create" },
  { label: "Open orders pipeline", hint: "Orders", href: "/orders", keywords: "orders pipeline stages" },
  { label: "Orders needing confirmation", hint: "Filter", href: "/orders?stage=lead", keywords: "lead confirm qualify" },
  { label: "Orders awaiting payment", hint: "Filter", href: "/orders?stage=confirmed", keywords: "payment awaiting confirmed" },
  { label: "Orders in production", hint: "Filter", href: "/orders?stage=production", keywords: "production manufacturing workshop" },
  { label: "Orders in QC", hint: "Filter", href: "/orders?stage=qc", keywords: "qc quality check" },
  { label: "Customer inbox", hint: "Inbox", href: "/inbox", keywords: "inbox conversations replies hot leads" },
  { label: "WhatsApp confirmations", hint: "Confirm", href: "/confirmations", keywords: "whatsapp confirmation token" },
  { label: "Payments", hint: "Records", href: "/payments", keywords: "payments verification refunds" },
  { label: "Couriers & delivery", hint: "Records", href: "/couriers", keywords: "courier delivery dispatch" },
  { label: "Inventory", hint: "Records", href: "/inventory", keywords: "inventory stock reservation" },
  { label: "Customers", hint: "Records", href: "/customers", keywords: "customers crm segments" },
  { label: "Reports & reviews", hint: "Insight", href: "/reports", keywords: "reports analytics daily review" },
  { label: "Audit log", hint: "Admin", href: "/audit", keywords: "audit trail history events" },
  { label: "Settings", hint: "Admin", href: "/settings", keywords: "settings configuration" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
    );
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    close();
    router.push(cmd.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[color:rgb(var(--hairline))] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[active]);
            }
          }}
          placeholder="Search or jump to… (orders, payments, create…)"
          aria-label="Search commands"
          className="w-full border-b border-[color:rgb(var(--hairline))] px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">No matches — try “orders” or “payments”.</li>
          )}
          {results.map((c, i) => (
            <li key={c.href + c.label} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${i === active ? "bg-stone-100" : ""}`}
              >
                <span>{c.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-400">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-[color:rgb(var(--hairline))] px-4 py-2 text-[10px] text-gray-400">
          ↑↓ navigate · Enter open · Esc close
        </div>
      </div>
    </div>
  );
}
