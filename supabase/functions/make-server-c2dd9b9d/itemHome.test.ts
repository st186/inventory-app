// Tests for itemHome.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/itemHome.test.ts
import assert from 'node:assert/strict';
import { BUILT_IN, homeElsewhere, itemHomes, settleCategory } from './itemHome.ts';
import { CATEGORY_ITEMS, STORE_CATEGORY_ITEMS } from '../../../src/utils/inventoryData.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

// The real item list on 30 Oct 2026 (the parts that matter): "Oil" was added under spices too.
const custom = [
  { itemName: 'Oil', category: 'spices_seasonings' },
  { itemName: 'Burger', category: 'bread_buns' },
  { itemName: 'Delicious Butter', category: 'dairy' },
  { itemName: 'Makhni Gravy', category: 'spices_seasonings' },
  { itemName: 'Bulk Packaging', category: 'packaging' },
  { itemName: 'Fresh Cream', category: 'dairy' },
  { itemName: 'Fresh Cream', category: 'dairy' },
  { itemName: 'Gas refill', category: 'fuel', entryType: 'overhead' },
  { itemName: 'Mystery', category: 'dairy' },
  { itemName: 'mystery ', category: 'meat' },
];
const homes = itemHomes(custom);

test('the server list is the app list', () => {
  const app: Record<string, Set<string>> = {};
  for (const lists of [CATEGORY_ITEMS, STORE_CATEGORY_ITEMS] as Record<string, readonly string[]>[]) {
    for (const [cat, names] of Object.entries(lists)) for (const n of names || []) (app[cat] ||= new Set()).add(n);
  }
  const server = Object.fromEntries(Object.entries(BUILT_IN).map(([c, n]) => [c, new Set(n)]));
  assert.deepEqual(server, app);
});

test('a known item goes under its own category, whatever was sent', () => {
  assert.deepEqual(settleCategory('Burger', 'spices_seasonings', homes), { category: 'bread_buns', moved: true }); // 27 Oct
  assert.deepEqual(settleCategory(' oil ', 'spices_seasonings', homes), { category: 'staples', moved: true });   // the built-in list wins over the stray one
  assert.deepEqual(settleCategory('Delicious Butter', 'spices_seasonings', homes), { category: 'dairy', moved: true });
  assert.deepEqual(settleCategory('Campa Cola', 'spices_seasonings', homes), { category: 'beverages', moved: true });
  assert.deepEqual(settleCategory('Burger', 'bread_buns', homes), { category: 'bread_buns', moved: false });
  assert.deepEqual(settleCategory('Burger', undefined, homes), { category: 'bread_buns', moved: true });
});

test('packaging and bulk packaging are one home', () => {
  assert.equal(settleCategory('Momo Box', 'packaging_bulk', homes).moved, false);
  assert.equal(settleCategory('Momo Box', 'packaging', homes).moved, false);
  assert.equal(settleCategory('Bulk Packaging', 'packaging_bulk', homes).moved, false); // the ₹35,000 order, 23 Mar
  assert.deepEqual(settleCategory('Momo Box', 'dairy', homes), { category: 'packaging', moved: true });
});

test('unknown names, overheads and items listed twice are left as sent', () => {
  assert.deepEqual(settleCategory('Makhani Gravy', 'meat', homes), { category: 'meat', moved: false }); // spelt unlike "Makhni Gravy"
  assert.deepEqual(settleCategory('Mystery', 'meat', homes), { category: 'meat', moved: false });
  assert.deepEqual(settleCategory('Gas refill', 'staples', homes), { category: 'staples', moved: false });
  assert.deepEqual(settleCategory('', 'dairy', homes), { category: 'dairy', moved: false });
});

test('adding an item to the list under a second category is refused', () => {
  assert.equal(homeElsewhere('Oil', 'spices_seasonings', homes), 'staples');
  assert.equal(homeElsewhere('Burger', 'spices_seasonings', homes), 'bread_buns');
  assert.equal(homeElsewhere('Burger', 'bread_buns', homes), null);
  assert.equal(homeElsewhere('Momo Tray', 'packaging_bulk', homes), null);
  assert.equal(homeElsewhere('Saffron', 'spices_seasonings', homes), null);
});

console.log(`itemHome: ${passed} passed`);
