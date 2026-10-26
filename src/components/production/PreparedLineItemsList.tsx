import { Trash2 } from 'lucide-react';
import { getMomoType } from '../../constants/momoTypes';
import type { ProductionLedgerItem } from '../../utils/api';

type Props = {
  items: ProductionLedgerItem[];
  disabled?: boolean;
  onDelete: (id: string) => void | Promise<void>;
};

// Today's logged batches so far, editable/removable before the day is closed. Read-only
// once `disabled` (the day is already closed, or this user can't edit) - a closed day's
// wastage/opening-for-tomorrow depends on this list being stable.
export function PreparedLineItemsList({ items, disabled, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center text-sm text-gray-500">
        No batches logged yet today.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Today's Batches ({items.length})</h2>
      <div className="space-y-2">
        {items.map((item) => {
          // GLOBAL_DOUGH/GLOBAL_BATTER are direct logs of the shared pool itself (see
          // LogSharedPoolForm) - no momo type attached, shown as their own simple line
          // rather than trying to look up a momo type that doesn't exist for them.
          if (item.momoKey === 'GLOBAL_DOUGH' || item.momoKey === 'GLOBAL_BATTER') {
            const label = item.momoKey === 'GLOBAL_DOUGH' ? 'Dough' : 'Batter';
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 bg-amber-50 rounded-xl border border-amber-200 p-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Shared {label}</div>
                  <div className="text-xs text-gray-500">
                    {item.globalPoolQty}kg{item.loggedByName ? ` · by ${item.loggedByName}` : ''}
                  </div>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove this entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          }

          const momoType = getMomoType(item.momoKey);
          const globalLabel = momoType?.globalPoolField === 'batter' ? 'Batter' : 'Dough';
          const perTypeLabel = momoType?.perTypePoolField === 'coating' ? 'Coating' : 'Stuffing';
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl border border-gray-200 p-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">{momoType?.label || item.momoKey}</div>
                <div className="text-xs text-gray-500">
                  {perTypeLabel} {item.perTypePoolQty}kg
                  {item.globalPoolQty > 0 ? ` · Unique ${globalLabel} ${item.globalPoolQty}kg` : ''}
                  {item.loggedByName ? ` · by ${item.loggedByName}` : ''}
                </div>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove this batch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
