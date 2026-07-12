// Minimal Google Sheets API v4 client — dependency-free.
// Signs a service-account JWT with Node's crypto (RS256), exchanges it for an
// OAuth2 access token, and calls the Sheets REST API. No googleapis/google-auth
// dependency. Env-driven with a mock fallback so the app runs with zero config.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — the service-account key JSON (raw or base64).
//   GOOGLE_SHEETS_SPREADSHEET_ID — target spreadsheet id.
//   GOOGLE_SHEETS_TAB            — default worksheet/tab (default "Form Responses").
// Share the spreadsheet with the service account's client_email (Editor).

import { createSign } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface SheetResult {
  ok: boolean;
  provider: "google_sheets" | "mock";
  detail?: string;
  error?: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text);
    if (!json.client_email || !json.private_key) return null;
    // Env vars often escape newlines in the PEM — restore them.
    json.private_key = String(json.private_key).replace(/\\n/g, "\n");
    return json as ServiceAccount;
  } catch {
    return null;
  }
}

export function spreadsheetId(): string | undefined {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
}

export function isConfigured(): boolean {
  return !!loadServiceAccount() && !!spreadsheetId();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Cached access token (valid ~1h).
let cached: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = base64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cached.token;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";

// Append one row to the end of a tab.
export async function appendRow(values: (string | number)[], tab?: string): Promise<SheetResult> {
  const sa = loadServiceAccount();
  const id = spreadsheetId();
  const sheet = tab || process.env.GOOGLE_SHEETS_TAB || "Form Responses";

  if (!sa || !id) {
    console.log(`[sheets:mock] append -> ${sheet}: ${JSON.stringify(values).slice(0, 200)}`);
    return { ok: true, provider: "mock", detail: "logged (configure GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_SHEETS_SPREADSHEET_ID)" };
  }
  try {
    const token = await getAccessToken(sa);
    const range = `${encodeURIComponent(sheet)}!A1`;
    const res = await fetch(
      `${API}/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ values: [values] }),
      }
    );
    if (!res.ok) return { ok: false, provider: "google_sheets", error: `append ${res.status}: ${await res.text()}` };
    const data = await res.json();
    return { ok: true, provider: "google_sheets", detail: data.updates?.updatedRange };
  } catch (e) {
    return { ok: false, provider: "google_sheets", error: e instanceof Error ? e.message : "append failed" };
  }
}

// 0-based column index -> A1 letter (0->A, 26->AA).
export function columnLetter(index: number): string {
  let s = "";
  let n = index;
  do {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Find the row whose `tokenHeader` cell equals `token`, then write `status` into
// that row's `statusHeader` cell. Best-effort — returns ok:false if not found.
export async function updateStatusByToken(
  token: string,
  status: string,
  opts: { tab?: string; tokenHeader?: string; statusHeader?: string } = {}
): Promise<SheetResult> {
  const sa = loadServiceAccount();
  const id = spreadsheetId();
  const sheet = opts.tab || process.env.GOOGLE_SHEETS_TAB || "Form Responses";
  const tokenHeader = opts.tokenHeader || "Confirmation Token";
  const statusHeader = opts.statusHeader || "Order Status";

  if (!sa || !id) {
    console.log(`[sheets:mock] update ${sheet} token=${token} -> ${status}`);
    return { ok: true, provider: "mock", detail: "logged" };
  }
  try {
    const accessToken = await getAccessToken(sa);
    const getRes = await fetch(`${API}/${id}/values/${encodeURIComponent(sheet)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!getRes.ok) return { ok: false, provider: "google_sheets", error: `read ${getRes.status}: ${await getRes.text()}` };
    const rows: string[][] = (await getRes.json()).values || [];
    if (rows.length === 0) return { ok: false, provider: "google_sheets", error: "empty sheet" };

    const header = rows[0];
    const tokenIdx = header.indexOf(tokenHeader);
    const statusIdx = header.indexOf(statusHeader);
    if (tokenIdx < 0 || statusIdx < 0) {
      return { ok: false, provider: "google_sheets", error: `header not found (${tokenHeader}/${statusHeader})` };
    }
    let rowNumber = -1;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][tokenIdx] || "") === token) {
        rowNumber = i + 1; // 1-based sheet row (header is row 1)
        break;
      }
    }
    if (rowNumber < 0) return { ok: false, provider: "google_sheets", error: "token row not found" };

    const cell = `${encodeURIComponent(sheet)}!${columnLetter(statusIdx)}${rowNumber}`;
    const putRes = await fetch(`${API}/${id}/values/${cell}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ values: [[status]] }),
    });
    if (!putRes.ok) return { ok: false, provider: "google_sheets", error: `update ${putRes.status}: ${await putRes.text()}` };
    return { ok: true, provider: "google_sheets", detail: `row ${rowNumber} -> ${status}` };
  } catch (e) {
    return { ok: false, provider: "google_sheets", error: e instanceof Error ? e.message : "update failed" };
  }
}
