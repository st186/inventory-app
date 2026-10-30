// Tests for burgerCheck.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/burgerCheck.test.ts
import assert from 'node:assert/strict';
import { burgersInLine, checkBurgers, isBurgerPurchase, salesByDay } from './burgerCheck.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

test('burger lines: standalone, 2 pieces, mania addon, combo addon; combo lines and non-burgers skipped', () => {
  assert.deepEqual(burgersInLine('Chicken Momo Burger', 'Chicken Momo Burgers', 2), { kind: 'standalone', n: 2 });
  assert.deepEqual(burgersInLine('Fried Chicken Momos Burger [2 Pieces]  -O', 'Momo Burgers  -O', 1), { kind: 'standalone', n: 2 });
  assert.deepEqual(burgersInLine('Fried Chicken Momos Burger (2 pcs) - A', 'Addon', 1), { kind: 'mania', n: 2 });
  assert.deepEqual(burgersInLine('1 Chicken Burger', 'Addon', 1), { kind: 'combo', n: 1 });
  assert.equal(burgersInLine('Chicken Pan Fried Momos Mania Combo (8Pc Momos + 2 Burgers) -O', 'Bunny Momos Non Veg Combos  -O', 1), null);
  assert.equal(burgersInLine('Chicken Steamed Momos', 'Momos', 3), null);
  assert.equal(burgersInLine('Chicken Momo Burger', 'X', 0), null);
});

test('sales by day from POS order records', () => {
  const s = salesByDay([{ date: '2026-10-29', orders: [
    { rawItems: [{ productName: 'Chicken Pan Fried Momos Mania Combo (8Pc Momos + 2 Burgers) -O', categoryName: 'Combos', quantity: 1 },
      { productName: 'Fried Chicken Momos Burger (2 pcs) - A', categoryName: 'Addon', quantity: 1 }] },
    { rawItems: [{ productName: 'Veg Momo Burger @ 59', categoryName: 'Veg Momo Burger', quantity: 1 }, { productName: '1 Veg Burger', categoryName: 'Addon', quantity: 1 }] },
  ] }]);
  assert.deepEqual(s['2026-10-29'], { standalone: 1, mania: 2, combo: 1 });
});

test('meals: one burger each - the counter meal its own line (not twice), the online meal without one', () => {
  const s = salesByDay([{ date: '2026-10-28', orders: [
    { rawItems: [{ productName: 'Steamed Chicken Momos Meal', categoryName: 'Momo Meal (6Pm+1Nvb+1Cd)', quantity: 1 }, { productName: '1 Chicken Burger', categoryName: 'Addon', quantity: 1 }] },
    { rawItems: [{ productName: 'Fried Momo Meal (Chicken) -O', categoryName: 'Non-Veg Meals - O', quantity: 2 }] },
    { rawItems: [{ productName: 'Chicken Steamed Momos', categoryName: 'Momos', quantity: 1 }] },
  ] }]);
  assert.deepEqual(s['2026-10-28'], { standalone: 0, mania: 0, combo: 3 });
});

test('purchases named burger (buns) only', () => {
  assert.ok(isBurgerPurchase({ itemName: ' Burger ' }) && isBurgerPurchase({ itemName: 'burger buns' }));
  assert.ok(!isBurgerPurchase({ itemName: 'Burger box' }) && !isBurgerPurchase({}));
});

const day = (d: string, n: number) => [d, { standalone: n, mania: 0, combo: 0 }] as const;

test('the check: totals, packets of 2, weeks, sold-more and bought-more, odd entries', () => {
  const sales = Object.fromEntries([day('2026-10-24', 10), day('2026-10-28', 12), day('2026-10-30', 3), day('2026-10-10', 5)]);
  const purchases = [{ date: '2026-10-25', quantity: 4, category: 'bread_buns', unit: 'pcs' }, { date: '2026-10-27', quantity: 4, category: 'spices_seasonings', unit: 'pcs' }];
  const c = checkBurgers({ purchases, sales, since: '2026-10-01', today: '2026-10-30', bunsPerUnit: 2 });
  assert.equal(c.bought, 16);
  assert.deepEqual(c.sold, { standalone: 30, mania: 0, combo: 0, total: 30 });
  // oldest first: 15 sold with no bun (10 Oct, 24 Oct), the 25th's 8 then 4 of the 27th's used on the 28th, 1 used on the 30th
  assert.equal(c.left, 1);
  assert.equal(c.short, 15);
  assert.equal(c.stale, 0);
  assert.deepEqual(c.weeks[0], { from: '2026-10-24', to: '2026-10-30', bought: 16, sold: 25 });
  assert.deepEqual(c.anomalies.map((a) => a.kind), ['sold-more', 'odd-entry']); // 25 sold > 16 x 1.2 + 4
  assert.match(c.anomalies[1].text, /under "spices_seasonings"/);
  // Pack size not given yet: no sold/bought alerts (they'd be off by the pack size), odd entries still
  assert.deepEqual(checkBurgers({ purchases, sales, since: '2026-10-01', today: '2026-10-30', bunsPerUnit: null }).anomalies.map((a) => a.kind), ['odd-entry']);
  const lots = checkBurgers({ purchases: [{ date: '2026-10-20', quantity: 20, category: 'bread_buns', unit: 'pcs' }], sales: {}, since: '2026-10-01', today: '2026-10-30', bunsPerUnit: 2 });
  assert.deepEqual(lots.anomalies.map((a) => a.kind), ['bought-more']);
  assert.equal(lots.stale, 40);
  // bought two days ago and not sold yet: in stock, not waste
  const fresh = checkBurgers({ purchases: [{ date: '2026-10-28', quantity: 8, category: 'bread_buns', unit: 'pcs' }], sales: {}, since: '2026-10-01', today: '2026-10-30', bunsPerUnit: 4 });
  assert.deepEqual(fresh.anomalies, []);
  assert.equal(fresh.left, 32);
});

console.log(`burgerCheck: ${passed} tests passed`);
