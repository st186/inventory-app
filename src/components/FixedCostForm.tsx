// Edit (or add) a fixed cost - rent, electricity, internet - in the same sheet as every other
// expense. Payload and validation unchanged.
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FixedCostItem } from '../App';
import { FIXED_COST_CATEGORIES, SELECTABLE_FIXED_COST_CATEGORIES } from '../utils/inventoryData';
import { ProductionCashChoice, productionCashChoiceAvailable } from './ProductionCashChoice';
import type { CashCover } from '../utils/cashSource';
import { useT } from '../utils/i18n';
import { Button } from './ui/button';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { MoneyInput, formatINR } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { ResponsiveModal } from './ui/responsive-modal';
import { Textarea } from './ui/textarea';
import { MoneyWaiting } from './money/DayCloseParts';
import { DeleteAction, PaidFromField, SplitAmounts } from './money/PaidFromField';
import { categoryText, stripEmoji } from './money/categoryDisplay';
import { BillFields, billNeedsMonth, billMonthOf, defaultBillMonth } from './money/BillFields';

type Props = {
  selectedDate: string;
  editingItem?: FixedCostItem | null;
  onSubmit: (item: Omit<FixedCostItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  // Cluster head only: "My own money" - a cost that takes nothing from store/production cash or Paytm.
  allowOwnerPayment?: boolean;
  // Cluster head, store expense: the linked production house, and both tills' cash for the
  // day - production's cash is offered only when the store's can't cover the bill.
  productionCashHouseId?: string | null;
  productionCashCover?: CashCover | null;
  /** Editing: delete this entry (confirm + Undo are the caller's). */
  onDelete?: () => void;
  /** Bills already logged, so rent can say when a month is paid twice or missing. */
  fixedCosts?: FixedCostItem[];
};

export function FixedCostForm({ selectedDate, onSubmit, onClose, editingItem, allowOwnerPayment = false, productionCashHouseId = null, productionCashCover = null, onDelete, fixedCosts }: Props) {
  const [fromProductionCash, setFromProductionCash] = useState(!!editingItem?.paidFromProductionHouseId);
  const [formData, setFormData] = useState({
    category: editingItem ? editingItem.category : 'electricity' as FixedCostItem['category'],
    description: editingItem ? editingItem.description : '',
    amount: editingItem ? editingItem.amount.toString() : '',
    units: editingItem?.units ? editingItem.units.toString() : '',
    unitPrice: editingItem?.unitPrice ? editingItem.unitPrice.toString() : '',
    paymentMethod: (editingItem?.paymentMethod || 'cash') as 'cash' | 'online' | 'both' | 'owner',
    cashAmount: editingItem?.cashAmount ? editingItem.cashAmount.toString() : '',
    onlineAmount: editingItem?.onlineAmount ? editingItem.onlineAmount.toString() : '',
    // Rent and electricity: the month the bill is for (an old entry: the month it was paid in).
    forMonth: editingItem ? (billNeedsMonth(editingItem.category) ? billMonthOf(editingItem) : '') : defaultBillMonth('electricity', selectedDate),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Meter units are asked for on every new electricity bill (owner, 28 Oct 2026); an old one
  // saved without them can still be edited without making them up.
  const unitsOptional = !!editingItem && editingItem.category === 'electricity' && !editingItem.units;

  // Calculate total amount for LPG
  const totalAmount = formData.category === 'lpg_gas' && formData.units && formData.unitPrice
    ? parseFloat(formData.units) * parseFloat(formData.unitPrice)
    : parseFloat(formData.amount || '0');

  // Auto-calculate split amounts when payment method changes
  useEffect(() => {
    if (formData.paymentMethod === 'both' && totalAmount > 0) {
      // If switching to "both" and amounts aren't set, default to 50/50 split
      if (!formData.cashAmount && !formData.onlineAmount) {
        const half = (totalAmount / 2).toFixed(2);
        setFormData(prev => ({
          ...prev,
          cashAmount: half,
          onlineAmount: half
        }));
      }
    }
  }, [formData.paymentMethod, totalAmount]);

  // Validate split amounts add up to total
  const splitAmountsValid = () => {
    if (formData.paymentMethod !== 'both') return true;
    const cash = parseFloat(formData.cashAmount || '0');
    const online = parseFloat(formData.onlineAmount || '0');
    return Math.abs((cash + online) - totalAmount) < 0.01; // Allow small floating point differences
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!splitAmountsValid()) {
      toast.error('Cash and Paytm amounts must add up to the total amount');
      return;
    }

    const calculatedAmount = formData.category === 'lpg_gas' 
      ? parseFloat(formData.units) * parseFloat(formData.unitPrice)
      : parseFloat(formData.amount);

    const baseData: any = {
      date: selectedDate,
      category: formData.category,
      description: formData.description,
      amount: calculatedAmount,
      paymentMethod: formData.paymentMethod
    };
    
    // Add LPG specific fields if category is lpg_gas
    if (formData.category === 'lpg_gas') {
      baseData.units = parseFloat(formData.units);
      baseData.unitPrice = parseFloat(formData.unitPrice);
    }
    if (billNeedsMonth(formData.category)) {
      if (!formData.forMonth) { toast.error('Pick the month this bill is for'); return; }
      baseData.forMonth = formData.forMonth;
    }
    if (formData.category === 'electricity') {
      const units = parseFloat(formData.units);
      if (!(units > 0) && !unitsOptional) { toast.error('Enter the meter units from the bill'); return; }
      if (units > 0) {
        baseData.units = units;
        baseData.unitPrice = Math.round((calculatedAmount / units) * 100) / 100;
      }
    }

    // Calculate payment method amounts
    if (formData.paymentMethod === 'both') {
      baseData.cashAmount = parseFloat(formData.cashAmount);
      baseData.onlineAmount = parseFloat(formData.onlineAmount);
    } else if (formData.paymentMethod === 'online') {
      // For online payment, set onlineAmount to total amount
      baseData.onlineAmount = calculatedAmount;
      baseData.cashAmount = 0;
    } else if (formData.paymentMethod === 'cash') {
      // For cash payment, set cashAmount to total amount
      baseData.cashAmount = calculatedAmount;
      baseData.onlineAmount = 0;
    } else if (formData.paymentMethod === 'owner') {
      baseData.cashAmount = 0;
      baseData.onlineAmount = 0;
    }
    if (productionCashHouseId) {
      baseData.paidFromProductionHouseId = formData.paymentMethod === 'cash' && fromProductionCash
        && productionCashChoiceAvailable(calculatedAmount, productionCashCover, editingItem) ? productionCashHouseId : null;
    }


    setIsSubmitting(true);
    Promise.resolve(onSubmit(baseData)).finally(() => setIsSubmitting(false));
  };

  const { t } = useT();
  const categoryItems = [
    ...Object.keys(SELECTABLE_FIXED_COST_CATEGORIES).map((key) => ({ value: key, label: categoryText(key) })),
    // An old LPG entry being edited keeps its category visible
    ...(!(formData.category in SELECTABLE_FIXED_COST_CATEGORIES) ? [{ value: formData.category, label: stripEmoji(FIXED_COST_CATEGORIES[formData.category] || formData.category) }] : []),
  ];
  const dirty = editingItem
    ? formData.amount !== editingItem.amount.toString() || formData.description !== editingItem.description || formData.category !== editingItem.category || formData.paymentMethod !== (editingItem.paymentMethod || 'cash')
    : !!(formData.amount || formData.description);
  // Split: typing one part fills the other with the rest of the total.
  const onSplitChange = (next: { cash: string; online: string }) => {
    if (next.cash !== formData.cashAmount) {
      const cash = parseFloat(next.cash || '0');
      setFormData({ ...formData, cashAmount: next.cash, onlineAmount: (totalAmount - cash).toFixed(2) });
    } else {
      const online = parseFloat(next.online || '0');
      setFormData({ ...formData, onlineAmount: next.online, cashAmount: (totalAmount - online).toFixed(2) });
    }
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={editingItem ? t('exp.edit') : t('exp.type.fixedcost')}
      dirty={dirty && !isSubmitting}
      headerActions={<DeleteAction onDelete={onDelete} />}
      footer={<Button type="submit" form="fixed-cost-form" size="lg" fullWidth loading={isSubmitting}>{t('expense.save')}</Button>}
    >
      <form id="fixed-cost-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Fixed costs for this day saved on the phone without signal - so they aren't entered twice. */}
        {!editingItem && <MoneyWaiting kinds={['fixed-cost']} date={selectedDate} />}
        <Field label={t('exp.category')} required>
          <PickerField
            title={t('exp.category')}
            items={categoryItems}
            value={formData.category}
            onValueChange={(v) => setFormData({ ...formData, category: v as FixedCostItem['category'], forMonth: billNeedsMonth(v) ? (formData.forMonth || defaultBillMonth(v, selectedDate)) : '' })}
          />
        </Field>

        <Field label="Description" required>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            placeholder={formData.category === 'lpg_gas' ? 'e.g. Commercial LPG cylinder purchase' : 'e.g. Monthly electricity bill, store rent for December'}
            required
          />
        </Field>

        {formData.category === 'lpg_gas' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cylinders" required>
              <Input type="number" inputMode="numeric" step="1" min="1" value={formData.units} onChange={(e) => setFormData({ ...formData, units: e.target.value })} placeholder="e.g. 2" required className="num" />
            </Field>
            <Field label="Price per cylinder" required helper={formData.units && formData.unitPrice ? `Total ${formatINR(totalAmount)}` : undefined}>
              <MoneyInput value={formData.unitPrice} onValueChange={(_, raw) => setFormData({ ...formData, unitPrice: raw })} required />
            </Field>
          </div>
        ) : (
          <Field label={t('money.amount')} required>
            <MoneyInput value={formData.amount} onValueChange={(_, raw) => setFormData({ ...formData, amount: raw })} required />
          </Field>
        )}

        <BillFields
          category={formData.category}
          date={editingItem?.date || selectedDate}
          forMonth={formData.forMonth}
          onForMonth={(m) => setFormData({ ...formData, forMonth: m })}
          units={formData.units}
          onUnits={(u) => setFormData({ ...formData, units: u })}
          amount={totalAmount}
          fixedCosts={fixedCosts}
          editingId={editingItem?.id}
          unitsOptional={unitsOptional}
        />

        <PaidFromField
          value={formData.paymentMethod}
          onChange={(m) => setFormData({ ...formData, paymentMethod: m })}
          showOwner={allowOwnerPayment || editingItem?.paymentMethod === 'owner'}
          entity={editingItem?.entityType === 'production_house' ? 'production' : 'store'}
        >
          {productionCashHouseId && formData.paymentMethod === 'cash' && (
            <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={totalAmount} cover={productionCashCover} editingItem={editingItem} />
          )}
          {formData.paymentMethod === 'both' && totalAmount > 0 && (
            <SplitAmounts cash={formData.cashAmount} online={formData.onlineAmount} total={totalAmount} onChange={onSplitChange} />
          )}
        </PaidFromField>
      </form>
    </ResponsiveModal>
  );
}
