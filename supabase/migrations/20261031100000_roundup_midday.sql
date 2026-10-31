-- Bunny's roundup at 1 PM IST as well as 9 PM (owner, 31 Oct 2026): the notification digest job
-- (POST /cron/notification-digest, 20261028020000_notification_jobs_cron.sql) runs at 7 AM, 1 PM
-- and 9 PM IST - 01:30, 07:30 and 15:30 UTC.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'notification-digest'),
  schedule := '30 1,7,15 * * *'
);
