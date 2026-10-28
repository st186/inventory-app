-- Store cover reminders - see POST /make-server-c2dd9b9d/cron/store-cover-reminders in
-- supabase/functions/make-server-c2dd9b9d/storeCover.ts. Every 30 minutes: the morning reminder
-- (from 7 AM IST) to the person covering the store and the store's incharge, and the 4:15 PM
-- "leave for the store" nudge. Each is sent once a day. Same CRON_SYNC_SECRET-from-Vault pattern.
select cron.schedule(
  'store-cover-reminders',
  '5,35 * * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/store-cover-reminders',
    headers := jsonb_build_object(
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
-- To remove: select cron.unschedule('store-cover-reminders');
