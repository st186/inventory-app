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
    { id: 'a1f3c9d2-new', storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestedBy: 'BM001', requestedByName: 'Nabendu', status: 'pending', requestDate: tomorrow, createdAt: at(today, '08:42'), updatedAt: at(today, '08:42'), ...momos({ chicken: 300, chickenCheese: 100, veg: 100, cheeseCorn: 50, paneer: 50, vegKurkure: 50, chickenKurkure: 100 }), sauces: { 'Red Sauce': true, 'Korean Sauce': true }, kitchenUtilities: { Butter: { quantity: 2, unit: 'pkt' } }, notes: 'Saturday rush expected' },
    { id: 'b7e1aa40-pack', storeId: 'STORE-2', storeName: 'City Centre', requestedBy: 'BM007', requestedByName: 'Rupa', status: 'in-preparation', requestDate: tomorrow, createdAt: at(today, '08:10'), updatedAt: at(today, '09:30'), acceptedAt: at(today, '09:00'), ...momos({ chicken: 200, veg: 100, paneer: 50, chickenKurkure: 50 }) },
    { id: 'c03d77e1-event', storeId: 'EVENT-1', storeName: 'Durgapur Winter Fair', eventId: 'EVENT-1', productionHouseId: 'PH-1', parentStoreId: 'STORE-1', requestedBy: 'BM011', requestedByName: 'Arif', status: 'prepared', requestDate: today, createdAt: at(yesterday, '19:05'), updatedAt: at(today, '07:50'), acceptedAt: at(yesterday, '20:00'), preparedAt: at(today, '07:50'), ...momos({ chicken: 150, chickenCheese: 50, veg: 50 }) },
    { id: 'd52b9f10-sent', storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestedBy: 'BM001', requestedByName: 'Nabendu', status: 'shipped', requestDate: variant === 'sent' ? today : yesterday, createdAt: at(variant === 'sent' ? today : yesterday, '08:30'), updatedAt: at(variant === 'sent' ? today : yesterday, '14:10'), acceptedAt: at(variant === 'sent' ? today : yesterday, '09:00'), preparedAt: at(variant === 'sent' ? today : yesterday, '12:40'), shippedAt: at(variant === 'sent' ? today : yesterday, '14:10'), ...momos({ chicken: 250, chickenCheese: 100, veg: 100, paneer: 50, chickenKurkure: 50 }), sauces: { 'Red Sauce': true, 'Green Sauce': true }, shippedSauces: { 'Red Sauce': true, 'Green Sauce': false }, shippingQuantities: undefined, shippedQuantities: { chicken: 250, chickenCheese: 100, veg: 50, paneer: 50, chickenKurkure: 50 }, shippingNotes: { veg: 'Batch ran short', 'sauce_Green Sauce': 'Not made today' }, dispatch: { bags: { chicken: 5, chickenCheese: 2, veg: 1, paneer: 1, chickenKurkure: 1 }, batches: { chicken: [{ code: '0511-CHK-B2', pieces: 250 }] }, boxes: 2, containerNumbers: 'Box 1-2', packedBy: 'Sohel', checkedBy: 'Mitali', packedAt: at(variant === 'sent' ? today : yesterday, '13:55') } },
    { id: 'e9a01c55-done', storeId: 'STORE-2', storeName: 'City Centre', requestedBy: 'BM007', requestedByName: 'Rupa', status: 'delivered', requestDate: yesterday, createdAt: at(yesterday, '08:20'), updatedAt: at(yesterday, '17:00'), shippedAt: at(yesterday, '13:00'), deliveredAt: at(yesterday, '16:50'), ...momos({ chicken: 200, veg: 50 }), shippedQuantities: { chicken: 200, veg: 50 }, receipt: { lines: { chicken: { shipped: 200, received: 200, damaged: 0 }, veg: { shipped: 50, received: 48, damaged: 2, damageReason: 'crushed' } }, saucesMissing: [], boxesReceived: 1, hardFrozen: true, receivedBy: 'u7', receivedByName: 'Rupa', receivedAt: at(yesterday, '16:50'), photoIds: [] } },
  ];
  for (let i = 2; i <= 9; i++) {
    const d = addDays(today, -i);
    const sent = { chicken: 250, chickenCheese: 50, veg: 100, cheeseCorn: 50, paneer: i % 3 === 0 ? 50 : 0, vegKurkure: i === 6 ? 50 : 0, chickenKurkure: 50 };
    requests.push({
      id: `old-${i}-store1`, storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestedBy: 'BM001', requestedByName: 'Nabendu', status: 'delivered', requestDate: d, createdAt: at(d, '08:35'), updatedAt: at(d, '17:00'), shippedAt: at(d, '13:00'), deliveredAt: at(d, '16:30'),
      ...momos(sent), shippedQuantities: momos(sent),
      kitchenUtilities: { Coriander: { quantity: 1, unit: 'bundle' }, ...(i % 2 === 0 ? { Oil: { quantity: 2, unit: 'litre' } } : {}) },
      sauces: i % 2 === 0 ? { 'Soup Premix': true } : {},
      utilities: i % 3 === 0 ? { 'Table Box': 100 } : {},
    });
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

const firstOfMonth = `${today.slice(0, 7)}-01`;

// The production day (KitchenDay.tsx). Learn the app's production chapters start at different points
// of the day (learn/chapters.ts): prod-morning on a fresh morning, prod-batches once the morning is
// counted, prod-evening with the day's batches logged too. ?kd=batches|evening does the same here.
const PRACTICE = (globalThis as { __BUNNY_PRACTICE__?: { chapter?: string; name?: string } }).__BUNNY_PRACTICE__;
const KD_STAGE = PRACTICE?.chapter === 'prod-evening' || new URLSearchParams(globalThis.location?.search || '').get('kd') === 'evening' ? 'evening'
  : PRACTICE?.chapter === 'prod-batches' || new URLSearchParams(globalThis.location?.search || '').get('kd') === 'batches' ? 'batches' : 'morning';
const COOK = PRACTICE?.name || 'Sohel';
const LAST_NIGHT: Record<string, number> = { dough: 1.2, batter: 0.5, 'stuffing:chicken': 0.8, 'coating:chickenKurkure': 0.2, 'sauce:spicyRedChutney': 1.5, 'sauce:greenMayoChutney': 0.8 };
const MORNING_COUNTS: Record<string, number> = {
  dough: 1.2, 'dough:cheeseCorn': 0, 'stuffing:chicken': 0.8, 'stuffing:chickenCheese': 0, 'stuffing:veg': 0, 'stuffing:cheeseCorn': 0, 'stuffing:paneer': 0,
  batter: 0.5, 'coating:vegKurkure': 0, 'coating:chickenKurkure': 0.2,
  'sauce:panfriedSauce': 0, 'sauce:chilliChickenSauce': 0, 'sauce:spicyKoreanSauce': 0, 'sauce:hotGarlicSauce': 0, 'sauce:tandooriSauce': 0, 'sauce:soupPremix': 0, 'sauce:greenMayoChutney': 0.8, 'sauce:spicyRedChutney': 1.5,
};
let morningWeighIn: any = KD_STAGE === 'morning' ? null
  : { productionHouseId: 'PH-1', date: today, counts: MORNING_COUNTS, thaw: { 'stuffing:chicken': { frozen: false } }, at: `${today}T08:12:00.000Z`, by: 'BM020', byName: COOK };
const item = (id: string, momoKey: string, globalPoolQty: number, perTypePoolQty: number, hhmm: string) => ({ id, momoKey, globalPoolQty, perTypePoolQty, loggedByName: COOK, loggedAt: `${today}T${hhmm}:00.000Z` });
let ledgerItems: any[] = KD_STAGE === 'evening' ? [item('li1', 'GLOBAL_DOUGH', 9, 0, '08:40'), item('li2', 'chickenMomos', 0, 9, '09:15'), item('li3', 'GLOBAL_BATTER', 1.5, 0, '11:30')] : [];
let ledgerClosed: { closingActuals: Record<string, number>; sauceLeft: Record<string, number>; leftoverReport: any } | null = null;
let wastageNotes: any[] = [{ id: 'wn1', description: 'Hot Garlic Sauce', quantity: 0.5, unit: 'L', reason: 'X', loggedByName: COOK }];
// India time now as the server keeps it (getNowIST: IST digits with a Z).
const nowIstIso = () => new Date(Date.now() + 330 * 60000).toISOString();
function ledgerPools() {
  const pools: Record<string, any> = {};
  const ids = ['dough', 'batter', 'stuffing:chicken', 'stuffing:chickenCheese', 'stuffing:veg', 'stuffing:cheeseCorn', 'stuffing:paneer', 'coating:vegKurkure', 'coating:chickenKurkure', 'dough:cheeseCorn'];
  for (const id of ids) {
    const opening = typeof morningWeighIn?.counts?.[id] === 'number' ? morningWeighIn.counts[id] : id === 'stuffing:cheeseCorn' ? 2.54 : LAST_NIGHT[id] || 0;
    pools[id] = { opening, prepared: 0, closingActual: ledgerClosed && typeof ledgerClosed.closingActuals[id] === 'number' ? ledgerClosed.closingActuals[id] : null, wastage: null };
  }
  const TYPE: Record<string, [string, string]> = { chickenMomos: ['chicken', 'stuffing'], chickenCheeseMomos: ['chickenCheese', 'stuffing'], vegMomos: ['veg', 'stuffing'], cheeseCornMomos: ['cheeseCorn', 'stuffing'], paneerMomos: ['paneer', 'stuffing'], vegKurkureMomos: ['vegKurkure', 'coating'], chickenKurkureMomos: ['chickenKurkure', 'coating'] };
  for (const it of ledgerItems) {
    if (it.momoKey === 'GLOBAL_DOUGH') pools.dough.prepared += it.globalPoolQty;
    else if (it.momoKey === 'GLOBAL_BATTER') pools.batter.prepared += it.globalPoolQty;
    else if (TYPE[it.momoKey]) {
      const [type, own] = TYPE[it.momoKey];
      pools[`${own}:${type}`].prepared += it.perTypePoolQty || 0;
      if (it.globalPoolQty) pools[type === 'cheeseCorn' ? 'dough:cheeseCorn' : own === 'coating' ? 'batter' : 'dough'].prepared += it.globalPoolQty;
    }
  }
  return pools;
}

export const routes: { method: string; re: RegExp; reply: (m: RegExpMatchArray, body: any, url: URL) => any }[] = [
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
  { method: 'GET', re: /\/insights\/overview/, reply: () => overview() },
  { method: 'GET', re: /\/events\/momo-returns/, reply: (_m, _b, url) => ({ returns: url.searchParams.get('status') === 'sent' ? [{ id: 'mr1', eventId: 'EVENT-1', eventName: 'Durgapur Winter Fair', productionHouseId: 'PH-1', date: yesterday, returned: { chicken: 40, veg: 20 }, wasted: {}, returnedPieces: 60, wastedPieces: 0, wasteReason: null, status: 'sent' }] : [] }) },
  // The guided production day (KitchenDay.tsx): last night's counts, cheese corn last weighed weeks
  // ago, and the morning weigh-in once saved (it becomes the day's opening).
  { method: 'GET', re: /\/production-ledger$/, reply: () => {
    const pools = ledgerPools();
    const lastCounted: Record<string, any> = Object.fromEntries(Object.entries(LAST_NIGHT).map(([id, kg]) => [id, { date: yesterday, kg, when: 'night' }]));
    lastCounted['stuffing:cheeseCorn'] = { date: addDays(today, -24), kg: 2.54, when: 'night' };
    const entry = ledgerClosed ? { id: `PH-1-${today}`, productionHouseId: 'PH-1', date: today, pools, closed: true, closedBy: 'BM020', closedByName: COOK, closedAt: nowIstIso(), sauceLeft: ledgerClosed.sauceLeft, ...(ledgerClosed.leftoverReport ? { leftoverReport: ledgerClosed.leftoverReport } : {}), createdBy: 'BM020', createdByName: COOK, createdAt: nowIstIso(), updatedAt: nowIstIso() } : null;
    return { entry, live: entry ? null : { pools }, items: ledgerItems, hasAnyPriorRecord: true, morning: morningWeighIn, lastCounted };
  } },
  { method: 'POST', re: /\/production-ledger-item$/, reply: (_m, body) => { const it = { id: `li-${Date.now()}`, momoKey: body.momoKey, globalPoolQty: body.globalPoolQty || 0, perTypePoolQty: body.perTypePoolQty || 0, ...(body.withLeftover ? { withLeftover: body.withLeftover } : {}), loggedByName: COOK, loggedAt: nowIstIso() }; ledgerItems = [...ledgerItems, it]; return { success: true, item: it }; } },
  { method: 'DELETE', re: /\/production-ledger-item\/([^/]+)$/, reply: (m) => { ledgerItems = ledgerItems.filter((x) => x.id !== decodeURIComponent(m[1])); return { success: true }; } },
  { method: 'PUT', re: /\/production-ledger\/[^/]+\/[^/]+\/close$/, reply: (_m, body) => { ledgerClosed = { closingActuals: body.closingActuals || {}, sauceLeft: body.sauceLeft || {}, leftoverReport: body.leftoverReport || null }; return { success: true }; } },
  { method: 'POST', re: /\/production-wastage-notes$/, reply: (_m, body) => { const n = { id: `wn-${Date.now()}`, description: body.description, quantity: body.quantity, unit: body.unit, reason: body.reason, loggedByName: COOK, loggedAt: nowIstIso() }; wastageNotes = [...wastageNotes, n]; return { success: true, note: n }; } },
  { method: 'DELETE', re: /\/production-wastage-notes\/([^/]+)$/, reply: (m) => { wastageNotes = wastageNotes.filter((x) => x.id !== decodeURIComponent(m[1])); return { success: true }; } },
  { method: 'PUT', re: /\/production-ledger\/[^/]+\/[^/]+\/morning$/, reply: (_m, body) => { morningWeighIn = { productionHouseId: 'PH-1', date: today, counts: body.counts, thaw: body.thaw || {}, at: nowIstIso(), by: 'BM020', byName: COOK }; return { morning: morningWeighIn }; } },
  { method: 'POST', re: /\/production-ledger\/[^/]+\/[^/]+\/coach$/, reply: (_m, body) => ({ text: body.stage === 'summary'
    ? 'Started with 1.2 kg dough and 0.8 kg chicken stuffing, made 9 kg of each. The chicken stuffing count matches the momos entered.'
    : body.lang === 'bn'
      ? ['চিকেন পুর ০.৮ কেজি আছে: আগে ওটা দিন, তারপর আরও প্রায় ৫ কেজি বানান।', 'ডো: সাধারণ ডো প্রায় ৬ কেজি, চিজ কর্ন ডো প্রায় ১ কেজি।'].join('\n')
      : ['Chicken stuffing: 0.8 kg here. Use it first, then make about 5 kg.', 'Dough: about 6 kg main dough, and about 1 kg cheese corn dough.'].join('\n') }) },
  // The leftover reasons form at the close: who was in (and how late) and the kitchen's machines.
  { method: 'GET', re: /\/day-context$/, reply: () => ({ date: today, minKg: 0.5, perKg: { chicken: 92, veg: 90, cheeseCorn: 85, chickenKurkure: 80, dough: 82, 'dough:cheeseCorn': 80, batter: 400 }, staff: [
    { id: 'P1', name: 'Sohel', shiftStart: '08:00', checkInAt: at(today, '09:42'), lateMin: 102, onLeave: false },
    { id: 'P2', name: 'Rina', shiftStart: '08:00', checkInAt: at(today, '07:58'), lateMin: 0, onLeave: false },
    { id: 'P3', name: 'Bablu', shiftStart: '08:00', checkInAt: null, lateMin: 0, onLeave: true },
  ], machines: [{ id: 'A1', name: 'Steamer (big)', condition: 'good' }, { id: 'A2', name: 'Dough kneader', condition: 'good' }] }) },
  { method: 'GET', re: /\/production-wastage-notes$/, reply: () => ({ notes: wastageNotes }) },
  { method: 'GET', re: /\/production-weekly-goal$/, reply: () => ({ goal: { goals: { chickenMomos: 3200, vegMomos: 1100, chickenKurkureMomos: 900 } } }) },
  { method: 'GET', re: /\/stock-outs$/, reply: () => ({ entries: stockOuts }) },
  { method: 'POST', re: /\/stock-outs$/, reply: (_m, body) => { const e = { ...body, id: `so-${Date.now()}`, createdByName: 'Tumpa' }; stockOuts = [e, ...stockOuts]; return { entry: e }; } },
  { method: 'PUT', re: /\/stock-outs\/[^/]+\/([^/]+)$/, reply: (m, body) => { const e = stockOuts.find((x) => x.id === m[1]); Object.assign(e, body); return { entry: e }; } },
  { method: 'GET', re: /\/stock-wastage$/, reply: (_m, _b, url) => (url.searchParams.get('from') ? { entries: [] } : { entry: null }) },
  { method: 'GET', re: /\/supply-alerts$/, reply: () => ({ canManage: false, myPlace: { kind: 'store', id: 'STORE-1', name: 'Bidhan Nagar' }, alerts: [{ id: 'al1', placeKind: 'store', placeId: 'STORE-1', placeName: 'Bidhan Nagar', item: 'Parcel box', level: 'low', raisedBy: [{ id: 'u5', name: 'Tumpa', at: at(today, '18:10') }], status: 'open', createdAt: at(today, '18:10'), updatedAt: at(today, '18:10'), canClose: false, mine: false }] }) },
  { method: 'GET', re: /\/utilities-consumption$/, reply: () => ({ success: true, startDate: '2026-07-19', endDate: yesterday, daysWithData: 108, boxesUsed: 8240, traysUsed: 3110, unattributedOrders: 4, beverageConsumption: { 'Coke 250ml': 410, 'Sprite 250ml': 230 },
    burgers: { since: '2026-07-19', to: yesterday, bunsPerUnit: null, entries: 52, bought: 236, sold: { standalone: 290, mania: 88, combo: 95, total: 473 }, left: -237,
      weeks: [{ from: '2026-10-24', to: '2026-10-30', bought: 16, sold: 25 }, { from: '2026-10-17', to: '2026-10-23', bought: 9, sold: 14 }, { from: '2026-10-10', to: '2026-10-16', bought: 8, sold: 9 }],
      anomalies: [{ kind: 'odd-entry', days: 30, bought: 4, sold: 0, date: '2026-10-27', text: 'The burger bun purchase of 2026-10-27 is logged under "spices_seasonings": check it' }] } }) },
];

// Momos sold a day and the coming week, for Bunny's fill: chicken sells well, paneer about 15 a day,
// veg kurkure about 9 (too slow for a bag of 50 in 4 days), chicken cheese about 11 (slow).
function overview() {
  const pieces = { chicken: 230, chickenCheese: 11, veg: 85, cheeseCorn: 40, paneer: 15, vegKurkure: 5, chickenKurkure: 45 };
  const history = Array.from({ length: 20 }, (_, i) => ({ date: addDays(today, -20 + i), revenue: 12000, pieces }));
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, weekday: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), revenue: 12500, revenueLow: 10000, revenueHigh: 15000, pieces, vegPieces: 145, nonVegPieces: 286, basis: 'sample' };
  });
  return { today, storeId: 'STORE-1', history, events: [], forecast, yesterday: { date: yesterday, actual: 12000, actualPieces: pieces, expected: forecast[0] }, learned: {} };
}

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
