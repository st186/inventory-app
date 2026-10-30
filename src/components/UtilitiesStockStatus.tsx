import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package } from 'lucide-react';
import { Button } from './ui/button';
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

const n = (x: number) => x.toLocaleString('en-IN');
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Burgers (owner, 30 Oct 2026): buns bought (logged "Burger" purchases, 4 buns a packet) against
// burgers sold in POS orders - standalone, Mania combos (2 each) and momo meals (1 each) - and what
// doesn't add up.
// The server also sends these as notifications after the nightly POS sync (burgerCheck.ts).
function BurgerSection({ data, canSet, onSet }: { data: api.BurgerCheck; canSet: boolean; onSet: (n: number) => Promise<void> }) {
  const [saving, setSaving] = useState<number | null>(null);
  const set = async (x: number) => {
    setSaving(x);
    try { await onSet(x); } finally { setSaving(null); }
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Burgers">
      <div className="flex min-w-0 flex-col">
        <h3 className="text-subtitle font-semibold text-text">Burgers</h3>
        <p className="text-body-sm text-text-2">Buns bought (logged as "Burger") − burgers sold (POS orders), since {shortDay(data.since)}</p>
      </div>
      {!data.bunsPerUnit && (
        <Callout tone="warning" title='How many buns are in one logged "Burger"?'>
          Each entry costs ₹35–38, the same as the ones logged as packets, so it is probably a packet. Until this is set, each counts as 1 bun and the burger alerts stay off.
          {canSet ? (
            <span className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 4, 6].map((x) => (
                <Button key={x} size="sm" variant="secondary" loading={saving === x} disabled={saving !== null} onClick={() => set(x)}>{x} bun{x === 1 ? '' : 's'}</Button>
              ))}
            </span>
          ) : ' The owner sets this.'}
        </Callout>
      )}
      {data.anomalies.map((a, i) => (
        <Callout key={`${a.kind}-${i}`} tone={a.kind === 'sold-more' || a.kind === 'none-sold' ? 'danger' : a.kind === 'bought-more' ? 'warning' : 'neutral'}
          title={a.kind === 'sold-more' ? 'More burgers sold than buns bought' : a.kind === 'bought-more' ? 'Buns going stale' : a.kind === 'none-sold' ? 'No burgers sold for 2 days' : 'Check this purchase'}>
          {a.text}.{a.kind === 'sold-more' ? ' Buns bought and not logged, or the count is off.' : a.kind === 'bought-more' ? ' Bought too many, or burgers made and not billed.'
            : a.kind === 'none-sold' ? ' Out of buns, or burgers and meals switched off in Ciferon? If they are being sold, they are not being billed.' : ''}
        </Callout>
      ))}
      <StatGrid>
        <StatTile
          label="Burger buns left"
          value={<span className="num">{n(data.left)}</span>}
          caption={`Bought ${n(data.bought)} (${data.entries} entr${data.entries === 1 ? 'y' : 'ies'}${data.bunsPerUnit ? `, ${data.bunsPerUnit} a packet` : ''}) · used ${n(data.sold.total)}${data.stale ? ` · went stale ${n(data.stale)}` : ''}${data.short ? ` · sold without a bun logged ${n(data.short)}` : ''}`}
          tone={data.left < 0 ? 'danger' : 'default'}
        />
        <StatTile
          label="Burgers sold"
          value={<span className="num">{n(data.sold.total)}</span>}
          caption={`Standalone ${n(data.sold.standalone)} · Mania ${n(data.sold.mania)} · meals ${n(data.sold.combo)}`}
        />
      </StatGrid>
      <ListGroup title="Week by week" footer="One bun a burger. Mania combos count 2 burgers each, momo meals 1 (online meals included, though they have no burger line of their own); a combo's own line isn't counted again.">
        {data.weeks.map((w) => {
          const gap = w.bought - w.sold;
          return (
            <ListRow key={w.from} density="compact" title={`${shortDay(w.from)} – ${shortDay(w.to)}`}
              subtitle={`Bought ${n(w.bought)} · sold ${n(w.sold)}`}
              trailing={<span className={`num text-body-md font-semibold ${gap < 0 ? 'text-danger' : 'text-text'}`}>{gap > 0 ? '+' : ''}{n(gap)}</span>} />
          );
        })}
      </ListGroup>
    </section>
  );
}

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

          {consumption.burgers && (
            <BurgerSection
              data={consumption.burgers}
              canSet={context.user?.role === 'cluster_head' || (context.user?.role === 'manager' && !['store_incharge', 'production_incharge'].includes(context.user?.designation || ''))}
              onSet={async (n) => {
                await api.setBurgerBunsPerUnit(context.user!.accessToken, n);
                setReloadKey((k) => k + 1);
              }}
            />
          )}

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
