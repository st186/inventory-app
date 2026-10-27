import { CashCover, formatRupees, productionShouldCover, storeCashPortion } from '../utils/cashSource';

// Store bills come off the store's own cash. When the store's cash can't cover a bill and
// production's can, an unticked "Taken from production cash in hand" box is offered (cluster
// head only; see utils/cashSource.ts) - in Quick Add, the invoice scanner and the edit forms.

type EditedBill = {
  paidFromProductionHouseId?: string | null;
  paymentMethod?: string;
  cashAmount?: number;
  totalCost?: number;
  amount?: number;
};

// The store's and production's cash before this bill: an edited bill is already inside today's
// figures, so its own cash is added back to whichever till it came from.
function cashBefore(cover: CashCover, editingItem?: EditedBill | null) {
  const fromProduction = !!editingItem?.paidFromProductionHouseId;
  const oldAmount = editingItem ? editingItem.totalCost ?? editingItem.amount ?? 0 : 0;
  return {
    store: cover.storeCash + (editingItem && !fromProduction && !cover.storeCounted ? storeCashPortion(editingItem) : 0),
    production: cover.productionCash + (fromProduction ? oldAmount : 0),
  };
}

// Editing a store bill: production's cash is offered only when it's needed, or when the bill
// already came from there (so it can be moved back).
export function productionCashChoiceAvailable(amount: number, cover: CashCover | null, editingItem?: EditedBill | null) {
  if (editingItem?.paidFromProductionHouseId) return true;
  if (!cover) return false;
  const before = cashBefore(cover, editingItem);
  return productionShouldCover(cover, amount, before.store, before.production);
}

export function ProductionCashChoice({ checked, onChange, amount, cover, editingItem }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  amount: number;
  cover: CashCover | null;
  editingItem?: EditedBill | null;
}) {
  if (!productionCashChoiceAvailable(amount, cover, editingItem)) return null;
  const before = cover ? cashBefore(cover, editingItem) : null;
  return (
    <label className="flex items-start gap-2 p-3 border border-warning-border bg-warning-soft rounded-lg cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 text-warning"
      />
      <div className="flex-1">
        <span className="text-sm text-text">Taken from production cash in hand</span>
        <p className="text-xs text-text-3">
          {before
            ? `Store cash for the day is ${formatRupees(before.store)}; production has ${formatRupees(before.production)}. `
            : ''}
          Still the store's cost, but the cash comes off the production house's cash in hand, not the store's.
        </p>
      </div>
    </label>
  );
}
