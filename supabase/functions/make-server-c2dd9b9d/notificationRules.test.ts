// Tests for the notification rules. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/notificationRules.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundles, inQuietHours, notificationCategory } from './notificationRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };
// IST wall-clock time today -> epoch ms.
const ist = (hhmm: string) => Date.parse(`2026-10-28T${hhmm}:00+05:30`);

test('categories', () => {
  assert.equal(notificationCategory('repair_alert'), 'urgent');
  assert.equal(notificationCategory('workplace_alarm'), 'urgent');
  assert.equal(notificationCategory('complaint_explain'), 'urgent');
  assert.equal(notificationCategory('escalation'), 'urgent'); // the owner's "not seen yet" is never held for the digest
  assert.equal(notificationCategory('leave_pending'), 'action');
  assert.equal(notificationCategory('cash_topup_request'), 'action');
  assert.equal(notificationCategory('expense_flag'), 'action');
  assert.equal(notificationCategory('workplace_due'), 'reminder');
  assert.equal(notificationCategory('attendance_reminder'), 'reminder');
  assert.equal(notificationCategory('leave_approved'), 'update');
  assert.equal(notificationCategory('inventory_logged'), 'update');
});

test('bundling', () => {
  assert.equal(bundles('inventory_logged'), true);
  assert.equal(bundles('expense_flag'), true);
  assert.equal(bundles('leave_pending'), false); // needs its own approve / reject
  assert.equal(bundles('repair_alert'), false); // urgent never folds away
});

test('quiet hours, also across midnight', () => {
  const night = { quietOn: true, quietFrom: '23:00', quietTo: '07:00' };
  assert.equal(inQuietHours(night, ist('23:30')), true);
  assert.equal(inQuietHours(night, ist('02:00')), true);
  assert.equal(inQuietHours(night, ist('07:00')), false);
  assert.equal(inQuietHours(night, ist('12:00')), false);
  assert.equal(inQuietHours({ ...night, quietOn: false }, ist('02:00')), false);
  assert.equal(inQuietHours({ quietOn: true, quietFrom: '13:00', quietTo: '15:00' }, ist('14:00')), true);
  assert.equal(inQuietHours(null, ist('02:00')), false);
});

test('the app copy matches the server copy', () => {
  const body = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').split('\n').slice(2).join('\n');
  assert.equal(body('../../../src/utils/notificationRules.ts'), body('./notificationRules.ts'));
});

console.log(`notificationRules: ${passed} tests passed`);
