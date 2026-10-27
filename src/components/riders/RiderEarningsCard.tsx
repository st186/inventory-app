import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import * as api from '../../utils/api';
import type { RiderSummary } from '../../utils/api';
import { isAppVisible } from '../../utils/appVisibility';
import { rupees } from './tripUtils';

// Rider dashboard payment card: what delivered rides have earned and how much has been paid.
export function RiderEarningsCard({ deliveredCount }: { deliveredCount: number }) {
  const [summary, setSummary] = useState<RiderSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => api.getRiderSummary().then((r) => { if (!cancelled) setSummary(r); }).catch(() => {});
    fetchOnce();
    const interval = setInterval(() => { if (isAppVisible()) fetchOnce(); }, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [deliveredCount]);

  if (!summary) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="w-4 h-4 text-emerald-600" />
        <h3 className="font-semibold text-gray-900">Payments</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs text-gray-600">Earned today</p>
          <p className="text-xl font-bold text-emerald-700 tabular-nums">{rupees(summary.today.earned)}</p>
          <p className="text-[11px] text-gray-500">{summary.today.rides} ride{summary.today.rides === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-600">Earned this month</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{rupees(summary.month.earned)}</p>
          <p className="text-[11px] text-gray-500">{summary.month.rides} ride{summary.month.rides === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-600">Paid this month</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{rupees(summary.month.paid)}</p>
        </div>
        <div className={`rounded-xl p-3 ${summary.month.balance > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <p className="text-xs text-gray-600">Still to be paid</p>
          <p className={`text-xl font-bold tabular-nums ${summary.month.balance > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{rupees(Math.max(0, summary.month.balance))}</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Earnings are the fares of delivered rides. Past payouts are under My Payouts.</p>
    </div>
  );
}
