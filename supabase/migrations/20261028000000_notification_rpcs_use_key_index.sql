-- Notification read-state helpers, rewritten to use the key index (speed work, 28 Oct 2026).
--
-- The 20261017000000 versions match `key like 'notification:' || p_user || ':%'`. A pattern
-- built at run time can't be turned into an index range, so every call scanned the whole
-- kv table (23k rows, ~21 ms). The range below uses the remaining `key text_pattern_ops`
-- btree (kv_store_c2dd9b9d_key_idx210), also as a generic plan: measured 3.8 ms for a user
-- with 2,300 notifications and 8.7 ms for the owner's 6,700 (EXPLAIN ANALYZE, 28 Oct 2026).
-- The count runs on every notification poll (~1,200 a day); "mark all read" took ~9 s.
--
-- ~>=~ / ~<~ are the byte-wise (text_pattern_ops) comparisons, the same ones Postgres derives
-- from a constant LIKE prefix, so this matches exactly the keys starting with
-- 'notification:<user>:' (';' is the character after ':'), whatever the database collation.
-- Behaviour and results are unchanged. Safe to apply at any time; no data is changed.

create or replace function public.notification_unread_count(p_user text)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.kv_store_c2dd9b9d
  where key operator(pg_catalog.~>=~) ('notification:' || p_user || ':')
    and key operator(pg_catalog.~<~) ('notification:' || p_user || ';')
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
  where key operator(pg_catalog.~>=~) ('notification:' || p_user || ':')
    and key operator(pg_catalog.~<~) ('notification:' || p_user || ';')
    and coalesce(value->>'read', 'false') <> 'true';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.notification_unread_count(text) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read(text) from public, anon, authenticated;
grant execute on function public.notification_unread_count(text) to service_role;
grant execute on function public.mark_all_notifications_read(text) to service_role;
