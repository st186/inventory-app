// Tests for roundupRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/roundupRules.test.ts
import assert from 'node:assert/strict';
import { emptyPpeDay, photoFacts, plainRoundup, ppeFacts, ppeStep, worthTelling, type PpeCheck } from './roundupRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };
const at = (hhmm: string) => new Date(`2026-10-31T${hhmm}:00+05:30`).toISOString();

// The production house kitchen camera, 31 Oct 2026 morning (as it happened).
const morning: PpeCheck[] = [
  { at: at('08:50'), peopleCount: 3, missing: { cap: 1, apron: 1 }, missingBy: [{ id: 3, items: ['cap', 'apron'] }] },
  { at: at('09:25'), peopleCount: 3, missing: { cap: 1, gloves: 1, apron: 1 }, missingBy: [{ id: 3, items: ['cap', 'gloves', 'apron'] }] },
  { at: at('10:00'), peopleCount: 5, missing: { cap: 4, apron: 4 }, missingBy: [{ id: 3, items: ['cap', 'apron'] }, { id: 4, items: ['cap', 'apron'] }] },
  { at: at('10:35'), peopleCount: 4, missing: { cap: 2, apron: 2 } },
];

test('first problem now, crew reminded after 2, a firmer alert after 3, then quiet', () => {
  let day = emptyPpeDay();
  const steps = morning.map((c) => { const s = ppeStep(day, c, Date.parse(c.at)); day = s.day; return [s.tell, s.remindCrew]; });
  // 10:35 is 70 minutes after the 9:25 reminder: the crew are reminded again (at most once an hour).
  assert.deepEqual(steps, [['first', false], ['again', true], ['still', false], ['again', true]]);
  assert.equal(day.streak, 4);
  assert.equal(day.reminders.length, 2);
  const soon = ppeStep(day, { at: at('11:10'), peopleCount: 3, missing: { cap: 1 } }, Date.parse(at('11:10')));
  assert.equal(soon.remindCrew, false); // 35 minutes after the last one
  assert.equal(soon.tell, 'again');
});

test('a good check ends the run; nobody in view changes nothing', () => {
  let day = ppeStep(emptyPpeDay(), morning[0], 0).day;
  day = ppeStep(day, { at: at('09:25'), peopleCount: 0, missing: {} }, 0).day;
  assert.equal(day.streak, 1);
  day = ppeStep(day, { at: at('10:00'), peopleCount: 3, missing: {} }, 0).day;
  assert.equal(day.streak, 0);
  const again = ppeStep(day, morning[2], Date.parse(morning[2].at));
  assert.equal(again.tell, 'again'); // not the day's first any more
  assert.equal(again.remindCrew, false);
});

test('the day\'s facts: counts, times, worst, who (named from Who is who)', () => {
  const f = ppeFacts({ place: 'Production house', checks: [...morning, { at: at('11:10'), peopleCount: 4, missing: {} }], names: { p3: 'Rudra' }, reminders: 1, yesterdayBad: 6 });
  assert.equal(f.checks, 5);
  assert.equal(f.bad, 4);
  assert.deepEqual(f.badTimes, ['8:50 am', '9:25 am', '10:00 am', '10:35 am']);
  assert.deepEqual(f.worst, { at: '10:00 am', people: 4 });
  assert.deepEqual(f.missingChecks, { cap: 4, apron: 4, gloves: 1 });
  assert.deepEqual(f.people[0], { who: 'Rudra', items: { cap: 3, apron: 3, gloves: 1 } });
  assert.equal(f.people[1].who, 'Person 4');
  assert.equal(f.longestRun, 4);
  assert.equal(f.endsBad, false);
});

test('photo checks: missed only after the window, dirty ones with the AI\'s reason', () => {
  const rows = [
    { employeeId: 'BM008', name: 'Rohan', required: 2, done: 0, assigned: [{ id: 'pos', name: 'POS setup', end: '16:00' }, { id: 'counter', name: 'Billing counter', end: '23:00' }] },
    { employeeId: 'BM002', name: 'Vijay', required: 7, done: 7, onTime: 6, items: { walls: { name: 'Walls', aiScore: 3, aiVerdict: 'needs_cleaning', aiIssues: ['dark mould patches on wall'], flag: { status: 'open' } }, steamer: { name: 'Steamer', aiScore: 9 } } },
  ];
  const f = photoFacts('Production house', rows, '18:00');
  assert.deepEqual(f.missed, [{ item: 'POS setup', who: 'Rohan' }]);
  assert.equal(f.missedTotal, 1);
  // 31 Oct: all 16 morning checks at the production house missed - counted in full, named in part.
  const all = photoFacts('Production house', [{ employeeId: 'BM004', name: 'Aniket', required: 16, done: 0, assigned: Array.from({ length: 16 }, (_, i) => ({ id: String(i), name: `Check ${i + 1}`, end: '11:00' })) }], '13:00');
  assert.equal(all.missedTotal, 16);
  assert.equal(all.missed.length, 8);
  assert.deepEqual(f.dirty, [{ item: 'Walls', score: 3, issue: 'dark mould patches on wall', who: 'Vijay', fixed: false }]);
});

test('the plain roundup (when Bunny can\'t be reached) and a quiet day', () => {
  const ppe = [ppeFacts({ place: 'Production house', checks: morning })];
  const photos = [photoFacts('Bunny Momos 1', [{ employeeId: 'BM008', name: 'Rohan', required: 1, done: 0, assigned: [{ id: 'pos', name: 'POS setup', end: '16:00' }] }], '18:00')];
  assert.equal(worthTelling(ppe, photos), true);
  const r = plainRoundup(ppe, photos);
  assert.equal(r.headline, '4 PPE misses, 1 photo missed');
  assert.equal(r.lines[0], 'Production house: cap, apron, gloves missing in 4 of 4 camera checks (9:25 am, 10:00 am, 10:35 am), still at the last check.');
  assert.equal(r.lines[1], 'Bunny Momos 1: 1 of 1 photo checks missed (POS setup).');
  assert.equal(worthTelling([ppeFacts({ place: 'x', checks: [{ at: at('10:00'), peopleCount: 2, missing: {} }] })], []), false);
  assert.deepEqual(plainRoundup([], []), { headline: 'All clear', lines: ['Caps, aprons and photo checks all fine so far.'] });
});

console.log(`roundupRules: ${passed} passed`);
