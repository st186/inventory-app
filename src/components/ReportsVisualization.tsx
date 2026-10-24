import { useState, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FileText, Download, TrendingUp, DollarSign, Package, Users, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { INVENTORY_CATEGORIES, expenseCategoryLabel } from '../utils/inventoryData';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

export function ReportsVisualization({ context, stores }: Props) {
  const [reportType, setReportType] = useState<'sales' | 'inventory' | 'production' | 'financial'>('sales');
  const [dateRange, setDateRange] = useState<'7days' | '30days' | '90days'>('30days');

  // Calculate date range
  const getDateFilter = () => {
    const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return cutoffDate;
  };

  // Sales Analytics
  const salesAnalytics = useMemo(() => {
    const cutoff = getDateFilter();
    const filteredSales = context.salesData.filter(
      sale => new Date(sale.date) >= cutoff
    );

    // Daily sales trend
    const dailySales: Record<string, { date: string; total: number; online: number; offline: number }> = {};
    
    filteredSales.forEach(sale => {
      if (!dailySales[sale.date]) {
        dailySales[sale.date] = {
          date: sale.date,
          total: 0,
          online: 0,
          offline: 0,
        };
      }
      dailySales[sale.date].total += (sale.onlineSales || 0) + (sale.offlineSales || 0);
      dailySales[sale.date].online += sale.onlineSales || 0;
      dailySales[sale.date].offline += sale.offlineSales || 0;
    });

    const salesTrend = Object.values(dailySales).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Store-wise sales
    const storeSales: Record<string, number> = {};
    filteredSales.forEach(sale => {
      const storeName = stores.find(s => s.id === sale.storeId)?.name || 'Unknown';
      storeSales[storeName] = (storeSales[storeName] || 0) + 
        ((sale.onlineSales || 0) + (sale.offlineSales || 0));
    });

    const storeWiseSales = Object.entries(storeSales).map(([name, value]) => ({
      name,
      value,
    }));

    // Total metrics
    const totalRevenue = filteredSales.reduce((sum, sale) => 
      sum + (sale.onlineSales || 0) + (sale.offlineSales || 0), 0
    );
    const avgDailySales = salesTrend.length > 0 ? totalRevenue / salesTrend.length : 0;
    const totalTransactions = filteredSales.length;

    return {
      salesTrend,
      storeWiseSales,
      totalRevenue,
      avgDailySales,
      totalTransactions,
    };
  }, [context.salesData, stores, dateRange]);

  // Production Analytics
  const productionAnalytics = useMemo(() => {
    const cutoff = getDateFilter();
    const filteredProduction = context.productionData.filter(
      prod => new Date(prod.date) >= cutoff
    );

    // Product-wise production
    const productionByType: Record<string, number> = {
      'Chicken Momos': 0,
      'Chicken Cheese': 0,
      'Veg Momos': 0,
      'Cheese Corn': 0,
      'Paneer Momos': 0,
      'Veg Kurkure': 0,
      'Chicken Kurkure': 0,
    };

    filteredProduction.forEach(prod => {
      productionByType['Chicken Momos'] += prod.chickenMomos?.final || 0;
      productionByType['Chicken Cheese'] += prod.chickenCheeseMomos?.final || 0;
      productionByType['Veg Momos'] += prod.vegMomos?.final || 0;
      productionByType['Cheese Corn'] += prod.cheeseCornMomos?.final || 0;
      productionByType['Paneer Momos'] += prod.paneerMomos?.final || 0;
      productionByType['Veg Kurkure'] += prod.vegKurkureMomos?.final || 0;
      productionByType['Chicken Kurkure'] += prod.chickenKurkureMomos?.final || 0;
    });

    const productionData = Object.entries(productionByType)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));

    // Wastage analysis
    const totalWastage = filteredProduction.reduce((sum, prod) => {
      return sum + 
        (prod.wastage?.dough || 0) +
        (prod.wastage?.stuffing || 0) +
        (prod.wastage?.batter || 0) +
        (prod.wastage?.coating || 0);
    }, 0);

    const totalProduction = Object.values(productionByType).reduce((a, b) => a + b, 0);
    const wastagePercentage = totalProduction > 0 ? (totalWastage / totalProduction) * 100 : 0;

    return {
      productionData,
      totalProduction,
      totalWastage,
      wastagePercentage,
    };
  }, [context.productionData, dateRange]);

  // Inventory Analytics
  const inventoryAnalytics = useMemo(() => {
    const cutoff = getDateFilter();
    const filteredInventory = context.inventory.filter(
      item => new Date(item.date) >= cutoff
    );

    // Category-wise spending
    const categorySpending: Record<string, number> = {};
    filteredInventory.forEach(item => {
      const category = (expenseCategoryLabel(item.category) !== item.category ? expenseCategoryLabel(item.category) : null)
        || item.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      categorySpending[category] = (categorySpending[category] || 0) + item.totalCost;
    });

    const categoryData = Object.entries(categorySpending).map(([name, value]) => ({
      name,
      value,
    }));

    const totalInventoryCost = Object.values(categorySpending).reduce((a, b) => a + b, 0);
    const avgItemCost = filteredInventory.length > 0 ? totalInventoryCost / filteredInventory.length : 0;

    return {
      categoryData,
      totalInventoryCost,
      avgItemCost,
      itemCount: filteredInventory.length,
    };
  }, [context.inventory, dateRange]);

  // Financial Analytics
  const financialAnalytics = useMemo(() => {
    const cutoff = getDateFilter();
    
    const revenue = context.salesData
      .filter(sale => new Date(sale.date) >= cutoff)
      .reduce((sum, sale) => sum + (sale.onlineSales || 0) + (sale.offlineSales || 0), 0);

    const inventoryCost = context.inventory
      .filter(item => new Date(item.date) >= cutoff)
      .reduce((sum, item) => sum + item.totalCost, 0);

    const overheadCost = context.overheads
      .filter(item => new Date(item.date) >= cutoff)
      .reduce((sum, item) => sum + item.amount, 0);

    const fixedCost = context.fixedCosts
      .filter(item => new Date(item.date) >= cutoff)
      .reduce((sum, item) => sum + item.amount, 0);

    const totalCosts = inventoryCost + overheadCost + fixedCost;
    const grossProfit = revenue - totalCosts;
    const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const costBreakdown = [
      { name: 'Inventory', value: inventoryCost },
      { name: 'Overhead', value: overheadCost },
      { name: 'Fixed Costs', value: fixedCost },
    ];

    return {
      revenue,
      totalCosts,
      grossProfit,
      profitMargin,
      costBreakdown,
    };
  }, [context.salesData, context.inventory, context.overheads, context.fixedCosts, dateRange]);

  const COLORS = ['#14b8a6', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

  const handleExport = () => {
    const data = {
      reportType,
      dateRange,
      generatedAt: new Date().toISOString(),
      salesAnalytics,
      productionAnalytics,
      inventoryAnalytics,
      financialAnalytics,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bhandar-report-${reportType}-${dateRange}-${getTodayIST()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Reports & Analytics</h1>
            <p className="text-sm sm:text-base text-gray-500">Comprehensive business insights and reports</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-4 py-2 border rounded-lg bg-background"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>
          <Button onClick={handleExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={reportType} onValueChange={(v) => setReportType(v as any)}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        {/* Sales Report */}
        <TabsContent value="sales" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-emerald-100">Total Revenue</div>
                <DollarSign className="h-5 w-5 text-emerald-100" />
              </div>
              <div className="text-2xl font-semibold">₹{salesAnalytics.totalRevenue.toLocaleString()}</div>
              <div className="text-xs text-emerald-100 mt-1">
                Avg: ₹{Math.round(salesAnalytics.avgDailySales).toLocaleString()}/day
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-blue-100">Transactions</div>
                <TrendingUp className="h-5 w-5 text-blue-100" />
              </div>
              <div className="text-2xl font-semibold">{salesAnalytics.totalTransactions}</div>
              <div className="text-xs text-blue-100 mt-1">Total sales entries</div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-amber-100">Active Stores</div>
                <Package className="h-5 w-5 text-amber-100" />
              </div>
              <div className="text-2xl font-semibold">{salesAnalytics.storeWiseSales.length}</div>
              <div className="text-xs text-amber-100 mt-1">Contributing to revenue</div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 rounded-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Sales Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesAnalytics.salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="online" stroke="#14b8a6" strokeWidth={2} name="Online" />
                  <Line type="monotone" dataKey="offline" stroke="#f43f5e" strokeWidth={2} name="Offline" />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} name="Total" />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6 rounded-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Store-wise Sales</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={salesAnalytics.storeWiseSales}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {salesAnalytics.storeWiseSales.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </TabsContent>

        {/* Production Report */}
        <TabsContent value="production" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-blue-100">Total Production</div>
                <Package className="h-5 w-5 text-blue-100" />
              </div>
              <div className="text-2xl font-semibold">{productionAnalytics.totalProduction.toLocaleString()}</div>
              <div className="text-xs text-blue-100 mt-1">Total units produced</div>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-orange-100">Total Wastage</div>
                <TrendingUp className="h-5 w-5 text-orange-100" />
              </div>
              <div className="text-2xl font-semibold">{productionAnalytics.totalWastage.toLocaleString()}</div>
              <div className="text-xs text-orange-100 mt-1">
                {productionAnalytics.wastagePercentage.toFixed(2)}% of production
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 shadow-lg shadow-purple-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-purple-100">Product Varieties</div>
                <Users className="h-5 w-5 text-purple-100" />
              </div>
              <div className="text-2xl font-semibold">{productionAnalytics.productionData.length}</div>
              <div className="text-xs text-purple-100 mt-1">Types being produced</div>
            </div>
          </div>

          <Card className="p-6 rounded-2xl">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Production by Product Type</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={productionAnalytics.productionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#14b8a6" name="Units Produced" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-4 shadow-lg shadow-rose-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-rose-100">Total Cost</div>
                <DollarSign className="h-5 w-5 text-rose-100" />
              </div>
              <div className="text-2xl font-semibold">₹{inventoryAnalytics.totalInventoryCost.toLocaleString()}</div>
              <div className="text-xs text-rose-100 mt-1">Total inventory spending</div>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-blue-100">Items Purchased</div>
                <Package className="h-5 w-5 text-blue-100" />
              </div>
              <div className="text-2xl font-semibold">{inventoryAnalytics.itemCount}</div>
              <div className="text-xs text-blue-100 mt-1">
                Avg: ₹{Math.round(inventoryAnalytics.avgItemCost).toLocaleString()}/item
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-amber-100">Categories</div>
                <Calendar className="h-5 w-5 text-amber-100" />
              </div>
              <div className="text-2xl font-semibold">{inventoryAnalytics.categoryData.length}</div>
              <div className="text-xs text-amber-100 mt-1">Active categories</div>
            </div>
          </div>

          <Card className="p-6 rounded-2xl">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Spending by Category</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={inventoryAnalytics.categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#f43f5e" name="Amount (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        {/* Financial Report */}
        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-emerald-100">Revenue</div>
                <DollarSign className="h-5 w-5 text-emerald-100" />
              </div>
              <div className="text-2xl font-semibold">₹{financialAnalytics.revenue.toLocaleString()}</div>
              <div className="text-xs text-emerald-100 mt-1">+Income</div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-red-100">Total Costs</div>
                <DollarSign className="h-5 w-5 text-red-100" />
              </div>
              <div className="text-2xl font-semibold">₹{financialAnalytics.totalCosts.toLocaleString()}</div>
              <div className="text-xs text-red-100 mt-1">-Expenses</div>
            </div>

            <div className={`bg-gradient-to-br ${financialAnalytics.grossProfit >= 0 ? 'from-blue-500 to-blue-600 shadow-blue-500/20' : 'from-red-500 to-red-600 shadow-red-500/20'} rounded-xl p-4 shadow-lg text-white`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-white/80">Gross Profit</div>
                <TrendingUp className="h-5 w-5 text-white/80" />
              </div>
              <div className="text-2xl font-semibold">₹{financialAnalytics.grossProfit.toLocaleString()}</div>
              <div className="text-xs text-white/80 mt-1">
                Net margin
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs uppercase tracking-wide text-amber-100">Profit Margin</div>
                <TrendingUp className="h-5 w-5 text-amber-100" />
              </div>
              <div className="text-2xl font-semibold">{financialAnalytics.profitMargin.toFixed(1)}%</div>
              <div className="text-xs text-amber-100 mt-1">Profit ratio</div>
            </div>
          </div>

          <Card className="p-6 rounded-2xl">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Cost Breakdown</h3>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={financialAnalytics.costBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, value, percent }) => `${name}: ₹${value.toLocaleString()} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {financialAnalytics.costBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
