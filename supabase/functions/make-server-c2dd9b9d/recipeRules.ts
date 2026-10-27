// Recipe capture maths (owner, 27 Oct 2026): each recipe is made the usual way three times and
// weighed; the average of the three becomes the standard (quantities per batch and per kg,
// yield, portion weight) once the owner approves it, and its cost comes from the business's
// own purchase prices (priceRules.ts). Method: SOP 02 section D - yield % = output / input,
// spread = (highest - lowest) / average, more than 10% on yield, portion, time or a main
// ingredient = find the cause before signing off; cost per momo = batch cost / momos.
// No made-up numbers anywhere: a cost is only given when every price behind it is real.
//
// Mirrored byte-for-byte at supabase/functions/make-server-c2dd9b9d/recipeRules.ts (the edge
// function can't import from src/): keep both copies identical. Imports only its two siblings.

import { INGREDIENT_BY_ID, MOMO_TYPES, SHEET_BY_ID, type Scale, type SheetDef } from './recipeCatalog.ts';
import { median, priceForIngredient, priceItemKey, type GramPrice, type PriceLink, type PriceMiss, type PurchaseLike } from './priceRules.ts';

export const TRIALS = 3; // batches behind a standard
export const SPREAD_LIMIT = 10; // % (section D step 9)
export const MAIN_SHARE = 0.05; // an ingredient that is at least 5% of the batch is a main one
export const PORTION_SAMPLES = 10;
export const MIN_PORTIONS_TO_SEND = 5;
export const BIG_SCALE_MAX_KG = 100;
export const SMALL_SCALE_HEAVY_KG = 30;
const HISTORY_RATIO = 3; // like the expense price check: more than 3x off the usual is a slip
const FIX_RATIO = 2.5;

export type WeightUnit = 'g' | 'kg';

export type BatchLine = {
  key: string; // ingredient id, or "x:<name>" for an item that is not on the list
  name?: string; // extra items: what was typed
  qty: number | null; // as weighed, in `unit`
  unit: WeightUnit;
  scale: Scale;
  notUsed?: boolean; // crossed out: not used in this batch
  beforeQty?: number | null; // before peeling / trimming / squeezing
  beforeUnit?: WeightUnit;
  note?: string;
};

export type BatchInput = {
  clientId: string; // made on the phone; the batch id, so a repeat send can't save it twice
  sheetId: string;
  date: string; // YYYY-MM-DD (IST)
  time?: string; // HH:MM
  madeById?: string | null;
  madeByName?: string;
  lines: BatchLine[];
  output: { qty: number | null; unit: WeightUnit; full?: number | null; empty?: number | null; containerUnit?: WeightUnit };
  count?: number | null;
  packWeight?: { qty: number | null; unit: WeightUnit } | null;
  waterPerPackMl?: number | null;
  portions?: (number | null)[]; // grams, one by one
  pickup?: { before: number | null; after: number | null; n: number } | null; // grams of the same n momos
  minutes?: number | null;
  leftoverG?: number | null;
  thrownG?: number | null;
  thrownWhy?: string;
  taste?: string;
  notes?: string;
  confirmed?: string[]; // warning ids the person checked and said are right
  photo?: string | null; // data URL, only on the way to the server
};

export type IssueCode =
  | 'date-missing' | 'date-future' | 'line-missing' | 'no-weights' | 'negative' | 'name-missing' | 'output-missing'
  | 'portions-few' | 'portion-bad' | 'pickup-missing' | 'pickup-order'
  | 'over-scale' | 'small-scale-heavy' | 'unusual' | 'output-more' | 'output-low' | 'before-less'
  | 'portion-outlier' | 'portion-range' | 'pickup-range' | 'portions-not-10' | 'minutes-long';

export type Issue = {
  id: string;
  level: 'error' | 'warning';
  code: IssueCode;
  lineKey?: string;
  vars?: Record<string, string | number>;
  // One-tap fix for a unit slip: switch this weight to the other unit.
  fix?: { target: 'line' | 'output'; lineKey?: string; unit: WeightUnit };
};

export type Batch = Omit<BatchInput, 'photo' | 'clientId'> & {
  id: string;
  enteredById: string | null;
  enteredByName: string;
  enteredAt: string;
  houseId?: string | null;
  photo?: { path: string; mimeType: string } | null;
  issues: Issue[]; // warnings found when it was saved (confirmed ones are listed in `confirmed`)
  status: 'active' | 'excluded';
  statusNote?: string;
  statusBy?: string;
  statusAt?: string;
};

// ---------------------------------------------------------------- small maths

export const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
// (highest - lowest) / average x 100; null with fewer than two values or a zero average.
export function spreadPct(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const avg = mean(v);
  if (avg <= 0) return null;
  return ((Math.max(...v) - Math.min(...v)) / avg) * 100;
}

export function toGrams(qty: number | null | undefined, unit: WeightUnit | undefined): number | null {
  if (qty === null || qty === undefined || !Number.isFinite(qty)) return null;
  return unit === 'kg' ? qty * 1000 : qty;
}

export const otherUnit = (u: WeightUnit): WeightUnit => (u === 'kg' ? 'g' : 'kg');
const swapFactor = (u: WeightUnit) => (u === 'kg' ? 1 / 1000 : 1000); // grams after a switch / before

export const extraKey = (name: string) => `x:${priceItemKey(name).replace(/[^a-z0-9ঀ-৿ऀ-ॿ ]/g, '').replace(/ /g, '-').slice(0, 40)}`;
export const isExtraKey = (key: string) => key.startsWith('x:');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- one batch

export type LineFact = { key: string; name?: string; g: number; beforeG: number | null; used: boolean; line: BatchLine };
export type BatchFacts = {
  lines: LineFact[];
  byKey: Record<string, LineFact>;
  inputG: number;
  outputG: number | null;
  yieldPct: number | null;
  portions: number[];
  portionMean: number | null;
  pickupG: number | null; // per momo
  count: number | null;
  minutes: number | null;
};

export function outputGrams(b: Pick<BatchInput, 'output'>): number | null {
  const o = b.output;
  if (!o) return null;
  const direct = toGrams(o.qty, o.unit);
  if (direct !== null) return direct;
  if (o.full !== null && o.full !== undefined && o.empty !== null && o.empty !== undefined) return toGrams(o.full - o.empty, o.containerUnit || o.unit);
  return null;
}

export function batchFacts(sheet: SheetDef, b: BatchInput | Batch): BatchFacts {
  const lines: LineFact[] = (b.lines || []).map((l) => {
    const g = l.notUsed ? 0 : toGrams(l.qty, l.unit) ?? 0;
    const beforeG = l.notUsed ? null : toGrams(l.beforeQty ?? null, l.beforeUnit || l.unit);
    return { key: l.key, name: l.name, g: Math.max(0, g), beforeG: beforeG !== null && beforeG > 0 ? beforeG : null, used: !l.notUsed && g > 0, line: l };
  });
  const byKey: Record<string, LineFact> = {};
  for (const l of lines) {
    const prev = byKey[l.key];
    // The same item twice (added in two goes): one line with the total.
    byKey[l.key] = prev ? { ...prev, g: prev.g + l.g, beforeG: prev.beforeG !== null && l.beforeG !== null ? prev.beforeG + l.beforeG : prev.beforeG ?? l.beforeG, used: prev.used || l.used } : l;
  }
  const inputG = lines.reduce((s, l) => s + l.g, 0);
  const outputG = outputGrams(b);
  const portions = sheet.portion === 'samples' ? (b.portions || []).filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0) : [];
  const p = b.pickup;
  const pickupG = sheet.portion === 'pickup' && p && p.before !== null && p.after !== null && p.after > p.before && (p.n || 0) > 0 ? (p.after - p.before) / p.n : null;
  return {
    lines, byKey, inputG, outputG,
    yieldPct: outputG !== null && inputG > 0 ? (outputG / inputG) * 100 : null,
    portions,
    portionMean: portions.length ? mean(portions) : null,
    pickupG,
    count: typeof b.count === 'number' && b.count > 0 ? b.count : null,
    minutes: typeof b.minutes === 'number' && b.minutes > 0 ? b.minutes : null,
  };
}

// What's wrong (errors stop the send) or worth a second look (warnings, with a one-tap fix when
// it is clearly a g/kg slip) - checked on the phone as they type, and again on the server.
// `history`: the sheet's earlier batches, to spot a weight 3x off the usual share of the batch.
export function validateBatch(sheet: SheetDef, b: BatchInput, history: (BatchInput | Batch)[], today: string): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue['level'], code: IssueCode, extra: Partial<Issue> = {}) =>
    out.push({ id: `${code}:${extra.lineKey ?? extra.vars?.n ?? ''}`, level, code, ...extra });

  if (!DAY.test(b.date || '')) add('error', 'date-missing');
  else if (b.date > today) add('error', 'date-future');

  const listed = new Set(sheet.ingredients);
  for (const l of b.lines || []) {
    if (listed.has(l.key) && !l.notUsed && (l.qty === null || l.qty === undefined)) add('error', 'line-missing', { lineKey: l.key });
    if ((typeof l.qty === 'number' && l.qty < 0) || (typeof l.beforeQty === 'number' && l.beforeQty < 0)) add('error', 'negative', { lineKey: l.key });
    if (isExtraKey(l.key) && !String(l.name || '').trim() && typeof l.qty === 'number') add('error', 'name-missing', { lineKey: l.key });
  }
  for (const id of sheet.ingredients) {
    if (!(b.lines || []).some((l) => l.key === id)) add('error', 'line-missing', { lineKey: id });
  }

  const f = batchFacts(sheet, b);
  if (!f.lines.some((l) => l.used)) add('error', 'no-weights');
  if (f.outputG === null || f.outputG <= 0) add('error', 'output-missing');

  if (sheet.portion === 'samples') {
    const raw = (b.portions || []).filter((x) => x !== null && x !== undefined) as number[];
    if (raw.some((x) => !(x > 0))) add('error', 'portion-bad');
    const ok = f.portions;
    if (ok.length < MIN_PORTIONS_TO_SEND) add('error', 'portions-few', { vars: { n: ok.length, need: MIN_PORTIONS_TO_SEND } });
    else if (ok.length < PORTION_SAMPLES) add('warning', 'portions-not-10', { vars: { n: ok.length } });
    if (ok.length) {
      const usual = median(ok);
      (b.portions || []).forEach((x, i) => {
        if (typeof x !== 'number' || !(x > 0)) return;
        if (x < 1 || x > 200) add('warning', 'portion-range', { vars: { n: i + 1, g: round(x, 1) } });
        else if (ok.length >= 3 && (x > usual * 2 || x < usual / 2)) add('warning', 'portion-outlier', { vars: { n: i + 1, g: round(x, 1), usual: round(usual, 1) } });
      });
    }
  }
  if (sheet.portion === 'pickup') {
    const p = b.pickup;
    if (!p || p.before === null || p.before === undefined || p.after === null || p.after === undefined) add('error', 'pickup-missing');
    else if (p.after <= p.before) add('error', 'pickup-order');
    else if (f.pickupG !== null && (f.pickupG < 0.5 || f.pickupG > 30)) add('warning', 'pickup-range', { vars: { g: round(f.pickupG, 1) } });
  }

  for (const l of f.lines) {
    if (!l.used) continue;
    const kg = l.g / 1000;
    const vars = { qty: l.line.qty ?? 0, unit: l.line.unit };
    const fix = l.line.unit === 'kg' ? { target: 'line' as const, lineKey: l.key, unit: 'g' as const } : undefined;
    if (kg > BIG_SCALE_MAX_KG) add('warning', 'over-scale', { lineKey: l.key, vars, fix });
    else if (l.line.scale === 'S' && kg > SMALL_SCALE_HEAVY_KG) add('warning', 'small-scale-heavy', { lineKey: l.key, vars, fix });
    if (l.beforeG !== null && l.beforeG < l.g) add('warning', 'before-less', { lineKey: l.key });
  }

  // A weight far from its usual share of the batch (from the sheet's earlier batches).
  if (history.length && f.inputG > 0) {
    const histFacts = history.map((h) => batchFacts(sheet, h)).filter((h) => h.inputG > 0);
    for (const l of f.lines) {
      if (!l.used || isExtraKey(l.key) || out.some((i) => i.lineKey === l.key && (i.code === 'over-scale' || i.code === 'small-scale-heavy'))) continue;
      const shares = histFacts.map((h) => (h.byKey[l.key]?.g || 0) / h.inputG).filter((s) => s > 0);
      if (!shares.length) continue;
      const usual = median(shares);
      const share = l.g / f.inputG;
      const ratio = share / usual;
      if (ratio <= HISTORY_RATIO && ratio >= 1 / HISTORY_RATIO) continue;
      const g2 = l.g * swapFactor(l.line.unit);
      const share2 = g2 / (f.inputG - l.g + g2);
      const fits = share2 / usual <= FIX_RATIO && share2 / usual >= 1 / FIX_RATIO;
      add('warning', 'unusual', {
        lineKey: l.key,
        vars: { qty: l.line.qty ?? 0, unit: l.line.unit, pct: round(share * 100, 1), usualPct: round(usual * 100, 1) },
        fix: fits ? { target: 'line', lineKey: l.key, unit: otherUnit(l.line.unit) } : undefined,
      });
    }
  }

  if (f.outputG !== null && f.outputG > 0 && f.inputG > 0) {
    const r = f.outputG / f.inputG;
    const unit = b.output.qty !== null && b.output.qty !== undefined ? b.output.unit : b.output.containerUnit || b.output.unit;
    const r2 = r * swapFactor(unit);
    const fix = r2 >= 0.3 && r2 <= 1.15 ? { target: 'output' as const, unit: otherUnit(unit) } : undefined;
    const vars = { out: round(f.outputG / 1000, 2), in: round(f.inputG / 1000, 2) };
    if (r > 1.15) add('warning', 'output-more', { vars, fix });
    else if (r < 0.3) add('warning', 'output-low', { vars, fix });
  }
  if (typeof b.minutes === 'number' && b.minutes > 600) add('warning', 'minutes-long', { vars: { n: b.minutes } });
  return out;
}

// A request body -> a clean batch input (unknown ingredient keys dropped, numbers checked,
// text trimmed). The server runs this on every send.
export function cleanBatchInput(raw: any): BatchInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const sheet = SHEET_BY_ID[String(raw.sheetId || '')];
  if (!sheet) return null;
  const num = (v: unknown, max = 1e7): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(-max, Math.min(max, n)) : null;
  };
  const unit = (v: unknown): WeightUnit => (v === 'kg' ? 'kg' : 'g');
  const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const listed = new Set(sheet.ingredients);
  const lines: BatchLine[] = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 60).map((l: any) => {
    const key = text(l?.key, 60);
    const line: BatchLine = { key, qty: num(l?.qty), unit: unit(l?.unit), scale: l?.scale === 'B' ? 'B' : 'S' };
    if (isExtraKey(key)) line.name = text(l?.name, 60);
    if (l?.notUsed) line.notUsed = true;
    const before = num(l?.beforeQty);
    if (before !== null) { line.beforeQty = before; line.beforeUnit = unit(l?.beforeUnit ?? l?.unit); }
    const note = text(l?.note, 200);
    if (note) line.note = note;
    return line;
  }).filter((l: BatchLine) => listed.has(l.key) || (isExtraKey(l.key) && l.key.length > 2));
  const o = raw.output || {};
  const portions = Array.isArray(raw.portions) ? raw.portions.slice(0, PORTION_SAMPLES).map((x: unknown) => num(x, 100000)) : undefined;
  const p = raw.pickup;
  const time = text(raw.time, 5);
  const confirmed = Array.isArray(raw.confirmed) ? raw.confirmed.slice(0, 80).map((x: unknown) => text(x, 80)).filter(Boolean) : [];
  return {
    clientId: text(raw.clientId, 64),
    sheetId: sheet.id,
    date: text(raw.date, 10),
    ...(TIME.test(time) ? { time } : {}),
    madeById: raw.madeById ? text(raw.madeById, 80) : null,
    madeByName: text(raw.madeByName, 80),
    lines,
    output: { qty: num(o.qty), unit: unit(o.unit), full: num(o.full), empty: num(o.empty), containerUnit: unit(o.containerUnit ?? o.unit) },
    count: num(raw.count, 1e6),
    packWeight: raw.packWeight ? { qty: num(raw.packWeight.qty), unit: unit(raw.packWeight.unit) } : null,
    waterPerPackMl: num(raw.waterPerPackMl, 1e5),
    ...(portions ? { portions } : {}),
    pickup: p ? { before: num(p.before, 1e6), after: num(p.after, 1e6), n: Math.max(1, Math.min(100, Math.round(num(p.n, 100) || PORTION_SAMPLES))) } : null,
    minutes: num(raw.minutes, 10000),
    leftoverG: num(raw.leftoverG),
    thrownG: num(raw.thrownG),
    thrownWhy: text(raw.thrownWhy, 200),
    taste: text(raw.taste, 60),
    notes: text(raw.notes, 1000),
    confirmed,
    photo: typeof raw.photo === 'string' ? raw.photo : null,
  };
}

// ---------------------------------------------------------------- the standard (average of 3)

export type StdIngredient = {
  key: string;
  name?: string; // extra items
  grams: number[]; // per batch, as weighed (0 = not used)
  perKgInput: number; // g per kg of everything that went in (the recipe ratio)
  perKgOutput: number; // g per kg of finished output (how the card scales)
  stdG: number; // for a usual-size batch
  share: number; // of the batch, 0-1
  spreadPct: number | null; // of perKgInput, when used in every batch
  main: boolean;
  usedIn: number;
  usable: number | null; // usable fraction after peeling (average of the batches that weighed before)
  usableFrom: number;
};
export type SpreadFlag = { what: 'yield' | 'portion' | 'pickup' | 'minutes' | 'ingredient'; key?: string; spreadPct: number | null; usedIn?: number };
export type StandardCalc = {
  sheetId: string;
  batchIds: string[];
  n: number;
  inputG: number; // average batch: everything in
  outputG: number; // average batch: finished weight
  yieldPct: number | null;
  yields: (number | null)[];
  yieldSpread: number | null;
  ingredients: StdIngredient[];
  portionG: number | null; // average dough ball / filling scoop
  portionMeans: (number | null)[];
  portionSpread: number | null;
  portionMin: number | null;
  portionMax: number | null;
  pickupG: number | null; // batter or coating per momo
  pickups: (number | null)[];
  pickupSpread: number | null;
  count: number | null; // average pieces / packs counted
  counts: (number | null)[];
  minutes: number | null;
  minutesList: (number | null)[];
  minutesSpread: number | null;
  flags: SpreadFlag[];
};

export function deriveStandard(sheet: SheetDef, batches: (Batch | BatchInput)[]): StandardCalc {
  const facts = batches.map((b) => batchFacts(sheet, b));
  const n = facts.length;
  const extras: { key: string; name?: string }[] = [];
  for (const f of facts) for (const l of f.lines) if (isExtraKey(l.key) && l.used && !extras.some((e) => e.key === l.key)) extras.push({ key: l.key, name: l.name });
  const inputG = mean(facts.map((f) => f.inputG));
  const outs = facts.map((f) => f.outputG ?? 0);
  const outputG = mean(outs);
  const keys = [...sheet.ingredients.map((key) => ({ key, name: undefined as string | undefined })), ...extras];
  const ingredients: StdIngredient[] = keys.map(({ key, name }) => {
    const grams = facts.map((f) => f.byKey[key]?.g || 0);
    const perIn = facts.map((f, i) => (f.inputG > 0 ? (grams[i] / f.inputG) * 1000 : 0));
    const perOut = facts.map((f, i) => (f.outputG && f.outputG > 0 ? (grams[i] / f.outputG) * 1000 : 0));
    const usedIn = grams.filter((g) => g > 0).length;
    const usableVals = facts.map((f) => f.byKey[key]).filter((l) => l && l.g > 0 && l.beforeG !== null).map((l) => l!.g / l!.beforeG!);
    const perKgInput = mean(perIn);
    const share = perKgInput / 1000;
    return {
      key, ...(name ? { name } : {}), grams, perKgInput, perKgOutput: mean(perOut), stdG: (perKgInput * inputG) / 1000, share,
      spreadPct: usedIn === n ? spreadPct(perIn) : null, main: share >= MAIN_SHARE, usedIn,
      usable: usableVals.length ? Math.min(1, mean(usableVals)) : null, usableFrom: usableVals.length,
    };
  }).filter((i) => i.usedIn > 0 || sheet.ingredients.includes(i.key));

  const yields = facts.map((f) => f.yieldPct);
  const yv = yields.filter((y): y is number => y !== null);
  const portionMeans = facts.map((f) => f.portionMean);
  const pv = portionMeans.filter((x): x is number => x !== null);
  const allPortions = facts.flatMap((f) => f.portions);
  const pickups = facts.map((f) => f.pickupG);
  const kv = pickups.filter((x): x is number => x !== null);
  const counts = facts.map((f) => f.count);
  const cv = counts.filter((x): x is number => x !== null);
  const minutesList = facts.map((f) => f.minutes);
  const mv = minutesList.filter((x): x is number => x !== null);

  const calc: StandardCalc = {
    sheetId: sheet.id,
    batchIds: batches.map((b) => ('id' in b && b.id ? b.id : (b as BatchInput).clientId)),
    n, inputG, outputG,
    yieldPct: yv.length ? mean(yv) : null, yields, yieldSpread: yv.length === n ? spreadPct(yv) : null,
    ingredients,
    portionG: pv.length ? mean(pv) : null, portionMeans, portionSpread: pv.length === n ? spreadPct(pv) : null,
    portionMin: allPortions.length ? Math.min(...allPortions) : null, portionMax: allPortions.length ? Math.max(...allPortions) : null,
    pickupG: kv.length ? mean(kv) : null, pickups, pickupSpread: kv.length === n ? spreadPct(kv) : null,
    count: cv.length ? mean(cv) : null, counts,
    minutes: mv.length ? mean(mv) : null, minutesList, minutesSpread: mv.length === n ? spreadPct(mv) : null,
    flags: [],
  };
  const over = (x: number | null) => x !== null && x > SPREAD_LIMIT;
  if (over(calc.yieldSpread)) calc.flags.push({ what: 'yield', spreadPct: calc.yieldSpread });
  if (over(calc.portionSpread)) calc.flags.push({ what: 'portion', spreadPct: calc.portionSpread });
  if (over(calc.pickupSpread)) calc.flags.push({ what: 'pickup', spreadPct: calc.pickupSpread });
  if (over(calc.minutesSpread)) calc.flags.push({ what: 'minutes', spreadPct: calc.minutesSpread });
  for (const i of ingredients) {
    if (!i.main) continue;
    if (i.usedIn < n) calc.flags.push({ what: 'ingredient', key: i.key, spreadPct: null, usedIn: i.usedIn });
    else if (over(i.spreadPct)) calc.flags.push({ what: 'ingredient', key: i.key, spreadPct: i.spreadPct });
  }
  return calc;
}

export type Standard = {
  version: number;
  setAt: string;
  setById: string | null;
  setByName: string;
  note: string;
  overrideReason?: string; // set although something varied by more than 10%
  calc: StandardCalc;
  costAtSet?: { costPerKg: number | null; pricesAsOf: string | null };
};
export type StandardDoc = { sheetId: string; current: Standard | null; history: Standard[] };

// ---------------------------------------------------------------- status of a sheet

export type SheetStatusCode = 'todo' | 'ready' | 'set';
export type SheetStatus = { code: SheetStatusCode; n: number; version: number | null; newSince: number };

const byEntered = (a: { enteredAt?: string; date?: string }, b: { enteredAt?: string; date?: string }) =>
  String(a.enteredAt || a.date || '').localeCompare(String(b.enteredAt || b.date || ''));

// The batches that count towards the next standard: all active ones before any standard; after
// one is set, the active ones entered since that the standard didn't use.
export function countingBatches<T extends { id: string; status: Batch['status']; enteredAt: string }>(batches: T[], doc: StandardDoc | null | undefined): T[] {
  const active = batches.filter((b) => b.status !== 'excluded').sort(byEntered);
  const cur = doc?.current;
  if (!cur) return active;
  const used = new Set(cur.calc.batchIds);
  return active.filter((b) => !used.has(b.id) && b.enteredAt > cur.setAt);
}

// "0 of 3" .. "2 of 3" (todo, n), "Ready for review", or "Standard set" (with new batches since).
export function sheetStatus(batches: { id: string; status: Batch['status']; enteredAt: string }[], doc: StandardDoc | null | undefined): SheetStatus {
  const counting = countingBatches(batches, doc);
  const version = doc?.current?.version ?? null;
  if (counting.length >= TRIALS) return { code: 'ready', n: counting.length, version, newSince: version ? counting.length : 0 };
  if (version) return { code: 'set', n: counting.length, version, newSince: counting.length };
  return { code: 'todo', n: counting.length, version: null, newSince: 0 };
}

// The batches a review opens with: the newest three that count, else the current standard's.
export function defaultReviewIds(batches: Batch[], doc: StandardDoc | null | undefined): string[] {
  const counting = countingBatches(batches, doc);
  if (counting.length >= TRIALS || !doc?.current) return counting.slice(-TRIALS).map((b) => b.id);
  const live = new Set(batches.filter((b) => b.status !== 'excluded').map((b) => b.id));
  return doc.current.calc.batchIds.filter((id) => live.has(id));
}

// ---------------------------------------------------------------- prices and cost

export type PriceInfo =
  | { ok: true; perG: number; source: 'purchase' | 'component' | 'free'; latestDate: string | null; detail?: GramPrice; component?: { sheetId: string; version: number } }
  | { ok: false; source: 'purchase' | 'component'; reason: string; detail?: PriceMiss; component?: { sheetId: string } };

export type CostLine = {
  key: string;
  name?: string;
  perKgOutputG: number;
  usable: number | null;
  prepLossUnmeasured: boolean; // peeled item, but no weight before peeling: cost may be low
  perG: number | null; // ₹ a gram as bought
  costPerKgOutput: number | null; // ₹ in 1 kg of output
  price: PriceInfo;
};
export type CostCalc = {
  complete: boolean;
  costPerKgOutput: number | null;
  knownPerKgOutput: number; // the lines that do have a price
  costPerG: number | null;
  costPerPortion: number | null; // dough ball, filling scoop, or batter/coating per momo
  lines: CostLine[];
  missing: string[];
  pricesAsOf: string | null;
};

export function costCalc(calc: StandardCalc, priceOf: (key: string, name?: string) => PriceInfo): CostCalc {
  const lines: CostLine[] = calc.ingredients.filter((i) => i.usedIn > 0).map((i) => {
    const price = priceOf(i.key, i.name);
    const def = INGREDIENT_BY_ID[i.key];
    const usable = i.usable && i.usable > 0 ? i.usable : null;
    const perG = price.ok ? price.perG / (usable || 1) : null;
    return {
      key: i.key, ...(i.name ? { name: i.name } : {}), perKgOutputG: i.perKgOutput, usable,
      prepLossUnmeasured: !!def?.prepLoss && usable === null,
      perG, costPerKgOutput: perG !== null ? i.perKgOutput * perG : null, price,
    };
  });
  const missing = lines.filter((l) => l.costPerKgOutput === null).map((l) => l.key);
  const known = lines.reduce((s, l) => s + (l.costPerKgOutput || 0), 0);
  const complete = missing.length === 0 && lines.length > 0 && calc.outputG > 0;
  const costPerG = complete ? known / 1000 : null;
  const portion = calc.portionG ?? calc.pickupG;
  const dates = lines.map((l) => (l.price.ok ? l.price.latestDate : null)).filter((d): d is string => !!d).sort();
  return {
    complete,
    costPerKgOutput: complete ? known : null,
    knownPerKgOutput: known,
    costPerG,
    costPerPortion: costPerG !== null && portion !== null ? costPerG * portion : null,
    lines, missing,
    pricesAsOf: dates.length ? dates[dates.length - 1] : null,
  };
}

export type SheetCost =
  | { ok: true; costPerG: number; costPerKg: number; version: number; pricesAsOf: string | null; versions: string[]; cost: CostCalc }
  | { ok: false; reason: 'no-standard' | 'no-price' | 'cycle'; missing: string[]; versions: string[]; cost?: CostCalc };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Prices and component costs for one moment (`asOf`, normally today), shared by the review, the
// standards and the cost per piece so every screen agrees.
export function makeResolver(o: { standards: Record<string, StandardDoc | null | undefined>; purchases: PurchaseLike[]; links: Record<string, PriceLink | undefined>; asOf: string }) {
  const prices = new Map<string, PriceInfo>();
  const sheets = new Map<string, SheetCost>();
  const visiting = new Set<string>();

  function ingredientPrice(key: string, name?: string): PriceInfo {
    const cacheKey = `${key}|${name || ''}`;
    const hit = prices.get(cacheKey);
    if (hit) return hit;
    const def = INGREDIENT_BY_ID[key];
    let info: PriceInfo;
    if (def?.free) info = { ok: true, perG: 0, source: 'free', latestDate: null };
    else if (def?.component) {
      const sc = sheetCost(def.component);
      info = sc.ok
        ? { ok: true, perG: sc.costPerG, source: 'component', latestDate: sc.pricesAsOf, component: { sheetId: def.component, version: sc.version } }
        : { ok: false, source: 'component', reason: sc.reason, component: { sheetId: def.component } };
    } else {
      const match = def?.match || (name ? { any: [escapeRe(priceItemKey(name))] } : undefined);
      const r = priceForIngredient(o.purchases, { match, link: o.links[key], density: def?.density, asOf: o.asOf });
      info = r.ok ? { ok: true, perG: r.perG, source: 'purchase', latestDate: r.latestDate, detail: r } : { ok: false, source: 'purchase', reason: r.reason, detail: r };
    }
    prices.set(cacheKey, info);
    return info;
  }

  function sheetCost(sheetId: string): SheetCost {
    const hit = sheets.get(sheetId);
    if (hit) return hit;
    const cur = o.standards[sheetId]?.current;
    if (!cur) return { ok: false, reason: 'no-standard', missing: [], versions: [] };
    if (visiting.has(sheetId)) return { ok: false, reason: 'cycle', missing: [], versions: [] };
    visiting.add(sheetId);
    const cost = costCalc(cur.calc, ingredientPrice);
    visiting.delete(sheetId);
    const versions = [`${sheetId}@${cur.version}`];
    for (const l of cost.lines) if (l.price.ok && l.price.component) {
      const inner = sheets.get(l.price.component.sheetId);
      if (inner) versions.push(...inner.versions);
    }
    const result: SheetCost = cost.complete && cost.costPerG !== null
      ? { ok: true, costPerG: cost.costPerG, costPerKg: cost.costPerKgOutput!, version: cur.version, pricesAsOf: cost.pricesAsOf, versions: [...new Set(versions)], cost }
      : { ok: false, reason: 'no-price', missing: cost.missing, versions: [...new Set(versions)], cost };
    sheets.set(sheetId, result);
    return result;
  }

  return { ingredientPrice, sheetCost, asOf: o.asOf };
}
export type Resolver = ReturnType<typeof makeResolver>;

// ---------------------------------------------------------------- cost per piece

export type PiecePart = 'wrapper' | 'filling' | 'batter' | 'coating';
export type PieceComponent = { part: PiecePart; sheetId: string; code: string; grams: number; costPerG: number; cost: number; version: number };
export type PieceMissing = { part: PiecePart; sheetId: string; reason: 'no-standard' | 'no-portion' | 'no-price' | 'cycle'; keys?: string[] };
export type MomoCost =
  | { ok: true; momoType: string; costPerPiece: number; components: PieceComponent[]; standardVersion: string; pricesAsOf: string | null }
  | { ok: false; momoType: string; missing: PieceMissing[]; grams: Partial<Record<PiecePart, number>> };

// Wrapper g x dough cost/g + filling g x filling cost/g (+ batter and coating pick-up for
// kurkure), all from approved standards; nothing when any of them is missing.
export function momoCost(momoType: string, resolver: Resolver, standards: Record<string, StandardDoc | null | undefined>): MomoCost {
  const t = MOMO_TYPES.find((m) => m.key === momoType);
  if (!t) return { ok: false, momoType, missing: [], grams: {} };
  const parts: { part: PiecePart; sheetId: string; field: 'portionG' | 'pickupG' }[] = [
    { part: 'wrapper', sheetId: 'dough', field: 'portionG' },
    { part: 'filling', sheetId: t.filling, field: 'portionG' },
    ...(t.kurkure ? [{ part: 'batter' as const, sheetId: 'batter', field: 'pickupG' as const }, { part: 'coating' as const, sheetId: 'coating', field: 'pickupG' as const }] : []),
  ];
  const missing: PieceMissing[] = [];
  const grams: Partial<Record<PiecePart, number>> = {};
  const components: PieceComponent[] = [];
  const versions: string[] = [];
  const dates: string[] = [];
  let total = 0;
  for (const p of parts) {
    const cur = standards[p.sheetId]?.current;
    if (!cur) { missing.push({ part: p.part, sheetId: p.sheetId, reason: 'no-standard' }); continue; }
    const g = cur.calc[p.field];
    if (g === null || !(g > 0)) { missing.push({ part: p.part, sheetId: p.sheetId, reason: 'no-portion' }); continue; }
    grams[p.part] = round(g, 2);
    const sc = resolver.sheetCost(p.sheetId);
    if (!sc.ok) { missing.push({ part: p.part, sheetId: p.sheetId, reason: sc.reason === 'no-standard' ? 'no-standard' : sc.reason, keys: sc.missing }); continue; }
    total += g * sc.costPerG;
    versions.push(...sc.versions);
    if (sc.pricesAsOf) dates.push(sc.pricesAsOf);
    components.push({ part: p.part, sheetId: p.sheetId, code: SHEET_BY_ID[p.sheetId]?.code || p.sheetId, grams: round(g, 2), costPerG: round(sc.costPerG, 5), cost: round(g * sc.costPerG, 2), version: sc.version });
  }
  if (missing.length) return { ok: false, momoType, missing, grams };
  dates.sort();
  return { ok: true, momoType, costPerPiece: round(total, 2), components, standardVersion: [...new Set(versions)].join('+'), pricesAsOf: dates.length ? dates[dates.length - 1] : null };
}

// ---------------------------------------------------------------- who may do what

export type RecipeAccess = {
  canView: boolean;
  canEnter: boolean; // fill batches
  canReview: boolean; // see averages, spreads and costs
  canApprove: boolean; // set a standard
  canManageCrew: boolean; // pick the kitchen crew who may fill batches
  canSeeCosts: boolean;
  canEditPrices: boolean; // link ingredients to purchase items
  isCrew: boolean;
};

// Production incharge, the kitchen crew he picks, operations managers and the owner fill
// batches; the owner and operations managers review; only the owner sets a standard.
export function recipeAccess(a: { role?: string | null; designation?: string | null; employeeId?: string | null }, crewIds: string[] = []): RecipeAccess {
  const role = String(a.role || '');
  const designation = String(a.designation || '');
  const isOwner = role === 'cluster_head';
  const isOps = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  const isHead = designation === 'production_incharge';
  const isCrew = !!a.employeeId && crewIds.includes(String(a.employeeId)) && role !== 'audit';
  const canEnter = isOwner || isOps || isHead || isCrew;
  return {
    canView: canEnter,
    canEnter,
    canReview: isOwner || isOps,
    canApprove: isOwner,
    canManageCrew: isOwner || isOps || isHead,
    canSeeCosts: isOwner || isOps,
    canEditPrices: isOwner || isOps,
    isCrew,
  };
}
