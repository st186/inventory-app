import { X, TrendingUp, TrendingDown, Package, DollarSign, BarChart3 } from 'lucide-react';
import { InventoryItem } from '../types';

type Props = {
  category: string;
  items: InventoryItem[];
  totalAmount: number;
  onClose: () => void;
};

type ItemAnalysis = {
  itemName: string;
  totalSpent: number;
  quantity: number;
  avgUnitPrice: number;
  firstUnitPrice: number;
  lastUnitPrice: number;
  priceChange: number;
  priceChangePercent: number;
  transactionCount: number;
};

export function ExpenseBreakdownModal({ category, items, totalAmount, onClose }: Props) {
  // Group by item name and calculate metrics
  const itemAnalysis: ItemAnalysis[] = Object.values(
    items.reduce((acc, item) => {
      // Handle both inventory items (itemName) and overhead items (description)
      const name = item.itemName || item.description || 'Unknown';
      const unitPrice = item.unitPrice || (item.amount || 0);
      const quantity = item.quantity || 1;
      // Inventory items use totalCost, overhead items use amount
      const totalPrice = item.totalCost || item.totalPrice || item.amount || 0;
      
      if (!acc[name]) {
        acc[name] = {
          itemName: name,
          totalSpent: 0,
          quantity: 0,
          avgUnitPrice: 0,
          firstUnitPrice: unitPrice,
          lastUnitPrice: unitPrice,
          priceChange: 0,
          priceChangePercent: 0,
          transactionCount: 0,
          firstDate: item.date,
          lastDate: item.date,
        };
      }
      
      const current = acc[name];
      current.totalSpent += totalPrice;
      current.quantity += quantity;
      current.transactionCount += 1;
      
      // Track price changes chronologically
      if (item.date < current.firstDate) {
        current.firstDate = item.date;
        current.firstUnitPrice = unitPrice;
      }
      if (item.date > current.lastDate) {
        current.lastDate = item.date;
        current.lastUnitPrice = unitPrice;
      }
      
      return acc;
    }, {} as Record<string, any>)
  ).map(item => {
    const avgUnitPrice = item.quantity > 0 ? item.totalSpent / item.quantity : 0;
    const priceChange = item.lastUnitPrice - item.firstUnitPrice;
    const priceChangePercent = item.firstUnitPrice > 0 
      ? ((priceChange / item.firstUnitPrice) * 100) 
      : 0;
    
    return {
      itemName: item.itemName,
      totalSpent: item.totalSpent,
      quantity: item.quantity,
      avgUnitPrice,
      firstUnitPrice: item.firstUnitPrice,
      lastUnitPrice: item.lastUnitPrice,
      priceChange,
      priceChangePercent,
      transactionCount: item.transactionCount,
    };
  });

  // Sort by total spent
  const topItems = [...itemAnalysis].sort((a, b) => b.totalSpent - a.totalSpent);
  
  // Sort by price change percentage (absolute value)
  const priceFluctuations = [...itemAnalysis]
    .filter(item => item.transactionCount > 1 && Math.abs(item.priceChangePercent) > 0.1)
    .sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-7 h-7" />
              {category} Breakdown
            </h2>
            <p className="text-purple-100 mt-1">
              Total Spent: ₹{totalAmount.toFixed(2)} • {items.length} transactions • {topItems.length} unique items
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Items by Spend */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border-2 border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Top Items by Spend
              </h3>
              <div className="space-y-3">
                {topItems.slice(0, 10).map((item, index) => {
                  const percentage = (item.totalSpent / totalAmount) * 100;
                  return (
                    <div key={`top-${item.itemName}-${index}`} className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                              {index + 1}
                            </span>
                            <span className="font-medium text-gray-900">{item.itemName}</span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1 ml-8">
                            {item.quantity.toFixed(2)} units • ₹{item.avgUnitPrice.toFixed(2)}/unit avg
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-bold text-gray-900">₹{item.totalSpent.toFixed(2)}</div>
                          <div className="text-xs text-blue-600 font-medium">{percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price Fluctuations */}
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-6 border-2 border-orange-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-600" />
                Biggest Price Fluctuations
              </h3>
              {priceFluctuations.length === 0 ? (
                <div className="bg-white rounded-lg p-8 text-center text-gray-500">
                  <TrendingDown className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No significant price changes detected</p>
                  <p className="text-sm mt-1">Items need multiple purchases to show fluctuations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {priceFluctuations.slice(0, 10).map((item, index) => {
                    const isIncrease = item.priceChange > 0;
                    return (
                      <div key={`fluc-${item.itemName}-${index}`} className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{item.itemName}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {item.transactionCount} purchases tracked
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                            isIncrease 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {isIncrease ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            {isIncrease ? '+' : ''}{item.priceChangePercent.toFixed(1)}%
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-xs text-gray-600">Initial Price</div>
                            <div className="font-semibold text-gray-900">₹{item.firstUnitPrice.toFixed(2)}</div>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-xs text-gray-600">Latest Price</div>
                            <div className="font-semibold text-gray-900">₹{item.lastUnitPrice.toFixed(2)}</div>
                          </div>
                        </div>
                        <div className={`mt-2 text-xs font-medium ${
                          isIncrease ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {isIncrease ? 'Increased' : 'Decreased'} by ₹{Math.abs(item.priceChange).toFixed(2)}/unit
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border-2 border-purple-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-purple-600" />
              Summary Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-sm text-gray-600">Total Items</div>
                <div className="text-2xl font-bold text-gray-900">{topItems.length}</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-sm text-gray-600">Transactions</div>
                <div className="text-2xl font-bold text-gray-900">{items.length}</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-sm text-gray-600">Avg per Item</div>
                <div className="text-2xl font-bold text-gray-900">
                  {topItems.length > 0 ? `₹${(totalAmount / topItems.length).toFixed(0)}` : '₹0'}
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-sm text-gray-600">Price Volatility</div>
                <div className="text-2xl font-bold text-gray-900">
                  {priceFluctuations.length}
                  <span className="text-sm text-gray-600 font-normal ml-1">items</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}