# Atomic confirmation database regressions

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

The existing minimal Supabase auth fixture and migrations 0001-0009 are applied
unchanged. Existing SQL checks cover promotion, transaction rollback, permissions,
payload idempotence and hostile search-path objects. Five new multi-session
cases verify form replay, retry after rollback, confirmation replay, changed
payload rejection and conflicting customer actions. A third connection observes
an actual PostgreSQL lock wait before the owner transaction commits or rolls
back; a delay alone is not accepted as concurrency evidence.

The runner then commits the existing restart fixture, stops PostgreSQL, starts a
new server process on the same test data and verifies durable receipt/order
recovery. A failing SQL assertion or subprocess fails the runner and CI.

`.github/workflows/postgres-regression.yml` executes the same command on Ubuntu
24.04 with PostgreSQL 16 for every main push and pull request. Logs are retained
for seven days. `npm test` remains the separate TypeScript suite.

This fixture does not cover migrations 0010-0011 (reviews/media), actual
Supabase Auth/PostgREST/RLS platform behavior, live providers, customer data or
production migrations. External message delivery remains at-least-once. Passing
these tests is not authorization to merge, deploy or apply a live migration.
