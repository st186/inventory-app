import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../ui/icon-button';
import { Callout } from '../ui/callout';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';
import { formatMonth } from '../team/shared';
import * as kpi from './kpiApi';

// Pieces shared by Team KPIs and My KPIs. A score is green from 80, amber from 60, red below,
// and always printed as a number next to the bar (colour never carries it alone).

export type ScoreTone = 'success' | 'warning' | 'danger' | 'neutral';
export const scoreToneOf = (s: number | null): ScoreTone => (s === null ? 'neutral' : s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger');
const TEXT: Record<ScoreTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text-3' };
const BAR: Record<ScoreTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-surface-3' };

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const { t, lang } = useT();
  const current = kpi.istMonth();
  const next = (() => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  })();
  return (
    <div className="inline-flex items-center rounded-full border border-border-strong bg-surface">
      <IconButton label={t('date.prevMonth')} icon={<ChevronLeft />} onClick={() => onChange(kpi.prevMonth(month))} />
      <span className="min-w-[124px] px-1 text-center text-body-sm font-semibold text-text">{formatMonth(month, lang)}</span>
      <IconButton label={t('date.nextMonth')} icon={<ChevronRight />} onClick={() => onChange(next)} disabled={next > current} />
    </div>
  );
}

export function TotalBadge({ total }: { total: number | null }) {
  const { t } = useT();
  return (
    <div className="flex shrink-0 flex-col items-end">
      <p className={cn('num text-title-lg font-semibold', TEXT[scoreToneOf(total)])}>{total === null ? '–' : Math.round(total)}</p>
      <p className="text-caption text-text-3">{t('team.kpi.outOf100')}</p>
    </div>
  );
}

// One bar per KPI with its score, weight and the plain explanation of the numbers.
export function KpiBars({ kpis, showTips = false, compact = false }: { kpis: kpi.KpiResult[]; showTips?: boolean; compact?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-3.5">
      {kpis
        .filter((k) => k.weight > 0 || k.score !== null)
        .map((k) => {
          const tone = scoreToneOf(k.score);
          return (
            <div key={k.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body-sm font-medium text-text">
                  {k.label} <span className="text-caption font-normal text-text-3">· {t('team.kpi.weight', { n: k.weight })}</span>
                </p>
                <p className={cn('num text-body-sm font-semibold', TEXT[tone])}>{k.score === null ? t('team.kpi.noData') : Math.round(k.score)}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${k.label}: ${k.score === null ? t('team.kpi.noData') : Math.round(k.score)}`}>
                <div className={cn('h-full rounded-full', BAR[tone])} style={{ width: `${k.score ?? 0}%` }} />
              </div>
              {!compact && <p className="text-label text-text-2">{k.explanation}</p>}
              {showTips && k.score !== null && k.score < 90 && <p className="text-label text-text">{t('team.kpi.toImprove', { tip: k.tip })}</p>}
            </div>
          );
        })}
    </div>
  );
}

export function FlagList({ flags }: { flags: Record<string, number> }) {
  const { t } = useT();
  const list = Object.entries(flags || {}).filter(([, n]) => n > 0);
  if (!list.length) return null;
  return (
    <Callout tone="warning" title={t('team.kpi.checkIns')}>
      {list.map(([f, n]) => `${n} × ${kpi.FLAG_TEXT[f] || f}`).join(' · ')}
    </Callout>
  );
}
