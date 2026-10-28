// Tests for recipe capture: averaging, spread, yield, unit handling, purchase prices, cost per
// piece, permissions and the idempotent send. Run with plain node (22.6+ strips the types):
//   node supabase/functions/make-server-c2dd9b9d/recipeRules.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHEET_BY_ID, SHEETS, INGREDIENT_BY_ID } from './recipeCatalog.ts';
import {
  batchFacts, cleanBatchInput, costCalc, defaultReviewIds, deriveStandard, makeResolver, momoCost, outputGrams,
  recipeAccess, sheetStatus, spreadPct, toGrams, validateBatch,
  type Batch, type BatchInput, type BatchLine, type StandardDoc,
} from './recipeRules.ts';
import { gramsOfPurchase, matchesItem, priceForIngredient, trimmedMedian, type PurchaseLike } from './priceRules.ts';
import { createRecipeCore } from './recipes.ts';

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; }
};
const near = (a: number | null | undefined, b: number, eps = 0.01, msg = '') => assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

const here = dirname(fileURLToPath(import.meta.url));
const TODAY = '2026-10-27';

// ---- fixtures: the chicken stuffing of the section D worked example (9.96 kg in) ----
const CHK_G: Record<string, number> = { chicken: 3200, onion: 5550, butter: 400, garlic: 100, ginger: 100, gchilli: 120, coriander: 100, salt: 100, aromatic: 150, msg: 100, pepper: 20, sugar: 20 };
const lines = (sheetId: string, grams: Record<string, number>, over: Partial<Record<string, Partial<BatchLine>>> = {}): BatchLine[] =>
  SHEET_BY_ID[sheetId].ingredients.map((key) => ({ key, qty: grams[key] ?? null, unit: 'g' as const, scale: 'S' as const, ...(grams[key] === undefined ? { notUsed: true } : {}), ...(over[key] || {}) }));
let seq = 0;
function batch(sheetId: string, grams: Record<string, number>, outputKg: number, extra: Partial<Batch> = {}): Batch {
  seq++;
  return {
    id: `b${String(seq).padStart(8, '0')}`, sheetId, date: '2026-10-2' + (seq % 7), lines: lines(sheetId, grams), output: { qty: outputKg, unit: 'kg' },
    enteredById: 'BM010', enteredByName: 'Vijay', enteredAt: `2026-10-20T0${seq % 10}:00:00.000Z`, issues: [], status: 'active', ...extra,
  };
}
const portions = (avg: number) => [avg - 0.4, avg + 0.6, avg - 0.4, avg - 0.4, avg + 0.6, avg - 0.4, avg + 0.6, avg - 0.4, avg - 0.4, avg + 0.6];
const bill = (itemName: string, quantity: number, unit: string, totalCost: number, date = '2026-10-15', more: Partial<PurchaseLike> = {}): PurchaseLike => ({ itemName, quantity, unit, totalCost, date, ...more });

await test('shared files are byte-identical in the app and the server', () => {
  for (const f of ['priceRules.ts', 'recipeCatalog.ts', 'recipeRules.ts']) {
    const app = readFileSync(join(here, '..', '..', '..', 'src', 'utils', f), 'utf8').replace(/\r\n/g, '\n');
    const server = readFileSync(join(here, f), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(app, server, `${f} differs between src/utils and the server folder`);
  }
});

await test('catalog: 21 recipe sheets, every ingredient known, codes in order', () => {
  assert.equal(SHEETS.length, 21);
  SHEETS.forEach((s, i) => assert.equal(s.code, `R-${String(i + 1).padStart(2, '0')}`));
  for (const s of SHEETS) for (const k of s.ingredients) assert.ok(INGREDIENT_BY_ID[k], `${s.code} ${k}`);
  for (const i of Object.values(INGREDIENT_BY_ID)) assert.ok(i.bn && i.hi && i.en, i.id);
});

await test('unit conversion', () => {
  assert.equal(toGrams(3.2, 'kg'), 3200);
  assert.equal(toGrams(48, 'g'), 48);
  assert.equal(toGrams(null, 'g'), null);
  near(outputGrams({ output: { qty: null, unit: 'kg', full: 12.55, empty: 1.1, containerUnit: 'kg' } }), 11450, 0.001);
  const kg = gramsOfPurchase(bill('Onion', 5, 'kg', 280));
  assert.deepEqual(kg, { grams: 5000, litreAsKg: false });
  const oil = gramsOfPurchase(bill('Refined Oil', 1, 'L', 142), { density: 0.92 });
  assert.ok('grams' in oil && Math.abs(oil.grams - 920) < 1e-9 && !oil.litreAsKg);
  const cream = gramsOfPurchase(bill('Fresh cream', 500, 'ml', 102));
  assert.ok('grams' in cream && cream.grams === 500 && cream.litreAsKg);
  assert.deepEqual(gramsOfPurchase(bill('Butter', 2, 'pcs', 210)), { skip: 'piece-no-weight' });
  assert.deepEqual(gramsOfPurchase(bill('Butter', 2, 'pcs', 210, '2026-10-15', { weightPerUnitGrams: 100 })), { grams: 200, litreAsKg: false });
  assert.deepEqual(gramsOfPurchase(bill('Butter', 2, 'pcs', 210), { gramsPerPiece: 500 }), { grams: 1000, litreAsKg: false });
});

await test('item name matching keeps chicken 65 masala out of chicken', () => {
  const chicken = INGREDIENT_BY_ID.chicken.match;
  assert.ok(matchesItem('Chicken', chicken));
  assert.ok(matchesItem('chicken boneless', chicken));
  assert.ok(!matchesItem('Chicken 65 Masala', chicken));
  assert.ok(matchesItem('Chicken 65 Masala', INGREDIENT_BY_ID.c65.match));
  assert.ok(!matchesItem('Black Salt', INGREDIENT_BY_ID.salt.match));
  assert.ok(matchesItem('Tata Salt', INGREDIENT_BY_ID.salt.match));
  assert.ok(!matchesItem('Butter Paper', INGREDIENT_BY_ID.butter.match));
  assert.ok(!matchesItem('Liquid Cheese', INGREDIENT_BY_ID.cheese.match));
  assert.ok(matchesItem('Liquid Cheese', INGREDIENT_BY_ID.liqcheese.match));
});

await test('price lookup: trimmed median, a g/kg slip ignored, windows and links', () => {
  assert.equal(trimmedMedian([250, 260, 255, 0.26])!.value, 255); // the slipped 0.26 is dropped
  const bills = [
    bill('Chicken', 10, 'kg', 2500, '2026-10-19'), bill('Chicken', 8, 'kg', 2080, '2026-10-12'), bill('Chicken', 12, 'kg', 3060, '2026-10-05'),
    bill('Chicken', 10, 'g', 2600, '2026-10-02'), // 10 g for ₹2,600 = ₹260,000 a kg: implausible, skipped
    bill('Chicken 65 Masala', 6, 'pcs', 60, '2026-10-18'),
  ];
  const p = priceForIngredient(bills, { match: INGREDIENT_BY_ID.chicken.match, asOf: TODAY });
  assert.ok(p.ok);
  if (p.ok) {
    near(p.perKg, 255, 0.001); // median of 250, 260, 255
    near(p.perG, 0.255, 1e-9);
    assert.equal(p.samples, 3);
    assert.equal(p.confidence, 'ok');
    assert.equal(p.latestDate, '2026-10-19');
    assert.equal(p.windowDays, 90);
    assert.ok(p.used.every((u) => u.itemName === 'Chicken'));
  }
  // Only old bills: the window widens to a year; a single bill is "few".
  const old = priceForIngredient([bill('Paneer', 2, 'kg', 760, '2026-03-01')], { match: INGREDIENT_BY_ID.paneer.match, asOf: TODAY });
  assert.ok(old.ok && old.windowDays === 365 && old.confidence === 'few');
  // Older than a year: no price.
  const gone = priceForIngredient([bill('Paneer', 2, 'kg', 760, '2025-01-01')], { match: INGREDIENT_BY_ID.paneer.match, asOf: TODAY });
  assert.ok(!gone.ok && gone.reason === 'too-old');
  // Bought by the piece with no weight: no price until the owner says what a pack weighs.
  const butter = [bill('Amul Butter', 2, 'pcs', 210, '2026-10-10'), bill('Amul Butter', 1, 'pcs', 105, '2026-10-17')];
  const none = priceForIngredient(butter, { match: INGREDIENT_BY_ID.butter.match, asOf: TODAY });
  assert.ok(!none.ok && none.reason === 'piece-no-weight');
  const linked = priceForIngredient(butter, { match: INGREDIENT_BY_ID.butter.match, link: { itemKeys: ['amul butter'], gramsPerPiece: 100 }, asOf: TODAY });
  assert.ok(linked.ok && linked.linked);
  if (linked.ok) near(linked.perKg, 1050, 0.001);
  // A link replaces the name match entirely.
  const other = priceForIngredient(bills, { match: INGREDIENT_BY_ID.chicken.match, link: { itemKeys: ['desi chicken'] }, asOf: TODAY });
  assert.ok(!other.ok && other.reason === 'no-purchases');
});

// ---- the section D worked example ----
const chk = SHEET_BY_ID.st_chicken;
const ex = [9.85, 9.92, 9.70].map((kg) => batch('st_chicken', CHK_G, kg, { portions: portions(20.4), count: 480, minutes: 90 }));

await test('averages, yield and spread: the section D worked example', () => {
  const f = batchFacts(chk, ex[0]);
  assert.equal(f.inputG, 9960);
  near(f.yieldPct, 98.896, 0.001);
  const calc = deriveStandard(chk, ex);
  near(calc.yieldPct, 98.6, 0.05, 'average yield');
  near(calc.yieldSpread, 2.2, 0.05, 'yield spread');
  near(calc.outputG, 9823.3, 0.1);
  near(calc.portionG, 20.4, 1e-9, 'ten fillings average');
  assert.equal(Math.floor(calc.outputG / calc.portionG!), 481); // momos per batch
  assert.equal(calc.flags.length, 0);
  const onion = calc.ingredients.find((i) => i.key === 'onion')!;
  near(onion.perKgInput, (5550 / 9960) * 1000, 1e-9);
  near(onion.stdG, 5550, 1e-6);
  assert.ok(onion.main);
  assert.equal(calc.ingredients.find((i) => i.key === 'salt')!.main, false);
  assert.equal(spreadPct([10]), null);
  near(spreadPct([9.85, 9.92, 9.70]), 2.24, 0.01);
});

await test('spread above 10% flags yield, portion and main ingredients - not minor ones', () => {
  const b1 = batch('st_chicken', CHK_G, 9.8, { portions: portions(20), minutes: 60 });
  const b2 = batch('st_chicken', { ...CHK_G, onion: 4000, salt: 130 }, 7.5, { portions: portions(24), minutes: 60 });
  const b3 = batch('st_chicken', CHK_G, 9.8, { portions: portions(20), minutes: 61 });
  const calc = deriveStandard(chk, [b1, b2, b3]);
  const whats = calc.flags.map((f) => f.what + (f.key ? `:${f.key}` : ''));
  assert.ok(whats.includes('yield'), whats.join());
  assert.ok(whats.includes('portion'), whats.join());
  assert.ok(whats.includes('ingredient:onion'), whats.join());
  assert.ok(!whats.includes('ingredient:salt'), 'salt is not a main ingredient');
  assert.ok(!whats.includes('minutes'));
  // A main ingredient left out of one batch is flagged as "used in 2 of 3".
  const b4 = batch('st_chicken', { ...CHK_G, chicken: undefined as unknown as number }, 6.6, { portions: portions(20) });
  const calc2 = deriveStandard(chk, [b1, b3, b4]);
  assert.ok(calc2.flags.some((f) => f.what === 'ingredient' && f.key === 'chicken' && f.usedIn === 2));
});

await test('validation: obviously wrong units flagged with a one-tap fix', () => {
  const base: BatchInput = { clientId: 'client-0001', sheetId: 'st_chicken', date: TODAY, lines: lines('st_chicken', CHK_G), output: { qty: 9.8, unit: 'kg' }, portions: portions(20) };
  assert.deepEqual(validateBatch(chk, base, [], TODAY).filter((i) => i.level === 'error'), []);
  // 3000 kg of chicken: more than the big scale weighs; the fix makes it 3000 g.
  const slip = { ...base, lines: lines('st_chicken', CHK_G, { chicken: { qty: 3000, unit: 'kg', scale: 'B' } }) };
  const over = validateBatch(chk, slip, [], TODAY).find((i) => i.code === 'over-scale');
  assert.ok(over && over.lineKey === 'chicken' && over.fix?.unit === 'g');
  // 3.2 g of chicken where earlier batches had ~32%: unusual, and switching to kg fits.
  const tiny = { ...base, lines: lines('st_chicken', CHK_G, { chicken: { qty: 3.2, unit: 'g' } }) };
  const unusual = validateBatch(chk, tiny, ex, TODAY).find((i) => i.code === 'unusual');
  assert.ok(unusual && unusual.fix?.unit === 'kg', JSON.stringify(unusual));
  // Finished weight typed as 9.8 g: far below what went in; the fix is kg.
  const out = validateBatch(chk, { ...base, output: { qty: 9.8, unit: 'g' } }, [], TODAY).find((i) => i.code === 'output-low');
  assert.ok(out && out.fix?.target === 'output' && out.fix.unit === 'kg');
  // Errors: an ingredient neither weighed nor crossed out, too few portions, no finished weight, a future date.
  const bad = { ...base, date: '2026-11-02', lines: lines('st_chicken', CHK_G, { onion: { qty: null, notUsed: false } }), output: { qty: null, unit: 'kg' as const }, portions: [20, 21] };
  const codes = validateBatch(chk, bad, [], TODAY).filter((i) => i.level === 'error').map((i) => i.code).sort();
  assert.deepEqual(codes, ['date-future', 'line-missing', 'output-missing', 'portions-few']);
  // Batter pick-up: the same 10 momos must weigh more after the batter.
  const batter = SHEET_BY_ID.batter;
  const bIn: BatchInput = { clientId: 'client-0002', sheetId: 'batter', date: TODAY, lines: lines('batter', { maida: 520, cornflour: 30, ararut: 30, salt: 12, chillipowder: 12, c65: 30, tandoori: 20, pepper: 4, water: 950 }), output: { qty: 1.58, unit: 'kg' }, pickup: { before: 300, after: 290, n: 10 } };
  assert.ok(validateBatch(batter, bIn, [], TODAY).some((i) => i.code === 'pickup-order'));
  near(batchFacts(batter, { ...bIn, pickup: { before: 300, after: 325, n: 10 } }).pickupG, 2.5, 1e-9);
});

await test('cleanBatchInput drops unknown keys and bad numbers', () => {
  const c = cleanBatchInput({ clientId: 'abcdefgh12', sheetId: 'dough', date: TODAY, lines: [{ key: 'maida', qty: '5', unit: 'kg', scale: 'B' }, { key: 'hacker', qty: 1 }, { key: 'x:extra-salt', name: 'Extra salt', qty: 10 }], output: { qty: 'abc', unit: 'kg' } })!;
  assert.deepEqual(c.lines.map((l) => l.key), ['maida', 'x:extra-salt']);
  assert.equal(c.lines[0].qty, 5);
  assert.equal(c.output.qty, null);
  assert.equal(cleanBatchInput({ sheetId: 'nope' }), null);
});

// ---- costs ----
const PRICES: PurchaseLike[] = [
  ...['2026-10-19', '2026-10-12', '2026-10-05'].flatMap((d) => [
    bill('Maida', 50, 'kg', 1850, d), bill('Salt', 1, 'kg', 29, d), bill('Refined Oil', 1, 'L', 142.25 * 0.92 / 0.92, d),
    bill('Chicken', 10, 'kg', 2600, d), bill('Onion', 10, 'kg', 560, d), bill('Butter', 0.5, 'kg', 263.5, d), bill('Garlic', 1, 'kg', 216, d),
    bill('Ginger', 1, 'kg', 100, d), bill('Green Chilli', 1, 'kg', 110, d), bill('Coriander Leaves', 1, 'kg', 162, d), bill('Aromatic Powder', 1, 'kg', 330, d),
    bill('Ajinomoto', 1, 'kg', 200, d), bill('Black Pepper', 1, 'kg', 950, d), bill('Sugar', 1, 'kg', 60, d), bill('Cheese', 1, 'kg', 477.5, d),
    bill('Cornflakes', 1, 'kg', 247, d), bill('Corn Flour', 1, 'kg', 80, d), bill('Ararut', 1, 'kg', 50, d), bill('Chilli Powder', 1, 'kg', 436, d),
    bill('Chicken 65 Masala', 1, 'kg', 666.67, d), bill('Tandoori Masala', 1, 'kg', 610, d), bill('Chilli Flakes', 1, 'kg', 570, d),
  ]),
];
const DOUGH_G = { maida: 5000, water: 2250, salt: 50, oil: 100 };
const dough = [7.3, 7.35, 7.4].map((kg) => batch('dough', DOUGH_G, kg, { portions: portions(10) }));
const std = (sheetId: string, bs: Batch[], version = 1): StandardDoc => {
  const calc = deriveStandard(SHEET_BY_ID[sheetId], bs);
  const s = { version, setAt: '2026-10-26T10:00:00.000Z', setById: 'OWNER', setByName: 'Owner', note: '', calc };
  return { sheetId, current: s, history: [s] };
};

await test('cost per kg uses real prices, the usable % and component standards', () => {
  const standards: Record<string, StandardDoc> = { dough: std('dough', dough) };
  const r = makeResolver({ standards, purchases: PRICES, links: {}, asOf: TODAY });
  const d = r.sheetCost('dough');
  assert.ok(d.ok);
  // 5 kg maida at ₹37/kg + 50 g salt at ₹29/kg + 100 g oil at ₹142.25/L (0.92 g/ml), water free, per 7.35 kg of dough.
  const batchCost = 5000 * 0.037 + 50 * 0.029 + 100 * (142.25 / 920);
  if (d.ok) near(d.costPerKg, batchCost / 7.35, 0.05);
  // Onion weighed 6.2 kg before peeling and 5.55 kg after: priced on what was bought.
  const peeled = ex.map((b) => ({ ...b, lines: b.lines.map((l) => (l.key === 'onion' ? { ...l, beforeQty: 6.2, beforeUnit: 'kg' as const } : l)) }));
  const calc = deriveStandard(chk, peeled);
  const onion = calc.ingredients.find((i) => i.key === 'onion')!;
  near(onion.usable, 5.55 / 6.2, 1e-9);
  const cost = costCalc(calc, r.ingredientPrice);
  assert.ok(cost.complete);
  const onionLine = cost.lines.find((l) => l.key === 'onion')!;
  near(onionLine.perG, 0.056 / (5.55 / 6.2), 1e-9);
  assert.equal(cost.lines.find((l) => l.key === 'garlic')!.prepLossUnmeasured, true);
  assert.equal(cost.pricesAsOf, '2026-10-19');
  // Chicken cheese stuffing uses chicken stuffing: no price until R-04 has a standard.
  const cc = batch('st_chicken_cheese', { st_chicken: 4250, cheese: 750 }, 4.95, { portions: portions(20) });
  const ccCalc = deriveStandard(SHEET_BY_ID.st_chicken_cheese, [cc]);
  const noBase = costCalc(ccCalc, r.ingredientPrice);
  assert.ok(!noBase.complete && noBase.missing.includes('st_chicken'));
  const r2 = makeResolver({ standards: { ...standards, st_chicken: std('st_chicken', ex) }, purchases: PRICES, links: {}, asOf: TODAY });
  const withBase = costCalc(ccCalc, r2.ingredientPrice);
  assert.ok(withBase.complete);
  const stuffingPerG = (r2.sheetCost('st_chicken') as { costPerG: number }).costPerG;
  near(withBase.costPerKgOutput, ((4250 * stuffingPerG) + 750 * 0.4775) / 4.95, 0.01);
});

await test('cost per piece: wrapper x dough + filling x filling (+ batter and coating for kurkure)', () => {
  const standards: Record<string, StandardDoc> = { dough: std('dough', dough), st_chicken: std('st_chicken', ex) };
  const r = makeResolver({ standards, purchases: PRICES, links: {}, asOf: TODAY });
  const c = momoCost('chicken', r, standards);
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    const doughPerG = (r.sheetCost('dough') as { costPerG: number }).costPerG;
    const fillPerG = (r.sheetCost('st_chicken') as { costPerG: number }).costPerG;
    near(c.costPerPiece, 10 * doughPerG + 20.4 * fillPerG, 0.006);
    assert.deepEqual(c.components.map((x) => x.part), ['wrapper', 'filling']);
    assert.equal(c.standardVersion, 'dough@1+st_chicken@1');
    assert.equal(c.pricesAsOf, '2026-10-19');
  }
  // No veg stuffing standard: nothing for veg momos (no made-up numbers).
  const veg = momoCost('veg', r, standards);
  assert.ok(!veg.ok && veg.missing.some((m) => m.sheetId === 'st_veg' && m.reason === 'no-standard'));
  // Kurkure needs the batter and coating standards too.
  const kk = batch('st_chicken_kurkure', { st_chicken: 4950, gchilli: 40, c65: 15 }, 4.98, { portions: portions(20) });
  const withKk = { ...standards, st_chicken_kurkure: std('st_chicken_kurkure', [kk, kk, kk]) };
  const r2 = makeResolver({ standards: withKk, purchases: PRICES, links: {}, asOf: TODAY });
  const noCoat = momoCost('chickenKurkure', r2, withKk);
  assert.ok(!noCoat.ok && noCoat.missing.map((m) => m.part).sort().join() === 'batter,coating');
  const bat = batch('batter', { maida: 520, cornflour: 30, ararut: 30, salt: 12, chillipowder: 12, c65: 30, tandoori: 20, pepper: 4, water: 950 }, 1.58, { pickup: { before: 300, after: 325, n: 10 } });
  const coat = batch('coating', { cornflakes: 1850, maida: 100, chilliflakes: 20, salt: 20, pepper: 10 }, 1.95, { pickup: { before: 325, after: 360, n: 10 } });
  const all = { ...withKk, batter: std('batter', [bat, bat, bat]), coating: std('coating', [coat, coat, coat]) };
  const r3 = makeResolver({ standards: all, purchases: PRICES, links: {}, asOf: TODAY });
  const full = momoCost('chickenKurkure', r3, all);
  assert.ok(full.ok, JSON.stringify(full));
  if (full.ok) {
    const g = (part: string) => full.components.find((x) => x.part === part)!.grams;
    assert.equal(g('batter'), 2.5);
    assert.equal(g('coating'), 3.5);
    near(full.costPerPiece, full.components.reduce((s, x) => s + x.grams * x.costPerG, 0), 0.01);
  }
  // A price missing anywhere (cornflakes never bought): no cost.
  const r4 = makeResolver({ standards: all, purchases: PRICES.filter((p) => p.itemName !== 'Cornflakes'), links: {}, asOf: TODAY });
  const noPrice = momoCost('chickenKurkure', r4, all);
  assert.ok(!noPrice.ok && noPrice.missing.some((m) => m.part === 'coating' && m.reason === 'no-price' && m.keys?.includes('cornflakes')));
});

await test('sheet status: 0-2 of 3, ready, set, and new batches after a standard', () => {
  const bs = ex.slice(0, 2);
  assert.deepEqual(sheetStatus(bs, null), { code: 'todo', n: 2, version: null, newSince: 0 });
  assert.equal(sheetStatus(ex, null).code, 'ready');
  const doc = std('st_chicken', ex);
  assert.deepEqual(sheetStatus(ex, doc), { code: 'set', n: 0, version: 1, newSince: 0 });
  const later = [1, 2, 3].map((i) => batch('st_chicken', CHK_G, 9.8, { enteredAt: `2026-10-27T0${i}:00:00.000Z`, portions: portions(20) }));
  assert.deepEqual(sheetStatus([...ex, later[0]], doc), { code: 'set', n: 1, version: 1, newSince: 1 });
  assert.equal(sheetStatus([...ex, ...later], doc).code, 'ready');
  assert.deepEqual(defaultReviewIds([...ex, ...later], doc), later.map((b) => b.id));
  assert.deepEqual(defaultReviewIds([...ex, later[0]], doc), ex.map((b) => b.id));
  // An excluded batch doesn't count.
  assert.equal(sheetStatus([ex[0], ex[1], { ...ex[2], status: 'excluded' }], null).n, 2);
});

await test('permissions: who enters, reviews and sets the standard', () => {
  const owner = recipeAccess({ role: 'cluster_head' });
  const ops = recipeAccess({ role: 'manager', designation: 'operations_incharge' });
  const head = recipeAccess({ role: 'employee', designation: 'production_incharge', employeeId: 'BM002' });
  const headMgr = recipeAccess({ role: 'manager', designation: 'production_incharge', employeeId: 'BM002' });
  const crew = recipeAccess({ role: 'employee', designation: 'production_ops', employeeId: 'BM010' }, ['BM010']);
  const notCrew = recipeAccess({ role: 'employee', designation: 'production_ops', employeeId: 'BM011' }, ['BM010']);
  const store = recipeAccess({ role: 'manager', designation: 'store_incharge', employeeId: 'BM003' });
  assert.deepEqual([owner.canEnter, owner.canReview, owner.canApprove, owner.canSeeCosts], [true, true, true, true]);
  assert.deepEqual([ops.canEnter, ops.canReview, ops.canApprove, ops.canSeeCosts, ops.canManageCrew], [true, true, false, true, true]);
  for (const h of [head, headMgr]) assert.deepEqual([h.canEnter, h.canReview, h.canApprove, h.canSeeCosts, h.canManageCrew], [true, false, false, false, true]);
  assert.deepEqual([crew.canEnter, crew.canReview, crew.canManageCrew, crew.isCrew], [true, false, false, true]);
  assert.deepEqual([notCrew.canEnter, notCrew.canView], [false, false]);
  assert.deepEqual([store.canEnter, store.canReview], [false, false]);
});

// ---- the server core with an in-memory store ----
function memoryKv(seed: Record<string, any> = {}) {
  const m = new Map<string, any>(Object.entries(seed));
  return {
    m,
    get: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : null),
    set: async (k: string, v: any) => { m.set(k, structuredClone(v)); },
    del: async (k: string) => { m.delete(k); },
    getByPrefix: async (p: string) => [...m.entries()].filter(([k]) => k.startsWith(p)).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => structuredClone(v)),
  };
}
const user = (id: string, meta: Record<string, unknown>) => ({ id, user_metadata: meta });

await test('server: crew may send, others not; the same batch sent twice is saved once', async () => {
  const kv = memoryKv({
    'unified-employee:BM010': { employeeId: 'BM010', name: 'Vijay', designation: 'production_ops', department: 'production' },
    'unified-employee:BM011': { employeeId: 'BM011', name: 'Aniket', designation: 'production_ops', department: 'production' },
    'unified-employee:BM002': { employeeId: 'BM002', name: 'Head', designation: 'production_incharge', department: 'production' },
    'recipe-settings': { crewIds: ['BM010'], links: {} },
  });
  const core = createRecipeCore({ kv, verifyUser: async () => ({}), getTodayIST: () => TODAY });
  const crew = await core.actorFromUser(user('auth-10', { role: 'employee', employeeId: 'BM010' }));
  const other = await core.actorFromUser(user('auth-11', { role: 'employee', employeeId: 'BM011' }));
  const body = { clientId: 'phone-draft-0001', sheetId: 'dough', date: TODAY, lines: lines('dough', DOUGH_G), output: { qty: 7.35, unit: 'kg' }, portions: portions(10), count: 735 };
  assert.equal((await core.submit(other, body)).status, 403);
  const first = await core.submit(crew, body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.batch.enteredByName, 'Vijay');
  const again = await core.submit(crew, { ...body, output: { qty: 99, unit: 'kg' } });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.batch.output.qty, 7.35); // the first save stands
  assert.equal([...kv.m.keys()].filter((k) => k.startsWith('recipe-batch:')).length, 1);
  // Errors come back as 422 with the issues; nothing is saved.
  const broken = await core.submit(crew, { ...body, clientId: 'phone-draft-0002', output: { qty: null, unit: 'kg' } });
  assert.equal(broken.status, 422);
  assert.ok(broken.body.issues.some((i: any) => i.code === 'output-missing'));
  assert.equal(kv.m.has('recipe-batch:dough:phone-draft-0002'), false);
  // The production head picks the crew; a crew member can't.
  const head = await core.actorFromUser(user('auth-2', { role: 'employee', employeeId: 'BM002', designation: 'production_incharge' }));
  assert.equal((await core.saveCrew(crew, { crewIds: ['BM011'] })).status, 403);
  assert.equal((await core.saveCrew(head, { crewIds: ['BM010', 'BM011', 'NOPE'] })).body.crewIds.join(), 'BM010,BM011');
});

await test('server: ops review, only the owner sets the standard; costs published only when complete', async () => {
  const kv = memoryKv({ 'recipe-settings': { crewIds: [], links: {} } });
  PRICES.forEach((p, i) => kv.m.set(`inventory:u:${i}`, p));
  let clock = Date.parse('2026-10-26T08:00:00.000Z');
  const core = createRecipeCore({ kv, verifyUser: async () => ({}), getTodayIST: () => TODAY, now: () => new Date((clock += 60000)) });
  const owner = await core.actorFromUser(user('auth-owner', { role: 'cluster_head', name: 'Owner' }));
  const ops = await core.actorFromUser(user('auth-ops', { role: 'manager', designation: 'operations_incharge', name: 'Ops' }));
  const head = await core.actorFromUser(user('auth-head', { role: 'employee', designation: 'production_incharge', name: 'Head' }));
  const send = async (sheetId: string, id: string, grams: Record<string, number>, kg: number, extra: Record<string, unknown> = {}) => {
    const r = await core.submit(head, { clientId: id, sheetId, date: TODAY, lines: lines(sheetId, grams), output: { qty: kg, unit: 'kg' }, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  };
  for (const [i, kg] of [7.3, 7.35, 7.4].entries()) await send('dough', `dough-batch-${i}`, DOUGH_G, kg, { portions: portions(10) });
  for (const [i, kg] of [9.85, 9.92, 9.7].entries()) await send('st_chicken', `chk-batch-${i}`, CHK_G, kg, { portions: portions(20.4) });

  assert.equal((await core.review(head, 'dough')).status, 403);
  const rv = await core.review(ops, 'st_chicken');
  assert.equal(rv.status, 200);
  assert.equal(rv.body.selected.length, 3);
  near(rv.body.calc.yieldPct, 98.6, 0.05);
  assert.ok(rv.body.cost.complete);
  assert.equal(rv.body.batchCosts.length, 3);

  assert.equal((await core.costs(ops)).status, 200);
  assert.deepEqual((await core.costs(ops)).body, {}); // nothing approved yet
  assert.equal((await core.costs(head)).status, 403);

  assert.equal((await core.setStandard(ops, 'dough', { batchIds: rv.body.selected })).status, 403);
  const doughIds = (await core.review(owner, 'dough')).body.selected;
  const setDough = await core.setStandard(owner, 'dough', { batchIds: doughIds, note: 'As we make it' });
  assert.equal(setDough.status, 200, JSON.stringify(setDough.body));
  assert.equal(setDough.body.standard.current.version, 1);
  assert.ok(setDough.body.standard.current.costAtSet.costPerKg > 0);
  assert.equal((await core.setStandard(owner, 'st_chicken', { batchIds: rv.body.selected.slice(0, 2) })).status, 400);
  assert.equal((await core.setStandard(owner, 'st_chicken', { batchIds: rv.body.selected })).status, 200);

  const costs = (await core.costs(owner)).body;
  assert.deepEqual(Object.keys(costs), ['chicken']);
  assert.deepEqual(Object.keys(costs.chicken).sort(), ['components', 'costPerPiece', 'pricesAsOf', 'standardVersion']);
  assert.ok(costs.chicken.costPerPiece > 0);
  assert.equal(costs.chicken.pricesAsOf, '2026-10-19');

  // A batch in a standard can't be left out; a new set of 3 makes version 2 and keeps version 1.
  assert.equal((await core.setBatchStatus(owner, 'dough', doughIds[0], { status: 'excluded', note: 'wrong' })).status, 409);
  for (const [i, kg] of [7.2, 7.25, 7.3].entries()) await send('dough', `dough-round2-${i}`, { ...DOUGH_G, water: 2200 }, kg, { portions: portions(10.5) });
  const ov = (await core.overview(owner)).body;
  assert.equal(ov.sheets.find((s: any) => s.sheetId === 'dough').status.code, 'ready');
  const v2ids = (await core.review(owner, 'dough')).body.selected;
  assert.ok(v2ids.every((id: string) => id.startsWith('dough-round2')));
  const v2 = await core.setStandard(owner, 'dough', { batchIds: v2ids });
  assert.equal(v2.body.standard.current.version, 2);
  assert.deepEqual(v2.body.standard.history.map((h: any) => h.version), [1, 2]);
  const after = (await core.costs(owner)).body;
  assert.equal(after.chicken.standardVersion, 'dough@2+st_chicken@1');
});

await test('server: setting a standard with a spread above 10% needs a reason', async () => {
  const kv = memoryKv({ 'recipe-settings': { crewIds: [], links: {} } });
  const core = createRecipeCore({ kv, verifyUser: async () => ({}), getTodayIST: () => TODAY });
  const owner = await core.actorFromUser(user('auth-owner', { role: 'cluster_head' }));
  const ids: string[] = [];
  for (const [i, kg] of [7.3, 6.0, 7.4].entries()) {
    const id = `spread-batch-${i}`;
    ids.push(id);
    assert.equal((await core.submit(owner, { clientId: id, sheetId: 'dough', date: TODAY, lines: lines('dough', DOUGH_G), output: { qty: kg, unit: 'kg' }, portions: portions(10) })).status, 201);
  }
  const refused = await core.setStandard(owner, 'dough', { batchIds: ids });
  assert.equal(refused.status, 422);
  assert.ok(refused.body.flags.some((f: any) => f.what === 'yield'));
  const okay = await core.setStandard(owner, 'dough', { batchIds: ids, overrideReason: 'Batch 2 lost dough on the floor; weighed what was left' });
  assert.equal(okay.status, 200);
  assert.ok(okay.body.standard.current.overrideReason);
});

console.log(`recipeRules: ${passed} tests passed`);
