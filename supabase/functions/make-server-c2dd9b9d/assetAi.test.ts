// Tests for Bunny's word on equipment names (assetRules.ts isEquipment / askableForAi, planReconcile
// with verdicts). Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/assetAi.test.ts
import assert from 'node:assert/strict';
import { aiNameKey, askableForAi, isEquipment, planReconcile, type AiVerdict } from './assetRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

// Rohan's store, 30 Oct 2026 (added by the owner on 31 Oct).
const store = 'STORE-1766938921191-9LCH05';
const brush = { id: 'b', date: '2026-10-30', category: 'cleaning_supplies', description: 'Tar brush x2 (wire brush for deep cleaning)', amount: 70, storeId: store, entityType: 'store' };
const hata = { id: 'h', date: '2026-10-30', category: 'utensils', description: 'Hata', amount: 100, storeId: store, entityType: 'store' };
const lathi = { id: 'l', date: '2026-10-30', category: 'cleaning_supplies', description: 'Jhul jhara lathi', amount: 120, storeId: store, entityType: 'store' };
const nirma = { id: 'n', date: '2026-10-27', category: 'cleaning_supplies', description: 'Nirma', amount: 20, storeId: store, entityType: 'store' };
const ladle = { id: 'x', date: '2026-10-30', category: 'utensils', description: 'Steel ladle', amount: 150, storeId: store, entityType: 'store' };
const chicken = { id: 'c', date: '2026-10-30', category: 'meat', itemName: 'Chicken', totalCost: 3000, quantity: 10, storeId: store };
const taxi = { id: 't', date: '2026-10-30', category: 'transportation', description: 'Toto', amount: 100, storeId: store, entityType: 'store' };

const verdicts = new Map<string, AiVerdict>([
  [aiNameKey('Tar brush x2 (wire brush for deep cleaning)'), { equipment: false, category: 'cleaning', why: 'wears out in weeks' }],
  [aiNameKey('Hata'), { equipment: true, category: 'utensils_pans', why: 'a ladle, used daily for months' }],
  [aiNameKey('Jhul jhara lathi'), { equipment: true, category: 'cleaning', why: 'a cobweb brush on a stick' }],
  [aiNameKey('Nirma'), { equipment: false, category: 'cleaning', why: 'detergent' }],
]);

test('what is asked: names the keywords cannot judge, outside food, packaging and running costs', () => {
  assert.equal(askableForAi(hata, 'overhead'), true);
  assert.equal(askableForAi(lathi, 'overhead'), true);
  assert.equal(askableForAi(ladle, 'overhead'), false);   // the keywords already know a ladle
  assert.equal(askableForAi(chicken, 'inventory'), false); // food
  assert.equal(askableForAi(taxi, 'overhead'), false);     // transport is never equipment
  assert.equal(askableForAi({ ...brush, description: 'Garbage bags' }, 'overhead'), false); // an obvious consumable
});

test('Bunny\'s kept answer decides those names', () => {
  assert.equal(isEquipment(hata, 'overhead', verdicts), true);
  assert.equal(isEquipment(lathi, 'overhead', verdicts), true);
  assert.equal(isEquipment(brush, 'overhead', verdicts), false);
  assert.equal(isEquipment(hata, 'overhead'), false);             // no answers: the keywords alone
  assert.equal(isEquipment(ladle, 'overhead', new Map()), true);   // the keywords still work
  assert.equal(aiNameKey('  Jhul  Jhara-Lathi '), 'jhul jhara lathi');
});

test('reconcile lists them for review, with Bunny\'s category and why', () => {
  const plan = planReconcile({ purchases: [chicken], overheads: [brush, hata, lathi, nirma, taxi], assets: [], fromDate: '2026-10-27', now: '2026-10-31T10:00:00Z', by: 'From expenses', verdicts });
  assert.deepEqual(plan.create.map((a) => a.name).sort(), ['Hata', 'Jhul jhara lathi']);
  const h = plan.create.find((a) => a.name === 'Hata')!;
  assert.equal(h.category, 'utensils_pans');
  assert.equal(h.needsReview, true);
  assert.equal(h.source.aiWhy, 'a ladle, used daily for months');
  // The next run keeps them (the answer is kept), and drops nothing.
  const again = planReconcile({ purchases: [chicken], overheads: [brush, hata, lathi, nirma, taxi], assets: plan.create, fromDate: '2026-10-27', now: '2026-10-31T11:00:00Z', by: 'From expenses', verdicts });
  assert.equal(again.create.length, 0);
  assert.equal(again.remove.length, 0);
});

console.log(`assetAi: ${passed} passed`);
