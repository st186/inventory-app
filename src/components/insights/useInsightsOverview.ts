import { useCallback, useEffect, useState } from 'react';
import type * as api from '../../utils/api';
import { useHomeData } from '../home/homeData';

// History, 7-day forecast, yesterday vs expected and past festival effects for one store
// (null = all stores), from the server's insights overview.
export function useInsightsOverview(accessToken: string | undefined, storeId: string | null) {
  const { getInsightsOverview } = useHomeData();
  const [data, setData] = useState<api.InsightsOverview | null>(null);
  // Loading from the first frame when there is something to load (no empty state flashing first).
  const [loading, setLoading] = useState(!!accessToken);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getInsightsOverview(accessToken, storeId));
    } catch (err: any) {
      setError(err?.message || 'Could not load the forecast');
    } finally {
      setLoading(false);
    }
  }, [accessToken, storeId, getInsightsOverview]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

export const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
