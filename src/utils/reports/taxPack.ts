// Pack C: tax / CA pack for one financial year (April-March). Always the whole business (one
// PAN), whatever store/production choice is on screen. Facts used: not GST-registered, one
// ₹20,000 rent a month, counter sales are most of the business.
//
// Everything here is a starting point for the CA - the notes say so in plain words.

import type { SheetSpec, CellValue } from './sheets';
import { printableDocument, cardsHtml, inr, pctText, round2, escapeHtml } from './sheets';
import { type ReportContext, entityLabel, ownerPart, cashPart, employeeLookup } from './reportData';
import { pnlFor, assetRecords, loansAt, loansSheet } from './ledgers';
import { readmeSheet, BUSINESS_NAME } from './packs';
import { monthWindows } from './ceoPack';
import { daysBetweenInclusive, prettyDate, fyLabel } from '../reportPeriods';
import { sumPnl, payoutCountsIn, expenseCountsIn, pnlLineFor, isCommissionEntry, accruedInterest, approvedShortage } from '../pnl';
import { canonicalCategory, expenseCategoryLabel } from '../inventoryData';
import { buildOnlineCostIndex, onlineCostsForRange } from '../onlineCosts';

export const GST_THRESHOLD = 2000000; // ₹20 lakh - supply of services (restaurant), West Bengal
const DEEMED_CASH = 0.08;
const DEEMED_DIGITAL = 0.06;
const RENT_TDS_MONTHLY_LIMIT = 50000;
const BASIC_EXEMPTION = 400000; // new tax regime, from FY 2025-26

// Income Tax depreciation blocks (written-down value method).
const BLOCKS: Record<string, { block: string; rate: number }> = {
  asset_kitchen_equipment: { block: 'Plant and machinery', rate: 0.15 },
  asset_furniture: { block: 'Furniture and fittings', rate: 0.10 },
  asset_electrical: { block: 'Furniture and fittings (electrical fittings)', rate: 0.10 },
  asset_vehicle: { block: 'Motor vehicle (scooter)', rate: 0.15 },
};

// Expense heads the CA's schedule uses, from the app's categories.
const HEAD_OF: Record<string, string> = {
  rent: 'Rent', electricity: 'Electricity', internet_phone: 'Internet and phone', software_subscription: 'Software / POS subscription', lpg_gas: 'Cooking gas (old entries)',
  breakfast: 'Staff meals and welfare', lunch: 'Staff meals and welfare', dinner: 'Staff meals and welfare', evening_snacks: 'Staff meals and welfare',
  staff_welfare: 'Staff meals and welfare', staff_emergency_services: 'Staff meals and welfare',
  repair: 'Repairs and maintenance', renovation: 'Repairs and maintenance', labour_charge: 'Repairs and maintenance', vehicle_maintenance: 'Repairs and maintenance', deep_cleaning: 'Repairs and maintenance',
  fuel: 'Travel, fuel and transport', ev_charging: 'Travel, fuel and transport', travel: 'Travel, fuel and transport', transportation: 'Travel, fuel and transport',
  marketing: 'Advertising and marketing', professional_fees: 'Professional fees', license: 'Licences and fees',
  donations_community: 'Donations (usually not a business deduction)', losses_writeoffs: 'Losses and write-offs',
};

export function buildTaxPack(ctx: ReportContext) {
  const fy = ctx.period;
  const fyName = fyLabel(fy.fyStartYear);
  const windows = monthWindows(ctx);
  const monthly = windows.map((w) => pnlFor(ctx, w.start, w.end));
  const total = sumPnl(monthly);
  const sales = ctx.data.sales.filter((s: any) => s.date >= fy.start && s.date <= fy.dataEnd);
  const within = (d: string | undefined, a: string, b: string) => !!d && d >= a && d <= b;

  // ---- Turnover by month ----
  let running = 0;
  const turnoverRows: CellValue[][] = windows.map((w, i) => {
    const p = monthly[i];
    const daySales = sales.filter((s: any) => within(s.date, w.start, w.end));
    const cash = daySales.reduce((t: number, s: any) => t + (s.cashAmount || 0), 0);
    const paytm = daySales.reduce((t: number, s: any) => t + (s.paytmAmount || 0), 0);
    running += p.revenue;
    return [w.label, cash, paytm, p.zomatoRevenue, p.swiggyRevenue, p.onlineRevenue - p.zomatoRevenue - p.swiggyRevenue, paytm + p.onlineRevenue, p.revenue, running, running / GST_THRESHOLD];
  });
  const cashTurnover = turnoverRows.reduce((t, r) => t + (r[1] as number), 0);
  const digitalTurnover = turnoverRows.reduce((t, r) => t + (r[6] as number), 0);
  const turnoverSheet: SheetSpec = {
    name: 'Turnover by month',
    title: `Turnover by month - ${fyName}`,
    notes: [
      'Cash = counter sales received in cash. Digital = Paytm/UPI/card at the counter + Zomato/Swiggy (paid to the bank). Amounts are what the business keeps, without GST (not registered).',
      ...(fy.partial ? [`The year is still running - figures are up to ${prettyDate(fy.dataEnd)}.`] : []),
    ],
    columns: [
      { header: 'Month' }, { header: 'Cash', format: 'inr' }, { header: 'Counter Paytm/UPI/card', format: 'inr' }, { header: 'Zomato', format: 'inr' },
      { header: 'Swiggy', format: 'inr' }, { header: 'Other online', format: 'inr' }, { header: 'Digital total', format: 'inr' }, { header: 'Total turnover', format: 'inr' },
      { header: 'Year so far', format: 'inr' }, { header: 'Of the ₹20 lakh GST limit', format: 'pct' },
    ],
    rows: turnoverRows,
  };

  // ---- Depreciation (WDV), needed for book profit on a tax basis too ----
  const depRows: CellValue[][] = [];
  const byBlock = new Map<string, { opening: number; added: number; dep: number; closing: number }>();
  let taxDepreciation = 0;
  for (const x of assetRecords({ ...ctx, scope: 'combined', storeId: null }, fy.end)) {
    const info = BLOCKS[canonicalCategory(x.category || '')];
    if (!info) continue;
    const cost = Number(x.totalCost ?? x.amount ?? 0) || 0;
    const boughtFy = Number(x.date.slice(5, 7)) >= 4 ? Number(x.date.slice(0, 4)) : Number(x.date.slice(0, 4)) - 1;
    const shortFirstYear = daysBetweenInclusive(x.date, `${boughtFy + 1}-03-31`) < 180;
    let wdv = cost;
    let opening = 0, rateApplied = info.rate, dep = 0;
    for (let y = boughtFy; y <= fy.fyStartYear; y++) {
      const rate = y === boughtFy && shortFirstYear ? info.rate / 2 : info.rate;
      const d = wdv * rate;
      if (y === fy.fyStartYear) { opening = y === boughtFy ? 0 : wdv; rateApplied = rate; dep = d; }
      wdv -= d;
    }
    const added = boughtFy === fy.fyStartYear ? cost : 0;
    taxDepreciation += dep;
    const b = byBlock.get(info.block) || { opening: 0, added: 0, dep: 0, closing: 0 };
    b.opening += opening; b.added += added; b.dep += dep; b.closing += wdv;
    byBlock.set(info.block, b);
    depRows.push([x.date, x.itemName || x.description || '', info.block, info.rate, cost, opening, added, boughtFy === fy.fyStartYear ? (shortFirstYear ? 'Yes - half rate' : 'No') : '', rateApplied, dep, wdv, x.id || '']);
  }
  const depSheet: SheetSpec = {
    name: 'Depreciation (WDV)',
    title: `Depreciation on written-down value - ${fyName}`,
    notes: [
      'Income Tax rates: plant and machinery 15%, furniture and fittings (incl. electrical fittings) 10%, motor vehicle 15%. Half the rate in the year bought if used under 180 days that year.',
      'Worked out asset by asset from the purchase date; sales or scrapping of assets are not recorded in the app. The scooter\'s cost in the app may include loan EMIs - the interest part is not depreciable (CA to split).',
    ],
    columns: [
      { header: 'Bought on', format: 'date' }, { header: 'Item' }, { header: 'Block' }, { header: 'Full rate', format: 'pct' }, { header: 'Cost', format: 'inr' },
      { header: `Opening WDV (1 Apr ${fy.fyStartYear})`, format: 'inr' }, { header: 'Added this year', format: 'inr' }, { header: 'Used under 180 days in year bought' },
      { header: 'Rate this year', format: 'pct' }, { header: 'Depreciation this year', format: 'inr' }, { header: `Closing WDV (31 Mar ${fy.fyStartYear + 1})`, format: 'inr' }, { header: 'Record id' },
    ],
    rows: depRows,
    totalRow: true,
  };
  const blockSheet: SheetSpec = {
    name: 'Depreciation by block',
    title: `Depreciation by block - ${fyName}`,
    columns: [{ header: 'Block' }, { header: 'Opening WDV', format: 'inr' }, { header: 'Added', format: 'inr' }, { header: 'Depreciation', format: 'inr' }, { header: 'Closing WDV', format: 'inr' }],
    rows: [...byBlock.entries()].map(([block, b]) => [block, b.opening, b.added, b.dep, b.closing]),
    totalRow: true,
  };

  // ---- Expense schedule (as paid / incurred in the year; equipment out - depreciation instead) ----
  const heads = new Map<string, { amount: number; cash: number; owner: number; count: number }>();
  const addHead = (head: string, amount: number, cash = 0, owner = 0) => {
    if (!amount) return;
    const h = heads.get(head) || { amount: 0, cash: 0, owner: 0, count: 0 };
    h.amount += amount; h.cash += cash; h.owner += owner; h.count += 1;
    heads.set(head, h);
  };
  ctx.data.inventory.filter((x: any) => within(x.date, fy.start, fy.dataEnd)).forEach((x: any) => {
    const line = pnlLineFor(x, 'inventory');
    if (BLOCKS[canonicalCategory(x.category || '')] || line === 'financing') return;
    const head = line === 'food' || line === 'packaging' || canonicalCategory(x.category || '') === 'packaging_bulk' ? 'Purchases - food and packaging' : HEAD_OF[canonicalCategory(x.category || '')] || 'Consumables and other expenses';
    addHead(head, x.totalCost || 0, cashPart(x), ownerPart(x));
  });
  ctx.data.overheads.filter((x: any) => expenseCountsIn(x, fy.start, fy.dataEnd)).forEach((x: any) => {
    const key = canonicalCategory(x.category || '');
    if (BLOCKS[key] || key === 'vehicle_emi' || isCommissionEntry(x)) return;
    const head = key === 'personal_expense' ? 'Salaries and wages' : HEAD_OF[key] || 'Consumables and other expenses';
    addHead(head, x.amount || 0, cashPart(x), ownerPart(x));
  });
  ctx.data.fixedCosts.filter((x: any) => within(x.date, fy.start, fy.dataEnd)).forEach((x: any) => {
    const key = canonicalCategory(x.category || '');
    if (BLOCKS[key]) return;
    addHead(HEAD_OF[key] || 'Other fixed costs', x.amount || 0, cashPart(x), ownerPart(x));
  });
  const people = employeeLookup(ctx);
  const payByEmployee = new Map<string, number>();
  ctx.data.payouts.filter((p: any) => people.get(p.employeeId) && payoutCountsIn(p, fy.start, fy.end)).forEach((p: any) => {
    addHead('Salaries and wages', p.amount || 0, p.paidFrom === 'cash' ? p.amount || 0 : 0);
    payByEmployee.set(p.employeeId, (payByEmployee.get(p.employeeId) || 0) + (p.amount || 0));
  });
  const online = onlineCostsForRange(buildOnlineCostIndex(ctx.data.settlements as any[], null), ctx.data.onlineSales, ctx.data.onlinePayouts, fy.start, fy.dataEnd, ctx.today);
  addHead('Zomato/Swiggy commission (without GST) and ads', online.commission + online.ads);
  addHead('Interest on loans', accruedInterest(ctx.data.loans, fy.start, fy.dataEnd));
  addHead('Cash shortages (approved)', sales.reduce((t: number, s: any) => t + approvedShortage(s), 0));
  const totalExpenses = [...heads.values()].reduce((t, h) => t + h.amount, 0);
  const expenseSheet: SheetSpec = {
    name: 'Expense schedule',
    title: `Expenses by head - ${fyName}`,
    notes: [
      'As paid or incurred in the year: bulk packaging counted when bought, salaries for the months April-March. Equipment is left out - see depreciation. Loan EMIs and loan repayments are not expenses.',
      'Zomato/Swiggy commission is net of the GST they collect from customers.',
    ],
    columns: [{ header: 'Head', width: 44 }, { header: 'Amount', format: 'inr' }, { header: 'of which paid in cash', format: 'inr' }, { header: "of which owner's own money", format: 'inr' }, { header: 'Entries', format: 'int' }],
    rows: [...heads.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([head, h]) => [head, h.amount, h.cash, h.owner, h.count]),
    totalRow: true,
  };

  // ---- 44AD comparison ----
  const deemed = cashTurnover * DEEMED_CASH + digitalTurnover * DEEMED_DIGITAL;
  const bookProfit = total.netProfit;
  const scheduleProfit = total.revenue - totalExpenses - taxDepreciation;
  const note44 = 'Section 44AD lets a small business declare at least 8% of cash turnover and 6% of digital turnover as profit without keeping full books. Declaring a lower profit than that needs full books of account and a tax audit (if total income is above the basic exemption limit), and can rule out 44AD for the next five years. Which way to file is the CA\'s decision.';
  const presumptiveSheet: SheetSpec = {
    name: '44AD vs book profit',
    title: `Section 44AD deemed profit next to book profit - ${fyName}`,
    notes: [note44, 'Digital receipts count at 6% only if received by bank/UPI by the return due date.'],
    columns: [{ header: 'Item', width: 60 }, { header: 'Amount', format: 'inr' }, { header: 'Notes', width: 60 }],
    rows: [
      ['Cash turnover', cashTurnover, ''],
      ['8% of cash turnover', cashTurnover * DEEMED_CASH, ''],
      ['Digital turnover', digitalTurnover, 'Counter Paytm/UPI/card + Zomato/Swiggy'],
      ['6% of digital turnover', digitalTurnover * DEEMED_DIGITAL, ''],
      ['Deemed profit under 44AD (at least)', deemed, ''],
      ['Book profit (app P&L)', bookProfit, 'Equipment spread over 36 months, the same profit as the Analytics screen'],
      ['Profit by the expense schedule', scheduleProfit, 'Turnover - expenses by head - tax depreciation'],
      ['Difference: 44AD deemed minus book profit', deemed - bookProfit, deemed > bookProfit ? 'Book profit is lower than 44AD - see the note' : 'Book profit is at or above 44AD'],
    ],
  };

  // ---- TDS notes ----
  const rentByMonth = windows.map((w) => ctx.data.fixedCosts.filter((x: any) => x.category === 'rent' && within(x.date, w.start, w.end)).reduce((t: number, x: any) => t + (x.amount || 0), 0));
  const maxRent = Math.max(0, ...rentByMonth);
  const topPay = Math.max(0, ...payByEmployee.values());
  const contractors = ctx.data.overheads.filter((x: any) => within(x.date, fy.start, fy.dataEnd) && ['labour_charge', 'professional_fees', 'transportation'].includes(canonicalCategory(x.category || ''))).reduce((t: number, x: any) => t + (x.amount || 0), 0);
  const tdsRows: CellValue[][] = [
    ['Rent (s.194-IB / 194-I)', maxRent, maxRent <= RENT_TDS_MONTHLY_LIMIT
      ? `Highest month ${inr(maxRent)} - below the ₹50,000 a month limit, so no TDS on rent.`
      : `A month went above ₹50,000 (${inr(maxRent)}) - ask the CA about TDS on rent.`],
    ['Salaries (s.192)', topPay, topPay <= BASIC_EXEMPTION
      ? `Highest yearly pay to one person is ${inr(topPay)} - below the basic exemption limit, so TDS on salary is very likely not needed.`
      : `One person was paid ${inr(topPay)} - ask the CA whether TDS on salary applies.`],
    ['Contractors and professionals (s.194C / 194J)', contractors, 'Labour, professional fees and transport for the year. TDS here is only needed if the accounts were audited last year - CA to confirm.'],
    ['Zomato/Swiggy TDS (s.194-O)', (total.zomatoRevenue + total.swiggyRevenue) * 0.001, 'The platforms deduct about 0.1% of online sales from payouts. Estimate shown - check Form 26AS/AIS and claim it in the return.'],
  ];
  const tdsSheet: SheetSpec = {
    name: 'TDS check',
    title: `TDS check notes - ${fyName}`,
    notes: ['Notes for the CA, not advice. Thresholds as in force for this year; the CA should confirm.'],
    columns: [{ header: 'Check', width: 40 }, { header: 'Amount', format: 'inr' }, { header: 'Note', width: 90 }],
    rows: tdsRows,
  };

  // ---- Owner's money ----
  const ownerBills = [...ctx.data.inventory, ...ctx.data.overheads, ...ctx.data.fixedCosts]
    .filter((x: any) => within(x.date, fy.start, fy.dataEnd) && x.paymentMethod === 'owner')
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  const ownerSheet: SheetSpec = {
    name: 'Owner money',
    title: `Bills the owner paid personally - ${fyName}`,
    notes: [
      'These are business costs paid with the owner\'s own money - usually treated as capital the owner put in (or a loan, if the owner says so).',
      'Money the owner put in directly (bank transfers into the business) is not recorded in the app - add it from the bank statement.',
    ],
    columns: [{ header: 'Date', format: 'date' }, { header: 'Where' }, { header: 'Category' }, { header: 'Item / description' }, { header: 'Amount', format: 'inr' }, { header: 'Record id' }],
    rows: ownerBills.map((x: any) => [x.date, entityLabel(ctx, x), expenseCategoryLabel(x.category || ''), x.itemName || x.description || '', ownerPart(x), x.id || '']),
    totalRow: true,
  };
  const ownerTotal = ownerBills.reduce((t: number, x: any) => t + ownerPart(x), 0);
  const loans = loansSheet(ctx);
  const loansOutstanding = loansAt(ctx, fy.dataEnd).reduce((t, l) => t + l.outstanding, 0);
  const loansReceived = ctx.data.loans.filter((l: any) => (l.status === 'active' || l.status === 'repaid') && within(l.loanDate?.slice(0, 10), fy.start, fy.dataEnd)).reduce((t: number, l: any) => t + (l.loanAmount || 0), 0);

  // ---- GST watch ----
  const elapsed = daysBetweenInclusive(fy.start, fy.dataEnd);
  const yearDays = daysBetweenInclusive(fy.start, fy.end);
  const projected = fy.partial && elapsed > 0 ? (total.revenue / elapsed) * yearDays : total.revenue;
  const gstStatus = (used: number) => used >= 1 ? 'Crossed - registration needed within 30 days (talk to the CA now)'
    : used >= 0.8 ? 'Close - talk to the CA' : used >= 0.6 ? 'Watch' : 'Comfortable';
  const gstSheet: SheetSpec = {
    name: 'GST watch',
    title: `Turnover against the ₹20 lakh GST registration limit - ${fyName}`,
    notes: [
      'Not GST-registered. Registration is needed once the year\'s total turnover (counter + Zomato/Swiggy, all places under one PAN) goes over ₹20 lakh.',
      fy.partial ? `At the current pace the full year would be about ${inr(projected)} (${pctText(projected / GST_THRESHOLD)} of the limit).` : `Full-year turnover: ${inr(total.revenue)}.`,
    ],
    columns: [{ header: 'Month' }, { header: 'Turnover', format: 'inr' }, { header: 'Year so far', format: 'inr' }, { header: 'Of the limit', format: 'pct' }, { header: 'Status' }],
    rows: turnoverRows.map((r) => [r[0], r[7], r[8], r[9], gstStatus(r[9] as number)]),
  };

  const sheets: SheetSpec[] = [
    readmeSheet(ctx, `Tax / CA pack - ${fyName}`, [
      ['Turnover by month', 'Cash and digital turnover each month, and the running total for the year'],
      ['44AD vs book profit', 'Deemed profit at 8% of cash and 6% of digital turnover, next to the app\'s book profit'],
      ['Expense schedule', 'Expenses by head for the year, with the part paid in cash or by the owner'],
      ['Depreciation (WDV)', 'Income Tax depreciation asset by asset, half rate where used under 180 days'],
      ['Depreciation by block', 'The same, by block'],
      ['TDS check', 'Rent, salaries, contractors and the platforms\' own TDS'],
      ['Owner money', 'Bills the owner paid personally'],
      ['Loans', 'Owner/investor loans at the end of the year'],
      ['GST watch', 'Running turnover against the ₹20 lakh registration limit'],
    ], [
      'This pack always covers the whole business (every store and production house), whatever is chosen on screen.',
      note44,
      'Everything here comes from what was logged in the app. Bank statements, any income outside the app and the CA\'s own adjustments are not included.',
    ]),
    turnoverSheet, presumptiveSheet, expenseSheet, depSheet, blockSheet, tdsSheet, ownerSheet, loans, gstSheet,
  ];

  // One page: headline figures, then compact tables side by side.
  const quarterRows = [0, 1, 2, 3].map((q) => {
    const rows = turnoverRows.slice(q * 3, q * 3 + 3);
    return [`Q${q + 1}`, rows.reduce((t, r) => t + (r[1] as number), 0), rows.reduce((t, r) => t + (r[6] as number), 0), rows.reduce((t, r) => t + (r[7] as number), 0)];
  }).filter((r) => (r[3] as number) > 0 || turnoverRows.length === 0);
  const smallTable = (headers: string[], rows: (string | number)[][], numericFrom = 1) =>
    `<div class="tbl"><table><thead><tr>${headers.map((h, i) => `<th${i >= numericFrom ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= numericFrom && typeof c === 'number' ? ' class="num"' : ''}>${escapeHtml(typeof c === 'number' ? inr(c) : c)}</td>`).join('')}</tr>`).join('')
    }</tbody></table></div>`;
  const gstUsed = total.revenue / GST_THRESHOLD;
  const html = printableDocument({
    title: `${BUSINESS_NAME} - tax summary for the CA`,
    subtitle: `${fyName} (${prettyDate(fy.start)} to ${prettyDate(fy.end)})${fy.partial ? `, up to ${prettyDate(fy.dataEnd)}` : ''}`,
    meta: ['Whole business, from the app\'s records. Not GST-registered.', `Generated ${ctx.generatedAt} by ${ctx.generatedBy}`],
    compact: true,
    sections: [
      {
        heading: 'Headline',
        html: cardsHtml([
          { label: 'Turnover', value: inr(total.revenue), sub: `Cash ${inr(cashTurnover)} · digital ${inr(digitalTurnover)}` },
          { label: '44AD deemed profit', value: inr(deemed), sub: '8% cash + 6% digital' },
          { label: 'Book profit', value: inr(bookProfit), sub: `Schedule basis ${inr(scheduleProfit)}` },
          { label: 'Tax depreciation', value: inr(taxDepreciation), sub: 'WDV, all blocks' },
          { label: 'GST limit used', value: pctText(gstUsed), sub: gstStatus(gstUsed) },
        ]),
      },
      {
        heading: 'Turnover, 44AD and expenses',
        html: `<div class="grid2"><div>${smallTable(['Quarter', 'Cash', 'Digital', 'Total'], quarterRows as (string | number)[][])}
          <p class="intro">${escapeHtml(note44)}</p></div>
          <div>${smallTable(['Head', 'Amount'], [...expenseSheet.rows.slice(0, 12).map((r) => [String(r[0]), round2(r[1] as number)]), ...(expenseSheet.rows.length > 12 ? [['Other heads', round2(expenseSheet.rows.slice(12).reduce((t, r) => t + (r[1] as number), 0))]] : []), ['Total expenses', round2(totalExpenses)]])}</div></div>`,
      },
      {
        heading: 'Depreciation, TDS, owner, GST',
        html: `<div class="grid2"><div>${smallTable(['Block', 'Opening', 'Added', 'Depreciation'], [...byBlock.entries()].map(([b, v]) => [b, v.opening, v.added, v.dep]))}
          ${smallTable(['Owner and loans', 'Amount'], [['Bills paid with owner\'s money', ownerTotal], ['Loans received this year', loansReceived], [`Loans outstanding at ${prettyDate(fy.dataEnd)}`, loansOutstanding]])}</div>
          <div><ul class="intro">${tdsRows.map((r) => `<li><b>${escapeHtml(String(r[0]))}:</b> ${escapeHtml(String(r[2]))}</li>`).join('')}</ul>
          <p class="intro"><b>GST:</b> ${escapeHtml(`${inr(total.revenue)} so far against the ₹20 lakh limit (${pctText(gstUsed)})${fy.partial ? `; on pace for about ${inr(projected)} this year` : ''}. ${gstStatus(fy.partial ? projected / GST_THRESHOLD : gstUsed)}.`)}</p></div></div>`,
      },
    ],
    footnotes: ['Prepared from the app for the CA. Full tables are in the matching workbook. Not tax advice.'],
  });
  return { sheets, html };
}
