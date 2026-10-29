// Tests for the shared stock pieces in recalibrationMath.ts: shipped pieces and momos an event
// stall sends back (expected stock itself: countMath.test.ts).
//   node scripts/stock-test.mjs
import assert from 'node:assert/strict';
import { eventReturnsBack, sumShippedPieces } from './recalibrationMath';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; }
};

// Ship times are UTC ISO strings, as the server stores them; IST is +5:30.
const requests = [
  { id: 'r1', storeId: 'STORE-1', status: 'delivered', chicken: 300, shippedQuantities: { chicken: 250 }, shippedAt: '2026-10-03T05:00:00Z' },
  { id: 'r2', storeId: 'EVENT-1', eventId: 'EVENT-1', productionHouseId: 'PH-1', status: 'delivered', chicken: 200, veg: 60, shippedAt: '2026-10-11T04:00:00Z' },
  { id: 'r3', storeId: 'STORE-9', status: 'shipped', chicken: 100, shippedAt: '2026-10-05T04:00:00Z' }, // another house
  { id: 'r4', storeId: 'STORE-1', status: 'pending', chicken: 500 }, // not shipped
  { id: 'r5', storeId: 'STORE-1', status: 'shipped', chicken: 100, shippedAt: '2026-09-29T04:00:00Z' },
];
// Leftovers from the event: counted in by production on 14 Oct (IST), one still on the way.
const returns = [
  { id: 'm1', eventId: 'EVENT-1', productionHouseId: 'PH-1', status: 'received', returned: { chicken: 50, veg: 20 }, receivedQuantities: { chicken: 48, veg: 20 }, receivedAt: '2026-10-14T06:30:00Z' },
  { id: 'm2', eventId: 'EVENT-1', productionHouseId: 'PH-1', status: 'sent', returned: { chicken: 30 } },
  { id: 'm3', eventId: 'EVENT-2', productionHouseId: 'PH-9', status: 'received', receivedQuantities: { chicken: 10 }, receivedAt: '2026-10-14T06:30:00Z' },
  { id: 'm4', eventId: 'EVENT-1', productionHouseId: 'PH-1', status: 'wasted_only', wasted: { chicken: 5 } },
];

test('shipped pieces use the shipped count when there is one', () => {
  assert.equal(sumShippedPieces([requests[0]]).chicken, 250);
  assert.equal(sumShippedPieces([requests[1]]).veg, 60);
});

test('only returns production counted in, for this house, inside the window', () => {
  const back = eventReturnsBack(returns, ['PH-1'], (at) => at.startsWith('2026-10'));
  assert.equal(back.chicken, 48); // production's count, not the 50 the stall said it sent
  assert.equal(back.veg, 20);
  assert.equal(eventReturnsBack(returns, ['PH-1'], (at) => at.startsWith('2026-09')).chicken, 0);
});

console.log(`recalibrationMath: ${passed} tests passed`);
