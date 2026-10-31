// The figures on the Home screens, as plain functions (no React), so a script can check them
// against the screens they come from (src/components/home/homeFigures.check.mjs).
//
// Each one repeats the calculation of the screen the figure used to live on - same data, same
// rules - rather than inventing a new one:
//   salesForDay       Money > Sales (SalesView: "Total revenue", Counter / Zomato / Swiggy)
//   spentOnDay        Money > Expenses (InventoryManagement: the day's purchases, store + production)
//   storeCashToday    utils/cashSource.ts storeCashOnHand (the Sales page's figure for a store)
//   paytmKnownBalance Paytm weekly check (PaytmWeeklyReconciliation: the last saved day's balance)
//   ownerMonthProfit  Insights > Overview, "This month" (Analytics: Net Normalized Profit card and
//                     the Net Profit / Net Realised Profit cards beside it)
// When WP2 moves Analytics' calculation into a shared hook, ownerMonthProfit should call that.
import { buildSpreadCosts } from '../../utils/spreadCosts';
import { buildOnlineCostIndex, onlineCostsForRange } from '../../utils/onlineCosts';
import { costBucketFor, isSpreadCategory } from '../../utils/inventoryData';
import { buildSmoothedCosts } from '../../utils/dailyCostSmoothing';
import { buildPnl, type PnlData } from '../../utils/pnl';
import { employeeBelongsToStore } from '../../utils/entityAccess';
import { getChannelRevenueFromCategorySales } from '../../utils/salesRevenue';
import { storeCashOnHand } from '../../utils/cashSource';
import { knownPaytmBalance } from '../../utils/paytmRules';
import { monthAdd } from '../../utils/salaryBreakdown';
import { addDays, utcToIST } from '../../utils/timezone';

type Row = Record<string, any>;
type StoreLike = { id: string; productionHouseId?: string | null };

// ---------------------------------------------------------------------------------------------
// Sales for a day (SalesView)

export type DaySales = { counter: number; zomato: number; swiggy: number; total: number; hasEntry: boolean; syncedAt: string | null };

const salesAmountTotal = (s: Row) => (s.offlineSales || 0) + (s.paytmAmount || 0) + (s.cashAmount || 0) + (s.onlineSales || 0);
const onlineEntryTotal = (s: Row) => (s.zomatoSales || 0) + (s.swiggySales || 0);

/**
 * SalesView's figure for one day. `scope`: null = every store (no filter), one id = that store
 * (SalesView's "selected store"), several ids = those stores (the owner's managed stores).
 * `concrete`: the scope is a store the person picked (SalesView's selectedConcreteStoreId).
 */
export function salesForDay(
  data: { salesData: Row[]; onlineSalesData: Row[]; categorySalesData: Row[] },
  date: string,
  scope: string[] | null,
  concrete = false,
): DaySales {
  const scopeSet = scope ? new Set(scope) : null;
  const inScope = (storeId?: string | null) => !scopeSet || (!!storeId && scopeSet.has(storeId));
  const single = scope && scope.length === 1 ? scope[0] : null;

  const pickRows = (rows: Row[], total: (r: Row) => number) => {
    const strict = rows.filter((r) => r.date === date && inScope(r.storeId));
    const legacy = rows.filter((r) => r.date === date && !r.storeId);
    if (concrete) {
      const strictTotal = strict.reduce((t, r) => t + total(r), 0);
      const legacyTotal = legacy.reduce((t, r) => t + total(r), 0);
      return strictTotal > 0 || legacyTotal <= 0 ? strict : legacy;
    }
    if (!scopeSet) return strict;
    const byKey = new Map<string, Row>();
    for (const r of strict) byKey.set(r.id || `${r.storeId || 'legacy'}-${r.date}`, r);
    for (const r of legacy) byKey.set(r.id || `legacy-${r.date}`, r);
    return Array.from(byKey.values());
  };

  const salesRows = pickRows(data.salesData || [], salesAmountTotal);
  const singleEntry = single ? salesRows.find((s) => s.storeId === single) : null;
  const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((t, r) => t + f(r), 0);
  const offlineFromRows = singleEntry ? singleEntry.offlineSales || 0 : sum(salesRows, (s) => s.offlineSales || 0);
  const onlineFromRows = singleEntry ? singleEntry.onlineSales || 0 : sum(salesRows, (s) => s.onlineSales || 0);

  const onlineRows = pickRows(data.onlineSalesData || [], onlineEntryTotal);
  const split = { zomato: sum(onlineRows, (s) => s.zomatoSales || 0), swiggy: sum(onlineRows, (s) => s.swiggySales || 0) };
  const platform = split.zomato + split.swiggy;

  const storeIdsForCategory = scope || null;
  const category = getChannelRevenueFromCategorySales(data.categorySalesData as any, date, storeIdsForCategory);

  const counter = offlineFromRows || category.offline;
  const online = platform || onlineFromRows || category.zomato + category.swiggy;
  const shownSplit = platform > 0 ? split : onlineFromRows > 0 ? { zomato: onlineFromRows, swiggy: 0 } : { zomato: category.zomato, swiggy: category.swiggy };
  const syncedAt = (singleEntry ? [singleEntry.syncedAt] : salesRows.map((s) => s.syncedAt)).filter(Boolean).sort()[0] || null;
  return { counter, zomato: shownSplit.zomato, swiggy: shownSplit.swiggy, total: counter + online, hasEntry: salesRows.length > 0, syncedAt };
}

/** The store list SalesView scopes to for this person (its scopedStoreIds). */
export function salesScopeFor(opts: { selectedStoreId: string | null; isClusterHead: boolean; managedStoreIds?: string[]; assignedStoreIds: string[] }): string[] | null {
  if (opts.selectedStoreId) return [opts.selectedStoreId];
  if (opts.isClusterHead) return opts.managedStoreIds?.length ? opts.managedStoreIds : null;
  if (opts.assignedStoreIds.length > 0) return opts.assignedStoreIds;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Spent on a day (InventoryManagement's day totals)

export type DaySpend = { total: number; count: number; store: { total: number; count: number }; production: { total: number; count: number } };

/**
 * The Expenses screen's totals for a date: `effectiveStoreId` null = everything; otherwise the
 * store's own entries and `productionHouseId`'s (InventoryManagement's matchesEffectiveScope).
 */
export function spentOnDay(
  data: { inventory: Row[]; overheads: Row[]; fixedCosts: Row[] },
  date: string,
  effectiveStoreId: string | null,
  productionHouseId: string | null,
): DaySpend {
  const inScope = (item: Row) => {
    if (!effectiveStoreId) return true;
    if (item.entityType === 'production_house') return !productionHouseId || item.productionHouseId === productionHouseId;
    return item.storeId === effectiveStoreId;
  };
  const side = (production: boolean) => {
    const belongs = (item: Row) => (production ? item.entityType === 'production_house' : item.entityType !== 'production_house');
    const inv = (data.inventory || []).filter((i) => i.date === date && inScope(i) && belongs(i));
    const oh = (data.overheads || []).filter((i) => i.date === date && inScope(i) && belongs(i));
    const fc = (data.fixedCosts || []).filter((i) => i.date === date && inScope(i) && belongs(i));
    const total = inv.reduce((t, i) => t + i.totalCost, 0) + oh.reduce((t, i) => t + i.amount, 0) + fc.reduce((t, i) => t + i.amount, 0);
    return { total, count: inv.length + oh.length + fc.length };
  };
  const store = side(false);
  const production = side(true);
  return { total: store.total + production.total, count: store.count + production.count, store, production };
}

// ---------------------------------------------------------------------------------------------
// Cash and Paytm

/** Each store's own cash today (storeCashOnHand), added up. `counted` only when every store counted. */
export function storeCashToday(opts: { storeIds: string[]; date: string; salesData: Row[]; expenses: Row[]; topups: Row[] }) {
  let cash = 0;
  let countedStores = 0;
  for (const storeId of opts.storeIds) {
    const r = storeCashOnHand({ storeId, date: opts.date, salesData: opts.salesData as any, expenses: opts.expenses as any, topups: opts.topups as any });
    cash += r.cash;
    if (r.counted) countedStores += 1;
  }
  return { cash, counted: opts.storeIds.length > 0 && countedStores === opts.storeIds.length, countedStores, storeCount: opts.storeIds.length };
}

/** The last saved day's closing Paytm balance per store on or before `date`, added up. */
export function paytmKnownBalance(salesData: Row[], storeIds: string[], date: string): { balance: number; asOf: string | null; known: boolean } {
  let balance = 0;
  let asOf: string | null = null;
  let known = false;
  for (const storeId of storeIds) {
    const entries = (salesData || [])
      .filter((s) => s.storeId === storeId && s.date <= date && knownPaytmBalance(s) !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!entries.length) continue;
    known = true;
    balance += knownPaytmBalance(entries[0]) ?? 0;
    if (!asOf || entries[0].date < asOf) asOf = entries[0].date;
  }
  return { balance, asOf, known };
}

// ---------------------------------------------------------------------------------------------
// This month's profit (Analytics, "This month", store mode)

// Analytics' istDateKey / isInWindow / monthInPeriod for the "This month" window.
function istDateKey(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = new Date(value).getTime();
  if (isNaN(time)) return null;
  return utcToIST(new Date(time).toISOString()).slice(0, 10);
}
const inWindow = (value: any, start: string, end: string) => {
  const d = istDateKey(value);
  return !!d && d >= start && d <= end;
};
const monthInWindow = (ym: string, start: string, end: string) => ym >= start.slice(0, 7) && ym <= end.slice(0, 7);
const isCommissionEntry = (item: Row) =>
  (item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) || item.category === 'commission';

export type MonthProfitInput = {
  today: string;
  /** Analytics' effectiveStoreId: the owner's picked store, or null for all stores. */
  storeId: string | null;
  salesData: Row[];
  inventory: Row[];
  overheads: Row[];
  fixedCosts: Row[];
  onlineSalesData: Row[];
  onlinePayoutData: Row[];
  aggregatorSettlements: Row[];
  stores: StoreLike[];
  payouts: Row[];
  /** Active and archived employees (Analytics merges both). */
  employees: Row[];
  loans: Row[];
};

export type MonthProfit = {
  /** Net Normalized Profit: the headline. */
  normalized: number;
  /** Net Profit card (after commission, ads and approved cash shortages). */
  realized: number;
  /** Net Realised Profit card (after a loss brought forward). */
  netRealised: number;
  carryForward: number;
  carriedMonths: string[];
  revenue: number;
  /** Rent, electricity and permanent salaries spread day by day up to today. */
  accrued: number;
  /** The same costs as paid this month. */
  recorded: number;
  daysCounted: number;
  /** Full-month estimate of the spread pool (Analytics' card note). */
  monthPool: number;
  estimatedAmount: number;
};

export function ownerMonthProfit(input: MonthProfitInput): MonthProfit {
  const { today, storeId: sid, stores } = input;
  const start = `${today.slice(0, 7)}-01`;
  const end = today;
  const houseId = sid ? stores.find((s) => s.id === sid)?.productionHouseId || null : null;
  const inScopeCost = (item: Row) => !sid || item.storeId === sid || (!!houseId && item.entityType === 'production_house' && item.productionHouseId === houseId);

  const sales = (input.salesData || []).filter((s) => inWindow(s?.date, start, end) && (!sid || s.storeId === sid));
  const inventory = (input.inventory || []).filter((i) => inWindow(i?.date, start, end) && inScopeCost(i));
  const overheads = (input.overheads || []).filter((i) =>
    (i?.category === 'personal_expense' && i.expenseMonth ? monthInWindow(i.expenseMonth, start, end) : inWindow(i?.date, start, end)) && inScopeCost(i));
  // Rent and electricity by the month they are for (owner, 1 Nov 2026: October's rent paid in November).
  const fixed = (input.fixedCosts || []).filter((i) =>
    ((i?.category === 'rent' || i?.category === 'electricity') && i.forMonth ? monthInWindow(i.forMonth, start, end) : inWindow(i?.date, start, end)) && inScopeCost(i));

  const pick = (items: Row[], amountOf: (x: Row) => number) => (items || [])
    .filter((x) => x?.date && isSpreadCategory(x.category || '') && inScopeCost(x))
    .map((x) => ({ date: x.date, amount: amountOf(x), category: x.category, id: x.id, name: x.itemName || x.description || '' }));
  const spreadSource = [
    ...pick(input.inventory, (x) => x.totalCost || 0),
    ...pick(input.overheads, (x) => x.amount || 0),
    ...pick(input.fixedCosts, (x) => x.amount || 0),
  ];

  const employees = input.employees || [];
  const scopedEmployees = sid ? employees.filter((e) => employeeBelongsToStore(e as any, sid, stores as any)) : employees;
  const scopedEmployeeIds = scopedEmployees.map((e) => e.id);
  const periodPayouts = [
    ...(input.payouts || []).filter((p) => !!p.forMonth && monthInWindow(p.forMonth, start, end)),
    ...(input.payouts || []).filter((p) => !p.forMonth).filter((p) => inWindow(p?.date, start, end)),
  ];
  const payouts = sid ? periodPayouts.filter((p) => scopedEmployeeIds.includes(p.employeeId)) : periodPayouts;

  // calculateMetrics
  const mainSalesRevenue = sales.reduce((t, s) => t + (s.paytmAmount || 0) + (s.cashAmount || 0) + (s.onlineSales || 0), 0);
  const inventoryIn = (bucket: string) => inventory.filter((i) => costBucketFor(i.category || '', 'inventory') === bucket).reduce((t, i) => t + (i.totalCost || 0), 0);
  const inventoryPurchases = inventoryIn('food');
  const inventorySupply = inventoryIn('operating');
  const inventoryFixed = inventoryIn('fixed');
  const personalExpenseTotal = overheads.filter((i) => i.category === 'personal_expense').reduce((t, i) => t + (i.amount || 0), 0);
  const overheadExpenses = overheads
    .filter((i) => !isCommissionEntry(i))
    .filter((i) => costBucketFor(i.category || '', 'overhead') === 'operating')
    .reduce((t, i) => t + (i.amount || 0), 0) + inventorySupply;
  const overheadFixed = overheads.filter((i) => !isCommissionEntry(i) && costBucketFor(i.category || '', 'overhead') === 'fixed').reduce((t, i) => t + (i.amount || 0), 0);

  const storeOnlineSales = (input.onlineSalesData || []).filter((s) => !sid || s.storeId === sid);
  const storeOnlinePayouts = (input.onlinePayoutData || []).filter((p) => !sid || p.storeId === sid);
  const windowOnline = storeOnlineSales.filter((s) => inWindow(s.date, start, end));
  const totalOnlineSales = windowOnline.reduce((t, s) => t + (s.swiggySales || 0) + (s.zomatoSales || 0), 0);
  const totalRevenue = mainSalesRevenue + totalOnlineSales;

  const electricity = fixed.filter((f) => f.category === 'electricity').reduce((t, f) => t + (f.amount || 0), 0);
  const rent = fixed.filter((f) => f.category === 'rent').reduce((t, f) => t + (f.amount || 0), 0);
  let contract = 0;
  let permanent = 0;
  const relevantPayouts = sid ? payouts.filter((p) => scopedEmployeeIds.includes(p.employeeId)) : payouts;
  for (const p of relevantPayouts) {
    const emp = employees.find((e) => e.id === p.employeeId);
    if (!emp) continue;
    if ((emp.type || emp.employmentType) === 'contract') contract += p.amount || 0;
    else permanent += p.amount || 0;
  }
  const salaryExpenses = contract + permanent + personalExpenseTotal;
  const fixedCostsTotal = fixed.filter((f) => costBucketFor(f.category || '', 'fixedcost') === 'fixed').reduce((t, f) => t + (f.amount || 0), 0) + inventoryFixed + overheadFixed;

  // Analytics' calculateAccruedInterest (principal x rate x days / 30, from the loan date).
  let interest = 0;
  for (const loan of sid ? (input.loans || []).filter((l) => l.storeId === sid) : input.loans || []) {
    if (!loan.interestRate || loan.interestRate === 0) continue;
    const loanDate = new Date(loan.loanDate);
    const periodStart = new Date(start);
    const periodEnd = new Date(end);
    const loanEnd = loan.status === 'repaid' && loan.repaymentDate ? new Date(loan.repaymentDate) : periodEnd;
    const overlapStart = loanDate > periodStart ? loanDate : periodStart;
    const overlapEnd = loanEnd < periodEnd ? loanEnd : periodEnd;
    if (overlapStart < overlapEnd) {
      const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      interest += Math.max(0, (loan.loanAmount * loan.interestRate * days) / (100 * 30));
    }
  }

  const spread = buildSpreadCosts(spreadSource, start, end > today ? today : end);
  const packagingStockShare = spread.byCategory.packaging_bulk || 0;
  const spreadExpenses = spread.total - packagingStockShare;
  const inventoryExpenses = inventoryPurchases + packagingStockShare;
  const online = onlineCostsForRange(buildOnlineCostIndex((input.aggregatorSettlements || []) as any[], sid), storeOnlineSales as any[], storeOnlinePayouts as any[], start, end, today);
  const totalCosts = inventoryExpenses + overheadExpenses + fixedCostsTotal + online.commission + online.ads + interest + salaryExpenses + spreadExpenses;
  const netProfit = totalRevenue - totalCosts;

  // Approved cash shortages (calculateCashDiscrepancy).
  const cashDiscrepancy = sales
    .filter((s) => s.approvalRequired === false && s.approvedBy)
    .reduce((t, s) => {
      const offset = s.salesDiscrepancy !== undefined ? s.salesDiscrepancy : (s.cashOffset || 0);
      return t + (offset < 0 ? Math.abs(offset) : 0);
    }, 0);

  // Loss carry-forward from LOSS_CARRY_FORWARD_START (Analytics' carryForward, via utils/pnl.ts).
  const LOSS_CARRY_FORWARD_START = '2026-09';
  const viewMonth = today.slice(0, 7);
  let carried = 0;
  const carriedMonths: string[] = [];
  if (viewMonth > LOSS_CARRY_FORWARD_START) {
    const data: PnlData = {
      sales: input.salesData, inventory: input.inventory, overheads: input.overheads, fixedCosts: input.fixedCosts,
      onlineSales: input.onlineSalesData || [], onlinePayouts: input.onlinePayoutData || [], settlements: input.aggregatorSettlements || [],
      payouts: input.payouts, employees, stores, loans: input.loans as any,
    };
    for (let m = LOSS_CARRY_FORWARD_START; m < viewMonth; m = monthAdd(m, 1)) {
      const profit = buildPnl({ start: `${m}-01`, end: addDays(`${monthAdd(m, 1)}-01`, -1), storeId: sid, data, today }).netProfit;
      carried = Math.min(0, carried + profit);
      if (profit < 0 || carried < 0) carriedMonths.push(m);
    }
  }

  // Rent, electricity and permanent salaries day by day (Analytics' accrualFor / fixedCostAccrual).
  const accrual = buildSmoothedCosts({
    fixedCosts: (input.fixedCosts || []).filter(inScopeCost),
    payouts: (input.payouts || []).filter((p) => !sid || new Set(scopedEmployeeIds).has(p.employeeId)),
    employees,
    windowStart: start,
    windowEnd: end > today ? today : end,
    todayIST: today,
  });

  const realized = netProfit - cashDiscrepancy;
  const netRealised = realized + carried;
  const recorded = rent + electricity + permanent;
  const accrued = Object.values(accrual.byDate).reduce((t, d) => t + d.amount, 0);
  const daysCounted = Object.keys(accrual.byDate).length;
  const [y, mo] = today.split('-').map(Number);
  const monthPool = daysCounted > 0 ? Math.round(accrued * new Date(Date.UTC(y, mo, 0)).getUTCDate() / daysCounted) : 0;
  return {
    normalized: netRealised + recorded - accrued,
    realized,
    netRealised,
    carryForward: carried,
    carriedMonths,
    revenue: totalRevenue,
    accrued,
    recorded,
    daysCounted,
    monthPool,
    estimatedAmount: accrual.estimatedAmount,
  };
}

// ---------------------------------------------------------------------------------------------
// Small counts for the attention list and checklists

/** Day closes waiting for the owner / operations manager (App.tsx's Money tab badge). */
export const salesApprovalsPending = (salesData: Row[]) =>
  (salesData || []).filter((s) => s.approvalRequested && s.approvalStatus !== 'approved' && !s.rejectedBy);

/** Production days waiting for approval (App.tsx's Stock tab badge). */
export const productionApprovalsPending = (productionData: Row[]) => (productionData || []).filter((d) => d.approvalStatus === 'pending');

/** Momos made on a day at a production house (every momo type's final count). */
export function piecesMadeOn(productionData: Row[], date: string, houseIds: string[] | null): number {
  const keys = ['chickenMomos', 'chickenCheeseMomos', 'vegMomos', 'cheeseCornMomos', 'paneerMomos', 'vegKurkureMomos', 'chickenKurkureMomos'];
  return (productionData || [])
    .filter((d) => d.date === date && (!houseIds || houseIds.includes(d.productionHouseId || d.storeId)))
    .reduce((t, d) => t + keys.reduce((s, k) => s + (d[k]?.final || 0), 0), 0);
}

/** Momo pieces asked for in a stock request. */
export const requestPieces = (r: Row) =>
  (r.chickenMomos || 0) + (r.chickenCheeseMomos || 0) + (r.vegMomos || 0) + (r.cheeseCornMomos || 0) + (r.paneerMomos || 0) + (r.vegKurkureMomos || 0) + (r.chickenKurkureMomos || 0);

/** IST calendar date of a timestamp (or a plain date). */
export const istDate = (value: any) => istDateKey(value);

/** Distinct people with approved leave from `from` to `to` (inclusive). */
export function peopleOnLeave(leaves: Row[], from: string, to: string): number {
  return new Set((leaves || []).filter((l) => l.status === 'approved' && l.leaveDate >= from && l.leaveDate <= to).map((l) => l.employeeId)).size;
}

/** Last day of the month `today` is in. */
export const lastDayOfMonth = (today: string) => addDays(`${monthAdd(today.slice(0, 7), 1)}-01`, -1);
