import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { IconButton } from '../ui/icon-button';
import { SkeletonListRows } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';
import { getTodayIST } from '../../utils/timezone';
import type { MyCheck, MyChecks } from './workplaceApi';
import { AuthedPhoto } from './AuthedPhoto';
import { compressPhoto, fmt12, liveStatus, minToTime, nowMinutesIST, timeOfIso, toMin } from './workplaceUtils';
import { teamWorkplaceApi } from '../team/teamApi';
import { CheckStatusChip, HygieneChip, checkName, issuesFor } from '../team/checks/checkParts';

// "My workplace checks": today's areas assigned to the signed-in person, each with a camera button.
// Uploads go one at a time so two quick taps can't overwrite each other's record on the server.
export function MyWorkplaceChecks({ threshold }: { threshold: number }) {
  const { t, lang } = useT();
  const [data, setData] = useState<MyChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await teamWorkplaceApi.getMyChecks());
    } catch (e) {
      setError((e as Error)?.message || t('team.check.loadFailed'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Statuses move with the clock (due -> late) without reloading.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const today = getTodayIST();
  const nowMin = nowMinutesIST();
  const early = data?.earlyMinutes ?? 30;
  const items = (data?.items || []).map((it) => ({ ...it, status: liveStatus(data!.date, today, nowMin, it.start, it.end, it.hasPhoto, it.late) }));
  const done = items.filter((i) => i.hasPhoto).length;

  const replace = (id: string, patch: Partial<MyCheck>) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  const take = async (it: MyCheck, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy(it.id);
    try {
      const { image, thumb } = await compressPhoto(file);
      const res = await teamWorkplaceApi.uploadPhoto({ itemId: it.id, image, thumb });
      replace(it.id, res.item);
      if (res.item.aiVerdict === 'unclear_photo') toast.warning(t('team.check.unclearToast'));
      else if (res.flagged) toast.error(t('team.check.flaggedToast', { n: res.item.aiScore ?? '' }));
      else toast.success(t('team.check.sent'));
    } catch (err) {
      toast.error((err as Error)?.message || t('team.check.sendFailed'));
    } finally {
      setBusy(null);
    }
  };

  const retryScore = async (it: MyCheck) => {
    if (!data?.employeeId || busy) return;
    setBusy(it.id);
    try {
      const res = await teamWorkplaceApi.rescorePhoto({ date: data.date, employeeId: data.employeeId, itemId: it.id });
      replace(it.id, res);
      if (!res.success) toast.error(t('team.check.stillNotScored'));
    } catch (err) {
      toast.error((err as Error)?.message || t('team.check.scoreFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-subtitle font-semibold text-text">{t('team.check.todays')}</h2>
          {items.length > 0 && <p className="num text-label text-text-3">{t('team.check.doneOf', { done, total: items.length })}</p>}
        </div>
        <IconButton label={t('shell.refresh')} icon={<RefreshCw />} loading={loading && !!data} onClick={load} />
      </div>

      {error && !data ? (
        <Callout tone="danger" title={t('error.title')} action={<Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} onClick={load}>{t('common.retry')}</Button>}>{error}</Callout>
      ) : loading && !data ? (
        <SkeletonListRows count={3} />
      ) : !items.length ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={CheckCircle2} title={t('team.check.noneToday')} body={t('team.check.noneTodayBody')} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => {
            const opensAt = it.start ? Math.max(0, toMin(it.start) - early) : 0;
            const notOpen = !!it.start && nowMin < opensAt && !it.hasPhoto;
            const flagged = it.flag?.status === 'needs_cleaning';
            const issues = issuesFor(it, lang);
            return (
              <li key={it.id} className={cn('flex flex-col gap-3 rounded-lg border bg-surface p-3', flagged ? 'border-danger-border' : 'border-border')}>
                <div className="flex gap-3">
                  {it.hasPhoto && data?.employeeId ? (
                    <AuthedPhoto date={data.date} employeeId={data.employeeId} itemId={it.id} thumb version={it.uploadedAt} className="size-20 shrink-0 rounded-md" alt={checkName(it, lang)} />
                  ) : (
                    <span className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-2 text-text-2" aria-hidden="true">
                      <Camera className="size-7" />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-body-md font-semibold text-text">{checkName(it, lang)}</p>
                    {it.hint && <p className="text-label text-text-2">{it.hint}</p>}
                    {it.coveringForName && <p className="text-label font-medium text-primary">{t('team.check.covering', { name: it.coveringForName })}</p>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CheckStatusChip status={it.status} start={it.start} end={it.end} />
                      <HygieneChip photo={it} threshold={threshold} />
                    </div>
                    <p className="text-caption text-text-3">{[it.hasPhoto && it.uploadedAt ? timeOfIso(it.uploadedAt) : '', it.locationName].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>

                {it.aiStatus === 'scored' && it.aiVerdict === 'unclear_photo' && <Callout tone="warning" title={t('team.check.unclearTitle')}>{t('team.check.unclearBody')}</Callout>}
                {it.aiStatus === 'scored' && it.aiVerdict !== 'unclear_photo' && issues.length > 0 && <Callout tone="neutral" title={t('team.check.aiSaw')}>{issues.join(' · ')}</Callout>}
                {it.aiStatus === 'failed' && (
                  <Callout tone="neutral" title={t('team.check.notScored')} action={<Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} disabled={!!busy} onClick={() => retryScore(it)}>{t('team.check.retryScore')}</Button>} />
                )}
                {it.flag && (
                  <Callout tone={flagged ? 'danger' : 'success'} icon={flagged ? AlertTriangle : CheckCircle2} title={flagged ? t('team.check.cleanAgain') : t('team.check.checkedOk')}>
                    {[it.flag.note && !it.flag.auto ? it.flag.note : '', flagged && it.flag.fixedAt ? t('team.check.newPhotoSent') : ''].filter(Boolean).join(' · ') || undefined}
                  </Callout>
                )}

                <label
                  className={cn(
                    'relative flex min-h-12 items-center justify-center gap-2 rounded-md border px-4 text-body-md font-semibold outline-none focus-within:ring-2 focus-within:ring-ring',
                    notOpen || busy ? 'cursor-not-allowed border-border bg-surface-2 text-text-disabled' : 'cursor-pointer border-border-strong bg-surface text-text hover:bg-surface-2 active:bg-surface-3',
                  )}
                >
                  {busy === it.id ? (
                    <>
                      <RefreshCw className="size-5 animate-spin" aria-hidden="true" /> {t('team.check.sending')}
                    </>
                  ) : notOpen ? (
                    t('team.check.opensAt', { time: fmt12(minToTime(opensAt)) })
                  ) : (
                    <>
                      <Camera className="size-5" aria-hidden="true" /> {it.hasPhoto ? t('team.check.retake') : t('team.check.take')}
                    </>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={notOpen || !!busy} onChange={(e) => take(it, e)} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
