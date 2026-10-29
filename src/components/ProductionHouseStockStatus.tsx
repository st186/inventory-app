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
import { houseExpected, lastCount, type Baseline, type CountRecord } from './stock/countMath';
import { countHistory } from './stock/countData';
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

// Requests are fetched from a week before the earliest count the figures start from (a request
// asked for before the count can ship after it); a house with no count needs the whole history.
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
  // Every stock count per house; the one a day's figures start from is picked per day.
  const [countHistories, setCountHistories] = useState<Record<string, CountRecord[]> | null>(null);
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

  // The last count each house's figures start from on the selected day (not rejected, made by
  // the end of that day).
  const baseFor = (houseId: string): Baseline => lastCount(countHistories?.[houseId] || [], context.inventoryItems || [], `${selectedDate}T23:59:59`);
  const neededFrom = (): string => {
    const days = productionHouses.map(house => baseFor(house.id)?.date.substring(0, 10));
    return days.some(day => !day) ? FULL_HISTORY_FROM : addDays(days.reduce((a, b) => (a! < b! ? a : b))!, -7);
  };

  // Each house's stock counts (also those saved under a linked store's id).
  useEffect(() => {
    if (productionHouses.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const token = await getFreshAccessToken();
      if (!token) {
        console.error('No access token available');
        if (!cancelled) setLoading(false);
        return;
      }
      const histories: Record<string, CountRecord[]> = {};
      for (const house of productionHouses) {
        try {
          histories[house.id] = await countHistory(token, [house.id], 'production_house');
        } catch (error) {
          console.error(`Error fetching the stock counts for ${house.name}:`, error);
        }
      }
      if (!cancelled) setCountHistories(histories);
    })();
    return () => { cancelled = true; };
  }, [productionHouses]);

  // The requests shipped since the earliest count the selected day starts from.
  useEffect(() => {
    if (productionHouses.length === 0 || countHistories === null) return;
    const from = neededFrom();
    if (requestsFrom && requestsFrom <= from) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const token = await getFreshAccessToken();
      try {
        if (token) {
          const requestsData = await api.fetchProductionRequests(token, from);
          if (!cancelled) {
            setProductionRequests(requestsData);
            setRequestsFrom(from);
          }
        }
      } catch (error) {
        console.error('Error loading production requests:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, countHistories, productionHouses]);

  // Stock for each production house at the end of the selected day: its last stock count by then
  // + momos made since (net of kurkure) - shipped since + event leftovers counted back in
  // (stock/countMath.ts, the figure the stock count expects). With no count, everything on record.
  const productionHouseStocks = useMemo(() => {
    if (loading) return [];
    const stocks: ProductionHouseStock[] = [];

    productionHouses.forEach(house => {
      // Older production entries carry the house only in storeId.
      const isHouseEntry = (prod: { productionHouseId?: string; storeId?: string }) =>
        prod.productionHouseId === house.id || (!prod.productionHouseId && prod.storeId === house.id);

      const base = baseFor(house.id);
      const figures = houseExpected({
        base,
        ids: { productionHouseUUID: house.id, effectiveStoreId: house.id, originalStoreId: house.id },
        productionData: context.productionData,
        requests: productionRequests,
        stores: context.stores,
        returns: eventReturns,
        until: selectedDate,
      });

      const stock = {} as Record<StockKey, ProductStock>;
      STOCK_KEYS.forEach(key => {
        const opening = base?.stock[key] || 0;
        const produced = figures.produced[key] || 0;
        const sent = figures.sent[key] || 0;
        const available = Math.max(0, figures.expected[key] || 0);
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
        countedOn: base ? base.date.substring(0, 10) : null,
        stock,
        totalProduced,
        totalWastage,
        approvedEntries,
        pendingApproval,
      });
    });

    return stocks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, context.productionData, context.stores, productionRequests, productionHouses, selectedDate, countHistories, eventReturns]);

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
