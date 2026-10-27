// What the business really pays for an item, from its own purchase (expense) records. One copy
// of these rules serves the expense price checks (src/utils/expenseChecks.ts: is this bill's
// price per kg believable?) and recipe costing (recipeRules.ts, on the phone and on the server:
// what does a gram of onion cost?), so both read prices the same way.
//
// Mirrored byte-for-byte at supabase/functions/make-server-c2dd9b9d/priceRules.ts (the edge
// function can't import from src/): keep both copies identical. No imports, so the file runs
// unchanged in the browser, in Deno and in plain Node (the tests).

export type Measure = 'kg' | 'L' | 'pc' | 'packet' | 'carton' | 'bundle';

export const UNITS: Record<string, { measure: Measure; perBase: number }> = {
  kg: { measure: 'kg', perBase: 1 },
  g: { measure: 'kg', perBase: 0.001 },
  L: { measure: 'L', perBase: 1 },
  l: { measure: 'L', perBase: 1 },
  mL: { measure: 'L', perBase: 0.001 },
  ml: { measure: 'L', perBase: 0.001 },
  pcs: { measure: 'pc', perBase: 1 },
  pc: { measure: 'pc', perBase: 1 },
  piece: { measure: 'pc', perBase: 1 },
  pieces: { measure: 'pc', perBase: 1 },
  units: { measure: 'pc', perBase: 1 },
  unit: { measure: 'pc', perBase: 1 },
  packet: { measure: 'packet', perBase: 1 },
  packets: { measure: 'packet', perBase: 1 },
  carton: { measure: 'carton', perBase: 1 },
  bundle: { measure: 'bundle', perBase: 1 }, // leafy greens (আঁটি)
};

// The other size of the same measure, for a g <-> kg or mL <-> L slip.
export const SWAP_UNIT: Record<string, string> = { g: 'kg', kg: 'g', mL: 'L', ml: 'L', L: 'mL', l: 'mL' };

// Per kg or litre, nothing this kitchen buys costs under ₹0.5 (even drinking-water jars are
// about ₹1.5 a litre) or over ₹10,000 (small spice sachets come to a few thousand), so such
// an entry is wrong whatever the item's history says.
export const PLAUSIBLE_PER_BASE = { low: 0.5, high: 10000 };
export const MAX_RATIO = 3;
export const MIN_SAMPLES = 3;

export const priceItemKey = (name: string) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export type PurchaseLike = {
  id?: string;
  itemName: string;
  quantity: number;
  unit: string;
  totalCost: number;
  date?: string;
  packageType?: 'carton' | 'pieces';
  priceCheckOk?: boolean;
  weightPerUnitGrams?: number; // weight of one piece/packet, when it was written on the bill
};

export const pricePerBase = (p: PurchaseLike) => {
  const u = UNITS[p.unit];
  const qty = Number(p.quantity) || 0;
  const total = Number(p.totalCost) || 0;
  if (!u || qty <= 0 || total <= 0) return null;
  return { measure: u.measure, perBase: u.perBase, value: total / (qty * u.perBase) };
};

export const implausible = (measure: Measure, value: number) =>
  (measure === 'kg' || measure === 'L') && (value < PLAUSIBLE_PER_BASE.low || value > PLAUSIBLE_PER_BASE.high);

export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// The median taken twice - the second time without values more than 3x off the first - so a
// run of slipped entries doesn't drag it. `kept` is how many values the second pass used.
export function trimmedMedian(xs: number[], ratio = MAX_RATIO): { value: number; kept: number; first: number } | null {
  const clean = xs.filter((x) => Number.isFinite(x) && x > 0);
  if (!clean.length) return null;
  const first = median(clean);
  const kept = clean.filter((x) => x <= first * ratio && x >= first / ratio);
  return { value: median(kept.length ? kept : clean), kept: kept.length, first };
}

// ---------------------------------------------------------------- price per gram (recipes)

// Which purchase item names are this ingredient: case-insensitive regular expressions on the
// item name. `not` wins over `any` ("chicken" but not "chicken 65 masala").
export type ItemMatch = { any: string[]; not?: string[] };

// The owner's own choice for an ingredient, which replaces the name match: these purchase
// items exactly, and (for things bought by the piece without a weight on the bill) what one
// piece weighs or gives, measured by the owner - e.g. one butter pack = 100 g.
export type PriceLink = { itemKeys?: string[]; gramsPerPiece?: number | null };

export function matchesItem(itemName: string, m: ItemMatch | undefined): boolean {
  if (!m || !m.any?.length) return false;
  const key = priceItemKey(itemName);
  const test = (src: string) => {
    try { return new RegExp(src, 'i').test(key); } catch { return key.includes(src.toLowerCase()); }
  };
  return m.any.some(test) && !(m.not || []).some(test);
}

export type PriceUse = { itemName: string; date: string; quantity: number; unit: string; totalCost: number; perKg: number; kept: boolean };
export type GramPrice = {
  ok: true;
  perG: number;
  perKg: number;
  samples: number; // bills the price came from
  confidence: 'ok' | 'few'; // 'few': under 3 bills in the last year
  latestDate: string;
  windowDays: number;
  used: PriceUse[]; // newest first, at most 8
  litreAsKg: boolean; // a bill in litres was counted as 1 L = 1 kg (no density known)
  linked: boolean; // from the owner's chosen items rather than the name match
};
export type PriceMiss = {
  ok: false;
  reason: 'no-purchases' | 'piece-no-weight' | 'implausible' | 'too-old';
  matchedNames: string[];
  linked: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}/;
export const PRICE_WINDOWS = [90, 180, 365];

export function addDaysISO(date: string, n: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Grams in one purchase entry. Litres use the ingredient's density (oil 0.92 g/ml) or 1 g/ml;
// pieces and packets need the weight of one piece - from the bill, or measured by the owner.
export function gramsOfPurchase(p: PurchaseLike, opts: { density?: number; gramsPerPiece?: number | null } = {}):
  { grams: number; litreAsKg: boolean } | { skip: 'piece-no-weight' | 'bad' } {
  const u = UNITS[p.unit];
  const qty = Number(p.quantity) || 0;
  if (!u || qty <= 0) return { skip: 'bad' };
  if (u.measure === 'kg') return { grams: qty * u.perBase * 1000, litreAsKg: false };
  if (u.measure === 'L') return { grams: qty * u.perBase * 1000 * (opts.density || 1), litreAsKg: !opts.density };
  const each = Number(p.weightPerUnitGrams) > 0 ? Number(p.weightPerUnitGrams) : Number(opts.gramsPerPiece) > 0 ? Number(opts.gramsPerPiece) : 0;
  if (!each) return { skip: 'piece-no-weight' };
  return { grams: qty * each, litreAsKg: false };
}

// The usual price of a gram of an ingredient on `asOf`: the trimmed median price per kg of its
// bills in the last 90 days, widened to 180 and then 365 days when there are fewer than 3.
export function priceForIngredient(
  purchases: PurchaseLike[],
  opts: { match?: ItemMatch; link?: PriceLink | null; density?: number; asOf: string },
): GramPrice | PriceMiss {
  const linkedKeys = (opts.link?.itemKeys || []).map(priceItemKey).filter(Boolean);
  const linked = linkedKeys.length > 0;
  const matched = purchases.filter((p) => (linked ? linkedKeys.includes(priceItemKey(p.itemName)) : matchesItem(p.itemName, opts.match)));
  const matchedNames = [...new Set(matched.map((p) => String(p.itemName || '').trim()).filter(Boolean))].slice(0, 12);
  if (!matched.length) return { ok: false, reason: 'no-purchases', matchedNames, linked };

  let pieceNoWeight = 0;
  let wild = 0;
  const rows: { p: PurchaseLike; day: string; perKg: number; litreAsKg: boolean }[] = [];
  for (const p of matched) {
    const day = DAY.test(String(p.date || '')) ? String(p.date).slice(0, 10) : '';
    if (!day || day > opts.asOf) continue;
    const total = Number(p.totalCost) || 0;
    if (total <= 0) continue;
    const g = gramsOfPurchase(p, { density: opts.density, gramsPerPiece: opts.link?.gramsPerPiece });
    if ('skip' in g) {
      if (g.skip === 'piece-no-weight') pieceNoWeight++;
      continue;
    }
    const perKg = total / (g.grams / 1000);
    if (perKg < PLAUSIBLE_PER_BASE.low || perKg > PLAUSIBLE_PER_BASE.high) { wild++; continue; }
    rows.push({ p, day, perKg, litreAsKg: g.litreAsKg });
  }
  if (!rows.length) return { ok: false, reason: pieceNoWeight ? 'piece-no-weight' : wild ? 'implausible' : 'too-old', matchedNames, linked };

  let chosen: typeof rows = [];
  let windowDays = PRICE_WINDOWS[PRICE_WINDOWS.length - 1];
  for (const w of PRICE_WINDOWS) {
    const from = addDaysISO(opts.asOf, -w);
    chosen = rows.filter((r) => r.day >= from);
    windowDays = w;
    if (chosen.length >= MIN_SAMPLES) break;
  }
  if (!chosen.length) return { ok: false, reason: 'too-old', matchedNames, linked };

  const tm = trimmedMedian(chosen.map((r) => r.perKg))!;
  const keep = (v: number) => v <= tm.first * MAX_RATIO && v >= tm.first / MAX_RATIO;
  const sorted = [...chosen].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return {
    ok: true,
    perG: tm.value / 1000,
    perKg: tm.value,
    samples: tm.kept,
    confidence: tm.kept >= MIN_SAMPLES ? 'ok' : 'few',
    latestDate: sorted[0].day,
    windowDays,
    used: sorted.slice(0, 8).map((r) => ({
      itemName: String(r.p.itemName || ''), date: r.day, quantity: Number(r.p.quantity) || 0, unit: String(r.p.unit || ''),
      totalCost: Number(r.p.totalCost) || 0, perKg: Math.round(r.perKg * 100) / 100, kept: keep(r.perKg),
    })),
    litreAsKg: chosen.some((r) => r.litreAsKg),
    linked,
  };
}
