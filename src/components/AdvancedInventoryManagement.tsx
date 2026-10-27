import { useState } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryAlerts } from './InventoryAlerts';
import { ProductionHouseStockStatus } from './ProductionHouseStockStatus';
import { UtilitiesStockStatus } from './UtilitiesStockStatus';
import { Package, Bell, Activity } from 'lucide-react';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  onNavigateToManageItems?: () => void;
};

export function AdvancedInventoryManagement({ context, stores, onNavigateToManageItems }: Props) {
  // The old "Reports" and "Rankings" tabs were removed: they computed sales and profit their own
  // way and disagreed with Analytics. Analytics and the Export page's reports cover both. The
  // "Forecast" tab went too (made-up numbers; the real forecast is in Trends & Growth), and so did
  // "Requests" (the old stock-request list production never saw; requests live in Analytics >
  // Stock Requests - owner, 27 Oct 2026).
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock-status' | 'utilities' | 'alerts'>('dashboard');

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Advanced Inventory Management</h1>
            <p className="text-sm sm:text-base text-gray-500">
              Comprehensive inventory tracking, analytics, and reporting system
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="stock-status" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stock
            </TabsTrigger>
            <TabsTrigger value="utilities" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Utilities
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </TabsTrigger>
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard">
            <InventoryDashboard context={context} stores={stores} />
          </TabsContent>

          {/* Stock Status */}
          <TabsContent value="stock-status">
            <ProductionHouseStockStatus 
              context={context} 
              productionHouses={context.productionHouses}
              onNavigateToManageItems={onNavigateToManageItems}
            />
          </TabsContent>

          {/* Utilities (packaging box/tray + beverage stock, from real POS order data) */}
          <TabsContent value="utilities">
            <UtilitiesStockStatus context={context} stores={stores} />
          </TabsContent>

          {/* Alerts */}
          <TabsContent value="alerts">
            <InventoryAlerts context={context} stores={stores} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}