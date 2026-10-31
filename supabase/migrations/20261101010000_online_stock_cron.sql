-- Items switched off on Zomato and Swiggy (owner, 1 Nov 2026: "can we detect this on a regular
-- basis"; index.ts, onlineStock.ts). POST /cron/online-stock at 4 PM IST (10:30 UTC), an hour after
-- opening: items off online that still sell -> the store incharge and the owner. It copies job 35's
-- command (stock-count-reminders: headers and keys) with its own route.

select cron.schedule(
  'online-stock',
  '30 10 * * *',
  replace((select command from cron.job where jobname = 'stock-count-reminders'), 'send-stock-count-reminders''', 'cron/online-stock''')
);
