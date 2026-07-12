import { describe, it, expect } from "vitest";
import { leadToSheetRow, statusForAction, recordIntakeOrder, updateOrderStatus, IntakeOrder } from "../src/lib/orders/sink";
import { columnLetter } from "../src/lib/sheets/client";

const sample: IntakeOrder = {
  token: "TOK1",
  orderId: "BSU-0010",
  customerName: "Aisha Al Mansoori",
  phone: "+971506532084",
  whatsappNumber: "+971506532084",
  email: "aisha@example.com",
  emirate: "Dubai",
  area: "JVC",
  fullAddress: "Marina Vista Tower, Flat 904, Street 12",
  orderSummary: "2 bracelets",
  paymentMethod: "Cash on delivery",
  criticalDataStatus: "DATA INTACT",
  orderStatus: "Awaiting Customer Confirmation",
};

describe("leadToSheetRow", () => {
  it("maps to the Form Responses column order with status + token at the end", () => {
    const row = leadToSheetRow(sample);
    expect(row[1]).toBe("Aisha Al Mansoori"); // Full Name
    expect(row[2]).toBe("+971506532084"); // Mobile Number
    expect(row[4]).toBe("Dubai"); // Emirate
    expect(row[10]).toBe("2 bracelets"); // Order Summary Confirmation
    expect(row[18]).toBe("25"); // Delivery Fee
    // Extra trailing columns used for status updates:
    expect(row[20]).toBe("Awaiting Customer Confirmation"); // Order Status (col U)
    expect(row[21]).toBe("TOK1"); // Confirmation Token (col V)
  });
});

describe("statusForAction", () => {
  it("maps each confirmation outcome to a human Order Status", () => {
    expect(statusForAction("confirm")).toBe("Confirmed - In Preparation");
    expect(statusForAction("edit")).toBe("Edit Requested");
    expect(statusForAction("decline")).toBe("Cancelled by Customer");
  });
});

describe("columnLetter", () => {
  it("converts 0-based index to A1 column letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(20)).toBe("U");
    expect(columnLetter(21)).toBe("V");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});

describe("sink mock fallback (no Supabase / no Sheets configured)", () => {
  it("recordIntakeOrder succeeds on both channels in mock mode", async () => {
    const r = await recordIntakeOrder(sample);
    expect(r.supabase.ok).toBe(true);
    expect(r.supabase.provider).toBe("mock");
    expect(r.sheets.ok).toBe(true);
    expect(r.sheets.provider).toBe("mock");
  });

  it("updateOrderStatus succeeds on both channels in mock mode", async () => {
    const r = await updateOrderStatus("TOK1", "Confirmed - In Preparation");
    expect(r.supabase.ok).toBe(true);
    expect(r.sheets.ok).toBe(true);
  });
});
