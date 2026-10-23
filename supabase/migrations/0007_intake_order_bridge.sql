-- Masaar: bridge a customer-confirmed intake order into the core `orders` lifecycle.
--
-- Until this migration a WhatsApp "Confirm" only changed the text status on
-- intake_orders and the Google Sheet; no row ever reached `orders`, so the
-- lifecycle in 0006 (payment, design approval, production, QC, dispatch) had
-- nothing to act on. promote_intake_order() is the one door:
--   * service role only (the inbound webhook), never a browser session;
--   * only for an intake the customer confirmed ('Confirmed - In Preparation');
--   * idempotent: a Meta redelivery or a retry returns the same order, never a
--     second one (row lock + unique link);
--   * the new order enters as 'confirmed', the entry 0006 already permits for
--     webhook-confirmed intake, with an order_events row and the
--     'customer.order_confirmed' domain event.
-- Prices are NOT copied: the intake carries free text, not a validated quote.
-- Staff price the order before it can move to 'paid'.
--
-- Rollback: drop function promote_intake_order(text);
--           alter table intake_orders drop column core_order_id;
-- (orders created by the bridge stay; they are real customer confirmations.)

alter table intake_orders
  add column if not exists core_order_id uuid references orders(id) on delete set null;
create unique index if not exists intake_orders_core_order_uidx
  on intake_orders (core_order_id) where core_order_id is not null;

create or replace function promote_intake_order(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_intake intake_orders;
  v_customer uuid;
  v_order uuid;
  v_platform text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'promote_intake_order requires the service role';
  end if;

  select * into v_intake from intake_orders where confirmation_token = p_token for update;
  if not found then
    raise exception 'intake order % not found', p_token;
  end if;
  if v_intake.core_order_id is not null then
    return v_intake.core_order_id;  -- already promoted: idempotent
  end if;
  if v_intake.order_status is distinct from 'Confirmed - In Preparation' then
    raise exception 'intake order % is not customer-confirmed (status %)', p_token, v_intake.order_status;
  end if;

  select id into v_customer from customers
   where phone = v_intake.phone
   order by created_at desc limit 1;
  if v_customer is null then
    v_platform := case lower(coalesce(v_intake.source_platform, ''))
      when 'instagram' then 'instagram'
      when 'whatsapp' then 'whatsapp'
      when 'tiktok' then 'tiktok'
      else 'other'
    end;
    insert into customers (name_display, platform, phone, instagram_handle)
    values (v_intake.customer_name, v_platform, v_intake.phone, v_intake.instagram_username)
    returning id into v_customer;
  end if;

  insert into orders (customer_id, order_status, product_summary, delivery_city, delivery_area,
                      delivery_address, phone, notes)
  values (v_customer, 'confirmed', v_intake.order_summary, v_intake.emirate, v_intake.area,
          v_intake.full_address, v_intake.phone,
          concat_ws(E'\n', 'Promoted from intake ' || p_token,
                    case when v_intake.order_id is not null then 'Form order id: ' || v_intake.order_id end))
  returning id into v_order;

  insert into order_events (order_id, from_status, to_status, actor_type, actor_role, reason)
  values (v_order, 'intake', 'confirmed', 'system', 'system', 'Customer confirmed on WhatsApp');

  insert into domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('customer.order_confirmed', 'order', v_order,
          jsonb_build_object('intake_token', p_token, 'from', 'intake', 'to', 'confirmed', 'actor_type', 'system'));

  update intake_orders set core_order_id = v_order, updated_at = now() where id = v_intake.id;
  return v_order;
end;
$$;
revoke all on function promote_intake_order(text) from public;
grant execute on function promote_intake_order(text) to service_role;
