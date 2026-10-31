// Tests for itemNameReview.ts with an in-memory store and a stand-in Bunny. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/itemNameReview.test.ts
import assert from 'node:assert/strict';
import { decideName, itemLike, reviewNewName, settleName, type NameReviewDeps } from './itemNameReview.ts';
import type { KnownItem } from './itemNames.ts';

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, async () => { await fn(); }]);

const known: KnownItem[] = [
  { name: 'Paneer', category: 'dairy', type: 'inventory' },
  { name: 'Tomato Sauce', category: 'spices_seasonings', type: 'inventory' },
  { name: 'Duster', category: 'cleaning_supplies', type: 'overhead' },
  { name: 'Tea', category: 'evening_snacks', type: 'overhead' },
  { name: 'Toto', category: null, type: 'overhead' },
  { name: 'Ladle', category: 'utensils', type: 'overhead' },
];
const none = new Map<string, KnownItem>();

test('at save: a misspelt or Bengali name is filed under the known one, typed name kept', () => {
  assert.deepEqual(settleName('Panner', 'inventory', 'dairy', known, none), { name: 'Paneer', category: 'dairy', typedAs: 'Panner', how: 'spelling' });
  assert.deepEqual(settleName('Cha', 'overhead', 'staff_welfare', known, none), { name: 'Tea', category: 'evening_snacks', typedAs: 'Cha', how: 'word' });
  assert.deepEqual(settleName('Dastar', 'overhead', 'utensils', known, none), { name: 'Duster', category: 'cleaning_supplies', typedAs: 'Dastar', how: 'spelling' });
  // Toto keeps the category sent: goods transport or travel.
  assert.deepEqual(settleName('toto', 'overhead', 'travel', known, none), { name: 'Toto', category: 'travel', typedAs: 'toto', how: 'same' });
  // Known and written right: nothing changes. Unknown: left as typed.
  assert.deepEqual(settleName('Paneer', 'inventory', 'dairy', known, none), { name: 'Paneer', category: 'dairy' });
  assert.deepEqual(settleName('Hata', 'overhead', 'utensils', known, none), { name: 'Hata', category: 'utensils' });
  // A decided alias wins.
  assert.equal(settleName('Hata', 'overhead', 'utensils', known, new Map([['hata', { name: 'Ladle', category: 'utensils', type: 'overhead' }]])).name, 'Ladle');
});

test('only item-like names are checked', () => {
  assert.equal(itemLike('inventory', 'dairy', 'Panner'), true);
  assert.equal(itemLike('overhead', 'utensils', 'Hata'), true);
  assert.equal(itemLike('overhead', 'repair', 'Fridge door'), false);         // a description, not an item
  assert.equal(itemLike('overhead', 'utensils', 'Steel dabba for the red sauce at the counter'), false);
});

function fakeDeps(bunny: { sameAs: string; confident: boolean; cleanName: string }) {
  const store = new Map<string, any>();
  const sent: string[] = [];
  const added: any[] = [];
  const deps: NameReviewDeps = {
    kv: { get: async (k) => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); } },
    rows: async (prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
    known: async () => known,
    ownerIds: async () => ['owner-login'],
    notifyUser: async (_id, _type, title, message) => { sent.push(`${title}: ${message}`); },
    askBunny: async () => bunny,
    addToList: async (it) => { added.push(it); known.push({ name: it.itemName, category: it.category, type: it.entryType }); },
    categoryLabel: (c) => c,
  };
  return { deps, store, sent, added };
}
const hataRow = { date: '2026-10-30', category: 'utensils', description: 'Hata', amount: 100, storeId: 'STORE-1' };

test('Bunny sure it is the same: the entry moves, the alias is kept, the owner is not asked', async () => {
  const { deps, store, sent } = fakeDeps({ sameAs: 'Ladle', confident: true, cleanName: 'Ladle (hata)' });
  store.set('overhead:u:1', { ...hataRow });
  await reviewNewName(deps, { key: 'overhead:u:1', type: 'overhead', row: hataRow, by: 'Rohan', byOwner: false });
  assert.equal(store.get('overhead:u:1').description, 'Ladle');
  assert.equal(store.get('overhead:u:1').typedAs, 'Hata');
  assert.equal(store.get('item-alias:hata').name, 'Ladle');
  assert.equal(sent.length, 0);
});

test('Bunny not sure: the name waits for the owner, once, with every entry', async () => {
  const { deps, store, sent } = fakeDeps({ sameAs: '', confident: false, cleanName: 'Cobweb brush (jhul jhara)' });
  const row = { date: '2026-10-30', category: 'cleaning_supplies', description: 'Jhul jhara lathi', amount: 120, storeId: 'STORE-1' };
  await reviewNewName(deps, { key: 'overhead:u:2', type: 'overhead', row, by: 'Rohan', byOwner: false });
  await reviewNewName(deps, { key: 'overhead:u:3', type: 'overhead', row: { ...row, date: '2026-11-02' }, by: 'Rohan', byOwner: false });
  const w = store.get('item-name:jhul jhara lathi');
  assert.equal(w.status, 'open');
  assert.equal(w.cleanName, 'Cobweb brush (jhul jhara)');
  assert.deepEqual(w.entries.map((e: any) => e.key), ['overhead:u:2', 'overhead:u:3']);
  assert.equal(sent.length, 1);
  // The owner's own new names aren't queued.
  await reviewNewName(deps, { key: 'overhead:o:1', type: 'overhead', row: { ...row, description: 'Mop stick' }, by: 'Owner', byOwner: true });
  assert.equal(store.get('item-name:mop stick'), undefined);
});

test('the owner decides: a new item, the same as one, or leave it', async () => {
  const { deps, store, added } = fakeDeps({ sameAs: '', confident: false, cleanName: '' });
  const row = { date: '2026-10-30', category: 'cleaning_supplies', description: 'Jhul jhara lathi', amount: 120 };
  store.set('overhead:u:2', { ...row });
  store.set('item-name:jhul jhara lathi', { key: 'jhul jhara lathi', name: 'Jhul jhara lathi', type: 'overhead', category: 'cleaning_supplies', entries: [{ key: 'overhead:u:2' }], status: 'open' });
  const r = await decideName(deps, 'jhul jhara lathi', { action: 'new', name: 'Cobweb brush (jhul jhara)', category: 'cleaning_supplies', by: 'Owner' });
  assert.equal(r.record.status, 'added');
  assert.deepEqual(added[0], { itemName: 'Cobweb brush (jhul jhara)', category: 'cleaning_supplies', entryType: 'overhead', entityType: undefined });
  assert.equal(store.get('overhead:u:2').description, 'Cobweb brush (jhul jhara)');
  assert.equal(store.get('item-alias:jhul jhara lathi').name, 'Cobweb brush (jhul jhara)');
  assert.equal((await decideName(deps, 'jhul jhara lathi', { action: 'keep', by: 'Owner' })).error, 'That name was already decided');

  store.set('inventory:u:9', { itemName: 'Pnir', category: 'dairy', totalCost: 400 });
  store.set('item-name:pnir', { key: 'pnir', name: 'Pnir', type: 'inventory', category: 'dairy', entries: [{ key: 'inventory:u:9' }], status: 'open' });
  assert.equal((await decideName(deps, 'pnir', { action: 'same', name: 'Paneer', by: 'Owner' })).record.status, 'merged');
  assert.equal(store.get('inventory:u:9').itemName, 'Paneer');
  assert.equal(store.get('inventory:u:9').typedAs, 'Pnir');

  store.set('item-name:ghee', { key: 'ghee', name: 'Ghee', type: 'inventory', category: 'dairy', entries: [], status: 'open' });
  assert.equal((await decideName(deps, 'ghee', { action: 'keep', by: 'Owner' })).record.status, 'kept');
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; }
}
console.log(`itemNameReview: ${passed} passed`);
