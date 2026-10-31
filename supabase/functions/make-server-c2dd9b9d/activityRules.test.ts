// Tests for activityRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/activityRules.test.ts
import assert from 'node:assert/strict';
import { addBurst, addStill, slotKeys, summarise, type ActivityDay } from './activityRules.ts';

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
  assert.equal(d.slots.red.last, '10:36'); // the frame they were last in, not the burst's end
  // A spread burst (frames 105 s apart): first and last seen are their own frames, not 35 minutes wide.
  const spread = addBurst(null, { ...b, frames: 20, minutesPerFrame: 1.75, gapSec: 105, from: '13:00', to: '13:35', people: [
    { top: 'yellow', activities: [...Array(4).fill('away'), ...Array(14).fill('folding'), 'away', 'away'], phoneFrames: [] },
  ] });
  assert.equal(spread.slots.yellow.first, '13:07'); // 5th frame: 4 x 105 s after 13:00
  assert.equal(spread.slots.yellow.last, '13:29'); // 18th frame
  assert.equal(spread.slots.yellow.minutes.folding, 24.5);
  assert.equal(d.bursts, 2);
  const s = summarise([d], {}, 0);
  const red = s.people.find((x) => x.slot === 'red')!;
  assert.equal(red.seenMinutes, 70); // 8 frames x 8.75
  assert.equal(red.foldingMinutes, 44); // 43.75 shown whole
  assert.equal(s.kitchen.bursts, 2);
  assert.equal(s.kitchen.stills, 8);
});

test('two people in the same top are told apart by their trousers; trousers unseen go to the one known', () => {
  assert.deepEqual(slotKeys([{ top: 'red', bottom: 'blue' }, { top: 'red', bottom: 'black' }]), ['red~blue', 'red~black']);
  assert.deepEqual(slotKeys([{ top: 'red', bottom: 'unseen' }], ['red~blue', 'yellow~grey']), ['red~blue']);
  assert.deepEqual(slotKeys([{ top: 'red', bottom: 'unseen' }], ['red~blue', 'red~black']), ['red']); // which of the two: can't say
  assert.deepEqual(slotKeys([{ top: 'red' }, { top: 'red' }]), ['red', 'red-2']);
  let d = addBurst(null, { date: '2026-10-30', cameraId: 'cam', from: '09:19', to: '09:24', frames: 2, minutesPerFrame: 1.75, checks: [],
    people: [{ top: 'red', bottom: 'blue', activities: ['prep', 'prep'], phoneFrames: [] }, { top: 'red', bottom: 'black', activities: ['machine', 'idle'], phoneFrames: [] }] });
  d = addBurst(d, { date: '2026-10-30', cameraId: 'cam', from: '09:54', to: '09:59', frames: 1, minutesPerFrame: 1.75, checks: [],
    people: [{ top: 'red', bottom: 'blue', activities: ['folding'], phoneFrames: [] }] });
  assert.deepEqual(d.slots['red~blue'].minutes, { prep: 3.5, folding: 1.75 });
  assert.deepEqual(d.slots['red~black'].minutes, { machine: 1.75, idle: 1.75 });
});

test('not in the kitchen: a whole burst missed counts, a moment out of view does not; folding span', () => {
  const b = (d: ActivityDay | null, from: string, people: { top: string; bottom?: string; activities: string[]; phoneFrames: number[] }[]) =>
    addBurst(d, { date: '2026-10-30', cameraId: 'cam', from, to: from, frames: 4, minutesPerFrame: 8.75, checks: [], gapSec: 15, people });
  let d = b(null, '10:00', [{ top: 'red', activities: ['folding', 'away', 'folding', 'folding'], phoneFrames: [] }, { top: 'blue', activities: ['folding', 'folding', 'away', 'away'], phoneFrames: [] }]);
  d = b(d, '10:35', [{ top: 'red', activities: ['folding', 'folding', 'folding', 'folding'], phoneFrames: [] }]);
  d = b(d, '11:10', [{ top: 'red', activities: ['idle', 'idle', 'idle', 'idle'], phoneFrames: [] }, { top: 'blue', activities: ['away', 'packing', 'packing', 'packing'], phoneFrames: [] }]);
  const s = summarise([d], {}, 0);
  const red = s.people.find((p) => p.slot === 'red')!;
  const blue = s.people.find((p) => p.slot === 'blue')!;
  assert.equal(red.notInKitchenMinutes, 0); // one frame out of view for 15 seconds
  assert.equal(blue.notInKitchenMinutes, Math.round(7 * 8.75)); // gone from 10:00:15 to 11:10:15: 2 + 4 + 1 frames missed
  assert.deepEqual(blue.away, [{ date: '2026-10-30', from: '10:00', to: '11:10', minutes: 61 }]); // last seen, back
  assert.deepEqual(red.away, []);
  assert.deepEqual(s.kitchen.folding, { from: '10:00', to: '10:35', mostPeople: 2 });
  assert.equal(summarise([d, d], {}, 0).kitchen.folding, null);
});

test('numbered people: the day number is the slot; two numbers named the same are one person, not away', () => {
  const b = (d: ActivityDay | null, from: string, people: { top: string; key?: string; activities: string[]; phoneFrames: number[] }[]) =>
    addBurst(d, { date: '2026-10-30', cameraId: 'cam', from, to: from, frames: 4, minutesPerFrame: 8.75, checks: [], gapSec: 15, people });
  assert.deepEqual(slotKeys([{ top: 'red', key: 'p1' }, { top: 'red', key: 'p2' }, { top: 'red' }]), ['p1', 'p2', 'red']);
  let d = b(null, '10:00', [{ top: 'red', key: 'p1', activities: ['folding', 'folding', 'folding', 'folding'], phoneFrames: [] }]);
  d = b(d, '10:35', [{ top: 'red', key: 'p3', activities: ['folding', 'folding', 'folding', 'folding'], phoneFrames: [] }]); // lost, came back as a new number
  d = b(d, '11:10', [{ top: 'red', key: 'p1', activities: ['folding', 'folding', 'folding', 'folding'], phoneFrames: [] }]);
  assert.deepEqual(Object.keys(d.slots).sort(), ['p1', 'p3']);
  const unnamed = summarise([d], {}, 0);
  assert.equal(unnamed.people.find((x) => x.slot === 'p1')!.notInKitchenMinutes, 35); // 10:35 burst missed
  const named = summarise([d], { '2026-10-30': { p1: 'Vijay Das', p3: 'Vijay Das' } }, 0);
  assert.equal(named.people.length, 1);
  assert.equal(named.people[0].name, 'Vijay Das');
  assert.equal(named.people[0].minutes.folding, 105);
  assert.equal(named.people[0].notInKitchenMinutes, 0);
  assert.deepEqual(named.people[0].away, []);
});

test('the whole kitchen empty (lunch) is a break, not anyone away; a real absence still counts', () => {
  // Spread bursts: 20 pictures 105 s apart, each 1.75 minutes (31 Oct 2026: lunch counted as Rudra away).
  const seen = (on: (f: number) => boolean) => Array.from({ length: 20 }, (_, f) => (on(f) ? 'folding' : 'away'));
  const b = (d: ActivityDay | null, from: string, vijay: (f: number) => boolean, rudra: (f: number) => boolean) =>
    addBurst(d, { date: '2026-10-31', cameraId: 'cam', from, to: from, frames: 20, minutesPerFrame: 1.75, checks: [], gapSec: 105, people: [
      { top: 'red', key: 'p1', activities: seen(vijay), phoneFrames: [] },
      { top: 'red', key: 'p2', activities: seen(rudra), phoneFrames: [] },
    ] });
  let d = b(null, '13:00', () => true, () => true);
  d = b(d, '13:35', (f) => f < 10, (f) => f < 5); // Rudra goes first (13:42), Vijay at 13:51
  d = b(d, '14:10', () => false, () => false); // nobody
  d = b(d, '14:45', (f) => f >= 3, (f) => f >= 3); // both back at 14:50
  d = b(d, '15:20', (f) => f !== 7, () => false); // Rudra out the whole burst; one picture with nobody in view
  d = b(d, '15:55', () => true, () => true);
  const s = summarise([d], { '2026-10-31': { p1: 'Vijay Das', p2: 'Rudra Mahato' } }, 0);
  assert.deepEqual(s.kitchen.empty, [{ date: '2026-10-31', from: '13:52', to: '14:50', minutes: 58 }]); // (10 + 20 + 3) pictures
  const vijay = s.people.find((x) => x.name === 'Vijay Das')!;
  const rudra = s.people.find((x) => x.name === 'Rudra Mahato')!;
  assert.equal(vijay.notInKitchenMinutes, 0);
  assert.deepEqual(rudra.away, [{ date: '2026-10-31', from: '15:18', to: '15:55', minutes: 35 }]); // 10 minutes before lunch isn't away
  assert.equal(rudra.notInKitchenMinutes, 35);
});

test('after check-out is nobody\'s "not in kitchen"; the phone says where they were for each time away', () => {
  // 31 Oct 2026: Aniket checked out at 13:55; a later look-alike under his number made him "away" till 17:18.
  const seen = (on: (f: number) => boolean) => Array.from({ length: 20 }, (_, f) => (on(f) ? 'prep' : 'away'));
  const b = (d: ActivityDay | null, from: string, aniket: (f: number) => boolean) =>
    addBurst(d, { date: '2026-10-31', cameraId: 'cam', from, to: from, frames: 20, minutesPerFrame: 1.75, checks: [], gapSec: 105, people: [
      { top: 'red', key: 'p1', activities: seen(() => true), phoneFrames: [] },
      { top: 'blue', key: 'p4', activities: seen(aniket), phoneFrames: [] },
    ] });
  let d = b(null, '12:00', () => true);
  d = b(d, '12:35', (f) => f < 4); // goes at 12:40, back 13:10
  d = b(d, '13:10', (f) => f >= 0 && f < 10); // checks out 13:55; seen till 13:25
  d = b(d, '16:00', () => false);
  d = b(d, '16:35', (f) => f >= 10); // someone under his number at 16:52
  const names = { '2026-10-31': { p1: 'Vijay Das', p4: 'Aniket Prasad' } };
  const plain = summarise([d], names, 0).people.find((x) => x.name === 'Aniket Prasad')!;
  assert.equal(plain.away.length, 2); // 12:40-13:10, and 13:25-16:52
  const outside = { '2026-10-31': { 'Aniket Prasad': { shift: { from: 9 * 60, to: 13 * 60 + 55 }, phone: [{ from: 12 * 60 + 41, to: 13 * 60 + 8, state: 'out' as const, farthestM: 400 }] } } };
  const clipped = summarise([d], names, 0, outside).people.find((x) => x.name === 'Aniket Prasad')!;
  assert.deepEqual(clipped.away.map((a) => `${a.from}-${a.to} ${a.minutes}`), ['12:40-13:10 28', '13:25-13:55 18']); // gone before checking out still counts
  assert.deepEqual(clipped.away[0].phone, { atWorkMin: 0, outMin: 27, farthestM: 400, noneMin: 3 });
  assert.deepEqual(clipped.away[1].phone, { atWorkMin: 0, outMin: 0, farthestM: null, noneMin: 29 }); // 13:25:45 to 13:55
});

console.log(`activityRules: ${passed} tests passed`);
