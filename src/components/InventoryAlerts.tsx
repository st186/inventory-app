import { useState, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { AlertTriangle, Bell, TrendingDown, Package, Clock } from 'lucide-react';
import { FilterChips } from './ui/chip';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { StatusChip } from './ui/status-chip';

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

  const severityTone = (severity: Alert['severity']) => (severity === 'high' ? 'danger' : 'warning') as 'danger' | 'warning';
  const severityLabel = (severity: Alert['severity']) => (severity === 'high' ? 'High' : severity === 'medium' ? 'Medium' : 'Low');
  const alertIcon = (type: Alert['type']) => (type === 'out_of_stock' ? Package : type === 'low_stock' ? TrendingDown : type === 'pending_request' ? Clock : AlertTriangle);
  const productLabels: Record<string, string> = {
    chicken: 'Chicken',
    chickenCheese: 'Chicken cheese',
    veg: 'Veg',
    cheeseCorn: 'Cheese corn',
    paneer: 'Paneer',
    vegKurkure: 'Veg kurkure',
    chickenKurkure: 'Chicken kurkure',
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col">
        <h2 className="text-title font-semibold text-text">Alerts</h2>
        <p className="num text-body-sm text-text-2">{alerts.length} active</p>
      </div>
      <FilterChips
        aria-label="Severity"
        value={filter}
        onValueChange={(v) => setFilter(v)}
        options={[
          { value: 'all', label: 'All', count: alerts.length },
          { value: 'high', label: 'High', count: alerts.filter((a) => a.severity === 'high').length },
          { value: 'medium', label: 'Medium', count: alerts.filter((a) => a.severity === 'medium').length },
          { value: 'low', label: 'Low', count: alerts.filter((a) => a.severity === 'low').length },
        ]}
      />
      <ListGroup empty={<EmptyState icon={Bell} title="No alerts" body={filter === 'all' ? 'Stock looks fine everywhere.' : `No ${filter} alerts right now.`} />}>
        {filteredAlerts.map((alert) => (
          <ListRow
            key={alert.id}
            icon={alertIcon(alert.type)}
            iconTone={severityTone(alert.severity)}
            title={alert.product ? `${alert.storeName} · ${productLabels[alert.product] || alert.product}` : alert.storeName}
            subtitle={`${alert.message} · ${alert.actionRequired} · ${new Date(alert.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
            trailing={<StatusChip tone={severityTone(alert.severity)} size="sm">{severityLabel(alert.severity)}</StatusChip>}
          />
        ))}
      </ListGroup>
    </div>
  );
}
