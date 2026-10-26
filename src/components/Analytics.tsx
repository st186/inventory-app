import { useState, useEffect, useMemo, useCallback } from 'react';
import { TrendingUp, TrendingDown, Package, AlertCircle, Calendar, Filter, Download, DollarSign, ShoppingCart, ClipboardCheck, UserX, Users, Factory, Trash2, Edit, Check, X, ClipboardList, FileSpreadsheet, CheckCircle, Settings, RefreshCw, FileText, Soup, ArrowUp, ArrowDown, Minus, BarChart3, Wallet, ChevronDown, ChevronUp, ChevronRight, Clock, CalendarDays, Smartphone, Briefcase, Receipt, Zap, Home, Target, AlertTriangle, XCircle, Percent } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps, LineChart, Line, ReferenceLine, ComposedChart, AreaChart, Area } from 'recharts';
import { toast } from 'sonner@2.0.3';
import * as api from '../utils/api';
import { formatDateTimeIST, formatDateIST, getTodayIST, addDays } from '../utils/timezone';
import { InventoryContextType } from '../App';
import { employeeBelongsToStore } from '../utils/entityAccess';
import { SalaryBreakdownModal } from './SalaryBreakdownModal';
import { CommissionBreakdownModal, InterestBreakdownModal } from './CostBreakdownModals';
import { buildSmoothedCosts } from '../utils/dailyCostSmoothing';
import { buildSalaryBreakdown, monthAdd, monthLabel } from '../utils/salaryBreakdown';
import { DataCapture } from './DataCapture';
import { ProductionRequests } from './ProductionRequests';
import { SalesData as SalesDataComponent } from './SalesData';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';
import { DatePicker } from './DatePicker';
import { RecalibrationReports } from './RecalibrationReports';
import { StockAnalysis } from './StockAnalysis';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES, FIXED_COST_CATEGORIES, costBucketFor, canonicalCategory, expenseCategoryLabel, isSpreadCategory, isDatedProfitCost } from '../utils/inventoryData';
import { buildSpreadCosts } from '../utils/spreadCosts';
import { buildOnlineCostIndex, onlineCostsForRange } from '../utils/onlineCosts';
import { UnitEconomics, normalizePnl, type PnlBreakdown, type CostLineKey } from './UnitEconomics';
import { DailyBriefCard } from './insights/DailyBriefCard';
import { ForecastCard } from './insights/ForecastCard';
import { TrendsGrowth } from './insights/TrendsGrowth';
import { useInsightsOverview } from './insights/useInsightsOverview';
import { CostLineModal, type CostLineGroup } from './CostLineModal';
import { counterValueByChannel } from '../utils/channelFoodValue';
import { getSupabaseClient } from '../utils/supabase/client';
import { logger } from '../utils/logger';
import { ExpenseBreakdownModal } from './ExpenseBreakdownModal';
import { getSettlementPeriod, settlementOverlapsPeriod } from '../utils/settlementPeriod';
import { MOMO_TYPES, ALL_POOL_IDS, getPoolLabel } from '../constants/momoTypes';

interface AnalyticsProps {
 context: InventoryContextType;
 selectedStoreId?: string | null;
 highlightRequestId?: string | null;
 onNavigateToManageItems?: () => void;
 // Production Management no longer has its own top-level nav entry - it's opened from
 // here instead, same idea as onNavigateToManageItems above.
 onNavigateToProductionManagement?: () => void;
}

// Custom Tooltip Component for Bar Charts
const CustomTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <p className="text-gray-900 mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>{label}</p>
 {payload.map((entry: any, index: number) => (
 <div key={index} className="flex items-center gap-2 mt-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: entry.color }}
 />
 <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: '500' }}>
 {entry.name}:
 </span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 ₹{entry.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
 </span>
 </div>
 ))}
 </div>
 );
 }
 return null;
};

// Custom Tooltip Component for Pie Charts
const CustomPieTooltip = ({ active, payload }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 const data = payload[0];
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <div className="flex items-center gap-2 mb-2">
 <div 
 className="w-4 h-4 rounded-full" 
 style={{ backgroundColor: data.payload.fill }}
 />
 <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: '600' }}>
 {data.name}
 </p>
 </div>
 <div className="space-y-1">
 <div className="flex justify-between gap-4">
 <span className="text-gray-600" style={{ fontSize: '13px' }}>Amount:</span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 ₹{data.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
 </span>
 </div>
 <div className="flex justify-between gap-4">
 <span className="text-gray-600" style={{ fontSize: '13px' }}>Percentage:</span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 {data.payload.percentage}%
 </span>
 </div>
 </div>
 </div>
 );
 }
 return null;
};

// Custom Tooltip for Production (Quantity in pieces)
const ProductionTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <p className="text-gray-900 mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>{label}</p>
 {payload.map((entry: any, index: number) => (
 <div key={index} className="flex items-center gap-2 mt-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: entry.color }}
 />
 <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: '500' }}>
 {entry.name}:
 </span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 {entry.value.toLocaleString()} pcs
 </span>
 </div>
 ))}
 </div>
 );
 }
 return null;
};

// Custom Tooltip for Wastage (Weight in kg)
const WastageTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <p className="text-gray-900 mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>{label}</p>
 {payload.map((entry: any, index: number) => (
 <div key={index} className="flex items-center gap-2 mt-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: entry.color }}
 />
 <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: '500' }}>
 {entry.name}:
 </span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 {entry.value.toFixed(2)} kg
 </span>
 </div>
 ))}
 </div>
 );
 }
 return null;
};

type TimeFilter = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastWeek' | 'lastMonth' | 'custom';
// What the period picker offers. "Last 6 months" and "This year" are ready-made custom ranges:
// every period calculation sees 'custom' with that range (see presetDateRange).
type TimeFilterChoice = TimeFilter | 'last6Months' | 'thisYear';
type WastageTimeFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const TIME_FILTER_OPTIONS: { value: TimeFilterChoice; label: string }[] = [
 { value: 'today', label: 'Today' },
 { value: 'yesterday', label: 'Yesterday' },
 { value: 'thisWeek', label: 'This Week' },
 { value: 'thisMonth', label: 'This Month' },
 { value: 'lastWeek', label: 'Last Week' },
 { value: 'lastMonth', label: 'Last Month' },
 { value: 'last6Months', label: 'Last 6 Months' },
 { value: 'thisYear', label: 'This Year' },
 { value: 'custom', label: 'Custom' }
];

// The date range behind "Last 6 months" (this month and the 5 before it) and "This year".
function presetDateRange(choice: TimeFilterChoice): { from: string; to: string } | null {
 const today = getTodayIST();
 if (choice === 'thisYear') return { from: `${today.slice(0, 4)}-01-01`, to: today };
 if (choice === 'last6Months') {
 const [y, m] = today.split('-').map(Number);
 const start = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10);
 return { from: start, to: today };
 }
 return null;
}

// Shortens long item names for chart axis ticks (full name still shows in the tooltip).
function truncateChartLabel(name: string, max: number): string {
 return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

type SettlementPeriodLike = {
 settlementDate: string;
 periodStart?: string;
 periodEnd?: string;
 sourceFileName?: string;
 orders?: { orderDate?: string }[];
};

const settlementOverlapsAnalyticsRange = (
 settlement: SettlementPeriodLike,
 range: { start: string; end: string } | null
) => {
 if (!range) return true;
 return settlementOverlapsPeriod(settlement, range.start, range.end);
};

const settlementAnalyticsReportingDate = (settlement: SettlementPeriodLike) =>
 getSettlementPeriod(settlement).end;

// Date-range filter used across the Analytics tabs. Mobile gets a compact
// dropdown (the pill row clips/truncates on narrow screens); desktop keeps
// the pill row.
function TimeFilterBar({ value, onChange, range, onRangeChange }: {
 value: TimeFilterChoice;
 onChange: (v: TimeFilterChoice) => void;
 range: { from: string; to: string };
 onRangeChange: (r: { from: string; to: string }) => void;
}) {
 return (
 <div className="flex flex-col gap-2 w-full sm:w-auto min-w-0">
 <select
 value={value}
 onChange={(e) => onChange(e.target.value as TimeFilterChoice)}
 className="sm:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
 >
 {TIME_FILTER_OPTIONS.map((filter) => (
 <option key={filter.value} value={filter.value}>{filter.label}</option>
 ))}
 </select>
 <div className="hidden sm:flex gap-2 overflow-x-auto pb-0">
 {TIME_FILTER_OPTIONS.map((filter) => (
 <button
 key={filter.value}
 onClick={() => onChange(filter.value)}
 className={`px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
 value === filter.value
 ? 'bg-gray-900 text-white'
 : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
 }`}
 >
 {filter.label}
 </button>
 ))}
 </div>
 {value === 'custom' && (
 <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2">
 <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
 <label className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
 From
 <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onRangeChange({ ...range, from: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
 </label>
 <label className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
 To
 <input type="date" value={range.to} min={range.from} max={getTodayIST()} onChange={(e) => e.target.value && onRangeChange({ ...range, to: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
 </label>
 </div>
 )}
 </div>
 );
}

export function Analytics({ context, selectedStoreId, highlightRequestId, onNavigateToManageItems, onNavigateToProductionManagement }: AnalyticsProps) {
 // Online sales/payout/settlement data now lives in context (see the Analytics page
 // redesign) - Analytics.tsx, OnlineSalesTab.tsx, and SalesData.tsx all read the same
 // fetch instead of each independently re-fetching it.
 const { onlineSalesData, onlinePayoutData, aggregatorSettlements } = context;

 // Load online loans data for interest expense calculation
 const [onlineLoans, setOnlineLoans] = useState<api.OnlineLoan[]>([]);
 const [isLoadingLoans, setIsLoadingLoans] = useState(false);

 // Load online loans data for interest expense calculation
 useEffect(() => {
 const loadLoans = async () => {
 if (!context.user?.accessToken) return;
 
 setIsLoadingLoans(true);
 try {
 const loans = await api.getOnlineLoans(context.user.accessToken);
 setOnlineLoans(loans || []);
 } catch (error) {
 console.error('Error loading loans data:', error);
 } finally {
 setIsLoadingLoans(false);
 }
 };
 
 loadLoans();
 }, [context.user?.accessToken]);

 // Helper function to identify commission entries (LEGACY - no longer used for commission calculation)
 // Commission entries are stored as overhead items with category 'service_charge' and description containing 'Aggregator Commission'
 // Legacy entries may have category 'commission'
 const isCommissionEntry = (item: any) => {
 return (
 (item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) ||
 item.category === 'commission' // Legacy format
 );
 };

 const isClusterHead = context.user?.role === 'cluster_head';
 const isManager = context.user?.role === 'manager';
 const isAudit = context.user?.role === 'audit';
 const isProductionIncharge = context.user?.designation === 'production_incharge';
 const isStoreIncharge = context.user?.designation === 'store_incharge';
 // Operations manager: any other manager, not tied to a single store or production
 // house (isManager alone doesn't distinguish this - store/production incharges are
 // also role === 'manager', just with a different designation).
 const isOperationsManager = isManager && !isProductionIncharge && !isStoreIncharge;

 // Analytics Mode: 'store' or 'production'
 // Production incharges default to production analytics
 // Store incharges default to store analytics
 // A production-request notification always overrides that default: "Stock Requests"
 // (the production-requests tab) lives under Store Analytics, not Production Analytics.
 const [analyticsMode, setAnalyticsMode] = useState<'store' | 'production'>(
 highlightRequestId ? 'store' : (isProductionIncharge ? 'production' : 'store')
 );
 
 // Store selection for Store Analytics mode now comes straight from the `selectedStoreId`
 // prop (the single global store picker at the top of the app) instead of keeping a
 // second, separate copy of the same choice here - that second copy never updated when
 // the global picker changed, which is exactly what produced three different-looking,
 // out-of-sync store selectors on the same page. Falls back to the user's own store for
 // plain employees, who don't get the global picker at all.
 // For Production Analytics mode, this is ignored (we use production house selector instead)
 // A production incharge who is also a manager (e.g. a founding member) has no global store
 // picker, so Store Analytics used to fall through to "no store selected" - which several
 // store tabs and the store+linked-production cost scoping can't work with. Resolve them to
 // the store they actually belong to (explicit assignment first, then their own store id
 // when it is a real store, then whichever store their production house supplies) - no
 // production-house id is ever used as a store id here.
 const productionInchargeDefaultStoreId = (() => {
 if (!isProductionIncharge) return null;
 const stores = context.stores || [];
 const u = context.user;
 const assigned = u?.assignedStoreIds?.find((id) => stores.length === 0 || stores.some((s) => s.id === id));
 if (assigned) return assigned;
 if (u?.storeId && (stores.length === 0 ? String(u.storeId).startsWith('STORE-') : stores.some((s) => s.id === u.storeId))) return u.storeId;
 const houseIds = [...(u?.assignedProductionHouseIds || []), ...(u?.storeId ? [u.storeId] : [])];
 return stores.find((s) => s.productionHouseId && houseIds.includes(s.productionHouseId))?.id || null;
 })();
 // Forecast, brief and trends need one store; with "All stores" use the main store (the one
 // with a production house).
 const insightsStoreId: string | null = selectedStoreId
 || (context.user?.storeId && String(context.user.storeId).startsWith('STORE-') ? context.user.storeId : null)
 || (context.stores || []).find((s) => s.productionHouseId)?.id || context.stores?.[0]?.id || null;
 const canManageInsights = isClusterHead || isOperationsManager;
 const insightsOverview = useInsightsOverview(context.user?.accessToken, insightsStoreId);
 const effectiveStoreId = analyticsMode === 'store'
 ? (selectedStoreId || productionInchargeDefaultStoreId || (!(isClusterHead || isManager || isProductionIncharge || isAudit) ? (context.user?.storeId || null) : null))
 : null;

 // A production house's own inventory/overhead/fixed-cost entries carry no storeId at all
 // (entityType: 'production_house' instead) - only linkedEntityId. With a specific store
 // selected, filteredInventoryData/filteredOverheadData/filteredFixedCostsData below match
 // storeId exactly, which silently excludes every one of this store's own production
 // costs (they show up only when "All Stores" happens to fall back to no filter at all -
 // confirmed real: switching from one store to "All Stores" jumped Inventory Costs by the
 // store's ENTIRE production-house spend, not by another store's contribution). Mirrors
 // the same store->production-house lookup SalesView.tsx already uses for its own cash
 // reconciliation.
 const effectiveProductionHouseIdForCosts = effectiveStoreId
 ? context.stores?.find((s) => s.id === effectiveStoreId)?.productionHouseId || null
 : null;

 // Dynamic finished products list for the Store-Production SLA Analysis tab - mirrors the same
 // derivation ProductionRequests.tsx uses (including its legacySalesKey mapping, needed to
 // match each item against the sales-data "data" map), so both screens agree on which
 // items exist.
 const stockAnalysisFinishedProducts = useMemo(() => {
 return (context.inventoryItems?.filter((item) =>
 item.category === 'finished_product' && item.isActive
 ) || []).map((item) => {
 const legacySalesKey = item.displayName.endsWith('Momo')
 ? item.displayName + 's'
 : item.displayName;
 return {
 camelKey: item.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase()),
 label: item.displayName,
 legacySalesKey,
 };
 });
 }, [context.inventoryItems]);

 // Store-Production SLA Analysis is scoped the same way the rest of Store Analytics is -
 // effectiveStoreId===null means "All Stores" (cluster head with nothing selected).
 const stockAnalysisRequests = useMemo(() => {
 return (context.productionRequests || []).filter((req) =>
 !effectiveStoreId || req.storeId === effectiveStoreId
 );
 }, [context.productionRequests, effectiveStoreId]);

 // "Sold" quantities come from categorySalesData (the per-momo-type daily sales sync),
 // NOT context.salesData (that's the financial-totals record - offlineSales/onlineSales/
 // paytmAmount - it has no per-item breakdown at all, which is why this column read 0
 // before this fix).
 const stockAnalysisSalesData = useMemo(() => {
 return (context.categorySalesData || []).filter((s) =>
 !effectiveStoreId || s.storeId === effectiveStoreId
 );
 }, [context.categorySalesData, effectiveStoreId]);

 // DEBUG: Log the effective store ID being used
 logger.debugStore('Analytics effectiveStoreId:', effectiveStoreId);
 logger.debugStore('Analytics mode:', analyticsMode);
 console.log('🏪 All stores in context:', context.stores);
 console.log('🏪 Number of stores:', context.stores?.length);
 
 // 'profit'/'expense'/'sales' keep their original internal names (Revenue & Channels /
 // Costs & Margins / Item Performance are just their new display labels) to avoid
 // touching every reference to them across this file - only the tab bar, its labels,
 // and each view's content changed. 'datacapture' (Performance Tracker) is no longer a
 // top-level tab - it's now a collapsible section inside 'overview' (see the Analytics
 // page redesign).
 type ActiveView = 'overview' | 'profit' | 'expense' | 'unit-economics' | 'sales' | 'cash-reconciliation' | 'production' | 'production-requests' | 'stock-request-analysis' | 'recalibration-reports' | 'trends';
 const [activeView, setActiveView] = useState<ActiveView>(
 highlightRequestId ? 'production-requests' : 'overview'
 );
 
 // Expense breakdown modal state
 const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<{
 category: string;
 items: any[];
 amount: number;
 // Salaries, commission and interest aren't purchases of items, so they open their own
 // purpose-built breakdowns instead of the item/price-trend modal (which had nothing to
 // show for them).
 type?: 'salary' | 'commission' | 'interest';
 } | null>(null);
 // Unit Economics: the ladder line whose detail sheet is open (see buildCostLine below).
 const [costLine, setCostLine] = useState<CostLineKey | null>(null);
 
 // Debug: Log activeView changes
 useEffect(() => {
 logger.debugAnalytics('activeView changed to:', activeView);
 }, [activeView]);
 
 // When switching analytics mode, change the active view
 // Note: 'production-requests' (Stock Requests) is a Store Analytics tab, not a
 // Production Analytics one - it must not be reset away from when switching to 'store'.
 useEffect(() => {
 if (analyticsMode === 'production' && activeView !== 'production' && activeView !== 'recalibration-reports') {
 setActiveView('production');
 } else if ((activeView === 'production' || activeView === 'recalibration-reports') && analyticsMode === 'store') {
 setActiveView('overview');
 }
 }, [analyticsMode]);

 // Item Sales Analytics (per-item, per-channel) is the more decision-useful view, so it
 // now leads instead of being the second sub-tab (Analytics page redesign).
 const [salesSubView, setSalesSubView] = useState<'revenue' | 'category'>('category');
 const [orderItemDetail, setOrderItemDetail] = useState<api.OrderItemDetailRecord[]>([]);
 // Same shape as orderItemDetail, but for previousPeriodRange - powers the dashed
 // "previous period" comparison lines on the order-based Overview charts.
 const [previousOrderItemDetail, setPreviousOrderItemDetail] = useState<api.OrderItemDetailRecord[]>([]);
 // Recalibration (Store Analytics side) now lives as a button beside "Manage Items" in
 // ProductionRequests.tsx's Store Stock Status card, rather than its own sub-tab here.
 // Performance Tracker (DataCapture) is folded into the Overview tab as a collapsible
 // section instead of its own top-level tab (Analytics page redesign).
 const [showActivityLog, setShowActivityLog] = useState(false);
 const [timeFilterChoice, setTimeFilterChoice] = useState<TimeFilterChoice>('thisMonth');
 const timeFilter: TimeFilter = timeFilterChoice === 'last6Months' || timeFilterChoice === 'thisYear' ? 'custom' : timeFilterChoice;
 // Daily charts: spread rent/electricity/salaries over the month (default) vs show them on
 // the day they were actually paid. Remembered per device; storage can be unavailable.
 const [smoothFixedCosts, setSmoothFixedCosts] = useState<boolean>(() => {
 try { return localStorage.getItem('analytics.smoothFixedCosts') !== 'off'; } catch { return true; }
 });
 const updateSmoothFixedCosts = (on: boolean) => {
 setSmoothFixedCosts(on);
 try { localStorage.setItem('analytics.smoothFixedCosts', on ? 'on' : 'off'); } catch { /* ignore */ }
 };
 const [wastageTimeFilter, setWastageTimeFilter] = useState<WastageTimeFilter>('monthly');
 // Initialize date range to current month (from 1st to today)
 const getDateRangeDefaults = () => {
 const today = new Date();
 const year = today.getFullYear();
 const month = String(today.getMonth() + 1).padStart(2, '0');
 const day = String(today.getDate()).padStart(2, '0');
 
 return {
 from: `${year}-${month}-01`, // Start of current month
 to: `${year}-${month}-${day}` // Today
 };
 };
 
 const [customDateRange, setDateRange] = useState(getDateRangeDefaults());
 const dateRange = useMemo(() => presetDateRange(timeFilterChoice) ?? customDateRange, [timeFilterChoice, customDateRange]);
 const [todayLeaveCount, setTodayLeaveCount] = useState<number>(0);
 const [todayLeaveDetails, setTodayLeaveDetails] = useState<any[]>([]);
 const [showLeaveModal, setShowLeaveModal] = useState(false);
 const [loadingLeaves, setLoadingLeaves] = useState(true);
 const [payoutsData, setPayoutsData] = useState<any[]>([]);
 const [employeesData, setEmployeesData] = useState<any[]>([]);
 const [showRecalibration, setShowRecalibration] = useState(false);
 const [stores, setStores] = useState<api.Store[]>([]);
 const [latestRecalibration, setLatestRecalibration] = useState<any>(null);
 const [previousMonthStock, setPreviousMonthStock] = useState<any>(null);
 const [sopThresholds, setSopThresholds] = useState<any>({
 chickenMomos: { dough: 25, stuffing: 15 },
 chickenCheeseMomos: { dough: 25, stuffing: 18 },
 vegMomos: { dough: 25, stuffing: 12 },
 cheeseCornMomos: { dough: 25, stuffing: 16 },
 paneerMomos: { dough: 25, stuffing: 14 },
 vegKurkure: { dough: 28, stuffing: 12, batter: 10, coating: 5 },
 chickenKurkure: { dough: 28, stuffing: 15, batter: 10, coating: 5 }
 });
 const [editingSop, setEditingSop] = useState(false);
 const [tempSopThresholds, setTempSopThresholds] = useState<any>(null);
 const [sopDiversionPercent, setSopDiversionPercent] = useState<number>(5); // Default 5% diversion allowed
 const [tempDiversionPercent, setTempDiversionPercent] = useState<number>(5);
 // Stock Alert Thresholds - Three levels (High, Medium, Low)
 const [stockAlertThresholds, setStockAlertThresholds] = useState<Record<string, { high: number; medium: number; low: number }>>({
 chicken: { high: 1200, medium: 600, low: 300 },
 chickenCheese: { high: 600, medium: 300, low: 150 },
 veg: { high: 600, medium: 300, low: 150 },
 cheeseCorn: { high: 600, medium: 300, low: 150 },
 paneer: { high: 600, medium: 300, low: 150 },
 vegKurkure: { high: 400, medium: 200, low: 100 },
 chickenKurkure: { high: 400, medium: 200, low: 100 }
 });
 const [showStockAlertModal, setShowStockAlertModal] = useState(false);
 const [tempStockAlertThresholds, setTempStockAlertThresholds] = useState<Record<string, { high: number; medium: number; low: number }>>({});
 
 // Plate Conversion Settings - For displaying stock in plates
 const [momosPerPlate, setMomosPerPlate] = useState<number>(() => {
 const saved = localStorage.getItem('momosPerPlate');
 return saved ? parseInt(saved, 10) : 6; // Default 6 momos per plate
 });
 const [showPlateSettingsModal, setShowPlateSettingsModal] = useState(false);
 const [tempMomosPerPlate, setTempMomosPerPlate] = useState<number>(6);
 
 // Production incharges are locked to their production house, cluster heads can select any
 const [selectedProductionHouseId, setSelectedProductionHouseId] = useState<string | null>(
 isProductionIncharge ? (context.user?.storeId || null) : null
 );
 
 const salesData = context.salesData;
 const inventoryData = context.inventory;
 const overheadData = context.overheads;
 const fixedCostsData = context.fixedCosts;
 const productionData = context.productionData;
 const loading = false;

 // Production Ledger (dough/stuffing/batter/coating carry-forward) range for the selected
 // production house and date range - fetched on-demand, same pattern as orderItemDetail
 // above, rather than a global context field (this data is inherently date-range-scoped
 // and only meaningful for one house at a time, unlike productionData). Powers the
 // "Production Ledger" analytics section below - only meaningful for a single concrete
 // production house, not an "all houses" view.
 const [productionLedgerRange, setProductionLedgerRange] = useState<api.ProductionLedgerEntry[]>([]);
 const [productionLedgerRangeLoading, setProductionLedgerRangeLoading] = useState(false);
 const [selectedLedgerPoolId, setSelectedLedgerPoolId] = useState<string | null>(null);

 // Production date selector - defaults to most recent production date
 const [selectedProductionDate, setSelectedProductionDate] = useState<string | null>(() => {
 // Get all unique dates from production data for the selected production house
 const dates = productionData
 .map(p => p.date)
 .filter((date, index, self) => self.indexOf(date) === index)
 .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
 
 // Return the most recent date, or today (IST) if no data
 if (dates.length > 0) {
 return dates[0];
 } else {
 return getTodayIST();
 }
 });
 
 // SOP Compliance date selector - defaults to most recent approved production date
 const [sopComplianceDate, setSopComplianceDate] = useState<string>(() => {
 // Get the most recent date with approved production
 const dates = productionData
 .filter(p => p.approvalStatus === 'approved')
 .map(p => p.date)
 .filter((date, index, self) => self.indexOf(date) === index)
 .sort((a, b) => b.localeCompare(a));
 
 if (dates.length > 0) {
 return dates[0];
 } else {
 return getTodayIST();
 }
 });
 
 // Production date range selector
 type DateRangeType = 'today' | 'yesterday' | 'thisWeek' | 'previousWeek' | 'thisMonth' | 'previousMonth' | 'thisYear' | 'previousYear' | 'custom';
 const [productionDateRange, setProductionDateRange] = useState<DateRangeType>('thisMonth');
 const [customStartDate, setCustomStartDate] = useState<string>('');
 const [customEndDate, setCustomEndDate] = useState<string>('');
 
 // Helper function to calculate date range based on selection
 const getDateRangeBounds = (): { startDate: string; endDate: string } => {
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 
 // Helper to convert Date to YYYY-MM-DD in local timezone
 const toLocalDateString = (date: Date): string => {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 };
 
 let startDate: Date;
 let endDate: Date;
 
 switch (productionDateRange) {
 case 'today':
 startDate = new Date(today);
 endDate = new Date(today);
 break;
 
 case 'yesterday':
 startDate = new Date(today);
 startDate.setDate(startDate.getDate() - 1);
 endDate = new Date(startDate);
 break;
 
 case 'thisWeek':
 // Start of current week (Monday)
 startDate = new Date(today);
 const dayOfWeek = startDate.getDay();
 const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust when day is Sunday
 startDate.setDate(startDate.getDate() + diff);
 // End is today
 endDate = new Date(today);
 break;
 
 case 'previousWeek':
 // Start of previous week (Monday)
 startDate = new Date(today);
 const currentDayOfWeek = startDate.getDay();
 const diffToPrevMonday = currentDayOfWeek === 0 ? -13 : -(currentDayOfWeek + 6);
 startDate.setDate(startDate.getDate() + diffToPrevMonday);
 // End of previous week (Sunday)
 endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + 6);
 break;
 
 case 'thisMonth':
 // Start of current month
 startDate = new Date(today.getFullYear(), today.getMonth(), 1);
 // End is today
 endDate = new Date(today);
 break;
 
 case 'previousMonth':
 // Start of previous month
 startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 // End of previous month (last day)
 endDate = new Date(today.getFullYear(), today.getMonth(), 0);
 break;
 
 case 'thisYear':
 // Start of current year
 startDate = new Date(today.getFullYear(), 0, 1);
 // End is today
 endDate = new Date(today);
 break;
 
 case 'previousYear':
 // Start of previous year
 startDate = new Date(today.getFullYear() - 1, 0, 1);
 // End of previous year (December 31)
 endDate = new Date(today.getFullYear() - 1, 11, 31);
 break;
 
 case 'custom':
 if (customStartDate && customEndDate) {
 startDate = new Date(customStartDate + 'T00:00:00');
 endDate = new Date(customEndDate + 'T00:00:00');
 } else {
 // Fallback to today if custom dates not set
 startDate = new Date(today);
 endDate = new Date(today);
 }
 break;
 
 default:
 startDate = new Date(today);
 endDate = new Date(today);
 }
 
 return {
 startDate: toLocalDateString(startDate),
 endDate: toLocalDateString(endDate)
 };
 };

 // Fetches the production ledger range for the currently selected production house and
 // date range - same on-demand pattern as orderItemDetail above. Only fetched when a
 // single production house is selected (an "all houses" combined pool trend isn't
 // meaningful as raw kg figures without house-specific context).
 useEffect(() => {
 if (activeView !== 'production' || !selectedProductionHouseId || !context.user?.accessToken) {
 setProductionLedgerRange([]);
 return;
 }
 const accessToken = context.user.accessToken;
 const { startDate, endDate } = getDateRangeBounds();
 let cancelled = false;
 setProductionLedgerRangeLoading(true);
 (async () => {
 try {
 const entries = await api.getProductionLedgerRange(accessToken, selectedProductionHouseId, startDate, endDate);
 if (!cancelled) setProductionLedgerRange(entries || []);
 } catch (err) {
 console.error('Failed to load production ledger range:', err);
 if (!cancelled) setProductionLedgerRange([]);
 } finally {
 if (!cancelled) setProductionLedgerRangeLoading(false);
 }
 })();
 return () => { cancelled = true; };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [activeView, selectedProductionHouseId, productionDateRange, customStartDate, customEndDate, context.user?.accessToken]);

 // Helper function to calculate previous period date range for comparison
 const getPreviousPeriodDateRange = (): { startDate: string; endDate: string } => {
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 
 const toLocalDateString = (date: Date): string => {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 };
 
 let startDate: Date;
 let endDate: Date;
 
 switch (productionDateRange) {
 case 'today':
 // Compare with yesterday
 startDate = new Date(today);
 startDate.setDate(today.getDate() - 1);
 endDate = new Date(startDate);
 break;
 
 case 'yesterday':
 // Compare with day before yesterday
 startDate = new Date(today);
 startDate.setDate(today.getDate() - 2);
 endDate = new Date(startDate);
 break;
 
 case 'thisWeek':
 // Compare with same days in previous week
 const currentWeekStart = new Date(today);
 currentWeekStart.setDate(today.getDate() - today.getDay());
 const daysIntoWeek = today.getDay();
 
 startDate = new Date(currentWeekStart);
 startDate.setDate(currentWeekStart.getDate() - 7);
 endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + daysIntoWeek);
 break;
 
 case 'previousWeek':
 // Compare with 2 weeks ago
 startDate = new Date(today);
 startDate.setDate(today.getDate() - today.getDay() - 14);
 endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + 6);
 break;
 
 case 'thisMonth':
 // Compare with same date range in previous month
 const daysIntoMonth = today.getDate();
 startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 endDate = new Date(today.getFullYear(), today.getMonth() - 1, daysIntoMonth);
 break;
 
 case 'previousMonth':
 // Compare with 2 months ago
 startDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
 endDate = new Date(today.getFullYear(), today.getMonth() - 1, 0);
 break;
 
 case 'thisYear':
 // Compare with same date range in previous year
 const currentYearStart = new Date(today.getFullYear(), 0, 1);
 const daysIntoYear = Math.floor((today.getTime() - currentYearStart.getTime()) / (1000 * 60 * 60 * 24));
 
 startDate = new Date(today.getFullYear() - 1, 0, 1);
 endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + daysIntoYear);
 break;
 
 case 'previousYear':
 // Compare with 2 years ago
 startDate = new Date(today.getFullYear() - 2, 0, 1);
 endDate = new Date(today.getFullYear() - 2, 11, 31);
 break;
 
 case 'custom':
 if (customStartDate && customEndDate) {
 const fromDate = new Date(customStartDate);
 const toDate = new Date(customEndDate);
 const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
 
 const compStart = new Date(fromDate);
 compStart.setDate(fromDate.getDate() - daysDiff - 1);
 const compEnd = new Date(fromDate);
 compEnd.setDate(fromDate.getDate() - 1);
 
 return {
 startDate: toLocalDateString(compStart),
 endDate: toLocalDateString(compEnd)
 };
 } else {
 startDate = new Date(today);
 startDate.setDate(today.getDate() - 1);
 endDate = new Date(startDate);
 }
 break;
 
 default:
 startDate = new Date(today);
 startDate.setDate(today.getDate() - 1);
 endDate = new Date(startDate);
 }
 
 return {
 startDate: toLocalDateString(startDate),
 endDate: toLocalDateString(endDate)
 };
 };
 
 // Update selected date when production house changes or production data changes
 useEffect(() => {
 // In production analytics mode, always use selectedProductionHouseId
 const filterById = selectedProductionHouseId;
 
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
 .sort((a, b) => b.localeCompare(a));
 
 if (filteredDates.length > 0) {
 setSelectedProductionDate(filteredDates[0]); // Set to most recent
 } else {
 setSelectedProductionDate(getTodayIST());
 }
 }, [selectedProductionHouseId, productionData]);

 // Fetch latest recalibration and calculate previous month's stock for carry-forward
 useEffect(() => {
 console.log('🔄 Carry-Forward useEffect triggered:', {
 analyticsMode,
 selectedProductionHouseId,
 hasProductionData: !!context.productionData?.length,
 hasProductionRequests: !!context.productionRequests?.length
 });
 
 if (analyticsMode === 'production' && selectedProductionHouseId) {
 console.log('✅ Conditions met - fetching opening balance...');
 fetchRecalibrationAndCalculateOpeningBalance();
 } else {
 console.log('❌ Conditions not met for carry-forward');
 }
 }, [selectedProductionHouseId, analyticsMode, context.productionData, context.productionRequests]);

 // Auto-select first production house for Cluster Heads, Managers, and Audit Users in Production Analytics mode
 useEffect(() => {
 if (
 (isClusterHead || isManager || isAudit) && 
 analyticsMode === 'production' && 
 !selectedProductionHouseId && 
 context.productionHouses && 
 context.productionHouses.length > 0
 ) {
 const firstProductionHouse = context.productionHouses[0];
 console.log('🏭 Auto-selecting first production house for Cluster Head/Manager:', firstProductionHouse.id, firstProductionHouse.name);
 setSelectedProductionHouseId(firstProductionHouse.id);
 }
 }, [analyticsMode, isClusterHead, isManager, context.productionHouses]);

 async function fetchRecalibrationAndCalculateOpeningBalance() {
 try {
 const currentMonth = new Date().toISOString().substring(0, 7);
 
 console.log('🚀 Starting opening balance calculation:');
 console.log(' Current month:', currentMonth);
 console.log(' Selected production house ID:', selectedProductionHouseId);
 console.log(' Available production data records:', productionData.length);
 console.log(' Available production requests:', context.productionRequests?.length || 0);
 console.log(' Available stores (local):', stores.length);
 
 // Resolve production house UUID
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 let productionHouseUUID = selectedProductionHouseId;
 if (selectedProductionHouseId && selectedProductionHouseId.startsWith('STORE-')) {
 const userStore = allStores.find(s => s.id === selectedProductionHouseId);
 if (userStore?.productionHouseId) {
 productionHouseUUID = userStore.productionHouseId;
 console.log(' Resolved production house UUID:', productionHouseUUID);
 }
 }

 // Fetch latest recalibration for this production house
 // IMPORTANT: Recalibration might be saved with either:
 // 1. The production house UUID (when created by cluster head/operations manager)
 // 2. The store ID (when created by production incharge who uses their storeId)
 // We need to try both and use whichever returns data
 
 // Skip API call if no production house is selected
 if (!productionHouseUUID) {
 console.log(' ⚠️ No production house UUID available, skipping recalibration fetch');
 setLatestRecalibration(null);
 setPreviousMonthStock(null);
 return;
 }
 
 let recalResponse = await api.fetchLatestRecalibration(
 context.user?.accessToken || '', 
 productionHouseUUID,
 'production_house' // IMPORTANT: Specify location type to fetch production house recalibration
 );
 
 // If no recalibration found with UUID, try to find it using the store ID
 // that maps to this production house (for production incharge created recalibrations)
 if (!recalResponse?.record && productionHouseUUID) {
 console.log(' No recalibration found with UUID, checking with mapped store ID...');
 
 // Find store(s) that map to this production house
 const mappedStores = allStores.filter(s => s.productionHouseId === productionHouseUUID);
 console.log(' Stores mapped to this production house:', mappedStores.map(s => ({ id: s.id, name: s.name })));
 
 // Try each mapped store ID (usually there's only one production house store)
 if (mappedStores && mappedStores.length > 0) {
 for (const mappedStore of mappedStores) {
 console.log(' Trying to fetch recalibration with store ID:', mappedStore.id);
 const storeRecalResponse = await api.fetchLatestRecalibration(
 context.user?.accessToken || '', 
 mappedStore.id,
 'production_house' // Also specify production_house for fallback
 );
 
 if (storeRecalResponse?.record) {
 console.log(' ✅ Found recalibration using store ID:', mappedStore.id);
 recalResponse = storeRecalResponse;
 break;
 }
 }
 }
 }
 
 console.log('📦 Recalibration Response:', recalResponse);
 
 // Check if recalibration exists and is from current month
 let openingBalance: any = null;
 
 if (recalResponse?.record) {
 const recalDate = recalResponse.record.date.substring(0, 7); // "2026-01"
 const recalDay = parseInt(recalResponse.record.date.substring(8, 10)); // Day of month
 
 console.log('📅 Recalibration date comparison:', {
 recalDate,
 recalDay,
 currentMonth,
 isFirstOfMonth: recalDay === 1,
 match: recalDate === currentMonth
 });
 
 if (recalDate === currentMonth) {
 // Use recalibration as opening balance regardless of the day
 // This is the actual counted stock and becomes the new baseline
 console.log('✅ Current month recalibration found - using as opening balance');
 console.log(` Recalibration date: ${recalResponse.record.date} (day ${recalDay})`);
 console.log(' Recalibration items:', recalResponse.record.items);
 
 openingBalance = {};
 recalResponse.record.items.forEach((item: any) => {
 const inventoryItem = context.inventoryItems?.find(invItem => 
 invItem.id === item.itemId || invItem.name === item.itemId
 );
 
 if (inventoryItem) {
 const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
 const stockKey = camelName.replace(/Momo(s)?$/i, '');
 openingBalance[stockKey] = item.actualQuantity;
 console.log(` 📦 Opening balance: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
 } else {
 // Fallback: use itemId as-is
 openingBalance[item.itemId] = item.actualQuantity;
 console.log(` ⚠️ Opening balance item not found in inventory: ${item.itemId}, using as-is`);
 }
 });
 console.log(' Parsed opening balance:', openingBalance);
 } else {
 // Recalibration is from a previous month - calculate from that point
 console.log('📅 Recalibration from previous month, calculating forward...');
 openingBalance = calculateStockFromRecalibration(recalResponse.record, currentMonth);
 }
 } else {
 // No recalibration - calculate from previous month's production/deliveries
 console.log('🔢 No recalibration found, calculating from previous month...');
 openingBalance = calculatePreviousMonthClosingStock(productionHouseUUID);
 }
 
 setLatestRecalibration(recalResponse?.record || null);
 setPreviousMonthStock(openingBalance);
 
 console.log('💰 Opening Balance Calculated:', openingBalance);
 } catch (error) {
 console.error('Error fetching recalibration:', error);
 }
 }

 function calculateStockFromRecalibration(recalRecord: any, targetMonth: string): any {
 // Get the recalibration date
 const recalMonth = recalRecord.date.substring(0, 7);
 
 // Start with recalibrated quantities
 const stock: any = {};
 recalRecord.items.forEach((item: any) => {
 // Map itemId to stock key
 // itemId can be either UUID or snake_case name like "chicken_momo"
 const inventoryItem = context.inventoryItems?.find(invItem => 
 invItem.id === item.itemId || invItem.name === item.itemId
 );
 
 if (inventoryItem) {
 // Convert snake_case to camelCase, then remove _momo suffix
 // e.g., "chicken_momo" -> "chickenMomo" -> "chicken"
 const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
 const stockKey = camelName.replace(/Momo(s)?$/i, '');
 stock[stockKey] = item.actualQuantity;
 console.log(` 📦 Recalibration item mapping: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
 } else {
 // Fallback: use itemId as-is
 stock[item.itemId] = item.actualQuantity;
 console.log(` ⚠️ Recalibration item not found in inventory: ${item.itemId}, using as-is`);
 }
 });
 
 // Calculate months between recalibration and target month
 const recalDate = new Date(recalMonth + '-01');
 const targetDate = new Date(targetMonth + '-01');
 
 // For each month between recalibration and current, add production and subtract deliveries
 let currentDate = new Date(recalDate);
 currentDate.setMonth(currentDate.getMonth() + 1); // Start from month after recalibration
 
 while (currentDate < targetDate) {
 const monthStr = currentDate.toISOString().substring(0, 7);
 
 // Get production for this month
 const monthProduction = getMonthProduction(selectedProductionHouseId, monthStr);
 const monthDeliveries = getMonthDeliveries(selectedProductionHouseId, monthStr);
 
 // Update stock
 ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'].forEach(type => {
 stock[type] = (stock[type] || 0) + (monthProduction[type] || 0) - (monthDeliveries[type] || 0);
 });
 
 currentDate.setMonth(currentDate.getMonth() + 1);
 }
 
 return stock;
 }

 function calculatePreviousMonthClosingStock(productionHouseUUID: string | null): any {
 // Get previous month - properly handle year boundaries
 const currentMonth = new Date().toISOString().substring(0, 7); // "2026-01"
 const [year, month] = currentMonth.split('-').map(Number);
 
 // Calculate previous month
 let prevYear = year;
 let prevMonth = month - 1;
 
 // Handle year boundary (if current month is January)
 if (prevMonth === 0) {
 prevMonth = 12;
 prevYear = year - 1;
 }
 
 // Format as YYYY-MM
 const previousMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
 
 console.log('📊 Calculating previous month closing stock for:', previousMonthStr);
 console.log(' Current month:', currentMonth, '→ Previous month:', previousMonthStr);
 
 // Get production and deliveries for previous month
 const production = getMonthProduction(productionHouseUUID, previousMonthStr);
 const deliveries = getMonthDeliveries(productionHouseUUID, previousMonthStr);
 
 // Calculate closing stock (production - deliveries)
 const closingStock: any = {};
 ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'].forEach(type => {
 closingStock[type] = (production[type] || 0) - (deliveries[type] || 0);
 });
 
 console.log(' Previous month production:', production);
 console.log(' Previous month deliveries:', deliveries);
 console.log(' Calculated closing stock:', closingStock);
 
 return closingStock;
 }

 function getMonthProduction(phId: string | null, monthStr: string): any {
 if (!phId) {
 console.log('⚠️ getMonthProduction called with null phId');
 return {};
 }
 
 console.log(`🔍 Getting production for phId: ${phId}, month: ${monthStr}`);
 console.log(` Total production records available: ${productionData.length}`);
 
 const filteredProduction = productionData.filter(p => {
 if (!p.date.startsWith(monthStr)) return false;
 
 const matchesStoreId = p.storeId === phId;
 const matchesProductionHouseId = p.productionHouseId === phId;
 
 let recordProductionHouseId = p.productionHouseId;
 if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const store = allStores.find(s => s.id === p.storeId);
 recordProductionHouseId = store?.productionHouseId || undefined;
 }
 
 const resolvedPhId = recordProductionHouseId || p.storeId;
 return matchesStoreId || matchesProductionHouseId || resolvedPhId === phId;
 });
 
 console.log(` Filtered production records: ${filteredProduction.length}`);
 
 return filteredProduction.reduce((acc, p) => ({
 chicken: acc.chicken + (p.chickenMomos?.final || 0),
 chickenCheese: acc.chickenCheese + (p.chickenCheeseMomos?.final || 0),
 veg: acc.veg + (p.vegMomos?.final || 0),
 cheeseCorn: acc.cheeseCorn + (p.cheeseCornMomos?.final || 0),
 paneer: acc.paneer + (p.paneerMomos?.final || 0),
 vegKurkure: acc.vegKurkure + (p.vegKurkureMomos?.final || 0),
 chickenKurkure: acc.chickenKurkure + (p.chickenKurkureMomos?.final || 0),
 }), {
 chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
 paneer: 0, vegKurkure: 0, chickenKurkure: 0
 });
 }

 function getMonthDeliveries(phId: string | null, monthStr: string): any {
 if (!phId) {
 console.log('⚠️ getMonthDeliveries called with null phId');
 return {};
 }
 
 console.log(`🚚 Getting deliveries for phId: ${phId}, month: ${monthStr}`);
 console.log(` Total production requests available: ${context.productionRequests?.length || 0}`);
 
 // Resolve UUID if needed
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 let productionHouseUUID = phId;
 if (phId && phId.startsWith('STORE-')) {
 const userStore = allStores.find(s => s.id === phId);
 if (userStore?.productionHouseId) {
 productionHouseUUID = userStore.productionHouseId;
 console.log(` Resolved UUID: ${productionHouseUUID}`);
 }
 }
 
 const fulfilledRequests = (context.productionRequests || []).filter(req => {
 if (req.status !== 'delivered') return false;
 
 const requestDate = req.shippedAt || req.deliveredAt || req.requestDate || req.createdAt;
 if (!requestDate || !requestDate.startsWith(monthStr)) return false;
 
 const requestingStore = allStores.find(s => s.id === req.storeId);
 return requestingStore?.productionHouseId === productionHouseUUID;
 });
 
 console.log(` Filtered delivered requests: ${fulfilledRequests.length}`);
 
 return fulfilledRequests.reduce((acc, req) => ({
 chicken: acc.chicken + (req.chickenMomos || 0),
 chickenCheese: acc.chickenCheese + (req.chickenCheeseMomos || 0),
 veg: acc.veg + (req.vegMomos || 0),
 cheeseCorn: acc.cheeseCorn + (req.cheeseCornMomos || 0),
 paneer: acc.paneer + (req.paneerMomos || 0),
 vegKurkure: acc.vegKurkure + (req.vegKurkureMomos || 0),
 chickenKurkure: acc.chickenKurkure + (req.chickenKurkureMomos || 0),
 }), {
 chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
 paneer: 0, vegKurkure: 0, chickenKurkure: 0
 });
 }

 // Production data debug logging
 if (logger.isDebugEnabled()) {
 logger.debugAnalytics('Production Data Debug:');
 logger.debugAnalytics(' - Total production records:', productionData.length);
 logger.debugAnalytics(' - Production data records:', productionData.map(p => ({
 id: p.id,
 date: p.date,
 storeId: p.storeId,
 productionHouseId: p.productionHouseId,
 approvalStatus: p.approvalStatus,
 chickenMomos: p.chickenMomos?.final || 0,
 totalProduction: (p.chickenMomos?.final || 0) + (p.vegMomos?.final || 0) + (p.chickenCheeseMomos?.final || 0) + (p.cheeseCornMomos?.final || 0) + (p.paneerMomos?.final || 0) + (p.vegKurkureMomos?.final || 0) + (p.chickenKurkureMomos?.final || 0)
 })));
 logger.debugAnalytics(' - Selected production house ID:', selectedProductionHouseId);
 logger.debugAnalytics(' - Analytics mode:', analyticsMode);
 logger.debugAnalytics(' - User storeId:', context.user?.storeId);
 logger.debugAnalytics(' - User designation:', context.user?.designation);
 logger.debugAnalytics(' - Is Production Incharge:', isProductionIncharge);
 logger.debugAnalytics(' - Available production houses:', context.productionHouses.map(h => ({ id: h.id, name: h.name })));
 logger.debugAnalytics(' - Available stores:', context.stores?.map(s => ({ id: s.id, name: s.name, productionHouseId: s.productionHouseId })));
 logger.debugAnalytics(' - Production Incharge Specific:');
 logger.debugAnalytics(' - User storeId (should be production house ID):', context.user?.storeId);
 logger.debugAnalytics(' - Does user storeId match any production house?', context.productionHouses.find(ph => ph.id === context.user?.storeId));
 logger.debugAnalytics(' - Production data storeIds:', [...new Set(productionData.map(p => p.storeId))]);
 logger.debugAnalytics(' - Production data productionHouseIds:', [...new Set(productionData.map(p => p.productionHouseId))]);
 logger.debugAnalytics(' - Stores that map to user production house:', context.stores?.filter(s => s.productionHouseId === context.user?.storeId).map(s => ({ id: s.id, name: s.name })));
 }

 // Helper function to filter data by time period
 const filterByTimeRange = (data: any[], dateField: string = 'date') => {
 // Ensure we have a fresh `today` reference for this filter operation
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 
 return data.filter(item => {
 // Safety check for null/undefined items or missing date field
 if (!item || !item[dateField]) return false;
 
 // Safety check: ensure we have a valid date
 try {
 const itemDate = new Date(item[dateField]);
 if (isNaN(itemDate.getTime())) return false;
 
 const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
 
 switch (timeFilter) {
 case 'today':
 return itemDateOnly.getTime() === today.getTime();
 
 case 'yesterday':
 const yesterday = new Date(today);
 yesterday.setDate(yesterday.getDate() - 1);
 return itemDateOnly.getTime() === yesterday.getTime();
 
 case 'thisWeek':
 // Get start of this week (Monday)
 const startOfThisWeek = new Date(today);
 const dayOfWeek = today.getDay();
 const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days, else go to Monday
 startOfThisWeek.setDate(today.getDate() + diff);
 return itemDateOnly >= startOfThisWeek && itemDateOnly <= today;
 
 case 'thisMonth':
 const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
 return itemDateOnly >= startOfThisMonth && itemDateOnly <= today;
 
 case 'lastWeek':
 // Get start and end of last week (Monday to Sunday)
 const startOfLastWeek = new Date(today);
 const currentDay = today.getDay();
 const daysToLastMonday = currentDay === 0 ? -13 : -(currentDay + 6); // If Sunday, go back 13 days, else go to last Monday
 startOfLastWeek.setDate(today.getDate() + daysToLastMonday);
 const endOfLastWeek = new Date(startOfLastWeek);
 endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
 return itemDateOnly >= startOfLastWeek && itemDateOnly <= endOfLastWeek;
 
 case 'lastMonth':
 const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
 return itemDateOnly >= startOfLastMonth && itemDateOnly <= endOfLastMonth;
 
 case 'custom':
 const fromDate = new Date(dateRange.from);
 const toDate = new Date(dateRange.to);
 return itemDateOnly >= fromDate && itemDateOnly <= toDate;
 
 default:
 return true;
 }
 } catch (error) {
 console.error('Error filtering by time range:', error, 'Item:', item);
 return false;
 }
 });
 };

 // Apply time filtering first
 const timeFilteredSalesData = filterByTimeRange(salesData);
 const timeFilteredInventoryData = filterByTimeRange(inventoryData);
 
 // Special handling for overhead data: use expenseMonth for personal_expense category
 const timeFilteredOverheadData = overheadData.filter(item => {
 // Define today at the top of the filter so it's available in all code paths
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 
 // For personal_expense with expenseMonth, filter based on expenseMonth instead of date
 if (item.category === 'personal_expense' && item.expenseMonth) {
 const expenseYearMonth = item.expenseMonth; // Format: "YYYY-MM"
 
 switch (timeFilter) {
 case 'today':
 case 'yesterday':
 // Daily filters don't apply to monthly expense mapping
 return false;
 
 case 'thisWeek':
 case 'lastWeek':
 // Weekly filters don't apply to monthly expense mapping
 return false;
 
 case 'thisMonth':
 const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
 return expenseYearMonth === thisMonthStr;
 
 case 'lastMonth':
 const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
 return expenseYearMonth === lastMonthStr;
 
 case 'custom':
 // For custom range, check if expenseMonth falls within the range
 const fromDate = new Date(dateRange.from);
 const toDate = new Date(dateRange.to);
 const expenseDate = new Date(expenseYearMonth + '-01');
 const expenseMonthStart = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), 1);
 const expenseMonthEnd = new Date(expenseDate.getFullYear(), expenseDate.getMonth() + 1, 0);
 // Include if the expense month overlaps with the date range
 return expenseMonthStart <= toDate && expenseMonthEnd >= fromDate;
 
 default:
 return true;
 }
 }
 
 // For all other overhead items, use regular date-based filtering
 const itemDate = new Date(item.date);
 const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
 
 switch (timeFilter) {
 case 'today':
 return itemDateOnly.getTime() === today.getTime();
 
 case 'yesterday':
 const yesterday = new Date(today);
 yesterday.setDate(yesterday.getDate() - 1);
 return itemDateOnly.getTime() === yesterday.getTime();
 
 case 'thisWeek':
 const startOfThisWeek = new Date(today);
 const dayOfWeek = today.getDay();
 const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
 startOfThisWeek.setDate(today.getDate() + diff);
 return itemDateOnly >= startOfThisWeek && itemDateOnly <= today;
 
 case 'thisMonth':
 const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
 return itemDateOnly >= startOfThisMonth && itemDateOnly <= today;
 
 case 'lastWeek':
 const startOfLastWeek = new Date(today);
 const currentDay = today.getDay();
 const daysToLastMonday = currentDay === 0 ? -13 : -(currentDay + 6);
 startOfLastWeek.setDate(today.getDate() + daysToLastMonday);
 const endOfLastWeek = new Date(startOfLastWeek);
 endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
 return itemDateOnly >= startOfLastWeek && itemDateOnly <= endOfLastWeek;
 
 case 'lastMonth':
 const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
 return itemDateOnly >= startOfLastMonth && itemDateOnly <= endOfLastMonth;
 
 case 'custom':
 const fromDate = new Date(dateRange.from);
 const toDate = new Date(dateRange.to);
 return itemDateOnly >= fromDate && itemDateOnly <= toDate;
 
 default:
 return true;
 }
 });
 
 const timeFilteredFixedCostsData = filterByTimeRange(fixedCostsData);
 console.log('💰 Before time filtering - payoutsData:', payoutsData.length, 'payouts');
 console.log('💰 Payouts before filtering:', payoutsData.map(p => ({ id: p.id, date: p.date, amount: p.amount })));
 console.log('💰 Sample payout object:', payoutsData[0]);
 console.log('💰 All payout dates as strings:', payoutsData.map(p => p.date).join(', '));
 // FIX: Payouts use 'date' field, not 'payoutDate'
 // Payouts with a forMonth set (backlogged/late salaries, e.g. paid on the 5th
 // for the prior month) are bucketed by forMonth instead of the actual payment
 // date, mirroring the expenseMonth handling for personal_expense overheads above.
 // Payouts without forMonth fall back to the standard date-based filter.
 const payoutsWithForMonth = payoutsData.filter((payout: any) => !!payout.forMonth);
 const payoutsWithoutForMonth = payoutsData.filter((payout: any) => !payout.forMonth);

 const timeFilteredPayoutsWithForMonth = payoutsWithForMonth.filter((payout: any) => {
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const payoutYearMonth = payout.forMonth;

 switch (timeFilter) {
 case 'today':
 case 'yesterday':
 case 'thisWeek':
 case 'lastWeek':
 // Daily/weekly filters don't apply to monthly payout mapping
 return false;

 case 'thisMonth': {
 const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
 return payoutYearMonth === thisMonthStr;
 }

 case 'lastMonth': {
 const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
 return payoutYearMonth === lastMonthStr;
 }

 case 'custom': {
 const fromDate = new Date(dateRange.from);
 const toDate = new Date(dateRange.to);
 const payoutDate = new Date(payoutYearMonth + '-01');
 const payoutMonthStart = new Date(payoutDate.getFullYear(), payoutDate.getMonth(), 1);
 const payoutMonthEnd = new Date(payoutDate.getFullYear(), payoutDate.getMonth() + 1, 0);
 return payoutMonthStart <= toDate && payoutMonthEnd >= fromDate;
 }

 default:
 return true;
 }
 });

 const timeFilteredPayoutsWithoutForMonth = filterByTimeRange(payoutsWithoutForMonth, 'date');
 const timeFilteredPayoutsData = [...timeFilteredPayoutsWithForMonth, ...timeFilteredPayoutsWithoutForMonth];
 console.log('💰 After time filtering - timeFilteredPayoutsData:', timeFilteredPayoutsData.length, 'payouts');
 console.log('💰 Time filter:', timeFilter);
 console.log('💰 Current date for reference:', new Date().toISOString());

 // Filter data by selected store (after time filtering)
 const filteredSalesData = useMemo(() => {
 logger.debugSales('=== SALES DATA FILTERING ===');
 logger.debugSales('Total sales records (time-filtered):', timeFilteredSalesData.length);
 logger.debugSales('effectiveStoreId:', effectiveStoreId);
 console.log('User role:', context.user?.role);
 console.log('All sales storeIds:', timeFilteredSalesData.map(s => s.storeId));
 console.log('User storeId:', context.user?.storeId);
 
 // Debug: Show all sales with their dates and storeIds
 const dec28Sales = timeFilteredSalesData.filter(sale => {
 const saleDate = new Date(sale.date);
 return saleDate.getDate() === 28 && saleDate.getMonth() === 11; // December is month 11
 });
 console.log('December 28th sales found:', dec28Sales.length);
 dec28Sales.forEach(sale => {
 console.log(` - Date: ${sale.date}, StoreId: ${sale.storeId}, Revenue: ${(sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0)}`);
 });
 
 if (!effectiveStoreId) {
 console.log('No store filter - returning all', timeFilteredSalesData.length, 'sales');
 return timeFilteredSalesData;
 }
 
 // IMPORTANT: Only include sales with exact storeId match
 // Do NOT include legacy data without storeId when viewing a specific store
 const filtered = timeFilteredSalesData.filter(sale => 
 sale.storeId === effectiveStoreId
 );
 console.log('After store filtering (exact match only):', filtered.length, 'sales');
 console.log('Filtered sales details:', filtered.map(s => ({ date: s.date, storeId: s.storeId, total: (s.offlineSales || 0) + (s.onlineSales || 0) })));
 
 // Show what got filtered out
 const filteredOut = timeFilteredSalesData.filter(sale => 
 sale.storeId !== effectiveStoreId
 );
 console.log('Filtered out (all non-matching storeIds):', filteredOut.length, 'sales');
 if (filteredOut.length > 0) {
 console.log('Sample filtered out sales storeIds:', filteredOut.slice(0, 5).map(s => s.storeId));
 }
 
 console.log('🔍 === END DEBUG ===');
 return filtered;
 }, [timeFilteredSalesData, effectiveStoreId]);

 const filteredInventoryData = useMemo(() => {
 console.log('🔍 === INVENTORY DATA FILTERING DEBUG ===');
 console.log('Total inventory records (time-filtered):', timeFilteredInventoryData.length);
 console.log('effectiveStoreId:', effectiveStoreId);
 
 // Debug: Show all inventory with their dates and storeIds
 const dec28Inventory = timeFilteredInventoryData.filter(item => {
 const itemDate = new Date(item.date);
 return itemDate.getDate() === 28 && itemDate.getMonth() === 11; // December is month 11
 });
 console.log('December 28th inventory found:', dec28Inventory.length);
 dec28Inventory.forEach(item => {
 console.log(` - Date: ${item.date}, StoreId: ${item.storeId}, Cost: ${item.totalCost || 0}`);
 });
 
 if (!effectiveStoreId) {
 console.log('No store filter - returning all', timeFilteredInventoryData.length, 'inventory items');
 return timeFilteredInventoryData;
 }

 // Store's own entries, plus its linked production house's (storeId is never set on
 // those - see effectiveProductionHouseIdForCosts above) - otherwise this store's real
 // production spend is invisible here even though "All Stores" picks it up via the
 // no-filter branch above, making the two views silently inconsistent.
 const filtered = timeFilteredInventoryData.filter(item =>
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && (item as any).entityType === 'production_house' && (item as any).productionHouseId === effectiveProductionHouseIdForCosts)
 );
 console.log('After store filtering (store + linked production house):', filtered.length, 'inventory items');
 console.log('🔍 === END INVENTORY DEBUG ===');
 
 return filtered;
 }, [timeFilteredInventoryData, effectiveStoreId, effectiveProductionHouseIdForCosts]);

 const filteredOverheadData = useMemo(() => {
 console.log('🔍 === OVERHEAD DATA FILTERING DEBUG ===');
 console.log('Total overhead records (time-filtered):', timeFilteredOverheadData.length);
 console.log('effectiveStoreId:', effectiveStoreId);
 
 // Debug: Show all overhead with their dates and storeIds
 const dec28Overhead = timeFilteredOverheadData.filter(item => {
 const itemDate = new Date(item.date);
 return itemDate.getDate() === 28 && itemDate.getMonth() === 11; // December is month 11
 });
 console.log('December 28th overhead found:', dec28Overhead.length);
 dec28Overhead.forEach(item => {
 console.log(` - Date: ${item.date}, StoreId: ${item.storeId}, Amount: ${item.amount || 0}`);
 });
 
 if (!effectiveStoreId) {
 console.log('No store filter - returning all', timeFilteredOverheadData.length, 'overhead items');
 return timeFilteredOverheadData;
 }

 // Store's own entries, plus its linked production house's - see filteredInventoryData
 // above for why (same storeId-is-never-set-on-production-entries issue).
 const filtered = timeFilteredOverheadData.filter(item =>
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && (item as any).entityType === 'production_house' && (item as any).productionHouseId === effectiveProductionHouseIdForCosts)
 );
 console.log('After store filtering (store + linked production house):', filtered.length, 'overhead items');
 console.log('Filtered overhead storeIds:', filtered.map(o => ({ date: o.date, storeId: o.storeId, amount: o.amount })));
 console.log('🔍 === END OVERHEAD DEBUG ===');

 return filtered;
 }, [timeFilteredOverheadData, effectiveStoreId, effectiveProductionHouseIdForCosts]);

 const filteredFixedCostsData = useMemo(() => {
 if (!effectiveStoreId) return timeFilteredFixedCostsData;
 // Store's own entries, plus its linked production house's - see filteredInventoryData above.
 return timeFilteredFixedCostsData.filter(item =>
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && (item as any).entityType === 'production_house' && (item as any).productionHouseId === effectiveProductionHouseIdForCosts)
 );
 }, [timeFilteredFixedCostsData, effectiveStoreId, effectiveProductionHouseIdForCosts]);

 // Equipment purchases and yearly subscriptions from all three expense lists, scoped like the
 // filtered data above but NOT time-filtered - a scooter bought in October still counts a
 // little in every month of its life (see utils/spreadCosts.ts).
 const spreadSourceRecords = useMemo(() => {
 const inScope = (item: any) => !effectiveStoreId ||
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseIdForCosts);
 const pick = (items: any[], amountOf: (x: any) => number) => (items || [])
 .filter((x: any) => x?.date && isSpreadCategory(x.category || '') && inScope(x))
 .map((x: any) => ({ date: x.date, amount: amountOf(x), category: x.category, id: x.id, name: x.itemName || x.description || '' }));
 return [
 ...pick(inventoryData, (x) => x.totalCost || 0),
 ...pick(overheadData, (x) => x.amount || 0),
 ...pick(fixedCostsData, (x) => x.amount || 0),
 ];
 }, [inventoryData, overheadData, fixedCostsData, effectiveStoreId, effectiveProductionHouseIdForCosts]);

 const filteredEmployeesData = useMemo(() => {
 if (!effectiveStoreId) return employeesData;
 // See entityAccess.ts's employeeBelongsToStore - without its production-house case, a
 // production incharge/ops employee's own `storeId` field (which actually holds their
 // production house's id, not a real store id) meant every one of this store's own
 // production staff silently vanished from a specific store's view - and with them,
 // filteredPayoutsData below (matched by employeeId against this list), understating
 // that store's real salary cost relative to "All Stores", which applies no filter at
 // all and so never drops them.
 return employeesData.filter(emp => employeeBelongsToStore(emp, effectiveStoreId, context.stores || []));
 }, [employeesData, effectiveStoreId, context.stores]);

 const filteredPayoutsData = useMemo(() => {
 // Start with time-filtered payouts
 let filtered = timeFilteredPayoutsData;
 
 // Then filter by store if selected
 // Use filteredEmployeesData to ensure employees with null storeIds are included
 if (effectiveStoreId) {
 const storeEmployeeIds = filteredEmployeesData.map(emp => emp.id);
 filtered = filtered.filter(payout => storeEmployeeIds.includes(payout.employeeId));
 }
 
 return filtered;
 }, [timeFilteredPayoutsData, filteredEmployeesData, effectiveStoreId]);

 // Load payouts and employees data
 useEffect(() => {
 const loadData = async () => {
 try {
 console.log('💰 === LOADING PAYOUTS AND EMPLOYEES ===');
 // Archived (released) employees are fetched too and merged in below - this list is
 // only ever used to look up who a payout belongs to (their type and store), and an
 // employee archived after being paid still has real salary expense in the months they
 // worked. Active-only silently dropped it: September showed Rs.45,000 instead of
 // Rs.52,000 because Akash Dey (archived 3 Oct) had his Rs.7,000 payout skipped as
 // "employee not found".
 const [payouts, activeEmployees, archivedEmployees] = await Promise.all([
 api.getPayouts(),
 api.getEmployees(),
 api.getArchivedEmployees().catch(() => [])
 ]);
 const employees = [...(activeEmployees || []), ...(archivedEmployees || [])];
 console.log('💰 Raw payouts from API:', payouts);
 console.log('💰 Number of payouts:', payouts?.length || 0);
 console.log('💰 Payout dates:', payouts?.map(p => ({ id: p.id, date: p.date, amount: p.amount })));
 console.log('👥 Number of employees:', employees?.length || 0);
 setPayoutsData(payouts || []);
 setEmployeesData(employees || []);
 console.log('💰 === END LOADING PAYOUTS AND EMPLOYEES ===');
 } catch (error) {
 console.error('❌ Error loading payouts and employees:', error);
 setPayoutsData([]);
 setEmployeesData([]);
 }
 };
 
 loadData();
 }, []);

 // Load stores for production analytics (needed for production house filtering)
 useEffect(() => {
 const loadStores = async () => {
 // Load stores for cluster heads OR when in production analytics mode
 // Production analytics needs stores to resolve production house mappings
 console.log('🔧 Store Loading Check:', {
 isClusterHead,
 analyticsMode,
 shouldLoad: isClusterHead || analyticsMode === 'production'
 });
 
 if (!isClusterHead && analyticsMode !== 'production') return;
 
 try {
 const storesList = await api.getStores();
 setStores(storesList);
 console.log('📍 Loaded stores for analytics:', storesList.length, 'stores');
 console.log('📍 Store details:', storesList.map(s => ({
 id: s.id,
 name: s.name,
 productionHouseId: s.productionHouseId
 })));
 } catch (error) {
 console.error('❌ Error loading stores:', error);
 }
 };
 
 loadStores();
 }, [isClusterHead, analyticsMode]);

 // Helper function to get fresh access token
 const getFreshAccessToken = async (): Promise<string | null> => {
 try {
 const supabase = getSupabaseClient();
 const { data: { session } } = await supabase.auth.getSession();
 return session?.access_token || null;
 } catch (error) {
 console.error('Error getting fresh token:', error);
 return null;
 }
 };

 // Load leave data for the current week (Monday-Sunday) - was just today's leaves,
 // widened so a cluster head/manager can see the whole week's schedule at once instead
 // of having to check back in daily.
 useEffect(() => {
 const loadWeekLeaves = async () => {
 if (!context.user) return;

 try {
 setLoadingLeaves(true);

 // Get fresh access token
 const accessToken = await getFreshAccessToken();
 if (!accessToken) {
 console.error('No valid access token available');
 return;
 }

 // Monday-Sunday of the current week, in IST.
 const today = getTodayIST();
 const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
 const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
 const weekStart = addDays(today, mondayOffset);
 const weekEnd = addDays(weekStart, 6);
 const inThisWeek = (leave: api.LeaveApplication) => leave.leaveDate >= weekStart && leave.leaveDate <= weekEnd;

 if (context.user.role === 'cluster_head' || context.user.role === 'manager') {
 // Global for both roles - one company-wide leave list, not scoped by store or
 // reporting line. Used to differ by role (and by which store a cluster head/manager
 // happened to be scoped to), so two people looking at the same week could see
 // completely different results - e.g. a manager at one store seeing "everyone's
 // working" while another store's staff were genuinely on leave. Same query, same
 // data, for everyone with access to this card.
 const allLeaves = await api.getAllLeaves(accessToken);
 const weekApprovedLeaves = allLeaves.filter(
 (leave: api.LeaveApplication) => inThisWeek(leave) && leave.status === 'approved'
 );

 const employees = await api.getAllEmployees(accessToken);
 const employeeMap = new Map(employees.map(emp => [emp.employeeId, emp]));

 const enrichedLeaves = weekApprovedLeaves.map(leave => ({
 ...leave,
 employeeName: employeeMap.get(leave.employeeId)?.name || 'Unknown',
 storeId: employeeMap.get(leave.employeeId)?.storeId || 'N/A',
 storeName: stores.find(s => s.id === employeeMap.get(leave.employeeId)?.storeId)?.name || 'N/A'
 }));

 setTodayLeaveCount(enrichedLeaves.length);
 setTodayLeaveDetails(enrichedLeaves);
 } else {
 setTodayLeaveCount(0);
 setTodayLeaveDetails([]);
 }
 } catch (error) {
 console.error('Error loading this week\'s leaves:', error);
 setTodayLeaveCount(0);
 } finally {
 setLoadingLeaves(false);
 }
 };

 loadWeekLeaves();
 }, [context.user]);

 // This week's leave list grouped by day (Monday first), plus a full/half-day split for
 // the compact summary bar - the list itself is flat (one row per approved leave), so
 // this is purely a display grouping, not a second fetch. Days that have already passed
 // are dropped - only today and the remaining days of the week are worth surfacing here.
 const monthLeaveSummary = useMemo(() => {
 const today = getTodayIST();
 const [year, month] = today.split('-').map(Number);
 // Last calendar day of the current month - new Date(year, month, 0) rolls back one day
 // from the 1st of next month, which lands on the last day of this one (month here is
 // already 1-indexed from the split above, so this "next month" is correct as-is).
 const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

 const days: { date: string; label: string; isToday: boolean; leaves: any[] }[] = [];
 for (let date = today; date <= monthEnd; date = addDays(date, 1)) {
 const leaves = todayLeaveDetails.filter((l: any) => l.leaveDate === date);
 days.push({
 date,
 label: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
 isToday: date === today,
 leaves,
 });
 }

 // Bounded to today-through-month-end (previously unbounded into the indefinite future,
 // while the label/day list only ever covered the current week - this scopes the count
 // itself to match what the card actually says it's showing).
 const upcomingLeaves = todayLeaveDetails.filter((l: any) => l.leaveDate >= today && l.leaveDate <= monthEnd);
 const fullDayCount = upcomingLeaves.filter((l: any) => l.leaveType !== 'half').length;
 const halfDayCount = upcomingLeaves.filter((l: any) => l.leaveType === 'half').length;
 const rangeLabel = `${new Date(`${today}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(`${monthEnd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

 return { days, fullDayCount, halfDayCount, rangeLabel, upcomingCount: upcomingLeaves.length };
 }, [todayLeaveDetails]);

 // Auto-switch to production-requests tab when notification is clicked - this tab only
 // exists under Store Analytics, so force that mode even for a production incharge whose
 // default view is Production Analytics.
 useEffect(() => {
 console.log('📊 Analytics - highlightRequestId changed:', highlightRequestId);
 if (highlightRequestId) {
 console.log('📊 Analytics - Switching to production-requests tab');
 setAnalyticsMode('store');
 setActiveView('production-requests');
 }
 }, [highlightRequestId]);

 // Get period label for summary cards
 const getPeriodLabel = () => {
 if (timeFilterChoice === 'last6Months') return 'Last 6 months';
 if (timeFilterChoice === 'thisYear') return 'This year';
 switch (timeFilter) {
 case 'today': return 'Today';
 case 'yesterday': return 'Yesterday';
 case 'thisWeek': return 'This week';
 case 'thisMonth': return 'This month';
 case 'lastWeek': return 'Last week';
 case 'lastMonth': return 'Last month';
 case 'custom': return `${dateRange.from} to ${dateRange.to}`;
 default: return 'Current period';
 }
 };
 
 // Calculate accrued interest expense for a given time period
 const calculateAccruedInterest = (startDate: string, endDate: string, storeId?: string) => {
 // Filter loans by store if needed
 const relevantLoans = storeId 
 ? onlineLoans.filter(loan => loan.storeId === storeId)
 : onlineLoans;
 
 let totalInterest = 0;
 
 relevantLoans.forEach(loan => {
 // Skip loans with no interest rate
 if (!loan.interestRate || loan.interestRate === 0) return;
 
 const loanDate = new Date(loan.loanDate);
 const periodStart = new Date(startDate);
 const periodEnd = new Date(endDate);
 
 // Determine the overlap period between loan duration and the analytics period
 // Loan accrual starts from loanDate
 // If loan is repaid, accrual stops at repaymentDate; otherwise continues
 const loanEndDate = loan.status === 'repaid' && loan.repaymentDate 
 ? new Date(loan.repaymentDate) 
 : periodEnd; // If active, calculate till end of period
 
 // Calculate overlap: max(loanDate, periodStart) to min(loanEndDate, periodEnd)
 const overlapStart = loanDate > periodStart ? loanDate : periodStart;
 const overlapEnd = loanEndDate < periodEnd ? loanEndDate : periodEnd;
 
 // Only calculate if there's actual overlap
 if (overlapStart < overlapEnd) {
 const daysDiff = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
 
 // Monthly interest: (Principal × Rate × Days) / (100 × 30)
 const interest = (loan.loanAmount * loan.interestRate * daysDiff) / (100 * 30);
 totalInterest += Math.max(0, interest);
 
 console.log(`📊 Interest for loan ${loan.id}:`, {
 storeName: loan.storeName,
 principal: loan.loanAmount,
 rate: loan.interestRate,
 loanDate: loan.loanDate,
 repaymentDate: loan.repaymentDate,
 status: loan.status,
 overlapStart: overlapStart.toISOString().split('T')[0],
 overlapEnd: overlapEnd.toISOString().split('T')[0],
 days: daysDiff,
 interest: interest.toFixed(2)
 });
 }
 });
 
 console.log(`💰 Total accrued interest for period ${startDate} to ${endDate}:`, totalInterest.toFixed(2));
 return totalInterest;
 };

 // Settlement uploads have two date concepts: settlementDate is when the aggregator paid
 // the bank/Paytm balance, while periodStart/periodEnd is when the customer orders happened.
 // Analytics filters use the sales period so a Jul 29-31 report paid on Aug 3 belongs to
 // Last Month; cash/bank history can still display the Aug 3 settlement date.
 const analyticsLocalDateStr = (d: Date) => {
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, '0');
 const day = String(d.getDate()).padStart(2, '0');
 return `${y}-${m}-${day}`;
 };
 const analyticsLocalYearMonth = (d: Date) => analyticsLocalDateStr(d).slice(0, 7);
 const getActiveSettlementDateRange = (): { start: string; end: string } | null => {
 const now = new Date();
 switch (timeFilter) {
 case 'today':
 return { start: getTodayIST(), end: getTodayIST() };
 case 'yesterday': {
 const yesterday = new Date();
 yesterday.setDate(yesterday.getDate() - 1);
 const date = analyticsLocalDateStr(yesterday);
 return { start: date, end: date };
 }
 case 'thisWeek': {
 const today = new Date();
 const startOfWeek = new Date(today);
 startOfWeek.setDate(today.getDate() - today.getDay());
 return { start: analyticsLocalDateStr(startOfWeek), end: analyticsLocalDateStr(today) };
 }
 case 'lastWeek': {
 const lastWeekEnd = new Date();
 lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
 const lastWeekStart = new Date(lastWeekEnd);
 lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
 return { start: analyticsLocalDateStr(lastWeekStart), end: analyticsLocalDateStr(lastWeekEnd) };
 }
 case 'thisMonth':
 return { start: `${analyticsLocalYearMonth(now)}-01`, end: analyticsLocalDateStr(now) };
 case 'lastMonth': {
 const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const lastMonth = analyticsLocalYearMonth(lastMonthDate);
 const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
 return { start: `${lastMonth}-01`, end: analyticsLocalDateStr(lastDay) };
 }
 case 'custom':
 return dateRange.from && dateRange.to ? { start: dateRange.from, end: dateRange.to } : null;
 default:
 return null;
 }
 };
 const activeSettlementDateRange = getActiveSettlementDateRange();

 // Zomato/Swiggy commission and ads for any window come from here (utils/onlineCosts.ts),
 // so the cards, the daily chart, the carry-forward and Unit Economics all agree.
 const onlineCostIndex = useMemo(
 () => buildOnlineCostIndex(aggregatorSettlements || [], effectiveStoreId),
 [aggregatorSettlements, effectiveStoreId]
 );
 const storeOnlineSales = useMemo(
 () => (onlineSalesData || []).filter((s: any) => !effectiveStoreId || s.storeId === effectiveStoreId),
 [onlineSalesData, effectiveStoreId]
 );
 const storeOnlinePayouts = useMemo(
 () => (onlinePayoutData || []).filter((p: any) => !effectiveStoreId || p.storeId === effectiveStoreId),
 [onlinePayoutData, effectiveStoreId]
 );

 // Calculate analytics metrics
 const calculateMetrics = () => {
 console.log('💰 === METRICS CALCULATION DEBUG ===');
 console.log('Time filter:', timeFilter);
 console.log('Filtered sales data count:', filteredSalesData.length);
 console.log('Filtered inventory data count:', filteredInventoryData.length);
 console.log('Filtered overhead data count:', filteredOverheadData.length);
 console.log('Filtered fixed costs data count:', filteredFixedCostsData.length);
 
 // Calculate revenue from main sales table (Swiggy/Zomato added below after filtering)
 const mainSalesRevenue = filteredSalesData.reduce((sum, sale) => {
 return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
 }, 0);
 
 console.log('Main sales revenue calculated:', mainSalesRevenue);

 // Online revenue from main sales table only (Swiggy/Zomato added below after filtering)
 const onlineRevenueFromMainSales = filteredSalesData.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
 const offlineRevenue = filteredSalesData.reduce((sum, sale) => {
 return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0);
 }, 0);

 // Food cost = food & packaging inventory only. Supplies/tools logged as inventory count as
 // running costs, a WiFi recharge as a fixed cost, and equipment is spread over its life
 // (spreadExpenses below) - see costBucketFor in utils/inventoryData.ts.
 const inventoryIn = (bucket: string) => filteredInventoryData
 .filter(item => costBucketFor(item.category || '', 'inventory') === bucket)
 .reduce((sum, item) => sum + (item.totalCost || 0), 0);
 const inventoryPurchases = inventoryIn('food'); // + this window's share of bulk packaging stock, below
 const inventorySupplyExpenses = inventoryIn('operating');
 const inventoryFixedExpenses = inventoryIn('fixed');
 const packagingPurchases = filteredInventoryData
 .filter(item => canonicalCategory(item.category || '') === 'packaging')
 .reduce((sum, item) => sum + (item.totalCost || 0), 0);
 console.log('Inventory expenses:', inventoryPurchases);

 // Calculate overhead expenses (EXCLUDING legacy commission entries)
 // Separate personal_expense items (employee salary-related) from other overhead
 const personalExpenseItems = filteredOverheadData.filter(item => item.category === 'personal_expense');
 const personalExpenseTotal = personalExpenseItems.reduce((sum, item) => sum + (item.amount || 0), 0);
 console.log('💼 Personal expense overhead items:', personalExpenseItems.length, 'Total:', personalExpenseTotal);

 const overheadExpenses = filteredOverheadData
 .filter(item => !isCommissionEntry(item)) // Exclude legacy commission entries
 .filter(item => costBucketFor(item.category || '', 'overhead') === 'operating') // not salary-linked, equipment or fixed
 .reduce((sum, item) => sum + (item.amount || 0), 0) + inventorySupplyExpenses;
 const overheadFixedExpenses = filteredOverheadData
 .filter(item => !isCommissionEntry(item) && costBucketFor(item.category || '', 'overhead') === 'fixed')
 .reduce((sum, item) => sum + (item.amount || 0), 0);
 // Part of overheadExpenses - Unit Economics shows it with the platform ads.
 const marketingExpenses = filteredOverheadData
 .filter(item => !isCommissionEntry(item) && canonicalCategory(item.category || '') === 'marketing')
 .reduce((sum, item) => sum + (item.amount || 0), 0);

 // Calculate commission expenses from online sales and payout data
 // Commission = Total Sales - Total Payouts for the filtered time period
 console.log('🔍 DEBUG COMMISSION - Calculating from online sales/payout data');
 
 // Local (not UTC) YYYY-MM-DD / YYYY-MM - .toISOString() converts to UTC first, which
 // rolled "this month"/"yesterday" back to the wrong calendar boundary for the ~5.5 hours
 // after midnight IST (positive UTC offset), silently pulling the previous month's data
 // into "This Month" comparisons below.
 const localDateStr = (d: Date) => {
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, '0');
 const day = String(d.getDate()).padStart(2, '0');
 return `${y}-${m}-${day}`;
 };
 const localYearMonth = (d: Date) => localDateStr(d).slice(0, 7);

 // Filter online sales and payouts by time and store
 const filteredOnlineSales = onlineSalesData.filter(sale => {
 const dateMatch = (() => {
 switch (timeFilter) {
 case 'today':
 return sale.date === getTodayIST();
 case 'yesterday':
 const yesterday = new Date();
 yesterday.setDate(yesterday.getDate() - 1);
 return sale.date === localDateStr(yesterday);
 case 'thisWeek':
 const today = new Date();
 const startOfWeek = new Date(today);
 startOfWeek.setDate(today.getDate() - today.getDay());
 return new Date(sale.date) >= startOfWeek && new Date(sale.date) <= today;
 case 'lastWeek':
 const lastWeekEnd = new Date();
 lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
 const lastWeekStart = new Date(lastWeekEnd);
 lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
 return new Date(sale.date) >= lastWeekStart && new Date(sale.date) <= lastWeekEnd;
 case 'thisMonth':
 const currentMonth = localYearMonth(new Date());
 return sale.date.startsWith(currentMonth);
 case 'lastMonth':
 const lastMonthDate = new Date();
 lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
 const lastMonth = localYearMonth(lastMonthDate);
 return sale.date.startsWith(lastMonth);
 case 'custom':
 return sale.date >= dateRange.from && sale.date <= dateRange.to;
 default:
 return true;
 }
 })();

 const storeMatch = effectiveStoreId ? sale.storeId === effectiveStoreId : true;
 return dateMatch && storeMatch;
 });

 const filteredOnlinePayouts = onlinePayoutData.filter(payout => {
 const dateMatch = (() => {
 switch (timeFilter) {
 case 'today':
 return payout.date === getTodayIST();
 case 'yesterday':
 const yesterday = new Date();
 yesterday.setDate(yesterday.getDate() - 1);
 return payout.date === localDateStr(yesterday);
 case 'thisWeek':
 const today = new Date();
 const startOfWeek = new Date(today);
 startOfWeek.setDate(today.getDate() - today.getDay());
 return new Date(payout.date) >= startOfWeek && new Date(payout.date) <= today;
 case 'lastWeek':
 const lastWeekEnd = new Date();
 lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
 const lastWeekStart = new Date(lastWeekEnd);
 lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
 return new Date(payout.date) >= lastWeekStart && new Date(payout.date) <= lastWeekEnd;
 case 'thisMonth':
 const currentMonth = localYearMonth(new Date());
 return payout.date.startsWith(currentMonth);
 case 'lastMonth':
 const lastMonthDate = new Date();
 lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
 const lastMonth = localYearMonth(lastMonthDate);
 return payout.date.startsWith(lastMonth);
 case 'custom':
 return payout.date >= dateRange.from && payout.date <= dateRange.to;
 default:
 return true;
 }
 })();

 const storeMatch = effectiveStoreId ? payout.storeId === effectiveStoreId : true;
 return dateMatch && storeMatch;
 });
 
 const totalOnlineSales = filteredOnlineSales.reduce((sum, sale) =>
 sum + (sale.swiggySales || 0) + (sale.zomatoSales || 0), 0);
 const totalOnlinePayouts = filteredOnlinePayouts.reduce((sum, payout) =>
 sum + (payout.swiggyPayout || 0) + (payout.zomatoPayout || 0), 0);

 // Combine online revenue from both sources:
 // 1. Main sales table's onlineSales field (manual entry)
 // 2. Separate online sales table (Swiggy + Zomato from Online Sales Management)
 const onlineRevenue = onlineRevenueFromMainSales + totalOnlineSales;
 
 // Total revenue = main sales + Swiggy/Zomato platform sales
 const totalRevenue = mainSalesRevenue + totalOnlineSales;
 console.log('🔍 Online Revenue: mainSales=', onlineRevenueFromMainSales, 'swiggy+zomato=', totalOnlineSales, 'TOTAL=', onlineRevenue);
 console.log('🔍 Total Revenue: mainSales=', mainSalesRevenue, '+ platforms=', totalOnlineSales, '= TOTAL=', totalRevenue);
 
 console.log('🔍 DEBUG COMMISSION - Filtered online sales:', filteredOnlineSales.length);
 console.log('🔍 DEBUG COMMISSION - Filtered online payouts:', filteredOnlinePayouts.length);
 console.log('🔍 DEBUG COMMISSION - Total online sales:', totalOnlineSales);
 console.log('🔍 DEBUG COMMISSION - Total online payouts:', totalOnlinePayouts);

 // Calculate fixed costs
 const electricityExpenses = filteredFixedCostsData
 .filter(fc => fc.category === 'electricity')
 .reduce((sum, fc) => sum + (fc.amount || 0), 0);
 
 const rentExpenses = filteredFixedCostsData
 .filter(fc => fc.category === 'rent')
 .reduce((sum, fc) => sum + (fc.amount || 0), 0);

 // Employee payout expenses (from payoutsData), split into Contract Workers vs
 // Permanent Employees by the employee's own employmentType. Contract worker wages
 // used to be read from a legacy sale.employeeSalary field that nothing populates
 // anymore (real contract payouts are logged via the Payroll page's "Add Payout" flow,
 // exactly like permanent employees) - that always showed ₹0 here regardless of real
 // payouts, while the real contract payouts were silently getting lumped into the
 // "Permanent Employees" total below. Both buckets now come from the same source.
 let contractWorkerExpenses = 0;
 let permanentEmployeeExpenses = 0;

 console.log('💵 === EMPLOYEE PAYOUT SALARY DEBUG ===');
 console.log('Time filter:', timeFilter);
 console.log('Total filteredPayoutsData:', filteredPayoutsData.length);
 console.log('Raw employeesData count:', employeesData.length);
 console.log('All employee types:', employeesData.map((e: any) => ({ id: e.id, employeeId: e.employeeId, name: e.name, type: e.type, employmentType: e.employmentType })));
 console.log('All payout data:', filteredPayoutsData.map((p: any) => ({ id: p.id, employeeId: p.employeeId, amount: p.amount, date: p.date })));

 if (timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom') {
 // For month/custom view: Use DATE-FILTERED payouts to respect the selected time range
 let relevantPayouts = filteredPayoutsData;

 if (effectiveStoreId) {
 // When store is selected, filter payouts to employees of that store
 const storeEmployeeIds = filteredEmployeesData.map(emp => emp.id);
 relevantPayouts = relevantPayouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
 console.log('Store filtered payouts:', relevantPayouts.length);
 }

 console.log('Relevant payouts for calculation:', relevantPayouts.length);

 for (const payout of relevantPayouts) {
 // IMPORTANT: Use raw employeesData (not store-filtered) for type lookup
 // This ensures we can identify employee type even if store filtering is active
 const employee = employeesData.find((emp: any) => emp.id === payout.employeeId);
 if (!employee) {
 console.log(' ✗ Skipping payout - employee not found:', payout.id);
 continue;
 }
 const empType = employee?.type || employee?.employmentType;
 console.log('Processing payout:', payout.id, 'employeeId:', payout.employeeId, 'amount:', payout.amount, `${employee.name} (resolved type=${empType})`);
 if (empType === 'contract') {
 contractWorkerExpenses += payout.amount || 0;
 } else {
 permanentEmployeeExpenses += payout.amount || 0;
 }
 }

 console.log('Total contract worker expenses calculated:', contractWorkerExpenses);
 console.log('Total permanent employee expenses calculated:', permanentEmployeeExpenses);
 } else {
 console.log('Skipping payout calculation - time filter is:', timeFilter);
 }
 console.log('💵 === END EMPLOYEE PAYOUT SALARY DEBUG ===');
 // For daily/weekly view, both buckets stay 0 - payouts are monthly, not daily events

 // Total salary expenses = contract workers + permanent employee payouts + personal expenses (employee-mapped overhead)
 const salaryExpenses = contractWorkerExpenses + permanentEmployeeExpenses + personalExpenseTotal;
 console.log('💰 Salary breakdown: contract=', contractWorkerExpenses, 'permanent payouts=', permanentEmployeeExpenses, 'personal expenses=', personalExpenseTotal, 'TOTAL=', salaryExpenses);

 // Total fixed costs = rent, electricity, internet/phone (and old LPG entries) - salary is
 // tracked separately; the yearly software subscription is spread like equipment.
 const fixedCostsTotal = filteredFixedCostsData
 .filter(fc => costBucketFor(fc.category || '', 'fixedcost') === 'fixed')
 .reduce((sum, fc) => sum + (fc.amount || 0), 0) + inventoryFixedExpenses + overheadFixedExpenses;
 
 // Calculate interest expense (accrual basis)
 // Get the date range for the current filter
 const getDateRangeForFilter = (): { startDate: string; endDate: string } => {
 // IST calendar-date string arithmetic throughout (getTodayIST/addDays) - a raw
 // `new Date()` + toISOString() rolls the date back a day for anyone in IST between
 // midnight and 5:30am, since UTC is still "yesterday" at that point.
 const today = getTodayIST();
 const dayOfWeek = (dateStr: string) => {
 const [y, m, d] = dateStr.split('-').map(Number);
 return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
 };

 switch (timeFilter) {
 case 'today':
 return { startDate: today, endDate: today };

 case 'yesterday': {
 const yesterdayStr = addDays(today, -1);
 return { startDate: yesterdayStr, endDate: yesterdayStr };
 }

 case 'thisWeek': {
 const startOfWeek = addDays(today, -dayOfWeek(today));
 return { startDate: startOfWeek, endDate: today };
 }

 case 'lastWeek': {
 const thisWeekStart = addDays(today, -dayOfWeek(today));
 const lastWeekEnd = addDays(thisWeekStart, -1);
 const lastWeekStart = addDays(lastWeekEnd, -6);
 return { startDate: lastWeekStart, endDate: lastWeekEnd };
 }

 case 'thisMonth':
 return { startDate: `${today.slice(0, 7)}-01`, endDate: today };

 case 'lastMonth': {
 const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
 const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
 return { startDate: lastMonthStart, endDate: lastMonthEnd };
 }

 case 'custom':
 return { startDate: dateRange.from, endDate: dateRange.to };

 default:
 return { startDate: getTodayIST(), endDate: getTodayIST() };
 }
 };
 
 const { startDate, endDate } = getDateRangeForFilter();
 const interestExpenses = calculateAccruedInterest(startDate, endDate, effectiveStoreId || undefined);

 console.log('💸 Interest expense for period:', interestExpenses.toFixed(2));

 // This window's share of equipment purchases and yearly subscriptions (up to today). Bulk
 // packaging stock is spread too, but it's food & packaging cost, not equipment.
 const spreadEnd = endDate > getTodayIST() ? getTodayIST() : endDate;
 const spread = buildSpreadCosts(spreadSourceRecords, startDate, spreadEnd);
 const packagingStockShare = spread.byCategory.packaging_bulk || 0;
 const spreadExpenses = spread.total - packagingStockShare;
 const inventoryExpenses = inventoryPurchases + packagingStockShare;
 const packagingExpenses = packagingPurchases + packagingStockShare;

 // Zomato/Swiggy commission (without the GST they pay on our behalf) and ads - settled,
 // from old payout entries, or estimated for days not settled yet. See utils/onlineCosts.ts.
 const online = onlineCostsForRange(onlineCostIndex, storeOnlineSales, storeOnlinePayouts, startDate, endDate, getTodayIST());
 const commissionExpenses = online.commission;
 const adSpend = online.ads;
 const matchedOnlineRevenueForCommission = online.commissionBase;

 // Total costs now includes commission, ads, interest, and salary as separate categories
 const totalCosts = inventoryExpenses + overheadExpenses + fixedCostsTotal + commissionExpenses + adSpend + interestExpenses + salaryExpenses + spreadExpenses;
 
 // Net profit calculation (commission is now separate)
 const netProfit = totalRevenue - totalCosts;
 const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

 console.log('🔴🔴🔴 TOTAL EXPENSE BREAKDOWN 🔴🔴🔴');
 console.log('inventoryExpenses:', inventoryExpenses);
 console.log('overheadExpenses:', overheadExpenses);
 console.log('fixedCostsTotal:', fixedCostsTotal, 'elec:', electricityExpenses, 'rent:', rentExpenses);
 console.log('commissionExpenses:', commissionExpenses);
 console.log('interestExpenses:', interestExpenses);
 console.log('salaryExpenses:', salaryExpenses, 'contract:', contractWorkerExpenses, 'permanent:', permanentEmployeeExpenses, 'personal:', personalExpenseTotal);
 console.log('TOTAL:', totalCosts);
 console.log('Gap from 198K:', 198000 - totalCosts);
 console.log('Overhead items count:', filteredOverheadData.length);
 console.log('Commission entries excluded:', filteredOverheadData.filter(item => isCommissionEntry(item)).length, 'total:', filteredOverheadData.filter(item => isCommissionEntry(item)).reduce((s, i) => s + (i.amount || 0), 0));
 console.log('Personal expense excluded:', personalExpenseItems.length, 'total:', personalExpenseTotal);
 console.log('Raw overhead (no filter):', filteredOverheadData.reduce((s, i) => s + (i.amount || 0), 0));
 console.log('Net profit:', netProfit);
 console.log('💰 === END METRICS DEBUG ===');

 return {
 totalRevenue,
 onlineRevenue,
 matchedOnlineRevenueForCommission,
 offlineRevenue,
 commissionExpenses,
 adSpend,
 online,
 interestExpenses,
 totalExpenses: totalCosts,
 inventoryExpenses,
 packagingExpenses,
 marketingExpenses,
 overheadExpenses,
 fixedCostsTotal,
 electricityExpenses,
 rentExpenses,
 salaryExpenses,
 contractWorkerExpenses,
 permanentEmployeeExpenses,
 personalExpenseTotal,
 spreadExpenses,
 spreadByCategory: spread.byCategory,
 netProfit,
 profitMargin
 };
 };

 const metrics = useMemo(() => calculateMetrics(), [
 filteredSalesData, 
 filteredInventoryData, 
 filteredOverheadData, 
 filteredFixedCostsData, 
 filteredPayoutsData,
 filteredEmployeesData,
 employeesData,
 onlineLoans,
 onlineSalesData,
 onlinePayoutData,
 onlineCostIndex,
 storeOnlineSales,
 storeOnlinePayouts,
 spreadSourceRecords,
 timeFilter,
 dateRange,
 effectiveStoreId
 ]);

 // ---- One calendar month's profit and loss, line by line (up to today for the current
 // month). Built with the same buckets and sources calculateMetrics uses - scoped to the
 // same store and its linked production house - so a month's Net Profit here matches the
 // card when that month is selected. Used by the loss carry-forward below and the Unit
 // Economics trend. ----
 // Rent, electricity and permanent salaries for any window, counted day by day (estimated from
 // last month until the real figure is recorded) - see utils/dailyCostSmoothing.ts. Used by the
 // Net Normalized Profit card and by Unit Economics' normalized view.
 const accrualFor = useCallback((start: string, end: string) => {
 const today = getTodayIST();
 const last = end > today ? today : end;
 if (!start || !last || start > last) return null;
 const inScopeFixed = (item: any) => !effectiveStoreId ||
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseIdForCosts);
 const scopedEmployeeIds = new Set(filteredEmployeesData.map((e: any) => e.id));
 return buildSmoothedCosts({
 fixedCosts: fixedCostsData.filter(inScopeFixed),
 payouts: payoutsData.filter((p: any) => !effectiveStoreId || scopedEmployeeIds.has(p.employeeId)),
 employees: employeesData,
 windowStart: start,
 windowEnd: last,
 todayIST: today
 });
 }, [fixedCostsData, payoutsData, employeesData, filteredEmployeesData, effectiveStoreId, effectiveProductionHouseIdForCosts]);

 const pnlForMonth = useCallback((ym: string): PnlBreakdown => {
 const today = getTodayIST();
 const start = `${ym}-01`;
 const end = addDays(`${monthAdd(ym, 1)}-01`, -1);
 const inMonth = (d?: string) => !!d && d >= start && d <= end;
 const sum = (items: any[], pick: (x: any) => number) => items.reduce((t, x) => t + pick(x), 0);
 const inStoreOrHouse = (item: any) => !effectiveStoreId ||
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseIdForCosts);
 const storeOnly = (item: any) => !effectiveStoreId || item.storeId === effectiveStoreId;
 const storeEmployeeIds = new Set(filteredEmployeesData.map((e: any) => e.id));
 const employeeIds = new Set(employeesData.map((e: any) => e.id));

 const monthSales = salesData.filter((x: any) => inMonth(x.date) && storeOnly(x));
 const monthOnline = storeOnlineSales.filter((x: any) => inMonth(x.date));
 const counterRevenue = sum(monthSales, (x) => (x.paytmAmount || 0) + (x.cashAmount || 0));
 const zomatoRevenue = sum(monthOnline, (x) => x.zomatoSales || 0);
 const swiggyRevenue = sum(monthOnline, (x) => x.swiggySales || 0);
 const onlineRevenue = sum(monthSales, (x) => x.onlineSales || 0) + zomatoRevenue + swiggyRevenue;
 const online = onlineCostsForRange(onlineCostIndex, storeOnlineSales, storeOnlinePayouts, start, end, today);

 const line = {
 food: 0, packaging: 0, marketing: 0, staff: 0, occupancy: 0, otherOpex: 0,
 };
 const addCost = (category: string, source: 'inventory' | 'overhead' | 'fixedcost', amount: number) => {
 const bucket = costBucketFor(category, source);
 const canonical = canonicalCategory(category);
 if (bucket === 'food' && source === 'inventory') line[canonical === 'packaging' ? 'packaging' : 'food'] += amount;
 else if (bucket === 'operating' && source !== 'fixedcost') line[canonical === 'marketing' ? 'marketing' : 'otherOpex'] += amount;
 else if (bucket === 'fixed') line.occupancy += amount;
 };
 inventoryData.filter((x: any) => inMonth(x.date) && inStoreOrHouse(x))
 .forEach((x: any) => addCost(x.category || '', 'inventory', x.totalCost || 0));
 const monthOverheads = overheadData.filter((x: any) =>
 (x.category === 'personal_expense' && x.expenseMonth ? x.expenseMonth === ym : inMonth(x.date)) && inStoreOrHouse(x)
 );
 monthOverheads.filter((x: any) => !isCommissionEntry(x)).forEach((x: any) => addCost(x.category || '', 'overhead', x.amount || 0));
 fixedCostsData.filter((x: any) => inMonth(x.date) && inStoreOrHouse(x))
 .forEach((x: any) => addCost(x.category || '', 'fixedcost', x.amount || 0));

 // Equipment, the scooter and yearly subscriptions are spread over their life; bulk packaging
 // stock over the days it's used.
 const spread = buildSpreadCosts(spreadSourceRecords, start, end > today ? today : end);
 const packagingStock = spread.byCategory.packaging_bulk || 0;
 const software = spread.byCategory.software_subscription || 0;
 line.packaging += packagingStock;
 line.otherOpex += software;
 const depreciation = spread.total - packagingStock - software;

 const monthPayouts = payoutsData.filter((x: any) =>
 (x.forMonth ? x.forMonth === ym : inMonth(x.date)) &&
 employeeIds.has(x.employeeId) &&
 (!effectiveStoreId || storeEmployeeIds.has(x.employeeId))
 );
 line.staff = sum(monthPayouts, (x) => x.amount || 0) + sum(monthOverheads.filter((x: any) => x.category === 'personal_expense'), (x) => x.amount || 0);
 // The parts the normalized view spreads over the month instead (same rules as dailyCostSmoothing).
 const isContractEmp = (id: string) => { const e = employeesData.find((emp: any) => emp.id === id); return (e?.type || e?.employmentType) === 'contract'; };
 const staffSmoothable = sum(monthPayouts.filter((x: any) => !isContractEmp(x.employeeId)), (x) => x.amount || 0);
 const occupancySmoothable = sum(fixedCostsData.filter((x: any) => inMonth(x.date) && inStoreOrHouse(x) && (x.category === 'rent' || x.category === 'electricity')), (x) => x.amount || 0);
 const interest = calculateAccruedInterest(start, end, effectiveStoreId || undefined);

 // Approved cash shortages are deducted by the Net Profit card (see calculateCashDiscrepancy),
 // so they're deducted here too or the month wouldn't match what that month showed.
 const shortages = sum(
 monthSales.filter((x: any) => x.approvalRequired === false && x.approvedBy),
 (x) => {
 const offset = x.salesDiscrepancy !== undefined ? x.salesDiscrepancy : (x.cashOffset || 0);
 return offset < 0 ? Math.abs(offset) : 0;
 }
 );

 const revenue = counterRevenue + onlineRevenue;
 const costs = line.food + line.packaging + online.commission + online.ads + line.marketing + line.staff +
 line.occupancy + line.otherOpex + depreciation + interest + shortages;
 return {
 revenue, counterRevenue, onlineRevenue, zomatoRevenue, swiggyRevenue,
 onlineDiscounts: online.discounts,
 food: line.food, packaging: line.packaging, commission: online.commission,
 platformAds: online.ads, marketing: line.marketing,
 staff: line.staff, occupancy: line.occupancy, otherOpex: line.otherOpex,
 depreciation, interest, shortages,
 netProfit: revenue - costs,
 estimatedCommission: online.estimatedCommission + online.estimatedAds,
 estimatedDays: online.estimatedDays,
 staffSmoothable,
 occupancySmoothable,
 };
 }, [salesData, inventoryData, overheadData, fixedCostsData, storeOnlineSales, storeOnlinePayouts, onlineCostIndex, payoutsData, employeesData, filteredEmployeesData, effectiveStoreId, effectiveProductionHouseIdForCosts, onlineLoans, spreadSourceRecords]);

 // ---- Loss carry-forward. A month that ends in a loss is brought forward into the next
 // month's realized profit, and stays there until later profits pay it back (a running
 // balance, not just last month: Sept -10k, Oct +4k leaves -6k to carry into Nov). Profits
 // never carry forward. Counted from LOSS_CARRY_FORWARD_START onward, and one-off purchases
 // are deliberately included - they are real money out, same as every other expense here.
 // Only shown on This month / Last month. ----
 const carryForward = useMemo(() => {
 const LOSS_CARRY_FORWARD_START = '2026-09';
 const currentMonth = getTodayIST().slice(0, 7);
 const viewMonth = timeFilter === 'thisMonth' ? currentMonth : timeFilter === 'lastMonth' ? monthAdd(currentMonth, -1) : null;
 const empty = { amount: 0, viewMonth, parts: [] as { month: string; profit: number; carried: number }[] };
 if (!viewMonth || viewMonth <= LOSS_CARRY_FORWARD_START) return empty;

 const parts: { month: string; profit: number; carried: number }[] = [];
 let carried = 0;
 for (let m = LOSS_CARRY_FORWARD_START; m < viewMonth; m = monthAdd(m, 1)) {
 const profit = pnlForMonth(m).netProfit;
 carried = Math.min(0, carried + profit);
 parts.push({ month: m, profit, carried });
 }
 return { amount: carried, viewMonth, parts };
 }, [timeFilter, pnlForMonth]);

 // Unit Economics: the last 6 months, line by line (only built while that tab is open).
 const unitEconomicsTrend = useMemo(() => {
 if (activeView !== 'unit-economics') return [];
 const currentMonth = getTodayIST().slice(0, 7);
 const months = Array.from({ length: 6 }, (_, i) => monthAdd(currentMonth, i - 5));
 return months
 .map((m) => {
 const p = pnlForMonth(m);
 // The month in progress has no salaries or rent paid yet: count them day by day instead.
 const acc = m === currentMonth ? accrualFor(`${m}-01`, getTodayIST()) : null;
 return { month: m, label: monthLabel(m), partial: m === currentMonth, pnl: acc ? normalizePnl(p, acc.byGroup) : p };
 })
 .filter((t) => t.pnl.revenue > 0);
 }, [activeView, pnlForMonth, accrualFor]);

 // ---- Data behind the Salaries / Commission / Interest breakdown modals. Built from the
 // same filtered sources calculateMetrics uses, so each modal's rows add up to the headline
 // figure on the card it was opened from. ----
 const salaryBreakdownData = useMemo(() => {
 const isMonthly = timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom';
 return buildSalaryBreakdown({
 // Daily/weekly filters carry no payouts by design - salaries are monthly events.
 periodPayouts: isMonthly ? filteredPayoutsData : [],
 allPayouts: payoutsData,
 employees: employeesData,
 personalExpenses: filteredOverheadData.filter((o: any) => o.category === 'personal_expense'),
 timeFilter,
 todayIST: getTodayIST(),
 inScope: (emp: any) => !effectiveStoreId || employeeBelongsToStore(emp, effectiveStoreId, context.stores || []),
 });
 }, [filteredPayoutsData, payoutsData, employeesData, filteredOverheadData, timeFilter, effectiveStoreId, context.stores]);

 const commissionBreakdownSettlements = useMemo(
 () => (aggregatorSettlements || []).filter((st: any) =>
 (!effectiveStoreId || st.storeId === effectiveStoreId) && settlementOverlapsAnalyticsRange(st, activeSettlementDateRange)
 ),
 [aggregatorSettlements, effectiveStoreId, timeFilter, dateRange]
 );

 // Date range for the current timeFilter, usable outside calculateMetrics() (which has its
 // own copy scoped to its own body). Kept in sync with that logic.
 const itemPerfDateRange = useMemo((): { startDate: string; endDate: string } => {
 // Kept in sync with getDateRangeForFilter() above - same IST-safe string arithmetic.
 const today = getTodayIST();
 const dayOfWeek = (dateStr: string) => {
 const [y, m, d] = dateStr.split('-').map(Number);
 return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
 };
 switch (timeFilter) {
 case 'today': {
 return { startDate: today, endDate: today };
 }
 case 'yesterday': {
 const yesterdayStr = addDays(today, -1);
 return { startDate: yesterdayStr, endDate: yesterdayStr };
 }
 case 'thisWeek': {
 const startOfWeek = addDays(today, -dayOfWeek(today));
 return { startDate: startOfWeek, endDate: today };
 }
 case 'lastWeek': {
 const thisWeekStart = addDays(today, -dayOfWeek(today));
 const lastWeekEnd = addDays(thisWeekStart, -1);
 const lastWeekStart = addDays(lastWeekEnd, -6);
 return { startDate: lastWeekStart, endDate: lastWeekEnd };
 }
 case 'thisMonth': {
 return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
 }
 case 'lastMonth': {
 const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
 const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
 return { startDate: lastMonthStart, endDate: lastMonthEnd };
 }
 case 'custom':
 return { startDate: dateRange.from, endDate: dateRange.to };
 default:
 return { startDate: getTodayIST(), endDate: getTodayIST() };
 }
 }, [timeFilter, dateRange]);

 // The comparable "previous period" for every Overview trend chart's dashed line - not
 // just "N days back" but the actual matching period: same weekday last week for Today,
 // the whole previous week for This Week, the previous month up to the same date-of-month
 // for This Month, etc. - so the dashed line is a fair like-for-like comparison, not an
 // arbitrary offset.
 const previousPeriodRange = useMemo((): { startDate: string; endDate: string } => {
 const today = getTodayIST();
 switch (timeFilter) {
 case 'today': {
 const d = addDays(today, -7); // same weekday, last week
 return { startDate: d, endDate: d };
 }
 case 'yesterday': {
 const y = addDays(today, -1);
 const d = addDays(y, -7); // same weekday, the week before
 return { startDate: d, endDate: d };
 }
 case 'thisWeek': {
 // Previous week, day-aligned: if this week runs Mon..today, previous week runs
 // (Mon - 7 days)..(today - 7 days) - same position within the week, not just
 // "any 7 days back".
 return { startDate: addDays(itemPerfDateRange.startDate, -7), endDate: addDays(itemPerfDateRange.endDate, -7) };
 }
 case 'lastWeek': {
 return { startDate: addDays(itemPerfDateRange.startDate, -7), endDate: addDays(itemPerfDateRange.endDate, -7) };
 }
 case 'thisMonth': {
 // Previous month, 1st through the same day-of-month as today (capped at that
 // month's actual last day, e.g. Feb doesn't have a 30th/31st).
 const [y, m, d] = today.split('-').map(Number);
 const prevMonthDate = new Date(Date.UTC(y, m - 2, 1));
 const prevMonthStart = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
 const lastDayOfPrevMonth = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
 const cappedDay = Math.min(d, lastDayOfPrevMonth);
 const prevMonthSameDay = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cappedDay).padStart(2, '0')}`;
 return { startDate: prevMonthStart, endDate: prevMonthSameDay };
 }
 case 'lastMonth': {
 // The month before last month, same length (1st through last day).
 const [sy, sm] = itemPerfDateRange.startDate.split('-').map(Number);
 const monthBeforeStart = new Date(Date.UTC(sy, sm - 2, 1));
 const monthBeforeEnd = new Date(Date.UTC(sy, sm - 1, 0));
 const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
 return { startDate: fmt(monthBeforeStart), endDate: fmt(monthBeforeEnd) };
 }
 case 'custom': {
 // An equal-length period immediately preceding the selected custom range.
 const [fy, fm, fd] = itemPerfDateRange.startDate.split('-').map(Number);
 const [ty, tm, td] = itemPerfDateRange.endDate.split('-').map(Number);
 const lengthDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1;
 const endPrev = addDays(itemPerfDateRange.startDate, -1);
 const startPrev = addDays(endPrev, -(lengthDays - 1));
 return { startDate: startPrev, endDate: endPrev };
 }
 default:
 return { startDate: today, endDate: today };
 }
 }, [timeFilter, itemPerfDateRange]);

 // Fetch per-item, per-order sales detail for the Item Performance tab (top items, channel
 // comparison, week-over-week trend) and the Overview tab's Orders per Day chart (order
 // counts aren't tracked as a number anywhere - offline vs online is only knowable by
 // counting real orders, via externalId/paymentMode, same as Item Performance does).
 useEffect(() => {
 // 'profit' (Revenue & Channels) no longer needs this fetch - the Channel Economics
 // comparison that was its only consumer here moved to OnlineSalesTab.tsx, which fetches
 // its own copy scoped to that page's date range.
 if ((activeView !== 'sales' && activeView !== 'overview' && activeView !== 'unit-economics') || !context.user?.accessToken) return;
 const accessToken = context.user.accessToken;
 let cancelled = false;
 (async () => {
 try {
 const records = await api.getOrderItemDetail(accessToken, {
 storeId: effectiveStoreId || undefined,
 startDate: itemPerfDateRange.startDate,
 endDate: itemPerfDateRange.endDate
 });
 if (!cancelled) setOrderItemDetail(records || []);
 } catch (err) {
 console.error('Failed to load order item detail for Item Performance tab:', err);
 if (!cancelled) setOrderItemDetail([]);
 }
 })();
 return () => { cancelled = true; };
 }, [activeView, effectiveStoreId, itemPerfDateRange.startDate, itemPerfDateRange.endDate, context.user?.accessToken]);

 // Same fetch, for the previous-period comparison range - only needed on the Overview
 // tab (Item Performance doesn't show a previous-period line).
 useEffect(() => {
 if (activeView !== 'overview' || !context.user?.accessToken) return;
 const accessToken = context.user.accessToken;
 let cancelled = false;
 (async () => {
 try {
 const records = await api.getOrderItemDetail(accessToken, {
 storeId: effectiveStoreId || undefined,
 startDate: previousPeriodRange.startDate,
 endDate: previousPeriodRange.endDate
 });
 if (!cancelled) setPreviousOrderItemDetail(records || []);
 } catch (err) {
 console.error('Failed to load previous-period order item detail:', err);
 if (!cancelled) setPreviousOrderItemDetail([]);
 }
 })();
 return () => { cancelled = true; };
 }, [activeView, effectiveStoreId, previousPeriodRange.startDate, previousPeriodRange.endDate, context.user?.accessToken]);

 // Ciferon lists an online-specific SKU for the same physical dish under its own product
 // name, tagged with a "-O" suffix and sometimes a prep-style qualifier and/or a
 // "[N Pieces]" bracket - e.g. "Chicken Steamed Momos [6 Pieces] -O Normal" is really just
 // "Chicken Steamed Momos". Without this, the Top Items/Declining charts below (built
 // straight from raw order-item-detail productName, unlike itemChannelBreakdown which
 // already strips this) silently split one dish's revenue across its bare dine-in name and
 // every online prep-variant of it. Mirrors the backend's own normalizeItemName exactly
 // (posItemClassifier.tsx) - edge functions can't import from src/, so this is duplicated,
 // not shared; keep both in sync. KNOWN_SYNONYMS is the one exception to "strip brackets
 // only" - a short, human-CONFIRMED list of raw Ciferon product names that are the exact
 // same dish under two different catalog entries (e.g. word order swapped), most likely
 // created as separate products in Ciferon at different times. The real fix is renaming
 // the duplicate in Ciferon's own menu management so future syncs never split under two
 // names at all - this is a stopgap for already-synced data in the meantime. Add a pair
 // here only once a human has confirmed it, never as an automatic/fuzzy guess.
 const KNOWN_SYNONYMS: Record<string, string> = {
 'steamed chicken momos': 'Chicken Steamed Momos',
 };
 const normalizeItemName = (name: string): string => {
 const stripped = (name || 'Unknown')
 .replace(/\[.*?\]/g, ' ')
 .replace(/-\s*O\b/gi, ' ')
 .replace(/\b(butter brushed|normal)\b/gi, ' ')
 .replace(/\s+/g, ' ')
 .trim();
 return KNOWN_SYNONYMS[stripped.toLowerCase()] || stripped;
 };

 // Aggregate order item detail into per-item revenue + channel split for the Item
 // Performance charts (top-10 by revenue, per-item channel comparison).
 const itemPerformanceData = useMemo(() => {
 const byItem: Record<string, { name: string; revenue: number; qty: number; Offline: number; Zomato: number; Swiggy: number }> = {};
 orderItemDetail.forEach(rec => {
 rec.orders.forEach(order => {
 // Matches SalesData.tsx's classification: an order with no externalId is a POS/offline
 // sale; otherwise it came from an aggregator, distinguished by paymentMode.
 const channel: 'Offline' | 'Zomato' | 'Swiggy' =
 !order.externalId ? 'Offline' : (order.paymentMode === 'Swiggy' ? 'Swiggy' : 'Zomato');
 order.items.forEach(item => {
 const key = normalizeItemName(item.productName);
 if (!byItem[key]) {
 byItem[key] = { name: key, revenue: 0, qty: 0, Offline: 0, Zomato: 0, Swiggy: 0 };
 }
 byItem[key].revenue += item.total || 0;
 byItem[key].qty += item.quantity || 0;
 byItem[key][channel] += item.total || 0;
 });
 });
 });
 const items = Object.values(byItem).sort((a, b) => b.revenue - a.revenue);
 return { top10: items.slice(0, 10), all: items };
 }, [orderItemDetail]);

 // Number of orders per day, offline vs Zomato vs Swiggy - counted from real orders (no
 // order-count field exists on SalesData/OnlineSalesEntry, only revenue totals), same
 // classification rule as Item Performance above: no externalId = offline/POS, otherwise
 // online, split further by paymentMode.
 // Zips a "current period" series with its "previous period" counterpart by INDEX
 // (position 1 pairs with position 1, etc.) rather than by date - the dashed comparison
 // line is meant to overlay "same point in the period", e.g. this Monday against last
 // Monday, not literally the same calendar date. Missing previous-period days (shorter
 // history) just leave that point off the dashed line instead of erroring.
 const zipPrev = <T extends Record<string, any>>(current: T[], previous: T[], keys: (keyof T)[]): any[] => {
 const len = Math.max(current.length, previous.length);
 const rows: any[] = [];
 for (let i = 0; i < len; i++) {
 const cur = current[i] || ({} as T);
 const prev = previous[i];
 const row: any = { ...cur };
 keys.forEach((k) => { row[`prev_${String(k)}`] = prev ? (prev[k] ?? null) : null; });
 rows.push(row);
 }
 return rows;
 };

 const buildOrdersPerDay = (records: api.OrderItemDetailRecord[]) => {
 const byDate: Record<string, { offline: number; zomato: number; swiggy: number }> = {};
 records.forEach(rec => {
 if (!byDate[rec.date]) byDate[rec.date] = { offline: 0, zomato: 0, swiggy: 0 };
 rec.orders.forEach(order => {
 if (!order.externalId) byDate[rec.date].offline += 1;
 else if (order.paymentMode === 'Swiggy') byDate[rec.date].swiggy += 1;
 else byDate[rec.date].zomato += 1;
 });
 });
 return Object.entries(byDate)
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([date, counts]) => ({
 date,
 period: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
 offline: counts.offline,
 zomato: counts.zomato,
 swiggy: counts.swiggy,
 online: counts.zomato + counts.swiggy,
 total: counts.offline + counts.zomato + counts.swiggy,
 }));
 };
 const ordersPerDayData = useMemo(() => buildOrdersPerDay(orderItemDetail), [orderItemDetail]);
 // Unit Economics: each channel's food valued at counter prices, so food cost follows food sold.
 const channelFoodValue = useMemo(() => (activeView === 'unit-economics' ? counterValueByChannel(orderItemDetail) : null), [activeView, orderItemDetail]);
 const previousOrdersPerDayData = useMemo(() => buildOrdersPerDay(previousOrderItemDetail), [previousOrderItemDetail]);
 const ordersPerDayChartData = useMemo(
 () => zipPrev(ordersPerDayData, previousOrdersPerDayData, ['offline', 'zomato', 'swiggy']),
 [ordersPerDayData, previousOrdersPerDayData]
 );

 // Separate offline/online medians for the reference lines on the chart above - a single
 // blended median hid that the two channels run at very different volumes, and median is
 // more resistant to one freak busy/slow day skewing the read than a plain average.
 const median = (values: number[]): number => {
 const sorted = [...values].sort((a, b) => a - b);
 if (sorted.length === 0) return 0;
 const mid = Math.floor(sorted.length / 2);
 return sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
 };
 const offlineOrdersMedian = useMemo(() => median(ordersPerDayData.map(d => d.offline)), [ordersPerDayData]);
 const onlineOrdersMedian = useMemo(() => median(ordersPerDayData.map(d => d.online)), [ordersPerDayData]);

 // Orders by hour, 3 PM - 10 PM IST (dinner rush window) - which hour actually peaks.
 // Only orders with a real orderHourIST (captured going forward, see getCiferonOrderHourIST
 // in index.ts) contribute here - days synced before that field existed simply have none,
 // same as any other day with zero orders in this window.
 const HOUR_START = 15; // 3 PM
 const HOUR_END = 22; // 10 PM hour bucket (covers orders up to 10:59 PM)
 const formatHour = (h: number) => {
 const period = h >= 12 ? 'PM' : 'AM';
 const h12 = h % 12 === 0 ? 12 : h % 12;
 return `${h12} ${period}`;
 };
 // Normalized to average orders per day (not a raw sum across the whole selected period) -
 // a straight sum balloons with every extra day included and isn't comparable across
 // different-length periods, e.g. "This Month" vs "This Week". Divide by how many days
 // actually had hourly data, so this shows a typical day's shape at each hour.
 const buildOrdersByHour = (records: api.OrderItemDetailRecord[]) => {
 const byHour: Record<number, { offline: number; online: number }> = {};
 for (let h = HOUR_START; h <= HOUR_END; h++) byHour[h] = { offline: 0, online: 0 };
 const daysWithHourData = new Set<string>();
 records.forEach(rec => {
 rec.orders.forEach(order => {
 const hour = order.orderHourIST;
 if (hour === null || hour === undefined || hour < HOUR_START || hour > HOUR_END) return;
 daysWithHourData.add(rec.date);
 if (!order.externalId) byHour[hour].offline += 1;
 else byHour[hour].online += 1;
 });
 });
 const dayCount = daysWithHourData.size || 1;
 const avg = (n: number) => Math.round((n / dayCount) * 10) / 10;
 return Object.entries(byHour)
 .map(([h, counts]) => {
 const hour = parseInt(h, 10);
 return { hour, label: formatHour(hour), offline: avg(counts.offline), online: avg(counts.online), total: avg(counts.offline + counts.online) };
 })
 .sort((a, b) => a.hour - b.hour);
 };
 const ordersByHourData = useMemo(() => buildOrdersByHour(orderItemDetail), [orderItemDetail]);
 const previousOrdersByHourData = useMemo(() => buildOrdersByHour(previousOrderItemDetail), [previousOrderItemDetail]);
 // Hour buckets already line up 1:1 (both cover 3 PM-10 PM), so index-zip = hour-zip here.
 const ordersByHourChartData = useMemo(
 () => zipPrev(ordersByHourData, previousOrdersByHourData, ['offline', 'online']),
 [ordersByHourData, previousOrdersByHourData]
 );

 const peakHour = useMemo(() => {
 if (ordersByHourData.every(h => h.total === 0)) return null;
 return ordersByHourData.reduce((best, h) => (h.total > best.total ? h : best), ordersByHourData[0]);
 }, [ordersByHourData]);

 // Dine-in / Takeaway / Home Delivery split, by order count and revenue - Ciferon's
 // SaleOrderType was already being captured for box/tray counting but never charted.
 // Zomato/Swiggy orders are always HomeDelivery, so this isn't the same axis as
 // offline/online above - a DineIn order is always offline, but HomeDelivery mixes real
 // offline delivery with both aggregators.
 const buildServiceType = (records: api.OrderItemDetailRecord[]) => {
 const byDate: Record<string, { DineIn: number; TakeAway: number; HomeDelivery: number; Other: number }> = {};
 const revenueByType: Record<string, number> = { DineIn: 0, TakeAway: 0, HomeDelivery: 0, Other: 0 };
 records.forEach(rec => {
 if (!byDate[rec.date]) byDate[rec.date] = { DineIn: 0, TakeAway: 0, HomeDelivery: 0, Other: 0 };
 rec.orders.forEach(order => {
 const type = (order.orderType === 'DineIn' || order.orderType === 'TakeAway' || order.orderType === 'HomeDelivery')
 ? order.orderType
 : 'Other';
 byDate[rec.date][type] += 1;
 revenueByType[type] += order.grandTotal || 0;
 });
 });
 const trend = Object.entries(byDate)
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([date, counts]) => ({
 date,
 period: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
 ...counts,
 }));
 return { trend, revenueByType };
 };
 const serviceTypeData = useMemo(() => buildServiceType(orderItemDetail), [orderItemDetail]);
 const previousServiceTypeData = useMemo(() => buildServiceType(previousOrderItemDetail), [previousOrderItemDetail]);
 const serviceTypeChartData = useMemo(
 () => zipPrev(serviceTypeData.trend, previousServiceTypeData.trend, ['DineIn', 'TakeAway', 'HomeDelivery']),
 [serviceTypeData, previousServiceTypeData]
 );

 // Average order value per day, by channel - already have revenue and order counts
 // separately, just never divided them against each other over time.
 const buildAvgOrderValue = (records: api.OrderItemDetailRecord[]) => {
 const byDate: Record<string, { offlineRevenue: number; offlineCount: number; onlineRevenue: number; onlineCount: number }> = {};
 records.forEach(rec => {
 if (!byDate[rec.date]) byDate[rec.date] = { offlineRevenue: 0, offlineCount: 0, onlineRevenue: 0, onlineCount: 0 };
 rec.orders.forEach(order => {
 const amt = order.grandTotal || 0;
 if (!order.externalId) {
 byDate[rec.date].offlineRevenue += amt;
 byDate[rec.date].offlineCount += 1;
 } else {
 byDate[rec.date].onlineRevenue += amt;
 byDate[rec.date].onlineCount += 1;
 }
 });
 });
 return Object.entries(byDate)
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([date, d]) => ({
 date,
 period: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
 offlineAOV: d.offlineCount > 0 ? Math.round((d.offlineRevenue / d.offlineCount) * 100) / 100 : 0,
 onlineAOV: d.onlineCount > 0 ? Math.round((d.onlineRevenue / d.onlineCount) * 100) / 100 : 0,
 }));
 };
 const avgOrderValueData = useMemo(() => buildAvgOrderValue(orderItemDetail), [orderItemDetail]);
 const previousAvgOrderValueData = useMemo(() => buildAvgOrderValue(previousOrderItemDetail), [previousOrderItemDetail]);
 const avgOrderValueChartData = useMemo(
 () => zipPrev(avgOrderValueData, previousAvgOrderValueData, ['offlineAOV', 'onlineAOV']),
 [avgOrderValueData, previousAvgOrderValueData]
 );

 // Discount as a % of gross sales, per day, offline vs online - discount amounts were
 // already tracked (offlineDiscount/onlineDiscount on SalesData), just never trended.
 const buildDiscountPct = (records: api.OrderItemDetailRecord[]) => {
 const byDate: Record<string, { offlineGross: number; offlineDiscount: number; onlineGross: number; onlineDiscount: number }> = {};
 records.forEach(rec => {
 if (!byDate[rec.date]) byDate[rec.date] = { offlineGross: 0, offlineDiscount: 0, onlineGross: 0, onlineDiscount: 0 };
 rec.orders.forEach(order => {
 const gross = (order.subtotal || 0);
 const disc = order.discount || 0;
 if (!order.externalId) {
 byDate[rec.date].offlineGross += gross;
 byDate[rec.date].offlineDiscount += disc;
 } else {
 byDate[rec.date].onlineGross += gross;
 byDate[rec.date].onlineDiscount += disc;
 }
 });
 });
 return Object.entries(byDate)
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([date, d]) => ({
 date,
 period: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
 offlinePct: d.offlineGross > 0 ? Math.round((d.offlineDiscount / d.offlineGross) * 1000) / 10 : 0,
 onlinePct: d.onlineGross > 0 ? Math.round((d.onlineDiscount / d.onlineGross) * 1000) / 10 : 0,
 }));
 };
 const discountPctData = useMemo(() => buildDiscountPct(orderItemDetail), [orderItemDetail]);
 const previousDiscountPctData = useMemo(() => buildDiscountPct(previousOrderItemDetail), [previousOrderItemDetail]);
 const discountPctChartData = useMemo(
 () => zipPrev(discountPctData, previousDiscountPctData, ['offlinePct', 'onlinePct']),
 [discountPctData, previousDiscountPctData]
 );

 // Raw digital-payment-mode split (Cash/Paytm/PhonePe/Card/Google Pay/Razorpay/...),
 // summed across the filtered period - insight-only, doesn't change any reconciled total
 // (see paymentModeBreakdown on SalesData). Only populated on records synced after this
 // field was added, so older periods may show fewer/no slices even with real sales.
 // No previous-period line here - it's a pie for the period, not a trend.
 const paymentModeBreakdownData = useMemo(() => {
 const totals: Record<string, number> = {};
 filteredSalesData.forEach((sale: any) => {
 const breakdown = sale.paymentModeBreakdown as Record<string, number> | undefined;
 if (!breakdown) return;
 Object.entries(breakdown).forEach(([mode, amount]) => {
 totals[mode] = (totals[mode] || 0) + (amount || 0);
 });
 });
 const PALETTE: Record<string, string> = {
 Cash: '#22c55e', Paytm: '#3b82f6', PhonePe: '#a855f7', Card: '#f59e0b',
 'Google Pay': '#06b6d4', Razorpay: '#0ea5e9', Zomato: '#e23744', Swiggy: '#fc8019', Unknown: '#94a3b8',
 };
 return Object.entries(totals)
 .filter(([, amount]) => amount > 0)
 .sort((a, b) => b[1] - a[1])
 .map(([mode, amount]) => ({ name: mode, value: Math.round(amount), color: PALETTE[mode] || '#94a3b8' }));
 }, [filteredSalesData]);

 // SalesData records for previousPeriodRange - same store scoping as filteredSalesData,
 // just against context.salesData directly (already fully loaded) instead of the
 // current-timeFilter-filtered subset, since we need a different date window.
 const previousPeriodSalesData = useMemo(() => {
 return (context.salesData || []).filter((sale: any) => {
 if (!sale?.date) return false;
 if (sale.date < previousPeriodRange.startDate || sale.date > previousPeriodRange.endDate) return false;
 return effectiveStoreId ? sale.storeId === effectiveStoreId : true;
 });
 }, [context.salesData, previousPeriodRange, effectiveStoreId]);

 // Cancellation trend - offlineCancelledCount/onlineCancelledCount were already tracked
 // per day, just never charted as a trend (only ever shown as a same-day snapshot).
 const buildCancellationTrend = (sales: any[]) => {
 return [...sales]
 .filter((sale: any) => sale.date)
 .sort((a: any, b: any) => a.date.localeCompare(b.date))
 .map((sale: any) => ({
 date: sale.date,
 period: new Date(`${sale.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
 offlineCancelled: sale.offlineCancelledCount || 0,
 onlineCancelled: sale.onlineCancelledCount || 0,
 cancelledAmount: (sale.offlineCancelledAmount || 0) + (sale.onlineCancelledAmount || 0),
 }));
 };
 const cancellationTrendData = useMemo(() => buildCancellationTrend(filteredSalesData), [filteredSalesData]);
 const previousCancellationTrendData = useMemo(() => buildCancellationTrend(previousPeriodSalesData), [previousPeriodSalesData]);
 const cancellationChartData = useMemo(
 () => zipPrev(cancellationTrendData, previousCancellationTrendData, ['offlineCancelled', 'onlineCancelled']),
 [cancellationTrendData, previousCancellationTrendData]
 );

 // Order value distribution, per day - how many orders fell in each ₹50 value band
 // (₹100-149, ₹150-199, ... ₹450-499, ₹500+). Orders under ₹100 aren't bucketed here.
 // From real per-order data (orderItemDetail), same source as the other order charts.
 // Starts at ₹0 (not ₹100) so low-value orders - a single momo, a side, a drink - show up
 // instead of silently vanishing from the distribution.
 const ORDER_VALUE_BUCKETS = [
 { key: 'b0', min: 0, max: 99, label: '₹0-99' },
 { key: 'b100', min: 100, max: 149, label: '₹100-149' },
 { key: 'b150', min: 150, max: 199, label: '₹150-199' },
 { key: 'b200', min: 200, max: 249, label: '₹200-249' },
 { key: 'b250', min: 250, max: 299, label: '₹250-299' },
 { key: 'b300', min: 300, max: 349, label: '₹300-349' },
 { key: 'b350', min: 350, max: 399, label: '₹350-399' },
 { key: 'b400', min: 400, max: 449, label: '₹400-449' },
 { key: 'b450', min: 450, max: 499, label: '₹450-499' },
 { key: 'b500', min: 500, max: Infinity, label: '₹500+' },
 ] as const;

 // A per-day stacked-bar-plus-9-dashed-lines version of this used to live here - technically
 // complete, but unreadable: 9 colors stacked per day tells you nothing about the actual
 // shape of the distribution, which is the whole point of a histogram. This instead totals
 // each value band across the whole period once, so the chart reads as "here's the shape of
 // what people order" at a glance, with the previous period as a second bar per band for
 // comparison - a much more natural fit than a 9-series dashed-line overlay ever was.
 const orderValueHistogramData = useMemo(() => {
 const bucketOf = (amt: number) => ORDER_VALUE_BUCKETS.find(b => amt >= b.min && amt <= b.max);
 const currentCounts: Record<string, number> = {};
 const previousCounts: Record<string, number> = {};
 ORDER_VALUE_BUCKETS.forEach(b => { currentCounts[b.key] = 0; previousCounts[b.key] = 0; });

 let currentTotalOrders = 0, currentTotalValue = 0;
 orderItemDetail.forEach(rec => rec.orders.forEach(order => {
 const amt = order.grandTotal || 0;
 const bucket = bucketOf(amt);
 if (!bucket) return;
 currentCounts[bucket.key] += 1;
 currentTotalOrders += 1;
 currentTotalValue += amt;
 }));
 previousOrderItemDetail.forEach(rec => rec.orders.forEach(order => {
 const bucket = bucketOf(order.grandTotal || 0);
 if (bucket) previousCounts[bucket.key] += 1;
 }));

 const rows = ORDER_VALUE_BUCKETS.map(b => ({
 label: b.label,
 current: currentCounts[b.key],
 previous: previousCounts[b.key],
 }));
 const modalBucket = rows.reduce((best, r) => (r.current > best.current ? r : best), rows[0]);
 const avgOrderValue = currentTotalOrders > 0 ? Math.round((currentTotalValue / currentTotalOrders) * 100) / 100 : 0;
 return { rows, currentTotalOrders, avgOrderValue, modalBucket };
 }, [orderItemDetail, previousOrderItemDetail]);

 // Week-over-week revenue delta per item, flagged as declining when down >10% and this
 // week's revenue is non-trivial (avoids flagging noise on near-zero volume items).
 const decliningItems = useMemo(() => {
 const today = new Date(getTodayIST());
 const thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - 6);
 const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
 const lastWeekStart = new Date(lastWeekEnd); lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
 const fmt = (d: Date) => d.toISOString().split('T')[0];
 const thisWeekRange = { start: fmt(thisWeekStart), end: fmt(today) };
 const lastWeekRange = { start: fmt(lastWeekStart), end: fmt(lastWeekEnd) };

 const byItemWeek: Record<string, { thisWeek: number; lastWeek: number }> = {};
 orderItemDetail.forEach(rec => {
 const inThisWeek = rec.date >= thisWeekRange.start && rec.date <= thisWeekRange.end;
 const inLastWeek = rec.date >= lastWeekRange.start && rec.date <= lastWeekRange.end;
 if (!inThisWeek && !inLastWeek) return;
 rec.orders.forEach(order => {
 order.items.forEach(item => {
 const key = normalizeItemName(item.productName);
 if (!byItemWeek[key]) byItemWeek[key] = { thisWeek: 0, lastWeek: 0 };
 if (inThisWeek) byItemWeek[key].thisWeek += item.total || 0;
 if (inLastWeek) byItemWeek[key].lastWeek += item.total || 0;
 });
 });
 });

 return Object.entries(byItemWeek)
 .map(([name, v]) => ({
 name,
 thisWeek: Math.round(v.thisWeek),
 lastWeek: Math.round(v.lastWeek),
 changePct: v.lastWeek > 0 ? Math.round(((v.thisWeek - v.lastWeek) / v.lastWeek) * 1000) / 10 : 0
 }))
 .filter(x => x.lastWeek >= 500 && x.changePct <= -10)
 .sort((a, b) => a.changePct - b.changePct)
 .slice(0, 8);
 }, [orderItemDetail]);

 // Prepare chart data - group by month
 const prepareMonthlyData = () => {
 const monthlyData: any = {};

 filteredSalesData.forEach(sale => {
 const date = new Date(sale.date);
 const monthKey = date.toLocaleString('default', { month: 'short' });
 
 if (!monthlyData[monthKey]) {
 monthlyData[monthKey] = {
 month: monthKey,
 revenue: 0,
 expenses: 0,
 profit: 0
 };
 }

 const revenue = (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
 monthlyData[monthKey].revenue += revenue;
 });

 filteredInventoryData.forEach(item => {
 const date = new Date(item.date);
 const monthKey = date.toLocaleString('default', { month: 'short' });
 
 if (!monthlyData[monthKey]) {
 monthlyData[monthKey] = {
 month: monthKey,
 revenue: 0,
 expenses: 0,
 profit: 0
 };
 }

 monthlyData[monthKey].expenses += (item.totalCost || 0);
 });

 // Add overhead expenses
 filteredOverheadData.forEach(item => {
 const date = new Date(item.date);
 const monthKey = date.toLocaleString('default', { month: 'short' });
 
 if (!monthlyData[monthKey]) {
 monthlyData[monthKey] = {
 month: monthKey,
 revenue: 0,
 expenses: 0,
 profit: 0
 };
 }

 monthlyData[monthKey].expenses += (item.amount || 0);
 });

 // Calculate profit for each month
 Object.keys(monthlyData).forEach(month => {
 monthlyData[month].profit = monthlyData[month].revenue - monthlyData[month].expenses;
 });

 return Object.values(monthlyData);
 };

 const monthlyChartData = useMemo(() => prepareMonthlyData(), [
 filteredSalesData,
 filteredInventoryData,
 filteredOverheadData
 ]);

 // Prepare sales chart data with online/offline breakdown based on time filter
 const prepareSalesChartData = () => {
 const now = new Date();
 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const chartData: any[] = [];
 
 // Helper function to get date string in YYYY-MM-DD format without timezone issues
 const getLocalDateString = (date: Date): string => {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 };
 
 // Helper function to add day data
 const addDayData = (date: Date) => {
 const dateStr = getLocalDateString(date);
 const dayLabel = date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
 
 const daySales = filteredSalesData.filter(sale => sale.date === dateStr);
 // Get online sales from main sales table
 const onlineRevenueFromSales = daySales.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
 
 // ALSO get online sales from the separate online sales table (Swiggy + Zomato)
 const dayOnlineSales = onlineSalesData.filter(sale => sale.date === dateStr);
 const onlineRevenueFromPlatforms = dayOnlineSales.reduce((sum, sale) => 
 sum + (sale.swiggySales || 0) + (sale.zomatoSales || 0), 0);
 
 // Total online revenue = both sources
 const totalOnlineRevenue = onlineRevenueFromSales + onlineRevenueFromPlatforms;
 
 const offlineRevenue = daySales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0), 0);
 const total = totalOnlineRevenue + offlineRevenue;
 
 chartData.push({
 period: dayLabel,
 online: totalOnlineRevenue,
 offline: offlineRevenue,
 total: total
 });
 };
 
 if (timeFilter === 'today') {
 addDayData(today);
 } else if (timeFilter === 'yesterday') {
 const yesterday = new Date(today);
 yesterday.setDate(yesterday.getDate() - 1);
 addDayData(yesterday);
 } else if (timeFilter === 'thisWeek') {
 // Get days from Monday of this week to today
 const dayOfWeek = today.getDay();
 const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
 const startOfWeek = new Date(today);
 startOfWeek.setDate(today.getDate() + diff);
 
 let current = new Date(startOfWeek);
 while (current <= today) {
 addDayData(new Date(current));
 current.setDate(current.getDate() + 1);
 }
 } else if (timeFilter === 'thisMonth') {
 // Get days from 1st of this month to today
 const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
 let current = new Date(startOfMonth);
 while (current <= today) {
 addDayData(new Date(current));
 current.setDate(current.getDate() + 1);
 }
 } else if (timeFilter === 'lastWeek') {
 // Get days from last Monday to last Sunday
 const currentDay = today.getDay();
 const daysToLastMonday = currentDay === 0 ? -13 : -(currentDay + 6);
 const startOfLastWeek = new Date(today);
 startOfLastWeek.setDate(today.getDate() + daysToLastMonday);
 
 let current = new Date(startOfLastWeek);
 for (let i = 0; i < 7; i++) {
 addDayData(new Date(current));
 current.setDate(current.getDate() + 1);
 }
 } else if (timeFilter === 'lastMonth') {
 // Get all days from last month
 const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
 const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
 
 let current = new Date(startOfLastMonth);
 while (current <= endOfLastMonth) {
 addDayData(new Date(current));
 current.setDate(current.getDate() + 1);
 }
 } else if (timeFilter === 'custom') {
 // For custom range, group by month
 const monthlyData: any = {};
 
 filteredSalesData.forEach(sale => {
 const date = new Date(sale.date);
 const monthKey = date.toLocaleDateString('default', { month: 'short', year: '2-digit' });
 
 if (!monthlyData[monthKey]) {
 monthlyData[monthKey] = {
 period: monthKey,
 online: 0,
 offline: 0,
 total: 0
 };
 }
 
 const onlineRev = sale.onlineSales || 0;
 const offlineRev = (sale.paytmAmount || 0) + (sale.cashAmount || 0);
 
 monthlyData[monthKey].online += onlineRev;
 monthlyData[monthKey].offline += offlineRev;
 monthlyData[monthKey].total += onlineRev + offlineRev;
 });
 
 // ALSO add online sales from Swiggy/Zomato
 onlineSalesData.forEach(sale => {
 const date = new Date(sale.date);
 const monthKey = date.toLocaleDateString('default', { month: 'short', year: '2-digit' });
 
 if (!monthlyData[monthKey]) {
 monthlyData[monthKey] = {
 period: monthKey,
 online: 0,
 offline: 0,
 total: 0
 };
 }
 
 const platformSales = (sale.swiggySales || 0) + (sale.zomatoSales || 0);
 monthlyData[monthKey].online += platformSales;
 monthlyData[monthKey].total += platformSales;
 });
 
 return Object.values(monthlyData);
 }
 
 return chartData;
 };

 const salesChartData = useMemo(() => prepareSalesChartData(), [
 filteredSalesData,
 onlineSalesData,
 timeFilter
 ]);

 // Rent / electricity / permanent salaries (incl. variable pay) spread over the days of the
 // month they belong to - see utils/dailyCostSmoothing.ts for the rules (estimates, true-up).
 // Built from ALL records (not the time-filtered ones) so a payment made outside the viewed
 // window still contributes its daily share to the days inside it.
 const fixedCostAccrual = useMemo(() => {
 const today = getTodayIST();
 const dow = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
 let start = today;
 let end = today;
 switch (timeFilter) {
 case 'yesterday': start = end = addDays(today, -1); break;
 case 'thisWeek': start = addDays(today, -dow(today)); break;
 case 'lastWeek': { const ws = addDays(today, -dow(today)); end = addDays(ws, -1); start = addDays(end, -6); break; }
 case 'thisMonth': start = `${today.slice(0, 7)}-01`; break;
 case 'lastMonth': { end = addDays(`${today.slice(0, 7)}-01`, -1); start = `${end.slice(0, 7)}-01`; break; }
 case 'custom': start = dateRange.from; end = dateRange.to; break;
 default: break;
 }
 return accrualFor(start, end);
 }, [timeFilter, dateRange, accrualFor]);
 // The daily charts only use the spread when the toggle is on; the Net Normalized Profit card always does.
 const smoothedCosts = smoothFixedCosts ? fixedCostAccrual : null;

 // Prepare profit chart data with revenue, expenses, profit based on time filter
 const prepareProfitChartData = () => {
 const now = new Date();
 const dailyData: any = {};
 
 console.log('📊 === CHART DATA PREPARATION DEBUG ===');
 
 // Group by date for daily breakdown
 filteredSalesData.forEach(sale => {
 const date = sale.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 // Use GROSS revenue (to match metrics calculation)
 const grossRevenue = (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
 dailyData[date].revenue += grossRevenue;
 
 // Add contract worker salary
 dailyData[date].expenses += (sale.employeeSalary || 0);
 });
 
 // Calculate commission by date from onlineSalesData and onlinePayoutData (same as metrics)
 const filteredOnlineSales = onlineSalesData.filter(sale => {
 const dateMatch = (() => {
 // IST calendar-date string arithmetic (see getDateRangeForFilter above for why).
 const today = getTodayIST();
 const dayOfWeek = (dateStr: string) => {
 const [y, m, d] = dateStr.split('-').map(Number);
 return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
 };
 switch (timeFilter) {
 case 'today':
 return sale.date === today;
 case 'yesterday':
 return sale.date === addDays(today, -1);
 case 'thisWeek': {
 const startOfWeek = addDays(today, -dayOfWeek(today));
 return sale.date >= startOfWeek && sale.date <= today;
 }
 case 'lastWeek': {
 const thisWeekStart = addDays(today, -dayOfWeek(today));
 const lastWeekEnd = addDays(thisWeekStart, -1);
 const lastWeekStart = addDays(lastWeekEnd, -6);
 return sale.date >= lastWeekStart && sale.date <= lastWeekEnd;
 }
 case 'thisMonth':
 return sale.date.startsWith(today.slice(0, 7));
 case 'lastMonth': {
 const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
 return sale.date.startsWith(lastMonthEnd.slice(0, 7));
 }
 case 'custom':
 return sale.date >= dateRange.from && sale.date <= dateRange.to;
 default:
 return true;
 }
 })();
 const storeMatch = effectiveStoreId ? sale.storeId === effectiveStoreId : true;
 return dateMatch && storeMatch;
 });
 
 filteredOnlineSales.forEach(sale => {
 const date = sale.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 const onlineSales = (sale.swiggySales || 0) + (sale.zomatoSales || 0);
 if (!dailyData[date].onlineSales) dailyData[date].onlineSales = 0;
 dailyData[date].onlineSales += onlineSales;
 // BUG FIX: this was only tracked for the commission calc below and never actually
 // added to revenue, so the Revenue/Profit lines only ever reflected offline (cash +
 // Paytm) sales - online/aggregator sales were silently missing from both charts.
 dailyData[date].revenue += onlineSales;
 });

 // Zomato/Swiggy commission and ads on the days of the orders they're for - the same
 // per-day figures behind the cards (settled, old payout entries, or estimated).
 Object.entries(metrics.online.byDate).forEach(([date, day]) => {
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += day.commission + day.ads;
 });

 // Add inventory expenses by date (equipment is spread over its life instead - see below)
 filteredInventoryData.forEach(item => {
 if (!isDatedProfitCost(item.category || '', 'inventory')) return;
 const date = item.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += (item.totalCost || 0);
 });

 // Add overhead expenses by date
 filteredOverheadData.forEach(item => {
 if (!isDatedProfitCost(item.category || '', 'overhead')) return;
 const date = item.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += (item.amount || 0);
 });

 // Each day's share of equipment purchases and yearly subscriptions
 const chartSpreadEnd = itemPerfDateRange.endDate > getTodayIST() ? getTodayIST() : itemPerfDateRange.endDate;
 Object.entries(buildSpreadCosts(spreadSourceRecords, itemPerfDateRange.startDate, chartSpreadEnd).byDate).forEach(([date, amount]) => {
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += amount;
 });

 // Add fixed costs by date
 filteredFixedCostsData.forEach(item => {
 if (!isDatedProfitCost(item.category || '', 'fixedcost')) return;
 // Smoothed mode spreads rent/electricity over the month instead (smoothedCosts)
 if (smoothedCosts && (item.category === 'electricity' || item.category === 'rent')) return;
 const date = item.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += (item.amount || 0);
 });

 if (smoothedCosts) {
 Object.entries(smoothedCosts.byDate).forEach(([date, day]) => {
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += day.amount;
 });
 }
 
 // Add employee payouts by date (only for fulltime employees to avoid double-counting)
 // - skipped in smoothed mode, where permanent salaries are spread over the month instead
 if (!smoothedCosts) filteredPayoutsData.forEach(payout => {
 const date = payout.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 // Find the employee for this payout - use raw employeesData for type lookup
 const employee = employeesData.find((emp: any) => emp.id === payout.employeeId);
 const empType = employee?.type || employee?.employmentType;
 // Only include if employee is fulltime (permanent) - contract workers are in sales.employeeSalary
 if (employee && empType === 'fulltime') {
 dailyData[date].expenses += (payout.amount || 0);
 }
 });
 
 // Calculate profit and format for chart
 const chartData = Object.keys(dailyData)
 .sort()
 .map(date => {
 const data = dailyData[date];
 const profit = data.revenue - data.expenses;
 console.log(`Chart data for ${date}: revenue=${data.revenue}, expenses=${data.expenses}, profit=${profit}`);
 return {
 date: date, // Add unique date identifier for React key
 period: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
 revenue: Math.round(data.revenue),
 expenses: Math.round(data.expenses),
 profit: Math.round(profit)
 };
 });
 
 console.log('📊 === END CHART DATA DEBUG ===');
 return chartData;
 };

 const profitChartData = useMemo(() => prepareProfitChartData(), [
 filteredSalesData,
 filteredInventoryData,
 filteredOverheadData,
 filteredFixedCostsData,
 filteredPayoutsData,
 filteredEmployeesData,
 onlineSalesData,
 metrics,
 smoothedCosts,
 spreadSourceRecords,
 itemPerfDateRange,
 timeFilter,
 effectiveStoreId,
 dateRange
 ]);

 // Previous-period revenue/expenses/profit for the dashed comparison line on Revenue &
 // Profit Trend. Deliberately a simpler calc than prepareProfitChartData above (skips the
 // commission/legacy-payout reconciliation nuance) - good enough for a trend-shape
 // comparison without touching that fragile, already-bugfixed logic for the main figures.
 const previousProfitTrendData = useMemo(() => {
 const byDate: Record<string, { revenue: number; expenses: number }> = {};
 const bump = (date: string, field: 'revenue' | 'expenses', amount: number) => {
 if (!byDate[date]) byDate[date] = { revenue: 0, expenses: 0 };
 byDate[date][field] += amount;
 };
 previousPeriodSalesData.forEach((sale: any) => {
 bump(sale.date, 'revenue', (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0));
 });
 // Equipment and yearly subscriptions are left out of this trend-shape comparison (they'd
 // show as one-day spikes; the main chart spreads them instead).
 (context.inventory || []).forEach((item: any) => {
 if (!item?.date || item.date < previousPeriodRange.startDate || item.date > previousPeriodRange.endDate) return;
 if (effectiveStoreId && item.storeId !== effectiveStoreId) return;
 if (!isDatedProfitCost(item.category || '', 'inventory')) return;
 bump(item.date, 'expenses', item.totalCost || 0);
 });
 (context.overheads || []).forEach((item: any) => {
 if (!item?.date || item.date < previousPeriodRange.startDate || item.date > previousPeriodRange.endDate) return;
 if (effectiveStoreId && item.storeId !== effectiveStoreId) return;
 if (!isDatedProfitCost(item.category || '', 'overhead')) return;
 bump(item.date, 'expenses', item.amount || 0);
 });
 (context.fixedCosts || []).forEach((item: any) => {
 if (!item?.date || item.date < previousPeriodRange.startDate || item.date > previousPeriodRange.endDate) return;
 if (effectiveStoreId && item.storeId !== effectiveStoreId) return;
 if (!isDatedProfitCost(item.category || '', 'fixedcost')) return;
 bump(item.date, 'expenses', item.amount || 0);
 });
 return Object.entries(byDate)
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([date, d]) => ({ date, revenue: d.revenue, expenses: d.expenses, profit: d.revenue - d.expenses }));
 }, [previousPeriodSalesData, context.inventory, context.overheads, context.fixedCosts, previousPeriodRange, effectiveStoreId]);

 const profitChartDataWithPrev = useMemo(
 () => zipPrev(profitChartData as any[], previousProfitTrendData, ['revenue', 'expenses', 'profit']),
 [profitChartData, previousProfitTrendData]
 );

 // Previous-period totals for the Metrics Cards row's small "+/-% vs last period" line -
 // a deliberately simpler parallel calc (same spirit as previousProfitTrendData just
 // above) rather than trying to re-run the full calculateMetrics() a second time with a
 // different date range. calculateMetrics closes over a dozen other component-state-tied
 // memos (filteredSalesData, filteredInventoryData, activeSettlementDateRange, etc.) that
 // would all need parameterizing too to do this "properly" - too large/risky a refactor
 // for what's just a comparison indicator. Good enough for a trend-direction read, not
 // guaranteed to match the headline numbers to the rupee.
 const previousPeriodMetrics = useMemo(() => {
 // Same store-or-its-linked-production-house match as filteredInventoryData/
 // filteredOverheadData/filteredFixedCostsData above - without it, the "vs last month"
 // % on a single store's card swings wildly depending on whether that store's production
 // costs happen to be excluded (single store) or included (All Stores), instead of the
 // two views telling a consistent story.
 const inRange = (item: any) =>
 item?.date && item.date >= previousPeriodRange.startDate && item.date <= previousPeriodRange.endDate &&
 (effectiveStoreId
 ? (item.storeId === effectiveStoreId || (!!effectiveProductionHouseIdForCosts && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseIdForCosts))
 : true);

 const offlineRevenue = previousPeriodSalesData.reduce((sum: number, s: any) => sum + (s.paytmAmount || 0) + (s.cashAmount || 0), 0);
 const onlineRevenue = previousPeriodSalesData.reduce((sum: number, s: any) => sum + (s.onlineSales || 0), 0)
 + (context.onlineSalesData || []).filter(inRange).reduce((sum: number, s: any) => sum + (s.swiggySales || 0) + (s.zomatoSales || 0), 0);
 const revenue = offlineRevenue + onlineRevenue;

 // Same buckets as calculateMetrics (food / running / fixed / spread equipment).
 const prevInventory = (context.inventory || []).filter(inRange);
 const inventoryIn = (bucket: string) => prevInventory
 .filter((i: any) => costBucketFor(i.category || '', 'inventory') === bucket)
 .reduce((sum: number, i: any) => sum + (i.totalCost || 0), 0);
 const inventoryExp = inventoryIn('food');
 const overheadExp = (context.overheads || [])
 .filter(inRange)
 .filter((o: any) => !isCommissionEntry(o) && costBucketFor(o.category || '', 'overhead') === 'operating')
 .reduce((sum: number, o: any) => sum + (o.amount || 0), 0) + inventoryIn('operating');
 const prevSpreadEnd = previousPeriodRange.endDate > getTodayIST() ? getTodayIST() : previousPeriodRange.endDate;
 const fixedExp = (context.fixedCosts || []).filter(inRange)
 .filter((f: any) => costBucketFor(f.category || '', 'fixedcost') === 'fixed')
 .reduce((sum: number, f: any) => sum + (f.amount || 0), 0)
 + inventoryIn('fixed')
 + buildSpreadCosts(spreadSourceRecords, previousPeriodRange.startDate, prevSpreadEnd).total;

 const prevOnline = onlineCostsForRange(onlineCostIndex, storeOnlineSales, storeOnlinePayouts, previousPeriodRange.startDate, previousPeriodRange.endDate, getTodayIST());
 const commissionExpenses = prevOnline.commission;
 const adSpend = prevOnline.ads;

 const totalExpenses = inventoryExp + overheadExp + fixedExp + commissionExpenses + adSpend;
 const netProfit = revenue - totalExpenses;
 const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

 // Same "approved shortages" and "POS vs collected" checks as the Overview cards use,
 // just re-run against the previous period's own sales records.
 const cashDiscrepancy = previousPeriodSalesData
 .filter((sale: any) => sale.approvalRequired === false && sale.approvedBy)
 .reduce((sum: number, sale: any) => {
 const offset = sale.salesDiscrepancy !== undefined ? sale.salesDiscrepancy : (sale.cashOffset || 0);
 return sum + (offset < 0 ? Math.abs(offset) : 0);
 }, 0);
 const posSalesDiscrepancy = previousPeriodSalesData.reduce((sum: number, sale: any) => {
 const collected = (sale.cashAmount || 0) + (sale.paytmAmount || 0);
 const netOffline = sale.offlineSales || 0;
 const gap = netOffline - collected;
 return sum + (gap > 1 ? gap : 0);
 }, 0);

 // Paytm shortfalls (Cash & Reconciliation tab) - same stored paytmOffset field the
 // current period's cashReconciliationChartData sums, just for the previous period.
 const paytmDiscrepancy = previousPeriodSalesData.reduce((sum: number, sale: any) => {
 const offset = sale.paytmOffset || 0;
 return sum + (offset < 0 ? Math.abs(offset) : 0);
 }, 0);

 // Salary (Costs & Margins tab) - simplified vs. the current period's contract/permanent
 // split (which depends on cross-referencing each payout's employee record); just the
 // total payouts + personal-expense overhead in range is enough for a trend comparison.
 const salaryExpenses = (payoutsData || [])
 .filter((p: any) => p?.date >= previousPeriodRange.startDate && p.date <= previousPeriodRange.endDate)
 .reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
 + (context.overheads || [])
 .filter(inRange)
 .filter((o: any) => o.category === 'personal_expense')
 .reduce((sum: number, o: any) => sum + (o.amount || 0), 0);

 return {
 totalRevenue: revenue,
 offlineRevenue,
 onlineRevenue,
 totalExpenses,
 inventoryExpenses: inventoryExp,
 overheadExpenses: overheadExp,
 fixedCostsTotal: fixedExp,
 salaryExpenses,
 commissionExpenses,
 matchedOnlineRevenueForCommission: prevOnline.commissionBase,
 adSpend,
 netProfit,
 profitMargin,
 cashDiscrepancy,
 posSalesDiscrepancy,
 paytmDiscrepancy,
 };
 }, [previousPeriodSalesData, context.onlineSalesData, context.inventory, context.overheads, context.fixedCosts, onlineCostIndex, storeOnlineSales, storeOnlinePayouts, payoutsData, previousPeriodRange, effectiveStoreId, effectiveProductionHouseIdForCosts, spreadSourceRecords]);

 // % change vs. the previous period, and a short label naming what "previous period"
 // means for the currently selected filter - mirrors previousPeriodRange's own logic.
 const pctChange = (current: number, previous: number): number | null => {
 if (!previous) return null;
 return ((current - previous) / Math.abs(previous)) * 100;
 };
 const getPreviousPeriodLabel = () => {
 switch (timeFilter) {
 case 'today': return 'vs same day last week';
 case 'yesterday': return 'vs same day last week';
 case 'thisWeek': case 'lastWeek': return 'vs previous week';
 case 'thisMonth': return 'vs last month (same date)';
 case 'lastMonth': return 'vs month before';
 case 'custom': return 'vs previous period';
 default: return 'vs previous period';
 }
 };
 const renderPctChange = (current: number, previous: number, goodDirection: 'up' | 'down' = 'up') => {
 const change = pctChange(current, previous);
 if (change === null) return null;
 const isGood = goodDirection === 'up' ? change >= 0 : change <= 0;
 const rounded = Math.abs(change) < 0.1 ? '0.0' : Math.abs(change).toFixed(1);
 return (
 <div className={`flex items-center gap-1 text-xs mt-0.5 ${isGood ? 'text-emerald-700' : 'text-red-700'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span>{rounded}% {getPreviousPeriodLabel()}</span>
 </div>
 );
 };
 // Same as renderPctChange, but for the Overview cards' saturated gradient backgrounds -
 // dark-on-dark emerald/red text there would be unreadable, so this uses a translucent
 // white pill instead and leans on the arrow direction rather than a color swap for
 // good/bad (the card's own background color already carries that signal there).
 const renderPctChangeOnColor = (current: number, previous: number) => {
 // A zero previous-period value (e.g. no discrepancies logged last month) makes "%
 // change" undefined, not zero - pctChange returns null there and the card used to
 // just show nothing, which read as "comparison forgotten" rather than "there wasn't
 // one to compare against". Show that explicitly instead of going silent.
 if (!previous) {
 if (!current) return null; // both periods are genuinely zero - nothing worth saying
 return (
 <div className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 bg-white/20 rounded-full px-2 py-0.5 text-white">
 <span>New this period {getPreviousPeriodLabel()}</span>
 </div>
 );
 }
 const change = pctChange(current, previous);
 if (change === null) return null;
 const rounded = Math.abs(change) < 0.1 ? '0.0' : Math.abs(change).toFixed(1);
 return (
 <div className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 bg-white/20 rounded-full px-2 py-0.5 text-white">
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span>{rounded}% {getPreviousPeriodLabel()}</span>
 </div>
 );
 };

 // Recharts' default <Legend> draws every entry as the same solid line swatch - it
 // ignores strokeDasharray, so a "Revenue" entry and its dashed "Revenue (prev period)"
 // sibling render as two identical green marks with no way to tell which is which just
 // from the legend. This custom renderer draws the swatch itself, dashed for any entry
 // whose dataKey is the zipPrev "prev_X" convention used across the comparison charts.
 const renderPrevAwareLegend = (props: any) => {
 const payload = props?.payload;
 if (!payload || payload.length === 0) return null;
 return (
 <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2 list-none p-0">
 {payload.map((entry: any, index: number) => {
 const isPrev = typeof entry.dataKey === 'string' && entry.dataKey.startsWith('prev_');
 return (
 <li key={`legend-${entry.dataKey || entry.value || index}`} className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
 <svg width="18" height="10" className="flex-shrink-0" aria-hidden="true">
 <line
 x1="0" y1="5" x2="18" y2="5"
 stroke={entry.color}
 strokeWidth={2}
 strokeDasharray={isPrev ? '4 3' : undefined}
 />
 </svg>
 <span style={{ color: entry.color }}>{entry.value}</span>
 </li>
 );
 })}
 </ul>
 );
 };

 // Commission %/ad spend trend - grouped by the sales period covered by the settlement,
 // while settlementDate remains the payout/bank date in the reconciliation table.
 const commissionAdSpendChartData = useMemo(() => {
 const timeFiltered = context.aggregatorSettlements.filter((s: any) => settlementOverlapsAnalyticsRange(s, activeSettlementDateRange));
 const storeFiltered = effectiveStoreId ? timeFiltered.filter((s: any) => s.storeId === effectiveStoreId) : timeFiltered;
 // Commission % without the GST the platform collects and pays for us (utils/onlineCosts.ts).
 const byDate: Record<string, { grossSales: number; netCommission: number; adSpend: number }> = {};
 storeFiltered.forEach((s: any) => {
 const date = settlementAnalyticsReportingDate(s);
 const gst = s.gstCollected ?? ((s.grossSales || 0) * 5) / 105;
 if (!byDate[date]) byDate[date] = { grossSales: 0, netCommission: 0, adSpend: 0 };
 byDate[date].grossSales += (s.grossSales || 0) - gst;
 byDate[date].netCommission += (s.netCommission || 0) - gst;
 byDate[date].adSpend += s.adSpend || 0;
 });
 return Object.keys(byDate).sort().map(date => ({
 date,
 period: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
 commissionPct: byDate[date].grossSales > 0 ? Math.round((byDate[date].netCommission / byDate[date].grossSales) * 1000) / 10 : 0,
 adSpend: Math.round(byDate[date].adSpend)
 }));
 }, [context.aggregatorSettlements, effectiveStoreId, timeFilter, dateRange]);

 // Discount-by-promo-code and Channel Economics data now live in OnlineSalesTab.tsx,
 // alongside the settlements/orders they're derived from.

 // Channel mix over time - offline (from salesData) vs Zomato/Swiggy (from onlineSalesData).
 const channelMixChartData = useMemo(() => {
 const salesTimeFiltered = filterByTimeRange(context.salesData, 'date');
 const salesFiltered = effectiveStoreId ? salesTimeFiltered.filter((s: any) => s.storeId === effectiveStoreId) : salesTimeFiltered;
 const onlineTimeFiltered = filterByTimeRange(context.onlineSalesData, 'date');
 const onlineFiltered = effectiveStoreId ? onlineTimeFiltered.filter((s: any) => s.storeId === effectiveStoreId) : onlineTimeFiltered;

 const byDate: Record<string, { offline: number; zomato: number; swiggy: number }> = {};
 salesFiltered.forEach((s: any) => {
 if (!byDate[s.date]) byDate[s.date] = { offline: 0, zomato: 0, swiggy: 0 };
 byDate[s.date].offline += s.offlineSales || 0;
 });
 onlineFiltered.forEach((s: any) => {
 if (!byDate[s.date]) byDate[s.date] = { offline: 0, zomato: 0, swiggy: 0 };
 byDate[s.date].zomato += s.zomatoSales || 0;
 byDate[s.date].swiggy += s.swiggySales || 0;
 });
 return Object.keys(byDate).sort().map(date => ({
 date,
 period: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
 Offline: Math.round(byDate[date].offline),
 Zomato: Math.round(byDate[date].zomato),
 Swiggy: Math.round(byDate[date].swiggy)
 }));
 }, [context.salesData, context.onlineSalesData, effectiveStoreId, timeFilter, dateRange]);

 // Per-day cash/Paytm discrepancy trend for the Cash & Reconciliation tab. Uses the same
 // salesDiscrepancy-first, cashOffset-fallback rule as calculateCashDiscrepancy() above, so
 // the "losses this period" total on that tile matches the sum of the loss bars here.
 const cashReconciliationChartData = useMemo(() => {
 const timeFiltered = filterByTimeRange(context.salesData, 'date');
 const storeFiltered = effectiveStoreId ? timeFiltered.filter((s: any) => s.storeId === effectiveStoreId) : timeFiltered;
 const byDate: Record<string, { cashOffset: number; paytmOffset: number; storeIds: Set<string> }> = {};
 storeFiltered.forEach((s: any) => {
 if (!byDate[s.date]) byDate[s.date] = { cashOffset: 0, paytmOffset: 0, storeIds: new Set() };
 const cashOffset = s.salesDiscrepancy !== undefined ? s.salesDiscrepancy : (s.cashOffset || 0);
 byDate[s.date].cashOffset += cashOffset;
 byDate[s.date].paytmOffset += s.paytmOffset || 0;
 if (s.storeId) byDate[s.date].storeIds.add(s.storeId);
 });
 return Object.keys(byDate).sort().map(date => ({
 date,
 period: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
 'Cash Offset': Math.round(byDate[date].cashOffset),
 'Paytm Offset': Math.round(byDate[date].paytmOffset),
 storeCount: byDate[date].storeIds.size
 }));
 }, [context.salesData, effectiveStoreId, timeFilter, dateRange]);

 // Per-store discrepancy totals for the current period, worst first, so a cluster head
 // (viewing "All Stores") can see which store to look into.
 const cashReconciliationByStore = useMemo(() => {
 if (effectiveStoreId) return [];
 const timeFiltered = filterByTimeRange(context.salesData, 'date');
 const byStore: Record<string, { cashLoss: number; paytmLoss: number }> = {};
 timeFiltered.forEach((s: any) => {
 const storeId = s.storeId || 'unknown';
 if (!byStore[storeId]) byStore[storeId] = { cashLoss: 0, paytmLoss: 0 };
 const cashOffset = s.salesDiscrepancy !== undefined ? s.salesDiscrepancy : (s.cashOffset || 0);
 if (cashOffset < 0) byStore[storeId].cashLoss += Math.abs(cashOffset);
 if ((s.paytmOffset || 0) < 0) byStore[storeId].paytmLoss += Math.abs(s.paytmOffset);
 });
 return Object.entries(byStore)
 .map(([storeId, v]) => ({
 storeId,
 storeName: (context.stores || []).find((st: any) => st.id === storeId)?.name || storeId,
 cashLoss: Math.round(v.cashLoss),
 paytmLoss: Math.round(v.paytmLoss),
 totalLoss: Math.round(v.cashLoss + v.paytmLoss)
 }))
 .filter(row => row.totalLoss > 0)
 .sort((a, b) => b.totalLoss - a.totalLoss);
 }, [context.salesData, context.stores, effectiveStoreId, timeFilter, dateRange]);

 // Prepare expense breakdown by category
 const prepareExpenseBreakdown = () => {
 const categoryExpenses: any = {};
 const categoryItems: any = {}; // Track items by category
 const categoryTypes: any = {}; // Track type (inventory/overhead/fixed/salary)

 // Every record is grouped by where it really belongs, whichever form it was logged from:
 // only food & packaging shows under Inventory Items; supplies and tools logged as
 // inventory join their overhead category (labels are shared, so old "Cleaning &
 // Sanitation" items merge into "Cleaning Supplies"); equipment shows as this period's
 // spread share further down.
 const addToBreakdown = (item: any, source: 'inventory' | 'overhead' | 'fixedcost', amount: number) => {
 const category = item.category || 'Other';
 const bucket = costBucketFor(category, source);
 if (bucket === 'spread' || bucket === 'financing') return; // spread shown below; EMIs aren't a profit cost
 const canonical = canonicalCategory(category);
 // Combine Meat and Dairy into a single display category for Analytics
 const displayName = bucket === 'food' && (canonical === 'meat' || canonical === 'dairy')
 ? '🍖🧈 Meat & Dairy'
 : expenseCategoryLabel(category);
 if (!categoryExpenses[displayName]) {
 categoryExpenses[displayName] = 0;
 categoryItems[displayName] = [];
 // personal_expense is salary-deducted (already summed separately into
 // salaryExpenses above) — display it under Fixed Costs, not Operating.
 categoryTypes[displayName] = bucket === 'food' ? 'inventory'
 : bucket === 'fixed' || bucket === 'payroll_linked' ? 'fixed'
 : 'overhead';
 }
 categoryExpenses[displayName] += amount;
 categoryItems[displayName].push(item);
 };

 filteredInventoryData.forEach(item => addToBreakdown(item, 'inventory', item.totalCost || 0));

 // Add overhead expenses by category (EXCLUDING legacy commission entries)
 filteredOverheadData.forEach(item => {
 // Skip legacy commission entries - they're now calculated from online sales/payout data
 if (isCommissionEntry(item)) return;
 addToBreakdown(item, 'overhead', item.amount || 0);
 });

 // Add fixed costs by category
 filteredFixedCostsData.forEach(item => addToBreakdown(item, 'fixedcost', item.amount || 0));

 // This period's share of equipment purchases, yearly subscriptions and bulk packaging stock
 Object.entries(metrics.spreadByCategory || {}).forEach(([category, amount]) => {
 if (amount <= 0) return;
 const displayName = expenseCategoryLabel(category);
 categoryExpenses[displayName] = (categoryExpenses[displayName] || 0) + amount;
 categoryItems[displayName] = categoryItems[displayName] || [];
 categoryTypes[displayName] = category === 'packaging_bulk' ? 'inventory' : 'fixed';
 });

 // Add salaries separately (contract + permanent)
 if (metrics.salaryExpenses > 0) {
 categoryExpenses['💰 Salaries'] = metrics.salaryExpenses;
 categoryItems['💰 Salaries'] = []; // No detailed breakdown for salaries in this view
 categoryTypes['💰 Salaries'] = 'salary';
 }

 // Add aggregator commission as a separate category
 if (metrics.commissionExpenses > 0) {
 categoryExpenses['🍔 Aggregator Commission'] = metrics.commissionExpenses;
 categoryItems['🍔 Aggregator Commission'] = []; // Calculated from online sales/payout data
 categoryTypes['🍔 Aggregator Commission'] = 'commission';
 }
 if (metrics.adSpend > 0) {
 categoryExpenses['📣 Zomato/Swiggy Ads'] = metrics.adSpend;
 categoryItems['📣 Zomato/Swiggy Ads'] = [];
 categoryTypes['📣 Zomato/Swiggy Ads'] = 'commission';
 }
 
 // Add interest expense as a separate category
 if (metrics.interestExpenses > 0) {
 categoryExpenses['💸 Loan Interest'] = metrics.interestExpenses;
 categoryItems['💸 Loan Interest'] = []; // Calculated from accrued interest on loans
 categoryTypes['💸 Loan Interest'] = 'interest';
 }

 // Create breakdown - show all categories without grouping
 let breakdown = Object.keys(categoryExpenses).map(displayName => {
 return {
 name: displayName,
 value: categoryExpenses[displayName],
 percentage: parseFloat(((categoryExpenses[displayName] / metrics.totalExpenses) * 100).toFixed(1)),
 items: categoryItems[displayName] || [],
 type: categoryTypes[displayName]
 };
 });

 // Sort by value (highest to lowest) - No grouping, show all categories for complete visibility
 return breakdown.sort((a, b) => b.value - a.value);
 };

 const expenseBreakdown = prepareExpenseBreakdown();

 // ---- Unit Economics: what's inside each cost line on the ladder. Same buckets and sources as
 // calculateMetrics, so each detail sheet adds up to the line it was opened from. ----
 const buildCostLine = (line: CostLineKey): { title: string; groups: CostLineGroup[]; note?: string } => {
 const groups = new Map<string, CostLineGroup>();
 const add = (groupLabel: string, entry: { id: string; date: string; name: string; detail?: string; amount: number }) => {
 if (!entry.amount) return;
 const g = groups.get(groupLabel) || { label: groupLabel, amount: 0, entries: [] };
 g.amount += entry.amount;
 g.entries.push(entry);
 groups.set(groupLabel, g);
 };
 const label = (category?: string) => expenseCategoryLabel(category || 'Other');
 const fromInventory = (x: any) => ({ id: `inv-${x.id}`, date: x.date, name: x.itemName || label(x.category), detail: x.quantity ? `${x.quantity} ${x.unit || ''}`.trim() : undefined, amount: x.totalCost || 0 });
 const fromOverhead = (x: any) => ({ id: `ovh-${x.id}`, date: x.date, name: x.description || label(x.category), detail: x.employeeName || undefined, amount: x.amount || 0 });
 const fromFixed = (x: any) => ({ id: `fix-${x.id}`, date: x.date, name: x.description || label(x.category), amount: x.amount || 0 });
 const today = getTodayIST();
 const spreadEnd = itemPerfDateRange.endDate > today ? today : itemPerfDateRange.endDate;
 // Spread purchases show this period's share, next to what was paid.
 const addSpread = (keep: (canonical: string) => boolean) => {
 spreadSourceRecords.filter((r) => keep(canonicalCategory(r.category))).forEach((r, i) => {
 const share = buildSpreadCosts([r], itemPerfDateRange.startDate, spreadEnd).total;
 if (share < 0.5) return;
 add(label(r.category), {
 id: `spr-${r.id || i}`, date: r.date, name: r.name || label(r.category),
 detail: `this period's share of ₹${Math.round(r.amount).toLocaleString('en-IN')}`, amount: share,
 });
 });
 };
 const inventoryBucket = (x: any) => costBucketFor(x.category || '', 'inventory');
 const overheadBucket = (x: any) => costBucketFor(x.category || '', 'overhead');
 const groupList = () => [...groups.values()];
 switch (line) {
 case 'food':
 filteredInventoryData.filter((x) => inventoryBucket(x) === 'food' && canonicalCategory(x.category || '') !== 'packaging')
 .forEach((x) => add(label(x.category), fromInventory(x)));
 return { title: 'Food ingredients', groups: groupList() };
 case 'packaging':
 filteredInventoryData.filter((x) => canonicalCategory(x.category || '') === 'packaging').forEach((x) => add(label(x.category), fromInventory(x)));
 addSpread((c) => c === 'packaging_bulk');
 return { title: 'Packaging', groups: groupList(), note: 'Bulk box and tray orders are counted evenly over the 120 days they last.' };
 case 'marketing':
 filteredOverheadData.filter((x) => !isCommissionEntry(x) && canonicalCategory(x.category || '') === 'marketing').forEach((x) => add(label(x.category), fromOverhead(x)));
 return { title: 'Marketing', groups: groupList() };
 case 'occupancy':
 filteredFixedCostsData.filter((x) => costBucketFor(x.category || '', 'fixedcost') === 'fixed').forEach((x) => add(label(x.category), fromFixed(x)));
 filteredInventoryData.filter((x) => inventoryBucket(x) === 'fixed').forEach((x) => add(label(x.category), fromInventory(x)));
 filteredOverheadData.filter((x) => !isCommissionEntry(x) && overheadBucket(x) === 'fixed').forEach((x) => add(label(x.category), fromOverhead(x)));
 return { title: 'Rent, electricity & internet', groups: groupList(), note: 'Counted on the day each bill was paid. Net Normalized Profit spreads rent, electricity and salaries evenly over the month instead.' };
 case 'otherOpex':
 filteredOverheadData.filter((x) => !isCommissionEntry(x) && overheadBucket(x) === 'operating' && canonicalCategory(x.category || '') !== 'marketing')
 .forEach((x) => add(label(x.category), fromOverhead(x)));
 filteredInventoryData.filter((x) => inventoryBucket(x) === 'operating').forEach((x) => add(label(x.category), fromInventory(x)));
 addSpread((c) => c === 'software_subscription');
 return { title: 'Other running costs', groups: groupList() };
 case 'depreciation':
 addSpread((c) => c !== 'packaging_bulk' && c !== 'software_subscription');
 return { title: 'Equipment & scooter', groups: groupList(), note: 'Each purchase is counted evenly over 3 years; this is the share that falls in the period.' };
 case 'shortages':
 filteredSalesData.filter((x: any) => x.approvalRequired === false && x.approvedBy).forEach((x: any) => {
 const offset = x.salesDiscrepancy !== undefined ? x.salesDiscrepancy : (x.cashOffset || 0);
 if (offset < 0) add('Approved cash shortages', { id: `sale-${x.id}`, date: x.date, name: 'Cash short at closing', detail: `approved by ${x.approvedBy}`, amount: Math.abs(offset) });
 });
 return { title: 'Approved cash shortages', groups: groupList() };
 default:
 return { title: '', groups: [] };
 }
 };
 // Commission, salaries and interest already have purpose-built breakdowns.
 const openCostLine = (line: CostLineKey) => {
 if (line === 'commission' || line === 'ads') {
 setSelectedExpenseCategory({ category: '🍔 Aggregator Commission', items: [], amount: metrics.commissionExpenses + metrics.adSpend, type: 'commission' });
 } else if (line === 'staff') {
 setSelectedExpenseCategory({ category: '💰 Salaries', items: [], amount: metrics.salaryExpenses, type: 'salary' });
 } else if (line === 'interest') {
 setSelectedExpenseCategory({ category: '💸 Loan Interest', items: [], amount: metrics.interestExpenses, type: 'interest' });
 } else {
 setCostLine(line);
 }
 };

 const COLORS = ['#f43f5e', '#38bdf8', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#fb923c', '#14b8a6', '#10b981', '#f59e0b'];

 // Calculate total approved cash discrepancies (losses only - negative cashOffset)
 const calculateCashDiscrepancy = () => {
 // IMPORTANT: Use filteredSalesData which is already time+store filtered
 // Use salesDiscrepancy (settled value) instead of cashOffset to prevent recalculation when inventory is added later
 const totalLoss = filteredSalesData
 .filter(sale => sale.approvalRequired === false && sale.approvedBy) // Only approved
 .reduce((sum, sale) => {
 // Use salesDiscrepancy if available (locked at settlement), fallback to cashOffset for old data
 const offset = sale.salesDiscrepancy !== undefined ? sale.salesDiscrepancy : (sale.cashOffset || 0);
 // Only count negative offsets as losses
 return sum + (offset < 0 ? Math.abs(offset) : 0);
 }, 0);
 return totalLoss;
 };

 const totalCashDiscrepancy = calculateCashDiscrepancy();
 const unrealizedProfit = metrics.netProfit;
 // carryForward.amount is zero or negative: a loss brought forward lowers this month's realized profit.
 const realizedProfit = unrealizedProfit - totalCashDiscrepancy;
 // Net realised profit = this month's profit after a loss brought forward from earlier months.
 const netRealisedProfit = realizedProfit + carryForward.amount;
 // Net normalized profit = net realised profit (after any loss brought forward) with the lumpy fixed costs (rent, electricity, permanent
 // salaries incl. variable pay) swapped from "when it was paid" to "an even daily share of the
 // month it belongs to, up to today". So payday no longer wipes out the month's profit.
 const normalizedFixedRecorded = metrics.rentExpenses + metrics.electricityExpenses + metrics.permanentEmployeeExpenses;
 const normalizedFixedAccrued = Object.values(fixedCostAccrual?.byDate || {}).reduce((sum, d) => sum + d.amount, 0);
 const netNormalizedProfit = netRealisedProfit + normalizedFixedRecorded - normalizedFixedAccrued;
 const normalizedDaysCounted = Object.keys(fixedCostAccrual?.byDate || {}).length;
 const normalizedMonthPool = timeFilter === 'thisMonth' && normalizedDaysCounted > 0
 ? Math.round(normalizedFixedAccrued * new Date(Date.UTC(Number(getTodayIST().slice(0, 4)), Number(getTodayIST().slice(5, 7)), 0)).getUTCDate() / normalizedDaysCounted)
 : 0;
 const normalizedCardNote = `Fixed costs spread daily: ₹${Math.round(normalizedFixedAccrued).toLocaleString('en-IN')} accrued${normalizedMonthPool > 0 ? ` for ${normalizedDaysCounted} days (full month ≈ ₹${normalizedMonthPool.toLocaleString('en-IN')})` : ''} vs ₹${Math.round(normalizedFixedRecorded).toLocaleString('en-IN')} paid${fixedCostAccrual && fixedCostAccrual.estimatedAmount > 0 ? `; ₹${Math.round(fixedCostAccrual.estimatedAmount).toLocaleString('en-IN')} of it estimated from last month's base salaries, rent and electricity` : ''}`;

 // POS sales discrepancy: how much Cash + Paytm (entered by the store incharge) falls
 // short of the Net offline sales the POS reported for that day - duplicate KOTs, cash
 // lost at the counter, or an order that went unpaid during rush hour. Distinct from the
 // Cash Discrepancy above (which is the counted-cash-vs-expected check); this one flags
 // when the POS's own sales total doesn't reconcile against what was actually collected.
 const calculatePosSalesDiscrepancy = () => {
 return filteredSalesData.reduce((sum, sale) => {
 const collected = (sale.cashAmount || 0) + (sale.paytmAmount || 0);
 const netOffline = sale.offlineSales || 0;
 const gap = netOffline - collected;
 return sum + (gap > 1 ? gap : 0);
 }, 0);
 };

 const totalPosSalesDiscrepancy = calculatePosSalesDiscrepancy();

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
 console.log('🏭 Production Analytics - Production House Selector Changed:', newValue);
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
 console.log('🔄 Recalibration button clicked!');
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
 {activeView === 'profit' && (
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
 <ResponsiveContainer width="100%" height={220}>
 <LineChart data={commissionAdSpendChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} unit="%" />
 <Tooltip formatter={(value: number) => [`${value}%`, 'Commission']} />
 <Line type="monotone" dataKey="commissionPct" stroke="#f97316" strokeWidth={2} name="Commission %" dot={{ r: 3 }} />
 </LineChart>
 </ResponsiveContainer>
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
 <ResponsiveContainer width="100%" height={220}>
 <BarChart data={commissionAdSpendChartData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} />
 <Tooltip content={<CustomTooltip />} />
 <Bar dataKey="adSpend" fill="#0ea5e9" name="Ad Spend" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
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

 {/* Unit Economics View - the same P&L as the cards above, laid out as a margin ladder */}
 {activeView === 'unit-economics' && (() => {
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
 </div>
 );
 })()}

 {/* Expense Breakdown View */}
 {activeView === 'expense' && (
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
 <ResponsiveContainer width="100%" height={240}>
 <LineChart data={profitChartData.map(d => ({ ...d, expensePct: d.revenue > 0 ? Math.round((d.expenses / d.revenue) * 1000) / 10 : 0 }))}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="period" tick={{ fontSize: 11 }} />
 <YAxis tick={{ fontSize: 11 }} unit="%" />
 <Tooltip formatter={(value: number) => [`${value}%`, 'Expenses']} />
 <Line type="monotone" dataKey="expensePct" stroke="#e11d48" strokeWidth={2} name="Expenses % of Revenue" dot={{ r: 3 }} />
 </LineChart>
 </ResponsiveContainer>
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

 {/* Cash & Reconciliation View - trend of the cash/Paytm discrepancy work built on the
 Sales page, so problem stores/days surface here instead of only one day at a time. */}
 {activeView === 'cash-reconciliation' && (
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

 {/* Sales Analytics View */}
 {activeView === 'sales' && (
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
 <ResponsiveContainer width="100%" height={420}>
 <BarChart data={itemPerformanceData.top10} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={10}>
 <CartesianGrid strokeDasharray="3 3" horizontal={false} />
 <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
 <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 9 }} tickFormatter={(v: string) => truncateChartLabel(v, 16)} interval={0} />
 <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']} />
 <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
 </BarChart>
 </ResponsiveContainer>
 )}
 </div>

 <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Top Items by Channel</h3>
 <p className="text-xs sm:text-sm text-gray-600 mb-4">Offline vs Zomato vs Swiggy revenue</p>
 {itemPerformanceData.top10.length === 0 ? (
 <div className="text-sm text-gray-500 py-8 text-center">No item sales data for this period.</div>
 ) : (
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

 <SalesDataComponent context={context} selectedStoreId={effectiveStoreId} />
 </div>
 )}
 </div>
 )}

 {/* Overview - a single glanceable dashboard: revenue/profit trend plus the worst
 current value in each of the areas that most need watching, so opening Analytics
 immediately surfaces what needs attention instead of digging through tabs. */}
 {activeView === 'overview' && (
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
 </div>
 <div>
 <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Revenue share (period)</p>
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
 <ResponsiveContainer width="100%" height={260}>
 <PieChart>
 <Pie data={paymentModeBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(entry: any) => entry.name}>
 {paymentModeBreakdownData.map((d, i) => <Cell key={i} fill={d.color} />)}
 </Pie>
 <Tooltip formatter={(value: number) => `₹${value.toLocaleString()}`} />
 </PieChart>
 </ResponsiveContainer>
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
 <DataCapture context={context} selectedStoreId={selectedStoreId} />
 </div>
 )}
 </div>
 </div>
 )}

 {/* Production Analytics View */}
 {activeView === 'production' && (
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
 
 console.log('🏭 Production Summary Cards Filter Debug:');
 console.log(' - analyticsMode:', analyticsMode);
 console.log(' - selectedProductionHouseId:', selectedProductionHouseId);
 console.log(' - effectiveStoreId:', effectiveStoreId);
 console.log(' - filterById:', filterById);
 console.log(' - Total production records:', productionData.length);
 
 // Find the selected production house by its id
 const selectedProductionHouse = filterById 
 ? context.productionHouses?.find(ph => ph.id === filterById)
 : null;
 
 console.log(' - Selected production house object:', selectedProductionHouse);
 
 // Get date range bounds for filtering
 const { startDate, endDate } = getDateRangeBounds();
 
 console.log('📅 Date Range Filter:', {
 rangeType: productionDateRange,
 startDate,
 endDate,
 customStart: customStartDate,
 customEnd: customEndDate
 });
 
 const filteredProduction = productionData.filter(p => {
 // Filter by date range first
 if (p.date < startDate || p.date > endDate) {
 console.log('❌ Date filter excluded record:', { date: p.date, startDate, endDate });
 return false;
 }
 
 if (!filterById) return true; // No filter selected, show all
 
 console.log('🔎 Filtering production record:', {
 recordStoreId: p.storeId,
 recordProductionHouseId: p.productionHouseId,
 filterById,
 date: p.date
 });
 
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
 console.log(' 🔎 Production Summary - Store lookup:', {
 pStoreId: p.storeId,
 localStoresCount: stores.length,
 contextStoresCount: context.stores?.length || 0,
 allStoresCount: allStores.length,
 foundStore: store ? { id: store.id, name: store.name, productionHouseId: store.productionHouseId } : null
 });
 recordProductionHouseId = store?.productionHouseId || undefined;
 }
 
 const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
 
 console.log(' 🔍 Checking record:', {
 recordId: p.id.slice(0, 8),
 recordStoreId: p.storeId,
 recordProductionHouseId: p.productionHouseId,
 resolvedProductionHouseId: recordProductionHouseId,
 phId,
 filterById,
 matchesStoreId,
 matchesProductionHouseId,
 localStores: stores.length,
 match: matchesStoreId || matchesProductionHouseId || phId === filterById
 });
 
 // Match if ANY of these are true
 const matches = matchesStoreId || matchesProductionHouseId || phId === filterById;
 
 return matches;
 });
 
 console.log(' - Filtered production records:', filteredProduction.length);

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
 </div>

 {/* Period share by momo type */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-4">Production Mix (This Period)</h3>
 {hasAnyOutput ? (
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
 ) : (
 <div className="h-[280px] flex items-center justify-center text-sm text-gray-500">No production logged for this period</div>
 )}
 </div>

 {/* Raw material yield efficiency */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Raw Material Yield</h3>
 <p className="text-xs text-gray-500 mb-3">Pieces produced per kg of raw material used (dough+stuffing for momos, batter+coating for kurkure) · higher is more efficient</p>
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
 </div>

 {/* Wastage rate as a % of total raw material, so it's comparable across days
 regardless of production volume - complements the raw-kg trend charts below. */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-1">Wastage Rate</h3>
 <p className="text-xs text-gray-500 mb-3">Wasted raw material as a % of total raw material used that day · lower is better</p>
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
 console.log('🔘 Manage Items button clicked in Analytics');
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
 console.log('🏭 Production House Selector Changed:', newValue);
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
 
 console.log('🏭 Production House Stock Status Filter Debug:');
 console.log(' - analyticsMode:', analyticsMode);
 console.log(' - selectedProductionHouseId:', selectedProductionHouseId);
 console.log(' - effectiveProductionHouseId:', effectiveProductionHouseId);
 
 // Find the selected production house by its id
 const selectedProductionHouseForStock = effectiveProductionHouseId 
 ? context.productionHouses?.find(ph => ph.id === effectiveProductionHouseId)
 : null;
 
 console.log(' - Selected production house for stock:', selectedProductionHouseForStock);
 console.log(' - Total production records available:', productionData.length);
 if (productionData.length > 0 && productionData.length <= 3) {
 console.log(' - All production records:', productionData.map(p => ({
 id: p.id,
 storeId: p.storeId,
 productionHouseId: p.productionHouseId,
 date: p.date
 })));
 }
 
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
 
 console.log(' - Filtered production for stock status:', filteredProduction.length);
 if (filteredProduction.length > 0) {
 console.log(' - Sample production record:', {
 id: filteredProduction[0].id,
 storeId: filteredProduction[0].storeId,
 productionHouseId: filteredProduction[0].productionHouseId,
 date: filteredProduction[0].date
 });
 }

 // Fixed current-month activity for this stock view. Stock Available itself remains
 // current stock, so a separate date filter would make the card misleading.
 const nowForMonth = new Date();
 const currentMonth = `${nowForMonth.getFullYear()}-${String(nowForMonth.getMonth() + 1).padStart(2, '0')}`;
 const monthlyFilteredProduction = filteredProduction.filter(p => p.date.startsWith(currentMonth));
 
 console.log(' - Monthly filtered production:', monthlyFilteredProduction.length, 'for month:', currentMonth);
 if (monthlyFilteredProduction.length > 0) {
 console.log(' - Sample monthly production record:', monthlyFilteredProduction[0]);
 }

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
 console.log('🔧 Resolved production house UUID:', {
 userStoreId: effectiveProductionHouseId,
 resolvedUUID: productionHouseUUID
 });
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
 console.log('❌ Filtered out request - wrong month:', {
 requestId: req.id.slice(0, 8),
 requestDate,
 currentMonth,
 matches: requestDate?.startsWith(currentMonth)
 });
 return false;
 }
 
 // Find the store that made this request
 // Use local stores state (loaded in useEffect) or fallback to context.stores
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 const requestingStore = allStores.find(s => s.id === req.storeId);
 
 // Filter by production house if one is selected
 if (productionHouseUUID) {
 const matches = requestingStore?.productionHouseId === productionHouseUUID;
 console.log('🔍 Checking production request:', {
 requestId: req.id.slice(0, 8),
 storeId: req.storeId,
 storeName: requestingStore?.name,
 storeProductionHouseId: requestingStore?.productionHouseId,
 productionHouseUUID,
 deliveredDate: req.deliveredAt,
 availableStores: allStores.length,
 matches
 });
 return matches;
 }
 
 // If no production house selected, show all
 return true;
 }) || [];

 console.log('🏭 Production Stock Calculation:', {
 effectiveProductionHouseId,
 isProductionIncharge: context.user?.designation === 'production_incharge',
 totalProductionRequests: context.productionRequests?.length || 0,
 deliveredRequests: context.productionRequests?.filter(r => r.status === 'delivered').length || 0,
 fulfilledRequestsCount: fulfilledRequests.length,
 stores: context.stores?.map(s => ({ id: s.id, name: s.name, productionHouseId: s.productionHouseId })) || [],
 filteredProductionRecords: filteredProduction.length,
 allProductionData: productionData.map(p => ({
 id: p.id.slice(0, 8),
 date: p.date,
 productionHouseId: p.productionHouseId,
 storeId: p.storeId,
 resolvedId: p.productionHouseId || p.storeId
 })),
 sampleRequest: fulfilledRequests[0],
 sampleRequestData: fulfilledRequests[0] ? {
 id: fulfilledRequests[0].id,
 storeId: fulfilledRequests[0].storeId,
 requestDate: fulfilledRequests[0].requestDate,
 status: fulfilledRequests[0].status,
 chickenMomos: fulfilledRequests[0].chickenMomos,
 vegMomos: fulfilledRequests[0].vegMomos
 } : null
 });

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
 
 console.log('��� Stock Calculation with Carry-Forward:');
 console.log(' previousMonthStock (raw):', previousMonthStock);
 console.log(' Opening Balance (processed):', openingBalance);
 console.log(' Current Month Production (APPROVED ONLY):', totalProduced);
 console.log(' Current Month Sent to Stores:', totalSentToStores);
 console.log(' 📊 Production Records Debug:');
 console.log(' Total monthly production records:', monthlyFilteredProduction.length);
 console.log(' Approved monthly production records:', monthlyFilteredProduction.filter(p => p.approvalStatus === 'approved').length);
 console.log(' Sample production records:', monthlyFilteredProduction.slice(0, 3).map(p => ({
 id: p.id.slice(0, 8),
 date: p.date,
 approvalStatus: p.approvalStatus,
 hasData: !!(p as any).data,
 dataKeys: (p as any).data ? Object.keys((p as any).data) : [],
 sampleValue: (p as any).data ? (p as any).data[Object.keys((p as any).data)[0]] : null
 })));
 
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

 console.log(' Final Stock:', productionHouseStock);
 
 // Store calculated stock globally for the recalibration modal
 (window as any).__currentProductionHouseStock = productionHouseStock;

 // Get all finished product inventory items for this production house or global
 const finishedProducts = context.inventoryItems?.filter(item => 
 item.category === 'finished_product' && 
 item.isActive &&
 (item.linkedEntityType === 'global' || 
 (item.linkedEntityType === 'production_house' && item.linkedEntityId === effectiveProductionHouseId))
 ) || [];
 
 console.log('📦 Finished Products for Stock Display:', finishedProducts.map(item => {
 const stockKey = getStockKey(item.name); // Convert to camelCase base key
 return {
 name: item.name,
 displayName: item.displayName,
 stock: productionHouseStock[stockKey]
 };
 }));

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

 console.log('🗑️ Wastage Analysis Debug:', {
 analyticsMode,
 selectedProductionHouseId,
 filterById,
 mappedStoreIds,
 totalProductionRecords: productionData.length,
 filteredProductionRecords: filteredProduction.length,
 recordsWithWastage: recordsWithWastage.length,
 totalWastageAllTime,
 sampleWastageData: filteredProduction.slice(0, 3).map(p => ({
 date: p.date,
 storeId: p.storeId,
 productionHouseId: p.productionHouseId,
 wastage: p.wastage
 }))
 });

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
 const date = new Date(p.date);
 const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
 const weekEnd = new Date(weekStart);
 weekEnd.setDate(weekEnd.getDate() + 6);
 key = weekStart.toISOString().split('T')[0];
 // Format as "Dec 21 - Dec 27"
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
 console.log('🔍 SOP Compliance Filter - analyticsMode:', analyticsMode);
 console.log('🔍 SOP Compliance Filter - selectedProductionHouseId:', selectedProductionHouseId);
 console.log('🔍 SOP Compliance Filter - effectiveStoreId:', effectiveStoreId);
 console.log('🔍 SOP Compliance Filter - filterById:', filterById);
 console.log('🔍 SOP Compliance Filter - user designation:', context.user?.designation);
 console.log('🔍 SOP Compliance Filter - sopComplianceDate:', sopComplianceDate);
 console.log('🔍 SOP Compliance Filter - All production dates:', [...new Set(productionData.map(p => p.date))]);
 console.log('🔍 SOP Compliance Filter - Total production records:', productionData.length);
 console.log('🔍 SOP Compliance Filter - Approved production records:', productionData.filter(p => p.approvalStatus === 'approved').length);
 
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
 
 console.log('🔍 SOP Compliance - Checking production record:', {
 date: p.date,
 storeId: p.storeId,
 productionHouseId: p.productionHouseId,
 approvalStatus: p.approvalStatus,
 filterById,
 mappedStoreIds,
 matchesStoreId,
 matchesProductionHouseId,
 matchesFallback,
 matchesMappedStore,
 matchesDate,
 isApproved,
 passesFilter,
 finalResult
 });
 
 if (filterById && !passesFilter) {
 return false;
 }
 return matchesDate && isApproved;
 });
 
 console.log(`🔍 SOP Compliance - Date ${dateStr}: Found ${dayProduction.length} production records`);

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

 {/* Production Requests View - the Recalibration sub-tab that used to live here has
 moved into ProductionRequests itself, as a "Recalibration" button beside "Manage
 Items" in the Store Stock Status card. */}
 {activeView === 'production-requests' && (
 <div>
 <ProductionRequests
 context={context}
 highlightRequestId={highlightRequestId || null}
 selectedStoreId={effectiveStoreId}
 onNavigateToManageItems={onNavigateToManageItems}
 />
 </div>
 )}

 {/* Trends & Growth - weekday pattern, item mix, festival effects, calendar, AI growth ideas */}
 {activeView === 'trends' && analyticsMode === 'store' && (
 <TrendsGrowth accessToken={context.user?.accessToken || ''} storeId={insightsStoreId} canManage={canManageInsights} />
 )}

 {/* Store-Production SLA Analysis View - its own top-level Store Analytics tab (not a modal
 opened from Stock Requests), covering fulfillment and pipeline timing across
 production requests. */}
 {activeView === 'stock-request-analysis' && (
 <div>
 <StockAnalysis
 requests={stockAnalysisRequests}
 finishedProducts={stockAnalysisFinishedProducts}
 salesData={stockAnalysisSalesData}
 storeIds={effectiveStoreId ? [effectiveStoreId] : (context.stores || []).map((st) => st.id)}
 accessToken={context.user?.accessToken}
 />
 </div>
 )}

 {/* Recalibration Reports View - Production Analytics (unrelated to the Stock
 Requests sub-tab above - this is the production-house side, still its own tab) */}
 {activeView === 'recalibration-reports' && (
 <div>
 <RecalibrationReports
 context={context}
 selectedStoreId={analyticsMode === 'production' ? selectedProductionHouseId : selectedStoreId}
 onOpenRecalibration={() => setShowRecalibration(true)}
 locationType="production_house"
 />
 </div>
 )}
 
 {/* Monthly Stock Recalibration Modal */}
 {showRecalibration && (
 <MonthlyStockRecalibration
 context={context}
 selectedStoreId={analyticsMode === 'production' ? selectedProductionHouseId : effectiveStoreId}
 currentCalculatedStock={analyticsMode === 'production' ? (window as any).__currentProductionHouseStock : undefined}
 onClose={() => {
 setShowRecalibration(false);
 // Refresh opening balance data after recalibration
 if (analyticsMode === 'production') {
 console.log('🔄 Recalibration modal closed - refreshing data...');
 // Clear existing opening balance to force refetch
 setPreviousMonthStock(null);
 setLatestRecalibration(null);
 // Longer delay to ensure backend has processed and committed the save
 setTimeout(() => {
 console.log('⏰ Timeout complete - fetching latest recalibration...');
 fetchRecalibrationAndCalculateOpeningBalance();
 }, 1500);
 }
 }}
 onSaveSuccess={() => {
 console.log('✅ Recalibration saved successfully - triggering immediate refresh!');
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
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
 className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
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

 {/* Expense Breakdown Modal */}
 {selectedExpenseCategory && selectedExpenseCategory.type === 'salary' && (
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
 </div>
 );
}
