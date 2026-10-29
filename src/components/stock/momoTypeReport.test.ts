// Tests for Stock requests > "Requests by momo type" (stockMath.ts computeMomoTypeReport): the days
// are India days, so just after midnight "Today" is the new day's request, not yesterday's.
//   node scripts/stock-test.mjs
import assert from 'node:assert/strict';
import { computeMomoTypeReport } from './stockMath';

const products = [{ camelKey: 'chicken', label: 'Chicken' }, { camelKey: 'paneer', label: 'Paneer' }] as any[];
const requests = [
  { requestDate: '2026-10-27', status: 'partially-delivered', chicken: 600, paneer: 120, shippedQuantities: { chicken: 600, paneer: 120 } },
  { requestDate: '2026-10-28', status: 'delivered', chicken: 600, shippedQuantities: { chicken: 600 } },
  { requestDate: '2026-10-29', status: 'pending', chicken: 400, paneer: 60 },
] as any[];
// 1:04 AM in India on Thu 29 Oct 2026 = 19:34 UTC on the 28th.
const now = new Date('2026-10-28T19:34:00Z');
const report = (filter: any, customRange = { from: '', to: '' }) => computeMomoTypeReport({ requests, finishedProducts: products, filter, customRange, now });
const line = (r: ReturnType<typeof report>, key: string) => r.lines.find((l) => l.camelKey === key)!;

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; };

test('just after midnight, Today is the new day\'s request (not yet delivered)', () => {
  const r = report('today');
  assert.equal(r.requestCount, 1);
  assert.deepEqual([line(r, 'chicken').requested, line(r, 'chicken').delivered, line(r, 'chicken').comparison], [400, 0, 600]);
  assert.equal(line(r, 'chicken').fulfillmentPct, 0);
  assert.deepEqual([line(r, 'paneer').requested, line(r, 'paneer').direction], [60, 'up']);
});

test('Yesterday is the 28th, compared with the 27th', () => {
  const r = report('yesterday');
  assert.deepEqual([line(r, 'chicken').requested, line(r, 'chicken').delivered, line(r, 'chicken').comparison], [600, 600, 600]);
});

test('weeks start on Sunday 25 Oct; months on the 1st', () => {
  assert.equal(report('thisWeek').requestCount, 3);
  assert.equal(report('lastWeek').requestCount, 0);
  assert.equal(report('thisMonth').requestCount, 3);
  assert.equal(report('thisMonth').comparisonLabel, 'vs Last Month (Day 1-29)');
  assert.equal(report('lastMonth').comparisonLabel, 'vs Month Before (Day 1-30)');
  const custom = report('custom', { from: '2026-10-28', to: '2026-10-29' });
  assert.deepEqual([custom.requestCount, line(custom, 'chicken').comparison], [2, 600]);
  // No custom dates picked yet: no crash, nothing counted.
  assert.equal(report('custom').requestCount, 0);
  assert.equal(report('today', { from: '', to: '' }).requestCount, 1);
});

console.log(`momoTypeReport: ${n} tests passed`);
