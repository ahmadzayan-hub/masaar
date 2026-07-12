import { describe, it, expect, beforeEach } from "vitest";
import {
  buttonId,
  parseButtonPayload,
  classifyText,
  buildConfirmationRequest,
} from "../src/lib/confirm/messages";
import { parseInbound } from "../src/lib/confirm/inbound";
import {
  createConfirmation,
  getByToken,
  getLatestAwaitingByPhone,
  updateStatus,
  newToken,
  usingMemory,
  wasProcessed,
  markProcessed,
  listConfirmations,
  expireStale,
  incrementAttempt,
  _clearMemory,
} from "../src/lib/confirm/store";

describe("button payloads", () => {
  it("round-trips action + token", () => {
    const id = buttonId("confirm", "abc123");
    expect(parseButtonPayload(id)).toEqual({ action: "confirm", token: "abc123" });
    expect(parseButtonPayload("edit:tok-en_9")).toEqual({ action: "edit", token: "tok-en_9" });
  });
  it("rejects malformed ids", () => {
    expect(parseButtonPayload("nope")).toBeNull();
    expect(parseButtonPayload("")).toBeNull();
  });
});

describe("classifyText (free-text fallback)", () => {
  it("classifies Arabic and English replies", () => {
    expect(classifyText("نعم")).toBe("confirm");
    expect(classifyText("YES please")).toBe("confirm");
    expect(classifyText("تأكيد")).toBe("confirm");
    expect(classifyText("لا")).toBe("decline");
    expect(classifyText("cancel")).toBe("decline");
    expect(classifyText("تعديل الرقم")).toBe("edit");
    expect(classifyText("the number is wrong")).toBe("edit");
  });
  it("returns null for ambiguous text", () => {
    expect(classifyText("hello")).toBeNull();
    expect(classifyText("")).toBeNull();
  });
});

describe("buildConfirmationRequest", () => {
  it("shows the phone + summary and emits 3 buttons with tokenized ids", () => {
    const { body, buttons } = buildConfirmationRequest({
      token: "T1",
      customerName: "Aisha Al Mansoori",
      phone: "+971506532084",
      orderSummary: "2 bracelets",
    });
    expect(body).toContain("+971506532084");
    expect(body).toContain("2 bracelets");
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.id)).toEqual(["confirm:T1", "edit:T1", "decline:T1"]);
  });

  it("asks to confirm the number takes delivery voice calls and shows a single total", () => {
    const { body } = buildConfirmationRequest({
      token: "T1",
      phone: "+971506532084",
      orderSummary: "2 bracelets",
      totalAed: 154,
    });
    expect(body).toMatch(/voice calls/i); // spec: confirm number receives driver calls
    expect(body).toContain("154 AED");
    // single total line — no multi-layer breakdown of value + fee
    expect(body).not.toMatch(/delivery fee\s*[:=]/i);
  });

  it("adds the live-pin fallback only when the maps pin is missing", () => {
    const withPin = buildConfirmationRequest({ token: "T1", phone: "+9715", needsMapPin: false }).body;
    const noPin = buildConfirmationRequest({ token: "T1", phone: "+9715", needsMapPin: true }).body;
    expect(withPin).not.toMatch(/Maps pin/i);
    expect(noPin).toMatch(/Maps pin/i);
  });
});

describe("parseInbound", () => {
  it("extracts an interactive button reply", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "971506532084",
                    id: "wamid.X",
                    type: "interactive",
                    interactive: { type: "button_reply", button_reply: { id: "confirm:T1", title: "Confirm" } },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const msgs = parseInbound(body);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].buttonId).toBe("confirm:T1");
    expect(msgs[0].from).toBe("971506532084");
  });
  it("extracts a text reply", () => {
    const body = {
      entry: [{ changes: [{ value: { messages: [{ from: "971500000000", type: "text", text: { body: "نعم" } }] } }] }],
    };
    expect(parseInbound(body)[0].text).toBe("نعم");
  });
  it("returns [] for status-only callbacks", () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }] };
    expect(parseInbound(body)).toEqual([]);
  });
});

describe("confirmation store (memory fallback)", () => {
  beforeEach(() => _clearMemory());

  it("uses memory when Supabase is not configured", () => {
    expect(usingMemory()).toBe(true);
  });

  it("creates, finds by token, and confirms", async () => {
    const token = newToken();
    await createConfirmation({
      token,
      phone: "+971506532084",
      customerName: "Aisha",
      orderSummary: "2 bracelets",
    });
    const found = await getByToken(token);
    expect(found?.status).toBe("awaiting");

    const updated = await updateStatus(token, "confirmed");
    expect(updated?.status).toBe("confirmed");
    expect(updated?.respondedAt).toBeTruthy();
  });

  it("finds the latest awaiting confirmation by phone", async () => {
    await createConfirmation({ token: newToken(), phone: "+971500000001" });
    const found = await getLatestAwaitingByPhone("+971500000001");
    expect(found?.phone).toBe("+971500000001");
    // a confirmed one should not match an awaiting lookup
    await updateStatus(found!.token, "confirmed");
    expect(await getLatestAwaitingByPhone("+971500000001")).toBeNull();
  });
});

describe("idempotency (inbound dedupe)", () => {
  beforeEach(() => _clearMemory());

  it("marks and detects processed event ids", async () => {
    expect(await wasProcessed("wamid.1")).toBe(false);
    await markProcessed("wamid.1");
    expect(await wasProcessed("wamid.1")).toBe(true);
    // empty id is never considered processed
    expect(await wasProcessed("")).toBe(false);
  });
});

describe("real-time queue helpers", () => {
  beforeEach(() => _clearMemory());

  it("lists confirmations and filters by status", async () => {
    await createConfirmation({ token: newToken(), phone: "+971500000010" });
    const t2 = newToken();
    await createConfirmation({ token: t2, phone: "+971500000011" });
    await updateStatus(t2, "confirmed");

    expect((await listConfirmations()).length).toBe(2);
    expect((await listConfirmations({ status: "confirmed" })).length).toBe(1);
    expect((await listConfirmations({ status: "awaiting" })).length).toBe(1);
  });

  it("expires awaiting confirmations older than the TTL", async () => {
    const token = newToken();
    const rec = await createConfirmation({ token, phone: "+971500000012" });
    // Backdate creation by 48h to trip the 24h TTL.
    (rec as any).createdAt = new Date(Date.now() - 48 * 3600_000).toISOString();
    const n = await expireStale(24);
    expect(n).toBe(1);
    expect((await getByToken(token))?.status).toBe("expired");
  });

  it("increments the attempt counter (resend policy)", async () => {
    const token = newToken();
    await createConfirmation({ token, phone: "+971500000013" });
    expect((await getByToken(token))?.attempts).toBe(1);
    const updated = await incrementAttempt(token);
    expect(updated?.attempts).toBe(2);
  });
});
