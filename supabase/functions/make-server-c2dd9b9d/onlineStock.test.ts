// Tests for onlineStock.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/onlineStock.test.ts
import assert from 'node:assert/strict';
import { itemKey, lastSwitchOff, offOnline, parseStockStatus, soldStats } from './onlineStock.ts';

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

console.log(`onlineStock: ${passed} tests passed`);
