import { useState, useMemo } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { MOMO_TYPES } from '../../constants/momoTypes';
import type { ProductionWastageNote } from '../../utils/api';

// Real sauce/chutney names this kitchen actually makes (matches the existing "Sauces &
// Chutneys" section below, all logged in L) - suggested alongside the ledger's own
// dough/stuffing/batter/coating pool names so "something else got wasted" doesn't mean
// typing a name from scratch with no idea what's already tracked elsewhere.
const KNOWN_SAUCES = [
  'Panfried Sauce', 'Chilli Chicken Sauce', 'Spicy Korean Sauce', 'Hot Garlic Sauce',
  'Tandoori Sauce', 'Soup Premix', 'Green Mayo Chutney', 'Spicy Red Chutney',
];

const SUGGESTIONS: { label: string; unit: 'kg' | 'g' | 'L' | 'ml' }[] = [
  { label: 'Dough (shared)', unit: 'kg' },
  { label: 'Batter (shared)', unit: 'kg' },
  ...MOMO_TYPES.flatMap((t) => [
    { label: `${t.label} ${t.perTypePoolField === 'coating' ? 'Coating' : 'Stuffing'}`, unit: 'kg' as const },
  ]),
  ...KNOWN_SAUCES.map((name) => ({ label: name, unit: 'L' as const })),
];

type Props = {
  productionHouseId: string;
  date: string;
  disabled?: boolean;
  notes: ProductionWastageNote[];
  onAdd: (description: string, quantity: number, unit: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

// A catch-all for wastage that doesn't fit any of the pools tracked above - typing a name
// suggests a match against known pools/sauces and switches the unit to whatever that item
// is actually measured in (kg/g for something solid like stuffing, L/ml for a sauce),
// rather than assuming everything is in kg. Free text is still allowed for anything not on
// the list - the suggestions are a shortcut, not a restriction.
export function AdditionalWastageForm({ productionHouseId, date, disabled, notes, onAdd, onDelete }: Props) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'kg' | 'g' | 'L' | 'ml'>('kg');
  const [submitting, setSubmitting] = useState(false);

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
    if (!description.trim() || !q || q <= 0) return;
    setSubmitting(true);
    try {
      await onAdd(description.trim(), q, unit);
      setDescription('');
      setQuantity('');
      setUnit('kg');
    } finally {
      setSubmitting(false);
    }
  };

  const datalistId = `wastage-suggestions-${productionHouseId}-${date}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-1">Any More Wastage to Log?</h2>
      <p className="text-sm text-gray-500 mb-4">
        For anything wasted that isn't one of the pools above - a sauce, a chutney, a raw ingredient.
      </p>

      {notes.length > 0 && (
        <div className="space-y-2 mb-4">
          {notes.map((note) => (
            <div key={note.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl border border-gray-200 p-3">
              <div className="text-sm text-gray-900">
                <span className="font-semibold">{note.description}</span>
                <span className="text-gray-500"> · {note.quantity}{note.unit}</span>
                {note.loggedByName && <span className="text-gray-400 text-xs"> · by {note.loggedByName}</span>}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onDelete(note.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove this entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">What was wasted?</label>
          <input
            type="text"
            list={datalistId}
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            disabled={disabled}
            placeholder="Start typing - e.g. Hot Garlic Sauce"
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          />
          <datalist id={datalistId}>
            {SUGGESTIONS.map((s) => (
              <option key={s.label} value={s.label} />
            ))}
          </datalist>
          {matchedSuggestion && (
            <p className="text-xs text-emerald-700 mt-1">Matched - unit set to {matchedSuggestion.unit}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
          <input
            type="number"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={disabled}
            placeholder="0.00"
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
            disabled={disabled}
            className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled || submitting || !description.trim() || !quantity}
        className="mt-4 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold text-sm"
      >
        <PlusCircle className="w-4 h-4" />
        {submitting ? 'Logging…' : 'Log Wastage'}
      </button>
    </div>
  );
}
