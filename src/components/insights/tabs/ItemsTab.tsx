// Insights > Items tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { lazy, Suspense } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, FileSpreadsheet, Wallet, Smartphone, Target } from 'lucide-react';
import { LazyChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, AreaChart, Area } from '../../charts/lazyRecharts';
import { SectionSkeleton } from '../../LoadingSkeleton';
import { type AnalyticsData, truncateChartLabel } from '../useAnalyticsData';
import { CustomTooltip, TimeFilterBar, makeRenderers } from './shared';

const SalesDataComponent = lazy(() => import('../../SalesData').then((m) => ({ default: m.SalesData })));

export function ItemsTab({ d }: { d: AnalyticsData }) {
 const { context, selectedStoreId, effectiveStoreId, salesSubView, setSalesSubView, timeFilterChoice, setTimeFilterChoice, customDateRange, setDateRange, getPeriodLabel, metrics, itemPerformanceData, decliningItems, salesChartData, profitChartData, previousPeriodMetrics, realizedProfit } = d;
 const { renderPctChangeOnColor } = makeRenderers(d);
 return (
 <>
 {(
 <div>
 {/* Sub-tabs for Sales */}
 <div className="bg-white rounded-2xl shadow-lg p-2 mb-6 border border-gray-200">
 <div className="flex gap-2">
 <button
 onClick={() => setSalesSubView('revenue')}
 className={`flex-1 px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 salesSubView === 'revenue'
 ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
 : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
 }`}
 >
 <div className="flex items-center justify-center gap-2">
 <ShoppingCart className="w-5 h-5" />
 <span className="font-semibold">Revenue Tracking</span>
 </div>
 </button>
 <button
 onClick={() => setSalesSubView('category')}
 className={`flex-1 px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 salesSubView === 'category'
 ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg'
 : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
 }`}
 >
 <div className="flex items-center justify-center gap-2">
 <FileSpreadsheet className="w-5 h-5" />
 <span className="font-semibold">Item Sales Analytics</span>
 </div>
 </button>
 </div>
 </div>

 {/* Revenue Tracking Sub-view */}
 {salesSubView === 'revenue' && (
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/30 flex-shrink-0">
 <ShoppingCart className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Revenue Analytics</h2>
 <p className="text-xs sm:text-sm text-gray-500">Track daily revenue from Paytm, Cash, and Online sales</p>
 </div>
 </div>

 {/* Time Filter */}
 <div className="w-full sm:w-auto">
 <TimeFilterBar value={timeFilterChoice} onChange={setTimeFilterChoice} range={customDateRange} onRangeChange={setDateRange} />
 </div>
 </div>


 {/* Sales Summary Cards - same saturated-gradient card language as the Overview tab. */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
 <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Total Sales</div>
 <div className="text-2xl font-semibold">₹{metrics.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-emerald-100 mt-1">{getPeriodLabel()}</div>
 {renderPctChangeOnColor(metrics.totalRevenue, previousPeriodMetrics.totalRevenue)}
 </div>
 <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-blue-100 mb-1">Online Sales</div>
 <div className="text-2xl font-semibold">₹{metrics.onlineRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-blue-100 mt-1">{((metrics.onlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}% of total</div>
 {renderPctChangeOnColor(metrics.onlineRevenue, previousPeriodMetrics.onlineRevenue)}
 </div>
 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Offline Sales</div>
 <div className="text-2xl font-semibold">₹{metrics.offlineRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-orange-100 mt-1">{((metrics.offlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}% of total</div>
 {renderPctChangeOnColor(metrics.offlineRevenue, previousPeriodMetrics.offlineRevenue)}
 </div>
 <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-amber-100 mb-1">Net Profit</div>
 <div className="text-2xl font-semibold">₹{realizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-amber-100 mt-1">{metrics.totalRevenue > 0 ? ((realizedProfit / metrics.totalRevenue) * 100).toFixed(1) : '0.0'}% margin</div>
 {renderPctChangeOnColor(realizedProfit, previousPeriodMetrics.netProfit)}
 </div>
 </div>

 {/* Sales Trend Chart */}
 <div className="mb-6 sm:mb-8">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">
 Sales Trend - {getPeriodLabel()}
 </h3>
 <div className="overflow-x-auto">
 <div className="min-w-[260px]">
 <LazyChart height={300}>{() => (
 <ResponsiveContainer width="100%" height={300}>
 <BarChart data={salesChartData.map((item, index) => ({ ...item, uniqueKey: `sales-${item.period}-${index}` }))} barCategoryGap="25%">
 <CartesianGrid key="sales-channel-grid" strokeDasharray="3 3" stroke="#f0f0f0" />
 <XAxis key="sales-channel-xaxis" dataKey="period" stroke="#666" tick={{ fontSize: 12 }} />
 <YAxis key="sales-channel-yaxis" stroke="#666" tick={{ fontSize: 12 }} />
 <Tooltip key="sales-channel-tooltip" content={<CustomTooltip />} />
 <Legend key="sales-channel-legend" wrapperStyle={{ fontSize: '12px' }} />
 <Bar key="online-bar" dataKey="online" stackId="a" fill="#60a5fa" name="Online Sales" radius={[0, 0, 0, 0]} maxBarSize={80} />
 <Bar key="offline-bar" dataKey="offline" stackId="a" fill="#38bdf8" name="Offline Sales" radius={[8, 8, 0, 0]} maxBarSize={80} />
 <Line key="total-line" type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', r: 5 }} name="Total Sales Trend" />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 </div>
 </div>

 {/* Sales Breakdown */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
 <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
 <div className="flex items-center gap-2 mb-5">
 <ShoppingCart className="w-5 h-5 text-emerald-600" />
 <h3 className="text-base sm:text-lg font-semibold text-gray-900">Payment Methods</h3>
 </div>
 {(() => {
 const total = metrics.onlineRevenue + metrics.offlineRevenue;
 const onlinePct = total > 0 ? (metrics.onlineRevenue / total) * 100 : 0;
 const offlinePct = 100 - onlinePct;
 return (
 <>
 <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex mb-5" role="img" aria-label={`Online ${onlinePct.toFixed(1)}%, Cash & Paytm ${offlinePct.toFixed(1)}%`}>
 {onlinePct > 0 && <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${onlinePct}%` }} />}
 {offlinePct > 0 && <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${offlinePct}%` }} />}
 </div>
 <div className="space-y-3">
 <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
 <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
 <Smartphone className="w-4 h-4 text-emerald-600" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="text-sm text-gray-700">Online Payments</span>
 <span className="text-sm font-semibold text-emerald-600 tabular-nums">{onlinePct.toFixed(1)}%</span>
 </div>
 <div className="text-lg font-semibold text-gray-900 tabular-nums">₹{metrics.onlineRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 </div>
 </div>
 <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
 <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
 <Wallet className="w-4 h-4 text-blue-600" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="text-sm text-gray-700">Cash & Paytm</span>
 <span className="text-sm font-semibold text-blue-600 tabular-nums">{offlinePct.toFixed(1)}%</span>
 </div>
 <div className="text-lg font-semibold text-gray-900 tabular-nums">₹{metrics.offlineRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 </div>
 </div>
 </div>
 </>
 );
 })()}
 </div>

 <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
 <div className="flex items-center gap-2 mb-5">
 <TrendingUp className="w-5 h-5 text-orange-600" />
 <h3 className="text-base sm:text-lg font-semibold text-gray-900">Performance Insights</h3>
 </div>
 <div className="space-y-3">
 {(() => {
 // Derived from profitChartData (same data the Daily Performance/Profitability
 // charts use) rather than recomputing from filteredSalesData directly - that
 // older path only summed sale.onlineSales (a legacy field that's always 0 now
 // that online sales are tracked separately) and divided by the count of sales:
 // records rather than actual days in the period, so it silently excluded every
 // Zomato/Swiggy sale and skewed the daily averages.
 const dayCount = profitChartData.length;
 const avgRevenue = dayCount > 0 ? profitChartData.reduce((sum, d) => sum + d.revenue, 0) / dayCount : 0;
 const avgProfit = dayCount > 0 ? profitChartData.reduce((sum, d) => sum + d.profit, 0) / dayCount : 0;
 const bestDayRow = dayCount > 0 ? profitChartData.reduce((best, d) => d.revenue > best.revenue ? d : best, profitChartData[0]) : null;
 const insights: { icon: any; iconBg: string; iconColor: string; label: string; value: string; sub: string }[] = [
 { icon: DollarSign, iconBg: 'bg-orange-100', iconColor: 'text-orange-600', label: 'Daily Revenue Average', value: `₹${avgRevenue.toFixed(0)}`, sub: 'Per day' },
 { icon: TrendingUp, iconBg: 'bg-rose-100', iconColor: 'text-rose-600', label: 'Daily Profit Average', value: `₹${avgProfit.toFixed(0)}`, sub: 'Per day' },
 { icon: Target, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', label: 'Best Performing Day', value: bestDayRow ? `₹${bestDayRow.revenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '₹0', sub: bestDayRow?.period ? `${bestDayRow.period} - highest daily revenue` : 'Highest daily revenue' },
 ];
 return (
 <>
 {insights.map((row) => (
 <div key={row.label} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
 <div className={`w-9 h-9 rounded-lg ${row.iconBg} flex items-center justify-center flex-shrink-0`}>
 <row.icon className={`w-4 h-4 ${row.iconColor}`} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-xs text-gray-500">{row.label}</div>
 <div className="text-lg font-semibold text-gray-900 tabular-nums">{row.value}</div>
 <div className="text-xs text-gray-500 mt-0.5">{row.sub}</div>
 </div>
 </div>
 ))}
 {dayCount > 1 && (
 <div className="p-3 rounded-lg border border-gray-100">
 <div className="text-xs text-gray-500 mb-2">Revenue trend, {getPeriodLabel()}</div>
 <LazyChart height={64}>{() => (
 <ResponsiveContainer width="100%" height={64}>
 <AreaChart data={profitChartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
 <defs>
 <linearGradient id="perfInsightRevenueFill" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
 <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
 </linearGradient>
 </defs>
 <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} labelFormatter={(label) => label} />
 <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#perfInsightRevenueFill)" />
 </AreaChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 )}
 </>
 );
 })()}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Item Sales Analytics Sub-view */}
 {salesSubView === 'category' && (
 <div>
 {/* Top items + channel mix + declining flags, built on the same order-item-detail
 feed as the table below. Revenue here is gross (pre-commission) for chart speed;
 the table below settles online orders against actual aggregator payouts for
 the exact numbers. */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Top 10 Items by Revenue</h3>
 <p className="text-xs sm:text-sm text-gray-600 mb-4">{getPeriodLabel()}</p>
 {itemPerformanceData.top10.length === 0 ? (
 <div className="text-sm text-gray-500 py-8 text-center">No item sales data for this period.</div>
 ) : (
 <LazyChart height={420}>{() => (
 <ResponsiveContainer width="100%" height={420}>
 <BarChart data={itemPerformanceData.top10} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={10}>
 <CartesianGrid strokeDasharray="3 3" horizontal={false} />
 <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
 <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 9 }} tickFormatter={(v: string) => truncateChartLabel(v, 16)} interval={0} />
 <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
 <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 )}
 </div>

 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Top Items by Channel</h3>
 <p className="text-xs sm:text-sm text-gray-600 mb-4">Offline vs Zomato vs Swiggy revenue</p>
 {itemPerformanceData.top10.length === 0 ? (
 <div className="text-sm text-gray-500 py-8 text-center">No item sales data for this period.</div>
 ) : (
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <BarChart data={itemPerformanceData.top10.slice(0, 5)} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={14}>
 <CartesianGrid strokeDasharray="3 3" horizontal={false} />
 <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
 <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 9 }} tickFormatter={(v: string) => truncateChartLabel(v, 16)} interval={0} />
 <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
 <Legend wrapperStyle={{ fontSize: 11 }} />
 <Bar dataKey="Offline" stackId="ch" fill="#f97316" barSize={14} />
 <Bar dataKey="Zomato" stackId="ch" fill="#ef4444" barSize={14} />
 <Bar dataKey="Swiggy" stackId="ch" fill="#f97316" opacity={0.5} barSize={14} radius={[0, 4, 4, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 )}
 </div>
 </div>

 {decliningItems.length > 0 && (
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-6 border-l-4 border-amber-400">
 <div className="flex items-center gap-2 mb-1">
 <TrendingDown className="w-5 h-5 text-amber-600" />
 <h3 className="text-base sm:text-lg text-gray-900">Declining This Week</h3>
 </div>
 <p className="text-xs sm:text-sm text-gray-600 mb-4">Items down 10%+ vs last week (min ₹500 last week revenue)</p>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 text-xs uppercase">
 <th className="pb-2">Item</th>
 <th className="pb-2 text-right">Last Week</th>
 <th className="pb-2 text-right">This Week</th>
 <th className="pb-2 text-right">Change</th>
 </tr>
 </thead>
 <tbody>
 {decliningItems.map(item => (
 <tr key={item.name} className="border-t border-gray-100">
 <td className="py-2 text-gray-900">{item.name}</td>
 <td className="py-2 text-right text-gray-600">₹{item.lastWeek.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
 <td className="py-2 text-right text-gray-600">₹{item.thisWeek.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
 <td className="py-2 text-right text-red-600">{item.changePct}%</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 <Suspense fallback={<SectionSkeleton />}>
 <SalesDataComponent context={context} selectedStoreId={effectiveStoreId} />
 </Suspense>
 </div>
 )}
 </div>
 )}
 </>
 );
}
