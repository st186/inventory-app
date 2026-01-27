import { useState } from 'react';
import { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { DateSelector } from './DateSelector';
import { Package, DollarSign, TrendingUp, Lock, Eye, Calendar } from 'lucide-react';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

export function InventoryView({ context, selectedStoreId }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showRecalibration, setShowRecalibration] = useState(false);

  // Filter data based on selected date and selected store (fallback to user's store)
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  
  const filteredInventory = context.inventory.filter(
    (item) => {
      const dateMatch = item.date === selectedDate;
      const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
      return dateMatch && storeMatch;
    }
  );

  const filteredOverheads = context.overheads.filter(
    (item) => {
      const dateMatch = item.date === selectedDate;
      const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
      return dateMatch && storeMatch;
    }
  );

  const filteredFixedCosts = context.fixedCosts.filter(
    (item) => {
      const dateMatch = item.date === selectedDate;
      const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
      return dateMatch && storeMatch;
    }
  );

  const totalInventoryCost = filteredInventory.reduce(
    (sum, item) => sum + item.totalCost,
    0
  );
  const totalOverheadCost = filteredOverheads.reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const totalFixedCost = filteredFixedCosts.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  // Group inventory by category
  const inventoryByCategory = filteredInventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Group overheads by category
  const overheadsByCategory = filteredOverheads.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, OverheadItem[]>);

  const categoryLabels: Record<string, string> = {
    fresh_produce: 'Fresh Vegetables',
    spices_seasonings: 'Grocery',
    dairy: 'Dairy Products',
    meat: 'Meat',
    packaging: 'Packaging Materials',
    staff_essentials: 'Staff Essentials',
    fuel: 'Fuel',
    travel: 'Travel',
    transportation: 'Transportation',
    marketing: 'Marketing',
    service_charge: 'Service Charge',
    repair: 'Repair & Maintenance',
    party: 'Party Expenses',
    lunch: 'Lunch',
    miscellaneous: 'Miscellaneous',
    electricity: 'Electricity',
    rent: 'Rent'
  };

  const isClusterHead = context.user?.role === 'cluster_head';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Read-Only Badge */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl text-gray-900">Inventory Overview</h1>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-2 border-amber-200 rounded-lg">
          <Lock className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-800">View Only</span>
        </div>
      </div>

      {/* Date Selector */}
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg shadow-blue-500/30">
          <p className="text-sm text-blue-100 uppercase tracking-wide">Inventory Cost</p>
          <p className="text-white text-2xl mt-2">₹{totalInventoryCost.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 shadow-lg shadow-orange-500/30">
          <p className="text-sm text-orange-100 uppercase tracking-wide">Overhead Cost</p>
          <p className="text-white text-2xl mt-2">₹{totalOverheadCost.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 shadow-lg shadow-green-500/30">
          <p className="text-sm text-green-100 uppercase tracking-wide">Fixed Cost</p>
          <p className="text-white text-2xl mt-2">₹{totalFixedCost.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 shadow-lg shadow-purple-500/30">
          <p className="text-sm text-purple-100 uppercase tracking-wide">Total Expenses</p>
          <p className="text-white text-2xl mt-2">
            ₹{(totalInventoryCost + totalOverheadCost + totalFixedCost).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Inventory Items by Category */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl text-gray-900">Inventory Items</h2>
        </div>
        
        {Object.keys(inventoryByCategory).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(inventoryByCategory).map(([category, items]) => (
              <div key={category} className="border-l-4 border-blue-500 pl-4">
                <h3 className="text-lg text-gray-900 mb-3">{categoryLabels[category]}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Item Name</th>
                        <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Quantity</th>
                        <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Cost/Unit</th>
                        <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {item.itemName || <span className="text-red-600 italic">⚠️ Missing Name</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            ₹{item.costPerUnit.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                            ₹{item.totalCost.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No inventory items for this date</p>
          </div>
        )}
      </div>

      {/* Overhead Costs by Category */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-orange-600" />
          <h2 className="text-xl text-gray-900">Overhead Costs</h2>
        </div>
        
        {Object.keys(overheadsByCategory).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(overheadsByCategory).map(([category, items]) => (
              <div key={category} className="border-l-4 border-orange-500 pl-4">
                <h3 className="text-lg text-gray-900 mb-3">{categoryLabels[category]}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                            ₹{item.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No overhead costs for this date</p>
          </div>
        )}
      </div>

      {/* Fixed Costs */}
      {filteredFixedCosts.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h2 className="text-xl text-gray-900">Fixed Costs</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFixedCosts.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {categoryLabels[item.category]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                      ₹{item.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly Stock Recalibration Button */}
      {isClusterHead && (
        <div className="mt-6">
          <button
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            onClick={() => setShowRecalibration(true)}
          >
            <Calendar className="w-5 h-5 mr-2" />
            Monthly Stock Recalibration
          </button>
        </div>
      )}

      {/* Monthly Stock Recalibration Modal */}
      {showRecalibration && (
        <MonthlyStockRecalibration
          context={context}
          selectedStoreId={effectiveStoreId}
          onClose={() => setShowRecalibration(false)}
        />
      )}

      {/* Info Message */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800">
              {isClusterHead 
                ? 'You are viewing inventory data in read-only mode. Only Operations Managers can add or edit inventory items.'
                : 'You are viewing inventory data in read-only mode. To add or modify inventory items, please contact your Operations Manager.'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}