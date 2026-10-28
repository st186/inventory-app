// Tests for running low and shopping lists. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/suppliesRules.test.ts
import assert from 'node:assert/strict';
import { alertRecipients, deliverAt, itemKey, linesPreview, listProgress, placeOf } from './suppliesRules.ts';

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

console.log(`suppliesRules: ${n} tests passed`);
