# Beyond Style UAE — Multi-Agent Order Operating System (Python Core)

A LangGraph multi-agent backend for Beyond Style UAE order processing. It runs an
order through specialized agents in a deterministic (temperature 0.0) graph:

1. **Front-End Sales Specialist** — locks stock (T+24 rule), extracts the
   customer's number and posts a **WhatsApp confirmation request with reply
   buttons** (✅ Confirm / ✏️ Edit / ❌ Cancel), and emits the mandatory delivery
   & exchange policy consent card.
2. **Customer Confirmation Gate** — holds the order until
   `confirmation_status == "confirmed"` (set by the inbound WhatsApp webhook).
   Awaiting / declined / unreachable-number all stop the pipeline before any
   fulfillment, so the courier is never sent out on an unconfirmed order.
3. **Inventory & Margin Guard** — maps marketplace (Noon) SKUs to core SKUs, applies
   volumetric tier pricing, and blocks any order whose net margin drops below 25%.
4. **Logistics & QC Controller** — sanitizes the UAE phone number, validates address
   landmarks, optionally syncs the row to Google Sheets, and prints an A6 thermal
   shipping label.

A conditional supervisor router moves state between agents and blocks "hallucinated"
paths — any failed gate routes straight to `END`.

## Setup

```bash
cd python-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Google Sheets (optional)

The Sheets sync is optional. Without credentials the agent runs fully and simply
skips the live append. To enable it, provide a service-account key:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="gcp_service_account.json"
```

## Customer notifications (optional)

The instant thank-you uses the same env-driven, mock-by-default pattern as the
Next.js app. Without keys it just logs the message:

```bash
# WhatsApp (Meta Cloud API)
export WHATSAPP_PROVIDER=meta
export WHATSAPP_TOKEN="..."
export WHATSAPP_PHONE_NUMBER_ID="..."
# Email (Resend)
export EMAIL_PROVIDER=resend
export RESEND_API_KEY="..."
export EMAIL_FROM="Beyond Style UAE <orders@beyondstyle.ae>"
```

If the file is absent, `get_google_sheet_client()` returns `None` and the pipeline
continues (label still prints, state still completes).

## Run

```bash
python beyond_style_agent.py
```

This executes the bundled mock order (`BSU-0010`, qty 2 of `BSU-MA-BR`) end to end and
prints the policy card, the thermal label, and a final status summary.

## Business rules baked in

| Rule | Value |
| --- | --- |
| Fixed UAE courier fee | 25 AED |
| Minimum net profit margin | 25% |
| Stock lock window | 24 hours (T+24 auto-release) |
| Phone format | `+9715XXXXXXXX` (validated, else `MISSING`/`CORRUPTED`) |
| Address gate | must contain a recognized landmark token (EN or AR) |

## Notes

This Python core is independent of the Next.js console at the repo root; it is a
standalone backend module and can be deployed/run on its own.
