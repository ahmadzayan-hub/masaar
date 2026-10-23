set role authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM apply_confirmation_reply('TOK-SYN','EVENT-SYN','confirm','+971500000001','{}'::jsonb);
  RAISE EXCEPTION 'FAIL: authenticated execute permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM 1 FROM confirmation_reply_receipts;
  RAISE EXCEPTION 'FAIL: authenticated receipt read permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
reset role;

