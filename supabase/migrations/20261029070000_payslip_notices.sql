-- Payslips and monthly performance notes (owner, 29 Oct 2026): every morning at 10:30 AM IST (05:00
-- UTC) send-payslip-notices (performance.ts) tells each person once last month's payslip is ready
-- (its salary paid), and on the 1st and the 4th reminds managers and the owner to write last
-- month's performance notes. Copies job 1's command (headers and keys).

select cron.schedule(
  'payslip-notices',
  '0 5 * * *',
  replace((select command from cron.job where jobid = 1), 'send-stock-request-reminders?slot=first''', 'send-payslip-notices''')
);
