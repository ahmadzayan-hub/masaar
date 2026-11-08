// Record create/edit forms (roadmap Phase 2: "create/edit forms on all record
// pages"). One place defines, per editable table, the columns an operator may
// write and how each is validated. The API route and the form component both
// read this, so nothing outside the allow-list ever reaches the database
// (no mass assignment), and the UI cannot offer a field the API would reject.
//
// Database policies (migration 0006) remain the real enforcement: owner and
// operator write customers, couriers and suppliers.
import { z } from "zod";

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required?: boolean;
  hint?: string;
}

export interface TableSpec {
  table: string;
  title: string;
  fields: readonly FieldSpec[];
  schema: z.ZodObject<z.ZodRawShape>;
}

// Form values arrive as strings (or booleans from a typed client). Empty
// strings mean "not provided": optional columns are stored as null.
const text = (max = 200) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .pipe(z.string().max(max))
    .transform((v) => (v === "" ? null : v));
const requiredText = (max = 200) => z.string().trim().min(1, "required").max(max);
const optionalNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => (v === "" || v == null ? null : v))
    .pipe(
      z.union([
        z.null(),
        z.coerce
          .number()
          .refine((n) => Number.isFinite(n), "must be a number")
          .refine((n) => opts.min == null || n >= opts.min, `must be at least ${opts.min}`)
          .refine((n) => opts.max == null || n <= opts.max, `must be at most ${opts.max}`)
          .refine((n) => !opts.int || Number.isInteger(n), "must be a whole number"),
      ])
    );
// Booleans are true only from a literal 'yes' or boolean true. 'true', 'on',
// '1' and anything else record false, so an unchecked box can never be read
// as consent or as a passed gate.
const explicitYes = z.unknown().transform((v) => v === "yes" || v === true);
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .transform((v) => (v === "" ? null : v))
    .pipe(z.union([z.null(), z.enum(values)]));

export const CUSTOMER_PLATFORMS = ["instagram", "whatsapp", "tiktok", "meta_ads", "comment", "other"] as const;
export const CUSTOMER_LANGUAGES = ["ar", "en", "mixed"] as const;
export const CUSTOMER_CONSENT = ["none", "soft", "explicit", "purchased"] as const;
export const SAMPLE_STATUSES = ["not_sent", "requested", "shipped", "received", "approved", "rejected"] as const;

const suppliersSchema = z.object({
  name: requiredText(120),
  country: text(80),
  contact: text(200),
  platform: text(80),
  catalogue_status: text(80),
  real_video_received: explicitYes,
  material_proof: text(200),
  sample_status: optionalEnum(SAMPLE_STATUSES),
  sample_approved: explicitYes,
  moq: optionalNumber({ min: 0, int: true }),
  unit_cost: optionalNumber({ min: 0 }),
  shipping_cost: optionalNumber({ min: 0 }),
  production_time: text(80),
  wrong_item_policy: text(300),
  damage_policy: text(300),
  payment_method: text(120),
  risk_score: optionalNumber({ min: 0, max: 1 }),
  notes: text(1000),
});

const couriersSchema = z.object({
  name: requiredText(120),
  contact: text(200),
  service_type: text(80),
  default_cost: optionalNumber({ min: 0 }),
  vat_included: explicitYes,
  notes: text(1000),
});

const customersSchema = z.object({
  name_display: requiredText(120),
  name_arabic_verified: text(120),
  platform: optionalEnum(CUSTOMER_PLATFORMS),
  phone: text(40),
  instagram_handle: text(80),
  language: optionalEnum(CUSTOMER_LANGUAGES),
  consent_status: optionalEnum(CUSTOMER_CONSENT),
  segment: text(80),
  notes: text(1000),
});

export const RECORD_TABLES: Record<string, TableSpec> = {
  suppliers: {
    table: "suppliers",
    title: "Supplier",
    schema: suppliersSchema,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "country", label: "Country", type: "text" },
      { key: "contact", label: "Contact", type: "text" },
      { key: "platform", label: "Platform", type: "text", hint: "Alibaba, Direct, WhatsApp…" },
      { key: "catalogue_status", label: "Catalogue status", type: "text" },
      { key: "real_video_received", label: "Real product video received", type: "boolean" },
      { key: "material_proof", label: "Material proof", type: "text", hint: "What was received; 'missing' or 'pending' blocks bulk purchase" },
      { key: "sample_status", label: "Sample status", type: "select", options: SAMPLE_STATUSES },
      { key: "sample_approved", label: "Sample approved", type: "boolean" },
      { key: "moq", label: "MOQ", type: "number" },
      { key: "unit_cost", label: "Unit cost (AED)", type: "number" },
      { key: "shipping_cost", label: "Shipping cost (AED)", type: "number" },
      { key: "production_time", label: "Production time", type: "text" },
      { key: "wrong_item_policy", label: "Wrong-item policy", type: "text" },
      { key: "damage_policy", label: "Damage policy", type: "text" },
      { key: "payment_method", label: "Payment method", type: "text" },
      { key: "risk_score", label: "Risk score (0-1)", type: "number", hint: "0.7 or more blocks bulk purchase" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  couriers: {
    table: "couriers",
    title: "Courier",
    schema: couriersSchema,
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "contact", label: "Contact", type: "text" },
      { key: "service_type", label: "Service type", type: "text", hint: "express, same_day_dubai, standard…" },
      { key: "default_cost", label: "Default cost (AED)", type: "number" },
      { key: "vat_included", label: "VAT included in cost", type: "boolean" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  customers: {
    table: "customers",
    title: "Customer",
    schema: customersSchema,
    fields: [
      { key: "name_display", label: "Display name", type: "text", required: true },
      { key: "name_arabic_verified", label: "Arabic name (verified spelling)", type: "text" },
      { key: "platform", label: "Platform", type: "select", options: CUSTOMER_PLATFORMS },
      { key: "phone", label: "Phone", type: "text" },
      { key: "instagram_handle", label: "Instagram handle", type: "text" },
      { key: "language", label: "Language", type: "select", options: CUSTOMER_LANGUAGES },
      { key: "consent_status", label: "Consent status", type: "select", options: CUSTOMER_CONSENT },
      { key: "segment", label: "Segment", type: "text" },
      { key: "notes", label: "Notes", type: "textarea", hint: "Sales-relevant only. No sensitive profiling." },
    ],
  },
};

export const RECORD_TABLE_NAMES = Object.keys(RECORD_TABLES);

export function isRecordTable(table: string): boolean {
  return Object.prototype.hasOwnProperty.call(RECORD_TABLES, table);
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "invalid input";
}

/** Validate a create payload: every allow-listed column, nothing else. */
export function parseRecordCreate(table: string, raw: unknown): Parsed<Record<string, unknown>> {
  const spec = RECORD_TABLES[table];
  if (!spec) return { ok: false, error: `unknown record table '${table}'` };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "body: must be an object" };
  const r = spec.schema.strict().safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: firstIssue(r.error) };
}

/**
 * Validate an update payload: `id` plus any subset of allow-listed columns.
 * Only the keys present in the body are returned, so an edit form that sends
 * three fields changes three columns. Booleans sent are always written
 * (unchecked = false), which is what an edit form means.
 */
export function parseRecordUpdate(
  table: string,
  raw: unknown
): Parsed<{ id: string; values: Record<string, unknown> }> {
  const spec = RECORD_TABLES[table];
  if (!spec) return { ok: false, error: `unknown record table '${table}'` };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "body: must be an object" };
  const { id, ...rest } = raw as Record<string, unknown>;
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) return { ok: false, error: "id: must be a uuid" };
  const r = spec.schema.partial().strict().safeParse(rest);
  if (!r.success) return { ok: false, error: firstIssue(r.error) };
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(rest)) if (key in r.data) values[key] = r.data[key];
  if (Object.keys(values).length === 0) return { ok: false, error: "body: nothing to update" };
  return { ok: true, value: { id: idCheck.data, values } };
}

/** Initial form values for an existing row: booleans become 'yes' | '', the rest strings. */
export function recordFormValues(table: string, row: Record<string, unknown>): Record<string, string> {
  const spec = RECORD_TABLES[table];
  const out: Record<string, string> = {};
  if (!spec) return out;
  for (const f of spec.fields) {
    const v = row[f.key];
    if (f.type === "boolean") out[f.key] = v === true ? "yes" : "";
    else out[f.key] = v == null ? "" : String(v);
  }
  return out;
}
