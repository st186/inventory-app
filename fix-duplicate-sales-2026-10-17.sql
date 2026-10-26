-- One-off repair: 17 Oct 2026 has two sales records for Bunny Momos 1 (created 0.7s apart when
-- Rohan's Rs.680 and Rs.450 cash top-ups were approved together). Both carry the same POS
-- totals, so every total on the Sales overview doubled, and the incharge's Cash Reconciliation
-- picks only one of them (so it shows a single top-up).
--
-- Keeps ...rvbjwce8i, gives it the combined top-up (680 + 450 = 1130) and removes the other.
-- A backup of both rows was saved before this was written.
-- Run with:  npx supabase db query --linked -f fix-duplicate-sales-2026-10-17.sql
-- Afterwards the Paytm balance chain from 17 Oct onward needs recomputing (ask Claude, or any
-- approval/Convert-to-Online on that store triggers it).

begin;

update kv_store_c2dd9b9d
set value = jsonb_set(value, '{usedOnlineMoney}', '1130'::jsonb)
where key = 'sales:3483ee7e-ef6e-4dce-b9e5-d61369091415:1792229223096-rvbjwce8i'
  and value->>'date' = '2026-10-17';

delete from kv_store_c2dd9b9d
where key = 'sales:3483ee7e-ef6e-4dce-b9e5-d61369091415:1792229223788-smhocma9m'
  and value->>'date' = '2026-10-17';

commit;

select key, value->>'usedOnlineMoney' as used_online_money, value->>'offlineSales' as offline_sales
from kv_store_c2dd9b9d
where key like 'sales:%' and value->>'date' = '2026-10-17';
