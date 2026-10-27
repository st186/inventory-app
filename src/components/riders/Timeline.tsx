import { Check } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { dropName, fmtTime, legCount, legOf, pickupName } from './tripUtils';

export function Timeline({ trip }: { trip: RiderTrip }) {
  const steps: { label: string; at: string | null }[] = [
    { label: 'Called', at: trip.calledAt },
    { label: 'On the way', at: trip.onTheWayAt },
    { label: 'Arrived', at: trip.arrivedAt },
    { label: 'Ready for pickup', at: trip.readyAt },
    { label: 'Picked up', at: trip.pickedUpAt },
    { label: 'Delivered', at: trip.deliveredAt },
  ];
  return (
    <>
    {legCount(trip) > 1 && (
      <p className="mt-3 text-xs font-semibold text-gray-600">
        Leg {legOf(trip) + 1} of {legCount(trip)}: {pickupName(trip)} → {dropName(trip)}
      </p>
    )}
    <ol className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-3">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-2 text-sm">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
              step.at ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-300'
            }`}
          >
            <Check className="w-3 h-3" />
          </span>
          <span className={step.at ? 'text-gray-900' : 'text-gray-400'}>
            {step.label}
            {step.at && <span className="text-gray-500 tabular-nums"> · {fmtTime(step.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
    </>
  );
}
