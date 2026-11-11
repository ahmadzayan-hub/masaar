-- Only the Storage catalog shape referenced by 0011. This is not a Storage
-- HTTP service: MIME/size upload enforcement, JWTs and URLs are not simulated.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  metadata jsonb default '{}',
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
