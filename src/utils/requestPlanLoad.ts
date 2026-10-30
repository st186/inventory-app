// Loads what requestPlan.ts needs for each store: the insights overview (momos sold a day, the
// forecast), its stock requests of the last days, store wastage and its last stock count. The
// store's Bunny fill, the production plan and the week plan all start here.
import * as api from './api';
import { FORECAST_TYPES } from './forecast';
import { addDays, getTodayIST } from './timezone';
import { LOOKBACK_DAYS, planBags, planInput, sumPlans, type PlanDay } from './requestPlan';
import { countHistory } from '../components/stock/countData';
import { SALES_CUTOFF, countTime, lastCount } from '../components/stock/countMath';

export const PLAN_KEYS = FORECAST_TYPES.map((t) => t.key as string);

export interface StorePlanData {
  storeId: string;
  overview: api.InsightsOverview;
  requests: api.ProductionRequest[];
  wastage: api.StockWastageEntry[];
  counted: { date: string; pieces: Record<string, number> } | null;
}

export async function loadStorePlanData(
  token: string,
  storeIds: string[],
  opts: { getOverview?: typeof api.getInsightsOverview; items?: { id: string; name: string }[] } = {},
): Promise<StorePlanData[]> {
  const today = getTodayIST();
  const from = addDays(today, -(LOOKBACK_DAYS + 2));
  const getOverview = opts.getOverview || api.getInsightsOverview;
  const requests = await api.fetchProductionRequests(token, from).catch(() => [] as api.ProductionRequest[]);
  return Promise.all(storeIds.map(async (storeId) => {
    const [overview, wastage, counted] = await Promise.all([
      getOverview(token, storeId),
      api.getStockWastageRange(token, storeId, from, today).catch(() => [] as api.StockWastageEntry[]),
      // Count lines name items by id, so without the item list a count can't be read: left out.
      !opts.items?.length ? null : countHistory(token, [storeId], 'store').then((history) => {
        const base = lastCount(history, opts.items || []);
        if (!base) return null;
        // Counted before the store opened: that is what the day started with, i.e. the day before's close.
        const at = countTime(base.date);
        const date = at.slice(11, 16) < SALES_CUTOFF ? addDays(at.slice(0, 10), -1) : at.slice(0, 10);
        return date >= from ? { date, pieces: base.stock as Record<string, number> } : null;
      }).catch(() => null),
    ]);
    return { storeId, overview, requests: requests.filter((r) => r.storeId === storeId), wastage, counted };
  }));
}

/** Bags for one store over the plan days. `useAsked`: days it has already asked for keep its request. */
export function planForStore(d: StorePlanData, firstPlanDay: string, lastPlanDay: string, useAsked = true): PlanDay[] {
  return planBags(planInput({
    history: d.overview.history, forecast: d.overview.forecast, requests: d.requests, wastage: d.wastage, counted: d.counted,
  }, PLAN_KEYS, firstPlanDay, lastPlanDay, useAsked));
}

/** What a production house should make for its stores for each day (pieces per type), stores added up. */
export function housePlan(stores: StorePlanData[], firstPlanDay: string, lastPlanDay: string) {
  return sumPlans(stores.map((s) => planForStore(s, firstPlanDay, lastPlanDay)));
}
