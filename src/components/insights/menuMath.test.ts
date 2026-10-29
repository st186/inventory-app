// Sample orders through menuMath.ts. Run with plain node:
//   node src/components/insights/menuMath.test.ts
import assert from 'node:assert/strict';
import { buildMenu, dishKey, groupOf, styleOf } from './menuMath.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

test('the counter and the app version are one dish', () => {
  assert.equal(dishKey('Chicken Afghani Momos [6 Pieces] -O'), dishKey('Chicken Afghani Momos'));
  assert.equal(dishKey('Butter Makhni Momos Platter - Chicken Mix (12Pc) -O'), 'butter makhni momos platter chicken mix');
});

test('styles and groups from the names', () => {
  assert.equal(styleOf({ productName: 'Chicken Momos', category: 'Chicken Momos' }), 'Steamed');
  assert.equal(styleOf({ productName: 'Chilli Veg Momos', category: 'Veg Momos' }), 'Chilli');
  assert.equal(styleOf({ productName: 'Butter Makhni Chicken Momos Meal', category: 'Chicken Momos' }), 'Meal');
  assert.equal(styleOf({ productName: 'Campa Cola 200Ml', category: null }), 'Drinks');
  assert.equal(groupOf({ productName: 'Campa Water 1500Ml', category: '' }), 'Drinks');
  assert.equal(groupOf({ productName: 'Chicken Kurkure Momos', category: 'Chicken Kurkure Momos' }), 'Chicken Kurkure Momos');
});

const chicken = (q = 1, online = false) => ({ productName: `Chicken Momos${online ? ' [6 Pieces] -O' : ''}`, category: 'Chicken Momos', quantity: q, total: 100 * q });
const veg = { productName: 'Veg Momos', category: 'Veg Momos', quantity: 1, total: 80 };
const cola = { productName: 'Campa Cola 200Ml', category: null, quantity: 1, total: 20 };
const rare = { productName: 'Paneer Tandoori Momos', category: 'Paneer Momos', quantity: 1, total: 150 };

test('a sample week: plates, online share, attach rate, what goes together, the long tail', () => {
  const cur = [{ date: '2026-10-28', orders: [
    { items: [chicken(2), cola] }, { items: [chicken(), cola] }, { items: [chicken(1, true)], externalId: 'Z1' },
    { items: [chicken(), veg] }, { items: [veg, cola] }, { items: [rare] }, { items: [chicken(), veg, cola] }, { items: [chicken()] },
  ] }];
  const prev = [{ date: '2026-10-21', orders: Array.from({ length: 5 }, () => ({ items: [chicken()] })) }];
  const m = buildMenu(cur, prev);
  assert.equal(m.totals.orders, 8);
  assert.equal(m.totals.dishes, 4);
  const ch = m.dishes[0];
  assert.equal(ch.name, 'Chicken Momos');
  assert.equal(ch.plates, 7);
  assert.equal(ch.onlineShare, 14.3); // 1 of 7 plates through the apps
  assert.equal(ch.change, 40); // 5 plates the week before
  assert.equal(m.rising[0].name, 'Chicken Momos');
  assert.equal(m.attach.drinks, 50); // 4 of 8 orders had a drink
  const pair = m.pairs.find((p) => p.a === 'Chicken Momos' && p.b === 'Drinks')!;
  assert.equal(pair.orders, 3);
  assert.equal(m.tail.dishes, 3); // veg (3), cola (4) and paneer (1) under 5 plates
  assert.ok(m.styles.some((s) => s.style === 'Tandoori' && s.plates === 1));
});

test('nothing sold: no division by zero', () => {
  const m = buildMenu([], []);
  assert.equal(m.totals.orders, 0);
  assert.equal(m.attach.drinks, 0);
  assert.deepEqual(m.pairs, []);
});

console.log(`menuMath: ${passed} tests passed`);
