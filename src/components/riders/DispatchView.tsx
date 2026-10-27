// Staff "Riders" (Stock / Production → Riders): who calls riders in (owner, operations manager,
// production incharge: canDispatch) and who only watches the rides coming to their store (store
// incharge). Phone: Call a rider (one primary button), rides in progress, the live map, today's
// finished rides and fares, the riders with their availability and the map pins, top to bottom.
// Desktop: rides on the left, map and riders on the right. A ride opens in a sheet with its
// timeline and actions; calling a rider is a sheet too.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike, Map as MapIcon, RefreshCw, Wallet, X } from 'lucide-react';
import type { RiderListItem, RiderPlace, RiderTrip } from '../../utils/api';
import { isAppVisible } from '../../utils/appVisibility';
import { Button } from '../ui/button';
import { FilterChips } from '../ui/chip';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { IconButton } from '../ui/icon-button';
import { ListGroup, ListRow } from '../ui/list-row';
import { formatINR } from '../ui/money';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { CallRiderSheet } from './CallRiderSheet';
import { LiveTripMap } from './LiveTripMap';
import { MapPinsRow } from './MapPinsSheet';
import { RideRow } from './RideRow';
import { TripDetailSheet } from './TripDetail';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';
import type { RiderTripsState } from './useRiderTrips';
import { canWatchLive, faresByRider, wholeRupees, type PhoneBookEntry, type RideRequest } from './tripUtils';

export type DispatchProps = {
  state: RiderTripsState;
  canDispatch: boolean;
  stores: { id: string; name: string }[];
  defaultStoreId: string | null;
  stockRequests: RideRequest[];
  people: PhoneBookEntry[];
};

export function DispatchView({ state, canDispatch, stores, defaultStoreId, stockRequests, people }: DispatchProps) {
  const rapi = useRiderApi();
  const w = useRideWords();
  const { trips, setTrips, active, done, loading, loadError, busyId, load, run } = state;

  const [riders, setRiders] = useState<RiderListItem[] | null>(null);
  const [places, setPlaces] = useState<RiderPlace[] | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [presetRiderId, setPresetRiderId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Riders and the map pins: dispatch roles only (as before). Availability changes through the
  // day, so the riders' red / green status refreshes every minute while the app is open.
  const loadPlaces = useCallback(() => { rapi.getRiderPlaces().then(setPlaces).catch(() => {}); }, [rapi]);
  useEffect(() => {
    if (!canDispatch) return;
    rapi.getRiders().then(setRiders).catch(() => setRiders((prev) => prev ?? []));
    loadPlaces();
    const interval = setInterval(() => { if (isAppVisible()) rapi.getRiders().then(setRiders).catch(() => {}); }, 60000);
    return () => clearInterval(interval);
  }, [canDispatch, rapi, loadPlaces]);

  const detailTrip = useMemo(() => trips.find((x) => x.id === detailId) || null, [trips, detailId]);
  const openDetail = (x: RiderTrip) => { setDetailId(x.id); setDetailOpen(true); };
  const openCall = (riderId: string | null) => { setPresetRiderId(riderId); setCallOpen(true); };
  const fares = useMemo(() => faresByRider(trips), [trips]);
  const watchable = useMemo(() => active.filter((x) => canWatchLive(x, canDispatch)), [active, canDispatch]);

  const rideRow = (x: RiderTrip) => (
    <RideRow
      key={x.id}
      trip={x}
      title={x.riderName}
      subtitle={`${w.route(x)} · ${w.t('rider.ride', { n: x.tripNumber })}`}
      amount={x.fare}
      struck={x.status === 'cancelled'}
      chip={w.staffChip(x, canDispatch, true)}
      onClick={() => openDetail(x)}
    />
  );

  const ridesColumn = (
    <div className="flex min-w-0 flex-col gap-6">
      <ListGroup
        title={w.t('rider.staff.inProgress')}
        meta={!loading && active.length > 0 ? String(active.length) : undefined}
        action={<IconButton icon={<RefreshCw />} label={w.t('rider.refresh')} onClick={() => load()} />}
        empty={loading
          ? <SkeletonListRows count={3} className="rounded-none border-0" />
          : <EmptyState compact icon={Bike} title={w.t('rider.staff.noneInProgress')} body={canDispatch ? w.t('rider.staff.noneInProgressBody') : undefined} />}
      >
        {loading ? null : active.map(rideRow)}
      </ListGroup>
      {loadError && <ErrorState body={loadError} onRetry={() => load()} />}

      {!loading && done.length > 0 && (
        <ListGroup title={w.t('rider.staff.doneToday')} meta={String(done.length)}>
          {done.map(rideRow)}
        </ListGroup>
      )}

      {!loading && (
        <ListGroup
          title={w.t('rider.staff.fares')}
          footer={w.t('rider.staff.faresNote')}
          empty={<p className="px-4 py-4 text-body-sm text-text-2">{w.t('rider.staff.faresEmpty')}</p>}
        >
          {fares.rows.map((r) => (
            <ListRow key={r.riderEmployeeId} icon={Wallet} title={r.riderName} subtitle={w.rides(r.rides)} amount={wholeRupees(r.fares)} />
          ))}
          {fares.rows.length > 1 && (
            <ListRow title={<span className="font-semibold">{w.t('rider.staff.total')}</span>} subtitle={w.rides(fares.rides)} amount={wholeRupees(fares.total)} />
          )}
        </ListGroup>
      )}
    </div>
  );

  const sideColumn = (
    <div className="flex min-w-0 flex-col gap-6">
      {watchable.length > 0 && <LiveMapCard trips={watchable} />}

      {canDispatch && (
        <ListGroup
          title={w.t('rider.staff.riders')}
          empty={riders === null
            ? <SkeletonListRows count={2} className="rounded-none border-0" />
            : <EmptyState compact icon={Bike} title={w.t('rider.staff.noRiders')} body={w.t('rider.staff.noRidersBody')} />}
        >
          {(riders || []).map((r) => (
            <ListRow
              key={r.employeeId}
              icon={Bike}
              iconTone={r.available ? 'neutral' : 'danger'}
              title={r.name}
              subtitle={[
                r.available ? (r.defaultRate ? w.t('rider.staff.perRide', { amount: formatINR(wholeRupees(r.defaultRate)) }) : w.t('rider.staff.noRate')) : r.unavailableReason,
                r.aadhaarFull || r.aadhaarMasked ? w.t('rider.staff.aadhaar', { n: r.aadhaarFull ? r.aadhaarFull.replace(/(\d{4})(?=\d)/g, '$1 ') : (r.aadhaarMasked as string) }) : null,
              ].filter(Boolean).join(' · ')}
              trailing={<StatusChip tone={r.available ? 'success' : 'danger'} dot>{r.available ? w.t('rider.staff.available') : w.t('rider.staff.unavailable')}</StatusChip>}
              chevron
              onClick={() => openCall(r.employeeId)}
            />
          ))}
        </ListGroup>
      )}

      {canDispatch && <MapPinsRow places={places} reload={loadPlaces} />}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pt-4 pb-6 sm:px-6 lg:max-w-[1200px] lg:px-8 lg:pt-6" lang={w.lang}>
      {canDispatch && (
        <Button size="lg" leadingIcon={<Bike />} className="w-full lg:w-auto lg:self-start" onClick={() => openCall(null)}>
          {w.t('rider.staff.callRider')}
        </Button>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {ridesColumn}
        {sideColumn}
      </div>

      {canDispatch && (
        <CallRiderSheet
          open={callOpen}
          onOpenChange={setCallOpen}
          riders={riders || []}
          places={places || []}
          stores={stores}
          defaultStoreId={defaultStoreId}
          stockRequests={stockRequests}
          presetRiderId={presetRiderId}
          onCalled={(trip) => setTrips((prev) => [trip, ...prev])}
        />
      )}
      <TripDetailSheet
        trip={detailTrip}
        open={detailOpen && !!detailTrip}
        onOpenChange={setDetailOpen}
        viewer={{ mode: 'staff', canDispatch }}
        requests={stockRequests}
        people={people}
        busy={!!detailTrip && busyId === detailTrip.id}
        run={run}
      />
    </div>
  );
}

// The live map in a card: which ride (when more than one is on the move) and the map itself,
// which loads and starts polling only after "Track live" (as the old per-ride button did).
function LiveMapCard({ trips }: { trips: RiderTrip[] }) {
  const w = useRideWords();
  const [chosen, setChosen] = useState(trips[0].id);
  const [show, setShow] = useState(false);
  const tripId = trips.some((x) => x.id === chosen) ? chosen : trips[0].id;
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="rider-live-map">
      <h2 id="rider-live-map" className="text-subtitle font-semibold text-text">{w.t('rider.map.title')}</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {trips.length > 1 && (
          <FilterChips
            aria-label={w.t('rider.map.pick')}
            value={tripId}
            onValueChange={setChosen}
            options={trips.map((x) => ({ value: x.id, label: `${x.riderName} · ${w.t('rider.ride', { n: x.tripNumber })}` }))}
          />
        )}
        {trips.length === 1 && (
          <p className="text-body-sm text-text-2"><span className="font-semibold text-text">{trips[0].riderName}</span> · {w.route(trips[0])}</p>
        )}
        {show ? (
          <>
            <LiveTripMap key={tripId} tripId={tripId} pollMs={5000} height={280} />
            <Button variant="ghost" size="sm" className="self-start" leadingIcon={<X />} onClick={() => setShow(false)}>{w.t('rider.map.hide')}</Button>
          </>
        ) : (
          <Button variant="secondary" size="md" leadingIcon={<MapIcon />} onClick={() => setShow(true)}>{w.t('rider.map.show')}</Button>
        )}
      </div>
    </section>
  );
}

