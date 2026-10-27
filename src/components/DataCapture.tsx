import { useState, useEffect, useMemo } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp, TrendingDown, Package, FileText, Bug } from 'lucide-react';
import { InventoryContextType } from '../App';
import { toast } from 'sonner@2.0.3';
import { DatePicker } from './DatePicker';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { formatDateTimeIST, formatDateIST } from '../utils/timezone';
import { getAssignedProductionHouseIds, getAssignedStoreIds } from '../utils/entityAccess';

type DataCaptureProps = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedProductionHouseId?: string | null;
};

type DailyLog = {
  date: string;
  inventoryLogged: boolean;
  inventoryCount: number;
  inventoryLoggedAt: string | null;
  inventoryLoggedBy: string; // Name or email of who logged inventory
  salesLogged: boolean;
  salesLoggedAt: string | null;
  salesLoggedBy: string; // Name or email of who logged sales
  productionLogged: boolean;
  productionLoggedAt: string | null;
  productionLoggedBy: string; // Name or email of who logged production
  stockRequestLogged: boolean;
  stockRequestLoggedAt: string | null;
  stockRequestLoggedBy: string; // Name or email of who created stock request
  cashDiscrepancy: number;
  managerEmail: string;
  managerName: string;
  status: 'complete' | 'partial' | 'missing';
  lateEntry: boolean;
};

type PeriodStats = {
  totalDays: number;
  daysWithData: number;
  totalDiscrepancy: number;
  avgDiscrepancy: number;
  completionRate: number;
  onTimeRate: number;
};

export function DataCapture({ context, selectedStoreId, selectedProductionHouseId }: DataCaptureProps) {
  const [dateRange, setDateRange] = useState<'day' | 'thisMonth' | 'prevMonth' | 'thisYear' | 'prevYear' | 'custom'>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const selectedConcreteStoreId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : null;
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isClusterHead = context.user?.role === 'cluster_head';
  const isAudit = context.user?.role === 'audit';
  const isOperationsManager = context.user?.role === 'manager' && !isProductionIncharge && !isStoreIncharge;

  // Production incharges can have `user.storeId` set to their production-house id, not a
  // store id. Resolve the stores they supply first; otherwise the Expense/Sales/Stock
  // Request columns compare store rows against a production-house id and show "Not logged".
  const scopedStoreIds = useMemo<string[] | null>(() => {
    if (selectedConcreteStoreId) return [selectedConcreteStoreId];

    if (selectedProductionHouseId) {
      return (context.stores || [])
        .filter(store => store.productionHouseId === selectedProductionHouseId)
        .map(store => store.id);
    }

    if (!context.user) return [];
    if (isClusterHead || isAudit || isOperationsManager) return null;

    const assigned = getAssignedStoreIds(context.user, context.stores || []);
    return assigned.length > 0 ? assigned : [];
  }, [selectedConcreteStoreId, selectedProductionHouseId, context.user, context.stores, isClusterHead, isAudit, isOperationsManager]);

  const scopedStoreIdSet = useMemo(() => scopedStoreIds ? new Set(scopedStoreIds) : null, [scopedStoreIds]);
  const storeScopeKey = scopedStoreIds === null ? 'all' : scopedStoreIds.join('|');
  const matchesStoreScope = (storeId?: string | null) => !scopedStoreIdSet || (!!storeId && scopedStoreIdSet.has(storeId));

  const scopedProductionHouseIds = useMemo<string[] | null>(() => {
    if (selectedProductionHouseId) return [selectedProductionHouseId];

    if (selectedConcreteStoreId) {
      const store = context.stores?.find(s => s.id === selectedConcreteStoreId);
      return store?.productionHouseId ? [store.productionHouseId] : [];
    }

    if (!context.user) return [];
    if (isClusterHead || isAudit || isOperationsManager) return null;

    if (isProductionIncharge) {
      const assigned = getAssignedProductionHouseIds(context.user, context.productionHouses || []);
      return assigned.length > 0 ? assigned : [];
    }

    const assignedStores = getAssignedStoreIds(context.user, context.stores || []);
    const productionHouseIds = assignedStores
      .map(storeId => context.stores?.find(s => s.id === storeId)?.productionHouseId)
      .filter((id): id is string => !!id);
    return Array.from(new Set(productionHouseIds));
  }, [selectedProductionHouseId, selectedConcreteStoreId, context.user, context.stores, context.productionHouses, isClusterHead, isAudit, isOperationsManager, isProductionIncharge]);

  const productionHouseScopeKey = scopedProductionHouseIds === null ? 'all' : scopedProductionHouseIds.join('|');
  const matchesProductionScope = (prod: any) => {
    if (!scopedProductionHouseIds) return true;
    const productionHouseId = prod.productionHouseId
      || context.stores?.find(s => s.id === prod.storeId)?.productionHouseId
      || prod.storeId;
    return !!productionHouseId && scopedProductionHouseIds.includes(productionHouseId);
  };

  useEffect(() => {
    generateDailyLogs();
  }, [context.inventory, context.salesData, context.productionData, context.productionRequests, dateRange, customStartDate, customEndDate, storeScopeKey, productionHouseScopeKey]);

  const getDateRangeDates = (): { startDate: Date; endDate: Date } => {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date(today);

    switch (dateRange) {
      case 'day':
        startDate = new Date(today);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today);
        break;
      case 'prevMonth':
        // Start date: 1st of previous month
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        // End date: Last day of previous month (0th day of current month)
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'thisYear':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today);
        break;
      case 'prevYear':
        // Start date: Jan 1 of previous year
        startDate = new Date(today.getFullYear() - 1, 0, 1);
        // End date: Dec 31 of previous year
        endDate = new Date(today.getFullYear() - 1, 11, 31);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          return {
            startDate: new Date(customStartDate),
            endDate: new Date(customEndDate)
          };
        }
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
    }

    return { startDate, endDate };
  };

  const generateDailyLogs = () => {
    setLoading(true);
    const { startDate, endDate } = getDateRangeDates();
    const logs: DailyLog[] = [];
    
    // CRITICAL DEBUG: Check if productionRequests exist in context
    console.log('🔍 DataCapture Context Check:', {
      hasProductionRequests: !!context.productionRequests,
      productionRequestsCount: context.productionRequests?.length || 0,
      productionRequestsArray: context.productionRequests,
      firstThreeRequests: context.productionRequests?.slice(0, 3)
    });

    // Create a map of dates to their data
    const dateMap = new Map<string, DailyLog>();

    // Initialize all dates in range (inclusive of end date)
    // Use local date strings to avoid timezone issues
    const current = new Date(startDate);
    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      dateMap.set(dateStr, {
        date: dateStr,
        inventoryLogged: false,
        inventoryCount: 0,
        inventoryLoggedAt: null,
        inventoryLoggedBy: '',
        salesLogged: false,
        salesLoggedAt: null,
        salesLoggedBy: '',
        productionLogged: false,
        productionLoggedAt: null,
        productionLoggedBy: '',
        stockRequestLogged: false,
        stockRequestLoggedAt: null,
        stockRequestLoggedBy: '',
        cashDiscrepancy: 0,
        managerEmail: '',
        managerName: '',
        status: 'missing',
        lateEntry: false
      });
      
      current.setDate(current.getDate() + 1);
    }

    // Group inventory by date and manager
    const inventoryByDate = new Map<string, any[]>();
    // Filter inventory by store FIRST
    const filteredInventory = scopedStoreIds !== null
      ? context.inventory.filter(inv => matchesStoreScope(inv.storeId))
      : context.inventory;
    
    filteredInventory.forEach(inv => {
      if (!inventoryByDate.has(inv.date)) {
        inventoryByDate.set(inv.date, []);
      }
      inventoryByDate.get(inv.date)?.push(inv);
    });

    // Process inventory data
    inventoryByDate.forEach((items, date) => {
      if (dateMap.has(date)) {
        const log = dateMap.get(date)!;
        log.inventoryLogged = true;
        log.inventoryCount = items.length;
        
        // Get the first item's ID to extract timestamp and creator info
        if (items.length > 0) {
          const firstItem = items[0];
          const firstItemId = firstItem.id;
          const timestamp = firstItemId.split('-')[0];
          
          // Set who logged inventory
          if (firstItem.createdByName) {
            log.inventoryLoggedBy = firstItem.createdByName;
          } else if (firstItem.createdByEmail) {
            log.inventoryLoggedBy = firstItem.createdByEmail;
          } else if (firstItem.createdBy) {
            // Check if createdBy is a UUID (contains dashes) - if so, try to get a better identifier
            const isUUID = typeof firstItem.createdBy === 'string' && firstItem.createdBy.includes('-');
            if (isUUID) {
              // Don't show UUID, show 'Manager' or userId fallback
              log.inventoryLoggedBy = (firstItem as any).userId ? `User ${(firstItem as any).userId.substring(0, 8)}` : 'Manager';
            } else {
              // It's an employee ID like BM001
              log.inventoryLoggedBy = firstItem.createdBy;
            }
          } else if ((firstItem as any).userId) {
            // Fallback to userId for existing data (stored in backend)
            log.inventoryLoggedBy = `User ${(firstItem as any).userId.substring(0, 8)}`;
          } else {
            log.inventoryLoggedBy = 'Unknown User';
          }
          
          if (timestamp) {
            const timestampNum = parseInt(timestamp);
            if (!isNaN(timestampNum) && timestampNum > 0) {
              log.inventoryLoggedAt = new Date(timestampNum).toISOString();
              
              // Check if logged late (after 11:59:59 PM of that day)
              // Entry is ON TIME if logged on the same day before midnight
              // Entry is LATE if logged after midnight of the target day
              const entryDate = new Date(timestampNum);
              const targetDate = new Date(date + 'T23:59:59');
              log.lateEntry = entryDate > targetDate;
            }
          }
        }
      }
    });

    // Process sales data
    // Filter sales by store FIRST
    const filteredSalesData = scopedStoreIds !== null
      ? context.salesData.filter(sale => matchesStoreScope(sale.storeId))
      : context.salesData;
    
    filteredSalesData.forEach(sale => {
      if (dateMap.has(sale.date)) {
        const log = dateMap.get(sale.date)!;
        log.salesLogged = true;
        // Use salesDiscrepancy (settled value) instead of cashOffset to prevent recalculation when inventory is added later
        log.cashDiscrepancy = Math.abs(sale.salesDiscrepancy !== undefined ? sale.salesDiscrepancy : (sale.cashOffset || 0));
        
        // Set who logged sales
        if (sale.createdByName) {
          log.salesLoggedBy = sale.createdByName;
        } else if (sale.createdByEmail) {
          log.salesLoggedBy = sale.createdByEmail;
        } else if (sale.createdBy) {
          // Check if createdBy is a UUID (contains dashes) - if so, hide it
          const isUUID = typeof sale.createdBy === 'string' && sale.createdBy.includes('-');
          if (isUUID) {
            // Don't show UUID, show 'Manager' instead
            log.salesLoggedBy = 'Manager';
          } else {
            // It's an employee ID like BM001
            log.salesLoggedBy = sale.createdBy;
          }
        } else {
          log.salesLoggedBy = 'Unknown User';
        }
        
        // Extract manager info for the overall log (use current user as fallback)
        if (context.user) {
          log.managerEmail = context.user.email;
          log.managerName = context.user.name;
        }
        
        // Get sales logged timestamp from ID
        const timestamp = sale.id.split('-')[0];
        if (timestamp) {
          const timestampNum = parseInt(timestamp);
          if (!isNaN(timestampNum) && timestampNum > 0) {
            log.salesLoggedAt = new Date(timestampNum).toISOString();
            
            // Check if logged late
            const entryDate = new Date(timestampNum);
            const targetDate = new Date(sale.date + 'T23:59:59');
            if (entryDate > targetDate) {
              log.lateEntry = true;
            }
          }
        }
      }
    });

    // Process production data
    const filteredProductionData = scopedProductionHouseIds !== null
      ? context.productionData.filter(prod => matchesProductionScope(prod))
      : context.productionData;
    
    filteredProductionData.forEach(prod => {
      if (dateMap.has(prod.date)) {
        const log = dateMap.get(prod.date)!;
        log.productionLogged = true;
        
        // Set who logged production - try to get name from employee list
        let creatorName = '';
        if ((prod as any).createdByName) {
          creatorName = (prod as any).createdByName;
        } else if ((prod as any).createdByEmail) {
          creatorName = (prod as any).createdByEmail;
        } else if (prod.createdBy) {
          // Try to find employee name from employee list
          const employee = (context as any).employees?.find((emp: any) => emp.employeeId === prod.createdBy);
          if (employee) {
            creatorName = employee.name;
          } else {
            // Check if createdBy is a UUID (contains dashes) - if so, hide it
            const isUUID = typeof prod.createdBy === 'string' && prod.createdBy.includes('-');
            if (isUUID) {
              // Don't show UUID, show 'Production Manager' instead
              creatorName = 'Production Manager';
            } else {
              // It's an employee ID like PM001 or BM002
              creatorName = prod.createdBy;
            }
          }
        } else {
          creatorName = 'Unknown User';
        }
        log.productionLoggedBy = creatorName;
        
        // Get production logged timestamp - use createdAt if available
        if ((prod as any).createdAt) {
          log.productionLoggedAt = (prod as any).createdAt;

          // Check if logged late
          const entryDate = new Date((prod as any).createdAt);
          const targetDate = new Date(prod.date + 'T23:59:59');
          if (entryDate > targetDate) {
            log.lateEntry = true;
          }
        } else {
          // Fallback: Use production date at noon if createdAt is not available
          log.productionLoggedAt = new Date(prod.date + 'T12:00:00').toISOString();
        }
      }
    });

    // Process stock request data
    // Filter production requests by store FIRST (these are the "stock requests" from store perspective)
    const filteredStockRequests = scopedStoreIds !== null
      ? context.productionRequests.filter(req => matchesStoreScope(req.storeId))
      : context.productionRequests;
    
    console.log('📦 DataCapture - Stock Requests Debug:', {
      totalStockRequests: context.productionRequests.length,
      filteredStockRequests: filteredStockRequests.length,
      storeScopeKey,
      productionHouseScopeKey,
      stockRequestDates: filteredStockRequests.map(r => r.requestDate),
      dateMapKeys: Array.from(dateMap.keys()),
      stockRequestIds: filteredStockRequests.map(r => r.id),
      sampleRequest: filteredStockRequests[0],
      dateRangeStart: Array.from(dateMap.keys()).sort()[0],
      dateRangeEnd: Array.from(dateMap.keys()).sort().reverse()[0]
    });
    
    filteredStockRequests.forEach(req => {
      if (dateMap.has(req.requestDate)) {
        const log = dateMap.get(req.requestDate)!;
        log.stockRequestLogged = true;
        
        // Set who created stock request
        if (req.requestedByName) {
          log.stockRequestLoggedBy = req.requestedByName;
        } else if (req.requestedBy) {
          // It's an employee ID
          log.stockRequestLoggedBy = req.requestedBy;
        } else {
          log.stockRequestLoggedBy = 'Unknown User';
        }
        
        // Get stock request timestamp from ID (if ID has timestamp prefix)
        const timestamp = req.id.split('-')[0];
        if (timestamp) {
          const timestampNum = parseInt(timestamp);
          // Check if it's a valid timestamp (8-digit or 13-digit Unix timestamp)
          // 8-digit hex timestamp (like "e7fbe25c") won't parse as a valid date
          // So we need to check if it's actually a timestamp
          if (!isNaN(timestampNum) && timestampNum > 1000000000000) {
            log.stockRequestLoggedAt = new Date(timestampNum).toISOString();
            
            // Check if logged late
            const entryDate = new Date(timestampNum);
            const targetDate = new Date(req.requestDate + 'T23:59:59');
            if (entryDate > targetDate) {
              log.lateEntry = true;
            }
          } else {
            // Fallback: Use createdAt timestamp if available
            if (req.createdAt) {
              log.stockRequestLoggedAt = req.createdAt;
              
              // Check if logged late
              const entryDate = new Date(req.createdAt);
              const targetDate = new Date(req.requestDate + 'T23:59:59');
              if (entryDate > targetDate) {
                log.lateEntry = true;
              }
            } else {
              // Final fallback: Use requestDate at noon
              log.stockRequestLoggedAt = new Date(req.requestDate + 'T12:00:00').toISOString();
            }
          }
        } else if (req.createdAt) {
          // If no ID timestamp, use createdAt
          log.stockRequestLoggedAt = req.createdAt;
        }
      }
    });

    // Update status based on inventory, sales, and production.
    // Inventory+Sales are the store side's responsibility; Production is the
    // production incharge's. A production incharge never logs Inventory/Sales, so
    // without accounting for Production here every one of their days showed as
    // "Missing" even on days they'd fully logged their own production - despite
    // Production being one of the columns this same table displays.
    dateMap.forEach((log) => {
      const hasInventory = log.inventoryLogged;
      const hasSales = log.salesLogged;
      const hasProduction = log.productionLogged;

      if ((hasInventory && hasSales) || (hasProduction && !hasInventory && !hasSales)) {
        log.status = 'complete';
      } else if (hasInventory || hasSales || hasProduction) {
        log.status = 'partial';
      } else {
        log.status = 'missing';
      }
    });

    // Convert to array and sort by date descending
    const logsArray = Array.from(dateMap.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    setDailyLogs(logsArray);

    // Calculate period stats
    const stats: PeriodStats = {
      totalDays: logsArray.length,
      daysWithData: logsArray.filter(l => l.status !== 'missing').length,
      totalDiscrepancy: logsArray.reduce((sum, l) => sum + l.cashDiscrepancy, 0),
      avgDiscrepancy: 0,
      completionRate: 0,
      onTimeRate: 0
    };

    stats.avgDiscrepancy = stats.totalDiscrepancy / (logsArray.filter(l => l.salesLogged).length || 1);
    stats.completionRate = (logsArray.filter(l => l.status === 'complete').length / stats.totalDays) * 100;
    stats.onTimeRate = (logsArray.filter(l => l.status === 'complete' && !l.lateEntry).length / stats.totalDays) * 100;

    setPeriodStats(stats);
    setLoading(false);
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return formatDateTimeIST(isoString);
  };

  const formatDate = (dateStr: string) => {
    return formatDateIST(dateStr);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-success-soft text-success';
      case 'partial':
        return 'bg-warning-soft text-warning';
      case 'missing':
        return 'bg-danger-soft text-danger';
      default:
        return 'bg-surface-2 text-text';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'partial':
        return <AlertTriangle className="w-5 h-5 text-warning" />;
      case 'missing':
        return <XCircle className="w-5 h-5 text-danger" />;
      default:
        return <Clock className="w-5 h-5 text-text-2" />;
    }
  };

  const checkDatabaseStockRequests = async () => {
    try {
      // Get access token from user session
      const accessToken = context.user?.accessToken;
      if (!accessToken) {
        toast.error('Not signed in. Please sign in again.');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/debug/stock-keys`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const data = await response.json();
      
      // Check if response has error
      if (data.error) {
        console.error('🐛 Database Debug Error:', data.error);
        toast.error(`Error: ${data.error}`);
        return;
      }
      
      // Check if response has expected structure
      if (!data.stockRequests) {
        console.error('🐛 Unexpected response structure:', data);
        toast.error('Unexpected answer from the server. See the console for details.');
        return;
      }
      
      setDebugInfo(data);
      console.log('🐛 Database Debug Info:', data);
      toast.info(`Stock requests in the database: ${data.stockRequests.count}`, { description: `IDs: ${data.stockRequests.ids.join(', ') || 'none'}. More in the console.` });
    } catch (error) {
      console.error('Error checking database:', error);
      toast.error('Could not check the database. See the console for details.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-surface border border-border">
          <FileText className="w-6 h-6 text-text-2" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">Data Capture Monitor</h1>
          <p className="text-sm sm:text-base text-text-3">Track daily data logging and manager performance</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h2 className="text-lg sm:text-xl font-bold text-text tracking-tight">Select Period</h2>

          {/* Date Range Selector */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRange('day')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'day'
                  ? 'bg-primary-soft text-primary border-2 border-border'
                  : 'bg-surface-2 text-text-2 hover:bg-surface-3'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange('thisMonth')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'thisMonth'
                  ? 'bg-primary-soft text-primary border-2 border-border'
                  : 'bg-surface-2 text-text-2 hover:bg-surface-3'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDateRange('prevMonth')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'prevMonth'
                  ? 'bg-primary-soft text-primary border-2 border-border'
                  : 'bg-surface-2 text-text-2 hover:bg-surface-3'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => setDateRange('thisYear')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'thisYear'
                  ? 'bg-primary-soft text-primary border-2 border-border'
                  : 'bg-surface-2 text-text-2 hover:bg-surface-3'
              }`}
            >
              This Year
            </button>
            <button
              onClick={() => setDateRange('prevYear')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'prevYear'
                  ? 'bg-primary-soft text-primary border-2 border-border'
                  : 'bg-surface-2 text-text-2 hover:bg-surface-3'
              }`}
            >
              Last Year
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'custom'
                  ? 'bg-primary-soft text-primary border-2 border-border'
                  : 'bg-surface-2 text-text-2 hover:bg-surface-3'
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Custom Date Range */}
        {dateRange === 'custom' && (
          <div className="mt-4 flex flex-wrap gap-4">
            <DatePicker
              label="Start Date"
              value={customStartDate}
              onChange={setCustomStartDate}
            />
            <DatePicker
              label="End Date"
              value={customEndDate}
              onChange={setCustomEndDate}
            />
          </div>
        )}


      </div>

      {/* Period Statistics */}
      {periodStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="rounded-lg p-4 text-text bg-surface border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-5 h-5 text-text-2" />
              <div className="text-xs uppercase tracking-wide text-text-2">Total Days</div>
            </div>
            <div className="text-2xl font-semibold">{periodStats.totalDays}</div>
          </div>

          <div className="rounded-lg p-4 text-text bg-surface border border-border">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-5 h-5 text-text-2" />
              <div className="text-xs uppercase tracking-wide text-text-2">Completion Rate</div>
            </div>
            <div className="text-2xl font-semibold">{periodStats.completionRate.toFixed(1)}%</div>
          </div>

          <div className="rounded-lg p-4 text-text bg-surface border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-text-2" />
              <div className="text-xs uppercase tracking-wide text-text-2">On-Time Rate</div>
            </div>
            <div className="text-2xl font-semibold">{periodStats.onTimeRate.toFixed(1)}%</div>
          </div>

          <div className="rounded-lg p-4 text-text bg-surface border border-border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-5 h-5 text-text-2" />
              <div className="text-xs uppercase tracking-wide text-text-2">Total Discrepancy</div>
            </div>
            <div className="text-2xl font-semibold">₹{periodStats.totalDiscrepancy.toFixed(2)}</div>
          </div>

          <div className="rounded-lg p-4 text-text bg-surface border border-border">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-text-2" />
              <div className="text-xs uppercase tracking-wide text-text-2">Avg Discrepancy</div>
            </div>
            <div className="text-2xl font-semibold">₹{periodStats.avgDiscrepancy.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Daily Logs - stacked cards on mobile (the 7-column table doesn't fit a phone
          screen even with horizontal scroll - nothing signals there's more to scroll to,
          so it just looked cut off), a table on larger screens. */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="bg-surface rounded-lg border border-border p-6 text-center text-text-3">
            Loading data...
          </div>
        ) : dailyLogs.length === 0 ? (
          <div className="bg-surface rounded-lg border border-border p-6 text-center text-text-3">
            No data for selected period
          </div>
        ) : (
          dailyLogs.map((log) => (
            <div key={log.date} className="bg-surface rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {log.lateEntry && (
                    <span title="Late Entry">
                      <AlertTriangle className="w-4 h-4 text-primary" />
                    </span>
                  )}
                  <span className="text-sm font-medium text-text">{formatDate(log.date)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {getStatusIcon(log.status)}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(log.status)}`}>
                    {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Expense</span>
                  {log.inventoryLogged ? (
                    <span className="text-text text-right">{log.inventoryCount} items</span>
                  ) : (
                    <span className="text-text-3">Not logged</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Sales</span>
                  <span className={log.salesLogged ? 'text-text' : 'text-text-3'}>
                    {log.salesLogged ? 'Logged' : 'Not logged'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Production</span>
                  <span className={log.productionLogged ? 'text-text' : 'text-text-3'}>
                    {log.productionLogged ? 'Logged' : 'Not logged'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Stock Requests</span>
                  <span className={log.stockRequestLogged ? 'text-text' : 'text-text-3'}>
                    {log.stockRequestLogged ? 'Logged' : 'Not logged'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-3">Cash Discrepancy</span>
                  {log.salesLogged ? (
                    <span className={log.cashDiscrepancy > 500 ? 'text-danger' : 'text-text'}>
                      ₹{log.cashDiscrepancy.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-text-3">-</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden sm:block bg-surface rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-2 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  <span>Expense</span>
                </th>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  Sales
                </th>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  Production
                </th>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  Stock Requests
                </th>
                <th className="px-6 py-3 text-left text-xs text-text-2 uppercase tracking-wider">
                  Cash Discrepancy
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-3">
                    Loading data...
                  </td>
                </tr>
              ) : dailyLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-3">
                    No data for selected period
                  </td>
                </tr>
              ) : (
                dailyLogs.map((log) => (
                  <tr key={log.date} className="hover:bg-surface-2">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {log.lateEntry && (
                          <span title="Late Entry">
                            <AlertTriangle className="w-4 h-4 text-primary" />
                          </span>
                        )}
                        <span className="text-sm text-text">{formatDate(log.date)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(log.status)}`}>
                          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.inventoryLogged ? (
                        <div className="text-sm">
                          <p className="text-text">{log.inventoryCount} items</p>
                          <p className="text-text-3">{formatDateTime(log.inventoryLoggedAt)}</p>
                          {log.inventoryLoggedBy && (
                            <p className="text-xs text-text-3">By: {log.inventoryLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-text-3">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.salesLogged ? (
                        <div className="text-sm">
                          <p className="flex items-center gap-1 text-text"><CheckCircle className="size-4 text-success" aria-hidden="true" />Logged</p>
                          <p className="text-text-3">{formatDateTime(log.salesLoggedAt)}</p>
                          {log.salesLoggedBy && (
                            <p className="text-xs text-text-3">By: {log.salesLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-text-3">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.productionLogged ? (
                        <div className="text-sm">
                          <p className="flex items-center gap-1 text-text"><CheckCircle className="size-4 text-success" aria-hidden="true" />Logged</p>
                          <p className="text-text-3">{formatDateTime(log.productionLoggedAt)}</p>
                          {log.productionLoggedBy && (
                            <p className="text-xs text-text-3">By: {log.productionLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-text-3">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.stockRequestLogged ? (
                        <div className="text-sm">
                          <p className="flex items-center gap-1 text-text"><CheckCircle className="size-4 text-success" aria-hidden="true" />Logged</p>
                          <p className="text-text-3">{formatDateTime(log.stockRequestLoggedAt)}</p>
                          {log.stockRequestLoggedBy && (
                            <p className="text-xs text-text-3">By: {log.stockRequestLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-text-3">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.salesLogged ? (
                        <span className={`text-sm ${log.cashDiscrepancy > 500 ? 'text-danger' : 'text-text'}`}>
                          ₹{log.cashDiscrepancy.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-sm text-text-3">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-surface-2 rounded-lg border border-border p-4">
        <p className="text-sm text-text-2 mb-2">Legend:</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="text-text-2">Complete - Both Inventory AND Sales logged</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-text-2">Partial - At least one data type logged</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-danger" />
            <span className="text-text-2">Missing - No data logged</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <span className="text-text-2">Orange icon = Late entry (logged after midnight)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
