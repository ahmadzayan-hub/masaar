-- Isolated PostgreSQL only, synthetic fixtures. Never run against production.
\set ON_ERROR_STOP on
begin;
set local test.role = 'service_role';
insert into order_confirmations(token, phone) values ('TOK-ATOMIC', '+971500000001');
insert into intake_orders(confirmation_token, customer_name, phone, emirate, order_status)
values ('TOK-ATOMIC', 'SYNTHETIC', '+971500000001', 'Dubai', 'Awaiting Customer Confirmation');
-- Inject a transient downstream failure. PL/pgSQL exception subtransaction must
-- roll back confirmation/intake/customer/order/receipt together.
create function test_reject_order() returns trigger language plpgsql as $$ begin raise exception 'synthetic transient'; end $$;
create trigger synthetic_failure before insert on orders for each row execute function test_reject_order();
do $$ begin
  begin
    perform apply_confirmation_reply('TOK-ATOMIC', 'EVENT-ATOMIC', 'confirm', '+971500000001', '{}'::jsonb);
    raise exception 'FAIL: expected transient error';
  exception when others then
    if sqlerrm <> 'synthetic transient' then raise; end if;
  end;
  if (select status from order_confirmations where token = 'TOK-ATOMIC') <> 'awaiting' then raise exception 'FAIL: confirmation changed'; end if;
  if (select order_status from intake_orders where confirmation_token = 'TOK-ATOMIC') <> 'Awaiting Customer Confirmation' then raise exception 'FAIL: intake changed'; end if;
  if exists(select 1 from confirmation_reply_receipts where event_id = 'EVENT-ATOMIC') then raise exception 'FAIL: receipt survived'; end if;
  if exists(select 1 from customers where phone = '+971500000001') then raise exception 'FAIL: customer survived'; end if;
end $$;
drop trigger synthetic_failure on orders;
drop function test_reject_order();
do $$ declare a jsonb; b jsonb; begin
  a := apply_confirmation_reply('TOK-ATOMIC', 'EVENT-ATOMIC', 'confirm', '+971500000001', '{}'::jsonb);
  b := apply_confirmation_reply('TOK-ATOMIC', 'EVENT-ATOMIC', 'confirm', '+971500000001', '{}'::jsonb);
  if a->>'order_id' is null or a->>'order_id' is distinct from b->>'order_id' then raise exception 'FAIL: duplicate core order'; end if;
  if b->>'replayed' <> 'true' then raise exception 'FAIL: no replay'; end if;
  if (select count(*) from orders where phone = '+971500000001') <> 1 then raise exception 'FAIL: expected one order'; end if;
  if (select status from order_confirmations where token = 'TOK-ATOMIC') <> 'confirmed' then raise exception 'FAIL: not confirmed'; end if;
  begin
    perform apply_confirmation_reply('TOK-ATOMIC', 'EVENT-ATOMIC', 'confirm', '+971500000002', '{}'::jsonb);
    raise exception 'FAIL: other sender accepted';
  exception when others then if sqlerrm <> 'sender mismatch' then raise; end if; end;
  begin
    perform apply_confirmation_reply('TOK-ATOMIC', 'EVENT-ATOMIC', 'decline', '+971500000001', '{}'::jsonb);
    raise exception 'FAIL: conflicting action accepted';
  exception when others then if sqlerrm <> 'event conflict' then raise; end if; end;
end $$;
set local test.role = 'authenticated';
do $$ begin
  perform apply_confirmation_reply('TOK-ATOMIC', 'EVENT-ATOMIC', 'confirm', '+971500000001', '{}'::jsonb);
  raise exception 'FAIL: browser accepted';
exception when others then if sqlerrm <> 'apply_confirmation_reply requires the service role' then raise; end if; end $$;
rollback;
\echo atomic_confirmation: all checks passed
