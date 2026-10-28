import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ShoppingBasket } from 'lucide-react';
import { FORECAST_TYPES, purchaseList, roundUpToBag, type ForecastDay, type MomoKey } from '../../utils/forecast';
import { useT } from '../../utils/i18n';
import { ErrorState } from '../ui/error-state';
import { SkeletonListRows } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { useHomeData } from '../home/homeData';
import { EFFECT_CHIP } from './ForecastCard';
import { fmtDay, rupees } from './useInsightsOverview';

const BUFFER = 0.15;

/** Bags each store is expected to need per day (forecast + 15%, rounded up to whole bags). */
export function planFromForecast(days: ForecastDay[]) {
  return days.map((d) => {
    const need = {} as Record<MomoKey, number>;
    for (const ft of FORECAST_TYPES) need[ft.key] = roundUpToBag(Math.round(d.pieces[ft.key] * (1 + BUFFER)), ft.bag);
    return { day: d, need };
  });
}

/** Adds the stores' forecasts day by day. */
export function sumForecasts(list: { forecast: ForecastDay[] }[]): ForecastDay[] {
  if (!list.length) return [];
  const base = list[0].forecast.map((f) => ({ ...f, pieces: { ...f.pieces } }));
  for (const ov of list.slice(1)) ov.forecast.forEach((f, i) => {
    if (!base[i]) return;
    for (const ft of FORECAST_TYPES) base[i].pieces[ft.key] += f.pieces[ft.key];
  });
  return base;
}

function Card({ icon: Icon, title, hint, className, children }: { icon: typeof ClipboardList; title: string; hint?: string; className?: string; children?: React.ReactNode }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4', className)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden="true" />
        <div className="flex min-w-0 flex-col">
          <h3 className="text-subtitle font-semibold text-text">{title}</h3>
          {hint && <p className="text-caption text-text-3">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// The production house's week, from the forecast of every store it supplies: bags needed at the
// store each day (expected sales + 15%), and the raw material to buy today for tomorrow's batch.
// Phones get a list (one row a day); the table is for 1024 px and up.
export function ProductionPlanCards({ accessToken, storeIds }: { accessToken: string; storeIds: string[] }) {
  const { t } = useT();
  const data = useHomeData();
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = storeIds.join(',');

  useEffect(() => {
    if (!storeIds.length) return;
    let cancelled = false;
    setError(null);
    Promise.all(storeIds.map((id) => data.getInsightsOverview(accessToken, id)))
      .then((list) => { if (!cancelled) setDays(sumForecasts(list)); })
      .catch((e) => { if (!cancelled) setError(e?.message || t('plan.loadFailed')); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, key, data, attempt]);

  const plan = useMemo(() => planFromForecast(days || []), [days]);
  const tomorrow = plan[1];
  const shopping = useMemo(() => (tomorrow ? purchaseList(tomorrow.need) : []), [tomorrow]);
  const shoppingTotal = shopping.reduce((sum, r) => sum + r.amount, 0);
  const dayLabel = (i: number, date: string) => (i === 0 ? t('date.today') : i === 1 ? t('date.tomorrow') : fmtDay(date));

  if (!storeIds.length) return null;
  if (error) return <ErrorState body={error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!days) {
    return (
      <Card icon={ClipboardList} title={t('plan.title')}>
        <SkeletonListRows count={4} leading="none" />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card icon={ClipboardList} title={t('plan.title')} hint={t('plan.hint')} className="xl:col-span-2">
        {/* Phones and tablets: one row a day, the bag counts as a line of text. */}
        <ul className="flex flex-col lg:hidden [&>*+*]:border-t [&>*+*]:border-border">
          {plan.map(({ day, need }, i) => {
            const parts = FORECAST_TYPES.filter((ft) => need[ft.key]).map((ft) => `${ft.label} ${need[ft.key] / ft.bag}`);
            return (
              <li key={day.date} className={cn('flex flex-col gap-0.5 py-2.5', i === 1 && '-mx-2 rounded-md bg-primary-soft px-2')}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body-md font-semibold text-text">{dayLabel(i, day.date)}</span>
                  {day.event && day.event.effect !== 'normal' && <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-caption font-medium', EFFECT_CHIP[day.event.effect])}>{day.event.name}</span>}
                </span>
                <span className="num text-label text-text-2">{parts.length ? `${parts.join(' · ')} ${t('plan.bagsUnit')}` : '–'}</span>
              </li>
            );
          })}
        </ul>
        {/* 1024 px and up: the table. */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-left text-label text-text-3">
                <th className="py-1 pr-2 font-medium">{t('plan.day')}</th>
                {FORECAST_TYPES.map((ft) => <th key={ft.key} className="px-1.5 py-1 text-right font-medium whitespace-nowrap">{ft.label}</th>)}
              </tr>
            </thead>
            <tbody className="[&>*+*]:border-t [&>*+*]:border-border">
              {plan.map(({ day, need }, i) => (
                <tr key={day.date} className={i === 1 ? 'bg-primary-soft' : ''}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    <span className="font-medium text-text">{dayLabel(i, day.date)}</span>
                    {day.event && day.event.effect !== 'normal' && <span className={cn('ml-1.5 inline-flex h-6 items-center rounded-full px-2 text-caption', EFFECT_CHIP[day.event.effect])}>{day.event.name}</span>}
                  </td>
                  {FORECAST_TYPES.map((ft) => (
                    <td key={ft.key} className="num px-1.5 py-1.5 text-right">
                      {need[ft.key] ? <><span className="font-semibold text-text">{need[ft.key] / ft.bag}</span><span className="text-caption text-text-3"> ({need[ft.key]})</span></> : <span className="text-text-disabled">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-text-3">{t('plan.note')}</p>
      </Card>

      <Card icon={ShoppingBasket} title={t('plan.buy')} hint={tomorrow ? t('plan.buyHint', { day: fmtDay(tomorrow.day.date) }) : undefined}>
        {shopping.length === 0 ? (
          <p className="text-body-sm text-text-2">{t('plan.buyNothing')}</p>
        ) : (
          <>
            <ul className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border">
              {shopping.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 py-2 text-body-sm">
                  <span className="text-text">{r.label}</span>
                  <span className="num"><span className="font-semibold text-text">{r.kg} kg</span> <span className="text-caption text-text-3">≈ {rupees(r.amount)}</span></span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between text-body-sm font-semibold text-text"><span>{t('plan.about')}</span><span className="num">{rupees(shoppingTotal)}</span></p>
          </>
        )}
        <p className="text-caption text-text-3">{t('plan.buyNote')}</p>
      </Card>
    </div>
  );
}
