// Tests for chat.ts's groups. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/chat.test.ts
import assert from 'node:assert/strict';
import { BUNNY_ID, bunnyTurns, canManageGroup, groupsFor, isLead, roleWord } from './chat.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const stores = [{ id: 'S1', name: 'Bunny Momos 1', productionHouseId: 'H1' }, { id: 'S2', name: 'Bunny Momos 2', productionHouseId: 'H1' }];
const houses = [{ id: 'H1', name: 'Main Production House BWN' }];
const staff = [
  { authUserId: 'owner', name: 'Owner', role: 'cluster_head' },
  { authUserId: 'aniket', name: 'Aniket', role: 'manager', designation: 'operations_incharge' },
  { authUserId: 'rohan', name: 'Rohan', role: 'employee', designation: 'store_incharge', storeId: 'S1' },
  { authUserId: 'crew1', name: 'Crew One', role: 'employee', designation: 'store_ops', storeId: 'S1' },
  { authUserId: 'vijay', name: 'Vijay', role: 'employee', designation: 'production_incharge', productionHouseId: 'H1', storeId: 'S1' }, // old store id mix-up
  { authUserId: 'cook', name: 'Cook', role: 'employee', designation: 'production_ops', assignedProductionHouseIds: ['H1'] },
  { authUserId: 'gone', name: 'Left', role: 'employee', designation: 'store_ops', storeId: 'S1', status: 'inactive' },
  { authUserId: 'audit', name: 'Auditor', role: 'audit', designation: 'site_auditor' },
  { name: 'No login', role: 'employee', designation: 'store_ops', storeId: 'S2' },
];
const ids = (g: { members: any[] }) => g.members.map((u) => u.authUserId).sort();

test('the groups: whole team, each store, the production house', () => {
  const groups = groupsFor(staff, stores, houses);
  assert.deepEqual(groups.map((g) => g.key), ['team', 'store:S1', 'store:S2', 'production:H1']);
  assert.deepEqual(ids(groups[0]), ['aniket', 'cook', 'crew1', 'owner', 'rohan', 'vijay']); // not the inactive, the auditor or no login
  assert.deepEqual(ids(groups[1]), ['aniket', 'crew1', 'owner', 'rohan']); // Vijay's old store id doesn't put him here
  assert.deepEqual(ids(groups[2]), ['aniket', 'owner']);
  assert.deepEqual(ids(groups[3]), ['aniket', 'cook', 'owner', 'vijay']);
});

test('who leads, and the word shown next to a name', () => {
  assert.equal(isLead(staff[0]), true);
  assert.equal(isLead(staff[1]), true);
  assert.equal(isLead(staff[2]), false);
  assert.deepEqual(staff.slice(0, 6).map(roleWord), ['Owner', 'Operations', 'Store incharge', 'Store', 'Production incharge', 'Kitchen']);
});

test('a chat with Bunny as turns', () => {
  const me = 'rohan';
  assert.deepEqual(bunnyTurns([
    { sender_id: BUNNY_ID, kind: 'text', body: 'Hi' }, // Bunny first: dropped
    { sender_id: me, kind: 'text', body: 'How many chicken yesterday?' },
    { sender_id: me, kind: 'voice', body: '' },
    { sender_id: BUNNY_ID, kind: 'text', body: '412 pieces.' },
    { sender_id: me, kind: 'photo', body: 'this one' },
  ]), [
    { role: 'user', content: 'How many chicken yesterday?\n[voice note]' },
    { role: 'assistant', content: '412 pieces.' },
    { role: 'user', content: '[photo] this one' },
  ]);
  assert.deepEqual(bunnyTurns([{ sender_id: me, kind: 'text', body: 'Q' }, { sender_id: BUNNY_ID, kind: 'text', body: 'A' }]), [{ role: 'user', content: 'Q' }]);
});

test('who may change a group', () => {
  const [owner, aniket, rohan, crew1] = staff;
  const made = { kind: 'custom', created_by: 'crew1' };
  assert.equal(canManageGroup(crew1, made), true); // made it
  assert.equal(canManageGroup(owner, made), true);
  assert.equal(canManageGroup(aniket, made), true);
  assert.equal(canManageGroup(rohan, made), false);
  assert.equal(canManageGroup(rohan, { kind: 'place', created_by: null }), false); // automatic: owner and operations only
  assert.equal(canManageGroup(owner, { kind: 'team', created_by: null }), true);
  assert.equal(canManageGroup(owner, { kind: 'direct', created_by: null }), false);
});

console.log(`chat: ${passed} tests passed`);
