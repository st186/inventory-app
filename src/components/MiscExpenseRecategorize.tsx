import { useState } from 'react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import { OverheadItem } from '../App';
import { OVERHEAD_CATEGORY_META } from '../utils/inventoryData';
import { currentAccessToken } from '../utils/accessToken';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { formatINR } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { stripEmoji } from './money/categoryDisplay';

// "Miscellaneous" is no longer offered when logging an expense - this lets the cluster head
// move the old entries to a real category. Moved here (Manage Categories) from the Export page,
// which is now only for downloads.
export function MiscExpenseRecategorize() {
  const [items, setItems] = useState<OverheadItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Record<string, string>>({});
  const categoryItems = Object.entries(OVERHEAD_CATEGORY_META)
    .filter(([value]) => value !== 'miscellaneous')
    .map(([value, meta]) => ({ value, label: stripEmoji(meta.label) }));

  const load = async () => {
    setLoading(true);
    try {
      const all = await api.fetchOverheads(await currentAccessToken());
      setItems(all.filter((item) => item.category === 'miscellaneous'));
    } catch (error: any) {
      toast.error(`Failed to load miscellaneous items: ${error.message}`);
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
      toast.error(`Failed to update item: ${error.message}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Callout
      tone="warning"
      title='Recategorise old "Miscellaneous" expenses'
      action={items === null ? <Button variant="secondary" size="sm" loading={loading} onClick={load}>Load miscellaneous items</Button> : undefined}
    >
      <span className="flex flex-col gap-3">
        <span>Give these old entries a proper category so they land on the right profit line.</span>
        {items !== null && items.length === 0 && <span className="font-medium text-success">No miscellaneous items left to recategorise.</span>}
        {items !== null && items.length > 0 && items.map((item) => (
          <span key={item.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm font-medium text-text">{item.description || 'No description'}</span>
              <span className="num text-caption text-text-3">{item.date} · {formatINR(item.amount)}</span>
            </span>
            <PickerField
              title="New category"
              items={categoryItems}
              value={newCategory[item.id] || null}
              onValueChange={(v) => setNewCategory((prev) => ({ ...prev, [item.id]: v }))}
              placeholder="Choose a category"
              className="sm:w-60"
            />
            <Button variant="secondary" onClick={() => save(item)} disabled={!newCategory[item.id]} loading={saving === item.id}>Save</Button>
          </span>
        ))}
      </span>
    </Callout>
  );
}
