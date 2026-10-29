// Expected momo stock, for the stock count screen and the stock screens: the last count that
// wasn't rejected + everything that moved after it (owner, 29 Oct 2026). The month-based maths
// it replaces took the last count as "this month's opening" however old it was and dropped every
// month in between (the 1 Aug store count expected -10,818 chicken momos, the 2 Aug production
// count 44,231), ignored a count made during the month on the store side, started from a
// rejected count, and missed store wastage.
//
// Times: a count's `date` is India wall-clock time (server getNowIST, with a Z it doesn't mean);
// request times are real UTC, read as India time (toISTTimestamp). Sales, wastage and production
// are logged per day without a time, so on the count's own day they count as after the count only
// when it was done early: sales and wastage before 3 PM (before the store opens), production
// before noon. Counting after closing is the safe habit.
import {
  MOMO_STOCK_KEYS, eventReturnsBack, matchesHouseRecord, minus, netOfKurkure, rawProduction, shippedFromHouse, sumShippedPieces, zero,
  type HouseIds, type MomoCounts,
} from './recalibrationMath';
import { RECEIVED_STATUSES, SENT_STATUSES, receivedAtIST, shippedAtIST } from '../../utils/requestStock';

type Row = Record<string, any>;
type ItemRef = { id: string; name: string };

export type CountRecord = { id?: string; date: string; status?: string; items?: { itemId: string; actualQuantity: number }[] };
/** The count expected stock starts from (null: never counted, so from zero and all history). */
export type Baseline = { id?: string; date: string; stock: MomoCounts } | null;

export const SALES_CUTOFF = '15:00';
export const PRODUCTION_CUTOFF = '12:00';

// Daily sales are saved under the old display names ("Corn Cheese Momos" on every record so far).
export const SALES_KEYS: Record<string, string[]> = {
  chicken: ['Chicken Momos'],
  chickenCheese: ['Chicken Cheese Momos'],
  veg: ['Veg Momos'],
  cheeseCorn: ['Corn Cheese Momos', 'Cheese Corn Momos'],
  paneer: ['Paneer Momos'],
  vegKurkure: ['Veg Kurkure Momos'],
  chickenKurkure: ['Chicken Kurkure Momos'],
};

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** A count line's item ("chicken_cheese", an old "chicken_momo", or an item id) as a stock key. */
export function countKey(itemId: string, items: ItemRef[] = []): string {
  const name = items.find((i) => i.id === itemId || i.name === itemId)?.name || itemId || '';
  return camel(name.replace(/_momo(s)?$/i, ''));
}

export function countStock(record: CountRecord, items: ItemRef[] = []): MomoCounts {
  const stock = zero();
  for (const line of record.items || []) {
    const key = countKey(line.itemId, items);
    if (key in stock) stock[key] = Number(line.actualQuantity) || 0;
  }
  return stock;
}

/** India wall-clock "YYYY-MM-DDTHH:mm:ss" of a count (its stored Z is not UTC). */
export const countTime = (date: string) => date.slice(0, 19);
/** A count's India time as a real UTC ISO string, for the date formatters. */
export const countUTC = (at: string) => new Date(Date.parse(`${countTime(at)}Z`) - 330 * 60000).toISOString();

/** The latest count that wasn't rejected, made before `before` (an India time) if given. */
export function lastCount(history: CountRecord[], items: ItemRef[] = [], before?: string): Baseline {
  const usable = history
    .filter((r) => r?.date && r.status !== 'rejected' && (!before || countTime(r.date) < before))
    .sort((a, b) => countTime(b.date).localeCompare(countTime(a.date)));
  const last = usable[0];
  return last ? { id: last.id, date: countTime(last.date), stock: countStock(last, items) } : null;
}

/** Whether a day's untimed figures (sales, wastage, production) came after a count at `at`. */
export function dayAfterCount(day: string, at: string, cutoff: string): boolean {
  const countDay = at.slice(0, 10);
  if (day !== countDay) return day > countDay;
  return at.slice(11, 16) < cutoff;
}

const afterTime = (ts: string | null, base: Baseline) => !!ts && (!base || ts > base.date);
const afterDay = (day: string | undefined, base: Baseline, cutoff: string) => !!day && (!base || dayAfterCount(day.slice(0, 10), base.date, cutoff));
const upTo = (dayOrTs: string | null | undefined, until?: string) => !until || (!!dayOrTs && dayOrTs.slice(0, 10) <= until);

export function salesPieces(sale: Row, key: string): number {
  for (const name of SALES_KEYS[key] || []) {
    const n = Number(sale?.data?.[name]) || 0;
    if (n) return n;
  }
  return 0;
}

const plus = (a: MomoCounts, b: MomoCounts): MomoCounts => Object.fromEntries(MOMO_STOCK_KEYS.map((k) => [k, (a[k] || 0) + (b[k] || 0)]));

export type StoreExpected = { base: Baseline; received: MomoCounts; sold: MomoCounts; wasted: MomoCounts; expected: MomoCounts };

/**
 * A store's expected stock: count + momos delivered after it (shipped amounts, by delivery time)
 * - sold after it - wastage logged after it. `until` (an India day) stops the movement there.
 */
export function storeExpected({ base, storeId, requests, sales, wastage = [], until }: {
  base: Baseline;
  storeId: string;
  requests: Row[];
  sales: Row[];
  wastage?: Row[];
  until?: string;
}): StoreExpected {
  const delivered = requests.filter((req) => {
    if (!RECEIVED_STATUSES.includes(req.status) || req.storeId !== storeId || req.eventId) return false;
    const at = receivedAtIST(req);
    return afterTime(at, base) && upTo(at, until);
  });
  const received = sumShippedPieces(delivered);
  const sold = zero();
  for (const sale of sales) {
    if (sale.storeId !== storeId || !afterDay(sale.date, base, SALES_CUTOFF) || !upTo(sale.date, until)) continue;
    for (const key of MOMO_STOCK_KEYS) sold[key] += salesPieces(sale, key);
  }
  const wasted = zero();
  for (const entry of wastage) {
    if (entry.storeId !== storeId || !afterDay(entry.date, base, SALES_CUTOFF) || !upTo(entry.date, until)) continue;
    for (const key of MOMO_STOCK_KEYS) wasted[key] += Number(entry.wastage?.[key]) || 0;
  }
  const expected = minus(minus(plus(base?.stock || zero(), received), sold), wasted);
  return { base, received, sold, wasted, expected };
}

export type HouseExpected = { base: Baseline; produced: MomoCounts; sent: MomoCounts; expected: MomoCounts };

/**
 * A production house's expected stock: count + momos made after it (net of the regular momos
 * folded into kurkure; rejected entries left out) - momos shipped after it (stores and event
 * stalls, by ship time) + event leftovers counted back in after it.
 */
export function houseExpected({ base, ids, productionData, requests, stores, returns = [], until }: {
  base: Baseline;
  ids: HouseIds;
  productionData: Row[];
  requests: Row[];
  stores: { id: string; productionHouseId?: string | null }[];
  returns?: Row[];
  until?: string;
}): HouseExpected {
  const made = productionData.filter((p) =>
    p.approvalStatus !== 'rejected' && matchesHouseRecord(p, ids) && afterDay(p.date, base, PRODUCTION_CUTOFF) && upTo(p.date, until));
  const shipped = requests.filter((req) => {
    if (!SENT_STATUSES.includes(req.status)) return false;
    const at = shippedAtIST(req);
    return afterTime(at, base) && upTo(at, until) && shippedFromHouse(req, stores, ids.productionHouseUUID, ids.effectiveStoreId);
  });
  const back = eventReturnsBack(returns, [ids.productionHouseUUID, ids.effectiveStoreId, ids.originalStoreId], (at) => afterTime(at, base) && upTo(at, until));
  const produced = netOfKurkure(rawProduction(made));
  const sent = minus(sumShippedPieces(shipped), back);
  return { base, produced, sent, expected: minus(plus(base?.stock || zero(), produced), sent) };
}
