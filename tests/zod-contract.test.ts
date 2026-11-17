import { describe, expect, it } from "vitest";
import { parseMediaMeta } from "@/lib/media";
import { parseRecordCreate } from "@/lib/records";

// zod 4 rejects an absent key unless the schema is optional. These pin the
// behaviour the forms and webhooks rely on: omitted optional fields normalise
// to null / false instead of failing, and wrong types are still rejected.
describe("zod 4 absent keys and strictness", () => {
  it("omitted optional record columns normalise to null", () => {
    const r = parseRecordCreate("suppliers", { name: "Acme" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.country).toBeNull();
      expect(r.value.contact).toBeNull();
    }
  });

  it("a non-string value in a text column is still rejected", () => {
    const r = parseRecordCreate("suppliers", { name: "Acme", country: { x: 1 } });
    expect(r.ok).toBe(false);
  });

  it("an unknown column is still rejected by strict()", () => {
    const r = parseRecordCreate("suppliers", { name: "Acme", is_admin: true });
    expect(r.ok).toBe(false);
  });

  it("omitted explicit-yes flags record false, never true", () => {
    const r = parseMediaMeta({ photo_classification: "unclear" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.contains_private_data).toBe(false);
  });

  it("uuid checks follow RFC 9562: a v4 id passes, an all-zero id does not", () => {
    const base = { photo_classification: "unclear" };
    expect(parseMediaMeta({ ...base, order_id: "3f2b8c1e-5a4d-4c3b-9e8f-1a2b3c4d5e6f" }).ok).toBe(true);
    expect(parseMediaMeta({ ...base, order_id: "00000000-0000-0000-0000-00000000000a" }).ok).toBe(false);
  });
});
