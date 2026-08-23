import { describe, expect, it } from "vitest";
import { PIPELINE_STAGES, stageCounts, todaySummary, filterByStage } from "@/lib/orders/pipeline";
import { ORDER_STATUSES } from "@/lib/orders/lifecycle";

const orders = [
  { order_status: "lead" },
  { order_status: "lead" },
  { order_status: "qualified" },
  { order_status: "confirmed" },
  { order_status: "paid" },
  { order_status: "design_approval" },
  { order_status: "production" },
  { order_status: "qc" },
  { order_status: "dispatched" },
  { order_status: "delivered" },
  { order_status: "after_sales" },
  { order_status: "draft" }, // legacy → lead
  { order_status: "complaint" }, // legacy → after_sales
];

describe("pipeline view-model", () => {
  it("covers every canonical status exactly once, flow before outcomes", () => {
    expect(PIPELINE_STAGES.map((s) => s.key)).toEqual([...ORDER_STATUSES]);
    const kinds = PIPELINE_STAGES.map((s) => s.kind);
    expect(kinds.filter((k) => k === "outcome")).toHaveLength(3);
  });

  it("counts orders per stage with legacy normalization", () => {
    const c = stageCounts(orders);
    expect(c.lead).toBe(3); // 2 lead + 1 legacy draft
    expect(c.after_sales).toBe(2); // 1 + legacy complaint
    expect(c.qualified).toBe(1);
    expect(c.cancelled).toBe(0);
  });

  it("summarises the TODAY strip", () => {
    const t = todaySummary(stageCounts(orders));
    expect(t.needConfirmation).toBe(4);
    expect(t.awaitingPayment).toBe(1);
    expect(t.inProduction).toBe(2);
    expect(t.inQc).toBe(1);
    expect(t.withCourier).toBe(1);
    expect(t.problems).toBe(2);
  });

  it("filters by stage including legacy aliases", () => {
    expect(filterByStage(orders, "lead")).toHaveLength(3);
    expect(filterByStage(orders, "complaint")).toHaveLength(2); // alias of after_sales
    expect(filterByStage(orders, undefined)).toHaveLength(orders.length);
  });
});
