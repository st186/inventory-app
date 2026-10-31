// Daily stock check (owner, 31 Oct 2026: "keep a daily check on item sales and stock left logic
// for production and store and validate if logic is correct or not and then on 30th nov we will
// check again how it spanned out"). Each night after the POS sync, for every store and production
// house: what came in and went out that day, what should be left since the last count, and
// anything that looks wrong - with the same maths as the app's stock screens
// (src/components/stock/countMath.ts, recalibrationMath.ts, utils/requestStock.ts: keep them in
// step). At the month-end count, the expected figure next to the real one shows how far off it was.
// Kept apart from index.ts so it can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/stockCheck.test.ts

export const MOMO_KEYS = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'] as const;
export type Counts = Record<string, number>;
type Row = Record<string, any>;

export const MOMO_LABEL: Record<string, string> = {
  chicken: 'chicken', chickenCheese: 'chicken cheese', veg: 'veg', cheeseCorn: 'cheese corn', paneer: 'paneer', vegKurkure: 'veg kurkure', chickenKurkure: 'chicken kurkure',
};
// Daily item sales are saved under the old display names (countMath SALES_KEYS).
const SALES_KEYS: Record<string, string[]> = {
  chicken: ['Chicken Momos'], chickenCheese: ['Chicken Cheese Momos'], veg: ['Veg Momos'], cheeseCorn: ['Corn Cheese Momos', 'Cheese Corn Momos'],
  paneer: ['Paneer Momos'], vegKurkure: ['Veg Kurkure Momos'], chickenKurkure: ['Chicken Kurkure Momos'],
};
const LONG_KEYS: Record<string, string> = Object.fromEntries(MOMO_KEYS.map((k) => [k, `${k}Momos`]));
export const SENT = ['shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
export const RECEIVED = ['delivered', 'partially-delivered'];
export const SALES_CUTOFF = '15:00';
export const PRODUCTION_CUTOFF = '12:00';

export const zero = (): Counts => Object.fromEntries(MOMO_KEYS.map((k) => [k, 0]));
const add = (a: Counts, b: Counts, sign = 1): Counts => Object.fromEntries(MOMO_KEYS.map((k) => [k, (a[k] || 0) + sign * (b[k] || 0)]));

/** A stored time as India wall-clock "YYYY-MM-DDTHH:mm:ss" (requestStock toISTTimestamp). */
export function istOf(ts?: string | null): string | null {
  if (!ts) return null;
  if (ts.includes('/')) {
    const [datePart, timePart] = ts.split(',');
    const [d, m, y] = datePart.trim().split('/');
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${(timePart || '').trim() || '00:00:00'}`;
  }
  if (/(z|[+-]\d{2}:?\d{2})$/i.test(ts) && !isNaN(Date.parse(ts))) return new Date(Date.parse(ts) + 330 * 60000).toISOString().slice(0, 19);
  return ts;
}
const shippedAt = (r: Row) => istOf(r.shippedAt || r.deliveredAt || r.requestDate || r.createdAt);
const receivedAt = (r: Row) => istOf(r.deliveredAt || r.shippedAt || r.requestDate || r.createdAt);

export function shippedPieces(req: Row, key: string): number {
  const s = req?.shippedQuantities?.[key];
  return s !== undefined && s !== null ? Number(s) || 0 : Number(req?.[key] ?? req?.[LONG_KEYS[key]]) || 0;
}
export function salesPieces(sale: Row, key: string): number {
  for (const name of SALES_KEYS[key] || []) {
    const n = Number(sale?.data?.[name]) || 0;
    if (n) return n;
  }
  return 0;
}
/** Momos made, net of the regular momos folded into kurkure (recalibrationMath netOfKurkure). */
export function madePieces(entries: Row[]): Counts {
  const raw = zero();
  for (const p of entries) for (const k of MOMO_KEYS) raw[k] += Number(p?.[LONG_KEYS[k]]?.final) || 0;
  return { ...raw, chicken: raw.chicken - raw.chickenKurkure, veg: raw.veg - raw.vegKurkure };
}

/** A count line's item as a momo key ("chicken_cheese", an old "chicken_momo", or an item id). */
export function countKey(itemId: string, items: { id: string; name: string }[] = []): string {
  const name = items.find((i) => i.id === itemId || i.name === itemId)?.name || itemId || '';
  return name.replace(/_momo(s)?$/i, '').replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
export type Base = { id?: string; at: string; stock: Counts } | null; // at: India wall-clock
/** The latest count of a place that wasn't rejected (countMath lastCount). Count dates are India time. */
export function lastCount(counts: Row[], items: { id: string; name: string }[] = []): Base {
  const ok = counts.filter((r) => typeof r?.date === 'string' && r.status !== 'rejected').sort((a, b) => b.date.slice(0, 19).localeCompare(a.date.slice(0, 19)));
  if (!ok.length) return null;
  const stock = zero();
  for (const line of ok[0].items || []) {
    const k = countKey(line.itemId, items);
    if (k in stock) stock[k] = Number(line.actualQuantity) || 0;
  }
  return { id: ok[0].id, at: ok[0].date.slice(0, 19), stock };
}

/** An untimed day's figures came after the count: a later day, or the count's own day before the cutoff. */
const afterCount = (day: string, base: Base, cutoff: string) => !base || day > base.at.slice(0, 10) || (day === base.at.slice(0, 10) && base.at.slice(11, 16) < cutoff);
const tsAfterCount = (ts: string | null, base: Base) => !!ts && (!base || ts > base.at);

export type Flag = { code: string; text: string; momo?: string; n?: number };
export type PlaceDay = {
  kind: 'store' | 'production'; id: string; name: string; date: string;
  since: string | null; // the count the figures start from (India time), null: never counted
  opening: Counts; in: Counts; out: Counts; wasted: Counts; closing: Counts; flags: Flag[];
};

/** Movement of a store from its count to the end of `day` (inclusive) and on `day` alone. */
export function storeDay(o: {
  id: string; name: string; date: string; base: Base; requests: Row[]; sales: Row[]; wastage: Row[];
}): PlaceDay {
  const before = { in: zero(), out: zero(), wasted: zero() };
  const today = { in: zero(), out: zero(), wasted: zero() };
  const pick = (day: string) => (day === o.date ? today : day < o.date ? before : null);
  for (const r of o.requests) {
    if (!RECEIVED.includes(r.status) || r.storeId !== o.id || r.eventId) continue;
    const at = receivedAt(r);
    if (!tsAfterCount(at, o.base)) continue;
    const bucket = pick(at!.slice(0, 10));
    if (bucket) for (const k of MOMO_KEYS) bucket.in[k] += shippedPieces(r, k);
  }
  for (const s of o.sales) {
    if (s.storeId !== o.id || !s.date || !afterCount(s.date.slice(0, 10), o.base, SALES_CUTOFF)) continue;
    const bucket = pick(s.date.slice(0, 10));
    if (bucket) for (const k of MOMO_KEYS) bucket.out[k] += salesPieces(s, k);
  }
  for (const w of o.wastage) {
    if (w.storeId !== o.id || !w.date || !afterCount(w.date.slice(0, 10), o.base, SALES_CUTOFF)) continue;
    const bucket = pick(w.date.slice(0, 10));
    if (bucket) for (const k of MOMO_KEYS) bucket.wasted[k] += Number(w.wastage?.[k]) || 0;
  }
  const opening = add(add(add(o.base?.stock || zero(), before.in), before.out, -1), before.wasted, -1);
  const closing = add(add(add(opening, today.in), today.out, -1), today.wasted, -1);
  return { kind: 'store', id: o.id, name: o.name, date: o.date, since: o.base?.at || null, opening, in: today.in, out: today.out, wasted: today.wasted, closing, flags: [] };
}

/** Movement of a production house: made (net of kurkure; rejected entries left out) - shipped. */
export function houseDay(o: {
  id: string; name: string; date: string; base: Base; ids: string[]; storeIds: string[]; production: Row[]; requests: Row[];
}): PlaceDay {
  const before = { in: zero(), out: zero() };
  const today = { in: zero(), out: zero() };
  const pick = (day: string) => (day === o.date ? today : day < o.date ? before : null);
  const mine = (p: Row) => o.ids.includes(p.productionHouseId) || o.ids.includes(p.storeId);
  const made = o.production.filter((p) => p.approvalStatus !== 'rejected' && mine(p) && p.date && afterCount(p.date.slice(0, 10), o.base, PRODUCTION_CUTOFF));
  for (const p of made) {
    const bucket = pick(p.date.slice(0, 10));
    if (bucket) for (const [k, n] of Object.entries(madePieces([p]))) bucket.in[k] += n;
  }
  for (const r of o.requests) {
    if (!SENT.includes(r.status)) continue;
    const fromHere = r.eventId ? o.ids.includes(r.productionHouseId) : o.storeIds.includes(r.storeId);
    if (!fromHere) continue;
    const at = shippedAt(r);
    if (!tsAfterCount(at, o.base)) continue;
    const bucket = pick(at!.slice(0, 10));
    if (bucket) for (const k of MOMO_KEYS) bucket.out[k] += shippedPieces(r, k);
  }
  const opening = add(add(o.base?.stock || zero(), before.in), before.out, -1);
  const closing = add(add(opening, today.in), today.out, -1);
  return { kind: 'production', id: o.id, name: o.name, date: o.date, since: o.base?.at || null, opening, in: today.in, out: today.out, wasted: zero(), closing, flags: [] };
}

// ---- What looks wrong ----

const MOMO_WORDS = /momo|platter|burger|combo|meal/i;
/** The POS item list's menu items whose momo count looks wrong (posItemClassifier.tsx). */
export function itemFlags(productBreakdown: unknown): Flag[] {
  if (!Array.isArray(productBreakdown)) return [];
  const flags: Flag[] = [];
  for (const e of productBreakdown as Row[]) {
    const name = String(e?.productName || '');
    const qty = Number(e?.quantity) || 0;
    const pieces = Number(e?.pieces) || 0;
    if (!qty) continue;
    if (!e?.category && MOMO_WORDS.test(name)) flags.push({ code: 'item_not_counted', text: `"${name}" x${qty} isn't counted as any momo type`, n: qty });
    else if (e?.category === 'Veg Momos' && /non[\s-]*veg/i.test(name)) flags.push({ code: 'non_veg_as_veg', text: `"${name}" x${qty} is counted as veg momos`, n: qty });
    const pc = name.match(/(\d+)\s*pc\b/i);
    if (e?.category && pc && Math.abs(pieces - qty * Number(pc[1])) > 0.01 && !/mania|burger/i.test(name)) {
      flags.push({ code: 'pieces_not_read', text: `"${name}" x${qty} counted as ${pieces / qty} momos each, not ${pc[1]}`, n: qty });
    }
  }
  return flags;
}

export const neg = (c: Counts) => MOMO_KEYS.filter((k) => (c[k] || 0) < 0);

/** A store's day: what looks wrong. */
export function storeFlags(day: PlaceDay, o: { itemRecords: Row[]; inTransit: Row[]; syncLog: Row | null; sold: boolean }): Flag[] {
  const flags: Flag[] = [];
  if (!day.since) flags.push({ code: 'no_count', text: 'No stock count yet: what should be left starts at the first count' });
  for (const k of neg(day.closing)) flags.push({ code: 'negative', momo: k, n: -day.closing[k], text: `${-day.closing[k]} ${MOMO_LABEL[k]} sold more than the store had by the records (since the count)` });
  if (o.itemRecords.length > 1) flags.push({ code: 'two_item_records', n: o.itemRecords.length, text: `${o.itemRecords.length} item sales records for the day: momos sold may be counted twice` });
  if (!o.itemRecords.length && o.sold) {
    const why = o.syncLog?.stepB?.reason || o.syncLog?.stepB?.error;
    flags.push({ code: 'no_item_sales', text: `Sales came in but no POS item list${why ? ` (${String(why).slice(0, 120)})` : ''}: momos sold aren't counted` });
  }
  for (const r of o.inTransit) flags.push({ code: 'not_received', text: `Momos sent at ${String(istOf(r.shippedAt) || '').slice(11, 16) || '?'} not marked received by the store` });
  for (const rec of o.itemRecords) flags.push(...itemFlags(rec.productBreakdown));
  return flags;
}

/** A production house's day: what looks wrong. */
export function houseFlags(day: PlaceDay, o: { entries: Row[] }): Flag[] {
  const flags: Flag[] = [];
  if (!day.since) flags.push({ code: 'no_count', text: 'No stock count yet: what should be left starts at the first count' });
  for (const k of neg(day.closing)) flags.push({ code: 'negative', momo: k, n: -day.closing[k], text: `${-day.closing[k]} ${MOMO_LABEL[k]} more sent than made since the count: a production entry may be missing or too low` });
  const sentAny = MOMO_KEYS.some((k) => day.out[k] > 0);
  if (sentAny && !o.entries.length) flags.push({ code: 'sent_without_entry', text: 'Momos sent but no production entry for the day' });
  for (const p of o.entries) if (p.approvalStatus === 'pending') flags.push({ code: 'entry_pending', text: 'The day\'s production entry is still waiting for approval' });
  return flags;
}

/** Yesterday's closing as saved then vs worked out again tonight: a change means an entry was edited or added late. */
export function lateChanges(prevSaved: PlaceDay | undefined, openingNow: Counts): Flag[] {
  if (!prevSaved) return [];
  const diff = MOMO_KEYS.filter((k) => Math.round(prevSaved.closing[k] || 0) !== Math.round(openingNow[k] || 0));
  return diff.length ? [{ code: 'changed_later', text: `Yesterday's figures changed after they were checked (${diff.map((k) => `${MOMO_LABEL[k]} ${prevSaved.closing[k]} -> ${openingNow[k]}`).join(', ')}): an entry was edited or added late` }] : [];
}
