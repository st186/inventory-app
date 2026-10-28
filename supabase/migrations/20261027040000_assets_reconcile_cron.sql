-- Nightly equipment register check (11:45 PM IST = 18:15 UTC) - see POST
-- /make-server-c2dd9b9d/cron/assets-reconcile in supabase/functions/make-server-c2dd9b9d/assets.ts.
-- Adds equipment bought that day (steamers, bins, pans, racks...) to Equipment & assets as
-- "needs review", follows edits to expenses not yet confirmed, and flags confirmed items whose
-- expense was changed or deleted. Opening the list in the app also runs it (at most every 5
-- minutes); this catches the days nobody opens it. No AI, no cost. Same CRON_SYNC_SECRET pattern
-- as the other cron-gated routes.
select cron.schedule(
  'nightly-assets-reconcile',
  '15 18 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/assets-reconcile',
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
-- To remove: select cron.unschedule('nightly-assets-reconcile');
