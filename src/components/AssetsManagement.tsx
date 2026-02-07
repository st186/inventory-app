import { useState } from 'react';
import { Store, Factory, Package, Settings, TrendingUp } from 'lucide-react';
import { StoreManagement } from './StoreManagement';
import { ProductionHouseManagement } from './ProductionHouseManagement';
import { ClusterManagement } from './ClusterManagement';
import { InvestmentsManagement } from './InvestmentsManagement';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  onRefreshStores: () => void;
};

export function AssetsManagement({ context, stores, employees, onRefreshStores }: Props) {
  const isClusterHead = context.user?.role === 'cluster_head';
  const [mainTab, setMainTab] = useState<'assets' | 'investments'>('assets');
  const [activeTab, setActiveTab] = useState<'stores' | 'production-houses' | 'cluster-management'>(
    isClusterHead ? 'cluster-management' : 'stores'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with gradient background */}
      <div className="mb-8">
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 rounded-2xl p-8 shadow-xl">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-white/30">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl text-white mb-1">Investments & Assets Management</h1>
                <p className="text-white/80 text-sm">Manage your investors, stores, and production houses</p>
              </div>
            </div>
            
            {/* Main Tabs - Assets vs Investments */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setMainTab('assets')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all backdrop-blur-sm border-2 ${
                  mainTab === 'assets'
                    ? 'bg-white text-purple-600 border-white shadow-lg'
                    : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                }`}
              >
                <Package className="w-5 h-5" />
                <span>Assets</span>
              </button>
              <button
                onClick={() => setMainTab('investments')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all backdrop-blur-sm border-2 ${
                  mainTab === 'investments'
                    ? 'bg-white text-purple-600 border-white shadow-lg'
                    : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                <span>Investments</span>
              </button>
            </div>

            {/* Sub-tabs for Assets */}
            {mainTab === 'assets' && (
              <div className="flex gap-3">
                {isClusterHead && (
                  <button
                    onClick={() => setActiveTab('cluster-management')}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all backdrop-blur-sm border-2 ${
                      activeTab === 'cluster-management'
                        ? 'bg-white text-purple-600 border-white shadow-lg'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    }`}
                  >
                    <Settings className="w-5 h-5" />
                    <span>Cluster Settings</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('stores')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all backdrop-blur-sm border-2 ${
                    activeTab === 'stores'
                      ? 'bg-white text-purple-600 border-white shadow-lg'
                      : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <Store className="w-5 h-5" />
                  <span>Stores</span>
                </button>
                <button
                  onClick={() => setActiveTab('production-houses')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all backdrop-blur-sm border-2 ${
                    activeTab === 'production-houses'
                      ? 'bg-white text-purple-600 border-white shadow-lg'
                      : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <Factory className="w-5 h-5" />
                  <span>Production Houses</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {mainTab === 'investments' ? (
          <InvestmentsManagement context={context} />
        ) : activeTab === 'cluster-management' ? (
          <ClusterManagement context={context} />
        ) : activeTab === 'stores' ? (
          <StoreManagement onStoreCreated={onRefreshStores} userRole={context.user?.role} />
        ) : (
          <ProductionHouseManagement 
            context={context} 
            stores={stores} 
            employees={employees}
            onRefreshStores={onRefreshStores}
          />
        )}
      </div>
    </div>
  );
}