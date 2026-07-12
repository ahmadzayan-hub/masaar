-- Beyond Style UAE — seed data (default catalogue, offers, couriers, prompts,
-- settings) and the §30 test-scenario conversations.

-- ---------- Products (§6 default catalogue) ----------
insert into products (name, category, default_price, claim_notes, active) values
  ('Masha''Allah Fashion Bracelet (1pc)', 'fashion_bracelet', 79, 'Fashion jewellery, plated. No real-gold/silver claims.', true),
  ('Masha''Allah Fashion Bracelet (2pc offer)', 'fashion_bracelet', 129, 'Fashion jewellery, plated.', true),
  ('Masha''Allah Fashion Bracelet (3pc offer)', 'fashion_bracelet', 179, 'Fashion jewellery, plated.', true),
  ('Custom Name Necklace', 'custom_name_necklace', 149, 'Customized item — non-returnable unless seller error.', true),
  ('Custom Car Hanger', 'car_hanger', 129, 'Customized item.', true),
  ('Custom Graduation / Special Design', 'graduation_charm', 169, 'Customized item; price subject to design review.', true),
  ('Gift Wrapping Add-on', 'gift_box', 0, 'Add if not already included in the offer.', true)
on conflict do nothing;

-- ---------- Offers (§6) ----------
insert into offers (name, description, products_included, price, delivery_rule, emirates_covered, vat_rule, start_at, end_at, terms, active) values
  ('Masha''Allah 1pc', 'Single Masha''Allah fashion bracelet', array['Masha''Allah Fashion Bracelet (1pc)'], 79, 'free_dubai', array['Dubai'], 'none', now() - interval '1 day', now() + interval '30 days', 'Free delivery inside Dubai only.', true),
  ('Masha''Allah 2pc', 'Two-piece bracelet offer', array['Masha''Allah Fashion Bracelet (2pc offer)'], 129, 'free_dubai', array['Dubai'], 'none', now() - interval '1 day', now() + interval '30 days', 'Free delivery inside Dubai only.', true),
  ('Masha''Allah 3pc', 'Three-piece bracelet offer', array['Masha''Allah Fashion Bracelet (3pc offer)'], 179, 'free_dubai', array['Dubai'], 'none', now() - interval '1 day', now() + interval '30 days', 'Free delivery inside Dubai only.', true)
on conflict do nothing;

-- ---------- Inventory ----------
insert into inventory (product_id, colour, finish, quantity_available)
select id, 'Black', 'gold_tone', 12 from products where name = 'Masha''Allah Fashion Bracelet (1pc)'
union all
select id, 'White', 'silver_tone', 8 from products where name = 'Masha''Allah Fashion Bracelet (1pc)';

-- ---------- Couriers (§10, configurable — NOT hard-coded in app logic) ----------
insert into couriers (name, contact, service_type, default_cost, vat_included, notes) values
  ('Halan', 'N/A', 'UAE-wide', 30, false, 'AED 30 across UAE, AED 50 remote areas — subject to confirmation.'),
  ('Sharjah Local', 'N/A', 'Sharjah', 25, false, 'Variable by timing (same-day higher, later lower). Confirm before promising.')
on conflict do nothing;

-- ---------- Settings ----------
insert into settings (key, value) values
  ('vat_rate', '0.05'::jsonb),
  ('stock_reservation_hours', '12'::jsonb),
  ('default_emirate_free_delivery', '"Dubai"'::jsonb)
on conflict (key) do nothing;

-- ---------- Prompts (defaults; owner edits these in the UI, §28) ----------
-- The app falls back to code defaults if a key is missing, so seeding is optional
-- but recommended so the owner sees them in the Prompt Management screen.
insert into prompts (key, title, body) values
  ('master_agent', 'Master Agent', 'See src/lib/ai/prompts.ts default — edit here to override.'),
  ('arabic_reply_style', 'Arabic Reply Style', 'Warm, polite, UAE social-commerce, short, light 🤍.'),
  ('english_reply_style', 'English Reply Style', 'Simple, warm, direct, professional, short.'),
  ('product_recognition', 'Product Recognition', 'Identify product/colour/packaging/photo class; never profile people.'),
  ('price_guard', 'Price Guard', 'Verify active offer; show price+delivery+VAT+total.'),
  ('delivery_guard', 'Delivery Guard', 'Outside Dubai: confirm courier first; use expected delivery wording.'),
  ('payment_guard', 'Payment Guard', 'No payment confirmation = no dispatch; reserve stock 12h.'),
  ('complaint_escalation', 'Complaint Escalation', 'Empathise, no liability, request photos, escalate to owner.'),
  ('supplier_screening', 'Supplier Screening', 'Catalogue, MOQ, sample, video, material, shipping, damage policy.'),
  ('daily_review', 'Daily Review', 'Generate end-of-day operating review and next-day plan.')
on conflict (key) do nothing;

-- ---------- §30 Test-scenario customers + conversations ----------
with c1 as (
  insert into customers (name_display, name_arabic_verified, name_confidence, platform, language, segment)
  values ('Rehab Ismail Fawzy', 'رحاب', 0.9, 'instagram', 'ar', 'customization_buyer') returning id
)
insert into conversations (customer_id, platform, message_text, message_language, intent, stage, lead_temperature, persona, risk_level)
select id, 'instagram', 'السلام عليكم، أبغى تصميم خاص اسم بالعربي على سلسلة', 'ar', 'customization request', 'warm_lead', 'warm', 'customization_buyer', 'low' from c1;

with c2 as (
  insert into customers (name_display, platform, language, segment)
  values ('Kay', 'whatsapp', 'en', 'hot_lead') returning id
)
insert into conversations (customer_id, platform, message_text, message_language, intent, stage, lead_temperature, persona, risk_level)
select id, 'whatsapp', 'I want 3 bracelets. My address is in Al Ain. Phone 0501234567', 'en', 'ready to order', 'hot_lead', 'hot', 'hot_lead', 'medium' from c2;

with c3 as (
  insert into customers (name_display, platform, language) values ('Norhan', 'instagram', 'en') returning id
)
insert into conversations (customer_id, platform, message_text, message_language, intent, stage, lead_temperature, persona, risk_level)
select id, 'instagram', 'How much?', 'en', 'price inquiry', 'price_lead', 'warm', 'price_sensitive_buyer', 'low' from c3;

with c8 as (
  insert into customers (name_display, platform, language) values ('Mariam', 'whatsapp', 'en') returning id
)
insert into conversations (customer_id, platform, message_text, message_language, intent, stage, lead_temperature, persona, risk_level)
select id, 'whatsapp', '[payment screenshot attached — blurry]', 'en', 'payment proof', 'payment_stage', 'hot', 'hot_lead', 'high' from c8;

with c7 as (
  insert into customers (name_display, platform, language, segment) values ('GoldenAccessories Trading', 'instagram', 'en', 'supplier') returning id
)
insert into conversations (customer_id, platform, message_text, message_language, intent, stage, lead_temperature, persona, risk_level)
select id, 'instagram', 'Wholesale offer for bracelets, great prices, pay today for best rate', 'en', 'supplier outreach', 'supplier_stage', 'cold', 'supplier_or_platform_lead', 'medium' from c7;
