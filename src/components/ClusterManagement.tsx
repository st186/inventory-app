import { useState, useEffect } from 'react';
import { Factory, LayoutGrid, Store } from 'lucide-react';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { InventoryContextType } from '../App';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';

type ClusterManagementProps = {
  context: InventoryContextType;
};

// Which stores and production houses the owner's reports and analytics cover (Setup > Stores and
// production houses). Saving reloads the app so every screen picks up the new set.
export function ClusterManagement({ context }: ClusterManagementProps) {
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedProductionHouseIds, setSelectedProductionHouseIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [open, setOpen] = useState(false);

  // Initialize with current assignments from context
  useEffect(() => {
    if (context.managedStoreIds && context.managedProductionHouseIds) {
      setSelectedStoreIds(context.managedStoreIds);
      setSelectedProductionHouseIds(context.managedProductionHouseIds);
    }
  }, [context.managedStoreIds, context.managedProductionHouseIds]);

  // Check if there are changes
  useEffect(() => {
    const storesChanged = JSON.stringify([...selectedStoreIds].sort()) !==
                          JSON.stringify([...(context.managedStoreIds || [])].sort());
    const phChanged = JSON.stringify([...selectedProductionHouseIds].sort()) !==
                      JSON.stringify([...(context.managedProductionHouseIds || [])].sort());
    setHasChanges(storesChanged || phChanged);
  }, [selectedStoreIds, selectedProductionHouseIds, context.managedStoreIds, context.managedProductionHouseIds]);

  const toggleStore = (storeId: string) => {
    setSelectedStoreIds(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  const toggleProductionHouse = (phId: string) => {
    setSelectedProductionHouseIds(prev =>
      prev.includes(phId)
        ? prev.filter(id => id !== phId)
        : [...prev, phId]
    );
  };

  const handleSave = async () => {
    if (!context.user?.employeeId || !context.user?.accessToken) {
      toast.error('Employee ID not found');
      return;
    }

    setLoading(true);
    try {
      await api.updateClusterAssignments(
        context.user.accessToken,
        context.user.employeeId,
        selectedStoreIds,
        selectedProductionHouseIds
      );

      toast.success('Saved. Reloading the app...');

      // Reload the page to update context with new assignments
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error updating cluster assignments:', error);
      toast.error('Failed to update cluster assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedStoreIds(context.managedStoreIds || []);
    setSelectedProductionHouseIds(context.managedProductionHouseIds || []);
  };

  const storeCount = (context.managedStoreIds || []).length;
  const houseCount = (context.managedProductionHouseIds || []).length;

  return (
    <>
      <ListGroup overline="Your reports cover" footer="Insights, reports and exports add up the places ticked here.">
        <ListRow
          icon={LayoutGrid}
          title={`${storeCount} of ${context.stores.length} store${context.stores.length === 1 ? '' : 's'}`}
          subtitle={`${houseCount} of ${context.productionHouses.length} production house${context.productionHouses.length === 1 ? '' : 's'}`}
          onClick={() => { handleReset(); setOpen(true); }}
        />
      </ListGroup>

      <ResponsiveModal
        open={open}
        onOpenChange={(next) => { setOpen(next); if (!next) handleReset(); }}
        title="Your reports cover"
        description={`${selectedStoreIds.length + selectedProductionHouseIds.length} places ticked`}
        dirty={hasChanges && !loading}
        footer={
          <>
            <Button variant="secondary" size="lg" disabled={loading || !hasChanges} onClick={handleReset}>Undo changes</Button>
            <Button size="lg" className="flex-1" loading={loading} disabled={!hasChanges} onClick={handleSave}>Save</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <ListGroup
            overline={`Stores · ${selectedStoreIds.length} ticked`}
            empty={<p className="px-4 py-3 text-body-sm text-text-2">No stores yet.</p>}
          >
            {context.stores.map(store => (
              <label key={store.id} className="flex min-h-15 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <Store className="size-5 shrink-0 text-text-2" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-md font-medium text-text">{store.name}</span>
                  {store.location && <span className="text-label text-text-3">{store.location}</span>}
                </span>
                <Checkbox checked={selectedStoreIds.includes(store.id)} onCheckedChange={() => toggleStore(store.id)} aria-label={store.name} />
              </label>
            ))}
          </ListGroup>
          <ListGroup
            overline={`Production houses · ${selectedProductionHouseIds.length} ticked`}
            empty={<p className="px-4 py-3 text-body-sm text-text-2">No production houses yet.</p>}
          >
            {context.productionHouses.map(ph => (
              <label key={ph.id} className="flex min-h-15 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <Factory className="size-5 shrink-0 text-text-2" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-md font-medium text-text">{ph.name}</span>
                  {ph.location && <span className="text-label text-text-3">{ph.location}</span>}
                </span>
                <Checkbox checked={selectedProductionHouseIds.includes(ph.id)} onCheckedChange={() => toggleProductionHouse(ph.id)} aria-label={ph.name} />
              </label>
            ))}
          </ListGroup>
        </div>
      </ResponsiveModal>
    </>
  );
}
