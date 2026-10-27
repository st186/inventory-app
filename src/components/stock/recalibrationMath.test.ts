// Tests for the production side of Monthly Stock Recalibration's expected stock
// (recalibrationMath.ts), including momos an event stall sends back.
//   node scripts/stock-test.mjs
import assert from 'node:assert/strict';
import {
  eventReturnsBack, expectedStock, productionMonthMovement, productionMovementSince, productionPreviousMonthClosing, sumShippedPieces,
} from './recalibrationMath';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; }
};

const stores = [{ id: 'STORE-1', productionHouseId: 'PH-1' }, { id: 'STORE-9', productionHouseId: 'PH-9' }];
const ids = { productionHouseUUID: 'PH-1', effectiveStoreId: 'PH-1', originalStoreId: 'PH-1' };
const prod = (date: string, chicken: number, chickenKurkure = 0, veg = 0, house = 'PH-1') => ({
  date, productionHouseId: house, storeId: house,
  chickenMomos: { final: chicken }, chickenCheeseMomos: { final: 0 }, vegMomos: { final: veg }, cheeseCornMomos: { final: 0 },
  paneerMomos: { final: 0 }, vegKurkureMomos: { final: 0 }, chickenKurkureMomos: { final: chickenKurkure },
});
// Ship times are UTC ISO strings, as the server stores them; IST is +5:30.
const productionData = [
  prod('2026-10-02', 600, 100, 200),
  prod('2026-10-10', 500),
  prod('2026-10-12', 400, 0, 0, 'PH-9'), // another house
  prod('2026-09-28', 300),
];
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
const input = { productionData, requests, stores, ids };

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

test('this month: without returns the figures are what they were before', () => {
  const before = productionMonthMovement({ ...input, returns: [], month: '2026-10' });
  // made: chicken 600 + 500 - 100 folded into kurkure = 1000; veg 200; kurkure 100
  assert.equal(before.produced.chicken, 1000);
  assert.equal(before.produced.chickenKurkure, 100);
  assert.equal(before.produced.veg, 200);
  // sent: 250 to the store + 200 to the event (STORE-9 is another house's)
  assert.equal(before.sent.chicken, 450);
  assert.equal(before.sent.veg, 60);
  const opening = { chicken: 120, veg: 40 };
  assert.equal(expectedStock(opening, before).chicken, 670);
  assert.equal(expectedStock(opening, before).veg, 180);
});

test('this month: momos back from the event count as stock again', () => {
  const after = productionMonthMovement({ ...input, returns, month: '2026-10' });
  assert.equal(after.sent.chicken, 450 - 48);
  assert.equal(after.sent.veg, 60 - 20);
  const opening = { chicken: 120, veg: 40 };
  assert.equal(expectedStock(opening, after).chicken, 718);
  assert.equal(expectedStock(opening, after).veg, 200);
});

test('since a mid-month count: shipments and returns from the count on, production from the next day', () => {
  const since = '2026-10-10T20:00:00'; // count at 8 pm IST on 10 Oct
  const before = productionMovementSince({ ...input, returns: [], since });
  assert.equal(before.produced.chicken, 0); // 10 Oct's batch is left out (same day as the count)
  assert.equal(before.sent.chicken, 200); // only the event request, shipped 11 Oct
  const after = productionMovementSince({ ...input, returns, since });
  assert.equal(after.sent.chicken, 152);
  assert.equal(productionMovementSince({ ...input, returns, since: '2026-10-15T09:00:00' }).sent.chicken, 0);
});

test("last month's closing from transactions takes off returns counted in that month", () => {
  const closing = productionPreviousMonthClosing({ productionData, requests, stores, returns: [], locationId: 'PH-1', effectiveStoreId: 'PH-1', previousMonth: '2026-09' });
  assert.equal(closing.chicken, 300 - 100);
  const withReturns = productionPreviousMonthClosing({ productionData, requests, stores, returns, locationId: 'PH-1', effectiveStoreId: 'PH-1', previousMonth: '2026-10' });
  const without = productionPreviousMonthClosing({ productionData, requests, stores, returns: [], locationId: 'PH-1', effectiveStoreId: 'PH-1', previousMonth: '2026-10' });
  assert.equal(withReturns.chicken - without.chicken, 48);
});

console.log(`recalibrationMath: ${passed} tests passed`);
