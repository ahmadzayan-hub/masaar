import { describe, it, expect } from "vitest";
import {
  computeCashCollection,
  tierPrice,
  DELIVERY_FEE_AED,
  EXCHANGE_FEE_AED,
} from "../src/lib/pricing";

describe("tierPrice", () => {
  it("applies volumetric tiers for known SKUs", () => {
    expect(tierPrice("BSU-MA-BR", 1)).toBe(79);
    expect(tierPrice("BSU-MA-BR", 2)).toBe(129);
    expect(tierPrice("BSU-MA-BR", 5)).toBe(159); // 3+ uses the 3-pc tier
    expect(tierPrice("UNKNOWN", 1)).toBeNull();
  });
});

describe("computeCashCollection (total = order value + 25 delivery)", () => {
  it("uses an explicit order value", () => {
    expect(computeCashCollection({ orderValueAed: 129 })).toEqual({
      orderValue: 129,
      deliveryFee: DELIVERY_FEE_AED,
      total: 154,
    });
  });
  it("falls back to catalog SKU + quantity", () => {
    expect(computeCashCollection({ sku: "BSU-MA-BR", quantity: 2 })?.total).toBe(154);
  });
  it("never guesses — returns null without an order value or known SKU", () => {
    expect(computeCashCollection({})).toBeNull();
    expect(computeCashCollection({ orderValueAed: 0 })).toBeNull();
    expect(computeCashCollection({ sku: "UNKNOWN", quantity: 3 })).toBeNull();
  });
  it("exposes the exchange fee constant (double delivery)", () => {
    expect(EXCHANGE_FEE_AED).toBe(50);
  });
});
