-- The nightly Google Drive backup includes the database overhaul's tables (owner, 29 Oct 2026:
-- "include new tables [in the] Google Drive backup"). Schema ledger stays private (not exposed to
-- the API); this function hands the backup (backup.ts, service role) one page of one table at a
-- time: [{k: sort key, r: row}], ordered by the table's own unique key, rows after p_after.
-- Read-only; anon and authenticated can't run it.

create or replace function public.ledger_backup_page(p_table text, p_after text, p_limit int)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  key_expr text;
  result jsonb;
begin
  if p_table not in (
    'sales_days', 'online_sales_days', 'purchases', 'running_costs', 'fixed_costs', 'payouts',
    'stock_requests', 'stock_request_lines', 'cash_topups', 'notifications', 'mirror_checks', 'mirror_issues'
  ) then
    raise exception 'unknown table %', p_table;
  end if;
  key_expr := case p_table
    when 'stock_request_lines' then 'x.kv_key || chr(1) || x.kind || chr(1) || x.item'
    when 'mirror_checks' then 'lpad(x.id::text, 20, ''0'')'
    when 'mirror_issues' then 'lpad(x.id::text, 20, ''0'')'
    else 'x.kv_key'
  end;
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''k'', k, ''r'', r) order by k), ''[]''::jsonb)
       from (select %1$s as k, to_jsonb(x) as r from ledger.%2$I x
              where %1$s > coalesce($1, '''') order by 1 limit $2) page',
    key_expr, p_table)
  into result
  using p_after, least(greatest(coalesce(p_limit, 500), 1), 2000);
  return result;
end;
$$;

revoke all on function public.ledger_backup_page(text, text, int) from public, anon, authenticated;
grant execute on function public.ledger_backup_page(text, text, int) to service_role;
