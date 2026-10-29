// The rules behind payslips and the monthly performance notes (owner, 29 Oct 2026), kept apart
// from the routes (performance.ts) so they can be tested with plain node:
//   node supabase/functions/make-server-c2dd9b9d/payslipRules.test.ts
//
// The money rules are the app's (src/utils/payslip.ts, src/components/team/payrollMath.ts):
// a payout counts for the month it is for (forMonth, else the month it was paid); a salary part
// with a start month is paid from then; net = transfers - personal expenses. Keep them the same.

export type SalaryPart = { label: string; amount: number; fromMonth?: string };
export type PayoutRow = {
  id?: string; employeeId?: string; date: string; amount: number; forMonth?: string;
  variablePay?: number; bonus?: number; advanceDeduction?: number; paidFrom?: string; transactionId?: string;
};
export type Line = { key: string; label: string; amount: number };
export type Payslip = {
  month: string;
  earnings: Line[];
  deductions: Line[];
  totalEarnings: number;
  totalDeductions: number;
  net: number;
  payments: { date: string; amount: number; paidFrom?: string; ref?: string }[];
  kpi: { score: number; max: number } | null;
};

export const SALARY_PAID_BY_DAY = 10;
/** The first month payslip notices and performance notes go out for. */
export const PAYSLIP_FROM = '2026-10';

export const payoutMonth = (p: { forMonth?: string; date: string }) => p.forMonth || (p.date || '').slice(0, 7);
export const partsForMonth = (parts: SalaryPart[] | null | undefined, month: string) =>
  (parts || []).filter((c) => c && (!c.fromMonth || month >= c.fromMonth));

export function monthlySalaryOf(emp: { monthlySalary?: number; salaryStructure?: SalaryPart[] } | null | undefined, month: string): number {
  if (!emp) return 0;
  if (emp.monthlySalary && emp.monthlySalary > 0) return emp.monthlySalary;
  return partsForMonth(emp.salaryStructure, month).reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

/** Advance cash already handed over, booked as a personal expense against this person and month. */
export function personalExpensesFor(overheads: any[], employeeId: string, month: string): number {
  return (overheads || [])
    .filter((o) => o?.category === 'personal_expense' && o.employeeId === employeeId && (o.expenseMonth ? o.expenseMonth === month : (o.date || '').slice(0, 7) === month))
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
}

/** What the payslip's earnings row is called in the app's language list (and in Bengali). */
export function partKey(label: string): string {
  const l = label.toLowerCase();
  if (/basic/.test(l)) return 'basic';
  if (/house rent|\bhra\b/.test(l)) return 'hra';
  if (/conveyance|travel/.test(l)) return 'conveyance';
  if (/dearness|\bda\b/.test(l)) return 'da';
  if (/special/.test(l)) return 'special';
  if (/food|meal/.test(l)) return 'food';
  return 'part';
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const lastDigits = (ref?: string) => (ref ? String(ref).replace(/\s+/g, '').slice(-4) : undefined);

/**
 * One month's payslip. Earnings: the salary parts for the month (once, not per payout), variable
 * pay, bonus, and anything paid beyond them. Deductions: salary-advance instalments recovered,
 * personal expenses, and anything paid short of the parts (unpaid days and the like). Earnings -
 * deductions = transfers - personal expenses, the net every pay screen shows.
 */
export function buildPayslip(o: {
  month: string;
  structure: SalaryPart[] | null | undefined;
  payouts: PayoutRow[];
  personalExpenses: number;
  kpi?: { score: number; max: number } | null;
}): Payslip {
  const pays = [...o.payouts].sort((a, b) => a.date.localeCompare(b.date));
  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const advance = pays.reduce((s, p) => s + (Number(p.advanceDeduction) || 0), 0);
  const variablePay = pays.reduce((s, p) => s + (Number(p.variablePay) || 0), 0);
  const bonus = pays.reduce((s, p) => s + (Number(p.bonus) || 0), 0);
  const gross = paid + advance;
  const parts = partsForMonth(o.structure, o.month);
  const fixed = parts.length ? parts : [{ label: 'Pay for the month', amount: gross - variablePay - bonus }];
  const earnings: Line[] = fixed.filter((c) => Number(c.amount)).map((c) => ({ key: parts.length ? partKey(c.label) : 'pay', label: c.label, amount: round2(Number(c.amount)) }));
  const fixedTotal = fixed.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  if (variablePay) earnings.push({ key: 'vp', label: 'Variable pay', amount: round2(variablePay) });
  if (bonus) earnings.push({ key: 'bonus', label: 'Bonus', amount: round2(bonus) });
  const rest = round2(gross - fixedTotal - variablePay - bonus);
  if (rest >= 1) earnings.push({ key: 'other', label: 'Other payment', amount: rest });
  const deductions: Line[] = [];
  if (advance) deductions.push({ key: 'advance', label: 'Salary advance recovery', amount: round2(advance) });
  if (o.personalExpenses) deductions.push({ key: 'personal', label: 'Advance cash taken', amount: round2(o.personalExpenses) });
  if (rest <= -1) deductions.push({ key: 'short', label: 'Unpaid days / other', amount: round2(-rest) });
  const totalEarnings = round2(earnings.reduce((s, l) => s + l.amount, 0));
  const totalDeductions = round2(deductions.reduce((s, l) => s + l.amount, 0));
  return {
    month: o.month,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    net: round2(paid - (o.personalExpenses || 0)),
    payments: pays.map((p) => ({ date: p.date, amount: Number(p.amount) || 0, ...(p.paidFrom ? { paidFrom: p.paidFrom } : {}), ...(p.transactionId ? { ref: lastDigits(p.transactionId) } : {}) })),
    kpi: o.kpi && Number.isFinite(o.kpi.score) ? o.kpi : null,
  };
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
export const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

/**
 * Whether a month's payslip is ready to hand out (owner: "when salary is paid"): the month is
 * over and its salary is fully paid; or, after the salary day (the 10th), any salary at all was
 * paid for it (a month with days unpaid never reaches the full amount). A bonus or variable pay on
 * its own is not the salary. Someone with no salary set (paid per trip) once the month is over
 * and anything was paid for it.
 */
export function payslipReady(o: { month: string; today: string; salary: number; payouts: PayoutRow[] }): boolean {
  const after = nextMonth(o.month);
  if (o.today < `${after}-01`) return false;
  const covered = o.payouts.reduce((s, p) => s + (Number(p.amount) || 0) - (Number(p.variablePay) || 0) - (Number(p.bonus) || 0) + (Number(p.advanceDeduction) || 0), 0);
  if (!o.salary) return o.payouts.some((p) => Number(p.amount) > 0);
  if (covered >= o.salary - 0.5) return true;
  return covered > 0 && o.today > `${after}-${String(SALARY_PAID_BY_DAY).padStart(2, '0')}`;
}

// ---------------- Performance notes ----------------

export type ChecklistItem = { key: string; label: string; labelBn: string };
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: 'punctuality', label: 'Punctuality & attendance', labelBn: 'সময়মতো আসা ও হাজিরা' },
  { key: 'quality', label: 'Quality of work', labelBn: 'কাজের মান' },
  { key: 'hygiene', label: 'Hygiene & uniform', labelBn: 'পরিচ্ছন্নতা ও ইউনিফর্ম' },
  { key: 'sops', label: 'Following SOPs & app entries', labelBn: 'নিয়ম মেনে কাজ ও অ্যাপে এন্ট্রি' },
  { key: 'teamwork', label: 'Teamwork & attitude', labelBn: 'দলের সঙ্গে কাজ ও ব্যবহার' },
  { key: 'ownership', label: 'Ownership & initiative', labelBn: 'দায়িত্ব নেওয়া ও উদ্যোগ' },
];
export type WriterKind = 'manager' | 'owner';
export type ReportItem = ChecklistItem & { score: number };
export type Report = {
  month: string; employeeId: string; kind: WriterKind; writerId: string | null; writerName: string;
  items: ReportItem[]; note: string; sentAt: string; updatedAt: string;
};

/** Staff who get a payslip and performance notes: active, not the owner, auditors or site auditors. */
export function isStaff(e: any): boolean {
  return !!e?.employeeId && !['inactive', 'archived'].includes(e.status) && !['cluster_head', 'audit'].includes(e.role) && e.designation !== 'site_auditor';
}

/** The manager who writes someone's note: their managerId, when that is a working colleague (not the owner). */
export function managerOf(e: any, employees: any[]): any | null {
  if (!e?.managerId) return null;
  const m = employees.find((x) => String(x.employeeId) === String(e.managerId));
  return m && !['inactive', 'archived'].includes(m.status) && m.role !== 'cluster_head' && String(m.employeeId) !== String(e.employeeId) ? m : null;
}

/** A report's scores against the checklist: each point 1-5; every point must be scored. */
export function cleanItems(checklist: ChecklistItem[], raw: any): { items?: ReportItem[]; error?: string } {
  const given = new Map<string, number>((Array.isArray(raw) ? raw : []).map((r: any) => [String(r?.key), Number(r?.score)]));
  const items: ReportItem[] = [];
  for (const c of checklist) {
    const score = given.get(c.key);
    if (!score || !Number.isInteger(score) || score < 1 || score > 5) return { error: `Give "${c.label}" a score from 1 to 5` };
    items.push({ ...c, score });
  }
  return { items };
}

export const averageOf = (items: { score: number }[]) => (items.length ? Math.round((items.reduce((s, i) => s + i.score, 0) / items.length) * 10) / 10 : 0);

// ---------------- Amount in words (Indian numbering) ----------------

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function upTo99(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`; }
function upTo999(n: number) { return `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? upTo99(n % 100) : ''}`; }

/** "Rupees Ten Thousand Four Hundred Sixty Only" (paise as "and N Paise"). */
export function rupeesInWords(amount: number): string {
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let n = Math.floor(abs);
  const paise = Math.round((abs - n) * 100);
  if (n === 0 && paise === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${upTo999(crore)} Crore`);
  if (lakh) parts.push(`${upTo99(lakh)} Lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} Thousand`);
  if (n) parts.push(upTo999(n));
  const words = parts.join(' ') || 'Zero';
  return `${neg ? 'Minus ' : ''}Rupees ${words}${paise ? ` and ${upTo99(paise)} Paise` : ''} Only`;
}
