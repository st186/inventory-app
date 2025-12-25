import { useState } from 'react';
import { TrendingUp, Package, AlertCircle, Calendar, Filter, Download, DollarSign, ShoppingCart } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as api from '../utils/api';
import { InventoryContextType } from '../App';

interface AnalyticsProps {
  context: InventoryContextType;
}

type TimeFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export function Analytics({ context }: AnalyticsProps) {
  const [activeView, setActiveView] = useState<'profit' | 'expense' | 'sales'>('profit');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('monthly');
  const [dateRange, setDateRange] = useState({
    from: '2025-03-01',
    to: '2025-12-25'
  });
  
  const salesData = context.salesData;
  const inventoryData = context.inventory;
  const overheadData = context.overheads;
  const loading = false;

  // Calculate analytics metrics
  const calculateMetrics = () => {
    // Calculate revenue from sales
    const totalRevenue = salesData.reduce((sum, sale) => {
      return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0) + (sale.onlineSales || 0);
    }, 0);

    const onlineRevenue = salesData.reduce((sum, sale) => sum + (sale.onlineSales || 0), 0);
    const offlineRevenue = salesData.reduce((sum, sale) => {
      return sum + (sale.paytmAmount || 0) + (sale.cashAmount || 0);
    }, 0);

    // Calculate expenses from inventory
    const inventoryExpenses = inventoryData.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    
    // Calculate overhead expenses
    const overheadExpenses = overheadData.reduce((sum, item) => sum + (item.amount || 0), 0);

    // Calculate expenses from salaries
    const salaryExpenses = salesData.reduce((sum, sale) => sum + (sale.employeeSalary || 0), 0);

    const totalCosts = inventoryExpenses + overheadExpenses + salaryExpenses;
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

    return {
      totalRevenue,
      onlineRevenue,
      offlineRevenue,
      totalExpenses: totalCosts,
      inventoryExpenses,
      overheadExpenses,
      salaryExpenses,
      netProfit,
      profitMargin
    };
  };

  const metrics = calculateMetrics();

  // Prepare chart data - group by month
  const prepareMonthlyData = () => {
    const monthlyData: any = {};

    salesData.forEach(sale => {
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

    inventoryData.forEach(item => {
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
    overheadData.forEach(item => {
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

  const monthlyChartData = prepareMonthlyData();

  // Prepare expense breakdown by category
  const prepareExpenseBreakdown = () => {
    const categoryExpenses: any = {};

    inventoryData.forEach(item => {
      const category = item.category || 'Other';
      if (!categoryExpenses[category]) {
        categoryExpenses[category] = 0;
      }
      categoryExpenses[category] += (item.totalCost || 0);
    });

    // Add overhead expenses as a category
    categoryExpenses['Overheads'] = metrics.overheadExpenses;

    // Add salaries as a category
    categoryExpenses['Salaries'] = metrics.salaryExpenses;

    const breakdown = Object.keys(categoryExpenses).map(category => ({
      name: category,
      value: categoryExpenses[category],
      percentage: ((categoryExpenses[category] / metrics.totalExpenses) * 100).toFixed(1)
    }));

    return breakdown.sort((a, b) => b.value - a.value);
  };

  const expenseBreakdown = prepareExpenseBreakdown();

  const COLORS = ['#ec4899', '#a78bfa', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#fb923c'];

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
        <div className="mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl text-gray-900 mb-1 sm:mb-2">Analytics Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600">Track revenue, expenses, and profitability</p>
        </div>

        {/* View Selector */}
        <div className="bg-white rounded-lg shadow-sm mb-4 sm:mb-6 p-1 flex gap-1 sm:gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveView('profit')}
            className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base ${
              activeView === 'profit' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Profit Analysis
          </button>
          <button
            onClick={() => setActiveView('expense')}
            className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base ${
              activeView === 'expense' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Expense Breakdown
          </button>
          <button
            onClick={() => setActiveView('sales')}
            className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg transition-colors whitespace-nowrap text-sm sm:text-base ${
              activeView === 'sales' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Sales Analytics
          </button>
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

              {/* Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="bg-blue-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Revenue</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.totalRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Current period</div>
                </div>

                <div className="bg-red-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Expenses</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.totalExpenses.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Current period</div>
                </div>

                <div className="bg-green-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Net Profit</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.netProfit.toLocaleString()}</div>
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

              {/* Bar Chart */}
              <div className="mb-6 sm:mb-8 overflow-x-auto">
                <div className="min-w-[300px]">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" stroke="#666" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: any) => `₹${value.toLocaleString()}`}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="revenue" fill="#a5b4fc" name="Revenue" />
                      <Bar dataKey="expenses" fill="#fca5a5" name="Expenses" />
                      <Bar dataKey="profit" fill="#86efac" name="Profit" />
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
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Break-even Point</div>
                      <div className="text-lg sm:text-xl text-gray-900 mb-1">₹{metrics.totalExpenses.toLocaleString()}</div>
                      <div className="text-xs text-gray-600">Monthly target</div>
                    </div>
                    <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                      <div className="text-xs sm:text-sm text-gray-600 mb-1">Revenue Growth</div>
                      {metrics.totalRevenue > 0 ? (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-600" />
                          <span className="text-lg sm:text-xl text-gray-600">Track multiple periods</span>
                        </div>
                      ) : (
                        <div className="text-lg sm:text-xl text-gray-600">No data</div>
                      )}
                      <div className="text-xs text-gray-600">vs last period</div>
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
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div>
                  <h2 className="text-lg sm:text-xl text-gray-900 mb-1">Expense Breakdown</h2>
                  <p className="text-xs sm:text-sm text-gray-600">Monthly expenses by category</p>
                </div>

                {/* Month Selector */}
                <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-2 sm:pb-0">
                  {['Dec', 'Nov', 'Oct', 'Sep'].map((month) => (
                    <button
                      key={month}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap ${
                        month === 'Nov'
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
                {/* Pie Chart */}
                <div className="overflow-x-auto">
                  <div className="min-w-[280px]">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={expenseBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percentage }) => `${percentage}%`}
                          outerRadius={90}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {expenseBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: any) => `₹${value.toLocaleString()}`}
                          contentStyle={{ fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="bg-purple-100 rounded-lg p-3 sm:p-4">
                    <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Expenses</div>
                    <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.totalExpenses.toLocaleString()}</div>
                    <div className="flex items-center gap-1 text-xs text-red-600">
                      <TrendingUp className="w-3 h-3" />
                      +4.2% vs last month
                    </div>
                  </div>

                  <div className="bg-yellow-100 rounded-lg p-3 sm:p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-xs sm:text-sm text-gray-700">Fixed Costs</div>
                      <div className="text-xs text-gray-600">53.8%</div>
                    </div>
                    <div className="text-lg sm:text-xl text-gray-900 mb-1">₹{metrics.salaryExpenses.toLocaleString()}</div>
                    <div className="text-xs text-orange-600">+2.8%</div>
                  </div>

                  <div className="bg-pink-100 rounded-lg p-3 sm:p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-xs sm:text-sm text-gray-700">Variable Costs</div>
                      <div className="text-xs text-gray-600">25.1%</div>
                    </div>
                    <div className="text-lg sm:text-xl text-gray-900 mb-1">₹{metrics.inventoryExpenses.toLocaleString()}</div>
                    <div className="text-xs text-red-600">+1.2%</div>
                  </div>

                  <div className="bg-blue-100 rounded-lg p-3 sm:p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-xs sm:text-sm text-gray-700">Other Costs</div>
                      <div className="text-xs text-gray-600">21.0%</div>
                    </div>
                    <div className="text-lg sm:text-xl text-gray-900 mb-1">₹{(metrics.totalExpenses * 0.21).toLocaleString()}</div>
                    <div className="text-xs text-green-600">+11.6%</div>
                  </div>
                </div>
              </div>

              {/* Detailed Expenses List */}
              <div>
                <h3 className="text-base sm:text-lg text-gray-900 mb-3 sm:mb-4">Detailed Expenses - November 2024</h3>
                <div className="space-y-2 sm:space-y-3">
                  {expenseBreakdown.slice(0, 6).map((expense, index) => (
                    <div key={index} className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: COLORS[index % COLORS.length] + '33' }}>
                          <Package className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: COLORS[index % COLORS.length] }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base text-gray-900 truncate">{expense.name}</div>
                          <div className="text-xs sm:text-sm text-gray-600">{expense.percentage}% of total</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-sm sm:text-base text-gray-900">₹{expense.value.toLocaleString()}</div>
                        <div className="text-xs text-red-600">+2.1%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sales Analytics View */}
        {activeView === 'sales' && (
          <div>
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
                <div>
                  <h2 className="text-lg sm:text-xl text-gray-900 mb-1">Sales Analytics</h2>
                  <p className="text-xs sm:text-sm text-gray-600">Online vs Offline sales comparison</p>
                </div>

                {/* Time Filter */}
                <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-2 sm:pb-0">
                  {['Day', 'Week', 'Month', 'Custom'].map((filter) => (
                    <button
                      key={filter}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap ${
                        filter === 'Month'
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="bg-purple-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Total Sales</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.totalRevenue.toLocaleString()}</div>
                  <div className="flex items-center gap-1 text-xs text-purple-700">
                    <TrendingUp className="w-3 h-3" />
                    12.5% vs last month
                  </div>
                </div>

                <div className="bg-green-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Online Sales</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.onlineRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">
                    {((metrics.onlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}% of total
                  </div>
                </div>

                <div className="bg-blue-100 rounded-lg p-3 sm:p-4">
                  <div className="text-xs sm:text-sm text-gray-700 mb-1">Offline Sales</div>
                  <div className="text-xl sm:text-2xl text-gray-900 mb-1">₹{metrics.offlineRevenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">
                    {((metrics.offlineRevenue / metrics.totalRevenue) * 100).toFixed(0)}% of total
                  </div>
                </div>
              </div>

              {/* Sales Comparison Chart */}
              <div className="overflow-x-auto">
                <div className="min-w-[300px]">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" stroke="#666" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#e5e7eb', 
                          border: 'none', 
                          borderRadius: '8px',
                          padding: '12px',
                          fontSize: '12px'
                        }}
                        formatter={(value: any) => `₹${value.toLocaleString()}`}
                        labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: '4px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="revenue" fill="#86efac" name="Online Sales" />
                      <Bar dataKey="expenses" fill="#93c5fd" name="Offline Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}