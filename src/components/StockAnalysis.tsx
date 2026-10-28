// Insights > Production > Store–production SLA: the scorecard against the three operational
// cutoffs, fulfilment, staff attendance, store wastage, stock-outs, requested vs delivered and the
// pipeline timing. Lists on phones (tables only from 1024 px); the period is one chip.
import { useEffect, useMemo, useState } from 'react';
import { Package, Droplet, AlertTriangle, Clock, Users, Trash2, PackageX, CheckCircle2, RotateCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Card } from './ui/card';
import { CHART_COLORS, CHART_SERIES, ChartTooltipCard, ShareBars, chartAxisProps, chartCursor, chartGridProps } from './ui/chart-theme';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Field, controlClasses } from './ui/field';
import { ListGroup, ListRow } from './ui/list-row';
import { SkeletonListRows } from './ui/skeleton';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { cn } from './ui/utils';
import { HowItWorks, OptionChip, SectionHeading } from './insights/parts/common';
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
  const [showAllComplete, setShowAllComplete] = useState(false);
  const [showAllWasteDays, setShowAllWasteDays] = useState(false);
  const [openEmployee, setOpenEmployee] = useState<string | null>(null);
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
      return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={6} fill="var(--danger)" stroke="var(--surface)" strokeWidth={1.5} />;
    }
    return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={3} fill={color} />;
  };

  const dateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const pctChip = (pct: number | null) => pct === null
    ? <StatusChip tone="neutral">-</StatusChip>
    : <StatusChip tone={pct >= 90 ? 'success' : pct >= 60 ? 'warning' : 'danger'}><span className="num">{pct}%</span></StatusChip>;
  const completedRequests = [...fulfillmentCompleteness.full, ...fulfillmentCompleteness.ninetyPlus].sort((a, b) => b.requestDate.localeCompare(a.requestDate));
  const SHOW = 8;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: the period, then the scorecard */}
      <SectionHeading title="Store–production SLA" caption="Request fulfilment and pipeline timing" />
      <div className="flex flex-col gap-3">
        <OptionChip
          title="Period"
          value={period}
          onChange={setPeriod}
          options={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          className="self-start"
        />
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Field label="From">
              <input type="date" value={customRange.from} max={customRange.to || undefined} onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))} className={controlClasses} />
            </Field>
            <Field label="To">
              <input type="date" value={customRange.to} min={customRange.from || undefined} onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))} className={controlClasses} />
            </Field>
          </div>
        )}
      </div>

      {/* SLA scorecard: the three fixed operational cutoffs, against every request that has the timestamp */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-score-title">
        <SectionHeading as="h3" id="sla-score-title" title="SLA scorecard" caption={periodLabel} />
        <StatGrid columns={3}>
          {([
            { label: `Accepted by ${formatHourShort(ACCEPT_BY_HOUR)}`, stat: slaStats.accepted, sub: 'Requested → accepted' },
            { label: `Shipped by ${formatHourShort(SHIP_BY_HOUR)}`, stat: slaStats.shipped, sub: 'Cutoff for dispatch' },
            { label: `Delivered within ${DELIVER_WITHIN_HOURS}h of shipping`, stat: slaStats.delivered, sub: 'Shipped → delivered' },
          ] as const).map(({ label, stat, sub }, i) => {
            const pct = stat.total > 0 ? Math.round((stat.met / stat.total) * 100) : null;
            return (
              <StatTile
                key={label}
                className={i === 2 ? 'col-span-2 lg:col-span-1' : undefined}
                label={label}
                value={pct === null ? '-' : `${pct}%`}
                tone={pct !== null && pct < 70 ? 'danger' : 'default'}
                chip={pct === null ? undefined : <StatusChip tone={pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'danger'}>{stat.met}/{stat.total} met</StatusChip>}
                caption={sub}
              />
            );
          })}
        </StatGrid>
        <ListGroup title="What stands out">
          {observations.map((note, i) => (
            <ListRow
              key={i}
              density="compact"
              icon={note.startsWith('No SLA breaches') ? CheckCircle2 : AlertTriangle}
              iconTone={note.startsWith('No SLA breaches') ? 'success' : 'warning'}
              title={<span className="text-body-sm font-normal">{note}</span>}
            />
          ))}
        </ListGroup>
      </section>

      {/* Request fulfilment completeness: per delivered request, how much of what it asked for arrived */}
      {fulfillmentCompleteness.total > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="sla-complete-title">
          <SectionHeading as="h3" id="sla-complete-title" title="Requests fulfilled in full" caption={`${fulfillmentCompleteness.total} delivered requests`} />
          <StatGrid columns={3}>
            <StatTile label="100% fulfilled" value={fulfillmentCompleteness.full.length} caption={`of ${fulfillmentCompleteness.total} delivered requests`} />
            <StatTile label="90-99% fulfilled" value={fulfillmentCompleteness.ninetyPlus.length} caption={`of ${fulfillmentCompleteness.total} delivered requests`} />
            <StatTile className="col-span-2 lg:col-span-1" label="Below 90%" value={fulfillmentCompleteness.belowNinety.length} tone={fulfillmentCompleteness.belowNinety.length > 0 ? 'danger' : 'default'} caption={`of ${fulfillmentCompleteness.total} delivered requests`} />
          </StatGrid>
          {completedRequests.length > 0 && (
            <ListGroup>
              {completedRequests.slice(0, showAllComplete ? undefined : SHOW).map((row) => (
                <ListRow
                  key={row.id}
                  density="compact"
                  title={row.requestedAt ? dateTime(row.requestedAt) : row.requestDate}
                  subtitle={`Requested ${row.totalRequested.toLocaleString()} · delivered ${row.totalDelivered.toLocaleString()} (all items)`}
                  trailing={<StatusChip tone={row.pct >= 99.5 ? 'success' : 'warning'}><span className="num">{Math.round(row.pct)}%</span></StatusChip>}
                />
              ))}
              {!showAllComplete && completedRequests.length > SHOW && (
                <ListRow muted density="compact" title={`See all (${completedRequests.length})`} onClick={() => setShowAllComplete(true)} chevron="down" />
              )}
            </ListGroup>
          )}
        </section>
      )}

      {/* Staff attendance compliance - org-wide, not scoped to the store/period filters above */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-attendance-title">
        <SectionHeading
          as="h3"
          id="sla-attendance-title"
          title="Staff attendance"
          caption={`${periodLabel}${attendanceReport.days > 0 ? ` · ${attendanceReport.days} day${attendanceReport.days === 1 ? '' : 's'}` : ''}`}
        />
        {attendanceLoading ? (
          <SkeletonListRows count={4} />
        ) : attendanceError ? (
          <ErrorState title="Could not load attendance" body={attendanceError} onRetry={() => setAttendanceReloadKey((k) => k + 1)} />
        ) : (
          <>
            {attendanceReport.days === 0 || attendanceReport.rows.length === 0 ? (
              <Card><EmptyState compact icon={Users} title="No working days to check in this period yet" /></Card>
            ) : (
              <>
                <p className="text-body-sm text-text-2">
                  <span className="num font-semibold text-text">{attendanceReport.totalFilled} of {attendanceReport.totalExpected}</span> expected timesheets filled
                  {attendanceReport.totalExpected > 0 ? ` (${Math.round((attendanceReport.totalFilled / attendanceReport.totalExpected) * 100)}%)` : ''}.
                  {' '}Based on {timesheets.length} timesheets loaded.
                </p>
                <ListGroup
                  className="lg:hidden"
                  footer="Approved leave days are not counted as missing, and today is not counted until the day is over."
                >
                  {attendanceReport.rows.map((row) => {
                    const open = openEmployee === row.employeeId;
                    return (
                      <div key={row.employeeId}>
                        <ListRow
                          title={`${row.name} (${row.employeeId})`}
                          subtitle={`Filled ${row.filled}/${row.expected - row.onLeave} · leave ${row.onLeave} · ${row.approved} approved${row.pending > 0 ? ` · ${row.pending} pending` : ''}${row.rejected > 0 ? ` · ${row.rejected} rejected` : ''}`}
                          trailing={<StatusChip tone={row.missing > 0 ? 'danger' : 'success'}><span className="num">{row.missing}</span> missing</StatusChip>}
                          onClick={row.missing > 0 ? () => setOpenEmployee(open ? null : row.employeeId) : undefined}
                          chevron={row.missing > 0 ? 'down' : false}
                          aria-expanded={row.missing > 0 ? open : undefined}
                        />
                        {open && (
                          <p className="bg-surface-2 px-4 py-2.5 text-label text-text-2">Missing: {row.missingDates.slice().reverse().join(', ')}</p>
                        )}
                      </div>
                    );
                  })}
                </ListGroup>
                <div className="hidden flex-col gap-2 lg:flex">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead numeric>Filled</TableHead>
                        <TableHead numeric>Missing</TableHead>
                        <TableHead numeric>Leave</TableHead>
                        <TableHead>Approval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendanceReport.rows.map((row) => (
                        <TableRow key={row.employeeId} className="align-top">
                          <TableCell>
                            <span className="font-medium">{row.name}</span> <span className="text-text-3">({row.employeeId})</span>
                            {row.missing > 0 && <span className="mt-0.5 block text-label text-text-3">Missing: {row.missingDates.slice().reverse().join(', ')}</span>}
                          </TableCell>
                          <TableCell numeric><span className="font-semibold">{row.filled}</span><span className="text-text-3"> / {row.expected - row.onLeave}</span></TableCell>
                          <TableCell numeric><StatusChip tone={row.missing > 0 ? 'danger' : 'success'}>{row.missing}</StatusChip></TableCell>
                          <TableCell numeric className="text-text-2">{row.onLeave}</TableCell>
                          <TableCell className="whitespace-nowrap text-text-2">{row.approved} approved{row.pending > 0 ? ` · ${row.pending} pending` : ''}{row.rejected > 0 ? ` · ${row.rejected} rejected` : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-label text-text-3">Approved leave days are not counted as missing, and today is not counted until the day is over.</p>
                </div>
              </>
            )}
            <Button variant="ghost" size="sm" leadingIcon={<RotateCw />} className="self-start" onClick={() => setAttendanceReloadKey((k) => k + 1)}>Reload attendance</Button>
            <ListGroup
              title="Waiting for manager approval"
              footer={`A timesheet still pending after ${TIMESHEET_AUTO_APPROVE_DAYS} days is approved automatically, so attendance records don't get stuck on a forgotten approval.`}
              empty={<ListRow density="compact" icon={CheckCircle2} iconTone="success" title="No timesheets waiting for approval" />}
            >
              {pendingAttendanceApprovals.map((row, i) => (
                <ListRow
                  key={i}
                  density="compact"
                  title={`${row.name} (${row.employeeId})`}
                  subtitle={`Timesheet for ${row.date}`}
                  trailing={
                    <StatusChip tone={row.willAutoApproveToday || row.daysPending >= 3 ? 'warning' : 'neutral'} icon={Clock}>
                      {row.willAutoApproveToday ? `Auto-approves today (${row.daysPending}d)` : `${row.daysPending}d pending`}
                    </StatusChip>
                  }
                />
              ))}
            </ListGroup>
          </>
        )}
      </section>

      {/* Store wastage - what the store incharge logs under Stock Requests > Log Wastage */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-wastage-title">
        <SectionHeading as="h3" id="sla-wastage-title" title="Store wastage" caption={periodLabel} />
        {wastageLoading ? (
          <SkeletonListRows count={3} />
        ) : wastageSummary.days.length === 0 ? (
          <Card><EmptyState compact icon={Trash2} title="No wastage logged in this period" body="The store incharge logs it from Stock Requests → Log wastage (tracked from 30 Aug 2026)." /></Card>
        ) : (
          <>
            <StatGrid columns={3}>
              <StatTile label="Pieces wasted" value={wastageSummary.total.toLocaleString('en-IN')} />
              <StatTile label="Days logged" value={wastageSummary.days.length} />
              <StatTile className="col-span-2 lg:col-span-1" label="Last logged" value={wastageSummary.lastLogged ? new Date(`${wastageSummary.lastLogged}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'} />
            </StatGrid>
            <Card>
              <ShareBars items={wastageSummary.rows.map((r) => ({ label: r.label, value: r.pieces, color: CHART_COLORS.primary, valueText: `${r.pieces} pcs` }))} />
            </Card>
            {wastageSummary.reasonRows.some((r) => r.code) && (
              <ListGroup title="By reason" footer="Q = short or damaged at delivery (from the store's count). S = staff meals, counted here because they leave stock too.">
                {wastageSummary.reasonRows.map((r) => (
                  <ListRow key={r.code || 'none'} density="compact" title={r.code ? `${r.code} · ${r.label}` : r.label} muted={!r.code} trailing={<span className="num text-body-md font-semibold text-text">{r.pieces} pcs</span>} />
                ))}
              </ListGroup>
            )}
            <ListGroup title="Day by day">
              {wastageSummary.days.slice(0, showAllWasteDays ? undefined : SHOW).map((d) => (
                <ListRow
                  key={d.date}
                  density="compact"
                  title={new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  subtitle={d.notes || d.by}
                  trailing={<span className="num text-body-md font-semibold text-text">{d.pieces} pcs</span>}
                />
              ))}
              {!showAllWasteDays && wastageSummary.days.length > SHOW && (
                <ListRow muted density="compact" title={`See all (${wastageSummary.days.length})`} onClick={() => setShowAllWasteDays(true)} chevron="down" />
              )}
            </ListGroup>
          </>
        )}
      </section>

      {/* Out of stock - logged by whoever bills at the store (Out of Stock page, SOP ST-28) */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-oos-title">
        <SectionHeading as="h3" id="sla-oos-title" title="Out of stock" caption={periodLabel} />
        {stockOuts.length === 0 ? (
          <Card><EmptyState compact icon={PackageX} title="No stock-outs logged in this period" body="The store logs them from the Out of Stock page." /></Card>
        ) : (
          <>
            <StatGrid columns={3}>
              <StatTile label="Times out" value={stockOuts.length} />
              <StatTile label="Time out in total" value={stockOutDuration(new Date(0).toISOString(), new Date(stockOutSummary.minutes * 60000).toISOString())} />
              <StatTile className="col-span-2 lg:col-span-1" label="Out right now" value={stockOutSummary.open.length} tone={stockOutSummary.open.length ? 'danger' : 'default'} />
            </StatGrid>
            {stockOutSummary.open.length > 0 && (
              <Callout tone="danger" title="Out of stock now">
                {stockOutSummary.open.map((e) => `${e.item} since ${istClock(e.startAt)} (${stockOutDuration(e.startAt)})`).join(' · ')}
              </Callout>
            )}
            <ListGroup title="By item">
              {stockOutSummary.items.map((r) => (
                <ListRow key={r.item} density="compact" title={r.item} trailing={<span className="num text-body-sm text-text-2">{r.times}× · {stockOutDuration(new Date(0).toISOString(), new Date(r.minutes * 60000).toISOString())}</span>} />
              ))}
            </ListGroup>
            <ListGroup title="By reason">
              {stockOutSummary.reasons.map((r) => (
                <ListRow key={r.id} density="compact" title={r.label} trailing={<span className="num text-body-md font-semibold text-text">{r.times}</span>} />
              ))}
            </ListGroup>
            <ListGroup title="Latest">
              {stockOutSummary.latest.map((e) => (
                <ListRow
                  key={e.id}
                  density="compact"
                  title={e.item}
                  subtitle={`${new Date(`${istDate(e.startAt)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${istClock(e.startAt)} - ${e.endAt ? istClock(e.endAt) : 'still out'} · ${stockOutDuration(e.startAt, e.endAt)} · ${stockOutReasonLabel(e.reason)}${e.reasonNote ? ` (${e.reasonNote})` : ''} · ${e.createdByName}`}
                />
              ))}
            </ListGroup>
          </>
        )}
      </section>

      {/* Items requested vs delivered */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-items-title">
        <SectionHeading as="h3" id="sla-items-title" title="Items requested vs delivered" caption={periodLabel} />
        {itemStats.length === 0 ? (
          <Card><EmptyState compact icon={Package} title="No requests in this period" /></Card>
        ) : (
          <>
            <ListGroup className="lg:hidden">
              {itemStats.map((row) => (
                <ListRow
                  key={row.label}
                  title={row.label}
                  subtitle={`Requested ${row.requested.toLocaleString()} · delivered ${row.delivered.toLocaleString()} · sold ${row.sold.toLocaleString()}`}
                  trailing={pctChip(row.pct)}
                />
              ))}
            </ListGroup>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead numeric>Requested</TableHead>
                    <TableHead numeric>Delivered</TableHead>
                    <TableHead numeric>Sold</TableHead>
                    <TableHead numeric>Fulfilment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemStats.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell numeric className="text-text-2">{row.requested.toLocaleString()}</TableCell>
                      <TableCell numeric className="text-text-2">{row.delivered.toLocaleString()}</TableCell>
                      <TableCell numeric className="text-text-2">{row.sold.toLocaleString()}</TableCell>
                      <TableCell numeric>{pctChip(row.pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* Sauces requested vs delivered */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-sauces-title">
        <SectionHeading as="h3" id="sla-sauces-title" title="Sauces requested vs delivered" caption={`By number of requests · ${periodLabel}`} />
        {sauceStats.length === 0 ? (
          <Card><EmptyState compact icon={Droplet} title="No sauces requested in this period" /></Card>
        ) : (
          <>
            <ListGroup className="lg:hidden">
              {sauceStats.map((row) => (
                <ListRow
                  key={row.name}
                  title={<span className="capitalize">{row.name.replace(/_/g, ' ')}</span>}
                  subtitle={`Requested ${row.requestedCount} times · delivered ${row.deliveredCount}`}
                  trailing={pctChip(row.pct)}
                />
              ))}
            </ListGroup>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sauce</TableHead>
                    <TableHead numeric>Times requested</TableHead>
                    <TableHead numeric>Times delivered</TableHead>
                    <TableHead numeric>Fulfilment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sauceStats.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="capitalize">{row.name.replace(/_/g, ' ')}</TableCell>
                      <TableCell numeric className="text-text-2">{row.requestedCount}</TableCell>
                      <TableCell numeric className="text-text-2">{row.deliveredCount}</TableCell>
                      <TableCell numeric>{pctChip(row.pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* Items not delivered for several days */}
      <ListGroup
        title="Not delivered recently"
        action={
          <label className="flex items-center gap-2 text-label text-text-2">
            Flag after
            <input
              type="number"
              min={1}
              value={staleDays}
              onChange={(e) => setStaleDays(Math.max(1, parseInt(e.target.value) || 1))}
              className={cn(controlClasses, 'num h-11 w-16 px-2 text-center')}
            />
            days
          </label>
        }
        empty={<ListRow density="compact" icon={CheckCircle2} iconTone="success" title="Nothing flagged" subtitle="Every requested item has been delivered recently." />}
      >
        {staleItems.map((row) => (
          <ListRow
            key={`${row.kind}-${row.label}`}
            title={<span className="capitalize">{row.label.replace(/_/g, ' ')}</span>}
            subtitle={`${row.lastDelivered ? `Last delivered ${row.lastDelivered} (${row.daysSince} day${row.daysSince === 1 ? '' : 's'} ago)` : 'Never delivered'} · ${row.requestsSinceDelivery} request${row.requestsSinceDelivery === 1 ? '' : 's'} since`}
            trailing={<StatusChip tone="danger">{row.daysSince === null ? 'Never' : `${row.daysSince}d`}</StatusChip>}
          />
        ))}
      </ListGroup>

      {/* Pipeline timing - one small chart per stage */}
      <section className="flex flex-col gap-3" aria-labelledby="sla-pipeline-title">
        <SectionHeading as="h3" id="sla-pipeline-title" title="Pipeline time of day, by stage" caption="When each stage happened, grouped by the day the request was placed" />
        {timingChartData.length === 0 ? (
          <Card><EmptyState compact icon={Clock} title="No timestamped requests in this period" /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {([
              { key: 'Requested', color: CHART_SERIES[3], nextDayField: null, efficiency: `${chartEfficiency.requestedCount} placed`, pct: null as number | null },
              { key: 'Accepted', color: CHART_SERIES[2], nextDayField: 'acceptedNextDayCount', efficiency: chartEfficiency.acceptedSameDayPct === null ? null : `${chartEfficiency.acceptedSameDayPct}% same day`, pct: chartEfficiency.acceptedSameDayPct },
              { key: 'Shipped', color: CHART_SERIES[0], nextDayField: 'shippedNextDayCount', efficiency: chartEfficiency.shippedSameDayPct === null ? null : `${chartEfficiency.shippedSameDayPct}% same day`, pct: chartEfficiency.shippedSameDayPct },
              { key: 'Delivered', color: CHART_SERIES[1], nextDayField: 'delayedCount', efficiency: chartEfficiency.deliveredSameDayPct === null ? null : `${chartEfficiency.deliveredSameDayPct}% same day as shipped`, pct: chartEfficiency.deliveredSameDayPct },
            ] as const).map(({ key, color, nextDayField, efficiency, pct }) => (
              <Card key={key} className="min-w-0 gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-semibold text-text">{key}</span>
                  {efficiency && (pct === null
                    ? <span className="num text-label text-text-3">{efficiency}</span>
                    : <StatusChip tone={pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'danger'}><span className="num">{efficiency}</span></StatusChip>)}
                </div>
                <div role="img" aria-label={`${key}: time of day for each placement day`}>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={timingChartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="day" {...chartAxisProps} minTickGap={16} />
                      <YAxis
                        domain={[PIPELINE_AXIS_MIN, PIPELINE_AXIS_MAX]}
                        ticks={PIPELINE_AXIS_TICKS}
                        tickFormatter={formatHourShort}
                        {...chartAxisProps}
                        width={52}
                      />
                      <Tooltip
                        cursor={chartCursor}
                        content={(p: any) => (
                          <ChartTooltipCard
                            {...p}
                            formatValue={(v: number) => formatHourPrecise(v)}
                            formatLabel={(label: any) => {
                              const flagCount = nextDayField ? (p.payload?.[0]?.payload?.[nextDayField] || 0) : 0;
                              if (flagCount === 0) return label;
                              const verb = key === 'Delivered' ? 'delivered' : key === 'Shipped' ? 'shipped' : 'accepted';
                              return `${label} - ${flagCount} ${verb} on a later day`;
                            }}
                          />
                        )}
                      />
                      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={renderTimingDot(color)} connectNulls isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ))}
          </div>
        )}
        <HowItWorks title="Pipeline time of day">
          <p>"Requested" is when the request was placed. The other three are grouped under that same placement day, so a point's clock time doesn't by itself confirm the stage happened that same day.</p>
          {(delayedDeliveries.length > 0 || nextDayCounts.acceptedNextDay > 0 || nextDayCounts.shippedNextDay > 0) && (
            <p>A large red point on Accepted, Shipped or Delivered means at least one request in that day's group actually happened on a later calendar date - tap the point to see how many.</p>
          )}
        </HowItWorks>
        {delayedDeliveries.length > 0 && (
          <>
            <ListGroup title="Delivered later than shipped" meta={String(delayedDeliveries.length)} className="lg:hidden">
              {delayedDeliveries.map((row) => (
                <ListRow
                  key={row.id}
                  title={`Requested ${dateTime(row.requestedAt)}`}
                  subtitle={`Accepted ${row.acceptedAt ? dateTime(row.acceptedAt) : '-'} · shipped ${dateTime(row.shippedAt)} · delivered ${dateTime(row.deliveredAt)}`}
                  trailing={<StatusChip tone="danger">{row.daysLate}d late</StatusChip>}
                />
              ))}
            </ListGroup>
            <div className="hidden flex-col gap-2 lg:flex">
              <h4 className="text-subtitle font-semibold text-text">Delivered later than shipped ({delayedDeliveries.length})</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request date</TableHead>
                    <TableHead>Accepted</TableHead>
                    <TableHead>Shipped</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead numeric>Days late</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delayedDeliveries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-text-2">{dateTime(row.requestedAt)}</TableCell>
                      <TableCell className="text-text-2">{row.acceptedAt ? dateTime(row.acceptedAt) : '-'}</TableCell>
                      <TableCell className="text-text-2">{dateTime(row.shippedAt)}</TableCell>
                      <TableCell className="text-text-2">{dateTime(row.deliveredAt)}</TableCell>
                      <TableCell numeric className="font-semibold text-danger">{row.daysLate}d</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
