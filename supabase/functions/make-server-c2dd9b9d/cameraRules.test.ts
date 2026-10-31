// Tests for cameraRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/cameraRules.test.ts
import assert from 'node:assert/strict';
import { BURST, burstFor, burstInHours, burstTooSoon, cleanFaces, decide, minutesPerFrame, inHours, istClock, minutesUntilHours, minutesUntilHoursEnd, missingPpe, missingText, nextStillSeconds, onlyKnownStaff } from './cameraRules.ts';

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

test('the schedule: PPE cameras every N minutes; door and customer-area cameras only after hours', () => {
  const base = { from: '09:00', to: '23:30', active: true, everyMin: 30 };
  assert.equal(minutesUntilHoursEnd('22:30', '09:00', '23:30'), 60);
  assert.equal(minutesUntilHoursEnd('08:00', '09:00', '23:30'), 0);
  assert.equal(nextStillSeconds({ ...base, now: '12:00', hasChecks: true, sinceLastS: Infinity }), 0);
  assert.equal(nextStillSeconds({ ...base, now: '12:00', hasChecks: true, sinceLastS: 600 }), 1200);
  assert.equal(nextStillSeconds({ ...base, now: '22:30', hasChecks: false, sinceLastS: Infinity }), 3600); // idle till closing
  assert.equal(nextStillSeconds({ ...base, now: '23:45', hasChecks: false, sinceLastS: Infinity }), 555 * 60); // after hours: watch till 9 AM
  assert.equal(nextStillSeconds({ ...base, now: '12:00', hasChecks: true, sinceLastS: 0, active: false }), 3600);
});

test('bursts: spread over the interval, minutes per frame and a burst that ran past closing', () => {
  // 31 Oct 2026: 20 frames over 35 minutes = one every 105 s, each standing for 1.75 minutes as before.
  assert.deepEqual(burstFor(35), { frames: 20, gapSec: 105 });
  assert.deepEqual(burstFor(5), { frames: 20, gapSec: 15 }); // never closer than 15 s
  assert.equal(minutesPerFrame(35, burstFor(35)), 1.75);
  assert.equal(minutesPerFrame(35, { frames: 8, gapSec: 105 }), 1.75); // cut short at closing: still the gap
  assert.equal(minutesPerFrame(35, BURST), 1.75); // a bunched burst from an older PC: its share of 35 minutes
  // One burst straight after the other is fine; one that overlaps the last isn't.
  assert.equal(burstTooSoon(35 * 60, burstFor(35)), false);
  assert.equal(burstTooSoon(33 * 60, burstFor(35)), false); // a little early (clocks, upload time)
  assert.equal(burstTooSoon(30 * 60, burstFor(35)), true);
  assert.equal(burstTooSoon(10 * 60, burstFor(35)), true);
  assert.equal(burstTooSoon(Infinity, burstFor(35)), false);
  const at = (hhmm: string) => Date.parse(`2026-10-30T${hhmm}:00+05:30`);
  assert.equal(burstInHours(at('12:00'), '07:00', '21:00'), true);
  assert.equal(burstInHours(at('21:04'), '07:00', '21:00'), true); // started 20:58
  assert.equal(burstInHours(at('21:10'), '07:00', '21:00'), false);
  assert.equal(burstInHours(at('06:58'), '07:00', '21:00'), false);
  assert.equal(burstInHours(at('21:30'), '07:00', '21:00', burstFor(35)), true); // spread: started 20:54
});

console.log(`cameraRules: ${passed} tests passed`);
