import { useState } from 'react';
import { PlusCircle } from 'lucide-react';

type Props = {
  disabled?: boolean;
  submitting?: boolean;
  // Sentinel momoKeys 'GLOBAL_DOUGH'/'GLOBAL_BATTER' - a direct log of the shared pool
  // itself, with no momo type attached (see aggregatePreparedByPool server-side).
  onAdd: (poolKey: 'GLOBAL_DOUGH' | 'GLOBAL_BATTER', qty: number) => void | Promise<void>;
};

// Dough/batter is a shared kitchen resource used by every momo type in its group, not
// something that makes sense to re-measure and re-enter on every single batch logged below.
// This logs it once, directly against the shared pool - "Log Prepared Batch" then only
// needs to ask for that batch's own stuffing/coating, with dough/batter left out entirely
// unless a batch explicitly needs its own dedicated portion (see the "Unique dough for
// this?" toggle there). Eager-persist per pool, same pattern as every other entry here.
export function LogSharedPoolForm({ disabled, submitting, onAdd }: Props) {
  const [doughQty, setDoughQty] = useState('');
  const [batterQty, setBatterQty] = useState('');

  const handleAdd = async () => {
    const dough = parseFloat(doughQty) || 0;
    const batter = parseFloat(batterQty) || 0;
    if (dough <= 0 && batter <= 0) return;
    if (dough > 0) await onAdd('GLOBAL_DOUGH', dough);
    if (batter > 0) await onAdd('GLOBAL_BATTER', batter);
    setDoughQty('');
    setBatterQty('');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-1">Log Today's Dough / Batter</h2>
      <p className="text-sm text-gray-500 mb-4">
        Shared across every momo type - log the total prepared today once here, not per batch below.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
          <input
            type="number"
            step="0.01"
            value={doughQty}
            onChange={(e) => setDoughQty(e.target.value)}
            disabled={disabled}
            placeholder="0.00"
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Batter (kg)</label>
          <input
            type="number"
            step="0.01"
            value={batterQty}
            onChange={(e) => setBatterQty(e.target.value)}
            disabled={disabled}
            placeholder="0.00"
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled || submitting || (!doughQty && !batterQty)}
        className="mt-4 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold text-sm"
      >
        <PlusCircle className="w-4 h-4" />
        {submitting ? 'Logging…' : "Log Today's Prep"}
      </button>
    </div>
  );
}
