// Tests for cameraPeople.ts. Run with plain node:
//   node --experimental-strip-types supabase/functions/make-server-c2dd9b9d/cameraPeople.test.ts
import assert from 'node:assert/strict';
import { addRef, addSpot, assign, cleanNumbered, dropBoxes, inSpot, mergeSamePerson, objectBoxes, spotOf, steadyFolding, tagState, toShow, trustBoxes, wantsConfirm, MAX_REFS, type DayPeople } from './cameraPeople.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

test('the PC boxes: one list per frame or nothing; bad boxes and crops of undrawn numbers dropped', () => {
  assert.equal(cleanNumbered(undefined, 2), null);
  assert.equal(cleanNumbered({ frames: [[]] }, 2), null);
  const n = cleanNumbered({
    frames: [[{ n: 1, box: [0.1, 0.2, 0.3, 0.9] }, { n: 2, box: [0.5, 0.2, 2, 0.9] }], [{ n: 1, box: [0.12, 0.2, 0.32, 0.9] }]],
    crops: { 1: 'QUJD', 2: 'QUJD', 3: 'QUJD' }, photos: { 1: 'not base64!' },
  }, 2)!;
  assert.deepEqual(n.frames.map((f) => f.map((b) => b.n)), [[1], [1]]);
  assert.deepEqual(Object.keys(n.crops), ['1']);
  assert.deepEqual(n.photos, {});
});

test('day numbers: new boxes get the next number, a known person keeps theirs, refs refreshed every 90 min', () => {
  let r = assign(null, '2026-10-30', '09:00', [{ box: 1, known: 0, top: 'red' }, { box: 2, known: 0, top: 'blue' }], { 1: 'a', 2: 'b' });
  assert.deepEqual(r.ids, [1, 2]);
  assert.deepEqual(r.keep, [{ box: 1, id: 1 }, { box: 2, id: 2 }]);
  addRef(r.day, 1, 'x/1.jpg', '09:00');
  addRef(r.day, 2, 'x/2.jpg', '09:00');
  // 09:35: box 1 is person 2, box 2 is new; person 2's ref is fresh enough
  r = assign(r.day, '2026-10-30', '09:35', [{ box: 1, known: 2, top: 'blue' }, { box: 2, known: 0, top: 'red' }], { 1: 'c', 2: 'd' });
  assert.deepEqual(r.ids, [2, 3]);
  assert.deepEqual(r.keep, [{ box: 2, id: 3 }]);
  // 10:40: person 1 again, ref due (100 min)
  r = assign(r.day, '2026-10-30', '10:40', [{ box: 1, known: 1, top: 'red' }], { 1: 'e' });
  assert.deepEqual(r.keep, [{ box: 1, id: 1 }]);
  assert.equal(r.day.people.find((p) => p.id === 1)!.last, '10:40');
  // never boxed: a known person still counts as theirs; someone else gets no number (clothes instead)
  assert.deepEqual(assign(r.day, '2026-10-30', '10:45', [{ box: 0, known: 2, top: 'blue' }, { box: 0, known: 0, top: 'yellow' }, { box: 0, known: 0, top: 'green' }], { 0: 'x' }).ids, [2, 0, 0]);
  // a number Bunny made up is someone new; a new day starts again at 1
  assert.deepEqual(assign(r.day, '2026-10-30', '11:00', [{ box: 1, known: 9, top: 'red' }], {}).ids, [4]);
  assert.deepEqual(assign(r.day, '2026-10-31', '09:00', [{ box: 1, known: 1, top: 'red' }], {}).ids, [1]);
});

test('references: first kept for good, then the newest; Bunny sees the newest two of the latest people', () => {
  const r = assign(null, '2026-10-30', '09:00', [{ box: 1, known: 0, top: 'red' }], {});
  const dropped: string[] = [];
  for (let i = 0; i < MAX_REFS + 2; i++) dropped.push(...addRef(r.day, 1, `r${i}.jpg`, '09:00'));
  assert.deepEqual(r.day.people[0].refs.map((x) => x.path), ['r0.jpg', 'r3.jpg', 'r4.jpg']);
  assert.deepEqual(dropped, ['r1.jpg', 'r2.jpg']);
  assert.deepEqual(toShow(r.day), [{ id: 1, paths: ['r3.jpg', 'r4.jpg'] }]);
  assert.deepEqual(toShow(null), []);
});

test('one person boxed twice in a burst: one row, frame by frame', () => {
  const m = mergeSamePerson([
    { key: 'p1', activities: ['folding', 'away', 'away'], phoneFrames: [1] },
    { key: 'p2', activities: ['idle', 'idle', 'idle'], phoneFrames: [] },
    { key: 'p1', activities: ['away', 'away', 'folding'], phoneFrames: [3] },
  ]);
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].activities, ['folding', 'away', 'folding']);
  assert.deepEqual(m[0].phoneFrames, [1, 3]);
});


test('not a person: the sack on the water jar (31 Oct 2026) is dropped in its spot; a person there is not', () => {
  const sack = [0.70, 0.40, 0.81, 0.80];
  const spots = [{ box: sack, from: '2026-10-31', slot: 'p3', by: 'Owner' }];
  assert.equal(inSpot([0.705, 0.41, 0.81, 0.79], sack), true);
  assert.equal(inSpot([0.68, 0.20, 0.82, 0.80], sack), false); // someone standing there: a taller box
  assert.equal(inSpot([0.30, 0.40, 0.41, 0.80], sack), false);
  // Burst: box 1 a man walking past the sack, box 2 the sack in 4 of 5 frames.
  const numbered = {
    frames: [
      [{ n: 1, box: [0.62, 0.30, 0.75, 0.80] }, { n: 2, box: [0.70, 0.40, 0.81, 0.80] }],
      [{ n: 1, box: [0.66, 0.30, 0.79, 0.80] }, { n: 2, box: [0.70, 0.41, 0.81, 0.80] }],
      [{ n: 1, box: [0.70, 0.30, 0.83, 0.80] }, { n: 2, box: [0.71, 0.40, 0.81, 0.79] }],
      [{ n: 1, box: [0.74, 0.30, 0.87, 0.80] }, { n: 2, box: [0.70, 0.40, 0.80, 0.80] }],
      [{ n: 2, box: [0.65, 0.30, 0.80, 0.80] }],
    ],
    crops: { 1: 'a', 2: 'b' }, photos: { 1: 'c', 2: 'd' },
  };
  const drop = objectBoxes(numbered, spots);
  assert.deepEqual([...drop], [2]);
  const kept = dropBoxes(numbered, drop);
  assert.deepEqual(kept.frames.map((f) => f.map((b) => b.n)), [[1], [1], [1], [1], []]);
  assert.deepEqual(Object.keys(kept.crops), ['1']);
  assert.deepEqual(spotOf(numbered, 2), [0.7, 0.4, 0.81, 0.8]);
  assert.equal(objectBoxes(numbered, []).size, 0);
  // A spot already covered isn't added twice.
  assert.equal(addSpot(spots, { box: [0.70, 0.41, 0.81, 0.80], from: '2026-11-01', slot: 'p2', by: 'Vijay' }).length, 1);
  assert.equal(addSpot(spots, { box: [0.10, 0.40, 0.21, 0.80], from: '2026-11-01', slot: 'p2', by: 'Vijay' }).length, 2);
});


test('the boxes over the guess: 31 Oct 11:05, Rudra walked past in 3 of 20 frames but was given 11 frames of folding', () => {
  const frames: { n: number; box: number[] }[][] = Array.from({ length: 20 }, () => []);
  frames[7] = [{ n: 2, box: [0.37, 0.56, 0.57, 1.0] }];
  frames[9] = [{ n: 2, box: [0.51, 0.52, 0.64, 0.99] }];
  frames[10] = [{ n: 2, box: [0.26, 0.66, 0.47, 1.0] }];
  const said = ['away', 'away', 'away', 'away', 'idle', 'prep', 'prep', 'cooking', 'cooking', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding'];
  const [out] = trustBoxes([{ box: 2, activities: said, phoneFrames: [15] }], { frames, crops: {}, photos: {} });
  assert.deepEqual(out.activities, ['away', 'away', 'away', 'away', 'away', 'away', 'prep', 'cooking', 'cooking', 'other', 'other', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away']);
  assert.equal(out.activities.filter((a) => a === 'folding').length, 0);
  assert.deepEqual(out.phoneFrames, []);
  // Someone folding in place, hidden for one frame: kept.
  const still: { n: number; box: number[] }[][] = [[{ n: 1, box: [0.2, 0.5, 0.3, 0.9] }], [], [{ n: 1, box: [0.21, 0.5, 0.31, 0.9] }]];
  assert.deepEqual(trustBoxes([{ box: 1, activities: ['folding', 'folding', 'folding'] }], { frames: still, crops: {}, photos: {} })[0].activities, ['folding', 'folding', 'folding']);
  // Someone the boxing never caught (box 0) is left as Bunny said.
  assert.deepEqual(trustBoxes([{ box: 0, activities: ['folding'] }], { frames: [[]], crops: {}, photos: {} })[0].activities, ['folding']);
});

test('tags: 31 Oct, Rudra on two numbers is done, Aniket once needs a later photo confirmed', () => {
  const slots = [{ slot: 'p1', name: 'Rudra Mahato' }, { slot: 'p2', name: 'Rudra Mahato' }, { slot: 'p4', name: 'Aniket Prasad' }, { slot: 'p5', name: 'Someone else' }, { slot: 'p6', name: null }];
  let s = tagState(slots, {});
  assert.deepEqual(s.tags, { 'Rudra Mahato': 2, 'Aniket Prasad': 1 });
  assert.deepEqual(s.open, ['p6']);
  assert.deepEqual(s.short, ['Aniket Prasad']);
  assert.equal(s.complete, false);
  // A later photo of Person 4 is due an hour after they were first seen; never for Rudra (2 tags) or Someone else.
  assert.equal(wantsConfirm('p4', 'Aniket Prasad', s.tags, undefined, '09:25', '10:00'), false);
  assert.equal(wantsConfirm('p4', 'Aniket Prasad', s.tags, undefined, '09:25', '11:45'), true);
  assert.equal(wantsConfirm('p1', 'Rudra Mahato', s.tags, undefined, '08:50', '11:45'), false);
  assert.equal(wantsConfirm('p5', 'Someone else', s.tags, undefined, '10:00', '11:45'), false);
  const waiting = { p4: { photo: 'a.jpg', at: '11:45' } };
  assert.deepEqual(tagState(slots, waiting).ask, ['p4']);
  assert.equal(wantsConfirm('p4', 'Aniket Prasad', s.tags, waiting.p4, '09:25', '12:20'), false); // asked already
  // Person 6 named Not a person, Person 4's later photo confirmed: complete.
  s = tagState(slots.map((x) => (x.slot === 'p6' ? { ...x, name: 'Not a person' } : x)), { p4: { photo: 'a.jpg', at: '11:45', name: 'Aniket Prasad' } });
  assert.deepEqual(s.ask, []);
  assert.equal(s.complete, true);
  // The later photo was someone else: asked again an hour after that photo.
  assert.equal(wantsConfirm('p4', 'Aniket Prasad', { 'Aniket Prasad': 1 }, { after: '11:45' }, '09:25', '12:20'), false);
  assert.equal(wantsConfirm('p4', 'Aniket Prasad', { 'Aniket Prasad': 1 }, { after: '11:45' }, '09:25', '12:50'), true);
});

test('references: a person named on two numbers goes to Bunny once, under the first, with both looks', () => {
  const ref = (path: string, at: string) => ({ path, at });
  const day: DayPeople = { date: '2026-10-31', next: 5, people: [
    { id: 1, refs: [ref('1a', '08:50'), ref('1b', '10:35')], first: '08:50', last: '10:35', top: 'red' },
    { id: 2, refs: [ref('2a', '08:50'), ref('2b', '10:35')], first: '08:50', last: '11:10', top: 'red' },
    { id: 4, refs: [ref('4a', '09:25'), ref('4b', '11:10')], first: '09:25', last: '11:10', top: 'yellow' },
  ] };
  assert.deepEqual(toShow(day), [{ id: 2, paths: ['2a', '2b'] }, { id: 4, paths: ['4a', '4b'] }, { id: 1, paths: ['1a', '1b'] }]);
  // Rudra: each number's newest look (1b, 2b), then the older ones - three, oldest first.
  assert.deepEqual(toShow(day, { p1: 'Rudra Mahato', p2: 'Rudra Mahato', p4: 'Aniket Prasad' }), [{ id: 1, paths: ['1a', '2b', '1b'] }, { id: 4, paths: ['4a', '4b'] }]);
  // Someone else is never merged: two visitors are two people.
  assert.equal(toShow(day, { p1: 'Someone else', p2: 'Someone else' }).length, 3);
  // An object is never shown: 31 Oct 13:25, Bunny took Vijay on the front seat for the sack (Person 3).
  assert.deepEqual(toShow(day, { p2: 'Not a person' }).map((s) => s.id), [4, 1]);
});

test('folding is steady work: 31 Oct 11:40, Rudra at the wooden table got 4 scattered frames of folding', () => {
  const rudra = ['away', 'away', 'away', 'away', 'idle', 'away', 'away', 'machine', 'other', 'away', 'away', 'filling', 'folding', 'folding', 'idle', 'folding', 'prep', 'folding', 'idle', 'away'];
  const [out] = steadyFolding([{ activities: rudra }]);
  assert.equal(out.activities.filter((a) => a === 'folding').length, 0);
  assert.equal(out.activities[12], 'other');
  assert.equal(out.activities[4], 'idle'); // the rest as Bunny read it
  // Someone really folding: most frames, long runs, a glance away now and then - kept.
  const folder = ['folding', 'folding', 'folding', 'idle', 'folding', 'folding', 'folding', 'folding', 'phone', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'away', 'away', 'away', 'away'];
  assert.deepEqual(steadyFolding([{ activities: folder }])[0].activities, folder);
  // Folded for a while, then left: half of the frames in view, kept.
  const left = ['folding', 'folding', 'folding', 'folding', 'prep', 'prep', 'prep', 'prep', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away', 'away'];
  assert.deepEqual(steadyFolding([{ activities: left }])[0].activities, left);
});

test('spread frames (105 s apart): folding for part of the half hour counts; a lone frame of it does not', () => {
  // Aniket on 31 Oct 13:00-13:35: walked in, then folded from the 5th frame (13:07) on.
  const aniket = ['away', 'other', 'other', 'idle', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding', 'folding'];
  assert.deepEqual(steadyFolding([{ activities: aniket }], 105)[0].activities, aniket);
  // Folded a quarter of the time (would fail the half rule of bunched frames): kept when spread.
  const part = ['prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'prep', 'folding', 'folding', 'folding', 'folding', 'folding'];
  assert.deepEqual(steadyFolding([{ activities: part }], 105)[0].activities, part);
  assert.equal(steadyFolding([{ activities: part }])[0].activities.includes('folding'), false); // bunched: not steady
  // Rudra's scattered misreads: lone frames become other, a pair stays.
  const out = steadyFolding([{ activities: ['idle', 'folding', 'idle', 'machine', 'folding', 'folding', 'idle'] }], 105)[0].activities;
  assert.deepEqual(out, ['idle', 'other', 'idle', 'machine', 'folding', 'folding', 'idle']);
  // Changing seats between frames minutes apart isn't walking: folding kept.
  const seats: { n: number; box: number[] }[][] = [[{ n: 1, box: [0.2, 0.5, 0.35, 0.95] }], [{ n: 1, box: [0.55, 0.5, 0.7, 0.95] }], [{ n: 1, box: [0.55, 0.5, 0.7, 0.95] }]];
  const said = ['folding', 'folding', 'folding'];
  assert.deepEqual(trustBoxes([{ box: 1, activities: said }], { frames: seats, crops: {}, photos: {} }, 105)[0].activities, said);
  assert.equal(trustBoxes([{ box: 1, activities: said }], { frames: seats, crops: {}, photos: {} })[0].activities[0], 'other'); // 15 s apart: walking
});

console.log(`cameraPeople: ${passed} tests passed`);
