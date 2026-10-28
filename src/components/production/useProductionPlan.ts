// The planned pieces for a production day: what the stores this house supplies are expected to
// need the next day (their sales forecast + 15%, rounded up to whole bags) - the same rule and
// the same forecast call as "This week's plan" (insights/ProductionPlanCards.tsx, now on Home):
// each day's bags are made the day before. The forecast covers today and the next 6 days, so
// days outside that have no plan.
import { useEffect, useMemo, useState } from 'react';
import * as api from '../../utils/api';
import { FORECAST_TYPES, roundUpToBag, type ForecastDay, type MomoKey } from '../../utils/forecast';
import { addDays } from '../../utils/timezone';

const BUFFER = 0.15;

export function useProductionPlan(accessToken: string | undefined, storeIds: string[], productionDate: string) {
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const key = storeIds.join(',');

  useEffect(() => {
    if (!accessToken || !storeIds.length) {
      setDays(null);
      return;
    }
    let cancelled = false;
    Promise.all(storeIds.map((id) => api.getInsightsOverview(accessToken, id)))
      .then((list) => {
        if (cancelled) return;
        // Sum the stores day by day.
        const base = list[0].forecast.map((f) => ({ ...f, pieces: { ...f.pieces } }));
        for (const ov of list.slice(1)) ov.forecast.forEach((f, i) => {
          if (!base[i]) return;
          for (const t of FORECAST_TYPES) base[i].pieces[t.key] += f.pieces[t.key];
        });
        setDays(base);
      })
      .catch(() => { if (!cancelled) setDays(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, key]);

  return useMemo(() => {
    const target = days?.find((d) => d.date === addDays(productionDate, 1));
    if (!target) return null;
    const need = {} as Record<MomoKey, number>;
    for (const t of FORECAST_TYPES) need[t.key] = roundUpToBag(Math.round(target.pieces[t.key] * (1 + BUFFER)), t.bag);
    return need;
  }, [days, productionDate]);
}
