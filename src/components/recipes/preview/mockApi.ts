// Dev-only (recipes-preview.html): the recipe screens on made-up data, without signing in. It runs
// the real server module (recipes.ts) on an in-memory store, so what the preview shows is what
// the server would answer. Names, prices and weights here are invented for the preview only.
import { createRecipeCore, type RecipeActor, type Result } from '../../../../supabase/functions/make-server-c2dd9b9d/recipes.ts';
import { NetworkError } from '../../../utils/http';
import { addDaysISO } from '../../../utils/priceRules';
import { SHEET_BY_ID } from '../../../utils/recipeCatalog';
import type { RecipesApi } from '../../../utils/recipesApi';

export type PreviewRole = 'head' | 'crew' | 'ops' | 'owner';

const USERS: Record<PreviewRole, { id: string; user_metadata: Record<string, unknown> }> = {
  head: { id: 'auth-head', user_metadata: { role: 'employee', designation: 'production_incharge', employeeId: 'PV-01', name: 'Ravi (head)' } },
  crew: { id: 'auth-crew', user_metadata: { role: 'employee', designation: 'production_ops', employeeId: 'PV-11', name: 'Sunil' } },
  ops: { id: 'auth-ops', user_metadata: { role: 'manager', designation: 'operations_incharge', employeeId: 'PV-90', name: 'Ops manager' } },
  owner: { id: 'auth-owner', user_metadata: { role: 'cluster_head', name: 'Owner' } },
};

function memoryKv() {
  const m = new Map<string, any>();
  const copy = <T>(v: T): T => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
  return {
    m,
    get: async (k: string) => (m.has(k) ? copy(m.get(k)) : null),
    set: async (k: string, v: any) => { m.set(k, copy(v)); },
    del: async (k: string) => { m.delete(k); },
    getByPrefix: async (p: string) => [...m.entries()].filter(([k]) => k.startsWith(p)).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => copy(v)),
  };
}

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

// Preview bills: price per kg (or per piece) and how they were bought. Cornflakes are bought by
// the pack with no weight written, and chicken 65 masala was never bought - so the preview also
// shows the "no price" states.
const BILLS: [string, number, string, number][] = [
  ['Maida', 50, 'kg', 1850], ['Salt', 1, 'kg', 29], ['Refined Oil', 1, 'L', 145], ['Chicken', 10, 'kg', 2560],
  ['Onion', 10, 'kg', 560], ['Butter', 0.5, 'kg', 265], ['Garlic', 1, 'kg', 216], ['Ginger', 1, 'kg', 100],
  ['Green Chilli', 1, 'kg', 110], ['Coriander Leaves', 1, 'kg', 162], ['Aromatic Powder', 1, 'kg', 330], ['Ajinomoto', 1, 'kg', 200],
  ['Black Pepper', 1, 'kg', 950], ['Sugar', 1, 'kg', 60], ['Cabbage', 5, 'kg', 150], ['Carrot', 2, 'kg', 118],
  ['Paneer', 2, 'kg', 764], ['Capsicum', 1, 'kg', 112], ['Chaat Masala', 0.1, 'kg', 43], ['Corn Flour', 1, 'kg', 80],
  ['Ararut', 1, 'kg', 50], ['Chilli Powder', 0.5, 'kg', 218], ['Tandoori Masala', 0.1, 'kg', 61], ['Tomato Sauce', 1, 'kg', 89],
  ['Chilli Sauce', 1, 'kg', 69], ['Dry Red Chilli', 0.5, 'kg', 154], ['Vinegar', 1, 'L', 54], ['Cornflakes', 1, 'pcs', 217],
];

type Seed = { sheet: string; daysAgo: number; out: number; g: Record<string, number>; portions?: number[]; before?: Record<string, number>; pickup?: [number, number]; count?: number; minutes?: number; who: string };
const P = (avg: number, wobble = 0.5) => Array.from({ length: 10 }, (_, i) => Math.round((avg + (i % 3 - 1) * wobble) * 10) / 10);
const DOUGH = { maida: 5000, water: 2250, salt: 50, oil: 100 };
const CHK = { chicken: 3200, onion: 5550, butter: 400, garlic: 100, ginger: 100, gchilli: 120, coriander: 100, salt: 100, aromatic: 150, msg: 100, pepper: 20, sugar: 20 };
const PNR = { paneer: 1750, onion: 1300, cabbage: 750, capsicum: 150, carrot: 350, butter: 200, gchilli: 100, coriander: 125, ginger: 50, garlic: 50, salt: 50, msg: 25, aromatic: 40, pepper: 10, chaat: 15, sugar: 15 };
const VEG = { cabbage: 7250, carrot: 1200, onion: 600, butter: 250, garlic: 100, ginger: 100, gchilli: 100, coriander: 150, salt: 180, aromatic: 100, msg: 60, pepper: 20, sugar: 20 };
const SEEDS: Seed[] = [
  { sheet: 'dough', daysAgo: 12, out: 7.33, g: DOUGH, portions: P(10.2), count: 718, minutes: 45, who: 'Ravi (head)' },
  { sheet: 'dough', daysAgo: 10, out: 7.36, g: { ...DOUGH, water: 2260 }, portions: P(10.4), count: 706, minutes: 44, who: 'Tapas' },
  { sheet: 'dough', daysAgo: 8, out: 7.30, g: { ...DOUGH, oil: 105 }, portions: P(10.1), count: 721, minutes: 45, who: 'Ravi (head)' },
  { sheet: 'st_chicken', daysAgo: 11, out: 9.86, g: CHK, before: { onion: 6.2, garlic: 0.118 }, portions: P(20.6, 1), count: 476, minutes: 95, who: 'Ravi (head)' },
  { sheet: 'st_chicken', daysAgo: 9, out: 9.91, g: { ...CHK, onion: 5600 }, before: { onion: 6.25 }, portions: P(20.3, 1), count: 486, minutes: 93, who: 'Sunil' },
  { sheet: 'st_chicken', daysAgo: 7, out: 9.74, g: { ...CHK, chicken: 3150 }, before: { onion: 6.15 }, portions: P(20.5, 1), count: 470, minutes: 97, who: 'Ravi (head)' },
  { sheet: 'st_paneer', daysAgo: 6, out: 4.88, g: PNR, portions: P(18.2), count: 266, minutes: 70, who: 'Tapas' },
  { sheet: 'st_paneer', daysAgo: 4, out: 4.91, g: { ...PNR, onion: 1050 }, portions: P(18.4), count: 262, minutes: 65, who: 'Sunil' },
  { sheet: 'st_paneer', daysAgo: 2, out: 4.85, g: { ...PNR, paneer: 1800 }, portions: P(21.0), count: 229, minutes: 75, who: 'Ravi (head)' },
  { sheet: 'st_veg', daysAgo: 3, out: 9.62, g: VEG, before: { cabbage: 9.4, carrot: 1.42 }, portions: P(15.3), count: 622, minutes: 80, who: 'Sunil' },
  { sheet: 'batter', daysAgo: 5, out: 1.57, g: { maida: 520, cornflour: 30, ararut: 30, salt: 12, chillipowder: 12, c65: 30, tandoori: 20, pepper: 4, water: 950 }, pickup: [312, 337], count: 610, minutes: 15, who: 'Tapas' },
];

export function createMockRecipesApi() {
  const kv = memoryKv();
  const today = istToday();
  let clock = Date.parse(`${addDaysISO(today, -14)}T03:00:00.000Z`);
  const core = createRecipeCore({ kv, verifyUser: async () => ({}), getTodayIST: istToday, now: () => new Date(clock) });
  let role: PreviewRole = 'head';
  let offline = false;

  const ready = (async () => {
    for (const [id, name, designation] of [['PV-01', 'Ravi (head)', 'production_incharge'], ['PV-11', 'Sunil', 'production_ops'], ['PV-12', 'Tapas', 'production_ops'], ['PV-13', 'Mithun', 'production_ops']]) {
      await kv.set(`unified-employee:${id}`, { employeeId: id, name, designation, department: 'production' });
    }
    await kv.set('recipe-settings', { crewIds: ['PV-11', 'PV-12'], links: {} });
    BILLS.forEach(([itemName, quantity, unit, totalCost], i) => {
      for (const ago of [6, 19, 33]) {
        const wobble = 1 + ((i + ago) % 5 - 2) * 0.02;
        kv.m.set(`inventory:preview:${i}-${ago}`, { itemName, quantity, unit, totalCost: Math.round(totalCost * wobble * 100) / 100, date: addDaysISO(today, -ago) });
      }
    });
    const head = await core.actorFromUser(USERS.head);
    const owner = await core.actorFromUser(USERS.owner);
    let n = 0;
    for (const s of SEEDS) {
      clock = Date.parse(`${addDaysISO(today, -s.daysAgo)}T05:30:00.000Z`);
      const sheet = SHEET_BY_ID[s.sheet];
      const lines = sheet.ingredients.map((key) => {
        const g = s.g[key];
        const big = g >= 1000;
        return g === undefined
          ? { key, qty: null, unit: 'g', scale: 'S', notUsed: true }
          : { key, qty: big ? g / 1000 : g, unit: big ? 'kg' : 'g', scale: big ? 'B' : 'S', ...(s.before?.[key] ? { beforeQty: s.before[key], beforeUnit: 'kg' } : {}) };
      });
      const r = await core.submit(head, {
        clientId: `preview-batch-${String(++n).padStart(3, '0')}`, sheetId: s.sheet, date: addDaysISO(today, -s.daysAgo), time: '09:10',
        madeByName: s.who, lines, output: { qty: s.out, unit: 'kg' }, portions: s.portions, count: s.count, minutes: s.minutes,
        ...(s.pickup ? { pickup: { before: s.pickup[0], after: s.pickup[1], n: 10 } } : {}),
      });
      if (r.status >= 300) console.warn('preview seed failed', s.sheet, r.body);
    }
    clock = Date.parse(`${addDaysISO(today, -7)}T12:00:00.000Z`);
    for (const sheetId of ['dough', 'st_chicken']) {
      const ids = (await core.review(owner, sheetId, null)).body.selected;
      const r = await core.setStandard(owner, sheetId, { batchIds: ids, note: 'Preview: set from the first three batches' });
      if (r.status >= 300) console.warn('preview standard failed', sheetId, r.body);
    }
    clock = Date.now();
  })();

  const answer = async <T>(fn: (actor: RecipeActor) => Promise<Result>): Promise<T> => {
    await ready;
    await new Promise((r) => setTimeout(r, 120));
    if (offline) throw new NetworkError('Preview is offline');
    clock = Date.now();
    const r = await fn(await core.actorFromUser(USERS[role]));
    if (r.status >= 400) throw Object.assign(new Error(r.body?.error || `HTTP ${r.status}`), { status: r.status, details: r.body });
    return r.body as T;
  };

  const api: RecipesApi = {
    overview: () => answer((a) => core.overview(a)),
    sheet: (sheetId) => answer((a) => core.sheet(a, sheetId)),
    submitBatch: (input, key) => answer((a) => core.submit(a, { ...input, clientId: key })),
    setBatchStatus: (sheetId, batchId, status, note) => answer((a) => core.setBatchStatus(a, sheetId, batchId, { status, note })),
    review: (sheetId, ids) => answer((a) => core.review(a, sheetId, ids?.join(',') || null)),
    setStandard: (sheetId, body) => answer((a) => core.setStandard(a, sheetId, body)),
    costs: () => answer((a) => core.costs(a)),
    saveCrew: (crewIds) => answer((a) => core.saveCrew(a, { crewIds })),
    priceItems: () => answer((a) => core.priceItems(a)),
    savePriceLink: (key, link) => answer((a) => core.savePriceLink(a, { key, ...link })),
    photoUrl: () => Promise.reject(new Error('No photos in the preview')),
  };

  return {
    api,
    ready,
    setRole: (r: PreviewRole) => { role = r; },
    setOffline: (o: boolean) => { offline = o; },
  };
}
