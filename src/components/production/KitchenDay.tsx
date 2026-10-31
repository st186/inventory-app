// The production day in the order the kitchen works (owner, 31 Oct 2026: "looking at it I don't
// understand anything. It should be like: morning stock count for dough or sauces or batter; log
// batch where he creates more stuffing and dough and batter (sauces are finished products); end of
// day he logs what finished product was made including momos and sauces; and what is left in dough
// and stuffing and batter or sauces"). Four steps, top to bottom:
//   1. Morning count - dough, cheese corn dough, batter, each stuffing and every sauce, before
//      anything is made (last night's count filled in to confirm).
//   2. Batches made - each dough / stuffing / batter batch as it is made (makeForm).
//   3. Made today - momos of each type and sauces made (madeForm).
//   4. Left tonight - the night count and the close (nightForm, EndOfDayCloseForm).
// Then "How the day adds up": per item, morning + made - used for the momos = should be left,
// next to what was counted; per sauce, morning + made - left = went out. Bunny (server coach route)
// says what to make in plain words; the sums are kitchenDayMath.ts.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Scale, Sparkles } from 'lucide-react';
import type { LastCounted, MorningWeighIn, ProductionLedgerPoolState } from '../../utils/api';
import * as api from '../../utils/api';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Input } from '../ui/input';
import { StatusChip } from '../ui/status-chip';
import { cn } from '../ui/utils';
import { toast } from '../ui/sonner';
import { momoName } from '../stock/stockShared';
import { MOMO_TYPES } from '../../constants/momoTypes';
import { looksLikeGrams } from './ledgerKg';
import { THAW_HOURS, coachFacts, countState, gapMatters, isFilling, itemDay, itemsForDay, type Item, type ItemDay } from './kitchenDayMath';

/** The guided day applies from this date (earlier days keep the old layout's data as it is). */
export const KITCHEN_DAY_FROM = '2026-10-30';

export type SauceItem = { key: string; label: string; unit: 'L' | 'kg' };
export const sauceId = (key: string) => `sauce:${key}`;

type Props = {
  date: string;
  houseId: string;
  accessToken: string;
  pools: Record<string, ProductionLedgerPoolState>;
  morning: MorningWeighIn | null;
  lastCounted: LastCounted;
  plan: Record<string, number> | null;
  pieces: Record<string, number>; // momos entered today, by inventory key
  perKg: Record<string, number>;
  sauces: SauceItem[];
  saucesMade: Record<string, number>;       // sauce key -> made today (the production entry)
  sauceLeft: Record<string, number> | null; // sauce:key -> counted tonight (the closed day)
  madeDone: boolean;                        // momos for the day sent
  closed: boolean;
  canEdit: boolean;
  onWeighed: () => void | Promise<void>;
  makeForm: React.ReactNode;   // step 2: batches
  madeForm: React.ReactNode;   // step 3: momos and sauces made
  nightForm: React.ReactNode;  // step 4: left tonight, and the close
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const kg = (n: number) => `${r2(n)} kg`;
// Saved times hold India time already (getNowIST), so they are read as UTC.
const clock12 = (iso: string) => { const [h, m] = iso.slice(11, 16).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`; };

export function useItemLabel() {
  const { t, lang } = useT();
  return (it: Item) => {
    const m = MOMO_TYPES.find((x) => x.inventoryKey === it.type);
    const typeName = m ? momoName(lang, m.inventoryKey, m.label) : it.type || '';
    if (it.kind === 'dough') {
      const dough = t('stock.prod.dough').replace(/ \(.*\)$/, '');
      return it.type ? `${typeName} ${dough.toLowerCase()}` : dough;
    }
    if (it.kind === 'batter') return t('stock.prod.batter').replace(/ \(.*\)$/, '');
    const what = (it.kind === 'stuffing' ? t('stock.prod.stuffingKg') : t('stock.prod.coatingKg')).replace(/ \(.*\)$/, '');
    return `${typeName} ${what.toLowerCase()}`;
  };
}

function MorningWeighInForm({ items, sauces, lastCounted, date, morning, onSave }: {
  items: Item[]; sauces: SauceItem[]; lastCounted: LastCounted; date: string; morning: MorningWeighIn | null;
  onSave: (counts: Record<string, number>, thaw: Record<string, { frozen: boolean }>) => Promise<void>;
}) {
  const { t } = useT();
  const label = useItemLabel();
  const rows = [
    ...items.map((it) => ({ id: it.id, name: label(it), unit: 'kg', item: it as Item | null })),
    ...sauces.map((s) => ({ id: sauceId(s.key), name: s.label, unit: s.unit, item: null })),
  ];
  // Last night's count is filled in to confirm; anything older or never counted starts empty.
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => {
    if (morning && typeof morning.counts[row.id] === 'number') return [row.id, String(morning.counts[row.id])];
    const s = countState({ id: row.id, kind: 'dough', type: null }, lastCounted, date);
    return [row.id, s.state === 'last_night' ? String(s.kg) : ''];
  })));
  // Stuffing there in the morning: frozen (default) or thawed in the fridge overnight.
  const [frozen, setFrozen] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((it) => [it.id, morning?.thaw?.[it.id]?.frozen ?? true])));
  const [saving, setSaving] = useState(false);
  const grams = Object.values(values).some(looksLikeGrams);
  const missing = rows.filter((row) => (values[row.id] ?? '').trim() === '');

  const save = async () => {
    if (grams) return;
    if (missing.length) { toast.error(t('kd.errAll', { items: missing.map((row) => row.name).join(', ') })); return; }
    setSaving(true);
    try {
      const counts = Object.fromEntries(rows.map((row) => [row.id, parseFloat(values[row.id]) || 0]));
      await onSave(counts, Object.fromEntries(items.filter((it) => isFilling(it) && counts[it.id] > 0).map((it) => [it.id, { frozen: frozen[it.id] !== false }])));
      toast.success(t('kd.weighedSaved'));
    } catch (e: any) {
      toast.error(e?.message || t('stock.prod.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const row = (r: typeof rows[number]) => {
    const s = countState({ id: r.id, kind: 'dough', type: null }, lastCounted, date);
    const amount = (n: number) => `${r2(n)} ${r.unit}`;
    const hint = s.state === 'last_night' ? t('kd.lastNight', { kg: amount(s.kg || 0) })
      : s.state === 'stale' ? t('kd.lastWeighed', { date: new Date(`${s.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }), kg: amount(s.kg || 0) })
        : t('kd.neverWeighed');
    return (
      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-body-md font-medium text-text">{r.name}</span>
          <span className={cn('text-caption', s.state === 'last_night' ? 'text-text-3' : 'text-warning')}>{hint}</span>
          {r.item && isFilling(r.item) && (parseFloat(values[r.id] || '') || 0) > 0 && (
            <span className="flex flex-wrap gap-1.5" role="group" aria-label={t('kd.frozenQ')}>
              {[true, false].map((f) => (
                <button key={String(f)} type="button" aria-pressed={(frozen[r.id] !== false) === f} onClick={() => setFrozen((cur) => ({ ...cur, [r.id]: f }))}
                  className={cn('hit-44 inline-flex min-h-8 items-center rounded-full border px-2.5 text-caption font-medium',
                    (frozen[r.id] !== false) === f ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-text-2')}>
                  {f ? t('kd.frozen', { h: THAW_HOURS }) : t('kd.thawed')}
                </button>
              ))}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setValues((v) => ({ ...v, [r.id]: '0' }))}>{t('kd.none')}</Button>
          <Input
            type="text" inputMode="decimal" className="num w-24 text-right" aria-label={`${r.name} (${r.unit})`}
            placeholder={t('kd.countIt')} value={values[r.id] ?? ''}
            onChange={(e) => { const v = e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''); setValues((cur) => ({ ...cur, [r.id]: v })); }}
          />
          <span className="w-6 text-body-sm text-text-2">{r.unit}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-text-2">{t('kd.weighHint')}</p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
        {rows.filter((r) => r.item).map(row)}
      </div>
      {sauces.length > 0 && (
        <>
          <h4 className="mx-1 text-label font-semibold text-text-2">{t('stock.prod.sauces')}</h4>
          <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
            {rows.filter((r) => !r.item).map(row)}
          </div>
        </>
      )}
      {grams && <p className="text-caption text-danger" role="alert">{t('stock.prod.looksLikeGrams')}</p>}
      <Button className="self-start" leadingIcon={<Scale />} loading={saving} disabled={grams} onClick={save}>{t('kd.saveWeighIn')}</Button>
    </div>
  );
}

function Bunny({ lines, ai }: { lines: string[]; ai: string | null }) {
  const { t } = useT();
  if (!lines.length && !ai) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
      <p className="flex items-center gap-2 text-body-sm font-semibold text-text"><Sparkles className="size-4 text-primary" aria-hidden="true" />{t('kd.bunny')}</p>
      {ai ? <p className="whitespace-pre-line text-body-sm text-text">{ai}</p> : (
        <ul className="flex flex-col gap-1">{lines.map((l) => <li key={l} className="text-body-sm text-text">{l}</li>)}</ul>
      )}
    </div>
  );
}

/** One numbered step of the day. */
function Step({ n, title, hint, done, current, children }: { n: number; title: string; hint?: string; done: boolean; current: boolean; children: React.ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-lg border p-4', current ? 'border-primary/50 bg-surface' : 'border-border bg-surface')} aria-label={title}>
      <div className="flex items-start gap-3">
        <span className={cn('num flex size-7 shrink-0 items-center justify-center rounded-full text-label font-semibold',
          done ? 'bg-success-soft text-success' : current ? 'bg-primary text-on-primary' : 'bg-surface-2 text-text-2')} aria-hidden="true">
          {done ? <CheckCircle2 className="size-4" /> : n}
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="text-body-md font-semibold text-text">{title}</h3>
          {hint && <p className="text-caption text-text-3">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A small table cell: the head over the number. */
function Cell({ head, v, strong = false, warn = false }: { head: string; v: number | null; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-0.5">
      <dt className="text-caption leading-tight text-text-3">{head}</dt>
      <dd className={cn('num text-body-sm', warn ? 'font-semibold text-warning' : strong ? 'font-semibold text-text' : 'text-text-2')}>{v === null ? '–' : r2(v)}</dd>
    </div>
  );
}

function DayRow({ d, closed, readyAt }: { d: ItemDay; closed: boolean; readyAt: string | null }) {
  const { t } = useT();
  const label = useItemLabel();
  const thawNote = !closed && d.frozen && d.freshEarly !== null
    ? [t('kd.frozenPlan', { time: readyAt || '', kg: kg(Math.max(0, d.makeKg || 0)) }), d.rollsOver && d.rollsOver > 0.5 ? t('kd.rollsOver', { kg: kg(d.rollsOver) }) : ''].filter(Boolean).join(' ')
    : null;
  const note = thawNote || (d.counted !== null
    ? (gapMatters(d) ? (d.gap! > 0 ? t('kd.moreLeft', { kg: kg(d.gap!) }) : t('kd.lessLeft', { kg: kg(-d.gap!) })) : d.overMade ? t('kd.overMade') : null)
    : d.overMade ? t('kd.overMade')
      : d.makeKg === null || !d.planned ? null
        : d.made > 0 ? (d.stillToMake! > 0 ? t('kd.makeMore', { kg: kg(d.stillToMake!) }) : t('kd.enoughMade'))
          : d.makeKg > 0 ? t('kd.makeAbout', { kg: kg(d.makeKg) })
            : t('kd.enough', { n: (d.covers || 0).toLocaleString('en-IN') }));
  const off = d.counted !== null && gapMatters(d);
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-md font-medium text-text">{label(d.item)} <span className="text-caption font-normal text-text-3">kg</span></span>
        {d.planned > 0 && <span className="num text-caption text-text-3">{t('kd.planMomos', { n: d.planned.toLocaleString('en-IN') })}</span>}
      </div>
      <dl className="grid grid-cols-5 gap-1.5">
        <Cell head={t('kd.morning')} v={d.morning} />
        <Cell head={t('kd.plusMade')} v={d.made} />
        <Cell head={t('kd.minusUsed')} v={d.used} />
        <Cell head={t('kd.shouldLeft')} v={d.shouldLeft} />
        <Cell head={t('kd.counted')} v={d.counted} strong warn={off} />
      </dl>
      {d.usedPieces > 0 && <p className="num text-caption text-text-3">{t('kd.usedFor', { n: d.usedPieces.toLocaleString('en-IN') })}</p>}
      {note && <p className={cn('text-caption', off || d.overMade ? 'text-warning' : 'text-text-2')}>{note}</p>}
    </div>
  );
}

function SauceRow({ s, morning, made, left }: { s: SauceItem; morning: number | null; made: number; left: number | null }) {
  const { t } = useT();
  const out = morning !== null && left !== null ? r2(morning + made - left) : null;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-body-md font-medium text-text">{s.label} <span className="text-caption font-normal text-text-3">{s.unit}</span></span>
      <dl className="grid grid-cols-4 gap-1.5">
        <Cell head={t('kd.morning')} v={morning} />
        <Cell head={t('kd.plusMade')} v={made} />
        <Cell head={t('kd.minusLeft')} v={left} />
        <Cell head={t('kd.wentOut')} v={out} strong warn={out !== null && out < -0.05} />
      </dl>
      {out !== null && out < -0.05 && <p className="text-caption text-warning">{t('kd.sauceMore')}</p>}
    </div>
  );
}

export function KitchenDay({ date, houseId, accessToken, pools, morning, lastCounted, plan, pieces, perKg, sauces, saucesMade, sauceLeft, madeDone, closed, canEdit, onWeighed, makeForm, madeForm, nightForm }: Props) {
  const { t, lang } = useT();
  const label = useItemLabel();
  const items = useMemo(() => itemsForDay(pools, plan, lastCounted), [pools, plan, lastCounted]);
  const days = useMemo(() => items.map((it) => itemDay(it, pools[it.id], plan, pieces, perKg, { frozen: !!morning?.thaw?.[it.id]?.frozen })), [items, pools, plan, pieces, perKg, morning]);
  // When the frozen stock is ready: the weigh-in time + the thaw.
  const readyAt = morning ? (() => { const [h, m] = morning.at.slice(11, 16).split(':').map(Number); const mins = h * 60 + m + THAW_HOURS * 60; const hh = Math.floor(mins / 60) % 24; return `${hh % 12 || 12}:${String(Math.round(mins % 60)).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`; })() : null;
  const stale = items.filter((it) => countState(it, lastCounted, date).state !== 'last_night' && !(morning && typeof morning.counts[it.id] === 'number'));
  const weighed = !!morning || closed;
  const [weighAgain, setWeighAgain] = useState(false);
  const step = closed ? 5 : !weighed ? 1 : madeDone ? 4 : 2;

  // Bunny's own words: the morning plan once weighed, the summary once the day is closed.
  const stage: 'morning' | 'summary' | null = closed ? 'summary' : weighed ? 'morning' : null;
  const facts = useMemo(() => coachFacts(days, label, stale.map(label)), [days, stale.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ai, setAi] = useState<string | null>(null);
  useEffect(() => {
    setAi(null);
    if (!stage || !days.length) return;
    let cancelled = false;
    api.getProductionCoach(accessToken, houseId, date, stage, lang, facts).then((txt) => { if (!cancelled) setAi(txt || null); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [stage, lang, JSON.stringify(facts)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The same advice in plain lines, straight away (and if Bunny can't be reached).
  const lines = !weighed
    ? [t('kd.weighFirst')]
    : days.flatMap((d) => {
      if (closed) return gapMatters(d) ? [`${label(d.item)}: ${d.gap! > 0 ? t('kd.moreLeft', { kg: kg(d.gap!) }) : t('kd.lessLeft', { kg: kg(-d.gap!) })}`] : [];
      if (d.makeKg === null || !d.planned) return [];
      if (d.frozen && !d.made) return [`${label(d.item)}: ${t('kd.frozenPlan', { time: readyAt || '', kg: kg(d.makeKg) })}${d.rollsOver && d.rollsOver > 0.5 ? ` ${t('kd.rollsOver', { kg: kg(d.rollsOver) })}` : ''}`];
      if (d.overMade) return [`${label(d.item)}: ${t('kd.overMade')}`];
      if (d.made > 0) return d.stillToMake! > 0 ? [`${label(d.item)}: ${t('kd.makeMore', { kg: kg(d.stillToMake!) })}`] : [];
      return [d.makeKg > 0 ? `${label(d.item)}: ${t('kd.makeAbout', { kg: kg(d.makeKg) })}` : `${label(d.item)}: ${t('kd.enough', { n: (d.covers || 0).toLocaleString('en-IN') })}`];
    });

  const sauceMorning = (key: string) => (morning && typeof morning.counts[sauceId(key)] === 'number' ? morning.counts[sauceId(key)] : null);
  const shownSauces = sauces.filter((s) => (sauceMorning(s.key) || 0) > 0 || (saucesMade[s.key] || 0) > 0 || (sauceLeft?.[sauceId(s.key)] || 0) > 0);
  const anything = weighed || days.some((d) => d.made > 0 || d.usedPieces > 0);

  const check = anything && (
    <section className="flex flex-col gap-2" aria-label={t('kd.checkTitle')}>
      <div className="mx-1 flex flex-col">
        <h3 className="text-body-md font-semibold text-text">{t('kd.checkTitle')}</h3>
        <p className="text-caption text-text-3">{t('kd.checkHint')}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
        {days.map((d) => <DayRow key={d.item.id} d={d} closed={closed} readyAt={readyAt} />)}
        {shownSauces.map((s) => <SauceRow key={s.key} s={s} morning={sauceMorning(s.key)} made={saucesMade[s.key] || 0} left={typeof sauceLeft?.[sauceId(s.key)] === 'number' ? sauceLeft[sauceId(s.key)] : null} />)}
      </div>
    </section>
  );

  // What was counted this morning, once saved: a line per item there, and the rest as "None: ...".
  const counted = morning ? [...items.map((it) => ({ id: it.id, name: label(it), unit: 'kg' })), ...sauces.map((s) => ({ id: sauceId(s.key), name: s.label, unit: s.unit }))]
    .filter((r) => typeof morning.counts[r.id] === 'number') : [];
  const none = counted.filter((r) => !(morning!.counts[r.id] > 0));
  const morningSummary = morning && (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {counted.filter((r) => morning.counts[r.id] > 0).map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="text-text-2">{r.name}</span>
            <span className="num font-medium text-text">{r2(morning.counts[r.id])} {r.unit}</span>
          </li>
        ))}
      </ul>
      {none.length > 0 && <p className="text-caption text-text-3">{t('kd.noneOf', { items: none.map((r) => r.name).join(', ') })}</p>}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-1 flex flex-col gap-1">
        <h2 className="text-subtitle font-semibold text-text">{t('kd.title')}</h2>
        {closed && <StatusChip tone="success" className="self-start"><CheckCircle2 className="size-3.5" aria-hidden="true" /> {t('stock.prod.dayClosed')}</StatusChip>}
      </div>

      <Bunny lines={lines} ai={ai} />
      {/* The owner reads the sums first; the incharge works down the steps. */}
      {!canEdit && check}

      <Step n={1} title={t('kd.step1')} hint={morning ? t('kd.weighedBy', { name: morning.byName, time: clock12(morning.at) }) : undefined} done={weighed} current={step === 1}>
        {canEdit && !closed && (!weighed || weighAgain) ? (
          <MorningWeighInForm items={items} sauces={sauces} lastCounted={lastCounted} date={date} morning={morning}
            onSave={async (counts, thaw) => { await api.saveMorningWeighIn(accessToken, houseId, date, counts, thaw); setWeighAgain(false); await onWeighed(); }} />
        ) : morning ? (
          <>
            {morningSummary}
            {canEdit && !closed && <Button variant="link" size="sm" className="self-start" onClick={() => setWeighAgain(true)}>{t('kd.weighAgain')}</Button>}
          </>
        ) : (
          <Callout tone="neutral" title={t('kd.notWeighedYet')} />
        )}
      </Step>

      <Step n={2} title={t('kd.step2')} hint={t('kd.step2Hint')} done={closed} current={step === 2}>
        {canEdit && !weighed && <p className="text-body-sm text-text-2">{t('kd.countFirst')}</p>}
        {makeForm}
      </Step>

      <Step n={3} title={t('kd.step3')} hint={t('kd.step3Hint')} done={madeDone} current={false}>
        {madeForm}
      </Step>

      <Step n={4} title={t('kd.step4')} hint={t('kd.step4Hint')} done={closed} current={step === 4}>
        {canEdit && !weighed ? <p className="text-body-sm text-text-2">{t('kd.countFirst')}</p> : nightForm}
      </Step>

      {canEdit && check}
    </div>
  );
}
