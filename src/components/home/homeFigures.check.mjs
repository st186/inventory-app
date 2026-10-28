// Number check for the Home tiles: runs each figure the Home screens show (homeFigures.ts) next
// to the calculation of the screen it used to live on, on made-up data, and fails on any
// difference.
//
//   node src/components/home/homeFigures.check.mjs
//
// The "old" side is not a copy: the script cuts the calculation out of the screens' own source
// at run time (Analytics.tsx "This month", SalesView.tsx's day total, InventoryManagement.tsx's
// day totals, PaytmWeeklyReconciliation.tsx's system balance), turns its React hooks into plain
// calls and runs it - so if those screens change, this check notices. Dev only, never bundled.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (p) => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8').replace(/\r\n/g, '\n');
const imp = (p) => JSON.stringify(path.join(ROOT, 'src', p).replace(/\\/g, '/'));

/** Text from the line containing `from` up to (not including) the line containing `to`. */
function cut(text, from, to, { inclusive = false } = {}) {
  const a = text.indexOf(from);
  if (a < 0) throw new Error(`marker not found: ${from}`);
  const start = text.lastIndexOf('\n', a) + 1;
  const b = text.indexOf(to, a + from.length);
  if (b < 0) throw new Error(`marker not found: ${to}`);
  const end = inclusive ? text.indexOf('\n', b) + 1 : text.lastIndexOf('\n', b) + 1;
  return text.slice(start, end);
}
const hooksToCalls = (code) => code.replace(/\buseMemo(<[^>]*>)?\(/g, '__memo(').replace(/\buseCallback\(/g, '__cb(');

const analytics = src('components/Analytics.tsx');
const salesView = src('components/SalesView.tsx');
const inventoryMgmt = src('components/InventoryManagement.tsx');
const weekly = src('components/PaytmWeeklyReconciliation.tsx');

const reference = `
import { getTodayIST, addDays, utcToIST } from ${imp('utils/timezone')};
import { costBucketFor, canonicalCategory, isSpreadCategory } from ${imp('utils/inventoryData')};
import { buildSpreadCosts } from ${imp('utils/spreadCosts')};
import { buildOnlineCostIndex, onlineCostsForRange } from ${imp('utils/onlineCosts')};
import { buildSmoothedCosts } from ${imp('utils/dailyCostSmoothing')};
import { buildPnl } from ${imp('utils/pnl')};
import { employeeBelongsToStore, getAssignedStoreIds, getDefaultStoreId } from ${imp('utils/entityAccess')};
import { monthAdd, monthLabel } from ${imp('utils/salaryBreakdown')};
import { getChannelRevenueFromCategorySales } from ${imp('utils/salesRevenue')};
import { knownPaytmBalance } from ${imp('utils/paytmRules')};
type TimeFilter = any; type PeriodWindow = { startDate: string; endDate: string }; type PnlBreakdown = any; type SalesData = any;
const __memo = (f: any, _deps?: any) => f();
const __cb = (f: any, _deps?: any) => f;
const logger = { debugStore() {}, debugAnalytics() {}, isDebugEnabled: () => false };

${cut(analytics, 'function periodWindow(', '// Shortens long item names')}

// Analytics.tsx, "This month", store mode.
export function analyticsThisMonth(input: any) {
  const { salesData, inventoryData, overheadData, fixedCostsData, payoutsData, employeesData, onlineLoans,
    onlineSalesData, onlinePayoutData, aggregatorSettlements, context, effectiveStoreId } = input;
  const effectiveProductionHouseIdForCosts = effectiveStoreId ? context.stores?.find((s: any) => s.id === effectiveStoreId)?.productionHouseId || null : null;
  const timeFilter = 'thisMonth';
  const dateRange = { from: '', to: '' };
  const activeView = 'overview';
${hooksToCalls(cut(analytics, ' const isCommissionEntry = (item: any) => {', ' };', { inclusive: true }))}
${hooksToCalls(cut(analytics, ' const periodRange = useMemo(() => periodWindow', ' // Load payouts and employees data'))}
${hooksToCalls(cut(analytics, ' const calculateAccruedInterest = ', ' // Calculate analytics metrics'))}
${hooksToCalls(cut(analytics, ' const calculateMetrics = () => {', " // ---- One calendar month's profit"))}
${hooksToCalls(cut(analytics, ' const accrualFor = useCallback(', ' // Unit Economics: the last 6 months'))}
${hooksToCalls(cut(analytics, ' const fixedCostAccrual = useMemo(', ' // The daily charts only use the spread'))}
${hooksToCalls(cut(analytics, ' // Calculate total approved cash discrepancies', ' // POS sales discrepancy'))}
  return { netNormalizedProfit, realizedProfit, netRealisedProfit, normalizedCardNote, carryForward };
}

${cut(salesView, 'const getSalesAmountTotal = ', 'export function SalesView')}
// SalesView.tsx: the day's total revenue and channel split.
export function salesViewDay(input: any) {
  const { context, selectedStoreId, selectedDate, isClusterHead } = input;
  const onlineSalesData: any[] = [];
  const assignedStoreIds = getAssignedStoreIds(context.user, context.stores || []);
${hooksToCalls(cut(salesView, '  const selectedConcreteStoreId = ', '  const effectiveStoreId = singleScopedStoreId'))}
${hooksToCalls(cut(salesView, ' const scopedSalesEntriesForDate = useMemo', '  // Live cash discrepancy'))}
  return { totalRevenue, offlineSalesTotal, displayedOnlineSplit };
}

// InventoryManagement.tsx: the day's totals (the combined "Total purchases" and the store tab).
export function expensesDay(input: any) {
  const { context, selectedStoreId, selectedDate, isProductionIncharge } = input;
  const activeTab = input.activeTab;
${hooksToCalls(cut(inventoryMgmt, ' const belongsToTab = ', ' const changeDate = '))}
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const targetProductionHouseId = isProductionIncharge ? (context.user?.storeId || undefined) : context.productionHouses?.[0]?.id;
${hooksToCalls(cut(inventoryMgmt, ' const matchesEffectiveScope = ', " console.log('🏪 InventoryManagement - effectiveStoreId:'"))}
${hooksToCalls(cut(inventoryMgmt, ' const filteredInventory = context.inventory.filter(', ' }, [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, targetProductionHouseId]);', { inclusive: true }))}
  return { combined: combinedTotals.store.total + combinedTotals.production.total, tab: totalInventoryCost + totalOverheadCost + totalFixedCost,
    combinedCount: ['store', 'production'].reduce((n, k) => n + combinedTotals[k].inventory.items.length + combinedTotals[k].overhead.items.length + combinedTotals[k].fixedCost.items.length, 0) };
}

// PaytmWeeklyReconciliation.tsx: the system's Paytm balance on a date.
export function weeklyPaytm(input: any) {
  const { context, selectedStoreId, selectedDate } = input;
${hooksToCalls(cut(weekly, '  const systemBalance = useMemo', '  const history = useMemo'))}
  return systemBalance;
}
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'home-figures-check-'));
fs.writeFileSync(path.join(tmp, 'reference.ts'), reference);
fs.writeFileSync(path.join(tmp, 'entry.ts'), `
export * from './reference';
export * from ${imp('components/home/homeFigures')};
export { buildHomeSample } from ${imp('gallery/homeSample')};
export { getTodayIST, addDays } from ${imp('utils/timezone')};
export { storeCashOnHand } from ${imp('utils/cashSource')};
`);
const out = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [path.join(tmp, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const m = await import(pathToFileURL(out).href);

// ---- Data sets: the preview sample, plus a second store, timestamps and month-tagged rows. ----
const today = m.getTodayIST();
function variants() {
  const a = m.buildHomeSample(today);
  const b = m.buildHomeSample(today);
  const month = today.slice(0, 7);
  b.stores.push({ id: 'STORE-2', name: 'Store B', productionHouseId: null });
  for (let i = 0; i < 20; i++) {
    const d = m.addDays(today, -i);
    b.salesData.push({ id: `S2-${d}`, date: d, storeId: 'STORE-2', offlineSales: 3000 + i * 10, cashAmount: 1200, paytmAmount: 1800 + i * 10, onlineSales: i % 4 === 0 ? 300 : 0, createdBy: 'x', approvalStatus: 'approved', approvalRequired: false, approvedBy: 'owner', actualCashInHand: 1100, cashOffset: -100, actualPaytmBalance: 5000 + i });
    b.onlineSalesData.push({ id: `O2-${d}`, date: d, storeId: 'STORE-2', zomatoSales: 900, swiggySales: 400 });
    b.inventory.push({ id: `I2-${d}`, date: d, storeId: 'STORE-2', entityType: 'store', category: 'vegetables', totalCost: 150 + i, paymentMethod: i % 2 ? 'cash' : 'both', cashAmount: 100 });
  }
  // A legacy sales row with no store, a timestamp-dated expense and month-tagged rows.
  b.salesData.push({ id: 'LEGACY', date: today, offlineSales: 700, cashAmount: 300, paytmAmount: 400, onlineSales: 0, createdBy: 'x', approvalStatus: 'approved' });
  b.overheads.push({ id: 'TS', date: `${today}T20:15:00.000Z`, storeId: 'STORE-1', entityType: 'store', category: 'transportation', amount: 90 });
  b.overheads.push({ id: 'PE', date: `${month}-03`, expenseMonth: m.addDays(`${month}-01`, -1).slice(0, 7), storeId: 'STORE-1', entityType: 'store', category: 'personal_expense', employeeId: 'DEMO-41', amount: 1000 });
  b.overheads.push({ id: 'PE2', date: `${month}-02`, storeId: 'STORE-1', entityType: 'store', category: 'personal_expense', employeeId: 'DEMO-41', amount: 400 });
  b.employees.push({ id: 'E-B', employeeId: 'DEMO-71', name: 'Store B Crew Demo', role: 'employee', storeId: 'STORE-2', employmentType: 'fulltime' });
  b.payouts.push({ id: 'PB', employeeId: 'E-B', date: `${month}-02`, amount: 8000 });
  b.loans.push({ id: 'L-2', storeId: 'STORE-2', loanAmount: 50000, loanDate: `${month}-02`, status: 'repaid', repaymentDate: m.addDays(today, -1) > `${month}-02` ? m.addDays(today, -1) : today, interestRate: 2 });
  // Last month ran at a loss (a big one-off purchase), so it is brought forward into this month.
  const c = m.buildHomeSample(today);
  const lastMonth = m.addDays(`${month}-01`, -1).slice(0, 7);
  c.inventory.push({ id: 'BIG', date: `${lastMonth}-15`, storeId: 'STORE-1', entityType: 'store', category: 'chicken', itemName: 'Chicken', totalCost: 400000, paymentMethod: 'online' });
  return [['sample', a], ['two stores + edge rows', b], ['loss last month', c]];
}

let failures = 0;
const results = [];
const same = (x, y) => Math.abs(x - y) < 0.005;
function compare(label, homeValue, oldValue) {
  const ok = same(homeValue, oldValue);
  if (!ok) failures += 1;
  results.push({ check: label, home: Math.round(homeValue * 100) / 100, old: Math.round(oldValue * 100) / 100, ok: ok ? 'same' : 'DIFFERENT' });
}

for (const [name, d] of variants()) {
  const owner = { email: 'owner@example.test', name: 'Owner Demo', role: 'cluster_head', employeeId: 'DEMO-01', storeId: null, designation: null, assignedStoreIds: [], assignedProductionHouseIds: [] };
  const context = {
    user: owner, stores: d.stores, productionHouses: d.productionHouses, managedStoreIds: [],
    salesData: d.salesData, onlineSalesData: d.onlineSalesData, categorySalesData: d.categorySalesData,
    inventory: d.inventory, overheads: d.overheads, fixedCosts: d.fixedCosts, onlineCashRecalibrations: [],
  };
  const employees = [...d.employees, ...d.archived];
  for (const storeId of [null, 'STORE-1']) {
    const scopeName = `${name} · ${storeId || 'all stores'}`;
    // Profit (Insights, This month)
    const old = m.analyticsThisMonth({
      salesData: d.salesData, inventoryData: d.inventory, overheadData: d.overheads, fixedCostsData: d.fixedCosts, payoutsData: d.payouts,
      employeesData: employees, onlineLoans: d.loans, onlineSalesData: d.onlineSalesData, onlinePayoutData: [], aggregatorSettlements: [],
      context, effectiveStoreId: storeId,
    });
    const home = m.ownerMonthProfit({
      today, storeId, salesData: d.salesData, inventory: d.inventory, overheads: d.overheads, fixedCosts: d.fixedCosts,
      onlineSalesData: d.onlineSalesData, onlinePayoutData: [], aggregatorSettlements: [], stores: d.stores,
      payouts: d.payouts, employees, loans: d.loans,
    });
    compare(`${scopeName} · net profit, costs spread (tile)`, home.normalized, old.netNormalizedProfit);
    compare(`${scopeName} · net profit, as paid`, home.realized, old.realizedProfit);
    compare(`${scopeName} · net realised profit`, home.netRealised, old.netRealisedProfit);
    compare(`${scopeName} · loss brought forward`, home.carryForward, old.carryForward.amount);

    // Sales today and yesterday (Money > Sales)
    for (const date of [today, m.addDays(today, -1)]) {
      const scope = m.salesScopeFor({ selectedStoreId: storeId, isClusterHead: true, managedStoreIds: [], assignedStoreIds: [] });
      const homeSales = m.salesForDay(d, date, scope, !!storeId);
      const oldSales = m.salesViewDay({ context, selectedStoreId: storeId, selectedDate: date, isClusterHead: true });
      const when = date === today ? 'today' : 'yesterday';
      compare(`${scopeName} · sales ${when}`, homeSales.total, oldSales.totalRevenue);
      compare(`${scopeName} · counter ${when}`, homeSales.counter, oldSales.offlineSalesTotal);
      compare(`${scopeName} · Zomato ${when}`, homeSales.zomato, oldSales.displayedOnlineSplit.zomato);
      compare(`${scopeName} · Swiggy ${when}`, homeSales.swiggy, oldSales.displayedOnlineSplit.swiggy);
    }

    // Spent today (Money > Expenses)
    const homeSpend = m.spentOnDay(d, today, storeId, d.productionHouses[0].id);
    const oldSpend = m.expensesDay({ context, selectedStoreId: storeId, selectedDate: today, isProductionIncharge: false, activeTab: 'store' });
    compare(`${scopeName} · spent today`, homeSpend.total, oldSpend.combined);
    compare(`${scopeName} · entries today`, homeSpend.count, oldSpend.combinedCount);
    compare(`${scopeName} · spent today, store tab`, homeSpend.store.total, oldSpend.tab);

    // Paytm balance (weekly check's system balance) and cash in hand (cashSource, per store)
    const ids = storeId ? [storeId] : d.stores.map((s) => s.id);
    const oldPaytm = ids.reduce((sum, id) => sum + m.weeklyPaytm({ context, selectedStoreId: id, selectedDate: today }), 0);
    compare(`${scopeName} · Paytm balance`, m.paytmKnownBalance(d.salesData, ids, today).balance, oldPaytm);
    const expenses = [...d.inventory, ...d.overheads, ...d.fixedCosts];
    const oldCash = ids.reduce((sum, id) => sum + m.storeCashOnHand({ storeId: id, date: today, salesData: d.salesData, expenses, topups: d.topups }).cash, 0);
    compare(`${scopeName} · cash in hand`, m.storeCashToday({ storeIds: ids, date: today, salesData: d.salesData, expenses, topups: d.topups }).cash, oldCash);
  }

  // Store incharge: Sales so far and Spent today for their own store (store tab).
  const incharge = { ...owner, role: 'employee', designation: 'store_incharge', storeId: 'STORE-1' };
  const ctxI = { ...context, user: incharge };
  const homeSales = m.salesForDay(d, today, ['STORE-1']);
  const oldSales = m.salesViewDay({ context: ctxI, selectedStoreId: null, selectedDate: today, isClusterHead: false });
  compare(`${name} · store incharge · sales so far`, homeSales.total, oldSales.totalRevenue);
  const oldSpend = m.expensesDay({ context: ctxI, selectedStoreId: null, selectedDate: today, isProductionIncharge: false, activeTab: 'store' });
  compare(`${name} · store incharge · spent today`, m.spentOnDay(d, today, 'STORE-1', null).store.total, oldSpend.tab);
}

console.table(results);
console.log(failures ? `${failures} figure(s) differ` : `All ${results.length} figures match (today ${today}).`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
