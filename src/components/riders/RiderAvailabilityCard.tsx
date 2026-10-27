import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as api from '../../utils/api';
import { isAppVisible } from '../../utils/appVisibility';

// Rider: available according to the schedule in My Profile, unless they mark themselves
// unavailable here. Production sees the same status (red when unavailable) when calling riders.
export function RiderAvailabilityCard() {
  const [info, setInfo] = useState<api.RiderProfileResponse | null>(null);
  const [duration, setDuration] = useState<api.RiderUnavailableFor>('rest_of_day');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api.getRiderProfile().then(setInfo).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const interval = setInterval(() => { if (isAppVisible()) load(); }, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (!info) return null;
  const until = info.profile.unavailableUntil;
  const manual = until === 'indefinite' || (!!until && new Date(until).getTime() > Date.now());

  const change = async (unavailable: boolean) => {
    setBusy(true);
    try {
      await api.setRiderAvailability({ unavailable, duration: unavailable ? duration : undefined });
      toast.success(unavailable ? 'You are marked unavailable - production can see this' : 'You are available again');
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update your availability');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-4 mb-5 ${info.available ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold flex items-center gap-2 ${info.available ? 'text-emerald-800' : 'text-red-800'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${info.available ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {info.available ? "You're available" : "You're unavailable"}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {info.available ? 'Following the hours in your profile.' : info.unavailableReason}
          </p>
        </div>
        {manual ? (
          <button onClick={() => change(false)} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
            I'm available again
          </button>
        ) : info.available ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={duration} onChange={(e) => setDuration(e.target.value as api.RiderUnavailableFor)} className="px-2 py-2 border border-gray-300 rounded-lg bg-white text-sm" aria-label="How long">
              <option value="hour">For 1 hour</option>
              <option value="three_hours">For 3 hours</option>
              <option value="rest_of_day">Rest of today</option>
              <option value="until_back">Until I switch back</option>
            </select>
            <button onClick={() => change(true)} disabled={busy} className="px-3 py-2 rounded-xl text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50">
              Go unavailable
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500 max-w-[10rem] text-right">Change your hours in My Profile.</p>
        )}
      </div>
    </div>
  );
}
