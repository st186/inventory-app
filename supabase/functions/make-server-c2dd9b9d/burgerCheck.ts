// Burgers (owner, 30 Oct 2026: "add a burger check - how many burgers are ordered as expense and how
// many are sold in combos, mania and standalone burger orders ... raise alert when some anomaly is
// detected"). Buns come in as logged purchases named "Burger" (₹35-38 an entry, the same as the ones
// logged as packets - so an entry is a packet, worth bunsPerUnit buns once the owner says how many).
// Burgers go out in POS orders:
//  - standalone: a burger line of its own ("Chicken Momo Burger"; "[2 Pieces]" is 2);
//  - mania: a Mania combo's "Fried ... Momos Burger (2 pcs)" Addon line, 2 burgers;
//  - combo: another combo's "1 Chicken Burger" / "1 Veg Burger" Addon line, 1.
// A combo's own line ("... Mania Combo (8Pc Momos + 2 Burgers)") isn't counted: its Addon lines are
// the burgers (every Mania combo order carries one - checked against the orders on 30 Oct 2026).
// Tested with plain node:  node supabase/functions/make-server-c2dd9b9d/burgerCheck.test.ts

export type BurgerKind = 'standalone' | 'mania' | 'combo';
export type BurgerSales = Record<BurgerKind, number>;
export type BurgerPurchase = { date: string; quantity: number; category?: string; unit?: string };
export type BurgerAnomaly = { kind: 'sold-more' | 'bought-more' | 'odd-entry'; days: number; bought: number; sold: number; date?: string; text: string };
export type BurgerCheck = {
  since: string; to: string;
  bunsPerUnit: number | null; // buns in one logged "Burger"; null until the owner says
  entries: number; bought: number; // buns bought since `since`
  sold: BurgerSales & { total: number };
  left: number; // bought - sold since `since` (stock before then isn't known)
  weeks: { from: string; to: string; bought: number; sold: number }[];
  anomalies: BurgerAnomaly[];
};

const TWO = /\b2 ?pcs\b|2 pieces|pack of 2/i;
const BREAD_UNITS = ['pcs', 'pieces', 'piece', 'packets', 'packet', 'pkt'];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const zero = (): BurgerSales => ({ standalone: 0, mania: 0, combo: 0 });

/** Burgers in one POS order line, or null when the line isn't a burger. */
export function burgersInLine(name: string, category: string, qty: number): { kind: BurgerKind; n: number } | null {
  if (!/burger/i.test(name) || /combo/i.test(name) || !(qty > 0)) return null;
  if (category === 'Addon') return TWO.test(name) ? { kind: 'mania', n: qty * 2 } : { kind: 'combo', n: qty };
  return { kind: 'standalone', n: qty * (TWO.test(name) ? 2 : 1) };
}

/** Burgers sold each day, from the synced POS order records (order-item-detail). */
export function salesByDay(records: { date: string; orders?: any[] }[]): Record<string, BurgerSales> {
  const out: Record<string, BurgerSales> = {};
  for (const r of records) {
    for (const o of r.orders || []) {
      for (const it of o.rawItems || []) {
        const b = burgersInLine(String(it.productName || ''), String(it.categoryName || ''), Number(it.quantity) || 0);
        if (!b) continue;
        const day = (out[r.date] ||= zero());
        day[b.kind] += b.n;
      }
    }
  }
  return out;
}

/** A logged purchase of burger buns. */
export function isBurgerPurchase(item: { itemName?: string }): boolean {
  return ['burger', 'burgers', 'burger bun', 'burger buns'].includes(String(item.itemName || '').trim().toLowerCase());
}

const total = (s: BurgerSales) => s.standalone + s.mania + s.combo;

export function checkBurgers(o: { purchases: BurgerPurchase[]; sales: Record<string, BurgerSales>; since: string; today: string; bunsPerUnit: number | null }): BurgerCheck {
  const per = o.bunsPerUnit || 1;
  const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
  const boughtIn = (from: string, to: string) => o.purchases.filter((p) => inRange(p.date, from, to)).reduce((s, p) => s + p.quantity * per, 0);
  const soldIn = (from: string, to: string) => Object.entries(o.sales).filter(([d]) => inRange(d, from, to)).reduce((s, [, v]) => s + total(v), 0);

  const sold = zero();
  for (const [d, v] of Object.entries(o.sales)) if (inRange(d, o.since, o.today)) for (const k of Object.keys(sold) as BurgerKind[]) sold[k] += v[k];
  const bought = boughtIn(o.since, o.today);
  const weeks = [];
  for (let i = 0; i < 8; i++) {
    const to = addDays(o.today, -7 * i);
    const from = addDays(to, -6);
    if (to < o.since) break;
    weeks.push({ from, to, bought: boughtIn(from, to), sold: soldIn(from, to) });
  }

  const anomalies: BurgerAnomaly[] = [];
  if (o.bunsPerUnit) {
    // More burgers sold than buns bought: buns bought and not logged, or the count is off.
    const b7 = boughtIn(addDays(o.today, -6), o.today), s7 = soldIn(addDays(o.today, -6), o.today);
    if (s7 > b7 * 1.2 + 4) anomalies.push({ kind: 'sold-more', days: 7, bought: b7, sold: s7, text: `${s7} burgers sold in the last 7 days, but only ${b7} buns logged as bought` });
    // Far more buns bought than burgers sold: buns going stale, or burgers made and not billed.
    const b14 = boughtIn(addDays(o.today, -13), o.today), s14 = soldIn(addDays(o.today, -13), o.today);
    if (b14 > s14 * 1.3 + 8) anomalies.push({ kind: 'bought-more', days: 14, bought: b14, sold: s14, text: `${b14} buns bought in the last 14 days, but only ${s14} burgers sold` });
  }
  // A burger entry filed under the wrong category or an odd unit (27 Oct 2026: one went under spices).
  for (const p of o.purchases.filter((x) => inRange(x.date, addDays(o.today, -30), o.today))) {
    const badCat = p.category && p.category !== 'bread_buns';
    const badUnit = p.unit && !BREAD_UNITS.includes(p.unit.toLowerCase());
    if (badCat || badUnit) {
      anomalies.push({ kind: 'odd-entry', days: 30, bought: p.quantity * per, sold: 0, date: p.date,
        text: `The burger bun purchase of ${p.date} is logged ${badCat ? `under "${p.category}"` : ''}${badCat && badUnit ? ' and ' : ''}${badUnit ? `in "${p.unit}"` : ''}: check it` });
    }
  }
  return {
    since: o.since, to: o.today, bunsPerUnit: o.bunsPerUnit,
    entries: o.purchases.filter((p) => inRange(p.date, o.since, o.today)).length,
    bought, sold: { ...sold, total: total(sold) }, left: bought - total(sold), weeks, anomalies,
  };
}
