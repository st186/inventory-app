// Report periods for the exports: a month, an Indian financial-year quarter, a financial year
// (April to March) or any custom range. Everything is plain IST calendar-date strings
// (YYYY-MM-DD) - no Date objects in local time, which shift a day around midnight IST.
// A period that runs past today is "partial": its data stops at today.

import { getTodayIST, addDays, getNowIST } from './timezone';
import { monthAdd } from './salaryBreakdown';

export type PeriodKind = 'month' | 'quarter' | 'fy' | 'custom';

export type ReportPeriod = {
  kind: PeriodKind;
  start: string;
  end: string; // the period's last day, even if that is after today
  dataEnd: string; // the last day there can be data for: end, or today if the period is still running
  partial: boolean;
  label: string; // "October 2026", "Q3 FY 2026-27 (Oct-Dec 2026)", "FY 2026-27", "1 Oct 2026 to 15 Oct 2026"
  fileLabel: string; // safe for a file name: "2026-10", "FY2026-27_Q3", "FY2026-27", "2026-10-01_to_2026-10-15"
  fyStartYear: number; // the financial year the period ends in (2026 = FY 2026-27)
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

export const lastDayOf = (ym: string) => addDays(`${monthAdd(ym, 1)}-01`, -1);

export const monthName = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const shortMonthName = (ym: string) => `${SHORT_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
export const prettyDate = (d: string) => `${Number(d.slice(8, 10))} ${SHORT_MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

// April starts the financial year: 2026-03-31 is FY 2025-26, 2026-04-01 is FY 2026-27.
export const fyStartYearOf = (date: string) => {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? y : y - 1;
};
export const fyLabel = (fyStartYear: number) => `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;

// Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar.
export const quarterOf = (date: string): { fyStartYear: number; quarter: 1 | 2 | 3 | 4 } => {
  const m = Number(date.slice(5, 7));
  return { fyStartYear: fyStartYearOf(date), quarter: (m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4) as 1 | 2 | 3 | 4 };
};

export const daysBetweenInclusive = (start: string, end: string) => {
  const n = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day) / 86400000;
  };
  return start > end ? 0 : n(end) - n(start) + 1;
};

// Every YYYY-MM the range touches.
export function monthsInRange(start: string, end: string): string[] {
  const months: string[] = [];
  for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = monthAdd(m, 1)) months.push(m);
  return months;
}

export function datesInRange(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

function make(kind: PeriodKind, start: string, end: string, label: string, fileLabel: string, today: string): ReportPeriod {
  const dataEnd = end > today ? today : end;
  return { kind, start, end, dataEnd, partial: end > today, label, fileLabel, fyStartYear: fyStartYearOf(end) };
}

export function monthPeriod(ym: string, today = getTodayIST()): ReportPeriod {
  return make('month', `${ym}-01`, lastDayOf(ym), monthName(ym), ym, today);
}

export function quarterPeriod(fyStartYear: number, quarter: 1 | 2 | 3 | 4, today = getTodayIST()): ReportPeriod {
  const firstMonth = monthAdd(`${fyStartYear}-04`, (quarter - 1) * 3);
  const lastMonth = monthAdd(firstMonth, 2);
  const span = `${SHORT_MONTHS[Number(firstMonth.slice(5, 7)) - 1]}-${SHORT_MONTHS[Number(lastMonth.slice(5, 7)) - 1]} ${lastMonth.slice(0, 4)}`;
  return make('quarter', `${firstMonth}-01`, lastDayOf(lastMonth), `Q${quarter} ${fyLabel(fyStartYear)} (${span})`, `${fyLabel(fyStartYear).replace(' ', '')}_Q${quarter}`, today);
}

export function financialYearPeriod(fyStartYear: number, today = getTodayIST()): ReportPeriod {
  return make('fy', `${fyStartYear}-04-01`, `${fyStartYear + 1}-03-31`, fyLabel(fyStartYear), fyLabel(fyStartYear).replace(' ', ''), today);
}

export function customPeriod(start: string, end: string, today = getTodayIST()): ReportPeriod {
  const [a, b] = start <= end ? [start, end] : [end, start];
  const label = a === b ? prettyDate(a) : `${prettyDate(a)} to ${prettyDate(b)}`;
  return make('custom', a, b, label, a === b ? a : `${a}_to_${b}`, today);
}

// The period to compare against: the previous month / quarter / year, or the same number of
// days just before a custom range. A period still running is compared with the same number of
// days of the previous one (1-27 Oct against 1-27 Sep), not with a whole month.
export function previousPeriod(p: ReportPeriod, today = getTodayIST()): ReportPeriod {
  const elapsed = daysBetweenInclusive(p.start, p.dataEnd);
  let prev: ReportPeriod;
  if (p.kind === 'month') prev = monthPeriod(monthAdd(p.start.slice(0, 7), -1), today);
  else if (p.kind === 'quarter') {
    const { fyStartYear, quarter } = quarterOf(addDays(p.start, -1));
    prev = quarterPeriod(fyStartYear, quarter, today);
  } else if (p.kind === 'fy') prev = financialYearPeriod(p.fyStartYear - 1, today);
  else {
    const prevEnd = addDays(p.start, -1);
    return customPeriod(addDays(prevEnd, -(elapsed - 1)), prevEnd, today);
  }
  if (!p.partial) return prev;
  const trimmedEnd = addDays(prev.start, elapsed - 1);
  if (trimmedEnd >= prev.end) return prev;
  return { ...customPeriod(prev.start, trimmedEnd, today), kind: prev.kind, label: `${prev.label}, first ${elapsed} days` };
}

// "27 Oct 2026, 3:49 PM IST" - when a report was made.
export function generatedAtIST(): string {
  const now = getNowIST(); // IST wall-clock time written as an ISO string
  const hours = Number(now.slice(11, 13));
  const minutes = now.slice(14, 16);
  return `${prettyDate(now.slice(0, 10))}, ${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'} IST`;
}
