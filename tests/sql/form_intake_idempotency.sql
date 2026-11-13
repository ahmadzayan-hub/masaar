-- Isolated fixtures only. Review migration 0009 before application.
\set ON_ERROR_STOP on
begin;
set local test.role = 'service_role';
do $$ declare a jsonb; b jsonb; payload jsonb := '{"customerName":"SYNTHETIC","phone":"+971500000008","whatsappNumber":"+971500000008","emirate":"Dubai"}'::jsonb; begin
  a := ingest_form_submission('FORM-SYN', payload, 'TOK-FORM-1', payload);
  b := ingest_form_submission('FORM-SYN', payload, 'TOK-FORM-2', payload);
  if a->>'token' <> 'TOK-FORM-1' or b->>'token' <> 'TOK-FORM-1' or b->>'created' <> 'false' then raise exception 'FAIL: duplicate intake'; end if;
  if (select count(*) from order_confirmations where phone = '+971500000008') <> 1 then raise exception 'FAIL: duplicate confirmation'; end if;
  if (select count(*) from intake_orders where phone = '+971500000008') <> 1 then raise exception 'FAIL: duplicate intake row'; end if;
  begin
    perform ingest_form_submission('FORM-SYN', payload || '{"different":true}'::jsonb, 'TOK-FORM-3', payload);
    raise exception 'FAIL: changed payload accepted';
  exception when unique_violation then null; end;
  perform apply_confirmation_reply('TOK-FORM-1', 'FORM-WA-SYN', 'confirm', '+971500000008', '{}'::jsonb);
  b := ingest_form_submission('FORM-SYN', payload, 'TOK-FORM-4', payload);
  if b->>'status' <> 'confirmed' then raise exception 'FAIL: resolved state reset'; end if;
  if (select order_status from intake_orders where confirmation_token = 'TOK-FORM-1') <> 'Confirmed - In Preparation' then raise exception 'FAIL: intake reset'; end if;
  if exists(select 1 from order_confirmations where token in ('TOK-FORM-2','TOK-FORM-3','TOK-FORM-4')) then raise exception 'FAIL: replay inserted records'; end if;
end $$;
rollback;
set role authenticated;
do $$ begin
  begin
    perform ingest_form_submission('FORM-NO', '{}'::jsonb, 'TOKEN-NO', '{}'::jsonb);
    raise exception 'FAIL: browser execute permitted';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from form_intake_receipts;
    raise exception 'FAIL: browser receipt read permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo form_intake_idempotency: all checks passed
