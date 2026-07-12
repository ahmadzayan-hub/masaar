"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { StagePill, TempPill } from "@/components/ui";

type Row = Record<string, unknown>;

const STAGE_OPTIONS = ["all", "hot_lead", "payment_stage", "price_lead", "warm_lead", "cold_lead", "complaint_stage"] as const;
const TEMP_OPTIONS = ["all", "hot", "warm", "cold"] as const;

export default function InboxClient({
  conversations, aiOutputs, orders, customers,
}: { conversations: Row[]; aiOutputs: Row[]; orders: Row[]; customers: Row[] }) {
  const [stage, setStage] = useState<(typeof STAGE_OPTIONS)[number]>("all");
  const [temp, setTemp] = useState<(typeof TEMP_OPTIONS)[number]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>((conversations[0]?.id as string) ?? null);
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<Row | null>(null);

  const filtered = useMemo(
    () => conversations.filter((c) => {
      if (stage !== "all" && c.stage !== stage) return false;
      if (temp !== "all" && c.lead_temperature !== temp) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${c.customer_name} ${c.message_text}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    }),
    [conversations, stage, temp, search]
  );

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0];
  const aiDraft = useMemo(
    () => aiOutputs.find((a) => a.conversation_id === selected?.id),
    [aiOutputs, selected]
  );
  const customer = useMemo(
    () => customers.find((c) => c.id === selected?.customer_id),
    [customers, selected]
  );
  const customerOrders = useMemo(
    () => orders.filter((o) => o.customer_id === selected?.customer_id),
    [orders, selected]
  );

  async function runLiveAnalysis() {
    if (!selected) return;
    setLiveLoading(true);
    setLiveError(null);
    setLiveResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerMessage: selected.message_text,
          context: {
            language: selected.message_language ?? "en",
            customerNameDisplay: selected.customer_name ?? null,
            customerNameArabicVerified: customer?.name_arabic_verified ?? null,
            emirate: null,
            activeOffers: [],
            inventory: [],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setLiveResult(data);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
      {/* Left: list */}
      <div className="card flex max-h-[78vh] flex-col p-0">
        <div className="border-b border-gray-100 p-3">
          <input
            className="input"
            placeholder="Search messages / customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <select className="input !py-1 !text-xs" value={stage} onChange={(e) => setStage(e.target.value as never)}>
              {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All stages" : s.replace(/_/g, " ")}</option>)}
            </select>
            <select className="input !py-1 !text-xs" value={temp} onChange={(e) => setTemp(e.target.value as never)}>
              {TEMP_OPTIONS.map((t) => <option key={t} value={t}>{t === "all" ? "All temps" : t}</option>)}
            </select>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="p-6 text-center text-sm text-gray-400">No conversations match.</li>
          )}
          {filtered.map((c) => {
            const active = c.id === selected?.id;
            return (
              <li key={c.id as string}>
                <button
                  onClick={() => { setSelectedId(c.id as string); setLiveResult(null); setLiveError(null); setApproved(false); }}
                  className={clsx(
                    "flex w-full flex-col gap-1 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50",
                    active && "bg-pink-50/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{c.customer_name as string}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">{c.when as string}</span>
                  </div>
                  <p className={clsx(
                    "truncate text-xs text-gray-600",
                    c.message_language === "ar" && "rtl"
                  )}>{c.message_text as string}</p>
                  <div className="flex items-center gap-1 text-[11px]">
                    <TempPill temp={c.lead_temperature as string} />
                    <StagePill stage={c.stage as string} />
                    <span className="text-gray-400">{c.platform as string}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Right: detail */}
      <div className="flex flex-col gap-4">
        {!selected ? (
          <div className="card text-sm text-gray-500">Select a conversation to see the AI draft, guardrails, and customer history.</div>
        ) : (
          <>
            <div className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{selected.customer_name as string}</div>
                  <div className="text-xs text-gray-500">
                    {selected.platform as string} · {selected.when as string}
                    {customer?.vip ? <span className="badge badge-vip ml-2">VIP</span> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <StagePill stage={selected.stage as string} />
                  <TempPill temp={selected.lead_temperature as string} />
                </div>
              </div>
              <p className={clsx(
                "rounded-xl bg-gray-50 p-3 text-sm",
                selected.message_language === "ar" && "rtl"
              )}>{selected.message_text as string}</p>
              <p className="mt-2 text-xs text-gray-500">Intent: {selected.intent as string}</p>
            </div>

            <div className="card">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="h2">AI draft reply</h3>
                <button
                  className="btn btn-soft btn-sm"
                  disabled={liveLoading}
                  onClick={runLiveAnalysis}
                >
                  {liveLoading ? "Analyzing…" : "Re-analyze with live AI"}
                </button>
              </div>
              {liveError && <p className="mb-2 text-xs text-red-700">{liveError}</p>}
              {liveResult ? (
                <LiveAnalysis result={liveResult} />
              ) : aiDraft ? (
                <CachedDraft aiDraft={aiDraft} approved={approved} setApproved={setApproved} copied={copied} setCopied={setCopied} />
              ) : (
                <p className="text-sm text-gray-500">
                  No draft yet. Click <em>Re-analyze with live AI</em> to generate one — works even without an API key
                  (mock provider returns a safe placeholder).
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="card">
                <h3 className="h2 mb-2">Customer record</h3>
                {customer ? (
                  <dl className="grid grid-cols-1 gap-1 text-sm">
                    <Row k="Display name" v={(customer.name_display as string) ?? "—"} />
                    <Row k="Arabic verified" v={(customer.name_arabic_verified as string) ?? "—"} />
                    <Row k="Language" v={customer.language as string} />
                    <Row k="Segment" v={customer.segment as string} />
                    <Row k="Purchases" v={String(customer.purchase_count ?? 0)} />
                    <Row k="Consent" v={customer.consent_status as string} />
                  </dl>
                ) : (
                  <p className="text-sm text-gray-500">No linked customer.</p>
                )}
              </div>
              <div className="card">
                <h3 className="h2 mb-2">Order history</h3>
                {customerOrders.length === 0 ? (
                  <p className="text-sm text-gray-500">No orders yet for this customer.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {customerOrders.slice(0, 4).map((o) => (
                      <li key={o.id as string} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1">
                        <span className="truncate">{o.product_summary as string}</span>
                        <span className="shrink-0 text-xs text-gray-500">AED {String(o.total_amount)} · {o.order_status as string}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CachedDraft({
  aiDraft, approved, setApproved, copied, setCopied,
}: { aiDraft: Row; approved: boolean; setApproved: (v: boolean) => void; copied: boolean; setCopied: (v: boolean) => void }) {
  const draft = aiDraft.reply_draft as string;
  const guard = aiDraft.guardrails_json as Record<string, unknown> | null;
  const worst = (guard?.worstStatus as string) ?? "pass";
  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm">{draft}</p>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={clsx("badge", worst === "pass" ? "badge-pass" : worst === "warn" ? "badge-warn" : "badge-fail")}>
          guardrails {worst}
        </span>
        <span className="text-gray-400">confidence {Math.round(Number(aiDraft.confidence_score) * 100)}%</span>
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button
          className={clsx("btn btn-sm", approved ? "btn-soft" : "btn-primary")}
          onClick={() => setApproved(true)}
        >
          {approved ? "Approved ✓" : "Approve to send"}
        </button>
      </div>
    </div>
  );
}

function LiveAnalysis({ result }: { result: Row }) {
  const analysis = result.analysis as Record<string, unknown>;
  const guardrails = result.guardrails as { worstStatus: string; findings: { code: string; status: string; message: string }[]; revisedReply?: string };
  const reply = (guardrails?.revisedReply ?? (analysis?.best_reply_to_send as string)) ?? "(no reply)";
  return (
    <div className="flex flex-col gap-3">
      <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm">{reply}</p>
      <div className="text-xs text-gray-500">
        <strong>Next action:</strong> {analysis?.next_action as string} · <strong>Follow-up:</strong> {analysis?.follow_up_timing as string}
      </div>
      <div className="flex flex-col gap-1 text-xs">
        <span className={clsx("badge w-fit", guardrails.worstStatus === "pass" ? "badge-pass" : guardrails.worstStatus === "warn" ? "badge-warn" : "badge-fail")}>
          guardrails {guardrails.worstStatus}
        </span>
        {(guardrails.findings ?? []).map((f, i) => (
          <span key={i} className="text-gray-600">· <strong>{f.code}</strong> {f.message}</span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">model: {String(result.provider)} / {String(result.model)}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2"><dt className="w-32 shrink-0 text-gray-500">{k}</dt><dd>{v}</dd></div>
  );
}
