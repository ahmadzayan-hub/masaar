"use client";
import { useState } from "react";
import clsx from "clsx";
import type { AnalysisOutput, GuardrailResult } from "@/lib/types";

interface Result {
  analysis: AnalysisOutput;
  guardrails: GuardrailResult;
  provider: string;
  model: string;
}

function StatusBadge({ status }: { status: "pass" | "warn" | "fail" }) {
  return (
    <span className={clsx("badge", `badge-${status}`)}>{status.toUpperCase()}</span>
  );
}

export default function AnalysisPanel({ result }: { result: Result }) {
  const { analysis, guardrails } = result;
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);

  const reply = guardrails.revisedReply ?? analysis.best_reply_to_send;
  const canSend = guardrails.worstStatus !== "fail";

  return (
    <div className="flex flex-col gap-4">
      {/* Privacy / risk banner */}
      {guardrails.requiresHumanApproval && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Owner approval required before sending. Review the guardrail findings below.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold">Analysis</h3>
          <dl className="grid grid-cols-1 gap-1 text-sm">
            <Row k="Intent" v={analysis.customer_intent} />
            <Row k="Lead temperature" v={analysis.lead_temperature} />
            <Row k="Persona" v={analysis.customer_persona} />
            <Row k="Product" v={analysis.product_identified} />
            <Row k="Name check" v={analysis.name_check} />
            <Row k="Arabic name" v={analysis.correct_arabic_name ?? "—"} />
            <Row k="Missing info" v={analysis.missing_information.join(", ") || "—"} />
            <Row k="Next action" v={analysis.next_action} />
            <Row k="Follow-up" v={analysis.follow_up_timing} />
            <Row k="Confidence" v={`${Math.round(analysis.confidence_score * 100)}%`} />
          </dl>
          {analysis.risk_or_caution.length > 0 && (
            <div className="mt-2 text-xs text-red-700">
              ⚠ {analysis.risk_or_caution.join(" · ")}
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {result.provider} / {result.model}
          </p>
        </div>

        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Guardrails</h3>
            <StatusBadge status={guardrails.worstStatus} />
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {guardrails.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <StatusBadge status={f.status} />
                <span className="text-gray-700">
                  <span className="font-medium">{f.code}</span>: {f.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Reply to send {guardrails.revisedReply && "(auto-corrected)"}</h3>
          <button
            className="btn btn-ghost"
            onClick={() => {
              navigator.clipboard.writeText(reply);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm">{reply}</p>
        <p className="mt-2 text-xs text-gray-500">Internal note: {analysis.internal_sales_note}</p>

        <div className="mt-3 flex items-center gap-2">
          <button
            disabled={!canSend}
            onClick={() => setApproved(true)}
            className={clsx("btn", canSend ? "btn-primary" : "btn-ghost cursor-not-allowed opacity-50")}
          >
            {approved ? "Approved ✓" : "Approve to send"}
          </button>
          {!canSend && (
            <span className="text-xs text-red-700">
              Blocked by a failing guardrail — fix the reply before approving.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-gray-500">{k}</dt>
      <dd className="text-gray-900">{v}</dd>
    </div>
  );
}
