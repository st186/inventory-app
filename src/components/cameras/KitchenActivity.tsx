// Kitchen activity from the camera stills (owner, 29 Oct 2026; server cctv.ts + activityRules.ts):
//  - WhoIsWho: the day's people by the colour of their top, with a photo, for the owner, the
//    operations manager or the place's incharge to put a name to each (once a day);
//  - KitchenActivity (owner only): per person, minutes folding, at other kitchen work, cleaning, on
//    the phone and idle, how often on the phone, PPE share; for the kitchen, folding hours and
//    pieces made per folding hour. Work sampling: each still stands for the minutes since the last.
import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { useT, type I18nKey } from '../../utils/i18n';
import { getTodayIST } from '../../utils/timezone';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { FilterChips } from '../ui/chip';
import { NativeSelect } from '../ui/select';
import { StatTile } from '../ui/stat-tile';
import * as api from './camerasApi';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

/** "Red top", from the colour slot ("red", "red-2"). */
export function useTopName() {
  const { t } = useT();
  return (slot: string) => {
    const [colour, n] = slot.split('-');
    const name = t(`cam.top.${colour}` as I18nKey) || colour;
    return n ? `${name} (${n})` : name;
  };
}

export function WhoIsWho() {
  const { t } = useT();
  const topName = useTopName();
  const [data, setData] = useState<api.WhoIs | null>(null);
  const load = useCallback(() => { api.getWhoIs(getTodayIST()).then(setData).catch(() => setData(null)); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data || !data.cameras.some((c) => c.slots.length)) return null;
  const save = async (cameraId: string, slot: string, name: string) => {
    try {
      await api.setWhoIs({ cameraId, date: data.date, slot, name });
      setData({ ...data, cameras: data.cameras.map((c) => (c.cameraId !== cameraId ? c : { ...c, slots: c.slots.map((s) => (s.slot === slot ? { ...s, name: name || null } : s)) })) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cam.failed'));
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={t('cam.whoTitle')}>
      <div className="flex flex-col gap-1">
        <h2 className="text-body-md font-semibold text-text">{t('cam.whoTitle')}</h2>
        <p className="text-body-sm text-text-2">{t('cam.whoBody')}</p>
      </div>
      {data.cameras.map((c) => c.slots.map((s) => (
        <div key={`${c.cameraId}-${s.slot}`} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
          {s.photoUrl && <img src={s.photoUrl} alt={t('cam.whoPhoto', { top: topName(s.slot) })} className="max-h-72 w-full rounded-md bg-surface-2 object-contain" loading="lazy" />}
          <label className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-text">{t('cam.whoPerson', { top: topName(s.slot), from: s.first, to: s.last })}</span>
            <NativeSelect value={s.name || ''} onChange={(e) => save(c.cameraId, s.slot, e.target.value)}>
              <option value="">{t('cam.whoPick')}</option>
              {data.staff.map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect>
          </label>
        </div>
      )))}
    </section>
  );
}

// Five chart colours: folding, other kitchen work, cleaning, phone, idle / other.
const GROUPS: { key: string; label: string; acts: string[]; cls: string }[] = [
  { key: 'folding', label: 'Folding', acts: ['folding'], cls: 'bg-chart-1' },
  { key: 'work', label: 'Other kitchen work', acts: ['machine', 'filling', 'cooking', 'packing'], cls: 'bg-chart-2' },
  { key: 'cleaning', label: 'Cleaning', acts: ['cleaning'], cls: 'bg-chart-4' },
  { key: 'phone', label: 'Phone', acts: ['phone'], cls: 'bg-chart-3' },
  { key: 'idle', label: 'Idle / other', acts: ['idle', 'other'], cls: 'bg-chart-5' },
];

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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Folding" value={<span className="num">{c.kitchen.foldingHours} h</span>} caption="all people" />
                <StatTile label="Pieces made" value={<span className="num">{c.kitchen.piecesMade.toLocaleString('en-IN')}</span>} caption="production entries" />
                <StatTile label="Pieces per folding hour" value={<span className="num">{c.kitchen.piecesPerFoldingHour ?? '–'}</span>} />
                <StatTile label="On the phone" value={<span className="num">{hm(c.kitchen.phoneMinutes)}</span>} caption="all people" />
              </div>
              <p className="text-body-sm text-text-2">
                From {c.kitchen.stills} stills, one every {c.camera.everyMin} minutes: each sighting counts {c.camera.everyMin} minutes, so these are estimates, good for trends. Unnamed people show by the colour of their top - name them in "Who is who".
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
                      </ul>
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
