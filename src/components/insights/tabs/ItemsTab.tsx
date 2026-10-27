// Insights > Items: which dishes earn (top items, by channel, the ones slipping this week, then
// the per-item table from SalesData) and, on the second view, the daily sales record. A segmented
// choice switches the two (one tab row only).
import { lazy, memo, Suspense, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { CHANNEL_COLORS } from '../../ui/chart-theme';
import { ListGroup, ListRow } from '../../ui/list-row';
import { SegmentedControl } from '../../ui/segmented-control';
import { StatGrid, StatTile } from '../../ui/stat-tile';
import { StatusChip } from '../../ui/status-chip';
import { useT } from '../../../utils/i18n';
import { type AnalyticsData } from '../useAnalyticsData';
import { CHART_COLORS, ChartCard, ChartEmpty, TrendChart, deltaOf, inr, legendFor, pct, shortPrevLabel, periodText, type SeriesSpec } from './shared';

const SalesDataComponent = lazy(() => import('../../SalesData').then((m) => ({ default: m.SalesData })));

export const ItemsTab = memo(function ItemsTab({ d }: { d: AnalyticsData }) {
  const { t, lang } = useT();
  const { context, effectiveStoreId, salesSubView, setSalesSubView, getPeriodLabel, metrics, itemPerformanceData, decliningItems, salesChartData, profitChartData, previousPeriodMetrics, realizedProfit } = d;
  const prevLabel = shortPrevLabel(d, lang);
  const [sub, setSub] = useState<'category' | 'revenue'>(salesSubView);
  const choose = (v: 'category' | 'revenue') => {
    setSub(v);
    setSalesSubView(v);
  };
  const channelSeries: SeriesSpec[] = [
    { key: 'Offline', name: t('insights.counter'), color: CHANNEL_COLORS.counter, kind: 'bar', stack: 'ch' },
    { key: 'Zomato', name: t('insights.zomato'), color: CHANNEL_COLORS.zomato, kind: 'bar', stack: 'ch' },
    { key: 'Swiggy', name: t('insights.swiggy'), color: CHANNEL_COLORS.swiggy, kind: 'bar', stack: 'ch' },
  ];
  const dailySeries: SeriesSpec[] = [
    { key: 'offline', name: t('insights.counter'), color: CHANNEL_COLORS.counter, kind: 'bar', stack: 'a' },
    { key: 'online', name: t('insights.online'), color: CHART_COLORS.quaternary, kind: 'bar', stack: 'a' },
    { key: 'total', name: 'Total', color: CHART_COLORS.primary },
  ];
  const dayCount = profitChartData.length;
  const avgRevenue = dayCount > 0 ? profitChartData.reduce((s, r) => s + r.revenue, 0) / dayCount : 0;
  const avgProfit = dayCount > 0 ? profitChartData.reduce((s, r) => s + r.profit, 0) / dayCount : 0;
  const bestDay = dayCount > 0 ? profitChartData.reduce((best, r) => (r.revenue > best.revenue ? r : best), profitChartData[0]) : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-6" lang={lang}>
      <SegmentedControl
        aria-label={t('insights.itemsView')}
        value={sub}
        onValueChange={choose}
        options={[{ value: 'category', label: t('insights.itemSales') }, { value: 'revenue', label: t('insights.dailySales') }]}
        className="sm:max-w-md"
      />

      {sub === 'category' ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <ChartCard title={t('insights.topItems')} caption={`${periodText(d, lang)} · sales before commission`}>
              {itemPerformanceData.top10.length === 0 ? <ChartEmpty title="No item sales in this period" /> : (
                <TrendChart
                  data={itemPerformanceData.top10}
                  series={[{ key: 'revenue', name: t('insights.sales'), color: CHART_COLORS.primary, kind: 'bar' }]}
                  xKey="name"
                  layout="vertical"
                  height={Math.max(220, itemPerformanceData.top10.length * 32)}
                  categoryWidth={112}
                  ariaLabel={`Top items by sales: ${itemPerformanceData.top10.slice(0, 3).map((i: any) => i.name).join(', ')}`}
                />
              )}
            </ChartCard>
            <ChartCard title={t('insights.topItemsByChannel')} legend={legendFor(channelSeries)}>
              {itemPerformanceData.top10.length === 0 ? <ChartEmpty title="No item sales in this period" /> : (
                <TrendChart
                  data={itemPerformanceData.top10.slice(0, 5)}
                  series={channelSeries}
                  xKey="name"
                  layout="vertical"
                  height={200}
                  categoryWidth={112}
                  ariaLabel="Top five items split by counter, Zomato and Swiggy"
                />
              )}
            </ChartCard>
          </div>

          {decliningItems.length > 0 && (
            <ListGroup title={t('insights.slipping')} meta="Down 10% or more vs last week">
              {decliningItems.map((item) => (
                <ListRow
                  key={item.name}
                  icon={TrendingDown}
                  iconTone="warning"
                  title={item.name}
                  subtitle={`${inr(item.thisWeek)} this week · ${inr(item.lastWeek)} last week`}
                  trailing={<StatusChip tone="danger">{item.changePct}%</StatusChip>}
                />
              ))}
            </ListGroup>
          )}

          <Suspense fallback={<SectionSkeleton />}>
            <SalesDataComponent context={context} selectedStoreId={effectiveStoreId} />
          </Suspense>
        </>
      ) : (
        <>
          <StatGrid columns={4}>
            <StatTile label={t('insights.sales')} value={inr(metrics.totalRevenue)} delta={deltaOf(metrics.totalRevenue, previousPeriodMetrics.totalRevenue, '')} />
            <StatTile label={t('insights.online')} value={inr(metrics.onlineRevenue)} caption={`${pct(metrics.onlineRevenue, metrics.totalRevenue)} of sales`} delta={deltaOf(metrics.onlineRevenue, previousPeriodMetrics.onlineRevenue, '')} />
            <StatTile label={t('insights.counter')} value={inr(metrics.offlineRevenue)} caption={`${pct(metrics.offlineRevenue, metrics.totalRevenue)} of sales`} delta={deltaOf(metrics.offlineRevenue, previousPeriodMetrics.offlineRevenue, '')} />
            <StatTile label="Net profit as paid" value={inr(realizedProfit)} caption={`${pct(realizedProfit, metrics.totalRevenue)} margin`} delta={deltaOf(realizedProfit, previousPeriodMetrics.netProfit, '')} />
          </StatGrid>

          <ChartCard title={t('insights.dailySales')} caption={getPeriodLabel()} legend={legendFor(dailySeries)}>
            {salesChartData.length === 0 ? <ChartEmpty /> : (
              <TrendChart data={salesChartData} series={dailySeries} height={240} ariaLabel={`Daily sales, ${periodText(d, lang)}`} />
            )}
          </ChartCard>

          <ListGroup title="Day by day">
            <ListRow title="Average sales a day" subtitle={`${dayCount} day${dayCount === 1 ? '' : 's'}`} trailing={<span className="num text-body-md font-semibold text-text">{inr(avgRevenue)}</span>} />
            <ListRow title="Average profit a day" subtitle="Rent and salaries as the chart shows them" trailing={<span className="num text-body-md font-semibold text-text">{inr(avgProfit)}</span>} />
            <ListRow title="Best day" subtitle={bestDay ? bestDay.period : 'No sales yet'} trailing={<span className="num text-body-md font-semibold text-text">{bestDay ? inr(bestDay.revenue) : '–'}</span>} />
          </ListGroup>
        </>
      )}
    </div>
  );
});
