import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package, TrendingUp, TrendingDown, Calendar, Factory, Info } from 'lucide-react';
import { Card } from './ui/card';
import { getSupabaseClient } from '../utils/supabase/client';
import { QuickAddInventoryItem } from './QuickAddInventoryItem';
import { getTodayIST, addDays, formatDateIST } from '../utils/timezone';
import { SENT_STATUSES, shippedAtIST, shippedPieces } from '../utils/requestStock';

type Props = {
  context: InventoryContextType;
  productionHouses: api.ProductionHouse[];
  onNavigateToManageItems?: () => void;
};

type ProductStock = { opening: number; produced: number; sent: number; available: number; percentage: number };

const STOCK_KEYS = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure', 'schezwan'] as const;
type StockKey = typeof STOCK_KEYS[number];

type ProductionHouseStock = {
  productionHouseId: string;
  productionHouseName: string;
  date: string;
  countedOn: string | null; // IST day of the stock count the figures start from, if any
  stock: Record<StockKey, ProductStock>;
  totalProduced: number;
  totalWastage: number;
  approvedEntries: number;
  pendingApproval: number;
};

// A production house's last stock count (recalibration), mapped to stock keys.
type StockCount = { date: string; isOpeningBalance: boolean; items: Record<string, number> };

// Requests are fetched from a week before the earliest count (a request asked for before the
// count can ship after it); a house with no count at all needs the whole history.
const FULL_HISTORY_FROM = '2020-01-01';

export function ProductionHouseStockStatus({ context, productionHouses, onNavigateToManageItems }: Props) {
  const [selectedDate, setSelectedDate] = useState(getTodayIST());
  const [selectedProductionHouse, setSelectedProductionHouse] = useState<string | null>(null);
  const [productionRequests, setProductionRequests] = useState<api.ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockCounts, setStockCounts] = useState<Record<string, StockCount>>({});
  const [requestsFrom, setRequestsFrom] = useState<string | null>(null);

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

  // Each house's last stock count, then the requests shipped since the earliest of them.
  useEffect(() => {
    if (productionHouses.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const token = await getFreshAccessToken();
      if (!token) {
        console.error('No access token available');
        if (!cancelled) setLoading(false);
        return;
      }

      // Map camelCase item names from the count to the stock keys used here.
      const keyMapping: Record<string, StockKey> = {
        chickenMomo: 'chicken',
        chickenCheeseMomo: 'chickenCheese',
        vegMomo: 'veg',
        cheeseCornMomo: 'cheeseCorn',
        paneerMomo: 'paneer',
        vegKurkureMomo: 'vegKurkure',
        chickenKurkureMomo: 'chickenKurkure',
        schezwanMomo: 'schezwan',
      };
      const counts: Record<string, StockCount> = {};
      for (const house of productionHouses) {
        try {
          const recalResponse = await api.getLastRecalibration(token, house.id, 'production_house');
          const record = recalResponse?.record;
          // A rejected count is not a count to start from.
          if (!record?.date || record.status === 'rejected') continue;
          const items: Record<string, number> = {};
          (record.items || []).forEach((item: any) => {
            // itemId can be either the item's id or its name
            const inventoryItem = context.inventoryItems?.find(invItem => invItem.id === item.itemId || invItem.name === item.itemId);
            const name: string = inventoryItem?.name || item.itemId || '';
            const camelKey = name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            const key = keyMapping[camelKey] || camelKey;
            if ((STOCK_KEYS as readonly string[]).includes(key)) items[key] = Number(item.actualQuantity) || 0;
          });
          // The record's date is stored as IST wall-clock time.
          counts[house.id] = {
            date: record.date,
            isOpeningBalance: record.isOpeningBalance ?? record.date.substring(8, 10) === '01',
            items,
          };
        } catch (error) {
          console.error(`Error fetching the last stock count for ${house.name}:`, error);
        }
      }

      const countDays = productionHouses.map(house => counts[house.id]?.date.substring(0, 10));
      const from = countDays.some(day => !day)
        ? FULL_HISTORY_FROM
        : addDays(countDays.reduce((a, b) => (a! < b! ? a : b))!, -7);
      try {
        const requestsData = await api.fetchProductionRequests(token, from);
        if (!cancelled) {
          setProductionRequests(requestsData);
          setRequestsFrom(from);
        }
      } catch (error) {
        console.error('Error loading production requests:', error);
      }
      if (!cancelled) {
        setStockCounts(counts);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [productionHouses, context.inventoryItems]);

  // A date before a house's last count is worked out from all records, so it needs the
  // shipments from before the count too.
  useEffect(() => {
    if (!requestsFrom || requestsFrom === FULL_HISTORY_FROM) return;
    const needsHistory = productionHouses.some(house => {
      const countDay = stockCounts[house.id]?.date.substring(0, 10);
      return !countDay || countDay > selectedDate;
    });
    if (!needsHistory) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const token = await getFreshAccessToken();
      try {
        if (token) {
          const requestsData = await api.fetchProductionRequests(token, FULL_HISTORY_FROM);
          if (!cancelled) {
            setProductionRequests(requestsData);
            setRequestsFrom(FULL_HISTORY_FROM);
          }
        }
      } catch (error) {
        console.error('Error loading production requests:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, requestsFrom, stockCounts, productionHouses]);

  // Stock for each production house on the selected date: its last stock count (if made on or
  // before that date) + production since the count - momos shipped to its stores since the
  // count. With no count, everything on record up to the date.
  const productionHouseStocks = useMemo(() => {
    if (loading) return [];
    const stocks: ProductionHouseStock[] = [];

    productionHouses.forEach(house => {
      // Older production entries carry the house only in storeId.
      const isHouseEntry = (prod: { productionHouseId?: string; storeId?: string }) =>
        prod.productionHouseId === house.id || (!prod.productionHouseId && prod.storeId === house.id);

      const count = stockCounts[house.id];
      const countDay = count?.date.substring(0, 10) || null;
      const fromCount = !!count && !!countDay && countDay <= selectedDate;

      // A count on the 1st is that month's opening balance, so that day's production comes
      // after it; a mid-month count may have been made after the day's production, so that
      // day is left out (same rule as Monthly Stock Recalibration).
      const productionInWindow = context.productionData.filter(prod => {
        if (!isHouseEntry(prod) || prod.date > selectedDate) return false;
        if (!fromCount) return true;
        return count.isOpeningBalance ? prod.date >= countDay! : prod.date > countDay!;
      });

      // Momos have left the production house once shipped (in transit and part shipments count),
      // in the shipped amounts.
      const houseStoreIds = new Set(context.stores.filter(s => s.productionHouseId === house.id).map(s => s.id));
      const shippedInWindow = productionRequests.filter(req => {
        if (!SENT_STATUSES.includes(req.status) || !houseStoreIds.has(req.storeId)) return false;
        const shippedAt = shippedAtIST(req);
        if (!shippedAt || shippedAt.substring(0, 10) > selectedDate) return false;
        return !fromCount || shippedAt >= count.date;
      });

      const stock = {} as Record<StockKey, ProductStock>;
      STOCK_KEYS.forEach(key => {
        const opening = fromCount ? count.items[key] || 0 : 0;
        const produced = productionInWindow.reduce((sum, prod) => sum + ((prod as any)[`${key}Momos`]?.final || 0), 0);
        const sent = shippedInWindow.reduce((sum, req) => sum + shippedPieces(req, key), 0);
        const available = Math.max(0, opening + produced - sent);
        const total = opening + produced;
        stock[key] = { opening, produced, sent, available, percentage: total > 0 ? (available / total) * 100 : 0 };
      });

      // Production for the selected date only
      const todayProduction = context.productionData.find(
        prod => isHouseEntry(prod) && prod.date === selectedDate
      );
      const totalProduced = todayProduction
        ? STOCK_KEYS.reduce((sum, key) => sum + ((todayProduction as any)[`${key}Momos`]?.final || 0), 0)
        : 0;
      const totalWastage = todayProduction ? (
        (todayProduction.wastage?.dough || 0) +
        (todayProduction.wastage?.stuffing || 0) +
        (todayProduction.wastage?.batter || 0) +
        (todayProduction.wastage?.coating || 0)
      ) : 0;

      const approvedEntries = context.productionData.filter(
        prod => isHouseEntry(prod) &&
        prod.date === selectedDate &&
        prod.approvalStatus === 'approved'
      ).length;

      const pendingApproval = context.productionData.filter(
        prod => isHouseEntry(prod) &&
        prod.date === selectedDate &&
        prod.approvalStatus === 'pending'
      ).length;

      stocks.push({
        productionHouseId: house.id,
        productionHouseName: house.name,
        date: selectedDate,
        countedOn: fromCount ? countDay : null,
        stock,
        totalProduced,
        totalWastage,
        approvedEntries,
        pendingApproval,
      });
    });

    return stocks;
  }, [loading, context.productionData, context.stores, productionRequests, productionHouses, selectedDate, stockCounts]);

  const filteredStocks = selectedProductionHouse
    ? productionHouseStocks.filter(s => s.productionHouseId === selectedProductionHouse)
    : productionHouseStocks;

  const productLabels: Record<string, string> = {
    chicken: 'Chicken Momos',
    chickenCheese: 'Chicken Cheese Momos',
    veg: 'Veg Momos',
    cheeseCorn: 'Cheese Corn Momos',
    paneer: 'Paneer Momos',
    vegKurkure: 'Veg Kurkure Momos',
    chickenKurkure: 'Chicken Kurkure Momos',
    schezwan: 'Schezwan Momos',
  };

  const getStockColor = (percentage: number) => {
    if (percentage >= 80) return { bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', text: 'text-orange-700' };
    if (percentage >= 60) return { bg: 'bg-rose-50', border: 'border-rose-200', bar: 'bg-rose-500', text: 'text-rose-700' };
    if (percentage >= 40) return { bg: 'bg-green-50', border: 'border-green-200', bar: 'bg-green-500', text: 'text-green-700' };
    if (percentage >= 20) return { bg: 'bg-yellow-50', border: 'border-yellow-200', bar: 'bg-yellow-500', text: 'text-yellow-700' };
    return { bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', text: 'text-red-700' };
  };

  return (
    <div className="space-y-6">
      {/* Info Banner about Dynamic Inventory Items */}
      <Card className="p-4 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-orange-900 mb-1">Dynamic Inventory Items</h3>
            <p className="text-sm text-orange-700 mb-2">
              You can now add custom production items beyond the default 7 momo types! 
              Manage all items from the <strong>"Manage Items"</strong> page in the navigation.
            </p>
            <p className="text-xs text-orange-600">
              💡 Items can be production house-specific or global (available to all facilities)
            </p>
          </div>
        </div>
      </Card>

      {/* Header with Date Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
            <Factory className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Production House Stock Status</h1>
            <p className="text-sm sm:text-base text-gray-500">
              Last stock count + produced since - sent to stores since (shipped requests)
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={getTodayIST()}
              className="px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <select
            value={selectedProductionHouse || 'all'}
            onChange={(e) => setSelectedProductionHouse(e.target.value === 'all' ? null : e.target.value)}
            className="px-4 py-2 border rounded-lg bg-background"
          >
            <option value="all">All Production Houses</option>
            {productionHouses.map(house => (
              <option key={house.id} value={house.id}>{house.name}</option>
            ))}
          </select>
          {onNavigateToManageItems && (context.user?.role === 'manager' || context.user?.role === 'cluster_head') && (
            <button
              onClick={onNavigateToManageItems}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
            >
              <Package className="w-4 h-4" />
              <span className="text-sm font-semibold">Manage Items</span>
            </button>
          )}
        </div>
      </div>

      {filteredStocks.map(houseStock => (
        <div key={houseStock.productionHouseId} className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-5 w-5" />
                <div className="text-xs uppercase tracking-wide text-orange-100">Total Production</div>
              </div>
              <div className="text-2xl font-semibold">{houseStock.totalProduced.toLocaleString()}</div>
              <div className="text-xs text-orange-100 mt-1">pieces</div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5" />
                <div className="text-xs uppercase tracking-wide text-red-100">Total Wastage</div>
              </div>
              <div className="text-2xl font-semibold">{houseStock.totalWastage.toFixed(2)}</div>
              <div className="text-xs text-red-100 mt-1">kg</div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5" />
                <div className="text-xs uppercase tracking-wide text-emerald-100">Approved Entries</div>
              </div>
              <div className="text-2xl font-semibold">{houseStock.approvedEntries}</div>
              <div className="text-xs text-emerald-100 mt-1">records</div>
            </div>

            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 shadow-lg shadow-yellow-500/20 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5" />
                <div className="text-xs uppercase tracking-wide text-yellow-100">Pending Approval</div>
              </div>
              <div className="text-2xl font-semibold">{houseStock.pendingApproval}</div>
              <div className="text-xs text-yellow-100 mt-1">records</div>
            </div>
          </div>

          {/* Stock Status Section */}
          <Card className="p-6 rounded-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Factory className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                {houseStock.productionHouseName} - Stock Status
              </h3>
            </div>
            <p className="text-xs text-muted-foreground -mt-2 mb-4">
              {houseStock.countedOn
                ? `From the stock count on ${formatDateIST(houseStock.countedOn)}`
                : 'No stock count on or before this date - from all production and shipments on record'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Object.entries(houseStock.stock).map(([product, data]) => {
                const colors = getStockColor(data.percentage);

                return (
                  <div
                    key={product}
                    className={`p-4 rounded-xl border-2 ${colors.bg} ${colors.border}`}
                  >
                    <h4 className="text-sm font-semibold mb-3">{productLabels[product]}</h4>
                    
                    <div className="space-y-2 text-sm">
                      {houseStock.countedOn && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Counted:</span>
                          <span>{data.opening}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{houseStock.countedOn ? 'Produced since:' : 'Produced:'}</span>
                        <span className={colors.text}>{data.produced}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Sent to Stores:</span>
                        <span className="text-red-600">{data.sent}</span>
                      </div>
                      
                      <div className="border-t pt-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="">Stock Available:</span>
                          <span className={`text-lg ${colors.text}`}>{data.available}</span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{data.percentage.toFixed(0)}% remaining</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${colors.bar} transition-all duration-300`}
                              style={{ width: `${Math.min(data.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ))}

      {/* Empty State */}
      {filteredStocks.length === 0 && (
        <Card className="p-12 rounded-2xl text-center">
          <Factory className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-2">No Production Data</h3>
          <p className="text-muted-foreground">
            No production data available for the selected date and production house
          </p>
        </Card>
      )}
    </div>
  );
}