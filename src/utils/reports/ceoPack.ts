// Pack B: CEO / investor pack - month-by-month profit, unit economics, growth, a simple cash
// flow, store vs production costs, loans and assets. Every profit figure comes from buildPnl,
// so it matches the Analytics screen.

import type * as api from '../api';
import type { SheetSpec, CellValue } from './sheets';
import { sheetTable, printableDocument, cardsHtml, inr, pctText, round2 } from './sheets';
import { type ReportContext, scopeLabel, recordIn, employeeIn, hasStoreSide, employeeLookup, ownerPart } from './reportData';
import { pnlFor, pnlRowsFor, loansSheet, assetsSheet, isAssetRecord, loansAt } from './ledgers';
import { readmeSheet, storeVsProductionSheet, pnlTableHtml, PNL_DEFINITIONS, BUSINESS_NAME } from './packs';
import { monthsInRange, lastDayOf, shortMonthName, daysBetweenInclusive, prettyDate } from '../reportPeriods';
import { sumPnl, pnlCosts, pnlLineFor, isCommissionEntry } from '../pnl';
import { canonicalCategory } from '../inventoryData';
import { monthAdd } from '../salaryBreakdown';

export type OrderCounts = { counter: number; zomato: number; swiggy: number };

// Same counting rule as Analytics' orders chart: an order with no aggregator id is a counter order.
export function ordersByDate(records: api.OrderItemDetailRecord[]): Map<string, OrderCounts> {
  const byDate = new Map<string, OrderCounts>();
  for (const rec of records || []) {
    const day = byDate.get(rec.date) || { counter: 0, zomato: 0, swiggy: 0 };
    for (const order of rec.orders || []) {
      if (!order.externalId) day.counter += 1;
      else if (order.paymentMode === 'Swiggy') day.swiggy += 1;
      else day.zomato += 1;
    }
    byDate.set(rec.date, day);
  }
  return byDate;
}

export type MonthWindow = { month: string; start: string; end: string; label: string; whole: boolean };

// The months a period covers, each clipped to the period (and to today).
export function monthWindows(ctx: ReportContext): MonthWindow[] {
  return monthsInRange(ctx.period.start, ctx.period.dataEnd).map((month) => {
    const start = `${month}-01` > ctx.period.start ? `${month}-01` : ctx.period.start;
    const end = lastDayOf(month) < ctx.period.dataEnd ? lastDayOf(month) : ctx.period.dataEnd;
    const whole = start === `${month}-01` && end === lastDayOf(month);
    const label = whole ? shortMonthName(month) : `${shortMonthName(month)} (${Number(start.slice(8))}-${Number(end.slice(8))})`;
    return { month, start, end, label, whole };
  });
}

const sumOrders = (orders: Map<string, OrderCounts> | null, start: string, end: string): OrderCounts | null => {
  if (!orders) return null;
  const t = { counter: 0, zomato: 0, swiggy: 0 };
  orders.forEach((o, d) => {
    if (d < start || d > end) return;
    t.counter += o.counter;
    t.zomato += o.zomato;
    t.swiggy += o.swiggy;
  });
  return t.counter + t.zomato + t.swiggy > 0 ? t : null;
};
const totalOrders = (o: OrderCounts | null) => (o ? o.counter + o.zomato + o.swiggy : 0);
const ratio = (a: number, b: number) => (Math.abs(b) > 0.005 ? a / b : null);

// Money in and out by what actually moved on the day (salaries on the day paid, not the month
// they cover; equipment on the day bought, not spread).
const CASH_FLOW_LINES = [
  { key: 'counterCash', label: 'Counter sales received in cash', receipt: true },
  { key: 'counterDigital', label: 'Counter sales received by Paytm/UPI', receipt: true },
  { key: 'platform', label: 'Zomato/Swiggy payouts received', receipt: true },
  { key: 'loansIn', label: 'Owner/investor loans received', receipt: true },
  { key: 'ownerPaid', label: "Bills paid with the owner's own money", receipt: true },
  { key: 'purchases', label: 'Purchases (food, packaging, supplies)', receipt: false },
  { key: 'running', label: 'Running expenses', receipt: false },
  { key: 'salaries', label: 'Salaries paid', receipt: false },
  { key: 'rent', label: 'Rent', receipt: false },
  { key: 'utilities', label: 'Electricity, internet, subscriptions', receipt: false },
  { key: 'assets', label: 'Equipment and assets bought', receipt: false },
  { key: 'emi', label: 'Scooter loan EMIs', receipt: false },
  { key: 'loansOut', label: 'Loans repaid', receipt: false },
] as const;
type CashFlow = Record<(typeof CASH_FLOW_LINES)[number]['key'], number>;

export function cashFlowFor(ctx: ReportContext, start: string, end: string): CashFlow {
  const within = (d?: string | null) => !!d && d >= start && d <= end;
  const storeSide = hasStoreSide(ctx);
  const storeMatch = (x: any) => !ctx.storeId || x?.storeId === ctx.storeId;
  const sum = (items: any[], f: (x: any) => number) => items.reduce((t, x) => t + (f(x) || 0), 0);
  const sales = storeSide ? ctx.data.sales.filter((s: any) => within(s.date) && storeMatch(s)) : [];
  const inventory = ctx.data.inventory.filter((x: any) => within(x.date) && recordIn(ctx, x));
  const overheads = ctx.data.overheads.filter((x: any) => within(x.date) && recordIn(ctx, x));
  const fixed = ctx.data.fixedCosts.filter((x: any) => within(x.date) && recordIn(ctx, x));
  const all = [...inventory, ...overheads, ...fixed];
  const people = employeeLookup(ctx);
  const isEmi = (x: any) => canonicalCategory(x.category || '') === 'vehicle_emi';
  return {
    counterCash: sum(sales, (s) => s.cashAmount),
    counterDigital: sum(sales, (s) => s.paytmAmount),
    platform: storeSide
      ? sum(ctx.data.settlements.filter((s: any) => within(s.settlementDate) && storeMatch(s)), (s) => s.netPayout)
        + sum(ctx.data.onlinePayouts.filter((p: any) => within(p.date) && storeMatch(p)), (p) => (p.zomatoPayout || 0) + (p.swiggyPayout || 0))
      : 0,
    loansIn: storeSide ? sum(ctx.data.loans.filter((l: any) => (l.status === 'active' || l.status === 'repaid') && within(l.loanDate?.slice(0, 10)) && storeMatch(l)), (l) => l.loanAmount) : 0,
    ownerPaid: sum(all, ownerPart),
    purchases: sum(inventory.filter((x: any) => !isAssetRecord(x) && !isEmi(x)), (x) => x.totalCost),
    running: sum(overheads.filter((x: any) => x.category !== 'personal_expense' && !isCommissionEntry(x) && !isAssetRecord(x) && !isEmi(x) && pnlLineFor(x, 'overhead') !== 'none'), (x) => x.amount),
    salaries: sum(ctx.data.payouts.filter((p: any) => within(p.date) && (!people.get(p.employeeId) || employeeIn(ctx, people.get(p.employeeId)))), (p) => p.amount)
      + sum(overheads.filter((x: any) => x.category === 'personal_expense'), (x) => x.amount),
    rent: sum(fixed.filter((x: any) => x.category === 'rent'), (x) => x.amount),
    utilities: sum(fixed.filter((x: any) => x.category !== 'rent' && !isAssetRecord(x) && !isEmi(x)), (x) => x.amount),
    assets: sum(all.filter(isAssetRecord), (x) => x.totalCost ?? x.amount),
    emi: sum(all.filter(isEmi), (x) => x.totalCost ?? x.amount),
    loansOut: storeSide ? sum(ctx.data.loans.filter((l: any) => l.status === 'repaid' && within(l.repaymentDate?.slice(0, 10)) && storeMatch(l)), (l) => l.repaidAmount) : 0,
  };
}

const netCash = (c: CashFlow) => CASH_FLOW_LINES.reduce((t, l) => t + (l.receipt ? 1 : -1) * c[l.key], 0);

export function buildCeoPack(ctx: ReportContext, orders: Map<string, OrderCounts> | null) {
  const windows = monthWindows(ctx);
  const monthly = windows.map((w) => pnlFor(ctx, w.start, w.end));
  const total = sumPnl(monthly);
  const days = daysBetweenInclusive(ctx.period.start, ctx.period.dataEnd);
  const periodOrders = sumOrders(orders, ctx.period.start, ctx.period.dataEnd);
  const pnlRows = pnlRowsFor([...monthly, total]);
  const headers = windows.map((w) => w.label);

  const pnlSheet: SheetSpec = {
    name: 'P&L by month',
    title: `Profit and loss by month - ${ctx.period.label}`,
    notes: [
      ...(ctx.period.partial ? [`The last month is only up to ${prettyDate(ctx.period.dataEnd)}.`] : []),
      ...(total.estimatedDays > 0 ? [`Zomato/Swiggy commission for ${total.estimatedDays} day(s) is estimated until their settlement is uploaded.`] : []),
    ],
    columns: [{ header: 'Line', width: 44 }, ...headers.map((h) => ({ header: h, format: 'inr' as const })), { header: 'Total', format: 'inr' }, { header: '% of sales', format: 'pct' }],
    rows: pnlRows.map((r) => [r.label, ...monthly.map((p) => round2(r.value(p))), round2(r.value(total)), ratio(r.value(total), total.revenue)]),
  };
  const pctSheet: SheetSpec = {
    name: 'P&L % of sales',
    title: 'Each line as a share of that month\'s sales',
    columns: [{ header: 'Line', width: 44 }, ...headers.map((h) => ({ header: h, format: 'pct' as const })), { header: 'Total', format: 'pct' }],
    rows: pnlRows.map((r) => [r.label, ...monthly.map((p) => ratio(r.value(p), p.revenue)), ratio(r.value(total), total.revenue)]),
  };

  const cm3 = total.revenue - total.food - total.packaging - total.commission - total.platformAds - total.marketing;
  const overheadsPerDay = (total.staff + total.occupancy + total.otherOpex + total.depreciation + total.interest) / Math.max(1, days);
  const cmRatio = ratio(cm3, total.revenue);
  const n = totalOrders(periodOrders);
  const unit: [string, number | null, string, string][] = [
    ['Total sales', total.revenue, '₹', ''],
    ['Average daily sales', total.revenue / Math.max(1, days), '₹ a day', `${days} days`],
    ['Orders - counter', periodOrders ? periodOrders.counter : null, 'orders', periodOrders ? 'From the billing system' : 'Order counts not available for this period'],
    ['Orders - Zomato', periodOrders ? periodOrders.zomato : null, 'orders', ''],
    ['Orders - Swiggy', periodOrders ? periodOrders.swiggy : null, 'orders', ''],
    ['Average order value - all', n ? total.revenue / n : null, '₹', 'Sales / orders'],
    ['Average order value - counter', periodOrders?.counter ? total.counterRevenue / periodOrders.counter : null, '₹', ''],
    ['Average order value - Zomato', periodOrders?.zomato ? total.zomatoRevenue / periodOrders.zomato : null, '₹', ''],
    ['Average order value - Swiggy', periodOrders?.swiggy ? total.swiggyRevenue / periodOrders.swiggy : null, '₹', ''],
    ['Food cost', pctOf(total.food, total.revenue), '% of sales', 'Ingredients'],
    ['Packaging', pctOf(total.packaging, total.revenue), '% of sales', ''],
    ['Gross margin', pctOf(total.revenue - total.food - total.packaging, total.revenue), '% of sales', 'Left after food and packaging'],
    ['Platform cut on online sales', pctOf(total.commission + total.platformAds, total.onlineRevenue), '% of online sales', 'Commission (without GST) + ads'],
    ['Contribution margin', pctOf(cm3, total.revenue), '% of sales', 'Left after food, packaging, platform and marketing'],
    ['Staff', pctOf(total.staff, total.revenue), '% of sales', ''],
    ['Rent, electricity, internet', pctOf(total.occupancy, total.revenue), '% of sales', ''],
    ['Prime cost', pctOf(total.food + total.packaging + total.staff, total.revenue), '% of sales', 'Food + packaging + staff'],
    ['EBITDA margin', pctOf(total.revenue - total.food - total.packaging - total.commission - total.platformAds - total.marketing - total.staff - total.occupancy - total.otherOpex, total.revenue), '% of sales', 'Before equipment spread and interest'],
    ['Net margin', pctOf(total.netProfit, total.revenue), '% of sales', ''],
    ['Cost per order', n ? pnlCosts(total) / n : null, '₹', ''],
    ['Profit per order', n ? total.netProfit / n : null, '₹', ''],
    ['Break-even daily sales', cmRatio && cmRatio > 0 ? overheadsPerDay / cmRatio : null, '₹ a day', 'Daily staff, rent, running costs, equipment and interest / contribution margin'],
  ];
  const unitSheet: SheetSpec = {
    name: 'Unit economics',
    title: `Unit economics - ${ctx.period.label}`,
    columns: [{ header: 'Measure', width: 34 }, { header: 'Value', format: 'qty' }, { header: 'Unit', width: 18 }, { header: 'Notes', width: 60 }],
    rows: unit.map(([a, b, c, d]) => [a, b === null ? null : round2(b), c, d]),
  };

  let prevRevenue = windows.length ? pnlFor(ctx, `${monthAdd(windows[0].month, -1)}-01`, lastDayOf(monthAdd(windows[0].month, -1))).revenue : 0;
  const growthRows: CellValue[][] = windows.map((w, i) => {
    const p = monthly[i];
    const o = sumOrders(orders, w.start, w.end);
    const openDays = new Set([
      ...ctx.data.sales.filter((s: any) => s.date >= w.start && s.date <= w.end && (!ctx.storeId || s.storeId === ctx.storeId) && ((s.cashAmount || 0) + (s.paytmAmount || 0) > 0)).map((s: any) => s.date),
      ...ctx.data.onlineSales.filter((s: any) => s.date >= w.start && s.date <= w.end && (!ctx.storeId || s.storeId === ctx.storeId) && ((s.zomatoSales || 0) + (s.swiggySales || 0) > 0)).map((s: any) => s.date),
    ]).size;
    const row: CellValue[] = [
      w.label, p.revenue, w.whole && (i === 0 || windows[i - 1].whole) ? ratio(p.revenue - prevRevenue, prevRevenue) : null,
      o ? totalOrders(o) : null, o ? ratio(p.revenue, totalOrders(o)) : null, p.counterRevenue, p.onlineRevenue, ratio(p.onlineRevenue, p.revenue),
      p.zomatoRevenue, p.swiggyRevenue, openDays, openDays ? p.revenue / openDays : null, p.netProfit, ratio(p.netProfit, p.revenue),
    ];
    prevRevenue = p.revenue;
    return row;
  });
  const growthSheet: SheetSpec = {
    name: 'Growth',
    title: `Growth by month - ${ctx.period.label}`,
    notes: ['Change vs month before is left blank for a part month.', ...(orders ? [] : ['Order counts were not available, so orders and average order value are blank.'])],
    columns: [
      { header: 'Month' }, { header: 'Sales', format: 'inr' }, { header: 'Change vs month before', format: 'pct' }, { header: 'Orders', format: 'int' },
      { header: 'Average order value', format: 'inr' }, { header: 'Counter sales', format: 'inr' }, { header: 'Online sales', format: 'inr' },
      { header: 'Online share', format: 'pct' }, { header: 'Zomato', format: 'inr' }, { header: 'Swiggy', format: 'inr' }, { header: 'Days with sales', format: 'int' },
      { header: 'Average sales per day open', format: 'inr' }, { header: 'Net profit', format: 'inr' }, { header: 'Net margin', format: 'pct' },
    ],
    rows: growthRows,
  };

  const flows = windows.map((w) => cashFlowFor(ctx, w.start, w.end));
  const flowTotal = cashFlowFor(ctx, ctx.period.start, ctx.period.dataEnd);
  const cashSheet: SheetSpec = {
    name: 'Cash flow',
    title: `Cash in and out by month - ${ctx.period.label}`,
    notes: [
      'Money that actually moved, on the day it moved: salaries on the day paid, equipment on the day bought, Zomato/Swiggy on the day they paid out.',
      'Zomato/Swiggy payouts arrive already net of commission and ads, so commission is not a separate payment here (it is a cost in the P&L, against the full online sales).',
      "Bills paid with the owner's own money appear both as money in (from the owner) and as the payment itself.",
      'Partial loan repayments are not dated in the app; only loans repaid in full show under "Loans repaid".',
    ],
    columns: [{ header: 'Line', width: 40 }, ...headers.map((h) => ({ header: h, format: 'inr' as const })), { header: 'Total', format: 'inr' }],
    rows: [
      ...CASH_FLOW_LINES.map((l) => [`${l.receipt ? 'In: ' : 'Out: '}${l.label}`, ...flows.map((f) => f[l.key]), flowTotal[l.key]] as CellValue[]),
      ['Total in', ...flows.map((f) => CASH_FLOW_LINES.filter((l) => l.receipt).reduce((t, l) => t + f[l.key], 0)), CASH_FLOW_LINES.filter((l) => l.receipt).reduce((t, l) => t + flowTotal[l.key], 0)],
      ['Total out', ...flows.map((f) => CASH_FLOW_LINES.filter((l) => !l.receipt).reduce((t, l) => t + f[l.key], 0)), CASH_FLOW_LINES.filter((l) => !l.receipt).reduce((t, l) => t + flowTotal[l.key], 0)],
      ['Net cash in (out)', ...flows.map(netCash), netCash(flowTotal)],
    ],
  };

  const storeP = sumPnl(windows.map((w) => pnlFor(ctx, w.start, w.end, 'store')));
  const prodP = sumPnl(windows.map((w) => pnlFor(ctx, w.start, w.end, 'production')));
  const split = storeVsProductionSheet(ctx, storeP, prodP);
  const splitMonthly: SheetSpec = {
    name: 'Store vs production by month',
    title: 'Costs of each side by month',
    columns: [{ header: 'Month' }, { header: 'Store costs', format: 'inr' }, { header: 'Production costs', format: 'inr' }, { header: 'Production share', format: 'pct' }],
    rows: windows.map((w) => {
      const s = pnlCosts(pnlFor(ctx, w.start, w.end, 'store'));
      const h = pnlCosts(pnlFor(ctx, w.start, w.end, 'production'));
      return [w.label, s, h, ratio(h, s + h)];
    }),
    totalRow: true,
  };
  const loans = loansSheet(ctx);
  const assets = assetsSheet(ctx);
  const outstanding = hasStoreSide(ctx) ? loansAt(ctx, ctx.period.dataEnd).reduce((t, l) => t + l.outstanding, 0) : 0;

  const sheets: SheetSpec[] = [
    readmeSheet(ctx, 'CEO / investor pack', [
      ['P&L by month', 'Profit and loss for each month, with the period total and % of sales'],
      ['P&L % of sales', 'Each P&L line as a share of that month\'s sales'],
      ['Unit economics', 'Margins, prime cost, order value, cost and profit per order, break-even daily sales'],
      ['Growth', 'Sales, orders, average order value and channel mix by month'],
      ['Cash flow', 'Money in by mode and money out by type, by month'],
      ['Store vs production', 'Each side\'s costs for the period'],
      ['Store vs production by month', 'Each side\'s total costs by month'],
      ['Loans', 'Owner/investor loans outstanding at the end of the period'],
      ['Assets', 'Equipment and other assets, and how much of each is still to be charged to profit'],
    ], PNL_DEFINITIONS),
    pnlSheet, pctSheet, unitSheet, growthSheet, cashSheet, split, splitMonthly, loans, assets,
  ];

  const pnlHtmlRows = pnlRows.map((r) => ({
    label: r.label,
    strong: r.strong,
    cells: [...monthly.map((p) => inr(r.value(p))), inr(r.value(total)), total.revenue > 0 ? pctText(r.value(total) / total.revenue) : ''],
  }));
  const html = printableDocument({
    title: `${BUSINESS_NAME} - CEO / investor pack`,
    subtitle: `${ctx.period.label}${ctx.period.partial ? ` (up to ${prettyDate(ctx.period.dataEnd)})` : ''}`,
    meta: [scopeLabel(ctx), `Generated ${ctx.generatedAt} by ${ctx.generatedBy}`],
    landscape: true,
    sections: [
      {
        heading: 'At a glance',
        html: cardsHtml([
          { label: 'Sales', value: inr(total.revenue), sub: `${inr(total.revenue / Math.max(1, days))} a day` },
          { label: 'Net profit', value: inr(total.netProfit), sub: total.revenue > 0 ? `${pctText(total.netProfit / total.revenue)} of sales` : '' },
          { label: 'Gross margin', value: total.revenue > 0 ? pctText((total.revenue - total.food - total.packaging) / total.revenue) : '-', sub: 'After food and packaging' },
          { label: 'Orders', value: n ? n.toLocaleString('en-IN') : '-', sub: n ? `Average ${inr(total.revenue / n)}` : 'Not available' },
          { label: 'Online share', value: total.revenue > 0 ? pctText(total.onlineRevenue / total.revenue) : '-', sub: 'Zomato + Swiggy' },
          { label: 'Loans outstanding', value: inr(outstanding), sub: `At ${prettyDate(ctx.period.dataEnd)}` },
        ]),
      },
      { heading: 'Profit and loss by month', intro: pnlSheet.notes?.join(' '), html: pnlTableHtml(pnlHtmlRows, ['Line', ...headers, 'Total', '% of sales']) },
      { heading: 'Unit economics', html: sheetTable(unitSheet) },
      { heading: 'Growth', intro: growthSheet.notes?.join(' '), html: sheetTable(growthSheet), pageBreakBefore: true },
      { heading: 'Cash flow', intro: cashSheet.notes?.join(' '), html: sheetTable(cashSheet) },
      { heading: 'Store vs production house', intro: split.notes?.join(' '), html: sheetTable(split), pageBreakBefore: true },
      { heading: 'Loans outstanding', intro: loans.notes?.join(' '), html: sheetTable({ ...loans, columns: loans.columns.slice(0, 9), rows: loans.rows.map((r) => r.slice(0, 9)) }) },
      { heading: 'Assets', intro: assets.notes?.join(' '), html: sheetTable({ ...assets, columns: assets.columns.slice(0, 9), rows: assets.rows.map((r) => r.slice(0, 9)) }, { maxRows: 60 }) },
    ],
    footnotes: PNL_DEFINITIONS,
  });
  return { sheets, html };
}

// A share as a plain percentage number (12.3), for the mixed-unit Unit economics table.
function pctOf(part: number, whole: number): number | null {
  return Math.abs(whole) > 0.005 ? Math.round((part / whole) * 1000) / 10 : null;
}
