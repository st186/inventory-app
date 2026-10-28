// Automatic check-in on the Android app (owner, 27 Oct 2026).
//
// Watches the phone's location ONLY inside the shift window (an hour before the shift starts to
// an hour after it ends, on working days) and works out on the phone whether the person is
// inside the workplace zone. Only two moments ever leave the phone: when they arrived and when
// they left (time and spot). The trail of positions is never sent or stored.
//
// Arrival -> saved on the phone, sent to the server as a suggestion (which also sends a
// notification), and offered in the app: "You reached the store at 2:52 PM - check in?". The
// arrival time is what counts once confirmed. Leaving after the shift ends is offered straight
// away; leaving earlier only once they have been gone 30 minutes (so a tea break isn't a
// check-out). It runs as one tracker for the whole app so it keeps going when the person moves
// to another screen, and stops itself when the window closes.
//
// Limits: the phone must be on with location on; the app must have been opened (or left in the
// background) on that day - a swiped-away app can't watch; some brands' battery savers stop it.
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { BackgroundGeolocation } from '../../utils/riderTracking';
import * as kpi from './kpiApi';

const GPS_TOLERANCE_M = 50; // same as the server: forgive up to 50 m of reported GPS error
const LEAVE_MARGIN_M = 50; // must be this much further out to count as gone (stops flicker at the edge)
const EARLY_EXIT_AFTER_MS = 30 * 60000; // left before the shift end: count it after 30 min away
const MAX_ACCURACY_M = 150; // fixes vaguer than this can't tell inside from outside

export type TrackerStatus = 'web' | 'off' | 'needs-consent' | 'waiting' | 'watching' | 'denied' | 'error';
type Snapshot = { status: TrackerStatus; inside: boolean | null; distanceM: number | null; lastFixAt: number | null };
type LocalEvents = { arrival?: kpi.DetectedEvent & { sent?: boolean }; exit?: kpi.DetectedEvent & { sent?: boolean } };
type Config = {
  employeeId: string; date: string; pins: kpi.ShiftToday['pins']; radiusM: number; placeKind: string;
  windowStartMs: number; windowEndMs: number; shiftEndMs: number; hasIn: boolean;
};

let snapshot: Snapshot = { status: Capacitor.isNativePlatform() ? 'off' : 'web', inside: null, distanceM: null, lastFixAt: null };
const listeners = new Set<(s: Snapshot) => void>();
const changeListeners = new Set<() => void>();
let cfg: Config | null = null;
let watcherId: string | null = null;
let startTimer: ReturnType<typeof setTimeout> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let pendingExit: kpi.DetectedEvent | null = null;

const emit = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((fn) => fn(snapshot)); };
const changed = () => changeListeners.forEach((fn) => fn());

export function subscribeShiftTracker(fn: (s: Snapshot) => void) {
  listeners.add(fn);
  fn(snapshot);
  return () => { listeners.delete(fn); };
}
// Called after the tracker sent or confirmed something, so the shift card can reload.
export function onShiftTrackerChange(fn: () => void) {
  changeListeners.add(fn);
  return () => { changeListeners.delete(fn); };
}

// ---- What the phone remembers (arrival / exit for the day) ----

const localKey = (employeeId: string, date: string) => `bunny-shift:${employeeId}:${date}`;
export function localEvents(employeeId: string, date: string): LocalEvents {
  try { return JSON.parse(localStorage.getItem(localKey(employeeId, date)) || '{}'); } catch { return {}; }
}
function saveLocal(employeeId: string, date: string, ev: LocalEvents) {
  try { localStorage.setItem(localKey(employeeId, date), JSON.stringify(ev)); } catch { /* storage full or blocked */ }
}
export function clearLocalEvent(employeeId: string, date: string, kind: 'arrival' | 'exit') {
  const ev = localEvents(employeeId, date);
  delete ev[kind];
  saveLocal(employeeId, date, ev);
}

export const consentKey = (employeeId: string) => `bunny-shift-consent:${employeeId}`;

// ---- Prompt text (English · Bengali) ----

const BN = '০১২৩৪৫৬৭৮৯';
const bnDigits = (s: string) => s.replace(/\d/g, (d) => BN[Number(d)]);
export function promptText(kind: 'arrival' | 'exit', atMs: number, placeKind?: string) {
  const en = kpi.clock12(new Date(atMs).toISOString());
  const bn = bnDigits(en.replace(/\s?[AP]M$/, ''));
  if (kind === 'exit') return `You left at ${en} - check out? · ${bn}-এ বেরিয়েছেন - চেক আউট করবেন?`;
  return placeKind === 'production'
    ? `You reached the production house at ${en} - check in? · প্রোডাকশন হাউসে পৌঁছেছেন ${bn}-এ - চেক ইন করবেন?`
    : `You reached the store at ${en} - check in? · দোকানে পৌঁছেছেন ${bn}-এ - চেক ইন করবেন?`;
}

// ---- Sending ----

async function deliver(kind: 'arrival' | 'exit', ev: kpi.DetectedEvent) {
  if (!cfg) return;
  const { employeeId, date } = cfg;
  const local = localEvents(employeeId, date);
  local[kind] = { ...ev, sent: false };
  saveLocal(employeeId, date, local);
  try {
    await kpi.sendDetected(ev);
    const now = localEvents(employeeId, date);
    if (now[kind]) { now[kind]!.sent = true; saveLocal(employeeId, date, now); }
  } catch { /* no signal: kept on the phone and sent again next time the app opens */ }
  changed();
  // In the app: offer it straight away (outside the app the server's notification does this).
  const label = kind === 'arrival' ? 'Check in · চেক ইন' : 'Check out · চেক আউট';
  toast(promptText(kind, ev.detectedAt, cfg.placeKind), {
    duration: 120000,
    action: {
      label,
      onClick: () => {
        kpi.confirmDetected(kind, { event: ev })
          .then(() => { toast.success(kind === 'arrival' ? 'Checked in' : 'Checked out'); if (cfg) clearLocalEvent(cfg.employeeId, cfg.date, kind); changed(); })
          .catch((e) => toast.error(e?.message || 'Could not confirm - try from the home screen'));
      },
    },
  });
}

// Events saved while offline get another go.
// True when something was sent. Only then is anyone told: the shift card reloads on a change and
// reloading calls this again, so an unconditional "changed" looped (about 2,600 calls a day, 28 Oct 2026).
export async function resendUnsent(employeeId: string, date: string): Promise<boolean> {
  const local = localEvents(employeeId, date);
  let sentAny = false;
  for (const kind of ['arrival', 'exit'] as const) {
    const ev = local[kind];
    if (!ev || ev.sent) continue;
    try {
      await kpi.sendDetected(ev);
      local[kind] = { ...ev, sent: true };
      saveLocal(employeeId, date, local);
      sentAny = true;
    } catch { /* still offline */ }
  }
  return sentAny;
}

// ---- Geofence ----

function handleFix(loc: { latitude: number; longitude: number; accuracy: number; simulated?: boolean; time?: number | null }) {
  if (!cfg) return;
  const now = Date.now();
  if (now > cfg.windowEndMs) { stopShiftTracking('off'); return; }
  let best = Infinity;
  for (const p of cfg.pins) best = Math.min(best, distanceM(loc.latitude, loc.longitude, p.lat, p.lng));
  emit({ distanceM: Number.isFinite(best) ? Math.round(best) : null, lastFixAt: now });
  if (!Number.isFinite(best) || !(loc.accuracy <= MAX_ACCURACY_M)) return;
  const slack = Math.min(Math.max(0, loc.accuracy || 0), GPS_TOLERANCE_M);
  const inside = best <= cfg.radiusM + slack;
  const gone = best - slack > cfg.radiusM + LEAVE_MARGIN_M;
  const at = typeof loc.time === 'number' && Math.abs(loc.time - now) < 10 * 60000 ? loc.time : now;
  const ev = (kind: 'arrival' | 'exit'): kpi.DetectedEvent => ({ kind, detectedAt: at, lat: loc.latitude, lng: loc.longitude, accuracyM: Math.round(loc.accuracy), simulated: !!loc.simulated });

  if (inside && snapshot.inside !== true) {
    emit({ inside: true });
    pendingExit = null; // back from a short break
    const local = localEvents(cfg.employeeId, cfg.date);
    if (!cfg.hasIn && !local.arrival) deliver('arrival', ev('arrival'));
  } else if (gone && snapshot.inside !== false) {
    const wasInside = snapshot.inside === true;
    emit({ inside: false });
    if (wasInside) {
      if (now >= cfg.shiftEndMs) deliver('exit', ev('exit'));
      else pendingExit = ev('exit');
    }
  }
  checkPendingExit();
}

function checkPendingExit() {
  if (!cfg || !pendingExit) return;
  const now = Date.now();
  if (snapshot.inside === false && (now - pendingExit.detectedAt >= EARLY_EXIT_AFTER_MS || now >= cfg.windowEndMs)) {
    const ev = pendingExit;
    pendingExit = null;
    deliver('exit', ev);
  }
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function startWatcher() {
  if (watcherId || !cfg) return;
  emit({ status: 'watching', inside: null });
  ticker = setInterval(() => {
    checkPendingExit();
    if (cfg && Date.now() > cfg.windowEndMs) stopShiftTracking('off');
  }, 60000);
  BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Bunny Momos - shift check-in',
      backgroundMessage: 'Checking when you reach and leave work. Only around your shift hours.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 20,
    },
    (location, error) => {
      if (error) { emit({ status: error.code === 'NOT_AUTHORIZED' ? 'denied' : 'error' }); return; }
      if (location) handleFix(location);
    },
  ).then((id) => {
    if (!cfg || snapshot.status !== 'watching') BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    else watcherId = id;
  }).catch(() => emit({ status: 'error' }));
}

export function stopShiftTracking(status: TrackerStatus = 'off') {
  if (startTimer) { clearTimeout(startTimer); startTimer = null; }
  if (ticker) { clearInterval(ticker); ticker = null; }
  if (watcherId) { BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {}); watcherId = null; }
  checkPendingExit();
  pendingExit = null;
  emit({ status: Capacitor.isNativePlatform() ? status : 'web', inside: null });
}

// Start (or keep) watching for today's shift. Safe to call on every refresh of the shift card.
export function ensureShiftTracking(today: kpi.ShiftToday, employeeId: string) {
  if (!Capacitor.isNativePlatform()) { emit({ status: 'web' }); return; }
  let consented = !!today.consent?.accepted;
  try { if (!today.consent && localStorage.getItem(consentKey(employeeId)) === 'yes') consented = true; } catch { /* ignore */ }
  if (today.exempt || !today.workingDay || !today.pins.length) { stopShiftTracking('off'); return; }
  if (!consented) { stopShiftTracking('needs-consent'); return; }
  resendUnsent(employeeId, today.date).then((sent) => { if (sent) changed(); });
  const next: Config = {
    employeeId, date: today.date, pins: today.pins, radiusM: today.radiusM,
    placeKind: today.pins.length && today.pins.every((p) => p.kind === 'production') ? 'production' : 'store',
    windowStartMs: Date.parse(today.window.startAt), windowEndMs: Date.parse(today.window.endAt),
    shiftEndMs: Date.parse(today.window.shiftEndAt), hasIn: !!today.punch?.in,
  };
  const sameDay = cfg?.date === next.date && cfg.employeeId === next.employeeId;
  cfg = next;
  if (sameDay && (watcherId || startTimer || snapshot.status === 'watching')) return;
  stopShiftTracking('off');
  cfg = next;
  const now = Date.now();
  if (now > next.windowEndMs) return;
  if (now < next.windowStartMs) {
    // Best effort: Android may pause this timer while the app is in the background; opening the
    // app (or coming back to it) checks again.
    emit({ status: 'waiting' });
    startTimer = setTimeout(() => { startTimer = null; startWatcher(); }, next.windowStartMs - now);
    return;
  }
  startWatcher();
}

export const openLocationSettings = () => { if (Capacitor.isNativePlatform()) BackgroundGeolocation.openSettings().catch(() => {}); };
