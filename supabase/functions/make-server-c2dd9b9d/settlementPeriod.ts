// Copy of src/utils/settlementPeriod.ts for the edge function (it can't import from src/).
// Keep both in step.
export type SettlementPeriodSource = {
  settlementDate: string;
  periodStart?: string;
  periodEnd?: string;
  sourceFileName?: string;
  orders?: { orderDate?: string }[];
};

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const toYear = (year: string) => year.length === 2 ? `20${year}` : year;
const padDay = (day: string) => day.padStart(2, '0');
const monthNumber = (month: string) => MONTHS[month.toLowerCase().replace(/[^a-z]/g, '')];

function normalizeRange(start: string, end: string) {
  return start <= end ? { periodStart: start, periodEnd: end } : { periodStart: end, periodEnd: start };
}

function normalizePeriod(start: string, end: string) {
  const normalized = normalizeRange(start, end);
  return { start: normalized.periodStart, end: normalized.periodEnd };
}

function looseDateToISO(token: string): string | null {
  const cleaned = token.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/[_.]+/g, ' ');

  const iso = cleaned.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const dayMonth = cleaned.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s*,?\s*(20\d{2}|\d{2})\b/i);
  if (dayMonth) {
    const month = monthNumber(dayMonth[2]);
    if (month) return `${toYear(dayMonth[3])}-${month}-${padDay(dayMonth[1])}`;
  }

  const monthDay = cleaned.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})\s*,?\s*(20\d{2}|\d{2})\b/i);
  if (monthDay) {
    const month = monthNumber(monthDay[1]);
    if (month) return `${toYear(monthDay[3])}-${month}-${padDay(monthDay[2])}`;
  }

  return null;
}

export function extractSettlementPeriodFromText(text?: string): { periodStart: string; periodEnd: string } | null {
  if (!text) return null;
  const normalized = text.replace(/[_]+/g, ' ').replace(/\s+/g, ' ');

  // Handles compact report names like "29 to 31 Jul 2026" or "29-31 Jul 2026".
  const sameMonth = normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|till|through|-|–|—)\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s*,?\s*(20\d{2}|\d{2})\b/i);
  if (sameMonth) {
    const month = monthNumber(sameMonth[3]);
    if (month) {
      return normalizeRange(
        `${toYear(sameMonth[4])}-${month}-${padDay(sameMonth[1])}`,
        `${toYear(sameMonth[4])}-${month}-${padDay(sameMonth[2])}`
      );
    }
  }

  const tokens: { iso: string; start: number; end: number }[] = [];
  const datePattern = /\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}(?:st|nd|rd|th)?[\s._-]+[A-Za-z]{3,9}[\s._,-]+(?:20\d{2}|\d{2})|[A-Za-z]{3,9}[\s._-]+\d{1,2}(?:st|nd|rd|th)?[\s._,-]+(?:20\d{2}|\d{2}))\b/gi;
  for (const match of normalized.matchAll(datePattern)) {
    const iso = looseDateToISO(match[0]);
    if (iso) tokens.push({ iso, start: match.index || 0, end: (match.index || 0) + match[0].length });
  }

  if (tokens.length < 2) return null;

  // Pick the closest pair of date tokens. In filenames, the report range is usually the
  // adjacent pair even if the payout date also appears elsewhere in the name.
  let best: { start: string; end: string; gap: number } | null = null;
  for (let i = 0; i < tokens.length - 1; i++) {
    const gap = tokens[i + 1].start - tokens[i].end;
    if (!best || gap < best.gap) best = { start: tokens[i].iso, end: tokens[i + 1].iso, gap };
  }
  return best ? normalizeRange(best.start, best.end) : null;
}

export function getSettlementPeriod(settlement: SettlementPeriodSource): { start: string; end: string } {
  if (settlement.periodStart && settlement.periodEnd) {
    return normalizePeriod(settlement.periodStart, settlement.periodEnd);
  }

  const orderDates = (settlement.orders || []).map(order => order.orderDate).filter((date): date is string => !!date);
  if (orderDates.length) {
    const start = orderDates.reduce((min, date) => date < min ? date : min, orderDates[0]);
    const end = orderDates.reduce((max, date) => date > max ? date : max, orderDates[0]);
    return normalizePeriod(start, end);
  }

  const filePeriod = extractSettlementPeriodFromText(settlement.sourceFileName);
  if (filePeriod) return { start: filePeriod.periodStart, end: filePeriod.periodEnd };

  if (settlement.periodStart || settlement.periodEnd) {
    const onlyDate = settlement.periodStart || settlement.periodEnd || settlement.settlementDate;
    return normalizePeriod(onlyDate, onlyDate);
  }

  return { start: settlement.settlementDate, end: settlement.settlementDate };
}

export function settlementOverlapsPeriod(settlement: SettlementPeriodSource, start: string, end: string) {
  const period = getSettlementPeriod(settlement);
  return period.start <= end && period.end >= start;
}
