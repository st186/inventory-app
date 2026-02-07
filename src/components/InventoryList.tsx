import { useState } from 'react';
import { InventoryItem, OverheadItem, FixedCostItem } from '../App';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORIES, FIXED_COST_CATEGORIES } from '../utils/inventoryData';
import { Package, Receipt, Wallet, Edit2, Trash2, Loader2 } from 'lucide-react';

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
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper function to format numbers - show decimals only if needed
  const formatNumber = (num: number): string => {
    // Round to 2 decimals
    const rounded = Math.round(num * 100) / 100;
    // If it's a whole number, don't show decimals
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
  };

  // Group inventory by category
  const groupedInventory = inventory.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const handleDelete = (type: 'inventory' | 'overhead' | 'fixedcost', id: string) => {
    setIsDeleting(true);
    if (type === 'inventory') {
      onDeleteInventory(id);
    } else if (type === 'overhead') {
      onDeleteOverhead(id);
    } else {
      onDeleteFixedCost(id);
    }
    setDeleteConfirm(null);
    setIsDeleting(false);
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
                            {formatNumber(item.quantity || 0)} {item.unit}
                          </span>
                          <span>₹{formatNumber(item.costPerUnit || 0)}/{item.unit}</span>
                          {/* Payment Method Badge */}
                          {item.paymentMethod && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' :
                              item.paymentMethod === 'online' ? 'bg-blue-100 text-blue-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {item.paymentMethod === 'cash' ? '💵 Cash' :
                               item.paymentMethod === 'online' ? '📱 Online' :
                               `💰 Split (₹${formatNumber(item.cashAmount || 0)} + ₹${formatNumber(item.onlineAmount || 0)})`}
                            </span>
                          )}
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
                      {item.category === 'personal_expense' && item.employeeId && item.employeeName && (
                        <p className="text-sm text-gray-600 mt-1">
                          Employee: {item.employeeName} (ID: {item.employeeId})
                        </p>
                      )}
                      {item.category === 'personal_expense' && item.expenseMonth && (
                        <p className="text-sm text-purple-600 mt-1 font-medium">
                          📅 Mapped to: {new Date(item.expenseMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </p>
                      )}
                      <p className="text-sm text-gray-500">{item.description}</p>
                      {item.paymentMethod && (
                        <div className="flex items-center gap-2 mt-2">
                          {item.paymentMethod === 'cash' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              💵 Paid via Cash
                            </span>
                          )}
                          {item.paymentMethod === 'online' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                              📱 Paid via Paytm
                            </span>
                          )}
                          {item.paymentMethod === 'both' && (
                            <div className="flex flex-wrap gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                💵 Cash: ₹{item.cashAmount?.toLocaleString()}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                                📱 Paytm: ₹{item.onlineAmount?.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
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
                      {item.category === 'lpg_gas' && item.units && item.unitPrice && (
                        <p className="text-xs text-gray-400 mt-1">
                          {item.units} cylinder{item.units > 1 ? 's' : ''} × ₹{item.unitPrice.toLocaleString()}
                        </p>
                      )}
                      {item.paymentMethod && (
                        <div className="flex items-center gap-2 mt-2">
                          {item.paymentMethod === 'cash' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              💵 Paid via Cash
                            </span>
                          )}
                          {item.paymentMethod === 'online' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                              📱 Paid via Paytm
                            </span>
                          )}
                          {item.paymentMethod === 'both' && (
                            <div className="flex flex-wrap gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                💵 Cash: ₹{item.cashAmount?.toLocaleString()}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                                📱 Paytm: ₹{item.onlineAmount?.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
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
                disabled={isDeleting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.type, deleteConfirm.id)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}