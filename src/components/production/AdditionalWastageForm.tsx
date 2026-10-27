import { useState, useMemo } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { MOMO_TYPES } from '../../constants/momoTypes';
import type { ProductionWastageNote } from '../../utils/api';
import { Button } from '../ui/button';
import { ChoiceChips } from '../ui/chip';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ListRow } from '../ui/list-row';
import { NativeSelect } from '../ui/select';
import { useT } from '../../utils/i18n';
import { reasonLabel } from '../stock/stockShared';
import { WASTE_REASONS, isPhase1Live } from '../../utils/batches';

const PRODUCTION_REASONS = WASTE_REASONS.filter((r) => r.where !== 'store');

// Real sauce/chutney names this kitchen actually makes (matches the existing "Sauces &
// Chutneys" section below, all logged in L) - suggested alongside the ledger's own
// dough/stuffing/batter/coating pool names so "something else got wasted" doesn't mean
// typing a name from scratch with no idea what's already tracked elsewhere.
const KNOWN_SAUCES = [
  'Panfried Sauce', 'Chilli Chicken Sauce', 'Spicy Korean Sauce', 'Hot Garlic Sauce',
  'Tandoori Sauce', 'Soup Premix', 'Green Mayo Chutney', 'Spicy Red Chutney',
];

const SUGGESTIONS: { label: string; unit: 'kg' | 'g' | 'L' | 'ml' | 'pcs' }[] = [
  { label: 'Dough (shared)', unit: 'kg' },
  { label: 'Batter (shared)', unit: 'kg' },
  ...MOMO_TYPES.flatMap((t) => [
    { label: `${t.label} ${t.perTypePoolField === 'coating' ? 'Coating' : 'Stuffing'}`, unit: 'kg' as const },
  ]),
  ...KNOWN_SAUCES.map((name) => ({ label: name, unit: 'L' as const })),
  // Finished momos rejected at folding, steaming or packing - counted in pieces.
  ...MOMO_TYPES.map((t) => ({ label: `${t.label} momos (finished)`, unit: 'pcs' as const })),
];

type Props = {
  productionHouseId: string;
  date: string;
  disabled?: boolean;
  notes: ProductionWastageNote[];
  onAdd: (description: string, quantity: number, unit: string, reason: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

// A catch-all for wastage that doesn't fit any of the pools tracked above - typing a name
// suggests a match against known pools/sauces and switches the unit to whatever that item
// is actually measured in (kg/g for something solid like stuffing, L/ml for a sauce),
// rather than assuming everything is in kg. Free text is still allowed for anything not on
// the list - the suggestions are a shortcut, not a restriction.
export function AdditionalWastageForm({ productionHouseId, date, disabled, notes, onAdd, onDelete }: Props) {
  const { t, lang } = useT();
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'kg' | 'g' | 'L' | 'ml' | 'pcs'>('kg');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Reason codes become required from Phase 1 go-live; optional before it.
  const reasonRequired = isPhase1Live(date);

  const matchedSuggestion = useMemo(
    () => SUGGESTIONS.find((s) => s.label.toLowerCase() === description.trim().toLowerCase()),
    [description]
  );

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    const match = SUGGESTIONS.find((s) => s.label.toLowerCase() === value.trim().toLowerCase());
    if (match) setUnit(match.unit);
  };

  const handleAdd = async () => {
    const q = parseFloat(quantity);
    if (!description.trim() || !q || q <= 0 || (reasonRequired && !reason)) return;
    setSubmitting(true);
    try {
      await onAdd(description.trim(), q, unit, reason);
      setDescription('');
      setQuantity('');
      setUnit('kg');
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const datalistId = `wastage-suggestions-${productionHouseId}-${date}`;

  return (
    <section className="flex flex-col gap-4" lang={lang}>
      {notes.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {notes.map((note) => (
            <ListRow
              key={note.id}
              density="compact"
              title={note.description}
              subtitle={[
                `${note.quantity}${note.unit === 'pcs' ? ` ${t('stock.pcsUnit')}` : ` ${note.unit}`}`,
                note.reason ? `${note.reason} · ${reasonLabel(lang, 'waste', note.reason, PRODUCTION_REASONS.find((r) => r.code === note.reason)?.label || note.reason)}` : null,
                note.loggedByName ? t('stock.prod.byName', { name: note.loggedByName }) : null,
              ].filter(Boolean).join(' · ')}
              trailing={!disabled ? <IconButton label={t('stock.prod.remove')} icon={<Trash2 />} variant="danger-ghost" onClick={() => onDelete(note.id)} /> : undefined}
            />
          ))}
        </div>
      )}

      <Field label={t('stock.prod.whatWasted')} helper={matchedSuggestion ? t('stock.prod.matchedUnit', { unit: matchedSuggestion.unit }) : undefined}>
        <Input list={datalistId} value={description} onChange={(e) => handleDescriptionChange(e.target.value)} disabled={disabled} placeholder={t('stock.prod.whatWastedPlaceholder')} />
      </Field>
      <datalist id={datalistId}>
        {SUGGESTIONS.map((s) => <option key={s.label} value={s.label} />)}
      </datalist>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('stock.prod.quantity')}>
          <Input type="text" inputMode="decimal" className="num" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))} disabled={disabled} placeholder="0.00" />
        </Field>
        <Field label={t('stock.prod.unit')}>
          <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} disabled={disabled}>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
            <option value="pcs">{t('stock.pcsUnit')}</option>
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-body-sm font-medium text-text">{t('stock.prod.why')}{reasonRequired && <span className="text-danger" aria-hidden="true"> *</span>}</legend>
        <ChoiceChips
          aria-label={t('stock.prod.why')}
          value={reason}
          onValueChange={(v) => setReason(v)}
          options={PRODUCTION_REASONS.map((r) => ({ value: r.code, label: `${r.code} · ${reasonLabel(lang, 'waste', r.code, r.label)}`, disabled }))}
        />
      </fieldset>
      <Button
        variant="secondary"
        className="self-start"
        leadingIcon={<PlusCircle />}
        loading={submitting}
        disabled={disabled || !description.trim() || !quantity || (reasonRequired && !reason)}
        onClick={handleAdd}
      >
        {t('stock.prod.logWastage')}
      </Button>
    </section>
  );
}
