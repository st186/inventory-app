-- Auto-approves production data still 'pending' more than 24 hours after submission,
-- so a forgotten cluster head / operations manager approval never blocks stock
-- calculations indefinitely.
--
-- Runs hourly and is a no-op unless something has actually crossed the 24h mark (the
-- 24h check itself happens server-side in the route, not here) - see
-- POST /make-server-c2dd9b9d/production/auto-approve-stale
-- (supabase/functions/make-server-c2dd9b9d/index.ts) for the approval logic.
--
-- Uses the same CRON_SYNC_SECRET shared-secret pattern as the POS nightly sync cron.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'production-auto-approve-stale',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/production/auto-approve-stale',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', '2jP60YAvoR_LCPEerYh5py60wiC9ad-zGNmmeVfwQuE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove this job later: select cron.unschedule('production-auto-approve-stale');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'production-auto-approve-stale') order by start_time desc limit 20;
