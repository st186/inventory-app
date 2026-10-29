// Tests for activityRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/activityRules.test.ts
import assert from 'node:assert/strict';
import { addBurst, addStill, summarise, type ActivityDay } from './activityRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const p = (top: string, activity: string, phone = 'none', ppe = 'yes') => ({ top, activity, phone, cap: ppe, gloves: ppe, apron: ppe });
const base = { date: '2026-10-30', cameraId: 'cam', everyMin: 5, checks: ['cap', 'gloves', 'apron'] };

test('each sighting counts the minutes between stills, per colour', () => {
  let d: ActivityDay | null = null;
  d = addStill(d, { ...base, clock: '10:00', people: [p('red', 'folding'), p('teal', 'machine')] });
  d = addStill(d, { ...base, clock: '10:05', people: [p('red', 'folding'), p('teal', 'folding')] });
  d = addStill(d, { ...base, clock: '10:10', people: [p('red', 'idle')] });
  assert.equal(d.stills, 3);
  assert.deepEqual(d.slots.red.minutes, { folding: 10, idle: 5 });
  assert.deepEqual(d.slots.teal.minutes, { machine: 5, folding: 5 });
  assert.equal(d.slots.red.first, '10:00');
  assert.equal(d.slots.red.last, '10:10');
});

test('phone: minutes, and separate times (a new time after a still without the phone)', () => {
  let d: ActivityDay | null = null;
  for (const [clock, phone] of [['11:00', 'in_hand'], ['11:05', 'at_ear'], ['11:10', 'none'], ['11:15', 'in_hand']] as const) {
    d = addStill(d, { ...base, clock, people: [p('red', phone === 'none' ? 'folding' : 'phone', phone)] });
  }
  assert.equal(d!.slots.red.phoneMinutes, 15);
  assert.equal(d!.slots.red.phoneTimes, 2);
  // Out of view in between ends a phone streak too.
  let e: ActivityDay | null = null;
  e = addStill(e, { ...base, clock: '12:00', people: [p('blue', 'phone', 'in_hand')] });
  e = addStill(e, { ...base, clock: '12:05', people: [] });
  e = addStill(e, { ...base, clock: '12:10', people: [p('blue', 'phone', 'in_hand')] });
  assert.equal(e!.slots.blue.phoneTimes, 2);
});

test('two people in the same colour are kept apart; unknown values fall into other', () => {
  const d = addStill(null, { ...base, clock: '10:00', people: [p('red', 'folding'), p('red', 'packing'), p('maroon', 'dancing')] });
  assert.deepEqual(Object.keys(d.slots).sort(), ['other', 'red', 'red-2']);
  assert.deepEqual(d.slots.other.minutes, { other: 5 });
});

test('PPE share counts only sightings where every checked item could be seen', () => {
  let d: ActivityDay | null = null;
  d = addStill(d, { ...base, clock: '10:00', people: [p('red', 'folding', 'none', 'yes')] });
  d = addStill(d, { ...base, clock: '10:05', people: [p('red', 'folding', 'none', 'no')] });
  d = addStill(d, { ...base, clock: '10:10', people: [{ ...p('red', 'folding'), gloves: 'unclear' }] });
  assert.deepEqual(d!.slots.red.ppe, { judged: 2, ok: 1 });
});

test('summary: names join days, pieces per folding hour for the kitchen', () => {
  let d1: ActivityDay | null = null;
  for (let i = 0; i < 12; i++) d1 = addStill(d1, { ...base, clock: `10:${String(i * 5).padStart(2, '0')}`, people: [p('red', 'folding'), p('teal', 'phone', 'in_hand')] });
  let d2: ActivityDay | null = null;
  for (let i = 0; i < 6; i++) d2 = addStill(d2, { ...base, date: '2026-10-31', clock: `10:${String(i * 5).padStart(2, '0')}`, people: [p('blue', 'folding')] });
  const names = { '2026-10-30': { red: 'Rudra Mahato' }, '2026-10-31': { blue: 'Rudra Mahato' } };
  const s = summarise([d1!, d2!], names, 900);
  const rudra = s.people.find((x) => x.name === 'Rudra Mahato')!;
  assert.equal(rudra.foldingMinutes, 90); // 60 + 30 across the two days, as one person
  const teal = s.people.find((x) => x.slot === 'teal')!;
  assert.equal(teal.name, null);
  assert.equal(teal.phoneMinutes, 60);
  assert.equal(s.kitchen.foldingHours, 1.5);
  assert.equal(s.kitchen.piecesPerFoldingHour, 600);
  assert.equal(rudra.ppePercent, 100);
});

test('a burst: each frame a person is in counts its share of the cycle; phone runs; PPE once', () => {
  const b = { date: '2026-10-30', cameraId: 'cam', frames: 4, minutesPerFrame: 8.75, checks: ['cap', 'gloves', 'apron'] };
  let d: ActivityDay | null = null;
  d = addBurst(d, { ...b, from: '10:00', to: '10:01', people: [
    { top: 'red', activities: ['folding', 'phone', 'phone', 'folding'], phoneFrames: [2, 3], cap: 'yes', gloves: 'yes', apron: 'yes' },
    { top: 'teal', activities: ['away', 'machine', 'idle', 'away'], phoneFrames: [3], cap: 'no', gloves: 'yes', apron: 'yes' },
    { top: 'blue', activities: ['away', 'away', 'away', 'away'], phoneFrames: [] },
  ] });
  assert.equal(d.stills, 4);
  assert.equal(d.bursts, 1);
  assert.deepEqual(d.slots.red.minutes, { folding: 17.5, phone: 17.5 });
  assert.equal(d.slots.red.phoneMinutes, 17.5);
  assert.equal(d.slots.red.phoneTimes, 1); // frames 2-3: one time
  assert.deepEqual(d.slots.teal.minutes, { machine: 8.75, idle: 8.75 });
  assert.equal(d.slots.teal.phoneTimes, 1); // phone in hand while idle
  assert.equal(d.slots.blue, undefined); // never in view
  assert.deepEqual(d.slots.teal.ppe, { judged: 1, ok: 0 });
  // The next burst: a phone at its first frame is a new time; first / last cover both bursts.
  d = addBurst(d, { ...b, from: '10:36', to: '10:37', people: [
    { top: 'red', activities: ['phone', 'folding', 'folding', 'folding'], phoneFrames: [1], cap: 'yes', gloves: 'yes', apron: 'yes' },
  ] });
  assert.equal(d.slots.red.phoneTimes, 2);
  assert.equal(d.slots.red.first, '10:00');
  assert.equal(d.slots.red.last, '10:37');
  assert.equal(d.bursts, 2);
  const s = summarise([d], {}, 0);
  const red = s.people.find((x) => x.slot === 'red')!;
  assert.equal(red.seenMinutes, 70); // 8 frames x 8.75
  assert.equal(red.foldingMinutes, 44); // 43.75 shown whole
  assert.equal(s.kitchen.bursts, 2);
  assert.equal(s.kitchen.stills, 8);
});

console.log(`activityRules: ${passed} tests passed`);
