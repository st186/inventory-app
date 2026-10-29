// The guided production day (owner, 29 Oct 2026: "Its pretty difficult to understand how its built
// now. Can you revamp it for easy understanding with AI integration for proper handholding of the
// production incharge"). One line per kitchen item - dough, batter, each stuffing - telling the
// day's story: weighed in the morning -> made -> used for the momos -> should be left -> counted at
// night. The sums live here so they can be tested with plain node:
//   node src/components/production/kitchenDay.test.ts
// Momos a kg makes comes from the house's own counted days (server leftoverRules.ts piecesPerKg).

export type Pool = { opening: number; prepared: number; closingActual: number | null };
export type LastCounted = Record<string, { date: string; kg: number; when: 'night' | 'morning' }>;
export type Item = { id: string; kind: 'dough' | 'batter' | 'stuffing' | 'coating'; type: string | null };

// inventory key -> momo-entry key, and which shared pool each type's wrapper comes from.
export const TYPES: { type: string; momoKey: string; shared: 'dough' | 'batter'; own: 'stuffing' | 'coating' }[] = [
  { type: 'chicken', momoKey: 'chickenMomos', shared: 'dough', own: 'stuffing' },
  { type: 'chickenCheese', momoKey: 'chickenCheeseMomos', shared: 'dough', own: 'stuffing' },
  { type: 'veg', momoKey: 'vegMomos', shared: 'dough', own: 'stuffing' },
  { type: 'cheeseCorn', momoKey: 'cheeseCornMomos', shared: 'dough', own: 'stuffing' },
  { type: 'paneer', momoKey: 'paneerMomos', shared: 'dough', own: 'stuffing' },
  { type: 'vegKurkure', momoKey: 'vegKurkureMomos', shared: 'batter', own: 'coating' },
  { type: 'chickenKurkure', momoKey: 'chickenKurkureMomos', shared: 'batter', own: 'coating' },
];

export const ALL_ITEMS: Item[] = [
  { id: 'dough', kind: 'dough', type: null },
  { id: 'batter', kind: 'batter', type: null },
  ...TYPES.map((t) => ({ id: `${t.own}:${t.type}`, kind: t.own, type: t.type })),
];

const has = (n: number | null | undefined) => typeof n === 'number' && n > 0.005;

/** The items that matter today: dough always, and anything planned, in the kitchen, made or counted. */
export function itemsForDay(pools: Record<string, Pool | undefined>, plan: Record<string, number> | null, last: LastCounted): Item[] {
  return ALL_ITEMS.filter((it) => {
    if (it.id === 'dough') return true;
    const p = pools[it.id];
    if (has(p?.opening) || has(p?.prepared) || typeof p?.closingActual === 'number' || has(last[it.id]?.kg)) return true;
    return planPieces(it, plan) > 0;
  });
}

/** Momos planned today that use this item. */
export function planPieces(it: Item, plan: Record<string, number> | null): number {
  if (!plan) return 0;
  if (it.type) return plan[it.type] || 0;
  return TYPES.filter((t) => t.shared === it.kind).reduce((s, t) => s + (plan[t.type] || 0), 0);
}

/** Momos made today that used this item (from the momo entries, by inventory key). */
export function piecesMade(it: Item, pieces: Record<string, number>): number {
  if (it.type) return pieces[it.type] || 0;
  return TYPES.filter((t) => t.shared === it.kind).reduce((s, t) => s + (pieces[t.type] || 0), 0);
}

/** The key momos-per-kg is learnt under (server piecesPerKg): the type, or 'dough' / 'batter'. */
export const perKgKey = (it: Item) => it.type || it.kind;

/**
 * How sure the morning figure is. "last_night": counted at last night's close (or weighed this
 * morning) - fine. "stale": last weighed before yesterday - weigh it now. "never": never weighed.
 */
export function countState(it: Item, last: LastCounted, date: string): { state: 'last_night' | 'stale' | 'never'; date?: string; kg?: number } {
  const l = last[it.id];
  if (!l) return { state: 'never' };
  const yesterday = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return { state: l.date >= yesterday ? 'last_night' : 'stale', date: l.date, kg: l.kg };
}

const halfUp = (kg: number) => Math.ceil(kg * 2) / 2;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ItemDay = {
  item: Item;
  morning: number;               // what the day starts with (weighed, or carried)
  made: number;
  planned: number;               // momos planned that use it
  perKg: number | null;          // momos a kg makes, learnt
  need: number | null;           // kg the plan needs
  covers: number | null;         // momos the morning stock covers
  makeKg: number | null;         // what to make today (0 = don't)
  overMade: boolean;             // made more than the plan needed, with enough already there
  used: number | null;           // kg used for the momos entered
  shouldLeft: number | null;     // morning + made - used
  counted: number | null;        // night count
  gap: number | null;            // counted - should be left (more than a small slack = check)
};

/** One item's day, from the numbers the screen has. */
export function itemDay(it: Item, pool: Pool | undefined, plan: Record<string, number> | null, pieces: Record<string, number>, perKg: Record<string, number>): ItemDay {
  const morning = pool?.opening || 0;
  const made = pool?.prepared || 0;
  const per = perKg[perKgKey(it)] || null;
  const planned = planPieces(it, plan);
  const need = per && planned ? r2(planned / per) : null;
  const makeKg = need === null ? null : Math.max(0, halfUp(need - morning));
  const usedPieces = piecesMade(it, pieces);
  const used = per && usedPieces ? r2(usedPieces / per) : null;
  const shouldLeft = used === null ? null : r2(Math.max(0, morning + made - used));
  const counted = typeof pool?.closingActual === 'number' ? pool.closingActual : null;
  return {
    item: it, morning, made, planned, perKg: per, need,
    covers: per ? Math.round((morning * per) / 10) * 10 : null,
    makeKg,
    overMade: need !== null && made > 0 && morning + made > need * 1.25 + 0.5,
    used, shouldLeft, counted,
    gap: counted !== null && shouldLeft !== null ? r2(counted - shouldLeft) : null,
  };
}

/** A count off from what should be left by more than half a kilo and 15%. */
export const gapMatters = (d: ItemDay) => d.gap !== null && d.shouldLeft !== null && Math.abs(d.gap) > Math.max(0.5, d.shouldLeft * 0.15);

/** What Bunny is told (server coach route): only the numbers, rounded, per item that matters. */
export function coachFacts(days: ItemDay[], label: (it: Item) => string, stale: string[]) {
  return {
    items: days.map((d) => ({
      item: label(d.item), morningKg: r2(d.morning), madeKg: r2(d.made), momosPlanned: d.planned || undefined,
      momosPerKg: d.perKg || undefined, planNeedsKg: d.need ?? undefined, makeKg: d.makeKg ?? undefined, morningCoversMomos: d.covers ?? undefined,
      madeMoreThanNeeded: d.overMade || undefined, usedKg: d.used ?? undefined, shouldBeLeftKg: d.shouldLeft ?? undefined, countedKg: d.counted ?? undefined,
    })),
    notWeighedRecently: stale.length ? stale : undefined,
  };
}
