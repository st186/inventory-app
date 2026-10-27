import { useEffect, useState } from 'react';
import { Target, Trophy } from 'lucide-react';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { SkeletonText, SkeletonStatTile } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import { formatDay, TeamPage } from '../team/shared';
import { teamKpiApi } from '../team/teamApi';
import * as kpi from './kpiApi';
import { FlagList, KpiBars, MonthPicker, TotalBadge } from './KpiParts';
import { ShiftClockCard } from './ShiftClockCard';

// "My KPIs": the signed-in person's own month so far - each score, the numbers behind it and what
// would improve it. Money only when the owner has switched that on. The check-in card sits on top
// so the "check in?" notification lands somewhere useful.
export function MyKpis() {
  const { t, lang } = useT();
  const [month, setMonth] = useState(kpi.istMonth());
  const [data, setData] = useState<kpi.MyKpisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    teamKpiApi
      .getMyKpis(month)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || t('team.kpi.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, attempt]);

  const k = data?.kpis;
  const weakest = k ? [...k.kpis].filter((x) => x.score !== null && x.weight > 0).sort((a, b) => a.score! - b.score! || b.weight - a.weight).slice(0, 2) : [];
  const weeklyOff = data?.settings.weeklyOff.length ? data.settings.weeklyOff.map((d) => t(`date.wd.${d}` as never)).join(', ') : t('team.kpi.notSet');

  return (
    <div data-ai-private>
      <ShiftClockCard />
      <TeamPage>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-subtitle font-semibold text-text">{t('more.myKpis')}</h2>
          <MonthPicker month={month} onChange={setMonth} />
        </div>
        {loading ? (
          <>
            <SkeletonStatTile hero />
            <div className="rounded-lg border border-border bg-surface p-4">
              <SkeletonText lines={6} />
            </div>
          </>
        ) : error ? (
          <ErrorState body={error} onRetry={() => setAttempt((a) => a + 1)} />
        ) : !data?.required || !k ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState icon={Target} title={t('team.kpi.staffOnly')} />
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-body-md font-semibold text-text">{data.roleLabel}</p>
                  <p className="num text-body-sm text-text-2">
                    {t('team.kpi.shift', { from: kpi.hhmm12(data.settings.shiftStart), to: kpi.hhmm12(data.settings.shiftEnd), grace: data.settings.graceMin })}
                  </p>
                  <p className="text-body-sm text-text-2">{t('team.kpi.weeklyOff', { days: weeklyOff })}</p>
                  <p className="text-label text-text-3">{k.from ? t('team.kpi.counted', { from: formatDay(k.from, lang, { short: true }), to: formatDay(k.to, lang, { short: true }) }) : t('team.kpi.noDays')}</p>
                </div>
                <TotalBadge total={k.total} />
              </div>
              {k.notes.length > 0 && (
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-label text-text-3">
                  {k.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {data.money && (
                <Callout tone="success" title={data.money.approved !== null ? t('team.kpi.payApproved', { amount: kpi.rupees(data.money.approved), max: kpi.rupees(data.money.max) }) : t('team.kpi.payEstimate', { amount: kpi.rupees(data.money.estimate), max: kpi.rupees(data.money.max) })}>
                  {data.money.approved === null ? t('team.kpi.ownerDecides') : undefined}
                </Callout>
              )}
              {data.reviewed && !data.money && <p className="text-label font-medium text-success">{t('team.kpi.reviewed')}</p>}
            </section>

            {weakest.length > 0 && (
              <Callout tone="neutral" icon={Trophy} title={t('team.kpi.biggestWins')}>
                {weakest.map((w) => (
                  <span key={w.id} className="block">
                    <b className="font-semibold text-text">{w.label}:</b> {w.tip}
                  </span>
                ))}
              </Callout>
            )}

            <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
              <KpiBars kpis={k.kpis} showTips />
              <FlagList flags={k.flags} />
              <p className="text-caption text-text-3">{t('team.kpi.howTotal')}</p>
            </section>
          </>
        )}
      </TeamPage>
    </div>
  );
}
