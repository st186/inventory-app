// Tests for cameraRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/cameraRules.test.ts
import assert from 'node:assert/strict';
import { cleanFaces, decide, inHours, istClock, minutesUntilHours, missingPpe, missingText, onlyKnownStaff } from './cameraRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

test('working hours, including a window past midnight', () => {
  assert.equal(inHours('08:00', '08:00', '20:00'), true);
  assert.equal(inHours('19:59', '08:00', '20:00'), true);
  assert.equal(inHours('20:00', '08:00', '20:00'), false);
  assert.equal(inHours('02:00', '22:00', '06:00'), true);
  assert.equal(inHours('12:00', '22:00', '06:00'), false);
  assert.equal(minutesUntilHours('07:30', '08:00', '20:00'), 30);
  assert.equal(minutesUntilHours('21:00', '08:00', '20:00'), 660);
  assert.equal(minutesUntilHours('10:00', '08:00', '20:00'), 0);
  assert.equal(istClock(Date.parse('2026-10-29T10:15:00Z')), '15:45');
});

const person = (cap: string, gloves: string, apron: string) => ({ where: 'x', cap, gloves, apron });

test('only a clear "no" counts as missing; unchecked items are ignored', () => {
  const look = { peopleCount: 3, people: [person('no', 'yes', 'yes'), person('unclear', 'no', 'no'), person('yes', 'unclear', 'yes')] };
  assert.deepEqual(missingPpe(look, ['cap', 'gloves', 'apron']), { cap: 1, gloves: 1, apron: 1 });
  assert.deepEqual(missingPpe(look, ['cap']), { cap: 1 });
  assert.equal(missingText({ cap: 2, gloves: 1 }), '2 people without caps, 1 person without gloves');
});

test('scheduled still in working hours: PPE alert, spaced 15 minutes apart', () => {
  const look = { peopleCount: 1, people: [person('yes', 'no', 'yes')] };
  const now = Date.parse('2026-10-30T09:00:00Z');
  assert.equal(decide({ kind: 'scheduled', look, checks: ['cap', 'gloves', 'apron'], nowMs: now, gapMin: 15 }).alert, 'ppe');
  assert.equal(decide({ kind: 'scheduled', look, checks: ['cap', 'gloves', 'apron'], nowMs: now, lastAlertAt: '2026-10-30T08:50:00Z', gapMin: 15 }).alert, null);
  assert.equal(decide({ kind: 'scheduled', look, checks: ['cap', 'apron'], nowMs: now, gapMin: 15 }).alert, null);
  assert.equal(decide({ kind: 'scheduled', look: { peopleCount: 1, people: [person('unclear', 'unclear', 'unclear')] }, checks: ['cap', 'gloves', 'apron'], nowMs: now, gapMin: 15 }).alert, null);
});

test('movement outside working hours: anyone in view is an intruder alert; nobody, no alert', () => {
  const now = Date.parse('2026-10-30T20:00:00Z');
  assert.equal(decide({ kind: 'motion', look: { peopleCount: 1, people: [person('no', 'no', 'no')] }, checks: [], nowMs: now, gapMin: 10 }).alert, 'intruder');
  assert.equal(decide({ kind: 'motion', look: { peopleCount: 0, people: [] }, checks: [], nowMs: now, gapMin: 10 }).alert, null);
  assert.equal(decide({ kind: 'motion', look: { peopleCount: 2, people: [] }, checks: [], nowMs: now, lastAlertAt: '2026-10-30T19:55:00Z', gapMin: 10 }).alert, null);
});

test('recognised faces: only known colleagues after hours is not an intruder', () => {
  assert.deepEqual(cleanFaces({ names: ['Vijay Das', 'Vijay Das', ''], unknown: 0 }), { names: ['Vijay Das'], unknown: 0 });
  assert.equal(cleanFaces(null), null);
  assert.equal(onlyKnownStaff({ names: ['Vijay Das'], unknown: 0 }, 1), true);
  assert.equal(onlyKnownStaff({ names: ['Vijay Das'], unknown: 1 }, 2), false); // a stranger with him
  assert.equal(onlyKnownStaff({ names: ['Vijay Das'], unknown: 0 }, 2), false); // someone whose face wasn't seen
  assert.equal(onlyKnownStaff({ names: [], unknown: 0 }, 1), false); // back to the camera: can't tell
  assert.equal(onlyKnownStaff(null, 1), false);
});

console.log(`cameraRules: ${passed} tests passed`);
