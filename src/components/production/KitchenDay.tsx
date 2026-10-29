// The guided production day (owner, 29 Oct 2026: "revamp it for easy understanding with AI
// integration for proper handholding of the production incharge"). One card, three steps:
//   1. Weigh in the morning - what is in the kitchen before anything is made (the day starts from
//      this, never from a figure carried for weeks; last night's count is filled in to confirm).
//   2. Make - Bunny says what to make from today's plan and what is already there; batches are
//      logged as they are made (the batch form asks why when yesterday's is still there).
//   3. Count at night - each item next to what should be left (morning + made - used for the
//      momos entered); the leftover reasons and the close are EndOfDayCloseForm.
// One line per item tells the whole day. Bunny (server coach route) puts it in plain words in the
// reader's language; the sums are kitchenDayMath.ts.
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
import { THAW_HOURS, coachFacts, countState, gapMatters, itemDay, itemsForDay, type Item, type ItemDay } from './kitchenDayMath';

/** The guided day applies from this date (earlier days keep the old layout's data as it is). */
export const KITCHEN_DAY_FROM = '2026-10-30';

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
  closed: boolean;
  canEdit: boolean;
  onWeighed: () => void | Promise<void>;
  makeForm: React.ReactNode;   // batch logging (step 2)
  nightForm: React.ReactNode;  // the night count and close (step 3)
};

const kg = (n: number) => `${Math.round(n * 100) / 100} kg`;

export function useItemLabel() {
  const { t, lang } = useT();
  return (it: Item) => {
    if (it.kind === 'dough') return t('stock.prod.dough').replace(/ \(.*\)$/, '');
    if (it.kind === 'batter') return t('stock.prod.batter').replace(/ \(.*\)$/, '');
    const m = MOMO_TYPES.find((x) => x.inventoryKey === it.type);
    const what = (it.kind === 'stuffing' ? t('stock.prod.stuffingKg') : t('stock.prod.coatingKg')).replace(/ \(.*\)$/, '');
    return `${m ? momoName(lang, m.inventoryKey, m.label) : it.type} ${what.toLowerCase()}`;
  };
}

function MorningWeighInForm({ items, lastCounted, date, morning, onSave }: {
  items: Item[]; lastCounted: LastCounted; date: string; morning: MorningWeighIn | null;
  onSave: (counts: Record<string, number>, thaw: Record<string, { frozen: boolean }>) => Promise<void>;
}) {
  const { t } = useT();
  const label = useItemLabel();
  // Last night's count is filled in to confirm; anything older or never weighed starts empty.
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(items.map((it) => {
    if (morning && typeof morning.counts[it.id] === 'number') return [it.id, String(morning.counts[it.id])];
    const s = countState(it, lastCounted, date);
    return [it.id, s.state === 'last_night' ? String(s.kg) : ''];
  })));
  // Stuffing there in the morning: frozen (default) or thawed in the fridge overnight.
  const [frozen, setFrozen] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((it) => [it.id, morning?.thaw?.[it.id]?.frozen ?? true])));
  const [saving, setSaving] = useState(false);
  const grams = Object.values(values).some(looksLikeGrams);
  const missing = items.filter((it) => (values[it.id] ?? '').trim() === '');

  const save = async () => {
    if (grams) return;
    if (missing.length) { toast.error(t('kd.errAll', { items: missing.map(label).join(', ') })); return; }
    setSaving(true);
    try {
      const counts = Object.fromEntries(items.map((it) => [it.id, parseFloat(values[it.id]) || 0]));
      await onSave(counts, Object.fromEntries(items.filter((it) => it.type && counts[it.id] > 0).map((it) => [it.id, { frozen: frozen[it.id] !== false }])));
      toast.success(t('kd.weighedSaved'));
    } catch (e: any) {
      toast.error(e?.message || t('stock.prod.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t('kd.step1')}>
      <p className="text-body-sm text-text-2">{t('kd.weighHint')}</p>
      <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
        {items.map((it) => {
          const s = countState(it, lastCounted, date);
          const hint = s.state === 'last_night' ? t('kd.lastNight', { kg: kg(s.kg || 0) })
            : s.state === 'stale' ? t('kd.lastWeighed', { date: new Date(`${s.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }), kg: kg(s.kg || 0) })
              : t('kd.neverWeighed');
          return (
            <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-body-md font-medium text-text">{label(it)}</span>
                <span className={cn('text-caption', s.state === 'last_night' ? 'text-text-3' : 'text-warning')}>{hint}</span>
                {it.type && (parseFloat(values[it.id] || '') || 0) > 0 && (
                  <span className="flex flex-wrap gap-1.5" role="group" aria-label={t('kd.frozenQ')}>
                    {[true, false].map((f) => (
                      <button key={String(f)} type="button" aria-pressed={(frozen[it.id] !== false) === f} onClick={() => setFrozen({ ...frozen, [it.id]: f })}
                        className={cn('hit-44 inline-flex min-h-8 items-center rounded-full border px-2.5 text-caption font-medium',
                          (frozen[it.id] !== false) === f ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-text-2')}>
                        {f ? t('kd.frozen', { h: THAW_HOURS }) : t('kd.thawed')}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setValues({ ...values, [it.id]: '0' })}>{t('kd.none')}</Button>
                <Input
                  type="text" inputMode="decimal" className="num w-28 text-right" aria-label={`${label(it)} (kg)`}
                  placeholder={t('stock.prod.weighIt')} value={values[it.id] ?? ''}
                  onChange={(e) => setValues({ ...values, [it.id]: e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '') })}
                />
                <span className="w-6 text-body-sm text-text-2">kg</span>
              </div>
            </div>
          );
        })}
      </div>
      {grams && <p className="text-caption text-danger" role="alert">{t('stock.prod.looksLikeGrams')}</p>}
      <Button className="self-start" leadingIcon={<Scale />} loading={saving} disabled={grams} onClick={save}>{t('kd.saveWeighIn')}</Button>
    </section>
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

function DayRow({ d, closed, readyAt }: { d: ItemDay; closed: boolean; readyAt: string | null }) {
  const { t } = useT();
  const label = useItemLabel();
  const thawNote = !closed && d.frozen && d.freshEarly !== null
    ? [t('kd.frozenPlan', { time: readyAt || '', kg: kg(Math.max(0, d.makeKg || 0)) }), d.rollsOver && d.rollsOver > 0.5 ? t('kd.rollsOver', { kg: kg(d.rollsOver) }) : ''].filter(Boolean).join(' ')
    : null;
  const note = thawNote || (closed
    ? (gapMatters(d) ? (d.gap! > 0 ? t('kd.moreLeft', { kg: kg(d.gap!) }) : t('kd.lessLeft', { kg: kg(-d.gap!) })) : d.overMade ? t('kd.overMade') : null)
    : d.overMade ? t('kd.overMade')
      : d.makeKg === null || !d.planned ? null
        : d.made > 0 ? (d.stillToMake! > 0 ? t('kd.makeMore', { kg: kg(d.stillToMake!) }) : t('kd.enoughMade'))
          : d.makeKg > 0 ? t('kd.makeAbout', { kg: kg(d.makeKg) })
            : t('kd.enough', { n: (d.covers || 0).toLocaleString('en-IN') }));
  const warn = (closed && gapMatters(d)) || d.overMade;
  const cell = (head: string, v: number | null, strong = false) => (
    <div className="flex flex-col">
      <dt className="text-caption text-text-3">{head}</dt>
      <dd className={cn('num text-body-sm', strong ? 'font-semibold text-text' : 'text-text-2')}>{v === null ? '–' : kg(v)}</dd>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-md font-medium text-text">{label(d.item)}</span>
        {d.planned > 0 && <span className="num text-caption text-text-3">{t('kd.planMomos', { n: d.planned.toLocaleString('en-IN') })}</span>}
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {cell(t('kd.morning'), d.morning)}
        {cell(t('kd.made'), d.made)}
        {cell(t('kd.shouldLeft'), d.shouldLeft)}
        {cell(t('kd.counted'), d.counted, true)}
      </dl>
      {note && <p className={cn('text-caption', warn ? 'text-warning' : 'text-text-2')}>{note}</p>}
    </div>
  );
}

export function KitchenDay({ date, houseId, accessToken, pools, morning, lastCounted, plan, pieces, perKg, closed, canEdit, onWeighed, makeForm, nightForm }: Props) {
  const { t, lang } = useT();
  const label = useItemLabel();
  const items = useMemo(() => itemsForDay(pools, plan, lastCounted), [pools, plan, lastCounted]);
  const days = useMemo(() => items.map((it) => itemDay(it, pools[it.id], plan, pieces, perKg, { frozen: !!morning?.thaw?.[it.id]?.frozen })), [items, pools, plan, pieces, perKg, morning]);
  // When the frozen stock is ready: the weigh-in time + the thaw.
  const readyAt = morning ? (() => { const [h, m] = morning.at.slice(11, 16).split(':').map(Number); const mins = h * 60 + m + THAW_HOURS * 60; const hh = Math.floor(mins / 60) % 24; return `${hh % 12 || 12}:${String(Math.round(mins % 60)).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`; })() : null;
  const stale = items.filter((it) => countState(it, lastCounted, date).state !== 'last_night' && !(morning && typeof morning.counts[it.id] === 'number'));
  const weighed = !!morning || closed;
  const [weighAgain, setWeighAgain] = useState(false);
  const step = closed ? 4 : !weighed ? 1 : 2;

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

  const steps = [
    { n: 1, label: t('kd.step1'), done: weighed },
    { n: 2, label: t('kd.step2'), done: closed },
    { n: 3, label: t('kd.step3'), done: closed },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" aria-label={t('kd.title')}>
      <div className="flex flex-col gap-2">
        <h2 className="text-subtitle font-semibold text-text">{t('kd.title')}</h2>
        <ol className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <li key={s.n}>
              <StatusChip tone={s.done ? 'success' : step === s.n ? 'warning' : 'neutral'}>
                {s.done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : `${s.n}.`} {s.label}
              </StatusChip>
            </li>
          ))}
        </ol>
        {morning && <p className="text-caption text-text-3">{t('kd.weighedBy', { name: morning.byName, time: morning.at.slice(11, 16) })}</p>}
      </div>

      <Bunny lines={lines} ai={ai} />

      {canEdit && !closed && (!weighed || weighAgain) ? (
        <MorningWeighInForm items={items} lastCounted={lastCounted} date={date} morning={morning}
          onSave={async (counts, thaw) => { await api.saveMorningWeighIn(accessToken, houseId, date, counts, thaw); setWeighAgain(false); await onWeighed(); }} />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border [&>*+*]:border-t [&>*+*]:border-border">
            {days.map((d) => <DayRow key={d.item.id} d={d} closed={closed} readyAt={readyAt} />)}
          </div>
          {canEdit && !closed && <Button variant="link" size="sm" className="self-start" onClick={() => setWeighAgain(true)}>{t('kd.weighAgain')}</Button>}
        </>
      )}

      {!weighed && !canEdit && <Callout tone="neutral" title={t('kd.notWeighedYet')} />}
      {weighed && !closed && canEdit && !weighAgain && (
        <div className="flex flex-col gap-2">
          <h3 className="text-body-md font-semibold text-text">{t('kd.step2')}</h3>
          {makeForm}
        </div>
      )}
      {weighed && (
        <div className="flex flex-col gap-2">
          <h3 className="text-body-md font-semibold text-text">{t('kd.step3')}</h3>
          {nightForm}
        </div>
      )}
    </section>
  );
}
