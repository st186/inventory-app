-- Append-only audit log for security-sensitive privileged actions (account
-- creation/deletion, role changes, 2FA disablement, etc.).
--
-- Rows are written exclusively by the edge function using the service role key
-- (see supabase/functions/make-server-c2dd9b9d/audit.tsx). RLS is enabled with no
-- INSERT/UPDATE/DELETE policies for anon/authenticated roles, so the log cannot be
-- tampered with or deleted from those roles; only a SELECT policy is provided so
-- that authenticated cluster_head/manager/audit users can review the log directly
-- via the Supabase client if desired in the future.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action);

alter table public.audit_log enable row level security;

-- Allow authenticated users whose JWT role metadata is manager/cluster_head/audit
-- to read the audit log. Writes are only ever performed via the service role key
-- from the edge function, so no INSERT/UPDATE/DELETE policies are defined here --
-- meaning those operations are denied by default for anon/authenticated roles.
create policy "audit_log_select_privileged_roles"
  on public.audit_log
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') in ('manager', 'cluster_head', 'audit')
  );
