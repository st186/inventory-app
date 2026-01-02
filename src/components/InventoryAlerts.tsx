import { useState, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { AlertTriangle, Bell, TrendingDown, Package, Clock, ArrowRight } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

type Alert = {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'pending_request' | 'expiring_soon';
  severity: 'high' | 'medium' | 'low';
  storeId: string;
  storeName: string;
  product?: string;
  quantity?: number;
  message: string;
  actionRequired: string;
  timestamp: string;
};

export function InventoryAlerts({ context, stores }: Props) {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Generate alerts based on current data
  const alerts = useMemo(() => {
    const generatedAlerts: Alert[] = [];

    stores.forEach(store => {
      // Check stock requests
      const fulfilledRequests = context.stockRequests.filter(
        req => req.storeId === store.id && 
        (req.status === 'fulfilled' || req.status === 'partially_fulfilled') &&
        req.fulfilledQuantities
      );

      const pendingRequests = context.stockRequests.filter(
        req => req.storeId === store.id && req.status === 'pending'
      );

      // Alert for pending requests
      if (pendingRequests.length > 0) {
        pendingRequests.forEach(req => {
          const daysOld = Math.floor(
            (new Date().getTime() - new Date(req.requestDate).getTime()) / (1000 * 60 * 60 * 24)
          );
          
          generatedAlerts.push({
            id: `pending-${req.id}`,
            type: 'pending_request',
            severity: daysOld > 2 ? 'high' : daysOld > 1 ? 'medium' : 'low',
            storeId: store.id,
            storeName: store.name,
            message: `Stock request pending for ${daysOld} day(s)`,
            actionRequired: 'Production house needs to fulfill request',
            timestamp: req.requestDate,
          });
        });
      }

      // Calculate current stock
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
          Object.keys(totalFulfilledStock).forEach(key => {
            totalFulfilledStock[key as keyof typeof totalFulfilledStock] += 
              req.fulfilledQuantities![key as keyof typeof req.fulfilledQuantities] || 0;
          });
        }
      });

      // Check for low/out of stock
      const storeSales = context.salesData.filter(sale => sale.storeId === store.id);
      const avgSalesPerType = storeSales.length > 0 ? Math.floor(storeSales.length / 7) : 0;

      Object.entries(totalFulfilledStock).forEach(([product, fulfilledQty]) => {
        const currentStock = Math.max(0, fulfilledQty - avgSalesPerType);
        
        if (currentStock === 0) {
          generatedAlerts.push({
            id: `out-${store.id}-${product}`,
            type: 'out_of_stock',
            severity: 'high',
            storeId: store.id,
            storeName: store.name,
            product,
            quantity: 0,
            message: `${product} is out of stock`,
            actionRequired: 'Create stock request immediately',
            timestamp: new Date().toISOString(),
          });
        } else if (currentStock < 50) {
          generatedAlerts.push({
            id: `low-${store.id}-${product}`,
            type: 'low_stock',
            severity: currentStock < 20 ? 'high' : 'medium',
            storeId: store.id,
            storeName: store.name,
            product,
            quantity: currentStock,
            message: `${product} stock is low (${currentStock} units)`,
            actionRequired: 'Consider creating stock request',
            timestamp: new Date().toISOString(),
          });
        }
      });
    });

    // Sort by severity and timestamp
    return generatedAlerts.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [stores, context.stockRequests, context.salesData]);

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter(a => a.severity === filter);

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'out_of_stock': return <Package className="h-5 w-5" />;
      case 'low_stock': return <TrendingDown className="h-5 w-5" />;
      case 'pending_request': return <Clock className="h-5 w-5" />;
      default: return <AlertTriangle className="h-5 w-5" />;
    }
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
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl">Inventory Alerts</h2>
            <p className="text-muted-foreground">
              {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
          >
            All ({alerts.length})
          </Button>
          <Button
            variant={filter === 'high' ? 'default' : 'outline'}
            onClick={() => setFilter('high')}
            size="sm"
          >
            High ({alerts.filter(a => a.severity === 'high').length})
          </Button>
          <Button
            variant={filter === 'medium' ? 'default' : 'outline'}
            onClick={() => setFilter('medium')}
            size="sm"
          >
            Medium ({alerts.filter(a => a.severity === 'medium').length})
          </Button>
          <Button
            variant={filter === 'low' ? 'default' : 'outline'}
            onClick={() => setFilter('low')}
            size="sm"
          >
            Low ({alerts.filter(a => a.severity === 'low').length})
          </Button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.map(alert => (
          <Card key={alert.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg ${
                  alert.severity === 'high' ? 'bg-red-100 text-red-600' :
                  alert.severity === 'medium' ? 'bg-orange-100 text-orange-600' :
                  'bg-yellow-100 text-yellow-600'
                }`}>
                  {getAlertIcon(alert.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm">{alert.storeName}</h4>
                    {alert.product && (
                      <>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {productLabels[alert.product] || alert.product}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm mb-2">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{alert.actionRequired}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={`${getSeverityColor(alert.severity)} border`}>
                  {alert.severity.toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(alert.timestamp).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredAlerts.length === 0 && (
        <Card className="p-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg mb-2">No Alerts</h3>
          <p className="text-muted-foreground">
            {filter === 'all' 
              ? 'All inventory levels are healthy'
              : `No ${filter} severity alerts at this time`
            }
          </p>
        </Card>
      )}
    </div>
  );
}
