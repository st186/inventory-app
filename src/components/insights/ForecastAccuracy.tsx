import { Target } from 'lucide-react';
import type { ForecastAccuracy as Accuracy } from '../../utils/api';
import { fmtDay, rupees } from './useInsightsOverview';

// "How good is the forecast?" - each past day forecast again from what was known before it and
// compared with what sold (server insights.ts forecastCheck, forecast.ts backtest).

const pctText = (x: number | null) => (x === null ? '—' : `±${Math.round(x * 100)}%`);
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
const biasText = (b: number | null) =>
  b === null ? '—' : Math.abs(b) < 0.03 ? 'On target' : `${Math.abs(Math.round(b * 100))}% ${b > 0 ? 'high' : 'low'}`;
// Green when most days land close, amber when it's rough, red when it's far off.
const missTone = (x: number | null) =>
  x === null ? 'text-text-3' : x <= 0.12 ? 'text-success' : x <= 0.2 ? 'text-warning' : 'text-danger';

export function ForecastAccuracy({ accuracy }: { accuracy?: Accuracy }) {
  const card = 'bg-surface rounded-lg border border-border p-4 sm:p-5';
  if (!accuracy) return null;
  const { last28, weeks, misses, tuned, settings, tuningGain } = accuracy;
  const within = last28.within15 === null ? null : Math.round(last28.within15 * last28.days);

  return (
    <div className={card}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-info-soft text-info flex items-center justify-center flex-shrink-0"><Target className="w-5 h-5" /></div>
        <div>
          <h3 className="font-bold text-text">How good is the forecast?</h3>
          <p className="text-xs text-text-3">Every past day forecast again using only what was known the morning before, then checked against what actually sold</p>
        </div>
      </div>

      {last28.days === 0 ? (
        <p className="text-sm text-text-3">Not enough sales history yet to check it.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-caption text-text-3">Typical miss, last 4 weeks</p>
              <p className={`text-xl font-bold tabular-nums ${missTone(last28.typicalMiss)}`}>{pctText(last28.typicalMiss)}</p>
              <p className="text-caption text-text-3">half the days were closer</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-caption text-text-3">Days within ±15%</p>
              <p className="text-xl font-bold tabular-nums text-text">{within ?? '—'} <span className="text-sm font-medium text-text-3">of {last28.days}</span></p>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-caption text-text-3">Tends to run</p>
              <p className="text-xl font-bold text-text">{biasText(last28.bias)}</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-caption text-text-3">Momo count miss</p>
              <p className={`text-xl font-bold tabular-nums ${missTone(last28.piecesTypicalMiss)}`}>{pctText(last28.piecesTypicalMiss)}</p>
              <p className="text-caption text-text-3">what production plans from</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-text-2 mb-1">Week by week - is it getting better?</p>
              <ul className="divide-y divide-border">
                {weeks.map((w) => (
                  <li key={w.week} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-body-sm text-text">Week of {fmtDay(w.week)}{w.days < 6 ? ` · ${w.days} days` : ''}</span>
                      <span className="block text-caption text-text-3">Within ±15%: {w.within15 === null ? '—' : `${Math.round(w.within15 * w.days)} of ${w.days}`} · {biasText(w.bias)}</span>
                    </span>
                    <span className={`num shrink-0 text-right text-body-sm font-semibold ${missTone(w.typicalMiss)}`}>{pctText(w.typicalMiss)}<span className="block text-caption font-normal text-text-3">typical miss</span></span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-text-2 mb-1">Biggest misses, last 4 weeks</p>
              {misses.length === 0 ? (
                <p className="text-sm text-text-3 py-2">No day missed by more than 25%.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {misses.map((m) => (
                    <li key={m.date} className="py-1.5 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-text">{fmtDay(m.date)}</span>
                        <span className="tabular-nums text-text-2">expected {rupees(m.forecast)}, sold {rupees(m.actual)} <span className={`font-semibold ${m.error > 0 ? 'text-warning' : 'text-info'}`}>{signed(m.error)}</span></span>
                      </div>
                      <p className="text-caption text-text-3">
                        {m.eventName ? `Marked as ${m.eventName}` : 'Not in the calendar'}{m.stockedOut ? ' · something ran out' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {misses.some((m) => !m.eventName) && (
                <p className="text-caption text-info mt-1.5">If one of these was a festival, rain or a closed day, add it to the calendar below - the forecast learns how such days go and plans the next one better.</p>
              )}
            </div>
          </div>

          <p className="text-caption text-text-3 mt-3 border-t border-border pt-2">
            {tuned
              ? `Self-tuned today: leans ${Math.round(settings.recentWeight * 100)}% on the last 4 weeks and follows ${Math.round(settings.levelStrength * 100)}% of the recent up/down trend - that would have cut the misses by ${Math.round(tuningGain * 100)} points over the last 8 weeks.`
              : 'Re-tuned every day against the last 8 weeks: the current settings are still the best of the 16 it tries.'}
            {' '}Festival days you add teach it how those days go.
          </p>
        </>
      )}
    </div>
  );
}
