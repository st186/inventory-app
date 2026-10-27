// Insights > UnitEconomics tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { lazy, Suspense } from 'react';
import { Percent } from 'lucide-react';
import { getTodayIST } from '../../../utils/timezone';
import { normalizePnl, type PnlBreakdown } from '../../unitEconomicsModel';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';
import { TimeFilterBar } from './shared';

const UnitEconomics = lazy(() => import('../../UnitEconomics').then((m) => ({ default: m.UnitEconomics })));

export function UnitEconomicsTab({ d }: { d: AnalyticsData }) {
 const { timeFilterChoice, setTimeFilterChoice, timeFilter, customDateRange, setDateRange, getPeriodLabel, storeOnlineSales, metrics, carryForward, unitEconomicsTrend, itemPerfDateRange, ordersPerDayData, channelFoodValue, fixedCostAccrual, openCostLine, totalCashDiscrepancy, realizedProfit, netRealisedProfit, netNormalizedProfit } = d;
 return (
 <>
 {(() => {
 const software = metrics.spreadByCategory?.software_subscription || 0;
 const inRange = (d: string) => d >= itemPerfDateRange.startDate && d <= itemPerfDateRange.endDate;
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
 (t, d) => ({ counter: t.counter + d.offline, zomato: t.zomato + d.zomato, swiggy: t.swiggy + d.swiggy }),
 { counter: 0, zomato: 0, swiggy: 0 }
 );
 const byAgg = metrics.online.byAggregator;
 return (
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/30 flex-shrink-0">
 <Percent className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Unit Economics</h2>
 <p className="text-xs sm:text-sm text-gray-500">Gross margin, CM1-CM3, EBITDA and net margin - how much of every ₹100 we keep at each step</p>
 </div>
 </div>
 <div className="w-full sm:w-auto">
 <TimeFilterBar value={timeFilterChoice} onChange={setTimeFilterChoice} range={customDateRange} onRangeChange={setDateRange} />
 </div>
 </div>
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
 </div>
 );
 })()}
 </>
 );
}
