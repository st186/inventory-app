// Tests for running low and shopping lists. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/suppliesRules.test.ts
import assert from 'node:assert/strict';
import { alertRecipients, amountFix, amountIssue, deliverAt, itemKey, learnSpecs, learnVendorItems, linesPreview, listProgress, placeOf, qtyLabel, vendorForItem } from './suppliesRules.ts';

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; };

const places = { stores: new Set(['S1']), houses: new Set(['H1']), storeHouse: new Map([['S1', 'H1']]) };

test('item names match ignoring case and punctuation', () => {
  assert.equal(itemKey('KOT  Rolls!'), itemKey('kot rolls'));
  assert.equal(itemKey('Washing-Powder'), 'washing powder');
  assert.notEqual(itemKey('Washing Bar'), itemKey('Washing Powder'));
});

test('where someone works', () => {
  assert.deepEqual(placeOf({ designation: 'store_ops', storeId: 'S1' }, places), { kind: 'store', id: 'S1' });
  // Production staff go to their house, even with a store id on the record.
  assert.deepEqual(placeOf({ designation: 'production_ops', storeId: 'S1' }, places), { kind: 'production', id: 'H1' });
  assert.deepEqual(placeOf({ designation: 'production_incharge', storeId: 'H1', assignedProductionHouseIds: ['H1'] }, places), { kind: 'production', id: 'H1' });
  assert.equal(placeOf({ role: 'cluster_head' }, places), null);
});

test('who hears about a flag', () => {
  const staff = [
    { employeeId: 'O', role: 'cluster_head', authUserId: 'o' },
    { employeeId: 'A', role: 'manager', designation: 'operations_incharge', storeId: 'S1', authUserId: 'a' },
    { employeeId: 'R', role: 'manager', designation: 'store_incharge', storeId: 'S1', authUserId: 'r' },
    { employeeId: 'V', role: 'manager', designation: 'production_incharge', storeId: 'H1', assignedProductionHouseIds: ['H1'], authUserId: 'v' },
    { employeeId: 'C', role: 'employee', designation: 'store_ops', storeId: 'S1', authUserId: 'c' },
  ];
  assert.deepEqual(alertRecipients(staff, { kind: 'store', id: 'S1' }, 'C').map((e) => e.employeeId), ['O', 'A', 'R']);
  assert.deepEqual(alertRecipients(staff, { kind: 'production', id: 'H1' }, 'C').map((e) => e.employeeId), ['O', 'A', 'V']);
  // The incharge raising it does not hear about it themselves.
  assert.deepEqual(alertRecipients(staff, { kind: 'store', id: 'S1' }, 'R').map((e) => e.employeeId), ['O', 'A']);
});

test('a list reaches the shopper when their quiet hours end', () => {
  const prefs = { quietOn: true, quietFrom: '23:00', quietTo: '07:00' };
  const at = (ist: string) => Date.parse(`${ist}+05:30`);
  assert.equal(deliverAt(prefs, at('2026-10-28T22:30:00')), at('2026-10-28T22:30:00'));
  assert.equal(deliverAt(prefs, at('2026-10-28T23:40:20')), at('2026-10-29T07:00:00'));
  assert.equal(deliverAt(prefs, at('2026-10-29T05:15:00')), at('2026-10-29T07:00:00'));
  assert.equal(deliverAt({ ...prefs, quietOn: false }, at('2026-10-28T23:40:00')), at('2026-10-28T23:40:00'));
});

test('how far a list has got', () => {
  const lines: any[] = [
    { item: 'Onion', qty: 5, unit: 'kg', got: { qty: 5, at: '' }, logged: { kind: 'inventory', id: 'x', at: '' } },
    { item: 'Tomato', qty: 3, unit: 'kg', got: { qty: 2, at: '' } },
    { item: 'Paneer', qty: 2, unit: 'kg', missing: true },
    { item: 'Butter', qty: 1, unit: 'kg' },
    { item: 'Foil', qty: 2, unit: 'pcs' },
  ];
  assert.deepEqual(listProgress({ lines }), { total: 5, got: 2, missing: 1, left: 2, toLog: 1 });
  assert.equal(linesPreview(lines, 2), 'Onion 5 kg, Tomato 3 kg (+3 more)');
});

test('which vendor an item comes from, and learning from a saved list', () => {
  const v = (id: string, items: string[]) => ({ id, name: id, items, createdAt: '', updatedAt: '' });
  const vendors = [v('veg', ['Ginger', 'Garlic']), v('kali', ['Ajinomoto']), v('butter', ['Butter'])];
  assert.equal(vendorForItem(vendors, 'ginger'), 'veg');
  assert.equal(vendorForItem(vendors, 'Onion'), null);
  // Onion goes to the vegetable vendor from now on; garlic moves to Kalimata; a line with no vendor changes nothing.
  const changed = learnVendorItems(vendors, [
    { item: 'Onion', vendorId: 'veg' }, { item: 'garlic', vendorId: 'kali' }, { item: 'Butter', vendorId: null }, { item: 'Ginger', vendorId: 'gone' },
  ]);
  assert.deepEqual(changed.map((c) => [c.id, c.items]).sort(), [['kali', ['Ajinomoto', 'garlic']], ['veg', ['Ginger', 'Onion']]]);
  assert.deepEqual(vendors[0].items, ['Ginger', 'Garlic']); // the originals are not changed
  assert.equal(learnVendorItems(vendors, [{ item: 'Ginger', vendorId: 'veg' }]).length, 0);
});

test('pack sizes: labels and remembering how an item was written', () => {
  assert.equal(qtyLabel({ qty: 2, unit: 'packet', packSize: 1, packUnit: 'L' }), '2 packets × 1 L');
  assert.equal(qtyLabel({ qty: 400, unit: 'g' }), '400 g');
  assert.equal(linesPreview([{ item: 'Oil', qty: 2, unit: 'packet', packSize: 1, packUnit: 'L' }]), 'Oil 2 packets × 1 L');
  const specs = learnSpecs({ oil: { item: 'Oil', qty: 2, unit: 'pcs', at: 'a' } }, [
    { item: 'oil', qty: 3, unit: 'packet', packSize: 1, packUnit: 'L' }, { item: 'Ginger', qty: 400, unit: 'g', packSize: 5, packUnit: 'kg' }, { item: 'Salt', qty: 0, unit: 'kg' },
  ], 'b');
  assert.deepEqual(specs.oil, { item: 'oil', qty: 3, unit: 'packet', packSize: 1, packUnit: 'L', at: 'b' });
  assert.deepEqual(specs.ginger, { item: 'Ginger', qty: 400, unit: 'g', at: 'b' }); // no pack size on a weight
  assert.equal(specs.salt, undefined);
});

test('expense amounts that do not say how much', () => {
  const e = (name: string, qty: number, unit: string, category = 'staples', piecesPerCarton?: number, weightEachGrams?: number) => amountIssue({ name, qty, unit, category, piecesPerCarton, weightEachGrams });
  assert.match(e('Butter', 8, 'pcs', 'dairy') || '', /doesn't say how big each pack is/);
  assert.match(e('Chicken 65 masala', 3, 'pcs', 'spices_seasonings') || '', /each pack/);
  assert.match(e('Oil', 2, 'packet') || '', /how big each packet is/);
  assert.match(e('Carrot', 1, 'pcs', 'fresh_produce') || '', /by weight/);
  assert.match(e('Cabbage', 2, 'bundle', 'fresh_produce') || '', /only leafy herbs/);
  assert.match(e('Coriander Leaves', 2, 'pcs', 'fresh_produce') || '', /bundles or the weight/);
  // Clear amounts.
  for (const ok of [e('Butter', 2, 'kg', 'dairy'), e('Oil', 2, 'L'), e('Coriander Leaves', 2, 'bundle', 'fresh_produce'), e('Coriander Leaves', 400, 'g', 'fresh_produce'),
    e('Lemon', 6, 'pcs', 'fresh_produce'), e('Maida', 10, 'kg'), e('Burger buns', 2, 'pcs', 'bread_buns'), e('Butter Paper', 2, 'pcs', 'packaging'),
    e('Foil', 1, 'pcs', 'packaging'), e('Cheese slices', 2, 'pcs', 'dairy', 20),
    e('Aromatic Powder', 10, 'pcs', 'spices_seasonings', undefined, 500), e('Butter', 8, 'pcs', 'dairy', undefined, 500)]) assert.equal(ok, null);
  // The fix, from how the item was last written on a shopping list.
  assert.deepEqual(amountFix(8, 840, { item: 'Butter', qty: 2, unit: 'packet', packSize: 500, packUnit: 'g', at: '' }), { quantity: 4, unit: 'kg', costPerUnit: 210, text: '8 × 500 g = 4 kg' });
  assert.equal(amountFix(8, 840, null), null);
});

console.log(`suppliesRules: ${n} tests passed`);
