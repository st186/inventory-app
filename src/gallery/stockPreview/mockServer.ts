// Dev-only (stock-preview.html): made-up stores, requests, production and stock-outs, served by
// replacing window.fetch for the app's server address, so the real screens run without a
// sign-in or a network. Names are invented.
import { API_BASE } from '../../utils/http';
import { getTodayIST, addDays } from '../../utils/timezone';

const today = getTodayIST();
const tomorrow = addDays(today, 1);
const yesterday = addDays(today, -1);
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

export const KEYS = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'] as const;
const LONG: Record<string, string> = {
  chicken: 'chickenMomos', chickenCheese: 'chickenCheeseMomos', veg: 'vegMomos', cheeseCorn: 'cheeseCornMomos', paneer: 'paneerMomos',
  vegKurkure: 'vegKurkureMomos', chickenKurkure: 'chickenKurkureMomos',
};

export const stores = [
  { id: 'STORE-1', name: 'Bidhan Nagar', productionHouseId: 'PH-1' },
  { id: 'STORE-2', name: 'City Centre', productionHouseId: 'PH-1' },
];
export const productionHouses = [{ id: 'PH-1', name: 'Benachity kitchen', inventory: {} }];
export const inventoryItems = [
  ['chicken', 'Chicken Momo'], ['chicken_cheese', 'Chicken Cheese Momo'], ['veg', 'Veg Momo'], ['cheese_corn', 'Cheese Corn Momo'],
  ['paneer', 'Paneer Momo'], ['veg_kurkure', 'Veg Kurkure Momo'], ['chicken_kurkure', 'Chicken Kurkure Momo'],
].map(([name, displayName], i) => ({ id: `item-${i}`, name, displayName, category: 'finished_product', isActive: true, unit: 'pcs', linkedEntityType: 'global' }));

const momos = (q: Partial<Record<string, number>>) => Object.fromEntries(KEYS.map((k) => [k, q[k] || 0]));

let requests: any[] = [];
export function seedRequests(variant: string) {
  requests = [
    // Production queue
    { id: 'a1f3c9d2-new', storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestedBy: 'BM001', requestedByName: 'Nabendu', status: 'pending', requestDate: tomorrow, createdAt: at(today, '08:42'), updatedAt: at(today, '08:42'), ...momos({ chicken: 300, chickenCheese: 120, veg: 100, cheeseCorn: 60, paneer: 60, vegKurkure: 40, chickenKurkure: 80 }), sauces: { 'Red Sauce': true, 'Korean Sauce': true }, kitchenUtilities: { Butter: { quantity: 2, unit: 'pkt' } }, notes: 'Saturday rush expected' },
    { id: 'b7e1aa40-pack', storeId: 'STORE-2', storeName: 'City Centre', requestedBy: 'BM007', requestedByName: 'Rupa', status: 'in-preparation', requestDate: tomorrow, createdAt: at(today, '08:10'), updatedAt: at(today, '09:30'), acceptedAt: at(today, '09:00'), ...momos({ chicken: 200, veg: 80, paneer: 40, chickenKurkure: 60 }) },
    { id: 'c03d77e1-event', storeId: 'EVENT-1', storeName: 'Durgapur Winter Fair', eventId: 'EVENT-1', productionHouseId: 'PH-1', parentStoreId: 'STORE-1', requestedBy: 'BM011', requestedByName: 'Arif', status: 'prepared', requestDate: today, createdAt: at(yesterday, '19:05'), updatedAt: at(today, '07:50'), acceptedAt: at(yesterday, '20:00'), preparedAt: at(today, '07:50'), ...momos({ chicken: 150, chickenCheese: 60, veg: 40 }) },
    { id: 'd52b9f10-sent', storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestedBy: 'BM001', requestedByName: 'Nabendu', status: 'shipped', requestDate: variant === 'sent' ? today : yesterday, createdAt: at(variant === 'sent' ? today : yesterday, '08:30'), updatedAt: at(variant === 'sent' ? today : yesterday, '14:10'), acceptedAt: at(variant === 'sent' ? today : yesterday, '09:00'), preparedAt: at(variant === 'sent' ? today : yesterday, '12:40'), shippedAt: at(variant === 'sent' ? today : yesterday, '14:10'), ...momos({ chicken: 250, chickenCheese: 100, veg: 100, paneer: 40, chickenKurkure: 60 }), sauces: { 'Red Sauce': true, 'Green Sauce': true }, shippedSauces: { 'Red Sauce': true, 'Green Sauce': false }, shippingQuantities: undefined, shippedQuantities: { chicken: 250, chickenCheese: 100, veg: 80, paneer: 40, chickenKurkure: 60 }, shippingNotes: { veg: 'Batch ran short', 'sauce_Green Sauce': 'Not made today' }, dispatch: { bags: { chicken: 5, chickenCheese: 5, veg: 4, paneer: 2, chickenKurkure: 3 }, batches: { chicken: [{ code: '0511-CHK-B2', pieces: 250 }] }, boxes: 2, containerNumbers: 'Box 1-2', packedBy: 'Sohel', checkedBy: 'Mitali', packedAt: at(variant === 'sent' ? today : yesterday, '13:55') } },
    { id: 'e9a01c55-done', storeId: 'STORE-2', storeName: 'City Centre', requestedBy: 'BM007', requestedByName: 'Rupa', status: 'delivered', requestDate: yesterday, createdAt: at(yesterday, '08:20'), updatedAt: at(yesterday, '17:00'), shippedAt: at(yesterday, '13:00'), deliveredAt: at(yesterday, '16:50'), ...momos({ chicken: 200, veg: 60 }), shippedQuantities: { chicken: 200, veg: 60 }, receipt: { lines: { chicken: { shipped: 200, received: 200, damaged: 0 }, veg: { shipped: 60, received: 58, damaged: 2, damageReason: 'crushed' } }, saucesMissing: [], boxesReceived: 1, hardFrozen: true, receivedBy: 'u7', receivedByName: 'Rupa', receivedAt: at(yesterday, '16:50'), photoIds: [] } },
  ];
  for (let i = 2; i <= 9; i++) {
    const d = addDays(today, -i);
    requests.push({ id: `old-${i}-store1`, storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestedBy: 'BM001', requestedByName: 'Nabendu', status: 'delivered', requestDate: d, createdAt: at(d, '08:35'), updatedAt: at(d, '17:00'), shippedAt: at(d, '13:00'), deliveredAt: at(d, '16:30'), ...momos({ chicken: 200 + i * 10, chickenCheese: 80, veg: 80, cheeseCorn: 40, paneer: 40, vegKurkure: 20, chickenKurkure: 60 }), shippedQuantities: momos({ chicken: 200 + i * 10, chickenCheese: 80, veg: 80, cheeseCorn: 40, paneer: 40, vegKurkure: 20, chickenKurkure: 60 }) });
  }
  return requests;
}

export const productionData: any[] = Array.from({ length: 12 }, (_, i) => {
  const date = addDays(today, -i - (i > 4 ? 1 : 0));
  const finals = { chicken: 450 + (i % 3) * 20, chickenCheese: 180, veg: 150, cheeseCorn: 100, paneer: 90, vegKurkure: 100, chickenKurkure: 140 };
  const rec: any = { id: `prod-${i}`, date, productionHouseId: 'PH-1', storeId: 'PH-1', createdBy: 'Sohel', approvalStatus: i === 0 ? 'pending' : i === 1 ? 'pending' : 'approved', approvedBy: i > 1 ? 'Subrata' : null, wastage: { dough: 0.4, stuffing: 0.2, batter: 0.1, coating: 0 }, sauces: { panfriedSauce: 2, chilliChickenSauce: 1.5, spicyKoreanSauce: 1, hotGarlicSauce: 1, tandooriSauce: 0.5, soupPremix: 1, greenMayoChutney: 2, spicyRedChutney: 2 }, batches: {} };
  KEYS.forEach((k) => {
    rec[LONG[k]] = k.includes('Kurkure') ? { batter: 0, coating: 0, final: finals[k] } : { dough: 0, stuffing: 0, final: finals[k] };
    rec.batches[LONG[k]] = [{ code: `${date.slice(8, 10)}${date.slice(5, 7)}-${k.slice(0, 3).toUpperCase()}-B1`, pieces: finals[k] }];
  });
  return rec;
}).filter((p) => p.date !== today);

const salesData = Array.from({ length: 10 }, (_, i) => {
  const date = addDays(today, -i);
  return ['STORE-1', 'STORE-2'].map((storeId) => ({ id: `s-${storeId}-${i}`, storeId, date, data: { 'Chicken Momos': 180, 'Chicken Cheese Momos': 70, 'Veg Momos': 60, 'Cheese Corn Momos': 30, 'Paneer Momos': 30, 'Veg Kurkure Momos': 20, 'Chicken Kurkure Momos': 50 } }));
}).flat();

let stockOuts: any[] = [
  { id: 'so1', storeId: 'STORE-1', item: 'Chicken Cheese Momo', category: 'momo', reason: 'short_delivery', startAt: at(today, '09:40'), endAt: null, offOnline: true, createdByName: 'Tumpa', createdAt: at(today, '09:42') },
  { id: 'so2', storeId: 'STORE-1', item: 'Korean Sauce', category: 'sauce', reason: 'ingredient', startAt: at(today, '08:05'), endAt: null, offOnline: false, createdByName: 'Tumpa', createdAt: at(today, '08:06') },
  { id: 'so3', storeId: 'STORE-1', item: 'Paneer Momo', category: 'momo', reason: 'sold_out', startAt: at(yesterday, '20:10'), endAt: at(yesterday, '21:30'), offOnline: true, backOnline: true, createdByName: 'Raju', createdAt: at(yesterday, '20:11') },
];

function forecast() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  return days.map((date, i) => ({
    date, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00`).getDay()], revenue: 9800 + i * 300, revenueLow: 8000, revenueHigh: 12000,
    pieces: { chicken: 210 + i * 5, chickenCheese: 80, veg: 70, cheeseCorn: 35, paneer: 35, vegKurkure: 22, chickenKurkure: 55 }, vegPieces: 162, nonVegPieces: 345, basis: 'last 8 same weekdays',
  }));
}

const firstOfMonth = `${today.slice(0, 7)}-01`;
const routes: { method: string; re: RegExp; reply: (m: RegExpMatchArray, body: any, url: URL) => any }[] = [
  { method: 'GET', re: /\/production-requests$/, reply: () => ({ requests }) },
  { method: 'POST', re: /\/production-requests$/, reply: (_m, body) => { const r = { ...body, id: `new-${Date.now()}`, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storeName: 'Bidhan Nagar' }; requests.unshift(r); return { request: r }; } },
  { method: 'PUT', re: /\/production-requests\/([^/]+)\/status$/, reply: (m, body) => { const r = requests.find((x) => x.id === m[1]); if (r) { r.status = body.status; if (body.status === 'prepared') r.preparedAt = new Date().toISOString(); if (body.status === 'accepted') r.acceptedAt = new Date().toISOString(); } return { request: r }; } },
  { method: 'PUT', re: /\/production-requests\/([^/]+)\/ship$/, reply: (m, body) => { const r = requests.find((x) => x.id === m[1]); Object.assign(r, { status: 'shipped', shippedAt: new Date().toISOString(), shippedQuantities: body.shippedQuantities, shippingNotes: body.shippingNotes, shippedSauces: body.shippedSauces, dispatch: body.dispatch }); return { request: r }; } },
  { method: 'PUT', re: /\/production-requests\/([^/]+)\/receive$/, reply: (m, body) => { const r = requests.find((x) => x.id === m[1]); Object.assign(r, { status: 'delivered', deliveredAt: new Date().toISOString(), receipt: { ...body.receipt, receivedByName: 'Tumpa', receivedAt: new Date().toISOString() } }); return { request: r }; } },
  { method: 'POST', re: /\/production-requests\/check-pending$/, reply: () => ({ checked: true, oldPendingCount: 0, newPendingCount: 0, notificationsSent: 0 }) },
  { method: 'GET', re: /\/sales-data$/, reply: () => ({ data: salesData }) },
  { method: 'GET', re: /\/stock-thresholds\//, reply: () => ({ thresholds: {} }) },
  { method: 'GET', re: /\/stock-recalibration\/history\//, reply: () => ({ history: [{ id: 'rc1', date: `${firstOfMonth}T09:00:00`, status: 'approved', locationName: 'Bidhan Nagar', items: inventoryItems.map((it, i) => ({ itemId: it.name, itemName: it.displayName, actualQuantity: 60 + i * 10, systemQuantity: 60 + i * 10, unit: 'pcs', difference: 0 })) }] }) },
  { method: 'GET', re: /\/stock-recalibration\/latest\//, reply: () => ({ record: { date: `${firstOfMonth}T09:00:00`, isOpeningBalance: true, status: 'approved', items: inventoryItems.map((it, i) => ({ itemId: it.name, actualQuantity: 60 + i * 10 })) }, lastRecalibration: `${firstOfMonth}T09:00:00` }) },
  { method: 'GET', re: /\/stock-recalibration\/pending-approval$/, reply: () => ({ recalibrations: [{ id: 'rc9', date: at(yesterday, '21:00'), locationName: 'Bidhan Nagar', locationType: 'store', status: 'pending', performedBy: 'someone-else', performedByName: 'Nabendu', items: [{ itemName: 'Chicken Momo', systemQuantity: 120, actualQuantity: 104, difference: -16, unit: 'pcs', adjustmentType: 'wastage', notes: 'Soft bag' }, { itemName: 'Veg Momo', systemQuantity: 60, actualQuantity: 64, difference: 4, unit: 'pcs', adjustmentType: 'counting_error' }] }] }) },
  { method: 'GET', re: /\/insights\/overview/, reply: () => ({ today, storeId: 'STORE-1', history: [], events: [], forecast: forecast(), learned: {} }) },
  { method: 'GET', re: /\/events\/momo-returns/, reply: (_m, _b, url) => ({ returns: url.searchParams.get('status') === 'sent' ? [{ id: 'mr1', eventId: 'EVENT-1', eventName: 'Durgapur Winter Fair', productionHouseId: 'PH-1', date: yesterday, returned: { chicken: 40, veg: 20 }, wasted: {}, returnedPieces: 60, wastedPieces: 0, wasteReason: null, status: 'sent' }] : [] }) },
  { method: 'GET', re: /\/production-ledger$/, reply: () => ({ entry: null, live: { pools: { dough: { opening: 1.2, prepared: 6, closingActual: null, wastage: null }, batter: { opening: 0.5, prepared: 2, closingActual: null, wastage: null }, 'stuffing:chicken': { opening: 0.8, prepared: 9, closingActual: null, wastage: 0.3 }, 'coating:chickenKurkure': { opening: 0.2, prepared: 1.5, closingActual: null, wastage: null } } }, items: [{ id: 'li1', momoKey: 'GLOBAL_DOUGH', globalPoolQty: 6, perTypePoolQty: 0, loggedByName: 'Sohel' }, { id: 'li2', momoKey: 'chickenMomos', globalPoolQty: 0, perTypePoolQty: 9, loggedByName: 'Sohel' }], hasAnyPriorRecord: true }) },
  { method: 'GET', re: /\/production-wastage-notes$/, reply: () => ({ notes: [{ id: 'wn1', description: 'Hot Garlic Sauce', quantity: 0.5, unit: 'L', reason: 'X', loggedByName: 'Sohel' }] }) },
  { method: 'GET', re: /\/production-weekly-goal$/, reply: () => ({ goal: { goals: { chickenMomos: 3200, vegMomos: 1100, chickenKurkureMomos: 900 } } }) },
  { method: 'GET', re: /\/stock-outs$/, reply: () => ({ entries: stockOuts }) },
  { method: 'POST', re: /\/stock-outs$/, reply: (_m, body) => { const e = { ...body, id: `so-${Date.now()}`, createdByName: 'Tumpa' }; stockOuts = [e, ...stockOuts]; return { entry: e }; } },
  { method: 'PUT', re: /\/stock-outs\/[^/]+\/([^/]+)$/, reply: (m, body) => { const e = stockOuts.find((x) => x.id === m[1]); Object.assign(e, body); return { entry: e }; } },
  { method: 'GET', re: /\/stock-wastage$/, reply: () => ({ entry: null }) },
  { method: 'GET', re: /\/utilities-consumption$/, reply: () => ({ success: true, startDate: '2026-07-19', endDate: yesterday, daysWithData: 108, boxesUsed: 8240, traysUsed: 3110, unattributedOrders: 4, beverageConsumption: { 'Coke 250ml': 410, 'Sprite 250ml': 230 } }) },
];

export function installMockServer() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!href.startsWith(API_BASE)) return realFetch(input, init);
    const url = new URL(href);
    const path = url.pathname.replace(/^.*make-server-c2dd9b9d/, '');
    const method = (init?.method || 'GET').toUpperCase();
    let body: any = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
    await new Promise((r) => setTimeout(r, 250));
    for (const route of routes) {
      const m = path.match(route.re);
      if (m && route.method === method) return new Response(JSON.stringify(route.reply(m, body, url)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

export const mockRequests = () => requests;
export { salesData };
