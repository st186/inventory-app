import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { getTodayIST } from '../../utils/timezone';
import { getMyChecks, type MyChecks } from './workplaceApi';
import { bnBy, bnDigits, fmt12, liveStatus, nowMinutesIST, toMin } from './workplaceUtils';

// How long before a window opens the home screen starts reminding.
const SHOW_BEFORE_MINUTES = 60;

// Home screen card while someone's workplace photos are due (from an hour before the window until
// they're all sent or the day ends): "Photos due by 4 PM · ৪টের মধ্যে ছবি দিন".
export function WorkplaceDueCard({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<MyChecks | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => getMyChecks().then((d) => { if (!cancelled) setData(d); }).catch(() => { /* offline or older server: no card */ });
    load();
    // Re-check now and then so the card appears as the window nears, and the clock moves statuses.
    const reload = setInterval(load, 10 * 60000);
    const tick = setInterval(() => setTick((n) => n + 1), 60000);
    return () => { cancelled = true; clearInterval(reload); clearInterval(tick); };
  }, []);

  if (!data?.items.length) return null;
  const today = getTodayIST();
  if (data.date !== today) return null;
  const nowMin = nowMinutesIST();
  const pending = data.items
    .filter((i) => !i.hasPhoto && i.start && nowMin >= toMin(i.start) - SHOW_BEFORE_MINUTES)
    .map((i) => ({ ...i, status: liveStatus(today, today, nowMin, i.start, i.end, false) }))
    .sort((a, b) => a.end.localeCompare(b.end));
  if (!pending.length) return null;
  const late = pending.filter((i) => i.status === 'late');
  const end = (late[0] || pending[0]).end;
  const count = pending.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <div className={`rounded-2xl border-2 p-4 shadow-sm ${late.length ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50'}`} role="alert">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center flex-shrink-0 ${late.length ? 'bg-red-600' : 'bg-orange-500'}`}><Camera className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            {late.length ? (
              <p className="font-bold text-gray-900">Photos were due by {fmt12(end)} · {bnBy(end)} ছবি দেওয়ার কথা ছিল</p>
            ) : (
              <p className="font-bold text-gray-900">Photos due by {fmt12(end)} · {bnBy(end)} ছবি দিন</p>
            )}
            <p className="text-sm text-gray-700 mt-0.5">
              {count} workplace photo{count === 1 ? '' : 's'} to send · {bnDigits(String(count))}টা ছবি বাকি
            </p>
            <button type="button" onClick={onOpen} className={`mt-3 px-4 py-2.5 rounded-xl text-white text-sm font-semibold ${late.length ? 'bg-red-600' : 'bg-orange-600'}`}>
              Take photos · ছবি তুলুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
