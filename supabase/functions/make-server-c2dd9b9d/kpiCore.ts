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
// Place kept clean (incharges, owner 28 Oct 2026): every photo at their store or kitchen, whoever took it.
export const PLACE_FLAG_PENALTY = 5; // per photo needing cleaning
export const PLACE_SEVERE_PENALTY = 15; // per photo showing a garbage dump, overflowing waste, pests or filth
export const WASTAGE_FULL_MARKS_PCT = 2; // production wastage at or under 2% scores 100 ...
export const WASTAGE_ZERO_PCT = 10; // ... and 10% or more scores 0, straight line between
export const AI_MAX_SHIFT = 0.15; // the AI may move the formula amount by at most ±15%
// Until this day, a worked day with no check-in is judged from the timesheet's start and end
// (owner, 28 Oct 2026: most staff weren't on the shift clock yet). After it, no check-in = not on time.
export const TIMESHEET_TIMES_UNTIL = '2026-11-10';
export const ACCEPT_BY_MIN = 9 * 60; // a stock request should be accepted (preparation started) by 9 AM on its day
// Expenses entered correctly (owner, 29 Oct 2026): counted from November, when the amount rule
// (packs with the size of each) started. The expense checks (expenseReview.ts) that mean the entry
// itself was wrong; a bill photo, the owner's OK or a big spend are not entry mistakes.
export const EXPENSE_ACCURACY_FROM = '2026-11-01';
export const EXPENSE_MISTAKES: Record<string, string> = {
  category: 'wrong category', amount: 'amount unclear', weight: 'unit or quantity slip', bundle: 'wrong pieces per pack',
  duplicate: 'logged twice', detail: 'repair or labour without details',
};

// Store cover (owner, 28 Oct 2026): someone who works at the production house from 8 AM goes to
// the store for the evening on a store-cover day - a store staff member on approved leave, a
// Saturday or Sunday, or a festival in the store calendar - and checks in there separately.
export type StoreCover = { storeId: string; start: string; end: string; productionEnd: string; onLeave: boolean; weekends: boolean; festivals: boolean };
export const DEFAULT_STORE_COVER = { start: '17:00', end: '22:00', productionEnd: '16:30', onLeave: true, weekends: true, festivals: true };

export function cleanStoreCover(raw: any): StoreCover | null {
  if (!raw || typeof raw !== 'object' || !raw.storeId) return null;
  const time = (v: any, d: string) => (parseHHMM(v) !== null ? String(v) : d);
  return {
    storeId: String(raw.storeId),
    start: time(raw.start, DEFAULT_STORE_COVER.start),
    end: time(raw.end, DEFAULT_STORE_COVER.end),
    productionEnd: time(raw.productionEnd, DEFAULT_STORE_COVER.productionEnd),
    onLeave: raw.onLeave !== false,
    weekends: raw.weekends !== false,
    festivals: raw.festivals !== false,
  };
}

// Why a day is a store-cover day (empty: it isn't). storeStaff are the store's own people.
export function coverReasonsOn(
  date: string,
  cover: StoreCover,
  ctx: { coverId: string; storeStaff: { id: string; name: string }[]; leaves: any[]; calendar: Map<string, any> },
): string[] {
  const reasons: string[] = [];
  const wd = weekdayOf(date);
  if (cover.weekends && (wd === 0 || wd === 6)) reasons.push(wd === 0 ? 'Sunday' : 'Saturday');
  const ev = ctx.calendar.get(date);
  if (cover.festivals && ev && ev.confirmed !== false && ev.effect !== 'closed') reasons.push(String(ev.name || 'Festival'));
  if (cover.onLeave) {
    const names = new Map(ctx.storeStaff.filter((p) => p.id !== ctx.coverId).map((p) => [p.id, p.name]));
    for (const l of ctx.leaves) {
      if (l?.status !== 'approved' || l.leaveType === 'half' || String(l.leaveDate || '').slice(0, 10) !== date) continue;
      const name = names.get(String(l.employeeId));
      if (name && !reasons.includes(`${name} on leave`)) reasons.push(`${name} on leave`);
    }
  }
  return reasons;
}
// Extra hours (owner, 28 Oct 2026): time before the shift start or after its end, from the
// check-in and check-out, counts once the person's incharge confirms it was needed. Every 4
// confirmed hours in the month add a point to the KPI total, at most 5, which raises variable pay.
export const EXTRA_MIN_OFFERED = 30; // less than this beyond the shift in a day isn't offered
export const EXTRA_HOURS_PER_POINT = 4;
export const EXTRA_POINTS_MAX = 5;

export type KpiId =
  | 'attendance' | 'punctuality' | 'fullShift' | 'timesheet' | 'workplace' | 'hygiene'
  | 'cashCount' | 'cashAccuracy' | 'stockOuts' | 'productionLogged' | 'wastage' | 'shippedOnTime' | 'trips'
  | 'salesOnTime' | 'expensesOnTime' | 'productionApproved' | 'requestOnTime' | 'placeClean' | 'posCash' | 'productionCash'
  | 'storeCover' | 'requestAccepted' | 'cratesClean' | 'photoChecks' | 'storeReadiness' | 'expenseAccuracy';

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
  cashAccuracy: 'Store cash matches',
  stockOuts: 'No stock-outs',
  productionLogged: 'Production logged',
  wastage: 'Low wastage',
  shippedOnTime: 'Shipped on time',
  trips: 'Rides completed',
  salesOnTime: 'Sales saved on time',
  expensesOnTime: 'Expenses entered on time',
  productionApproved: 'Production approved on time',
  requestOnTime: 'Stock request sent on time',
  placeClean: 'Place kept clean (all photos)',
  posCash: 'POS cash matches (cashier)',
  productionCash: 'Production cash matches',
  storeCover: 'Store cover kept',
  requestAccepted: 'Requests accepted by 9 AM',
  cratesClean: 'Crates and containers clean',
  photoChecks: 'Photo checks (on time and clean)',
  storeReadiness: 'Store ready on time',
  expenseAccuracy: 'Expenses entered correctly',
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
// The crates and containers photo check(s) at a place, by name or id (a renamed check still counts).
export const isCratesCheck = (x: { id?: string; name?: string }) => /crate|container/i.test(`${x.id || ''} ${x.name || ''}`);
export const ADDED_KPI_WEIGHT = 10;

// Default shift by workplace (owner, 27-28 Oct 2026): store 3:00-10:30 PM; production house
// 8 AM-7 PM with a one-hour break taken whenever suits the day.
export const DEFAULT_SHIFTS: Record<WorkplaceKind, { start: string; end: string }> = {
  store: { start: '15:00', end: '22:30' },
  production: { start: '08:00', end: '19:00' },
  mixed: { start: '11:00', end: '22:00' },
  none: { start: '11:00', end: '22:00' },
};
export const DEFAULT_GRACE_MIN = 10;
export const DEFAULT_BREAK_MIN: Record<WorkplaceKind, number> = { store: 0, production: 60, mixed: 0, none: 0 };

export type KpiSettings = {
  employeeId: string;
  shiftStart: string; // HH:MM IST
  shiftEnd: string; // HH:MM IST; earlier than shiftStart means the shift ends after midnight
  weeklyOff: number[]; // 0 = Sunday ... 6 = Saturday
  graceMin: number;
  breakMin: number; // unpaid break inside the shift, taken at any time
  storeCover: StoreCover | null; // evenings at the store on cover days (see coverReasonsOn)
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
  // Operations staff move between the store and the production house all day: a check-in at any
  // Bunny Momos place counts (owner, 28 Oct 2026 - one was marked away at the production house).
  if (emp?.designation === 'operations_incharge' || emp?.designation === 'operations_manager') return all;
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
    breakMin: Number.isFinite(saved?.breakMin) ? saved.breakMin : DEFAULT_BREAK_MIN[kind],
    storeCover: cleanStoreCover(saved?.storeCover),
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
  if (body.storeCover !== undefined) {
    if (body.storeCover === null) out.storeCover = null;
    else {
      const sc = cleanStoreCover(body.storeCover);
      if (!sc) return { ok: false, error: 'Store cover needs a store' };
      out.storeCover = sc;
    }
  }
  if (body.breakMin !== undefined) {
    const b = Number(body.breakMin);
    if (!Number.isInteger(b) || b < 0 || b > 180) return { ok: false, error: 'The break must be between 0 and 180 minutes' };
    out.breakMin = b;
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
  total: number | null; // includes the extra-hours points, at most 100
  extra: { points: number; hours: number; days: number; pendingDays: number } | null;
  complaints: { points: number; count: number } | null; // points off the total for upheld customer complaints
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
  extraHours?: { date: string; minutes: number; status: 'confirmed' | 'declined' }[]; // the incharge's decisions
  storeRequests?: any[]; // stock requests sent from the person's own store
  expenses?: any[]; // expense entries (inventory and overhead) the person logged
  expenseFlags?: any[]; // the expense checks' flags on those entries (expense-flag:{expenseId}:{kind})
  approvals?: any[]; // production entries from the house that supplies the person's store
  placePhotos?: { date: string; item: any }[]; // every photo taken at the incharge's store or kitchen
  crateChecks?: { date: string; itemId: string; item: any | null }[]; // crates and containers checks due at that place, with the photo if one came
  productionCash?: any[]; // the day's production-house cash counts (production-cash:{house}:{date})
  coverDays?: { date: string; reasons: string[] }[]; // this month's store-cover days for the person
  coverPunches?: { date: string; rec: any }[]; // their separate store check-ins (punch-cover:{id}:{date})
  openingDays?: { date: string; score: number | null }[]; // the store opening checklist on days it was theirs (openingChecklist.ts), score 0-1
  complaintPenalties?: { date: string; points: number }[]; // upheld customer complaints decided this month (complaints.ts)
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
    case 'photoChecks': return 'Send every photo on time, and clean before you take it: half the marks are for on time, half for how clean the photos score.';
    case 'cashCount': return 'Save the cash count every working day before you close.';
    case 'cashAccuracy': return `Count carefully and record every cash expense so the cash matches within ${inr(CASH_TOLERANCE_INR)}.`;
    case 'posCash': return `Take the right amount for every bill and ring up everything on the POS, so cash and Paytm match the POS within ${inr(CASH_TOLERANCE_INR)}.`;
    case 'storeReadiness': return 'Tick every item on the opening checklist as it is ready, before 4 PM. Ticked later in the day counts half.';
    case 'storeCover': return s.storeCover ? `On a store-cover day, leave the production house by ${fmt12(parseHHMM(s.storeCover.productionEnd) || 0)}, check in at the store by ${fmt12((parseHHMM(s.storeCover.start) || 0) + s.graceMin)} and stay until ${fmt12(parseHHMM(s.storeCover.end) || 0)}.` : 'Check in at the store on store-cover days.';
    case 'requestAccepted': return `Accept each day's stock request and start preparing by ${fmt12(ACCEPT_BY_MIN)}, so it ships on time.`;
    case 'productionCash': return `Record every production-house cash expense and count the cash each evening, so it matches within ${inr(CASH_TOLERANCE_INR)}.`;
    case 'stockOuts': return 'Ask for stock early (use the forecast) so nothing runs out during the day.';
    case 'productionLogged': return 'Log the day\'s production every working day.';
    case 'wastage': return `Weigh carefully and reuse leftover dough and stuffing; keep wastage at ${WASTAGE_FULL_MARKS_PCT}% or less.`;
    case 'shippedOnTime': return 'Ship every stock request by 3 PM on the day it is needed.';
    case 'trips': return 'Finish every ride you take on and confirm the delivery.';
    case 'salesOnTime': return `Save the day's sales and cash count by ${fmt12(DAY_CLOSE_BY_MIN)} after closing.`;
    case 'expensesOnTime': return `Enter every expense on the day it is paid (by ${fmt12(DAY_CLOSE_BY_MIN)} after closing), so the cash count matches.`;
    case 'expenseAccuracy': return 'Enter each expense right the first time: the right category, and an amount that says exactly what was bought - packs with the size of each (Butter 4 packets × 500 g, not 8 pcs), vegetables by weight. An entry the app flags that turns out wrong counts against you; one marked correct does not.';
    case 'productionApproved': return 'Check each day\'s production entry and approve it before it approves itself after 24 hours.';
    case 'placeClean': return `Walk the whole ${place} every day: garbage out, bins covered, nothing piled up. Every photo that needs cleaning costs ${PLACE_FLAG_PENALTY} points, a garbage dump or filth ${PLACE_SEVERE_PENALTY}.`;
    case 'requestOnTime': return `Send the stock request by ${fmt12(REQUEST_BY_MIN)} on the day it is for, so production can plan.`;
    case 'cratesClean': return 'Wash, dry and stack every crate and container with the lids on, and photograph them each morning (a photo for each stack). No photo scores nothing that day; one that needs cleaning, half.';
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

  // On time / full shift: the check-in and check-out; on a worked day without them, the
  // timesheet's start and end until TIMESHEET_TIMES_UNTIL (marked as not verified). Days before the
  // shift clock with no timesheet times are left out; half-day leave days are always left out.
  const { start, end } = shiftMinutes(settings);
  const since = input.punchSince || null;
  const isRider = group === 'rider';
  const sheetTimes = (d: string) => {
    const t = sheetBy.get(d);
    if (!t || t.isLeave || t.status === 'rejected' || d > TIMESHEET_TIMES_UNTIL) return null;
    const s = parseHHMM(t.startTime);
    let e = parseHHMM(t.endTime);
    if (s === null && e === null) return null;
    if (s !== null && e !== null && e <= s) e += 1440; // ended after midnight
    return { s, e };
  };
  type DaySource = { d: string; punch: PunchRecord | null; sheet: { s: number | null; e: number | null } | null };
  // On a store-cover day the production part of the shift ends early (the store part is storeCover).
  const coverSet = new Set((input.coverDays || []).map((x) => x.date));
  const coverEnd = settings.storeCover ? parseHHMM(settings.storeCover.productionEnd) : null;
  const timedDays: DaySource[] = [];
  for (const d of presentDays) {
    if (halfLeave.has(d)) continue;
    const p = punchBy.get(d);
    if (p?.in || p?.out) { timedDays.push({ d, punch: p, sheet: null }); continue; }
    const sheet = sheetTimes(d);
    if (sheet) timedDays.push({ d, punch: null, sheet });
    else if (since && d >= since) timedDays.push({ d, punch: null, sheet: null }); // shift clock in use, nothing recorded
  }
  if (!timedDays.length) {
    const why = !since ? 'No check-ins or timesheet times yet.' : 'No working days with a check-in or timesheet times yet.';
    set('punctuality', null, why);
    set('fullShift', null, why);
  } else {
    let onTime = 0, late = 0, lateMin = 0, missedIn = 0, away = 0, noGps = 0;
    let full = 0, early = 0, missedOut = 0, workedMin = 0, pairedDays = 0, fromSheet = 0;
    for (const { d, punch: p, sheet } of timedDays) {
      if (sheet) fromSheet++;
      for (const ev of [p?.in, p?.out]) for (const f of ev?.flags || []) flags[f] = (flags[f] || 0) + 1;
      const inMin = p?.in ? minutesOfDay(p.in.at, d) : sheet?.s ?? null;
      const outMin = p?.out ? minutesOfDay(p.out.at, d) : sheet?.e ?? null;
      const outside = !!p?.in?.outside && !isRider;
      if (inMin !== null) {
        if (p?.in?.noGps) noGps++;
        if (outside) away++;
        else if (inMin <= start + settings.graceMin) onTime++;
        if (inMin > start + settings.graceMin && !outside) { late++; lateMin += inMin - start; }
      } else missedIn++;
      if (outMin !== null) {
        const dayEnd = coverEnd !== null && coverSet.has(d) ? coverEnd : end;
        if (outMin >= dayEnd - settings.graceMin) full++; else early++;
        if (inMin !== null) {
          const worked = outMin - inMin;
          if (worked > 0 && worked < 1440) { workedMin += worked; pairedDays++; }
        }
      } else missedOut++;
    }
    if (away) flags.outside = (flags.outside || 0) + away;
    if (noGps) flags.no_gps = (flags.no_gps || 0) + noGps;
    const n = timedDays.length;
    const sheetNote = fromSheet ? `${plural(fromSheet, 'day')} judged from the timesheet (no check-in, not verified).` : '';
    set('punctuality', pct(onTime, n), [
      `On time (by ${fmt12(start + settings.graceMin)}) on ${onTime} of ${n} days.`,
      late ? `Late ${plural(late, 'day')}, ${Math.round(lateMin / late)} min on average.` : '',
      missedIn ? `${plural(missedIn, 'day')} without a check-in.` : '',
      away ? `${plural(away, 'check-in')} away from the workplace (not counted as on time).` : '',
      noGps ? `${plural(noGps, 'check-in')} without GPS.` : '',
      sheetNote,
    ].filter(Boolean).join(' '));
    const scheduledH = Math.round((n * Math.max(0, end - start - (settings.breakMin || 0))) / 6) / 10;
    set('fullShift', pct(full, n), [
      `Stayed until the end of the shift (${fmt12(end)}) on ${full} of ${n} days.`,
      early ? `Left early on ${plural(early, 'day')}.` : '',
      missedOut ? `${plural(missedOut, 'day')} without a check-out.` : '',
      pairedDays ? `${Math.round(Math.max(0, workedMin - pairedDays * (settings.breakMin || 0)) / 6) / 10} h at work (less ${settings.breakMin || 0} min break a day) on ${plural(pairedDays, 'day')} with a start and end time, against ${scheduledH} h scheduled for ${plural(n, 'day')}.` : '',
      sheetNote,
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
      if (!row || date < from || date > to || fullLeave.has(date)) continue; // on leave: someone else covers
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
    // The two as one (owner, 28 Oct 2026, for the production incharge): half on time, half clean.
    const parts = [results.workplace, results.hygiene].filter((r) => r && r.score !== null) as { score: number; explanation: string }[];
    if (!parts.length) set('photoChecks', null, 'No photo checks yet.');
    else set('photoChecks', parts.reduce((sum, r) => sum + r.score, 0) / parts.length,
      `Half for on time, half for clean. ${[results.workplace, results.hygiene].map((r) => r?.explanation).filter(Boolean).join(' ')}`);
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
  // Store cover: a separate check-in at the store on each cover day, on time, staying until the end.
  // Store opening checklist (owner, 28 Oct 2026): each day it was theirs, ticked by the due time
  // counts in full, later that day half; days on leave are the cover person's.
  if (ids.includes('storeReadiness')) {
    const days = (input.openingDays || []).filter((x) => x.date >= from && x.date <= to && !fullLeave.has(x.date) && x.score !== null);
    if (!days.length) set('storeReadiness', null, 'No opening checklists yet.');
    else {
      const full = days.filter((x) => (x.score as number) >= 0.999).length;
      const avg = days.reduce((sum, x) => sum + (x.score as number), 0) / days.length;
      set('storeReadiness', avg * 100, `Opening checklist: ${full} of ${plural(days.length, 'day')} fully ticked on time; the days average ${Math.round(avg * 100)}%.`);
    }
  }
  if (ids.includes('storeCover')) {
    const cover = settings.storeCover;
    const coverDays = (input.coverDays || []).filter((x) => x.date >= from && x.date <= to && !fullLeave.has(x.date));
    if (!cover) set('storeCover', null, 'No store cover set up for this person.');
    else if (!coverDays.length) set('storeCover', null, 'No store-cover days in this period.');
    else {
      const recs = new Map((input.coverPunches || []).map((x) => [x.date, x.rec]));
      const cStart = parseHHMM(cover.start) as number;
      const cEnd = parseHHMM(cover.end) as number;
      let kept = 0, noCheckIn = 0, lateIn = 0, early = 0, away = 0;
      for (const { date } of coverDays) {
        const rec = recs.get(date);
        if (!rec?.in) { noCheckIn++; continue; }
        if (rec.in.outside) { away++; continue; }
        const inOk = minutesOfDay(rec.in.at, date) <= cStart + settings.graceMin;
        const outOk = !!rec.out && minutesOfDay(rec.out.at, date) >= cEnd - settings.graceMin;
        if (!inOk) lateIn++;
        if (!outOk) early++;
        if (inOk && outOk) kept++;
      }
      const why = new Map<string, number>();
      for (const { reasons } of coverDays) for (const r of reasons) { const k = /on leave$/.test(r) ? 'staff leave' : /day$/.test(r) && /^(Satur|Sun)/.test(r) ? 'weekends' : 'festivals'; why.set(k, (why.get(k) || 0) + 1); }
      set('storeCover', pct(kept, coverDays.length), [
        `Covered the store ${fmt12(cStart)}-${fmt12(cEnd)} on ${kept} of ${plural(coverDays.length, 'cover day')} (${[...why.entries()].map(([k, n]) => `${k} ${n}`).join(', ')}).`,
        noCheckIn ? `${plural(noCheckIn, 'day')} without a store check-in.` : '',
        lateIn ? `Reached the store late on ${plural(lateIn, 'day')}.` : '',
        early ? `Left the store early on ${plural(early, 'day')}.` : '',
        away ? `${plural(away, 'store check-in')} made away from the store.` : '',
      ].filter(Boolean).join(' '));
    }
  }
  // Production: each day's stock request accepted (preparation started) by 9 AM on its day.
  if (ids.includes('requestAccepted')) {
    let n = 0, ok = 0, never = 0;
    for (const r of input.requests || []) {
      const d = String(r?.requestDate || '').slice(0, 10);
      if (!d || d < from || d > to || r.status === 'cancelled') continue;
      n++;
      if (!r.acceptedAt || Number.isNaN(Date.parse(r.acceptedAt))) { never++; continue; }
      if (Date.parse(r.acceptedAt) <= istMidnightMs(d) + ACCEPT_BY_MIN * 60000) ok++;
    }
    if (!n) set('requestAccepted', null, 'No stock requests in this period.');
    else set('requestAccepted', pct(ok, n), `${ok} of ${plural(n, 'stock request')} accepted and started by ${fmt12(ACCEPT_BY_MIN)} on the day they were for.${never ? ` ${plural(never, 'request')} never accepted.` : ''}`);
  }

  // The cashier: what the counter collected (cash + Paytm) against what the POS billed that day
  // (cashOverShortAmount: positive = short), on the person's working days.
  if (ids.includes('posCash')) {
    const byDay = new Map<string, any>();
    for (const s of input.sales || []) {
      const by = String(s?.createdBy || '');
      if (!s?.date || !by || by === 'pos-sync' || by === 'cash-topup-approval') continue;
      byDay.set(String(s.date).slice(0, 10), s);
    }
    const counted = scheduled.filter((d) => byDay.has(d));
    if (!counted.length) set('posCash', null, 'No days saved on your working days yet.');
    else {
      let ok = 0, worst = 0, short = 0;
      for (const d of counted) {
        const gap = Number(byDay.get(d).cashOverShortAmount) || 0;
        if (Math.abs(gap) <= CASH_TOLERANCE_INR) ok++;
        if (Math.abs(gap) > Math.abs(worst)) worst = gap;
        if (gap > 0) short += gap;
      }
      set('posCash', pct(ok, counted.length), `Cash and Paytm collected matched the POS bills within ${inr(CASH_TOLERANCE_INR)} on ${ok} of ${counted.length} days worked${Math.abs(worst) > CASH_TOLERANCE_INR ? `; biggest gap ${inr(Math.abs(worst))} ${worst > 0 ? 'short' : 'over'}` : ''}${short > CASH_TOLERANCE_INR ? `; ${inr(short)} short in all` : ''}.`);
    }
  }
  // The production house's cash: counted each evening against what the books expect.
  if (ids.includes('productionCash')) {
    const rows = (input.productionCash || []).filter((r) => {
      const d = String(r?.date || '').slice(0, 10);
      return d >= from && d <= to && typeof r.discrepancy === 'number';
    });
    if (!rows.length) set('productionCash', null, 'No production cash counts in this period.');
    else {
      let ok = 0, worst = 0;
      for (const r of rows) {
        if (Math.abs(r.discrepancy) <= CASH_TOLERANCE_INR) ok++;
        if (Math.abs(r.discrepancy) > Math.abs(worst)) worst = r.discrepancy;
      }
      set('productionCash', pct(ok, rows.length), `Production cash matched within ${inr(CASH_TOLERANCE_INR)} on ${ok} of ${plural(rows.length, 'day')}${Math.abs(worst) > CASH_TOLERANCE_INR ? `; biggest gap ${inr(Math.abs(worst))} ${worst < 0 ? 'short' : 'over'}` : ''}.`);
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
  if (ids.includes('expenseAccuracy')) {
    const start = from > EXPENSE_ACCURACY_FROM ? from : EXPENSE_ACCURACY_FROM;
    const wrong = new Map<string, string[]>(); // expense id -> its mistakes
    for (const f of input.expenseFlags || []) {
      // Marked correct by someone other than whoever entered it (an incharge can't clear their own).
      const cleared = f?.status === 'dismissed' && !!f.decidedBy && f.decidedBy !== f.loggedBy;
      if (!f?.expenseId || !EXPENSE_MISTAKES[f.kind] || cleared) continue;
      wrong.set(String(f.expenseId), [...(wrong.get(String(f.expenseId)) || []), String(f.kind)]);
    }
    let n = 0, ok = 0;
    const kinds: Record<string, number> = {};
    for (const e of input.expenses || []) {
      const d = String(e?.date || '').slice(0, 10);
      if (!d || d < start || d > to) continue;
      n++;
      const mistakes = wrong.get(String(e.id)) || [];
      if (!mistakes.length) ok++;
      for (const k of new Set(mistakes)) kinds[k] = (kinds[k] || 0) + 1;
    }
    const list = Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c} ${EXPENSE_MISTAKES[k]}`).join(', ');
    if (!n) set('expenseAccuracy', null, to < EXPENSE_ACCURACY_FROM ? 'Counted from 1 Nov 2026.' : 'No expenses entered in this period.');
    else set('expenseAccuracy', pct(ok, n), `${ok} of ${plural(n, 'expense entry', 'expense entries')} entered correctly.${list ? ` Flagged and not marked correct: ${list}.` : ''}`);
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

  // The incharge's place: every photo taken there this month, whoever took it.
  if (ids.includes('placeClean')) {
    let photos = 0, dirty = 0, severe = 0;
    for (const { date, item } of input.placePhotos || []) {
      if (!item || date < from || date > to) continue;
      photos++;
      if (item.wasSevere || item.aiSevere) severe++;
      else if (item.wasFlagged || item.flag?.status === 'needs_cleaning' || item.aiVerdict === 'needs_cleaning') dirty++;
    }
    if (!photos) set('placeClean', null, 'No photos taken here yet this month.');
    else set('placeClean', 100 - PLACE_FLAG_PENALTY * dirty - PLACE_SEVERE_PENALTY * severe, [
      `${plural(photos, 'photo')} taken here.`,
      severe ? `${plural(severe, 'photo')} showed a garbage dump or serious dirt (${PLACE_SEVERE_PENALTY} points off each).` : '',
      dirty ? `${plural(dirty, 'photo')} needed cleaning (${PLACE_FLAG_PENALTY} points off each).` : '',
      !severe && !dirty ? 'All clean.' : '',
    ].filter(Boolean).join(' '));
  }

  // Crates and containers (owner, 28 Oct 2026): each day the check was due at the place, full marks
  // for a clean photo, half for one that needed cleaning, nothing for no photo or filth.
  if (ids.includes('cratesClean')) {
    const seen = new Set<string>();
    let due = 0, clean = 0, dirty = 0, filthy = 0, missing = 0;
    for (const { date, itemId, item } of input.crateChecks || []) {
      if (date < from || date > to || seen.has(`${date}|${itemId}`)) continue;
      seen.add(`${date}|${itemId}`);
      due++;
      if (!item) missing++;
      else if (item.wasSevere || item.aiSevere) filthy++;
      else if (item.wasFlagged || item.flag?.status === 'needs_cleaning' || item.aiVerdict === 'needs_cleaning') dirty++;
      else clean++;
    }
    if (!due) set('cratesClean', null, 'No crates and containers photos were due in this period.');
    else set('cratesClean', pct(clean + dirty / 2, due), [
      `${clean} of ${plural(due, 'day')} clean.`,
      dirty ? `${plural(dirty, 'day')} needed cleaning (half marks).` : '',
      filthy ? `${plural(filthy, 'day')} showed filth or garbage (no marks).` : '',
      missing ? `${plural(missing, 'day')} with no photo.` : '',
    ].filter(Boolean).join(' '));
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
  const { total: base, coverage } = weightedTotal(kpis);
  if (base !== null && coverage < 0.5) notes.push('Less than half of the KPI weight has data yet, so the total may move a lot.');

  // Extra hours the incharge confirmed add points to the total; ones still waiting are mentioned.
  const decided = new Map((input.extraHours || []).filter((x) => x?.date).map((x) => [x.date, x]));
  let extraMin = 0, confirmedDays = 0, pendingDays = 0;
  for (const d of days) {
    const x = decided.get(d);
    if (x?.status === 'confirmed' && x.minutes > 0) { extraMin += x.minutes; confirmedDays++; continue; }
    if (!x && extraMinutesOf(punchBy.get(d), d, settings) >= EXTRA_MIN_OFFERED) pendingDays++;
  }
  const extraHours = Math.round((extraMin / 60) * 10) / 10;
  const points = Math.min(EXTRA_POINTS_MAX, Math.floor(extraMin / 60 / EXTRA_HOURS_PER_POINT));
  // Upheld customer complaints come off the total (owner's decision, complaints.ts).
  const complaintPts = (input.complaintPenalties || []).reduce((s, x) => s + (Number(x.points) || 0), 0);
  const complaintCount = (input.complaintPenalties || []).length;
  const total = base === null ? null : Math.max(0, Math.min(100, Math.round((base + points - complaintPts) * 10) / 10));
  if (complaintCount) notes.push(`Customer complaints: ${plural(complaintCount, 'upheld complaint')}, ${complaintPts} points off the total.`);
  if (confirmedDays) notes.push(`Extra hours: ${extraHours} h confirmed on ${plural(confirmedDays, 'day')}${points ? `, +${points} point${points === 1 ? '' : 's'} on the total` : ''} (1 point per ${EXTRA_HOURS_PER_POINT} h, at most +${EXTRA_POINTS_MAX}).`);
  if (pendingDays) notes.push(`${plural(pendingDays, 'day')} of extra hours waiting for the incharge to confirm.`);
  const extra = confirmedDays || pendingDays ? { points, hours: extraHours, days: confirmedDays, pendingDays } : null;
  const complaints = complaintCount ? { points: complaintPts, count: complaintCount } : null;
  return { month, from: days.length ? from : null, to: days.length ? to : null, scheduledDays: scheduled.length, kpis, total, extra, complaints, coverage, notes, flags };
}

// Minutes before the shift start and after its end on one day, from a check-in and a check-out.
export function extraMinutesOf(p: PunchRecord | null | undefined, date: string, settings: Pick<KpiSettings, 'shiftStart' | 'shiftEnd'>): number {
  if (!p?.in?.at || !p?.out?.at) return 0;
  const { start, end } = shiftMinutes(settings);
  const inMin = minutesOfDay(p.in.at, date);
  const outMin = minutesOfDay(p.out.at, date);
  if (!(outMin > inMin)) return 0;
  return Math.round(Math.max(0, start - inMin) + Math.max(0, outMin - end));
}

// A late start given as the reason for leftover stuffing, held against the check-ins (owner,
// 28 Oct 2026): someone named who checked in on time, was on leave or has no check-in; someone
// who checked in late but isn't named; work said to start long after people had checked in.
export type StaffDay = { id: string; name: string; shiftStart: string; inMin: number | null; lateMin: number; onLeave: boolean };
export function lateStartIssues(reason: { people?: { id: string }[]; startedAt?: string | null }, day: StaffDay[]): string[] {
  const hhmm12 = (min: number) => `${Math.floor(min / 60) % 12 || 12}:${String(min % 60).padStart(2, '0')} ${min >= 720 ? 'PM' : 'AM'}`;
  const named = new Set((reason.people || []).map((p) => String(p.id)));
  const issues: string[] = [];
  for (const s of day) {
    if (named.has(s.id)) {
      if (s.onLeave) issues.push(`${s.name} is named as late but was on leave that day.`);
      else if (s.inMin === null) issues.push(`${s.name} is named as late but has no check-in that day, so it can't be checked.`);
      else if (!s.lateMin) issues.push(`${s.name} is named as late but checked in at ${hhmm12(s.inMin)}, on time for ${hhmm12(parseHHMM(s.shiftStart) as number)}.`);
    } else if (!s.onLeave && s.lateMin > 0 && s.inMin !== null) {
      issues.push(`${s.name} checked in at ${hhmm12(s.inMin)} (${s.lateMin} min late) but isn't named.`);
    }
  }
  const started = parseHHMM(reason.startedAt);
  if (started !== null) {
    const early = day.filter((s) => !s.onLeave && s.inMin !== null && (s.inMin as number) <= started - 30);
    if (early.length) {
      const first = Math.min(...early.map((s) => s.inMin as number));
      issues.push(`Work is said to have started at ${hhmm12(started)}, but ${early.map((s) => s.name).join(', ')} had checked in by ${hhmm12(first)}.`);
    }
  }
  if (!named.size && !day.some((s) => s.lateMin > 0)) issues.push('A late start is given, but nobody is named and no check-in was late.');
  return issues;
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
