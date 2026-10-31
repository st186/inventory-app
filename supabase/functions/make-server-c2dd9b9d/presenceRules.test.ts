// Tests for presenceRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/presenceRules.test.ts
import assert from 'node:assert/strict';
import { cleanSpans, mergeSpans } from './presenceRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };
const M = 60000;
const t0 = Date.parse('2026-10-31T05:30:00Z'); // 11:00 IST

test('cleaning: bad states, backwards or future times are dropped; distance rounds to 50 m and only when out', () => {
  const now = t0 + 60 * M;
  const got = cleanSpans([
    { from: t0, to: t0 + 10 * M, state: 'in', farthestM: 80 },
    { from: t0 + 10 * M, to: t0 + 30 * M, state: 'out', farthestM: 333 },
    { from: t0 + 30 * M, to: t0 + 20 * M, state: 'in' },
    { from: t0, to: now + 10 * M, state: 'in' },
    { from: t0, to: t0 + M, state: 'home' },
    { from: new Date(t0 + 40 * M).toISOString(), to: new Date(t0 + 50 * M).toISOString(), state: 'in' },
  ], now);
  assert.deepEqual(got, [
    { from: t0, to: t0 + 10 * M, state: 'in' },
    { from: t0 + 10 * M, to: t0 + 30 * M, state: 'out', farthestM: 350 },
    { from: t0 + 40 * M, to: t0 + 50 * M, state: 'in' },
  ]);
  assert.deepEqual(cleanSpans('nope', now), []);
});

test('merging: a stretch sent again as it grows replaces itself; touching ones of a state join', () => {
  let day = mergeSpans([], [{ from: t0, to: t0 + 30 * M, state: 'in' }]);
  day = mergeSpans(day, [{ from: t0 + 29 * M, to: t0 + 60 * M, state: 'in' }]);
  assert.deepEqual(day, [{ from: t0, to: t0 + 60 * M, state: 'in' }]);
  // Stepped out 11:40-12:10, up to 300 m, then back.
  day = mergeSpans(day, [{ from: t0 + 40 * M, to: t0 + 70 * M, state: 'out', farthestM: 300 }, { from: t0 + 70 * M, to: t0 + 90 * M, state: 'in' }]);
  assert.deepEqual(day, [
    { from: t0, to: t0 + 40 * M, state: 'in' },
    { from: t0 + 40 * M, to: t0 + 70 * M, state: 'out', farthestM: 300 },
    { from: t0 + 70 * M, to: t0 + 90 * M, state: 'in' },
  ]);
  // The app was asleep 12:30-13:00: a gap stays a gap.
  day = mergeSpans(day, [{ from: t0 + 120 * M, to: t0 + 130 * M, state: 'in' }]);
  assert.equal(day.length, 4);
  assert.equal(day[3].from, t0 + 120 * M);
});

console.log(`presenceRules: ${passed} tests passed`);
