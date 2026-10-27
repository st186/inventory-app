// Insights > Per plate (unit economics): the same P&L as the other tabs, laid out as a margin
// ladder by UnitEconomics. The P&L handed to it is built exactly as before.
import { lazy, memo, Suspense } from 'react';
import { getTodayIST } from '../../../utils/timezone';
import { normalizePnl, type PnlBreakdown } from '../../unitEconomicsModel';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';

const UnitEconomics = lazy(() => import('../../UnitEconomics').then((m) => ({ default: m.UnitEconomics })));

export const UnitEconomicsTab = memo(function UnitEconomicsTab({ d }: { d: AnalyticsData }) {
  const { timeFilter, getPeriodLabel, storeOnlineSales, metrics, carryForward, unitEconomicsTrend, itemPerfDateRange, ordersPerDayData, channelFoodValue, fixedCostAccrual, openCostLine, totalCashDiscrepancy, realizedProfit, netRealisedProfit, netNormalizedProfit } = d;
  const software = metrics.spreadByCategory?.software_subscription || 0;
  const inRange = (date: string) => date >= itemPerfDateRange.startDate && date <= itemPerfDateRange.endDate;
  const periodOnline = storeOnlineSales.filter((s: any) => inRange(s.date));
  const zomatoRevenue = periodOnline.reduce((t: number, s: any) => t + (s.zomatoSales || 0), 0);
  const swiggyRevenue = periodOnline.reduce((t: number, s: any) => t + (s.swiggySales || 0), 0);
  const lastDay = itemPerfDateRange.endDate > getTodayIST() ? getTodayIST() : itemPerfDateRange.endDate;
  const daysInPeriod = lastDay >= itemPerfDateRange.startDate
    ? Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${itemPerfDateRange.startDate}T00:00:00Z`)) / 86400000) + 1
    : 0;
  const pnl: PnlBreakdown = {
    revenue: metrics.totalRevenue,
    counterRevenue: metrics.offlineRevenue,
    onlineRevenue: metrics.onlineRevenue,
    zomatoRevenue,
    swiggyRevenue,
    onlineDiscounts: metrics.online.discounts,
    food: metrics.inventoryExpenses - metrics.packagingExpenses,
    packaging: metrics.packagingExpenses,
    commission: metrics.commissionExpenses,
    platformAds: metrics.adSpend,
    marketing: metrics.marketingExpenses,
    staff: metrics.salaryExpenses,
    occupancy: metrics.fixedCostsTotal,
    otherOpex: metrics.overheadExpenses - metrics.marketingExpenses + software,
    depreciation: metrics.spreadExpenses - software,
    interest: metrics.interestExpenses,
    shortages: totalCashDiscrepancy,
    netProfit: realizedProfit,
    estimatedCommission: metrics.online.estimatedCommission + metrics.online.estimatedAds,
    estimatedDays: metrics.online.estimatedDays,
    staffSmoothable: metrics.permanentEmployeeExpenses,
    occupancySmoothable: metrics.rentExpenses + metrics.electricityExpenses,
  };
  const pnlNormalized = fixedCostAccrual ? normalizePnl(pnl, fixedCostAccrual.byGroup) : null;
  const orderTotals = ordersPerDayData.reduce(
    (t, r) => ({ counter: t.counter + r.offline, zomato: t.zomato + r.zomato, swiggy: t.swiggy + r.swiggy }),
    { counter: 0, zomato: 0, swiggy: 0 }
  );
  const byAgg = metrics.online.byAggregator;
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <UnitEconomics
        pnl={pnl}
        periodLabel={getPeriodLabel()}
        daysInPeriod={daysInPeriod}
        netRealisedProfit={netRealisedProfit}
        carryForwardAmount={carryForward.amount}
        showRealised={timeFilter === 'thisMonth' || timeFilter === 'lastMonth'}
        netNormalizedProfit={netNormalizedProfit}
        orders={orderTotals}
        platformCut={{ zomato: byAgg.zomato.commission + byAgg.zomato.ads, swiggy: byAgg.swiggy.commission + byAgg.swiggy.ads }}
        trend={unitEconomicsTrend}
        onOpenLine={openCostLine}
        pnlNormalized={pnlNormalized}
        foodValue={channelFoodValue}
        normalizedEstimate={fixedCostAccrual?.estimatedAmount || 0}
        defaultBasis={lastDay >= getTodayIST() ? 'normalized' : 'paid'}
      />
    </Suspense>
  );
});
