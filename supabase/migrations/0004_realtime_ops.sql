-- Beyond Style UAE — Phase 3 real-time ops hardening.
-- Idempotency for inbound WhatsApp webhooks (Meta retries deliver the same
-- message id more than once; we must process each event exactly once).

create table if not exists processed_events (
  event_id text primary key,        -- WhatsApp message id (wamid…) or other source id
  source text not null default 'whatsapp',
  created_at timestamptz not null default now()
);

create index if not exists processed_events_created_idx on processed_events(created_at);

alter table processed_events enable row level security;
create policy processed_events_authenticated on processed_events
  for all to authenticated using (true) with check (true);
