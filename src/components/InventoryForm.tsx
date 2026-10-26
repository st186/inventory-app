import { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../App';
import { SELECTABLE_INVENTORY_CATEGORIES, CATEGORY_ITEMS, STORE_SELECTABLE_INVENTORY_CATEGORIES, STORE_CATEGORY_ITEMS, BUILT_IN_ITEM_BENGALI, LEGACY_CATEGORY_CANONICAL, expenseCategoryLabel } from '../utils/inventoryData';
import { X, Loader2, Search, ChevronDown, AlertTriangle } from 'lucide-react';
import * as api from '../utils/api';
import { findSimilarItem } from '../utils/stringSimilarity';
import { ProductionCashChoice, productionCashChoiceAvailable } from './ProductionCashChoice';
import type { CashCover } from '../utils/cashSource';

type Props = {
  selectedDate: string;
  editingItem?: InventoryItem | null;
  entityType?: 'store' | 'production_house';
  onSubmit: (item: Omit<InventoryItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  onSuccess?: () => void; // NEW: Optional callback after successful submission
  // Only cluster heads can expand the item catalog - a store/operations incharge picks
  // from what's already there. Defaults to true for callers that haven't been updated to
  // pass this explicitly, so existing behavior doesn't silently change elsewhere.
  canCreateNewItems?: boolean;
  // Cluster head only: "My own money" - a cost that takes nothing from store/production cash or Paytm.
  allowOwnerPayment?: boolean;
  // Cluster head, store expense: the linked production house, and both tills' cash for the
  // day - production's cash is offered only when the store's can't cover the bill.
  productionCashHouseId?: string | null;
  productionCashCover?: CashCover | null;
};

export function InventoryForm({ selectedDate, editingItem, entityType, onSubmit, onClose, onSuccess, canCreateNewItems = true, allowOwnerPayment = false, productionCashHouseId = null, productionCashCover = null }: Props) {
  const [fromProductionCash, setFromProductionCash] = useState(!!editingItem?.paidFromProductionHouseId);
  // Store purchases are a small curated subset (see STORE_CATEGORY_ITEMS) - the
  // production house still needs the full fresh-produce/spices/meat lists.
  const isStoreEntry = entityType === 'store';
  const baseSelectableCategories = isStoreEntry ? STORE_SELECTABLE_INVENTORY_CATEGORIES : SELECTABLE_INVENTORY_CATEGORIES;
  const baseCategoryItems: Record<string, string[]> = isStoreEntry ? (STORE_CATEGORY_ITEMS as Record<string, string[]>) : (CATEGORY_ITEMS as Record<string, readonly string[]>) as Record<string, string[]>;
  const defaultCategory = (Object.keys(baseSelectableCategories)[0] || 'fresh_produce') as InventoryItem['category'];
  // Get last used payment method from localStorage, default to 'cash' if not found
  const getLastPaymentMethod = (): 'cash' | 'online' | 'both' | 'owner' => {
    if (editingItem?.paymentMethod) return editingItem.paymentMethod;
    const stored = localStorage.getItem('lastInventoryPaymentMethod');
    return (stored as 'cash' | 'online' | 'both') || 'cash';
  };

  const [formData, setFormData] = useState({
    category: (editingItem?.category || defaultCategory) as InventoryItem['category'],
    itemName: editingItem?.itemName || '',
    customItem: editingItem ? !(baseCategoryItems[editingItem.category] || []).includes(editingItem.itemName) : false,
    quantity: editingItem?.quantity.toString() || '',
    unit: editingItem?.unit || 'kg',
    totalCost: editingItem?.totalCost.toString() || '',
    paymentMethod: getLastPaymentMethod(),
    cashAmount: editingItem?.cashAmount?.toString() || '',
    onlineAmount: editingItem?.onlineAmount?.toString() || '',
    // Beverage packaging fields
    packageType: (editingItem?.packageType || 'pieces') as 'carton' | 'pieces',
    cartonCount: editingItem?.cartonCount?.toString() || '',
    piecesPerCarton: editingItem?.piecesPerCarton?.toString() || '',
    pieceCount: editingItem?.packageType === 'pieces' ? editingItem?.quantity.toString() || '' : '',
    volumeMl: editingItem?.volumeMl?.toString() || '',
    volumeUnit: 'mL' as 'mL' | 'L'
  });

  const isBeverage = formData.category === 'beverages';
  const beverageTotalPieces = formData.packageType === 'carton'
    ? (parseFloat(formData.cartonCount) || 0) * (parseFloat(formData.piecesPerCarton) || 0)
    : (parseFloat(formData.pieceCount) || 0);

  // Optional weight per piece (e.g. a 200g packet of Aromatic Powder) - only offered when
  // quantity is a piece count, and only shown once someone opts in, since plenty of
  // piece-counted items (tissues, cutlery) have no meaningful weight to record.
  const [showWeightField, setShowWeightField] = useState(!!editingItem?.weightPerUnitGrams);
  const [weightPerUnit, setWeightPerUnit] = useState(editingItem?.weightPerUnitGrams?.toString() || '');
  const [weightUnit, setWeightUnit] = useState<'g' | 'kg'>('g');

  // Non-beverage bundle purchase (e.g. 1 bundle of 50 tissues, a bag of 20 foil sheets) -
  // reuses the same formData.cartonCount/piecesPerCarton fields the beverage packaging UI
  // already uses, since it's the same "N containers x M pieces each" shape either way.
  const [isBundleMode, setIsBundleMode] = useState(!isBeverage && editingItem?.packageType === 'carton');
  const bundleTotalPieces = (parseFloat(formData.cartonCount) || 0) * (parseFloat(formData.piecesPerCarton) || 0);
  const isBundlePurchase = !isBeverage && isBundleMode && (formData.unit === 'pcs' || formData.unit === 'units');

  const [customItems, setCustomItems] = useState<Record<string, string[]>>({});
  const [allCustomItems, setAllCustomItems] = useState<api.CustomItem[]>([]);
  const [customCategories, setCustomCategories] = useState<api.CustomCategory[]>([]);
  const [loadingCustomItems, setLoadingCustomItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // NEW: Search state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // Track dropdown state
  const [duplicateWarning, setDuplicateWarning] = useState<{ match: api.CustomItem; similarity: number; exact: boolean } | null>(null);
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
      const [items, categories] = await Promise.all([api.getCustomItems(), api.getCustomCategories()]);
      setAllCustomItems(items);
      // Custom categories that duplicated a built-in non-food one (Experiment, License &
      // Paperwork, ...) are retired - those costs are logged as overheads now.
      setCustomCategories(categories.filter((cat) => cat.scope === (isStoreEntry ? 'store' : 'production') && !(cat.key in LEGACY_CATEGORY_CANONICAL)));
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

  // Cluster-head-created categories (see CategoryManagerModal) layered on top of the
  // fixed built-in list, so a new category is actually selectable here right after it's
  // created - not just visible in the management modal.
  const selectableCategories: Record<string, string> = {
    ...baseSelectableCategories,
    ...Object.fromEntries(customCategories.map((cat) => [cat.key, `${cat.emoji} ${cat.label}`])),
  };
  const categoryItems: Record<string, string[]> = { ...baseCategoryItems };
  for (const cat of customCategories) {
    if (!categoryItems[cat.key]) categoryItems[cat.key] = [];
  }

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
      onlineAmount: '',
      packageType: 'pieces',
      cartonCount: '',
      piecesPerCarton: '',
      pieceCount: '',
      volumeMl: '',
      volumeUnit: 'mL'
    });
    setSearchQuery(''); // Clear search query
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('🚀 [INVENTORY FORM] handleSubmit called');
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ [INVENTORY FORM] Submission already in progress, ignoring duplicate request');
      return;
    }
    
    // CRITICAL: Validate itemName is not empty
    if (!formData.itemName || formData.itemName.trim() === '') {
      alert('⚠️ Please select an item name before submitting!');
      console.error('❌ [INVENTORY FORM] Attempted to submit inventory item without itemName:', formData);
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

    // If adding a brand-new item name, check for a likely duplicate before proceeding —
    // against both existing custom items and the category's built-in item list.
    if (formData.customItem && formData.itemName) {
      const builtInsAsItems: api.CustomItem[] = (categoryItems[formData.category] || []).map((name) => ({
        id: '', category: formData.category, itemName: name,
      }));
      const match = findSimilarItem(formData.itemName, [...builtInsAsItems, ...allCustomItems], (item) => item.itemName);
      if (match) {
        setDuplicateWarning(match);
        return;
      }
    }

    await proceedWithSubmit();
  };

  const proceedWithSubmit = async () => {
    console.log('📝 [INVENTORY FORM] Form data validated, setting isSubmitting=true');
    setIsSubmitting(true);

    const quantity = isBeverage ? beverageTotalPieces : (isBundlePurchase ? bundleTotalPieces : parseFloat(formData.quantity));
    const totalCost = parseFloat(formData.totalCost);
    const costPerUnit = quantity > 0 ? totalCost / quantity : 0;
    
    // CRITICAL: Round numbers to prevent floating point precision issues
    const roundedQuantity = Math.round(quantity * 100) / 100; // Round to 2 decimal places
    const roundedTotalCost = Math.round(totalCost * 100) / 100; // Round to 2 decimal places
    const roundedCostPerUnit = Math.round(costPerUnit * 100) / 100; // Round to 2 decimal places
    
    console.log('📝 [INVENTORY FORM] Submitting inventory item:', {
      date: selectedDate,
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
    } else if (formData.paymentMethod === 'owner') {
      paymentData.cashAmount = 0;
      paymentData.onlineAmount = 0;
    }
    if (productionCashHouseId) {
      paymentData.paidFromProductionHouseId = formData.paymentMethod === 'cash' && fromProductionCash
        && productionCashChoiceAvailable(roundedTotalCost, productionCashCover, editingItem) ? productionCashHouseId : null;
    }

    console.log('💳 [INVENTORY FORM] Payment data being sent:', paymentData);
    
    try {
      console.log('📤 [INVENTORY FORM] Calling onSubmit with data...');
      await onSubmit({
        date: selectedDate,
        category: formData.category,
        itemName: formData.itemName,
        quantity: roundedQuantity,
        unit: isBeverage || isBundlePurchase ? 'pcs' : formData.unit,
        costPerUnit: roundedCostPerUnit,
        totalCost: roundedTotalCost,
        ...(isBeverage ? {
          packageType: formData.packageType,
          ...(formData.packageType === 'carton' ? {
            cartonCount: parseFloat(formData.cartonCount) || 0,
            piecesPerCarton: parseFloat(formData.piecesPerCarton) || 0,
          } : {}),
          ...(formData.volumeMl ? { volumeMl: formData.volumeUnit === 'L' ? (parseFloat(formData.volumeMl) || 0) * 1000 : (parseFloat(formData.volumeMl) || 0) } : {}),
        } : {}),
        ...(isBundlePurchase ? {
          packageType: 'carton' as const,
          cartonCount: parseFloat(formData.cartonCount) || 0,
          piecesPerCarton: parseFloat(formData.piecesPerCarton) || 0,
        } : {}),
        ...(!isBeverage && (formData.unit === 'pcs' || formData.unit === 'units') && weightPerUnit
          ? { weightPerUnitGrams: weightUnit === 'kg' ? (parseFloat(weightPerUnit) || 0) * 1000 : (parseFloat(weightPerUnit) || 0) }
          : {}),
        ...paymentData
      });
      console.log('✅ [INVENTORY FORM] onSubmit completed successfully');
    } catch (error) {
      console.error('❌ [INVENTORY FORM] onSubmit failed:', error);
      setIsSubmitting(false);
      return; // Don't continue if submission failed
    }
    
    console.log('🔧 [INVENTORY FORM] Setting isSubmitting=false');
    setIsSubmitting(false);
    
    // Only reset form if this is a new item (not editing)
    if (!editingItem) {
      console.log('🔄 [INVENTORY FORM] Resetting form for next entry');
      resetForm();
    }
    
    if (onSuccess) {
      console.log('🎉 [INVENTORY FORM] Calling onSuccess callback');

      onSuccess();
    }
  };

  // Merge base items with custom items for the selected category.
  // Dedupe by normalized (trim+lowercase) name so whitespace/casing variants of the
  // same item (e.g. built-in "Onion" vs a custom "Onion ") don't both show up —
  // built-ins take priority since their spelling/casing is canonical.
  const dedupedItemsMap = new Map<string, string>();
  for (const name of categoryItems[formData.category] || []) {
    dedupedItemsMap.set(name.trim().toLowerCase(), name);
  }
  for (const name of customItems[formData.category] || []) {
    const key = name.trim().toLowerCase();
    if (!dedupedItemsMap.has(key)) {
      dedupedItemsMap.set(key, name.trim());
    }
  }
  const allCategoryItems = [...dedupedItemsMap.values()].sort((a, b) => a.localeCompare(b));

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
              {Object.entries(selectableCategories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              {/* If editing an item whose category is legacy/no longer offered, keep it visible */}
              {editingItem && !(editingItem.category in selectableCategories) && (
                <option value={editingItem.category}>
                  {expenseCategoryLabel(editingItem.category)}
                </option>
              )}
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
                      filteredCategoryItems.map((item) => {
                        const meta = allCustomItems.find(
                          (ci) => ci.category === formData.category && ci.itemName.trim().toLowerCase() === item.trim().toLowerCase()
                        );
                        const bengali = meta?.itemNameBengali || BUILT_IN_ITEM_BENGALI[item];
                        return (
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
                            {meta?.emoji ? `${meta.emoji} ` : ''}{item}{bengali ? ` (${bengali})` : ''}
                          </div>
                        );
                      })
                    )}
                    {canCreateNewItems && (
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
                    )}
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

          {isBeverage ? (
            <div className="space-y-3 bg-sky-50 border-2 border-sky-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-sky-900">Packaging</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, packageType: 'pieces' })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    formData.packageType === 'pieces' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Pieces
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, packageType: 'carton' })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    formData.packageType === 'carton' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Carton
                </button>
              </div>

              {formData.packageType === 'carton' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-sky-900 mb-1">Number of Cartons</label>
                    <input
                      type="number"
                      step="1"
                      value={formData.cartonCount}
                      onChange={(e) => setFormData({ ...formData, cartonCount: e.target.value })}
                      className="w-full px-3 py-2 border border-sky-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-sky-900 mb-1">Pieces per Carton</label>
                    <input
                      type="number"
                      step="1"
                      value={formData.piecesPerCarton}
                      onChange={(e) => setFormData({ ...formData, piecesPerCarton: e.target.value })}
                      className="w-full px-3 py-2 border border-sky-300 rounded-lg"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-sky-900 mb-1">Number of Pieces</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.pieceCount}
                    onChange={(e) => setFormData({ ...formData, pieceCount: e.target.value })}
                    className="w-full px-3 py-2 border border-sky-300 rounded-lg"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-sky-900 mb-1">Volume per Piece</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="1"
                    value={formData.volumeMl}
                    onChange={(e) => setFormData({ ...formData, volumeMl: e.target.value })}
                    placeholder="e.g. 750"
                    className="flex-1 px-3 py-2 border border-sky-300 rounded-lg"
                  />
                  <select
                    value={formData.volumeUnit}
                    onChange={(e) => setFormData({ ...formData, volumeUnit: e.target.value as 'mL' | 'L' })}
                    className="px-3 py-2 border border-sky-300 rounded-lg bg-white"
                  >
                    <option value="mL">mL</option>
                    <option value="L">L</option>
                  </select>
                </div>
              </div>

              {beverageTotalPieces > 0 && (
                <p className="text-sm text-sky-800 font-medium">
                  Total: {beverageTotalPieces} pcs{formData.volumeMl ? ` × ${formData.volumeMl}${formData.volumeUnit}` : ''}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm text-gray-700">Quantity</label>
                  {(formData.unit === 'pcs' || formData.unit === 'units') && (
                    <button
                      type="button"
                      onClick={() => setIsBundleMode(!isBundleMode)}
                      className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                    >
                      {isBundleMode ? 'Loose pieces' : 'Bundle/pack?'}
                    </button>
                  )}
                </div>
                {isBundlePurchase ? (
                  // e.g. 1 bundle of 50 tissues, a bag of 20 foil sheets - same
                  // "N containers x M pieces each" idea as the beverage carton UI.
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="1"
                        value={formData.cartonCount}
                        onChange={(e) => setFormData({ ...formData, cartonCount: e.target.value })}
                        placeholder="Bundles"
                        title="Number of bundles"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        required
                      />
                      <input
                        type="number"
                        step="1"
                        value={formData.piecesPerCarton}
                        onChange={(e) => setFormData({ ...formData, piecesPerCarton: e.target.value })}
                        placeholder="Pcs/bundle"
                        title="Pieces per bundle"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        required
                      />
                    </div>
                    {bundleTotalPieces > 0 && (
                      <p className="text-xs text-gray-500 font-medium">Total: {bundleTotalPieces} pcs</p>
                    )}
                  </div>
                ) : (
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
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => {
                    const u = e.target.value;
                    if (u !== 'pcs' && u !== 'units') setIsBundleMode(false);
                    setFormData({ ...formData, unit: u });
                  }}
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
          )}

          {!isBeverage && (formData.unit === 'pcs' || formData.unit === 'units') && (
            <div>
              {!showWeightField ? (
                <button
                  type="button"
                  onClick={() => setShowWeightField(true)}
                  className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                >
                  + Add weight per {formData.unit === 'pcs' ? 'piece' : 'unit'} (optional)
                </button>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Weight per {formData.unit === 'pcs' ? 'piece' : 'unit'}
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowWeightField(false); setWeightPerUnit(''); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={weightPerUnit}
                      onChange={(e) => setWeightPerUnit(e.target.value)}
                      placeholder="e.g. 200"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={weightUnit}
                      onChange={(e) => setWeightUnit(e.target.value as 'g' | 'kg')}
                      className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                  {weightPerUnit && parseFloat(formData.quantity) > 0 && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      Total: {formData.quantity} {formData.unit} × {weightPerUnit}{weightUnit} ={' '}
                      {(((parseFloat(weightPerUnit) || 0) * (weightUnit === 'kg' ? 1000 : 1) * (parseFloat(formData.quantity) || 0)) / 1000).toFixed(2)} kg
                    </p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5">Skip this if the item doesn't really have a meaningful weight (e.g. tissues, cutlery).</p>
                </div>
              )}
            </div>
          )}

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
                const method = e.target.value as 'cash' | 'online' | 'both' | 'owner';
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
              {(allowOwnerPayment || editingItem?.paymentMethod === 'owner') && (
                <option value="owner">My own money (cluster head) 🙋</option>
              )}
            </select>
            {productionCashHouseId && formData.paymentMethod === 'cash' && (
              <div className="mt-2">
                <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={parseFloat(formData.totalCost) || 0} cover={productionCashCover} editingItem={editingItem} />
              </div>
            )}
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

          {((isBeverage ? beverageTotalPieces : parseFloat(formData.quantity)) > 0) && formData.totalCost && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600">Cost per {isBeverage ? 'Piece' : 'Unit'}</p>
              <p className="text-gray-900">
                ₹{(parseFloat(formData.totalCost) / (isBeverage ? beverageTotalPieces : parseFloat(formData.quantity))).toFixed(2)}
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

      {duplicateWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-amber-500 p-6 text-white rounded-t-2xl flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <h3 className="text-xl font-bold">Possible Duplicate Item</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700">
                "{formData.itemName}" looks {duplicateWarning.exact ? 'identical to' : 'very similar to'} the existing item{' '}
                <span className="font-semibold">"{duplicateWarning.match.itemName}"</span> under{' '}
                <span className="font-semibold">{expenseCategoryLabel(duplicateWarning.match.category)}</span>.
              </p>
              <p className="text-sm text-gray-500 mt-2">Use the existing item to avoid splitting cost history across two entries, or add this as a genuinely new item.</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row justify-end gap-2">
              <button
                onClick={() => setDuplicateWarning(null)}
                className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const match = duplicateWarning.match;
                  setFormData({ ...formData, itemName: match.itemName, category: match.category as InventoryItem['category'], customItem: false });
                  setDuplicateWarning(null);
                }}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Use Existing Item
              </button>
              <button
                onClick={async () => {
                  setDuplicateWarning(null);
                  await proceedWithSubmit();
                }}
                className="px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Add Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}