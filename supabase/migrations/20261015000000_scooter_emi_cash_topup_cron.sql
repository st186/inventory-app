-- Auto-raises a ₹5,543 cash top-up request (reason: store_inventory, in Aniket Prasad's
-- name, for Bunny Momos 1) on the 1st of every month, for the scooter EMI that auto-debits
-- from the bank on the 5th. Still goes through the normal cluster-head approval - see
-- POST /make-server-c2dd9b9d/cron/scooter-emi-cash-topup
-- (supabase/functions/make-server-c2dd9b9d/index.ts) for the actual creation logic, and
-- SCOOTER_EMI_AMOUNT there if the EMI amount ever changes or the loan is paid off.
--
-- Uses the same CRON_SYNC_SECRET shared-secret pattern as the other cron-gated routes.
--
-- Starts next month (November) per the downpayment being logged today (Oct 15); the first
-- EMI itself isn't due until Nov 5. 6:00 AM IST -> 00:30 UTC, a quiet hour matching the
-- other monthly/nightly cron jobs' UTC-offset convention.

select cron.schedule(
  'scooter-emi-cash-topup',
  '30 0 1 * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/scooter-emi-cash-topup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', '2jP60YAvoR_LCPEerYh5py60wiC9ad-zGNmmeVfwQuE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove this job later (e.g. once the loan is paid off):
--   select cron.unschedule('scooter-emi-cash-topup');
-- To list active jobs: select * from cron.job;
-- To see run history: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'scooter-emi-cash-topup') order by start_time desc limit 20;
