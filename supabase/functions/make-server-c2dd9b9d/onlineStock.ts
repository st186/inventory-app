// Items switched off on Zomato and Swiggy (owner, 1 Nov 2026: "can we detect this on a regular
// basis" - 40 items were off; Chicken Chilli Momos had been switched off at 7:02 PM the evening
// before and never back on). Ciferon's Item Stock Status (GET Api/ZomatoApi/StockStatus:
// Result.StockStatus[].ProductStockStatus[] with ProductId, ProductName, InStock) against what the
// store sold (order-item-detail, Step D of the POS sync): an item that is off online but sold online
// in the last 30 days, or at the counter in the last 14, is flagged - unless the owner keeps it off
// on purpose. Old items nobody sells any more are only counted. index.ts runs it at 4 PM.
import { ciferonTime } from './liveOrders.ts';

export type StockItem = { productId: string; name: string; category: string; inStock: boolean };
export type SoldStats = { lastOnline: string | null; lastCounter: string | null; online30: number; counter14: number };
export type OffItem = {
  productId: string; name: string; category: string;
  lastOnline: string | null; lastCounter: string | null;
  /** When it was last switched off and by whom (Ciferon's item log); null when the log said nothing */
  offSince?: string | null; offBy?: string | null; platforms?: string[];
};
export const ONLINE_DAYS = 30;
export const COUNTER_DAYS = 14;

export function parseStockStatus(resp: any): StockItem[] {
  const groups = Array.isArray(resp?.Result?.StockStatus) ? resp.Result.StockStatus : [];
  const items: StockItem[] = [];
  for (const g of groups) {
    for (const p of Array.isArray(g?.ProductStockStatus) ? g.ProductStockStatus : []) {
      const name = String(p?.ProductName || '').trim();
      if (!name || p?.ProductId === undefined || p?.ProductId === null) continue;
      items.push({ productId: String(p.ProductId), name, category: String(g?.CategoryName || '').trim(), inStock: p.InStock !== false });
    }
  }
  return items;
}

/** One key for the same dish however it is written: "Chicken Chilli Momos [6 Pieces] -O" (online
 *  and counter since 29 Oct), "Chicken Chilli Momos [6 Pieces]" (the stock list) and "Chilli Chicken
 *  Momos" (the old counter name) are one item. Sizes in brackets and the -O / - A ends don't count. */
export function itemKey(name: string): string {
  const words = name.toLowerCase()
    .replace(/\s*-\s*[oa]\.?\s*$/i, '')
    .replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((w) => w && !['pieces', 'piece', 'pcs', 'pc'].includes(w))
    .map((w) => (w === 'momo' ? 'momos' : w));
  return [...new Set(words)].sort().join(' ');
}

/** What each dish sold, from the days' order-item-detail records (orders[].orderType, rawItems[]). */
export function soldStats(days: { date: string; orders: any[] }[], today: string): Map<string, SoldStats> {
  const stats = new Map<string, SoldStats>();
  const onlineFrom = addDays(today, -ONLINE_DAYS), counterFrom = addDays(today, -COUNTER_DAYS);
  for (const day of days) {
    for (const o of day.orders || []) {
      const online = o?.orderType === 'HomeDelivery';
      for (const it of o?.rawItems || []) {
        if (it?.categoryName === 'Addon' || !it?.productName) continue;
        const key = itemKey(String(it.productName));
        const s = stats.get(key) || { lastOnline: null, lastCounter: null, online30: 0, counter14: 0 };
        const qty = Number(it.quantity) || 0;
        if (online) {
          if (!s.lastOnline || day.date > s.lastOnline) s.lastOnline = day.date;
          if (day.date >= onlineFrom) s.online30 += qty;
        } else {
          if (!s.lastCounter || day.date > s.lastCounter) s.lastCounter = day.date;
          if (day.date >= counterFrom) s.counter14 += qty;
        }
        stats.set(key, s);
      }
    }
  }
  return stats;
}

/** The items off online: ones the store still sells (flagged), ones kept off on purpose, and how many
 *  old ones nobody sells any more. An off listing whose dish is on under another listing (the old
 *  "Chicken Steamed Momos (8 pcs) - A" while "[6 Pieces]" is on) is old too. `listed` is the whole
 *  stock list as it is now (by default `items`). */
export function offOnline(items: StockItem[], stats: Map<string, SoldStats>, keptOff: Record<string, unknown>, today: string, listed: StockItem[] = items) {
  const onlineFrom = addDays(today, -ONLINE_DAYS), counterFrom = addDays(today, -COUNTER_DAYS);
  const onUnder = new Map<string, Set<string>>();
  for (const i of listed.filter((x) => x.inStock)) {
    const k = itemKey(i.name);
    onUnder.set(k, (onUnder.get(k) || new Set()).add(i.productId));
  }
  const sells: OffItem[] = [], kept: OffItem[] = [];
  let idle = 0;
  for (const it of items.filter((i) => !i.inStock)) {
    const key = itemKey(it.name);
    const s = stats.get(key);
    const row: OffItem = { productId: it.productId, name: it.name, category: it.category, lastOnline: s?.lastOnline || null, lastCounter: s?.lastCounter || null };
    if ([...(onUnder.get(key) || [])].some((id) => id !== it.productId)) idle++;
    else if (keptOff[it.productId]) kept.push(row);
    else if ((s?.lastOnline && s.lastOnline >= onlineFrom) || (s?.lastCounter && s.lastCounter >= counterFrom)) sells.push(row);
    else idle++;
  }
  // One listing a dish: both "[6 Pieces]" and the old "(8 pcs) - A" off shows once, as the current one.
  const byDish = new Map<string, OffItem>();
  for (const row of sells) {
    const key = itemKey(row.name), had = byDish.get(key);
    if (!had) byDish.set(key, row);
    else {
      idle++;
      if (/-\s*a\.?\s*$/i.test(had.name) && !/-\s*a\.?\s*$/i.test(row.name)) byDish.set(key, row);
    }
  }
  // Sold most recently first: the likeliest mistakes on top.
  const last = (r: OffItem) => [r.lastOnline || '', r.lastCounter || ''].sort().pop() || '';
  const flagged = [...byDish.values()].sort((a, b) => last(b).localeCompare(last(a)) || a.name.localeCompare(b.name));
  return { total: items.length, off: items.filter((i) => !i.inStock).length, sells: flagged, kept, idle };
}

/** The last time an item was switched off, from Ciferon's item log (GetProductLogs: Result[] with
 *  type "Stock-In" / "Stock-Out", platform, UserName and a date). The same switch on Swiggy and
 *  Zomato a minute apart is one. */
export function lastSwitchOff(rows: any[]): { at: string | null; by: string | null; platforms: string[] } {
  const dated = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ r, at: dateOf(r) }))
    .filter((x) => x.at && /out/i.test(String(x.r?.type ?? x.r?.Type ?? '')))
    .sort((a, b) => b.at!.localeCompare(a.at!));
  if (!dated.length) return { at: null, by: null, platforms: [] };
  const latest = Date.parse(dated[0].at!);
  const same = dated.filter((x) => latest - Date.parse(x.at!) <= 5 * 60000);
  const platforms = [...new Set(same.map((x) => String(x.r?.platform ?? x.r?.Platform ?? '').trim()).filter(Boolean))];
  return { at: dated[0].at, by: String(dated[0].r?.UserName ?? dated[0].r?.userName ?? '').trim() || null, platforms };
}

// ---- The day's out-of-stock report (owner, 1 Nov 2026: "for a day which items were not in stock and
// when they were stocked and send notification to the store manager explaining why it was out of
// stock") ----
/** What the 3-minute look saw during the day: each item seen switched off, from when to when. */
export type SeenPeriod = { from: string; to: string | null };
export type StatusDay = { date: string; at: string | null; items: Record<string, { name: string; category: string; periods: SeenPeriod[] }> };

/** Adds one look at the stock list: an item seen off starts (or continues) a period; seen back on, the
 *  period ends then. */
export function trackStatus(prev: StatusDay | null, date: string, items: StockItem[], nowIso: string): StatusDay {
  const day: StatusDay = { date, at: nowIso, items: { ...(prev?.date === date ? prev.items : {}) } };
  for (const it of items) {
    const seen = day.items[it.productId];
    const open = seen?.periods.find((p) => p.to === null);
    if (!it.inStock) {
      if (!seen) day.items[it.productId] = { name: it.name, category: it.category, periods: [{ from: nowIso, to: null }] };
      else if (!open) day.items[it.productId] = { ...seen, periods: [...seen.periods, { from: nowIso, to: null }] };
    } else if (open) {
      day.items[it.productId] = { ...seen!, periods: seen!.periods.map((p) => (p === open ? { ...p, to: nowIso } : p)) };
    }
  }
  return day;
}

/** One stretch an item was off during the day. from is when it was switched off (which may be an
 *  earlier day: "off since 31 Oct 7:02 PM"); to is when it came back, null if still off at the check. */
export type OffPeriod = { from: string | null; to: string | null; by: string | null; platforms: string[] };

/** The day's off stretches from Ciferon's item log: each Stock-Out starts one, the next Stock-In ends
 *  it (Swiggy and Zomato a few minutes apart are one switch). Only stretches that touch the day
 *  [date 00:00, next day 00:00) India time count. */
export function dayPeriods(rows: any[], date: string): OffPeriod[] {
  const dayStart = Date.parse(`${date}T00:00:00+05:30`), dayEnd = dayStart + 86400000;
  const events = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ at: dateOf(r), out: /out/i.test(String(r?.type ?? r?.Type ?? '')), by: String(r?.UserName ?? '').trim() || null, platform: String(r?.platform ?? r?.Platform ?? '').trim() }))
    .filter((e) => e.at)
    .sort((a, b) => a.at!.localeCompare(b.at!));
  const periods: OffPeriod[] = [];
  let open: OffPeriod | null = null;
  for (const e of events) {
    const t = Date.parse(e.at!);
    if (t >= dayEnd) break;
    if (e.out) {
      if (!open) open = { from: e.at, to: null, by: e.by, platforms: e.platform ? [e.platform] : [] };
      else if (e.platform && !open.platforms.includes(e.platform)) open.platforms.push(e.platform);
    } else if (open) {
      // The other app's switch back on a moment later finds nothing open: the same switch.
      open.to = e.at;
      periods.push(open);
      open = null;
    }
  }
  if (open) periods.push(open);
  return periods.filter((p) => (p.to === null || Date.parse(p.to) > dayStart) && Date.parse(p.from!) < dayEnd);
}

export const EXPLAIN_REASONS = ['sold_out', 'short_delivery', 'not_requested', 'ingredient', 'equipment', 'quality', 'busy', 'mistake', 'on_purpose', 'other'] as const;
export type ExplainReason = typeof EXPLAIN_REASONS[number];
export const REASON_WORDS: Record<ExplainReason, string> = {
  sold_out: 'sold out', short_delivery: 'delivery short or late', not_requested: 'not requested enough', ingredient: 'sauce or ingredient finished',
  equipment: 'machine down', quality: 'bad quality', busy: 'too busy, switched off to cope', mistake: 'switched off by mistake / forgot to switch on',
  on_purpose: 'kept off on purpose', other: 'other',
};
export type OutItem = {
  productId: string; name: string; category: string;
  periods: OffPeriod[];
  explanation?: { reason: ExplainReason; note?: string; by: string; at: string } | null;
};

const clock = (iso: string) => {
  const d = new Date(Date.parse(iso) + 330 * 60000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const shortDay = (iso: string) => {
  const d = new Date(Date.parse(iso) + 330 * 60000);
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};
/** "7:02 PM to 9:15 PM", "from 7:02 PM, still off at closing", "since 31 Oct 7:02 PM, all day" - for the day `date`. */
export function periodWords(p: OffPeriod, date: string): string {
  if (!p.from) return p.to ? `off until ${clock(p.to)}` : 'off (since when is not known)';
  const before = Date.parse(p.from) < Date.parse(`${date}T00:00:00+05:30`);
  const from = before ? `since ${shortDay(p.from)} ${clock(p.from)}` : `from ${clock(p.from)}`;
  if (!p.to) return before ? `${from}, all day` : `${from}, still off at closing`;
  return before ? `${from}, back on at ${clock(p.to)}` : `${clock(p.from)} to ${clock(p.to)}`;
}
/** "Chicken Chilli Momos [6 Pieces]" without Ciferon's -O / - A ending. */
export const cleanItemName = (name: string) => name.replace(/\s*-\s*[OA]\.?$/i, '').trim();

function dateOf(r: any): string | null {
  if (!r || typeof r !== 'object') return null;
  for (const [k, v] of Object.entries(r)) {
    if (!/date|time|created|deliver|on$/i.test(k) || typeof v !== 'string') continue;
    const at = ciferonTime(v);
    if (at) return at;
  }
  return null;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
