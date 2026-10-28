// A ride's steps with the time each happened, as a short vertical list. Done steps carry a check
// in a success dot; steps still to come are a hollow circle.
import { Check } from 'lucide-react';
import type { RiderTrip } from '../../utils/api';
import { cn } from '../ui/utils';
import { useRideWords } from './rideWords';
import { legCount, legOf } from './tripUtils';

export function Timeline({ trip }: { trip: RiderTrip }) {
  const w = useRideWords();
  const steps: { label: string; at: string | null }[] = [
    { label: w.t('rider.tl.called'), at: trip.calledAt },
    { label: w.t('rider.tl.onTheWay'), at: trip.onTheWayAt },
    { label: w.t('rider.tl.arrived'), at: trip.arrivedAt },
    { label: w.t('rider.tl.ready'), at: trip.readyAt },
    { label: w.t('rider.tl.pickedUp'), at: trip.pickedUpAt },
    { label: w.t('rider.tl.delivered'), at: trip.deliveredAt },
  ];
  return (
    <section className="flex flex-col gap-2" aria-label={w.t('rider.tl.title')}>
      <h3 className="text-label font-medium text-text-2">{w.t('rider.tl.title')}</h3>
      {legCount(trip) > 1 && (
        <p className="text-label font-medium text-text">
          {w.t('rider.tl.leg', { n: legOf(trip) + 1, total: legCount(trip), from: w.pickup(trip), to: w.drop(trip) })}
        </p>
      )}
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={step.label} className="relative flex min-h-9 items-center gap-3">
            {i < steps.length - 1 && (
              <span aria-hidden="true" className={cn('absolute top-7 left-[11px] h-[calc(100%-20px)] w-0.5', step.at && steps[i + 1].at ? 'bg-success-border' : 'bg-border')} />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border',
                step.at ? 'border-success bg-success text-on-primary' : 'border-border-strong bg-surface',
              )}
            >
              {step.at && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className={cn('flex min-w-0 flex-1 items-baseline justify-between gap-3 text-body-sm', step.at ? 'text-text' : 'text-text-3')}>
              <span>{step.label}</span>
              {step.at && <span className="num shrink-0 text-label text-text-2">{w.time(step.at)}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
