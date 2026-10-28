import { useState } from 'react';
import { toast } from 'sonner';
import { Shapes } from 'lucide-react';
import * as api from '../utils/api';
import { OverheadItem } from '../App';
import { OVERHEAD_CATEGORY_META } from '../utils/inventoryData';
import { currentAccessToken } from '../utils/accessToken';
import { Button } from './ui/button';
import { ListGroup, ListRow } from './ui/list-row';
import { formatINR } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { Skeleton } from './ui/skeleton';
import { stripEmoji } from './money/categoryDisplay';

// "Miscellaneous" is no longer offered when logging an expense - this lets the cluster head
// move the old entries to a real category. Moved here (Manage Categories) from the Export page,
// which is now only for downloads. A list section like the clean-up tools above it: one row
// loads the old entries, then each entry is a row with a category picker and Save.
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
    <ListGroup
      overline='Old "Miscellaneous" expenses'
      footer="Give these old entries a proper category so they land on the right profit line."
      empty={<ListRow icon={Shapes} iconTone="success" title="No miscellaneous items left to recategorise" />}
    >
      {items === null && !loading && (
        <ListRow icon={Shapes} title="Load miscellaneous items" subtitle="See the old entries that still need a category" onClick={load} />
      )}
      {loading && (
        <div className="flex items-center gap-3 px-4 py-3" aria-busy="true">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      )}
      {items !== null && items.map((item) => (
        <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-md font-medium text-text">{item.description || 'No description'}</span>
            <span className="num text-label text-text-3">{item.date} · {formatINR(item.amount)}</span>
          </span>
          <div className="flex gap-2 sm:w-96">
            <PickerField
              title="New category"
              items={categoryItems}
              value={newCategory[item.id] || null}
              onValueChange={(v) => setNewCategory((prev) => ({ ...prev, [item.id]: v }))}
              placeholder="Choose a category"
              className="min-w-0 flex-1"
            />
            <Button variant="secondary" onClick={() => save(item)} disabled={!newCategory[item.id]} loading={saving === item.id}>Save</Button>
          </div>
        </div>
      ))}
    </ListGroup>
  );
}
