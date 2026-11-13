-- Behaviour of promote_intake_order (0007). Synthetic rows only. Any failed check raises.
\set ON_ERROR_STOP on
begin;
insert into intake_orders (confirmation_token, customer_name, phone, emirate, area, full_address,
                           order_summary, source_platform, order_status)
values ('TOK-SYN-1', 'SYNTHETIC Aisha', '+971500000001', 'Dubai', 'JVC', 'SYNTHETIC address',
        'SYNTHETIC 2 bracelets', 'Instagram', 'Awaiting Customer Confirmation');

-- 1. A browser session (not service role) is refused.
set local test.role = 'authenticated';
do $$ begin
  perform promote_intake_order('TOK-SYN-1');
  raise exception 'FAIL: non-service caller was allowed';
exception when others then
  if sqlerrm not like '%requires the service role%' then raise; end if;
end $$;

-- 2. An unconfirmed intake is refused.
set local test.role = 'service_role';
do $$ begin
  perform promote_intake_order('TOK-SYN-1');
  raise exception 'FAIL: unconfirmed intake was promoted';
exception when others then
  if sqlerrm not like '%not customer-confirmed%' then raise; end if;
end $$;

-- 3. A confirmed intake becomes exactly one confirmed order, with event and domain event.
update intake_orders set order_status = 'Confirmed - In Preparation' where confirmation_token = 'TOK-SYN-1';
do $$
declare a uuid; b uuid; n int;
begin
  a := promote_intake_order('TOK-SYN-1');
  b := promote_intake_order('TOK-SYN-1');  -- redelivery
  if a is distinct from b then raise exception 'FAIL: second call created another order'; end if;
  select count(*) into n from orders where notes like 'Promoted from intake TOK-SYN-1%';
  if n <> 1 then raise exception 'FAIL: expected 1 order, found %', n; end if;
  if (select order_status from orders where id = a) <> 'confirmed' then raise exception 'FAIL: status'; end if;
  if (select total_amount from orders where id = a) is not null then raise exception 'FAIL: price invented'; end if;
  select count(*) into n from order_events where order_id = a and to_status = 'confirmed' and actor_type = 'system';
  if n <> 1 then raise exception 'FAIL: order_events %', n; end if;
  select count(*) into n from domain_events where aggregate_id = a and event_type = 'customer.order_confirmed';
  if n <> 1 then raise exception 'FAIL: domain_events %', n; end if;
  if (select platform from customers c join orders o on o.customer_id = c.id where o.id = a) <> 'instagram' then
    raise exception 'FAIL: platform';
  end if;
  -- 4. Status may still only move through advance_order_status.
  begin
    update orders set order_status = 'paid' where id = a;
    raise exception 'FAIL: direct status write allowed';
  exception when others then
    if sqlerrm not like '%must go through advance_order_status%' then raise; end if;
  end;
end $$;

-- 5. An unknown token is refused.
do $$ begin
  perform promote_intake_order('TOK-NOT-THERE');
  raise exception 'FAIL: unknown token accepted';
exception when others then
  if sqlerrm not like '%not found%' then raise; end if;
end $$;
rollback;
\echo intake_bridge: all checks passed
