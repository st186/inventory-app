import { useState, useEffect } from 'react';
import { DatabaseZap, Plus, Store } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { ListGroup, ListRow } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { confirm } from './ui/confirm';
import { Delayed, SkeletonListRows } from './ui/skeleton';

type StoreManagementProps = {
  onStoreCreated?: () => void;
  userRole?: string;
};

// Stores (owner, Setup > Stores and production houses): the list, a sheet to add one, and a sheet
// per store for its name, location, POS id, manager and production house.
export function StoreManagement({ onStoreCreated, userRole }: StoreManagementProps) {
  const [stores, setStores] = useState<api.Store[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [productionHouses, setProductionHouses] = useState<api.ProductionHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editing, setEditing] = useState<api.Store | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Create form
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit form (details, manager and production house in one sheet)
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCiferonStoreId, setEditCiferonStoreId] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [selectedProductionHouseId, setSelectedProductionHouseId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStores();
    loadManagers();
    loadProductionHouses();
  }, []);

  const loadStores = async () => {
    try {
      const data = await api.getStores();
      setStores(data);
      setLoadError(null);
    } catch (error) {
      // Silently handle authentication errors (user not logged in yet)
      if (error instanceof Error &&
          (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
        return;
      }
      console.error('Error loading stores:', error);
      setLoadError(error instanceof Error ? error.message : 'Could not load the stores');
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    try {
      const employees = await api.getAllEmployees();
      // Filter only managers
      const managersList = employees.filter((emp: any) => emp.role === 'manager');
      setManagers(managersList);
    } catch (error) {
      console.error('Error loading managers:', error);
    }
  };

  const loadProductionHouses = async () => {
    try {
      const data = await api.getProductionHouses();
      setProductionHouses(data);
    } catch (error) {
      console.error('Error loading production houses:', error);
    }
  };

  const handleCreateStore = async () => {
    if (!newStoreName.trim()) {
      toast.error('Enter a store name');
      return;
    }

    setCreating(true);
    try {
      await api.createStore(newStoreName, newStoreLocation);
      toast.success(`${newStoreName.trim()} added`);
      setShowCreateForm(false);
      await loadStores();
      if (onStoreCreated) onStoreCreated();
    } catch (error: any) {
      console.error('Error creating store:', error);
      toast.error(error.message || 'Failed to create store');
    } finally {
      setCreating(false);
    }
  };

  const openStore = (store: api.Store) => {
    setEditing(store);
    setEditName(store.name);
    setEditLocation(store.location);
    setEditCiferonStoreId(store.ciferonStoreId || '');
    setSelectedManagerId(store.managerId || '');
    setSelectedProductionHouseId(store.productionHouseId || '');
    setEditOpen(true);
  };

  const detailsChanged = !!editing && (editName !== editing.name || editLocation !== editing.location || editCiferonStoreId !== (editing.ciferonStoreId || ''));
  const managerChanged = !!editing && !!selectedManagerId && selectedManagerId !== (editing.managerId || '');
  const houseChanged = !!editing && !!selectedProductionHouseId && selectedProductionHouseId !== (editing.productionHouseId || '');
  const dirty = detailsChanged || managerChanged || houseChanged;

  // The same three saves the old card had (edit, assign manager, assign production house), each
  // only when its part changed.
  const handleSave = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      toast.error('Enter a store name');
      return;
    }
    setSaving(true);
    try {
      if (detailsChanged) {
        await api.updateStore(editing.id, editName, editLocation, editCiferonStoreId.trim() || null);
      }
      if (managerChanged) {
        await api.assignManagerToStore(editing.id, selectedManagerId);
      }
      if (houseChanged) {
        await api.assignProductionHouseToStore(editing.id, selectedProductionHouseId);
      }
      await loadStores();
      if (managerChanged) await loadManagers();
      if (houseChanged) {
        await loadProductionHouses();
        // Notify parent to refresh stores
        if (onStoreCreated) onStoreCreated();
      }
      toast.success(`${editName.trim()} saved`);
      setEditOpen(false);
    } catch (error: any) {
      console.error('Error saving store:', error);
      toast.error(error.message || 'Failed to save the store');
    } finally {
      setSaving(false);
    }
  };

  const handleMigrateData = async (store: api.Store) => {
    const ok = await confirm({
      title: `Move old records to ${store.name}?`,
      body: 'Inventory, sales, payroll and employees that have no store yet are all assigned to this store.',
      confirmLabel: 'Move records',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      const result = await api.migrateDataToStore(store.id);
      const c = result.migratedCount;
      toast.success(`Records moved to ${store.name}`, {
        description: `Inventory ${c.inventory} · Overheads ${c.overheads} · Sales ${c.sales} · Employees ${c.employees} · Timesheets ${c.timesheets} · Leaves ${c.leaves} · Payouts ${c.payouts}`,
        duration: 8000,
      });
    } catch (error: any) {
      console.error('Error migrating data:', error);
      toast.error(error.message || 'Failed to migrate data');
    }
  };

  const getManagerName = (managerId?: string | null) => {
    if (!managerId) return null;
    const manager = managers.find(m => m.employeeId === managerId);
    return manager ? `${manager.name} (${manager.employeeId})` : 'Unknown manager';
  };

  const getProductionHouseName = (productionHouseId?: string | null) => {
    if (!productionHouseId) return null;
    const productionHouse = productionHouses.find(ph => ph.id === productionHouseId);
    return productionHouse ? productionHouse.name : 'Unknown production house';
  };

  if (loading) {
    return (
      <Delayed>
        <SkeletonListRows count={2} />
      </Delayed>
    );
  }
  if (loadError && stores.length === 0) return <ErrorState title="Couldn't load the stores" body={loadError} onRetry={() => { setLoading(true); loadStores(); }} />;

  return (
    <>
      <ListGroup
        title="Stores"
        meta={stores.length ? String(stores.length) : undefined}
        action={<Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => { setNewStoreName(''); setNewStoreLocation(''); setShowCreateForm(true); }}>Add store</Button>}
        empty={<EmptyState compact icon={Store} title="No stores yet" body="Add your first store to get started." />}
      >
        {stores.map((store) => {
          const house = getProductionHouseName(store.productionHouseId);
          const manager = getManagerName(store.managerId);
          return (
            <ListRow
              key={store.id}
              icon={Store}
              title={store.name}
              subtitle={[store.location, house || 'No production house', manager ? `Manager ${manager}` : 'No manager'].filter(Boolean).join(' · ')}
              trailing={!store.productionHouseId ? <StatusChip tone="warning">Not linked</StatusChip> : undefined}
              onClick={() => openStore(store)}
            />
          );
        })}
      </ListGroup>

      {/* Add a store */}
      <ResponsiveModal
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        title="Add store"
        dirty={!!(newStoreName || newStoreLocation) && !creating}
        footer={<Button size="lg" className="flex-1" loading={creating} onClick={handleCreateStore}>Add store</Button>}
      >
        <div className="flex flex-col gap-4">
          <Field label="Store name" required>
            <Input value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} placeholder="e.g. Main road store" />
          </Field>
          <Field label="Location" optional>
            <Input value={newStoreLocation} onChange={(e) => setNewStoreLocation(e.target.value)} placeholder="Street, area" />
          </Field>
        </div>
      </ResponsiveModal>

      {/* One store */}
      <ResponsiveModal
        open={editOpen}
        onOpenChange={setEditOpen}
        onClosed={() => setEditing(null)}
        title={editing?.name || 'Store'}
        description={editing ? `ID ${editing.id}` : undefined}
        dirty={dirty && !saving}
        footer={<Button size="lg" className="flex-1" loading={saving} disabled={!dirty} onClick={handleSave}>Save store</Button>}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Store name" required>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </Field>
            <Field label="Location" optional>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
            </Field>
            <Field label="Ciferon POS store ID" optional helper="Turns on the nightly POS sync for this store. Leave blank to skip.">
              <Input value={editCiferonStoreId} onChange={(e) => setEditCiferonStoreId(e.target.value)} placeholder="e.g. 5909" inputMode="numeric" />
            </Field>
            <Field label="Manager" helper="Only managers without a store, or this store's manager, are listed.">
              <NativeSelect value={selectedManagerId} onChange={(e) => setSelectedManagerId(e.target.value)}>
                <option value="">{editing.managerId ? 'Choose a manager' : 'No manager yet'}</option>
                {managers.filter(m => !m.storeId || m.storeId === editing.id).map((manager) => (
                  <option key={manager.employeeId} value={manager.employeeId}>
                    {manager.name} ({manager.employeeId})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Production house" helper="The production house that sends stock to this store.">
              <NativeSelect value={selectedProductionHouseId} onChange={(e) => setSelectedProductionHouseId(e.target.value)}>
                <option value="">{editing.productionHouseId ? 'Choose a production house' : 'Not linked yet'}</option>
                {productionHouses.map((productionHouse) => (
                  <option key={productionHouse.id} value={productionHouse.id}>
                    {productionHouse.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {userRole === 'cluster_head' && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-body-sm font-medium text-text">Old records without a store</span>
                <p className="text-body-sm text-text-2">Assigns every inventory, sales, payroll and employee record that has no store to this one.</p>
                <Button variant="danger-ghost" leadingIcon={<DatabaseZap />} className="self-start" onClick={() => handleMigrateData(editing)}>
                  Move old records here
                </Button>
              </div>
            )}
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}
