import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Store as StoreIcon, Factory, Loader2 } from 'lucide-react';
import * as api from '../utils/api';
import {
  INVENTORY_CATEGORIES,
  CATEGORY_ITEMS,
  STORE_CATEGORY_ITEMS,
} from '../utils/inventoryData';
import { ItemCatalogCleanup } from './ItemCatalogCleanup';
import { MiscExpenseRecategorize } from './MiscExpenseRecategorize';

type Props = {
  onClose: () => void;
};

type Scope = 'store' | 'production';

// Cluster-head-only view of every category and item available when logging store or
// production-house inventory - built-ins (defined in code, can't be deleted here) plus
// whatever custom categories/items have been added on top. Kept as two separate scopes
// throughout since a store's purchases are a small curated subset of what a production
// house needs (see STORE_CATEGORY_ITEMS) - a category that makes sense for one doesn't
// necessarily belong on the other.
export function CategoryManagerModal({ onClose }: Props) {
  const [scope, setScope] = useState<Scope>('store');
  const [customCategories, setCustomCategories] = useState<api.CustomCategory[]>([]);
  const [customItems, setCustomItems] = useState<api.CustomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('📦');
  const [savingCategory, setSavingCategory] = useState(false);

  const [showItemCleanup, setShowItemCleanup] = useState(false);

  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [categories, items] = await Promise.all([api.getCustomCategories(), api.getCustomItems()]);
      setCustomCategories(categories);
      setCustomItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories/items');
    } finally {
      setLoading(false);
    }
  };

  const builtInItemsFor = scope === 'store' ? STORE_CATEGORY_ITEMS : CATEGORY_ITEMS;
  const builtInCategoryKeys = Object.keys(builtInItemsFor);

  // One row per category valid for this scope: built-ins (from inventoryData.ts) first,
  // then cluster-head-created ones for this scope.
  const categoryRows = useMemo(() => {
    const rows: { key: string; label: string; isBuiltIn: boolean }[] = builtInCategoryKeys.map((key) => ({
      key,
      label: (INVENTORY_CATEGORIES as Record<string, string>)[key] || key,
      isBuiltIn: true,
    }));
    for (const cat of customCategories) {
      if (cat.scope !== scope) continue;
      rows.push({ key: cat.key, label: `${cat.emoji} ${cat.label}`, isBuiltIn: false });
    }
    return rows;
  }, [scope, customCategories, builtInCategoryKeys]);

  const entityTypeForScope = scope === 'store' ? 'store' : 'production_house';
  const itemsForCategory = (categoryKey: string) => {
    const builtIns = ((builtInItemsFor as Record<string, readonly string[]>)[categoryKey] || []).map((name) => ({
      name,
      isBuiltIn: true,
      id: null as string | null,
    }));
    const custom = customItems
      .filter((item) => item.category === categoryKey && (!item.entityType || item.entityType === 'both' || item.entityType === entityTypeForScope))
      .map((item) => ({ name: item.itemName.trim(), isBuiltIn: false, id: item.id }));
    return [...builtIns, ...custom];
  };

  const handleAddCategory = async () => {
    if (!newCategoryLabel.trim()) return;
    setSavingCategory(true);
    setError(null);
    try {
      await api.addCustomCategory(scope, newCategoryLabel.trim(), newCategoryEmoji.trim() || '📦');
      setNewCategoryLabel('');
      setNewCategoryEmoji('📦');
      setShowAddCategory(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (key: string) => {
    if (!confirm('Remove this category? Items already filed under it are unaffected, but you can only remove a category with nothing currently in it.')) return;
    setError(null);
    try {
      await api.deleteCustomCategory(key);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleAddItem = async (categoryKey: string) => {
    if (!newItemName.trim()) return;
    setSavingItem(true);
    setError(null);
    try {
      await api.addCustomItem(categoryKey, newItemName.trim(), 'inventory', entityTypeForScope);
      setNewItemName('');
      setAddingItemFor(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    const item = customItems.find((i) => i.id === id);
    // An item shared across both scopes (entityType 'both', or unset - the common case
    // for anything added before scope tracking existed) must NOT be hard-deleted just
    // because it's being removed from one tab's view - that silently deletes it from the
    // other scope too. Narrow its entityType to "the other scope only" instead; a full
    // delete only happens when the item is already exclusive to the scope being edited.
    const otherEntityType = entityTypeForScope === 'store' ? 'production_house' : 'store';
    const isShared = !item?.entityType || item.entityType === 'both';

    if (isShared) {
      if (!confirm(`"${name}" is also used on the ${scope === 'store' ? 'Production House' : 'Store'} side. Remove it from ${scope === 'store' ? 'Store' : 'Production House'} only (it will stay available there)?`)) return;
      setError(null);
      try {
        await api.updateCustomItem(id, { entityType: otherEntityType });
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update item');
      }
      return;
    }

    if (!confirm(`Remove "${name}" entirely? This doesn't touch any purchases already logged for it.`)) return;
    setError(null);
    try {
      await api.deleteCustomItem(id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-stone-800 p-6 text-white rounded-t-2xl flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
              <StoreIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight">Manage Categories &amp; Items</h3>
              <p className="text-sm text-gray-300 mt-1">Cluster head only - built-in categories/items are fixed; custom ones can be added or removed here.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-5 bg-gray-100 p-1 rounded-full w-fit">
            <button
              onClick={() => setScope('store')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-colors ${scope === 'store' ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <StoreIcon className="w-3.5 h-3.5" /> Store Inventory
            </button>
            <button
              onClick={() => setScope('production')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-colors ${scope === 'production' ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <Factory className="w-3.5 h-3.5" /> Production House Inventory
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {categoryRows.map((row) => {
                const items = itemsForCategory(row.key);
                return (
                  <div key={row.key} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{row.label}</h4>
                        {row.isBuiltIn ? (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Built-in</span>
                        ) : (
                          <button
                            onClick={() => handleDeleteCategory(row.key)}
                            className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
                          >
                            Remove category
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => { setAddingItemFor(addingItemFor === row.key ? null : row.key); setNewItemName(''); }}
                        className="text-xs text-orange-600 hover:text-orange-800 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Item
                      </button>
                    </div>

                    {addingItemFor === row.key && (
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="text"
                          autoFocus
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          placeholder="Item name"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddItem(row.key)}
                        />
                        <button
                          onClick={() => handleAddItem(row.key)}
                          disabled={savingItem || !newItemName.trim()}
                          className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-lg text-sm hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50"
                        >
                          {savingItem ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}

                    {items.length === 0 ? (
                      <p className="text-sm text-gray-400">No items yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {items.map((item) => (
                          <span
                            key={item.id || item.name}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-700"
                          >
                            {item.name}
                            {item.isBuiltIn ? (
                              <span className="text-xs text-gray-400">(built-in)</span>
                            ) : (
                              <button
                                onClick={() => handleDeleteItem(item.id!, item.name)}
                                className="text-red-500 hover:text-red-700"
                                title="Remove item"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {showAddCategory ? (
                <div className="border-2 border-dashed border-orange-300 rounded-xl p-4">
                  <h4 className="font-medium text-gray-900 mb-3">New {scope === 'store' ? 'Store' : 'Production House'} Category</h4>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCategoryEmoji}
                      onChange={(e) => setNewCategoryEmoji(e.target.value)}
                      placeholder="🪔"
                      className="w-16 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center"
                    />
                    <input
                      type="text"
                      autoFocus
                      value={newCategoryLabel}
                      onChange={(e) => setNewCategoryLabel(e.target.value)}
                      placeholder="e.g. Puja Items"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    />
                    <button
                      onClick={handleAddCategory}
                      disabled={savingCategory || !newCategoryLabel.trim()}
                      className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-lg text-sm hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50"
                    >
                      {savingCategory ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setShowAddCategory(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add New Category
                </button>
              )}
            </div>
          )}

          {/* Catalog clean-up tools (moved here from the Export page, which is downloads only). */}
          <div className="mt-6 pt-5 border-t border-gray-200 space-y-3">
            <h4 className="font-medium text-gray-900">Clean-up tools</h4>
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="font-medium text-blue-900">Item catalog clean-up</p>
                <p className="text-sm text-blue-800">Review duplicate or misspelled items and add emoji + Bengali names - nothing changes until you approve each row.</p>
              </div>
              <button onClick={() => setShowItemCleanup(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap">
                Open clean-up
              </button>
            </div>
            <MiscExpenseRecategorize />
          </div>
        </div>
      </div>
      {showItemCleanup && <ItemCatalogCleanup onClose={() => setShowItemCleanup(false)} />}
    </div>
  );
}
