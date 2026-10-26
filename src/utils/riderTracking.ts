// Shares the rider's live position with the server while a ride is active.
//
// On the Android app this uses a foreground service (with its persistent "sharing your
// location" notification) so updates keep flowing with the screen off or the app in the
// background. Android throttles ordinary WebView network calls after a few minutes in the
// background, so on native the position is posted with CapacitorHttp (native networking).
// In a browser it falls back to the normal geolocation API.
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { API_BASE } from './api';
import { getSupabaseClient } from './supabase/client';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export type TrackingState = 'starting' | 'active' | 'denied' | 'error' | 'stopped';

type Fix = { latitude: number; longitude: number; accuracy?: number | null; speed?: number | null; bearing?: number | null };

const MIN_SEND_GAP_MS = 8000;      // never post more often than this
const HEARTBEAT_MS = 30000;        // re-send the last fix this often so "last seen" stays fresh when parked

async function accessToken(forceRefresh = false): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token || null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// Resolves to the HTTP status of the post.
async function postFix(tripId: string, fix: Fix, token: string): Promise<number> {
  const url = `${API_BASE}/rider/trips/${tripId}/location`;
  const body = {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy ?? null,
    speed: fix.speed ?? null,
    bearing: fix.bearing ?? null,
  };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.post({ url, headers, data: body });
    return res.status;
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.status;
}

export function startRiderTracking(tripId: string, onState: (state: TrackingState) => void): () => void {
  let stopped = false;
  let lastFix: Fix | null = null;
  let lastSentAt = 0;
  let sending = false;
  let watcherId: string | null = null;
  let webWatchId: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (heartbeat) clearInterval(heartbeat);
    if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
    if (webWatchId !== null) navigator.geolocation.clearWatch(webWatchId);
  };

  const send = async () => {
    if (stopped || sending || !lastFix) return;
    sending = true;
    try {
      let token = await accessToken();
      if (!token) { onState('error'); return; }
      let status = await postFix(tripId, lastFix, token);
      if (status === 401) {
        token = await accessToken(true);
        if (token) status = await postFix(tripId, lastFix, token);
      }
      if (status === 409) { stop(); onState('stopped'); return; }   // ride finished or cancelled
      if (status >= 200 && status < 300) { lastSentAt = Date.now(); onState('active'); }
      else onState('error');
    } catch {
      onState('error');
    } finally {
      sending = false;
    }
  };

  const handleFix = (fix: Fix) => {
    lastFix = fix;
    if (Date.now() - lastSentAt >= MIN_SEND_GAP_MS) send();
  };

  onState('starting');
  heartbeat = setInterval(() => { if (Date.now() - lastSentAt >= HEARTBEAT_MS) send(); }, 5000);

  if (Capacitor.isNativePlatform()) {
    BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Delivery in progress',
        backgroundMessage: 'Sharing your live location with the production house and store.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,
      },
      (location, error) => {
        if (stopped) return;
        if (error) { onState(error.code === 'NOT_AUTHORIZED' ? 'denied' : 'error'); return; }
        if (location) {
          handleFix({ latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy, speed: location.speed, bearing: location.bearing });
        }
      }
    ).then((id) => {
      if (stopped) BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
      else watcherId = id;
    }).catch(() => onState('error'));
  } else if ('geolocation' in navigator) {
    webWatchId = navigator.geolocation.watchPosition(
      (pos) => handleFix({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed, bearing: pos.coords.heading }),
      (err) => onState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  } else {
    onState('error');
  }

  return stop;
}

// Opens the phone's location settings for this app (used when permission was denied).
export function openRiderLocationSettings() {
  if (Capacitor.isNativePlatform()) BackgroundGeolocation.openSettings().catch(() => {});
}
