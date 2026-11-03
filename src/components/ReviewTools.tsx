"use client";
// Review collection tools for one delivered order: record that the request was
// sent manually (one per order) and capture the review the customer gave.
// No message is sent from here. Public-sharing permission is recorded only
// when the operator confirms the customer explicitly said yes.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CopyDraft from "@/components/CopyDraft";
import { REVIEW_CHANNELS, REVIEW_REQUEST_LABELS, type ReviewRequestState } from "@/lib/operator-productivity";

interface Props {
  orderId: string;
  draft: string;
  state: ReviewRequestState;
  demoMode: boolean;
}

type Msg = { kind: "ok" | "error"; text: string } | null;

async function post(url: string, body: unknown): Promise<{ ok: boolean; demo?: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, demo: data.demo, error: data.error ?? (res.ok ? undefined : `failed (${res.status})`) };
}

export default function ReviewTools({ orderId, draft, state, demoMode }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [channel, setChannel] = useState<(typeof REVIEW_CHANNELS)[number]>("whatsapp");
  const [rating, setRating] = useState("5");
  const [feedback, setFeedback] = useState("");
  const [share, setShare] = useState(false);
  const [story, setStory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function markRequested() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post("/api/reviews/requests", { order_id: orderId, channel });
      if (!r.ok) setMsg({ kind: "error", text: r.error ?? "Could not record the request." });
      else {
        setMsg({ kind: "ok", text: r.demo ? "Demo: would record the request. Nothing was persisted." : "Request recorded." });
        if (!r.demo) startTransition(() => router.refresh());
      }
    } catch {
      setMsg({ kind: "error", text: "Network error. Nothing was recorded." });
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post("/api/reviews", {
        order_id: orderId,
        rating,
        feedback,
        permission_to_share: share ? "yes" : "",
        story_mention: story ? "yes" : "",
      });
      if (!r.ok) setMsg({ kind: "error", text: r.error ?? "Could not capture the review." });
      else {
        setMsg({ kind: "ok", text: r.demo ? "Demo: would capture the review. Nothing was persisted." : "Review captured." });
        if (!r.demo) startTransition(() => router.refresh());
      }
    } catch {
      setMsg({ kind: "error", text: "Network error. Nothing was recorded." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={state.eligible ? "badge badge-info" : "badge badge-neutral"}>
          {REVIEW_REQUEST_LABELS[state.reason]}
          {state.channel ? ` · ${state.channel}` : ""}
        </span>
      </div>

      {state.eligible ? (
        <div className="flex flex-col gap-2">
          <p className="my-1">{draft}</p>
          <div className="flex flex-wrap items-center gap-2">
            <CopyDraft text={draft} />
            <label className="label mb-0" htmlFor={`channel-${orderId}`}>Sent via</label>
            <select
              id={`channel-${orderId}`}
              className="input w-auto"
              value={channel}
              onChange={(e) => setChannel(e.target.value as (typeof REVIEW_CHANNELS)[number])}
            >
              {REVIEW_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button type="button" className="btn btn-accent" disabled={busy} onClick={markRequested}>
              Mark as sent
            </button>
          </div>
        </div>
      ) : null}

      {state.reason !== "already_reviewed" ? (
        <details className="rounded-xl border border-stone-200 p-3">
          <summary className="cursor-pointer font-medium">Capture the customer&apos;s review</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div>
              <label className="label" htmlFor={`rating-${orderId}`}>Rating (1-5)</label>
              <input
                id={`rating-${orderId}`}
                className="input"
                type="number"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor={`feedback-${orderId}`}>Feedback, as the customer wrote it</label>
              <textarea
                id={`feedback-${orderId}`}
                className="input"
                rows={3}
                maxLength={2000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
              The customer explicitly said yes to public sharing
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={story} onChange={(e) => setStory(e.target.checked)} />
              Customer mentioned us in a story
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={busy || feedback.trim().length === 0}
            onClick={capture}
          >
            Save review
          </button>
          <p className="muted mt-2 text-xs">
            Permission to share is recorded only from the customer&apos;s own explicit yes. It is never inferred from a reply.
            {demoMode ? " Demo mode: nothing is persisted." : ""}
          </p>
        </details>
      ) : null}

      {msg ? (
        <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "text-red-700" : "text-emerald-700"}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
