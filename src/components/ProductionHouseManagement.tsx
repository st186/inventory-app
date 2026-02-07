import { useState, useEffect } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Factory, MapPin, User, Plus, Package, Hash, Trash2 } from 'lucide-react';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  onRefreshStores: () => void;
};

export function ProductionHouseManagement({ context, stores, employees, onRefreshStores }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [productionHouseStocks, setProductionHouseStocks] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    productionHeadId: '',
  });
  const [transferData, setTransferData] = useState({
    fromHouseId: '',
    toHouseId: '',
    quantities: {
      chicken: 0,
      chickenCheese: 0,
      veg: 0,
      cheeseCorn: 0,
      paneer: 0,
      vegKurkure: 0,
      chickenKurkure: 0,
    },
  });

  const productionHeads = employees.filter(e => e.designation === 'production_incharge');

  // Calculate real-time stock for all production houses
  useEffect(() => {
    calculateAllProductionHouseStocks();
  }, [context.productionData, context.productionRequests, context.productionHouses]);

  const calculateAllProductionHouseStocks = async () => {
    if (!context.user?.accessToken || !context.productionHouses) return;

    const stocks: Record<string, any> = {};
    const currentMonth = new Date().toISOString().substring(0, 7); // "2026-02"

    for (const house of context.productionHouses) {
      try {
        // Get recalibration data for this production house
        const recalResponse = await api.getRecalibrationByLocation(
          context.user.accessToken,
          house.id,
          'production_house'
        );

        // Calculate opening balance
        let openingBalance: any = {};
        if (recalResponse?.record && recalResponse.record.date.substring(0, 7) === currentMonth) {
          // Use recalibration from current month as opening balance
          recalResponse.record.items.forEach((item: any) => {
            const inventoryItem = context.inventoryItems?.find(invItem => 
              invItem.id === item.itemId || invItem.name === item.itemId
            );
            if (inventoryItem) {
              const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
              const stockKey = camelName.replace(/Momo(s)?$/i, '');
              openingBalance[stockKey] = item.actualQuantity;
            }
          });
        } else {
          // No recalibration - start from 0
          openingBalance = {
            chicken: 0,
            chickenCheese: 0,
            veg: 0,
            cheeseCorn: 0,
            paneer: 0,
            vegKurkure: 0,
            chickenKurkure: 0,
          };
        }

        // Filter production data for this house and current month
        const houseProduction = (context.productionData || []).filter(
          (p: any) => 
            p.productionHouseId === house.id && 
            p.date.substring(0, 7) === currentMonth &&
            p.approvalStatus === 'approved'
        );

        // Sum up production
        const totalProduced: any = {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        };

        houseProduction.forEach((prod: any) => {
          const inventoryItem = context.inventoryItems?.find(item => item.id === prod.itemId);
          if (inventoryItem) {
            const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            const stockKey = camelName.replace(/Momo(s)?$/i, '');
            totalProduced[stockKey] = (totalProduced[stockKey] || 0) + prod.quantityProduced;
          }
        });

        // Filter fulfilled requests for this house and current month
        const houseRequests = (context.productionRequests || []).filter(
          (req: any) =>
            req.productionHouseId === house.id &&
            req.status === 'fulfilled' &&
            req.fulfilledDate &&
            req.fulfilledDate.substring(0, 7) === currentMonth
        );

        // Sum up deliveries
        const totalDelivered: any = {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        };

        houseRequests.forEach((req: any) => {
          // Support both formats
          totalDelivered.chicken += (req.chickenMomos || req.chicken || 0);
          totalDelivered.chickenCheese += (req.chickenCheeseMomos || req.chickenCheese || 0);
          totalDelivered.veg += (req.vegMomos || req.veg || 0);
          totalDelivered.cheeseCorn += (req.cheeseCornMomos || req.cheeseCorn || 0);
          totalDelivered.paneer += (req.paneerMomos || req.paneer || 0);
          totalDelivered.vegKurkure += (req.vegKurkureMomos || req.vegKurkure || 0);
          totalDelivered.chickenKurkure += (req.chickenKurkureMomos || req.chickenKurkure || 0);
        });

        // Calculate final stock: Opening + Production - Delivered
        const currentStock: any = {};
        Object.keys(openingBalance).forEach(key => {
          currentStock[key] = (openingBalance[key] || 0) + (totalProduced[key] || 0) - (totalDelivered[key] || 0);
        });

        stocks[house.id] = currentStock;
      } catch (error) {
        console.error(`Error calculating stock for ${house.name}:`, error);
        // Default to zeros on error
        stocks[house.id] = {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        };
      }
    }

    setProductionHouseStocks(stocks);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await context.addProductionHouse({
        name: formData.name,
        location: formData.location,
        productionHeadId: formData.productionHeadId || null,
        inventory: {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        },
        createdBy: context.user?.employeeId || context.user?.email || 'unknown',
      });

      alert('Production house created successfully!');
      setShowCreateForm(false);
      setFormData({ name: '', location: '', productionHeadId: '' });
    } catch (error) {
      console.error('Error creating production house:', error);
      alert('Failed to create production house. Please try again.');
    }
  };

  const handleAssignProductionHead = async (houseId: string, headId: string) => {
    try {
      if (!context.user?.accessToken) return;
      
      await api.assignProductionHeadToHouse(context.user.accessToken, houseId, headId);
      
      // Update locally
      await context.updateProductionHouse(houseId, { productionHeadId: headId });
      
      // Reload employees to get updated storeId for the production head
      alert('Production head assigned successfully! Please refresh the page for changes to take effect.');
    } catch (error) {
      console.error('Error assigning production head:', error);
      alert('Failed to assign production head. Please try again.');
    }
  };

  const handleAssignStoreToHouse = async (storeId: string, houseId: string) => {
    try {
      if (!context.user?.accessToken) return;
      
      await api.assignStoreToProductionHouse(context.user.accessToken, storeId, houseId);
      
      alert('Store assigned to production house successfully!');
      onRefreshStores(); // Refresh stores to show updated mapping
    } catch (error) {
      console.error('Error assigning store:', error);
      alert('Failed to assign store. Please try again.');
    }
  };

  const handleDeleteProductionHouse = async (houseId: string, houseName: string) => {
    // Confirm deletion
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${houseName}"?\n\nThis action cannot be undone.`
    );
    
    if (!confirmDelete) return;
    
    try {
      await context.deleteProductionHouse(houseId);
      alert('Production house deleted successfully!');
    } catch (error) {
      console.error('Error deleting production house:', error);
      alert('Failed to delete production house. Please try again.');
    }
  };

  const handleTransferInventory = async () => {
    if (!transferData.fromHouseId || !transferData.toHouseId) {
      alert('Please select both source and destination production houses');
      return;
    }

    if (transferData.fromHouseId === transferData.toHouseId) {
      alert('Source and destination cannot be the same');
      return;
    }

    const totalTransfer = Object.values(transferData.quantities).reduce((sum, val) => sum + val, 0);
    if (totalTransfer === 0) {
      alert('Please enter quantities to transfer');
      return;
    }

    const fromHouse = context.productionHouses.find(h => h.id === transferData.fromHouseId);
    const toHouse = context.productionHouses.find(h => h.id === transferData.toHouseId);

    const confirmTransfer = window.confirm(
      `Transfer ${totalTransfer} pieces from "${fromHouse?.name}" to "${toHouse?.name}"?\n\nThis action cannot be undone.`
    );

    if (!confirmTransfer) return;

    try {
      if (!context.user?.accessToken) {
        alert('Not authenticated');
        return;
      }

      await api.transferInventoryBetweenHouses(
        context.user.accessToken,
        transferData.fromHouseId,
        transferData.toHouseId,
        transferData.quantities
      );
      
      // Refresh production houses
      const houses = await api.getProductionHouses(context.user.accessToken);
      context.setProductionHouses(houses);

      alert('Inventory transferred successfully!');
      setShowTransferDialog(false);
      setTransferData({
        fromHouseId: '',
        toHouseId: '',
        quantities: {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        },
      });
    } catch (error: any) {
      console.error('Error transferring inventory:', error);
      alert(`Failed to transfer inventory: ${error.message || 'Unknown error'}`);
    }
  };

  const handleTransferAll = () => {
    const sourceHouse = context.productionHouses.find(h => h.id === transferData.fromHouseId);
    if (!sourceHouse) {
      alert('Please select a source production house first');
      return;
    }
    
    setTransferData({
      ...transferData,
      quantities: {
        chicken: sourceHouse.inventory.chicken,
        chickenCheese: sourceHouse.inventory.chickenCheese,
        veg: sourceHouse.inventory.veg,
        cheeseCorn: sourceHouse.inventory.cheeseCorn,
        paneer: sourceHouse.inventory.paneer,
        vegKurkure: sourceHouse.inventory.vegKurkure,
        chickenKurkure: sourceHouse.inventory.chickenKurkure,
      },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-gray-900 flex items-center gap-3">
            <Factory className="w-8 h-8 text-purple-600" />
            Production House Management
          </h1>
          <p className="text-gray-600 mt-2">Manage production houses, inventory, and store mappings</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTransferDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Package className="w-5 h-5" />
            Transfer Inventory
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Production House
          </button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl text-gray-900 mb-4">Create New Production House</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Main Production House"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Location *</label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g., Sector 21, Dwarka"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Production Head (Optional)</label>
                <select
                  value={formData.productionHeadId}
                  onChange={(e) => setFormData({ ...formData, productionHeadId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select Production Head</option>
                  {productionHeads.map(head => (
                    <option key={head.employeeId} value={head.employeeId}>
                      {head.name} ({head.employeeId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormData({ name: '', location: '', productionHeadId: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Inventory Dialog */}
      {showTransferDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl text-gray-900 mb-6 flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" />
              Transfer Inventory Between Production Houses
            </h2>
            
            <div className="space-y-6">
              {/* Source and Destination Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Source Production House *</label>
                  <select
                    value={transferData.fromHouseId}
                    onChange={(e) => setTransferData({ ...transferData, fromHouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select source...</option>
                    {context.productionHouses.map(house => (
                      <option key={house.id} value={house.id}>
                        {house.name} - {house.location}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Destination Production House *</label>
                  <select
                    value={transferData.toHouseId}
                    onChange={(e) => setTransferData({ ...transferData, toHouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select destination...</option>
                    {context.productionHouses
                      .filter(h => h.id !== transferData.fromHouseId)
                      .map(house => (
                        <option key={house.id} value={house.id}>
                          {house.name} - {house.location}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Current Stock Display */}
              {transferData.fromHouseId && (() => {
                const sourceHouse = context.productionHouses.find(h => h.id === transferData.fromHouseId);
                if (!sourceHouse) return null;
                
                return (
                  <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <h3 className="text-sm text-gray-900 mb-3">Available Stock at {sourceHouse.name}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Chicken</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.chicken}</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Chicken Cheese</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.chickenCheese}</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Veg</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.veg}</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Cheese Corn</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.cheeseCorn}</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Paneer</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.paneer}</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Veg Kurkure</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.vegKurkure}</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="text-xs text-gray-600">Chicken Kurkure</div>
                        <div className="text-sm text-gray-900">{sourceHouse.inventory.chickenKurkure}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Transfer Quantities */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm text-gray-900">Transfer Quantities</h3>
                  <button
                    type="button"
                    onClick={handleTransferAll}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Transfer All
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Chicken</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.chicken}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, chicken: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Chicken Cheese</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.chickenCheese}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, chickenCheese: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Veg</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.veg}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, veg: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Cheese Corn</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.cheeseCorn}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, cheeseCorn: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Paneer</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.paneer}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, paneer: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Veg Kurkure</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.vegKurkure}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, vegKurkure: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Chicken Kurkure</label>
                    <input
                      type="number"
                      min="0"
                      value={transferData.quantities.chickenKurkure}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantities: { ...transferData.quantities, chickenKurkure: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Total Transfer Summary */}
              <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">Total Pieces to Transfer:</span>
                  <span className="text-2xl text-green-600">
                    {Object.values(transferData.quantities).reduce((sum, val) => sum + val, 0)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransferDialog(false);
                    setTransferData({
                      fromHouseId: '',
                      toHouseId: '',
                      quantities: {
                        chicken: 0,
                        chickenCheese: 0,
                        veg: 0,
                        cheeseCorn: 0,
                        paneer: 0,
                        vegKurkure: 0,
                        chickenKurkure: 0,
                      },
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTransferInventory}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Transfer Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Production Houses List */}
      <div className="space-y-6">
        {context.productionHouses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Factory className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl text-gray-900 mb-2">No Production Houses Yet</h3>
            <p className="text-gray-600 mb-6">Create your first production house to get started</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Production House
            </button>
          </div>
        ) : (
          context.productionHouses.map(house => {
            const head = productionHeads.find(h => h.employeeId === house.productionHeadId);
            const mappedStores = stores.filter(s => s.productionHouseId === house.id);
            const totalInventory = Object.values(house.inventory).reduce((sum, val) => sum + val, 0);

            return (
              <div key={house.id} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-2xl text-gray-900 mb-2">{house.name}</h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Hash className="w-4 h-4" />
                        <span className="text-sm font-mono bg-purple-100 text-purple-800 px-2 py-1 rounded">ID: {house.id}</span>
                      </div>
                      <div className="flex items-center gap-4 text-gray-600">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>{house.location}</span>
                        </div>
                        {head && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>{head.name} ({head.employeeId})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Total Inventory</div>
                    <div className="text-2xl text-purple-600">{totalInventory} pcs</div>
                  </div>
                </div>

                {/* Current Inventory */}
                <div className="mb-6">
                  <h4 className="text-gray-900 mb-3 flex items-center gap-2">
                    <Package className="w-5 h-5 text-purple-600" />
                    Current Stock Levels
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Chicken</div>
                      <div className="text-lg text-gray-900">{house.inventory.chicken}</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Chicken Cheese</div>
                      <div className="text-lg text-gray-900">{house.inventory.chickenCheese}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Veg</div>
                      <div className="text-lg text-gray-900">{house.inventory.veg}</div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Cheese Corn</div>
                      <div className="text-lg text-gray-900">{house.inventory.cheeseCorn}</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Paneer</div>
                      <div className="text-lg text-gray-900">{house.inventory.paneer}</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Veg Kurkure</div>
                      <div className="text-lg text-gray-900">{house.inventory.vegKurkure}</div>
                    </div>
                    <div className="bg-pink-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600 mb-1">Chicken Kurkure</div>
                      <div className="text-lg text-gray-900">{house.inventory.chickenKurkure}</div>
                    </div>
                  </div>
                </div>

                {/* Assign Production Head */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-gray-700">Assign Production Head</label>
                    {head && (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!context.user?.accessToken) return;
                            
                            // Show all production records for debugging
                            try {
                              const response = await fetch(`https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/production`, {
                                headers: {
                                  'Authorization': `Bearer ${context.user.accessToken}`
                                }
                              });
                              const data = await response.json();
                              console.log('🔍 ALL PRODUCTION RECORDS:', data.production);
                              
                              const recordsForThisHead = data.production.filter((r: any) => 
                                r.storeId === 'STORE-1766938921191-9LCH05' || 
                                r.productionHouseId === 'STORE-1766938921191-9LCH05' ||
                                r.productionHouseId === house.id
                              );
                              
                              console.log('📊 Records related to this production house:', recordsForThisHead);
                              console.log('📊 Current Production House ID:', house.id);
                              console.log('📊 Records by productionHouseId:');
                              recordsForThisHead.forEach((r: any) => {
                                console.log(`  - Record ${r.id.slice(0,8)} (${r.date}): storeId=${r.storeId}, productionHouseId=${r.productionHouseId}`);
                              });
                              
                              alert(`Found ${recordsForThisHead.length} records related to this production house.\n\nCheck console for details (F12).`);
                            } catch (error) {
                              console.error('Error fetching production data:', error);
                              alert('Failed to fetch data. Check console.');
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                          title="Show current production records in console for debugging"
                        >
                          🔍 Debug Records
                        </button>
                        <button
                          onClick={async () => {
                            if (!context.user?.accessToken) return;
                            
                            // Ask user for the OLD storeId that needs to be fixed
                            const oldStoreId = window.prompt(
                              `Enter the OLD storeId to fix (the wrong ID that production records currently have):\n\nFor example: STORE-1766938921191-9LCH05\n\nThis will update all production records from that ID to the correct production house ID: ${house.id}`
                            );
                            
                            if (!oldStoreId || oldStoreId.trim() === '') {
                              return; // User cancelled
                            }
                            
                            if (window.confirm(`Fix production records with OLD ID: ${oldStoreId}?\n\nThis will update them to use the correct production house ID: ${house.id}`)) {
                              try {
                                const result = await api.fixProductionRecords(context.user.accessToken, house.id, oldStoreId.trim());
                                alert(`✅ Fixed ${result.updatedCount} production records!\n\nPlease refresh the page.`);
                                window.location.reload();
                              } catch (error) {
                                console.error('Error fixing records:', error);
                                alert('Failed to fix records. Please try again.');
                              }
                            }
                          }}
                          className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
                          title="Fix old production records that have wrong productionHouseId"
                        >
                          🔧 Fix Old Records
                        </button>
                      </div>
                    )}
                  </div>
                  <select
                    value={house.productionHeadId || ''}
                    onChange={(e) => handleAssignProductionHead(house.id, e.target.value)}
                    className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">No Production Head Assigned</option>
                    {productionHeads.map(head => (
                      <option key={head.employeeId} value={head.employeeId}>
                        {head.name} ({head.employeeId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mapped Stores */}
                <div>
                  <h4 className="text-gray-900 mb-3">Mapped Stores ({mappedStores.length})</h4>
                  {mappedStores.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {mappedStores.map(store => (
                        <div key={store.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <div className="text-gray-900">{store.name}</div>
                            <div className="text-sm text-gray-600">{store.location}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No stores mapped to this production house yet</p>
                  )}
                </div>

                {/* Delete Production House */}
                <div className="mt-4">
                  <button
                    onClick={() => handleDeleteProductionHouse(house.id, house.name)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete Production House
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Unmapped Stores Section */}
      {context.productionHouses.length > 0 && (
        <div className="mt-8 bg-yellow-50 rounded-xl p-6 border-2 border-yellow-200">
          <h3 className="text-lg text-gray-900 mb-4">⚠️ Unmapped Stores</h3>
          {stores.filter(s => !s.productionHouseId).length === 0 ? (
            <p className="text-gray-600">All stores are mapped to production houses ✓</p>
          ) : (
            <div className="space-y-3">
              {stores.filter(s => !s.productionHouseId).map(store => (
                <div key={store.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="text-gray-900">{store.name}</div>
                    <div className="text-sm text-gray-600">{store.location}</div>
                  </div>
                  <select
                    onChange={(e) => e.target.value && handleAssignStoreToHouse(store.id, e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    defaultValue=""
                  >
                    <option value="">Assign to Production House</option>
                    {context.productionHouses.map(house => (
                      <option key={house.id} value={house.id}>
                        {house.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}