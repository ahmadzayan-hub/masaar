import { describe, expect, it } from "vitest";
import {
  MAX_MEDIA_BYTES,
  MEDIA_CLASSIFICATIONS,
  mediaIsPrivate,
  mediaStoragePath,
  parseMediaMeta,
  safeFileName,
  validateMediaFile,
} from "@/lib/media";

const UUID = "11111111-2222-4333-8444-555555555555";

describe("media metadata", () => {
  it("mirrors the schema's six classifications", () => {
    expect([...MEDIA_CLASSIFICATIONS].sort()).toEqual(
      ["ai_generated_photo", "competitor_reference_photo", "customer_private_order_photo", "real_stock_photo", "supplier_photo", "unclear"],
    );
  });

  it("requires a known classification", () => {
    expect(parseMediaMeta({ photo_classification: "selfie" }).ok).toBe(false);
    expect(parseMediaMeta({}).ok).toBe(false);
  });

  it("flags private data only from an explicit yes, except for customer order photos", () => {
    const soft = parseMediaMeta({ photo_classification: "supplier_photo", contains_private_data: "on" });
    expect(soft.ok && soft.value.contains_private_data).toBe(false);
    const yes = parseMediaMeta({ photo_classification: "supplier_photo", contains_private_data: "yes" });
    expect(yes.ok && yes.value.contains_private_data).toBe(true);
    const forced = parseMediaMeta({ photo_classification: "customer_private_order_photo", contains_private_data: "" });
    expect(forced.ok && forced.value.contains_private_data).toBe(true);
  });

  it("normalises optional fields", () => {
    const r = parseMediaMeta({ photo_classification: "unclear", description: "  ", order_id: ` ${UUID} `, conversation_id: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.description).toBeNull();
      expect(r.value.order_id).toBe(UUID);
      expect(r.value.conversation_id).toBeNull();
    }
    expect(parseMediaMeta({ photo_classification: "unclear", order_id: "42" }).ok).toBe(false);
  });
});

describe("media file checks", () => {
  it("accepts allowed types within the size limit", () => {
    const r = validateMediaFile({ name: "a.jpg", type: "image/jpeg", size: 1024 });
    expect(r).toEqual({ ok: true, value: { extension: "jpg" } });
  });

  it("rejects disallowed types, empty and oversized files", () => {
    expect(validateMediaFile({ name: "a.exe", type: "application/x-msdownload", size: 10 }).ok).toBe(false);
    expect(validateMediaFile({ name: "a.svg", type: "image/svg+xml", size: 10 }).ok).toBe(false);
    expect(validateMediaFile({ name: "a.png", type: "image/png", size: 0 }).ok).toBe(false);
    expect(validateMediaFile({ name: "a.png", type: "image/png", size: MAX_MEDIA_BYTES + 1 }).ok).toBe(false);
    expect(validateMediaFile({ name: "a.png", type: "image/png", size: MAX_MEDIA_BYTES }).ok).toBe(true);
  });
});

describe("media storage path", () => {
  it("sanitises file names and never keeps directories", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:/Users/x/my photo (1).PNG")).toMatch(/^my-photo-1-?.PNG$/);
    expect(safeFileName("   ")).toBe("file");
    expect(safeFileName("صورة المنتج.jpg")).toBe("jpg");
  });

  it("prefixes with classification and year/month", () => {
    const path = mediaStoragePath({
      classification: "supplier_photo",
      originalName: "Gold Chain.JPEG",
      extension: "jpg",
      id: UUID,
      now: new Date("2026-11-03T10:00:00Z"),
    });
    expect(path).toBe(`supplier_photo/2026/11/${UUID}-Gold-Chain.jpg`);
    expect(path).not.toMatch(/\.\./);
  });

  it("falls back to a neutral stem for names with no ASCII characters", () => {
    const path = mediaStoragePath({
      classification: "customer_private_order_photo",
      originalName: "صورة المنتج.jpg",
      extension: "jpg",
      id: UUID,
      now: new Date("2026-11-03T10:00:00Z"),
    });
    expect(path).toBe(`customer_private_order_photo/2026/11/${UUID}-file.jpg`);
  });
});

describe("privacy flag", () => {
  it("treats customer order photos as private even if the flag is missing", () => {
    expect(mediaIsPrivate({ photo_classification: "customer_private_order_photo" })).toBe(true);
    expect(mediaIsPrivate({ photo_classification: "supplier_photo", contains_private_data: true })).toBe(true);
    expect(mediaIsPrivate({ photo_classification: "supplier_photo", contains_private_data: false })).toBe(false);
  });
});
