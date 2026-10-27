// Insights > Cash tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { Wallet } from 'lucide-react';
import { LazyChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from '../../charts/lazyRecharts';
import { type AnalyticsData } from '../useAnalyticsData';
import { TimeFilterBar, makeRenderers } from './shared';

export function CashTab({ d }: { d: AnalyticsData }) {
 const { effectiveStoreId, timeFilterChoice, setTimeFilterChoice, customDateRange, setDateRange, getPeriodLabel, previousPeriodMetrics, cashReconciliationChartData, cashReconciliationByStore, totalCashDiscrepancy, realizedProfit, totalPosSalesDiscrepancy } = d;
 const { renderPctChangeOnColor } = makeRenderers(d);
 return (
 <>
 {(
 <div>
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/30 flex-shrink-0">
 <Wallet className="w-5 h-5 text-white" />
 </div>
 <div>
 <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Cash & Reconciliation</h2>
 <p className="text-xs sm:text-sm text-gray-500">Approved cash/Paytm discrepancy trend {getPeriodLabel()}</p>
 </div>
 </div>
 <div className="w-full sm:w-auto">
 <TimeFilterBar value={timeFilterChoice} onChange={setTimeFilterChoice} range={customDateRange} onRangeChange={setDateRange} />
 </div>
 </div>
 </div>

 {/* Same saturated-gradient card language as the Overview tab. */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
 <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-red-100 mb-1">Cash Discrepancy Losses</div>
 <div className="text-2xl font-semibold">₹{totalCashDiscrepancy.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-red-100 mt-1">Approved losses {getPeriodLabel()}</div>
 {renderPctChangeOnColor(totalCashDiscrepancy, previousPeriodMetrics.cashDiscrepancy)}
 </div>
 <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Paytm Discrepancy</div>
 <div className="text-2xl font-semibold">
 ₹{cashReconciliationChartData.reduce((s, d) => s + (d['Paytm Offset'] < 0 ? Math.abs(d['Paytm Offset']) : 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
 </div>
 <div className="text-xs text-orange-100 mt-1">Shortfalls {getPeriodLabel()}</div>
 {renderPctChangeOnColor(cashReconciliationChartData.reduce((s, d) => s + (d['Paytm Offset'] < 0 ? Math.abs(d['Paytm Offset']) : 0), 0), previousPeriodMetrics.paytmDiscrepancy)}
 </div>
 <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-4 shadow-lg shadow-rose-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-rose-100 mb-1">POS Sales Discrepancy</div>
 <div className="text-2xl font-semibold">₹{totalPosSalesDiscrepancy.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-rose-100 mt-1">Cash+Paytm short of POS sales, {getPeriodLabel()}</div>
 {renderPctChangeOnColor(totalPosSalesDiscrepancy, previousPeriodMetrics.posSalesDiscrepancy)}
 </div>
 <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
 <div className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Realized Profit</div>
 <div className="text-2xl font-semibold">₹{realizedProfit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
 <div className="text-xs text-emerald-100 mt-1">Net profit after discrepancy losses</div>
 {renderPctChangeOnColor(realizedProfit, previousPeriodMetrics.netProfit)}
 </div>
 </div>

 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Cash & Paytm Offset Trend</h3>
 <p className="text-xs sm:text-sm text-gray-600 mb-4">Positive = surplus, negative = shortfall, summed across {effectiveStoreId ? 'this store' : 'all stores'}</p>
 {cashReconciliationChartData.length === 0 ? (
 <div className="text-sm text-gray-500 py-8 text-center">No sales data for this period.</div>
 ) : (
 <LazyChart height={300}>{() => (
 <ResponsiveContainer width="100%" height={300}>
 <BarChart data={cashReconciliationChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
 <Legend />
 <Bar dataKey="Cash Offset" fill="#14b8a6" radius={[4, 4, 0, 0]} />
 <Bar dataKey="Paytm Offset" fill="#f59e0b" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 )}
 </div>

 {!effectiveStoreId && cashReconciliationByStore.length > 0 && (
 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 border-l-4 border-red-400">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Stores With Discrepancy Losses</h3>
 <p className="text-xs sm:text-sm text-gray-600 mb-4">Worst first, {getPeriodLabel()}</p>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 text-xs uppercase">
 <th className="pb-2">Store</th>
 <th className="pb-2 text-right">Cash Loss</th>
 <th className="pb-2 text-right">Paytm Loss</th>
 <th className="pb-2 text-right">Total</th>
 </tr>
 </thead>
 <tbody>
 {cashReconciliationByStore.map(row => (
 <tr key={row.storeId} className="border-t border-gray-100">
 <td className="py-2 text-gray-900">{row.storeName}</td>
 <td className="py-2 text-right text-gray-600">₹{row.cashLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
 <td className="py-2 text-right text-gray-600">₹{row.paytmLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
 <td className="py-2 text-right text-red-600">₹{row.totalLoss.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>
 )}
 </>
 );
}
