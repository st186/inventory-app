// Turns raw payouts into the structure the Salaries breakdown modal displays. Kept out of
// Analytics.tsx (already enormous) and free of React so the numbers are easy to reason about.
//
// Conventions match Analytics' own salary total (metrics.salaryExpenses) exactly, so the
// breakdown always reconciles with the number on the card it was opened from:
//  - a payout belongs to the employee whose `id` equals payout.employeeId;
//  - an employee is "contract" when type/employmentType says so, otherwise permanent;
//  - payout.amount is the full amount paid and ALREADY includes variablePay (the payslip
//    derives base as amount - variablePay), so variable pay is carved out of amount here,
//    never added on top;
//  - payouts whose employee can't be found are skipped (counted in `unmatched`).

export type SalaryEmployeeType = 'permanent' | 'contract';

export type SalaryPayoutRow = {
  id: string;
  employeeId: string;
  name: string;
  type: SalaryEmployeeType;
  archived: boolean;
  date: string;
  forMonth: string;
  amount: number;
  variablePay: number;
  paidFrom: string;
};

export type SalaryEmployeeRow = {
  employeeId: string;
  name: string;
  type: SalaryEmployeeType;
  designation?: string;
  archived: boolean;
  payoutCount: number;
  base: number;
  variable: number;
  total: number;
  prevTotal: number | null;
};

export type SalaryTrendPoint = {
  month: string;
  label: string;
  permanent: number;
  contract: number;
  variable: number;
  total: number;
};

export type SalaryBreakdownData = {
  payouts: SalaryPayoutRow[];
  employees: SalaryEmployeeRow[];
  personalExpenses: { id: string; employeeName: string; description: string; amount: number; date: string }[];
  trend: SalaryTrendPoint[];
  prevMonthKey: string | null;
  prevTotal: number | null;
  totals: { permanent: number; contract: number; variable: number; base: number; personal: number; payoutCount: number };
  unmatched: { count: number; amount: number };
  notPaidThisPeriod: { employeeId: string; name: string; prevTotal: number }[];
  bigChanges: { employeeId: string; name: string; prevTotal: number; total: number; percent: number }[];
  nonPaytmPayouts: SalaryPayoutRow[];
};

const isArchived = (emp: any) => emp?.isActive === false || !!emp?.releasedAt;
const typeOf = (emp: any): SalaryEmployeeType => ((emp?.type || emp?.employmentType) === 'contract' ? 'contract' : 'permanent');

export function monthAdd(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

const monthOfPayout = (p: any): string => p.forMonth || (p.date || '').slice(0, 7);

export function buildSalaryBreakdown(opts: {
  periodPayouts: any[];
  allPayouts: any[];
  employees: any[];
  personalExpenses: any[];
  timeFilter: string;
  todayIST: string;
  inScope: (emp: any) => boolean;
}): SalaryBreakdownData {
  const { periodPayouts, allPayouts, employees, personalExpenses, timeFilter, todayIST, inScope } = opts;
  const empById = new Map<string, any>(employees.map((e) => [e.id, e]));

  const currentMonth = todayIST.slice(0, 7);
  const prevMonthKey =
    timeFilter === 'thisMonth' ? monthAdd(currentMonth, -1)
    : timeFilter === 'lastMonth' ? monthAdd(currentMonth, -2)
    : null;

  const toRow = (p: any): SalaryPayoutRow | null => {
    const emp = empById.get(p.employeeId);
    if (!emp) return null;
    return {
      id: p.id,
      employeeId: p.employeeId,
      name: emp.name || p.employeeName || p.employeeId,
      type: typeOf(emp),
      archived: isArchived(emp),
      date: p.date,
      forMonth: monthOfPayout(p),
      amount: p.amount || 0,
      variablePay: Math.min(p.variablePay || 0, p.amount || 0),
      paidFrom: p.paidFrom || 'paytm',
    };
  };

  const payouts: SalaryPayoutRow[] = [];
  let unmatchedCount = 0;
  let unmatchedAmount = 0;
  for (const p of periodPayouts) {
    const row = toRow(p);
    if (row) payouts.push(row);
    else { unmatchedCount++; unmatchedAmount += p.amount || 0; }
  }
  payouts.sort((a, b) => (a.date < b.date ? 1 : -1));

  // Previous-month totals per employee, store-scoped the same way as the current period.
  const prevByEmployee = new Map<string, number>();
  if (prevMonthKey) {
    for (const p of allPayouts) {
      if (monthOfPayout(p) !== prevMonthKey) continue;
      const emp = empById.get(p.employeeId);
      if (!emp || !inScope(emp)) continue;
      prevByEmployee.set(p.employeeId, (prevByEmployee.get(p.employeeId) || 0) + (p.amount || 0));
    }
  }

  const byEmp = new Map<string, SalaryEmployeeRow>();
  for (const r of payouts) {
    const emp = empById.get(r.employeeId);
    const row = byEmp.get(r.employeeId) || {
      employeeId: r.employeeId, name: r.name, type: r.type, designation: emp?.designation || undefined,
      archived: r.archived, payoutCount: 0, base: 0, variable: 0, total: 0,
      prevTotal: prevMonthKey ? (prevByEmployee.get(r.employeeId) || 0) : null,
    };
    row.payoutCount += 1;
    row.variable += r.variablePay;
    row.base += r.amount - r.variablePay;
    row.total += r.amount;
    byEmp.set(r.employeeId, row);
  }
  const employeeRows = [...byEmp.values()].sort((a, b) => b.total - a.total);

  const totals = payouts.reduce(
    (t, r) => {
      if (r.type === 'contract') t.contract += r.amount; else t.permanent += r.amount;
      t.variable += r.variablePay;
      t.base += r.amount - r.variablePay;
      t.payoutCount += 1;
      return t;
    },
    { permanent: 0, contract: 0, variable: 0, base: 0, personal: 0, payoutCount: 0 }
  );

  const personal = personalExpenses.map((o) => ({
    id: o.id, employeeName: o.employeeName || 'Employee', description: o.description || '', amount: o.amount || 0, date: o.date,
  }));
  totals.personal = personal.reduce((s, o) => s + o.amount, 0);

  // Six-month trend, ending on the viewed month (last month for the Last Month filter,
  // otherwise the current one), scoped to this store and bucketed by the month a payout is FOR.
  const anchor = timeFilter === 'lastMonth' ? monthAdd(currentMonth, -1) : currentMonth;
  const months = Array.from({ length: 6 }, (_, i) => monthAdd(anchor, i - 5));
  const trendMap = new Map<string, SalaryTrendPoint>(
    months.map((m) => [m, { month: m, label: monthLabel(m), permanent: 0, contract: 0, variable: 0, total: 0 }])
  );
  for (const p of allPayouts) {
    const pt = trendMap.get(monthOfPayout(p));
    if (!pt) continue;
    const emp = empById.get(p.employeeId);
    if (!emp || !inScope(emp)) continue;
    const amount = p.amount || 0;
    const variable = Math.min(p.variablePay || 0, amount);
    pt.variable += variable;
    if (typeOf(emp) === 'contract') pt.contract += amount - variable; else pt.permanent += amount - variable;
    pt.total += amount;
  }

  const prevTotal = prevMonthKey ? [...prevByEmployee.values()].reduce((s, v) => s + v, 0) : null;

  const paidNow = new Set(employeeRows.map((r) => r.employeeId));
  const notPaidThisPeriod = prevMonthKey
    ? [...prevByEmployee.entries()]
        .filter(([id, total]) => total > 0 && !paidNow.has(id) && !isArchived(empById.get(id)))
        .map(([id, total]) => ({ employeeId: id, name: empById.get(id)?.name || id, prevTotal: total }))
        .sort((a, b) => b.prevTotal - a.prevTotal)
    : [];

  const bigChanges = employeeRows
    .filter((r) => r.prevTotal && r.prevTotal > 0 && r.total > 0 && Math.abs(r.total - r.prevTotal) / r.prevTotal >= 0.1)
    .map((r) => ({
      employeeId: r.employeeId, name: r.name, prevTotal: r.prevTotal as number, total: r.total,
      percent: ((r.total - (r.prevTotal as number)) / (r.prevTotal as number)) * 100,
    }));

  return {
    payouts, employees: employeeRows, personalExpenses: personal, trend: [...trendMap.values()],
    prevMonthKey, prevTotal, totals, unmatched: { count: unmatchedCount, amount: unmatchedAmount },
    notPaidThisPeriod, bigChanges,
    nonPaytmPayouts: payouts.filter((r) => r.paidFrom !== 'paytm'),
  };
}
