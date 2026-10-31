// Kitchen activity from the camera stills (owner, 29 Oct 2026; server cctv.ts + activityRules.ts):
//  - WhoIsWho: the day's people by number, with a photo, for the owner, the operations manager or
//    the place's incharge to put a name to each - only the unnamed ones, until everyone has two tags;
//    WhoIsEditor, the Who is who tab, to change any name;
//  - KitchenActivity (owner only): per person, minutes folding, at other kitchen work, cleaning, on
//    the phone and idle, how often on the phone, PPE share; for the kitchen, folding hours and
//    pieces made per folding hour. Work sampling: the camera takes bursts of 20 frames spread over
//    35 minutes, one burst after the other (owner, 31 Oct 2026; until then 15 seconds apart with a
//    30-minute wait); each frame stands for its share of the time.
import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { useT, type I18nKey } from '../../utils/i18n';
import { Button } from '../ui/button';
import { getTodayIST } from '../../utils/timezone';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { FilterChips } from '../ui/chip';
import { NativeSelect } from '../ui/select';
import { StatTile } from '../ui/stat-tile';
import * as api from './camerasApi';

// The name for a visitor, delivery person or technician (owner, 30 Oct 2026: "it could be someone
// else"); their minutes add up under this one name, apart from the staff's.
export const SOMEONE_ELSE = 'Someone else';
// A box round an object, not a person (owner, 31 Oct 2026: a sack on the water jar was Person 3): left
// out of the day, and the camera drops boxes in that spot from then on (server cameraPeople.ts).
export const NOT_A_PERSON = 'Not a person';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

// A day number from the camera PC's boxes (owner, 30 Oct 2026): "p3" is Person 3 all day.
const isNumbered = (slot: string) => /^p\d+$/.test(slot);

/** "Red top, blue trousers", from the slot ("red", "red~blue", "red-2"): the server tells two people
 *  in the same top apart by their trousers (owner, 30 Oct 2026). "Person 3" for a numbered one. */
export function useTopName() {
  const { t } = useT();
  return (slot: string) => {
    if (isNumbered(slot)) return t('cam.personN', { n: slot.slice(1) });
    const [clothes, n] = slot.split('-');
    const [top, bottom] = clothes.split('~');
    let name = t(`cam.top.${top}` as I18nKey) || top;
    if (bottom) name = `${name}, ${t('cam.trousers', { colour: t(`cam.colour.${bottom}` as I18nKey) || bottom })}`;
    return n ? `${name} (${n})` : name;
  };
}

/** The names to pick from: staff, Someone else, and for a numbered box Not a person. */
function NameOptions({ staff, slot, skip }: { staff: string[]; slot: string; skip?: string | null }) {
  const { t } = useT();
  return (
    <>
      {staff.filter((n) => n !== skip).map((n) => <option key={n} value={n}>{n}</option>)}
      {skip !== SOMEONE_ELSE && <option value={SOMEONE_ELSE}>{t('cam.whoSomeoneElse')}</option>}
      {isNumbered(slot) && skip !== NOT_A_PERSON && <option value={NOT_A_PERSON}>{t('cam.whoNotPerson')}</option>}
    </>
  );
}

/** "Rudra Mahato 2/2 · Aniket Prasad 1/2": each name's tags today (server cameraPeople.ts tagState). */
function TagLine({ cameras }: { cameras: api.WhoIs['cameras'] }) {
  const { t } = useT();
  const tags: Record<string, number> = {};
  for (const c of cameras) for (const [n, k] of Object.entries(c.tags || {})) tags[n] = (tags[n] || 0) + k;
  const names = Object.keys(tags).sort();
  if (!names.length) return null;
  return (
    <p className="text-body-sm text-text-2">
      {t('cam.whoTags')}: {names.map((n, i) => (
        <span key={n}>{i > 0 && ' · '}<span className={tags[n] >= TAGS_NEEDED ? 'font-semibold text-success' : 'font-semibold text-text'}>{n} <span className="num">{Math.min(tags[n], TAGS_NEEDED)}/{TAGS_NEEDED}</span>{tags[n] >= TAGS_NEEDED && ' ✓'}</span></span>
      ))}
    </p>
  );
}
const TAGS_NEEDED = 2; // server cameraPeople.ts TAGS_NEEDED

/**
 * Who is who today (owner, 31 Oct 2026: "once marked don't show those, come up with new ones... mark
 * complete when all persons are tagged at least twice"): only people without a name are asked, and
 * someone named once is asked once more on a later photo ("Still Aniket?"). Each name needs two
 * tags - two numbers, or one number and a confirmed later photo; then the day is complete and the
 * card is one line. Every name can be changed in the Who is who tab (WhoIsEditor).
 */
export function WhoIsWho({ data, onSaved, onEdit }: { data: api.WhoIs | null; onSaved: () => void; onEdit?: () => void }) {
  const { t } = useT();
  const topName = useTopName();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || !data.cameras.some((c) => c.slots.length)) return null;
  const save = async (cameraId: string, slot: string, name: string, confirm?: 'yes' | 'no') => {
    if (!name && confirm !== 'yes') return;
    setBusy(`${cameraId}-${slot}`);
    try {
      await api.setWhoIs({ cameraId, date: data.date, slot, name, confirm });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cam.failed'));
    } finally {
      setBusy(null);
    }
  };
  const asks = data.cameras.flatMap((c) => [
    ...c.slots.filter((s) => (c.open || []).includes(s.slot)).map((s) => ({ c, s, confirm: false })),
    ...c.slots.filter((s) => (c.ask || []).includes(s.slot)).map((s) => ({ c, s, confirm: true })),
  ]);
  const editButton = onEdit && <Button size="sm" variant="secondary" onClick={onEdit}>{t('cam.whoEdit')}</Button>;
  if (!asks.length) {
    const complete = data.cameras.filter((c) => c.slots.length).every((c) => c.complete);
    const short = [...new Set(data.cameras.flatMap((c) => c.short || []))];
    return (
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4" aria-label={t('cam.whoTitle')}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-body-md font-semibold text-text">{t(complete ? 'cam.whoComplete' : 'cam.whoDone')}</h2>
          <TagLine cameras={data.cameras} />
          <p className="text-body-sm text-text-2">{complete ? t('cam.whoCompleteNote') : short.length ? t('cam.whoWaitingNote', { names: short.join(', ') }) : t('cam.whoDoneNote')}</p>
        </div>
        {editButton}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={t('cam.whoTitle')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-body-md font-semibold text-text">{t('cam.whoTitle')}</h2>
          <p className="text-body-sm text-text-2">{t('cam.whoBodyNew')}</p>
          <TagLine cameras={data.cameras} />
        </div>
        {editButton}
      </div>
      {asks.map(({ c, s, confirm }) => {
        const id = `${c.cameraId}-${s.slot}`;
        const photo = confirm ? s.confirmUrl : s.photoUrl;
        return (
          <div key={`${id}-${confirm ? 'c' : 'n'}`} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
            {photo && <img src={photo} alt={t(isNumbered(s.slot) ? 'cam.whoPhotoBox' : 'cam.whoPhoto', { top: topName(s.slot) })} className="max-h-72 w-full rounded-md bg-surface-2 object-contain" loading="lazy" />}
            {confirm ? (
              <div className="flex flex-col gap-2">
                <span className="text-body-sm font-medium text-text">{t('cam.whoConfirm', { name: s.name || '', at: s.confirmAt || '' })}</span>
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <Button disabled={busy === id} onClick={() => save(c.cameraId, s.slot, s.name || '', 'yes')}>{t('cam.whoYes')}</Button>
                  <NativeSelect aria-label={t('cam.whoNo')} value="" disabled={busy === id} onChange={(e) => save(c.cameraId, s.slot, e.target.value, 'no')}>
                    <option value="">{t('cam.whoNo')}</option>
                    <NameOptions staff={data.staff} slot={s.slot} skip={s.name} />
                  </NativeSelect>
                </div>
              </div>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-body-sm font-medium text-text">{t('cam.whoPerson', { top: topName(s.slot), from: s.first, to: s.last })}</span>
                <NativeSelect value="" disabled={busy === id} onChange={(e) => save(c.cameraId, s.slot, e.target.value)}>
                  <option value="">{t('cam.whoPick')}</option>
                  <NameOptions staff={data.staff} slot={s.slot} />
                </NativeSelect>
              </label>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** The Who is who tab: every person the camera numbered today or yesterday, with their photos, to
 *  change a name (owner, 31 Oct 2026: "keep an option to edit it in a different tab"). */
export function WhoIsEditor() {
  const { t } = useT();
  const topName = useTopName();
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const date = day === 'today' ? getTodayIST() : addDays(getTodayIST(), -1);
  const [data, setData] = useState<api.WhoIs | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    setData(null);
    api.getWhoIs(date).then(setData).catch(() => setError(true));
  }, [date]);
  useEffect(() => { load(); }, [load]);
  const save = async (cameraId: string, slot: string, name: string) => {
    if (!data) return;
    try {
      await api.setWhoIs({ cameraId, date: data.date, slot, name });
      api.getWhoIs(date).then(setData).catch(() => undefined); // the tags move with the name
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cam.failed'));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <FilterChips aria-label={t('cam.whoTab')} value={day} onValueChange={(v) => setDay(v as typeof day)}
        options={[{ value: 'today', label: t('cam.whoToday') }, { value: 'yesterday', label: t('cam.whoYesterday') }]} />
      <p className="text-body-sm text-text-2">{t('cam.whoEditBody')}</p>
      {error ? <ErrorState onRetry={load} /> : !data ? <p className="text-body-sm text-text-3">…</p> : !data.cameras.some((c) => c.slots.length) ? (
        <EmptyState compact icon={Users} title={t('cam.whoNone')} />
      ) : data.cameras.filter((c) => c.slots.length).map((c) => (
        <section key={c.cameraId} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-body-md font-semibold text-text">{c.cameraName}</h2>
            <TagLine cameras={[c]} />
          </div>
          {c.slots.map((s) => (
            <div key={s.slot} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className={s.confirmUrl ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
                {s.photoUrl && <img src={s.photoUrl} alt={t(isNumbered(s.slot) ? 'cam.whoPhotoBox' : 'cam.whoPhoto', { top: topName(s.slot) })} className="max-h-48 w-full rounded-md bg-surface-2 object-contain" loading="lazy" />}
                {s.confirmUrl && (
                  <figure className="flex flex-col gap-1">
                    <img src={s.confirmUrl} alt={t('cam.whoLater', { at: s.confirmAt || '' })} className="max-h-48 w-full rounded-md bg-surface-2 object-contain" loading="lazy" />
                    <figcaption className="text-body-sm text-text-2">{t('cam.whoLater', { at: s.confirmAt || '' })}{s.confirmed && ' ✓'}</figcaption>
                  </figure>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-body-sm font-medium text-text">{t('cam.whoPerson', { top: topName(s.slot), from: s.first, to: s.last })}</span>
                <NativeSelect value={s.name || ''} onChange={(e) => save(c.cameraId, s.slot, e.target.value)}>
                  <option value="">{t('cam.whoPick')}</option>
                  <NameOptions staff={data.staff} slot={s.slot} />
                </NativeSelect>
              </label>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// Five chart colours: folding, other kitchen work, cleaning, phone, idle / other.
const GROUPS: { key: string; label: string; acts: string[]; cls: string }[] = [
  { key: 'folding', label: 'Folding', acts: ['folding'], cls: 'bg-chart-1' },
  { key: 'work', label: 'Other kitchen work', acts: ['machine', 'prep', 'filling', 'cooking', 'packing'], cls: 'bg-chart-2' },
  { key: 'cleaning', label: 'Cleaning', acts: ['cleaning'], cls: 'bg-chart-4' },
  { key: 'phone', label: 'Phone', acts: ['phone'], cls: 'bg-chart-3' },
  { key: 'idle', label: 'Idle / other', acts: ['idle', 'other'], cls: 'bg-chart-5' },
];

const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** When folding started and ended and the most people folding at once (owner, 30 Oct 2026). The
 *  camera takes a picture every 105 seconds (since 31 Oct), so the times are within a few minutes. */
function FoldingMarker({ days, single }: { days: (api.KitchenTotals & { date: string })[]; single: boolean }) {
  const folded = days.filter((d) => d.folding);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-chart-1" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        {!folded.length ? (
          <p className="text-body-md font-semibold text-text">No folding seen{single && days[0]?.date === getTodayIST() ? ' yet today' : ''}</p>
        ) : single ? (
          <p className="text-body-md font-semibold text-text">
            Folding <span className="num">{folded[0].folding!.from}–{folded[0].folding!.to}</span>
            <span className="font-normal text-text-2"> · up to <span className="num font-semibold text-text">{folded[0].folding!.mostPeople}</span> {folded[0].folding!.mostPeople === 1 ? 'person' : 'people'} at once</span>
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-body-sm text-text">
            {folded.map((d) => (
              <li key={d.date}><span className="font-semibold">{dayName(d.date)}</span> · folding <span className="num">{d.folding!.from}–{d.folding!.to}</span>, up to <span className="num">{d.folding!.mostPeople}</span> at once</li>
            ))}
          </ul>
        )}
        <p className="text-body-sm text-text-2">First and last folding the camera saw; it takes a picture every couple of minutes, so each time is within a few minutes.</p>
      </div>
    </div>
  );
}

/** The whole kitchen empty for 15 minutes or more, like lunch (owner, 31 Oct 2026): a break for
 *  everyone, so it isn't counted as anyone's "not in kitchen". */
function BreakMarker({ days, single }: { days: (api.KitchenTotals & { date: string })[]; single: boolean }) {
  const breaks = days.filter((d) => d.empty?.length);
  if (!breaks.length) return null;
  const times = (d: (typeof breaks)[number]) => d.empty!.map((x, i) => (
    <span key={i} className="num">{i > 0 && ', '}{x.from}–{x.to} <span className="font-normal text-text-2">({hm(x.minutes)})</span></span>
  ));
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full border border-text-3" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        {single ? (
          <p className="text-body-md font-semibold text-text">Kitchen empty {times(breaks[0])}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-body-sm text-text">
            {breaks.map((d) => <li key={d.date}><span className="font-semibold">{dayName(d.date)}</span> · kitchen empty {times(d)}</li>)}
          </ul>
        )}
        <p className="text-body-sm text-text-2">Nobody in view for 15 minutes or more, like lunch: a break for everyone, so it isn't counted as anyone's "not in kitchen".</p>
      </div>
    </div>
  );
}

export function KitchenActivity() {
  const topName = useTopName();
  const today = getTodayIST();
  const [range, setRange] = useState<'today' | 'yesterday' | 'week'>('today');
  const [data, setData] = useState<api.Activity | null>(null);
  const [error, setError] = useState(false);
  const span = range === 'today' ? [today, today] : range === 'yesterday' ? [addDays(today, -1), addDays(today, -1)] : [addDays(today, -6), today];
  const load = useCallback(() => {
    setError(false);
    setData(null);
    api.getActivity(span[0], span[1]).then(setData).catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <FilterChips aria-label="Period" value={range} onValueChange={(v) => setRange(v as typeof range)}
        options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'week', label: 'Last 7 days' }]} />
      {error ? <ErrorState onRetry={load} /> : !data ? <p className="text-body-sm text-text-3">…</p> : !data.cameras.length ? (
        <EmptyState icon={Users} title="Kitchen activity isn't on for any camera" body="It counts what each person is doing from the camera stills." />
      ) : data.cameras.map((c) => (
        <section key={c.camera.id} className="flex flex-col gap-3">
          <h2 className="text-subtitle font-semibold text-text">{c.camera.place} · {c.camera.name}</h2>
          {!c.kitchen.stills ? <EmptyState compact icon={Users} title="No stills in this period" /> : (
            <>
              <FoldingMarker days={c.perDay} single={span[0] === span[1]} />
              <BreakMarker days={c.perDay} single={span[0] === span[1]} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Folding" value={<span className="num">{c.kitchen.foldingHours} h</span>} caption="all people" />
                <StatTile label="Pieces made" value={<span className="num">{c.kitchen.piecesMade.toLocaleString('en-IN')}</span>} caption="production entries" />
                <StatTile label="Pieces per folding hour" value={<span className="num">{c.kitchen.piecesPerFoldingHour ?? '–'}</span>} />
                <StatTile label="On the phone" value={<span className="num">{hm(c.kitchen.phoneMinutes)}</span>} caption="all people" />
              </div>
              <p className="text-body-sm text-text-2">
                {c.camera.burst && c.kitchen.bursts
                  ? <>From {c.kitchen.bursts} burst{c.kitchen.bursts === 1 ? '' : 's'} of {c.camera.burst.frames} pictures, one every {c.camera.burst.gapSec} seconds: each picture stands for about {Math.round((c.camera.burst.gapSec / 60) * 100) / 100} minutes</>
                  : <>From {c.kitchen.stills} stills, one every {c.camera.everyMin} minutes: each sighting counts {c.camera.everyMin} minutes</>}
                , so these are estimates, good for trends. Unnamed people show by the colour of their top - name them in "Who is who".
                {' '}Not in kitchen: gone 15 minutes or more between when they were first and last seen that day while others were working (shorter is just out of view; the whole kitchen empty is a break).
              </p>
              <div className="flex flex-col gap-3">
                {c.people.map((p, i) => {
                  const total = Math.max(1, p.seenMinutes);
                  const groupMin = (acts: string[]) => acts.reduce((s, a) => s + (p.minutes[a] || 0), 0);
                  return (
                    <article key={`${p.name || p.slot}-${i}`} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-body-md font-semibold text-text">{p.name || `${topName(p.slot)} (not named)`}</span>
                        <span className="num text-body-sm text-text-2">seen {hm(p.seenMinutes)} · {p.first}–{p.last}</span>
                      </div>
                      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={GROUPS.map((g) => `${g.label} ${hm(groupMin(g.acts))}`).join(', ')}>
                        {GROUPS.map((g) => <span key={g.key} className={g.cls} style={{ width: `${(groupMin(g.acts) / total) * 100}%` }} />)}
                      </div>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-text-2">
                        {GROUPS.map((g) => (
                          <li key={g.key} className="flex items-center gap-1.5">
                            <span className={`size-2.5 rounded-xs ${g.cls}`} aria-hidden="true" />
                            {g.label} <span className="num font-semibold text-text">{hm(groupMin(g.acts))}</span>
                          </li>
                        ))}
                        {!!p.notInKitchenMinutes && (
                          <li className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-xs border border-text-3" aria-hidden="true" />
                            Not in kitchen <span className="num font-semibold text-text">{hm(p.notInKitchenMinutes)}</span>
                          </li>
                        )}
                      </ul>
                      {!!p.away?.length && (
                        <p className="text-body-sm text-text-2">
                          Away (last seen – back): {p.away.map((a, j) => (
                            <span key={j} className="num">
                              {j > 0 && ', '}{span[0] !== span[1] && `${dayName(a.date)} `}<span className="font-semibold text-text">{a.from}–{a.to}</span>
                            </span>
                          ))}
                        </p>
                      )}
                      <p className="text-body-sm text-text-2">
                        Phone: <span className="num font-semibold text-text">{p.phoneTimes}</span> time{p.phoneTimes === 1 ? '' : 's'}, {hm(p.phoneMinutes)}
                        {p.ppePercent !== null && <> · Cap, gloves, apron all on: <span className="num font-semibold text-text">{p.ppePercent}%</span></>}
                        {' · '}{Object.entries(p.minutes).filter(([, m]) => m).map(([a, m]) => `${data.labels[a] || a} ${hm(m)}`).join(', ')}
                      </p>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
