-- A customer-private photo must have an explicit true privacy flag. SQL CHECK
-- accepts UNKNOWN, so the equality check in 0011 also allowed a NULL flag.
-- Preserve legacy rows and classify them conservatively before tightening it.
begin;

update media_assets
set contains_private_data = true
where photo_classification = 'customer_private_order_photo'
  and contains_private_data is distinct from true;

alter table media_assets drop constraint if exists media_assets_private_order_photo_flag;
alter table media_assets add constraint media_assets_private_order_photo_flag
  check (photo_classification is distinct from 'customer_private_order_photo'
         or contains_private_data is true);

commit;
