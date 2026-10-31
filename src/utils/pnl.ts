// Profit and loss for any date window, line by line - the one definition every screen and
// export uses (Analytics' loss carry-forward and Unit Economics trend, the Export page and its
// report packs, the Business Audit Report), so they all show the same profit.
//
// Moved out of Analytics.tsx (pnlForMonth) with the same rules:
// - Revenue: counter sales counted at the till (cash + Paytm/UPI), plus Zomato/Swiggy sales.
// - Food & packaging inventory, running costs, rent/electricity/internet (fixed costs), each
//   bucketed by costBucketFor in inventoryData.ts.
// - Equipment, the scooter and yearly subscriptions spread over their life, bulk packaging
//   stock over the days it's used (spreadCosts.ts) - loan EMIs are never a cost.
// - Salaries by the month they cover (Payout.forMonth), personal expenses by expenseMonth.
// - Zomato/Swiggy commission and ads from settlement files (onlineCosts.ts).
// - Interest on owner/investor loans, and approved cash shortages.
// Everything after today (IST) is left out, so a month in progress counts up to today.

import { buildSpreadCosts } from './spreadCosts';
import { buildOnlineCostIndex, onlineCostsForRange, type OnlineCostIndex } from './onlineCosts';
import { costBucketFor, canonicalCategory, isSpreadCategory } from './inventoryData';
import { employeeBelongsToStore } from './entityAccess';
import { getTodayIST, addDays } from './timezone';
import { monthAdd } from './salaryBreakdown';

export type PnlBreakdown = {
  revenue: number;
  counterRevenue: number;
  onlineRevenue: number;
  zomatoRevenue: number;
  swiggyRevenue: number;
  onlineDiscounts: number; // restaurant-funded discounts on settled online orders (already out of revenue)
  food: number; // ingredients
  packaging: number;
  commission: number; // Zomato/Swiggy commission, excl. GST
  platformAds: number;
  marketing: number;
  staff: number; // salaries incl. personal expenses
  occupancy: number; // rent, electricity, internet & phone
  otherOpex: number; // running costs incl. the POS subscription's share
  depreciation: number; // equipment and the scooter, spread over their life
  interest: number;
  shortages: number; // approved cash shortages
  netProfit: number;
  estimatedCommission: number; // commission + ads estimated for days not settled yet
  estimatedDays: number;
  // The parts of staff and occupancy that are paid once a month (permanent salaries; rent and
  // electricity) - the normalized view swaps them for a day-by-day share.
  staffSmoothable?: number;
  occupancySmoothable?: number;
};

// 'combined': a store with its linked production house (what Analytics shows for one store),
// or everything when no store is picked. 'store' / 'production': just that side's own costs -
// revenue, online costs, loan interest and cash shortages all belong to the store.
export type PnlScope = 'combined' | 'store' | 'production';

type StoreLike = { id: string; productionHouseId?: string | null };

export type LoanLike = {
  id?: string;
  storeId?: string;
  loanAmount: number;
  loanDate: string;
  status?: string;
  repaymentDate?: string | null;
  repaidAmount?: number;
  interestRate?: number;
};

export type PnlData = {
  sales: any[]; // daily sales records (counter cash/Paytm, cash count, approvals)
  inventory: any[];
  overheads: any[];
  fixedCosts: any[];
  onlineSales: any[]; // Zomato/Swiggy sales per day
  onlinePayouts: any[]; // old manual payout entries (before settlement uploads)
  settlements: any[]; // aggregator settlement files
  payouts: any[]; // salary payouts
  employees: any[]; // active AND archived - a released employee's old salaries still count
  stores: StoreLike[];
  loans: LoanLike[];
};

// Old manual commission entries, replaced by settlement files - never counted as a cost.
export const isCommissionEntry = (item: any) =>
  (item?.category === 'service_charge' && item?.description?.includes('Aggregator Commission')) ||
  item?.category === 'commission';

export const lastDayOfMonth = (ym: string) => addDays(`${monthAdd(ym, 1)}-01`, -1);
const monthOverlaps = (ym: string, start: string, end: string) => `${ym}-01` <= end && lastDayOfMonth(ym) >= start;
const inRange = (d: string | undefined, start: string, end: string) => !!d && d >= start && d <= end;

// A salary counts in the month it covers, not the day it was paid (a September salary paid on
// 5 October is September's cost).
export const payoutCountsIn = (p: any, start: string, end: string) =>
  p?.forMonth ? monthOverlaps(p.forMonth, start, end) : inRange(p?.date, start, end);

// Same for a personal expense deducted from an employee's salary.
export const expenseCountsIn = (x: any, start: string, end: string) =>
  x?.category === 'personal_expense' && x?.expenseMonth ? monthOverlaps(x.expenseMonth, start, end) : inRange(x?.date, start, end);

export const linkedProductionHouseId = (storeId: string | null, stores: StoreLike[]) =>
  storeId ? stores.find((s) => s.id === storeId)?.productionHouseId || null : null;

// A production house's own expenses carry entityType 'production_house' and its id in
// productionHouseId - never a storeId - so a store's view has to pick them up by its linked house.
export function recordInScope(item: any, storeId: string | null, scope: PnlScope, stores: StoreLike[]): boolean {
  const isHouse = item?.entityType === 'production_house';
  const houseId = linkedProductionHouseId(storeId, stores);
  if (scope === 'store') return !isHouse && (!storeId || item?.storeId === storeId);
  if (scope === 'production') return isHouse && (!storeId || (!!houseId && item?.productionHouseId === houseId));
  return !storeId || item?.storeId === storeId || (!!houseId && isHouse && item?.productionHouseId === houseId);
}

// Production staff hold their production house's id in storeId (see entityAccess.ts), or say so
// in their designation/department.
export function isProductionEmployee(emp: any, stores: StoreLike[]): boolean {
  const houseIds = new Set(stores.map((s) => s.productionHouseId).filter(Boolean));
  return emp?.department === 'production'
    || emp?.designation === 'production_incharge'
    || emp?.designation === 'production_ops'
    || (!!emp?.storeId && houseIds.has(emp.storeId))
    || ((emp?.assignedProductionHouseIds?.length || 0) > 0 && !(emp?.assignedStoreIds?.length));
}

export function employeeInScope(emp: any, storeId: string | null, scope: PnlScope, stores: StoreLike[]): boolean {
  if (storeId && !employeeBelongsToStore(emp, storeId, stores)) return false;
  if (scope === 'combined') return true;
  return (scope === 'production') === isProductionEmployee(emp, stores);
}

// Interest on owner/investor loans: principal x monthly rate x days / 30, from the loan date
// until it's repaid (same formula as Analytics' interest card). A loan still waiting for
// approval, or turned down, never reached the till and accrues nothing.
export function accruedInterest(loans: LoanLike[], start: string, end: string, storeId?: string | null): number {
  const dayNumber = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, day) / 86400000;
  };
  let total = 0;
  for (const loan of loans || []) {
    if (storeId && loan.storeId !== storeId) continue;
    if (!loan.interestRate || !loan.loanDate || loan.status === 'pending' || loan.status === 'rejected') continue;
    const loanEnd = loan.status === 'repaid' && loan.repaymentDate ? loan.repaymentDate.slice(0, 10) : end;
    const from = loan.loanDate.slice(0, 10) > start ? loan.loanDate.slice(0, 10) : start;
    const to = loanEnd < end ? loanEnd : end;
    if (from < to) {
      const days = dayNumber(to) - dayNumber(from) + 1;
      total += Math.max(0, (loan.loanAmount * loan.interestRate * days) / (100 * 30));
    }
  }
  return total;
}

// Approved cash shortages: a short till the cluster head signed off is a real loss.
export const approvedShortage = (s: any) => {
  if (!(s?.approvalRequired === false && s?.approvedBy)) return 0;
  const offset = s.salesDiscrepancy !== undefined ? s.salesDiscrepancy : (s.cashOffset || 0);
  return offset < 0 ? Math.abs(offset) : 0;
};

// Which P&L line an expense record lands on - also used to label rows in the exports.
export type PnlLine = 'food' | 'packaging' | 'marketing' | 'otherOpex' | 'occupancy' | 'staff' | 'spread' | 'financing' | 'none';
export function pnlLineFor(item: any, source: 'inventory' | 'overhead' | 'fixedcost'): PnlLine {
  const category = item?.category || '';
  if (source === 'overhead' && isCommissionEntry(item)) return 'none';
  const bucket = costBucketFor(category, source);
  const canonical = canonicalCategory(category);
  if (bucket === 'spread') return 'spread';
  if (bucket === 'financing') return 'financing';
  if (bucket === 'payroll_linked') return 'staff';
  if (bucket === 'food' && source === 'inventory') return canonical === 'packaging' ? 'packaging' : 'food';
  if (bucket === 'operating' && source !== 'fixedcost') return canonical === 'marketing' ? 'marketing' : 'otherOpex';
  if (bucket === 'fixed') return 'occupancy';
  return 'none';
}

// Building the settlement index is the slow part, and month-by-month reports ask for it many
// times over the same list.
const indexCache = new WeakMap<object, Map<string, OnlineCostIndex>>();
function onlineIndexFor(settlements: any[], storeId: string | null): OnlineCostIndex {
  const key = storeId || '';
  let byStore = indexCache.get(settlements);
  if (!byStore) {
    byStore = new Map();
    indexCache.set(settlements, byStore);
  }
  let index = byStore.get(key);
  if (!index) {
    index = buildOnlineCostIndex(settlements, storeId);
    byStore.set(key, index);
  }
  return index;
}

export function buildPnl(opts: {
  start: string;
  end: string;
  storeId: string | null;
  data: PnlData;
  scope?: PnlScope;
  today?: string;
}): PnlBreakdown {
  const { start, end, storeId, data } = opts;
  const scope = opts.scope || 'combined';
  const today = opts.today || getTodayIST();
  const stores = data.stores || [];
  const hasStoreSide = scope !== 'production';
  const sum = (items: any[], pick: (x: any) => number) => items.reduce((t, x) => t + pick(x), 0);
  const inScope = (x: any) => recordInScope(x, storeId, scope, stores);
  const storeOnly = (x: any) => !storeId || x?.storeId === storeId;

  const sales = hasStoreSide ? (data.sales || []).filter((x) => inRange(x?.date, start, end) && storeOnly(x)) : [];
  const storeOnlineSales = hasStoreSide ? (data.onlineSales || []).filter(storeOnly) : [];
  const storeOnlinePayouts = hasStoreSide ? (data.onlinePayouts || []).filter(storeOnly) : [];
  const windowOnline = storeOnlineSales.filter((x) => inRange(x?.date, start, end));
  const counterRevenue = sum(sales, (x) => (x.paytmAmount || 0) + (x.cashAmount || 0));
  const zomatoRevenue = sum(windowOnline, (x) => x.zomatoSales || 0);
  const swiggyRevenue = sum(windowOnline, (x) => x.swiggySales || 0);
  const onlineRevenue = sum(sales, (x) => x.onlineSales || 0) + zomatoRevenue + swiggyRevenue;
  const online = onlineCostsForRange(
    onlineIndexFor(hasStoreSide ? data.settlements || [] : [], storeId),
    storeOnlineSales, storeOnlinePayouts, start, end, today
  );

  const line = { food: 0, packaging: 0, marketing: 0, staff: 0, occupancy: 0, otherOpex: 0 };
  const addCost = (item: any, source: 'inventory' | 'overhead' | 'fixedcost', amount: number) => {
    const target = pnlLineFor(item, source);
    if (target === 'food' || target === 'packaging' || target === 'marketing' || target === 'otherOpex' || target === 'occupancy') line[target] += amount;
  };
  (data.inventory || []).filter((x) => inRange(x?.date, start, end) && inScope(x))
    .forEach((x) => addCost(x, 'inventory', x.totalCost || 0));
  const windowOverheads = (data.overheads || []).filter((x) => expenseCountsIn(x, start, end) && inScope(x));
  windowOverheads.filter((x) => x.category !== 'personal_expense').forEach((x) => addCost(x, 'overhead', x.amount || 0));
  // Rent and electricity by the month they are for (owner, 1 Nov 2026: October's rent paid in November).
  const windowFixed = (data.fixedCosts || []).filter((x) =>
    ((x?.category === 'rent' || x?.category === 'electricity') && x?.forMonth ? monthOverlaps(x.forMonth, start, end) : inRange(x?.date, start, end)) && inScope(x));
  windowFixed.forEach((x) => addCost(x, 'fixedcost', x.amount || 0));

  // Equipment, the scooter and yearly subscriptions are spread over their life; bulk packaging
  // stock over the days it's used. Not limited to the window: a scooter bought in October still
  // counts a little in every month of its life.
  const spreadRecords = [
    ...(data.inventory || []).map((x) => ({ x, amount: x?.totalCost || 0 })),
    ...(data.overheads || []).map((x) => ({ x, amount: x?.amount || 0 })),
    ...(data.fixedCosts || []).map((x) => ({ x, amount: x?.amount || 0 })),
  ]
    .filter(({ x }) => x?.date && isSpreadCategory(x.category || '') && inScope(x))
    .map(({ x, amount }) => ({ date: x.date, amount, category: x.category, id: x.id, name: x.itemName || x.description || '' }));
  const spread = buildSpreadCosts(spreadRecords, start, end > today ? today : end);
  const packagingStock = spread.byCategory.packaging_bulk || 0;
  const software = spread.byCategory.software_subscription || 0;
  line.packaging += packagingStock;
  line.otherOpex += software;
  const depreciation = spread.total - packagingStock - software;

  const employeeById = new Map<string, any>((data.employees || []).map((e: any) => [e.id, e]));
  const windowPayouts = (data.payouts || []).filter((x) => {
    const emp = employeeById.get(x?.employeeId);
    return !!emp && payoutCountsIn(x, start, end) && employeeInScope(emp, storeId, scope, stores);
  });
  line.staff = sum(windowPayouts, (x) => x.amount || 0)
    + sum(windowOverheads.filter((x) => x.category === 'personal_expense'), (x) => x.amount || 0);
  // The parts the normalized view spreads over the month instead (same rules as dailyCostSmoothing).
  const isContract = (id: string) => {
    const e = employeeById.get(id);
    return (e?.type || e?.employmentType) === 'contract';
  };
  const staffSmoothable = sum(windowPayouts.filter((x) => !isContract(x.employeeId)), (x) => x.amount || 0);
  const occupancySmoothable = sum(windowFixed.filter((x) => x.category === 'rent' || x.category === 'electricity'), (x) => x.amount || 0);

  const interest = hasStoreSide ? accruedInterest(data.loans || [], start, end > today ? today : end, storeId) : 0;
  const shortages = sum(sales, approvedShortage);

  const revenue = counterRevenue + onlineRevenue;
  const costs = line.food + line.packaging + online.commission + online.ads + line.marketing + line.staff +
    line.occupancy + line.otherOpex + depreciation + interest + shortages;
  return {
    revenue, counterRevenue, onlineRevenue, zomatoRevenue, swiggyRevenue,
    onlineDiscounts: online.discounts,
    food: line.food, packaging: line.packaging, commission: online.commission,
    platformAds: online.ads, marketing: line.marketing,
    staff: line.staff, occupancy: line.occupancy, otherOpex: line.otherOpex,
    depreciation, interest, shortages,
    netProfit: revenue - costs,
    estimatedCommission: online.estimatedCommission + online.estimatedAds,
    estimatedDays: online.estimatedDays,
    staffSmoothable,
    occupancySmoothable,
  };
}

// Total cost on the P&L (everything between revenue and net profit).
export const pnlCosts = (p: PnlBreakdown) => p.revenue - p.netProfit;

// Adds month P&Ls into one - every line is a plain sum.
export function sumPnl(parts: PnlBreakdown[]): PnlBreakdown {
  const total: PnlBreakdown = {
    revenue: 0, counterRevenue: 0, onlineRevenue: 0, zomatoRevenue: 0, swiggyRevenue: 0, onlineDiscounts: 0,
    food: 0, packaging: 0, commission: 0, platformAds: 0, marketing: 0, staff: 0, occupancy: 0, otherOpex: 0,
    depreciation: 0, interest: 0, shortages: 0, netProfit: 0, estimatedCommission: 0, estimatedDays: 0,
    staffSmoothable: 0, occupancySmoothable: 0,
  };
  for (const p of parts) {
    for (const key of Object.keys(total) as (keyof PnlBreakdown)[]) {
      (total[key] as number) = (total[key] as number || 0) + ((p[key] as number) || 0);
    }
  }
  return total;
}
