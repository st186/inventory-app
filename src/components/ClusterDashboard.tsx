import { useMemo } from 'react';
import { InventoryContextType } from '../App';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES } from '../utils/inventoryData';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { TrendingUp, Layers, ShoppingCart } from 'lucide-react';

type Props = {
  context: InventoryContextType;
};

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export function ClusterDashboard({ context }: Props) {
  // Daily Spends Data
  const dailySpends = useMemo(() => {
    const dateMap = new Map<string, { inventory: number; overhead: number }>();

    context.inventory.forEach((item) => {
      const existing = dateMap.get(item.date) || { inventory: 0, overhead: 0 };
      dateMap.set(item.date, {
        ...existing,
        inventory: existing.inventory + item.totalCost
      });
    });

    context.overheads.forEach((item) => {
      const existing = dateMap.get(item.date) || { inventory: 0, overhead: 0 };
      dateMap.set(item.date, {
        ...existing,
        overhead: existing.overhead + item.amount
      });
    });

    return Array.from(dateMap.entries())
      .map(([date, values]) => ({
        date: new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        fullDate: date,
        inventory: values.inventory,
        overhead: values.overhead,
        total: values.inventory + values.overhead
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [context.inventory, context.overheads]);

  // Most Spent Categories
  const categorySpends = useMemo(() => {
    const categoryMap = new Map<string, number>();

    context.inventory.forEach((item) => {
      const current = categoryMap.get(item.category) || 0;
      categoryMap.set(item.category, current + item.totalCost);
    });

    context.overheads.forEach((item) => {
      const current = categoryMap.get(item.category) || 0;
      categoryMap.set(item.category, current + item.amount);
    });

    return Array.from(categoryMap.entries())
      .map(([key, value]) => ({
        name: INVENTORY_CATEGORIES[key as keyof typeof INVENTORY_CATEGORIES] || 
              OVERHEAD_CATEGORIES[key as keyof typeof OVERHEAD_CATEGORIES] || 
              key,
        value
      }))
      .sort((a, b) => b.value - a.value);
  }, [context.inventory, context.overheads]);

  // Most Spent Items
  const itemSpends = useMemo(() => {
    const itemMap = new Map<string, number>();

    context.inventory.forEach((item) => {
      const current = itemMap.get(item.itemName) || 0;
      itemMap.set(item.itemName, current + item.totalCost);
    });

    return Array.from(itemMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [context.inventory]);

  // Summary Stats
  const totalInventorySpend = context.inventory.reduce(
    (sum, item) => sum + item.totalCost,
    0
  );
  const totalOverheadSpend = context.overheads.reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const totalSpend = totalInventorySpend + totalOverheadSpend;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-gray-900">Analytics Dashboard</h2>
        <p className="text-gray-600 mt-1">
          Comprehensive view of spending patterns and trends
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-5 h-5" />
            <p className="text-sm opacity-90">Total Inventory Spend</p>
          </div>
          <p className="text-2xl">₹{totalInventorySpend.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-5 h-5" />
            <p className="text-sm opacity-90">Total Overhead Spend</p>
          </div>
          <p className="text-2xl">₹{totalOverheadSpend.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5" />
            <p className="text-sm opacity-90">Total Expenses</p>
          </div>
          <p className="text-2xl">₹{totalSpend.toLocaleString()}</p>
        </div>
      </div>

      {/* Daily Spends Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h3 className="text-gray-900 mb-6">Daily Spending Trends</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dailySpends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip
              formatter={(value: number) => `₹${value.toLocaleString()}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="inventory"
              stroke="#3b82f6"
              name="Inventory"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="overhead"
              stroke="#f59e0b"
              name="Overhead"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#8b5cf6"
              name="Total"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Most Spent Categories */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-gray-900 mb-6">Spending by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categorySpends}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {categorySpends.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `₹${value.toLocaleString()}`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Items */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-gray-900 mb-6">Top Inventory Items</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={itemSpends} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip
                formatter={(value: number) => `₹${value.toLocaleString()}`}
              />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}