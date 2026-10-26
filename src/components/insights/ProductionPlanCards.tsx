import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ShoppingBasket, Loader2 } from 'lucide-react';
import * as api from '../../utils/api';
import { FORECAST_TYPES, purchaseList, roundUpToBag, type ForecastDay, type MomoKey } from '../../utils/forecast';
import { EFFECT_CHIP } from './ForecastCard';
import { fmtDay, rupees } from './useInsightsOverview';

const BUFFER = 0.15;

// The production house's week, from the forecast of every store it supplies: bags needed at the
// store each day (expected sales + 15%), and the raw material to buy today for tomorrow's batch.
export function ProductionPlanCards({ accessToken, storeIds }: { accessToken: string; storeIds: string[] }) {
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = storeIds.join(',');

  useEffect(() => {
    if (!storeIds.length) return;
    let cancelled = false;
    Promise.all(storeIds.map((id) => api.getInsightsOverview(accessToken, id)))
      .then((list) => {
        if (cancelled) return;
        // Sum the stores day by day.
        const base = list[0].forecast.map((f) => ({ ...f, pieces: { ...f.pieces } }));
        for (const ov of list.slice(1)) ov.forecast.forEach((f, i) => {
          if (!base[i]) return;
          for (const t of FORECAST_TYPES) base[i].pieces[t.key] += f.pieces[t.key];
        });
        setDays(base);
      })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load the plan'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, key]);

  const plan = useMemo(() => (days || []).map((d) => {
    const need = {} as Record<MomoKey, number>;
    for (const t of FORECAST_TYPES) need[t.key] = roundUpToBag(Math.round(d.pieces[t.key] * (1 + BUFFER)), t.bag);
    return { day: d, need };
  }), [days]);

  const tomorrow = plan[1];
  const shopping = useMemo(() => (tomorrow ? purchaseList(tomorrow.need) : []), [tomorrow]);
  const shoppingTotal = shopping.reduce((t, r) => t + r.amount, 0);
  const card = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5';

  if (!storeIds.length) return null;
  if (error) return <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-3">{error}</p>;
  if (!days) return <div className={`${card} flex items-center justify-center gap-2 text-sm text-gray-500`}><Loader2 className="w-4 h-4 animate-spin" /> Working out this week's plan...</div>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className={`${card} xl:col-span-2`}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0"><ClipboardList className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-gray-900">This week's plan</h3>
            <p className="text-xs text-gray-500">Bags the store is expected to need each day (sales forecast + 15%). Make each day's bags the day before.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 text-left">
                <th className="py-1 pr-2 font-medium">Day</th>
                {FORECAST_TYPES.map((t) => <th key={t.key} className="py-1 px-1.5 font-medium text-right whitespace-nowrap">{t.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plan.map(({ day, need }, i) => (
                <tr key={day.date} className={i === 1 ? 'bg-orange-50/60' : ''}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span className="font-medium">{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : fmtDay(day.date)}</span>
                    {day.event && day.event.effect !== 'normal' && <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${EFFECT_CHIP[day.event.effect]}`}>{day.event.name}</span>}
                  </td>
                  {FORECAST_TYPES.map((t) => (
                    <td key={t.key} className="py-1.5 px-1.5 text-right tabular-nums">
                      {need[t.key] ? <><span className="font-semibold">{need[t.key] / t.bag}</span><span className="text-[11px] text-gray-400"> ({need[t.key]})</span></> : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">Numbers are bags (pieces in brackets): chicken bags of 50, others 20. Tomorrow's row is what to make today. Check the freezer before making - stock already there comes off.</p>
      </div>

      <div className={card}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><ShoppingBasket className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-gray-900">Buy today</h3>
            <p className="text-xs text-gray-500">Raw material for tomorrow's bags{tomorrow ? ` (${fmtDay(tomorrow.day.date)})` : ''}</p>
          </div>
        </div>
        {shopping.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing needed for tomorrow.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {shopping.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="text-gray-800">{r.label}</span>
                  <span className="tabular-nums"><span className="font-semibold">{r.kg} kg</span> <span className="text-gray-400 text-xs">≈ {rupees(r.amount)}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-semibold text-gray-900 flex justify-between"><span>About</span><span className="tabular-nums">{rupees(shoppingTotal)}</span></p>
          </>
        )}
        <p className="mt-2 text-[11px] text-gray-400">From the recipe costing (provisional until the trial batches). Take off what's already in stock; chicken is usable weight, so buy a little extra for trimming.</p>
      </div>
    </div>
  );
}
