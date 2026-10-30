// Burgers (owner, 30 Oct 2026: "add a burger check - how many burgers are ordered as expense and how
// many are sold in combos, mania and standalone burger orders ... raise alert when some anomaly is
// detected"). Buns come in as logged purchases named "Burger" (₹35-38 an entry, the same as the ones
// logged as packets - so an entry is a packet, worth bunsPerUnit buns once the owner says how many).
// Burgers go out in POS orders:
//  - standalone: a burger line of its own ("Chicken Momo Burger"; "[2 Pieces]" is 2);
//  - mania: a Mania combo's "Fried ... Momos Burger (2 pcs)" Addon line, 2 burgers;
//  - combo (meals and combos): a Momo Meal (6 momos + 1 burger + 1 drink) - its "1 Chicken Burger" /
//    "1 Veg Burger" Addon line at the counter, or 1 a meal where the order has no such line: the
//    online (Zomato/Swiggy, "-O") meals never do (429 of them since 19 Jul, checked 30 Oct 2026; with
//    them counted, buns bought at 4 a packet and burgers sold balance).
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
  left: number; // buns in stock now and still fresh (oldest used first; stock before `since` isn't known)
  stale: number; // buns that passed BUN_LIFE_DAYS unsold since `since`
  short: number; // burgers sold with no bun bought for them since `since`
  weeks: { from: string; to: string; bought: number; sold: number }[];
  anomalies: BurgerAnomaly[];
};

// A bun is used within this many days of being bought, or it's stale (bakery buns).
export const BUN_LIFE_DAYS = 5;

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

/** A Momo Meal line (it comes with one burger). */
export function isMealLine(name: string, category: string): boolean {
  return category !== 'Addon' && !/burger/i.test(name) && (/\bmeal\b/i.test(name) || /\bmeal\b/i.test(category));
}

/** Burgers sold each day, from the synced POS order records (order-item-detail). */
export function salesByDay(records: { date: string; orders?: any[] }[]): Record<string, BurgerSales> {
  const out: Record<string, BurgerSales> = {};
  for (const r of records) {
    for (const o of r.orders || []) {
      const got = zero();
      let singles = 0, meals = 0;
      for (const it of o.rawItems || []) {
        const name = String(it.productName || ''), cat = String(it.categoryName || ''), qty = Number(it.quantity) || 0;
        const b = burgersInLine(name, cat, qty);
        if (b) {
          got[b.kind] += b.n;
          if (b.kind === 'combo') singles += b.n;
        } else if (isMealLine(name, cat)) meals += qty;
      }
      got.combo += Math.max(0, meals - singles); // meals whose burger has no line of its own
      if (got.standalone || got.mania || got.combo) {
        const day = (out[r.date] ||= zero());
        for (const k of Object.keys(got) as BurgerKind[]) day[k] += got[k];
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

  // Buns day by day, oldest used first: a burger with no bun left is "short", a bun older than
  // BUN_LIFE_DAYS is "stale". Buns bought a day or two ago aren't waste - they just haven't sold yet.
  const lots: { day: string; n: number }[] = [];
  const shortOn: Record<string, number> = {}, staleOn: Record<string, number> = {};
  for (let d = o.since; d <= o.today; d = addDays(d, 1)) {
    const inToday = o.purchases.filter((p) => p.date === d).reduce((s, p) => s + p.quantity * per, 0);
    if (inToday) lots.push({ day: d, n: inToday });
    let need = o.sales[d] ? total(o.sales[d]) : 0;
    while (need > 0 && lots.length) {
      const take = Math.min(need, lots[0].n);
      lots[0].n -= take;
      need -= take;
      if (lots[0].n <= 0) lots.shift();
    }
    if (need > 0) shortOn[d] = need;
    while (lots.length && lots[0].day <= addDays(d, -BUN_LIFE_DAYS)) staleOn[d] = (staleOn[d] || 0) + lots.shift()!.n;
  }
  const sumIn = (m: Record<string, number>, from: string) => Object.entries(m).filter(([d]) => d >= from && d <= o.today).reduce((s, [, v]) => s + v, 0);

  const anomalies: BurgerAnomaly[] = [];
  if (o.bunsPerUnit) {
    // Burgers sold with no bun bought for them: buns bought and not logged, or the count is off.
    const from7 = addDays(o.today, -6);
    const short7 = sumIn(shortOn, from7);
    if (short7 > 4) anomalies.push({ kind: 'sold-more', days: 7, bought: boughtIn(from7, o.today), sold: soldIn(from7, o.today), text: `${short7} burgers sold in the last 7 days with no bun logged as bought for them` });
    // Buns that went stale unsold: bought too many, or burgers made and not billed.
    const from14 = addDays(o.today, -13);
    const stale14 = sumIn(staleOn, from14), b14 = boughtIn(addDays(from14, -BUN_LIFE_DAYS), o.today);
    if (stale14 > Math.max(8, b14 * 0.3)) anomalies.push({ kind: 'bought-more', days: 14, bought: b14, sold: soldIn(from14, o.today), text: `${stale14} buns went past ${BUN_LIFE_DAYS} days without being used in the last 14 days` });
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
    bought, sold: { ...sold, total: total(sold) }, left: lots.reduce((s, l) => s + l.n, 0),
    stale: sumIn(staleOn, o.since), short: sumIn(shortOn, o.since), weeks, anomalies,
  };
}
