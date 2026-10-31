// Sample weeks through requestPlan.ts. Run with plain node:
//   node src/utils/requestPlan.test.ts
import assert from 'node:assert/strict';
import { addDaysISO, planBags, planInput, sumPlans } from './requestPlan.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const D = '2026-11-02';
const every = (from: string, to: string, pieces: Record<string, number>) => {
  const out: Record<string, Record<string, number>> = {};
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out[d] = { ...pieces };
  return out;
};

test('chicken: tomorrow 600 + 15% less the 40 still there = 650, 13 bags', () => {
  const [day] = planBags({
    keys: ['chicken'], firstPlanDay: D, lastPlanDay: D,
    delivered: { '2026-11-01': { chicken: 640 } }, sold: { '2026-11-01': { chicken: 600 } },
    expected: { [D]: { chicken: 600 } },
  });
  assert.equal(day.rows.chicken.onHand, 40);
  assert.equal(day.rows.chicken.pieces, 650);
  assert.equal(day.rows.chicken.bags, 13);
  assert.equal(day.rows.chicken.slow, false);
});

test('paneer at 15 a day: a bag every three days, not 50 every day', () => {
  // A bag went on 30 Oct: 20 left on 1 Nov (enough), 5 on 2 Nov (short) -> next bag, and so on.
  const plan = planBags({
    keys: ['paneer'], firstPlanDay: '2026-11-01', lastPlanDay: '2026-11-06',
    delivered: { '2026-10-30': { paneer: 50 } }, sold: every('2026-10-22', '2026-10-31', { paneer: 15 }),
    expected: every('2026-11-01', '2026-11-06', { paneer: 15 }),
  });
  assert.deepEqual(plan.map((d) => d.rows.paneer.pieces), [0, 50, 0, 0, 50, 0]);
  assert.equal(plan[0].rows.paneer.onHand, 20);
  assert.equal(plan[0].rows.paneer.slow, false); // 60 in 4 days: a bag sells in time
  assert.equal(plan[0].rows.paneer.daysPerBag, 3.3);
});

test('slow type at 10 a day: no margin, a bag only when it would run out; what passes 4 days is thrown', () => {
  const plan = planBags({
    keys: ['vegKurkure'], firstPlanDay: '2026-11-01', lastPlanDay: '2026-11-06',
    delivered: { '2026-10-29': { vegKurkure: 50 } }, sold: every('2026-10-22', '2026-10-31', { vegKurkure: 10 }),
    expected: every('2026-11-01', '2026-11-06', { vegKurkure: 10 }),
  });
  assert.deepEqual(plan.map((d) => d.rows.vegKurkure.pieces), [0, 50, 0, 0, 0, 50]);
  assert.equal(plan[0].rows.vegKurkure.slow, true);
  assert.equal(plan[0].rows.vegKurkure.goingOff, 10); // the 29 Oct bag's last 10, after its 4th day
  assert.equal(plan[4].rows.vegKurkure.goingOff, 10);
});

test('too slow at 5 a day: left out even with the freezer empty', () => {
  const [day] = planBags({ keys: ['chickenCheese'], firstPlanDay: D, lastPlanDay: D, delivered: {}, sold: {}, expected: { [D]: { chickenCheese: 5 } } });
  assert.equal(day.rows.chickenCheese.tooSlow, true);
  assert.equal(day.rows.chickenCheese.pieces, 0);
});

test('short by under 5 with some left: no bag; empty freezer: a bag even for a few', () => {
  const some = planBags({ keys: ['veg'], firstPlanDay: D, lastPlanDay: D, delivered: { '2026-11-01': { veg: 50 } }, sold: { '2026-11-01': { veg: 28 } }, expected: { [D]: { veg: 22 } } });
  assert.equal(some[0].rows.veg.onHand, 22);
  assert.equal(some[0].rows.veg.pieces, 0); // 25.3 needed, 22 there: 3.3 short
  const none = planBags({ keys: ['veg'], firstPlanDay: D, lastPlanDay: D, delivered: {}, sold: {}, expected: { [D]: { veg: 14 } } });
  assert.equal(none[0].rows.veg.pieces, 50);
});

test('wastage comes off; a stock count replaces the running figure', () => {
  const base = { keys: ['veg'], firstPlanDay: D, lastPlanDay: D, delivered: { '2026-11-01': { veg: 100 } }, sold: { '2026-11-01': { veg: 40 } }, expected: { [D]: { veg: 40 } } };
  assert.equal(planBags(base)[0].rows.veg.onHand, 60);
  assert.equal(planBags({ ...base, wasted: { '2026-11-01': { veg: 20 } } })[0].rows.veg.onHand, 40);
  assert.equal(planBags({ ...base, counted: { date: '2026-11-01', pieces: { veg: 12 } } })[0].rows.veg.onHand, 12);
});

test('a past day the POS has not got counts as the type\'s usual day', () => {
  // 31 Oct missing: the usual of 1 Nov's 30 is used, so 100 - 30 - 30 = 40 on 2 Nov.
  const [day] = planBags({ keys: ['veg'], firstPlanDay: D, lastPlanDay: D, delivered: { '2026-10-31': { veg: 100 } }, sold: { '2026-11-01': { veg: 30 } }, expected: { [D]: { veg: 30 } } });
  assert.equal(day.rows.veg.onHand, 40);
});

test('planInput: only sent requests count, shipped count over what was asked; sumPlans adds the stores', () => {
  const input = planInput({
    history: [{ date: '2026-11-01', pieces: { chicken: 500 } }],
    forecast: [{ date: D, pieces: { chicken: 500 } }],
    requests: [
      { requestDate: '2026-11-01', status: 'delivered', chicken: 600, shippedQuantities: { chicken: 550 } },
      { requestDate: '2026-10-31', status: 'pending', chicken: 600 },
      { requestDate: '2026-10-30', status: 'partially-delivered', chicken: 300 },
    ],
    wastage: [{ date: '2026-11-01', wastage: { chicken: 10 } }],
  }, ['chicken'], D, D);
  assert.deepEqual(input.delivered, { '2026-11-01': { chicken: 550 }, '2026-10-30': { chicken: 300 } });
  const plan = planBags(input);
  // 30 Oct's 300 sold over 30-31 Oct (the usual 500 a day), 1 Nov: 550 - 500 - 10 = 40 left.
  assert.equal(plan[0].rows.chicken.onHand, 40);
  assert.deepEqual(sumPlans([plan, plan]), [{ date: D, need: { chicken: plan[0].rows.chicken.pieces * 2 } }]);
});

test('a day the store already asked for: production makes what it asked; the store\'s own fill ignores it', () => {
  const src = {
    history: [], forecast: [{ date: D, pieces: { paneer: 15 } }],
    requests: [{ requestDate: D, status: 'pending', paneer: 100 }, { requestDate: D, status: 'rejected', paneer: 400 }],
  };
  assert.equal(planBags(planInput(src, ['paneer'], D, D))[0].rows.paneer.pieces, 100);
  assert.equal(planBags(planInput(src, ['paneer'], D, D, false))[0].rows.paneer.pieces, 50);
});

console.log(`requestPlan: ${passed} tests passed`);
