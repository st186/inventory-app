// Live map for one ride: polls the server for the rider's latest position plus the stop pins, and
// for the distance / ETA / traffic read-out. Polling (not push) is plenty for a single rider and
// keeps this simple. The timers skip their work while the app is in the background and catch up
// on return. The map library itself loads only when this is on screen.
import { Suspense, useEffect, useState } from 'react';
import { Gauge, Navigation, Timer } from 'lucide-react';
import type { RiderTripEta, RiderTripLocation } from '../../utils/api';
import { isAppVisible, onAppVisibilityChange } from '../../utils/appVisibility';
import { Callout } from '../ui/callout';
import { StatusChip } from '../ui/status-chip';
import { cn } from '../ui/utils';
import { MapPlaceholder, RiderMap } from './mapLazy';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';

export function LiveTripMap({ tripId, pollMs, height = 280, className }: { tripId: string; pollMs: number; height?: number; className?: string }) {
  const rapi = useRiderApi();
  const w = useRideWords();
  const [data, setData] = useState<RiderTripLocation | null>(null);
  const [eta, setEta] = useState<RiderTripEta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const result = await rapi.getRiderTripLocation(tripId);
        if (!cancelled) { setData(result); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : w.t('rider.map.loadFailed'));
      }
    };
    const fetchEta = async () => {
      try {
        const result = await rapi.getRiderTripEta(tripId);
        if (!cancelled) setEta(result);
      } catch { /* the map still works without an estimate */ }
    };
    fetchOnce();
    fetchEta();
    const poll = setInterval(() => { if (isAppVisible()) fetchOnce(); }, pollMs);
    const etaPoll = setInterval(() => { if (isAppVisible()) fetchEta(); }, 15000); // the server caches an estimate for ~40s anyway
    const tick = setInterval(() => { if (isAppVisible()) setTick((n) => n + 1); }, 15000); // keeps "x s ago" honest between polls
    const offVisible = onAppVisibilityChange((visible) => { if (visible) { fetchOnce(); fetchEta(); } });
    return () => { cancelled = true; clearInterval(poll); clearInterval(etaPoll); clearInterval(tick); offVisible(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, pollMs, rapi]);

  const loc = data?.location || null;
  const stale = !!loc && Date.now() - new Date(loc.updatedAt).getTime() > 90000;
  const hasEta = eta?.distanceMeters !== undefined && eta?.etaSeconds !== undefined;
  const etaMinutes = hasEta ? Math.max(1, Math.round((eta!.etaSeconds as number) / 60)) : 0;
  const km = hasEta ? ((eta!.distanceMeters as number) / 1000) : 0;
  const level = eta?.traffic?.level;
  const trafficText = level === 'heavy' ? w.t('rider.map.heavy') : level === 'moderate' ? w.t('rider.map.moderate') : level === 'light' ? w.t('rider.map.light') : null;
  const trafficTone = level === 'heavy' ? 'danger' : level === 'moderate' ? 'warning' : 'success';
  const avgKmh = eta?.traffic?.observedKmh;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {hasEta && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="neutral" icon={Navigation}>
              <span className="num">{w.t('rider.map.toTarget', { distance: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`, place: eta!.targetName || '' })}</span>
            </StatusChip>
            <StatusChip tone="neutral" icon={Timer}>
              <span className="num">{w.t('rider.map.eta', { n: etaMinutes })} · {w.time(eta!.etaAt as string)}</span>
            </StatusChip>
            {trafficText && (
              <StatusChip tone={trafficTone} icon={Gauge}>
                {trafficText}
                {avgKmh !== null && avgKmh !== undefined && <span className="num font-normal">· {w.t('rider.map.avg', { n: avgKmh })}</span>}
              </StatusChip>
            )}
          </div>
          {eta!.timing === 'late' && (
            <Callout tone="danger" title={w.t('rider.map.late', { n: Math.max(1, eta!.deltaMinutes || 0) })}>
              {w.t('rider.map.lateBody', { n: eta!.expectedMinutes ?? '' })}
            </Callout>
          )}
          {eta!.timing === 'early' && <Callout tone="success" title={w.t('rider.map.early', { n: Math.max(1, Math.abs(eta!.deltaMinutes || 0)) })} />}
          {eta!.timing === 'on_time' && <p className="text-label text-success">{w.t('rider.map.onTime')}</p>}
          {eta!.source === 'estimate' && <p className="text-caption text-text-3">{w.t('rider.map.approx')}</p>}
        </div>
      )}
      {eta?.unavailable === 'destination_not_pinned' && (
        <p className="text-label text-text-3">{w.t('rider.map.pinMissing', { place: eta.targetName || '' })}</p>
      )}
      <Suspense fallback={<MapPlaceholder height={height} />}>
        <RiderMap
          rider={loc ? { latitude: loc.latitude, longitude: loc.longitude, updatedAt: loc.updatedAt } : null}
          places={data?.places || []}
          track={loc?.track || []}
          height={height}
          labels={{ rider: w.t('rider.map.riderPin'), production: w.t('rider.place.production'), stop: w.t('rider.map.stopPin') }}
        />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2 text-label" role="status">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : !loc ? (
          <span className="text-text-3">{w.t('rider.map.waiting')}</span>
        ) : (
          <StatusChip tone={stale ? 'warning' : 'success'} dot>
            {stale ? w.t('rider.map.stale', { age: w.age(loc.updatedAt) }) : w.t('rider.map.live', { age: w.age(loc.updatedAt) })}
          </StatusChip>
        )}
        {data && data.missingPins && data.missingPins.length > 0 && (
          <span className="text-text-3">{w.t('rider.map.noPin', { places: data.missingPins.join(' · ') })}</span>
        )}
      </div>
    </div>
  );
}
