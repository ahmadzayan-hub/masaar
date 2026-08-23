-- Masaar P0 — RBAC, role-aware RLS, enforced order lifecycle, audit trail, domain events.
-- Replaces the blanket authenticated policies from 0001-0005 with role-scoped ones
-- and moves every order_status change behind advance_order_status().

-- ---------- 1. Roles ----------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner','operator','finance','workshop','readonly'));

-- Role of the calling session; anyone without a profile row is readonly.
create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'readonly');
$$;
revoke all on function app_role() from public;
grant execute on function app_role() to authenticated;

-- ---------- 2. Canonical order lifecycle ----------
-- lead → qualified → confirmed → paid → design_approval → production → qc
--      → dispatched → delivered → after_sales  (cancelled from any pre-dispatch stage)
alter table orders drop constraint if exists orders_order_status_check;

update orders set order_status = case order_status
  when 'draft' then 'lead'
  when 'awaiting_payment' then 'confirmed'
  when 'complaint' then 'after_sales'
  else order_status
end
where order_status in ('draft','awaiting_payment','complaint');

alter table orders alter column order_status set default 'lead';
alter table orders alter column order_status set not null;
alter table orders add constraint orders_order_status_check
  check (order_status in
    ('lead','qualified','confirmed','paid','design_approval','production',
     'qc','dispatched','delivered','after_sales','cancelled'));

-- Reference table: which transitions exist and who may perform them.
create table if not exists order_transitions (
  from_status text not null,
  to_status text not null,
  allowed_roles text[] not null,
  primary key (from_status, to_status)
);

insert into order_transitions (from_status, to_status, allowed_roles) values
  ('lead',            'qualified',       array['owner','operator']),
  ('qualified',       'confirmed',       array['owner','operator']),
  ('confirmed',       'paid',            array['owner','finance']),
  ('paid',            'design_approval', array['owner','operator']),
  ('design_approval', 'production',      array['owner','operator','workshop']),
  ('production',      'qc',              array['owner','workshop']),
  ('qc',              'production',      array['owner','workshop']),          -- rework
  ('qc',              'dispatched',      array['owner','operator','workshop']),
  ('dispatched',      'delivered',       array['owner','operator']),
  ('delivered',       'after_sales',     array['owner','operator']),
  ('lead',            'cancelled',       array['owner','operator']),
  ('qualified',       'cancelled',       array['owner','operator']),
  ('confirmed',       'cancelled',       array['owner','operator']),
  ('paid',            'cancelled',       array['owner']),
  ('design_approval', 'cancelled',       array['owner']),
  ('production',      'cancelled',       array['owner']),
  ('qc',              'cancelled',       array['owner'])
on conflict (from_status, to_status) do update set allowed_roles = excluded.allowed_roles;

-- ---------- 3. Transition audit + domain-event outbox ----------
create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor_id uuid,
  actor_type text not null default 'human' check (actor_type in ('human','ai','system')),
  actor_role text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events (order_id, created_at);

create table if not exists domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists domain_events_unprocessed_idx
  on domain_events (created_at) where processed_at is null;

-- ---------- 4. The only door for status changes ----------
create or replace function advance_order_status(
  p_order_id uuid,
  p_to text,
  p_reason text default null,
  p_actor_type text default 'human'
) returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_from text;
  v_role text;
  v_allowed text[];
  v_order orders;
  v_event text;
begin
  if p_actor_type not in ('human','ai','system') then
    raise exception 'invalid actor_type %', p_actor_type;
  end if;

  if p_actor_type = 'human' then
    v_role := app_role();
  else
    -- Only trusted server-side code (service role) may act as ai/system.
    if auth.role() is distinct from 'service_role' then
      raise exception 'actor_type % requires the service role', p_actor_type;
    end if;
    v_role := p_actor_type;
  end if;

  select order_status into v_from from orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  select allowed_roles into v_allowed
  from order_transitions where from_status = v_from and to_status = p_to;
  if not found then
    raise exception 'invalid transition % -> %', v_from, p_to;
  end if;

  if p_actor_type = 'human' and not (v_role = any (v_allowed)) then
    raise exception 'role % may not move an order from % to %', v_role, v_from, p_to;
  end if;

  perform set_config('masaar.lifecycle_rpc', 'on', true);
  update orders set order_status = p_to where id = p_order_id returning * into v_order;

  insert into order_events (order_id, from_status, to_status, actor_id, actor_type, actor_role, reason)
  values (p_order_id, v_from, p_to, auth.uid(), p_actor_type, v_role, p_reason);

  insert into audit_logs (user_id, action, entity, entity_id, old_value, new_value)
  values (auth.uid(), 'order.status_advanced', 'orders', p_order_id,
          jsonb_build_object('order_status', v_from),
          jsonb_build_object('order_status', p_to, 'reason', p_reason, 'actor_type', p_actor_type));

  v_event := case p_to
    when 'confirmed'   then 'customer.order_confirmed'
    when 'paid'        then 'order.paid'
    when 'dispatched'  then 'order.dispatched'
    when 'delivered'   then 'order.delivered'
    when 'after_sales' then 'order.after_sales_opened'
    when 'cancelled'   then 'order.cancelled'
    else null
  end;
  if v_event is not null then
    insert into domain_events (event_type, aggregate_type, aggregate_id, payload)
    values (v_event, 'order', p_order_id,
            jsonb_build_object('from', v_from, 'to', p_to, 'reason', p_reason,
                               'actor_type', p_actor_type, 'actor_role', v_role));
  end if;

  return v_order;
end;
$$;
revoke all on function advance_order_status(uuid, text, text, text) from public;
grant execute on function advance_order_status(uuid, text, text, text) to authenticated, service_role;

-- Block direct order_status writes that bypass the RPC (service role included —
-- triggers fire regardless of RLS).
create or replace function orders_status_guard() returns trigger
language plpgsql as $$
begin
  if current_setting('masaar.lifecycle_rpc', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.order_status is distinct from old.order_status then
    raise exception 'order_status changes must go through advance_order_status()';
  end if;
  if tg_op = 'INSERT' and new.order_status not in ('lead','confirmed') then
    -- new orders enter as leads; webhook-confirmed intake may land directly as confirmed
    raise exception 'new orders must start as lead (or confirmed via intake), not %', new.order_status;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_status_guard on orders;
create trigger orders_status_guard
  before insert or update on orders
  for each row execute function orders_status_guard();

-- ---------- 5. Role-aware RLS ----------
-- Drop the blanket for-all policies, keep reads for every authenticated user,
-- scope writes by role.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','conversations','media_assets','products','inventory','offers',
    'orders','payments','couriers','deliveries','suppliers','reviews','followups',
    'ai_outputs','prompts','settings','audit_logs','profiles'
  ] loop
    execute format('drop policy if exists %1$I_authenticated on %1$I;', t);
    execute format($f$
      create policy %1$I_read on %1$I for select to authenticated using (true);
    $f$, t);
  end loop;
end $$;

drop policy if exists disputes_authenticated on disputes;
drop policy if exists order_confirmations_authenticated on order_confirmations;
drop policy if exists processed_events_authenticated on processed_events;
drop policy if exists intake_orders_authenticated on intake_orders;
create policy disputes_read on disputes for select to authenticated using (true);
create policy order_confirmations_read on order_confirmations for select to authenticated using (true);
create policy processed_events_read on processed_events for select to authenticated using (true);
create policy intake_orders_read on intake_orders for select to authenticated using (true);

-- Operational tables: owner + operator write.
do $$
declare t text;
begin
  foreach t in array array[
    'customers','conversations','media_assets','products','offers','orders',
    'couriers','deliveries','suppliers','reviews','followups','ai_outputs',
    'disputes','order_confirmations','intake_orders'
  ] loop
    execute format($f$
      create policy %1$I_write on %1$I for all to authenticated
        using (app_role() in ('owner','operator'))
        with check (app_role() in ('owner','operator'));
    $f$, t);
  end loop;
end $$;

-- Finance: payments. Workshop: inventory (owner always included).
create policy payments_write on payments for all to authenticated
  using (app_role() in ('owner','finance'))
  with check (app_role() in ('owner','finance'));
create policy inventory_write on inventory for all to authenticated
  using (app_role() in ('owner','operator','workshop'))
  with check (app_role() in ('owner','operator','workshop'));

-- Owner-only: settings, prompts, profiles (role assignment stays with the owner).
do $$
declare t text;
begin
  foreach t in array array['settings','prompts','profiles'] loop
    execute format($f$
      create policy %1$I_write on %1$I for all to authenticated
        using (app_role() = 'owner')
        with check (app_role() = 'owner');
    $f$, t);
  end loop;
end $$;

-- Audit trail: append-only for authenticated users; no update/delete policy exists.
create policy audit_logs_append on audit_logs for insert to authenticated
  with check (app_role() <> 'readonly');

-- New tables: RLS on; order_events/domain_events written only by security-definer
-- code or the service role, readable in-app.
alter table order_transitions enable row level security;
alter table order_events enable row level security;
alter table domain_events enable row level security;
create policy order_transitions_read on order_transitions for select to authenticated using (true);
create policy order_events_read on order_events for select to authenticated using (true);
create policy domain_events_read on domain_events for select to authenticated using (true);
-- processed_events: no authenticated write policy — service role only.
