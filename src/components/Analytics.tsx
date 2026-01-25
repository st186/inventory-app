import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Package, AlertCircle, Calendar, Filter, Download, DollarSign, ShoppingCart, ClipboardCheck, UserX, Users, Factory, Trash2, Edit, Check, X, ClipboardList, FileSpreadsheet, CheckCircle, Settings, RefreshCw, FileText } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps, LineChart, Line } from 'recharts';
import { toast } from 'sonner@2.0.3';
import * as api from '../utils/api';
import { formatDateTimeIST, formatDateIST, getTodayIST } from '../utils/timezone';
import { InventoryContextType } from '../App';
import { DataCapture } from './DataCapture';
import { ProductionRequests } from './ProductionRequests';
import { SalesData as SalesDataComponent } from './SalesData';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';
import { DatePicker } from './DatePicker';
import { RecalibrationReports } from './RecalibrationReports';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES, FIXED_COST_CATEGORIES } from '../utils/inventoryData';
import { getSupabaseClient } from '../utils/supabase/client';
import { logger } from '../utils/logger';
import * as exportUtils from '../utils/export';

interface AnalyticsProps {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  highlightRequestId?: string | null;
  onNavigateToManageItems?: () => void;
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
              ₹{entry.value.toLocaleString()}
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
              ₹{data.value.toLocaleString()}
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

type TimeFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export function Analytics({ context, selectedStoreId, highlightRequestId, onNavigateToManageItems }: AnalyticsProps) {
  const isClusterHead = context.user?.role === 'cluster_head';
  const isManager = context.user?.role === 'manager';
  const isAudit = context.user?.role === 'audit';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  
  // Analytics Mode: 'store' or 'production'
  // Production incharges default to production analytics
  // Store incharges default to store analytics
  const [analyticsMode, setAnalyticsMode] = useState<'store' | 'production'>(
    isProductionIncharge ? 'production' : 'store'
  );
  
  // Local store selector for Store Analytics mode
  // Use selectedStoreId from prop if available (for backwards compatibility), otherwise null for cluster heads/managers/production incharges/audit users
  const [localSelectedStoreId, setLocalSelectedStoreId] = useState<string | null>(
    selectedStoreId || (isClusterHead || isManager || isProductionIncharge || isAudit ? null : context.user?.storeId) || null
  );
  
  // For Store Analytics mode, use local store selector
  // For Production Analytics mode, this is ignored (we use production house selector instead)
  const effectiveStoreId = analyticsMode === 'store' 
    ? localSelectedStoreId 
    : null; // In Production mode, we don't filter by store
  
  // DEBUG: Log the effective store ID being used
  logger.debugStore('Analytics effectiveStoreId:', effectiveStoreId);
  logger.debugStore('Analytics mode:', analyticsMode);
  console.log('🏪 Local selected store ID:', localSelectedStoreId);
  console.log('🏪 All stores in context:', context.stores);
  console.log('🏪 Number of stores:', context.stores?.length);
  
  type ActiveView = 'profit' | 'expense' | 'sales' | 'datacapture' | 'production' | 'production-requests' | 'recalibration-reports' | 'store-recalibration';
  const [activeView, setActiveView] = useState<ActiveView>(
    highlightRequestId ? 'production-requests' : 'profit'
  );
  
  // Debug: Log activeView changes
  useEffect(() => {
    logger.debugAnalytics('activeView changed to:', activeView);
  }, [activeView]);
  
  // When switching analytics mode, change the active view
  useEffect(() => {
    if (analyticsMode === 'production' && activeView !== 'production' && activeView !== 'recalibration-reports' && activeView !== 'production-requests') {
      setActiveView('production');
    } else if ((activeView === 'production' || activeView === 'recalibration-reports' || activeView === 'production-requests') && analyticsMode === 'store') {
      setActiveView('profit');
    } else if (activeView === 'store-recalibration' && analyticsMode === 'production') {
      setActiveView('production');
    }
  }, [analyticsMode]);
  
  const [salesSubView, setSalesSubView] = useState<'revenue' | 'category'>('revenue');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('monthly');
  const [wastageTimeFilter, setWastageTimeFilter] = useState<TimeFilter>('monthly');
  const [dateRange, setDateRange] = useState({
    from: '2025-03-01',
    to: '2025-12-25'
  });
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
  type DateRangeType = 'today' | 'week' | 'month' | 'year' | 'custom';
  const [productionDateRange, setProductionDateRange] = useState<DateRangeType>('month');
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
      
      case 'week':
        // Start of current week (Monday)
        startDate = new Date(today);
        const dayOfWeek = startDate.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust when day is Sunday
        startDate.setDate(startDate.getDate() + diff);
        // End of current week (Sunday)
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      
      case 'month':
        // Start of current month
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        // End of current month (last day)
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      
      case 'year':
        // Start of current year
        startDate = new Date(today.getFullYear(), 0, 1);
        // End of current year (December 31)
        endDate = new Date(today.getFullYear(), 11, 31);
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
      console.log('   Current month:', currentMonth);
      console.log('   Selected production house ID:', selectedProductionHouseId);
      console.log('   Available production data records:', productionData.length);
      console.log('   Available production requests:', context.productionRequests?.length || 0);
      console.log('   Available stores (local):', stores.length);
      
      // Resolve production house UUID
      // Use local stores state (loaded in useEffect) or fallback to context.stores
      const allStores = stores.length > 0 ? stores : (context.stores || []);
      let productionHouseUUID = selectedProductionHouseId;
      if (selectedProductionHouseId && selectedProductionHouseId.startsWith('STORE-')) {
        const userStore = allStores.find(s => s.id === selectedProductionHouseId);
        if (userStore?.productionHouseId) {
          productionHouseUUID = userStore.productionHouseId;
          console.log('   Resolved production house UUID:', productionHouseUUID);
        }
      }

      // Fetch latest recalibration for this production house
      // IMPORTANT: Recalibration might be saved with either:
      // 1. The production house UUID (when created by cluster head/operations manager)
      // 2. The store ID (when created by production incharge who uses their storeId)
      // We need to try both and use whichever returns data
      
      // Skip API call if no production house is selected
      if (!productionHouseUUID) {
        console.log('   ⚠️ No production house UUID available, skipping recalibration fetch');
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
        console.log('   No recalibration found with UUID, checking with mapped store ID...');
        
        // Find store(s) that map to this production house
        const mappedStores = allStores.filter(s => s.productionHouseId === productionHouseUUID);
        console.log('   Stores mapped to this production house:', mappedStores.map(s => ({ id: s.id, name: s.name })));
        
        // Try each mapped store ID (usually there's only one production house store)
        if (mappedStores && mappedStores.length > 0) {
          for (const mappedStore of mappedStores) {
            console.log('   Trying to fetch recalibration with store ID:', mappedStore.id);
            const storeRecalResponse = await api.fetchLatestRecalibration(
              context.user?.accessToken || '', 
              mappedStore.id,
              'production_house' // Also specify production_house for fallback
            );
            
            if (storeRecalResponse?.record) {
              console.log('   ✅ Found recalibration using store ID:', mappedStore.id);
              recalResponse = storeRecalResponse;
              break;
            }
          }
        }
      }
      
      console.log('📦 Recalibration Response:', recalResponse);
      
      // Check if recalibration exists and is from current month
      let openingBalance: any = null;
      let midMonthRecalibration: any = null; // NEW: Track if we have mid-month recalibration
      
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
          if (recalDay === 1) {
            // CASE 1: Recalibration on 1st of month - RESET EVERYTHING
            // Use recalibration as opening balance (production and deliveries start fresh)
            console.log('✅ Recalibration on 1st of month - using as opening balance (RESET)');
            console.log('   Recalibration items:', recalResponse.record.items);
            openingBalance = {};
            recalResponse.record.items.forEach((item: any) => {
              const inventoryItem = context.inventoryItems?.find(invItem => 
                invItem.id === item.itemId || invItem.name === item.itemId
              );
              
              if (inventoryItem) {
                const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
                const stockKey = camelName.replace(/Momo(s)?$/i, '');
                openingBalance[stockKey] = item.actualQuantity;
                console.log(`  📦 Opening balance (1st of month): ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
              } else {
                // Fallback: use itemId as-is
                openingBalance[item.itemId] = item.actualQuantity;
                console.log(`  ⚠️ Opening balance item not found in inventory: ${item.itemId}, using as-is`);
              }
            });
            console.log('   Parsed opening balance:', openingBalance);
          } else {
            // CASE 2: Mid-month recalibration - DON'T change opening balance
            // Opening balance should be calculated from previous month
            // Only the final stock should reflect recalibration actual quantities
            console.log('⚠️ Mid-month recalibration detected - keeping opening balance from previous month');
            console.log(`   Recalibration date: ${recalResponse.record.date} (day ${recalDay})`);
            
            // Calculate opening balance from previous month as usual
            openingBalance = calculatePreviousMonthClosingStock(productionHouseUUID);
            
            // Store mid-month recalibration data separately
            midMonthRecalibration = {};
            recalResponse.record.items.forEach((item: any) => {
              const inventoryItem = context.inventoryItems?.find(invItem => 
                invItem.id === item.itemId || invItem.name === item.itemId
              );
              
              if (inventoryItem) {
                const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
                const stockKey = camelName.replace(/Momo(s)?$/i, '');
                midMonthRecalibration[stockKey] = item.actualQuantity;
                console.log(`  📦 Mid-month stock override: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
              } else {
                midMonthRecalibration[item.itemId] = item.actualQuantity;
              }
            });
            console.log('   Mid-month recalibration stock:', midMonthRecalibration);
            console.log('   Opening balance (from previous month):', openingBalance);
          }
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
      
      // NEW: Store mid-month recalibration separately if it exists
      if (midMonthRecalibration) {
        // We'll use this to override the final stock calculation
        (window as any).__midMonthRecalibration = midMonthRecalibration;
        console.log('💾 Stored mid-month recalibration for stock override:', midMonthRecalibration);
      } else {
        delete (window as any).__midMonthRecalibration;
      }
      
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
        console.log(`  📦 Recalibration item mapping: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
      } else {
        // Fallback: use itemId as-is
        stock[item.itemId] = item.actualQuantity;
        console.log(`  ⚠️ Recalibration item not found in inventory: ${item.itemId}, using as-is`);
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
    console.log('   Current month:', currentMonth, '→ Previous month:', previousMonthStr);
    
    // Get production and deliveries for previous month
    const production = getMonthProduction(productionHouseUUID, previousMonthStr);
    const deliveries = getMonthDeliveries(productionHouseUUID, previousMonthStr);
    
    // Calculate closing stock (production - deliveries)
    const closingStock: any = {};
    ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'].forEach(type => {
      closingStock[type] = (production[type] || 0) - (deliveries[type] || 0);
    });
    
    console.log('  Previous month production:', production);
    console.log('  Previous month deliveries:', deliveries);
    console.log('  Calculated closing stock:', closingStock);
    
    return closingStock;
  }

  function getMonthProduction(phId: string | null, monthStr: string): any {
    if (!phId) {
      console.log('⚠️ getMonthProduction called with null phId');
      return {};
    }
    
    console.log(`🔍 Getting production for phId: ${phId}, month: ${monthStr}`);
    console.log(`   Total production records available: ${productionData.length}`);
    
    const filteredProduction = productionData.filter(p => {
      if (!p.date.startsWith(monthStr)) return false;
      
      const matchesStoreId = p.storeId === phId;
      const matchesProductionHouseId = p.productionHouseId === phId;
      
      let recordProductionHouseId = p.productionHouseId;
      if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
        // Use local stores state (loaded in useEffect) or fallback to context.stores
        const allStores = stores.length > 0 ? stores : (context.stores || []);
        const store = allStores.find(s => s.id === p.storeId);
        recordProductionHouseId = store?.productionHouseId || null;
      }
      
      const resolvedPhId = recordProductionHouseId || p.storeId;
      return matchesStoreId || matchesProductionHouseId || resolvedPhId === phId;
    });
    
    console.log(`   Filtered production records: ${filteredProduction.length}`);
    
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
    console.log(`   Total production requests available: ${context.productionRequests?.length || 0}`);
    
    // Resolve UUID if needed
    // Use local stores state (loaded in useEffect) or fallback to context.stores
    const allStores = stores.length > 0 ? stores : (context.stores || []);
    let productionHouseUUID = phId;
    if (phId && phId.startsWith('STORE-')) {
      const userStore = allStores.find(s => s.id === phId);
      if (userStore?.productionHouseId) {
        productionHouseUUID = userStore.productionHouseId;
        console.log(`   Resolved UUID: ${productionHouseUUID}`);
      }
    }
    
    const fulfilledRequests = (context.productionRequests || []).filter(req => {
      if (req.status !== 'delivered') return false;
      
      const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
      if (!requestDate || !requestDate.startsWith(monthStr)) return false;
      
      const requestingStore = allStores.find(s => s.id === req.storeId);
      return requestingStore?.productionHouseId === productionHouseUUID;
    });
    
    console.log(`   Filtered delivered requests: ${fulfilledRequests.length}`);
    
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
    logger.debugAnalytics('  - Total production records:', productionData.length);
    logger.debugAnalytics('  - Production data records:', productionData.map(p => ({
      id: p.id,
      date: p.date,
      storeId: p.storeId,
      productionHouseId: p.productionHouseId,
      approvalStatus: p.approvalStatus,
      chickenMomos: p.chickenMomos?.final || 0,
      totalProduction: (p.chickenMomos?.final || 0) + (p.vegMomos?.final || 0) + (p.chickenCheeseMomos?.final || 0) + (p.cheeseCornMomos?.final || 0) + (p.paneerMomos?.final || 0) + (p.vegKurkureMomos?.final || 0) + (p.chickenKurkureMomos?.final || 0)
    })));
    logger.debugAnalytics('  - Selected production house ID:', selectedProductionHouseId);
    logger.debugAnalytics('  - Analytics mode:', analyticsMode);
    logger.debugAnalytics('  - User storeId:', context.user?.storeId);
    logger.debugAnalytics('  - User designation:', context.user?.designation);
    logger.debugAnalytics('  - Is Production Incharge:', isProductionIncharge);
    logger.debugAnalytics('  - Available production houses:', context.productionHouses.map(h => ({ id: h.id, name: h.name })));
    logger.debugAnalytics('  - Available stores:', context.stores?.map(s => ({ id: s.id, name: s.name, productionHouseId: s.productionHouseId })));
    logger.debugAnalytics('  - Production Incharge Specific:');
    logger.debugAnalytics('     - User storeId (should be production house ID):', context.user?.storeId);
    logger.debugAnalytics('     - Does user storeId match any production house?', context.productionHouses.find(ph => ph.id === context.user?.storeId));
    logger.debugAnalytics('     - Production data storeIds:', [...new Set(productionData.map(p => p.storeId))]);
    logger.debugAnalytics('     - Production data productionHouseIds:', [...new Set(productionData.map(p => p.productionHouseId))]);
    logger.debugAnalytics('     - Stores that map to user production house:', context.stores?.filter(s => s.productionHouseId === context.user?.storeId).map(s => ({ id: s.id, name: s.name })));
  }

  // Helper function to filter data by time period
  const filterByTimeRange = (data: any[], dateField: string = 'date') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return data.filter(item => {
      const itemDate = new Date(item[dateField]);
      const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      
      switch (timeFilter) {
        case 'daily':
          // Show last 10 days to support daily trend charts
          const tenDaysAgo = new Date(today);
          tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
          return itemDateOnly >= tenDaysAgo && itemDateOnly <= today;
          
        case 'weekly':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return itemDateOnly >= weekAgo && itemDateOnly <= today;
          
        case 'monthly':
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return itemDateOnly >= monthAgo && itemDateOnly <= today;
          
        case 'yearly':
          const yearAgo = new Date(today);
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          return itemDateOnly >= yearAgo && itemDateOnly <= today;
          
        case 'custom':
          const fromDate = new Date(dateRange.from);
          const toDate = new Date(dateRange.to);
          return itemDateOnly >= fromDate && itemDateOnly <= toDate;
          
        default:
          return true;
      }
    });
  };

  // Apply time filtering first
  const timeFilteredSalesData = filterByTimeRange(salesData);
  const timeFilteredInventoryData = filterByTimeRange(inventoryData);
  const timeFilteredOverheadData = filterByTimeRange(overheadData);
  const timeFilteredFixedCostsData = filterByTimeRange(fixedCostsData);
  const timeFilteredPayoutsData = filterByTimeRange(payoutsData, 'payoutDate');

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
      console.log(`  - Date: ${sale.date}, StoreId: ${sale.storeId}, Revenue: ${(sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0)}`);
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
      console.log(`  - Date: ${item.date}, StoreId: ${item.storeId}, Cost: ${item.totalCost || 0}`);
    });
    
    if (!effectiveStoreId) {
      console.log('No store filter - returning all', timeFilteredInventoryData.length, 'inventory items');
      return timeFilteredInventoryData;
    }
    
    // IMPORTANT: Only include inventory with exact storeId match
    const filtered = timeFilteredInventoryData.filter(item => 
      item.storeId === effectiveStoreId
    );
    console.log('After store filtering (exact match only):', filtered.length, 'inventory items');
    console.log('🔍 === END INVENTORY DEBUG ===');
    
    return filtered;
  }, [timeFilteredInventoryData, effectiveStoreId]);

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
      console.log(`  - Date: ${item.date}, StoreId: ${item.storeId}, Amount: ${item.amount || 0}`);
    });
    
    if (!effectiveStoreId) {
      console.log('No store filter - returning all', timeFilteredOverheadData.length, 'overhead items');
      return timeFilteredOverheadData;
    }
    
    // IMPORTANT: Only include overhead with exact storeId match
    const filtered = timeFilteredOverheadData.filter(item => 
      item.storeId === effectiveStoreId
    );
    console.log('After store filtering (exact match only):', filtered.length, 'overhead items');
    console.log('Filtered overhead storeIds:', filtered.map(o => ({ date: o.date, storeId: o.storeId, amount: o.amount })));
    console.log('🔍 === END OVERHEAD DEBUG ===');
    
    return filtered;
  }, [timeFilteredOverheadData, effectiveStoreId]);

  const filteredFixedCostsData = useMemo(() => {
    if (!effectiveStoreId) return timeFilteredFixedCostsData;
    // IMPORTANT: Only include exact storeId matches
    return timeFilteredFixedCostsData.filter(item => 
      item.storeId === effectiveStoreId
    );
  }, [timeFilteredFixedCostsData, effectiveStoreId]);

  const filteredEmployeesData = useMemo(() => {
    if (!effectiveStoreId) return employeesData;
    // IMPORTANT: Only include exact storeId matches
    return employeesData.filter(emp => 
      emp.storeId === effectiveStoreId
    );
  }, [employeesData, effectiveStoreId]);

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
        const [payouts, employees] = await Promise.all([
          api.getPayouts(),
          api.getEmployees()
        ]);
        setPayoutsData(payouts || []);
        setEmployeesData(employees || []);
      } catch (error) {
        console.error('Error loading payouts and employees:', error);
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

  // Load leave data for today
  useEffect(() => {
    const loadTodayLeaves = async () => {
      if (!context.user) return;
      
      try {
        setLoadingLeaves(true);
        
        // Get fresh access token
        const accessToken = await getFreshAccessToken();
        if (!accessToken) {
          console.error('No valid access token available');
          return;
        }
        
        // Get today's date in IST (UTC+5:30)
        const today = getTodayIST();
        
        if (context.user.role === 'cluster_head') {
          // Cluster head: get all leaves
          const allLeaves = await api.getAllLeaves(accessToken);
          const todayApprovedLeaves = allLeaves.filter(
            (leave: api.LeaveApplication) => leave.leaveDate === today && leave.status === 'approved'
          );
          
          // Get all employees to enrich leave data
          const employees = await api.getAllEmployees(accessToken);
          const employeeMap = new Map(employees.map(emp => [emp.employeeId, emp]));
          
          // Filter by store if selected (include null/undefined storeIds for backward compatibility)
          if (context.user.storeId) {
            const storeEmployeeIds = employees
              .filter(emp => 
                emp.storeId === context.user.storeId || 
                emp.storeId === null || 
                emp.storeId === undefined
              )
              .map(emp => emp.employeeId);
            
            const storeLeaves = todayApprovedLeaves.filter(
              leave => storeEmployeeIds.includes(leave.employeeId)
            );
            
            // Enrich leave data with employee info
            const enrichedLeaves = storeLeaves.map(leave => ({
              ...leave,
              employeeName: employeeMap.get(leave.employeeId)?.name || 'Unknown',
              storeId: employeeMap.get(leave.employeeId)?.storeId || 'N/A',
              storeName: employeeMap.get(leave.employeeId)?.storeName || 'N/A'
            }));
            
            setTodayLeaveCount(storeLeaves.length);
            setTodayLeaveDetails(enrichedLeaves);
          } else {
            // Enrich all leaves with employee info
            const enrichedLeaves = todayApprovedLeaves.map(leave => ({
              ...leave,
              employeeName: employeeMap.get(leave.employeeId)?.name || 'Unknown',
              storeId: employeeMap.get(leave.employeeId)?.storeId || 'N/A',
              storeName: employeeMap.get(leave.employeeId)?.storeName || 'N/A'
            }));
            
            setTodayLeaveCount(todayApprovedLeaves.length);
            setTodayLeaveDetails(enrichedLeaves);
          }
        } else if (context.user.role === 'manager' && context.user.employeeId) {
          // Manager: get leaves for their employees
          const employees = await api.getEmployeesByManager(context.user.employeeId, accessToken);
          const employeeMap = new Map(employees.map(emp => [emp.employeeId, emp]));
          let managerLeaveDetails: any[] = [];
          
          for (const emp of employees) {
            const leaves = await api.getLeaves(emp.employeeId, accessToken);
            const todayLeaves = leaves.filter(
              (leave: api.LeaveApplication) => leave.leaveDate === today && leave.status === 'approved'
            );
            
            // Enrich with employee info
            const enrichedLeaves = todayLeaves.map(leave => ({
              ...leave,
              employeeName: employeeMap.get(leave.employeeId)?.name || 'Unknown',
              storeId: employeeMap.get(leave.employeeId)?.storeId || 'N/A',
              storeName: employeeMap.get(leave.employeeId)?.storeName || 'N/A'
            }));
            
            managerLeaveDetails.push(...enrichedLeaves);
          }
          
          setTodayLeaveCount(managerLeaveDetails.length);
          setTodayLeaveDetails(managerLeaveDetails);
        } else {
          setTodayLeaveCount(0);
          setTodayLeaveDetails([]);
        }
      } catch (error) {
        console.error('Error loading today\'s leaves:', error);
        setTodayLeaveCount(0);
      } finally {
        setLoadingLeaves(false);
      }
    };
    
    loadTodayLeaves();
  }, [context.user]);

  // Auto-switch to production-requests tab when notification is clicked
  useEffect(() => {
    console.log('📊 Analytics - highlightRequestId changed:', highlightRequestId);
    if (highlightRequestId) {
      console.log('📊 Analytics - Switching to production-requests tab');
      setActiveView('production-requests');
    }
  }, [highlightRequestId]);

  // Get period label for summary cards
  const getPeriodLabel = () => {
    switch (timeFilter) {
      case 'daily': return 'Last 10 days';
      case 'weekly': return 'Last 7 days';
      case 'monthly': return 'Last 30 days';
      case 'yearly': return 'Last 365 days';
      case 'custom': return `${dateRange.from} to ${dateRange.to}`;
      default: return 'Current period';
    }
  };

  // Calculate analytics metrics
  const calculateMetrics = () => {
    console.log('💰 === METRICS CALCULATION DEBUG ===');
    console.log('Time filter:', timeFilter);
    console.log('Filtered sales data count:', filteredSalesData.length);
    console.log('Filtered inventory data count:', filteredInventoryData.length);
    console.log('Filtered overhead data count:', filteredOverheadData.length);
    console.log('Filtered fixed costs data count:', filteredFixedCostsData.length);
    
    // Calculate revenue from sales
    const totalRevenue = filteredSalesData.reduce((sum, sale) => {
      return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
    }, 0);
    
    console.log('Total revenue calculated:', totalRevenue);

    const onlineRevenue = filteredSalesData.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
    const offlineRevenue = filteredSalesData.reduce((sum, sale) => {
      return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0);
    }, 0);

    // Calculate expenses from inventory
    const inventoryExpenses = filteredInventoryData.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    console.log('Inventory expenses:', inventoryExpenses);
    
    // Calculate overhead expenses
    const overheadExpenses = filteredOverheadData.reduce((sum, item) => sum + (item.amount || 0), 0);

    // Calculate fixed costs
    const electricityExpenses = filteredFixedCostsData
      .filter(fc => fc.category === 'electricity')
      .reduce((sum, fc) => sum + (fc.amount || 0), 0);
    
    const rentExpenses = filteredFixedCostsData
      .filter(fc => fc.category === 'rent')
      .reduce((sum, fc) => sum + (fc.amount || 0), 0);

    // Calculate contract worker expenses (from salesData.employeeSalary)
    // These are daily wages, so they should be filtered by time
    const contractWorkerExpenses = filteredSalesData.reduce((sum, sale) => sum + (sale.employeeSalary || 0), 0);

    // Calculate permanent employee expenses (from payoutsData)
    // IMPORTANT: Permanent employee salaries are MONTHLY expenses
    // They should ONLY appear when viewing "Monthly" or "Yearly" time periods
    // For daily/weekly, only contract workers appear
    let permanentEmployeeExpenses = 0;
    
    if (timeFilter === 'monthly' || timeFilter === 'yearly' || timeFilter === 'custom') {
      // For monthly/yearly/custom view: Use DATE-FILTERED payouts to respect the selected time range
      // Filter by store if needed
      let relevantPayouts = filteredPayoutsData;
      
      if (effectiveStoreId) {
        // Use filteredEmployeesData to include employees with null storeIds
        const storeEmployeeIds = filteredEmployeesData.map(emp => emp.id);
        relevantPayouts = relevantPayouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
      }
      
      permanentEmployeeExpenses = relevantPayouts.reduce((sum, payout) => {
        // Find the employee for this payout
        const employee = filteredEmployeesData.find(emp => emp.id === payout.employeeId);
        // Only include if employee is fulltime (permanent)
        if (employee && employee.type === 'fulltime') {
          return sum + (payout.amount || 0);
        }
        return sum;
      }, 0);
    }
    // For daily/weekly view, permanentEmployeeExpenses stays 0

    // Total salary expenses = contract workers + permanent employees
    const salaryExpenses = contractWorkerExpenses + permanentEmployeeExpenses;

    // Total fixed costs = electricity + rent + salaries
    const fixedCostsTotal = electricityExpenses + rentExpenses + salaryExpenses;

    const totalCosts = inventoryExpenses + overheadExpenses + fixedCostsTotal;
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

    console.log('Total expenses:', totalCosts);
    console.log('Net profit:', netProfit);
    console.log('💰 === END METRICS DEBUG ===');

    return {
      totalRevenue,
      onlineRevenue,
      offlineRevenue,
      totalExpenses: totalCosts,
      inventoryExpenses,
      overheadExpenses,
      fixedCostsTotal,
      electricityExpenses,
      rentExpenses,
      salaryExpenses,
      contractWorkerExpenses,
      permanentEmployeeExpenses,
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
    timeFilter
  ]);

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
    const chartData: any[] = [];
    
    if (timeFilter === 'daily') {
      // Show last 10 days
      for (let i = 9; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayLabel = date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        
        const daySales = filteredSalesData.filter(sale => sale.date === dateStr);
        const onlineRevenue = daySales.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
        const offlineRevenue = daySales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0), 0);
        
        chartData.push({
          period: dayLabel,
          online: onlineRevenue,
          offline: offlineRevenue,
          total: onlineRevenue + offlineRevenue
        });
      }
    } else if (timeFilter === 'weekly') {
      // Show last 10 weeks
      for (let i = 9; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        
        const startLabel = weekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        const endLabel = weekEnd.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        const weekLabel = `${startLabel} - ${endLabel}`;
        
        const weekSales = filteredSalesData.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate >= weekStart && saleDate <= weekEnd;
        });
        
        const onlineRevenue = weekSales.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
        const offlineRevenue = weekSales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0), 0);
        
        chartData.push({
          period: weekLabel,
          online: onlineRevenue,
          offline: offlineRevenue,
          total: onlineRevenue + offlineRevenue
        });
      }
    } else if (timeFilter === 'monthly') {
      // Show last 10 months
      for (let i = 9; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        const monthLabel = date.toLocaleDateString('default', { month: 'short', year: '2-digit' });
        const monthStr = date.toLocaleString('default', { month: 'short' });
        const yearStr = date.getFullYear().toString();
        
        const monthSales = filteredSalesData.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.toLocaleString('default', { month: 'short' }) === monthStr &&
                 saleDate.getFullYear().toString() === yearStr;
        });
        
        const onlineRevenue = monthSales.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
        const offlineRevenue = monthSales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0), 0);
        
        chartData.push({
          period: monthLabel,
          online: onlineRevenue,
          offline: offlineRevenue,
          total: onlineRevenue + offlineRevenue
        });
      }
    } else if (timeFilter === 'yearly') {
      // Show last 5 years
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        
        const yearSales = filteredSalesData.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getFullYear() === year;
        });
        
        const onlineRevenue = yearSales.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
        const offlineRevenue = yearSales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0), 0);
        
        chartData.push({
          period: year.toString(),
          online: onlineRevenue,
          offline: offlineRevenue,
          total: onlineRevenue + offlineRevenue
        });
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
      
      return Object.values(monthlyData);
    }
    
    return chartData;
  };

  const salesChartData = useMemo(() => prepareSalesChartData(), [
    filteredSalesData,
    timeFilter
  ]);

  // Prepare profit chart data with revenue, expenses, profit based on time filter
  const prepareProfitChartData = () => {
    const now = new Date();
    const chartData: any[] = [];
    
    if (timeFilter === 'daily') {
      // Show last 5 days
      for (let i = 4; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayLabel = date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        
        // Get sales for this day (use filtered data to respect store selection)
        const daySales = (filteredSalesData || []).filter(sale => sale.date === dateStr);
        const revenue = daySales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0), 0);
        
        // Get expenses for this day (inventory + overhead + contract workers)
        const dayInventory = (filteredInventoryData || []).filter(item => item.date === dateStr);
        const dayOverhead = (filteredOverheadData || []).filter(item => item.date === dateStr);
        const inventoryExp = dayInventory.reduce((sum, item) => sum + (item.totalCost || 0), 0);
        const overheadExp = dayOverhead.reduce((sum, item) => sum + (item.amount || 0), 0);
        const contractWorkerExp = daySales.reduce((sum, sale) => sum + (sale.employeeSalary || 0), 0);
        const expenses = inventoryExp + overheadExp + contractWorkerExp;
        
        chartData.push({
          period: dayLabel,
          revenue: revenue,
          expenses: expenses,
          profit: revenue - expenses
        });
      }
    } else if (timeFilter === 'weekly') {
      // Show last 5 weeks
      for (let i = 4; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        
        const startLabel = weekStart.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        const endLabel = weekEnd.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        const weekLabel = `${startLabel} - ${endLabel}`;
        
        // Get sales for this week (use filtered data to respect store selection)
        const weekSales = (filteredSalesData || []).filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate >= weekStart && saleDate <= weekEnd;
        });
        const revenue = weekSales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0), 0);
        
        // Get expenses for this week (use filtered data to respect store selection)
        const weekInventory = (filteredInventoryData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate >= weekStart && itemDate <= weekEnd;
        });
        const weekOverhead = (filteredOverheadData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate >= weekStart && itemDate <= weekEnd;
        });
        const inventoryExp = weekInventory.reduce((sum, item) => sum + (item.totalCost || 0), 0);
        const overheadExp = weekOverhead.reduce((sum, item) => sum + (item.amount || 0), 0);
        const contractWorkerExp = weekSales.reduce((sum, sale) => sum + (sale.employeeSalary || 0), 0);
        const expenses = inventoryExp + overheadExp + contractWorkerExp;
        
        chartData.push({
          period: weekLabel,
          revenue: revenue,
          expenses: expenses,
          profit: revenue - expenses
        });
      }
    } else if (timeFilter === 'monthly') {
      // Show last 5 months
      for (let i = 4; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        const monthLabel = date.toLocaleDateString('default', { month: 'short', year: '2-digit' });
        const monthNum = date.getMonth(); // 0-11
        const yearNum = date.getFullYear();
        
        // Get sales for this month (use filtered data to respect store selection)
        const monthSales = (filteredSalesData || []).filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getMonth() === monthNum && saleDate.getFullYear() === yearNum;
        });
        const revenue = monthSales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0), 0);
        
        // Get expenses for this month (use filtered data to respect store selection)
        const monthInventory = (filteredInventoryData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getMonth() === monthNum && itemDate.getFullYear() === yearNum;
        });
        const monthOverhead = (filteredOverheadData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getMonth() === monthNum && itemDate.getFullYear() === yearNum;
        });
        const monthFixedCosts = (filteredFixedCostsData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getMonth() === monthNum && itemDate.getFullYear() === yearNum;
        });
        
        const inventoryExp = monthInventory.reduce((sum, item) => sum + (item.totalCost || 0), 0);
        const overheadExp = monthOverhead.reduce((sum, item) => sum + (item.amount || 0), 0);
        const fixedCostsExp = monthFixedCosts.reduce((sum, item) => sum + (item.amount || 0), 0);
        const contractWorkerExp = monthSales.reduce((sum, sale) => sum + (sale.employeeSalary || 0), 0);
        
        // Calculate permanent employee monthly salary cost ONLY for payouts in this specific month
        let permanentEmployeeExp = 0;
        let monthPayouts = payoutsData.filter(payout => {
          const payoutDate = new Date(payout.month + '-01'); // Convert "YYYY-MM" to date
          return payoutDate.getMonth() === monthNum && payoutDate.getFullYear() === yearNum;
        });
        
        if (effectiveStoreId) {
          // Use filteredEmployeesData to include employees with null storeIds
          const storeEmployeeIds = filteredEmployeesData.map(emp => emp.id);
          monthPayouts = monthPayouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
        }
        
        permanentEmployeeExp = monthPayouts.reduce((sum, payout) => {
          const employee = filteredEmployeesData.find(emp => emp.id === payout.employeeId);
          if (employee && employee.type === 'fulltime') {
            return sum + (payout.amount || 0);
          }
          return sum;
        }, 0);
        
        const expenses = inventoryExp + overheadExp + fixedCostsExp + contractWorkerExp + permanentEmployeeExp;
        
        chartData.push({
          period: monthLabel,
          revenue: revenue,
          expenses: expenses,
          profit: revenue - expenses
        });
      }
    } else if (timeFilter === 'yearly') {
      // Show last 5 years
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        
        // Get sales for this year (use filtered data to respect store selection)
        const yearSales = (filteredSalesData || []).filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getFullYear() === year;
        });
        const revenue = yearSales.reduce((sum, sale) => sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0), 0);
        
        // Get expenses for this year (use filtered data to respect store selection)
        const yearInventory = (filteredInventoryData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getFullYear() === year;
        });
        const yearOverhead = (filteredOverheadData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getFullYear() === year;
        });
        const yearFixedCosts = (filteredFixedCostsData || []).filter(item => {
          const itemDate = new Date(item.date);
          return itemDate.getFullYear() === year;
        });
        
        const inventoryExp = yearInventory.reduce((sum, item) => sum + (item.totalCost || 0), 0);
        const overheadExp = yearOverhead.reduce((sum, item) => sum + (item.amount || 0), 0);
        const fixedCostsExp = yearFixedCosts.reduce((sum, item) => sum + (item.amount || 0), 0);
        const contractWorkerExp = yearSales.reduce((sum, sale) => sum + (sale.employeeSalary || 0), 0);
        
        // Calculate permanent employee annual salary cost (ALL payouts x 12 months)
        // This treats salaries as a recurring annual expense
        let permanentEmployeeExp = 0;
        let allPayouts = payoutsData;
        
        if (effectiveStoreId) {
          // Use filteredEmployeesData to include employees with null storeIds
          const storeEmployeeIds = filteredEmployeesData.map(emp => emp.id);
          allPayouts = allPayouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
        }
        
        const monthlyPermanentSalary = allPayouts.reduce((sum, payout) => {
          const employee = filteredEmployeesData.find(emp => emp.id === payout.employeeId);
          if (employee && employee.type === 'fulltime') {
            return sum + (payout.amount || 0);
          }
          return sum;
        }, 0);
        
        // Multiply by 12 to get annual cost
        permanentEmployeeExp = monthlyPermanentSalary * 12;
        
        const expenses = inventoryExp + overheadExp + fixedCostsExp + contractWorkerExp + permanentEmployeeExp;
        
        chartData.push({
          period: year.toString(),
          revenue: revenue,
          expenses: expenses,
          profit: revenue - expenses
        });
      }
    } else if (timeFilter === 'custom') {
      // For custom range, use the existing monthlyChartData
      return monthlyChartData;
    }
    
    return chartData;
  };

  const profitChartData = useMemo(() => prepareProfitChartData(), [
    filteredSalesData,
    filteredInventoryData,
    filteredOverheadData,
    timeFilter
  ]);

  // Prepare expense breakdown by category
  const prepareExpenseBreakdown = () => {
    const categoryExpenses: any = {};

    filteredInventoryData.forEach(item => {
      const category = item.category || 'Other';
      if (!categoryExpenses[category]) {
        categoryExpenses[category] = 0;
      }
      categoryExpenses[category] += (item.totalCost || 0);
    });

    // Add overhead expenses by category
    filteredOverheadData.forEach(item => {
      const category = item.category || 'Other';
      const displayName = OVERHEAD_CATEGORIES[category] || category;
      if (!categoryExpenses[displayName]) {
        categoryExpenses[displayName] = 0;
      }
      categoryExpenses[displayName] += (item.amount || 0);
    });

    // Add fixed costs by category
    filteredFixedCostsData.forEach(item => {
      const category = item.category || 'Other';
      const displayName = FIXED_COST_CATEGORIES[category] || category;
      if (!categoryExpenses[displayName]) {
        categoryExpenses[displayName] = 0;
      }
      categoryExpenses[displayName] += (item.amount || 0);
    });

    // Add salaries separately (contract + permanent)
    if (metrics.salaryExpenses > 0) {
      categoryExpenses['💰 Salaries'] = metrics.salaryExpenses;
    }

    const breakdown = Object.keys(categoryExpenses).map(category => {
      // Get display name for inventory categories
      const displayName = INVENTORY_CATEGORIES[category] || category;
      
      return {
        name: displayName,
        value: categoryExpenses[category],
        percentage: ((categoryExpenses[category] / metrics.totalExpenses) * 100).toFixed(1)
      };
    });

    return breakdown.sort((a, b) => b.value - a.value);
  };

  const expenseBreakdown = prepareExpenseBreakdown();

  const COLORS = ['#ec4899', '#a78bfa', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#fb923c', '#8b5cf6', '#10b981', '#f59e0b'];

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
  const realizedProfit = unrealizedProfit - totalCashDiscrepancy;

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
        {/* Header */}
        <div className="mb-4 sm:mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl text-gray-900 mb-1 sm:mb-2">Analytics Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-600">Track revenue, expenses, and profitability</p>
          </div>
          
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
                  if (!confirm('🔄 This will update all stock request IDs to include timestamps.\\n\\nThis enables proper tracking of when requests were created in the Data Capture view.\\n\\nThis is a ONE-TIME operation. Continue?')) {
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
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2 shadow-lg"
              title="Remove duplicate entries from database"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Clean Database</span>
              <span className="sm:hidden">Clean DB</span>
              </button>
            </div>
          )}
        </div>

        {/* Leave Alert Bar */}
        {!loadingLeaves && (context.user?.role === 'cluster_head' || context.user?.role === 'manager') && (
          <div 
            onClick={() => setShowLeaveModal(true)}
            className={`mb-4 sm:mb-6 rounded-lg shadow-sm border-2 p-4 transition-all cursor-pointer hover:shadow-md ${
              todayLeaveCount === 0
                ? 'bg-green-50 border-green-200 hover:bg-green-100'
                : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
            }`}
          >
            <div className="flex items-center gap-3">
              {todayLeaveCount === 0 ? (
                <>
                  <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-green-900">
                      <span className="text-green-600">✓</span> Everyone is working today
                    </p>
                    <p className="text-sm text-green-700 mt-0.5">
                      {context.user.storeId ? 'No employees on leave in this store' : 'No employees on leave across all stores'}
                    </p>
                  </div>
                  <div className="text-green-600 text-sm">Click to view</div>
                </>
              ) : (
                <>
                  <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                    <UserX className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-orange-900">
                      <span className="text-orange-700">{todayLeaveCount}</span> {todayLeaveCount === 1 ? 'person is' : 'people are'} on leave today
                    </p>
                    <p className="text-sm text-orange-700 mt-0.5">
                      {context.user.storeId ? 'In this store' : 'Across all stores'}
                    </p>
                  </div>
                  <div className="text-orange-600 text-sm">Click to view details</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Analytics Mode Selector - For Cluster Heads, Managers, Production Incharges, Store Incharges, and Audit Users */}
        {(isClusterHead || isManager || isProductionIncharge || isStoreIncharge || isAudit) && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl shadow-lg mb-6 p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-purple-900" style={{ fontSize: '16px', fontWeight: '700' }}>
              {isStoreIncharge ? 'Store Analytics Dashboard' : isAudit ? 'Audit Analytics Dashboard' : 'Analytics Dashboard'}
            </h3>
            {/* Only show mode selector if not Store Incharge (they only see Store Analytics) */}
            {!isStoreIncharge && (
            <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setAnalyticsMode('store')}
                className={`px-4 py-2 rounded-md transition-all duration-200 ${
                  analyticsMode === 'store'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Store Analytics</span>
                </div>
              </button>
              <button
                onClick={() => setAnalyticsMode('production')}
                className={`px-4 py-2 rounded-md transition-all duration-200 ${
                  analyticsMode === 'production'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Factory className="w-4 h-4" />
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Production Analytics</span>
                </div>
              </button>
            </div>
            )}
          </div>
          <p className="text-purple-700 text-sm">
            {analyticsMode === 'store' 
              ? 'Track revenue, expenses, and profitability across stores' 
              : 'Monitor production metrics, wastage, and SOP compliance'}
          </p>
        </div>
        )}

        {/* Local Store Selector - Only in Store Analytics Mode */}
        {analyticsMode === 'store' && (
          <>
            {(isClusterHead || isManager || isProductionIncharge || isAudit) ? (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg mb-6 p-4 border border-blue-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-blue-900" style={{ fontSize: '16px', fontWeight: '700' }}>
                      Store Selection
                    </h3>
                    <p className="text-blue-700 text-sm mt-1">
                      Select a store to view its analytics data
                    </p>
                  </div>
                  <select
                    value={localSelectedStoreId || ''}
                    onChange={(e) => setLocalSelectedStoreId(e.target.value || null)}
                    className="px-4 py-2 bg-white border-2 border-blue-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ fontSize: '14px', fontWeight: '600' }}
                  >
                    <option value="">All Stores</option>
                    {context.stores?.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} (ID: {store.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              // Info banner for employees showing their store
              context.user?.storeId && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg mb-6 p-4 border border-blue-200">
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
              )
            )}
          </>
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
            // Store Analytics Tabs
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
              <button
                onClick={() => setActiveView('profit')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'profit' 
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <TrendingUp className={`w-6 h-6 ${activeView === 'profit' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
                  <span className="font-semibold text-sm">Profit Analysis</span>
                </div>
                {activeView === 'profit' && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-emerald-500 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView('expense')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'expense' 
                    ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <DollarSign className={`w-6 h-6 ${activeView === 'expense' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
                  <span className="font-semibold text-sm">Expenses</span>
                </div>
                {activeView === 'expense' && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-rose-500 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView('sales')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'sales' 
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <ShoppingCart className={`w-6 h-6 ${activeView === 'sales' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
                  <span className="font-semibold text-sm">Sales</span>
                </div>
                {activeView === 'sales' && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView('datacapture')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'datacapture' 
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Package className={`w-6 h-6 ${activeView === 'datacapture' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
                  <span className="font-semibold text-sm">Data Capture</span>
                </div>
                {activeView === 'datacapture' && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-purple-500 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView('production-requests')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'production-requests' 
                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <ClipboardList className={`w-6 h-6 ${activeView === 'production-requests' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
                  <span className="font-semibold text-sm">Stock Requests</span>
                </div>
                {activeView === 'production-requests' && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full"></div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView('store-recalibration')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'store-recalibration' 
                    ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle className={`w-6 h-6 ${activeView === 'store-recalibration' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} />
                  <span className="font-semibold text-sm">Recalibration</span>
                </div>
                {activeView === 'store-recalibration' && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-teal-500 rounded-full"></div>
                )}
              </button>
            </div>
          ) : (
            // Production Analytics Tabs - Production and Recalibration
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveView('production')}
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'production' 
                    ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
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
                className={`group relative px-4 py-4 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  activeView === 'recalibration-reports' 
                    ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-lg shadow-teal-500/50' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md'
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
            </div>
          )}
        </div>

        {/* Profit Analysis View */}
        {activeView === 'profit' && (
          <div>
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div>
                  <h2 className="text-lg sm:text-xl text-gray-900 mb-1">Profit Analysis</h2>
                  <p className="text-xs sm:text-sm text-gray-600">Revenue, expenses, and profit breakdown</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  {/* Time Filter */}
                  <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-2 sm:pb-0">
                    {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTimeFilter(filter as TimeFilter)}
                        className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap ${
                          timeFilter === filter
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                  
                  {/* Export Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const storeName = context.stores?.find(s => s.id === selectedStoreId)?.name || 'All_Stores';
                        exportUtils.exportAnalyticsReport({
                          salesData: filteredSalesData,
                          inventoryData: filteredInventoryData,
                          overheadData: filteredOverheadData,
                          metrics,
                          storeName,
                          dateRange: timeFilter === 'custom' ? dateRange : undefined
                        });
                        toast.success('Analytics report exported!');
                      }}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5 text-xs sm:text-sm whitespace-nowrap"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">Export</span>
                      <span className="sm:hidden">JSON</span>
                    </button>
                    <button
                      onClick={() => {
                        const storeName = context.stores?.find(s => s.id === selectedStoreId)?.name || 'All_Stores';
                        exportUtils.exportAllData({
                          salesData: filteredSalesData,
                          inventoryData: filteredInventoryData,
                          overheadData: filteredOverheadData,
                          storeName
                        });
                        toast.success('Data exported as CSV files!');
                      }}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-xs sm:text-sm whitespace-nowrap"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="hidden sm:inline">CSV</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Date Range */}
              {timeFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6 bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <label className="text-xs sm:text-sm text-gray-600">From:</label>
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                      className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs sm:text-sm text-gray-600">To:</label>
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                      className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="bg-blue-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Revenue</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.totalRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{getPeriodLabel()}</div>
                </div>

                <div className="bg-red-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Expenses</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.totalExpenses.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{getPeriodLabel()}</div>
                </div>

                <div className="bg-green-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Net Profit</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{realizedProfit.toLocaleString()}</div>
                  {metrics.totalRevenue > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <TrendingUp className="w-3 h-3" />
                      Comparison available after multiple periods
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">No data yet</div>
                  )}
                </div>

                <div className="bg-yellow-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Profit Margin</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">{metrics.profitMargin.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">Of total revenue</div>
                </div>
              </div>

              {/* Profit Breakdown - Realized vs Unrealized */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 border-2 border-indigo-200">
                <h3 className="text-base sm:text-lg text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  Profit Breakdown
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Unrealized Profit */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-xs sm:text-sm text-gray-600 mb-2">Unrealized Profit</div>
                    <div className="text-xl sm:text-2xl text-indigo-600 mb-2">₹{unrealizedProfit.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Before cash discrepancies</div>
                  </div>
                  
                  {/* Cash Discrepancy */}
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-xs sm:text-sm text-gray-600 mb-2">Cash Discrepancy (Loss)</div>
                    <div className="text-xl sm:text-2xl text-red-600 mb-2">-₹{totalCashDiscrepancy.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Approved losses</div>
                  </div>
                  
                  {/* Realized Profit */}
                  <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-green-300">
                    <div className="text-xs sm:text-sm text-gray-600 mb-2 flex items-center gap-1">
                      Realized Profit
                      <span className="text-xs text-green-600">(Actual)</span>
                    </div>
                    <div className="text-xl sm:text-2xl text-green-600 mb-2">₹{realizedProfit.toLocaleString()}</div>
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
                        <strong>Impact:</strong> Cash discrepancies represent actual cash shortages that have been approved by management and reduce the realized profit by ₹{totalCashDiscrepancy.toLocaleString()}.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bar Chart */}
              <div className="mb-6 sm:mb-8 overflow-x-auto">
                <h3 className="text-base sm:text-lg text-gray-900 mb-4">
                  Profit Trend - {timeFilter === 'daily' ? 'Last 5 Days' : timeFilter === 'weekly' ? 'Last 5 Weeks' : timeFilter === 'monthly' ? 'Last 5 Months' : timeFilter === 'yearly' ? 'Last 5 Years' : 'Custom Range'}
                </h3>
                <div className="min-w-[300px]">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={profitChartData} barGap={8} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="period" stroke="#666" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="revenue" fill="#a5b4fc" name="Revenue" radius={[8, 8, 0, 0]} maxBarSize={60} />
                      <Bar dataKey="expenses" fill="#fca5a5" name="Expenses" radius={[8, 8, 0, 0]} maxBarSize={60} />
                      <Bar dataKey="profit" fill="#86efac" name="Profit" radius={[8, 8, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue Breakdown and Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    <h3 className="text-base sm:text-lg text-gray-900">Revenue Breakdown</h3>
                  </div>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex justify-between items-center bg-green-50 p-3 sm:p-4 rounded-lg">
                      <div>
                        <div className="text-xs sm:text-sm text-gray-600">Online Sales</div>
                        <div className="text-lg sm:text-xl text-gray-900">₹{metrics.onlineRevenue.toLocaleString()}</div>
                      </div>
                      <div className="text-xs sm:text-sm text-green-600">
                        {((metrics.onlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-blue-50 p-3 sm:p-4 rounded-lg">
                      <div>
                        <div className="text-xs sm:text-sm text-gray-600">Offline Sales</div>
                        <div className="text-lg sm:text-xl text-gray-900">₹{metrics.offlineRevenue.toLocaleString()}</div>
                      </div>
                      <div className="text-xs sm:text-sm text-blue-600">
                        {((metrics.offlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                    <h3 className="text-base sm:text-lg text-gray-900">Key Metrics</h3>
                  </div>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="bg-purple-50 p-3 sm:p-4 rounded-lg">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Cost-to-Revenue Ratio</div>
                      <div className="text-lg sm:text-xl text-gray-900 mb-1">
                        {metrics.totalRevenue > 0 
                          ? `${((metrics.totalExpenses / metrics.totalRevenue) * 100).toFixed(1)}%`
                          : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-600">
                        {metrics.totalRevenue > 0 && (metrics.totalExpenses / metrics.totalRevenue) < 0.7
                          ? '✓ Healthy ratio'
                          : metrics.totalRevenue > 0 
                          ? '⚠️ High expense ratio'
                          : 'No sales yet'}
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Profit per ₹100 Revenue</div>
                      <div className="text-lg sm:text-xl text-gray-900 mb-1">
                        {metrics.totalRevenue > 0 
                          ? `₹${((metrics.netProfit / metrics.totalRevenue) * 100).toFixed(1)}`
                          : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-600">
                        {metrics.totalRevenue > 0 && metrics.profitMargin > 30
                          ? '🎯 Excellent margins'
                          : metrics.totalRevenue > 0 && metrics.profitMargin > 15
                          ? '✓ Good margins'
                          : metrics.totalRevenue > 0 && metrics.profitMargin > 0
                          ? '⚠️ Thin margins'
                          : metrics.totalRevenue > 0
                          ? '❌ Operating at loss'
                          : 'No sales yet'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Expense Breakdown View */}
        {activeView === 'expense' && (
          <div>
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div>
                  <h2 className="text-lg sm:text-xl text-gray-900 mb-1">Expense Breakdown</h2>
                  <p className="text-xs sm:text-sm text-gray-600">Detailed analysis of all expenses by category</p>
                </div>

                {/* Time Filter */}
                <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-2 sm:pb-0">
                  {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter as TimeFilter)}
                      className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap ${
                        timeFilter === filter
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              {timeFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6 bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <label className="text-xs sm:text-sm text-gray-600">From:</label>
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                      className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs sm:text-sm text-gray-600">To:</label>
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                      className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Total Expense Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="bg-gradient-to-br from-red-100 to-red-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Expenses</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">₹{metrics.totalExpenses.toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-pink-100 to-pink-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Inventory Costs</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">₹{metrics.inventoryExpenses.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{((metrics.inventoryExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
                </div>
                <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Salary Costs</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">₹{metrics.salaryExpenses.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{((metrics.salaryExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
                </div>
              </div>

              {/* Pie Chart */}
              <div className="mb-6 sm:mb-8">
                <h3 className="text-base sm:text-lg text-gray-900 mb-4">Expense Distribution</h3>
                <div className="flex flex-col lg:flex-row gap-6 items-center">
                  <div className="w-full lg:w-1/2 relative">
                    {/* Add shadow and background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl blur-xl opacity-50"></div>
                    <div className="relative bg-white rounded-2xl p-6 shadow-lg">
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <defs>
                            {/* Add gradient definitions for each color */}
                            {COLORS.map((color, index) => (
                              <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                              </linearGradient>
                            ))}
                          </defs>
                          <Pie
                            data={expenseBreakdown}
                            cx="50%"
                            cy="50%"
                            labelLine={{
                              stroke: '#666',
                              strokeWidth: 1,
                              strokeDasharray: '3 3'
                            }}
                            label={({ percentage }) => `${percentage}%`}
                            outerRadius={110}
                            innerRadius={40}
                            fill="#8884d8"
                            dataKey="value"
                            paddingAngle={2}
                            animationBegin={0}
                            animationDuration={800}
                            animationEasing="ease-out"
                          >
                            {expenseBreakdown.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={`url(#gradient-${index % COLORS.length})`}
                                stroke="#fff"
                                strokeWidth={3}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="w-full lg:w-1/2 space-y-3">
                    {expenseBreakdown.map((item, index) => (
                      <div 
                        key={item.name} 
                        className="group relative border border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-gray-300 transition-all duration-300 cursor-pointer bg-white overflow-hidden"
                      >
                        {/* Animated background gradient on hover */}
                        <div 
                          className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300"
                          style={{ 
                            background: `linear-gradient(135deg, ${COLORS[index % COLORS.length]}40, ${COLORS[index % COLORS.length]}10)` 
                          }}
                        ></div>
                        
                        <div className="relative">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-5 h-5 rounded-full shadow-md group-hover:scale-110 transition-transform duration-300" 
                                style={{ 
                                  background: `linear-gradient(135deg, ${COLORS[index % COLORS.length]}, ${COLORS[(index + 1) % COLORS.length]})` 
                                }}
                              />
                              <span className="text-sm font-medium text-gray-900">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                                {item.percentage}%
                              </span>
                            </div>
                          </div>
                          <div className="text-xl font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                            ₹{item.value.toLocaleString()}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{ 
                                width: `${item.percentage}%`,
                                background: `linear-gradient(90deg, ${COLORS[index % COLORS.length]}, ${COLORS[(index + 1) % COLORS.length]})`
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg text-gray-900 mb-4">Salary Breakdown</h3>
                  
                  {/* Info Note for Monthly/Yearly/Custom views */}
                  {(timeFilter === 'monthly' || timeFilter === 'yearly' || timeFilter === 'custom') && metrics.permanentEmployeeExpenses > 0 && (
                    <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-800">
                          <strong>Note:</strong> Permanent employee salaries (₹{metrics.permanentEmployeeExpenses.toLocaleString()}) are monthly payouts and included in this view. Contract worker wages are date-filtered.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-600 mb-1">Contract Workers</div>
                      <div className="text-xl text-gray-900">₹{metrics.contractWorkerExpenses.toLocaleString()}</div>
                      <div className="text-xs text-gray-600 mt-1">Daily wages from sales data</div>
                    </div>
                    <div className="bg-pink-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-600 mb-1">Permanent Employees</div>
                      <div className="text-xl text-gray-900">₹{metrics.permanentEmployeeExpenses.toLocaleString()}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {(timeFilter === 'monthly' || timeFilter === 'yearly' || timeFilter === 'custom') 
                          ? 'Total monthly salary payouts (all periods)' 
                          : 'Only shown in monthly/yearly views'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg text-gray-900 mb-4">Overhead Costs</h3>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-xs text-gray-600 mb-1">Total Overheads</div>
                    <div className="text-xl text-gray-900">₹{metrics.overheadExpenses.toLocaleString()}</div>
                    <div className="text-xs text-gray-600 mt-1">{((metrics.overheadExpenses / metrics.totalExpenses) * 100).toFixed(1)}% of total expenses</div>
                    <div className="text-xs text-gray-500 mt-2">Fuel, travel, marketing, and other variable costs</div>
                  </div>
                </div>
              </div>

              {/* Fixed Costs Breakdown with Bar Chart */}
              <div className="mt-6 sm:mt-8 border border-gray-200 rounded-lg p-4 sm:p-6">
                <h3 className="text-base sm:text-lg text-gray-900 mb-4">Fixed Costs Breakdown</h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-4">Monthly fixed expenses breakdown</p>
                
                {/* Fixed Costs Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                  <div className="bg-gradient-to-br from-green-100 to-green-200 rounded-lg p-4">
                    <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Fixed Costs</div>
                    <div className="text-xl sm:text-2xl text-gray-900">₹{metrics.fixedCostsTotal.toLocaleString()}</div>
                    <div className="text-xs text-gray-600">{((metrics.fixedCostsTotal / metrics.totalExpenses) * 100).toFixed(1)}% of total</div>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-lg p-4">
                    <div className="text-xs sm:text-sm text-gray-700 mb-1">⚡ Electricity</div>
                    <div className="text-xl sm:text-2xl text-gray-900">₹{metrics.electricityExpenses.toLocaleString()}</div>
                    <div className="text-xs text-gray-600">{metrics.fixedCostsTotal > 0 ? ((metrics.electricityExpenses / metrics.fixedCostsTotal) * 100).toFixed(1) : 0}% of fixed</div>
                  </div>
                  <div className="bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg p-4">
                    <div className="text-xs sm:text-sm text-gray-700 mb-1">🏠 Rent</div>
                    <div className="text-xl sm:text-2xl text-gray-900">₹{metrics.rentExpenses.toLocaleString()}</div>
                    <div className="text-xs text-gray-600">{metrics.fixedCostsTotal > 0 ? ((metrics.rentExpenses / metrics.fixedCostsTotal) * 100).toFixed(1) : 0}% of fixed</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg p-4">
                    <div className="text-xs sm:text-sm text-gray-700 mb-1">💰 Salaries</div>
                    <div className="text-xl sm:text-2xl text-gray-900">₹{metrics.salaryExpenses.toLocaleString()}</div>
                    <div className="text-xs text-gray-600">{metrics.fixedCostsTotal > 0 ? ((metrics.salaryExpenses / metrics.fixedCostsTotal) * 100).toFixed(1) : 0}% of fixed</div>
                  </div>
                </div>

                {/* Bar Chart for Fixed Costs */}
                <div className="overflow-x-auto">
                  <div className="min-w-[300px]">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart 
                        data={[
                          { name: '⚡ Electricity', amount: metrics.electricityExpenses, fill: '#fbbf24' },
                          { name: '🏠 Rent', amount: metrics.rentExpenses, fill: '#fb923c' },
                          { name: '💰 Salaries', amount: metrics.salaryExpenses, fill: '#a78bfa' }
                        ]}
                        barCategoryGap="30%"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" stroke="#666" tick={{ fontSize: 12 }} />
                        <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="amount" name="Amount" radius={[8, 8, 0, 0]} maxBarSize={80}>
                          {[
                            { name: '⚡ Electricity', amount: metrics.electricityExpenses, fill: '#fbbf24' },
                            { name: '🏠 Rent', amount: metrics.rentExpenses, fill: '#fb923c' },
                            { name: '💰 Salaries', amount: metrics.salaryExpenses, fill: '#a78bfa' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
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
                    <span className="font-semibold">Category Sales</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Revenue Tracking Sub-view */}
            {salesSubView === 'revenue' && (
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6 mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div>
                  <h2 className="text-lg sm:text-xl text-gray-900 mb-1">Revenue Analytics</h2>
                  <p className="text-xs sm:text-sm text-gray-600">Track daily revenue from Paytm, Cash, and Online sales</p>
                </div>

                {/* Time Filter */}
                <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-2 sm:pb-0">
                  {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter as TimeFilter)}
                      className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap ${
                        timeFilter === filter
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              {timeFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6 bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <label className="text-xs sm:text-sm text-gray-600">From:</label>
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                      className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs sm:text-sm text-gray-600">To:</label>
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                      className="flex-1 px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Sales Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="bg-gradient-to-br from-green-100 to-green-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Sales</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">₹{metrics.totalRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{getPeriodLabel()}</div>
                </div>
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Online Sales</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">₹{metrics.onlineRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{((metrics.onlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}% of total</div>
                </div>
                <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Offline Sales</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">₹{metrics.offlineRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{((metrics.offlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}% of total</div>
                </div>
                <div className="bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-lg p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Transactions</div>
                  <div className="text-2xl sm:text-3xl text-gray-900">{filteredSalesData.length}</div>
                  <div className="text-xs text-gray-600">Sales records</div>
                </div>
              </div>

              {/* Sales Trend Chart */}
              <div className="mb-6 sm:mb-8">
                <h3 className="text-base sm:text-lg text-gray-900 mb-4">
                  Sales Trend - {timeFilter === 'daily' ? 'Last 10 Days' : timeFilter === 'weekly' ? 'Last 10 Weeks' : timeFilter === 'monthly' ? 'Last 10 Months' : timeFilter === 'yearly' ? 'Last 5 Years' : 'Custom Range'}
                </h3>
                <div className="overflow-x-auto">
                  <div className="min-w-[300px]">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={salesChartData} barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="period" stroke="#666" tick={{ fontSize: 12 }} />
                        <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="online" stackId="a" fill="#60a5fa" name="Online Sales" radius={[0, 0, 0, 0]} maxBarSize={80} />
                        <Bar dataKey="offline" stackId="a" fill="#a78bfa" name="Offline Sales" radius={[8, 8, 0, 0]} maxBarSize={80} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Sales Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ShoppingCart className="w-5 h-5 text-green-600" />
                    <h3 className="text-base sm:text-lg text-gray-900">Payment Methods</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">Online Payments</span>
                        <span className="text-sm text-green-600">{((metrics.onlineRevenue / metrics.totalRevenue) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-xl text-gray-900">₹{metrics.onlineRevenue.toLocaleString()}</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-600">Cash & Paytm</span>
                        <span className="text-sm text-blue-600">{((metrics.offlineRevenue / metrics.totalRevenue) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-xl text-gray-900">₹{metrics.offlineRevenue.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <h3 className="text-base sm:text-lg text-gray-900">Performance Metrics</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-600 mb-1">Average Transaction</div>
                      <div className="text-xl text-gray-900">
                        ₹{filteredSalesData.length > 0 ? (metrics.totalRevenue / filteredSalesData.length).toFixed(0) : 0}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">Per sale</div>
                    </div>
                    <div className="bg-pink-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-600 mb-1">Profit per Sale</div>
                      <div className="text-xl text-gray-900">
                        ₹{filteredSalesData.length > 0 ? (metrics.netProfit / filteredSalesData.length).toFixed(0) : 0}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">Average margin</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Category Sales Sub-view */}
            {salesSubView === 'category' && (
              <SalesDataComponent context={context} selectedStoreId={selectedStoreId} />
            )}
          </div>
        )}

        {/* Data Capture View */}
        {activeView === 'datacapture' && (
          <div>
            <DataCapture context={context} selectedStoreId={selectedStoreId} />
          </div>
        )}

        {/* Production Analytics View */}
        {activeView === 'production' && (
          <div>
            {/* Date Range Selector for Production Data */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg mb-6 p-4 border border-blue-200">
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
                      { value: 'week' as DateRangeType, label: 'This Week' },
                      { value: 'month' as DateRangeType, label: 'This Month' },
                      { value: 'year' as DateRangeType, label: 'This Year' },
                      { value: 'custom' as DateRangeType, label: 'Custom Range' },
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => setProductionDateRange(option.value)}
                        className={`px-4 py-2 rounded-lg text-sm border-2 transition-all ${
                          productionDateRange === option.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-blue-300 hover:border-blue-500'
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {(() => {
                // Use consistent production house filtering logic
                const filterById = selectedProductionHouseId;  // Always use production house selector in production analytics
                
                console.log('🏭 Production Summary Cards Filter Debug:');
                console.log('  - analyticsMode:', analyticsMode);
                console.log('  - selectedProductionHouseId:', selectedProductionHouseId);
                console.log('  - effectiveStoreId:', effectiveStoreId);
                console.log('  - filterById:', filterById);
                console.log('  - Total production records:', productionData.length);
                
                // Find the selected production house by its id
                const selectedProductionHouse = filterById 
                  ? context.productionHouses?.find(ph => ph.id === filterById)
                  : null;
                
                console.log('  - Selected production house object:', selectedProductionHouse);
                
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
                    console.log('    🔎 Production Summary - Store lookup:', {
                      pStoreId: p.storeId,
                      localStoresCount: stores.length,
                      contextStoresCount: context.stores?.length || 0,
                      allStoresCount: allStores.length,
                      foundStore: store ? { id: store.id, name: store.name, productionHouseId: store.productionHouseId } : null
                    });
                    recordProductionHouseId = store?.productionHouseId || null;
                  }
                  
                  const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
                  
                  console.log('  🔍 Checking record:', {
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
                
                console.log('  - Filtered production records:', filteredProduction.length);

                const totalProduction = filteredProduction.reduce((sum, p) => {
                  return sum + 
                    (p.chickenMomos?.final || 0) + 
                    (p.chickenCheeseMomos?.final || 0) + 
                    (p.vegMomos?.final || 0) + 
                    (p.cheeseCornMomos?.final || 0) + 
                    (p.paneerMomos?.final || 0) + 
                    (p.vegKurkureMomos?.final || 0) + 
                    (p.chickenKurkureMomos?.final || 0);
                }, 0);

                const totalWastage = filteredProduction.reduce((sum, p) => {
                  return sum + 
                    (p.wastage?.dough || 0) + 
                    (p.wastage?.stuffing || 0) + 
                    (p.wastage?.batter || 0) + 
                    (p.wastage?.coating || 0);
                }, 0);

                const approvedCount = filteredProduction.filter(p => p.approvalStatus === 'approved').length;
                const pendingCount = filteredProduction.filter(p => p.approvalStatus === 'pending').length;

                return (
                  <>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-lg p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Factory className="w-6 h-6 text-orange-600" />
                        <p className="text-sm text-gray-600">Total Production</p>
                      </div>
                      <p className="text-3xl text-gray-900">{totalProduction.toLocaleString()}</p>
                      <p className="text-xs text-gray-600 mt-1">pieces</p>
                    </div>

                    <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-lg p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Trash2 className="w-6 h-6 text-red-600" />
                        <p className="text-sm text-gray-600">Total Wastage</p>
                      </div>
                      <p className="text-3xl text-gray-900">{totalWastage.toFixed(2)}</p>
                      <p className="text-xs text-gray-600 mt-1">kg</p>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-lg p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <ClipboardCheck className="w-6 h-6 text-green-600" />
                        <p className="text-sm text-gray-600">Approved Entries</p>
                      </div>
                      <p className="text-3xl text-gray-900">{approvedCount}</p>
                      <p className="text-xs text-gray-600 mt-1">records</p>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl shadow-lg p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-6 h-6 text-yellow-600" />
                        <p className="text-sm text-gray-600">Pending Approval</p>
                      </div>
                      <p className="text-3xl text-gray-900">{pendingCount}</p>
                      <p className="text-xs text-gray-600 mt-1">records</p>
                    </div>
                  </>
                );
              })()}
            </div>

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
                  
                  {/* Alert Settings and Plate Settings - For Operations Managers and Production Incharge in Production Analytics Mode */}
                  {analyticsMode === 'production' && (isManager || isProductionIncharge) && (
                    <div className="flex gap-2 items-start">
                      {/* Stock Alert Settings Button */}
                      <button
                        onClick={() => {
                          setTempStockAlertThresholds(JSON.parse(JSON.stringify(stockAlertThresholds)));
                          setShowStockAlertModal(true);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:from-purple-700 hover:to-pink-600 transition-all flex items-center gap-2 shadow-lg"
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
                      {(isManager || isClusterHead) && onNavigateToManageItems && (
                        <button
                          onClick={() => {
                            console.log('🔘 Manage Items button clicked in Analytics');
                            onNavigateToManageItems();
                          }}
                          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all shadow-md hover:shadow-lg font-semibold"
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
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                console.log('  - analyticsMode:', analyticsMode);
                console.log('  - selectedProductionHouseId:', selectedProductionHouseId);
                console.log('  - effectiveProductionHouseId:', effectiveProductionHouseId);
                
                // Find the selected production house by its id
                const selectedProductionHouseForStock = effectiveProductionHouseId 
                  ? context.productionHouses?.find(ph => ph.id === effectiveProductionHouseId)
                  : null;
                
                console.log('  - Selected production house for stock:', selectedProductionHouseForStock);
                console.log('  - Total production records available:', productionData.length);
                if (productionData.length > 0 && productionData.length <= 3) {
                  console.log('  - All production records:', productionData.map(p => ({
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
                    recordProductionHouseId = store?.productionHouseId || null;
                  }
                  
                  const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
                  
                  // Match if ANY of these are true
                  return matchesStoreId || matchesProductionHouseId || phId === effectiveProductionHouseId;
                });
                
                console.log('  - Filtered production for stock status:', filteredProduction.length);
                if (filteredProduction.length > 0) {
                  console.log('  - Sample production record:', {
                    id: filteredProduction[0].id,
                    storeId: filteredProduction[0].storeId,
                    productionHouseId: filteredProduction[0].productionHouseId,
                    date: filteredProduction[0].date
                  });
                }

                // Filter by current month only (monthly reset logic)
                const currentMonth = new Date().toISOString().substring(0, 7); // "2026-01"
                const monthlyFilteredProduction = filteredProduction.filter(p => p.date.startsWith(currentMonth));
                
                console.log('  - Monthly filtered production:', monthlyFilteredProduction.length, 'for month:', currentMonth);
                if (monthlyFilteredProduction.length > 0) {
                  console.log('  - Sample monthly production record:', monthlyFilteredProduction[0]);
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

                // Calculate total production by momo type (for current month only) - DYNAMIC
                const totalProduced: Record<string, number> = {};
                
                // Initialize all finished products to 0
                finishedProductsForCalc.forEach(item => {
                  const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
                  totalProduced[stockKey] = 0;
                });
                
                // Aggregate production data - ONLY APPROVED PRODUCTION
                monthlyFilteredProduction
                  .filter(p => p.approvalStatus === 'approved') // CRITICAL: Only count approved production
                  .forEach(p => {
                    finishedProductsForCalc.forEach(item => {
                      const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
                      
                      // CRITICAL FIX: Production data is stored in p.data object
                      // Read from p.data[item.name] (e.g., p.data.chicken_momo)
                      const dataValue = (p.data as any)?.[item.name];
                      
                      // If not found in data object, fallback to old format for backwards compatibility
                      let fieldValue = 0;
                      if (dataValue !== undefined && dataValue !== null) {
                        // Production data found in p.data
                        fieldValue = typeof dataValue === 'object' ? (dataValue.final || dataValue.quantity || 0) : dataValue;
                      } else {
                        // Fallback: try old format (p.chickenMomos or p.chicken)
                        const fieldWithMomos = (p as any)[stockKey + 'Momos'];
                        const fieldWithoutMomos = (p as any)[stockKey];
                        
                        if (fieldWithMomos) {
                          fieldValue = typeof fieldWithMomos === 'object' ? (fieldWithMomos.final || 0) : fieldWithMomos;
                        } else if (fieldWithoutMomos) {
                          fieldValue = typeof fieldWithoutMomos === 'object' ? (fieldWithoutMomos.final || 0) : fieldWithoutMomos;
                        }
                      }
                      
                      totalProduced[stockKey] = (totalProduced[stockKey] || 0) + fieldValue;
                    });
                  });

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
                  // Only count delivered requests (completed deliveries to stores)
                  if (req.status !== 'delivered') return false;
                  
                  // Filter by current month only (monthly reset)
                  // Check what date field exists on production requests
                  const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
                  
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
                      deliveredDate: req.deliveredDate,
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
                
                // Aggregate delivered requests
                fulfilledRequests.forEach(req => {
                  finishedProductsForCalc.forEach(item => {
                    const stockKey = getStockKey(item.name); // e.g., "chicken" from "chicken_momo"
                    // Support both old format (chickenMomos with 's') and new format (chickenMomo without 's')
                    const requestedQty = (req as any)[stockKey + 'Momos'] || // Old: chickenMomos
                                        (req as any)[stockKey] ||            // New: chicken
                                        0;
                    totalSentToStores[stockKey] = (totalSentToStores[stockKey] || 0) + requestedQty;
                  });
                });

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
                console.log('  previousMonthStock (raw):', previousMonthStock);
                console.log('  Opening Balance (processed):', openingBalance);
                console.log('  Current Month Production (APPROVED ONLY):', totalProduced);
                console.log('  Current Month Deliveries:', totalSentToStores);
                console.log('  📊 Production Records Debug:');
                console.log('    Total monthly production records:', monthlyFilteredProduction.length);
                console.log('    Approved monthly production records:', monthlyFilteredProduction.filter(p => p.approvalStatus === 'approved').length);
                console.log('    Sample production records:', monthlyFilteredProduction.slice(0, 3).map(p => ({
                  id: p.id.slice(0, 8),
                  date: p.date,
                  approvalStatus: p.approvalStatus,
                  hasData: !!p.data,
                  dataKeys: p.data ? Object.keys(p.data) : [],
                  sampleValue: p.data ? p.data[Object.keys(p.data)[0]] : null
                })));
                
                // NEW: Check if we have mid-month recalibration data
                const midMonthRecalData = (window as any).__midMonthRecalibration;
                const midMonthRecalDate = latestRecalibration?.date;
                const isMidMonthRecal = midMonthRecalData && midMonthRecalDate;
                
                if (isMidMonthRecal) {
                  console.log('  🔄 Mid-Month Recalibration Detected:');
                  console.log('    Recalibration date:', midMonthRecalDate);
                  console.log('    Recalibration stock:', midMonthRecalData);
                }
                
                // Calculate production house stock dynamically
                const productionHouseStock: Record<string, number> = {};
                
                if (isMidMonthRecal) {
                  // PROPER mid-month recalibration logic:
                  // Stock = Most Recent Recalibration + Production AFTER - Deliveries AFTER
                  const recalTimestamp = midMonthRecalDate!; // Use full ISO timestamp
                  console.log('    Recalibration date (date only):', recalTimestamp.substring(0, 10));
                  
                  // Calculate production AFTER recalibration
                  const productionAfterRecal: Record<string, number> = {};
                  finishedProductsForCalc.forEach(item => {
                    const stockKey = getStockKey(item.name);
                    productionAfterRecal[stockKey] = 0;
                  });
                  
                  filteredProduction
                    .filter(prod => prod.approvalStatus === 'approved') // CRITICAL: Only count approved production
                    .forEach(prod => {
                      const recalDateOnly = recalTimestamp.substring(0, 10); // "2026-01-14"
                      const isAfterRecalDate = prod.date > recalDateOnly; // Exclude production from same day
                      
                      console.log('  📊 Checking production after recalibration:', {
                        id: prod.id.slice(0, 8),
                        date: prod.date,
                        recalDateOnly: recalDateOnly,
                        isAfter: isAfterRecalDate,
                        hasData: !!prod.data,
                        dataKeys: prod.data ? Object.keys(prod.data) : [],
                        approvalStatus: prod.approvalStatus
                      });
                      
                      // Only include production from AFTER the recalibration date (not same day)
                      // Since production records only have dates, we can't tell if same-day production
                      // happened before or after the recalibration, so we exclude it
                      if (isAfterRecalDate) {
                        finishedProductsForCalc.forEach(item => {
                          const stockKey = getStockKey(item.name);
                          
                          // CRITICAL FIX: Use same logic as totalProduced - check both p.data and old format
                          const dataValue = (prod.data as any)?.[item.name];
                          let value = 0;
                          
                          if (dataValue !== undefined && dataValue !== null) {
                            // Production data found in p.data
                            value = typeof dataValue === 'object' ? (dataValue.final || dataValue.quantity || 0) : dataValue;
                          } else {
                            // Fallback: try old format (prod.chickenMomos or prod.chicken)
                            const fieldWithMomos = (prod as any)[stockKey + 'Momos'];
                            const fieldWithoutMomos = (prod as any)[stockKey];
                            
                            if (fieldWithMomos) {
                              value = typeof fieldWithMomos === 'object' ? (fieldWithMomos.final || 0) : fieldWithMomos;
                            } else if (fieldWithoutMomos) {
                              value = typeof fieldWithoutMomos === 'object' ? (fieldWithoutMomos.final || 0) : fieldWithoutMomos;
                            }
                          }
                          
                          if (value > 0) {
                            console.log(`    ✅ Adding production after recalibration: ${item.name} (${stockKey}) = ${value}`);
                          }
                          productionAfterRecal[stockKey] = (productionAfterRecal[stockKey] || 0) + value;
                        });
                      }
                    });
                  
                  // Calculate deliveries AFTER recalibration
                  const deliveriesAfterRecal: Record<string, number> = {};
                  finishedProductsForCalc.forEach(item => {
                    const stockKey = getStockKey(item.name);
                    deliveriesAfterRecal[stockKey] = 0;
                  });
                  
                  fulfilledRequests.forEach(req => {
                    const deliveryDate = req.deliveredDate || req.requestDate || req.createdAt;
                    // Compare full timestamps, not just dates
                    if (deliveryDate && deliveryDate > recalTimestamp) {
                      finishedProductsForCalc.forEach(item => {
                        const stockKey = getStockKey(item.name);
                        const requestedQty = (req as any)[stockKey + 'Momos'] || (req as any)[stockKey] || 0;
                        deliveriesAfterRecal[stockKey] = (deliveriesAfterRecal[stockKey] || 0) + requestedQty;
                      });
                    }
                  });
                  
                  console.log('    Production AFTER recalibration:', productionAfterRecal);
                  console.log('    Deliveries AFTER recalibration:', deliveriesAfterRecal);
                  
                  // Calculate final stock: Recal + Production After - Deliveries After
                  finishedProductsForCalc.forEach(item => {
                    const stockKey = getStockKey(item.name);
                    const recalStock = midMonthRecalData[stockKey] || 0;
                    const prodAfter = productionAfterRecal[stockKey] || 0;
                    const delAfter = deliveriesAfterRecal[stockKey] || 0;
                    productionHouseStock[stockKey] = recalStock + prodAfter - delAfter;
                    console.log(`    ${stockKey}: ${recalStock} (recal) + ${prodAfter} (prod after) - ${delAfter} (del after) = ${productionHouseStock[stockKey]}`);
                  });
                } else {
                  // Normal calculation: Opening Balance + Production - Deliveries
                  finishedProductsForCalc.forEach(item => {
                    const stockKey = getStockKey(item.name);
                    productionHouseStock[stockKey] = 
                      (openingBalance[stockKey] || 0) + 
                      (totalProduced[stockKey] || 0) - 
                      (totalSentToStores[stockKey] || 0);
                  });
                }
                
                console.log('  Final Stock:', productionHouseStock);
                
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
                  'chicken': 'purple',
                  'chickenCheese': 'pink',
                  'chicken_cheese': 'pink',
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
                    color: colorMap[baseName] || colorMap[stockKey] || 'indigo',
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
                              Stock calculation: <span className="font-mono">Opening Balance + This Month's Production - Deliveries</span>
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

            {/* Momo Production Charts */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl text-gray-900 mb-1">Momo Production Analysis</h2>
                  <p className="text-sm text-gray-600">Daily, weekly, monthly, and yearly production trends</p>
                </div>

                {/* Time Filter */}
                <div className="flex gap-2">
                  {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTimeFilter(filter as TimeFilter)}
                      className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                        timeFilter === filter
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range Picker */}
              {timeFilter === 'custom' && (
                <div className="mb-6 bg-blue-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">From Date</label>
                      <input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">To Date</label>
                      <input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Production Bar Chart */}
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={(() => {
                  // Use consistent production house filtering logic
                  const filterById = analyticsMode === 'production'
                    ? selectedProductionHouseId  // In production mode, use production house selector
                    : (context.user?.designation === 'production_incharge'
                        ? effectiveStoreId  // Production incharge in store mode uses their store ID
                        : selectedProductionHouseId);  // Cluster head in store mode uses production house selector
                  
                  // Find the selected production house to get BOTH its id and storeId
                  const selectedProductionHouseForChart = filterById 
                    ? context.productionHouses?.find(ph => ph.id === filterById || ph.storeId === filterById)
                    : null;
                  
                  const filteredProduction = productionData.filter(p => {
                    // Match on storeId OR productionHouseId
                    if (filterById) {
                      const matchesStoreId = p.storeId === filterById;
                      const matchesProductionHouseId = p.productionHouseId === filterById;
                      
                      // Get the production house ID from the record
                      let recordProductionHouseId = p.productionHouseId;
                      
                      // If record doesn't have productionHouseId OR it's a store ID (starts with 'STORE-'), look it up via storeId
                      if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
                        const store = context.stores?.find(s => s.id === p.storeId);
                        recordProductionHouseId = store?.productionHouseId || null;
                      }
                      
                      const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
                      
                      const matches = matchesStoreId || matchesProductionHouseId || phId === filterById;
                      if (!matches) return false;
                    }
                    
                    if (timeFilter === 'custom') {
                      return p.date >= dateRange.from && p.date <= dateRange.to;
                    }
                    return true;
                  });

                  // Group by time period
                  const grouped = new Map();
                  filteredProduction.forEach(p => {
                    let key = p.date;
                    let displayLabel = p.date;
                    
                    if (timeFilter === 'weekly') {
                      const date = new Date(p.date);
                      const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekEnd.getDate() + 6);
                      key = weekStart.toISOString().split('T')[0];
                      // Format as "Dec 21 - Dec 27"
                      displayLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                    } else if (timeFilter === 'monthly') {
                      key = p.date.substring(0, 7); // YYYY-MM
                      displayLabel = key;
                    } else if (timeFilter === 'yearly') {
                      key = p.date.substring(0, 4); // YYYY
                      displayLabel = key;
                    }

                    if (!grouped.has(key)) {
                      grouped.set(key, {
                        period: displayLabel,
                        chickenMomos: 0,
                        chickenCheeseMomos: 0,
                        vegMomos: 0,
                        cheeseCornMomos: 0,
                        paneerMomos: 0,
                        vegKurkure: 0,
                        chickenKurkure: 0,
                      });
                    }

                    const data = grouped.get(key)!;
                    data.chickenMomos += p.chickenMomos?.final || 0;
                    data.chickenCheeseMomos += p.chickenCheeseMomos?.final || 0;
                    data.vegMomos += p.vegMomos?.final || 0;
                    data.cheeseCornMomos += p.cheeseCornMomos?.final || 0;
                    data.paneerMomos += p.paneerMomos?.final || 0;
                    data.vegKurkure += p.vegKurkureMomos?.final || 0;
                    data.chickenKurkure += p.chickenKurkureMomos?.final || 0;
                  });

                  return Array.from(grouped.values()).sort((a, b) => 
                    a.period.localeCompare(b.period)
                  );
                })()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                    dataKey="period" 
                    tick={{ fontSize: 12 }}
                    stroke="#666"
                    angle={timeFilter === 'weekly' ? -15 : 0}
                    textAnchor={timeFilter === 'weekly' ? 'end' : 'middle'}
                    height={timeFilter === 'weekly' ? 60 : 30}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    stroke="#666"
                    label={{ value: 'Pieces', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip content={<ProductionTooltip />} />
                  <Legend />
                  <Bar dataKey="chickenMomos" name="Chicken Momos" fill="#ef4444" />
                  <Bar dataKey="chickenCheeseMomos" name="Chicken Cheese" fill="#f97316" />
                  <Bar dataKey="vegMomos" name="Veg Momos" fill="#10b981" />
                  <Bar dataKey="cheeseCornMomos" name="Cheese Corn" fill="#fbbf24" />
                  <Bar dataKey="paneerMomos" name="Paneer Momos" fill="#3b82f6" />
                  <Bar dataKey="vegKurkure" name="Veg Kurkure" fill="#84cc16" />
                  <Bar dataKey="chickenKurkure" name="Chicken Kurkure" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Wastage Analysis Charts */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl text-gray-900 mb-1">Wastage Analysis</h2>
                  <p className="text-sm text-gray-600">Track and minimize production wastage</p>
                </div>
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
                window.wastageFilterHelper = { matchesProductionHouse, mappedStoreIds, filterById };
                
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

              {/* Wastage Bar Charts by Time Period */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Daily Wastage */}
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4">
                  <h3 className="text-gray-900 mb-3">Daily Wastage Trend</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={(() => {
                      const last5Days = [];
                      for (let i = 4; i >= 0; i--) {
                        const date = new Date();
                        date.setDate(date.getDate() - i);
                        const dateStr = date.toISOString().split('T')[0];
                        
                        const helper = (window as any).wastageFilterHelper;
                        const dayProduction = productionData.filter(p => helper.matchesProductionHouse(p) && p.date === dateStr);

                        const totalWastage = dayProduction.reduce((sum, p) => {
                          return sum + 
                            (p.wastage?.dough || 0) + 
                            (p.wastage?.stuffing || 0) + 
                            (p.wastage?.batter || 0) + 
                            (p.wastage?.coating || 0);
                        }, 0);

                        last5Days.push({
                          date: dateStr.substring(5),
                          wastage: totalWastage
                        });
                      }
                      return last5Days;
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#fca5a5" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="wastage" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Weekly Wastage */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
                  <h3 className="text-gray-900 mb-3">Weekly Wastage Trend</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={(() => {
                      const last5Weeks = [];
                      for (let i = 4; i >= 0; i--) {
                        const date = new Date();
                        date.setDate(date.getDate() - (i * 7));
                        const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekEnd.getDate() + 6);
                        
                        const helper = (window as any).wastageFilterHelper;
                        const weekProduction = productionData.filter(p => 
                          helper.matchesProductionHouse(p) && 
                          p.date >= weekStart.toISOString().split('T')[0] && 
                          p.date <= weekEnd.toISOString().split('T')[0]
                        );

                        const totalWastage = weekProduction.reduce((sum, p) => {
                          return sum + 
                            (p.wastage?.dough || 0) + 
                            (p.wastage?.stuffing || 0) + 
                            (p.wastage?.batter || 0) + 
                            (p.wastage?.coating || 0);
                        }, 0);

                        last5Weeks.push({
                          week: `W${5-i}`,
                          wastage: totalWastage
                        });
                      }
                      return last5Weeks;
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="wastage" stroke="#ea580c" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly Wastage */}
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
                  <h3 className="text-gray-900 mb-3">Monthly Wastage Trend</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={(() => {
                      const last5Months = [];
                      for (let i = 4; i >= 0; i--) {
                        const date = new Date();
                        date.setMonth(date.getMonth() - i);
                        const monthStr = date.toISOString().substring(0, 7);
                        
                        const helper = (window as any).wastageFilterHelper;
                        const monthProduction = productionData.filter(p => 
                          helper.matchesProductionHouse(p) && p.date.startsWith(monthStr)
                        );

                        const totalWastage = monthProduction.reduce((sum, p) => {
                          return sum + 
                            (p.wastage?.dough || 0) + 
                            (p.wastage?.stuffing || 0) + 
                            (p.wastage?.batter || 0) + 
                            (p.wastage?.coating || 0);
                        }, 0);

                        last5Months.push({
                          month: monthStr.substring(5),
                          wastage: totalWastage
                        });
                      }
                      return last5Months;
                    })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#fde68a" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="wastage" stroke="#ca8a04" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Wastage Breakdown by Type with Time Filter */}
              <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl text-gray-900">Wastage Breakdown by Type</h3>
                  
                  {/* Time Filter for Wastage */}
                  <div className="flex gap-2">
                    {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setWastageTimeFilter(filter as TimeFilter)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          wastageTimeFilter === filter
                            ? 'bg-red-600 text-white'
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
                    );
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="period" 
                      tick={{ fontSize: 12 }} 
                      angle={wastageTimeFilter === 'weekly' ? -15 : 0}
                      textAnchor={wastageTimeFilter === 'weekly' ? 'end' : 'middle'}
                      height={wastageTimeFilter === 'weekly' ? 60 : 30}
                    />
                    <YAxis tick={{ fontSize: 12 }} label={{ value: 'kg', angle: -90, position: 'insideLeft' }} />
                    <Tooltip content={<WastageTooltip />} />
                    <Legend />
                    <Bar dataKey="dough" name="Dough" fill="#dc2626" />
                    <Bar dataKey="stuffing" name="Stuffing" fill="#f97316" />
                    <Bar dataKey="batter" name="Batter" fill="#fbbf24" />
                    <Bar dataKey="coating" name="Coating" fill="#a855f7" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* SOP Maintenance Section - Cluster Head Only */}
              {isClusterHead && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg border-2 border-blue-200 p-6 mt-6">
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
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl text-gray-900 flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-indigo-600" />
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
                          ? selectedProductionHouseId  // In production mode, use production house selector
                          : (context.user?.designation === 'production_incharge'
                              ? effectiveStoreId  // Production incharge in store mode uses their store ID
                              : selectedProductionHouseId);  // Cluster head in store mode uses production house selector
                        
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
                          const momoData = p[field];
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
                          const momoData = p[field];
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

        {/* Production Requests View */}
        {activeView === 'production-requests' && (
          <div>
            <ProductionRequests 
              context={context} 
              highlightRequestId={highlightRequestId || null} 
              selectedStoreId={localSelectedStoreId}
              onNavigateToManageItems={onNavigateToManageItems}
            />
          </div>
        )}

        {/* Recalibration Reports View - Production Analytics */}
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

        {/* Store Recalibration View - Store Analytics */}
        {activeView === 'store-recalibration' && (
          <div>
            <RecalibrationReports 
              context={context} 
              selectedStoreId={effectiveStoreId}
              locationType="store"
            />
          </div>
        )}
      </div>
      
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 p-6 rounded-t-2xl">
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-white/30">
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
                  className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-2 border-white/30 hover:bg-white/30 transition-all"
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
                    <div key={camelKey} className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4">
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
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl hover:from-purple-700 hover:to-pink-600 transition-all flex items-center gap-2"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 p-6 rounded-t-2xl">
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-white/30">
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
                  className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-2 border-white/30 hover:bg-white/30 transition-all"
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

      {/* Leave Details Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserX className="w-6 h-6" />
                <h3 className="text-xl">Leave Details - Today</h3>
              </div>
              <button
                onClick={() => setShowLeaveModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {todayLeaveCount === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-lg text-gray-900 mb-2">Everyone is working today! 🎉</p>
                  <p className="text-sm text-gray-600">
                    {context.user?.storeId 
                      ? 'No employees on leave in this store' 
                      : 'No employees on leave across all stores'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-700">
                      <span className="text-xl font-bold text-orange-600">{todayLeaveCount}</span> {todayLeaveCount === 1 ? 'employee' : 'employees'} on leave
                    </p>
                  </div>

                  {/* Leave List */}
                  <div className="space-y-3">
                    {todayLeaveDetails.map((leave, index) => (
                      <div 
                        key={leave.id || index}
                        className="bg-orange-50 border border-orange-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-orange-600" />
                              </div>
                              <div>
                                <p className="text-gray-900 font-semibold">{leave.employeeName}</p>
                                <p className="text-sm text-gray-600">Employee ID: {leave.employeeId}</p>
                              </div>
                            </div>

                            <div className="ml-12 space-y-1">
                              {leave.storeName && leave.storeName !== 'N/A' && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Package className="w-4 h-4 text-gray-500" />
                                  <span className="text-gray-700">{leave.storeName}</span>
                                  {leave.storeId && leave.storeId !== 'N/A' && (
                                    <span className="text-gray-500">({leave.storeId})</span>
                                  )}
                                </div>
                              )}
                              
                              {leave.reason && (
                                <div className="flex items-start gap-2 text-sm mt-2">
                                  <FileText className="w-4 h-4 text-gray-500 mt-0.5" />
                                  <div>
                                    <p className="text-gray-600 font-medium">Reason:</p>
                                    <p className="text-gray-700">{leave.reason}</p>
                                  </div>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-2 text-sm mt-2">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <span className="text-gray-600">
                                  Date: {formatDateIST(leave.leaveDate)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="ml-4">
                            <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              Approved
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
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
    </div>
  );
}