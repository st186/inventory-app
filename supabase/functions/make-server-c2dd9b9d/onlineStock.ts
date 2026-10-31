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
 *  old ones nobody sells any more. */
export function offOnline(items: StockItem[], stats: Map<string, SoldStats>, keptOff: Record<string, unknown>, today: string) {
  const onlineFrom = addDays(today, -ONLINE_DAYS), counterFrom = addDays(today, -COUNTER_DAYS);
  const sells: OffItem[] = [], kept: OffItem[] = [];
  let idle = 0;
  for (const it of items.filter((i) => !i.inStock)) {
    const s = stats.get(itemKey(it.name));
    const row: OffItem = { productId: it.productId, name: it.name, category: it.category, lastOnline: s?.lastOnline || null, lastCounter: s?.lastCounter || null };
    if (keptOff[it.productId]) kept.push(row);
    else if ((s?.lastOnline && s.lastOnline >= onlineFrom) || (s?.lastCounter && s.lastCounter >= counterFrom)) sells.push(row);
    else idle++;
  }
  // Sold most recently first: the likeliest mistakes on top.
  const last = (r: OffItem) => [r.lastOnline || '', r.lastCounter || ''].sort().pop() || '';
  sells.sort((a, b) => last(b).localeCompare(last(a)) || a.name.localeCompare(b.name));
  return { total: items.length, off: items.filter((i) => !i.inStock).length, sells, kept, idle };
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
