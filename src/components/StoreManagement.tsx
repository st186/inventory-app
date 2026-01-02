import { useState, useEffect } from 'react';
import { Store, Plus, MapPin, User, Edit2, Check, X, UserCog, Download, Factory } from 'lucide-react';
import * as api from '../utils/api';

type StoreManagementProps = {
  onStoreCreated?: () => void;
  userRole?: string;
};

export function StoreManagement({ onStoreCreated, userRole }: StoreManagementProps) {
  const [stores, setStores] = useState<api.Store[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [productionHouses, setProductionHouses] = useState<api.ProductionHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingStore, setEditingStore] = useState<string | null>(null);
  const [assigningManager, setAssigningManager] = useState<string | null>(null);
  const [changingProductionHouse, setChangingProductionHouse] = useState<string | null>(null);
  
  // Create form
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Edit form
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [updating, setUpdating] = useState(false);
  
  // Manager assignment
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  // Production house assignment
  const [selectedProductionHouseId, setSelectedProductionHouseId] = useState<string>('');
  const [assigningProductionHouse, setAssigningProductionHouse] = useState(false);

  useEffect(() => {
    loadStores();
    loadManagers();
    loadProductionHouses();
  }, []);

  const loadStores = async () => {
    try {
      const data = await api.getStores();
      setStores(data);
    } catch (error) {
      // Silently handle authentication errors (user not logged in yet)
      if (error instanceof Error && 
          (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
        return;
      }
      console.error('Error loading stores:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    try {
      const employees = await api.getAllEmployees();
      // Filter only managers
      const managersList = employees.filter((emp: any) => emp.role === 'manager');
      setManagers(managersList);
    } catch (error) {
      console.error('Error loading managers:', error);
    }
  };

  const loadProductionHouses = async () => {
    try {
      const data = await api.getProductionHouses();
      setProductionHouses(data);
    } catch (error) {
      console.error('Error loading production houses:', error);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newStoreName.trim()) {
      alert('Please enter a store name');
      return;
    }

    setCreating(true);
    try {
      await api.createStore(newStoreName, newStoreLocation);
      setNewStoreName('');
      setNewStoreLocation('');
      setShowCreateForm(false);
      await loadStores();
      if (onStoreCreated) onStoreCreated();
    } catch (error: any) {
      console.error('Error creating store:', error);
      alert(error.message || 'Failed to create store');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (store: api.Store) => {
    setEditingStore(store.id);
    setEditName(store.name);
    setEditLocation(store.location);
  };

  const handleSaveEdit = async (storeId: string) => {
    if (!editName.trim()) {
      alert('Please enter a store name');
      return;
    }

    setUpdating(true);
    try {
      await api.updateStore(storeId, editName, editLocation);
      setEditingStore(null);
      await loadStores();
    } catch (error: any) {
      console.error('Error updating store:', error);
      alert(error.message || 'Failed to update store');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingStore(null);
    setEditName('');
    setEditLocation('');
  };

  const handleStartAssignManager = (store: api.Store) => {
    setAssigningManager(store.id);
    setSelectedManagerId(store.managerId || '');
  };

  const handleAssignManager = async (storeId: string) => {
    if (!selectedManagerId) {
      alert('Please select a manager');
      return;
    }

    setAssigning(true);
    try {
      await api.assignManagerToStore(storeId, selectedManagerId);
      setAssigningManager(null);
      setSelectedManagerId('');
      await loadStores();
      await loadManagers();
      alert('Manager assigned successfully!');
    } catch (error: any) {
      console.error('Error assigning manager:', error);
      alert(error.message || 'Failed to assign manager');
    } finally {
      setAssigning(false);
    }
  };

  const handleCancelAssign = () => {
    setAssigningManager(null);
    setSelectedManagerId('');
  };

  const handleMigrateData = async (store: api.Store) => {
    if (!confirm(`Migrate all existing data (inventory, sales, payroll, employees) to ${store.name}? This will assign all data without a store to this store.`)) {
      return;
    }

    try {
      const result = await api.migrateDataToStore(store.id);
      alert(`✅ Migration successful!\n\n` +
        `Inventory: ${result.migratedCount.inventory}\n` +
        `Overheads: ${result.migratedCount.overheads}\n` +
        `Sales: ${result.migratedCount.sales}\n` +
        `Employees: ${result.migratedCount.employees}\n` +
        `Timesheets: ${result.migratedCount.timesheets}\n` +
        `Leaves: ${result.migratedCount.leaves}\n` +
        `Payouts: ${result.migratedCount.payouts}`
      );
    } catch (error: any) {
      console.error('Error migrating data:', error);
      alert(error.message || 'Failed to migrate data');
    }
  };

  const handleStartChangeProductionHouse = (store: api.Store) => {
    setChangingProductionHouse(store.id);
    setSelectedProductionHouseId(store.productionHouseId || '');
  };

  const handleChangeProductionHouse = async (storeId: string) => {
    if (!selectedProductionHouseId) {
      alert('Please select a production house');
      return;
    }

    setAssigningProductionHouse(true);
    try {
      await api.assignProductionHouseToStore(storeId, selectedProductionHouseId);
      setChangingProductionHouse(null);
      setSelectedProductionHouseId('');
      await loadStores();
      await loadProductionHouses();
      // Notify parent to refresh stores
      if (onStoreCreated) onStoreCreated();
      alert('Production house assigned successfully!');
    } catch (error: any) {
      console.error('Error assigning production house:', error);
      alert(error.message || 'Failed to assign production house');
    } finally {
      setAssigningProductionHouse(false);
    }
  };

  const handleCancelChangeProductionHouse = () => {
    setChangingProductionHouse(null);
    setSelectedProductionHouseId('');
  };

  const getManagerName = (managerId?: string) => {
    if (!managerId) return null;
    const manager = managers.find(m => m.employeeId === managerId);
    return manager ? `${manager.name} (${manager.employeeId})` : 'Unknown Manager';
  };

  const getProductionHouseName = (productionHouseId?: string) => {
    if (!productionHouseId) return null;
    const productionHouse = productionHouses.find(ph => ph.id === productionHouseId);
    return productionHouse ? `${productionHouse.name} (${productionHouse.id})` : 'Unknown Production House';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading stores...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-900 mb-1">🏪 Store Management</h2>
          <p className="text-sm text-gray-600">Manage your stores and assign managers</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Store
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
          <h3 className="text-lg text-gray-900 mb-4">Create New Store</h3>
          <form onSubmit={handleCreateStore} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Store Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="e.g., Downtown Branch, Main Street Store"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Location (Optional)
              </label>
              <input
                type="text"
                value={newStoreLocation}
                onChange={(e) => setNewStoreLocation(e.target.value)}
                placeholder="e.g., 123 Main St, City"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Store'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewStoreName('');
                  setNewStoreLocation('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stores List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.length === 0 ? (
          <div className="col-span-full bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Store className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-500 mb-2">No stores yet</p>
            <p className="text-sm text-gray-400">Create your first store to get started</p>
          </div>
        ) : (
          stores.map((store) => (
            <div
              key={store.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              {editingStore === store.id ? (
                // Edit Mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Store Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(store.id)}
                      disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={updating}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : assigningManager === store.id ? (
                // Manager Assignment Mode
                <div className="space-y-4">
                  <h4 className="text-gray-900">Assign Manager to {store.name}</h4>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Select Manager</label>
                    <select
                      value={selectedManagerId}
                      onChange={(e) => setSelectedManagerId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Choose a manager...</option>
                      {managers.filter(m => !m.storeId || m.storeId === store.id).map((manager) => (
                        <option key={manager.employeeId} value={manager.employeeId}>
                          {manager.name} ({manager.employeeId})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Only unassigned managers or current manager shown
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAssignManager(store.id)}
                      disabled={assigning || !selectedManagerId}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      {assigning ? 'Assigning...' : 'Assign'}
                    </button>
                    <button
                      onClick={handleCancelAssign}
                      disabled={assigning}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : changingProductionHouse === store.id ? (
                // Production House Assignment Mode
                <div className="space-y-4">
                  <h4 className="text-gray-900">Assign Production House to {store.name}</h4>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Select Production House</label>
                    <select
                      value={selectedProductionHouseId}
                      onChange={(e) => setSelectedProductionHouseId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Choose a production house...</option>
                      {productionHouses.map((productionHouse) => (
                        <option key={productionHouse.id} value={productionHouse.id}>
                          {productionHouse.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Select which production house will serve this store
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleChangeProductionHouse(store.id)}
                      disabled={assigningProductionHouse || !selectedProductionHouseId}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      {assigningProductionHouse ? 'Assigning...' : 'Assign'}
                    </button>
                    <button
                      onClick={handleCancelChangeProductionHouse}
                      disabled={assigningProductionHouse}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Store className="w-5 h-5 text-purple-600" />
                      <h3 className="text-gray-900">{store.name}</h3>
                    </div>
                    <button
                      onClick={() => handleStartEdit(store)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {store.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <MapPin className="w-4 h-4" />
                      <span>{store.location}</span>
                    </div>
                  )}
                  
                  <div className="pt-3 border-t border-gray-200 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">
                        {store.managerId ? (
                          <span className="text-green-600">{getManagerName(store.managerId)}</span>
                        ) : (
                          <span className="text-orange-600">No Manager Assigned</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Factory className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">
                        {store.productionHouseId ? (
                          <span className="text-green-600">{getProductionHouseName(store.productionHouseId)}</span>
                        ) : (
                          <span className="text-orange-600">No Production House Mapped</span>
                        )}
                      </span>
                    </div>
                    
                    <button
                      onClick={() => handleStartAssignManager(store)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                    >
                      <UserCog className="w-4 h-4" />
                      {store.managerId ? 'Change Manager' : 'Assign Manager'}
                    </button>

                    <button
                      onClick={() => handleStartChangeProductionHouse(store)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm"
                    >
                      <Factory className="w-4 h-4" />
                      {store.productionHouseId ? 'Change Production House' : 'Assign Production House'}
                    </button>
                    
                    {userRole === 'cluster_head' && (
                      <button
                        onClick={() => handleMigrateData(store)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Migrate Data
                      </button>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-2">
                      ID: {store.id}
                    </p>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}