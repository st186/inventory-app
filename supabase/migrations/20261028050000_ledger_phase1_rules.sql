-- Database overhaul, phase 1 (owner, 28 Oct 2026): rules switched on after the old duplicates were
-- fixed (36 July purchases saved twice; online sales 12-18 Feb copies and the 21 Mar re-entry that was
-- one day late - all backed up in backups.fixes_2026_10_28).
-- One purchase per id, one online-sales record per store per day. A duplicate written to the key-value
-- table is then refused by the copy, lands in ledger.mirror_issues and shows in the daily check.
create unique index purchases_one_per_id on ledger.purchases (id);
create unique index online_sales_one_per_store_day on ledger.online_sales_days (store_id, sales_date);
