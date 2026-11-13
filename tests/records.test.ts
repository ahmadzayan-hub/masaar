import { describe, expect, it } from "vitest";
import {
  RECORD_TABLE_NAMES,
  isRecordTable,
  parseRecordCreate,
  parseRecordUpdate,
  recordFormValues,
} from "@/lib/records";

const UUID = "11111111-2222-4333-8444-555555555555";

describe("record create/edit validation", () => {
  it("exposes exactly the three Phase 2 record tables", () => {
    expect(RECORD_TABLE_NAMES.sort()).toEqual(["couriers", "customers", "suppliers"]);
    expect(isRecordTable("orders")).toBe(false);
    expect(isRecordTable("media_assets")).toBe(false);
  });

  it("rejects unknown tables and unknown columns", () => {
    expect(parseRecordCreate("orders", { name: "x" }).ok).toBe(false);
    const r = parseRecordCreate("suppliers", { name: "Acme", risk_score: 0.2, is_admin: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/is_admin|unrecognized/i);
  });

  it("requires a name and keeps booleans explicit", () => {
    expect(parseRecordCreate("suppliers", { name: "   " }).ok).toBe(false);
    const r = parseRecordCreate("suppliers", {
      name: " Acme ",
      real_video_received: "yes",
      sample_approved: "true",
      moq: "50",
      risk_score: "0.35",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Acme");
      expect(r.value.real_video_received).toBe(true);
      expect(r.value.sample_approved).toBe(false);
      expect(r.value.moq).toBe(50);
      expect(r.value.risk_score).toBeCloseTo(0.35);
    }
  });

  it("bounds the supplier risk score to 0..1", () => {
    expect(parseRecordCreate("suppliers", { name: "A", risk_score: 1.5 }).ok).toBe(false);
    expect(parseRecordCreate("suppliers", { name: "A", risk_score: -0.1 }).ok).toBe(false);
  });

  it("restricts customer enums to the schema's values", () => {
    expect(parseRecordCreate("customers", { name_display: "Sara", platform: "snapchat" }).ok).toBe(false);
    expect(parseRecordCreate("customers", { name_display: "Sara", consent_status: "implied" }).ok).toBe(false);
    const ok = parseRecordCreate("customers", { name_display: "Sara", platform: "whatsapp", language: "ar", consent_status: "explicit" });
    expect(ok.ok).toBe(true);
  });

  it("updates only the keys present and needs a uuid id", () => {
    expect(parseRecordUpdate("couriers", { id: "not-a-uuid", name: "DHL" }).ok).toBe(false);
    expect(parseRecordUpdate("couriers", { id: UUID }).ok).toBe(false);
    const r = parseRecordUpdate("couriers", { id: UUID, default_cost: "25", vat_included: "yes" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe(UUID);
      expect(r.value.values).toEqual({ default_cost: 25, vat_included: true });
    }
  });

  it("round-trips a row into form values with booleans as 'yes' or empty", () => {
    const values = recordFormValues("couriers", { id: UUID, name: "Fetchr", default_cost: 20, vat_included: false, created_at: "x" });
    expect(values.name).toBe("Fetchr");
    expect(values.default_cost).toBe("20");
    expect(values.vat_included).toBe("");
    expect("created_at" in values).toBe(false);
    expect(recordFormValues("couriers", { vat_included: true }).vat_included).toBe("yes");
  });
});
