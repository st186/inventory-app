import { useEffect, useState } from 'react';
import { Loader2, Target } from 'lucide-react';
import * as kpi from './kpiApi';
import { FlagList, KpiBars, MonthPicker, TotalBadge } from './KpiParts';
import { ShiftClockCard } from './ShiftClockCard';

// "My KPIs": the signed-in person's own month so far - each score, the numbers behind it and what
// would improve it. Money only when the owner has switched that on. The check-in card sits on top
// so the "check in?" notification lands somewhere useful.
export function MyKpis() {
  const [month, setMonth] = useState(kpi.istMonth());
  const [data, setData] = useState<kpi.MyKpisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    kpi.getMyKpis(month)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load your KPIs'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const k = data?.kpis;
  const weakest = k ? [...k.kpis].filter((x) => x.score !== null && x.weight > 0).sort((a, b) => (a.score! - b.score!) || b.weight - a.weight).slice(0, 2) : [];

  return (
    <div data-ai-private>
      <ShiftClockCard />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Target className="w-6 h-6 text-orange-600" /> My KPIs</h1>
          <MonthPicker month={month} onChange={setMonth} />
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-orange-600" /></div>
        ) : error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>
        ) : !data?.required || !k ? (
          <p className="text-sm text-gray-500">KPIs are for staff logins.</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">{data.roleLabel} · shift {kpi.hhmm12(data.settings.shiftStart)} - {kpi.hhmm12(data.settings.shiftEnd)} ({data.settings.graceMin} min grace)</p>
                  <p className="text-sm text-gray-500">Weekly off: {data.settings.weeklyOff.length ? data.settings.weeklyOff.map((d) => kpi.WEEKDAYS[d]).join(', ') : 'not set'}</p>
                  <p className="text-xs text-gray-400 mt-1">{k.from ? `Counted ${k.from} to ${k.to}` : 'No days counted yet this month.'}</p>
                </div>
                <TotalBadge total={k.total} />
              </div>
              {k.notes.length > 0 && <ul className="mt-2 text-xs text-gray-500 list-disc pl-4">{k.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              {data.money && (
                <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">
                  {data.money.approved !== null
                    ? `Variable pay approved: ${kpi.rupees(data.money.approved)} of ${kpi.rupees(data.money.max)}`
                    : `At this score the formula gives ${kpi.rupees(data.money.estimate)} of ${kpi.rupees(data.money.max)} (the owner decides the final amount).`}
                </div>
              )}
              {data.reviewed && !data.money && <p className="mt-3 text-xs text-emerald-700">The owner has reviewed this month.</p>}
            </div>

            {weakest.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-orange-900">Biggest wins for next time</p>
                <ul className="mt-1 text-sm text-orange-900 list-disc pl-5 space-y-1">{weakest.map((w) => <li key={w.id}><b>{w.label}:</b> {w.tip}</li>)}</ul>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
              <KpiBars kpis={k.kpis} showTips />
              <div className="mt-4"><FlagList flags={k.flags} /></div>
              <p className="text-[11px] text-gray-400 mt-3">The total is the weighted average of the scores that have data. Scores update every day up to yesterday.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
