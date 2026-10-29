import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock, ImagePlus, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { FilterChips } from '../ui/chip';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NativeSelect } from '../ui/select';
import { SkeletonListRows } from '../ui/skeleton';
import { StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';
import { addDays, getTodayIST } from '../../utils/timezone';
import { addSample, photosOfView, type ReviewItem, type SummaryResponse, type WorkplaceLocation } from './workplaceApi';
import { AuthedPhoto } from './AuthedPhoto';
import { compressPhoto, fmt12, liveStatus, nowMinutesIST, timeOfIso } from './workplaceUtils';
import { teamWorkplaceApi } from '../team/teamApi';
import { formatDay } from '../team/shared';
import { CheckStatusChip, HygieneChip, VERDICT_KEYS, checkName, issuesFor, scoreTone } from '../team/checks/checkParts';

type Props = { locations: WorkplaceLocation[]; threshold: number; initialLocation?: string | null; canSetup?: boolean };
type Range = '1' | '7' | '14' | '30' | 'custom';

const locKey = (l: { kind: string; id: string }) => `${l.kind}:${l.id}`;
const BAR_TONE = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-surface-3', brand: 'bg-brand-saffron', info: 'bg-info' } as const;

// Review / gallery for the owner, operations managers and each place's incharge: every check at a
// place over a date range with its photo, AI hygiene score, status and the reviewer's OK / needs
// cleaning. Photos and people's names are marked data-ai-private so the Bunny chat never reads them.
export function WorkplaceReview({ locations, threshold, initialLocation, canSetup }: Props) {
  const { t, lang } = useT();
  const today = getTodayIST();
  const [loc, setLoc] = useState(() => (initialLocation && locations.some((l) => locKey(l) === initialLocation) ? initialLocation : locations[0] ? locKey(locations[0]) : ''));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [person, setPerson] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | 'missed' | 'late' | 'flagged'>('');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ReviewItem | null>(null);

  useEffect(() => {
    if (initialLocation && locations.some((l) => locKey(l) === initialLocation)) setLoc(initialLocation);
  }, [initialLocation, locations]);

  const place = locations.find((l) => locKey(l) === loc) || null;

  const load = async () => {
    if (!place) return;
    setLoading(true);
    setError(null);
    try {
      const [r, s] = await Promise.all([teamWorkplaceApi.getReview(place.kind, place.id, from, to), teamWorkplaceApi.getSummary(place.kind, place.id).catch(() => null)]);
      setItems(r.items);
      setSummary(s);
    } catch (e) {
      setError((e as Error)?.message || t('team.check.loadFailed'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, from, to]);

  const range: Range = to === today && ['1', '7', '14', '30'].find((d) => from === addDays(today, -(Number(d) - 1))) ? (['1', '7', '14', '30'].find((d) => from === addDays(today, -(Number(d) - 1))) as Range) : 'custom';
  const setRange = (r: Range) => {
    if (r === 'custom') return;
    setTo(today);
    setFrom(addDays(today, -(Number(r) - 1)));
  };
  const changeFrom = (v: string) => {
    if (!v) return;
    setFrom(v);
    if (v > to) setTo(v);
    else if (addDays(v, 30) < to) setTo(addDays(v, 30));
  };
  const changeTo = (v: string) => {
    if (!v) return;
    const x = v > today ? today : v;
    setTo(x);
    if (x < from) setFrom(x);
    else if (addDays(x, -30) > from) setFrom(addDays(x, -30));
  };

  const nowMin = nowMinutesIST();
  const live = useMemo(() => items.map((it) => ({ ...it, status: liveStatus(it.date, today, nowMin, it.start, it.end, it.hasPhoto, it.late) })), [items, today, nowMin]);
  const people = useMemo(() => [...new Map(live.map((i) => [i.employeeId, i.personName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [live]);
  const checks = useMemo(() => [...new Map(live.map((i) => [i.itemId, checkName(i, lang)])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [live, lang]);
  const shown = live.filter(
    (i) =>
      (!person || i.employeeId === person) &&
      (!itemFilter || i.itemId === itemFilter) &&
      (!lowOnly || (typeof i.aiScore === 'number' && i.aiScore < threshold && i.aiVerdict !== 'unclear_photo')) &&
      (!statusFilter || (statusFilter === 'missed' ? i.status === 'missed' : statusFilter === 'late' ? i.status === 'late' || i.status === 'done_late' : i.flag?.status === 'needs_cleaning')),
  );
  const byDate = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const i of shown) m.set(i.date, [...(m.get(i.date) || []), i]);
    return [...m.entries()];
  }, [shown]);

  const counts = {
    onTime: shown.filter((i) => i.status === 'done').length,
    late: shown.filter((i) => i.status === 'done_late' || i.status === 'late').length,
    missed: shown.filter((i) => i.status === 'missed').length,
    flagged: shown.filter((i) => i.flag?.status === 'needs_cleaning').length,
  };
  const scored = shown.filter((i) => typeof i.aiScore === 'number' && i.aiVerdict !== 'unclear_photo');
  const avg = scored.length ? Math.round((scored.reduce((s, i) => s + (i.aiScore || 0), 0) / scored.length) * 10) / 10 : null;

  const patch = (it: ReviewItem, p: Partial<ReviewItem>) => {
    const same = (x: ReviewItem) => x.date === it.date && x.employeeId === it.employeeId && x.itemId === it.itemId;
    setItems((list) => list.map((x) => (same(x) ? { ...x, ...p } : x)));
    setOpen((o) => (o && same(o) ? { ...o, ...p } : o));
  };

  if (!locations.length) return <EmptyState icon={Camera} title={t('team.check.noPlaces')} />;

  const toggle = (on: boolean, onClick: () => void, label: React.ReactNode, key: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'hit-44 inline-flex h-9 min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-label font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
        on ? 'border-text bg-text font-semibold text-surface' : 'border-border-strong bg-surface text-text hover:bg-surface-2',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-end gap-2">
          <Field label={t('team.check.place')} className="flex-1">
            <NativeSelect value={loc} onChange={(e) => setLoc(e.target.value)}>
              {locations.map((l) => (
                <option key={locKey(l)} value={locKey(l)}>
                  {l.name}
                  {l.kind === 'production' ? ` (${t('shell.productionHouse')})` : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <IconButton label={t('shell.refresh')} icon={<RefreshCw />} variant="secondary" loading={loading} onClick={load} />
        </div>
        <FilterChips
          aria-label={t('date.rangeTitle')}
          value={range}
          onValueChange={setRange}
          options={([
            { value: '1', label: t('date.today') },
            { value: '7', label: t('team.check.days', { n: 7 }) },
            { value: '14', label: t('team.check.days', { n: 14 }) },
            { value: '30', label: t('team.check.days', { n: 30 }) },
            { value: 'custom', label: t('date.custom'), disabled: true },
          ] as { value: Range; label: string; disabled?: boolean }[]).filter((o) => o.value !== 'custom' || range === 'custom')}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('date.from')}>
            <Input type="date" value={from} max={today} onChange={(e) => changeFrom(e.target.value)} />
          </Field>
          <Field label={t('date.to')}>
            <Input type="date" value={to} max={today} onChange={(e) => changeTo(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" data-ai-private>
          <Field label={t('team.check.person')}>
            <NativeSelect value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">{t('team.check.everyone')}</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t('team.check.check')}>
            <NativeSelect value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
              <option value="">{t('team.check.allChecks')}</option>
              {checks.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-1">
          {toggle(lowOnly, () => setLowOnly((v) => !v), <><Sparkles aria-hidden="true" /> {t('team.check.scoreBelow', { n: threshold })}</>, 'low')}
          {(['missed', 'late', 'flagged'] as const).map((s) =>
            toggle(statusFilter === s, () => setStatusFilter((v) => (v === s ? '' : s)), s === 'missed' ? t('team.check.missed') : s === 'late' ? t('team.check.lateShort') : t('team.check.needsCleaning'), s),
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label={t('team.check.onTime')} value={<span className="num">{counts.onTime}</span>} />
        <StatTile label={t('team.check.lateShort')} value={<span className="num">{counts.late}</span>} />
        <StatTile label={t('team.check.missed')} value={<span className="num">{counts.missed}</span>} tone={counts.missed > 0 ? 'danger' : 'default'} />
        <StatTile label={t('team.check.needsCleaning')} value={<span className="num">{counts.flagged}</span>} tone={counts.flagged > 0 ? 'danger' : 'default'} />
        <StatTile label={t('team.check.avgScore')} value={<span className="num">{avg === null ? '–' : `${avg}/10`}</span>} className="col-span-2 sm:col-span-1" />
      </div>

      {error && !items.length ? (
        <Callout tone="danger" title={t('error.title')} action={<Button variant="secondary" size="sm" leadingIcon={<RotateCcw />} onClick={load}>{t('common.retry')}</Button>}>{error}</Callout>
      ) : loading && !items.length ? (
        <SkeletonListRows count={4} />
      ) : !shown.length ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Camera} title={items.length ? t('team.check.noMatch') : t('team.check.noChecks')} body={items.length ? undefined : t('team.check.noChecksBody')} />
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-ai-private>
          {byDate.map(([date, list]) => (
            <section key={date} className="flex flex-col gap-2">
              {(byDate.length > 1 || date !== today) && <h3 className="text-body-sm font-semibold text-text-2">{formatDay(date, lang, { weekday: true })}</h3>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((it) => (
                  <Card key={`${it.date}|${it.employeeId}|${it.itemId}`} it={it} threshold={threshold} onOpen={() => setOpen(it)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {summary && summary.people.length > 0 && (
        <section className="flex flex-col gap-2" data-ai-private>
          <div className="flex flex-col">
            <h3 className="text-subtitle font-semibold text-text">{t('team.check.thisWeek')}</h3>
            <p className="text-label text-text-3">{t('team.check.thisWeekHint', { date: formatDay(summary.from, lang, { short: true }) })}</p>
          </div>
          <div className="lg:hidden">
            <ListGroup>
              {summary.people.map((p) => {
                const pct = p.required ? Math.round((p.onTime / p.required) * 100) : 0;
                return (
                  <ListRow
                    key={p.employeeId}
                    title={p.name}
                    subtitle={t('team.check.summaryLine', { done: p.done, required: p.required, dirty: p.needsCleaning, avg: p.avgScore === null ? '–' : p.avgScore })}
                    trailing={<StatusChip tone={pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'danger'}><span className="num">{t('team.check.onTimePct', { n: pct })}</span></StatusChip>}
                  />
                );
              })}
            </ListGroup>
          </div>
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('team.check.person')}</TableHead>
                  <TableHead numeric>{t('team.check.onTime')}</TableHead>
                  <TableHead numeric>{t('team.check.done')}</TableHead>
                  <TableHead numeric>{t('team.check.needsCleaning')}</TableHead>
                  <TableHead numeric>{t('team.check.avgScore')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.people.map((p) => {
                  const pct = p.required ? Math.round((p.onTime / p.required) * 100) : 0;
                  return (
                    <TableRow key={p.employeeId}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell numeric className={cn('font-semibold', pct >= 90 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-danger')}>{pct}%</TableCell>
                      <TableCell numeric>{p.done}/{p.required}</TableCell>
                      <TableCell numeric>{p.needsCleaning}</TableCell>
                      <TableCell numeric>{p.avgScore === null ? '–' : p.avgScore}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {open && place && <Detail it={open} place={place} threshold={threshold} onClose={() => setOpen(null)} onPatch={(p) => patch(open, p)} onReload={load} canSetup={canSetup} />}
    </div>
  );
}

function Card({ it, threshold, onOpen }: { it: ReviewItem; threshold: number; onOpen: () => void }) {
  const { t, lang } = useT();
  const flagged = it.flag?.status === 'needs_cleaning';
  const missing = it.status === 'missed' || it.status === 'late';
  const photoCount = photosOfView(it).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-surface text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-ring',
        flagged ? 'border-danger-border' : 'border-border',
      )}
    >
      <div className="relative">
        {it.hasPhoto ? (
          <AuthedPhoto date={it.date} employeeId={it.employeeId} itemId={it.itemId} thumb version={it.uploadedAt} className="aspect-square w-full" alt={checkName(it, lang)} />
        ) : (
          <div className={cn('flex aspect-square w-full items-center justify-center', missing ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-text-3')} aria-hidden="true">
            {missing ? <AlertTriangle className="size-8" /> : <Clock className="size-8" />}
          </div>
        )}
        <span className="absolute top-1.5 left-1.5">
          <HygieneChip photo={it} threshold={threshold} />
        </span>
        {it.flag && (
          <span className={cn('absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-on-primary', flagged ? 'bg-danger' : 'bg-success')} aria-hidden="true">
            {flagged ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          </span>
        )}
        {photoCount > 1 && (
          <span className="num absolute right-1.5 bottom-1.5 rounded-full bg-scrim/70 px-2 py-0.5 text-caption font-medium text-on-scrim">{t('team.check.morePhotos', { n: photoCount - 1 })}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2.5">
        <p className="truncate text-body-sm font-semibold text-text">{checkName(it, lang)}</p>
        <p className="truncate text-label text-text-2">{it.personName}{it.coveringForName ? ` · for ${it.coveringForName} (on leave)` : ''}</p>
        <div className="flex flex-wrap items-center gap-1">
          <CheckStatusChip status={it.status} start={it.start} end={it.end} short />
          {it.hasPhoto && it.uploadedAt && <span className="text-caption text-text-3">{timeOfIso(it.uploadedAt)}</span>}
        </div>
      </div>
    </button>
  );
}

function Detail({ it, place, threshold, onClose, onPatch, onReload, canSetup }: {
  it: ReviewItem; place: WorkplaceLocation; threshold: number; onClose: () => void; onPatch: (p: Partial<ReviewItem>) => void; onReload: () => void; canSetup?: boolean;
}) {
  const { t, lang } = useT();
  const today = getTodayIST();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [trend, setTrend] = useState<ReviewItem[] | null>(null);
  const flagged = it.flag?.status === 'needs_cleaning';
  // A check can have several photos (walls, shelves, stacks): one large, the rest to switch to.
  const photos = photosOfView(it);
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = photos.find((p) => p.id === shownId) || photos[0];
  const shownIssues = shown ? issuesFor(shown, lang) : [];
  // A good photo becomes the check's sample in the photo guide (photo N = shot N when it names shots).
  const [sampling, setSampling] = useState(false);
  const useAsSample = async () => {
    if (!shown) return;
    setSampling(true);
    try {
      await addSample({ kind: place.kind, id: place.id, itemId: it.itemId, shot: photos.indexOf(shown), from: { date: it.date, employeeId: it.employeeId, itemId: it.itemId, photoId: shown.id } });
      toast.success('Saved as the sample photo - staff see it when they take this photo, and in the Photo guide');
    } catch (err) { toast.error((err as Error).message || 'Could not save the sample photo'); } finally { setSampling(false); }
  };

  // The same check over the 14 days up to this one, so a one-off can be told from a habit.
  useEffect(() => {
    let cancelled = false;
    setTrend(null);
    teamWorkplaceApi
      .getReview(place.kind, place.id, addDays(it.date, -13), it.date)
      .then((r) => { if (!cancelled) setTrend(r.items.filter((x) => x.itemId === it.itemId).sort((a, b) => a.date.localeCompare(b.date))); })
      .catch(() => { if (!cancelled) setTrend([]); });
    return () => { cancelled = true; };
  }, [place.kind, place.id, it.date, it.itemId]);

  const decide = async (status: 'ok' | 'needs_cleaning') => {
    if (status === 'needs_cleaning' && !note.trim()) {
      toast.error(t('team.check.writeWhat'));
      return;
    }
    setSaving(true);
    try {
      const r = await teamWorkplaceApi.setFlag({ date: it.date, employeeId: it.employeeId, itemId: it.itemId, status, note: note.trim() });
      onPatch({ flag: r.flag });
      setNote('');
      toast.success(status === 'ok' ? t('team.check.markedOk') : t('team.check.sentBack'));
    } catch (e) {
      toast.error((e as Error)?.message || t('team.check.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const rescore = async () => {
    setSaving(true);
    try {
      const r = await teamWorkplaceApi.rescorePhoto({ date: it.date, employeeId: it.employeeId, itemId: it.itemId });
      const { success, flagged: newlyFlagged, ...view } = r;
      onPatch(view);
      if (success) toast.success(newlyFlagged ? t('team.check.scoredFlagged') : t('team.check.scored'));
      else toast.error(t('team.check.stillNotScored'));
    } catch (e) {
      toast.error((e as Error)?.message || t('team.check.scoreFailed'));
    } finally {
      setSaving(false);
    }
  };

  const takeForThem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    try {
      const { image, thumb } = await compressPhoto(file);
      const r = await teamWorkplaceApi.uploadPhoto({ itemId: it.itemId, image, thumb, forEmployeeId: it.employeeId });
      onPatch({ ...r.item, itemId: it.itemId, status: r.item.status });
      toast.success(t('team.check.takenByYou'));
      onReload();
    } catch (err) {
      toast.error((err as Error)?.message || t('team.check.sendFailed'));
    } finally {
      setSaving(false);
    }
  };

  const canTakeForThem = !it.hasPhoto && it.date === today && (it.status === 'due' || it.status === 'late');
  const issues = issuesFor(it, lang);

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      size="detail"
      title={checkName(it, lang)}
      description={[it.personName, formatDay(it.date, lang, { weekday: true, short: true }), it.start ? `${fmt12(it.start)}–${fmt12(it.end)}` : ''].filter(Boolean).join(' · ')}
      dirty={!!note.trim()}
      footer={
        it.hasPhoto ? (
          <>
            <Button variant="danger-ghost" size="lg" className="flex-1" loading={saving} onClick={() => decide('needs_cleaning')}>
              {t('team.check.needsCleaning')}
            </Button>
            <Button size="lg" className="flex-1" leadingIcon={<CheckCircle2 />} disabled={saving} onClick={() => decide('ok')}>
              {t('team.check.ok')}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4" data-ai-private>
        {it.hasPhoto && shown ? (
          <AuthedPhoto date={it.date} employeeId={it.employeeId} itemId={it.itemId} photoId={shown.id} thumb={false} version={shown.uploadedAt} fit="contain" className="aspect-[4/3] w-full rounded-lg" alt={checkName(it, lang)} />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-surface-2 text-body-sm text-text-2">{t('team.check.noPhoto')}</div>
        )}
        {canSetup && it.hasPhoto && shown && (
          <Button variant="secondary" size="sm" className="self-start" leadingIcon={<ImagePlus />} loading={sampling} onClick={useAsSample}>Use as the sample photo</Button>
        )}
        {photos.length > 1 && shown && (
          <div className="flex flex-col gap-2">
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label={t('team.check.photoOf', { n: photos.indexOf(shown) + 1, total: photos.length })}>
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === shown.id}
                  aria-label={t('team.check.photoN', { n: i + 1 })}
                  onClick={() => setShownId(p.id)}
                  className={cn('size-16 shrink-0 overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring', p.id === shown.id ? 'border-primary ring-2 ring-primary' : 'border-border')}
                >
                  <AuthedPhoto date={it.date} employeeId={it.employeeId} itemId={it.itemId} photoId={p.id} thumb version={p.uploadedAt} className="h-full w-full" alt="" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-2">
              <span className="num font-medium text-text">{t('team.check.photoOf', { n: photos.indexOf(shown) + 1, total: photos.length })}</span>
              <HygieneChip photo={shown} threshold={threshold} />
              {shownIssues.length > 0 && <span>{shownIssues.join(' · ')}</span>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <CheckStatusChip status={it.status} start={it.start} end={it.end} />
          {it.uploadedAt && <span className="text-label text-text-2">{t('team.check.sentAt', { time: timeOfIso(it.uploadedAt) })}</span>}
          {!!it.retakes && <span className="text-label text-text-3">{t('team.check.retakes', { n: it.retakes })}</span>}
          {it.onBehalf && <StatusChip tone="info">{t('team.check.onBehalf', { name: it.uploadedByName || t('team.check.aManager') })}</StatusChip>}
        </div>

        {it.hasPhoto && (
          <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-text">
                <Sparkles className="size-4 text-text-2" aria-hidden="true" /> {t('team.check.aiCheck')}
              </p>
              <HygieneChip photo={it} threshold={threshold} />
            </div>
            {it.aiStatus === 'scored' ? (
              <>
                <p className="text-body-sm text-text-2">
                  {it.aiVerdict ? t(VERDICT_KEYS[it.aiVerdict]) : ''}
                  {it.aiShown ? ` · ${it.aiShown}` : ''}
                </p>
                {issues.length > 0 && (
                  <ul className="flex list-disc flex-col gap-0.5 pl-5 text-body-sm text-text">
                    {issues.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-body-sm text-text-2">{it.aiStatus === 'failed' ? t('team.check.aiFailed') : it.aiStatus === 'pending' ? t('team.check.aiPending') : t('team.check.aiOff')}</p>
            )}
            {(it.aiStatus === 'failed' || it.aiStatus === 'scored') && (
              <Button variant="link" size="sm" leadingIcon={<RotateCcw />} disabled={saving} onClick={rescore} className="self-start">
                {it.aiStatus === 'failed' ? t('team.check.retryScore') : t('team.check.scoreAgain')}
              </Button>
            )}
          </section>
        )}

        {trend && trend.length > 1 && (
          <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <p className="text-body-sm font-semibold text-text">{t('team.check.last14')}</p>
            <div className="flex h-20 items-end gap-1" role="img" aria-label={t('team.check.trendLabel')}>
              {trend.map((x) => {
                const s = typeof x.aiScore === 'number' && x.aiVerdict !== 'unclear_photo' ? x.aiScore : null;
                const missed = !x.hasPhoto && x.status === 'missed';
                return (
                  <div key={x.date + x.employeeId} className="flex h-full flex-1 flex-col items-center justify-end" title={`${formatDay(x.date, lang, { short: true })}: ${s !== null ? `${s}/10` : missed ? t('team.check.missed') : '–'}`}>
                    {s !== null ? (
                      <div className={cn('w-full rounded-t-xs', BAR_TONE[scoreTone(s, threshold)])} style={{ height: `${Math.max(8, s * 10)}%` }} />
                    ) : (
                      <div className={cn('h-1 w-full rounded-full', missed ? 'bg-danger' : 'bg-surface-3')} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1">
              {trend.map((x) => (
                <span key={x.date + x.employeeId} className={cn('num flex-1 text-center text-caption', x.date === it.date ? 'font-semibold text-text' : 'text-text-3')}>
                  {Number(x.date.slice(8))}
                </span>
              ))}
            </div>
            <p className="text-caption text-text-3">{t('team.check.trendKey')}</p>
          </section>
        )}

        {it.flag && (
          <Callout tone={flagged ? 'danger' : 'success'} title={`${flagged ? t('team.check.needsCleaning') : t('team.check.checkedOk')} · ${it.flag.auto ? t('team.check.byAi') : t('team.att.by', { name: it.flag.by })}, ${timeOfIso(it.flag.at)}`}>
            {[it.flag.note, flagged && it.flag.fixedAt ? t('team.check.fixedAt', { time: timeOfIso(it.flag.fixedAt) }) : ''].filter(Boolean).join(' · ') || undefined}
          </Callout>
        )}

        {it.hasPhoto && (
          <Field label={t('team.check.noteLabel')} helper={t('team.check.noteHelp')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
          </Field>
        )}

        {canTakeForThem && (
          <label className={cn('flex min-h-12 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-body-sm font-semibold text-text outline-none focus-within:ring-2 focus-within:ring-ring', saving ? 'opacity-50' : 'cursor-pointer hover:bg-surface-2')}>
            {saving ? <RefreshCw className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />} {t('team.check.takeForThem')}
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={saving} onChange={takeForThem} />
          </label>
        )}
      </div>
    </ResponsiveModal>
  );
}
