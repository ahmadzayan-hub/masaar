-- Actual PostgreSQL constraints and RLS, with synthetic users and objects.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.expect_state(statement text, expected text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'FAIL: expected SQLSTATE % for %', expected, statement;
end $$;
create function pg_temp.affected(statement text, expected integer) returns void
language plpgsql as $$ declare n integer; begin
  execute statement;
  get diagnostics n = row_count;
  if n <> expected then raise exception 'FAIL: affected %, expected %: %', n, expected, statement; end if;
end $$;

-- Grant table privileges explicitly so policy checks, not a missing GRANT,
-- determine the outcome. Production policies remain completely unchanged.
grant select, insert, update, delete on media_assets, reviews, review_requests to authenticated, anon;
insert into auth.users(id)
select ('92000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,6) i;
insert into profiles(id,role) values
 ('92000000-0000-0000-0000-000000000001','owner'),
 ('92000000-0000-0000-0000-000000000002','operator'),
 ('92000000-0000-0000-0000-000000000003','finance'),
 ('92000000-0000-0000-0000-000000000004','workshop'),
 ('92000000-0000-0000-0000-000000000005','readonly');
insert into orders(id,product_summary) values
 ('92000000-0000-0000-0000-000000000101','Synthetic review A'),
 ('92000000-0000-0000-0000-000000000102','Synthetic review B');
insert into storage.buckets(id,name,public) values ('outside','outside',false);
insert into storage.objects(bucket_id,name) values ('outside','hidden.jpg');
select pg_temp.assert_true(
 (select not public and file_size_limit=10485760
   and allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','application/pdf']
  from storage.buckets where id='media'), 'private bucket catalog, types and size');

set local role authenticated;
set local test.role = 'authenticated';
select pg_temp.assert_true(current_user='authenticated'
 and not (select rolsuper or rolbypassrls from pg_roles where rolname=current_user),
 'policy checks execute as a non-bypass authenticated role');
select pg_temp.assert_true(row_security_active('storage.objects')
 and row_security_active('media_assets') and row_security_active('reviews')
 and row_security_active('review_requests'), 'RLS active on every tested table');

do $$
declare i integer; role_name text; v_order_id uuid;
begin
  for i in 1..6 loop
    role_name := (array['owner','operator','finance','workshop','readonly','readonly'])[i];
    perform set_config('test.uid','92000000-0000-0000-0000-' || lpad(i::text,12,'0'),true);
    perform pg_temp.assert_true(app_role()=role_name,'app role including unprofiled fallback');
    perform pg_temp.assert_true(not exists (select from storage.objects where bucket_id='outside'),
      'other buckets remain hidden');
    if i <= 2 then
      v_order_id := ('92000000-0000-0000-0000-' || lpad((100+i)::text,12,'0'))::uuid;
      insert into review_requests(order_id,channel) values (v_order_id,'whatsapp');
      perform pg_temp.expect_state(format(
        'insert into review_requests(order_id,channel) values (%L,''instagram'')',v_order_id),'23505');
      insert into reviews(order_id,feedback) values (v_order_id,'Synthetic feedback');
      perform pg_temp.assert_true((select permission_to_share is false from reviews where reviews.order_id=v_order_id),
        'review capture never defaults to sharing consent');
      perform pg_temp.expect_state(format(
        'insert into reviews(order_id,feedback) values (%L,''duplicate'')',v_order_id),'23505');
      insert into media_assets(storage_path,file_url,photo_classification,contains_private_data,order_id)
        values (role_name || '/private.jpg',role_name || '/private.jpg','customer_private_order_photo',true,v_order_id);
      perform pg_temp.expect_state(format(
        'insert into media_assets(storage_path) values (%L)',role_name || '/private.jpg'),'23505');
      insert into storage.objects(bucket_id,name) values ('media',role_name || '/private.jpg');
      perform pg_temp.affected(format(
        'update storage.objects set metadata=''{"synthetic":true}'' where name=%L',role_name || '/private.jpg'),1);
      perform pg_temp.expect_state(format(
        'update storage.objects set bucket_id=''outside'' where name=%L',role_name || '/private.jpg'),'42501');
      perform pg_temp.expect_state('insert into storage.objects(bucket_id,name) values (''outside'',''new.jpg'')','42501');
    else
      perform pg_temp.expect_state('insert into review_requests(order_id,channel) values (''92000000-0000-0000-0000-000000000101'',''whatsapp'')','42501');
      perform pg_temp.expect_state('insert into reviews(feedback) values (''forbidden'')','42501');
      perform pg_temp.expect_state('insert into media_assets(description) values (''forbidden'')','42501');
      perform pg_temp.expect_state('insert into storage.objects(bucket_id,name) values (''media'',''forbidden.jpg'')','42501');
      perform pg_temp.affected('update media_assets set description=''forbidden'' where storage_path like ''%/private.jpg''',0);
      perform pg_temp.affected('delete from reviews where feedback=''Synthetic feedback''',0);
      perform pg_temp.affected('update storage.objects set metadata=''{}''',0);
    end if;
    -- Requests are append-only and Storage deletion has no authenticated policy,
    -- even for an owner. Reads are intentionally allowed to every console role.
    perform pg_temp.affected('update review_requests set channel=''other''',0);
    perform pg_temp.affected('delete from review_requests',0);
    perform pg_temp.affected('delete from storage.objects',0);
    perform pg_temp.assert_true(exists(select from review_requests),'console role reads requests');
    perform pg_temp.assert_true(exists(select from media_assets where storage_path='owner/private.jpg'),'console role reads media');
    perform pg_temp.assert_true(exists(select from storage.objects where bucket_id='media'),'console role reads media objects');
  end loop;
end $$;

-- Non-authenticated callers cannot see records, even with table privileges.
set local role anon;
set local test.role = 'anon';
set local test.uid = '';
select pg_temp.assert_true(not exists(select from media_assets) and not exists(select from review_requests)
 and not exists(select from reviews) and not exists(select from storage.objects), 'anonymous reads hidden');
select pg_temp.expect_state('insert into storage.objects(bucket_id,name) values (''media'',''anonymous.jpg'')','42501');

set local role authenticated;
set local test.role = 'authenticated';
set local test.uid = '92000000-0000-0000-0000-000000000001';
-- SQL CHECK must reject both false and NULL, on INSERT and UPDATE.
select pg_temp.expect_state('insert into media_assets(photo_classification,contains_private_data) values (''customer_private_order_photo'',false)','23514');
select pg_temp.expect_state('insert into media_assets(photo_classification,contains_private_data) values (''customer_private_order_photo'',null)','23514');
select pg_temp.expect_state('update media_assets set contains_private_data=null where storage_path=''owner/private.jpg''','23514');
select pg_temp.expect_state('update media_assets set contains_private_data=false where storage_path=''owner/private.jpg''','23514');
select pg_temp.expect_state('insert into review_requests(order_id,channel) values (''92000000-0000-0000-0000-000000000101'',''unknown'')','23514');

reset role;
delete from orders where id='92000000-0000-0000-0000-000000000101';
select pg_temp.assert_true((select order_id is null from media_assets where storage_path='owner/private.jpg'),
 'deleting an order retains its media metadata with a cleared link');
select pg_temp.assert_true(not exists(select from review_requests where order_id='92000000-0000-0000-0000-000000000101'),
 'deleted order has no surviving review request');
rollback;
\echo Review and media constraints, six console identities and anonymous RLS checks passed.
