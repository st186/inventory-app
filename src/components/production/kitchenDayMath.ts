// The guided production day (owner, 29 Oct 2026: "Its pretty difficult to understand how its built
// now. Can you revamp it for easy understanding with AI integration for proper handholding of the
// production incharge"). One line per kitchen item - dough, batter, each stuffing - telling the
// day's story: weighed in the morning -> made -> used for the momos -> should be left -> counted at
// night. The sums live here so they can be tested with plain node:
//   node src/components/production/kitchenDayMath.test.ts
// Momos a kg makes comes from the house's own counted days (server leftoverRules.ts piecesPerKg).

export type Pool = { opening: number; prepared: number; closingActual: number | null };
export type LastCounted = Record<string, { date: string; kg: number; when: 'night' | 'morning' }>;
export type Item = { id: string; kind: 'dough' | 'batter' | 'stuffing' | 'coating'; type: string | null };

// inventory key -> momo-entry key, the item its wrapper comes from, and its own filling. Cheese corn
// has a dough of its own (owner, 31 Oct 2026: "corn cheese dough is different from the rest").
export const TYPES: { type: string; momoKey: string; wrap: 'dough' | 'dough:cheeseCorn' | 'batter'; own: 'stuffing' | 'coating' }[] = [
  { type: 'chicken', momoKey: 'chickenMomos', wrap: 'dough', own: 'stuffing' },
  { type: 'chickenCheese', momoKey: 'chickenCheeseMomos', wrap: 'dough', own: 'stuffing' },
  { type: 'veg', momoKey: 'vegMomos', wrap: 'dough', own: 'stuffing' },
  { type: 'cheeseCorn', momoKey: 'cheeseCornMomos', wrap: 'dough:cheeseCorn', own: 'stuffing' },
  { type: 'paneer', momoKey: 'paneerMomos', wrap: 'dough', own: 'stuffing' },
  { type: 'vegKurkure', momoKey: 'vegKurkureMomos', wrap: 'batter', own: 'coating' },
  { type: 'chickenKurkure', momoKey: 'chickenKurkureMomos', wrap: 'batter', own: 'coating' },
];

// In the owner's order: dough, stuffing, batter (and the kurkure coating).
export const ALL_ITEMS: Item[] = [
  { id: 'dough', kind: 'dough', type: null },
  { id: 'dough:cheeseCorn', kind: 'dough', type: 'cheeseCorn' },
  ...TYPES.filter((t) => t.own === 'stuffing').map((t) => ({ id: `stuffing:${t.type}`, kind: 'stuffing' as const, type: t.type })),
  { id: 'batter', kind: 'batter', type: null },
  ...TYPES.filter((t) => t.own === 'coating').map((t) => ({ id: `coating:${t.type}`, kind: 'coating' as const, type: t.type })),
];

/** A momo type's own filling (stuffing or coating), as against a dough or batter. */
export const isFilling = (it: Item) => it.kind === 'stuffing' || it.kind === 'coating';

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
  if (isFilling(it)) return plan[it.type!] || 0;
  return TYPES.filter((t) => t.wrap === it.id).reduce((s, t) => s + (plan[t.type] || 0), 0);
}

/** Momos made today that used this item (from the momo entries, by inventory key). */
export function piecesMade(it: Item, pieces: Record<string, number>): number {
  if (isFilling(it)) return pieces[it.type!] || 0;
  return TYPES.filter((t) => t.wrap === it.id).reduce((s, t) => s + (pieces[t.type] || 0), 0);
}

/** The key momos-per-kg is learnt under (server piecesPerKg): the type, or 'dough' / 'dough:cheeseCorn' / 'batter'. */
export const perKgKey = (it: Item) => (isFilling(it) ? it.type! : it.id);

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

// Frozen leftover stuffing (owner, 29 Oct 2026: "it takes around 4-5 hours for the ice to melt"):
// it can't be used for the first hours of the day, so that part of the folding needs fresh
// stuffing whatever is in the freezer. Folding runs over the production shift (8 AM - 7 PM, less
// the hour's break). Stuffing thawed in the fridge overnight is ready first thing.
export const THAW_HOURS = 4.5;
export const FOLDING_HOURS = 10;
export const THAW_SHARE = Math.min(1, THAW_HOURS / FOLDING_HOURS);

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
  makeKg: number | null;         // what the day needs making, from the morning stock (0 = don't)
  stillToMake: number | null;    // what is left to make after today's batches so far
  frozen: boolean;               // the morning stock is frozen (usable after THAW_HOURS)
  freshEarly: number | null;     // fresh needed for the folding before it thaws
  rollsOver: number | null;      // frozen stock that will still be left tonight on plan
  overMade: boolean;             // made more than the plan needed, with enough already there
  usedPieces: number;            // momos entered that used it
  used: number | null;           // kg used for the momos entered
  shouldLeft: number | null;     // morning + made - used
  counted: number | null;        // night count
  gap: number | null;            // counted - should be left (more than a small slack = check)
};

/** One item's day, from the numbers the screen has. */
export function itemDay(it: Item, pool: Pool | undefined, plan: Record<string, number> | null, pieces: Record<string, number>, perKg: Record<string, number>, opts: { frozen?: boolean } = {}): ItemDay {
  const morning = pool?.opening || 0;
  const made = pool?.prepared || 0;
  const per = perKg[perKgKey(it)] || null;
  const planned = planPieces(it, plan);
  const need = per && planned ? r2(planned / per) : null;
  // Frozen stock covers only the folding after it thaws; the first part of the day needs fresh.
  const frozen = !!opts.frozen && morning > 0.005 && isFilling(it);
  const freshEarly = frozen && need !== null ? r2(need * THAW_SHARE) : null;
  const target = need === null ? null : frozen ? Math.max(freshEarly!, need - morning) : need - morning;
  const makeKg = target === null ? null : Math.max(0, halfUp(target));
  const usedPieces = piecesMade(it, pieces);
  // No momos of a type entered: none of its stuffing was used (all of it should still be there).
  const used = per ? r2(usedPieces / per) : null;
  const shouldLeft = used === null ? null : r2(Math.max(0, morning + made - used));
  const counted = typeof pool?.closingActual === 'number' ? pool.closingActual : null;
  return {
    item: it, morning, made, planned, perKg: per, need,
    covers: per ? Math.round((morning * per) / 10) * 10 : null,
    makeKg,
    stillToMake: target === null ? null : Math.max(0, halfUp(target - made)),
    frozen, freshEarly,
    rollsOver: frozen && need !== null ? r2(Math.max(0, morning - (need - freshEarly!))) : null,
    overMade: target !== null && made > 0 && made > Math.max(0, target) * 1.25 + 0.5,
    usedPieces, used, shouldLeft, counted,
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
      frozenThawHours: d.frozen ? THAW_HOURS : undefined, freshForMorningKg: d.freshEarly ?? undefined, frozenLeftAgainTonightKg: d.rollsOver || undefined,
    })),
    notWeighedRecently: stale.length ? stale : undefined,
  };
}
