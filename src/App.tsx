// Bhandar-IMS - Performance optimized with lazy loading
import { isPhase1Live, type ProductionBatch } from './utils/batches';
import { useState, useEffect, lazy, Suspense, memo, startTransition, useCallback } from 'react';
const InventoryView = lazy(() => import('./components/InventoryView').then(module => ({ default: module.InventoryView })));
const InventoryManagement = lazy(() => import('./components/InventoryManagement').then(module => ({ default: module.InventoryManagement })));
const SalesView = lazy(() => import('./components/SalesView').then(module => ({ default: module.SalesView })));
const ClusterDashboard = lazy(() => import('./components/ClusterDashboard').then(module => ({ default: module.ClusterDashboard })));
// Lazy load heavy components for better performance
const SalesManagement = lazy(() => import('./components/SalesManagement').then(module => ({ default: module.SalesManagement })));
const PayrollManagement = lazy(() => import('./components/PayrollManagement').then(module => ({ default: module.PayrollManagement })));
const Analytics = lazy(() => import('./components/Analytics').then(module => ({ default: module.Analytics })));
const ExportData = lazy(() => import('./components/ExportData').then(module => ({ default: module.ExportData })));
const EmployeeDashboard = lazy(() => import('./components/EmployeeDashboard').then(module => ({ default: module.EmployeeDashboard })));
const AuditDashboard = lazy(() => import('./components/AuditDashboard').then(module => ({ default: module.AuditDashboard })));
const ProductionManagement = lazy(() => import('./components/ProductionManagement').then(module => ({ default: module.ProductionManagement })));
const ProductionHouseManagement = lazy(() => import('./components/ProductionHouseManagement').then(module => ({ default: module.ProductionHouseManagement })));
const AssetsManagement = lazy(() => import('./components/AssetsManagement').then(module => ({ default: module.AssetsManagement })));
const RiderProfile = lazy(() => import('./components/RiderProfile').then(module => ({ default: module.RiderProfile })));
const StockOutLog = lazy(() => import('./components/StockOutLog').then(module => ({ default: module.StockOutLog })));
const IncomingDeliveries = lazy(() => import('./components/dispatch/IncomingDeliveries').then(module => ({ default: module.IncomingDeliveries })));
const RiderTrips = lazy(() => import('./components/RiderTrips').then(module => ({ default: module.RiderTrips })));
const StockRequestManagement = lazy(() => import('./components/StockRequestManagement').then(module => ({ default: module.StockRequestManagement })));
const AdvancedInventoryManagement = lazy(() => import('./components/AdvancedInventoryManagement').then(module => ({ default: module.AdvancedInventoryManagement })));
const InventoryItemsManagement = lazy(() => import('./components/InventoryItemsManagement').then(module => ({ default: module.InventoryItemsManagement })));
const BackupRestore = lazy(() => import('./components/BackupRestore').then(module => ({ default: module.BackupRestore })));
import { AuthPage } from './components/AuthPage';
// The attendance and store screens are rendered by AttendancePortal / AssetsManagement (both
// lazy), so App doesn't import them itself - unused imports here kept them in the first-load bundle.
const AttendancePortal = lazy(() => import('./components/AttendancePortal').then(module => ({ default: module.AttendancePortal })));
const EmployeeManagement = lazy(() => import('./components/EmployeeManagement').then(module => ({ default: module.EmployeeManagement })));
import { Notifications } from './components/Notifications';
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner';
import { BunnyChat } from './components/BunnyChat';
import { ProfileCompletionCard } from './components/ProfileCompletionCard';
import { usePasswordPolicy, ChangePasswordDialog, PasswordExpiryBanner } from './components/PasswordSecurity';
import { setLanguageOwner } from './utils/bunnyLanguage';
import { setScreenPage } from './utils/screenContext';
import { StoreSelector } from './components/StoreSelector';
import { EquipmentNavButton } from './components/assets/EquipmentNavButton';
// Note: StockRequestReminderScheduler and AttendanceReminderScheduler were removed
// from the render tree — reminders now run server-side via pg_cron (see
// supabase/migrations/20260701000000_reminder_cron_jobs.sql), so no client-side
// polling is needed. (AttendanceReminderScheduler's file has since been deleted.)
import { PushNotificationStatus } from './components/PushNotificationStatus';
import { LoadingSkeleton, CompactLoadingSkeleton } from './components/LoadingSkeleton';
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2, Users, TrendingUp, Download, Menu, X, Clock, Calendar, UserPlus, CheckSquare, Store, Factory, Bell, Activity, RefreshCw, Database, Bike, PackageCheck, PackageX, KeyRound } from 'lucide-react';
import { getSupabaseClient } from './utils/supabase/client';
import { projectId, publicAnonKey } from './utils/supabase/info';
import * as api from './utils/api';
import * as pushNotifications from './utils/pushNotifications';
import * as nativePushNotifications from './utils/nativePushNotifications';
import * as dataCache from './utils/dataCache';
import { useRiderLocationSharing } from './utils/riderLocationSharing';
import { getTodayIST } from './utils/timezone';

export type InventoryItem = {
 id: string;
 date: string;
 // Food & packaging only for new entries; older records can carry a retired key (see
 // LEGACY_CATEGORY_CANONICAL in utils/inventoryData.ts) or a cluster-head custom category.
 category: 'fresh_produce' | 'staples' | 'spices_seasonings' | 'bread_buns' | 'dairy' | 'meat' | 'packaging' | 'packaging_bulk' | 'beverages' |'cleaning_sanitation' | 'equipment_smallwares' | 'staff_welfare_ppe' | 'office_admin_supplies';
 itemName: string;
 quantity: number;
 unit: string;
 costPerUnit: number;
 totalCost: number;
 storeId?: string; // Optional storeId for multi-store filtering
 entityType?: 'store' | 'production_house'; // Which entity this expense belongs to
 productionHouseId?: string; // Set when entityType is 'production_house'
 createdBy?: string; // User ID who created this entry
 createdByName?: string; // User name who created this entry
 createdByEmail?: string; // User email who created this entry
 // Payment method fields
 paymentMethod?: 'cash' | 'online' | 'both' | 'owner'; // owner = cluster head's own money
 cashAmount?: number; // Amount paid via cash (for 'both' option)
 onlineAmount?: number; // Amount paid via online (for 'both' option)
 paidFromProductionHouseId?: string | null; // store bill paid from this production house's cash (utils/cashSource.ts)
 priceCheckOk?: boolean; // an unusual price someone confirmed is right (utils/expenseChecks.ts)
 // Beverage packaging detail (category === 'beverages') - lets Utilities stock status
 // convert a purchase into a real piece count regardless of whether it was bought by
 // the carton or loose. quantity/unit above are still set to the resulting total pieces
 // so every existing cost/report calculation keeps working unchanged.
 packageType?: 'carton' | 'pieces';
 cartonCount?: number; // Set when packageType is 'carton'
 piecesPerCarton?: number; // Set when packageType is 'carton'
 volumeMl?: number; // Volume of a single piece, in mL (e.g. 750 for a 750mL bottle, 1000 for 1L)
 // Optional weight of a single piece, in grams (e.g. a 200g packet of Aromatic Powder).
 // Only meaningful when quantity/unit is a piece count ('pcs'/'units') - deliberately
 // optional since plenty of piece-counted items (tissues, cutlery) have no useful weight.
 weightPerUnitGrams?: number;
 vendor?: string; // set when read from a scanned invoice
 invoiceRef?: string; // scanned invoice's number, if it had one
};

export type OverheadItem = {
 id: string;
 date: string;
 // Kept in sync with OVERHEAD_CATEGORY_META (src/utils/inventoryData.ts) - that's the
 // runtime source of truth for labels/grouping, this is just so a literal category value
 // written here typechecks against it. 'miscellaneous' and 'commission' are legacy
 // categories kept for backwards compatibility with old records; no longer selectable
 // in the form.
 category: 'fuel' | 'ev_charging' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair' | 'renovation' | 'labour_charge' | 'puja_expense' | 'office_supplies' | 'deep_cleaning' | 'party' | 'breakfast' | 'lunch' | 'dinner' | 'evening_snacks' | 'emergency_online' | 'staff_emergency_services' | 'personal_expense' | 'utensils' | 'cleaning_supplies' | 'equipments' | 'license' | 'water_jar' | 'vehicle_maintenance' | 'donations_community' | 'staff_welfare' | 'miscellaneous' | 'commission' | 'hygiene_ppe' | 'professional_fees' | 'losses_writeoffs' | 'asset_kitchen_equipment' | 'asset_furniture' | 'asset_electrical' | 'asset_vehicle' | 'vehicle_emi';
 description: string;
 amount: number;
 storeId?: string; // Optional storeId for multi-store filtering
 entityType?: 'store' | 'production_house'; // Which entity this expense belongs to
 productionHouseId?: string; // Set when entityType is 'production_house'
 employeeId?: string; // For personal_expense category
 employeeName?: string; // For personal_expense category
 employeeIds?: string[]; // For breakfast/lunch/evening_snacks: which employees this meal covered
 expenseMonth?: string; // For personal_expense: YYYY-MM format to map expense to specific month (for backlogged salaries)
 vendor?: string; // set when read from a scanned invoice
 invoiceRef?: string;
 // Payment method fields
 paymentMethod?: 'cash' | 'online' | 'both' | 'owner'; // owner = cluster head's own money
 cashAmount?: number; // Amount paid via cash (for 'both' option)
 onlineAmount?: number; // Amount paid via online (for 'both' option)
 paidFromProductionHouseId?: string | null; // store bill paid from this production house's cash (utils/cashSource.ts)
};

export type FixedCostItem = {
 id: string;
 category: 'electricity' | 'rent' | 'internet_phone' | 'software_subscription' | 'lpg_gas';
 amount: number;
 description: string;
 date: string;
 userId: string;
 storeId?: string;
 entityType?: 'store' | 'production_house'; // Which entity this expense belongs to
 productionHouseId?: string; // Set when entityType is 'production_house'
 // LPG Gas specific fields
 units?: number;
 unitPrice?: number;
 // Payment method fields
 paymentMethod?: 'cash' | 'online' | 'both' | 'owner'; // owner = cluster head's own money
 cashAmount?: number; // Amount paid via cash (for 'both' option)
 onlineAmount?: number; // Amount paid via online (for 'both' option)
 paidFromProductionHouseId?: string | null; // store bill paid from this production house's cash (utils/cashSource.ts)
};

export type SalesData = {
 id: string;
 date: string;
 offlineSales: number;
 paytmAmount: number;
 cashAmount: number;
 onlineSales: number;
 onlineSalesCommission?: number; // Commission charged by Swiggy/Zomato (reduces net profit)
 employeeSalary: number;
 storeId?: string; // Optional storeId for multi-store filtering
 createdBy: string;
 createdByName?: string; // User name who created this entry
 createdByEmail?: string; // User email who created this entry
 updatedBy?: string; // Stamped by the server whenever a person saves the day from the sales form
 approvalStatus: 'pending' | 'approved';
 actualCashInHand: number | null; // null = not counted yet (a POS-sync/top-up placeholder row)
 cashOffset: number;
 salesDiscrepancy?: number; // Settled discrepancy at time of sales settlement (locked value)
 approvalRequired: boolean;
 approvedBy: string | null;
 approvedAt: string | null;
 approvalRequested: boolean;
 approvalRequestedAt: string | null;
 requestedCashInHand: number | null;
 requestedOffset: number | null;
 rejectedBy: string | null;
 rejectedAt: string | null;
 rejectionReason: string | null;
 previousCashInHand?: number;
 usedOnlineMoney?: number;
 actualPaytmBalance?: number | null; // Closing Paytm balance (server-recomputed); null = not worked out yet
 paytmOffset?: number; // Paytm discrepancy/offset
 // POS integration placeholder: manually entered until the POS API is connected,
 // at which point these two fields become auto-fetched instead of typed in.
 posOnlineSales?: number;
 posOfflineSales?: number;
 // Discount/cancellation stats from the POS sync, split offline (Cash/Paytm counter
 // orders) vs online (Zomato/Swiggy) - only present on POS-synced records.
 offlineDiscount?: number;
 onlineDiscount?: number;
 offlineCancelledAmount?: number;
 offlineCancelledCount?: number;
 onlineCancelledAmount?: number;
 onlineCancelledCount?: number;
 // Raw per-payment-mode split of the day's counter sales (e.g. {Cash: 4055, Paytm: 20000,
 // PhonePe: 4540, Card: 0, ...}) - insight-only, doesn't change any total: Paytm/PhonePe/
 // Card/Google Pay/Razorpay are still all deliberately folded into one "Paytm" figure
 // everywhere else in the app. Only present on POS-synced records from this field's
 // introduction onward.
 paymentModeBreakdown?: Record<string, number>;
 // Orders Ciferon flagged IsComplimentary (comped/free) - value given away, not lost
 // revenue (these orders' BillAmount, typically 0, is still counted normally above).
 complimentaryCount?: number;
 complimentaryAmount?: number;
 // Cash Over/Short: when Cash + Paytm counted for the day doesn't match Net Offline
 // Sales, the till gap gets its own explained reason instead of being silently folded
 // into Sales. Positive amount = short (counted less than sales), negative = over.
 cashOverShortAmount?: number;
 cashOverShortReason?: 'missed_kot' | 'wrong_change' | 'tip' | 'counting_mistake' | 'other' | null;
 cashOverShortNote?: string | null;
};

export type MonthlyCommission = {
 id: string;
 month: string; // Format: "YYYY-MM" (e.g., "2025-01")
 commissionAmount: number; // Total commission for online food aggregators (Swiggy + Zomato)
 storeId?: string; // Optional storeId for multi-store filtering
 createdBy: string;
 createdByName?: string;
 createdByEmail?: string;
 createdAt: string;
 notes?: string; // Optional notes about the commission
};

export type OnlineCashRecalibration = {
 id: string;
 storeId: string;
 storeName: string;
 month: string; // Format: "YYYY-MM"
 date: string; // Actual date of recalibration
 systemBalance: number; // Calculated balance from system
 actualBalance: number; // Actual balance verified by store
 difference: number; // Difference (actual - system)
 notes: string;
 createdBy: string;
 createdAt: string;
 approvalStatus?: 'pending' | 'approved' | 'rejected';
 approvedBy?: string;
 approvedAt?: string;
};

export type ProductionData = {
 id: string;
 date: string;
 productionHouseId?: string; // Production House where production happened
 storeId?: string; // Backwards compatibility - old records might still use this
 createdBy: string;
 approvalStatus: 'pending' | 'approved';
 approvedBy: string | null;
 approvedAt: string | null;
 
 // Regular Momos (Dough + Stuffing based)
 chickenMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 chickenCheeseMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 vegMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 cheeseCornMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 paneerMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 
 // Kurkure Momos (Batter + Coating based)
 vegKurkureMomos: {
 batter: number;
 coating: number;
 final: number;
 };
 chickenKurkureMomos: {
 batter: number;
 coating: number;
 final: number;
 };
 
 // Wastage
 wastage: {
 dough: number;
 stuffing: number;
 batter: number;
 coating: number;
 };
 
 // Pieces per stuffing batch for each type (key = chickenMomos etc.), from 25 Oct 2026.
 // Each type's `final` is the sum of its batches.
 batches?: Partial<Record<string, ProductionBatch[]>>;

 // Sauces and Chutneys
 sauces: {
 panfriedSauce: number;
 chilliChickenSauce: number;
 spicyKoreanSauce: number;
 hotGarlicSauce: number;
 tandooriSauce: number;
 soupPremix: number;
 greenMayoChutney: number;
 spicyRedChutney: number;
 };
};

export type InventoryContextType = {
 inventory: InventoryItem[];
 overheads: OverheadItem[];
 fixedCosts: FixedCostItem[];
 salesData: SalesData[];
 categorySalesData: api.SalesDataRecord[]; // NEW: Detailed momo sales by type
 onlineCashRecalibrations: OnlineCashRecalibration[];
 onlineSalesData: api.OnlineSalesEntry[];
 onlinePayoutData: api.OnlinePayoutEntry[];
 aggregatorSettlements: api.AggregatorSettlement[];
 productionData: ProductionData[];
 productionHouses: api.ProductionHouse[];
 stockRequests: api.StockRequest[];
 productionRequests: api.ProductionRequest[];
 stores: api.Store[];
 managedStoreIds?: string[];
 managedProductionHouseIds?: string[];
 inventoryItems: api.DynamicInventoryItem[];
 loadInventoryItems: () => Promise<void>;
 addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
 addOverheadItem: (item: Omit<OverheadItem, 'id'>) => Promise<void>;
 addFixedCostItem: (item: Omit<FixedCostItem, 'id'>) => Promise<void>;
 updateInventoryItem: (id: string, item: Omit<InventoryItem, 'id'>) => Promise<void>;
 updateOverheadItem: (id: string, item: Omit<OverheadItem, 'id'>) => Promise<void>;
 updateFixedCostItem: (id: string, item: Omit<FixedCostItem, 'id'>) => Promise<void>;
 deleteInventoryItem: (id: string) => Promise<void>;
 deleteOverheadItem: (id: string) => Promise<void>;
 deleteFixedCostItem: (id: string) => Promise<void>;
 addSalesData: (item: Omit<SalesData, 'id'>) => Promise<void>;
 updateSalesData: (id: string, item: Omit<SalesData, 'id'>) => Promise<void>;
 approveSalesData: (id: string) => Promise<void>;
 requestSalesApproval: (id: string, requestedCashInHand: number, requestedOffset: number) => Promise<void>;
 approveDiscrepancy: (id: string) => Promise<void>;
 rejectDiscrepancy: (id: string, reason: string) => Promise<void>;
 addProductionData: (item: Omit<ProductionData, 'id'>) => Promise<void>;
 updateProductionData: (id: string, item: Omit<ProductionData, 'id'>) => Promise<void>;
 approveProductionData: (id: string) => Promise<void>;
 addProductionHouse: (house: Omit<api.ProductionHouse, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
 updateProductionHouse: (id: string, updates: Partial<Omit<api.ProductionHouse, 'id' | 'createdAt'>>) => Promise<void>;
 updateProductionHouseInventory: (id: string, inventory: api.ProductionHouse['inventory']) => Promise<void>;
 deleteProductionHouse: (id: string) => Promise<void>;
 setProductionHouses: (houses: api.ProductionHouse[]) => void;
 createStockRequest: (request: Omit<api.StockRequest, 'id' | 'fulfilledQuantities' | 'status' | 'fulfilledBy' | 'fulfilledByName' | 'fulfillmentDate' | 'notes'>) => Promise<void>;
 fulfillStockRequest: (id: string, fulfilledQuantities: api.StockRequest['fulfilledQuantities'], fulfilledBy: string, fulfilledByName: string, notes?: string) => Promise<void>;
 cancelStockRequest: (id: string) => Promise<void>;
 isManager: boolean;
 user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null; assignedStoreIds?: string[]; assignedProductionHouseIds?: string[] } | null;
 // Force-refreshes all context data in place (bypassing cache) - lets a child component
 // pull in fresh data after a server-side action (e.g. a manual POS sync) without a full
 // page reload, same underlying loadData() the nav bar's "Refresh data" button already uses.
 refreshData: () => Promise<void>;
 // Timestamp of the last manual "Refresh data" press - watch this in a useEffect
 // dependency array to re-fetch data a component loads independently of context (see
 // dataRefreshedAt's own comment above).
 dataRefreshedAt: number;
};

export default function App() {
 // All useState hooks must be at the top, before any conditional returns
 const [activeView, setActiveViewRaw] = useState<'inventory' | 'sales' | 'payroll' | 'analytics' | 'export' | 'attendance' | 'employees' | 'assets' | 'production' | 'stock-requests' | 'advanced-inventory' | 'inventory-items' | 'backup' | 'riders' | 'rider-profile' | 'receive-stock' | 'stock-outs'>('analytics');
 // Wrap in startTransition to prevent Suspense from replacing UI with loading indicator on tab switches
 const setActiveView = useCallback((view: typeof activeView) => {
 startTransition(() => { setActiveViewRaw(view); });
 }, []);
 // Remembers which view to return to from "Manage Items" (Inventory Items Master has
 // no other way back - it's not one of the buttons in the top nav bar itself).
 const [preManageItemsView, setPreManageItemsView] = useState<typeof activeView>('analytics');
 // Same idea, for Analytics' "Production Management" button - it's a full navigation
 // (not a sub-tab), so without this there was no way back to whichever Analytics view
 // sent the user here (CONFIRMED bug, found 2026-09-05).
 const [preProductionManagementView, setPreProductionManagementView] = useState<typeof activeView>('analytics');
 const [user, setUser] = useState<{ email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null; assignedStoreIds?: string[]; assignedProductionHouseIds?: string[] } | null>(null);
 // Bunny chat: which screen is open (so it can explain it) and whose language choice applies.
 useEffect(() => { setScreenPage(activeView); }, [activeView]);
 useEffect(() => { setLanguageOwner(user?.employeeId || user?.email || null); }, [user?.employeeId, user?.email]);
 const [authError, setAuthError] = useState<string | null>(null);
 const [isCheckingAuth, setIsCheckingAuth] = useState(true);
 const [highlightRequestId, setHighlightRequestId] = useState<string | null>(null);
 const [highlightTab, setHighlightTab] = useState<string | null>(null);
 const [inventory, setInventory] = useState<InventoryItem[]>([]);
 const [overheads, setOverheads] = useState<OverheadItem[]>([]);
 const [fixedCosts, setFixedCosts] = useState<FixedCostItem[]>([]);
 const [salesData, setSalesData] = useState<SalesData[]>([]);
 const [categorySalesData, setCategorySalesData] = useState<api.SalesDataRecord[]>([]); // NEW: Detailed momo sales
 const [onlineCashRecalibrations, setOnlineCashRecalibrations] = useState<OnlineCashRecalibration[]>([]);
 // Consolidated here (Analytics page redesign) so Analytics.tsx, OnlineSalesTab.tsx, and
 // SalesData.tsx all read one shared fetch instead of three independent ones.
 const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
 const [onlinePayoutData, setOnlinePayoutData] = useState<api.OnlinePayoutEntry[]>([]);
 const [aggregatorSettlements, setAggregatorSettlements] = useState<api.AggregatorSettlement[]>([]);
 const [productionData, setProductionData] = useState<ProductionData[]>([]);
 const [isLoadingData, setIsLoadingData] = useState(false);
 const [dataError, setDataError] = useState<string | null>(null);
 // Bumped on every manual "Refresh data" press - a signal for child components that fetch
 // their OWN data independently of context (e.g. cash top-up requests in
 // SalesManagement.tsx/SalesView.tsx) to know a refresh happened and re-fetch too. Without
 // this, pressing refresh silently updated every context-driven figure (Cash in Hand,
 // Total Cash in Hand) while the Cash Top-up list/status sat stale until the next full page
 // reload or the user's own approve/reject/submit action on it.
 const [dataRefreshedAt, setDataRefreshedAt] = useState(0);
 const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
 const [showPushNotificationPanel, setShowPushNotificationPanel] = useState(false);
 const [stores, setStores] = useState<api.Store[]>([]);
 const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
 const [productionHouses, setProductionHouses] = useState<api.ProductionHouse[]>([]);
 const [stockRequests, setStockRequests] = useState<api.StockRequest[]>([]);
 const [productionRequests, setProductionRequests] = useState<api.ProductionRequest[]>([]);
 const [employees, setEmployees] = useState<api.Employee[]>([]);
 const [managedStoreIds, setManagedStoreIds] = useState<string[]>([]);
 const [managedProductionHouseIds, setManagedProductionHouseIds] = useState<string[]>([]);
 const [inventoryItems, setInventoryItems] = useState<api.DynamicInventoryItem[]>([]);

 // Get singleton Supabase client
 const supabaseClient = getSupabaseClient();


 // Load stores for cluster heads
 const loadStores = async () => {
 try {
 const storesData = await api.getStores();
 setStores(storesData);
 } catch (error) {
 // Silently handle authentication errors (user not logged in yet)
 if (error instanceof Error && 
 (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
 return;
 }
 console.error('Error loading stores:', error);
 }
 };

 // Load employees for cluster heads
 const loadEmployees = async () => {
 try {
 const employeesData = await api.getAllEmployees();
 setEmployees(employeesData);
 } catch (error) {
 // Silently handle authentication errors (user not logged in yet)
 if (error instanceof Error && 
 (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
 return;
 }
 console.error('Error loading employees:', error);
 }
 };

 // Load cluster data for cluster heads
 const loadClusterData = async (accessToken: string) => {
 try {
 const clusterInfo = await api.getClusterInfo(accessToken);
 if (clusterInfo) {
 setManagedStoreIds(clusterInfo.managedStoreIds || []);
 setManagedProductionHouseIds(clusterInfo.managedProductionHouseIds || []);
 console.log('🌐 Cluster assignments loaded:', {
 stores: clusterInfo.managedStoreIds?.length || 0,
 productionHouses: clusterInfo.managedProductionHouseIds?.length || 0
 });
 }
 } catch (error) {
 // Silently handle - cluster head might not have assignments yet
 console.log('No cluster assignments found (this is okay for new cluster heads)');
 }
 };

 // Load inventory and overhead data with aggressive caching
 const loadData = async (accessToken: string, forceRefresh = false) => {
 // Try to load from cache first for instant display
 const cacheKeys = [
 'inventory',
 'overheads',
 'fixedCosts',
 'salesData',
 'categorySales',
 'productionData',
 'productionHouses',
 'stockRequests',
 'productionRequests',
 'inventoryItems',
 'onlineCashRecalibrations',
 'onlineSalesData',
 'onlinePayoutData',
 'aggregatorSettlements'
 ];

 // Load cached data immediately if available
 if (!forceRefresh) {
 const cachedData = dataCache.batchGetCache(cacheKeys);
 
 if (cachedData.get('inventory')) {
 console.log('⚡ Loading from cache - instant display!');
 setInventory(cachedData.get('inventory') as InventoryItem[] || []);
 setOverheads(cachedData.get('overheads') as OverheadItem[] || []);
 setFixedCosts(cachedData.get('fixedCosts') as FixedCostItem[] || []);
 setSalesData(cachedData.get('salesData') as SalesData[] || []);
 setCategorySalesData((cachedData.get('categorySales') as any)?.data || []);
 setProductionData(cachedData.get('productionData') as ProductionData[] || []);
 setProductionHouses(cachedData.get('productionHouses') as api.ProductionHouse[] || []);
 setStockRequests(cachedData.get('stockRequests') as api.StockRequest[] || []);
 setProductionRequests(cachedData.get('productionRequests') as api.ProductionRequest[] || []);
 setInventoryItems(cachedData.get('inventoryItems') as api.DynamicInventoryItem[] || []);
 setOnlineCashRecalibrations(cachedData.get('onlineCashRecalibrations') as OnlineCashRecalibration[] || []);
 setOnlineSalesData(cachedData.get('onlineSalesData') as api.OnlineSalesEntry[] || []);
 setOnlinePayoutData(cachedData.get('onlinePayoutData') as api.OnlinePayoutEntry[] || []);
 setAggregatorSettlements(cachedData.get('aggregatorSettlements') as api.AggregatorSettlement[] || []);

 // Check if cache is fresh
 const isFresh = cacheKeys.every(key => dataCache.isCacheFresh(key));
 if (isFresh) {
 console.log('✅ Cache is fresh - skipping API calls');
 return; // Cache is fresh, no need to fetch
 }
 console.log('⚡ Cache loaded, refreshing in background...');
 }
 }

 setIsLoadingData(true);
 setDataError(null);
 try {
 console.log('🔍 Starting loadData - fetching from API...');
 const [inventoryData, overheadsData, fixedCostsData, salesData, categorySalesResponse, productionData, productionHousesData, stockRequestsData, productionRequestsData, inventoryItemsData, onlineCashRecalibrationsData, onlineSalesDataResult, onlinePayoutDataResult, aggregatorSettlementsData] = await Promise.all([
 api.fetchInventory(accessToken),
 api.fetchOverheads(accessToken),
 api.fetchFixedCosts(accessToken),
 api.fetchSalesData(accessToken),
 api.getSalesData(accessToken), // NEW: Detailed category sales data
 api.fetchProductionData(),
 api.getProductionHouses(),
 api.getStockRequests(accessToken),
 api.fetchProductionRequests(accessToken),
 api.fetchInventoryItems(), // NEW: Dynamic inventory items metadata
 api.fetchOnlineCashRecalibrations(accessToken), // NEW: Online cash recalibrations
 api.getOnlineSalesData(accessToken),
 api.getOnlinePayoutData(accessToken),
 api.getAggregatorSettlements(accessToken)
 ]);
 
 console.log('🔍 Stock Requests API Response:', stockRequestsData);
 console.log('🔍 Stock Requests count:', stockRequestsData?.length || 0);
 console.log('🔍 Sample stock request:', stockRequestsData?.[0]);
 
 // Debug logging to check for duplicates
 console.log('📦 Loaded Inventory Purchase Records (Raw Materials):', inventoryData.length);
 console.log('🔧 Loaded Overhead/Expense Items:', overheadsData.length);
 console.log('🔧 Loaded Fixed Cost Items:', fixedCostsData.length);
 
 // Deduplicate by ID using Map (keeps the first occurrence of each ID)
 const uniqueInventory = Array.from(
 new Map(inventoryData.map(item => [item.id, item])).values()
 );
 
 const uniqueOverheads = Array.from(
 new Map(overheadsData.map(item => [item.id, item])).values()
 );
 
 const uniqueFixedCosts = Array.from(
 new Map(fixedCostsData.map(item => [item.id, item])).values()
 );
 
 const uniqueSalesData = Array.from(
 new Map(salesData.map(item => [item.id, item])).values()
 );
 
 const uniqueProductionData = Array.from(
 new Map(productionData.map(item => [item.id, item])).values()
 );
 
 const inventoryDupes = inventoryData.length - uniqueInventory.length;
 const overheadDupes = overheadsData.length - uniqueOverheads.length;
 const fixedCostDupes = fixedCostsData.length - uniqueFixedCosts.length;
 const salesDupes = salesData.length - uniqueSalesData.length;
 const productionDupes = productionData.length - uniqueProductionData.length;
 const totalDupes = inventoryDupes + overheadDupes + fixedCostDupes + salesDupes + productionDupes;
 
 console.log('✅ After deduplication:');
 console.log('Inventory Purchase Records: Before:', inventoryData.length, '→ After:', uniqueInventory.length);
 console.log('Overhead/Expense Items: Before:', overheadsData.length, '→ After:', uniqueOverheads.length);
 console.log('Fixed Costs: Before:', fixedCostsData.length, '→ After:', uniqueFixedCosts.length);
 console.log('Sales: Before:', salesData.length, '→ After:', uniqueSalesData.length);
 
 // Silently auto-clean duplicates for cluster heads in background
 if (totalDupes > 0) {
 // Don't log warning to console - just clean silently
 // Check if we already cleaned in this session to prevent refresh loop
 const hasCleanedThisSession = sessionStorage.getItem('db_cleaned');
 
 if (!hasCleanedThisSession) {
 setTimeout(async () => {
 try {
 const userData = await supabaseClient.auth.getUser(accessToken);
 const userRole = userData.data?.user?.app_metadata?.role ?? userData.data?.user?.user_metadata?.role;
 
 // Only proceed if user is authenticated and is a cluster head
 if (userData.data?.user && userRole === 'cluster_head') {
 console.log('🧹 Silently cleaning duplicates in background...');
 sessionStorage.setItem('db_cleaned', 'true'); // Mark as cleaned
 const result = await api.cleanupDuplicates(accessToken);
 console.log(`✅ Cleaned ${result.removed} duplicates successfully`);
 // Don't reload - duplicates are already deduplicated in memory
 // Reload would cause issues if session expires during cleanup
 }
 } catch (error) {
 // Silently fail if not authenticated or other errors
 console.log('Auto-cleanup skipped:', error instanceof Error ? error.message : 'Unknown error');
 // Don't remove the flag - this prevents infinite retry loops
 // The duplicates are already deduplicated in memory anyway
 }
 }, 1500); // Small delay to ensure UI is loaded
 }
 }
 
 setInventory(uniqueInventory);
 setOverheads(uniqueOverheads);
 setFixedCosts(uniqueFixedCosts);
 setSalesData(uniqueSalesData);
 setCategorySalesData(categorySalesResponse.data || []); // NEW: Set category sales data
 setProductionData(uniqueProductionData);
 setProductionHouses(productionHousesData);
 console.log('📦 Loaded Stock Requests from API:', stockRequestsData.length, stockRequestsData);
 setStockRequests(stockRequestsData);
 setProductionRequests(productionRequestsData);
 setInventoryItems(inventoryItemsData); // NEW: Set inventory items metadata
 setOnlineCashRecalibrations(onlineCashRecalibrationsData); // NEW: Set online cash recalibrations
 setOnlineSalesData(onlineSalesDataResult || []);
 setOnlinePayoutData(onlinePayoutDataResult || []);
 setAggregatorSettlements(aggregatorSettlementsData || []);

 // Cache all data for instant future loads
 const cacheMap = new Map<string, any>();
 cacheMap.set('inventory', uniqueInventory);
 cacheMap.set('overheads', uniqueOverheads);
 cacheMap.set('fixedCosts', uniqueFixedCosts);
 cacheMap.set('salesData', uniqueSalesData);
 cacheMap.set('categorySales', categorySalesResponse);
 cacheMap.set('productionData', uniqueProductionData);
 cacheMap.set('productionHouses', productionHousesData);
 cacheMap.set('stockRequests', stockRequestsData);
 cacheMap.set('productionRequests', productionRequestsData);
 cacheMap.set('inventoryItems', inventoryItemsData);
 cacheMap.set('onlineCashRecalibrations', onlineCashRecalibrationsData);
 cacheMap.set('onlineSalesData', onlineSalesDataResult);
 cacheMap.set('onlinePayoutData', onlinePayoutDataResult);
 cacheMap.set('aggregatorSettlements', aggregatorSettlementsData);
 dataCache.batchSetCache(cacheMap);
 console.log('💾 Data cached for instant future loads');
 } catch (error) {
 // Silently handle authentication errors (user not logged in yet)
 if (error instanceof Error && 
 (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
 return;
 }
 console.error('Error loading data:', error);
 setDataError('Failed to load inventory data. Please refresh the page.');
 } finally {
 setIsLoadingData(false);
 }
 };

 // Load inventory items metadata
 const loadInventoryItems = async () => {
 try {
 const items = await api.fetchInventoryItems();
 // Writing the item list is for the cluster head and managers only (the server refuses
 // anyone else), so nobody else tries the set-up writes below.
 const canEditItems = user?.role === 'cluster_head' || user?.role === 'manager';
 
 // If no items exist, initialize defaults
 if (items.length === 0 && canEditItems) {
 console.log('📦 No inventory items found, initializing defaults...');
 try {
 await api.initializeDefaultInventoryItems();
 // Reload after initialization
 const reloadedItems = await api.fetchInventoryItems();
 setInventoryItems(reloadedItems);
 console.log(`✅ Initialized ${reloadedItems.length} default inventory items`);
 return;
 } catch (initError) {
 console.error('Error initializing default items:', initError);
 // Continue with empty array
 setInventoryItems([]);
 return;
 }
 }
 
 setInventoryItems(items);
 
 // Auto-migrate: Ensure the 7 core momo types exist as inventory items
 if (canEditItems) await ensureCoreMomosExist(items);
 } catch (error) {
 console.error('Error loading inventory items:', error);
 setInventoryItems([]);
 }
 };

 // Ensure the 7 core momo types exist as inventory items (migration/setup)
 const ensureCoreMomosExist = async (existingItems: api.DynamicInventoryItem[]) => {
 const coreMomos = [
 { name: 'chicken', displayName: 'Chicken Momos', variations: ['chicken momo', 'chicken momos'] },
 { name: 'chickenCheese', displayName: 'Chicken Cheese Momos', variations: ['chicken cheese momo', 'chicken cheese momos', 'chicken cheese'] },
 { name: 'veg', displayName: 'Veg Momos', variations: ['veg momo', 'veg momos', 'vegetable momos'] },
 { name: 'cheeseCorn', displayName: 'Cheese Corn Momos', variations: ['cheese corn momo', 'cheese corn momos', 'corn cheese'] },
 { name: 'paneer', displayName: 'Paneer Momos', variations: ['paneer momo', 'paneer momos'] },
 { name: 'vegKurkure', displayName: 'Veg Kurkure Momos', variations: ['veg kurkure momo', 'veg kurkure momos', 'veg kurkure'] },
 { name: 'chickenKurkure', displayName: 'Chicken Kurkure Momos', variations: ['chicken kurkure momo', 'chicken kurkure momos', 'chicken kurkure'] },
 ];

 try {
 let needsReload = false;
 
 for (const momo of coreMomos) {
 // Find existing item by name match (exact)
 let existingItem = existingItems.find(item => 
 item.name.toLowerCase() === momo.name.toLowerCase()
 );

 // If not found by name, try to find by displayName or variations
 if (!existingItem) {
 existingItem = existingItems.find(item => {
 const itemNameLower = item.displayName.toLowerCase();
 const momoNameLower = momo.displayName.toLowerCase();
 
 // Check if display names match (with or without "Momos")
 if (itemNameLower === momoNameLower) return true;
 if (itemNameLower.replace(/\s*momos?\s*/i, '').trim() === momoNameLower.replace(/\s*momos?\s*/i, '').trim()) return true;
 
 // Check variations
 return momo.variations.some(v => itemNameLower.includes(v.toLowerCase()));
 });
 }

 if (existingItem) {
 // Item exists but might have wrong name field - update it
 if (existingItem.name !== momo.name) {
 console.log(`🔧 Updating inventory item name: "${existingItem.displayName}" from "${existingItem.name}" to "${momo.name}"`);
 await api.updateInventoryItem(existingItem.id, {
 name: momo.name,
 displayName: momo.displayName,
 });
 needsReload = true;
 }
 } else {
 // Item doesn't exist - create it
 console.log(`📦 Creating core inventory item: ${momo.displayName}`);
 await api.addInventoryItem({
 name: momo.name,
 displayName: momo.displayName,
 category: 'finished_product',
 unit: 'pieces',
 linkedEntityType: 'global',
 createdBy: 'system'
 });
 needsReload = true;
 }
 }
 
 // Reload items after migration if changes were made
 if (needsReload) {
 const updatedItems = await api.fetchInventoryItems();
 setInventoryItems(updatedItems);
 }
 } catch (error) {
 console.error('Error ensuring core momos exist:', error);
 }
 };

 // Check for existing session on mount using useEffect
 useEffect(() => {
 // Clear any stale redirect flags from previous sessions
 sessionStorage.removeItem('logout_redirect_in_progress');
 
 // Clean up old cache entries on app initialization
 dataCache.clearOldCaches();
 
 const checkSession = async () => {
 try {
 // First check if there's an existing session
 const { data: { session: existingSession } } = await supabaseClient.auth.getSession();
 
 if (!existingSession) {
 // No session at all, user needs to log in
 setIsCheckingAuth(false);
 return;
 }
 
 // Try to refresh to get a fresh token
 const { data: { session: refreshedSession }, error: refreshError } = await supabaseClient.auth.refreshSession();
 
 if (refreshError || !refreshedSession) {
 console.warn('Session refresh failed:', refreshError?.message || 'No session returned');
 // If refresh fails but we have an existing session, try to use it
 if (existingSession?.user) {
 await processSession(existingSession);
 } else {
 // Session is invalid, clear it
 await supabaseClient.auth.signOut();
 setIsCheckingAuth(false);
 }
 } else {
 // Successfully refreshed
 await processSession(refreshedSession);
 }
 } catch (error) {
 console.log('Session check error:', error);
 } finally {
 setIsCheckingAuth(false);
 }
 };
 
 const processSession = async (session: any) => {
 let storeId = null;
 let designation = (session.user.app_metadata?.designation ?? session.user.user_metadata?.designation) || null;
 let assignedStoreIds: string[] = [];
 let assignedProductionHouseIds: string[] = [];

 // For employees, fetch full employee record to get storeId
 if ((session.user.app_metadata?.employeeId ?? session.user.user_metadata?.employeeId)) {
 try {
 const employees = await api.getEmployees();
 const employeeRecord = employees.find(emp => emp.employeeId === (session.user.app_metadata?.employeeId ?? session.user.user_metadata?.employeeId));
 if (employeeRecord) {
 storeId = employeeRecord.storeId || null;
 designation = employeeRecord.designation || designation;
 assignedStoreIds = employeeRecord.assignedStoreIds || [];
 assignedProductionHouseIds = employeeRecord.assignedProductionHouseIds || [];
 }
 } catch (error) {
 console.error('Error fetching employee storeId on session check:', error);
 }
 }

 const userData = {
 email: session.user.email || '',
 name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
 role: (session.user.app_metadata?.role ?? session.user.user_metadata?.role) || 'manager',
 employeeId: (session.user.app_metadata?.employeeId ?? session.user.user_metadata?.employeeId) || null,
 accessToken: session.access_token,
 storeId,
 designation,
 assignedStoreIds,
 assignedProductionHouseIds
 };
 setUser(userData);
 // Read and write this person's own cache (shared phones - see dataCache.ts)
 dataCache.setCacheUser(userData.employeeId || userData.email);
 
 // Load data for the user
 await loadData(session.access_token);
 
 // Load stores and employees for managers (cluster heads, operations managers, and audit users need this)
 if (userData.role === 'cluster_head' || userData.role === 'manager' || userData.role === 'audit') {
 await loadStores();
 await loadEmployees();
 if (userData.role === 'cluster_head') {
 await loadClusterData(session.access_token);
 }
 }
 };
 
 checkSession();
 }, []); // Empty dependency array - only run once on mount

 // Shared by both the web-push (service worker) and native (Capacitor/FCM) navigation paths,
 // and by the in-app notification bell (Notifications.tsx) - one resolver, so every entry
 // point lands on the same place.
 const applyNavigationTarget = useCallback((target: { view: string; tab?: string; highlightRequestId?: string }) => {
 console.log('🔔 [nav] applyNavigationTarget called with:', target);
 if (!target?.view) {
 console.log('🔔 [nav] No view on target, bailing out');
 return;
 }
 // Only plain "employee"-role users have a standalone Attendance tab; managers and
 // cluster heads reach the same screens through Employee Management's Attendance sub-tab.
 const view = target.view === 'attendance' && user?.role !== 'employee' ? 'employees' : target.view;
 setActiveView(view as typeof activeView);
 setHighlightTab(target.tab || null);
 if (target.highlightRequestId) {
 setHighlightRequestId(target.highlightRequestId);
 }
 console.log('🔔 [nav] Applied: view=', view, 'tab=', target.tab, 'highlightRequestId=', target.highlightRequestId);
 }, [setActiveView, user]);

 // Riders share their live location for the whole active ride, whichever screen is open
 // (it used to stop when they left the Riders screen mid-delivery).
 useRiderLocationSharing(user?.designation === 'rider');

 // Initialize push notifications when user logs in
 useEffect(() => {
 if (user) {
 const userId = user.employeeId || user.email;

 // Native (Android) push goes through Capacitor + FCM, not the web-push/VAPID flow below.
 if (nativePushNotifications.isNativePushSupported()) {
 nativePushNotifications.initializeNativePushNotifications(userId, applyNavigationTarget);
 return;
 }

 const setupPushNotifications = async () => {
 try {
 // Check if push notifications are supported
 if (!pushNotifications.isPushNotificationSupported()) {
 console.log('Push notifications not supported on this device');
 return;
 }

 // Get VAPID public key from server
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/vapid-public-key`,
 {
 headers: {
 'Authorization': `Bearer ${publicAnonKey}`
 }
 }
 );

 if (!response.ok) {
 console.log('Could not fetch VAPID key - push notifications disabled');
 return;
 }

 const data = await response.json();

 if (!data.configured || !data.publicKey) {
 console.log('📱 Push notifications not configured. To enable, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
 return;
 }

 // Initialize push notifications with user ID
 const success = await pushNotifications.initializePushNotifications(userId, data.publicKey);

 if (success) {
 console.log('🔔 Push notifications enabled successfully for user:', userId);
 }
 // Note: Detailed status messages are now logged by initializePushNotifications
 } catch (error) {
 console.log('ℹ️ Push notifications setup skipped:', error instanceof Error ? error.message : 'Unknown error');
 }
 };

 setupPushNotifications();
 }
 }, [user, applyNavigationTarget]); // Run when user changes

 // Periodic background refresh - without this, data loaded from cache on mount (e.g.
 // onlineSalesData/aggregatorSettlements) only ever updates again on a manual "Refresh
 // Data" click or a full page reload, so a POS sync that lands mid-session (not just the
 // nightly one) can sit stale in a tab left open for a while. Matches dataCache's own
 // 5-minute freshness window; only runs while the tab is actually visible so it doesn't
 // burn API calls in a backgrounded tab.
 useEffect(() => {
 if (!user) return;

 const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
 const tick = () => {
 if (document.visibilityState === 'visible') {
 console.log('🔄 Periodic background refresh (5 min)');
 loadData(user.accessToken, true);
 }
 };

 const interval = setInterval(tick, REFRESH_INTERVAL_MS);
 return () => clearInterval(interval);
 }, [user]);

 // Deep-link handling for push notification clicks (see public/sw.js).
 // Two delivery paths depending on whether a tab was already open when clicked:
 // 1. Tab already open: service worker postMessages this window directly.
 // 2. No tab open: service worker opens a new window with ?view=&tab=&highlightRequestId= params.
 useEffect(() => {
 console.log('🔔 [nav] Registering service worker message listener');

 // Case 1: tab was already open, service worker messages us directly
 const handleServiceWorkerMessage = (event: MessageEvent) => {
 console.log('🔔 [nav] Received message from service worker:', event.data);
 if (event.data?.type === 'notification-navigate' && event.data.target) {
 applyNavigationTarget(event.data.target);
 }
 };
 navigator.serviceWorker?.addEventListener?.('message', handleServiceWorkerMessage);

 // Case 2: a new window was opened with the target encoded in the URL
 const params = new URLSearchParams(window.location.search);
 const viewParam = params.get('view');
 const tabParam = params.get('tab');
 const highlightParam = params.get('highlightRequestId');
 if (viewParam) {
 console.log('🔔 [nav] Found navigation params in URL:', { viewParam, tabParam, highlightParam });
 applyNavigationTarget({ view: viewParam, tab: tabParam || undefined, highlightRequestId: highlightParam || undefined });
 // Clean the URL so refreshing doesn't re-trigger the same navigation
 window.history.replaceState({}, '', window.location.pathname);
 }

 return () => {
 navigator.serviceWorker?.removeEventListener?.('message', handleServiceWorkerMessage);
 };
 }, [applyNavigationTarget]);

 const handleLogin = async (email: string, password: string) => {
 setAuthError(null);
 try {
 const { data, error } = await supabaseClient.auth.signInWithPassword({
 email,
 password
 });

 if (error) {
 setAuthError(error.message);
 return;
 }

 if (data.user && data.session) {
 let storeId = null;
 let designation = (data.user.app_metadata?.designation ?? data.user.user_metadata?.designation) || null;
 let assignedStoreIds: string[] = [];
 let assignedProductionHouseIds: string[] = [];

 // For employees, fetch full employee record to get storeId
 if ((data.user.app_metadata?.employeeId ?? data.user.user_metadata?.employeeId)) {
 try {
 const employees = await api.getEmployees();
 const employeeRecord = employees.find(emp => emp.employeeId === (data.user.app_metadata?.employeeId ?? data.user.user_metadata?.employeeId));
 if (employeeRecord) {
 storeId = employeeRecord.storeId || null;
 designation = employeeRecord.designation || designation;
 assignedStoreIds = employeeRecord.assignedStoreIds || [];
 assignedProductionHouseIds = employeeRecord.assignedProductionHouseIds || [];
 }
 } catch (error) {
 console.error('Error fetching employee storeId:', error);
 }
 }

 const userData = {
 email: data.user.email || '',
 name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
 role: (data.user.app_metadata?.role ?? data.user.user_metadata?.role) || 'manager',
 employeeId: (data.user.app_metadata?.employeeId ?? data.user.user_metadata?.employeeId) || null,
 accessToken: data.session.access_token,
 storeId,
 designation,
 assignedStoreIds,
 assignedProductionHouseIds
 };
 setUser(userData);
 // Read and write this person's own cache (shared phones - see dataCache.ts)
 dataCache.setCacheUser(userData.employeeId || userData.email);
 
 // Load data for the user
 await loadData(data.session.access_token);
 
 // Load stores and employees for managers (cluster heads, operations managers, and audit users need this)
 if (userData.role === 'cluster_head' || userData.role === 'manager' || userData.role === 'audit') {
 await loadStores();
 await loadEmployees();
 }
 }
 } catch (error) {
 console.log('Login error:', error);
 setAuthError('Failed to sign in. Please try again.');
 }
 };

 const handleSignup = async (email: string, password: string, name: string, role: 'manager' | 'cluster_head' | 'employee' | 'audit') => {
 setAuthError(null);
 try {
 // Use server-side signup which auto-confirms email
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/auth/signup`,
 {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${publicAnonKey}`
 },
 body: JSON.stringify({
 email,
 password,
 name,
 role,
 employeeId: role === 'cluster_head' ? 'BM001' : role === 'audit' ? 'AUDIT001' : null
 })
 }
 );

 const data = await response.json();

 if (!response.ok) {
 setAuthError(data.error || 'Failed to create account');
 return;
 }

 if (!data.user) {
 setAuthError('Failed to create account');
 return;
 }

 // Create unified employee record for cluster head or audit
 if (role === 'cluster_head' || role === 'audit') {
 try {
 const employeeId = role === 'cluster_head' ? 'BM001' : 'AUDIT001';
 await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/unified-employees`,
 {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${publicAnonKey}`
 },
 body: JSON.stringify({
 employeeId: employeeId,
 name: name,
 email: email,
 role: role,
 employmentType: 'fulltime',
 joiningDate: getTodayIST(),
 createdBy: 'system',
 status: 'active',
 authUserId: data.user.id
 })
 }
 );
 } catch (err) {
 console.log('Error creating unified employee record:', err);
 }
 }

 // After successful signup, sign in the user
 await handleLogin(email, password);
 } catch (error) {
 console.log('Signup error:', error);
 setAuthError('Failed to create account. Please try again.');
 }
 };

 const handleLogout = async () => {
 // Tell the server this phone no longer belongs to this account, so their notifications (and the
 // rider's loud ride-request alert) stop arriving here after sign-out.
 try {
 if (user && nativePushNotifications.isNativePushSupported()) {
 await nativePushNotifications.unsubscribeNativePushNotifications(user.employeeId || user.email);
 } else if (user && pushNotifications.isPushNotificationSupported()) {
 // Same for the browser's web-push subscription, or the next person to sign in on this
 // browser keeps receiving this person's notifications.
 await pushNotifications.unsubscribeFromPushNotifications(user.employeeId || user.email);
 }
 } catch (error) {
 console.log('Could not unsubscribe push on logout:', error);
 }
 await supabaseClient.auth.signOut();
 setUser(null);
 setInventory([]);
 setOverheads([]);
 setFixedCosts([]);
 setSalesData([]);
 setActiveView('sales');
 dataCache.invalidateAllCaches(); // Clear all caches on logout
 dataCache.setCacheUser(null);
 };

 const handleRefreshData = async () => {
 if (!user) return;
 console.log('🔄 Manual refresh triggered');
 await loadData(user.accessToken, true); // Force refresh bypasses cache
 setDataRefreshedAt(Date.now());
 };

 // DIAGNOSTIC: Check inventory database status
 const checkInventoryStatus = async () => {
 try {
 console.log('🔍 [DIAGNOSTIC] Checking inventory database status...');
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/diagnostic/inventory-status`,
 {
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${user?.accessToken || publicAnonKey}`
 }
 }
 );
 
 const data = await response.json();
 console.log('📊 [DIAGNOSTIC] Database status:', data);
 console.log(`📊 [DIAGNOSTIC] Total items in DB: ${data.totalInventoryCount}`);
 console.log(`📊 [DIAGNOSTIC] March 17 items: ${data.march17Count}`);
 if (data.march17Items && data.march17Items.length > 0) {
 console.table(data.march17Items);
 }
 console.log('📊 [DIAGNOSTIC] Latest 10 items:', data.latestItemIds);
 return data;
 } catch (error) {
 console.error('❌ [DIAGNOSTIC] Error:', error);
 }
 };

 // DIAGNOSTIC: Check all database key prefixes
 const checkAllKeys = async () => {
 try {
 console.log('🔍 [DIAGNOSTIC] Checking all database keys...');
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/diagnostic/all-keys`,
 {
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${user?.accessToken || publicAnonKey}`
 }
 }
 );
 
 const data = await response.json();
 console.log('📊 [DIAGNOSTIC] All keys result:', data);
 console.log('📊 [DIAGNOSTIC] Total sampled:', data.totalSampled);
 console.log('📊 [DIAGNOSTIC] Prefix summary:');
 console.table(data.prefixSummary);
 console.log('📊 [DIAGNOSTIC] Sample keys:', data.sampleKeys);
 return data;
 } catch (error) {
 console.error('❌ [DIAGNOSTIC] Error:', error);
 }
 };

 // DIAGNOSTIC: Search for backup keys
 const checkBackups = async () => {
 try {
 console.log('🔍 [DIAGNOSTIC] Searching for backup data...');
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/diagnostic/search-backups`,
 {
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${user?.accessToken || publicAnonKey}`
 }
 }
 );
 
 const data = await response.json();
 console.log('📊 [DIAGNOSTIC] Backup search result:', data);
 if (data.backups && data.backups.length > 0) {
 console.log('✅ Found backups:');
 console.table(data.backups);
 } else {
 console.log('❌ No backups found');
 }
 return data;
 } catch (error) {
 console.error('❌ [DIAGNOSTIC] Error:', error);
 }
 };

 // Expose diagnostic function globally for debugging
 (window as any).checkInventoryStatus = checkInventoryStatus;
 (window as any).checkAllKeys = checkAllKeys;
 (window as any).checkBackups = checkBackups;

 const addInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
 if (!user) {
 console.error('❌ [ADD INVENTORY] No user found');
 return;
 }
 
 try {
 console.log('🚀 [ADD INVENTORY] Starting addInventoryItem...');
 console.log('📊 [ADD INVENTORY] Current inventory count:', inventory.length);
 
 // The item's own storeId wins; the user's storeId only fills it in when missing (this
 // used to overwrite the store an operations manager or cluster head picked). Never for a
 // production-house-tagged item, which is identified by productionHouseId, not storeId.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 console.log('📤 [ADD INVENTORY] Sending inventory item to backend:', {
 date: itemWithStore.date,
 itemName: itemWithStore.itemName,
 totalCost: itemWithStore.totalCost,
 storeId: itemWithStore.storeId
 });
 
 const newItem = await api.addInventory(user.accessToken, itemWithStore);
 console.log('✅ [ADD INVENTORY] Received inventory item from backend:', {
 id: newItem.id,
 date: newItem.date,
 itemName: newItem.itemName
 });
 
 // Built from the latest list, not the one captured at render: the invoice scanner adds
 // several lines in a row, and only the last one used to stay on screen.
 setInventory((prev) => [...prev, newItem]);
 
 console.log('🗑️ [ADD INVENTORY] Invalidating inventory cache');
 dataCache.invalidateCache('inventory'); // Invalidate cache on data change
 
 console.log('🎉 [ADD INVENTORY] Success! Item added to state');
 } catch (error) {
 console.error('❌ [ADD INVENTORY] Error adding inventory item:', error);
 console.error('❌ [ADD INVENTORY] Error details:', error instanceof Error ? error.message : 'Unknown error');
 throw error;
 }
 };

 const addOverheadItem = async (item: Omit<OverheadItem, 'id'>) => {
 if (!user) return;
 try {
 console.log('💰 Adding Expense/Overhead item:', item.category, item.description);
 // The item's own storeId wins; the user's storeId only fills it in when missing (this
 // used to overwrite the store an operations manager or cluster head picked). Never for a
 // production-house-tagged item, which is identified by productionHouseId, not storeId.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const newItem = await api.addOverhead(user.accessToken, itemWithStore);
 setOverheads((prev) => [...prev, newItem]);
 dataCache.invalidateCache('overheads');
 console.log('✅ Expense/Overhead item added successfully');
 } catch (error) {
 console.error('❌ Error adding expense/overhead item:', error);
 throw error;
 }
 };

 const addFixedCostItem = async (item: Omit<FixedCostItem, 'id'>) => {
 if (!user) return;
 try {
 // The item's own storeId wins; the user's storeId only fills it in when missing (this
 // used to overwrite the store an operations manager or cluster head picked). Never for a
 // production-house-tagged item, which is identified by productionHouseId, not storeId.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const newItem = await api.addFixedCost(user.accessToken, itemWithStore);
 setFixedCosts((prev) => [...prev, newItem]);
 dataCache.invalidateCache('fixedCosts');
 } catch (error) {
 console.error('Error adding fixed cost item:', error);
 throw error;
 }
 };

 const updateInventoryItem = async (id: string, item: Omit<InventoryItem, 'id'>) => {
 if (!user) return;
 try {
 // Keep the item's own storeId (editing someone else's entry used to move it to the
 // editor's store); only fill it in when missing. Never for a production-house-tagged item.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const updatedItem = await api.updateInventory(user.accessToken, id, itemWithStore);
 setInventory((prev) => prev.map(inv => inv.id === id ? updatedItem : inv));
 dataCache.invalidateCache('inventory');
 } catch (error) {
 console.error('Error updating inventory item:', error);
 throw error;
 }
 };

 const updateOverheadItem = async (id: string, item: Omit<OverheadItem, 'id'>) => {
 if (!user) return;
 try {
 console.log('💰 Updating Expense/Overhead item:', id, item.category);
 // Keep the item's own storeId (editing someone else's entry used to move it to the
 // editor's store); only fill it in when missing. Never for a production-house-tagged item.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const updatedItem = await api.updateOverhead(user.accessToken, id, itemWithStore);
 setOverheads((prev) => prev.map(ovh => ovh.id === id ? updatedItem : ovh));
 dataCache.invalidateCache('overheads');
 console.log('✅ Expense/Overhead item updated successfully');
 } catch (error) {
 console.error('❌ Error updating expense/overhead item:', error);
 throw error;
 }
 };

 const updateFixedCostItem = async (id: string, item: Omit<FixedCostItem, 'id'>) => {
 if (!user) return;
 try {
 // Keep the item's own storeId (editing someone else's entry used to move it to the
 // editor's store); only fill it in when missing. Never for a production-house-tagged item.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const updatedItem = await api.updateFixedCost(user.accessToken, id, itemWithStore);
 setFixedCosts((prev) => prev.map(fc => fc.id === id ? updatedItem : fc));
 dataCache.invalidateCache('fixedCosts');
 } catch (error) {
 console.error('Error updating fixed cost item:', error);
 throw error;
 }
 };

 const deleteInventoryItem = async (id: string) => {
 if (!user) return;
 try {
 await api.deleteInventory(user.accessToken, id);
 setInventory((prev) => prev.filter(inv => inv.id !== id));
 dataCache.invalidateCache('inventory');
 console.log('✅ Inventory item deleted successfully');
 } catch (error: any) {
 // If item not found, it was already deleted - update UI anyway
 if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
 console.log('⚠️ Item was already deleted, updating UI');
 setInventory((prev) => prev.filter(inv => inv.id !== id));
 dataCache.invalidateCache('inventory');
 } else {
 console.error('Error deleting inventory item:', error);
 throw error;
 }
 }
 };

 const deleteOverheadItem = async (id: string) => {
 if (!user) return;
 try {
 console.log('🗑️ Deleting Expense/Overhead item:', id);
 await api.deleteOverhead(user.accessToken, id);
 setOverheads((prev) => prev.filter(ovh => ovh.id !== id));
 dataCache.invalidateCache('overheads');
 console.log('✅ Expense/Overhead item deleted successfully');
 } catch (error: any) {
 // If item not found, it was already deleted - update UI anyway
 if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
 console.log('⚠️ Expense/Overhead item was already deleted, updating UI');
 setOverheads((prev) => prev.filter(ovh => ovh.id !== id));
 dataCache.invalidateCache('overheads');
 } else {
 console.error('❌ Error deleting expense/overhead item:', error);
 throw error;
 }
 }
 };

 const deleteFixedCostItem = async (id: string) => {
 if (!user) return;
 try {
 await api.deleteFixedCost(user.accessToken, id);
 setFixedCosts((prev) => prev.filter(fc => fc.id !== id));
 dataCache.invalidateCache('fixedCosts');
 console.log('✅ Fixed cost item deleted successfully');
 } catch (error: any) {
 // If item not found, it was already deleted - update UI anyway
 if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
 console.log('⚠️ Item was already deleted, updating UI');
 setFixedCosts((prev) => prev.filter(fc => fc.id !== id));
 dataCache.invalidateCache('fixedCosts');
 } else {
 console.error('Error deleting fixed cost item:', error);
 throw error;
 }
 }
 };

 const addSalesData = async (item: Omit<SalesData, 'id'>) => {
 if (!user) return;
 try {
 // Auto-add storeId if user has one
 const itemWithStore = {
 ...item,
 storeId: user.storeId || item.storeId
 };
 const newItem = await api.addSalesData(user.accessToken, itemWithStore);
 // The server saves onto the day's existing row (e.g. the nightly POS sync's) when there
 // is one, so this can come back as a row already in the list.
 setSalesData((prev) => prev.some(sd => sd.id === newItem.id) ? prev.map(sd => sd.id === newItem.id ? newItem : sd) : [...prev, newItem]);
 dataCache.invalidateCache('salesData');
 dataCache.invalidateCache('categorySales');
 } catch (error) {
 console.error('Error adding sales data:', error);
 throw error;
 }
 };

 const updateSalesData = async (id: string, item: Omit<SalesData, 'id'>) => {
 if (!user) return;
 try {
 // Auto-add storeId if user has one (for consistency)
 const itemWithStore = {
 ...item,
 storeId: user.storeId || item.storeId
 };
 const updatedItem = await api.updateSalesData(user.accessToken, id, itemWithStore);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 dataCache.invalidateCache('categorySales');
 } catch (error) {
 console.error('Error updating sales data:', error);
 throw error;
 }
 };

 const approveSalesData = async (id: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.approveSalesData(user.accessToken, id);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error approving sales data:', error);
 throw error;
 }
 };

 const requestSalesApproval = async (id: string, requestedCashInHand: number, requestedOffset: number) => {
 if (!user) return;
 try {
 const updatedItem = await api.requestSalesApproval(user.accessToken, id, requestedCashInHand, requestedOffset);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error requesting sales approval:', error);
 throw error;
 }
 };

 const approveDiscrepancy = async (id: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.approveDiscrepancy(user.accessToken, id);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error approving discrepancy:', error);
 throw error;
 }
 };

 const rejectDiscrepancy = async (id: string, reason: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.rejectDiscrepancy(user.accessToken, id, reason);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error rejecting discrepancy:', error);
 throw error;
 }
 };

 const addProductionData = async (item: Omit<ProductionData, 'id'>) => {
 if (!user) return;
 try {
 const itemWithStore = {
 ...item,
 storeId: user.storeId || item.storeId
 };
 const newItem = await api.addProductionData(itemWithStore);
 setProductionData((prev) => [...prev, newItem]);
 dataCache.invalidateCache('productionData');
 } catch (error) {
 console.error('Error adding production data:', error);
 throw error;
 }
 };

 const updateProductionData = async (id: string, item: Omit<ProductionData, 'id'>) => {
 if (!user) return;
 try {
 const itemWithStore = {
 ...item,
 storeId: user.storeId || item.storeId
 };
 const updatedItem = await api.updateProductionData(id, itemWithStore);
 setProductionData((prev) => prev.map(pd => pd.id === id ? updatedItem : pd));
 dataCache.invalidateCache('productionData');
 } catch (error) {
 console.error('Error updating production data:', error);
 throw error;
 }
 };

 const approveProductionData = async (id: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.approveProductionData(id);
 setProductionData((prev) => prev.map(pd => pd.id === id ? updatedItem : pd));
 dataCache.invalidateCache('productionData');
 } catch (error) {
 console.error('Error approving production data:', error);
 throw error;
 }
 };

 const clearAllData = async () => {
 if (!user) return;
 if (!confirm('⚠️ WARNING: This will delete ALL inventory, overhead, and sales data. This action cannot be undone. Are you sure?')) {
 return;
 }
 try {
 await api.clearAllData();
 setInventory([]);
 setOverheads([]);
 setFixedCosts([]);
 setSalesData([]);
 dataCache.invalidateAllCaches(); // Clear all caches when clearing all data
 alert('All data has been cleared successfully.');
 } catch (error) {
 console.error('Error clearing data:', error);
 alert('Failed to clear data. Please try again.');
 }
 };

 // Production House functions
 const addProductionHouse = async (house: Omit<api.ProductionHouse, 'id' | 'createdAt' | 'updatedAt'>) => {
 if (!user) return;
 try {
 const newHouse = await api.createProductionHouse(user.accessToken, house);
 setProductionHouses([...productionHouses, newHouse]);
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error creating production house:', error);
 throw error;
 }
 };

 const updateProductionHouse = async (id: string, updates: Partial<Omit<api.ProductionHouse, 'id' | 'createdAt'>>) => {
 if (!user) return;
 try {
 const updated = await api.updateProductionHouse(user.accessToken, id, updates);
 setProductionHouses(productionHouses.map(h => h.id === id ? updated : h));
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error updating production house:', error);
 throw error;
 }
 };

 const updateProductionHouseInventory = async (id: string, inventory: api.ProductionHouse['inventory']) => {
 if (!user) return;
 try {
 const updated = await api.updateProductionHouseInventory(user.accessToken, id, inventory);
 setProductionHouses(productionHouses.map(h => h.id === id ? updated : h));
 } catch (error) {
 console.error('Error updating production house inventory:', error);
 throw error;
 }
 };

 const deleteProductionHouse = async (id: string) => {
 if (!user) return;
 try {
 await api.deleteProductionHouse(user.accessToken, id);
 setProductionHouses(productionHouses.filter(h => h.id !== id));
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error deleting production house:', error);
 throw error;
 }
 };

 // Stock Request functions
 const createStockRequest = async (request: Omit<api.StockRequest, 'id' | 'fulfilledQuantities' | 'status' | 'fulfilledBy' | 'fulfilledByName' | 'fulfillmentDate' | 'notes'>) => {
 if (!user) return;
 try {
 console.log('📦 Creating stock request:', request);
 const newRequest = await api.createStockRequest(user.accessToken, request);
 console.log('✅ Stock request created successfully:', newRequest);
 setStockRequests((prev) => [...prev, newRequest]);
 console.log('📦 Updated stock requests count:', stockRequests.length + 1);
 dataCache.invalidateCache('stockRequests');
 } catch (error) {
 console.error('❌ Error creating stock request:', error);
 throw error;
 }
 };

 const fulfillStockRequest = async (id: string, fulfilledQuantities: api.StockRequest['fulfilledQuantities'], fulfilledBy: string, fulfilledByName: string, notes?: string) => {
 if (!user) return;
 try {
 const updated = await api.fulfillStockRequest(user.accessToken, id, fulfilledQuantities, fulfilledBy, fulfilledByName, notes);
 setStockRequests((prev) => prev.map(r => r.id === id ? updated : r));
 // Reload production houses to get updated inventory
 const houses = await api.getProductionHouses();
 setProductionHouses(houses);
 dataCache.invalidateCache('stockRequests');
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error fulfilling stock request:', error);
 throw error;
 }
 };

 const cancelStockRequest = async (id: string) => {
 if (!user) return;
 try {
 const updated = await api.cancelStockRequest(user.accessToken, id);
 setStockRequests((prev) => prev.map(r => r.id === id ? updated : r));
 dataCache.invalidateCache('stockRequests');
 } catch (error) {
 console.error('Error cancelling stock request:', error);
 throw error;
 }
 };

 const contextValue: InventoryContextType = {
 inventory,
 overheads,
 fixedCosts,
 salesData,
 categorySalesData, // NEW: Detailed category sales data
 onlineCashRecalibrations,
 onlineSalesData,
 onlinePayoutData,
 aggregatorSettlements,
 productionData,
 productionHouses,
 stockRequests,
 productionRequests,
 stores,
 managedStoreIds,
 managedProductionHouseIds,
 inventoryItems,
 loadInventoryItems,
 addInventoryItem,
 addOverheadItem,
 addFixedCostItem,
 updateInventoryItem,
 updateOverheadItem,
 updateFixedCostItem,
 deleteInventoryItem,
 deleteOverheadItem,
 deleteFixedCostItem,
 addSalesData,
 updateSalesData,
 approveSalesData,
 requestSalesApproval,
 approveDiscrepancy,
 rejectDiscrepancy,
 addProductionData,
 updateProductionData,
 approveProductionData,
 addProductionHouse,
 updateProductionHouse,
 updateProductionHouseInventory,
 deleteProductionHouse,
 setProductionHouses,
 createStockRequest,
 fulfillStockRequest,
 cancelStockRequest,
 isManager: user?.role === 'manager',
 user,
 refreshData: handleRefreshData,
 dataRefreshedAt
 };

 // A plain employee (contract worker, or role: 'employee' with no incharge
 // designation) should only ever land on their own Payroll/Attendance section - not
 // Analytics/Sales/etc. `activeView` defaults to 'analytics' for every role on mount,
 // so without this redirect a plain employee would land straight on the full
 // Analytics page before ever touching the (now correctly hidden) nav buttons.
 // MUST be declared before any conditional return below (isCheckingAuth/isSetupMode/
 // !user) so this hook is always called on every render - putting it after one of
 // those returns caused a hooks-count mismatch (React error #310) once logged in.
 useEffect(() => {
 if (!user) return;
 // A rider only ever needs their rides, plus their own attendance/payouts.
    if (user.designation === 'rider') {
      if (!['riders', 'payroll', 'rider-profile'].includes(activeView)) setActiveView('riders');
      return;
    }
    const isPlainEmployee = user.role === 'employee' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
 const restrictedViews = ['analytics', 'sales', 'inventory', 'production', 'export', 'backup', 'employees', 'stock-requests', 'advanced-inventory', 'inventory-items', 'assets'];
 if (isPlainEmployee && restrictedViews.includes(activeView)) {
 setActiveView('payroll');
 }
 }, [user, activeView]);

 // Password rotation: status, the blocking change-password screen and the expiry banner
 // (components/PasswordSecurity.tsx). A hook, so it sits above the conditional returns too.
 const passwordPolicy = usePasswordPolicy(user);

 // Show loading state while checking auth
 if (isCheckingAuth) {
 const momoCount = 6;
 return (
 <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F49D1A' }}>
 <div className="text-center">
 <div className="relative w-64 h-14 mx-auto mb-6">
 <div className="absolute inset-0 flex items-center justify-between px-1">
 {Array.from({ length: momoCount }).map((_, i) => (
 <span
 key={i}
 className="text-2xl momo-eaten"
 style={{ animationDelay: `${(i / (momoCount - 1)) * 2.4 - 0.35}s` }}
 >
 🥟
 </span>
 ))}
 </div>
 <img
 src="/bunny-logo.png"
 alt=""
 className="w-12 h-12 absolute top-1/2 bunny-walk"
 />
 </div>
 <p className="text-white font-medium">Loading...</p>
 </div>
 </div>
 );
 }


 // Show auth page if not logged in
 if (!user) {
 return (
 <AuthPage
 onLogin={handleLogin}
 onSignup={handleSignup}
 error={authError}
 />
 );
 }

 // Password expired or reset by the owner: nothing else works until a new one is set (the server
 // refuses every other route with PASSWORD_EXPIRED), so this screen replaces the whole app.
 if (passwordPolicy.blocking) {
 return <ChangePasswordDialog policy={passwordPolicy} user={user} onLogout={handleLogout} />;
 }
 // The same form as a sheet, opened from "Change password" in the menu or the banner.
 const passwordDialog = <ChangePasswordDialog policy={passwordPolicy} user={user} onLogout={handleLogout} />;

 // Floating button + panel to let any logged-in user enable/check push notifications
 // The floating bell is for the website: it lets a browser user switch web push on and check it.
 // The Android app registers for push by itself at login, so there it is just clutter - hidden.
 const pushNotificationWidget = nativePushNotifications.isNativePushSupported() ? null : (
 <>
 <button
 onClick={() => setShowPushNotificationPanel(true)}
 className="fixed bottom-6 right-6 z-40 bg-orange-600 hover:bg-orange-700 text-white rounded-full p-3 shadow-lg transition-all"
 title="Push Notifications"
 >
 <Bell className="w-5 h-5" />
 </button>
 {showPushNotificationPanel && (
 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
 <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 relative">
 <button
 onClick={() => setShowPushNotificationPanel(false)}
 className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
 >
 <X className="w-5 h-5" />
 </button>
 <PushNotificationStatus userId={user.employeeId || user.email} />
 </div>
 </div>
 )}
 </>
 );

 // Cluster heads should only see the dashboard
 const isClusterHead = user.role === 'cluster_head';
 const isEmployee = user.role === 'employee';
 const isAudit = user.role === 'audit';
 const isStoreIncharge = user.role === 'employee' && user.designation === 'store_incharge';
 // Production incharge can be either employee OR manager with production_incharge designation
 const isProductionIncharge = user.designation === 'production_incharge';
 const isProductionHead = isProductionIncharge; // Alias for clarity
 const isAnyIncharge = isStoreIncharge || isProductionIncharge;
  const isRider = user.designation === 'rider';
  // Store crew (any plain employee at a store, not a rider or production crew) can receive
  // and count deliveries - the incharge does it from Stock Requests.
  const canReceiveStock = user.role === 'employee' && !isRider && !isAnyIncharge && user.designation !== 'production_ops' && !!user.storeId && isPhase1Live(getTodayIST());
  // Production incharge, operations manager and cluster head can call riders / mark orders ready.
  const canDispatchRiders = user.role === 'cluster_head' || user.designation === 'production_incharge' || (user.role === 'manager' && user.designation !== 'store_incharge');
 const isOperationsManager = user.role === 'manager' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
 const isManager = user.role === 'manager';
 const isStoreInchargeManager = user.role === 'manager' && user.designation === 'store_incharge';
 const canViewProduction = isProductionIncharge || isOperationsManager || isClusterHead;
 // Out-of-stock log (store SOP ST-28): whoever bills at the store - crew and the store incharge -
 // logs it; production incharge, operations manager and cluster head can open it (from the
 // stock-out notification) to see what's out.
 const canLogStockOuts = !!user.storeId && !isRider && user.designation !== 'production_ops' && user.designation !== 'production_incharge' && (user.role === 'employee' || isStoreInchargeManager);
 const canViewStockOuts = canLogStockOuts || isProductionIncharge || isOperationsManager || isClusterHead;
 const stockOutStores = canLogStockOuts && user.storeId
 ? [{ id: user.storeId, name: stores.find((st) => st.id === user.storeId)?.name || 'My store' }]
 : (stores || []).map((st) => ({ id: st.id, name: st.name }));
 const stockOutDefaultStore = user.storeId && String(user.storeId).startsWith('STORE-') ? user.storeId : (stores[0]?.id || null);
 // The floating Bunny chat (AI explanations of any screen): the cluster head and every manager
 // (store, production, operations). Audit and employee screens don't show it.
 const canAskBunny = isClusterHead || user.role === 'manager';
 const askBunnyStoreId = selectedStoreId || (stores || []).find((st) => st.productionHouseId)?.id || stores[0]?.id || null;

 // Debug: Log user permissions
 console.log('👤 User Permissions:', {
 role: user.role,
 designation: user.designation,
 isClusterHead,
 isEmployee,
 isManager,
 isStoreIncharge,
 isProductionIncharge,
 isOperationsManager,
 isAnyIncharge,
 canViewProduction
 });
 
 console.log('📍 Current activeView:', activeView);

 // If audit user, show audit dashboard
 if (isAudit) {
 return (
 <>
 {pushNotificationWidget}
 {passwordDialog}
 <PasswordExpiryBanner policy={passwordPolicy} />
 <AuditDashboard
 user={user}
 inventory={inventory}
 overheads={overheads}
 fixedCosts={fixedCosts}
 salesData={salesData}
 categorySalesData={categorySalesData}
 productionData={productionData}
 productionHouses={productionHouses}
 stockRequests={stockRequests}
 productionRequests={productionRequests}
 employees={employees}
 stores={stores}
 inventoryItems={inventoryItems}
 onLogout={handleLogout}
 onChangePassword={passwordPolicy.openDialog}
 onDataUpdate={loadData}
 />
 </>
 );
 }

 // If employee, show only employee dashboard
 if (isEmployee) {
 return (
 <>
 {pushNotificationWidget}
 {passwordDialog}
 <UpdateAvailableBanner />

 <div className="min-h-screen bg-gray-50">
 {/* Employee Navigation */}
 <nav className="bg-stone-900 shadow-xl sticky top-0 z-50">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="flex justify-between items-center py-3">
 <div className="flex items-center gap-4">
 <div className="bg-white/20 rounded-xl px-4 py-2 border border-white/30">
 <h1 className="text-xl sm:text-2xl text-white font-bold tracking-wide">Bhandar-IMS</h1>
 <p className="text-xs text-white/90">
 {user.name} • {isStoreIncharge ? 'Store Incharge' : isProductionIncharge ? 'Production Head' : 'Employee'}
 </p>
 </div>
 </div>
 
 {/* Notification bell and Refresh sit here, outside the hamburger menu, so
 anyone can reach either with one tap instead of opening the menu first. */}
 <div className="flex items-center gap-2">
 {isAnyIncharge && !nativePushNotifications.isNativePushSupported() && (
 <Notifications onNavigate={(view, tab, highlightRequestId) => applyNavigationTarget({ view, tab, highlightRequestId })} />
 )}
 <button
 onClick={handleRefreshData}
 disabled={isLoadingData}
 className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
 title="Refresh data"
 >
 <RefreshCw className={`w-5 h-5 ${isLoadingData ? 'animate-spin' : ''}`} />
 </button>
 {/* Mobile Menu Button */}
 <button
 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
 className="lg:hidden flex items-center gap-2 px-3 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all border border-white/30"
 >
 {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
 </button>
 </div>

 {/* Desktop Menu */}
 <div className="hidden lg:flex gap-2">
 {/* Analytics is store/production-incharge only here - a plain employee
 (contract worker or role: 'employee' with no incharge designation) should
 only ever land on their own Payroll/Attendance section. */}
 {isAnyIncharge && (
 <button
 onClick={() => setActiveView('analytics')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'analytics'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <TrendingUp className="w-4 h-4" />
 <span>Analytics</span>
 </button>
 )}
 {isAnyIncharge && (
 <>
 <button
 onClick={() => setActiveView('inventory')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'inventory'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Package className="w-4 h-4" />
 <span>Expense</span>
 </button>
 <button
 onClick={() => setActiveView('sales')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'sales'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <DollarSign className="w-4 h-4" />
 <span>Sales</span>
 </button>
 </>
 )}
 {/* No "Stock Requests" button: it opened the old stock request page (stock_request_ records),
 which the momo requests in Analytics (Daily Stock Requests) replaced. The page is still
 reachable from old notifications; no data was removed. */}
 {isManager && (
 <>
 <button
 onClick={() => setActiveView('advanced-inventory')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'advanced-inventory'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Activity className="w-4 h-4" />
 <span>Inventory Analytics</span>
 </button>
 <button
 onClick={() => {
 setPreManageItemsView(activeView === 'inventory-items' ? 'analytics' : activeView);
 setActiveView('inventory-items');
 }}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'inventory-items'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Package className="w-4 h-4" />
 <span>Manage Items</span>
 </button>
 </>
 )}

 {(isRider || isAnyIncharge) && (
 <button
 onClick={() => setActiveView('riders')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'riders'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Bike className="w-4 h-4" />
 <span>{isRider ? 'My Rides' : 'Riders'}</span>
 </button>
 )}

 {isRider && (
 <button
 onClick={() => setActiveView('rider-profile')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'rider-profile'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Users className="w-4 h-4" />
 <span>My Profile</span>
 </button>
 )}

 {canReceiveStock && (
 <button
 onClick={() => setActiveView('receive-stock')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'receive-stock'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <PackageCheck className="w-4 h-4" />
 <span>Receive Stock</span>
 </button>
 )}

 {canLogStockOuts && (
 <button
 onClick={() => setActiveView('stock-outs')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'stock-outs'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <PackageX className="w-4 h-4" />
 <span>Out of Stock</span>
 </button>
 )}

 {/* Payroll and Attendance for non-manager/cluster-head users */}
 <button
 onClick={() => setActiveView('payroll')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'payroll'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Users className="w-4 h-4" />
 <span>{isAnyIncharge ? 'Payroll' : 'My Payouts'}</span>
 </button>
 {!isRider && (
<button
 onClick={() => setActiveView('attendance')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'attendance'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Clock className="w-4 h-4" />
 <span>Attendance</span>
 </button>
)}

 {isAnyIncharge && (
 <button
 onClick={() => setActiveView('export')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2 ${
 activeView === 'export'
 ? 'bg-white text-orange-600 border-white shadow-lg'
 : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
 }`}
 >
 <Download className="w-4 h-4" />
 <span>Export</span>
 </button>
 )}
 {isAnyIncharge && <EquipmentNavButton variant="staff-desktop" active={activeView === 'assets'} onClick={() => setActiveView('assets')} />}
 {/* Notification bell and Refresh moved to the always-visible bar next to the
 hamburger menu button above, reachable without opening the desktop nav or
 the mobile menu. */}
 <button
 onClick={passwordPolicy.openDialog}
 className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all border-2 border-white/30"
 >
 <KeyRound className="w-4 h-4" />
 <span>Change password</span>
 </button>
 <button
 onClick={handleLogout}
 className="flex items-center gap-2 px-4 py-2 bg-red-500/90 text-white rounded-xl hover:bg-red-600 transition-all border-2 border-white/30"
 >
 <LogOut className="w-4 h-4" />
 <span>Logout</span>
 </button>
 </div>
 </div>
 
 {/* Mobile Menu */}
 {isMobileMenuOpen && (
 <div className="lg:hidden border-t border-white/20 py-4 space-y-2">
 {/* Analytics is store/production-incharge only here too, mirroring the desktop
 menu right above - a plain employee (contract worker, or role: 'employee' with
 no incharge designation) should only get Payroll/Attendance. */}
 {isAnyIncharge && (
 <button
 onClick={() => {
 setActiveView('analytics');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'analytics'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <TrendingUp className="w-5 h-5" />
 <span>Analytics</span>
 </button>
 )}
 {isAnyIncharge && (
 <>
 <button
 onClick={() => {
 setActiveView('inventory');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'inventory'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Package className="w-5 h-5" />
 <span>Expense</span>
 </button>
 <button
 onClick={() => {
 setActiveView('sales');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'sales'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <DollarSign className="w-5 h-5" />
 <span>Sales</span>
 </button>
 </>
 )}
 {/* No "Stock Requests" button: it opened the old stock request page (stock_request_ records),
 which the momo requests in Analytics (Daily Stock Requests) replaced. The page is still
 reachable from old notifications; no data was removed. */}
 {isManager && (
 <>
 <button
 onClick={() => {
 setActiveView('advanced-inventory');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'advanced-inventory'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Activity className="w-5 h-5" />
 <span>Inventory Analytics</span>
 </button>
 <button
 onClick={() => {
 setPreManageItemsView(activeView === 'inventory-items' ? 'analytics' : activeView);
 setActiveView('inventory-items');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'inventory-items'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Package className="w-5 h-5" />
 <span>Manage Items</span>
 </button>
 </>
 )}

 {(isRider || isAnyIncharge) && (
 <button
 onClick={() => {
 setActiveView('riders');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'riders'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Bike className="w-5 h-5" />
 <span>{isRider ? 'My Rides' : 'Riders'}</span>
 </button>
 )}

 {isRider && (
 <button
 onClick={() => {
 setActiveView('rider-profile');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'rider-profile'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Users className="w-5 h-5" />
 <span>My Profile</span>
 </button>
 )}

 {canReceiveStock && (
 <button
 onClick={() => {
 setActiveView('receive-stock');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'receive-stock'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <PackageCheck className="w-5 h-5" />
 <span>Receive Stock</span>
 </button>
 )}

 {canLogStockOuts && (
 <button
 onClick={() => {
 setActiveView('stock-outs');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'stock-outs'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <PackageX className="w-5 h-5" />
 <span>Out of Stock</span>
 </button>
 )}

 {/* Payroll and Attendance for non-manager/cluster-head users */}
 <button
 onClick={() => {
 setActiveView('payroll');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'payroll'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Users className="w-5 h-5" />
 <span>{isAnyIncharge ? 'Payroll' : 'My Payouts'}</span>
 </button>
 {!isRider && (
<button
 onClick={() => {
 setActiveView('attendance');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'attendance'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Clock className="w-5 h-5" />
 <span>Attendance</span>
 </button>
)}

 {isAnyIncharge && (
 <button
 onClick={() => {
 setActiveView('export');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
 activeView === 'export'
 ? 'bg-white text-orange-600'
 : 'bg-white/20 text-white hover:bg-white/30'
 }`}
 >
 <Download className="w-5 h-5" />
 <span>Export</span>
 </button>
 )}
 {isAnyIncharge && <EquipmentNavButton variant="staff-mobile" active={activeView === 'assets'} onClick={() => { setActiveView('assets'); setIsMobileMenuOpen(false); }} />}
 <button
 onClick={() => {
 passwordPolicy.openDialog();
 setIsMobileMenuOpen(false);
 }}
 className="w-full flex items-center gap-3 px-4 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all"
 >
 <KeyRound className="w-5 h-5" />
 <span>Change password · পাসওয়ার্ড বদলান</span>
 </button>
 <button
 onClick={handleLogout}
 className="w-full flex items-center gap-3 px-4 py-3 bg-red-500/90 text-white rounded-lg hover:bg-red-600 transition-all"
 >
 <LogOut className="w-5 h-5" />
 <span>Logout</span>
 </button>
 </div>
 )}
 </div>
 </nav>
 {/* Under the top bar rather than on one screen: plain employees and riders have no shared
 home screen, and a reminder push lands wherever their first screen is. */}
 <PasswordExpiryBanner policy={passwordPolicy} />

 {/* Employee Main Content */}
 <main className="pb-6" data-ai-screen>
 {/* Aadhaar, phone and email still missing: asked for on the home screen until done. */}
 {(activeView === 'analytics' || (isRider && activeView === 'riders')) && <ProfileCompletionCard accessToken={user.accessToken || ''} />}
 <Suspense fallback={<><div className="md:hidden"><CompactLoadingSkeleton /></div><div className="hidden md:block"><LoadingSkeleton /></div></>}>
 {activeView === 'rider-profile' && isRider ? (
 <RiderProfile />
 ) : activeView === 'receive-stock' && canReceiveStock ? (
 <IncomingDeliveries accessToken={user.accessToken || ''} storeId={user.storeId || ''} />
 ) : activeView === 'stock-outs' && canViewStockOuts ? (
 <StockOutLog accessToken={user.accessToken || ''} stores={stockOutStores} defaultStoreId={stockOutDefaultStore} canDelete={isAnyIncharge} />
 ) : activeView === 'riders' && (isRider || isAnyIncharge) ? (
 <RiderTrips
 mode={isRider ? 'rider' : 'staff'}
 stockRequests={contextValue.productionRequests}
 canDispatch={canDispatchRiders}
 stores={(contextValue.stores || []).map((st) => ({ id: st.id, name: st.name }))}
 defaultStoreId={user.storeId || null}
 />
 ) : activeView === 'analytics' ? (
 <Analytics
 context={contextValue}
 highlightRequestId={highlightRequestId}
 initialTab={highlightTab}
 onNavigateToManageItems={() => {
 console.log('🔄 App.tsx: Changing activeView to inventory-items');
 setPreManageItemsView('analytics');
 setActiveView('inventory-items');
 }}
 onNavigateToProductionManagement={() => {
 setPreProductionManagementView(activeView);
 setActiveView('production');
 }}
 />
 ) : activeView === 'inventory' && isAnyIncharge ? (
 <InventoryView context={contextValue} />
 ) : activeView === 'sales' && isAnyIncharge ? (
 <SalesManagement context={contextValue} selectedStoreId={selectedStoreId} />
 ) : activeView === 'production' && canViewProduction ? (
 <ProductionManagement context={contextValue} selectedStoreId={selectedStoreId} initialTab={highlightTab} onBack={() => setActiveView(preProductionManagementView)} />
 ) : activeView === 'payroll' ? (
 isAnyIncharge ? (
 <PayrollManagement 
 userRole={'manager' as 'manager' | 'cluster_head'} 
 selectedDate={getTodayIST()}
 userEmployeeId={user.employeeId}
 userName={user.name}
 selectedStoreId={user.storeId}
 isIncharge={true}
 inchargeDesignation={user.designation}
 />
 ) : (
 <EmployeeDashboard employeeId={user.employeeId || ''} />
 )
 ) : activeView === 'attendance' ? (
 <AttendancePortal
 user={{
 employeeId: user.employeeId,
 name: user.name,
 email: user.email,
 role: user.role
 }}
 isIncharge={isAnyIncharge}
 inchargeDesignation={user.designation}
 initialTab={highlightTab}
 stores={contextValue.stores}
 />
 ) : activeView === 'export' && isAnyIncharge ? (
 <ExportData
 userRole={'manager' as 'manager' | 'cluster_head'}
 selectedStoreId={user.storeId || null}
 currentUserId={user.email}
 context={contextValue}
 />
 ) : activeView === 'stock-requests' && isAnyIncharge ? (
 <StockRequestManagement context={contextValue} stores={stores} initialTab={highlightTab} />
 ) : activeView === 'assets' && isAnyIncharge ? (
 <AssetsManagement context={contextValue} stores={stores} employees={employees} onRefreshStores={loadStores} />
 ) : activeView === 'advanced-inventory' && isManager ? (
 <AdvancedInventoryManagement 
 context={contextValue} 
 stores={stores}
 onNavigateToManageItems={() => {
 setPreManageItemsView('advanced-inventory');
 setActiveView('inventory-items');
 }}
 />
 ) : activeView === 'inventory-items' && (isManager || isAnyIncharge) ? (
 (() => {
 console.log('✅ Rendering InventoryItemsManagement:', { activeView, isManager, isAnyIncharge });
 return <InventoryItemsManagement context={contextValue} onBack={() => setActiveView(preManageItemsView)} />;
 })()
 ) : (
 (() => {
 console.log('❌ Falling through to EmployeeDashboard:', { activeView, isManager, isAnyIncharge });
 return <EmployeeDashboard employeeId={user.employeeId || ''} />;
 })()
 )}
 </Suspense>
 </main>
 </div>
 </>
 );
 }

 return (
 <>
 {pushNotificationWidget}
 {passwordDialog}
 {canAskBunny && <BunnyChat accessToken={user.accessToken || ''} storeId={askBunnyStoreId} raised={!!pushNotificationWidget} />}
 <UpdateAvailableBanner />

 <div className="min-h-screen bg-gray-50">
 {/* Navigation */}
 <nav className="bg-stone-900 shadow-xl sticky top-0 z-50">
 <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
 <div className="flex justify-between items-center py-2 sm:py-3">
 <div className="flex items-center gap-2 sm:gap-4">
 <div className="bg-white/20 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 border border-white/30">
 <h1 className="text-base sm:text-xl lg:text-2xl text-white font-bold tracking-wide">Bhandar-IMS</h1>
 <p className="text-[10px] sm:text-xs text-white/90 truncate max-w-[160px] sm:max-w-none">
 {user.name} • {user.designation === 'store_incharge' ? 'Store Incharge' : user.designation === 'production_incharge' ? 'Production Incharge' : (user.role === 'manager' ? 'Operations Manager' : 'Cluster Head')}
 </p>
 </div>
 </div>
 
 {/* Notifications Bell, Refresh & Mobile Menu Button - all reachable without
 opening the desktop nav or the mobile menu first. */}
 <div className="flex items-center gap-3">
 {/* Notifications bell - only on web. The Android app gets real system push
 notifications (see nativePushNotifications.ts), so this in-app bell is
 redundant there and just adds clutter. */}
 {!nativePushNotifications.isNativePushSupported() && (
 <Notifications onNavigate={(view, tab, highlightRequestId) => applyNavigationTarget({ view, tab, highlightRequestId })} />
 )}
 <button
 onClick={handleRefreshData}
 disabled={isLoadingData}
 className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
 title="Refresh data"
 >
 <RefreshCw className={`w-5 h-5 ${isLoadingData ? 'animate-spin' : ''}`} />
 </button>

 {/* Mobile Menu Button */}
 <button
 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
 className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all border border-white/30"
 >
 {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
 </button>
 </div>
 
 {/* Desktop Menu */}
 <div className="hidden lg:flex gap-2 flex-wrap">
 <button
 onClick={() => setActiveView('riders')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'riders'
 ? 'bg-white text-cyan-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Bike className="w-4 h-4" />
 <span>Riders</span>
 </button>
 {isClusterHead ? (
 <>
 <button
 onClick={() => setActiveView('analytics')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'analytics'
 ? 'bg-white text-cyan-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <TrendingUp className="w-4 h-4" />
 <span className="hidden xl:inline">Analytics</span>
 </button>
 
 <button
 onClick={() => setActiveView('inventory')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'inventory'
 ? 'bg-white text-green-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Package className="w-4 h-4" />
 <span className="hidden xl:inline">Expense</span>
 </button>
 <button
 onClick={() => setActiveView('sales')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'sales'
 ? 'bg-white text-fuchsia-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <DollarSign className="w-4 h-4" />
 <span className="hidden xl:inline">Sales</span>
 </button>
 {canLogStockOuts && (
 <button
 onClick={() => setActiveView('stock-outs')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'stock-outs'
 ? 'bg-white text-rose-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <PackageX className="w-4 h-4" />
 <span className="hidden xl:inline">Out of Stock</span>
 </button>
 )}
 <button
 onClick={() => setActiveView('employees')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'employees'
 ? 'bg-white text-violet-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <UserPlus className="w-4 h-4" />
 <span className="hidden xl:inline">Employees</span>
 </button>
 <button
 onClick={() => setActiveView('assets')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'assets'
 ? 'bg-white text-rose-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Package className="w-4 h-4" />
 <span className="hidden xl:inline">Investments & Assets</span>
 </button>
 <button
 onClick={() => setActiveView('export')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'export'
 ? 'bg-white text-yellow-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Download className="w-4 h-4" />
 <span className="hidden xl:inline">Export</span>
 </button>
 <button
 onClick={() => setActiveView('backup')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'backup'
 ? 'bg-white text-blue-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Database className="w-4 h-4" />
 <span className="hidden xl:inline">Backup</span>
 </button>
 </>
 ) : (
 <>
 <button
 onClick={() => setActiveView('analytics')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'analytics'
 ? 'bg-white text-cyan-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <TrendingUp className="w-4 h-4" />
 <span className="hidden xl:inline">Analytics</span>
 </button>
 <button
 onClick={() => setActiveView('sales')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'sales'
 ? 'bg-white text-fuchsia-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <DollarSign className="w-4 h-4" />
 <span className="hidden xl:inline">Sales</span>
 </button>
 {canLogStockOuts && (
 <button
 onClick={() => setActiveView('stock-outs')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'stock-outs'
 ? 'bg-white text-rose-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <PackageX className="w-4 h-4" />
 <span className="hidden xl:inline">Out of Stock</span>
 </button>
 )}
 <button
 onClick={() => setActiveView('inventory')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'inventory'
 ? 'bg-white text-green-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Package className="w-4 h-4" />
 <span className="hidden xl:inline">Expense</span>
 </button>
 <button
 onClick={() => setActiveView('employees')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'employees'
 ? 'bg-white text-violet-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <UserPlus className="w-4 h-4" />
 <span className="hidden xl:inline">Employees</span>
 </button>
 <button
 onClick={() => setActiveView('export')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'export'
 ? 'bg-white text-yellow-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Download className="w-4 h-4" />
 <span className="hidden xl:inline">Export</span>
 </button>
 <button
 onClick={() => setActiveView('backup')}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
 activeView === 'backup'
 ? 'bg-white text-blue-600 shadow-lg font-semibold'
 : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
 }`}
 >
 <Database className="w-4 h-4" />
 <span className="hidden xl:inline">Backup</span>
 </button>
 <EquipmentNavButton variant="manager-desktop" active={activeView === 'assets'} onClick={() => setActiveView('assets')} />
 </>
 )}
 {/* Refresh moved to the always-visible bar next to the notification bell above. */}
 <button
 onClick={passwordPolicy.openDialog}
 className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:scale-105 border border-white/20"
 title="Change password"
 >
 <KeyRound className="w-4 h-4" />
 <span className="hidden xl:inline">Password</span>
 </button>
 <button
 onClick={handleLogout}
 className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-red-500 transition-all duration-300 transform hover:scale-105 border border-white/20"
 >
 <LogOut className="w-4 h-4" />
 <span className="hidden xl:inline">Logout</span>
 </button>
 </div>
 </div>
 
 {/* Mobile Menu */}
 {isMobileMenuOpen && (
 <div className="lg:hidden border-t border-white/20 py-3 space-y-1.5 max-h-[70vh] overflow-y-auto">
 <button
 onClick={() => {
 setActiveView('riders');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
 activeView === 'riders'
 ? 'bg-white text-orange-600 font-semibold shadow-sm'
 : 'bg-white/10 text-white hover:bg-white/20'
 }`}
 >
 <Bike className="w-5 h-5" />
 <span>Riders</span>
 </button>
 {isClusterHead ? (
 <>
 <button
 onClick={() => {
 setActiveView('analytics');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
 activeView === 'analytics'
 ? 'bg-white text-orange-600 font-semibold shadow-sm'
 : 'bg-white/10 text-white hover:bg-white/20'
 }`}
 >
 <TrendingUp className="w-4 h-4" />
 <span>Analytics</span>
 </button>
 
 <button
 onClick={() => {
 setActiveView('inventory');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
 activeView === 'inventory'
 ? 'bg-[#C1E1C1] text-gray-800'
 : 'bg-gray-50 text-gray-700 hover:bg-[#F0FFF0]'
 }`}
 >
 <Package className="w-5 h-5" />
 <span>Expense</span>
 </button>
 <button
 onClick={() => {
 setActiveView('sales');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
 activeView === 'sales'
 ? 'bg-[#FFD4E5] text-gray-800'
 : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F8]'
 }`}
 >
 <DollarSign className="w-5 h-5" />
 <span>Sales</span>
 </button>
 <button
 onClick={() => {
 setActiveView('employees');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
 activeView === 'employees'
 ? 'bg-[#E6E6FA] text-gray-800'
 : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF]'
 }`}
 >
 <UserPlus className="w-5 h-5" />
 <span>Employees</span>
 </button>
 <button
 onClick={() => {
 setActiveView('assets');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
 activeView === 'assets'
 ? 'bg-[#FFE4CC] text-gray-800'
 : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE]'
 }`}
 >
 <Package className="w-5 h-5" />
 <span>Investments & Assets</span>
 </button>
 <button
 onClick={() => {
 setActiveView('export');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
 activeView === 'export'
 ? 'bg-[#FFE5B4] text-gray-800'
 : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
 }`}
 >
 <Download className="w-5 h-5" />
 <span>Export</span>
 </button>
 <button
 onClick={() => {
 setActiveView('backup');
 setIsMobileMenuOpen(false);
 }}
 className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
 activeView === 'backup'
 ? 'bg-[#B4D7FF] text-gray-800'
 : 'bg-gray-50 text-gray-700 hover:bg-[#E6F2FF]'
 }`}
 >
 <Database className="w-5 h-5" />
 <span>Backup</span>
 </button>
 </>
 ) : (
                  <>
                  <button
                    onClick={() => {
                      setActiveView('analytics');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'analytics'
                        ? 'bg-[#D4A5FF] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F5F0FF]'
                    }`}
                  >
                    <TrendingUp className="w-5 h-5" />
                    <span>Analytics</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setActiveView('sales');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'sales'
                        ? 'bg-[#FFD4E5] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F8]'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" />
                    <span>Sales</span>
                  </button>
                  {canLogStockOuts && (
                    <button
                      onClick={() => {
                        setActiveView('stock-outs');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeView === 'stock-outs'
                          ? 'bg-[#FFD4D4] text-gray-800'
                          : 'bg-gray-50 text-gray-700 hover:bg-[#FFF5F5]'
                      }`}
                    >
                      <PackageX className="w-5 h-5" />
                      <span>Out of Stock</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setActiveView('inventory');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'inventory'
                        ? 'bg-[#C1E1C1] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F0FFF0]'
                    }`}
                  >
                    <Package className="w-5 h-5" />
                    <span>Expense</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('employees');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'employees'
                        ? 'bg-[#E6E6FA] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#F8F8FF]'
                    }`}
                  >
                    <UserPlus className="w-5 h-5" />
                    <span>Employees</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('export');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'export'
                        ? 'bg-[#FFE5B4] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
                    }`}
                  >
                    <Download className="w-5 h-5" />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveView('backup');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeView === 'backup'
                        ? 'bg-[#B4D7FF] text-gray-800'
                        : 'bg-gray-50 text-gray-700 hover:bg-[#E6F2FF]'
                    }`}
                  >
                    <Database className="w-5 h-5" />
                    <span>Backup</span>
                  </button>
                  <EquipmentNavButton variant="manager-mobile" active={activeView === 'assets'} onClick={() => { setActiveView('assets'); setIsMobileMenuOpen(false); }} />
                  </>
 )}
 <button
 onClick={() => {
 passwordPolicy.openDialog();
 setIsMobileMenuOpen(false);
 }}
 className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-[#E6F2FF] transition-colors"
 >
 <KeyRound className="w-5 h-5" />
 <span>Change password · পাসওয়ার্ড বদলান</span>
 </button>
 <button
 onClick={handleLogout}
 className="w-full flex items-center gap-3 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
 >
 <LogOut className="w-5 h-5" />
 <span>Logout</span>
 </button>
 </div>
 )}
 </div>
 </nav>
 {/* Under the top bar so it is the first thing on Home (and any screen a reminder opens). */}
 <PasswordExpiryBanner policy={passwordPolicy} />

 {/* Store Selector for Cluster Heads */}
 {isClusterHead && stores.length > 0 && (
 <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 border-b border-orange-100 px-4 py-6">
 <div className="max-w-7xl mx-auto">
 <StoreSelector
 stores={stores}
 selectedStoreId={selectedStoreId}
 onStoreChange={setSelectedStoreId}
 showAllStores={true}
 />
 </div>
 </div>
 )}

 {/* Data Error Banner */}
 {dataError && (
 <div className="bg-red-50 border-b border-red-200 px-4 py-3">
 <div className="max-w-7xl mx-auto flex items-center gap-2 text-red-800">
 <AlertCircle className="w-5 h-5" />
 <p className="text-sm">{dataError}</p>
 <button
 onClick={() => user && loadData(user.accessToken)}
 className="ml-auto text-sm text-red-600 hover:text-red-700 underline"
 >
 Retry
 </button>
 </div>
 </div>
 )}

 {/* Loading State */}
 {isLoadingData && (
 <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
 <div className="max-w-7xl mx-auto flex items-center gap-2 text-blue-800">
 <Package className="w-5 h-5 animate-pulse" />
 <p className="text-sm">Loading inventory data...</p>
 </div>
 </div>
 )}

 {/* Main Content */}
 <main className="pb-6" data-ai-screen>
 {activeView === 'analytics' && <ProfileCompletionCard accessToken={user.accessToken || ''} />}
 <Suspense fallback={<><div className="md:hidden"><CompactLoadingSkeleton /></div><div className="hidden md:block"><LoadingSkeleton /></div></>}>
 {activeView === 'stock-outs' && canViewStockOuts ? (
 <StockOutLog accessToken={user.accessToken || ''} stores={stockOutStores} defaultStoreId={stockOutDefaultStore} canDelete={isStoreInchargeManager || isOperationsManager || isClusterHead} />
 ) : activeView === 'riders' ? (
 <RiderTrips
 mode="staff"
 stockRequests={contextValue.productionRequests}
 canDispatch={canDispatchRiders}
 stores={(stores || []).map((st) => ({ id: st.id, name: st.name }))}
 defaultStoreId={user.storeId || null}
 />
 ) : activeView === 'sales' ? (
 // Store incharge validates the day's sales (POS-reported once live) against the
 // cash they counted and owns reconciliation; everyone else (operations manager,
 // cluster head, etc.) gets a read-only view - the operations manager additionally
 // gets the cash top-up request capability from there.
 isStoreInchargeManager ? (
 <SalesManagement context={contextValue} selectedStoreId={selectedStoreId} />
 ) : (
 <SalesView context={contextValue} selectedStoreId={selectedStoreId} />
 )
 ) : activeView === 'inventory' ? (
 // Managers and the cluster head can add and edit expenses; others get a read-only view.
 user.role === 'manager' || user.role === 'cluster_head' ? (
 <InventoryManagement context={contextValue} selectedStoreId={selectedStoreId} employees={employees} />
 ) : (
 <InventoryView context={contextValue} selectedStoreId={selectedStoreId} />
 )
 ) : activeView === 'analytics' ? (
 <Analytics 
 context={contextValue} 
 selectedStoreId={selectedStoreId} 
 highlightRequestId={highlightRequestId}
 initialTab={highlightTab}
 onNavigateToManageItems={() => {
 console.log('🔄 App.tsx: Changing activeView to inventory-items');
 setActiveView('inventory-items');
 }}
 onNavigateToProductionManagement={() => {
 setPreProductionManagementView(activeView);
 setActiveView('production');
 }}
 />
 ) : activeView === 'export' ? (
 <ExportData
 userRole={user.role as 'manager' | 'cluster_head'}
 selectedStoreId={selectedStoreId}
 currentUserId={user.email}
 context={contextValue}
 />
 ) : activeView === 'backup' ? (
 <BackupRestore context={contextValue} />
 ) : activeView === 'employees' ? (
 <EmployeeManagement
 user={{
 role: user.role,
 email: user.email,
 employeeId: user.employeeId || undefined,
 name: user.name,
 storeId: user.storeId || undefined,
 accessToken: user.accessToken
 }}
 selectedStoreId={selectedStoreId}
 initialAttendanceTab={highlightTab}
 />
 ) : activeView === 'assets' ? (
 <AssetsManagement 
 context={contextValue} 
 stores={stores}
 employees={employees}
 onRefreshStores={loadStores}
 />
 ) : activeView === 'production' && canViewProduction ? (
 <ProductionManagement context={contextValue} selectedStoreId={selectedStoreId} initialTab={highlightTab} onBack={() => setActiveView(preProductionManagementView)} />
 ) : activeView === 'stock-requests' ? (
 <StockRequestManagement context={contextValue} stores={stores} initialTab={highlightTab} />
 ) : activeView === 'advanced-inventory' ? (
 <AdvancedInventoryManagement 
 context={contextValue} 
 stores={stores}
 onNavigateToManageItems={() => {
 console.log('🔄 App.tsx (Manager): Changing activeView to inventory-items');
 setActiveView('inventory-items');
 }}
 />
 ) : activeView === 'inventory-items' ? (
 (() => {
 console.log('✅ Rendering InventoryItemsManagement (Manager section):', { activeView, isManager });
 return <InventoryItemsManagement context={contextValue} />;
 })()
 ) : (
 <ClusterDashboard context={contextValue} />
 )}
 </Suspense>
 </main>
 </div>
 </>
 );
}