import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  normalizeStatus,
  isValidTransition,
  roleMayTransition,
  nextStatusesFor,
  eventForTransition,
  STATUS_LABELS,
  type OrderStatus,
} from "@/lib/orders/lifecycle";

describe("order lifecycle — canonical path", () => {
  it("walks the full happy path lead → after_sales", () => {
    const path: OrderStatus[] = [
      "lead",
      "qualified",
      "confirmed",
      "paid",
      "design_approval",
      "production",
      "qc",
      "dispatched",
      "delivered",
      "after_sales",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("rejects skipping stages", () => {
    expect(isValidTransition("lead", "paid")).toBe(false);
    expect(isValidTransition("confirmed", "production")).toBe(false);
    expect(isValidTransition("qualified", "delivered")).toBe(false);
  });

  it("rejects moving backwards except qc rework", () => {
    expect(isValidTransition("qc", "production")).toBe(true);
    expect(isValidTransition("delivered", "dispatched")).toBe(false);
    expect(isValidTransition("paid", "confirmed")).toBe(false);
  });

  it("terminal states have no exits", () => {
    expect(ORDER_TRANSITIONS.cancelled).toHaveLength(0);
    expect(ORDER_TRANSITIONS.after_sales).toHaveLength(0);
  });

  it("cancellation is possible pre-dispatch but not after dispatch", () => {
    for (const from of ["lead", "qualified", "confirmed", "paid", "design_approval", "production", "qc"] as const) {
      expect(isValidTransition(from, "cancelled"), `${from} -> cancelled`).toBe(true);
    }
    expect(isValidTransition("dispatched", "cancelled")).toBe(false);
    expect(isValidTransition("delivered", "cancelled")).toBe(false);
  });
});

describe("order lifecycle — RBAC", () => {
  it("finance (or owner) marks orders paid; operators cannot", () => {
    expect(roleMayTransition("finance", "confirmed", "paid")).toBe(true);
    expect(roleMayTransition("owner", "confirmed", "paid")).toBe(true);
    expect(roleMayTransition("operator", "confirmed", "paid")).toBe(false);
  });

  it("workshop owns production and qc, not sales", () => {
    expect(roleMayTransition("workshop", "production", "qc")).toBe(true);
    expect(roleMayTransition("workshop", "qc", "production")).toBe(true);
    expect(roleMayTransition("workshop", "lead", "qualified")).toBe(false);
    expect(roleMayTransition("operator", "production", "qc")).toBe(false);
  });

  it("readonly can never transition anything", () => {
    for (const from of ORDER_STATUSES) {
      expect(nextStatusesFor("readonly", from)).toHaveLength(0);
    }
  });

  it("late cancellation (after payment) is owner-only", () => {
    expect(roleMayTransition("owner", "paid", "cancelled")).toBe(true);
    expect(roleMayTransition("operator", "paid", "cancelled")).toBe(false);
    expect(roleMayTransition("operator", "confirmed", "cancelled")).toBe(true);
  });

  it("owner can complete the entire happy path", () => {
    let s: OrderStatus = "lead";
    const targets: OrderStatus[] = [
      "qualified", "confirmed", "paid", "design_approval",
      "production", "qc", "dispatched", "delivered", "after_sales",
    ];
    for (const to of targets) {
      expect(roleMayTransition("owner", s, to), `${s} -> ${to}`).toBe(true);
      s = to;
    }
  });
});

describe("order lifecycle — legacy normalization", () => {
  it("maps legacy statuses to canonical ones", () => {
    expect(normalizeStatus("draft")).toBe("lead");
    expect(normalizeStatus("awaiting_payment")).toBe("confirmed");
    expect(normalizeStatus("complaint")).toBe("after_sales");
  });

  it("keeps canonical statuses and defaults unknowns to lead", () => {
    expect(normalizeStatus("qc")).toBe("qc");
    expect(normalizeStatus("  Delivered ")).toBe("delivered");
    expect(normalizeStatus(undefined)).toBe("lead");
    expect(normalizeStatus("whatever")).toBe("lead");
  });
});

describe("order lifecycle — domain events", () => {
  it("emits the portfolio events on the key milestones", () => {
    expect(eventForTransition("confirmed")).toBe("customer.order_confirmed");
    expect(eventForTransition("paid")).toBe("order.paid");
    expect(eventForTransition("dispatched")).toBe("order.dispatched");
    expect(eventForTransition("delivered")).toBe("order.delivered");
    expect(eventForTransition("cancelled")).toBe("order.cancelled");
    expect(eventForTransition("after_sales")).toBe("order.after_sales_opened");
    expect(eventForTransition("qualified")).toBeNull();
    expect(eventForTransition("production")).toBeNull();
  });
});

describe("order lifecycle — completeness", () => {
  it("every status has a transitions entry and bilingual label", () => {
    for (const s of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[s], s).toBeDefined();
      expect(STATUS_LABELS[s].en.length).toBeGreaterThan(0);
      expect(STATUS_LABELS[s].ar.length).toBeGreaterThan(0);
    }
  });

  it("every transition target is a known status", () => {
    for (const s of ORDER_STATUSES) {
      for (const t of ORDER_TRANSITIONS[s]) {
        expect(ORDER_STATUSES).toContain(t.to);
      }
    }
  });
});
