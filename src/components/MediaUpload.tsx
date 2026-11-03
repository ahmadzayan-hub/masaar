"use client";
// Upload one file to the private media bucket with an explicit classification.
// Nothing is uploaded without a classification; a customer's private order
// photo is always recorded as private data.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_BYTES,
  MEDIA_CLASSIFICATIONS,
  MEDIA_CLASSIFICATION_LABELS,
  type MediaClassification,
} from "@/lib/media";

type Msg = { kind: "ok" | "error"; text: string } | null;

export default function MediaUpload({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<MediaClassification>("unclear");
  const [privateData, setPrivateData] = useState(false);
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const forcedPrivate = classification === "customer_private_order_photo";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const body = new FormData();
    body.set("file", file);
    body.set("photo_classification", classification);
    body.set("contains_private_data", privateData || forcedPrivate ? "yes" : "");
    body.set("description", description);
    body.set("order_id", orderId);
    try {
      const res = await fetch("/api/media", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ kind: "error", text: data.error ?? `Upload failed (${res.status}).` });
      else if (data.demo) setMsg({ kind: "ok", text: `Demo: would store ${data.asset?.file_url ?? file.name}. Nothing was persisted.` });
      else {
        setMsg({ kind: "ok", text: "Stored in the private media bucket." });
        setFile(null);
        setDescription("");
        setOrderId("");
        startTransition(() => router.refresh());
      }
    } catch {
      setMsg({ kind: "error", text: "Network error. Nothing was uploaded." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 text-sm md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label" htmlFor="media-file">File</label>
        <input
          id="media-file"
          type="file"
          className="text-sm"
          accept={Object.keys(ALLOWED_MEDIA_TYPES).join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="muted mt-0.5 text-xs">Images, MP4 or PDF, up to {MAX_MEDIA_BYTES / (1024 * 1024)} MB.</p>
      </div>
      <div>
        <label className="label" htmlFor="media-classification">Classification *</label>
        <select
          id="media-classification"
          className="input"
          value={classification}
          onChange={(e) => setClassification(e.target.value as MediaClassification)}
        >
          {MEDIA_CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {MEDIA_CLASSIFICATION_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="media-order">Order id (optional)</label>
        <input id="media-order" className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="uuid" />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="media-description">Description</label>
        <input id="media-description" className="input" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 md:col-span-2">
        <input
          type="checkbox"
          checked={privateData || forcedPrivate}
          disabled={forcedPrivate}
          onChange={(e) => setPrivateData(e.target.checked)}
        />
        Contains private data{forcedPrivate ? " (always, for a customer's order photo)" : ""}
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy || !file}>
          Upload
        </button>
        {demoMode ? <span className="muted text-xs">Demo mode: nothing is persisted.</span> : null}
        {msg ? (
          <span role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "text-red-700" : "text-emerald-700"}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
