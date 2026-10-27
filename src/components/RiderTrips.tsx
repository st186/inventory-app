import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bike, CheckCircle2, Clock, Loader2, Map as MapIcon, MapPin, PackageCheck, RefreshCw, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import type { RiderListItem, RiderPlace, RiderTrip, RiderTripStatus, RiderTripType } from '../utils/api';
import type { PickedLocation } from './LocationPicker';
import { openRiderLocationSettings } from '../utils/riderTracking';
import { isAppVisible, onAppVisibilityChange } from '../utils/appVisibility';
import { refreshRiderLocationSharing, useRiderTrackingState } from '../utils/riderLocationSharing';
import { isRiderAlertRinging, riderAlertSupported, stopRiderAlert } from '../utils/riderAlert';
import { LocationPicker, MapPlaceholder } from './riders/mapLazy';
import {
  STATUS_PILL, TRACKED_STATUSES, TRIP_TYPE_LABEL, dropName, fmtTime, isActive, pickupName, pickupStop, routeLabel, rupees,
  statusLabel, stopsOf, tripTypeLabel,
} from './riders/tripUtils';
import { Timeline } from './riders/Timeline';
import { LiveTripMap } from './riders/LiveTripMap';
import { RiderEarningsCard } from './riders/RiderEarningsCard';
import { RiderAvailabilityCard } from './riders/RiderAvailabilityCard';
import { RiderFareBlock } from './riders/RiderFareBlock';
import { RiderPastRides } from './riders/RiderPastRides';
import { RiderAlertSetup } from './riders/RiderAlertSetup';
import { MapPins } from './riders/MapPins';

type RiderTripsProps = {
  // 'rider' = the rider's own screen; 'staff' = what production / store / cluster head see.
  mode: 'rider' | 'staff';
  // Production incharge, operations manager or cluster head: may call riders and mark orders ready.
  canDispatch?: boolean;
  stores?: { id: string; name: string }[];
  // Store staff only see rides headed to their store (the server enforces this too).
  defaultStoreId?: string | null;
  // Stock requests, so a ride can carry the ones it is delivering (and the store confirms once).
  stockRequests?: { id: string; storeId: string; requestDate: string; status: string }[];
};

export function RiderTrips({ mode, canDispatch = false, stores = [], defaultStoreId = null, stockRequests = [] }: RiderTripsProps) {
  const [trips, setTrips] = useState<RiderTrip[]>([]);
  const [maxTrips, setMaxTrips] = useState(4);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [riders, setRiders] = useState<RiderListItem[]>([]);
  const [riderId, setRiderId] = useState('');
  const [tripType, setTripType] = useState<RiderTripType>('to_store');
  const [fareInput, setFareInput] = useState('');
  // Custom rides: each end is a production house, a store, or a one-off location (e.g. an event stall).
  const [places, setPlaces] = useState<RiderPlace[]>([]);
  const [pickupChoice, setPickupChoice] = useState('');
  const [dropChoice, setDropChoice] = useState('custom');
  const [customName, setCustomName] = useState<Record<'pickup' | 'drop', string>>({ pickup: '', drop: '' });
  const [customLoc, setCustomLoc] = useState<Record<'pickup' | 'drop', PickedLocation | null>>({ pickup: null, drop: null });
  // Stock requests this ride is carrying (ticked ones are linked to the ride).
  const [linkedRequestIds, setLinkedRequestIds] = useState<Set<string>>(new Set());

  const [storeId, setStoreId] = useState(defaultStoreId || '');
  const [note, setNote] = useState('');
  const [calling, setCalling] = useState(false);
  const [openMaps, setOpenMaps] = useState<Set<string>>(new Set());

  // Open stock requests for the chosen store that a delivery ride could be carrying.
  const openRequests = useMemo(() => {
    if (!storeId || (tripType !== 'to_store' && tripType !== 'round_trip')) return [];
    return stockRequests
      .filter((r) => r.storeId === storeId && ['accepted', 'in-preparation', 'prepared', 'shipped', 'partially-shipped'].includes(r.status))
      .sort((a, b) => (a.requestDate < b.requestDate ? 1 : -1));
  }, [stockRequests, storeId, tripType]);

  // Pre-tick the requests production has already shipped - those are what a rider carries.
  useEffect(() => {
    setLinkedRequestIds(new Set(openRequests.filter((r) => r.status === 'shipped' || r.status === 'partially-shipped').map((r) => r.id)));
  }, [openRequests]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getRiderTrips();
      setTrips(data.trips);
      setMaxTrips(data.maxTripsPerDay);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load rides');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Refresh on a short timer so a status change (rider arrived, production marked ready) shows
  // up without a manual refresh. Live GPS in a later phase will replace polling for position.
  // Skipped while the app is in the background (a pocketed phone polled every 10 seconds), with a
  // refresh as soon as it comes back.
  useEffect(() => {
    load();
    const interval = setInterval(() => { if (isAppVisible()) load(true); }, mode === 'rider' ? 10000 : 15000);
    const offVisible = onAppVisibilityChange((visible) => { if (visible) load(true); });
    return () => { clearInterval(interval); offVisible(); };
  }, [load, mode]);

  useEffect(() => {
    if (!canDispatch) return;
    api.getRiders()
      .then((list) => {
        setRiders(list);
        if (list.length === 1) { setRiderId(list[0].employeeId); setFareInput(list[0].defaultRate ? String(list[0].defaultRate) : ''); }
      })
      .catch(() => {});
    api.getRiderPlaces().then(setPlaces).catch(() => {});
    // Availability changes through the day, so keep the red/green status fresh.
    const interval = setInterval(() => { if (isAppVisible()) api.getRiders().then(setRiders).catch(() => {}); }, 60000);
    return () => clearInterval(interval);
  }, [canDispatch]);

  useEffect(() => {
    if (!storeId && stores.length === 1) setStoreId(stores[0].id);
  }, [stores, storeId]);

  const run = async (id: string, action: () => Promise<RiderTrip>, success: string) => {
    setBusyId(id);
    try {
      const updated = await action();
      setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
      load(true);
    } finally {
      setBusyId(null);
    }
  };

  const selectRider = (r: RiderListItem) => {
    setRiderId(r.employeeId);
    setFareInput(r.defaultRate ? String(r.defaultRate) : '');
  };

  // A custom-ride end: 'production:<id>' / 'store:<id>' from the lists, or 'custom' for a one-off place.
  const buildCustomEnd = (which: 'pickup' | 'drop') => {
    const choice = which === 'pickup' ? pickupChoice : dropChoice;
    if (!choice) return { error: `Choose where the ride ${which === 'pickup' ? 'starts' : 'ends'}` };
    if (choice === 'custom') {
      const name = customName[which].trim();
      const loc = customLoc[which];
      if (name.length < 2) return { error: `Name the ${which === 'pickup' ? 'starting' : 'ending'} location` };
      if (!loc) return { error: `Pin ${name} on the map` };
      return { end: { kind: 'custom' as const, name, latitude: loc.latitude, longitude: loc.longitude } };
    }
    const [kind, id] = choice.split(':');
    return { end: { kind: kind as 'production' | 'store', id } };
  };

  const handleCall = async () => {
    if (!riderId) {
      toast.error('Choose a rider first');
      return;
    }
    if (tripType !== 'custom' && !storeId) {
      toast.error('Choose a store first');
      return;
    }
    let pickup; let drop;
    if (tripType === 'custom') {
      const p = buildCustomEnd('pickup');
      const d = buildCustomEnd('drop');
      if ('error' in p || 'error' in d) { toast.error(('error' in p ? p.error : (d as { error: string }).error) as string); return; }
      pickup = p.end; drop = d.end;
    }
    const chosen = riders.find((r) => r.employeeId === riderId);
    let force = false;
    if (chosen && !chosen.available) {
      if (!confirm(`${chosen.name} is unavailable (${chosen.unavailableReason}). Call them anyway?`)) return;
      force = true;
    }
    setCalling(true);
    try {
      const fare = Number(fareInput);
      const trip = await api.callRider({ riderEmployeeId: riderId, storeId: tripType === 'custom' ? undefined : storeId, note, tripType, pickup, drop, fare: fare > 0 ? fare : undefined, force, requestIds: Array.from(linkedRequestIds) });
      setTrips((prev) => [trip, ...prev]);
      setNote('');
      toast.success(`${trip.riderName} has been notified`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not call the rider');
    } finally {
      setCalling(false);
    }
  };

  const active = useMemo(() => trips.filter(isActive), [trips]);
  const done = useMemo(() => trips.filter((t) => !isActive(t)), [trips]);
  const todaysCount = trips.filter((t) => t.status !== 'cancelled' && t.tripNumber).length;

  // Rider only: the horn keeps sounding until the rider answers it (Silence button below, or by
  // starting the ride) - merely opening the app must not silence it, because the full-screen
  // alert opens the app by itself on an idle phone. It also stops once there is no waiting
  // ride request any more (cancelled, or already accepted from another screen).
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (mode !== 'rider' || !riderAlertSupported()) return;
    let cancelled = false;
    const check = async () => { const r = await isRiderAlertRinging(); if (!cancelled) setRinging(r); };
    check();
    const interval = setInterval(() => { if (isAppVisible()) check(); }, 1500);
    const offVisible = onAppVisibilityChange((visible) => { if (visible) check(); });
    return () => { cancelled = true; clearInterval(interval); offVisible(); };
  }, [mode]);
  const hasWaitingRequest = trips.some((t) => t.status === 'called');
  useEffect(() => {
    if (mode === 'rider' && !loading && !hasWaitingRequest) stopRiderAlert();
  }, [mode, loading, hasWaitingRequest]);

  // Rider only: the phone's position is shared while the active ride is in a tracked stage.
  // The sharing runs app-wide (utils/riderLocationSharing.ts, mounted in App.tsx) so it keeps
  // going when the rider leaves this screen mid-delivery; this screen shows its state and
  // nudges it when a ride changes stage here, so it doesn't wait for its own poll.
  const riderTripId = mode === 'rider' ? active[0]?.id || null : null;
  const riderShouldTrack = mode === 'rider' && !!active[0] && TRACKED_STATUSES.includes(active[0].status);
  const trackingState = useRiderTrackingState();
  useEffect(() => {
    if (mode === 'rider') refreshRiderLocationSharing();
  }, [mode, riderTripId, riderShouldTrack]);
  useEffect(() => {
    if (mode === 'rider' && trackingState === 'stopped') load(true); // the ride ended on the server
  }, [mode, trackingState, load]);

  const header = (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
          <Bike className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{mode === 'rider' ? 'My rides' : 'Rider logistics'}</h2>
          <p className="text-sm text-gray-500">
            {mode === 'rider'
              ? `${todaysCount} of ${maxTrips} rides today`
              : 'Production house to store deliveries'}
          </p>
        </div>
      </div>
      <button
        onClick={() => load()}
        className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
        aria-label="Refresh rides"
      >
        <RefreshCw className="w-4 h-4" />
      </button>
    </div>
  );

  // ---------------------------------------------------------------- rider screen
  if (mode === 'rider') {
    const trip = active[0];
    const nextAction = (t: RiderTrip): { label: string; status: RiderTripStatus; disabledReason?: string } | null => {
      if (t.status === 'called') {
        if (t.fareStatus === 'proposed') return { label: "I'm on my way", status: 'on_the_way', disabledReason: 'Waiting for production to approve your rate' };
        if (t.fareStatus === 'needs_rate') return { label: "I'm on my way", status: 'on_the_way', disabledReason: 'Enter your rate first' };
        return { label: "I'm on my way", status: 'on_the_way' };
      }
      if (t.status === 'on_the_way') return { label: "I've arrived", status: 'arrived' };
      if (t.status === 'arrived') {
        return t.readyAt
          ? { label: 'Picked up', status: 'picked_up' }
          : { label: 'Picked up', status: 'picked_up', disabledReason: 'Waiting for production to mark the order ready' };
      }
      if (t.status === 'picked_up') return { label: 'Delivered', status: 'delivered' };
      return null;
    };

    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        {header}
        {ringing && (
          <div className="mb-5 rounded-2xl bg-red-600 text-white p-4 shadow-lg shadow-red-600/30 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold">New ride request!</p>
              <p className="text-sm text-red-100">Production is calling you in.</p>
            </div>
            <button
              onClick={async () => { await stopRiderAlert(); setRinging(false); }}
              className="px-4 py-2 rounded-xl bg-white text-red-700 font-bold flex-shrink-0"
            >
              Silence
            </button>
          </div>
        )}
        <RiderAvailabilityCard />
        <RiderEarningsCard deliveredCount={trips.filter((t) => t.status === 'delivered').length} />
        <RiderAlertSetup />
        {loadError && <p className="text-sm text-red-600 mb-3">{loadError}</p>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
        ) : trip ? (
          <div className="bg-white rounded-2xl border border-orange-200 shadow-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Ride {trip.tripNumber}</p>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mt-0.5 flex-wrap">
                  <Store className="w-5 h-5 text-orange-600" /> {routeLabel(trip)}
                </h3>
                {trip.note && <p className="text-sm text-gray-600 mt-1">{trip.note}</p>}
                <p className="text-xs text-gray-500 mt-1">Called by {trip.calledByName} at {fmtTime(trip.calledAt)}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_PILL[trip.status]}`}>
                {statusLabel(trip)}
              </span>
            </div>

            <RiderFareBlock
              key={`${trip.id}-${trip.fareStatus}`}
              trip={trip}
              busy={busyId === trip.id}
              onPropose={(amount) => run(trip.id, () => api.proposeRiderFare(trip.id, amount), 'Your rate was sent to production')}
            />

            <Timeline trip={trip} />

            {riderShouldTrack && (
              <>
                {trackingState === 'denied' ? (
                  <p className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    Location permission is off, so production and the store can't see you.{' '}
                    <button onClick={openRiderLocationSettings} className="underline font-semibold">Open settings</button> and allow location for this app.
                  </p>
                ) : trackingState === 'error' ? (
                  <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Having trouble sharing your location - check your internet and GPS. It will keep retrying.
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" /></span>
                    {trackingState === 'active' ? 'Sharing your live location' : 'Starting location sharing...'}
                  </p>
                )}
                <LiveTripMap tripId={trip.id} pollMs={10000} height={240} />
              </>
            )}

            {trip.status === 'arrived' && !trip.readyAt && (
              <p className="mt-4 flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <Clock className="w-4 h-4 flex-shrink-0" /> Production is still getting the order ready. You'll be notified.
              </p>
            )}
            {trip.readyAt && trip.status !== 'picked_up' && (
              <p className="mt-4 flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <PackageCheck className="w-4 h-4 flex-shrink-0" /> The order is ready for pickup.
              </p>
            )}

            {(() => {
              const next = nextAction(trip);
              if (!next) return null;
              const disabled = busyId === trip.id || !!next.disabledReason;
              return (
                <button
                  onClick={() => { stopRiderAlert(); run(trip.id, () => api.advanceRiderTrip(trip.id, next.status), `Marked: ${next.label}`); }}
                  disabled={disabled}
                  className="mt-5 w-full py-4 rounded-2xl text-lg font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {busyId === trip.id ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {next.disabledReason ? next.disabledReason : next.label}
                </button>
              );
            })()}

            {(trip.status === 'on_the_way' || trip.status === 'arrived' || trip.status === 'picked_up') && (
              <p className="mt-2 text-center text-xs text-gray-500">
                {trip.status === 'picked_up'
                  ? `"Delivered" can only be marked when you are at ${dropName(trip)} (within about 200 m).`
                  : `"${trip.status === 'on_the_way' ? "I've arrived" : 'Picked up'}" can only be marked when you are at ${pickupName(trip)} (within about 200 m).`}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <Bike className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-900">No ride right now</p>
            <p className="text-sm text-gray-500 mt-1">You'll get a notification when production calls you in.</p>
          </div>
        )}

        <RiderPastRides refreshKey={trips.filter((t) => t.status === 'delivered' || t.status === 'cancelled').length} />
      </div>
    );
  }

  // ---------------------------------------------------------------- staff screen
  const renderTrip = (t: RiderTrip) => (
    <div key={t.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 flex items-center gap-2">
            <Bike className="w-4 h-4 text-orange-600" /> {t.riderName}
            <span className="text-xs font-normal text-gray-500">Ride {t.tripNumber}</span>
          </p>
          <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5 flex-wrap">
            <MapPin className="w-3.5 h-3.5" /> {routeLabel(t)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {tripTypeLabel(t)} · Fare <b>{rupees(t.fare)}</b>{t.fareStatus === 'needs_rate' ? ' (rider hasn\'t set a rate yet)' : ''}
          </p>
          {t.note && <p className="text-xs text-gray-500 mt-1">{t.note}</p>}
          {t.requestIds && t.requestIds.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">Carrying {t.requestIds.length} stock request{t.requestIds.length === 1 ? '' : 's'}</p>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_PILL[t.status]}`}>
          {statusLabel(t)}
        </span>
      </div>

      {t.fareStatus === 'proposed' && t.proposedFare && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-sm text-amber-900">
            <b>{t.riderName}</b> asks for <b>{rupees(t.proposedFare)}</b> for this ride{t.fare > 0 ? ` (default ${rupees(t.fare)})` : ''}.
            {!canDispatch && ' Waiting for production to decide.'}
          </p>
          {canDispatch && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => run(t.id, () => api.decideRiderFare(t.id, true), 'Rate approved - rider can start')}
                disabled={busyId === t.id}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve {rupees(t.proposedFare)}
              </button>
              <button
                onClick={() => run(t.id, () => api.decideRiderFare(t.id, false), t.fare > 0 ? `Kept the fare at ${rupees(t.fare)}` : 'Rate rejected')}
                disabled={busyId === t.id}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                Reject{t.fare > 0 ? ` (keep ${rupees(t.fare)})` : ''}
              </button>
            </div>
          )}
        </div>
      )}

      <Timeline trip={t} />

      {/* Production/dispatch can watch any active ride; store staff once it is on its way to them
          (or, on a store -> production ride, as soon as the rider is heading to the store). */}
      {((canDispatch && TRACKED_STATUSES.includes(t.status)) || (!canDispatch && (pickupStop(t).kind === 'store' ? TRACKED_STATUSES.includes(t.status) : t.status === 'picked_up'))) && (
        <div className="mt-4">
          <button
            onClick={() => setOpenMaps((prev) => {
              const next = new Set(prev);
              if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
              return next;
            })}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-2"
          >
            <MapIcon className="w-4 h-4" /> {openMaps.has(t.id) ? 'Hide map' : 'Track live'}
          </button>
          {openMaps.has(t.id) && <LiveTripMap tripId={t.id} pollMs={5000} />}
        </div>
      )}

      {t.status === 'delivered' && (() => {
        const last = stopsOf(t)[stopsOf(t).length - 1];
        if (t.receipt) {
          return t.receipt.status === 'confirmed' ? (
            <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Received - confirmed by {t.receipt.byName} at {fmtTime(t.receipt.at)}
              {t.receipt.requestsDelivered ? ` · ${t.receipt.requestsDelivered} stock request${t.receipt.requestsDelivered === 1 ? '' : 's'} marked delivered` : ''}
            </p>
          ) : (
            <p className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Problem reported by {t.receipt.byName}: {t.receipt.note}
            </p>
          );
        }
        if (!(canDispatch || last.kind === 'store')) return null;
        return (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-sm text-amber-900">
              Delivered to {last.name} - waiting for confirmation that it arrived properly.
              {t.requestIds && t.requestIds.length > 0 && ` Confirming also marks the ${t.requestIds.length} stock request${t.requestIds.length === 1 ? '' : 's'} delivered.`}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => run(t.id, () => api.confirmRiderReceipt(t.id, true), 'Delivery confirmed')}
                disabled={busyId === t.id}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                Confirm received
              </button>
              <button
                onClick={() => {
                  const note = window.prompt('What was wrong with the delivery? (short or missing items, damaged, late...)');
                  if (note && note.trim().length >= 3) run(t.id, () => api.confirmRiderReceipt(t.id, false, note.trim()), 'Problem reported');
                }}
                disabled={busyId === t.id}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                Report a problem
              </button>
            </div>
          </div>
        );
      })()}

      {canDispatch && (t.status === 'on_the_way' || t.status === 'arrived' || t.status === 'picked_up') && (() => {
        const next: RiderTripStatus = t.status === 'on_the_way' ? 'arrived' : t.status === 'arrived' ? 'picked_up' : 'delivered';
        const label = next === 'arrived' ? 'arrived' : next === 'picked_up' ? 'picked up' : 'delivered';
        return (
          <button
            onClick={() => {
              if (confirm(`Mark ${t.riderName} as ${label} yourself? Only use this if their phone can't - the location check is skipped.`)) {
                run(t.id, () => api.advanceRiderTrip(t.id, next, true), `Marked ${label}`);
              }
            }}
            disabled={busyId === t.id}
            className="mt-3 text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            Rider can't mark it? Confirm "{label}" for them
          </button>
        );
      })()}

      {isActive(t) && (canDispatch || pickupStop(t).kind === 'store') && (
        <div className="flex flex-wrap gap-2 mt-4">
          {!t.readyAt && t.status !== 'picked_up' && (
            <button
              onClick={() => run(t.id, () => api.markRiderTripReady(t.id), 'Marked ready for pickup - rider notified')}
              disabled={busyId === t.id}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              <PackageCheck className="w-4 h-4" /> Mark ready for pickup
            </button>
          )}
          {canDispatch && (
            <button
              onClick={() => {
                if (confirm(`Cancel ${t.riderName}'s ride (${routeLabel(t)})?`)) {
                  run(t.id, () => api.cancelRiderTrip(t.id), 'Ride cancelled');
                }
              }}
              disabled={busyId === t.id}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Cancel ride
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {header}

      {canDispatch && <MapPins />}

      {canDispatch && (
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-4 sm:p-5 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Call a rider</h3>
          {riders.length === 0 ? (
            <p className="text-sm text-gray-500">
              No riders yet. Add the rider as an employee, then set their designation to Rider in Employee Management.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ride type">
                {(Object.keys(TRIP_TYPE_LABEL) as RiderTripType[]).map((tt) => (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => setTripType(tt)}
                    className={`px-3 py-2 rounded-xl border text-sm text-left ${tripType === tt ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {TRIP_TYPE_LABEL[tt]}
                    {tt === 'round_trip' && <span className="block text-[11px] opacity-70">pick up at store, bring back</span>}
                    {tt === 'custom' && <span className="block text-[11px] opacity-70">new location, own fare</span>}
                  </button>
                ))}
              </div>

              <div>
                <p className="text-sm text-gray-700 mb-1.5">Rider</p>
                <div className="space-y-2">
                  {riders.map((r) => (
                    <button
                      key={r.employeeId}
                      type="button"
                      onClick={() => selectRider(r)}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${
                        riderId === r.employeeId
                          ? 'border-orange-500 ring-1 ring-orange-500 ' + (r.available ? 'bg-orange-50' : 'bg-red-50')
                          : r.available ? 'border-gray-200 bg-white hover:bg-gray-50' : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.available ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="min-w-0">
                          <span className="block font-medium text-gray-900 truncate">{r.name}</span>
                          {(r.aadhaarFull || r.aadhaarMasked) && <span className="block text-[11px] text-gray-400">Aadhaar {r.aadhaarFull ? r.aadhaarFull.replace(/(\d{4})(?=\d)/g, '$1 ') : r.aadhaarMasked}</span>}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className={`block text-xs font-semibold ${r.available ? 'text-emerald-700' : 'text-red-600'}`}>{r.available ? 'Available' : 'Unavailable'}</span>
                        <span className="block text-[11px] text-gray-500">
                          {r.available ? (r.defaultRate ? `${rupees(r.defaultRate)} per ride` : 'No rate set yet') : r.unavailableReason}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {tripType === 'custom' ? (
                <div className="space-y-4">
                  {(['pickup', 'drop'] as const).map((which) => {
                    const choice = which === 'pickup' ? pickupChoice : dropChoice;
                    const setChoice = which === 'pickup' ? setPickupChoice : setDropChoice;
                    const hint = places.find((pl) => pl.kind === 'production' && pl.latitude !== null);
                    return (
                      <div key={which} className="rounded-xl border border-gray-200 p-3 space-y-2">
                        <label className="text-sm text-gray-700 block">
                          {which === 'pickup' ? 'Starts at' : 'Ends at'}
                          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white">
                            <option value="">Choose...</option>
                            {places.map((pl) => (
                              <option key={`${pl.kind}:${pl.id}`} value={`${pl.kind}:${pl.id}`}>{pl.kind === 'production' ? '🏭' : '🏪'} {pl.name}</option>
                            ))}
                            <option value="custom">📍 A new location (e.g. an event stall)...</option>
                          </select>
                        </label>
                        {choice === 'custom' && (
                          <>
                            <input
                              value={customName[which]}
                              onChange={(e) => setCustomName((prev) => ({ ...prev, [which]: e.target.value }))}
                              placeholder="Name of the place, e.g. Diwali Mela stall"
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
                            />
                            <Suspense fallback={<MapPlaceholder height={240} />}>
                              <LocationPicker
                                value={customLoc[which]}
                                onChange={(loc) => setCustomLoc((prev) => ({ ...prev, [which]: loc }))}
                                centerHint={hint ? { latitude: hint.latitude as number, longitude: hint.longitude as number } : null}
                              />
                            </Suspense>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <label className="text-sm text-gray-700 block">
                  {tripType === 'to_store' ? 'Delivering to' : tripType === 'to_production' ? 'Picking up from' : 'Store (start and end of the round trip)'}
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white"
                  >
                    <option value="">Choose a store</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {openRequests.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-800">Stock requests on this ride</p>
                  <p className="text-xs text-gray-500 mb-2">When the store confirms the delivery, these are marked delivered too - the store only confirms once.</p>
                  <div className="space-y-1.5">
                    {openRequests.map((r) => {
                      const shipped = r.status === 'shipped' || r.status === 'partially-shipped';
                      return (
                        <label key={r.id} className="flex items-start gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={linkedRequestIds.has(r.id)}
                            onChange={(e) => setLinkedRequestIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id); else next.delete(r.id);
                              return next;
                            })}
                            className="mt-0.5 w-4 h-4 accent-orange-600"
                          />
                          <span>
                            Request for {new Date(r.requestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            <span className={`ml-2 text-xs ${shipped ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {shipped ? 'shipped' : `${r.status} - not shipped yet, ship it in Stock Requests first`}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-gray-700">
                  Fare for this ride (₹)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={fareInput}
                    onChange={(e) => setFareInput(e.target.value)}
                    placeholder="Rider's default rate"
                    className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">
                    {(() => {
                      const chosen = riders.find((r) => r.employeeId === riderId);
                      const base = chosen?.defaultRate ? `${chosen.name}'s default is ${rupees(chosen.defaultRate)}. ` : '';
                      return `${base}Change it for ${tripType === 'custom' ? 'this custom ride' : tripType === 'round_trip' ? 'the round trip (two legs)' : 'this ride'} if needed.`;
                    })()}
                  </span>
                </label>
                <label className="text-sm text-gray-700">
                  Note for the rider (optional)
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Extra sauces for the evening rush"
                    className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl"
                  />
                </label>
              </div>
              <button
                onClick={handleCall}
                disabled={calling}
                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bike className="w-4 h-4" />}
                Call rider now
              </button>
            </div>
          )}
        </div>
      )}

      {loadError && <p className="text-sm text-red-600 mb-3">{loadError}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">In progress</h3>
          {active.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-500 mb-6">
              No rides in progress.
            </div>
          ) : (
            <div className="space-y-3 mb-6">{active.map(renderTrip)}</div>
          )}

          {done.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Today
              </h3>
              <div className="space-y-3">{done.map(renderTrip)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
