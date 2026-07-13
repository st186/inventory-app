// Bhandar-IMS - Performance optimized with lazy loading
import { useState, useEffect, lazy, Suspense, memo, startTransition, useCallback } from 'react';
import { InventoryManagement } from './components/InventoryManagement';
import { InventoryView } from './components/InventoryView';
import { ClusterDashboard } from './components/ClusterDashboard';
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
const StockRequestManagement = lazy(() => import('./components/StockRequestManagement').then(module => ({ default: module.StockRequestManagement })));
const AdvancedInventoryManagement = lazy(() => import('./components/AdvancedInventoryManagement').then(module => ({ default: module.AdvancedInventoryManagement })));
const InventoryItemsManagement = lazy(() => import('./components/InventoryItemsManagement').then(module => ({ default: module.InventoryItemsManagement })));
const BackupRestore = lazy(() => import('./components/BackupRestore').then(module => ({ default: module.BackupRestore })));
import { AuthPage } from './components/AuthPage';
import { TwoFactorVerify } from './components/TwoFactorVerify';
import { TwoFactorSetup } from './components/TwoFactorSetup';
import { EmployeeTimesheet } from './components/EmployeeTimesheet';
import { EmployeeLeave } from './components/EmployeeLeave';
import { CreateEmployee } from './components/CreateEmployee';
import { ApproveTimesheets } from './components/ApproveTimesheets';
import { ApproveLeaves } from './components/ApproveLeaves';
import { EmployeeHierarchy } from './components/EmployeeHierarchy';
import { AttendancePortal } from './components/AttendancePortal';
import { EmployeeManagement } from './components/EmployeeManagement';
import { Notifications } from './components/Notifications';
import { StoreManagement } from './components/StoreManagement';
import { StoreSelector } from './components/StoreSelector';
import { SetupClusterHead } from './components/SetupClusterHead';
import { FixLegacyInventory } from './components/FixLegacyInventory';
// Note: StockRequestReminderScheduler and AttendanceReminderScheduler were removed
// from the render tree — reminders now run server-side via pg_cron (see
// supabase/migrations/20260701000000_reminder_cron_jobs.sql), so no client-side
// polling is needed. The component files are kept in case a client-side fallback
// is ever needed again.
import { PushNotificationStatus } from './components/PushNotificationStatus';
import { LoadingSkeleton, CompactLoadingSkeleton } from './components/LoadingSkeleton';
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2, Users, TrendingUp, Download, Menu, X, Clock, Calendar, UserPlus, CheckSquare, Store, Factory, Bell, Activity, RefreshCw, Database, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from './utils/supabase/client';
import { projectId, publicAnonKey } from './utils/supabase/info';
import * as api from './utils/api';
import * as pushNotifications from './utils/pushNotifications';
import * as dataCache from './utils/dataCache';

export type InventoryItem = {
  id: string;
  date: string;
  category: 'fresh_produce' | 'spices_seasonings' | 'dairy' | 'meat' | 'packaging' | 'staff_essentials';
  itemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  storeId?: string; // Optional storeId for multi-store filtering
  createdBy?: string; // User ID who created this entry
  createdByName?: string; // User name who created this entry
  createdByEmail?: string; // User email who created this entry
  // Payment method fields
  paymentMethod?: 'cash' | 'online' | 'both';
  cashAmount?: number; // Amount paid via cash (for 'both' option)
  onlineAmount?: number; // Amount paid via online (for 'both' option)
};

export type OverheadItem = {
  id: string;
  date: string;
  category: 'fuel' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair' | 'party' | 'lunch' | 'emergency_online' | 'personal_expense' | 'miscellaneous' | 'utensils' | 'equipments' | 'license' | 'water_jar' | 'evening_snacks' | 'commission'; // 'commission' is a legacy category kept for backwards compatibility with old records
  description: string;
  amount: number;
  storeId?: string; // Optional storeId for multi-store filtering
  employeeId?: string; // For personal_expense category
  employeeName?: string; // For personal_expense category
  expenseMonth?: string; // For personal_expense: YYYY-MM format to map expense to specific month (for backlogged salaries)
  // Payment method fields
  paymentMethod?: 'cash' | 'online' | 'both';
  cashAmount?: number; // Amount paid via cash (for 'both' option)
  onlineAmount?: number; // Amount paid via online (for 'both' option)
};

export type FixedCostItem = {
  id: string;
  category: 'electricity' | 'rent' | 'lpg_gas';
  amount: number;
  description: string;
  date: string;
  userId: string;
  storeId?: string;
  // LPG Gas specific fields
  units?: number;
  unitPrice?: number;
  // Payment method fields
  paymentMethod?: 'cash' | 'online' | 'both';
  cashAmount?: number; // Amount paid via cash (for 'both' option)
  onlineAmount?: number; // Amount paid via online (for 'both' option)
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
  approvalStatus: 'pending' | 'approved';
  actualCashInHand: number;
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
  actualPaytmBalance?: number; // Actual Paytm balance reconciliation
  paytmOffset?: number; // Paytm discrepancy/offset
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
  user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | null } | null;
};

export default function App() {
  // All useState hooks must be at the top, before any conditional returns
  const [activeView, setActiveViewRaw] = useState<'inventory' | 'sales' | 'payroll' | 'analytics' | 'export' | 'attendance' | 'employees' | 'assets' | 'production' | 'stock-requests' | 'advanced-inventory' | 'inventory-items' | 'backup'>('analytics');
  // Wrap in startTransition to prevent Suspense from replacing UI with loading indicator on tab switches
  const setActiveView = useCallback((view: typeof activeView) => {
    startTransition(() => { setActiveViewRaw(view); });
  }, []);
  const [user, setUser] = useState<{ email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | null } | null>(null);
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
  const [productionData, setProductionData] = useState<ProductionData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showPushNotificationPanel, setShowPushNotificationPanel] = useState(false);
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [pendingTwoFactor, setPendingTwoFactor] = useState<{ accessToken: string; refreshToken: string; email: string } | null>(null);
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

  // Check for setup URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isSetupMode = urlParams.get('setup') === 'cluster-head';

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
      'onlineCashRecalibrations'
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
      const [inventoryData, overheadsData, fixedCostsData, salesData, categorySalesResponse, productionData, productionHousesData, stockRequestsData, productionRequestsData, inventoryItemsData, onlineCashRecalibrationsData] = await Promise.all([
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
        api.fetchOnlineCashRecalibrations(accessToken) // NEW: Online cash recalibrations
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
              const userRole = userData.data?.user?.user_metadata?.role;
              
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
      
      // If no items exist, initialize defaults
      if (items.length === 0) {
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
      await ensureCoreMomosExist(items);
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
      let designation = session.user.user_metadata?.designation || null;
      
      // For employees, fetch full employee record to get storeId
      if (session.user.user_metadata?.employeeId) {
        try {
          const employees = await api.getEmployees();
          const employeeRecord = employees.find(emp => emp.employeeId === session.user.user_metadata?.employeeId);
          if (employeeRecord) {
            storeId = employeeRecord.storeId || null;
            designation = employeeRecord.designation || designation;
          }
        } catch (error) {
          console.error('Error fetching employee storeId on session check:', error);
        }
      }
      
      const userData = {
        email: session.user.email || '',
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
        role: session.user.user_metadata?.role || 'manager',
        employeeId: session.user.user_metadata?.employeeId || null,
        accessToken: session.access_token,
        storeId,
        designation
      };
      setUser(userData);

      // Reflect current 2FA enrollment status for the security settings panel
      try {
        const status = await api.get2FAStatus(session.access_token);
        setTwoFactorEnabled(!!status.enabled);
      } catch (error) {
        console.error('Error fetching 2FA status on session check:', error);
      }

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

  // Initialize push notifications when user logs in
  useEffect(() => {
    if (user) {
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
          const userId = user.employeeId || user.email;
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
  }, [user]); // Run when user changes

  // Deep-link handling for push notification clicks (see public/sw.js).
  // Two delivery paths depending on whether a tab was already open when clicked:
  //   1. Tab already open: service worker postMessages this window directly.
  //   2. No tab open: service worker opens a new window with ?view=&tab=&highlightRequestId= params.
  useEffect(() => {
    const applyNavigationTarget = (target: { view: string; tab?: string; highlightRequestId?: string }) => {
      if (!target?.view) return;
      setActiveView(target.view as typeof activeView);
      setHighlightTab(target.tab || null);
      if (target.highlightRequestId) {
        setHighlightRequestId(target.highlightRequestId);
      }
    };

    // Case 1: tab was already open, service worker messages us directly
    const handleServiceWorkerMessage = (event: MessageEvent) => {
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
      applyNavigationTarget({ view: viewParam, tab: tabParam || undefined, highlightRequestId: highlightParam || undefined });
      // Clean the URL so refreshing doesn't re-trigger the same navigation
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', handleServiceWorkerMessage);
    };
  }, []);

  const finalizeLogin = async (authUser: any, session: { access_token: string }) => {
    let storeId = null;
    let designation = authUser.user_metadata?.designation || null;

    // For employees, fetch full employee record to get storeId
    if (authUser.user_metadata?.employeeId) {
      try {
        const employees = await api.getEmployees();
        const employeeRecord = employees.find(emp => emp.employeeId === authUser.user_metadata?.employeeId);
        if (employeeRecord) {
          storeId = employeeRecord.storeId || null;
          designation = employeeRecord.designation || designation;
        }
      } catch (error) {
        console.error('Error fetching employee storeId:', error);
      }
    }

    const userData = {
      email: authUser.email || '',
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
      role: authUser.user_metadata?.role || 'manager',
      employeeId: authUser.user_metadata?.employeeId || null,
      accessToken: session.access_token,
      storeId,
      designation
    };
    setUser(userData);
    setTwoFactorEnabled(false);
    setPendingTwoFactor(null);

    // Load data for the user
    await loadData(session.access_token);

    // Load stores and employees for managers (cluster heads, operations managers, and audit users need this)
    if (userData.role === 'cluster_head' || userData.role === 'manager' || userData.role === 'audit') {
      await loadStores();
      await loadEmployees();
    }
  };

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
        // Check whether this account has TOTP-based 2FA enabled before treating the
        // password check alone as a completed login.
        let requires2FA = false;
        try {
          const status = await api.get2FAStatus(data.session.access_token);
          requires2FA = !!status.enabled;
        } catch (statusError) {
          console.error('Error checking 2FA status:', statusError);
        }

        if (requires2FA) {
          // Don't persist or otherwise use this session until the second factor is
          // verified. Sign out to clear the auto-persisted session, keep the tokens
          // in memory only, and prompt for the authenticator code.
          const refreshToken = data.session.refresh_token;
          await supabaseClient.auth.signOut();
          setPendingTwoFactor({
            accessToken: data.session.access_token,
            refreshToken,
            email: data.user.email || email
          });
          return;
        }

        await finalizeLogin(data.user, data.session);
      }
    } catch (error) {
      console.log('Login error:', error);
      setAuthError('Failed to sign in. Please try again.');
    }
  };

  const handleTwoFactorVerified = async () => {
    if (!pendingTwoFactor) return;
    const { accessToken, refreshToken } = pendingTwoFactor;

    // Restore the real Supabase session now that the second factor has been verified.
    const { data, error } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (error || !data.user || !data.session) {
      setAuthError('Failed to complete sign in. Please try again.');
      setPendingTwoFactor(null);
      return;
    }

    setTwoFactorEnabled(true);
    await finalizeLogin(data.user, data.session);
  };

  const handleTwoFactorCancel = () => {
    setPendingTwoFactor(null);
    setAuthError(null);
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
                joiningDate: new Date().toISOString().split('T')[0],
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
    await supabaseClient.auth.signOut();
    setUser(null);
    setTwoFactorEnabled(false);
    setPendingTwoFactor(null);
    setInventory([]);
    setOverheads([]);
    setFixedCosts([]);
    setSalesData([]);
    setActiveView('sales');
    dataCache.invalidateAllCaches(); // Clear all caches on logout
  };

  const handleRefreshData = async () => {
    if (!user) return;
    console.log('🔄 Manual refresh triggered');
    await loadData(user.accessToken, true); // Force refresh bypasses cache
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
      
      // Auto-add storeId if user has one
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
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
      
      const updatedInventory = [...inventory, newItem];
      console.log('📊 [ADD INVENTORY] Setting inventory state, new count:', updatedInventory.length);
      setInventory(updatedInventory);
      
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
      // Auto-add storeId if user has one
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const newItem = await api.addOverhead(user.accessToken, itemWithStore);
      setOverheads([...overheads, newItem]);
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
      // Auto-add storeId if user has one
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const newItem = await api.addFixedCost(user.accessToken, itemWithStore);
      setFixedCosts([...fixedCosts, newItem]);
      dataCache.invalidateCache('fixedCosts');
    } catch (error) {
      console.error('Error adding fixed cost item:', error);
      throw error;
    }
  };

  const updateInventoryItem = async (id: string, item: Omit<InventoryItem, 'id'>) => {
    if (!user) return;
    try {
      // Auto-add storeId if user has one (for consistency)
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const updatedItem = await api.updateInventory(user.accessToken, id, itemWithStore);
      setInventory(inventory.map(inv => inv.id === id ? updatedItem : inv));
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
      // Auto-add storeId if user has one (for consistency)
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const updatedItem = await api.updateOverhead(user.accessToken, id, itemWithStore);
      setOverheads(overheads.map(ovh => ovh.id === id ? updatedItem : ovh));
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
      // Auto-add storeId if user has one (for consistency)
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const updatedItem = await api.updateFixedCost(user.accessToken, id, itemWithStore);
      setFixedCosts(fixedCosts.map(fc => fc.id === id ? updatedItem : fc));
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
      setInventory(inventory.filter(inv => inv.id !== id));
      dataCache.invalidateCache('inventory');
      console.log('✅ Inventory item deleted successfully');
    } catch (error: any) {
      // If item not found, it was already deleted - update UI anyway
      if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
        console.log('⚠️ Item was already deleted, updating UI');
        setInventory(inventory.filter(inv => inv.id !== id));
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
      setOverheads(overheads.filter(ovh => ovh.id !== id));
      dataCache.invalidateCache('overheads');
      console.log('✅ Expense/Overhead item deleted successfully');
    } catch (error: any) {
      // If item not found, it was already deleted - update UI anyway
      if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
        console.log('⚠️ Expense/Overhead item was already deleted, updating UI');
        setOverheads(overheads.filter(ovh => ovh.id !== id));
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
      setFixedCosts(fixedCosts.filter(fc => fc.id !== id));
      dataCache.invalidateCache('fixedCosts');
      console.log('✅ Fixed cost item deleted successfully');
    } catch (error: any) {
      // If item not found, it was already deleted - update UI anyway
      if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
        console.log('⚠️ Item was already deleted, updating UI');
        setFixedCosts(fixedCosts.filter(fc => fc.id !== id));
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
      console.log('Frontend - Current user:', user);
      console.log('Frontend - User role:', user.role);
      console.log('Frontend - Access token (first 50 chars):', user.accessToken.substring(0, 50));
      // Auto-add storeId if user has one
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const newItem = await api.addSalesData(user.accessToken, itemWithStore);
      setSalesData([...salesData, newItem]);
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
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
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
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
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
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
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
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
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
      setSalesData(salesData.map(sd => sd.id === id ? updatedItem : sd));
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
      setProductionData([...productionData, newItem]);
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
      setProductionData(productionData.map(pd => pd.id === id ? updatedItem : pd));
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
      setProductionData(productionData.map(pd => pd.id === id ? updatedItem : pd));
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
      setStockRequests([...stockRequests, newRequest]);
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
      setStockRequests(stockRequests.map(r => r.id === id ? updated : r));
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
      setStockRequests(stockRequests.map(r => r.id === id ? updated : r));
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
    user
  };

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 text-[#B0A8D8] mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show setup page if in setup mode
  if (isSetupMode) {
    return <SetupClusterHead />;
  }

  // Show auth page if not logged in
  if (!user) {
    if (pendingTwoFactor) {
      return (
        <TwoFactorVerify
          accessToken={pendingTwoFactor.accessToken}
          email={pendingTwoFactor.email}
          onVerified={handleTwoFactorVerified}
          onCancel={handleTwoFactorCancel}
        />
      );
    }
    return (
      <AuthPage
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={authError}
      />
    );
  }

  // Floating button + panel to let any logged-in user enable/check push notifications
  const pushNotificationWidget = (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        <button
          onClick={() => setShowSecurityPanel(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-3 shadow-lg transition-all"
          title="Security Settings"
        >
          <ShieldCheck className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowPushNotificationPanel(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white rounded-full p-3 shadow-lg transition-all"
          title="Push Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>
      </div>
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
      {showSecurityPanel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setShowSecurityPanel(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <TwoFactorSetup
              accessToken={user.accessToken}
              enabled={twoFactorEnabled}
              onStatusChange={setTwoFactorEnabled}
            />
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
  const isOperationsManager = user.role === 'manager' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
  const isManager = user.role === 'manager';
  const canViewProduction = isProductionIncharge || isOperationsManager || isClusterHead;

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

        <div className="min-h-screen bg-gray-50">
          {/* Employee Navigation */}
          <nav className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-3">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/30">
                  <h1 className="text-xl sm:text-2xl text-white font-bold tracking-wide">Bhandar-IMS</h1>
                  <p className="text-xs text-white/90">
                    {user.name} • {isStoreIncharge ? 'Store Incharge' : isProductionIncharge ? 'Production Head' : 'Employee'}
                  </p>
                </div>
              </div>
              
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden flex items-center gap-2 px-3 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-all border border-white/30"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              
              {/* Desktop Menu */}
              <div className="hidden lg:flex gap-2">
                <button
                  onClick={() => setActiveView('analytics')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                    activeView === 'analytics'
                      ? 'bg-white text-purple-600 border-white shadow-lg'
                      : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Analytics</span>
                </button>
                {isAnyIncharge && (
                  <>
                    <button
                      onClick={() => setActiveView('inventory')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                        activeView === 'inventory'
                          ? 'bg-white text-purple-600 border-white shadow-lg'
                          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      <span>Expense</span>
                    </button>
                    <button
                      onClick={() => setActiveView('sales')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                        activeView === 'sales'
                          ? 'bg-white text-purple-600 border-white shadow-lg'
                          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                      }`}
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Sales</span>
                    </button>
                  </>
                )}
                {canViewProduction && (
                  <button
                    onClick={() => setActiveView('production')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                      activeView === 'production'
                        ? 'bg-white text-purple-600 border-white shadow-lg'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    }`}
                  >
                    <Factory className="w-4 h-4" />
                    <span>Production</span>
                  </button>
                )}
                {isAnyIncharge && (
                  <button
                    onClick={() => setActiveView('stock-requests')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                      activeView === 'stock-requests'
                        ? 'bg-white text-purple-600 border-white shadow-lg'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span>Stock Requests</span>
                  </button>
                )}
                {isManager && (
                  <>
                    <button
                      onClick={() => setActiveView('advanced-inventory')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                        activeView === 'advanced-inventory'
                          ? 'bg-white text-purple-600 border-white shadow-lg'
                          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                      <span>Inventory Analytics</span>
                    </button>
                    <button
                      onClick={() => setActiveView('inventory-items')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                        activeView === 'inventory-items'
                          ? 'bg-white text-purple-600 border-white shadow-lg'
                          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      <span>Manage Items</span>
                    </button>
                  </>
                )}

                {/* Payroll and Attendance for non-manager/cluster-head users */}
                <button
                  onClick={() => setActiveView('payroll')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                    activeView === 'payroll'
                      ? 'bg-white text-purple-600 border-white shadow-lg'
                      : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>{isAnyIncharge ? 'Payroll' : 'My Payouts'}</span>
                </button>
                <button
                  onClick={() => setActiveView('attendance')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                    activeView === 'attendance'
                      ? 'bg-white text-purple-600 border-white shadow-lg'
                      : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Attendance</span>
                </button>

                {isAnyIncharge && (
                  <button
                    onClick={() => setActiveView('export')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all backdrop-blur-sm border-2 ${
                      activeView === 'export'
                        ? 'bg-white text-purple-600 border-white shadow-lg'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </button>
                )}
                {/* Notification Button for Store Incharge and Production Head */}
                {isAnyIncharge && (
                  <Notifications onNavigate={(path, date, requestId) => {
                    if (path === 'sales') {
                      setActiveView('sales');
                      setHighlightRequestId(null);
                    }
                    if (path === 'production') {
                      setActiveView('production');
                      setHighlightRequestId(null);
                    }
                    if (path === 'attendance') {
                      setActiveView('employees');
                      setHighlightRequestId(null);
                    }
                    if (path === 'production-requests') {
                      console.log('🔔 Production request notification clicked, requestId:', requestId);
                      // Clear first to ensure the effect triggers even if it's the same ID
                      setHighlightRequestId(null);
                      // Use setTimeout to ensure the clear happens first
                      setTimeout(() => {
                        setHighlightRequestId(requestId || null);
                        setActiveView('analytics');
                      }, 0);
                    }
                  }} />
                )}
                <button
                  onClick={handleRefreshData}
                  disabled={isLoadingData}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/90 text-white rounded-xl hover:bg-green-600 transition-all backdrop-blur-sm border-2 border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/90 text-white rounded-xl hover:bg-red-600 transition-all backdrop-blur-sm border-2 border-white/30"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
            
            {/* Mobile Menu */}
            {isMobileMenuOpen && (
              <div className="lg:hidden border-t border-white/20 py-4 space-y-2">
                <button
                  onClick={() => {
                    setActiveView('analytics');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeView === 'analytics'
                      ? 'bg-white text-purple-600'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  <TrendingUp className="w-5 h-5" />
                  <span>Analytics</span>
                </button>
                {isAnyIncharge && (
                  <>
                    <button
                      onClick={() => {
                        setActiveView('inventory');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                        activeView === 'inventory'
                          ? 'bg-white text-purple-600'
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
                          ? 'bg-white text-purple-600'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      <DollarSign className="w-5 h-5" />
                      <span>Sales</span>
                    </button>
                  </>
                )}
                {canViewProduction && (
                  <button
                    onClick={() => {
                      setActiveView('production');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      activeView === 'production'
                        ? 'bg-white text-purple-600'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    <Factory className="w-5 h-5" />
                    <span>Production</span>
                  </button>
                )}
                {isAnyIncharge && (
                  <button
                    onClick={() => {
                      setActiveView('stock-requests');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      activeView === 'stock-requests'
                        ? 'bg-white text-purple-600'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    <Package className="w-5 h-5" />
                    <span>Stock Requests</span>
                  </button>
                )}
                {isManager && (
                  <>
                    <button
                      onClick={() => {
                        setActiveView('advanced-inventory');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                        activeView === 'advanced-inventory'
                          ? 'bg-white text-purple-600'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      <Activity className="w-5 h-5" />
                      <span>Inventory Analytics</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('inventory-items');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                        activeView === 'inventory-items'
                          ? 'bg-white text-purple-600'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      <Package className="w-5 h-5" />
                      <span>Manage Items</span>
                    </button>
                  </>
                )}

                {/* Payroll and Attendance for non-manager/cluster-head users */}
                <button
                  onClick={() => {
                    setActiveView('payroll');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeView === 'payroll'
                      ? 'bg-white text-purple-600'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span>{isAnyIncharge ? 'Payroll' : 'My Payouts'}</span>
                </button>
                <button
                  onClick={() => {
                    setActiveView('attendance');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeView === 'attendance'
                      ? 'bg-white text-purple-600'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                  <span>Attendance</span>
                </button>

                {isAnyIncharge && (
                  <button
                    onClick={() => {
                      setActiveView('export');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      activeView === 'export'
                        ? 'bg-white text-purple-600'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    <Download className="w-5 h-5" />
                    <span>Export</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    handleRefreshData();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={isLoadingData}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-green-500/90 text-white rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-5 h-5 ${isLoadingData ? 'animate-spin' : ''}`} />
                  <span>Refresh Data</span>
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

        {/* Employee Main Content */}
        <main className="pb-6">
          <Suspense fallback={<><div className="md:hidden"><CompactLoadingSkeleton /></div><div className="hidden md:block"><LoadingSkeleton /></div></>}>
          {activeView === 'analytics' ? (
            <Analytics 
              context={contextValue} 
              highlightRequestId={highlightRequestId}
              onNavigateToManageItems={() => {
                console.log('🔄 App.tsx: Changing activeView to inventory-items');
                setActiveView('inventory-items');
              }}
            />
          ) : activeView === 'inventory' && isAnyIncharge ? (
            <InventoryView context={contextValue} />
          ) : activeView === 'sales' && isAnyIncharge ? (
            <SalesManagement context={contextValue} selectedStoreId={selectedStoreId} />
          ) : activeView === 'production' && canViewProduction ? (
            <ProductionManagement context={contextValue} selectedStoreId={selectedStoreId} />
          ) : activeView === 'payroll' ? (
            isAnyIncharge ? (
              <PayrollManagement 
                userRole={'manager' as 'manager' | 'cluster_head'} 
                selectedDate={new Date().toISOString().split('T')[0]}
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
            />
          ) : activeView === 'export' && isAnyIncharge ? (
            <ExportData 
              userRole={'manager' as 'manager' | 'cluster_head'} 
              selectedStoreId={user.storeId || null}
              currentUserId={user.email}
            />
          ) : activeView === 'stock-requests' && isAnyIncharge ? (
            <StockRequestManagement context={contextValue} stores={stores} />
          ) : activeView === 'advanced-inventory' && isManager ? (
            <AdvancedInventoryManagement 
              context={contextValue} 
              stores={stores}
              onNavigateToManageItems={() => setActiveView('inventory-items')}
            />
          ) : activeView === 'inventory-items' && (isManager || isAnyIncharge) ? (
            (() => {
              console.log('✅ Rendering InventoryItemsManagement:', { activeView, isManager, isAnyIncharge });
              return <InventoryItemsManagement context={contextValue} />;
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

      <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex justify-between items-center py-2 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 border border-white/30">
                <h1 className="text-base sm:text-xl lg:text-2xl text-white font-bold tracking-wide">Bhandar-IMS</h1>
                <p className="text-[10px] sm:text-xs text-white/90 truncate max-w-[160px] sm:max-w-none">
                  {user.name} • {user.designation === 'store_incharge' ? 'Store Incharge' : user.designation === 'production_incharge' ? 'Production Incharge' : (user.role === 'manager' ? 'Operations Manager' : 'Cluster Head')}
                </p>
              </div>
            </div>
            
            {/* Notifications Bell & Mobile Menu Button */}
            <div className="flex items-center gap-3">
              {/* Notifications - Always visible */}
              <Notifications onNavigate={(path, date, requestId) => {
                if (path === 'sales') {
                  setActiveView('sales');
                  setHighlightRequestId(null);
                }
                else if (path === 'attendance') {
                  setActiveView('employees');
                  setHighlightRequestId(null);
                }
                else if (path === 'leave') {
                  setActiveView('employees');
                  setHighlightRequestId(null);
                }
                else if (path === 'production') {
                  setActiveView('production');
                  setHighlightRequestId(null);
                }
                else if (path === 'production-requests') {
                  console.log('🔔 Production request notification clicked (mobile), requestId:', requestId);
                  // Clear first to ensure the effect triggers even if it's the same ID
                  setHighlightRequestId(null);
                  // Use setTimeout to ensure the clear happens first
                  setTimeout(() => {
                    setHighlightRequestId(requestId || null);
                    setActiveView('analytics');
                  }, 0);
                }
              }} />
              
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition-all border border-white/30"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden lg:flex gap-2 flex-wrap">
              {isClusterHead ? (
                <>
                  <button
                    onClick={() => setActiveView('analytics')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      activeView === 'analytics'
                        ? 'bg-white text-purple-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span className="hidden xl:inline">Expense</span>
                  </button>
                  <button
                    onClick={() => setActiveView('sales')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      activeView === 'sales'
                        ? 'bg-white text-pink-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="hidden xl:inline">Sales</span>
                  </button>
                  {canViewProduction && (
                    <button
                      onClick={() => setActiveView('production')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                        activeView === 'production'
                          ? 'bg-white text-amber-600 shadow-lg font-semibold'
                          : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                      }`}
                    >
                      <Factory className="w-4 h-4" />
                      <span className="hidden xl:inline">Production</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveView('employees')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      activeView === 'employees'
                        ? 'bg-white text-indigo-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        ? 'bg-white text-purple-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span className="hidden xl:inline">Analytics</span>
                  </button>
                  <button
                    onClick={() => setActiveView('sales')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      activeView === 'sales'
                        ? 'bg-white text-pink-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="hidden xl:inline">Sales</span>
                  </button>
                  <button
                    onClick={() => setActiveView('inventory')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      activeView === 'inventory'
                        ? 'bg-white text-green-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    <span className="hidden xl:inline">Expense</span>
                  </button>
                  {canViewProduction && (
                    <button
                      onClick={() => setActiveView('production')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                        activeView === 'production'
                          ? 'bg-white text-amber-600 shadow-lg font-semibold'
                          : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                      }`}
                    >
                      <Factory className="w-4 h-4" />
                      <span className="hidden xl:inline">Production</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveView('employees')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      activeView === 'employees'
                        ? 'bg-white text-indigo-600 shadow-lg font-semibold'
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
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
                        : 'bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    <span className="hidden xl:inline">Backup</span>
                  </button>
                </>
              )}
              <button
                onClick={handleRefreshData}
                disabled={isLoadingData}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-green-500 transition-all duration-300 transform hover:scale-105 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                <span className="hidden xl:inline">Refresh</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-red-500 transition-all duration-300 transform hover:scale-105 border border-white/20"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden xl:inline">Logout</span>
              </button>
            </div>
          </div>
          
          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden border-t border-white/20 py-3 space-y-1.5 max-h-[70vh] overflow-y-auto">
              {isClusterHead ? (
                <>
                  <button
                    onClick={() => {
                      setActiveView('analytics');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                      activeView === 'analytics'
                        ? 'bg-white text-purple-600 font-semibold shadow-sm'
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
                  {canViewProduction && (
                    <button
                      onClick={() => {
                        setActiveView('production');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeView === 'production'
                          ? 'bg-[#FFE4B5] text-gray-800'
                          : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
                      }`}
                    >
                      <Factory className="w-5 h-5" />
                      <span>Production</span>
                    </button>
                  )}
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
                  {canViewProduction && (
                    <button
                      onClick={() => {
                        setActiveView('production');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeView === 'production'
                          ? 'bg-[#FFE4B5] text-gray-800'
                          : 'bg-gray-50 text-gray-700 hover:bg-[#FFF8DC]'
                      }`}
                    >
                      <Factory className="w-5 h-5" />
                      <span>Production</span>
                    </button>
                  )}
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
                </>
              )}
              <button
                onClick={() => {
                  handleRefreshData();
                  setIsMobileMenuOpen(false);
                }}
                disabled={isLoadingData}
                className="w-full flex items-center gap-3 px-4 py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-5 h-5 ${isLoadingData ? 'animate-spin' : ''}`} />
                <span>Refresh Data</span>
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

      {/* Store Selector for Cluster Heads */}
      {isClusterHead && stores.length > 0 && (
        <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 border-b border-purple-100 px-4 py-6">
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
      <main className="pb-6">
        <Suspense fallback={<><div className="md:hidden"><CompactLoadingSkeleton /></div><div className="hidden md:block"><LoadingSkeleton /></div></>}>
        {activeView === 'sales' ? (
          <SalesManagement context={contextValue} selectedStoreId={selectedStoreId} />
        ) : activeView === 'inventory' ? (
          // Only Operations Manager can edit, others get read-only view
          user.role === 'manager' ? (
            <InventoryManagement context={contextValue} selectedStoreId={selectedStoreId} employees={employees} />
          ) : (
            <InventoryView context={contextValue} selectedStoreId={selectedStoreId} />
          )
        ) : activeView === 'analytics' ? (
          <Analytics 
            context={contextValue} 
            selectedStoreId={selectedStoreId} 
            highlightRequestId={highlightRequestId}
            onNavigateToManageItems={() => {
              console.log('🔄 App.tsx: Changing activeView to inventory-items');
              setActiveView('inventory-items');
            }}
          />
        ) : activeView === 'export' ? (
          <ExportData 
            userRole={user.role as 'manager' | 'cluster_head'} 
            selectedStoreId={selectedStoreId}
            currentUserId={user.email}
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
          />
        ) : activeView === 'assets' ? (
          <AssetsManagement 
            context={contextValue} 
            stores={stores}
            employees={employees}
            onRefreshStores={loadStores}
          />
        ) : activeView === 'production' && canViewProduction ? (
          <ProductionManagement context={contextValue} selectedStoreId={selectedStoreId} />
        ) : activeView === 'stock-requests' ? (
          <StockRequestManagement context={contextValue} stores={stores} />
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

    {/* Fix Legacy Inventory - Shows when there are items missing storeId */}
    {user && activeView === 'inventory' && (
      <FixLegacyInventory context={contextValue} />
    )}
    </>
  );
}