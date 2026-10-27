// Insights > Overview tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { lazy, Suspense } from 'react';
import { TrendingUp, TrendingDown, Package, DollarSign, ShoppingCart, ClipboardCheck, X, ArrowUp, ArrowDown, BarChart3, Wallet, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { LazyChart, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ReferenceLine, ComposedChart } from '../../charts/lazyRecharts';
import { monthLabel } from '../../../utils/salaryBreakdown';
import { DailyBriefCard } from '../DailyBriefCard';
import { ForecastCard } from '../ForecastCard';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData } from '../useAnalyticsData';
import { CustomTooltip, TimeFilterBar, makeRenderers } from './shared';

const DataCapture = lazy(() => import('../../DataCapture').then((m) => ({ default: m.DataCapture })));

export function OverviewTab({ d }: { d: AnalyticsData }) {
 const { context, selectedStoreId, analyticsMode, insightsStoreId, canManageInsights, insightsOverview, showActivityLog, setShowActivityLog, timeFilterChoice, setTimeFilterChoice, timeFilter, customDateRange, setDateRange, loading, getPeriodLabel, metrics, carryForward, ordersPerDayData, ordersPerDayChartData, offlineOrdersMedian, onlineOrdersMedian, ordersByHourData, ordersByHourChartData, peakHour, serviceTypeData, serviceTypeChartData, avgOrderValueData, avgOrderValueChartData, discountPctData, discountPctChartData, paymentModeBreakdownData, cancellationTrendData, cancellationChartData, orderValueHistogramData, profitChartDataWithPrev, previousPeriodMetrics, getPreviousPeriodLabel, totalCashDiscrepancy, realizedProfit, netRealisedProfit, netNormalizedProfit, normalizedCardNote, totalPosSalesDiscrepancy } = d;
 const { renderPctChangeOnColor, renderPrevAwareLegend } = makeRenderers(d);
 return (
 <>
 {(
 <div className="space-y-6">
 {analyticsMode === 'store' && insightsStoreId && (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <DailyBriefCard accessToken={context.user?.accessToken || ''} storeId={insightsStoreId} canManage={canManageInsights} />
 <ForecastCard data={insightsOverview.data} loading={insightsOverview.loading} error={insightsOverview.error} />
 </div>
 )}
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/30 flex-shrink-0">
 <BarChart3 className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Overview</h2>
 <p className="text-xs sm:text-sm text-gray-500">Profit, discrepancies and channel health at a glance</p>
 </div>
 </div>
 <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
 <TimeFilterBar value={timeFilterChoice} onChange={setTimeFilterChoice} range={customDateRange} onRangeChange={setDateRange} />
 </div>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
 <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Net Profit</div>
 <div className="text-2xl font-semibold">₹{realizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-emerald-100 mt-1">{getPeriodLabel()}</div>
 {renderPctChangeOnColor(realizedProfit, previousPeriodMetrics.netProfit)}
 </div>
 <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl p-4 shadow-lg shadow-teal-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-teal-100 mb-1">Net Realised Profit</div>
 <div className="text-2xl font-semibold">₹{netRealisedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-teal-100 mt-1">
 {carryForward.amount < 0
 ? `After -₹${Math.abs(Math.round(carryForward.amount)).toLocaleString('en-IN')} loss brought forward (${carryForward.parts.filter((p) => p.profit < 0 || p.carried < 0).map((p) => monthLabel(p.month)).join(', ')})`
 : (timeFilter === 'thisMonth' || timeFilter === 'lastMonth') ? 'No loss brought forward' : 'Carry-forward shows on This month / Last month'}
 </div>
 </div>
 <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl p-4 shadow-lg shadow-indigo-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-indigo-100 mb-1">Net Normalized Profit</div>
 <div className="text-2xl font-semibold">₹{netNormalizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-indigo-100 mt-1">{normalizedCardNote}</div>
 </div>
 <div className={`rounded-xl p-4 shadow-lg text-white ${totalCashDiscrepancy > 0 ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/20' : 'bg-gradient-to-br from-gray-400 to-gray-500 shadow-gray-400/20'}`}>
 <div className="text-xs uppercase tracking-wide text-white/80 mb-1">Cash Discrepancy Losses</div>
 <div className="text-2xl font-semibold">₹{totalCashDiscrepancy.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-white/80 mt-1">{getPeriodLabel()} · approved shortages</div>
 {renderPctChangeOnColor(totalCashDiscrepancy, previousPeriodMetrics.cashDiscrepancy)}
 </div>
 <div className={`rounded-xl p-4 shadow-lg text-white ${totalPosSalesDiscrepancy > 0 ? 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20' : 'bg-gradient-to-br from-gray-400 to-gray-500 shadow-gray-400/20'}`}>
 <div className="text-xs uppercase tracking-wide text-white/80 mb-1">POS Sales Discrepancy</div>
 <div className="text-2xl font-semibold">₹{totalPosSalesDiscrepancy.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-white/80 mt-1">{getPeriodLabel()} · Cash+Paytm short of POS sales</div>
 {renderPctChangeOnColor(totalPosSalesDiscrepancy, previousPeriodMetrics.posSalesDiscrepancy)}
 </div>
 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Commission %</div>
 <div className="text-2xl font-semibold">
 {metrics.matchedOnlineRevenueForCommission > 0 ? `${((metrics.commissionExpenses / metrics.matchedOnlineRevenueForCommission) * 100).toFixed(1)}%` : '—'}
 </div>
 <div className="text-xs text-orange-100 mt-1">of online revenue, excl. GST, {getPeriodLabel()}</div>
 {metrics.matchedOnlineRevenueForCommission > 0 && previousPeriodMetrics.matchedOnlineRevenueForCommission > 0 && (() => {
 const currentPct = (metrics.commissionExpenses / metrics.matchedOnlineRevenueForCommission) * 100;
 const previousPct = (previousPeriodMetrics.commissionExpenses / previousPeriodMetrics.matchedOnlineRevenueForCommission) * 100;
 const diff = currentPct - previousPct;
 return (
 <div className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 bg-white/20 rounded-full px-2 py-0.5 text-white">
 {diff >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span>{Math.abs(diff).toFixed(1)} pts {getPreviousPeriodLabel()}</span>
 </div>
 );
 })()}
 </div>
 <div className="sm:col-span-2 lg:col-span-3 bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl p-4 shadow-lg shadow-sky-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-sky-100 mb-1">Ad Spend</div>
 <div className="text-2xl font-semibold">₹{metrics.adSpend.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-sky-100 mt-1">{getPeriodLabel()} · Zomato + Swiggy · counted in costs</div>
 {renderPctChangeOnColor(metrics.adSpend, previousPeriodMetrics.adSpend)}
 </div>
 </div>
 </div>

 {/* Revenue / Profit trend - same data the old Profit Analytics chart used */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <TrendingUp className="w-5 h-5 text-emerald-600" />
 Revenue & Profit Trend
 </h3>
 <p className="text-xs text-gray-500 mb-3">Dotted lines are the matching previous period (same weekday/week/date-of-month, depending on the filter above)</p>
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <LineChart data={profitChartDataWithPrev}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip content={<CustomTooltip />} />
 <Legend content={renderPrevAwareLegend} />
 <Line type="monotone" dataKey="revenue" stroke="#14b8a6" strokeWidth={2} name="Revenue" dot={false} />
 <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" dot={false} />
 <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} name="Profit" dot={false} />
 <Line type="monotone" dataKey="prev_revenue" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 3" name="Revenue (prev period)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_expenses" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" name="Expenses (prev period)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_profit" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" name="Profit (prev period)" dot={false} connectNulls />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>

 {/* Orders per Day - offline (POS) vs Zomato vs Swiggy order counts, from real per-order
 data (Ciferon's order item detail) since no order-count field exists on the sales
 record itself, only revenue totals. Zomato/Swiggy use their real brand colors so the
 split reads at a glance instead of needing the legend. */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <ShoppingCart className="w-5 h-5 text-indigo-600" />
 Orders per Day
 </h3>
 {ordersPerDayData.length === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No order data for this period yet.</p>
 ) : (
 <>
 {/* Median values called out here instead of as in-chart labels - with 31 days of
 tall bars, any label placed inside the plot kept landing on top of a bar and
 becoming unreadable regardless of position. The dashed lines themselves still
 show where each median sits on the chart. */}
 <div className="flex items-center gap-4 mb-2 text-xs font-semibold">
 <span className="flex items-center gap-1.5" style={{ color: '#334155' }}>
 <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#334155' }} />
 Offline median: {offlineOrdersMedian}
 </span>
 <span className="flex items-center gap-1.5" style={{ color: '#4338ca' }}>
 <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#6366f1' }} />
 Online median: {onlineOrdersMedian}
 </span>
 </div>
 <p className="text-xs text-gray-500 mb-2">Dotted lines are the matching previous period</p>
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <ComposedChart data={ordersPerDayChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Bar dataKey="offline" fill="#64748b" name="Offline orders" radius={[4, 4, 0, 0]} />
 <Bar dataKey="zomato" fill="#e23744" name="Zomato orders" radius={[4, 4, 0, 0]} />
 <Bar dataKey="swiggy" fill="#fc8019" name="Swiggy orders" radius={[4, 4, 0, 0]} />
 <Line type="monotone" dataKey="prev_offline" stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" name="Offline (prev period)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_zomato" stroke="#e23744" strokeWidth={1.5} strokeDasharray="4 3" name="Zomato (prev period)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_swiggy" stroke="#fc8019" strokeWidth={1.5} strokeDasharray="4 3" name="Swiggy (prev period)" dot={false} connectNulls />
 <ReferenceLine y={offlineOrdersMedian} stroke="#334155" strokeDasharray="6 4" strokeWidth={2} ifOverflow="extendDomain" />
 <ReferenceLine y={onlineOrdersMedian} stroke="#6366f1" strokeDasharray="6 4" strokeWidth={2} ifOverflow="extendDomain" />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
 <div className="text-center">
 <p className="text-xs text-gray-500 uppercase tracking-wide">Offline</p>
 <p className="text-xl font-semibold mt-1" style={{ color: '#64748b' }}>{ordersPerDayData.reduce((s, d) => s + d.offline, 0).toLocaleString()}</p>
 </div>
 <div className="text-center">
 <p className="text-xs text-gray-500 uppercase tracking-wide">Zomato</p>
 <p className="text-xl font-semibold mt-1" style={{ color: '#e23744' }}>{ordersPerDayData.reduce((s, d) => s + d.zomato, 0).toLocaleString()}</p>
 </div>
 <div className="text-center">
 <p className="text-xs text-gray-500 uppercase tracking-wide">Swiggy</p>
 <p className="text-xl font-semibold mt-1" style={{ color: '#fc8019' }}>{ordersPerDayData.reduce((s, d) => s + d.swiggy, 0).toLocaleString()}</p>
 </div>
 <div className="text-center">
 <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
 <p className="text-xl font-semibold text-gray-900 mt-1">{ordersPerDayData.reduce((s, d) => s + d.total, 0).toLocaleString()}</p>
 </div>
 </div>
 </>
 )}
 </div>

 {/* Orders by Hour (3 PM - 10 PM) - which hour of the dinner rush actually peaks. Only
 populated from orders synced after hour-of-day capture was added (see orderHourIST
 in index.ts) - older synced days won't contribute here even though they still show
 up fine in Orders per Day above, which only needs the date. */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
 <Clock className="w-5 h-5 text-indigo-600" />
 Orders by Hour
 </h3>
 <p className="text-xs text-gray-500 mb-4">3 PM - 10 PM IST, average orders per day for the selected period · dotted lines are the matching previous period</p>
 {ordersByHourData.every(h => h.total === 0) ? (
 <p className="text-sm text-gray-500 py-8 text-center">No hourly order data yet - this fills in from today's sync onward.</p>
 ) : (
 <>
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <ComposedChart data={ordersByHourChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Bar dataKey="offline" stackId="hour" fill="#f97316" name="Offline orders (avg/day)" radius={[0, 0, 0, 0]} />
 <Bar dataKey="online" stackId="hour" fill="#6366f1" name="Online orders (avg/day)" radius={[4, 4, 0, 0]} />
 <Line type="monotone" dataKey="prev_offline" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 3" name="Offline (prev period)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_online" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" name="Online (prev period)" dot={false} connectNulls />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 {peakHour && (
 <p className="text-sm text-gray-700 mt-4 pt-4 border-t border-gray-100 text-center">
 <span className="font-semibold text-indigo-600">Peak: {peakHour.label}</span>{' '}
 with {peakHour.total.toLocaleString()} orders/day on average
 </p>
 )}
 </>
 )}
 </div>

 {/* Dine-in vs Takeaway vs Home Delivery - split by order count (trend) and revenue
 (pie for the period). Note this is a different axis than Offline/Zomato/Swiggy above:
 every DineIn order is offline, but HomeDelivery mixes real offline delivery with both
 aggregators (which are always HomeDelivery). */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <Package className="w-5 h-5 text-teal-600" />
 Dine-in / Takeaway / Delivery
 </h3>
 {serviceTypeData.trend.length === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No order data for this period yet.</p>
 ) : (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2">
 <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Orders per day · dotted = previous period</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <ComposedChart data={serviceTypeChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Bar dataKey="DineIn" stackId="svc" fill="#0d9488" name="Dine-in" radius={[0, 0, 0, 0]} />
 <Bar dataKey="TakeAway" stackId="svc" fill="#facc15" name="Takeaway" radius={[0, 0, 0, 0]} />
 <Bar dataKey="HomeDelivery" stackId="svc" fill="#8b5cf6" name="Delivery" radius={[4, 4, 0, 0]} />
 <Line type="monotone" dataKey="prev_DineIn" stroke="#0d9488" strokeWidth={1.5} strokeDasharray="4 3" name="Dine-in (prev)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_TakeAway" stroke="#ca8a04" strokeWidth={1.5} strokeDasharray="4 3" name="Takeaway (prev)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_HomeDelivery" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 3" name="Delivery (prev)" dot={false} connectNulls />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 <div>
 <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Revenue share (period)</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <PieChart>
 <Pie
 data={[
 { name: 'Dine-in', value: Math.round(serviceTypeData.revenueByType.DineIn) },
 { name: 'Takeaway', value: Math.round(serviceTypeData.revenueByType.TakeAway) },
 { name: 'Delivery', value: Math.round(serviceTypeData.revenueByType.HomeDelivery) },
 ].filter(d => d.value > 0)}
 dataKey="value"
 nameKey="name"
 cx="50%"
 cy="50%"
 outerRadius={85}
 label={(entry: any) => `${entry.name}`}
 >
 <Cell fill="#0d9488" />
 <Cell fill="#facc15" />
 <Cell fill="#8b5cf6" />
 </Pie>
 <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
 </PieChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 </div>
 )}
 </div>

 {/* Average Order Value trend - revenue and order counts were already tracked
 separately, just never divided against each other over time. */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <DollarSign className="w-5 h-5 text-emerald-600" />
 Average Order Value
 </h3>
 {avgOrderValueData.length === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No order data for this period yet.</p>
 ) : (
 <>
 <p className="text-xs text-gray-500 mb-2">Dotted lines are the matching previous period</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart data={avgOrderValueChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
 <Tooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
 <Legend content={renderPrevAwareLegend} />
 <Line type="monotone" dataKey="offlineAOV" stroke="#64748b" strokeWidth={2} name="Offline AOV" dot={false} />
 <Line type="monotone" dataKey="onlineAOV" stroke="#6366f1" strokeWidth={2} name="Online AOV (Zomato+Swiggy)" dot={false} />
 <Line type="monotone" dataKey="prev_offlineAOV" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" name="Offline AOV (prev)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_onlineAOV" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" name="Online AOV (prev)" dot={false} connectNulls />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </>
 )}
 </div>

 {/* Discount % of gross - discount amounts were already tracked, just never trended
 as a rate over time (a rupee figure alone doesn't say whether discounting is
 creeping up as volume grows). */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <TrendingDown className="w-5 h-5 text-rose-600" />
 Discount % of Gross Sales
 </h3>
 {discountPctData.length === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No order data for this period yet.</p>
 ) : (
 <>
 <p className="text-xs text-gray-500 mb-2">Dotted lines are the matching previous period</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart data={discountPctChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
 <Tooltip formatter={(value: number) => `${value}%`} />
 <Legend content={renderPrevAwareLegend} />
 <Line type="monotone" dataKey="offlinePct" stroke="#64748b" strokeWidth={2} name="Offline discount %" dot={false} />
 <Line type="monotone" dataKey="onlinePct" stroke="#e11d48" strokeWidth={2} name="Online discount %" dot={false} />
 <Line type="monotone" dataKey="prev_offlinePct" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" name="Offline discount % (prev)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_onlinePct" stroke="#e11d48" strokeWidth={1.5} strokeDasharray="4 3" name="Online discount % (prev)" dot={false} connectNulls />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </>
 )}
 </div>

 {/* Digital Payment Mode Breakdown - Cash/Paytm/PhonePe/Card/Google Pay/Razorpay are
 still all deliberately folded into one "Paytm" figure for reconciliation everywhere
 else (nothing here changes any total) - this is purely the raw split for insight,
 e.g. seeing how much volume is actually Card/GPay vs plain Paytm. */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
 <Wallet className="w-5 h-5 text-blue-600" />
 Payment Mode Breakdown
 </h3>
 <p className="text-xs text-gray-500 mb-4">Cash/Paytm/PhonePe/Card/Google Pay/Razorpay/Zomato/Swiggy - insight only, not a reconciliation total</p>
 {paymentModeBreakdownData.length === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No payment-mode data yet - this fills in from today's sync onward.</p>
 ) : (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <PieChart>
 <Pie data={paymentModeBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry: any) => entry.name}>
 {paymentModeBreakdownData.map((d, i) => <Cell key={i} fill={d.color} />)}
 </Pie>
 <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
 </PieChart>
 </ResponsiveContainer>
 )}</LazyChart>
 <div className="space-y-2">
 {paymentModeBreakdownData.map((d) => (
 <div key={d.name} className="flex items-center justify-between text-sm">
 <span className="flex items-center gap-2 text-gray-700">
 <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
 {d.name}
 </span>
 <span className="font-medium text-gray-900">₹{d.value.toLocaleString()}</span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Cancellation Trend - offlineCancelledCount/onlineCancelledCount were already
 tracked per day, just never charted as a trend before (only ever a same-day figure). */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <X className="w-5 h-5 text-red-600" />
 Cancellation Trend
 </h3>
 {cancellationTrendData.length === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No data for this period yet.</p>
 ) : (
 <>
 <p className="text-xs text-gray-500 mb-2">Dotted lines are the matching previous period</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <ComposedChart data={cancellationChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Bar dataKey="offlineCancelled" stackId="cancel" fill="#64748b" name="Offline cancelled" radius={[0, 0, 0, 0]} />
 <Bar dataKey="onlineCancelled" stackId="cancel" fill="#dc2626" name="Online cancelled" radius={[4, 4, 0, 0]} />
 <Line type="monotone" dataKey="prev_offlineCancelled" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" name="Offline cancelled (prev)" dot={false} connectNulls />
 <Line type="monotone" dataKey="prev_onlineCancelled" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" name="Online cancelled (prev)" dot={false} connectNulls />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 <p className="text-sm text-gray-700 mt-4 pt-4 border-t border-gray-100 text-center">
 Total value cancelled: <span className="font-semibold text-red-600">₹{cancellationTrendData.reduce((s, d) => s + d.cancelledAmount, 0).toLocaleString()}</span>
 </p>
 </>
 )}
 </div>

 {/* Order Value Distribution - a real histogram: how many orders fall in each value band
 across the whole period, current vs previous side by side. Same real per-order data as
 the other order charts. */}
 <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
 <ClipboardCheck className="w-5 h-5 text-purple-600" />
 Order Value Distribution
 </h3>
 <p className="text-xs text-gray-500 mb-4">How many orders fall in each value band (₹0-99 up to ₹500+), this period vs the matching previous period</p>
 {orderValueHistogramData.currentTotalOrders === 0 ? (
 <p className="text-sm text-gray-500 py-8 text-center">No order data for this period yet.</p>
 ) : (
 <>
 <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
 <span className="text-gray-700">
 <span className="font-semibold text-gray-900">{orderValueHistogramData.currentTotalOrders.toLocaleString()}</span> orders this period
 </span>
 <span className="text-gray-700">
 Average order value <span className="font-semibold text-gray-900">₹{orderValueHistogramData.avgOrderValue.toLocaleString()}</span>
 </span>
 <span className="text-gray-700">
 Most common band <span className="font-semibold text-purple-700">{orderValueHistogramData.modalBucket.label}</span> ({orderValueHistogramData.modalBucket.current.toLocaleString()} orders)
 </span>
 </div>
 <LazyChart height={300}>{() => (
 <ResponsiveContainer width="100%" height={300}>
 <BarChart data={orderValueHistogramData.rows}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={55} />
 <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Bar dataKey="current" name="This period" fill="#7c3aed" radius={[4, 4, 0, 0]} />
 <Bar dataKey="previous" name="Previous period" fill="#d8b4fe" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </>
 )}
 </div>

 {/* Activity Log - Performance Tracker folded in here instead of its own tab */}
 <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
 <button
 onClick={() => setShowActivityLog(!showActivityLog)}
 className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-gray-50 transition-colors"
 >
 <h3 className="text-base sm:text-lg text-gray-900 flex items-center gap-2">
 <Package className="w-5 h-5 text-gray-600" />
 Activity Log
 </h3>
 {showActivityLog ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
 </button>
 {showActivityLog && (
 <div className="px-4 sm:px-6 pb-4 sm:pb-6">
 <Suspense fallback={<SectionSkeleton minHeight={240} />}>
 <DataCapture context={context} selectedStoreId={selectedStoreId} />
 </Suspense>
 </div>
 )}
 </div>
 </div>
 )}
 </>
 );
}
