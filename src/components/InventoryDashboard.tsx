import { useState, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Factory, Store } from 'lucide-react';
import { CHART_COLORS, ChartLegendChips, ChartTooltipCard, chartAreaFillOpacity, chartAxisProps, chartCursor, chartGridProps } from './ui/chart-theme';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { Money } from './ui/money';
import { SegmentedControl } from './ui/segmented-control';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { INVENTORY_CATEGORIES, expenseCategoryLabel } from '../utils/inventoryData';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

export function InventoryDashboard({ context, stores }: Props) {
  const [timeframe, setTimeframe] = useState<'7days' | '30days' | '90days'>('30days');
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  // Calculate analytics
  const analytics = useMemo(() => {
    const days = timeframe === '7days' ? 7 : timeframe === '30days' ? 30 : 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Production vs Sales comparison
    const productionByDate: Record<string, number> = {};
    const salesByDate: Record<string, number> = {};
    const stockRequestsByDate: Record<string, number> = {};

    context.productionData
      .filter(p => new Date(p.date) >= cutoffDate)
      .forEach(prod => {
        const total = 
          (prod.chickenMomos?.final || 0) +
          (prod.chickenCheeseMomos?.final || 0) +
          (prod.vegMomos?.final || 0) +
          (prod.cheeseCornMomos?.final || 0) +
          (prod.paneerMomos?.final || 0) +
          (prod.vegKurkureMomos?.final || 0) +
          (prod.chickenKurkureMomos?.final || 0);
        
        productionByDate[prod.date] = (productionByDate[prod.date] || 0) + total;
      });

    context.salesData
      .filter(s => new Date(s.date) >= cutoffDate)
      .forEach(sale => {
        const total = (sale.onlineSales || 0) + (sale.offlineSales || 0);
        salesByDate[sale.date] = (salesByDate[sale.date] || 0) + total;
      });

    context.stockRequests
      .filter(r => new Date(r.requestDate) >= cutoffDate)
      .forEach(req => {
        const total = req.fulfilledQuantities 
          ? Object.values(req.fulfilledQuantities).reduce((a, b) => a + b, 0)
          : 0;
        stockRequestsByDate[req.requestDate] = (stockRequestsByDate[req.requestDate] || 0) + total;
      });

    // Create comparison chart data
    const allDates = new Set([
      ...Object.keys(productionByDate),
      ...Object.keys(salesByDate),
      ...Object.keys(stockRequestsByDate),
    ]);

    const comparisonData = Array.from(allDates)
      .sort()
      .map(date => ({
        date,
        production: productionByDate[date] || 0,
        sales: salesByDate[date] || 0,
        stockRequests: stockRequestsByDate[date] || 0,
      }));

    // Calculate inventory turnover
    const totalProduction = Object.values(productionByDate).reduce((a, b) => a + b, 0);
    const totalSales = Object.values(salesByDate).reduce((a, b) => a + b, 0);
    const totalStockRequests = Object.values(stockRequestsByDate).reduce((a, b) => a + b, 0);
    const inventoryTurnover = totalProduction > 0 ? (totalSales / totalProduction) * 100 : 0;

    // Calculate average production efficiency
    const productionDays = Object.keys(productionByDate).length;
    const avgDailyProduction = productionDays > 0 ? totalProduction / productionDays : 0;

    // Calculate stock fulfillment rate
    const totalRequested = context.stockRequests
      .filter(r => new Date(r.requestDate) >= cutoffDate)
      .reduce((sum, req) => {
        return sum + Object.values(req.requestedQuantities).reduce((a, b) => a + b, 0);
      }, 0);

    const fulfillmentRate = totalRequested > 0 ? (totalStockRequests / totalRequested) * 100 : 0;

    // Production House Performance
    const productionHousePerformance = context.productionHouses.map(house => {
      const houseProduction = context.productionData
        .filter(p => p.productionHouseId === house.id && new Date(p.date) >= cutoffDate)
        .reduce((sum, prod) => {
          return sum +
            (prod.chickenMomos?.final || 0) +
            (prod.chickenCheeseMomos?.final || 0) +
            (prod.vegMomos?.final || 0) +
            (prod.cheeseCornMomos?.final || 0) +
            (prod.paneerMomos?.final || 0) +
            (prod.vegKurkureMomos?.final || 0) +
            (prod.chickenKurkureMomos?.final || 0);
        }, 0);

      const houseFulfillments = context.stockRequests
        .filter(r => r.productionHouseId === house.id && r.status === 'fulfilled' && new Date(r.requestDate) >= cutoffDate)
        .length;

      const currentStock = Object.values(house.inventory).reduce((a, b) => a + b, 0);

      return {
        name: house.name,
        production: houseProduction,
        fulfillments: houseFulfillments,
        currentStock,
      };
    });

    // Store Performance
    const storePerformance = stores.map(store => {
      const storeRequests = context.stockRequests.filter(
        r => r.storeId === store.id && new Date(r.requestDate) >= cutoffDate
      );

      const totalRequested = storeRequests.reduce((sum, req) => {
        return sum + Object.values(req.requestedQuantities).reduce((a, b) => a + b, 0);
      }, 0);

      const totalReceived = storeRequests
        .filter(r => r.fulfilledQuantities)
        .reduce((sum, req) => {
          return sum + Object.values(req.fulfilledQuantities!).reduce((a, b) => a + b, 0);
        }, 0);

      const storeSales = context.salesData
        .filter(s => s.storeId === store.id && new Date(s.date) >= cutoffDate)
        .reduce((sum, sale) => sum + (sale.onlineSales || 0) + (sale.offlineSales || 0), 0);

      return {
        name: store.name,
        requested: totalRequested,
        received: totalReceived,
        sales: storeSales,
        fulfillmentRate: totalRequested > 0 ? (totalReceived / totalRequested) * 100 : 0,
      };
    });

    // Inventory cost analysis
    const inventoryCostByCategory: Record<string, number> = {};
    context.inventory
      .filter(item => new Date(item.date) >= cutoffDate)
      .forEach(item => {
        const category = (expenseCategoryLabel(item.category) !== item.category ? expenseCategoryLabel(item.category) : null)
          || item.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        inventoryCostByCategory[category] = (inventoryCostByCategory[category] || 0) + item.totalCost;
      });

    const costData = Object.entries(inventoryCostByCategory).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      comparisonData,
      totalProduction,
      totalSales,
      totalStockRequests,
      inventoryTurnover,
      avgDailyProduction,
      fulfillmentRate,
      productionHousePerformance,
      storePerformance,
      costData,
    };
  }, [context, stores, timeframe]);

  const getHealthIndicator = (value: number, thresholds: { good: number; fair: number }) => {
    if (value >= thresholds.good) return { tone: 'success' as const, label: 'Excellent' };
    if (value >= thresholds.fair) return { tone: 'warning' as const, label: 'Fair' };
    return { tone: 'danger' as const, label: 'Needs attention' };
  };

  const turnoverHealth = getHealthIndicator(analytics.inventoryTurnover, { good: 80, fair: 60 });

  const trendEmpty = analytics.comparisonData.length === 0;
  const costEmpty = analytics.costData.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-title font-semibold text-text">Overview</h2>
          <p className="text-body-sm text-text-2">Production, stock requests and sales over a period</p>
        </div>
        <SegmentedControl
          aria-label="Period"
          size="sm"
          value={timeframe}
          onValueChange={(v) => setTimeframe(v as '7days' | '30days' | '90days')}
          options={[{ value: '7days', label: '7 days' }, { value: '30days', label: '30 days' }, { value: '90days', label: '90 days' }]}
        />
      </div>

      <StatGrid>
        <StatTile label="Production" value={<span className="num">{analytics.totalProduction.toLocaleString('en-IN')}</span>} caption={`About ${Math.round(analytics.avgDailyProduction)} a day`} />
        <StatTile label="Stock requests sent" value={<span className="num">{analytics.totalStockRequests.toLocaleString('en-IN')}</span>} caption={`${analytics.fulfillmentRate.toFixed(1)}% of asked`} />
        <StatTile
          label="Turnover"
          value={<span className="num">{analytics.inventoryTurnover.toFixed(1)}%</span>}
          chip={<StatusChip tone={turnoverHealth.tone} size="sm">{turnoverHealth.label}</StatusChip>}
        />
        <StatTile label="Sales" value={<Money value={analytics.totalSales} />} />
      </StatGrid>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label="Production, sales and stock requests trend">
        <h3 className="text-subtitle font-semibold text-text">Production, sales and stock requests</h3>
        <ChartLegendChips items={[{ label: 'Production', color: CHART_COLORS.primary }, { label: 'Stock requests', color: CHART_COLORS.secondary }, { label: 'Sales (₹)', color: CHART_COLORS.tertiary }]} />
        {trendEmpty ? (
          <EmptyState compact title="Nothing in this period" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={analytics.comparisonData} margin={{ left: -12, right: 8 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="date" {...chartAxisProps} minTickGap={24} />
              <YAxis {...chartAxisProps} width={56} />
              <Tooltip content={<ChartTooltipCard />} cursor={chartCursor} />
              <Area type="monotone" dataKey="production" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={chartAreaFillOpacity} strokeWidth={2} name="Production" />
              <Area type="monotone" dataKey="stockRequests" stroke={CHART_COLORS.secondary} fill={CHART_COLORS.secondary} fillOpacity={chartAreaFillOpacity} strokeWidth={2} name="Stock requests" />
              <Area type="monotone" dataKey="sales" stroke={CHART_COLORS.tertiary} fill={CHART_COLORS.tertiary} fillOpacity={chartAreaFillOpacity} strokeWidth={2} name="Sales" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ListGroup title="Production houses" empty={<EmptyState compact icon={Factory} title="No production houses" />}>
          {analytics.productionHousePerformance.map((house) => (
            <ListRow
              key={house.name}
              icon={Factory}
              title={house.name}
              subtitle={`Made ${house.production.toLocaleString('en-IN')} · ${house.fulfillments} requests fulfilled`}
              trailing={<StatusChip tone="neutral" size="sm">{house.currentStock} in stock</StatusChip>}
            />
          ))}
        </ListGroup>
        <ListGroup title="Stores" empty={<EmptyState compact icon={Store} title="No stores" />}>
          {analytics.storePerformance.map((store) => (
            <ListRow
              key={store.name}
              icon={Store}
              title={store.name}
              subtitle={`Asked ${store.requested} · received ${store.received} · sales ₹${store.sales.toLocaleString('en-IN')}`}
              trailing={<StatusChip tone={store.fulfillmentRate >= 90 ? 'success' : store.fulfillmentRate >= 70 ? 'warning' : 'danger'} size="sm">{store.fulfillmentRate.toFixed(0)}% fulfilled</StatusChip>}
            />
          ))}
        </ListGroup>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label="Spending by category">
        <h3 className="text-subtitle font-semibold text-text">Spending by category</h3>
        {costEmpty ? (
          <EmptyState compact title="No purchases in this period" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, analytics.costData.length * 36)}>
            <BarChart data={analytics.costData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid {...chartGridProps} vertical horizontal={false} />
              <XAxis type="number" {...chartAxisProps} />
              <YAxis type="category" dataKey="name" {...chartAxisProps} width={120} />
              <Tooltip content={<ChartTooltipCard money />} cursor={chartCursor} />
              <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} name="Spent" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}
