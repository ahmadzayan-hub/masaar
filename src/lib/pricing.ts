// Beyond Style UAE — pricing & billing constants (Phase 3 operating rules).
// Single source of truth for the order-total formula and the cancellation /
// exchange fees, mirrored from the Python fulfillment core. Per the agent spec
// we NEVER guess a cash collection: if the order value can't be determined from
// structured inputs, computeCashCollection returns null and the customer card
// shows the order summary without a fabricated total.

export const DELIVERY_FEE_AED = 25; // mandated UAE courier fee (Halan Logistics)
export const POST_ARRIVAL_CANCELLATION_AED = 25; // base courier fee on post-arrival cancel
export const EXCHANGE_FEE_AED = 50; // double delivery (25 retrieval + 25 redelivery)

export interface CatalogItem {
  single: number;
  tier2: number; // total price for 2 pcs
  tier3: number; // total price for 3 pcs
}

// Core catalog (matches python-agent PRODUCT_PRICING_CATALOG + Product Catalog sheet).
export const PRODUCT_CATALOG: Record<string, CatalogItem> = {
  "BSU-MA-BR": { single: 79, tier2: 129, tier3: 159 }, // Masha'Allah Bracelet
  "BSU-HOB-NK": { single: 59, tier2: 108, tier3: 147 }, // Hob حب Necklace
};

// Tier price for a known SKU + quantity (3+ uses the 3-pc tier).
export function tierPrice(sku: string, quantity: number): number | null {
  const item = PRODUCT_CATALOG[sku];
  if (!item) return null;
  if (quantity <= 1) return item.single;
  if (quantity === 2) return item.tier2;
  return item.tier3;
}

export interface CashCollection {
  orderValue: number;
  deliveryFee: number;
  total: number; // expected cash collection (COD) including delivery
}

// Mandatory formula: total = order value + fixed 25 AED delivery fee.
// Inputs (in priority order): an explicit orderValueAed (e.g. the form's
// "Order Total"), otherwise a catalog SKU + quantity. Returns null when neither
// is available — we do not approximate cash.
export function computeCashCollection(input: {
  orderValueAed?: number | null;
  sku?: string | null;
  quantity?: number | null;
}): CashCollection | null {
  let orderValue: number | null = null;

  if (typeof input.orderValueAed === "number" && input.orderValueAed > 0) {
    orderValue = input.orderValueAed;
  } else if (input.sku) {
    orderValue = tierPrice(input.sku, input.quantity ?? 1);
  }

  if (orderValue == null || !Number.isFinite(orderValue) || orderValue <= 0) return null;
  return { orderValue, deliveryFee: DELIVERY_FEE_AED, total: orderValue + DELIVERY_FEE_AED };
}
