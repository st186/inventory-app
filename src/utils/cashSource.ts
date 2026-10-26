// Which till an expense's cash actually came out of. The cost always belongs to the
// expense's own store or production house; the cash doesn't have to:
// - paymentMethod 'owner': the cluster head's own money, no till at all
// - paidFromProductionHouseId: a store bill paid out of that production house's cash in
//   hand (e.g. the store's electricity bill when the store's own cash can't cover it) - the
//   server counts it in that house's production cash instead
// Store cash-in-hand figures must skip both.
type CashSourceFields = { paymentMethod?: string; paidFromProductionHouseId?: string | null };

export const paidFromProductionCash = (item: CashSourceFields) => !!item.paidFromProductionHouseId;

export const paidOutsideStoreTill = (item: CashSourceFields) =>
  item.paymentMethod === 'owner' || paidFromProductionCash(item);

type ExpenseCash = CashSourceFields & { cashAmount?: number; totalCost?: number; amount?: number };

// The part of an expense that comes out of the store's own cash in hand.
export const storeCashPortion = (item: ExpenseCash) => {
  if (paidOutsideStoreTill(item)) return 0;
  if (item.paymentMethod === 'both') return item.cashAmount || 0;
  if (item.paymentMethod === 'online') return 0;
  return item.totalCost ?? item.amount ?? 0;
};

// Production cash in hand tracking (and the morning handover of the store's cash to
// production) starts on this date - same constant as SalesView/SalesManagement.
export const PRODUCTION_CASH_GO_LIVE_DATE = '2026-08-21';

// What the store's own till and its production house's till hold on a date, before a new bill.
export type CashCover = {
  storeCash: number;
  productionCash: number;
  storeCounted: boolean; // the store's figure is the day's physical count
};

// A store's own cash on a date. The previous night's cash goes to production each morning, so
// nothing carries over: it's the counted cash once the day is reconciled, otherwise top-ups +
// cash collected so far - cash spent so far. Same figure the Sales page shows for the store.
export function storeCashOnHand(params: {
  storeId: string;
  date: string;
  salesData: { storeId?: string; date: string; actualCashInHand?: number | null; usedOnlineMoney?: number; cashAmount?: number }[];
  expenses: (ExpenseCash & { date: string; storeId?: string | null; entityType?: string })[];
  topups: { storeId?: string | null; date: string; status: string; reason?: string; requestedAmount: number }[];
}): { cash: number; counted: boolean } {
  const { storeId, date } = params;
  const entry = params.salesData.find((s) => s.storeId === storeId && s.date === date);
  if (typeof entry?.actualCashInHand === 'number') return { cash: entry.actualCashInHand, counted: true };
  const toppedUp = entry
    ? entry.usedOnlineMoney ?? 0
    : params.topups
        .filter((t) => t.storeId === storeId && t.date === date && t.status === 'approved' && t.reason !== 'production_inventory')
        .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);
  const collected = entry?.cashAmount || 0;
  const spent = params.expenses
    .filter((item) => item.date === date && item.entityType !== 'production_house' && item.storeId === storeId)
    .reduce((sum, item) => sum + storeCashPortion(item), 0);
  return { cash: toppedUp + collected - spent, counted: false };
}

// Store bills come off the store's own cash by default. Production's cash steps in only when the
// store's cash can't cover the bill and production's can.
export const productionShouldCover = (cover: CashCover | null, amount: number, storeCashBefore?: number, productionCashBefore?: number) => {
  if (!cover || !(amount > 0)) return false;
  const store = storeCashBefore ?? cover.storeCash;
  const production = productionCashBefore ?? cover.productionCash;
  return store < amount && production >= amount;
};

export const formatRupees = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
