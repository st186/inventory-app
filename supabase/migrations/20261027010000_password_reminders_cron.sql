-- Daily password-expiry reminders (10:00 IST = 04:30 UTC) - see POST
-- /make-server-c2dd9b9d/cron/password-reminders in supabase/functions/make-server-c2dd9b9d/passwords.ts.
-- Passwords last 90 days; everyone with a staff record gets a push + in-app notification at 7, 3
-- and 1 days left (each count once per password, so a repeat run sends nothing new). After expiry
-- the app itself blocks until a new password is set. Same CRON_SYNC_SECRET pattern as the other
-- cron-gated routes.
select cron.schedule(
  'daily-password-reminders',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/password-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
-- To remove: select cron.unschedule('daily-password-reminders');
