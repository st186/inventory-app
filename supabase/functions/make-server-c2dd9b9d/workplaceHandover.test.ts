// Tests for workplaceHandover.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/workplaceHandover.test.ts
import assert from 'node:assert/strict';
import { holderOn, settled } from './workplaceHandover.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const item = { id: 'freezer', assigneeId: 'BM002', coverId: null, handover: { to: 'BM004', from: '2026-10-31', coverId: 'BM002' } };

test('today stays with Vijay; from the 31st Aniket has it and Vijay stands in', () => {
  assert.deepEqual(holderOn(item, '2026-10-30'), { assigneeId: 'BM002', coverId: null });
  assert.deepEqual(holderOn(item, '2026-10-31'), { assigneeId: 'BM004', coverId: 'BM002' });
  assert.deepEqual(holderOn({ assigneeId: 'BM010' }, '2026-11-05'), { assigneeId: 'BM010', coverId: null });
});

test('the checklist shows the handover once it has started, and not before', () => {
  const t = { locationId: 'ph', items: [item, { id: 'walls', assigneeId: 'BM002', coverId: null }] };
  assert.equal(settled(t, '2026-10-30'), t);
  const after = settled(t, '2026-10-31');
  assert.deepEqual(after.items[0], { id: 'freezer', assigneeId: 'BM004', coverId: 'BM002' });
  assert.deepEqual(after.items[1], { id: 'walls', assigneeId: 'BM002', coverId: null });
  assert.equal(after.locationId, 'ph');
});

console.log(`workplaceHandover: ${passed} tests passed`);
