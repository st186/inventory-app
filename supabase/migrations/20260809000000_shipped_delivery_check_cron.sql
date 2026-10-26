-- Every 15 minutes, check for production requests that crossed the 1-hour-since-shipped
-- mark and haven't had a delivery check sent yet (see send-shipped-delivery-check in
-- index.ts). This has to run frequently since the trigger is "1 hour after shipment",
-- a per-record relative time, not a fixed clock time like the other reminder crons.

select cron.schedule(
  'shipped-delivery-check',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/send-shipped-delivery-check',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To remove: select cron.unschedule('shipped-delivery-check');
-- To list active jobs: select * from cron.job;
