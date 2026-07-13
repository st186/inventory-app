-- Secures the reminder cron jobs introduced in 20260701000000_reminder_cron_jobs.sql
-- and 20260701000001_more_reminder_cron_jobs.sql.
--
-- Those jobs previously called the send-*-reminders edge function endpoints using the
-- public anon key as the Authorization header. Because those endpoints had no
-- authentication of their own, this meant anyone who knew the endpoint URL could
-- trigger them directly using the (publicly known) anon key.
--
-- The endpoints now require either:
--   - an authenticated manager/cluster_head user, or
--   - a request carrying an `X-Cron-Secret` header that matches the CRON_SECRET
--     secret configured on the edge function (via `supabase secrets set CRON_SECRET=...`).
--
-- This migration reschedules the jobs to send that header instead of relying on the
-- anon key. The secret value is read from the `app.cron_secret` database setting at
-- job-run time (never hardcoded in this file), so it can be rotated independently of
-- migrations. Before this migration's jobs will work, set the same secret value on
-- both sides, e.g.:
--   alter database postgres set app.cron_secret = '<a-long-random-value>';
--   supabase secrets set CRON_SECRET='<the-same-long-random-value>'
-- Until `app.cron_secret` is configured, these jobs will fail with an empty/missing
-- header rather than silently falling back to an unauthenticated call.

select cron.unschedule('stock-request-reminders');
select cron.unschedule('attendance-reminders');
select cron.unschedule('fulfillment-reminders');
select cron.unschedule('data-entry-reminders');

select cron.schedule(
  'stock-request-reminders',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-stock-request-reminders',
    headers := jsonb_build_object(
      'X-Cron-Secret', current_setting('app.cron_secret', true),
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
      'X-Cron-Secret', current_setting('app.cron_secret', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fulfillment-reminders',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-fulfillment-reminders',
    headers := jsonb_build_object(
      'X-Cron-Secret', current_setting('app.cron_secret', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'data-entry-reminders',
  '30 14 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-data-entry-reminders',
    headers := jsonb_build_object(
      'X-Cron-Secret', current_setting('app.cron_secret', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove a job later: select cron.unschedule('<job-name>');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details order by start_time desc limit 20;
