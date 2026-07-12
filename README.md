# Beyond Style UAE — Customer Conversion & Order Control Agent

A **human-approved sales operating console** for Beyond Style UAE
(BEYOND CONNECT GENERAL TRADING L.L.C). This is **not** an auto-reply bot. It is
a control tower for UAE social commerce: the agent **drafts** replies and order
actions, the owner **approves**, the system **tracks**, and the dashboard
**learns**. Automation comes later — only after the system proves it does not
make pricing, delivery, stock, or privacy mistakes.

> The agent drafts → you approve → the system tracks → the dashboard learns → automation comes later.

## Why this shape

If you automate too early, you scale mistakes. This MVP scales *discipline*
instead: every drafted customer reply is forced through a **guardrail engine**
before an operator can approve and send it.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Supabase** (Postgres + Auth + Storage)
- **Configurable AI provider wrapper** — OpenAI / Anthropic (Claude) / Gemini /
  `mock`. No API keys are hard-coded; everything is env-driven.
- **Vitest** for the guardrail/logic test suite.

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in Supabase + AI provider (optional)
npm run test                    # guardrail / intake / confirmation / pricing suite
npm run dev                     # http://localhost:3000
```

> Single Next.js app at the repo root. The standalone Python LangGraph backend
> lives in `python-agent/` (see its own README).

The app runs **before** Supabase is configured (pages show a "connect Supabase"
hint) and **before** an AI key is set (`AI_PROVIDER=mock` returns placeholder
analysis so you can see the flow end-to-end).

### Database

In the Supabase SQL editor (or via the CLI), run in order:

1. `supabase/migrations/0001_schema.sql` — all tables + RLS.
2. `supabase/seed.sql` — default catalogue, offers, couriers, prompts,
   settings, and the §30 test-scenario conversations.

### Environment

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side privileged writes |
| `AI_PROVIDER` | `openai` \| `anthropic` \| `gemini` \| `mock` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | provider keys |
| `WEBHOOK_SECRET` | optional shared secret for `/api/webhook/form-intake` |
| `WHATSAPP_PROVIDER` + `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp send (`meta` \| `mock`) |
| `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` | inbound `/api/webhook/whatsapp` verification + signature |
| `EMAIL_PROVIDER` + `RESEND_API_KEY` / `EMAIL_FROM` | email thank-you (`resend` \| `mock`) |

## Form intake + WhatsApp confirmation gate

The Google Form flow is **form → webhook → validate → WhatsApp confirm → release**.
An order is **held until the customer confirms on WhatsApp** — this proves the
number is reachable/correct and that the customer still wants the order, so the
Halan courier is never dispatched to a wrong number or a non-responsive customer.

**Wiring the form.** Google Forms have no native webhook, so
`scripts/google-form-apps-script.gs` (an `onFormSubmit` Apps Script) POSTs each
submission to the webhook. Set the `WEBHOOK_URL` / `WEBHOOK_SECRET` script
properties and add an "On form submit" trigger.

**`POST /api/webhook/form-intake`** — on each submission:

1. (optional) checks `WEBHOOK_SECRET` via the `x-webhook-secret` header;
2. validates the details (`src/lib/intake/validate.ts`): UAE mobile normalized to
   `+9715XXXXXXXX`, recognized emirate, address with landmark detail;
3. **valid** → opens an `order_confirmations` record (status `awaiting`),
   **extracts the customer's number, and sends a WhatsApp confirmation request
   with interactive buttons** (✅ Confirm / ✏️ Edit / ❌ Cancel). Returns the
   `leadRow` with `Order Status = "Awaiting Customer Confirmation"` (HTTP 200);
4. **invalid** → asks the customer (WhatsApp/email) to fix the flagged fields and
   opens no confirmation (HTTP 422).

**`/api/webhook/whatsapp`** — the inbound side:

- `GET` → Meta verification handshake (`WHATSAPP_VERIFY_TOKEN`);
- `POST` → receives the reply (button tap, or free-text نعم/YES/لا/تعديل as a
  fallback), verifies `X-Hub-Signature-256` (`WHATSAPP_APP_SECRET`), matches the
  open confirmation, updates its status, and replies with the right follow-up.
  A **Confirm releases the order to preparation**; Edit/Cancel hold or cancel it.

Confirmation state persists in Supabase (`order_confirmations`, migration
`0003`) when `SUPABASE_SERVICE_ROLE_KEY` is set; otherwise an in-memory fallback
runs (dev/test only — the response includes a `warning`). All messaging is
env-driven with a **mock fallback** (works with zero keys); set
`WHATSAPP_PROVIDER=meta` (+ token / phone-number id / verify token / app secret)
to go live. See `src/lib/notify/` and `src/lib/confirm/`.

```bash
# 1) form submit → opens confirmation + sends WhatsApp buttons
curl -X POST http://localhost:3000/api/webhook/form-intake -H 'content-type: application/json' \
  -d '{"Full Name":"Aisha","Mobile Number":"050 653 2084","Emirate":"Dubai","Full Address":"Marina Vista Tower, Flat 904, Street 12","Order Summary Confirmation":"2 bracelets"}'
# 2) customer taps Confirm → order released (token from step 1)
curl -X POST http://localhost:3000/api/webhook/whatsapp -H 'content-type: application/json' \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"971506532084","type":"interactive","interactive":{"button_reply":{"id":"confirm:<TOKEN>"}}}]}}]}]}'
```

The Python LangGraph core (`python-agent/`) mirrors this: Agent 1 posts the
WhatsApp confirmation request and a **confirmation gate** holds the order until
`confirmation_status == "confirmed"` before any fulfillment runs.

### Real-time operations

- **Live queue page** `/confirmations` — operator view that polls every 5s and
  shows the awaiting / confirmed / cancelled / edit / expired queue with counts.
  The sidebar carries a live "awaiting" badge. Operators can **Resend** the
  WhatsApp confirmation (capped at 3 attempts).
- **Idempotency** — inbound WhatsApp events are de-duplicated by Meta message id
  (`processed_events`, migration `0004`), so webhook retries never double-confirm
  or double-reply.
- **Auto-expiry** — awaiting confirmations older than `CONFIRMATION_TTL_HOURS`
  (default 24h, the T+24 stock lock) are marked `expired` on read.
- **Operator/automation API** — `GET /api/confirmations` (queue + counts),
  `GET /api/confirmations/[token]` (poll one), `POST /api/confirmations/[token]`
  `{ "action": "resend" }` (resend, `CONFIRMATION_MAX_ATTEMPTS` cap).

### Durable order persistence (Supabase + Google Sheets)

The validated lead is written to **both** destinations (`src/lib/orders/sink.ts`),
each independent and env-driven (mock-logged if unset):

- **Supabase `intake_orders`** (migration `0005`) — the durable source of truth.
  Inserted at form-intake with `Order Status = "Awaiting Customer Confirmation"`;
  the inbound webhook updates it to `Confirmed - In Preparation` / `Edit
  Requested` / `Cancelled by Customer`. Needs `SUPABASE_SERVICE_ROLE_KEY`.
- **Google Sheets** — the "add lead to Sheet" mirror via a dependency-free Sheets
  v4 client (`src/lib/sheets/client.ts`; a service-account JWT signed with Node
  `crypto` — no `googleapis` dependency). Appends the lead row at intake and
  updates that row's status on confirmation, located by the **Confirmation Token**
  column. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (raw or base64),
  `GOOGLE_SHEETS_SPREADSHEET_ID`, and (optional) `GOOGLE_SHEETS_TAB`, then share
  the sheet with the service account's `client_email`.

  > For status-updates to land, the target tab needs an **`Order Status`** and a
  > **`Confirmation Token`** header (the appended row writes them as the last two
  > columns). The webhook response reports each target's result under `persisted`.

The Python core already syncs to Google Sheets via `gspread` in Agent 3
(Logistics & QC) using `GOOGLE_APPLICATION_CREDENTIALS`.

## The control tower (guardrail engine)

`src/lib/guardrails.ts` runs every drafted reply through checks. A **fail**
blocks the Approve button; a **warn** surfaces a caution; some findings force
**owner approval**:

| Guard | Rule |
| --- | --- |
| Claim (§7) | Blocks "real gold", waterproof, anti-tarnish, etc. without supplier evidence; auto-rewords to safe wording |
| Privacy (§14) | Detects phone / address / payment data leaking into a reply |
| Price (§6) | Requires an active, unexpired offer before quoting; price-first |
| Stock (§8) | Blocks unverified in-stock promises |
| Delivery (§10) | Blocks same-day-outside-Dubai without courier confirmation |
| Payment (§9) | No courier dispatch until payment is confirmed |
| VAT (§6/§9) | Flags missing VAT line when applicable |
| Arabic name (§4) | Never blind-transliterates; falls back to أستاذة / أستاذ |
| Length / answered / payment-step (§5/§29) | Keeps replies short, on-point, and converting |

Plus: QC checklist (§11), human-approval matrix (§24), fraud screening (§23),
and the journey-stage playbook (§16) live in `src/lib/operations.ts`.

## Core flow (acceptance §31, §33)

`/intake` → paste a customer message + known facts (+ optional screenshot) →
`POST /api/analyze` → structured `AnalysisOutput` JSON + guardrail findings →
operator reviews badges, copies the (possibly auto-corrected) reply, and
**Approves to send**.

## Review scorecard

| Area | Where it lives |
| --- | --- |
| Customer intake | `/intake` (text + screenshot) |
| AI analysis (intent/persona/product/risk/next action) | `src/lib/ai/analyze.ts` |
| Arabic name handling | `src/lib/arabic-names.ts` (tested) |
| Price / stock / delivery / payment control | `src/lib/guardrails.ts` (tested) |
| Privacy detection | guardrails + intake pre-check |
| QC checklist | `src/lib/operations.ts` (tested) |
| Dashboard (conversion / payment / delivery) | `/` |
| Daily & weekly improvement loops | `/reports` |

## Tests

`npm run test` covers the §30 business scenarios against the pure logic:
real-gold claim, privacy leak, unverified stock, same-day Sharjah delivery,
dispatch-before-payment, VAT math, Arabic name mapping (Rehab→رحاب, Kay kept
as-is), QC gating, approval matrix, and fraud signals.

## Pages (§26)

Login · Dashboard · New Conversation (intake) · Customer Inbox · Customers ·
Orders · Inventory · Offers · Payments · Courier Tracking · Suppliers · Reviews ·
Reports & Reviews · Settings · Prompt Management · Audit Log.

See `DEVELOPER_NOTES.md` for architecture details and `ROADMAP.md` for phases.
