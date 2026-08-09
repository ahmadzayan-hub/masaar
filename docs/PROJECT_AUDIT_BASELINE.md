# PROJECT_AUDIT_BASELINE.md — Beyond Style UAE Order Control Console
purpose: Factual Phase-1 baseline + severity-classified audit and prioritized plan for the production transformation.
owner: Ahmed Zaian
last-updated: 2026-07-14

## Executive summary
The console is a **Next.js 14 (App Router) + TypeScript + Tailwind** internal ops tool: Google-form
intake → validation → WhatsApp confirmation gate → live queue → payments / delivery / margin
dashboard, with an optional Python LangGraph backend. Code quality of the core libraries is **high**
(zod-validated AI output + guardrail engine, correct COD pricing, HMAC signature verification with a
length guard, robust UAE phone/address validation). Baseline build, typecheck, and the 60-test suite
all pass. The material gaps are in **security posture (auth gate), quality gates (lint), dependency
hygiene, accessibility, and Arabic RTL** — not in core business logic.

## Baseline evidence (commands run 2026-07-14)
| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | ✅ clean |
| Unit tests | `npm run test` | ✅ 60/60 |
| Production build | `npm run build` | ✅ 23 static pages compiled |
| Lint | `npm run lint` | ⚠️ was **uninitialized** (interactive prompt) → **fixed this session**, now ✅ clean |
| Security audit | `npm audit --omit=dev` | ⚠️ 3 high-sev `postcss` advisories (transitive via next; build-time) |

## Current architecture
- **Routes:** 16 app pages (dashboard, confirmations, inbox, customers, orders, payments, couriers,
  inventory, offers, suppliers, reviews, reports, prompts, settings, audit, intake) + 5 API routes
  (`analyze`, `confirmations`, `confirmations/[token]`, `webhook/form-intake`, `webhook/whatsapp`).
- **lib/** cleanly separated: `ai/` (provider + analyze + prompts), `confirm/` (store, inbound,
  messages), `intake/validate`, `notify/provider`, `orders/sink`, `sheets/client`, `pricing`,
  `guardrails`, `supabase/` (client/server/admin), `data`, `demo/seed`.
- **Data:** Supabase when configured (via **service-role** admin client), else in-memory/demo seed.

## Current user journeys (primary)
1. Customer submits Google form → `POST /api/webhook/form-intake` → validate → open confirmation →
   WhatsApp buttons → `Awaiting Customer Confirmation`.
2. Customer taps Confirm/Edit/Cancel → `POST /api/webhook/whatsapp` (HMAC-verified, idempotent) →
   status update → order released to prep.
3. Operator watches `/confirmations` (5s poll), can Resend (≤3 attempts); reviews dashboard KPIs.

## Findings by severity (evidence-based)
### P1 — High
- **P1-1 Security: console has no auth gate + reads via service-role key.** No `middleware.ts`, and
  no dashboard page redirects to `/login`; page data is read through `supabase/admin.ts`
  (`SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS**). In demo mode (no Supabase) this is harmless,
  but with Supabase configured in production the console + all customer data would be reachable by
  anyone with the URL. *Evidence:* `ls middleware.ts` → absent; `grep redirect(/login` → none;
  `admin.ts` uses service-role. **Fix (proposed, needs go-ahead):** add `middleware.ts` that requires
  a Supabase auth session for all non-`/login`, non-webhook routes when Supabase is configured, and
  no-ops in demo mode. Behavior change to production access → confirm before shipping.

### P2 — Medium
- **P2-1 No lint gate** — `next lint` was uninitialized. **Fixed this session:** added
  `.eslintrc.json` (`next/core-web-vitals`) + eslint devDeps; caught and fixed a misleading
  `useMetaWhatsApp` helper name (tripped `react-hooks/rules-of-hooks`). `npm run lint` now clean.
- **P2-2 Dependency advisories** — 3 high-sev `postcss` (GHSA-fxqj-rqcc-2cmp) transitive via next;
  build-time only. Clean fix requires next 16 (breaking). *Mitigation:* track; upgrade in a dedicated
  dependency PR, not here.
- **P2-3 Accessibility gaps** — `aria/alt/role` appear only in `Nav` + charts. Data tables, icon-only
  buttons, form fields, and live-polling regions likely lack accessible names / semantics; target
  WCAG 2.2 AA.
- **P2-4 Arabic RTL** — `layout.tsx` hardcodes `dir="ltr"` though the product handles Arabic content
  (confirmation messages, names). No language/dir switch for operators.

### P3 — Low
- **P3-1** No CI workflow runs the console's own lint/typecheck/test on PRs (repo workflows are scoped
  to other projects).
- **P3-2** `docs/` sparse for this app (only AGENT_SPEC); no ARCHITECTURE/TEST_STRATEGY docs yet.

## Prioritized plan (Phase-6 order)
1. **P1-1** add auth-gate middleware (confirm first — production access change). ← next, pending go-ahead
2. **P2-3 / P2-4** accessibility + RTL pass on shared components (Nav, tables, forms, PageHeader).
3. **P2-2** dependency-upgrade PR (postcss/next) in isolation.
4. **P3-1** add a `beyond-style-uae`-scoped CI workflow (lint + typecheck + test).
5. **P3-2** author ARCHITECTURE.md + TEST_STRATEGY.md.

## Done this session (verified)
- Restored the **lint gate** (`.eslintrc.json` + eslint devDeps); fixed the `useMetaWhatsApp`→
  `metaWhatsAppConfig` naming. `npm run lint` ✅, `typecheck` ✅, `test` ✅ 60/60 — no regression.
- Authored this baseline.

## Assumption register
| Assumption | Evidence | Confidence | Impact if wrong | Decision |
| --- | --- | --- | --- | --- |
| Transformation target is `beyond-style-uae/` | Owner selected option B | High | Wrong app audited | Proceeded on the console |
| Demo-mode openness is intentional | Login page offers "Enter as demo owner" | High | — | Auth gate will preserve demo mode |
| postcss advisory is build-time, low runtime risk | Advisory scope = source maps at build | Med | Overstated severity | Kept as P2, upgrade separately |
