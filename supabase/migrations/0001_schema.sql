-- Beyond Style UAE — Customer Conversion & Order Control Agent
-- Schema (spec §27). Run in the Supabase SQL editor or via the CLI.

create extension if not exists "pgcrypto";

-- ---------- Roles / app users ----------
-- App role lives in a profile table keyed to auth.users.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'operator' check (role in ('owner','operator')),
  created_at timestamptz not null default now()
);

-- ---------- Customers ----------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name_display text,
  name_arabic_verified text,
  name_confidence numeric default 0,
  platform text check (platform in ('instagram','whatsapp','tiktok','meta_ads','comment','other')),
  phone text,
  instagram_handle text,
  language text default 'en' check (language in ('ar','en','mixed')),
  consent_status text default 'none' check (consent_status in ('none','soft','explicit','purchased')),
  segment text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Conversations ----------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  platform text,
  message_text text,
  message_language text,
  intent text,
  stage text,
  lead_temperature text check (lead_temperature in ('cold','warm','hot')),
  persona text,
  risk_level text check (risk_level in ('low','medium','high','block')),
  created_at timestamptz not null default now()
);

-- ---------- Media assets ----------
create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  file_url text,
  media_type text,
  photo_classification text check (photo_classification in
    ('real_stock_photo','supplier_photo','ai_generated_photo',
     'customer_private_order_photo','competitor_reference_photo','unclear')),
  contains_private_data boolean default false,
  description text,
  created_at timestamptz not null default now()
);

-- ---------- Products ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  default_price numeric not null default 0,
  claim_notes text,
  active boolean not null default true
);

-- ---------- Inventory ----------
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  colour text,
  finish text check (finish in ('gold_tone','silver_tone','other')),
  quantity_available int not null default 0,
  quantity_reserved int not null default 0,
  quantity_paid int not null default 0,
  quantity_dispatched int not null default 0,
  quantity_delivered int not null default 0,
  photo_url text,
  supplier_source text,
  last_updated timestamptz not null default now()
);

-- ---------- Offers ----------
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  products_included text[],
  price numeric not null,
  delivery_rule text check (delivery_rule in ('free_dubai','courier_confirm','flat','excluded')),
  emirates_covered text[],
  vat_rule text check (vat_rule in ('inclusive','exclusive','none')),
  start_at timestamptz,
  end_at timestamptz,
  terms text,
  active boolean not null default true
);

-- ---------- Orders ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  order_status text default 'draft' check (order_status in
    ('draft','awaiting_payment','paid','qc','dispatched','delivered','cancelled','complaint')),
  product_summary text,
  quantity int,
  colours text,
  product_price numeric,
  delivery_cost numeric,
  vat_amount numeric,
  total_amount numeric,
  payment_status text default 'none',
  courier_status text default 'none',
  delivery_city text,
  delivery_area text,
  delivery_address text,
  phone text,
  expected_delivery_date date,
  actual_received_date date,
  receiver_name text,
  staff_number text default 'N/A',
  qc jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Payments ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  payment_method text,
  payment_link text,
  amount_expected numeric,
  amount_received numeric,
  vat_amount numeric,
  delivery_amount numeric,
  reference text,
  screenshot_url text,
  status text default 'none' check (status in ('none','link_sent','needs_verification','confirmed','refunded')),
  confirmed_by uuid references profiles(id),
  order_activated boolean default false,
  created_at timestamptz not null default now()
);

-- ---------- Couriers ----------
create table if not exists couriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  service_type text,
  default_cost numeric,
  vat_included boolean default false,
  notes text
);

-- ---------- Deliveries ----------
create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  courier_id uuid references couriers(id) on delete set null,
  pickup_time timestamptz,
  expected_delivery_date date,
  actual_delivery_time timestamptz,
  proof_dispatch_url text,
  proof_delivery_url text,
  receiver_name text,
  actual_received_date date,
  staff_number text default 'N/A',
  failed_attempts int default 0,
  delivery_status text,
  notes text
);

-- ---------- Suppliers ----------
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact text,
  platform text,
  catalogue_status text,
  real_video_received boolean default false,
  material_proof text,
  sample_status text,
  sample_approved boolean default false,
  moq int,
  unit_cost numeric,
  shipping_cost numeric,
  production_time text,
  wrong_item_policy text,
  damage_policy text,
  payment_method text,
  risk_score numeric,
  notes text
);

-- ---------- Reviews ----------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  rating int,
  feedback text,
  permission_to_share boolean default false,
  story_mention boolean default false,
  created_at timestamptz not null default now()
);

-- ---------- Follow-ups ----------
create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  type text,
  message text,
  scheduled_at timestamptz,
  status text default 'pending' check (status in ('pending','sent','cancelled')),
  created_at timestamptz not null default now()
);

-- ---------- AI outputs ----------
create table if not exists ai_outputs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  analysis_json jsonb,
  guardrails_json jsonb,
  reply_draft text,
  confidence_score numeric,
  approved boolean default false,
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Prompts (owner-editable, §28) ----------
create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text,
  body text not null,
  updated_at timestamptz not null default now()
);

-- ---------- Settings (key/value, e.g. VAT rule, default reservation hours) ----------
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Audit log ----------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text,
  entity text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Row level security ----------
-- Enable RLS; any authenticated owner/operator may read & write operational data.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','conversations','media_assets','products','inventory','offers',
    'orders','payments','couriers','deliveries','suppliers','reviews','followups',
    'ai_outputs','prompts','settings','audit_logs','profiles'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format($f$
      create policy %1$I_authenticated on %1$I
      for all to authenticated using (true) with check (true);
    $f$, t);
  end loop;
end $$;
