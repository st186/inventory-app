import { useState, useEffect } from 'react';
import { InventoryContextType } from '../App';
import { Plus, Trash2, Edit2, Package, Check, X, AlertCircle, Factory, Store as StoreIcon } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { projectId, publicAnonKey } from '../utils/supabase/info';

type Props = {
  context: InventoryContextType;
};

export interface InventoryItem {
  id: string;
  name: string;
  displayName: string;
  category: 'finished_product' | 'raw_material' | 'sauce_chutney';
  unit: string;
  linkedEntityType: 'store' | 'production_house' | 'global';
  linkedEntityId?: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

export function InventoryItemsManagement({ context }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    displayName: '',
    category: 'finished_product' as 'finished_product' | 'raw_material' | 'sauce_chutney',
    unit: 'pieces',
    linkedEntityType: 'global' as 'store' | 'production_house' | 'global',
    linkedEntityId: '',
  });

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterEntityType, setFilterEntityType] = useState<string>('all');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load inventory items');
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('Error loading items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const name = formData.displayName.toLowerCase().replace(/\s+/g, '_');
      
      const payload = {
        name,
        displayName: formData.displayName,
        category: formData.category,
        unit: formData.unit,
        linkedEntityType: formData.linkedEntityType,
        linkedEntityId: formData.linkedEntityType === 'global' ? undefined : formData.linkedEntityId,
        userId: context.user?.employeeId || 'unknown',
      };

      const url = editingId 
        ? `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items/${editingId}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items`;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save item');
      }

      setSuccess(editingId ? 'Item updated successfully!' : 'Item created successfully!');
      setShowAddForm(false);
      setEditingId(null);
      setFormData({
        displayName: '',
        category: 'finished_product',
        unit: 'pieces',
        linkedEntityType: 'global',
        linkedEntityId: '',
      });
      await loadItems();
    } catch (err) {
      console.error('Error saving item:', err);
      setError(err instanceof Error ? err.message : 'Failed to save item');
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setFormData({
      displayName: item.displayName,
      category: item.category,
      unit: item.unit,
      linkedEntityType: item.linkedEntityType,
      linkedEntityId: item.linkedEntityId || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      setSuccess('Item deleted successfully!');
      await loadItems();
    } catch (err) {
      console.error('Error deleting item:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const handleInitializeDefaults = async () => {
    if (!confirm('This will add the 7 default momo types as global items. Continue?')) return;

    try {
      setLoading(true);
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items/initialize-defaults`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to initialize defaults');
      }

      setSuccess('Default items initialized successfully!');
      await loadItems();
    } catch (err) {
      console.error('Error initializing defaults:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize defaults');
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setShowAddForm(false);
    setEditingId(null);
    setFormData({
      displayName: '',
      category: 'finished_product',
      unit: 'pieces',
      linkedEntityType: 'global',
      linkedEntityId: '',
    });
  };

  const filteredItems = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterEntityType !== 'all' && item.linkedEntityType !== filterEntityType) return false;
    return true;
  });

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'finished_product': return 'bg-purple-100 text-purple-800';
      case 'raw_material': return 'bg-blue-100 text-blue-800';
      case 'sauce_chutney': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getEntityTypeIcon = (type: string) => {
    switch (type) {
      case 'store': return <StoreIcon className="w-4 h-4" />;
      case 'production_house': return <Factory className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-gray-900 mb-2">Inventory Items Master</h1>
          <p className="text-gray-600">
            Manage all inventory items for stores and production houses
          </p>
        </div>
        <div className="flex gap-3">
          {items.length === 0 && (
            <button
              onClick={handleInitializeDefaults}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50"
            >
              Initialize Defaults
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            Add New Item
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-600" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <Card className="p-6 border-2 border-purple-200">
          <h2 className="text-xl mb-4">
            {editingId ? 'Edit Item' : 'Add New Item'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2 text-gray-700">Display Name *</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g., Schezwan Momo"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="finished_product">Finished Product</option>
                  <option value="raw_material">Raw Material</option>
                  <option value="sauce_chutney">Sauce/Chutney</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700">Unit *</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="pieces">Pieces</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="liters">Liters</option>
                  <option value="grams">Grams</option>
                  <option value="ml">Milliliters (ml)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2 text-gray-700">Link To *</label>
                <select
                  value={formData.linkedEntityType}
                  onChange={(e) => setFormData({ ...formData, linkedEntityType: e.target.value as any, linkedEntityId: '' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                >
                  <option value="global">All (Global)</option>
                  <option value="store">Specific Store</option>
                  <option value="production_house">Specific Production House</option>
                </select>
              </div>

              {formData.linkedEntityType === 'store' && (
                <div>
                  <label className="block text-sm mb-2 text-gray-700">Select Store *</label>
                  <select
                    value={formData.linkedEntityId}
                    onChange={(e) => setFormData({ ...formData, linkedEntityId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="">-- Select Store --</option>
                    {context.stores?.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {formData.linkedEntityType === 'production_house' && (
                <div>
                  <label className="block text-sm mb-2 text-gray-700">Select Production House *</label>
                  <select
                    value={formData.linkedEntityId}
                    onChange={(e) => setFormData({ ...formData, linkedEntityId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="">-- Select Production House --</option>
                    {context.productionHouses?.map(ph => (
                      <option key={ph.id} value={ph.id}>{ph.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelEdit}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg"
              >
                {editingId ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700">Filter by Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Categories</option>
              <option value="finished_product">Finished Products</option>
              <option value="raw_material">Raw Materials</option>
              <option value="sauce_chutney">Sauces/Chutneys</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700">Filter by Type</label>
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Types</option>
              <option value="global">Global Items</option>
              <option value="store">Store Specific</option>
              <option value="production_house">Production House Specific</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Items List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading items...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl text-gray-600 mb-2">No items found</h3>
          <p className="text-gray-500 mb-4">Get started by adding your first inventory item</p>
          {items.length === 0 && (
            <button
              onClick={handleInitializeDefaults}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg"
            >
              Initialize Default Items
            </button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => (
            <Card key={item.id} className="p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getEntityTypeIcon(item.linkedEntityType)}
                  <h3 className="font-semibold text-gray-900">{item.displayName}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className={getCategoryColor(item.category)}>
                    {item.category.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-gray-500">• {item.unit}</span>
                </div>

                <div className="text-gray-600">
                  <span className="font-medium">Scope:</span>{' '}
                  {item.linkedEntityType === 'global' 
                    ? 'All Entities' 
                    : item.linkedEntityType === 'store'
                    ? `Store: ${context.stores?.find(s => s.id === item.linkedEntityId)?.name || 'Unknown'}`
                    : `Production House: ${context.productionHouses?.find(ph => ph.id === item.linkedEntityId)?.name || 'Unknown'}`
                  }
                </div>

                <div className="text-xs text-gray-400 pt-2 border-t">
                  Created: {new Date(item.createdAt).toLocaleDateString()}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      <Card className="p-6 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl text-purple-600">{items.filter(i => i.isActive).length}</div>
            <div className="text-sm text-gray-600">Total Items</div>
          </div>
          <div>
            <div className="text-2xl text-blue-600">{items.filter(i => i.linkedEntityType === 'global').length}</div>
            <div className="text-sm text-gray-600">Global Items</div>
          </div>
          <div>
            <div className="text-2xl text-green-600">{items.filter(i => i.linkedEntityType === 'store').length}</div>
            <div className="text-sm text-gray-600">Store Specific</div>
          </div>
          <div>
            <div className="text-2xl text-orange-600">{items.filter(i => i.linkedEntityType === 'production_house').length}</div>
            <div className="text-sm text-gray-600">Production House</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
