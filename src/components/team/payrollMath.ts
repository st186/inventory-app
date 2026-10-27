// Payroll arithmetic for Team → Pay, the payslip sheet and My pay, moved out of
// PayrollManagement.tsx and EmployeeDashboard.tsx unchanged (pure functions, no React), so the
// screens and scripts can share one copy and the numbers can be checked before and after a
// redesign.
//
// Owner rules kept as they were:
//   - A payout's amount is the net amount actually transferred (after any salary-advance
//     instalment recovered from it).
//   - A payout's forMonth (when set) is the month it is FOR, not when it was paid; a salary paid
//     on or before the 10th defaults to last month's (utils/payslip.ts SALARY_PAID_BY_DAY).
import type * as api from '../../utils/api';
import { computeMonthlyPay, monthlySalaryOf, payoutMonth, personalExpensesForMonth } from '../../utils/payslip';

export interface PaySalaryComponent {
  label: string;
  amount: number;
}

export interface PayEmployee {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  type: 'contract' | 'fulltime';
  role?: string;
  storeId?: string | null;
  inchargeId?: string;
  dailyRate?: number;
  createdAt: string;
  salaryStructure?: PaySalaryComponent[];
  monthlySalary?: number;
  email?: string;
  designation?: string | null;
}

export interface PayPayout {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: string;
  storeId?: string;
  createdAt: string;
  forMonth?: string;
  transactionId?: string;
  variablePay?: number;
  variablePayLabel?: string;
  advanceDeduction?: number;
  advanceRecovery?: { advanceId: string; month: string; amount: number }[];
  paidFrom?: 'paytm' | 'bank' | 'cash';
}

export interface PayOverhead {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  storeId?: string;
  employeeId?: string;
  employeeName?: string;
  expenseMonth?: string;
}

export type ViewMode = 'current' | 'last' | 'custom';
export type MonthBounds = { start: string; end: string; monthName: string };
export type PeriodSpec = { viewMode: ViewMode; current: MonthBounds; last: MonthBounds; customStart: string; customEnd: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** This month's first and last day (YYYY-MM-DD) and "October 2026" (Payroll's "Current month"). */
export function currentMonthBounds(now: Date = new Date()): MonthBounds {
  const year = now.getFullYear();
  const month = now.getMonth();
  const end = new Date(year, month + 1, 0);
  return {
    start: `${year}-${pad2(month + 1)}-01`,
    end: `${year}-${pad2(month + 1)}-${pad2(end.getDate())}`,
    monthName: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

/** Last month's first and last day and its name (Payroll's "Last month"). */
export function lastMonthBounds(now: Date = new Date()): MonthBounds {
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: `${year}-${pad2(month + 1)}-01`,
    end: `${year}-${pad2(month + 1)}-${pad2(end.getDate())}`,
    monthName: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

/** A payout belongs to a period by its forMonth (range overlap) when set, else by its date. */
export function matchesPeriodByForMonthOrDate(p: { forMonth?: string; date: string }, start: string, end: string): boolean {
  if (p.forMonth) {
    const [y, m] = p.forMonth.split('-').map(Number);
    const forMonthStart = `${p.forMonth}-01`;
    const forMonthEnd = new Date(y, m, 0).toISOString().split('T')[0]; // last day of that month
    return forMonthStart <= end && forMonthEnd >= start; // range overlap
  }
  return p.date >= start && p.date <= end;
}

/** The payouts in the chosen period (Current month / Last month / Custom range). */
export function payoutsInPeriod<P extends { forMonth?: string; date: string }>(payouts: P[], period: PeriodSpec): P[] {
  if (period.viewMode === 'current') return payouts.filter((p) => matchesPeriodByForMonthOrDate(p, period.current.start, period.current.end));
  if (period.viewMode === 'last') return payouts.filter((p) => matchesPeriodByForMonthOrDate(p, period.last.start, period.last.end));
  if (!period.customStart || !period.customEnd) return [];
  return payouts.filter((p) => matchesPeriodByForMonthOrDate(p, period.customStart, period.customEnd));
}

/**
 * Personal expenses (category personal_expense) booked against this person in the period: by
 * expenseMonth when set, otherwise by date. `employeeKey` is compared with overhead.employeeId
 * exactly as Payroll always did (it passes the employee record's id).
 */
export function personalExpensesInPeriod(overheads: PayOverhead[], employeeKey: string, period: PeriodSpec): number {
  let monthFiltered: PayOverhead[];
  if (period.viewMode === 'current') {
    const currentMonthStr = period.current.start.substring(0, 7);
    monthFiltered = overheads.filter((o) => (o.expenseMonth ? o.expenseMonth === currentMonthStr : o.date >= period.current.start && o.date <= period.current.end));
  } else if (period.viewMode === 'last') {
    const lastMonthStr = period.last.start.substring(0, 7);
    monthFiltered = overheads.filter((o) => (o.expenseMonth ? o.expenseMonth === lastMonthStr : o.date >= period.last.start && o.date <= period.last.end));
  } else {
    if (!period.customStart || !period.customEnd) return 0;
    const startMonthStr = period.customStart.substring(0, 7);
    const endMonthStr = period.customEnd.substring(0, 7);
    monthFiltered = overheads.filter((o) =>
      o.expenseMonth ? o.expenseMonth >= startMonthStr && o.expenseMonth <= endMonthStr : o.date >= period.customStart && o.date <= period.customEnd,
    );
  }
  return monthFiltered
    .filter((o) => o.category === 'personal_expense' && o.employeeId === employeeKey)
    .reduce((sum, o) => sum + o.amount, 0);
}

/**
 * The payouts of one employment type in the period. The type is looked up in `lookup` (active and
 * archived staff), so a former employee's payouts still count.
 */
export function payoutsOfType<P extends { employeeId: string }>(payouts: P[], lookup: { id: string; type: string }[], type: 'contract' | 'fulltime'): P[] {
  return payouts.filter((p) => lookup.find((e) => e.id === p.employeeId)?.type === type);
}

export const sumAmounts = (rows: { amount: number }[]) => rows.reduce((sum, p) => sum + p.amount, 0);

/** Contract tab figures: total paid in the period, and per person days paid (distinct payout dates) and total. */
export function contractSummary(roster: PayEmployee[], contractPayouts: PayPayout[]) {
  const totalPayout = sumAmounts(contractPayouts);
  const people = roster.map((emp) => {
    const empPayouts = contractPayouts.filter((p) => p.employeeId === emp.id);
    return { employee: emp, payouts: empPayouts, totalPaid: sumAmounts(empPayouts), daysWorked: new Set(empPayouts.map((p) => p.date)).size };
  });
  return { totalPayout, people };
}

/**
 * Permanent tab figures. The headline total is payouts minus the personal expenses of the
 * people in scope (`scopedRoster`, the store/incharge-filtered list), as Payroll always showed
 * it; each person's net is their payouts minus their own personal expenses.
 */
export function permanentSummary(
  roster: PayEmployee[],
  scopedRoster: PayEmployee[],
  permanentPayouts: PayPayout[],
  personalExpensesFor: (employeeKey: string) => number,
) {
  const totalPaid = sumAmounts(permanentPayouts);
  const totalPersonalExpenses = scopedRoster.reduce((sum, emp) => sum + personalExpensesFor(emp.id), 0);
  const people = roster.map((emp) => {
    const empPayouts = permanentPayouts.filter((p) => p.employeeId === emp.id);
    const paid = sumAmounts(empPayouts);
    const personalExpenses = personalExpensesFor(emp.id);
    const lastPayout = empPayouts.length > 0 ? [...empPayouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
    return { employee: emp, payouts: empPayouts, totalPaid: paid, personalExpenses, netAmount: paid - personalExpenses, lastPayout };
  });
  return { totalPayout: totalPaid - totalPersonalExpenses, people };
}

// ---- Salary advances -------------------------------------------------------------------------

type AdvanceDeduction = api.SalaryAdvanceDeduction;
type AdvanceLike = { id: string; employeeId: string; status: string; remainingAmount: number; deductions?: AdvanceDeduction[] };
export type RecoveryItem = { advanceId: string; month: string; amount: number };

/** How much of an instalment is already recovered (older ones only carry `deducted`). */
export const recoveredSoFar = (d: AdvanceDeduction): number => (typeof d.recovered === 'number' ? d.recovered : d.deducted ? d.amount : 0);

/**
 * The salary-advance instalments a payout recovers: every approved instalment due up to the
 * salary month and not yet recovered, oldest first, never more than the payout itself.
 */
export function planAdvanceRecovery(advances: AdvanceLike[], employeeId: string, salaryMonth: string, grossAmount: number) {
  const items: RecoveryItem[] = [];
  let budget = Math.max(0, grossAmount);
  for (const advance of advances) {
    if (advance.employeeId !== employeeId || advance.status !== 'approved' || advance.remainingAmount <= 0) continue;
    const due = [...(advance.deductions || [])]
      .filter((d) => d.month <= salaryMonth && d.amount - recoveredSoFar(d) > 0.005)
      .sort((a, b) => a.month.localeCompare(b.month));
    for (const d of due) {
      const take = Math.min(
        d.amount - recoveredSoFar(d),
        budget,
        advance.remainingAmount - items.filter((i) => i.advanceId === advance.id).reduce((s, i) => s + i.amount, 0),
      );
      if (take <= 0.005) continue;
      items.push({ advanceId: advance.id, month: d.month, amount: Math.round(take * 100) / 100 });
      budget -= take;
    }
  }
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

/** Apply (sign 1) or undo (sign -1) a payout's recovery on the advance records. */
export function advanceUpdatesFor(advances: AdvanceLike[], recovery: RecoveryItem[], payoutId: string, sign: 1 | -1, nowIso: string = new Date().toISOString()) {
  const updates: { advanceId: string; deductions: AdvanceDeduction[]; remainingAmount: number }[] = [];
  for (const advanceId of [...new Set(recovery.map((r) => r.advanceId))]) {
    const advance = advances.find((a) => a.id === advanceId);
    if (!advance) continue;
    let changed = 0;
    const deductions = (advance.deductions || []).map((d) => {
      const amount = recovery.filter((r) => r.advanceId === advanceId && r.month === d.month).reduce((s, r) => s + r.amount, 0);
      if (!amount) return d;
      changed += amount;
      const recovered = Math.max(0, Math.round((recoveredSoFar(d) + sign * amount) * 100) / 100);
      const deducted = recovered >= d.amount - 0.005;
      return {
        ...d,
        recovered,
        deducted,
        deductedDate: deducted ? d.deductedDate || nowIso : undefined,
        payoutId: sign === 1 ? payoutId : d.payoutId === payoutId ? undefined : d.payoutId,
      };
    });
    updates.push({ advanceId, deductions, remainingAmount: Math.max(0, Math.round((advance.remainingAmount - sign * changed) * 100) / 100) });
  }
  return updates;
}

/** An advance request: up to one month's fixed salary, recovered in 4 equal monthly instalments from this month. */
export function buildAdvanceRequest(
  employee: { id: string; name: string; employeeId: string },
  amount: number,
  now: Date = new Date(),
): Omit<api.SalaryAdvance, 'id' | 'createdAt'> {
  const monthlyDeduction = amount / 4;
  const startMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const deductions: api.SalaryAdvanceDeduction[] = [];
  for (let i = 0; i < 4; i++) {
    const deductionDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    deductions.push({ month: `${deductionDate.getFullYear()}-${pad2(deductionDate.getMonth() + 1)}`, amount: monthlyDeduction, deducted: false });
  }
  const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeEmployeeId: employee.employeeId,
    amount,
    monthlyDeduction,
    remainingAmount: amount,
    status: 'pending',
    requestDate: now.toISOString(),
    installments: 4,
    startMonth,
    endMonth: `${endDate.getFullYear()}-${pad2(endDate.getMonth() + 1)}`,
    deductions,
  };
}

/** Why an advance request can't go in (null when it can). Same checks both screens made. */
export function advanceRequestProblem(
  employee: { id: string; type?: string; monthlySalary?: number; salaryStructure?: PaySalaryComponent[] } | null | undefined,
  amount: number,
  advances: { employeeId: string; status: string; remainingAmount: number }[],
  opts: { requirePermanent: boolean },
): { code: 'invalid' | 'notFound' | 'notPermanent' | 'noSalary' | 'overSalary' | 'active'; salary?: number } | null {
  if (isNaN(amount) || !amount || amount <= 0) return { code: 'invalid' };
  if (!employee) return { code: 'notFound' };
  if (opts.requirePermanent && employee.type !== 'fulltime') return { code: 'notPermanent' };
  const salary = monthlySalaryOf(employee);
  if (!salary) return { code: 'noSalary' };
  if (amount > salary) return { code: 'overSalary', salary };
  const active = advances.some((adv) => adv.employeeId === employee.id && (adv.status === 'pending' || (adv.status === 'approved' && adv.remainingAmount > 0)));
  if (active) return { code: 'active' };
  return null;
}

// ---- One person's months ---------------------------------------------------------------------

export type MonthSlip = {
  key: string; // YYYY-MM
  month: string; // "October"
  year: string;
  payouts: PayPayout[];
  total: number; // net (computeMonthlyPay)
  personalExpenses: number;
  isAvailable: boolean;
};

/** The last 12 months of one person's pay, newest first: payouts by payoutMonth, net after personal expenses. */
export function monthlySlips(personPayouts: PayPayout[], overheads: PayOverhead[], personEmployeeId: string, now: Date = new Date()): MonthSlip[] {
  const slips: MonthSlip[] = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    const monthPayouts = personPayouts.filter((p) => payoutMonth(p) === key);
    const personalExpenses = personalExpensesForMonth(overheads, personEmployeeId, key);
    slips.push({
      key,
      month: date.toLocaleDateString('en-US', { month: 'long' }),
      year: date.getFullYear().toString(),
      payouts: monthPayouts,
      total: computeMonthlyPay(monthPayouts, personalExpenses).net,
      personalExpenses,
      isAvailable: monthPayouts.length > 0,
    });
  }
  return slips;
}

// ---- New in the redesign: what is still due ---------------------------------------------------
// Team → Pay shows "To pay / Paid / Still due" for permanent staff. "To pay" is the fixed monthly
// salary (monthlySalaryOf: monthlySalary, else the salary structure); still due = salary − advance
// recovered − transfers already made (owner, 27 Oct 2026; personal expenses don't count). Contract
// staff are paid by the day as they work, so nothing is "due" for them.

export type PayStatus = 'paid' | 'partlyPaid' | 'due' | 'noSalary';

export function salaryCovered(empPayouts: PayPayout[]): number {
  return empPayouts.reduce((sum, p) => sum + (p.amount || 0) + (p.advanceDeduction || 0), 0);
}

export function payStatusOf(salary: number, covered: number): PayStatus {
  if (!salary) return covered > 0 ? 'paid' : 'noSalary';
  if (covered >= salary - 0.5) return 'paid';
  if (covered > 0) return 'partlyPaid';
  return 'due';
}

export function stillDue(salary: number, covered: number): number {
  return Math.max(0, Math.round((salary - covered) * 100) / 100);
}
