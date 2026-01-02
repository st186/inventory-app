import { PredictiveAnalytics } from './PredictiveAnalytics';
import { StorePerformanceComparison } from './StorePerformanceComparison';
import { ProductionHouseStockStatus } from './ProductionHouseStockStatus';
import { Package, Bell, FileText, Send, Activity, BarChart3, Target, Trophy, Factory } from 'lucide-react';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

export function AdvancedInventoryManagement({ context, stores }: Props) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock-status' | 'alerts' | 'requests' | 'reports' | 'predictive' | 'performance'>('dashboard');

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl">Advanced Inventory Management</h1>
            <p className="text-muted-foreground">
              Comprehensive inventory tracking, analytics, and reporting system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Package className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="stock-status" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Stock
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="predictive" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Forecast
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Rankings
            </TabsTrigger>
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard">
            <InventoryDashboard context={context} stores={stores} />
          </TabsContent>

          {/* Stock Status */}
          <TabsContent value="stock-status">
            <ProductionHouseStockStatus context={context} productionHouses={context.productionHouses} />
          </TabsContent>

          {/* Alerts */}
          <TabsContent value="alerts">
            <InventoryAlerts context={context} stores={stores} />
          </TabsContent>

          {/* Requests */}
          <TabsContent value="requests">
            <EnhancedProductionRequests context={context} stores={stores} />
          </TabsContent>

          {/* Reports */}
          <TabsContent value="reports">
            <ReportsVisualization context={context} stores={stores} />
          </TabsContent>

          {/* Predictive Analytics */}
          <TabsContent value="predictive">
            <PredictiveAnalytics context={context} stores={stores} />
          </TabsContent>

          {/* Store Performance */}
          <TabsContent value="performance">
            <StorePerformanceComparison context={context} stores={stores} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}