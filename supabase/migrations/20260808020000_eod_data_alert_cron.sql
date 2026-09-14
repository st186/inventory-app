-- End-of-day high alert for store/production incharges who haven't logged today's
-- sales/production data - see POST /make-server-c2dd9b9d/send-eod-data-alerts
-- (supabase/functions/make-server-c2dd9b9d/index.ts) for the actual check/notify logic.
--
-- 11:30 PM IST -> 18:00 UTC (matches the UTC-offset convention used by the other
-- reminder cron jobs in 20260701000001_more_reminder_cron_jobs.sql).

select cron.schedule(
  'eod-data-alerts',
  '0 18 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-eod-data-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('eod-data-alerts');
-- To list active jobs: select * from cron.job;
