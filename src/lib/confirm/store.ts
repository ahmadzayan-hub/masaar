// Confirmation store for the WhatsApp order-confirmation gate.
//
// Production path: Supabase (service-role) table `order_confirmations`
// (see supabase/migrations/0003_order_confirmations.sql).
// Fallback path: an in-memory Map so the webhook works on a fresh checkout and in
// tests. NOTE: in-memory state does NOT survive across serverless invocations —
// configure Supabase for real deployments. `usingMemory()` reports which is active.

import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export type ConfirmationStatus =
  | "awaiting"
  | "confirmed"
  | "declined"
  | "edit_requested"
  | "expired";

export interface ConfirmationRecord {
  token: string;
  orderId?: string | null;
  customerName?: string | null;
  phone: string; // E.164
  email?: string | null;
  orderSummary?: string | null;
  status: ConfirmationStatus;
  lead?: Record<string, unknown> | null;
  channel: string;
  attempts: number;
  createdAt: string;
  respondedAt?: string | null;
  rawReply?: Record<string, unknown> | null;
}

const TABLE = "order_confirmations";

function adminClient(): SupabaseClient | null {
  return getAdminClient();
}

export function usingMemory(): boolean {
  return adminClient() === null;
}

// Dev/test fallback store. Module-scoped on purpose.
const memory = new Map<string, ConfirmationRecord>();

export function newToken(): string {
  return randomBytes(9).toString("base64url"); // 12 url-safe chars
}

export async function createConfirmation(
  rec: Omit<ConfirmationRecord, "status" | "channel" | "attempts" | "createdAt"> &
    Partial<Pick<ConfirmationRecord, "status" | "channel" | "attempts">>
): Promise<ConfirmationRecord> {
  const record: ConfirmationRecord = {
    status: "awaiting",
    channel: "whatsapp",
    attempts: 1,
    createdAt: new Date().toISOString(),
    ...rec,
  };

  const db = adminClient();
  if (db) {
    const { error } = await db.from(TABLE).insert({
      token: record.token,
      order_id: record.orderId ?? null,
      customer_name: record.customerName ?? null,
      phone: record.phone,
      email: record.email ?? null,
      order_summary: record.orderSummary ?? null,
      status: record.status,
      lead: record.lead ?? null,
      channel: record.channel,
      attempts: record.attempts,
    });
    if (error) throw new Error(`confirmation insert failed: ${error.message}`);
  } else {
    memory.set(record.token, record);
  }
  return record;
}

export async function getByToken(token: string): Promise<ConfirmationRecord | null> {
  const db = adminClient();
  if (db) {
    const { data } = await db.from(TABLE).select("*").eq("token", token).maybeSingle();
    return data ? fromRow(data) : null;
  }
  return memory.get(token) ?? null;
}

// Most recent still-awaiting confirmation for a phone (free-text reply fallback).
export async function getLatestAwaitingByPhone(phone: string): Promise<ConfirmationRecord | null> {
  const db = adminClient();
  if (db) {
    const { data } = await db
      .from(TABLE)
      .select("*")
      .eq("phone", phone)
      .eq("status", "awaiting")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? fromRow(data) : null;
  }
  let latest: ConfirmationRecord | null = null;
  for (const r of memory.values()) {
    if (r.phone === phone && r.status === "awaiting") {
      if (!latest || r.createdAt > latest.createdAt) latest = r;
    }
  }
  return latest;
}

export async function updateStatus(
  token: string,
  status: ConfirmationStatus,
  rawReply?: Record<string, unknown>
): Promise<ConfirmationRecord | null> {
  const respondedAt = new Date().toISOString();
  const db = adminClient();
  if (db) {
    const { data, error } = await db
      .from(TABLE)
      .update({ status, responded_at: respondedAt, raw_reply: rawReply ?? null })
      .eq("token", token)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`confirmation update failed: ${error.message}`);
    return data ? fromRow(data) : null;
  }
  const rec = memory.get(token);
  if (!rec) return null;
  rec.status = status;
  rec.respondedAt = respondedAt;
  rec.rawReply = rawReply ?? null;
  memory.set(token, rec);
  return rec;
}

// Test-only helper.
export function _clearMemory() {
  memory.clear();
  processed.clear();
}

// ---- Idempotency (inbound webhook dedupe) ----
// Meta redelivers the same message id on retry; we process each exactly once.
const processed = new Set<string>();
const PROCESSED_TABLE = "processed_events";

export async function wasProcessed(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  const db = adminClient();
  if (db) {
    const { data } = await db.from(PROCESSED_TABLE).select("event_id").eq("event_id", eventId).maybeSingle();
    return !!data;
  }
  return processed.has(eventId);
}

export async function markProcessed(eventId: string, source = "whatsapp"): Promise<void> {
  if (!eventId) return;
  const db = adminClient();
  if (db) {
    // Ignore duplicate-key races — the row already existing is the success case.
    await db.from(PROCESSED_TABLE).upsert({ event_id: eventId, source }, { onConflict: "event_id" });
    return;
  }
  processed.add(eventId);
}

// ---- Listing + lifecycle (real-time operator views) ----
const DEFAULT_TTL_HOURS = Number(process.env.CONFIRMATION_TTL_HOURS || 24);

export async function listConfirmations(opts: { status?: ConfirmationStatus; limit?: number } = {}): Promise<ConfirmationRecord[]> {
  await expireStale();
  const limit = opts.limit ?? 100;
  const db = adminClient();
  if (db) {
    let q = db.from(TABLE).select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q;
    return (data ?? []).map(fromRow);
  }
  let rows = Array.from(memory.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (opts.status) rows = rows.filter((r) => r.status === opts.status);
  return rows.slice(0, limit);
}

// Mark awaiting confirmations older than the TTL (T+24 stock lock) as expired.
export async function expireStale(ttlHours = DEFAULT_TTL_HOURS): Promise<number> {
  const cutoff = new Date(Date.now() - ttlHours * 3600_000).toISOString();
  const db = adminClient();
  if (db) {
    const { data } = await db
      .from(TABLE)
      .update({ status: "expired" })
      .eq("status", "awaiting")
      .lt("created_at", cutoff)
      .select("token");
    return data?.length ?? 0;
  }
  let n = 0;
  for (const r of memory.values()) {
    if (r.status === "awaiting" && r.createdAt < cutoff) {
      r.status = "expired";
      n++;
    }
  }
  return n;
}

// Increment the reminder attempt counter (policy: max 3 contact attempts).
export async function incrementAttempt(token: string): Promise<ConfirmationRecord | null> {
  const rec = await getByToken(token);
  if (!rec) return null;
  const attempts = (rec.attempts ?? 1) + 1;
  const db = adminClient();
  if (db) {
    const { data } = await db.from(TABLE).update({ attempts }).eq("token", token).select("*").maybeSingle();
    return data ? fromRow(data) : null;
  }
  rec.attempts = attempts;
  memory.set(token, rec);
  return rec;
}

function fromRow(row: any): ConfirmationRecord {
  return {
    token: row.token,
    orderId: row.order_id,
    customerName: row.customer_name,
    phone: row.phone,
    email: row.email,
    orderSummary: row.order_summary,
    status: row.status,
    lead: row.lead,
    channel: row.channel,
    attempts: row.attempts,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    rawReply: row.raw_reply,
  };
}
