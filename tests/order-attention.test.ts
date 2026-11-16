import { describe, expect, it } from "vitest";
import { orderAttention } from "../src/lib/orders/pipeline";

describe("order attention", () => {
  it("requires confirmed payment and explicit quality sign-off before surfacing dispatch", () => {
    const queues = orderAttention([
      { order_status: "awaiting_payment", payment_status: "link_sent" },
      { order_status: "qc", payment_status: "needs_verification", qc: { passed: true } },
      { order_status: "qc", payment_status: "confirmed", qc: {} },
      { order_status: "qc", payment_status: "confirmed", qc: { passed: "true" } },
      { order_status: "qc", payment_status: "confirmed", qc: { passed: true } },
      { order_status: "qc", payment_status: "confirmed", qc: { passed: true }, locked_by_dispute: true },
      { order_status: "delivered", payment_status: "confirmed" },
    ]);
    expect(queues.payment).toHaveLength(2);
    expect(queues.quality).toHaveLength(2);
    expect(queues.dispatch).toHaveLength(1);
  });
});
