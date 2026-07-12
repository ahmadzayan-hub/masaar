// Customer form intake validation (Phase 3 webhook).
// Pure functions — no I/O — so they unit-test cleanly and run in any runtime.
//
// The customer-facing Quick Delivery Form (see the Master Database
// "Form Responses" sheet) only collects delivery details. Before Beyond Style
// proceeds with order preparation we must confirm the submitted data is usable:
// a real UAE mobile, a known emirate, and an address with enough landmark detail
// for Halan Logistics to deliver without a return.

export const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
  "Al Ain",
] as const;

// Raw submission as it arrives from the form / webhook. Mirrors the
// "Form Responses" sheet columns; everything optional so we can report what is
// missing rather than throwing.
export interface FormSubmission {
  fullName?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  email?: string;
  emirate?: string;
  area?: string;
  fullAddress?: string;
  googleMapsLocation?: string;
  preferredDeliveryTime?: string;
  paymentMethod?: string;
  orderSummary?: string;
  specialNotes?: string;
  sourcePlatform?: string;
  instagramUsername?: string;
  orderId?: string;
}

export type FieldCode =
  | "fullName"
  | "mobileNumber"
  | "whatsappNumber"
  | "email"
  | "emirate"
  | "fullAddress"
  | "googleMaps";

export interface ValidationIssue {
  field: FieldCode;
  severity: "error" | "warning";
  message: string;
}

export interface NormalizedSubmission {
  fullName: string;
  mobileNumber: string; // E.164 (+9715XXXXXXXX) when valid, else original
  mobileDigits12: string; // 9715XXXXXXXX (exactly 12 digits) — Halan import format
  whatsappNumber: string; // E.164 when valid, else falls back to mobileNumber
  email: string;
  emirate: string; // canonical emirate name when matched
  mapsLink: string; // the raw maps link as submitted
}

export interface ValidationResult {
  valid: boolean; // true only when there are no `error` issues
  issues: ValidationIssue[];
  normalized: NormalizedSubmission;
  // True when the Google Maps pin is missing/invalid — the confirmation message
  // gracefully asks the customer to drop a live digital pin (spec fallback).
  needsMapPin: boolean;
}

// ---- UAE mobile normalization (spec: strip symbols, 05… → 9715…, exactly 12 digits) ----
// Accepts "050 653 2084", "+971506532084", "00971…", "0506532084".
// Canonical forms: value = +9715XXXXXXXX (E.164, for messaging),
//                  digits12 = 9715XXXXXXXX (exactly 12 digits, courier import).
// Valid UAE mobile prefixes after the leading 5: 0,2,4,5,6,8 (50/52/54/55/56/58).
export function normalizeUaePhone(raw?: string): { value: string; digits12: string; ok: boolean } {
  if (!raw) return { value: "", digits12: "", ok: false };
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00971")) digits = digits.slice(5);
  else if (digits.startsWith("971")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (/^5[024568]\d{7}$/.test(digits)) {
    const digits12 = `971${digits}`; // 971 + 9 local digits = exactly 12 digits
    return { value: `+${digits12}`, digits12, ok: digits12.length === 12 };
  }
  return { value: String(raw).trim(), digits12: "", ok: false };
}

// ---- Google Maps pin validation (spec: goo.gl or maps.google.com only) ----
const MAPS_HOST_RE = /(?:maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|google\.[a-z.]+\/maps)/i;
export function validateMapsLink(raw?: string): { ok: boolean; value: string } {
  const value = String(raw || "").trim();
  if (!value) return { ok: false, value: "" };
  // Must be a real URL pointing at a Google Maps host — loose text fails.
  if (!/^https?:\/\//i.test(value)) return { ok: false, value };
  return { ok: MAPS_HOST_RE.test(value), value };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Address landmark tokens (EN + AR). Halan returns climb when the address has no
// building/flat/street reference — same gate the Python fulfillment agent uses.
const ADDRESS_TOKENS = [
  "villa", "apartment", "apt", "bldg", "building", "tower", "street", "st ",
  "flat", "floor", "house", "door", "room", "makani", "near",
  "بناية", "شقة", "فيلا", "شارع", "منزل", "طابق", "مكتب", "معلم", "برج", "باب",
];

export function matchEmirate(raw?: string): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  for (const e of UAE_EMIRATES) {
    if (v === e.toLowerCase()) return e;
  }
  // tolerate partial / contained matches (e.g. "Dubai - JVC")
  for (const e of UAE_EMIRATES) {
    if (v.includes(e.toLowerCase())) return e;
  }
  return null;
}

export function hasAddressLandmark(address?: string): boolean {
  if (!address) return false;
  const v = String(address).trim();
  if (v.length < 12) return false;
  const lower = v.toLowerCase();
  return ADDRESS_TOKENS.some((t) => lower.includes(t));
}

export function validateSubmission(input: FormSubmission): ValidationResult {
  const issues: ValidationIssue[] = [];

  const fullName = (input.fullName || "").trim();
  if (fullName.length < 2 || /^[.0\s]+$/.test(fullName)) {
    issues.push({ field: "fullName", severity: "error", message: "Customer name is missing or invalid." });
  }

  const mobile = normalizeUaePhone(input.mobileNumber);
  if (!mobile.ok) {
    issues.push({
      field: "mobileNumber",
      severity: "error",
      message: "Mobile number is not a valid UAE number — must clean to exactly 12 digits (9715XXXXXXXX).",
    });
  }

  // WhatsApp number is optional; if absent we reuse the mobile number.
  let whatsapp = mobile;
  if (input.whatsappNumber && input.whatsappNumber.trim()) {
    whatsapp = normalizeUaePhone(input.whatsappNumber);
    if (!whatsapp.ok) {
      issues.push({
        field: "whatsappNumber",
        severity: "warning",
        message: "WhatsApp number looks invalid — falling back to the mobile number for messaging.",
      });
      whatsapp = mobile;
    }
  }

  const email = (input.email || "").trim();
  if (!email) {
    issues.push({ field: "email", severity: "warning", message: "No email provided — thank-you email will be skipped." });
  } else if (!EMAIL_RE.test(email)) {
    issues.push({ field: "email", severity: "error", message: "Email address is not valid." });
  }

  const emirate = matchEmirate(input.emirate);
  if (!emirate) {
    issues.push({ field: "emirate", severity: "error", message: "Emirate is missing or not a recognized UAE emirate." });
  }

  if (!hasAddressLandmark(input.fullAddress)) {
    issues.push({
      field: "fullAddress",
      severity: "error",
      message: "Address is incomplete — add building/villa, flat/floor, and street so the courier can deliver.",
    });
  }

  // Google Maps pin — a missing/loose pin is a soft gate (warning + fallback ask),
  // not a hard block, so a valid address can still proceed while we chase the pin.
  const maps = validateMapsLink(input.googleMapsLocation);
  const needsMapPin = !maps.ok;
  if (needsMapPin) {
    issues.push({
      field: "googleMaps",
      severity: "warning",
      message: "Google Maps pin is missing or not a valid link — we'll ask the customer to drop a live pin.",
    });
  }

  const valid = !issues.some((i) => i.severity === "error");

  return {
    valid,
    issues,
    needsMapPin,
    normalized: {
      fullName,
      mobileNumber: mobile.value,
      mobileDigits12: mobile.digits12,
      whatsappNumber: whatsapp.value,
      email,
      emirate: emirate || (input.emirate || "").trim(),
      mapsLink: maps.value,
    },
  };
}
