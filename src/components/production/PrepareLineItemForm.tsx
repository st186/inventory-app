import { useState, useEffect } from 'react';
import { PlusCircle } from 'lucide-react';
import { MOMO_TYPES, getMomoType } from '../../constants/momoTypes';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { NativeSelect } from '../ui/select';
import { useT } from '../../utils/i18n';
import { momoName } from '../stock/stockShared';

type Props = {
  disabled?: boolean;
  submitting?: boolean;
  onAdd: (momoKey: string, globalPoolQty: number, perTypePoolQty: number) => void | Promise<void>;
};

// Logs one prepared line item: a momo type and how much of its own pool (stuffing or coating)
// was just prepared for it. Dough/batter is the shared pool (LogSharedPoolForm) unless a type
// needs its own, offered as an opt-in tick. Saved straight away, one item at a time.
export function PrepareLineItemForm({ disabled, submitting, onAdd }: Props) {
  const { t, lang } = useT();
  const [momoKey, setMomoKey] = useState(MOMO_TYPES[0].key);
  const [perTypeQty, setPerTypeQty] = useState('');
  const [hasUniqueGlobal, setHasUniqueGlobal] = useState(false);
  const [uniqueGlobalQty, setUniqueGlobalQty] = useState('');

  const momoType = getMomoType(momoKey) || MOMO_TYPES[0];
  const globalLabel = momoType.globalPoolField === 'dough' ? t('stock.prod.dough') : t('stock.prod.batter');
  const globalWord = globalLabel.replace(/ \(.*\)$/, '');
  const perTypeLabel = momoType.perTypePoolField === 'stuffing' ? t('stock.prod.stuffingKg') : t('stock.prod.coatingKg');
  const typeName = momoName(lang, momoType.inventoryKey, momoType.label);

  // A stale "own dough" amount must not carry over to a different type.
  useEffect(() => {
    setHasUniqueGlobal(false);
    setUniqueGlobalQty('');
  }, [momoKey]);

  const handleAdd = async () => {
    const p = parseFloat(perTypeQty) || 0;
    const g = hasUniqueGlobal ? (parseFloat(uniqueGlobalQty) || 0) : 0;
    if (p <= 0 && g <= 0) return;
    await onAdd(momoKey, g, p);
    setPerTypeQty('');
    setHasUniqueGlobal(false);
    setUniqueGlobalQty('');
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stock.prod.momoType')}>
          <NativeSelect value={momoKey} onChange={(e) => setMomoKey(e.target.value as typeof MOMO_TYPES[number]['key'])} disabled={disabled}>
            {MOMO_TYPES.map((m) => <option key={m.key} value={m.key}>{momoName(lang, m.inventoryKey, m.label)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={perTypeLabel}>
          <Input type="text" inputMode="decimal" className="num" value={perTypeQty} onChange={(e) => setPerTypeQty(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" />
        </Field>
      </div>
      <label htmlFor="prep-unique" className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox id="prep-unique" checked={hasUniqueGlobal} onCheckedChange={(v) => setHasUniqueGlobal(v === true)} disabled={disabled} />
        <span className="text-body-sm text-text">{t('stock.prod.uniqueDough', { pool: globalWord.toLowerCase() })}</span>
      </label>
      {hasUniqueGlobal && (
        <Field label={t('stock.prod.uniqueDoughKg', { pool: globalWord, type: typeName })} helper={t('stock.prod.uniqueDoughHint')}>
          <Input type="text" inputMode="decimal" className="num" value={uniqueGlobalQty} onChange={(e) => setUniqueGlobalQty(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" autoFocus />
        </Field>
      )}
      <Button variant="secondary" className="self-start" leadingIcon={<PlusCircle />} loading={submitting} disabled={disabled || (!perTypeQty && !(hasUniqueGlobal && uniqueGlobalQty))} onClick={handleAdd}>
        {t('stock.prod.addToBatches')}
      </Button>
    </section>
  );
}
