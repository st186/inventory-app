-- Weekly reminder (Sundays 9:30 PM IST = 16:00 UTC) to count the real Paytm/bank balance
-- and recalibrate - see POST /make-server-c2dd9b9d/cron/weekly-paytm-recalibration-reminder
-- in supabase/functions/make-server-c2dd9b9d/index.ts. Skipped automatically if a
-- recalibration happened within the last 6 days. Same CRON_SYNC_SECRET pattern as the
-- other cron-gated routes.
select cron.schedule(
  'weekly-paytm-recalibration-reminder',
  '0 16 * * 0',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/weekly-paytm-recalibration-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', '2jP60YAvoR_LCPEerYh5py60wiC9ad-zGNmmeVfwQuE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
-- To remove: select cron.unschedule('weekly-paytm-recalibration-reminder');
