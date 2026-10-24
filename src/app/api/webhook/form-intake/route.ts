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
import { newToken } from "@/lib/confirm/store";
import { buildConfirmationRequest } from "@/lib/confirm/messages";
import { IntakeOrder } from "@/lib/orders/sink";
import { ingestSubmission, markSubmissionNotified, mirrorNewSubmission, IntakeConflict } from "@/lib/orders/form-intake";
import { computeCashCollection } from "@/lib/pricing";
import { requireWebhookSecret } from "@/lib/http/auth";

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
    const conflict = err instanceof IntakeConflict;
    console.error("[form-intake] request failed");
    return NextResponse.json({ ok: false, error: conflict ? "Idempotency key conflicts with existing submission" : "Intake processing failed; retry with the same idempotency key" }, { status: conflict ? 409 : 503 });
  }
}

async function handlePost(req: NextRequest) {
  if (!requireWebhookSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let raw: Record<string, any>;
  try {
    raw = (await req.json()) as Record<string, any>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const submissionId = req.headers.get("x-idempotency-key") || raw.submissionId;
  if (typeof submissionId !== "string" || !submissionId.trim() || submissionId.length > 200) {
    return NextResponse.json({ ok: false, error: "Stable x-idempotency-key or submissionId required" }, { status: 400 });
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
  let token = newToken();
  const orderId = (raw["Order ID"] || raw["orderId"] || raw["order_id"] || "") as string;

  // Expected cash collection = order value + 25 AED delivery. Only when an order
  // value is supplied (form "Order Total" or a known SKU+qty) — never guessed.
  const cash = computeCashCollection({
    orderValueAed: parseAed(raw["Order Total"] || raw["orderTotal"] || raw["order_total"]),
    sku: (raw["product_sku"] || raw["SKU"] || null) as string | null,
    quantity: Number(raw["quantity"] || raw["Quantity"]) || null,
  });

  const intake: IntakeOrder = {
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
  };
  const receipt = await ingestSubmission(submissionId, { ...submission, expectedCash: cash }, intake);
  token = receipt.token;
  intake.token = token;
  const sheets = receipt.created ? await mirrorNewSubmission(intake) : {
    ok: false, provider: "not_repeated", detail: "Existing intake retained; check sheet_synced for mirror reconciliation",
  };
  const persisted = { supabase: { ok: true, persisted: true, provider: "supabase" }, sheets };
  const { body, buttons } = buildConfirmationRequest({
    token,
    customerName: validation.normalized.fullName,
    phone: validation.normalized.whatsappNumber,
    orderSummary: submission.orderSummary || null,
    totalAed: cash?.total ?? null,
    needsMapPin: validation.needsMapPin,
  });
  const whatsapp = receipt.status !== "awaiting"
    ? { ok: true, provider: "resolved", channel: "whatsapp", detail: "Confirmation already resolved; no new invitation sent" }
    : receipt.notification_sent
    ? { ok: true, provider: "receipt", channel: "whatsapp", detail: "Previously accepted by provider; not sent again" }
    : await sendWhatsAppButtons(validation.normalized.whatsappNumber, body, buttons);
  if (whatsapp.ok && whatsapp.provider !== "mock" && receipt.status === "awaiting" && !receipt.notification_sent) await markSubmissionNotified(submissionId);

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
    "Order Status": receipt.status === "awaiting" ? "Awaiting Customer Confirmation" : receipt.status,
    "Confirmation Token": token,
  };

  return NextResponse.json(
    {
      ok: whatsapp.ok && whatsapp.provider !== "mock",
      validation: { valid: true, issues: validation.issues },
      orderStatus: receipt.status === "awaiting" ? "Awaiting Customer Confirmation" : receipt.status,
      confirmation: { token, channel: "whatsapp", status: receipt.status },
      leadRow,
      persisted,
      notifications: [whatsapp],
      replayed: !receipt.created,
      warning: "Sheet append is not repeated on replay; reconcile any pending or uncertain mirror write.",
    },
    { status: whatsapp.ok && whatsapp.provider !== "mock" ? 200 : 503 }
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "form-intake", method: "POST" });
}
