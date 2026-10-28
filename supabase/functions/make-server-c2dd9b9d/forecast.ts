// Demand forecast, request suggestions, production plan and purchase list - plain statistics,
// no AI. Mirrored byte-for-byte at supabase/functions/make-server-c2dd9b9d/forecast.ts so the
// server (daily brief, Ask Bunny) works from the same numbers as the cards: keep both copies
// identical. No imports, so the file runs unchanged in the browser and in Deno.
//
// How a day is forecast, per momo type and for revenue:
// 1. Baseline = 60% median of the last 4 same weekdays + 40% median of the last 8, using only
//    normal open days (no festival or event, not closed) with real data. A type that ran out
//    that day is left out for that type, since its sales understate demand.
// 2. A festival or event day gets a multiplier for its effect. Learned from past days marked
//    the same way in the calendar (actual / baseline), blended with a starting default while
//    there are few examples. Non-veg and veg move separately on "no non-veg" days.
// 3. Scaled by how far the last 14 open days ran above or below their own baselines, so a
//    rising or falling month is caught up (recentLevel).
// 4. A day whose per-type counts exactly repeat the day before is treated as a stale POS sync
//    and its counts are ignored (its revenue still counts).
//
// Checking and tuning (backtest, tuneSettings): every past day is forecast again using only
// what was known before it and compared with what actually sold. The weight on the last 4
// weeks (step 1) and how strongly the recent level is followed (step 3) are then picked from a
// small grid by which would have missed least over the last 8 weeks.

export type MomoKey = 'chicken' | 'chickenCheese' | 'veg' | 'cheeseCorn' | 'paneer' | 'vegKurkure' | 'chickenKurkure';

export const FORECAST_TYPES: { key: MomoKey; label: string; salesKey: string; veg: boolean; bag: number }[] = [
  { key: 'chicken', label: 'Chicken', salesKey: 'Chicken Momos', veg: false, bag: 50 },
  { key: 'chickenCheese', label: 'Chicken Cheese', salesKey: 'Chicken Cheese Momos', veg: false, bag: 20 },
  { key: 'chickenKurkure', label: 'Chicken Kurkure', salesKey: 'Chicken Kurkure Momos', veg: false, bag: 20 },
  { key: 'veg', label: 'Veg', salesKey: 'Veg Momos', veg: true, bag: 20 },
  { key: 'cheeseCorn', label: 'Cheese Corn', salesKey: 'Corn Cheese Momos', veg: true, bag: 20 },
  { key: 'paneer', label: 'Paneer', salesKey: 'Paneer Momos', veg: true, bag: 20 },
  { key: 'vegKurkure', label: 'Veg Kurkure', salesKey: 'Veg Kurkure Momos', veg: true, bag: 20 },
];

export type DayEffect = 'normal' | 'closed' | 'low_nonveg' | 'busy' | 'quiet';

export const DAY_EFFECTS: { id: DayEffect; label: string; hint: string }[] = [
  { id: 'low_nonveg', label: 'Few eat non-veg', hint: 'Puja or fasting day - chicken sells far less' },
  { id: 'busy', label: 'Busier than usual', hint: 'Festival crowd, fair, match day' },
  { id: 'quiet', label: 'Quieter than usual', hint: 'Exams, heavy rain, people away' },
  { id: 'closed', label: 'Store closed', hint: 'No sales - left out of the averages' },
  { id: 'normal', label: 'Normal day', hint: 'Marked, but no effect expected' },
];

export interface CalendarEvent {
  date: string;
  name: string;
  effect: DayEffect;
  note?: string;
  confirmed?: boolean;
  source?: 'owner' | 'ai';
}

export interface DayRecord {
  date: string;
  revenue: number | null; // counter + online through the POS, Rs
  pieces: Partial<Record<MomoKey, number>> | null; // momos sold per type
  stockedOut?: MomoKey[]; // types that ran out that day
}

export interface ForecastDay {
  date: string;
  weekday: string;
  event?: CalendarEvent;
  revenue: number;
  revenueLow: number;
  revenueHigh: number;
  pieces: Record<MomoKey, number>;
  vegPieces: number;
  nonVegPieces: number;
  basis: string;
}

const DAY_MS = 86400000;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const addDaysISO = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const totalPieces = (p: Partial<Record<MomoKey, number>> | null) =>
  p ? FORECAST_TYPES.reduce((t, ty) => t + (p[ty.key] || 0), 0) : 0;

interface PreparedDay extends DayRecord {
  effect: DayEffect;
  closed: boolean;
}

// Days keyed by date, with stale per-type copies dropped and closed days flagged.
export function prepareHistory(days: DayRecord[], events: Map<string, CalendarEvent>): Map<string, PreparedDay> {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map<string, PreparedDay>();
  let prev: DayRecord | null = null;
  for (const d of sorted) {
    let pieces = d.pieces;
    if (pieces && prev?.pieces && prev.date === addDaysISO(d.date, -1) && totalPieces(pieces) > 0
      && FORECAST_TYPES.every((t) => (pieces![t.key] || 0) === (prev!.pieces![t.key] || 0))) {
      pieces = null;
    }
    const effect = events.get(d.date)?.effect || 'normal';
    const closed = effect === 'closed' || ((d.revenue || 0) <= 0 && totalPieces(d.pieces) <= 0);
    out.set(d.date, { ...d, pieces, effect, closed });
    prev = d;
  }
  return out;
}

type Metric = (d: PreparedDay) => number | null;

// The two knobs the self-check tunes (see backtest / tuneSettings below).
export interface ForecastSettings {
  recentWeight: number; // weight on the last 4 same weekdays against the last 8
  levelStrength: number; // how much of the recent above/below-normal level is followed
}
export const DEFAULT_SETTINGS: ForecastSettings = { recentWeight: 0.6, levelStrength: 0.7 };

// Same-weekday baseline for one metric as of `asOf` (only days before it count).
function baseline(hist: Map<string, PreparedDay>, target: string, asOf: string, metric: Metric, recentWeight = DEFAULT_SETTINGS.recentWeight) {
  const values: number[] = [];
  // Same weekdays only: the latest one before asOf, then a week at a time (10 weeks back).
  const first = ((weekdayOf(asOf) - weekdayOf(target) + 7) % 7) || 7;
  for (let back = first; back <= 70 && values.length < 8; back += 7) {
    const date = addDaysISO(asOf, -back);
    const d = hist.get(date);
    if (!d || d.closed || d.effect !== 'normal') continue;
    const v = metric(d);
    if (v === null || Number.isNaN(v)) continue;
    values.push(v);
  }
  if (values.length === 0) return null;
  const recent = median(values.slice(0, 4))!;
  const long = median(values)!;
  const value = values.length >= 4 ? recentWeight * recent + (1 - recentWeight) * long : recent;
  const spread = long > 0 ? median(values.map((v) => Math.abs(v - long)))! / long : 0.25;
  return { value, spread, samples: values.length };
}

const pieceMetric = (k: MomoKey): Metric => (d) =>
  !d.pieces || d.stockedOut?.includes(k) ? null : (d.pieces[k] || 0);
const revenueMetric: Metric = (d) => (d.revenue && d.revenue > 0 ? d.revenue : null);
const groupMetric = (veg: boolean): Metric => (d) => {
  if (!d.pieces) return null;
  return FORECAST_TYPES.filter((t) => t.veg === veg).reduce((s, t) => s + (d.pieces![t.key] || 0), 0);
};

const DEFAULT_MULTIPLIER: Record<Exclude<DayEffect, 'normal' | 'closed'>, { revenue: number; veg: number; nonVeg: number }> = {
  low_nonveg: { revenue: 0.55, veg: 1.1, nonVeg: 0.5 },
  busy: { revenue: 1.3, veg: 1.3, nonVeg: 1.3 },
  quiet: { revenue: 0.75, veg: 0.75, nonVeg: 0.75 },
};

export interface EffectLearning {
  effect: DayEffect;
  samples: { date: string; name: string; revenueRatio: number | null; vegRatio: number | null; nonVegRatio: number | null }[];
  multiplier: { revenue: number; veg: number; nonVeg: number };
}

// What each kind of event day did in the past, against that day's normal baseline.
export function learnEffects(hist: Map<string, PreparedDay>, events: Map<string, CalendarEvent>, asOf: string): Record<string, EffectLearning> {
  const out: Record<string, EffectLearning> = {};
  for (const effect of Object.keys(DEFAULT_MULTIPLIER) as (keyof typeof DEFAULT_MULTIPLIER)[]) {
    const samples: EffectLearning['samples'] = [];
    for (const ev of events.values()) {
      if (ev.effect !== effect || ev.date >= asOf) continue;
      const d = hist.get(ev.date);
      if (!d || d.closed) continue;
      const ratio = (m: Metric) => {
        const b = baseline(hist, ev.date, ev.date, m);
        const v = m(d);
        return b && b.value > 0 && v !== null ? v / b.value : null;
      };
      samples.push({ date: ev.date, name: ev.name, revenueRatio: ratio(revenueMetric), vegRatio: ratio(groupMetric(true)), nonVegRatio: ratio(groupMetric(false)) });
    }
    const def = DEFAULT_MULTIPLIER[effect];
    const blend = (key: 'revenueRatio' | 'vegRatio' | 'nonVegRatio', fallback: number) => {
      const xs = samples.map((s) => s[key]).filter((x): x is number => x !== null);
      if (xs.length === 0) return fallback;
      const w = xs.length / (xs.length + 1);
      return w * (xs.reduce((a, b) => a + b, 0) / xs.length) + (1 - w) * fallback;
    };
    out[effect] = { effect, samples, multiplier: { revenue: blend('revenueRatio', def.revenue), veg: blend('vegRatio', def.veg), nonVeg: blend('nonVegRatio', def.nonVeg) } };
  }
  return out;
}

// How far recent days have run above or below their own weekday baselines (last 14 open,
// normal days): the weekday medians lag a rising or falling month, this catches them up.
// Followed at `strength` (70% by default) and kept between 0.8 and 1.3.
export function recentLevel(hist: Map<string, PreparedDay>, asOf: string, strength = DEFAULT_SETTINGS.levelStrength): number {
  let actual = 0;
  let expected = 0;
  for (let back = 1; back <= 14; back++) {
    const date = addDaysISO(asOf, -back);
    const d = hist.get(date);
    if (!d || d.closed || d.effect !== 'normal' || !d.revenue) continue;
    const b = baseline(hist, date, date, revenueMetric);
    if (!b || b.value <= 0) continue;
    actual += d.revenue;
    expected += b.value;
  }
  if (expected <= 0) return 1;
  const raw = Math.min(1.3, Math.max(0.8, actual / expected));
  return 1 + strength * (raw - 1);
}

function forecastOne(
  hist: Map<string, PreparedDay>, events: Map<string, CalendarEvent>, learned: Record<string, EffectLearning>,
  level: number, date: string, asOf: string, settings: ForecastSettings,
): ForecastDay {
  const event = events.get(date);
  const effect = event?.effect || 'normal';
  const mult = effect === 'closed' ? { revenue: 0, veg: 0, nonVeg: 0 }
    : effect === 'normal' ? { revenue: 1, veg: 1, nonVeg: 1 }
    : learned[effect].multiplier;
  const rev = baseline(hist, date, asOf, revenueMetric, settings.recentWeight);
  const pieces = {} as Record<MomoKey, number>;
  let veg = 0;
  let nonVeg = 0;
  for (const t of FORECAST_TYPES) {
    const b = baseline(hist, date, asOf, pieceMetric(t.key), settings.recentWeight);
    const n = Math.round((b?.value || 0) * level * (t.veg ? mult.veg : mult.nonVeg));
    pieces[t.key] = n;
    if (t.veg) veg += n; else nonVeg += n;
  }
  const revenue = Math.round((rev?.value || 0) * level * mult.revenue);
  const spread = Math.min(0.4, Math.max(0.1, rev?.spread ?? 0.25));
  const basis = effect === 'closed'
    ? 'Marked closed'
    : `${rev?.samples || 0} recent ${WEEKDAY_SHORT[weekdayOf(date)]}s${Math.abs(level - 1) >= 0.03 ? `, recent sales ${level > 1 ? '+' : ''}${Math.round((level - 1) * 100)}%` : ''}${event && effect !== 'normal' ? `, adjusted for ${event.name}` : ''}`;
  return {
    date,
    weekday: WEEKDAY_SHORT[weekdayOf(date)],
    event,
    revenue,
    revenueLow: Math.round(revenue * (1 - spread)),
    revenueHigh: Math.round(revenue * (1 + spread)),
    pieces,
    vegPieces: veg,
    nonVegPieces: nonVeg,
    basis,
  };
}

// Forecast `count` days from `start`, using history before `asOf` (normally today).
export function forecastDays(days: DayRecord[], eventList: CalendarEvent[], start: string, count: number, asOf: string, settings: ForecastSettings = DEFAULT_SETTINGS): ForecastDay[] {
  const events = new Map(eventList.map((e) => [e.date, e]));
  const hist = prepareHistory(days, events);
  const learned = learnEffects(hist, events, asOf);
  const level = recentLevel(hist, asOf, settings.levelStrength);
  const result: ForecastDay[] = [];
  for (let i = 0; i < count; i++) result.push(forecastOne(hist, events, learned, level, addDaysISO(start, i), asOf, settings));
  return result;
}

// ---------------- How good the forecast is ----------------

export interface BacktestDay {
  date: string;
  weekday: string;
  eventName?: string;
  effect: DayEffect;
  forecast: number;
  actual: number;
  error: number; // (forecast - actual) / actual: +0.2 = forecast 20% too high
  forecastPieces: number;
  actualPieces: number | null;
  piecesError: number | null;
  stockedOut: boolean;
}

// Forecast each open day from `from` to `to` again, as it would have been made the morning
// before that day (only earlier days count), and compare with what actually sold.
export function backtest(days: DayRecord[], eventList: CalendarEvent[], from: string, to: string, settings: ForecastSettings = DEFAULT_SETTINGS): BacktestDay[] {
  const events = new Map(eventList.map((e) => [e.date, e]));
  const hist = prepareHistory(days, events);
  const out: BacktestDay[] = [];
  for (let date = from; date <= to; date = addDaysISO(date, 1)) {
    const d = hist.get(date);
    if (!d || d.closed || !d.revenue || d.revenue <= 0) continue;
    const f = forecastOne(hist, events, learnEffects(hist, events, date), recentLevel(hist, date, settings.levelStrength), date, date, settings);
    if (f.revenue <= 0) continue;
    const forecastPieces = f.vegPieces + f.nonVegPieces;
    const actualPieces = d.pieces ? totalPieces(d.pieces) : null;
    out.push({
      date,
      weekday: f.weekday,
      eventName: events.get(date)?.name,
      effect: d.effect,
      forecast: f.revenue,
      actual: d.revenue,
      error: (f.revenue - d.revenue) / d.revenue,
      forecastPieces,
      actualPieces,
      piecesError: actualPieces && forecastPieces ? (forecastPieces - actualPieces) / actualPieces : null,
      stockedOut: !!d.stockedOut?.length,
    });
  }
  return out;
}

export interface AccuracySummary {
  days: number;
  typicalMiss: number | null; // median |error|: half the days missed by less than this
  within15: number | null; // share of days within ±15%
  bias: number | null; // median error: + means the forecast tends to run high
  piecesTypicalMiss: number | null;
}

export function summarizeAccuracy(rows: BacktestDay[]): AccuracySummary {
  const abs = rows.map((r) => Math.abs(r.error));
  const pieces = rows.map((r) => r.piecesError).filter((x): x is number => x !== null).map(Math.abs);
  return {
    days: rows.length,
    typicalMiss: median(abs),
    within15: rows.length ? abs.filter((x) => x <= 0.15).length / rows.length : null,
    bias: median(rows.map((r) => r.error)),
    piecesTypicalMiss: median(pieces),
  };
}

// Pick the settings that would have missed least over the 8 weeks before `asOf`. Stays on the
// defaults unless another setting is clearly better (by 1.5 points), so one odd week can't
// swing it. Festival days are left out: they're the calendar's job, not these knobs'.
export function tuneSettings(days: DayRecord[], eventList: CalendarEvent[], asOf: string) {
  const from = addDaysISO(asOf, -56);
  const to = addDaysISO(asOf, -1);
  const score = (s: ForecastSettings) => {
    const rows = backtest(days, eventList, from, to, s).filter((r) => r.effect === 'normal');
    return rows.length ? rows.reduce((t, r) => t + Math.min(1, Math.abs(r.error)), 0) / rows.length : null;
  };
  const before = score(DEFAULT_SETTINGS);
  let best = { settings: DEFAULT_SETTINGS, score: before };
  for (const recentWeight of [0.4, 0.6, 0.8, 1]) {
    for (const levelStrength of [0, 0.35, 0.7, 1]) {
      const s = { recentWeight, levelStrength };
      const v = score(s);
      if (v !== null && (best.score === null || v < best.score)) best = { settings: s, score: v };
    }
  }
  const tuned = before !== null && best.score !== null && before - best.score >= 0.015;
  return { settings: tuned ? best.settings : DEFAULT_SETTINGS, tuned, before, after: tuned ? best.score : before };
}

export const roundUpToBag = (pieces: number, bag: number) => (pieces <= 0 ? 0 : Math.ceil(pieces / bag) * bag);

// What to ask production for: the day's expected sales plus a buffer, less what is likely left
// over from the last delivery, in whole bags.
export function suggestRequest(day: ForecastDay, carryover: Partial<Record<MomoKey, number>>, buffer = 0.15) {
  return FORECAST_TYPES.map((t) => {
    const expected = day.pieces[t.key] || 0;
    const carry = Math.max(0, Math.round(carryover[t.key] || 0));
    const raw = expected * (1 + buffer) - carry;
    const pieces = raw < 5 ? 0 : roundUpToBag(raw, t.bag);
    return { key: t.key, label: t.label, expected, carry, pieces, bags: pieces / t.bag };
  });
}

// Ingredients per momo (grams), from the SOP costing recipes (sop costing.json, 24 Oct 2026):
// 10 g dough wrapper; fillings chicken 20 g, chicken cheese 20 g, veg 15 g, cheese corn 16 g,
// paneer 18 g; kurkure adds 2.5 g batter + 3.5 g cornflake coating. PROVISIONAL until the
// trial batches - change these numbers when the measured recipes come back.
export const BOM_PER_PIECE: Record<MomoKey, Record<string, number>> = {
  chicken: { maida: 7.01, oil: 0.14, chicken: 6.47, onion: 11.21, butter: 0.81, garlic: 0.2, ginger: 0.2, coriander: 0.2, greenChilli: 0.24 },
  chickenCheese: { maida: 7.01, oil: 0.14, chicken: 5.55, onion: 9.63, butter: 0.69, cheese: 3.03, garlic: 0.17, ginger: 0.17, coriander: 0.17, greenChilli: 0.21 },
  chickenKurkure: { maida: 8.01, oil: 0.14, chicken: 6.43, onion: 11.15, butter: 0.8, cornflakes: 3.32, garlic: 0.2, ginger: 0.2, coriander: 0.2, greenChilli: 0.4 },
  veg: { maida: 7.01, oil: 0.14, cabbage: 10.93, carrot: 1.81, onion: 0.91, butter: 0.38, garlic: 0.15, ginger: 0.15, coriander: 0.23, greenChilli: 0.15 },
  vegKurkure: { maida: 8.01, oil: 0.14, cabbage: 10.86, carrot: 1.8, onion: 0.9, butter: 0.38, cornflakes: 3.32, garlic: 0.15, ginger: 0.15, coriander: 0.23, greenChilli: 0.27 },
  cheeseCorn: { maida: 7.01, oil: 0.14, corn: 3.88, cheese: 4.04, liquidCheese: 2.42, onion: 3.23, capsicum: 0.49, mayo: 0.81, butter: 0.49, coriander: 0.24, greenChilli: 0.24 },
  paneer: { maida: 7.01, oil: 0.14, paneer: 6.39, onion: 4.75, cabbage: 2.74, carrot: 1.28, capsicum: 0.55, butter: 0.73, garlic: 0.18, ginger: 0.18, coriander: 0.46, greenChilli: 0.37 },
};

// Rs per usable kg, from the same costing file's real purchase prices.
export const INGREDIENTS: Record<string, { label: string; pricePerKg: number }> = {
  chicken: { label: 'Chicken (usable weight)', pricePerKg: 247.6 },
  maida: { label: 'Maida', pricePerKg: 37 },
  onion: { label: 'Onion', pricePerKg: 61.9 },
  cabbage: { label: 'Cabbage', pricePerKg: 41.6 },
  carrot: { label: 'Carrot', pricePerKg: 69.3 },
  paneer: { label: 'Paneer', pricePerKg: 382.2 },
  cheese: { label: 'Cheese', pricePerKg: 477.5 },
  liquidCheese: { label: 'Liquid cheese', pricePerKg: 158 },
  corn: { label: 'Sweet corn', pricePerKg: 127.5 },
  butter: { label: 'Butter', pricePerKg: 527 },
  cornflakes: { label: 'Cornflakes (kurkure coating)', pricePerKg: 247 },
  capsicum: { label: 'Capsicum', pricePerKg: 131.8 },
  mayo: { label: 'Mayonnaise', pricePerKg: 106.6 },
  oil: { label: 'Refined oil', pricePerKg: 154.6 },
  garlic: { label: 'Garlic', pricePerKg: 254.1 },
  ginger: { label: 'Ginger', pricePerKg: 117.6 },
  greenChilli: { label: 'Green chilli', pricePerKg: 115.8 },
  coriander: { label: 'Coriander', pricePerKg: 202.5 },
};

// Raw material for a set of momos to make, largest spend first.
export function purchaseList(pieces: Partial<Record<MomoKey, number>>) {
  const grams: Record<string, number> = {};
  for (const t of FORECAST_TYPES) {
    const n = pieces[t.key] || 0;
    if (n <= 0) continue;
    for (const [ing, g] of Object.entries(BOM_PER_PIECE[t.key])) grams[ing] = (grams[ing] || 0) + g * n;
  }
  return Object.entries(grams)
    .map(([key, g]) => {
      const info = INGREDIENTS[key] || { label: key, pricePerKg: 0 };
      const kg = Math.round((g / 1000) * 10) / 10;
      return { key, label: info.label, kg, amount: Math.round((g / 1000) * info.pricePerKg) };
    })
    .filter((r) => r.kg > 0)
    .sort((a, b) => b.amount - a.amount);
}
