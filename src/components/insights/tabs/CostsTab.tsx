// Insights > Costs tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { TrendingUp, AlertCircle, DollarSign, Users, Briefcase, Receipt, Zap, Home } from 'lucide-react';
import { LazyChart, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from '../../charts/lazyRecharts';
import { type AnalyticsData } from '../useAnalyticsData';
import { CustomPieTooltip, TimeFilterBar, makeRenderers } from './shared';

export function CostsTab({ d }: { d: AnalyticsData }) {
 const { setSelectedExpenseCategory, timeFilterChoice, setTimeFilterChoice, timeFilter, customDateRange, setDateRange, metrics, profitChartData, previousPeriodMetrics, expenseBreakdown, COLORS } = d;
 const { renderPctChangeOnColor } = makeRenderers(d);
 return (
 <>
 {(
 <div>
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-md shadow-red-500/30 flex-shrink-0">
 <DollarSign className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Costs & Margins</h2>
 <p className="text-xs sm:text-sm text-gray-500">Detailed analysis of all expenses by category, and how big a bite they're taking out of revenue</p>
 </div>
 </div>

 {/* Time Filter */}
 <div className="w-full sm:w-auto">
 <TimeFilterBar value={timeFilterChoice} onChange={setTimeFilterChoice} range={customDateRange} onRangeChange={setDateRange} />
 </div>
 </div>


 {/* Total Expense Summary - same saturated-gradient card language as the Overview tab. */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
 <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white sm:col-span-2 lg:col-span-3">
 <div className="text-xs uppercase tracking-wide text-red-100 mb-1">Total Expenses</div>
 <div className="text-2xl font-semibold">₹{metrics.totalExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 {renderPctChangeOnColor(metrics.totalExpenses, previousPeriodMetrics.totalExpenses)}
 </div>
 <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-4 shadow-lg shadow-rose-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-rose-100 mb-1">Food &amp; Packaging</div>
 <div className="text-2xl font-semibold">₹{metrics.inventoryExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-rose-100 mt-1">{((metrics.inventoryExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
 {renderPctChangeOnColor(metrics.inventoryExpenses, previousPeriodMetrics.inventoryExpenses)}
 </div>
 <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl p-4 shadow-lg shadow-sky-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-sky-100 mb-1">Overhead Costs</div>
 <div className="text-2xl font-semibold">₹{metrics.overheadExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-sky-100 mt-1">{((metrics.overheadExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
 {renderPctChangeOnColor(metrics.overheadExpenses, previousPeriodMetrics.overheadExpenses)}
 </div>
 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Commission &amp; Ads</div>
 <div className="text-2xl font-semibold">₹{(metrics.commissionExpenses + metrics.adSpend).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-orange-100 mt-1">{metrics.totalExpenses > 0 ? (((metrics.commissionExpenses + metrics.adSpend) / metrics.totalExpenses) * 100).toFixed(1) : '0.0'}% of total{metrics.adSpend > 0.5 ? ` · ads ₹${Math.round(metrics.adSpend).toLocaleString('en-IN')}` : ''}</div>
 {renderPctChangeOnColor(metrics.commissionExpenses + metrics.adSpend, previousPeriodMetrics.commissionExpenses + previousPeriodMetrics.adSpend)}
 </div>
 <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 shadow-lg shadow-indigo-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-indigo-100 mb-1">Fixed Costs &amp; Equipment</div>
 <div className="text-2xl font-semibold">₹{((metrics.fixedCostsTotal || 0) + (metrics.spreadExpenses || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-indigo-100 mt-1">
 {((((metrics.fixedCostsTotal || 0) + (metrics.spreadExpenses || 0)) / metrics.totalExpenses) * 100).toFixed(1)}% of total
 {(metrics.spreadExpenses || 0) > 0 && <> · incl. ₹{Math.round(metrics.spreadExpenses).toLocaleString('en-IN')} equipment &amp; subscriptions, spread over their life</>}
 </div>
 {renderPctChangeOnColor((metrics.fixedCostsTotal || 0) + (metrics.spreadExpenses || 0), previousPeriodMetrics.fixedCostsTotal)}
 </div>
 <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-amber-100 mb-1">Salary Costs</div>
 <div className="text-2xl font-semibold">₹{metrics.salaryExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-amber-100 mt-1">{((metrics.salaryExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
 {renderPctChangeOnColor(metrics.salaryExpenses, previousPeriodMetrics.salaryExpenses)}
 </div>
 {/* Loan interest was already included in Total Expenses and in the Expense
 Distribution pie chart below (its own "💸 Loan Interest" slice) but had no tile of
 its own here - the 6 tiles never summed to the Total shown above them, with nothing
 on screen explaining the gap. Confirmed real: interest is genuinely being charged
 (accrued on outstanding loans), just previously invisible at this summary level. */}
 <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 shadow-lg shadow-purple-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-purple-100 mb-1">Loan Interest</div>
 <div className="text-2xl font-semibold">₹{(metrics.interestExpenses || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-purple-100 mt-1">{metrics.totalExpenses > 0 ? (((metrics.interestExpenses || 0) / metrics.totalExpenses) * 100).toFixed(1) : '0.0'}% of total</div>
 </div>
 </div>

 {/* Expense as % of revenue - a ratio, not just absolute ₹, so a creeping overhead
 share is visible before it becomes a crisis (Analytics page redesign). */}
 <div className="border border-gray-200 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
 <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
 Expenses as % of Revenue
 </h3>
 {profitChartData.length > 0 ? (
 <LazyChart height={240}>{() => (
 <ResponsiveContainer width="100%" height={240}>
 <LineChart data={profitChartData.map(d => ({ ...d, expensePct: d.revenue > 0 ? Math.round((d.expenses / d.revenue) * 1000) / 10 : 0 }))}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} unit="%" />
 <Tooltip formatter={(value: number) => [`${value}%`, 'Expenses']} />
 <Line type="monotone" dataKey="expensePct" stroke="#e11d48" strokeWidth={2} name="Expenses % of Revenue" dot={{ r: 3 }} />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 ) : (
 <div className="text-center text-gray-500 py-8 text-sm">No data available</div>
 )}
 </div>

 {/* Pie Chart */}
 <div className="mb-6 sm:mb-8">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">Expense Distribution</h3>
 
 {/* Large Pie Chart - Full Width */}
 <div className="relative mb-8">
 <div className="relative bg-white rounded-2xl p-3 sm:p-8 shadow-sm border border-gray-100">
 <div className="relative">
 <LazyChart height={320}>{() => (
 <ResponsiveContainer width="100%" height={320}>
 <PieChart key="expense-breakdown-pie-chart">
 <defs key="expense-pie-defs">
 {COLORS.map((color, index) => (
 <linearGradient key={`expense-gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={color} stopOpacity={0.9} />
 <stop offset="100%" stopColor={color} stopOpacity={0.7} />
 </linearGradient>
 ))}
 </defs>
 <Pie
 key="expense-pie"
 data={expenseBreakdown}
 cx="50%"
 cy="50%"
 outerRadius="85%"
 innerRadius="62%"
 fill="#8884d8"
 dataKey="value"
 paddingAngle={2}
 animationBegin={0}
 animationDuration={800}
 animationEasing="ease-out"
 >
 {expenseBreakdown.map((entry, index) => (
 <Cell
 key={`expense-cell-${entry.name}-${index}`}
 fill={`url(#gradient-${index % COLORS.length})`}
 stroke="#fff"
 strokeWidth={3}
 />
 ))}
 </Pie>
 <Tooltip key="expense-pie-tooltip" content={<CustomPieTooltip />} />
 </PieChart>
 </ResponsiveContainer>
 )}</LazyChart>
 {/* Center summary */}
 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
 <p className="text-xs text-gray-500">Total expenses</p>
 <p className="text-lg sm:text-2xl text-gray-900 font-semibold">₹{metrics.totalExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
 </div>
 </div>
 </div>
 </div>

 {/* Grouped Expense List - Full Width */}
 <div className="space-y-6">
 {/* Inventory Items */}
 {expenseBreakdown.filter(item => item.type === 'inventory').length > 0 && (
 <div>
 <h4 className="text-sm font-semibold text-gray-700 mb-2 px-2">📦 Inventory Items (Food &amp; Packaging)</h4>
 <div className="space-y-2">
 {expenseBreakdown.filter(item => item.type === 'inventory').map((item, index) => {
 const colorIndex = expenseBreakdown.indexOf(item);
 return (
 <div 
 key={item.name} 
 className="group border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer bg-white"
 onClick={() => {
 setSelectedExpenseCategory({
 category: item.name,
 items: item.items || [],
 amount: item.value
 });
 }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 flex-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ 
 background: `linear-gradient(135deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})` 
 }}
 />
 <span className="text-sm font-medium text-gray-900">{item.name}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-sm font-bold text-gray-900">₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
 <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded min-w-[3rem] text-center">
 {item.percentage}%
 </span>
 </div>
 </div>
 <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
 <div 
 className="h-full rounded-full transition-all duration-700"
 style={{ 
 width: `${item.percentage}%`,
 background: `linear-gradient(90deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})`
 }}
 />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Overhead Costs */}
 {expenseBreakdown.filter(item => item.type === 'overhead').length > 0 && (
 <div>
 <h4 className="text-sm font-semibold text-gray-700 mb-2 px-2">💼 Overhead Costs</h4>
 <div className="space-y-2">
 {expenseBreakdown.filter(item => item.type === 'overhead').map((item, index) => {
 const colorIndex = expenseBreakdown.indexOf(item);
 return (
 <div 
 key={item.name} 
 className="group border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer bg-white"
 onClick={() => {
 setSelectedExpenseCategory({
 category: item.name,
 items: item.items || [],
 amount: item.value
 });
 }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 flex-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ 
 background: `linear-gradient(135deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})` 
 }}
 />
 <span className="text-sm font-medium text-gray-900">{item.name}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-sm font-bold text-gray-900">₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
 <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded min-w-[3rem] text-center">
 {item.percentage}%
 </span>
 </div>
 </div>
 <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
 <div 
 className="h-full rounded-full transition-all duration-700"
 style={{ 
 width: `${item.percentage}%`,
 background: `linear-gradient(90deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})`
 }}
 />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Fixed Costs */}
 {expenseBreakdown.filter(item => item.type === 'fixed').length > 0 && (
 <div>
 <h4 className="text-sm font-semibold text-gray-700 mb-2 px-2">🏠 Fixed Costs &amp; Equipment (spread)</h4>
 <div className="space-y-2">
 {expenseBreakdown.filter(item => item.type === 'fixed').map((item, index) => {
 const colorIndex = expenseBreakdown.indexOf(item);
 return (
 <div 
 key={item.name} 
 className="group border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer bg-white"
 onClick={() => {
 setSelectedExpenseCategory({
 category: item.name,
 items: item.items || [],
 amount: item.value
 });
 }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 flex-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ 
 background: `linear-gradient(135deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})` 
 }}
 />
 <span className="text-sm font-medium text-gray-900">{item.name}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-sm font-bold text-gray-900">₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
 <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded min-w-[3rem] text-center">
 {item.percentage}%
 </span>
 </div>
 </div>
 <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
 <div 
 className="h-full rounded-full transition-all duration-700"
 style={{ 
 width: `${item.percentage}%`,
 background: `linear-gradient(90deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})`
 }}
 />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Salaries */}
 {expenseBreakdown.filter(item => item.type === 'commission' || item.type === 'interest').length > 0 && (
 <div>
 <h4 className="text-sm font-semibold text-gray-700 mb-2 px-2">🏦 Platform & Financing Costs</h4>
 <div className="space-y-2">
 {expenseBreakdown.filter(item => item.type === 'commission' || item.type === 'interest').map((item) => {
 const colorIndex = expenseBreakdown.indexOf(item);
 return (
 <div
 key={item.name}
 className="group border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer bg-white"
 onClick={() => {
 setSelectedExpenseCategory({
 category: item.name,
 items: [],
 amount: item.value,
 type: item.type as 'commission' | 'interest'
 });
 }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 flex-1">
 <div
 className="w-3 h-3 rounded-full"
 style={{ background: `linear-gradient(135deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})` }}
 />
 <span className="text-sm font-medium text-gray-900">{item.name}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-sm font-bold text-gray-900">₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
 <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded min-w-[3rem] text-center">{item.percentage}%</span>
 </div>
 </div>
 <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
 <div
 className="h-full rounded-full transition-all duration-700"
 style={{ width: `${item.percentage}%`, background: `linear-gradient(90deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})` }}
 />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {expenseBreakdown.filter(item => item.type === 'salary').length > 0 && (
 <div>
 <h4 className="text-sm font-semibold text-gray-700 mb-2 px-2">💰 Salaries</h4>
 <div className="space-y-2">
 {expenseBreakdown.filter(item => item.type === 'salary').map((item, index) => {
 const colorIndex = expenseBreakdown.indexOf(item);
 return (
 <div 
 key={item.name} 
 className="group border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer bg-white"
 onClick={() => {
 setSelectedExpenseCategory({
 category: item.name,
 items: item.items || [],
 amount: item.value,
 type: 'salary' as const
 });
 }}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2 flex-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ 
 background: `linear-gradient(135deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})` 
 }}
 />
 <span className="text-sm font-medium text-gray-900">{item.name}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-sm font-bold text-gray-900">₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
 <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded min-w-[3rem] text-center">
 {item.percentage}%
 </span>
 </div>
 </div>
 <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
 <div 
 className="h-full rounded-full transition-all duration-700"
 style={{ 
 width: `${item.percentage}%`,
 background: `linear-gradient(90deg, ${COLORS[colorIndex % COLORS.length]}, ${COLORS[(colorIndex + 1) % COLORS.length]})`
 }}
 />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Detailed Breakdown */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
 <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
 <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight mb-4">Salary Breakdown</h3>

 {/* Info Note for Month/Custom views */}
 {(timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom') && metrics.permanentEmployeeExpenses > 0 && (
 <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
 <div className="flex items-start gap-2">
 <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
 <p className="text-xs text-blue-800">
 <strong>Note:</strong> Both Contract Workers and Permanent Employees are payouts logged via the Payroll page, filtered to this date range. They only appear in Month/Custom views since payouts are monthly events, not daily ones.
 </p>
 </div>
 </div>
 )}

 {(() => {
 const salaryTotal = metrics.contractWorkerExpenses + metrics.permanentEmployeeExpenses;
 const contractPct = salaryTotal > 0 ? (metrics.contractWorkerExpenses / salaryTotal) * 100 : 0;
 const permanentPct = 100 - contractPct;
 const periodNote = (timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom')
 ? 'Payroll payouts for this period'
 : 'Only shown in monthly views';
 return (
 <>
 {salaryTotal > 0 && (
 <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex mb-5" role="img" aria-label={`Contract Workers ${contractPct.toFixed(1)}%, Permanent Employees ${permanentPct.toFixed(1)}%`}>
 {contractPct > 0 && <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${contractPct}%` }} />}
 {permanentPct > 0 && <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${permanentPct}%` }} />}
 </div>
 )}
 <div className="space-y-3">
 <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
 <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
 <Briefcase className="w-4 h-4 text-orange-600" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="text-sm text-gray-700">Contract Workers</span>
 {salaryTotal > 0 && <span className="text-sm font-semibold text-orange-600 tabular-nums">{contractPct.toFixed(1)}%</span>}
 </div>
 <div className="text-lg font-semibold text-gray-900 tabular-nums">₹{metrics.contractWorkerExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500 mt-0.5">{periodNote}</div>
 </div>
 </div>
 <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
 <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
 <Users className="w-4 h-4 text-rose-600" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="text-sm text-gray-700">Permanent Employees</span>
 {salaryTotal > 0 && <span className="text-sm font-semibold text-rose-600 tabular-nums">{permanentPct.toFixed(1)}%</span>}
 </div>
 <div className="text-lg font-semibold text-gray-900 tabular-nums">₹{metrics.permanentEmployeeExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500 mt-0.5">{periodNote}</div>
 </div>
 </div>
 </div>
 </>
 );
 })()}
 </div>

 <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
 <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight mb-4">Overhead Costs</h3>
 <div className="flex items-center gap-3 p-3 rounded-lg border border-yellow-100 bg-yellow-50/60">
 <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
 <Receipt className="w-5 h-5 text-yellow-700" />
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-xs text-gray-500">Total Overheads</div>
 <div className="text-xl font-semibold text-gray-900 tabular-nums">₹{metrics.overheadExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-600 mt-1">{((metrics.overheadExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total expenses</div>
 </div>
 </div>
 <div className="text-xs text-gray-500 mt-3">Fuel, travel, marketing, and other variable costs</div>
 </div>
 </div>

 {/* Fixed Costs Breakdown with Bar Chart */}
 <div className="mt-6 sm:mt-8 bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
 <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight mb-1">Fixed Costs Breakdown</h3>
 <p className="text-xs sm:text-sm text-gray-500 mb-4">Monthly fixed expenses breakdown</p>

 {/* Fixed Costs Summary Cards */}
 <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
 <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Total Fixed Costs</div>
 <div className="text-xl sm:text-2xl font-semibold tabular-nums">₹{metrics.fixedCostsTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-emerald-100 mt-1">{((metrics.fixedCostsTotal / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
 </div>
 <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
 <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Zap className="w-3.5 h-3.5 text-yellow-500" /> Electricity</div>
 <div className="text-xl sm:text-2xl font-semibold text-gray-900 tabular-nums">₹{metrics.electricityExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500">{metrics.fixedCostsTotal > 0 ? ((metrics.electricityExpenses / metrics.fixedCostsTotal) * 100).toFixed(1) : 0}% of fixed</div>
 </div>
 <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
 <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Home className="w-3.5 h-3.5 text-orange-500" /> Rent</div>
 <div className="text-xl sm:text-2xl font-semibold text-gray-900 tabular-nums">₹{metrics.rentExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500">{metrics.fixedCostsTotal > 0 ? ((metrics.rentExpenses / metrics.fixedCostsTotal) * 100).toFixed(1) : 0}% of fixed</div>
 </div>
 <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
 <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Users className="w-3.5 h-3.5 text-sky-500" /> Salaries</div>
 <div className="text-xl sm:text-2xl font-semibold text-gray-900 tabular-nums">₹{metrics.salaryExpenses.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-gray-500">{metrics.fixedCostsTotal > 0 ? ((metrics.salaryExpenses / metrics.fixedCostsTotal) * 100).toFixed(1) : 0}% of fixed</div>
 </div>
 </div>

 {/* Bar Chart for Fixed Costs */}
 {metrics.fixedCostsTotal > 0 ? (
 <div className="overflow-x-auto">
 <div className="min-w-[260px]">
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <BarChart
 data={[
 { name: 'Electricity', amount: metrics.electricityExpenses, fill: '#eab308' },
 { name: 'Rent', amount: metrics.rentExpenses, fill: '#f97316' },
 { name: 'Salaries', amount: metrics.salaryExpenses, fill: '#0ea5e9' }
 ]}
 barCategoryGap="30%"
 >
 <CartesianGrid key="fixed-costs-grid" strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
 <XAxis key="fixed-costs-xaxis" dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
 <YAxis key="fixed-costs-yaxis" stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
 <Tooltip key="fixed-costs-tooltip" cursor={{ fill: '#f8fafc' }} formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']} />
 <Bar key="fixed-costs-bar" dataKey="amount" name="Amount" radius={[8, 8, 0, 0]} maxBarSize={80}>
 {[
 { name: 'Electricity', amount: metrics.electricityExpenses, fill: '#eab308' },
 { name: 'Rent', amount: metrics.rentExpenses, fill: '#f97316' },
 { name: 'Salaries', amount: metrics.salaryExpenses, fill: '#0ea5e9' }
 ].map((entry, index) => (
 <Cell key={`fixed-costs-cell-${entry.name}-${index}`} fill={entry.fill} />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 </div>
 ) : (
 <div className="text-center text-gray-500 py-10 text-sm border border-dashed border-gray-200 rounded-lg">
 No fixed costs logged for this period yet.
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </>
 );
}
