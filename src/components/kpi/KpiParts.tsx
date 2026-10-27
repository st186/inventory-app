import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as kpi from './kpiApi';

// Pieces shared by Team KPIs and My KPIs.

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = kpi.istMonth();
  const next = (() => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; })();
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
      <button onClick={() => onChange(kpi.prevMonth(month))} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
      <span className="px-2 text-sm font-semibold text-gray-900 min-w-[120px] text-center">{kpi.monthName(month)}</span>
      <button onClick={() => onChange(next)} disabled={next > current} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

export function TotalBadge({ total }: { total: number | null }) {
  return (
    <div className="text-right">
      <p className={`text-2xl font-bold tabular-nums ${kpi.scoreText(total)}`}>{total === null ? '--' : Math.round(total)}</p>
      <p className="text-[11px] text-gray-500">out of 100</p>
    </div>
  );
}

// One bar per KPI with its score, weight and the plain explanation of the numbers.
export function KpiBars({ kpis, showTips = false, compact = false }: { kpis: kpi.KpiResult[]; showTips?: boolean; compact?: boolean }) {
  return (
    <div className="space-y-3">
      {kpis.filter((k) => k.weight > 0 || k.score !== null).map((k) => (
        <div key={k.id}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">{k.label} <span className="text-[11px] text-gray-400 font-normal">· weight {k.weight}</span></p>
            <p className={`text-sm font-semibold tabular-nums ${kpi.scoreText(k.score)}`}>{k.score === null ? 'no data' : Math.round(k.score)}</p>
          </div>
          <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
            <div className={`h-full rounded-full ${kpi.scoreTone(k.score)}`} style={{ width: `${k.score ?? 0}%` }} />
          </div>
          {!compact && <p className="text-xs text-gray-600 mt-1">{k.explanation}</p>}
          {showTips && k.score !== null && k.score < 90 && <p className="text-xs text-orange-700 mt-0.5">To improve: {k.tip}</p>}
        </div>
      ))}
    </div>
  );
}

export function FlagList({ flags }: { flags: Record<string, number> }) {
  const list = Object.entries(flags || {}).filter(([, n]) => n > 0);
  if (!list.length) return null;
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
      Check-ins to look at: {list.map(([f, n]) => `${n} × ${kpi.FLAG_TEXT[f] || f}`).join(' · ')}
    </div>
  );
}
