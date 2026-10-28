-- Notifications brought up to date (notificationRules.ts, index.ts):
-- 1. 7 AM and 9 PM IST (01:30 and 15:30 UTC): POST /cron/notification-digest - one buzz for what
--    quiet hours held overnight (morning), and the day's updates for people on the digest (evening).
-- 2. Every 15 minutes: POST /cron/notification-escalations - an urgent notification nobody has opened
--    for 30 minutes goes to the owner too, once.
-- Same CRON_SYNC_SECRET-from-Vault pattern as the other cron-gated routes.
select cron.schedule(
  'notification-digest',
  '30 1,15 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/notification-digest',
    headers := jsonb_build_object('X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1), 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
select cron.schedule(
  'notification-escalations',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/notification-escalations',
    headers := jsonb_build_object('X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1), 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
-- To remove: select cron.unschedule('notification-digest'); select cron.unschedule('notification-escalations');
