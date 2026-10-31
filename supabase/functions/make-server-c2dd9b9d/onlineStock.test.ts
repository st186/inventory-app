// Tests for onlineStock.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/onlineStock.test.ts
import assert from 'node:assert/strict';
import { cleanItemName, dayPeriods, itemKey, lastSwitchOff, offOnline, parseStockStatus, periodWords, soldStats, trackStatus } from './onlineStock.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

// The shape the Item Stock Status page reads (1 Nov 2026).
const resp = { IsSuccess: true, Result: { StockStatus: [
  { CategoryName: 'Chilli Momos - O', ProductStockStatus: [
    { ProductId: 960994, ProductName: 'Chicken Chilli Momos [6 Pieces]', InStock: false },
    { ProductId: 960995, ProductName: 'Veg Chilli Momos [6 Pieces]', InStock: false },
    { ProductId: 960996, ProductName: 'Paneer Chilli Momos [6 Pieces]', InStock: true },
  ] },
  { CategoryName: 'Addon', ProductStockStatus: [
    { ProductId: 1, ProductName: 'Chicken Steamed Momos (8 pcs) - A', InStock: false },
  ] },
  { CategoryName: 'Momo Burgers -O', ProductStockStatus: [
    { ProductId: 2, ProductName: 'Chicken Momo Burger', InStock: false },
    { ProductId: 3, ProductName: 'Veg Momo Burger', InStock: false },
  ] },
] } };
const days = [
  { date: '2026-10-31', orders: [
    { orderType: 'HomeDelivery', rawItems: [{ productName: 'Chicken Chilli Momos [6 Pieces] -O', quantity: 2, categoryName: 'Chilli Momos - O' }] },
    { orderType: 'TakeAway', rawItems: [{ productName: 'Chicken Momo Burger -O', quantity: 1 }, { productName: 'Chicken Steamed Momos (8 pcs) - A', quantity: 1, categoryName: 'Addon' }] },
  ] },
  { date: '2026-09-20', orders: [{ orderType: 'HomeDelivery', rawItems: [{ productName: 'Veg Momo Burger -O', quantity: 1 }] }] },
  { date: '2026-10-27', orders: [{ orderType: 'DineIn', rawItems: [{ productName: 'Chilli Chicken Momos', quantity: 3 }] }] },
];

test('reads the stock list', () => {
  const items = parseStockStatus(resp);
  assert.equal(items.length, 6);
  assert.deepEqual(items[0], { productId: '960994', name: 'Chicken Chilli Momos [6 Pieces]', category: 'Chilli Momos - O', inStock: false });
  assert.equal(items.filter((i) => !i.inStock).length, 5);
  assert.equal(parseStockStatus({ IsSuccess: false }).length, 0);
});

test('one key however the dish is written', () => {
  assert.equal(itemKey('Chicken Chilli Momos [6 Pieces] -O'), itemKey('Chicken Chilli Momos [6 Pieces]'));
  assert.equal(itemKey('Chilli Chicken Momos'), itemKey('Chicken Chilli Momos [6 Pieces]'));
  assert.equal(itemKey('Fried Chicken Cheese Momos Burger (2 pcs) - A.'), itemKey('Fried Chicken Cheese Momo Burger'));
  assert.notEqual(itemKey('Chicken Momo Burger'), itemKey('Fried Chicken Momo Burger [2 Pieces]'));
  assert.notEqual(itemKey('Chicken Chilli Momos [6 Pieces]'), itemKey('Chicken Chilli Momos Mania Combo (8Pc Momos + 2 Burgers)'));
  assert.equal(itemKey('Peri Peri Momos Platter - Veg Mix (12Pc) -O'), itemKey('Peri Peri Momos Platter - Veg Mix (12Pc)'));
});

test('flags what still sells; old and kept-off items are not flagged', () => {
  const stats = soldStats(days, '2026-11-01');
  const r = offOnline(parseStockStatus(resp), stats, { '3': { by: 'owner' } }, '2026-11-01');
  assert.equal(r.off, 5);
  assert.deepEqual(r.sells.map((s) => s.name), ['Chicken Chilli Momos [6 Pieces]', 'Chicken Momo Burger']);
  assert.equal(r.sells[0].lastOnline, '2026-10-31');
  assert.equal(r.sells[0].lastCounter, '2026-10-27'); // the old counter name counts
  assert.equal(r.sells[1].lastCounter, '2026-10-31');
  assert.deepEqual(r.kept.map((s) => s.name), ['Veg Momo Burger']);
  assert.equal(r.idle, 2); // Veg Chilli (never sold) and the old 8-piece add-on
});

test('a sale too long ago does not flag', () => {
  const stats = soldStats([{ date: '2026-09-20', orders: [{ orderType: 'HomeDelivery', rawItems: [{ productName: 'Chicken Momo Burger -O', quantity: 1 }] }] }], '2026-11-01');
  const r = offOnline(parseStockStatus(resp), stats, {}, '2026-11-01');
  assert.equal(r.sells.length, 0);
});

test('when it was last switched off, and by whom', () => {
  const rows = [
    { type: 'Stock-In', platform: 'Swiggy', UserName: 'Subham Tewari', CreatedOn: '2026-10-30T17:59:00' },
    { type: 'Stock-Out', platform: 'Swiggy', UserName: 'Subham Tewari', CreatedOn: '2026-10-28T18:28:00' },
    { type: 'Stock-Out', platform: 'Swiggy', UserName: 'Subham Tewari', CreatedOn: '2026-10-31T19:02:10' },
    { type: 'Stock-Out', platform: 'Zomato', UserName: 'Subham Tewari', CreatedOn: '2026-10-31T19:02:40' },
  ];
  assert.deepEqual(lastSwitchOff(rows), { at: '2026-10-31T13:32:40.000Z', by: 'Subham Tewari', platforms: ['Zomato', 'Swiggy'] });
  assert.deepEqual(lastSwitchOff([]), { at: null, by: null, platforms: [] });
});

test('the 3-minute look: off from when it was first seen off to when it was seen back on', () => {
  const off = (id: string, inStock: boolean) => ({ productId: id, name: `Item ${id}`, category: 'C', inStock });
  let day = trackStatus(null, '2026-11-01', [off('a', true), off('b', false)], '2026-11-01T09:30:00.000Z');
  day = trackStatus(day, '2026-11-01', [off('a', false), off('b', false)], '2026-11-01T13:33:00.000Z');
  day = trackStatus(day, '2026-11-01', [off('a', true), off('b', false)], '2026-11-01T14:00:00.000Z');
  day = trackStatus(day, '2026-11-01', [off('a', false), off('b', false)], '2026-11-01T16:00:00.000Z');
  assert.deepEqual(day.items.a.periods, [{ from: '2026-11-01T13:33:00.000Z', to: '2026-11-01T14:00:00.000Z' }, { from: '2026-11-01T16:00:00.000Z', to: null }]);
  assert.deepEqual(day.items.b.periods, [{ from: '2026-11-01T09:30:00.000Z', to: null }]);
  // A new day starts empty.
  assert.deepEqual(trackStatus(day, '2026-11-02', [off('a', true)], '2026-11-02T09:30:00.000Z').items, {});
});

test("the day's off stretches from the item log", () => {
  // Chicken Chilli Momos (1 Nov 2026): off 28 Oct 6:28 PM, on 30 Oct 5:59 PM, off 31 Oct 7:02 PM.
  const rows = [
    { type: 'Stock-Out', platform: 'Swiggy', UserName: 'Subham Tewari', CreatedOn: '2026-10-28T18:28:00' },
    { type: 'Stock-Out', platform: 'Zomato', UserName: 'Subham Tewari', CreatedOn: '2026-10-28T18:28:30' },
    { type: 'Stock-In', platform: 'Swiggy', UserName: 'Subham Tewari', CreatedOn: '2026-10-30T17:59:00' },
    { type: 'Stock-In', platform: 'Zomato', UserName: 'Subham Tewari', CreatedOn: '2026-10-30T17:59:20' },
    { type: 'Stock-Out', platform: 'Swiggy', UserName: 'Subham Tewari', CreatedOn: '2026-10-31T19:02:10' },
    { type: 'Stock-Out', platform: 'Zomato', UserName: 'Subham Tewari', CreatedOn: '2026-10-31T19:02:40' },
  ];
  assert.deepEqual(dayPeriods(rows, '2026-10-31'), [{ from: '2026-10-31T13:32:10.000Z', to: null, by: 'Subham Tewari', platforms: ['Swiggy', 'Zomato'] }]);
  assert.deepEqual(dayPeriods(rows, '2026-10-30').map((p) => [p.from, p.to]), [['2026-10-28T12:58:00.000Z', '2026-10-30T12:29:00.000Z']]);
  assert.equal(dayPeriods(rows, '2026-10-27').length, 0);
  assert.equal(dayPeriods(rows, '2026-11-01').length, 1); // still off the next day
});

test('the times in words', () => {
  const p = (from: string | null, to: string | null) => ({ from, to, by: null, platforms: [] });
  assert.equal(periodWords(p('2026-10-31T13:32:10.000Z', null), '2026-10-31'), 'from 7:02 PM, still off at closing');
  assert.equal(periodWords(p('2026-10-31T13:32:10.000Z', null), '2026-11-01'), 'since 31 Oct 7:02 PM, all day');
  assert.equal(periodWords(p('2026-10-31T13:32:10.000Z', '2026-10-31T15:45:00.000Z'), '2026-10-31'), '7:02 PM to 9:15 PM');
  assert.equal(periodWords(p('2026-10-28T12:58:00.000Z', '2026-10-30T12:29:00.000Z'), '2026-10-30'), 'since 28 Oct 6:28 PM, back on at 5:59 PM');
  assert.equal(periodWords(p(null, null), '2026-10-31'), 'off (since when is not known)');
  assert.equal(cleanItemName('Chicken Momo Burger -O'), 'Chicken Momo Burger');
  assert.equal(cleanItemName('Fried Veg Momos Burger (2 pcs) - A.'), 'Fried Veg Momos Burger (2 pcs)');
});

console.log(`onlineStock: ${passed} tests passed`);
