-- Escalates any production/stock request still 'pending' (not yet accepted by a
-- Production Head) at noon IST - see POST /make-server-c2dd9b9d/send-acceptance-reminders
-- (supabase/functions/make-server-c2dd9b9d/index.ts) for the actual check/notify logic.
--
-- 12:00 PM IST -> 06:30 UTC (matches the UTC-offset convention used by the other
-- reminder cron jobs in 20260701000001_more_reminder_cron_jobs.sql).

select cron.schedule(
  'acceptance-escalation-reminders',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-acceptance-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove this job later: select cron.unschedule('acceptance-escalation-reminders');
-- To list active jobs: select * from cron.job;
