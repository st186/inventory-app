import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Plus, RefreshCw, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { IconButton } from '../ui/icon-button';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonListRows } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';
import { getTodayIST } from '../../utils/timezone';
import { MAX_PHOTOS, needOf, photosOfView, shotLabel, type CheckPhoto, type MyCheck, type MyChecks } from './workplaceApi';
import { AuthedPhoto } from './AuthedPhoto';
import { SampleTile } from './SamplePhoto';
import { compressPhoto, fmt12, liveStatus, minToTime, nowMinutesIST, timeOfIso, toMin } from './workplaceUtils';
import { teamWorkplaceApi } from '../team/teamApi';
import { CheckStatusChip, HygieneChip, VERDICT_KEYS, checkName, issuesFor, scoreTone } from '../team/checks/checkParts';
import { useRefreshSignal } from '../shell/refreshSignal';

// "My workplace checks": today's areas assigned to the signed-in person. Owner, 28 Oct 2026:
// photos should be a two-minute job. Each photo goes up as soon as it's taken and the AI looks at
// it afterwards, so the person keeps shooting and gets a notification when the round is checked.
// Uploads and removals still go one at a time, in order, so two quick shots can't overwrite each
// other's record on the server. A check can have several photos (walls, shelves, stacks of crates),
// each retaken or removed on its own. Owner, 29 Oct 2026: a check can ask for several photos or
// named shots in order (each with its sample photo from the photo guide); it is done once all are in.

type Upload = { key: string; itemId: string; image: string; thumb: string; replacePhotoId?: string; state: 'sending' | 'failed'; error?: string };
const POLL_MS = 8000;
const TILE = 'relative size-20 shrink-0 overflow-hidden rounded-md border';
const SCORE_PILL: Record<string, string> = { success: 'bg-success text-on-primary', warning: 'bg-warning text-on-primary', danger: 'bg-danger text-on-primary' };

export function MyWorkplaceChecks({ threshold }: { threshold: number }) {
  const { t, lang } = useT();
  const [data, setData] = useState<MyChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // a score retry or a removal
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [open, setOpen] = useState<{ itemId: string; photoId: string } | null>(null);
  const [, setTick] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const version = useRef(0); // bumped by every change made here, so an older poll answer doesn't undo it

  const load = async (quiet = false) => {
    const started = version.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const next = await teamWorkplaceApi.getMyChecks();
      if (!quiet || (version.current === started && !inFlight.current)) setData(next);
    } catch (e) {
      if (!quiet) setError((e as Error)?.message || t('team.check.loadFailed'));
    } finally {
      if (!quiet) setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRefreshSignal(() => load());
  // Statuses move with the clock (due -> late) without reloading.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const today = getTodayIST();
  const nowMin = nowMinutesIST();
  const early = data?.earlyMinutes ?? 30;
  const complete = (it: MyCheck) => photosOfView(it).length >= needOf(it);
  const items = (data?.items || []).map((it) => ({ ...it, status: liveStatus(data!.date, today, nowMin, it.start, it.end, complete(it), it.late) }));
  const done = items.filter(complete).length;
  const checking = items.reduce((n, it) => n + photosOfView(it).filter((p) => p.aiStatus === 'pending').length, 0);

  // While the AI is still looking (it answers in the background), check back now and then.
  useEffect(() => {
    if (!checking) return;
    const id = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking > 0]);

  const replace = (id: string, patch: Partial<MyCheck>) => {
    version.current++;
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  };
  const enqueue = <T,>(work: () => Promise<T>): Promise<T> => {
    inFlight.current++;
    const run = queue.current.then(work).finally(() => { inFlight.current--; });
    queue.current = run.catch(() => undefined);
    return run;
  };

  const send = (u: Upload) => {
    setUploads((list) => list.map((x) => (x.key === u.key ? { ...x, state: 'sending', error: undefined } : x)));
    enqueue(async () => {
      try {
        const res = await teamWorkplaceApi.uploadPhoto({ itemId: u.itemId, image: u.image, thumb: u.thumb, ...(u.replacePhotoId ? { replacePhotoId: u.replacePhotoId } : { add: true }) });
        replace(u.itemId, res.item);
        setUploads((list) => list.filter((x) => x.key !== u.key));
      } catch (err) {
        const message = (err as Error)?.message || t('team.check.sendFailed');
        setUploads((list) => list.map((x) => (x.key === u.key ? { ...x, state: 'failed', error: message } : x)));
        toast.error(message);
      }
    });
  };

  const take = async (it: MyCheck, e: React.ChangeEvent<HTMLInputElement>, replacePhotoId?: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOpen(null);
    try {
      const { image, thumb } = await compressPhoto(file);
      const u: Upload = { key: `${it.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, itemId: it.id, image, thumb, replacePhotoId, state: 'sending' };
      setUploads((list) => [...list, u]);
      send(u);
    } catch (err) {
      toast.error((err as Error)?.message || t('team.check.sendFailed'));
    }
  };

  const remove = async (it: MyCheck, photoId: string) => {
    setBusy(`${it.id}:remove`);
    try {
      const res = await enqueue(() => teamWorkplaceApi.removePhoto({ itemId: it.id, photoId }));
      replace(it.id, res.item);
      setOpen(null);
      toast.success(t('team.check.removed'));
    } catch (err) {
      toast.error((err as Error)?.message || t('team.check.removeFailed'));
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

  const openItem = open ? items.find((x) => x.id === open.itemId) : undefined;
  const openPhotos = openItem ? photosOfView(openItem) : [];
  const openPhoto = openPhotos.find((p) => p.id === open?.photoId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-subtitle font-semibold text-text">{t('team.check.todays')}</h2>
          {items.length > 0 && <p className="num text-label text-text-3">{t('team.check.doneOf', { done, total: items.length })}</p>}
        </div>
        <IconButton label={t('shell.refresh')} icon={<RefreshCw />} loading={loading && !!data} onClick={() => load()} />
      </div>

      {checking > 0 && <Callout tone="info" icon={Sparkles} title={t('team.check.checkingNote', { n: checking })} />}

      {error && !data ? (
        <Callout tone="danger" title={t('error.title')} action={<Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} onClick={() => load()}>{t('common.retry')}</Button>}>{error}</Callout>
      ) : loading && !data ? (
        <SkeletonListRows count={3} />
      ) : !items.length ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={CheckCircle2} title={t('team.check.noneToday')} body={t('team.check.noneTodayBody')} />
        </div>
      ) : (
        <>
          <p className="text-label text-text-2">{t('team.check.morePhotosHint', { n: MAX_PHOTOS })}</p>
          <ul className="flex flex-col gap-3">
            {items.map((it) => {
              const opensAt = it.start ? Math.max(0, toMin(it.start) - early) : 0;
              const notOpen = !!it.start && nowMin < opensAt && !it.hasPhoto;
              const flagged = it.flag?.status === 'needs_cleaning';
              const issues = issuesFor(it, lang);
              const photos = photosOfView(it);
              const mine = uploads.filter((u) => u.itemId === it.id);
              const added = mine.filter((u) => !u.replacePhotoId);
              const failed = mine.filter((u) => u.state === 'failed');
              const any = photos.length + mine.length > 0;
              const canAdd = !notOpen && photos.length + added.length < MAX_PHOTOS;
              const need = needOf(it);
              const nextIndex = photos.length + added.length;
              const nextShot = it.shots?.[nextIndex];
              const sampleOf = (shot?: number) => (it.samples || []).find((x) => (it.shots?.length ? x.shot === shot : true));
              const general = it.shots?.length ? [] : it.samples || [];
              const sampleProps = { kind: it.locationKind, locId: it.locationId, itemId: it.id };
              return (
                <li key={it.id} className={cn('flex flex-col gap-3 rounded-lg border bg-surface p-3', flagged ? 'border-danger-border' : 'border-border')}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-body-md font-semibold text-text">{checkName(it, lang)}</p>
                    {it.hint && <p className="text-label text-text-2">{it.hint}</p>}
                    {it.coveringForName && <p className="text-label font-medium text-primary">{t('team.check.covering', { name: it.coveringForName })}</p>}
                    {need > 1 && <p className={cn('num text-label font-medium', photos.length >= need ? 'text-success' : 'text-text')}>{t('team.check.photosNeeded', { done: Math.min(photos.length, need), need })}</p>}
                    {!!it.shots?.length && (
                      <ol className="mt-1 flex flex-col gap-1.5">
                        {it.shots.map((sh, i) => {
                          const sample = sampleOf(i);
                          const got = photos.length > i;
                          return (
                            <li key={i} className="flex items-center gap-2">
                              {got ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
                                : <span className="num flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-caption text-text-2">{i + 1}</span>}
                              <span className={cn('min-w-0 flex-1 text-body-sm', got ? 'text-text-2' : 'text-text')}>{shotLabel(sh, lang)}</span>
                              {sample && <SampleTile {...sampleProps} sampleId={sample.id} label={`${t('team.check.sample')}: ${shotLabel(sh, lang)}`} className="size-12" />}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {general.length > 0 && (
                      <div className="mt-1 flex flex-col gap-1">
                        <span className="text-label font-medium text-text-2">{t('team.check.likeThis')}</span>
                        <div className="flex gap-2">{general.map((x) => <SampleTile key={x.id} {...sampleProps} sampleId={x.id} label={`${t('team.check.sample')}: ${checkName(it, lang)}`} className="size-14" />)}</div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CheckStatusChip status={it.status} start={it.start} end={it.end} />
                      {it.aiStatus === 'pending' ? <CheckingChip /> : <HygieneChip photo={it} threshold={threshold} />}
                    </div>
                    <p className="text-caption text-text-3">{[it.hasPhoto && it.uploadedAt ? timeOfIso(it.uploadedAt) : '', it.locationName].filter(Boolean).join(' · ')}</p>
                  </div>

                  {any && (
                    <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
                      {photos.map((p, i) => {
                        const retaking = mine.find((u) => u.replacePhotoId === p.id);
                        if (retaking) return <LocalTile key={p.id} u={retaking} label={t('team.check.photoN', { n: i + 1 })} onRetry={() => send(retaking)} />;
                        const low = p.aiStatus === 'scored' && p.aiVerdict !== 'unclear_photo' && ((p.aiScore ?? 10) < threshold || p.aiSevere);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setOpen({ itemId: it.id, photoId: p.id })}
                            aria-label={t('team.check.photoN', { n: i + 1 })}
                            className={cn(TILE, 'outline-none focus-visible:ring-2 focus-visible:ring-ring', low ? 'border-danger ring-1 ring-danger' : 'border-border')}
                          >
                            {data?.employeeId && <AuthedPhoto date={data.date} employeeId={data.employeeId} itemId={it.id} photoId={p.id} thumb version={p.uploadedAt} className="h-full w-full" alt="" />}
                            <PhotoBadge photo={p} threshold={threshold} />
                          </button>
                        );
                      })}
                      {added.map((u, i) => <LocalTile key={u.key} u={u} label={t('team.check.photoN', { n: photos.length + i + 1 })} onRetry={() => send(u)} />)}
                      {canAdd && (
                        <label className={cn(TILE, 'flex cursor-pointer flex-col items-center justify-center gap-1 border-dashed border-border-strong bg-surface-2 text-text-2 outline-none focus-within:ring-2 focus-within:ring-ring hover:bg-surface-3')}>
                          <Plus className="size-6" aria-hidden="true" />
                          <span className="line-clamp-2 px-1 text-center text-caption font-medium">{nextShot ? shotLabel(nextShot, lang) : t('team.check.addPhoto')}</span>
                          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => take(it, e)} />
                        </label>
                      )}
                    </div>
                  )}

                  {failed.length > 0 && (
                    <Callout tone="danger" title={t('team.check.notSent')}
                      action={<Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} onClick={() => failed.forEach(send)}>{t('common.retry')}</Button>}>
                      {failed[0].error}
                    </Callout>
                  )}
                  {it.aiStatus === 'scored' && it.aiVerdict === 'unclear_photo' && <Callout tone="warning" title={t('team.check.unclearTitle')}>{t('team.check.unclearBody')}</Callout>}
                  {it.aiStatus === 'scored' && it.aiVerdict !== 'unclear_photo' && issues.length > 0 && <Callout tone="neutral" title={t('team.check.aiSaw')}>{issues.join(' · ')}</Callout>}
                  {it.aiStatus === 'failed' && (
                    <Callout tone="neutral" title={t('team.check.notScored')} action={<Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} disabled={!!busy} loading={busy === it.id} onClick={() => retryScore(it)}>{t('team.check.retryScore')}</Button>} />
                  )}
                  {it.flag && (
                    <Callout tone={flagged ? 'danger' : 'success'} icon={flagged ? AlertTriangle : CheckCircle2} title={flagged ? t('team.check.cleanAgain') : t('team.check.checkedOk')}>
                      {[it.flag.note && !it.flag.auto ? it.flag.note : '', flagged && it.flag.fixedAt ? t('team.check.newPhotoSent') : ''].filter(Boolean).join(' · ') || undefined}
                    </Callout>
                  )}

                  {!any && (
                    <label
                      className={cn(
                        'relative flex min-h-12 items-center justify-center gap-2 rounded-md border px-4 text-body-md font-semibold outline-none focus-within:ring-2 focus-within:ring-ring',
                        notOpen ? 'cursor-not-allowed border-border bg-surface-2 text-text-disabled' : 'cursor-pointer border-border-strong bg-surface text-text hover:bg-surface-2 active:bg-surface-3',
                      )}
                    >
                      {notOpen ? (
                        t('team.check.opensAt', { time: fmt12(minToTime(opensAt)) })
                      ) : (
                        <>
                          <Camera className="size-5" aria-hidden="true" />
                          {nextShot ? t('team.check.takeShot', { n: 1, label: shotLabel(nextShot, lang) }) : need > 1 ? t('team.check.takeAtLeast', { n: need }) : t('team.check.take')}
                        </>
                      )}
                      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={notOpen} onChange={(e) => take(it, e)} />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {openItem && openPhoto && data?.employeeId && (
        <PhotoSheet
          item={openItem}
          photo={openPhoto}
          index={openPhotos.indexOf(openPhoto)}
          total={openPhotos.length}
          date={data.date}
          employeeId={data.employeeId}
          threshold={threshold}
          removing={busy === `${openItem.id}:remove`}
          onClose={() => setOpen(null)}
          onRetake={(e) => take(openItem, e, openPhoto.id)}
          onRemove={() => remove(openItem, openPhoto.id)}
        />
      )}
    </div>
  );
}

function CheckingChip() {
  const { t } = useT();
  return (
    <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-info-soft px-2 text-caption font-medium text-info">
      <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> {t('team.check.checking')}
    </span>
  );
}

// The little answer on a photo tile: checking, the score, or unclear.
function PhotoBadge({ photo, threshold }: { photo: CheckPhoto; threshold: number }) {
  const { t } = useT();
  if (photo.aiStatus === 'pending') {
    return (
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-scrim/70 py-0.5 text-caption text-on-scrim">
        <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> {t('team.check.checking')}
      </span>
    );
  }
  if (photo.aiStatus !== 'scored' || typeof photo.aiScore !== 'number') return null;
  if (photo.aiVerdict === 'unclear_photo') {
    return <span className="absolute inset-x-0 bottom-0 bg-warning py-0.5 text-center text-caption font-medium text-on-primary">{t('team.check.unclear')}</span>;
  }
  return <span className={cn('num absolute right-1 bottom-1 rounded-full px-1.5 text-caption font-semibold', SCORE_PILL[scoreTone(photo.aiScore, threshold)])}>{photo.aiScore}/10</span>;
}

// A photo taken on this phone that is still going up, or didn't make it (tap to send again).
function LocalTile({ u, label, onRetry }: { u: Upload; label: string; onRetry: () => void }) {
  const { t } = useT();
  const failed = u.state === 'failed';
  return (
    <button
      type="button"
      disabled={!failed}
      onClick={onRetry}
      aria-label={failed ? `${label}: ${t('team.check.notSent')}` : `${label}: ${t('team.check.sending')}`}
      className={cn(TILE, 'outline-none focus-visible:ring-2 focus-visible:ring-ring', failed ? 'border-danger ring-1 ring-danger' : 'border-border')}
    >
      <img src={u.thumb} alt="" className={cn('h-full w-full object-cover', !failed && 'opacity-60')} />
      <span className="absolute inset-0 flex items-center justify-center">
        {failed ? (
          <span className="flex size-8 items-center justify-center rounded-full bg-danger text-on-primary"><RotateCcw className="size-4" aria-hidden="true" /></span>
        ) : (
          <RefreshCw className="size-6 animate-spin text-on-scrim drop-shadow" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

// One photo large, with what the AI saw in it, a retake and (when there are others) a remove.
function PhotoSheet({ item, photo, index, total, date, employeeId, threshold, removing, onClose, onRetake, onRemove }: {
  item: MyCheck; photo: CheckPhoto; index: number; total: number; date: string; employeeId: string; threshold: number; removing: boolean;
  onClose: () => void; onRetake: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void;
}) {
  const { t, lang } = useT();
  const input = useRef<HTMLInputElement>(null);
  const issues = issuesFor(photo, lang);
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      size="detail"
      title={checkName(item, lang)}
      description={[total > 1 ? t('team.check.photoOf', { n: index + 1, total }) : '', photo.uploadedAt ? timeOfIso(photo.uploadedAt) : ''].filter(Boolean).join(' · ')}
      footer={
        <>
          {total > 1 && (
            <Button variant="danger-ghost" size="lg" className="flex-1" leadingIcon={<Trash2 />} loading={removing} onClick={onRemove}>
              {t('team.check.removeThis')}
            </Button>
          )}
          <Button size="lg" className="flex-1" leadingIcon={<Camera />} disabled={removing} onClick={() => input.current?.click()}>
            {t('team.check.retakeThis')}
          </Button>
          <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onRetake} />
        </>
      }
    >
      <div className="flex flex-col gap-3" data-ai-private>
        <AuthedPhoto date={date} employeeId={employeeId} itemId={item.id} photoId={photo.id} thumb={false} version={photo.uploadedAt} fit="contain" className="aspect-[4/3] w-full rounded-lg" alt={checkName(item, lang)} />
        <div className="flex flex-wrap items-center gap-2">
          {photo.aiStatus === 'pending' ? <CheckingChip /> : <HygieneChip photo={photo} threshold={threshold} />}
          {photo.aiStatus === 'scored' && photo.aiVerdict && <span className="text-body-sm text-text-2">{t(VERDICT_KEYS[photo.aiVerdict])}</span>}
        </div>
        {photo.aiStatus === 'scored' && photo.aiVerdict === 'unclear_photo' && <Callout tone="warning" title={t('team.check.unclearTitle')}>{t('team.check.unclearBody')}</Callout>}
        {photo.aiStatus === 'scored' && photo.aiVerdict !== 'unclear_photo' && issues.length > 0 && (
          <Callout tone="neutral" title={t('team.check.aiSaw')}>{issues.join(' · ')}</Callout>
        )}
      </div>
    </ResponsiveModal>
  );
}
