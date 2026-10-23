-- Isolated disposable database only. Commit a synthetic receipt, exit PostgreSQL.
\set ON_ERROR_STOP on
begin;
set local test.role = 'service_role';
insert into order_confirmations(token, phone) values ('TOK-RESTART', '+971500000009');
insert into intake_orders(confirmation_token, customer_name, phone, emirate, order_status)
values ('TOK-RESTART', 'SYNTHETIC RESTART', '+971500000009', 'Dubai', 'Awaiting Customer Confirmation');
select apply_confirmation_reply('TOK-RESTART', 'EVENT-RESTART', 'confirm', '+971500000009', '{}'::jsonb);
commit;
