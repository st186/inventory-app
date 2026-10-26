import { useState, useEffect } from 'react';
import { Users, Building2, Store, CheckCircle, XCircle, Settings } from 'lucide-react';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { InventoryContextType } from '../App';

type ClusterManagementProps = {
  context: InventoryContextType;
};

export function ClusterManagement({ context }: ClusterManagementProps) {
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedProductionHouseIds, setSelectedProductionHouseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize with current assignments from context
  useEffect(() => {
    if (context.managedStoreIds && context.managedProductionHouseIds) {
      setSelectedStoreIds(context.managedStoreIds);
      setSelectedProductionHouseIds(context.managedProductionHouseIds);
    }
  }, [context.managedStoreIds, context.managedProductionHouseIds]);

  // Check if there are changes
  useEffect(() => {
    const storesChanged = JSON.stringify([...selectedStoreIds].sort()) !== 
                          JSON.stringify([...(context.managedStoreIds || [])].sort());
    const phChanged = JSON.stringify([...selectedProductionHouseIds].sort()) !== 
                      JSON.stringify([...(context.managedProductionHouseIds || [])].sort());
    setHasChanges(storesChanged || phChanged);
  }, [selectedStoreIds, selectedProductionHouseIds, context.managedStoreIds, context.managedProductionHouseIds]);

  const toggleStore = (storeId: string) => {
    setSelectedStoreIds(prev => 
      prev.includes(storeId) 
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  const toggleProductionHouse = (phId: string) => {
    setSelectedProductionHouseIds(prev => 
      prev.includes(phId) 
        ? prev.filter(id => id !== phId)
        : [...prev, phId]
    );
  };

  const handleSave = async () => {
    if (!context.user?.employeeId || !context.user?.accessToken) {
      toast.error('Employee ID not found');
      return;
    }

    setLoading(true);
    try {
      await api.updateClusterAssignments(
        context.user.accessToken,
        context.user.employeeId,
        selectedStoreIds,
        selectedProductionHouseIds
      );
      
      toast.success('Cluster assignments updated successfully! Refreshing...');
      
      // Reload the page to update context with new assignments
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error updating cluster assignments:', error);
      toast.error('Failed to update cluster assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedStoreIds(context.managedStoreIds || []);
    setSelectedProductionHouseIds(context.managedProductionHouseIds || []);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-600 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="absolute inset-0 bg-white/10" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/20 rounded-2xl flex items-center justify-center border-2 border-white/30 flex-shrink-0">
            <Settings className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">Cluster Management</h1>
            <p className="text-sm sm:text-base text-white/80 mt-1">
              Assign stores and production houses to your cluster. You'll be able to view reports and analytics for all assigned locations.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg shadow-blue-500/20 text-white">
          <Store className="w-8 h-8 mb-2 opacity-90" />
          <p className="text-sm opacity-90 mb-1">Assigned Stores</p>
          <p className="text-2xl font-semibold">{selectedStoreIds.length}</p>
          <p className="text-xs opacity-75 mt-1">of {context.stores.length} total</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 shadow-lg shadow-orange-500/20 text-white">
          <Building2 className="w-8 h-8 mb-2 opacity-90" />
          <p className="text-sm opacity-90 mb-1">Production Houses</p>
          <p className="text-2xl font-semibold">{selectedProductionHouseIds.length}</p>
          <p className="text-xs opacity-75 mt-1">of {context.productionHouses.length} total</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 shadow-lg shadow-emerald-500/20 text-white">
          <Users className="w-8 h-8 mb-2 opacity-90" />
          <p className="text-sm opacity-90 mb-1">Total Locations</p>
          <p className="text-2xl font-semibold">{selectedStoreIds.length + selectedProductionHouseIds.length}</p>
          <p className="text-xs opacity-75 mt-1">in your cluster</p>
        </div>
      </div>

      {/* Stores Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Store className="w-5 h-5 text-teal-600" />
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Stores</h3>
          <span className="ml-auto text-sm text-gray-500">
            {selectedStoreIds.length} selected
          </span>
        </div>
        
        {context.stores.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No stores available</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {context.stores.map(store => {
              const isSelected = selectedStoreIds.includes(store.id);
              return (
                <button
                  key={store.id}
                  onClick={() => toggleStore(store.id)}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white hover:border-orange-300'
                  }`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-orange-500 bg-orange-500'
                      : 'border-gray-300 bg-white'
                  }`}>
                    {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{store.name}</p>
                    <p className="text-xs text-gray-500">{store.location}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Production Houses Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-teal-600" />
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Production Houses</h3>
          <span className="ml-auto text-sm text-gray-500">
            {selectedProductionHouseIds.length} selected
          </span>
        </div>
        
        {context.productionHouses.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No production houses available</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {context.productionHouses.map(ph => {
              const isSelected = selectedProductionHouseIds.includes(ph.id);
              return (
                <button
                  key={ph.id}
                  onClick={() => toggleProductionHouse(ph.id)}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white hover:border-orange-300'
                  }`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-orange-500 bg-orange-500'
                      : 'border-gray-300 bg-white'
                  }`}>
                    {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{ph.name}</p>
                    <p className="text-xs text-gray-500">{ph.location}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-white border-t-2 border-gray-200 p-4 rounded-lg shadow-lg">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <button
              onClick={handleReset}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              Cancel Changes
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Save Cluster Assignments
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
