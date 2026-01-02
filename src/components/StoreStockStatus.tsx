import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType, SalesData } from '../App';
import * as api from '../utils/api';
import { Package, TrendingDown, TrendingUp, AlertTriangle, ArrowRight, CheckCircle, Store, Factory } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
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

export function StoreStockStatus({ context, stores }: Props) {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7days' | '30days' | 'all'>('30days');

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
                      <p className="text-xl">{quantity}</p>
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
