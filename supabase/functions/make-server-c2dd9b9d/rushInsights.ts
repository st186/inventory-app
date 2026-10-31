// Rush hours and the steamer plan (owner, 1 Nov 2026: "which time of the day we have the most running
// orders, demand of certain momos during rush hours, defining rush hours and predicting future rush
// hours and i want steam momos to be served within 2 minutes of order but ... they dont keep momos in
// the steamer because keeping for long damages them ... at the right time if we get the insight we can
// plan better"). From the bills (order-item-detail, Step D of the POS sync; to the minute where
// order-times has the time, else the middle of the hour) and the 3-minute live-orders looks.
// index.ts GET /insights/rush puts it together for the Insights > Rush hours tab.

export const SLOT_MIN = 15;
export const DAY_FROM = 15 * 60; // the stores open at 3 PM
export const DAY_TO = 23 * 60; // the last orders come in by 11 PM
export const SLOTS = (DAY_TO - DAY_FROM) / SLOT_MIN;
export const slotLabel = (i: number) => {
  const m = DAY_FROM + i * SLOT_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const slotOf = (min: number) => {
  const i = Math.floor((min - DAY_FROM) / SLOT_MIN);
  return i >= 0 && i < SLOTS ? i : -1;
};

// ---- Dishes ----
export const FILLINGS = ['chicken', 'chicken_cheese', 'veg', 'paneer', 'corn_cheese'] as const;
export type Filling = typeof FILLINGS[number];
export type Style = 'steamed' | 'pan_fried' | 'afghani' | 'makhni' | 'fried' | 'kurkure' | 'peri_peri' | 'chilli' | 'korean' | 'garlic' | 'other';
/** Dishes made from steamed momos: served steamed, pan fried after steaming, or steamed then in a
 *  sauce (Afghani, butter makhni). Fried, kurkure, peri peri fried, chilli, Korean and hot garlic go
 *  through the fryer. The owner can say otherwise. */
export const STEAMER_STYLES: Style[] = ['steamed', 'pan_fried', 'afghani', 'makhni'];
export type Dish = { pieces: Partial<Record<Filling, number>>; style: Style; steamer: boolean; kind: 'momos' | 'meal' | 'platter' | 'combo' };

function fillingOf(s: string): Filling | null {
  if (/non[\s-]*veg/.test(s)) return 'chicken';
  if (/chicken\s*cheese/.test(s)) return 'chicken_cheese';
  if (/corn\s*cheese|cheese\s*corn/.test(s)) return 'corn_cheese';
  if (/paneer/.test(s)) return 'paneer';
  if (/\bveg\b/.test(s)) return 'veg';
  if (/chicken|non\s*veg/.test(s)) return 'chicken';
  return null;
}

function styleOf(s: string): Style {
  if (/kurkure/.test(s)) return 'kurkure';
  if (/pan[\s-]*fried/.test(s)) return 'pan_fried';
  if (/peri\s*peri?/.test(s)) return 'peri_peri';
  if (/butter\s*fried/.test(s)) return 'fried';
  if (/makh?ani|makhni/.test(s)) return 'makhni';
  if (/afghani/.test(s)) return 'afghani';
  if (/korean/.test(s)) return 'korean';
  if (/garlic/.test(s)) return 'garlic';
  if (/chilli/.test(s)) return 'chilli';
  if (/fried/.test(s)) return 'fried';
  if (/steam/.test(s)) return 'steamed';
  return 'other';
}

/** What a bill line means in momos: how many pieces of which filling, made how. Not momos (drinks,
 *  burgers): null. */
export function parseDish(name: string): Dish | null {
  const s = name.toLowerCase().replace(/\s*-\s*o\.?\s*$/, '');
  // Momo burgers aren't counted as momos; a Mania combo's momos are (its burgers aren't).
  if (!(/momo/.test(s) || /\bmeal\b/.test(s)) || (/burger/.test(s) && !/combo/.test(s))) return null;
  const style = styleOf(s);
  const steamer = STEAMER_STYLES.includes(style);
  const count = (re: RegExp) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  if (/platter/.test(s)) {
    const total = count(/(\d+)\s*pc/) || 12;
    if (/veg\s*mix/.test(s)) { const third = total / 3; return { pieces: { veg: third, paneer: third, corn_cheese: third }, style, steamer, kind: 'platter' }; }
    if (/chicken\s*mix|non[\s-]*veg/.test(s)) return { pieces: { chicken: total / 2, chicken_cheese: total / 2 }, style, steamer, kind: 'platter' };
    const f = fillingOf(s);
    return f ? { pieces: { [f]: total }, style, steamer, kind: 'platter' } : null;
  }
  const inBrackets = /\(([^)]*)\)/.exec(s)?.[1] || '';
  const f = fillingOf(/meal/.test(s) && fillingOf(inBrackets) ? inBrackets : s);
  if (!f) return null;
  if (/combo/.test(s)) return { pieces: { [f]: count(/(\d+)\s*pc\s*momos?/) || 8 }, style, steamer, kind: 'combo' };
  if (/meal/.test(s)) return { pieces: { [f]: 6 }, style, steamer, kind: 'meal' };
  return { pieces: { [f]: count(/\[(\d+)\s*pieces?\]/) || count(/\((\d+)\s*pcs?\)/) || 6 }, style, steamer, kind: 'momos' };
}

// ---- Orders ----
export type Channel = 'counter' | 'zomato' | 'swiggy';
export type Order = { min: number; exact: boolean; channel: Channel; dishes: { dish: Dish; qty: number; name: string }[] };
export type Day = { date: string; weekday: number; orders: Order[] };

/** One stored day (order-item-detail) as orders, with exact minutes where order-times has them. */
export function ordersOfDay(record: { date: string; orders?: any[] }, minutes: Record<string, number> = {}): Day {
  const orders: Order[] = [];
  for (const o of record.orders || []) {
    const exactMin = minutes[String(o?.orderId)] ?? (Number.isFinite(o?.entryMin) ? Number(o.entryMin) : null);
    const hour = Number(o?.orderHourIST);
    const min = exactMin ?? (Number.isFinite(hour) ? hour * 60 + 30 : null);
    if (min === null) continue;
    const pm = String(o?.paymentMode || '').toLowerCase();
    const channel: Channel = o?.orderType === 'HomeDelivery' ? (pm.includes('swiggy') ? 'swiggy' : 'zomato') : 'counter';
    const dishes = (o?.rawItems || [])
      .filter((i: any) => i?.categoryName !== 'Addon')
      .map((i: any) => ({ dish: parseDish(String(i?.productName || '')), qty: Number(i?.quantity) || 0, name: String(i?.productName || '').replace(/\s*-\s*O\.?\s*$/i, '').trim() }))
      .filter((x: any) => x.dish && x.qty > 0);
    orders.push({ min, exact: exactMin !== null, channel, dishes });
  }
  return { date: record.date, weekday: new Date(`${record.date}T00:00:00Z`).getUTCDay(), orders };
}

const zeros = () => new Array(SLOTS).fill(0);
const plates = (d: Dish, qty: number, f: Filling) => ((d.pieces[f] || 0) * qty) / 6;

export type WeekdayProfile = {
  weekday: number; days: number;
  /** Average orders in each 15-minute slot, and the busier-day level (80th percentile) */
  orders: number[]; high: number[];
  /** Average steamer plates (6 momos) of each filling in each slot */
  steamer: Record<Filling, number[]>;
  channels: Record<Channel, number[]>;
  ordersPerDay: number;
  rush: RushWindow[];
};
export type RushWindow = { from: string; to: string; ordersPerHour: number };

function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
}

/** Slots busier than usual: at least 1.4 times the day's average slot and 1.5 orders in the 15
 *  minutes. Next-door rush slots join into one window. */
export function rushWindows(orders: number[]): RushWindow[] {
  const open = orders.filter((x) => x >= 0.2);
  if (!open.length) return [];
  const mean = open.reduce((a, b) => a + b, 0) / open.length;
  const line = Math.max(1.5, 1.4 * mean);
  const windows: RushWindow[] = [];
  let start = -1;
  for (let i = 0; i <= SLOTS; i++) {
    const busy = i < SLOTS && orders[i] >= line;
    if (busy && start < 0) start = i;
    if (!busy && start >= 0) {
      const slice = orders.slice(start, i);
      windows.push({ from: slotLabel(start), to: slotLabel(i), ordersPerHour: Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 4 * 10) / 10 });
      start = -1;
    }
  }
  return windows;
}

/** Each weekday's day: when the orders come, what steamed momos go out, which channel. Days with
 *  fewer than 5 orders (closed, or the POS didn't sync) are left out. */
export function weekdayProfiles(days: Day[]): WeekdayProfile[] {
  const out: WeekdayProfile[] = [];
  for (let w = 0; w < 7; w++) {
    const list = days.filter((d) => d.weekday === w && d.orders.length >= 5);
    const perDay = list.map((d) => {
      const o = zeros();
      const st = Object.fromEntries(FILLINGS.map((f) => [f, zeros()])) as Record<Filling, number[]>;
      const ch: Record<Channel, number[]> = { counter: zeros(), zomato: zeros(), swiggy: zeros() };
      for (const ord of d.orders) {
        // An order known only to the hour counts a quarter in each of its hour's four 15 minutes
        // (all of it at :30 made a false spike: "15 chicken plates at 7:30", 1 Nov 2026).
        const hourStart = Math.floor(ord.min / 60) * 60;
        const parts = ord.exact ? [[slotOf(ord.min), 1]] : [0, 15, 30, 45].map((m) => [slotOf(hourStart + m), 0.25]);
        for (const [i, w] of parts) {
          if (i < 0) continue;
          o[i] += w;
          ch[ord.channel][i] += w;
          for (const x of ord.dishes) if (x.dish.steamer) for (const f of FILLINGS) st[f][i] += plates(x.dish, x.qty, f) * w;
        }
      }
      return { o, st, ch, total: d.orders.length };
    });
    const n = perDay.length;
    const avg = (pick: (p: typeof perDay[number]) => number[]) => zeros().map((_, i) => (n ? perDay.reduce((s, p) => s + pick(p)[i], 0) / n : 0));
    const orders = avg((p) => p.o);
    out.push({
      weekday: w, days: n, orders,
      high: zeros().map((_, i) => percentile(perDay.map((p) => p.o[i]), 0.8)),
      steamer: Object.fromEntries(FILLINGS.map((f) => [f, avg((p) => p.st[f])])) as Record<Filling, number[]>,
      channels: { counter: avg((p) => p.ch.counter), zomato: avg((p) => p.ch.zomato), swiggy: avg((p) => p.ch.swiggy) },
      ordersPerDay: n ? perDay.reduce((s, p) => s + p.total, 0) / n : 0,
      rush: rushWindows(orders),
    });
  }
  return out;
}

/** What goes out in the rush against the rest of the day: momos by filling and by how they're made,
 *  and the dishes most ordered in the rush. */
export function rushMix(days: Day[], profiles: WeekdayProfile[]) {
  const inRush = (weekday: number, min: number) => {
    const label = slotLabel(slotOf(min));
    return profiles[weekday]?.rush.some((r) => label >= r.from && label < r.to) || false;
  };
  const blank = () => ({ orders: 0, pieces: 0, byFilling: Object.fromEntries(FILLINGS.map((f) => [f, 0])) as Record<Filling, number>, byStyle: {} as Partial<Record<Style, number>>, steamerPieces: 0 });
  const rush = blank(), other = blank();
  const dishes = new Map<string, number>();
  for (const d of days) {
    for (const o of d.orders) {
      if (slotOf(o.min) < 0) continue;
      const r = inRush(d.weekday, o.min);
      const b = r ? rush : other;
      b.orders++;
      for (const x of o.dishes) {
        const pcs = FILLINGS.reduce((s, f) => s + (x.dish.pieces[f] || 0) * x.qty, 0);
        b.pieces += pcs;
        for (const f of FILLINGS) b.byFilling[f] += (x.dish.pieces[f] || 0) * x.qty;
        b.byStyle[x.dish.style] = (b.byStyle[x.dish.style] || 0) + pcs;
        if (x.dish.steamer) b.steamerPieces += pcs;
        if (r) dishes.set(x.name, (dishes.get(x.name) || 0) + x.qty);
      }
    }
  }
  const top = [...dishes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name, qty }));
  return { rush, other, top };
}

// ---- Looking ahead ----
/** Recent same weekdays against all of them (the last 3 against the window), kept between 0.7 and 1.4. */
export function trendFactor(days: Day[], weekday: number): number {
  const list = days.filter((d) => d.weekday === weekday && d.orders.length >= 5).sort((a, b) => a.date.localeCompare(b.date));
  if (list.length < 4) return 1;
  const mean = (xs: Day[]) => xs.reduce((s, d) => s + d.orders.length, 0) / xs.length;
  return Math.min(1.4, Math.max(0.7, mean(list.slice(-3)) / mean(list)));
}

export type DayForecast = { date: string; weekday: number; factor: number; orders: number[]; totalOrders: number; rush: RushWindow[] };
export function forecastDays(days: Day[], profiles: WeekdayProfile[], dates: string[]): DayForecast[] {
  return dates.map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const factor = trendFactor(days, weekday);
    const orders = profiles[weekday].orders.map((x) => x * factor);
    return { date, weekday, factor, orders, totalOrders: Math.round(profiles[weekday].ordersPerDay * factor), rush: rushWindows(orders) };
  });
}

// ---- The steamer plan ----
export type SteamerSettings = { steamMin: number; holdMin: number; serviceLevel: number };
export const DEFAULT_STEAMER: SteamerSettings = { steamMin: 12, holdMin: 15, serviceLevel: 0.8 };

/** The fewest plates to have ready so that, this often, every order in the window is served from
 *  them (Poisson). */
export function plateBuffer(mean: number, level: number): number {
  if (mean <= 0) return 0;
  let k = 0, p = Math.exp(-mean), cdf = p;
  while (cdf < level && k < 50) { k++; p *= mean / k; cdf += p; }
  return k;
}

export type SteamerSlot = { slot: string; orders: number; plates: Record<Filling, number>; keep: Record<Filling, number>; startAt: string };
/** One filling's stretch of keeping plates ready: from..to, the usual number (median), and the busy
 *  part peakFrom..peakTo needing peakLow..keep plates. A gap of 15 minutes inside doesn't break it. */
export type SteamerRun = { filling: Filling; from: string; to: string; keep: number; usual: number; peakLow: number; peakFrom: string; peakTo: string; firstBatchAt: string; batches: number };

/** For a day: in each 15 minutes, how many steamer plates of each filling to expect, and how many to
 *  have ready so a steamed order goes out within the 2 minutes - never more than will go in the time
 *  momos stay good (holdMin). Below about a third of a plate in that time, steam to order instead.
 *  Each batch goes in steamMin before it is needed. */
export function steamerPlan(profile: WeekdayProfile, factor: number, settings: SteamerSettings = DEFAULT_STEAMER) {
  const hold = Math.max(SLOT_MIN, settings.holdMin);
  const toClock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const slots: SteamerSlot[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const p = Object.fromEntries(FILLINGS.map((f) => [f, profile.steamer[f][i] * factor])) as Record<Filling, number>;
    const keep = Object.fromEntries(FILLINGS.map((f) => {
      const inHold = p[f] * (hold / SLOT_MIN);
      return [f, inHold < 0.35 ? 0 : plateBuffer(inHold, settings.serviceLevel)];
    })) as Record<Filling, number>;
    slots.push({ slot: slotLabel(i), orders: profile.orders[i] * factor, plates: p, keep, startAt: toClock(DAY_FROM + i * SLOT_MIN - settings.steamMin) });
  }
  const runs: SteamerRun[] = [];
  for (const f of FILLINGS) {
    let start = -1, lastOn = -1;
    for (let i = 0; i <= SLOTS; i++) {
      const on = i < SLOTS && slots[i].keep[f] > 0;
      if (on) {
        if (start < 0) start = i;
        lastOn = i;
        continue;
      }
      // One quiet 15 minutes between two busy ones stays in the stretch.
      if (start >= 0 && (i >= SLOTS || i - lastOn > 1 || !(i + 1 < SLOTS && slots[i + 1].keep[f] > 0))) {
        const end = lastOn + 1;
        const span = slots.slice(start, end).map((s) => s.keep[f]);
        const keep = Math.max(...span);
        const busy = span.filter((k) => k > 0).sort((a, b) => a - b);
        // The busy part: around the most, every 15 minutes needing at least 70% of it.
        const near = Math.ceil(keep * 0.7);
        let peakStart = start + span.indexOf(keep), peakEnd = peakStart;
        while (peakStart - 1 >= start && slots[peakStart - 1].keep[f] >= near) peakStart--;
        while (peakEnd + 1 < end && slots[peakEnd + 1].keep[f] >= near) peakEnd++;
        runs.push({
          filling: f, from: slotLabel(start), to: slotLabel(end), keep, usual: busy[Math.floor((busy.length - 1) / 2)],
          peakLow: Math.min(...slots.slice(peakStart, peakEnd + 1).map((s) => s.keep[f])),
          peakFrom: slotLabel(peakStart), peakTo: slotLabel(peakEnd + 1),
          firstBatchAt: slots[start].startAt, batches: Math.ceil(((end - start) * SLOT_MIN) / hold),
        });
        start = -1;
      }
    }
  }
  runs.sort((a, b) => a.from.localeCompare(b.from) || FILLINGS.indexOf(a.filling) - FILLINGS.indexOf(b.filling));
  return { settings: { ...settings, holdMin: hold }, slots, runs };
}

// ---- "Steam now" to the store (owner, 1 Nov 2026: yes to a push before each predicted rush) ----
export type SteamNudge = { at: string; title: string; message: string };
const FILLING_NAME: Record<Filling, string> = { chicken: 'chicken', chicken_cheese: 'chicken cheese', veg: 'veg', paneer: 'paneer', corn_cheese: 'corn cheese' };
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const clock12 = (hhmm: string) => { const m = toMin(hhmm), h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

/** At most two pushes a day, each steamMin before it's needed: the rush (every filling's plates for
 *  the main filling's busy part), and, when the main filling needs plates ready well before that
 *  (half an hour or more, from 4 PM), getting ready for it. Nothing on a day without a real rush
 *  (fewer than 2 plates at the most). */
export function steamNudges(plan: ReturnType<typeof steamerPlan>): SteamNudge[] {
  const { steamMin, holdMin } = plan.settings;
  if (!plan.runs.length) return [];
  const main = [...plan.runs].sort((a, b) => b.keep - a.keep)[0];
  if (main.keep < 2) return [];
  const plates = (n: number) => `${n} plate${n > 1 ? 's' : ''}`;
  const inPeak = plan.runs
    .filter((r) => r.from < main.peakTo && r.to > main.peakFrom)
    .sort((a, b) => b.keep - a.keep || FILLINGS.indexOf(a.filling) - FILLINGS.indexOf(b.filling));
  const list = inPeak.map((r) => `${r.keep} ${FILLING_NAME[r.filling]}`).join(', ');
  const nudges: SteamNudge[] = [{
    at: toHHMM(toMin(main.peakFrom) - steamMin),
    title: `Rush at ${clock12(main.peakFrom)}: steam now`,
    message: `Put ${list} plates in the steamer now, ready by ${clock12(main.peakFrom)}. A fresh batch every ${holdMin} min till ${clock12(main.peakTo)} - steamed orders go out within 2 minutes.`,
  }];
  const readyAt = toMin(main.from) - steamMin;
  if (main.usual >= 1 && main.from >= '16:00' && toMin(nudges[0].at) - readyAt >= 30) {
    nudges.unshift({
      at: toHHMM(readyAt),
      title: `Steam now for ${clock12(main.from)}`,
      message: `Keep ${plates(main.usual)} of ${FILLING_NAME[main.filling]} steamed momos ready from ${clock12(main.from)}, a fresh batch every ${holdMin} min. The rush starts at ${clock12(main.peakFrom)}.`,
    });
  }
  return nudges;
}
