-- Valid under 0011: reproduce a legacy NULL without dropping any constraint.
insert into media_assets(id,storage_path,file_url,photo_classification,contains_private_data,description) values
 ('93000000-0000-0000-0000-000000000001','legacy/private.jpg','legacy/private.jpg','customer_private_order_photo',null,'SYNTHETIC preserve private metadata'),
 ('93000000-0000-0000-0000-000000000002','legacy/supplier.jpg','legacy/supplier.jpg','supplier_photo',null,'SYNTHETIC preserve supplier metadata');
