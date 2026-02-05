// Bhandar-IMS - Fixed recalibration date comparison logic
import { useState, useEffect } from 'react';
import { InventoryManagement } from './components/InventoryManagement';
import { InventoryView } from './components/InventoryView';
import { ClusterDashboard } from './components/ClusterDashboard';
import { SalesManagement } from './components/SalesManagement';
import { PayrollManagement } from './components/PayrollManagement';
import { Analytics } from './components/Analytics';
import { ExportData } from './components/ExportData';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { AuditDashboard } from './components/AuditDashboard';
import { AuthPage } from './components/AuthPage';
import { EmployeeTimesheet } from './components/EmployeeTimesheet';
import { EmployeeLeave } from './components/EmployeeLeave';
import { CreateEmployee } from './components/CreateEmployee';
import { ApproveTimesheets } from './components/ApproveTimesheets';
import { ApproveLeaves } from './components/ApproveLeaves';
import { EmployeeHierarchy } from './components/EmployeeHierarchy';
import { AttendancePortal } from './components/AttendancePortal';
import { EmployeeManagement } from './components/EmployeeManagement';
import { Notifications } from './components/Notifications';
import { EmployeePayroll } from './components/EmployeePayroll';
import { StoreManagement } from './components/StoreManagement';
import { StoreSelector } from './components/StoreSelector';
import { SetupClusterHead } from './components/SetupClusterHead';
import { ProductionManagement } from './components/ProductionManagement';
import { ProductionHouseManagement } from './components/ProductionHouseManagement';
import { AssetsManagement } from './components/AssetsManagement';
import { StockRequestManagement } from './components/StockRequestManagement';
import { AdvancedInventoryManagement } from './components/AdvancedInventoryManagement';
import { InventoryItemsManagement } from './components/InventoryItemsManagement';
import { StockRequestReminderScheduler } from './components/StockRequestReminderScheduler';
import { FixLegacyInventory } from './components/FixLegacyInventory';
import { BackupRestore } from './components/BackupRestore';
import { Package, BarChart3, LogOut, AlertCircle, DollarSign, Trash2, Users, TrendingUp, Download, Menu, X, Clock, Calendar, UserPlus, CheckSquare, Store, Factory, Bell, Activity, RefreshCw, Database } from 'lucide-react';
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
  category: 'fuel' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair' | 'party' | 'lunch' | 'emergency_online' | 'personal_expense' | 'miscellaneous' | 'utensils' | 'equipments' | 'license' | 'water_jar';
  description: string;
  amount: number;
  storeId?: string; // Optional storeId for multi-store filtering
  employeeId?: string; // For personal_expense category
  employeeName?: string; // For personal_expense category
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
  addMonthlyCommission: (item: Omit<MonthlyCommission, 'id'>) => Promise<void>;
  updateMonthlyCommission: (id: string, item: Omit<MonthlyCommission, 'id'>) => Promise<void>;
  deleteMonthlyCommission: (id: string) => Promise<void>;
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
  const [activeView, setActiveView] = useState<'inventory' | 'sales' | 'payroll' | 'analytics' | 'export' | 'attendance' | 'employees' | 'assets' | 'production' | 'stock-requests' | 'advanced-inventory' | 'inventory-items' | 'backup'>('analytics');
  const [user, setUser] = useState<{ email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | null } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [highlightRequestId, setHighlightRequestId] = useState<string | null>(null);
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
        api.getProductionHouses(accessToken),
        api.getStockRequests(accessToken),
        api.fetchProductionRequests(accessToken),
        api.fetchInventoryItems(), // NEW: Dynamic inventory items metadata
        api.fetchOnlineCashRecalibrations(accessToken) // NEW: Online cash recalibrations
      ]);
      
      console.log('🔍 Stock Requests API Response:', stockRequestsData);
      console.log('🔍 Stock Requests count:', stockRequestsData?.length || 0);
      console.log('🔍 Sample stock request:', stockRequestsData?.[0]);
      
      // Debug logging to check for duplicates
      console.log('📦 Loaded Inventory Items:', inventoryData.length);
      console.log('🔧 Loaded Overhead Items:', overheadsData.length);
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
      console.log('Inventory: Before:', inventoryData.length, '→ After:', uniqueInventory.length);
      console.log('Overheads: Before:', overheadsData.length, '→ After:', uniqueOverheads.length);
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
        let designation = data.user.user_metadata?.designation || null;
        
        // For employees, fetch full employee record to get storeId
        if (data.user.user_metadata?.employeeId) {
          try {
            const employees = await api.getEmployees();
            const employeeRecord = employees.find(emp => emp.employeeId === data.user.user_metadata?.employeeId);
            if (employeeRecord) {
              storeId = employeeRecord.storeId || null;
              designation = employeeRecord.designation || designation;
            }
          } catch (error) {
            console.error('Error fetching employee storeId:', error);
          }
        }
        
        const userData = {
          email: data.user.email || '',
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
          role: data.user.user_metadata?.role || 'manager',
          employeeId: data.user.user_metadata?.employeeId || null,
          accessToken: data.session.access_token,
          storeId,
          designation
        };
        setUser(userData);
        
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

  const addInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
    if (!user) return;
    try {
      // Auto-add storeId if user has one
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      console.log('📤 Sending inventory item to backend:', itemWithStore);
      const newItem = await api.addInventory(user.accessToken, itemWithStore);
      console.log('✅ Received inventory item from backend:', newItem);
      setInventory([...inventory, newItem]);
      dataCache.invalidateCache('inventory'); // Invalidate cache on data change
    } catch (error) {
      console.error('Error adding inventory item:', error);
      throw error;
    }
  };

  const addOverheadItem = async (item: Omit<OverheadItem, 'id'>) => {
    if (!user) return;
    try {
      // Auto-add storeId if user has one
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const newItem = await api.addOverhead(user.accessToken, itemWithStore);
      setOverheads([...overheads, newItem]);
      dataCache.invalidateCache('overheads');
    } catch (error) {
      console.error('Error adding overhead item:', error);
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
      // Auto-add storeId if user has one (for consistency)
      const itemWithStore = {
        ...item,
        storeId: user.storeId || item.storeId
      };
      const updatedItem = await api.updateOverhead(user.accessToken, id, itemWithStore);
      setOverheads(overheads.map(ovh => ovh.id === id ? updatedItem : ovh));
      dataCache.invalidateCache('overheads');
    } catch (error) {
      console.error('Error updating overhead item:', error);
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
      await api.deleteOverhead(user.accessToken, id);
      setOverheads(overheads.filter(ovh => ovh.id !== id));
      dataCache.invalidateCache('overheads');
      console.log('✅ Overhead item deleted successfully');
    } catch (error: any) {
      // If item not found, it was already deleted - update UI anyway
      if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
        console.log('⚠️ Item was already deleted, updating UI');
        setOverheads(overheads.filter(ovh => ovh.id !== id));
        dataCache.invalidateCache('overheads');
      } else {
        console.error('Error deleting overhead item:', error);
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
      const houses = await api.getProductionHouses(user.accessToken);
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
    return (
      <AuthPage
        onLogin={handleLogin}
        onSignup={handleSignup}
        error={authError}
      />
    );
  }

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
    );
  }

  // If employee, show only employee dashboard
  if (isEmployee) {
    return (
      <>
        {/* Stock Request Reminder Scheduler - runs in background */}
        <StockRequestReminderScheduler />
        
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
        </main>
      </div>
      </>
    );
  }

  return (
    <>
      {/* Stock Request Reminder Scheduler - runs in background */}
      <StockRequestReminderScheduler />
      
      <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/30">
                <h1 className="text-xl sm:text-2xl text-white font-bold tracking-wide">Bhandar-IMS</h1>
                <p className="text-xs text-white/90">
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
                    <span className="hidden xl:inline">Assets</span>
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
            <div className="lg:hidden border-t border-gray-200 py-4 space-y-2">
              {isClusterHead ? (
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
                    <span>Inventory</span>
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
                    <span>Assets</span>
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
                    <span>Inventory</span>
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
              employeeId: user.employeeId,
              name: user.name,
              storeId: user.storeId,
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
      </main>
    </div>

    {/* Fix Legacy Inventory - Shows when there are items missing storeId */}
    {user && activeView === 'inventory' && (
      <FixLegacyInventory context={contextValue} />
    )}
    </>
  );
}