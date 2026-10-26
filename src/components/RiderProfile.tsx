import { useCallback, useEffect, useState } from 'react';
import { Clock, IndianRupee, Loader2, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import type { RiderDaySchedule, RiderWeekSchedule } from '../utils/api';

const DAYS: { key: keyof RiderWeekSchedule; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const DEFAULT_DAY: RiderDaySchedule = { enabled: true, from: '09:00', to: '21:00' };

const emptyWeek = (): RiderWeekSchedule =>
  Object.fromEntries(DAYS.map((d) => [d.key, { ...DEFAULT_DAY }])) as RiderWeekSchedule;

// 123412341234 -> "1234 1234 1234"
const groupAadhaar = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

// The rider's own profile: name, Aadhaar, the rate they want for one complete ride (the default
// for every ride, which they can still change per ride before accepting), and the hours they are
// available each day. Production sees a rider as unavailable outside these hours.
export function RiderProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [rate, setRate] = useState('');
  const [week, setWeek] = useState<RiderWeekSchedule>(emptyWeek());
  const [status, setStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getRiderProfile();
      setName(data.profile.name || '');
      setAadhaar((data.profile.aadhaar || '').replace(/\D/g, ''));
      setRate(data.profile.defaultRate ? String(data.profile.defaultRate) : '');
      setWeek({ ...emptyWeek(), ...(data.profile.availability || {}) } as RiderWeekSchedule);
      setStatus({ available: data.available, reason: data.unavailableReason });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setDay = (key: keyof RiderWeekSchedule, patch: Partial<RiderDaySchedule>) =>
    setWeek((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const copyMondayToAll = () => setWeek((prev) => Object.fromEntries(DAYS.map((d) => [d.key, { ...prev.mon }])) as RiderWeekSchedule);

  const save = async () => {
    if (name.trim().length < 2) { toast.error('Enter your full name'); return; }
    if (aadhaar && aadhaar.length !== 12) { toast.error('Aadhaar number must be 12 digits'); return; }
    const rateNumber = rate === '' ? null : Number(rate);
    if (rateNumber !== null && (!isFinite(rateNumber) || rateNumber < 0)) { toast.error('Enter a valid rate per ride'); return; }
    for (const d of DAYS) {
      const day = week[d.key];
      if (day.enabled && day.from >= day.to) { toast.error(`${d.label}: the end time must be after the start time`); return; }
    }
    setSaving(true);
    try {
      await api.saveRiderProfile({ name: name.trim(), aadhaar, defaultRate: rateNumber, availability: week });
      toast.success('Profile saved');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
          <User className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">My profile</h2>
          {status && (
            <p className={`text-sm font-medium ${status.available ? 'text-emerald-700' : 'text-red-600'}`}>
              {status.available ? 'Available right now' : `Unavailable: ${status.reason}`}
            </p>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-5 space-y-4">
        <label className="block text-sm text-gray-700">
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl" autoComplete="name" />
        </label>
        <label className="block text-sm text-gray-700">
          Aadhaar number
          <input
            value={groupAadhaar(aadhaar)}
            onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
            inputMode="numeric"
            placeholder="1234 5678 9012"
            className="mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-xl tabular-nums tracking-wide"
          />
          <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Production only sees the last 4 digits.
          </span>
        </label>
        <label className="block text-sm text-gray-700">
          Your rate for one complete ride (₹)
          <div className="relative mt-1">
            <IndianRupee className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="e.g. 300"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl tabular-nums"
            />
          </div>
          <span className="mt-1 block text-xs text-gray-500">
            Used as the fare for every ride. Before you accept a ride you can ask for a different rate - production has to approve it.
          </span>
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-orange-600" /> When I'm available</h3>
          <button onClick={copyMondayToAll} className="text-xs font-semibold text-orange-700 underline">Copy Monday to all days</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">You show as available during these hours. You can still mark yourself unavailable from My Rides.</p>
        <div className="space-y-2">
          {DAYS.map((d) => {
            const day = week[d.key];
            return (
              <div key={d.key} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2">
                <label className="flex items-center gap-2 w-28 flex-shrink-0 text-sm font-medium text-gray-900">
                  <input type="checkbox" checked={day.enabled} onChange={(e) => setDay(d.key, { enabled: e.target.checked })} className="w-4 h-4 accent-orange-600" />
                  {d.label.slice(0, 3)}
                </label>
                {day.enabled ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <input type="time" value={day.from} onChange={(e) => setDay(d.key, { from: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" aria-label={`${d.label} from`} />
                    <span className="text-xs text-gray-500">to</span>
                    <input type="time" value={day.to} onChange={(e) => setDay(d.key, { to: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" aria-label={`${d.label} to`} />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Day off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save profile
      </button>
    </div>
  );
}
