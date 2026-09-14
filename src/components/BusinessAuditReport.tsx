import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Wallet, Receipt, ShieldAlert, Clock, IndianRupee, Minus } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as api from '../utils/api';
import { InventoryContextType, SalesData } from '../App';
import { DatePicker } from './DatePicker';

interface Props {
  context: InventoryContextType;
  selectedStoreId?: string | null;
}

type Period = 'thisMonth' | 'lastMonth' | 'custom';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daysBetweenInclusive(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cursor <= last) {
    days.push(`${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function daysAgo(dateStr: string): number {
  const then = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  const now = new Date(todayISO() + 'T00:00:00');
  return Math.round((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

function healthTone(pct: number): { text: string; bg: string; bar: string } {
  if (pct >= 90) return { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' };
  if (pct >= 70) return { text: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' };
  return { text: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' };
}

function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

function scoreTone(score: number): { text: string; ring: string; label: string } {
  if (score >= 90) return { text: 'text-emerald-400', ring: '#34d399', label: 'Excellent' };
  if (score >= 75) return { text: 'text-lime-400', ring: '#a3e635', label: 'Good' };
  if (score >= 55) return { text: 'text-amber-400', ring: '#fbbf24', label: 'Needs Attention' };
  return { text: 'text-red-400', ring: '#f87171', label: 'Critical' };
}

const CASH_OVER_SHORT_REASON_LABELS: Record<string, string> = {
  missed_kot: 'Missed KOT',
  wrong_change: 'Wrong change',
  tip: 'Tip',
  counting_mistake: 'Counting mistake',
  other: 'Other',
};

export function BusinessAuditReport({ context, selectedStoreId }: Props) {
  const [period, setPeriod] = useState<Period>('thisMonth');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [salesData, setSalesData] = useState<SalesData[] | null>(null);
  const [productionCash, setProductionCash] = useState<api.ProductionCashEntry[]>([]);
  const [payouts, setPayouts] = useState<api.Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const accessToken = context.user?.accessToken || '';
  const targetProductionHouseId = context.productionHouses?.[0]?.id;

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    if (period === 'thisMonth') {
      return { rangeStart: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`, rangeEnd: todayISO() };
    }
    if (period === 'lastMonth') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        rangeStart: `${lastMonthStart.getFullYear()}-${pad2(lastMonthStart.getMonth() + 1)}-01`,
        rangeEnd: `${lastMonthEnd.getFullYear()}-${pad2(lastMonthEnd.getMonth() + 1)}-${pad2(lastMonthEnd.getDate())}`,
      };
    }
    return { rangeStart: customRange.from || todayISO(), rangeEnd: customRange.to || todayISO() };
  }, [period, customRange]);

  // Previous period of equal length, for every trend arrow in this report.
  const { prevStart, prevEnd } = useMemo(() => {
    const periodMs = new Date(rangeEnd).getTime() - new Date(rangeStart).getTime();
    const prevEndDate = new Date(new Date(rangeStart).getTime() - 24 * 60 * 60 * 1000);
    const prevStartDate = new Date(prevEndDate.getTime() - periodMs);
    return { prevStart: prevStartDate.toISOString().substring(0, 10), prevEnd: prevEndDate.toISOString().substring(0, 10) };
  }, [rangeStart, rangeEnd]);

  // This report needs the full-fidelity sales: records (actualCashInHand, discrepancy,
  // approval state, posOnlineSales) and Production Cash entries - neither is preloaded
  // into the global context, so it fetches them itself, same pattern ProductionRequests.tsx
  // and Analytics.tsx already use for their own report-specific data. Payouts (for the
  // P&L KPI strip) aren't in context at all - fetched here too.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.fetchSalesData(accessToken),
      targetProductionHouseId ? api.getProductionCashRange(accessToken, targetProductionHouseId, prevStart, rangeEnd) : Promise.resolve([]),
      api.getPayouts(),
    ])
      .then(([sales, prodCash, allPayouts]) => {
        if (cancelled) return;
        setSalesData(sales);
        setProductionCash(prodCash);
        setPayouts(allPayouts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, targetProductionHouseId, prevStart, rangeEnd]);

  const inScope = (storeId: string | undefined | null) => !selectedStoreId || storeId === selectedStoreId;

  const scopedSales = useMemo(() => {
    if (!salesData) return [];
    return salesData.filter((s) => s.date >= rangeStart && s.date <= rangeEnd && inScope(s.storeId));
  }, [salesData, rangeStart, rangeEnd, selectedStoreId]);

  const scopedSettlements = useMemo(() => {
    return (context.aggregatorSettlements || []).filter((s) => {
      if (!inScope(s.storeId)) return false;
      const coverStart = s.periodStart || s.settlementDate;
      const coverEnd = s.periodEnd || s.settlementDate;
      return coverEnd >= rangeStart && coverStart <= rangeEnd;
    });
  }, [context.aggregatorSettlements, selectedStoreId, rangeStart, rangeEnd]);

  const periodDays = useMemo(() => daysBetweenInclusive(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  // ---- This Period at a Glance: real ₹ magnitude behind every process metric below, plus
  // the trend vs. an equal-length previous period - a compliance % means little without the
  // revenue/cost scale it sits on top of. ----
  const financials = useMemo(() => {
    const computeFor = (start: string, end: string) => {
      const inRange = (d: string) => d >= start && d <= end;
      const salesInRange = (salesData || []).filter((s) => inRange(s.date) && inScope(s.storeId));
      const onlineInRange = (context.onlineSalesData || []).filter((s) => inRange(s.date) && inScope(s.storeId));
      const inventoryInRange = (context.inventory || []).filter((i) => inRange(i.date) && inScope(i.storeId));
      const overheadInRange = (context.overheads || []).filter((o) => inRange(o.date) && inScope(o.storeId));
      const payoutsInRange = payouts.filter((p) => inRange(p.date) && inScope(p.storeId));

      const offlineRevenue = salesInRange.reduce((sum, s) => sum + (s.offlineSales || 0), 0);
      const onlineRevenue = onlineInRange.reduce((sum, s) => sum + (s.swiggySales || 0) + (s.zomatoSales || 0), 0);
      const revenue = offlineRevenue + onlineRevenue;
      const inventorySpend = inventoryInRange.reduce((sum, i) => sum + (i.totalCost || 0), 0);
      const overheadSpend = overheadInRange.reduce((sum, o) => sum + (o.amount || 0), 0);
      const payoutSpend = payoutsInRange.reduce((sum, p) => sum + (p.amount || 0), 0);
      const costs = inventorySpend + overheadSpend + payoutSpend;
      const profit = revenue - costs;
      return { revenue, offlineRevenue, onlineRevenue, inventorySpend, overheadSpend, payoutSpend, costs, profit };
    };

    const current = computeFor(rangeStart, rangeEnd);
    const previous = computeFor(prevStart, prevEnd);
    const pctChange = (curr: number, prev: number) => (prev === 0 ? (curr === 0 ? 0 : 100) : ((curr - prev) / Math.abs(prev)) * 100);

    return {
      ...current,
      margin: current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0,
      revenueChangePct: pctChange(current.revenue, previous.revenue),
      profitChangePct: pctChange(current.profit, previous.profit),
      costsChangePct: pctChange(current.costs, previous.costs),
    };
  }, [salesData, context.onlineSalesData, context.inventory, context.overheads, payouts, rangeStart, rangeEnd, prevStart, prevEnd, selectedStoreId]);

  // ---- Daily revenue trend - the one chart on this page, so the KPI strip's totals have a
  // shape to them (a steady climb reads very differently from one huge day propping up an
  // otherwise flat month). ----
  const dailyRevenueSeries = useMemo(() => {
    return periodDays.map((day) => {
      const offline = (salesData || []).filter((s) => s.date === day && inScope(s.storeId)).reduce((sum, s) => sum + (s.offlineSales || 0), 0);
      const online = (context.onlineSalesData || []).filter((s) => s.date === day && inScope(s.storeId)).reduce((sum, s) => sum + (s.swiggySales || 0) + (s.zomatoSales || 0), 0);
      return {
        day,
        label: new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        Offline: Math.round(offline),
        Online: Math.round(online),
      };
    });
  }, [periodDays, salesData, context.onlineSalesData, selectedStoreId]);

  // ---- Revenue Completeness: for each aggregator, which days had online sales but no
  // settlement whose period actually covers that day - plus the real ₹ of online sales
  // sitting on those unsettled days, not just a day count. ----
  const revenueCompleteness = useMemo(() => {
    return (['zomato', 'swiggy'] as const).map((aggregator) => {
      const coveredDays = new Set<string>();
      scopedSettlements
        .filter((s) => s.aggregator === aggregator)
        .forEach((s) => {
          daysBetweenInclusive(s.periodStart || s.settlementDate, s.periodEnd || s.settlementDate).forEach((d) => coveredDays.add(d));
        });

      const salesField = aggregator === 'zomato' ? 'zomatoSales' : 'swiggySales';
      const dailyOnlineSales = new Map<string, number>();
      (context.onlineSalesData || []).filter((s) => inScope(s.storeId)).forEach((s) => {
        dailyOnlineSales.set(s.date, (dailyOnlineSales.get(s.date) || 0) + ((s as any)[salesField] || 0));
      });

      // A day only needs a settlement if there was actual sales activity for THIS
      // aggregator that day - no sales means nothing to settle, not a gap.
      const daysWithOnlineSales = periodDays.filter((day) => (dailyOnlineSales.get(day) || 0) > 0);
      const pendingDays = daysWithOnlineSales.filter((d) => !coveredDays.has(d));
      const pendingValue = pendingDays.reduce((sum, d) => sum + (dailyOnlineSales.get(d) || 0), 0);
      const settlements = scopedSettlements.filter((s) => s.aggregator === aggregator);
      const totalGross = settlements.reduce((sum, s) => sum + (s.grossSales || 0), 0);
      const totalCommission = settlements.reduce((sum, s) => sum + (s.netCommission || 0), 0);
      const effectiveCommissionPct = totalGross > 0 ? (totalCommission / totalGross) * 100 : null;

      return {
        aggregator,
        totalDaysWithSales: daysWithOnlineSales.length,
        pendingDays,
        pendingValue,
        coveragePct: daysWithOnlineSales.length > 0 ? Math.round(((daysWithOnlineSales.length - pendingDays.length) / daysWithOnlineSales.length) * 100) : 100,
        settlementCount: settlements.length,
        effectiveCommissionPct,
      };
    });
  }, [scopedSettlements, context.onlineSalesData, periodDays, selectedStoreId]);

  // ---- Cash Control Health: Store Cash + Production Cash reconciliation completion, and
  // every discrepancy still sitting unresolved, with its age. ----
  const storeCashHealth = useMemo(() => {
    // Only count days up to and including today - a future day in the selected range was
    // never going to have a count yet, and shouldn't drag the completion % down.
    const eligibleDays = periodDays.filter((d) => d <= todayISO());
    const reconciledDays = eligibleDays.filter((d) => scopedSales.some((s) => s.date === d && s.actualCashInHand != null));
    const pendingDiscrepancies = scopedSales
      .filter((s) => s.approvalRequired && s.approvalStatus === 'pending')
      .map((s) => ({
        date: s.date,
        storeId: s.storeId,
        amount: s.salesDiscrepancy ?? 0,
        ageDays: daysAgo(s.approvalRequestedAt || s.date),
      }))
      .sort((a, b) => b.ageDays - a.ageDays);
    return {
      totalDays: eligibleDays.length,
      reconciledDays: reconciledDays.length,
      completionPct: eligibleDays.length > 0 ? Math.round((reconciledDays.length / eligibleDays.length) * 100) : 100,
      pendingDiscrepancies,
    };
  }, [periodDays, scopedSales]);

  // ---- Cash Over/Short: till variances the store incharge has explained with a reason,
  // kept as their own line rather than folded into Sales - so a pattern (e.g. repeated
  // "wrong change" days) becomes visible instead of getting lost inside the sales figure. ----
  const cashOverShortSummary = useMemo(() => {
    const entries = scopedSales
      .filter((s) => Math.abs(s.cashOverShortAmount ?? 0) > 0.5)
      .map((s) => ({
        date: s.date,
        storeId: s.storeId,
        amount: s.cashOverShortAmount ?? 0, // positive = short, negative = over
        reason: s.cashOverShortReason ?? null,
        note: s.cashOverShortNote ?? null,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const byReason = new Map<string, { count: number; total: number }>();
    let netAmount = 0;
    let unexplainedCount = 0;
    for (const e of entries) {
      netAmount += e.amount;
      const key = e.reason || 'unexplained';
      if (!e.reason) unexplainedCount++;
      const bucket = byReason.get(key) || { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += e.amount;
      byReason.set(key, bucket);
    }
    return { entries, netAmount, unexplainedCount, byReason };
  }, [scopedSales]);

  const productionCashHealth = useMemo(() => {
    const eligibleDays = periodDays.filter((d) => d <= todayISO());
    const scopedProdCash = productionCash.filter((p) => p.date >= rangeStart && p.date <= rangeEnd);
    const reconciledDays = eligibleDays.filter((d) => scopedProdCash.some((p) => p.date === d && p.actualCashInHand != null));
    const pendingDiscrepancies = scopedProdCash
      .filter((p) => p.approvalRequired && p.approvalStatus === 'pending')
      .map((p) => ({
        date: p.date,
        amount: p.discrepancy ?? 0,
        ageDays: daysAgo(p.approvalRequestedAt || p.date),
      }))
      .sort((a, b) => b.ageDays - a.ageDays);
    return {
      totalDays: eligibleDays.length,
      reconciledDays: reconciledDays.length,
      completionPct: eligibleDays.length > 0 ? Math.round((reconciledDays.length / eligibleDays.length) * 100) : 100,
      pendingDiscrepancies,
    };
  }, [periodDays, productionCash, rangeStart, rangeEnd]);

  // ---- Composite Audit Score: one number distilling every process-health metric above,
  // so the hero can lead with a verdict instead of a pile of separate percentages. Weighted
  // toward cash control (the part that's actual money in a drawer) over settlement paperwork
  // timing, with a flat penalty per unresolved discrepancy so a single old one can't hide
  // inside an otherwise-high completion percentage. ----
  const auditScore = useMemo(() => {
    const avgRevenueCoverage = revenueCompleteness.length > 0
      ? revenueCompleteness.reduce((sum, r) => sum + r.coveragePct, 0) / revenueCompleteness.length
      : 100;
    const cashScore = (storeCashHealth.completionPct + productionCashHealth.completionPct) / 2;
    const discrepancyPenalty = Math.min(30, (storeCashHealth.pendingDiscrepancies.length + productionCashHealth.pendingDiscrepancies.length) * 6);
    const raw = cashScore * 0.55 + avgRevenueCoverage * 0.35 - discrepancyPenalty + (cashOverShortSummary.unexplainedCount === 0 ? 10 : 0);
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [storeCashHealth, productionCashHealth, revenueCompleteness, cashOverShortSummary]);

  // ---- Key Findings: the headline callouts pulled from every section below, worst first,
  // so the story reads without scrolling through every card. Same auto-generated-observations
  // idiom StockAnalysis.tsx already uses. ----
  const keyFindings = useMemo(() => {
    const findings: { text: string; tone: 'bad' | 'warn' | 'good' }[] = [];

    if (financials.profit < 0) {
      findings.push({ text: `This period is running at a loss of ${formatMoney(Math.abs(financials.profit))} - costs exceeded revenue.`, tone: 'bad' });
    } else {
      findings.push({ text: `Net profit of ${formatMoney(financials.profit)} (${financials.margin.toFixed(1)}% margin), ${financials.profitChangePct >= 0 ? 'up' : 'down'} ${Math.abs(financials.profitChangePct).toFixed(0)}% vs the previous period.`, tone: financials.profitChangePct >= 0 ? 'good' : 'warn' });
    }

    const totalDiscrepancies = storeCashHealth.pendingDiscrepancies.length + productionCashHealth.pendingDiscrepancies.length;
    if (totalDiscrepancies > 0) {
      const oldest = [...storeCashHealth.pendingDiscrepancies, ...productionCashHealth.pendingDiscrepancies].sort((a, b) => b.ageDays - a.ageDays)[0];
      findings.push({ text: `${totalDiscrepancies} cash discrepanc${totalDiscrepancies === 1 ? 'y is' : 'ies are'} still awaiting approval - the oldest has been open ${oldest.ageDays} day${oldest.ageDays === 1 ? '' : 's'}.`, tone: 'bad' });
    }

    revenueCompleteness.forEach((row) => {
      if (row.pendingDays.length > 0) {
        findings.push({ text: `${row.aggregator === 'zomato' ? 'Zomato' : 'Swiggy'} settlement is missing for ${row.pendingDays.length} day${row.pendingDays.length === 1 ? '' : 's'} - ${formatMoney(row.pendingValue)} in sales not yet confirmed as paid.`, tone: 'warn' });
      }
    });

    if (cashOverShortSummary.entries.length > 0) {
      findings.push({ text: `Cash Over/Short logged on ${cashOverShortSummary.entries.length} day${cashOverShortSummary.entries.length === 1 ? '' : 's'}, netting ${cashOverShortSummary.netAmount === 0 ? 'to zero' : `a ${cashOverShortSummary.netAmount > 0 ? 'shortage' : 'surplus'} of ${formatMoney(Math.abs(cashOverShortSummary.netAmount))}`}${cashOverShortSummary.unexplainedCount > 0 ? ` (${cashOverShortSummary.unexplainedCount} with no reason given)` : ''}.`, tone: cashOverShortSummary.unexplainedCount > 0 ? 'warn' : 'good' });
    }

    if (storeCashHealth.completionPct === 100 && productionCashHealth.completionPct === 100 && totalDiscrepancies === 0 && revenueCompleteness.every((r) => r.pendingDays.length === 0)) {
      findings.push({ text: 'Every cash count is reconciled and every online sale has a matching settlement - no process gaps this period.', tone: 'good' });
    }

    return findings;
  }, [financials, storeCashHealth, productionCashHealth, revenueCompleteness, cashOverShortSummary]);

  const tone = scoreTone(auditScore);
  const ringCircumference = 2 * Math.PI * 34;

  return (
    <div className="space-y-6">
      {/* Hero: verdict first (composite score + one-line narrative), not a title bar */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 sm:p-7 shadow-xl">
        <div className="absolute inset-0 bg-white/5" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border-2 border-white/20 flex-shrink-0">
              <ShieldAlert className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">Business Audit Report</h1>
              <p className="text-sm sm:text-base text-white/60 mt-1">Cash control health, revenue completeness &amp; P&amp;L for {rangeStart} to {rangeEnd}</p>
            </div>
          </div>

          {/* Composite Audit Score - an SVG ring so the verdict reads as a single glance,
              not another number in a row of numbers. */}
          <div className="flex items-center gap-3 flex-shrink-0 self-center sm:self-auto">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
                <circle
                  cx="40" cy="40" r="34" fill="none" stroke={tone.ring} strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - auditScore / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-xl font-extrabold text-white tabular-nums leading-none">{auditScore}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/50">Audit Score</p>
              <p className={`text-sm font-bold ${tone.text}`}>{tone.label}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(['thisMonth', 'lastMonth', 'custom'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              period === p ? 'bg-slate-800 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p === 'thisMonth' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : 'Custom'}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1">{rangeStart} to {rangeEnd}</span>
      </div>
      {period === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DatePicker label="From" value={customRange.from} onChange={(d) => setCustomRange({ ...customRange, from: d })} />
          <DatePicker label="To" value={customRange.to} onChange={(d) => setCustomRange({ ...customRange, to: d })} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700 mx-auto mb-3" />
          Loading audit data...
        </div>
      ) : (
        <>
          {/* This Period at a Glance - real ₹ magnitude behind everything else on this
              page, with a trend arrow vs. an equal-length previous period. */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <IndianRupee className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-gray-900">This Period at a Glance</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
              {[
                { label: 'Revenue', value: financials.revenue, changePct: financials.revenueChangePct, invertGood: false },
                { label: 'Costs', value: financials.costs, changePct: financials.costsChangePct, invertGood: true },
                { label: 'Net Profit', value: financials.profit, changePct: financials.profitChangePct, invertGood: false },
              ].map((kpi) => {
                const improving = kpi.invertGood ? kpi.changePct <= 0 : kpi.changePct >= 0;
                return (
                  <div key={kpi.label} className="p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                    <p className={`text-2xl font-extrabold tabular-nums mt-1 ${kpi.label === 'Net Profit' ? (kpi.value >= 0 ? 'text-emerald-700' : 'text-red-700') : 'text-gray-900'}`}>
                      {formatMoney(kpi.value)}
                    </p>
                    <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${
                      Math.abs(kpi.changePct) < 0.5 ? 'text-gray-400' : improving ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {Math.abs(kpi.changePct) < 0.5 ? <Minus className="w-3 h-3" /> : kpi.changePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(kpi.changePct).toFixed(1)}% vs previous period
                    </p>
                  </div>
                );
              })}
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Profit Margin</p>
                <p className={`text-2xl font-extrabold tabular-nums mt-1 ${financials.margin >= 0 ? 'text-gray-900' : 'text-red-700'}`}>{financials.margin.toFixed(1)}%</p>
                <p className="text-xs text-gray-400 mt-1">Offline {formatMoney(financials.offlineRevenue)} · Online {formatMoney(financials.onlineRevenue)}</p>
              </div>
            </div>

            {/* Daily revenue trend */}
            {dailyRevenueSeries.some((d) => d.Offline > 0 || d.Online > 0) && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-2">Daily Revenue Trend</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={dailyRevenueSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="offlineFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="onlineFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                    <Area type="monotone" dataKey="Offline" stackId="1" stroke="#f97316" fill="url(#offlineFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Online" stackId="1" stroke="#0ea5e9" fill="url(#onlineFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Key Findings - the headline callouts, worst first, so the story reads without
              scrolling every card below. */}
          {keyFindings.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <AlertTriangle className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-gray-900">Key Findings</h3>
              </div>
              <ul className="p-4 space-y-2">
                {keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      f.tone === 'bad' ? 'bg-red-500' : f.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cash Control Health */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <Wallet className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-gray-900">Cash Control Health</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Store Cash', health: storeCashHealth },
                  { label: 'Production Cash', health: productionCashHealth },
                ].map(({ label, health }) => {
                  const t = healthTone(health.completionPct);
                  return (
                    <div key={label} className="border border-gray-200 rounded-lg p-3.5">
                      <p className="text-xs font-semibold text-gray-700 mb-2">{label} Reconciled</p>
                      <div className="flex items-end justify-between">
                        <span className={`text-2xl font-bold tabular-nums ${t.text}`}>{health.completionPct}%</span>
                        <span className="text-xs text-gray-500 tabular-nums">{health.reconciledDays}/{health.totalDays} days</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${health.completionPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {[
                { label: 'Store Cash', discrepancies: storeCashHealth.pendingDiscrepancies },
                { label: 'Production Cash', discrepancies: productionCashHealth.pendingDiscrepancies },
              ].map(({ label, discrepancies }) => discrepancies.length > 0 && (
                <div key={label} className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-b border-red-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <p className="text-xs font-semibold text-red-900">{label}: {discrepancies.length} unresolved discrepanc{discrepancies.length === 1 ? 'y' : 'ies'}</p>
                  </div>
                  <div className="divide-y divide-red-100">
                    {discrepancies.map((d, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-gray-700">{d.date}</span>
                        <span className="font-semibold text-red-700 tabular-nums">{formatMoney(Math.abs(d.amount))}</span>
                        <span className="flex items-center gap-1 text-gray-500"><Clock className="w-3 h-3" />{d.ageDays}d open</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {storeCashHealth.pendingDiscrepancies.length === 0 && productionCashHealth.pendingDiscrepancies.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  No unresolved cash discrepancies in this period.
                </div>
              )}

              {/* Cash Over/Short - till gaps (Cash+Paytm vs Net Offline Sales) the store
                  incharge explained with a reason at save time. Never folded into Sales. */}
              {cashOverShortSummary.entries.length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <p className="text-xs font-semibold text-amber-900">Cash Over/Short: {cashOverShortSummary.entries.length} day{cashOverShortSummary.entries.length === 1 ? '' : 's'} this period</p>
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${cashOverShortSummary.netAmount > 0 ? 'text-red-700' : cashOverShortSummary.netAmount < 0 ? 'text-blue-700' : 'text-gray-600'}`}>
                      Net {cashOverShortSummary.netAmount === 0 ? '₹0' : `${cashOverShortSummary.netAmount > 0 ? 'short' : 'over'} ${formatMoney(Math.abs(cashOverShortSummary.netAmount))}`}
                    </span>
                  </div>

                  {/* By-reason breakdown - surfaces a recurring pattern (e.g. "wrong change"
                      happening every week) at a glance. */}
                  <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-white border-b border-amber-100">
                    {Array.from(cashOverShortSummary.byReason.entries()).map(([key, b]) => (
                      <span key={key} className={`text-[11px] font-medium px-2 py-1 rounded-full ${key === 'unexplained' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {key === 'unexplained' ? 'No reason given' : CASH_OVER_SHORT_REASON_LABELS[key] || key} · {b.count}× · {formatMoney(Math.abs(b.total))}
                      </span>
                    ))}
                  </div>

                  <div className="divide-y divide-amber-100 max-h-64 overflow-y-auto">
                    {cashOverShortSummary.entries.map((e, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700">{e.date}</span>
                          <span className={`font-semibold tabular-nums ${e.amount > 0 ? 'text-red-700' : 'text-blue-700'}`}>
                            {e.amount > 0 ? 'short' : 'over'} {formatMoney(Math.abs(e.amount))}
                          </span>
                        </div>
                        <div className="mt-0.5 text-gray-500">
                          {e.reason ? (
                            <>
                              <span className="font-medium text-amber-700">{CASH_OVER_SHORT_REASON_LABELS[e.reason] || e.reason}</span>
                              {e.note ? <span className="italic"> — "{e.note}"</span> : null}
                            </>
                          ) : (
                            <span className="text-red-600 italic">No reason given</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Revenue Completeness */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <Receipt className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-gray-900">Revenue Completeness</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {revenueCompleteness.map((row) => {
                  const t = healthTone(row.coveragePct);
                  return (
                    <div key={row.aggregator} className="border border-gray-200 rounded-lg p-3.5">
                      <p className="text-xs font-semibold text-gray-700 mb-2 capitalize">{row.aggregator} Settlement Coverage</p>
                      <div className="flex items-end justify-between">
                        <span className={`text-2xl font-bold tabular-nums ${t.text}`}>{row.coveragePct}%</span>
                        <span className="text-xs text-gray-500 tabular-nums">{row.totalDaysWithSales - row.pendingDays.length}/{row.totalDaysWithSales} days settled</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${row.coveragePct}%` }} />
                      </div>
                      {row.pendingValue > 0 && (
                        <p className="text-[11px] text-amber-700 font-medium mt-2">{formatMoney(row.pendingValue)} in sales awaiting settlement</p>
                      )}
                      {row.effectiveCommissionPct !== null && (
                        <p className="text-[11px] text-gray-500 mt-1">Effective commission: {row.effectiveCommissionPct.toFixed(1)}% across {row.settlementCount} settlement{row.settlementCount === 1 ? '' : 's'}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {revenueCompleteness.map((row) => row.pendingDays.length > 0 && (
                <div key={row.aggregator} className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-xs font-semibold text-amber-900 capitalize">{row.aggregator}: {row.pendingDays.length} day{row.pendingDays.length === 1 ? '' : 's'} with sales but no settlement yet</p>
                  </div>
                  <div className="px-3 py-2 flex flex-wrap gap-1.5">
                    {row.pendingDays.map((d) => (
                      <span key={d} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-medium tabular-nums">{d}</span>
                    ))}
                  </div>
                </div>
              ))}

              {revenueCompleteness.every((row) => row.pendingDays.length === 0) && (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  Every day with online sales has a matching settlement on file.
                </div>
              )}

              <p className="text-[11px] text-gray-400">
                These figures reflect settlements uploaded up to now - a late settlement for a day in this period will still correct that day once uploaded, and this report will reflect it on next view. Nothing here is locked.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
