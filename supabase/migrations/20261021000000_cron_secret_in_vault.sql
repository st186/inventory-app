-- The shared secret that protects the cron-only edge function routes (X-Cron-Secret header) used to be
-- written into each cron job's command - and so into these migration files in a public repo. It is
-- rotated, and now lives only in Supabase Vault (secret name: cron_sync_secret) and as the function
-- secret CRON_SYNC_SECRET; the cron jobs read it from the vault each time they run.
--
-- To set up a fresh environment (do NOT commit the value):
--   select vault.create_secret('<the same value as the CRON_SYNC_SECRET function secret>', 'cron_sync_secret');
--
-- This statement rewrites any cron job that still has a literal secret in its command to read the vault
-- instead. It is safe to run repeatedly (jobs already using the vault are left alone).
do $$
declare
  r record;
  newcmd text;
begin
  for r in
    select jobid, command from cron.job
    where command like '%X-Cron-Secret%' and command not like '%vault.decrypted_secrets%'
  loop
    newcmd := regexp_replace(
      r.command,
      '''X-Cron-Secret'',\s*''[^'']*''',
      '''X-Cron-Secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''cron_sync_secret'' limit 1)'
    );
    perform cron.alter_job(r.jobid, command := newcmd);
  end loop;
end $$;
