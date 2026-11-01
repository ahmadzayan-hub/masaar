# Independent webhook boundary review (2026-10-24)

Reviewed PR #6 head `d903a4bda373aac141a5de1f08bd729b5c978653`. Relevant source and migration blobs were checked against that exact remote commit before editing. This follow-up is not a production release or approval to apply SQL.

## Reproduced and fixed

- The development unsigned-webhook opt-in checked only `VERCEL_ENV`. A self-hosted `NODE_ENV=production` process could therefore accept unsigned requests with the opt-in present. Both form and WhatsApp gates now reject that combination, while retaining the existing Vercel-production denial.
- WhatsApp HMAC verification used `Request.text()`, which normalizes UTF-8 (including stripping a leading BOM and replacing malformed bytes). Synthetic requests with a signature for the normalized text were accepted despite different wire bytes. HMAC now covers the original byte buffer; strict UTF-8 decoding and JSON parsing happen only after authentication. This is exact-byte integrity hardening, not a claim that arbitrary messages could be forged without a signing secret.

Five new assertions failed against the prior code (two byte-normalization cases and three self-hosted production environments). Final isolated suite: **106 tests / 11 files passed**, including eight new boundary cases, valid Arabic/Unicode with whitespace, and rejection of authentically signed malformed UTF-8/JSON. TypeScript, lint and the Next production build passed on Node 24.19.0. All provider/store interactions in the new route tests are fakes; no messages or external API calls were made. Remote CI remains separate evidence.

Commands from the repository root (use a writable local `TMPDIR`):

- `npm test -- --pool=threads --poolOptions.threads.singleThread`
- `npm run typecheck`
- `npm run lint`
- `npm run build` (local run was CPU-affinity bounded without changing repository configuration)

## SQL and fulfillment review

No migration code changed. A fresh disposable PostgreSQL 17.11 single-user database passed schema bootstrap and migrations 0001–0009, intake bridge, injected-failure atomic rollback, role-denial, form idempotency/conflict, hostile search-path, and confirmation/form receipt recovery in separate database processes. No live Supabase connection or customer records were used.

Source review confirms confirmation-row serialization before receipt lookup and order promotion, transaction-scoped form-key locking, receipt uniqueness, and rollback on downstream failure. This is **not** proof of simultaneous sessions or hosted PostgREST/JWT behavior. The environment's previously established database-listener restriction was not bypassed or retried. An approved disposable multi-session environment must still test same-key concurrent ingestion, same-event confirmation replay, competing actions, and one event ID targeting different confirmations; verify one committed intake/order/receipt and no partial losing transaction.

Mock notification remains a failure, not delivery. Provider sends are still at-least-once; a crash or concurrent retry can duplicate an external message. An uncertain Sheet append is still flagged for reconciliation and not blindly repeated. No automatic outbox, tenant-isolation or real fulfillment acceptance is claimed.

## Release and recovery remain gated

Follow [ATOMIC_CONFIRMATION_RELEASE.md](ATOMIC_CONFIRMATION_RELEASE.md): identify exact target/schema/app SHA, verify encrypted recoverable backups and an isolated restore (including both receipt tables), obtain migration/deployment approval, coordinate stable producer IDs, and apply only missing reviewed migrations in order 0007 → 0008 → 0009. Preserve customer/order/receipt history on rollback; do not revert to unkeyed intake or status-before-promotion behavior. Hosted authenticated acceptance, real provider acceptance and multi-session testing remain outstanding. No merge, deployment, migration, credential change or customer communication was performed.
