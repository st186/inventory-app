import { Suspense, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, Navigation, Timer } from 'lucide-react';
import * as api from '../../utils/api';
import type { RiderTripEta, RiderTripLocation } from '../../utils/api';
import { isAppVisible, onAppVisibilityChange } from '../../utils/appVisibility';
import { MapPlaceholder, RiderMap } from './mapLazy';
import { ageLabel } from './tripUtils';

// Live map for one ride: polls the server for the rider's latest position plus the production
// and store pins, and for the distance / ETA / traffic read-out. Polling (not push) is plenty
// for a single rider and keeps this simple.
export function LiveTripMap({ tripId, pollMs, height = 280 }: { tripId: string; pollMs: number; height?: number }) {
  const [data, setData] = useState<RiderTripLocation | null>(null);
  const [eta, setEta] = useState<RiderTripEta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const result = await api.getRiderTripLocation(tripId);
        if (!cancelled) { setData(result); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the map');
      }
    };
    const fetchEta = async () => {
      try {
        const result = await api.getRiderTripEta(tripId);
        if (!cancelled) setEta(result);
      } catch { /* the map still works without an estimate */ }
    };
    fetchOnce();
    fetchEta();
    // The timers skip their work while the app is in the background, and catch up on return.
    const poll = setInterval(() => { if (isAppVisible()) fetchOnce(); }, pollMs);
    const etaPoll = setInterval(() => { if (isAppVisible()) fetchEta(); }, 15000); // the server caches an estimate for ~40s anyway
    const tick = setInterval(() => { if (isAppVisible()) setTick((n) => n + 1); }, 15000); // keeps "x s ago" honest between polls
    const offVisible = onAppVisibilityChange((visible) => { if (visible) { fetchOnce(); fetchEta(); } });
    return () => { cancelled = true; clearInterval(poll); clearInterval(etaPoll); clearInterval(tick); offVisible(); };
  }, [tripId, pollMs]);

  const loc = data?.location || null;
  const stale = !!loc && Date.now() - new Date(loc.updatedAt).getTime() > 90000;
  const hasEta = eta?.distanceMeters !== undefined && eta?.etaSeconds !== undefined;
  const etaMinutes = hasEta ? Math.max(1, Math.round((eta!.etaSeconds as number) / 60)) : 0;
  const km = hasEta ? ((eta!.distanceMeters as number) / 1000) : 0;
  const trafficText = eta?.traffic?.level === 'heavy' ? 'Heavy traffic' : eta?.traffic?.level === 'moderate' ? 'Slow traffic' : eta?.traffic?.level === 'light' ? 'Traffic is clear' : null;
  const trafficClass = eta?.traffic?.level === 'heavy' ? 'bg-red-100 text-red-800' : eta?.traffic?.level === 'moderate' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';

  return (
    <div className="mt-4">
      {hasEta && (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-900">
              <Navigation className="w-4 h-4 text-blue-600" /> {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} to {eta!.targetName}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-900">
              <Timer className="w-4 h-4 text-orange-600" /> ETA {etaMinutes} min
              <span className="font-normal text-gray-500">
                ({new Date(eta!.etaAt as string).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })})
              </span>
            </span>
            {trafficText && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${trafficClass}`}>
                <Gauge className="w-4 h-4" /> {trafficText}
                {eta!.traffic?.observedKmh !== null && eta!.traffic?.observedKmh !== undefined && (
                  <span className="font-normal">· averaging {eta!.traffic.observedKmh} km/h</span>
                )}
              </span>
            )}
          </div>
          {eta!.timing === 'late' && (
            <p className="flex items-center gap-2 text-sm font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Running about {Math.max(1, eta!.deltaMinutes || 0)} min late
              <span className="font-normal text-red-700">- this leg usually takes about {eta!.expectedMinutes} min</span>
            </p>
          )}
          {eta!.timing === 'early' && (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Arriving about {Math.max(1, Math.abs(eta!.deltaMinutes || 0))} min early
            </p>
          )}
          {eta!.timing === 'on_time' && (
            <p className="text-xs text-emerald-700">On time for this leg.</p>
          )}
          {eta!.source === 'estimate' && <p className="text-[11px] text-gray-400">Approximate - the route service was unreachable, so this uses a straight-line estimate.</p>}
        </div>
      )}
      {eta?.unavailable === 'destination_not_pinned' && (
        <p className="mb-3 text-xs text-gray-500">Pin {eta.targetName} under "Map pins" to see the distance and ETA.</p>
      )}
      <Suspense fallback={<MapPlaceholder height={height} />}>
        <RiderMap
          rider={loc ? { latitude: loc.latitude, longitude: loc.longitude, updatedAt: loc.updatedAt } : null}
          places={data?.places || []}
          track={loc?.track || []}
          height={height}
        />
      </Suspense>
      <div className="mt-2 text-xs flex flex-wrap items-center justify-between gap-2">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : !loc ? (
          <span className="text-gray-500">Waiting for the rider's location... it appears once their phone starts sharing.</span>
        ) : (
          <span className={stale ? 'text-amber-700' : 'text-emerald-700'}>
            {stale ? 'Location not updating - last seen ' : 'Live - updated '}
            {ageLabel(loc.updatedAt)}
          </span>
        )}
        {data && data.missingPins && data.missingPins.length > 0 && (
          <span className="text-gray-500">{data.missingPins.join(' and ')}: pin not set yet</span>
        )}
      </div>
    </div>
  );
}
