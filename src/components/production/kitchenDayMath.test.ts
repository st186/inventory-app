// Sample days through the guided production day (kitchenDayMath.ts). Run with plain node:
//   node src/components/production/kitchenDayMath.test.ts
import assert from 'node:assert/strict';
import { ALL_ITEMS, countState, gapMatters, itemDay, itemsForDay } from './kitchenDayMath.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };
const item = (id: string) => ALL_ITEMS.find((i) => i.id === id)!;
const perKg = { chicken: 92, veg: 90, cheeseCorn: 85, dough: 82 };

test('a good day: 2 kg left, plan 750 -> make 6.5 kg; 740 momos -> about 0.5 kg should be left; counted 0.5 is fine', () => {
  const d = itemDay(item('stuffing:chicken'), { opening: 2, prepared: 6.5, closingActual: 0.5 }, { chicken: 750 }, { chicken: 740 }, perKg);
  assert.equal(d.need, 8.15);
  assert.equal(d.makeKg, 6.5);
  assert.equal(d.stillToMake, 0); // the 6.5 kg batch was it
  assert.equal(d.covers, 180);
  assert.equal(d.overMade, false);
  assert.equal(d.used, 8.04);
  assert.equal(d.shouldLeft, 0.46);
  assert.equal(gapMatters(d), false);
});

test('29 Oct as it happened: 8.88 kg there covered the plan, 8.8 kg more was made, 10 kg left', () => {
  const d = itemDay(item('stuffing:chicken'), { opening: 8.88, prepared: 8.8, closingActual: 10 }, { chicken: 750 }, { chicken: 710 }, perKg);
  assert.equal(d.makeKg, 0); // nothing needed making
  assert.equal(d.covers, 820);
  assert.equal(d.overMade, true);
  assert.equal(d.shouldLeft, 9.96); // the 10 kg left is what the extra batch explains
  assert.equal(gapMatters(d), false);
});

test('a count far from what should be left is flagged either way', () => {
  const short = itemDay(item('stuffing:chicken'), { opening: 2, prepared: 6.5, closingActual: 3 }, { chicken: 750 }, { chicken: 740 }, perKg);
  assert.equal(short.gap, 2.54);
  assert.equal(gapMatters(short), true); // more left than the momos explain: pieces not entered?
  const gone = itemDay(item('stuffing:chicken'), { opening: 9, prepared: 6, closingActual: 2 }, { chicken: 750 }, { chicken: 740 }, perKg);
  assert.equal(gapMatters(gone), true); // 6.96 should be left, 2 counted: waste not logged?
});

test('dough is planned and used by every steamed / fried momo, not kurkure', () => {
  const d = itemDay(item('dough'), { opening: 1, prepared: 10, closingActual: null }, { chicken: 650, veg: 120, cheeseCorn: 60, chickenKurkure: 100 }, { chicken: 377, chickenCheese: 240, veg: 200, cheeseCorn: 146, chickenKurkure: 120 }, perKg);
  assert.equal(d.planned, 830);
  assert.equal(d.makeKg, 9.5); // 10.12 kg needed, 1 kg there
  assert.equal(d.used, 11.74); // 963 momos / 82
  assert.equal(d.shouldLeft, 0);
});

test('13 Oct cheese corn: last weighed weeks ago must be weighed; counted last night is fine', () => {
  const last = { 'stuffing:cheeseCorn': { date: '2026-10-13', kg: 2.54, when: 'night' as const }, 'stuffing:chicken': { date: '2026-10-29', kg: 10, when: 'night' as const } };
  assert.deepEqual(countState(item('stuffing:cheeseCorn'), last, '2026-10-30'), { state: 'stale', date: '2026-10-13', kg: 2.54 });
  assert.equal(countState(item('stuffing:chicken'), last, '2026-10-30').state, 'last_night');
  assert.equal(countState(item('stuffing:paneer'), last, '2026-10-30').state, 'never');
});

test('the day shows dough, what is planned, and what is in the kitchen - not every item', () => {
  const ids = itemsForDay({ 'stuffing:cheeseCorn': { opening: 2.54, prepared: 0, closingActual: null } }, { chicken: 750, veg: 120 }, {}).map((i) => i.id);
  assert.deepEqual(ids, ['dough', 'stuffing:chicken', 'stuffing:veg', 'stuffing:cheeseCorn']);
});

test('without learnt momos per kg, no plan figures are made up', () => {
  const d = itemDay(item('stuffing:paneer'), { opening: 1, prepared: 2, closingActual: 0.4 }, { paneer: 40 }, { paneer: 40 }, {});
  assert.equal(d.need, null);
  assert.equal(d.makeKg, null);
  assert.equal(d.shouldLeft, null);
  assert.equal(gapMatters(d), false);
});

test('no momos of a type entered: all of its stuffing should still be there', () => {
  const d = itemDay(item('stuffing:cheeseCorn'), { opening: 0.6, prepared: 0, closingActual: 0.6 }, { cheeseCorn: 100 }, {}, perKg);
  assert.equal(d.used, 0);
  assert.equal(d.shouldLeft, 0.6);
  assert.equal(gapMatters(d), false);
});

console.log(`kitchenDay: ${passed} tests passed`);
