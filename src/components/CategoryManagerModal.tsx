import { useEffect, useMemo, useState } from 'react';
import { Factory, ListChecks, Plus, Store as StoreIcon, Trash2 } from 'lucide-react';
import * as api from '../utils/api';
import {
  INVENTORY_CATEGORIES,
  CATEGORY_ITEMS,
  STORE_CATEGORY_ITEMS,
} from '../utils/inventoryData';
import { useCatalogCleanup, CatalogCleanupList, cleanupApplyLabel } from './ItemCatalogCleanup';
import { MiscExpenseRecategorize } from './MiscExpenseRecategorize';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { ListGroup, ListRow } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { SegmentedControl } from './ui/segmented-control';
import { ErrorState } from './ui/error-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { confirm } from './ui/confirm';
import { LoadingList } from './setup/SetupPage';
import { purchaseCategoryIcon, stripEmoji } from './setup/setupIcons';

type Props = {
  onClose: () => void;
};

type Scope = 'store' | 'production';

// Cluster-head-only view of every category and item available when logging store or
// production-house inventory - built-ins (defined in code, can't be deleted here) plus
// whatever custom categories/items have been added on top. Kept as two separate scopes
// throughout since a store's purchases are a small curated subset of what a production
// house needs (see STORE_CATEGORY_ITEMS) - a category that makes sense for one doesn't
// necessarily belong on the other. Categories show a lucide icon, never their stored emoji.
export function CategoryManagerModal({ onClose }: Props) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<'categories' | 'cleanup'>('categories');
  const [scope, setScope] = useState<Scope>('store');
  const [customCategories, setCustomCategories] = useState<api.CustomCategory[]>([]);
  const [customItems, setCustomItems] = useState<api.CustomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const cleanup = useCatalogCleanup(view === 'cleanup');

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
      label: stripEmoji((INVENTORY_CATEGORIES as Record<string, string>)[key] || key),
      isBuiltIn: true,
    }));
    for (const cat of customCategories) {
      if (cat.scope !== scope) continue;
      rows.push({ key: cat.key, label: stripEmoji(cat.label), isBuiltIn: false });
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
      // No emoji from the screen any more; the server keeps its default for older screens.
      await api.addCustomCategory(scope, newCategoryLabel.trim());
      setNewCategoryLabel('');
      setShowAddCategory(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (key: string, label: string) => {
    const ok = await confirm({
      title: `Remove ${label}?`,
      body: 'Only a category with nothing in it can be removed. Purchases already filed under it are unaffected.',
      confirmLabel: 'Remove category',
      tone: 'danger',
    });
    if (!ok) return;
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
      const here = scope === 'store' ? 'stores' : 'production houses';
      const there = scope === 'store' ? 'production houses' : 'stores';
      const ok = await confirm({
        title: `Remove ${name} from ${here}?`,
        body: `It is also used by ${there}, and stays available there.`,
        confirmLabel: `Remove from ${here}`,
        tone: 'danger',
      });
      if (!ok) return;
      setError(null);
      try {
        await api.updateCustomItem(id, { entityType: otherEntityType });
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update item');
      }
      return;
    }

    const ok = await confirm({
      title: `Remove ${name}?`,
      body: 'It goes from the list entirely. Purchases already logged for it stay as they are.',
      confirmLabel: 'Remove item',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    try {
      await api.deleteCustomItem(id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const inCleanup = view === 'cleanup';

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      onClosed={onClose}
      size="detail"
      title={inCleanup ? 'Item catalogue clean-up' : 'Purchase categories and items'}
      description={inCleanup ? undefined : 'Built-in ones are fixed; the ones you add can be removed.'}
      onBack={inCleanup ? () => setView('categories') : undefined}
      dirty={(!inCleanup && (!!newCategoryLabel.trim() || !!newItemName.trim())) && !savingCategory && !savingItem}
      footer={inCleanup ? (
        <Button size="lg" className="flex-1" loading={cleanup.saving} disabled={cleanup.pendingCount === 0} onClick={cleanup.applyAll}>
          {cleanupApplyLabel(cleanup)}
        </Button>
      ) : undefined}
    >
      {inCleanup ? (
        <CatalogCleanupList cleanup={cleanup} />
      ) : (
        <div className="flex flex-col gap-5">
          <SegmentedControl
            aria-label="Which purchases"
            value={scope}
            onValueChange={(v) => { setScope(v); setAddingItemFor(null); }}
            options={[
              { value: 'store', label: 'Store', icon: <StoreIcon className="size-4" aria-hidden="true" /> },
              { value: 'production', label: 'Production house', icon: <Factory className="size-4" aria-hidden="true" /> },
            ]}
          />

          {error && <ErrorState title="That didn't work" body={error} onRetry={loadAll} />}

          {loading ? (
            <LoadingList rows={6} />
          ) : (
            <>
              {categoryRows.map((row) => {
                const items = itemsForCategory(row.key);
                const Icon = purchaseCategoryIcon(row.isBuiltIn ? row.key : null);
                const adding = addingItemFor === row.key;
                return (
                  <ListGroup
                    key={row.key}
                    title={<span className="inline-flex items-center gap-2"><Icon className="size-5 text-text-2" aria-hidden="true" />{row.label}</span>}
                    meta={row.isBuiltIn ? 'Built-in' : 'Added by you'}
                    action={
                      <div className="flex items-center gap-1">
                        {!row.isBuiltIn && (
                          <IconButton size="sm" variant="danger-ghost" label={`Remove ${row.label}`} icon={<Trash2 />} onClick={() => handleDeleteCategory(row.key, row.label)} />
                        )}
                        <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => { setAddingItemFor(adding ? null : row.key); setNewItemName(''); }}>
                          Item
                        </Button>
                      </div>
                    }
                    empty={<p className="px-4 py-3 text-body-sm text-text-2">No items yet.</p>}
                  >
                    {adding && (
                      <div className="flex items-end gap-2 px-4 py-3">
                        <Field label={`New item in ${row.label}`} className="flex-1">
                          <Input
                            autoFocus
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="Item name"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddItem(row.key)}
                          />
                        </Field>
                        <Button loading={savingItem} disabled={!newItemName.trim()} onClick={() => handleAddItem(row.key)}>Save</Button>
                      </div>
                    )}
                    {items.map((item) => (
                      <ListRow
                        key={item.id || item.name}
                        density="compact"
                        title={item.name}
                        trailing={item.isBuiltIn ? (
                          <StatusChip tone="neutral">Built-in</StatusChip>
                        ) : (
                          <IconButton size="sm" variant="danger-ghost" label={`Remove ${item.name}`} icon={<Trash2 />} onClick={() => handleDeleteItem(item.id!, item.name)} />
                        )}
                      />
                    ))}
                  </ListGroup>
                );
              })}

              {showAddCategory ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                  <Field label={`New ${scope === 'store' ? 'store' : 'production house'} category`}>
                    <Input
                      autoFocus
                      value={newCategoryLabel}
                      onChange={(e) => setNewCategoryLabel(e.target.value)}
                      placeholder="e.g. Puja items"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setShowAddCategory(false); setNewCategoryLabel(''); }}>Cancel</Button>
                    <Button className="flex-1" loading={savingCategory} disabled={!newCategoryLabel.trim()} onClick={handleAddCategory}>Add category</Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setShowAddCategory(true)}>Add a category</Button>
              )}
            </>
          )}

          {/* Catalog clean-up tools (moved here from the Export page, which is downloads only). */}
          <ListGroup overline="Clean-up tools">
            <ListRow
              icon={ListChecks}
              title="Item catalogue clean-up"
              subtitle="Duplicate or misspelled items and Bengali names. Nothing changes until you approve each row."
              onClick={() => setView('cleanup')}
            />
          </ListGroup>
          <MiscExpenseRecategorize />
        </div>
      )}
    </ResponsiveModal>
  );
}
