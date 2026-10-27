import type { WorkBook, WorkSheet } from 'xlsx';

// The spreadsheet library (~420 KB) loads only when a settlement file is actually read, not
// with the screens that offer the upload. readWorkbook() fills this in, and every helper
// below runs only after it.
let XLSX: typeof import('xlsx');
import { extractSettlementPeriodFromText } from './settlementPeriod';

export type ParsedSettlementOrder = {
  orderId: string; // matches Ciferon's OrderList[].ExternalId for the join
  grossValue: number;
  netPayout: number;
  orderDate?: string;
  // Zomato-only, from the "Order Level" sheet's own discount/subtotal columns (Swiggy's
  // equivalent columns haven't been inspected yet - stay undefined for Swiggy until they
  // are). All optional so settlements uploaded before these were added keep working.
  itemSubtotal?: number;    // "Subtotal (items total)" - pre-discount, pre-GST dish total
  promoDiscount?: number;   // "Restaurant discount [Promo]"
  flatOffDiscount?: number; // "Restaurant discount [Flat offs, Freebies, Gold, Brand pack & others]"
  gstCollected?: number;    // "Total GST collected from customers"
  discountConstruct?: string; // the promo code itself, e.g. "SmartPromos TAKEOFF40ON149", or "NA"
};

export type ParsedSettlement = {
  aggregator: 'zomato' | 'swiggy';
  settlementDate: string; // YYYY-MM-DD
  periodStart?: string; // Sales/order period covered by this payout
  periodEnd?: string;
  bankUTR: string;
  grossSales: number;
  netPayout: number;
  netCommission: number;
  orderCount: number;
  // Per-order breakdown - lets a settlement be joined back to exactly which momo items
  // were in each order (via Ciferon's per-order item detail), instead of only knowing the
  // settlement's totals.
  orders: ParsedSettlementOrder[];
  // Ad spend for this settlement period, from the "Payout Breakup" sheet - Zomato's
  // "Investment in growth services" total, or Swiggy's "Unlimited Ads (Daily GMV %
  // Deduction)" line. Undefined if that sheet/row wasn't found (older report format).
  adSpend?: number;
  // Summed from the per-order fields above (Zomato only, see ParsedSettlementOrder) -
  // undefined whenever none of the underlying orders carried these fields, so callers can
  // tell "genuinely zero" apart from "not captured for this settlement".
  itemSubtotal?: number;
  promoDiscount?: number;
  flatOffDiscount?: number;
  totalDiscount?: number; // promoDiscount + flatOffDiscount, precomputed for convenience
  gstCollected?: number;
};

async function readWorkbook(file: File): Promise<WorkBook> {
  XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        resolve(XLSX.read(data, { type: 'binary', cellDates: true }));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

function findSheet(workbook: WorkBook, ...nameCandidates: string[]): WorkSheet | null {
  for (const candidate of nameCandidates) {
    const exact = workbook.SheetNames.find(n => n.trim().toLowerCase() === candidate.toLowerCase());
    if (exact) return workbook.Sheets[exact];
  }
  for (const candidate of nameCandidates) {
    const partial = workbook.SheetNames.find(n => n.toLowerCase().includes(candidate.toLowerCase()));
    if (partial) return workbook.Sheets[partial];
  }
  return null;
}

function sheetToRows(sheet: WorkSheet): any[][] {
  // These reports' worksheet XML often declares a used-range ("!ref", from the <dimension>
  // tag) that starts several rows below where the real content actually begins - the title
  // and header rows still physically exist as cells (A1, B7, etc.), but sheet_to_json only
  // walks the declared range, so it silently drops everything above it. Widening the range
  // to start at A1 (keeping the original end) before converting recovers those rows.
  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    range.s.r = 0;
    range.s.c = 0;
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][];
}

// Locates the header row by scanning the first N rows for a cell matching one of the
// given labels (case-insensitive, trimmed) - these reports have a few title/summary rows
// above the real column headers, and the exact row number isn't guaranteed stable across
// exports, so this searches instead of assuming a fixed row index.
function findHeaderRow(rows: any[][], ...labelCandidates: string[]): { rowIndex: number; colIndex: Record<string, number> } | null {
  const maxScan = Math.min(rows.length, 20);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const normalized = cell.trim().toLowerCase();
      if (labelCandidates.some(l => normalized === l.toLowerCase())) {
        const colIndex: Record<string, number> = {};
        row.forEach((h, i) => {
          if (typeof h === 'string' && h.trim()) {
            colIndex[h.trim().toLowerCase()] = i;
          }
        });
        return { rowIndex: r, colIndex };
      }
    }
  }
  return null;
}

// Finds a column index by trying each candidate label as an exact match first, then a
// substring match - column names vary slightly release to release (e.g. "Order level
// Payout" vs "Order Level Payout").
function findCol(colIndex: Record<string, number>, ...candidates: string[]): number | undefined {
  for (const c of candidates) {
    const exact = colIndex[c.toLowerCase()];
    if (exact !== undefined) return exact;
  }
  const keys = Object.keys(colIndex);
  for (const c of candidates) {
    const partial = keys.find(k => k.includes(c.toLowerCase()));
    if (partial) return colIndex[partial];
  }
  return undefined;
}

function toISODate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // "21 July" has no year - assume current year (settlement files are downloaded
    // shortly after the payout, so this holds in practice)
    const withYear = /\d{4}/.test(trimmed) ? trimmed : `${trimmed} ${new Date().getFullYear()}`;
    const parsed = new Date(withYear);
    if (!isNaN(parsed.getTime())) {
      // new Date(string) for a non-ISO text date like "11 Aug 2026" (Swiggy's Summary
      // sheet reports this as a loose label, not a real Excel date cell) is parsed as
      // LOCAL midnight, not UTC. Reading it back with toISOString() - which converts to
      // UTC first - silently shifts the date backward by a day in any positive-UTC-offset
      // timezone (e.g. IST, UTC+5:30): "11 Aug 2026" becomes "2026-08-10". Extracting with
      // the local getters instead recovers exactly the date the string actually said,
      // since that's the same local interpretation the constructor used going in.
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function toNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function addDateToRange(range: { start?: string; end?: string }, date: string | null) {
  if (!date) return;
  if (!range.start || date < range.start) range.start = date;
  if (!range.end || date > range.end) range.end = date;
}

function addDateToPeriodRange(range: { periodStart?: string; periodEnd?: string }, date: string | null) {
  if (!date) return;
  if (!range.periodStart || date < range.periodStart) range.periodStart = date;
  if (!range.periodEnd || date > range.periodEnd) range.periodEnd = date;
}

// Finds a "Label: Value" or "Label" | "Value" pair anywhere in a sheet of raw rows -
// used for Swiggy's Summary sheet, which reports settlement date/UTR/payout as loose
// labeled fields rather than a table.
function findLabeledValue(rows: any[][], label: string): any {
  const labelLower = label.toLowerCase();
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (typeof cell !== 'string') continue;
      const normalized = cell.trim().toLowerCase();
      if (normalized.startsWith(labelLower)) {
        const rest = cell.trim().substring(label.length).replace(/^[:\-\s]+/, '').trim();
        if (rest) return rest;
        // Value is in the next cell on the same row instead of inline
        for (let j = i + 1; j < row.length; j++) {
          if (row[j] !== null && row[j] !== '') return row[j];
        }
      }
    }
  }
  return null;
}

// Reads the "Payout Breakup" sheet (present in both aggregators' reports) and finds the
// "Total" column value of the row whose label contains the given substring - e.g. Zomato's
// "Investment in growth services" or Swiggy's "Unlimited Ads (Daily GMV % Deduction)". Both
// reports use the same header wording ("Delivered Orders" / "Total"), so one anchor label
// works for both. Returns the absolute value since these are always shown as a deduction
// (negative). Returns null if the sheet, header, or matching row isn't found.
function extractAdSpendFromPayoutBreakup(workbook: WorkBook, labelSubstring: string): number | null {
  const sheet = findSheet(workbook, 'Payout Breakup');
  if (!sheet) return null;
  const rows = sheetToRows(sheet);
  const header = findHeaderRow(rows, 'Delivered Orders');
  if (!header) return null;
  const totalCol = findCol(header.colIndex, 'total');
  if (totalCol === undefined) return null;

  const labelLower = labelSubstring.toLowerCase();
  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    if (row.some(cell => typeof cell === 'string' && cell.trim().toLowerCase().includes(labelLower))) {
      return Math.abs(toNumber(row[totalCol]));
    }
  }
  return null;
}

// Swiggy's "Growth Investment In Ads" section total row (matched above by
// extractAdSpendFromPayoutBreakup) isn't always present - some weekly reports print only
// the section's sub-lines ("Unlimited Ads (Daily GMV % Deduction)", "Ads Offers") with no
// consolidated total row at all. Confirmed by direct inspection of 3 real weekly files that
// all had real, non-zero ad spend on these sub-lines but no "Growth Investment In Ads" row -
// the section-total lookup silently returned null for all three, understating ad spend to
// zero and folding that money into Net Commission instead (the exact class of bug already
// fixed once this session for the section-total case). Falls back to summing every matching
// sub-line only when the total row itself isn't found, so a file that DOES have the total
// row is never double-counted by also summing its own sub-lines.
function extractSwiggyAdSpend(workbook: WorkBook): number | null {
  const total = extractAdSpendFromPayoutBreakup(workbook, 'growth investment in ads');
  if (total !== null) return total;

  const sheet = findSheet(workbook, 'Payout Breakup');
  if (!sheet) return null;
  const rows = sheetToRows(sheet);
  const header = findHeaderRow(rows, 'Delivered Orders');
  if (!header) return null;
  const totalCol = findCol(header.colIndex, 'total');
  if (totalCol === undefined) return null;

  const subLineLabels = ['unlimited ads', 'ads offers'];
  let sum = 0;
  let found = false;
  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    if (row.some(cell => typeof cell === 'string' && subLineLabels.some(l => cell.trim().toLowerCase().includes(l)))) {
      sum += Math.abs(toNumber(row[totalCol]));
      found = true;
    }
  }
  return found ? sum : null;
}

function rowText(row: any[]): string {
  return row
    .filter(cell => typeof cell === 'string' || typeof cell === 'number')
    .map(cell => String(cell).trim().toLowerCase())
    .join(' ');
}

// Zomato's "Payout Breakup" sheet computes "Investment in growth services" from formulas
// that reference external/broken links, so it always evaluates to 0 (or #REF!) regardless
// of the real spend - confirmed across multiple real settlement files, not a one-off
// corrupted export. The real figure lives in the "Addition Deductions Details" sheet,
// under the "A) Investments in growth services" section's "Total Ads & miscellaneous
// services" rows, "Total amount" column. Some reports repeat that total row once per
// day/section, so sum every matching row instead of returning the first one.
function extractZomatoAdSpend(workbook: WorkBook): number | null {
  const sheet = findSheet(workbook, 'Addition Deductions Details', 'Addition/Deductions Details');
  if (sheet) {
    const rows = sheetToRows(sheet);
    const header = findHeaderRow(rows, 'Total amount');
    if (header) {
      const totalCol = findCol(header.colIndex, 'total amount');
      if (totalCol !== undefined) {
        let total = 0;
        let matches = 0;
        for (let r = header.rowIndex + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row) continue;
          const text = rowText(row);
          const isAdsTotal =
            text.includes('total ads') ||
            text.includes('total ad ') ||
            text.includes('ads & miscellaneous') ||
            text.includes('ads and miscellaneous');
          if (isAdsTotal) {
            total += Math.abs(toNumber(row[totalCol]));
            matches += 1;
          }
        }
        if (matches > 0) return total;
      }
    }
  }

  const payoutBreakupTotal = extractAdSpendFromPayoutBreakup(workbook, 'investment in growth services');
  return payoutBreakupTotal && payoutBreakupTotal > 0 ? payoutBreakupTotal : null;
}

export async function parseZomatoSettlementFile(file: File): Promise<ParsedSettlement[]> {
  const workbook = await readWorkbook(file);
  const filePeriod = extractSettlementPeriodFromText(file.name);
  const sheet = findSheet(workbook, 'Order Level');
  if (!sheet) throw new Error('Could not find an "Order Level" sheet in this file - is this a Zomato settlement report?');

  const rows = sheetToRows(sheet);
  const header = findHeaderRow(rows, 'Order ID');
  if (!header) throw new Error('Could not find the column headers (looked for "Order ID") in the Order Level sheet');

  const orderIdCol = findCol(header.colIndex, 'order id');
  const settlementStatusCol = findCol(header.colIndex, 'settlement status');
  const settlementDateCol = findCol(header.colIndex, 'settlement date');
  const orderDateCol = findCol(header.colIndex, 'order date', 'order date time', 'order time', 'order placed time', 'order placed at', 'created at');
  const bankUtrCol = findCol(header.colIndex, 'bank utr', 'utr');
  const netOrderValueCol = findCol(header.colIndex, 'net order value');
  const payoutCol = findCol(header.colIndex, 'order level payout', 'order level  payout');
  // Discount/subtotal columns - all optional. Present in every real Zomato "Order Level"
  // export seen so far (confirmed against a real file), but guarded as optional so a future
  // Zomato format change that drops/renames one of these doesn't break the whole import -
  // only the settlement-level totals/netPayout/grossSales are load-bearing.
  const itemSubtotalCol = findCol(header.colIndex, 'subtotal (items total)', 'subtotal');
  const promoDiscountCol = findCol(header.colIndex, 'restaurant discount [promo]', 'discount [promo]');
  const flatOffDiscountCol = findCol(header.colIndex, 'restaurant discount [flat offs, freebies, gold, brand pack & others]', 'flat offs');
  const gstCollectedCol = findCol(header.colIndex, 'total gst collected from customers', 'total gst collected');
  const discountConstructCol = findCol(header.colIndex, 'discount construct');

  if (settlementDateCol === undefined || bankUtrCol === undefined || netOrderValueCol === undefined || payoutCol === undefined) {
    throw new Error('This file is missing one of the expected columns (Settlement date, Bank UTR, Net order value, Order level Payout) - the report format may have changed.');
  }

  type Group = {
    settlementDate: string; bankUTR: string; grossSales: number; netPayout: number; orderCount: number;
    orders: ParsedSettlementOrder[]; periodStart?: string; periodEnd?: string;
    itemSubtotal: number; promoDiscount: number; flatOffDiscount: number; gstCollected: number;
    hasDiscountFields: boolean; // true once any order in this group actually carried these columns
  };
  const groups = new Map<string, Group>();

  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || orderIdCol === undefined || !row[orderIdCol]) continue;

    if (settlementStatusCol !== undefined) {
      const status = String(row[settlementStatusCol] || '').trim().toLowerCase();
      if (status && !status.includes('settled')) continue;
    }

    const settlementDate = toISODate(row[settlementDateCol]);
    if (!settlementDate) continue;
    const bankUTR = String(row[bankUtrCol] || '').trim();
    const grossSales = toNumber(row[netOrderValueCol]);
    const netPayout = toNumber(row[payoutCol]);
    const orderId = String(row[orderIdCol]).trim();
    const orderDate = orderDateCol !== undefined ? toISODate(row[orderDateCol]) : null;

    const hasDiscountFieldsThisRow = itemSubtotalCol !== undefined;
    const itemSubtotal = itemSubtotalCol !== undefined ? toNumber(row[itemSubtotalCol]) : 0;
    const promoDiscount = promoDiscountCol !== undefined ? toNumber(row[promoDiscountCol]) : 0;
    const flatOffDiscount = flatOffDiscountCol !== undefined ? toNumber(row[flatOffDiscountCol]) : 0;
    const gstCollected = gstCollectedCol !== undefined ? toNumber(row[gstCollectedCol]) : 0;
    const discountConstructRaw = discountConstructCol !== undefined ? String(row[discountConstructCol] || '').trim() : '';
    const discountConstruct = discountConstructRaw && discountConstructRaw.toUpperCase() !== 'NA' ? discountConstructRaw : undefined;

    const orderEntry: ParsedSettlementOrder = {
      orderId, grossValue: grossSales, netPayout,
      ...(orderDate ? { orderDate } : {}),
      ...(hasDiscountFieldsThisRow ? { itemSubtotal, promoDiscount, flatOffDiscount, gstCollected } : {}),
      ...(discountConstruct ? { discountConstruct } : {}),
    };

    const key = `${settlementDate}|${bankUTR}`;
    const existing = groups.get(key);
    if (existing) {
      existing.grossSales += grossSales;
      existing.netPayout += netPayout;
      existing.orderCount += 1;
      existing.orders.push(orderEntry);
      existing.itemSubtotal += itemSubtotal;
      existing.promoDiscount += promoDiscount;
      existing.flatOffDiscount += flatOffDiscount;
      existing.gstCollected += gstCollected;
      existing.hasDiscountFields = existing.hasDiscountFields || hasDiscountFieldsThisRow;
      addDateToPeriodRange(existing, orderDate);
    } else {
      const group: Group = {
        settlementDate,
        bankUTR,
        grossSales,
        netPayout,
        orderCount: 1,
        orders: [orderEntry],
        itemSubtotal, promoDiscount, flatOffDiscount, gstCollected,
        hasDiscountFields: hasDiscountFieldsThisRow,
      };
      addDateToPeriodRange(group, orderDate);
      groups.set(key, group);
    }
  }

  if (groups.size === 0) {
    throw new Error('No settled orders with a settlement date were found in this file');
  }

  // The "Payout Breakup" sheet gives ONE ad-spend total for the whole file, but a single
  // Zomato file can produce multiple settlement groups (different settlement date/Bank UTR
  // pairs). Almost always there's exactly one group; on the rare file spanning several,
  // prorate the single total across groups by each group's share of gross sales so the
  // figures still sum to the real reported total.
  const adSpendTotal = extractZomatoAdSpend(workbook);
  const allGroups = Array.from(groups.values());
  const totalGrossAcrossGroups = allGroups.reduce((sum, g) => sum + g.grossSales, 0);

  return allGroups.map(g => {
    const adSpend = adSpendTotal === null ? undefined
      : allGroups.length === 1 ? adSpendTotal
      : totalGrossAcrossGroups > 0 ? adSpendTotal * (g.grossSales / totalGrossAcrossGroups)
      : 0;
    // g.netPayout here is the SUM of the "Order Level Payout" column - Zomato's own
    // per-order payout figure, which already has commission deducted but NOT ad spend
    // (that's a separate lump-sum line in "Payout Breakup", not allocated per order).
    // Confirmed bug: this used to be returned as-is and called `netPayout` everywhere
    // downstream (Paytm reconciliation, Analytics revenue) that assumes it's the real
    // money that landed in the bank - verified against a real settlement's own "Report
    // Summary" sheet, whose "Net Pay-out" is exactly this minus ad spend (₹3,065.90 order-
    // level sum − ₹348.10 ad spend = ₹2,717.80, matching the report's ₹2,717.81 to the
    // paisa). Subtracting it here, once, fixes every consumer at once instead of needing
    // each one individually corrected. netCommission is deliberately NOT reduced by ad
    // spend - the two are shown as separate line items (Settlement History), not merged.
    const netPayout = adSpend !== undefined ? g.netPayout - adSpend : g.netPayout;
    return {
    aggregator: 'zomato' as const,
    settlementDate: g.settlementDate,
    periodStart: filePeriod?.periodStart || g.periodStart,
    periodEnd: filePeriod?.periodEnd || g.periodEnd,
    bankUTR: g.bankUTR,
    grossSales: g.grossSales,
    netPayout,
    netCommission: g.grossSales - g.netPayout,
    orderCount: g.orderCount,
    orders: g.orders,
    adSpend,
    ...(g.hasDiscountFields ? {
      itemSubtotal: g.itemSubtotal,
      promoDiscount: g.promoDiscount,
      flatOffDiscount: g.flatOffDiscount,
      totalDiscount: g.promoDiscount + g.flatOffDiscount,
      gstCollected: g.gstCollected,
    } : {}),
    };
  });
}

export async function parseSwiggySettlementFile(file: File): Promise<ParsedSettlement[]> {
  const workbook = await readWorkbook(file);
  const filePeriod = extractSettlementPeriodFromText(file.name);
  const summarySheet = findSheet(workbook, 'Summary');
  const orderSheet = findSheet(workbook, 'Order Level');
  if (!summarySheet) throw new Error('Could not find a "Summary" sheet in this file - is this a Swiggy settlement report?');
  if (!orderSheet) throw new Error('Could not find an "Order Level" sheet in this file');

  const summaryRows = sheetToRows(summarySheet);
  const rawDate = findLabeledValue(summaryRows, 'Payout Settlement Date');
  const bankUTR = findLabeledValue(summaryRows, 'Bank UTR');
  const rawPayout = findLabeledValue(summaryRows, 'Total Payout');

  const settlementDate = toISODate(rawDate);
  if (!settlementDate) throw new Error('Could not find "Payout Settlement Date" in the Summary sheet');
  if (!rawPayout) throw new Error('Could not find "Total Payout" in the Summary sheet');
  const netPayout = toNumber(rawPayout);

  const orderRows = sheetToRows(orderSheet);
  const header = findHeaderRow(orderRows, 'Order ID');
  if (!header) throw new Error('Could not find the column headers (looked for "Order ID") in the Order Level sheet');

  const orderIdCol = findCol(header.colIndex, 'order id');
  const orderDateCol = findCol(header.colIndex, 'order date', 'order date time', 'order time', 'ordered time', 'order placed time', 'order placed at', 'created at');
  const totalCustomerPaidCol = findCol(header.colIndex, 'total customer paid');
  const netPayoutForOrderCol = findCol(header.colIndex, 'net payout for order');
  // Discount/subtotal columns - all optional, same guarded pattern as Zomato's Order Level
  // parsing (a format change dropping one of these shouldn't break the whole import).
  // Swiggy splits its restaurant-funded discount into two columns with no clean "Promo vs
  // Flat-off" equivalent to Zomato's - "Restaurant Discounts (Promo, Freebies, Flat Off,
  // etc.)" already bundles promo+flat-off together, and "Swiggy One Exclusive Offer
  // Discount" is a separate, unrelated subscription-driven discount. Mapped onto our
  // existing promoDiscount/flatOffDiscount fields anyway (so the Items Total/Discount/GST
  // cards and Payout % this session added for Zomato work for Swiggy too) but the split
  // itself doesn't mean the same thing per-aggregator - documented here, not surfaced as
  // if it were an apples-to-apples "Promo vs Flat-off" comparison across both platforms.
  const itemTotalCol = findCol(header.colIndex, 'item total');
  const restaurantDiscountCol = findCol(header.colIndex, 'restaurant discounts (promo, freebies, flat off, etc.)', 'restaurant discounts');
  const swiggyOneDiscountCol = findCol(header.colIndex, 'exclusive offer discount', 'swiggy one exclusive offer discount');
  const gstCollectedCol = findCol(header.colIndex, 'gst collected');
  if (orderIdCol === undefined || totalCustomerPaidCol === undefined) {
    throw new Error('This file is missing an expected column (Order ID or Total Customer Paid) - the report format may have changed.');
  }

  let grossSales = 0;
  let orderCount = 0;
  let itemSubtotalSum = 0;
  let promoDiscountSum = 0;
  let flatOffDiscountSum = 0;
  let gstCollectedSum = 0;
  let hasDiscountFields = false;
  const orders: ParsedSettlementOrder[] = [];
  const periodRange: { start?: string; end?: string } = {};
  for (let r = header.rowIndex + 1; r < orderRows.length; r++) {
    const row = orderRows[r];
    if (!row || !row[orderIdCol]) continue;
    const rowGross = toNumber(row[totalCustomerPaidCol]);
    const orderDate = orderDateCol !== undefined ? toISODate(row[orderDateCol]) : null;
    addDateToRange(periodRange, orderDate);
    grossSales += rowGross;
    orderCount += 1;

    const hasDiscountFieldsThisRow = itemTotalCol !== undefined;
    const itemSubtotal = itemTotalCol !== undefined ? toNumber(row[itemTotalCol]) : 0;
    const promoDiscount = restaurantDiscountCol !== undefined ? toNumber(row[restaurantDiscountCol]) : 0;
    const flatOffDiscount = swiggyOneDiscountCol !== undefined ? toNumber(row[swiggyOneDiscountCol]) : 0;
    const gstCollected = gstCollectedCol !== undefined ? toNumber(row[gstCollectedCol]) : 0;
    if (hasDiscountFieldsThisRow) {
      hasDiscountFields = true;
      itemSubtotalSum += itemSubtotal;
      promoDiscountSum += promoDiscount;
      flatOffDiscountSum += flatOffDiscount;
      gstCollectedSum += gstCollected;
    }

    orders.push({
      orderId: String(row[orderIdCol]).trim(),
      grossValue: rowGross,
      netPayout: netPayoutForOrderCol !== undefined ? toNumber(row[netPayoutForOrderCol]) : 0,
      ...(orderDate ? { orderDate } : {}),
      ...(hasDiscountFieldsThisRow ? { itemSubtotal, promoDiscount, flatOffDiscount, gstCollected } : {}),
    });
  }

  if (orderCount === 0) {
    throw new Error('No orders were found in the Order Level sheet');
  }

  // Confirmed bug: this used to search only for the "Unlimited Ads (Daily GMV %
  // Deduction)" line, missing the separate "Ads Offers" line that sits under the same
  // "Growth Investment In Ads" section - understating real ad spend by that amount.
  // Matching the section's own total row instead captures both in one read, same as
  // Zomato's own ad-spend extraction sums every matching line rather than trusting one.
  const adSpend = extractSwiggyAdSpend(workbook);

  // Confirmed bug: unlike Zomato's per-order "Order Level Payout" (which excludes ad
  // spend, needing it subtracted separately), Swiggy's Summary "Total Payout" already has
  // ad spend deducted (verified: Payout Breakup's own "Net Payout [A+B+C+D+E+F]" total,
  // where D is the ads line, matches Summary's "Total Payout" exactly). Computing
  // netCommission as grossSales - netPayout would therefore silently bundle ad spend into
  // "commission" while ALSO showing it as its own Ad Spend line - double-counting it
  // between the two. Adding adSpend back removes it from commission so the two stay
  // additive: grossSales = netCommission + adSpend + netPayout, same invariant Zomato's
  // own fix already established.
  const netCommission = grossSales - netPayout - (adSpend || 0);

  return [{
    aggregator: 'swiggy',
    settlementDate,
    periodStart: filePeriod?.periodStart || periodRange.start,
    periodEnd: filePeriod?.periodEnd || periodRange.end,
    bankUTR: String(bankUTR || '').trim(),
    grossSales,
    netPayout,
    netCommission,
    orderCount,
    orders,
    adSpend: adSpend === null ? undefined : adSpend,
    ...(hasDiscountFields ? {
      itemSubtotal: itemSubtotalSum,
      promoDiscount: promoDiscountSum,
      flatOffDiscount: flatOffDiscountSum,
      totalDiscount: promoDiscountSum + flatOffDiscountSum,
      gstCollected: gstCollectedSum,
    } : {}),
  }];
}
