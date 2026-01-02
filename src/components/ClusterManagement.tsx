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
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8" />
          <h2 className="text-2xl">Cluster Management</h2>
        </div>
        <p className="text-purple-100">
          Assign stores and production houses to your cluster. You'll be able to view reports and analytics for all assigned locations.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <Store className="w-8 h-8 mb-2 opacity-90" />
          <p className="text-sm opacity-90 mb-1">Assigned Stores</p>
          <p className="text-3xl">{selectedStoreIds.length}</p>
          <p className="text-xs opacity-75 mt-1">of {context.stores.length} total</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
          <Building2 className="w-8 h-8 mb-2 opacity-90" />
          <p className="text-sm opacity-90 mb-1">Production Houses</p>
          <p className="text-3xl">{selectedProductionHouseIds.length}</p>
          <p className="text-xs opacity-75 mt-1">of {context.productionHouses.length} total</p>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white">
          <Users className="w-8 h-8 mb-2 opacity-90" />
          <p className="text-sm opacity-90 mb-1">Total Locations</p>
          <p className="text-3xl">{selectedStoreIds.length + selectedProductionHouseIds.length}</p>
          <p className="text-xs opacity-75 mt-1">in your cluster</p>
        </div>
      </div>

      {/* Stores Section */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Store className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg text-gray-900">Stores</h3>
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
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-purple-300'
                  }`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500'
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
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg text-gray-900">Production Houses</h3>
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
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-purple-300'
                  }`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500'
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
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
