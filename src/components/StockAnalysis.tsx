import { useEffect, useMemo, useState } from 'react';
import { Package, Droplet, AlertTriangle, Clock, BarChart3, UserX, Users, Trash2, PackageX } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ProductionRequest, Employee, Timesheet } from '../utils/api';
import * as api from '../utils/api';
import { wasteReasonLabel } from '../utils/batches';
import { STOCK_OUT_REASONS, istClock, istDate, stockOutDuration, stockOutMinutes, stockOutReasonLabel, type StockOutEntry } from '../utils/stockOuts';

interface StockAnalysisProps {
  requests: ProductionRequest[];
  finishedProducts: { camelKey: string; label: string; legacySalesKey: string }[];
  // Loosely typed to match SalesData's actual shape - the per-item "data" map (keyed by
  // display name, e.g. "Chicken Momos") isn't part of SalesData's formal TS type, the same
  // way ProductionRequests.tsx's own sold-quantity lookup accesses it.
  salesData: { date: string; storeId?: string; data?: Record<string, number> }[];
  // Stores whose daily momo wastage (logged by the store incharge) is summarised below.
  storeIds?: string[];
  accessToken?: string;
}

type Period = 'today' | 'yesterday' | '7d' | '30d' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  custom: 'Custom',
  all: 'All time',
};

// Calendar-date (YYYY-MM-DD) arithmetic in IST, so a late-night check doesn't land on the
// wrong day - same approach as the Analytics page's own date filters. Weeks run Mon-Sun.
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
};
// Days since Monday (Mon = 0 ... Sun = 6), so "This week" matches the Analytics page's week.
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

// Inclusive [start, end] for a period, or null when it's unbounded ("All time", or a custom
// range that isn't filled in yet).
function resolvePeriodRange(period: Period, custom: { from: string; to: string }): { start: string; end: string } | null {
  const today = todayIST();
  switch (period) {
    case 'today': return { start: today, end: today };
    case 'yesterday': return { start: shiftDate(today, -1), end: shiftDate(today, -1) };
    case '7d': return { start: shiftDate(today, -7), end: today };
    case '30d': return { start: shiftDate(today, -30), end: today };
    case 'thisWeek': return { start: shiftDate(today, -weekdayOf(today)), end: today };
    case 'lastWeek': {
      const thisWeekStart = shiftDate(today, -weekdayOf(today));
      return { start: shiftDate(thisWeekStart, -7), end: shiftDate(thisWeekStart, -1) };
    }
    case 'thisMonth': return { start: `${today.substring(0, 7)}-01`, end: today };
    case 'lastMonth': {
      const end = shiftDate(`${today.substring(0, 7)}-01`, -1);
      return { start: `${end.substring(0, 7)}-01`, end };
    }
    case 'custom':
      return custom.from && custom.to && custom.from <= custom.to ? { start: custom.from, end: custom.to } : null;
    default: return null;
  }
}

// A request counts as "not delivered" for this item only once it's actually reached the
// store - pending/accepted/shipped requests haven't failed to deliver, they just haven't
// gotten there yet. Only delivered/partially-delivered rows tell us what really arrived.
const isDeliveredStatus = (status: string) => status === 'delivered' || status === 'partially-delivered';

// Requests closed in bulk long after the fact (57 Feb-Sep 2026 shipments, closed 25 Oct 2026)
// carry the shipped time as their delivered time - they count as delivered for stock, but have
// no real delivery time, so the SLA timings leave them out.
const deliveryTime = (r: ProductionRequest) => ((r as any).deliveryClosedInBulk ? undefined : r.deliveredAt);

// Whole IST calendar days between a date (YYYY-MM-DD or a UTC timestamp) and today. Both
// sides are IST dates: the old UTC "today" was a day behind between midnight and 5:30 AM.
function daysAgo(dateStr: string): number {
  const then = dateStr.length > 10 ? istDate(dateStr) : dateStr.substring(0, 10);
  return Math.round((Date.parse(`${todayIST()}T00:00:00Z`) - Date.parse(`${then}T00:00:00Z`)) / (1000 * 60 * 60 * 24));
}

// Time-of-day as a decimal hour (14.5 = 2:30 PM), for plotting against a fixed 10am-10pm
// axis rather than elapsed duration - the question this chart answers is "what time of
// day does each stage typically happen", not "how long does it take".
function timeOfDayHours(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

function formatHourShort(h: number): string {
  const hour = Math.floor(((h % 24) + 24) % 24);
  const period = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}${period}`;
}

function formatHourPrecise(h: number): string {
  const clamped = ((h % 24) + 24) % 24;
  const hour = Math.floor(clamped);
  const minutes = Math.round((clamped - hour) * 60);
  const period = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

const PIPELINE_AXIS_MIN = 10; // 10 AM
const PIPELINE_AXIS_MAX = 22; // 10 PM
const PIPELINE_AXIS_TICKS = [10, 12, 14, 16, 18, 20, 22];

function efficiencyTone(pct: number | null): string {
  if (pct === null) return 'text-text-3';
  if (pct >= 90) return 'text-success';
  if (pct >= 70) return 'text-warning';
  return 'text-danger';
}

// Operational SLA thresholds this business runs on - surfaced as their own card rather
// than buried in the per-day charts, since "did we hit the cutoff" is a different question
// from "what time did things average out to".
const ACCEPT_BY_HOUR = 10; // requests should be accepted by 10 AM
const SHIP_BY_HOUR = 15; // requests should be shipped by 3 PM
const DELIVER_WITHIN_HOURS = 3; // delivery should follow shipping within 3 hours

function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60);
}

// Mirrors TIMESHEET_AUTO_APPROVE_DAYS in the backend (index.ts) - a pending timesheet
// this old gets auto-approved by the nightly cron, so the compliance list below can tell
// the manager "this will auto-approve today" instead of just "it's old".
const TIMESHEET_AUTO_APPROVE_DAYS = 5;
export function StockAnalysis({ requests, finishedProducts, salesData, storeIds = [], accessToken = '' }: StockAnalysisProps) {
  const [period, setPeriod] = useState<Period>('30d');
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => {
    const today = todayIST();
    return { from: shiftDate(today, -7), to: today };
  });
  const periodRange = useMemo(() => resolvePeriodRange(period, customRange), [period, customRange]);
  // ---- Store wastage (pieces per momo type, logged daily by the store incharge). Fetched for
  // the selected period; wastage only exists from the feature's launch (2026-08-30). ----
  const [wastageEntries, setWastageEntries] = useState<api.StockWastageEntry[]>([]);
  const [wastageLoading, setWastageLoading] = useState(false);
  const storeIdsKey = storeIds.join(',');
  useEffect(() => {
    if (!accessToken || storeIds.length === 0) { setWastageEntries([]); return; }
    let cancelled = false;
    const from = periodRange?.start || '2026-08-30';
    const to = periodRange?.end || todayIST();
    setWastageLoading(true);
    Promise.all(storeIds.map((id) => api.getStockWastageRange(accessToken, id, from, to).catch(() => [] as api.StockWastageEntry[])))
      .then((lists) => { if (!cancelled) setWastageEntries(lists.flat()); })
      .finally(() => { if (!cancelled) setWastageLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, storeIdsKey, periodRange]);

  // ---- Out-of-stock log (store SOP ST-28), for the same period and stores. ----
  const [stockOuts, setStockOuts] = useState<StockOutEntry[]>([]);
  useEffect(() => {
    if (!accessToken || storeIds.length === 0) { setStockOuts([]); return; }
    let cancelled = false;
    const from = periodRange?.start || '2026-10-25';
    const to = periodRange?.end || todayIST();
    Promise.all(storeIds.map((id) => api.getStockOuts(accessToken, id, from, to).catch(() => [] as StockOutEntry[])))
      .then((lists) => { if (!cancelled) setStockOuts(lists.flat()); });
    return () => { cancelled = true; };
  }, [accessToken, storeIdsKey, periodRange]);

  const stockOutSummary = useMemo(() => {
    const byItem = new Map<string, { item: string; times: number; minutes: number }>();
    const byReason = new Map<string, number>();
    let minutes = 0;
    for (const e of stockOuts) {
      const m = stockOutMinutes(e.startAt, e.endAt);
      minutes += m;
      const row = byItem.get(e.item) || { item: e.item, times: 0, minutes: 0 };
      row.times += 1;
      row.minutes += m;
      byItem.set(e.item, row);
      byReason.set(e.reason, (byReason.get(e.reason) || 0) + 1);
    }
    return {
      items: [...byItem.values()].sort((a, b) => b.minutes - a.minutes),
      reasons: STOCK_OUT_REASONS.filter((r) => byReason.has(r.id)).map((r) => ({ ...r, times: byReason.get(r.id)! })).sort((a, b) => b.times - a.times),
      open: stockOuts.filter((e) => !e.endAt),
      latest: [...stockOuts].sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 8),
      minutes,
    };
  }, [stockOuts]);

  const wastageSummary = useMemo(() => {
    const labelByKey = new Map(finishedProducts.map((p) => [p.camelKey, p.label]));
    const byType = new Map<string, number>();
    let total = 0;
    for (const e of wastageEntries) {
      for (const [key, pieces] of Object.entries(e.wastage || {})) {
        byType.set(key, (byType.get(key) || 0) + (pieces || 0));
        total += pieces || 0;
      }
    }
    const rows = [...byType.entries()]
      .map(([key, pieces]) => ({ key, label: labelByKey.get(key) || key, pieces }))
      .sort((a, b) => b.pieces - a.pieces);
    const days = [...wastageEntries]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((e) => ({ date: e.date, pieces: Object.values(e.wastage || {}).reduce((x, y) => x + (y || 0), 0), by: e.submittedByName || '', notes: e.notes || '' }));
    const lastLogged = days.length > 0 ? days[0].date : null;
    // Pieces per SOP reason code across the period; totals saved before reason codes (or by
    // an older app) show as "No reason recorded".
    const byReason = new Map<string, number>();
    for (const e of wastageEntries) {
      for (const [key, pieces] of Object.entries(e.wastage || {})) {
        let coded = 0;
        for (const [code, n] of Object.entries(e.reasons?.[key] || {})) {
          byReason.set(code, (byReason.get(code) || 0) + n);
          coded += n;
        }
        if ((pieces || 0) > coded) byReason.set('', (byReason.get('') || 0) + (pieces || 0) - coded);
      }
    }
    const reasonRows = [...byReason.entries()]
      .map(([code, pieces]) => ({ code, label: wasteReasonLabel(code || undefined), pieces }))
      .sort((a, b) => b.pieces - a.pieces);
    return { rows, total, days, lastLogged, maxPieces: rows[0]?.pieces || 0, reasonRows };
  }, [wastageEntries, finishedProducts]);

  const periodLabel = period === 'custom' && periodRange ? `${periodRange.start} to ${periodRange.end}` : PERIOD_LABELS[period];
  const [staleDays, setStaleDays] = useState(3);

  // ---- Staff Attendance Compliance: who hasn't submitted a timesheet recently, and how
  // long a submitted-but-pending one has been waiting on manager approval. Fetched
  // separately from the stock-request props above since it's an org-wide, unrelated
  // dataset - self-contained so this section works regardless of what page embeds
  // StockAnalysis. ----
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [leaves, setLeaves] = useState<api.LeaveApplication[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [attendanceReloadKey, setAttendanceReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAttendanceLoading(true);
    setAttendanceError(null);
    (async () => {
      try {
        const [emp, ts, lv] = await Promise.all([
          api.getEmployees(),
          api.getAllTimesheets(),
          api.getAllLeaves().catch(() => [] as api.LeaveApplication[]),
        ]);
        if (!cancelled) {
          setEmployees(emp);
          setTimesheets(ts);
          setLeaves(lv);
        }
      } catch (error) {
        console.log('StockAnalysis: failed to load attendance data:', error);
        if (!cancelled) setAttendanceError(error instanceof Error ? error.message : 'Could not load attendance data');
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [attendanceReloadKey]);

  // Only employees and managers actually fill their own timesheet (cluster heads only
  // approve, per AttendancePortal's role-based default tab) - and only once they've
  // actually joined, and while still active.
  const expectedSubmitters = useMemo(
    // Riders don't fill attendance, so they aren't expected to submit timesheets.
    () => employees.filter((e) => e.status !== 'inactive' && e.designation !== 'rider' && (e.role === 'employee' || e.role === 'manager')),
    [employees]
  );

  // Per-employee attendance for the page's selected period (day / week / month / custom /
  // all time): how many working days they filled a timesheet, how many they did not, and how
  // many were approved leave. Today is never counted as missing - timesheets are filled in
  // the evening - unless "Today" itself is the selected period. Nobody is expected to have
  // filled anything before they joined.
  const attendanceReport = useMemo(() => {
    const today = todayIST();
    const earliestTimesheet = timesheets.reduce((min, t) => (t.date && t.date < min ? t.date : min), today);
    const rangeStart = periodRange?.start || earliestTimesheet;
    const rangeEnd = periodRange?.end || today;
    const lastDue = rangeStart >= today ? today : (rangeEnd >= today ? shiftDate(today, -1) : rangeEnd);
    const windowDates: string[] = [];
    for (let d = rangeStart; d <= lastDue; d = shiftDate(d, 1)) windowDates.push(d);

    const sheetByKey = new Map(timesheets.map((t) => [`${t.employeeId}:${t.date}`, t]));
    const leaveKeys = new Set(
      leaves.filter((l) => l.status === 'approved').map((l) => `${l.employeeId}:${(l.leaveDate || '').substring(0, 10)}`)
    );

    const rows = expectedSubmitters.map((emp) => {
      let filled = 0, onLeave = 0, approved = 0, pending = 0, rejected = 0, expected = 0;
      const missingDates: string[] = [];
      for (const date of windowDates) {
        if (emp.joiningDate && date < emp.joiningDate) continue;
        expected++;
        const sheet = sheetByKey.get(`${emp.employeeId}:${date}`);
        if (sheet && sheet.isLeave) {
          onLeave++;
        } else if (sheet) {
          filled++;
          if (sheet.status === 'approved') approved++; else if (sheet.status === 'rejected') rejected++; else pending++;
        } else if (leaveKeys.has(`${emp.employeeId}:${date}`)) {
          onLeave++;
        } else {
          missingDates.push(date);
        }
      }
      return { employeeId: emp.employeeId, name: emp.name, expected, filled, onLeave, missing: missingDates.length, missingDates, approved, pending, rejected };
    });

    rows.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));
    const totalExpected = rows.reduce((n, r) => n + r.expected - r.onLeave, 0);
    const totalFilled = rows.reduce((n, r) => n + r.filled, 0);
    return { rows, days: windowDates.length, totalExpected, totalFilled };
  }, [expectedSubmitters, timesheets, leaves, periodRange]);

  const pendingAttendanceApprovals = useMemo(() => {
    const nameById = new Map(employees.map((e) => [e.employeeId, e.name]));
    return timesheets
      .filter((t) => t.status === 'pending')
      .map((t) => {
        const referenceDate = t.submittedAt || t.date;
        const daysPending = daysAgo(referenceDate);
        return {
          employeeId: t.employeeId,
          name: nameById.get(t.employeeId) || t.employeeId,
          date: t.date,
          daysPending,
          willAutoApproveToday: daysPending >= TIMESHEET_AUTO_APPROVE_DAYS,
        };
      })
      .sort((a, b) => b.daysPending - a.daysPending);
  }, [timesheets, employees]);

  const periodRequests = useMemo(() => {
    if (!periodRange) return requests;
    return requests.filter((r) => {
      const d = (r.requestDate || r.createdAt || '').substring(0, 10);
      return d >= periodRange.start && d <= periodRange.end;
    });
  }, [requests, periodRange]);

  // Same cutoff logic as periodRequests, applied to the store's daily sales records instead
  // - this is what backs the new "Sold" column, so what counts as "this period" matches
  // between the two tables.
  const periodSalesData = useMemo(() => {
    if (!periodRange) return salesData;
    return salesData.filter((s) => {
      const d = (s.date || '').substring(0, 10);
      return d >= periodRange.start && d <= periodRange.end;
    });
  }, [salesData, periodRange]);

  // ---- Section A: momo items requested vs actually delivered vs actually sold ----
  const itemStats = useMemo(() => {
    return finishedProducts.map(({ camelKey, label, legacySalesKey }) => {
      let requested = 0;
      let delivered = 0;
      let requestCount = 0;
      periodRequests.forEach((r) => {
        const req = (r as any)[camelKey] || 0;
        if (req > 0) requestCount++;
        requested += req;
        if (isDeliveredStatus(r.status)) {
          const shipped = r.shippedQuantities?.[camelKey];
          delivered += shipped !== undefined ? shipped : req;
        }
      });
      let sold = 0;
      periodSalesData.forEach((s) => {
        let salesValue = s.data?.[legacySalesKey] || 0;
        // Backward compatibility: some older records used "Corn Cheese Momos" instead of
        // "Cheese Corn Momos" - same fallback ProductionRequests.tsx applies.
        if (legacySalesKey === 'Cheese Corn Momos' && salesValue === 0) {
          salesValue = s.data?.['Corn Cheese Momos'] || 0;
        }
        sold += salesValue;
      });
      return { label, requested, delivered, sold, requestCount, pct: requested > 0 ? Math.round((delivered / requested) * 100) : null };
    }).filter((row) => row.requested > 0 || row.delivered > 0 || row.sold > 0);
  }, [periodRequests, periodSalesData, finishedProducts]);

  // ---- Section B: sauces requested vs delivered, by count of requests (not quantity -
  // sauces are logged as a yes/no per request, not a number) ----
  const sauceStats = useMemo(() => {
    const names = new Set<string>();
    periodRequests.forEach((r) => Object.keys(r.sauces || {}).forEach((n) => names.add(n)));
    return Array.from(names).map((name) => {
      const requestedCount = periodRequests.filter((r) => r.sauces?.[name]).length;
      const deliveredCount = periodRequests.filter((r) => r.sauces?.[name] && isDeliveredStatus(r.status) && r.shippedSauces?.[name]).length;
      return { name, requestedCount, deliveredCount, pct: requestedCount > 0 ? Math.round((deliveredCount / requestedCount) * 100) : null };
    }).sort((a, b) => b.requestedCount - a.requestedCount);
  }, [periodRequests]);

  // ---- Section C: items sitting unfulfilled for several days - uses the FULL history,
  // not just the selected period, since "how long has it actually been" needs to look
  // further back than a 7/30-day window can see. ----
  const staleItems = useMemo(() => {
    const sorted = [...requests].sort((a, b) => (a.requestDate || a.createdAt || '').localeCompare(b.requestDate || b.createdAt || ''));
    const rows: { label: string; kind: 'momo' | 'sauce'; lastRequested: string | null; lastDelivered: string | null; daysSince: number | null; requestsSinceDelivery: number }[] = [];

    const evaluate = (label: string, kind: 'momo' | 'sauce', wasRequested: (r: ProductionRequest) => boolean, wasDelivered: (r: ProductionRequest) => boolean) => {
      let lastRequested: string | null = null;
      let lastDelivered: string | null = null;
      let requestsSinceDelivery = 0;
      for (const r of sorted) {
        const date = r.requestDate || r.createdAt;
        if (!date) continue;
        if (wasRequested(r)) {
          lastRequested = date;
          if (isDeliveredStatus(r.status) && wasDelivered(r)) {
            lastDelivered = date;
            requestsSinceDelivery = 0;
          } else {
            requestsSinceDelivery++;
          }
        }
      }
      if (!lastRequested) return; // never requested at all - nothing to flag
      const daysSince = lastDelivered ? daysAgo(lastDelivered) : null;
      if ((daysSince === null || daysSince >= staleDays) && requestsSinceDelivery > 0) {
        rows.push({ label, kind, lastRequested, lastDelivered, daysSince, requestsSinceDelivery });
      }
    };

    finishedProducts.forEach(({ camelKey, label }) => {
      evaluate(
        label, 'momo',
        (r) => ((r as any)[camelKey] || 0) > 0,
        (r) => (r.shippedQuantities?.[camelKey] ?? (r as any)[camelKey] ?? 0) > 0
      );
    });
    const allSauceNames = new Set<string>();
    requests.forEach((r) => Object.keys(r.sauces || {}).forEach((n) => allSauceNames.add(n)));
    allSauceNames.forEach((name) => {
      evaluate(name, 'sauce', (r) => !!r.sauces?.[name], (r) => !!r.shippedSauces?.[name]);
    });

    return rows.sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));
  }, [requests, finishedProducts, staleDays]);

  // A request "sat" after shipping if it wasn't marked delivered the same calendar day it
  // was shipped - this is the case the delivered-stage chart needs to surface, not just
  // the average clock time.
  const isDelayedDelivery = (r: ProductionRequest) =>
    !!r.shippedAt && !!deliveryTime(r) && r.shippedAt.substring(0, 10) !== deliveryTime(r)!.substring(0, 10);

  // ---- Section D: what time of day each pipeline stage typically happens, per day -
  // plotted against a fixed 10am-10pm axis rather than elapsed duration. Grouped by the
  // request's creation date, same bucket for all three stages, so the three charts stay
  // aligned on the same x-axis, which is the request's own creation date. That grouping
  // means an "Accepted"/"Shipped" point can be the average of times that didn't actually
  // happen on that calendar day at all - a request placed late on 31 Jul but accepted at
  // 1:55 AM the next morning still gets bucketed under 31 Jul (it's still that same
  // request), so its plotted "time" alone doesn't tell you it slipped to a new day. Each
  // bucket therefore also counts how many of its requests had that stage land on a later
  // calendar date, and the chart flags those points and says so in the tooltip - the
  // "Requested" chart is the one series here guaranteed to always match its own bucket day.
  const timingChartData = useMemo(() => {
    const byDay: Record<string, {
      placed: number[]; accept: number[]; ship: number[]; deliver: number[];
      delayedCount: number; acceptedNextDayCount: number; shippedNextDayCount: number;
    }> = {};
    periodRequests.forEach((r) => {
      const created = r.createdAt;
      if (!created) return;
      const day = created.substring(0, 10);
      if (!byDay[day]) byDay[day] = { placed: [], accept: [], ship: [], deliver: [], delayedCount: 0, acceptedNextDayCount: 0, shippedNextDayCount: 0 };
      byDay[day].placed.push(timeOfDayHours(created));
      if (r.acceptedAt) {
        byDay[day].accept.push(timeOfDayHours(r.acceptedAt));
        if (r.acceptedAt.substring(0, 10) !== day) byDay[day].acceptedNextDayCount++;
      }
      if (r.shippedAt) {
        byDay[day].ship.push(timeOfDayHours(r.shippedAt));
        if (r.shippedAt.substring(0, 10) !== day) byDay[day].shippedNextDayCount++;
      }
      if (deliveryTime(r)) {
        byDay[day].deliver.push(timeOfDayHours(deliveryTime(r)!));
        if (isDelayedDelivery(r)) byDay[day].delayedCount++;
      }
    });
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
    return Object.keys(byDay).sort().map((day) => ({
      day: new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      'Requested': avg(byDay[day].placed),
      'Accepted': avg(byDay[day].accept),
      'Shipped': avg(byDay[day].ship),
      'Delivered': avg(byDay[day].deliver),
      delayedCount: byDay[day].delayedCount,
      acceptedNextDayCount: byDay[day].acceptedNextDayCount,
      shippedNextDayCount: byDay[day].shippedNextDayCount,
    }));
  }, [periodRequests]);

  // The underlying facts behind any flagged point above - listed explicitly so "delivered
  // late" isn't just a colored dot, it's a specific request with dates attached.
  const delayedDeliveries = useMemo(() => {
    return periodRequests
      .filter(isDelayedDelivery)
      .map((r) => {
        const shippedDate = r.shippedAt!.substring(0, 10);
        const deliveredDate = deliveryTime(r)!.substring(0, 10);
        const daysLate = Math.round((new Date(deliveredDate).getTime() - new Date(shippedDate).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: r.id,
          requestDate: r.requestDate || r.createdAt?.substring(0, 10) || shippedDate,
          requestedAt: r.createdAt || r.requestDate || shippedDate,
          acceptedAt: r.acceptedAt || null,
          shippedAt: r.shippedAt!,
          deliveredAt: deliveryTime(r)!,
          daysLate,
        };
      })
      .sort((a, b) => b.daysLate - a.daysLate);
  }, [periodRequests]);

  // ---- SLA scorecard: three fixed operational thresholds, each checked against every
  // request in the period that actually has the relevant timestamp. ----
  const slaStats = useMemo(() => {
    const accepted = periodRequests.filter((r) => !!r.acceptedAt);
    const shipped = periodRequests.filter((r) => !!r.shippedAt);
    const deliveredWithShip = periodRequests.filter((r) => !!r.shippedAt && !!deliveryTime(r));

    const acceptedOnTime = accepted.filter((r) => timeOfDayHours(r.acceptedAt!) <= ACCEPT_BY_HOUR);
    const shippedOnTime = shipped.filter((r) => timeOfDayHours(r.shippedAt!) <= SHIP_BY_HOUR);
    const deliveredOnTime = deliveredWithShip.filter((r) => hoursBetween(r.shippedAt!, deliveryTime(r)!) <= DELIVER_WITHIN_HOURS);

    return {
      accepted: { met: acceptedOnTime.length, total: accepted.length },
      shipped: { met: shippedOnTime.length, total: shipped.length },
      delivered: { met: deliveredOnTime.length, total: deliveredWithShip.length },
    };
  }, [periodRequests]);

  // Total, across the whole period (not just per-day-bucket), of requests whose
  // acceptance/shipping landed on a calendar day after the request was placed - feeds the
  // "Key Observations" list below.
  const nextDayCounts = useMemo(() => {
    let acceptedNextDay = 0;
    let shippedNextDay = 0;
    periodRequests.forEach((r) => {
      const day = r.createdAt?.substring(0, 10);
      if (!day) return;
      if (r.acceptedAt && r.acceptedAt.substring(0, 10) !== day) acceptedNextDay++;
      if (r.shippedAt && r.shippedAt.substring(0, 10) !== day) shippedNextDay++;
    });
    return { acceptedNextDay, shippedNextDay };
  }, [periodRequests]);

  // ---- Per-chart efficiency: "how good was this stage", one number per Pipeline Time of
  // Day chart. Requested has no target to miss, so it gets a plain count instead of a
  // percentage; the other three are "did it land on the same calendar day it should have" -
  // a different question from the SLA cutoffs above (which ask "was it on time", not
  // "was it even the right day"). ----
  const chartEfficiency = useMemo(() => {
    const acceptedTotal = periodRequests.filter((r) => !!r.acceptedAt).length;
    const shippedTotal = periodRequests.filter((r) => !!r.shippedAt).length;
    const deliveredTotal = periodRequests.filter((r) => !!r.shippedAt && !!deliveryTime(r)).length;
    return {
      requestedCount: periodRequests.length,
      acceptedSameDayPct: acceptedTotal > 0 ? Math.round(((acceptedTotal - nextDayCounts.acceptedNextDay) / acceptedTotal) * 100) : null,
      shippedSameDayPct: shippedTotal > 0 ? Math.round(((shippedTotal - nextDayCounts.shippedNextDay) / shippedTotal) * 100) : null,
      deliveredSameDayPct: deliveredTotal > 0 ? Math.round(((deliveredTotal - delayedDeliveries.length) / deliveredTotal) * 100) : null,
    };
  }, [periodRequests, nextDayCounts, delayedDeliveries]);

  // ---- Request fulfillment completeness: per request (once it's actually reached a
  // terminal delivered state), what fraction of the TOTAL quantity across every item it
  // asked for actually arrived. Buckets it into fully fulfilled (100%), substantially
  // fulfilled (90-99%), and below 90% - with the underlying requests listed for the first
  // two so "when was it fully/90% fulfilled" has real dates attached, not just a count. ----
  const fulfillmentCompleteness = useMemo(() => {
    const rows = periodRequests
      .filter((r) => isDeliveredStatus(r.status))
      .map((r) => {
        let totalRequested = 0;
        let totalDelivered = 0;
        finishedProducts.forEach(({ camelKey }) => {
          const req = (r as any)[camelKey] || 0;
          totalRequested += req;
          const shipped = r.shippedQuantities?.[camelKey];
          totalDelivered += shipped !== undefined ? shipped : req;
        });
        const pct = totalRequested > 0 ? (totalDelivered / totalRequested) * 100 : null;
        return {
          id: r.id,
          requestDate: r.requestDate || r.createdAt?.substring(0, 10) || '',
          requestedAt: r.createdAt || r.requestDate || '',
          totalRequested,
          totalDelivered,
          pct,
        };
      })
      .filter((r) => r.pct !== null) as { id: string; requestDate: string; requestedAt: string; totalRequested: number; totalDelivered: number; pct: number }[];

    const full = rows.filter((r) => r.pct >= 99.5).sort((a, b) => b.requestDate.localeCompare(a.requestDate));
    const ninetyPlus = rows.filter((r) => r.pct >= 90 && r.pct < 99.5).sort((a, b) => b.requestDate.localeCompare(a.requestDate));
    const belowNinety = rows.filter((r) => r.pct < 90);

    return { total: rows.length, full, ninetyPlus, belowNinety };
  }, [periodRequests, finishedProducts]);

  // ---- Key observations: a few auto-generated, concrete callouts pulled from the other
  // sections above, so the headline issues don't require reading every table to find. ----
  const observations = useMemo(() => {
    const notes: string[] = [];

    if (nextDayCounts.acceptedNextDay > 0) {
      notes.push(`${nextDayCounts.acceptedNextDay} request${nextDayCounts.acceptedNextDay === 1 ? '' : 's'} weren't accepted until the day after they were placed.`);
    }
    if (nextDayCounts.shippedNextDay > 0) {
      notes.push(`${nextDayCounts.shippedNextDay} request${nextDayCounts.shippedNextDay === 1 ? '' : 's'} weren't shipped until the day after they were placed.`);
    }
    if (slaStats.shipped.total > 0 && slaStats.shipped.met < slaStats.shipped.total) {
      notes.push(`${slaStats.shipped.total - slaStats.shipped.met} of ${slaStats.shipped.total} requests shipped after the ${formatHourShort(SHIP_BY_HOUR)} cutoff.`);
    }
    if (slaStats.accepted.total > 0 && slaStats.accepted.met < slaStats.accepted.total) {
      notes.push(`${slaStats.accepted.total - slaStats.accepted.met} of ${slaStats.accepted.total} requests weren't accepted until after ${formatHourShort(ACCEPT_BY_HOUR)}.`);
    }
    if (slaStats.delivered.total > 0 && slaStats.delivered.met < slaStats.delivered.total) {
      notes.push(`${slaStats.delivered.total - slaStats.delivered.met} of ${slaStats.delivered.total} deliveries took longer than ${DELIVER_WITHIN_HOURS} hours after shipping.`);
    }
    if (delayedDeliveries.length > 0) {
      const worst = delayedDeliveries[0];
      notes.push(`Worst case: a request shipped ${new Date(worst.shippedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} wasn't delivered until ${worst.daysLate} day${worst.daysLate === 1 ? '' : 's'} later.`);
    }
    const worstItem = itemStats.filter((i) => i.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number))[0];
    if (worstItem && (worstItem.pct as number) < 80) {
      notes.push(`${worstItem.label} has the lowest fulfillment rate at ${worstItem.pct}% (${worstItem.delivered}/${worstItem.requested}).`);
    }
    const worstSauce = sauceStats.filter((s) => s.pct !== null).sort((a, b) => (a.pct as number) - (b.pct as number))[0];
    if (worstSauce && (worstSauce.pct as number) < 80) {
      notes.push(`${worstSauce.name.replace(/_/g, ' ')} sauce has the lowest fulfillment rate at ${worstSauce.pct}% (${worstSauce.deliveredCount}/${worstSauce.requestedCount}).`);
    }
    if (staleItems.length > 0) {
      notes.push(`${staleItems.length} item${staleItems.length === 1 ? '' : 's'} flagged as not delivered recently despite active requests.`);
    }
    if (fulfillmentCompleteness.total > 0) {
      notes.push(`Of ${fulfillmentCompleteness.total} delivered requests: ${fulfillmentCompleteness.full.length} were 100% fulfilled, ${fulfillmentCompleteness.ninetyPlus.length} were 90-99% fulfilled, ${fulfillmentCompleteness.belowNinety.length} were below 90%.`);
    }
    if (notes.length === 0) {
      notes.push('No SLA breaches or fulfillment gaps found in this period.');
    }
    return notes;
  }, [nextDayCounts, slaStats, delayedDeliveries, itemStats, sauceStats, staleItems, fulfillmentCompleteness]);

  const renderTimingDot = (color: string) => (props: any) => {
    const { cx, cy, payload, dataKey } = props;
    const value = payload[dataKey];
    // recharts' dot renderer must always return an element (never null) - an invisible
    // zero-radius circle stands in for "nothing to plot here".
    if (value === null || value === undefined) return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={0} fill="none" />;
    const flagged =
      (dataKey === 'Accepted' && payload.acceptedNextDayCount > 0) ||
      (dataKey === 'Shipped' && payload.shippedNextDayCount > 0) ||
      (dataKey === 'Delivered' && payload.delayedCount > 0);
    if (flagged) {
      return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={6} fill="var(--chart-1)" stroke="var(--chart-grid)" strokeWidth={1.5} />;
    }
    return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={3} fill={color} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-lg p-6 bg-surface border border-border">
        <div className="absolute inset-0 bg-surface-2" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 bg-surface-2 rounded-lg flex items-center justify-center border-2 border-border flex-shrink-0">
            <BarChart3 className="w-7 h-7 text-text-2" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl text-text-2 font-bold tracking-tight">Store-Production SLA Analysis</h1>
            <p className="text-sm sm:text-base text-text-2 mt-1">Request fulfillment and pipeline timing</p>
          </div>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              period === p ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-text-2 hover:bg-surface-3'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              aria-label="From date"
              value={customRange.from}
              max={customRange.to || undefined}
              onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
              className="min-h-11 px-3 py-2 border border-border-strong rounded-md text-body-sm bg-surface text-text"
            />
            <span className="text-sm text-text-3">to</span>
            <input
              type="date"
              aria-label="To date"
              value={customRange.to}
              min={customRange.from || undefined}
              onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
              className="min-h-11 px-3 py-2 border border-border-strong rounded-md text-body-sm bg-surface text-text"
            />
          </div>
        )}
      </div>

      {/* SLA Scorecard + Key Observations - the three fixed operational cutoffs this
          business runs on, checked against every request that actually has the relevant
          timestamp, plus a handful of auto-generated callouts pulled from the sections
          below so the headline issues surface without reading every table. */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <AlertTriangle className="w-4 h-4 text-info" />
          <h3 className="text-sm font-semibold text-text">SLA Scorecard &amp; Key Observations</h3>
          <span className="text-xs text-text-3 ml-auto">{periodLabel}</span>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { label: `Accepted by ${formatHourShort(ACCEPT_BY_HOUR)}`, stat: slaStats.accepted, sub: 'Requested → Accepted' },
              { label: `Shipped by ${formatHourShort(SHIP_BY_HOUR)}`, stat: slaStats.shipped, sub: 'Cutoff for dispatch' },
              { label: `Delivered within ${DELIVER_WITHIN_HOURS}h of shipping`, stat: slaStats.delivered, sub: 'Shipped → Delivered' },
            ] as const).map(({ label, stat, sub }) => {
              const pct = stat.total > 0 ? Math.round((stat.met / stat.total) * 100) : null;
              const tone = pct === null ? 'text-text-3' : pct >= 90 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-danger';
              const barTone = pct === null ? 'bg-surface-3' : pct >= 90 ? 'bg-success' : pct >= 70 ? 'bg-warning' : 'bg-danger';
              return (
                <div key={label} className="border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-text-2">{label}</p>
                  <p className="text-caption text-text-3 mb-2">{sub}</p>
                  <div className="flex items-end justify-between">
                    <span className={`text-2xl font-bold tabular-nums ${tone}`}>{pct === null ? '-' : `${pct}%`}</span>
                    <span className="text-xs text-text-3 tabular-nums">{stat.met}/{stat.total} met</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-text-2 mb-2">Key Observations</p>
            <ul className="space-y-1.5">
              {observations.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-2">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${note.startsWith('No SLA breaches') ? 'bg-success' : 'bg-warning'}`} />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Request fulfillment completeness - per delivered request, what fraction of
              everything it asked for actually arrived, bucketed into fully fulfilled
              (100%) and substantially fulfilled (90-99%), each with the specific requests
              listed so "when" has real dates attached. */}
          {fulfillmentCompleteness.total > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-text-2 mb-2">Request Fulfillment Completeness</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="border border-success-border bg-success-soft rounded-lg p-3">
                  <p className="text-xs font-semibold text-success">100% Fulfilled</p>
                  <p className="text-2xl font-bold text-success tabular-nums mt-1">{fulfillmentCompleteness.full.length}</p>
                  <p className="text-caption text-success">of {fulfillmentCompleteness.total} delivered requests</p>
                </div>
                <div className="border border-warning-border bg-warning-soft rounded-lg p-3">
                  <p className="text-xs font-semibold text-warning">90-99% Fulfilled</p>
                  <p className="text-2xl font-bold text-warning tabular-nums mt-1">{fulfillmentCompleteness.ninetyPlus.length}</p>
                  <p className="text-caption text-warning">of {fulfillmentCompleteness.total} delivered requests</p>
                </div>
                <div className="border border-danger-border bg-danger-soft rounded-lg p-3">
                  <p className="text-xs font-semibold text-danger">Below 90%</p>
                  <p className="text-2xl font-bold text-danger tabular-nums mt-1">{fulfillmentCompleteness.belowNinety.length}</p>
                  <p className="text-caption text-danger">of {fulfillmentCompleteness.total} delivered requests</p>
                </div>
              </div>

              {(fulfillmentCompleteness.full.length > 0 || fulfillmentCompleteness.ninetyPlus.length > 0) && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface-2">
                        <tr className="text-left text-text-3 uppercase tracking-wide">
                          <th className="px-3 py-1.5">Request Date</th>
                          <th className="px-3 py-1.5 text-right">Requested (all items)</th>
                          <th className="px-3 py-1.5 text-right">Delivered (all items)</th>
                          <th className="px-3 py-1.5 text-right">Fulfillment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...fulfillmentCompleteness.full, ...fulfillmentCompleteness.ninetyPlus]
                          .sort((a, b) => b.requestDate.localeCompare(a.requestDate))
                          .map((row) => (
                            <tr key={row.id} className="border-t border-border">
                              <td className="px-3 py-1.5 text-text-2">{row.requestedAt ? new Date(row.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : row.requestDate}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-text-2">{row.totalRequested.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-text-2">{row.totalDelivered.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                                <span className={row.pct >= 99.5 ? 'text-success' : 'text-warning'}>{Math.round(row.pct)}%</span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Staff Attendance Compliance - who hasn't submitted a timesheet in the last week,
          and how long any pending one has been waiting on manager approval (auto-approves
          after 5 days - see TIMESHEET_AUTO_APPROVE_DAYS). Org-wide, not scoped to this
          page's store/period filters above, since attendance isn't a stock concept. */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <Users className="w-4 h-4 text-info" />
          <h3 className="text-sm font-semibold text-text">Staff Attendance Compliance</h3>
          <span className="text-xs text-text-3 ml-auto">{periodLabel}{attendanceReport.days > 0 ? ` - ${attendanceReport.days} day${attendanceReport.days === 1 ? '' : 's'}` : ''}</span>
        </div>
        {attendanceLoading ? (
          <div className="p-6 text-center text-sm text-text-3">Loading attendance data...</div>
        ) : attendanceError ? (
          <div className="p-6 text-center text-sm text-danger">
            Could not load attendance: {attendanceError}.{' '}
            <button type="button" onClick={() => setAttendanceReloadKey((k) => k + 1)} className="underline">Try again</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-text-2 mb-2 flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5 text-danger" /> Timesheets filled vs missing
              </p>
              {attendanceReport.days === 0 || attendanceReport.rows.length === 0 ? (
                <div className="text-sm text-text-3">No working days to check in this period yet.</div>
              ) : (
                <>
                  <p className="text-xs text-text-3 mb-2">
                    {attendanceReport.totalFilled} of {attendanceReport.totalExpected} expected timesheets filled
                    {attendanceReport.totalExpected > 0 ? ` (${Math.round((attendanceReport.totalFilled / attendanceReport.totalExpected) * 100)}%)` : ''}.
                    Approved leave days are not counted as missing, and today is not counted until the day is over.
                    {' '}Based on {timesheets.length} timesheets loaded.{' '}
                    <button type="button" onClick={() => setAttendanceReloadKey((k) => k + 1)} className="text-info underline">Reload</button>
                  </p>
                  <div className="border border-border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-text-3 bg-surface-2 border-b border-border">
                          <th className="px-3 py-2">Employee</th>
                          <th className="px-3 py-2 text-right">Filled</th>
                          <th className="px-3 py-2 text-right">Missing</th>
                          <th className="px-3 py-2 text-right">Leave</th>
                          <th className="px-3 py-2">Approval</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceReport.rows.map((row) => (
                          <tr key={row.employeeId} className="border-b border-border align-top">
                            <td className="px-3 py-2">
                              <p className="font-medium text-text">{row.name} <span className="text-text-3 font-normal">({row.employeeId})</span></p>
                              {row.missing > 0 && (
                                <details className="mt-0.5">
                                  <summary className="text-xs text-danger cursor-pointer">Show missing dates</summary>
                                  <p className="text-xs text-text-3 mt-1">{row.missingDates.slice().reverse().join(', ')}</p>
                                </details>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className="font-semibold text-success">{row.filled}</span>
                              <span className="text-text-3"> / {row.expected - row.onLeave}</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.missing > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{row.missing}</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-2">{row.onLeave}</td>
                            <td className="px-3 py-2 text-xs text-text-2 whitespace-nowrap">
                              {row.approved} approved{row.pending > 0 ? ` · ${row.pending} pending` : ''}{row.rejected > 0 ? ` · ${row.rejected} rejected` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-text-2 mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-warning" /> Pending Manager Approval
              </p>
              {pendingAttendanceApprovals.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-success">
                  <span>No timesheets awaiting approval.</span>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {pendingAttendanceApprovals.map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text">{row.name} <span className="text-text-3 font-normal">({row.employeeId})</span></p>
                        <p className="text-xs text-text-3 mt-0.5">Timesheet for {row.date}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 ${
                        row.willAutoApproveToday ? 'bg-warning-soft text-warning' : row.daysPending >= 3 ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-text-2'
                      }`}>
                        {row.willAutoApproveToday ? `Auto-approves today (${row.daysPending}d)` : `${row.daysPending}d pending`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-caption text-text-3 mt-2">
                A timesheet still pending after {TIMESHEET_AUTO_APPROVE_DAYS} days is automatically approved so attendance records don't get stuck on a forgotten approval.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Store wastage - what the store incharge logs under Stock Requests > Log Wastage. */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <Trash2 className="w-4 h-4 text-danger" />
          <h3 className="text-sm font-semibold text-text">Store Wastage</h3>
          <span className="text-xs text-text-3 ml-auto">{periodLabel}</span>
        </div>
        {wastageLoading ? (
          <div className="p-6 text-center text-sm text-text-3">Loading wastage...</div>
        ) : wastageSummary.days.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-3">
            No wastage logged in this period. The store incharge logs it from Stock Requests &rarr; Log Wastage (tracked from 30 Aug 2026).
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-danger-soft p-3">
                <p className="text-xs text-text-2">Pieces wasted</p>
                <p className="text-xl font-bold text-danger tabular-nums">{wastageSummary.total.toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-text-2">Days logged</p>
                <p className="text-xl font-bold text-text tabular-nums">{wastageSummary.days.length}</p>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-xs text-text-2">Last logged</p>
                <p className="text-xl font-bold text-text tabular-nums">{wastageSummary.lastLogged ? new Date(`${wastageSummary.lastLogged}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}</p>
              </div>
            </div>
            <div className="space-y-2">
              {wastageSummary.rows.map((r) => (
                <div key={r.key} className="flex items-center gap-3">
                  <span className="w-32 text-sm text-text-2 truncate">{r.label}</span>
                  <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full bg-danger rounded-full" style={{ width: `${wastageSummary.maxPieces > 0 ? (r.pieces / wastageSummary.maxPieces) * 100 : 0}%` }} />
                  </div>
                  <span className="w-16 text-right text-sm font-semibold tabular-nums">{r.pieces}</span>
                </div>
              ))}
            </div>
            {wastageSummary.reasonRows.some((r) => r.code) && (
              <div>
                <p className="text-xs font-semibold text-text-2 mb-2">By reason</p>
                <div className="flex flex-wrap gap-2">
                  {wastageSummary.reasonRows.map((r) => (
                    <span key={r.code || 'none'} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${r.code ? 'bg-surface border-border text-text' : 'bg-surface-2 border-border text-text-3'}`}>
                      {r.code && <span className="font-mono font-semibold">{r.code}</span>}
                      {r.label}
                      <span className="font-semibold tabular-nums">{r.pieces}</span>
                    </span>
                  ))}
                </div>
                <p className="text-caption text-text-3 mt-1">Q = short or damaged at delivery (from the store's count). S = staff meals, counted here because they leave stock too.</p>
              </div>
            )}
            <div className="max-h-48 overflow-y-auto divide-y divide-border border border-border rounded-lg">
              {wastageSummary.days.map((d) => (
                <div key={d.date} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-text-2">{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="text-text-3 truncate flex-1 text-xs">{d.notes || d.by}</span>
                  <span className="font-semibold tabular-nums">{d.pieces} pcs</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Out of stock - logged by whoever bills at the store (Out of Stock page, SOP ST-28). */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <PackageX className="w-4 h-4 text-danger" />
          <h3 className="text-sm font-semibold text-text">Out of Stock</h3>
          <span className="text-xs text-text-3 ml-auto">{periodLabel}</span>
        </div>
        {stockOuts.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-3">
            No stock-outs logged in this period. The store logs them from the Out of Stock page.
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-danger-soft border border-danger-border rounded-lg p-3">
                <p className="text-xs text-danger">Times out</p>
                <p className="text-xl font-bold text-danger tabular-nums">{stockOuts.length}</p>
              </div>
              <div className="bg-surface-2 border border-border rounded-lg p-3">
                <p className="text-xs text-text-3">Time out in total</p>
                <p className="text-xl font-bold text-text tabular-nums">{stockOutDuration(new Date(0).toISOString(), new Date(stockOutSummary.minutes * 60000).toISOString())}</p>
              </div>
              <div className="bg-surface-2 border border-border rounded-lg p-3">
                <p className="text-xs text-text-3">Out right now</p>
                <p className={`text-xl font-bold tabular-nums ${stockOutSummary.open.length ? 'text-danger' : 'text-text'}`}>{stockOutSummary.open.length}</p>
              </div>
            </div>
            {stockOutSummary.open.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stockOutSummary.open.map((e) => (
                  <span key={e.id} className="text-xs px-2.5 py-1 rounded-full bg-danger text-on-danger">{e.item} · since {istClock(e.startAt)} ({stockOutDuration(e.startAt)})</span>
                ))}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-text-2 mb-2">By item</p>
              <div className="space-y-1">
                {stockOutSummary.items.map((r) => (
                  <div key={r.item} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-text">{r.item}</span>
                    <span className="text-text-2 tabular-nums">{r.times}× · {stockOutDuration(new Date(0).toISOString(), new Date(r.minutes * 60000).toISOString())}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-2 mb-2">By reason</p>
              <div className="flex flex-wrap gap-1.5">
                {stockOutSummary.reasons.map((r) => (
                  <span key={r.id} className="text-xs px-2.5 py-1 rounded-full bg-surface-2 text-text-2">{r.label} · {r.times}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-2 mb-2">Latest</p>
              <ul className="divide-y divide-border border border-border rounded-lg">
                {stockOutSummary.latest.map((e) => (
                  <li key={e.id} className="px-3 py-2 text-xs text-text-2">
                    <span className="font-semibold text-text">{e.item}</span> · {new Date(`${istDate(e.startAt)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {istClock(e.startAt)} - {e.endAt ? istClock(e.endAt) : 'still out'} · {stockOutDuration(e.startAt, e.endAt)} · {stockOutReasonLabel(e.reason)}{e.reasonNote ? ` (${e.reasonNote})` : ''} · {e.createdByName}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Section A: Items requested vs delivered */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <Package className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-text">Items Requested vs Delivered</h3>
          <span className="text-xs text-text-3 ml-auto">{periodLabel}</span>
        </div>
        {itemStats.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-3">No requests in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-3 uppercase tracking-wide">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Requested</th>
                  <th className="px-4 py-2 text-right">Delivered</th>
                  <th className="px-4 py-2 text-right">Sold</th>
                  <th className="px-4 py-2 text-right">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {itemStats.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="px-4 py-2.5 text-text">{row.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{row.requested.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{row.delivered.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{row.sold.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {row.pct === null ? '-' : (
                        <span className={row.pct >= 90 ? 'text-success' : row.pct >= 60 ? 'text-warning' : 'text-danger'}>{row.pct}%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section B: Sauces requested vs delivered */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <Droplet className="w-4 h-4 text-danger" />
          <h3 className="text-sm font-semibold text-text">Sauces - Requested vs Delivered</h3>
          <span className="text-xs text-text-3 ml-auto">by number of requests, {periodLabel}</span>
        </div>
        {sauceStats.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-3">No sauces requested in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-3 uppercase tracking-wide">
                  <th className="px-4 py-2">Sauce</th>
                  <th className="px-4 py-2 text-right">Times Requested</th>
                  <th className="px-4 py-2 text-right">Times Delivered</th>
                  <th className="px-4 py-2 text-right">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {sauceStats.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="px-4 py-2.5 text-text capitalize">{row.name.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{row.requestedCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-2">{row.deliveredCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {row.pct === null ? '-' : (
                        <span className={row.pct >= 90 ? 'text-success' : row.pct >= 60 ? 'text-warning' : 'text-danger'}>{row.pct}%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section C: Items not delivered for several days */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-danger-soft border-b border-danger-border">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <h3 className="text-sm font-semibold text-danger">Not Delivered Recently</h3>
          <div className="flex items-center gap-1.5 ml-auto text-xs text-danger">
            <span>Flag after</span>
            <input
              type="number"
              min={1}
              value={staleDays}
              onChange={(e) => setStaleDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="min-h-11 w-14 px-1.5 py-0.5 border border-border-strong rounded-md bg-surface text-center"
            />
            <span>days</span>
          </div>
        </div>
        {staleItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-3">Nothing flagged - every requested item has been delivered recently.</div>
        ) : (
          <div className="divide-y divide-border">
            {staleItems.map((row) => (
              <div key={`${row.kind}-${row.label}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text capitalize">{row.label.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-text-3 mt-0.5">
                    {row.lastDelivered
                      ? `Last delivered ${row.lastDelivered} (${row.daysSince} day${row.daysSince === 1 ? '' : 's'} ago)`
                      : 'Never delivered'}
                    {' - '}{row.requestsSinceDelivery} request{row.requestsSinceDelivery === 1 ? '' : 's'} since
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-danger-soft text-danger text-xs font-semibold whitespace-nowrap flex-shrink-0">
                  {row.daysSince === null ? 'Never' : `${row.daysSince}d`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section D: Pipeline timing - one chart per stage, so each stage's own daily
          rhythm reads clearly instead of three overlapping lines. */}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-2 border-b border-border">
          <Clock className="w-4 h-4 text-info" />
          <h3 className="text-sm font-semibold text-text">Pipeline Time of Day, by Stage</h3>
        </div>
        <div className="p-4">
          {timingChartData.length === 0 ? (
            <div className="text-center text-sm text-text-3 py-8">No timestamped requests in this period.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {([
                { key: 'Requested', color: 'var(--chart-4)', nextDayField: null, efficiency: `${chartEfficiency.requestedCount} placed`, efficiencyTone: 'text-text-3' },
                { key: 'Accepted', color: 'var(--chart-3)', nextDayField: 'acceptedNextDayCount', efficiency: chartEfficiency.acceptedSameDayPct === null ? null : `${chartEfficiency.acceptedSameDayPct}% same-day`, efficiencyTone: efficiencyTone(chartEfficiency.acceptedSameDayPct) },
                { key: 'Shipped', color: 'var(--chart-4)', nextDayField: 'shippedNextDayCount', efficiency: chartEfficiency.shippedSameDayPct === null ? null : `${chartEfficiency.shippedSameDayPct}% same-day`, efficiencyTone: efficiencyTone(chartEfficiency.shippedSameDayPct) },
                { key: 'Delivered', color: 'var(--chart-2)', nextDayField: 'delayedCount', efficiency: chartEfficiency.deliveredSameDayPct === null ? null : `${chartEfficiency.deliveredSameDayPct}% same-day as shipped`, efficiencyTone: efficiencyTone(chartEfficiency.deliveredSameDayPct) },
              ] as const).map(({ key, color, nextDayField, efficiency, efficiencyTone: tone }) => (
                <div key={key}>
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-semibold text-text-2">{key}</p>
                    {efficiency && <p className={`text-caption font-semibold tabular-nums ${tone}`}>{efficiency}</p>}
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timingChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis
                        domain={[PIPELINE_AXIS_MIN, PIPELINE_AXIS_MAX]}
                        ticks={PIPELINE_AXIS_TICKS}
                        tickFormatter={formatHourShort}
                        tick={{ fontSize: 12 }}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatHourPrecise(value), key]}
                        labelFormatter={(label: string, payload: any[]) => {
                          const flagCount = nextDayField ? (payload?.[0]?.payload?.[nextDayField] || 0) : 0;
                          if (flagCount === 0) return label;
                          const verb = key === 'Delivered' ? 'delivered' : key === 'Shipped' ? 'shipped' : 'accepted';
                          return `${label} - ${flagCount} ${verb} on a LATER calendar day (not ${label})`;
                        }}
                      />
                      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={renderTimingDot(color)} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-text-3 mt-3">
            "Requested" is when the request was placed - the other three are grouped under that
            same placement day, so a point's clock time doesn't by itself confirm the stage
            happened that same day. {(delayedDeliveries.length > 0 || nextDayCounts.acceptedNextDay > 0 || nextDayCounts.shippedNextDay > 0) && (
              <>Where <span className="inline-block w-2.5 h-2.5 rounded-full bg-danger align-middle mx-1" /> appears on Accepted/Shipped/Delivered, at least one request in that day's group actually happened on a later calendar date - hover the point for how many.</>
            )}
          </p>

          {delayedDeliveries.length > 0 && (
            <div className="mt-4 border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-danger-soft border-b border-danger-border">
                <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                <p className="text-xs font-semibold text-danger">Delivered later than shipped ({delayedDeliveries.length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-text-3 uppercase tracking-wide">
                      <th className="px-3 py-1.5">Request Date</th>
                      <th className="px-3 py-1.5">Accepted</th>
                      <th className="px-3 py-1.5">Shipped</th>
                      <th className="px-3 py-1.5">Delivered</th>
                      <th className="px-3 py-1.5 text-right">Days Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delayedDeliveries.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-1.5 text-text-2">{new Date(row.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-text-2">{row.acceptedAt ? new Date(row.acceptedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                        <td className="px-3 py-1.5 text-text-2">{new Date(row.shippedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-text-2">{new Date(row.deliveredAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-danger">{row.daysLate}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
