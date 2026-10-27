// Insights > Revenue tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { TrendingUp, AlertCircle, DollarSign, ShoppingCart, CheckCircle, ArrowUp, ArrowDown, Target, AlertTriangle, XCircle, Percent } from 'lucide-react';
import { LazyChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from '../../charts/lazyRecharts';
import { monthLabel } from '../../../utils/salaryBreakdown';
import { type AnalyticsData } from '../useAnalyticsData';
import { CustomTooltip, TimeFilterBar, makeRenderers } from './shared';

export function RevenueTab({ d }: { d: AnalyticsData }) {
 const { timeFilterChoice, setTimeFilterChoice, timeFilter, smoothFixedCosts, updateSmoothFixedCosts, customDateRange, setDateRange, getPeriodLabel, metrics, carryForward, smoothedCosts, profitChartData, previousPeriodMetrics, getPreviousPeriodLabel, commissionAdSpendChartData, channelMixChartData, totalCashDiscrepancy, unrealizedProfit, realizedProfit, netRealisedProfit, netNormalizedProfit, normalizedCardNote } = d;
 const { renderPctChangeOnColor } = makeRenderers(d);
 return (
 <>
 {(
 <div>
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/30 flex-shrink-0">
 <TrendingUp className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Revenue & Channels</h2>
 <p className="text-xs sm:text-sm text-gray-500">Revenue, expenses, profit, and how commission/ad spend/channel mix are trending</p>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
 {/* Time Filter */}
 <TimeFilterBar value={timeFilterChoice} onChange={setTimeFilterChoice} range={customDateRange} onRangeChange={setDateRange} />
 </div>
 </div>


 {/* Metrics Cards - same saturated-gradient card language as the Overview tab, so the
 whole Analytics section reads as one consistent design instead of each tab having its
 own take on "metric card". */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
 <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-blue-100 mb-1">Total Revenue</div>
 <div className="text-2xl font-semibold">₹{metrics.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-blue-100 mt-1">{getPeriodLabel()}</div>
 {renderPctChangeOnColor(metrics.totalRevenue, previousPeriodMetrics.totalRevenue)}
 </div>

 <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-red-100 mb-1">Total Expenses</div>
 <div className="text-2xl font-semibold">₹{metrics.totalExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-red-100 mt-1">{getPeriodLabel()}</div>
 {renderPctChangeOnColor(metrics.totalExpenses, previousPeriodMetrics.totalExpenses)}
 </div>

 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Aggregator Commission</div>
 <div className="text-2xl font-semibold">₹{metrics.commissionExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-orange-100 mt-1">
 {metrics.matchedOnlineRevenueForCommission > 0 ? `${((metrics.commissionExpenses / metrics.matchedOnlineRevenueForCommission) * 100).toFixed(1)}% of online, excl. GST` : 'No data'}
 {metrics.online.estimatedCommission > 0.5 && ` · incl. ₹${Math.round(metrics.online.estimatedCommission).toLocaleString('en-IN')} estimated for ${metrics.online.estimatedDays} unsettled day${metrics.online.estimatedDays === 1 ? '' : 's'}`}
 </div>
 {renderPctChangeOnColor(metrics.commissionExpenses, previousPeriodMetrics.commissionExpenses)}
 </div>

 <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Net Profit</div>
 <div className="text-2xl font-semibold">₹{realizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 {metrics.totalRevenue > 0 ? (
 <div className="flex items-center gap-1 text-xs text-emerald-100 mt-1">
 <TrendingUp className="w-3 h-3" />
 After commission & ads
 </div>
 ) : (
 <div className="text-xs text-emerald-100 mt-1">No data yet</div>
 )}
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

 <div className="sm:col-span-2 lg:col-span-3 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 shadow-lg shadow-yellow-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-yellow-100 mb-1">Profit Margin</div>
 <div className="text-2xl font-semibold">{metrics.profitMargin.toFixed(1)}%</div>
 <div className="text-xs text-yellow-100 mt-1">Of total revenue</div>
 {/* A % change of a % value reads oddly ("40% higher margin") - a plain point
 difference ("+3.2 pts") is the more natural way to compare margins. */}
 {previousPeriodMetrics.totalRevenue > 0 && (() => {
 const diff = metrics.profitMargin - previousPeriodMetrics.profitMargin;
 return (
 <div className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 bg-white/20 rounded-full px-2 py-0.5 text-white">
 {diff >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span>{Math.abs(diff).toFixed(1)} pts {getPreviousPeriodLabel()}</span>
 </div>
 );
 })()}
 </div>
 </div>

 {/* Profit Breakdown - Realized vs Unrealized */}
 <div className="bg-gradient-to-r from-blue-50 to-orange-50 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 border-2 border-blue-200">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <TrendingUp className="w-5 h-5 text-blue-600" />
 Profit Breakdown
 </h3>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 {/* Unrealized Profit */}
 <div className="bg-white rounded-lg p-4 shadow-sm">
 <div className="text-xs sm:text-sm text-gray-600 mb-2">Unrealized Profit</div>
 <div className="text-xl sm:text-2xl text-blue-600 mb-2">₹{unrealizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500">Before cash discrepancies</div>
 </div>
 
 {/* Cash Discrepancy */}
 <div className="bg-white rounded-lg p-4 shadow-sm">
 <div className="text-xs sm:text-sm text-gray-600 mb-2">Cash Discrepancy (Loss)</div>
 <div className="text-xl sm:text-2xl text-red-600 mb-2">-₹{totalCashDiscrepancy.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500">Approved losses</div>
 </div>
 
 {/* Realized Profit */}
 <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-green-300">
 <div className="text-xs sm:text-sm text-gray-600 mb-2 flex items-center gap-1">
 Realized Profit
 <span className="text-xs text-green-600">(Actual)</span>
 </div>
 <div className="text-xl sm:text-2xl text-green-600 mb-2">₹{realizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500">
 {metrics.totalRevenue > 0 
 ? `${((realizedProfit / metrics.totalRevenue) * 100).toFixed(1)}% margin`
 : 'No data yet'}
 </div>
 </div>
 </div>
 
 {totalCashDiscrepancy > 0 && (
 <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
 <div className="flex items-start gap-2">
 <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
 <div className="text-xs text-amber-800">
 <strong>Impact:</strong> Cash discrepancies represent actual cash shortages that have been approved by management and reduce the realized profit by ₹{totalCashDiscrepancy.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Daily Profit Trend */}
 <div className="mb-6 sm:mb-8 overflow-x-auto">
 <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
 Daily Performance - {getPeriodLabel()}
 </h3>
 <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="How rent, electricity and salaries are shown on daily charts">
 <button type="button" onClick={() => updateSmoothFixedCosts(true)} className={`px-3 py-1.5 ${smoothFixedCosts ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Spread over month</button>
 <button type="button" onClick={() => updateSmoothFixedCosts(false)} className={`px-3 py-1.5 border-l border-gray-200 ${!smoothFixedCosts ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>As paid</button>
 </div>
 </div>
 <p className="text-xs text-gray-500 mb-4">
 {smoothedCosts
 ? <>Rent, electricity, salaries and variable pay are spread evenly across the days of the month they belong to, so payday doesn't distort a single day.{smoothedCosts.estimatedAmount > 0 && <> About <b>₹{Math.round(smoothedCosts.estimatedAmount).toLocaleString('en-IN')}</b> of this is estimated from last month until the real bill or payout is recorded.</>} Daily charts and the summary cards use different bases, so their totals can differ slightly for the current month.</>
 : <>Showing every cost on the day it was paid.</>}
 </p>
 <div className="min-w-[260px]">
 <LazyChart height={300}>{() => (
 <ResponsiveContainer width="100%" height={300}>
 <LineChart data={profitChartData.map((item, index) => ({ ...item, id: `profit-${item.date}-${index}`, key: `data-${index}` }))}>
 <CartesianGrid key="profit-line-grid" strokeDasharray="3 3" stroke="#f0f0f0" />
 <XAxis 
 key="profit-line-xaxis"
 dataKey="date" 
 stroke="#666" 
 tick={{ fontSize: 11 }}
 tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
 />
 <YAxis key="profit-line-yaxis" stroke="#666" tick={{ fontSize: 11 }} />
 <Tooltip key="profit-line-tooltip" content={<CustomTooltip />} />
 <Legend key="profit-line-legend" wrapperStyle={{ fontSize: '12px' }} />
 <Line key="revenue-line" type="monotone" dataKey="revenue" stroke="#14b8a6" strokeWidth={2.5} name="Revenue" dot={{ fill: '#14b8a6', r: 4 }} />
 <Line key="expenses-line" type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2.5} name="Expenses" dot={{ fill: '#ef4444', r: 4 }} />
 <Line key="profit-line" type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2.5} name="Profit" dot={{ fill: '#3b82f6', r: 4 }} />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 </div>

 {/* Profitability by Day and Profit Metrics */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
 {/* Daily Profitability Bar Chart */}
 <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
 <div className="flex items-center gap-2 mb-3 sm:mb-4">
 <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
 <h3 className="text-base sm:text-lg text-gray-900">Daily Profitability</h3>
 </div>
 {profitChartData.length > 0 ? (
 <>
 <LazyChart height={200}>{() => (
 <ResponsiveContainer width="100%" height={200}>
 <BarChart data={profitChartData.map((item, index) => ({ ...item, uniqueKey: `profit-bar-${item.date}-${index}` }))}>
 <CartesianGrid key="daily-profit-grid" strokeDasharray="3 3" stroke="#f0f0f0" />
 <XAxis 
 key="daily-profit-xaxis"
 dataKey="date" 
 stroke="#666" 
 tick={{ fontSize: 10 }}
 tickFormatter={(value) => new Date(value).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
 />
 <YAxis key="daily-profit-yaxis" stroke="#666" tick={{ fontSize: 10 }} />
 <Tooltip key="daily-profit-tooltip" content={<CustomTooltip />} />
 <Bar key="profit-bar" dataKey="profit" fill="#10b981" name="Daily Profit" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 <div className="mt-4 grid grid-cols-2 gap-3">
 <div className="bg-green-50 p-3 rounded-lg">
 <div className="text-xs text-gray-600 mb-1">Best Day</div>
 <div className="text-sm font-bold text-green-600">
 {profitChartData.length > 0 
 ? `₹${Math.max(...profitChartData.map(d => d.profit)).toLocaleString()}`
 : 'N/A'}
 </div>
 </div>
 <div className="bg-red-50 p-3 rounded-lg">
 <div className="text-xs text-gray-600 mb-1">Worst Day</div>
 <div className="text-sm font-bold text-red-600">
 {profitChartData.length > 0 
 ? `₹${Math.min(...profitChartData.map(d => d.profit)).toLocaleString()}`
 : 'N/A'}
 </div>
 </div>
 </div>
 </>
 ) : (
 <div className="text-center text-gray-500 py-8">No data available</div>
 )}
 </div>

 {/* Commission % and Ad Spend trends - previously only shown as flat current-period
 tiles, now charted over time so a creeping commission rate or ad spend spike is
 visible before it eats into margin (Analytics page redesign). */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 sm:mb-6">
 <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
 Commission % Trend
 </h3>
 {commissionAdSpendChartData.length > 0 ? (
 <LazyChart height={220}>{() => (
 <ResponsiveContainer width="100%" height={220}>
 <LineChart data={commissionAdSpendChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} unit="%" />
 <Tooltip formatter={(value: number) => [`${value}%`, 'Commission']} />
 <Line type="monotone" dataKey="commissionPct" stroke="#f97316" strokeWidth={2} name="Commission %" dot={{ r: 3 }} />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 ) : (
 <div className="text-center text-gray-500 py-8 text-sm">No settlements in this period</div>
 )}
 </div>

 <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-sky-600" />
 Ad Spend Trend
 </h3>
 {commissionAdSpendChartData.length > 0 ? (
 <LazyChart height={220}>{() => (
 <ResponsiveContainer width="100%" height={220}>
 <BarChart data={commissionAdSpendChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip content={<CustomTooltip />} />
 <Bar dataKey="adSpend" fill="#0ea5e9" name="Ad Spend" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 ) : (
 <div className="text-center text-gray-500 py-8 text-sm">No settlements in this period</div>
 )}
 </div>
 </div>

 {/* Zomato Discount % of Menu Subtotal / Promo vs Flat-off charts moved to the
 Aggregator Payout tab (OnlineSalesTab.tsx), right next to the settlements they're
 derived from, using that page's own date-range filter instead of a separate one. */}

 {/* Discount by Promo Code / Channel Economics moved to the Aggregator Payout tab
 (OnlineSalesTab.tsx), right next to the settlements/orders they're derived from,
 using that page's own date-range filter instead of a separate one. */}

 {/* Channel mix over time */}
 <div className="border border-gray-200 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
 Channel Mix Over Time
 </h3>
 {channelMixChartData.length > 0 ? (
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <BarChart data={channelMixChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip content={<CustomTooltip />} />
 <Legend />
 <Bar dataKey="Offline" stackId="channel" fill="#3b82f6" />
 <Bar dataKey="Zomato" stackId="channel" fill="#ef4444" />
 <Bar dataKey="Swiggy" stackId="channel" fill="#f97316" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 ) : (
 <div className="text-center text-gray-500 py-8 text-sm">No data available</div>
 )}
 </div>

 {/* Profitability Metrics */}
 <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
 <div className="flex items-center gap-2 mb-4">
 <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
 <h3 className="text-base sm:text-lg font-semibold text-gray-900">Profitability Metrics</h3>
 </div>
 <div className="space-y-3">
 {/* Profit Margin */}
 {(() => {
 const tier = metrics.profitMargin > 30 ? 'excellent' : metrics.profitMargin > 15 ? 'good' : metrics.profitMargin > 0 ? 'low' : 'loss';
 const tierMeta = {
 excellent: { Icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-100', label: 'Excellent' },
 good: { Icon: CheckCircle, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Good' },
 low: { Icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', label: 'Low' },
 loss: { Icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Loss' },
 }[tier];
 const marginDiff = previousPeriodMetrics.totalRevenue > 0 ? metrics.profitMargin - previousPeriodMetrics.profitMargin : null;
 return (
 <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50/60 border border-orange-100">
 <div className={`w-9 h-9 rounded-lg ${tierMeta.bg} flex items-center justify-center flex-shrink-0`}>
 <tierMeta.Icon className={`w-4 h-4 ${tierMeta.color}`} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-center">
 <span className="text-xs sm:text-sm text-gray-700">Profit Margin</span>
 <span className={`text-lg font-bold tabular-nums ${metrics.profitMargin > 30 ? 'text-emerald-600' : metrics.profitMargin > 15 ? 'text-yellow-600' : 'text-red-600'}`}>
 {metrics.profitMargin.toFixed(1)}%
 </span>
 </div>
 <div className="flex items-center gap-2 mt-0.5">
 <span className="text-xs text-gray-500">{tierMeta.label}</span>
 {marginDiff !== null && (
 <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${marginDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
 {marginDiff >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 {Math.abs(marginDiff).toFixed(1)} pts {getPreviousPeriodLabel()}
 </span>
 )}
 </div>
 </div>
 </div>
 );
 })()}

 {/* Cost to Revenue Ratio */}
 {(() => {
 const efficient = metrics.totalRevenue > 0 && (metrics.totalExpenses / metrics.totalRevenue) < 0.7;
 return (
 <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50/60 border border-blue-100">
 <div className={`w-9 h-9 rounded-lg ${efficient ? 'bg-emerald-100' : 'bg-amber-100'} flex items-center justify-center flex-shrink-0`}>
 {efficient ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-center">
 <span className="text-xs sm:text-sm text-gray-700">Cost-to-Revenue</span>
 <span className={`text-lg font-bold tabular-nums ${efficient ? 'text-emerald-600' : 'text-orange-600'}`}>
 {metrics.totalRevenue > 0 ? `${((metrics.totalExpenses / metrics.totalRevenue) * 100).toFixed(1)}%` : 'N/A'}
 </span>
 </div>
 <div className="text-xs text-gray-500 mt-0.5">{efficient ? 'Efficient operations' : 'High cost ratio'}</div>
 </div>
 </div>
 );
 })()}

 {/* Average Daily Profit */}
 <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
 <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
 <TrendingUp className="w-4 h-4 text-emerald-600" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-center">
 <span className="text-xs sm:text-sm text-gray-700">Avg Daily Profit</span>
 <span className="text-lg font-bold text-emerald-600 tabular-nums">
 {profitChartData.length > 0
 ? `₹${Math.round(profitChartData.reduce((sum, d) => sum + d.profit, 0) / profitChartData.length).toLocaleString()}`
 : 'N/A'}
 </span>
 </div>
 <div className="text-xs text-gray-500 mt-0.5">Per day in selected period</div>
 </div>
 </div>

 {/* Commission Impact */}
 {metrics.commissionExpenses > 0 && (
 <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50/60 border border-orange-100">
 <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
 <Percent className="w-4 h-4 text-orange-600" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex justify-between items-center">
 <span className="text-xs sm:text-sm text-gray-700">Commission Impact</span>
 <span className="text-lg font-bold text-orange-600 tabular-nums">
 {metrics.totalRevenue > 0
 ? `${((metrics.commissionExpenses / (metrics.totalRevenue + metrics.commissionExpenses)) * 100).toFixed(1)}%`
 : 'N/A'}
 </span>
 </div>
 <div className="text-xs text-gray-500 mt-0.5">
 ₹{metrics.commissionExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })} paid to aggregators
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 )}
 </>
 );
}
