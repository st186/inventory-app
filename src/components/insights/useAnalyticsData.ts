// Everything Insights (Analytics) computes: the data it loads, the filters it keeps and every
// figure its tabs show. Moved here verbatim from Analytics.tsx (WP2 step 1, no change in numbers);
// the tabs in ./tabs read it through the AnalyticsData object this returns.
import { useState, useEffect, useMemo, useCallback } from 'react';
import * as api from '../../utils/api';
import { getTodayIST, addDays, utcToIST } from '../../utils/timezone';
import { InventoryContextType } from '../../App';
import { employeeBelongsToStore } from '../../utils/entityAccess';
import { setScreenTab } from '../../utils/screenContext';
import { buildSmoothedCosts } from '../../utils/dailyCostSmoothing';
import { buildSalaryBreakdown, monthAdd, monthLabel } from '../../utils/salaryBreakdown';
import { costBucketFor, canonicalCategory, expenseCategoryLabel, isSpreadCategory, isDatedProfitCost } from '../../utils/inventoryData';
import { buildSpreadCosts } from '../../utils/spreadCosts';
import { buildOnlineCostIndex, onlineCostsForRange } from '../../utils/onlineCosts';
import { normalizePnl, type PnlBreakdown, type CostLineKey } from '../unitEconomicsModel';
import { buildPnl } from '../../utils/pnl';
import { type CostLineGroup } from '../CostLineModal';
import { counterValueByChannel } from '../../utils/channelFoodValue';
import { getSupabaseClient } from '../../utils/supabase/client';
import { logger } from '../../utils/logger';
import { eventsApi } from '../../utils/eventsApi';
import { countUTC, lastCount } from '../stock/countMath';
import { countHistory } from '../stock/countData';
import { getSettlementPeriod, settlementOverlapsPeriod } from '../../utils/settlementPeriod';

export interface AnalyticsProps {
 context: InventoryContextType;
 selectedStoreId?: string | null;
 highlightRequestId?: string | null;
 // A notification can open a tab directly: 'trends' (weekly festival-day check) or
 // 'production-requests' (stock request notifications, since the old Stock Requests page went).
 initialTab?: string | null;
 onNavigateToManageItems?: () => void;
 // Production Management no longer has its own top-level nav entry - it's opened from
 // here instead, same idea as onNavigateToManageItems above.
 onNavigateToProductionManagement?: () => void;
}


export type TimeFilter = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastWeek' | 'lastMonth' | 'custom';
// What the period picker offers. "Last 6 months" and "This year" are ready-made custom ranges:
// every period calculation sees 'custom' with that range (see presetDateRange).
export type TimeFilterChoice = TimeFilter | 'last6Months' | 'thisYear';
export type WastageTimeFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export const TIME_FILTER_OPTIONS: { value: TimeFilterChoice; label: string }[] = [
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
export function presetDateRange(choice: TimeFilterChoice): { from: string; to: string } | null {
 const today = getTodayIST();
 if (choice === 'thisYear') return { from: `${today.slice(0, 4)}-01-01`, to: today };
 if (choice === 'last6Months') {
 const [y, m] = today.split('-').map(Number);
 const start = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10);
 return { from: start, to: today };
 }
 return null;
}

// The selected period as an inclusive IST calendar window (YYYY-MM-DD strings). Every card,
// chart and fetch on this page reads its window from here so they agree on the same days:
// weeks run Monday-Sunday, "last month" is computed from the 1st (setMonth(-1) on the 29th-31st
// overflowed into the wrong month), and dates are compared as strings - new Date('YYYY-MM-DD')
// is 05:30 IST, which dropped the first day of ranges compared at local midnight.
export type PeriodWindow = { startDate: string; endDate: string };
export function periodWindow(filter: TimeFilter, range: { from: string; to: string }): PeriodWindow {
 const today = getTodayIST();
 const [y, m, d] = today.split('-').map(Number);
 const daysSinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
 const weekStart = addDays(today, -daysSinceMonday);
 switch (filter) {
 case 'today':
 return { startDate: today, endDate: today };
 case 'yesterday': {
 const yesterday = addDays(today, -1);
 return { startDate: yesterday, endDate: yesterday };
 }
 case 'thisWeek':
 return { startDate: weekStart, endDate: today };
 case 'lastWeek':
 return { startDate: addDays(weekStart, -7), endDate: addDays(weekStart, -1) };
 case 'thisMonth':
 return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
 case 'lastMonth': {
 const lastMonthEnd = addDays(`${today.slice(0, 7)}-01`, -1);
 return { startDate: `${lastMonthEnd.slice(0, 7)}-01`, endDate: lastMonthEnd };
 }
 case 'custom':
 return { startDate: range.from, endDate: range.to };
 default:
 return { startDate: today, endDate: today };
 }
}

// A record's IST calendar date. Plain YYYY-MM-DD dates pass through; timestamps are shifted
// to IST first so a 1 AM IST entry doesn't land on the previous (UTC) day.
export function istDateKey(value: any): string | null {
 if (!value) return null;
 if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
 const time = new Date(value).getTime();
 if (isNaN(time)) return null;
 return utcToIST(new Date(time).toISOString()).slice(0, 10);
}

export function isInWindow(value: any, window: PeriodWindow): boolean {
 const date = istDateKey(value);
 return !!date && date >= window.startDate && date <= window.endDate;
}

// Month-tagged amounts (a personal expense's expenseMonth, a payout's forMonth) count in every
// month the window touches - but never in a day or week view, they're monthly figures.
export function monthInPeriod(yearMonth: string, filter: TimeFilter, window: PeriodWindow): boolean {
 if (filter !== 'thisMonth' && filter !== 'lastMonth' && filter !== 'custom') return false;
 return yearMonth >= window.startDate.slice(0, 7) && yearMonth <= window.endDate.slice(0, 7);
}

// Shortens long item names for chart axis ticks (full name still shows in the tooltip).
export function truncateChartLabel(name: string, max: number): string {
 return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export type SettlementPeriodLike = {
 settlementDate: string;
 periodStart?: string;
 periodEnd?: string;
 sourceFileName?: string;
 orders?: { orderDate?: string }[];
};

export const settlementOverlapsAnalyticsRange = (
 settlement: SettlementPeriodLike,
 range: { start: string; end: string } | null
) => {
 if (!range) return true;
 return settlementOverlapsPeriod(settlement, range.start, range.end);
};

export const settlementAnalyticsReportingDate = (settlement: SettlementPeriodLike) =>
 getSettlementPeriod(settlement).end;
 
 // 'profit'/'expense'/'sales' keep their original internal names (Revenue & Channels /
 // Costs & Margins / Item Performance are just their new display labels) to avoid
 // touching every reference to them across this file - only the tab bar, its labels,
 // and each view's content changed. 'datacapture' (Performance Tracker) is no longer a
 // top-level tab - it's now a collapsible section inside 'overview' (see the Analytics
 // page redesign).
 export type ActiveView = 'overview' | 'profit' | 'expense' | 'unit-economics' | 'sales' | 'cash-reconciliation' | 'production' | 'production-requests' | 'stock-request-analysis' | 'recalibration-reports' | 'trends';
 
 // Production date range selector
 export type DateRangeType = 'today' | 'yesterday' | 'thisWeek' | 'previousWeek' | 'thisMonth' | 'previousMonth' | 'thisYear' | 'previousYear' | 'custom';

// Category labels from utils/inventoryData.ts carry an emoji; Insights shows the words only
// (warm-ledger rule: no emoji in data labels).
export const plainLabel = (label: string) => label.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

export function useAnalyticsData({ context, selectedStoreId, highlightRequestId, initialTab, onNavigateToManageItems, onNavigateToProductionManagement }: AnalyticsProps) {
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
 // The brief and forecast (useInsightsOverview) moved to Home with their cards (WP2).
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
 // Kept stable between renders so the SLA tab doesn't redo its work on every small change here.
 const stockAnalysisStoreIds = useMemo(
 () => (effectiveStoreId ? [effectiveStoreId] : (context.stores || []).map((st) => st.id)),
 [effectiveStoreId, context.stores]
 );

 // DEBUG: Log the effective store ID being used
 logger.debugStore('Analytics effectiveStoreId:', effectiveStoreId);
 logger.debugStore('Analytics mode:', analyticsMode);
 const [activeView, setActiveView] = useState<ActiveView>(
 highlightRequestId || initialTab === 'production-requests' ? 'production-requests' : initialTab === 'trends' ? 'trends' : initialTab === 'cash-reconciliation' ? 'cash-reconciliation' : 'overview'
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
 // Insights > Costs: one running-cost, bill or equipment line opened from its row (by name).
 const [categoryLine, setCategoryLine] = useState<string | null>(null);
 
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
 // Compare with same days in previous week (weeks start on Monday, like getDateRangeBounds)
 const daysIntoWeek = (today.getDay() + 6) % 7;
 const currentWeekStart = new Date(today);
 currentWeekStart.setDate(today.getDate() - daysIntoWeek);
 
 startDate = new Date(currentWeekStart);
 startDate.setDate(currentWeekStart.getDate() - 7);
 endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + daysIntoWeek);
 break;
 
 case 'previousWeek':
 // Compare with 2 weeks ago (Monday-start, like getDateRangeBounds)
 startDate = new Date(today);
 startDate.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 14);
 endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + 6);
 break;
 
 case 'thisMonth':
 // Compare with same date range in previous month
 // (capped at that month's last day - 31 Oct compares with 1-30 Sep, not up to 1 Oct)
 const daysIntoMonth = Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate());
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
 if (analyticsMode === 'production' && selectedProductionHouseId) {
 fetchRecalibrationAndCalculateOpeningBalance();
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
 setSelectedProductionHouseId(firstProductionHouse.id);
 }
 }, [analyticsMode, isClusterHead, isManager, context.productionHouses]);

async function fetchRecalibrationAndCalculateOpeningBalance() {
 try {
 // The house's stock is its last stock count that wasn't rejected + everything since
 // (stock/countMath.ts, worked out in productionCalc.buildStock), the same figure the stock
 // count expects. Counts made by a production incharge are saved under a linked store's id,
 // which the history route includes for the house.
 const allStores = stores.length > 0 ? stores : (context.stores || []);
 let productionHouseUUID = selectedProductionHouseId;
 if (selectedProductionHouseId && selectedProductionHouseId.startsWith('STORE-')) {
 const userStore = allStores.find(s => s.id === selectedProductionHouseId);
 if (userStore?.productionHouseId) productionHouseUUID = userStore.productionHouseId;
 }
 if (!productionHouseUUID) {
 setLatestRecalibration(null);
 setPreviousMonthStock(null);
 return;
 }
 const token = context.user?.accessToken || '';
 const [history, returns] = await Promise.all([
 countHistory(token, [productionHouseUUID, selectedProductionHouseId], 'production_house'),
 eventsApi.momoReturns('received').catch(() => []),
 ]);
 const base = lastCount(history, context.inventoryItems || []);
 setLatestRecalibration(base ? { date: countUTC(base.date) } : null);
 setPreviousMonthStock({ base, returns });
 } catch (error) {
 console.error('Error fetching recalibration:', error);
 }
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

 // The selected period as an IST date window - see periodWindow.
 const periodRange = useMemo(() => periodWindow(timeFilter, dateRange), [timeFilter, dateRange]);

 // Records dated inside the selected period.
 const filterByTimeRange = (data: any[], dateField: string = 'date'): any[] =>
 (data || []).filter(item => isInWindow(item?.[dateField], periodRange));

 // The period's slice of each list, memoized: built in the render body they were new arrays
 // on every render, so every store filter, metric and chart below recomputed each time too.
 const timeFilteredSalesData = useMemo(() => filterByTimeRange(salesData), [salesData, periodRange]);
 const timeFilteredInventoryData = useMemo(() => filterByTimeRange(inventoryData), [inventoryData, periodRange]);

 // Personal expenses with an expenseMonth count in that month rather than on the day they
 // were logged; every other overhead goes by its date.
 const timeFilteredOverheadData = useMemo(() => (overheadData || []).filter((item: any) =>
 item?.category === 'personal_expense' && item.expenseMonth
 ? monthInPeriod(item.expenseMonth, timeFilter, periodRange)
 : isInWindow(item?.date, periodRange)
 ), [overheadData, timeFilter, periodRange]);

 const timeFilteredFixedCostsData = useMemo(() => filterByTimeRange(fixedCostsData), [fixedCostsData, periodRange]);

 // Payouts with a forMonth set (backlogged/late salaries, e.g. paid on the 5th for the prior
 // month) are bucketed by forMonth instead of the payment date, mirroring expenseMonth above.
 // Payouts without forMonth go by their date.
 const timeFilteredPayoutsData = useMemo(() => [
 ...payoutsData.filter((payout: any) => !!payout.forMonth && monthInPeriod(payout.forMonth, timeFilter, periodRange)),
 ...filterByTimeRange(payoutsData.filter((payout: any) => !payout.forMonth)),
 ], [payoutsData, timeFilter, periodRange]);

 // Filter data by selected store (after time filtering)
 const filteredSalesData = useMemo(() => {
 if (!effectiveStoreId) {
 return timeFilteredSalesData;
 }
 
 // IMPORTANT: Only include sales with exact storeId match
 // Do NOT include legacy data without storeId when viewing a specific store
 const filtered = timeFilteredSalesData.filter(sale => 
 sale.storeId === effectiveStoreId
 );
 
 return filtered;
 }, [timeFilteredSalesData, effectiveStoreId]);

 const filteredInventoryData = useMemo(() => {
 if (!effectiveStoreId) {
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
 
 return filtered;
 }, [timeFilteredInventoryData, effectiveStoreId, effectiveProductionHouseIdForCosts]);

 const filteredOverheadData = useMemo(() => {
 if (!effectiveStoreId) {
 return timeFilteredOverheadData;
 }

 // Store's own entries, plus its linked production house's - see filteredInventoryData
 // above for why (same storeId-is-never-set-on-production-entries issue).
 const filtered = timeFilteredOverheadData.filter(item =>
 item.storeId === effectiveStoreId ||
 (!!effectiveProductionHouseIdForCosts && (item as any).entityType === 'production_house' && (item as any).productionHouseId === effectiveProductionHouseIdForCosts)
 );

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
 setPayoutsData(payouts || []);
 setEmployeesData(employees || []);
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
 
 if (!isClusterHead && analyticsMode !== 'production') return;
 
 try {
 const storesList = await api.getStores();
 setStores(storesList);
 } catch (error) {
 console.error('❌ Error loading stores:', error);
 }
 };
 
 loadStores();
 }, [isClusterHead, analyticsMode]);

 // The leave bar and its pop-up (this week's approved leave) moved to Home (WP2); its fetch went with it.

 // Auto-switch to production-requests tab when notification is clicked - this tab only
 // exists under Store Analytics, so force that mode even for a production incharge whose
 // default view is Production Analytics.
 useEffect(() => {
 if (highlightRequestId) {
 setAnalyticsMode('store');
 setActiveView('production-requests');
 }
 }, [highlightRequestId]);

 // The Bunny chat explains whichever tab is open.
 useEffect(() => {
 setScreenTab(analyticsMode === 'production' ? 'production' : activeView);
 return () => setScreenTab(undefined);
 }, [activeView, analyticsMode]);

 // Same for a tab opened from a notification while Analytics is already on screen.
 useEffect(() => {
 if (initialTab === 'production-requests') {
 setAnalyticsMode('store');
 setActiveView('production-requests');
 return;
 }
 if (initialTab === 'trends') {
 setAnalyticsMode('store');
 setActiveView('trends');
 }
 }, [initialTab]);

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
 }
 });
 
 return totalInterest;
 };

 // Settlement uploads have two date concepts: settlementDate is when the aggregator paid
 // the bank/Paytm balance, while periodStart/periodEnd is when the customer orders happened.
 // Analytics filters use the sales period so a Jul 29-31 report paid on Aug 3 belongs to
 // Last Month; cash/bank history can still display the Aug 3 settlement date.
 // Same window as every other figure on the page (a custom range that isn't filled in yet
 // means no filter).
 const activeSettlementDateRange = useMemo((): { start: string; end: string } | null =>
 timeFilter === 'custom' && !(dateRange.from && dateRange.to)
 ? null
 : { start: periodRange.startDate, end: periodRange.endDate },
 [timeFilter, dateRange, periodRange]);

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
 // Calculate revenue from main sales table (Swiggy/Zomato added below after filtering)
 const mainSalesRevenue = filteredSalesData.reduce((sum, sale) => {
 return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
 }, 0);
 
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

 // Calculate overhead expenses (EXCLUDING legacy commission entries)
 // Separate personal_expense items (employee salary-related) from other overhead
 const personalExpenseItems = filteredOverheadData.filter(item => item.category === 'personal_expense');
 const personalExpenseTotal = personalExpenseItems.reduce((sum, item) => sum + (item.amount || 0), 0);

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
 
 // Online sales and payouts for this store in the period window (same Monday-start weeks
 // and month bounds as the counter sales above - online used to start weeks on Sunday).
 const filteredOnlineSales = storeOnlineSales.filter((sale: any) => isInWindow(sale.date, periodRange));
 const filteredOnlinePayouts = storeOnlinePayouts.filter((payout: any) => isInWindow(payout.date, periodRange));
 
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

 if (timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom') {
 // For month/custom view: Use DATE-FILTERED payouts to respect the selected time range
 let relevantPayouts = filteredPayoutsData;

 if (effectiveStoreId) {
 // When store is selected, filter payouts to employees of that store
 const storeEmployeeIds = filteredEmployeesData.map(emp => emp.id);
 relevantPayouts = relevantPayouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
 }

 for (const payout of relevantPayouts) {
 // IMPORTANT: Use raw employeesData (not store-filtered) for type lookup
 // This ensures we can identify employee type even if store filtering is active
 const employee = employeesData.find((emp: any) => emp.id === payout.employeeId);
 if (!employee) {
 continue;
 }
 const empType = employee?.type || employee?.employmentType;
 if (empType === 'contract') {
 contractWorkerExpenses += payout.amount || 0;
 } else {
 permanentEmployeeExpenses += payout.amount || 0;
 }
 }
 }
 // For daily/weekly view, both buckets stay 0 - payouts are monthly, not daily events

 // Total salary expenses = contract workers + permanent employee payouts + personal expenses (employee-mapped overhead)
 const salaryExpenses = contractWorkerExpenses + permanentEmployeeExpenses + personalExpenseTotal;

 // Total fixed costs = rent, electricity, internet/phone (and old LPG entries) - salary is
 // tracked separately; the yearly software subscription is spread like equipment.
 const fixedCostsTotal = filteredFixedCostsData
 .filter(fc => costBucketFor(fc.category || '', 'fixedcost') === 'fixed')
 .reduce((sum, fc) => sum + (fc.amount || 0), 0) + inventoryFixedExpenses + overheadFixedExpenses;
 
 // Calculate interest expense (accrual basis) over the period window
 const { startDate, endDate } = periodRange;
 const interestExpenses = calculateAccruedInterest(startDate, endDate, effectiveStoreId || undefined);

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
 periodRange,
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

 // The month's P&L itself is utils/pnl.ts's buildPnl - shared with the Export page and the
 // Business Audit Report so every screen and export shows the same profit.
 const pnlForMonth = useCallback((ym: string): PnlBreakdown => buildPnl({
 start: `${ym}-01`,
 end: addDays(`${monthAdd(ym, 1)}-01`, -1),
 storeId: effectiveStoreId,
 data: {
 sales: salesData,
 inventory: inventoryData,
 overheads: overheadData,
 fixedCosts: fixedCostsData,
 onlineSales: onlineSalesData || [],
 onlinePayouts: onlinePayoutData || [],
 settlements: aggregatorSettlements || [],
 payouts: payoutsData,
 employees: employeesData,
 stores: context.stores || [],
 loans: onlineLoans,
 },
 }), [salesData, inventoryData, overheadData, fixedCostsData, onlineSalesData, onlinePayoutData, aggregatorSettlements, payoutsData, employeesData, context.stores, effectiveStoreId, onlineLoans]);

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
 // Only built while the Salaries pop-up is open - nothing else reads it.
 const salaryModalOpen = selectedExpenseCategory?.type === 'salary';
 const salaryBreakdownData = useMemo(() => {
 if (!salaryModalOpen) return null;
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
 }, [salaryModalOpen, filteredPayoutsData, payoutsData, employeesData, filteredOverheadData, timeFilter, effectiveStoreId, context.stores]);

 const commissionBreakdownSettlements = useMemo(
 () => (aggregatorSettlements || []).filter((st: any) =>
 (!effectiveStoreId || st.storeId === effectiveStoreId) && settlementOverlapsAnalyticsRange(st, activeSettlementDateRange)
 ),
 [aggregatorSettlements, effectiveStoreId, activeSettlementDateRange]
 );

 // Date range for the current timeFilter, usable outside calculateMetrics() - the same
 // window calculateMetrics uses (see periodWindow).
 const itemPerfDateRange = periodRange;

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
 // 'profit' (Revenue & Channels) needs it too: its orders-per-day, orders-by-hour, order-size
 // and service-type charts are built from these orders (owner, 30 Oct 2026: they showed nothing
 // when the Revenue tab was opened first).
 if ((activeView !== 'sales' && activeView !== 'overview' && activeView !== 'unit-economics' && activeView !== 'profit') || !context.user?.accessToken) return;
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

 // Same fetch, for the previous-period comparison range - the Overview and Revenue tabs' dashed
 // "last period" lines (Item Performance doesn't show one). Only Overview fetched it, so the
 // Revenue tab's order charts showed last period as 0 (owner, 30 Oct 2026).
 useEffect(() => {
 if ((activeView !== 'overview' && activeView !== 'profit' && activeView !== 'sales') || !context.user?.accessToken) return;
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
 Cash: 'var(--channel-counter)', Paytm: 'var(--chart-4)', PhonePe: 'var(--chart-2)', Card: 'var(--chart-3)',
 'Google Pay': 'var(--chart-1)', Razorpay: 'var(--chart-4)', Zomato: 'var(--channel-zomato)', Swiggy: 'var(--channel-swiggy)', Unknown: 'var(--chart-5)',
 };
 return Object.entries(totals)
 .filter(([, amount]) => amount > 0)
 .sort((a, b) => b[1] - a[1])
 .map(([mode, amount]) => ({ name: mode, value: Math.round(amount), color: PALETTE[mode] || 'var(--chart-5)' }));
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

 // Prepare sales chart data with online/offline breakdown based on time filter. Online
 // amounts are this store's Swiggy/Zomato sales inside the same window as the cards - they
 // used to come from every store, and a custom range added every online record ever.
 const prepareSalesChartData = () => {
 const chartData: any[] = [];
 const periodOnlineSales = storeOnlineSales.filter((sale: any) => isInWindow(sale.date, periodRange));
 
 // Helper function to add day data
 const addDayData = (dateStr: string) => {
 const dayLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('default', { month: 'short', day: 'numeric' });
 
 const daySales = filteredSalesData.filter(sale => sale.date === dateStr);
 // Get online sales from main sales table
 const onlineRevenueFromSales = daySales.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
 
 // ALSO get online sales from the separate online sales table (Swiggy + Zomato)
 const dayOnlineSales = periodOnlineSales.filter((sale: any) => sale.date === dateStr);
 const onlineRevenueFromPlatforms = dayOnlineSales.reduce((sum: number, sale: any) => 
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
 
 if (timeFilter === 'custom') {
 // For custom range, group by month
 const monthlyData: any = {};
 const monthOf = (date: string) => new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString('default', { month: 'short', year: '2-digit' });
 
 filteredSalesData.forEach(sale => {
 const monthKey = monthOf(sale.date);
 
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
 periodOnlineSales.forEach((sale: any) => {
 const monthKey = monthOf(sale.date);
 
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
 
 // Every day of the window (today, yesterday, Monday-to-date, the month to date, last week,
 // last month), as IST date strings.
 for (let day = periodRange.startDate; day <= periodRange.endDate; day = addDays(day, 1)) {
 addDayData(day);
 }
 
 return chartData;
 };

 const salesChartData = useMemo(() => prepareSalesChartData(), [
 filteredSalesData,
 storeOnlineSales,
 timeFilter,
 periodRange
 ]);

 // Rent / electricity / permanent salaries (incl. variable pay) spread over the days of the
 // month they belong to - see utils/dailyCostSmoothing.ts for the rules (estimates, true-up).
 // Built from ALL records (not the time-filtered ones) so a payment made outside the viewed
 // window still contributes its daily share to the days inside it.
 const fixedCostAccrual = useMemo(
 () => accrualFor(periodRange.startDate, periodRange.endDate),
 [periodRange, accrualFor]
 );
 // The daily charts only use the spread when the toggle is on; the Net Normalized Profit card always does.
 const smoothedCosts = smoothFixedCosts ? fixedCostAccrual : null;

 // Prepare profit chart data with revenue, expenses, profit based on time filter
 const prepareProfitChartData = () => {
 const dailyData: any = {};
 // Payouts with a forMonth and personal expenses with an expenseMonth count in the window
 // even when paid outside it (a September salary paid on 5 October): put them on the
 // window's nearest day so the chart still adds up to the card.
 const chartDay = (date: string) =>
 !date || date < periodRange.startDate ? periodRange.startDate : date > periodRange.endDate ? periodRange.endDate : date;
 
 // Group by date for daily breakdown
 filteredSalesData.forEach(sale => {
 const date = sale.date;
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 // Use GROSS revenue (to match metrics calculation)
 const grossRevenue = (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
 dailyData[date].revenue += grossRevenue;
 // Contract pay comes from payouts below, like the card - the legacy sale.employeeSalary
 // field isn't filled any more and would double-count old days.
 });
 
 // Calculate commission by date from onlineSalesData and onlinePayoutData (same as metrics)
 const filteredOnlineSales = storeOnlineSales.filter((sale: any) => isInWindow(sale.date, periodRange));
 
 filteredOnlineSales.forEach((sale: any) => {
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

 // Add overhead expenses by date (old aggregator-commission entries are left out, as on the
 // card - commission comes from the settlements above)
 filteredOverheadData.forEach(item => {
 if (!isDatedProfitCost(item.category || '', 'overhead')) return;
 if (isCommissionEntry(item)) return;
 const date = chartDay(item.date);
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
 
 // Employee payouts, counted like the card's Salaries line: contract and permanent pay
 // alike, and only on month/custom views (the card shows no payouts for a day or a week).
 // Smoothed mode spreads permanent salaries over the month instead (smoothedCosts) but
 // never contract pay (dailyCostSmoothing leaves it out), so contract pay stays here.
 const viewCountsPayouts = timeFilter === 'thisMonth' || timeFilter === 'lastMonth' || timeFilter === 'custom';
 if (viewCountsPayouts) filteredPayoutsData.forEach(payout => {
 // Find the employee for this payout - use raw employeesData for type lookup
 const employee = employeesData.find((emp: any) => emp.id === payout.employeeId);
 if (!employee) return; // the card skips payouts it can't match to an employee too
 const isContract = (employee.type || employee.employmentType) === 'contract';
 if (smoothedCosts && !isContract) return;
 const date = chartDay(payout.date);
 if (!dailyData[date]) {
 dailyData[date] = { revenue: 0, expenses: 0, profit: 0 };
 }
 dailyData[date].expenses += (payout.amount || 0);
 });
 
 // Calculate profit and format for chart
 const chartData = Object.keys(dailyData)
 .sort()
 .map(date => {
 const data = dailyData[date];
 const profit = data.revenue - data.expenses;
 return {
 date: date, // Add unique date identifier for React key
 period: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
 revenue: Math.round(data.revenue),
 expenses: Math.round(data.expenses),
 profit: Math.round(profit)
 };
 });
 
 return chartData;
 };

 const profitChartData = useMemo(() => prepareProfitChartData(), [
 filteredSalesData,
 filteredInventoryData,
 filteredOverheadData,
 filteredFixedCostsData,
 filteredPayoutsData,
 filteredEmployeesData,
 employeesData,
 storeOnlineSales,
 metrics,
 smoothedCosts,
 spreadSourceRecords,
 itemPerfDateRange,
 periodRange,
 timeFilter
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
 ? 'Meat & Dairy'
 : plainLabel(expenseCategoryLabel(category));
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
 const displayName = plainLabel(expenseCategoryLabel(category));
 categoryExpenses[displayName] = (categoryExpenses[displayName] || 0) + amount;
 categoryItems[displayName] = categoryItems[displayName] || [];
 categoryTypes[displayName] = category === 'packaging_bulk' ? 'inventory' : 'fixed';
 });

 // Add salaries separately (contract + permanent)
 if (metrics.salaryExpenses > 0) {
 categoryExpenses['Salaries'] = metrics.salaryExpenses;
 categoryItems['Salaries'] = []; // No detailed breakdown for salaries in this view
 categoryTypes['Salaries'] = 'salary';
 }

 // Add aggregator commission as a separate category
 if (metrics.commissionExpenses > 0) {
 categoryExpenses['Aggregator Commission'] = metrics.commissionExpenses;
 categoryItems['Aggregator Commission'] = []; // Calculated from online sales/payout data
 categoryTypes['Aggregator Commission'] = 'commission';
 }
 if (metrics.adSpend > 0) {
 categoryExpenses['Zomato/Swiggy Ads'] = metrics.adSpend;
 categoryItems['Zomato/Swiggy Ads'] = [];
 categoryTypes['Zomato/Swiggy Ads'] = 'commission';
 }
 
 // Add interest expense as a separate category
 if (metrics.interestExpenses > 0) {
 categoryExpenses['Loan Interest'] = metrics.interestExpenses;
 categoryItems['Loan Interest'] = []; // Calculated from accrued interest on loans
 categoryTypes['Loan Interest'] = 'interest';
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

 // Only the Costs & Margins tab shows it; worked out once per data change, not on every render.
 const expenseBreakdown = useMemo(
 () => (activeView === 'expense' ? prepareExpenseBreakdown() : []),
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [activeView, filteredInventoryData, filteredOverheadData, filteredFixedCostsData, metrics]
 );

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
 const label = (category?: string) => plainLabel(expenseCategoryLabel(category || 'Other'));
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
 // One row of Insights > Costs that isn't food (bills, running costs, equipment spread over its
 // life): the entries behind it by place, so the sheet adds up to the row (owner, 28 Oct 2026:
 // these rows opened to nothing). Bills say the month they're for and electricity its units.
 const buildCategoryLine = (name: string): { title: string; groups: CostLineGroup[]; note?: string } => {
 const row: any = expenseBreakdown.find((x: any) => x.name === name);
 const groups = new Map<string, CostLineGroup>();
 const add = (groupLabel: string, entry: { id: string; date: string; name: string; detail?: string; amount: number }) => {
 if (!entry.amount) return;
 const g = groups.get(groupLabel) || { label: groupLabel, amount: 0, entries: [] };
 g.amount += entry.amount;
 g.entries.push(entry);
 groups.set(groupLabel, g);
 };
 const place = (x: any) => (x.entityType === 'production_house' ? 'Production house' : 'Store');
 const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
 let hasBills = false;
 (row?.items || []).forEach((x: any, i: number) => {
 const isBill = x.category && costBucketFor(x.category, 'fixedcost') === 'fixed' && x.amount !== undefined && x.totalCost === undefined && !x.employeeName;
 if (isBill) hasBills = true;
 const detail = [
 x.forMonth ? `for ${monthName(x.forMonth)}` : '',
 x.units && x.category === 'electricity' ? `${x.units} units · ₹${(x.unitPrice || x.amount / x.units).toFixed(2)} a unit` : '',
 x.quantity && x.itemName ? `${x.quantity} ${x.unit || ''}`.trim() : '',
 x.employeeName || '',
 ].filter(Boolean).join(' · ');
 add(place(x), { id: `cat-${x.id || i}`, date: x.date, name: x.itemName || x.description || name, detail: detail || undefined, amount: x.totalCost ?? x.amount ?? 0 });
 });
 // Equipment, the scooter and the yearly POS fee: this period's share of each purchase.
 const today = getTodayIST();
 const spreadEnd = periodRange.endDate > today ? today : periodRange.endDate;
 let hasSpread = false;
 spreadSourceRecords.filter((r) => plainLabel(expenseCategoryLabel(r.category)) === name).forEach((r, i) => {
 const share = buildSpreadCosts([r], periodRange.startDate, spreadEnd).total;
 if (share < 0.5) return;
 hasSpread = true;
 add('Purchases spread over their life', { id: `spr-${r.id || i}`, date: r.date, name: r.name || name, detail: `this period's share of ₹${Math.round(r.amount).toLocaleString('en-IN')}`, amount: share });
 });
 const note = hasSpread
 ? 'Each purchase counts a little every month over its life (3 years for equipment and vehicles, 12 months for the POS fee); this is the share in the period.'
 : hasBills ? 'Counted on the day each bill was paid.' : undefined;
 return { title: name, groups: [...groups.values()].sort((a, b) => b.amount - a.amount), note };
 };

 // Commission, salaries and interest already have purpose-built breakdowns.
 const openCostLine = (line: CostLineKey) => {
 if (line === 'commission' || line === 'ads') {
 setSelectedExpenseCategory({ category: 'Aggregator Commission', items: [], amount: metrics.commissionExpenses + metrics.adSpend, type: 'commission' });
 } else if (line === 'staff') {
 setSelectedExpenseCategory({ category: 'Salaries', items: [], amount: metrics.salaryExpenses, type: 'salary' });
 } else if (line === 'interest') {
 setSelectedExpenseCategory({ category: 'Loan Interest', items: [], amount: metrics.interestExpenses, type: 'interest' });
 } else {
 setCostLine(line);
 }
 };

 const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

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

 // eslint-disable-next-line react-hooks/exhaustive-deps
 const totalCashDiscrepancy = useMemo(() => calculateCashDiscrepancy(), [filteredSalesData]);
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

 // eslint-disable-next-line react-hooks/exhaustive-deps
 const totalPosSalesDiscrepancy = useMemo(() => calculatePosSalesDiscrepancy(), [filteredSalesData]);

 return {
  context,
  selectedStoreId,
  highlightRequestId,
  initialTab,
  onNavigateToManageItems,
  onNavigateToProductionManagement,
  onlineSalesData,
  onlinePayoutData,
  aggregatorSettlements,
  onlineLoans,
  setOnlineLoans,
  isLoadingLoans,
  setIsLoadingLoans,
  isCommissionEntry,
  isClusterHead,
  isManager,
  isAudit,
  isProductionIncharge,
  isStoreIncharge,
  isOperationsManager,
  analyticsMode,
  setAnalyticsMode,
  productionInchargeDefaultStoreId,
  insightsStoreId,
  canManageInsights,
  effectiveStoreId,
  effectiveProductionHouseIdForCosts,
  stockAnalysisFinishedProducts,
  stockAnalysisRequests,
  stockAnalysisSalesData,
  stockAnalysisStoreIds,
  activeView,
  setActiveView,
  selectedExpenseCategory,
  setSelectedExpenseCategory,
  costLine,
  setCostLine,
  salesSubView,
  setSalesSubView,
  orderItemDetail,
  setOrderItemDetail,
  previousOrderItemDetail,
  setPreviousOrderItemDetail,
  showActivityLog,
  setShowActivityLog,
  timeFilterChoice,
  setTimeFilterChoice,
  timeFilter,
  smoothFixedCosts,
  setSmoothFixedCosts,
  updateSmoothFixedCosts,
  wastageTimeFilter,
  setWastageTimeFilter,
  getDateRangeDefaults,
  customDateRange,
  setDateRange,
  dateRange,
  payoutsData,
  setPayoutsData,
  employeesData,
  setEmployeesData,
  showRecalibration,
  setShowRecalibration,
  stores,
  setStores,
  latestRecalibration,
  setLatestRecalibration,
  previousMonthStock,
  setPreviousMonthStock,
  sopThresholds,
  setSopThresholds,
  editingSop,
  setEditingSop,
  tempSopThresholds,
  setTempSopThresholds,
  sopDiversionPercent,
  setSopDiversionPercent,
  tempDiversionPercent,
  setTempDiversionPercent,
  stockAlertThresholds,
  setStockAlertThresholds,
  showStockAlertModal,
  setShowStockAlertModal,
  tempStockAlertThresholds,
  setTempStockAlertThresholds,
  momosPerPlate,
  setMomosPerPlate,
  showPlateSettingsModal,
  setShowPlateSettingsModal,
  tempMomosPerPlate,
  setTempMomosPerPlate,
  selectedProductionHouseId,
  setSelectedProductionHouseId,
  salesData,
  inventoryData,
  overheadData,
  fixedCostsData,
  productionData,
  loading,
  productionLedgerRange,
  setProductionLedgerRange,
  productionLedgerRangeLoading,
  setProductionLedgerRangeLoading,
  selectedLedgerPoolId,
  setSelectedLedgerPoolId,
  selectedProductionDate,
  setSelectedProductionDate,
  sopComplianceDate,
  setSopComplianceDate,
  productionDateRange,
  setProductionDateRange,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  getDateRangeBounds,
  getPreviousPeriodDateRange,
  fetchRecalibrationAndCalculateOpeningBalance,
  periodRange,
  filterByTimeRange,
  timeFilteredSalesData,
  timeFilteredInventoryData,
  timeFilteredOverheadData,
  timeFilteredFixedCostsData,
  timeFilteredPayoutsData,
  filteredSalesData,
  filteredInventoryData,
  filteredOverheadData,
  filteredFixedCostsData,
  spreadSourceRecords,
  filteredEmployeesData,
  filteredPayoutsData,
  getPeriodLabel,
  calculateAccruedInterest,
  activeSettlementDateRange,
  onlineCostIndex,
  storeOnlineSales,
  storeOnlinePayouts,
  calculateMetrics,
  metrics,
  accrualFor,
  pnlForMonth,
  carryForward,
  unitEconomicsTrend,
  salaryModalOpen,
  salaryBreakdownData,
  commissionBreakdownSettlements,
  itemPerfDateRange,
  previousPeriodRange,
  KNOWN_SYNONYMS,
  normalizeItemName,
  itemPerformanceData,
  zipPrev,
  buildOrdersPerDay,
  ordersPerDayData,
  channelFoodValue,
  previousOrdersPerDayData,
  ordersPerDayChartData,
  median,
  offlineOrdersMedian,
  onlineOrdersMedian,
  HOUR_START,
  HOUR_END,
  formatHour,
  buildOrdersByHour,
  ordersByHourData,
  previousOrdersByHourData,
  ordersByHourChartData,
  peakHour,
  buildServiceType,
  serviceTypeData,
  previousServiceTypeData,
  serviceTypeChartData,
  buildAvgOrderValue,
  avgOrderValueData,
  previousAvgOrderValueData,
  avgOrderValueChartData,
  buildDiscountPct,
  discountPctData,
  previousDiscountPctData,
  discountPctChartData,
  paymentModeBreakdownData,
  previousPeriodSalesData,
  buildCancellationTrend,
  cancellationTrendData,
  previousCancellationTrendData,
  cancellationChartData,
  ORDER_VALUE_BUCKETS,
  orderValueHistogramData,
  decliningItems,
  prepareMonthlyData,
  monthlyChartData,
  prepareSalesChartData,
  salesChartData,
  fixedCostAccrual,
  smoothedCosts,
  prepareProfitChartData,
  profitChartData,
  previousProfitTrendData,
  profitChartDataWithPrev,
  previousPeriodMetrics,
  pctChange,
  getPreviousPeriodLabel,
  commissionAdSpendChartData,
  channelMixChartData,
  cashReconciliationChartData,
  cashReconciliationByStore,
  prepareExpenseBreakdown,
  expenseBreakdown,
  buildCostLine,
  openCostLine,
  categoryLine,
  setCategoryLine,
  buildCategoryLine,
  COLORS,
  calculateCashDiscrepancy,
  totalCashDiscrepancy,
  unrealizedProfit,
  realizedProfit,
  netRealisedProfit,
  normalizedFixedRecorded,
  normalizedFixedAccrued,
  netNormalizedProfit,
  normalizedDaysCounted,
  normalizedMonthPool,
  normalizedCardNote,
  calculatePosSalesDiscrepancy,
  totalPosSalesDiscrepancy,
 };
}

export type AnalyticsData = ReturnType<typeof useAnalyticsData>;
