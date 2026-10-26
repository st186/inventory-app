import { CalendarRange, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import type { InsightsOverview } from '../../utils/api';
import { DAY_EFFECTS, type DayEffect } from '../../utils/forecast';
import { fmtDay, rupees } from './useInsightsOverview';

export const EFFECT_CHIP: Record<DayEffect, string> = {
  low_nonveg: 'bg-amber-100 text-amber-900',
  busy: 'bg-emerald-100 text-emerald-800',
  quiet: 'bg-slate-100 text-slate-700',
  closed: 'bg-rose-100 text-rose-800',
  normal: 'bg-gray-100 text-gray-600',
};
export const effectLabel = (e: DayEffect) => DAY_EFFECTS.find((x) => x.id === e)?.label || e;

// Next 7 days of expected sales (with chicken vs veg) and how yesterday did against its own
// forecast. Plain statistics from utils/forecast.ts - no AI involved.
export function ForecastCard({ data, loading, error }: { data: InsightsOverview | null; loading: boolean; error: string | null }) {
  const maxPieces = Math.max(1, ...(data?.forecast || []).map((f) => f.vegPieces + f.nonVegPieces));
  const y = data?.yesterday;
  const yDiff = y && y.actual !== null && y.expected?.revenue ? (y.actual - y.expected.revenue) / y.expected.revenue : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0"><CalendarRange className="w-5 h-5" /></div>
        <div>
          <h3 className="font-bold text-gray-900">Next 7 days</h3>
          <p className="text-xs text-gray-500">Expected sales from recent weeks and the festival calendar</p>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Working out the week...</div>
      ) : error ? (
        <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-3">{error}</p>
      ) : data ? (
        <>
          {y && y.actual !== null && (
            <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-gray-800">Yesterday ({fmtDay(y.date)}):</span>
              <span className="tabular-nums">{rupees(y.actual)}</span>
              <span className="text-gray-500 tabular-nums">expected {rupees(y.expected?.revenue || 0)}</span>
              {yDiff !== null && (
                <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${yDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {yDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {yDiff >= 0 ? '+' : ''}{Math.round(yDiff * 100)}%
                </span>
              )}
              {y.expected?.event && <span className={`text-xs px-2 py-0.5 rounded-full ${EFFECT_CHIP[y.expected.event.effect]}`}>{y.expected.event.name}</span>}
            </div>
          )}
          <ul className="divide-y divide-gray-100">
            {data.forecast.map((f, i) => {
              const total = f.vegPieces + f.nonVegPieces;
              return (
                <li key={f.date} className={`py-2.5 ${i === 0 ? 'bg-indigo-50/40 -mx-2 px-2 rounded-lg' : ''}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{i === 0 ? 'Today' : fmtDay(f.date)}</span>
                      {f.event && f.event.effect !== 'normal' && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${EFFECT_CHIP[f.event.effect]}`} title={effectLabel(f.event.effect)}>
                          {f.event.name}{f.event.confirmed === false ? ' ?' : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{f.revenue ? rupees(f.revenue) : '—'}</span>
                      {f.revenue > 0 && <span className="block text-[11px] text-gray-400 tabular-nums">{rupees(f.revenueLow)}–{rupees(f.revenueHigh)}</span>}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-1.5">
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex" style={{ width: `${Math.max(12, (total / maxPieces) * 100)}%` }} aria-hidden="true">
                        <div className="bg-orange-500" style={{ width: `${(f.nonVegPieces / total) * 100}%` }} />
                        <div className="bg-emerald-500" style={{ width: `${(f.vegPieces / total) * 100}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                        <span className="text-orange-700">non-veg {f.nonVegPieces}</span> (chicken {f.pieces.chicken}) · <span className="text-emerald-700">veg {f.vegPieces}</span> pcs
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">Based on {data.forecast[0]?.basis || 'recent weeks'}. Mark festivals and closed days in Trends &amp; Growth so the forecast knows about them.</p>
        </>
      ) : null}
    </div>
  );
}
