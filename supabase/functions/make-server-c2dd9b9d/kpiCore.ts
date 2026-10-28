// Shift clock-in and monthly KPIs: the pure part (no database, no Deno APIs), so the scoring rules
// can be unit-tested with plain node (kpiCore.test.ts) and reused by attendance.ts and kpi.ts.
// All dates are IST calendar dates (YYYY-MM-DD); timestamps are ISO strings in real UTC.

export const IST_OFFSET_MIN = 330;
export const DEFAULT_RADIUS_M = 150; // within this distance of the workplace pin counts as "at work" (owner, 27 Oct 2026)
// GPS on cheap phones is often 20-60 m off indoors; up to this much of the reported accuracy is
// forgiven on top of the radius so a person standing inside the store isn't marked "away".
export const GPS_TOLERANCE_M = 50;
export const WINDOW_PADDING_MIN = 60; // automatic check-in watches 60 min either side of the shift
export const LATE_CONFIRM_MS = 3 * 60 * 60 * 1000; // confirming a detected arrival 3 h later is worth a look
export const CLOCK_SKEW_MS = 10 * 60 * 1000; // phone clock this far from the server's is worth a look
export const TIMESHEET_DUE_DAYS = 1; // a day's timesheet is on time if sent by the end of the next day
export const CASH_TOLERANCE_INR = 100; // cash over/short within ₹100 counts as matching
export const SHIP_BY_MIN = 15 * 60; // stock requests should ship by 3 PM (same cut-off as the SLA screen)
export const DAY_CLOSE_BY_MIN = 25 * 60; // a day's sales and expenses are on time if saved by 1 AM after it (the store shuts at 10:30 PM)
export const REQUEST_BY_MIN = 8 * 60; // a stock request is on time if sent by 8 AM on the day it is for (production starts at 8)
export const STOCK_OUT_PENALTY = 15; // points off per item that ran out at the store
export const PHOTO_FLAG_PENALTY = 5; // points off the photo-check KPI per "needs cleaning" photo
export const WASTAGE_FULL_MARKS_PCT = 2; // production wastage at or under 2% scores 100 ...
export const WASTAGE_ZERO_PCT = 10; // ... and 10% or more scores 0, straight line between
export const AI_MAX_SHIFT = 0.15; // the AI may move the formula amount by at most ±15%

export type KpiId =
  | 'attendance' | 'punctuality' | 'fullShift' | 'timesheet' | 'workplace' | 'hygiene'
  | 'cashCount' | 'cashAccuracy' | 'stockOuts' | 'productionLogged' | 'wastage' | 'shippedOnTime' | 'trips'
  | 'salesOnTime' | 'expensesOnTime' | 'productionApproved' | 'requestOnTime';

export type RoleGroup = 'store_incharge' | 'production_incharge' | 'production_staff' | 'store_staff' | 'operations' | 'rider';
export type WorkplaceKind = 'store' | 'production' | 'mixed' | 'none';

export const KPI_LABELS: Record<KpiId, string> = {
  attendance: 'Attendance',
  punctuality: 'On time',
  fullShift: 'Full shift',
  timesheet: 'Timesheet on time',
  workplace: 'Photo checks on time',
  hygiene: 'Hygiene (photo score)',
  cashCount: 'Cash count saved',
  cashAccuracy: 'Cash matches',
  stockOuts: 'No stock-outs',
  productionLogged: 'Production logged',
  wastage: 'Low wastage',
  shippedOnTime: 'Shipped on time',
  trips: 'Rides completed',
  salesOnTime: 'Sales saved on time',
  expensesOnTime: 'Expenses entered on time',
  productionApproved: 'Production approved on time',
  requestOnTime: 'Stock request sent on time',
};

export const ROLE_LABELS: Record<RoleGroup, string> = {
  store_incharge: 'Store incharge',
  production_incharge: 'Production incharge',
  production_staff: 'Production staff',
  store_staff: 'Store staff',
  operations: 'Operations',
  rider: 'Rider',
};

// Default KPI weights per role (each set adds up to 100). The owner can change them per person;
// a KPI with no data that month drops out and the rest are re-weighted.
export const DEFAULT_WEIGHTS: Record<RoleGroup, Partial<Record<KpiId, number>>> = {
  store_incharge: { attendance: 20, punctuality: 15, fullShift: 10, timesheet: 5, workplace: 5, hygiene: 5, cashCount: 15, cashAccuracy: 15, stockOuts: 10 },
  production_incharge: { attendance: 20, punctuality: 15, fullShift: 10, timesheet: 5, workplace: 5, hygiene: 5, productionLogged: 15, wastage: 15, shippedOnTime: 10 },
  production_staff: { attendance: 25, punctuality: 20, fullShift: 15, timesheet: 5, workplace: 5, hygiene: 10, productionLogged: 5, wastage: 10, shippedOnTime: 5 },
  store_staff: { attendance: 30, punctuality: 20, fullShift: 15, timesheet: 10, workplace: 10, hygiene: 15 },
  operations: { attendance: 30, punctuality: 25, fullShift: 20, timesheet: 10, workplace: 5, hygiene: 10 },
  rider: { attendance: 20, punctuality: 10, trips: 70 },
};

// KPIs are picked per person (owner, 28 Oct 2026): each list follows what the person actually
// does, not just their role. The role's list above is only the starting point; a KPI added
// outside it starts at ADDED_KPI_WEIGHT.
export const ALL_KPIS = Object.keys(KPI_LABELS) as KpiId[];
export const ADDED_KPI_WEIGHT = 10;

// Default shift by workplace (owner, 27 Oct 2026): store 3:00-10:30 PM, production house 8 AM-8 PM.
export const DEFAULT_SHIFTS: Record<WorkplaceKind, { start: string; end: string }> = {
  store: { start: '15:00', end: '22:30' },
  production: { start: '08:00', end: '20:00' },
  mixed: { start: '11:00', end: '22:00' },
  none: { start: '11:00', end: '22:00' },
};
export const DEFAULT_GRACE_MIN = 10;

export type KpiSettings = {
  employeeId: string;
  shiftStart: string; // HH:MM IST
  shiftEnd: string; // HH:MM IST; earlier than shiftStart means the shift ends after midnight
  weeklyOff: number[]; // 0 = Sunday ... 6 = Saturday
  graceMin: number;
  hasVariablePay: boolean;
  variablePayMax: number; // ₹ per month
  kpis: KpiId[]; // the person's KPIs in order (nothing saved = their role's list)
  weights: Partial<Record<KpiId, number>>; // one per KPI in `kpis`; missing = default
  isDefault?: boolean; // nothing saved yet - every value is a default
  updatedBy?: string;
  updatedAt?: string;
};

// ---------------- Dates and times ----------------

const pad = (n: number) => String(n).padStart(2, '0');
export const istDate = (ms: number) => new Date(ms + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
export const istMidnightMs = (date: string) => Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MIN * 60000;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const isMonth = (m: any): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const isDate = (d: any): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

export function parseHHMM(s: any): number | null {
  const m = typeof s === 'string' ? s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const fmtHHMM = (min: number) => `${pad(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad(((min % 60) + 60) % 60)}`;
// "3:10 PM" for explanations people read.
export function fmt12(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Minutes since the IST midnight that starts `date` (more than 1440 for a time after midnight).
export const minutesOfDay = (at: string, date: string) => (Date.parse(at) - istMidnightMs(date)) / 60000;

export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`);
}

// Shift start/end in minutes from midnight; an end at or before the start rolls to the next day.
export function shiftMinutes(settings: Pick<KpiSettings, 'shiftStart' | 'shiftEnd'>) {
  const start = parseHHMM(settings.shiftStart) ?? 660;
  let end = parseHHMM(settings.shiftEnd) ?? 1320;
  if (end <= start) end += 1440;
  return { start, end };
}

export const isWorkingDay = (date: string, settings: Pick<KpiSettings, 'weeklyOff'>) => !(settings.weeklyOff || []).includes(weekdayOf(date));

// When automatic check-in may watch the phone's location on `date`: an hour either side of the shift.
export function shiftWindow(date: string, settings: Pick<KpiSettings, 'shiftStart' | 'shiftEnd'>) {
  const { start, end } = shiftMinutes(settings);
  const base = istMidnightMs(date);
  return {
    shiftStartMs: base + start * 60000,
    shiftEndMs: base + end * 60000,
    startMs: base + (start - WINDOW_PADDING_MIN) * 60000,
    endMs: base + (end + WINDOW_PADDING_MIN) * 60000,
  };
}

// ---------------- Roles and workplaces ----------------

export function workplaceKindOf(emp: any, places: { stores: Set<string>; houses: Set<string> }): WorkplaceKind {
  if (!emp || emp.designation === 'rider' || emp.role === 'rider') return 'none';
  const d = String(emp.designation || '');
  const storeId = emp.storeId ? String(emp.storeId) : '';
  const production = d.startsWith('production') || emp.department === 'production'
    || (emp.assignedProductionHouseIds || []).length > 0 || (!!storeId && places.houses.has(storeId));
  const store = d.startsWith('store') || emp.department === 'store_operations'
    || (emp.assignedStoreIds || []).length > 0 || (!!storeId && places.stores.has(storeId));
  if (production && store) return 'mixed';
  if (production) return 'production';
  if (store) return 'store';
  return 'none';
}

export function roleGroupOf(emp: any, kind: WorkplaceKind): RoleGroup {
  const d = emp?.designation;
  if (d === 'rider' || emp?.role === 'rider') return 'rider';
  if (d === 'store_incharge') return 'store_incharge';
  if (d === 'production_incharge') return 'production_incharge';
  if (d === 'operations_manager' || d === 'operations_incharge') return 'operations';
  if (d === 'production_ops' || emp?.department === 'production' || (kind === 'production' && emp?.role !== 'manager')) return 'production_staff';
  if (emp?.role === 'manager') return 'operations';
  return 'store_staff';
}

// 'event': an event stall (events.ts), with its own check-in radius.
export type Pin = { kind: 'store' | 'production' | 'event'; id: string; name?: string; lat: number; lng: number; radiusM?: number };

// Event stalls a person is assigned to (as incharge or staff) that are open on `today`, from the
// day before the first day (setting up) to the day after the last (wrapping up) - the same window
// in which they enter the stall's figures (eventRules.ts). Their pins are added to the person's
// own workplace pins, so a check-in at the stall is verified there.
export function eventPinsFor(emp: any, events: any[], today: string): Pin[] {
  const id = emp?.employeeId ? String(emp.employeeId) : '';
  if (!id) return [];
  return (events || [])
    .filter((e) => e && !e.closedAt && e.status !== 'closed' && Number.isFinite(e.lat) && Number.isFinite(e.lng)
      && (e.inchargeId === id || (Array.isArray(e.staffIds) && e.staffIds.includes(id)))
      && typeof e.startDate === 'string' && typeof e.endDate === 'string'
      && today >= addDays(e.startDate, -1) && today <= addDays(e.endDate, 1))
    .map((e) => ({ kind: 'event' as const, id: String(e.id), name: e.name, lat: e.lat, lng: e.lng, ...(Number(e.radiusM) > 0 ? { radiusM: Number(e.radiusM) } : {}) }));
}

// The pins a person's punches are measured against: their own store / production house, or every
// pin for operations people who move between them (and when their own place isn't pinned yet).
export function workplacePins(emp: any, kind: WorkplaceKind, all: Pin[]): Pin[] {
  if (kind === 'none' && (emp?.designation === 'rider' || emp?.role === 'rider')) return [];
  const ids = new Set<string>([emp?.storeId, ...(emp?.assignedStoreIds || []), ...(emp?.assignedProductionHouseIds || [])].filter(Boolean).map(String));
  const own = all.filter((p) => ids.has(p.id) && (kind === 'mixed' || kind === 'none' || p.kind === kind));
  if (own.length) return own;
  if (kind === 'store' || kind === 'production') {
    const sameKind = all.filter((p) => p.kind === kind);
    if (sameKind.length) return sameKind;
  }
  return all;
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestPin(lat: number, lng: number, pins: Pin[]) {
  let best: { pin: Pin; distanceM: number } | null = null;
  for (const pin of pins) {
    const d = haversineM(lat, lng, pin.lat, pin.lng);
    if (!best || d < best.distanceM) best = { pin, distanceM: d };
  }
  return best;
}

export const atWorkplace = (distanceM: number, accuracyM: number | null | undefined, radiusM = DEFAULT_RADIUS_M) =>
  distanceM <= radiusM + Math.min(Math.max(0, accuracyM || 0), GPS_TOLERANCE_M);

// ---------------- Settings ----------------

export function resolveSettings(saved: any, employeeId: string, kind: WorkplaceKind, group: RoleGroup): KpiSettings {
  const shift = DEFAULT_SHIFTS[kind];
  const allowed = DEFAULT_WEIGHTS[group];
  const picked = Array.isArray(saved?.kpis) ? (saved.kpis as any[]).filter((id): id is KpiId => typeof id === 'string' && id in KPI_LABELS) : [];
  const kpis = picked.length ? [...new Set(picked)] : (Object.keys(allowed) as KpiId[]);
  const weights: Partial<Record<KpiId, number>> = {};
  for (const id of kpis) {
    const w = saved?.weights?.[id];
    weights[id] = typeof w === 'number' && w >= 0 ? w : allowed[id] ?? ADDED_KPI_WEIGHT;
  }
  return {
    employeeId,
    shiftStart: parseHHMM(saved?.shiftStart) !== null ? saved.shiftStart : shift.start,
    shiftEnd: parseHHMM(saved?.shiftEnd) !== null ? saved.shiftEnd : shift.end,
    weeklyOff: Array.isArray(saved?.weeklyOff) ? saved.weeklyOff.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    graceMin: Number.isFinite(saved?.graceMin) ? saved.graceMin : DEFAULT_GRACE_MIN,
    hasVariablePay: !!saved?.hasVariablePay,
    variablePayMax: Number.isFinite(saved?.variablePayMax) ? saved.variablePayMax : 0,
    kpis,
    weights,
    isDefault: !saved,
    updatedBy: saved?.updatedBy,
    updatedAt: saved?.updatedAt,
  };
}

// Checks a settings change. `moneyFields` false (operations managers) ignores the variable-pay fields.
export function cleanSettingsInput(body: any, moneyFields: boolean): { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  const out: Record<string, any> = {};
  if (body.shiftStart !== undefined) {
    if (parseHHMM(body.shiftStart) === null) return { ok: false, error: 'Shift start must be a time like 15:00' };
    out.shiftStart = body.shiftStart;
  }
  if (body.shiftEnd !== undefined) {
    if (parseHHMM(body.shiftEnd) === null) return { ok: false, error: 'Shift end must be a time like 22:30' };
    out.shiftEnd = body.shiftEnd;
  }
  if (body.weeklyOff !== undefined) {
    if (!Array.isArray(body.weeklyOff) || body.weeklyOff.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)) return { ok: false, error: 'Pick the weekly off days' };
    if (new Set(body.weeklyOff).size > 3) return { ok: false, error: 'At most 3 weekly off days' };
    out.weeklyOff = [...new Set(body.weeklyOff as number[])].sort();
  }
  if (body.graceMin !== undefined) {
    const g = Number(body.graceMin);
    if (!Number.isInteger(g) || g < 0 || g > 60) return { ok: false, error: 'Grace minutes must be between 0 and 60' };
    out.graceMin = g;
  }
  if (body.kpis !== undefined) {
    if (!Array.isArray(body.kpis)) return { ok: false, error: 'Pick the KPIs' };
    const ids = [...new Set(body.kpis.filter((k: any) => typeof k === 'string' && k in KPI_LABELS))];
    if (!ids.length) return { ok: false, error: 'Pick at least one KPI' };
    out.kpis = ids;
  }
  if (body.weights !== undefined) {
    if (!body.weights || typeof body.weights !== 'object') return { ok: false, error: 'Weights are not valid' };
    const w: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.weights)) {
      if (!(k in KPI_LABELS)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Each weight must be between 0 and 100' };
      w[k] = Math.round(n);
    }
    out.weights = w;
  }
  if (moneyFields) {
    if (body.hasVariablePay !== undefined) out.hasVariablePay = !!body.hasVariablePay;
    if (body.variablePayMax !== undefined) {
      const m = Number(body.variablePayMax);
      if (!Number.isFinite(m) || m < 0 || m > 200000) return { ok: false, error: 'Variable pay maximum must be between ₹0 and ₹2,00,000' };
      out.variablePayMax = Math.round(m);
    }
  }
  return { ok: true, value: out };
}

// ---------------- Punches ----------------

export type PunchEvent = {
  at: string; // when it counts from: the tap, or the detected arrival / exit
  source: 'manual' | 'geofence' | 'manager';
  verified: boolean; // GPS put the person at the workplace
  lat?: number; lng?: number; accuracyM?: number; distanceM?: number;
  placeKind?: string; placeId?: string;
  outside?: boolean; // GPS put the person away from the workplace
  noGps?: boolean;
  exempt?: boolean; // riders: no workplace geofence
  detectedAt?: string; confirmedAt?: string; confirmedBy?: string;
  flags?: string[];
};
export type PunchSuggestion = {
  detectedAt: string; lat: number; lng: number; accuracyM?: number; distanceM?: number;
  placeKind?: string; placeId?: string; simulated?: boolean; clockSkewMs?: number; receivedAt: string;
};
export type PunchRecord = {
  employeeId: string;
  date: string;
  in?: PunchEvent | null;
  out?: PunchEvent | null;
  outsideWorkplace: boolean;
  pending?: { arrival?: PunchSuggestion | null; exit?: PunchSuggestion | null };
  flags?: string[];
  updatedAt?: string;
};

export const FLAG_LABELS: Record<string, string> = {
  late_confirm: 'confirmed more than 3 hours after arriving / leaving',
  clock_skew: "phone clock didn't match the server",
  mock_location: 'phone reported a fake (mock) location',
  outside: 'away from the workplace',
  no_gps: 'no GPS',
};

export function suspicionFlags(o: { detectedAtMs?: number; confirmedAtMs?: number; clockSkewMs?: number; simulated?: boolean }) {
  const flags: string[] = [];
  if (o.detectedAtMs !== undefined && o.confirmedAtMs !== undefined && o.confirmedAtMs - o.detectedAtMs > LATE_CONFIRM_MS) flags.push('late_confirm');
  if (o.clockSkewMs !== undefined && Math.abs(o.clockSkewMs) > CLOCK_SKEW_MS) flags.push('clock_skew');
  if (o.simulated) flags.push('mock_location');
  return flags;
}

export function hoursBetween(a?: string, b?: string) {
  if (!a || !b) return null;
  const h = (Date.parse(b) - Date.parse(a)) / 3600000;
  return h > 0 && h < 24 ? Math.round(h * 100) / 100 : null;
}

// ---------------- Monthly KPIs ----------------

export type KpiResult = {
  id: KpiId;
  label: string;
  score: number | null; // 0-100, null = no data this month (left out of the total)
  weight: number;
  explanation: string;
  tip: string;
};
export type MonthKpis = {
  month: string;
  from: string | null;
  to: string | null;
  scheduledDays: number;
  kpis: KpiResult[];
  total: number | null;
  coverage: number; // share of the weights that had data (0-1)
  notes: string[];
  flags: Record<string, number>; // check-ins worth a look, by kind
};

export type MonthInput = {
  month: string;
  today: string;
  emp: { employeeId: string; joiningDate?: string | null };
  group: RoleGroup;
  kind: WorkplaceKind;
  settings: KpiSettings;
  punchSince?: string | null; // first day the shift clock was in use; earlier days skip the punch KPIs
  punches: PunchRecord[];
  timesheets: any[];
  hasTimesheetHistory?: boolean; // the person sent timesheets before this month
  leaves: any[];
  workplaceChecks: { date: string; row: any }[];
  sales?: any[]; // the store's sales rows (store incharge)
  stockOuts?: any[]; // the store's stock-out log (store incharge)
  production?: any[]; // the production house's daily production records
  // The production ledger (kg made into dough/stuffing pools, kg written off): wastage comes from
  // here when the daily records carry no weights, as they don't since the ledger arrived.
  ledgerMadeKg?: { date: string; kg: number }[];
  ledgerWastedKg?: { date: string; kg: number }[];
  requests?: any[]; // stock requests from the stores that house supplies
  trips?: any[]; // the rider's rides
  storeRequests?: any[]; // stock requests sent from the person's own store
  expenses?: any[]; // expense entries (inventory and overhead) the person logged
  approvals?: any[]; // production entries from the house that supplies the person's store
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const istDayOf = (iso: any) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? istDate(Date.parse(iso)) : null);
const MOMO_FIELDS = ['chickenMomos', 'chickenCheeseMomos', 'vegMomos', 'cheeseCornMomos', 'paneerMomos', 'vegKurkureMomos', 'chickenKurkureMomos'];

function tipFor(id: KpiId, s: KpiSettings, kind: WorkplaceKind) {
  const { start, end } = shiftMinutes(s);
  const place = kind === 'production' ? 'production house' : kind === 'store' ? 'store' : 'workplace';
  switch (id) {
    case 'attendance': return 'Come in on every working day, and apply for leave in the app beforehand so it is not counted as absent.';
    case 'punctuality': return `Be at the ${place} and check in (confirm the check-in or tap Start shift) by ${fmt12(start + s.graceMin)}.`;
    case 'fullShift': return `Stay until ${fmt12(end)} and check out (confirm or tap End shift) when you leave.`;
    case 'timesheet': return 'Send each day\'s timesheet by the end of the next day.';
    case 'workplace': return 'Do every photo check on time and fix anything that needs cleaning straight away.';
    case 'hygiene': return 'Clean before the photo - counters, floor, utensils and storage. Cleaner photos score higher.';
    case 'cashCount': return 'Save the cash count every working day before you close.';
    case 'cashAccuracy': return `Count carefully and record every cash expense so the cash matches within ${inr(CASH_TOLERANCE_INR)}.`;
    case 'stockOuts': return 'Ask for stock early (use the forecast) so nothing runs out during the day.';
    case 'productionLogged': return 'Log the day\'s production every working day.';
    case 'wastage': return `Weigh carefully and reuse leftover dough and stuffing; keep wastage at ${WASTAGE_FULL_MARKS_PCT}% or less.`;
    case 'shippedOnTime': return 'Ship every stock request by 3 PM on the day it is needed.';
    case 'trips': return 'Finish every ride you take on and confirm the delivery.';
    case 'salesOnTime': return `Save the day's sales and cash count by ${fmt12(DAY_CLOSE_BY_MIN)} after closing.`;
    case 'expensesOnTime': return `Enter every expense on the day it is paid (by ${fmt12(DAY_CLOSE_BY_MIN)} after closing), so the cash count matches.`;
    case 'productionApproved': return 'Check each day\'s production entry and approve it before it approves itself after 24 hours.';
    case 'requestOnTime': return `Send the stock request by ${fmt12(REQUEST_BY_MIN)} on the day it is for, so production can plan.`;
  }
}

export function computeMonthKpis(input: MonthInput): MonthKpis {
  const { month, today, settings, group, kind } = input;
  const weights = settings.weights;
  const ids = settings.kpis?.length ? settings.kpis : (Object.keys(DEFAULT_WEIGHTS[group]) as KpiId[]);
  const notes: string[] = [];
  const flags: Record<string, number> = {};

  // Days counted: the month from the joining date, up to yesterday for the month in progress.
  const all = monthDays(month);
  let from = all[0];
  if (input.emp.joiningDate && isDate(input.emp.joiningDate.slice(0, 10)) && input.emp.joiningDate.slice(0, 10) > from) from = input.emp.joiningDate.slice(0, 10);
  let to = all[all.length - 1];
  if (today <= to) to = addDays(today, -1);
  const days = all.filter((d) => d >= from && d <= to);
  if (from > all[0] && from <= all[all.length - 1]) notes.push(`Joined on ${from} - days before that are not counted.`);
  if (to < all[all.length - 1] && days.length) notes.push(`Counted up to ${to} (month in progress).`);

  const punchBy = new Map(input.punches.filter((p) => p?.date).map((p) => [p.date, p]));
  const sheetBy = new Map<string, any>();
  for (const t of input.timesheets || []) if (t?.date) sheetBy.set(String(t.date).slice(0, 10), t);
  const fullLeave = new Set<string>();
  const halfLeave = new Set<string>();
  for (const l of input.leaves || []) {
    if (l?.status !== 'approved' || !l.leaveDate) continue;
    (l.leaveType === 'half' ? halfLeave : fullLeave).add(String(l.leaveDate).slice(0, 10));
  }
  for (const t of input.timesheets || []) if (t?.isLeave && t.status === 'approved' && t.date) fullLeave.add(String(t.date).slice(0, 10));

  const isPresent = (d: string) => {
    const p = punchBy.get(d);
    if (p?.in || p?.out) return true;
    const t = sheetBy.get(d);
    // Timesheets save their hours as totalHours (hoursWorked was never written, so nobody counted as
    // present: attendance 0 for everyone, owner 28 Oct 2026); a start and end time also count.
    return !!t && !t.isLeave && t.status !== 'rejected' && ((Number(t.totalHours ?? t.hoursWorked) || 0) > 0 || (!!t.startTime && !!t.endTime));
  };

  let offDays = 0;
  let leaveDays = 0;
  const scheduled: string[] = [];
  for (const d of days) {
    if (!isWorkingDay(d, settings)) { offDays++; continue; }
    if (fullLeave.has(d)) { leaveDays++; continue; }
    scheduled.push(d);
  }
  const presentDays = scheduled.filter(isPresent);
  const extraDays = days.filter((d) => !scheduled.includes(d) && isPresent(d)).length;

  const results: Partial<Record<KpiId, Omit<KpiResult, 'id' | 'label' | 'weight' | 'tip'>>> = {};
  const set = (id: KpiId, score: number | null, explanation: string) => { results[id] = { score: score === null ? null : clamp100(score), explanation }; };

  // Attendance
  if (!scheduled.length) set('attendance', null, days.length ? 'No working days in this period (all weekly off or approved leave).' : 'No days to count yet.');
  else {
    const extra = [leaveDays && plural(leaveDays, 'day') + ' of approved leave', offDays && plural(offDays, 'weekly off')].filter(Boolean).join(' and ');
    set('attendance', pct(presentDays.length, scheduled.length), `Came in on ${presentDays.length} of ${scheduled.length} working days${extra ? ` (${extra} not counted)` : ''}.${extraDays ? ` Also worked ${plural(extraDays, 'extra day')}.` : ''}${!settings.weeklyOff.length ? ' There is no fixed weekly off: days off are taken as leave (4 a month), applied for in the app.' : ''}`);
  }

  // Punches: only days from the start of the shift clock, and not half-day leave.
  const { start, end } = shiftMinutes(settings);
  const since = input.punchSince || null;
  const punchDays = since ? presentDays.filter((d) => d >= since && !halfLeave.has(d)) : [];
  const isRider = group === 'rider';
  if (!since || !punchDays.length) {
    const why = !since ? 'The shift clock was not in use yet.' : 'No working days with the shift clock in use yet.';
    set('punctuality', null, why);
    set('fullShift', null, why);
  } else {
    let onTime = 0, late = 0, lateMin = 0, missedIn = 0, away = 0, noGps = 0;
    let full = 0, early = 0, missedOut = 0, workedMin = 0, pairedDays = 0;
    for (const d of punchDays) {
      const p = punchBy.get(d);
      for (const ev of [p?.in, p?.out]) for (const f of ev?.flags || []) flags[f] = (flags[f] || 0) + 1;
      if (p?.in) {
        const m = minutesOfDay(p.in.at, d);
        if (p.in.noGps) noGps++;
        if (p.in.outside && !isRider) { away++; }
        else if (m <= start + settings.graceMin) onTime++;
        if (m > start + settings.graceMin && !(p.in.outside && !isRider)) { late++; lateMin += m - start; }
      } else missedIn++;
      if (p?.out) {
        const m = minutesOfDay(p.out.at, d);
        if (m >= end - settings.graceMin) full++; else early++;
        if (p.in) {
          const worked = (Date.parse(p.out.at) - Date.parse(p.in.at)) / 60000;
          if (worked > 0 && worked < 1440) { workedMin += worked; pairedDays++; }
        }
      } else missedOut++;
    }
    if (away) flags.outside = (flags.outside || 0) + away;
    if (noGps) flags.no_gps = (flags.no_gps || 0) + noGps;
    const n = punchDays.length;
    set('punctuality', pct(onTime, n), [
      `Checked in on time (by ${fmt12(start + settings.graceMin)}) on ${onTime} of ${n} days.`,
      late ? `Late ${plural(late, 'day')}, ${Math.round(lateMin / late)} min on average.` : '',
      missedIn ? `${plural(missedIn, 'day')} without a check-in.` : '',
      away ? `${plural(away, 'check-in')} away from the workplace (not counted as on time).` : '',
      noGps ? `${plural(noGps, 'check-in')} without GPS.` : '',
    ].filter(Boolean).join(' '));
    const scheduledH = Math.round((n * (end - start)) / 6) / 10;
    set('fullShift', pct(full, n), [
      `Stayed until the end of the shift (${fmt12(end)}) on ${full} of ${n} days.`,
      early ? `Left early on ${plural(early, 'day')}.` : '',
      missedOut ? `${plural(missedOut, 'day')} without a check-out.` : '',
      pairedDays ? `${Math.round(workedMin / 6) / 10} h at work on ${plural(pairedDays, 'day')} with both check-in and check-out, against ${scheduledH} h scheduled for ${plural(n, 'day')}.` : '',
    ].filter(Boolean).join(' '));
  }

  // Timesheets: sent by the end of the next day, for days worked.
  if (ids.includes('timesheet')) {
    const monthSheets = (input.timesheets || []).filter((t) => t?.date && days.includes(String(t.date).slice(0, 10)));
    if (!monthSheets.length && !input.hasTimesheetHistory) set('timesheet', null, 'No timesheets on record for this person - not counted.');
    else {
      let considered = 0, onTimeSheets = 0, missing = 0, unknown = 0;
      for (const d of presentDays) {
        const t = sheetBy.get(d);
        if (!t || t.isLeave) { considered++; missing++; continue; }
        const sent = istDayOf(t.submittedAt);
        if (!sent) { unknown++; continue; } // saved before the submit time was recorded
        considered++;
        if (sent <= addDays(d, TIMESHEET_DUE_DAYS)) onTimeSheets++;
      }
      if (!considered) set('timesheet', null, 'No days worked with a timesheet to check yet.');
      else set('timesheet', pct(onTimeSheets, considered), `Timesheet sent by the next day for ${onTimeSheets} of ${considered} days worked.${missing ? ` ${plural(missing, 'day')} with no timesheet.` : ''}${unknown ? ` ${plural(unknown, 'older timesheet')} without a send time not counted.` : ''}`);
    }
  }

  // Workplace photo checks (rows written by the photo-check feature; no row = nothing assigned).
  {
    let required = 0, done = 0, onTimeChecks = 0, needsCleaning = 0, scoreSum = 0, scored = 0;
    for (const { date, row } of input.workplaceChecks || []) {
      if (!row || date < from || date > to) continue;
      required += Number(row.required) || 0;
      done += typeof row.done === 'boolean' ? (row.done ? 1 : 0) : Number(row.done) || 0;
      onTimeChecks += typeof row.onTime === 'boolean' ? (row.onTime ? Number(row.done) || 1 : 0) : Number(row.onTime) || 0;
      const items = Array.isArray(row.items) ? row.items : Object.values(row.items || {});
      let rowFlags = 0;
      for (const it of items as any[]) {
        if (!it || typeof it !== 'object') continue;
        if (it.needsCleaning === true || [it.status, it.verdict, it.aiVerdict].includes('needs_cleaning')) rowFlags++;
        const s = Number(it.aiScore);
        if (it.aiScore !== undefined && it.aiScore !== null && Number.isFinite(s) && s >= 0 && s <= 10) { scoreSum += s; scored++; }
      }
      needsCleaning += Math.max(rowFlags, Number(row.flaggedNeedsCleaning) || 0);
    }
    if (!required) set('workplace', null, 'No photo checks were assigned.');
    else set('workplace', (Math.min(onTimeChecks, required) / required) * 100 - PHOTO_FLAG_PENALTY * needsCleaning,
      `Photo checks done on time: ${Math.min(onTimeChecks, required)} of ${required} (${done} done in all).${needsCleaning ? ` ${plural(needsCleaning, 'photo')} showed something needing cleaning (${PHOTO_FLAG_PENALTY} points off each).` : ''}`);
    if (!scored) set('hygiene', null, 'No photos with a hygiene score yet.');
    else set('hygiene', (scoreSum / scored) * 10, `Average hygiene score ${Math.round((scoreSum / scored) * 10) / 10} out of 10 across ${plural(scored, 'scored photo')}.`);
  }

  // Store incharge: the day's cash count and how well it matched; items running out.
  if (ids.includes('cashCount') || ids.includes('cashAccuracy')) {
    const saved = new Map<string, any>();
    for (const s of input.sales || []) {
      const by = String(s?.createdBy || '');
      if (!s?.date || !by || by === 'pos-sync' || by === 'cash-topup-approval') continue; // auto-created placeholders
      saved.set(String(s.date).slice(0, 10), s);
    }
    if (!scheduled.length) { set('cashCount', null, 'No working days to check.'); set('cashAccuracy', null, 'No working days to check.'); }
    else {
      const savedDays = scheduled.filter((d) => saved.has(d));
      set('cashCount', pct(savedDays.length, scheduled.length), `Cash count saved on ${savedDays.length} of ${scheduled.length} working days.`);
      if (!savedDays.length) set('cashAccuracy', null, 'No cash counts saved to check.');
      else {
        let ok = 0, worst = 0;
        for (const d of savedDays) {
          const s = saved.get(d);
          const gap = Math.abs(Number(s.salesDiscrepancy !== undefined && s.salesDiscrepancy !== null ? s.salesDiscrepancy : s.cashOffset) || 0);
          if (gap <= CASH_TOLERANCE_INR) ok++;
          worst = Math.max(worst, gap);
        }
        set('cashAccuracy', pct(ok, savedDays.length), `Cash over/short within ${inr(CASH_TOLERANCE_INR)} on ${ok} of ${savedDays.length} days${worst > CASH_TOLERANCE_INR ? `; biggest gap ${inr(worst)}` : ''}.`);
      }
    }
  }
  if (ids.includes('stockOuts')) {
    const outs = (input.stockOuts || []).filter((s) => {
      const d = istDayOf(s?.startAt);
      return d && d >= from && d <= to && s.reason !== 'short_delivery';
    });
    if (!days.length) set('stockOuts', null, 'No days to count yet.');
    else set('stockOuts', 100 - STOCK_OUT_PENALTY * outs.length, outs.length
      ? `${plural(outs.length, 'item')} ran out at the store (short deliveries from production not counted) - ${STOCK_OUT_PENALTY} points off each.`
      : 'Nothing ran out at the store (short deliveries from production not counted).');
  }

  // Production: logged every working day, wastage, shipping on time.
  if (ids.includes('productionLogged')) {
    const logged = new Set((input.production || []).map((p) => String(p?.date || '').slice(0, 10)));
    if (!scheduled.length) set('productionLogged', null, 'No working days to check.');
    else {
      const n = scheduled.filter((d) => logged.has(d)).length;
      set('productionLogged', pct(n, scheduled.length), `Production logged on ${n} of ${scheduled.length} working days.`);
    }
  }
  if (ids.includes('wastage')) {
    let used = 0, wasted = 0;
    for (const p of input.production || []) {
      const d = String(p?.date || '').slice(0, 10);
      if (d < from || d > to) continue;
      for (const f of MOMO_FIELDS) {
        const m = p?.[f] || {};
        used += (Number(m.dough) || 0) + (Number(m.stuffing) || 0) + (Number(m.batter) || 0) + (Number(m.coating) || 0);
      }
      const w = p?.wastage || {};
      wasted += (Number(w.dough) || 0) + (Number(w.stuffing) || 0) + (Number(w.batter) || 0) + (Number(w.coating) || 0);
    }
    let source = 'dough, stuffing, batter and coating';
    if (used <= 0 && (input.ledgerMadeKg || []).length) {
      const inRange = (x: { date: string }) => x.date >= from && x.date <= to;
      used = (input.ledgerMadeKg || []).filter(inRange).reduce((s, x) => s + x.kg, 0);
      wasted = (input.ledgerWastedKg || []).filter(inRange).reduce((s, x) => s + x.kg, 0);
      source = 'dough and stuffing in the production ledger';
    }
    if (used <= 0) set('wastage', null, 'No production with weights logged.');
    else {
      const w = (wasted / used) * 100;
      const score = w <= WASTAGE_FULL_MARKS_PCT ? 100 : w >= WASTAGE_ZERO_PCT ? 0 : ((WASTAGE_ZERO_PCT - w) / (WASTAGE_ZERO_PCT - WASTAGE_FULL_MARKS_PCT)) * 100;
      set('wastage', score, `Wastage ${Math.round(w * 10) / 10}% (${Math.round(wasted * 10) / 10} kg of ${Math.round(used * 10) / 10} kg ${source}). ${WASTAGE_FULL_MARKS_PCT}% or less scores full marks, ${WASTAGE_ZERO_PCT}% or more scores zero.`);
    }
  }
  if (ids.includes('shippedOnTime')) {
    let shipped = 0, onTimeShip = 0;
    for (const r of input.requests || []) {
      const asked = String(r?.requestDate || '').slice(0, 10);
      if (!asked || asked < from || asked > to || !r.shippedAt) continue;
      const shipDay = istDayOf(r.shippedAt);
      if (!shipDay) continue;
      shipped++;
      if (shipDay < asked || (shipDay === asked && minutesOfDay(r.shippedAt, asked) <= SHIP_BY_MIN)) onTimeShip++;
    }
    if (!shipped) set('shippedOnTime', null, 'No stock requests shipped in this period.');
    else set('shippedOnTime', pct(onTimeShip, shipped), `${onTimeShip} of ${shipped} stock requests shipped by 3 PM on the day asked.`);
  }

  // Store duties: the day's sales saved, expenses entered and stock asked for on time.
  const dayCloseDue = (d: string) => istMidnightMs(d) + DAY_CLOSE_BY_MIN * 60000;
  if (ids.includes('salesOnTime')) {
    const byDay = new Map<string, any>();
    for (const s of input.sales || []) if (s?.date) byDay.set(String(s.date).slice(0, 10), s);
    let considered = 0, onTimeDays = 0, missing = 0, unknown = 0;
    for (const d of days) {
      const s = byDay.get(d);
      if (!s) continue; // no sales at all: the store was shut
      const byPerson = !['', 'pos-sync', 'cash-topup-approval'].includes(String(s.createdBy || '')) || !!s.updatedBy;
      if (!byPerson) { considered++; missing++; continue; }
      // First save by a person (stamped from Oct 2026); before that, the save time the app wrote
      // as approvedAt on a day that needed no approval, else the last edit.
      const savedAt = s.firstSavedAt || (!s.approvalRequired && s.approvedAt) || s.updatedAt;
      if (!savedAt || Number.isNaN(Date.parse(savedAt))) { unknown++; continue; }
      considered++;
      if (Date.parse(savedAt) <= dayCloseDue(d)) onTimeDays++;
    }
    if (!considered) set('salesOnTime', null, unknown ? 'Days saved before the save time was recorded - not counted.' : 'No sales days to check yet.');
    else set('salesOnTime', pct(onTimeDays, considered), `Sales and cash count saved by ${fmt12(DAY_CLOSE_BY_MIN)} after closing on ${onTimeDays} of ${considered} days.${missing ? ` ${plural(missing, 'day')} not saved at all.` : ''}${unknown ? ` ${plural(unknown, 'older day')} without a save time not counted.` : ''}`);
  }
  if (ids.includes('expensesOnTime')) {
    // Entry ids start with the time they were made (Date.now()), so older entries without a
    // createdAt still have one.
    const enteredAt = (e: any) => {
      const t = Date.parse(e?.createdAt);
      if (Number.isFinite(t)) return t;
      const m = /^(\d{13})-/.exec(String(e?.id || ''));
      return m ? Number(m[1]) : null;
    };
    let n = 0, ok = 0, lateDays = 0;
    for (const e of input.expenses || []) {
      const d = String(e?.date || '').slice(0, 10);
      if (!d || d < from || d > to) continue;
      const t = enteredAt(e);
      if (t === null) continue;
      n++;
      if (t <= dayCloseDue(d)) ok++;
      else lateDays += (t - dayCloseDue(d)) / 86400000;
    }
    if (!n) set('expensesOnTime', null, 'No expenses entered in this period.');
    else set('expensesOnTime', pct(ok, n), `${ok} of ${plural(n, 'expense entry', 'expense entries')} entered by ${fmt12(DAY_CLOSE_BY_MIN)} after the day paid.${n > ok ? ` The late ones came ${Math.max(1, Math.round(lateDays / (n - ok)))} day(s) late on average.` : ''}`);
  }
  if (ids.includes('productionApproved')) {
    let decided = 0, byPerson = 0;
    for (const p of input.approvals || []) {
      const d = String(p?.date || '').slice(0, 10);
      if (!d || d < from || d > to || p.approvalStatus !== 'approved') continue;
      decided++;
      if (!/^auto-approved/i.test(String(p.approvedBy || ''))) byPerson++;
    }
    if (!decided) set('productionApproved', null, 'No production entries to approve in this period.');
    else set('productionApproved', pct(byPerson, decided), `${byPerson} of ${plural(decided, 'production entry', 'production entries')} checked and approved by a person.${decided > byPerson ? ` ${decided - byPerson} approved themselves after 24 hours with nobody checking.` : ''}`);
  }
  if (ids.includes('requestOnTime')) {
    let n = 0, ok = 0;
    for (const r of input.storeRequests || []) {
      const d = String(r?.requestDate || '').slice(0, 10);
      if (!d || d < from || d > to || !r.createdAt || Number.isNaN(Date.parse(r.createdAt))) continue;
      n++;
      if (Date.parse(r.createdAt) <= istMidnightMs(d) + REQUEST_BY_MIN * 60000) ok++;
    }
    if (!n) set('requestOnTime', null, 'No stock requests sent in this period.');
    else set('requestOnTime', pct(ok, n), `${ok} of ${plural(n, 'stock request')} sent by ${fmt12(REQUEST_BY_MIN)} on the day they were for.`);
  }

  // Riders: rides finished.
  if (ids.includes('trips')) {
    let delivered = 0, unfinished = 0, cancelled = 0;
    for (const t of input.trips || []) {
      const d = String(t?.date || '').slice(0, 10);
      if (d < from || d > to) continue;
      if (t.status === 'cancelled') cancelled++;
      else if (t.status === 'delivered') delivered++;
      else unfinished++;
    }
    if (!delivered && !unfinished) set('trips', null, 'No rides in this period.');
    else set('trips', pct(delivered, delivered + unfinished), `Delivered ${delivered} of ${delivered + unfinished} rides${unfinished ? ` (${unfinished} left unfinished)` : ''}${cancelled ? `; ${plural(cancelled, 'cancelled ride')} not counted` : ''}.`);
  }

  const kpis: KpiResult[] = ids.map((id) => ({
    id,
    label: KPI_LABELS[id],
    score: results[id]?.score ?? null,
    weight: weights[id] ?? DEFAULT_WEIGHTS[group][id] ?? ADDED_KPI_WEIGHT,
    explanation: results[id]?.explanation || 'No data.',
    tip: tipFor(id, settings, kind),
  }));
  const { total, coverage } = weightedTotal(kpis);
  if (total !== null && coverage < 0.5) notes.push('Less than half of the KPI weight has data yet, so the total may move a lot.');
  return { month, from: days.length ? from : null, to: days.length ? to : null, scheduledDays: scheduled.length, kpis, total, coverage, notes, flags };
}

export function weightedTotal(kpis: Pick<KpiResult, 'score' | 'weight'>[]) {
  let sum = 0, w = 0, allW = 0;
  for (const k of kpis) {
    if (!(k.weight > 0)) continue;
    allW += k.weight;
    if (k.score === null) continue;
    sum += k.score * k.weight;
    w += k.weight;
  }
  return { total: w > 0 ? Math.round((sum / w) * 10) / 10 : null, coverage: allW > 0 ? Math.round((w / allW) * 100) / 100 : 0 };
}

// ---------------- Variable pay ----------------

// The formula (owner, 27 Oct 2026): a weighted total under 50 earns nothing; from 50 to 100 the
// amount rises in a straight line from ₹0 to the person's monthly maximum (75 -> half the
// maximum). Rounded to the nearest ₹10. No total (no data) -> ₹0.
export function variablePayFormula(total: number | null, max: number) {
  if (!(max > 0)) return { amount: 0, explanation: 'No variable-pay maximum is set.' };
  if (total === null) return { amount: 0, explanation: 'No KPI data this month, so nothing is suggested.' };
  if (total < 50) return { amount: 0, explanation: `Total ${total} is under 50, so the formula gives ₹0.` };
  const amount = Math.min(max, Math.round((max * (Math.min(total, 100) - 50)) / 50 / 10) * 10);
  return { amount, explanation: `Total ${total}: (${total} - 50) / 50 of the ${inr(max)} maximum = ${inr(amount)}.` };
}

// The AI may move the formula amount by at most ±15%, never below ₹0 or above the maximum.
export function clampAiAmount(formula: number, ai: any, max: number) {
  const lo = Math.max(0, Math.floor(formula * (1 - AI_MAX_SHIFT)));
  const hi = Math.min(max, Math.ceil(formula * (1 + AI_MAX_SHIFT)));
  const n = Number(ai);
  const want = Number.isFinite(n) ? Math.round(n) : formula;
  const amount = Math.max(lo, Math.min(hi, want));
  return { amount, clamped: amount !== want, lo, hi };
}

// The approved amount must be a whole number of rupees between 0 and the maximum.
export function checkApprovedAmount(amount: any, max: number): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Enter an amount of ₹0 or more' };
  if (max > 0 && n > max) return { ok: false, error: `The amount can't be more than the ${inr(max)} maximum` };
  if (!(max > 0) && n > 0) return { ok: false, error: 'Set a variable-pay maximum for this person first' };
  return { ok: true, value: Math.round(n) };
}
