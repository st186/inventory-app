// The weekly production goal (a piece target per momo type for a Monday-start week, set by the
// cluster head or an operations manager) with progress from real production, and its edit sheet.
import { useState, useMemo, useEffect } from 'react';
import type { InventoryContextType } from '../../App';
import { Target, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { Progress } from '../ui/progress';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonText } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import { CollapsibleCard, dayLabel, formatCount, momoName } from '../stock/stockShared';
import * as api from '../../utils/api';
import { toast } from '../ui/sonner';
import { getTodayIST } from '../../utils/timezone';
import { MOMO_TYPES } from '../../constants/momoTypes';

type Props = {
  context: InventoryContextType;
  resolvedProductionHouseId: string | null;
  isClusterHead: boolean;
  isOperationsManager: boolean;
};

export function WeeklyGoalCard({ context, resolvedProductionHouseId, isClusterHead, isOperationsManager }: Props) {
  const { t, lang } = useT();
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
      toast.error("Couldn't save the weekly goal");
    } finally {
      setGoalSaving(false);
    }
  };

  if (!resolvedProductionHouseId) return null;
  const range = `${dayLabel(lang, goalWeekStart)} – ${dayLabel(lang, goalWeekEnd)}`;
  const title = isGoalWeekCurrent ? t('stock.prod.goal') : isGoalWeekFuture ? 'Next week’s goal' : 'Past week’s goal';
  const goalTypes = MOMO_TYPES.filter((m) => (weeklyGoal?.goals?.[m.key] || 0) > 0);

  return (
    <CollapsibleCard
      icon={<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-2 [&_svg]:size-5" aria-hidden="true"><Target /></span>}
      title={title}
      subtitle={range}
    >
      <div className="flex flex-col gap-3 p-4" lang={lang}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center">
            <IconButton label="Previous week" icon={<ChevronLeft />} onClick={() => setGoalWeekStart((w) => addDaysToDateStr(w, -7))} />
            {!isGoalWeekCurrent && <Button variant="ghost" size="sm" onClick={() => setGoalWeekStart(todayMonday)}>{t('date.thisWeek')}</Button>}
            <IconButton label="Next week" icon={<ChevronRight />} onClick={() => setGoalWeekStart((w) => addDaysToDateStr(w, 7))} />
          </div>
          {canSetWeeklyGoal && (
            <Button variant="secondary" size="sm" leadingIcon={<Pencil />} onClick={openEditGoal}>{weeklyGoal ? 'Edit goal' : 'Set goal'}</Button>
          )}
        </div>
        {weeklyGoalLoading ? (
          <SkeletonText lines={3} />
        ) : goalTypes.length === 0 ? (
          <EmptyState compact icon={Target} title="No goal for this week" body={canSetWeeklyGoal ? undefined : 'The cluster head or an operations manager sets it.'} />
        ) : (
          goalTypes.map((m) => {
            const goal = weeklyGoal?.goals?.[m.key] || 0;
            const achieved = weekProgress[m.key] || 0;
            const pct = goal > 0 ? Math.round((achieved / goal) * 100) : 0;
            return (
              <div key={m.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-body-sm">
                  <span className="font-medium text-text">{momoName(lang, m.inventoryKey, m.label)}</span>
                  <span className="num text-text-2">{formatCount(achieved)} / {formatCount(goal)} · <span className={pct >= 100 ? 'font-semibold text-success' : 'font-semibold text-text'}>{pct}%</span></span>
                </div>
                <Progress value={Math.min(pct, 100)} tone={pct >= 100 ? 'success' : 'primary'} aria-label={`${momoName(lang, m.inventoryKey, m.label)} ${pct}%`} />
              </div>
            );
          })
        )}
      </div>

      <ResponsiveModal
        open={showEditGoal}
        onOpenChange={setShowEditGoal}
        title="Weekly goal"
        description={range}
        footer={<Button size="lg" className="flex-1" loading={goalSaving} onClick={handleSaveGoal}>Save goal</Button>}
      >
        <div className="flex flex-col gap-3">
          {MOMO_TYPES.map((m) => (
            <Field key={m.key} label={momoName(lang, m.inventoryKey, m.label)}>
              <Input type="text" inputMode="numeric" className="num" placeholder="0" value={goalDraft[m.key] || ''} onChange={(e) => setGoalDraft((prev) => ({ ...prev, [m.key]: e.target.value.replace(/[^\d]/g, '') }))} />
            </Field>
          ))}
        </div>
      </ResponsiveModal>
    </CollapsibleCard>
  );
}
