import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { CheckCircle2, Clock, Loader2, LogIn, LogOut, MapPin, MapPinOff, Radar, Users } from 'lucide-react';
import { toast } from 'sonner';
import * as kpi from './kpiApi';
import { ShiftConsent } from './ShiftConsent';
import { onAppVisibilityChange, useForegroundInterval } from '../../utils/appVisibility';
import {
  clearLocalEvent, ensureShiftTracking, localEvents, onShiftTrackerChange, promptText, subscribeShiftTracker, type TrackerStatus,
} from './shiftTracker';

// Home screen card for staff and managers (not the owner or audit): today's shift, check-in and
// check-out, hours, any arrival/leaving the phone noticed that still needs confirming, and - for
// managers - their team's check-ins waiting for confirmation. Marked data-ai-private: it shows
// people's times and names, which the Bunny chat must not send to the AI.

async function currentPosition(): Promise<{ lat: number; lng: number; accuracyM: number } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy) };
    }
    if (!('geolocation' in navigator)) return null;
    return await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    ));
  } catch {
    return null;
  }
}

function EventLine({ label, ev, placeWord }: { label: string; ev?: kpi.PunchEvent | null; placeWord: string }) {
  if (!ev) return <div><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-semibold text-gray-300">--</p></div>;
  const where = ev.exempt ? 'Rider' : ev.noGps ? 'No GPS' : ev.verified ? `At ${placeWord}` : ev.outside ? `${ev.distanceM ?? '?'} m away` : 'Not checked';
  const tone = ev.verified || ev.exempt ? 'text-emerald-700' : ev.outside ? 'text-red-700' : 'text-amber-700';
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 tabular-nums">{kpi.clock12(ev.at)}</p>
      <p className={`text-[11px] ${tone} flex items-center gap-1`}>
        {ev.verified || ev.exempt ? <MapPin className="w-3 h-3" /> : <MapPinOff className="w-3 h-3" />}
        {where} · {ev.source === 'geofence' ? 'auto' : 'button'}
        {ev.flags?.length ? ` · ${ev.flags.map((f) => kpi.FLAG_TEXT[f] || f).join(', ')}` : ''}
      </p>
    </div>
  );
}

const TRACKER_TEXT: Record<TrackerStatus, string> = {
  web: '',
  off: 'Automatic check-in is not watching now.',
  'needs-consent': '',
  waiting: 'Automatic check-in will start an hour before your shift.',
  watching: 'Automatic check-in is on - it will offer to check you in when you reach work.',
  denied: 'Location permission is off - use the buttons, or allow location in Settings.',
  error: 'Location is not available right now - use the buttons.',
};

export function ShiftClockCard({ isLead = false }: { isLead?: boolean }) {
  const [today, setToday] = useState<kpi.ShiftToday | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tracker, setTracker] = useState<{ status: TrackerStatus; inside: boolean | null }>({ status: 'off', inside: null });
  const [consentOpen, setConsentOpen] = useState(false);
  const [team, setTeam] = useState<kpi.TeamPending[]>([]);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const t = await kpi.getShiftToday();
      setToday(t);
      // Start / keep / stop the phone's watch for this shift (it lives on across screens).
      if (t.required && t.employeeId) ensureShiftTracking(t, t.employeeId);
    } catch {
      /* older server or offline: no card */
    }
  }, []);

  useEffect(() => {
    load();
    const offTracker = subscribeShiftTracker((s) => setTracker({ status: s.status, inside: s.inside }));
    const offChange = onShiftTrackerChange(() => { load(); });
    const offVisible = onAppVisibilityChange((visible) => { if (visible) load(); });
    return () => { offTracker(); offChange(); offVisible(); };
  }, [load]);
  // Keeps "hours so far" fresh - only while the app is in front (it catches up on return).
  useForegroundInterval(() => setTick((n) => n + 1), 60000, { resumeAfterMs: 0 });

  const refreshTeam = useCallback(() => { kpi.getTeamPending().then((r) => setTeam(r.pending || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (isLead) refreshTeam();
  }, [isLead, refreshTeam]);
  useForegroundInterval(refreshTeam, isLead ? 5 * 60000 : null);

  if (!today?.required) return null;
  const employeeId = today.employeeId;
  const p = today.punch;
  const placeWord = today.workplace === 'production' ? 'production house' : today.workplace === 'store' ? 'store' : 'work';
  const local = employeeId ? localEvents(employeeId, today.date) : {};

  // What still needs confirming: the server's suggestion, or one the phone saw but couldn't send.
  const pendingArrival = !p?.in ? (p?.pending?.arrival ? { at: p.pending.arrival.detectedAt, local: null } : local.arrival ? { at: new Date(local.arrival.detectedAt).toISOString(), local: local.arrival } : null) : null;
  const pendingExit = p?.pending?.exit ? { at: p.pending.exit.detectedAt, local: null } : local.exit && !local.exit.sent ? { at: new Date(local.exit.detectedAt).toISOString(), local: local.exit } : null;

  // New record from the server: show it and tell the phone's tracker (no arrival prompt once in).
  const apply = (punch: kpi.PunchRecord | null) => {
    const next = { ...today, punch };
    setToday(next);
    ensureShiftTracking(next, employeeId);
  };

  const doPunch = async (action: 'in' | 'out') => {
    setBusy(action);
    try {
      const pos = await currentPosition();
      const res = await kpi.punch(action, pos ? { lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracyM } : { gpsError: true });
      apply(res.punch);
      const ev = action === 'in' ? res.punch.in : res.punch.out;
      if (!pos) toast.warning('Saved without GPS - it will show as not verified.');
      else if (ev?.outside) toast.warning(`Saved, but GPS shows you ${ev.distanceM} m from the ${placeWord}.`);
      else toast.success(action === 'in' ? 'Shift started' : 'Shift ended');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save - try again');
      if (e?.details?.punch) setToday({ ...today, punch: e.details.punch });
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (kind: 'arrival' | 'exit', localEv: kpi.DetectedEvent | null) => {
    setBusy(`confirm-${kind}`);
    try {
      const res = await kpi.confirmDetected(kind, localEv ? { event: localEv } : {});
      clearLocalEvent(employeeId, today.date, kind);
      apply(res.punch);
      toast.success(kind === 'arrival' ? 'Checked in' : 'Checked out');
    } catch (e: any) {
      toast.error(e?.message || 'Could not confirm');
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (kind: 'arrival' | 'exit') => {
    setBusy(`dismiss-${kind}`);
    try {
      const res = await kpi.dismissDetected(kind);
      clearLocalEvent(employeeId, today.date, kind);
      apply(res.punch);
    } catch (e: any) {
      toast.error(e?.message || 'Could not do that');
    } finally {
      setBusy(null);
    }
  };

  const confirmForTeam = async (row: kpi.TeamPending, kind: 'arrival' | 'exit') => {
    setBusy(`team-${row.employeeId}-${kind}`);
    try {
      await kpi.confirmDetected(kind, { employeeId: row.employeeId, date: row.date });
      setTeam((list) => list.map((r) => (r.employeeId === row.employeeId ? { ...r, [kind]: null } : r)).filter((r) => r.arrival || r.exit));
      toast.success('Confirmed');
    } catch (e: any) {
      toast.error(e?.message || 'Could not confirm');
    } finally {
      setBusy(null);
    }
  };

  const liveHours = p?.in && !p.out ? (Date.now() - Date.parse(p.in.at)) / 3600000 : p?.hours ?? null;
  const status = !today.workingDay && !p?.in ? 'Weekly off' : !p?.in ? 'Not started' : !p.out ? 'On shift' : 'Done';
  const statusTone = status === 'On shift' ? 'bg-emerald-100 text-emerald-800' : status === 'Done' ? 'bg-gray-100 text-gray-700' : status === 'Weekly off' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4" data-ai-private>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-orange-600" /> Today's shift · আজকের শিফট</p>
            <p className="text-sm text-gray-500">{kpi.hhmm12(today.settings.shiftStart)} - {kpi.hhmm12(today.settings.shiftEnd)}{today.exempt ? ' · riders: no location check' : ''}</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusTone}`}>{status}</span>
        </div>

        {pendingArrival && (
          <div className="mt-3 rounded-xl bg-orange-50 border border-orange-200 p-3">
            <p className="text-sm text-orange-900">{promptText('arrival', Date.parse(pendingArrival.at), today.workplace)}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={!!busy} onClick={() => confirm('arrival', pendingArrival.local)} className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {busy === 'confirm-arrival' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check in at {kpi.clock12(pendingArrival.at)}
              </button>
              {!pendingArrival.local && <button disabled={!!busy} onClick={() => dismiss('arrival')} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 disabled:opacity-50">Not me</button>}
            </div>
          </div>
        )}
        {pendingExit && (
          <div className="mt-3 rounded-xl bg-orange-50 border border-orange-200 p-3">
            <p className="text-sm text-orange-900">{promptText('exit', Date.parse(pendingExit.at))}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={!!busy} onClick={() => confirm('exit', pendingExit.local)} className="px-3 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {busy === 'confirm-exit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Check out at {kpi.clock12(pendingExit.at)}
              </button>
              {!pendingExit.local && <button disabled={!!busy} onClick={() => dismiss('exit')} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 disabled:opacity-50">Not now</button>}
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-3">
          <EventLine label="Checked in" ev={p?.in} placeWord={placeWord} />
          <EventLine label="Checked out" ev={p?.out} placeWord={placeWord} />
          <div>
            <p className="text-xs text-gray-500">Hours</p>
            <p className="text-lg font-semibold text-gray-900 tabular-nums">{liveHours !== null && liveHours > 0 ? `${Math.floor(liveHours)}h ${Math.round((liveHours % 1) * 60)}m` : '--'}</p>
            {p?.in && !p.out && <p className="text-[11px] text-gray-500">so far</p>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!p?.in ? (
            <button disabled={!!busy} onClick={() => doPunch('in')} className="flex-1 min-w-[140px] px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {busy === 'in' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Start shift · শিফট শুরু
            </button>
          ) : (
            <button disabled={!!busy} onClick={() => doPunch('out')} className="flex-1 min-w-[140px] px-4 py-3 rounded-xl bg-gray-900 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {busy === 'out' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} {p.out ? 'Update end of shift' : 'End shift · শিফট শেষ'}
            </button>
          )}
        </div>
        {p?.in && p.out && <p className="text-[11px] text-gray-400 mt-1">Tapping again moves your end time to now.</p>}

        {!today.exempt && Capacitor.isNativePlatform() && (
          <div className="mt-3 text-xs text-gray-600 flex items-start gap-2">
            <Radar className="w-4 h-4 text-orange-600 flex-shrink-0" />
            {tracker.status === 'needs-consent' || (!today.consent && tracker.status === 'off') ? (
              <span>Let the app check you in when you reach work. <button onClick={() => setConsentOpen(true)} className="font-semibold text-orange-700 underline">Turn on automatic check-in</button></span>
            ) : !today.pins.length ? (
              <span>Your workplace isn't pinned on the map yet - ask the production incharge to pin it (Riders → Map pins).</span>
            ) : (
              <span>{TRACKER_TEXT[tracker.status]}{tracker.status === 'watching' && tracker.inside !== null ? (tracker.inside ? ' You are at work.' : ' You are not at work yet.') : ''}</span>
            )}
          </div>
        )}

        {team.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-orange-600" /> Team check-ins to confirm</p>
            <div className="mt-2 space-y-2">
              {team.map((row) => (
                <div key={row.employeeId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-800">{row.name}</span>
                  <div className="flex gap-2">
                    {row.arrival && (
                      <button disabled={!!busy} onClick={() => confirmForTeam(row, 'arrival')} className="px-2.5 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-50">
                        In {kpi.clock12(row.arrival.detectedAt)}{row.arrival.simulated ? ' (mock!)' : ''}
                      </button>
                    )}
                    {row.exit && (
                      <button disabled={!!busy} onClick={() => confirmForTeam(row, 'exit')} className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-50">
                        Out {kpi.clock12(row.exit.detectedAt)}{row.exit.simulated ? ' (mock!)' : ''}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {consentOpen && employeeId && (
        <ShiftConsent employeeId={employeeId} onClose={() => { setConsentOpen(false); load(); }} />
      )}
    </div>
  );
}
