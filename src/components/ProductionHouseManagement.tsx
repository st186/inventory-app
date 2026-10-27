import { useState } from 'react';
import { ArrowLeftRight, Check, Factory, Plus, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { NumberStepper } from './ui/number-stepper';
import { ListGroup, ListRow } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { EmptyState } from './ui/empty-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { confirm } from './ui/confirm';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  onRefreshStores: () => void;
};

type Flavour = keyof api.ProductionHouse['inventory'];
const FLAVOURS: { key: Flavour; label: string }[] = [
  { key: 'chicken', label: 'Chicken' },
  { key: 'chickenCheese', label: 'Chicken cheese' },
  { key: 'veg', label: 'Veg' },
  { key: 'cheeseCorn', label: 'Cheese corn' },
  { key: 'paneer', label: 'Paneer' },
  { key: 'vegKurkure', label: 'Veg kurkure' },
  { key: 'chickenKurkure', label: 'Chicken kurkure' },
];
const ZERO: api.ProductionHouse['inventory'] = { chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0, paneer: 0, vegKurkure: 0, chickenKurkure: 0 };

/** Pieces in a production house's stock (all seven momo types). */
export const totalPieces = (inventory: api.ProductionHouse['inventory']) => Object.values(inventory).reduce((sum, val) => sum + val, 0);

function StockGrid({ inventory }: { inventory: api.ProductionHouse['inventory'] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {FLAVOURS.map((f) => (
        <div key={f.key} className="flex flex-col rounded-md bg-surface-2 px-3 py-2">
          <dt className="text-label text-text-2">{f.label}</dt>
          <dd className="num text-body-md font-semibold text-text">{inventory[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

// Production houses (owner, Setup > Stores and production houses): the list with each house's
// stock, a sheet per house (stock, production head, the stores it serves, delete), adding a
// house, moving stock between houses, and linking stores that have no production house yet.
export function ProductionHouseManagement({ context, stores, employees, onRefreshStores }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [houseOpen, setHouseOpen] = useState(false);
  const [headChoice, setHeadChoice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [linkStore, setLinkStore] = useState<api.Store | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkChoice, setLinkChoice] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    productionHeadId: '',
  });
  const [transferData, setTransferData] = useState({
    fromHouseId: '',
    toHouseId: '',
    quantities: { ...ZERO },
  });

  const productionHeads = employees.filter(e => e.designation === 'production_incharge');
  const house = context.productionHouses.find((h) => h.id === houseId) || null;
  const unmappedStores = stores.filter(s => !s.productionHouseId);
  const transferTotal = Object.values(transferData.quantities).reduce((sum, val) => sum + val, 0);

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.location.trim()) {
      toast.error('Enter the name and the location');
      return;
    }
    setBusy('create');
    try {
      await context.addProductionHouse({
        name: formData.name,
        location: formData.location,
        productionHeadId: formData.productionHeadId || null,
        inventory: { ...ZERO },
        createdBy: context.user?.employeeId || context.user?.email || 'unknown',
      });

      toast.success('Production house created');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating production house:', error);
      toast.error('Failed to create production house. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleAssignProductionHead = async (houseIdToSet: string, headId: string) => {
    try {
      if (!context.user?.accessToken) return;
      setBusy('head');

      await api.assignProductionHeadToHouse(context.user.accessToken, houseIdToSet, headId);

      // Update locally
      await context.updateProductionHouse(houseIdToSet, { productionHeadId: headId });

      toast.success('Production head assigned', { description: 'Refresh the app for the change to reach their login.' });
      setHouseOpen(false);
    } catch (error) {
      console.error('Error assigning production head:', error);
      toast.error('Failed to assign production head. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleAssignStoreToHouse = async (storeId: string, toHouseId: string) => {
    try {
      if (!context.user?.accessToken) return;
      setBusy('link');

      await api.assignStoreToProductionHouse(context.user.accessToken, storeId, toHouseId);

      toast.success('Store linked to the production house');
      setLinkOpen(false);
      onRefreshStores(); // Refresh stores to show updated mapping
    } catch (error) {
      console.error('Error assigning store:', error);
      toast.error('Failed to assign store. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteProductionHouse = async (deleteId: string, houseName: string) => {
    const ok = await confirm({
      title: `Delete ${houseName}?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Delete production house',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setBusy('delete');
      await context.deleteProductionHouse(deleteId);
      toast.success('Production house deleted');
      setHouseOpen(false);
    } catch (error) {
      console.error('Error deleting production house:', error);
      toast.error('Failed to delete production house. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleTransferInventory = async () => {
    if (!transferData.fromHouseId || !transferData.toHouseId) {
      toast.error('Pick both production houses');
      return;
    }

    if (transferData.fromHouseId === transferData.toHouseId) {
      toast.error('Pick two different production houses');
      return;
    }

    const totalTransfer = Object.values(transferData.quantities).reduce((sum, val) => sum + val, 0);
    if (totalTransfer === 0) {
      toast.error('Enter how many to move');
      return;
    }

    const fromHouse = context.productionHouses.find(h => h.id === transferData.fromHouseId);
    const toHouse = context.productionHouses.find(h => h.id === transferData.toHouseId);

    const ok = await confirm({
      title: `Move ${totalTransfer} pieces?`,
      body: `From ${fromHouse?.name} to ${toHouse?.name}. This cannot be undone.`,
      confirmLabel: 'Move stock',
      tone: 'primary',
    });
    if (!ok) return;

    try {
      if (!context.user?.accessToken) {
        toast.error('Not signed in');
        return;
      }
      setBusy('transfer');

      await api.transferInventoryBetweenHouses(
        context.user.accessToken,
        transferData.fromHouseId,
        transferData.toHouseId,
        transferData.quantities
      );

      // Refresh production houses
      const houses = await api.getProductionHouses();
      context.setProductionHouses(houses);

      toast.success('Stock moved');
      setShowTransferDialog(false);
    } catch (error: any) {
      console.error('Error transferring inventory:', error);
      toast.error(`Failed to move the stock: ${error.message || 'Unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const handleTransferAll = () => {
    const sourceHouse = context.productionHouses.find(h => h.id === transferData.fromHouseId);
    if (!sourceHouse) {
      toast.error('Pick the production house to move from first');
      return;
    }

    setTransferData({
      ...transferData,
      quantities: {
        chicken: sourceHouse.inventory.chicken,
        chickenCheese: sourceHouse.inventory.chickenCheese,
        veg: sourceHouse.inventory.veg,
        cheeseCorn: sourceHouse.inventory.cheeseCorn,
        paneer: sourceHouse.inventory.paneer,
        vegKurkure: sourceHouse.inventory.vegKurkure,
        chickenKurkure: sourceHouse.inventory.chickenKurkure,
      },
    });
  };

  const openHouse = (h: api.ProductionHouse) => {
    setHouseId(h.id);
    setHeadChoice(h.productionHeadId || '');
    setHouseOpen(true);
  };

  const sourceHouse = context.productionHouses.find(h => h.id === transferData.fromHouseId);

  return (
    <>
      <ListGroup
        title="Production houses"
        meta={context.productionHouses.length ? String(context.productionHouses.length) : undefined}
        action={<Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => { setFormData({ name: '', location: '', productionHeadId: '' }); setShowCreateForm(true); }}>Add</Button>}
        empty={<EmptyState compact icon={Factory} title="No production houses yet" body="Add the kitchen that makes the momos." />}
      >
        {context.productionHouses.map(h => {
          const head = productionHeads.find(p => p.employeeId === h.productionHeadId);
          const mapped = stores.filter(s => s.productionHouseId === h.id).length;
          return (
            <ListRow
              key={h.id}
              icon={Factory}
              title={h.name}
              subtitle={[h.location, head ? `Head ${head.name}` : 'No production head', `${mapped} store${mapped === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
              trailing={<span className="num text-body-md font-semibold text-text">{totalPieces(h.inventory)} pcs</span>}
              onClick={() => openHouse(h)}
            />
          );
        })}
        {context.productionHouses.length > 1 && (
          <ListRow
            icon={ArrowLeftRight}
            title="Move stock between houses"
            onClick={() => { setTransferData({ fromHouseId: '', toHouseId: '', quantities: { ...ZERO } }); setShowTransferDialog(true); }}
          />
        )}
      </ListGroup>

      {/* Stores with no production house */}
      {context.productionHouses.length > 0 && (
        unmappedStores.length === 0 ? (
          <p className="-mt-2 flex items-center gap-1.5 px-1 text-label text-text-3">
            <Check className="size-4 text-success" aria-hidden="true" /> Every store is linked to a production house
          </p>
        ) : (
          <ListGroup overline="Stores without a production house">
            {unmappedStores.map(store => (
              <ListRow
                key={store.id}
                icon={Store}
                iconTone="warning"
                title={store.name}
                subtitle={store.location}
                trailing={<StatusChip tone="warning">Link</StatusChip>}
                onClick={() => { setLinkStore(store); setLinkChoice(''); setLinkOpen(true); }}
              />
            ))}
          </ListGroup>
        )
      )}

      {/* One production house */}
      <ResponsiveModal
        open={houseOpen}
        onOpenChange={setHouseOpen}
        onClosed={() => setHouseId(null)}
        title={house?.name || 'Production house'}
        description={house ? `${house.location} · ID ${house.id}` : undefined}
        size="detail"
        dirty={!!house && headChoice !== (house.productionHeadId || '') && busy !== 'head'}
        footer={house ? (
          <>
            <IconButton variant="danger-ghost" label="Delete production house" icon={<Trash2 />} loading={busy === 'delete'} disabled={!!busy} onClick={() => handleDeleteProductionHouse(house.id, house.name)} />
            <Button size="lg" className="flex-1" loading={busy === 'head'} disabled={!!busy || headChoice === (house.productionHeadId || '')} onClick={() => handleAssignProductionHead(house.id, headChoice)}>
              Save production head
            </Button>
          </>
        ) : undefined}
      >
        {house && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-subtitle font-semibold text-text">Stock now</span>
                <span className="num text-body-md font-semibold text-text">{totalPieces(house.inventory)} pcs</span>
              </div>
              <StockGrid inventory={house.inventory} />
            </div>
            <Field label="Production head">
              <NativeSelect value={headChoice} onChange={(e) => setHeadChoice(e.target.value)}>
                <option value="">No production head assigned</option>
                {productionHeads.map(head => (
                  <option key={head.employeeId} value={head.employeeId}>
                    {head.name} ({head.employeeId})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <ListGroup
              overline={`Stores it serves (${stores.filter(s => s.productionHouseId === house.id).length})`}
              empty={<p className="px-4 py-3 text-body-sm text-text-2">No stores linked to this production house yet.</p>}
            >
              {stores.filter(s => s.productionHouseId === house.id).map(store => (
                <ListRow key={store.id} density="compact" icon={Store} title={store.name} subtitle={store.location} />
              ))}
            </ListGroup>
          </div>
        )}
      </ResponsiveModal>

      {/* Add a production house */}
      <ResponsiveModal
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        title="Add production house"
        dirty={!!(formData.name || formData.location || formData.productionHeadId) && busy !== 'create'}
        footer={<Button size="lg" className="flex-1" loading={busy === 'create'} onClick={handleCreate}>Add production house</Button>}
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" required>
            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Main kitchen" />
          </Field>
          <Field label="Location" required>
            <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Street, area" />
          </Field>
          <Field label="Production head" optional>
            <NativeSelect value={formData.productionHeadId} onChange={(e) => setFormData({ ...formData, productionHeadId: e.target.value })}>
              <option value="">Choose later</option>
              {productionHeads.map(head => (
                <option key={head.employeeId} value={head.employeeId}>
                  {head.name} ({head.employeeId})
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </ResponsiveModal>

      {/* Move stock between houses */}
      <ResponsiveModal
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        title="Move stock between houses"
        size="detail"
        dirty={transferTotal > 0 && busy !== 'transfer'}
        footer={<Button size="lg" className="flex-1" loading={busy === 'transfer'} disabled={transferTotal === 0} onClick={handleTransferInventory}>Move {transferTotal} pieces</Button>}
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From">
              <NativeSelect value={transferData.fromHouseId} onChange={(e) => setTransferData({ ...transferData, fromHouseId: e.target.value })}>
                <option value="">Choose</option>
                {context.productionHouses.map(h => (
                  <option key={h.id} value={h.id}>{h.name} - {h.location}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="To">
              <NativeSelect value={transferData.toHouseId} onChange={(e) => setTransferData({ ...transferData, toHouseId: e.target.value })}>
                <option value="">Choose</option>
                {context.productionHouses.filter(h => h.id !== transferData.fromHouseId).map(h => (
                  <option key={h.id} value={h.id}>{h.name} - {h.location}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {sourceHouse && (
            <div className="flex flex-col gap-2">
              <span className="text-body-sm font-medium text-text">In stock at {sourceHouse.name}</span>
              <StockGrid inventory={sourceHouse.inventory} />
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-subtitle font-semibold text-text">How many to move</span>
              <Button variant="secondary" size="sm" onClick={handleTransferAll}>Move all</Button>
            </div>
            {FLAVOURS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <span className="text-body-md text-text">{f.label}</span>
                <NumberStepper
                  label={f.label}
                  value={transferData.quantities[f.key]}
                  min={0}
                  editable
                  onChange={(n) => setTransferData((d) => ({ ...d, quantities: { ...d.quantities, [f.key]: n } }))}
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-body-md font-semibold text-text">Total</span>
              <span className="num text-title font-semibold text-text">{transferTotal} pcs</span>
            </div>
          </div>
        </div>
      </ResponsiveModal>

      {/* Link a store */}
      <ResponsiveModal
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onClosed={() => setLinkStore(null)}
        title={linkStore ? `Link ${linkStore.name}` : 'Link store'}
        description="Which production house sends stock to this store?"
        footer={<Button size="lg" className="flex-1" loading={busy === 'link'} disabled={!linkChoice || !linkStore} onClick={() => linkStore && handleAssignStoreToHouse(linkStore.id, linkChoice)}>Link store</Button>}
      >
        <Field label="Production house">
          <NativeSelect value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)}>
            <option value="">Choose</option>
            {context.productionHouses.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </ResponsiveModal>
    </>
  );
}
