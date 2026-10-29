-- Month-end stock count (owner, 29 Oct 2026): "we have a stock count due on 31st October ... push
-- this notification as urgent to store incharge ... repeated notifications starting from previous
-- day 6pm, max 5 notifications. Do this every month."
-- send-stock-count-reminders (index.ts) runs every day at 12, 4, 6, 8 and 9 PM IST (06:30, 10:30,
-- 12:30, 14:30, 15:30 UTC) and acts only on the day before the month's last day (6 PM, 9 PM) and
-- the last day (12 PM, 4 PM, 8 PM), until the store's count is in. It copies job 1's command
-- (the stock request reminder: headers and keys) with its own route.

select cron.schedule(
  'stock-count-reminders',
  '30 6,10,12,14,15 * * *',
  replace((select command from cron.job where jobid = 1), 'send-stock-request-reminders?slot=first''', 'send-stock-count-reminders''')
);
