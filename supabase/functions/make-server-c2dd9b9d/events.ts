// Events (owner, 27 Oct 2026): promotion stalls at fairs and festivals that run for some days
// while the store keeps running - with their own rent, stock, expenses, staff, cash and sales.
// Registered from index.ts. The rules (status, permissions, cash, P&L) are in eventRules.ts,
// shared byte-for-byte with the app.
//
// An event is a temporary location of its own, `event:{id}` (ids start EVENT-), not a store row:
// every existing store picker, store stock screen, forecast and threshold keeps reading `store:`
// and never sees it. The routes that must understand events do so on purpose:
//   - momos: a stock request for an event is an ordinary production_request_* row with
//     storeId = the event id, eventId, eventName, productionHouseId and locationKind 'event', so
//     production's queue, dispatch, ship and receive flows work unchanged; delivery credits the
//     event (creditStoreInventoryForDelivery in index.ts) and takes the momos off the production
//     house.
//   - digital collections: per event, its own separate account (default; e.g. PhonePe) or the
//     parent store's Paytm, which it then rolls into (GET /sales puts eventPaytmIn on the store's
//     row and paytmRules.ts counts it).
//   - cash: the stall's own "event cash in hand". Cash top-ups go through the existing cash-topup
//     machinery with reason 'event_cash' (funded on approval from the store's Paytm or the
//     production house's cash); floats from the owner/store and handovers are event_money rows.
//   - POS: an event with a Ciferon outlet id is synced by runPosSync (runEventPosSync below).
//   - assets, shift check-in (attendance.ts) and workplace photos (workplace.ts) accept events.
//
// KV rows:
//   event:{id}                         the event
//   event_day:{eventId}:{date}         a day's sales (typed and/or POS) and the cash count
//   event_expense:{eventId}:{id}       an expense (id = the app's entry id, so a resend is harmless)
//   event_transfer:{eventId}:{id}      items moved from the parent store (or back), at cost
//   event_money:{eventId}:{id}         cash/digital moved in or out (float, handover, transfer out)
//   event_asset:{eventId}:{id}         an asset checked out to the event, and its return
//   event_momo_return:{eventId}:{id}   leftover momos sent back to the production house (confirmed
//                                      there when they arrive) and momos wasted, with the reason
//   event-settings                     momo cost per piece, online commission % (owner)
// Nothing is ever deleted: an expense or money row can be voided (kept, marked voided).

import {
  EVENT_MOMO_KEYS, addDaysISO, assetsStillOut, momosLeftAtStall, canEnterForEvent, canManageEvent, canRunEventStock, canSeeEvent,
  canSubmitEventDay, computeEventPnl, datesBetween, daySales, digitalAccountOf, eventCashInHand, eventCashLines,
  eventDays, eventDigitalBalance, eventDigitalLines, eventItemsOnHand, eventMomoStock, eventStatus, expectedEventCash,
  isAssigned, isEventIncharge, isISODate, storeCashMoves, storePaytmRollup, summarizeEvents,
  type EventActor, type EventCostSettings,
} from './eventRules.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
  mget: <T = any>(keys: string[]) => Promise<T[]>;
};
export type EventsDeps = {
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  getAllByPrefix: (prefix: string) => Promise<any[]>; // paginated
  getTodayIST: () => string;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<any>;
  getAllClusterHeads: () => Promise<any[]>;
  getOperationsManagers: (storeId?: string) => Promise<any[]>;
  cascadeRecomputePaytmBalances: (storeId: string, fromDate: string) => Promise<void>;
  inPosQuietHours: () => boolean;
  ciferonOrderDate: (order: any) => string | null;
  afterResponse: (label: string, work: () => Promise<unknown>) => Promise<void>;
};

const P = '/make-server-c2dd9b9d';
const MAX_EVENT_DAYS = 60;
const EXPENSE_CATEGORIES = ['rent', 'electricity', 'purchase', 'transport', 'staff', 'marketing', 'overhead', 'other'];
const PAID_FROM = ['event_cash', 'event_digital', 'owner'];
const COUNTERPARTIES = ['owner', 'store', 'bank', 'other'];
const TRANSFER_CATEGORIES = ['sauces', 'packaging', 'supplies', 'beverages', 'gas_fuel', 'other'];

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const money = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? round2(n) : null;
};
const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x).map(String))] : []);
const safeId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(v) ? v : null);
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const isEventId = (id: string) => /^EVENT-[A-Za-z0-9-]+$/.test(id);

type Actor = EventActor & { userId: string; name: string; emp: any | null };

// ── Loading ──

export async function loadEvents(kv: Kv): Promise<any[]> {
  return ((await kv.getByPrefix<any>('event:')) || []).filter((e) => e?.id && isEventId(e.id));
}

type Bundle = { days: any[]; expenses: any[]; transfers: any[]; moves: any[]; assets: any[]; requests: any[]; topups: any[]; returns: any[] };

async function loadAllEventData(deps: EventsDeps): Promise<Bundle> {
  const [days, expenses, transfers, moves, assets, requests, topups, returns] = await Promise.all([
    deps.getAllByPrefix('event_day:'), deps.getAllByPrefix('event_expense:'), deps.getAllByPrefix('event_transfer:'),
    deps.getAllByPrefix('event_money:'), deps.getAllByPrefix('event_asset:'),
    deps.getAllByPrefix('production_request_'), deps.getAllByPrefix('cash-topup:'), deps.getAllByPrefix('event_momo_return:'),
  ]);
  return {
    days: days || [], expenses: expenses || [], transfers: transfers || [], moves: moves || [], assets: assets || [], returns: returns || [],
    requests: (requests || []).filter((r: any) => r?.eventId), topups: (topups || []).filter((t: any) => t?.reason === 'event_cash' && t?.eventId),
  };
}
const forEvent = (b: Bundle, eventId: string): Bundle => ({
  days: b.days.filter((x) => x.eventId === eventId),
  expenses: b.expenses.filter((x) => x.eventId === eventId),
  transfers: b.transfers.filter((x) => x.eventId === eventId),
  moves: b.moves.filter((x) => x.eventId === eventId),
  assets: b.assets.filter((x) => x.eventId === eventId),
  requests: b.requests.filter((x) => x.eventId === eventId),
  topups: b.topups.filter((x) => x.eventId === eventId),
  returns: b.returns.filter((x) => x.eventId === eventId),
});
async function loadOneEventData(deps: EventsDeps, eventId: string): Promise<Bundle> {
  const [days, expenses, transfers, moves, assets, requests, topups, returns] = await Promise.all([
    deps.kv.getByPrefix<any>(`event_day:${eventId}:`), deps.kv.getByPrefix<any>(`event_expense:${eventId}:`),
    deps.kv.getByPrefix<any>(`event_transfer:${eventId}:`), deps.kv.getByPrefix<any>(`event_money:${eventId}:`),
    deps.kv.getByPrefix<any>(`event_asset:${eventId}:`), deps.getAllByPrefix('production_request_'), deps.getAllByPrefix('cash-topup:'),
    deps.kv.getByPrefix<any>(`event_momo_return:${eventId}:`),
  ]);
  return {
    days: days || [], expenses: expenses || [], transfers: transfers || [], moves: moves || [], assets: assets || [], returns: returns || [],
    requests: (requests || []).filter((r: any) => r?.eventId === eventId),
    topups: (topups || []).filter((t: any) => t?.reason === 'event_cash' && t?.eventId === eventId),
  };
}

export async function loadEventSettings(kv: Kv): Promise<EventCostSettings & { piecesPerPlate: Record<string, number> }> {
  const [s, plate] = await Promise.all([kv.get<any>('event-settings'), kv.get<any>('momo-plate-config')]);
  // The plate config is keyed by display name ("Chicken Momos"); map it onto the short keys.
  const byName: Record<string, string> = {
    'Chicken Momos': 'chicken', 'Chicken Cheese Momos': 'chickenCheese', 'Veg Momos': 'veg', 'Corn Cheese Momos': 'cheeseCorn',
    'Paneer Momos': 'paneer', 'Veg Kurkure Momos': 'vegKurkure', 'Chicken Kurkure Momos': 'chickenKurkure',
  };
  const piecesPerPlate: Record<string, number> = {};
  for (const [name, cfg] of Object.entries((plate as any) || {})) {
    const key = byName[name];
    if (key && Number((cfg as any)?.piecesPerPlate) > 0) piecesPerPlate[key] = Number((cfg as any).piecesPerPlate);
  }
  return { momoCostPerPiece: s?.momoCostPerPiece || {}, onlineCommissionPct: Number(s?.onlineCommissionPct) || 0, piecesPerPlate };
}

function pnlFor(ev: any, data: Bundle, settings: EventCostSettings, today: string, from?: string, to?: string) {
  return computeEventPnl({
    event: ev, days: data.days, expenses: data.expenses, moves: data.moves, topups: data.topups,
    requests: data.requests, transfers: data.transfers, returns: data.returns,
    // The event's own momo cost overrides (if the cluster head set any) win over the business ones.
    settings: { ...settings, momoCostPerPiece: { ...(settings.momoCostPerPiece || {}), ...(ev.momoCostPerPiece || {}) } },
    today, from, to,
  });
}

// ── Rollups other routes use (index.ts) ──

// Puts each event day's store-Paytm collections and store cash moves on the parent store's own
// sales row for that date (eventPaytmIn, eventCashIn, eventCashOut), always overwriting whatever
// is stored there - so a copy saved back by an older app is harmless. Rows are changed in place.
export async function attachEventRollups(rows: any[], deps: Pick<EventsDeps, 'kv' | 'getAllByPrefix'>): Promise<any[]> {
  if (!rows?.length) return rows;
  const events = await loadEvents(deps.kv);
  const rollup = new Map<string, number>();
  const cash = new Map<string, { in: number; out: number }>();
  if (events.length) {
    const [days, moves] = await Promise.all([deps.getAllByPrefix('event_day:'), deps.getAllByPrefix('event_money:')]);
    for (const [k, v] of storePaytmRollup(events, days || [])) rollup.set(k, v);
    for (const [k, v] of storeCashMoves(events, moves || [])) cash.set(k, v);
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const key = `${row.storeId}|${row.date}`;
    const paytm = rollup.get(key);
    const moved = cash.get(key);
    if (paytm) row.eventPaytmIn = paytm; else delete row.eventPaytmIn;
    if (moved?.in) row.eventCashIn = round2(moved.in); else delete row.eventCashIn;
    if (moved?.out) row.eventCashOut = round2(moved.out); else delete row.eventCashOut;
  }
  return rows;
}
// The same fields taken off a row before it is written back to the database.
export function withoutEventRollups<T extends Record<string, any>>(row: T): T {
  const { eventPaytmIn: _a, eventCashIn: _b, eventCashOut: _c, ...rest } = row as any;
  return rest as T;
}

// The stores' utilities stock (GET /utilities-consumption): items moved to events count as used
// at the store, items brought back as returned.
export async function eventTransfersForStore(kv: Kv, storeId: string | undefined, startDate: string, endDate?: string) {
  const rows = (await kv.getByPrefix<any>('event_transfer:')) || [];
  const events = new Map((await loadEvents(kv)).map((e) => [e.id, e]));
  let boxes = 0, trays = 0;
  const beverages: Record<string, number> = {};
  const items: Record<string, number> = {};
  for (const t of rows) {
    if (t?.voided || !t?.date || t.date < startDate || (endDate && t.date > endDate)) continue;
    const ev = events.get(t.eventId);
    if (!ev || (storeId && ev.parentStoreId !== storeId)) continue;
    const sign = t.direction === 'to_store' ? -1 : 1;
    for (const it of t.items || []) {
      const name = String(it.itemName || '').trim();
      const q = sign * (Number(it.quantity) || 0);
      if (!name || !q) continue;
      const lower = name.toLowerCase();
      items[name] = round2((items[name] || 0) + q);
      if (lower.includes('momo box')) boxes += q;
      else if (lower.includes('momo tray')) trays += q;
      else if (it.category === 'beverages') beverages[name] = round2((beverages[name] || 0) + q);
    }
  }
  return { boxes: round2(boxes), trays: round2(trays), beverages, items };
}

// ── Cash top-ups (the existing cash-topup routes in index.ts call these for reason 'event_cash') ──

// Who may ask: the event incharge (in the event window) or a manager / the owner.
export async function buildEventTopupRequest(deps: EventsDeps, user: any, body: any): Promise<{ record?: any; event?: any; error?: string; status?: number }> {
  const meta = user?.user_metadata || {};
  const actor: EventActor = { role: meta.role, designation: meta.designation, employeeId: meta.employeeId };
  const eventId = typeof body?.targetEventId === 'string' ? body.targetEventId : '';
  const ev = eventId && isEventId(eventId) ? await deps.kv.get<any>(`event:${eventId}`) : null;
  if (!ev) return { error: 'Pick the event the cash is for', status: 400 };
  const today = deps.getTodayIST();
  if (eventStatus(ev, today) === 'closed') return { error: 'This event is closed', status: 409 };
  if (!(canRunEventStock(actor) || (isEventIncharge(ev, actor.employeeId) && canEnterForEvent(actor, ev, today)))) {
    return { error: 'Only the event incharge or a manager can ask for event cash', status: 403 };
  }
  const amount = money(body?.requestedAmount);
  const date = isISODate(body?.date) ? body.date : today;
  if (!amount) return { error: 'Enter the amount', status: 400 };
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    event: ev,
    record: {
      id,
      // No storeId on purpose: the store screens add up every approved top-up with a storeId as
      // the store's own till money. paytmStoreId is set on approval when the store's Paytm pays.
      storeId: null,
      eventId: ev.id,
      eventName: ev.name,
      eventParentStoreId: ev.parentStoreId || null,
      eventProductionHouseId: ev.productionHouseId || null,
      date,
      requestedAmount: amount,
      reason: 'event_cash',
      note: text(body?.note, 300),
      requestedByEntityType: 'event',
      requestedByEntityName: ev.name,
      status: 'pending',
      requestedBy: meta.employeeId || user.id,
      requestedByName: meta.name || user.email,
      requestedByUserId: user.id,
      requestDate: new Date(Date.now() + 330 * 60_000).toISOString(),
      approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, rejectionReason: null,
    },
  };
}

// Approving an event top-up: the approver says where the money comes from.
export function eventTopupFunding(existing: any, body: any): { fundingSource?: 'store_paytm' | 'production_cash'; paytmStoreId?: string; fundedFromProductionHouseId?: string; error?: string } {
  const source = body?.fundingSource;
  if (source === 'store_paytm') {
    const storeId = typeof body?.storeId === 'string' && body.storeId ? body.storeId : existing.eventParentStoreId;
    if (!storeId) return { error: 'This event has no parent store whose Paytm could pay' };
    return { fundingSource: 'store_paytm', paytmStoreId: storeId };
  }
  if (source === 'production_cash') {
    const houseId = typeof body?.productionHouseId === 'string' && body.productionHouseId ? body.productionHouseId : existing.eventProductionHouseId;
    if (!houseId) return { error: 'This event has no production house whose cash could pay' };
    return { fundingSource: 'production_cash', fundedFromProductionHouseId: houseId };
  }
  return { error: 'Choose where the money comes from: the store\'s Paytm or the production house\'s cash' };
}

// Who receives event top-up news: the event incharge.
export async function eventInchargeAuthId(kv: Kv, eventId: string): Promise<string | null> {
  const ev = await kv.get<any>(`event:${eventId}`);
  if (!ev?.inchargeId) return null;
  const emp = await kv.get<any>(`unified-employee:${ev.inchargeId}`);
  return emp?.authUserId || null;
}

// ── Ciferon outlet sync for events ──

// One day of a stall's own Ciferon outlet: cash, digital and online totals. The store sync's
// SaleDetails call names no outlet, so this one sends the outlet id as a StoreId header and, when
// the orders carry an outlet field, keeps only that outlet's orders (outletFilter says which).
async function fetchOutletDay(deps: EventsDeps, outletId: string, date: string) {
  const apiKey = Deno.env.get('CIFERON_API_KEY');
  if (!apiKey) throw new Error('CIFERON_API_KEY not configured');
  const res = await fetch('https://api.ciferon.com/api/LoginApi/SaleDetails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', StoreId: String(outletId) },
    body: JSON.stringify({ StartDate: date, EndDate: date }),
  });
  if (!res.ok) throw new Error(`SaleDetails returned HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.IsSuccess) throw new Error('SaleDetails responded with IsSuccess=false');
  const all = (data.Result?.orderList || []).filter((o: any) => deps.ciferonOrderDate(o) === date);
  const outletOf = (o: any) => o?.StoreId ?? o?.storeId ?? o?.OutletId ?? o?.outletId ?? null;
  const tagged = all.some((o: any) => outletOf(o) != null);
  const orders = all
    .filter((o: any) => !tagged || String(outletOf(o)) === String(outletId))
    .filter((o: any) => !(o.TransactionStatus || '').toLowerCase().includes('cancel') && !o.IsComplimentary);
  let cash = 0, digital = 0, online = 0;
  for (const o of orders) {
    const mode = (o.PaymentMode && o.PaymentMode[0]) || 'Unknown';
    const amount = Number(o.BillAmount) || 0;
    if (mode === 'Cash') cash += amount;
    else if (mode === 'Zomato' || mode === 'Swiggy') online += amount;
    else digital += amount;
  }
  return { cash: round2(cash), digital: round2(digital), online: round2(online), orders: orders.length, outletFilter: tagged ? 'order-field' : 'header-only' };
}

async function syncEventDay(deps: EventsDeps, ev: any, date: string): Promise<any> {
  const key = `event_day:${ev.id}:${date}`;
  const existing = (await deps.kv.get<any>(key)) || { eventId: ev.id, date };
  const now = new Date().toISOString();
  try {
    const pos = await fetchOutletDay(deps, ev.ciferonStoreId, date);
    // Never overwrite real figures with an empty answer (Ciferon hiccup).
    if (pos.orders === 0 && existing.pos?.orders > 0) {
      await deps.kv.set(key, { ...existing, posCheckedAt: now });
      return { eventId: ev.id, date, skipped: 'empty answer kept the earlier figures' };
    }
    const next = { ...existing, eventId: ev.id, date, pos: { ...pos, ok: true, syncedAt: now }, posError: null, updatedAt: now };
    await deps.kv.set(key, next);
    return { eventId: ev.id, date, ok: true, ...pos };
  } catch (error: any) {
    await deps.kv.set(key, { ...existing, eventId: ev.id, date, posError: error?.message || String(error), posCheckedAt: now });
    return { eventId: ev.id, date, ok: false, error: error?.message || String(error) };
  }
}

// Called by runPosSync (index.ts) after the stores: every open event with an outlet id that runs
// today (or the day being re-synced).
export async function runEventPosSync(deps: EventsDeps, date: string): Promise<any[]> {
  const events = (await loadEvents(deps.kv)).filter((e) => e.ciferonStoreId && eventStatus(e, deps.getTodayIST()) !== 'closed' && date >= e.startDate && date <= e.endDate);
  const out: any[] = [];
  for (const ev of events) {
    out.push(await syncEventDay(deps, ev, date));
    if (digitalAccountOf(ev).mode === 'store_paytm' && ev.parentStoreId) await deps.cascadeRecomputePaytmBalances(ev.parentStoreId, date);
  }
  return out;
}

// ── Routes ──

export function registerEventsRoutes(app: any, deps: EventsDeps) {
  const { kv } = deps;

  const actorOf = async (c: any): Promise<{ actor?: Actor; error?: any }> => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const meta = auth.user.user_metadata || {};
    const employeeId = meta.employeeId ? String(meta.employeeId) : null;
    // Designation from the employee record first, as elsewhere: only managers and the owner write it.
    const emp = employeeId ? await kv.get<any>(`unified-employee:${employeeId}`) : null;
    return {
      actor: {
        userId: auth.user.id, employeeId, emp, role: meta.role || null,
        designation: emp?.designation || meta.designation || null,
        name: emp?.name || meta.name || auth.user.email || 'Someone',
      },
    };
  };
  const fail = (c: any, err: any, what: string) => {
    console.error(`[events] ${what}:`, err?.message || err);
    return c.json({ error: `Couldn't ${what} - try again` }, 500);
  };
  // The event, if this person may see it.
  const eventFor = async (c: any, a: Actor): Promise<{ ev?: any; error?: any }> => {
    const id = c.req.param('id');
    if (!id || !isEventId(id)) return { error: c.json({ error: 'Event not found' }, 404) };
    const ev = await kv.get<any>(`event:${id}`);
    if (!ev || !canSeeEvent(a, ev)) return { error: c.json({ error: 'Event not found' }, 404) };
    return { ev };
  };
  const closedError = (c: any) => c.json({ error: 'This event is closed - its figures can no longer change' }, 409);
  const permissionsOf = (a: Actor, ev: any, today: string) => ({
    canManage: canManageEvent(a),
    canRunStock: canRunEventStock(a),
    canEnter: canEnterForEvent(a, ev, today),
    canSubmitDay: canSubmitEventDay(a, ev, today),
    canMoveMoney: eventStatus(ev, today) !== 'closed' && (canRunEventStock(a) || (isEventIncharge(ev, a.employeeId) && canEnterForEvent(a, ev, today))),
    isIncharge: isEventIncharge(ev, a.employeeId),
    isAssigned: isAssigned(ev, a.employeeId),
  });
  // A production incharge of this house (one with no houses listed is treated as covering all,
  // as the production queue does for older records).
  const producesFor = (a: Actor, houseId: string | null | undefined) => {
    if (a.designation !== 'production_incharge' || !houseId) return false;
    const houses: string[] = Array.isArray(a.emp?.assignedProductionHouseIds) ? a.emp.assignedProductionHouseIds.map(String) : [];
    return houses.length === 0 || houses.includes(String(houseId));
  };
  const employeesById = async () => new Map(((await kv.getByPrefix<any>('unified-employee:')) || []).filter((e) => e?.employeeId).map((e) => [String(e.employeeId), e]));
  const notifyPeople = async (people: any[], type: string, title: string, message: string, relatedId?: string, date?: string) => {
    const seen = new Set<string>();
    for (const p of people) {
      if (!p?.authUserId || seen.has(p.authUserId)) continue;
      seen.add(p.authUserId);
      await deps.notifyUser(p.authUserId, type, title, message, relatedId, date).catch(() => {});
    }
  };

  // Validates the create / edit form. `prev` is the event being edited.
  const cleanEvent = async (body: any, prev: any | null): Promise<{ value?: any; error?: string }> => {
    const pick = <T>(k: string, fallback: T): any => (body?.[k] !== undefined ? body[k] : prev ? prev[k] : fallback);
    const name = text(pick('name', ''), 80);
    if (!name) return { error: 'Give the event a name' };
    const startDate = pick('startDate', '');
    const endDate = pick('endDate', '');
    if (!isISODate(startDate) || !isISODate(endDate)) return { error: 'Choose the first and last day' };
    if (endDate < startDate) return { error: 'The last day is before the first day' };
    if (datesBetween(startDate, endDate).length > MAX_EVENT_DAYS) return { error: `An event can run at most ${MAX_EVENT_DAYS} days` };
    const parentStoreId = String(pick('parentStoreId', '') || '');
    const store = parentStoreId ? await kv.get<any>(`store:${parentStoreId}`) : null;
    if (!store) return { error: 'Choose the store this event belongs to' };
    const productionHouseId = String(pick('productionHouseId', '') || store.productionHouseId || '');
    if (productionHouseId && !(await kv.get<any>(`production_house_${productionHouseId}`))) return { error: 'That production house was not found' };
    const lat = pick('lat', null);
    const lng = pick('lng', null);
    const hasPin = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== null && lng !== null && !(Number(lat) === 0 && Number(lng) === 0);
    if (hasPin && (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) return { error: 'That map pin is not valid' };
    const radiusM = Math.round(Number(pick('radiusM', 150)) || 150);
    if (radiusM < 50 || radiusM > 1000) return { error: 'The check-in radius must be between 50 and 1000 m' };
    const rentIn = pick('rent', { mode: 'total', amount: 0 }) || {};
    const rentAmount = money(rentIn.amount ?? 0);
    if (rentAmount === null) return { error: 'Enter the rent as an amount' };
    const rent = { mode: rentIn.mode === 'per_day' ? 'per_day' : 'total', amount: rentAmount };
    const staffIds = ids(pick('staffIds', []));
    const inchargeId = String(pick('inchargeId', '') || '') || null;
    if (inchargeId && !staffIds.includes(inchargeId)) staffIds.push(inchargeId);
    if (staffIds.length > 40) return { error: 'Too many people on one event' };
    if (staffIds.length) {
      const people = await kv.mget<any>(staffIds.map((id) => `unified-employee:${id}`));
      const missing = staffIds.filter((_, i) => !people?.[i]);
      if (missing.length) return { error: `Some people were not found: ${missing.join(', ')}` };
    }
    const digitalIn = pick('digital', { mode: 'separate', name: '' }) || {};
    const digital = { mode: digitalIn.mode === 'store_paytm' ? 'store_paytm' : 'separate', name: text(digitalIn.name, 40) };
    const ciferonStoreId = text(pick('ciferonStoreId', ''), 40) || null;
    const costIn = pick('momoCostPerPiece', null);
    const momoCostPerPiece: Record<string, number> = {};
    if (costIn && typeof costIn === 'object') {
      for (const k of EVENT_MOMO_KEYS) { const v = money((costIn as any)[k]); if (v) momoCostPerPiece[k] = v; }
    }
    return {
      value: {
        name, venue: text(pick('venue', ''), 160), startDate, endDate, parentStoreId, productionHouseId: productionHouseId || null,
        lat: hasPin ? Math.round(Number(lat) * 1e6) / 1e6 : null, lng: hasPin ? Math.round(Number(lng) * 1e6) / 1e6 : null, radiusM,
        rent, staffIds, inchargeId, digital, ciferonStoreId, momoCostPerPiece, notes: text(pick('notes', ''), 500),
      },
    };
  };

  const summaryRow = (ev: any, data: Bundle, settings: any, today: string, a: Actor) => {
    const pnl = pnlFor(ev, data, settings, today);
    const m = { event: ev, days: data.days, expenses: data.expenses, moves: data.moves, topups: data.topups };
    return {
      ...ev, status: eventStatus(ev, today), dayCount: eventDays(ev).length,
      sales: pnl.sales, costs: pnl.costs, profit: pnl.profit,
      cashInHand: eventCashInHand(m, today),
      digitalAccount: digitalAccountOf(ev),
      assetsOut: assetsStillOut(data.assets).length,
      pendingTopups: data.topups.filter((t) => t.status === 'pending').length,
      myRole: isEventIncharge(ev, a.employeeId) ? 'incharge' : isAssigned(ev, a.employeeId) ? 'staff' : null,
    };
  };

  // Events this person may see, newest first, with a few headline figures.
  app.get(`${P}/events`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const today = deps.getTodayIST();
      const visible = (await loadEvents(kv)).filter((e) => canSeeEvent(a, e));
      if (!visible.length) return c.json({ events: [], canCreate: canManageEvent(a) });
      const [data, settings] = await Promise.all([loadAllEventData(deps), loadEventSettings(kv)]);
      const events = visible
        .map((ev) => summaryRow(ev, forEvent(data, ev.id), settings, today, a))
        .sort((x, y) => y.startDate.localeCompare(x.startDate));
      return c.json({ events, canCreate: canManageEvent(a), today });
    } catch (err) { return fail(c, err, 'load events'); }
  });

  // The events this person works at now (assigned, inside the event window): the Home card.
  app.get(`${P}/events/mine`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const today = deps.getTodayIST();
      const mine = (await loadEvents(kv)).filter((e) => isAssigned(e, a.employeeId) && canEnterForEvent(a, e, today));
      if (!mine.length) return c.json({ events: [], today });
      const out: any[] = [];
      for (const ev of mine) {
        const data = await loadOneEventData(deps, ev.id);
        const day = data.days.find((d) => d.date === today) || null;
        const m = { event: ev, days: data.days, expenses: data.expenses, moves: data.moves, topups: data.topups };
        out.push({
          id: ev.id, name: ev.name, venue: ev.venue, startDate: ev.startDate, endDate: ev.endDate, status: eventStatus(ev, today),
          myRole: isEventIncharge(ev, a.employeeId) ? 'incharge' : 'staff',
          today: { submitted: !!day?.submitted, sales: daySales(day).total, source: daySales(day).source },
          cashInHand: eventCashInHand(m, today),
          digitalAccount: digitalAccountOf(ev),
          incoming: data.requests.filter((q) => q.status === 'shipped' || q.status === 'partially-shipped').length,
          pendingTopups: data.topups.filter((t) => t.status === 'pending').length,
        });
      }
      return c.json({ events: out, today });
    } catch (err) { return fail(c, err, 'load your events'); }
  });

  // Business totals across events for a window (Insights: Store / Production / Events).
  app.get(`${P}/events/summary`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!(canRunEventStock(a) || a.role === 'audit')) return c.json({ error: 'You are not allowed to see this' }, 403);
    const from = c.req.query('from');
    const to = c.req.query('to');
    if ((from && !isISODate(from)) || (to && !isISODate(to)) || (from && to && from > to)) return c.json({ error: 'from and to must be dates like 2026-11-27' }, 400);
    try {
      const today = deps.getTodayIST();
      const events = (await loadEvents(kv)).filter((e) => (!to || e.startDate <= to) && (!from || e.endDate >= from));
      const [data, settings] = await Promise.all([loadAllEventData(deps), loadEventSettings(kv)]);
      const items = events.map((ev) => ({ event: ev, status: eventStatus(ev, today), pnl: pnlFor(ev, forEvent(data, ev.id), settings, today, from || undefined, to || undefined) }));
      return c.json({ summary: summarizeEvents(items, from || undefined, to || undefined) });
    } catch (err) { return fail(c, err, 'work out the event totals'); }
  });

  // Leftover momos coming back from events, for the production side to confirm (and everyone
  // who manages events). ?status=sent|received, ?productionHouseId=.
  app.get(`${P}/events/momo-returns`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const isProduction = a.designation === 'production_incharge';
    if (!(canRunEventStock(a) || a.role === 'audit' || isProduction)) return c.json({ returns: [] });
    try {
      const status = c.req.query('status');
      const house = c.req.query('productionHouseId');
      const [rows, events] = await Promise.all([deps.getAllByPrefix('event_momo_return:'), loadEvents(kv)]);
      const names = new Map(events.map((e) => [e.id, e.name]));
      const list = (rows || [])
        .filter((x: any) => x && !x.voided && x.status !== 'wasted_only' && (!status || x.status === status) && (!house || x.productionHouseId === house))
        .filter((x: any) => !isProduction || canRunEventStock(a) || producesFor(a, x.productionHouseId))
        .map((x: any) => ({ ...x, eventName: names.get(x.eventId) || x.eventName || 'Event' }))
        .sort((x: any, y: any) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')));
      return c.json({ returns: list });
    } catch (err) { return fail(c, err, 'load the momo returns'); }
  });

  app.get(`${P}/events/settings`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const s = await loadEventSettings(kv);
    return c.json({ settings: s, canEdit: canManageEvent(r.actor!) });
  });

  app.put(`${P}/events/settings`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    if (!canManageEvent(r.actor!)) return c.json({ error: 'Only the owner can change event costs' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const momoCostPerPiece: Record<string, number> = {};
    for (const k of EVENT_MOMO_KEYS) { const v = money(body?.momoCostPerPiece?.[k]); if (v !== null && v > 0) momoCostPerPiece[k] = v; }
    const pct = Number(body?.onlineCommissionPct ?? 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 60) return c.json({ error: 'Commission must be between 0 and 60%' }, 400);
    const next = { momoCostPerPiece, onlineCommissionPct: pct, updatedAt: new Date().toISOString(), updatedBy: r.actor!.name };
    await kv.set('event-settings', next);
    return c.json({ settings: await loadEventSettings(kv) });
  });

  // Create (the cluster head; also gated in index.ts ROLE_GATES).
  app.post(`${P}/events`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!canManageEvent(a)) return c.json({ error: 'Only the owner can create events' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const cleaned = await cleanEvent(body, null);
      if (cleaned.error) return c.json({ error: cleaned.error }, 400);
      const now = new Date().toISOString();
      const id = `EVENT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const ev = { id, kind: 'event', ...cleaned.value, status: 'open', createdBy: a.employeeId || a.userId, createdByName: a.name, createdAt: now, updatedAt: now };
      await kv.set(`event:${id}`, ev);
      await deps.afterResponse('Event staff notifications', async () => {
        const byId = await employeesById();
        await notifyPeople(ev.staffIds.map((s: string) => byId.get(s)), 'event_assigned', 'You are working at an event',
          `${ev.name}${ev.venue ? `, ${ev.venue}` : ''}: ${ev.startDate} to ${ev.endDate}.${ev.inchargeId ? ` Incharge: ${byId.get(ev.inchargeId)?.name || ev.inchargeId}.` : ''}`, id, ev.startDate);
      });
      return c.json({ event: { ...ev, status: eventStatus(ev, deps.getTodayIST()) } });
    } catch (err) { return fail(c, err, 'create the event'); }
  });

  app.put(`${P}/events/:id`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!canManageEvent(a)) return c.json({ error: 'Only the owner can change an event' }, 403);
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const prev = e.ev;
    if (eventStatus(prev, deps.getTodayIST()) === 'closed') return closedError(c);
    try {
      const body = await c.req.json().catch(() => ({}));
      const cleaned = await cleanEvent(body, prev);
      if (cleaned.error) return c.json({ error: cleaned.error }, 400);
      const next = { ...prev, ...cleaned.value, updatedAt: new Date().toISOString(), updatedBy: a.name };
      await kv.set(`event:${prev.id}`, next);
      const added = next.staffIds.filter((s: string) => !(prev.staffIds || []).includes(s));
      if (added.length) {
        await deps.afterResponse('Event staff notifications', async () => {
          const byId = await employeesById();
          await notifyPeople(added.map((s: string) => byId.get(s)), 'event_assigned', 'You are working at an event', `${next.name}: ${next.startDate} to ${next.endDate}.`, next.id, next.startDate);
        });
      }
      // The digital account or the dates changed: the store's Paytm may gain or lose collections.
      if (prev.parentStoreId && (prev.digital?.mode !== next.digital?.mode || prev.digital?.name !== next.digital?.name || prev.startDate !== next.startDate)) {
        await deps.cascadeRecomputePaytmBalances(prev.parentStoreId, prev.startDate < next.startDate ? prev.startDate : next.startDate);
      }
      return c.json({ event: { ...next, status: eventStatus(next, deps.getTodayIST()) } });
    } catch (err) { return fail(c, err, 'save the event'); }
  });

  // Close: read-only from then on. Assets still out or unsubmitted days are reported back first
  // unless the owner closes anyway (force).
  app.post(`${P}/events/:id/close`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!canManageEvent(a)) return c.json({ error: 'Only the owner can close an event' }, 403);
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (eventStatus(ev, today) === 'closed') return c.json({ event: { ...ev, status: 'closed' } });
    const body = await c.req.json().catch(() => ({}));
    const [data, settings] = await Promise.all([loadOneEventData(deps, ev.id), loadEventSettings(kv)]);
    const out = assetsStillOut(data.assets);
    const unsubmitted = eventDays(ev).filter((d) => d <= today && !data.days.find((x) => x.date === d && x.submitted));
    const inTransit = data.requests.filter((q) => q.status === 'shipped' || q.status === 'partially-shipped').length;
    // Momos still at the stall: send them back to production or write them off first.
    const momosLeft = momosLeftAtStall(eventMomoStock(data.requests, data.days, settings.piecesPerPlate, data.returns));
    const returnsOnTheWay = data.returns.filter((r) => r.status === 'sent').length;
    if (!body?.force && (out.length || unsubmitted.length || inTransit || momosLeft || returnsOnTheWay)) {
      return c.json({ error: 'There are open items', code: 'EVENT_OPEN_ITEMS', assetsOut: out.map((x) => ({ id: x.id, assetName: x.assetName, left: x.quantity - (x.returnedQty || 0) })), unsubmittedDays: unsubmitted, inTransit, momosLeft, returnsOnTheWay }, 409);
    }
    const closed = { ...ev, status: 'closed', closedAt: new Date().toISOString(), closedBy: a.name };
    // The final P&L is kept on the record as it stood at closing.
    closed.finalPnl = pnlFor(closed, data, settings, today);
    await kv.set(`event:${ev.id}`, closed);
    return c.json({ event: { ...closed, status: 'closed' } });
  });

  app.post(`${P}/events/:id/reopen`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!canManageEvent(a)) return c.json({ error: 'Only the owner can reopen an event' }, 403);
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const { closedAt: _c, closedBy: _b, finalPnl: _p, ...rest } = e.ev;
    const next = { ...rest, status: 'open', reopenedAt: new Date().toISOString(), reopenedBy: a.name };
    await kv.set(`event:${e.ev.id}`, next);
    return c.json({ event: { ...next, status: eventStatus(next, deps.getTodayIST()) } });
  });

  // Everything the event page shows, in one answer.
  app.get(`${P}/events/:id`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    try {
      const today = deps.getTodayIST();
      const [data, settings, store, house, byId] = await Promise.all([
        loadOneEventData(deps, ev.id), loadEventSettings(kv), kv.get<any>(`store:${ev.parentStoreId}`),
        ev.productionHouseId ? kv.get<any>(`production_house_${ev.productionHouseId}`) : Promise.resolve(null), employeesById(),
      ]);
      const m = { event: ev, days: data.days, expenses: data.expenses, moves: data.moves, topups: data.topups };
      const pnl = pnlFor(ev, data, settings, today);
      const dayRows = eventDays(ev).map((date) => {
        const day = data.days.find((d) => d.date === date) || null;
        const cash = expectedEventCash(m, date);
        return { date, day, sales: daySales(day), expectedCash: cash.expected, openingCash: cash.opening };
      });
      const staff = (ev.staffIds || []).map((id: string) => {
        const p = byId.get(id);
        return { employeeId: id, name: p?.name || id, designation: p?.designation || null, isIncharge: ev.inchargeId === id, phone: canRunEventStock(a) ? p?.phone || null : null };
      });
      return c.json({
        event: { ...ev, status: eventStatus(ev, today) },
        today,
        store: store ? { id: store.id, name: store.name } : null,
        productionHouse: house ? { id: house.id, name: house.name } : null,
        permissions: permissionsOf(a, ev, today),
        digitalAccount: digitalAccountOf(ev),
        days: dayRows,
        expenses: data.expenses.sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.createdAt || '').localeCompare(x.createdAt || '')),
        transfers: data.transfers.sort((x, y) => (y.date || '').localeCompare(x.date || '')),
        moves: data.moves.sort((x, y) => (y.date || '').localeCompare(x.date || '')),
        assets: data.assets.sort((x, y) => (y.outAt || '').localeCompare(x.outAt || '')),
        requests: data.requests.sort((x, y) => String(y.requestDate || '').localeCompare(String(x.requestDate || ''))),
        topups: data.topups.sort((x, y) => String(y.requestDate || '').localeCompare(String(x.requestDate || ''))),
        returns: data.returns.sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || ''))),
        cash: { inHand: eventCashInHand(m, today), lines: eventCashLines(m) },
        digital: { account: digitalAccountOf(ev), balance: eventDigitalBalance(m, today), lines: eventDigitalLines(m) },
        stock: { momos: eventMomoStock(data.requests, data.days, settings.piecesPerPlate, data.returns), items: eventItemsOnHand(data.transfers) },
        staff,
        pnl,
        settings,
      });
    } catch (err) { return fail(c, err, 'load the event'); }
  });

  app.get(`${P}/events/:id/pnl`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const e = await eventFor(c, r.actor!);
    if (e.error) return e.error;
    try {
      const [data, settings] = await Promise.all([loadOneEventData(deps, e.ev.id), loadEventSettings(kv)]);
      const from = c.req.query('from');
      const to = c.req.query('to');
      return c.json({ pnl: pnlFor(e.ev, data, settings, deps.getTodayIST(), isISODate(from) ? from : undefined, isISODate(to) ? to : undefined) });
    } catch (err) { return fail(c, err, 'work out the P&L'); }
  });

  // A day's sales and cash count. Assigned staff save; the incharge (or a manager) submits.
  // Saving again replaces the day's figures (one row per day), so the app's resend is harmless.
  app.put(`${P}/events/:id/days/:date`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const date = c.req.param('date');
    const today = deps.getTodayIST();
    if (!isISODate(date) || date < ev.startDate || date > ev.endDate) return c.json({ error: 'That day is not one of the event days' }, 400);
    if (eventStatus(ev, today) === 'closed') return closedError(c);
    if (!canEnterForEvent(a, ev, today)) return c.json({ error: 'You can enter figures for this event only on its days' }, 403);
    if (date > today) return c.json({ error: 'That day has not come yet' }, 400);
    try {
      const body = await c.req.json().catch(() => ({}));
      const submit = !!body.submit;
      if (submit && !canSubmitEventDay(a, ev, today)) return c.json({ error: 'Only the event incharge can send the day close' }, 403);
      const key = `event_day:${ev.id}:${date}`;
      const existing = (await kv.get<any>(key)) || { eventId: ev.id, date };
      if (existing.submitted && !canSubmitEventDay(a, ev, today)) return c.json({ error: 'The incharge has already sent this day' }, 409);
      const cash = money(body.cash ?? 0);
      const digital = money(body.digital ?? 0);
      const online = money(body.online ?? 0);
      if (cash === null || digital === null || online === null) return c.json({ error: 'Enter the amounts as numbers' }, 400);
      const plates: Record<string, number> = {};
      for (const k of EVENT_MOMO_KEYS) {
        const v = Math.round(Number(body?.plates?.[k]) || 0);
        if (v < 0 || v > 5000) return c.json({ error: 'Check the plate counts' }, 400);
        if (v) plates[k] = v;
      }
      let cashCounted: number | null = existing.cashCounted ?? null;
      if (body.cashCounted !== undefined && body.cashCounted !== null && body.cashCounted !== '') {
        cashCounted = money(body.cashCounted);
        if (cashCounted === null) return c.json({ error: 'Enter the cash counted as a number' }, 400);
      }
      if (submit && cashCounted === null) return c.json({ error: 'Count the cash before sending the day close' }, 400);
      const now = new Date().toISOString();
      const next: any = {
        ...existing,
        eventId: ev.id, date,
        manual: { cash, digital, online, plates, notes: text(body.notes, 500), by: a.employeeId || a.userId, byName: a.name, at: now },
        cashCounted,
        clientEntryId: typeof body.clientEntryId === 'string' ? body.clientEntryId.slice(0, 80) : existing.clientEntryId || null,
        updatedAt: now,
      };
      // Expected cash on the day, frozen with the count (the page also shows it live).
      const data = await loadOneEventData(deps, ev.id);
      const days = data.days.filter((d) => d.date !== date).concat([next]);
      const expected = expectedEventCash({ event: ev, days, expenses: data.expenses, moves: data.moves, topups: data.topups }, date).expected;
      next.expectedCash = expected;
      next.cashDiff = cashCounted === null ? null : round2(cashCounted - expected);
      if (submit) Object.assign(next, { submitted: true, submittedBy: a.employeeId || a.userId, submittedByName: a.name, submittedAt: now });
      await kv.set(key, next);
      if (digitalAccountOf(ev).mode === 'store_paytm' && ev.parentStoreId) await deps.cascadeRecomputePaytmBalances(ev.parentStoreId, date);
      if (submit) {
        await deps.afterResponse('Event day close notifications', async () => {
          const people = [...(await deps.getAllClusterHeads()), ...(await deps.getOperationsManagers())];
          const s = daySales(next);
          const diff = next.cashDiff ? ` Cash ${next.cashDiff > 0 ? 'over' : 'short'} by ₹${Math.abs(next.cashDiff).toLocaleString('en-IN')}.` : '';
          await notifyPeople(people, 'event_day_closed', `${ev.name}: day closed`, `${a.name} sent ${date}: sales ₹${s.total.toLocaleString('en-IN')}.${diff}`, ev.id, date);
        });
      }
      return c.json({ day: next, sales: daySales(next) });
    } catch (err) { return fail(c, err, 'save the day'); }
  });

  // Pull a day from the stall's Ciferon outlet now.
  app.post(`${P}/events/:id/pos-sync`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (!ev.ciferonStoreId) return c.json({ error: 'This event has no Ciferon outlet set' }, 400);
    if (!canEnterForEvent(a, ev, today)) return c.json({ error: 'You are not allowed to do this' }, 403);
    if (deps.inPosQuietHours()) return c.json({ error: 'Ciferon shows unreliable figures between 11:50 PM and 6:10 AM, so syncing is paused then. Please try again after 6:10 AM.' }, 423);
    const body = await c.req.json().catch(() => ({}));
    const date = isISODate(body?.date) ? body.date : today;
    if (date < ev.startDate || date > ev.endDate || date > today) return c.json({ error: 'That day is not one of the event days' }, 400);
    const result = await syncEventDay(deps, ev, date);
    if (digitalAccountOf(ev).mode === 'store_paytm' && ev.parentStoreId) await deps.cascadeRecomputePaytmBalances(ev.parentStoreId, date);
    return c.json({ result, day: await kv.get(`event_day:${ev.id}:${date}`) });
  });

  // An expense. The app's entry id is the row id, so a resend after a dropped signal lands on the
  // same row instead of adding a second one.
  app.post(`${P}/events/:id/expenses`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (eventStatus(ev, today) === 'closed') return closedError(c);
    if (!canEnterForEvent(a, ev, today)) return c.json({ error: 'You can add expenses for this event only on its days' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const id = safeId(body.clientEntryId) || newId();
      const key = `event_expense:${ev.id}:${id}`;
      const existing = await kv.get<any>(key);
      if (existing) return c.json({ expense: existing, replay: true });
      const amount = money(body.amount);
      if (!amount) return c.json({ error: 'Enter the amount' }, 400);
      const category = EXPENSE_CATEGORIES.includes(body.category) ? body.category : 'other';
      const paidFrom = PAID_FROM.includes(body.paidFrom) ? body.paidFrom : 'event_cash';
      if (paidFrom === 'event_digital' && digitalAccountOf(ev).mode !== 'separate') return c.json({ error: 'This stall uses the store\'s Paytm - pay from event cash, or the owner pays' }, 400);
      const date = isISODate(body.date) ? body.date : today;
      if (date > today) return c.json({ error: 'That day has not come yet' }, 400);
      if (date < addDaysISO(ev.startDate, -14) || date > addDaysISO(ev.endDate, 3)) return c.json({ error: 'That date is too far from the event days' }, 400);
      const quantity = body.quantity != null && body.quantity !== '' ? money(body.quantity) : null;
      const expense = {
        id, eventId: ev.id, date, category, paidFrom, amount,
        description: text(body.description, 160) || category,
        ...(quantity ? { quantity, unit: text(body.unit, 20) } : {}),
        createdBy: a.employeeId || a.userId, createdByName: a.name, createdAt: new Date().toISOString(),
      };
      await kv.set(key, expense);
      return c.json({ expense });
    } catch (err) { return fail(c, err, 'save the expense'); }
  });

  // Void an expense (kept, marked voided) - managers only.
  app.post(`${P}/events/:id/expenses/:expenseId/void`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    if (!canRunEventStock(a)) return c.json({ error: 'Only a manager can void an expense' }, 403);
    if (eventStatus(e.ev, deps.getTodayIST()) === 'closed') return closedError(c);
    const key = `event_expense:${e.ev.id}:${c.req.param('expenseId')}`;
    const row = await kv.get<any>(key);
    if (!row) return c.json({ error: 'Expense not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const next = { ...row, voided: true, voidedBy: a.name, voidedAt: new Date().toISOString(), voidReason: text(body.reason, 200) };
    await kv.set(key, next);
    return c.json({ expense: next });
  });

  // Momos from the production house: an ordinary stock request whose "store" is the event.
  app.post(`${P}/events/:id/stock-requests`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (eventStatus(ev, today) === 'closed') return closedError(c);
    if (!(canRunEventStock(a) || (isEventIncharge(ev, a.employeeId) && canEnterForEvent(a, ev, today)))) {
      return c.json({ error: 'Only the event incharge or a manager can ask production for momos' }, 403);
    }
    if (!ev.productionHouseId) return c.json({ error: 'Choose the production house for this event first' }, 400);
    try {
      const body = await c.req.json().catch(() => ({}));
      const requestDate = isISODate(body.requestDate) ? body.requestDate : today;
      if (requestDate < addDaysISO(ev.startDate, -2) || requestDate > ev.endDate) return c.json({ error: 'Ask for momos for one of the event days' }, 400);
      const quantities: Record<string, number> = {};
      let total = 0;
      for (const k of EVENT_MOMO_KEYS) {
        const v = Math.round(Number(body?.quantities?.[k]) || 0);
        if (v < 0 || v > 20000) return c.json({ error: 'Check the quantities' }, 400);
        if (v) { quantities[k] = v; total += v; }
      }
      if (!total) return c.json({ error: 'Enter how many momos you need' }, 400);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const request = {
        id, requestDate,
        storeId: ev.id, storeName: ev.name,
        eventId: ev.id, eventName: ev.name, locationKind: 'event', productionHouseId: ev.productionHouseId, parentStoreId: ev.parentStoreId,
        requestedBy: a.employeeId || a.userId, requestedByName: a.name,
        ...quantities,
        ...(body.sauces && typeof body.sauces === 'object' ? { sauces: body.sauces } : {}),
        ...(body.utilities && typeof body.utilities === 'object' ? { utilities: body.utilities } : {}),
        notes: text(body.notes, 500),
        status: 'pending', createdAt: now, updatedAt: now,
      };
      await kv.set(`production_request_${id}`, request);
      await deps.afterResponse('Event stock request notifications', async () => {
        const all = (await kv.getByPrefix<any>('unified-employee:')) || [];
        const production = all.filter((p) => p.designation === 'production_incharge' && p.status !== 'inactive' &&
          (!(p.assignedProductionHouseIds || []).length || (p.assignedProductionHouseIds || []).includes(ev.productionHouseId)));
        await notifyPeople([...production, ...(await deps.getOperationsManagers())], 'production_request_new', 'New stock request (event)',
          `${ev.name} (event) needs ${total} momos for ${requestDate}. Please accept and prepare.`, id, requestDate);
      });
      return c.json({ request });
    } catch (err) { return fail(c, err, 'send the request'); }
  });

  // Items moved from the parent store to the event (or brought back), valued at the store's
  // latest purchase price for that item unless a cost is given. The store's utilities stock
  // counts them as used (see eventTransfersForStore).
  app.post(`${P}/events/:id/transfers`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (eventStatus(ev, today) === 'closed') return closedError(c);
    if (!(canRunEventStock(a) || (isEventIncharge(ev, a.employeeId) && canEnterForEvent(a, ev, today)))) {
      return c.json({ error: 'Only the event incharge or a manager can move store stock' }, 403);
    }
    try {
      const body = await c.req.json().catch(() => ({}));
      const id = safeId(body.clientEntryId) || newId();
      const key = `event_transfer:${ev.id}:${id}`;
      const existing = await kv.get<any>(key);
      if (existing) return c.json({ transfer: existing, replay: true });
      const direction = body.direction === 'to_store' ? 'to_store' : 'to_event';
      const date = isISODate(body.date) ? body.date : today;
      if (date > today) return c.json({ error: 'That day has not come yet' }, 400);
      const raw = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!raw.length) return c.json({ error: 'Add at least one item' }, 400);
      // The store's latest purchase price per item name.
      const purchases = ((await deps.getAllByPrefix('inventory:')) || []).filter((p: any) => p?.storeId === ev.parentStoreId && p?.itemName);
      const lastPrice = (name: string) => {
        const lower = name.toLowerCase();
        const hit = purchases.filter((p: any) => String(p.itemName).trim().toLowerCase() === lower && Number(p.quantity) > 0)
          .sort((x: any, y: any) => String(y.date || '').localeCompare(String(x.date || '')))[0];
        if (!hit) return null;
        const total = Number(hit.totalCost ?? hit.amount) || 0;
        return total > 0 ? round2(total / Number(hit.quantity)) : null;
      };
      const items: any[] = [];
      for (const it of raw) {
        const itemName = text(it?.itemName, 80);
        const quantity = money(it?.quantity);
        if (!itemName || !quantity) return c.json({ error: 'Each item needs a name and a quantity' }, 400);
        const given = it?.unitCost != null && it.unitCost !== '' ? money(it.unitCost) : null;
        const unitCost = given ?? lastPrice(itemName) ?? 0;
        items.push({
          itemName, quantity, unit: text(it?.unit, 20) || 'pcs',
          category: TRANSFER_CATEGORIES.includes(it?.category) ? it.category : 'other',
          unitCost, totalCost: round2(unitCost * quantity), costFrom: given != null ? 'entered' : unitCost ? 'last purchase' : 'unknown',
        });
      }
      const transfer = {
        id, eventId: ev.id, direction, storeId: ev.parentStoreId, date, items,
        totalCost: round2(items.reduce((s, x) => s + x.totalCost, 0)), note: text(body.note, 300),
        createdBy: a.employeeId || a.userId, createdByName: a.name, createdAt: new Date().toISOString(),
      };
      await kv.set(key, transfer);
      return c.json({ transfer });
    } catch (err) { return fail(c, err, 'record the items'); }
  });

  // Cash or digital money moving in or out: an opening float from the owner or the store, a
  // handover at the end, a transfer out of the separate digital account.
  app.post(`${P}/events/:id/money`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (!permissionsOf(a, ev, today).canMoveMoney) return c.json({ error: 'Only the event incharge or a manager can record this' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const id = safeId(body.clientEntryId) || newId();
      const key = `event_money:${ev.id}:${id}`;
      const existing = await kv.get<any>(key);
      if (existing) return c.json({ move: existing, replay: true });
      const account = body.account === 'digital' ? 'digital' : 'cash';
      if (account === 'digital' && digitalAccountOf(ev).mode !== 'separate') return c.json({ error: 'This stall uses the store\'s Paytm, which has its own ledger' }, 400);
      const direction = body.direction === 'out' ? 'out' : 'in';
      const counterparty = COUNTERPARTIES.includes(body.counterparty) ? body.counterparty : 'owner';
      const amount = money(body.amount);
      if (!amount) return c.json({ error: 'Enter the amount' }, 400);
      const date = isISODate(body.date) ? body.date : today;
      if (date > today) return c.json({ error: 'That day has not come yet' }, 400);
      const move = {
        id, eventId: ev.id, account, direction, counterparty, amount, date, note: text(body.note, 300),
        createdBy: a.employeeId || a.userId, createdByName: a.name, createdAt: new Date().toISOString(),
      };
      await kv.set(key, move);
      return c.json({ move });
    } catch (err) { return fail(c, err, 'record the money'); }
  });

  app.post(`${P}/events/:id/money/:moveId/void`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    if (!canRunEventStock(a)) return c.json({ error: 'Only a manager can void this' }, 403);
    if (eventStatus(e.ev, deps.getTodayIST()) === 'closed') return closedError(c);
    const key = `event_money:${e.ev.id}:${c.req.param('moveId')}`;
    const row = await kv.get<any>(key);
    if (!row) return c.json({ error: 'Not found' }, 404);
    const next = { ...row, voided: true, voidedBy: a.name, voidedAt: new Date().toISOString() };
    await kv.set(key, next);
    return c.json({ move: next });
  });

  // Assets (the equipment register, assets.ts) checked out to the event and returned.
  app.post(`${P}/events/:id/assets`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (eventStatus(ev, today) === 'closed') return closedError(c);
    if (!permissionsOf(a, ev, today).canMoveMoney) return c.json({ error: 'Only the event incharge or a manager can check out equipment' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const assetId = typeof body.assetId === 'string' ? body.assetId : '';
      const asset = assetId ? await kv.get<any>(`asset:${assetId}`) : null;
      if (!asset || asset.dismissed || asset.condition === 'disposed') return c.json({ error: 'That item is not in the register' }, 404);
      const quantity = Math.round(Number(body.quantity) || 1);
      // Already out at any event.
      const out = ((await kv.getByPrefix<any>('event_asset:')) || []).filter((x) => x.assetId === assetId && !x.voided)
        .reduce((s, x) => s + Math.max(0, (Number(x.quantity) || 0) - (Number(x.returnedQty) || 0)), 0);
      const available = Math.max(0, (Number(asset.quantity) || 1) - out);
      if (quantity < 1 || quantity > available) return c.json({ error: available ? `Only ${available} available to take` : 'All of these are already out at events' }, 400);
      const id = safeId(body.clientEntryId) || newId();
      const row = {
        id, eventId: ev.id, eventName: ev.name, assetId, assetName: asset.name, category: asset.category || null,
        homeKind: asset.locationKind, homeId: asset.locationId, quantity, outCondition: asset.condition || 'good',
        outAt: new Date().toISOString(), outBy: a.name, note: text(body.note, 200), returnedQty: 0, returns: [],
      };
      await kv.set(`event_asset:${ev.id}:${id}`, row);
      return c.json({ checkout: row });
    } catch (err) { return fail(c, err, 'check out the item'); }
  });

  app.post(`${P}/events/:id/assets/:checkoutId/return`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    // Returns stay possible after the event days (things come back late) but not once closed.
    if (eventStatus(ev, deps.getTodayIST()) === 'closed') return closedError(c);
    if (!(canRunEventStock(a) || isEventIncharge(ev, a.employeeId))) return c.json({ error: 'Only the event incharge or a manager can return equipment' }, 403);
    try {
      const key = `event_asset:${ev.id}:${c.req.param('checkoutId')}`;
      const row = await kv.get<any>(key);
      if (!row) return c.json({ error: 'Not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const left = (Number(row.quantity) || 0) - (Number(row.returnedQty) || 0);
      const quantity = Math.round(Number(body.quantity) || left);
      if (quantity < 1 || quantity > left) return c.json({ error: `Only ${left} still out` }, 400);
      const condition = ['good', 'needs_repair', 'broken'].includes(body.condition) ? body.condition : 'good';
      const now = new Date().toISOString();
      const next = {
        ...row, returnedQty: (Number(row.returnedQty) || 0) + quantity,
        returns: [...(row.returns || []), { quantity, condition, note: text(body.note, 200), at: now, by: a.name }],
        returnedAt: now, returnCondition: condition,
      };
      await kv.set(key, next);
      // Came back damaged: the register shows it (the register's own edit can change it again).
      if (condition !== 'good') {
        const asset = await kv.get<any>(`asset:${row.assetId}`);
        if (asset && asset.condition !== 'disposed') {
          await kv.set(`asset:${row.assetId}`, { ...asset, condition, notes: [asset.notes, `Came back ${condition.replace('_', ' ')} from ${ev.name} (${now.slice(0, 10)})`].filter(Boolean).join('\n').slice(0, 1000), updatedAt: now, updatedBy: a.name });
        }
      }
      return c.json({ checkout: next });
    } catch (err) { return fail(c, err, 'record the return'); }
  });

  // Leftover momos: pieces sent back to the production house and pieces wasted (with a reason).
  // At the end of the event, or any day for a partial return. Both come off the stall's stock at
  // once; production confirms the returned pieces when they arrive, which puts them back on its
  // stock. Wasted pieces show as wastage in the event P&L.
  app.post(`${P}/events/:id/momo-returns`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const today = deps.getTodayIST();
    if (eventStatus(ev, today) === 'closed') return closedError(c);
    if (!(canRunEventStock(a) || (isEventIncharge(ev, a.employeeId) && canEnterForEvent(a, ev, today)))) {
      return c.json({ error: 'Only the event incharge or a manager can record leftover momos' }, 403);
    }
    try {
      const body = await c.req.json().catch(() => ({}));
      const id = safeId(body.clientEntryId) || newId();
      const key = `event_momo_return:${ev.id}:${id}`;
      const existing = await kv.get<any>(key);
      if (existing) return c.json({ momoReturn: existing, replay: true });
      const [data, settings] = await Promise.all([loadOneEventData(deps, ev.id), loadEventSettings(kv)]);
      const stock = eventMomoStock(data.requests, data.days, settings.piecesPerPlate, data.returns);
      const returned: Record<string, number> = {};
      const wasted: Record<string, number> = {};
      let back = 0;
      let lost = 0;
      for (const k of EVENT_MOMO_KEYS) {
        const rb = Math.round(Number(body?.returned?.[k]) || 0);
        const wb = Math.round(Number(body?.wasted?.[k]) || 0);
        if (rb < 0 || wb < 0) return c.json({ error: 'Check the counts' }, 400);
        if (rb + wb > (stock[k]?.left || 0)) return c.json({ error: `Only ${stock[k]?.left || 0} ${k} pieces are at the stall`, code: 'MORE_THAN_LEFT' }, 400);
        if (rb) { returned[k] = rb; back += rb; }
        if (wb) { wasted[k] = wb; lost += wb; }
      }
      if (!back && !lost) return c.json({ error: 'Enter the pieces going back or wasted' }, 400);
      const wasteReason = text(body.wasteReason, 40);
      if (lost && !wasteReason) return c.json({ error: 'Say why the momos were wasted' }, 400);
      if (back && !ev.productionHouseId) return c.json({ error: 'This event has no production house to send momos back to' }, 400);
      const date = isISODate(body.date) ? body.date : today;
      if (date > today) return c.json({ error: 'That day has not come yet' }, 400);
      const row = {
        id, eventId: ev.id, eventName: ev.name, productionHouseId: ev.productionHouseId || null, date,
        returned, wasted, wasteReason: lost ? wasteReason : null, note: text(body.note, 300),
        returnedPieces: back, wastedPieces: lost,
        // 'sent' until production counts the pieces back in; only wasted pieces need no one else.
        status: back ? 'sent' : 'wasted_only',
        createdBy: a.employeeId || a.userId, createdByName: a.name, createdAt: new Date().toISOString(),
      };
      await kv.set(key, row);
      if (back) {
        await deps.afterResponse('Momo return notifications', async () => {
          const all = (await kv.getByPrefix<any>('unified-employee:')) || [];
          const production = all.filter((p) => p.designation === 'production_incharge' && p.status !== 'inactive' &&
            (!(p.assignedProductionHouseIds || []).length || (p.assignedProductionHouseIds || []).includes(ev.productionHouseId)));
          await notifyPeople(production, 'event_momo_return', 'Momos coming back from an event',
            `${ev.name} is sending back ${back} momos. Count them in when they arrive.`, ev.id, date);
        });
      }
      return c.json({ momoReturn: row });
    } catch (err) { return fail(c, err, 'record the leftover momos'); }
  });

  // Production counts the returned momos in: they go back on the production house's stock.
  app.post(`${P}/events/:id/momo-returns/:returnId/receive`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const id = c.req.param('id');
    if (!id || !isEventId(id)) return c.json({ error: 'Event not found' }, 404);
    const ev = await kv.get<any>(`event:${id}`);
    if (!ev) return c.json({ error: 'Event not found' }, 404);
    try {
      const key = `event_momo_return:${ev.id}:${c.req.param('returnId')}`;
      const row = await kv.get<any>(key);
      if (!row) return c.json({ error: 'Not found' }, 404);
      if (!(canRunEventStock(a) || producesFor(a, row.productionHouseId))) return c.json({ error: 'Only the production house it went to can count it in' }, 403);
      if (row.status !== 'sent') return c.json({ error: 'This return has already been counted in' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const received: Record<string, number> = {};
      for (const k of EVENT_MOMO_KEYS) {
        const sent = Number(row.returned?.[k]) || 0;
        if (!sent) continue;
        const got = body?.received?.[k] === undefined ? sent : Math.round(Number(body.received[k]) || 0);
        if (got < 0 || got > sent) return c.json({ error: `Between 0 and ${sent} ${k} pieces` }, 400);
        received[k] = got;
      }
      const now = new Date().toISOString();
      const next = {
        ...row, status: 'received', receivedQuantities: received, receivedAt: now,
        receivedBy: a.employeeId || a.userId, receivedByName: a.name, receiveNote: text(body.note, 300),
      };
      await kv.set(key, next);
      // Back on the production house's own stock count (the same one a delivery takes them off).
      const houseKey = `production_house_${row.productionHouseId}`;
      const house = await kv.get<any>(houseKey);
      if (house) {
        const inventory = { ...(house.inventory || {}) };
        for (const [k, n] of Object.entries(received)) inventory[k] = (Number(inventory[k]) || 0) + n;
        await kv.set(houseKey, { ...house, inventory, updatedAt: now });
      }
      await deps.afterResponse('Momo return received notification', async () => {
        const byId = await employeesById();
        const short = Object.entries(row.returned || {}).reduce((s, [k, n]) => s + Math.max(0, Number(n) - (received[k] || 0)), 0);
        await notifyPeople([byId.get(ev.inchargeId)], 'event_momo_return_received', 'Production got the momos back',
          `${a.name} counted in the momos from ${ev.name}${short ? ` - ${short} short` : ', all correct'}.`, ev.id, row.date);
      });
      return c.json({ momoReturn: next });
    } catch (err) { return fail(c, err, 'count in the momos'); }
  });

  // Who is working today: assigned people, their check-in (shift clock) and photo checks.
  app.get(`${P}/events/:id/staff-today`, async (c: any) => {
    const r = await actorOf(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const e = await eventFor(c, a);
    if (e.error) return e.error;
    const ev = e.ev;
    const date = isISODate(c.req.query('date')) ? c.req.query('date') : deps.getTodayIST();
    try {
      const staffIds: string[] = ev.staffIds || [];
      const [people, punches, checks] = await Promise.all([
        kv.mget<any>(staffIds.map((id) => `unified-employee:${id}`)),
        kv.mget<any>(staffIds.map((id) => `punch:${id}:${date}`)),
        kv.mget<any>(staffIds.map((id) => `workplace-check:${date}:${id}`)),
      ]);
      const staff = staffIds.map((id, i) => {
        const p = punches?.[i];
        const w = checks?.[i];
        const atEvent = (ev2: any) => ev2?.placeKind === 'event' && ev2?.placeId === ev.id;
        return {
          employeeId: id, name: people?.[i]?.name || id, isIncharge: ev.inchargeId === id,
          checkIn: p?.in ? { at: p.in.at, verified: !!p.in.verified, atEvent: atEvent(p.in), distanceM: p.in.distanceM ?? null } : null,
          checkOut: p?.out ? { at: p.out.at, verified: !!p.out.verified } : null,
          pendingArrival: !!p?.pending?.arrival,
          photos: w ? { done: w.done || 0, required: w.required || 0 } : null,
        };
      });
      return c.json({ date, staff });
    } catch (err) { return fail(c, err, 'load today\'s staff'); }
  });
}
