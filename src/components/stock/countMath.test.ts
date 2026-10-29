// Tests for countMath.ts: expected momo stock from the last count + everything since, checked
// against a made-up store and production house (31 Jul - 29 Oct 2026) whose physical stock is
// tracked alongside the app records, with some momos going missing unrecorded - a count must
// find exactly those. The old month-based maths was off by thousands here (29 Oct 2026).
//   node scripts/stock-test.mjs
import assert from 'node:assert/strict';
import { computeStoreStock } from './stockMath';
import { countKey, countUTC, dayAfterCount, houseExpected, lastCount, storeExpected } from './countMath';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; }
};

// ---- The made-up world ----

const KEYS = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'];
const SALES_NAME: Record<string, string> = {
  chicken: 'Chicken Momos', chickenCheese: 'Chicken Cheese Momos', veg: 'Veg Momos', cheeseCorn: 'Corn Cheese Momos',
  paneer: 'Paneer Momos', vegKurkure: 'Veg Kurkure Momos', chickenKurkure: 'Chicken Kurkure Momos',
};
const ITEMS = [
  ['cheese_corn', 'Cheese Corn Momo'], ['chicken', 'Chicken Momo'], ['chicken_cheese', 'Chicken Cheese Momo'], ['chicken_kurkure', 'Chicken Kurkure Momo'],
  ['paneer', 'Paneer Momo'], ['veg', 'Veg Momo'], ['veg_kurkure', 'Veg Kurkure Momo'],
].map(([name, displayName], i) => ({ id: `item-${i}`, name, displayName, category: 'finished_product', isActive: true, linkedEntityType: 'global', unit: 'pieces' }));
const NAME_OF: Record<string, string> = { chicken: 'chicken', chickenCheese: 'chicken_cheese', veg: 'veg', cheeseCorn: 'cheese_corn', paneer: 'paneer', vegKurkure: 'veg_kurkure', chickenKurkure: 'chicken_kurkure' };

const STORE = 'STORE-1';
const HOUSE = 'PH-1';
const stores = [{ id: STORE, name: 'Bunny Momos 1', productionHouseId: HOUSE }];
const ids = { productionHouseUUID: HOUSE, effectiveStoreId: HOUSE, originalStoreId: HOUSE };

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const around = (n: number, spread = 0.2) => Math.round(n * (1 - spread + rnd() * spread * 2) / 5) * 5;

const utc = (ist: string) => new Date(Date.parse(`${ist}:00Z`) - 330 * 60000).toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);

type Delta = { at: string; place: 'store' | 'house'; change: Record<string, number> };
const deltas: Delta[] = [];
const sales: any[] = [];
const wastage: any[] = [];
const requests: any[] = [];
const productionData: any[] = [];
const returns: any[] = [];

const start: Record<'store' | 'house', Record<string, number>> = {
  store: { chicken: 900, chickenCheese: 260, veg: 300, cheeseCorn: 200, paneer: 250, vegKurkure: 80, chickenKurkure: 90 },
  house: { chicken: 1400, chickenCheese: 300, veg: 600, cheeseCorn: 300, paneer: 350, vegKurkure: 100, chickenKurkure: 150 },
};
const neg = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, -v]));

for (let d = new Date('2026-07-31T00:00:00Z'), i = 0; day(d) <= '2026-10-29'; d = new Date(d.getTime() + 86400000), i++) {
  const D = day(d);
  // Production 9 AM - 3 PM; kurkure is folded from regular momos.
  const made = { chicken: around(700), chickenCheese: around(120), veg: around(300), cheeseCorn: around(100), paneer: around(110), chickenKurkure: around(100), vegKurkure: around(50) };
  productionData.push({
    id: `p-${D}`, date: D, productionHouseId: HOUSE, storeId: HOUSE, approvalStatus: 'approved',
    chickenMomos: { final: made.chicken }, chickenCheeseMomos: { final: made.chickenCheese }, vegMomos: { final: made.veg },
    cheeseCornMomos: { final: made.cheeseCorn }, paneerMomos: { final: made.paneer }, vegKurkureMomos: { final: made.vegKurkure },
    chickenKurkureMomos: { final: made.chickenKurkure },
  });
  deltas.push({ at: `${D}T12:00`, place: 'house', change: { ...made, chicken: made.chicken - made.chickenKurkure, veg: made.veg - made.vegKurkure } });

  // Every other day the store gets a delivery: shipped 5:45 PM, received 6:30 PM. Some go short.
  if (i % 2 === 0) {
    const asked = { chicken: 1200, chickenCheese: 220, veg: 500, cheeseCorn: 200, paneer: 220, vegKurkure: 100, chickenKurkure: 200 };
    const shipped = { ...asked, chicken: i % 6 === 0 ? 1100 : 1200 };
    requests.push({ id: `r-${D}`, storeId: STORE, status: 'delivered', ...asked, shippedQuantities: shipped, requestDate: D, shippedAt: utc(`${D}T17:45`), deliveredAt: utc(`${D}T18:30`), createdAt: utc(`${D}T09:00`) });
    deltas.push({ at: `${D}T17:45`, place: 'house', change: neg(shipped) });
    deltas.push({ at: `${D}T18:30`, place: 'store', change: shipped });
  }

  // Sales 5 PM - 11 PM, saved per day in pieces under the old names.
  const sold = { chicken: around(560), chickenCheese: around(105), veg: around(240), cheeseCorn: around(95), paneer: around(105), vegKurkure: around(48), chickenKurkure: around(95) };
  sales.push({ id: `s-${D}`, storeId: STORE, date: D, data: Object.fromEntries(KEYS.map((k) => [SALES_NAME[k], sold[k as keyof typeof sold]])) });
  deltas.push({ at: `${D}T20:00`, place: 'store', change: neg(sold) });

  // Wastage logged every 5th day.
  if (i % 5 === 0) {
    const w = { chicken: 12, veg: 6 };
    wastage.push({ id: `w-${D}`, storeId: STORE, date: D, wastage: w });
    deltas.push({ at: `${D}T21:00`, place: 'store', change: neg(w) });
  }
}

// An event stall: 300 chicken + 100 veg out on 10 Oct, 60 + 20 counted back in on 13 Oct.
requests.push({ id: 'r-event', storeId: 'EVENT-1', eventId: 'EVENT-1', productionHouseId: HOUSE, status: 'delivered', chicken: 300, veg: 100, requestDate: '2026-10-10', shippedAt: utc('2026-10-10T10:00'), deliveredAt: utc('2026-10-10T12:00') });
deltas.push({ at: '2026-10-10T10:00', place: 'house', change: { chicken: -300, veg: -100 } });
returns.push({ id: 'm-event', eventId: 'EVENT-1', productionHouseId: HOUSE, status: 'received', receivedQuantities: { chicken: 60, veg: 20 }, receivedAt: utc('2026-10-13T11:00') });
deltas.push({ at: '2026-10-13T11:00', place: 'house', change: { chicken: 60, veg: 20 } });

// On the road at 11:45 PM on the 29th: has left the house, not reached the store.
requests.push({ id: 'r-road', storeId: STORE, status: 'shipped', chicken: 400, shippedQuantities: { chicken: 400 }, requestDate: '2026-10-29', shippedAt: utc('2026-10-29T22:30') });
deltas.push({ at: '2026-10-29T22:30', place: 'house', change: { chicken: -400 } });
// Asked for, never shipped.
requests.push({ id: 'r-pending', storeId: STORE, status: 'pending', chicken: 900, requestDate: '2026-10-29' });

// Gone missing, no record: what the counts should find.
deltas.push({ at: '2026-10-20T15:00', place: 'store', change: { chicken: -40 } });
deltas.push({ at: '2026-10-18T16:00', place: 'house', change: { veg: -30 } });
const MISSING = { store: { chicken: -40 }, house: { veg: -30 } } as Record<string, Record<string, number>>;

/** What is physically there at an India time "YYYY-MM-DDTHH:mm". */
function physical(place: 'store' | 'house', at: string): Record<string, number> {
  const s = { ...start[place] };
  for (const dl of deltas) if (dl.place === place && dl.at < at) for (const [k, v] of Object.entries(dl.change)) s[k] = (s[k] || 0) + v;
  return s;
}

/** A count record as the server saves it: India time with a Z, item names, actual = physical. */
function count(place: 'store' | 'house', at: string, status = 'approved', override?: Record<string, number>) {
  const stock = override || physical(place, at);
  return {
    id: `c-${place}-${at}`, locationId: place === 'store' ? STORE : HOUSE, locationType: place === 'store' ? 'store' : 'production_house',
    date: `${at}:00.000Z`, isOpeningBalance: at.slice(8, 10) === '01', status,
    items: KEYS.map((k) => ({ itemId: NAME_OF[k], actualQuantity: stock[k] || 0 })),
  };
}

// ---- Tests ----
const NOW = '2026-10-29T23:45';
const actualDiff = (place: 'store' | 'house', expected: Record<string, number>) =>
  Object.fromEntries(KEYS.map((k) => [k, physical(place, NOW)[k] - (expected[k] || 0)]).filter(([, v]) => v !== 0));
const S0 = count('store', '2026-08-01T00:41');
const H0 = count('house', '2026-08-02T01:46');
const storeAt = (history: any[]) => storeExpected({ base: lastCount(history, ITEMS), storeId: STORE, requests, sales, wastage }).expected;
const houseAt = (history: any[]) => houseExpected({ base: lastCount(history, ITEMS), ids, productionData, requests, stores, returns }).expected;

test('store: a count from three months ago carries every month since', () => {
  assert.deepEqual(actualDiff('store', storeAt([S0])), MISSING.store);
});
test("store: a count after closing - that day's sales were before it", () => {
  assert.deepEqual(actualDiff('store', storeAt([S0, count('store', '2026-10-15T23:30')])), MISSING.store);
});
test("store: a morning count - that day's sales and evening delivery come after it", () => {
  assert.deepEqual(actualDiff('store', storeAt([S0, count('store', '2026-10-15T11:00')])), MISSING.store);
});
test('store: a rejected count is not a starting point', () => {
  const rejected = count('store', '2026-10-21T23:00', 'rejected', { chicken: 5000, veg: 5000 });
  assert.deepEqual(actualDiff('store', storeAt([S0, count('store', '2026-10-15T23:30'), rejected])), MISSING.store);
});
test('store: On hand (computeStoreStock) shows the same figure as the count expects', () => {
  const finishedProducts = ITEMS.map((i) => ({ key: i.name, camelKey: countKey(i.name), label: i.displayName, legacySalesKey: `${i.displayName}s` }));
  const base = lastCount([S0], ITEMS);
  const res = computeStoreStock({ productionRequests: requests, salesData: sales, finishedProducts, storeBases: [{ storeId: STORE, base, wastage }], matchesStoreScope: (id) => id === STORE })!;
  const expected = storeAt([S0]);
  for (const line of res.lines) {
    assert.equal(line.stock, expected[line.camelKey]);
    assert.equal(line.opening + line.received - line.sold, line.stock);
  }
  assert.equal(computeStoreStock({ productionRequests: requests, salesData: sales, finishedProducts, storeBases: null, matchesStoreScope: () => true }), null);
});
test('house: a count from August carries production, shipments, kurkure and the event stall since', () => {
  assert.deepEqual(actualDiff('house', houseAt([H0])), MISSING.house);
});
test('house: a mid-month count at night, and a rejected one after it', () => {
  const mid = count('house', '2026-10-15T22:00');
  assert.deepEqual(actualDiff('house', houseAt([H0, mid])), MISSING.house);
  assert.deepEqual(actualDiff('house', houseAt([H0, mid, count('house', '2026-10-22T22:30', 'rejected', { chicken: 44231 })])), MISSING.house);
});
test("house: a morning count - that day's production comes after it", () => {
  assert.deepEqual(actualDiff('house', houseAt([H0, count('house', '2026-10-01T09:30')])), MISSING.house);
});
test('house: stock at the end of an earlier day (until)', () => {
  const day = '2026-10-12';
  const base = lastCount([H0, count('house', '2026-10-15T22:00')], ITEMS, `${day}T23:59:59`);
  assert.equal(base!.date, '2026-08-02T01:46:00');
  const e = houseExpected({ base, ids, productionData, requests, stores, returns, until: day }).expected;
  assert.deepEqual(Object.fromEntries(KEYS.map((k) => [k, physical('house', `${day}T23:59`)[k] - e[k]]).filter(([, v]) => v !== 0)), {});
});
test('helpers: count day rules, item names, times', () => {
  assert.equal(dayAfterCount('2026-10-15', '2026-10-15T23:30:00', '15:00'), false);
  assert.equal(dayAfterCount('2026-10-15', '2026-10-15T11:00:00', '15:00'), true);
  assert.equal(dayAfterCount('2026-10-16', '2026-10-16T00:41:00', '15:00'), true); // after midnight: that day's sales are still ahead
  assert.equal(dayAfterCount('2026-10-14', '2026-10-15T11:00:00', '15:00'), false);
  assert.equal(countKey('chicken_cheese'), 'chickenCheese');
  assert.equal(countKey('chicken_momo'), 'chicken');
  assert.equal(countKey('item-3', ITEMS), 'chickenKurkure');
  assert.equal(countUTC('2026-08-01T00:41:44.456Z'), '2026-07-31T19:11:44.000Z');
  assert.equal(lastCount([], ITEMS), null);
});

console.log(`countMath: ${passed} passed`);
