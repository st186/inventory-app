import { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import type { RiderTrip } from '../../utils/api';
import { rupees } from './tripUtils';

// Rider: the fare for a ride waiting for them. The default comes from My Profile; they can ask for
// a different rate before accepting, and production has to approve it before the ride can start.
export function RiderFareBlock({ trip, onPropose, busy }: { trip: RiderTrip; onPropose: (amount: number) => void; busy: boolean }) {
  const [editing, setEditing] = useState(trip.fareStatus === 'needs_rate');
  const [amount, setAmount] = useState(trip.fare > 0 ? String(trip.fare) : '');

  if (trip.status !== 'called') {
    return <p className="mt-3 text-sm text-gray-700 flex items-center gap-1.5"><IndianRupee className="w-4 h-4 text-emerald-600" /> Fare <b>{rupees(trip.fare)}</b></p>;
  }
  if (trip.fareStatus === 'proposed') {
    return (
      <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        You asked for <b>{rupees(trip.proposedFare)}</b>{trip.fare > 0 ? ` (instead of ${rupees(trip.fare)})` : ''}. Waiting for production to approve it - you'll be notified.
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-700 flex items-center gap-1.5">
          <IndianRupee className="w-4 h-4 text-emerald-600" />
          {trip.fareStatus === 'needs_rate' ? 'Enter your rate for this ride' : <>Fare for this ride <b>{rupees(trip.fare)}</b></>}
        </p>
        {trip.fareStatus === 'agreed' && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-orange-700 underline">Change rate</button>
        )}
      </div>
      {(editing || trip.fareStatus === 'needs_rate') && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Rate in ₹"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg bg-white"
          />
          <button
            onClick={() => { const n = Number(amount); if (n > 0) onPropose(n); else toast.error('Enter a rate in rupees'); }}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 flex-shrink-0"
          >
            Send to production
          </button>
        </div>
      )}
    </div>
  );
}
