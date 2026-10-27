// The weekly production goal card and its edit pop-up (moved out of ProductionManagement.tsx unchanged).
import { useState, useMemo, useEffect } from 'react';
import type { InventoryContextType } from '../../App';
import { Target, Pencil, X, ChevronLeft, ChevronRight } from 'lucide-react';
import * as api from '../../utils/api';
import { toast } from 'sonner@2.0.3';
import { getTodayIST } from '../../utils/timezone';
import { MOMO_TYPES } from '../../constants/momoTypes';

type Props = {
  context: InventoryContextType;
  resolvedProductionHouseId: string | null;
  isClusterHead: boolean;
  isOperationsManager: boolean;
};

export function WeeklyGoalCard({ context, resolvedProductionHouseId, isClusterHead, isOperationsManager }: Props) {
  // ---- Weekly Production Goal - a per-momo-type piece target for any Monday-start week,
  // navigable independently of the Production Entry date selector above (a goal is usually
  // set ahead of time, for a week that hasn't started yet, or reviewed after it's over -
  // tying it to whatever single day is selected for entry made every other week
  // unreachable). Progress is computed live from real production: records (.final counts)
  // rather than a separately-tracked number. ----
  const [weeklyGoal, setWeeklyGoal] = useState<api.ProductionWeeklyGoal | null>(null);
  const [weeklyGoalLoading, setWeeklyGoalLoading] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Record<string, string>>({});
  const [goalSaving, setGoalSaving] = useState(false);

  const canSetWeeklyGoal = isClusterHead || isOperationsManager;

  const mondayOfWeek = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0=Sun .. 6=Sat
    const diffToMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diffToMonday);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const addDaysToDateStr = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayMonday = mondayOfWeek(getTodayIST());
  // Which week the goal card is showing/editing - starts on the current week, then moves
  // freely via the Prev/Next buttons. Deliberately not derived from `selectedDate`.
  const [goalWeekStart, setGoalWeekStart] = useState(todayMonday);
  const goalWeekEnd = useMemo(() => addDaysToDateStr(goalWeekStart, 6), [goalWeekStart]);
  const isGoalWeekCurrent = goalWeekStart === todayMonday;
  const isGoalWeekFuture = goalWeekStart > todayMonday;

  useEffect(() => {
    let cancelled = false;
    if (!resolvedProductionHouseId || !context.user?.accessToken) {
      setWeeklyGoal(null);
      return;
    }
    setWeeklyGoalLoading(true);
    api.getProductionWeeklyGoal(context.user.accessToken, resolvedProductionHouseId, goalWeekStart)
      .then((g) => { if (!cancelled) setWeeklyGoal(g); })
      .catch(() => { if (!cancelled) setWeeklyGoal(null); })
      .finally(() => { if (!cancelled) setWeeklyGoalLoading(false); });
    return () => { cancelled = true; };
  }, [resolvedProductionHouseId, goalWeekStart, context.user?.accessToken]);

  // Sum of each type's .final pieces across the viewed week - the whole week once it's
  // over, only through today while it's still in progress, and nothing yet for a week
  // that hasn't started. Matched defensively on either productionHouseId or the legacy
  // storeId field, since older records only ever populated one or the other (see
  // resolvedProductionHouseId's own comment above on this naming quirk).
  const weekProgress = useMemo(() => {
    const totals: Record<string, number> = {};
    MOMO_TYPES.forEach((t) => { totals[t.key] = 0; });
    if (!resolvedProductionHouseId || isGoalWeekFuture) return totals;
    const progressThroughDate = isGoalWeekCurrent ? getTodayIST() : goalWeekEnd;
    context.productionData
      .filter((p) =>
        (p.productionHouseId === resolvedProductionHouseId || p.storeId === resolvedProductionHouseId) &&
        p.date >= goalWeekStart && p.date <= progressThroughDate
      )
      .forEach((p) => {
        MOMO_TYPES.forEach((t) => {
          totals[t.key] += (p as any)[t.key]?.final || 0;
        });
      });
    return totals;
  }, [context.productionData, resolvedProductionHouseId, goalWeekStart, goalWeekEnd, isGoalWeekCurrent, isGoalWeekFuture]);

  const openEditGoal = () => {
    const draft: Record<string, string> = {};
    MOMO_TYPES.forEach((t) => { draft[t.key] = weeklyGoal?.goals?.[t.key] ? String(weeklyGoal.goals[t.key]) : ''; });
    setGoalDraft(draft);
    setShowEditGoal(true);
  };

  const handleSaveGoal = async () => {
    if (!resolvedProductionHouseId || !context.user?.accessToken) return;
    setGoalSaving(true);
    try {
      const goals: Record<string, number> = {};
      MOMO_TYPES.forEach((t) => {
        const n = parseInt(goalDraft[t.key] || '0', 10);
        if (n > 0) goals[t.key] = n;
      });
      const saved = await api.saveProductionWeeklyGoal(context.user.accessToken, resolvedProductionHouseId, goalWeekStart, goals);
      setWeeklyGoal(saved);
      setShowEditGoal(false);
      toast.success('Weekly goal saved');
    } catch (error) {
      console.error('Error saving weekly production goal:', error);
      toast.error('Failed to save weekly goal');
    } finally {
      setGoalSaving(false);
    }
  };

  return (
    <>
      {/* Weekly Production Goal - navigable Monday-start week, independent of the
          Production Entry date selector above. Progress is computed live from real
          production: records, not a separately tracked counter, so it can never drift
          out of sync with what was actually made. */}
      {resolvedProductionHouseId && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                  {isGoalWeekCurrent ? "This Week's Production Goal" : isGoalWeekFuture ? 'Upcoming Week\'s Goal' : "Past Week's Goal"}
                </h2>
                <p className="text-xs text-gray-500">
                  {new Date(goalWeekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {' – '}
                  {new Date(goalWeekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {isGoalWeekFuture ? ' · hasn\'t started yet' : isGoalWeekCurrent ? ` · progress through ${new Date(getTodayIST() + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ' · week complete'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setGoalWeekStart((w) => addDaysToDateStr(w, -7))}
                  className="p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {!isGoalWeekCurrent && (
                  <button
                    onClick={() => setGoalWeekStart(todayMonday)}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 border-x border-gray-300 transition-colors"
                  >
                    This week
                  </button>
                )}
                <button
                  onClick={() => setGoalWeekStart((w) => addDaysToDateStr(w, 7))}
                  className="p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                  aria-label="Next week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {canSetWeeklyGoal && (
                <button
                  onClick={openEditGoal}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {weeklyGoal ? 'Edit Goal' : 'Set Goal'}
                </button>
              )}
            </div>
          </div>

          {weeklyGoalLoading ? (
            <div className="text-center py-6 text-gray-500 text-sm">Loading this week's goal…</div>
          ) : !weeklyGoal || Object.keys(weeklyGoal.goals || {}).length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No goal set for this week yet.
              {!canSetWeeklyGoal && ' Ask your cluster head or operations manager to set one.'}
            </div>
          ) : (
            <div className="space-y-3">
              {MOMO_TYPES.filter((t) => (weeklyGoal.goals?.[t.key] || 0) > 0).map((t) => {
                const goal = weeklyGoal.goals?.[t.key] || 0;
                const achieved = weekProgress[t.key] || 0;
                const pct = goal > 0 ? Math.round((achieved / goal) * 100) : 0;
                const barPct = Math.min(pct, 100);
                const met = pct >= 100;
                return (
                  <div key={t.key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        {t.label}
                      </span>
                      <span className="tabular-nums text-gray-600">
                        {achieved.toLocaleString()} / {goal.toLocaleString()}
                        <span className={`ml-1.5 font-semibold ${met ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {pct}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${met ? 'bg-emerald-500' : 'bg-orange-500'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Weekly Goal Modal */}
      {showEditGoal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full my-8">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                Weekly Goal &middot; {new Date(goalWeekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(goalWeekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </h3>
              <button onClick={() => setShowEditGoal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {MOMO_TYPES.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-3">
                  <label htmlFor={`goal-${t.key}`} className="text-sm text-gray-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </label>
                  <input
                    id={`goal-${t.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={goalDraft[t.key] || ''}
                    onChange={(e) => setGoalDraft((prev) => ({ ...prev, [t.key]: e.target.value }))}
                    className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => setShowEditGoal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGoal}
                disabled={goalSaving}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all text-sm font-semibold disabled:opacity-50"
              >
                {goalSaving ? 'Saving…' : 'Save Goal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
