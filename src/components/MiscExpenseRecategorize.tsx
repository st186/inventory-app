import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import * as api from '../utils/api';
import { OverheadItem } from '../App';
import { OVERHEAD_CATEGORY_META } from '../utils/inventoryData';
import { currentAccessToken } from '../utils/accessToken';

// "Miscellaneous" is no longer offered when logging an expense - this lets the cluster head
// move the old entries to a real category. Moved here (Manage Categories) from the Export page,
// which is now only for downloads.
export function MiscExpenseRecategorize() {
  const [items, setItems] = useState<OverheadItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const all = await api.fetchOverheads(await currentAccessToken());
      setItems(all.filter((item) => item.category === 'miscellaneous'));
    } catch (error: any) {
      alert(`❌ Failed to load miscellaneous items: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const save = async (item: OverheadItem) => {
    const category = newCategory[item.id];
    if (!category) return;
    setSaving(item.id);
    try {
      const { id, ...rest } = item;
      await api.updateOverhead(await currentAccessToken(), id, { ...rest, category: category as OverheadItem['category'] });
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    } catch (error: any) {
      alert(`❌ Failed to update item: ${error.message}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="border border-warning-border bg-warning-soft rounded-xl p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-warning">Recategorise old "Miscellaneous" expenses</h4>
          <p className="text-sm text-warning mb-3">Assign these old entries to a proper category so they land on the right profit line.</p>
          {items === null ? (
            <button onClick={load} disabled={loading} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 text-sm">
              {loading ? 'Loading...' : 'Load miscellaneous items'}
            </button>
          ) : items.length === 0 ? (
            <p className="text-sm text-success">✅ No miscellaneous items left to recategorise.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="bg-surface rounded-lg border border-warning-border p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{item.description || 'No description'}</p>
                    <p className="text-xs text-text-3">{item.date} • ₹{item.amount.toFixed(2)}</p>
                  </div>
                  <select
                    value={newCategory[item.id] || ''}
                    onChange={(e) => setNewCategory((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="px-3 py-2 border border-border-strong rounded-lg text-sm"
                  >
                    <option value="">Choose new category...</option>
                    {Object.entries(OVERHEAD_CATEGORY_META)
                      .filter(([value]) => value !== 'miscellaneous')
                      .map(([value, meta]) => (
                        <option key={value} value={value}>{meta.label}</option>
                      ))}
                  </select>
                  <button
                    onClick={() => save(item)}
                    disabled={!newCategory[item.id] || saving === item.id}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                  >
                    {saving === item.id ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
