import { useCallback, useRef, memo, lazy, Suspense } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, ClipboardCheck, UserX, Users, Factory, Check, X, ClipboardList, CheckCircle, Settings, RefreshCw, BarChart3, Wallet, ChevronRight, CalendarDays, Percent } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../utils/api';
import { BunnyLanguagePicker } from './BunnyLanguagePicker';
import { SectionSkeleton, ModalSkeleton } from './LoadingSkeleton';
import { useAnalyticsData, type AnalyticsProps } from './insights/useAnalyticsData';
import { RevenueTab } from './insights/tabs/RevenueTab';
import { UnitEconomicsTab } from './insights/tabs/UnitEconomicsTab';
import { CostsTab } from './insights/tabs/CostsTab';
import { CashTab } from './insights/tabs/CashTab';
import { ItemsTab } from './insights/tabs/ItemsTab';
import { OverviewTab } from './insights/tabs/OverviewTab';
import { ProductionTab } from './insights/tabs/ProductionTab';
import { TrendsTab } from './insights/tabs/TrendsTab';
import { SlaTab } from './insights/tabs/SlaTab';
import { RecalibrationTab } from './insights/tabs/RecalibrationTab';

const ProductionRequests = lazy(() => import('./ProductionRequests').then((m) => ({ default: m.ProductionRequests })));
const MonthlyStockRecalibration = lazy(() => import('./MonthlyStockRecalibration').then((m) => ({ default: m.MonthlyStockRecalibration })));
const SalaryBreakdownModal = lazy(() => import('./SalaryBreakdownModal').then((m) => ({ default: m.SalaryBreakdownModal })));
const CommissionBreakdownModal = lazy(() => import('./CostBreakdownModals').then((m) => ({ default: m.CommissionBreakdownModal })));
const InterestBreakdownModal = lazy(() => import('./CostBreakdownModals').then((m) => ({ default: m.InterestBreakdownModal })));
const CostLineModal = lazy(() => import('./CostLineModal').then((m) => ({ default: m.CostLineModal })));
const ExpenseBreakdownModal = lazy(() => import('./ExpenseBreakdownModal').then((m) => ({ default: m.ExpenseBreakdownModal })));

export function Analytics(props: AnalyticsProps) {
 const latestProps = useRef(props);
 latestProps.current = props;
 const toManageItems = useCallback(() => latestProps.current.onNavigateToManageItems?.(), []);
 const toProductionManagement = useCallback(() => latestProps.current.onNavigateToProductionManagement?.(), []);
 return (
 <AnalyticsScreen
 {...props}
 onNavigateToManageItems={props.onNavigateToManageItems ? toManageItems : undefined}
 onNavigateToProductionManagement={props.onNavigateToProductionManagement ? toProductionManagement : undefined}
 />
 );
}

const AnalyticsScreen = memo(function AnalyticsScreen({ context, selectedStoreId, highlightRequestId, initialTab, onNavigateToManageItems, onNavigateToProductionManagement }: AnalyticsProps) {
 const d = useAnalyticsData({ context, selectedStoreId, highlightRequestId, initialTab, onNavigateToManageItems, onNavigateToProductionManagement });
 const { onlineLoans, isClusterHead, isManager, isAudit, isProductionIncharge, isStoreIncharge, isOperationsManager, analyticsMode, setAnalyticsMode, effectiveStoreId, activeView, setActiveView, selectedExpenseCategory, setSelectedExpenseCategory, costLine, setCostLine, showLeaveModal, setShowLeaveModal, loadingLeaves, showRecalibration, setShowRecalibration, stores, setLatestRecalibration, setPreviousMonthStock, stockAlertThresholds, setStockAlertThresholds, showStockAlertModal, setShowStockAlertModal, tempStockAlertThresholds, setTempStockAlertThresholds, momosPerPlate, setMomosPerPlate, showPlateSettingsModal, setShowPlateSettingsModal, tempMomosPerPlate, setTempMomosPerPlate, selectedProductionHouseId, setSelectedProductionHouseId, loading, fetchRecalibrationAndCalculateOpeningBalance, monthLeaveSummary, getPeriodLabel, activeSettlementDateRange, metrics, salaryBreakdownData, commissionBreakdownSettlements, buildCostLine } = d;


 if (loading) {
 return (
 <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
 <div className="text-gray-500">Loading analytics...</div>
 </div>
 );
 }


 return (
 <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
 <div className="max-w-7xl mx-auto">
 {/* Header - only rendered when the Analytics Mode Selector hero card below won't
 also show its own "Analytics Dashboard" title, so the two never stack and repeat
 the same heading (that used to happen for every cluster head/manager/incharge/audit
 user - this header is only needed for roles that skip the hero card entirely). */}
 {!(isClusterHead || isManager || isProductionIncharge || isStoreIncharge || isAudit) && (
 <div className="mb-4 sm:mb-8 flex items-center justify-between">
 <div className="flex items-center gap-3 sm:gap-4">
 <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
 <BarChart3 className="w-6 h-6 text-white" />
 </div>
 <div>
 <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Analytics Dashboard</h1>
 <p className="text-sm sm:text-base text-gray-500">Track revenue, expenses, and profitability</p>
 </div>
 </div>
 </div>
 )}

 {/* Cleanup Button for Cluster Heads - Removed */}
 {isClusterHead && false && (
 <div className="flex gap-2">
 {/* Migration Button for Sales Discrepancy */}
 <button
 onClick={async () => {
 if (!confirm('🔄 This will update all sales records to lock their discrepancy values.\n\nThis prevents discrepancies from changing when inventory is added later.\n\nThis is a ONE-TIME operation. Continue?')) {
 return;
 }
 
 try {
 if (!context.user?.accessToken) {
 alert('Not authenticated');
 return;
 }
 
 // Call the migration API endpoint
 const result = await api.migrateSalesDiscrepancy(context.user.accessToken);
 
 if (result.updated === 0) {
 alert('✅ All sales records already have locked discrepancy values!');
 return;
 }
 


 
 alert(`✅ Migration Complete!\n\nUpdated ${result.updated} of ${result.total} sales records.\n\nPlease refresh the page.`);
 
 // Reload the page
 window.location.reload();
 } catch (error) {
 console.error('Migration error:', error);
 alert('Failed to migrate sales data. Please try again.');
 }
 }}
 className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2 shadow-lg"
 title="Lock sales discrepancy values (one-time migration)"
 >
 <RefreshCw className="w-4 h-4" />
 <span className="hidden sm:inline">Fix Discrepancy</span>
 <span className="sm:hidden">Fix</span>
 </button>
 
 {/* Migration Button for Stock Request Timestamps */}
 <button
 onClick={async () => {
 if (!confirm('🔄 This will update all stock request IDs to include timestamps.\\n\\nThis enables proper tracking of when requests were created in the Performance Tracker view.\\n\\nThis is a ONE-TIME operation. Continue?')) {
 return;
 }
 
 try {
 if (!context.user?.accessToken) {
 alert('Not authenticated');
 return;
 }
 
 const result = await api.migrateStockRequestTimestamps(context.user.accessToken);
 
 if (result.updated === 0) {
 alert('✅ All stock requests already have timestamp IDs!');
 return;
 }
 
 alert(`✅ Migration Complete!\\n\\nUpdated ${result.updated} stock requests (${result.skipped} already had timestamps).\\n\\nPlease refresh the page.`);
 window.location.reload();
 } catch (error) {
 console.error('Migration error:', error);
 alert('Failed to migrate stock requests. Please try again.');
 }
 }}
 className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center gap-2 shadow-lg"
 title="Add timestamps to stock request IDs (one-time migration)"
 >
 <RefreshCw className="w-4 h-4" />
 <span className="hidden sm:inline">Fix Stock Requests</span>
 <span className="sm:hidden">Fix SR</span>
 </button>
 
 <button
 onClick={async () => {
 if (!confirm('⚠️ This will remove all duplicate entries from the database.\n\nDuplicates found:\n- Inventory items\n- Overhead items\n- Sales records\n\nContinue?')) {
 return;
 }
 
 try {
 if (!context.user?.accessToken) {
 alert('Not authenticated');
 return;
 }
 
 const result = await api.cleanupDuplicates(context.user.accessToken);
 
 alert(`✅ Cleanup Complete!\n\nRemoved ${result.removed} duplicates:\n\n` +
 `Inventory: ${result.details.inventory.removed} removed (${result.details.inventory.before} → ${result.details.inventory.after})\n` +
 `Overheads: ${result.details.overheads.removed} removed (${result.details.overheads.before} → ${result.details.overheads.after})\n` +
 `Sales: ${result.details.sales.removed} removed (${result.details.sales.before} → ${result.details.sales.after})\n\n` +
 `Please refresh the page to see updated data.`
 );
 
 // Reload the page to fetch clean data
 window.location.reload();
 } catch (error) {
 console.error('Cleanup error:', error);
 alert('Failed to cleanup duplicates. Please try again.');
 }
 }}
 className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm flex items-center gap-2 shadow-lg"
 title="Remove duplicate entries from database"
 >
 <ClipboardCheck className="w-4 h-4" />
 <span className="hidden sm:inline">Clean Database</span>
 <span className="sm:hidden">Clean DB</span>
 </button>
 </div>
 )}
 </div>

 {/* Bunny's language for this person - voice, AI answers and read-aloud (utils/bunnyLanguage.ts). */}
 <BunnyLanguagePicker />

 {/* Leave Alert Bar - covers the rest of the month (today through month-end), not just
 today and not days that have already passed, so a cluster head/manager sees what's
 coming over a more useful horizon than just the current week. */}
 {!loadingLeaves && (context.user?.role === 'cluster_head' || context.user?.role === 'manager') && (
 <button
 onClick={() => setShowLeaveModal(true)}
 className={`w-full text-left mb-4 sm:mb-6 rounded-2xl shadow-sm border p-4 sm:p-5 transition-all hover:shadow-md ${
 monthLeaveSummary.upcomingCount === 0
 ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200/70'
 : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/70'
 }`}
 >
 <div className="flex items-center gap-4">
 <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
 monthLeaveSummary.upcomingCount === 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'
 }`}>
 {monthLeaveSummary.upcomingCount === 0 ? <Users className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <p className={`font-semibold ${monthLeaveSummary.upcomingCount === 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
 {monthLeaveSummary.upcomingCount === 0
 ? 'Everyone is working this month'
 : `${monthLeaveSummary.upcomingCount} leave${monthLeaveSummary.upcomingCount === 1 ? '' : 's'} this month`}
 </p>
 <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-white/70 border border-gray-200 rounded-full px-2 py-0.5">
 <CalendarDays className="w-3 h-3" /> {monthLeaveSummary.rangeLabel}
 </span>
 </div>
 <p className={`text-sm mt-1 ${monthLeaveSummary.upcomingCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
 {monthLeaveSummary.upcomingCount === 0
 ? 'No employees on leave across all stores'
 : (
 <>
 Across all stores
 {(monthLeaveSummary.fullDayCount > 0 || monthLeaveSummary.halfDayCount > 0) && (
 <>
 {' · '}
 {monthLeaveSummary.fullDayCount > 0 && `${monthLeaveSummary.fullDayCount} full day${monthLeaveSummary.fullDayCount === 1 ? '' : 's'}`}
 {monthLeaveSummary.fullDayCount > 0 && monthLeaveSummary.halfDayCount > 0 && ', '}
 {monthLeaveSummary.halfDayCount > 0 && `${monthLeaveSummary.halfDayCount} half day${monthLeaveSummary.halfDayCount === 1 ? '' : 's'}`}
 </>
 )}
 </>
 )}
 </p>
 </div>
 <ChevronRight className={`w-5 h-5 flex-shrink-0 ${monthLeaveSummary.upcomingCount === 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
 </div>
 </button>
 )}

 {/* Analytics Mode Selector - For Cluster Heads, Managers, Production Incharges, Store Incharges, and Audit Users.
 A dark hero card with a frosted-glass segmented toggle reads as a deliberate piece of
 UI rather than the flat pale-orange box this used to be. */}
 {(isClusterHead || isManager || isProductionIncharge || isStoreIncharge || isAudit) && (
 <div className="relative overflow-hidden rounded-2xl shadow-xl mb-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-5">
 <div className="absolute -top-16 -right-10 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
 <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/40 flex-shrink-0">
 <BarChart3 className="w-5 h-5 text-white" />
 </div>
 <div className="min-w-0">
 <h3 className="text-white font-bold tracking-tight text-base sm:text-lg">
 {isStoreIncharge ? 'Store Analytics Dashboard' : isAudit ? 'Audit Analytics Dashboard' : 'Analytics Dashboard'}
 </h3>
 <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
 {analyticsMode === 'store'
 ? 'Track revenue, expenses, and profitability across stores'
 : 'Monitor production metrics, wastage, and SOP compliance'}
 </p>
 </div>
 </div>
 {/* Only show mode selector if not Store Incharge (they only see Store Analytics) */}
 {!isStoreIncharge && (
 <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-xl p-1 self-start sm:self-auto border border-white/10 flex-shrink-0">
 <button
 onClick={() => setAnalyticsMode('store')}
 className={`px-4 py-2 rounded-lg transition-all duration-200 ${
 analyticsMode === 'store'
 ? 'bg-white text-slate-900 shadow-md'
 : 'text-slate-300 hover:text-white'
 }`}
 >
 <div className="flex items-center gap-2">
 <ShoppingCart className="w-4 h-4" />
 <span className="text-sm font-semibold">Store Analytics</span>
 </div>
 </button>
 <button
 onClick={() => setAnalyticsMode('production')}
 className={`px-4 py-2 rounded-lg transition-all duration-200 ${
 analyticsMode === 'production'
 ? 'bg-white text-slate-900 shadow-md'
 : 'text-slate-300 hover:text-white'
 }`}
 >
 <div className="flex items-center gap-2">
 <Factory className="w-4 h-4" />
 <span className="text-sm font-semibold">Production Analytics</span>
 </div>
 </button>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Store selection itself now lives in exactly one place: the global store picker at
 the top of the app (cluster head only). This used to also have its own separate
 dropdown here that could fall out of sync with that global one - removed rather than
 kept in sync, so there's only ever one control to look at. */}
 {analyticsMode === 'store' && !(isClusterHead || isManager || isProductionIncharge || isAudit) && context.user?.storeId && (
 // Info banner for plain employees, who don't get the global store picker - shows
 // which store their data is for, without offering a (redundant, permission-less) choice.
 <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-2xl shadow-lg mb-6 p-4 border border-blue-200">
 <div className="flex items-center gap-3">
 <ShoppingCart className="w-6 h-6 text-blue-600" />
 <div>
 <h3 className="text-blue-900" style={{ fontSize: '16px', fontWeight: '700' }}>
 Your Store Analytics
 </h3>
 <p className="text-blue-700 text-sm mt-1">
 Viewing data for: {context.stores?.find(s => s.id === context.user?.storeId)?.name || 'Your Store'}
 </p>
 </div>
 </div>
 </div>
 )}

 {analyticsMode === 'store' && isProductionIncharge && effectiveStoreId && (
 <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-2xl shadow-lg mb-6 p-4 border border-blue-200">
 <div className="flex items-center gap-3">
 <ShoppingCart className="w-6 h-6 text-blue-600" />
 <div>
 <h3 className="text-blue-900" style={{ fontSize: '16px', fontWeight: '700' }}>Store Analytics</h3>
 <p className="text-blue-700 text-sm mt-1">
 Viewing: {context.stores?.find((s) => s.id === effectiveStoreId)?.name || 'Your store'} (store costs plus its production house)
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Production House Selector - Only in Production Analytics Mode */}
 {analyticsMode === 'production' && (
 <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl shadow-lg mb-6 p-4 border border-orange-200">
 {(isClusterHead || isManager || isAudit) ? (
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h3 className="text-orange-900" style={{ fontSize: '16px', fontWeight: '700' }}>
 Production House Selection
 </h3>
 <p className="text-orange-700 text-sm mt-1">
 View production metrics and recalibration data for a specific production house
 </p>
 </div>
 <select
 value={selectedProductionHouseId || ''}
 onChange={(e) => {
 const newValue = e.target.value || null;
 setSelectedProductionHouseId(newValue);
 }}
 className="px-4 py-2 bg-white border-2 border-orange-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
 style={{ fontSize: '14px', fontWeight: '600' }}
 >
 {!selectedProductionHouseId && <option value="">Select Production House</option>}
 {context.productionHouses?.map((ph) => (
 <option key={ph.id} value={ph.id}>
 {ph.name} (ID: {ph.id})
 </option>
 ))}
 </select>
 </div>
 ) : isProductionIncharge && context.user?.storeId ? (
 // Info banner for production incharge showing their production house
 <div className="flex items-center gap-3">
 <Factory className="w-6 h-6 text-orange-600" />
 <div>
 <h3 className="text-orange-900" style={{ fontSize: '16px', fontWeight: '700' }}>
 Your Production House Analytics
 </h3>
 <p className="text-orange-700 text-sm mt-1">
 Viewing data for: {(() => {
 const userStore = context.stores?.find(s => s.id === context.user?.storeId);
 const productionHouse = context.productionHouses?.find(ph => ph.id === userStore?.productionHouseId);
 return productionHouse?.name || 'Your Production House';
 })()}
 </p>
 </div>
 </div>
 ) : null}
 </div>
 )}

 {/* View Selector */}
 <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl shadow-lg mb-6 p-2 border border-gray-200">
 {analyticsMode === 'store' ? (
 // Store Analytics Tabs - reorganized around business questions rather than the
 // org chart (see the Analytics page redesign). 'profit'/'expense'/'sales' keep
 // their original internal activeView values, just relabeled + given new content.
 <div className="grid grid-cols-2 lg:grid-cols-5 xl:grid-cols-9 gap-2">
 <button
 onClick={() => setActiveView('overview')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'overview'
 ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <BarChart3 className={`w-6 h-6 ${activeView === 'overview' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Overview</span>
 </div>
 {activeView === 'overview' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-purple-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('profit')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'profit'
 ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <TrendingUp className={`w-6 h-6 ${activeView === 'profit' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Revenue & Channels</span>
 </div>
 {activeView === 'profit' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-emerald-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('sales')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'sales'
 ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <ShoppingCart className={`w-6 h-6 ${activeView === 'sales' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Item Performance</span>
 </div>
 {activeView === 'sales' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('expense')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'expense'
 ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <DollarSign className={`w-6 h-6 ${activeView === 'expense' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Costs & Margins</span>
 </div>
 {activeView === 'expense' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-rose-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('unit-economics')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'unit-economics'
 ? 'bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <Percent className={`w-6 h-6 ${activeView === 'unit-economics' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Unit Economics</span>
 </div>
 {activeView === 'unit-economics' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-violet-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('cash-reconciliation')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'cash-reconciliation'
 ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <Wallet className={`w-6 h-6 ${activeView === 'cash-reconciliation' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Cash & Reconciliation</span>
 </div>
 {activeView === 'cash-reconciliation' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-teal-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('production-requests')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'production-requests'
 ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <ClipboardList className={`w-6 h-6 ${activeView === 'production-requests' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Stock Requests</span>
 </div>
 {activeView === 'production-requests' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('stock-request-analysis')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'stock-request-analysis'
 ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <BarChart3 className={`w-6 h-6 ${activeView === 'stock-request-analysis' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Store-Production SLA</span>
 </div>
 {activeView === 'stock-request-analysis' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => setActiveView('trends')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'trends'
 ? 'bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-lg shadow-violet-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <TrendingUp className={`w-6 h-6 ${activeView === 'trends' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Trends &amp; Growth</span>
 </div>
 {activeView === 'trends' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-violet-500 rounded-full"></div>
 )}
 </button>
 </div>
 ) : (
 // Production Analytics Tabs - Production, Recalibration, and (for whoever can
 // actually use it) Production Management itself - opened from here instead of its
 // own top-level menu entry, same idea as "Manage Items" opening Inventory Items
 // from Store Analytics. This tab navigates away to a different page (App.tsx's
 // ProductionManagement.tsx) rather than switching a local sub-view, so it calls
 // onNavigateToProductionManagement instead of this component's own setActiveView.
 <div className={`grid gap-2 ${(isProductionIncharge || isOperationsManager || isClusterHead) && onNavigateToProductionManagement ? 'grid-cols-3' : 'grid-cols-2'}`}>
 <button
 onClick={() => setActiveView('production')}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'production'
 ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <Factory className={`w-6 h-6 ${activeView === 'production' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Production</span>
 </div>
 {activeView === 'production' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-orange-500 rounded-full"></div>
 )}
 </button>

 <button
 onClick={() => {
 setActiveView('recalibration-reports');
 }}
 className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border ${
 activeView === 'recalibration-reports'
 ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/50 border-transparent'
 : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md'
 }`}
 >
 <div className="flex flex-col items-center gap-2">
 <CheckCircle className={`w-6 h-6 ${activeView === 'recalibration-reports' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
 <span className="font-semibold text-sm">Recalibration</span>
 </div>
 {activeView === 'recalibration-reports' && (
 <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-teal-500 rounded-full"></div>
 )}
 </button>

 {(isProductionIncharge || isOperationsManager || isClusterHead) && onNavigateToProductionManagement && (
 <button
 onClick={onNavigateToProductionManagement}
 className="group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md"
 title="Open Production Management to log today's production"
 >
 <div className="flex flex-col items-center gap-2">
 <ClipboardList className="w-6 h-6 group-hover:scale-110 transition-transform" />
 <span className="font-semibold text-sm">Production Management</span>
 </div>
 </button>
 )}
 </div>
 )}
 </div>

 {/* Profit Analytics View */}
 {activeView === 'profit' && <RevenueTab d={d} />}

 {/* Unit Economics View - the same P&L as the cards above, laid out as a margin ladder */}
 {activeView === 'unit-economics' && <UnitEconomicsTab d={d} />}

 {/* Expense Breakdown View */}
 {activeView === 'expense' && <CostsTab d={d} />}

 {/* Cash & Reconciliation View - trend of the cash/Paytm discrepancy work built on the
 Sales page, so problem stores/days surface here instead of only one day at a time. */}
 {activeView === 'cash-reconciliation' && <CashTab d={d} />}

 {/* Sales Analytics View */}
 {activeView === 'sales' && <ItemsTab d={d} />}

 {/* Overview - a single glanceable dashboard: revenue/profit trend plus the worst
 current value in each of the areas that most need watching, so opening Analytics
 immediately surfaces what needs attention instead of digging through tabs. */}
 {activeView === 'overview' && <OverviewTab d={d} />}

 {/* Production Analytics View */}
 {activeView === 'production' && <ProductionTab d={d} />}

 {/* Production Requests View - the Recalibration sub-tab that used to live here has
 moved into ProductionRequests itself, as a "Recalibration" button beside "Manage
 Items" in the Store Stock Status card. */}
 {activeView === 'production-requests' && (
 <div>
 <Suspense fallback={<SectionSkeleton />}>
 <ProductionRequests
 context={context}
 highlightRequestId={highlightRequestId || null}
 selectedStoreId={effectiveStoreId}
 onNavigateToManageItems={onNavigateToManageItems}
 />
 </Suspense>
 </div>
 )}

 {/* Trends & Growth - weekday pattern, item mix, festival effects, calendar, AI growth ideas */}
 {activeView === 'trends' && analyticsMode === 'store' && <TrendsTab d={d} />}

 {/* Store-Production SLA Analysis View - its own top-level Store Analytics tab (not a modal
 opened from Stock Requests), covering fulfillment and pipeline timing across
 production requests. */}
 {activeView === 'stock-request-analysis' && <SlaTab d={d} />}

 {/* Recalibration Reports View - Production Analytics (unrelated to the Stock
 Requests sub-tab above - this is the production-house side, still its own tab) */}
 {activeView === 'recalibration-reports' && <RecalibrationTab d={d} />}

 {/* Monthly Stock Recalibration Modal */}
 {showRecalibration && (
 <Suspense fallback={<ModalSkeleton />}>
 <MonthlyStockRecalibration
 context={context}
 selectedStoreId={analyticsMode === 'production' ? selectedProductionHouseId : effectiveStoreId}
 currentCalculatedStock={analyticsMode === 'production' ? (window as any).__currentProductionHouseStock : undefined}
 onClose={() => {
 setShowRecalibration(false);
 // Refresh opening balance data after recalibration
 if (analyticsMode === 'production') {
 // Clear existing opening balance to force refetch
 setPreviousMonthStock(null);
 setLatestRecalibration(null);
 // Longer delay to ensure backend has processed and committed the save
 setTimeout(() => {
 fetchRecalibrationAndCalculateOpeningBalance();
 }, 1500);
 }
 }}
 onSaveSuccess={() => {
 // Clear cached data
 setPreviousMonthStock(null);
 setLatestRecalibration(null);
 (window as any).__currentProductionHouseStock = null;
 // Force immediate refetch
 setTimeout(() => {
 fetchRecalibrationAndCalculateOpeningBalance();
 }, 500);
 }}
 isProductionHouse={analyticsMode === 'production'}
 />
 </Suspense>
 )}

 {/* Stock Alert Thresholds Modal */}
 {showStockAlertModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
 <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
 {/* Header */}
 <div className="relative overflow-hidden bg-gradient-to-r from-orange-600 via-rose-500 to-orange-600 p-6 rounded-t-2xl">
 <div className="absolute inset-0 bg-white/10"></div>
 <div className="relative flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border-2 border-white/30">
 <Settings className="w-6 h-6 text-white" />
 </div>
 <div>
 <h2 className="text-2xl text-white">Stock Alert Thresholds</h2>
 <p className="text-white/80 text-sm">Customize alert levels for each momo type</p>
 </div>
 </div>
 <button
 onClick={() => {
 setShowStockAlertModal(false);
 setTempStockAlertThresholds({});
 }}
 className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center border-2 border-white/30 hover:bg-white/30 transition-all"
 >
 <X className="w-6 h-6 text-white" />
 </button>
 </div>
 </div>

 {/* How It Works */}
 <div className="p-6 bg-blue-50 border-b-2 border-blue-200">
 <h3 className="text-gray-900 font-semibold mb-2">How it works:</h3>
 <p className="text-sm text-gray-700 mb-3">
 Set three threshold levels for each momo type. When stock falls below these levels, color-coded alerts will appear on the stock cards.
 </p>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
 <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-green-200">
 <div className="w-4 h-4 bg-green-500 rounded"></div>
 <span className="text-xs text-gray-700">High: Stock above high threshold</span>
 </div>
 <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-yellow-200">
 <div className="w-4 h-4 bg-yellow-500 rounded"></div>
 <span className="text-xs text-gray-700">Medium: Between medium and high</span>
 </div>
 <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-orange-200">
 <div className="w-4 h-4 bg-orange-500 rounded"></div>
 <span className="text-xs text-gray-700">Low: Between low and medium</span>
 </div>
 <div className="flex items-center gap-2 bg-white rounded-lg p-2 border border-red-200">
 <div className="w-4 h-4 bg-red-500 rounded"></div>
 <span className="text-xs text-gray-700">Critical: Below low threshold or zero</span>
 </div>
 </div>
 </div>

 {/* Threshold Inputs */}
 <div className="p-6 space-y-6">
 {(() => {
 // Get dynamic momo types from inventory items
 const finishedProducts = context.inventoryItems?.filter(item => 
 item.category === 'finished_product' && item.isActive
 ) || [];

 const momoTypesList = finishedProducts.map(item => {
 const camelKey = item.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
 return {
 key: item.name,
 camelKey,
 label: item.displayName
 };
 });

 return momoTypesList.map(({ key, camelKey, label }) => {
 const currentThresholds = tempStockAlertThresholds[camelKey] ?? stockAlertThresholds[camelKey] ?? { high: 600, medium: 300, low: 150 };
 
 return (
 <div key={camelKey} className="bg-gradient-to-r from-orange-50 to-rose-50 border-2 border-orange-200 rounded-xl p-4">
 <h3 className="text-gray-900 font-semibold mb-3">{label}</h3>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {/* High Threshold */}
 <div>
 <label className="text-xs text-green-700 font-semibold mb-1 block">High Threshold (plates)</label>
 <input
 type="number"
 value={currentThresholds.high}
 onChange={(e) => {
 setTempStockAlertThresholds({
 ...tempStockAlertThresholds,
 [camelKey]: {
 ...currentThresholds,
 high: Number(e.target.value)
 }
 });
 }}
 className="w-full px-3 py-2 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-green-50"
 placeholder="e.g., 1200"
 />
 </div>

 {/* Medium Threshold */}
 <div>
 <label className="text-xs text-yellow-700 font-semibold mb-1 block">Medium Threshold (plates)</label>
 <input
 type="number"
 value={currentThresholds.medium}
 onChange={(e) => {
 setTempStockAlertThresholds({
 ...tempStockAlertThresholds,
 [camelKey]: {
 ...currentThresholds,
 medium: Number(e.target.value)
 }
 });
 }}
 className="w-full px-3 py-2 border-2 border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-yellow-50"
 placeholder="e.g., 600"
 />
 </div>

 {/* Low Threshold */}
 <div>
 <label className="text-xs text-red-700 font-semibold mb-1 block">Low Threshold (plates)</label>
 <input
 type="number"
 value={currentThresholds.low}
 onChange={(e) => {
 setTempStockAlertThresholds({
 ...tempStockAlertThresholds,
 [camelKey]: {
 ...currentThresholds,
 low: Number(e.target.value)
 }
 });
 }}
 className="w-full px-3 py-2 border-2 border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-red-50"
 placeholder="e.g., 300"
 />
 </div>
 </div>
 </div>
 );
 });
 })()}
 </div>

 {/* Footer */}
 <div className="p-6 bg-gray-50 rounded-b-2xl border-t-2 border-gray-200 flex justify-between items-center">
 <button
 onClick={() => {
 setShowStockAlertModal(false);
 setTempStockAlertThresholds({});
 }}
 className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
 >
 Cancel
 </button>
 <button
 onClick={() => {
 setStockAlertThresholds(tempStockAlertThresholds);
 setShowStockAlertModal(false);
 setTempStockAlertThresholds({});
 toast.success('Stock alert thresholds updated successfully');
 }}
 className="px-6 py-3 bg-gradient-to-r from-orange-600 to-rose-500 text-white rounded-xl hover:from-orange-700 hover:to-rose-600 transition-all flex items-center gap-2"
 >
 <Check className="w-5 h-5" />
 Save Thresholds
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Plate Conversion Settings Modal */}
 {showPlateSettingsModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
 <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
 {/* Header */}
 <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 p-6 rounded-t-2xl">
 <div className="absolute inset-0 bg-white/10"></div>
 <div className="relative flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center border-2 border-white/30">
 <Settings className="w-6 h-6 text-white" />
 </div>
 <div>
 <h2 className="text-2xl text-white">Plate Conversion Settings</h2>
 <p className="text-white/80 text-sm">Configure momos per plate</p>
 </div>
 </div>
 <button
 onClick={() => {
 setShowPlateSettingsModal(false);
 setTempMomosPerPlate(momosPerPlate);
 }}
 className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center border-2 border-white/30 hover:bg-white/30 transition-all"
 >
 <X className="w-6 h-6 text-white" />
 </button>
 </div>
 </div>

 {/* Explanation */}
 <div className="p-6 bg-blue-50 border-b-2 border-blue-200">
 <h3 className="text-gray-900 font-semibold mb-2">How it works:</h3>
 <p className="text-sm text-gray-700">
 Stock will be displayed as both pieces and plates. For example, if you have 170 momos and each plate contains 6 momos, 
 it will show as <span className="font-mono bg-white px-2 py-1 rounded">170 pcs / 28 plates</span>.
 </p>
 </div>

 {/* Input */}
 <div className="p-6">
 <label className="text-gray-900 font-semibold mb-3 block">
 Momos Per Plate
 </label>
 <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-4">
 <input
 type="number"
 min="1"
 max="20"
 value={tempMomosPerPlate}
 onChange={(e) => {
 const value = Number(e.target.value);
 if (value >= 1 && value <= 20) {
 setTempMomosPerPlate(value);
 }
 }}
 className="w-full px-4 py-3 border-2 border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-center text-2xl font-bold"
 placeholder="6"
 />
 <p className="text-xs text-blue-700 mt-2 text-center">
 Enter a number between 1 and 20
 </p>
 </div>
 
 {/* Preview */}
 <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
 <p className="text-xs text-gray-600 mb-2">Preview:</p>
 <div className="flex items-baseline gap-2">
 <span className="text-sm text-gray-700">Stock Available:</span>
 <span className="text-lg font-bold text-blue-600">
 170 pcs / {Math.round(170 / tempMomosPerPlate)} plates
 </span>
 </div>
 </div>
 </div>

 {/* Footer */}
 <div className="p-6 bg-gray-50 rounded-b-2xl border-t-2 border-gray-200 flex justify-between items-center">
 <button
 onClick={() => {
 setShowPlateSettingsModal(false);
 setTempMomosPerPlate(momosPerPlate);
 }}
 className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
 >
 Cancel
 </button>
 <button
 onClick={() => {
 setMomosPerPlate(tempMomosPerPlate);
 localStorage.setItem('momosPerPlate', tempMomosPerPlate.toString());
 setShowPlateSettingsModal(false);
 toast.success(`Plate conversion updated: ${tempMomosPerPlate} momos per plate`);
 }}
 className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl hover:from-blue-700 hover:to-blue-600 transition-all flex items-center gap-2"
 >
 <Check className="w-5 h-5" />
 Save Settings
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Leave Details Modal - grouped by day (today through the end of the current month),
 past days already dropped by monthLeaveSummary itself. */}
 {showLeaveModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-ai-private>
 <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
 {/* Modal Header */}
 <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
 <div className="flex items-center gap-3">
 <CalendarDays className="w-6 h-6" />
 <div>
 <h3 className="text-xl leading-tight">Leave Schedule</h3>
 <p className="text-xs text-white/80 mt-0.5">{monthLeaveSummary.rangeLabel}</p>
 </div>
 </div>
 <button
 onClick={() => setShowLeaveModal(false)}
 className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Modal Body */}
 <div className="p-6 overflow-y-auto flex-1">
 {monthLeaveSummary.upcomingCount === 0 ? (
 <div className="text-center py-8">
 <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
 <Users className="w-8 h-8 text-emerald-600" />
 </div>
 <p className="text-lg text-gray-900 mb-2">Everyone is working this month! 🎉</p>
 <p className="text-sm text-gray-600">No employees on leave across all stores</p>
 </div>
 ) : (
 <div className="space-y-5">
 <div className="flex items-center gap-3 flex-wrap">
 <p className="text-gray-700">
 <span className="text-xl font-bold text-orange-600">{monthLeaveSummary.upcomingCount}</span> {monthLeaveSummary.upcomingCount === 1 ? 'leave' : 'leaves'} scheduled
 </p>
 {monthLeaveSummary.fullDayCount > 0 && (
 <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
 {monthLeaveSummary.fullDayCount} full day{monthLeaveSummary.fullDayCount === 1 ? '' : 's'}
 </span>
 )}
 {monthLeaveSummary.halfDayCount > 0 && (
 <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
 {monthLeaveSummary.halfDayCount} half day{monthLeaveSummary.halfDayCount === 1 ? '' : 's'}
 </span>
 )}
 </div>

 {/* Days */}
 {monthLeaveSummary.days.filter(day => day.leaves.length > 0).map((day) => (
 <div key={day.date}>
 <div className="flex items-center gap-2 mb-2">
 <p className={`text-sm font-semibold ${day.isToday ? 'text-orange-600' : 'text-gray-700'}`}>
 {day.label}
 </p>
 {day.isToday && (
 <span className="text-[10px] font-semibold uppercase tracking-wide bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">
 Today
 </span>
 )}
 <span className="text-xs text-gray-400">
 · {day.leaves.length} {day.leaves.length === 1 ? 'person' : 'people'}
 </span>
 </div>

 <div className="space-y-2">
 {day.leaves.map((leave: any, index: number) => (
 <div
 key={leave.id || index}
 className="bg-orange-50/70 border border-orange-100 rounded-xl p-3.5 hover:shadow-sm transition-shadow"
 >
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-9 h-9 flex-shrink-0 bg-orange-100 rounded-full flex items-center justify-center">
 <Users className="w-4 h-4 text-orange-600" />
 </div>
 <div className="min-w-0">
 <p className="text-gray-900 font-semibold text-sm truncate">{leave.employeeName}</p>
 <div className="flex items-center gap-2 flex-wrap mt-0.5">
 <span className="text-xs text-gray-500">{leave.employeeId}</span>
 {leave.storeName && leave.storeName !== 'N/A' && (
 <span className="text-xs text-gray-500">· {leave.storeName}</span>
 )}
 </div>
 {leave.reason && (
 <p className="text-xs text-gray-600 mt-1">{leave.reason}</p>
 )}
 </div>
 </div>
 <span className={`flex-shrink-0 inline-block px-2.5 py-1 text-[11px] font-semibold rounded-full ${
 leave.leaveType === 'half' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
 }`}>
 {leave.leaveType === 'half' ? 'Half Day' : 'Full Day'}
 </span>
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Modal Footer */}
 <div className="bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200 flex-shrink-0">
 <button
 onClick={() => setShowLeaveModal(false)}
 className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
 >
 Close
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Expense Breakdown Modal (only one of these is ever open, so they share one loading
 fallback while the chosen pop-up's code arrives) */}
 <Suspense fallback={<ModalSkeleton />}>
 {selectedExpenseCategory && selectedExpenseCategory.type === 'salary' && salaryBreakdownData && (
 <SalaryBreakdownModal
 totalAmount={selectedExpenseCategory.amount}
 data={salaryBreakdownData}
 periodLabel={getPeriodLabel()}
 canSeeEmployeeDetail={context.user?.role === 'cluster_head'}
 onClose={() => setSelectedExpenseCategory(null)}
 />
 )}
 {selectedExpenseCategory && selectedExpenseCategory.type === 'commission' && (
 <CommissionBreakdownModal
 totalAmount={metrics.commissionExpenses + metrics.adSpend}
 settlements={commissionBreakdownSettlements}
 costs={metrics.online}
 range={activeSettlementDateRange}
 periodLabel={getPeriodLabel()}
 onClose={() => setSelectedExpenseCategory(null)}
 />
 )}
 {selectedExpenseCategory && selectedExpenseCategory.type === 'interest' && (
 <InterestBreakdownModal
 totalAmount={selectedExpenseCategory.amount}
 loans={onlineLoans.filter((l) => !effectiveStoreId || l.storeId === effectiveStoreId)}
 range={activeSettlementDateRange}
 periodLabel={getPeriodLabel()}
 onClose={() => setSelectedExpenseCategory(null)}
 />
 )}
 {costLine && (() => {
 const detail = buildCostLine(costLine);
 return (
 <CostLineModal
 title={detail.title}
 periodLabel={getPeriodLabel()}
 groups={detail.groups}
 note={detail.note}
 revenue={metrics.totalRevenue}
 onClose={() => setCostLine(null)}
 />
 );
 })()}
 {selectedExpenseCategory && !selectedExpenseCategory.type && (
 <ExpenseBreakdownModal
 category={selectedExpenseCategory.category}
 items={selectedExpenseCategory.items}
 totalAmount={selectedExpenseCategory.amount}
 onClose={() => setSelectedExpenseCategory(null)}
 />
 )}
 </Suspense>
 </div>
 );
});
