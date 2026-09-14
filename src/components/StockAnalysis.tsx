import { useEffect, useMemo, useState } from 'react';
import { Package, Droplet, AlertTriangle, Clock, BarChart3, UserX, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ProductionRequest, Employee, Timesheet } from '../utils/api';
import * as api from '../utils/api';

interface StockAnalysisProps {
  requests: ProductionRequest[];
  finishedProducts: { camelKey: string; label: string; legacySalesKey: string }[];
  // Loosely typed to match SalesData's actual shape - the per-item "data" map (keyed by
  // display name, e.g. "Chicken Momos") isn't part of SalesData's formal TS type, the same
  // way ProductionRequests.tsx's own sold-quantity lookup accesses it.
  salesData: { date: string; storeId?: string; data?: Record<string, number> }[];
}

type Period = '7d' | '30d' | 'thisMonth' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  thisMonth: 'This month',
  all: 'All time',
};

// A request counts as "not delivered" for this item only once it's actually reached the
// store - pending/accepted/shipped requests haven't failed to deliver, they just haven't
// gotten there yet. Only delivered/partially-delivered rows tell us what really arrived.
const isDeliveredStatus = (status: string) => status === 'delivered' || status === 'partially-delivered';

function daysAgo(dateStr: string): number {
  const then = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  const now = new Date(new Date().toISOString().substring(0, 10) + 'T00:00:00');
  return Math.round((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
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
  if (pct === null) return 'text-gray-400';
  if (pct >= 90) return 'text-emerald-600';
  if (pct >= 70) return 'text-amber-600';
  return 'text-red-600';
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
// How far back to look for missing attendance - matches the "Not Delivered Recently"
// section's spirit (recent, actionable window) rather than the full employment history.
const ATTENDANCE_LOOKBACK_DAYS = 7;

export function StockAnalysis({ requests, finishedProducts, salesData }: StockAnalysisProps) {
  const [period, setPeriod] = useState<Period>('30d');
  const [staleDays, setStaleDays] = useState(3);

  // ---- Staff Attendance Compliance: who hasn't submitted a timesheet recently, and how
  // long a submitted-but-pending one has been waiting on manager approval. Fetched
  // separately from the stock-request props above since it's an org-wide, unrelated
  // dataset - self-contained so this section works regardless of what page embeds
  // StockAnalysis. ----
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [emp, ts] = await Promise.all([api.getEmployees(), api.getAllTimesheets()]);
        if (!cancelled) {
          setEmployees(emp);
          setTimesheets(ts);
        }
      } catch (error) {
        console.log('StockAnalysis: failed to load attendance data:', error);
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Only employees and managers actually fill their own timesheet (cluster heads only
  // approve, per AttendancePortal's role-based default tab) - and only once they've
  // actually joined, and while still active.
  const expectedSubmitters = useMemo(
    () => employees.filter((e) => e.status !== 'inactive' && (e.role === 'employee' || e.role === 'manager')),
    [employees]
  );

  const missingAttendance = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    const windowDates: string[] = [];
    for (let i = 1; i <= ATTENDANCE_LOOKBACK_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      windowDates.push(d.toISOString().substring(0, 10));
    }

    const hasTimesheet = new Set(timesheets.map((t) => `${t.employeeId}:${t.date}`));

    return expectedSubmitters
      .map((emp) => {
        const missingDates = windowDates.filter((date) => {
          // Never expect a submission before the employee joined, or after today.
          if (emp.joiningDate && date < emp.joiningDate) return false;
          if (date >= today) return false;
          return !hasTimesheet.has(`${emp.employeeId}:${date}`);
        });
        return { employeeId: emp.employeeId, name: emp.name, missingDates };
      })
      .filter((row) => row.missingDates.length > 0)
      .sort((a, b) => b.missingDates.length - a.missingDates.length);
  }, [expectedSubmitters, timesheets]);

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
    if (period === 'all') return requests;
    const now = new Date();
    let cutoff: string;
    if (period === 'thisMonth') {
      cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
      const days = period === '7d' ? 7 : 30;
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      cutoff = d.toISOString().substring(0, 10);
    }
    return requests.filter((r) => (r.requestDate || r.createdAt || '').substring(0, 10) >= cutoff);
  }, [requests, period]);

  // Same cutoff logic as periodRequests, applied to the store's daily sales records instead
  // - this is what backs the new "Sold" column, so what counts as "this period" matches
  // between the two tables.
  const periodSalesData = useMemo(() => {
    if (period === 'all') return salesData;
    const now = new Date();
    let cutoff: string;
    if (period === 'thisMonth') {
      cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
      const days = period === '7d' ? 7 : 30;
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      cutoff = d.toISOString().substring(0, 10);
    }
    return salesData.filter((s) => (s.date || '').substring(0, 10) >= cutoff);
  }, [salesData, period]);

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
    !!r.shippedAt && !!r.deliveredAt && r.shippedAt.substring(0, 10) !== r.deliveredAt.substring(0, 10);

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
      if (r.deliveredAt) {
        byDay[day].deliver.push(timeOfDayHours(r.deliveredAt));
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
        const deliveredDate = r.deliveredAt!.substring(0, 10);
        const daysLate = Math.round((new Date(deliveredDate).getTime() - new Date(shippedDate).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: r.id,
          requestDate: r.requestDate || r.createdAt?.substring(0, 10) || shippedDate,
          requestedAt: r.createdAt || r.requestDate || shippedDate,
          acceptedAt: r.acceptedAt || null,
          shippedAt: r.shippedAt!,
          deliveredAt: r.deliveredAt!,
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
    const deliveredWithShip = periodRequests.filter((r) => !!r.shippedAt && !!r.deliveredAt);

    const acceptedOnTime = accepted.filter((r) => timeOfDayHours(r.acceptedAt!) <= ACCEPT_BY_HOUR);
    const shippedOnTime = shipped.filter((r) => timeOfDayHours(r.shippedAt!) <= SHIP_BY_HOUR);
    const deliveredOnTime = deliveredWithShip.filter((r) => hoursBetween(r.shippedAt!, r.deliveredAt!) <= DELIVER_WITHIN_HOURS);

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
    const deliveredTotal = periodRequests.filter((r) => !!r.shippedAt && !!r.deliveredAt).length;
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
      return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />;
    }
    return <circle key={`dot-${payload.day}`} cx={cx} cy={cy} r={3} fill={color} />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 rounded-2xl p-6 shadow-xl">
        <div className="absolute inset-0 bg-white/10" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border-2 border-white/30 flex-shrink-0">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">Store-Production SLA Analysis</h1>
            <p className="text-sm sm:text-base text-white/80 mt-1">Request fulfillment and pipeline timing</p>
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
              period === p ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* SLA Scorecard + Key Observations - the three fixed operational cutoffs this
          business runs on, checked against every request that actually has the relevant
          timestamp, plus a handful of auto-generated callouts pulled from the sections
          below so the headline issues surface without reading every table. */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <AlertTriangle className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">SLA Scorecard &amp; Key Observations</h3>
          <span className="text-xs text-gray-500 ml-auto">{PERIOD_LABELS[period]}</span>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { label: `Accepted by ${formatHourShort(ACCEPT_BY_HOUR)}`, stat: slaStats.accepted, sub: 'Requested → Accepted' },
              { label: `Shipped by ${formatHourShort(SHIP_BY_HOUR)}`, stat: slaStats.shipped, sub: 'Cutoff for dispatch' },
              { label: `Delivered within ${DELIVER_WITHIN_HOURS}h of shipping`, stat: slaStats.delivered, sub: 'Shipped → Delivered' },
            ] as const).map(({ label, stat, sub }) => {
              const pct = stat.total > 0 ? Math.round((stat.met / stat.total) * 100) : null;
              const tone = pct === null ? 'text-gray-400' : pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600';
              const barTone = pct === null ? 'bg-gray-200' : pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div key={label} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700">{label}</p>
                  <p className="text-[11px] text-gray-400 mb-2">{sub}</p>
                  <div className="flex items-end justify-between">
                    <span className={`text-2xl font-bold tabular-nums ${tone}`}>{pct === null ? '-' : `${pct}%`}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{stat.met}/{stat.total} met</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Key Observations</p>
            <ul className="space-y-1.5">
              {observations.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${note.startsWith('No SLA breaches') ? 'bg-emerald-500' : 'bg-amber-500'}`} />
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
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Request Fulfillment Completeness</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-emerald-800">100% Fulfilled</p>
                  <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">{fulfillmentCompleteness.full.length}</p>
                  <p className="text-[11px] text-emerald-700/70">of {fulfillmentCompleteness.total} delivered requests</p>
                </div>
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800">90-99% Fulfilled</p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">{fulfillmentCompleteness.ninetyPlus.length}</p>
                  <p className="text-[11px] text-amber-700/70">of {fulfillmentCompleteness.total} delivered requests</p>
                </div>
                <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-800">Below 90%</p>
                  <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">{fulfillmentCompleteness.belowNinety.length}</p>
                  <p className="text-[11px] text-red-700/70">of {fulfillmentCompleteness.total} delivered requests</p>
                </div>
              </div>

              {(fulfillmentCompleteness.full.length > 0 || fulfillmentCompleteness.ninetyPlus.length > 0) && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-left text-gray-500 uppercase tracking-wide">
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
                            <tr key={row.id} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 text-gray-700">{row.requestedAt ? new Date(row.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : row.requestDate}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{row.totalRequested.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{row.totalDelivered.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                                <span className={row.pct >= 99.5 ? 'text-emerald-600' : 'text-amber-600'}>{Math.round(row.pct)}%</span>
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
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <Users className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">Staff Attendance Compliance</h3>
          <span className="text-xs text-gray-500 ml-auto">Last {ATTENDANCE_LOOKBACK_DAYS} days</span>
        </div>
        {attendanceLoading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading attendance data...</div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <UserX className="w-3.5 h-3.5 text-red-600" /> Missing Timesheets
              </p>
              {missingAttendance.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <span>Everyone has filled attendance for every day in this window.</span>
                </div>
              ) : (
                <div className="border border-red-200 rounded-lg overflow-hidden divide-y divide-red-100">
                  {missingAttendance.map((row) => (
                    <div key={row.employeeId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{row.name} <span className="text-gray-400 font-normal">({row.employeeId})</span></p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">Missing: {row.missingDates.slice().reverse().join(', ')}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold whitespace-nowrap flex-shrink-0">
                        {row.missingDates.length}/{ATTENDANCE_LOOKBACK_DAYS} days
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" /> Pending Manager Approval
              </p>
              {pendingAttendanceApprovals.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <span>No timesheets awaiting approval.</span>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                  {pendingAttendanceApprovals.map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{row.name} <span className="text-gray-400 font-normal">({row.employeeId})</span></p>
                        <p className="text-xs text-gray-500 mt-0.5">Timesheet for {row.date}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 ${
                        row.willAutoApproveToday ? 'bg-amber-100 text-amber-800' : row.daysPending >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {row.willAutoApproveToday ? `Auto-approves today (${row.daysPending}d)` : `${row.daysPending}d pending`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-2">
                A timesheet still pending after {TIMESHEET_AUTO_APPROVE_DAYS} days is automatically approved so attendance records don't get stuck on a forgotten approval.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Section A: Items requested vs delivered */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <Package className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-semibold text-gray-900">Items Requested vs Delivered</h3>
          <span className="text-xs text-gray-500 ml-auto">{PERIOD_LABELS[period]}</span>
        </div>
        {itemStats.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No requests in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Requested</th>
                  <th className="px-4 py-2 text-right">Delivered</th>
                  <th className="px-4 py-2 text-right">Sold</th>
                  <th className="px-4 py-2 text-right">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {itemStats.map((row) => (
                  <tr key={row.label} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-900">{row.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{row.requested.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{row.delivered.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{row.sold.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {row.pct === null ? '-' : (
                        <span className={row.pct >= 90 ? 'text-emerald-600' : row.pct >= 60 ? 'text-amber-600' : 'text-red-600'}>{row.pct}%</span>
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
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <Droplet className="w-4 h-4 text-rose-600" />
          <h3 className="text-sm font-semibold text-gray-900">Sauces - Requested vs Delivered</h3>
          <span className="text-xs text-gray-500 ml-auto">by number of requests, {PERIOD_LABELS[period]}</span>
        </div>
        {sauceStats.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No sauces requested in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Sauce</th>
                  <th className="px-4 py-2 text-right">Times Requested</th>
                  <th className="px-4 py-2 text-right">Times Delivered</th>
                  <th className="px-4 py-2 text-right">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {sauceStats.map((row) => (
                  <tr key={row.name} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-900 capitalize">{row.name.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{row.requestedCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{row.deliveredCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {row.pct === null ? '-' : (
                        <span className={row.pct >= 90 ? 'text-emerald-600' : row.pct >= 60 ? 'text-amber-600' : 'text-red-600'}>{row.pct}%</span>
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
      <div className="border border-red-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-semibold text-red-900">Not Delivered Recently</h3>
          <div className="flex items-center gap-1.5 ml-auto text-xs text-red-700">
            <span>Flag after</span>
            <input
              type="number"
              min={1}
              value={staleDays}
              onChange={(e) => setStaleDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 px-1.5 py-0.5 border border-red-300 rounded text-center"
            />
            <span>days</span>
          </div>
        </div>
        {staleItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Nothing flagged - every requested item has been delivered recently.</div>
        ) : (
          <div className="divide-y divide-red-100">
            {staleItems.map((row) => (
              <div key={`${row.kind}-${row.label}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 capitalize">{row.label.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {row.lastDelivered
                      ? `Last delivered ${row.lastDelivered} (${row.daysSince} day${row.daysSince === 1 ? '' : 's'} ago)`
                      : 'Never delivered'}
                    {' - '}{row.requestsSinceDelivery} request{row.requestsSinceDelivery === 1 ? '' : 's'} since
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold whitespace-nowrap flex-shrink-0">
                  {row.daysSince === null ? 'Never' : `${row.daysSince}d`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section D: Pipeline timing - one chart per stage, so each stage's own daily
          rhythm reads clearly instead of three overlapping lines. */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <Clock className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Pipeline Time of Day, by Stage</h3>
        </div>
        <div className="p-4">
          {timingChartData.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-8">No timestamped requests in this period.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {([
                { key: 'Requested', color: '#6366f1', nextDayField: null, efficiency: `${chartEfficiency.requestedCount} placed`, efficiencyTone: 'text-gray-500' },
                { key: 'Accepted', color: '#f59e0b', nextDayField: 'acceptedNextDayCount', efficiency: chartEfficiency.acceptedSameDayPct === null ? null : `${chartEfficiency.acceptedSameDayPct}% same-day`, efficiencyTone: efficiencyTone(chartEfficiency.acceptedSameDayPct) },
                { key: 'Shipped', color: '#3b82f6', nextDayField: 'shippedNextDayCount', efficiency: chartEfficiency.shippedSameDayPct === null ? null : `${chartEfficiency.shippedSameDayPct}% same-day`, efficiencyTone: efficiencyTone(chartEfficiency.shippedSameDayPct) },
                { key: 'Delivered', color: '#10b981', nextDayField: 'delayedCount', efficiency: chartEfficiency.deliveredSameDayPct === null ? null : `${chartEfficiency.deliveredSameDayPct}% same-day as shipped`, efficiencyTone: efficiencyTone(chartEfficiency.deliveredSameDayPct) },
              ] as const).map(({ key, color, nextDayField, efficiency, efficiencyTone: tone }) => (
                <div key={key}>
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-700">{key}</p>
                    {efficiency && <p className={`text-[11px] font-semibold tabular-nums ${tone}`}>{efficiency}</p>}
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timingChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis
                        domain={[PIPELINE_AXIS_MIN, PIPELINE_AXIS_MAX]}
                        ticks={PIPELINE_AXIS_TICKS}
                        tickFormatter={formatHourShort}
                        tick={{ fontSize: 10 }}
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
          <p className="text-xs text-gray-500 mt-3">
            "Requested" is when the request was placed - the other three are grouped under that
            same placement day, so a point's clock time doesn't by itself confirm the stage
            happened that same day. {(delayedDeliveries.length > 0 || nextDayCounts.acceptedNextDay > 0 || nextDayCounts.shippedNextDay > 0) && (
              <>Where <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 align-middle mx-1" /> appears on Accepted/Shipped/Delivered, at least one request in that day's group actually happened on a later calendar date - hover the point for how many.</>
            )}
          </p>

          {delayedDeliveries.length > 0 && (
            <div className="mt-4 border border-red-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-b border-red-200">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <p className="text-xs font-semibold text-red-900">Delivered later than shipped ({delayedDeliveries.length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-1.5">Request Date</th>
                      <th className="px-3 py-1.5">Accepted</th>
                      <th className="px-3 py-1.5">Shipped</th>
                      <th className="px-3 py-1.5">Delivered</th>
                      <th className="px-3 py-1.5 text-right">Days Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delayedDeliveries.map((row) => (
                      <tr key={row.id} className="border-t border-red-100">
                        <td className="px-3 py-1.5 text-gray-700">{new Date(row.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.acceptedAt ? new Date(row.acceptedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                        <td className="px-3 py-1.5 text-gray-700">{new Date(row.shippedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-gray-700">{new Date(row.deliveredAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-red-700">{row.daysLate}d</td>
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
