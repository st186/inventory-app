-- Weekly festival-day draft (Mondays 6 AM IST = 00:30 UTC) - see POST
-- /make-server-c2dd9b9d/cron/calendar-draft in supabase/functions/make-server-c2dd9b9d/insights.ts.
-- Claude (Haiku, up to 3 web searches) checks the next 60 days for festivals; new days wait in the
-- app for the owner side to add or skip, and the cluster heads get a notification. Skipped if someone
-- drafted in the last 5 days. About Rs 3 a run, counted in the monthly AI limit. Same
-- CRON_SYNC_SECRET pattern as the other cron-gated routes.
select cron.schedule(
  'weekly-calendar-draft',
  '30 0 * * 1',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/calendar-draft',
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
-- To remove: select cron.unschedule('weekly-calendar-draft');
