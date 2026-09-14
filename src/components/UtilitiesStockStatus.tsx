import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package, Info } from 'lucide-react';
import { Card } from './ui/card';

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

  useEffect(() => {
    if (!context.user?.accessToken) return;
    setLoading(true);
    api.getUtilitiesConsumption(context.user.accessToken, selectedStore, UTILITIES_START_DATE)
      .then(setConsumption)
      .catch(() => setConsumption(null))
      .finally(() => setLoading(false));
  }, [selectedStore, context.user?.accessToken]);

  // Purchased totals come from the store's own logged inventory purchases (already
  // loaded in context) - every purchase ever logged counts, regardless of date (stock
  // bought before consumption tracking started, e.g. the initial 18 Jul order, is still
  // real stock on hand). Only the *usage* side (consumption, fetched above) is scoped to
  // start from UTILITIES_START_DATE, since that's as far back as POS order data is synced.
  const purchasedPackaging = useMemo(() => {
    const relevant = context.inventory.filter((item) => {
      if (item.category !== 'packaging') return false;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center shadow-lg shadow-sky-500/30 flex-shrink-0">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Utilities Stock Status</h1>
            <p className="text-sm sm:text-base text-gray-500">Momo box/tray and beverage stock, from real POS order data</p>
          </div>
        </div>
        <select
          value={selectedStore || 'all'}
          onChange={(e) => setSelectedStore(e.target.value === 'all' ? null : e.target.value)}
          className="px-4 py-2 border rounded-lg bg-background"
        >
          <option value="all">All Stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Loading consumption data...</Card>
      ) : !consumption ? (
        <Card className="p-8 text-center text-muted-foreground">Couldn't load consumption data. Try again.</Card>
      ) : (
        <>
          <Card className="p-4 rounded-2xl bg-gradient-to-r from-sky-50 to-blue-50 border-2 border-sky-200">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-sky-800">
                Consumption tracked from real POS order data since <strong>{UTILITIES_START_DATE}</strong>, through <strong>{consumption.endDate}</strong> ({consumption.daysWithData} day{consumption.daysWithData === 1 ? '' : 's'} synced).
                Box = TakeAway + delivery (Zomato/Swiggy) orders, one per plate/unit sold. Tray = dine-in orders, same basis.
                {consumption.unattributedOrders > 0 && (
                  <> <strong>{consumption.unattributedOrders}</strong> order(s) had no recognizable order type and aren't counted in either bucket.</>
                )}
              </p>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { label: 'Momo Box', purchased: purchasedPackaging.box, consumed: consumption.boxesUsed },
              { label: 'Momo Tray', purchased: purchasedPackaging.tray, consumed: consumption.traysUsed },
            ]).map(({ label, purchased, consumed }) => {
              const remaining = purchased - consumed;
              return (
                <Card key={label} className="p-5 rounded-2xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center">
                      <Package className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">{label}</h3>
                  </div>
                  <p className={`text-2xl font-semibold ${remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>{remaining.toLocaleString()} pcs remaining</p>
                  <div className="flex justify-between text-sm text-muted-foreground mt-2 pt-2 border-t">
                    <span>Purchased: {purchased.toLocaleString()}</span>
                    <span>Used: {consumed.toLocaleString()}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="p-5 rounded-2xl">
            <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-3">Beverages</h3>
            {(() => {
              const allNames = new Set([...Object.keys(purchasedBeverages), ...Object.keys(consumption.beverageConsumption)]);
              if (allNames.size === 0) {
                return <p className="text-sm text-muted-foreground">No beverage purchases or sales found in this period.</p>;
              }
              return (
                <div className="space-y-2">
                  {[...allNames].sort().map((name) => {
                    const purchased = purchasedBeverages[name] || 0;
                    const consumed = consumption.beverageConsumption[name] || 0;
                    const remaining = purchased - consumed;
                    return (
                      <div key={name} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{name}</p>
                          <p className="text-xs text-muted-foreground">Purchased: {purchased.toLocaleString()} · Sold: {consumed.toLocaleString()}</p>
                        </div>
                        <span className={`text-lg font-semibold ${remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>{remaining.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <p className="text-xs text-muted-foreground mt-3">
              Matched by exact item name between purchases and POS sales - if a name here shows 0 purchased despite real sales, log its purchase under that same name so stock tracks correctly.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
