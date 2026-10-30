import { useState, useEffect } from 'react';
import { AlertTriangle, PlusCircle } from 'lucide-react';
import { MOMO_TYPES, getMomoType } from '../../constants/momoTypes';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { NativeSelect } from '../ui/select';
import { useT } from '../../utils/i18n';
import { momoName } from '../stock/stockShared';
import { looksLikeGrams } from './ledgerKg';
import type { WithLeftoverReason } from '../../utils/api';
import { cn } from '../ui/utils';

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

// Logs one prepared line item: a momo type and how much of its own pool (stuffing or coating)
// was just prepared for it. Dough/batter is the shared pool (LogSharedPoolForm) unless a type
// needs its own, offered as an opt-in tick. Saved straight away, one item at a time.
export function PrepareLineItemForm({ disabled, submitting, leftoverKg = {}, plan = null, perKg = {}, onAdd }: Props) {
  const { t, lang } = useT();
  const [momoKey, setMomoKey] = useState(MOMO_TYPES[0].key);
  const [perTypeQty, setPerTypeQty] = useState('');
  const [hasUniqueGlobal, setHasUniqueGlobal] = useState(false);
  const [uniqueGlobalQty, setUniqueGlobalQty] = useState('');
  // Why more is made while yesterday's is still there (owner, 29 Oct 2026).
  const [why, setWhy] = useState<WithLeftoverReason>({ reason: '' as WithLeftoverReason['reason'], who: '', note: '' });

  const momoType = getMomoType(momoKey) || MOMO_TYPES[0];
  const globalLabel = momoType.globalPoolField === 'dough' ? t('stock.prod.dough') : t('stock.prod.batter');
  const globalWord = globalLabel.replace(/ \(.*\)$/, '');
  const perTypeLabel = momoType.perTypePoolField === 'stuffing' ? t('stock.prod.stuffingKg') : t('stock.prod.coatingKg');
  const typeName = momoName(lang, momoType.inventoryKey, momoType.label);

  // A stale "own dough" amount must not carry over to a different type.
  useEffect(() => {
    setHasUniqueGlobal(false);
    setUniqueGlobalQty('');
    setWhy({ reason: '' as WithLeftoverReason['reason'], who: '', note: '' });
  }, [momoKey]);

  const poolId = `${momoType.perTypePoolField}:${momoType.inventoryKey}`;
  const left = leftoverKg[poolId] || 0;
  const askWhy = left >= LEFTOVER_MIN_KG && (parseFloat(perTypeQty) || 0) > 0;
  const covers = perKg[momoType.inventoryKey] ? Math.round((left * perKg[momoType.inventoryKey]) / 10) * 10 : null;
  const planned = plan?.[momoType.inventoryKey] || null;
  const whyProblem = !askWhy ? null
    : !why.reason ? t('stock.prod.more.errPick')
      : (why.reason === 'told' || why.reason === 'for_tomorrow') && (why.who || '').trim().length < 2 ? t('stock.prod.more.errWho')
        : why.reason === 'not_fit' && (why.note || '').trim().length < 5 ? t('stock.prod.more.errNotFit')
          : why.reason === 'other' && (why.note || '').trim().length < 20 ? t('stock.prod.more.errOther')
            : null;

  const grams = looksLikeGrams(perTypeQty) || (hasUniqueGlobal && looksLikeGrams(uniqueGlobalQty));

  const handleAdd = async () => {
    if (grams || whyProblem) return;
    const p = parseFloat(perTypeQty) || 0;
    const g = hasUniqueGlobal ? (parseFloat(uniqueGlobalQty) || 0) : 0;
    if (p <= 0 && g <= 0) return;
    await onAdd(momoKey, g, p, askWhy ? { reason: why.reason, who: (why.who || '').trim(), note: (why.note || '').trim() } : undefined);
    setPerTypeQty('');
    setHasUniqueGlobal(false);
    setUniqueGlobalQty('');
    setWhy({ reason: '' as WithLeftoverReason['reason'], who: '', note: '' });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stock.prod.momoType')}>
          <NativeSelect value={momoKey} onChange={(e) => setMomoKey(e.target.value as typeof MOMO_TYPES[number]['key'])} disabled={disabled}>
            {MOMO_TYPES.map((m) => <option key={m.key} value={m.key}>{momoName(lang, m.inventoryKey, m.label)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={perTypeLabel} error={looksLikeGrams(perTypeQty) ? t('stock.prod.looksLikeGrams') : undefined}>
          <Input type="text" inputMode="decimal" className="num" value={perTypeQty} onChange={(e) => setPerTypeQty(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" />
        </Field>
      </div>
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
              <button key={r.reason} type="button" aria-pressed={why.reason === r.reason} disabled={disabled} onClick={() => setWhy({ ...why, reason: r.reason })}
                className={cn('hit-44 inline-flex min-h-9 items-center justify-center rounded-full border px-3 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                  why.reason === r.reason ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text')}>
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
      <label htmlFor="prep-unique" className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox id="prep-unique" checked={hasUniqueGlobal} onCheckedChange={(v) => setHasUniqueGlobal(v === true)} disabled={disabled} />
        <span className="text-body-sm text-text">{t('stock.prod.uniqueDough', { pool: globalWord.toLowerCase() })}</span>
      </label>
      {hasUniqueGlobal && (
        <Field label={t('stock.prod.uniqueDoughKg', { pool: globalWord, type: typeName })} helper={t('stock.prod.uniqueDoughHint')} error={looksLikeGrams(uniqueGlobalQty) ? t('stock.prod.looksLikeGrams') : undefined}>
          <Input type="text" inputMode="decimal" className="num" value={uniqueGlobalQty} onChange={(e) => setUniqueGlobalQty(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" autoFocus />
        </Field>
      )}
      {whyProblem && why.reason && <p className="text-caption text-danger" role="alert">{whyProblem}</p>}
      <Button variant="secondary" className="self-start" leadingIcon={<PlusCircle />} loading={submitting} disabled={disabled || grams || !!whyProblem || (!perTypeQty && !(hasUniqueGlobal && uniqueGlobalQty))} onClick={handleAdd}>
        {t('stock.prod.addToBatches')}
      </Button>
    </section>
  );
}
