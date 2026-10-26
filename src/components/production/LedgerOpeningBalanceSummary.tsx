import { GLOBAL_POOLS, MOMO_TYPES, getPerTypePoolId } from '../../constants/momoTypes';
import type { ProductionLedgerPoolState } from '../../utils/api';

type Props = {
  pools: Record<string, ProductionLedgerPoolState>;
};

// Read-only summary of today's opening balance per pool - always the prior day's
// directly-reported closing count (or that day's own opening+prepared if it was never
// closed), never a formula anyone can second-guess. Sits at the top of the entry tab so a
// production incharge sees what they're starting with before logging anything new.
export function LedgerOpeningBalanceSummary({ pools }: Props) {
  const pool = (id: string) => pools[id] || { opening: 0, prepared: 0, closingActual: null, wastage: null };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-1">Opening Balance</h2>
      <p className="text-sm text-gray-500 mb-4">What's left over from yesterday, before anything new is prepared today</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {GLOBAL_POOLS.map((id) => (
          <div key={id} className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
            <div className="text-xs uppercase tracking-wide text-orange-700 mb-1">{id === 'dough' ? 'Dough' : 'Batter'} (shared)</div>
            <div className="text-xl font-semibold text-gray-900">{pool(id).opening.toFixed(2)} kg</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {MOMO_TYPES.map((t) => {
          const poolId = getPerTypePoolId(t);
          const fieldLabel = t.perTypePoolField === 'stuffing' ? 'Stuffing' : 'Coating';
          return (
            <div key={poolId} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <div className="text-[11px] text-gray-500 mb-0.5">{t.label} {fieldLabel}</div>
              <div className="text-base font-semibold text-gray-900">{pool(poolId).opening.toFixed(2)} kg</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
