-- REVIEW ONLY: do not apply to production without backup and owner approval.
-- Durable receipt + confirmation + intake + core order commit as one transaction.
-- A failed promotion rolls all of them back, allowing Meta's retry to do the work.
create table if not exists confirmation_reply_receipts (
  event_id text primary key,
  token text not null references order_confirmations(token),
  action text not null check (action in ('confirm', 'edit', 'decline')),
  core_order_id uuid references orders(id),
  created_at timestamptz not null default now()
);
alter table confirmation_reply_receipts enable row level security;
revoke all on confirmation_reply_receipts from anon, authenticated;
grant select, insert on confirmation_reply_receipts to service_role;

create or replace function apply_confirmation_reply(
  p_token text, p_event_id text, p_action text, p_phone text, p_reply jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_confirmation order_confirmations;
  v_receipt confirmation_reply_receipts;
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
  select * into v_confirmation from order_confirmations where token = p_token for update;
  if not found then raise exception 'confirmation not found'; end if;
  if v_confirmation.phone is distinct from p_phone then raise exception 'sender mismatch'; end if;
  select * into v_receipt from confirmation_reply_receipts where event_id = p_event_id;
  if found then
    if v_receipt.token is distinct from p_token or v_receipt.action is distinct from p_action then
      raise exception 'event conflict';
    end if;
    return jsonb_build_object('order_id', v_receipt.core_order_id, 'replayed', true);
  end if;
  if v_confirmation.status <> 'awaiting' then raise exception 'confirmation already resolved'; end if;
  v_status := case p_action when 'confirm' then 'confirmed' when 'edit' then 'edit_requested' else 'declined' end;
  v_intake_status := case p_action when 'confirm' then 'Confirmed - In Preparation' when 'edit' then 'Edit Requested' else 'Cancelled by Customer' end;
  update intake_orders set order_status = v_intake_status, updated_at = now() where confirmation_token = p_token;
  if not found then raise exception 'intake not found'; end if;
  if p_action = 'confirm' then v_order := promote_intake_order(p_token); end if;
  update order_confirmations set status = v_status, responded_at = now(), raw_reply = p_reply where token = p_token;
  insert into confirmation_reply_receipts(event_id, token, action, core_order_id)
    values (p_event_id, p_token, p_action, v_order);
  return jsonb_build_object('order_id', v_order, 'replayed', false);
end;
$$;
revoke all on function apply_confirmation_reply(text, text, text, text, jsonb) from public;
grant execute on function apply_confirmation_reply(text, text, text, text, jsonb) to service_role;
