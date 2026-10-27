// Insights > Overview (design review d4, wireframe Insights): the profit that spreads rent and
// salaries over the month (owner decision), with the other profit definitions one tap away; four
// KPIs plus loss tiles only when there is a loss; sales vs costs by day against the last period;
// where sales came from; and the performance tracker.
import { lazy, memo, Suspense, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Info, MoreHorizontal } from 'lucide-react';
import { buildPnl } from '../../../utils/pnl';
import { monthLabel } from '../../../utils/salaryBreakdown';
import { normalizePnl } from '../../unitEconomicsModel';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { CHANNEL_COLORS, ShareBars } from '../../ui/chart-theme';
import { Card } from '../../ui/card';
import { IconButton } from '../../ui/icon-button';
import { ListGroup, ListRow } from '../../ui/list-row';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { StatGrid, StatTile } from '../../ui/stat-tile';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { useT } from '../../../utils/i18n';
import { type AnalyticsData, isInWindow } from '../useAnalyticsData';
import type { EventsSummaryState } from '../eventsSummary';
import { CHART_COLORS, ChartCard, ChartEmpty, TrendChart, deltaOf, inr, legendFor, pct, pointsDelta, shortPrevLabel, periodText } from './shared';

const DataCapture = lazy(() => import('../../DataCapture').then((m) => ({ default: m.DataCapture })));

/** "Net profit" with rent and salaries spread over the month, and the change vs last period. */
function useProfitComparison(d: AnalyticsData) {
  const { salesData, inventoryData, overheadData, fixedCostsData, onlineSalesData, onlinePayoutData, aggregatorSettlements, payoutsData, employeesData, context, onlineLoans, effectiveStoreId, periodRange, previousPeriodRange, accrualFor } = d;
  return useMemo(() => {
    const data = {
      sales: salesData,
      inventory: inventoryData,
      overheads: overheadData,
      fixedCosts: fixedCostsData,
      onlineSales: onlineSalesData || [],
      onlinePayouts: onlinePayoutData || [],
      settlements: aggregatorSettlements || [],
      payouts: payoutsData,
      employees: employeesData,
      stores: context.stores || [],
      loans: onlineLoans,
    };
    // Both periods through the same P&L (utils/pnl.ts) and the same day-by-day spreading
    // (normalizePnl), so the change compares like with like.
    const spread = (start: string, end: string) => {
      const p = buildPnl({ start, end, storeId: effectiveStoreId, data });
      const acc = accrualFor(start, end);
      return acc ? normalizePnl(p, acc.byGroup).netProfit : p.netProfit;
    };
    return {
      current: spread(periodRange.startDate, periodRange.endDate),
      previous: spread(previousPeriodRange.startDate, previousPeriodRange.endDate),
    };
  }, [salesData, inventoryData, overheadData, fixedCostsData, onlineSalesData, onlinePayoutData, aggregatorSettlements, payoutsData, employeesData, context.stores, onlineLoans, effectiveStoreId, periodRange, previousPeriodRange, accrualFor]);
}

export const OverviewTab = memo(function OverviewTab({ d, events, onOpenTab }: { d: AnalyticsData; events?: EventsSummaryState; onOpenTab?: (view: 'profit' | 'expense' | 'cash-reconciliation') => void }) {
  const { t, lang } = useT();
  const {
    context, selectedStoreId, effectiveStoreId, analyticsMode, showActivityLog, setShowActivityLog, timeFilter, getPeriodLabel, metrics, previousPeriodMetrics,
    profitChartDataWithPrev, smoothFixedCosts, updateSmoothFixedCosts, smoothedCosts, carryForward, totalCashDiscrepancy, totalPosSalesDiscrepancy,
    unrealizedProfit, realizedProfit, netRealisedProfit, netNormalizedProfit, normalizedCardNote, storeOnlineSales, periodRange, filteredSalesData, setSelectedExpenseCategory,
  } = d;
  const [infoOpen, setInfoOpen] = useState(false);
  const comparison = useProfitComparison(d);
  const prevLabel = shortPrevLabel(d, lang);

  // The "All" view adds the events' own totals when there are any (events branch, /events/summary).
  const allStores = analyticsMode === 'store' && !effectiveStoreId;
  const ev = allStores && events?.status === 'ready' && events.summary.events.length > 0 ? events.summary : null;
  const heroProfit = netNormalizedProfit + (ev?.profit || 0);
  const sales = metrics.totalRevenue + (ev?.sales || 0);

  const channel = useMemo(() => {
    const inWindow = storeOnlineSales.filter((s: any) => isInWindow(s.date, periodRange));
    const zomato = inWindow.reduce((t: number, s: any) => t + (s.zomatoSales || 0), 0);
    const swiggy = inWindow.reduce((t: number, s: any) => t + (s.swiggySales || 0), 0);
    return { zomato, swiggy, otherOnline: Math.max(0, metrics.onlineRevenue - zomato - swiggy) };
  }, [storeOnlineSales, periodRange, metrics.onlineRevenue]);

  const shortageDays = useMemo(
    () => filteredSalesData.filter((s: any) => s.approvalRequired === false && s.approvedBy && ((s.salesDiscrepancy !== undefined ? s.salesDiscrepancy : s.cashOffset || 0) < 0)).length,
    [filteredSalesData],
  );

  if (showActivityLog) {
    return (
      <div className="flex flex-col gap-4">
        <div className="-ml-2 flex items-center gap-1">
          <IconButton label={t('common.back')} icon={<ArrowLeft />} onClick={() => setShowActivityLog(false)} />
          <h2 className="text-title font-semibold text-text">{t('insights.performanceTracker')}</h2>
        </div>
        <Suspense fallback={<SectionSkeleton minHeight={240} />}>
          <DataCapture context={context} selectedStoreId={selectedStoreId} />
        </Suspense>
      </div>
    );
  }

  const foodPct = metrics.totalRevenue > 0 ? (metrics.inventoryExpenses / metrics.totalRevenue) * 100 : null;
  const prevFoodPct = previousPeriodMetrics.totalRevenue > 0 ? (previousPeriodMetrics.inventoryExpenses / previousPeriodMetrics.totalRevenue) * 100 : null;
  const commissionPct = metrics.matchedOnlineRevenueForCommission > 0 ? (metrics.commissionExpenses / metrics.matchedOnlineRevenueForCommission) * 100 : null;
  const prevCommissionPct = previousPeriodMetrics.matchedOnlineRevenueForCommission > 0 ? (previousPeriodMetrics.commissionExpenses / previousPeriodMetrics.matchedOnlineRevenueForCommission) * 100 : null;
  const chartSeries = [
    { key: 'revenue', name: t('insights.sales'), color: CHART_COLORS.primary },
    { key: 'expenses', name: t('insights.costs'), color: CHART_COLORS.secondary },
    { key: 'prev_revenue', name: `${t('insights.sales')} (${t('insights.lastPeriod').toLowerCase()})`, color: CHART_COLORS.previous, dashed: true },
  ];
  const carryText = carryForward.amount < 0
    ? `After ${inr(carryForward.amount)} loss brought forward (${carryForward.parts.filter((p) => p.profit < 0 || p.carried < 0).map((p) => monthLabel(p.month)).join(', ')})`
    : timeFilter === 'thisMonth' || timeFilter === 'lastMonth' ? 'No loss brought forward' : 'Losses carry forward only on This month and Last month';

  return (
    <div className="flex flex-col gap-4 lg:gap-6" lang={lang}>
      {/* 1. Profit hero */}
      <StatTile
        hero
        label={`${t('insights.netProfit')} · ${periodText(d, lang)}`}
        headerChip={<IconButton size="sm" label={t('insights.howProfit')} icon={<Info />} onClick={() => setInfoOpen(true)} className="-my-2 -mr-2" />}
        value={inr(heroProfit)}
        delta={deltaOf(comparison.current, comparison.previous, prevLabel)}
        caption={`${t('insights.spreadCaption', { pct: sales > 0 ? ((heroProfit / sales) * 100).toFixed(1) : '0' })}${ev ? ` · ${t('insights.inclEvents', { amount: inr(ev.profit) })}` : ''}`}
      />

      {/* 2. KPIs, and loss tiles only when there is a loss */}
      <StatGrid columns={4}>
        <StatTile
          label={t('insights.sales')}
          value={inr(sales)}
          delta={deltaOf(metrics.totalRevenue, previousPeriodMetrics.totalRevenue, '')}
          caption={ev ? t('insights.inclEvents', { amount: inr(ev.sales) }) : undefined}
          onClick={onOpenTab ? () => onOpenTab('profit') : undefined}
        />
        <StatTile
          label={t('insights.foodCost')}
          value={foodPct === null ? '–' : `${foodPct.toFixed(1)}%`}
          delta={foodPct !== null && prevFoodPct !== null ? pointsDelta(foodPct, prevFoodPct, '', 'down') : undefined}
          caption={t('insights.foodTarget')}
          onClick={onOpenTab ? () => onOpenTab('expense') : undefined}
        />
        <StatTile
          label={t('insights.commission')}
          value={inr(metrics.commissionExpenses)}
          delta={commissionPct !== null && prevCommissionPct !== null ? pointsDelta(commissionPct, prevCommissionPct, '', 'down') : undefined}
          caption={commissionPct !== null ? t('insights.commissionCaption', { pct: commissionPct.toFixed(1) }) : t('insights.adCaption')}
          onClick={() => setSelectedExpenseCategory({ category: 'Aggregator Commission', items: [], amount: metrics.commissionExpenses + metrics.adSpend, type: 'commission' })}
        />
        <StatTile
          label={t('insights.adSpend')}
          value={inr(metrics.adSpend)}
          delta={deltaOf(metrics.adSpend, previousPeriodMetrics.adSpend, '', 'down')}
          caption={t('insights.adCaption')}
        />
        {totalCashDiscrepancy > 0 && (
          <StatTile
            tone="danger"
            label={<span className="inline-flex items-center gap-1"><AlertTriangle className="size-4" aria-hidden="true" />{t('insights.cashShort')}</span>}
            value={inr(totalCashDiscrepancy)}
            delta={deltaOf(totalCashDiscrepancy, previousPeriodMetrics.cashDiscrepancy, '', 'down')}
            caption={t('insights.cashShortCaption', { n: shortageDays })}
          />
        )}
        {totalPosSalesDiscrepancy > 0 && (
          <StatTile
            tone="danger"
            label={<span className="inline-flex items-center gap-1"><AlertTriangle className="size-4" aria-hidden="true" />{t('insights.posGap')}</span>}
            value={inr(totalPosSalesDiscrepancy)}
            delta={deltaOf(totalPosSalesDiscrepancy, previousPeriodMetrics.posSalesDiscrepancy, '', 'down')}
            caption={t('insights.posGapCaption')}
          />
        )}
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {/* 3. Sales vs costs, daily */}
        <ChartCard
          title={t('insights.salesVsCosts')}
          legend={legendFor(chartSeries, t('insights.lastPeriod'))}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label={t('insights.chartOptions')} icon={<MoreHorizontal />} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-64 rounded-md border-border bg-surface p-1 shadow-e2">
                <DropdownMenuCheckboxItem
                  checked={smoothFixedCosts}
                  onCheckedChange={(on) => updateSmoothFixedCosts(Boolean(on))}
                  className="min-h-11 text-body-sm text-text"
                >
                  {t('insights.spreadFixed')}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          footer={
            smoothedCosts
              ? `Rent, electricity and salaries are spread over the days of their month${smoothedCosts.estimatedAmount > 0 ? `; ${inr(smoothedCosts.estimatedAmount)} of it estimated from last month` : ''}.`
              : 'Every cost shows on the day it was paid.'
          }
        >
          {profitChartDataWithPrev.length === 0 ? (
            <ChartEmpty />
          ) : (
            <TrendChart
              data={profitChartDataWithPrev}
              series={chartSeries}
              height={220}
              ariaLabel={`Daily sales and costs, ${periodText(d, lang)}: sales ${inr(metrics.totalRevenue)}, costs ${inr(metrics.totalExpenses)}`}
            />
          )}
        </ChartCard>

        {/* 4. Where sales came from */}
        <ChartCard title={t('insights.whereSales')}>
          {sales <= 0 ? (
            <ChartEmpty />
          ) : (
            <ShareBars
              items={[
                { label: t('insights.counter'), value: metrics.offlineRevenue, color: CHANNEL_COLORS.counter, valueText: inr(metrics.offlineRevenue) },
                { label: t('insights.zomato'), value: channel.zomato, color: CHANNEL_COLORS.zomato, valueText: inr(channel.zomato) },
                { label: t('insights.swiggy'), value: channel.swiggy, color: CHANNEL_COLORS.swiggy, valueText: inr(channel.swiggy) },
                ...(channel.otherOnline > 0.5 ? [{ label: t('insights.otherOnline'), value: channel.otherOnline, color: CHART_COLORS.other, valueText: inr(channel.otherOnline) }] : []),
                ...(ev && ev.sales > 0 ? [{ label: t('insights.events'), value: ev.sales, color: CHART_COLORS.tertiary, valueText: inr(ev.sales) }] : []),
              ]}
            />
          )}
        </ChartCard>
      </div>

      {/* 5. Performance tracker */}
      <ListGroup>
        <ListRow icon={Activity} title={t('insights.performanceTracker')} subtitle={t('insights.performanceTrackerSub')} onClick={() => setShowActivityLog(true)} />
      </ListGroup>

      <ResponsiveModal open={infoOpen} onOpenChange={setInfoOpen} title={t('insights.howProfit')} size="detail">
        <div className="flex flex-col gap-4" lang={lang}>
          <p className="text-body-sm text-text-2">
            Three ways of counting the same {getPeriodLabel().toLowerCase()}. They differ only in when rent, electricity and salaries count, and whether losses from earlier months are carried in.
          </p>
          <ListGroup>
            <ListRow
              title="Net profit, rent and salaries spread (shown above)"
              subtitle={`Rent, electricity and permanent salaries count as an even daily share of their month, up to today, so payday doesn't swing the figure. ${normalizedCardNote}.`}
              trailing={<span className="num text-body-md font-semibold text-text">{inr(netNormalizedProfit)}</span>}
            />
            <ListRow
              title="Net profit as paid"
              subtitle="Every cost on the day it was paid, after approved cash shortages."
              trailing={<span className="num text-body-md font-semibold text-text">{inr(realizedProfit)}</span>}
            />
            <ListRow
              title="Net realised profit"
              subtitle={`Net profit as paid, after any loss brought forward from earlier months. ${carryText}.`}
              trailing={<span className="num text-body-md font-semibold text-text">{inr(netRealisedProfit)}</span>}
            />
            <ListRow
              title="Before cash shortages"
              subtitle={`Sales less every cost, before ${inr(totalCashDiscrepancy)} of approved cash shortages.`}
              trailing={<span className="num text-body-md font-semibold text-text">{inr(unrealizedProfit)}</span>}
            />
            {ev && (
              <ListRow
                title="Events"
                subtitle={`Profit from ${ev.events.length} event${ev.events.length === 1 ? '' : 's'} in this period, from their own day closes. Added to the figure above in the All stores view.`}
                trailing={<span className="num text-body-md font-semibold text-text">{inr(ev.profit)}</span>}
              />
            )}
          </ListGroup>
          <Card className="bg-surface-2">
            <p className="text-body-sm text-text-2">
              The change next to the profit compares this period with {prevLabel.replace(/^vs /, '')} ({pct(comparison.current - comparison.previous, Math.abs(comparison.previous))}), both with rent and salaries spread and before any loss brought forward.
            </p>
          </Card>
        </div>
      </ResponsiveModal>
    </div>
  );
});
