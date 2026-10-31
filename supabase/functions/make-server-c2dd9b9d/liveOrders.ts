// Live orders from Ciferon (owner, 31 Oct 2026: "Build 1, 2 and 3"). The admin panel's Live Status
// page reads GET Api/OrderReport/GetLiveOrderDetail: Result.list[], each item's Data a JSON string
// holding one open order (OrderSerialNo, SaleOrderType, PurchaseDate, GrandTotal,
// OrderItemWrapperList, Customer). index.ts asks for it every 3 minutes while the store is open:
//   1. orders seen open that never became a sale, or became a smaller one (closeCheck, 11:55 PM)
//   2. an order open too long tells the store incharge (stuckToAlert)
//   3. the owner's Home shows what is open right now (nowView)
// The customer's name and number are never kept.

export type LiveItem = { name: string; qty: number; total: number };
export type LiveOrder = {
  key: string;
  orderId: string | null;
  serial: string | null;
  externalId: string | null;
  /** DineIn | TakeAway | HomeDelivery (Zomato and Swiggy too), as OrderReport/Sale's SaleOrderType */
  type: string;
  /** When it was placed, real time (ISO); null when Ciferon didn't say */
  placedAt: string | null;
  total: number;
  items: LiveItem[];
  table: string | null;
};
export type SeenOrder = LiveOrder & {
  firstSeen: string;
  lastSeen: string;
  /** The most it came to while open (items can come off before the bill) */
  maxTotal: number;
  /** The first check it wasn't in the list any more */
  goneAt: string | null;
  /** When the store incharge was told it was taking long */
  alertedAt: string | null;
};
export type LiveDay = {
  storeId: string;
  date: string;
  orders: Record<string, SeenOrder>;
  lastPoll: string | null;
  polls: number;
  /** The order fields Ciferon sent (names only), to see what's there */
  fields?: string[];
  error?: string | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const idOf = (v: unknown) => (v === undefined || v === null || v === '' || v === 0 || v === '0' ? null : String(v).trim() || null);
const same = (a: string | null | undefined, b: unknown) => !!a && idOf(b)?.toUpperCase() === a.toUpperCase();

/** A Ciferon time as real ISO time. Times without a zone are India wall-clock ("2026-10-31T21:05:12"). */
export function ciferonTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  const dotNet = /\/Date\((-?\d+)/.exec(s);
  if (dotNet) return new Date(Number(dotNet[1])).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(s);
  const t = Date.parse(hasZone ? s : `${s.replace(/\.\d+$/, '')}+05:30`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const istDate = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);

/** Ciferon's GetLiveOrderDetail answer as orders. */
export function parseLive(resp: any): { orders: LiveOrder[]; fields: string[] } {
  const list = Array.isArray(resp?.Result?.list) ? resp.Result.list : [];
  const orders: LiveOrder[] = [];
  const fields = new Set<string>();
  for (const row of list) {
    let d: any = row?.Data ?? row;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch { continue; }
    }
    if (!d || typeof d !== 'object') continue;
    Object.keys(d).forEach((k) => fields.add(k));
    const orderId = idOf(d.OrderId ?? d.OrderID);
    const serial = idOf(d.OrderSerialNo ?? d.SerialNo);
    const externalId = idOf(d.ExternalId ?? d.ExternalOrderId);
    const type = String(d.SaleOrderType || 'Unknown');
    const placedAt = ciferonTime(d.PurchaseDate ?? d.EntryDate ?? d.OrderDate);
    const total = num(d.GrandTotal);
    const items = (Array.isArray(d.OrderItemWrapperList) ? d.OrderItemWrapperList : [])
      .map((i: any) => ({ name: String(i?.ProductName || '').trim(), qty: num(i?.Quantity), total: num(i?.Total) }))
      .filter((i: LiveItem) => i.name);
    const table = idOf(d.TableName ?? d.Table?.TableName ?? d.Table?.Name ?? d.TableNo);
    const key = serial ? `sn:${serial}` : orderId ? `id:${orderId}` : externalId ? `ex:${externalId}` : `t:${placedAt || ''}:${type}`;
    orders.push({ key, orderId, serial, externalId, type, placedAt, total, items, table });
  }
  return { orders, fields: [...fields].sort() };
}

/** Adds one check's list to the day. An order that shares any number with one already seen is the
 *  same order, and so is one placed at the same moment as an order seen without any number (a
 *  dine-in table may get its numbers later); one missing from the list is gone. */
export function mergePoll(prev: LiveDay | null, at: { storeId: string; date: string }, live: LiveOrder[], nowIso: string, fields: string[] = []): LiveDay {
  const orders: Record<string, SeenOrder> = { ...(prev?.orders || {}) };
  const seenNow = new Set<string>();
  for (const o of live) {
    const existing = Object.values(orders).find((e) => e.key === o.key
      || same(o.serial, e.serial) || same(o.orderId, e.orderId) || same(o.externalId, e.externalId)
      || (!e.serial && !e.orderId && !e.externalId && !!e.placedAt && e.placedAt === o.placedAt && e.type === o.type));
    if (existing) {
      orders[existing.key] = {
        ...existing, ...o, key: existing.key,
        orderId: o.orderId || existing.orderId, serial: o.serial || existing.serial, externalId: o.externalId || existing.externalId,
        placedAt: o.placedAt || existing.placedAt, table: o.table || existing.table,
        lastSeen: nowIso, maxTotal: Math.max(existing.maxTotal, o.total), goneAt: null,
      };
      seenNow.add(existing.key);
    } else {
      orders[o.key] = { ...o, firstSeen: nowIso, lastSeen: nowIso, maxTotal: o.total, goneAt: null, alertedAt: null };
      seenNow.add(o.key);
    }
  }
  for (const k of Object.keys(orders)) {
    if (!seenNow.has(k) && !orders[k].goneAt) orders[k] = { ...orders[k], goneAt: nowIso };
  }
  return { storeId: at.storeId, date: at.date, orders, lastPoll: nowIso, polls: (prev?.polls || 0) + 1, fields: fields.length ? fields : prev?.fields, error: null };
}

/** Minutes it has been open: from when it was placed, or first seen when Ciferon gave no time. */
export function ageMin(o: SeenOrder, nowMs: number): number {
  const placed = o.placedAt ? Date.parse(o.placedAt) : NaN;
  const start = !Number.isNaN(placed) && placed <= nowMs + 5 * 60000 ? Math.min(placed, Date.parse(o.firstSeen)) : Date.parse(o.firstSeen);
  return Math.max(0, Math.floor((nowMs - start) / 60000));
}

/** Opened on an earlier day and never closed in Ciferon. */
export const isOld = (o: SeenOrder, date: string) => !!o.placedAt && istDate(o.placedAt) < date;

// How long before an open order counts as stuck (owner, 31 Oct 2026: online 20-25 minutes, a table
// about 45). A counter takeaway should be in the bag well within 20.
export const STUCK_MIN: Record<string, number> = { HomeDelivery: 25, TakeAway: 20, DineIn: 45 };
export const STUCK_OTHER_MIN = 30;
/** At most this many stuck-order alerts a store a night: past it they only show on the owner's Home. */
export const MAX_ALERTS_A_NIGHT = 8;
export const stuckLimit = (type: string) => STUCK_MIN[type] ?? STUCK_OTHER_MIN;
export const isStuck = (o: SeenOrder, nowMs: number) => !o.goneAt && ageMin(o, nowMs) >= stuckLimit(o.type);

/** Open orders past their limit that nobody was told about yet, longest first. Orders left open
 *  from an earlier day aren't pushed (the closing check lists them). */
export function stuckToAlert(day: LiveDay, nowMs: number): SeenOrder[] {
  const all = Object.values(day.orders);
  const room = Math.max(0, MAX_ALERTS_A_NIGHT - all.filter((o) => o.alertedAt).length);
  return all
    .filter((o) => !o.alertedAt && isStuck(o, nowMs) && !isOld(o, day.date))
    .sort((a, b) => ageMin(b, nowMs) - ageMin(a, nowMs))
    .slice(0, room);
}

const typeWords: Record<string, string> = { HomeDelivery: 'Online', TakeAway: 'Takeaway', DineIn: 'Dine-in' };
export const typeWord = (type: string) => typeWords[type] || type;
/** "2 Chicken Momos, 1 Coke +2 more" */
export function itemsLine(items: LiveItem[], max = 3): string {
  const shown = items.slice(0, max).map((i) => `${i.qty || 1} ${i.name}`).join(', ');
  return items.length > max ? `${shown} +${items.length - max} more` : shown;
}

// ---- The closing check ----
/** A billed order from OrderReport/Sale (index.ts fetches the day's list at closing). That list only
 *  has orders that weren't cancelled. */
export type FinalOrder = { orderId?: string | number | null; serialNo?: string | null; externalId?: string | null; grandTotal: number; orderType?: string | null; entryDate?: string | null };
export type FindingKind = 'not_billed' | 'billed_less' | 'open_at_close';
export type CloseFinding = {
  kind: FindingKind;
  key: string; type: string; serial: string | null; table: string | null;
  placedAt: string | null; firstSeen: string; lastSeen: string;
  /** The most it came to while open */
  total: number;
  /** What it was billed for (billed_less) */
  billed?: number;
  items: LiveItem[];
};
export type CloseCheck = { storeId: string; date: string; at: string; seen: number; matched: number; findings: CloseFinding[]; finals: number };

const finding = (kind: FindingKind, o: SeenOrder, billed?: number): CloseFinding => ({
  kind, key: o.key, type: o.type, serial: o.serial, table: o.table, placedAt: o.placedAt, firstSeen: o.firstSeen, lastSeen: o.lastSeen,
  total: o.maxTotal, items: o.items, ...(billed !== undefined ? { billed } : {}),
});

/** Every order seen open today against the day's bills: still open, never billed (or cancelled after
 *  the KOT), or billed for less than it came to. A bill is matched by a shared number first, else by
 *  the same kind and amount billed within 3 hours. Online orders aren't checked for "less": Zomato
 *  and Swiggy discounts change the total. */
export function closeCheck(day: LiveDay, finals: FinalOrder[], nowIso: string): CloseCheck {
  const used = new Set<number>();
  const findings: CloseFinding[] = [];
  let matched = 0;
  const orders = Object.values(day.orders).filter((o) => o.maxTotal > 0 || o.items.length).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  for (const o of orders) {
    if (!o.goneAt) { findings.push(finding('open_at_close', o)); continue; }
    let idx = finals.findIndex((f, i) => !used.has(i) && (same(o.orderId, f.orderId) || same(o.serial, f.serialNo) || same(o.externalId, f.externalId)));
    if (idx < 0) {
      const from = Date.parse(o.placedAt || o.firstSeen) - 15 * 60000;
      const to = Date.parse(o.goneAt) + 3 * 3600000;
      idx = finals.findIndex((f, i) => {
        if (used.has(i)) return false;
        if (f.orderType && o.type !== 'Unknown' && f.orderType !== o.type) return false;
        const billed = num(f.grandTotal);
        if (Math.abs(billed - o.maxTotal) > 1 && Math.abs(billed - o.total) > 1) return false;
        const t = Date.parse(ciferonTime(f.entryDate) || '');
        return Number.isNaN(t) || (t >= from && t <= to);
      });
    }
    if (idx < 0) { findings.push(finding('not_billed', o)); continue; }
    used.add(idx);
    matched++;
    const billed = num(finals[idx].grandTotal);
    if (o.type !== 'HomeDelivery' && billed + 1 < o.maxTotal) findings.push(finding('billed_less', o, billed));
  }
  return { storeId: day.storeId, date: day.date, at: nowIso, seen: orders.length, matched, findings, finals: finals.length };
}

export function checkSummary(findings: CloseFinding[]) {
  const of = (k: FindingKind) => findings.filter((f) => f.kind === k);
  const sum = (xs: CloseFinding[], fn: (f: CloseFinding) => number) => Math.round(xs.reduce((s, f) => s + fn(f), 0));
  const notBilled = of('not_billed'), less = of('billed_less'), open = of('open_at_close');
  return {
    notBilled: notBilled.length, notBilledTotal: sum(notBilled, (f) => f.total),
    billedLess: less.length, lessBy: sum(less, (f) => f.total - (f.billed || 0)),
    openAtClose: open.length, openTotal: sum(open, (f) => f.total),
  };
}

// ---- The owner's Home ----
export type NowOrder = { key: string; type: string; serial: string | null; table: string | null; placedAt: string | null; ageMin: number; total: number; items: LiveItem[]; stuck: boolean; old: boolean };
export function nowView(day: LiveDay | null, nowMs: number): { open: number; openTotal: number; stuck: number; orders: NowOrder[]; lastPoll: string | null } {
  const open = Object.values(day?.orders || {}).filter((o) => !o.goneAt);
  const orders = open
    .map((o) => ({ key: o.key, type: o.type, serial: o.serial, table: o.table, placedAt: o.placedAt, ageMin: ageMin(o, nowMs), total: o.total, items: o.items, stuck: isStuck(o, nowMs), old: isOld(o, day!.date) }))
    .sort((a, b) => b.ageMin - a.ageMin);
  return { open: orders.length, openTotal: Math.round(orders.reduce((s, o) => s + o.total, 0)), stuck: orders.filter((o) => o.stuck).length, orders, lastPoll: day?.lastPoll || null };
}
