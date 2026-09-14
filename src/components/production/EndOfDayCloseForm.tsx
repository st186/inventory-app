import { useState, useEffect } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { ALL_POOL_IDS, getPoolLabel } from '../../constants/momoTypes';
import type { ProductionLedgerPoolState } from '../../utils/api';

type Props = {
  pools: Record<string, ProductionLedgerPoolState>;
  // True only when this production house has never closed a ledger day before - the one
  // and only time a manual "what's physically on the shelf right now" opening override is
  // allowed, same escape hatch Production Cash uses for its own first day.
  isFirstEverDay: boolean;
  closed?: boolean;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (closingActuals: Record<string, number>, manualOpeningOverride?: Record<string, number>, wastageOverrides?: Record<string, number>) => void | Promise<void>;
};

// The directly-reported leftover snapshot per pool - counted/weighed at day's end, not
// computed from a yield formula (confirmed requirement).
export function EndOfDayCloseForm({ pools, isFirstEverDay, closed, disabled, submitting, onSubmit }: Props) {
  const [closingInputs, setClosingInputs] = useState<Record<string, string>>({});
  const [openingOverrideInputs, setOpeningOverrideInputs] = useState<Record<string, string>>({});
  // Wastage is never assumed - the starting-stock-minus-closing gap is only ever offered as
  // a one-click suggestion, never silently applied. Explicit per-pool state so "no value
  // entered yet" and "user confirmed 0" stay distinguishable.
  const [wastageInputs, setWastageInputs] = useState<Record<string, string>>({});

  // Only pools that actually have something to account for - either carried over from
  // yesterday or prepared today. A pool nobody touched (e.g. Paneer Stuffing on a day with
  // no paneer batches logged) is real clutter here, not useful information - confirmed
  // real complaint: the full always-9-or-16-row list buried the 2-3 rows that mattered.
  const relevantPoolIds = ALL_POOL_IDS.filter((id) => {
    const p = pools[id];
    return !!p && (p.opening > 0.005 || p.prepared > 0.005 || typeof p.closingActual === 'number');
  });

  // Re-seed from saved values whenever the underlying pools change (e.g. switching date,
  // or a fresh close having just been saved) - matches every other date-scoped form in
  // this app re-syncing local state off its loaded record.
  useEffect(() => {
    const seededClosing: Record<string, string> = {};
    const seededWastage: Record<string, string> = {};
    for (const id of ALL_POOL_IDS) {
      const pool = pools[id];
      seededClosing[id] = typeof pool?.closingActual === 'number' ? String(pool.closingActual) : '';
      seededWastage[id] = typeof pool?.wastage === 'number' ? String(pool.wastage) : '';
    }
    setClosingInputs(seededClosing);
    setWastageInputs(seededWastage);
  }, [pools]);

  const handleSubmit = () => {
    const closingActuals: Record<string, number> = {};
    for (const id of ALL_POOL_IDS) {
      const raw = closingInputs[id];
      if (raw !== undefined && raw !== '') closingActuals[id] = parseFloat(raw) || 0;
    }
    let manualOpeningOverride: Record<string, number> | undefined;
    if (isFirstEverDay) {
      manualOpeningOverride = {};
      for (const id of ALL_POOL_IDS) {
        const raw = openingOverrideInputs[id];
        if (raw !== undefined && raw !== '') manualOpeningOverride[id] = parseFloat(raw) || 0;
      }
    }
    const wastageOverrides: Record<string, number> = {};
    for (const id of ALL_POOL_IDS) {
      const raw = wastageInputs[id];
      if (raw !== undefined && raw !== '') wastageOverrides[id] = parseFloat(raw) || 0;
    }
    onSubmit(closingActuals, manualOpeningOverride, wastageOverrides);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
        {closed && <Lock className="w-5 h-5 text-gray-400" />}
        Leftover Snapshot (End of Day)
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Count/weigh what's actually left of each pool right now - this becomes tomorrow's opening balance.
      </p>

      {isFirstEverDay && !closed && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>No carry-forward history yet for this production house - if any of the pools below already had stock before today's tracking started, enter it under "Pre-existing" (one-time only, on the very first day).</span>
        </div>
      )}

      {relevantPoolIds.length === 0 ? (
        <div className="text-center text-gray-500 py-8 text-sm">Nothing prepared or carried over yet today - log a batch above first.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2 font-medium">Pool</th>
                {isFirstEverDay && !closed && <th className="py-2 px-2 font-medium">Pre-existing (kg)</th>}
                <th className="py-2 px-2 font-medium">Prepared (kg)</th>
                <th className="py-2 px-2 font-medium">Starting Stock (kg)</th>
                <th className="py-2 px-2 font-medium">Closing Count (kg)</th>
                <th className="py-2 pl-2 font-medium">Wastage (kg)</th>
              </tr>
            </thead>
            <tbody>
              {relevantPoolIds.map((id) => {
                const pool = pools[id] || { opening: 0, prepared: 0, closingActual: null, wastage: null };
                const closingRaw = closingInputs[id] ?? '';
                const closingValue = parseFloat(closingRaw);
                const effectiveOpening = isFirstEverDay && !closed
                  ? (parseFloat(openingOverrideInputs[id] ?? '') || 0)
                  : pool.opening;
                // Starting Stock is always computed - opening (whatever it is) plus today's
                // prepared - never a field to type into. On day 1, "opening" here already
                // reflects the Pre-existing input as it's typed, so this updates live too.
                const startingStock = effectiveOpening + pool.prepared;
                const suggestedWastage = closingRaw !== '' && !isNaN(closingValue)
                  ? startingStock - closingValue
                  : null;
                const wastageRaw = wastageInputs[id] ?? '';
                return (
                  <tr key={id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-2 text-gray-700">{getPoolLabel(id)}</td>
                    {isFirstEverDay && !closed && (
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          value={openingOverrideInputs[id] ?? ''}
                          onChange={(e) => setOpeningOverrideInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                          disabled={disabled}
                          placeholder="0.00"
                          className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg disabled:bg-gray-100"
                        />
                      </td>
                    )}
                    <td className="py-2 px-2 tabular-nums text-gray-900">{pool.prepared.toFixed(2)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-900 font-semibold">{startingStock.toFixed(2)}</td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        step="0.01"
                        value={closingRaw}
                        onChange={(e) => setClosingInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                        disabled={disabled || closed}
                        placeholder="0.00"
                        className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg disabled:bg-gray-100"
                      />
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={wastageRaw}
                          onChange={(e) => setWastageInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                          disabled={disabled || closed}
                          placeholder="Not entered"
                          className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg disabled:bg-gray-100"
                        />
                        {suggestedWastage !== null && wastageRaw === '' && !closed && (
                          <button
                            type="button"
                            onClick={() => setWastageInputs((prev) => ({ ...prev, [id]: suggestedWastage.toFixed(2) }))}
                            disabled={disabled}
                            className="text-[11px] text-orange-600 hover:text-orange-700 underline whitespace-nowrap"
                            title="Starting Stock minus Closing Count - not assumed, just a starting point"
                          >
                            use {suggestedWastage.toFixed(2)}?
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!closed && relevantPoolIds.length > 0 && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || submitting}
          className="mt-4 px-6 py-3 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-lg hover:from-teal-600 hover:to-teal-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm"
        >
          {submitting ? 'Closing Day…' : 'Close Production Day'}
        </button>
      )}
      {closed && (
        <div className="mt-4 px-4 py-3 bg-green-50 border border-green-300 text-green-700 rounded-xl text-sm">
          ✓ Day closed - these leftover counts are now tomorrow's opening balance.
        </div>
      )}
    </div>
  );
}
