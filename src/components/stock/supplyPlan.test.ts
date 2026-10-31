// Sample request histories through supplyPlan.ts. Run with plain node:
//   node src/components/stock/supplyPlan.test.ts
import assert from 'node:assert/strict';
import { planSupplies } from './supplyPlan.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const D = '2026-11-01';
const catalog = { sauces: ['Red Sauce', 'Soup Premix'], kitchen: [{ name: 'Oil', unit: 'litre' }, { name: 'Coriander', unit: 'bundle' }], utilities: ['Table Box', 'Parcel Box'] };
const flat = (() => { const r: Record<string, number> = {}; for (let i = 1; i <= 31; i++) r[`2026-10-${String(i).padStart(2, '0')}`] = 10000; r[D] = 10000; return r; })();
const req = (requestDate: string, extra: Record<string, any>) => ({ requestDate, status: 'delivered', ...extra });
const names = (picks: { name: string }[]) => picks.map((p) => p.name).sort();

test('asked for every day: on tomorrow\'s request at its usual amount', () => {
  const requests = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map((d, i) => req(d, { kitchenUtilities: { Coriander: { quantity: i === 5 ? 2 : 1, unit: 'bundle' } } }));
  const picks = planSupplies({ requestDate: D, requests, revenue: flat, catalog });
  assert.deepEqual(names(picks), ['Coriander']);
  assert.equal(picks[0].quantity, 1);
  assert.deepEqual(picks[0].why, { kind: 'due', everyDays: 1, last: '2026-10-31', times: 6 });
});

test('every 3 days: not due 2 days after the last, due after 3; a busy day brings it forward', () => {
  const requests = ['2026-10-20', '2026-10-23', '2026-10-26'].map((d) => req(d, { utilities: { 'Table Box': 100 } }));
  assert.deepEqual(names(planSupplies({ requestDate: '2026-10-28', requests, revenue: flat, catalog })), []);
  assert.deepEqual(names(planSupplies({ requestDate: '2026-10-29', requests, revenue: flat, catalog })), ['Table Box']);
  // 27 Oct is a festival day at Rs 25,000: the boxes run out a day early.
  assert.deepEqual(names(planSupplies({ requestDate: '2026-10-28', requests, revenue: { ...flat, '2026-10-27': 25000 }, catalog })), ['Table Box']);
});

test('a line sent as none is not a delivery; fewer than 3 times is no rhythm', () => {
  const requests = [
    req('2026-10-22', { utilities: { 'Parcel Box': 100 } }),
    req('2026-10-25', { utilities: { 'Parcel Box': 100 } }),
    req('2026-10-28', { utilities: { 'Parcel Box': 100 }, shippedQuantities: { 'utility_Parcel Box': 0 } }),
  ];
  assert.deepEqual(names(planSupplies({ requestDate: '2026-10-31', requests, revenue: flat, catalog })), []);
});

test('stopped asking: last time long ago against its rhythm, so left out', () => {
  const requests = ['2026-10-02', '2026-10-04', '2026-10-06'].map((d) => req(d, { sauces: { 'Red Sauce': true } }));
  assert.deepEqual(names(planSupplies({ requestDate: D, requests, revenue: flat, catalog })), []);
});

test('rejected requests are ignored', () => {
  const requests = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map((d) => ({ ...req(d, { sauces: { 'Soup Premix': true } }), status: 'rejected' }));
  assert.deepEqual(names(planSupplies({ requestDate: D, requests, revenue: flat, catalog })), []);
});

test('flagged running low: added by name at the usual amount, with who flagged it', () => {
  const requests = [req('2026-10-20', { utilities: { 'Table Box': 100 } }), req('2026-10-27', { utilities: { 'Table Box': 200 } })];
  const picks = planSupplies({ requestDate: D, requests, revenue: flat, catalog, alerts: [{ item: 'table box', level: 'low', by: 'Sumit' }, { item: 'Nirma', level: 'out' }] });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].name, 'Table Box');
  assert.equal(picks[0].quantity, 150);
  assert.deepEqual(picks[0].why, { kind: 'flag', level: 'low', by: 'Sumit' });
});

test('a daily item skipped for two days is still asked for', () => {
  const requests = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28'].map((d) => req(d, { kitchenUtilities: { Coriander: { quantity: 1, unit: 'bundle' } } }));
  assert.deepEqual(names(planSupplies({ requestDate: '2026-10-31', requests, revenue: flat, catalog })), ['Coriander']);
});

test('a flagged item asked for once but not sent still gets its usual amount', () => {
  const requests = [req('2026-10-26', { utilities: { 'Parcel Box': 100 }, shippedQuantities: { 'utility_Parcel Box': 0 } })];
  const picks = planSupplies({ requestDate: D, requests, revenue: flat, catalog, alerts: [{ item: 'Parcel box', level: 'low', by: 'Tumpa' }] });
  assert.equal(picks[0].quantity, 100);
});

console.log(`supplyPlan: ${passed} tests passed`);
