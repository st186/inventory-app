import { useState, useEffect } from 'react';
import { InventoryItem } from '../App';
import { INVENTORY_CATEGORIES, CATEGORY_ITEMS } from '../utils/inventoryData';
import { X } from 'lucide-react';
import * as api from '../utils/api';

type Props = {
  selectedDate: string;
  editingItem?: InventoryItem | null;
  onSubmit: (item: Omit<InventoryItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
};

export function InventoryForm({ selectedDate, editingItem, onSubmit, onClose }: Props) {
  const [formData, setFormData] = useState({
    category: (editingItem?.category || 'fresh_produce') as InventoryItem['category'],
    itemName: editingItem?.itemName || '',
    customItem: editingItem ? !CATEGORY_ITEMS[editingItem.category].includes(editingItem.itemName) : false,
    quantity: editingItem?.quantity.toString() || '',
    unit: editingItem?.unit || 'kg',
    totalCost: editingItem?.totalCost.toString() || ''
  });

  const [customItems, setCustomItems] = useState<Record<string, string[]>>({});
  const [loadingCustomItems, setLoadingCustomItems] = useState(true);

  // Load custom items on mount
  useEffect(() => {
    loadCustomItems();
  }, []);

  const loadCustomItems = async () => {
    try {
      const items = await api.getCustomItems();
      // Transform array to Record<category, itemName[]>
      const itemsByCategory: Record<string, string[]> = {};
      items.forEach((item) => {
        if (!itemsByCategory[item.category]) {
          itemsByCategory[item.category] = [];
        }
        itemsByCategory[item.category].push(item.itemName);
      });
      setCustomItems(itemsByCategory);
    } catch (error) {
      // Silently handle error - custom items are optional
      console.log('Could not load custom items:', error);
    } finally {
      setLoadingCustomItems(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const quantity = parseFloat(formData.quantity);
    const totalCost = parseFloat(formData.totalCost);
    const costPerUnit = quantity > 0 ? totalCost / quantity : 0;
    
    // If this is a new custom item, save it and reload the list
    if (formData.customItem && formData.itemName) {
      try {
        await api.addCustomItem(formData.category, formData.itemName);
        console.log('Custom item saved:', formData.itemName);
        // Reload custom items to update the dropdown
        await loadCustomItems();
      } catch (error) {
        console.error('Error saving custom item:', error);
      }
    }
    
    onSubmit({
      date: selectedDate,
      category: formData.category,
      itemName: formData.itemName,
      quantity,
      unit: formData.unit,
      costPerUnit,
      totalCost
    });
  };

  // Merge base items with custom items for the selected category
  // Remove duplicates by converting to Set and back to array
  const categoryItems = [
    ...new Set([
      ...CATEGORY_ITEMS[formData.category],
      ...(customItems[formData.category] || [])
    ])
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gray-900">{editingItem ? 'Edit' : 'Add'} Inventory Item</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  category: e.target.value as InventoryItem['category'],
                  itemName: '',
                  customItem: false
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              {Object.entries(INVENTORY_CATEGORIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Item Name</label>
            {!formData.customItem ? (
              <div className="space-y-2">
                <select
                  value={formData.itemName}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setFormData({ ...formData, customItem: true, itemName: '' });
                    } else {
                      setFormData({ ...formData, itemName: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Select an item</option>
                  {categoryItems.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value="__custom__">+ Add Custom Item</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.itemName}
                  onChange={(e) =>
                    setFormData({ ...formData, itemName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Enter custom item name"
                  required
                />
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, customItem: false, itemName: '' })
                  }
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  ← Back to list
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Unit</label>
              <select
                value={formData.unit}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="mL">mL</option>
                <option value="pcs">pcs</option>
                <option value="units">units</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Total Cost (₹)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.totalCost}
              onChange={(e) =>
                setFormData({ ...formData, totalCost: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          {formData.quantity && formData.totalCost && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600">Cost per Unit</p>
              <p className="text-gray-900">
                ₹{(parseFloat(formData.totalCost) / parseFloat(formData.quantity)).toFixed(2)}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {editingItem ? 'Update' : 'Add'} Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}