# Roadmap (§34)

Build the MVP first. Do not over-engineer. Focus on operational discipline,
conversion, payment control, delivery control, and daily improvement.

## Phase 1 — Control tower MVP (this repo)
- Manual screenshot & message upload.
- Human-approved reply generation with the guardrail engine.
- Order tracker, payment & delivery tracking, QC checklist.
- Dashboard KPIs + daily/weekly review structure.

## Phase 2 — Operator productivity
W3 first half implemented (2026-11-02): `/replies` provides suggested WhatsApp
quick replies and Instagram saved replies for manual review/copy; `/orders`
exports the filtered and sorted displayed dataset (up to the existing 100-row query limit)
as spreadsheet-safe UTF-8 CSV; `/reviews` offers neutral review-request drafts
for delivered orders. Copying does not send or track a message. Draft wording
is starter copy, not owner-approved policy. Existing VAT export remains available.

W3 second half implemented (2026-11-03): `/reviews` records that a request
was sent (one per order, enforced by a unique index on `review_requests`) and
captures the customer's review (one per order) through `POST /api/reviews/requests`
and `POST /api/reviews`, owner/operator only. Public-sharing consent is recorded
only from an explicit customer "yes" and is never inferred from a response.
`/suppliers` applies a single bulk-purchase gate (`supplierBulkGate`): real video
received, sample approved, material proof present and risk score below 0.7.
Order 360 (`/orders/[id]`) already provides the order-timeline detail view.
Still open: create/edit forms on record pages and media persistence.

Phase 2 close-out (2026-11-03): `/suppliers`, `/couriers` and `/customers` offer
create and edit forms backed by `POST`/`PATCH /api/records/[table]` (allow-listed
tables and columns, zod-validated, owner/operator only, demo mode validates and
persists nothing). `/media` uploads to the private `media` Storage bucket under a
classification-prefixed path and records a `media_assets` row (`POST /api/media`,
migration 0011). Every upload carries an explicit classification; a customer's
private order photo is always flagged as private data. No public URLs are stored.

- WhatsApp Business quick-reply library.
- Instagram saved-reply library.
- CSV export.
- Review collection flow (done: request log, capture, dedup).
- Supplier database workflows (done: sample/video/proof/risk gate and edit forms).
- Create/edit forms on all record pages (done for suppliers, couriers, customers; Order 360 covers the timeline view).
- Persist uploads to Supabase Storage + `media_assets` classification (done: `/media`, migration 0011).

## Phase 3 — Integrations (only if credentials & approvals are provided)
- Meta Business integration.
- WhatsApp Business API.
- Automated follow-up scheduling **with human approval**.
- Inventory sync.
- Courier API integration.

## Phase 4 — Selective automation
- Partial automation for **low-risk** replies only.
- Auto-escalation for risky cases (refund/complaint/sensitive data).
- Predictive reorder recommendations.
- Customer lifetime value segmentation.
- Campaign recommendation engine.

> Automation is earned, not assumed. A reply class only becomes eligible for
> auto-send after it demonstrates a clean guardrail record over time.
