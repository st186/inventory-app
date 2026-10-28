// Rider Home: the current ride first - where from and where to, what's in it, the fare, whether
// the phone is sharing its location, and the one big button for the ride's next step.
import { ChevronRight, Clock, Locate, LocateFixed, LocateOff, MapPinned, PackageCheck, TriangleAlert } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import type { TrackingState } from '../../utils/riderTracking';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { StatusChip } from '../ui/status-chip';
import { RiderFareBlock } from './RiderFareBlock';
import { RideLoad } from './RideLoad';
import { StopList, type StopItem } from './StopList';
import { useRideWords, type RideWords } from './rideWords';
import { contactForStop, dropStop, legCount, legOf, nextRiderStep, pickupStop, stopsOf, type PhoneBookEntry, type RideRequest } from './tripUtils';

/** The sharing state as a chip: green while sharing, red with "turn on" when permission is off. */
export function LocationChip({ state, onOpenSettings }: { state: TrackingState | null; onOpenSettings: () => void }) {
  const w = useRideWords();
  if (state === 'denied') {
    return (
      <button type="button" onClick={onOpenSettings} className="hit-44 relative inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <StatusChip tone="danger" icon={LocateOff}>{w.t('rider.loc.off')}</StatusChip>
      </button>
    );
  }
  if (state === 'error') return <StatusChip tone="warning" icon={TriangleAlert}>{w.t('rider.loc.trouble')}</StatusChip>;
  if (state === 'active') return <StatusChip tone="success" icon={LocateFixed}>{w.t('rider.loc.sharing')}</StatusChip>;
  return <StatusChip tone="neutral" icon={Locate}>{w.t('rider.loc.starting')}</StatusChip>;
}

/** "Delivered" can only be marked at the drop (within about 200 m), and so on. */
export function stepHint(trip: RiderTrip, w: RideWords): string | null {
  if (trip.status === 'picked_up') return w.t('rider.step.hintDeliver', { place: w.drop(trip) });
  if (trip.status === 'on_the_way') return w.t('rider.step.hintAt', { step: w.stepLabel('arrived'), place: w.pickup(trip) });
  if (trip.status === 'arrived') return w.t('rider.step.hintAt', { step: w.stepLabel('picked_up'), place: w.pickup(trip) });
  return null;
}

/** The current leg (from, to) and, on a longer ride, the stops after it. */
export function legStops(trip: RiderTrip, w: RideWords, people: PhoneBookEntry[]): StopItem[] {
  const stops = stopsOf(trip);
  const leg = legOf(trip);
  const items: StopItem[] = [
    { stop: pickupStop(trip), label: w.t('rider.from'), contact: contactForStop(pickupStop(trip), people) },
    { stop: dropStop(trip), label: w.t('rider.to'), contact: contactForStop(dropStop(trip), people) },
  ];
  for (const later of stops.slice(leg + 2)) items.push({ stop: later, label: w.t('rider.then'), contact: contactForStop(later, people), muted: true });
  return items;
}

export function NextStepButton({ trip, busy, onStep }: { trip: RiderTrip; busy: boolean; onStep: (trip: RiderTrip) => void }) {
  const w = useRideWords();
  const next = nextRiderStep(trip);
  if (!next) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" fullWidth loading={busy} disabled={!!next.reason} onClick={() => onStep(trip)} className="whitespace-normal">
        {next.reason ? w.reason(next.reason) : w.stepLabel(next.status)}
      </Button>
      {stepHint(trip, w) && <p className="text-center text-label text-text-3">{stepHint(trip, w)}</p>}
    </div>
  );
}

export function CurrentRideCard({ trip, requests, people, busy, trackingState, shouldTrack, onStep, onPropose, onOpenSettings, onOpenDetails }: {
  trip: RiderTrip;
  requests: RideRequest[];
  people: PhoneBookEntry[];
  busy: boolean;
  trackingState: TrackingState | null;
  shouldTrack: boolean;
  onStep: (trip: RiderTrip) => void;
  onPropose: (amount: number) => void;
  onOpenSettings: () => void;
  onOpenDetails: () => void;
}) {
  const w = useRideWords();
  const chip = w.chip(trip);
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" aria-label={w.t('rider.ride', { n: trip.tripNumber })}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-label font-medium text-text-2">
            {w.t('rider.ride', { n: trip.tripNumber })}
            {legCount(trip) > 1 && ` · ${w.t('rider.legOf', { n: legOf(trip) + 1, total: legCount(trip) })}`}
          </span>
          <span className="text-caption text-text-3">{w.t('rider.calledBy', { name: trip.calledByName, time: w.time(trip.calledAt) })}</span>
        </div>
        <StatusChip tone={chip.tone} icon={chip.icon}>{chip.label}</StatusChip>
      </div>

      <StopList items={legStops(trip, w, people)} />

      <RideLoad trip={trip} requests={requests} />

      <RiderFareBlock key={`${trip.id}-${trip.fareStatus}`} trip={trip} busy={busy} onPropose={onPropose} />

      {trip.status === 'arrived' && !trip.readyAt && <Callout tone="warning" icon={Clock} title={w.t('rider.notReady')} />}
      {trip.readyAt && trip.status !== 'picked_up' && <Callout tone="success" icon={PackageCheck} title={w.t('rider.ready')} />}

      {shouldTrack && (
        <div className="flex flex-col gap-2">
          <LocationChip state={trackingState} onOpenSettings={onOpenSettings} />
          {trackingState === 'denied' && <p className="text-label text-text-2">{w.t('rider.loc.offBody')}</p>}
          {trackingState === 'error' && <p className="text-label text-text-2">{w.t('rider.loc.troubleBody')}</p>}
        </div>
      )}

      <NextStepButton trip={trip} busy={busy} onStep={onStep} />

      <Button variant="secondary" size="md" fullWidth leadingIcon={<MapPinned />} trailingIcon={<ChevronRight />} onClick={onOpenDetails}>
        {shouldTrack ? w.t('rider.details') : w.t('rider.detailsShort')}
      </Button>
    </article>
  );
}
