// What Team → Pay shows, worked out in one pure function (no React), so the numbers can be
// checked against the old Payroll screen on the same data (see the WP5 number check).
//
// Scope, as before: a chosen store (the owner's store chip, or an incharge's own store) keeps
// the people of that store and its linked production house; an incharge sees every contract
// worker in scope and only the permanent staff who report to them. Payouts are matched to that
// scope through active and past staff, so a former employee's payouts still count.
import type * as api from '../../../utils/api';
import { employeeBelongsToStore } from '../../../utils/entityAccess';
import { monthlySalaryOf } from '../../../utils/payslip';
import {
  contractSummary,
  payoutsInPeriod,
  payoutsOfType,
  payStatusOf,
  permanentSummary,
  personalExpensesInPeriod,
  salaryCovered,
  stillDue,
  sumAmounts,
  type PayEmployee,
  type PayOverhead,
  type PayPayout,
  type PayStatus,
  type PeriodSpec,
} from '../payrollMath';

export type PayInput = {
  employees: PayEmployee[];
  archivedEmployees: PayEmployee[];
  payouts: PayPayout[];
  overheads: PayOverhead[];
  stores: api.Store[];
  selectedStoreId?: string | null;
  isIncharge: boolean;
  userEmployeeId?: string | null;
  period: PeriodSpec;
};

export type PayRow = {
  key: string;
  employee: PayEmployee | null;
  name: string;
  type: 'contract' | 'fulltime';
  payouts: PayPayout[];
  /** Transfers in the period. */
  paid: number;
  /** Permanent: paid minus personal expenses (the old table's Net). Contract: paid. */
  amount: number;
  personalExpenses: number;
  daysWorked: number;
  salary: number;
  status: PayStatus | null;
  due: number;
  former: boolean;
};

export function buildPayView(input: PayInput) {
  const { employees, archivedEmployees, payouts, overheads, stores, selectedStoreId, isIncharge, userEmployeeId, period } = input;
  const employeesForDisplay = [...employees, ...archivedEmployees];

  const matchesStoreAndIncharge = (emp: PayEmployee) => {
    if (selectedStoreId && !employeeBelongsToStore(emp, selectedStoreId, stores)) return false;
    if (isIncharge && userEmployeeId) {
      if (emp.type === 'contract') return true;
      if (emp.type === 'fulltime') return emp.inchargeId === userEmployeeId;
      return false;
    }
    return true;
  };
  const filteredEmployees = employees.filter(matchesStoreAndIncharge);
  const employeesInScopeForPayouts = employeesForDisplay.filter(matchesStoreAndIncharge);
  const scopeIds = employeesInScopeForPayouts.map((e) => e.id);
  const filteredPayoutsByStore = selectedStoreId ? payouts.filter((p) => scopeIds.includes(p.employeeId)) : payouts;
  const filteredPayouts = payoutsInPeriod(filteredPayoutsByStore, period);
  const personalExpensesFor = (key: string) => personalExpensesInPeriod(overheads, key, period);

  // Contract: totals exactly as the old Contract tab.
  const contractPayouts = payoutsOfType(filteredPayouts, employeesForDisplay, 'contract');
  const contractRoster = filteredEmployees.filter((e) => e.type === 'contract');
  const contract = contractSummary(contractRoster, contractPayouts);

  // Permanent: the headline total as the old Permanent tab (payouts minus personal expenses of
  // the people in scope); per person, payouts minus their own personal expenses.
  const permanentPayoutsInScope = payoutsOfType(filteredPayouts, employeesInScopeForPayouts, 'fulltime');
  const permanentPayoutsShown = payoutsOfType(filteredPayouts, employeesForDisplay, 'fulltime');
  const permanentRoster = filteredEmployees.filter((e) => e.type === 'fulltime');
  const permanentTotals = permanentSummary(permanentRoster, permanentRoster, permanentPayoutsInScope, personalExpensesFor);
  const permanentRows = permanentSummary(permanentRoster, permanentRoster, permanentPayoutsShown, personalExpensesFor);

  const monthView = period.viewMode !== 'custom';
  const contractRows: PayRow[] = contract.people.map((p) => ({
    key: p.employee.id,
    employee: p.employee,
    name: p.employee.name,
    type: 'contract',
    payouts: p.payouts,
    paid: p.totalPaid,
    amount: p.totalPaid,
    personalExpenses: 0,
    daysWorked: p.daysWorked,
    salary: 0,
    status: null,
    due: 0,
    former: false,
  }));
  const permanentRowList: PayRow[] = permanentRows.people.map((p) => {
    const salary = monthlySalaryOf(p.employee);
    const covered = salaryCovered(p.payouts, p.personalExpenses);
    return {
      key: p.employee.id,
      employee: p.employee,
      name: p.employee.name,
      type: 'fulltime',
      payouts: p.payouts,
      paid: p.totalPaid,
      amount: p.netAmount,
      personalExpenses: p.personalExpenses,
      daysWorked: new Set(p.payouts.map((x) => x.date)).size,
      salary,
      status: monthView ? payStatusOf(salary, covered) : null,
      due: monthView ? stillDue(salary, covered) : 0,
      former: false,
    };
  });

  // Payouts in the period for people not on the current roster (past staff).
  const rosterIds = new Set([...contractRoster, ...permanentRoster].map((e) => e.id));
  const formerMap = new Map<string, PayRow>();
  for (const p of [...contractPayouts, ...permanentPayoutsShown]) {
    if (rosterIds.has(p.employeeId)) continue;
    const emp = employeesForDisplay.find((e) => e.id === p.employeeId) || null;
    const row = formerMap.get(p.employeeId) || {
      key: p.employeeId,
      employee: emp,
      name: emp?.name || p.employeeName || p.employeeId,
      type: (emp?.type === 'fulltime' ? 'fulltime' : 'contract') as PayRow['type'],
      payouts: [],
      paid: 0,
      amount: 0,
      personalExpenses: 0,
      daysWorked: 0,
      salary: 0,
      status: null,
      due: 0,
      former: true,
    };
    row.payouts.push(p);
    row.paid += p.amount;
    row.amount += p.amount;
    row.daysWorked = new Set(row.payouts.map((x) => x.date)).size;
    formerMap.set(p.employeeId, row);
  }

  const toPay = permanentRowList.reduce((s, r) => s + r.salary, 0);
  const dueTotal = permanentRowList.reduce((s, r) => s + r.due, 0);
  return {
    filteredEmployees,
    employeesForDisplay,
    employeesInScopeForPayouts,
    filteredPayouts,
    contract: { rows: contractRows, total: contract.totalPayout, daysPaid: contract.people.reduce((s, p) => s + p.daysWorked, 0), payouts: contractPayouts },
    permanent: { rows: permanentRowList, total: permanentTotals.totalPayout, toPay, stillDue: dueTotal, payouts: permanentPayoutsShown, grossPaid: sumAmounts(permanentPayoutsInScope) },
    former: [...formerMap.values()],
    monthView,
  };
}

export type PayView = ReturnType<typeof buildPayView>;
