-- Server-side cron jobs for reminder notifications.
--
-- Previously, both reminders relied on a browser tab being open at the right
-- time (StockRequestReminderScheduler.tsx / AttendanceReminderScheduler.tsx),
-- which is unreliable if nobody happens to have the app open. This moves the
-- trigger to Postgres itself via pg_cron + pg_net, so it fires regardless of
-- whether anyone has the app open.
--
-- Times are in UTC. This project uses IST (UTC+5:30) throughout:
--   3:00 PM IST  -> 09:30 UTC  (stock request reminders)
--   11:59 AM IST -> 06:29 UTC  (attendance reminders)

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'stock-request-reminders',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-stock-request-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'attendance-reminders',
  '29 6 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-attendance-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove a job later: select cron.unschedule('stock-request-reminders');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details order by start_time desc limit 20;
