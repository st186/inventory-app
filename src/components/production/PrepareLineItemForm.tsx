import { useState } from 'react';
import { AlertTriangle, PlusCircle } from 'lucide-react';
import { MOMO_TYPES } from '../../constants/momoTypes';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { useT } from '../../utils/i18n';
import { momoName } from '../stock/stockShared';
import { looksLikeGrams } from './ledgerKg';
import type { WithLeftoverReason } from '../../utils/api';
import { cn } from '../ui/utils';
import { ALL_ITEMS, isFilling, type Item } from './kitchenDayMath';
import { useItemLabel } from './KitchenDay';

type Props = {
  disabled?: boolean;
  submitting?: boolean;
  // Yesterday's leftover per pool ("stuffing:chicken" -> kg), today's plan (pieces by inventory
  // key) and momos a kg makes - to ask why more is made while yesterday's is still there.
  leftoverKg?: Record<string, number>;
  plan?: Record<string, number> | null;
  perKg?: Record<string, number>;
  onAdd: (momoKey: string, globalPoolQty: number, perTypePoolQty: number, withLeftover?: WithLeftoverReason) => void | Promise<void>;
};

const LEFTOVER_MIN_KG = 0.5; // the server says the same
const WITH_REASONS: { reason: WithLeftoverReason['reason']; label: 'stock.prod.more.notEnough' | 'stock.prod.more.notFit' | 'stock.prod.more.forTomorrow' | 'stock.prod.more.told' | 'stock.prod.more.other' }[] = [
  { reason: 'not_enough', label: 'stock.prod.more.notEnough' },
  { reason: 'not_fit', label: 'stock.prod.more.notFit' },
  { reason: 'for_tomorrow', label: 'stock.prod.more.forTomorrow' },
  { reason: 'told', label: 'stock.prod.more.told' },
  { reason: 'other', label: 'stock.prod.more.other' },
];

// What a batch can be: dough (then which one), each stuffing, batter, each kurkure coating.
const CHOICES = ALL_ITEMS.filter((it) => it.id !== 'dough:cheeseCorn');
const DOUGHS = ALL_ITEMS.filter((it) => it.kind === 'dough');

// The ledger item for a batch: dough and batter are the shared pools (GLOBAL_DOUGH / GLOBAL_BATTER),
// cheese corn dough is cheese corn's own, a stuffing or coating is its type's.
function ledgerArgs(it: Item, kg: number): [string, number, number] {
  if (it.id === 'dough') return ['GLOBAL_DOUGH', kg, 0];
  if (it.id === 'batter') return ['GLOBAL_BATTER', kg, 0];
  const momoKey = MOMO_TYPES.find((m) => m.inventoryKey === it.type)?.key || '';
  return isFilling(it) ? [momoKey, 0, kg] : [momoKey, kg, 0];
}

// Logs one batch as it is made (owner, 31 Oct 2026: "log batch where he creates more stuffing and
// dough and batter"): pick what, and how much. Dough asks which dough (owner: "ask him when he logs
// dough if it's shared dough or dough for cheese corn"). Saved straight away, one batch at a time.
export function PrepareLineItemForm({ disabled, submitting, leftoverKg = {}, plan = null, perKg = {}, onAdd }: Props) {
  const { t, lang } = useT();
  const label = useItemLabel();
  const [choice, setChoice] = useState<string>('');
  const [dough, setDough] = useState<string>('');
  const [qty, setQty] = useState('');
  // Why more is made while yesterday's is still there (owner, 29 Oct 2026).
  const [why, setWhy] = useState<WithLeftoverReason>({ reason: '' as WithLeftoverReason['reason'], who: '', note: '' });

  const picked = choice === 'dough' ? DOUGHS.find((d) => d.id === dough) || null : CHOICES.find((c) => c.id === choice) || null;
  const pick = (id: string) => {
    setChoice(id);
    setDough('');
    setWhy({ reason: '' as WithLeftoverReason['reason'], who: '', note: '' });
  };

  const left = picked && isFilling(picked) ? leftoverKg[picked.id] || 0 : 0;
  const askWhy = left >= LEFTOVER_MIN_KG && (parseFloat(qty) || 0) > 0;
  const covers = picked?.type && perKg[picked.type] ? Math.round((left * perKg[picked.type]) / 10) * 10 : null;
  const planned = picked?.type ? plan?.[picked.type] || null : null;
  const typeName = picked?.type ? momoName(lang, picked.type, MOMO_TYPES.find((m) => m.inventoryKey === picked.type)?.label || picked.type) : '';
  const whyProblem = !askWhy ? null
    : !why.reason ? t('stock.prod.more.errPick')
      : (why.reason === 'told' || why.reason === 'for_tomorrow') && (why.who || '').trim().length < 2 ? t('stock.prod.more.errWho')
        : why.reason === 'not_fit' && (why.note || '').trim().length < 5 ? t('stock.prod.more.errNotFit')
          : why.reason === 'other' && (why.note || '').trim().length < 20 ? t('stock.prod.more.errOther')
            : null;
  const grams = looksLikeGrams(qty);

  const handleAdd = async () => {
    const kg = parseFloat(qty) || 0;
    if (!picked || kg <= 0 || grams || whyProblem) return;
    const [momoKey, g, p] = ledgerArgs(picked, kg);
    await onAdd(momoKey, g, p, askWhy ? { reason: why.reason, who: (why.who || '').trim(), note: (why.note || '').trim() } : undefined);
    setChoice('');
    setDough('');
    setQty('');
    setWhy({ reason: '' as WithLeftoverReason['reason'], who: '', note: '' });
  };

  const chip = (selected: boolean) => cn(
    'hit-44 inline-flex min-h-9 items-center justify-center rounded-full border px-3 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
    selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text',
  );

  return (
    <section className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body-sm font-semibold text-text">{t('kd.whatMade')}</legend>
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((it) => (
            <button key={it.id} type="button" aria-pressed={choice === it.id} disabled={disabled} onClick={() => pick(it.id)} className={chip(choice === it.id)}>
              {label(it)}
            </button>
          ))}
        </div>
      </fieldset>
      {choice === 'dough' && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary-soft/30 p-3">
          <legend className="sr-only">{t('kd.whichDough')}</legend>
          <p className="text-body-sm font-semibold text-text">{t('kd.whichDough')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={dough === 'dough'} disabled={disabled} onClick={() => setDough('dough')} className={chip(dough === 'dough')}>{t('kd.mainDough')}</button>
            <button type="button" aria-pressed={dough === 'dough:cheeseCorn'} disabled={disabled} onClick={() => setDough('dough:cheeseCorn')} className={chip(dough === 'dough:cheeseCorn')}>{label(DOUGHS[1])}</button>
          </div>
        </fieldset>
      )}
      {picked && (
        <Field label={`${t('kd.howMuch', { what: label(picked) })} (kg)`} error={grams ? t('stock.prod.looksLikeGrams') : undefined}>
          <Input type="text" inputMode="decimal" className="num w-32" value={qty} onChange={(e) => setQty(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" />
        </Field>
      )}
      {left >= LEFTOVER_MIN_KG && (
        <Callout tone="warning" icon={AlertTriangle} title={t('stock.prod.more.title', { kg: Math.round(left * 100) / 100, type: typeName })}>
          {[covers ? t('stock.prod.more.covers', { n: covers.toLocaleString('en-IN') }) : '', planned ? t('stock.prod.more.plan', { n: planned.toLocaleString('en-IN') }) : '', t('stock.prod.more.useFirst')].filter(Boolean).join(' ')}
        </Callout>
      )}
      {askWhy && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
          <legend className="sr-only">{t('stock.prod.more.why')}</legend>
          <p className="text-body-sm font-semibold text-text">{t('stock.prod.more.why')}</p>
          <div className="flex flex-wrap gap-2">
            {WITH_REASONS.map((r) => (
              <button key={r.reason} type="button" aria-pressed={why.reason === r.reason} disabled={disabled} onClick={() => setWhy({ ...why, reason: r.reason })} className={chip(why.reason === r.reason)}>
                {t(r.label)}
              </button>
            ))}
          </div>
          {(why.reason === 'told' || why.reason === 'for_tomorrow') && (
            <Field label={why.reason === 'told' ? t('stock.prod.more.whoTold') : t('stock.prod.more.whoDecided')}>
              <Input value={why.who || ''} maxLength={60} disabled={disabled} onChange={(e) => setWhy({ ...why, who: e.target.value })} />
            </Field>
          )}
          {(why.reason === 'not_fit' || why.reason === 'other' || why.reason === 'not_enough') && (
            <Field label={why.reason === 'not_fit' ? t('stock.prod.more.whatWrong') : t('stock.prod.why.note')} optional={why.reason === 'not_enough'}
              helper={why.reason === 'not_fit' ? t('stock.prod.more.logWastage') : undefined}>
              <Input value={why.note || ''} maxLength={300} disabled={disabled} onChange={(e) => setWhy({ ...why, note: e.target.value })} />
            </Field>
          )}
          <p className="text-label text-text-3">{t('stock.prod.more.sent')}</p>
        </fieldset>
      )}
      {whyProblem && why.reason && <p className="text-caption text-danger" role="alert">{whyProblem}</p>}
      {choice === 'dough' && !dough && <p className="text-caption text-text-3">{t('kd.pickDough')}</p>}
      <Button variant="secondary" className="self-start" leadingIcon={<PlusCircle />} loading={submitting} disabled={disabled || !picked || !(parseFloat(qty) > 0) || grams || !!whyProblem} onClick={handleAdd}>
        {t('kd.logBatch')}
      </Button>
    </section>
  );
}
