// Equipment & assets register (owner, 27 Oct 2026): what each store and production house has -
// steamers, fridges, bins, racks, pans - with quantity, cost, condition and a photo. Registered
// from index.ts.
//
// Rows are `asset:{id}`. Opening items are listed by hand; equipment bought from now on is added
// from the expenses by reconcile (rules in assetRules.ts, shared with the app), as "needs review"
// until someone at that location confirms the details. The expense routes are not touched: a
// reconcile run reads the purchases and overheads and works out what to add, follow or flag.
// It runs when the list is opened (at most every 5 minutes) and nightly from pg_cron (see the
// assets_reconcile_cron migration); the owner can also import older purchases.
//
// Who can do what: the owner and operations managers everything; store / production incharges
// add, edit and confirm at their own location; audit sees everything read-only; other staff see
// their own location read-only. Deleting is owner-only.
//
// Photos live in the private Storage bucket `asset-photos` (created on first upload) and are
// shown through signed links that last an hour.
//
// Lost equipment (owner, 30 Oct 2026): anyone at a place can report an item (or part of a set)
// missing - when it was last seen, where it was kept, what happened - and the owner, the
// operations managers and the place's incharge are told at once. It stays missing until someone
// finds it or the owner / an operations manager writes it off. Every 3 months each place checks
// its list (seen / not found / broken, a count for sets, a photo for anything over Rs 2,000):
// `asset-check:{kind}:{id}:{YYYY-MM}`; anything not found becomes missing the same way.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ASSETS_FROM_DATE, ASSET_CATEGORY_KEYS, ASSET_CONDITION_KEYS, assetCategoryLabel, checkNeedsPhoto, checkPeriodOf, checkable,
  nextCheckPeriod, planReconcile, type Asset, type AssetCondition, type AssetLocationKind,
} from './assetRules.ts';
import { askAboutNewNames, keptVerdicts } from './assetAi.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
  mset: (keys: string[], values: any[]) => Promise<any>;
};
type Deps = {
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  // Paginated read: inventory: has 4,000+ rows and the plain prefix read stops at 1,000.
  getAllByPrefix: (prefix: string) => Promise<any[]>;
  getTodayIST: () => string;
  notifyUser?: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
};

const P = '/make-server-c2dd9b9d';
const BUCKET = 'asset-photos';
const LAST_RUN_KEY = 'assets-reconcile:last'; // not under asset: so it never shows up as an asset
const RECONCILE_EVERY_MS = 5 * 60 * 1000;
const SIGNED_URL_SECONDS = 3600;
const MAX_IMAGE_CHARS = 2_500_000; // a data URL of about 1.8 MB; the app sends ~250 KB JPEGs
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AUTO_BY = 'From expenses';
const INCHARGE = ['store_incharge', 'production_incharge'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const locKey = (kind: string, id: string) => `${kind}:${id}`;
const arr = (v: any): string[] => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);

let storageClient: any = null;
const storage = () => {
  storageClient ||= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  return storageClient.storage;
};
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await storage().getBucket(BUCKET);
  if (!data) {
    const { error } = await storage().createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 3 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    // Two first uploads at once: the other one made it.
    if (error && !/exist/i.test(error.message || '')) throw new Error(error.message);
  }
  bucketReady = true;
}
async function removePhoto(path?: string | null) {
  if (!path) return;
  try { await storage().from(BUCKET).remove([path]); } catch (e: any) { console.error('[assets] photo remove failed:', e?.message || e); }
}

type Location = { kind: AssetLocationKind; id: string; name: string };
type Actor = {
  name: string;
  isOwner: boolean;
  canEditAll: boolean;
  canSeeAll: boolean;
  isIncharge: boolean;
  mine: Set<string>;
  locations: Location[];
};

export function registerAssetsRoutes(app: any, deps: Deps) {
  const loadLocations = async (): Promise<Location[]> => {
    const [stores, houses] = await Promise.all([deps.kv.getByPrefix<any>('store:'), deps.kv.getByPrefix<any>('production_house_')]);
    return [
      ...(houses || []).filter((h) => h?.id).map((h) => ({ kind: 'production_house' as const, id: String(h.id), name: h.name || 'Production house' })),
      ...(stores || []).filter((s) => s?.id).map((s) => ({ kind: 'store' as const, id: String(s.id), name: s.name || 'Store', productionHouseId: s.productionHouseId || null })),
    ];
  };

  const actorOf = async (c: any): Promise<{ actor?: Actor; error?: any }> => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const meta = auth.user.user_metadata || {};
    // Designation from the employee record first, as elsewhere: only managers and the owner write it.
    const employee = meta.employeeId ? await deps.kv.get<any>(`unified-employee:${meta.employeeId}`) : null;
    const role = meta.role;
    const designation = employee?.designation || meta.designation || null;
    const isOwner = role === 'cluster_head';
    const canEditAll = isOwner || (role === 'manager' && !INCHARGE.includes(designation));
    const all = await loadLocations();
    const stores = new Map(all.filter((l) => l.kind === 'store').map((l: any) => [l.id, l]));
    const houses = new Set(all.filter((l) => l.kind === 'production_house').map((l) => l.id));
    // A production-side person's storeId often holds the store their production house supplies
    // (see the cash top-up route), so a store there means that store's production house.
    const productionSide = designation === 'production_incharge' || designation === 'production_ops';
    const mine = new Set<string>();
    const refs = [
      employee?.storeId, meta.storeId, meta.productionHouseId, employee?.productionHouseId,
      ...arr(employee?.assignedStoreIds), ...arr(meta.assignedStoreIds),
      ...arr(employee?.assignedProductionHouseIds), ...arr(meta.assignedProductionHouseIds),
    ].filter(Boolean).map(String);
    for (const ref of refs) {
      if (houses.has(ref)) mine.add(locKey('production_house', ref));
      else if (stores.has(ref)) {
        const house = (stores.get(ref) as any)?.productionHouseId;
        if (!productionSide) mine.add(locKey('store', ref));
        else if (house && houses.has(house)) mine.add(locKey('production_house', house));
      }
    }
    const canSeeAll = canEditAll || role === 'audit';
    return {
      actor: {
        name: employee?.name || meta.name || 'Someone',
        isOwner,
        canEditAll,
        canSeeAll,
        isIncharge: INCHARGE.includes(designation),
        mine,
        locations: all.filter((l) => canSeeAll || mine.has(locKey(l.kind, l.id))).map(({ kind, id, name }) => ({ kind, id, name })),
      },
    };
  };

  const canView = (a: Actor, kind: string, id: string) => a.canSeeAll || a.mine.has(locKey(kind, id));
  const canEdit = (a: Actor, kind: string, id: string) => a.canEditAll || (a.isIncharge && a.mine.has(locKey(kind, id)));
  const editableKeys = (a: Actor) => (a.canEditAll ? a.locations.map((l) => locKey(l.kind, l.id)) : a.isIncharge ? [...a.mine] : []);

  const fail = (c: any, err: any, msg: string) => {
    console.error(`[assets] ${msg}:`, err?.message || err);
    return c.json({ error: err?.message === 'DATABASE_UNAVAILABLE' ? 'The database is busy - try again in a minute' : msg }, 500);
  };

  const withPhotoUrls = async (rows: Asset[]) => {
    const paths = rows.map((r) => r.photo?.path).filter(Boolean) as string[];
    const urls = new Map<string, string>();
    if (paths.length) {
      try {
        const { data } = await storage().from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
        for (const d of data || []) if (d?.path && d.signedUrl) urls.set(d.path, d.signedUrl);
      } catch (e: any) {
        console.error('[assets] signing photo links failed:', e?.message || e);
      }
    }
    return rows.map((r) => ({ ...r, photoUrl: r.photo?.path ? urls.get(r.photo.path) || null : null }));
  };

  // ---------------- Reconcile ----------------

  const runReconcile = async (fromDate: string, trigger: 'list' | 'cron' | 'import') => {
    const [purchases, overheads, assets] = await Promise.all([
      deps.getAllByPrefix('inventory:'), deps.getAllByPrefix('overhead:'), deps.getAllByPrefix('asset:'),
    ]);
    const now = new Date().toISOString();
    // Bunny's word on names the keywords can't judge (assetAi.ts): kept answers, plus new names.
    const verdicts = await keptVerdicts(deps.getAllByPrefix);
    try {
      await askAboutNewNames(deps.kv, [
        ...purchases.map((row: any) => ({ row, prefix: 'inventory' as const })),
        ...overheads.map((row: any) => ({ row, prefix: 'overhead' as const })),
      ], verdicts, fromDate, trigger === 'list' ? 8 : undefined);
    } catch (e: any) {
      console.error('[assets] Bunny could not read the new names:', e?.message || e);
    }
    const plan = planReconcile({ purchases, overheads, assets, fromDate, now, by: AUTO_BY, verdicts });
    const planned = new Map<string, string>(assets.filter((a: any) => a?.id).map((a: any) => [a.id, a.updatedAt]));
    let added = 0, updated = 0, removed = 0;

    if (plan.create.length) {
      // Re-read just before writing: another run may have added the same ones meanwhile.
      const existing = new Set((await deps.getAllByPrefix('asset:')).map((a: any) => a?.id));
      const fresh = plan.create.filter((a) => !existing.has(a.id));
      for (let i = 0; i < fresh.length; i += 100) {
        const chunk = fresh.slice(i, i + 100);
        await deps.kv.mset(chunk.map((a) => `asset:${a.id}`), chunk);
      }
      added = fresh.length;
    }
    // Updates and removals only if the row is still as it was read: someone may have confirmed
    // or edited it while this ran, and their change wins (the next run looks again).
    for (const a of plan.update) {
      const current = await deps.kv.get<Asset>(`asset:${a.id}`);
      if (!current || current.updatedAt !== planned.get(a.id)) continue;
      await deps.kv.set(`asset:${a.id}`, a);
      updated++;
    }
    for (const a of plan.remove) {
      const current = await deps.kv.get<Asset>(`asset:${a.id}`);
      if (!current || current.updatedAt !== planned.get(a.id) || !current.needsReview) continue;
      await deps.kv.del(`asset:${a.id}`);
      await removePhoto(current.photo?.path);
      removed++;
    }
    const result = { at: now, trigger, fromDate, added, updated, removed, skippedMissing: plan.skippedMissing };
    if (plan.skippedMissing) console.error('[assets] reconcile: many linked expenses looked missing at once - left them alone');
    await deps.kv.set(LAST_RUN_KEY, result);
    return result;
  };

  // Opening the list keeps it current without waiting for the nightly run, at most every 5 min.
  const maybeReconcile = async () => {
    try {
      const last = await deps.kv.get<any>(LAST_RUN_KEY);
      if (last?.at && Date.now() - Date.parse(last.at) < RECONCILE_EVERY_MS) return null;
      // Claim the run first so several phones opening the list at once start only one.
      await deps.kv.set(LAST_RUN_KEY, { ...(last || {}), at: new Date().toISOString(), running: true });
      return await runReconcile(ASSETS_FROM_DATE, 'list');
    } catch (e: any) {
      console.error('[assets] reconcile on open failed:', e?.message || e);
      return null;
    }
  };

  // ---------------- Input ----------------

  // Checks the editable fields present in body; returns only those (for create, all required ones).
  const readFields = (body: any, creating: boolean): { fields?: Partial<Asset>; error?: string } => {
    const f: Partial<Asset> = {};
    if (creating || body.name !== undefined) {
      const name = String(body.name || '').replace(/\s+/g, ' ').trim();
      if (!name) return { error: 'Enter the item name' };
      if (name.length > 80) return { error: 'Keep the name under 80 letters' };
      f.name = name;
    }
    if (creating || body.category !== undefined) {
      const category = body.category || 'other';
      if (!ASSET_CATEGORY_KEYS.includes(category)) return { error: 'Pick a category' };
      f.category = category;
    }
    if (creating || body.quantity !== undefined) {
      const q = Number(body.quantity ?? 1);
      if (!Number.isInteger(q) || q < 1 || q > 9999) return { error: 'Quantity must be a whole number from 1' };
      f.quantity = q;
    }
    for (const k of ['totalCost', 'unitCost'] as const) {
      if (body[k] === undefined) continue;
      if (body[k] === null || body[k] === '') { f[k] = null; continue; }
      const n = Number(body[k]);
      if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return { error: 'Enter the cost in rupees' };
      f[k] = round2(n);
    }
    if (body.purchaseDate !== undefined) {
      if (body.purchaseDate === null || body.purchaseDate === '') f.purchaseDate = null;
      else if (!DATE.test(String(body.purchaseDate))) return { error: 'Pick a valid purchase date' };
      else f.purchaseDate = String(body.purchaseDate);
    }
    if (body.condition !== undefined) {
      if (!ASSET_CONDITION_KEYS.includes(body.condition)) return { error: 'Pick a condition' };
      if (body.condition === 'missing') return { error: 'Use "Report missing" for an item that is lost' };
      f.condition = body.condition;
    }
    if (body.notes !== undefined) {
      const notes = String(body.notes || '').trim();
      if (notes.length > 500) return { error: 'Keep the notes under 500 letters' };
      f.notes = notes;
    }
    if (creating || body.locationKind !== undefined || body.locationId !== undefined) {
      if (!['store', 'production_house'].includes(body.locationKind) || !body.locationId) return { error: 'Pick the store or production house' };
      f.locationKind = body.locationKind;
      f.locationId = String(body.locationId);
    }
    return { fields: f };
  };

  // Cost is entered as the total paid; the per-piece cost follows (and the other way round).
  const settleCost = (next: Asset, body: any) => {
    if (body.totalCost !== undefined) next.unitCost = next.totalCost == null ? null : round2(next.totalCost / next.quantity);
    else if (body.unitCost !== undefined) next.totalCost = next.unitCost == null ? null : round2(next.unitCost * next.quantity);
    else if (body.quantity !== undefined && next.totalCost != null) next.unitCost = round2(next.totalCost / next.quantity);
  };

  const loadOne = async (c: any, actor: Actor) => {
    const id = String(c.req.param('id') || '');
    const asset = id ? await deps.kv.get<Asset>(`asset:${id}`) : null;
    if (!asset) return { error: c.json({ error: 'That item is not in the register any more' }, 404) };
    if (!canEdit(actor, asset.locationKind, asset.locationId)) {
      return { error: c.json({ error: 'Only the incharge of this location, an operations manager or the owner can change it' }, 403) };
    }
    return { asset };
  };

  const save = async (asset: Asset, actor: Actor) => {
    asset.updatedAt = new Date().toISOString();
    asset.updatedBy = actor.name;
    await deps.kv.set(`asset:${asset.id}`, asset);
    return (await withPhotoUrls([asset]))[0];
  };

  // ---------------- Routes ----------------

  app.get(`${P}/assets`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const reconciled = await maybeReconcile();
      const q = c.req.query();
      const editable = editableKeys(actor);
      const includeDismissed = q.includeDismissed === '1' && editable.length > 0;
      let rows: Asset[] = (await deps.getAllByPrefix('asset:')).filter((a: any) => a?.id && canView(actor, a.locationKind, a.locationId));
      rows = rows.filter((a) => (a.dismissed ? includeDismissed && canEdit(actor, a.locationKind, a.locationId) : true));
      if (q.locationKind && q.locationId !== undefined) rows = rows.filter((a) => a.locationKind === q.locationKind && a.locationId === q.locationId);
      if (q.category) rows = rows.filter((a) => a.category === q.category);
      if (q.condition) rows = rows.filter((a) => a.condition === q.condition);
      if (q.needsReview === '1') rows = rows.filter((a) => a.needsReview || a.expenseChanged);
      if (q.needsReview === '0') rows = rows.filter((a) => !a.needsReview && !a.expenseChanged);
      rows.sort((a, b) => Number(!!b.needsReview) - Number(!!a.needsReview) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      const last = reconciled || (await deps.kv.get<any>(LAST_RUN_KEY));
      // Items checked out to an event stall (events.ts, event_asset: rows) and not yet back:
      // atEvents on each item says how many are out and where. The home location stays the same.
      const out = new Map<string, { eventId: string; eventName: string; quantity: number; since: string }[]>();
      for (const x of (await deps.kv.getByPrefix<any>('event_asset:')) || []) {
        const left = (Number(x?.quantity) || 0) - (Number(x?.returnedQty) || 0);
        if (!x?.assetId || x.voided || left <= 0) continue;
        out.set(x.assetId, [...(out.get(x.assetId) || []), { eventId: x.eventId, eventName: x.eventName || 'Event', quantity: left, since: x.outAt }]);
      }
      return c.json({
        assets: (await withPhotoUrls(rows)).map((a: any) => (out.has(a.id) ? { ...a, atEvents: out.get(a.id) } : a)),
        locations: actor.locations,
        permissions: {
          canEditAll: actor.canEditAll,
          editableLocations: editable,
          canDelete: actor.isOwner,
          canImport: actor.isOwner,
        },
        lastReconcile: last?.at ? { at: last.at, added: last.added || 0 } : null,
      });
    } catch (err) { return fail(c, err, 'Could not load the equipment list'); }
  });

  // Count and value per location and per category (disposed and dismissed items left out).
  app.get(`${P}/assets/summary`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const rows: Asset[] = (await deps.getAllByPrefix('asset:'))
        .filter((a: any) => a?.id && !a.dismissed && canView(actor, a.locationKind, a.locationId));
      const names = new Map(actor.locations.map((l) => [locKey(l.kind, l.id), l.name]));
      const add = (map: Map<string, any>, key: string, base: any, a: Asset) => {
        const r = map.get(key) || { ...base, items: 0, quantity: 0, totalCost: 0 };
        r.items++;
        r.quantity += a.quantity || 0;
        r.totalCost = round2(r.totalCost + (a.totalCost || 0));
        map.set(key, r);
      };
      const byLocation = new Map<string, any>(), byCategory = new Map<string, any>(), byLocationCategory = new Map<string, any>();
      const totals = { items: 0, quantity: 0, totalCost: 0, needsReview: 0, needsRepair: 0, broken: 0, disposed: 0, missing: 0 };
      for (const a of rows) {
        if (a.needsReview || a.expenseChanged) totals.needsReview++;
        if (a.missing && a.condition !== 'disposed') totals.missing++;
        if (a.condition === 'disposed') { totals.disposed++; continue; }
        if (a.condition === 'needs_repair') totals.needsRepair++;
        if (a.condition === 'broken') totals.broken++;
        totals.items++;
        totals.quantity += a.quantity || 0;
        totals.totalCost = round2(totals.totalCost + (a.totalCost || 0));
        const lk = locKey(a.locationKind, a.locationId);
        const loc = { locationKind: a.locationKind, locationId: a.locationId, name: names.get(lk) || (a.locationId ? 'Unknown location' : 'No location yet') };
        add(byLocation, lk, loc, a);
        add(byCategory, a.category, { category: a.category, label: assetCategoryLabel(a.category) }, a);
        add(byLocationCategory, `${lk}|${a.category}`, { ...loc, category: a.category }, a);
      }
      return c.json({ totals, byLocation: [...byLocation.values()], byCategory: [...byCategory.values()], byLocationCategory: [...byLocationCategory.values()] });
    } catch (err) { return fail(c, err, 'Could not add up the equipment'); }
  });

  // One item, or { items: [...] } for the quick "what we already have" list (up to 50 at a time).
  app.post(`${P}/assets`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const input: any[] = Array.isArray(body?.items) ? body.items : [body];
      if (!input.length) return c.json({ error: 'Add at least one item' }, 400);
      if (input.length > 50) return c.json({ error: 'Add up to 50 items at a time' }, 400);
      const now = new Date().toISOString();
      const created: Asset[] = [];
      for (const [i, raw] of input.entries()) {
        const { fields, error } = readFields(raw || {}, true);
        if (error) return c.json({ error: input.length > 1 ? `Row ${i + 1}: ${error}` : error }, 400);
        if (!actor.locations.some((l) => l.kind === fields!.locationKind && l.id === fields!.locationId)) {
          return c.json({ error: 'That store or production house was not found' }, 400);
        }
        if (!canEdit(actor, fields!.locationKind!, fields!.locationId!)) {
          return c.json({ error: 'You can add items only for your own store or production house' }, 403);
        }
        const asset: Asset = {
          id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: fields!.name!,
          category: fields!.category!,
          locationKind: fields!.locationKind!,
          locationId: fields!.locationId!,
          quantity: fields!.quantity!,
          unitCost: fields!.unitCost ?? null,
          totalCost: fields!.totalCost ?? null,
          purchaseDate: fields!.purchaseDate ?? null,
          condition: fields!.condition || 'good',
          photo: null,
          notes: fields!.notes || '',
          source: { kind: 'opening' },
          needsReview: false,
          expenseChanged: null,
          createdAt: now,
          createdBy: actor.name,
          updatedAt: now,
          updatedBy: actor.name,
        };
        settleCost(asset, raw || {});
        created.push(asset);
      }
      await deps.kv.mset(created.map((a) => `asset:${a.id}`), created);
      return c.json({ success: true, assets: created.map((a) => ({ ...a, photoUrl: null })) });
    } catch (err) { return fail(c, err, 'Could not add the items'); }
  });

  // Edit. Extra flags: confirm (a needs-review item's details are right), resolveExpense
  // ('accept' the expense's new values / 'keep' the register's), removePhoto.
  app.put(`${P}/assets/:id`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const one = await loadOne(c, actor);
      if (one.error) return one.error;
      const body = await c.req.json().catch(() => ({}));
      const { fields, error } = readFields(body || {}, false);
      if (error) return c.json({ error }, 400);
      const next: Asset = { ...one.asset!, ...fields } as Asset;
      if (fields!.locationId !== undefined && locKey(next.locationKind, next.locationId) !== locKey(one.asset!.locationKind, one.asset!.locationId)) {
        if (!actor.locations.some((l) => l.kind === next.locationKind && l.id === next.locationId)) return c.json({ error: 'That store or production house was not found' }, 400);
        if (!canEdit(actor, next.locationKind, next.locationId)) return c.json({ error: 'You can move items only between your own locations' }, 403);
      }
      settleCost(next, body || {});
      if (fields!.condition) next.disposedAt = fields!.condition === 'disposed' ? (one.asset!.disposedAt || new Date().toISOString()) : null;

      const change = one.asset!.expenseChanged;
      if (body?.resolveExpense && change) {
        if (change.kind === 'changed') {
          if (body.resolveExpense === 'accept' && change.expense) {
            Object.assign(next, change.expense);
            next.unitCost = next.quantity ? round2(change.expense.totalCost / next.quantity) : null;
          }
          next.source = { ...next.source, fingerprint: change.fingerprint };
        } else {
          // The expense is gone or re-filed and they keep the item: stop following that expense.
          next.source = { ...next.source, unlinked: true };
        }
        next.expenseChanged = null;
      }
      if (body?.confirm) {
        if (!next.locationId) return c.json({ error: 'Pick the store or production house first' }, 400);
        next.needsReview = false;
        next.confirmedAt = new Date().toISOString();
        next.confirmedBy = actor.name;
      }
      if (body?.removePhoto && next.photo?.path) {
        await removePhoto(next.photo.path);
        next.photo = null;
      }
      return c.json({ success: true, asset: await save(next, actor) });
    } catch (err) { return fail(c, err, 'Could not save the item'); }
  });

  // ---------------- Lost equipment and the equipment check ----------------

  const placeName = async (kind: string, id: string) => (await loadLocations()).find((l) => l.kind === kind && l.id === id)?.name || 'the place';
  // The owner, the operations managers and the incharge of the item's place.
  const tellAboutPlace = async (kind: AssetLocationKind, id: string, type: string, title: string, message: string, relatedId?: string) => {
    if (!deps.notifyUser) return;
    const designation = kind === 'store' ? 'store_incharge' : 'production_incharge';
    const people = (await deps.getAllByPrefix('unified-employee:')).filter((e: any) => e?.authUserId && !['inactive', 'archived'].includes(e.status) && (
      e.role === 'cluster_head'
      || (e.role === 'manager' && !INCHARGE.includes(e.designation))
      || (e.designation === designation && [e.storeId, e.productionHouseId, ...arr(e.assignedStoreIds), ...arr(e.assignedProductionHouseIds)].map(String).includes(id))
    ));
    for (const p of people) await deps.notifyUser(p.authUserId, type, title, message, relatedId, deps.getTodayIST()).catch(() => undefined);
  };
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const clip = (v: any, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const missingText = (a: Asset, count: number) => (a.quantity > 1 ? `${count} of ${a.quantity} ${a.name}` : a.name);

  // POST /assets/:id/missing {count?, lastSeen?, where, note, policeRef?} - anyone who works there.
  app.post(`${P}/assets/:id/missing`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const asset = await deps.kv.get<Asset>(`asset:${String(c.req.param('id') || '')}`);
      if (!asset || asset.dismissed || asset.condition === 'disposed') return c.json({ error: 'That item is not in the register any more' }, 404);
      if (!canView(actor, asset.locationKind, asset.locationId)) return c.json({ error: 'Only people at this place can report it' }, 403);
      const body = await c.req.json().catch(() => ({}));
      const count = Math.round(Number(body?.count ?? asset.quantity));
      if (!(count >= 1 && count <= asset.quantity)) return c.json({ error: `Say how many are missing (1 to ${asset.quantity})` }, 400);
      const where = clip(body?.where, 120);
      const note = clip(body?.note, 300);
      if (where.length < 2) return c.json({ error: 'Say where it was kept' }, 400);
      if (note.length < 5) return c.json({ error: 'Say what happened, or when it was noticed' }, 400);
      const lastSeen = DAY.test(String(body?.lastSeen || '')) ? String(body.lastSeen) : null;
      const next: Asset = {
        ...asset,
        missing: {
          reportedAt: new Date().toISOString(), by: actor.name, count, lastSeen, where, note, policeRef: clip(body?.policeRef, 60), source: 'report',
          prevCondition: asset.missing?.prevCondition || (asset.condition === 'missing' ? 'good' : asset.condition),
        },
        condition: count >= asset.quantity ? 'missing' : asset.condition,
      };
      const saved = await save(next, actor);
      const place = await placeName(asset.locationKind, asset.locationId);
      await tellAboutPlace(asset.locationKind, asset.locationId, 'asset_missing', `Missing: ${missingText(asset, count)} (${place})`,
        `Reported by ${actor.name}.${lastSeen ? ` Last seen ${lastSeen}.` : ''} Kept at: ${where}. ${note}${next.missing!.policeRef ? ` Police report: ${next.missing!.policeRef}.` : ''} Open Equipment and assets to mark it found or write it off.`, asset.id);
      return c.json({ success: true, asset: saved });
    } catch (err) { return fail(c, err, 'Could not report it missing'); }
  });

  // POST /assets/:id/found {note?} - the incharge, an operations manager or the owner.
  app.post(`${P}/assets/:id/found`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    try {
      const one = await loadOne(c, g.actor!);
      if (one.error) return one.error;
      const a = one.asset!;
      if (!a.missing) return c.json({ error: 'It is not marked missing' }, 400);
      const body = await c.req.json().catch(() => ({}));
      const note = clip(body?.note, 200);
      const today = deps.getTodayIST();
      const next: Asset = {
        ...a, condition: a.condition === 'missing' ? (a.missing.prevCondition as AssetCondition) : a.condition, missing: null, lastCheckedAt: new Date().toISOString(),
        notes: [a.notes, `Found ${today} (${g.actor!.name})${note ? `: ${note}` : ''}`].filter(Boolean).join('\n').slice(-500),
      };
      return c.json({ success: true, asset: await save(next, g.actor!) });
    } catch (err) { return fail(c, err, 'Could not mark it found'); }
  });

  // POST /assets/:id/write-off {note} - the owner or an operations manager: it is gone. The whole
  // item leaves the list (disposed); part of a set takes the quantity down. Its cost was already
  // booked when it was bought, so nothing new goes into the expenses.
  app.post(`${P}/assets/:id/write-off`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    if (!g.actor!.canEditAll) return c.json({ error: 'Only the owner or an operations manager can write it off' }, 403);
    try {
      const one = await loadOne(c, g.actor!);
      if (one.error) return one.error;
      const a = one.asset!;
      if (!a.missing) return c.json({ error: 'Report it missing first' }, 400);
      const body = await c.req.json().catch(() => ({}));
      const note = clip(body?.note, 200);
      const now = new Date().toISOString();
      const count = a.missing.count;
      const whole = count >= a.quantity;
      const next: Asset = {
        ...a,
        writtenOff: { at: now, by: g.actor!.name, note, count },
        missing: null,
        ...(whole
          ? { condition: 'disposed' as AssetCondition, disposedAt: now }
          : { quantity: a.quantity - count, totalCost: a.unitCost != null ? round2(a.unitCost * (a.quantity - count)) : a.totalCost }),
        notes: [a.notes, `Written off ${deps.getTodayIST()} (${g.actor!.name}): ${whole ? 'lost' : `${count} lost`}${note ? ` - ${note}` : ''}`].filter(Boolean).join('\n').slice(-500),
      };
      return c.json({ success: true, asset: await save(next, g.actor!) });
    } catch (err) { return fail(c, err, 'Could not write it off'); }
  });

  const checkKey = (kind: string, id: string, period: string) => `asset-check:${kind}:${id}:${period}`;
  const checkItems = async (kind: string, id: string) => (await deps.getAllByPrefix('asset:'))
    .filter((a: any) => a?.id && a.locationKind === kind && a.locationId === id && checkable(a))
    .sort((a: Asset, b: Asset) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  // GET /assets/check?locationKind=&locationId= - the place's check: open now or when next, done or
  // not, and the items with whether each needs a photo.
  app.get(`${P}/assets/check`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const kind = c.req.query('locationKind');
      const id = c.req.query('locationId');
      if (!kind || !id || !canView(actor, kind, id)) return c.json({ error: 'Pick your store or production house' }, 400);
      const today = deps.getTodayIST();
      const open = checkPeriodOf(today);
      const period = open || nextCheckPeriod(today);
      const record = await deps.kv.get<any>(checkKey(kind, id, period));
      const items = await withPhotoUrls(await checkItems(kind, id));
      return c.json({
        open: !!open, period, done: !!record, record, canCheck: canEdit(actor, kind, id),
        items: items.map((a: any) => ({ ...a, needsPhoto: checkNeedsPhoto(a) })),
      });
    } catch (err) { return fail(c, err, 'Could not load the equipment check'); }
  });

  // POST /assets/check {locationKind, locationId, results: {[assetId]: {status: 'seen'|'not_found'|'broken', counted?}}}
  // Every item answered; anything over Rs 2,000 seen needs a photo taken today (the item's photo).
  app.post(`${P}/assets/check`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    const actor = g.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const kind = String(body?.locationKind || '');
      const id = String(body?.locationId || '');
      if (!canEdit(actor, kind, id)) return c.json({ error: 'Only the incharge of this place, an operations manager or the owner checks its equipment' }, 403);
      const today = deps.getTodayIST();
      const period = checkPeriodOf(today) || today.slice(0, 7);
      const items: Asset[] = await checkItems(kind, id);
      const results = body?.results || {};
      const unanswered = items.filter((a) => !['seen', 'not_found', 'broken'].includes(results[a.id]?.status));
      if (unanswered.length) return c.json({ error: `Check every item: ${unanswered.slice(0, 5).map((a) => a.name).join(', ')}${unanswered.length > 5 ? '...' : ''}` }, 400);
      const dayAgo = Date.now() - 20 * 3600000;
      const noPhoto = items.filter((a) => results[a.id].status === 'seen' && checkNeedsPhoto(a) && !(a.photo?.uploadedAt && Date.parse(a.photo.uploadedAt) >= dayAgo));
      if (noPhoto.length) return c.json({ error: `Take a photo of: ${noPhoto.map((a) => a.name).join(', ')}` }, 400);
      const now = new Date().toISOString();
      const short: string[] = [], notFound: string[] = [], broken: string[] = [];
      for (const a of items) {
        const r = results[a.id];
        const next: Asset = { ...a, lastCheckedAt: now };
        if (r.status === 'seen') {
          const counted = a.quantity > 1 ? Math.max(0, Math.min(a.quantity, Math.round(Number(r.counted ?? a.quantity)))) : a.quantity;
          if (counted >= a.quantity) {
            // Found again in the check: no longer missing.
            if (a.missing) { next.condition = a.condition === 'missing' ? (a.missing.prevCondition as AssetCondition) : a.condition; next.missing = null; }
          } else {
            const count = a.quantity - counted;
            next.missing = { reportedAt: now, by: actor.name, count, lastSeen: null, where: '', note: `Counted ${counted} of ${a.quantity} in the equipment check`, policeRef: '', source: 'check', prevCondition: a.missing?.prevCondition || (a.condition === 'missing' ? 'good' : a.condition) };
            short.push(missingText(a, count));
          }
        } else if (r.status === 'not_found') {
          next.missing = { reportedAt: now, by: actor.name, count: a.quantity, lastSeen: null, where: '', note: 'Not found in the equipment check', policeRef: '', source: 'check', prevCondition: a.missing?.prevCondition || (a.condition === 'missing' ? 'good' : a.condition) };
          next.condition = 'missing';
          notFound.push(missingText(a, a.quantity));
        } else {
          next.condition = 'broken';
          if (a.missing) next.missing = null;
          broken.push(a.name);
        }
        await save(next, actor);
      }
      const record = { period, at: now, by: actor.name, items: items.length, notFound, short, broken, results };
      await deps.kv.set(checkKey(kind, id, period), record);
      const place = await placeName(kind, id);
      const problems = [notFound.length ? `not found: ${notFound.join(', ')}` : '', short.length ? `short: ${short.join(', ')}` : '', broken.length ? `broken: ${broken.join(', ')}` : ''].filter(Boolean);
      await tellAboutPlace(kind as AssetLocationKind, id, problems.length ? 'asset_missing' : 'equipment_check_done',
        problems.length ? `Equipment check at ${place}: ${notFound.length + short.length} missing` : `Equipment check done at ${place}`,
        problems.length ? `${actor.name} checked ${items.length} items - ${problems.join('; ')}. Open Equipment and assets.` : `${actor.name} checked all ${items.length} items: everything is there.`);
      return c.json({ success: true, record });
    } catch (err) { return fail(c, err, 'Could not save the equipment check'); }
  });

  app.post(`${P}/assets/:id/dispose`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    try {
      const one = await loadOne(c, g.actor!);
      if (one.error) return one.error;
      const body = await c.req.json().catch(() => ({}));
      const note = String(body?.reason || '').trim().slice(0, 200);
      const next: Asset = { ...one.asset!, condition: 'disposed', disposedAt: new Date().toISOString() };
      if (note) next.notes = [one.asset!.notes, `Disposed: ${note}`].filter(Boolean).join('\n').slice(0, 500);
      return c.json({ success: true, asset: await save(next, g.actor!) });
    } catch (err) { return fail(c, err, 'Could not mark it disposed'); }
  });

  // "Not equipment": an auto-added item that shouldn't be in the register, or one whose expense
  // was deleted. Kept hidden (not deleted) so reconcile doesn't add it back.
  app.post(`${P}/assets/:id/dismiss`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    try {
      const one = await loadOne(c, g.actor!);
      if (one.error) return one.error;
      const a = one.asset!;
      const gone = a.expenseChanged && a.expenseChanged.kind !== 'changed';
      if (!a.needsReview && !gone) return c.json({ error: 'Only items waiting for review can be removed this way - mark it disposed instead' }, 400);
      const next: Asset = { ...a, dismissed: true, dismissedAt: new Date().toISOString(), dismissedBy: g.actor!.name };
      return c.json({ success: true, asset: await save(next, g.actor!) });
    } catch (err) { return fail(c, err, 'Could not remove it from the list'); }
  });

  app.post(`${P}/assets/:id/restore`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    try {
      const one = await loadOne(c, g.actor!);
      if (one.error) return one.error;
      const { dismissed, dismissedAt, dismissedBy, ...rest } = one.asset!;
      const next: Asset = { ...rest, needsReview: rest.source.kind === 'expense' ? true : rest.needsReview };
      return c.json({ success: true, asset: await save(next, g.actor!) });
    } catch (err) { return fail(c, err, 'Could not bring it back'); }
  });

  // Owner only. An item from an expense stays as a hidden marker so reconcile doesn't re-add it.
  app.delete(`${P}/assets/:id`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    if (!g.actor!.isOwner) return c.json({ error: 'Only the owner can delete items - mark it disposed instead' }, 403);
    try {
      const id = String(c.req.param('id') || '');
      const asset = await deps.kv.get<Asset>(`asset:${id}`);
      if (!asset) return c.json({ success: true });
      await removePhoto(asset.photo?.path);
      if (asset.source?.kind === 'expense') {
        const now = new Date().toISOString();
        await deps.kv.set(`asset:${id}`, { ...asset, photo: null, dismissed: true, dismissedAt: now, dismissedBy: g.actor!.name, updatedAt: now, updatedBy: g.actor!.name });
      } else {
        await deps.kv.del(`asset:${id}`);
      }
      return c.json({ success: true });
    } catch (err) { return fail(c, err, 'Could not delete the item'); }
  });

  app.post(`${P}/assets/:id/photo`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    try {
      const one = await loadOne(c, g.actor!);
      if (one.error) return one.error;
      const body = await c.req.json().catch(() => ({}));
      const img = String(body?.image || '');
      const m = img.match(IMAGE_DATA_URL);
      if (!m) return c.json({ error: 'The photo must be a JPEG, PNG or WebP image' }, 400);
      if (img.length > MAX_IMAGE_CHARS) return c.json({ error: 'The photo is too large - take it again' }, 400);
      await ensureBucket();
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
      const path = `${one.asset!.id}/${Date.now()}.${ext}`;
      const { error } = await storage().from(BUCKET).upload(path, bytes, { contentType: `image/${m[1]}`, upsert: false });
      if (error) throw new Error(error.message);
      const old = one.asset!.photo?.path;
      const next: Asset = { ...one.asset!, photo: { path, uploadedAt: new Date().toISOString() } };
      const saved = await save(next, g.actor!);
      await removePhoto(old);
      return c.json({ success: true, asset: saved });
    } catch (err) { return fail(c, err, 'Could not upload the photo'); }
  });

  // Owner: "Import past equipment purchases" - the same reconcile, from an older date.
  app.post(`${P}/assets/import`, async (c: any) => {
    const g = await actorOf(c);
    if (g.error) return g.error;
    if (!g.actor!.isOwner) return c.json({ error: 'Only the owner can import past purchases' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const fromDate = String(body?.fromDate || '');
      if (!DATE.test(fromDate) || fromDate > deps.getTodayIST()) return c.json({ error: 'Pick a from-date that is not in the future' }, 400);
      return c.json({ success: true, ...(await runReconcile(fromDate, 'import')) });
    } catch (err) { return fail(c, err, 'Could not import past purchases'); }
  });

  // Nightly (pg_cron, see the assets_reconcile_cron migration).
  app.post(`${P}/cron/assets-reconcile`, async (c: any) => {
    const expected = Deno.env.get('CRON_SYNC_SECRET');
    if (!expected || c.req.header('X-Cron-Secret') !== expected) return c.json({ error: 'Unauthorized' }, 401);
    try {
      return c.json({ success: true, ...(await runReconcile(ASSETS_FROM_DATE, 'cron')) });
    } catch (err) { return fail(c, err, 'Asset reconcile failed'); }
  });
}
