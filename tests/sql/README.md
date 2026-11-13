# Confirmation, review and media database regressions

Run from the repository root with Python 3.10+ and PostgreSQL (including pgcrypto)
available on PATH:

```sh
python tests/sql/run_postgres.py
```

The runner always initializes its own temporary cluster under `test-results/`.
It never accepts a database URL or uses application credentials. It clears
inherited PostgreSQL connection settings, binds only to a fresh loopback port,
uses a random synthetic password and checks the server's data directory before
running SQL. It registers no service. The owned test cluster is stopped and
removed on exit; its server log remains for diagnosis. Do not run as root on Unix.

The minimal Supabase auth and Storage catalog fixtures and migrations 0001-0012
are applied unchanged. Existing SQL checks cover promotion, transaction rollback, permissions,
payload idempotence and hostile search-path objects. Five new multi-session
cases verify form replay, retry after rollback, confirmation replay, changed
payload rejection and conflicting customer actions. A third connection observes
an actual PostgreSQL lock wait before the owner transaction commits or rolls
back; a delay alone is not accepted as concurrency evidence.

The runner then commits the existing restart fixture, stops PostgreSQL, starts a
new server process on the same test data and verifies durable receipt/order
recovery. A failing SQL assertion or subprocess fails the runner and CI.

The review/media suite checks actual PostgreSQL RLS as non-bypass authenticated
and anonymous roles, with owner, operator, finance, workshop, readonly and
unprofiled synthetic identities. It checks review/request uniqueness, request
append-only behavior, default sharing consent, private bucket configuration,
cross-bucket denial, role-scoped writes, storage-path uniqueness, retained media
after order deletion, and rejection of false/NULL privacy flags on private photos.
The current policies intentionally allow every authenticated console role to
read media; the suite preserves that behavior. Storage deletion is denied to
all authenticated roles by the existing policy.

Before migration 0012, a private-photo NULL flag passed the SQL CHECK. The
fixture creates that historical row under 0011, applies 0012 twice, then verifies
the flag became true without losing the row, object path or other metadata.
Unrelated supplier metadata remains unchanged. Future private-photo inserts
and updates with false or NULL fail the check.

`.github/workflows/postgres-regression.yml` executes the same command on Ubuntu
24.04 with PostgreSQL 16 for every main push and pull request. Logs are retained
for seven days. `npm test` remains the separate TypeScript suite.

The Storage fixture models only catalog columns needed by the migrations. It
does not implement the Storage HTTP API, actual file bytes, size/MIME enforcement,
JWT validation, signed URLs or upload compensation. Supabase Auth/PostgREST,
live providers, customer data and production migrations remain unverified.
External message delivery remains at-least-once. Passing
these tests is not authorization to merge, deploy or apply a live migration.
