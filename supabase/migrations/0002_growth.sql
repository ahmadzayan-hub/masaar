-- Beyond Style UAE — growth & operations modules.
-- Adds disputes, VIP tracking, and inventory velocity fields. Run after 0001.

-- ---------- VIP / repeat accelerator ----------
alter table customers add column if not exists purchase_count int not null default 0;
alter table customers add column if not exists vip boolean not null default false;

-- ---------- Inventory velocity ----------
-- daily_sales_rate can be set manually or recomputed from order history.
alter table inventory add column if not exists daily_sales_rate numeric not null default 0;
alter table inventory add column if not exists reorder_lead_days int not null default 7;

-- ---------- Disputes / complaint protocol ----------
create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  reason text not null check (reason in
    ('damaged','wrong_item','delivery_delay','payment_issue',
     'custom_dispute','material_claim','courier_failure','refund_request')),
  status text not null default 'open' check (status in ('open','in_review','resolved','rejected')),
  description text,
  evidence_url text,
  resolution_note text,
  -- When true, the linked order is locked from dispatch until resolved.
  locks_order boolean not null default true,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists disputes_order_idx on disputes(order_id);
create index if not exists disputes_status_idx on disputes(status);

alter table disputes enable row level security;
create policy disputes_authenticated on disputes
  for all to authenticated using (true) with check (true);

-- Helpful: orders carry a lock flag mirrored from open disputes (set by app).
alter table orders add column if not exists locked_by_dispute boolean not null default false;
