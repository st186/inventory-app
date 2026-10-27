import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import { SELECTABLE_INVENTORY_CATEGORIES, CATEGORY_ITEMS, expenseCategoryLabel } from '../utils/inventoryData';
import { ITEM_SUGGESTIONS } from '../utils/itemEnrichmentSuggestions';
import { normalizeItemName } from '../utils/stringSimilarity';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { EmptyState } from './ui/empty-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { cn } from './ui/utils';
import { LoadingList } from './setup/SetupPage';
import { stripEmoji } from './setup/setupIcons';

type Props = {
  onClose: () => void;
};

type RowState = {
  item: api.CustomItem;
  action: 'update' | 'delete' | 'skip';
  name: string;
  category: string;
  bengali: string;
  // Kept as it was (or as suggested) and saved unchanged; the screen no longer shows emoji.
  emoji: string;
  note?: string;
  needsReview?: boolean;
};

export type CatalogCleanup = ReturnType<typeof useCatalogCleanup>;

// The review of custom items (duplicates, misspellings, Bengali names): loads when `enabled`
// turns true, and applies only the rows the owner left as Update or Delete.
export function useCatalogCleanup(enabled = true) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (enabled) loadItems();
  }, [enabled, loadItems]);

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
    if (failed > 0) toast.warning(`Applied ${succeeded} change(s). ${failed} failed.`);
    else toast.success(`Applied ${succeeded} change(s)`);
    await loadItems();
  };

  const pendingCount = rows.filter((r) => r.action !== 'skip').length;
  return { rows, loading, saving, pendingCount, updateRow, applyAll };
}

/** The rows of the clean-up (inside the categories sheet, or the standalone sheet below). */
export function CatalogCleanupList({ cleanup }: { cleanup: CatalogCleanup }) {
  const { rows, loading, updateRow } = cleanup;
  if (loading) return <LoadingList rows={4} leading="none" />;
  if (rows.length === 0) return <EmptyState compact title="No custom items" body="Only items added on top of the built-in list show here." />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-text-2">Review the proposed fixes, change anything, then apply. Nothing changes until you do.</p>
      {rows.map((row) => (
        <div
          key={row.item.id}
          className={cn(
            'flex flex-col gap-3 rounded-lg border p-3',
            row.needsReview ? 'border-warning-border bg-warning-soft' : row.action !== 'skip' ? 'border-border-strong bg-surface' : 'border-border bg-surface',
          )}
        >
          <div className="flex flex-col gap-1">
            <span className="text-body-md font-medium text-text">{row.item.itemName}</span>
            <span className="text-label text-text-3">{stripEmoji(expenseCategoryLabel(row.item.category))}</span>
            {row.note && (
              <span className="flex items-start gap-1.5 text-label text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {row.note}
              </span>
            )}
          </div>
          <Field label="What to do">
            <NativeSelect value={row.action} onChange={(e) => updateRow(row.item.id, { action: e.target.value as RowState['action'] })}>
              <option value="skip">Skip (no change)</option>
              <option value="update">Update</option>
              <option value="delete">Delete (merged or removed)</option>
            </NativeSelect>
          </Field>
          {row.action === 'update' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="English name">
                <Input value={row.name} onChange={(e) => updateRow(row.item.id, { name: e.target.value })} />
              </Field>
              <Field label="Bengali name">
                <Input value={row.bengali} onChange={(e) => updateRow(row.item.id, { bengali: e.target.value })} lang="bn" />
              </Field>
              <Field label="Category" className="sm:col-span-2">
                <NativeSelect value={row.category} onChange={(e) => updateRow(row.item.id, { category: e.target.value })}>
                  {Object.entries(SELECTABLE_INVENTORY_CATEGORIES).map(([value, label]) => (
                    <option key={value} value={value}>{stripEmoji(label)}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function cleanupApplyLabel(cleanup: CatalogCleanup) {
  return cleanup.saving ? 'Applying' : `Apply ${cleanup.pendingCount} change${cleanup.pendingCount === 1 ? '' : 's'}`;
}

// Standalone sheet (the categories sheet shows the same list in place instead).
export function ItemCatalogCleanup({ onClose }: Props) {
  const [open, setOpen] = useState(true);
  const cleanup = useCatalogCleanup();
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      onClosed={onClose}
      title="Item catalogue clean-up"
      size="detail"
      footer={
        <Button size="lg" className="flex-1" loading={cleanup.saving} disabled={cleanup.pendingCount === 0} onClick={cleanup.applyAll}>
          {cleanupApplyLabel(cleanup)}
        </Button>
      }
    >
      <CatalogCleanupList cleanup={cleanup} />
    </ResponsiveModal>
  );
}
