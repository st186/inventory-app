// One description of a table (SheetSpec) that every export format is written from: a real
// .xlsx workbook (numbers stay numbers), a CSV that Excel opens cleanly, and printable HTML
// the person can "Print -> Save as PDF" from their phone.

export type CellValue = string | number | null | undefined;
export type ColumnFormat = 'text' | 'date' | 'inr' | 'int' | 'qty' | 'pct';
export type Column = { header: string; format?: ColumnFormat; width?: number };

export type SheetSpec = {
  name: string; // the workbook tab - Excel allows 31 characters
  title?: string;
  notes?: string[];
  columns: Column[];
  rows: CellValue[][];
  totalRow?: boolean; // adds a Total row summing the money and count columns
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv;charset=utf-8';
export const HTML_MIME = 'text/html;charset=utf-8';

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const isNumeric = (f?: ColumnFormat) => f === 'inr' || f === 'int' || f === 'qty' || f === 'pct';
const summable = (f?: ColumnFormat) => f === 'inr' || f === 'int';

function withTotal(sheet: SheetSpec): CellValue[][] {
  if (!sheet.totalRow || sheet.rows.length === 0) return sheet.rows;
  const total: CellValue[] = sheet.columns.map((c, i) => {
    if (i === 0) return 'Total';
    if (!summable(c.format)) return '';
    return round2(sheet.rows.reduce((t, r) => t + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0));
  });
  return [...sheet.rows, total];
}

const XLSX_FORMATS: Record<string, string> = { inr: '#,##0.00', int: '#,##0', qty: '#,##0.###', pct: '0.0%' };

// .xlsx, one tab per sheet. The library is only loaded when someone actually downloads.
export async function workbookBlob(sheets: SheetSpec[]): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const top: CellValue[][] = [];
    if (sheet.title) top.push([sheet.title]);
    (sheet.notes || []).forEach((n) => top.push([n]));
    if (top.length) top.push([]);
    const headerRow = top.length;
    const body = withTotal(sheet).map((row) => sheet.columns.map((c, i) => {
      const v = row[i];
      if (v === null || v === undefined || v === '') return null;
      if (isNumeric(c.format) && typeof v === 'number') return c.format === 'pct' ? Math.round(v * 10000) / 10000 : round2(v);
      return v;
    }));
    const aoa = [...top, sheet.columns.map((c) => c.header), ...body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    sheet.columns.forEach((c, ci) => {
      const z = c.format ? XLSX_FORMATS[c.format] : undefined;
      if (!z) return;
      for (let r = 0; r < body.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRow + 1 + r, c: ci })];
        if (cell && cell.t === 'n') cell.z = z;
      }
    });
    ws['!cols'] = sheet.columns.map((c, ci) => ({
      wch: c.width || Math.min(48, Math.max(10, c.header.length + 2, ...body.slice(0, 200).map((r) => String(r[ci] ?? '').length + 2))),
    }));
    // Filter buttons on the header, covering the data rows but not the Total row.
    const dataRows = sheet.totalRow && sheet.rows.length > 0 ? body.length - 1 : body.length;
    if (dataRows > 0) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + dataRows, c: sheet.columns.length - 1 } }) };
    }
    let name = sheet.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${sheet.name.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: XLSX_MIME });
}

// A text cell for CSV: quoted when it has a comma, quote or line break (quotes doubled), and a
// leading = + - @ neutralised so Excel doesn't run a typed description as a formula.
function csvText(s: string): string {
  let v = s;
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvCell(v: CellValue, f?: ColumnFormat): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(f === 'pct' ? Math.round(v * 1000) / 10 : round2(v));
  return csvText(String(v));
}

// Every sheet one after another, each with its name, header row and a blank line between.
// Amounts are plain numbers (no ₹, no thousands commas) so Excel adds them up; the UTF-8 BOM
// makes Excel read ₹ and Bengali item names correctly.
export function csvBlob(sheets: SheetSpec[]): Blob {
  const lines: string[] = [];
  for (const sheet of sheets) {
    lines.push(csvText(sheet.title || sheet.name));
    (sheet.notes || []).forEach((n) => lines.push(csvText(n)));
    lines.push(sheet.columns.map((c) => csvText(c.format === 'pct' && !c.header.includes('%') ? `${c.header} (%)` : c.header)).join(','));
    withTotal(sheet).forEach((row) => lines.push(sheet.columns.map((c, i) => csvCell(row[i], c.format)).join(',')));
    lines.push('');
  }
  return new Blob(['﻿' + lines.join('\r\n')], { type: CSV_MIME });
}

export const escapeHtml = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
export const pctText = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

function htmlCell(v: CellValue, f?: ColumnFormat): string {
  if (v === null || v === undefined || v === '') return '<td></td>';
  if (typeof v === 'number') {
    const text = f === 'inr' ? inr(v) : f === 'pct' ? pctText(v) : f === 'int' ? Math.round(v).toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
    return `<td class="num${v < 0 ? ' neg' : ''}">${escapeHtml(text)}</td>`;
  }
  return `<td>${escapeHtml(v)}</td>`;
}

// A sheet as an HTML table. maxRows keeps a printable report readable; the full list stays in
// the workbook.
export function sheetTable(sheet: SheetSpec, opts: { maxRows?: number } = {}): string {
  const rows = withTotal(sheet);
  const shown = opts.maxRows && rows.length > opts.maxRows ? rows.slice(0, opts.maxRows) : rows;
  const more = rows.length - shown.length;
  const head = sheet.columns.map((c) => `<th${isNumeric(c.format) ? ' class="num"' : ''}>${escapeHtml(c.header)}</th>`).join('');
  const body = shown.map((r, ri) => {
    const isTotal = sheet.totalRow && ri === rows.length - 1;
    return `<tr${isTotal ? ' class="total"' : ''}>${sheet.columns.map((c, i) => htmlCell(r[i], c.format)).join('')}</tr>`;
  }).join('');
  const empty = rows.length === 0 ? `<tr><td colspan="${sheet.columns.length}" class="muted">Nothing in this period.</td></tr>` : '';
  return `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}${empty}</tbody></table></div>`
    + (more > 0 ? `<p class="muted">${more} more row${more === 1 ? '' : 's'} in the workbook.</p>` : '');
}

export type PrintSection = { heading: string; intro?: string; html: string; pageBreakBefore?: boolean };

// A self-contained page that reads on a phone and prints cleanly to A4 ("Print -> Save as PDF").
export function printableDocument(opts: {
  title: string;
  subtitle?: string;
  meta: string[];
  sections: PrintSection[];
  footnotes?: string[];
  landscape?: boolean;
  compact?: boolean; // one-page summaries
}): string {
  const sections = opts.sections.map((s) => `
    <section${s.pageBreakBefore ? ' class="break"' : ''}>
      <h2>${escapeHtml(s.heading)}</h2>
      ${s.intro ? `<p class="intro">${escapeHtml(s.intro)}</p>` : ''}
      ${s.html}
    </section>`).join('');
  const notes = (opts.footnotes || []).length
    ? `<section class="notes"><h2>Notes</h2><ul>${opts.footnotes!.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif; color: #1f2937; background: #fff; font-size: ${opts.compact ? '12px' : '14px'}; line-height: 1.45; }
  header { border-bottom: 2px solid #ea580c; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: ${opts.compact ? '18px' : '22px'}; margin: 0 0 4px; }
  h2 { font-size: ${opts.compact ? '13px' : '16px'}; margin: ${opts.compact ? '10px' : '20px'} 0 6px; color: #9a3412; }
  .sub { color: #4b5563; margin: 0; }
  .meta { color: #6b7280; font-size: 12px; margin: 4px 0 0; }
  .intro, .muted { color: #6b7280; font-size: 12px; margin: 4px 0; }
  .tbl { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { border-collapse: collapse; width: 100%; font-size: ${opts.compact ? '11px' : '12.5px'}; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: ${opts.compact ? '3px 6px' : '6px 8px'}; text-align: left; vertical-align: top; }
  th { background: #fff7ed; color: #7c2d12; font-weight: 600; white-space: nowrap; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.neg { color: #b91c1c; }
  tr.total td, tr.strong td { font-weight: 700; border-top: 2px solid #9ca3af; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; }
  .card .k { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  .card .v { font-size: ${opts.compact ? '15px' : '18px'}; font-weight: 700; font-variant-numeric: tabular-nums; }
  .card .s { color: #6b7280; font-size: 11px; }
  .warn { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 8px 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr; gap: 4px 14px; }
  .grid2 > div { min-width: 0; }
  @media (min-width: 720px) { .grid2 { grid-template-columns: 1fr 1fr; } }
  .notes ul { padding-left: 18px; margin: 4px 0; color: #4b5563; font-size: 12px; }
  .printbar { position: sticky; top: 0; background: #fff; padding: 8px 0; margin-bottom: 8px; }
  .printbar button { background: #ea580c; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font-size: 15px; }
  @media print {
    @page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: ${opts.compact ? '10mm' : '12mm'}; }
    body { padding: 0; }
    .printbar { display: none; }
    .tbl { overflow: visible; }
    .grid2 { grid-template-columns: 1fr 1fr; }
    section.break { page-break-before: always; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="printbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<header>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
  ${opts.meta.map((m) => `<p class="meta">${escapeHtml(m)}</p>`).join('')}
</header>
${sections}
${notes}
</body>
</html>`;
}

export const htmlBlob = (html: string) => new Blob([html], { type: HTML_MIME });

// Small headline figures for the top of a printable report.
export function cardsHtml(cards: { label: string; value: string; sub?: string }[]): string {
  return `<div class="cards">${cards.map((c) => `<div class="card"><div class="k">${escapeHtml(c.label)}</div><div class="v">${escapeHtml(c.value)}</div>${c.sub ? `<div class="s">${escapeHtml(c.sub)}</div>` : ''}</div>`).join('')}</div>`;
}
