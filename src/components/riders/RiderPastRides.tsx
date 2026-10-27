import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock, Loader2 } from 'lucide-react';
import * as api from '../../utils/api';
import type { RiderTrip } from '../../utils/api';
import { PAST_PERIOD_LABEL, STATUS_PILL, fmtTime, istToday, pastRange, routeLabel, rupees, shiftIso, statusLabel, type PastPeriod } from './tripUtils';

export function RiderPastRides({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<PastPeriod>('today');
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: shiftIso(istToday(), -7), to: istToday() }));
  const [rides, setRides] = useState<RiderTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => pastRange(period, custom), [period, custom]);

  useEffect(() => {
    if (!open || !range) return;
    let cancelled = false;
    setLoading(true);
    api.getRiderTripsRange(range.from, range.to)
      .then((list) => { if (!cancelled) { setRides(list.filter((t) => t.status === 'delivered' || t.status === 'cancelled')); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load past rides'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, range, refreshKey]);

  const delivered = rides.filter((t) => t.status === 'delivered');
  const earned = delivered.reduce((sum, t) => sum + (t.fare || 0), 0);
  const cancelled = rides.length - delivered.length;
  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /> Past rides</span>
        <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="flex flex-wrap gap-2 mt-3">
            {(Object.keys(PAST_PERIOD_LABEL) as PastPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${period === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {PAST_PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input type="date" aria-label="From date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
              <span className="text-sm text-gray-500">to</span>
              <input type="date" aria-label="To date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
            </div>
          )}

          {!range ? (
            <p className="text-sm text-gray-500 mt-4">Pick a start and end date.</p>
          ) : loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>
          ) : error ? (
            <p className="text-sm text-red-600 mt-4">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Rides</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{delivered.length}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-gray-600">Earned</p>
                  <p className="text-lg font-bold text-emerald-700 tabular-nums">{rupees(earned)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Cancelled</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{cancelled}</p>
                </div>
              </div>
              {rides.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No rides in this period.</p>
              ) : (
                <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                  {rides.map((t) => (
                    <div key={t.id} className="border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{routeLabel(t)}</p>
                        <p className="text-xs text-gray-500">
                          {dayLabel(t.date)} · Ride {t.tripNumber}
                          {t.status === 'delivered' ? ` · Delivered ${fmtTime(t.deliveredAt)}` : ` · Cancelled ${fmtTime(t.cancelledAt)}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-semibold tabular-nums ${t.status === 'delivered' ? 'text-emerald-700' : 'text-gray-400 line-through'}`}>{rupees(t.fare)}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_PILL[t.status]}`}>{statusLabel(t)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
