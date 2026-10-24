// Spreads the "lumpy" monthly costs - rent, electricity and permanent-staff salaries (variable
// pay is part of the salary payout) - evenly over the days of the month they belong to, so the
// Daily Performance / Profitability charts don't spike on the day a bill happens to be paid.
//
// Rules, chosen so the numbers stay honest when figures change:
//  - Pools are built from what is actually RECORDED. payout.amount is the net amount paid, so
//    variable pay is already in it and deductions already out of it; edit or add the real
//    figure and the whole month re-spreads on the next render.
//  - A payout belongs to its `forMonth` (else the month it was paid); rent/electricity belong
//    to the month they were logged in (fixed costs carry no "covers month" field).
//  - Until the real figure exists, the current and previous month are ESTIMATED from the month
//    before: per employee for salaries (base only - last month's variable pay isn't repeated),
//    per category for rent/electricity. Archived employees are never estimated. Estimates
//    disappear for an employee/category as soon as their actual is recorded (a payout that is
//    only variable pay doesn't count - the base salary is still estimated).
//  - The monthly pool is divided by the number of days in that month and only the days inside
//    the viewed window (up to today) are returned.

import { monthAdd } from './salaryBreakdown';

const SMOOTHED_FIXED_CATEGORIES = ['electricity', 'rent'];

const isArchived = (emp: any) => emp?.isActive === false || !!emp?.releasedAt;
const isContract = (emp: any) => (emp?.type || emp?.employmentType) === 'contract';
const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const addDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export type SmoothedDay = { amount: number; estimated: number };

export type SmoothedCosts = {
  byDate: Record<string, SmoothedDay>;
  // Part of the spread amount inside the window that comes from estimates, not recorded figures.
  estimatedAmount: number;
  estimatedMonths: string[];
  // The window's spread amount split into permanent salaries and rent + electricity.
  byGroup: { staff: number; occupancy: number };
};

export function buildSmoothedCosts(opts: {
  fixedCosts: any[];        // already store-scoped, all dates
  payouts: any[];           // already store-scoped, all dates
  employees: any[];
  windowStart: string;
  windowEnd: string;        // clamp to today before calling
  todayIST: string;
}): SmoothedCosts {
  const { fixedCosts, payouts, employees, windowStart, windowEnd, todayIST } = opts;
  const empById = new Map<string, any>(employees.map((e) => [e.id, e]));

  // month -> employeeId -> { total, variable }
  const salary = new Map<string, Map<string, { total: number; variable: number }>>();
  for (const p of payouts) {
    const emp = empById.get(p.employeeId);
    if (!emp || isContract(emp)) continue; // contract pay already lands per day via the sales record
    const month = p.forMonth || (p.date || '').slice(0, 7);
    if (!month) continue;
    const perEmp = salary.get(month) || new Map();
    const row = perEmp.get(p.employeeId) || { total: 0, variable: 0 };
    row.total += p.amount || 0;
    row.variable += Math.min(p.variablePay || 0, p.amount || 0);
    perEmp.set(p.employeeId, row);
    salary.set(month, perEmp);
  }

  // month -> category -> total
  const fixed = new Map<string, Map<string, number>>();
  for (const f of fixedCosts) {
    if (!SMOOTHED_FIXED_CATEGORIES.includes(f.category)) continue;
    const month = (f.date || '').slice(0, 7);
    if (!month) continue;
    const perCat = fixed.get(month) || new Map();
    perCat.set(f.category, (perCat.get(f.category) || 0) + (f.amount || 0));
    fixed.set(month, perCat);
  }

  const curMonth = todayIST.slice(0, 7);
  const estimateMonths = [curMonth, monthAdd(curMonth, -1)];
  type Split = { staff: number; occupancy: number };
  const monthActual = new Map<string, Split>();
  const monthEstimate = new Map<string, Split>();

  const months = new Set<string>([...salary.keys(), ...fixed.keys(), ...estimateMonths]);
  for (const m of months) {
    const actual: Split = { staff: 0, occupancy: 0 };
    for (const row of salary.get(m)?.values() || []) actual.staff += row.total;
    for (const v of fixed.get(m)?.values() || []) actual.occupancy += v;
    monthActual.set(m, actual);

    const estimate: Split = { staff: 0, occupancy: 0 };
    if (estimateMonths.includes(m)) {
      const prev = monthAdd(m, -1);
      const have = salary.get(m);
      for (const [empId, row] of salary.get(prev) || []) {
        // A variable-pay-only payout (no base salary yet) doesn't mean the salary is recorded.
        const paid = have?.get(empId);
        if (paid && paid.total - paid.variable > 0) continue;
        if (isArchived(empById.get(empId))) continue;
        estimate.staff += Math.max(0, row.total - row.variable);
      }
      const haveFixed = fixed.get(m);
      for (const [cat, total] of fixed.get(prev) || []) {
        if (haveFixed?.has(cat)) continue;
        estimate.occupancy += total;
      }
    }
    monthEstimate.set(m, estimate);
  }

  const byDate: Record<string, SmoothedDay> = {};
  const byGroup = { staff: 0, occupancy: 0 };
  let estimatedAmount = 0;
  const estimatedMonths = new Set<string>();
  const zero: Split = { staff: 0, occupancy: 0 };
  for (let d = windowStart; d <= windowEnd; d = addDay(d)) {
    const m = d.slice(0, 7);
    const n = daysInMonth(m);
    const a = monthActual.get(m) || zero, e = monthEstimate.get(m) || zero;
    const actual = (a.staff + a.occupancy) / n;
    const estimated = (e.staff + e.occupancy) / n;
    if (actual === 0 && estimated === 0) continue;
    byDate[d] = { amount: actual + estimated, estimated };
    byGroup.staff += (a.staff + e.staff) / n;
    byGroup.occupancy += (a.occupancy + e.occupancy) / n;
    if (estimated > 0) { estimatedAmount += estimated; estimatedMonths.add(m); }
  }
  return { byDate, estimatedAmount, estimatedMonths: [...estimatedMonths], byGroup };
}
