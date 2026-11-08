// Media persistence (roadmap Phase 2: "persist uploads to Supabase Storage +
// media_assets classification"). Pure helpers shared by the upload route, the
// page and the tests: what may be uploaded, how it is classified, and where it
// is stored. The route does the I/O; nothing here touches the network.
//
// Policy: every upload carries an explicit photo_classification chosen by the
// operator. A customer's private order photo is always private data. The
// bucket is private (migration 0011); file_url stores the object path, never a
// public link.
import { z } from "zod";

export const MEDIA_BUCKET = "media";

/** Mirrors the media_assets.photo_classification check constraint (migration 0001). */
export const MEDIA_CLASSIFICATIONS = [
  "real_stock_photo",
  "supplier_photo",
  "ai_generated_photo",
  "customer_private_order_photo",
  "competitor_reference_photo",
  "unclear",
] as const;
export type MediaClassification = (typeof MEDIA_CLASSIFICATIONS)[number];

export const MEDIA_CLASSIFICATION_LABELS: Record<MediaClassification, string> = {
  real_stock_photo: "Real stock photo",
  supplier_photo: "Supplier photo",
  ai_generated_photo: "AI-generated photo",
  customer_private_order_photo: "Customer's private order photo",
  competitor_reference_photo: "Competitor reference",
  unclear: "Unclear",
};

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

const explicitYes = z.unknown().transform((v) => v === "yes" || v === true);
const optionalUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (typeof v === "string" ? v.trim() : ""))
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), z.string().uuid()]));

export const mediaMetaSchema = z.object({
  photo_classification: z.enum(MEDIA_CLASSIFICATIONS),
  contains_private_data: explicitYes,
  description: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .pipe(z.string().max(500))
    .transform((v) => (v === "" ? null : v)),
  conversation_id: optionalUuid,
  order_id: optionalUuid,
});
export type MediaMeta = z.infer<typeof mediaMetaSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "invalid input";
}

/** Validate the non-file fields. A customer's private order photo is always flagged private. */
export function parseMediaMeta(raw: unknown): Parsed<MediaMeta> {
  const r = mediaMetaSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: firstIssue(r.error) };
  const value = r.data;
  if (value.photo_classification === "customer_private_order_photo") value.contains_private_data = true;
  return { ok: true, value };
}

export interface MediaFileInfo {
  name: string;
  type: string;
  size: number;
}

/** Validate the file by declared type and size. Content is not inspected here. */
export function validateMediaFile(file: MediaFileInfo): Parsed<{ extension: string }> {
  const type = (file.type || "").toLowerCase();
  const extension = ALLOWED_MEDIA_TYPES[type];
  if (!extension) return { ok: false, error: `file: type '${file.type || "unknown"}' is not accepted` };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "file: empty file" };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, error: `file: larger than ${MAX_MEDIA_BYTES / (1024 * 1024)} MB` };
  return { ok: true, value: { extension } };
}

/** Keep letters, digits, dot, dash and underscore; collapse the rest. Never a path. */
export function safeFileName(name: string, maxLength = 60): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength);
  return cleaned || "file";
}

/**
 * Object path inside the bucket: `<classification>/<yyyy>/<mm>/<id>-<safe-name>.<ext>`.
 * The classification prefix makes storage policies and audits by category trivial.
 */
export function mediaStoragePath(input: {
  classification: MediaClassification;
  originalName: string;
  extension: string;
  id: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const stem = safeFileName(input.originalName.replace(/\.[^.]+$/, ""));
  return `${input.classification}/${yyyy}/${mm}/${input.id}-${stem}.${input.extension}`;
}

/** Private media must never be shown outside the console. */
export function mediaIsPrivate(asset: Record<string, unknown>): boolean {
  return asset.contains_private_data === true || asset.photo_classification === "customer_private_order_photo";
}
