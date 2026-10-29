// Calls for the shift clock and KPI screens (server attendance.ts / kpi.ts). Kept in this folder
// instead of utils/api.ts so this feature doesn't touch a file many people edit at once.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE } from '../../utils/api';
import { getSupabaseClient } from '../../utils/supabase/client';
import { regionHeaders } from '../../utils/http';

async function token(refresh = false): Promise<string> {
  const supabase = getSupabaseClient();
  const { data } = refresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Not signed in');
  return data.session.access_token;
}

// Android throttles ordinary WebView requests while the app is in the background, which is when
// the phone notices someone arriving - so there the native HTTP client is used (as for riders).
async function send(method: string, path: string, body?: any, retried = false): Promise<any> {
  const t = await token(retried);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...regionHeaders() };
  let status: number;
  let data: any;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({ url: `${API_BASE}${path}`, method, headers, data: body });
    status = res.status;
    data = typeof res.data === 'string' ? safeJson(res.data) : res.data;
  } else {
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    status = res.status;
    data = await res.json().catch(() => ({}));
  }
  if (status === 401 && !retried) return send(method, path, body, true);
  if (status < 200 || status >= 300) throw Object.assign(new Error(data?.error || `Request failed (${status})`), { status, details: data });
  return data;
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };

// ---- Types (mirror kpiCore.ts) ----

export type KpiId = 'attendance' | 'punctuality' | 'fullShift' | 'timesheet' | 'workplace' | 'hygiene'
  | 'cashCount' | 'cashAccuracy' | 'stockOuts' | 'productionLogged' | 'wastage' | 'shippedOnTime' | 'trips'
  | 'salesOnTime' | 'expensesOnTime' | 'productionApproved' | 'requestOnTime' | 'placeClean' | 'posCash' | 'productionCash'
  | 'storeCover' | 'requestAccepted' | 'cratesClean' | 'photoChecks' | 'storeReadiness' | 'expenseAccuracy'
  | 'productionSupply' | 'shoppingListOnTime';

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
  productionSupply: 'Production supply: full and on time',
  shoppingListOnTime: 'Shopping list sent by 7 AM',
};

// The KPIs the owner picks from for each person, grouped as in KPI settings (riders have none).
export const KPI_SECTIONS: { title: string; ids: KpiId[] }[] = [
  { title: 'Everyone', ids: ['attendance', 'punctuality', 'fullShift', 'timesheet'] },
  { title: 'Photo checks', ids: ['photoChecks', 'workplace', 'hygiene', 'placeClean', 'cratesClean'] },
  { title: 'Store', ids: ['salesOnTime', 'expensesOnTime', 'expenseAccuracy', 'requestOnTime', 'stockOuts', 'cashCount', 'cashAccuracy', 'posCash', 'storeCover'] },
  { title: 'Production', ids: ['requestAccepted', 'productionApproved', 'productionLogged', 'wastage', 'shippedOnTime', 'productionSupply', 'shoppingListOnTime', 'productionCash'] },
];
export const ADDED_KPI_WEIGHT = 10;

export type PunchEvent = {
  at: string; source: 'manual' | 'geofence' | 'manager'; verified: boolean;
  distanceM?: number; outside?: boolean; noGps?: boolean; exempt?: boolean;
  detectedAt?: string; confirmedAt?: string; confirmedBy?: string; flags?: string[];
};
export type PunchSuggestion = { detectedAt: string; distanceM?: number; simulated?: boolean; placeKind?: string };
export type PunchRecord = {
  employeeId: string; date: string; in?: PunchEvent | null; out?: PunchEvent | null; outsideWorkplace: boolean;
  pending?: { arrival?: PunchSuggestion | null; exit?: PunchSuggestion | null }; flags?: string[]; hours?: number | null;
};
export type ShiftToday = {
  required: boolean;
  employeeId: string;
  date: string;
  serverNow: string;
  exempt: boolean;
  workplace: 'store' | 'production' | 'mixed' | 'none';
  punch: PunchRecord | null;
  settings: { shiftStart: string; shiftEnd: string; graceMin: number; weeklyOff: number[] };
  workingDay: boolean;
  window: { startAt: string; endAt: string; shiftStartAt: string; shiftEndAt: string };
  pins: { kind: 'store' | 'production'; id: string; name: string | null; lat: number; lng: number }[];
  radiusM: number;
  consent: { accepted: boolean; at: string } | null;
};
export type DetectedEvent = { kind: 'arrival' | 'exit'; detectedAt: number; lat: number; lng: number; accuracyM?: number; simulated?: boolean };

export type KpiResult = { id: KpiId; label: string; score: number | null; weight: number; explanation: string; tip: string };
export type MonthKpis = {
  month: string; from: string | null; to: string | null; scheduledDays: number; kpis: KpiResult[];
  total: number | null; coverage: number; notes: string[]; flags: Record<string, number>;
  // Confirmed extra hours and the points they added to the total (at most 5).
  extra?: { points: number; hours: number; days: number; pendingDays: number } | null;
  complaints?: { points: number; count: number } | null; // upheld customer complaints, off the total
};
export type KpiSettings = {
  employeeId: string; shiftStart: string; shiftEnd: string; weeklyOff: number[]; graceMin: number;
  hasVariablePay: boolean; variablePayMax: number; weights: Partial<Record<KpiId, number>>;
  kpis?: KpiId[]; // the person's KPIs (picked per person; nothing saved = their role's list)
  breakMin?: number; // unpaid break inside the shift (production: 60)
  isDefault?: boolean; updatedBy?: string; updatedAt?: string;
};
export type KpiReview = {
  suggestedAmount: number; aiAskedFor: number | null; keptWithinLimits: boolean; allowedRange: [number, number];
  adjustmentReason: string; oneLineSummary: string; strengths: string[]; concerns: string[]; whatToImproveNextMonth: string[];
  formulaAmount: number; total: number; max: number; monthComplete: boolean; model: string; generatedAt: string;
};
export type VariablePayApproval = {
  month: string; employeeId: string; formula: { amount: number; total: number | null; max: number };
  ai: { suggestedAmount: number; oneLineSummary: string } | null; approved: number; approvedBy: string; approvedAt: string;
};
export type TeamPerson = {
  employeeId: string; name: string; roleLabel: string; group: string; workplace: string; pinMissing: boolean;
  settings: KpiSettings; kpis: MonthKpis; formula: { amount: number; explanation: string } | null;
  review: KpiReview | null; approval: VariablePayApproval | null;
};
export type TeamKpisResponse = {
  month: string; today: string; monthComplete: boolean;
  config: { radiusM: number; showMoneyToStaff: boolean; punchSince: string | null };
  canEditMoney: boolean; canApprove: boolean; people: TeamPerson[];
};
export type MyKpisResponse = {
  required: boolean; month: string; today: string; roleLabel: string; workplace: string;
  settings: { shiftStart: string; shiftEnd: string; graceMin: number; weeklyOff: number[] };
  kpis: MonthKpis; money: { max: number; estimate: number; approved: number | null } | null; reviewed: boolean; lastMonth: string;
};
export type TeamPending = { employeeId: string; name: string; date: string; arrival: { detectedAt: string; distanceM: number | null; simulated: boolean } | null; exit: { detectedAt: string; distanceM: number | null; simulated: boolean } | null };

// ---- Shift clock ----

export const getShiftToday = (): Promise<ShiftToday> => send('GET', '/shift/today');
export const punch = (action: 'in' | 'out', gps: { lat?: number; lng?: number; accuracyM?: number; gpsError?: boolean }): Promise<{ punch: PunchRecord }> =>
  send('POST', '/shift/punch', { action, ...gps, deviceNow: Date.now() });
export const sendDetected = (e: DetectedEvent): Promise<{ punch?: PunchRecord; ignored?: boolean }> =>
  send('POST', '/shift/suggestion', { ...e, deviceNow: Date.now() });
export const confirmDetected = (kind: 'arrival' | 'exit', opts: { employeeId?: string; date?: string; event?: DetectedEvent } = {}): Promise<{ punch: PunchRecord }> =>
  send('POST', '/shift/confirm', { kind, ...opts, event: opts.event ? { ...opts.event, deviceNow: Date.now() } : undefined });
export const dismissDetected = (kind: 'arrival' | 'exit', opts: { employeeId?: string; date?: string } = {}): Promise<{ punch: PunchRecord | null }> =>
  send('POST', '/shift/dismiss', { kind, ...opts });
export const saveShiftConsent = (accepted: boolean) => send('POST', '/shift/consent', { accepted });
export const getTeamPending = (): Promise<{ pending: TeamPending[] }> => send('GET', '/shift/team-pending');

// Store cover (storeCover.ts): today's cover for the signed-in person, their store check-in, and
// for the store incharge / owner who is covering today.
export type CoverPunchEvent = { at: string; noGps?: boolean; outside?: boolean; distanceM?: number };
export type CoverToday = {
  setUp: boolean; date?: string; cover?: boolean; reasons: string[]; storeId?: string; storeName?: string;
  start: string; end: string; productionEnd: string; punch: { in: CoverPunchEvent | null; out: CoverPunchEvent | null } | null;
};
export type CoverTeamEntry = CoverToday & { employeeId: string; name: string };
export const getCoverToday = (): Promise<CoverToday> => send('GET', '/shift/cover-today');
export const coverPunch = (action: 'in' | 'out', pos: { lat: number; lng: number; accuracyM: number } | null): Promise<{ punch: NonNullable<CoverToday['punch']> }> =>
  send('POST', '/shift/cover-punch', { action, ...(pos || { gpsError: true }) });
export const getCoverTeam = (): Promise<{ covers: CoverTeamEntry[] }> => send('GET', '/shift/cover-team');

// Extra hours waiting for the caller's word (their own team; the owner and operations managers anyone).
export type ExtraHoursDay = { employeeId: string; name: string; date: string; inAt: string; outAt: string; shiftStart: string; shiftEnd: string; minutes: number };
export const getExtraHours = (): Promise<{ days: ExtraHoursDay[] }> => send('GET', '/kpi/extra-hours');
export const decideExtraHours = (body: { employeeId: string; date: string; decision: 'confirm' | 'decline'; reason?: string; minutes?: number }) =>
  send('POST', '/kpi/extra-hours', body);

// ---- KPIs ----

export const getTeamKpis = (month: string): Promise<TeamKpisResponse> => send('GET', `/kpi/team?month=${encodeURIComponent(month)}`);
export const getMyKpis = (month: string): Promise<MyKpisResponse> => send('GET', `/kpi/me?month=${encodeURIComponent(month)}`);
export const saveKpiSettings = (employeeId: string, settings: Partial<KpiSettings>): Promise<{ settings: KpiSettings }> =>
  send('PUT', `/kpi/settings/${encodeURIComponent(employeeId)}`, settings);
export const saveKpiConfig = (config: { radiusM?: number; showMoneyToStaff?: boolean }) => send('PUT', '/kpi/config', config);
export const askKpiReview = (month: string, employeeId: string, refresh = false): Promise<{ review: KpiReview; cached: boolean }> =>
  send('POST', '/kpi/review', { month, employeeId, refresh });
export const approveVariablePay = (month: string, employeeId: string, amount: number): Promise<{ approval: VariablePayApproval }> =>
  send('POST', '/kpi/approve', { month, employeeId, amount });
export const withdrawVariablePay = (month: string, employeeId: string) => send('POST', '/kpi/approve', { month, employeeId, withdraw: true });
// Payroll: the variable pay approved in Team KPIs for one person and month (null if none yet).
export const getApprovedVariablePay = (month: string, employeeId: string): Promise<{ approved: number | null; approvedAt: string | null; max?: number }> =>
  send('GET', `/kpi/variable-pay?month=${encodeURIComponent(month)}&employeeId=${encodeURIComponent(employeeId)}`);

// ---- Small display helpers ----

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function clock12(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 330 * 60000);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function hhmm12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const istMonth = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
export const prevMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
export const FLAG_TEXT: Record<string, string> = {
  late_confirm: 'confirmed 3+ hours after arriving/leaving',
  clock_skew: "phone clock didn't match",
  mock_location: 'fake (mock) location',
  outside: 'away from the workplace',
  no_gps: 'no GPS',
};
export const scoreTone = (s: number | null) => (s === null ? 'bg-gray-200' : s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-amber-500' : 'bg-red-500');
export const scoreText = (s: number | null) => (s === null ? 'text-gray-400' : s >= 80 ? 'text-emerald-700' : s >= 60 ? 'text-amber-700' : 'text-red-700');
