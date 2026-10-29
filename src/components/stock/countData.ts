// Loading what countMath.ts works from: a place's stock counts and a store's logged wastage.
import * as api from '../../utils/api';
import { getTodayIST } from '../../utils/timezone';
import type { Baseline, CountRecord } from './countMath';

/** Every count for a place. A production house's counts are also under the store ids it went by. */
export async function countHistory(token: string, locationIds: (string | null | undefined)[], type: 'store' | 'production_house'): Promise<CountRecord[]> {
  const byId = new Map<string, CountRecord>();
  for (const id of new Set(locationIds.filter(Boolean) as string[])) {
    const res = await api.getRecalibrationHistory(token, id, type);
    for (const r of res?.history || []) byId.set(r.id || `${r.locationId}:${r.date}`, r);
  }
  return [...byId.values()];
}

/** Wastage the store logged from the count's day on (all of it with no count). */
export function storeWastageSince(token: string, storeId: string, base: Baseline) {
  return api.getStockWastageRange(token, storeId, base ? base.date.slice(0, 10) : '2000-01-01', getTodayIST());
}
