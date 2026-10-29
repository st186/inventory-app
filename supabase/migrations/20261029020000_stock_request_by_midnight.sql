-- Stock request by midnight (owner, 29 Oct 2026): "stock request for next day should be sent by
-- midnight ... notify as critical for rohan to send stock request".
-- send-stock-request-reminders (index.ts), times in IST:
--   9:30 PM  ?slot=first   urgent to the store incharge if tomorrow's request isn't sent
--   11:15 PM ?slot=last    urgent again, "45 minutes left"
--   12:05 AM ?slot=missed  the owner and operations managers, for the day that has just begun
-- Job 1 was the old 3 PM reminder (it never reached anyone); it becomes the 9:30 PM one. The other
-- two copy its command (headers and keys) with their own slot.

select cron.alter_job(
  1,
  schedule := '0 16 * * *',
  command := replace((select command from cron.job where jobid = 1), 'send-stock-request-reminders''', 'send-stock-request-reminders?slot=first''')
);

select cron.schedule(
  'stock-request-reminders-last',
  '45 17 * * *',
  replace((select command from cron.job where jobid = 1), 'send-stock-request-reminders?slot=first''', 'send-stock-request-reminders?slot=last''')
);

select cron.schedule(
  'stock-request-missed',
  '35 18 * * *',
  replace((select command from cron.job where jobid = 1), 'send-stock-request-reminders?slot=first''', 'send-stock-request-reminders?slot=missed''')
);
