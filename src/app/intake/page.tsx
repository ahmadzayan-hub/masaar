"use client";
import { useState } from "react";
import AnalysisPanel from "@/components/AnalysisPanel";
import type { Language, Platform, ReplyContext } from "@/lib/types";

export default function IntakePage() {
  const [form, setForm] = useState({
    customerName: "",
    platform: "instagram" as Platform,
    language: "en" as Language,
    message: "",
    productShown: "",
    emirate: "",
    knownPrice: "",
    knownDelivery: "",
    stockAvailable: false,
    paymentStatus: "none",
    courierConfirmed: false,
    vatApplicable: false,
    notes: "",
  });
  const [imageData, setImageData] = useState<{ mimeType: string; dataBase64: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Privacy pre-check on the pasted message (§31 privacy warning).
  const privacyWarning =
    /(?:\+?971|0)\s?5\d/.test(form.message) ||
    /\b(villa|building|apartment|street|p\.?o\.?\s?box|makani)\b/i.test(form.message);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setImageData({ mimeType: file.type, dataBase64: b64 });
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    const context: ReplyContext = {
      language: form.language,
      customerNameDisplay: form.customerName || null,
      customerNameArabicVerified: null,
      emirate: form.emirate || null,
      quotedPrice: form.knownPrice ? Number(form.knownPrice) : null,
      quotedDeliveryCost: form.knownDelivery ? Number(form.knownDelivery) : null,
      vatApplicable: form.vatApplicable,
      paymentStatus: form.paymentStatus as any,
      courierConfirmed: form.courierConfirmed,
      stockKnownAvailable: form.stockAvailable,
      activeOffers: [],
      inventory: [],
    };
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerMessage: form.message,
          context,
          images: imageData ? [imageData] : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-xl font-semibold">New Conversation</h1>
      <p className="mb-4 text-sm text-gray-500">
        Paste the customer message and known facts. The agent drafts a reply — you approve before sending.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Customer name (display)</label>
              <input className="input" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
            </div>
            <div>
              <label className="label">Platform</label>
              <select className="input" value={form.platform} onChange={(e) => set("platform", e.target.value as Platform)}>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="tiktok">TikTok</option>
                <option value="meta_ads">Meta Ads</option>
                <option value="comment">Comment</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Language</label>
              <select className="input" value={form.language} onChange={(e) => set("language", e.target.value as Language)}>
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="label">Emirate (if known)</label>
              <input className="input" value={form.emirate} onChange={(e) => set("emirate", e.target.value)} placeholder="Dubai / Sharjah / Al Ain…" />
            </div>
          </div>

          <div>
            <label className="label">Customer message</label>
            <textarea className="input min-h-[120px]" value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Paste the DM / WhatsApp message…" />
            {privacyWarning && (
              <p className="mt-1 text-xs text-red-700">
                ⚠ This message appears to contain a phone number or address. Keep private data out of any public reply.
              </p>
            )}
          </div>

          <div>
            <label className="label">Product / ad shown (optional)</label>
            <input className="input" value={form.productShown} onChange={(e) => set("productShown", e.target.value)} />
          </div>

          <div>
            <label className="label">Screenshot / product photo (optional)</label>
            <input type="file" accept="image/*" onChange={onFile} className="text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Known price (AED)</label>
              <input className="input" value={form.knownPrice} onChange={(e) => set("knownPrice", e.target.value)} />
            </div>
            <div>
              <label className="label">Known delivery (AED)</label>
              <input className="input" value={form.knownDelivery} onChange={(e) => set("knownDelivery", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.stockAvailable} onChange={(e) => set("stockAvailable", e.target.checked)} /> Stock confirmed available</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.courierConfirmed} onChange={(e) => set("courierConfirmed", e.target.checked)} /> Courier cost confirmed</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.vatApplicable} onChange={(e) => set("vatApplicable", e.target.checked)} /> VAT applicable</label>
            <div>
              <label className="label">Payment status</label>
              <select className="input" value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}>
                <option value="none">None</option>
                <option value="link_sent">Link sent</option>
                <option value="needs_verification">Needs verification</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
          </div>

          <button className="btn btn-primary self-start" onClick={analyze} disabled={loading || !form.message}>
            {loading ? "Analyzing…" : "Analyze & draft reply"}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        <div>
          {result ? (
            <AnalysisPanel result={result} />
          ) : (
            <div className="card text-sm text-gray-500">
              The structured analysis, guardrail checks, and a ready-to-send reply will appear here after you analyze.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
