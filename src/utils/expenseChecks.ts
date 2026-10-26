// Price checks for purchase entries - plain maths, no AI.
//
// Most wrong purchase entries are a unit slip, not a wrong amount: 1.5 kg of carrot saved as
// 1.5 g, a 24-bottle crate of Coke saved as 1 pc, a sack of onions saved as 1 kg. The amount
// paid is nearly always right, so each entry's price per kg / L / piece is compared with what
// the same item usually costs. A price more than 3x off gets a flag and, where the slip is
// clear, a one-tap fix (switch g <-> kg, or the quantity the amount paid works out to).

type Purchase = {
  id?: string;
  itemName: string;
  quantity: number;
  unit: string;
  totalCost: number;
  date?: string;
  packageType?: 'carton' | 'pieces';
  priceCheckOk?: boolean; // someone confirmed an unusual price is right
};

type Measure = 'kg' | 'L' | 'pc' | 'packet' | 'carton' | 'bundle';

const UNITS: Record<string, { measure: Measure; perBase: number }> = {
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
const SWAP_UNIT: Record<string, string> = { g: 'kg', kg: 'g', mL: 'L', ml: 'L', L: 'mL', l: 'mL' };

// Per kg or litre, nothing this kitchen buys costs under ₹0.5 (even drinking-water jars are
// about ₹1.5 a litre) or over ₹10,000 (small spice sachets come to a few thousand), so such
// an entry is wrong whatever the item's history says.
const PLAUSIBLE_PER_BASE = { low: 0.5, high: 10000 };
const MAX_RATIO = 3;
const MIN_SAMPLES = 3;

export const priceItemKey = (name: string) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

const pricePerBase = (p: Purchase) => {
  const u = UNITS[p.unit];
  const qty = Number(p.quantity) || 0;
  const total = Number(p.totalCost) || 0;
  if (!u || qty <= 0 || total <= 0) return null;
  return { measure: u.measure, perBase: u.perBase, value: total / (qty * u.perBase) };
};

const implausible = (measure: Measure, value: number) =>
  (measure === 'kg' || measure === 'L') && (value < PLAUSIBLE_PER_BASE.low || value > PLAUSIBLE_PER_BASE.high);

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type PriceRef = { measure: Measure; typical: number; samples: number };
export type PriceGuide = {
  refs: Map<string, Partial<Record<Measure, PriceRef>>>;
  usualUnit: Map<string, string>; // the unit most entries of an item use
};

// What each item usually costs per kg / L / piece. The median is taken twice - the second time
// without entries more than 3x off the first - so a run of slipped entries doesn't drag it.
export function buildPriceGuide(entries: Purchase[]): PriceGuide {
  const values = new Map<string, Partial<Record<Measure, number[]>>>();
  const unitCounts = new Map<string, Record<string, number>>();
  for (const e of entries) {
    const p = pricePerBase(e);
    if (!p || implausible(p.measure, p.value)) continue;
    const key = priceItemKey(e.itemName);
    const byMeasure = values.get(key) || {};
    (byMeasure[p.measure] ||= []).push(p.value);
    values.set(key, byMeasure);
  }
  const refs: PriceGuide['refs'] = new Map();
  for (const [key, byMeasure] of values) {
    const out: Partial<Record<Measure, PriceRef>> = {};
    for (const [measure, xs] of Object.entries(byMeasure) as [Measure, number[]][]) {
      const first = median(xs);
      const kept = xs.filter((x) => x <= first * MAX_RATIO && x >= first / MAX_RATIO);
      if (kept.length >= MIN_SAMPLES) out[measure] = { measure, typical: median(kept), samples: kept.length };
    }
    refs.set(key, out);
  }
  // Usual unit: counted over entries whose price looks right.
  for (const e of entries) {
    const p = pricePerBase(e);
    const key = priceItemKey(e.itemName);
    const ref = p ? refs.get(key)?.[p.measure] : undefined;
    if (!p || !ref || p.value > ref.typical * MAX_RATIO || p.value < ref.typical / MAX_RATIO) continue;
    const counts = unitCounts.get(key) || {};
    counts[e.unit] = (counts[e.unit] || 0) + 1;
    unitCounts.set(key, counts);
  }
  const usualUnit = new Map<string, string>();
  for (const [key, counts] of unitCounts) {
    const [unit] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    usualUnit.set(key, unit);
  }
  return { refs, usualUnit };
}

// exact: a unit slip, safe to apply in one tap. Otherwise the quantity is an estimate from the
// usual price (a crate of 24 at an unusual price works out to 23 or 29), to check before saving.
export type PriceFix = { quantity: number; unit: string; label: string; exact: boolean };
export type PriceFlag = {
  severity: 'high' | 'check';
  message: string;
  fix?: PriceFix;
};

export const formatPrice = (n: number) =>
  `₹${n >= 100 ? Math.round(n).toLocaleString('en-IN') : n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}`;
const per = (measure: Measure) => (measure === 'kg' ? 'a kg' : measure === 'L' ? 'a litre' : measure === 'pc' ? 'each' : `a ${measure}`);
const fmtQty = (q: number) => (Number.isInteger(q) ? q.toLocaleString('en-IN') : String(q));

// A sensible quantity in the entry's own unit: whole pieces, kg to 0.1, grams to 10.
function roundQuantity(q: number, unit: string) {
  const u = UNITS[unit];
  if (!u || u.perBase === 1 && u.measure !== 'kg' && u.measure !== 'L') return Math.max(1, Math.round(q));
  if (u.perBase === 1) return q >= 10 ? Math.round(q) : Math.max(0.1, Math.round(q * 10) / 10);
  return Math.max(10, Math.round(q / 10) * 10);
}

// Is this entry's price believable for the item? Null when it is, or when there's too little
// history to tell.
export function checkPurchase(p: Purchase, guide: PriceGuide): PriceFlag | null {
  if (p.priceCheckOk) return null;
  const price = pricePerBase(p);
  if (!price) return null;
  const key = priceItemKey(p.itemName);
  const ref = guide.refs.get(key)?.[price.measure];
  const ratio = ref ? price.value / ref.typical : null;
  const wild = implausible(price.measure, price.value);
  if (!wild && (ratio === null || (ratio <= MAX_RATIO && ratio >= 1 / MAX_RATIO))) return null;

  const usual = ref ? ` - ${p.itemName.trim()} usually costs about ${formatPrice(ref.typical)} ${per(price.measure)}` : '';
  const message = `That's ${formatPrice(price.value)} ${per(price.measure)}${usual}.`;
  const severity: PriceFlag['severity'] = wild || (ratio !== null && (ratio > 10 || ratio < 0.1)) ? 'high' : 'check';

  // 1. A g <-> kg (or mL <-> L) slip: the same number in the other unit gives a normal price.
  const swap = SWAP_UNIT[p.unit];
  if (swap) {
    const swapped = price.value * (price.perBase / UNITS[swap].perBase);
    const fits = ref ? swapped <= ref.typical * 2.5 && swapped >= ref.typical / 2.5 : wild && !implausible(price.measure, swapped);
    if (fits) return { severity, message, fix: { quantity: p.quantity, unit: swap, label: `Make it ${fmtQty(p.quantity)} ${swap}`, exact: true } };
  }
  // 2. Otherwise the quantity is what slipped (a crate saved as 1 pc, a sack as 1 kg): offer
  //    the quantity the amount paid works out to at the usual price - in the item's usual unit
  //    when the entry used another kind (carrot by the piece when it's normally bought by
  //    weight). A bundle entry is left to the full form, since its count is bundles x pieces.
  if (p.packageType === 'carton') return { severity, message };
  const usualUnit = guide.usualUnit.get(key);
  const usualRef = usualUnit && UNITS[usualUnit] ? guide.refs.get(key)?.[UNITS[usualUnit].measure] : undefined;
  const [unit, unitRef] = usualRef && usualRef.measure !== price.measure ? [usualUnit!, usualRef] : [p.unit, ref];
  if (unitRef) {
    const quantity = roundQuantity(p.totalCost / (unitRef.typical * UNITS[unit].perBase), unit);
    if (quantity !== p.quantity || unit !== p.unit) {
      return { severity, message, fix: { quantity, unit, label: `About ${fmtQty(quantity)} ${unit}?`, exact: false } };
    }
  }
  return { severity, message };
}
