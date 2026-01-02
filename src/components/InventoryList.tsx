import { useState } from 'react';
import { InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES, FIXED_COST_CATEGORIES } from '../utils/inventoryData';
import { Package, Receipt, Wallet, Edit2, Trash2 } from 'lucide-react';

type Props = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  onEditInventory: (item: InventoryItem) => void;
  onDeleteInventory: (id: string) => void;
  onEditOverhead: (item: OverheadItem) => void;
  onDeleteOverhead: (id: string) => void;
  onEditFixedCost: (item: FixedCostItem) => void;
  onDeleteFixedCost: (id: string) => void;
  isManager?: boolean;
};

export function InventoryList({ 
  inventory, 
  overheads,
  fixedCosts,
  onEditInventory,
  onDeleteInventory,
  onEditOverhead,
  onDeleteOverhead,
  onEditFixedCost,
  onDeleteFixedCost,
  isManager = true
}: Props) {
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'inventory' | 'overhead' | 'fixedcost', id: string } | null>(null);

  // Group inventory by category
  const groupedInventory = inventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const handleDelete = (type: 'inventory' | 'overhead' | 'fixedcost', id: string) => {
    if (type === 'inventory') {
      onDeleteInventory(id);
    } else if (type === 'overhead') {
      onDeleteOverhead(id);
    } else {
      onDeleteFixedCost(id);
    }
    setDeleteConfirm(null);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {/* Inventory Items */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-blue-600" />
            <h3 className="text-gray-900">Inventory Items</h3>
          </div>

          {inventory.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No inventory items for this date
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedInventory).map(([category, items]) => (
                <div key={category}>
                  <h4 className="text-sm text-gray-700 mb-3">
                    {INVENTORY_CATEGORIES[category as keyof typeof INVENTORY_CATEGORIES]}
                  </h4>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="text-gray-900">{item.itemName}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-blue-600">₹{item.totalCost.toLocaleString()}</span>
                            {isManager && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => onEditInventory(item)}
                                  className="p-1.5 hover:bg-blue-50 rounded text-blue-600 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({ type: 'inventory', id: item.id })}
                                  className="p-1.5 hover:bg-red-50 rounded text-red-600 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-4 text-sm text-gray-600">
                          <span>
                            {item.quantity} {item.unit}
                          </span>
                          <span>₹{item.costPerUnit}/{item.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overhead Costs */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-orange-600" />
            <h3 className="text-gray-900">Overhead Costs</h3>
          </div>

          {overheads.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No overhead costs for this date
            </p>
          ) : (
            <div className="space-y-3">
              {overheads.map((item) => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-gray-900">{OVERHEAD_CATEGORIES[item.category]}</p>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-orange-600">₹{item.amount.toLocaleString()}</span>
                      {isManager && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditOverhead(item)}
                            className="p-1.5 hover:bg-orange-50 rounded text-orange-600 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ type: 'overhead', id: item.id })}
                            className="p-1.5 hover:bg-red-50 rounded text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Costs */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-green-600" />
            <h3 className="text-gray-900">Fixed Costs</h3>
          </div>

          {fixedCosts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No fixed costs for this date
            </p>
          ) : (
            <div className="space-y-3">
              {fixedCosts.map((item) => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-gray-900">{FIXED_COST_CATEGORIES[item.category]}</p>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-green-600">₹{item.amount.toLocaleString()}</span>
                      {isManager && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onEditFixedCost(item)}
                            className="p-1.5 hover:bg-green-50 rounded text-green-600 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ type: 'fixedcost', id: item.id })}
                            className="p-1.5 hover:bg-red-50 rounded text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this {deleteConfirm.type === 'inventory' ? 'inventory item' : deleteConfirm.type === 'overhead' ? 'overhead cost' : 'fixed cost'}? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.type, deleteConfirm.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}