-- Harden the existing bridge in this migration, including installations that already applied0007.
create or replace function public.promote_intake_order(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_intake public.intake_orders;
  v_customer uuid;
  v_order uuid;
  v_platform text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'promote_intake_order requires the service role';
  end if;

  select * into v_intake from public.intake_orders where confirmation_token = p_token for update;
  if not found then
    raise exception 'intake order % not found', p_token;
  end if;
  if v_intake.core_order_id is not null then
    return v_intake.core_order_id;  -- already promoted: idempotent
  end if;
  if v_intake.order_status is distinct from 'Confirmed - In Preparation' then
    raise exception 'intake order % is not customer-confirmed (status %)', p_token, v_intake.order_status;
  end if;

  select id into v_customer from public.customers
   where phone = v_intake.phone
   order by created_at desc limit 1;
  if v_customer is null then
    v_platform := case lower(coalesce(v_intake.source_platform, ''))
      when 'instagram' then 'instagram'
      when 'whatsapp' then 'whatsapp'
      when 'tiktok' then 'tiktok'
      else 'other'
    end;
    insert into public.customers (name_display, platform, phone, instagram_handle)
    values (v_intake.customer_name, v_platform, v_intake.phone, v_intake.instagram_username)
    returning id into v_customer;
  end if;

  insert into public.orders (customer_id, order_status, product_summary, delivery_city, delivery_area,
                      delivery_address, phone, notes)
  values (v_customer, 'confirmed', v_intake.order_summary, v_intake.emirate, v_intake.area,
          v_intake.full_address, v_intake.phone,
          concat_ws(E'\n', 'Promoted from intake ' || p_token,
                    case when v_intake.order_id is not null then 'Form order id: ' || v_intake.order_id end))
  returning id into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_type, actor_role, reason)
  values (v_order, 'intake', 'confirmed', 'system', 'system', 'Customer confirmed on WhatsApp');

  insert into public.domain_events (event_type, aggregate_type, aggregate_id, payload)
  values ('customer.order_confirmed', 'order', v_order,
          jsonb_build_object('intake_token', p_token, 'from', 'intake', 'to', 'confirmed', 'actor_type', 'system'));

  update public.intake_orders set core_order_id = v_order, updated_at = now() where id = v_intake.id;
  return v_order;
end;
$$;
revoke all on function public.promote_intake_order(text) from public;
grant execute on function public.promote_intake_order(text) to service_role;

-- REVIEW ONLY: do not apply to production without backup and owner approval.
-- Durable receipt + confirmation + intake + core order commit as one transaction.
-- A failed promotion rolls all of them back, allowing Meta's retry to do the work.
create table if not exists public.confirmation_reply_receipts (
  event_id text primary key,
  token text not null references public.order_confirmations(token),
  action text not null check (action in ('confirm', 'edit', 'decline')),
  core_order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.confirmation_reply_receipts enable row level security;
revoke all on public.confirmation_reply_receipts from anon, authenticated;
grant select, insert on public.confirmation_reply_receipts to service_role;

create or replace function public.apply_confirmation_reply(
  p_token text, p_event_id text, p_action text, p_phone text, p_reply jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_confirmation public.order_confirmations;
  v_receipt public.confirmation_reply_receipts;
  v_order uuid;
  v_status text;
  v_intake_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'apply_confirmation_reply requires the service role';
  end if;
  if coalesce(p_event_id, '') = '' or p_action not in ('confirm', 'edit', 'decline') or p_action is null then
    raise exception 'valid event id and action required';
  end if;
  -- Lock the confirmation before checking the receipt: concurrent deliveries
  -- for the same token serialize, including different ids from the same sender.
  select * into v_confirmation from public.order_confirmations where token = p_token for update;
  if not found then raise exception 'confirmation not found'; end if;
  if v_confirmation.phone is distinct from p_phone then raise exception 'sender mismatch'; end if;
  select * into v_receipt from public.confirmation_reply_receipts where event_id = p_event_id;
  if found then
    if v_receipt.token is distinct from p_token or v_receipt.action is distinct from p_action then
      raise exception 'event conflict';
    end if;
    return jsonb_build_object('order_id', v_receipt.core_order_id, 'replayed', true);
  end if;
  if v_confirmation.status <> 'awaiting' then raise exception 'confirmation already resolved'; end if;
  v_status := case p_action when 'confirm' then 'confirmed' when 'edit' then 'edit_requested' else 'declined' end;
  v_intake_status := case p_action when 'confirm' then 'Confirmed - In Preparation' when 'edit' then 'Edit Requested' else 'Cancelled by Customer' end;
  update public.intake_orders set order_status = v_intake_status, updated_at = now() where confirmation_token = p_token;
  if not found then raise exception 'intake not found'; end if;
  if p_action = 'confirm' then v_order := public.promote_intake_order(p_token); end if;
  update public.order_confirmations set status = v_status, responded_at = now(), raw_reply = p_reply where token = p_token;
  insert into public.confirmation_reply_receipts(event_id, token, action, core_order_id)
    values (p_event_id, p_token, p_action, v_order);
  return jsonb_build_object('order_id', v_order, 'replayed', false);
end;
$$;
revoke all on function public.apply_confirmation_reply(text, text, text, text, jsonb) from public;
grant execute on function public.apply_confirmation_reply(text, text, text, text, jsonb) to service_role;
