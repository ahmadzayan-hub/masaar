-- REVIEW ONLY. Atomic idempotent ingestion; external sends remain at-least-once.
create table if not exists public.form_intake_receipts (
  submission_id text primary key,
  payload jsonb not null,
  token text not null unique references public.order_confirmations(token),
  notification_sent boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.form_intake_receipts enable row level security;
revoke all on public.form_intake_receipts from anon, authenticated;
grant select, insert, update on public.form_intake_receipts to service_role;

create or replace function public.ingest_form_submission(p_submission_id text, p_payload jsonb, p_token text, p_intake jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_receipt public.form_intake_receipts; v_status text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if length(coalesce(p_submission_id, '')) not between 1 and 200 then raise exception 'submission id required'; end if;
  -- Transaction-scoped lock serializes the same submission, including after restart.
  perform pg_advisory_xact_lock(hashtextextended(p_submission_id, 0));
  select * into v_receipt from public.form_intake_receipts where submission_id = p_submission_id;
  if found then
    if v_receipt.payload is distinct from p_payload then raise exception 'idempotency payload conflict' using errcode = '23505'; end if;
    select status into v_status from public.order_confirmations where token = v_receipt.token;
    return jsonb_build_object('token', v_receipt.token, 'created', false, 'notification_sent', v_receipt.notification_sent, 'status', v_status);
  end if;
  insert into public.order_confirmations(token, order_id, customer_name, phone, email, order_summary, lead)
  values(p_token, p_intake->>'orderId', p_intake->>'customerName', p_intake->>'whatsappNumber',
         p_intake->>'email', p_intake->>'orderSummary', p_payload);
  insert into public.intake_orders(confirmation_token, order_id, customer_name, phone, whatsapp_number,
    email, emirate, area, full_address, google_maps_location, preferred_delivery_time, payment_method,
    order_summary, source_platform, instagram_username, critical_data_status, order_status, lead, sheet_synced)
  values(p_token, p_intake->>'orderId', p_intake->>'customerName', p_intake->>'phone', p_intake->>'whatsappNumber',
    p_intake->>'email', p_intake->>'emirate', p_intake->>'area', p_intake->>'fullAddress', p_intake->>'googleMapsLocation',
    p_intake->>'preferredDeliveryTime', p_intake->>'paymentMethod', p_intake->>'orderSummary',
    p_intake->>'sourcePlatform', p_intake->>'instagramUsername', 'DATA INTACT', 'Awaiting Customer Confirmation', p_intake, false);
  insert into public.form_intake_receipts(submission_id, payload, token) values(p_submission_id, p_payload, p_token);
  return jsonb_build_object('token', p_token, 'created', true, 'notification_sent', false, 'status', 'awaiting');
end;
$$;
revoke all on function public.ingest_form_submission(text, jsonb, text, jsonb) from public;
grant execute on function public.ingest_form_submission(text, jsonb, text, jsonb) to service_role;
