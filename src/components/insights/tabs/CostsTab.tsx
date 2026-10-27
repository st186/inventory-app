// Insights > Costs: what the period cost and how big a bite it took of sales. Header figure →
// where the money went (share bars) → the cost lines grouped by kind, each opening its own
// breakdown (items and price trend, salaries, commission, loan interest) → costs as % of sales,
// profit by day, salaries, fixed costs and the margin checks.
import { memo, useMemo } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Landmark, Percent, ShoppingBasket, Target, Users, Wrench, XCircle, Zap, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ShareBars } from '../../ui/chart-theme';
import { ListGroup, ListRow } from '../../ui/list-row';
import { StatGrid, StatTile } from '../../ui/stat-tile';
import { StatusChip } from '../../ui/status-chip';
import { useT } from '../../../utils/i18n';
import { type AnalyticsData } from '../useAnalyticsData';
import { CHART_COLORS, CHART_SERIES, ChartCard, ChartEmpty, TrendChart, deltaOf, inr, pct, pointsDelta, shortPrevLabel } from './shared';

type CostType = 'inventory' | 'overhead' | 'fixed' | 'salary' | 'commission' | 'interest';
const GROUPS: { types: CostType[]; title: string; icon: LucideIcon }[] = [
  { types: ['inventory'], title: 'Food and packaging', icon: ShoppingBasket },
  { types: ['overhead'], title: 'Running costs', icon: Wrench },
  { types: ['fixed'], title: 'Fixed costs and equipment', icon: Building2 },
  { types: ['salary'], title: 'Salaries', icon: Users },
  { types: ['commission', 'interest'], title: 'Platform and financing', icon: Landmark },
];

export const CostsTab = memo(function CostsTab({ d }: { d: AnalyticsData }) {
  const { t, lang } = useT();
  const { setSelectedExpenseCategory, timeFilter, metrics, profitChartData, previousPeriodMetrics, expenseBreakdown, getPeriodLabel } = d;
  const prevLabel = shortPrevLabel(d);
  const total = metrics.totalExpenses;
  const share = (v: number) => pct(v, total);
  const open = (item: any) => {
    const type = item.type as CostType;
    if (type === 'salary') setSelectedExpenseCategory({ category: item.name, items: item.items || [], amount: item.value, type: 'salary' });
    else if (type === 'commission' || type === 'interest') setSelectedExpenseCategory({ category: item.name, items: [], amount: item.value, type });
    else setSelectedExpenseCategory({ category: item.name, items: item.items || [], amount: item.value });
  };
  const top = useMemo(() => [...expenseBreakdown].sort((a: any, b: any) => b.value - a.value), [expenseBreakdown]);
  const shareItems = top.slice(0, 5).map((item: any, i: number) => ({ label: item.name, value: item.value, color: CHART_SERIES[i % 4], valueText: inr(item.value) }));
  const rest = top.slice(5).reduce((s: number, item: any) => s + item.value, 0);
  if (rest > 0) shareItems.push({ label: 'Everything else', value: rest, color: CHART_COLORS.other, valueText: inr(rest) });

  const monthly = timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom';
  const salaryTotal = metrics.contractWorkerExpenses + metrics.permanentEmployeeExpenses;
  const fixedAndEquipment = (metrics.fixedCostsTotal || 0) + (metrics.spreadExpenses || 0);
  const margin = metrics.profitMargin;
  const marginTier = margin > 30 ? { label: 'Excellent', tone: 'success' as const, icon: Target } : margin > 15 ? { label: 'Good', tone: 'success' as const, icon: CheckCircle2 } : margin > 0 ? { label: 'Low', tone: 'warning' as const, icon: AlertTriangle } : { label: 'Loss', tone: 'danger' as const, icon: XCircle };
  const costRatio = metrics.totalRevenue > 0 ? metrics.totalExpenses / metrics.totalRevenue : null;
  const avgDailyProfit = profitChartData.length > 0 ? profitChartData.reduce((s, r) => s + r.profit, 0) / profitChartData.length : null;
  const best = profitChartData.length > 0 ? Math.max(...profitChartData.map((r) => r.profit)) : null;
  const worst = profitChartData.length > 0 ? Math.min(...profitChartData.map((r) => r.profit)) : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-6" lang={lang}>
      <StatTile
        hero
        label={`${t('insights.costs')} · ${getPeriodLabel()}`}
        value={inr(total)}
        delta={deltaOf(total, previousPeriodMetrics.totalExpenses, prevLabel, 'down')}
        caption={`${pct(total, metrics.totalRevenue)} of sales`}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title={t('insights.whereMoneyWent')}>
          {top.length === 0 ? <ChartEmpty title="No costs in this period" /> : <ShareBars items={shareItems} />}
        </ChartCard>
        <ChartCard title="Costs as % of sales" caption="Day by day">
          {profitChartData.length === 0 ? <ChartEmpty /> : (
            <TrendChart
              data={profitChartData.map((r) => ({ ...r, expensePct: r.revenue > 0 ? Math.round((r.expenses / r.revenue) * 1000) / 10 : 0 }))}
              series={[{ key: 'expensePct', name: 'Costs % of sales', color: CHART_COLORS.primary }]}
              format="percent"
              height={200}
              ariaLabel="Costs as a percentage of sales, day by day"
            />
          )}
        </ChartCard>
      </div>

      {GROUPS.map((group) => {
        const rows = expenseBreakdown.filter((item: any) => group.types.includes(item.type));
        if (rows.length === 0) return null;
        return (
          <ListGroup key={group.title} title={group.title} meta={inr(rows.reduce((s: number, r: any) => s + r.value, 0))}>
            {rows.map((item: any) => (
              <ListRow key={item.name} icon={group.icon} title={item.name} subtitle={`${item.percentage}% of costs`} amount={Math.round(item.value)} onClick={() => open(item)} />
            ))}
          </ListGroup>
        );
      })}

      <StatGrid columns={3}>
        <StatTile label="Food and packaging" value={inr(metrics.inventoryExpenses)} caption={`${share(metrics.inventoryExpenses)} of costs`} delta={deltaOf(metrics.inventoryExpenses, previousPeriodMetrics.inventoryExpenses, '', 'down')} />
        <StatTile label="Running costs" value={inr(metrics.overheadExpenses)} caption={`${share(metrics.overheadExpenses)} of costs`} delta={deltaOf(metrics.overheadExpenses, previousPeriodMetrics.overheadExpenses, '', 'down')} />
        <StatTile label="Commission and ads" value={inr(metrics.commissionExpenses + metrics.adSpend)} caption={`${share(metrics.commissionExpenses + metrics.adSpend)} of costs${metrics.adSpend > 0.5 ? ` · ads ${inr(metrics.adSpend)}` : ''}`} delta={deltaOf(metrics.commissionExpenses + metrics.adSpend, previousPeriodMetrics.commissionExpenses + previousPeriodMetrics.adSpend, '', 'down')} />
        <StatTile label="Fixed costs and equipment" value={inr(fixedAndEquipment)} caption={`${share(fixedAndEquipment)} of costs${(metrics.spreadExpenses || 0) > 0 ? ` · incl. ${inr(metrics.spreadExpenses)} equipment spread over its life` : ''}`} delta={deltaOf(fixedAndEquipment, previousPeriodMetrics.fixedCostsTotal, '', 'down')} />
        <StatTile label="Salaries" value={inr(metrics.salaryExpenses)} caption={`${share(metrics.salaryExpenses)} of costs`} delta={deltaOf(metrics.salaryExpenses, previousPeriodMetrics.salaryExpenses, '', 'down')} />
        <StatTile label="Loan interest" value={inr(metrics.interestExpenses || 0)} caption={`${share(metrics.interestExpenses || 0)} of costs`} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard
          title="Profit by day"
          footer={best !== null && worst !== null ? <div className="flex justify-between gap-3"><span>Best day <span className="num font-semibold text-success">{inr(best)}</span></span><span>Worst day <span className="num font-semibold text-danger">{inr(worst)}</span></span></div> : undefined}
        >
          {profitChartData.length === 0 ? <ChartEmpty /> : (
            <TrendChart data={profitChartData} series={[{ key: 'profit', name: 'Profit', color: CHART_COLORS.secondary, kind: 'bar' }]} height={200} ariaLabel="Profit for each day of the period" />
          )}
        </ChartCard>

        <ListGroup title="Margins" footer="Profit here is before any loss brought forward.">
          <ListRow
            icon={marginTier.icon}
            iconTone={marginTier.tone}
            title="Profit margin"
            subtitle={previousPeriodMetrics.totalRevenue > 0 ? `${marginTier.label} · ${pointsDelta(margin, previousPeriodMetrics.profitMargin, prevLabel).text} ${prevLabel}` : marginTier.label}
            trailing={<span className="num text-body-md font-semibold text-text">{margin.toFixed(1)}%</span>}
          />
          <ListRow
            icon={costRatio !== null && costRatio < 0.7 ? CheckCircle2 : AlertTriangle}
            iconTone={costRatio !== null && costRatio < 0.7 ? 'success' : 'warning'}
            title="Cost to sales"
            subtitle={costRatio !== null && costRatio < 0.7 ? 'Efficient' : 'High cost ratio'}
            trailing={<span className="num text-body-md font-semibold text-text">{costRatio !== null ? `${(costRatio * 100).toFixed(1)}%` : '–'}</span>}
          />
          <ListRow title="Average profit a day" subtitle="In the selected period" trailing={<span className="num text-body-md font-semibold text-text">{avgDailyProfit !== null ? inr(avgDailyProfit) : '–'}</span>} />
          {metrics.commissionExpenses > 0 && (
            <ListRow
              title="Commission's bite"
              subtitle={`${inr(metrics.commissionExpenses)} paid to the apps`}
              trailing={<span className="num text-body-md font-semibold text-text">{metrics.totalRevenue > 0 ? pct(metrics.commissionExpenses, metrics.totalRevenue + metrics.commissionExpenses) : '–'}</span>}
            />
          )}
        </ListGroup>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ChartCard title="Salaries" caption={monthly ? 'Payroll payouts for this period' : 'Salaries show in month and custom periods only'}>
          {salaryTotal > 0 ? (
            <ShareBars items={[
              { label: 'Contract workers', value: metrics.contractWorkerExpenses, color: CHART_COLORS.tertiary, valueText: inr(metrics.contractWorkerExpenses) },
              { label: 'Permanent staff', value: metrics.permanentEmployeeExpenses, color: CHART_COLORS.secondary, valueText: inr(metrics.permanentEmployeeExpenses) },
            ]} />
          ) : (
            <ChartEmpty title="No salary payouts in this period" body="Payouts are monthly, so they show under This month, Last month or a custom range." />
          )}
        </ChartCard>

        <ChartCard title="Fixed costs" caption={`${inr(metrics.fixedCostsTotal)} · ${share(metrics.fixedCostsTotal)} of costs`}>
          {metrics.fixedCostsTotal > 0 ? (
            <>
              <TrendChart
                data={[
                  { name: 'Electricity', amount: metrics.electricityExpenses },
                  { name: 'Rent', amount: metrics.rentExpenses },
                  { name: 'Salaries', amount: metrics.salaryExpenses },
                ]}
                series={[{ key: 'amount', name: 'Amount', color: CHART_COLORS.primary, kind: 'bar', cellColors: [CHART_COLORS.tertiary, CHART_COLORS.primary, CHART_COLORS.secondary] }]}
                xKey="name"
                height={180}
                ariaLabel={`Electricity ${inr(metrics.electricityExpenses)}, rent ${inr(metrics.rentExpenses)}, salaries ${inr(metrics.salaryExpenses)}`}
              />
              <div className="flex flex-wrap gap-2">
                <StatusChip icon={Zap}>Electricity {pct(metrics.electricityExpenses, metrics.fixedCostsTotal)} of fixed</StatusChip>
                <StatusChip icon={Home}>Rent {pct(metrics.rentExpenses, metrics.fixedCostsTotal)} of fixed</StatusChip>
                <StatusChip icon={Users}>Salaries {pct(metrics.salaryExpenses, metrics.fixedCostsTotal)} of fixed</StatusChip>
              </div>
            </>
          ) : (
            <ChartEmpty title="No fixed costs logged for this period yet" />
          )}
        </ChartCard>
      </div>
    </div>
  );
});
