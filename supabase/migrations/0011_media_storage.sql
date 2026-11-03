-- Phase 2 (second half): persist uploads to Supabase Storage with classification.
--
-- Files live in the private `media` bucket under a classification-prefixed
-- path (<classification>/<yyyy>/<mm>/<id>-<name>.<ext>). media_assets records
-- the object path (file_url and storage_path hold the same value: no public
-- URL is ever stored), who uploaded it and its size/type. A customer's private
-- order photo is always contains_private_data = true (enforced by the API and
-- by the check below).

alter table media_assets add column if not exists order_id uuid references orders(id) on delete set null;
alter table media_assets add column if not exists storage_path text;
alter table media_assets add column if not exists content_type text;
alter table media_assets add column if not exists size_bytes bigint;
alter table media_assets add column if not exists uploaded_by uuid;

alter table media_assets drop constraint if exists media_assets_private_order_photo_flag;
alter table media_assets add constraint media_assets_private_order_photo_flag
  check (photo_classification <> 'customer_private_order_photo' or contains_private_data = true);

create unique index if not exists media_assets_storage_path_uniq on media_assets (storage_path) where storage_path is not null;
create index if not exists media_assets_order_idx on media_assets (order_id);

-- Private bucket. Public stays false: the console reads objects with a session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: owner and operator write, every authenticated console user reads.
-- Deletion stays with the service role.
drop policy if exists media_objects_read on storage.objects;
create policy media_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'media');
drop policy if exists media_objects_insert on storage.objects;
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and app_role() in ('owner','operator'));
drop policy if exists media_objects_update on storage.objects;
create policy media_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and app_role() in ('owner','operator'))
  with check (bucket_id = 'media' and app_role() in ('owner','operator'));
