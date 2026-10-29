-- Database overhaul, phase 1 (money), steps 1-3 (owner, 28 Oct 2026). Plan:
-- Bunny Momos Docs/4 App/Design/Database-Overhaul-Plan.html
--
-- The whole business lives in one key-value table (kv_store_c2dd9b9d). This phase gives the money
-- records proper tables, WITHOUT changing the key-value table or the server:
--   0. A full copy of the key-value table in the private schema "backups".
--   1. Tables in the private schema "ledger" (not reachable with the app's public key): sales days,
--      online sales, purchases, running costs, fixed costs, payouts. Each keeps the original record
--      word for word in `data`, so nothing is lost.
--   2. Every existing money record copied in.
--   3. "Write to both": a trigger on the key-value table copies each money write or delete into its
--      table in the same transaction. If a copy fails it is written to ledger.mirror_issues and the
--      key-value write still goes through (the app can't be broken by this).
--   + A daily comparison (ledger.check_mirror(), pg_cron "ledger-mirror-check") of every record and
--     total, kept in ledger.mirror_checks.
-- To undo everything: drop the two triggers, then the "ledger" schema. The key-value table is untouched.

-- 0. Backup
create schema if not exists backups;
revoke all on schema backups from public, anon, authenticated;
create table backups.kv_store_2026_10_28 as table public.kv_store_c2dd9b9d;
revoke all on backups.kv_store_2026_10_28 from public, anon, authenticated;

-- 1. Tables
create schema if not exists ledger;
revoke all on schema ledger from public, anon, authenticated;

-- Safe readers: a value that isn't a number or a date becomes null instead of an error.
create or replace function ledger.num(x jsonb) returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if x is null or jsonb_typeof(x) not in ('number', 'string') then return null; end if;
  return trim(x #>> '{}')::numeric;
exception when others then return null;
end $$;
create or replace function ledger.day(x jsonb) returns date language plpgsql immutable set search_path = '' as $$
begin
  if x is null or (x #>> '{}') !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(x #>> '{}', 10)::date;
exception when others then return null;
end $$;
create or replace function ledger.ts(x jsonb) returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if x is null or jsonb_typeof(x) <> 'string' or (x #>> '{}') = '' then return null; end if;
  return (x #>> '{}')::timestamptz;
exception when others then return null;
end $$;

create table ledger.sales_days (
  kv_key text primary key, id text, store_id text, sales_date date,
  cash_amount numeric, paytm_amount numeric, offline_sales numeric, online_sales numeric,
  pos_offline_sales numeric, pos_online_sales numeric, online_commission numeric,
  sales_discrepancy numeric, actual_cash_in_hand numeric, cash_over_short numeric,
  approval_status text, approved_by text, approved_at timestamptz, created_by text, synced_at timestamptz,
  data jsonb not null, mirrored_at timestamptz not null default now(),
  unique (store_id, sales_date)
);
create table ledger.online_sales_days (
  kv_key text primary key, id text, store_id text, sales_date date, zomato numeric, swiggy numeric,
  created_at timestamptz, data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.online_sales_days (store_id, sales_date);
create table ledger.purchases (
  kv_key text primary key, id text, purchase_date date, item_name text, category text,
  quantity numeric, unit text, cost_per_unit numeric, total_cost numeric,
  payment_method text, cash_amount numeric, online_amount numeric,
  entity_type text, store_id text, production_house_id text, paid_from_production_house_id text,
  created_by text, created_by_name text, user_id text,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.purchases (purchase_date);
create index on ledger.purchases (id);
create table ledger.running_costs (
  kv_key text primary key, id text, cost_date date, category text, description text, amount numeric,
  payment_method text, cash_amount numeric, online_amount numeric,
  entity_type text, store_id text, production_house_id text, employee_id text, user_id text,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.running_costs (cost_date);
create table ledger.fixed_costs (
  kv_key text primary key, id text, cost_date date, for_month text, category text, description text, amount numeric,
  payment_method text, cash_amount numeric, online_amount numeric,
  entity_type text, store_id text, production_house_id text, units numeric, unit_price numeric, user_id text,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create table ledger.payouts (
  kv_key text primary key, id text, payout_date date, employee_id text, employee_name text,
  amount numeric, variable_pay numeric, bonus numeric, store_id text, for_month text, paid_from text,
  transaction_id text, created_by text, created_at timestamptz,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.payouts (payout_date);
create table ledger.mirror_issues (
  id bigserial primary key, at timestamptz not null default now(), kv_key text, op text, error text
);
create table ledger.mirror_checks (
  id bigserial primary key, checked_at timestamptz not null default now(), entity text,
  kv_rows bigint, table_rows bigint, missing_in_table bigint, extra_in_table bigint, different bigint,
  kv_total numeric, table_total numeric
);

-- 2./3. One record from the key-value table into its table (delete + insert = always the latest).
create or replace function ledger.unmirror_row(p_key text) returns void language plpgsql security definer set search_path = '' as $$
declare p text := split_part(p_key, ':', 1);
begin
  if p = 'sales' then delete from ledger.sales_days where kv_key = p_key;
  elsif p = 'online_sales' then delete from ledger.online_sales_days where kv_key = p_key;
  elsif p = 'inventory' then delete from ledger.purchases where kv_key = p_key;
  elsif p = 'overhead' then delete from ledger.running_costs where kv_key = p_key;
  elsif p = 'fixedcost' then delete from ledger.fixed_costs where kv_key = p_key;
  elsif p = 'payout' then delete from ledger.payouts where kv_key = p_key;
  end if;
end $$;

create or replace function ledger.mirror_row(p_key text, v jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare p text := split_part(p_key, ':', 1);
begin
  perform ledger.unmirror_row(p_key);
  if v is null then return; end if;
  if p = 'sales' then
    insert into ledger.sales_days (kv_key, id, store_id, sales_date, cash_amount, paytm_amount, offline_sales, online_sales,
      pos_offline_sales, pos_online_sales, online_commission, sales_discrepancy, actual_cash_in_hand, cash_over_short,
      approval_status, approved_by, approved_at, created_by, synced_at, data)
    values (p_key, v->>'id', v->>'storeId', ledger.day(v->'date'), ledger.num(v->'cashAmount'), ledger.num(v->'paytmAmount'),
      ledger.num(v->'offlineSales'), ledger.num(v->'onlineSales'), ledger.num(v->'posOfflineSales'), ledger.num(v->'posOnlineSales'),
      ledger.num(v->'onlineSalesCommission'), ledger.num(v->'salesDiscrepancy'), ledger.num(v->'actualCashInHand'),
      ledger.num(v->'cashOverShortAmount'), v->>'approvalStatus', v->>'approvedBy', ledger.ts(v->'approvedAt'),
      v->>'createdBy', ledger.ts(v->'syncedAt'), v);
  elsif p = 'online_sales' then
    insert into ledger.online_sales_days (kv_key, id, store_id, sales_date, zomato, swiggy, created_at, data)
    values (p_key, v->>'id', v->>'storeId', ledger.day(v->'date'), ledger.num(v->'zomatoSales'), ledger.num(v->'swiggySales'),
      ledger.ts(v->'createdAt'), v);
  elsif p = 'inventory' then
    insert into ledger.purchases (kv_key, id, purchase_date, item_name, category, quantity, unit, cost_per_unit, total_cost,
      payment_method, cash_amount, online_amount, entity_type, store_id, production_house_id, paid_from_production_house_id,
      created_by, created_by_name, user_id, data)
    values (p_key, v->>'id', ledger.day(v->'date'), v->>'itemName', v->>'category', ledger.num(v->'quantity'), v->>'unit',
      ledger.num(v->'costPerUnit'), ledger.num(v->'totalCost'), v->>'paymentMethod', ledger.num(v->'cashAmount'),
      ledger.num(v->'onlineAmount'), v->>'entityType', v->>'storeId', v->>'productionHouseId', v->>'paidFromProductionHouseId',
      v->>'createdBy', v->>'createdByName', v->>'userId', v);
  elsif p = 'overhead' then
    insert into ledger.running_costs (kv_key, id, cost_date, category, description, amount, payment_method, cash_amount,
      online_amount, entity_type, store_id, production_house_id, employee_id, user_id, data)
    values (p_key, v->>'id', ledger.day(v->'date'), v->>'category', v->>'description', ledger.num(v->'amount'),
      v->>'paymentMethod', ledger.num(v->'cashAmount'), ledger.num(v->'onlineAmount'), v->>'entityType', v->>'storeId',
      v->>'productionHouseId', v->>'employeeId', v->>'userId', v);
  elsif p = 'fixedcost' then
    insert into ledger.fixed_costs (kv_key, id, cost_date, for_month, category, description, amount, payment_method, cash_amount,
      online_amount, entity_type, store_id, production_house_id, units, unit_price, user_id, data)
    values (p_key, v->>'id', ledger.day(v->'date'), v->>'forMonth', v->>'category', v->>'description', ledger.num(v->'amount'),
      v->>'paymentMethod', ledger.num(v->'cashAmount'), ledger.num(v->'onlineAmount'), v->>'entityType', v->>'storeId',
      v->>'productionHouseId', ledger.num(v->'units'), ledger.num(v->'unitPrice'), v->>'userId', v);
  elsif p = 'payout' then
    insert into ledger.payouts (kv_key, id, payout_date, employee_id, employee_name, amount, variable_pay, bonus, store_id,
      for_month, paid_from, transaction_id, created_by, created_at, data)
    values (p_key, v->>'id', ledger.day(v->'date'), v->>'employeeId', v->>'employeeName', ledger.num(v->'amount'),
      ledger.num(v->'variablePay'), ledger.num(v->'bonus'), v->>'storeId', v->>'forMonth', v->>'paidFrom',
      v->>'transactionId', v->>'createdBy', ledger.ts(v->'createdAt'), v);
  end if;
end $$;

-- The trigger never lets a copy problem stop the key-value write.
create or replace function ledger.mirror_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if tg_op = 'DELETE' then k := old.key; else k := new.key; end if;
  begin
    if tg_op = 'DELETE' then
      perform ledger.unmirror_row(old.key);
    else
      if tg_op = 'UPDATE' and old.key <> new.key then perform ledger.unmirror_row(old.key); end if;
      perform ledger.mirror_row(new.key, new.value);
    end if;
  exception when others then
    begin
      insert into ledger.mirror_issues (kv_key, op, error) values (k, tg_op, sqlerrm);
    exception when others then null;
    end;
  end;
  return null;
end $$;

-- Copy every existing money record (each one read fresh, problems logged).
do $$
declare r record;
begin
  for r in select key from public.kv_store_c2dd9b9d
           where split_part(key, ':', 1) in ('sales', 'online_sales', 'inventory', 'overhead', 'fixedcost', 'payout') loop
    begin
      perform ledger.mirror_row(r.key, (select value from public.kv_store_c2dd9b9d where key = r.key));
    exception when others then
      insert into ledger.mirror_issues (kv_key, op, error) values (r.key, 'COPY', sqlerrm);
    end;
  end loop;
end $$;

create trigger ledger_mirror_write after insert or update on public.kv_store_c2dd9b9d
  for each row when (split_part(new.key, ':', 1) in ('sales', 'online_sales', 'inventory', 'overhead', 'fixedcost', 'payout'))
  execute function ledger.mirror_trigger();
create trigger ledger_mirror_delete after delete on public.kv_store_c2dd9b9d
  for each row when (split_part(old.key, ':', 1) in ('sales', 'online_sales', 'inventory', 'overhead', 'fixedcost', 'payout'))
  execute function ledger.mirror_trigger();

-- The comparison: every record (exact match of the stored record) and every total, per kind.
create or replace function ledger.check_mirror() returns table (
  entity text, kv_rows bigint, table_rows bigint, missing_in_table bigint, extra_in_table bigint, different bigint,
  kv_total numeric, table_total numeric
) language sql stable security definer set search_path = '' as $$
  with kv as (
    select split_part(key, ':', 1) p, key, value from public.kv_store_c2dd9b9d
    where split_part(key, ':', 1) in ('sales', 'online_sales', 'inventory', 'overhead', 'fixedcost', 'payout')
  ), t as (
    select 'sales' p, kv_key, data, coalesce(offline_sales, 0) + coalesce(online_sales, 0) amt from ledger.sales_days
    union all select 'online_sales', kv_key, data, coalesce(zomato, 0) + coalesce(swiggy, 0) from ledger.online_sales_days
    union all select 'inventory', kv_key, data, coalesce(total_cost, 0) from ledger.purchases
    union all select 'overhead', kv_key, data, coalesce(amount, 0) from ledger.running_costs
    union all select 'fixedcost', kv_key, data, coalesce(amount, 0) from ledger.fixed_costs
    union all select 'payout', kv_key, data, coalesce(amount, 0) from ledger.payouts
  ), kvamt as (
    select p, key, value, case p
      when 'sales' then coalesce(ledger.num(value->'offlineSales'), 0) + coalesce(ledger.num(value->'onlineSales'), 0)
      when 'online_sales' then coalesce(ledger.num(value->'zomatoSales'), 0) + coalesce(ledger.num(value->'swiggySales'), 0)
      when 'inventory' then coalesce(ledger.num(value->'totalCost'), 0)
      else coalesce(ledger.num(value->'amount'), 0) end amt from kv
  )
  select e.p,
    (select count(*) from kvamt where p = e.p),
    (select count(*) from t where p = e.p),
    (select count(*) from kvamt k where k.p = e.p and not exists (select 1 from t where t.kv_key = k.key)),
    (select count(*) from t where t.p = e.p and not exists (select 1 from kvamt k where k.key = t.kv_key)),
    (select count(*) from kvamt k join t on t.kv_key = k.key where k.p = e.p and t.data is distinct from k.value),
    (select coalesce(sum(amt), 0) from kvamt where p = e.p),
    (select coalesce(sum(amt), 0) from t where p = e.p)
  from (values ('sales'), ('online_sales'), ('inventory'), ('overhead'), ('fixedcost'), ('payout')) e(p);
$$;

revoke all on all tables in schema ledger from public, anon, authenticated;
revoke all on all sequences in schema ledger from public, anon, authenticated;
revoke all on all functions in schema ledger from public, anon, authenticated;
alter table ledger.sales_days enable row level security;
alter table ledger.online_sales_days enable row level security;
alter table ledger.purchases enable row level security;
alter table ledger.running_costs enable row level security;
alter table ledger.fixed_costs enable row level security;
alter table ledger.payouts enable row level security;
alter table ledger.mirror_issues enable row level security;
alter table ledger.mirror_checks enable row level security;

-- Daily at 5:15 AM IST (23:45 UTC): keep the day's comparison.
select cron.schedule('ledger-mirror-check', '45 23 * * *', $$
  insert into ledger.mirror_checks (entity, kv_rows, table_rows, missing_in_table, extra_in_table, different, kv_total, table_total)
  select * from ledger.check_mirror();
$$);
