import { CashCover, formatRupees, productionShouldCover, storeCashPortion } from '../utils/cashSource';

// Store bills come off the store's own cash. Production's cash steps in only when the store's
// cash can't cover the bill and production's can (cluster head only; see utils/cashSource.ts).

type EditedBill = {
  paidFromProductionHouseId?: string | null;
  paymentMethod?: string;
  cashAmount?: number;
  totalCost?: number;
  amount?: number;
};

// New bills (Quick Add, invoice scan): switched to production's cash automatically when needed.
// Says so, and lets the cluster head keep it on store cash anyway.
export function ProductionCashNotice({ cover, amount, usingProduction, onChange }: {
  cover: CashCover;
  amount: number;
  usingProduction: boolean;
  onChange: (useProduction: boolean) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
      {usingProduction ? (
        <>
          <p>
            The store's cash for the day is {formatRupees(cover.storeCash)}, not enough for this {formatRupees(amount)} bill,
            so it's paid from production's cash ({formatRupees(cover.productionCash)} in hand). It still counts as the store's cost.
          </p>
          <button type="button" onClick={() => onChange(false)} className="font-semibold underline">Use store cash anyway</button>
        </>
      ) : (
        <>
          <p>Paying from store cash leaves the store at {formatRupees(cover.storeCash - amount)} for the day.</p>
          <button type="button" onClick={() => onChange(true)} className="font-semibold underline">Pay from production cash instead</button>
        </>
      )}
    </div>
  );
}

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
    <label className="flex items-start gap-2 p-3 border border-amber-200 bg-amber-50 rounded-lg cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 text-amber-600"
      />
      <div className="flex-1">
        <span className="text-sm text-gray-900">Taken from production cash in hand</span>
        <p className="text-xs text-gray-500">
          {before
            ? `Store cash for the day is ${formatRupees(before.store)}; production has ${formatRupees(before.production)}. `
            : ''}
          Still the store's cost, but the cash comes off the production house's cash in hand, not the store's.
        </p>
      </div>
    </label>
  );
}
