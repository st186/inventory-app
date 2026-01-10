import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType, SalesData } from '../App';
import * as api from '../utils/api';
import { Package, TrendingDown, TrendingUp, AlertTriangle, ArrowRight, CheckCircle, Store, Factory, Info, Settings, X } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickAddInventoryItem } from './QuickAddInventoryItem';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  onNavigateToManageItems?: () => void;
};

type StockStatus = {
  storeId: string;
  storeName: string;
  productionHouseName: string;
  inventory: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  };
  status: 'healthy' | 'low' | 'critical' | 'out';
  lastUpdated: string;
};

// Default pieces per plate configuration
const DEFAULT_PIECES_PER_PLATE: Record<string, number> = {
  chicken: 6,
  chickenCheese: 6,
  veg: 6,
  cheeseCorn: 6,
  paneer: 6,
  vegKurkure: 6,
  chickenKurkure: 6
};

export function StoreStockStatus({ context, stores, onNavigateToManageItems }: Props) {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7days' | '30days' | 'all'>('30days');
  const [showPlateConfig, setShowPlateConfig] = useState(false);
  const [piecesPerPlate, setPiecesPerPlate] = useState<Record<string, number>>(DEFAULT_PIECES_PER_PLATE);

  // Load plate configuration from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('storeStockPlateConfig');
    if (savedConfig) {
      try {
        setPiecesPerPlate(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Failed to load plate config:', e);
      }
    }
  }, []);

  // Save plate configuration to localStorage
  const updatePlateConfig = (product: string, pieces: number) => {
    const newConfig = { ...piecesPerPlate, [product]: pieces };
    setPiecesPerPlate(newConfig);
    localStorage.setItem('storeStockPlateConfig', JSON.stringify(newConfig));
  };

  // Calculate stock status for each store
  const storeStockStatuses = useMemo(() => {
    const statuses: StockStatus[] = [];

    stores.forEach(store => {
      // Find fulfilled stock requests for this store
      const fulfilledRequests = context.stockRequests.filter(
        req => req.storeId === store.id && 
        (req.status === 'fulfilled' || req.status === 'partially_fulfilled') &&
        req.fulfilledQuantities
      );

      // Calculate total fulfilled stock
      const totalFulfilledStock = {
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      };

      fulfilledRequests.forEach(req => {
        if (req.fulfilledQuantities) {
          totalFulfilledStock.chicken += req.fulfilledQuantities.chicken || 0;
          totalFulfilledStock.chickenCheese += req.fulfilledQuantities.chickenCheese || 0;
          totalFulfilledStock.veg += req.fulfilledQuantities.veg || 0;
          totalFulfilledStock.cheeseCorn += req.fulfilledQuantities.cheeseCorn || 0;
          totalFulfilledStock.paneer += req.fulfilledQuantities.paneer || 0;
          totalFulfilledStock.vegKurkure += req.fulfilledQuantities.vegKurkure || 0;
          totalFulfilledStock.chickenKurkure += req.fulfilledQuantities.chickenKurkure || 0;
        }
      });

      // Calculate total sales for this store
      const storeSales = context.salesData.filter(sale => sale.storeId === store.id);
      
      // For now, we'll assume equal distribution of sales across momo types
      // In a real scenario, you'd track individual product sales
      const totalSalesCount = storeSales.length;
      const avgSalesPerType = totalSalesCount > 0 ? Math.floor(totalSalesCount / 7) : 0;

      // Calculate current stock: Fulfilled - Sales
      const currentStock = {
        chicken: Math.max(0, totalFulfilledStock.chicken - avgSalesPerType),
        chickenCheese: Math.max(0, totalFulfilledStock.chickenCheese - avgSalesPerType),
        veg: Math.max(0, totalFulfilledStock.veg - avgSalesPerType),
        cheeseCorn: Math.max(0, totalFulfilledStock.cheeseCorn - avgSalesPerType),
        paneer: Math.max(0, totalFulfilledStock.paneer - avgSalesPerType),
        vegKurkure: Math.max(0, totalFulfilledStock.vegKurkure - avgSalesPerType),
        chickenKurkure: Math.max(0, totalFulfilledStock.chickenKurkure - avgSalesPerType),
      };

      // Determine overall status
      const stockLevels = Object.values(currentStock);
      const avgStock = stockLevels.reduce((a, b) => a + b, 0) / stockLevels.length;
      
      let status: 'healthy' | 'low' | 'critical' | 'out' = 'healthy';
      if (avgStock === 0) status = 'out';
      else if (avgStock < 50) status = 'critical';
      else if (avgStock < 100) status = 'low';

      const productionHouse = context.productionHouses.find(h => h.id === store.productionHouseId);

      statuses.push({
        storeId: store.id,
        storeName: store.name,
        productionHouseName: productionHouse?.name || 'Not mapped',
        inventory: currentStock,
        status,
        lastUpdated: new Date().toISOString(),
      });
    });

    return statuses;
  }, [stores, context.stockRequests, context.salesData, context.productionHouses]);

  const filteredStatuses = selectedStore 
    ? storeStockStatuses.filter(s => s.storeId === selectedStore)
    : storeStockStatuses;

  const getStatusColor = (status: StockStatus['status']) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'low': return 'bg-yellow-500';
      case 'critical': return 'bg-orange-500';
      case 'out': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: StockStatus['status']) => {
    const colors = {
      healthy: 'bg-green-100 text-green-800 border-green-300',
      low: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      critical: 'bg-orange-100 text-orange-800 border-orange-300',
      out: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[status];
  };

  const productLabels: Record<string, string> = {
    chicken: 'Chicken Momos',
    chickenCheese: 'Chicken Cheese',
    veg: 'Veg Momos',
    cheeseCorn: 'Cheese Corn',
    paneer: 'Paneer Momos',
    vegKurkure: 'Veg Kurkure',
    chickenKurkure: 'Chicken Kurkure',
  };

  return (
    <div className="space-y-6">
      {/* Info Banner about Dynamic Inventory Items */}
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">Dynamic Inventory Items</h3>
            <p className="text-sm text-blue-700 mb-2">
              You can now add custom inventory items beyond the default 7 momo types! 
              Manage all items from the <strong>"Manage Items"</strong> page in the navigation.
            </p>
            <p className="text-xs text-blue-600">
              💡 Items can be store-specific or global (available to all stores)
            </p>
          </div>
        </div>
      </Card>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl">Store Stock Status</h2>
          <p className="text-muted-foreground">Real-time inventory levels across all stores</p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedStore || 'all'}
            onChange={(e) => setSelectedStore(e.target.value === 'all' ? null : e.target.value)}
            className="px-4 py-2 border rounded-lg bg-background"
          >
            <option value="all">All Stores</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          {(context.user?.role === 'manager' || context.user?.role === 'cluster_head') && (
            <button
              onClick={() => setShowPlateConfig(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-semibold">Plate Config</span>
            </button>
          )}
          {onNavigateToManageItems && (context.user?.role === 'manager' || context.user?.role === 'cluster_head') && (
            <button
              onClick={onNavigateToManageItems}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md hover:shadow-lg"
            >
              <Package className="w-4 h-4" />
              <span className="text-sm font-semibold">Manage Items</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Healthy Stock</p>
              <p className="text-2xl">{storeStockStatuses.filter(s => s.status === 'healthy').length}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Low Stock</p>
              <p className="text-2xl">{storeStockStatuses.filter(s => s.status === 'low').length}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <TrendingDown className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Critical Stock</p>
              <p className="text-2xl">{storeStockStatuses.filter(s => s.status === 'critical').length}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Out of Stock</p>
              <p className="text-2xl">{storeStockStatuses.filter(s => s.status === 'out').length}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <Package className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Plate Configuration Modal */}
      {showPlateConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Plate Configuration</h3>
                  <p className="text-sm text-blue-100">Set how many pieces are in each plate for stock display</p>
                </div>
                <button
                  onClick={() => setShowPlateConfig(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {Object.entries(productLabels).map(([product, label]) => (
                <div key={product} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                  <label className="text-gray-900 font-medium">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={piecesPerPlate[product]}
                      onChange={(e) => updatePlateConfig(product, parseInt(e.target.value) || 6)}
                      className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-center font-semibold"
                    />
                    <span className="text-gray-600 text-sm">pieces/plate</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-6 bg-blue-50 border-t-2 border-blue-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-1">How it works:</p>
                  <p>
                    This configuration determines how pieces are converted to plates in the stock display.
                    For example, if Chicken Momos has 6 pieces/plate and you have 170 pieces in stock,
                    it will show as <span className="font-mono bg-white px-2 py-1 rounded">170 pcs / 28 plates</span>.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowPlateConfig(false)}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Stock Details */}
      <div className="grid grid-cols-1 gap-4">
        {filteredStatuses.map(storeStatus => (
          <Card key={storeStatus.storeId} className="p-6">
            <div className="space-y-4">
              {/* Store Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Store className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg">{storeStatus.storeName}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Factory className="h-4 w-4" />
                      <span>{storeStatus.productionHouseName}</span>
                    </div>
                  </div>
                </div>
                <Badge className={`${getStatusBadge(storeStatus.status)} border`}>
                  {storeStatus.status.toUpperCase()}
                </Badge>
              </div>

              {/* Stock Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {Object.entries(storeStatus.inventory).map(([product, quantity]) => {
                  let itemStatus: 'healthy' | 'low' | 'critical' | 'out' = 'healthy';
                  if (quantity === 0) itemStatus = 'out';
                  else if (quantity < 50) itemStatus = 'critical';
                  else if (quantity < 100) itemStatus = 'low';
                  
                  const plates = Math.floor(quantity / piecesPerPlate[product]);

                  return (
                    <div 
                      key={product} 
                      className={`p-3 rounded-lg border-2 ${
                        itemStatus === 'out' ? 'border-red-200 bg-red-50' :
                        itemStatus === 'critical' ? 'border-orange-200 bg-orange-50' :
                        itemStatus === 'low' ? 'border-yellow-200 bg-yellow-50' :
                        'border-green-200 bg-green-50'
                      }`}
                    >
                      <p className="text-xs text-muted-foreground mb-1">{productLabels[product]}</p>
                      <p className="text-xl font-semibold">{quantity}</p>
                      <div className="text-xs text-gray-600 mt-0.5">
                        <span className="font-medium">{plates} plates</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <div className={`h-2 w-2 rounded-full ${getStatusColor(itemStatus)}`} />
                        <span className="text-xs capitalize">{itemStatus}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Last Updated */}
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(storeStatus.lastUpdated).toLocaleString()}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredStatuses.length === 0 && (
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg mb-2">No Stock Data Available</h3>
          <p className="text-muted-foreground">
            Stock requests need to be fulfilled to see inventory levels
          </p>
        </Card>
      )}
    </div>
  );
}