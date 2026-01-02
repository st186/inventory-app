import { useState, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Package, AlertTriangle, Activity, Target, DollarSign } from 'lucide-react';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';

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
        const category = item.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    if (value >= thresholds.good) return { color: 'text-green-600', bg: 'bg-green-100', label: 'Excellent' };
    if (value >= thresholds.fair) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Fair' };
    return { color: 'text-red-600', bg: 'bg-red-100', label: 'Needs Attention' };
  };

  const turnoverHealth = getHealthIndicator(analytics.inventoryTurnover, { good: 80, fair: 60 });
  const fulfillmentHealth = getHealthIndicator(analytics.fulfillmentRate, { good: 90, fair: 70 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl">Inventory Dashboard</h2>
            <p className="text-muted-foreground">Advanced analytics and performance metrics</p>
          </div>
        </div>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as any)}
          className="px-4 py-2 border rounded-lg bg-background"
        >
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="90days">Last 90 Days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Total Production</p>
            <Package className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-2xl mb-1">{analytics.totalProduction.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">
            Avg: {Math.round(analytics.avgDailyProduction)}/day
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Stock Requests</p>
            <TrendingUp className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-2xl mb-1">{analytics.totalStockRequests.toLocaleString()}</p>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${fulfillmentHealth.bg.replace('bg-', 'bg-')}`} />
            <p className={`text-xs ${fulfillmentHealth.color}`}>
              {analytics.fulfillmentRate.toFixed(1)}% fulfilled
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Inventory Turnover</p>
            <Target className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl mb-1">{analytics.inventoryTurnover.toFixed(1)}%</p>
          <div className="flex items-center gap-2">
            <Badge className={`${turnoverHealth.bg} ${turnoverHealth.color} text-xs`}>
              {turnoverHealth.label}
            </Badge>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Total Sales</p>
            <DollarSign className="h-5 w-5 text-orange-600" />
          </div>
          <p className="text-2xl mb-1">₹{analytics.totalSales.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Revenue from sales</p>
        </Card>
      </div>

      {/* Production vs Sales Chart */}
      <Card className="p-6">
        <h3 className="text-lg mb-4">Production, Sales & Stock Requests Trend</h3>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={analytics.comparisonData}>
            <defs>
              <linearGradient id="colorProduction" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="production" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorProduction)" name="Production" />
            <Area type="monotone" dataKey="stockRequests" stroke="#10b981" fillOpacity={1} fill="url(#colorStock)" name="Stock Requests" />
            <Area type="monotone" dataKey="sales" stroke="#ec4899" fillOpacity={1} fill="url(#colorSales)" name="Sales" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Performance Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Production House Performance */}
        <Card className="p-6">
          <h3 className="text-lg mb-4">Production House Performance</h3>
          <div className="space-y-3">
            {analytics.productionHousePerformance.map(house => (
              <div key={house.name} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm">{house.name}</h4>
                  <Badge className="bg-purple-100 text-purple-800">
                    {house.currentStock} in stock
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Production</p>
                    <p className="text-lg">{house.production.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fulfillments</p>
                    <p className="text-lg">{house.fulfillments}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Store Performance */}
        <Card className="p-6">
          <h3 className="text-lg mb-4">Store Performance</h3>
          <div className="space-y-3">
            {analytics.storePerformance.map(store => (
              <div key={store.name} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm">{store.name}</h4>
                  <Badge className={`${
                    store.fulfillmentRate >= 90 ? 'bg-green-100 text-green-800' :
                    store.fulfillmentRate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {store.fulfillmentRate.toFixed(0)}% fulfilled
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Requested</p>
                    <p className="text-lg">{store.requested}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Received</p>
                    <p className="text-lg">{store.received}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sales</p>
                    <p className="text-lg">₹{store.sales.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Inventory Cost Analysis */}
      <Card className="p-6">
        <h3 className="text-lg mb-4">Inventory Cost by Category</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analytics.costData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#ec4899" name="Cost (₹)" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
