# Atomic confirmation repair: review and release gate

This is code-ready test evidence, NOT a production release or operational acceptance.

## Changed behavior

Migration `0008_atomic_confirmation_reply.sql` wraps the existing `0007` bridge in one database transaction: sender/confirmation validation, intake transition, core order, confirmation state and an event-to-token receipt. A promotion error rolls everything back. A committed receipt lets a free-text retry find its original confirmation after a process restart. Replays cannot change token/action; the caller must be service_role and the sender must match the stored phone. A unique event id and confirmation row lock prevent a duplicate order. Unauthenticated/ordinary authenticated callers cannot execute the function or read the receipt table.

The WhatsApp route returns 503, not false success, on storage, configured mirror, notification or processed-marker failure. It skips acknowledged messages in retried batches. Mock notifications never count as delivery. Form intake persists before inviting a confirmation and reports missing persistence or delivery as a failure. No prices or financial behavior changed.

External notifications remain **at-least-once**: a crash after a provider accepts a send but before the processed marker commits can send a duplicate on retry. No exactly-once provider claim. Meta retry windows are finite; operations must reconcile unresolved receipts after a prolonged outage. A scheduler/outbox retry service is not implemented here. Existing broad operator policies on older tables are outside this repair; do not infer multi-tenant acceptance.

## Reproducible evidence (isolated, synthetic only)

- Node 24.19.0, npm 11.9.0; `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/masaar-npm-cache` (no package lifecycle scripts).
- `npm test -- --pool=threads --poolOptions.threads.singleThread`: 93 tests passed across 10 files.
- `npm run typecheck`: passed. `npm run lint`: passed (Next's lint-command deprecation notice).
- PostgreSQL 17.11 disposable local data directory: applied `tests/sql/supabase_stub.sql`, then migrations 0001–0008. `tests/sql/intake_bridge.sql` and `tests/sql/atomic_confirmation.sql` passed, including an injected downstream order-insert exception proving transaction rollback, duplicate replay, conflict and sender/service-role rejection.
- `tests/sql/confirmation_restart_setup.sql`, stop process, then `tests/sql/confirmation_restart_verify.sql` in a fresh database process: durable receipt and same-order recovery passed.
- Actual `SET ROLE authenticated` rejected both RPC execution and receipt-table read. No live Supabase, provider, customer or production writes.

Tests used PostgreSQL single-user mode because this environment cannot open a database listener. Therefore HTTP/PostgREST adapter integration and true concurrent sessions remain unverified. Supabase platform objects are minimal test stubs, not evidence of hosted identity acceptance. For a disposable database elsewhere, run each SQL file with `psql -v ON_ERROR_STOP=1 -f ...`; bootstrap is strictly for isolated plain PostgreSQL, never a Supabase project. Preserve SQL error checking: standalone PostgreSQL exit status alone is insufficient.

## Approval-dependent migration plan

1. Identify the exact Supabase project/environment and deployed app SHA. Inspect schema, migration history, permissions and existing intake/core links read-only. Do not infer target from its name. Confirm migrations 0001–0006 and whether 0007 already exists.
2. Take and verify a recoverable encrypted database backup using the existing approved backup mechanism, including customers, orders, order_events, domain_events, intake_orders, order_confirmations and processed_events. Record restore point and exercise restore on an isolated target with authorized tooling. Do not export secrets or customer records into this repository.
3. Review 0007 and 0008 against that schema and run synthetic SQL checks in an isolated copy. Reconcile historical confirmations that were acknowledged without a core order; do not replay customer notifications blindly.
4. Obtain named production migration and deployment approval. Apply only missing migrations using existing authorized access. Deploy the tested app only after migration availability is verified. No credentials or expanded access are created by these steps.
5. Verify with an isolated approved test account: failed RPC, same-event redelivery, process restart, sender mismatch, and provider failure. Confirm operator recovery visibility and acceptance before real customers.

## Rollback

Pause inbound processing only with owner approval; do not silently revert to the old status-before-promotion handler. Preserve receipts and core orders. Roll back the application to a separately reviewed fail-closed route if necessary. With migration rollback approval, revoke execution and drop only `apply_confirmation_reply(text,text,text,text,jsonb)` after compatible app rollback; retain `confirmation_reply_receipts` and its RLS for reconciliation/audit. Do not drop 0007 links, core orders or receipt data. Full destructive restoration requires its own approved backup/restore plan. No production rollback was executed.

## Follow-up: idempotent form submission (migration 0009)

Require a stable `x-idempotency-key` header or `submissionId` field (1–200 characters). The prepared Apps Script uses the form response id, or spreadsheet/sheet/response-row identity. Do not change the live script or source links without approval. Prefer a Form response id; row identities assume response rows are not reordered/reused before retries. Existing producers need a coordinated, approved rollout; unkeyed requests now return 400 before writes.

`ingest_form_submission` atomically stores one confirmation, intake and service-role-only receipt. Same key and canonical payload reuses the original token; changed data conflicts with 409. Replay never resets a resolved confirmation. Known accepted invitations are not sent again; a crash before the delivery receipt still permits an at-least-once send. Failed storage never sends buttons. There is no in-memory durability claim.

The Sheet append happens only for the first committed ingestion. A crash before/after an uncertain append leaves `sheet_synced=false` and requires reconciliation; replay deliberately does not append again or overwrite a live Sheet. This is a visible integration gap, not successful Sheet fulfillment. No automatic Sheet repair or worker is supplied. Concurrent external sends can duplicate an invitation, but the database intake and core order remain idempotent. Concurrent-session acceptance still requires an isolated hosted test.

Additional evidence: 98 unit tests, TypeScript, lint and the production build passed; form SQL checks prove one confirmation/intake per key, changed-payload rejection, no reset after confirmation, authenticated-role denial, and durable form receipt reuse in a new PostgreSQL process. Apply `0009_idempotent_form_intake.sql` only after the same backup/schema review and owner approval as above. Include `form_intake_receipts` and `confirmation_reply_receipts` in future backups. If rolling back, retain receipt tables and their RLS; revoke/drop the ingestion RPC only after rolling back to a reviewed fail-closed client. Do not restore an unkeyed production endpoint or delete dedupe history.

### Coordinated rollout order (approval required; nothing applied live)

1. Verify target and backup/restore, then apply only missing migrations in dependency order **0007 → 0008 → 0009** (after0001–0006).0008 calls the bridge in0007;0009 writes the confirmation/intake tables and its own receipt, while this application also needs0008.
2. Review the prepared Apps Script/client changes. With owner approval, update each existing producer to send a stable submission id/header first, while the old endpoint still tolerates extra fields. Verify key stability on synthetic redelivery. Do not silently edit live Sheet columns, reorder rows or change source links.
3. Confirm every active producer is compatible, then obtain approval and deploy the tested application SHA. This is the point at which missing keys are rejected400. If any producer cannot provide a key, stop the coordinated rollout rather than disable deduplication or mint a new key for every retry.
4. Run an approved isolated end-to-end submission/retry/provider-failure check. Verify original token reuse, one intake/core order, persisted notification receipts and any Sheet reconciliation flag. No real customer messages or payments are authorized by preparing this plan.
5. Keep the previous approved app artifact and compatible producer version for rollback, retain all receipt history, and use a reviewed fail-closed rollback instead of re-enabling unkeyed writes. Schema/hosting/source changes and rollback execution need explicit approval.
