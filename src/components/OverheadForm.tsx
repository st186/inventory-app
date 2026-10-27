// Edit (or add) a running cost (overhead) in the same sheet as every other expense. Category
// groups, staff meals, personal expenses and the payload are unchanged.
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { OverheadItem } from '../App';
import { Employee } from '../utils/api';
import { OVERHEAD_CATEGORY_META, MEAL_CATEGORIES, OverheadCategoryGroup, STORE_OVERHEAD_CATEGORY_KEYS, RESTRICTED_OVERHEAD_CATEGORIES, SELECTABLE_OVERHEAD_CATEGORY_KEYS } from '../utils/inventoryData';
import { EmployeeMultiSelect } from './EmployeeMultiSelect';
import { AutocompleteInput } from './AutocompleteInput';
import { ProductionCashChoice, productionCashChoiceAvailable } from './ProductionCashChoice';
import { AssetHint } from './assets/AssetHint';
import type { CashCover } from '../utils/cashSource';
import { useT } from '../utils/i18n';
import { Button } from './ui/button';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { MoneyInput } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { ResponsiveModal } from './ui/responsive-modal';
import { DeleteAction, PaidFromField, SplitAmounts } from './money/PaidFromField';
import { stripEmoji } from './money/categoryDisplay';

type Props = {
  selectedDate: string;
  editingItem?: OverheadItem | null;
  onSubmit: (item: Omit<OverheadItem, 'id'>) => void | Promise<void>;
  onClose: () => void;
  employees: Employee[];
  existingOverheads?: OverheadItem[];
  // Which tab this form was opened from - the store's day-to-day category list is a
  // small curated subset, while production keeps the full existing list.
  entityScope: 'store' | 'production';
  // Cluster head only - unlocks categories in RESTRICTED_OVERHEAD_CATEGORIES (fuel).
  canUseRestrictedCategories?: boolean;
  // Cluster head only: "My own money" - a cost that takes nothing from store/production cash or Paytm.
  allowOwnerPayment?: boolean;
  // Cluster head, store expense: the linked production house, and both tills' cash for the
  // day - production's cash is offered only when the store's can't cover the bill.
  productionCashHouseId?: string | null;
  productionCashCover?: CashCover | null;
  /** Editing: delete this entry (confirm + Undo are the caller's). */
  onDelete?: () => void;
};

const GROUP_LABELS: Record<OverheadCategoryGroup, string> = {
  operating: 'Operating Expenses',
  meals: 'Staff Meals',
  payroll_linked: 'Fixed & Payroll-Linked',
  asset: 'Equipment Purchases (₹1,000+, counted over its life)',
};

// Selectable categories, grouped for the <optgroup> UI, scoped to store vs production.
// 'personal_expense' is always excluded: it's a salary advance/loan, not an operating
// cost — use the Salary Advance flow in Payroll instead. Legacy categories (party,
// equipments, miscellaneous, service charge) are kept for old records only.
function buildSelectableCategoriesByGroup(entityScope: 'store' | 'production', canUseRestricted: boolean): Record<OverheadCategoryGroup, { value: string; label: string }[]> {
  const result: Record<OverheadCategoryGroup, { value: string; label: string }[]> = { operating: [], meals: [], payroll_linked: [], asset: [] };
  for (const value of SELECTABLE_OVERHEAD_CATEGORY_KEYS) {
    const meta = OVERHEAD_CATEGORY_META[value];
    if (!canUseRestricted && RESTRICTED_OVERHEAD_CATEGORIES.includes(value)) continue;
    if (entityScope === 'store' && !STORE_OVERHEAD_CATEGORY_KEYS.includes(value)) continue;
    result[meta.group].push({ value, label: meta.label });
  }
  return result;
}

function isMealCategory(category: string): boolean {
  return (MEAL_CATEGORIES as string[]).includes(category);
}

export function OverheadForm({ selectedDate, onSubmit, onClose, editingItem, employees, existingOverheads = [], entityScope, canUseRestrictedCategories = false, allowOwnerPayment = false, productionCashHouseId = null, productionCashCover = null, onDelete }: Props) {
  const [fromProductionCash, setFromProductionCash] = useState(!!editingItem?.paidFromProductionHouseId);
  const selectableCategoriesByGroup = buildSelectableCategoriesByGroup(entityScope, canUseRestrictedCategories);
  const defaultCategory = (Object.values(selectableCategoriesByGroup).flat()[0]?.value || 'miscellaneous') as OverheadItem['category'];
  const [formData, setFormData] = useState({
    category: editingItem ? editingItem.category : defaultCategory,
    description: editingItem ? editingItem.description : '',
    amount: editingItem ? editingItem.amount.toString() : '',
    employeeId: editingItem?.employeeId || '',
    employeeName: editingItem?.employeeName || '',
    employeeIds: editingItem?.employeeIds || [] as string[],
    expenseMonth: editingItem?.expenseMonth || selectedDate.slice(0, 7), // Default to current month (YYYY-MM)
    paymentMethod: (editingItem?.paymentMethod || 'cash') as 'cash' | 'online' | 'both' | 'owner',
    cashAmount: editingItem?.cashAmount ? editingItem.cashAmount.toString() : '',
    onlineAmount: editingItem?.onlineAmount ? editingItem.onlineAmount.toString() : ''
  });

  // Suggestions for the description autocomplete: previously-used descriptions
  // for this same category, most-recent-first.
  const descriptionSuggestions = existingOverheads
    .filter((o) => o.category === formData.category && o.description)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((o) => o.description);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate total amount
  const totalAmount = parseFloat(formData.amount || '0');

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

  // Update employee name when employee ID changes
  useEffect(() => {
    if (formData.category === 'personal_expense' && formData.employeeId) {
      const selectedEmployee = employees.find(emp => emp.employeeId === formData.employeeId);
      if (selectedEmployee) {
        setFormData(prev => ({
          ...prev,
          employeeName: selectedEmployee.name
        }));
      }
    }
  }, [formData.employeeId, formData.category, employees]);

  // Validate split amounts add up to total
  const splitAmountsValid = () => {
    if (formData.paymentMethod !== 'both') return true;
    const cash = parseFloat(formData.cashAmount || '0');
    const online = parseFloat(formData.onlineAmount || '0');
    return Math.abs((cash + online) - totalAmount) < 0.01; // Allow small floating point differences
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate request');
      return;
    }

    if (!splitAmountsValid()) {
      toast.error('Cash and Paytm amounts must add up to the total amount');
      return;
    }
    
    setIsSubmitting(true);
    
    const submissionData: Omit<OverheadItem, 'id'> = {
      date: selectedDate,
      category: formData.category,
      description: formData.description,
      amount: parseFloat(formData.amount),
      paymentMethod: formData.paymentMethod
    };

    // Add employee data only for personal_expense category
    if (formData.category === 'personal_expense') {
      submissionData.employeeId = formData.employeeId;
      submissionData.employeeName = formData.employeeName;
      submissionData.expenseMonth = formData.expenseMonth;
    }

    // Tag which employees a shared meal expense covered
    if (isMealCategory(formData.category) && formData.employeeIds.length > 0) {
      submissionData.employeeIds = formData.employeeIds;
    }

    // Calculate payment method amounts
    let paymentData: Partial<OverheadItem> = {
      paymentMethod: formData.paymentMethod
    };
    
    if (formData.paymentMethod === 'both') {
      paymentData.cashAmount = parseFloat(formData.cashAmount);
      paymentData.onlineAmount = parseFloat(formData.onlineAmount);
    } else if (formData.paymentMethod === 'online') {
      // For online payment, set onlineAmount to total amount
      paymentData.onlineAmount = parseFloat(formData.amount);
      paymentData.cashAmount = 0;
    } else if (formData.paymentMethod === 'cash') {
      // For cash payment, set cashAmount to total amount
      paymentData.cashAmount = parseFloat(formData.amount);
      paymentData.onlineAmount = 0;
    } else if (formData.paymentMethod === 'owner') {
      paymentData.cashAmount = 0;
      paymentData.onlineAmount = 0;
    }
    if (productionCashHouseId) {
      paymentData.paidFromProductionHouseId = formData.paymentMethod === 'cash' && fromProductionCash
        && productionCashChoiceAvailable(parseFloat(formData.amount) || 0, productionCashCover, editingItem) ? productionCashHouseId : null;
    }

    const finalSubmission = {
      ...submissionData,
      ...paymentData
    };


    try {
      await onSubmit(finalSubmission);
    } finally {
      setIsSubmitting(false);
    }
  };

  const { t } = useT();
  const categoryItems = [
    ...(Object.entries(selectableCategoriesByGroup) as [OverheadCategoryGroup, { value: string; label: string }[]][])
      .flatMap(([group, categories]) => categories.map((cat) => ({ value: cat.value, label: stripEmoji(cat.label), group: GROUP_LABELS[group] }))),
    // A historical entry whose category is no longer offered for new entries stays visible.
    ...(editingItem && OVERHEAD_CATEGORY_META[editingItem.category] && !Object.values(selectableCategoriesByGroup).flat().some((c) => c.value === editingItem.category)
      ? [{ value: editingItem.category, label: `${stripEmoji(OVERHEAD_CATEGORY_META[editingItem.category].label)} (historical)` }]
      : []),
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
      title={editingItem ? t('exp.edit') : t('exp.type.overhead')}
      dirty={dirty && !isSubmitting}
      headerActions={<DeleteAction onDelete={onDelete} />}
      footer={<Button type="submit" form="overhead-form" size="lg" fullWidth loading={isSubmitting}>{t('expense.save')}</Button>}
    >
      <form id="overhead-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label={t('exp.category')} required>
          <PickerField
            title={t('exp.category')}
            items={categoryItems}
            value={formData.category}
            onValueChange={(v) => setFormData({
              ...formData,
              category: v as OverheadItem['category'],
              // Reset employee fields when category changes
              employeeId: '',
              employeeName: '',
              employeeIds: [],
            })}
          />
        </Field>

        {isMealCategory(formData.category) && (
          <EmployeeMultiSelect
            employees={employees}
            selectedIds={formData.employeeIds}
            onChange={(ids) => setFormData({ ...formData, employeeIds: ids })}
          />
        )}

        {formData.category === 'personal_expense' && (
          <>
            <Field label="Employee" required helper={formData.employeeId && formData.employeeName ? formData.employeeName : undefined}>
              <PickerField
                title="Employee"
                items={employees.map((emp) => ({ value: emp.employeeId, label: emp.employeeId, description: emp.name, keywords: emp.name }))}
                value={formData.employeeId}
                onValueChange={(v) => setFormData({ ...formData, employeeId: v })}
                placeholder="Select employee"
              />
            </Field>
            <Field label="Expense month" required helper="The month this salary or advance belongs to (useful for late salaries)">
              <Input type="month" value={formData.expenseMonth} onChange={(e) => setFormData({ ...formData, expenseMonth: e.target.value })} required />
            </Field>
          </>
        )}

        <Field label="Description" required>
          <AutocompleteInput
            value={formData.description}
            onChange={(v) => setFormData({ ...formData, description: v })}
            suggestions={descriptionSuggestions}
            placeholder={formData.category === 'personal_expense' ? 'What was the expense for?' : undefined}
            required
          />
        </Field>
        {formData.category !== 'personal_expense' && (
          <AssetHint name={formData.description} category={formData.category} source="overhead" date={selectedDate} />
        )}

        <Field label={t('money.amount')} required>
          <MoneyInput value={formData.amount} onValueChange={(_, raw) => setFormData({ ...formData, amount: raw })} required />
        </Field>

        <PaidFromField
          value={formData.paymentMethod}
          onChange={(m) => setFormData({ ...formData, paymentMethod: m })}
          showOwner={allowOwnerPayment || editingItem?.paymentMethod === 'owner'}
          entity={entityScope}
        >
          {productionCashHouseId && formData.paymentMethod === 'cash' && (
            <ProductionCashChoice checked={fromProductionCash} onChange={setFromProductionCash} amount={parseFloat(formData.amount) || 0} cover={productionCashCover} editingItem={editingItem} />
          )}
          {formData.paymentMethod === 'both' && totalAmount > 0 && (
            <SplitAmounts cash={formData.cashAmount} online={formData.onlineAmount} total={totalAmount} onChange={onSplitChange} />
          )}
        </PaidFromField>
      </form>
    </ResponsiveModal>
  );
}
