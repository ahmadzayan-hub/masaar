import { describe, expect, it } from "vitest";
import { SUPPLIER_RISK_BLOCK, supplierBulkGate } from "@/lib/suppliers";

const vetted = {
  real_video_received: true,
  sample_approved: true,
  material_proof: "lab certificate",
  risk_score: 0.1,
};

describe("supplier bulk-purchase gate", () => {
  it("allows a fully vetted supplier", () => {
    expect(supplierBulkGate(vetted)).toEqual({ allowed: true, blockers: [] });
  });

  it("blocks without a real video, even when everything else is in order", () => {
    const gate = supplierBulkGate({ ...vetted, real_video_received: false });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers).toEqual(["real product video not received"]);
  });

  it("blocks without an approved sample", () => {
    expect(supplierBulkGate({ ...vetted, sample_approved: false }).blockers).toEqual(["sample not approved"]);
  });

  it("treats missing, pending and blank material proof as missing", () => {
    for (const proof of ["missing", "Pending", "", null, undefined]) {
      expect(supplierBulkGate({ ...vetted, material_proof: proof }).blockers, String(proof)).toEqual([
        "material proof missing",
      ]);
    }
  });

  it("blocks at the risk threshold regardless of proof", () => {
    expect(supplierBulkGate({ ...vetted, risk_score: SUPPLIER_RISK_BLOCK }).blockers).toEqual(["risk score blocked"]);
    expect(supplierBulkGate({ ...vetted, risk_score: SUPPLIER_RISK_BLOCK - 0.01 }).allowed).toBe(true);
    expect(supplierBulkGate({ ...vetted, risk_score: "n/a" }).allowed).toBe(true);
  });

  it("lists every blocker for an unvetted supplier", () => {
    const gate = supplierBulkGate({ real_video_received: false, sample_approved: false, material_proof: "missing", risk_score: 0.75 });
    expect(gate.allowed).toBe(false);
    expect(gate.blockers).toHaveLength(4);
  });

  it("never allows on truthy-but-not-true flags", () => {
    expect(supplierBulkGate({ ...vetted, real_video_received: "yes" }).allowed).toBe(false);
    expect(supplierBulkGate({ ...vetted, sample_approved: 1 }).allowed).toBe(false);
  });
});
