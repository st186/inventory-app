// Event stalls (owner, 27 Oct 2026): the rules for an event - its status, who may do what, the
// stall's own cash and digital account, and its profit and loss. One copy serves the app
// (src/utils/eventRules.ts) and the server (events.ts), so the event page and the summary the
// server hands Insights can never disagree.
//
// Mirrored byte-for-byte at src/utils/eventRules.ts (the edge function can't import from src/):
// keep both copies identical. No imports, so the file runs unchanged in the browser, in Deno and
// under plain node (the tests).
//
// An event is a temporary location of its own (`event:{id}`), not a store: store pickers, store
// stock and store forecasts never see it unless a screen asks for events on purpose.

type Row = Record<string, any>;

// ── Momo types (the short finished-product keys stock requests use, see utils/requestStock.ts) ──

export const EVENT_MOMO_KEYS = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'] as const;
export type EventMomoKey = typeof EVENT_MOMO_KEYS[number];
export const EVENT_MOMO_LABELS: Record<EventMomoKey, { en: string; bn: string }> = {
  chicken: { en: 'Chicken', bn: 'চিকেন' },
  chickenCheese: { en: 'Chicken cheese', bn: 'চিকেন চিজ' },
  veg: { en: 'Veg', bn: 'ভেজ' },
  cheeseCorn: { en: 'Corn cheese', bn: 'কর্ন চিজ' },
  paneer: { en: 'Paneer', bn: 'পনির' },
  vegKurkure: { en: 'Veg kurkure', bn: 'ভেজ কুড়কুড়ে' },
  chickenKurkure: { en: 'Chicken kurkure', bn: 'চিকেন কুড়কুড়ে' },
};
// Older requests used the long production keys.
const LONG_KEY: Record<string, string> = {
  chicken: 'chickenMomos', chickenCheese: 'chickenCheeseMomos', veg: 'vegMomos', cheeseCorn: 'cheeseCornMomos',
  paneer: 'paneerMomos', vegKurkure: 'vegKurkureMomos', chickenKurkure: 'chickenKurkureMomos',
};
export const DEFAULT_PIECES_PER_PLATE = 6;

// Requests whose momos have left the production house (in transit and part shipments count).
export const EVENT_SENT_STATUSES = ['shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
export const EVENT_RECEIVED_STATUSES = ['delivered', 'partially-delivered'];

export function requestPieces(req: Row, key: string): number {
  return Math.max(0, Number(req?.[key] ?? req?.[LONG_KEY[key] || `${key}Momos`]) || 0);
}
// What actually went out: the shipped count once shipped, else what was asked for.
export function shippedRequestPieces(req: Row, key: string): number {
  const shipped = req?.shippedQuantities?.[key];
  return shipped !== undefined && shipped !== null ? Math.max(0, Number(shipped) || 0) : requestPieces(req, key);
}
// What the event counted in (the receipt), else what was shipped.
export function receivedRequestPieces(req: Row, key: string): number {
  const line = req?.receipt?.lines?.[key];
  if (line && typeof line.received === 'number') return Math.max(0, line.received - (Number(line.damaged) || 0));
  return shippedRequestPieces(req, key);
}

// ── Dates (YYYY-MM-DD strings, IST calendar days) ──

const DAY_MS = 86_400_000;
export function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || from > to) return out;
  for (let d = from; d <= to && out.length < 400; d = addDaysISO(d, 1)) out.push(d);
  return out;
}
export const isISODate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// A stored UTC timestamp as its IST calendar day.
export function istDayOf(ts: unknown): string | null {
  if (typeof ts !== 'string' || !ts) return null;
  if (isISODate(ts)) return ts;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}

// ── The event itself ──

export type EventStatus = 'planned' | 'live' | 'ended' | 'closed';

// planned before the first day, live on the event days, ended after the last day until the
// cluster head closes it (the day closes and returns still need finishing), closed after.
export function eventStatus(ev: Row, today: string): EventStatus {
  if (ev?.closedAt || ev?.status === 'closed') return 'closed';
  if (today < ev.startDate) return 'planned';
  if (today > ev.endDate) return 'ended';
  return 'live';
}
export const eventDays = (ev: Row): string[] => datesBetween(ev.startDate, ev.endDate);

// Staff may enter figures from the day before the stall opens (setting up) to the day after the
// last day (wrapping up), and only while the event isn't closed.
export const STAFF_WINDOW_BEFORE_DAYS = 1;
export const STAFF_WINDOW_AFTER_DAYS = 1;
export function inStaffWindow(ev: Row, today: string): boolean {
  return eventStatus(ev, today) !== 'closed' &&
    today >= addDaysISO(ev.startDate, -STAFF_WINDOW_BEFORE_DAYS) && today <= addDaysISO(ev.endDate, STAFF_WINDOW_AFTER_DAYS);
}

// Where the stall's digital (UPI) collections go. A new event defaults to its own separate
// account (the owner plans a PhonePe one); while that account has no name yet it falls back to
// the parent store's Paytm, which it then rolls into (owner, 27 Oct 2026).
export type DigitalAccount = { mode: 'separate' | 'store_paytm'; name: string };
export function digitalAccountOf(ev: Row): DigitalAccount {
  const name = typeof ev?.digital?.name === 'string' ? ev.digital.name.trim() : '';
  if (ev?.digital?.mode === 'separate' && name) return { mode: 'separate', name };
  return { mode: 'store_paytm', name: 'Paytm' };
}

// ── Who may do what ──

export type EventActor = {
  role?: string | null;        // cluster_head | manager | audit | employee | rider
  designation?: string | null; // store_incharge | production_incharge | operations_incharge | ...
  employeeId?: string | null;
};
const INCHARGE_DESIGNATIONS = ['store_incharge', 'production_incharge'];
export const isOwner = (a: EventActor) => a?.role === 'cluster_head';
// Operations managers: managers who aren't a store or production incharge.
export const isOpsManager = (a: EventActor) => a?.role === 'manager' && !INCHARGE_DESIGNATIONS.includes(String(a?.designation || ''));
export const isAssigned = (ev: Row, employeeId?: string | null) =>
  !!employeeId && (ev?.inchargeId === employeeId || (Array.isArray(ev?.staffIds) && ev.staffIds.includes(employeeId)));
export const isEventIncharge = (ev: Row, employeeId?: string | null) => !!employeeId && ev?.inchargeId === employeeId;

// The cluster head creates, edits, closes and staffs events.
export const canManageEvent = (a: EventActor) => isOwner(a);
// The cluster head and operations managers run event stock, expenses and cash top-up approvals.
export const canRunEventStock = (a: EventActor) => isOwner(a) || isOpsManager(a);
// Seeing an event at all: the owner, operations managers and audit see every event; anyone
// else only events they are assigned to. Plain staff who aren't assigned see nothing.
export const canSeeEvent = (a: EventActor, ev: Row) =>
  isOwner(a) || isOpsManager(a) || a?.role === 'audit' || isAssigned(ev, a?.employeeId);
// Entering the day's sales, expenses and stock receipts: managers while the event is open;
// the assigned people (incharge and staff) during the event window.
export function canEnterForEvent(a: EventActor, ev: Row, today: string): boolean {
  if (eventStatus(ev, today) === 'closed') return false;
  if (canRunEventStock(a)) return true;
  return isAssigned(ev, a?.employeeId) && inStaffWindow(ev, today);
}
// Submitting the day close: the event incharge (in the window) or a manager.
export function canSubmitEventDay(a: EventActor, ev: Row, today: string): boolean {
  if (eventStatus(ev, today) === 'closed') return false;
  if (canRunEventStock(a)) return true;
  return isEventIncharge(ev, a?.employeeId) && inStaffWindow(ev, today);
}

// ── A day's sales ──

export type DaySales = {
  cash: number; digital: number; online: number; total: number;
  source: 'typed' | 'pos' | 'none';
  plates: Partial<Record<EventMomoKey, number>>;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

// The incharge's typed figures win once saved, as on the store (their own cash/digital split is
// the ground truth - the POS is often mis-keyed at a rush); before that, the stall's Ciferon
// outlet figures when it has one.
export function daySales(day: Row | null | undefined): DaySales {
  const typed = day?.manual;
  if (typed && (typed.cash != null || typed.digital != null)) {
    const cash = num(typed.cash);
    const digital = num(typed.digital);
    const online = num(typed.online);
    return { cash, digital, online, total: cash + digital + online, source: 'typed', plates: typed.plates || day?.pos?.plates || {} };
  }
  const pos = day?.pos;
  if (pos && pos.ok !== false && (pos.cash != null || pos.digital != null)) {
    const cash = num(pos.cash);
    const digital = num(pos.digital);
    const online = num(pos.online);
    return { cash, digital, online, total: cash + digital + online, source: 'pos', plates: pos.plates || {} };
  }
  return { cash: 0, digital: 0, online: 0, total: 0, source: 'none', plates: {} };
}

// ── Rent ──

// Rent is a total for the event or so much a day. The P&L counts the agreed rent day by day (a
// total spread evenly over the event days), all of it by the last day; rent payments are logged
// as expenses only to move cash, and count as the rent themselves only when no agreed rent was
// entered.
export function agreedRent(ev: Row, throughDate: string): number {
  const amount = Math.max(0, num(ev?.rent?.amount));
  if (!amount) return 0;
  const all = eventDays(ev);
  const days = all.filter((d) => d <= throughDate);
  if (!days.length) return 0;
  return ev?.rent?.mode === 'per_day' ? amount * days.length : round2((amount * days.length) / all.length);
}
export function rentForDay(ev: Row, date: string): number {
  const amount = Math.max(0, num(ev?.rent?.amount));
  const days = eventDays(ev);
  if (!amount || !days.includes(date)) return 0;
  return ev?.rent?.mode === 'per_day' ? amount : amount / days.length;
}

// ── Money: the stall's cash in hand and its digital account ──

export type EventMoneyInput = {
  event: Row;
  days: Row[];       // event_day rows
  expenses: Row[];   // event_expense rows
  moves: Row[];      // event_money rows: { account: 'cash'|'digital', direction: 'in'|'out', amount, date, counterparty }
  topups: Row[];     // cash-topup rows for this event (reason 'event_cash')
};

const live = (r: Row) => !r?.voided;
// An approved cash top-up for this event adds to its cash on the request's date.
export const eventTopupCounts = (t: Row) => t?.reason === 'event_cash' && t?.status === 'approved';

export type CashLine = { date: string; label: string; amount: number; kind: string; ref?: string };

// Every movement of the stall's cash, oldest first (sign: + in, - out).
export function eventCashLines(input: EventMoneyInput): CashLine[] {
  const lines: CashLine[] = [];
  for (const d of input.days || []) {
    const s = daySales(d);
    if (s.cash) lines.push({ date: d.date, label: 'Cash sales', amount: s.cash, kind: 'sales' });
  }
  for (const t of (input.topups || []).filter(eventTopupCounts)) {
    lines.push({ date: t.date, label: t.fundingSource === 'production_cash' ? 'Cash top-up (from production cash)' : 'Cash top-up (from store Paytm)', amount: num(t.requestedAmount), kind: 'topup', ref: t.id });
  }
  for (const m of (input.moves || []).filter((m) => live(m) && m.account === 'cash')) {
    const who = m.counterparty === 'store' ? 'store' : m.counterparty === 'owner' ? 'owner' : String(m.counterparty || 'other');
    lines.push({ date: m.date, label: m.direction === 'in' ? `Cash from ${who}` : `Cash handed to ${who}`, amount: m.direction === 'in' ? num(m.amount) : -num(m.amount), kind: m.direction === 'in' ? 'float' : 'handover', ref: m.id });
  }
  for (const e of (input.expenses || []).filter((e) => live(e) && e.paidFrom === 'event_cash')) {
    lines.push({ date: e.date, label: e.description || e.category || 'Expense', amount: -num(e.amount), kind: 'expense', ref: e.id });
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

// The cash the stall should hold at the end of `date`: the last physical count before that day
// (the day close's counted cash) plus everything since; with no count, everything from zero.
export function expectedEventCash(input: EventMoneyInput, date: string): { expected: number; opening: number; openingFrom: string | null; movements: CashLine[] } {
  const counted = (input.days || [])
    .filter((d) => d.date < date && typeof d.cashCounted === 'number')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const after = counted ? counted.date : '';
  const opening = counted ? counted.cashCounted : 0;
  const all = eventCashLines(input);
  const before = all.filter((l) => l.date > after && l.date < date).reduce((s, l) => s + l.amount, 0);
  const movements = all.filter((l) => l.date === date);
  const expected = opening + before + movements.reduce((s, l) => s + l.amount, 0);
  return { expected: round2(expected), opening: round2(opening + before), openingFrom: counted ? counted.date : null, movements };
}

// The cash in hand right now: the latest count plus everything after it.
export function eventCashInHand(input: EventMoneyInput, today: string): number {
  return expectedEventCash(input, addDaysISO(today, 1)).opening;
}

// The separate digital account (PhonePe etc.): collections in, spends and transfers out. Empty
// when the stall uses the store's Paytm - those collections are in the store's ledger instead.
export function eventDigitalLines(input: EventMoneyInput): CashLine[] {
  if (digitalAccountOf(input.event).mode !== 'separate') return [];
  const lines: CashLine[] = [];
  for (const d of input.days || []) {
    const s = daySales(d);
    if (s.digital) lines.push({ date: d.date, label: 'Collections', amount: s.digital, kind: 'sales' });
  }
  for (const m of (input.moves || []).filter((m) => live(m) && m.account === 'digital')) {
    lines.push({ date: m.date, label: m.direction === 'in' ? 'Money in' : `Transferred to ${m.counterparty || 'other'}`, amount: m.direction === 'in' ? num(m.amount) : -num(m.amount), kind: m.direction === 'in' ? 'in' : 'transfer', ref: m.id });
  }
  for (const e of (input.expenses || []).filter((e) => live(e) && e.paidFrom === 'event_digital')) {
    lines.push({ date: e.date, label: e.description || e.category || 'Expense', amount: -num(e.amount), kind: 'expense', ref: e.id });
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}
export function eventDigitalBalance(input: EventMoneyInput, throughDate: string): number {
  return round2(eventDigitalLines(input).filter((l) => l.date <= throughDate).reduce((s, l) => s + l.amount, 0));
}

// The stall's digital collections that land in the parent store's Paytm (store_paytm mode), per
// store and day. GET /sales puts each day's total on the store's own row as eventPaytmIn, which
// paytmRules.ts counts like the store's own Paytm takings.
export function storePaytmRollup(events: Row[], days: Row[]): Map<string, number> {
  const byEvent = new Map((events || []).map((e) => [e.id, e]));
  const out = new Map<string, number>();
  for (const d of days || []) {
    const ev = byEvent.get(d.eventId);
    if (!ev || !ev.parentStoreId || digitalAccountOf(ev).mode !== 'store_paytm') continue;
    const amount = daySales(d).digital;
    if (!amount) continue;
    const key = `${ev.parentStoreId}|${d.date}`;
    out.set(key, round2((out.get(key) || 0) + amount));
  }
  return out;
}

// Cash moved between an event and its parent store's till, per store and day ({in: handed to
// the store, out: given from the store}). Put on the store's row as eventCashIn / eventCashOut.
export function storeCashMoves(events: Row[], moves: Row[]): Map<string, { in: number; out: number }> {
  const byEvent = new Map((events || []).map((e) => [e.id, e]));
  const out = new Map<string, { in: number; out: number }>();
  for (const m of (moves || []).filter((m) => live(m) && m.account === 'cash' && m.counterparty === 'store')) {
    const ev = byEvent.get(m.eventId);
    if (!ev?.parentStoreId) continue;
    const key = `${ev.parentStoreId}|${m.date}`;
    const cur = out.get(key) || { in: 0, out: 0 };
    if (m.direction === 'out') cur.in += num(m.amount); // the event hands cash to the store
    else cur.out += num(m.amount);                     // the store gives the event a float
    out.set(key, cur);
  }
  return out;
}

// ── Profit and loss ──

export type EventCostSettings = {
  momoCostPerPiece?: Partial<Record<EventMomoKey, number>>; // production cost of one piece
  onlineCommissionPct?: number;                             // only if the stall sells online
};

export type EventPnlInput = EventMoneyInput & {
  requests: Row[];   // production requests for this event
  transfers: Row[];  // event_transfer rows (items moved from / back to the store)
  settings: EventCostSettings;
  today: string;
  from?: string;     // optional window (the business summary)
  to?: string;
};

export type EventPnlDay = {
  date: string; sales: number; cash: number; digital: number; online: number; source: DaySales['source'];
  momoCost: number; itemsCost: number; expenses: number; rent: number; commission: number; costs: number; profit: number; cumulativeProfit: number;
};
export type EventPnl = {
  eventId: string;
  sales: number; cash: number; digital: number; online: number;
  momoCost: number; momoPieces: number; itemsCost: number; expenses: number; rent: number; rentPaid: number; commission: number;
  costs: number; profit: number; marginPct: number | null;
  expensesByCategory: Record<string, number>;
  momoByType: Partial<Record<EventMomoKey, { pieces: number; cost: number }>>;
  days: EventPnlDay[];
  warnings: string[];
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
// A request's momos count on the day they reached the stall (else the day they left production).
const requestDay = (r: Row) => istDayOf(r.deliveredAt) || istDayOf(r.shippedAt) || istDayOf(r.requestDate);

export function computeEventPnl(input: EventPnlInput): EventPnl {
  const ev = input.event;
  const allDays = eventDays(ev);
  const first = allDays[0];
  const last = allDays[allDays.length - 1];
  // Costs dated outside the event (set-up purchases, late returns) land on its first/last day.
  const clamp = (d: string | null | undefined) => (!d ? first : d < first ? first : d > last ? last : d);
  const inWindow = (d: string) => (!input.from || d >= input.from) && (!input.to || d <= input.to);
  const status = eventStatus(ev, input.today);
  const through = status === 'closed' ? last : (input.today < last ? input.today : last);
  const cost = input.settings?.momoCostPerPiece || {};
  const commissionPct = Math.max(0, num(input.settings?.onlineCommissionPct));
  const warnings: string[] = [];

  const rows = new Map<string, EventPnlDay>(allDays.map((d) => [d, {
    date: d, sales: 0, cash: 0, digital: 0, online: 0, source: 'none' as DaySales['source'],
    momoCost: 0, itemsCost: 0, expenses: 0, rent: 0, commission: 0, costs: 0, profit: 0, cumulativeProfit: 0,
  }]));

  for (const d of input.days || []) {
    const row = rows.get(d.date);
    if (!row) continue;
    const s = daySales(d);
    row.cash = s.cash; row.digital = s.digital; row.online = s.online; row.sales = s.total; row.source = s.source;
    row.commission = round2(s.online * commissionPct / 100);
  }

  const momoByType: EventPnl['momoByType'] = {};
  let momoPieces = 0;
  const missingCost = new Set<string>();
  for (const r of (input.requests || []).filter((r) => EVENT_SENT_STATUSES.includes(r.status))) {
    const row = rows.get(clamp(requestDay(r)));
    for (const key of EVENT_MOMO_KEYS) {
      const pieces = shippedRequestPieces(r, key);
      if (!pieces) continue;
      const unit = num(cost[key]);
      if (!unit) missingCost.add(EVENT_MOMO_LABELS[key].en);
      momoPieces += pieces;
      const m = momoByType[key] || { pieces: 0, cost: 0 };
      m.pieces += pieces; m.cost = round2(m.cost + pieces * unit);
      momoByType[key] = m;
      if (row) row.momoCost = round2(row.momoCost + pieces * unit);
    }
  }
  if (missingCost.size) warnings.push(`Momo cost per piece isn't set for ${[...missingCost].join(', ')} - those momos are counted at ₹0.`);

  for (const t of (input.transfers || []).filter(live)) {
    const row = rows.get(clamp(t.date));
    const value = num(t.totalCost) * (t.direction === 'to_store' ? -1 : 1);
    if (row) row.itemsCost = round2(row.itemsCost + value);
  }

  const expensesByCategory: Record<string, number> = {};
  let rentPaid = 0;
  for (const e of (input.expenses || []).filter(live)) {
    if (e.category === 'rent') { rentPaid += num(e.amount); continue; }
    expensesByCategory[e.category || 'other'] = round2((expensesByCategory[e.category || 'other'] || 0) + num(e.amount));
    const row = rows.get(clamp(e.date));
    if (row) row.expenses = round2(row.expenses + num(e.amount));
  }

  // Agreed rent, a day's share for each event day so far (a total rent spread evenly over the
  // event days), so "profit so far" isn't sunk by the whole rent on day one; by the last day or at
  // closing it is all counted. With no agreed rent, the rent payments count instead.
  const agreed = Math.max(0, num(ev?.rent?.amount));
  if (agreed) {
    const share = ev?.rent?.mode === 'per_day' ? agreed : agreed / allDays.length;
    for (const d of allDays) rows.get(d)!.rent = d <= through ? round2(share) : 0;
    // Rounding: the days of a total rent add up to the total exactly once all are counted.
    if (ev?.rent?.mode !== 'per_day' && through >= last) {
      const spread = allDays.reduce((s, d) => s + rows.get(d)!.rent, 0);
      rows.get(last)!.rent = round2(rows.get(last)!.rent + (agreed - spread));
    }
  } else {
    for (const e of (input.expenses || []).filter((e) => live(e) && e.category === 'rent')) {
      const row = rows.get(clamp(e.date));
      if (row) row.rent = round2(row.rent + num(e.amount));
    }
  }

  let cumulative = 0;
  const days: EventPnlDay[] = [];
  for (const d of allDays) {
    const row = rows.get(d)!;
    row.costs = round2(row.momoCost + row.itemsCost + row.expenses + row.rent + row.commission);
    row.profit = round2(row.sales - row.costs);
    if (!inWindow(d)) continue;
    cumulative = round2(cumulative + row.profit);
    row.cumulativeProfit = cumulative;
    days.push(row);
  }

  const sum = (k: keyof EventPnlDay) => round2(days.reduce((s, r) => s + (r[k] as number), 0));
  const sales = sum('sales');
  const costs = sum('costs');
  const profit = round2(sales - costs);

  const pastWithoutSales = allDays.filter((d) => d < input.today && d <= through && rows.get(d)!.source === 'none');
  if (status !== 'planned' && pastWithoutSales.length) warnings.push(`No sales entered for ${pastWithoutSales.length} day${pastWithoutSales.length === 1 ? '' : 's'}.`);

  return {
    eventId: ev.id,
    sales, cash: sum('cash'), digital: sum('digital'), online: sum('online'),
    momoCost: sum('momoCost'), momoPieces, itemsCost: sum('itemsCost'), expenses: sum('expenses'), rent: sum('rent'), rentPaid: round2(rentPaid),
    commission: sum('commission'), costs, profit, marginPct: sales > 0 ? Math.round((profit / sales) * 1000) / 10 : null,
    expensesByCategory, momoByType, days, warnings,
  };
}

// Business totals across events for a window (GET /events/summary): Insights shows Events next
// to Store and Production, and the "All" totals add these in.
export type EventSummary = {
  from: string | null; to: string | null;
  sales: number; costs: number; profit: number;
  momoCost: number; itemsCost: number; expenses: number; rent: number; commission: number;
  events: { id: string; name: string; status: EventStatus; startDate: string; endDate: string; sales: number; costs: number; profit: number }[];
  byDate: { date: string; sales: number; costs: number; profit: number }[];
};
export function summarizeEvents(items: { event: Row; pnl: EventPnl; status: EventStatus }[], from?: string, to?: string): EventSummary {
  const byDate = new Map<string, { date: string; sales: number; costs: number; profit: number }>();
  const tot = { sales: 0, costs: 0, profit: 0, momoCost: 0, itemsCost: 0, expenses: 0, rent: 0, commission: 0 };
  const events: EventSummary['events'] = [];
  for (const { event, pnl, status } of items) {
    if (!pnl.days.length) continue;
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] = round2(tot[k] + (pnl as any)[k]);
    for (const d of pnl.days) {
      const cur = byDate.get(d.date) || { date: d.date, sales: 0, costs: 0, profit: 0 };
      cur.sales = round2(cur.sales + d.sales); cur.costs = round2(cur.costs + d.costs); cur.profit = round2(cur.profit + d.profit);
      byDate.set(d.date, cur);
    }
    events.push({ id: event.id, name: event.name, status, startDate: event.startDate, endDate: event.endDate, sales: pnl.sales, costs: pnl.costs, profit: pnl.profit });
  }
  return {
    from: from || null, to: to || null, ...tot, events,
    byDate: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ── Stock at the stall ──

// Momos at the stall: counted in from production, less plates sold (pieces a plate from the
// plate config), less what was written off. Never below zero.
export function eventMomoStock(requests: Row[], days: Row[], piecesPerPlate: Partial<Record<EventMomoKey, number>>, wastage: Row[] = []): Record<EventMomoKey, { received: number; inTransit: number; sold: number; wasted: number; left: number }> {
  const out = {} as Record<EventMomoKey, { received: number; inTransit: number; sold: number; wasted: number; left: number }>;
  for (const key of EVENT_MOMO_KEYS) {
    const received = (requests || []).filter((r) => EVENT_RECEIVED_STATUSES.includes(r.status)).reduce((s, r) => s + receivedRequestPieces(r, key), 0);
    const inTransit = (requests || []).filter((r) => r.status === 'shipped' || r.status === 'partially-shipped').reduce((s, r) => s + shippedRequestPieces(r, key), 0);
    const per = num(piecesPerPlate?.[key]) || DEFAULT_PIECES_PER_PLATE;
    const sold = (days || []).reduce((s, d) => s + num(daySales(d).plates?.[key]) * per, 0);
    const wasted = (wastage || []).filter(live).reduce((s, w) => s + num(w?.pieces?.[key]), 0);
    out[key] = { received, inTransit, sold, wasted, left: Math.max(0, received - sold - wasted) };
  }
  return out;
}

// Items moved from the store (and back), net per item name.
export function eventItemsOnHand(transfers: Row[]): { itemName: string; unit: string; quantity: number; value: number }[] {
  const byName = new Map<string, { itemName: string; unit: string; quantity: number; value: number }>();
  for (const t of (transfers || []).filter(live)) {
    const sign = t.direction === 'to_store' ? -1 : 1;
    for (const it of t.items || []) {
      const key = String(it.itemName || '').trim().toLowerCase();
      if (!key) continue;
      const cur = byName.get(key) || { itemName: String(it.itemName).trim(), unit: it.unit || '', quantity: 0, value: 0 };
      cur.quantity = round2(cur.quantity + sign * num(it.quantity));
      cur.value = round2(cur.value + sign * num(it.totalCost));
      byName.set(key, cur);
    }
  }
  return [...byName.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

// Assets still at the event (checked out, not fully returned).
export function assetsStillOut(checkouts: Row[]): Row[] {
  return (checkouts || []).filter((a) => live(a) && num(a.quantity) - num(a.returnedQty) > 0);
}
