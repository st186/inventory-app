// Bags of momos for the store (owner, 30 Oct 2026): every type now goes in bags of 50, and a bag
// may sit in the store freezer up to 4 days. "Tomorrow's sales + 15%, rounded up to a bag" sent a
// bag of 50 every day for a type that sells 15. Instead Bunny follows what the store still has:
// the last deliveries, oldest first, less what sold and was thrown, anything past 4 days written
// off. A bag goes out only when that won't cover the day.
//   - Selling less than a bag in 4 days ("slow"): no extra margin. A bag goes only when the store
//     would run out.
//   - Selling less than half a bag in 4 days ("too slow"): left out. Most of the bag would go past
//     4 days, so the incharge adds it by hand if it should stay on the menu.
// The store's request (Bunny fill), the production plan and the week plan all use this, so they
// agree. Tested with plain node:  node src/utils/requestPlan.test.ts
// Runtime imports stay out of this file so the test runs without a bundler.

export const BAG = 50;
export const BAG_LIFE_DAYS = 4;
export const BUFFER = 0.15;
export const LOOKBACK_DAYS = 10;
/** Short by fewer pieces than this with some still in the freezer: no bag (about a plate). */
export const MIN_SHORT = 5;

export type Pieces = Partial<Record<string, number>>;
export type ByDate = Record<string, Pieces>;

export interface PlanInput {
  keys: string[];
  firstPlanDay: string;  // first day bags are planned for (before it, deliveries are what really went)
  lastPlanDay: string;
  delivered: ByDate;     // date -> pieces that reached the store that day
  sold: ByDate;          // date -> pieces sold (POS)
  expected: ByDate;      // date -> forecast pieces (plan days, and past days the POS hasn't got)
  wasted?: ByDate;       // date -> pieces thrown (store wastage)
  counted?: { date: string; pieces: Pieces } | null; // a stock count: the store held this after that day
  fixed?: ByDate;        // plan days the store has already asked for: what it asked, not Bunny's figure
  bag?: number;
  lifeDays?: number;
  buffer?: number;
  lookback?: number;
}

export interface PlanRow {
  key: string;
  expected: number;        // forecast pieces for the day
  onHand: number;          // in the store freezer at the start of the day, still within 4 days
  pieces: number;          // to send (whole bags)
  bags: number;
  slow: boolean;           // sells less than a bag in 4 days
  tooSlow: boolean;        // sells less than half a bag in 4 days: left out
  daysPerBag: number | null;
  goingOff: number;        // pieces left past 4 days at the end of the day, to throw
}

export interface PlanDay { date: string; rows: Record<string, PlanRow> }

export const addDaysISO = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Takes `n` pieces from the oldest lots first. */
function take(lots: { date: string; n: number }[], n: number) {
  let left = n;
  while (left > 0 && lots.length) {
    const used = Math.min(lots[0].n, left);
    lots[0].n -= used;
    left -= used;
    if (lots[0].n <= 0) lots.shift();
  }
}

export function planBags(input: PlanInput): PlanDay[] {
  const bag = input.bag ?? BAG;
  const life = input.lifeDays ?? BAG_LIFE_DAYS;
  const buffer = input.buffer ?? BUFFER;
  const start = addDaysISO(input.firstPlanDay, -(input.lookback ?? LOOKBACK_DAYS));
  // A past day the POS hasn't got and the forecast doesn't cover: the type's usual day.
  const usual: Record<string, number> = {};
  for (const key of input.keys) {
    const known = Object.entries(input.sold).filter(([d, p]) => d >= start && d < input.firstPlanDay && p?.[key] !== undefined).map(([, p]) => Number(p![key]) || 0);
    usual[key] = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  }
  const lots: Record<string, { date: string; n: number }[]> = Object.fromEntries(input.keys.map((k) => [k, []]));
  const days: PlanDay[] = [];
  for (let d = start; d <= input.lastPlanDay; d = addDaysISO(d, 1)) {
    const planning = d >= input.firstPlanDay;
    const day: PlanDay = { date: d, rows: {} };
    for (const key of input.keys) {
      const q = lots[key];
      const onHand = q.reduce((t, l) => t + l.n, 0);
      const expected = Number(input.expected[d]?.[key]) || 0;
      let pieces = 0;
      let slow = false;
      let tooSlow = false;
      if (planning) {
        slow = expected > 0 && expected * life < bag;
        tooSlow = expected > 0 && expected * life < bag / 2;
        const short = expected * (1 + (slow ? 0 : buffer)) - onHand;
        if (input.fixed?.[d]) pieces = Number(input.fixed[d][key]) || 0;
        else if (!tooSlow && short > 0 && (short >= MIN_SHORT || onHand < 1)) pieces = Math.ceil(short / bag) * bag;
        if (pieces > 0) q.push({ date: d, n: pieces });
      } else {
        const came = Number(input.delivered[d]?.[key]) || 0;
        if (came > 0) q.push({ date: d, n: came });
      }
      const sold = planning ? expected : Number(input.sold[d]?.[key] ?? input.expected[d]?.[key] ?? usual[key]) || 0;
      take(q, (Number(input.wasted?.[d]?.[key]) || 0) + sold);
      if (input.counted && input.counted.date === d && input.counted.pieces[key] !== undefined) {
        // The count is what was really there; its age isn't known, so it counts as a day old.
        q.splice(0, q.length);
        const n = Number(input.counted.pieces[key]) || 0;
        if (n > 0) q.push({ date: addDaysISO(d, -1), n });
      }
      // Past 4 days by tomorrow: thrown at the end of the day.
      const lastGood = addDaysISO(d, 1 - life);
      let goingOff = 0;
      while (q.length && q[0].date <= lastGood) goingOff += q.shift()!.n;
      if (planning) {
        day.rows[key] = {
          key, expected: round1(expected), onHand: Math.round(onHand), pieces, bags: pieces / bag,
          slow, tooSlow, daysPerBag: expected > 0 ? round1(bag / expected) : null, goingOff: Math.round(goingOff),
        };
      }
    }
    if (planning) days.push(day);
  }
  return days;
}

// ---- Building the input from what the app loads ----

export interface PlanSources {
  history: { date: string; pieces: Pieces | null }[];   // overview history (POS momos sold a day)
  forecast: { date: string; pieces: Pieces }[];         // overview forecast (today and the next 6 days)
  requests: Record<string, any>[];                      // this store's stock requests
  wastage?: { date: string; wastage: Pieces }[];
  counted?: { date: string; pieces: Pieces } | null;
}

const SENT = ['shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
const SKIP = ['rejected', 'cancelled'];

/** Pieces a request really sent: the shipped count once it went through the ship step, else what was asked. */
export const sentPieces = (r: Record<string, any>, key: string) => {
  const s = r?.shippedQuantities?.[key];
  return Number(s !== undefined && s !== null ? s : r?.[key]) || 0;
};

/**
 * `useAsked`: plan days the store has already asked for keep what it asked (what went, once sent).
 * Production plans use it; the store's own Bunny fill doesn't, or it would only echo its request.
 */
export function planInput(src: PlanSources, keys: string[], firstPlanDay: string, lastPlanDay: string, useAsked = true): PlanInput {
  const delivered: ByDate = {};
  const fixed: ByDate = {};
  for (const r of src.requests) {
    if (!r.requestDate || SKIP.includes(r.status)) continue;
    const sent = SENT.includes(r.status);
    const target = r.requestDate >= firstPlanDay ? (useAsked ? fixed : null) : sent ? delivered : null;
    if (!target) continue;
    const day = (target[r.requestDate] ||= {});
    for (const key of keys) day[key] = (day[key] || 0) + (sent ? sentPieces(r, key) : Number(r[key]) || 0);
  }
  const sold: ByDate = {};
  for (const h of src.history) if (h.pieces) sold[h.date] = h.pieces;
  const expected: ByDate = {};
  for (const f of src.forecast) expected[f.date] = f.pieces;
  const wasted: ByDate = {};
  for (const w of src.wastage || []) {
    const day = (wasted[w.date] ||= {});
    for (const [k, n] of Object.entries(w.wastage || {})) day[k] = (day[k] || 0) + (Number(n) || 0);
  }
  return { keys, firstPlanDay, lastPlanDay, delivered, sold, expected, wasted, counted: src.counted || null, fixed };
}

/** Pieces per type to send on each plan day, added up over the stores a production house supplies. */
export function sumPlans(plans: PlanDay[][]): { date: string; need: Record<string, number> }[] {
  const out = new Map<string, Record<string, number>>();
  for (const plan of plans) for (const day of plan) {
    const need = out.get(day.date) || {};
    for (const row of Object.values(day.rows)) need[row.key] = (need[row.key] || 0) + row.pieces;
    out.set(day.date, need);
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, need]) => ({ date, need }));
}
