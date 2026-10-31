// What doesn't agree between a bill photo's reading and the expense it is on (billCheck.ts reads the
// photo; this part is plain rules, tested in billCheck.test.ts).
export type BillReading = {
  isBill: boolean;
  total: number | null;
  date: string | null;
  seller: string | null;
  items: string;
  matchesEntry: boolean;
  why: string;
};
export type BillEntry = { amount: number; date: string; what: string; category?: string };
export type BillProblem = { kind: string; title: string; message: string };
export type BillUse = { expenseId: string; date: string; what: string; amount: number };

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayGap = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/** How far apart the bill and the entry may be: ₹10, or 3% of the amount. */
export const amountTolerance = (amount: number) => Math.max(10, amount * 0.03);
/** A bill dated more than this many days before or after the entry's day. */
export const DATE_DAYS = 3;

/** What doesn't agree between the bill and the entry. */
export function billProblems(entry: BillEntry, r: BillReading, usedBefore: BillUse | null = null): BillProblem[] {
  const out: BillProblem[] = [];
  if (usedBefore) {
    out.push({ kind: 'bill_reused', title: 'Same bill on another entry', message: `This bill is already on ${usedBefore.what} · ${rupees(usedBefore.amount)} (${shortDate(usedBefore.date)}). One bill, one entry: delete the extra one, or add this purchase's own bill.` });
  }
  if (!r.isBill) {
    out.push({ kind: 'bill_not_bill', title: "The photo isn't a bill", message: `${r.why || 'Bunny could not find a bill in the photo.'} Take a clear photo of the bill.` });
    return out;
  }
  if (r.total !== null && Number.isFinite(r.total) && r.total > 0 && Math.abs(r.total - entry.amount) > amountTolerance(entry.amount)) {
    const more = r.total > entry.amount;
    out.push({
      kind: 'bill_amount', title: more ? 'The bill is for more' : 'The bill is for less',
      message: `The bill says ${rupees(r.total)}${r.seller ? ` (${r.seller})` : ''}; the entry says ${rupees(entry.amount)}. ${more ? 'Was part of it paid separately, or is the entry short?' : 'Fix the amount if it was a typing slip.'}`,
    });
  }
  if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
    const gap = dayGap(entry.date, r.date);
    if (Math.abs(gap) > DATE_DAYS) {
      out.push({
        kind: 'bill_date', title: gap > 0 ? 'An old bill?' : 'The bill is dated later',
        message: `The bill is dated ${shortDate(r.date)}; the entry is for ${shortDate(entry.date)}${gap > 0 ? ` (${gap} days later)` : ''}. ${gap > 0 ? 'If it was bought then, log it on that day.' : 'Check the entry date.'}`,
      });
    }
  }
  if (!r.matchesEntry) {
    out.push({ kind: 'bill_item', title: 'The bill is for something else', message: `The bill is for ${r.items || 'other things'}; the entry says ${entry.what}. ${r.why || ''}`.trim() });
  }
  return out;
}

