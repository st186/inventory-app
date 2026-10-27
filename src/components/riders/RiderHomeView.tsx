// Rider Home (design review b4, wireframe CrewHome): the current ride first - from, to, what's in
// it, the one big button for its next step, the live-location chip and call buttons - then
// whatever Home adds (profile, shift), availability, today's earnings, the ride-alert set-up on
// Android and today's finished rides. No header of its own: the shell's top bar is above.
import { useMemo, useState, type ReactNode } from 'react';
import { BellRing, Bike, ChevronRight, RefreshCw } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { IconButton } from '../ui/icon-button';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Skeleton } from '../ui/skeleton';
import { CurrentRideCard } from './CurrentRideCard';
import { RideRow } from './RideRow';
import { RiderAlertSetup } from './RiderAlertSetup';
import { RiderAvailability } from './RiderAvailability';
import { RiderEarningsTiles } from './RiderEarnings';
import { RiderTripsPanel, type TripsTab } from './RiderTripsPanel';
import { TripDetailSheet, useTripDetail } from './TripDetail';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';
import { useRideAlert, useRideTracking, type RiderTripsState } from './useRiderTrips';
import { nextRiderStep, type PhoneBookEntry, type RideRequest } from './tripUtils';

export type RiderHomeProps = {
  state: RiderTripsState;
  requests: RideRequest[];
  people: PhoneBookEntry[];
  /** Rows Home adds under the current ride (profile, shift card). */
  homeSlot?: ReactNode;
  /** Opens the Trips tab when the shell has one; otherwise Home opens Trips in a sheet. */
  onOpenTrips?: (tab: TripsTab) => void;
  /** Opens the rider profile (to change the hours). */
  onOpenProfile?: () => void;
};

export function RiderHomeView({ state, requests, people, homeSlot, onOpenTrips, onOpenProfile }: RiderHomeProps) {
  const w = useRideWords();
  const rapi = useRiderApi();
  const { trips, active, done, loading, loadError, busyId, load, run, maxTrips, todaysCount } = state;
  const trip = active[0];
  const alert = useRideAlert(true, trips, loading);
  const tracking = useRideTracking(true, trip, load);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tripsSheet, setTripsSheet] = useState<TripsTab | null>(null);
  const [sheetTrip, setSheetTrip] = useState<RiderTrip | null>(null);

  const deliveredCount = trips.filter((x) => x.status === 'delivered').length;
  const finishedCount = trips.filter((x) => x.status === 'delivered' || x.status === 'cancelled').length;
  const detailTrip = useMemo(() => trips.find((x) => x.id === detailId) || null, [trips, detailId]);

  const step = (x: RiderTrip) => {
    const next = nextRiderStep(x);
    if (!next || next.reason) return;
    rapi.stopAlert();
    run(x.id, () => rapi.advanceRiderTrip(x.id, next.status), w.t('rider.step.marked', { step: w.stepLabel(next.status) }));
  };
  const openTrips = (tab: TripsTab) => (onOpenTrips ? onOpenTrips(tab) : setTripsSheet(tab));
  const openDetail = (x: RiderTrip) => { setDetailId(x.id); setDetailOpen(true); };

  const viewerFor = (x: RiderTrip | null) => ({
    mode: 'rider' as const,
    current: !!trip && !!x && x.id === trip.id,
    trackingState: tracking.state,
    onStep: step,
    onOpenSettings: rapi.openLocationSettings,
  });

  return (
    <div className="flex flex-col gap-6">
      {alert.ringing && (
        <Callout
          tone="danger"
          live
          icon={BellRing}
          title={w.t('rider.ringing.title')}
          action={<Button variant="danger" size="md" onClick={alert.silence}>{w.t('rider.ringing.silence')}</Button>}
        >
          {w.t('rider.ringing.body')}
        </Callout>
      )}

      <section className="flex flex-col gap-2.5" aria-labelledby="rider-current">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <h2 id="rider-current" className="text-subtitle font-semibold text-text">{w.t('rider.home.current')}</h2>
            {!loading && <span className="num text-label text-text-3">{w.t('rider.home.ridesToday', { n: todaysCount, max: maxTrips })}</span>}
          </div>
          <IconButton icon={<RefreshCw />} label={w.t('rider.refresh')} onClick={() => load()} />
        </div>
        {loading ? (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" role="status" aria-label={w.t('common.loading')}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        ) : loadError && trips.length === 0 ? (
          <ErrorState body={loadError} onRetry={() => load()} />
        ) : trip ? (
          <>
            {loadError && <ErrorState body={loadError} onRetry={() => load()} />}
            <CurrentRideCard
              trip={trip}
              requests={requests}
              people={people}
              busy={busyId === trip.id}
              trackingState={tracking.state}
              shouldTrack={tracking.shouldTrack}
              onStep={step}
              onPropose={(amount) => run(trip.id, () => rapi.proposeRiderFare(trip.id, amount), w.t('rider.fare.sent'))}
              onOpenSettings={rapi.openLocationSettings}
              onOpenDetails={() => openDetail(trip)}
            />
          </>
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState compact icon={Bike} title={w.t('rider.none.title')} body={w.t('rider.none.body')} />
          </div>
        )}
      </section>

      {homeSlot}

      <RiderAvailability onOpenProfile={onOpenProfile} />

      <section className="flex flex-col gap-2.5" aria-labelledby="rider-earnings">
        <h2 id="rider-earnings" className="text-subtitle font-semibold text-text">{w.t('rider.earn.title')}</h2>
        <RiderEarningsTiles deliveredCount={deliveredCount} onOpen={() => openTrips('payments')} />
      </section>

      <RiderAlertSetup />

      <ListGroup
        title={w.t('rider.recent.title')}
        action={<Button variant="link" size="sm" className="min-h-11" trailingIcon={<ChevronRight />} onClick={() => openTrips('history')}>{w.t('rider.recent.all')}</Button>}
        empty={loading ? <Skeleton className="m-4 h-10" /> : <p className="px-4 py-4 text-body-sm text-text-2">{w.t('rider.recent.empty')}</p>}
      >
        {done.map((x) => (
          <RideRow
            key={x.id}
            trip={x}
            subtitle={`${w.t('rider.ride', { n: x.tripNumber })} · ${w.time(x.status === 'delivered' ? x.deliveredAt : x.cancelledAt)}`}
            amount={x.fare}
            struck={x.status !== 'delivered'}
            onClick={() => openDetail(x)}
          />
        ))}
      </ListGroup>

      <TripDetailSheet
        trip={detailTrip}
        open={detailOpen && !!detailTrip}
        onOpenChange={setDetailOpen}
        viewer={viewerFor(detailTrip)}
        requests={requests}
        people={people}
        busy={!!detailTrip && busyId === detailTrip.id}
        run={run}
      />

      {!onOpenTrips && (
        <TripsSheet
          tab={tripsSheet}
          onClose={() => { setTripsSheet(null); setSheetTrip(null); }}
          trip={sheetTrip}
          onOpenTrip={setSheetTrip}
          onBack={() => setSheetTrip(null)}
          refreshKey={finishedCount}
          deliveredCount={deliveredCount}
          requests={requests}
          people={people}
          run={run}
          busyId={busyId}
        />
      )}
    </div>
  );
}

// All rides and payments in one sheet; a ride opens in the same sheet with a back arrow.
function TripsSheet({ tab, onClose, trip, onOpenTrip, onBack, refreshKey, deliveredCount, requests, people, run, busyId }: {
  tab: TripsTab | null;
  onClose: () => void;
  trip: RiderTrip | null;
  onOpenTrip: (trip: RiderTrip) => void;
  onBack: () => void;
  refreshKey: number;
  deliveredCount: number;
  requests: RideRequest[];
  people: PhoneBookEntry[];
  run: RiderTripsState['run'];
  busyId: string | null;
}) {
  const w = useRideWords();
  return (
    <ResponsiveModal
      open={tab !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={trip ? w.t('rider.ride', { n: trip.tripNumber }) : w.t('rider.trips.title')}
      size="detail"
      // A steady height while the period changes (the list grows and shrinks).
      bodyClassName="min-h-[70dvh] md:min-h-[60dvh]"
      onBack={trip ? onBack : undefined}
    >
      {trip ? (
        <SheetTrip trip={trip} requests={requests} people={people} run={run} busy={busyId === trip.id} />
      ) : tab ? (
        <RiderTripsPanel inSheet initialTab={tab} refreshKey={refreshKey} deliveredCount={deliveredCount} onOpenTrip={onOpenTrip} />
      ) : null}
    </ResponsiveModal>
  );
}

function SheetTrip({ trip, requests, people, run, busy }: { trip: RiderTrip; requests: RideRequest[]; people: PhoneBookEntry[]; run: RiderTripsState['run']; busy: boolean }) {
  const rapi = useRiderApi();
  const detail = useTripDetail({
    trip,
    viewer: { mode: 'rider', current: false, trackingState: null, onStep: () => undefined, onOpenSettings: rapi.openLocationSettings },
    requests,
    people,
    busy,
    run,
  });
  return (
    <>
      <p className="mb-4 text-body-sm text-text-2">{detail.description}</p>
      {detail.body}
    </>
  );
}
