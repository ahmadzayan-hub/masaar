-- Run in a new PostgreSQL process against the same isolated database directory.
\set ON_ERROR_STOP on
begin;
set local test.role = 'service_role';
do $$ declare old_id uuid; result jsonb; begin
  select core_order_id into old_id from confirmation_reply_receipts where event_id = 'EVENT-RESTART';
  if old_id is null then raise exception 'FAIL: durable receipt missing after restart'; end if;
  result := apply_confirmation_reply('TOK-RESTART', 'EVENT-RESTART', 'confirm', '+971500000009', '{}'::jsonb);
  if result->>'order_id' <> old_id::text or result->>'replayed' <> 'true' then raise exception 'FAIL: restart replay'; end if;
  if (select count(*) from orders where phone = '+971500000009') <> 1 then raise exception 'FAIL: duplicate after restart'; end if;
end $$;
rollback;
\echo confirmation_restart: all checks passed
begin;
set local test.role = 'service_role';
do $$ declare r jsonb; begin
  r := ingest_form_submission('FORM-RESTART', '{"fixture":"synthetic"}'::jsonb, 'TOK-MUST-NOT-EXIST', '{}'::jsonb);
  if r->>'token' <> 'TOK-FORM-RESTART' or r->>'created' <> 'false' then raise exception 'FAIL: form restart replay'; end if;
  if exists(select 1 from order_confirmations where token = 'TOK-MUST-NOT-EXIST') then raise exception 'FAIL: form replay inserted'; end if;
end $$;
rollback;
