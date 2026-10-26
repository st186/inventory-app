import { useMemo } from 'react';
import { BarChart3, Leaf, PartyPopper, Loader2 } from 'lucide-react';
import { FORECAST_TYPES, WEEKDAY_SHORT, addDaysISO, weekdayOf } from '../../utils/forecast';
import { EFFECT_CHIP, effectLabel } from './ForecastCard';
import { FestivalCalendar } from './FestivalCalendar';
import { ForecastAccuracy } from './ForecastAccuracy';
import { GrowthIdeas } from './GrowthIdeas';
import { useInsightsOverview, fmtDay, rupees } from './useInsightsOverview';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

// "Trends & Growth" Analytics tab: weekday pattern, veg vs non-veg by week, item mix change,
// how festival days went, how good the forecast has been, the festival calendar, and AI growth ideas.
export function TrendsGrowth({ accessToken, storeId, canManage }: { accessToken: string; storeId: string | null; canManage: boolean }) {
  const { data, loading, error, reload } = useInsightsOverview(accessToken, storeId);

  const stats = useMemo(() => {
    if (!data) return null;
    const events = new Map(data.events.map((e) => [e.date, e]));
    const normal = data.history.filter((d) => (d.revenue || 0) > 0 && !events.get(d.date));
    const since8w = addDaysISO(data.today, -56);
    const weekday = WEEKDAY_SHORT.map((label, wd) => {
      const vals = normal.filter((d) => d.date >= since8w && weekdayOf(d.date) === wd).map((d) => d.revenue!);
      return { label, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, n: vals.length };
    });
    // Monday-start weeks, last 8.
    const weeks = new Map<string, { revenue: number; nonVeg: number; veg: number; chicken: number; days: number }>();
    for (const d of data.history) {
      if (d.date < since8w) continue;
      const wk = addDaysISO(d.date, -((weekdayOf(d.date) + 6) % 7));
      const w = weeks.get(wk) || { revenue: 0, nonVeg: 0, veg: 0, chicken: 0, days: 0 };
      w.revenue += d.revenue || 0;
      if ((d.revenue || 0) > 0) w.days += 1;
      for (const t of FORECAST_TYPES) {
        const n = d.pieces?.[t.key] || 0;
        if (t.veg) w.veg += n; else w.nonVeg += n;
        if (t.key === 'chicken') w.chicken += n;
      }
      weeks.set(wk, w);
    }
    // Item mix: last 4 weeks against the 4 before.
    const sum = (from: string, to: string) => {
      const out: Record<string, number> = {};
      for (const d of data.history) if (d.date >= from && d.date < to) for (const t of FORECAST_TYPES) out[t.key] = (out[t.key] || 0) + (d.pieces?.[t.key] || 0);
      return out;
    };
    const recent = sum(addDaysISO(data.today, -28), data.today);
    const before = sum(addDaysISO(data.today, -56), addDaysISO(data.today, -28));
    const mix = FORECAST_TYPES.map((t) => ({ ...t, recent: recent[t.key] || 0, before: before[t.key] || 0, change: before[t.key] ? (recent[t.key] - before[t.key]) / before[t.key] : null }));
    const festivals = Object.values(data.learned).flatMap((l) => l.samples.map((s) => ({ ...s, effect: l.effect }))).sort((a, b) => b.date.localeCompare(a.date));
    return { weekday, weeks: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)), mix, festivals };
  }, [data]);

  if (loading && !data) return <div className="flex items-center justify-center gap-2 py-12 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading trends...</div>;
  if (error) return <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-4">{error}</p>;
  if (!data || !stats) return null;

  const maxWd = Math.max(1, ...stats.weekday.map((w) => w.avg));
  const card = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-5 h-5 text-indigo-600" /><h3 className="font-bold text-gray-900">Average sales by weekday</h3></div>
          <p className="text-xs text-gray-500 mb-3">Last 8 weeks, normal open days only (festival and closed days left out)</p>
          <ul className="space-y-2">
            {stats.weekday.map((w) => (
              <li key={w.label} className="flex items-center gap-3 text-sm">
                <span className="w-9 text-gray-600">{w.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden"><div className="h-full bg-indigo-500 rounded-md" style={{ width: `${(w.avg / maxWd) * 100}%` }} /></div>
                <span className="w-20 text-right font-semibold tabular-nums">{w.avg ? rupees(w.avg) : '—'}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <div className="flex items-center gap-2 mb-3"><Leaf className="w-5 h-5 text-emerald-600" /><h3 className="font-bold text-gray-900">Non-veg vs veg by week</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 text-left"><th className="py-1 pr-2 font-medium">Week of</th><th className="py-1 px-2 font-medium text-right">Sales</th><th className="py-1 px-2 font-medium text-right">Chicken</th><th className="py-1 pl-2 font-medium text-right">Veg share</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {stats.weeks.map(([wk, w]) => {
                  const total = w.nonVeg + w.veg;
                  return (
                    <tr key={wk}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDay(wk)}{w.days < 7 ? <span className="text-[11px] text-gray-400"> · {w.days}d</span> : null}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{rupees(w.revenue)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{w.chicken.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{total ? `${Math.round((w.veg / total) * 100)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className="font-bold text-gray-900 mb-1">Item mix: last 4 weeks vs the 4 before</h3>
          <p className="text-xs text-gray-500 mb-3">Momos sold per type</p>
          <ul className="divide-y divide-gray-100">
            {stats.mix.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${m.veg ? 'bg-emerald-500' : 'bg-orange-500'}`} />{m.label}</span>
                <span className="tabular-nums text-gray-700">{m.recent.toLocaleString('en-IN')} <span className="text-gray-400">vs {m.before.toLocaleString('en-IN')}</span>
                  {m.change !== null && <span className={`ml-2 font-semibold ${m.change >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{m.change >= 0 ? '+' : ''}{Math.round(m.change * 100)}%</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <div className="flex items-center gap-2 mb-1"><PartyPopper className="w-5 h-5 text-amber-600" /><h3 className="font-bold text-gray-900">How festival days went</h3></div>
          <p className="text-xs text-gray-500 mb-3">Against a normal day of the same weekday. The forecast uses these to plan the next one.</p>
          {stats.festivals.length === 0 ? (
            <p className="text-sm text-gray-500">No past festival days marked yet - add them in the calendar below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 text-left"><th className="py-1 pr-2 font-medium">Day</th><th className="py-1 px-2 font-medium text-right">Sales</th><th className="py-1 px-2 font-medium text-right">Non-veg</th><th className="py-1 pl-2 font-medium text-right">Veg</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.festivals.map((f) => (
                    <tr key={f.date}>
                      <td className="py-1.5 pr-2"><span className="whitespace-nowrap">{fmtDay(f.date)} · {f.name}</span> <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${EFFECT_CHIP[f.effect]}`}>{effectLabel(f.effect)}</span></td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{pct(f.revenueRatio)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{pct(f.nonVegRatio)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{pct(f.vegRatio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ForecastAccuracy accuracy={data.accuracy} />
      <FestivalCalendar accessToken={accessToken} events={data.events} canManage={canManage} onChanged={reload} />
      <GrowthIdeas accessToken={accessToken} storeId={storeId} canManage={canManage} />
    </div>
  );
}
