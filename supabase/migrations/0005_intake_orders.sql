-- Beyond Style UAE — durable intake/order record for the confirmation flow.
-- The validated lead lands here at form-intake (status "Awaiting Customer
-- Confirmation"); the inbound WhatsApp webhook flips it to Confirmed / Cancelled
-- / Edit Requested. This is the durable source of truth the console reads, and
-- it mirrors the Master Database "Form Responses" / "Master Orders" sheet.

create table if not exists intake_orders (
  id uuid primary key default gen_random_uuid(),
  confirmation_token text unique,
  order_id text,
  customer_name text,
  phone text,
  whatsapp_number text,
  email text,
  emirate text,
  area text,
  full_address text,
  google_maps_location text,
  preferred_delivery_time text,
  payment_method text,
  order_summary text,
  source_platform text,
  instagram_username text,
  critical_data_status text,
  order_status text not null default 'Awaiting Customer Confirmation',
  lead jsonb,
  sheet_synced boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intake_orders_status_idx on intake_orders(order_status);
create index if not exists intake_orders_phone_idx on intake_orders(phone);
create index if not exists intake_orders_token_idx on intake_orders(confirmation_token);

alter table intake_orders enable row level security;
create policy intake_orders_authenticated on intake_orders
  for all to authenticated using (true) with check (true);
