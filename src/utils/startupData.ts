// The data the app shell (App.tsx) loads for each person, and how it is fetched: one GET /bootstrap
// when the server offers it (bootstrap-v1), otherwise one call per dataset, all at once, each
// allowed to fail on its own (one failure used to throw away all fourteen results). When the server
// offers date ranges (date-range-v1), a refresh tops up only the last few days of the history lists
// instead of downloading every expense ever entered again.

import { addDays, getTodayIST } from './timezone';
import { API_BASE, hasFeature, isNetworkError, parseJsonResponse, requestRaw, whenFeaturesKnown } from './http';
import { getCachedEtag, getCachedEtagWindow, getCachedHash, getLastFullRefresh, textHash, type CachedProfile } from './dataCache';

export type DatasetKey =
  | 'inventory' | 'overheads' | 'fixedCosts' | 'salesData' | 'categorySales' | 'productionData'
  | 'productionHouses' | 'stockRequests' | 'productionRequests' | 'inventoryItems'
  | 'onlineCashRecalibrations' | 'onlineSalesData' | 'onlinePayoutData' | 'aggregatorSettlements'
  | 'stores' | 'employees' | 'clusterInfo' | 'meEmployee';

interface DatasetDef {
  path: string; // the route; /bootstrap answers carry the same JSON under the same path
  pick: (json: any) => any; // the part of the answer the app keeps (what api.ts's helper returned)
  label: string; // for "Couldn't refresh expenses, sales"
  // History lists: the row field the server's ?from=&to= filters on (string comparison, inclusive).
  dateField?: string;
}

export const DATASETS: Record<DatasetKey, DatasetDef> = {
  inventory: { path: '/inventory', pick: (j) => j?.inventory || [], label: 'expenses', dateField: 'date' },
  overheads: { path: '/overheads', pick: (j) => j?.overheads || [], label: 'overheads', dateField: 'date' },
  fixedCosts: { path: '/fixed-costs', pick: (j) => j?.fixedCosts || [], label: 'fixed costs', dateField: 'date' },
  salesData: { path: '/sales', pick: (j) => j?.sales || [], label: 'sales', dateField: 'date' },
  categorySales: { path: '/sales-data', pick: (j) => j?.data || [], label: 'item sales', dateField: 'date' },
  productionData: { path: '/production', pick: (j) => j?.production || [], label: 'production', dateField: 'date' },
  productionHouses: { path: '/production-houses', pick: (j) => j?.productionHouses || [], label: 'production houses' },
  stockRequests: { path: '/stock-requests', pick: (j) => j?.stockRequests || [], label: 'stock requests', dateField: 'requestDate' },
  productionRequests: { path: '/production-requests', pick: (j) => j?.requests || [], label: 'momo requests', dateField: 'requestDate' },
  inventoryItems: { path: '/inventory-items', pick: (j) => j?.items || [], label: 'item list' },
  onlineCashRecalibrations: { path: '/online-cash-recalibration/all', pick: (j) => j?.data || [], label: 'Paytm checks', dateField: 'date' },
  onlineSalesData: { path: '/online-sales', pick: (j) => j?.sales || [], label: 'online sales', dateField: 'date' },
  onlinePayoutData: { path: '/online-payouts', pick: (j) => j?.payouts || [], label: 'online payouts', dateField: 'date' },
  aggregatorSettlements: { path: '/aggregator-settlements', pick: (j) => j?.settlements || [], label: 'settlements', dateField: 'settlementDate' },
  stores: { path: '/stores', pick: (j) => j?.stores || [], label: 'stores' },
  employees: { path: '/employees', pick: (j) => j?.employees || [], label: 'staff list' },
  clusterInfo: { path: '/cluster/info', pick: (j) => j || null, label: 'cluster' },
  // The caller's own employee record (servers from 28 Oct 2026) - their store and designation,
  // without downloading the whole staff list for it.
  meEmployee: { path: '/me/employee', pick: (j) => j?.employee || null, label: 'your profile' },
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
  if (person.designation === 'site_auditor') return false; // independent auditors: their audits only
  return person.role !== 'employee' || person.designation === 'store_incharge' || person.designation === 'production_incharge';
}

// The staff list for managers' screens; for everyone else only to find their own record.
export function keepsStaffList(person: PersonLike): boolean {
  if (person.designation === 'site_auditor') return false;
  return person.role === 'cluster_head' || person.role === 'manager' || person.role === 'audit';
}

// Servers from 28 Oct 2026 (they advertise bootstrap-v1) also answer /me/employee.
const hasSelfRecordRoute = () => hasFeature('bootstrap-v1');

export function datasetsFor(person: PersonLike): DatasetKey[] {
  const keys: DatasetKey[] = needsBusinessData(person) ? [...BUSINESS_DATASETS] : [];
  if (keepsStaffList(person)) keys.push('stores', 'employees');
  if (person.employeeId) keys.push(hasSelfRecordRoute() ? 'meEmployee' : 'employees');
  if (person.role === 'cluster_head') keys.push('clusterInfo');
  return [...new Set(keys)];
}

function profileOf(record: any): CachedProfile {
  return {
    storeId: record.storeId || null,
    designation: record.designation || null,
    assignedStoreIds: record.assignedStoreIds || [],
    assignedProductionHouseIds: record.assignedProductionHouseIds || [],
  };
}

// The person's own store, designation and assignments, from the staff list.
export function profileFrom(employees: any[] | undefined, employeeId: string | null): CachedProfile | null {
  if (!employeeId || !Array.isArray(employees)) return null;
  const record = employees.find((emp) => emp?.employeeId === employeeId);
  return record ? profileOf(record) : null;
}

// ...or from their own record (/me/employee).
export function profileFromRecord(record: any, employeeId: string | null): CachedProfile | null {
  if (!record || !employeeId || record.employeeId !== employeeId) return null;
  return profileOf(record);
}

// The staff list as saved on the phone: without Aadhaar photos (up to 0.5 MB, and not something to
// leave in a phone's storage). Screens that show them fetch them themselves.
export function stripEmployeeImages<T extends Record<string, any>>(list: T[]): T[] {
  return list.map(({ aadharFront: _front, aadharBack: _back, ...rest }) => rest as unknown as T);
}

export function dedupeById<T extends { id?: string }>(list: T[]): T[] {
  return Array.from(new Map(list.map((item) => [item.id, item])).values());
}

// A date-range top-up: every saved row whose `field` is inside [from, to] (the same string
// comparison the server filters with) is replaced by what the server sent for that range, so
// deletions show too; rows outside it are kept.
export function mergeDateWindow<T extends { id?: string }>(current: T[], fresh: T[], from: string, to: string, field = 'date'): T[] {
  const freshIds = new Set(fresh.map((row) => row.id));
  const inWindow = (row: T) => {
    const value = (row as any)[field];
    return typeof value === 'string' && value >= from && value <= to;
  };
  return [...current.filter((row) => !inWindow(row) && !freshIds.has(row.id)), ...fresh];
}

export interface DateWindow { from: string; to: string; field: string; rows: any[] }

export interface LoadResult {
  data: Partial<Record<DatasetKey, any>>; // full lists, replacing what's on screen
  windows: Partial<Record<DatasetKey, DateWindow>>; // date-range top-ups, merged into what's on screen
  hashes: Partial<Record<DatasetKey, string>>;
  unchanged: DatasetKey[]; // same answer as the saved copy - nothing to re-render
  failed: { key: DatasetKey; offline: boolean }[];
  etag: string | null;
  etagWindow: string;
  full: boolean; // a complete refresh (not a top-up)
}

// How far back a top-up reaches (and forward: requests are dated for the day they are for), and how
// often a full refresh still happens to pick up edits to older rows.
const TOP_UP_DAYS_BACK = 3;
const TOP_UP_DAYS_AHEAD = 7;
const FULL_REFRESH_MS = 12 * 60 * 60 * 1000;
let bootstrapBroken = false;

// Lean employee lists (no Aadhaar photos, ~0.2-0.5 MB less per load): the shell's own staff list
// never shows them - the staff screen fetches its own full copy.
function leanHeaders(): Record<string, string> {
  return hasFeature('lean-lists-v1') ? { 'X-Bunny-Client': '2' } : {};
}

export async function loadDatasets(keys: DatasetKey[], opts: { force?: boolean; hasSavedRows: (key: DatasetKey) => boolean }): Promise<LoadResult> {
  const { force = false, hasSavedRows } = opts;
  const result: LoadResult = { data: {}, windows: {}, hashes: {}, unchanged: [], failed: [], etag: null, etagWindow: '', full: true };
  if (keys.length === 0) return result;
  await whenFeaturesKnown(3_000);

  const today = getTodayIST();
  const from = addDays(today, -TOP_UP_DAYS_BACK);
  const to = addDays(today, TOP_UP_DAYS_AHEAD);
  const canTopUp = hasFeature('date-range-v1') && !force && Date.now() - getLastFullRefresh() < FULL_REFRESH_MS;
  const ranged = (key: DatasetKey) => canTopUp && !!DATASETS[key].dateField && hasSavedRows(key);
  let remaining = [...keys];

  // One request for everything (304 = nothing changed since the saved copy). A top-up asks for the
  // history lists' last few days only; the etag is per range, so it is only sent back for the same one.
  let bootstrapFailedOnNetwork = false;
  if (hasFeature('bootstrap-v1') && !bootstrapBroken) {
    const topUp = keys.some((key) => DATASETS[key].dateField) && keys.filter((key) => DATASETS[key].dateField).every(ranged);
    const windowKey = topUp ? `${from}..${to}` : '';
    try {
      const etag = force || getCachedEtagWindow() !== windowKey ? null : getCachedEtag();
      const headers: Record<string, string> = { ...leanHeaders(), ...(etag ? { 'If-None-Match': etag } : {}) };
      const url = `${API_BASE}/bootstrap${topUp ? `?from=${from}&to=${to}` : ''}`;
      const response = await requestRaw(url, { headers }, { timeoutMs: 15_000, retries: 1 });
      if (response.status === 304 && etag) {
        result.unchanged = keys.filter(hasSavedRows);
        remaining = keys.filter((k) => !hasSavedRows(k));
        result.etag = etag;
        result.etagWindow = windowKey;
      } else if (response.ok) {
        const body = JSON.parse(response.text);
        const data = body?.data || {};
        for (const key of keys) {
          const def = DATASETS[key];
          if (!Object.prototype.hasOwnProperty.call(data, def.path)) continue; // not for this role, or in body.errors
          const picked = def.pick(data[def.path]);
          if (topUp && def.dateField) result.windows[key] = { from, to, field: def.dateField, rows: picked };
          else result.data[key] = picked;
        }
        remaining = keys.filter((k) => !(k in result.data) && !(k in result.windows));
        result.etag = body?.etag ?? response.headers.get('ETag') ?? null;
        result.etagWindow = windowKey;
      }
      // Anything else (an error answer): the separate calls below.
    } catch (error) {
      bootstrapFailedOnNetwork = isNetworkError(error);
      console.warn('Bootstrap failed, loading separately:', error);
    }
  }

  // Separate calls for whatever the bootstrap didn't bring (failed parts, older servers).
  let anySeparateWorked = false;
  await Promise.allSettled(remaining.map(async (key) => {
    const def = DATASETS[key];
    const topUp = ranged(key);
    const url = `${API_BASE}${def.path}${topUp ? `?from=${from}&to=${to}` : ''}`;
    try {
      const isEmployeeList = key === 'employees' || key === 'meEmployee';
      const response = await requestRaw(url, isEmployeeList ? { headers: leanHeaders() } : {});
      const json = parseJsonResponse(url, response);
      anySeparateWorked = true;
      if (topUp) {
        result.windows[key] = { from, to, field: def.dateField!, rows: def.pick(json) };
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

  // The bootstrap call failed on the network while the separate calls got through: something about
  // it in particular is refused (a browser CORS check, say). Don't try it again this session.
  if (bootstrapFailedOnNetwork && anySeparateWorked) bootstrapBroken = true;
  result.full = Object.keys(result.windows).length === 0;
  return result;
}
