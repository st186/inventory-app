// Tests for cameraPeople.ts. Run with plain node:
//   node --experimental-strip-types supabase/functions/make-server-c2dd9b9d/cameraPeople.test.ts
import assert from 'node:assert/strict';
import { addRef, assign, cleanNumbered, mergeSamePerson, toShow, MAX_REFS } from './cameraPeople.ts';

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

console.log(`cameraPeople: ${passed} tests passed`);
