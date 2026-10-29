-- Database overhaul, phase 2 (requests and notifications), steps 1-3 (owner, 28 Oct 2026). Plan:
-- Bunny Momos Docs/4 App/Design/Database-Overhaul-Plan.html
--
-- Same method as phase 1 (20261028040000_ledger_phase1_money_mirror.sql), with its own functions and
-- triggers so phase 1's week of checks is not touched:
--   0. A fresh full copy of the key-value table.
--   1. Tables in the private schema "ledger": stock requests (production_request_* and the archived
--      ones) with one row per item asked for and sent, cash top-ups, notifications.
--   2. Every existing record copied in.
--   3. "Write to both": a trigger copies each write or delete in the same transaction; a failed copy
--      goes to ledger.mirror_issues and the key-value write still goes through.
--   + ledger.check_mirror_ops(), added to the daily "ledger-mirror-check".
-- Two requests for one store on one day are allowed: the 11 such days are real second orders.
-- To undo: drop the two ledger_ops_* triggers, then the tables and functions below.

-- 0. Backup
create table backups.kv_store_2026_10_28_phase2 as table public.kv_store_c2dd9b9d;
revoke all on backups.kv_store_2026_10_28_phase2 from public, anon, authenticated;

-- 1. Tables
create table ledger.stock_requests (
  kv_key text primary key, id text, archived boolean not null, store_id text, store_name text, request_date date,
  status text, requested_by text, requested_by_name text, accepted_by text, delivered_by text, event_id text,
  created_at timestamptz, accepted_at timestamptz, prepared_at timestamptz, shipped_at timestamptz,
  delivered_at timestamptz, updated_at timestamptz, archived_at timestamptz, notes text,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.stock_requests (store_id, request_date);
create index on ledger.stock_requests (status) where not archived;
-- kind: momo (by its field name, e.g. chicken), sauce, utility or kitchen. requested is null for an item
-- that was sent without being asked for; shipped is null until the production house sends.
create table ledger.stock_request_lines (
  kv_key text not null references ledger.stock_requests (kv_key) on delete cascade,
  kind text not null, item text not null, unit text, requested numeric, shipped numeric,
  primary key (kv_key, kind, item)
);
create table ledger.cash_topups (
  kv_key text primary key, id text, request_date date, store_id text, production_house_id text,
  entity_type text, entity_name text, requested_amount numeric, status text, reason text,
  requested_by text, requested_by_name text, requested_by_user_id text,
  approved_by text, approved_at timestamptz, rejected_by text, rejected_at timestamptz, rejection_reason text,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.cash_topups (request_date);
create table ledger.notifications (
  kv_key text primary key, id text, user_id text, type text, category text, title text, message text,
  related_id text, related_date text, is_read boolean, read_at timestamptz, created_at timestamptz,
  push_held text, digested_at timestamptz, escalated_at timestamptz, resolved_at timestamptz,
  data jsonb not null, mirrored_at timestamptz not null default now()
);
create index on ledger.notifications (user_id, created_at desc);
create index on ledger.notifications (user_id) where not is_read;

-- Which phase 2 table a key belongs to (null = none).
create or replace function ledger.ops_kind(p_key text) returns text language sql immutable set search_path = '' as $$
  select case
    when p_key like 'production\_request\_%' then 'stock_request'
    when p_key like 'archived-production-request:%' then 'stock_request'
    when p_key like 'cash-topup:%' then 'cash_topup'
    when p_key like 'notification:%' then 'notification'
  end
$$;

create or replace function ledger.unmirror_ops_row(p_key text) returns void language plpgsql security definer set search_path = '' as $$
declare k text := ledger.ops_kind(p_key);
begin
  if k = 'stock_request' then delete from ledger.stock_requests where kv_key = p_key;
  elsif k = 'cash_topup' then delete from ledger.cash_topups where kv_key = p_key;
  elsif k = 'notification' then delete from ledger.notifications where kv_key = p_key;
  end if;
end $$;

create or replace function ledger.obj(x jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(x) = 'object' then x else '{}'::jsonb end
$$;

create or replace function ledger.mirror_ops_row(p_key text, v jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare k text := ledger.ops_kind(p_key);
begin
  perform ledger.unmirror_ops_row(p_key);
  if v is null or k is null then return; end if;
  if k = 'stock_request' then
    insert into ledger.stock_requests (kv_key, id, archived, store_id, store_name, request_date, status, requested_by,
      requested_by_name, accepted_by, delivered_by, event_id, created_at, accepted_at, prepared_at, shipped_at,
      delivered_at, updated_at, archived_at, notes, data)
    values (p_key, v->>'id', p_key like 'archived-%', v->>'storeId', v->>'storeName', ledger.day(v->'requestDate'),
      v->>'status', v->>'requestedBy', v->>'requestedByName', v->>'acceptedBy', v->>'deliveredBy', v->>'eventId',
      ledger.ts(v->'createdAt'), ledger.ts(v->'acceptedAt'), ledger.ts(v->'preparedAt'), ledger.ts(v->'shippedAt'),
      ledger.ts(v->'deliveredAt'), ledger.ts(v->'updatedAt'), ledger.ts(v->'archivedAt'), v->>'notes', v);
    -- Momos are the record's top-level numbers; shippedQuantities names utilities "utility_X" and
    -- kitchen items "kitchenUtility_X"; sauces are {name: true}.
    insert into ledger.stock_request_lines (kv_key, kind, item, unit, requested, shipped)
    select p_key, kind, item, max(unit), sum(req), sum(shp) from (
      select 'momo' kind, j.key item, null::text unit, ledger.num(j.value) req, null::numeric shp
        from jsonb_each(v) j where jsonb_typeof(j.value) = 'number'
      union all select 'sauce', s.key, null, case when s.value = 'true'::jsonb then 1 else 0 end, null
        from jsonb_each(ledger.obj(v->'sauces')) s
      union all select 'utility', u.key, null, ledger.num(u.value), null
        from jsonb_each(ledger.obj(v->'utilities')) u
      union all select 'kitchen', c.key, c.value->>'unit', ledger.num(c.value->'quantity'), null
        from jsonb_each(ledger.obj(v->'kitchenUtilities')) c
      union all select case when q.key like 'utility\_%' then 'utility' when q.key like 'kitchenUtility\_%' then 'kitchen' else 'momo' end,
          regexp_replace(q.key, '^(utility_|kitchenUtility_)', ''), null, null, ledger.num(q.value)
        from jsonb_each(ledger.obj(v->'shippedQuantities')) q
      union all select 'sauce', s.key, null, null, case when s.value = 'true'::jsonb then 1 else 0 end
        from jsonb_each(ledger.obj(v->'shippedSauces')) s
    ) x group by kind, item;
  elsif k = 'cash_topup' then
    insert into ledger.cash_topups (kv_key, id, request_date, store_id, production_house_id, entity_type, entity_name,
      requested_amount, status, reason, requested_by, requested_by_name, requested_by_user_id, approved_by, approved_at,
      rejected_by, rejected_at, rejection_reason, data)
    values (p_key, v->>'id', coalesce(ledger.day(v->'requestDate'), ledger.day(v->'date')), v->>'storeId',
      v->>'productionHouseId', v->>'requestedByEntityType', v->>'requestedByEntityName', ledger.num(v->'requestedAmount'),
      v->>'status', v->>'reason', v->>'requestedBy', v->>'requestedByName', v->>'requestedByUserId', v->>'approvedBy',
      ledger.ts(v->'approvedAt'), v->>'rejectedBy', ledger.ts(v->'rejectedAt'), v->>'rejectionReason', v);
  elsif k = 'notification' then
    insert into ledger.notifications (kv_key, id, user_id, type, category, title, message, related_id, related_date,
      is_read, read_at, created_at, push_held, digested_at, escalated_at, resolved_at, data)
    values (p_key, v->>'id', v->>'userId', v->>'type', v->>'category', v->>'title', v->>'message', v->>'relatedId',
      v->>'relatedDate', coalesce((v->>'read')::boolean, false), ledger.ts(v->'readAt'), ledger.ts(v->'createdAt'),
      v->>'pushHeld', ledger.ts(v->'digestedAt'), ledger.ts(v->'escalatedAt'), ledger.ts(v->'resolvedAt'), v);
  end if;
end $$;

create or replace function ledger.mirror_ops_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if tg_op = 'DELETE' then k := old.key; else k := new.key; end if;
  begin
    if tg_op = 'DELETE' then
      perform ledger.unmirror_ops_row(old.key);
    else
      if tg_op = 'UPDATE' and old.key <> new.key then perform ledger.unmirror_ops_row(old.key); end if;
      perform ledger.mirror_ops_row(new.key, new.value);
    end if;
  exception when others then
    begin
      insert into ledger.mirror_issues (kv_key, op, error) values (k, tg_op, sqlerrm);
    exception when others then null;
    end;
  end;
  return null;
end $$;

-- 2. Copy every existing record.
do $$
declare r record;
begin
  for r in select key from public.kv_store_c2dd9b9d where ledger.ops_kind(key) is not null loop
    begin
      perform ledger.mirror_ops_row(r.key, (select value from public.kv_store_c2dd9b9d where key = r.key));
    exception when others then
      insert into ledger.mirror_issues (kv_key, op, error) values (r.key, 'COPY', sqlerrm);
    end;
  end loop;
end $$;

-- 3. Write to both. The conditions use built-ins only: the server's role can't call ledger functions,
-- and a condition that errors would stop the key-value write itself.
create trigger ledger_ops_mirror_write after insert or update on public.kv_store_c2dd9b9d
  for each row when (new.key like 'production\_request\_%' or new.key like 'archived-production-request:%'
    or new.key like 'cash-topup:%' or new.key like 'notification:%')
  execute function ledger.mirror_ops_trigger();
create trigger ledger_ops_mirror_delete after delete on public.kv_store_c2dd9b9d
  for each row when (old.key like 'production\_request\_%' or old.key like 'archived-production-request:%'
    or old.key like 'cash-topup:%' or old.key like 'notification:%')
  execute function ledger.mirror_ops_trigger();

-- The comparison. Totals: momos asked for (stock requests, which also checks the item rows), amount
-- asked for (cash top-ups), unread count (notifications).
create or replace function ledger.check_mirror_ops() returns table (
  entity text, kv_rows bigint, table_rows bigint, missing_in_table bigint, extra_in_table bigint, different bigint,
  kv_total numeric, table_total numeric
) language sql stable security definer set search_path = '' as $$
  with kv as (
    select ledger.ops_kind(key) p, key, value from public.kv_store_c2dd9b9d where ledger.ops_kind(key) is not null
  ), kvamt as (
    select p, key, value, case p
      when 'stock_request' then (select coalesce(sum(ledger.num(j.value)), 0) from jsonb_each(ledger.obj(value)) j where jsonb_typeof(j.value) = 'number')
      when 'cash_topup' then coalesce(ledger.num(value->'requestedAmount'), 0)
      else case when value->>'read' = 'true' then 0 else 1 end end amt from kv
  ), t as (
    select 'stock_request' p, r.kv_key, r.data,
      (select coalesce(sum(l.requested), 0) from ledger.stock_request_lines l where l.kv_key = r.kv_key and l.kind = 'momo') amt
      from ledger.stock_requests r
    union all select 'cash_topup', kv_key, data, coalesce(requested_amount, 0) from ledger.cash_topups
    union all select 'notification', kv_key, data, case when is_read then 0 else 1 end from ledger.notifications
  )
  select e.p,
    (select count(*) from kvamt where p = e.p),
    (select count(*) from t where p = e.p),
    (select count(*) from kvamt k where k.p = e.p and not exists (select 1 from t where t.kv_key = k.key)),
    (select count(*) from t where t.p = e.p and not exists (select 1 from kvamt k where k.key = t.kv_key)),
    (select count(*) from kvamt k join t on t.kv_key = k.key where k.p = e.p and t.data is distinct from k.value),
    (select coalesce(sum(amt), 0) from kvamt where p = e.p),
    (select coalesce(sum(amt), 0) from t where p = e.p)
  from (values ('stock_request'), ('cash_topup'), ('notification')) e(p);
$$;

revoke all on all tables in schema ledger from public, anon, authenticated;
revoke all on all functions in schema ledger from public, anon, authenticated;
alter table ledger.stock_requests enable row level security;
alter table ledger.stock_request_lines enable row level security;
alter table ledger.cash_topups enable row level security;
alter table ledger.notifications enable row level security;

-- The daily comparison now covers both phases.
select cron.schedule('ledger-mirror-check', '45 23 * * *', $$
  insert into ledger.mirror_checks (entity, kv_rows, table_rows, missing_in_table, extra_in_table, different, kv_total, table_total)
  select * from ledger.check_mirror() union all select * from ledger.check_mirror_ops();
$$);
