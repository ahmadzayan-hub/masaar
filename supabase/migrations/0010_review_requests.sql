-- Phase 2 (second half): review request log and review capture.
--
-- A review request is a manual act: the operator copies the draft, sends it
-- from the business WhatsApp/Instagram account, then records that it was sent.
-- One request per order (dedup is enforced here, not in the UI). A captured
-- review is one per order and its permission_to_share flag is only ever set
-- from an explicit customer "yes" recorded by the operator; it is never inferred.

create table if not exists review_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram','other')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  note text
);
create unique index if not exists review_requests_order_uniq on review_requests (order_id);

alter table review_requests enable row level security;
drop policy if exists review_requests_read on review_requests;
create policy review_requests_read on review_requests for select to authenticated using (true);
drop policy if exists review_requests_write on review_requests;
-- Insert only: a request that was sent cannot be unsent. Deletion stays with the service role.
create policy review_requests_write on review_requests for insert to authenticated
  with check (app_role() in ('owner','operator'));

-- One captured review per order.
create unique index if not exists reviews_order_uniq on reviews (order_id) where order_id is not null;
