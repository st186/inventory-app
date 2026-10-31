// Tests for billCheck.ts's comparison (the photo reading itself needs the AI). Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/billCheck.test.ts
import assert from 'node:assert/strict';
import { amountTolerance, billProblems, type BillReading } from './billProblems.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const entry = { amount: 1800, date: '2026-11-01', what: 'Installation of Electric Board · by SK Jamir' };
const ok: BillReading = { isBill: true, total: 1800, date: '2026-11-01', seller: 'Jamir Electric', items: 'electric board fitting, wire', matchesEntry: true, why: '' };
const kinds = (r: Partial<BillReading>, used = null as any) => billProblems(entry, { ...ok, ...r }, used).map((p) => p.kind);

test('a bill that agrees: nothing to say', () => {
  assert.deepEqual(kinds({}), []);
  assert.deepEqual(kinds({ total: 1810 }), []); // within ₹54 (3%)
  assert.deepEqual(kinds({ total: null, date: null, seller: null }), []); // nothing readable: not judged
  assert.deepEqual(kinds({ date: '2026-10-30' }), []); // 2 days: fine
});

test('the amount', () => {
  assert.equal(amountTolerance(100), 10);
  assert.equal(amountTolerance(1800), 54);
  assert.deepEqual(kinds({ total: 2300 }), ['bill_amount']);
  assert.match(billProblems(entry, { ...ok, total: 2300 })[0].message, /₹2,300.*₹1,800/);
  assert.equal(billProblems(entry, { ...ok, total: 1500 })[0].title, 'The bill is for less');
});

test('an old bill, or one dated later', () => {
  assert.deepEqual(kinds({ date: '2026-10-12' }), ['bill_date']);
  assert.equal(billProblems(entry, { ...ok, date: '2026-10-12' })[0].title, 'An old bill?');
  assert.equal(billProblems(entry, { ...ok, date: '2026-11-09' })[0].title, 'The bill is dated later');
});

test('not a bill, something else, used twice', () => {
  assert.deepEqual(kinds({ isBill: false, total: 900, why: 'It is a photo of a switchboard.' }), ['bill_not_bill']);
  assert.deepEqual(kinds({ matchesEntry: false, items: 'gas cylinder' }), ['bill_item']);
  assert.deepEqual(kinds({}, { expenseId: 'E9', date: '2026-10-28', what: 'Wiring', amount: 1800 }), ['bill_reused']);
  assert.deepEqual(kinds({ total: 2300, date: '2026-10-12', matchesEntry: false }), ['bill_amount', 'bill_date', 'bill_item']);
});

console.log(`billCheck: ${passed} tests passed`);
