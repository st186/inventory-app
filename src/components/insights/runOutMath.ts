// Sales lost to running out (owner, 30 Oct 2026). Two sources: stock-outs the store logged (item,
// from when, until when), and run-outs spotted in the sales themselves - a momo kind that normally
// sells through the evening stops hours before closing while other orders carry on (nothing had
// been logged at all by 30 Oct). Either way the loss is what that kind usually sells in the hours it
// was missing, at its usual price. Tested with plain node:
//   node src/components/insights/runOutMath.test.ts

export type HourItem = { productName: string; category?: string | null; quantity: number; total: number };
export type HourOrder = { orderHourIST?: number | null; items: HourItem[] };
export type Day = { date: string; orders: HourOrder[] };
export type LoggedStockOut = { item: string; category?: string; startAt: string; endAt?: string | null };

export const OPEN_HOUR = 15;   // the store sells from 3 PM ...
export const CLOSE_HOUR = 22;  // ... to the 10 PM hour
const MIN_DAILY = 8;           // a kind that sells fewer plates a day than this is too thin to judge
const MIN_MISSED = 3;          // plates it would usually have sold in the gap
const MIN_OTHER_ORDERS = 5;    // other orders after it stopped: the store was open and busy

/** "Cheese Corn momos" and "Corn Cheese Momos" are the same kind: "cheese corn". */
export const kindKey = (s: string) => s.toLowerCase().replace(/momos?/g, ' ').split(/[^a-z]+/).filter(Boolean).sort().join(' ');

export type Usual = Map<string, { name: string; perHour: number[]; perDay: number; price: number }>;

/** Plates a day and per hour each momo kind usually sells, and its price a plate, over these days. */
export function usualSales(days: Day[]): Usual {
  const acc = new Map<string, { name: string; hours: number[]; plates: number; revenue: number }>();
  const open = days.filter((d) => d.orders?.length);
  for (const d of open) for (const o of d.orders) for (const it of o.items || []) {
    if (!it.category || !/momo/i.test(it.category)) continue;
    const k = kindKey(it.category);
    const a = acc.get(k) || { name: it.category, hours: Array(24).fill(0), plates: 0, revenue: 0 };
    const q = Number(it.quantity) || 0;
    if (typeof o.orderHourIST === 'number') a.hours[o.orderHourIST] += q;
    a.plates += q; a.revenue += Number(it.total) || 0;
    acc.set(k, a);
  }
  const n = open.length || 1;
  const out: Usual = new Map();
  for (const [k, a] of acc) out.set(k, { name: a.name, perHour: a.hours.map((h) => h / n), perDay: a.plates / n, price: a.plates ? a.revenue / a.plates : 0 });
  return out;
}

const missed = (u: { perHour: number[] }, from: number, to: number) => {
  let s = 0;
  for (let h = Math.max(from, OPEN_HOUR); h <= Math.min(to, CLOSE_HOUR); h++) s += u.perHour[h] || 0;
  return s;
};

export type RunOut = { date: string; kind: string; name: string; fromHour: number; toHour: number; plates: number; rupees: number; source: 'logged' | 'spotted' };

/** Run-outs spotted from sales stopping early (or never starting on a busy day). */
export function spottedRunOuts(days: Day[], usual: Usual): RunOut[] {
  const out: RunOut[] = [];
  for (const d of days) {
    const hours = d.orders.map((o) => o.orderHourIST).filter((h): h is number => typeof h === 'number');
    if (hours.length < 10) continue;
    for (const [k, u] of usual) {
      if (u.perDay < MIN_DAILY) continue;
      const sold = d.orders.filter((o) => typeof o.orderHourIST === 'number' && o.items.some((it) => it.category && kindKey(it.category) === k)).map((o) => o.orderHourIST!);
      const last = sold.length ? Math.max(...sold) : OPEN_HOUR - 1;
      if (last >= CLOSE_HOUR) continue;
      const others = hours.filter((h) => h > last).length;
      const plates = missed(u, last + 1, CLOSE_HOUR);
      if (others < MIN_OTHER_ORDERS || plates < MIN_MISSED) continue;
      out.push({ date: d.date, kind: k, name: u.name, fromHour: last + 1, toHour: CLOSE_HOUR, plates: Math.round(plates), rupees: Math.round(plates * u.price), source: 'spotted' });
    }
  }
  return out;
}

const istHour = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + 330 * 60000).getUTCHours();
};
const istDate = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);

/** The logged stock-outs of momos, valued the same way. */
export function loggedRunOuts(entries: LoggedStockOut[], usual: Usual): RunOut[] {
  const out: RunOut[] = [];
  for (const e of entries) {
    if (e.category && e.category !== 'momo') continue;
    const k = kindKey(e.item);
    const u = usual.get(k);
    const from = istHour(e.startAt);
    if (!u || from === null) continue;
    const to = e.endAt ? Math.min(CLOSE_HOUR, Math.max(from, (istHour(e.endAt) ?? CLOSE_HOUR) - 1)) : CLOSE_HOUR;
    const plates = missed(u, from, to);
    out.push({ date: istDate(e.startAt), kind: k, name: u.name, fromHour: from, toHour: to, plates: Math.round(plates), rupees: Math.round(plates * u.price), source: 'logged' });
  }
  return out;
}

/** Both, a spotted one dropped where the same kind was logged that day; the biggest first. */
export function salesLost(days: Day[], history: Day[], logged: LoggedStockOut[]) {
  const usual = usualSales([...history, ...days]);
  const fromLog = loggedRunOuts(logged, usual);
  const seen = new Set(fromLog.map((r) => `${r.date}|${r.kind}`));
  const spotted = spottedRunOuts(days, usual).filter((r) => !seen.has(`${r.date}|${r.kind}`));
  const all = [...fromLog, ...spotted].sort((a, b) => b.rupees - a.rupees);
  return {
    runOuts: all,
    total: all.reduce((s, r) => s + r.rupees, 0),
    plates: all.reduce((s, r) => s + r.plates, 0),
    logged: fromLog.length,
    spotted: spotted.length,
  };
}
