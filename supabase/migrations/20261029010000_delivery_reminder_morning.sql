-- Deliveries to receive or confirm (owner, 29 Oct 2026): the store incharge's reminder also goes out
-- at 9:30 AM IST (04:00 UTC), with ?slot=am so the route skips the evening production-log reminders
-- and counts only orders sent before today. Same command as the 10 PM job (delivery-confirmation-
-- reminders, 16:30 UTC) with the slot added, copied so no key is written here.
select cron.schedule(
  'delivery-confirmation-reminders-am',
  '0 4 * * *',
  (select replace(command, '/send-delivery-confirmation-reminders''', '/send-delivery-confirmation-reminders?slot=am''')
     from cron.job where jobname = 'delivery-confirmation-reminders')
);
