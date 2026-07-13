-- Defense-in-depth: enable Row Level Security on kv_store_c2dd9b9d.
--
-- The edge function (supabase/functions/make-server-c2dd9b9d) always accesses this
-- table using the SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely, so this
-- migration does not change how the application behaves today. Its purpose is to
-- ensure that if the anon or authenticated Postgres roles were ever (accidentally
-- or via a future bug) used to query this table directly -- e.g. through
-- PostgREST/the Supabase client using the anon/publishable key -- no rows would be
-- readable or writable, since RLS defaults to deny-all when enabled with no
-- permissive policies defined for those roles.
alter table if exists public.kv_store_c2dd9b9d enable row level security;

-- No policies are created for the anon/authenticated roles: with RLS enabled and
-- zero policies, all access via those roles is denied by default. The
-- service_role Postgres role used by the edge function bypasses RLS entirely and
-- is unaffected by this change.
