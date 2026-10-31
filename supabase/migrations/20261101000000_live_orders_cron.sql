-- Live orders from Ciferon (owner, 31 Oct 2026: "Build 1, 2 and 3"; index.ts, liveOrders.ts).
--   live-orders: every 3 minutes, 9:00-18:57 UTC (2:30 PM-12:27 AM IST); the route itself only looks
--     between 3 PM and 11:45 PM IST and returns at once otherwise. Stuck orders -> the store incharge.
--   live-orders-close: 11:45 PM IST (18:15 UTC), before Ciferon closes the day at 11:50 PM: every
--     order seen open today against the day's bills -> the owner when any never became a bill.
-- Both copy job 35's command (stock-count-reminders: headers and keys) with their own route.

select cron.schedule(
  'live-orders',
  '*/3 9-18 * * *',
  replace((select command from cron.job where jobname = 'stock-count-reminders'), 'send-stock-count-reminders''', 'cron/live-orders''')
);

select cron.schedule(
  'live-orders-close',
  '15 18 * * *',
  replace((select command from cron.job where jobname = 'stock-count-reminders'), 'send-stock-count-reminders''', 'cron/live-orders-close''')
);
