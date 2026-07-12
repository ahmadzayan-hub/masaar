// Operational discipline modules: QC checklist (§11), human-approval matrix
// (§24), journey-stage playbook (§16), and return/complaint rules (§12).

import { JourneyStage } from "./types";

// ---- §11 Quality-control checklist (must be 100% before dispatch) ----
export interface QcChecklist {
  correctProduct: boolean;
  correctColour: boolean;
  correctQuantity: boolean;
  correctFinish: boolean;
  customerAdditionsConfirmed: boolean;
  giftBoxReadyIfIncluded: boolean;
  noVisibleDamage: boolean;
  photoSentPrivatelyIfNeeded: boolean;
  customerNameChecked: boolean;
  deliveryAddressChecked: boolean;
  phoneNumberChecked: boolean;
  paymentCompleted: boolean;
  courierCostConfirmed: boolean;
  privacyCheckCompleted: boolean;
  ownerApprovalCompleted: boolean;
}

export const QC_ITEM_LABELS: Record<keyof QcChecklist, string> = {
  correctProduct: "Correct product",
  correctColour: "Correct colour",
  correctQuantity: "Correct quantity",
  correctFinish: "Correct finish (gold-tone / silver-tone)",
  customerAdditionsConfirmed: "Customer additions/removals confirmed",
  giftBoxReadyIfIncluded: "Gift box ready if included",
  noVisibleDamage: "No visible damage",
  photoSentPrivatelyIfNeeded: "Photo sent privately if needed",
  customerNameChecked: "Customer name checked",
  deliveryAddressChecked: "Delivery address checked",
  phoneNumberChecked: "Phone number checked",
  paymentCompleted: "Payment completed",
  courierCostConfirmed: "Courier cost confirmed",
  privacyCheckCompleted: "Privacy check completed",
  ownerApprovalCompleted: "Owner approval completed",
};

export function emptyQc(): QcChecklist {
  return Object.fromEntries(
    Object.keys(QC_ITEM_LABELS).map((k) => [k, false])
  ) as unknown as QcChecklist;
}

export interface QcResult {
  passed: boolean;
  failedItems: string[];
  warning: string | null;
}

export function evaluateQc(qc: QcChecklist): QcResult {
  const failedItems = (Object.keys(qc) as (keyof QcChecklist)[])
    .filter((k) => !qc[k])
    .map((k) => QC_ITEM_LABELS[k]);
  return {
    passed: failedItems.length === 0,
    failedItems,
    warning: failedItems.length ? "DO NOT DISPATCH — QC incomplete." : null,
  };
}

// ---- §24 Human approval matrix ----
// Actions that can NEVER be auto-approved by AI.
export const NEVER_AUTO_APPROVE = [
  "refund",
  "exchange",
  "complaint",
  "payment_issue",
  "courier_delay",
  "bulk_order",
  "supplier_deal",
  "legal_question",
  "angry_customer",
  "sensitive_data",
  "unclear_stock",
  "unclear_price",
  "unclear_delivery_promise",
  "discount_beyond_policy",
] as const;

export type ApprovalGatedAction = (typeof NEVER_AUTO_APPROVE)[number];

export function requiresOwnerApproval(action: string): boolean {
  return (NEVER_AUTO_APPROVE as readonly string[]).includes(action);
}

// ---- §16 Journey-stage playbook ----
export interface StagePlaybook {
  bestReplyHint: string;
  nextAction: string;
  followUpTiming: string;
  ownerActionRequired: boolean;
  riskLevel: "low" | "medium" | "high";
}

export const STAGE_PLAYBOOK: Record<JourneyStage, StagePlaybook> = {
  cold_lead: {
    bestReplyHint: "Warm greeting + show value, ask one qualifying question.",
    nextAction: "Identify product interest.",
    followUpTiming: "Next day if no reply.",
    ownerActionRequired: false,
    riskLevel: "low",
  },
  information_lead: {
    bestReplyHint: "Answer the question simply, then surface the product.",
    nextAction: "Move toward price or customization.",
    followUpTiming: "3–4 hours.",
    ownerActionRequired: false,
    riskLevel: "low",
  },
  price_lead: {
    bestReplyHint: "Answer price directly first, then offer to reserve colour.",
    nextAction: "Confirm product + colour + location.",
    followUpTiming: "3–4 hours, then next-day gentle reminder.",
    ownerActionRequired: false,
    riskLevel: "low",
  },
  warm_lead: {
    bestReplyHint: "Confirm details, build trust with real photos.",
    nextAction: "Collect colour + emirate.",
    followUpTiming: "Same day.",
    ownerActionRequired: false,
    riskLevel: "low",
  },
  hot_lead: {
    bestReplyHint: "Move to order summary + total + payment link quickly.",
    nextAction: "Send total breakdown, then payment link on approval.",
    followUpTiming: "Within the hour.",
    ownerActionRequired: true,
    riskLevel: "medium",
  },
  payment_stage: {
    bestReplyHint: "Confirm total clearly; no dispatch until payment confirmed.",
    nextAction: "Verify payment, reserve stock 12h.",
    followUpTiming: "Within 12h reservation window.",
    ownerActionRequired: true,
    riskLevel: "high",
  },
  delivery_stage: {
    bestReplyHint: "Give expected delivery; subject to courier confirmation.",
    nextAction: "Run QC checklist, confirm courier cost.",
    followUpTiming: "On dispatch + on delivery.",
    ownerActionRequired: true,
    riskLevel: "high",
  },
  after_sale_stage: {
    bestReplyHint: "Thank, ask feedback, soft-consent for future offers.",
    nextAction: "Request review, tag for repeat purchase.",
    followUpTiming: "1–2 days after delivery.",
    ownerActionRequired: false,
    riskLevel: "low",
  },
  complaint_stage: {
    bestReplyHint: "Empathise, do NOT admit liability, ask for clear photos.",
    nextAction: "Escalate to owner immediately.",
    followUpTiming: "Immediate.",
    ownerActionRequired: true,
    riskLevel: "high",
  },
  supplier_stage: {
    bestReplyHint: "Request catalogue, MOQ, sample, video, material, shipping, damage policy.",
    nextAction: "Run supplier screening; no blind bulk purchase.",
    followUpTiming: "As needed.",
    ownerActionRequired: true,
    riskLevel: "medium",
  },
  lost_lead: {
    bestReplyHint: "One gentle re-engagement only, then stop.",
    nextAction: "Tag lost reason for weekly review.",
    followUpTiming: "Stop unless customer re-engages.",
    ownerActionRequired: false,
    riskLevel: "low",
  },
};

// ---- §12 Return / exchange / complaint default rules ----
export const RETURN_RULES = {
  customized: "Customized items are not exchangeable/returnable unless seller error is confirmed.",
  fashion: "Fashion accessories may be exchanged only if unused & in original condition, subject to approval.",
  exchangeDelivery: "Delivery charges for exchange may apply.",
  damageWindow: "Damage must be reported with clear photos within the defined time window.",
  sellerError: "Wrong item / seller mistake must be escalated to owner.",
};

export const COMPLAINT_ESCALATION_TRIGGERS = [
  "angry customer",
  "refund request",
  "wrong item delivered",
  "delivery delay",
  "payment issue",
  "custom item dispute",
  "material claim issue",
  "damaged product",
  "courier failure",
  "legal or invoice request",
];
