-- Weekly clean-up (owner, 28 Oct 2026): rows nothing reads any more, so the free plan's database
-- and the nightly backups stay small. Sunday 4:30 AM IST (Saturday 23:00 UTC), clear of the Drive
-- backup (21:xx UTC) and the nightly jobs. Runs in the database itself: no edge function call.
-- 1. Scheduled-job run history older than 14 days (pg_cron never clears it: ~10,000 rows/month).
-- 2. Notification quick-action tokens used, or past their 7-day life (index.ts enforces both).
-- 3. Idempotency replies past expiresAt (idempotency.ts).
-- 4. "Reminder already sent today" markers older than 7 days (only today's is ever read).
-- 5. One-off fix backups (backup:*:{date}) older than 30 days.
-- Dates are compared as ISO strings so a malformed row can never stop the run.
select cron.schedule(
  'weekly-cleanup',
  '0 23 * * 6',
  $$
  delete from cron.job_run_details where end_time < now() - interval '14 days';
  delete from public.kv_store_c2dd9b9d where key like 'quick_action_token:%'
    and (value->>'used' = 'true' or value->>'createdAt' < to_char((now() - interval '7 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS'));
  delete from public.kv_store_c2dd9b9d where key like 'idem:%'
    and value->>'expiresAt' < to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS');
  delete from public.kv_store_c2dd9b9d where (key like 'attendance_reminder_sent:%' or key like 'fulfillment_reminder_sent:%')
    and substring(key from '(\d{4}-\d{2}-\d{2})$') < to_char(now() - interval '7 days', 'YYYY-MM-DD');
  delete from public.kv_store_c2dd9b9d where key like 'backup:%'
    and substring(key from '(\d{4}-\d{2}-\d{2})[a-z]?$') < to_char(now() - interval '30 days', 'YYYY-MM-DD');
  $$
);
