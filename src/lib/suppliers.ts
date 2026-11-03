// Supplier bulk-purchase gate (roadmap Phase 2: sample/video gating).
//
// Policy, stated on the Suppliers page since the MVP: no bulk purchase without
// a real video and an approved sample. This module makes that policy a single
// pure decision so the page, future forms and tests agree on it.

export interface SupplierGate {
  allowed: boolean;
  blockers: string[];
}

/** Risk score at or above this value blocks bulk purchase regardless of proof. */
export const SUPPLIER_RISK_BLOCK = 0.7;

export function supplierBulkGate(s: Record<string, unknown>): SupplierGate {
  const blockers: string[] = [];
  if (s.real_video_received !== true) blockers.push("real product video not received");
  if (s.sample_approved !== true) blockers.push("sample not approved");
  const proof = String(s.material_proof ?? "").trim().toLowerCase();
  if (!proof || proof === "missing" || proof === "pending") blockers.push("material proof missing");
  const risk = Number(s.risk_score);
  if (Number.isFinite(risk) && risk >= SUPPLIER_RISK_BLOCK) blockers.push("risk score blocked");
  return { allowed: blockers.length === 0, blockers };
}
