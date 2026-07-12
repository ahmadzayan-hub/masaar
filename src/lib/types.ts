// Beyond Style UAE — Customer Conversion & Order Control Agent
// Core domain types. These mirror the Supabase schema (see supabase/migrations).

export type Platform =
  | "instagram"
  | "whatsapp"
  | "tiktok"
  | "meta_ads"
  | "comment"
  | "other";

export type Language = "ar" | "en" | "mixed";

// Sales-relevant persona signals ONLY. Never nationality, religion, age,
// income, family status, health, or other sensitive traits.
export type Persona =
  | "gift_buyer"
  | "personal_buyer"
  | "customization_buyer"
  | "price_sensitive_buyer"
  | "urgent_buyer"
  | "hot_lead"
  | "repeat_buyer"
  | "vip_buyer"
  | "supplier_or_platform_lead"
  | "lost_lead"
  | "hesitant_buyer";

export type LeadTemperature = "cold" | "warm" | "hot";

export type JourneyStage =
  | "cold_lead"
  | "information_lead"
  | "price_lead"
  | "warm_lead"
  | "hot_lead"
  | "payment_stage"
  | "delivery_stage"
  | "after_sale_stage"
  | "complaint_stage"
  | "supplier_stage"
  | "lost_lead";

export type RiskLevel = "low" | "medium" | "high" | "block";

export type PhotoClassification =
  | "real_stock_photo"
  | "supplier_photo"
  | "ai_generated_photo"
  | "customer_private_order_photo"
  | "competitor_reference_photo"
  | "unclear";

export type ProductCategory =
  | "fashion_bracelet"
  | "custom_name_necklace"
  | "car_hanger"
  | "graduation_charm"
  | "gift_box"
  | "ring"
  | "anklet"
  | "supplier_item"
  | "other";

export type PaymentStatus =
  | "none"
  | "link_sent"
  | "needs_verification"
  | "confirmed"
  | "refunded";

export type CourierStatus =
  | "none"
  | "awaiting_confirmation"
  | "confirmed"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed";

export type OrderStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "qc"
  | "dispatched"
  | "delivered"
  | "cancelled"
  | "complaint";

// ---- Guardrails ----

export type GuardrailCode =
  | "price"
  | "stock"
  | "delivery"
  | "payment"
  | "vat"
  | "claim"
  | "privacy"
  | "arabic_name"
  | "length"
  | "answered_question"
  | "moves_to_payment"
  | "human_escalation";

export interface GuardrailFinding {
  code: GuardrailCode;
  status: "pass" | "warn" | "fail";
  message: string;
  // When set, the operator MUST approve manually before sending.
  requiresHumanApproval?: boolean;
}

export interface GuardrailResult {
  findings: GuardrailFinding[];
  worstStatus: "pass" | "warn" | "fail";
  requiresHumanApproval: boolean;
  // Safe-reworded reply when the engine could auto-correct unsafe wording.
  revisedReply?: string;
}

// ---- AI structured analysis output (spec §17) ----

export interface AnalysisOutput {
  customer_intent: string;
  lead_temperature: LeadTemperature;
  customer_persona: Persona;
  product_identified: ProductCategory | "unknown";
  name_check: string;
  correct_arabic_name: string | null;
  missing_information: string[];
  risk_or_caution: string[];
  best_reply_to_send: string;
  next_action: string;
  follow_up_timing: string;
  internal_sales_note: string;
  order_record_update: Record<string, unknown> | null;
  confidence_score: number; // 0..1
}

// ---- Offers / pricing context passed to the guardrail engine ----

export interface OfferContext {
  id: string;
  name: string;
  products_included: string[];
  price: number;
  delivery_rule: "free_dubai" | "courier_confirm" | "flat" | "excluded";
  vat_rule: "inclusive" | "exclusive" | "none";
  start_at: string;
  end_at: string;
  active: boolean;
}

export interface InventoryContext {
  product_id: string;
  colour: string;
  finish: "gold_tone" | "silver_tone" | "other";
  quantity_available: number;
}

export interface ReplyContext {
  language: Language;
  customerNameDisplay: string | null;
  customerNameArabicVerified: string | null;
  emirate?: string | null;
  // The owner-quoted figures the reply will reference (if any).
  quotedPrice?: number | null;
  quotedDeliveryCost?: number | null;
  vatApplicable?: boolean;
  paymentStatus?: PaymentStatus;
  courierConfirmed?: boolean;
  stockKnownAvailable?: boolean;
  activeOffers: OfferContext[];
  inventory: InventoryContext[];
}
