// App-wide live location sharing for riders. It runs from App.tsx rather than the Riders
// screen, so GPS keeps flowing when the rider opens another screen mid-delivery - it used to
// stop the moment they left Riders. The sharing itself is riderTracking.ts, unchanged; this
// only decides when it runs: while the rider's current ride is on the way, at pickup, or
// picked up.
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as api from './api';
import type { RiderTripStatus } from './api';
import { startRiderTracking, type TrackingState } from './riderTracking';

// Keep in step with RiderTrips.tsx's TRACKED_STATUSES.
const TRACKED_STATUSES: RiderTripStatus[] = ['on_the_way', 'arrived', 'picked_up'];
const POLL_MS = 15000;

// Current sharing state, read by the Riders screen for its "Sharing your live location" note.
let trackingState: TrackingState | null = null;
const listeners = new Set<() => void>();
let checkNow: (() => void) | null = null;

function setTrackingState(state: TrackingState | null) {
  if (state === trackingState) return;
  trackingState = state;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useRiderTrackingState(): TrackingState | null {
  return useSyncExternalStore(subscribe, () => trackingState);
}

// Re-check the rider's rides now instead of at the next poll - the Riders screen calls this
// when it sees a ride change stage, so sharing starts or stops straight away.
export function refreshRiderLocationSharing() {
  checkNow?.();
}

// Mount once, in App.tsx, with enabled = the signed-in user is a rider.
export function useRiderLocationSharing(enabled: boolean) {
  const [tripId, setTripId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setTripId(null); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const { trips } = await api.getRiderTrips();
        // Same ride the Riders screen shows as current: the first one not delivered or cancelled.
        const current = trips.find((t) => t.status !== 'delivered' && t.status !== 'cancelled');
        if (!cancelled) setTripId(current && TRACKED_STATUSES.includes(current.status) ? current.id : null);
      } catch {
        // Offline or a hiccup: keep sharing as it is, the next poll tries again.
      }
    };
    check();
    checkNow = check;
    const interval = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (checkNow === check) checkNow = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!tripId) { setTrackingState(null); return; }
    const stop = startRiderTracking(tripId, (state) => {
      setTrackingState(state);
      // The server said the ride is over (delivered or cancelled) - look for the next one.
      if (state === 'stopped') checkNow?.();
    });
    return () => stop();
  }, [tripId]);
}
