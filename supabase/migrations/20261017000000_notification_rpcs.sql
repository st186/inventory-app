-- Notification read-state helpers. The edge function used to download a user's whole
-- notification history (thousands of rows, paged without a stable order) just to count
-- unread ones or flip them to read; that dropped/duplicated rows across pages, so "Mark all
-- read" never fully stuck. These do the work in the database in one statement.

create or replace function public.notification_unread_count(p_user text)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.kv_store_c2dd9b9d
  where key like 'notification:' || p_user || ':%'
    and coalesce(value->>'read', 'false') <> 'true';
$$;

create or replace function public.mark_all_notifications_read(p_user text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.kv_store_c2dd9b9d
  set value = jsonb_set(value, '{read}', 'true'::jsonb, true)
  where key like 'notification:' || p_user || ':%'
    and coalesce(value->>'read', 'false') <> 'true';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.notification_unread_count(text) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read(text) from public, anon, authenticated;
grant execute on function public.notification_unread_count(text) to service_role;
grant execute on function public.mark_all_notifications_read(text) to service_role;
