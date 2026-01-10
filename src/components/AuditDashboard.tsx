import { useState } from 'react';
import { LogOut, BarChart3, DollarSign, Package, Users, TrendingUp, Factory, Eye, ShieldCheck } from 'lucide-react';
import type { InventoryItem, OverheadItem, FixedCostItem, SalesData, ProductionData, InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Analytics } from './Analytics';
import { InventoryView } from './InventoryView';
import { PayrollManagement } from './PayrollManagement';
import { ProductionManagement } from './ProductionManagement';

type Props = {
  user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string };
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  salesData: SalesData[];
  categorySalesData: api.SalesDataRecord[];
  productionData: ProductionData[];
  productionHouses: api.ProductionHouse[];
  stockRequests: api.StockRequest[];
  productionRequests: api.ProductionRequest[];
  employees: api.Employee[];
  stores: api.Store[];
  inventoryItems: api.DynamicInventoryItem[];
  onLogout: () => void;
  onDataUpdate: (accessToken: string) => Promise<void>;
};

export function AuditDashboard({
  user,
  inventory,
  overheads,
  fixedCosts,
  salesData,
  categorySalesData,
  productionData,
  productionHouses,
  stockRequests,
  productionRequests,
  employees,
  stores,
  inventoryItems,
  onLogout,
  onDataUpdate
}: Props) {
  const [activeView, setActiveView] = useState<'analytics' | 'inventory' | 'sales' | 'production' | 'payroll'>('analytics');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Create a read-only context object for components that need it
  const contextValue: InventoryContextType = {
    inventory,
    overheads,
    fixedCosts,
    salesData,
    categorySalesData,
    productionData,
    productionHouses,
    stockRequests,
    productionRequests,
    employees,
    stores,
    managedStoreIds: [],
    managedProductionHouseIds: [],
    inventoryItems,
    loadInventoryItems: async () => {}, // No-op for audit
    addInventoryItem: async () => {}, // No-op for audit
    addOverheadItem: async () => {}, // No-op for audit
    addFixedCostItem: async () => {}, // No-op for audit
    updateInventoryItem: async () => {}, // No-op for audit
    updateOverheadItem: async () => {}, // No-op for audit
    updateFixedCostItem: async () => {}, // No-op for audit
    deleteInventoryItem: async () => {}, // No-op for audit
    deleteOverheadItem: async () => {}, // No-op for audit
    deleteFixedCostItem: async () => {}, // No-op for audit
    addSalesData: async () => {}, // No-op for audit
    updateSalesData: async () => {}, // No-op for audit
    approveSalesData: async () => {}, // No-op for audit
    requestSalesApproval: async () => {}, // No-op for audit
    approveDiscrepancy: async () => {}, // No-op for audit
    rejectDiscrepancy: async () => {}, // No-op for audit
    addProductionData: async () => {}, // No-op for audit
    updateProductionData: async () => {}, // No-op for audit
    approveProductionData: async () => {}, // No-op for audit
    addProductionHouse: async () => {}, // No-op for audit
    updateProductionHouse: async () => {}, // No-op for audit
    updateProductionHouseInventory: async () => {}, // No-op for audit
    deleteProductionHouse: async () => {}, // No-op for audit
    setProductionHouses: () => {}, // No-op for audit
    createStockRequest: async () => {}, // No-op for audit
    fulfillStockRequest: async () => {}, // No-op for audit
    cancelStockRequest: async () => {}, // No-op for audit
    isManager: false,
    user: user,
  };

  const navItems = [
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'inventory' as const, label: 'Inventory', icon: Package },
    { id: 'sales' as const, label: 'Sales', icon: DollarSign },
    { id: 'production' as const, label: 'Production', icon: Factory },
    { id: 'payroll' as const, label: 'Payroll', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800 shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left - Brand */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-lg backdrop-blur-sm">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-white text-lg font-bold">Bhandar-IMS</h1>
                <p className="text-xs text-slate-200">Audit Dashboard</p>
              </div>
            </div>

            {/* Right - User Info & Logout */}
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-slate-200 flex items-center justify-end gap-1">
                  <Eye className="w-3 h-3" />
                  Read-Only Access
                </p>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all backdrop-blur-sm"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 pb-3 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                  activeView === item.id
                    ? 'bg-white text-slate-800 shadow-lg'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Read-Only Notice */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800">
          <Eye className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">
            <strong>Audit Mode:</strong> You have read-only access to all data. You cannot create, edit, or delete any records.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'analytics' && (
          <Analytics
            context={contextValue}
            selectedStoreId={selectedStoreId}
          />
        )}

        {activeView === 'inventory' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Inventory View</h2>
                <p className="text-sm text-gray-600 mt-1">View-only access to inventory data</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-700 font-medium">Read-Only</span>
              </div>
            </div>
            <InventoryView
              context={contextValue}
              selectedStoreId={selectedStoreId}
            />
          </div>
        )}

        {activeView === 'sales' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Sales Data</h2>
                <p className="text-sm text-gray-600 mt-1">View-only access to sales records</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-700 font-medium">Read-Only</span>
              </div>
            </div>
            {/* Sales table will be rendered here - simplified read-only view */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Store</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Offline Sales</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Online Sales</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Cash</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Paytm</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salesData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500">
                        No sales data available
                      </td>
                    </tr>
                  ) : (
                    salesData
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 50)
                      .map((sale) => {
                        const store = stores.find(s => s.id === sale.storeId);
                        return (
                          <tr key={sale.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-900">
                              {new Date(sale.date).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              {store?.name || 'Unknown Store'}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              ₹{sale.offlineSales.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              ₹{sale.onlineSales.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              ₹{sale.cashAmount.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              ₹{sale.paytmAmount.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                  sale.approvalStatus === 'approved'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {sale.approvalStatus === 'approved' ? 'Approved' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'production' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Production Data</h2>
                <p className="text-sm text-gray-600 mt-1">View-only access to production records</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-700 font-medium">Read-Only</span>
              </div>
            </div>
            <ProductionManagement
              context={contextValue}
              selectedStoreId={selectedStoreId}
            />
          </div>
        )}

        {activeView === 'payroll' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Payroll Data</h2>
                <p className="text-sm text-gray-600 mt-1">View-only access to payroll records</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-700 font-medium">Read-Only</span>
              </div>
            </div>
            <PayrollManagement
              userRole="audit"
              selectedDate={selectedDate}
              userName={user.name}
              userEmail={user.email}
              employees={employees}
              stores={stores}
            />
          </div>
        )}
      </div>
    </div>
  );
}