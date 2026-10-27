// Calls to the event routes (server events.ts), and the event cash top-ups that go through the
// existing cash-topup routes. Kept out of utils/api.ts so the events feature stays in its own
// files. The day close and expenses are sent through the events outbox
// (components/events/eventOutbox.ts) so an entry made with no signal isn't lost.
import { API_BASE, requestJson } from './http';
import { submitEventEntry, type EventSubmitResult } from './eventOutbox';
import type { DaySales, DigitalAccount, EventMomoKey, EventPnl, EventStatus, EventSummary, CashLine } from './eventRules';

export type EventRent = { mode: 'total' | 'per_day'; amount: number };
export interface EventRecord {
  id: string;
  kind?: 'event';
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  parentStoreId: string;
  productionHouseId: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  rent: EventRent;
  staffIds: string[];
  inchargeId: string | null;
  digital: { mode: 'separate' | 'store_paytm'; name: string };
  ciferonStoreId: string | null;
  momoCostPerPiece?: Partial<Record<EventMomoKey, number>>;
  notes?: string;
  status: EventStatus;
  closedAt?: string;
  closedBy?: string;
  createdAt?: string;
}
export type EventInput = Partial<Omit<EventRecord, 'id' | 'status' | 'closedAt' | 'closedBy' | 'createdAt'>>;

export interface EventListRow extends EventRecord {
  dayCount: number;
  sales: number;
  costs: number;
  profit: number;
  cashInHand: number;
  digitalAccount: DigitalAccount;
  assetsOut: number;
  pendingTopups: number;
  myRole: 'incharge' | 'staff' | null;
}

export interface MyEvent {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  myRole: 'incharge' | 'staff';
  today: { submitted: boolean; sales: number; source: DaySales['source'] };
  cashInHand: number;
  digitalAccount: DigitalAccount;
  incoming: number;
  pendingTopups: number;
}

export interface EventDayRow {
  date: string;
  day: {
    manual?: { cash: number; digital: number; online: number; plates: Partial<Record<EventMomoKey, number>>; notes?: string; byName?: string; at?: string };
    pos?: { cash: number; digital: number; online: number; orders: number; ok?: boolean; syncedAt?: string; outletFilter?: string };
    posError?: string | null;
    cashCounted?: number | null;
    expectedCash?: number;
    cashDiff?: number | null;
    submitted?: boolean;
    submittedByName?: string;
    submittedAt?: string;
  } | null;
  sales: DaySales;
  expectedCash: number;
  openingCash: number;
}

export interface EventExpense {
  id: string; eventId: string; date: string; category: string; paidFrom: 'event_cash' | 'event_digital' | 'owner';
  amount: number; description: string; quantity?: number; unit?: string;
  createdByName?: string; createdAt?: string; voided?: boolean; voidedBy?: string;
  pending?: boolean; // waiting in the outbox
}
export interface EventTransferItem { itemName: string; quantity: number; unit: string; category: string; unitCost: number; totalCost: number; costFrom?: string }
export interface EventTransfer { id: string; direction: 'to_event' | 'to_store'; date: string; items: EventTransferItem[]; totalCost: number; note?: string; createdByName?: string }
export interface EventMoneyMove { id: string; account: 'cash' | 'digital'; direction: 'in' | 'out'; counterparty: 'owner' | 'store' | 'bank' | 'other'; amount: number; date: string; note?: string; createdByName?: string; voided?: boolean }
export interface EventAssetCheckout {
  id: string; assetId: string; assetName: string; category?: string | null; quantity: number; returnedQty: number;
  outAt: string; outBy: string; outCondition?: string; returnCondition?: string; returnedAt?: string;
  returns?: { quantity: number; condition: string; at: string; by: string; note?: string }[];
}
export interface EventStockRequest {
  id: string; requestDate: string; status: string; requestedByName?: string; notes?: string;
  shippedQuantities?: Record<string, number>; receipt?: { lines: Record<string, { shipped: number; received: number; damaged: number }> };
  [key: string]: unknown;
}
export interface EventTopup {
  id: string; date: string; requestedAmount: number; status: 'pending' | 'approved' | 'rejected'; note?: string;
  requestedByName?: string; requestDate?: string; fundingSource?: 'store_paytm' | 'production_cash'; approvedBy?: string | null;
  rejectedBy?: string | null; rejectionReason?: string | null;
}
export interface EventPermissions {
  canManage: boolean; canRunStock: boolean; canEnter: boolean; canSubmitDay: boolean; canMoveMoney: boolean; isIncharge: boolean; isAssigned: boolean;
}
export interface EventStaffMember { employeeId: string; name: string; designation: string | null; isIncharge: boolean; phone?: string | null }
export interface EventSettings { momoCostPerPiece: Partial<Record<EventMomoKey, number>>; onlineCommissionPct: number; piecesPerPlate: Record<string, number> }

export interface EventBundle {
  event: EventRecord;
  today: string;
  store: { id: string; name: string } | null;
  productionHouse: { id: string; name: string } | null;
  permissions: EventPermissions;
  digitalAccount: DigitalAccount;
  days: EventDayRow[];
  expenses: EventExpense[];
  transfers: EventTransfer[];
  moves: EventMoneyMove[];
  assets: EventAssetCheckout[];
  requests: EventStockRequest[];
  topups: EventTopup[];
  cash: { inHand: number; lines: CashLine[] };
  digital: { account: DigitalAccount; balance: number; lines: CashLine[] };
  stock: {
    momos: Record<EventMomoKey, { received: number; inTransit: number; sold: number; wasted: number; left: number }>;
    items: { itemName: string; unit: string; quantity: number; value: number }[];
  };
  staff: EventStaffMember[];
  pnl: EventPnl;
  settings: EventSettings;
}

export interface StaffToday {
  date: string;
  staff: {
    employeeId: string; name: string; isIncharge: boolean;
    checkIn: { at: string; verified: boolean; atEvent: boolean; distanceM: number | null } | null;
    checkOut: { at: string; verified: boolean } | null;
    pendingArrival: boolean;
    photos: { done: number; required: number } | null;
  }[];
}

export interface DayCloseInput {
  cash: number; digital: number; online?: number; plates: Partial<Record<EventMomoKey, number>>;
  notes?: string; cashCounted?: number | null; submit?: boolean;
}
export interface ExpenseInput {
  category: string; description: string; amount: number; date: string; paidFrom: EventExpense['paidFrom']; quantity?: number; unit?: string;
}
export interface PickOption { id: string; name: string; productionHouseId?: string | null; designation?: string | null; role?: string | null }
export interface RegisterAsset { id: string; name: string; category: string; quantity: number; condition: string; locationKind: string; locationId: string; atEvents?: { eventId: string; eventName: string; quantity: number }[] }

const url = (path: string) => `${API_BASE}${path}`;
const json = (method: string, body?: unknown, idempotencyKey?: string) => ({
  init: { method, body: body === undefined ? undefined : JSON.stringify(body) } as RequestInit,
  opts: idempotencyKey ? { idempotencyKey } : {},
});
const call = <T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string) => {
  const r = json(method, body, idempotencyKey);
  return requestJson<T>(url(path), r.init, { ...r.opts, ...(method === 'GET' ? { noCache: true } : {}) });
};
const enc = encodeURIComponent;

// The real calls. The screens take this through useEventsApi() so the dev preview can hand them a
// mock instead.
export const eventsApi = {
  list: () => call<{ events: EventListRow[]; canCreate: boolean; today: string }>('/events'),
  mine: () => call<{ events: MyEvent[]; today: string }>('/events/mine'),
  get: (id: string) => call<EventBundle>(`/events/${enc(id)}`),
  pnl: (id: string, from?: string, to?: string) => call<{ pnl: EventPnl }>(`/events/${enc(id)}/pnl${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ''}`),
  summary: (from?: string, to?: string) => call<{ summary: EventSummary }>(`/events/summary${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ''}`),
  create: (input: EventInput) => call<{ event: EventRecord }>('/events', 'POST', input),
  update: (id: string, input: EventInput) => call<{ event: EventRecord }>(`/events/${enc(id)}`, 'PUT', input),
  close: (id: string, force = false) => call<{ event: EventRecord }>(`/events/${enc(id)}/close`, 'POST', { force }),
  reopen: (id: string) => call<{ event: EventRecord }>(`/events/${enc(id)}/reopen`, 'POST', {}),
  saveDay: (id: string, date: string, input: DayCloseInput & { clientEntryId?: string }) =>
    call<{ day: EventDayRow['day']; sales: DaySales }>(`/events/${enc(id)}/days/${enc(date)}`, 'PUT', input, input.clientEntryId),
  posSync: (id: string, date: string) => call<{ result: any; day: EventDayRow['day'] }>(`/events/${enc(id)}/pos-sync`, 'POST', { date }),
  addExpense: (id: string, input: ExpenseInput & { clientEntryId?: string }) =>
    call<{ expense: EventExpense }>(`/events/${enc(id)}/expenses`, 'POST', input, input.clientEntryId),
  voidExpense: (id: string, expenseId: string, reason?: string) => call<{ expense: EventExpense }>(`/events/${enc(id)}/expenses/${enc(expenseId)}/void`, 'POST', { reason }),
  requestStock: (id: string, input: { requestDate: string; quantities: Partial<Record<EventMomoKey, number>>; notes?: string }) =>
    call<{ request: EventStockRequest }>(`/events/${enc(id)}/stock-requests`, 'POST', input),
  addTransfer: (id: string, input: { direction: 'to_event' | 'to_store'; date: string; items: { itemName: string; quantity: number; unit?: string; category?: string; unitCost?: number | null }[]; note?: string; clientEntryId?: string }) =>
    call<{ transfer: EventTransfer }>(`/events/${enc(id)}/transfers`, 'POST', input, input.clientEntryId),
  addMoney: (id: string, input: { account: 'cash' | 'digital'; direction: 'in' | 'out'; counterparty: EventMoneyMove['counterparty']; amount: number; date: string; note?: string; clientEntryId?: string }) =>
    call<{ move: EventMoneyMove }>(`/events/${enc(id)}/money`, 'POST', input, input.clientEntryId),
  checkoutAsset: (id: string, input: { assetId: string; quantity: number; note?: string }) => call<{ checkout: EventAssetCheckout }>(`/events/${enc(id)}/assets`, 'POST', input),
  returnAsset: (id: string, checkoutId: string, input: { quantity: number; condition: string; note?: string }) =>
    call<{ checkout: EventAssetCheckout }>(`/events/${enc(id)}/assets/${enc(checkoutId)}/return`, 'POST', input),
  staffToday: (id: string, date?: string) => call<StaffToday>(`/events/${enc(id)}/staff-today${date ? `?date=${enc(date)}` : ''}`),
  settings: () => call<{ settings: EventSettings; canEdit: boolean }>('/events/settings'),
  saveSettings: (input: { momoCostPerPiece: Partial<Record<EventMomoKey, number>>; onlineCommissionPct: number }) => call<{ settings: EventSettings }>('/events/settings', 'PUT', input),
  // Event cash through the existing cash top-up routes (reason 'event_cash').
  requestCash: (eventId: string, input: { requestedAmount: number; date: string; note?: string }) =>
    call<{ request: EventTopup }>('/cash-topup-requests', 'POST', { reason: 'event_cash', targetEventId: eventId, ...input }),
  approveCash: (topupId: string, fundingSource: 'store_paytm' | 'production_cash') =>
    call<{ request: EventTopup }>(`/cash-topup-requests/${enc(topupId)}/approve`, 'POST', { fundingSource }),
  rejectCash: (topupId: string, reason: string) => call<{ request: EventTopup }>(`/cash-topup-requests/${enc(topupId)}/reject`, 'POST', { reason }),
  // Pick lists for the create sheet and the assets tab.
  stores: () => call<{ stores: PickOption[] }>('/stores').then((r) => r.stores || []),
  productionHouses: () => call<{ productionHouses?: PickOption[]; houses?: PickOption[] }>('/production-houses').then((r: any) => r.productionHouses || r.houses || r || []),
  people: () => requestJson<{ employees: any[] }>(url('/unified-employees'), { headers: { 'X-Bunny-Client': '2' } })
    .then((r) => (r.employees || [])
      .filter((e) => e?.employeeId && e.status !== 'inactive' && e.role !== 'cluster_head' && e.role !== 'audit')
      .map((e) => ({ id: String(e.employeeId), name: String(e.name || e.employeeId), designation: e.designation || null, role: e.role || null })) as PickOption[]),
  registerAssets: () => call<{ assets: RegisterAsset[] }>('/assets').then((r) => r.assets || []),
  // Through the events outbox (saved on the phone first): 'kept' = waiting for a signal.
  submitDay: (eventId: string, eventName: string, date: string, input: DayCloseInput): Promise<EventSubmitResult> =>
    submitEventEntry({
      kind: 'event-day', eventId, method: 'PUT', path: `/events/${enc(eventId)}/days/${enc(date)}`,
      body: input as Record<string, any>, label: `${eventName} · day close ${date}`, coalesceKey: `event-day:${eventId}:${date}`,
    }),
  submitExpense: (eventId: string, eventName: string, input: ExpenseInput): Promise<EventSubmitResult> =>
    submitEventEntry({
      kind: 'event-expense', eventId, method: 'POST', path: `/events/${enc(eventId)}/expenses`,
      body: input as Record<string, any>, label: `${eventName} · ₹${input.amount} ${input.description}`,
    }),
  // Voice entry for the day close: the same Haiku reader as the store's cash count (/ai/voice-fill).
  voiceFill: (text: string) =>
    call<{ fields: { paytm: number | null; cash: number | null; cashInHand: number | null; unclear: string } }>('/ai/voice-fill', 'POST', { kind: 'sales', text }).then((r) => r.fields),
};

export type EventsApi = typeof eventsApi;
