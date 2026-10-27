// One ride in full, for a sheet (phones) or dialog (desktop): where it goes, what it carries, the
// fare, the live map while it is on the move, the timeline, and the actions the viewer may take.
//   rider  - their current ride's next-step button; past rides read-only
//   staff  - fare decision, mark ready, confirm received / report a problem, confirm a step for
//            the rider, cancel - each exactly where the old screen allowed it
// useTripDetail returns the pieces so a sheet that already shows a list can swap to a ride and
// back (no sheet on a sheet); TripDetailSheet is the stand-alone sheet.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, IndianRupee, Map as MapIcon, PackageCheck, Phone, X } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { confirm, promptText } from '../ui/confirm';
import { IconButton } from '../ui/icon-button';
import { Money, formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { LiveTripMap } from './LiveTripMap';
import { LocationChip, NextStepButton, legStops } from './CurrentRideCard';
import { RideLoad } from './RideLoad';
import { StopList } from './StopList';
import { Timeline } from './Timeline';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';
import type { TrackingState } from '../../utils/riderTracking';
import {
  canWatchLive, contactForRider, isActive, isTracked, lastStop, overrideStepOf, pickupStop, stopsOf, wholeRupees,
  type PhoneBookEntry, type RideRequest,
} from './tripUtils';

type Run = (id: string, action: () => Promise<RiderTrip>, success: string) => Promise<boolean>;

export type TripViewer =
  | { mode: 'rider'; current: boolean; trackingState: TrackingState | null; onStep: (trip: RiderTrip) => void; onOpenSettings: () => void }
  | { mode: 'staff'; canDispatch: boolean };

export type TripDetailProps = {
  trip: RiderTrip;
  viewer: TripViewer;
  requests: RideRequest[];
  people: PhoneBookEntry[];
  busy: boolean;
  run: Run;
};

const rupee = (n: number | null | undefined) => formatINR(wholeRupees(n));

export function useTripDetail({ trip, viewer, requests, people, busy, run }: TripDetailProps): { title: string; description: string; body: ReactNode; footer: ReactNode } {
  const w = useRideWords();
  const rapi = useRiderApi();
  const [showMap, setShowMap] = useState(false);
  const chip = viewer.mode === 'staff' ? w.staffChip(trip, viewer.canDispatch) : w.chip(trip);
  const canDispatch = viewer.mode === 'staff' && viewer.canDispatch;
  const riderPhone = viewer.mode === 'staff' ? contactForRider(trip.riderEmployeeId, people) : null;

  const title = viewer.mode === 'staff' ? `${trip.riderName} · ${w.t('rider.ride', { n: trip.tripNumber })}` : w.t('rider.ride', { n: trip.tripNumber });
  const description = `${w.tripType(trip)} · ${w.day(trip.date)}`;

  // ---- staff actions (same calls and the same conditions as before)
  const decideFare = (approve: boolean) => run(trip.id, () => rapi.decideRiderFare(trip.id, approve),
    approve ? w.t('rider.staff.approvedToast') : trip.fare > 0 ? w.t('rider.staff.keptToast', { amount: rupee(trip.fare) }) : w.t('rider.staff.rejectedToast'));
  const confirmReceived = () => run(trip.id, () => rapi.confirmRiderReceipt(trip.id, true), w.t('rider.staff.confirmedToast'));
  const reportProblem = async () => {
    const note = await promptText({
      title: w.t('rider.staff.problemTitle'),
      label: w.t('rider.staff.problemLabel'),
      helper: w.t('rider.staff.problemHelper'),
      multiline: true,
      required: true,
      confirmLabel: w.t('rider.staff.reportProblem'),
      tone: 'danger',
      validate: (v) => (v.trim().length >= 3 ? null : w.t('rider.staff.problemTooShort')),
    });
    if (note && note.trim().length >= 3) run(trip.id, () => rapi.confirmRiderReceipt(trip.id, false, note.trim()), w.t('rider.staff.problemToast'));
  };
  const overrideStep = overrideStepOf(trip);
  const confirmForRider = async () => {
    if (!overrideStep) return;
    const word = w.stepWord(overrideStep);
    const ok = await confirm({
      title: w.t('rider.staff.overrideTitle', { name: trip.riderName, step: word }),
      body: w.t('rider.staff.overrideBody'),
      confirmLabel: w.t('rider.staff.overrideConfirm', { step: word }),
    });
    if (ok) run(trip.id, () => rapi.advanceRiderTrip(trip.id, overrideStep, true), w.t('rider.staff.overrideToast', { step: word }));
  };
  const markReady = () => run(trip.id, () => rapi.markRiderTripReady(trip.id), w.t('rider.staff.readyToast'));
  const cancelRide = async () => {
    const ok = await confirm({
      title: w.t('rider.staff.cancelTitle', { name: trip.riderName }),
      body: w.route(trip),
      confirmLabel: w.t('rider.staff.cancel'),
      cancelLabel: w.t('rider.staff.cancelKeep'),
      tone: 'danger',
    });
    if (ok) run(trip.id, () => rapi.cancelRiderTrip(trip.id), w.t('rider.staff.cancelledToast'));
  };

  const last = lastStop(trip);
  const awaitingReceipt = viewer.mode === 'staff' && trip.status === 'delivered' && !trip.receipt && (canDispatch || last.kind === 'store');
  const canReadyOrCancel = viewer.mode === 'staff' && isActive(trip) && (canDispatch || pickupStop(trip).kind === 'store');
  const canMarkReady = canReadyOrCancel && !trip.readyAt && trip.status !== 'picked_up';
  const canCancel = canReadyOrCancel && canDispatch;
  const watch = viewer.mode === 'staff' ? canWatchLive(trip, viewer.canDispatch) : viewer.current && isTracked(trip);

  const body = (
    <div className="flex flex-col gap-5 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={chip.tone} icon={chip.icon}>{chip.label}</StatusChip>
        {viewer.mode === 'rider' && viewer.current && isTracked(trip) && <LocationChip state={viewer.trackingState} onOpenSettings={viewer.onOpenSettings} />}
      </div>

      {viewer.mode === 'staff' && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-label text-text-3">{w.t('rider.staff.rider')}</span>
            <span className="text-subtitle font-semibold text-text">{trip.riderName}</span>
          </span>
          {riderPhone && <IconButton variant="secondary" icon={<Phone />} label={w.t('rider.call', { name: riderPhone.name })} href={`tel:${riderPhone.phone}`} />}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface px-4 py-2">
        <StopList items={viewer.mode === 'rider' && viewer.current
          ? legStops(trip, w, people)
          : stopsOf(trip).map((stop, i, all) => ({ stop, label: i === 0 ? w.t('rider.from') : i === all.length - 1 ? w.t('rider.to') : w.t('rider.via') }))} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex min-h-11 items-center gap-3 text-body-sm text-text-2">
          <IndianRupee className="size-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{w.t('rider.fare')}</span>
          {trip.fareStatus === 'needs_rate' && trip.status === 'called'
            ? <span className="text-label text-text-3">{w.t('rider.fare.notAgreed')}</span>
            : <Money value={wholeRupees(trip.fare)} className="text-subtitle font-semibold text-text" />}
        </p>
        <RideLoad trip={trip} requests={requests} />
      </div>

      {viewer.mode === 'staff' && trip.fareStatus === 'proposed' && !!trip.proposedFare && (
        <Callout
          tone="warning"
          title={trip.fare > 0
            ? w.t('rider.staff.asksDefault', { name: trip.riderName, amount: rupee(trip.proposedFare), fare: rupee(trip.fare) })
            : w.t('rider.staff.asks', { name: trip.riderName, amount: rupee(trip.proposedFare) })}
          action={canDispatch ? (
            <>
              <Button variant="secondary" size="sm" loading={busy} onClick={() => decideFare(true)}>{w.t('rider.staff.approve', { amount: rupee(trip.proposedFare) })}</Button>
              <Button variant="danger-ghost" size="sm" disabled={busy} onClick={() => decideFare(false)}>
                {trip.fare > 0 ? w.t('rider.staff.rejectKeep', { amount: rupee(trip.fare) }) : w.t('rider.staff.reject')}
              </Button>
            </>
          ) : undefined}
        >
          {!canDispatch ? w.t('rider.staff.waitDecision') : undefined}
        </Callout>
      )}

      {viewer.mode === 'staff' && trip.status === 'delivered' && trip.receipt && (trip.receipt.status === 'confirmed' ? (
        <Callout tone="success" icon={CheckCircle2} title={w.t('rider.staff.received', { name: trip.receipt.byName, time: w.time(trip.receipt.at) })}>
          {trip.receipt.requestsDelivered ? w.plural(trip.receipt.requestsDelivered, 'rider.staff.receivedReq1', 'rider.staff.receivedReqN') : undefined}
        </Callout>
      ) : (
        <Callout tone="danger" icon={AlertTriangle} title={w.t('rider.staff.problemBy', { name: trip.receipt.byName })}>{trip.receipt.note}</Callout>
      ))}
      {awaitingReceipt && (
        <Callout tone="warning" icon={PackageCheck} title={w.t('rider.staff.awaitConfirm', { place: w.name(last) })}>
          {trip.requestIds && trip.requestIds.length > 0 ? w.t('rider.staff.awaitConfirmReq') : undefined}
        </Callout>
      )}

      {watch && (viewer.mode === 'rider' ? (
        <LiveTripMap tripId={trip.id} pollMs={10000} height={240} />
      ) : showMap ? (
        <div className="flex flex-col gap-2">
          <LiveTripMap tripId={trip.id} pollMs={5000} height={260} />
          <Button variant="ghost" size="sm" className="self-start" leadingIcon={<X />} onClick={() => setShowMap(false)}>{w.t('rider.map.hide')}</Button>
        </div>
      ) : (
        <Button variant="secondary" size="md" leadingIcon={<MapIcon />} onClick={() => setShowMap(true)}>{w.t('rider.map.show')}</Button>
      ))}

      <Timeline trip={trip} />

      {canDispatch && overrideStep && (
        <Button variant="link" size="sm" className="min-h-11 self-start text-text-2" disabled={busy} onClick={confirmForRider}>
          {w.t('rider.staff.override', { step: w.stepWord(overrideStep) })}
        </Button>
      )}
    </div>
  );

  let footer: ReactNode = null;
  if (viewer.mode === 'rider' && viewer.current) {
    footer = <div className="flex-1"><NextStepButton trip={trip} busy={busy} onStep={viewer.onStep} /></div>;
  } else if (awaitingReceipt) {
    footer = (
      <>
        <Button variant="danger-ghost" size="lg" disabled={busy} onClick={reportProblem}>{w.t('rider.staff.reportProblem')}</Button>
        <Button size="lg" className="flex-1" loading={busy} onClick={confirmReceived}>{w.t('rider.staff.confirmReceived')}</Button>
      </>
    );
  } else if (canMarkReady || canCancel) {
    footer = (
      <>
        {canCancel && <Button variant="danger-ghost" size="lg" leadingIcon={<X />} disabled={busy} onClick={cancelRide}>{w.t('rider.staff.cancel')}</Button>}
        {canMarkReady && <Button size="lg" className="flex-1" leadingIcon={<PackageCheck />} loading={busy} onClick={markReady}>{w.t('rider.staff.markReady')}</Button>}
      </>
    );
  }

  return { title, description, body, footer };
}

export function TripDetailSheet({ trip, open, onOpenChange, ...rest }: Omit<TripDetailProps, 'trip'> & { trip: RiderTrip | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!trip) return <ResponsiveModal open={false} onOpenChange={onOpenChange} title="" />;
  return <TripDetailSheetInner key={trip.id} trip={trip} open={open} onOpenChange={onOpenChange} {...rest} />;
}

function TripDetailSheetInner({ open, onOpenChange, ...props }: TripDetailProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const detail = useTripDetail(props);
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={detail.title} description={detail.description} size="detail" footer={detail.footer}>
      {detail.body}
    </ResponsiveModal>
  );
}

