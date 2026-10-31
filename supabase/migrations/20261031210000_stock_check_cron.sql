-- Daily stock check (owner, 31 Oct 2026: "keep a daily check on item sales and stock left logic
-- for production and store and validate if logic is correct or not and then on 30th nov we will
-- check again how it spanned out"). POST /cron/stock-check (index.ts, stockCheck.ts) every night at
-- 11:40 PM IST (18:10 UTC), after the POS syncs at 10:30 and 11 PM: saves stock-check:{date}. It
-- copies job 35's command (stock-count-reminders: headers and keys) with its own route.

select cron.schedule(
  'stock-check',
  '10 18 * * *',
  replace((select command from cron.job where jobname = 'stock-count-reminders'), 'send-stock-count-reminders''', 'cron/stock-check''')
);
