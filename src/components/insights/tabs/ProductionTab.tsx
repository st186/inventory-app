// Insights > Production tab. Moved verbatim from Analytics.tsx (WP2 step 1, no visual change).
import { TrendingUp, Package, AlertCircle, Calendar, ClipboardCheck, Factory, Trash2, Edit, Check, X, CheckCircle, Settings, Soup, ArrowUp, ArrowDown, CalendarDays } from 'lucide-react';
import { LazyChart, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from '../../charts/lazyRecharts';
import { toast } from 'sonner@2.0.3';
import { formatDateIST, addDays } from '../../../utils/timezone';
import { DatePicker } from '../../DatePicker';
import { MOMO_TYPES, ALL_POOL_IDS, getPoolLabel } from '../../../constants/momoTypes';
import { type AnalyticsData, type WastageTimeFilter, type DateRangeType } from '../useAnalyticsData';
import { WastageTooltip, makeRenderers } from './shared';

export function ProductionTab({ d }: { d: AnalyticsData }) {
 const { context, onNavigateToManageItems, isClusterHead, isProductionIncharge, isOperationsManager, analyticsMode, effectiveStoreId, wastageTimeFilter, setWastageTimeFilter, dateRange, setShowRecalibration, stores, latestRecalibration, previousMonthStock, sopThresholds, setSopThresholds, editingSop, setEditingSop, tempSopThresholds, setTempSopThresholds, sopDiversionPercent, setSopDiversionPercent, tempDiversionPercent, setTempDiversionPercent, stockAlertThresholds, setShowStockAlertModal, setTempStockAlertThresholds, momosPerPlate, setShowPlateSettingsModal, setTempMomosPerPlate, selectedProductionHouseId, setSelectedProductionHouseId, productionData, productionLedgerRange, productionLedgerRangeLoading, selectedLedgerPoolId, setSelectedLedgerPoolId, selectedProductionDate, setSelectedProductionDate, sopComplianceDate, setSopComplianceDate, productionDateRange, setProductionDateRange, customStartDate, setCustomStartDate, customEndDate, setCustomEndDate, getDateRangeBounds, getPreviousPeriodDateRange, zipPrev, pctChange } = d;
 const { renderPrevAwareLegend } = makeRenderers(d);
 return (
 <>
 {(
 <div>
 {/* Date Range Selector for Production Data */}
 <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-2xl shadow-lg mb-6 p-4 border border-blue-200">
 <div className="flex flex-col gap-4">
 <div>
 <h3 className="text-blue-900" style={{ fontSize: '16px', fontWeight: '700' }}>
 Production Date Range
 </h3>
 <p className="text-blue-700 text-sm mt-1">
 View production data for a selected time period
 </p>
 </div>
 
 <div className="flex flex-col sm:flex-row gap-3">
 {/* Date Range Preset Buttons */}
 <div className="flex flex-wrap gap-2">
 {[
 { value: 'today' as DateRangeType, label: 'Today' },
 { value: 'yesterday' as DateRangeType, label: 'Yesterday' },
 { value: 'thisWeek' as DateRangeType, label: 'This Week' },
 { value: 'previousWeek' as DateRangeType, label: 'Previous Week' },
 { value: 'thisMonth' as DateRangeType, label: 'This Month' },
 { value: 'previousMonth' as DateRangeType, label: 'Previous Month' },
 { value: 'thisYear' as DateRangeType, label: 'This Year' },
 { value: 'previousYear' as DateRangeType, label: 'Previous Year' },
 { value: 'custom' as DateRangeType, label: 'Custom Range' },
 ].map(option => (
 <button
 key={option.value}
 onClick={() => setProductionDateRange(option.value)}
 className={`px-4 py-2 rounded-lg text-sm border-2 transition-all ${
 productionDateRange === option.value
 ? 'bg-gray-900 text-white border-gray-900'
 : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
 }`}
 style={{ fontSize: '14px', fontWeight: '600' }}
 >
 {option.label}
 </button>
 ))}
 </div>
 </div>
 
 {/* Custom Date Range Inputs */}
 {productionDateRange === 'custom' && (
 <div className="flex flex-col sm:flex-row gap-3 bg-white/50 p-3 rounded-lg border border-blue-200">
 <div className="flex-1">
 <label className="text-xs text-blue-700 block mb-1">Start Date</label>
 <input
 type="date"
 value={customStartDate}
 onChange={(e) => setCustomStartDate(e.target.value)}
 className="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 <div className="flex-1">
 <label className="text-xs text-blue-700 block mb-1">End Date</label>
 <input
 type="date"
 value={customEndDate}
 onChange={(e) => setCustomEndDate(e.target.value)}
 className="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 </div>
 )}
 
 {/* Display Selected Range */}
 <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
 <div className="text-xs text-blue-700 mb-1">Selected Range:</div>
 <div className="text-sm text-blue-900 font-semibold">
 {(() => {
 const { startDate, endDate } = getDateRangeBounds();
 const start = formatDateIST(startDate);
 const end = formatDateIST(endDate);
 return startDate === endDate ? start : `${start} - ${end}`;
 })()}
 </div>
 </div>
 </div>
 </div>

 {/* Old single date selector - HIDDEN */}
 <div className="hidden">
 <select
 value={selectedProductionDate || ''}
 onChange={(e) => setSelectedProductionDate(e.target.value || null)}
 className="px-4 py-2 bg-white border-2 border-blue-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
 style={{ fontSize: '14px', fontWeight: '600' }}
 >
 {(() => {
 // Get unique dates from production data, filtered by selected production house
 const filterById = analyticsMode === 'production'
 ? selectedProductionHouseId
 : selectedProductionHouseId;
 
 const filteredDates = productionData
 .filter(p => {
 if (!filterById) return true;
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 const phId = p.productionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || phId === filterById;
 })
 .map(p => p.date)
 .filter((date, index, self) => self.indexOf(date) === index)
 .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
 
 return filteredDates.map(date => (
 <option key={date} value={date}>
 {formatDateIST(date)}
 </option>
 ));
 })()}
 </select>
 </div>

 {/* Production Summary Cards */}
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
 {(() => {
 // Use consistent production house filtering logic
 const filterById = selectedProductionHouseId; // Always use production house selector in production analytics
 
 // Find the selected production house by its id
 const selectedProductionHouse = filterById 
 ? context.productionHouses?.find(ph => ph.id === filterById)
 : null;
 
 // Get date range bounds for filtering
 const { startDate, endDate } = getDateRangeBounds();
 
 const filteredProduction = productionData.filter(p => {
 // Filter by date range first
 if (p.date < startDate || p.date > endDate) {
 return false;
 }
 
 if (!filterById) return true; // No filter selected, show all
 
 // For production incharges, the filterById is their storeId
 // Production data has BOTH storeId (where production happened) and productionHouseId (UUID)
 // We should match EITHER:
 // 1. Production data's storeId === filterById (for production houses that are also stores)
 // 2. Production data's productionHouseId === filterById (for when filterById is the UUID)
 
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 
 // Get the production house ID from the record
 let recordProductionHouseId = p.productionHouseId;
 
 // If record doesn't have productionHouseId OR it's a store ID (starts with 'STORE-'), look it up via storeId
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const store = allStores.find(s => s.id === p.storeId);
 recordProductionHouseId = store?.productionHouseId || undefined;
 }
 
 const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
 
 // Match if ANY of these are true
 const matches = matchesStoreId || matchesProductionHouseId || phId === filterById;
 
 return matches;
 });
 
 // Calculate production by type for current period
 const chickenMomos = filteredProduction.reduce((sum, p) => sum + (p.chickenMomos?.final || 0), 0);
 const chickenCheeseMomos = filteredProduction.reduce((sum, p) => sum + (p.chickenCheeseMomos?.final || 0), 0);
 const vegMomos = filteredProduction.reduce((sum, p) => sum + (p.vegMomos?.final || 0), 0);
 const cheeseCornMomos = filteredProduction.reduce((sum, p) => sum + (p.cheeseCornMomos?.final || 0), 0);
 const paneerMomos = filteredProduction.reduce((sum, p) => sum + (p.paneerMomos?.final || 0), 0);
 const vegKurkureMomos = filteredProduction.reduce((sum, p) => sum + (p.vegKurkureMomos?.final || 0), 0);
 const chickenKurkureMomos = filteredProduction.reduce((sum, p) => sum + (p.chickenKurkureMomos?.final || 0), 0);

 const totalWastage = filteredProduction.reduce((sum, p) => {
 return sum + 
 (p.wastage?.dough || 0) + 
 (p.wastage?.stuffing || 0) + 
 (p.wastage?.batter || 0) + 
 (p.wastage?.coating || 0);
 }, 0);

 const approvedCount = filteredProduction.filter(p => p.approvalStatus === 'approved').length;
 const pendingCount = filteredProduction.filter(p => p.approvalStatus === 'pending').length;
 
 // Calculate production for previous period for comparison
 const previousRange = getPreviousPeriodDateRange();
 const previousProduction = productionData.filter(p => {
 // Filter by date range first
 if (p.date < previousRange.startDate || p.date > previousRange.endDate) {
 return false;
 }
 
 if (!filterById) return true;
 
 // Same filtering logic as current period
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const store = allStores.find(s => s.id === p.storeId);
 recordProductionHouseId = store?.productionHouseId || undefined;
 }
 
 const phId = recordProductionHouseId || p.storeId;
 const matches = matchesStoreId || matchesProductionHouseId || phId === filterById;
 
 return matches;
 });
 
 const prevChickenMomos = previousProduction.reduce((sum, p) => sum + (p.chickenMomos?.final || 0), 0);
 const prevChickenCheeseMomos = previousProduction.reduce((sum, p) => sum + (p.chickenCheeseMomos?.final || 0), 0);
 const prevVegMomos = previousProduction.reduce((sum, p) => sum + (p.vegMomos?.final || 0), 0);
 const prevCheeseCornMomos = previousProduction.reduce((sum, p) => sum + (p.cheeseCornMomos?.final || 0), 0);
 const prevPaneerMomos = previousProduction.reduce((sum, p) => sum + (p.paneerMomos?.final || 0), 0);
 const prevVegKurkureMomos = previousProduction.reduce((sum, p) => sum + (p.vegKurkureMomos?.final || 0), 0);
 const prevChickenKurkureMomos = previousProduction.reduce((sum, p) => sum + (p.chickenKurkureMomos?.final || 0), 0);
 
 // Helper function to calculate percentage change
 const calcPercentChange = (current: number, previous: number): number => {
 if (previous === 0) return current > 0 ? 100 : 0;
 return ((current - previous) / previous) * 100;
 };

 return (
 <>
 <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-red-600" />
 <p className="text-xs text-gray-600">Chicken Momos</p>
 </div>
 <p className="text-2xl text-gray-900">{chickenMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevChickenMomos > 0 && (() => {
 const change = calcPercentChange(chickenMomos, prevChickenMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-yellow-600" />
 <p className="text-xs text-gray-600">Chicken Cheese</p>
 </div>
 <p className="text-2xl text-gray-900">{chickenCheeseMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevChickenCheeseMomos > 0 && (() => {
 const change = calcPercentChange(chickenCheeseMomos, prevChickenCheeseMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-green-600" />
 <p className="text-xs text-gray-600">Veg Momos</p>
 </div>
 <p className="text-2xl text-gray-900">{vegMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevVegMomos > 0 && (() => {
 const change = calcPercentChange(vegMomos, prevVegMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-amber-600" />
 <p className="text-xs text-gray-600">Cheese Corn</p>
 </div>
 <p className="text-2xl text-gray-900">{cheeseCornMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevCheeseCornMomos > 0 && (() => {
 const change = calcPercentChange(cheeseCornMomos, prevCheeseCornMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-blue-600" />
 <p className="text-xs text-gray-600">Paneer Momos</p>
 </div>
 <p className="text-2xl text-gray-900">{paneerMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevPaneerMomos > 0 && (() => {
 const change = calcPercentChange(paneerMomos, prevPaneerMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-lime-50 to-lime-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-lime-600" />
 <p className="text-xs text-gray-600">Veg Kurkure</p>
 </div>
 <p className="text-2xl text-gray-900">{vegKurkureMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevVegKurkureMomos > 0 && (() => {
 const change = calcPercentChange(vegKurkureMomos, prevVegKurkureMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Soup className="w-5 h-5 text-orange-600" />
 <p className="text-xs text-gray-600">Chicken Kurkure</p>
 </div>
 <p className="text-2xl text-gray-900">{chickenKurkureMomos.toLocaleString()}</p>
 <div className="flex items-center justify-between mt-1">
 <p className="text-xs text-gray-500">pieces</p>
 {prevChickenKurkureMomos > 0 && (() => {
 const change = calcPercentChange(chickenKurkureMomos, prevChickenKurkureMomos);
 return (
 <div className={`flex items-center gap-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span className="text-xs font-semibold">{Math.abs(change).toFixed(1)}%</span>
 </div>
 );
 })()}
 </div>
 </div>

 <div className="bg-gradient-to-br from-red-100 to-red-200 rounded-xl shadow-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <Trash2 className="w-5 h-5 text-red-700" />
 <p className="text-xs text-gray-600">Total Wastage</p>
 </div>
 <p className="text-2xl text-gray-900">{totalWastage.toFixed(2)}</p>
 <p className="text-xs text-gray-500 mt-1">kg</p>
 </div>
 </>
 );
 })()}
 </div>

 {/* Approval status for this period's production log entries - kept as a small text
 line rather than tiles in the momo-count grid above, since "records approved" isn't
 the same kind of number as "pieces produced" and was confusing sitting next to it. */}
 {(() => {
 const { startDate, endDate } = getDateRangeBounds();
 const inRange = productionData.filter(p => {
 if (p.date < startDate || p.date > endDate) return false;
 if (!selectedProductionHouseId) return true;
 const matchesStoreId = p.storeId === selectedProductionHouseId;
 const matchesProductionHouseId = p.productionHouseId === selectedProductionHouseId;
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 recordProductionHouseId = allStores.find(s => s.id === p.storeId)?.productionHouseId || undefined;
 }
 const phId = recordProductionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || phId === selectedProductionHouseId;
 });
 const approved = inRange.filter(p => p.approvalStatus === 'approved').length;
 const pending = inRange.filter(p => p.approvalStatus === 'pending').length;
 return (
 <div className="flex items-center gap-4 text-sm text-gray-600 mb-6 -mt-3">
 <span className="flex items-center gap-1.5">
 <ClipboardCheck className="w-4 h-4 text-green-600" />
 {approved} approved record{approved === 1 ? '' : 's'}
 </span>
 <span className="flex items-center gap-1.5">
 <AlertCircle className="w-4 h-4 text-yellow-600" />
 {pending} pending record{pending === 1 ? '' : 's'}
 </span>
 </div>
 );
 })()}

 {/* Production Output & Efficiency - day-by-day trends for the selected production
 date range, mirroring the dotted-previous-period pattern used in Store Analytics so a
 production incharge/cluster head can see whether output, yield and wastage are
 trending better or worse than the equivalent prior period. */}
 {(() => {
 const filterById = selectedProductionHouseId;
 const matchesProdFilter = (p: any) => {
 if (!filterById) return true;
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 recordProductionHouseId = allStores.find(s => s.id === p.storeId)?.productionHouseId || undefined;
 }
 const phId = recordProductionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || phId === filterById;
 };

 const enumerateDates = (start: string, end: string): string[] => {
 const dates: string[] = [];
 let d = start;
 let guard = 0;
 while (d <= end && guard < 400) {
 dates.push(d);
 d = addDays(d, 1);
 guard++;
 }
 return dates;
 };

 const buildDailySeries = (dates: string[]) => dates.map(date => {
 const dayRecords = productionData.filter(p => matchesProdFilter(p) && p.date === date);
 const row: any = { date, label: formatDateIST(date) };
 let regularFinal = 0, regularInput = 0, kurkureFinal = 0, kurkureInput = 0;
 let wastageKg = 0, totalInputKg = 0;
 MOMO_TYPES.forEach(t => {
 const final = dayRecords.reduce((sum, p) => sum + (p[t.key]?.final || 0), 0);
 row[t.key] = final;
 if (t.group === 'regular') {
 const input = dayRecords.reduce((sum, p) => sum + (p[t.key]?.dough || 0) + (p[t.key]?.stuffing || 0), 0);
 regularFinal += final; regularInput += input; totalInputKg += input;
 } else {
 const input = dayRecords.reduce((sum, p) => sum + (p[t.key]?.batter || 0) + (p[t.key]?.coating || 0), 0);
 kurkureFinal += final; kurkureInput += input; totalInputKg += input;
 }
 });
 wastageKg = dayRecords.reduce((sum, p) => sum + (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0), 0);
 row.totalFinal = regularFinal + kurkureFinal;
 row.momoYield = regularInput > 0 ? Math.round((regularFinal / regularInput) * 10) / 10 : null;
 row.kurkureYield = kurkureInput > 0 ? Math.round((kurkureFinal / kurkureInput) * 10) / 10 : null;
 row.wastagePct = (totalInputKg + wastageKg) > 0 ? Math.round((wastageKg / (totalInputKg + wastageKg)) * 1000) / 10 : 0;
 return row;
 });

 const { startDate, endDate } = getDateRangeBounds();
 const previousRangeForOutput = getPreviousPeriodDateRange();
 const currentDates = enumerateDates(startDate, endDate);
 const previousDates = enumerateDates(previousRangeForOutput.startDate, previousRangeForOutput.endDate);
 const outputSeries = buildDailySeries(currentDates);
 const previousOutputSeries = buildDailySeries(previousDates);
 const outputChartData = zipPrev(outputSeries, previousOutputSeries, ['totalFinal', 'momoYield', 'kurkureYield', 'wastagePct']);

 const periodMix = MOMO_TYPES.map(t => ({
 name: t.label,
 value: outputSeries.reduce((sum, r) => sum + (r[t.key] || 0), 0),
 color: t.color,
 }));
 const hasAnyOutput = periodMix.some(m => m.value > 0);

 if (currentDates.length === 0) return null;

 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <div className="mb-6">
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <Factory className="w-6 h-6 text-orange-600" />
 Production Output & Efficiency
 </h2>
 <p className="text-sm text-gray-600">Pieces produced, raw-material yield and wastage rate for the selected date range · dotted lines are the matching previous period</p>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
 {/* Daily output mix, stacked by momo type */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">Daily Output by Momo Type</h3>
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <ComposedChart data={outputChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 {MOMO_TYPES.map(t => (
 <Bar key={t.key} dataKey={t.key} stackId="momo" name={t.label} fill={t.color} />
 ))}
 <Line type="monotone" dataKey="prev_totalFinal" name="Total (previous period)" stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>

 {/* Period share by momo type */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">Production Mix (This Period)</h3>
 {hasAnyOutput ? (
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <PieChart>
 <Pie data={periodMix.filter(m => m.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={(entry: any) => `${entry.name}: ${entry.value}`}>
 {periodMix.filter(m => m.value > 0).map((m, idx) => (
 <Cell key={idx} fill={m.color} />
 ))}
 </Pie>
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 </PieChart>
 </ResponsiveContainer>
 )}</LazyChart>
 ) : (
 <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">No production logged for this period</div>
 )}
 </div>

 {/* Raw material yield efficiency */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Raw Material Yield</h3>
 <p className="text-xs text-gray-500 mb-3">Pieces produced per kg of raw material used (dough+stuffing for momos, batter+coating for kurkure) · higher is more efficient</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart data={outputChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Line type="monotone" dataKey="momoYield" name="Momo yield (pcs/kg)" stroke="#ea580c" strokeWidth={2} dot={{ r: 2 }} connectNulls />
 <Line type="monotone" dataKey="kurkureYield" name="Kurkure yield (pcs/kg)" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} connectNulls />
 <Line type="monotone" dataKey="prev_momoYield" name="Momo yield (previous period)" stroke="#ea580c" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls legendType="none" />
 <Line type="monotone" dataKey="prev_kurkureYield" name="Kurkure yield (previous period)" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls legendType="none" />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>

 {/* Wastage rate as a % of total raw material, so it's comparable across days
 regardless of production volume - complements the raw-kg trend charts below. */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Wastage Rate</h3>
 <p className="text-xs text-gray-500 mb-3">Wasted raw material as a % of total raw material used that day · lower is better</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart data={outputChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} unit="%" />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Line type="monotone" dataKey="wastagePct" name="Wastage %" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
 <Line type="monotone" dataKey="prev_wastagePct" name="Wastage % (previous period)" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="none" />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 </div>
 </div>
 );
 })()}

 {/* Sauces & Chutneys Usage - ProductionData.sauces is captured on every day's
 production log but was never surfaced anywhere in Analytics until now. Same
 current-vs-previous-period convention as every other trended chart on this page
 (zipPrev + renderPrevAwareLegend), so it reads consistently with Output & Efficiency
 above rather than being a one-off. */}
 {(() => {
 const filterById = selectedProductionHouseId;
 const matchesProdFilter = (p: any) => {
 if (!filterById) return true;
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 recordProductionHouseId = allStores.find(s => s.id === p.storeId)?.productionHouseId || undefined;
 }
 const phId = recordProductionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || phId === filterById;
 };

 const SAUCE_TYPES = [
 { key: 'panfriedSauce', label: 'Panfried Sauce', color: '#ea580c' },
 { key: 'chilliChickenSauce', label: 'Chilli Chicken Sauce', color: '#dc2626' },
 { key: 'spicyKoreanSauce', label: 'Spicy Korean Sauce', color: '#db2777' },
 { key: 'hotGarlicSauce', label: 'Hot Garlic Sauce', color: '#c026d3' },
 { key: 'tandooriSauce', label: 'Tandoori Sauce', color: '#9333ea' },
 { key: 'soupPremix', label: 'Soup Premix', color: '#4f46e5' },
 { key: 'greenMayoChutney', label: 'Green Mayo Chutney', color: '#16a34a' },
 { key: 'spicyRedChutney', label: 'Spicy Red Chutney', color: '#eab308' },
 ] as const;

 const enumerateDates = (start: string, end: string): string[] => {
 const dates: string[] = [];
 let d = start;
 let guard = 0;
 while (d <= end && guard < 400) {
 dates.push(d);
 d = addDays(d, 1);
 guard++;
 }
 return dates;
 };

 const buildSauceSeries = (dates: string[]) => dates.map(date => {
 const dayRecords = productionData.filter(p => matchesProdFilter(p) && p.date === date);
 const row: any = { date, label: formatDateIST(date) };
 let total = 0;
 SAUCE_TYPES.forEach(s => {
 const litres = dayRecords.reduce((sum, p) => sum + (p.sauces?.[s.key] || 0), 0);
 row[s.key] = Math.round(litres * 100) / 100;
 total += litres;
 });
 row.totalSauce = Math.round(total * 100) / 100;
 return row;
 });

 const { startDate, endDate } = getDateRangeBounds();
 const previousRangeForSauces = getPreviousPeriodDateRange();
 const currentDates = enumerateDates(startDate, endDate);
 const previousDates = enumerateDates(previousRangeForSauces.startDate, previousRangeForSauces.endDate);
 const sauceSeries = buildSauceSeries(currentDates);
 const previousSauceSeries = buildSauceSeries(previousDates);
 const sauceChartData = zipPrev(sauceSeries, previousSauceSeries, ['totalSauce']);

 const periodTotals = SAUCE_TYPES.map(s => ({
 name: s.label,
 value: Math.round(sauceSeries.reduce((sum, r) => sum + (r[s.key] || 0), 0) * 100) / 100,
 color: s.color,
 }));
 const previousPeriodTotals = SAUCE_TYPES.map(s => ({
 key: s.key,
 value: previousSauceSeries.reduce((sum, r) => sum + (r[s.key] || 0), 0),
 }));
 const hasAnySauce = periodTotals.some(t => t.value > 0);

 if (currentDates.length === 0 || !hasAnySauce) return null;

 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <div className="mb-6">
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <Soup className="w-6 h-6 text-rose-600" />
 Sauces & Chutneys Usage
 </h2>
 <p className="text-sm text-gray-600">Litres prepared per day for the selected date range · dotted line is the matching previous period</p>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">Daily Usage by Type</h3>
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <ComposedChart data={sauceChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} unit="L" />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 {SAUCE_TYPES.map(s => (
 <Bar key={s.key} dataKey={s.key} stackId="sauce" name={s.label} fill={s.color} />
 ))}
 <Line type="monotone" dataKey="prev_totalSauce" name="Total (previous period)" stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>

 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">This Period vs Previous, by Type</h3>
 <div className="space-y-2.5">
 {periodTotals.filter(t => t.value > 0 || (previousPeriodTotals.find(p => p.key === SAUCE_TYPES.find(s => s.label === t.name)?.key)?.value || 0) > 0).map(t => {
 const sauceKey = SAUCE_TYPES.find(s => s.label === t.name)?.key;
 const prevValue = previousPeriodTotals.find(p => p.key === sauceKey)?.value || 0;
 const change = pctChange(t.value, prevValue);
 return (
 <div key={t.name} className="flex items-center gap-3">
 <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
 <span className="text-sm text-gray-700 flex-1 truncate">{t.name}</span>
 <span className="text-sm font-semibold text-gray-900 tabular-nums">{t.value.toLocaleString()} L</span>
 {change !== null && (
 <span className={`text-xs font-medium tabular-nums w-14 text-right ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {change >= 0 ? '+' : ''}{change.toFixed(0)}%
 </span>
 )}
 </div>
 );
 })}
 </div>
 </div>
 </div>
 </div>
 );
 })()}

 {/* Day-of-Week Production Pattern - mirrors Store Analytics' "Orders by Hour" idea,
 but production only has a date (no reliable intra-day timestamp to bucket by hour),
 so this buckets by weekday instead: which days this production house tends to run
 hottest/coldest, and whether wastage skews toward particular days (e.g. Mondays after
 a weekend). Same zipPrev/current-vs-previous convention as the rest of this page. */}
 {(() => {
 const filterById = selectedProductionHouseId;
 const matchesProdFilter = (p: any) => {
 if (!filterById) return true;
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 recordProductionHouseId = allStores.find(s => s.id === p.storeId)?.productionHouseId || undefined;
 }
 const phId = recordProductionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || phId === filterById;
 };

 // Mon..Sun display order, mapped from JS's Sun=0..Sat=6
 const WEEKDAYS = [
 { jsDay: 1, label: 'Mon' }, { jsDay: 2, label: 'Tue' }, { jsDay: 3, label: 'Wed' },
 { jsDay: 4, label: 'Thu' }, { jsDay: 5, label: 'Fri' }, { jsDay: 6, label: 'Sat' },
 { jsDay: 0, label: 'Sun' },
 ];

 const buildWeekdaySeries = (fromDate: string, toDate: string) => {
 const records = productionData.filter(p => matchesProdFilter(p) && p.date >= fromDate && p.date <= toDate);
 return WEEKDAYS.map(w => {
 const dayRecords = records.filter(p => new Date(`${p.date}T00:00:00`).getDay() === w.jsDay);
 let totalFinal = 0, totalRawKg = 0, wastageKg = 0;
 MOMO_TYPES.forEach(({ key }) => {
 totalFinal += dayRecords.reduce((sum, p) => sum + (p[key]?.final || 0), 0);
 });
 dayRecords.forEach(p => {
 wastageKg += (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0);
 });
 return { label: w.label, totalFinal, wastageKg: Math.round(wastageKg * 100) / 100 };
 });
 };

 const { startDate, endDate } = getDateRangeBounds();
 const previousRangeForWeekday = getPreviousPeriodDateRange();
 const weekdaySeries = buildWeekdaySeries(startDate, endDate);
 const previousWeekdaySeries = buildWeekdaySeries(previousRangeForWeekday.startDate, previousRangeForWeekday.endDate);
 const weekdayChartData = zipPrev(weekdaySeries, previousWeekdaySeries, ['totalFinal']);
 const hasAnyOutput = weekdaySeries.some(r => r.totalFinal > 0);

 if (!hasAnyOutput) return null;

 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <div className="mb-6">
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <CalendarDays className="w-6 h-6 text-teal-600" />
 Day-of-Week Production Pattern
 </h2>
 <p className="text-sm text-gray-600">Total pieces produced by day of week, summed across the selected date range · dotted line is the matching previous period</p>
 </div>
 <LazyChart height={280}>{() => (
 <ResponsiveContainer width="100%" height={280}>
 <ComposedChart data={weekdayChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 12 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Bar dataKey="totalFinal" name="Pieces produced" fill="#0d9488" radius={[4, 4, 0, 0]} />
 <Line type="monotone" dataKey="prev_totalFinal" name="Pieces produced (previous period)" stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
 </ComposedChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 );
 })()}

 {/* Production House Stock Status */}
 <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-orange-200">
 <div className="mb-4">
 <div className="flex items-center justify-between gap-4 flex-wrap">
 <div>
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <Package className="w-6 h-6 text-orange-600" />
 Production House Stock Status
 </h2>
 <p className="text-sm text-gray-600">
 Opening balance + This month produced - Sent to stores (delivered requests)
 </p>
 </div>

 {/* Alert Settings and Plate Settings - Operations Manager / Cluster Head only, not
 the Production Incharge submitting the data being thresholded. */}
 {analyticsMode === 'production' && (isOperationsManager || isClusterHead) && (
 <div className="flex flex-wrap gap-2 items-start">
 {/* Stock Alert Settings Button */}
 <button
 onClick={() => {
 setTempStockAlertThresholds(JSON.parse(JSON.stringify(stockAlertThresholds)));
 setShowStockAlertModal(true);
 }}
 className="px-4 py-2 bg-gradient-to-r from-orange-600 to-rose-500 text-white rounded-lg hover:from-orange-700 hover:to-rose-600 transition-all flex items-center gap-2 shadow-lg"
 title="Configure Stock Alert Thresholds"
 >
 <Settings className="w-5 h-5" />
 Alert Settings
 </button>
 
 {/* Plate Conversion Settings Button */}
 <button
 onClick={() => {
 setTempMomosPerPlate(momosPerPlate);
 setShowPlateSettingsModal(true);
 }}
 className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all flex items-center gap-2 shadow-lg"
 title="Configure Momos Per Plate"
 >
 <Settings className="w-5 h-5" />
 Plate Settings
 </button>
 
 {/* Recalibrate Stock Button - ONLY for Production Incharge */}
 {isProductionIncharge && (
 <div className="flex flex-col gap-2">
 <button
 onClick={() => setShowRecalibration(true)}
 className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md hover:shadow-lg font-semibold"
 title="Recalibrate production house stock (available on 1st of each month)"
 >
 <Calendar className="w-5 h-5" />
 Recalibrate Stock
 </button>
 {latestRecalibration && latestRecalibration.date && (
 <p className="text-xs text-gray-500 text-center">
 Last recalibrated: {formatDateIST(latestRecalibration.date)} IST
 </p>
 )}
 {previousMonthStock && !latestRecalibration && (
 <p className="text-xs text-blue-600 text-center">
 ℹ️ Using auto carry-forward from previous month
 </p>
 )}
 </div>
 )}
 {(isOperationsManager || isClusterHead) && onNavigateToManageItems && (
 <button
 onClick={() => {
 onNavigateToManageItems();
 }}
 className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg font-semibold"
 title="Manage inventory items"
 >
 <Package className="w-5 h-5" />
 Manage Items
 </button>
 )}
 </div>
 )}
 
 {/* Production House Selector for Cluster Heads - Only in Store Analytics Mode */}
 {analyticsMode === 'store' && context.user?.role === 'cluster_head' && context.productionHouses && context.productionHouses.length > 0 && (
 <div className="flex items-center gap-2">
 <label className="text-sm text-gray-600">Production House:</label>
 <select
 value={selectedProductionHouseId || 'all'}
 onChange={(e) => {
 const newValue = e.target.value === 'all' ? null : e.target.value;
 setSelectedProductionHouseId(newValue);
 }}
 className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
 >
 <option value="all">All Production Houses</option>
 {context.productionHouses.map(ph => (
 <option key={ph.id} value={ph.id}>
 {ph.name} (ID: {ph.id})
 </option>
 ))}
 </select>
 </div>
 )}
 </div>
 </div>

 {(() => {
 // Calculate Production House Stock = Total Production - Total Fulfilled Stock Requests
 // In production analytics mode, always use selectedProductionHouseId
 const effectiveProductionHouseId = selectedProductionHouseId;
 
 // Find the selected production house by its id
 const selectedProductionHouseForStock = effectiveProductionHouseId 
 ? context.productionHouses?.find(ph => ph.id === effectiveProductionHouseId)
 : null;
 
 // Get all production data for the production house
 const filteredProduction = productionData.filter(p => {
 if (!effectiveProductionHouseId) return true; // No filter selected, show all
 
 // Match on storeId OR productionHouseId
 const matchesStoreId = p.storeId === effectiveProductionHouseId;
 const matchesProductionHouseId = p.productionHouseId === effectiveProductionHouseId;
 
 // Get the production house ID from the record
 let recordProductionHouseId = p.productionHouseId;
 
 // If record doesn't have productionHouseId OR it's a store ID (starts with 'STORE-'), look it up via storeId
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const store = allStores.find(s => s.id === p.storeId);
 recordProductionHouseId = store?.productionHouseId || undefined;
 }
 
 const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
 
 // Match if ANY of these are true
 return matchesStoreId || matchesProductionHouseId || phId === effectiveProductionHouseId;
 });

 // Fixed current-month activity for this stock view. Stock Available itself remains
 // current stock, so a separate date filter would make the card misleading.
 const nowForMonth = new Date();
 const currentMonth = `${nowForMonth.getFullYear()}-${String(nowForMonth.getMonth() + 1).padStart(2, '0')}`;
 const monthlyFilteredProduction = filteredProduction.filter(p => p.date.startsWith(currentMonth));

 // Get all finished product inventory items FIRST (we need this for dynamic calculations)
 const finishedProductsForCalc = context.inventoryItems?.filter(item => 
 item.category === 'finished_product' && 
 item.isActive &&
 (item.linkedEntityType === 'global' || 
 (item.linkedEntityType === 'production_house' && item.linkedEntityId === effectiveProductionHouseId))
 ) || [];
 
 // Helper function to convert snake_case to camelCase
 const snakeToCamelForCalc = (str: string) => {
 return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
 };
 
 // Helper to get the base name for stock lookup (remove _momo/_momos suffix)
 const getStockKey = (itemName: string) => {
 // For items like "chicken_momo", "veg_momo", etc., we want "chicken", "veg"
 const baseName = itemName.replace(/_momo(s)?$/i, '');
 return snakeToCamelForCalc(baseName);
 };

 // Calculate approved production by momo type for the current month.
 const totalProduced: Record<string, number> = {};
 
 // Initialize all finished products to 0
 finishedProductsForCalc.forEach(item => {
 const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
 totalProduced[stockKey] = 0;
 });

 const getProductionFieldValue = (p: any, itemName: string, stockKey: string) => {
 const data = p?.data || {};
 const baseItemName = itemName.replace(/_momo(s)?$/i, '');
 const camelItemName = snakeToCamelForCalc(itemName);
 const camelBaseItemName = snakeToCamelForCalc(baseItemName);
 const aliases = [
 itemName,
 `${itemName}s`,
 baseItemName,
 stockKey,
 camelItemName,
 `${camelItemName}s`,
 camelBaseItemName,
 `${camelBaseItemName}Momos`,
 `${stockKey}Momos`
 ];

 const normalizeValue = (value: any) => {
 if (value === undefined || value === null) return 0;
 if (typeof value === 'object') return Number(value.final ?? value.quantity ?? value.pieces ?? 0) || 0;
 return Number(value) || 0;
 };

 for (const alias of aliases) {
 if (data[alias] !== undefined && data[alias] !== null) {
 return normalizeValue(data[alias]);
 }
 }

 for (const alias of aliases) {
 if (p[alias] !== undefined && p[alias] !== null) {
 return normalizeValue(p[alias]);
 }
 }

 return 0;
 };

 const addProductionRecordToTotals = (p: any, target: Record<string, number>) => {
 finishedProductsForCalc.forEach(item => {
 const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
 const fieldValue = getProductionFieldValue(p, item.name, stockKey);
 target[stockKey] = (target[stockKey] || 0) + fieldValue;
 });
 };
 
 const approvedMonthlyProduction = monthlyFilteredProduction
 .filter(p => p.approvalStatus === 'approved'); // CRITICAL: Only count approved production

 approvedMonthlyProduction.forEach(p => addProductionRecordToTotals(p, totalProduced));

 // Calculate total fulfilled stock requests (sent to stores)
 // Use ProductionRequests (which have 'delivered' status), not StockRequests
 
 // First, resolve the production house UUID
 // For production incharges, effectiveProductionHouseId is their storeId
 // We need to find the corresponding production house UUID
 let productionHouseUUID = effectiveProductionHouseId;
 
 // Check if effectiveProductionHouseId is a storeId (starts with 'STORE-')
 if (effectiveProductionHouseId && effectiveProductionHouseId.startsWith('STORE-')) {
 // Find the store
 const userStore = context.stores?.find(s => s.id === effectiveProductionHouseId);
 if (userStore?.productionHouseId) {
 productionHouseUUID = userStore.productionHouseId;
 }
 }
 
 const fulfilledRequests = context.productionRequests?.filter(req => {
 // Count anything sent out of the production house. A request can be shipped or
 // partially-shipped before the store marks it delivered, but it has still left stock.
 const sentStatuses = ['shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
 if (!sentStatuses.includes(req.status)) return false;
 
 // Filter by current month only (monthly reset)
 // Check what date field exists on production requests
 const requestDate = req.shippedAt || req.deliveredAt || req.requestDate || req.createdAt;
 
 if (!requestDate || !requestDate.startsWith(currentMonth)) {
 return false;
 }
 
 // Find the store that made this request
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const requestingStore = allStores.find(s => s.id === req.storeId);
 
 // Filter by production house if one is selected
 if (productionHouseUUID) {
 const matches = requestingStore?.productionHouseId === productionHouseUUID;
 return matches;
 }
 
 // If no production house selected, show all
 return true;
 }) || [];

 // Calculate total fulfilled stock requests (sent to stores) - DYNAMIC
 const totalSentToStores: Record<string, number> = {};
 
 // Initialize all finished products to 0
 finishedProductsForCalc.forEach(item => {
 const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
 totalSentToStores[stockKey] = 0;
 });

 const getDeliveredRequestQuantity = (req: any, itemName: string, stockKey: string) => {
 const baseItemName = itemName.replace(/_momo(s)?$/i, '');
 const camelItemName = snakeToCamelForCalc(itemName);
 const camelBaseItemName = snakeToCamelForCalc(baseItemName);
 const aliases = [
 stockKey,
 `${stockKey}Momos`,
 `${stockKey}Momo`,
 itemName,
 `${itemName}s`,
 baseItemName,
 camelItemName,
 `${camelItemName}s`,
 camelBaseItemName,
 `${camelBaseItemName}Momos`,
 `${camelBaseItemName}Momo`
 ];
 const shippedQuantities = req.shippedQuantities || {};

 for (const alias of aliases) {
 const shippedValue = shippedQuantities[alias];
 if (shippedValue !== undefined && shippedValue !== null) return Number(shippedValue) || 0;
 }

 for (const alias of aliases) {
 const value = req[alias];
 if (value !== undefined && value !== null) return Number(value) || 0;
 }

 return 0;
 };

 const addDeliveredRequestToTotals = (req: any, target: Record<string, number>) => {
 finishedProductsForCalc.forEach(item => {
 const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
 const deliveredQty = getDeliveredRequestQuantity(req, item.name, stockKey);
 target[stockKey] = (target[stockKey] || 0) + deliveredQty;
 });
 };
 
 fulfilledRequests.forEach(req => addDeliveredRequestToTotals(req, totalSentToStores));

 // Calculate remaining stock with carry-forward from previous month - DYNAMIC
 // Stock = Opening Balance + Current Month Production - Current Month Deliveries
 const openingBalance: Record<string, number> = {};
 finishedProductsForCalc.forEach(item => {
 const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
 // Try multiple key formats: stockKey ("chicken"), item.name ("chicken_momo"), and item.id (UUID)
 openingBalance[stockKey] = (previousMonthStock as any)?.[stockKey] || 
 (previousMonthStock as any)?.[item.name] || 
 (previousMonthStock as any)?.[item.id] || 
 0;
 });
 
 // Stock = Opening Balance + This Month Produced - Sent to Stores.
 // Base momos also lose stock when converted into Kurkure momos.
 const productionHouseStock: Record<string, number> = {};
 finishedProductsForCalc.forEach(item => {
 const stockKey = getStockKey(item.name);
 const convertedToKurkure =
 stockKey === 'chicken' ? (totalProduced.chickenKurkure || 0) :
 stockKey === 'veg' ? (totalProduced.vegKurkure || 0) :
 0;
 productionHouseStock[stockKey] =
 (openingBalance[stockKey] || 0) +
 (totalProduced[stockKey] || 0) -
 (totalSentToStores[stockKey] || 0) -
 convertedToKurkure;
 });

 // Store calculated stock globally for the recalibration modal
 (window as any).__currentProductionHouseStock = productionHouseStock;

 // Get all finished product inventory items for this production house or global
 const finishedProducts = context.inventoryItems?.filter(item => 
 item.category === 'finished_product' && 
 item.isActive &&
 (item.linkedEntityType === 'global' || 
 (item.linkedEntityType === 'production_house' && item.linkedEntityId === effectiveProductionHouseId))
 ) || [];
 
 // Helper function to convert snake_case to camelCase for stock lookup
 const snakeToCamel = (str: string) => {
 return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
 };

 // Color mapping for the 7 core momos (for backwards compatibility)
 const colorMap: Record<string, string> = {
 'chicken': 'violet',
 'chickenCheese': 'rose',
 'chicken_cheese': 'rose',
 'veg': 'green',
 'cheeseCorn': 'yellow',
 'cheese_corn': 'yellow',
 'paneer': 'blue',
 'vegKurkure': 'teal',
 'veg_kurkure': 'teal',
 'chickenKurkure': 'red',
 'chicken_kurkure': 'red',
 };

 // Map inventory items to display format
 const momoTypes = finishedProducts.map(item => {
 // Get the base stock key (e.g., "chicken" from "chicken_momo")
 const baseName = item.name.replace(/_momo(s)?$/i, '');
 const stockKey = snakeToCamel(baseName);
 
 return {
 key: item.name,
 camelKey: stockKey, // Base key for stock lookup (e.g., "chicken")
 label: item.displayName, // Keep full display name including "Momo"
 color: colorMap[baseName] || colorMap[stockKey] || 'sky',
 unit: item.unit
 };
 });

 // Check if we have any stock to display (from opening balance or production)
 const hasOpeningBalance = Object.values(openingBalance).some((v: any) => v > 0);

 // Show info if no production data AND no opening balance
 if (filteredProduction.length === 0 && !hasOpeningBalance) {
 return (
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
 <Package className="w-12 h-12 text-blue-400 mx-auto mb-3" />
 <h3 className="text-lg text-gray-900 mb-2">No Production Data</h3>
 <p className="text-sm text-gray-600">
 {effectiveProductionHouseId 
 ? 'No production records found for the selected production house.' 
 : 'No production records found. Start logging production to see stock status.'}
 </p>
 </div>
 );
 }

 return (
 <>
 {/* Stock Calculation Info */}
 {(openingBalance && Object.values(openingBalance).some((v: any) => v > 0)) && (
 <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded">
 <div className="flex items-start gap-2">
 <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
 <div>
 <h4 className="text-sm font-semibold text-blue-900">Automatic Stock Carry-Forward Active</h4>
 <p className="text-xs text-blue-700 mt-1">
 Stock calculation: <span className="font-mono">Opening Balance + This Month Produced - Sent to Stores</span>
 <span className="block mt-1">Chicken/Veg base stock also subtracts Kurkure prepared.</span>
 </p>
 <p className="text-xs text-blue-600 mt-1">
 {latestRecalibration && latestRecalibration.date
 ? `Opening balance from recalibration on ${formatDateIST(latestRecalibration.date)} (IST)`
 : 'Opening balance auto-calculated from previous month\'s closing stock'
 }
 </p>
 </div>
 </div>
 </div>
 )}
 
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
 {momoTypes.map(({ key, camelKey, label, color, unit }) => {
 // Use camelCase key for stock lookup (handles both snake_case and camelCase)
 const opening = (openingBalance as any)[camelKey] || (openingBalance as any)[key] || 0;
 const produced = (totalProduced as any)[camelKey] || (totalProduced as any)[key] || 0;
 const sent = (totalSentToStores as any)[camelKey] || (totalSentToStores as any)[key] || 0;
 const stock = (productionHouseStock as any)[camelKey] || (productionHouseStock as any)[key] || 0;
 
 // Check if this item has any production data
 const hasData = opening > 0 || produced > 0 || sent > 0 || stock !== undefined;
 
 // Get the three-level alert thresholds for this item
 const thresholds = stockAlertThresholds[camelKey] ?? stockAlertThresholds[key] ?? { high: 600, medium: 300, low: 150 };
 
 // Determine stock level based on three-level thresholds
 const isCriticalStock = stock < thresholds.low; // Red - Below low threshold
 const isLowStock = stock >= thresholds.low && stock < thresholds.medium; // Orange - Between low and medium
 const isMediumStock = stock >= thresholds.medium && stock < thresholds.high; // Yellow - Between medium and high
 const isHighStock = stock >= thresholds.high; // Green - Above high threshold
 
 // Determine status label and color
 let stockStatus = '';
 let stockStatusColor = '';
 let stockValueColor = '';
 
 if (stock < 0) {
 stockStatus = '⚠️ Over-distributed';
 stockStatusColor = 'bg-red-100 border-red-300 text-red-800';
 stockValueColor = 'text-red-600';
 } else if (hasData && isCriticalStock) {
 stockStatus = '🔴 Critical: Below Low Threshold';
 stockStatusColor = 'bg-red-100 border-red-300 text-red-800';
 stockValueColor = 'text-red-600';
 } else if (hasData && isLowStock) {
 stockStatus = '🟠 Low: Between Low & Medium';
 stockStatusColor = 'bg-orange-100 border-orange-300 text-orange-800';
 stockValueColor = 'text-orange-600';
 } else if (hasData && isMediumStock) {
 stockStatus = '🟡 Medium: Between Medium & High';
 stockStatusColor = 'bg-yellow-100 border-yellow-300 text-yellow-800';
 stockValueColor = 'text-yellow-700';
 } else if (hasData && isHighStock) {
 stockStatus = '🟢 Healthy: Above High Threshold';
 stockStatusColor = 'bg-green-100 border-green-300 text-green-800';
 stockValueColor = 'text-green-600';
 }
 
 const stockPercentage = produced > 0 ? ((stock / produced) * 100).toFixed(0) : '0';
 
 const alertLabel = stock < 0 ? 'OVER' : isCriticalStock ? 'CRITICAL' : isLowStock ? 'LOW' : isMediumStock ? 'MEDIUM' : '';
 const alertClasses = stock < 0 || isCriticalStock || isLowStock
 ? 'bg-red-100 border-red-300 text-red-700'
 : isMediumStock
 ? 'bg-orange-100 border-orange-300 text-orange-700'
 : '';
 const compactValueColor = stock < 0 || isCriticalStock || isLowStock ? 'text-red-600' : `text-${color}-800`;
 
 return (
 <div key={key} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 border-2 border-${color}-200 rounded-lg p-2.5 relative`}>
 {alertLabel && (
 <div className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded border ${alertClasses}`}>
 <AlertCircle className="w-3 h-3" />
 <span className="text-[10px] font-semibold uppercase">{alertLabel}</span>
 </div>
 )}
 <h3 className="text-xs font-semibold text-gray-900 mb-1.5 pr-14 truncate">{label}</h3>
 {opening > 0 && (
 <div className="text-[11px] text-blue-700 mb-1">
 Opening: <span className="font-semibold">{opening}</span>
 </div>
 )}
 <div className="flex justify-between items-center text-[11px] text-gray-600">
 <span>Produced: <span className={`font-semibold text-${color}-700`}>{produced}</span></span>
 <span>Sent: <span className={`font-semibold text-${color}-700`}>{sent}</span></span>
 </div>
 <div className="border-t border-gray-300 mt-1.5 pt-1.5 flex items-center justify-between">
 <span className="text-[10px] font-medium text-gray-500">Available</span>
 <div className={`text-sm font-bold ${compactValueColor}`}>
 {stock} pcs / {Math.round(stock / momosPerPlate)} pl
 </div>
 </div>
 {!hasData && (
 <p className="text-[10px] text-yellow-700 font-semibold mt-1">Track in production logging</p>
 )}
 </div>
 );
 
 return (
 <div key={key} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 border-2 border-${color}-200 rounded-xl p-4 hover:shadow-lg transition-all duration-300`}>
 <h3 className="text-sm font-semibold text-gray-900 mb-3">{label}</h3>
 
 <div className="space-y-2">
 {!hasData ? (
 // Show placeholder for items without production data
 <div className="bg-white/80 rounded-lg p-3">
 <p className="text-xs text-gray-600 mb-1">Current Stock</p>
 <div className="flex items-baseline gap-2">
 <span className="text-2xl font-bold text-gray-400">0</span>
 <span className="text-xs text-gray-500">{unit || 'pieces'}</span>
 </div>
 <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 mt-2">
 <p className="text-xs text-yellow-800">
 💡 Track in production logging to see stock
 </p>
 </div>
 </div>
 ) : (
 <>
 {opening > 0 && (
 <div className="flex justify-between items-center bg-blue-100 px-3 py-2 rounded-lg">
 <span className="text-sm text-blue-700 font-semibold">Opening Balance:</span>
 <span className="text-xl font-bold text-blue-800">{opening}</span>
 </div>
 )}
 
 <div className="flex justify-between items-center">
 <span className="text-xs text-gray-600">This Month Produced:</span>
 <span className={`text-lg font-bold text-${color}-600`}>{produced}</span>
 </div>
 
 <div className="flex justify-between items-center">
 <span className="text-xs text-gray-600">Sent to Stores:</span>
 <span className={`text-lg font-bold text-${color}-700`}>{sent}</span>
 </div>
 
 <div className="border-t-2 border-gray-300 pt-2 mt-2">
 <div className="flex justify-between items-center">
 <span className="text-xs font-semibold text-gray-700">Stock Available:</span>
 <div className="text-right">
 <div className={`text-2xl font-bold ${stockValueColor || `text-${color}-800`}`}>
 {stock} pcs / {Math.round(stock / momosPerPlate)} plates
 </div>
 </div>
 </div>
 {produced > 0 && (
 <div className="mt-2">
 <div className="flex justify-between text-xs text-gray-600 mb-1">
 <span>{stockPercentage}% remaining</span>
 </div>
 <div className="w-full bg-gray-200 rounded-full h-2">
 <div 
 className={`h-2 rounded-full ${
 isCriticalStock || stock < 0 ? 'bg-red-500' : 
 isLowStock ? 'bg-orange-500' :
 isMediumStock ? 'bg-yellow-500' :
 isHighStock ? 'bg-green-500' :
 `bg-${color}-500`
 }`}
 style={{ width: `${Math.min(100, Math.max(0, Number(stockPercentage)))}%` }}
 ></div>
 </div>
 </div>
 )}
 </div>
 
 {stockStatus && (
 <div className={`border rounded-lg px-2 py-1 mt-2 ${stockStatusColor}`}>
 <p className="text-xs font-semibold">
 {stockStatus}
 </p>
 </div>
 )}
 
 {/* Show Alert Thresholds */}
 <div className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 mt-2">
 <div className="grid grid-cols-3 gap-1 text-xs">
 <div>
 <div className="text-gray-600">Low</div>
 <div className="font-semibold text-red-600">{thresholds.low}</div>
 </div>
 <div>
 <div className="text-gray-600">Med</div>
 <div className="font-semibold text-yellow-600">{thresholds.medium}</div>
 </div>
 <div>
 <div className="text-gray-600">High</div>
 <div className="font-semibold text-green-600">{thresholds.high}</div>
 </div>
 </div>
 </div>
 </>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </>
 );
 })()}
 </div>


 {/* Production House Leaderboard - ranks every house by output/wastage%/yield for
 the selected period. Only meaningful with more than one house to compare, so it's
 hidden entirely when a single production house is already the active filter. */}
 {!selectedProductionHouseId && context.productionHouses && context.productionHouses.length > 1 && (() => {
 const { startDate, endDate } = getDateRangeBounds();
 const periodProduction = productionData.filter(p => p.date >= startDate && p.date <= endDate);

 const rows = context.productionHouses.map(ph => {
 const matchesHouse = (p: any) => {
 const matchesStoreId = p.storeId === ph.id;
 const matchesProductionHouseId = p.productionHouseId === ph.id;
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 recordProductionHouseId = allStores.find(s => s.id === p.storeId)?.productionHouseId || undefined;
 }
 const phId = recordProductionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || phId === ph.id;
 };
 const houseRecords = periodProduction.filter(matchesHouse);
 let totalFinal = 0, totalRawKg = 0, totalWastageKg = 0;
 MOMO_TYPES.forEach(t => {
 totalFinal += houseRecords.reduce((sum, p) => sum + (p[t.key]?.final || 0), 0);
 totalRawKg += t.group === 'regular'
 ? houseRecords.reduce((sum, p) => sum + (p[t.key]?.dough || 0) + (p[t.key]?.stuffing || 0), 0)
 : houseRecords.reduce((sum, p) => sum + (p[t.key]?.batter || 0) + (p[t.key]?.coating || 0), 0);
 });
 totalWastageKg = houseRecords.reduce((sum, p) => sum + (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0), 0);
 const yieldPcsPerKg = totalRawKg > 0 ? Math.round((totalFinal / totalRawKg) * 10) / 10 : null;
 const wastagePct = (totalRawKg + totalWastageKg) > 0 ? Math.round((totalWastageKg / (totalRawKg + totalWastageKg)) * 1000) / 10 : 0;
 return { id: ph.id, name: ph.name, totalFinal, yieldPcsPerKg, wastagePct };
 }).filter(r => r.totalFinal > 0).sort((a, b) => b.totalFinal - a.totalFinal);

 if (rows.length === 0) return null;
 const maxFinal = Math.max(...rows.map(r => r.totalFinal));

 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <div className="mb-4">
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <Factory className="w-6 h-6 text-indigo-600" />
 Production House Leaderboard
 </h2>
 <p className="text-sm text-gray-600">Output, yield and wastage rate by house for the selected date range</p>
 </div>
 <div className="space-y-3">
 {rows.map((r, idx) => (
 <div key={r.id} className="flex items-center gap-3">
 <span className="w-5 text-sm font-bold text-gray-400 flex-shrink-0 text-right">{idx + 1}</span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 mb-1">
 <span className="text-sm font-semibold text-gray-900 truncate">{r.name}</span>
 <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
 {r.totalFinal.toLocaleString()} pcs
 {r.yieldPcsPerKg !== null && ` · ${r.yieldPcsPerKg} pcs/kg`}
 {' · '}
 <span className={r.wastagePct > 5 ? 'text-red-600 font-medium' : 'text-gray-500'}>{r.wastagePct}% waste</span>
 </span>
 </div>
 <div className="w-full bg-gray-100 rounded-full h-2">
 <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${maxFinal > 0 ? Math.max(4, (r.totalFinal / maxFinal) * 100) : 0}%` }} />
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
 })()}

 {/* Production Ledger - dough/stuffing/batter/coating pools, carried forward day to
 day via ProductionManagement.tsx's entry workflow. Only meaningful for a single
 concrete production house (an "all houses" combined pool trend isn't meaningful as
 raw kg without house-specific context) and will look sparse until real data
 accumulates from go-live (2026-08-23) onward - same expectation as every other
 go-live gate this session. */}
 {selectedProductionHouseId && (() => {
 const PRODUCTION_LEDGER_GO_LIVE_DATE = '2026-08-23';
 const sortedEntries = [...productionLedgerRange].sort((a, b) => a.date.localeCompare(b.date));

 if (productionLedgerRangeLoading) {
 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6 text-center text-sm text-gray-500">
 Loading production ledger…
 </div>
 );
 }
 if (sortedEntries.length === 0) {
 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <Package className="w-6 h-6 text-teal-600" />
 Production Ledger
 </h2>
 <p className="text-sm text-gray-600">
 Dough/stuffing/batter/coating carry-forward tracking starts {PRODUCTION_LEDGER_GO_LIVE_DATE} - no closed days yet for this house in the selected range.
 </p>
 </div>
 );
 }

 // Totals per pool across the whole range, for utilization % and days-of-cover.
 const totals: Record<string, { prepared: number; wastage: number }> = {};
 ALL_POOL_IDS.forEach((id) => { totals[id] = { prepared: 0, wastage: 0 }; });
 sortedEntries.forEach((entry) => {
 ALL_POOL_IDS.forEach((id) => {
 const pool = (entry.pools as any)?.[id];
 if (!pool) return;
 totals[id].prepared += pool.prepared || 0;
 if (typeof pool.wastage === 'number') totals[id].wastage += pool.wastage;
 });
 });
 const latestEntry = sortedEntries[sortedEntries.length - 1];
 const daysInRange = sortedEntries.length;

 // Leftover-aging: consecutive days back from the latest entry where a pool's
 // closingActual stayed above a small threshold - a rough "sitting idle" signal,
 // not a precise spoilage model (there's no per-type shelf-life data anywhere).
 const agingDays: Record<string, number> = {};
 ALL_POOL_IDS.forEach((id) => {
 let count = 0;
 for (let i = sortedEntries.length - 1; i >= 0; i--) {
 const pool = (sortedEntries[i].pools as any)?.[id];
 if (pool && typeof pool.closingActual === 'number' && pool.closingActual > 0.01) count++;
 else break;
 }
 agingDays[id] = count;
 });

 const utilizationRows = ALL_POOL_IDS
 .map((id) => ({
 id,
 label: getPoolLabel(id),
 prepared: totals[id].prepared,
 utilizationPct: totals[id].prepared > 0 ? Math.round((totals[id].wastage / totals[id].prepared) * 1000) / 10 : null,
 closingActual: (latestEntry.pools as any)?.[id]?.closingActual ?? null,
 avgDailyConsumption: daysInRange > 0 ? totals[id].wastage / daysInRange : 0,
 }))
 .filter((r) => r.prepared > 0 || (r.closingActual !== null && r.closingActual > 0));

 if (utilizationRows.length === 0) return null;

 const trendData = sortedEntries.map((entry) => {
 const row: any = { label: formatDateIST(entry.date) };
 ALL_POOL_IDS.forEach((id) => {
 const pool = (entry.pools as any)?.[id];
 row[`${id}_opening`] = pool?.opening ?? null;
 row[`${id}_prepared`] = pool?.prepared ?? null;
 row[`${id}_closing`] = pool?.closingActual ?? null;
 });
 return row;
 });

 const activePoolId = selectedLedgerPoolId && utilizationRows.some((r) => r.id === selectedLedgerPoolId)
 ? selectedLedgerPoolId
 : utilizationRows[0].id;

 // Actually-consumed material yield, per momo type with its own pool - pieces made
 // (from production: records for this house/range) divided by kg actually drawn
 // down from that type's own pool (the ledger's `wastage` field - see
 // EndOfDayCloseForm, this doubles as "net consumption" since there's no separate
 // expected-yield formula to split real usage from true spoilage). This is the
 // "actually consumed" counterpart to the prepared-based Raw Material Yield chart
 // above - shown separately rather than replacing it, since it only covers dates
 // this ledger has data for.
 const houseProductionInRange = productionData.filter((p: any) => {
 const matchesHouse = p.productionHouseId === selectedProductionHouseId || p.storeId === selectedProductionHouseId;
 return matchesHouse && p.date >= sortedEntries[0].date && p.date <= latestEntry.date;
 });
 const actualYieldRows = MOMO_TYPES
 .map((t) => {
 const poolId = `${t.perTypePoolField}:${t.inventoryKey}`;
 const consumedKg = totals[poolId]?.wastage || 0;
 const piecesMade = houseProductionInRange.reduce((sum: number, p: any) => sum + (p[t.key]?.final || 0), 0);
 return {
 key: t.key,
 label: t.label,
 piecesMade,
 consumedKg,
 yieldPcsPerKg: consumedKg > 0.01 ? Math.round((piecesMade / consumedKg) * 10) / 10 : null,
 };
 })
 .filter((r) => r.piecesMade > 0 || r.consumedKg > 0);

 return (
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <div className="mb-4">
 <h2 className="text-xl text-gray-900 mb-1 flex items-center gap-2">
 <Package className="w-6 h-6 text-teal-600" />
 Production Ledger
 </h2>
 <p className="text-sm text-gray-600">Dough/stuffing/batter/coating pools, carried forward day to day - tracking since {PRODUCTION_LEDGER_GO_LIVE_DATE}</p>
 </div>

 <div className="overflow-x-auto mb-6">
 <table className="w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 border-b border-gray-200">
 <th className="py-2 pr-2 font-medium">Pool</th>
 <th className="py-2 px-2 font-medium">Prepared (period)</th>
 <th className="py-2 px-2 font-medium">Utilization</th>
 <th className="py-2 px-2 font-medium">Current Leftover</th>
 <th className="py-2 pl-2 font-medium">Days of Stock Cover</th>
 </tr>
 </thead>
 <tbody>
 {utilizationRows.map((r) => {
 const daysCover = r.avgDailyConsumption > 0.001 && r.closingActual !== null
 ? Math.round((r.closingActual / r.avgDailyConsumption) * 10) / 10
 : null;
 return (
 <tr key={r.id} className="border-b border-gray-100 last:border-0">
 <td className="py-2 pr-2 text-gray-700">{r.label}</td>
 <td className="py-2 px-2 tabular-nums text-gray-900">{r.prepared.toFixed(2)} kg</td>
 <td className="py-2 px-2 tabular-nums">
 {r.utilizationPct === null ? <span className="text-gray-400">—</span> : `${r.utilizationPct}%`}
 </td>
 <td className="py-2 px-2 tabular-nums text-gray-900">
 {r.closingActual === null ? <span className="text-gray-400">—</span> : `${r.closingActual.toFixed(2)} kg`}
 </td>
 <td className="py-2 pl-2 tabular-nums">
 {daysCover === null ? <span className="text-gray-400">—</span> : (
 <span className={daysCover > 7 ? 'text-amber-600 font-medium' : 'text-gray-700'}>{daysCover} days</span>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {(() => {
 const risky = ALL_POOL_IDS
 .map((id) => ({ id, label: getPoolLabel(id), days: agingDays[id] }))
 .filter((r) => r.days >= 3);
 if (risky.length === 0) return null;
 return (
 <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
 <div className="flex items-center gap-2 mb-2">
 <AlertCircle className="w-4 h-4 text-amber-600" />
 <span className="text-sm font-semibold text-amber-800">Leftover sitting unused for several days</span>
 </div>
 <ul className="text-xs text-amber-800 space-y-1">
 {risky.map((r) => (
 <li key={r.id}>{r.label} - untouched for {r.days} day{r.days === 1 ? '' : 's'} in a row</li>
 ))}
 </ul>
 </div>
 );
 })()}

 <div className="mb-6">
 <div className="flex items-center gap-2 mb-3">
 <label className="text-xs text-gray-500">Pool:</label>
 <select
 value={activePoolId}
 onChange={(e) => setSelectedLedgerPoolId(e.target.value)}
 className="text-sm border border-gray-300 rounded-lg px-2 py-1"
 >
 {utilizationRows.map((r) => (
 <option key={r.id} value={r.id}>{r.label}</option>
 ))}
 </select>
 </div>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart data={trendData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="label" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip />
 <Legend />
 <Line type="monotone" dataKey={`${activePoolId}_opening`} name="Opening" stroke="#94a3b8" strokeWidth={2} dot={{ r: 2 }} connectNulls />
 <Line type="monotone" dataKey={`${activePoolId}_prepared`} name="Prepared" stroke="#0d9488" strokeWidth={2} dot={{ r: 2 }} connectNulls />
 <Line type="monotone" dataKey={`${activePoolId}_closing`} name="Closing (counted)" stroke="#ea580c" strokeWidth={2} dot={{ r: 2 }} connectNulls />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>

 {actualYieldRows.length > 0 && (
 <div>
 <h3 className="text-base font-bold text-gray-900 tracking-tight mb-1">Actual Material Yield (Ledger)</h3>
 <p className="text-xs text-gray-500 mb-3">Pieces made per kg actually drawn from that type's own pool - the actually-consumed counterpart to the prepared-based Raw Material Yield chart above, covering only ledger-tracked dates</p>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="text-left text-gray-500 border-b border-gray-200">
 <th className="py-2 pr-2 font-medium">Momo Type</th>
 <th className="py-2 px-2 font-medium">Pieces Made</th>
 <th className="py-2 px-2 font-medium">Kg Consumed</th>
 <th className="py-2 pl-2 font-medium">Yield (pcs/kg)</th>
 </tr>
 </thead>
 <tbody>
 {actualYieldRows.map((r) => (
 <tr key={r.key} className="border-b border-gray-100 last:border-0">
 <td className="py-2 pr-2 text-gray-700">{r.label}</td>
 <td className="py-2 px-2 tabular-nums text-gray-900">{r.piecesMade.toLocaleString()}</td>
 <td className="py-2 px-2 tabular-nums text-gray-900">{r.consumedKg.toFixed(2)} kg</td>
 <td className="py-2 pl-2 tabular-nums text-gray-900">{r.yieldPcsPerKg === null ? <span className="text-gray-400">—</span> : r.yieldPcsPerKg}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>
 );
 })()}

 {/* Wastage Analysis Charts - trend charts below now follow the shared
 productionDateRange selector at the top of this tab, same as every other trended
 section on this page, instead of their own separate "as of" date. */}
 <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
 <div className="mb-6">
 <h2 className="text-xl text-gray-900 mb-1">Wastage Analysis</h2>
 <p className="text-sm text-gray-600">Track and minimize production wastage</p>
 </div>

 {/* Helper function for filtering production data by production house */}
 {(() => {
 const filterById = analyticsMode === 'production'
 ? selectedProductionHouseId
 : (context.user?.designation === 'production_incharge'
 ? effectiveStoreId
 : selectedProductionHouseId);
 
 // Get stores mapped to this production house
 const mappedStoreIds = filterById 
 ? stores.filter(s => s.productionHouseId === filterById).map(s => s.id)
 : [];
 
 // Helper function to check if a production record matches the filter
 const matchesProductionHouse = (p: any) => {
 if (!filterById) return true;
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 const phId = p.productionHouseId || p.storeId;
 const matchesMappedStore = mappedStoreIds.includes(p.storeId) || mappedStoreIds.includes(p.productionHouseId);
 return matchesStoreId || matchesProductionHouseId || phId === filterById || matchesMappedStore;
 };
 
 // Expose helper to parent scope for charts to use
 (window as any).wastageFilterHelper = { matchesProductionHouse, mappedStoreIds, filterById };
 
 const filteredProduction = productionData.filter(matchesProductionHouse);

 const totalWastageAllTime = filteredProduction.reduce((sum, p) => {
 return sum + 
 (p.wastage?.dough || 0) + 
 (p.wastage?.stuffing || 0) + 
 (p.wastage?.batter || 0) + 
 (p.wastage?.coating || 0);
 }, 0);

 const recordsWithWastage = filteredProduction.filter(p => 
 (p.wastage?.dough || 0) > 0 || 
 (p.wastage?.stuffing || 0) > 0 || 
 (p.wastage?.batter || 0) > 0 || 
 (p.wastage?.coating || 0) > 0
 );

 if (filteredProduction.length === 0) {
 return (
 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
 <p className="text-yellow-800 font-medium">⚠️ No production data found</p>
 <p className="text-sm text-yellow-700 mt-1">
 Please select a production house or ensure production data has been logged.
 </p>
 </div>
 );
 }

 if (recordsWithWastage.length === 0 && filteredProduction.length > 0) {
 return (
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
 <p className="text-blue-800 font-medium">ℹ️ No wastage data recorded</p>
 <p className="text-sm text-blue-700 mt-1">
 Found {filteredProduction.length} production record(s), but no wastage has been logged yet.
 Wastage values can be entered in the Production Management section.
 </p>
 </div>
 );
 }

 return null;
 })()}

 {/* Daily Wastage Trend - rebuilt on the same current-vs-previous-period convention
 (zipPrev + renderPrevAwareLegend, driven by the shared productionDateRange selector)
 as every other trended chart on this page. Previously this was three separate
 "last 5 days/weeks/months as of {wastageTrendEndDate}" own-history mini-charts with
 their own date anchor, the only trended section on this page with no previous-period
 comparison line - replaced with one chart so it reads consistently with Output &
 Efficiency and Sauces Usage above. */}
 {(() => {
 const helper = (window as any).wastageFilterHelper;
 const enumerateDates = (start: string, end: string): string[] => {
 const dates: string[] = [];
 let d = start;
 let guard = 0;
 while (d <= end && guard < 400) {
 dates.push(d);
 d = addDays(d, 1);
 guard++;
 }
 return dates;
 };
 const buildWastageSeries = (dates: string[]) => dates.map(date => {
 const dayProduction = productionData.filter(p => helper.matchesProductionHouse(p) && p.date === date);
 const wastage = dayProduction.reduce((sum, p) =>
 sum + (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0), 0);
 return { date, label: formatDateIST(date), wastage: Math.round(wastage * 100) / 100 };
 });

 const { startDate, endDate } = getDateRangeBounds();
 const previousRangeForWastage = getPreviousPeriodDateRange();
 const currentDates = enumerateDates(startDate, endDate);
 const previousDates = enumerateDates(previousRangeForWastage.startDate, previousRangeForWastage.endDate);
 const wastageSeries = buildWastageSeries(currentDates);
 const previousWastageSeries = buildWastageSeries(previousDates);
 const wastageChartData = zipPrev(wastageSeries, previousWastageSeries, ['wastage']);

 if (currentDates.length === 0) return null;

 return (
 <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 mb-6">
 <h3 className="text-gray-900 font-bold mb-1">Daily Wastage Trend</h3>
 <p className="text-xs text-gray-600 mb-3">Total kg wasted per day for the selected date range · dotted line is the matching previous period</p>
 <LazyChart height={260}>{() => (
 <ResponsiveContainer width="100%" height={260}>
 <LineChart data={wastageChartData}>
 <CartesianGrid strokeDasharray="3 3" stroke="#fca5a5" />
 <XAxis dataKey="label" tick={{ fontSize: 10 }} />
 <YAxis tick={{ fontSize: 10 }} unit="kg" />
 <Tooltip />
 <Legend content={renderPrevAwareLegend} />
 <Line type="monotone" dataKey="wastage" name="Wastage (kg)" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
 <Line type="monotone" dataKey="prev_wastage" name="Wastage (previous period)" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="none" />
 </LineChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>
 );
 })()}

 {/* Wastage Breakdown by Type with Time Filter */}
 <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
 <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
 <h3 className="text-xl text-gray-900">Wastage Breakdown by Type</h3>

 {/* Time Filter for Wastage */}
 <div className="flex flex-wrap gap-2">
 {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
 <button
 key={filter}
 onClick={() => setWastageTimeFilter(filter as WastageTimeFilter)}
 className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
 wastageTimeFilter === filter
 ? 'bg-gray-900 text-white'
 : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
 }`}
 >
 {filter.charAt(0).toUpperCase() + filter.slice(1)}
 </button>
 ))}
 </div>
 </div>

 <LazyChart height={400}>{() => (
 <ResponsiveContainer width="100%" height={400}>
 <BarChart data={(() => {
 // Use consistent production house filtering logic
 const helper = (window as any).wastageFilterHelper;
 
 const filteredProduction = productionData.filter(p => {
 if (!helper.matchesProductionHouse(p)) return false;
 if (wastageTimeFilter === 'custom') {
 return p.date >= dateRange.from && p.date <= dateRange.to;
 }
 
 const today = new Date();
 const pDate = new Date(p.date);
 
 if (wastageTimeFilter === 'daily') {
 // Last 5 days
 const fiveDaysAgo = new Date(today);
 fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
 return pDate >= fiveDaysAgo;
 } else if (wastageTimeFilter === 'weekly') {
 // Last 5 weeks
 const fiveWeeksAgo = new Date(today);
 fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35);
 return pDate >= fiveWeeksAgo;
 } else if (wastageTimeFilter === 'monthly') {
 // Last 5 months
 const fiveMonthsAgo = new Date(today);
 fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);
 return pDate >= fiveMonthsAgo;
 } else if (wastageTimeFilter === 'yearly') {
 // Last 5 years
 const fiveYearsAgo = new Date(today);
 fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
 return pDate >= fiveYearsAgo;
 }
 
 return true;
 });

 // Group by time period (similar to production chart)
 const grouped = new Map();
 filteredProduction.forEach(p => {
 let key = p.date;
 let displayLabel = p.date;
 
 if (wastageTimeFilter === 'weekly') {
 // Monday-Sunday weeks, as on the rest of the page (date-string arithmetic, no UTC drift)
 const [py, pm, pd] = p.date.split('-').map(Number);
 const weekStartStr = addDays(p.date, -((new Date(Date.UTC(py, pm - 1, pd)).getUTCDay() + 6) % 7));
 const weekStart = new Date(`${weekStartStr}T00:00:00`);
 const weekEnd = new Date(`${addDays(weekStartStr, 6)}T00:00:00`);
 key = weekStartStr;
 // Format as "Dec 22 - Dec 28"
 displayLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
 } else if (wastageTimeFilter === 'monthly') {
 key = p.date.substring(0, 7); // YYYY-MM
 displayLabel = key;
 } else if (wastageTimeFilter === 'yearly') {
 key = p.date.substring(0, 4); // YYYY
 displayLabel = key;
 }

 if (!grouped.has(key)) {
 grouped.set(key, {
 period: displayLabel,
 dough: 0,
 stuffing: 0,
 batter: 0,
 coating: 0
 });
 }

 const data = grouped.get(key)!;
 data.dough += p.wastage?.dough || 0;
 data.stuffing += p.wastage?.stuffing || 0;
 data.batter += p.wastage?.batter || 0;
 data.coating += p.wastage?.coating || 0;
 });

 return Array.from(grouped.values()).sort((a, b) => 
 a.period.localeCompare(b.period)
 ).map((item, index) => ({ ...item, uniqueKey: `wastage-breakdown-${index}` }));
 })()}>
 <CartesianGrid key="wastage-breakdown-grid" strokeDasharray="3 3" stroke="#e0e0e0" />
 <XAxis 
 key="wastage-breakdown-xaxis"
 dataKey="period" 
 tick={{ fontSize: 12 }} 
 angle={wastageTimeFilter === 'weekly' ? -15 : 0}
 textAnchor={wastageTimeFilter === 'weekly' ? 'end' : 'middle'}
 height={wastageTimeFilter === 'weekly' ? 60 : 30}
 />
 <YAxis key="wastage-breakdown-yaxis" tick={{ fontSize: 12 }} label={{ value: 'kg', angle: -90, position: 'insideLeft' }} />
 <Tooltip key="wastage-breakdown-tooltip" content={<WastageTooltip />} />
 <Legend key="wastage-breakdown-legend" />
 <Bar key="dough-bar" dataKey="dough" name="Dough" fill="#dc2626" />
 <Bar key="stuffing-bar" dataKey="stuffing" name="Stuffing" fill="#f97316" />
 <Bar key="batter-bar" dataKey="batter" name="Batter" fill="#fbbf24" />
 <Bar key="coating-bar" dataKey="coating" name="Coating" fill="#14b8a6" />
 </BarChart>
 </ResponsiveContainer>
 )}</LazyChart>
 </div>

 {/* SOP Maintenance Section - Cluster Head Only */}
 {isClusterHead && (
 <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-200 p-6 mt-6">
 <div className="flex justify-between items-center mb-6">
 <div>
 <h3 className="text-xl text-gray-900 flex items-center gap-2">
 <ClipboardCheck className="w-6 h-6 text-blue-600" />
 SOP Maintenance - Threshold Limits
 </h3>
 <p className="text-sm text-gray-600 mt-1">Set standard ingredient usage per piece (in grams)</p>
 </div>
 {!editingSop ? (
 <button
 onClick={() => {
 setTempSopThresholds(JSON.parse(JSON.stringify(sopThresholds)));
 setTempDiversionPercent(sopDiversionPercent);
 setEditingSop(true);
 }}
 className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
 >
 <Edit className="w-4 h-4" />
 Edit SOP
 </button>
 ) : (
 <div className="flex gap-2">
 <button
 onClick={() => {
 setSopThresholds(tempSopThresholds);
 setSopDiversionPercent(tempDiversionPercent);
 setEditingSop(false);
 // TODO: Save to backend
 toast.success('SOP thresholds and diversion limit updated successfully');
 }}
 className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
 >
 <Check className="w-4 h-4" />
 Save
 </button>
 <button
 onClick={() => {
 setEditingSop(false);
 setTempSopThresholds(null);
 }}
 className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors flex items-center gap-2"
 >
 <X className="w-4 h-4" />
 Cancel
 </button>
 </div>
 )}
 </div>

 {/* SOP Diversion Percentage Setting */}
 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
 <div className="flex items-center justify-between">
 <div>
 <h4 className="text-gray-900 font-semibold flex items-center gap-2">
 <AlertCircle className="w-5 h-5 text-yellow-600" />
 Maximum Allowed Diversion from SOP
 </h4>
 <p className="text-sm text-gray-600 mt-1">Set the acceptable deviation range (±%) from SOP standards. Using too little OR too much is non-compliant.</p>
 </div>
 <div className="flex items-center gap-3">
 <label className="text-sm text-gray-700">Max Diversion:</label>
 <input
 type="number"
 min="0"
 max="20"
 step="1"
 value={editingSop ? tempDiversionPercent : sopDiversionPercent}
 onChange={(e) => {
 if (editingSop) {
 setTempDiversionPercent(Number(e.target.value));
 }
 }}
 disabled={!editingSop}
 className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
 />
 <span className="text-gray-700">%</span>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {Object.entries(editingSop ? tempSopThresholds : sopThresholds).map(([key, values]: [string, any]) => {
 const momoNames: any = {
 chickenMomos: 'Chicken Momos',
 chickenCheeseMomos: 'Chicken Cheese Momos',
 vegMomos: 'Veg Momos',
 cheeseCornMomos: 'Cheese Corn Momos',
 paneerMomos: 'Paneer Momos',
 vegKurkure: 'Veg Kurkure',
 chickenKurkure: 'Chicken Kurkure'
 };

 return (
 <div key={key} className="bg-white rounded-lg p-4 border border-gray-200">
 <h4 className="text-gray-900 mb-3">{momoNames[key]}</h4>
 <div className="space-y-2">
 <div>
 <label className="text-xs text-gray-600">Dough (g/pc)</label>
 <input
 type="number"
 value={values.dough}
 disabled={!editingSop}
 onChange={(e) => {
 if (editingSop) {
 setTempSopThresholds({
 ...tempSopThresholds,
 [key]: { ...tempSopThresholds[key], dough: Number(e.target.value) }
 });
 }
 }}
 className={`w-full px-2 py-1 border rounded text-sm ${editingSop ? 'bg-white' : 'bg-gray-100'}`}
 />
 </div>
 <div>
 <label className="text-xs text-gray-600">Stuffing (g/pc)</label>
 <input
 type="number"
 value={values.stuffing}
 disabled={!editingSop}
 onChange={(e) => {
 if (editingSop) {
 setTempSopThresholds({
 ...tempSopThresholds,
 [key]: { ...tempSopThresholds[key], stuffing: Number(e.target.value) }
 });
 }
 }}
 className={`w-full px-2 py-1 border rounded text-sm ${editingSop ? 'bg-white' : 'bg-gray-100'}`}
 />
 </div>
 {values.batter !== undefined && (
 <div>
 <label className="text-xs text-gray-600">Batter (g/pc)</label>
 <input
 type="number"
 value={values.batter}
 disabled={!editingSop}
 onChange={(e) => {
 if (editingSop) {
 setTempSopThresholds({
 ...tempSopThresholds,
 [key]: { ...tempSopThresholds[key], batter: Number(e.target.value) }
 });
 }
 }}
 className={`w-full px-2 py-1 border rounded text-sm ${editingSop ? 'bg-white' : 'bg-gray-100'}`}
 />
 </div>
 )}
 {values.coating !== undefined && (
 <div>
 <label className="text-xs text-gray-600">Coating (g/pc)</label>
 <input
 type="number"
 value={values.coating}
 disabled={!editingSop}
 onChange={(e) => {
 if (editingSop) {
 setTempSopThresholds({
 ...tempSopThresholds,
 [key]: { ...tempSopThresholds[key], coating: Number(e.target.value) }
 });
 }
 }}
 className={`w-full px-2 py-1 border rounded text-sm ${editingSop ? 'bg-white' : 'bg-gray-100'}`}
 />
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Daily Usage vs SOP Compliance */}
 <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mt-6">
 <div className="mb-6">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
 <h3 className="text-xl text-gray-900 flex items-center gap-2">
 <TrendingUp className="w-6 h-6 text-blue-600" />
 Daily Ingredient Usage & SOP Compliance
 </h3>

 {/* Date Selector for SOP Compliance */}
 <DatePicker
 label="Date:"
 value={sopComplianceDate}
 onChange={setSopComplianceDate}
 />
 </div>
 <p className="text-sm text-gray-600">Regular momos only - Actual usage per piece vs SOP limits with diversion %</p>
 </div>

 <div className="space-y-6">
 {(() => {
 // Debug logging for SOP Compliance filtering
 const filterById = analyticsMode === 'production'
 ? selectedProductionHouseId
 : (context.user?.designation === 'production_incharge'
 ? effectiveStoreId
 : selectedProductionHouseId);
 
 // Use the SOP compliance date selector
 const datesToShow = [sopComplianceDate];
 
 const last5Days = [];
 for (const dateStr of datesToShow) {
 const dayProduction = productionData.filter(p => {
 // Use consistent production house filtering logic
 const filterById = analyticsMode === 'production'
 ? selectedProductionHouseId // In production mode, use production house selector
 : (context.user?.designation === 'production_incharge'
 ? effectiveStoreId // Production incharge in store mode uses their store ID
 : selectedProductionHouseId); // Cluster head in store mode uses production house selector
 
 // Get mapped store IDs once outside the if block for logging
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const mappedStoreIds = allStores
 .filter(s => s.productionHouseId === filterById)
 .map(s => s.id);
 
 // Direct matches
 const matchesStoreId = p.storeId === filterById;
 const matchesProductionHouseId = p.productionHouseId === filterById;
 const phId = p.productionHouseId || p.storeId;
 const matchesFallback = phId === filterById;
 const matchesMappedStore = p.storeId && mappedStoreIds.includes(p.storeId);
 const matchesDate = p.date === dateStr;
 const isApproved = p.approvalStatus === 'approved';
 
 const passesFilter = (matchesStoreId || matchesProductionHouseId || matchesFallback || matchesMappedStore);
 const finalResult = passesFilter && matchesDate && isApproved;
 
 if (filterById && !passesFilter) {
 return false;
 }
 return matchesDate && isApproved;
 });
 
 if (dayProduction.length === 0) continue;

 // Map production data fields to SOP threshold keys
 const fieldMapping: any = {
 chickenMomos: 'chickenMomos',
 chickenCheeseMomos: 'chickenCheeseMomos',
 vegMomos: 'vegMomos',
 cheeseCornMomos: 'cheeseCornMomos',
 paneerMomos: 'paneerMomos',
 vegKurkureMomos: 'vegKurkure',
 chickenKurkureMomos: 'chickenKurkure'
 };

 const usageByType: any = {};
 
 dayProduction.forEach(p => {
 // Process regular momos (with dough and stuffing)
 ['chickenMomos', 'chickenCheeseMomos', 'vegMomos', 'cheeseCornMomos', 'paneerMomos'].forEach(field => {
 const momoData = (p as any)[field];
 if (momoData && momoData.final > 0) {
 const sopKey = fieldMapping[field];
 if (!usageByType[sopKey]) {
 usageByType[sopKey] = {
 quantity: 0,
 totalDough: 0,
 totalStuffing: 0,
 totalBatter: 0,
 totalCoating: 0
 };
 }
 usageByType[sopKey].quantity += momoData.final;
 usageByType[sopKey].totalDough += momoData.dough || 0;
 usageByType[sopKey].totalStuffing += momoData.stuffing || 0;
 }
 });

 // Process kurkure momos (with batter and coating)
 ['vegKurkureMomos', 'chickenKurkureMomos'].forEach(field => {
 const momoData = (p as any)[field];
 if (momoData && momoData.final > 0) {
 const sopKey = fieldMapping[field];
 if (!usageByType[sopKey]) {
 usageByType[sopKey] = {
 quantity: 0,
 totalDough: 0,
 totalStuffing: 0,
 totalBatter: 0,
 totalCoating: 0
 };
 }
 usageByType[sopKey].quantity += momoData.final;
 usageByType[sopKey].totalBatter += momoData.batter || 0;
 usageByType[sopKey].totalCoating += momoData.coating || 0;
 }
 });
 });

 last5Days.push({ date: dateStr, usage: usageByType });
 }

 if (last5Days.length === 0) {
 return (
 <div className="text-center py-12 text-gray-500">
 <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
 <p>No approved production data found for {formatDateIST(sopComplianceDate)}</p>
 <p className="text-sm mt-1">Production entries must be approved to appear here</p>
 </div>
 );
 }

 return last5Days.map(({ date, usage }) => (
 <div key={date} className="border border-gray-200 rounded-lg p-4">
 <h4 className="text-gray-900 mb-4">{formatDateIST(date)}</h4>
 
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {Object.entries(usage).map(([momoType, data]: [string, any]) => {
 if (data.quantity === 0) return null;
 
 // Skip Kurkure momos - SOP compliance not required
 if (momoType === 'vegKurkure' || momoType === 'chickenKurkure') {
 return null;
 }

 const momoNames: any = {
 chickenMomos: 'Chicken Momos',
 chickenCheeseMomos: 'Chicken Cheese',
 vegMomos: 'Veg Momos',
 cheeseCornMomos: 'Cheese Corn',
 paneerMomos: 'Paneer Momos',
 vegKurkure: 'Veg Kurkure',
 chickenKurkure: 'Chicken Kurkure'
 };

 // Convert kg to g by multiplying by 1000
 const avgDough = data.quantity > 0 ? (data.totalDough * 1000) / data.quantity : 0;
 const avgStuffing = data.quantity > 0 ? (data.totalStuffing * 1000) / data.quantity : 0;
 const avgBatter = data.quantity > 0 ? (data.totalBatter * 1000) / data.quantity : 0;
 const avgCoating = data.quantity > 0 ? (data.totalCoating * 1000) / data.quantity : 0;

 // Calculate diversion percentages
 const doughDiversion = sopThresholds[momoType].dough > 0 ? ((avgDough - sopThresholds[momoType].dough) / sopThresholds[momoType].dough) * 100 : 0;
 const stuffingDiversion = sopThresholds[momoType].stuffing > 0 ? ((avgStuffing - sopThresholds[momoType].stuffing) / sopThresholds[momoType].stuffing) * 100 : 0;
 const batterDiversion = sopThresholds[momoType].batter > 0 ? ((avgBatter - sopThresholds[momoType].batter) / sopThresholds[momoType].batter) * 100 : 0;
 const coatingDiversion = sopThresholds[momoType].coating > 0 ? ((avgCoating - sopThresholds[momoType].coating) / sopThresholds[momoType].coating) * 100 : 0;

 // Use dynamic diversion percentage - check BOTH upper and lower bounds
 const minDiversion = 1 - (sopDiversionPercent / 100);
 const maxDiversion = 1 + (sopDiversionPercent / 100);
 const doughCompliance = avgDough >= sopThresholds[momoType].dough * minDiversion && avgDough <= sopThresholds[momoType].dough * maxDiversion;
 const stuffingCompliance = avgStuffing >= sopThresholds[momoType].stuffing * minDiversion && avgStuffing <= sopThresholds[momoType].stuffing * maxDiversion;
 const batterCompliance = !sopThresholds[momoType].batter || (avgBatter >= sopThresholds[momoType].batter * minDiversion && avgBatter <= sopThresholds[momoType].batter * maxDiversion);
 const coatingCompliance = !sopThresholds[momoType].coating || (avgCoating >= sopThresholds[momoType].coating * minDiversion && avgCoating <= sopThresholds[momoType].coating * maxDiversion);

 const overallCompliance = doughCompliance && stuffingCompliance && batterCompliance && coatingCompliance;

 return (
 <div 
 key={momoType} 
 className={`p-3 rounded-lg border-2 ${overallCompliance ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}
 >
 <div className="flex items-center justify-between mb-2">
 <p className="text-sm text-gray-900">{momoNames[momoType]}</p>
 {overallCompliance ? (
 <Check className="w-5 h-5 text-green-600" />
 ) : (
 <AlertCircle className="w-5 h-5 text-red-600" />
 )}
 </div>
 <p className="text-xs text-gray-600 mb-2">Qty: {data.quantity} pcs</p>
 
 <div className="space-y-1 text-xs">
 <div className={`flex justify-between items-center ${!doughCompliance ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
 <span>Dough:</span>
 <div className="text-right">
 <div>{avgDough.toFixed(1)}g / {sopThresholds[momoType].dough}g</div>
 <div className={`text-[10px] ${Math.abs(doughDiversion) > sopDiversionPercent ? 'text-red-600' : 'text-green-600'}`}>
 {doughDiversion > 0 ? '+' : ''}{doughDiversion.toFixed(1)}%
 </div>
 </div>
 </div>
 <div className={`flex justify-between items-center ${!stuffingCompliance ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
 <span>Stuffing:</span>
 <div className="text-right">
 <div>{avgStuffing.toFixed(1)}g / {sopThresholds[momoType].stuffing}g</div>
 <div className={`text-[10px] ${Math.abs(stuffingDiversion) > sopDiversionPercent ? 'text-red-600' : 'text-green-600'}`}>
 {stuffingDiversion > 0 ? '+' : ''}{stuffingDiversion.toFixed(1)}%
 </div>
 </div>
 </div>
 {sopThresholds[momoType].batter && (
 <div className={`flex justify-between items-center ${!batterCompliance ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
 <span>Batter:</span>
 <div className="text-right">
 <div>{avgBatter.toFixed(1)}g / {sopThresholds[momoType].batter}g</div>
 <div className={`text-[10px] ${Math.abs(batterDiversion) > sopDiversionPercent ? 'text-red-600' : 'text-green-600'}`}>
 {batterDiversion > 0 ? '+' : ''}{batterDiversion.toFixed(1)}%
 </div>
 </div>
 </div>
 )}
 {sopThresholds[momoType].coating && (
 <div className={`flex justify-between items-center ${!coatingCompliance ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
 <span>Coating:</span>
 <div className="text-right">
 <div>{avgCoating.toFixed(1)}g / {sopThresholds[momoType].coating}g</div>
 <div className={`text-[10px] ${Math.abs(coatingDiversion) > sopDiversionPercent ? 'text-red-600' : 'text-green-600'}`}>
 {coatingDiversion > 0 ? '+' : ''}{coatingDiversion.toFixed(1)}%
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 ));
 })()}
 </div>
 </div>
 </div>
 </div>
 )}
 </>
 );
}
