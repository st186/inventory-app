// The ledgers every export is assembled from - one builder per table, so the quick export,
// the auditor workbook and the CEO/tax packs never disagree about a row.

import type { SheetSpec, CellValue } from './sheets';
import { round2 } from './sheets';
import {
  type ReportContext, inPeriod, recordIn, employeeIn, hasStoreSide, storesInView, storeName, houseName,
  entityLabel, employeeLookup, cashPart, onlinePart, ownerPart, paidFromLabel, enteredBy,
} from './reportData';
import {
  buildPnl, payoutCountsIn, expenseCountsIn, pnlLineFor, accruedInterest, isCommissionEntry,
  type PnlBreakdown, type PnlLine,
} from '../pnl';
import { datesInRange, prettyDate } from '../reportPeriods';
import { hasRealCashCount, isPlaceholderSale, salesDayStatus } from '../cashCount';
import { buildPriceGuide, checkPurchase } from '../expenseChecks';
import { expenseCategoryLabel, SPREAD_MONTHS, canonicalCategory } from '../inventoryData';
import { storeCashPortion, PRODUCTION_CASH_GO_LIVE_DATE } from '../cashSource';
import { computePaytmLedger } from '../paytmBalance';
import { buildOnlineCostIndex } from '../onlineCosts';
import { getSettlementPeriod } from '../settlementPeriod';
import { settlementDueBy } from '../payoutSchedule';
import { monthAdd } from '../salaryBreakdown';

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const byDate = (a: any, b: any) => String(a.date || '').localeCompare(String(b.date || ''));

// ---------- P&L ----------

export const pnlFor = (ctx: ReportContext, start: string, end: string, scope = ctx.scope): PnlBreakdown =>
  buildPnl({ start, end, storeId: ctx.storeId, data: ctx.data, scope, today: ctx.today });

// P&L lines in display order. Costs are positive numbers; the subtotal rows are what's left.
export type PnlRowDef = { label: string; value: (p: PnlBreakdown) => number; strong?: boolean; isCost?: boolean };
export const PNL_ROWS: PnlRowDef[] = [
  { label: 'Counter sales (cash + Paytm/UPI)', value: (p) => p.counterRevenue },
  { label: 'Zomato sales', value: (p) => p.zomatoRevenue },
  { label: 'Swiggy sales', value: (p) => p.swiggyRevenue },
  { label: 'Other online sales', value: (p) => p.onlineRevenue - p.zomatoRevenue - p.swiggyRevenue },
  { label: 'Total sales', value: (p) => p.revenue, strong: true },
  { label: 'Food (ingredients)', value: (p) => p.food, isCost: true },
  { label: 'Packaging', value: (p) => p.packaging, isCost: true },
  { label: 'Gross margin', value: (p) => p.revenue - p.food - p.packaging, strong: true },
  { label: 'Zomato/Swiggy commission (without GST)', value: (p) => p.commission, isCost: true },
  { label: 'Zomato/Swiggy ads', value: (p) => p.platformAds, isCost: true },
  { label: 'Marketing', value: (p) => p.marketing, isCost: true },
  { label: 'Contribution after selling costs', value: (p) => p.revenue - p.food - p.packaging - p.commission - p.platformAds - p.marketing, strong: true },
  { label: 'Staff salaries', value: (p) => p.staff, isCost: true },
  { label: 'Rent, electricity, internet', value: (p) => p.occupancy, isCost: true },
  { label: 'Other running costs', value: (p) => p.otherOpex, isCost: true },
  { label: 'EBITDA (before equipment, interest)', value: (p) => p.revenue - p.food - p.packaging - p.commission - p.platformAds - p.marketing - p.staff - p.occupancy - p.otherOpex, strong: true },
  { label: 'Equipment and scooter (spread over 3 years)', value: (p) => p.depreciation, isCost: true },
  { label: 'Loan interest', value: (p) => p.interest, isCost: true },
  { label: 'Approved cash shortages', value: (p) => p.shortages, isCost: true },
  { label: 'Net profit', value: (p) => p.netProfit, strong: true },
];

// Rows that are zero in every column are left out (no "Other online sales: 0" lines).
export const pnlRowsFor = (pnls: PnlBreakdown[]) =>
  PNL_ROWS.filter((r) => r.strong || pnls.some((p) => Math.abs(r.value(p)) > 0.005));

export function pnlSummarySheet(ctx: ReportContext, current: PnlBreakdown, previous: PnlBreakdown | null, previousLabel: string): SheetSpec {
  const rows: CellValue[][] = pnlRowsFor(previous ? [current, previous] : [current]).map((r) => {
    const now = r.value(current);
    const before = previous ? r.value(previous) : null;
    return [
      r.label,
      round2(now),
      current.revenue > 0 ? now / current.revenue : null,
      before === null ? null : round2(before),
      before === null || Math.abs(before) < 0.005 ? null : (now - before) / Math.abs(before),
    ];
  });
  const notes = [
    `${ctx.period.label}${ctx.period.partial ? ` - so far, up to ${prettyDate(ctx.period.dataEnd)}` : ''}. Compared with ${previousLabel}.`,
  ];
  if (current.estimatedDays > 0) notes.push(`Zomato/Swiggy commission for ${current.estimatedDays} day(s) is estimated - their settlement isn't uploaded yet (₹${Math.round(current.estimatedCommission).toLocaleString('en-IN')}).`);
  return {
    name: 'Profit and loss',
    title: `Profit and loss - ${ctx.period.label}`,
    notes,
    columns: [
      { header: 'Line', width: 44 },
      { header: 'Amount (₹)', format: 'inr' },
      { header: '% of sales', format: 'pct' },
      { header: 'Previous period (₹)', format: 'inr' },
      { header: 'Change', format: 'pct' },
    ],
    rows,
  };
}

export const PNL_LINE_LABEL: Record<PnlLine, string> = {
  food: 'Food',
  packaging: 'Packaging',
  marketing: 'Marketing',
  otherOpex: 'Other running costs',
  occupancy: 'Rent, electricity, internet',
  staff: 'Staff (salary-linked)',
  spread: 'Spread over its life (equipment, subscription or bulk stock)',
  financing: 'Loan EMI - cash only, not a cost',
  none: 'Not counted',
};

// ---------- Sales ----------

export function salesDayBook(ctx: ReportContext): SheetSpec {
  const columns = [
    { header: 'Date', format: 'date' as const },
    { header: 'Store' },
    { header: 'POS offline sales', format: 'inr' as const },
    { header: 'POS online sales', format: 'inr' as const },
    { header: 'Zomato', format: 'inr' as const },
    { header: 'Swiggy', format: 'inr' as const },
    { header: 'Counter cash', format: 'inr' as const },
    { header: 'Counter Paytm/UPI', format: 'inr' as const },
    { header: 'Till short (+) / over (-) vs POS', format: 'inr' as const },
    { header: 'Short/over reason' },
    { header: 'Short/over note' },
    { header: 'Cash counted by a person' },
    { header: 'Counted cash in hand', format: 'inr' as const },
    { header: 'Cash difference vs expected', format: 'inr' as const },
    { header: 'Status' },
    { header: 'Entered by' },
    { header: 'Approved by' },
    { header: 'Approved at' },
    { header: 'Record id' },
  ];
  const sheet: SheetSpec = { name: 'Sales day book', title: `Sales day book - ${ctx.period.label}`, columns, rows: [], totalRow: true };
  if (!hasStoreSide(ctx)) {
    sheet.notes = ['Sales belong to the store - choose Store or Combined to see them.'];
    return sheet;
  }
  const online = new Map<string, { z: number; s: number }>();
  ctx.data.onlineSales.forEach((o: any) => {
    const k = `${o.storeId}|${o.date}`;
    const v = online.get(k) || { z: 0, s: 0 };
    v.z += o.zomatoSales || 0;
    v.s += o.swiggySales || 0;
    online.set(k, v);
  });
  const stores = storesInView(ctx);
  const sales = ctx.data.sales.filter((s: any) => inPeriod(ctx, s.date) && (!ctx.storeId || s.storeId === ctx.storeId));
  const rowFor = (date: string, storeId: string | undefined, s: any | null): CellValue[] => {
    const o = online.get(`${storeId}|${date}`);
    const real = hasRealCashCount(s);
    return [
      date, storeName(ctx, storeId) || 'unassigned',
      s ? s.posOfflineSales ?? s.offlineSales ?? 0 : null,
      s ? s.posOnlineSales ?? 0 : null,
      o?.z ?? null, o?.s ?? null,
      s ? s.cashAmount || 0 : null,
      s ? s.paytmAmount || 0 : null,
      s && Math.abs(s.cashOverShortAmount || 0) > 0.005 ? s.cashOverShortAmount : null,
      s?.cashOverShortReason || '', s?.cashOverShortNote || '',
      s ? yesNo(real) : 'No',
      real ? s.actualCashInHand : null,
      real ? (s.salesDiscrepancy !== undefined ? s.salesDiscrepancy : s.cashOffset || 0) : null,
      salesDayStatus(s),
      s ? (isPlaceholderSale(s) ? 'POS auto-sync' : enteredBy(s)) : '',
      s?.approvedBy || '', s?.approvedAt || '', s?.id || '',
    ];
  };
  const rows: CellValue[][] = [];
  const used = new Set<any>();
  for (const date of datesInRange(ctx.period.start, ctx.period.dataEnd)) {
    for (const store of stores) {
      const day = sales.filter((s: any) => s.storeId === store.id && s.date === date);
      if (day.length === 0) rows.push(rowFor(date, store.id, null));
      day.forEach((s: any) => { used.add(s); rows.push(rowFor(date, store.id, s)); });
    }
  }
  // Records saved without a store (old entries) still belong in the book.
  sales.filter((s: any) => !used.has(s)).sort(byDate).forEach((s: any) => rows.push(rowFor(s.date, s.storeId, s)));
  sheet.rows = rows;
  sheet.notes = ['One row per store per day; "No record" means nothing was saved that day. Counter cash/Paytm are what the store counted (the profit uses these); POS figures are what the billing system recorded.'];
  return sheet;
}

// ---------- Purchases and expenses ----------

export function purchaseRows(ctx: ReportContext) {
  return ctx.data.inventory.filter((x: any) => inPeriod(ctx, x.date) && recordIn(ctx, x)).sort(byDate);
}

export function purchasesRegister(ctx: ReportContext): SheetSpec {
  const guide = buildPriceGuide(ctx.data.inventory as any[]);
  const rows = purchaseRows(ctx).map((x: any) => {
    const flag = checkPurchase(x, guide);
    const qty = Number(x.quantity) || 0;
    return [
      x.date, entityLabel(ctx, x), expenseCategoryLabel(x.category || ''), x.itemName || '',
      qty, x.unit || '', x.costPerUnit ?? (qty > 0 ? (x.totalCost || 0) / qty : null), x.totalCost || 0,
      paidFromLabel(ctx, x), cashPart(x), onlinePart(x), ownerPart(x),
      flag ? `${flag.severity === 'high' ? 'Very unusual' : 'Check'}: ${flag.message}` : '',
      x.vendor || '', x.invoiceRef || '', enteredBy(x), x.id || '',
    ] as CellValue[];
  });
  return {
    name: 'Purchases register',
    title: `Purchases register - ${ctx.period.label}`,
    notes: ['Every purchase logged as inventory. Price check compares the price per kg/litre/piece with what the same item usually costs; a flag usually means a unit slip (g saved as kg), not a wrong amount.'],
    columns: [
      { header: 'Date', format: 'date' }, { header: 'Where' }, { header: 'Category' }, { header: 'Item' },
      { header: 'Qty', format: 'qty' }, { header: 'Unit' }, { header: 'Unit cost', format: 'inr' }, { header: 'Total', format: 'inr' },
      { header: 'Paid from' }, { header: 'Cash', format: 'inr' }, { header: 'Online', format: 'inr' }, { header: "Owner's money", format: 'inr' },
      { header: 'Price check' }, { header: 'Vendor' }, { header: 'Invoice ref' }, { header: 'Entered by' }, { header: 'Record id' },
    ],
    rows,
    totalRow: true,
  };
}

export function expenseRows(ctx: ReportContext) {
  const overheads = ctx.data.overheads
    .filter((x: any) => recordIn(ctx, x) && (inPeriod(ctx, x.date) || expenseCountsIn(x, ctx.period.start, ctx.period.end)))
    .map((x: any) => ({ x, source: 'overhead' as const }));
  const fixed = ctx.data.fixedCosts
    .filter((x: any) => recordIn(ctx, x) && inPeriod(ctx, x.date))
    .map((x: any) => ({ x, source: 'fixedcost' as const }));
  return [...overheads, ...fixed].sort((a, b) => byDate(a.x, b.x));
}

export function expensesRegister(ctx: ReportContext): SheetSpec {
  const people = employeeLookup(ctx);
  const rows = expenseRows(ctx).map(({ x, source }) => {
    const line = pnlLineFor(x, source);
    const counted = line === 'spread' ? 'Spread' : line === 'financing' || line === 'none'
      ? 'No' : yesNo(source === 'overhead' ? expenseCountsIn(x, ctx.period.start, ctx.period.end) : inPeriod(ctx, x.date));
    return [
      x.date, entityLabel(ctx, x), source === 'fixedcost' ? 'Fixed cost' : 'Expense',
      expenseCategoryLabel(x.category || ''), x.description || '', x.amount || 0,
      isCommissionEntry(x) ? 'Not counted (old commission entry - settlement files used instead)' : PNL_LINE_LABEL[line],
      counted, x.expenseMonth || '',
      paidFromLabel(ctx, x), cashPart(x), onlinePart(x), ownerPart(x),
      x.employeeId ? `${people.code(x.employeeId)}${x.employeeName ? ` ${x.employeeName}` : ''}` : '',
      x.vendor || '', x.invoiceRef || '', enteredBy(x), x.id || '',
    ] as CellValue[];
  });
  return {
    name: 'Expenses register',
    title: `Expenses register - ${ctx.period.label}`,
    notes: ['Running expenses and fixed costs (rent, electricity, internet, subscriptions). "P&L line" is where each one lands in the profit and loss; equipment is spread over 3 years and loan EMIs never count as a cost.'],
    columns: [
      { header: 'Date', format: 'date' }, { header: 'Where' }, { header: 'Type' }, { header: 'Category' }, { header: 'Description' },
      { header: 'Amount', format: 'inr' }, { header: 'P&L line' }, { header: "Counted in this period's P&L" }, { header: 'Salary month' },
      { header: 'Paid from' }, { header: 'Cash', format: 'inr' }, { header: 'Online', format: 'inr' }, { header: "Owner's money", format: 'inr' },
      { header: 'Employee' }, { header: 'Vendor' }, { header: 'Invoice ref' }, { header: 'Entered by' }, { header: 'Record id' },
    ],
    rows,
    totalRow: true,
  };
}

// ---------- Payroll ----------

const paidFromPayout = (p: any) => (p.paidFrom === 'bank' ? 'Bank' : p.paidFrom === 'cash' ? 'Cash' : p.paidFrom === 'paytm' ? 'Paytm' : 'Paytm (assumed - older entry)');

export function payrollRows(ctx: ReportContext) {
  const people = employeeLookup(ctx);
  return ctx.data.payouts
    .filter((p: any) => {
      const e = people.get(p.employeeId);
      return (!e || employeeIn(ctx, e)) && (payoutCountsIn(p, ctx.period.start, ctx.period.end) || inPeriod(ctx, p.date));
    })
    .sort(byDate);
}

export function payrollRegister(ctx: ReportContext): SheetSpec {
  const people = employeeLookup(ctx);
  const advanceByPayout = new Map<string, number>();
  ctx.data.salaryAdvances.forEach((a: any) => (a.deductions || []).forEach((d: any) => {
    if (d.deducted && d.payoutId) advanceByPayout.set(d.payoutId, (advanceByPayout.get(d.payoutId) || 0) + (d.amount || 0));
  }));
  const rows = payrollRows(ctx).map((p: any) => {
    const e = people.get(p.employeeId);
    const advance = advanceByPayout.get(p.id) || 0;
    return [
      people.code(p.employeeId), e?.name || p.employeeName || '', e ? people.type(e) : '', people.works(e),
      p.forMonth || String(p.date || '').slice(0, 7), p.date, (p.amount || 0) + advance, advance, p.amount || 0,
      p.variablePay || null, paidFromPayout(p), p.transactionId || '',
      yesNo(!!e && payoutCountsIn(p, ctx.period.start, ctx.period.end)), p.id || '',
    ] as CellValue[];
  });
  return {
    name: 'Payroll register',
    title: `Payroll register - ${ctx.period.label}`,
    notes: [
      'Salaries count in the month they cover, not the day they were paid. Rows paid in this period for another month are listed too, marked "No" in the last-but-one column.',
      'Gross = net paid + salary-advance instalment deducted. No phone numbers, Aadhaar or bank details are included.',
    ],
    columns: [
      { header: 'Employee code' }, { header: 'Name' }, { header: 'Type' }, { header: 'Works at' }, { header: 'Month covered' },
      { header: 'Paid on', format: 'date' }, { header: 'Gross', format: 'inr' }, { header: 'Advance deducted', format: 'inr' }, { header: 'Net paid', format: 'inr' },
      { header: 'of which variable pay', format: 'inr' }, { header: 'Paid from' }, { header: 'Bank/UPI ref' },
      { header: "Counted in this period's P&L" }, { header: 'Record id' },
    ],
    rows,
    totalRow: true,
  };
}

// ---------- Cash books ----------

export function storeCashBook(ctx: ReportContext): SheetSpec {
  const sheet: SheetSpec = {
    name: 'Store cash book',
    title: `Store till - ${ctx.period.label}`,
    notes: [
      `From ${prettyDate(PRODUCTION_CASH_GO_LIVE_DATE)} the store's cash is handed to production every morning, so each day opens at 0. Expected = opening + cash sales + top-ups from Paytm - cash spent from the till.`,
      'Counted and difference are blank on days nobody saved a cash count.',
    ],
    columns: [
      { header: 'Date', format: 'date' }, { header: 'Store' }, { header: 'Opening', format: 'inr' }, { header: 'Cash sales in', format: 'inr' },
      { header: 'Top-up from Paytm in', format: 'inr' }, { header: 'Cash spent out', format: 'inr' }, { header: 'Expected closing', format: 'inr' },
      { header: 'Counted', format: 'inr' }, { header: 'Difference (counted - expected)', format: 'inr' }, { header: 'Status' },
    ],
    rows: [],
  };
  if (!hasStoreSide(ctx)) return { ...sheet, notes: ['The store till belongs to the store - choose Store or Combined.'] };
  const expenses = [...ctx.data.inventory, ...ctx.data.overheads, ...ctx.data.fixedCosts]
    .filter((x: any) => inPeriod(ctx, x.date) && x.entityType !== 'production_house');
  for (const store of storesInView(ctx)) {
    const storeSales = ctx.data.sales.filter((s: any) => s.storeId === store.id);
    for (const date of datesInRange(ctx.period.start, ctx.period.dataEnd)) {
      const s = storeSales.find((r: any) => r.date === date && !isPlaceholderSale(r)) || storeSales.find((r: any) => r.date === date);
      let opening = 0;
      if (date < PRODUCTION_CASH_GO_LIVE_DATE) {
        const prev = storeSales.filter((r: any) => r.date < date && hasRealCashCount(r)).sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
        opening = prev?.actualCashInHand ?? s?.previousCashInHand ?? 0;
      }
      const cashIn = s?.cashAmount || 0;
      const topup = s ? s.usedOnlineMoney || 0 : ctx.data.topups
        .filter((t: any) => t.storeId === store.id && t.date === date && t.status === 'approved' && t.reason !== 'production_inventory')
        .reduce((t: number, x: any) => t + (x.requestedAmount || 0), 0);
      const spent = expenses.filter((x: any) => x.date === date && x.storeId === store.id).reduce((t: number, x: any) => t + storeCashPortion(x), 0);
      const expected = opening + cashIn + topup - spent;
      const real = hasRealCashCount(s);
      sheet.rows.push([
        date, store.name, opening, cashIn, topup, spent, expected,
        real ? s.actualCashInHand : null, real ? s.actualCashInHand - expected : null, salesDayStatus(s),
      ]);
    }
  }
  return sheet;
}

export function productionCashBook(ctx: ReportContext): SheetSpec {
  const sheet: SheetSpec = {
    name: 'Production cash book',
    title: `Production cash - ${ctx.period.label}`,
    notes: [`Tracked from ${prettyDate(PRODUCTION_CASH_GO_LIVE_DATE)}. Opening includes the store's cash handed over that morning.`],
    columns: [
      { header: 'Date', format: 'date' }, { header: 'Production house' }, { header: 'Opening', format: 'inr' }, { header: 'Top-ups in', format: 'inr' },
      { header: 'Cash spent out', format: 'inr' }, { header: 'Expected closing', format: 'inr' }, { header: 'Counted', format: 'inr' },
      { header: 'Difference (counted - expected)', format: 'inr' }, { header: 'Status' }, { header: 'Counted by' },
    ],
    rows: [],
  };
  if (ctx.scope === 'store') return { ...sheet, notes: ['Production cash belongs to the production house - choose Production or Combined.'] };
  const houseIds = ctx.productionHouseId ? [ctx.productionHouseId]
    : Array.from(new Set([...ctx.data.productionHouses.map((h) => h.id), ...ctx.data.stores.map((s) => s.productionHouseId).filter(Boolean) as string[]]));
  const from = ctx.period.start > PRODUCTION_CASH_GO_LIVE_DATE ? ctx.period.start : PRODUCTION_CASH_GO_LIVE_DATE;
  for (const houseId of houseIds) {
    for (const date of datesInRange(from, ctx.period.dataEnd)) {
      const e = ctx.data.productionCash.find((p) => p.productionHouseId === houseId && p.date === date);
      const counted = typeof e?.actualCashInHand === 'number';
      sheet.rows.push(e ? [
        date, houseName(ctx, houseId), e.openingBalance, e.cashTopupCredited, e.productionExpenses, e.expectedClosingCashInHand,
        counted ? e.actualCashInHand : null, counted ? (e.actualCashInHand as number) - e.expectedClosingCashInHand : null,
        e.approvalStatus === 'pending' ? 'Waiting for approval' : e.approvalStatus === 'approved' ? 'Approved' : counted ? 'Counted' : 'Not counted',
        e.createdByName || '',
      ] : [date, houseName(ctx, houseId), null, null, null, null, null, null, 'Not counted', '']);
    }
  }
  return sheet;
}

export function paytmLedgerSheet(ctx: ReportContext): SheetSpec {
  const sheet: SheetSpec = {
    name: 'Paytm ledger',
    title: `Online cash (Paytm/UPI) ledger - ${ctx.period.label}`,
    notes: [
      'Every credit and debit that moves the Paytm balance, with the running balance.',
      'Zomato/Swiggy pay out already net of their commission and ads, and that net payout is what is added here - commission never comes off Paytm, so old manual commission entries are not debited.',
    ],
    columns: [
      { header: 'Date', format: 'date' }, { header: 'Store' }, { header: 'Description' },
      { header: 'In', format: 'inr' }, { header: 'Out', format: 'inr' }, { header: 'Balance', format: 'inr' },
    ],
    rows: [],
  };
  if (!hasStoreSide(ctx)) return { ...sheet, notes: ['The Paytm balance belongs to the store - choose Store or Combined.'] };
  // Owner, Oct 2026: the settlement arrives net of commission, so commission is not a Paytm debit.
  const overheadsWithoutCommission = ctx.data.overheads.filter((o: any) => !isCommissionEntry(o));
  for (const store of storesInView(ctx)) {
    const ledger = computePaytmLedger({
      salesData: ctx.data.sales, overheads: overheadsWithoutCommission, aggregatorSettlements: ctx.data.settlements,
      onlinePayoutData: ctx.data.onlinePayouts, onlineLoans: ctx.data.loans, employeePayouts: ctx.data.payouts,
      topupRequests: ctx.data.topups, onlineCashRecalibrations: ctx.data.recalibrations, effectiveStoreId: store.id,
    }, ctx.period.start, ctx.period.dataEnd);
    sheet.rows.push([ledger.anchorDate, store.name, ledger.anchorLabel, null, null, ledger.anchorBalance]);
    ledger.lines.forEach((l) => sheet.rows.push([l.date, store.name, l.label, l.credit || null, l.debit || null, l.balance]));
  }
  return sheet;
}

// ---------- Zomato / Swiggy ----------

// Which order dates a settlement pays for: its orders' own dates (the stored period isn't
// reliable - July's daily Zomato files all say 1-31 Jul), else its stated period.
export function settlementOrderDates(s: any): string[] {
  const dates = Array.from(new Set((s.orders || []).map((o: any) => o.orderDate).filter(Boolean) as string[])).sort();
  if (dates.length) return dates;
  const p = getSettlementPeriod(s);
  return datesInRange(p.start, p.end);
}

export function aggregatorRecon(ctx: ReportContext): SheetSpec {
  const sheet: SheetSpec = {
    name: 'Aggregator reconciliation',
    title: `Zomato / Swiggy settlements - ${ctx.period.label}`,
    notes: [
      'One row per settlement file that pays for orders in this period or was paid in it. Gross = platform deductions + ads + net payout (the check column should be 0).',
      'The platform collects 5% GST from customers and pays it for us, so commission is shown with and without it; profit uses the figure without GST.',
    ],
    columns: [
      { header: 'Platform' }, { header: 'Store' }, { header: 'Paid on', format: 'date' }, { header: 'Bank UTR' },
      { header: 'First order date', format: 'date' }, { header: 'Last order date', format: 'date' }, { header: 'Order days in this period', format: 'int' },
      { header: 'Orders', format: 'int' }, { header: 'Gross order value', format: 'inr' }, { header: 'Platform deductions', format: 'inr' },
      { header: 'GST paid for us', format: 'inr' }, { header: 'Commission without GST', format: 'inr' }, { header: 'Ads', format: 'inr' },
      { header: 'Restaurant-funded discounts', format: 'inr' }, { header: 'Net payout', format: 'inr' }, { header: 'Check', format: 'inr' },
      { header: 'Source file' }, { header: 'Record id' },
    ],
    rows: [],
    totalRow: true,
  };
  if (!hasStoreSide(ctx)) return { ...sheet, notes: ['Online sales belong to the store - choose Store or Combined.'], totalRow: false };
  ctx.data.settlements
    .filter((s: any) => !ctx.storeId || s.storeId === ctx.storeId)
    .map((s: any) => ({ s, dates: settlementOrderDates(s) }))
    .filter(({ s, dates }) => dates.some((d) => inPeriod(ctx, d)) || inPeriod(ctx, s.settlementDate))
    .sort((a, b) => String(a.s.settlementDate).localeCompare(String(b.s.settlementDate)))
    .forEach(({ s, dates }) => {
      const gst = s.gstCollected ?? ((s.grossSales || 0) * 5) / 105;
      sheet.rows.push([
        s.aggregator === 'swiggy' ? 'Swiggy' : 'Zomato', storeName(ctx, s.storeId), s.settlementDate, s.bankUTR || '',
        dates[0] || '', dates[dates.length - 1] || '', dates.filter((d) => inPeriod(ctx, d)).length,
        s.orderCount ?? (s.orders || []).length, s.grossSales || 0, s.netCommission || 0, gst, (s.netCommission || 0) - gst,
        s.adSpend || 0, s.totalDiscount || null, s.netPayout || 0,
        round2((s.grossSales || 0) - (s.netCommission || 0) - (s.adSpend || 0) - (s.netPayout || 0)),
        s.sourceFileName || '', s.id || '',
      ]);
    });
  ctx.data.onlinePayouts
    .filter((p: any) => inPeriod(ctx, p.date) && (!ctx.storeId || p.storeId === ctx.storeId))
    .sort(byDate)
    .forEach((p: any) => sheet.rows.push([
      'Zomato + Swiggy (old manual entry)', storeName(ctx, p.storeId), p.date, '', p.date, p.date, 1, null, null, null, null, null, null, null,
      (p.zomatoPayout || 0) + (p.swiggyPayout || 0), null, '', p.id || '',
    ]));
  return sheet;
}

// Days with online orders whose settlement should have arrived by now but isn't uploaded.
export function missingSettlementDays(ctx: ReportContext) {
  if (!hasStoreSide(ctx)) return [];
  const index = buildOnlineCostIndex(ctx.data.settlements as any[], ctx.storeId);
  const manual = new Set(ctx.data.onlinePayouts.filter((p: any) => !ctx.storeId || p.storeId === ctx.storeId).map((p: any) => p.date));
  const out: { date: string; aggregator: 'zomato' | 'swiggy'; amount: number; storeId?: string }[] = [];
  ctx.data.onlineSales
    .filter((o: any) => inPeriod(ctx, o.date) && (!ctx.storeId || o.storeId === ctx.storeId))
    .forEach((o: any) => (['zomato', 'swiggy'] as const).forEach((agg) => {
      const amount = agg === 'zomato' ? o.zomatoSales || 0 : o.swiggySales || 0;
      if (amount <= 0 || index.covered[agg].has(o.date) || manual.has(o.date)) return;
      if (ctx.today > settlementDueBy(agg, o.date)) out.push({ date: o.date, aggregator: agg, amount, storeId: o.storeId });
    }));
  return out.sort(byDate);
}

// ---------- Exceptions ----------

export function exceptionsSheet(ctx: ReportContext): SheetSpec {
  const rows: CellValue[][] = [];
  const add = (check: string, date: string, where: string, details: string, amount: number | null, id = '') =>
    rows.push([check, date, where, details, amount, id]);
  const people = employeeLookup(ctx);

  if (hasStoreSide(ctx)) {
    const sales = ctx.data.sales.filter((s: any) => inPeriod(ctx, s.date) && (!ctx.storeId || s.storeId === ctx.storeId));
    // Today's count happens at closing, so only days before today can be missing one.
    for (const store of storesInView(ctx)) {
      for (const date of datesInRange(ctx.period.start, ctx.period.dataEnd)) {
        if (date >= ctx.today) continue;
        const day = sales.filter((s: any) => s.storeId === store.id && s.date === date);
        if (!day.some(hasRealCashCount)) add('No cash count saved', date, store.name, day.length ? 'Only the POS figures - nobody counted the till' : 'No sales record at all', null, day[0]?.id || '');
      }
    }
    sales.forEach((s: any) => {
      if (Math.abs(s.cashOverShortAmount || 0) > 0.5 && !s.cashOverShortReason) {
        add('Till short/over with no reason', s.date, storeName(ctx, s.storeId), `${s.cashOverShortAmount > 0 ? 'Short' : 'Over'} against POS sales`, s.cashOverShortAmount, s.id);
      }
      if (!isPlaceholderSale(s) && s.approvalStatus === 'pending') {
        add('Waiting for approval', s.date, storeName(ctx, s.storeId), 'Daily sales / cash count', s.salesDiscrepancy ?? s.cashOffset ?? null, s.id);
      }
    });
    const dupSales = new Map<string, any[]>();
    sales.forEach((s: any) => { const k = `${s.storeId}|${s.date}`; dupSales.set(k, [...(dupSales.get(k) || []), s]); });
    dupSales.forEach((list) => list.length > 1 && add('Possible duplicate', list[0].date, storeName(ctx, list[0].storeId), `${list.length} sales records for the same store and day`, null, list.map((s) => s.id).join(' ')));
    missingSettlementDays(ctx).forEach((m) => add('Settlement missing', m.date, storeName(ctx, m.storeId), `${m.aggregator === 'zomato' ? 'Zomato' : 'Swiggy'} orders past their payout date with no settlement uploaded`, m.amount));
    ctx.data.loans.filter((l: any) => l.status === 'pending' && (!ctx.storeId || l.storeId === ctx.storeId))
      .forEach((l: any) => add('Waiting for approval', l.loanDate, storeName(ctx, l.storeId), `Loan request${l.investorName ? ` from ${l.investorName}` : ''}`, l.loanAmount, l.id));
    ctx.data.topups.filter((t: any) => t.status === 'pending' && inPeriod(ctx, t.date) && (!ctx.storeId || t.storeId === ctx.storeId))
      .forEach((t: any) => add('Waiting for approval', t.date, t.requestedByEntityName || storeName(ctx, t.storeId), 'Cash top-up request', t.requestedAmount, t.id));
  }
  if (ctx.scope !== 'store') {
    ctx.data.productionCash.filter((p) => inPeriod(ctx, p.date) && p.approvalStatus === 'pending' && (!ctx.productionHouseId || p.productionHouseId === ctx.productionHouseId))
      .forEach((p) => add('Waiting for approval', p.date, houseName(ctx, p.productionHouseId), 'Production cash count', p.discrepancy, p.id));
  }
  ctx.data.salaryAdvances.filter((a: any) => a.status === 'pending' && inPeriod(ctx, a.requestDate) && (!people.get(a.employeeId) || employeeIn(ctx, people.get(a.employeeId))))
    .forEach((a: any) => add('Waiting for approval', a.requestDate, people.code(a.employeeId), 'Salary advance request', a.amount, a.id));

  // Possible duplicates: same day, same place, same item and amount.
  const dupes = (items: any[], key: (x: any) => string, label: (x: any) => string, amount: (x: any) => number) => {
    const groups = new Map<string, any[]>();
    items.forEach((x) => groups.set(key(x), [...(groups.get(key(x)) || []), x]));
    groups.forEach((list) => list.length > 1 && add('Possible duplicate', list[0].date, entityLabel(ctx, list[0]), `${list.length} x ${label(list[0])}`, amount(list[0]) * list.length, list.map((x) => x.id).join(' ')));
  };
  const purchases = purchaseRows(ctx);
  dupes(purchases, (x) => `${x.date}|${x.entityType}|${x.storeId}|${x.productionHouseId}|${norm(x.itemName)}|${x.quantity}|${x.totalCost}`, (x) => `${x.itemName} ${x.quantity} ${x.unit}`, (x) => x.totalCost || 0);
  const expenses = expenseRows(ctx).map((e) => e.x).filter((x: any) => inPeriod(ctx, x.date));
  dupes(expenses, (x) => `${x.date}|${x.entityType}|${x.storeId}|${x.productionHouseId}|${x.category}|${x.amount}|${norm(x.description)}`, (x) => `${expenseCategoryLabel(x.category || '')} ${x.description || ''}`, (x) => x.amount || 0);
  const payGroups = new Map<string, any[]>();
  payrollRows(ctx).forEach((p: any) => { const k = `${p.employeeId}|${p.forMonth || String(p.date).slice(0, 7)}|${p.amount}`; payGroups.set(k, [...(payGroups.get(k) || []), p]); });
  payGroups.forEach((list) => list.length > 1 && add('Possible duplicate', list[0].date, people.code(list[0].employeeId), `${list.length} salary payouts of the same amount for ${list[0].forMonth || String(list[0].date).slice(0, 7)}`, (list[0].amount || 0) * list.length, list.map((p) => p.id).join(' ')));

  // Price checks.
  const guide = buildPriceGuide(ctx.data.inventory as any[]);
  purchases.forEach((x: any) => {
    const flag = checkPurchase(x, guide);
    if (flag) add(flag.severity === 'high' ? 'Price very unusual' : 'Price to check', x.date, entityLabel(ctx, x), `${x.itemName}: ${flag.message}`, x.totalCost || 0, x.id);
  });

  // Income Tax s.40A(3): a cash payment over ₹10,000 to one person in a day isn't allowed as a
  // business expense. Bills paid with the owner's own money are left out (how he paid isn't recorded).
  const cashByPayee = new Map<string, { date: string; payee: string; total: number; ids: string[]; where: string }>();
  const addCash = (date: string, payee: string, amount: number, id: string, where: string) => {
    if (!(amount > 0) || !payee) return;
    const k = `${date}|${norm(payee)}`;
    const g = cashByPayee.get(k) || { date, payee, total: 0, ids: [], where };
    g.total += amount;
    g.ids.push(id);
    cashByPayee.set(k, g);
  };
  purchases.forEach((x: any) => addCash(x.date, x.vendor || x.itemName, cashPart(x), x.id, entityLabel(ctx, x)));
  expenses.forEach((x: any) => addCash(x.date, x.vendor || x.description || expenseCategoryLabel(x.category || ''), cashPart(x), x.id, entityLabel(ctx, x)));
  payrollRows(ctx).filter((p: any) => p.paidFrom === 'cash' && inPeriod(ctx, p.date))
    .forEach((p: any) => addCash(p.date, `Salary ${people.code(p.employeeId)}`, p.amount || 0, p.id, people.works(people.get(p.employeeId))));
  cashByPayee.forEach((g) => g.total > 10000 && add('Cash over ₹10,000 to one payee in a day (s.40A(3))', g.date, g.where, `Paid in cash to "${g.payee}" - pay by bank/UPI or the CA may disallow it`, g.total, g.ids.join(' ')));

  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
  return {
    name: 'Exceptions',
    title: `Things to check - ${ctx.period.label}`,
    notes: [rows.length ? `${rows.length} item(s). Payee for the cash check is the vendor when one was recorded, otherwise the item or description.` : 'Nothing to flag in this period.'],
    columns: [
      { header: 'Check' }, { header: 'Date', format: 'date' }, { header: 'Where / who' }, { header: 'Details' },
      { header: 'Amount', format: 'inr' }, { header: 'Record id(s)' },
    ],
    rows,
  };
}

// ---------- Loans, assets, staff, other lists ----------

// Loans as they stood at the end of the period: only ones actually approved (active or repaid).
// Partial repayments aren't dated in the app, so a loan still open shows today's balance.
export function loansAt(ctx: ReportContext, asOf: string) {
  return ctx.data.loans
    .filter((l: any) => (l.status === 'active' || l.status === 'repaid') && l.loanDate && l.loanDate.slice(0, 10) <= asOf && (!ctx.storeId || l.storeId === ctx.storeId))
    .map((l: any) => {
      const repaidBy = l.status === 'repaid' && l.repaymentDate && l.repaymentDate.slice(0, 10) <= asOf;
      const outstanding = repaidBy ? 0 : l.status === 'repaid' ? l.loanAmount : Math.max(0, (l.loanAmount || 0) - (l.repaidAmount || 0));
      return { loan: l, outstanding };
    })
    .sort((a, b) => String(a.loan.loanDate).localeCompare(String(b.loan.loanDate)));
}

export function loansSheet(ctx: ReportContext): SheetSpec {
  const asOf = ctx.period.dataEnd;
  const rows = hasStoreSide(ctx) ? loansAt(ctx, asOf).map(({ loan: l, outstanding }) => [
    l.investorName || 'Owner / investor', storeName(ctx, l.storeId), l.loanDate, l.loanAmount || 0, l.interestRate ? l.interestRate / 100 : null,
    l.status === 'repaid' ? `Repaid${l.repaymentDate ? ` ${l.repaymentDate}` : ''}` : 'Open', l.repaidAmount || 0, outstanding,
    accruedInterest([l], ctx.period.start, ctx.period.dataEnd), l.id || '',
  ] as CellValue[]) : [];
  return {
    name: 'Loans',
    title: `Owner / investor loans outstanding at ${prettyDate(asOf)}`,
    notes: ['Approved loans only (requests still pending or turned down are left out). Partial repayments are not dated in the app, so an open loan shows its balance today.'],
    columns: [
      { header: 'Lender' }, { header: 'Store' }, { header: 'Loan date', format: 'date' }, { header: 'Amount', format: 'inr' },
      { header: 'Interest per month', format: 'pct' }, { header: 'Status now' }, { header: 'Repaid so far', format: 'inr' },
      { header: `Outstanding at ${asOf}`, format: 'inr' }, { header: 'Interest for this period', format: 'inr' }, { header: 'Record id' },
    ],
    rows,
    totalRow: true,
  };
}

const ASSET_CATEGORIES = new Set(Object.keys(SPREAD_MONTHS).filter((k) => k !== 'software_subscription'));
export const isAssetRecord = (x: any) => ASSET_CATEGORIES.has(canonicalCategory(x?.category || ''));

export function assetRecords(ctx: ReportContext, upTo: string) {
  return [...ctx.data.inventory, ...ctx.data.overheads, ...ctx.data.fixedCosts]
    .filter((x: any) => x?.date && x.date <= upTo && isAssetRecord(x) && recordIn(ctx, x))
    .sort(byDate);
}

export function assetsSheet(ctx: ReportContext): SheetSpec {
  const asOf = ctx.period.dataEnd;
  const monthsUsed = (date: string) => {
    let n = 0;
    for (let m = date.slice(0, 7); m <= asOf.slice(0, 7); m = monthAdd(m, 1)) n++;
    return n;
  };
  const rows = assetRecords(ctx, asOf).map((x: any) => {
    const cost = x.totalCost ?? x.amount ?? 0;
    const life = SPREAD_MONTHS[canonicalCategory(x.category)] || 36;
    const used = Math.min(life, monthsUsed(x.date));
    const charged = (cost / life) * used;
    return [x.date, entityLabel(ctx, x), expenseCategoryLabel(x.category), x.itemName || x.description || '', cost, life, used, charged, cost - charged, paidFromLabel(ctx, x), x.id || ''] as CellValue[];
  });
  return {
    name: 'Assets',
    title: `Equipment and other assets at ${prettyDate(asOf)}`,
    notes: ['Equipment, furniture, electrical work and the scooter, each counted in profit evenly over 36 months from the month bought. "Still to charge" is what is left of its cost.'],
    columns: [
      { header: 'Bought on', format: 'date' }, { header: 'Where' }, { header: 'Category' }, { header: 'Item' }, { header: 'Cost', format: 'inr' },
      { header: 'Spread over (months)', format: 'int' }, { header: 'Months counted so far', format: 'int' }, { header: 'Charged to profit so far', format: 'inr' },
      { header: 'Still to charge', format: 'inr' }, { header: 'Paid from' }, { header: 'Record id' },
    ],
    rows,
    totalRow: true,
  };
}

export function salaryAdvancesSheet(ctx: ReportContext): SheetSpec {
  const people = employeeLookup(ctx);
  const rows = ctx.data.salaryAdvances
    .filter((a: any) => inPeriod(ctx, a.requestDate) && (!people.get(a.employeeId) || employeeIn(ctx, people.get(a.employeeId))))
    .sort((a: any, b: any) => String(a.requestDate).localeCompare(String(b.requestDate)))
    .map((a: any) => [people.code(a.employeeId) || a.employeeEmployeeId || '', a.employeeName || '', a.requestDate, a.amount || 0, a.status, a.monthlyDeduction || 0, a.remainingAmount ?? null, a.id || ''] as CellValue[]);
  return {
    name: 'Salary advances',
    title: `Salary advances asked for - ${ctx.period.label}`,
    columns: [
      { header: 'Employee code' }, { header: 'Name' }, { header: 'Asked on', format: 'date' }, { header: 'Amount', format: 'inr' },
      { header: 'Status' }, { header: 'Monthly deduction', format: 'inr' }, { header: 'Still to recover', format: 'inr' }, { header: 'Record id' },
    ],
    rows,
    totalRow: true,
  };
}

export function productionSheet(ctx: ReportContext): SheetSpec {
  const rows = ctx.scope === 'store' ? [] : ctx.data.production
    .filter((p: any) => inPeriod(ctx, p.date) && (!ctx.productionHouseId || (p.productionHouseId || p.storeId) === ctx.productionHouseId))
    .sort(byDate)
    .map((p: any) => [
      p.date, houseName(ctx, p.productionHouseId || p.storeId), p.chickenMomos?.final || 0, p.chickenCheeseMomos?.final || 0, p.vegMomos?.final || 0,
      p.cheeseCornMomos?.final || 0, p.paneerMomos?.final || 0, p.vegKurkureMomos?.final || 0, p.chickenKurkureMomos?.final || 0,
      p.wastage?.dough || 0, p.wastage?.stuffing || 0, p.wastage?.batter || 0, p.wastage?.coating || 0, p.approvalStatus || '',
    ] as CellValue[]);
  return {
    name: 'Production',
    title: `Production log - ${ctx.period.label}`,
    columns: [
      { header: 'Date', format: 'date' }, { header: 'Production house' }, { header: 'Chicken', format: 'int' }, { header: 'Chicken cheese', format: 'int' },
      { header: 'Veg', format: 'int' }, { header: 'Cheese corn', format: 'int' }, { header: 'Paneer', format: 'int' }, { header: 'Veg kurkure', format: 'int' },
      { header: 'Chicken kurkure', format: 'int' }, { header: 'Wastage dough (kg)', format: 'qty' }, { header: 'Wastage stuffing (kg)', format: 'qty' },
      { header: 'Wastage batter (kg)', format: 'qty' }, { header: 'Wastage coating (kg)', format: 'qty' }, { header: 'Status' },
    ],
    rows,
    totalRow: true,
  };
}

export function itemsSoldSheet(ctx: ReportContext): SheetSpec {
  const totals = new Map<string, number>();
  if (hasStoreSide(ctx)) {
    ctx.data.itemSales.filter((r: any) => inPeriod(ctx, r.date) && (!ctx.storeId || r.storeId === ctx.storeId))
      .forEach((r: any) => Object.entries(r.data || {}).forEach(([label, qty]) => totals.set(label, (totals.get(label) || 0) + (Number(qty) || 0))));
  }
  return {
    name: 'Items sold',
    title: `Momos sold by type - ${ctx.period.label}`,
    columns: [{ header: 'Momo type' }, { header: 'Pieces sold', format: 'int' }],
    rows: [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([label, qty]) => [label, qty]),
    totalRow: true,
  };
}

// Who works here - no phone numbers, Aadhaar or bank details ever go into an export.
export function staffSheet(ctx: ReportContext): SheetSpec {
  const people = employeeLookup(ctx);
  const rows = ctx.data.employees
    .filter((e: any) => employeeIn(ctx, e))
    .sort((a: any, b: any) => String(a.employeeId || '').localeCompare(String(b.employeeId || '')))
    .map((e: any) => [e.employeeId || e.id || '', e.name || '', people.type(e), people.works(e), e.designation || e.role || '', e.joiningDate || '',
      e.isActive === false || e.releasedAt || e.archivedFrom ? 'Released' : 'Working'] as CellValue[]);
  return {
    name: 'Staff',
    title: 'Staff list',
    columns: [{ header: 'Employee code' }, { header: 'Name' }, { header: 'Type' }, { header: 'Works at' }, { header: 'Role' }, { header: 'Joined', format: 'date' }, { header: 'Status' }],
    rows,
  };
}
