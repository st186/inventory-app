// What a ride carries ("Carrying 6 bags · 280 momos · 1 stock request") and the note from
// whoever called the rider.
import { MessageSquareText, Package } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { useRideWords } from './rideWords';
import { loadOf, type RideRequest } from './tripUtils';

export function RideLoad({ trip, requests }: { trip: RiderTrip; requests: RideRequest[] }) {
  const w = useRideWords();
  const load = loadOf(trip, requests);
  if (!load && !trip.note) return null;
  const parts: string[] = [];
  if (load) {
    if (load.bags !== null) parts.push(w.plural(load.bags, 'rider.load.bag1', 'rider.load.bags'));
    if (load.boxes !== null && load.boxes > 0) parts.push(w.plural(load.boxes, 'rider.load.box1', 'rider.load.boxes'));
    if (load.momos !== null) parts.push(w.t('rider.load.momos', { n: load.momos.toLocaleString('en-IN') }));
    parts.push(w.plural(load.requests, 'rider.load.request1', 'rider.load.requestsN'));
  }
  return (
    <div className="flex flex-col gap-2">
      {load && (
        <p className="flex items-start gap-3 text-body-sm text-text">
          <Package className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden="true" />
          <span className="min-w-0">
            <span className="text-text-2">{w.t('rider.load.title')} </span>
            <span className="num font-semibold">{parts.join(' · ')}</span>
          </span>
        </p>
      )}
      {trip.note && (
        <p className="flex items-start gap-3 text-body-sm text-text">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden="true" />
          <span className="min-w-0 break-words">{trip.note}</span>
        </p>
      )}
    </div>
  );
}
