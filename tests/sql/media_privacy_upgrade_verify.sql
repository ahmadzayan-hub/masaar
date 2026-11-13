do $$ begin
  if not exists (select from media_assets where id='93000000-0000-0000-0000-000000000001'
    and contains_private_data is true and photo_classification='customer_private_order_photo'
    and storage_path='legacy/private.jpg' and file_url='legacy/private.jpg'
    and description='SYNTHETIC preserve private metadata') then
    raise exception 'FAIL: private legacy row not repaired or metadata changed';
  end if;
  if not exists (select from media_assets where id='93000000-0000-0000-0000-000000000002'
    and contains_private_data is null and photo_classification='supplier_photo'
    and storage_path='legacy/supplier.jpg' and file_url='legacy/supplier.jpg'
    and description='SYNTHETIC preserve supplier metadata') then
    raise exception 'FAIL: unrelated legacy row changed';
  end if;
end $$;
\echo Legacy privacy upgrade preserves rows and metadata; repeated application passed.
