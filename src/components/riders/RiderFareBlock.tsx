// Rider: the fare for a ride. The default comes from the rider profile; before accepting, the
// rider can ask for a different rate, and production has to approve it before the ride can start.
import { useState, type ReactNode } from 'react';
import { IndianRupee } from 'lucide-react';
import { toast } from '../ui/sonner';
import type { RiderTrip } from '../../utils/api';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Field } from '../ui/field';
import { Money, MoneyInput, formatINR } from '../ui/money';
import { useRideWords } from './rideWords';
import { wholeRupees } from './tripUtils';

export function RiderFareBlock({ trip, onPropose, busy }: { trip: RiderTrip; onPropose: (amount: number) => void; busy: boolean }) {
  const w = useRideWords();
  const [editing, setEditing] = useState(trip.fareStatus === 'needs_rate');
  const [amount, setAmount] = useState(trip.fare > 0 ? String(trip.fare) : '');

  const fareRow = (label: string, action?: ReactNode) => (
    <div className="flex min-h-11 items-center gap-3">
      <IndianRupee className="size-5 shrink-0 text-text-2" aria-hidden="true" />
      <span className="flex-1 text-body-sm text-text-2">{label}</span>
      {(trip.status !== 'called' || trip.fareStatus !== 'needs_rate') && <Money value={wholeRupees(trip.fare)} className="text-subtitle font-semibold text-text" />}
      {action}
    </div>
  );

  if (trip.status !== 'called') return fareRow(w.t('rider.fare'));
  if (trip.fareStatus === 'proposed') {
    return (
      <Callout tone="warning" title={trip.fare > 0
        ? w.t('rider.fare.askedInstead', { amount: formatINR(wholeRupees(trip.proposedFare)), fare: formatINR(wholeRupees(trip.fare)) })
        : w.t('rider.fare.asked', { amount: formatINR(wholeRupees(trip.proposedFare)) })}>
        {w.t('rider.fare.waiting')}
      </Callout>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {trip.fareStatus === 'needs_rate'
        ? fareRow(w.t('rider.fare.enter'))
        : fareRow(w.t('rider.fare.this'), !editing && (
          <Button variant="link" size="sm" className="min-h-11" onClick={() => setEditing(true)}>{w.t('rider.fare.change')}</Button>
        ))}
      {(editing || trip.fareStatus === 'needs_rate') && (
        <div className="flex items-end gap-2">
          <Field label={w.t('rider.fare.rateLabel')} className="min-w-0 flex-1">
            <MoneyInput value={amount} decimals={0} onValueChange={(_n, raw) => setAmount(raw)} />
          </Field>
          <Button
            variant="secondary"
            size="md"
            className="h-12"
            loading={busy}
            onClick={() => { const n = Number(amount); if (n > 0) onPropose(n); else toast.error(w.t('rider.fare.needAmount')); }}
          >
            {w.t('rider.fare.send')}
          </Button>
        </div>
      )}
    </div>
  );
}
