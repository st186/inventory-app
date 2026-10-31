// Tests for punchTimesheet.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/punchTimesheet.test.ts
import assert from 'node:assert/strict';
import { AUTO_APPROVED_BY, timesheetFromPunch } from './punchTimesheet.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };
const NOW = '2026-10-31T04:00:00.000Z';
const at = (iso: string, verified = true) => ({ at: iso, verified });

// Vijay, 30 Oct 2026: in 8:07 AM, out 6:56 PM, both at the production house.
const vijay = { employeeId: 'BM002', date: '2026-10-30', in: at('2026-10-30T02:37:47.033Z'), out: at('2026-10-30T13:26:16.363Z'), outsideWorkplace: false, flags: [] };

test('checked in and out at work: approved straight away, in India time', () => {
  const s = timesheetFromPunch(vijay, null, NOW);
  assert.equal(s.startTime, '08:07');
  assert.equal(s.endTime, '18:56');
  assert.equal(s.totalHours, 10.81);
  assert.equal(s.status, 'approved');
  assert.equal(s.approvedBy, AUTO_APPROVED_BY);
  assert.equal(s.source, 'punch');
});

test('away from the workplace, no location or flagged: waits for approval', () => {
  // Rohan, 28 Oct: both taps about 2.9 km from the store.
  assert.equal(timesheetFromPunch({ ...vijay, employeeId: 'BM008', date: '2026-10-28', in: at('2026-10-28T06:09:07Z', false), out: at('2026-10-28T17:25:37Z', false), outsideWorkplace: true }, null, NOW).status, 'pending');
  assert.equal(timesheetFromPunch({ ...vijay, in: { at: vijay.in.at } }, null, NOW).status, 'pending');
  assert.equal(timesheetFromPunch({ ...vijay, flags: ['late_confirm'] }, null, NOW).status, 'pending');
});

test('nothing to write', () => {
  assert.equal(timesheetFromPunch({ ...vijay, out: null }, null, NOW), null);           // still at work
  assert.equal(timesheetFromPunch({ ...vijay, in: { ...vijay.in, exempt: true } }, null, NOW), null); // rider
  assert.equal(timesheetFromPunch({ ...vijay, out: at('2026-10-30T02:00:00Z') }, null, NOW), null); // out before in
  // Already sent by hand (29 Oct, typed 08:20-19:57): left alone.
  assert.equal(timesheetFromPunch(vijay, { id: 'x', startTime: '08:20', endTime: '19:57', status: 'pending' }, NOW), null);
  // Filled from these punches already.
  assert.equal(timesheetFromPunch(vijay, { id: 'x', source: 'punch', startTime: '08:07', endTime: '18:56', status: 'approved' }, NOW), null);
});

test('a later End shift updates a sheet filled from the punches, keeping its id', () => {
  const s = timesheetFromPunch(vijay, { id: 'x', source: 'punch', startTime: '08:07', endTime: '17:00', status: 'approved' }, NOW);
  assert.equal(s.id, 'x');
  assert.equal(s.endTime, '18:56');
});

test('a shift past midnight ends at 23:59 with the real hours', () => {
  const s = timesheetFromPunch({ ...vijay, date: '2026-10-30', in: at('2026-10-30T09:30:00Z'), out: at('2026-10-30T19:00:00Z') }, null, NOW);
  assert.equal(s.startTime, '15:00');
  assert.equal(s.endTime, '23:59');
  assert.equal(s.totalHours, 9.5);
});

console.log(`punchTimesheet: ${passed} passed`);
