# Private media upload recovery

`POST /api/media` writes a private Storage object and then a `media_assets` row.
Those writes are not one transaction. Migration 0011 intentionally denies
authenticated Storage deletion, including owner/operator sessions. Previously,
the compensation path used that same session and ignored the deletion result,
leaving an orphan object when metadata was rejected.

The route now requires `SUPABASE_SERVICE_ROLE_KEY` before any live upload. This
is an existing server-only setting, never a browser setting. Missing configuration
returns 503 without writing bytes. Owner/operator role and a current user are
required before obtaining the privileged client. Uploads and metadata insertion
continue to use the session client and its RLS restrictions.

For explicit SQL validation/RLS rejections (`23502`, `23503`, `23514`, `42501`,
`22001`, `22P02`), the route removes only the server-generated path for this
request from the fixed `media` bucket using the privileged client. No caller
bucket or path is used. It reports successful compensation only when Storage
returns that path among the deleted objects. Storage errors, empty results and
wrong-path acknowledgements are recovery failures, not successful cleanup.

Transport errors, unknown metadata errors and uniqueness conflicts are not
proof that metadata was never committed. The object is retained in those cases.
An uncertain upload response is also retained, since deletion could otherwise
target an existing object after a conflict. Recovery responses have status 503,
code `MEDIA_UPLOAD_RECOVERY_REQUIRED`, and an `uploadId` in both the JSON and the
visible error message. Server logs emit `media_upload_recovery_required` with
only that ID and the failed stage (`upload`, `metadata`, `cleanup`). They do not
include filenames, customer descriptions, provider errors or credentials.

## Recovery by an authorized operator

1. Stop automatic retries; retain the displayed reference. If the browser lost
   the entire response, inspect the media list and server recovery logs first.
2. Check `media_assets.id` for the reference. The object name contains the same
   UUID below its classification/year/month prefix. Check the private Storage
   catalog for that UUID and verify any `storage_path`/`file_url` references.
3. If the metadata and bytes both exist, preserve them and verify the record in
   the console. Do not upload another copy just because the response was lost.
4. If a row exists without bytes, or a request may still be committing, stop
   and investigate; do not delete metadata or declare recovery complete.
5. For an object with no metadata references, an authorized operator may remove
   it through the Storage API after verifying that the original request has
   finished and rechecking the database. Verify the removal before retrying.
   Do not delete Storage catalog rows directly: that does not delete file bytes.

This release adds no background reconciler or durable recovery queue. A process
crash between services can still leave an orphan, and a lost response may omit
the reference. Recovery currently relies on the private catalog, records and
logs. Automated reconciliation remains engineering work, not a claim of atomic
or exactly-once upload behavior. No live migration is required for this route
change; the separate draft migration 0012 still needs its own release approval.

## Verification boundary

`npm test -- tests/media-route.test.ts` executes the real locked Supabase SDK
against a synthetic HTTP boundary with in-memory object/row state and session-delete
denial. It tests success, access denial, missing configuration, exact-path
compensation, cleanup failures, committed-but-lost metadata responses and
uncertain upload responses. These are route/SDK contracts, not hosted Storage
acceptance. `python tests/sql/run_postgres.py` separately exercises real
PostgreSQL RLS, including denial of authenticated object deletion. Its catalog
fixture has no HTTP server or file bytes. Hosted Auth/JWT, MIME enforcement and
actual Storage deletion remain unverified.

Supabase documents that [Storage remove returns the deleted file objects](https://supabase.com/docs/reference/javascript/storage-from-remove).
