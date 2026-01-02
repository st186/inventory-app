import { useState, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FileText, Download, TrendingUp, DollarSign, Package, Users, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';

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
      const category = item.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

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
    a.download = `bhandar-report-${reportType}-${dateRange}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl">Reports & Analytics</h2>
            <p className="text-muted-foreground">Comprehensive business insights and reports</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl mb-1">₹{salesAnalytics.totalRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                Avg: ₹{Math.round(salesAnalytics.avgDailySales).toLocaleString()}/day
              </p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Transactions</p>
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-2xl mb-1">{salesAnalytics.totalTransactions}</p>
              <p className="text-xs text-muted-foreground">Total sales entries</p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Active Stores</p>
                <Package className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-2xl mb-1">{salesAnalytics.storeWiseSales.length}</p>
              <p className="text-xs text-muted-foreground">Contributing to revenue</p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg mb-4">Sales Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesAnalytics.salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="online" stroke="#8b5cf6" strokeWidth={2} name="Online" />
                  <Line type="monotone" dataKey="offline" stroke="#ec4899" strokeWidth={2} name="Offline" />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} name="Total" />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg mb-4">Store-wise Sales</h3>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Total Production</p>
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-2xl mb-1">{productionAnalytics.totalProduction.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total units produced</p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Total Wastage</p>
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-2xl mb-1">{productionAnalytics.totalWastage.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {productionAnalytics.wastagePercentage.toFixed(2)}% of production
              </p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Product Varieties</p>
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-2xl mb-1">{productionAnalytics.productionData.length}</p>
              <p className="text-xs text-muted-foreground">Types being produced</p>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg mb-4">Production by Product Type</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={productionAnalytics.productionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#8b5cf6" name="Units Produced" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-2xl mb-1">₹{inventoryAnalytics.totalInventoryCost.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total inventory spending</p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Items Purchased</p>
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-2xl mb-1">{inventoryAnalytics.itemCount}</p>
              <p className="text-xs text-muted-foreground">
                Avg: ₹{Math.round(inventoryAnalytics.avgItemCost).toLocaleString()}/item
              </p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Categories</p>
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-2xl mb-1">{inventoryAnalytics.categoryData.length}</p>
              <p className="text-xs text-muted-foreground">Active categories</p>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg mb-4">Spending by Category</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={inventoryAnalytics.categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#ec4899" name="Amount (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        {/* Financial Report */}
        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Revenue</p>
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl mb-1">₹{financialAnalytics.revenue.toLocaleString()}</p>
              <p className="text-xs text-green-600">+Income</p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Total Costs</p>
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-2xl mb-1">₹{financialAnalytics.totalCosts.toLocaleString()}</p>
              <p className="text-xs text-red-600">-Expenses</p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Gross Profit</p>
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-2xl mb-1">₹{financialAnalytics.grossProfit.toLocaleString()}</p>
              <p className={`text-xs ${financialAnalytics.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Net margin
              </p>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Profit Margin</p>
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-2xl mb-1">{financialAnalytics.profitMargin.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Profit ratio</p>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg mb-4">Cost Breakdown</h3>
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
