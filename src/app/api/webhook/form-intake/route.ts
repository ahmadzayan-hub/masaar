// POST /api/webhook/form-intake
// Entry point for the Google Form flow:
//   form submit (Apps Script) -> webhook -> validate data ->
//   extract the customer's number -> WhatsApp confirmation request (buttons) ->
//   order is HELD until the customer taps "Confirm" (handled by /api/webhook/whatsapp).
//
// Why: the courier (Halan) must not be sent out with a wrong/unreachable number
// or to a customer who is no longer responsive. Confirming on WhatsApp first
// proves the number works AND that the customer still wants the order.
//
// On a valid submission we create an `order_confirmations` record (status
// "awaiting"), message the customer with Confirm / Edit / Cancel buttons, and
// return the lead row with Order Status = "Awaiting Customer Confirmation".
// On an invalid submission we ask the customer to fix the flagged fields and do
// NOT open a confirmation (there is nothing safe to prepare yet).

import { NextRequest, NextResponse } from "next/server";
import { validateSubmission, FormSubmission } from "@/lib/intake/validate";
import { buildThankYou } from "@/lib/notify/templates";
import { sendWhatsApp, sendWhatsAppButtons, sendEmail } from "@/lib/notify/provider";
import { createConfirmation, newToken, usingMemory } from "@/lib/confirm/store";
import { buildConfirmationRequest } from "@/lib/confirm/messages";
import { recordIntakeOrder } from "@/lib/orders/sink";
import { computeCashCollection } from "@/lib/pricing";
import { checkWebhookSecret } from "@/lib/http/auth";

// Parse a free-text AED amount (e.g. "AED 154", "154 درهم", "129.0") to a number.
function parseAed(raw?: string): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/[, ]/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const runtime = "nodejs";

function coerce(body: Record<string, any>): FormSubmission {
  const g = (...keys: string[]) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== "") {
        return String(body[k]).trim();
      }
    }
    return undefined;
  };
  return {
    fullName: g("fullName", "Full Name", "full_name", "name"),
    mobileNumber: g("mobileNumber", "Mobile Number", "mobile", "phone"),
    whatsappNumber: g("whatsappNumber", "WhatsApp Number if different", "WhatsApp Number", "whatsapp"),
    email: g("email", "Email", "Email Address", "e-mail"),
    emirate: g("emirate", "Emirate"),
    area: g("area", "Area"),
    fullAddress: g("fullAddress", "Full Address", "address"),
    googleMapsLocation: g("googleMapsLocation", "Google Maps Location", "maps", "location"),
    preferredDeliveryTime: g("preferredDeliveryTime", "Preferred Delivery Time"),
    paymentMethod: g("paymentMethod", "Payment Method"),
    orderSummary: g("orderSummary", "Order Summary Confirmation", "order_summary"),
    specialNotes: g("specialNotes", "Special Delivery Notes", "notes"),
    sourcePlatform: g("sourcePlatform", "Source Platform", "platform"),
    instagramUsername: g("instagramUsername", "Instagram Username"),
    orderId: g("orderId", "Order ID", "order_id"),
  };
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    // Surface a clear, actionable error instead of an opaque 500. The most common
    // cause is Supabase being configured while a migration (order_confirmations /
    // intake_orders) has not been applied yet.
    const message = err instanceof Error ? err.message : "intake failed";
    console.error("[form-intake] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  if (!checkWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let raw: Record<string, any>;
  try {
    raw = (await req.json()) as Record<string, any>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const submission = coerce(raw);
  const validation = validateSubmission(submission);

  // ---- Invalid: ask the customer to fix the data; no confirmation opened. ----
  if (!validation.valid) {
    const content = buildThankYou(validation.normalized.fullName, validation);
    const notifications = await Promise.all([
      sendWhatsApp(validation.normalized.whatsappNumber, content.whatsappText),
      validation.normalized.email
        ? sendEmail(validation.normalized.email, content.emailSubject, content.emailHtml, content.emailText)
        : Promise.resolve({ channel: "email" as const, ok: false, provider: "skipped", to: "", detail: "no email provided" }),
    ]);
    return NextResponse.json(
      {
        ok: true,
        validation: { valid: false, issues: validation.issues },
        orderStatus: "Data Fix Required",
        notifications,
      },
      { status: 422 }
    );
  }

  // ---- Valid: open a confirmation and message the customer with buttons. ----
  const token = newToken();
  const orderId = (raw["Order ID"] || raw["orderId"] || raw["order_id"] || "") as string;
  await createConfirmation({
    token,
    orderId: orderId || null,
    customerName: validation.normalized.fullName,
    phone: validation.normalized.whatsappNumber, // the number we extract & message
    email: validation.normalized.email || null,
    orderSummary: submission.orderSummary || null,
    lead: { ...submission, ...validation.normalized },
  });

  // Expected cash collection = order value + 25 AED delivery. Only when an order
  // value is supplied (form "Order Total" or a known SKU+qty) — never guessed.
  const cash = computeCashCollection({
    orderValueAed: parseAed(raw["Order Total"] || raw["orderTotal"] || raw["order_total"]),
    sku: (raw["product_sku"] || raw["SKU"] || null) as string | null,
    quantity: Number(raw["quantity"] || raw["Quantity"]) || null,
  });

  const { body, buttons } = buildConfirmationRequest({
    token,
    customerName: validation.normalized.fullName,
    phone: validation.normalized.whatsappNumber,
    orderSummary: submission.orderSummary || null,
    totalAed: cash?.total ?? null,
    needsMapPin: validation.needsMapPin,
  });
  const whatsapp = await sendWhatsAppButtons(validation.normalized.whatsappNumber, body, buttons);

  // Persist the validated lead to BOTH destinations: Supabase intake_orders
  // (durable source of truth) and the Google Sheet ("add lead to Sheet").
  const persisted = await recordIntakeOrder({
    token,
    orderId: orderId || undefined,
    customerName: validation.normalized.fullName,
    phone: validation.normalized.mobileNumber,
    whatsappNumber: validation.normalized.whatsappNumber,
    email: validation.normalized.email || undefined,
    emirate: validation.normalized.emirate,
    area: submission.area,
    fullAddress: submission.fullAddress,
    googleMapsLocation: submission.googleMapsLocation,
    preferredDeliveryTime: submission.preferredDeliveryTime,
    paymentMethod: submission.paymentMethod,
    orderSummary: submission.orderSummary,
    specialNotes: submission.specialNotes,
    sourcePlatform: submission.sourcePlatform,
    instagramUsername: submission.instagramUsername,
    criticalDataStatus: "DATA INTACT",
    orderStatus: "Awaiting Customer Confirmation",
  });

  const leadRow = {
    Timestamp: new Date().toISOString(),
    "Order ID": orderId || "",
    "Full Name": validation.normalized.fullName,
    "Mobile Number": validation.normalized.mobileNumber,
    "WhatsApp Number if different": validation.normalized.whatsappNumber,
    Email: validation.normalized.email,
    Emirate: validation.normalized.emirate,
    Area: submission.area || "",
    "Full Address": submission.fullAddress || "",
    "Google Maps Location": submission.googleMapsLocation || "",
    "Preferred Delivery Time": submission.preferredDeliveryTime || "Not specified",
    "Payment Method": submission.paymentMethod || "",
    "Order Summary Confirmation": submission.orderSummary || "",
    "Source Platform": submission.sourcePlatform || "",
    "Instagram Username": submission.instagramUsername || "",
    "Critical Data Status": "DATA INTACT",
    "Order Status": "Awaiting Customer Confirmation",
    "Confirmation Token": token,
  };

  return NextResponse.json(
    {
      ok: true,
      validation: { valid: true, issues: validation.issues },
      orderStatus: "Awaiting Customer Confirmation",
      confirmation: { token, channel: "whatsapp", status: "awaiting" },
      leadRow,
      persisted,
      notifications: [whatsapp],
      ...(usingMemory() ? { warning: "Confirmation stored in memory (no Supabase) — configure SUPABASE for durable state." } : {}),
    },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "form-intake", method: "POST" });
}
