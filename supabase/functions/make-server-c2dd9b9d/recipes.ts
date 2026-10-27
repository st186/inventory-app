// Recipe capture sheets (owner, 27 Oct 2026). Instead of the printed "How we do it today"
// workbook, the production head fills each recipe sheet in the app while working the usual
// way; each recipe is captured over 3 batches; the averages become the standard (quantities,
// yield, portion weight) once the owner approves it, and the cost per piece is worked out from
// the business's real purchase prices. Nothing here uses a made-up cost: a momo type with any
// standard or price missing has no cost at all. The maths lives in recipeRules.ts (shared with
// the app). Registered from index.ts.
//
// KV:
//   recipe-batch:{sheetId}:{batchId}   one measured batch (batchId = the phone's client id, so a
//                                      repeat send finds it and saves nothing twice)
//   recipe-standard:{sheetId}          { current, history[] } - every approved version is kept
//   recipe-settings                    { crewIds, links } - the kitchen crew the production head
//                                      picked, and the owner's ingredient -> purchase item links
// Photos: private bucket recipe-photos at {sheetId}/{batchId}.{ext}, streamed through
// GET /recipes/photo to people who may see the sheet (no public links).
//
// Who: production incharge, the crew he picks, operations managers and the owner fill batches;
// the owner and operations managers review and see costs; only the owner sets a standard.

import { INGREDIENT_BY_ID, MOMO_TYPES, SHEETS, SHEET_BY_ID } from './recipeCatalog.ts';
import {
  TRIALS, cleanBatchInput, costCalc, defaultReviewIds, deriveStandard, makeResolver, momoCost,
  recipeAccess, sheetStatus, validateBatch, isExtraKey,
  type Batch, type RecipeAccess, type Standard, type StandardDoc,
} from './recipeRules.ts';
import { addDaysISO, priceItemKey, type PriceLink, type PurchaseLike } from './priceRules.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del?: (key: string) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
};
type DateRange = { from?: string; to?: string; field: string };
export type RecipeDeps = {
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  getTodayIST: () => string;
  // Paginated prefix read with an optional date window (index.ts getAllByPrefixWithRetry).
  getAllByPrefix?: (prefix: string, range?: DateRange | null) => Promise<any[]>;
  storage?: any; // service-role Supabase Storage client, for batch photos
  now?: () => Date;
};

type Settings = { crewIds: string[]; links: Record<string, PriceLink>; updatedAt?: string; updatedBy?: string };
export type RecipeActor = {
  authUserId: string;
  employeeId: string | null;
  name: string;
  role: string;
  designation: string | null;
  houseId: string | null;
  access: RecipeAccess;
};
export type Result = { status: number; body?: any; bytes?: Uint8Array; contentType?: string };

const P = '/make-server-c2dd9b9d';
const batchKey = (sheetId: string, id: string) => `recipe-batch:${sheetId}:${id}`;
const standardKey = (sheetId: string) => `recipe-standard:${sheetId}`;
const SETTINGS_KEY = 'recipe-settings';
const BUCKET = 'recipe-photos';
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CACHE_MS = 5 * 60 * 1000;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const empIdOf = (e: any) => String(e?.employeeId || e?.id || '');
const isProductionPerson = (e: any) => e?.department === 'production' || /^production_/.test(String(e?.designation || ''));
const ok = (body: any, status = 200): Result => ({ status, body });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, body: { error, ...extra } });

export function createRecipeCore(deps: RecipeDeps) {
  const { kv } = deps;
  const now = () => (deps.now ? deps.now() : new Date());
  let purchaseCache: { at: number; day: string; rows: PurchaseLike[] } | null = null;
  let costCache: { at: number; day: string; body: any } | null = null;

  async function settings(): Promise<Settings> {
    const s = await kv.get<Settings>(SETTINGS_KEY);
    return { crewIds: Array.isArray(s?.crewIds) ? s!.crewIds : [], links: s?.links && typeof s.links === 'object' ? s.links : {}, updatedAt: s?.updatedAt, updatedBy: s?.updatedBy };
  }

  async function actorFromUser(user: any): Promise<RecipeActor> {
    const meta = user?.user_metadata || {};
    const employeeId = meta.employeeId ? String(meta.employeeId) : null;
    const emp = employeeId ? await kv.get<any>(`unified-employee:${employeeId}`) : null;
    const role = String(meta.role || 'employee');
    const designation = (meta.designation ?? emp?.designation) || null;
    const s = await settings();
    return {
      authUserId: String(user?.id || ''),
      employeeId,
      name: String(emp?.name || meta.name || 'Manager'),
      role,
      designation,
      houseId: (meta.productionHouseId ?? emp?.productionHouseId ?? (designation === 'production_incharge' ? meta.storeId ?? emp?.storeId : null)) || null,
      access: recipeAccess({ role, designation, employeeId }, s.crewIds),
    };
  }

  async function allBatches(sheetId?: string): Promise<Batch[]> {
    const rows = (await kv.getByPrefix<Batch>(sheetId ? `recipe-batch:${sheetId}:` : 'recipe-batch:')) || [];
    return rows.filter((b) => b && b.id && b.sheetId && (!sheetId || b.sheetId === sheetId))
      .sort((a, b) => String(a.enteredAt).localeCompare(String(b.enteredAt)));
  }

  async function allStandards(): Promise<Record<string, StandardDoc>> {
    const rows = (await kv.getByPrefix<StandardDoc>('recipe-standard:')) || [];
    return Object.fromEntries(rows.filter((d) => d?.sheetId).map((d) => [d.sheetId, d]));
  }

  // The last year of purchase bills (item, quantity, unit, amount, date), kept 5 minutes.
  async function purchases(): Promise<PurchaseLike[]> {
    const day = deps.getTodayIST();
    if (purchaseCache && purchaseCache.day === day && Date.now() - purchaseCache.at < CACHE_MS) return purchaseCache.rows;
    const range = { from: addDaysISO(day, -365), to: day, field: 'date' };
    const raw = deps.getAllByPrefix ? await deps.getAllByPrefix('inventory:', range) : await kv.getByPrefix<any>('inventory:');
    const rows: PurchaseLike[] = (raw || []).filter((r: any) => r && r.itemName).map((r: any) => ({
      itemName: String(r.itemName), quantity: Number(r.quantity) || 0, unit: String(r.unit || ''), totalCost: Number(r.totalCost) || 0,
      date: String(r.date || ''), packageType: r.packageType, weightPerUnitGrams: Number(r.weightPerUnitGrams) || undefined,
    }));
    purchaseCache = { at: Date.now(), day, rows };
    return rows;
  }

  async function employees(): Promise<any[]> {
    return ((await kv.getByPrefix<any>('unified-employee:')) || []).filter((e) => empIdOf(e) && e.status !== 'inactive' && e.role !== 'audit');
  }

  async function resolver(s?: Settings, standards?: Record<string, StandardDoc>) {
    const [set, stds, bills] = await Promise.all([s ? Promise.resolve(s) : settings(), standards ? Promise.resolve(standards) : allStandards(), purchases()]);
    return { r: makeResolver({ standards: stds, purchases: bills, links: set.links, asOf: deps.getTodayIST() }), standards: stds };
  }

  // ---------------------------------------------------------------- overview

  async function overview(actor: RecipeActor): Promise<Result> {
    const a = actor.access;
    if (!a.canView) return ok({ access: a, today: deps.getTodayIST(), sheets: [], perMomo: [], team: [], crew: null });
    const [batches, standards, s, people] = await Promise.all([allBatches(), allStandards(), settings(), employees()]);
    const bySheet = new Map<string, Batch[]>();
    for (const b of batches) bySheet.set(b.sheetId, [...(bySheet.get(b.sheetId) || []), b]);
    const sheets = SHEETS.map((sheet) => {
      const bs = bySheet.get(sheet.id) || [];
      const doc = standards[sheet.id] || null;
      const cur = doc?.current;
      return {
        sheetId: sheet.id,
        status: sheetStatus(bs, doc),
        active: bs.filter((b) => b.status !== 'excluded').length,
        lastAt: bs.length ? bs[bs.length - 1].enteredAt : null,
        standard: cur ? { version: cur.version, setAt: cur.setAt, setByName: cur.setByName, portionG: cur.calc.portionG, pickupG: cur.calc.pickupG, yieldPct: cur.calc.yieldPct, outputG: cur.calc.outputG } : null,
      };
    });
    const res = a.canSeeCosts ? (await resolver(s, standards)).r : null;
    const perMomo = MOMO_TYPES.map((t) => {
      const grams = {
        wrapper: standards.dough?.current?.calc.portionG ?? null,
        filling: standards[t.filling]?.current?.calc.portionG ?? null,
        ...(t.kurkure ? { batter: standards.batter?.current?.calc.pickupG ?? null, coating: standards.coating?.current?.calc.pickupG ?? null } : {}),
      };
      const needs = ['dough', t.filling, ...(t.kurkure ? ['batter', 'coating'] : [])].filter((id) => !standards[id]?.current);
      return { momoType: t.key, grams, needs, ...(res ? { cost: momoCost(t.key, res, standards) } : {}) };
    });
    const team = people.filter(isProductionPerson).map((e) => ({ id: empIdOf(e), name: String(e.name || empIdOf(e)), designation: e.designation || null }));
    const crew = a.canManageCrew
      ? people.filter((e) => isProductionPerson(e) && e.designation !== 'production_incharge').map((e) => ({ id: empIdOf(e), name: String(e.name || empIdOf(e)), designation: e.designation || null, picked: s.crewIds.includes(empIdOf(e)) }))
      : null;
    return ok({ access: a, today: deps.getTodayIST(), sheets, perMomo, team, crew, crewIds: a.canManageCrew ? s.crewIds : undefined });
  }

  // ---------------------------------------------------------------- one sheet

  async function sheet(actor: RecipeActor, sheetId: string): Promise<Result> {
    if (!actor.access.canView) return fail(403, 'Ask the production head to add you to the recipe crew');
    const def = SHEET_BY_ID[sheetId];
    if (!def) return fail(404, 'No such recipe sheet');
    const [batches, standards] = await Promise.all([allBatches(sheetId), allStandards()]);
    const doc = standards[sheetId] || null;
    return ok({ sheetId, status: sheetStatus(batches, doc), batches, standard: doc, access: actor.access, today: deps.getTodayIST() });
  }

  // ---------------------------------------------------------------- send a batch

  async function submit(actor: RecipeActor, raw: any): Promise<Result> {
    if (!actor.access.canEnter) return fail(403, 'Ask the production head to add you to the recipe crew');
    const input = cleanBatchInput(raw);
    if (!input) return fail(400, 'No such recipe sheet');
    if (!CLIENT_ID.test(input.clientId)) return fail(400, 'This batch has no id - update the app and send again');
    const key = batchKey(input.sheetId, input.clientId);
    const existing = await kv.get<Batch>(key);
    // Sent before (the answer was lost on a weak signal): the saved one, nothing written again.
    if (existing) return ok({ batch: existing, duplicate: true });

    const def = SHEET_BY_ID[input.sheetId];
    const history = (await allBatches(input.sheetId)).filter((b) => b.status !== 'excluded');
    const issues = validateBatch(def, input, history, deps.getTodayIST());
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length) return fail(422, 'Some boxes need fixing before this batch can be saved', { issues: errors });

    let photo: Batch['photo'] = null;
    let photoError: string | undefined;
    if (input.photo) {
      const stored = await storePhoto(input.sheetId, input.clientId, input.photo);
      if ('error' in stored) photoError = stored.error; else photo = stored;
    }
    const { photo: _drop, clientId, ...rest } = input;
    const batch: Batch = {
      ...rest,
      madeByName: rest.madeByName || actor.name,
      id: clientId,
      enteredById: actor.employeeId || actor.authUserId,
      enteredByName: actor.name,
      enteredAt: now().toISOString(),
      houseId: actor.houseId,
      photo,
      issues: issues.filter((i) => i.level === 'warning'),
      status: 'active',
    };
    // A second send that raced this one finds the same key; both write the same batch.
    const again = await kv.get<Batch>(key);
    if (again) return ok({ batch: again, duplicate: true });
    await kv.set(key, batch);
    costCache = null;
    const all = await allBatches(input.sheetId);
    const standards = await allStandards();
    return ok({ batch, duplicate: false, status: sheetStatus(all, standards[input.sheetId]), ...(photoError ? { photoError } : {}) }, 201);
  }

  // Leave a batch out (a wrong entry, a batch made differently) or bring it back. Kept either way.
  async function setBatchStatus(actor: RecipeActor, sheetId: string, batchId: string, body: any): Promise<Result> {
    const key = batchKey(sheetId, batchId);
    const batch = await kv.get<Batch>(key);
    if (!batch) return fail(404, 'No such batch');
    const own = (!!actor.employeeId && batch.enteredById === actor.employeeId) || batch.enteredById === actor.authUserId;
    if (!(actor.access.canReview || actor.designation === 'production_incharge' || (own && actor.access.canEnter))) return fail(403, 'You are not allowed to do this');
    const status = body?.status === 'active' ? 'active' : 'excluded';
    const note = str(body?.note, 300);
    if (status === 'excluded') {
      if (!note) return fail(400, 'Say why this batch is left out');
      const doc = (await allStandards())[sheetId];
      if (doc?.current?.calc.batchIds.includes(batchId)) return fail(409, `This batch is part of standard v${doc.current.version}`);
    }
    const next: Batch = { ...batch, status, statusNote: note || undefined, statusBy: actor.name, statusAt: now().toISOString() };
    await kv.set(key, next);
    costCache = null;
    return ok({ batch: next });
  }

  // ---------------------------------------------------------------- review

  async function review(actor: RecipeActor, sheetId: string, idsParam?: string | null): Promise<Result> {
    if (!actor.access.canReview) return fail(403, 'Only the owner and operations managers review recipes');
    const def = SHEET_BY_ID[sheetId];
    if (!def) return fail(404, 'No such recipe sheet');
    const [batches, standards, s] = await Promise.all([allBatches(sheetId), allStandards(), settings()]);
    const doc = standards[sheetId] || null;
    const wanted = idsParam ? idsParam.split(',').map((x) => x.trim()).filter(Boolean).slice(0, TRIALS) : defaultReviewIds(batches, doc);
    const chosen = wanted.map((id) => batches.find((b) => b.id === id)).filter((b): b is Batch => !!b);
    const { r } = await resolver(s, standards);
    const calc = chosen.length ? deriveStandard(def, chosen) : null;
    const cost = calc ? costCalc(calc, r.ingredientPrice) : null;
    const batchCosts = chosen.map((b) => ({ id: b.id, costPerKg: costCalc(deriveStandard(def, [b]), r.ingredientPrice).costPerKgOutput }));
    const current = doc?.current ? r.sheetCost(sheetId) : null;
    return ok({
      sheetId, today: deps.getTodayIST(), access: actor.access,
      batches, selected: chosen.map((b) => b.id), calc, cost, batchCosts,
      standard: doc, currentCost: current ? (current.ok ? { ok: true, costPerKg: current.costPerKg, pricesAsOf: current.pricesAsOf } : { ok: false, reason: current.reason, missing: current.missing }) : null,
      status: sheetStatus(batches, doc),
      links: Object.fromEntries(Object.entries(s.links).filter(([k]) => def.ingredients.includes(k) || isExtraKey(k))),
    });
  }

  // ---------------------------------------------------------------- set the standard (owner)

  async function setStandard(actor: RecipeActor, sheetId: string, body: any): Promise<Result> {
    if (!actor.access.canApprove) return fail(403, 'Only the owner sets a standard');
    const def = SHEET_BY_ID[sheetId];
    if (!def) return fail(404, 'No such recipe sheet');
    const ids: string[] = Array.isArray(body?.batchIds) ? [...new Set(body.batchIds.map((x: unknown) => str(x, 64)).filter(Boolean))] as string[] : [];
    if (ids.length !== TRIALS) return fail(400, `Pick ${TRIALS} batches`);
    const [batches, standards, s] = await Promise.all([allBatches(sheetId), allStandards(), settings()]);
    const chosen = ids.map((id) => batches.find((b) => b.id === id && b.status !== 'excluded'));
    if (chosen.some((b) => !b)) return fail(400, 'One of those batches is missing or left out');
    const calc = deriveStandard(def, chosen as Batch[]);
    const overrideReason = str(body?.overrideReason, 500);
    if (calc.flags.length && !overrideReason) return fail(422, 'Some results vary by more than 10% between the batches. Say why you are setting it anyway.', { flags: calc.flags });
    if (!(calc.outputG > 0)) return fail(422, 'These batches have no finished weight');
    const doc: StandardDoc = standards[sheetId] || { sheetId, current: null, history: [] };
    const version = Math.max(0, ...doc.history.map((h) => h.version)) + 1;
    const { r } = await resolver(s, standards);
    const snapshot = costCalc(calc, r.ingredientPrice);
    const std: Standard = {
      version,
      setAt: now().toISOString(),
      setById: actor.employeeId || actor.authUserId,
      setByName: actor.name,
      note: str(body?.note, 500),
      ...(calc.flags.length ? { overrideReason } : {}),
      calc,
      costAtSet: { costPerKg: snapshot.costPerKgOutput, pricesAsOf: snapshot.pricesAsOf },
    };
    const next: StandardDoc = { sheetId, current: std, history: [...doc.history, std] };
    await kv.set(standardKey(sheetId), next);
    costCache = null;
    return ok({ standard: next, status: sheetStatus(batches, next) });
  }

  // ---------------------------------------------------------------- cost per piece (published)

  // { momoType: { costPerPiece, components, standardVersion, pricesAsOf } } - only the momo types
  // whose dough, filling (and batter + coating) standards are approved and fully priced.
  async function costs(actor: RecipeActor): Promise<Result> {
    if (!actor.access.canSeeCosts) return fail(403, 'Only the owner and operations managers see recipe costs');
    const day = deps.getTodayIST();
    if (costCache && costCache.day === day && Date.now() - costCache.at < CACHE_MS) return ok(costCache.body);
    const { r, standards } = await resolver();
    const body: Record<string, any> = {};
    for (const t of MOMO_TYPES) {
      const c = momoCost(t.key, r, standards);
      if (c.ok) body[t.key] = { costPerPiece: c.costPerPiece, components: c.components, standardVersion: c.standardVersion, pricesAsOf: c.pricesAsOf };
    }
    costCache = { at: Date.now(), day, body };
    return ok(body);
  }

  // ---------------------------------------------------------------- crew and price links

  async function saveCrew(actor: RecipeActor, body: any): Promise<Result> {
    if (!actor.access.canManageCrew) return fail(403, 'Only the production head, operations managers and the owner pick the recipe crew');
    const known = new Set((await employees()).map(empIdOf));
    const ids = Array.isArray(body?.crewIds) ? [...new Set(body.crewIds.map((x: unknown) => str(x, 80)))].filter((id) => known.has(id as string)).slice(0, 60) as string[] : null;
    if (!ids) return fail(400, 'Pick the people');
    const s = await settings();
    const next: Settings = { ...s, crewIds: ids, updatedAt: now().toISOString(), updatedBy: actor.name };
    await kv.set(SETTINGS_KEY, next);
    return ok({ crewIds: ids });
  }

  // Distinct purchase item names of the last year, for linking an ingredient to its bills.
  async function priceItems(actor: RecipeActor): Promise<Result> {
    if (!actor.access.canEditPrices) return fail(403, 'Only the owner and operations managers change price links');
    const rows = await purchases();
    const map = new Map<string, { key: string; names: Map<string, number>; count: number; lastDate: string; units: Set<string> }>();
    for (const p of rows) {
      const key = priceItemKey(p.itemName);
      if (!key) continue;
      const e = map.get(key) || { key, names: new Map(), count: 0, lastDate: '', units: new Set<string>() };
      e.count++;
      e.names.set(p.itemName.trim(), (e.names.get(p.itemName.trim()) || 0) + 1);
      if (String(p.date || '') > e.lastDate) e.lastDate = String(p.date || '').slice(0, 10);
      if (p.unit) e.units.add(p.unit);
      map.set(key, e);
    }
    const items = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 500).map((e) => ({
      key: e.key, name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0], count: e.count, lastDate: e.lastDate, units: [...e.units],
    }));
    return ok({ items });
  }

  async function savePriceLink(actor: RecipeActor, body: any): Promise<Result> {
    if (!actor.access.canEditPrices) return fail(403, 'Only the owner and operations managers change price links');
    const key = str(body?.key, 60);
    const def = INGREDIENT_BY_ID[key];
    if (!(isExtraKey(key) || (def && !def.free && !def.component))) return fail(400, 'That ingredient has no purchase price');
    const itemKeys = Array.isArray(body?.itemKeys) ? [...new Set(body.itemKeys.map((x: unknown) => priceItemKey(str(x, 80))).filter(Boolean))].slice(0, 10) as string[] : [];
    const gpp = Number(body?.gramsPerPiece);
    const gramsPerPiece = Number.isFinite(gpp) && gpp > 0 && gpp <= 100000 ? gpp : null;
    const s = await settings();
    const links = { ...s.links };
    if (!itemKeys.length && !gramsPerPiece) delete links[key];
    else links[key] = { ...(itemKeys.length ? { itemKeys } : {}), ...(gramsPerPiece ? { gramsPerPiece } : {}) };
    await kv.set(SETTINGS_KEY, { ...s, links, updatedAt: now().toISOString(), updatedBy: actor.name });
    costCache = null;
    return ok({ key, link: links[key] || null });
  }

  // ---------------------------------------------------------------- photos

  async function storePhoto(sheetId: string, batchId: string, dataUrl: string): Promise<{ path: string; mimeType: string } | { error: string }> {
    if (!deps.storage) return { error: 'Photos are not set up' };
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!m) return { error: 'The photo must be a JPEG, PNG or WebP image' };
    if (m[2].length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64) return { error: 'The photo is too large' };
    let bin: string;
    try { bin = atob(m[2]); } catch { return { error: 'Could not read that photo' }; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const type = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : bytes[8] === 0x57 && bytes[9] === 0x45 ? 'image/webp' : null;
    if (!type || type !== m[1] || bytes.length < 500) return { error: 'That file is not a photo' };
    const path = `${sheetId}/${batchId}.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'}`;
    try {
      await ensureBucket(deps.storage);
      const { error } = await deps.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
      if (error) return { error: 'The photo could not be saved' };
      return { path, mimeType: type };
    } catch {
      return { error: 'The photo could not be saved' };
    }
  }

  async function photo(actor: RecipeActor, sheetId: string, batchId: string): Promise<Result> {
    if (!actor.access.canView) return fail(403, 'You are not allowed to see this photo');
    const batch = await kv.get<Batch>(batchKey(sheetId, batchId));
    if (!batch?.photo?.path || !deps.storage) return fail(404, 'No photo');
    const { data, error } = await deps.storage.from(BUCKET).download(batch.photo.path);
    if (error || !data) return fail(404, 'The photo is no longer kept');
    return { status: 200, bytes: new Uint8Array(await data.arrayBuffer()), contentType: batch.photo.mimeType };
  }

  return { actorFromUser, overview, sheet, submit, setBatchStatus, review, setStandard, costs, saveCrew, priceItems, savePriceLink, photo };
}

let bucketReady: Promise<void> | null = null;
function ensureBucket(storage: any): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data, error } = await storage.getBucket(BUCKET);
      if (data && !error) {
        if (data.public) await storage.updateBucket(BUCKET, { public: false });
        return;
      }
      const { error: createError } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
      if (createError && !/already exists/i.test(createError.message || '')) throw createError;
    })().catch((e) => { bucketReady = null; throw e; });
  }
  return bucketReady;
}

export function registerRecipeRoutes(app: any, deps: RecipeDeps) {
  const core = createRecipeCore(deps);
  const send = (c: any, r: Result) => (r.bytes
    ? c.body(r.bytes, r.status, { 'Content-Type': r.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' })
    : c.json(r.body, r.status));
  const route = (handler: (actor: RecipeActor, c: any) => Promise<Result>) => async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    try {
      return send(c, await handler(await core.actorFromUser(auth.user), c));
    } catch (e) {
      console.log('recipes route failed:', e instanceof Error ? e.message : String(e));
      return c.json({ error: 'Something went wrong - try again' }, 500);
    }
  };
  const body = async (c: any) => c.req.json().catch(() => ({}));

  app.get(`${P}/recipes/overview`, route((a) => core.overview(a)));
  app.get(`${P}/recipes/sheet/:sheetId`, route((a, c) => core.sheet(a, c.req.param('sheetId'))));
  app.post(`${P}/recipes/batches`, route(async (a, c) => core.submit(a, await body(c))));
  app.post(`${P}/recipes/batch/:sheetId/:batchId/status`, route(async (a, c) => core.setBatchStatus(a, c.req.param('sheetId'), c.req.param('batchId'), await body(c))));
  app.get(`${P}/recipes/review/:sheetId`, route((a, c) => core.review(a, c.req.param('sheetId'), c.req.query('ids'))));
  app.post(`${P}/recipes/standards/:sheetId`, route(async (a, c) => core.setStandard(a, c.req.param('sheetId'), await body(c))));
  app.get(`${P}/recipes/costs`, route((a) => core.costs(a)));
  app.put(`${P}/recipes/crew`, route(async (a, c) => core.saveCrew(a, await body(c))));
  app.get(`${P}/recipes/price-items`, route((a) => core.priceItems(a)));
  app.put(`${P}/recipes/price-links`, route(async (a, c) => core.savePriceLink(a, await body(c))));
  app.get(`${P}/recipes/photo/:sheetId/:batchId`, route((a, c) => core.photo(a, c.req.param('sheetId'), c.req.param('batchId'))));
}
