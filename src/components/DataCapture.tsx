import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp, TrendingDown, Package, FileText } from 'lucide-react';
import { InventoryContextType } from '../App';
import { DatePicker } from './DatePicker';

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
  const [dateRange, setDateRange] = useState<'day' | 'week' | 'month' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Determine the effective store ID for filtering
  const effectiveStoreId = selectedStoreId || context.user?.storeId;

  useEffect(() => {
    generateDailyLogs();
  }, [context.inventory, context.salesData, context.productionData, context.stockRequests, dateRange, customStartDate, customEndDate, effectiveStoreId]);

  const getDateRangeDates = (): { startDate: Date; endDate: Date } => {
    const today = new Date();
    let startDate = new Date();

    switch (dateRange) {
      case 'day':
        startDate = new Date(today);
        break;
      case 'week':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 1);
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

    return { startDate, endDate: today };
  };

  const generateDailyLogs = () => {
    setLoading(true);
    const { startDate, endDate } = getDateRangeDates();
    const logs: DailyLog[] = [];

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
    const filteredInventory = effectiveStoreId 
      ? context.inventory.filter(inv => inv.storeId === effectiveStoreId)
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
    const filteredSalesData = effectiveStoreId
      ? context.salesData.filter(sale => sale.storeId === effectiveStoreId)
      : context.salesData;
    
    filteredSalesData.forEach(sale => {
      if (dateMap.has(sale.date)) {
        const log = dateMap.get(sale.date)!;
        log.salesLogged = true;
        log.cashDiscrepancy = Math.abs(sale.cashOffset || 0);
        
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
    // Filter production by store FIRST
    const filteredProductionData = effectiveStoreId
      ? context.productionData.filter(prod => prod.storeId === effectiveStoreId)
      : context.productionData;
    
    filteredProductionData.forEach(prod => {
      if (dateMap.has(prod.date)) {
        const log = dateMap.get(prod.date)!;
        log.productionLogged = true;
        
        // Set who logged production
        if (prod.createdByName) {
          log.productionLoggedBy = prod.createdByName;
        } else if (prod.createdByEmail) {
          log.productionLoggedBy = prod.createdByEmail;
        } else if (prod.createdBy) {
          // Check if createdBy is a UUID (contains dashes) - if so, hide it
          const isUUID = typeof prod.createdBy === 'string' && prod.createdBy.includes('-');
          if (isUUID) {
            // Don't show UUID, show 'Manager' instead
            log.productionLoggedBy = 'Manager';
          } else {
            // It's an employee ID like BM001
            log.productionLoggedBy = prod.createdBy;
          }
        } else {
          log.productionLoggedBy = 'Unknown User';
        }
        
        // Get production logged timestamp from ID
        const timestamp = prod.id.split('-')[0];
        if (timestamp) {
          const timestampNum = parseInt(timestamp);
          if (!isNaN(timestampNum) && timestampNum > 0) {
            log.productionLoggedAt = new Date(timestampNum).toISOString();
            
            // Check if logged late
            const entryDate = new Date(timestampNum);
            const targetDate = new Date(prod.date + 'T23:59:59');
            if (entryDate > targetDate) {
              log.lateEntry = true;
            }
          }
        }
      }
    });

    // Process stock request data
    // Filter stock requests by store FIRST
    const filteredStockRequests = effectiveStoreId
      ? context.stockRequests.filter(req => req.storeId === effectiveStoreId)
      : context.stockRequests;
    
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
        
        // Get stock request timestamp from ID
        const timestamp = req.id.split('-')[0];
        if (timestamp) {
          const timestampNum = parseInt(timestamp);
          if (!isNaN(timestampNum) && timestampNum > 0) {
            log.stockRequestLoggedAt = new Date(timestampNum).toISOString();
            
            // Check if logged late
            const entryDate = new Date(timestampNum);
            const targetDate = new Date(req.requestDate + 'T23:59:59');
            if (entryDate > targetDate) {
              log.lateEntry = true;
            }
          }
        }
      }
    });

    // Update status
    dateMap.forEach((log) => {
      if (log.inventoryLogged && log.salesLogged && log.productionLogged && log.stockRequestLogged) {
        log.status = 'complete';
      } else if (log.inventoryLogged || log.salesLogged || log.productionLogged || log.stockRequestLogged) {
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
    const date = new Date(isoString);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr}, ${timeStr}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'missing':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'partial':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'missing':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-gray-900 mb-1">📊 Data Capture Monitor</h2>
            <p className="text-sm text-gray-600">Track daily data logging and manager performance</p>
          </div>

          {/* Date Range Selector */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDateRange('day')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'day'
                  ? 'bg-purple-100 text-purple-800 border-2 border-purple-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange('week')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'week'
                  ? 'bg-purple-100 text-purple-800 border-2 border-purple-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setDateRange('month')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'month'
                  ? 'bg-purple-100 text-purple-800 border-2 border-purple-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                dateRange === 'custom'
                  ? 'bg-purple-100 text-purple-800 border-2 border-purple-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-gray-600">Total Days</p>
            </div>
            <p className="text-2xl text-gray-900">{periodStats.totalDays}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm text-gray-600">Completion Rate</p>
            </div>
            <p className="text-2xl text-gray-900">{periodStats.completionRate.toFixed(1)}%</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-orange-600" />
              <p className="text-sm text-gray-600">On-Time Rate</p>
            </div>
            <p className="text-2xl text-gray-900">{periodStats.onTimeRate.toFixed(1)}%</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <p className="text-sm text-gray-600">Total Discrepancy</p>
            </div>
            <p className="text-2xl text-gray-900">₹{periodStats.totalDiscrepancy.toFixed(2)}</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <p className="text-sm text-gray-600">Avg Discrepancy</p>
            </div>
            <p className="text-2xl text-gray-900">₹{periodStats.avgDiscrepancy.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Daily Logs Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Inventory
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Sales
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Production
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Stock Request
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-700 uppercase tracking-wider">
                  Cash Discrepancy
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Loading data...
                  </td>
                </tr>
              ) : dailyLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No data for selected period
                  </td>
                </tr>
              ) : (
                dailyLogs.map((log) => (
                  <tr key={log.date} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {log.lateEntry && (
                          <AlertTriangle className="w-4 h-4 text-orange-500" title="Late Entry" />
                        )}
                        <span className="text-sm text-gray-900">{formatDate(log.date)}</span>
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
                          <p className="text-gray-900">{log.inventoryCount} items</p>
                          <p className="text-gray-500">{formatDateTime(log.inventoryLoggedAt)}</p>
                          {log.inventoryLoggedBy && (
                            <p className="text-xs text-gray-400">By: {log.inventoryLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.salesLogged ? (
                        <div className="text-sm">
                          <p className="text-gray-900">✓ Logged</p>
                          <p className="text-gray-500">{formatDateTime(log.salesLoggedAt)}</p>
                          {log.salesLoggedBy && (
                            <p className="text-xs text-gray-400">By: {log.salesLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.productionLogged ? (
                        <div className="text-sm">
                          <p className="text-gray-900">✓ Logged</p>
                          <p className="text-gray-500">{formatDateTime(log.productionLoggedAt)}</p>
                          {log.productionLoggedBy && (
                            <p className="text-xs text-gray-400">By: {log.productionLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.stockRequestLogged ? (
                        <div className="text-sm">
                          <p className="text-gray-900">✓ Logged</p>
                          <p className="text-gray-500">{formatDateTime(log.stockRequestLoggedAt)}</p>
                          {log.stockRequestLoggedBy && (
                            <p className="text-xs text-gray-400">By: {log.stockRequestLoggedBy}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not logged</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {log.salesLogged ? (
                        <span className={`text-sm ${log.cashDiscrepancy > 500 ? 'text-red-600' : 'text-gray-900'}`}>
                          ₹{log.cashDiscrepancy.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
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
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-700 mb-2">Legend:</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-gray-600">Complete - All data types logged (Inventory, Sales, Production, Stock Request)</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <span className="text-gray-600">Partial - At least one data type logged</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-gray-600">Missing - No data logged</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-gray-600">Orange icon = Late entry (after midnight)</span>
          </div>
        </div>
      </div>
    </div>
  );
}