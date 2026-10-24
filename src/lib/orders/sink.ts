// Order sink — persists the validated intake/order to BOTH destinations:
//   • Supabase `intake_orders` (durable source of truth the console reads), and
//   • Google Sheets (the "add lead to Sheet" mirror).
// Each destination is independent and env-driven. A missing config degrades to a
// no-op that says so (provider "mock", persisted: false). It is never reported as a
// durable write, and on a Vercel production deployment it is a failure (ok: false).

import { getAdminClient } from "@/lib/supabase/admin";
import { appendRow, updateStatusByToken, isConfigured as sheetsConfigured, SheetResult } from "@/lib/sheets/client";

export interface IntakeOrder {
  token: string;
  orderId?: string;
  customerName: string;
  phone: string; // mobile, E.164
  whatsappNumber: string;
  email?: string;
  emirate: string;
  area?: string;
  fullAddress?: string;
  googleMapsLocation?: string;
  preferredDeliveryTime?: string;
  paymentMethod?: string;
  orderSummary?: string;
  specialNotes?: string;
  sourcePlatform?: string;
  instagramUsername?: string;
  criticalDataStatus: string;
  orderStatus: string;
}

export interface SinkOutcome {
  ok: boolean;
  provider: string;
  /** True only when a durable store accepted the write. */
  persisted?: boolean;
  detail?: string;
  error?: string;
  orderId?: string;
}

// Nothing was stored. Acceptable while developing; on production it is a failure.
export function notPersisted(what: string): SinkOutcome {
  const production = process.env.VERCEL_ENV === "production";
  return {
    ok: !production,
    provider: "mock",
    persisted: false,
    detail: `no Supabase service role: ${what} NOT stored`,
    ...(production ? { error: "Supabase service role is not configured on production" } : {}),
  };
}

export interface PersistResult {
  supabase: SinkOutcome;
  sheets: SheetResult;
}

const TABLE = "intake_orders";

// Column order for the Google Sheet row. Matches the Master Database
// "Form Responses" tab, then appends Order Status + Confirmation Token so the
// row can be located and updated later by token.
export function leadToSheetRow(o: IntakeOrder): (string | number)[] {
  return [
    new Date().toISOString(),       // Timestamp
    o.customerName || "",            // Full Name
    o.phone || "",                   // Mobile Number
    o.whatsappNumber || "",          // WhatsApp Number if different
    o.emirate || "",                 // Emirate
    o.area || "",                    // Area
    o.fullAddress || "",             // Full Address
    o.googleMapsLocation || "",      // Google Maps Location
    o.preferredDeliveryTime || "Not specified", // Preferred Delivery Time
    o.paymentMethod || "",           // Payment Method
    o.orderSummary || "",            // Order Summary Confirmation
    o.specialNotes || "",            // Special Delivery Notes
    o.sourcePlatform || "",          // Source Platform
    "",                              // Campaign Name
    o.instagramUsername || "",       // Instagram Username
    o.orderId || "",                 // Order ID
    "Beyond Style UAE",              // Sales Agent
    "",                              // Order Total
    "25",                            // Delivery Fee (AED)
    o.paymentMethod || "",           // Payment Status (placeholder)
    o.orderStatus,                   // Order Status        (extra col U)
    o.token,                         // Confirmation Token  (extra col V)
  ];
}

async function persistSupabase(o: IntakeOrder): Promise<SinkOutcome> {
  const db = getAdminClient();
  if (!db) return notPersisted("intake order");
  const { error } = await db.from(TABLE).upsert(
    {
      confirmation_token: o.token,
      order_id: o.orderId ?? null,
      customer_name: o.customerName,
      phone: o.phone,
      whatsapp_number: o.whatsappNumber,
      email: o.email ?? null,
      emirate: o.emirate,
      area: o.area ?? null,
      full_address: o.fullAddress ?? null,
      google_maps_location: o.googleMapsLocation ?? null,
      preferred_delivery_time: o.preferredDeliveryTime ?? null,
      payment_method: o.paymentMethod ?? null,
      order_summary: o.orderSummary ?? null,
      source_platform: o.sourcePlatform ?? null,
      instagram_username: o.instagramUsername ?? null,
      critical_data_status: o.criticalDataStatus,
      order_status: o.orderStatus,
      lead: o as unknown as Record<string, unknown>,
      sheet_synced: sheetsConfigured(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "confirmation_token" }
  );
  if (error) return { ok: false, provider: "supabase", persisted: false, error: error.message };
  return { ok: true, provider: "supabase", persisted: true, detail: "upserted" };
}

// Persist a fresh intake order to both destinations (runs them in parallel).
export async function recordIntakeOrder(o: IntakeOrder): Promise<PersistResult> {
  const [supabase, sheets] = await Promise.all([
    persistSupabase(o).catch((e) => ({ ok: false, provider: "supabase", error: String(e) } as SinkOutcome)),
    appendRow(leadToSheetRow(o)).catch((e) => ({ ok: false, provider: "google_sheets", error: String(e) } as SheetResult)),
  ]);
  return { supabase, sheets };
}

async function updateSupabaseStatus(token: string, orderStatus: string): Promise<SinkOutcome> {
  const db = getAdminClient();
  if (!db) return notPersisted("status change");
  const { error } = await db
    .from(TABLE)
    .update({ order_status: orderStatus, updated_at: new Date().toISOString() })
    .eq("confirmation_token", token);
  return error
    ? { ok: false, provider: "supabase", persisted: false, error: error.message }
    : { ok: true, provider: "supabase", persisted: true, detail: orderStatus };
}

// Update an existing order's status in both destinations (on confirm/decline/edit).
export async function updateOrderStatus(token: string, orderStatus: string): Promise<PersistResult> {
  const [supabase, sheets] = await Promise.all([
    updateSupabaseStatus(token, orderStatus).catch((e) => ({ ok: false, provider: "supabase", error: String(e) } as SinkOutcome)),
    updateStatusByToken(token, orderStatus).catch(
      (e) => ({ ok: false, provider: "google_sheets", error: String(e) } as SheetResult)
    ),
  ]);
  return { supabase, sheets };
}

// Human-friendly Order Status for each confirmation outcome.
export function statusForAction(action: "confirm" | "edit" | "decline"): string {
  switch (action) {
    case "confirm":
      return "Confirmed - In Preparation";
    case "edit":
      return "Edit Requested";
    case "decline":
      return "Cancelled by Customer";
  }
}

// Create the core `orders` row for a customer-confirmed intake (migration 0007).
// Idempotent in the database: a retry or a Meta redelivery returns the same order id.
export async function promoteIntakeOrder(token: string): Promise<SinkOutcome> {
  const db = getAdminClient();
  if (!db) return notPersisted("core order");
  const { data, error } = await db.rpc("promote_intake_order", { p_token: token });
  if (error || !data) return { ok: false, provider: "supabase", persisted: false, error: "Core order was not returned" };
  return { ok: true, provider: "supabase", persisted: true, orderId: String(data), detail: "core order linked" };
}

// Atomic database transition. A mock is never a successful customer confirmation.
export async function applyConfirmationReply(
  token: string, eventId: string, action: "confirm" | "edit" | "decline",
  phone: string, reply: Record<string, unknown>
): Promise<SinkOutcome> {
  const db = getAdminClient();
  if (!db) return { ...notPersisted("confirmation reply"), ok: false };
  const { data, error } = await db.rpc("apply_confirmation_reply", {
    p_token: token, p_event_id: eventId, p_action: action, p_phone: phone, p_reply: reply,
  });
  if (error || !data || (action === "confirm" && !data.order_id)) {
    return { ok: false, provider: "supabase", persisted: false, error: "Atomic confirmation did not complete" };
  }
  return { ok: true, provider: "supabase", persisted: true, orderId: data.order_id ?? undefined };
}

// Sheets is a mirror only. Never mirror a fulfillment status before the DB commit.
export async function mirrorOrderStatus(token: string, action: "confirm" | "edit" | "decline"): Promise<SheetResult> {
  return updateStatusByToken(token, statusForAction(action));
}
