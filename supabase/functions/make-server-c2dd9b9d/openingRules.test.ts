// Tests for the store opening checklist's rules. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/openingRules.test.ts
import assert from 'node:assert/strict';
import { DEFAULT_OPENING_ITEMS, openingDoer, openingScore, openingTickables, type OpeningTemplate } from './openingRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const t: OpeningTemplate = {
  storeId: 'S1', assigneeId: 'INC', coverId: 'COV', backupId: null, notifyAt: '09:00', dueBy: '16:00', coverDueBy: '17:30',
  items: DEFAULT_OPENING_ITEMS, startedOn: '2026-10-29',
};
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

test('the list: machines as their parts, lemon and chilli only on Saturday', () => {
  const thu = openingTickables(t, '2026-10-29'); // Thursday
  const sat = openingTickables(t, '2026-10-31'); // Saturday
  assert.equal(thu.length, 16);
  assert.equal(sat.length, 17);
  assert.ok(thu.some((b) => b.id === 'fryer' && b.group === 'Equipment working'));
  assert.ok(!thu.some((b) => b.id === 'equipment' || b.id === 'lemon-chilli'));
  assert.ok(sat.some((b) => b.id === 'lemon-chilli'));
});

test('score: by 4 PM counts in full, later that day half, not ticked nothing', () => {
  const date = '2026-10-29';
  const ticks: Record<string, any> = {};
  const boxes = openingTickables(t, date);
  boxes.slice(0, 12).forEach((b) => { ticks[b.id] = { at: at(date, '14:30'), byId: 'INC', byName: 'Incharge' }; });
  boxes.slice(12, 14).forEach((b) => { ticks[b.id] = { at: at(date, '17:10'), byId: 'INC', byName: 'Incharge' }; });
  assert.equal(openingScore(t, { ticks }, date, '16:00'), (12 + 1) / 16);
  assert.equal(openingScore(t, null, date, '16:00'), 0);
  // The cover person's later deadline turns the same ticks into full marks.
  assert.equal(openingScore(t, { ticks }, date, '17:30'), 14 / 16);
});

test('who: the incharge, else the cover, else the backup, else the owner\'s pick', () => {
  const away = (ids: string[]) => (id: string) => ids.includes(id);
  assert.deepEqual(openingDoer(t, null, '2026-10-29', away([])), { personId: 'INC', as: 'assignee', dueBy: '16:00' });
  assert.deepEqual(openingDoer(t, null, '2026-10-29', away(['INC'])), { personId: 'COV', as: 'cover', dueBy: '17:30' });
  assert.equal(openingDoer(t, null, '2026-10-29', away(['INC', 'COV'])).personId, null);
  assert.equal(openingDoer({ ...t, backupId: 'BAK' }, null, '2026-10-29', away(['INC', 'COV'])).personId, 'BAK');
  assert.equal(openingDoer(t, { date: '2026-10-29', storeId: 'S1', ticks: {}, pickedId: 'PIK' }, '2026-10-29', away(['INC', 'COV'])).personId, 'PIK');
});

console.log(`openingRules: ${passed} tests passed`);
