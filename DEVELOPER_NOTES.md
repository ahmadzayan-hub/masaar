# Developer notes

## Architecture

```
src/
  lib/
    types.ts            # domain types (mirror the SQL schema)
    arabic-names.ts     # §4 name accuracy (pure, tested)
    guardrails.ts       # §7/§9/§10/§14/§29 control tower (pure, tested)
    operations.ts       # §11 QC, §24 approval matrix, §16 playbook, §12 returns
    data.ts             # server read helpers (degrade gracefully w/o Supabase)
    ai/
      provider.ts       # §25 configurable wrapper (openai/anthropic/gemini/mock)
      prompts.ts        # §28 default prompt library (DB-overridable)
      analyze.ts        # §17 pipeline: prompt build → model call → guardrails
    supabase/{client,server}.ts
  app/
    api/analyze/route.ts   # POST analysis endpoint
    intake/                # flagship: intake → analysis → approval
    <records pages>        # customers, orders, inventory, offers, ...
    reports/ settings/ prompts/ login/
  components/
    Nav.tsx AnalysisPanel.tsx RecordPage.tsx
supabase/
  migrations/0001_schema.sql   # §27 tables + RLS
  seed.sql                     # catalogue, offers, couriers, prompts, §30 cases
tests/guardrails.test.ts       # §30 scenarios as unit tests
```

## Design decisions

- **Guardrails are pure functions** with no I/O so they are fully unit-testable
  and deterministic. This is the heart of the "control tower" — keep them pure.
- **Provider wrapper returns plain strings**; `analyze.ts` is responsible for
  JSON extraction (tolerates markdown fences) and Zod validation. Swapping
  providers never touches business logic.
- **Graceful degradation**: every server page renders without Supabase or an AI
  key, so the console is demoable immediately and fails safe.
- **No keys in code** — provider + keys come only from env (`AI_PROVIDER`).
- **Couriers/prices are data, not code** (§10): Halan/Sharjah costs live in the
  `couriers`/`offers` tables and `settings`, never hard-coded in guardrail logic.

## What is wired vs. scaffolded (honest status)

Fully implemented & tested:
- Guardrail engine, Arabic-name module, QC checklist, approval matrix, fraud
  screening, VAT/total math.
- AI analysis pipeline + `/api/analyze` (works live with a real key; `mock`
  otherwise).
- Intake → analysis → guardrail review → copy/approve UI flow.
- Dashboard KPIs + all record list pages reading from Supabase.

Scaffolded (intentionally lean for MVP — extend as needed):
- Record pages are **read-only** lists; create/edit forms and the order-timeline
  detail view are the next build step.
- Auth is wired (`/login` + Supabase) but role-gating middleware is not yet
  enforced on routes — add `middleware.ts` to require a session.
- Daily/weekly reviews show the required section structure and KPI snapshot;
  auto-drafting them via the `daily_review` prompt is a thin follow-up.
- Screenshot upload posts the image to the AI for vision analysis but does not
  yet persist to Supabase Storage / `media_assets`.

## Adding an AI provider

Add a class implementing `AiProvider` in `provider.ts` and a `case` in
`getProvider()`. Keep `complete()` returning a string.

## Running

```bash
npm run dev | build | start | typecheck | test
```
