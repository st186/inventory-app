// Tests for leftoverRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/leftoverRules.test.ts
import assert from 'node:assert/strict';
import { checkNewReason, cleanWithLeftover, leftoverLines, piecesPerKg, poolLabel, reasonsText, uncountedPools, withLeftoverLines } from './leftoverRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

// 29 Oct at the production house, as Vijay closed it.
const day29 = {
  dough: { opening: 11, prepared: 0, closingActual: null },
  'stuffing:chicken': { opening: 8.88, prepared: 8.8, closingActual: 10 },
  'stuffing:veg': { opening: 0, prepared: 4.46, closingActual: null },
  'stuffing:cheeseCorn': { opening: 2.54, prepared: 0, closingActual: null },
  'stuffing:paneer': { opening: 0, prepared: 0, closingActual: null },
};

test('every carried-over or made item must be counted', () => {
  assert.deepEqual(uncountedPools(day29, { 'stuffing:chicken': 10 }), ['dough', 'stuffing:veg', 'stuffing:cheeseCorn']);
  assert.deepEqual(uncountedPools(day29, { dough: 0, 'stuffing:chicken': 10, 'stuffing:veg': 0.4, 'stuffing:cheeseCorn': 2.5 }), []);
  assert.equal(poolLabel('stuffing:cheeseCorn'), 'Cheese corn stuffing');
  assert.equal(poolLabel('dough'), 'Dough (shared)');
});

test('the leftover line: how much, from what, momos it could have made, made while some was there', () => {
  const [line] = leftoverLines(day29, { chickenMomos: 710 }, { chicken: 92 });
  assert.equal(line, 'Chicken stuffing: 10 kg left of 17.68 kg (8.88 kg from yesterday + 8.8 kg made today); 7.68 kg used for 710 momos. 10 kg is about 920 momos. 8.8 kg was made while 8.88 kg from yesterday was still there.');
  // Under half a kilo isn't flagged.
  assert.deepEqual(leftoverLines({ 'stuffing:veg': { opening: 0, prepared: 4, closingActual: 0.3 } }, {}, {}), []);
});

test('pieces per kg from recent days (median, days with at least 1 kg used)', () => {
  const day = (opening: number, prepared: number, closing: number, pieces: number) => ({ pools: { 'stuffing:chicken': { opening, prepared, closingActual: closing } }, pieces: { chickenMomos: pieces } });
  assert.deepEqual(piecesPerKg([day(0, 8, 0, 720), day(0, 10, 2, 760), day(2, 6, 0, 800), day(0, 0.5, 0, 50)]), { chicken: 95 });
});

test('the checklist: "Over time" is not a reason', () => {
  assert.match(checkNewReason('other', { note: 'Over time' })!, /full sentence/);
  assert.equal(checkNewReason('other', { note: 'Folding team left at 6 pm for a wedding, 40 trays not folded' }), null);
  assert.match(checkNewReason('over_prepared', { causes: [] })!, /say why/);
  assert.match(checkNewReason('over_prepared', { causes: ['told'] })!, /who told/);
  assert.equal(checkNewReason('over_prepared', { causes: ['no_leftover_check'] }), null);
  assert.match(checkNewReason('slow_folding', { note: 'slow' })!, /write what happened/);
});

test('reasons and the plan in words', () => {
  const text = reasonsText({ by: 'Vijay Das', plan: 'use_first', reasons: [{ kind: 'over_prepared', causes: ['no_leftover_check'] }, { kind: 'slow_folding', note: 'Two folders were new this week' }] });
  assert.equal(text, "Reasons given by Vijay Das: Made more than the plan needed (didn't check what was left from yesterday); Folding was slower than usual (Two folders were new this week). What happens to it: used first tomorrow (less fresh stuffing made).");
});

test('making more while yesterday\'s is there needs a real reason', () => {
  assert.ok(cleanWithLeftover({}).error);
  assert.ok(cleanWithLeftover({ reason: 'told' }).error);
  assert.ok(cleanWithLeftover({ reason: 'other', note: 'needed' }).error);
  assert.ok(cleanWithLeftover({ reason: 'not_fit', note: '' }).error);
  assert.deepEqual(cleanWithLeftover({ reason: 'told', who: 'Rohan' }).value, { reason: 'told', who: 'Rohan', note: '' });
  const [line] = withLeftoverLines([{ pool: 'stuffing:chicken', kg: 8.8, openingKg: 8.88, at: '10:15 am', by: 'Vijay Das', withLeftover: { reason: 'not_enough' } }]);
  assert.equal(line, "Vijay Das made 8.8 kg chicken stuffing at 10:15 am while 8.88 kg from yesterday was there. Reason: today's plan needs more than what was left.");
});

console.log(`leftoverRules: ${passed} tests passed`);
