// Rent and electricity bills (owner, 28 Oct 2026): both say which month they are for, and
// electricity how many meter units the bill is for. Rent was paid late and then twice in a
// month to catch up, with nothing saying which month each payment covered; electricity had no
// units, so cost per unit couldn't be followed. Used by Add expense and the bill edit form.
import { AlertTriangle, Info } from 'lucide-react';
import type { FixedCostItem } from '../../App';
import { Callout } from '../ui/callout';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { formatINR } from '../ui/money';
import { PickerField } from '../ui/picker-sheet';

export const billNeedsMonth = (category?: string | null) => category === 'rent' || category === 'electricity';

const monthAdd = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** Rent is usually for the month it is paid in; an electricity bill for the month before. */
export const defaultBillMonth = (category: string, date: string) => (category === 'electricity' ? monthAdd(date.slice(0, 7), -1) : date.slice(0, 7));

/** The month an old bill without forMonth most likely covers: the month it was paid in. */
export const billMonthOf = (item: Pick<FixedCostItem, 'date'> & { forMonth?: string }) => item.forMonth || item.date.slice(0, 7);

/** Rent already logged for that month, and months before it (up to a year back, after the first rent ever logged) with none. */
export function rentCheck(fixedCosts: FixedCostItem[], forMonth: string, editingId?: string) {
  const rents = fixedCosts.filter((f) => f.category === 'rent' && f.id !== editingId);
  const already = rents.filter((f) => billMonthOf(f) === forMonth);
  const covered = new Set(rents.map(billMonthOf));
  const first = rents.map(billMonthOf).sort()[0];
  const missing: string[] = [];
  for (let n = 12; n >= 1; n--) {
    const m = monthAdd(forMonth, -n);
    if (first && m >= first && !covered.has(m)) missing.push(m);
  }
  return { already, missing };
}

export function BillFields({ category, date, forMonth, onForMonth, units, onUnits, amount, fixedCosts, editingId, unitsOptional = false }: {
  category: string;
  /** The day the bill is paid (the entry's date). */
  date: string;
  forMonth: string;
  onForMonth: (month: string) => void;
  units: string;
  onUnits: (units: string) => void;
  amount: number;
  fixedCosts?: FixedCostItem[];
  editingId?: string;
  /** An old electricity bill saved before units were asked for: editing it doesn't need them. */
  unitsOptional?: boolean;
}) {
  if (!billNeedsMonth(category)) return null;
  const paidMonth = date.slice(0, 7);
  const options = Array.from({ length: 14 }, (_, i) => monthAdd(paidMonth, 1 - i)).map((m) => ({ value: m, label: monthLabel(m) }));
  const perUnit = category === 'electricity' && parseFloat(units) > 0 && amount > 0 ? amount / parseFloat(units) : null;
  const check = category === 'rent' && fixedCosts && forMonth ? rentCheck(fixedCosts, forMonth, editingId) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className={category === 'electricity' ? 'grid grid-cols-2 gap-3' : 'flex flex-col'}>
        <Field label={category === 'rent' ? 'Rent for' : 'Bill for'} required>
          <PickerField title={category === 'rent' ? 'Which month is this rent for?' : 'Which month is this bill for?'} items={options} value={forMonth} onValueChange={onForMonth} />
        </Field>
        {category === 'electricity' && (
          <Field label="Meter units" required={!unitsOptional} optional={unitsOptional} helper={perUnit !== null ? `${formatINR(Math.round(perUnit * 100) / 100)} a unit` : 'Units used, from the bill'}>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={units} onChange={(e) => onUnits(e.target.value)} placeholder="e.g. 640" required={!unitsOptional} className="num" />
          </Field>
        )}
      </div>
      {check && check.already.length > 0 && (
        <Callout tone="warning" icon={AlertTriangle} title={`Rent for ${monthLabel(forMonth)} is already logged`}>
          {check.already.map((f) => `${formatINR(f.amount)} paid ${f.date}`).join(', ')}. If this payment is for another month, pick that month above.
        </Callout>
      )}
      {check && check.already.length === 0 && check.missing.length > 0 && (
        <Callout tone="info" icon={Info} title={`No rent logged for ${check.missing.map(monthLabel).join(', ')}`}>
          If this payment is a late one for {check.missing.length === 1 ? 'that month' : 'one of those months'}, pick it above.
        </Callout>
      )}
    </div>
  );
}
