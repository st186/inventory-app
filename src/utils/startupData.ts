// The data the app shell (App.tsx) loads for each person, and how it is fetched: one GET /bootstrap
// when the server offers it, otherwise one call per dataset, all at once, each allowed to fail on
// its own (one failure used to throw away all fourteen results). When the server offers date
// ranges, a refresh tops up only the last few days of the big lists instead of downloading every
// expense ever entered again.

import { addDays, getTodayIST } from './timezone';
import { API_BASE, hasFeature, isNetworkError, parseJsonResponse, requestRaw, whenFeaturesKnown } from './http';
import { getCachedEtag, getCachedHash, getLastFullRefresh, textHash, type CachedProfile } from './dataCache';

export type DatasetKey =
  | 'inventory' | 'overheads' | 'fixedCosts' | 'salesData' | 'categorySales' | 'productionData'
  | 'productionHouses' | 'stockRequests' | 'productionRequests' | 'inventoryItems'
  | 'onlineCashRecalibrations' | 'onlineSalesData' | 'onlinePayoutData' | 'aggregatorSettlements'
  | 'stores' | 'employees' | 'clusterInfo';

interface DatasetDef {
  path: string; // the route; /bootstrap answers carry the same JSON under the same path
  pick: (json: any) => any; // the part of the answer the app keeps (what api.ts's helper returned)
  label: string; // for "Couldn't refresh expenses, sales"
  dated?: boolean; // rows carry a `date` (YYYY-MM-DD): can be topped up by date range
}

export const DATASETS: Record<DatasetKey, DatasetDef> = {
  inventory: { path: '/inventory', pick: (j) => j?.inventory || [], label: 'expenses', dated: true },
  overheads: { path: '/overheads', pick: (j) => j?.overheads || [], label: 'overheads', dated: true },
  fixedCosts: { path: '/fixed-costs', pick: (j) => j?.fixedCosts || [], label: 'fixed costs', dated: true },
  salesData: { path: '/sales', pick: (j) => j?.sales || [], label: 'sales', dated: true },
  categorySales: { path: '/sales-data', pick: (j) => j?.data || [], label: 'item sales' },
  productionData: { path: '/production', pick: (j) => j?.production || [], label: 'production', dated: true },
  productionHouses: { path: '/production-houses', pick: (j) => j?.productionHouses || [], label: 'production houses' },
  stockRequests: { path: '/stock-requests', pick: (j) => j?.stockRequests || [], label: 'stock requests' },
  productionRequests: { path: '/production-requests', pick: (j) => j?.requests || [], label: 'momo requests' },
  inventoryItems: { path: '/inventory-items', pick: (j) => j?.items || [], label: 'item list' },
  onlineCashRecalibrations: { path: '/online-cash-recalibration/all', pick: (j) => j?.data || [], label: 'Paytm checks' },
  onlineSalesData: { path: '/online-sales', pick: (j) => j?.sales || [], label: 'online sales' },
  onlinePayoutData: { path: '/online-payouts', pick: (j) => j?.payouts || [], label: 'online payouts' },
  aggregatorSettlements: { path: '/aggregator-settlements', pick: (j) => j?.settlements || [], label: 'settlements' },
  stores: { path: '/stores', pick: (j) => j?.stores || [], label: 'stores' },
  employees: { path: '/employees', pick: (j) => j?.employees || [], label: 'staff list' },
  clusterInfo: { path: '/cluster/info', pick: (j) => j || null, label: 'cluster' },
};

export const ALL_DATASET_KEYS = Object.keys(DATASETS) as DatasetKey[];

const BUSINESS_DATASETS: DatasetKey[] = [
  'inventory', 'overheads', 'fixedCosts', 'salesData', 'categorySales', 'productionData', 'productionHouses',
  'stockRequests', 'productionRequests', 'inventoryItems', 'onlineCashRecalibrations', 'onlineSalesData',
  'onlinePayoutData', 'aggregatorSettlements',
];

// Rows that can come back twice from the server (old duplicate records) - deduplicated by id.
export const DEDUPED_DATASETS: DatasetKey[] = ['inventory', 'overheads', 'fixedCosts', 'salesData', 'productionData'];

export interface PersonLike {
  role: string;
  designation?: string | null;
  employeeId: string | null;
}

// Crew and riders see only their own payouts, attendance, rides and checks - their screens read
// none of the business-wide lists, which used to be downloaded to every phone anyway (5 MB, and
// everyone's figures on a crew member's phone).
export function needsBusinessData(person: PersonLike): boolean {
  return person.role !== 'employee' || person.designation === 'store_incharge' || person.designation === 'production_incharge';
}

// The staff list for managers' screens; for everyone else only to find their own record.
export function keepsStaffList(person: PersonLike): boolean {
  return person.role === 'cluster_head' || person.role === 'manager' || person.role === 'audit';
}

export function datasetsFor(person: PersonLike): DatasetKey[] {
  const keys: DatasetKey[] = needsBusinessData(person) ? [...BUSINESS_DATASETS] : [];
  if (keepsStaffList(person)) keys.push('stores');
  if (keepsStaffList(person) || person.employeeId) keys.push('employees');
  if (person.role === 'cluster_head') keys.push('clusterInfo');
  return keys;
}

// The person's own store, designation and assignments, from their employee record.
export function profileFrom(employees: any[] | undefined, employeeId: string | null): CachedProfile | null {
  if (!employeeId || !Array.isArray(employees)) return null;
  const record = employees.find((emp) => emp?.employeeId === employeeId);
  if (!record) return null;
  return {
    storeId: record.storeId || null,
    designation: record.designation || null,
    assignedStoreIds: record.assignedStoreIds || [],
    assignedProductionHouseIds: record.assignedProductionHouseIds || [],
  };
}

// The staff list as saved on the phone: without Aadhaar photos (up to 0.5 MB, and not something to
// leave in a phone's storage). Screens that show them fetch them themselves.
export function stripEmployeeImages<T extends Record<string, any>>(list: T[]): T[] {
  return list.map(({ aadharFront: _front, aadharBack: _back, ...rest }) => rest as unknown as T);
}

export function dedupeById<T extends { id?: string }>(list: T[]): T[] {
  return Array.from(new Map(list.map((item) => [item.id, item])).values());
}

// A date-range top-up: every saved row dated inside [from, to] is replaced by what the server sent
// for those days (so deletions show too); rows outside the window are kept.
export function mergeDateWindow<T extends { id?: string; date?: string }>(current: T[], fresh: T[], from: string, to: string): T[] {
  const freshIds = new Set(fresh.map((row) => row.id));
  const kept = current.filter((row) => !(row.date && row.date >= from && row.date <= to) && !freshIds.has(row.id));
  return [...kept, ...fresh];
}

export interface LoadResult {
  data: Partial<Record<DatasetKey, any>>; // full lists, replacing what's on screen
  windows: Partial<Record<DatasetKey, { from: string; to: string; rows: any[] }>>; // date-range top-ups
  hashes: Partial<Record<DatasetKey, string>>;
  unchanged: DatasetKey[]; // same answer as the saved copy - nothing to re-render
  failed: { key: DatasetKey; offline: boolean }[];
  etag: string | null;
  full: boolean; // a complete refresh (not a top-up)
}

// How far back a top-up reaches, and how often a full refresh still happens (to pick up edits to
// older rows).
const TOP_UP_DAYS = 3;
const FULL_REFRESH_MS = 12 * 60 * 60 * 1000;
let bootstrapBroken = false;

export async function loadDatasets(keys: DatasetKey[], opts: { force?: boolean; hasSavedRows: (key: DatasetKey) => boolean }): Promise<LoadResult> {
  const { force = false, hasSavedRows } = opts;
  const result: LoadResult = { data: {}, windows: {}, hashes: {}, unchanged: [], failed: [], etag: null, full: true };
  if (keys.length === 0) return result;
  await whenFeaturesKnown(3_000);
  let remaining = [...keys];

  // One request for everything. 304 = nothing changed since the saved copy.
  let bootstrapFailedOnNetwork = false;
  if (hasFeature('bootstrap-v1') && !bootstrapBroken) {
    try {
      const etag = force ? null : getCachedEtag();
      const response = await requestRaw(`${API_BASE}/bootstrap`, { headers: etag ? { 'If-None-Match': etag } : {} }, { timeoutMs: 10_000, retries: 1 });
      if (response.status === 304 && etag) {
        result.unchanged = keys.filter(hasSavedRows);
        remaining = keys.filter((k) => !hasSavedRows(k));
        result.etag = etag;
      } else if (response.ok) {
        const body = JSON.parse(response.text);
        const data = body?.data || {};
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(data, DATASETS[key].path)) result.data[key] = DATASETS[key].pick(data[DATASETS[key].path]);
        }
        remaining = keys.filter((k) => !(k in result.data));
        result.etag = body?.etag ?? response.headers.get('ETag') ?? null;
      }
      // Anything else (an older server answering 404, an error): the separate calls below.
    } catch (error) {
      bootstrapFailedOnNetwork = isNetworkError(error);
      console.warn('Bootstrap failed, loading separately:', error);
    }
  }

  const today = getTodayIST();
  const from = addDays(today, -TOP_UP_DAYS);
  const to = addDays(today, 1);
  const topUp = hasFeature('date-range-v1') && !force && Date.now() - getLastFullRefresh() < FULL_REFRESH_MS;

  let anySeparateWorked = false;
  await Promise.allSettled(remaining.map(async (key) => {
    const def = DATASETS[key];
    const ranged = topUp && !!def.dated && hasSavedRows(key);
    const url = `${API_BASE}${def.path}${ranged ? `?from=${from}&to=${to}` : ''}`;
    try {
      const response = await requestRaw(url);
      const json = parseJsonResponse(url, response);
      anySeparateWorked = true;
      if (ranged) {
        result.windows[key] = { from, to, rows: def.pick(json) };
        return;
      }
      const hash = textHash(response.text);
      if (hash === getCachedHash(key) && hasSavedRows(key)) {
        result.unchanged.push(key);
      } else {
        result.data[key] = def.pick(json);
        result.hashes[key] = hash;
      }
    } catch (error) {
      console.warn(`Couldn't refresh ${def.label}:`, error);
      result.failed.push({ key, offline: isNetworkError(error) });
    }
  }));

  // The bootstrap call failed on the network while the separate calls got through: most likely the
  // browser's CORS check refused its If-None-Match header. Don't try it again this session.
  if (bootstrapFailedOnNetwork && anySeparateWorked) bootstrapBroken = true;
  result.full = Object.keys(result.windows).length === 0;
  return result;
}
