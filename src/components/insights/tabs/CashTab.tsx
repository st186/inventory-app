// Insights > Cash (and Money > Cash & Paytm): approved cash and Paytm shortages over the period.
// Header figure → the daily cash/Paytm offsets → the stores with losses (All stores only).
import { memo } from 'react';
import { Store } from 'lucide-react';
import { ListGroup, ListRow } from '../../ui/list-row';
import { StatGrid, StatTile } from '../../ui/stat-tile';
import { useT } from '../../../utils/i18n';
import { type AnalyticsData } from '../useAnalyticsData';
import { CHART_COLORS, ChartCard, ChartEmpty, TrendChart, deltaOf, inr, legendFor, shortPrevLabel, type SeriesSpec } from './shared';

export const CashTab = memo(function CashTab({ d }: { d: AnalyticsData }) {
  const { t, lang } = useT();
  const { effectiveStoreId, getPeriodLabel, previousPeriodMetrics, cashReconciliationChartData, cashReconciliationByStore, totalCashDiscrepancy, realizedProfit, totalPosSalesDiscrepancy } = d;
  const prevLabel = shortPrevLabel(d);
  const paytmShort = cashReconciliationChartData.reduce((s, r) => s + (r['Paytm Offset'] < 0 ? Math.abs(r['Paytm Offset']) : 0), 0);
  const series: SeriesSpec[] = [
    { key: 'Cash Offset', name: 'Cash', color: CHART_COLORS.secondary, kind: 'bar' },
    { key: 'Paytm Offset', name: 'Paytm', color: CHART_COLORS.tertiary, kind: 'bar' },
  ];
  return (
    <div className="flex flex-col gap-4 lg:gap-6" lang={lang}>
      <StatTile
        hero
        tone={totalCashDiscrepancy > 0 ? 'danger' : 'default'}
        label={`${t('insights.cashShort')} · ${getPeriodLabel()}`}
        value={inr(totalCashDiscrepancy)}
        delta={deltaOf(totalCashDiscrepancy, previousPeriodMetrics.cashDiscrepancy, prevLabel, 'down')}
        caption="Approved cash shortages at day close"
      />
      <StatGrid columns={3}>
        <StatTile tone={paytmShort > 0 ? 'danger' : 'default'} label="Paytm short" value={inr(paytmShort)} delta={deltaOf(paytmShort, previousPeriodMetrics.paytmDiscrepancy, '', 'down')} caption="Shortfalls in the period" />
        <StatTile tone={totalPosSalesDiscrepancy > 0 ? 'danger' : 'default'} label={t('insights.posGap')} value={inr(totalPosSalesDiscrepancy)} delta={deltaOf(totalPosSalesDiscrepancy, previousPeriodMetrics.posSalesDiscrepancy, '', 'down')} caption={t('insights.posGapCaption')} />
        <StatTile label="Net profit as paid" value={inr(realizedProfit)} delta={deltaOf(realizedProfit, previousPeriodMetrics.netProfit, '')} caption="After the shortages" />
      </StatGrid>

      <ChartCard title="Cash and Paytm, over or short" caption={`Above zero = extra, below = short · ${effectiveStoreId ? 'this store' : 'all stores'}`} legend={legendFor(series)}>
        {cashReconciliationChartData.length === 0 ? <ChartEmpty title="No sales in this period" /> : (
          <TrendChart data={cashReconciliationChartData} series={series} height={240} ariaLabel={`Daily cash and Paytm differences: cash short ${inr(totalCashDiscrepancy)}, Paytm short ${inr(paytmShort)}`} />
        )}
      </ChartCard>

      {!effectiveStoreId && cashReconciliationByStore.length > 0 && (
        <ListGroup title="Stores with shortages" meta="Worst first">
          {cashReconciliationByStore.map((row) => (
            <ListRow key={row.storeId} icon={Store} iconTone="danger" title={row.storeName} subtitle={`Cash ${inr(row.cashLoss)} · Paytm ${inr(row.paytmLoss)}`} amount={Math.round(row.totalLoss)} />
          ))}
        </ListGroup>
      )}
    </div>
  );
});
