import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { useT } from '../../utils/i18n';

type Props = {
  disabled?: boolean;
  submitting?: boolean;
  // Sentinel momoKeys 'GLOBAL_DOUGH'/'GLOBAL_BATTER' - a direct log of the shared pool
  // itself, with no momo type attached (see aggregatePreparedByPool server-side).
  onAdd: (poolKey: 'GLOBAL_DOUGH' | 'GLOBAL_BATTER', qty: number) => void | Promise<void>;
};

// Dough/batter is shared by every momo type in its group: logged once a day here, not per batch.
import { looksLikeGrams } from './ledgerKg';

export function LogSharedPoolForm({ disabled, submitting, onAdd }: Props) {
  const { t } = useT();
  const [doughQty, setDoughQty] = useState('');
  const [batterQty, setBatterQty] = useState('');

  const grams = looksLikeGrams(doughQty) || looksLikeGrams(batterQty);

  const handleAdd = async () => {
    if (grams) return;
    const dough = parseFloat(doughQty) || 0;
    const batter = parseFloat(batterQty) || 0;
    if (dough <= 0 && batter <= 0) return;
    if (dough > 0) await onAdd('GLOBAL_DOUGH', dough);
    if (batter > 0) await onAdd('GLOBAL_BATTER', batter);
    setDoughQty('');
    setBatterQty('');
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="mx-1 text-body-md font-semibold text-text">{t('stock.prod.logShared')}</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stock.prod.dough')} error={looksLikeGrams(doughQty) ? t('stock.prod.looksLikeGrams') : undefined}>
          <Input type="text" inputMode="decimal" className="num" value={doughQty} onChange={(e) => setDoughQty(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" />
        </Field>
        <Field label={t('stock.prod.batter')} error={looksLikeGrams(batterQty) ? t('stock.prod.looksLikeGrams') : undefined}>
          <Input type="text" inputMode="decimal" className="num" value={batterQty} onChange={(e) => setBatterQty(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" />
        </Field>
      </div>
      <Button variant="secondary" className="self-start" leadingIcon={<PlusCircle />} loading={submitting} disabled={disabled || grams || (!doughQty && !batterQty)} onClick={handleAdd}>
        {t('stock.prod.logPrep')}
      </Button>
    </section>
  );
}
