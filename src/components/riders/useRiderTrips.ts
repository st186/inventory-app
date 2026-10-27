// Today's rides (plus anything still active) for the rider or staff screens, kept fresh on a short
// timer so a status change (rider arrived, production marked ready) shows up without a manual
// refresh. The timer skips its work while the app is in the background (a pocketed phone polled
// every 10 seconds) and refreshes as soon as it comes back. Rider only: the ride-request horn
// check every 1.5 s, and the app-wide live-location sharing nudged when a ride changes stage.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../ui/sonner';
import type { RiderTrip } from '../../utils/api';
import { isAppVisible, onAppVisibilityChange } from '../../utils/appVisibility';
import { useT } from '../../utils/i18n';
import { useRiderApi } from './riderApi';
import { isActive, isTracked } from './tripUtils';

export function useRiderTrips(mode: 'rider' | 'staff') {
  const rapi = useRiderApi();
  const { t } = useT();
  const [trips, setTrips] = useState<RiderTrip[]>([]);
  const [maxTrips, setMaxTrips] = useState(4);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await rapi.getRiderTrips();
      setTrips(data.trips);
      setMaxTrips(data.maxTripsPerDay);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('rider.loadFailed'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [rapi, t]);

  useEffect(() => {
    load();
    const interval = setInterval(() => { if (isAppVisible()) load(true); }, mode === 'rider' ? 10000 : 15000);
    const offVisible = onAppVisibilityChange((visible) => { if (visible) load(true); });
    return () => { clearInterval(interval); offVisible(); };
  }, [load, mode]);

  // Runs one ride action, swaps the updated ride into the list and says so; on failure it says why
  // and reloads.
  const run = useCallback(async (id: string, action: () => Promise<RiderTrip>, success: string) => {
    setBusyId(id);
    try {
      const updated = await action();
      setTrips((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('rider.somethingWrong'));
      load(true);
      return false;
    } finally {
      setBusyId(null);
    }
  }, [load, t]);

  const active = useMemo(() => trips.filter(isActive), [trips]);
  const done = useMemo(() => trips.filter((x) => !isActive(x)), [trips]);
  const todaysCount = trips.filter((x) => x.status !== 'cancelled' && x.tripNumber).length;

  return { trips, setTrips, maxTrips, loading, loadError, busyId, load, run, active, done, todaysCount };
}

export type RiderTripsState = ReturnType<typeof useRiderTrips>;

// Rider only: the horn keeps sounding until the rider answers it (Silence, or by starting the
// ride) - merely opening the app must not silence it, because the full-screen alert opens the app
// by itself on an idle phone. It also stops once there is no waiting ride request any more
// (cancelled, or already accepted from another screen).
export function useRideAlert(enabled: boolean, trips: RiderTrip[], loading: boolean) {
  const rapi = useRiderApi();
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (!enabled || !rapi.alertSupported()) return;
    let cancelled = false;
    const check = async () => { const r = await rapi.isAlertRinging(); if (!cancelled) setRinging(r); };
    check();
    const interval = setInterval(() => { if (isAppVisible()) check(); }, 1500);
    const offVisible = onAppVisibilityChange((visible) => { if (visible) check(); });
    return () => { cancelled = true; clearInterval(interval); offVisible(); };
  }, [enabled, rapi]);
  const hasWaitingRequest = trips.some((x) => x.status === 'called');
  useEffect(() => {
    if (enabled && !loading && !hasWaitingRequest) rapi.stopAlert();
  }, [enabled, loading, hasWaitingRequest, rapi]);
  const silence = useCallback(async () => { await rapi.stopAlert(); setRinging(false); }, [rapi]);
  return { ringing, silence };
}

// Rider only: the phone's position is shared while the current ride is in a tracked stage. The
// sharing runs app-wide (utils/riderLocationSharing.ts, mounted in App.tsx) so it keeps going when
// the rider leaves this screen mid-delivery; this shows its state and nudges it when a ride
// changes stage here, so it doesn't wait for its own poll.
export function useRideTracking(enabled: boolean, current: RiderTrip | undefined, reload: (silent?: boolean) => void) {
  const rapi = useRiderApi();
  const tripId = enabled ? current?.id || null : null;
  const shouldTrack = enabled && !!current && isTracked(current);
  const state = rapi.useTrackingState();
  useEffect(() => {
    if (enabled) rapi.refreshLocationSharing();
  }, [enabled, tripId, shouldTrack, rapi]);
  useEffect(() => {
    if (enabled && state === 'stopped') reload(true); // the ride ended on the server
  }, [enabled, state, reload]);
  return { state, shouldTrack };
}
