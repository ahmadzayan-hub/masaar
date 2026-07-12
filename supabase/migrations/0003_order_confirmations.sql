-- Beyond Style UAE — Phase 3 customer confirmation gate.
-- Records the WhatsApp order-confirmation step. An order is NOT released to
-- preparation until the customer taps "Confirm" on WhatsApp — this validates the
-- phone number is reachable/correct and that the customer still wants the order,
-- so the Halan courier does not face wrong numbers or non-responsive customers.

create table if not exists order_confirmations (
  id uuid primary key default gen_random_uuid(),
  -- Short opaque token embedded in the WhatsApp button payloads.
  token text not null unique,
  order_id text,                       -- BSU-xxxx when known
  customer_name text,
  phone text not null,                 -- E.164 (+9715XXXXXXXX) — the number we messaged
  email text,
  order_summary text,
  status text not null default 'awaiting'
    check (status in ('awaiting','confirmed','declined','edit_requested','expired')),
  -- Free-form snapshot of the validated lead row from the form.
  lead jsonb,
  channel text not null default 'whatsapp',
  attempts int not null default 1,     -- how many times we asked (max 3 per policy)
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  raw_reply jsonb
);

create index if not exists order_confirmations_phone_idx on order_confirmations(phone);
create index if not exists order_confirmations_status_idx on order_confirmations(status);
create index if not exists order_confirmations_order_idx on order_confirmations(order_id);

alter table order_confirmations enable row level security;
-- Server-side writes use the service-role key (bypasses RLS); authenticated
-- operators may read/manage from the console.
create policy order_confirmations_authenticated on order_confirmations
  for all to authenticated using (true) with check (true);
