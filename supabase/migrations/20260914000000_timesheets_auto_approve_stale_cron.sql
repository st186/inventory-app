-- Auto-approves timesheets still 'pending' more than 5 days after submission, so a
-- forgotten manager approval never leaves an employee's attendance record stuck
-- indefinitely.
--
-- Runs once a day and is a no-op unless something has actually crossed the 5-day mark
-- (the 5-day check itself happens server-side in the route, not here) - see
-- POST /make-server-c2dd9b9d/timesheets/auto-approve-stale
-- (supabase/functions/make-server-c2dd9b9d/index.ts) for the approval logic.
--
-- Uses the same CRON_SYNC_SECRET shared-secret pattern as the other cron-gated routes.
--
-- 5:00 AM IST -> 23:30 UTC (previous day), a quiet hour matching the other nightly
-- cron jobs' UTC-offset convention.

select cron.schedule(
  'timesheets-auto-approve-stale',
  '30 23 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/timesheets/auto-approve-stale',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove this job later: select cron.unschedule('timesheets-auto-approve-stale');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'timesheets-auto-approve-stale') order by start_time desc limit 20;
