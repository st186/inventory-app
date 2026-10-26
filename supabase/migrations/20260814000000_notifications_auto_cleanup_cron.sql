-- Nightly cleanup of old, already-read notifications for all users - see
-- POST /make-server-c2dd9b9d/notifications/auto-cleanup (supabase/functions/make-server-c2dd9b9d/index.ts)
-- for the actual delete logic. Never touches unread notifications.
--
-- Uses the same CRON_SYNC_SECRET shared-secret pattern as the other cron-gated routes.
--
-- 4:00 AM IST -> 22:30 UTC (previous day), a quiet hour matching the other nightly
-- cron jobs' UTC-offset convention.

select cron.schedule(
  'notifications-auto-cleanup',
  '30 22 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/notifications/auto-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('notifications-auto-cleanup');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'notifications-auto-cleanup') order by start_time desc limit 20;
