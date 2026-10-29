// Menu engineering from the till's own orders (owner, 30 Oct 2026: "check if the insight tab is
// state of the art ... we need more graphs or other things with AI capabilities ... to grow our
// business"). Each dish (the counter and the app version of it are one dish), how many plates and
// how much it brought in, how it moved against the period before, the preparation styles, the long
// tail of dishes that hardly sell, and what is bought together. Profit per plate needs the
// approved recipe costs, so it is left out until those exist. Tested with plain node:
//   node src/components/insights/menuMath.test.ts

export type PosItem = { productName: string; category?: string | null; quantity: number; total: number };
export type PosOrder = { items: PosItem[]; externalId?: string | null };
export type DayRecord = { date: string; orders: PosOrder[] };

const DRINK = /\b(cola|coke|sprite|pepsi|campa|water|drink|lemon|juice|lassi|tea|coffee|soda|thums|fanta|limca|mojito|shake)\b/i;
export const isDrink = (i: Pick<PosItem, 'productName' | 'category'>) => (!i.category && DRINK.test(i.productName)) || /drink|beverage/i.test(i.category || '');

/** What an item counts as for "bought together": its momo kind, Drinks, Soup or Other. */
export function groupOf(i: Pick<PosItem, 'productName' | 'category'>): string {
  if (isDrink(i)) return 'Drinks';
  if (/\bsoup\b/i.test(i.productName)) return 'Soup';
  return i.category?.trim() || 'Other';
}

/** One dish across the counter and the apps: "Chicken Afghani Momos [6 Pieces] -O" = "chicken afghani momos". */
export function dishKey(name: string): string {
  return name.toLowerCase()
    .replace(/\s*-\s*o\s*$/, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*(?:pc|pcs|pieces?)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const dishLabel = (name: string) => name.replace(/\s*-\s*O\s*$/i, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

const STYLES: [string, RegExp][] = [
  ['Burger', /burger/i], ['Meal', /\bmeal\b/i], ['Platter', /platter/i], ['Kurkure', /kurkure/i],
  ['Butter makhni', /makh?a?ni/i], ['Afghani', /afghani/i], ['Chilli', /chil+i/i], ['Pan fried', /pan.?fried/i],
  ['Tandoori', /tandoori/i], ['Jhol', /jhol/i], ['Fried', /fried/i], ['Soup', /\bsoup\b/i],
];
/** How it is made: steamed unless the name says otherwise; drinks are drinks. */
export function styleOf(i: Pick<PosItem, 'productName' | 'category'>): string {
  if (isDrink(i)) return 'Drinks';
  return STYLES.find(([, re]) => re.test(i.productName))?.[0] || (/momo/i.test(`${i.productName} ${i.category || ''}`) ? 'Steamed' : 'Other');
}

export type Dish = { key: string; name: string; group: string; style: string; plates: number; revenue: number; online: number; prevPlates: number };
export const TAIL_PLATES = 5; // fewer plates than this in the period: hardly sells

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function buildMenu(cur: DayRecord[], prev: DayRecord[] = []) {
  const dishes = new Map<string, Dish>();
  const styles = new Map<string, { style: string; plates: number; revenue: number }>();
  const groupOrders = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  let orders = 0, lines = 0, plates = 0, revenue = 0, multi = 0;
  for (const day of cur) {
    for (const o of day.orders || []) {
      if (!o.items?.length) continue;
      orders++;
      const groups = new Set<string>();
      for (const it of o.items) {
        const q = Number(it.quantity) || 0, t = Number(it.total) || 0;
        lines++; plates += q; revenue += t;
        const key = dishKey(it.productName);
        const d = dishes.get(key) || { key, name: dishLabel(it.productName), group: groupOf(it), style: styleOf(it), plates: 0, revenue: 0, online: 0, prevPlates: 0 };
        // The counter's spelling names the dish (the apps' one carries " -O").
        if (!/-\s*O\s*$/i.test(it.productName)) d.name = dishLabel(it.productName);
        d.plates += q; d.revenue += t; if (o.externalId) d.online += q;
        dishes.set(key, d);
        const s = styles.get(d.style) || { style: d.style, plates: 0, revenue: 0 };
        s.plates += q; s.revenue += t;
        styles.set(d.style, s);
        groups.add(groupOf(it));
      }
      if (groups.size > 1) multi++;
      for (const g of groups) groupOrders.set(g, (groupOrders.get(g) || 0) + 1);
      const gs = [...groups].sort();
      for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        const k = `${gs[i]}|${gs[j]}`;
        pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
      }
    }
  }
  for (const day of prev) for (const o of day.orders || []) for (const it of o.items || []) {
    const d = dishes.get(dishKey(it.productName));
    if (d) d.prevPlates += Number(it.quantity) || 0;
  }
  const list = [...dishes.values()].map((d) => ({ ...d, revenue: Math.round(d.revenue) })).sort((a, b) => b.plates - a.plates || b.revenue - a.revenue);
  const tail = list.filter((d) => d.plates < TAIL_PLATES);
  const change = (d: Dish) => (d.prevPlates ? Math.round(((d.plates - d.prevPlates) / d.prevPlates) * 100) : null);
  const pairs = [...pairCounts.entries()].map(([k, n]) => {
    const [a, b] = k.split('|');
    const pa = (groupOrders.get(a) || 0) / orders, pb = (groupOrders.get(b) || 0) / orders;
    return { a, b, orders: n, share: pct(n, orders), lift: pa && pb ? Math.round(((n / orders) / (pa * pb)) * 100) / 100 : 0 };
  }).filter((p) => p.orders >= 3).sort((x, y) => y.orders - x.orders).slice(0, 8);
  return {
    totals: { orders, plates, revenue: Math.round(revenue), dishes: list.length, avgItems: orders ? Math.round((lines / orders) * 10) / 10 : 0, multiShare: pct(multi, orders) },
    dishes: list.map((d) => ({ ...d, change: change(d), onlineShare: pct(d.online, d.plates) })),
    rising: list.filter((d) => d.prevPlates >= TAIL_PLATES && change(d)! >= 30).map((d) => ({ ...d, change: change(d)! })).slice(0, 5),
    falling: list.filter((d) => d.prevPlates >= TAIL_PLATES && change(d)! <= -30).map((d) => ({ ...d, change: change(d)! })).slice(0, 5),
    tail: { dishes: tail.length, plates: tail.reduce((s, d) => s + d.plates, 0), revenueShare: pct(tail.reduce((s, d) => s + d.revenue, 0), revenue), names: tail.slice(0, 12).map((d) => d.name) },
    styles: [...styles.values()].map((s) => ({ ...s, revenue: Math.round(s.revenue) })).sort((a, b) => b.plates - a.plates),
    attach: { drinks: pct(groupOrders.get('Drinks') || 0, orders), soup: pct(groupOrders.get('Soup') || 0, orders) },
    pairs,
  };
}
export type MenuView = ReturnType<typeof buildMenu>;
