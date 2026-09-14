import { useState, useEffect } from 'react';
import { PlusCircle } from 'lucide-react';
import { MOMO_TYPES, getMomoType } from '../../constants/momoTypes';

type Props = {
  disabled?: boolean;
  submitting?: boolean;
  onAdd: (momoKey: string, globalPoolQty: number, perTypePoolQty: number) => void | Promise<void>;
};

// Logs one prepared line item: pick a momo type, log how much of its own pool (stuffing or
// coating) was just prepared for it. Dough/batter is NOT asked here by default - it's a
// shared pool logged once for the whole day (see LogSharedPoolForm above this) - except for
// the rare momo type that needs its own dedicated dough/batter instead of drawing from the
// shared pool, offered as an explicit opt-in toggle rather than a field that's always there
// asking to be filled in "just in case". Submits immediately per item (eager-persist)
// rather than batching into one big form - matches this app's existing pattern elsewhere.
export function PrepareLineItemForm({ disabled, submitting, onAdd }: Props) {
  const [momoKey, setMomoKey] = useState(MOMO_TYPES[0].key);
  const [perTypeQty, setPerTypeQty] = useState('');
  const [hasUniqueGlobal, setHasUniqueGlobal] = useState(false);
  const [uniqueGlobalQty, setUniqueGlobalQty] = useState('');

  const momoType = getMomoType(momoKey) || MOMO_TYPES[0];
  const globalFieldLabel = momoType.globalPoolField === 'dough' ? 'Dough' : 'Batter';
  const perTypeLabel = momoType.perTypePoolField === 'stuffing' ? 'Stuffing (kg)' : 'Coating Mix (kg)';

  // Switching momo type mid-entry with the toggle still on from a previous type would carry
  // a stale "unique dough" amount over to a type that never asked for one - reset instead.
  useEffect(() => {
    setHasUniqueGlobal(false);
    setUniqueGlobalQty('');
  }, [momoKey]);

  const handleAdd = async () => {
    const p = parseFloat(perTypeQty) || 0;
    const g = hasUniqueGlobal ? (parseFloat(uniqueGlobalQty) || 0) : 0;
    if (p <= 0 && g <= 0) return;
    await onAdd(momoKey, g, p);
    setPerTypeQty('');
    setHasUniqueGlobal(false);
    setUniqueGlobalQty('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4">Log Prepared Batch</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Momo Type</label>
          <select
            value={momoKey}
            onChange={(e) => setMomoKey(e.target.value as typeof MOMO_TYPES[number]['key'])}
            disabled={disabled}
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          >
            {MOMO_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{perTypeLabel}</label>
          <input
            type="number"
            step="0.01"
            value={perTypeQty}
            onChange={(e) => setPerTypeQty(e.target.value)}
            disabled={disabled}
            placeholder="0.00"
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          />
        </div>
        <div className="flex items-center h-[52px]">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasUniqueGlobal}
              onChange={(e) => setHasUniqueGlobal(e.target.checked)}
              disabled={disabled}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Unique {globalFieldLabel.toLowerCase()} for this?
          </label>
        </div>
      </div>

      {hasUniqueGlobal && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {globalFieldLabel} for {momoType.label} only (kg)
            </label>
            <input
              type="number"
              step="0.01"
              value={uniqueGlobalQty}
              onChange={(e) => setUniqueGlobalQty(e.target.value)}
              disabled={disabled}
              placeholder="0.00"
              autoFocus
              className="w-full px-4 py-3 text-base border-2 border-orange-300 bg-orange-50 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Kept separate from the shared {globalFieldLabel.toLowerCase()} pool above - won't count against or draw from it.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled || submitting || (!perTypeQty && !(hasUniqueGlobal && uniqueGlobalQty))}
        className="mt-4 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold text-sm"
      >
        <PlusCircle className="w-4 h-4" />
        {submitting ? 'Adding…' : 'Add to Today\'s Batches'}
      </button>
    </div>
  );
}
