import { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../App';
import { INVENTORY_CATEGORIES, CATEGORY_ITEMS } from '../utils/inventoryData';
import { X, Loader2, Search, ChevronDown } from 'lucide-react';
import * as api from '../utils/api';

type Props = {
  selectedDate: string;
  editingItem?: InventoryItem | null;
  onSubmit: (item: Omit<InventoryItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  onSuccess?: () => void; // NEW: Optional callback after successful submission
};

export function InventoryForm({ selectedDate, editingItem, onSubmit, onClose, onSuccess }: Props) {
  // Get last used payment method from localStorage, default to 'cash' if not found
  const getLastPaymentMethod = (): 'cash' | 'online' | 'both' => {
    if (editingItem?.paymentMethod) return editingItem.paymentMethod;
    const stored = localStorage.getItem('lastInventoryPaymentMethod');
    return (stored as 'cash' | 'online' | 'both') || 'cash';
  };

  const [formData, setFormData] = useState({
    category: (editingItem?.category || 'fresh_produce') as InventoryItem['category'],
    itemName: editingItem?.itemName || '',
    customItem: editingItem ? !CATEGORY_ITEMS[editingItem.category].includes(editingItem.itemName) : false,
    quantity: editingItem?.quantity.toString() || '',
    unit: editingItem?.unit || 'kg',
    totalCost: editingItem?.totalCost.toString() || '',
    paymentMethod: getLastPaymentMethod(),
    cashAmount: editingItem?.cashAmount?.toString() || '',
    onlineAmount: editingItem?.onlineAmount?.toString() || ''
  });

  const [customItems, setCustomItems] = useState<Record<string, string[]>>({});
  const [loadingCustomItems, setLoadingCustomItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // NEW: Search state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // Track dropdown state
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load custom items on mount
  useEffect(() => {
    loadCustomItems();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

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

  // Reset form to initial state (for adding multiple items)
  const resetForm = () => {
    const lastPaymentMethod = localStorage.getItem('lastInventoryPaymentMethod') as 'cash' | 'online' | 'both' || 'cash';
    setFormData({
      category: formData.category, // Persist the category selection
      itemName: '',
      customItem: false,
      quantity: '',
      unit: 'kg',
      totalCost: '',
      paymentMethod: lastPaymentMethod, // Persist the last used payment method
      cashAmount: '',
      onlineAmount: ''
    });
    setSearchQuery(''); // Clear search query
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate request');
      return;
    }
    
    // CRITICAL: Validate itemName is not empty
    if (!formData.itemName || formData.itemName.trim() === '') {
      alert('⚠️ Please select an item name before submitting!');
      console.error('❌ Attempted to submit inventory item without itemName:', formData);
      return;
    }
    
    // Validate split payment amounts
    if (formData.paymentMethod === 'both') {
      const cashAmt = parseFloat(formData.cashAmount) || 0;
      const onlineAmt = parseFloat(formData.onlineAmount) || 0;
      const total = parseFloat(formData.totalCost) || 0;
      
      if (Math.abs((cashAmt + onlineAmt) - total) > 0.01) {
        alert(`⚠️ Split payment amounts (₹${cashAmt.toFixed(2)} + ₹${onlineAmt.toFixed(2)} = ₹${(cashAmt + onlineAmt).toFixed(2)}) must equal total cost (₹${total.toFixed(2)})`);
        return;
      }
    }
    
    setIsSubmitting(true);
    
    const quantity = parseFloat(formData.quantity);
    const totalCost = parseFloat(formData.totalCost);
    const costPerUnit = quantity > 0 ? totalCost / quantity : 0;
    
    // CRITICAL: Round numbers to prevent floating point precision issues
    const roundedQuantity = Math.round(quantity * 100) / 100; // Round to 2 decimal places
    const roundedTotalCost = Math.round(totalCost * 100) / 100; // Round to 2 decimal places
    const roundedCostPerUnit = Math.round(costPerUnit * 100) / 100; // Round to 2 decimal places
    
    console.log('📝 Submitting inventory item:', {
      itemName: formData.itemName,
      quantity: roundedQuantity,
      totalCost: roundedTotalCost,
      costPerUnit: roundedCostPerUnit,
      paymentMethod: formData.paymentMethod
    });
    
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
    
    // Calculate payment method amounts
    let paymentData: any = {
      paymentMethod: formData.paymentMethod
    };
    
    if (formData.paymentMethod === 'both') {
      const cashAmt = parseFloat(formData.cashAmount) || 0;
      const onlineAmt = parseFloat(formData.onlineAmount) || 0;
      paymentData.cashAmount = Math.round(cashAmt * 100) / 100;
      paymentData.onlineAmount = Math.round(onlineAmt * 100) / 100;
    } else if (formData.paymentMethod === 'online') {
      // For online payment, set onlineAmount to totalCost
      paymentData.onlineAmount = roundedTotalCost;
      paymentData.cashAmount = 0;
    } else if (formData.paymentMethod === 'cash') {
      // For cash payment, set cashAmount to totalCost
      paymentData.cashAmount = roundedTotalCost;
      paymentData.onlineAmount = 0;
    }
    
    console.log('💳 Payment data being sent:', paymentData);
    
    await onSubmit({
      date: selectedDate,
      category: formData.category,
      itemName: formData.itemName,
      quantity: roundedQuantity,
      unit: formData.unit,
      costPerUnit: roundedCostPerUnit,
      totalCost: roundedTotalCost,
      ...paymentData
    });
    
    setIsSubmitting(false);
    
    // Only reset form if this is a new item (not editing)
    if (!editingItem) {
      resetForm();
    }
    
    if (onSuccess) {
      onSuccess();
    }
  };

  // Merge base items with custom items for the selected category
  // Remove duplicates by converting to Set and back to array, then sort alphabetically
  const allCategoryItems = [
    ...new Set([
      ...CATEGORY_ITEMS[formData.category],
      ...(customItems[formData.category] || [])
    ])
  ].sort((a, b) => a.localeCompare(b)); // Sort alphabetically

  // Filter items based on search query
  const filteredCategoryItems = searchQuery.trim()
    ? allCategoryItems.filter(item => 
        item.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allCategoryItems;

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
              onChange={(e) => {
                setFormData({
                  ...formData,
                  category: e.target.value as InventoryItem['category'],
                  itemName: '',
                  customItem: false
                });
                setSearchQuery(''); // Clear search when category changes
              }}
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
              <div className="relative space-y-2">
                {/* Search Input with Selected Item Display */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true); // Open dropdown when typing
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder={formData.itemName || "Search items..."}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {formData.itemName && !searchQuery && (
                    <div className="absolute inset-y-0 left-10 right-10 flex items-center pointer-events-none">
                      <span className="text-gray-900">{formData.itemName}</span>
                    </div>
                  )}
                  <ChevronDown 
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 cursor-pointer"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  />
                </div>
                
                {/* Dropdown List - Only show when open */}
                {isDropdownOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                  >
                    {filteredCategoryItems.length === 0 && searchQuery ? (
                      <div className="px-3 py-2 text-gray-500 text-sm">No items found</div>
                    ) : (
                      filteredCategoryItems.map((item) => (
                        <div
                          key={item}
                          onClick={() => {
                            setFormData({ ...formData, itemName: item });
                            setSearchQuery('');
                            setIsDropdownOpen(false);
                          }}
                          className={`px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors ${
                            formData.itemName === item ? 'bg-blue-100 font-medium' : ''
                          }`}
                        >
                          {item}
                        </div>
                      ))
                    )}
                    <div
                      onClick={() => {
                        setFormData({ ...formData, customItem: true, itemName: '' });
                        setSearchQuery('');
                        setIsDropdownOpen(false);
                      }}
                      className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors border-t border-gray-200 text-blue-600 font-medium"
                    >
                      + Add Custom Item
                    </div>
                  </div>
                )}
                
                {searchQuery && !isDropdownOpen && (
                  <p className="text-xs text-gray-500">
                    Showing {filteredCategoryItems.length} of {allCategoryItems.length} items
                  </p>
                )}
                
                {/* Hidden input for form validation */}
                <input
                  type="hidden"
                  value={formData.itemName}
                  required
                />
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
                  onClick={() => {
                    setFormData({ ...formData, customItem: false, itemName: '' });
                    setSearchQuery(''); // Clear search when going back
                  }}
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

          {/* Payment Method Selection */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">Payment Method</label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => {
                const method = e.target.value as 'cash' | 'online' | 'both';
                // Save to localStorage to remember for next time
                localStorage.setItem('lastInventoryPaymentMethod', method);
                setFormData({ 
                  ...formData, 
                  paymentMethod: method,
                  // Reset split amounts when changing payment method
                  cashAmount: method === 'both' ? formData.cashAmount : '',
                  onlineAmount: method === 'both' ? formData.onlineAmount : ''
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
              required
            >
              <option value="cash">Cash in Hand 💵</option>
              <option value="online">Online / Paytm 📱</option>
              <option value="both">Split Payment (Both) 💰</option>
            </select>
          </div>

          {/* Split Payment Fields */}
          {formData.paymentMethod === 'both' && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-900 mb-2">Split Payment Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-blue-900 mb-1">Cash Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cashAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, cashAmount: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-blue-900 mb-1">Online Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.onlineAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, onlineAmount: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              {formData.cashAmount && formData.onlineAmount && formData.totalCost && (
                <div className="text-xs">
                  {(parseFloat(formData.cashAmount) + parseFloat(formData.onlineAmount)) === parseFloat(formData.totalCost) ? (
                    <p className="text-green-700 font-semibold">✓ Split amounts match total cost</p>
                  ) : (
                    <p className="text-red-700 font-semibold">
                      ⚠️ Split total: ₹{(parseFloat(formData.cashAmount) + parseFloat(formData.onlineAmount)).toFixed(2)} 
                      (Total Cost: ₹{parseFloat(formData.totalCost).toFixed(2)})
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}