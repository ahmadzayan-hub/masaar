import { describe, it, expect } from "vitest";
import {
  runGuardrails,
  buildTotalBreakdown,
  screenFraudSignals,
  GuardrailInput,
} from "../src/lib/guardrails";
import { resolveArabicName } from "../src/lib/arabic-names";
import { evaluateQc, emptyQc, requiresOwnerApproval } from "../src/lib/operations";
import { ReplyContext, OfferContext } from "../src/lib/types";

const activeOffer: OfferContext = {
  id: "o1",
  name: "Masha'Allah 1pc",
  products_included: ["bracelet"],
  price: 79,
  delivery_rule: "free_dubai",
  vat_rule: "none",
  start_at: new Date(Date.now() - 86400000).toISOString(),
  end_at: new Date(Date.now() + 86400000).toISOString(),
  active: true,
};

function ctx(overrides: Partial<ReplyContext> = {}): ReplyContext {
  return {
    language: "en",
    customerNameDisplay: null,
    customerNameArabicVerified: null,
    emirate: "Dubai",
    activeOffers: [activeOffer],
    inventory: [],
    ...overrides,
  };
}

function base(reply: string, customerMessage: string, overrides: Partial<GuardrailInput> = {}): GuardrailInput {
  return { reply, customerMessage, context: ctx(), ...overrides };
}

describe("§7 claim control", () => {
  it("blocks 'real gold' without evidence and offers safe wording", () => {
    const r = runGuardrails(base("This is real gold, AED 79", "is it gold?"));
    const claim = r.findings.find((f) => f.code === "claim");
    expect(claim?.status).toBe("fail");
    expect(r.requiresHumanApproval).toBe(true);
    expect(r.revisedReply).toContain("gold-tone");
  });

  it("Case 9: 'is it real gold?' answer must be fashion / gold-tone", () => {
    const r = runGuardrails(base("It is fashion jewellery, gold-tone, not real gold. AED 79 🤍", "is it real gold?"));
    expect(r.findings.find((f) => f.code === "claim")).toBeUndefined();
  });
});

describe("§14 privacy", () => {
  it("fails when reply echoes a UAE phone number", () => {
    const r = runGuardrails(base("We will deliver to 0501234567 today", "where do you deliver"));
    const p = r.findings.find((f) => f.code === "privacy");
    expect(p?.status).toBe("fail");
  });
  it("does not flag an AED price as a phone number", () => {
    const r = runGuardrails(base("The price is AED 129 🤍", "how much"));
    expect(r.findings.find((f) => f.code === "privacy")?.status).toBe("pass");
  });
});

describe("§8 stock control", () => {
  it("blocks an unverified in-stock promise", () => {
    const r = runGuardrails(base("Yes it is in stock 🤍", "do you have black?"));
    expect(r.findings.find((f) => f.code === "stock")?.status).toBe("fail");
  });
  it("allows stock confirmation when verified", () => {
    const r = runGuardrails({
      reply: "Yes it is in stock 🤍 shall we reserve?",
      customerMessage: "do you have black?",
      context: ctx({ stockKnownAvailable: true }),
    });
    expect(r.findings.find((f) => f.code === "stock")?.status).toBe("pass");
  });
});

describe("§10 delivery control", () => {
  it("Case 5: blocks same-day promise outside Dubai without courier confirmation", () => {
    const r = runGuardrails({
      reply: "Yes we deliver today to Sharjah 🤍",
      customerMessage: "can you deliver today to Sharjah Al Taawun?",
      context: ctx({ emirate: "Sharjah" }),
    });
    expect(r.findings.find((f) => f.code === "delivery")?.status).toBe("fail");
  });
  it("allows same-day inside Dubai", () => {
    const r = runGuardrails({
      reply: "Yes, expected delivery today in Dubai 🤍 shall we reserve?",
      customerMessage: "deliver today?",
      context: ctx({ emirate: "Dubai" }),
    });
    expect(r.findings.find((f) => f.code === "delivery")?.status).toBe("pass");
  });
});

describe("§9 payment control", () => {
  it("blocks courier dispatch when payment not confirmed", () => {
    const r = runGuardrails({
      reply: "We are dispatching your order now 🤍",
      customerMessage: "send it please",
      context: ctx({ paymentStatus: "needs_verification" }),
      isCourierPromise: true,
    });
    expect(r.findings.find((f) => f.code === "payment")?.status).toBe("fail");
  });
});

describe("§9 total breakdown", () => {
  it("computes exclusive VAT correctly", () => {
    const b = buildTotalBreakdown({ productPrice: 129, deliveryCost: 30, vatRule: "exclusive" });
    expect(b.subtotal).toBe(159);
    expect(b.vatAmount).toBe(7.95);
    expect(b.total).toBe(166.95);
  });
  it("no VAT when rule is none", () => {
    const b = buildTotalBreakdown({ productPrice: 79, deliveryCost: 0, vatRule: "none" });
    expect(b.total).toBe(79);
    expect(b.vatAmount).toBe(0);
  });
});

describe("§4 Arabic names", () => {
  it("Case 1: Rehab maps to رحاب", () => {
    expect(resolveArabicName("Rehab Ismail Fawzy").arabic).toBe("رحاب");
  });
  it("Kay is kept as-is (no blind transliteration)", () => {
    const r = resolveArabicName("Kay");
    expect(r.arabic).toBeNull();
    expect(r.safeAddress).toBe("Kay");
  });
  it("unknown name falls back to title, never guesses", () => {
    const r = resolveArabicName("Zzyzx");
    expect(r.arabic).toBeNull();
    expect(r.safeAddress).toBe("أستاذة");
  });
  it("trusts customer's own Arabic spelling", () => {
    expect(resolveArabicName("Kay", "كي").arabic).toBe("كي");
  });
});

describe("§11 QC checklist", () => {
  it("fails dispatch when any item is unchecked", () => {
    const qc = emptyQc();
    const r = evaluateQc(qc);
    expect(r.passed).toBe(false);
    expect(r.warning).toContain("DO NOT DISPATCH");
  });
  it("passes when all checked", () => {
    const qc = emptyQc();
    (Object.keys(qc) as (keyof typeof qc)[]).forEach((k) => (qc[k] = true));
    expect(evaluateQc(qc).passed).toBe(true);
  });
});

describe("§24 human approval matrix", () => {
  it("refund/exchange/complaint always require owner approval", () => {
    expect(requiresOwnerApproval("refund")).toBe(true);
    expect(requiresOwnerApproval("exchange")).toBe(true);
    expect(requiresOwnerApproval("complaint")).toBe(true);
    expect(requiresOwnerApproval("normal_reply")).toBe(false);
  });
});

describe("§23 fraud screening", () => {
  it("flags courier-before-payment and pressure signals", () => {
    const f = screenFraudSignals({ asksCourierBeforePayment: true, pressureUrgentNoPayment: true });
    expect(f.length).toBe(2);
    expect(f.every((x) => x.requiresHumanApproval)).toBe(true);
  });
});

describe("§5 price-first + length", () => {
  it("Case 3: warns when price question is not answered with a figure", () => {
    const r = runGuardrails(base("Let me tell you about our beautiful collection", "how much?"));
    expect(r.findings.find((f) => f.code === "price")?.status).toBe("warn");
    expect(r.findings.find((f) => f.code === "answered_question")?.status).toBe("warn");
  });
});
