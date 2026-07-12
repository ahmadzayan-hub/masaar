import { describe, it, expect } from "vitest";
import {
  validateSubmission,
  normalizeUaePhone,
  validateMapsLink,
  matchEmirate,
  hasAddressLandmark,
} from "../src/lib/intake/validate";

describe("normalizeUaePhone", () => {
  it("normalizes a spaced local number to E.164 + 12-digit canonical", () => {
    const r = normalizeUaePhone("050 653 2084");
    expect(r).toEqual({ value: "+971506532084", digits12: "971506532084", ok: true });
    expect(r.digits12).toHaveLength(12); // spec: exactly 12 digits
  });
  it("normalizes +971 and 00971 prefixes", () => {
    expect(normalizeUaePhone("+971506532084").ok).toBe(true);
    expect(normalizeUaePhone("00971506532084").value).toBe("+971506532084");
    expect(normalizeUaePhone("00971506532084").digits12).toBe("971506532084");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeUaePhone("12345").ok).toBe(false);
    expect(normalizeUaePhone("").ok).toBe(false);
    expect(normalizeUaePhone("0511234567").ok).toBe(false); // 51 not a valid prefix
  });
});

describe("validateMapsLink", () => {
  it("accepts google maps hosts", () => {
    expect(validateMapsLink("https://maps.google.com/?q=25.0,55.2").ok).toBe(true);
    expect(validateMapsLink("https://goo.gl/maps/abc123").ok).toBe(true);
    expect(validateMapsLink("https://maps.app.goo.gl/xyz").ok).toBe(true);
  });
  it("rejects loose text and non-maps links", () => {
    expect(validateMapsLink("near the big mosque").ok).toBe(false);
    expect(validateMapsLink("https://example.com").ok).toBe(false);
    expect(validateMapsLink("").ok).toBe(false);
  });
});

describe("matchEmirate", () => {
  it("matches canonical and partial emirate names", () => {
    expect(matchEmirate("dubai")).toBe("Dubai");
    expect(matchEmirate("Dubai - JVC")).toBe("Dubai");
    expect(matchEmirate("Mars")).toBeNull();
  });
});

describe("hasAddressLandmark", () => {
  it("accepts addresses with landmark tokens (EN/AR)", () => {
    expect(hasAddressLandmark("Marina Vista Tower, Flat 904, Street 12")).toBe(true);
    expect(hasAddressLandmark("بناية رقم 5 شقة 3")).toBe(true);
  });
  it("rejects short or vague addresses", () => {
    expect(hasAddressLandmark("Dubai")).toBe(false);
    expect(hasAddressLandmark("")).toBe(false);
  });
});

describe("validateSubmission", () => {
  it("passes a complete submission", () => {
    const r = validateSubmission({
      fullName: "Aisha Al Mansoori",
      mobileNumber: "050 653 2084",
      email: "aisha@example.com",
      emirate: "Dubai",
      fullAddress: "JVC Marina Vista Tower, Flat 904, Street 12",
    });
    expect(r.valid).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(r.normalized.mobileNumber).toBe("+971506532084");
    expect(r.normalized.whatsappNumber).toBe("+971506532084");
  });

  it("flags missing/invalid fields as errors", () => {
    const r = validateSubmission({
      fullName: ".",
      mobileNumber: "bad",
      emirate: "Nowhere",
      fullAddress: "x",
    });
    expect(r.valid).toBe(false);
    const fields = r.issues.filter((i) => i.severity === "error").map((i) => i.field);
    expect(fields).toContain("fullName");
    expect(fields).toContain("mobileNumber");
    expect(fields).toContain("emirate");
    expect(fields).toContain("fullAddress");
  });

  it("treats a missing email as a warning, not a hard error", () => {
    const r = validateSubmission({
      fullName: "Mona",
      mobileNumber: "0508485199",
      emirate: "Dubai",
      fullAddress: "Muhaisnah 3, Building 12, Flat 5",
    });
    expect(r.valid).toBe(true);
    expect(r.issues.some((i) => i.field === "email" && i.severity === "warning")).toBe(true);
  });

  it("flags a missing maps pin as a soft gate (warning + needsMapPin), still valid", () => {
    const r = validateSubmission({
      fullName: "Mona",
      mobileNumber: "0508485199",
      emirate: "Dubai",
      fullAddress: "Muhaisnah 3, Building 12, Flat 5",
    });
    expect(r.valid).toBe(true);
    expect(r.needsMapPin).toBe(true);
    expect(r.issues.some((i) => i.field === "googleMaps" && i.severity === "warning")).toBe(true);
  });

  it("clears needsMapPin with a valid Google Maps link and exposes the 12-digit number", () => {
    const r = validateSubmission({
      fullName: "Aisha",
      mobileNumber: "050 653 2084",
      emirate: "Dubai",
      fullAddress: "JVC Marina Vista Tower, Flat 904, Street 12",
      googleMapsLocation: "https://maps.google.com/?q=25.067,55.208",
    });
    expect(r.needsMapPin).toBe(false);
    expect(r.normalized.mobileDigits12).toBe("971506532084");
  });
});
