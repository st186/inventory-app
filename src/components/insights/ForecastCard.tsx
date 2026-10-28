import { CalendarRange, TrendingDown, TrendingUp } from 'lucide-react';
import type { InsightsOverview } from '../../utils/api';
import { DAY_EFFECTS, type DayEffect } from '../../utils/forecast';
import { useT, type I18nKey } from '../../utils/i18n';
import { ListGroup, ListRow } from '../ui/list-row';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { SkeletonListRows } from '../ui/skeleton';
import { formatCompactINR } from '../ui/money';
import { cn } from '../ui/utils';
import { fmtDay, rupees } from './useInsightsOverview';

/** Chip classes for a day's calendar effect (also used by Trends and the festival calendar). */
export const EFFECT_CHIP: Record<DayEffect, string> = {
  low_nonveg: 'border border-warning-border bg-warning-soft text-warning',
  busy: 'border border-success-border bg-success-soft text-success',
  quiet: 'border border-border bg-surface-2 text-text-2',
  closed: 'border border-danger-border bg-danger-soft text-danger',
  normal: 'border border-border bg-surface-2 text-text-2',
};
export const effectLabel = (e: DayEffect) => DAY_EFFECTS.find((x) => x.id === e)?.label || e;

function EffectChip({ effect, name, unsure }: { effect: DayEffect; name: string; unsure?: boolean }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-caption font-medium whitespace-nowrap', EFFECT_CHIP[effect])} title={effectLabel(effect)}>
      {name}{unsure ? ' ?' : ''}
    </span>
  );
}

const weekdayKey = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `date.wd.${new Date(Date.UTC(y, m - 1, d)).getUTCDay()}` as I18nKey;
};

// Next 7 days of expected sales (with chicken vs veg) and how yesterday did against its own
// forecast. Plain statistics from utils/forecast.ts - no AI involved. `compact` (Home): three
// rows and "See forecast"; otherwise the full week (Insights).
export function ForecastCard({ data, loading, error, compact = false, onSeeAll, onRetry }: {
  data: InsightsOverview | null;
  loading: boolean;
  error: string | null;
  compact?: boolean;
  onSeeAll?: () => void;
  onRetry?: () => void;
}) {
  const { t } = useT();
  const days = data?.forecast || [];

  if (compact) {
    const rows = days.slice(0, 3);
    return (
      <ListGroup
        title={t('home.next7')}
        action={onSeeAll && days.length > 0 ? <Button variant="link" size="sm" onClick={onSeeAll}>{t('home.seeForecast')}</Button> : undefined}
        empty={loading && !data ? <SkeletonListRows count={3} leading="none" />
          : error ? <div className="p-3"><ErrorState body={error} onRetry={onRetry} /></div>
            : <EmptyState compact icon={CalendarRange} title={t('home.noForecast')} body={t('home.noForecastHint')} />}
      >
        {!error && rows.map((f, i) => (
          <ListRow
            key={f.date}
            title={i === 0 ? `${t('date.today')} · ${t(weekdayKey(f.date))}` : i === 1 ? `${t('date.tomorrow')} · ${t(weekdayKey(f.date))}` : t(weekdayKey(f.date))}
            subtitle={f.vegPieces + f.nonVegPieces > 0 ? t('home.pieces', { nv: f.nonVegPieces, v: f.vegPieces }) : undefined}
            chip={f.event && f.event.effect !== 'normal' ? <EffectChip effect={f.event.effect} name={f.event.name} unsure={f.event.confirmed === false} /> : undefined}
            trailing={(
              <span className="num shrink-0 text-body-sm font-semibold text-text">
                {f.revenue > 0 ? `${formatCompactINR(f.revenueLow)}–${formatCompactINR(f.revenueHigh).replace('₹', '')}` : '–'}
              </span>
            )}
          />
        ))}
      </ListGroup>
    );
  }

  const maxPieces = Math.max(1, ...days.map((f) => f.vegPieces + f.nonVegPieces));
  const y = data?.yesterday;
  const yDiff = y && y.actual !== null && y.expected?.revenue ? (y.actual - y.expected.revenue) / y.expected.revenue : null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby="forecast-title">
      <div className="flex items-start gap-3">
        <CalendarRange className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <h2 id="forecast-title" className="text-subtitle font-semibold text-text">{t('home.next7')}</h2>
          <p className="text-caption text-text-3">{t('home.next7Hint')}</p>
        </div>
      </div>

      {loading && !data ? (
        <SkeletonListRows count={4} leading="none" />
      ) : error ? (
        <ErrorState body={error} onRetry={onRetry} />
      ) : data && days.length > 0 ? (
        <>
          {y && y.actual !== null && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-body-sm text-text">
              <span className="num">{t('home.yesterdayVs', { day: fmtDay(y.date), actual: rupees(y.actual), expected: rupees(y.expected?.revenue || 0) })}</span>
              {yDiff !== null && (
                <span className={cn('num inline-flex items-center gap-1 font-semibold', yDiff >= 0 ? 'text-success' : 'text-danger')}>
                  {yDiff >= 0 ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
                  {yDiff >= 0 ? '+' : ''}{Math.round(yDiff * 100)}%
                </span>
              )}
              {y.expected?.event && <EffectChip effect={y.expected.event.effect} name={y.expected.event.name} />}
            </div>
          )}
          <ul className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border">
            {days.map((f, i) => {
              const total = f.vegPieces + f.nonVegPieces;
              return (
                <li key={f.date} className="flex flex-col gap-1.5 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-body-md font-semibold whitespace-nowrap text-text">{i === 0 ? t('date.today') : fmtDay(f.date)}</span>
                      {f.event && f.event.effect !== 'normal' && <EffectChip effect={f.event.effect} name={f.event.name} unsure={f.event.confirmed === false} />}
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="num text-body-md font-semibold text-text">{f.revenue ? rupees(f.revenue) : '–'}</span>
                      {f.revenue > 0 && <span className="num text-caption text-text-3">{rupees(f.revenueLow)}–{rupees(f.revenueHigh)}</span>}
                    </div>
                  </div>
                  {total > 0 && (
                    <>
                      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" style={{ width: `${Math.max(12, (total / maxPieces) * 100)}%` }} aria-hidden="true">
                        <div className="bg-chart-1" style={{ width: `${(f.nonVegPieces / total) * 100}%` }} />
                        <div className="bg-chart-2" style={{ width: `${(f.vegPieces / total) * 100}%` }} />
                      </div>
                      <p className="num text-caption text-text-3">{t('home.piecesChicken', { nv: f.nonVegPieces, c: f.pieces.chicken, v: f.vegPieces })}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-text-3">{t('home.forecastBasis', { basis: days[0]?.basis || 'recent weeks' })}</p>
        </>
      ) : (
        <EmptyState compact icon={CalendarRange} title={t('home.noForecast')} body={t('home.noForecastHint')} />
      )}
    </section>
  );
}
