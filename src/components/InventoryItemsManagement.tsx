import { useState, useEffect, lazy, Suspense } from 'react';
import { InventoryContextType } from '../App';
import { Factory, Package, PackagePlus, Plus, Store as StoreIcon, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../utils/supabase/info';
import { currentAccessToken } from '../utils/accessToken';
import { useT, hasTranslation, type I18nKey } from '../utils/i18n';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { ChoiceChips, FilterChips } from './ui/chip';
import { ListGroup, ListRow } from './ui/list-row';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { SkeletonSheet } from './ui/skeleton';
import { confirm } from './ui/confirm';
import { SetupPage, LoadingList } from './setup/SetupPage';
import { unitKey } from './setup/itemLabels';

const CategoryManagerModal = lazy(() => import('./CategoryManagerModal').then((m) => ({ default: m.CategoryManagerModal })));

type Props = {
  context: InventoryContextType;
  /** Kept for callers; the shell's top bar has the back arrow now. */
  onBack?: () => void;
};

export interface InventoryItem {
  id: string;
  name: string;
  displayName: string;
  category: 'finished_product' | 'raw_material' | 'sauce_chutney';
  unit: string;
  linkedEntityType: 'store' | 'production_house' | 'global';
  linkedEntityId?: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

type Category = InventoryItem['category'];
type EntityType = InventoryItem['linkedEntityType'];
const CATEGORIES: Category[] = ['finished_product', 'raw_material', 'sauce_chutney'];
const UNITS = ['pieces', 'kg', 'liters', 'grams', 'ml'];
const ITEMS_URL = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items`;
const EMPTY_FORM = { displayName: '', category: 'finished_product' as Category, unit: 'pieces', linkedEntityType: 'global' as EntityType, linkedEntityId: '' };

// Setup > Items and categories: the stock item catalogue (what is counted and requested at each
// store and production house). Incharges on employee logins can still edit it (owner decision);
// the owner also opens the purchase categories from here.
export function InventoryItemsManagement({ context }: Props) {
  const { t, lang } = useT();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [initialForm, setInitialForm] = useState({ ...EMPTY_FORM });

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterEntityType, setFilterEntityType] = useState<string>('all');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(ITEMS_URL, {
        headers: {
          'Authorization': `Bearer ${await currentAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load inventory items');
      }

      const data = await response.json();
      setItems(data.items || []);
      setLoadError(null);
    } catch (err) {
      console.error('Error loading items:', err);
      setLoadError(err instanceof Error ? err.message : t('items.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      toast.error(t('assets.err.name'));
      return;
    }
    if (formData.linkedEntityType !== 'global' && !formData.linkedEntityId) {
      toast.error(formData.linkedEntityType === 'store' ? t('items.pickStore') : t('items.pickHouse'));
      return;
    }

    try {
      setSaving(true);
      const name = formData.displayName.toLowerCase().replace(/\s+/g, '_');

      const payload = {
        name,
        displayName: formData.displayName,
        category: formData.category,
        unit: formData.unit,
        linkedEntityType: formData.linkedEntityType,
        linkedEntityId: formData.linkedEntityType === 'global' ? undefined : formData.linkedEntityId,
        userId: context.user?.employeeId || 'unknown',
      };

      const url = editingId ? `${ITEMS_URL}/${editingId}` : ITEMS_URL;

      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await currentAccessToken()}`
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save item');
      }

      toast.success(editingId ? t('items.updated') : t('items.created'));
      setFormOpen(false);
      await loadItems();
    } catch (err) {
      console.error('Error saving item:', err);
      toast.error(err instanceof Error ? err.message : t('items.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM });
    setInitialForm({ ...EMPTY_FORM });
    setFormOpen(true);
  };

  const handleEdit = (item: InventoryItem) => {
    const next = {
      displayName: item.displayName,
      category: item.category,
      unit: item.unit,
      linkedEntityType: item.linkedEntityType,
      linkedEntityId: item.linkedEntityId || '',
    };
    setEditingId(item.id);
    setFormData(next);
    setInitialForm(next);
    setFormOpen(true);
  };

  const handleDelete = async (item: InventoryItem) => {
    const ok = await confirm({ title: t('items.deleteTitle', { name: item.displayName }), body: t('items.deleteBody'), confirmLabel: t('items.deleteConfirm'), tone: 'danger' });
    if (!ok) return;

    try {
      const response = await fetch(`${ITEMS_URL}/${item.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await currentAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      toast.success(t('items.deleted'));
      setFormOpen(false);
      await loadItems();
    } catch (err) {
      console.error('Error deleting item:', err);
      toast.error(err instanceof Error ? err.message : t('items.deleteFailed'));
    }
  };

  const handleInitializeDefaults = async () => {
    const ok = await confirm({ title: t('items.initTitle'), body: t('items.initBody'), confirmLabel: t('items.initDefaults'), tone: 'primary' });
    if (!ok) return;

    try {
      setLoading(true);
      const response = await fetch(`${ITEMS_URL}/initialize-defaults`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await currentAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to initialize defaults');
      }

      toast.success(t('items.initDone'));
      await loadItems();
    } catch (err) {
      console.error('Error initializing defaults:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to initialize defaults');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterEntityType !== 'all' && item.linkedEntityType !== filterEntityType) return false;
    return true;
  });

  const categoryLabel = (category: string) => {
    const key = `items.cat.${category}` as I18nKey;
    return hasTranslation('en', key) ? t(key) : category.replace('_', ' ');
  };
  const unitLabel = (unit: string) => (hasTranslation('en', unitKey(unit)) ? t(unitKey(unit)) : unit);
  const scopeLabel = (item: InventoryItem) =>
    item.linkedEntityType === 'global'
      ? t('items.scope.global')
      : item.linkedEntityType === 'store'
      ? t('items.scope.store', { name: context.stores?.find(s => s.id === item.linkedEntityId)?.name || t('items.scope.unknown') })
      : t('items.scope.house', { name: context.productionHouses?.find(ph => ph.id === item.linkedEntityId)?.name || t('items.scope.unknown') });
  const entityIcon = (type: string) => (type === 'store' ? StoreIcon : type === 'production_house' ? Factory : Package);

  const isOwner = context.user?.role === 'cluster_head';
  const dirty = JSON.stringify(formData) !== JSON.stringify(initialForm);
  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;

  return (
    <SetupPage>
      <div className="flex flex-wrap items-center justify-end gap-2" lang={lang}>
        {!loading && items.length === 0 && !loadError && (
          <Button variant="secondary" leadingIcon={<PackagePlus />} onClick={handleInitializeDefaults}>{t('items.initDefaults')}</Button>
        )}
        <Button leadingIcon={<Plus />} onClick={openAdd} className="max-sm:flex-1">{t('items.add')}</Button>
      </div>

      {isOwner && (
        <ListGroup>
          <ListRow icon={Tags} title={t('items.categories')} subtitle={t('items.categoriesHint')} onClick={() => setCategoriesOpen(true)} />
        </ListGroup>
      )}

      {loading ? (
        <LoadingList rows={6} withTile />
      ) : loadError ? (
        <ErrorState title={t('items.loadFailed')} body={loadError} onRetry={loadItems} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-4">
            {[
              { label: t('items.total'), value: items.filter(i => i.isActive).length },
              { label: t('items.filter.global'), value: items.filter(i => i.linkedEntityType === 'global').length },
              { label: t('items.filter.store'), value: items.filter(i => i.linkedEntityType === 'store').length },
              { label: t('items.filter.house'), value: items.filter(i => i.linkedEntityType === 'production_house').length },
            ].map((s) => (
              <div key={s.label} className="flex min-w-0 flex-col">
                <dt className="text-label text-text-3">{s.label}</dt>
                <dd className="num text-body-md font-semibold text-text">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2">
            <FilterChips
              aria-label={t('items.filterCategory')}
              value={filterCategory}
              onValueChange={setFilterCategory}
              options={[{ value: 'all', label: t('items.filter.all') }, ...CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))]}
            />
            <FilterChips
              aria-label={t('items.filterPlace')}
              value={filterEntityType}
              onValueChange={setFilterEntityType}
              options={[
                { value: 'all', label: t('items.filter.all') },
                { value: 'global', label: t('items.filter.global') },
                { value: 'store', label: t('items.filter.store') },
                { value: 'production_house', label: t('items.filter.house') },
              ]}
            />
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              {items.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={t('items.emptyTitle')}
                  body={t('items.emptyBody')}
                  action={<Button variant="secondary" leadingIcon={<PackagePlus />} onClick={handleInitializeDefaults}>{t('items.initDefaults')}</Button>}
                />
              ) : (
                <EmptyState compact icon={Package} title={t('items.noMatch')} />
              )}
            </div>
          ) : (
            <ListGroup>
              {filteredItems.map(item => (
                <ListRow
                  key={item.id}
                  icon={entityIcon(item.linkedEntityType)}
                  title={item.displayName}
                  subtitle={`${categoryLabel(item.category)} · ${unitLabel(item.unit)} · ${scopeLabel(item)}`}
                  onClick={() => handleEdit(item)}
                />
              ))}
            </ListGroup>
          )}
        </>
      )}

      {/* Add or edit an item */}
      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        onClosed={() => setEditingId(null)}
        title={editingId ? t('items.edit') : t('items.add')}
        description={editingItem ? t('items.addedOn', { date: new Date(editingItem.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }) : undefined}
        dirty={dirty && !saving}
        footer={
          <>
            {editingItem && <IconButton variant="danger-ghost" label={t('items.deleteConfirm')} icon={<Trash2 />} onClick={() => handleDelete(editingItem)} disabled={saving} />}
            <Button size="lg" className="flex-1" loading={saving} onClick={handleSubmit}>{t('items.save')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4" lang={lang}>
          <Field label={t('items.name')} required>
            <Input value={formData.displayName} onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} placeholder={t('items.namePlaceholder')} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">{t('items.category')}</span>
            <ChoiceChips
              aria-label={t('items.category')}
              value={formData.category}
              onValueChange={(v) => setFormData({ ...formData, category: v })}
              options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
            />
          </div>
          <Field label={t('items.unit')}>
            <NativeSelect value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">{t('items.linkTo')}</span>
            <ChoiceChips
              aria-label={t('items.linkTo')}
              value={formData.linkedEntityType}
              onValueChange={(v) => setFormData({ ...formData, linkedEntityType: v, linkedEntityId: '' })}
              options={[
                { value: 'global', label: t('items.link.global') },
                { value: 'store', label: t('items.link.store') },
                { value: 'production_house', label: t('items.link.house') },
              ]}
            />
          </div>
          {formData.linkedEntityType === 'store' && (
            <Field label={t('items.pickStore')} required>
              <NativeSelect value={formData.linkedEntityId} onChange={(e) => setFormData({ ...formData, linkedEntityId: e.target.value })}>
                <option value="">{t('items.choose')}</option>
                {context.stores?.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {formData.linkedEntityType === 'production_house' && (
            <Field label={t('items.pickHouse')} required>
              <NativeSelect value={formData.linkedEntityId} onChange={(e) => setFormData({ ...formData, linkedEntityId: e.target.value })}>
                <option value="">{t('items.choose')}</option>
                {context.productionHouses?.map(ph => (
                  <option key={ph.id} value={ph.id}>{ph.name}</option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
      </ResponsiveModal>

      {categoriesOpen && (
        <Suspense fallback={<SkeletonSheet />}>
          <CategoryManagerModal onClose={() => setCategoriesOpen(false)} />
        </Suspense>
      )}
    </SetupPage>
  );
}
