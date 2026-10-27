// Insights > Revenue: sales and how they came in. Header figure → sales by channel per day →
// the channel list (commission and ads open their breakdown) → the order patterns (orders a day,
// by hour, service type, order value, discounts, payment modes, cancellations, order sizes).
import { memo, useMemo } from 'react';
import { Megaphone, Percent, Store } from 'lucide-react';
import { CHANNEL_COLORS, ShareBars } from '../../ui/chart-theme';
import { ListGroup, ListRow } from '../../ui/list-row';
import { StatTile } from '../../ui/stat-tile';
import { useT } from '../../../utils/i18n';
import { formatNumberIN } from '../../ui/money';
import { type AnalyticsData, isInWindow } from '../useAnalyticsData';
import { CHART_COLORS, ChartCard, ChartEmpty, FigureRow, TrendChart, deltaOf, inr, legendFor, pct, shortPrevLabel, type SeriesSpec } from './shared';

export const RevenueTab = memo(function RevenueTab({ d }: { d: AnalyticsData }) {
  const { t, lang } = useT();
  const {
    getPeriodLabel, metrics, previousPeriodMetrics, channelMixChartData, commissionAdSpendChartData, storeOnlineSales, periodRange, setSelectedExpenseCategory,
    ordersPerDayData, ordersPerDayChartData, offlineOrdersMedian, onlineOrdersMedian, ordersByHourData, ordersByHourChartData, peakHour, serviceTypeData,
    serviceTypeChartData, avgOrderValueData, avgOrderValueChartData, discountPctData, discountPctChartData, paymentModeBreakdownData, cancellationTrendData,
    cancellationChartData, orderValueHistogramData,
  } = d;
  const prevLabel = shortPrevLabel(d);
  const channel = useMemo(() => {
    const inWindow = storeOnlineSales.filter((s: any) => isInWindow(s.date, periodRange));
    const zomato = inWindow.reduce((sum: number, s: any) => sum + (s.zomatoSales || 0), 0);
    const swiggy = inWindow.reduce((sum: number, s: any) => sum + (s.swiggySales || 0), 0);
    return { zomato, swiggy, other: Math.max(0, metrics.onlineRevenue - zomato - swiggy) };
  }, [storeOnlineSales, periodRange, metrics.onlineRevenue]);
  const openCommission = () =>
    setSelectedExpenseCategory({ category: 'Aggregator Commission', items: [], amount: metrics.commissionExpenses + metrics.adSpend, type: 'commission' });

  const channelSeries: SeriesSpec[] = [
    { key: 'Offline', name: t('insights.counter'), color: CHANNEL_COLORS.counter, kind: 'bar', stack: 'ch' },
    { key: 'Zomato', name: t('insights.zomato'), color: CHANNEL_COLORS.zomato, kind: 'bar', stack: 'ch' },
    { key: 'Swiggy', name: t('insights.swiggy'), color: CHANNEL_COLORS.swiggy, kind: 'bar', stack: 'ch' },
  ];
  const ordersSeries: SeriesSpec[] = [
    { key: 'offline', name: 'Counter orders', color: CHANNEL_COLORS.counter, kind: 'bar' },
    { key: 'zomato', name: 'Zomato orders', color: CHANNEL_COLORS.zomato, kind: 'bar' },
    { key: 'swiggy', name: 'Swiggy orders', color: CHANNEL_COLORS.swiggy, kind: 'bar' },
    { key: 'prev_offline', name: 'Counter (last period)', color: CHANNEL_COLORS.counter, dashed: true },
    { key: 'prev_zomato', name: 'Zomato (last period)', color: CHANNEL_COLORS.zomato, dashed: true },
    { key: 'prev_swiggy', name: 'Swiggy (last period)', color: CHANNEL_COLORS.swiggy, dashed: true },
  ];
  const hourSeries: SeriesSpec[] = [
    { key: 'offline', name: 'Counter (avg a day)', color: CHART_COLORS.primary, kind: 'bar', stack: 'h' },
    { key: 'online', name: 'Online (avg a day)', color: CHART_COLORS.quaternary, kind: 'bar', stack: 'h' },
    { key: 'prev_offline', name: 'Counter (last period)', color: CHART_COLORS.primary, dashed: true },
    { key: 'prev_online', name: 'Online (last period)', color: CHART_COLORS.quaternary, dashed: true },
  ];
  const serviceSeries: SeriesSpec[] = [
    { key: 'DineIn', name: 'Dine-in', color: CHART_COLORS.secondary, kind: 'bar', stack: 's' },
    { key: 'TakeAway', name: 'Takeaway', color: CHART_COLORS.tertiary, kind: 'bar', stack: 's' },
    { key: 'HomeDelivery', name: 'Delivery', color: CHART_COLORS.quaternary, kind: 'bar', stack: 's' },
    { key: 'prev_DineIn', name: 'Dine-in (last period)', color: CHART_COLORS.secondary, dashed: true },
  ];
  const aovSeries: SeriesSpec[] = [
    { key: 'offlineAOV', name: 'Counter', color: CHANNEL_COLORS.counter },
    { key: 'onlineAOV', name: 'Online (Zomato + Swiggy)', color: CHART_COLORS.quaternary },
    { key: 'prev_offlineAOV', name: 'Counter (last period)', color: CHANNEL_COLORS.counter, dashed: true },
    { key: 'prev_onlineAOV', name: 'Online (last period)', color: CHART_COLORS.quaternary, dashed: true },
  ];
  const discountSeries: SeriesSpec[] = [
    { key: 'offlinePct', name: 'Counter', color: CHANNEL_COLORS.counter },
    { key: 'onlinePct', name: 'Online', color: CHART_COLORS.primary },
    { key: 'prev_offlinePct', name: 'Counter (last period)', color: CHANNEL_COLORS.counter, dashed: true },
    { key: 'prev_onlinePct', name: 'Online (last period)', color: CHART_COLORS.primary, dashed: true },
  ];
  const cancelSeries: SeriesSpec[] = [
    { key: 'offlineCancelled', name: 'Counter', color: CHANNEL_COLORS.counter, kind: 'bar', stack: 'c' },
    { key: 'onlineCancelled', name: 'Online', color: CHART_COLORS.primary, kind: 'bar', stack: 'c' },
    { key: 'prev_offlineCancelled', name: 'Counter (last period)', color: CHANNEL_COLORS.counter, dashed: true },
    { key: 'prev_onlineCancelled', name: 'Online (last period)', color: CHART_COLORS.primary, dashed: true },
  ];
  const noOrders = 'No order data for this period yet.';
  const orderTotals = ordersPerDayData.reduce((s, r) => ({ offline: s.offline + r.offline, zomato: s.zomato + r.zomato, swiggy: s.swiggy + r.swiggy, total: s.total + r.total }), { offline: 0, zomato: 0, swiggy: 0, total: 0 });
  const serviceTotal = serviceTypeData.revenueByType.DineIn + serviceTypeData.revenueByType.TakeAway + serviceTypeData.revenueByType.HomeDelivery;

  return (
    <div className="flex flex-col gap-4 lg:gap-6" lang={lang}>
      <StatTile
        hero
        label={`${t('insights.sales')} · ${getPeriodLabel()}`}
        value={inr(metrics.totalRevenue)}
        delta={deltaOf(metrics.totalRevenue, previousPeriodMetrics.totalRevenue, prevLabel)}
        caption={`${t('insights.counter')} ${inr(metrics.offlineRevenue)} · ${t('insights.online')} ${inr(metrics.onlineRevenue)} (${pct(metrics.onlineRevenue, metrics.totalRevenue)})`}
      />

      <ChartCard title={t('insights.salesByChannel')} legend={legendFor(channelSeries)}>
        {channelMixChartData.length === 0 ? <ChartEmpty /> : (
          <TrendChart data={channelMixChartData} series={channelSeries} height={240} ariaLabel={`Sales by channel per day, ${getPeriodLabel()}`} />
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ListGroup title={t('insights.whereSales')}>
          <ListRow icon={Store} title={t('insights.counter')} subtitle={`${pct(metrics.offlineRevenue, metrics.totalRevenue)} of sales · cash and Paytm`} amount={Math.round(metrics.offlineRevenue)} />
          <ListRow title={t('insights.zomato')} leading={<span className="size-9 shrink-0 rounded-md" style={{ backgroundColor: CHANNEL_COLORS.zomato, opacity: 0.85 }} aria-hidden="true" />} subtitle={`${pct(channel.zomato, metrics.totalRevenue)} of sales`} amount={Math.round(channel.zomato)} />
          <ListRow title={t('insights.swiggy')} leading={<span className="size-9 shrink-0 rounded-md" style={{ backgroundColor: CHANNEL_COLORS.swiggy, opacity: 0.85 }} aria-hidden="true" />} subtitle={`${pct(channel.swiggy, metrics.totalRevenue)} of sales`} amount={Math.round(channel.swiggy)} />
          {channel.other > 0.5 && <ListRow title={t('insights.otherOnline')} subtitle="Online sales typed on the day close" amount={Math.round(channel.other)} />}
        </ListGroup>
        <ListGroup title={t('insights.appCosts')}>
          <ListRow
            icon={Percent}
            title={t('insights.commission')}
            subtitle={`${metrics.matchedOnlineRevenueForCommission > 0 ? `${pct(metrics.commissionExpenses, metrics.matchedOnlineRevenueForCommission)} of online, without GST` : 'No settlements yet'}${metrics.online.estimatedCommission > 0.5 ? ` · ${inr(metrics.online.estimatedCommission)} estimated for ${metrics.online.estimatedDays} unsettled day${metrics.online.estimatedDays === 1 ? '' : 's'}` : ''}`}
            amount={Math.round(metrics.commissionExpenses)}
            onClick={openCommission}
          />
          <ListRow icon={Megaphone} title={t('insights.adSpend')} subtitle="Zomato + Swiggy ads, counted in costs" amount={Math.round(metrics.adSpend)} onClick={openCommission} />
        </ListGroup>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Commission %" caption="Of each settlement's sales">
          {commissionAdSpendChartData.length === 0 ? <ChartEmpty title="No settlements in this period" /> : (
            <TrendChart data={commissionAdSpendChartData} series={[{ key: 'commissionPct', name: 'Commission %', color: CHART_COLORS.primary }]} format="percent" height={200} ariaLabel="Commission percentage by settlement" />
          )}
        </ChartCard>
        <ChartCard title="Ad spend" caption="By settlement">
          {commissionAdSpendChartData.length === 0 ? <ChartEmpty title="No settlements in this period" /> : (
            <TrendChart data={commissionAdSpendChartData} series={[{ key: 'adSpend', name: 'Ad spend', color: CHART_COLORS.quaternary, kind: 'bar' }]} height={200} ariaLabel="Ad spend by settlement" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Orders a day"
        caption={`Dashed lines: counter median ${offlineOrdersMedian}, online median ${onlineOrdersMedian}`}
        legend={legendFor(ordersSeries)}
        footer={ordersPerDayData.length > 0 ? (
          <FigureRow items={[
            { label: t('insights.counter'), value: formatNumberIN(orderTotals.offline) },
            { label: t('insights.zomato'), value: formatNumberIN(orderTotals.zomato) },
            { label: t('insights.swiggy'), value: formatNumberIN(orderTotals.swiggy) },
            { label: 'Total', value: formatNumberIN(orderTotals.total) },
          ]} />
        ) : undefined}
      >
        {ordersPerDayData.length === 0 ? <ChartEmpty title={noOrders} /> : (
          <TrendChart
            data={ordersPerDayChartData}
            series={ordersSeries}
            format="number"
            height={240}
            refLines={[{ y: offlineOrdersMedian, color: CHANNEL_COLORS.counter }, { y: onlineOrdersMedian, color: CHART_COLORS.quaternary }]}
            ariaLabel={`Orders a day: ${orderTotals.total} orders in the period`}
          />
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard
          title="Orders by hour"
          caption="3 pm to 10 pm, average orders a day"
          legend={legendFor(hourSeries)}
          footer={peakHour ? <>Busiest: <span className="font-semibold text-text">{peakHour.label}</span>, {formatNumberIN(peakHour.total)} orders a day on average</> : undefined}
        >
          {ordersByHourData.every((h) => h.total === 0) ? <ChartEmpty title="No hourly order data yet" body="This fills in from the POS sync onward." /> : (
            <TrendChart data={ordersByHourChartData} series={hourSeries} xKey="label" format="number" height={220} ariaLabel="Average orders by hour" />
          )}
        </ChartCard>

        <ChartCard title="Dine-in, takeaway and delivery" caption="Orders a day" legend={legendFor(serviceSeries)}>
          {serviceTypeData.trend.length === 0 ? <ChartEmpty title={noOrders} /> : (
            <>
              <TrendChart data={serviceTypeChartData} series={serviceSeries} format="number" height={200} ariaLabel="Orders a day by service type" />
              {serviceTotal > 0 && (
                <ShareBars
                  className="border-t border-border pt-3"
                  items={[
                    { label: 'Dine-in', value: serviceTypeData.revenueByType.DineIn, color: CHART_COLORS.secondary, valueText: inr(serviceTypeData.revenueByType.DineIn) },
                    { label: 'Takeaway', value: serviceTypeData.revenueByType.TakeAway, color: CHART_COLORS.tertiary, valueText: inr(serviceTypeData.revenueByType.TakeAway) },
                    { label: 'Delivery', value: serviceTypeData.revenueByType.HomeDelivery, color: CHART_COLORS.quaternary, valueText: inr(serviceTypeData.revenueByType.HomeDelivery) },
                  ]}
                />
              )}
            </>
          )}
        </ChartCard>

        <ChartCard title="Average order value" legend={legendFor(aovSeries)}>
          {avgOrderValueData.length === 0 ? <ChartEmpty title={noOrders} /> : (
            <TrendChart data={avgOrderValueChartData} series={aovSeries} height={200} ariaLabel="Average order value a day" />
          )}
        </ChartCard>

        <ChartCard title="Discount, % of gross sales" legend={legendFor(discountSeries)}>
          {discountPctData.length === 0 ? <ChartEmpty title={noOrders} /> : (
            <TrendChart data={discountPctChartData} series={discountSeries} format="percent" height={200} ariaLabel="Discount as a percentage of gross sales" />
          )}
        </ChartCard>

        <ChartCard title="Payment modes" caption="For insight only, not a reconciliation total">
          {paymentModeBreakdownData.length === 0 ? <ChartEmpty title="No payment-mode data yet" body="This fills in from the POS sync onward." /> : (
            <ShareBars items={paymentModeBreakdownData.map((m) => ({ label: m.name, value: m.value, color: m.color, valueText: inr(m.value) }))} />
          )}
        </ChartCard>

        <ChartCard
          title="Cancellations"
          legend={legendFor(cancelSeries)}
          footer={cancellationTrendData.length > 0 ? <>Value cancelled: <span className="num font-semibold text-danger">{inr(cancellationTrendData.reduce((s, r) => s + r.cancelledAmount, 0))}</span></> : undefined}
        >
          {cancellationTrendData.length === 0 ? <ChartEmpty /> : (
            <TrendChart data={cancellationChartData} series={cancelSeries} format="number" height={200} ariaLabel="Cancelled orders a day" />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Order sizes"
        caption="How many orders fall in each value band, this period and the one before"
        legend={[{ label: 'This period', color: CHART_COLORS.primary, shape: 'square' }, { label: 'Last period', color: CHART_COLORS.previous, shape: 'square' }]}
        footer={orderValueHistogramData.currentTotalOrders > 0 ? (
          <FigureRow items={[
            { label: 'Orders', value: formatNumberIN(orderValueHistogramData.currentTotalOrders) },
            { label: 'Average', value: inr(orderValueHistogramData.avgOrderValue) },
            { label: 'Most common', value: orderValueHistogramData.modalBucket.label },
          ]} />
        ) : undefined}
      >
        {orderValueHistogramData.currentTotalOrders === 0 ? <ChartEmpty title={noOrders} /> : (
          <TrendChart
            data={orderValueHistogramData.rows}
            series={[{ key: 'current', name: 'This period', color: CHART_COLORS.primary, kind: 'bar' }, { key: 'previous', name: 'Last period', color: CHART_COLORS.previous, kind: 'bar' }]}
            xKey="label"
            format="number"
            height={240}
            ariaLabel={`Order value bands: most common ${orderValueHistogramData.modalBucket.label}`}
          />
        )}
      </ChartCard>
    </div>
  );
});
