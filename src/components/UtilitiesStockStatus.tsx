import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package } from 'lucide-react';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Field } from './ui/field';
import { ListGroup, ListRow } from './ui/list-row';
import { NativeSelect } from './ui/select';
import { SkeletonListRows, SkeletonStatTiles } from './ui/skeleton';
import { StatGrid, StatTile } from './ui/stat-tile';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

// Packaging (box/tray) and beverage stock, computed from real POS order data rather
// than manually logged usage - see the /utilities-consumption endpoint for the full
// box (TakeAway+HomeDelivery) vs tray (DineIn) attribution and Addon-line-skip logic.
const UTILITIES_START_DATE = '2026-07-19';

export function UtilitiesStockStatus({ context, stores }: Props) {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [consumption, setConsumption] = useState<api.UtilitiesConsumption | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!context.user?.accessToken) return;
    setLoading(true);
    api.getUtilitiesConsumption(context.user.accessToken, selectedStore, UTILITIES_START_DATE)
      .then(setConsumption)
      .catch(() => setConsumption(null))
      .finally(() => setLoading(false));
  }, [selectedStore, context.user?.accessToken, reloadKey]);

  // Purchased totals come from the store's own logged inventory purchases (already
  // loaded in context) - every purchase ever logged counts, regardless of date (stock
  // bought before consumption tracking started, e.g. the initial 18 Jul order, is still
  // real stock on hand). Only the *usage* side (consumption, fetched above) is scoped to
  // start from UTILITIES_START_DATE, since that's as far back as POS order data is synced.
  const purchasedPackaging = useMemo(() => {
    const relevant = context.inventory.filter((item) => {
      if (item.category !== 'packaging' && item.category !== 'packaging_bulk') return false;
      if (selectedStore && item.storeId !== selectedStore) return false;
      return true;
    });
    const box = relevant.filter((i) => i.itemName.toLowerCase().includes('momo box')).reduce((sum, i) => sum + i.quantity, 0);
    const tray = relevant.filter((i) => i.itemName.toLowerCase().includes('momo tray')).reduce((sum, i) => sum + i.quantity, 0);
    return { box, tray };
  }, [context.inventory, selectedStore]);

  const purchasedBeverages = useMemo(() => {
    const relevant = context.inventory.filter((item) => {
      if (item.category !== 'beverages') return false;
      if (selectedStore && item.storeId !== selectedStore) return false;
      return true;
    });
    const byName: Record<string, number> = {};
    for (const item of relevant) {
      const key = item.itemName.trim();
      byName[key] = (byName[key] || 0) + item.quantity;
    }
    return byName;
  }, [context.inventory, selectedStore]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-title font-semibold text-text">Boxes, trays and drinks</h2>
          <p className="text-body-sm text-text-2">Bought (logged purchases) − used (POS orders)</p>
        </div>
        <Field label="Store" className="sm:w-64">
          <NativeSelect value={selectedStore || 'all'} onChange={(e) => setSelectedStore(e.target.value === 'all' ? null : e.target.value)}>
            <option value="all">All stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </NativeSelect>
        </Field>
      </div>

      {loading ? (
        <>
          <SkeletonStatTiles count={2} />
          <SkeletonListRows count={4} leading="none" />
        </>
      ) : !consumption ? (
        <ErrorState body="Couldn't load the POS usage. Try again." onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <>
          <Callout tone="info" title={`Usage from POS orders since ${UTILITIES_START_DATE}, through ${consumption.endDate}`}>
            {consumption.daysWithData} day{consumption.daysWithData === 1 ? '' : 's'} synced. Box = takeaway and delivery (Zomato/Swiggy), one per plate or unit sold; tray = dine-in, same basis.
            {consumption.unattributedOrders > 0 && ` ${consumption.unattributedOrders} order(s) had no order type and aren't counted in either.`}
          </Callout>

          <StatGrid>
            {([
              { label: 'Momo boxes left', purchased: purchasedPackaging.box, consumed: consumption.boxesUsed },
              { label: 'Momo trays left', purchased: purchasedPackaging.tray, consumed: consumption.traysUsed },
            ]).map(({ label, purchased, consumed }) => {
              const remaining = purchased - consumed;
              return (
                <StatTile
                  key={label}
                  label={label}
                  value={<span className="num">{remaining.toLocaleString('en-IN')}</span>}
                  caption={`Bought ${purchased.toLocaleString('en-IN')} · used ${consumed.toLocaleString('en-IN')}`}
                  tone={remaining < 0 ? 'danger' : 'default'}
                />
              );
            })}
          </StatGrid>

          {(() => {
            const allNames = new Set([...Object.keys(purchasedBeverages), ...Object.keys(consumption.beverageConsumption)]);
            return (
              <ListGroup
                title="Drinks"
                footer="Matched by exact item name between purchases and POS sales: if a drink shows 0 bought despite sales, log its purchase under the same name."
                empty={<EmptyState compact icon={Package} title="No drink purchases or sales in this period" />}
              >
                {[...allNames].sort().map((name) => {
                  const purchased = purchasedBeverages[name] || 0;
                  const consumed = consumption.beverageConsumption[name] || 0;
                  const remaining = purchased - consumed;
                  return (
                    <ListRow
                      key={name}
                      density="compact"
                      title={name}
                      subtitle={`Bought ${purchased.toLocaleString('en-IN')} · sold ${consumed.toLocaleString('en-IN')}`}
                      trailing={<span className={`num text-body-md font-semibold ${remaining < 0 ? 'text-danger' : 'text-text'}`}>{remaining.toLocaleString('en-IN')}</span>}
                    />
                  );
                })}
              </ListGroup>
            );
          })()}
        </>
      )}
    </div>
  );
}
