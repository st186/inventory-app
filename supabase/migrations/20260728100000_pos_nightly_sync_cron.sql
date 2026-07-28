-- Nightly Ciferon POS auto-sync cron job.
--
-- Fetches that day's sales (cash/paytm/zomato/swiggy totals + item-wise stock
-- consumption) from Ciferon and writes it into the app automatically, replacing manual
-- entry of posOnlineSales/posOfflineSales and item-wise sales-sheet uploads. See
-- src/CIFERON_POS_API_DOCUMENTATION.md for the underlying APIs and
-- POST /make-server-c2dd9b9d/pos-sync (supabase/functions/make-server-c2dd9b9d/index.ts)
-- for the sync logic itself.
--
-- Time is in UTC. This project uses IST (UTC+5:30) throughout:
--   10:30 PM IST -> 17:00 UTC
--
-- Unlike the reminder-job routes this pos-sync route also requires a shared secret
-- (X-Cron-Secret, checked against the CRON_SYNC_SECRET edge function secret) since it
-- writes financial/stock data rather than just sending notifications.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'pos-nightly-sync',
  '0 17 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/pos-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', '2jP60YAvoR_LCPEerYh5py60wiC9ad-zGNmmeVfwQuE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove this job later: select cron.unschedule('pos-nightly-sync');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'pos-nightly-sync') order by start_time desc limit 20;
