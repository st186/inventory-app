import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Info, Receipt, Wallet } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as api from '../utils/api';
import { InventoryContextType, SalesData } from '../App';
import { DatePicker } from './DatePicker';
import { getTodayIST } from '../utils/timezone';
import { settlementDueBy } from '../utils/payoutSchedule';
import { buildPnl, pnlCosts } from '../utils/pnl';
import { monthPeriod, customPeriod, previousPeriod, datesInRange } from '../utils/reportPeriods';
import { monthAdd } from '../utils/salaryBreakdown';
import { hasRealCashCount } from '../utils/cashCount';
import { buildOnlineCostIndex } from '../utils/onlineCosts';
import { settlementOrderDates } from '../utils/reports/ledgers';
import { ListGroup, ListRow, IconWell } from './ui/list-row';
import { StatTile, StatGrid } from './ui/stat-tile';
import { StatusChip, type StatusTone } from './ui/status-chip';
import { SegmentedControl } from './ui/segmented-control';
import { EmptyState } from './ui/empty-state';
import { Money } from './ui/money';
import { Delayed, SkeletonChart, SkeletonStatTile, SkeletonStatTiles } from './ui/skeleton';
import { CHART_COLORS, ChartLegendChips, ChartTooltipCard, chartAreaFillOpacity, chartAxisProps, chartCursor, chartGridProps } from './ui/chart-theme';
import { cn } from './ui/utils';

interface Props {
  context: InventoryContextType;
  selectedStoreId?: string | null;
}

type Period = 'thisMonth' | 'lastMonth' | 'custom';

// IST calendar dates throughout - a device clock in local time rolls the day at the wrong moment.
const todayISO = getTodayIST;
const daysBetweenInclusive = datesInRange;

function daysAgo(dateStr: string): number {
  const then = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  const now = new Date(todayISO() + 'T00:00:00');
  return Math.round((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

// Completion and coverage: 90 % and up is fine, 70 % and up needs a look, below is bad.
function healthTone(pct: number): { tone: StatusTone; bar: string; word: string } {
  if (pct >= 90) return { tone: 'success', bar: 'bg-success', word: 'On track' };
  if (pct >= 70) return { tone: 'warning', bar: 'bg-warning', word: 'Needs a look' };
  return { tone: 'danger', bar: 'bg-danger', word: 'Behind' };
}

function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

function scoreTone(score: number): { tone: StatusTone; bar: string; label: string } {
  if (score >= 90) return { tone: 'success', bar: 'bg-success', label: 'Excellent' };
  if (score >= 75) return { tone: 'success', bar: 'bg-success', label: 'Good' };
  if (score >= 55) return { tone: 'warning', bar: 'bg-warning', label: 'Needs attention' };
  return { tone: 'danger', bar: 'bg-danger', label: 'Critical' };
}

/** A thin completion bar under a percentage (the word next to it carries the meaning). */
function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <div className={cn('h-full rounded-full', className)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

const FINDING = {
  bad: { tone: 'danger' as const, icon: AlertTriangle },
  warn: { tone: 'warning' as const, icon: AlertTriangle },
  good: { tone: 'success' as const, icon: CheckCircle2 },
};

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
  const [employees, setEmployees] = useState<api.Employee[]>([]);
  const [loans, setLoans] = useState<api.OnlineLoan[]>([]);
  const [loading, setLoading] = useState(true);

  const accessToken = context.user?.accessToken || '';
  const targetProductionHouseId = context.productionHouses?.[0]?.id;

  const reportPeriod = useMemo(() => {
    const thisMonth = todayISO().slice(0, 7);
    if (period === 'thisMonth') return monthPeriod(thisMonth);
    if (period === 'lastMonth') return monthPeriod(monthAdd(thisMonth, -1));
    return customPeriod(customRange.from || todayISO(), customRange.to || todayISO());
  }, [period, customRange]);
  const rangeStart = reportPeriod.start;
  const rangeEnd = reportPeriod.dataEnd;

  // The previous period for every trend arrow: last month for a month (only as many days as
  // this one has so far while it's running), or the same number of days before a custom range.
  const { prevStart, prevEnd } = useMemo(() => {
    const prev = previousPeriod(reportPeriod);
    return { prevStart: prev.start, prevEnd: prev.dataEnd };
  }, [reportPeriod]);

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
      // Archived employees too: a released employee's salaries still count in the months they worked.
      Promise.all([api.getEmployees(), api.getArchivedEmployees().catch(() => [])]).then(([a, b]) => [...(a || []), ...(b || [])]),
      api.getOnlineLoans(accessToken).catch(() => []),
    ])
      .then(([sales, prodCash, allPayouts, allEmployees, allLoans]) => {
        if (cancelled) return;
        setSalesData(sales);
        setProductionCash(prodCash);
        setPayouts(allPayouts);
        setEmployees(allEmployees);
        setLoans(allLoans);
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

  // Settlements that pay for orders in this period, judged by their orders' own dates - the
  // stored period isn't reliable (July's daily Zomato files all say 1-31 Jul), same rule as
  // the Settlement check on the Sales screen.
  const scopedSettlements = useMemo(() => {
    return (context.aggregatorSettlements || []).filter((s) =>
      inScope(s.storeId) && settlementOrderDates(s).some((d) => d >= rangeStart && d <= rangeEnd)
    );
  }, [context.aggregatorSettlements, selectedStoreId, rangeStart, rangeEnd]);

  const periodDays = useMemo(() => daysBetweenInclusive(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  // ---- This Period at a Glance: real ₹ magnitude behind every process metric below, plus
  // the trend vs. an equal-length previous period - a compliance % means little without the
  // revenue/cost scale it sits on top of. ----
  const financials = useMemo(() => {
    // The same profit and loss as Analytics and the exports (utils/pnl.ts): fixed costs, spread
    // equipment, salaries by the month they cover, settlement-based commission, interest and
    // approved shortages all included.
    const data = {
      sales: salesData || [],
      inventory: context.inventory || [],
      overheads: context.overheads || [],
      fixedCosts: context.fixedCosts || [],
      onlineSales: context.onlineSalesData || [],
      onlinePayouts: context.onlinePayoutData || [],
      settlements: context.aggregatorSettlements || [],
      payouts,
      employees,
      stores: context.stores || [],
      loans,
    };
    const computeFor = (start: string, end: string) => {
      const p = buildPnl({ start, end, storeId: selectedStoreId || null, data });
      return { revenue: p.revenue, offlineRevenue: p.counterRevenue, onlineRevenue: p.onlineRevenue, costs: pnlCosts(p), profit: p.netProfit };
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
  }, [salesData, context.inventory, context.overheads, context.fixedCosts, context.onlineSalesData, context.onlinePayoutData, context.aggregatorSettlements, context.stores, payouts, employees, loans, rangeStart, rangeEnd, prevStart, prevEnd, selectedStoreId]);

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
    // A day is covered when a settlement includes orders from it, or an old manual payout entry
    // exists for it (utils/onlineCosts.ts and SettlementCoverage.tsx use the same rule).
    const index = buildOnlineCostIndex(context.aggregatorSettlements || [], selectedStoreId || null);
    const manualDays = new Set((context.onlinePayoutData || []).filter((p) => inScope(p.storeId)).map((p) => p.date));
    return (['zomato', 'swiggy'] as const).map((aggregator) => {
      const coveredDays = new Set<string>([...index.covered[aggregator], ...manualDays]);

      const salesField = aggregator === 'zomato' ? 'zomatoSales' : 'swiggySales';
      const dailyOnlineSales = new Map<string, number>();
      (context.onlineSalesData || []).filter((s) => inScope(s.storeId)).forEach((s) => {
        dailyOnlineSales.set(s.date, (dailyOnlineSales.get(s.date) || 0) + ((s as any)[salesField] || 0));
      });

      // A day only needs a settlement if there was actual sales activity for THIS
      // aggregator that day - no sales means nothing to settle, not a gap.
      const daysWithOnlineSales = periodDays.filter((day) => (dailyOnlineSales.get(day) || 0) > 0);
      // And only once its payout date has passed (utils/payoutSchedule.ts) - the last few days
      // simply haven't been paid yet, so they're counted separately, not as gaps.
      const today = getTodayIST();
      const unsettled = daysWithOnlineSales.filter((d) => !coveredDays.has(d));
      const pendingDays = unsettled.filter((d) => today > settlementDueBy(aggregator, d));
      const notDueDays = unsettled.filter((d) => today <= settlementDueBy(aggregator, d));
      const pendingValue = pendingDays.reduce((sum, d) => sum + (dailyOnlineSales.get(d) || 0), 0);
      const notDueValue = notDueDays.reduce((sum, d) => sum + (dailyOnlineSales.get(d) || 0), 0);
      const dueDayCount = daysWithOnlineSales.length - notDueDays.length;
      const settlements = scopedSettlements.filter((s) => s.aggregator === aggregator);
      const totalGross = settlements.reduce((sum, s) => sum + (s.grossSales || 0), 0);
      const totalCommission = settlements.reduce((sum, s) => sum + (s.netCommission || 0), 0);
      const effectiveCommissionPct = totalGross > 0 ? (totalCommission / totalGross) * 100 : null;

      return {
        aggregator,
        totalDaysWithSales: dueDayCount,
        pendingDays,
        pendingValue,
        notDueDays,
        notDueValue,
        coveragePct: dueDayCount > 0 ? Math.round(((dueDayCount - pendingDays.length) / dueDayCount) * 100) : 100,
        settlementCount: settlements.length,
        effectiveCommissionPct,
      };
    });
  }, [scopedSettlements, context.aggregatorSettlements, context.onlinePayoutData, context.onlineSalesData, periodDays, selectedStoreId]);

  // ---- Cash Control Health: Store Cash + Production Cash reconciliation completion, and
  // every discrepancy still sitting unresolved, with its age. ----
  const storeCashHealth = useMemo(() => {
    // Only count days up to and including today - a future day in the selected range was
    // never going to have a count yet, and shouldn't drag the completion % down.
    const eligibleDays = periodDays.filter((d) => d <= todayISO());
    // The POS sync creates each day's record with a 0 cash count, so only a count a person
    // actually saved makes a day reconciled.
    const reconciledDays = eligibleDays.filter((d) => scopedSales.some((s) => s.date === d && hasRealCashCount(s)));
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
  const hasSales = dailyRevenueSeries.some((d) => d.Offline > 0 || d.Online > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Verdict first: the composite score, then the period */}
      <StatTile
        hero
        label="Audit score"
        value={loading ? '–' : auditScore}
        headerChip={loading ? undefined : <StatusChip tone={tone.tone}>{tone.label}</StatusChip>}
        caption={<span className="num">Cash control, settlements and profit · {rangeStart} to {rangeEnd}</span>}
        loading={loading}
      >
        {!loading && <Bar pct={auditScore} className={tone.bar} />}
      </StatTile>

      <div className="flex flex-col gap-3">
        <SegmentedControl
          aria-label="Period"
          value={period}
          onValueChange={setPeriod}
          options={[{ value: 'thisMonth', label: 'This month' }, { value: 'lastMonth', label: 'Last month' }, { value: 'custom', label: 'Custom' }]}
        />
        {period === 'custom' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DatePicker label="From" className="w-full" value={customRange.from} onChange={(d) => setCustomRange({ ...customRange, from: d })} />
            <DatePicker label="To" className="w-full" value={customRange.to} onChange={(d) => setCustomRange({ ...customRange, to: d })} />
          </div>
        )}
      </div>

      {loading ? (
        <Delayed>
          <div className="flex flex-col gap-5">
            <SkeletonStatTiles count={4} />
            <SkeletonChart />
            <SkeletonStatTile />
          </div>
        </Delayed>
      ) : (
        <>
          {/* This period at a glance - the money behind every process metric below, with the
              change against an equal-length previous period. */}
          <section className="flex flex-col gap-3" aria-label="This period at a glance">
            <h2 className="text-subtitle font-semibold text-text">This period at a glance</h2>
            <StatGrid columns={4}>
              {[
                { label: 'Revenue', value: financials.revenue, changePct: financials.revenueChangePct, invertGood: false },
                { label: 'Costs', value: financials.costs, changePct: financials.costsChangePct, invertGood: true },
                { label: 'Net profit', value: financials.profit, changePct: financials.profitChangePct, invertGood: false },
              ].map((kpi) => (
                <StatTile
                  key={kpi.label}
                  label={kpi.label}
                  value={formatMoney(kpi.value)}
                  tone={kpi.label === 'Net profit' && kpi.value < 0 ? 'danger' : 'default'}
                  delta={{ value: Math.abs(kpi.changePct) < 0.5 ? 0 : kpi.changePct, label: 'vs previous', goodWhen: kpi.invertGood ? 'down' : 'up' }}
                />
              ))}
              <StatTile
                label="Profit margin"
                value={`${financials.margin.toFixed(1)}%`}
                tone={financials.margin < 0 ? 'danger' : 'default'}
                caption={<span className="num">Counter {formatMoney(financials.offlineRevenue)} · Online {formatMoney(financials.onlineRevenue)}</span>}
              />
            </StatGrid>

            {/* Daily revenue - the shape behind the totals (a steady climb reads very
                differently from one huge day propping up a flat month). */}
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <span className="text-subtitle font-semibold text-text">Daily revenue</span>
              {hasSales ? (
                <>
                  <ChartLegendChips items={[{ label: 'Counter', color: CHART_COLORS.primary, shape: 'square' }, { label: 'Online', color: CHART_COLORS.secondary, shape: 'square' }]} />
                  <div role="img" aria-label={`Daily revenue from ${rangeStart} to ${rangeEnd}: ${formatMoney(financials.revenue)} in total`}>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={dailyRevenueSeries} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="label" {...chartAxisProps} interval="preserveStartEnd" minTickGap={24} />
                        <YAxis {...chartAxisProps} width={52} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                        <Tooltip content={<ChartTooltipCard money />} cursor={chartCursor} />
                        <Area type="monotone" dataKey="Offline" name="Counter" stackId="1" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={chartAreaFillOpacity} strokeWidth={2} />
                        <Area type="monotone" dataKey="Online" stackId="1" stroke={CHART_COLORS.secondary} fill={CHART_COLORS.secondary} fillOpacity={chartAreaFillOpacity} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <EmptyState compact title="No sales in this period" body="The chart fills in once sales are entered." />
              )}
            </div>
          </section>

          {/* Key findings - the headline points, worst first */}
          {keyFindings.length > 0 && (
            <ListGroup title="Key findings">
              {keyFindings.map((f, i) => (
                <ListRow key={i} leading={<IconWell icon={FINDING[f.tone].icon} tone={FINDING[f.tone].tone} />} title={<span className="font-normal">{f.text}</span>} />
              ))}
            </ListGroup>
          )}

          {/* Cash control health */}
          <section className="flex flex-col gap-3" aria-label="Cash control">
            <h2 className="flex items-center gap-2 text-subtitle font-semibold text-text"><Wallet className="size-5 text-text-2" aria-hidden="true" />Cash control</h2>
            <StatGrid>
              {[
                { label: 'Store cash counted', health: storeCashHealth },
                { label: 'Production cash counted', health: productionCashHealth },
              ].map(({ label, health }) => {
                const h = healthTone(health.completionPct);
                return (
                  <StatTile
                    key={label}
                    label={label}
                    value={`${health.completionPct}%`}
                    chip={<StatusChip tone={h.tone}>{h.word}</StatusChip>}
                    caption={<span className="num">{health.reconciledDays}/{health.totalDays} days</span>}
                  >
                    <Bar pct={health.completionPct} className={h.bar} />
                  </StatTile>
                );
              })}
            </StatGrid>

            {[
              { label: 'Store cash', discrepancies: storeCashHealth.pendingDiscrepancies },
              { label: 'Production cash', discrepancies: productionCashHealth.pendingDiscrepancies },
            ].map(({ label, discrepancies }) => discrepancies.length > 0 && (
              <ListGroup key={label} overline={`${label}: ${discrepancies.length} waiting for approval`}>
                {discrepancies.map((d, i) => (
                  <ListRow
                    key={i}
                    density="compact"
                    leading={<IconWell icon={Clock} tone="danger" />}
                    title={<span className="num">{d.date}</span>}
                    subtitle={`Open ${d.ageDays} day${d.ageDays === 1 ? '' : 's'}`}
                    trailing={<Money value={Math.abs(d.amount)} className="text-body-md font-semibold text-danger" />}
                  />
                ))}
              </ListGroup>
            ))}

            {storeCashHealth.pendingDiscrepancies.length === 0 && productionCashHealth.pendingDiscrepancies.length === 0 && (
              <p className="flex items-center gap-1.5 px-1 text-body-sm text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> No cash differences waiting for approval in this period.
              </p>
            )}

            {/* Cash over/short - till gaps the store incharge explained with a reason when
                saving. Never folded into sales. */}
            {cashOverShortSummary.entries.length > 0 && (
              <ListGroup
                title="Cash over and short"
                meta={`${cashOverShortSummary.entries.length} day${cashOverShortSummary.entries.length === 1 ? '' : 's'} · net ${cashOverShortSummary.netAmount === 0 ? '₹0' : `${cashOverShortSummary.netAmount > 0 ? 'short' : 'over'} ${formatMoney(Math.abs(cashOverShortSummary.netAmount))}`}`}
              >
                {/* By reason - shows a pattern (e.g. "wrong change" every week) at a glance. */}
                <div className="flex flex-wrap gap-1.5 px-4 py-3">
                  {Array.from(cashOverShortSummary.byReason.entries()).map(([key, b]) => (
                    <StatusChip key={key} tone={key === 'unexplained' ? 'danger' : 'warning'}>
                      <span className="num">{key === 'unexplained' ? 'No reason given' : CASH_OVER_SHORT_REASON_LABELS[key] || key} · {b.count}× · {formatMoney(Math.abs(b.total))}</span>
                    </StatusChip>
                  ))}
                </div>
                {cashOverShortSummary.entries.map((e, i) => (
                  <ListRow
                    key={i}
                    density="compact"
                    title={<span className="num">{e.date}</span>}
                    subtitle={e.reason ? `${CASH_OVER_SHORT_REASON_LABELS[e.reason] || e.reason}${e.note ? ` - "${e.note}"` : ''}` : 'No reason given'}
                    trailing={
                      <span className={cn('num text-body-md font-semibold', e.amount > 0 ? 'text-danger' : 'text-info')}>
                        {e.amount > 0 ? 'short' : 'over'} {formatMoney(Math.abs(e.amount))}
                      </span>
                    }
                  />
                ))}
              </ListGroup>
            )}
          </section>

          {/* Revenue completeness */}
          <section className="flex flex-col gap-3" aria-label="Online settlements">
            <h2 className="flex items-center gap-2 text-subtitle font-semibold text-text"><Receipt className="size-5 text-text-2" aria-hidden="true" />Online settlements</h2>
            <StatGrid>
              {revenueCompleteness.map((row) => {
                const h = healthTone(row.coveragePct);
                const name = row.aggregator === 'zomato' ? 'Zomato' : 'Swiggy';
                return (
                  <StatTile
                    key={row.aggregator}
                    label={`${name} settled`}
                    value={`${row.coveragePct}%`}
                    chip={<StatusChip tone={h.tone}>{h.word}</StatusChip>}
                    caption={
                      <span className="flex flex-col gap-0.5">
                        <span className="num">{row.totalDaysWithSales - row.pendingDays.length}/{row.totalDaysWithSales} days settled</span>
                        {row.pendingValue > 0 && <span className="num text-warning">{formatMoney(row.pendingValue)} past the payout date, no settlement</span>}
                        {row.notDueValue > 0 && <span className="num">{formatMoney(row.notDueValue)} from the last {row.notDueDays.length} day{row.notDueDays.length === 1 ? '' : 's'} not paid out yet</span>}
                        {row.effectiveCommissionPct !== null && <span className="num">Commission {row.effectiveCommissionPct.toFixed(1)}% over {row.settlementCount} settlement{row.settlementCount === 1 ? '' : 's'}</span>}
                      </span>
                    }
                  >
                    <Bar pct={row.coveragePct} className={h.bar} />
                  </StatTile>
                );
              })}
            </StatGrid>

            {revenueCompleteness.map((row) => row.pendingDays.length > 0 && (
              <ListGroup key={row.aggregator} overline={`${row.aggregator === 'zomato' ? 'Zomato' : 'Swiggy'}: ${row.pendingDays.length} day${row.pendingDays.length === 1 ? '' : 's'} with no settlement on file`}>
                <div className="flex flex-wrap gap-1.5 px-4 py-3">
                  {row.pendingDays.map((d) => (
                    <StatusChip key={d} tone="warning"><span className="num">{d}</span></StatusChip>
                  ))}
                </div>
              </ListGroup>
            ))}

            {revenueCompleteness.every((row) => row.pendingDays.length === 0) && (
              <p className="flex items-center gap-1.5 px-1 text-body-sm text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> Every day with online sales that should be paid by now has a settlement on file.
              </p>
            )}

            <p className="flex items-start gap-1.5 px-1 text-caption text-text-3">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              These figures use the settlements uploaded so far. A late settlement for a day in this period corrects that day once it is uploaded; nothing here is locked.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
