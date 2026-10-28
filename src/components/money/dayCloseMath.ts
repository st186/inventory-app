// The day close's money arithmetic, moved out of SalesManagement.tsx (store incharge's day close)
// and SalesView.tsx (everyone else's day review) unchanged, so both screens and the number check
// (scripts in the WP3 report) run the very same code. Nothing here reads React state.
import type { FixedCostItem, InventoryItem, OverheadItem, SalesData } from '../../App';
import type * as api from '../../utils/api';
import { paidOutsideStoreTill, storeCashPortion } from '../../utils/cashSource';
import { loanRepayments } from '../../utils/paytmRules';
import { addDays } from '../../utils/timezone';

// Matches the backend's PRODUCTION_CASH_GO_LIVE_DATE (index.ts) exactly - from this date
// onward, production house spend has its own cash ledger (ProductionManagement.tsx's
// "Cash in Hand" tab) instead of being folded into the store's own expected-cash figure.
// Dates before it keep the old blended calculation untouched - historical data was never
// captured split, so it isn't retroactively re-split.
export const PRODUCTION_CASH_GO_LIVE_DATE = '2026-08-21';

type Expense = (InventoryItem | OverheadItem | FixedCostItem) & Record<string, any>;

export type DayExpenseInput = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  selectedDate: string;
  effectiveStoreId?: string | null;
  effectiveProductionHouseId?: string | null;
};

// Helper function to identify commission entries
// Commission entries are stored as overhead items with category 'service_charge' and description containing 'Aggregator Commission'
// Legacy entries may have category 'commission'
export const isCommissionEntry = (item: any) => {
  return (
    (item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) ||
    item.category === 'commission' // Legacy format
  );
};

/** The store's cash spend for the day (SalesManagement's totalExpenses). */
export function dayCloseTotalExpenses({ inventory, overheads, fixedCosts, selectedDate, effectiveStoreId, effectiveProductionHouseId }: DayExpenseInput): number {
  // Production house spend used to count against the store's own cash too, since the
  // store's till/Paytm is what actually funds it in practice - but that meant a store
  // incharge's physical count got flagged as "discrepancy" for money they never touched,
  // caused entirely by the production house's own spending. From PRODUCTION_CASH_GO_LIVE_DATE
  // onward, production has its OWN cash ledger (see ProductionManagement.tsx's "Cash in
  // Hand" tab, backed by production-cash: records) - so the store's own expected-cash
  // calculation goes back to being strictly the store's own spend, full stop. Dates before
  // go-live keep the old blended behavior exactly as-is (historical data was never captured
  // split, so it isn't retroactively re-split here).
  const includeProductionSpend = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;
  // Paid with the cluster head's own money, or out of production's cash: a store cost, but
  // never out of this store's own cash.
  const fromStoreMoney = (item: { paymentMethod?: string; paidFromProductionHouseId?: string | null }) => !paidOutsideStoreTill(item);

  // Only the cash part of each bill comes out of the till: an online-paid bill none of it,
  // a "both" bill just its cashAmount (storeCashPortion - same as SalesView's expected cash
  // and the bill form's store-cash check).
  const inventoryCost = inventory
    .filter(item => {
      if (!fromStoreMoney(item)) return false;
      const dateMatch = item.date === selectedDate;
      const isThisStoresProductionHouseSpend = includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
      const storeMatch = effectiveStoreId ? (item.storeId === effectiveStoreId || isThisStoresProductionHouseSpend) : true;
      return dateMatch && storeMatch;
    })
    .reduce((sum, item) => sum + storeCashPortion(item), 0);

  const allOverheadCosts = overheads
    .filter(item => {
      if (!fromStoreMoney(item)) return false;
      const dateMatch = item.date === selectedDate;
      const isThisStoresProductionHouseSpend = includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
      const storeMatch = effectiveStoreId ? (item.storeId === effectiveStoreId || isThisStoresProductionHouseSpend) : true;
      return dateMatch && storeMatch;
    })
    .reduce((sum, item) => sum + storeCashPortion(item), 0);

  const allFixedCosts = fixedCosts
    .filter(item => {
      if (!fromStoreMoney(item)) return false;
      const dateMatch = item.date === selectedDate;
      const isThisStoresProductionHouseSpend = includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
      const storeMatch = effectiveStoreId ? (item.storeId === effectiveStoreId || isThisStoresProductionHouseSpend) : true;
      return dateMatch && storeMatch;
    })
    .reduce((sum, item) => sum + storeCashPortion(item), 0);

  return inventoryCost + allOverheadCosts + allFixedCosts;
}

export type ExpenseBreakdownByEntity = {
  rows: { label: string; store: number; production: number }[];
  storeTotal: number;
  productionTotal: number;
};

/** The same total split by who spent it: the store, or (before go-live) its production house. */
export function dayCloseExpenseBreakdown({ inventory, overheads, fixedCosts, selectedDate, effectiveStoreId, effectiveProductionHouseId }: DayExpenseInput): ExpenseBreakdownByEntity {
  const includeProductionSpend = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;
  const isProdHouseSpend = (item: { entityType?: string; productionHouseId?: string }) =>
    includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
  const belongsToday = (item: { date: string; storeId?: string; paymentMethod?: string; entityType?: string; productionHouseId?: string; paidFromProductionHouseId?: string | null }) =>
    !paidOutsideStoreTill(item) && item.date === selectedDate && (effectiveStoreId ? (item.storeId === effectiveStoreId || isProdHouseSpend(item)) : true);

  const split = (list: any[]) => {
    let store = 0;
    let production = 0;
    list.forEach((item) => {
      if (!belongsToday(item)) return;
      const amt = storeCashPortion(item);
      if (isProdHouseSpend(item)) production += amt; else store += amt;
    });
    return { store, production };
  };

  const inv = split(inventory);
  const overhead = split(overheads);
  const fixed = split(fixedCosts);

  return {
    rows: [
      { label: 'Inventory', ...inv },
      { label: 'Overhead', ...overhead },
      { label: 'Fixed costs', ...fixed },
    ],
    storeTotal: inv.store + overhead.store + fixed.store,
    productionTotal: inv.production + overhead.production + fixed.production,
  };
}

// Calculate expected closing cash balance
export const calculateCashInHand = (prevCash: number, cashReceived: number, expenses: number, paytmAmount: number, contractPayouts: number) => {
  // "Amount Used from Paytm" now INCLUDES contract payouts in the total
  // Contract payouts are withdrawn from Paytm (included in paytmAmount) and then paid out to employees
  // So: Expected Cash = prevCash + paytmAmount + cashReceived - expenses - contractPayouts
  return prevCash + paytmAmount + cashReceived - expenses - contractPayouts;
};

/** Event stall cash on the day's row: handed back to this till (in) minus floats sent out. */
export const dayEventCash = (salesForDate: SalesData | undefined | null) =>
  ((salesForDate as any)?.eventCashIn || 0) - ((salesForDate as any)?.eventCashOut || 0);

/** SalesManagement's expectedCashInHand from the form's text fields. */
export function dayCloseExpectedCash(params: {
  previousCashInHand: string;
  cashAmount: string;
  usedOnlineMoney: string;
  totalExpenses: number;
  totalContractPayout: number;
  salesForDate: SalesData | undefined | null;
}): number {
  const prevCash = parseFloat(params.previousCashInHand) || 0;
  const cashReceived = parseFloat(params.cashAmount) || 0;
  const paytmAmount = parseFloat(params.usedOnlineMoney) || 0;
  // Event stalls (events.ts): cash an event handed back to this till comes in, a float sent to an
  // event goes out (GET /sales puts eventCashIn / eventCashOut on the day's row).
  const eventCash = dayEventCash(params.salesForDate);
  return calculateCashInHand(prevCash, cashReceived, params.totalExpenses, paytmAmount, params.totalContractPayout) + eventCash;
}

/** Counted minus expected; 0 while nothing has been counted. */
export function dayCloseCashDiscrepancy(actualCashInHand: string, expectedCashInHand: number): number {
  const actual = parseFloat(actualCashInHand) || 0;
  if (actual === 0) return 0;
  return actual - expectedCashInHand;
}

/** Counter sales (POS) against the Paytm + cash the incharge counted. Positive = short. */
export function offlinePaymentCheck(params: { offlineSales: string; categoryOffline: number; paytmAmount: string; cashAmount: string }) {
  const offlineSalesTotal = parseFloat(params.offlineSales) || params.categoryOffline || 0;
  const paytm = parseFloat(params.paytmAmount) || 0;
  const cash = parseFloat(params.cashAmount) || 0;
  const offlinePaymentTotal = paytm + cash;
  // Signed: positive means the counted cash+paytm is SHORT of the real offline total,
  // negative means it's OVER (matches "can be positive or negative" from the requested behavior).
  const offlinePaymentDiscrepancy = offlineSalesTotal - offlinePaymentTotal;
  const paymentMismatch = Math.abs(offlinePaymentDiscrepancy) > 0.01;
  return { offlineSalesTotal, offlinePaymentTotal, offlinePaymentDiscrepancy, paymentMismatch };
}

export type PaytmDayRow = {
  date: string;
  paytmReceived: number;
  onlinePayouts: number;
  usedOnlineMoney: number;
  commission: number;
  employeePayouts: number;
  loansTaken: number;
  loanRepayments: number;
  netChange: number;
  runningBalance: number;
};

/** The month-to-date Paytm movements behind the store incharge's "Breakdown" sheet. */
export function paytmDailyBreakdown(params: {
  salesData: SalesData[];
  fixedCosts: FixedCostItem[];
  overheads: OverheadItem[];
  inventory: InventoryItem[];
  payoutsForDisplay: api.OnlinePayoutEntry[];
  employeePayouts: any[];
  onlineLoans: api.OnlineLoan[];
  selectedDate: string;
  effectiveStoreId?: string | null;
  lastOnlineRecalibration: any;
}): PaytmDayRow[] {
  const { salesData, fixedCosts, overheads, inventory, payoutsForDisplay, employeePayouts, onlineLoans, selectedDate, effectiveStoreId, lastOnlineRecalibration } = params;
  // Check if there's a recalibration for the current month
  const selectedMonth = selectedDate.slice(0, 7);
  const hasRecalibrationThisMonth = lastOnlineRecalibration && lastOnlineRecalibration.month === selectedMonth;
  const recalibrationDate = hasRecalibrationThisMonth ? lastOnlineRecalibration.date : '2000-01-01';

  // Always show from the 1st of the selected month for better visibility
  // But use recalibration for balance calculations
  const displayStartDate = `${selectedMonth}-01`;

  // Filter by store
  const storeFilteredSales = effectiveStoreId
    ? salesData.filter(s => s.storeId === effectiveStoreId)
    : salesData;
  const storeFilteredFixed = effectiveStoreId
    ? fixedCosts.filter(i => i.storeId === effectiveStoreId)
    : fixedCosts;
  const storeFilteredOverhead = effectiveStoreId
    ? overheads.filter(i => i.storeId === effectiveStoreId)
    : overheads;
  const storeFilteredInventory = effectiveStoreId
    ? inventory.filter(i => i.storeId === effectiveStoreId)
    : inventory;

  // Get all unique dates FROM display start date (1st of month) onwards, up to selected date
  const allDates = new Set<string>();

  storeFilteredSales
    .filter(s => s.date >= displayStartDate && s.date <= selectedDate)
    .forEach(s => allDates.add(s.date));

  storeFilteredFixed
    .filter(item => item.date >= displayStartDate && item.date <= selectedDate)
    .forEach(item => allDates.add(item.date));

  storeFilteredOverhead
    .filter(item => item.date >= displayStartDate && item.date <= selectedDate)
    .forEach(item => allDates.add(item.date));

  storeFilteredInventory
    .filter(item => item.date >= displayStartDate && item.date <= selectedDate)
    .forEach(item => allDates.add(item.date));

  // Add commission dates (commission entries identified by description pattern)
  storeFilteredOverhead
    .filter(item => isCommissionEntry(item) && item.date >= displayStartDate && item.date <= selectedDate)
    .forEach(item => allDates.add(item.date));

  // Add loan dates (loans taken add money to Paytm)
  const storeFilteredLoans = effectiveStoreId
    ? onlineLoans.filter(l => l.storeId === effectiveStoreId)
    : onlineLoans;

  storeFilteredLoans
    .filter(l => l.loanDate >= displayStartDate && l.loanDate <= selectedDate)
    .forEach(l => allDates.add(l.loanDate));

  // Add loan repayment dates (repayments deduct money from Paytm) - each repayment on its
  // own date, partial ones included
  storeFilteredLoans
    .forEach(l => loanRepayments(l)
      .filter(r => r.date >= displayStartDate && r.date <= selectedDate)
      .forEach(r => allDates.add(r.date)));

  // Sort dates chronologically
  const sortedDates = Array.from(allDates).sort();

  // First pass: calculate all daily changes
  const dailyData: PaytmDayRow[] = sortedDates.map(date => {
    const salesForDay = storeFilteredSales.find(s => s.date === date);
    const paytmReceived = salesForDay?.paytmAmount ?? 0;

    // "Used online money" is driven entirely by approved cash top-ups (stored directly
    // on the sales record), not by inventory/overhead/fixed-cost payment method flags,
    // which are now just a placeholder with no effect on any balance.
    const usedOnlineMoney = salesForDay?.usedOnlineMoney ?? 0;

    // Sum all commissions for this date (in case there are multiple entries)
    // Commission is PAID via Paytm to aggregators (Swiggy/Zomato)
    // If payment method is 'both', only include the online portion
    const commission = storeFilteredOverhead
      .filter(item => isCommissionEntry(item) && item.date === date)
      .reduce((sum, item) => {
        // Handle legacy entries where paymentMethod might be undefined (assume 'online' for commission)
        const paymentMethod = item.paymentMethod || 'online';
        if (paymentMethod === 'online') return sum + (item.amount || 0);
        if (paymentMethod === 'both') return sum + (item.onlineAmount || 0);
        return sum;
      }, 0);

    // Get online payouts for the day (what Swiggy/Zomato actually pay us)
    const storeFilteredPayouts = effectiveStoreId
      ? payoutsForDisplay.filter(p => p.storeId === effectiveStoreId)
      : payoutsForDisplay;

    const onlinePayouts = storeFilteredPayouts
      .filter(p => p.date === date)
      .reduce((sum, p) => sum + (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0), 0);

    // Get employee payouts for the day (paid from Online Cash in Hand)
    const storeFilteredEmployeePayouts = effectiveStoreId
      ? employeePayouts.filter(p => !p.storeId || p.storeId === effectiveStoreId) // Include payouts without storeId for backward compatibility
      : employeePayouts;

    const employeePayoutsForDay = storeFilteredEmployeePayouts
      .filter(p => p.date === date && (p.paidFrom == null || p.paidFrom === 'paytm'))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Get loans taken on this day (adds money to Paytm)
    const loansForDay = storeFilteredLoans
      .filter(l => l.loanDate === date)
      .reduce((sum, l) => sum + l.loanAmount, 0);

    // Get loan repayments made on this day (reduces money from Paytm)
    const repaymentForDay = storeFilteredLoans
      .reduce((sum, l) => sum + loanRepayments(l).filter(r => r.date === date).reduce((s, r) => s + r.amount, 0), 0);

    // Net change = Paytm Received + Online Payouts + Loans Taken - Used - Commission - Employee Payouts - Loan Repayments
    const netChange = paytmReceived + onlinePayouts + loansForDay - usedOnlineMoney - commission - employeePayoutsForDay - repaymentForDay;

    return {
      date,
      paytmReceived,
      onlinePayouts,
      usedOnlineMoney,
      commission,
      employeePayouts: employeePayoutsForDay,
      loansTaken: loansForDay,
      loanRepayments: repaymentForDay,
      netChange,
      runningBalance: 0, // Will be calculated in second pass
    };
  });

  // Second pass: Calculate running balances
  if (hasRecalibrationThisMonth) {
    // Find the recalibration date index
    const recalibrationIndex = dailyData.findIndex(d => d.date === recalibrationDate);
    if (recalibrationIndex >= 0) {
      // Set the recalibration date's balance
      dailyData[recalibrationIndex].runningBalance = lastOnlineRecalibration.actualBalance;
      // Calculate forwards from recalibration date
      for (let i = recalibrationIndex + 1; i < dailyData.length; i++) {
        dailyData[i].runningBalance = dailyData[i - 1].runningBalance + dailyData[i].netChange;
      }
      // Calculate backwards from recalibration date
      for (let i = recalibrationIndex - 1; i >= 0; i--) {
        dailyData[i].runningBalance = dailyData[i + 1].runningBalance - dailyData[i + 1].netChange;
      }
    } else {
      // Recalibration date not in range, start from beginning
      let balance = 0;
      dailyData.forEach(day => {
        balance += day.netChange;
        day.runningBalance = balance;
      });
    }
  } else {
    // No recalibration, calculate normally from start
    let balance = 0;
    dailyData.forEach(day => {
      balance += day.netChange;
      day.runningBalance = balance;
    });
  }

  return dailyData;
}

// ------------------------------------------------------------------------------------------
// SalesView (read-only day review)
// ------------------------------------------------------------------------------------------

type ViewScope = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  selectedDate: string;
  effectiveStoreId?: string | null;
  matchesStoreScope: (storeId?: string | null) => boolean;
};

/** THIS STORE's own cash expenses only (SalesView's todaysExpenses, all three copies). */
export function viewStoreCashExpenses({ inventory, overheads, fixedCosts, selectedDate, effectiveStoreId, matchesStoreScope }: ViewScope, isAggregateEntry: boolean): number {
  return ([...inventory, ...overheads, ...fixedCosts] as Expense[])
    .filter((item: any) => {
      if (item.date !== selectedDate) return false;
      if (item.entityType === 'production_house') return false;
      if (isAggregateEntry) return matchesStoreScope(item.storeId);
      if (!effectiveStoreId) return true;
      return item.storeId === effectiveStoreId;
    })
    .reduce((sum: number, item: any) => {
      const amount = item.totalCost ?? item.amount ?? 0;
      if (paidOutsideStoreTill(item)) return sum; // own money, or paid from production's cash
      if (item.paymentMethod === 'both') return sum + (item.cashAmount || 0);
      if (item.paymentMethod === 'online') return sum;
      return sum + amount; // default/'cash'
    }, 0);
}

/** The "Store Cash in Hand" card on the day review: previous cash + top-up + cash - expenses. */
export function viewStoreCashCard(params: ViewScope & {
  entry: any;
  salesData: SalesData[];
  carriedCash: number;
}) {
  const { entry, salesData, selectedDate, effectiveStoreId, carriedCash } = params;
  // Carried forward dynamically from yesterday's actual - entry.previousCashInHand is a stored
  // field that the POS auto-sync hardcodes to 0 when it creates today's placeholder record.
  const isAggregateEntry = entry.storeId === 'all';
  const previousDateStr = addDays(selectedDate, -1);
  const previousDayEntry = isAggregateEntry
    ? null
    : salesData.find((s) => s.date === previousDateStr && (effectiveStoreId ? s.storeId === effectiveStoreId : true));
  const previousEntry = previousDayEntry?.actualCashInHand !== undefined && previousDayEntry.actualCashInHand !== null
    ? previousDayEntry
    : [...salesData]
      .filter((s) => s.date < selectedDate && (effectiveStoreId ? s.storeId === effectiveStoreId : true) && s.actualCashInHand !== undefined && s.actualCashInHand !== null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  // From PRODUCTION_CASH_GO_LIVE_DATE onward the store's own cash no longer carries forward.
  const prevCash = selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE
    ? 0
    : isAggregateEntry
      ? carriedCash
      : previousEntry?.actualCashInHand ?? entry.previousCashInHand ?? 0;
  // A cash topup is money moved OUT of the Paytm/online balance and handed to the store as
  // physical cash - it increases cash on hand (here) and is deducted from the Paytm side.
  const cashTopup = entry.usedOnlineMoney ?? 0;
  const cashReceived = entry.cashAmount || 0;
  const notYetReconciled = entry.createdBy === 'pos-sync';
  const todaysExpenses = viewStoreCashExpenses(params, isAggregateEntry);
  // Contract/salary payouts are paid out of the Paytm/online balance, not physical cash.
  const expectedCash = prevCash + cashTopup + cashReceived - todaysExpenses;
  const actualCashInHand = entry.actualCashInHand ?? 0;
  return { prevCash, cashTopup, cashReceived, todaysExpenses, expectedCash, notYetReconciled, actualCashInHand };
}

/**
 * Live cash discrepancy on the day review, recomputed from today's figures (null until a real
 * count is saved: a POS-sync placeholder is not a count).
 */
export function viewLiveCashReconciliation(params: Parameters<typeof viewStoreCashCard>[0]) {
  const { entry } = params;
  if (!entry || entry.createdBy === 'pos-sync' || entry.actualCashInHand === undefined || entry.actualCashInHand === null) return null;
  const card = viewStoreCashCard(params);
  return { expectedCash: card.expectedCash, actualCashInHand: card.actualCashInHand, discrepancy: card.actualCashInHand - card.expectedCash };
}
