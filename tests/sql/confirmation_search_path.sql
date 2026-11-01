-- Isolated disposable PostgreSQL only. A privileged test caller creates hostile
-- temp relation names, then uses the service-role-gated RPC. This validates name
-- resolution, not a claim that an unprivileged hosted caller can reach these RPCs.
\set ON_ERROR_STOP on
begin;
set local test.role = 'service_role';
create temporary table order_confirmations (like public.order_confirmations including all);
create temporary table intake_orders (like public.intake_orders including all);
create temporary table orders (like public.orders including all);
create temporary table customers (like public.customers including all);
create temporary table order_events (like public.order_events including all);
create temporary table domain_events (like public.domain_events including all);
create temporary table confirmation_reply_receipts (like public.confirmation_reply_receipts including all);
create temporary table form_intake_receipts (like public.form_intake_receipts including all);
insert into public.order_confirmations(token, phone) values ('TOK-SHADOW', '+971500000006');
insert into public.intake_orders(confirmation_token, customer_name, phone, emirate, order_status)
values ('TOK-SHADOW', 'SYNTHETIC SHADOW', '+971500000006', 'Dubai', 'Awaiting Customer Confirmation');
do $$ declare a jsonb; b jsonb; form_result jsonb; begin
  a := public.apply_confirmation_reply('TOK-SHADOW', 'EVENT-SHADOW', 'confirm', '+971500000006', '{}'::jsonb);
  b := public.apply_confirmation_reply('TOK-SHADOW', 'EVENT-SHADOW', 'confirm', '+971500000006', '{}'::jsonb);
  if a->>'order_id' is null or a->>'order_id' is distinct from b->>'order_id' then raise exception 'FAIL: shadowed bridge'; end if;
  if (select count(*) from public.orders where phone = '+971500000006') <> 1 then raise exception 'FAIL: public order missing'; end if;
  if (select status from public.order_confirmations where token = 'TOK-SHADOW') <> 'confirmed' then raise exception 'FAIL: public confirmation missing'; end if;
  form_result := public.ingest_form_submission('FORM-SHADOW', '{"fixture":"synthetic"}'::jsonb, 'TOK-FORM-SHADOW',
    '{"customerName":"SYNTHETIC","phone":"+971500000005","whatsappNumber":"+971500000005","emirate":"Dubai"}'::jsonb);
  if form_result->>'token' <> 'TOK-FORM-SHADOW' then raise exception 'FAIL: form intake shadowed'; end if;
  if not exists(select 1 from public.form_intake_receipts where submission_id = 'FORM-SHADOW') then raise exception 'FAIL: public receipt missing'; end if;
  if exists(select 1 from pg_temp.order_confirmations) or exists(select 1 from pg_temp.intake_orders)
     or exists(select 1 from pg_temp.orders) or exists(select 1 from pg_temp.customers)
     or exists(select 1 from pg_temp.order_events) or exists(select 1 from pg_temp.domain_events)
     or exists(select 1 from pg_temp.confirmation_reply_receipts) or exists(select 1 from pg_temp.form_intake_receipts)
     then raise exception 'FAIL: wrote to attacker temp relation'; end if;
end $$;
rollback;
\echo confirmation_search_path: all checks passed
