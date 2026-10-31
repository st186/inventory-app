// Tests for stockCheck.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/stockCheck.test.ts
import assert from 'node:assert/strict';
import { houseDay, houseFlags, itemFlags, lastCount, lateChanges, storeDay, storeFlags } from './stockCheck.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const HOUSE = 'fcbc5b16';
const STORE = 'STORE-1';
// Vijay's month-end count (31 Oct 2026, 7:46 PM India time, after the 4:16 PM dispatch).
const houseCount = { id: 'recal_v', date: '2026-10-31T19:46:30.861Z', status: 'approved', items: [
  { itemId: 'chicken', actualQuantity: 1113 }, { itemId: 'chicken_cheese', actualQuantity: 75 }, { itemId: 'veg', actualQuantity: 122 },
  { itemId: 'cheese_corn', actualQuantity: 160 }, { itemId: 'paneer', actualQuantity: 0 }, { itemId: 'veg_kurkure', actualQuantity: 0 }, { itemId: 'chicken_kurkure', actualQuantity: 0 },
] };
const production = [
  { date: '2026-10-31', productionHouseId: HOUSE, approvalStatus: 'pending', chickenMomos: { final: 713 }, chickenKurkureMomos: { final: 60 } }, // before the count: not counted
  { date: '2026-11-01', productionHouseId: HOUSE, approvalStatus: 'pending', chickenMomos: { final: 800 }, chickenKurkureMomos: { final: 100 }, vegMomos: { final: 50 } },
];
const requests = [
  { storeId: STORE, status: 'delivered', shippedAt: '2026-10-31T10:46:39Z', deliveredAt: '2026-10-31T12:00:26Z', shippedQuantities: { chicken: 400, veg: 6, chickenKurkure: 60 } },
  { storeId: STORE, status: 'delivered', shippedAt: '2026-11-01T10:40:00Z', deliveredAt: '2026-11-01T11:30:00Z', shippedQuantities: { chicken: 600, chickenKurkure: 100, veg: 30 } },
  { storeId: STORE, status: 'shipped', shippedAt: '2026-11-02T10:40:00Z', shippedQuantities: { chicken: 500 } },
];

test('production: from the count, made (net of kurkure) minus sent, day by day', () => {
  const base = lastCount([houseCount, { date: '2026-08-02T01:46:34Z', items: [{ itemId: 'chicken', actualQuantity: 385 }] }]);
  assert.equal(base!.at, '2026-10-31T19:46:30');
  const nov1 = houseDay({ id: HOUSE, name: 'House', date: '2026-11-01', base, ids: [HOUSE], storeIds: [STORE], production, requests });
  assert.equal(nov1.opening.chicken, 1113); // 31 Oct's dispatch and production were before the count
  assert.equal(nov1.in.chicken, 700); // 800 made - 100 folded into kurkure
  assert.equal(nov1.out.chicken, 600);
  assert.equal(nov1.closing.chicken, 1213);
  assert.equal(nov1.closing.chickenKurkure, 0);
  assert.equal(nov1.closing.veg, 122 + 50 - 30);
  const nov2 = houseDay({ id: HOUSE, name: 'House', date: '2026-11-02', base, ids: [HOUSE], storeIds: [STORE], production, requests });
  assert.equal(nov2.opening.chicken, 1213);
  assert.equal(nov2.closing.chicken, 713); // shipped 500 (in transit counts as sent), nothing made
  const flags = houseFlags(nov2, { entries: [] }).map((f) => f.code);
  assert.deepEqual(flags, ['sent_without_entry']);
});

test('production: sent more than made shows as negative, with the momo and how many', () => {
  const base = lastCount([houseCount]);
  const big = [...requests, { storeId: STORE, status: 'delivered', shippedAt: '2026-11-01T12:00:00Z', shippedQuantities: { chickenCheese: 100 } }];
  const day = houseDay({ id: HOUSE, name: 'House', date: '2026-11-01', base, ids: [HOUSE], storeIds: [STORE], production, requests: big });
  const neg = houseFlags(day, { entries: [production[1]] }).find((f) => f.code === 'negative');
  assert.equal(neg?.momo, 'chickenCheese');
  assert.equal(neg?.n, 25);
});

test('store: from its count, received (delivery time) minus sold minus wasted; flags', () => {
  const storeCount = { date: '2026-10-31T23:15:00.000Z', status: 'pending', items: [{ itemId: 'chicken', actualQuantity: 300 }, { itemId: 'chicken_kurkure', actualQuantity: 20 }] };
  const base = lastCount([storeCount]);
  const sales = [
    { storeId: STORE, date: '2026-10-31', data: { 'Chicken Momos': 500 } }, // before the count (counted after closing): not counted
    { storeId: STORE, date: '2026-11-01', data: { 'Chicken Momos': 720, 'Chicken Kurkure Momos': 60, 'Veg Momos': 24 }, productBreakdown: [
      { productName: 'Steamed Momos Platter- Non Veg', category: 'Veg Momos', quantity: 2, pieces: 12 },
      { productName: 'Steamed Momos Platter - Veg Mix (12Pc) -O', category: 'Veg Momos', quantity: 1, pieces: 6 },
      { productName: 'Peri Peri Momo Platter', category: null, quantity: 1, pieces: 6 },
      { productName: 'Campa Cola 500Ml', category: null, quantity: 3, pieces: 18 },
      { productName: 'Veg Steamed Momos Mania Combo (8Pc Momos + 2 Burgers) -O', category: 'Veg Momos', quantity: 1, pieces: 12 },
    ] },
  ];
  const wastage = [{ storeId: STORE, date: '2026-11-01', wastage: { chicken: 6 } }];
  const day = storeDay({ id: STORE, name: 'BM1', date: '2026-11-01', base, requests, sales, wastage });
  assert.equal(day.opening.chicken, 300);
  assert.equal(day.in.chicken, 600);
  assert.equal(day.out.chicken, 720);
  assert.equal(day.wasted.chicken, 6);
  assert.equal(day.closing.chicken, 174);
  assert.equal(day.closing.veg, 30 - 24);
  const codes = storeFlags(day, { itemRecords: [sales[1]], inTransit: [], syncLog: null, sold: true }).map((f) => f.code);
  assert.deepEqual(codes, ['non_veg_as_veg', 'pieces_not_read', 'item_not_counted']); // drinks and the Mania combo are fine
  // No item list on a day with sales: momos sold aren't counted.
  const noItems = storeFlags(day, { itemRecords: [], inTransit: [requests[2]], syncLog: { stepB: { reason: 'stale' } }, sold: true });
  assert.deepEqual(noItems.map((f) => f.code), ['no_item_sales', 'not_received']);
  assert.match(noItems[1].text, /16:10/);
});

test('a store never counted says so; yesterday changed later is caught', () => {
  const day = storeDay({ id: STORE, name: 'BM1', date: '2026-11-01', base: null, requests: [], sales: [], wastage: [] });
  assert.equal(storeFlags(day, { itemRecords: [], inTransit: [], syncLog: null, sold: false })[0].code, 'no_count');
  const prev = { ...day, closing: { ...day.closing, chicken: 100 } };
  assert.match(lateChanges(prev, { ...day.closing, chicken: 160 })[0].text, /chicken 100 -> 160/);
  assert.deepEqual(lateChanges(prev, prev.closing), []);
});

test('item flags: only momo items, the "Pc" count and non veg', () => {
  assert.deepEqual(itemFlags([{ productName: 'Chicken Fried Momos [6 Pieces] -O', category: 'Chicken Momos', quantity: 3, pieces: 18 }]), []);
  assert.deepEqual(itemFlags(null), []);
  assert.equal(itemFlags([{ productName: 'Fried Momos Platter - Chicken Mix (12Pc) -O', category: 'Chicken Momos', quantity: 2, pieces: 12 }])[0].code, 'pieces_not_read');
});

console.log(`stockCheck: ${passed} tests passed`);
