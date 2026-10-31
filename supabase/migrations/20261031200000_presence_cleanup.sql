-- Weekly clean-up gains one rule (owner, 31 Oct 2026): the phone's "at work / stepped out"
-- stretches (presence:{employeeId}:{date}, attendance /shift/presence) are kept 60 days - long
-- enough to look back at a month's kitchen camera absences, no longer. Same job, same time; the
-- rest is 20261028030000_weekly_cleanup_cron.sql unchanged (cron.schedule replaces by name).
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
  delete from public.kv_store_c2dd9b9d where key like 'presence:%'
    and substring(key from '(\d{4}-\d{2}-\d{2})$') < to_char(now() - interval '60 days', 'YYYY-MM-DD');
  $$
);
