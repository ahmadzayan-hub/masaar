# Roadmap (§34)

Build the MVP first. Do not over-engineer. Focus on operational discipline,
conversion, payment control, delivery control, and daily improvement.

## Phase 1 — Control tower MVP (this repo)
- Manual screenshot & message upload.
- Human-approved reply generation with the guardrail engine.
- Order tracker, payment & delivery tracking, QC checklist.
- Dashboard KPIs + daily/weekly review structure.

## Phase 2 — Operator productivity
- WhatsApp Business quick-reply library.
- Instagram saved-reply library.
- CSV export.
- Review collection flow.
- Supplier database workflows (sample/video gating).
- Create/edit forms on all record pages + order-timeline detail view.
- Persist uploads to Supabase Storage + `media_assets` classification.

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
