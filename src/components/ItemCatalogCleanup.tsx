import { useEffect, useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import * as api from '../utils/api';
import { INVENTORY_CATEGORIES, SELECTABLE_INVENTORY_CATEGORIES, CATEGORY_ITEMS, expenseCategoryLabel } from '../utils/inventoryData';
import { ITEM_SUGGESTIONS } from '../utils/itemEnrichmentSuggestions';
import { normalizeItemName } from '../utils/stringSimilarity';

type Props = {
  onClose: () => void;
};

type RowState = {
  item: api.CustomItem;
  action: 'update' | 'delete' | 'skip';
  name: string;
  category: string;
  bengali: string;
  emoji: string;
  note?: string;
  needsReview?: boolean;
};

export function ItemCatalogCleanup({ onClose }: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const items = await api.getCustomItems();

      // Detect exact same-name-and-category duplicates automatically (e.g. two
      // identical "Curd" entries) — keep the oldest, flag the rest for deletion.
      const seenExact = new Map<string, api.CustomItem>();
      const exactDuplicateOf = new Map<string, api.CustomItem>(); // item.id -> the one it duplicates
      for (const item of [...items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))) {
        const key = `${item.category}::${normalizeItemName(item.itemName)}`;
        const existing = seenExact.get(key);
        if (existing) {
          exactDuplicateOf.set(item.id, existing);
        } else {
          seenExact.set(key, item);
        }
      }

      // Detect custom items that just re-add a name already in the built-in list for
      // that category (e.g. "Onion " duplicating the built-in "Onion") — these are
      // redundant since the built-in already appears in the picker for everyone.
      const isBuiltInDuplicate = (item: api.CustomItem) => {
        const builtIns = (CATEGORY_ITEMS as Record<string, readonly string[]>)[item.category] || [];
        return builtIns.some((b) => normalizeItemName(b) === normalizeItemName(item.itemName));
      };

      const built: RowState[] = items.map((item) => {
        const suggestion = ITEM_SUGGESTIONS[normalizeItemName(item.itemName)];
        const builtInDup = isBuiltInDuplicate(item);
        const mergeTarget =
          exactDuplicateOf.get(item.id) ||
          (suggestion?.mergeInto ? items.find((i) => normalizeItemName(i.itemName) === suggestion.mergeInto) : undefined);
        return {
          item,
          action: builtInDup || mergeTarget ? 'delete' : suggestion ? 'update' : 'skip',
          name: suggestion?.name || item.itemName.trim(),
          category: suggestion?.category || item.category,
          bengali: suggestion?.bengali || item.itemNameBengali || '',
          emoji: suggestion?.emoji || item.emoji || '',
          note: builtInDup
            ? `Already exists as a built-in item in this category — this custom entry is redundant.`
            : exactDuplicateOf.has(item.id)
            ? `Exact duplicate of "${mergeTarget!.itemName}" — deleting this copy.`
            : suggestion?.note || (mergeTarget ? `Merges into "${mergeTarget.itemName}"` : undefined),
          needsReview: suggestion?.needsReview,
        };
      });
      // Show rows that need attention first (updates/deletes/review), then the rest
      built.sort((a, b) => {
        const rank = (r: RowState) => (r.needsReview ? 0 : r.action !== 'skip' ? 1 : 2);
        return rank(a) - rank(b);
      });
      setRows(built);
    } catch (error) {
      console.error('Failed to load custom items:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (id: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.item.id === id ? { ...r, ...patch } : r)));
  };

  const applyAll = async () => {
    setSaving(true);
    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.action === 'skip') continue;
      try {
        if (row.action === 'delete') {
          await api.deleteCustomItem(row.item.id);
        } else {
          await api.updateCustomItem(row.item.id, {
            itemName: row.name,
            category: row.category,
            itemNameBengali: row.bengali || undefined,
            emoji: row.emoji || undefined,
          });
        }
        succeeded++;
      } catch (error) {
        console.error(`Failed to apply change for ${row.item.itemName}:`, error);
        failed++;
      }
    }
    setSaving(false);
    alert(`Applied ${succeeded} change(s).${failed > 0 ? ` ${failed} failed — check console.` : ''}`);
    await loadItems();
  };

  const pendingCount = rows.filter((r) => r.action !== 'skip').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-stone-800 p-6 text-white rounded-t-2xl flex items-center justify-between sticky top-0">
          <div>
            <h3 className="text-xl font-bold">Item Catalog Cleanup</h3>
            <p className="text-sm text-gray-300 mt-1">Review proposed fixes, edit anything, then apply.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.item.id}
                  className={`border rounded-lg p-4 ${
                    row.needsReview ? 'border-amber-300 bg-amber-50' : row.action !== 'skip' ? 'border-orange-200 bg-orange-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-500">
                        Current: <span className="font-medium text-gray-900">{row.item.itemName}</span> ·{' '}
                        {expenseCategoryLabel(row.item.category)}
                      </p>
                      {row.note && (
                        <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {row.note}
                        </p>
                      )}
                    </div>
                    <select
                      value={row.action}
                      onChange={(e) => updateRow(row.item.id, { action: e.target.value as RowState['action'] })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="skip">Skip (no change)</option>
                      <option value="update">Update</option>
                      <option value="delete">Delete (merged/removed)</option>
                    </select>
                  </div>

                  {row.action === 'update' && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2">
                      <input
                        type="text"
                        value={row.emoji}
                        onChange={(e) => updateRow(row.item.id, { emoji: e.target.value })}
                        placeholder="Emoji"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm sm:col-span-1"
                      />
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.item.id, { name: e.target.value })}
                        placeholder="English name"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm sm:col-span-1"
                      />
                      <input
                        type="text"
                        value={row.bengali}
                        onChange={(e) => updateRow(row.item.id, { bengali: e.target.value })}
                        placeholder="Bengali name"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm sm:col-span-1"
                      />
                      <select
                        value={row.category}
                        onChange={(e) => updateRow(row.item.id, { category: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm sm:col-span-1"
                      >
                        {Object.entries(SELECTABLE_INVENTORY_CATEGORIES).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex items-center justify-between sticky bottom-0 bg-white">
          <p className="text-sm text-gray-600">{pendingCount} change(s) staged</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              Close
            </button>
            <button
              onClick={applyAll}
              disabled={saving || pendingCount === 0}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Applying...' : `Apply ${pendingCount} Change(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
