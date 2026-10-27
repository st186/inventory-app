// Mock data and a mock events api for the dev-only preview (events-preview.html). Figures are
// worked out with the same eventRules.ts the server uses, so the preview's P&L adds up.
import {
  addDaysISO, computeEventPnl, daySales, digitalAccountOf, eventCashInHand, eventCashLines, eventDays, eventDigitalBalance,
  eventDigitalLines, eventItemsOnHand, eventMomoStock, eventStatus, expectedEventCash, summarizeEvents,
} from '../utils/eventRules';
import type { EventBundle, EventListRow, EventsApi, MyEvent, EventRecord } from '../utils/eventsApi';

export const PREVIEW_TODAY = '2026-11-30';

const settings = {
  momoCostPerPiece: { chicken: 9, chickenCheese: 11, veg: 7, cheeseCorn: 9, paneer: 10, vegKurkure: 10, chickenKurkure: 12 },
  onlineCommissionPct: 0,
  piecesPerPlate: { chicken: 6, chickenCheese: 6, veg: 6, cheeseCorn: 6, paneer: 6, vegKurkure: 6, chickenKurkure: 6 },
};

const fair: EventRecord = {
  id: 'EVENT-1764000000000-WFAIR1', kind: 'event', name: 'Durgapur Winter Fair', venue: 'Bidhan Nagar ground, Durgapur',
  startDate: '2026-11-27', endDate: '2026-12-06', parentStoreId: 'STORE-1', productionHouseId: 'PH-1',
  lat: 23.5204, lng: 87.3119, radiusM: 150, rent: { mode: 'total', amount: 30000 },
  staffIds: ['BM011', 'BM012', 'BM015'], inchargeId: 'BM011', digital: { mode: 'separate', name: 'PhonePe' },
  ciferonStoreId: '40212', notes: '', status: 'live',
};
const bookFair: EventRecord = {
  ...fair, id: 'EVENT-1764100000000-BOOKF1', name: 'Bidhannagar Book Fair', venue: 'City Centre', startDate: '2027-01-14', endDate: '2027-01-21',
  rent: { mode: 'per_day', amount: 1800 }, staffIds: ['BM012'], inchargeId: 'BM012', ciferonStoreId: null, status: 'planned', digital: { mode: 'separate', name: '' },
};
const puja: EventRecord = {
  ...fair, id: 'EVENT-1760000000000-PUJA01', name: 'Durga Puja stall', venue: 'Benachity pandal', startDate: '2026-10-18', endDate: '2026-10-22',
  rent: { mode: 'total', amount: 12000 }, ciferonStoreId: null, status: 'closed', closedAt: '2026-10-24T10:00:00Z', closedBy: 'Subham', digital: { mode: 'store_paytm', name: '' },
};

const day = (date: string, cash: number, digital: number, plates: Record<string, number>, counted: number | null, submitted: boolean, pos?: { cash: number; digital: number; orders: number }) => ({
  eventId: fair.id, date,
  manual: submitted || counted !== null ? { cash, digital, online: 0, plates, byName: 'Rahul Das' } : undefined,
  pos: pos ? { ...pos, online: 0, ok: true, syncedAt: `${date}T16:40:00Z`, outletFilter: 'order-field' } : undefined,
  cashCounted: counted, submitted, submittedByName: submitted ? 'Rahul Das' : undefined,
});

const state = {
  days: [
    day('2026-11-27', 8420, 6380, { chicken: 61, chickenCheese: 22, veg: 18, paneer: 9, chickenKurkure: 14 }, 10400, true, { cash: 8300, digital: 6500, orders: 211 }),
    day('2026-11-28', 9650, 7810, { chicken: 70, chickenCheese: 26, veg: 21, paneer: 12, chickenKurkure: 17 }, 21560, true, { cash: 9650, digital: 7810, orders: 236 }),
    day('2026-11-29', 12340, 10120, { chicken: 88, chickenCheese: 35, veg: 27, paneer: 15, chickenKurkure: 22, vegKurkure: 8 }, 33300, true, { cash: 12290, digital: 10170, orders: 301 }),
    day('2026-11-30', 0, 0, {}, null, false, { cash: 5210, digital: 4480, orders: 128 }),
  ] as any[],
  expenses: [
    { id: 'x1', eventId: fair.id, date: '2026-11-26', category: 'marketing', paidFrom: 'owner', amount: 2500, description: 'Stall banner and standee', createdByName: 'Subham' },
    { id: 'x2', eventId: fair.id, date: '2026-11-27', category: 'electricity', paidFrom: 'owner', amount: 1200, description: 'Electricity connection (fair office)', createdByName: 'Aniket' },
    { id: 'x3', eventId: fair.id, date: '2026-11-27', category: 'rent', paidFrom: 'owner', amount: 15000, description: 'Rent, first half', createdByName: 'Subham' },
    { id: 'x4', eventId: fair.id, date: '2026-11-28', category: 'purchase', paidFrom: 'event_cash', amount: 950, description: 'Gas refill', createdByName: 'Rahul Das' },
    { id: 'x5', eventId: fair.id, date: '2026-11-29', category: 'transport', paidFrom: 'event_cash', amount: 600, description: 'Auto for extra crates', createdByName: 'Rahul Das' },
    { id: 'x6', eventId: fair.id, date: '2026-11-30', category: 'staff', paidFrom: 'event_cash', amount: 420, description: 'Staff lunch', createdByName: 'Priya Saha' },
    { id: 'x7', eventId: fair.id, date: '2026-11-29', category: 'other', paidFrom: 'event_digital', amount: 310, description: 'Paper plates top-up', createdByName: 'Rahul Das' },
  ] as any[],
  transfers: [
    { id: 't1', eventId: fair.id, direction: 'to_event', date: '2026-11-27', totalCost: 3610, createdByName: 'Aniket', items: [
      { itemName: 'Momo box', quantity: 400, unit: 'pcs', category: 'packaging', unitCost: 4.5, totalCost: 1800 },
      { itemName: 'Red chutney', quantity: 6, unit: 'kg', category: 'sauces', unitCost: 180, totalCost: 1080 },
      { itemName: 'Mayonnaise', quantity: 2, unit: 'kg', category: 'sauces', unitCost: 240, totalCost: 480 },
      { itemName: 'Tissue packs', quantity: 25, unit: 'pcs', category: 'supplies', unitCost: 10, totalCost: 250 },
    ] },
  ] as any[],
  moves: [{ id: 'm1', eventId: fair.id, account: 'cash', direction: 'in', counterparty: 'owner', amount: 2000, date: '2026-11-27', note: 'Opening float', createdByName: 'Subham' }] as any[],
  assets: [
    { id: 'a1', eventId: fair.id, assetId: 'A-STEAMER', assetName: 'Steamer (3 tier)', quantity: 1, returnedQty: 0, outAt: '2026-11-26T09:30:00Z', outBy: 'Aniket', returns: [] },
    { id: 'a2', eventId: fair.id, assetId: 'A-STOVE', assetName: 'Gas stove, 2 burner', quantity: 1, returnedQty: 0, outAt: '2026-11-26T09:30:00Z', outBy: 'Aniket', returns: [] },
    { id: 'a3', eventId: fair.id, assetId: 'A-TABLE', assetName: 'Folding table', quantity: 2, returnedQty: 2, outAt: '2026-11-26T09:30:00Z', outBy: 'Aniket', returnCondition: 'good', returns: [{ quantity: 2, condition: 'good', at: '2026-11-28T12:00:00Z', by: 'Rahul Das' }] },
  ] as any[],
  requests: [
    { id: 'r1', eventId: fair.id, requestDate: '2026-11-26', status: 'delivered', chicken: 800, chickenCheese: 300, veg: 250, paneer: 150, chickenKurkure: 200, shippedAt: '2026-11-26T11:00:00Z', deliveredAt: '2026-11-26T13:00:00Z', requestedByName: 'Rahul Das' },
    { id: 'r2', eventId: fair.id, requestDate: '2026-11-28', status: 'delivered', chicken: 700, chickenCheese: 250, veg: 200, paneer: 100, chickenKurkure: 150, vegKurkure: 80, shippedAt: '2026-11-28T10:00:00Z', deliveredAt: '2026-11-28T12:00:00Z', requestedByName: 'Rahul Das',
      receipt: { lines: { chicken: { shipped: 700, received: 700, damaged: 12 } } } },
    { id: 'r3', eventId: fair.id, requestDate: '2026-11-30', status: 'shipped', chicken: 600, chickenCheese: 240, veg: 150, chickenKurkure: 150, shippedQuantities: { chicken: 600, chickenCheese: 240, veg: 150, chickenKurkure: 150 }, shippedAt: '2026-11-30T09:10:00Z', requestedByName: 'Rahul Das' },
  ] as any[],
  topups: [
    { id: 'c1', eventId: fair.id, reason: 'event_cash', date: '2026-11-28', requestedAmount: 3000, status: 'approved', fundingSource: 'production_cash', note: 'Change for the counter', requestedByName: 'Rahul Das', requestDate: '2026-11-28T10:00:00' },
    { id: 'c2', eventId: fair.id, reason: 'event_cash', date: '2026-11-30', requestedAmount: 2000, status: 'pending', note: 'Second gas cylinder', requestedByName: 'Rahul Das', requestDate: '2026-11-30T12:00:00' },
  ] as any[],
};

const staff = [
  { employeeId: 'BM011', name: 'Rahul Das', designation: 'store_staff', isIncharge: true, phone: '98xxxxxx11' },
  { employeeId: 'BM012', name: 'Priya Saha', designation: 'store_staff', isIncharge: false, phone: '98xxxxxx12' },
  { employeeId: 'BM015', name: 'Sohel Ahmed', designation: 'store_staff', isIncharge: false, phone: '98xxxxxx15' },
];

type Role = 'owner' | 'incharge';
let role: Role = 'owner';
export const setPreviewRole = (r: Role) => { role = r; };

function eventFor(id: string) {
  return [fair, bookFair, puja].find((e) => e.id === id) || fair;
}
function bundleFor(ev: EventRecord): EventBundle {
  const isFair = ev.id === fair.id;
  const data = isFair ? state : { days: [], expenses: [], transfers: [], moves: [], assets: [], requests: [], topups: [] };
  const m = { event: ev, days: data.days, expenses: data.expenses, moves: data.moves, topups: data.topups };
  const status = eventStatus(ev, PREVIEW_TODAY);
  const owner = role === 'owner';
  return {
    event: { ...ev, status },
    today: PREVIEW_TODAY,
    store: { id: 'STORE-1', name: 'Bunny Momos 1' },
    productionHouse: { id: 'PH-1', name: 'Main production' },
    permissions: {
      canManage: owner, canRunStock: owner, canEnter: status !== 'closed', canSubmitDay: status !== 'closed',
      canMoveMoney: status !== 'closed', isIncharge: !owner, isAssigned: !owner,
    },
    digitalAccount: digitalAccountOf(ev),
    days: eventDays(ev).map((date) => {
      const d = data.days.find((x: any) => x.date === date) || null;
      const cash = expectedEventCash(m, date);
      return { date, day: d, sales: daySales(d), expectedCash: cash.expected, openingCash: cash.opening };
    }),
    expenses: [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)),
    transfers: data.transfers,
    moves: data.moves,
    assets: data.assets,
    requests: [...data.requests].reverse(),
    topups: [...data.topups].reverse(),
    cash: { inHand: eventCashInHand(m, PREVIEW_TODAY), lines: eventCashLines(m) },
    digital: { account: digitalAccountOf(ev), balance: eventDigitalBalance(m, PREVIEW_TODAY), lines: eventDigitalLines(m) },
    stock: { momos: eventMomoStock(data.requests, data.days, settings.piecesPerPlate), items: eventItemsOnHand(data.transfers) },
    staff: isFair ? staff : staff.slice(1, 2).map((s) => ({ ...s, isIncharge: true })),
    pnl: computeEventPnl({ ...m, requests: data.requests, transfers: data.transfers, settings, today: PREVIEW_TODAY }),
    settings,
  } as EventBundle;
}
function listRow(ev: EventRecord): EventListRow {
  const b = bundleFor(ev);
  return {
    ...b.event, dayCount: b.days.length, sales: b.pnl.sales, costs: b.pnl.costs, profit: b.pnl.profit, cashInHand: b.cash.inHand,
    digitalAccount: b.digitalAccount, assetsOut: b.assets.filter((a) => a.quantity > a.returnedQty).length,
    pendingTopups: b.topups.filter((t) => t.status === 'pending').length, myRole: role === 'owner' ? null : 'incharge',
  };
}

const wait = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const today = state.days.find((d) => d.date === PREVIEW_TODAY)!;

export const mockApi: EventsApi & { __mock: true } = {
  __mock: true,
  list: () => wait({ events: [fair, bookFair, puja].map(listRow), canCreate: role === 'owner', today: PREVIEW_TODAY }),
  mine: () => wait({ events: [{
    id: fair.id, name: fair.name, venue: fair.venue, startDate: fair.startDate, endDate: fair.endDate, status: 'live', myRole: 'incharge',
    today: { submitted: !!today.submitted, sales: daySales(today).total, source: daySales(today).source },
    cashInHand: bundleFor(fair).cash.inHand, digitalAccount: digitalAccountOf(fair), incoming: 1, pendingTopups: 1,
  } as MyEvent], today: PREVIEW_TODAY }),
  get: (id) => wait(bundleFor(eventFor(id))),
  pnl: (id) => wait({ pnl: bundleFor(eventFor(id)).pnl }),
  summary: () => wait({ summary: summarizeEvents([fair, puja].map((e) => ({ event: e, status: eventStatus(e, PREVIEW_TODAY), pnl: bundleFor(e).pnl }))) }),
  create: (input) => wait({ event: { ...fair, ...input, id: `EVENT-${Date.now()}-NEW`, status: 'planned' } as EventRecord }),
  update: (id, input) => wait({ event: { ...eventFor(id), ...input } as EventRecord }),
  close: (id) => wait({ event: { ...eventFor(id), status: 'closed' } as EventRecord }),
  reopen: (id) => wait({ event: { ...eventFor(id), status: 'live' } as EventRecord }),
  saveDay: (_id, date, input) => {
    const d = state.days.find((x) => x.date === date) || { eventId: fair.id, date };
    Object.assign(d, { manual: { cash: input.cash, digital: input.digital, online: input.online || 0, plates: input.plates }, cashCounted: input.cashCounted ?? null, submitted: !!input.submit || d.submitted });
    if (!state.days.includes(d)) state.days.push(d);
    return wait({ day: d, sales: daySales(d) });
  },
  submitDay: async (id, _name, date, input) => { await mockApi.saveDay(id, date, input); return { status: 'sent', response: null }; },
  submitExpense: async (id, _name, input) => { const r = await mockApi.addExpense(id, input); return { status: 'sent', response: r }; },
  posSync: (_id, date) => wait({ result: { ok: true }, day: state.days.find((d) => d.date === date) || null }),
  addExpense: (_id, input) => {
    const e = { id: `x${Date.now()}`, eventId: fair.id, createdByName: 'You', ...input };
    state.expenses.unshift(e);
    return wait({ expense: e as any });
  },
  voidExpense: (_id, expenseId) => { const e = state.expenses.find((x) => x.id === expenseId); if (e) e.voided = true; return wait({ expense: e }); },
  requestStock: (_id, input) => { const r = { id: `r${Date.now()}`, eventId: fair.id, status: 'pending', ...input.quantities, requestDate: input.requestDate, requestedByName: 'You' }; state.requests.push(r); return wait({ request: r as any }); },
  addTransfer: (_id, input) => {
    const items = input.items.map((i) => ({ ...i, unit: i.unit || 'pcs', category: i.category || 'other', unitCost: i.unitCost || 5, totalCost: (i.unitCost || 5) * i.quantity }));
    const t = { id: `t${Date.now()}`, eventId: fair.id, ...input, items, totalCost: items.reduce((s, i) => s + i.totalCost, 0) };
    state.transfers.push(t);
    return wait({ transfer: t as any });
  },
  addMoney: (_id, input) => { const m = { id: `m${Date.now()}`, eventId: fair.id, ...input }; state.moves.push(m); return wait({ move: m as any }); },
  checkoutAsset: (_id, input) => { const a = { id: `a${Date.now()}`, eventId: fair.id, assetId: input.assetId, assetName: 'Chairs', quantity: input.quantity, returnedQty: 0, outAt: new Date().toISOString(), outBy: 'You' }; state.assets.push(a); return wait({ checkout: a as any }); },
  returnAsset: (_id, checkoutId, input) => { const a = state.assets.find((x) => x.id === checkoutId); if (a) a.returnedQty += input.quantity; return wait({ checkout: a }); },
  staffToday: () => wait({ date: PREVIEW_TODAY, staff: [
    { employeeId: 'BM011', name: 'Rahul Das', isIncharge: true, checkIn: { at: '2026-11-30T08:12:00Z', verified: true, atEvent: true, distanceM: 34 }, checkOut: null, pendingArrival: false, photos: { done: 3, required: 5 } },
    { employeeId: 'BM012', name: 'Priya Saha', isIncharge: false, checkIn: { at: '2026-11-30T08:40:00Z', verified: true, atEvent: true, distanceM: 52 }, checkOut: null, pendingArrival: false, photos: null },
    { employeeId: 'BM015', name: 'Sohel Ahmed', isIncharge: false, checkIn: null, checkOut: null, pendingArrival: true, photos: null },
  ] }),
  settings: () => wait({ settings, canEdit: true }),
  saveSettings: (input) => wait({ settings: { ...settings, ...input } }),
  requestCash: (_id, input) => { const c = { id: `c${Date.now()}`, eventId: fair.id, reason: 'event_cash', status: 'pending', requestedByName: 'You', ...input }; state.topups.push(c); return wait({ request: c as any }); },
  approveCash: (id, fundingSource) => { const c = state.topups.find((x) => x.id === id); if (c) Object.assign(c, { status: 'approved', fundingSource }); return wait({ request: c }); },
  rejectCash: (id, reason) => { const c = state.topups.find((x) => x.id === id); if (c) Object.assign(c, { status: 'rejected', rejectionReason: reason }); return wait({ request: c }); },
  stores: () => wait([{ id: 'STORE-1', name: 'Bunny Momos 1', productionHouseId: 'PH-1' }]),
  productionHouses: () => wait([{ id: 'PH-1', name: 'Main production' }]),
  people: () => wait([
    { id: 'BM011', name: 'Rahul Das', designation: 'store_staff' }, { id: 'BM012', name: 'Priya Saha', designation: 'store_staff' },
    { id: 'BM015', name: 'Sohel Ahmed', designation: 'store_staff' }, { id: 'BM004', name: 'Aniket Prasad', designation: 'operations_manager' },
  ]),
  registerAssets: () => wait([
    { id: 'A-STEAMER', name: 'Steamer (3 tier)', category: 'cooking', quantity: 2, condition: 'good', locationKind: 'store', locationId: 'STORE-1', atEvents: [{ eventId: fair.id, eventName: fair.name, quantity: 1 }] },
    { id: 'A-CHAIRS', name: 'Plastic chairs', category: 'furniture', quantity: 12, condition: 'good', locationKind: 'store', locationId: 'STORE-1' },
    { id: 'A-FREEZER', name: 'Chest freezer', category: 'cold', quantity: 1, condition: 'good', locationKind: 'production_house', locationId: 'PH-1' },
  ]),
  voiceFill: () => wait({ paytm: 4480, cash: 5210, cashInHand: 6950, unclear: '' }, 600),
};

export const previewDates = { fairStart: fair.startDate, addDaysISO };
