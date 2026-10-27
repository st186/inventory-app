// The events the signed-in person works at right now (assigned, from the day before the first day
// to the day after the last), for the Home card and the shell's "Event" destination. Plain staff
// who aren't assigned get an empty list. One shared request per minute across components.
import * as React from 'react';
import type { MyEvent } from '../../utils/eventsApi';
import { useEventsApi } from './eventsShared';

const TTL_MS = 60_000;
let cache: { at: number; events: MyEvent[] } | null = null;
let inFlight: Promise<MyEvent[]> | null = null;

export function useActiveEventsForUser(opts: { enabled?: boolean } = {}) {
  const api = useEventsApi();
  const enabled = opts.enabled !== false;
  const [state, setState] = React.useState<{ events: MyEvent[]; loading: boolean; error: string | null }>(() => ({
    events: cache?.events || [], loading: enabled && !cache, error: null,
  }));

  const load = React.useCallback(async (force = false) => {
    if (!enabled) return;
    if (!force && cache && Date.now() - cache.at < TTL_MS) {
      setState({ events: cache.events, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      inFlight ||= api.mine().then((r) => r.events || []).finally(() => { inFlight = null; });
      const events = await inFlight;
      cache = { at: Date.now(), events };
      setState({ events, loading: false, error: null });
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Could not load events' }));
    }
  }, [api, enabled]);

  React.useEffect(() => { void load(); }, [load]);

  return { ...state, refresh: () => load(true), hasEvents: state.events.length > 0 };
}

// After a save elsewhere (day close, expense) the next read fetches fresh figures.
export function invalidateActiveEvents() {
  cache = null;
}
