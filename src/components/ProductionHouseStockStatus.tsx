import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Factory, Package } from 'lucide-react';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ListGroup } from './ui/list-row';
import { Progress } from './ui/progress';
import { NativeSelect } from './ui/select';
import { SkeletonListRows, SkeletonStatTiles } from './ui/skeleton';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { getSupabaseClient } from '../utils/supabase/client';
import { getTodayIST, addDays, formatDateIST } from '../utils/timezone';
import { SENT_STATUSES, shippedAtIST, shippedPieces, toISTTimestamp } from '../utils/requestStock';
import { eventsApi, type EventMomoReturn } from '../utils/eventsApi';

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
  // Leftover momos production has counted back in from event stalls (events.ts): back on its stock.
  const [eventReturns, setEventReturns] = useState<EventMomoReturn[]>([]);
  useEffect(() => {
    let cancelled = false;
    eventsApi.momoReturns('received').then((rows) => { if (!cancelled) setEventReturns(rows); }).catch(() => { /* none counted */ });
    return () => { cancelled = true; };
  }, []);
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
      // An event stall's request (events.ts) names its production house itself.
      const fromHouse = (req: any) => houseStoreIds.has(req.storeId) || (!!req.eventId && req.productionHouseId === house.id);
      const shippedInWindow = productionRequests.filter(req => {
        if (!SENT_STATUSES.includes(req.status) || !fromHouse(req)) return false;
        const shippedAt = shippedAtIST(req);
        if (!shippedAt || shippedAt.substring(0, 10) > selectedDate) return false;
        return !fromCount || shippedAt >= count.date;
      });

      // Counted back in on or before the selected day (and after the count it starts from).
      const backInWindow = eventReturns.filter(r => {
        const at = r.receivedAt ? toISTTimestamp(r.receivedAt) : null;
        return r.productionHouseId === house.id && !!at && at.substring(0, 10) <= selectedDate && (!fromCount || at >= count.date);
      });

      const stock = {} as Record<StockKey, ProductStock>;
      STOCK_KEYS.forEach(key => {
        const opening = fromCount ? count.items[key] || 0 : 0;
        const produced = productionInWindow.reduce((sum, prod) => sum + ((prod as any)[`${key}Momos`]?.final || 0), 0);
        const sent = shippedInWindow.reduce((sum, req) => sum + shippedPieces(req, key), 0)
          - backInWindow.reduce((sum, r) => sum + (Number((r.receivedQuantities as any)?.[key]) || 0), 0);
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
  }, [loading, context.productionData, context.stores, productionRequests, productionHouses, selectedDate, stockCounts, eventReturns]);

  const filteredStocks = selectedProductionHouse
    ? productionHouseStocks.filter(s => s.productionHouseId === selectedProductionHouse)
    : productionHouseStocks;

  const productLabels: Record<string, string> = {
    chicken: 'Chicken',
    chickenCheese: 'Chicken cheese',
    veg: 'Veg',
    cheeseCorn: 'Cheese corn',
    paneer: 'Paneer',
    vegKurkure: 'Veg kurkure',
    chickenKurkure: 'Chicken kurkure',
    schezwan: 'Schezwan',
  };
  // Share of this period's stock still at the house: a status only when it is running out.
  const levelChip = (percentage: number) =>
    percentage < 20 ? <StatusChip tone="danger" size="sm">Low</StatusChip> : percentage < 40 ? <StatusChip tone="warning" size="sm">Getting low</StatusChip> : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-title font-semibold text-text">Production house stock</h2>
          <p className="text-body-sm text-text-2">Last stock count + made since − sent to stores since</p>
        </div>
        {onNavigateToManageItems && (context.user?.role === 'manager' || context.user?.role === 'cluster_head') && (
          <Button variant="secondary" size="sm" leadingIcon={<Package />} onClick={onNavigateToManageItems}>Manage items</Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Day">
          <Input type="date" value={selectedDate} max={getTodayIST()} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} />
        </Field>
        <Field label="Production house">
          <NativeSelect value={selectedProductionHouse || 'all'} onChange={(e) => setSelectedProductionHouse(e.target.value === 'all' ? null : e.target.value)}>
            <option value="all">All production houses</option>
            {productionHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
          </NativeSelect>
        </Field>
      </div>

      {loading ? (
        <>
          <SkeletonStatTiles count={4} />
          <SkeletonListRows count={5} leading="none" />
        </>
      ) : filteredStocks.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Factory} title="No production data" body="Nothing for this day and production house." />
        </div>
      ) : (
        filteredStocks.map((houseStock) => (
          <section key={houseStock.productionHouseId} className="flex flex-col gap-3">
            <StatGrid>
              <StatTile label="Made this day" value={<span className="num">{houseStock.totalProduced.toLocaleString('en-IN')}</span>} caption="pieces" />
              <StatTile label="Wastage" value={<span className="num">{houseStock.totalWastage.toFixed(2)}</span>} caption="kg" />
              <StatTile label="Approved entries" value={<span className="num">{houseStock.approvedEntries}</span>} />
              <StatTile label="Waiting for approval" value={<span className="num">{houseStock.pendingApproval}</span>} />
            </StatGrid>
            <ListGroup
              title={houseStock.productionHouseName}
              footer={houseStock.countedOn ? `From the stock count on ${formatDateIST(houseStock.countedOn)}` : 'No stock count on or before this day: from all production and shipments on record'}
            >
              {Object.entries(houseStock.stock).map(([product, data]) => (
                <div key={product} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-md font-medium text-text">{productLabels[product]}</span>
                      <span className="num text-label text-text-3">
                        {houseStock.countedOn ? `Counted ${data.opening} · made since ${data.produced}` : `Made ${data.produced}`} · sent {data.sent}
                      </span>
                    </span>
                    {levelChip(data.percentage)}
                    <span className="num text-body-md font-semibold text-text">{data.available.toLocaleString('en-IN')}</span>
                  </div>
                  <Progress
                    value={Math.min(data.percentage, 100)}
                    tone={data.percentage < 20 ? 'danger' : data.percentage < 40 ? 'warning' : 'primary'}
                    aria-label={`${productLabels[product]}: ${data.percentage.toFixed(0)}% left`}
                  />
                </div>
              ))}
            </ListGroup>
          </section>
        ))
      )}
    </div>
  );
}
