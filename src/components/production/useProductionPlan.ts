// The planned pieces for a production day: the bags the stores this house supplies will need the
// next day (each day's bags are made the day before). Since bags became 50 of every type (owner,
// 30 Oct 2026) this follows each store's freezer, not "tomorrow's sales + 15% rounded up to a bag":
// a type that sells 15 a day gets a bag every few days, not 50 every day (utils/requestPlan.ts).
// Once the store has sent its request for that day, the plan is what it asked for. The forecast
// covers today and the next 6 days, so days outside that have no plan.
import { useEffect, useMemo, useState } from 'react';
import type { MomoKey } from '../../utils/forecast';
import { addDays } from '../../utils/timezone';
import { housePlan, loadStorePlanData, type StorePlanData } from '../../utils/requestPlanLoad';

export function useProductionPlan(accessToken: string | undefined, storeIds: string[], productionDate: string, items?: { id: string; name: string }[]) {
  const [stores, setStores] = useState<StorePlanData[] | null>(null);
  const key = storeIds.join(',');

  useEffect(() => {
    if (!accessToken || !storeIds.length) {
      setStores(null);
      return;
    }
    let cancelled = false;
    loadStorePlanData(accessToken, storeIds, { items })
      .then((list) => { if (!cancelled) setStores(list); })
      .catch(() => { if (!cancelled) setStores(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, key, !!items?.length]);

  return useMemo(() => {
    const target = addDays(productionDate, 1);
    if (!stores?.length || !stores.every((s) => s.overview.forecast.some((f) => f.date === target))) return null;
    const [day] = housePlan(stores, target, target);
    return (day?.need || null) as Record<MomoKey, number> | null;
  }, [stores, productionDate]);
}
