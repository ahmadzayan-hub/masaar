"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";

export interface NavBadges {
  inbox: number;
  payments: number;
  disputes: number;
  attention: number;
  confirmations: number;
}

const NAV: { href: string; label: string; group: string; icon: string; badgeKey?: keyof NavBadges }[] = [
  { href: "/", label: "Dashboard", group: "Operate", icon: "■", badgeKey: "attention" },
  { href: "/intake", label: "New Conversation", group: "Operate", icon: "✎" },
  { href: "/confirmations", label: "WhatsApp Confirmations", group: "Operate", icon: "✓", badgeKey: "confirmations" },
  { href: "/inbox", label: "Customer Inbox", group: "Operate", icon: "✉", badgeKey: "inbox" },
  { href: "/customers", label: "Customers", group: "Records", icon: "♛" },
  { href: "/orders", label: "Orders", group: "Records", icon: "▤" },
  { href: "/payments", label: "Payments", group: "Records", icon: "₿", badgeKey: "payments" },
  { href: "/couriers", label: "Couriers & Delivery", group: "Records", icon: "↗" },
  { href: "/inventory", label: "Inventory", group: "Records", icon: "◫" },
  { href: "/offers", label: "Offers", group: "Records", icon: "✦" },
  { href: "/suppliers", label: "Suppliers", group: "Records", icon: "⊕" },
  { href: "/reviews", label: "Reviews", group: "Records", icon: "★" },
  { href: "/reports", label: "Reports & Reviews", group: "Insight", icon: "▥" },
  { href: "/settings", label: "Settings", group: "Admin", icon: "⚙" },
  { href: "/prompts", label: "Prompt Management", group: "Admin", icon: "≡" },
  { href: "/audit", label: "Audit Log", group: "Admin", icon: "⌖" },
];

const DEFAULT_BADGES: NavBadges = { inbox: 0, payments: 0, disputes: 0, attention: 0, confirmations: 0 };

export default function Nav({ mobile, badges = DEFAULT_BADGES }: { mobile?: boolean; badges?: NavBadges }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (mobile) {
    return (
      <div className="card p-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-semibold"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[color:rgb(var(--gold-deep))] to-[color:rgb(var(--gold))] text-[11px] font-semibold text-white">BS</span>
            <span>Beyond Style UAE</span>
            {badges.attention > 0 && (
              <span className="badge badge-vip" aria-label={`${badges.attention} items need attention`}>{badges.attention}</span>
            )}
          </span>
          <span className="text-stone-400">{open ? "▲" : "▼"}</span>
        </button>
        {open && <NavList pathname={pathname} onNav={() => setOpen(false)} badges={badges} />}
      </div>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-5 p-4 text-sm">
      <Link href="/" className="flex items-center gap-2.5 px-1 py-1">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[color:rgb(var(--gold-deep))] to-[color:rgb(var(--gold))] text-sm font-semibold text-white shadow-sm">BS</span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-[color:rgb(var(--ink))]">Beyond Style UAE</span>
          <span className="block text-[11px] text-stone-400">Order Control Console</span>
        </span>
      </Link>
      <NavList pathname={pathname} badges={badges} />
      <div className="card-accent mt-auto p-3 text-xs">
        <div className="font-semibold text-[color:rgb(var(--gold-deep))]">AI drafts. You approve.</div>
        <div className="mt-1 text-stone-600">
          Every customer reply is guardrail-checked. Owner approval gates everything that touches
          money, dispatch, or claims.
        </div>
      </div>
    </nav>
  );
}

function NavList({ pathname, onNav, badges }: { pathname: string; onNav?: () => void; badges: NavBadges }) {
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g}>
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{g}</div>
          <div className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === g).map((n) => {
              const active = pathname === n.href;
              const count = n.badgeKey ? badges[n.badgeKey] : 0;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNav}
                  className={clsx(
                    "group relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors",
                    active
                      ? "bg-[color:rgb(var(--ink))] text-white shadow-sm"
                      : "text-stone-600 hover:bg-[color:rgba(var(--gold),0.10)] hover:text-[color:rgb(var(--ink))]"
                  )}
                >
                  {active && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[color:rgb(var(--gold-soft))]" aria-hidden />
                  )}
                  <span className="flex items-center gap-2.5">
                    <span className={clsx("w-4 text-center text-xs", active ? "text-[color:rgb(var(--gold-soft))]" : "text-stone-400 group-hover:text-[color:rgb(var(--gold-deep))]")}>{n.icon}</span>
                    <span>{n.label}</span>
                  </span>
                  {count > 0 && (
                    <span
                      className={clsx(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        active ? "bg-white/20 text-white" : "bg-[color:rgba(var(--gold),0.14)] text-[color:rgb(var(--gold-deep))]"
                      )}
                      aria-label={`${count} items`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
