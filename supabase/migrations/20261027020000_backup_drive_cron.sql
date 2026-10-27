-- Nightly encrypted backup to Google Drive, from 02:30 IST (21:00 UTC) - see POST
-- /make-server-c2dd9b9d/cron/backup-drive in supabase/functions/make-server-c2dd9b9d/backup.ts.
-- The 21:00 UTC call starts the backup. Each call stops well inside the edge function's 2 s CPU
-- limit, so a backup too big for one call is carried on by the calls every 5 minutes after it
-- (up to 03:25 IST); once tonight's backup is done (or has failed and notified the owner) those
-- calls return straight away. Needs the BACKUP_PASSPHRASE and GDRIVE_* secrets
-- (docs/backup-google-drive-setup.md). Same CRON_SYNC_SECRET-from-Vault pattern as the other
-- cron-gated routes.
select cron.schedule(
  'nightly-backup-drive',
  '*/5 21 * * *',
  $$
  select net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/cron/backup-drive',
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
-- To remove: select cron.unschedule('nightly-backup-drive');
