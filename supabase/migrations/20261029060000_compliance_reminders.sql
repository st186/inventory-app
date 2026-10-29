-- Compliance calendar (owner, 29 Oct 2026): every morning at 10 AM IST (04:30 UTC) the owner and
-- operations managers hear about anything due in 30, 7 or 1 days, due today, or overdue (weekly)
-- - send-compliance-reminders in compliance.ts. Copies job 1's command (headers and keys).

select cron.schedule(
  'compliance-reminders',
  '30 4 * * *',
  replace((select command from cron.job where jobid = 1), 'send-stock-request-reminders?slot=first''', 'send-compliance-reminders''')
);
