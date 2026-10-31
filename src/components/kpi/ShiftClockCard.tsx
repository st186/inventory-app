import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { CheckCircle2, LogIn, LogOut, MapPin, MapPinOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import type * as kpi from './kpiApi';
import { clock12, hhmm12, FLAG_TEXT } from './kpiApi';
import { ShiftConsent } from './ShiftConsent';
import { onAppVisibilityChange, useForegroundInterval } from '../../utils/appVisibility';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { StatusChip } from '../ui/status-chip';
import { useHomeData } from '../home/homeData';
import { distanceText } from '../../utils/distance';
import {
  clearLocalEvent, ensureShiftTracking, localEvents, onShiftTrackerChange, subscribeShiftTracker, type TrackerStatus,
} from './shiftTracker';

// The shift card (pinned at the top of staff Home, and on My KPIs): today's shift, a full-width
// Start / End shift button, check-in and check-out times with where they were made, any arrival /
// leaving the phone noticed that still needs confirming, and - for managers - their team's
// check-ins waiting for confirmation. "Why location?" opens the consent text. Marked
// data-ai-private: it shows people's times and names, which the Bunny chat must not send to the AI.

export async function currentPosition(): Promise<{ lat: number; lng: number; accuracyM: number } | null> {
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

const lowerTime = (iso?: string | null) => clock12(iso).toLowerCase();

/**
 * `framed` (default) keeps the old page padding around the card for screens that drop it in as is
 * (My KPIs); Home places it in its own column and passes framed={false}.
 */
export function ShiftClockCard({ isLead = false, framed = true }: { isLead?: boolean; framed?: boolean }) {
  const { t, lang } = useT();
  const data = useHomeData();
  const [today, setToday] = useState<kpi.ShiftToday | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tracker, setTracker] = useState<{ status: TrackerStatus; inside: boolean | null }>({ status: 'off', inside: null });
  const [consentOpen, setConsentOpen] = useState(false);
  const [team, setTeam] = useState<kpi.TeamPending[]>([]);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const next = await data.getShiftToday();
      setToday(next);
      // Start / keep / stop the phone's watch for this shift (it lives on across screens).
      if (next.required && next.employeeId) ensureShiftTracking(next, next.employeeId);
    } catch {
      /* older server or offline: no card */
    }
  }, [data]);

  useEffect(() => {
    load();
    const offTracker = subscribeShiftTracker((s) => setTracker({ status: s.status, inside: s.inside }));
    const offChange = onShiftTrackerChange(() => { load(); });
    const offVisible = onAppVisibilityChange((visible) => { if (visible) load(); });
    return () => { offTracker(); offChange(); offVisible(); };
  }, [load]);
  // Keeps "hours so far" fresh - only while the app is in front (it catches up on return).
  useForegroundInterval(() => setTick((n) => n + 1), 60000, { resumeAfterMs: 0 });

  const refreshTeam = useCallback(() => { data.getTeamPending().then((r) => setTeam(r.pending || [])).catch(() => {}); }, [data]);
  useEffect(() => {
    if (isLead) refreshTeam();
  }, [isLead, refreshTeam]);
  useForegroundInterval(refreshTeam, isLead ? 5 * 60000 : null);

  if (!today?.required) return null;
  const employeeId = today.employeeId;
  const p = today.punch;
  const place = t(today.workplace === 'production' ? 'shift.place.production' : today.workplace === 'store' ? 'shift.place.store' : 'shift.place.work');
  const local = employeeId ? localEvents(employeeId, today.date) : {};
  const native = Capacitor.isNativePlatform();

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
      const res = await data.punch(action, pos ? { lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracyM } : { gpsError: true });
      apply(res.punch);
      const ev = action === 'in' ? res.punch.in : res.punch.out;
      if (!pos) toast.warning(t('shift.toastNoGps'));
      else if (ev?.outside) toast.warning(t('shift.toastFar', { d: distanceText(ev.distanceM, t), place }));
      else toast.success(action === 'in' ? t('shift.toastStarted') : t('shift.toastEnded'));
    } catch (e: any) {
      toast.error(e?.message || t('shift.toastFailed'));
      if (e?.details?.punch) setToday({ ...today, punch: e.details.punch });
    } finally {
      setBusy(null);
    }
  };

  const confirmEvent = async (kind: 'arrival' | 'exit', localEv: kpi.DetectedEvent | null) => {
    setBusy(`confirm-${kind}`);
    try {
      const res = await data.confirmDetected(kind, localEv ? { event: localEv } : {});
      clearLocalEvent(employeeId, today.date, kind);
      apply(res.punch);
      toast.success(kind === 'arrival' ? t('shift.toastCheckedIn') : t('shift.toastCheckedOut'));
    } catch (e: any) {
      toast.error(e?.message || t('shift.toastFailed'));
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (kind: 'arrival' | 'exit') => {
    setBusy(`dismiss-${kind}`);
    try {
      const res = await data.dismissDetected(kind);
      clearLocalEvent(employeeId, today.date, kind);
      apply(res.punch);
    } catch (e: any) {
      toast.error(e?.message || t('shift.toastFailed'));
    } finally {
      setBusy(null);
    }
  };

  const confirmForTeam = async (row: kpi.TeamPending, kind: 'arrival' | 'exit') => {
    setBusy(`team-${row.employeeId}-${kind}`);
    try {
      await data.confirmDetected(kind, { employeeId: row.employeeId, date: row.date });
      setTeam((list) => list.map((r) => (r.employeeId === row.employeeId ? { ...r, [kind]: null } : r)).filter((r) => r.arrival || r.exit));
      toast.success(t('shift.toastConfirmed'));
    } catch (e: any) {
      toast.error(e?.message || t('shift.toastFailed'));
    } finally {
      setBusy(null);
    }
  };

  const liveHours = p?.in && !p.out ? (Date.now() - Date.parse(p.in.at)) / 3600000 : p?.hours ?? null;
  const hoursText = liveHours !== null && liveHours > 0 ? `${Math.floor(liveHours)}h ${Math.round((liveHours % 1) * 60)}m` : '--';
  const status = !today.workingDay && !p?.in ? 'off' : !p?.in ? 'notStarted' : !p.out ? 'onShift' : 'done';
  const statusChip = status === 'onShift'
    ? <StatusChip tone="success" dot>{t('status.onShift')}</StatusChip>
    : status === 'done' ? <StatusChip tone="neutral" icon={CheckCircle2}>{t('status.shiftDone')}</StatusChip>
      : status === 'off' ? <StatusChip tone="info">{t('status.weeklyOff')}</StatusChip>
        : <StatusChip tone="neutral">{t('status.notStarted')}</StatusChip>;

  // Where a check-in / check-out was made.
  const whereChip = (ev: kpi.PunchEvent) => {
    if (ev.exempt) return <StatusChip tone="neutral" size="sm">{t('shift.riderNoCheck')}</StatusChip>;
    if (ev.noGps) return <StatusChip tone="warning" size="sm" icon={MapPinOff}>{t('shift.noGps')}</StatusChip>;
    if (ev.verified) return <StatusChip tone="success" size="sm" icon={MapPin}>{t('shift.atPlace', { place })}</StatusChip>;
    if (ev.outside) return <StatusChip tone="danger" size="sm" icon={MapPinOff}>{t('shift.metersAway', { d: distanceText(ev.distanceM, t) })}</StatusChip>;
    return <StatusChip tone="warning" size="sm" icon={MapPinOff}>{t('shift.notChecked')}</StatusChip>;
  };
  const eventMeta = (ev: kpi.PunchEvent) => [
    ev.source === 'geofence' ? t('shift.auto') : t('shift.button'),
    ...(ev.flags?.length ? ev.flags.map((f) => FLAG_TEXT[f] || f) : []),
  ].join(' · ');

  // The line under the button: what the phone knows about location right now.
  const askConsent = native && !today.exempt && (tracker.status === 'needs-consent' || (!today.consent && tracker.status === 'off'));
  // Agreed to the first note (arrival and leaving only): the updated one adds at work / stepped out
  // during the shift (31 Oct 2026). Check-in keeps working meanwhile.
  const askUpdate = native && !today.exempt && !askConsent && !!today.consent?.accepted && (today.consent.version ?? 1) < 2;
  let locationLine: string;
  if (today.exempt) locationLine = t('shift.riderNoCheck');
  else if (!native) locationLine = t('shift.locationOnStart');
  else if (askConsent) locationLine = t('shift.locationOnStart');
  else if (!today.pins.length) locationLine = t('shift.noPin');
  else if (tracker.status === 'watching' && tracker.inside !== null) locationLine = tracker.inside ? t('shift.locationAtWork', { place }) : t('shift.locationNotYet');
  else if (tracker.status === 'waiting') locationLine = t('shift.trackerWaiting');
  else if (tracker.status === 'watching') locationLine = t('shift.trackerWatching');
  else if (tracker.status === 'denied') locationLine = t('shift.trackerDenied');
  else if (tracker.status === 'error') locationLine = t('shift.trackerError');
  else locationLine = t('shift.trackerOff');
  const atWork = native && tracker.status === 'watching' && tracker.inside === true;

  const card = (
    <section className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4" data-ai-private data-tour="shift" lang={lang} aria-labelledby="shift-card-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 id="shift-card-title" className="text-subtitle font-semibold text-text">{t('shift.yours')}</h2>
          <span className="num text-label text-text-3">
            {hhmm12(today.settings.shiftStart).toLowerCase()}–{hhmm12(today.settings.shiftEnd).toLowerCase()}
          </span>
        </div>
        {statusChip}
      </div>

      {pendingArrival && (
        <Callout
          tone="warning"
          icon={MapPin}
          title={t('shift.checkInAt', { time: lowerTime(pendingArrival.at) })}
          action={(
            <>
              <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === 'confirm-arrival'} leadingIcon={<CheckCircle2 />} onClick={() => confirmEvent('arrival', pendingArrival.local)}>
                {t('shift.checkInAt', { time: lowerTime(pendingArrival.at) })}
              </Button>
              {!pendingArrival.local && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => dismiss('arrival')}>{t('shift.notMe')}</Button>}
            </>
          )}
        >
          {t('shift.arrived', { place, time: lowerTime(pendingArrival.at) })}
        </Callout>
      )}
      {pendingExit && (
        <Callout
          tone="warning"
          icon={MapPinOff}
          title={t('shift.checkOutAt', { time: lowerTime(pendingExit.at) })}
          action={(
            <>
              <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === 'confirm-exit'} leadingIcon={<CheckCircle2 />} onClick={() => confirmEvent('exit', pendingExit.local)}>
                {t('shift.checkOutAt', { time: lowerTime(pendingExit.at) })}
              </Button>
              {!pendingExit.local && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => dismiss('exit')}>{t('shift.notNow')}</Button>}
            </>
          )}
        >
          {t('shift.left', { time: lowerTime(pendingExit.at) })}
        </Callout>
      )}

      {p?.in && (
        <dl className="grid grid-cols-3 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-label text-text-3">{t('shift.started')}</dt>
            <dd className="num text-title font-semibold text-text">{lowerTime(p.in.at)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-label text-text-3">{t('shift.worked')}</dt>
            <dd className="num text-title font-semibold text-text">{hoursText}</dd>
            {!p.out && <dd className="text-caption text-text-3">{t('shift.soFar')}</dd>}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-label text-text-3">{p.out ? t('shift.ended') : t('shift.ends')}</dt>
            <dd className="num text-title font-semibold text-text">{p.out ? lowerTime(p.out.at) : hhmm12(today.settings.shiftEnd).toLowerCase()}</dd>
          </div>
        </dl>
      )}

      {!p?.in ? (
        <Button size="lg" fullWidth disabled={!!busy} loading={busy === 'in'} leadingIcon={<LogIn />} onClick={() => doPunch('in')}>
          {t('shift.start')}
        </Button>
      ) : (
        <Button variant="secondary" size="lg" fullWidth disabled={!!busy} loading={busy === 'out'} leadingIcon={<LogOut />} onClick={() => doPunch('out')}>
          {p.out ? t('shift.updateEnd') : t('shift.end')}
        </Button>
      )}
      {p?.in && p.out && <p className="-mt-2 text-caption text-text-3">{t('shift.updateEndHint')}</p>}

      {p?.in && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {whereChip(p.in)}
            <span className="text-caption text-text-3">{t('shift.started')} · {eventMeta(p.in)}</span>
          </div>
          {p.out && (
            <div className="flex flex-wrap items-center gap-1.5">
              {whereChip(p.out)}
              <span className="text-caption text-text-3">{t('shift.ended')} · {eventMeta(p.out)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {atWork ? <MapPin className="size-4 shrink-0 text-success" aria-hidden="true" /> : <MapPin className="size-4 shrink-0 text-text-3" aria-hidden="true" />}
        <span className="min-w-0 flex-1 text-label text-text-2">
          {locationLine}
          {askConsent && (
            <>
              {' '}
              <button type="button" onClick={() => setConsentOpen(true)} className="hit-44 relative font-semibold text-primary underline-offset-4 hover:underline">{t('shift.turnOnAuto')}</button>
            </>
          )}
          {askUpdate && (
            <>
              {' '}
              <button type="button" onClick={() => setConsentOpen(true)} className="hit-44 relative font-semibold text-primary underline-offset-4 hover:underline">{t('shift.noteUpdated')}</button>
            </>
          )}
        </span>
        {employeeId && !today.exempt && (
          <Button variant="link" size="sm" className="hit-44 relative shrink-0" onClick={() => setConsentOpen(true)}>{t('shift.whyLocation')}</Button>
        )}
      </div>

      {team.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-2 text-body-sm font-semibold text-text"><Users className="size-4 text-text-2" aria-hidden="true" /> {t('shift.teamToConfirm')}</p>
          <div className="flex flex-col gap-2">
            {team.map((row) => (
              <div key={row.employeeId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
                <span className="text-body-sm text-text">{row.name}</span>
                <div className="flex gap-2">
                  {row.arrival && (
                    <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => confirmForTeam(row, 'arrival')}>
                      {t('shift.in', { time: lowerTime(row.arrival.detectedAt) })}{row.arrival.simulated ? ` ${t('shift.mock')}` : ''}
                    </Button>
                  )}
                  {row.exit && (
                    <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => confirmForTeam(row, 'exit')}>
                      {t('shift.out', { time: lowerTime(row.exit.detectedAt) })}{row.exit.simulated ? ` ${t('shift.mock')}` : ''}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {employeeId && (
        <ShiftConsent
          open={consentOpen}
          onOpenChange={(open) => { setConsentOpen(open); if (!open) load(); }}
          employeeId={employeeId}
          canAsk={askConsent || askUpdate}
          update={askUpdate}
        />
      )}
    </section>
  );
  return framed ? <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">{card}</div> : card;
}
