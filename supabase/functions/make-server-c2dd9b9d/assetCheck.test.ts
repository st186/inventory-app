// Tests for the equipment check and spot check rules (assetRules.ts). Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/assetCheck.test.ts
import assert from 'node:assert/strict';
import { checkNeedsPhoto, checkPeriodOf, checkable, nextCheckPeriod, pickSpotCheck, type Asset } from './assetRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

test('the check is open from the 25th of Jan / Apr / Jul / Oct to the 5th of the next month', () => {
  assert.equal(checkPeriodOf('2026-10-24'), null);
  assert.equal(checkPeriodOf('2026-10-25'), '2026-10');
  assert.equal(checkPeriodOf('2026-10-31'), '2026-10');
  assert.equal(checkPeriodOf('2026-11-05'), '2026-10');
  assert.equal(checkPeriodOf('2026-11-06'), null);
  assert.equal(checkPeriodOf('2027-02-03'), '2027-01');
  assert.equal(checkPeriodOf('2026-12-31'), null);
});

test('the next check', () => {
  assert.equal(nextCheckPeriod('2026-10-30'), '2026-10'); // open now
  assert.equal(nextCheckPeriod('2026-11-10'), '2027-01');
  assert.equal(nextCheckPeriod('2027-01-10'), '2027-01'); // later this month
  assert.equal(nextCheckPeriod('2027-03-30'), '2027-04');
});

const asset = (id: string, cost: number | null, more: Partial<Asset> = {}): Asset => ({
  id, name: id, category: 'other', locationKind: 'production_house', locationId: 'PH', quantity: 1, unitCost: cost, totalCost: cost,
  purchaseDate: null, condition: 'good', notes: '', source: { kind: 'opening' }, needsReview: false, createdAt: '', updatedAt: '', updatedBy: '', ...more,
});

test('a photo for anything over Rs 2,000 apiece; a set is judged per piece', () => {
  assert.equal(checkNeedsPhoto(asset('steamer', 6500)), true);
  assert.equal(checkNeedsPhoto(asset('ladle', 150)), false);
  assert.equal(checkNeedsPhoto({ unitCost: null, totalCost: 2400, quantity: 12 }), false); // 12 trays at Rs 200
  assert.equal(checkNeedsPhoto(asset('unpriced', null)), false);
});

test('the check covers what is still there and confirmed', () => {
  assert.equal(checkable(asset('a', 1)), true);
  assert.equal(checkable(asset('b', 1, { condition: 'disposed' })), false);
  assert.equal(checkable(asset('c', 1, { needsReview: true })), false);
  assert.equal(checkable(asset('d', 1, { dismissed: true })), false);
  assert.equal(checkable(asset('e', 1, { condition: 'missing' })), true); // still on the list to look for
});

test("the auditor's 5: same for the same audit, two costly ones first, never a missing or disposed item", () => {
  const list = [
    asset('freezer', 18000), asset('steamer', 6500), asset('moktu', 3200), asset('ladle', 150), asset('bin', 400),
    asset('tray', 200), asset('knife', 300), asset('gone', 5000, { condition: 'missing' }), asset('old', 900, { condition: 'disposed' }),
  ];
  const a = pickSpotCheck(list, 'audit-1');
  assert.equal(a.length, 5);
  assert.deepEqual(a.map((x) => x.id), pickSpotCheck(list, 'audit-1').map((x) => x.id));
  assert.equal(a.slice(0, 2).every((x) => checkNeedsPhoto(x)), true);
  assert.equal(a.some((x) => x.id === 'gone' || x.id === 'old'), false);
  assert.notDeepEqual(pickSpotCheck(list, 'audit-2').map((x) => x.id), a.map((x) => x.id)); // another audit, another pick
  assert.equal(pickSpotCheck(list.slice(0, 3), 'x').length, 3); // fewer than 5 at the place: all of them
});

console.log(`assetCheck: ${passed} tests passed`);
