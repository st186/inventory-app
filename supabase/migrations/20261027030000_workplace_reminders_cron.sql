-- Workplace checks - see supabase/functions/make-server-c2dd9b9d/workplace.ts.
--
-- 1. Every 15 minutes: POST /make-server-c2dd9b9d/cron/workplace-reminders keeps today's
--    workplace-check rows current, pushes each person when their photo window opens ("Workplace
--    photos due by 4 PM") and, once a day per person, tells the place's incharge and the owner when
--    a window closed without photos. What was sent is remembered in KV (workplace-sent:{date}).
-- 2. Daily at 3:30 AM IST (22:00 UTC): POST /make-server-c2dd9b9d/cron/workplace-cleanup removes
--    photos older than 60 days from the private workplace-photos bucket (the fallback used until
--    Google Drive is set up - Drive photos are kept). The KV day rows stay.
-- Same CRON_SYNC_SECRET pattern as the other cron-gated routes.
select cron.schedule(
  'workplace-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/workplace-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'workplace-photo-cleanup',
  '0 22 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/workplace-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
-- To remove: select cron.unschedule('workplace-reminders'); select cron.unschedule('workplace-photo-cleanup');
