// The nightly stock check (server stockCheck.ts, owner 31 Oct 2026) must work out what should be
// left exactly as the app's stock screens do (countMath.ts). Same data through both.
//   node scripts/stock-test.mjs
import assert from 'node:assert/strict';
import { houseExpected, lastCount as appLastCount, storeExpected } from './countMath';
import { houseDay, lastCount as checkLastCount, storeDay, MOMO_KEYS } from '../../../supabase/functions/make-server-c2dd9b9d/stockCheck';

const HOUSE = 'house-1';
const STORE = 'STORE-1';
const houseCount = { id: 'h', date: '2026-10-31T19:46:30.861Z', status: 'approved', items: [{ itemId: 'chicken', actualQuantity: 1113 }, { itemId: 'veg', actualQuantity: 122 }, { itemId: 'chicken_cheese', actualQuantity: 75 }] };
const storeCount = { id: 's', date: '2026-10-31T23:15:00.000Z', status: 'pending', items: [{ itemId: 'chicken', actualQuantity: 300 }, { itemId: 'chicken_kurkure', actualQuantity: 20 }] };
const production = [
  { date: '2026-10-31', productionHouseId: HOUSE, approvalStatus: 'pending', chickenMomos: { final: 713 }, chickenKurkureMomos: { final: 60 } },
  { date: '2026-11-01', productionHouseId: HOUSE, approvalStatus: 'approved', chickenMomos: { final: 800 }, chickenKurkureMomos: { final: 100 }, vegMomos: { final: 50 } },
  { date: '2026-11-02', productionHouseId: HOUSE, approvalStatus: 'rejected', chickenMomos: { final: 999 } },
  { date: '2026-11-03', storeId: HOUSE, chickenCheeseMomos: { final: 40 }, vegKurkureMomos: { final: 20 }, vegMomos: { final: 30 } },
];
const requests = [
  { storeId: STORE, status: 'delivered', shippedAt: '2026-10-31T10:46:39Z', deliveredAt: '2026-10-31T12:00:26Z', shippedQuantities: { chicken: 400, veg: 6, chickenKurkure: 60 } },
  { storeId: STORE, status: 'delivered', shippedAt: '2026-11-01T10:40:00Z', deliveredAt: '2026-11-01T11:30:00Z', shippedQuantities: { chicken: 600, chickenKurkure: 100, veg: 30 } },
  { storeId: STORE, status: 'partially-delivered', shippedAt: '2026-11-02T10:40:00Z', deliveredAt: '2026-11-02T19:00:00Z', chicken: 500, shippedQuantities: { chicken: 450 } },
  { storeId: STORE, status: 'shipped', shippedAt: '2026-11-03T10:40:00Z', chicken: 300 },
  { storeId: STORE, status: 'pending', requestDate: '2026-11-04', chicken: 900 },
];
const sales = [
  { storeId: STORE, date: '2026-10-31', data: { 'Chicken Momos': 500 } },
  { storeId: STORE, date: '2026-11-01', data: { 'Chicken Momos': 720, 'Chicken Kurkure Momos': 60, 'Veg Momos': 24 } },
  { storeId: STORE, date: '2026-11-02', data: { 'Chicken Momos': 380, 'Corn Cheese Momos': 12 } },
  { storeId: STORE, date: '2026-11-03', data: { 'Chicken Momos': 410 } },
];
const wastage = [{ storeId: STORE, date: '2026-11-02', wastage: { chicken: 6, veg: 2 } }];
const stores = [{ id: STORE, productionHouseId: HOUSE }];

for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
  const app = storeExpected({ base: appLastCount([storeCount]), storeId: STORE, requests, sales, wastage, until: day }).expected;
  const check = storeDay({ id: STORE, name: 'BM1', date: day, base: checkLastCount([storeCount]), requests, sales, wastage }).closing;
  for (const k of MOMO_KEYS) assert.equal(check[k], app[k], `store ${day} ${k}: check ${check[k]}, app ${app[k]}`);

  const appHouse = houseExpected({
    base: appLastCount([houseCount]), ids: { productionHouseUUID: HOUSE, effectiveStoreId: HOUSE, originalStoreId: HOUSE },
    productionData: production, requests, stores, until: day,
  }).expected;
  const checkHouse = houseDay({ id: HOUSE, name: 'House', date: day, base: checkLastCount([houseCount]), ids: [HOUSE], storeIds: [STORE], production, requests }).closing;
  for (const k of MOMO_KEYS) assert.equal(checkHouse[k], appHouse[k], `house ${day} ${k}: check ${checkHouse[k]}, app ${appHouse[k]}`);
}
console.log('stockCheckParity: the nightly check and the app agree on 3 days, store and production');
