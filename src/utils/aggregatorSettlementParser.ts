import * as XLSX from 'xlsx';

export type ParsedSettlement = {
  aggregator: 'zomato' | 'swiggy';
  settlementDate: string; // YYYY-MM-DD
  bankUTR: string;
  grossSales: number;
  netPayout: number;
  netCommission: number;
  orderCount: number;
};

function readWorkbook(file: File): Promise<XLSX.WorkBook> {
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

function findSheet(workbook: XLSX.WorkBook, ...nameCandidates: string[]): XLSX.WorkSheet | null {
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

function sheetToRows(sheet: XLSX.WorkSheet): any[][] {
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
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
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

export async function parseZomatoSettlementFile(file: File): Promise<ParsedSettlement[]> {
  const workbook = await readWorkbook(file);
  const sheet = findSheet(workbook, 'Order Level');
  if (!sheet) throw new Error('Could not find an "Order Level" sheet in this file - is this a Zomato settlement report?');

  const rows = sheetToRows(sheet);
  const header = findHeaderRow(rows, 'Order ID');
  if (!header) throw new Error('Could not find the column headers (looked for "Order ID") in the Order Level sheet');

  const orderIdCol = findCol(header.colIndex, 'order id');
  const settlementStatusCol = findCol(header.colIndex, 'settlement status');
  const settlementDateCol = findCol(header.colIndex, 'settlement date');
  const bankUtrCol = findCol(header.colIndex, 'bank utr', 'utr');
  const netOrderValueCol = findCol(header.colIndex, 'net order value');
  const payoutCol = findCol(header.colIndex, 'order level payout', 'order level  payout');

  if (settlementDateCol === undefined || bankUtrCol === undefined || netOrderValueCol === undefined || payoutCol === undefined) {
    throw new Error('This file is missing one of the expected columns (Settlement date, Bank UTR, Net order value, Order level Payout) - the report format may have changed.');
  }

  type Group = { settlementDate: string; bankUTR: string; grossSales: number; netPayout: number; orderCount: number };
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

    const key = `${settlementDate}|${bankUTR}`;
    const existing = groups.get(key);
    if (existing) {
      existing.grossSales += grossSales;
      existing.netPayout += netPayout;
      existing.orderCount += 1;
    } else {
      groups.set(key, { settlementDate, bankUTR, grossSales, netPayout, orderCount: 1 });
    }
  }

  if (groups.size === 0) {
    throw new Error('No settled orders with a settlement date were found in this file');
  }

  return Array.from(groups.values()).map(g => ({
    aggregator: 'zomato' as const,
    settlementDate: g.settlementDate,
    bankUTR: g.bankUTR,
    grossSales: g.grossSales,
    netPayout: g.netPayout,
    netCommission: g.grossSales - g.netPayout,
    orderCount: g.orderCount,
  }));
}

export async function parseSwiggySettlementFile(file: File): Promise<ParsedSettlement[]> {
  const workbook = await readWorkbook(file);
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
  const totalCustomerPaidCol = findCol(header.colIndex, 'total customer paid');
  if (orderIdCol === undefined || totalCustomerPaidCol === undefined) {
    throw new Error('This file is missing an expected column (Order ID or Total Customer Paid) - the report format may have changed.');
  }

  let grossSales = 0;
  let orderCount = 0;
  for (let r = header.rowIndex + 1; r < orderRows.length; r++) {
    const row = orderRows[r];
    if (!row || !row[orderIdCol]) continue;
    grossSales += toNumber(row[totalCustomerPaidCol]);
    orderCount += 1;
  }

  if (orderCount === 0) {
    throw new Error('No orders were found in the Order Level sheet');
  }

  return [{
    aggregator: 'swiggy',
    settlementDate,
    bankUTR: String(bankUTR || '').trim(),
    grossSales,
    netPayout,
    netCommission: grossSales - netPayout,
    orderCount,
  }];
}
