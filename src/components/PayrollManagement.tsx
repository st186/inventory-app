import { useState, useEffect, useMemo } from 'react';
import { Plus, Users, DollarSign, Calendar, X, Edit2, Trash2, Download, FileText, CreditCard, CheckCircle, XCircle, Clock, AlertCircle, Minus } from 'lucide-react';
import * as api from '../utils/api';
import { DatePicker } from './DatePicker';
import { PaymentHistoryModal } from './PaymentHistoryModal';
import { generatePayslip, computeMonthlyPay, defaultSalaryMonth, monthlySalaryOf, payoutMonth, personalExpensesForMonth, salaryMonthOf, SALARY_PAID_BY_DAY } from '../utils/payslip';
import { employeeBelongsToStore } from '../utils/entityAccess';
import { useApprovedVariablePay } from './kpi/useApprovedVariablePay';
import { advanceUpdatesFor as recoveryUpdates, currentMonthBounds, lastMonthBounds, payoutsInPeriod, personalExpensesInPeriod, planAdvanceRecovery as planRecovery, recoveredSoFar } from './team/payrollMath';

interface SalaryComponent {
  label: string; // e.g. "Basic", "HRA", "Conveyance", "Special Allowance"
  amount: number; // fixed monthly amount for this component
}

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  type: 'contract' | 'fulltime';
  role?: string;
  // Was only ever accessed via `(emp as any).storeId` before - declaring it properly here
  // so employeeBelongsToStore (entityAccess.ts) can be called without a cast.
  storeId?: string | null;
  inchargeId?: string;
  dailyRate?: number;
  createdAt: string;
  // Fixed monthly salary breakdown - drives the payslip's itemized breakdown instead of a
  // single lump "Basic Salary" line. The variable component isn't included here since it's
  // entered fresh per payout (see Payout.variablePay), not fixed month to month.
  salaryStructure?: SalaryComponent[];
}

interface Payout {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: string;
  storeId?: string; // Optional for backward compatibility with existing data
  createdAt: string;
  forMonth?: string; // Format "YYYY-MM" - which month this payout covers, for late/backlogged salaries
  transactionId?: string; // Bank/UPI reference for this digital payment, kept as a paper trail
  variablePay?: number; // This month's variable/incentive pay, shown as its own payslip line
  variablePayLabel?: string; // defaults to "Variable Pay" if omitted
  advanceDeduction?: number; // salary-advance instalment(s) recovered - amount is after this
  advanceRecovery?: { advanceId: string; month: string; amount: number }[];
}

interface OverheadItem {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  storeId?: string;
  employeeId?: string;
  employeeName?: string;
  expenseMonth?: string; // Format: "YYYY-MM" for month mapping feature
}

interface PayrollManagementProps {
  userRole: 'manager' | 'cluster_head' | 'audit';
  selectedDate: string;
  userEmployeeId?: string | null;
  userName?: string;
  selectedStoreId?: string | null;
  isIncharge?: boolean;
  inchargeDesignation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null;
}

export function PayrollManagement({ userRole, selectedDate, userEmployeeId, userName, selectedStoreId, isIncharge = false, inchargeDesignation = null }: PayrollManagementProps) {
  const [activeTab, setActiveTab] = useState<'contract' | 'permanent' | 'my-payouts' | 'advances'>('contract');
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Archived (released) employees - fetched separately so their historical payouts can
  // still be displayed correctly (name, role, etc.) after they leave. Never merged into
  // `employees` itself - every employee-selection flow (who to pay, who to edit) must stay
  // active-only; this is purely a lookup table for rendering past payout rows.
  const [archivedEmployees, setArchivedEmployees] = useState<Employee[]>([]);
  const employeesForDisplay = useMemo(() => [...employees, ...archivedEmployees], [employees, archivedEmployees]);
  // For employeeBelongsToStore below - a production incharge/ops employee's own `storeId`
  // field actually holds their production house's id, not a real store id (see
  // entityAccess.ts). Without resolving that, Akash Dey (production_ops, storeId = his
  // production house's id) silently vanished from Bunny Momos 1's Payroll view and its
  // payout history the moment a specific store was selected - "no payment showing up"
  // even though the payout record itself was always there.
  const [stores, setStores] = useState<api.Store[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [salaryAdvances, setSalaryAdvances] = useState<any[]>([]);
  const [overheads, setOverheads] = useState<OverheadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isClusterHead = userRole === 'cluster_head';
  
  // Manager salary advance state
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  
  // Payment history modal state
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState<Employee | null>(null);
  
  // Date range filter state
  const [viewMode, setViewMode] = useState<'current' | 'last' | 'custom'>('current');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Current / last month bounds (team/payrollMath.ts).
  const currentMonth = currentMonthBounds();
  const lastMonth = lastMonthBounds();

  // Edit employee modal state
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Payout modal state
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutData, setPayoutData] = useState({
    employeeIds: [] as string[],
    amount: '',
    date: selectedDate,
    periodType: 'month' as 'days' | 'month',
    days: '',
    // Only used when the employee has no dailyRate configured on their record (true
    // for every current contract worker) - lets the rate be entered at payout time
    // instead of silently defaulting to 0.
    ratePerDay: '',
    // Which month this payout covers - defaults to the payment date's own month, but
    // can be set earlier for backlogged salaries (e.g. paid on the 5th of next month
    // for the prior month's work). Format "YYYY-MM".
    forMonth: selectedDate.slice(0, 7),
    // Bank/UPI reference for this digital payment - kept on the payout record and shown
    // on the payslip as proof of transfer.
    transactionId: '',
    // This month's variable/incentive pay - entered fresh each payout since it isn't the
    // same every month, unlike the employee's fixed salaryStructure components.
    variablePay: '',
    // Which balance the money actually left. Only 'paytm' payouts are subtracted from a
    // store's Online Cash (Paytm) reconciliation - 'bank' and 'cash' are real expenses
    // but settled elsewhere, so they must not drain the Paytm figure.
    paidFrom: 'paytm' as 'paytm' | 'bank' | 'cash',
  });

  // Variable pay approved in Team KPIs fills an empty Variable Pay field when one person is picked.
  const approvedVariablePay = useApprovedVariablePay(showPayoutModal, payoutData.employeeIds.map((id) => employees.find((e) => e.id === id)?.employeeId || id), payoutData.forMonth, (amount) => setPayoutData((d) => (d.variablePay ? d : { ...d, variablePay: String(amount) })));

  // Edit payout modal state
  const [showEditPayout, setShowEditPayout] = useState(false);
  const [editingPayout, setEditingPayout] = useState<Payout | null>(null);

  // Same store-match + incharge-permission predicate used for both lists below - pulled
  // out once so the roster (active-only) and the payout-matching list (active + archived)
  // can never drift apart on what counts as "in scope" the way they used to.
  const matchesStoreAndIncharge = (emp: Employee) => {
    // Also matches this store's linked production house - see entityAccess.ts's
    // employeeBelongsToStore for why a production incharge/ops employee needs that extra
    // check, not just an exact/null storeId match.
    if (selectedStoreId && !employeeBelongsToStore(emp, selectedStoreId, stores)) return false;

    if (isIncharge && userEmployeeId) {
      // For contract employees, incharge can see ALL contract employees
      if (emp.type === 'contract') return true;
      // For permanent employees, incharge can only see employees under them
      if (emp.type === 'fulltime') return (emp as any).inchargeId === userEmployeeId;
      return false;
    }

    return true;
  };

  // Filter employees and payouts by store and incharge permissions - active employees
  // only, for the editable Contract/Permanent roster cards.
  const filteredEmployees = useMemo(
    () => employees.filter(matchesStoreAndIncharge),
    [employees, selectedStoreId, stores, isIncharge, userEmployeeId]
  );

  // Same scope, but active + archived - for deciding which PAYOUTS belong to this
  // store/incharge view. An employee who has since been archived still has real payout
  // history that belongs here; filteredEmployees (roster-only) must never gate that,
  // which is exactly the bug that made Akash Dey's payouts disappear once he was archived.
  const employeesInScopeForPayouts = useMemo(
    () => employeesForDisplay.filter(matchesStoreAndIncharge),
    [employeesForDisplay, selectedStoreId, stores, isIncharge, userEmployeeId]
  );

  const filteredPayoutsByStore = useMemo(() => {
    if (!selectedStoreId) return payouts;
    // employeesInScopeForPayouts (active + archived), not filteredEmployees (active-only)
    // - see its own comment above for why.
    const storeEmployeeIds = employeesInScopeForPayouts.map(emp => emp.id);
    return payouts.filter(payout => storeEmployeeIds.includes(payout.employeeId));
  }, [payouts, employeesInScopeForPayouts, selectedStoreId]);

  // Filter payouts based on selected date range (must come AFTER filteredPayoutsByStore).
  // A payout's forMonth (when set) is which month it's actually FOR, not when it was
  // paid - a backlogged salary paid in June for May (forMonth "2026-05") should count
  // toward May's period, not June's, or it never shows up under the month it belongs to.
  const filteredPayouts = useMemo(
    () => payoutsInPeriod(filteredPayoutsByStore, { viewMode, current: currentMonth, last: lastMonth, customStart: customStartDate, customEnd: customEndDate }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredPayoutsByStore, viewMode, currentMonth.start, lastMonth.start, customStartDate, customEndDate]
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('Loading employees, payouts, salary advances, overheads, and stores from server...');
      const [employeesData, archivedData, payoutsData, advancesData, overheadsData, storesData] = await Promise.all([
        api.getEmployees(),
        api.getArchivedEmployees(),
        api.getPayouts(),
        api.getSalaryAdvances(),
        api.getOverheads(),
        api.getStores()
      ]);
      console.log('Loaded employees:', employeesData);
      console.log('Loaded archived employees:', archivedData);
      console.log('Loaded payouts:', payoutsData);
      console.log('Loaded salary advances:', advancesData);
      console.log('Loaded overheads:', overheadsData);
      setEmployees((employeesData as any) || []);
      setArchivedEmployees((archivedData as any) || []);
      setPayouts((payoutsData as any) || []);
      setStores(storesData || []);
      setSalaryAdvances(advancesData || []);
      setOverheads(overheadsData || []);
    } catch (error) {
      console.error('Error loading payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAdvance = async (advanceId: string) => {
    try {
      const advance = salaryAdvances.find(a => a.id === advanceId);
      if (!advance) return;

      const approvedBy = userName || userEmployeeId || 'Cluster Head';
      const updatedAdvance = {
        ...advance,
        status: 'approved',
        approvedBy,
        approvedDate: new Date().toISOString()
      };

      await api.updateSalaryAdvance(advanceId, updatedAdvance);
      alert('Salary advance approved successfully!');
      loadData();
    } catch (error) {
      console.error('Error approving salary advance:', error);
      alert('Failed to approve salary advance. Please try again.');
    }
  };

  const handleRejectAdvance = async (advanceId: string) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    try {
      const advance = salaryAdvances.find(a => a.id === advanceId);
      if (!advance) return;

      const updatedAdvance = {
        ...advance,
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: userName || userEmployeeId || 'Cluster Head',
        approvedDate: new Date().toISOString()
      };

      await api.updateSalaryAdvance(advanceId, updatedAdvance);
      alert('Salary advance rejected.');
      loadData();
    } catch (error) {
      console.error('Error rejecting salary advance:', error);
      alert('Failed to reject salary advance. Please try again.');
    }
  };

  const handleApplySalaryAdvance = async () => {
    if (!advanceAmount || !userEmployeeId) return;

    const amount = parseFloat(advanceAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const currentEmployee = employees.find(e => e.employeeId === userEmployeeId);
      if (!currentEmployee) {
        alert('Employee not found');
        return;
      }

      if (currentEmployee.type !== 'fulltime') {
        alert('Only permanent employees can apply for salary advance');
        return;
      }

      // Same cap as the employee dashboard: up to one month's fixed salary.
      const monthlySalary = monthlySalaryOf(currentEmployee);
      if (!monthlySalary) {
        alert('Your salary structure is not set up yet. Please ask the owner to add it in Employee Management.');
        return;
      }
      if (amount > monthlySalary) {
        alert(`Advance amount cannot exceed your monthly salary (₹${monthlySalary.toLocaleString('en-IN')})`);
        return;
      }

      // Check if there's already a pending or active advance
      const hasActiveAdvance = salaryAdvances.some(adv =>
        adv.employeeId === currentEmployee.id &&
        (adv.status === 'pending' || (adv.status === 'approved' && adv.remainingAmount > 0))
      );

      if (hasActiveAdvance) {
        alert('You already have an active or pending salary advance');
        return;
      }

      const monthlyDeduction = amount / 4;
      const now = new Date();
      const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const deductions: api.SalaryAdvanceDeduction[] = [];
      for (let i = 0; i < 4; i++) {
        const deductionDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = `${deductionDate.getFullYear()}-${String(deductionDate.getMonth() + 1).padStart(2, '0')}`;
        deductions.push({
          month: monthStr,
          amount: monthlyDeduction,
          deducted: false
        });
      }

      const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 1);
      const endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;

      const newAdvance: Omit<api.SalaryAdvance, 'id' | 'createdAt'> = {
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        employeeEmployeeId: currentEmployee.employeeId,
        amount,
        monthlyDeduction,
        remainingAmount: amount,
        status: 'pending',
        requestDate: new Date().toISOString(),
        installments: 4,
        startMonth,
        endMonth,
        deductions
      };

      await api.createSalaryAdvance(newAdvance);
      alert('Salary advance request submitted successfully!');
      setShowAdvanceModal(false);
      setAdvanceAmount('');
      loadData();
    } catch (error) {
      console.error('Error applying for salary advance:', error);
      alert('Failed to submit salary advance request. Please try again.');
    }
  };

  // The Add Payout form's default "Salary For Month": a permanent salary paid early in the
  // month is last month's (see SALARY_PAID_BY_DAY); contract pay is the payment month's.
  const defaultForMonth = (date: string) => (activeTab === 'permanent' ? defaultSalaryMonth(date) : date.slice(0, 7));

  // Salary-advance recovery (team/payrollMath.ts): instalments due up to the salary month,
  // never more than the payout itself.
  const planAdvanceRecovery = (employeeId: string, salaryMonth: string, grossAmount: number) =>
    planRecovery(salaryAdvances, employeeId, salaryMonth, grossAmount);
  const advanceUpdatesFor = (recovery: { advanceId: string; month: string; amount: number }[], payoutId: string, sign: 1 | -1) =>
    recoveryUpdates(salaryAdvances, recovery, payoutId, sign);

  const handleAddPayout = async () => {
    const payingByDays = activeTab === 'contract' && payoutData.periodType === 'days';
    if (payoutData.employeeIds.length === 0 || (payingByDays ? !payoutData.days : (!payoutData.amount && !payoutData.variablePay))) {
      alert(payingByDays ? 'Please select employees and enter number of days' : 'Please select employees and enter an amount (or just a Variable Pay amount)');
      return;
    }
    if (payingByDays) {
      const missingRate = payoutData.employeeIds.some(empId => {
        const employee = employees.find(e => e.id === empId);
        return !(employee?.dailyRate || parseFloat(payoutData.ratePerDay) || 0);
      });
      if (missingRate) {
        alert('Please enter a rate per day - the selected employee(s) have no daily rate on file');
        return;
      }
    }

    if (submitting) return; // Prevent double submission

    try {
      setSubmitting(true);
      // If Amount is left blank, fall back to the Variable Pay figure - lets a
      // pure incentive/variable payout be entered without typing the number twice.
      const grossAmount = parseFloat(payoutData.amount) || parseFloat(payoutData.variablePay) || 0;
      const days = parseFloat(payoutData.days) || 0;
      // Track advance updates to apply after payouts save successfully
      const advanceUpdates: { advanceId: string; deductions: any[]; remainingAmount: number }[] = [];

      const newPayouts = payoutData.employeeIds.map(empId => {
        const employee = employees.find(e => e.id === empId);
        const payoutId = crypto.randomUUID();
        const forMonth = salaryMonthOf({ forMonth: payoutData.forMonth, date: payoutData.date });
        // Paying "by days" uses each employee's own daily rate; "by month" applies the
        // typed amount as-is (a flat sum, same as before this period-type option existed).
        const empGrossAmount = payingByDays ? days * (employee?.dailyRate || parseFloat(payoutData.ratePerDay) || 0) : grossAmount;
        const recovery = planAdvanceRecovery(empId, forMonth, empGrossAmount);
        // Never below zero: the recovery is already capped at the gross amount.
        const netAmount = Math.max(0, empGrossAmount - recovery.total);
        advanceUpdates.push(...advanceUpdatesFor(recovery.items, payoutId, 1));

        return {
          id: payoutId,
          employeeId: empId,
          employeeName: employee?.name || '',
          // What is transferred - after the advance instalment(s) recovered below.
          amount: netAmount,
          date: payoutData.date,
          storeId: selectedStoreId || undefined, // Add storeId for proper filtering
          createdAt: new Date().toISOString(),
          forMonth,
          transactionId: payoutData.transactionId || undefined,
          variablePay: payoutData.variablePay ? parseFloat(payoutData.variablePay) : undefined,
          paidFrom: payoutData.paidFrom,
          // Kept on the payout so the payslip can show gross and the recovery, and so
          // deleting the payout can hand the instalment(s) back to the advance.
          advanceDeduction: recovery.total > 0 ? recovery.total : undefined,
          advanceRecovery: recovery.items.length > 0 ? recovery.items : undefined,
        };
      });

      console.log('Adding payouts:', newPayouts);

      const result = await api.addPayouts(newPayouts);
      console.log('Payouts added successfully:', result);

      // Mark the corresponding salary-advance installments as deducted now that the payout is saved
      for (const update of advanceUpdates) {
        await api.updateSalaryAdvance(update.advanceId, {
          deductions: update.deductions,
          remainingAmount: update.remainingAmount,
        });
      }
      if (advanceUpdates.length > 0) {
        await loadData();
      }

      setPayouts([...payouts, ...newPayouts]);
      setShowPayoutModal(false);
      setPayoutData({ employeeIds: [], amount: '', date: selectedDate, periodType: 'month', days: '', ratePerDay: '', forMonth: selectedDate.slice(0, 7), transactionId: '', variablePay: '', paidFrom: 'paytm' });
      alert(
        advanceUpdates.length > 0
          ? `Payout added successfully! Salary advance deduction applied for ${advanceUpdates.length} employee(s).`
          : 'Payout added successfully!'
      );
    } catch (error) {
      console.error('Error adding payout:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to add payout: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditEmployee = async () => {
    if (!editingEmployee) return;

    try {
      // Only what this form edits. Sending the whole record also sent `role` (a free-text
      // box here used to change it, which could corrupt the login role) and fields the
      // server had hidden from this viewer; roles change only via the owner's role control.
      await api.updateEmployee(editingEmployee.id, {
        name: editingEmployee.name,
        phone: editingEmployee.phone,
        dailyRate: editingEmployee.dailyRate,
        salaryStructure: editingEmployee.salaryStructure,
      });
      setEmployees(employees.map(e => e.id === editingEmployee.id ? editingEmployee : e));
      setShowEditEmployee(false);
      setEditingEmployee(null);
      alert('Employee updated successfully!');
    } catch (error) {
      console.error('PayrollManagement: Error updating employee:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to update employee: ${errorMessage}`);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee? This action cannot be undone.')) {
      return;
    }

    try {
      const result = await api.deleteEmployee(id);
      setEmployees(employees.filter(e => e.id !== id));
      // This only ever archives the employee server-side (see DELETE
      // /unified-employees/:employeeId) - their payout history is kept, never deleted.
      // Move them into archivedEmployees locally so past payout rows still resolve a name
      // instead of silently removing those payouts from view, which this used to do.
      if (result?.archived) {
        setArchivedEmployees([...archivedEmployees, result.archived]);
      }
      alert(result?.loginRevoked === false
        ? 'Employee archived - their past payout records are kept. (Their login could not be banned just now; the app refuses it anyway.)'
        : 'Employee archived and their login switched off - their past payout records are kept.');
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Failed to archive employee');
    }
  };

  const handleEditPayout = async () => {
    if (!editingPayout) return;

    try {
      await api.updatePayout(editingPayout.id, {
        amount: editingPayout.amount,
        date: editingPayout.date,
        forMonth: editingPayout.forMonth || editingPayout.date.slice(0, 7)
      });
      setPayouts(payouts.map(p => p.id === editingPayout.id ? editingPayout : p));
      setShowEditPayout(false);
      setEditingPayout(null);
      alert('Payout updated successfully!');
    } catch (error) {
      console.error('Error updating payout:', error);
      alert('Failed to update payout');
    }
  };

  const handleDeletePayout = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payout?')) {
      return;
    }

    try {
      const payout = payouts.find(p => p.id === id);
      await api.deletePayout(id);
      setPayouts(payouts.filter(p => p.id !== id));

      // Give back any salary-advance instalment this payout recovered, so it is due again.
      // Payouts saved before advanceRecovery existed are found by the payoutId on the
      // instalment instead.
      const recovery = payout?.advanceRecovery?.length
        ? payout.advanceRecovery
        : salaryAdvances.flatMap(a => (a.deductions || [])
            .filter((d: any) => d.payoutId === id)
            .map((d: any) => ({ advanceId: a.id, month: d.month, amount: recoveredSoFar(d) })));
      const updates = advanceUpdatesFor(recovery, id, -1);
      for (const update of updates) {
        await api.updateSalaryAdvance(update.advanceId, {
          deductions: update.deductions,
          remainingAmount: update.remainingAmount,
        });
      }
      if (updates.length > 0) await loadData();
      alert(updates.length > 0
        ? 'Payout deleted - the salary advance instalment it recovered is due again.'
        : 'Payout deleted successfully!');
    } catch (error) {
      console.error('Error deleting payout:', error);
      alert('Failed to delete payout');
    }
  };

  // Personal expenses booked against this person in the chosen period (team/payrollMath.ts).
  const calculatePersonalExpenses = (employeeInternalId: string): number =>
    personalExpensesInPeriod(overheads, employeeInternalId, { viewMode, current: currentMonth, last: lastMonth, customStart: customStartDate, customEnd: customEndDate });

  const calculateContractStats = () => {
    const contractEmployees = filteredEmployees.filter(e => e.type === 'contract');
    // employeesInScopeForPayouts (active + archived) for the payout match, same reason as
    // everywhere else in this file - an archived employee's past payout still counts
    // toward this total, even though contractEmployees itself stays active-only.
    const contractPayouts = filteredPayouts.filter(p => {
      const emp = employeesInScopeForPayouts.find(e => e.id === p.employeeId);
      return emp?.type === 'contract';
    });

    const totalPayout = contractPayouts.reduce((sum, p) => sum + p.amount, 0);
    const employeeWorkDays = contractEmployees.map(emp => {
      const empPayouts = contractPayouts.filter(p => p.employeeId === emp.id);
      const uniqueDays = new Set(empPayouts.map(p => p.date));
      return {
        ...emp,
        daysWorked: uniqueDays.size,
        totalPay: empPayouts.reduce((sum, p) => sum + p.amount, 0)
      };
    });

    const totalDaysWorked = employeeWorkDays.reduce((sum, e) => sum + e.daysWorked, 0);

    return { totalPayout, employeeWorkDays, totalDaysWorked };
  };

  const calculatePermanentStats = () => {
    const permanentEmployees = filteredEmployees.filter(e => e.type === 'fulltime');
    // See calculateContractStats above - employeesInScopeForPayouts for the payout match.
    const permanentPayouts = filteredPayouts.filter(p => {
      const emp = employeesInScopeForPayouts.find(e => e.id === p.employeeId);
      return emp?.type === 'fulltime';
    });

    const totalPayout = permanentPayouts.reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate total personal expenses for all permanent employees
    const totalPersonalExpenses = permanentEmployees.reduce((sum, emp) => {
      const empExpense = calculatePersonalExpenses(emp.id);
      console.log(`🔍 Personal expense for ${emp.name} (${emp.id}): ₹${empExpense}`);
      return sum + empExpense;
    }, 0);
    
    console.log(`💰 Total Payout Calculation:`);
    console.log(`   Regular Payouts: ₹${totalPayout}`);
    console.log(`   Personal Expenses (salary advance deductions): ₹${totalPersonalExpenses}`);
    console.log(`   NET TOTAL: ₹${totalPayout - totalPersonalExpenses}`);

    const employeePayouts = permanentEmployees.map(emp => {
      const empPayouts = permanentPayouts.filter(p => p.employeeId === emp.id);
      return {
        ...emp,
        totalPaid: empPayouts.reduce((sum, p) => sum + p.amount, 0),
        lastPayout: empPayouts.length > 0 ? empPayouts[empPayouts.length - 1] : null
      };
    });

    return {
      totalPayout: totalPayout - totalPersonalExpenses, // Net of salary-advance deductions already given as cash
      employeePayouts
    };
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-teal-500',
      'bg-green-500',
      'bg-orange-500',
      'bg-rose-500',
      'bg-violet-500'
    ];
    return colors[index % colors.length];
  };

  const contractStats = calculateContractStats();
  const permanentStats = calculatePermanentStats();

  const displayEmployees = activeTab === 'contract'
    ? filteredEmployees.filter(e => e.type === 'contract')
    : filteredEmployees.filter(e => e.type === 'fulltime');

  // Check permissions for payout
  const canAddPayout = () => {
    if (userRole === 'audit') return false; // Audit users cannot add payouts
    if (activeTab === 'contract' && userRole === 'manager') return true;
    if (activeTab === 'permanent' && userRole === 'cluster_head') return true;
    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-gray-500">Loading payroll data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Payroll Management</h1>
            <p className="text-sm sm:text-base text-gray-500">Manage and track employee payments</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <div className="flex gap-8 px-6">
              {/* My Payouts tab - for managers to see their own payroll */}
              {userRole === 'manager' && userEmployeeId && (
                <button
                  onClick={() => setActiveTab('my-payouts')}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === 'my-payouts'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  My Payouts
                </button>
              )}
              <button
                onClick={() => setActiveTab('contract')}
                className={`py-4 border-b-2 transition-colors ${
                  activeTab === 'contract'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Contract Employees
              </button>
              {/* Only show Permanent Employees tab for Cluster Heads and Audit Users */}
              {(userRole === 'cluster_head' || userRole === 'audit') && (
                <button
                  onClick={() => setActiveTab('permanent')}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === 'permanent'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Permanent Employees
                </button>
              )}
              {/* Only show Salary Advances tab for Cluster Heads and Audit Users */}
              {(userRole === 'cluster_head' || userRole === 'audit') && (
                <button
                  onClick={() => setActiveTab('advances')}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === 'advances'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>Salary Advances</span>
                    {salaryAdvances.filter(a => a.status === 'pending').length > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {salaryAdvances.filter(a => a.status === 'pending').length}
                      </span>
                    )}
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons and Date Filter */}
          <div className="p-6 border-b border-gray-200 space-y-4">
            <div className="flex gap-4 flex-wrap">
              {/* Add Payout button - shown based on permissions */}
              {canAddPayout() && (
                <button
                  onClick={() => {
                    setPayoutData(prev => ({ ...prev, forMonth: defaultForMonth(prev.date) }));
                    setShowPayoutModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <DollarSign className="w-4 h-4" />
                  Add Payout
                </button>
              )}
            </div>
            
            {/* Date Range Filter */}
            <div className="bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-700 flex-shrink-0" />
                  <span className="text-gray-900">View Period:</span>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setViewMode('current')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base transition-colors ${
                      viewMode === 'current'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-orange-50'
                    }`}
                  >
                    Current Month
                  </button>
                  <button
                    onClick={() => setViewMode('last')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base transition-colors ${
                      viewMode === 'last'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-orange-50'
                    }`}
                  >
                    Last Month
                  </button>
                  <button
                    onClick={() => setViewMode('custom')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base transition-colors ${
                      viewMode === 'custom'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-orange-50'
                    }`}
                  >
                    Custom Range
                  </button>
                </div>

                {viewMode === 'current' ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg self-start">
                    <span className="text-gray-900 font-medium">{currentMonth.monthName}</span>
                  </div>
                ) : viewMode === 'last' ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg self-start">
                    <span className="text-gray-900 font-medium">{lastMonth.monthName}</span>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center flex-wrap">
                    <DatePicker
                      label="From:"
                      value={customStartDate}
                      onChange={setCustomStartDate}
                    />
                    <DatePicker
                      label="To:"
                      value={customEndDate}
                      onChange={setCustomEndDate}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contract Employees Tab */}
          {activeTab === 'contract' && (() => {
            const contractEmployees = employees.filter(e => e.type === 'contract');
            // employeesForDisplay (active + archived) so an archived contract employee's
            // past payouts still match this filter instead of silently disappearing once
            // they're no longer an active employee - the payout records themselves were
            // never deleted, only this active-only lookup was hiding them.
            const contractPayouts = filteredPayouts.filter(p => {
              const emp = employeesForDisplay.find(e => e.id === p.employeeId);
              return emp?.type === 'contract';
            });

            console.log('Rendering contract tab');
            console.log('Total employees:', employees.length);
            console.log('Contract employees:', contractEmployees.length, contractEmployees);
            console.log('Contract payouts:', contractPayouts.length, contractPayouts);

            const totalPayout = contractPayouts.reduce((sum, p) => sum + p.amount, 0);

            return (
              <div className="p-6">
                {/* Employees Section */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Contract Employees</h2>
                      <p className="text-sm text-gray-600">Daily rate workers</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Employees</div>
                      <div className="text-2xl text-blue-600">{contractEmployees.length}</div>
                    </div>
                  </div>

                  {contractEmployees.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No contract employees yet</p>
                      <p className="text-sm mt-2">Contact your cluster head to add employees</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {contractEmployees.map((emp, index) => {
                        const empPayouts = contractPayouts.filter(p => p.employeeId === emp.id);
                        const totalPaid = empPayouts.reduce((sum, p) => sum + p.amount, 0);
                        const daysWorked = new Set(empPayouts.map(p => p.date)).size;

                        return (
                          <div key={emp.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white`}>
                                  {getInitials(emp.name)}
                                </div>
                                <div>
                                  <div className="text-gray-900">{emp.name}</div>
                                  <div className="text-xs text-gray-500">{emp.employeeId}</div>
                                </div>
                              </div>
                              {userRole !== 'audit' && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingEmployee(emp);
                                      setShowEditEmployee(true);
                                    }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Edit employee"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEmployee(emp.id)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Delete employee"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {emp.role && (
                              <div className="mb-2">
                                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                                  {emp.role}
                                </span>
                              </div>
                            )}

                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Phone:</span>
                                <span className="text-gray-900">{emp.phone}</span>
                              </div>
                              {emp.dailyRate && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Daily Rate:</span>
                                  <span className="text-green-600">₹{emp.dailyRate}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-gray-600">Days Worked:</span>
                                <span className="text-gray-900">{daysWorked}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-gray-200">
                                <span className="text-gray-600">Total Paid:</span>
                                <span className="text-gray-900">₹{totalPaid.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Payouts Section */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Recent Payouts</h2>
                      <p className="text-sm text-gray-600">Individual payout records for {viewMode === 'current' ? currentMonth.monthName : 'selected period'}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Payout</div>
                      <div className="text-2xl text-green-600">₹{totalPayout.toLocaleString()}</div>
                    </div>
                  </div>

                  {contractPayouts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No payouts recorded for this period</p>
                      <p className="text-sm mt-2">Add payouts to track contract employee payments</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee Name</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Date</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">Amount</th>
                            {userRole !== 'audit' && (
                              <th className="text-right py-3 px-4 text-sm text-gray-600">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {contractPayouts
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((payout, index) => {
                              const employee = employeesForDisplay.find(e => e.id === payout.employeeId);
                              return (
                                <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-sm`}>
                                        {getInitials(payout.employeeName)}
                                      </div>
                                      <div>
                                        <div className="text-gray-900">{payout.employeeName}</div>
                                        {employee?.role && (
                                          <div className="text-xs text-gray-500">{employee.role}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className="text-sm text-gray-600">{employee?.employeeId || '-'}</span>
                                  </td>
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-900">
                                        {new Date(payout.date).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <span className="text-gray-900">₹{payout.amount.toLocaleString()}</span>
                                  </td>
                                  {userRole !== 'audit' && (
                                    <td className="py-4 px-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => {
                                            setEditingPayout(payout);
                                            setShowEditPayout(true);
                                          }}
                                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                          title="Edit payout"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeletePayout(payout.id)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete payout"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* My Payouts Tab - For managers to view their own payroll */}
          {activeTab === 'my-payouts' && userEmployeeId && (() => {
            // Get ALL payouts for this employee (not filtered by date range)
            const allMyPayouts = payouts.filter(p => p.employeeId === userEmployeeId);
            
            // Get employee type
            const currentEmployee = employees.find(e => e.employeeId === userEmployeeId);
            const employeeType = currentEmployee?.type || 'fulltime';
            
            // Get salary advances for this manager
            const myAdvances = salaryAdvances.filter(a => a.employeeId === currentEmployee?.id);
            const hasActiveAdvance = myAdvances.some(adv => 
              adv.status === 'pending' || (adv.status === 'approved' && adv.remainingAmount > 0)
            );
            
            // Group payouts by month (last 12 months from current date)
            const now = new Date();
            const currentDay = now.getDate();
            const monthlyPayslips: Array<{
              month: string;
              year: string;
              payouts: Payout[];
              total: number;
              personalExpenses: number;
              isAvailable: boolean;
            }> = [];
            
            for (let i = 0; i < 12; i++) {
              const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const monthName = date.toLocaleDateString('en-US', { month: 'long' });
              const year = date.getFullYear().toString();
              const monthNumber = date.getMonth() + 1;
              
              // Get payouts for this month - forMonth (when set) is which month a payout
              // is actually FOR, not when it was paid, so a backlogged salary paid late
              // lands on its real month's payslip instead of inflating the paid-in month.
              const monthKeyForPayouts = `${date.getFullYear()}-${String(monthNumber).padStart(2, '0')}`;
              const monthPayouts = allMyPayouts.filter(p => payoutMonth(p) === monthKeyForPayouts);

              // Available as soon as a payout for this month is actually logged - no
              // arbitrary date-based waiting period.
              const isAvailable = monthPayouts.length > 0;

              // Personal expenses mapped to this month. overhead.employeeId stores the
              // employee ID string (e.g., "BM004"), not the internal database ID.
              const monthPersonalExpenses = personalExpensesForMonth(overheads, userEmployeeId, monthKeyForPayouts);

              // Net pay - the same function the payslip and the employee dashboard use.
              const total = computeMonthlyPay(monthPayouts, monthPersonalExpenses).net;
              
              monthlyPayslips.push({
                month: monthName,
                year,
                payouts: monthPayouts,
                total,
                personalExpenses: monthPersonalExpenses,
                isAvailable
              });
            }

            // Filtered payouts for the summary card (respects date filter)
            const myPayouts = filteredPayouts.filter(p => p.employeeId === userEmployeeId);
            const myPersonalExpenses = currentEmployee ? calculatePersonalExpenses(currentEmployee.id) : 0;
            // Same net-pay function as the payslips (gross includes advance instalments
            // recovered from the transfers; net = transfers - personal expenses).
            const myPay = computeMonthlyPay(myPayouts, myPersonalExpenses);
            const totalPayout = myPay.gross;
            const myNetAmount = myPay.net;

            return (
              <div className="p-4 sm:p-6">
                <div className="mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">My Payout History</h2>
                      <p className="text-sm text-gray-600">
                        View your salary records and download monthly payslips
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                      {/* View All Payments Button */}
                      <button
                        onClick={() => {
                          setSelectedEmployeeForHistory(currentEmployee!);
                          setShowPaymentHistory(true);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-lg hover:shadow-xl whitespace-nowrap"
                      >
                        <FileText className="w-4 h-4" />
                        View All Payments
                      </button>

                      {/* Apply for Salary Advance Button - Only for permanent employees */}
                      {employeeType === 'fulltime' && (
                        <button
                          onClick={() => setShowAdvanceModal(true)}
                          disabled={hasActiveAdvance}
                          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                            hasActiveAdvance
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700 shadow-md'
                      }`}
                      title={hasActiveAdvance ? 'You already have an active salary advance' : 'Apply for salary advance'}
                    >
                      <CreditCard className="w-4 h-4" />
                      {hasActiveAdvance ? 'Advance Active' : 'Apply for Advance'}
                    </button>
                  )}
                    </div>
                  </div>
                </div>
                
                {/* Salary Advances Status - Show if there are any advances */}
                {myAdvances.length > 0 && (
                  <div className="mb-6 space-y-3">
                    {myAdvances.map((advance) => (
                      <div
                        key={advance.id}
                        className={`border-2 rounded-lg p-4 ${
                          advance.status === 'pending'
                            ? 'border-yellow-300 bg-yellow-50'
                            : advance.status === 'approved'
                            ? 'border-green-300 bg-green-50'
                            : 'border-red-300 bg-red-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {advance.status === 'pending' && (
                                <>
                                  <Clock className="w-5 h-5 text-yellow-600" />
                                  <span className="font-medium text-yellow-900">Advance Request Pending</span>
                                </>
                              )}
                              {advance.status === 'approved' && (
                                <>
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                  <span className="font-medium text-green-900">Advance Approved</span>
                                </>
                              )}
                              {advance.status === 'rejected' && (
                                <>
                                  <XCircle className="w-5 h-5 text-red-600" />
                                  <span className="font-medium text-red-900">Advance Rejected</span>
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Amount</p>
                                <p className="font-semibold text-gray-900">₹{advance.amount.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Monthly Deduction</p>
                                <p className="font-semibold text-gray-900">₹{advance.monthlyDeduction.toLocaleString()}</p>
                              </div>
                              {advance.status === 'approved' && (
                                <div>
                                  <p className="text-xs text-gray-600 mb-1">Remaining</p>
                                  <p className="font-semibold text-gray-900">₹{advance.remainingAmount.toLocaleString()}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Request Date</p>
                                <p className="text-sm text-gray-900">
                                  {new Date(advance.requestDate).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </p>
                              </div>
                            </div>
                            {advance.status === 'approved' && (
                              <div className="mt-3 pt-3 border-t border-gray-300">
                                <p className="text-xs text-gray-600 mb-2">Deduction Period</p>
                                <p className="text-sm text-gray-900">
                                  {(() => {
                                    const [startYear, startMonth] = advance.startMonth.split('-');
                                    const [endYear, endMonth] = advance.endMonth.split('-');
                                    const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, 1);
                                    const endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, 1);
                                    const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                                    const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                                    return `${startFormatted} to ${endFormatted} (${advance.installments} months)`;
                                  })()}
                                </p>
                              </div>
                            )}
                            {advance.status === 'rejected' && advance.rejectionReason && (
                              <div className="mt-2 pt-2 border-t border-red-200">
                                <p className="text-xs text-red-600 mb-1">Rejection Reason</p>
                                <p className="text-sm text-red-900">{advance.rejectionReason}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary Card */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Period</p>
                        <p className="text-sm text-gray-700 font-medium">
                          {viewMode === 'current' 
                            ? currentMonth.monthName
                            : viewMode === 'last'
                            ? lastMonth.monthName
                            : `${customStartDate} to ${customEndDate}`
                          }
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 mb-1">{myPayouts.length} payment{myPayouts.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-green-200 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-600">Gross Pay</p>
                        <p className="text-2xl text-green-600">₹{totalPayout.toLocaleString()}</p>
                      </div>
                      
                      {myPay.advanceRecovered > 0 && (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Minus className="w-4 h-4 text-red-600" />
                            <p className="text-sm text-gray-600">Salary Advance Recovered</p>
                          </div>
                          <p className="text-xl text-red-600">₹{myPay.advanceRecovered.toLocaleString()}</p>
                        </div>
                      )}

                      {myPersonalExpenses > 0 && (
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Minus className="w-4 h-4 text-red-600" />
                            <p className="text-sm text-gray-600">Personal Expenses</p>
                          </div>
                          <p className="text-xl text-red-600">₹{myPersonalExpenses.toLocaleString()}</p>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center pt-3 border-t border-green-300">
                        <p className="text-base font-semibold text-gray-900">Net Amount</p>
                        <p className="text-3xl font-bold text-green-700">₹{myNetAmount.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monthly Payslips Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-orange-600" />
                    <h3 className="text-lg font-bold text-gray-900">Monthly Payslips</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Payslips are available for download after the 4th of each month
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {monthlyPayslips.map((slip, index) => (
                      <div 
                        key={index}
                        className={`border-2 rounded-xl p-4 transition-all ${
                          slip.isAvailable && (slip.payouts.length > 0 || (slip.personalExpenses && slip.personalExpenses > 0))
                            ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-rose-50 hover:shadow-lg'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <h4 className="text-gray-900 font-semibold truncate">{slip.month} {slip.year}</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              {slip.payouts.length} payout{slip.payouts.length !== 1 ? 's' : ''}
                              {slip.personalExpenses > 0 && ` − ₹${slip.personalExpenses.toLocaleString('en-IN')} advance deducted`}
                            </p>
                          </div>
                          {slip.isAvailable && (slip.payouts.length > 0 || (slip.personalExpenses && slip.personalExpenses > 0)) ? (
                            <button
                              onClick={() => generatePayslip(
                                userName || 'Employee',
                                userEmployeeId,
                                slip.month,
                                slip.year,
                                slip.payouts,
                                employeeType,
                                slip.personalExpenses || 0,
                                currentEmployee?.salaryStructure
                              )}
                              className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm flex-shrink-0"
                              title="Download Payslip"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </button>
                          ) : (
                            <div className="px-3 py-2 bg-gray-300 text-gray-600 rounded-lg text-sm cursor-not-allowed flex-shrink-0 text-center">
                              {(slip.payouts.length === 0 && (!slip.personalExpenses || slip.personalExpenses === 0)) ? 'No Data' : 'Not Available'}
                            </div>
                          )}
                        </div>
                        <div className="pt-3 border-t border-gray-300">
                          <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                          <p className="text-xl text-gray-900 font-semibold">
                            ₹{slip.total.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payouts Table */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Payment Details</h3>
                </div>
                {myPayouts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                    <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No payouts found for the selected period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left py-3 px-4 text-sm text-gray-600">Date</th>
                          <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                          <th className="text-right py-3 px-4 text-sm text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myPayouts
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((payout) => (
                            <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-4 px-4">
                                <span className="text-sm text-gray-900">
                                  {new Date(payout.date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <span className="text-sm text-gray-600">{userEmployeeId}</span>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <span className="text-green-600">₹{payout.amount.toLocaleString()}</span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Permanent Employees Tab */}
          {activeTab === 'permanent' && (() => {
            const permanentEmployees = employees.filter(e => e.type === 'fulltime');
            // See the Contract tab's identical comment above - employeesForDisplay so an
            // archived permanent employee's past payouts still show here.
            const permanentPayouts = filteredPayouts.filter(p => {
              const emp = employeesForDisplay.find(e => e.id === p.employeeId);
              return emp?.type === 'fulltime';
            });

            const totalPayout = permanentStats.totalPayout; // Use calculated stats which includes personal expenses

            return (
              <div className="p-6">
                {/* Employees Section */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Permanent Employees</h2>
                      <p className="text-sm text-gray-600">Full-time employees - Monthly/periodic payouts</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Employees</div>
                      <div className="text-2xl text-blue-600">{permanentEmployees.length}</div>
                    </div>
                  </div>

                  {permanentEmployees.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No permanent employees yet</p>
                      <p className="text-sm mt-2">Contact your cluster head to add employees</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee Name</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Role</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Phone</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Last Payout</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">
                              Total Paid ({viewMode === 'current' ? 'This Month' : viewMode === 'last' ? 'Last Month' : 'Period'})
                            </th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">
                              Personal Expenses ({viewMode === 'current' ? 'This Month' : viewMode === 'last' ? 'Last Month' : 'Period'})
                            </th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">
                              Net Amount
                            </th>
                            {userRole === 'cluster_head' && (
                              <th className="text-right py-3 px-4 text-sm text-gray-600">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {permanentEmployees.map((emp, index) => {
                            const empPayouts = permanentPayouts.filter(p => p.employeeId === emp.id);
                            const totalPaid = empPayouts.reduce((sum, p) => sum + p.amount, 0);
                            const personalExpenses = calculatePersonalExpenses(emp.id);
                            // Net Amount = Payouts minus salary-advance-linked deductions already given as cash
                            const netAmount = totalPaid - personalExpenses;
                            const lastPayout = empPayouts.length > 0 
                              ? empPayouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                              : null;

                            return (
                              <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-4 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-sm`}>
                                      {getInitials(emp.name)}
                                    </div>
                                    <button
                                      onClick={() => {
                                        setSelectedEmployeeForHistory(emp);
                                        setShowPaymentHistory(true);
                                      }}
                                      className="text-gray-900 hover:text-orange-600 hover:underline transition-colors text-left"
                                    >
                                      {emp.name}
                                    </button>
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  <span className="text-sm text-gray-600">{emp.employeeId}</span>
                                </td>
                                <td className="py-4 px-4">
                                  {emp.role && (
                                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                                      {emp.role}
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  <span className="text-sm text-gray-600">{emp.phone}</span>
                                </td>
                                <td className="py-4 px-4">
                                  {lastPayout ? (
                                    <div>
                                      <div className="text-gray-900">
                                        {new Date(lastPayout.date).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </div>
                                      <div className="text-xs text-gray-500">₹{lastPayout.amount.toLocaleString()}</div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-sm">No payouts</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <span className="text-green-600">₹{totalPaid.toLocaleString()}</span>
                                </td>
                                <td className="py-4 px-4 text-right">
                                  {personalExpenses > 0 ? (
                                    <span className="text-red-600">- ₹{personalExpenses.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-gray-400">₹0</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <span className={`font-semibold ${netAmount < 0 ? 'text-red-600' : netAmount > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                    ₹{netAmount.toLocaleString()}
                                  </span>
                                </td>
                                {userRole === 'cluster_head' && (
                                  <td className="py-4 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingEmployee(emp);
                                          setShowEditEmployee(true);
                                        }}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit employee"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEmployee(emp.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete employee"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Payouts Section */}
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Payout History</h2>
                      <p className="text-sm text-gray-600">
                        Salary payments for {viewMode === 'current' ? currentMonth.monthName : viewMode === 'last' ? lastMonth.monthName : 'selected period'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 mb-1">Total Payout</div>
                      <div className="text-2xl text-green-600">₹{totalPayout.toLocaleString()}</div>
                    </div>
                  </div>

                  {permanentPayouts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No payouts recorded for this period</p>
                      <p className="text-sm mt-2">Add payouts to track permanent employee payments</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee Name</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Employee ID</th>
                            <th className="text-left py-3 px-4 text-sm text-gray-600">Date</th>
                            <th className="text-right py-3 px-4 text-sm text-gray-600">Amount</th>
                            {userRole === 'cluster_head' && (
                              <th className="text-right py-3 px-4 text-sm text-gray-600">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {permanentPayouts
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((payout, index) => {
                              const employee = employeesForDisplay.find(e => e.id === payout.employeeId);
                              return (
                                <tr key={payout.id} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-sm`}>
                                        {getInitials(payout.employeeName)}
                                      </div>
                                      <div>
                                        <div className="text-gray-900">{payout.employeeName}</div>
                                        {employee?.role && (
                                          <div className="text-xs text-gray-500">{employee.role}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className="text-sm text-gray-600">{employee?.employeeId || '-'}</span>
                                  </td>
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-900">
                                        {new Date(payout.date).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <span className="text-gray-900">₹{payout.amount.toLocaleString()}</span>
                                  </td>
                                  {userRole === 'cluster_head' && (
                                    <td className="py-4 px-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => {
                                            setEditingPayout(payout);
                                            setShowEditPayout(true);
                                          }}
                                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                          title="Edit payout"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeletePayout(payout.id)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete payout"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Salary Advances Tab - Only for Cluster Heads and Audit Users */}
          {activeTab === 'advances' && (userRole === 'cluster_head' || userRole === 'audit') && (() => {
            const pendingAdvances = salaryAdvances.filter(a => a.status === 'pending');
            const approvedAdvances = salaryAdvances.filter(a => a.status === 'approved');
            const rejectedAdvances = salaryAdvances.filter(a => a.status === 'rejected');

            return (
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Salary Advance Requests</h2>
                  <p className="text-sm text-gray-600">
                    Review and manage employee salary advance requests
                  </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl shadow-lg shadow-yellow-500/20 p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-yellow-100 mb-1">Pending Requests</p>
                        <p className="text-2xl font-semibold">{pendingAdvances.length}</p>
                      </div>
                      <Clock className="w-10 h-10 text-yellow-100" />
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-lg shadow-emerald-500/20 p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-emerald-100 mb-1">Approved</p>
                        <p className="text-2xl font-semibold">{approvedAdvances.length}</p>
                      </div>
                      <CheckCircle className="w-10 h-10 text-emerald-100" />
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl shadow-lg shadow-red-500/20 p-4 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-red-100 mb-1">Rejected</p>
                        <p className="text-2xl font-semibold">{rejectedAdvances.length}</p>
                      </div>
                      <XCircle className="w-10 h-10 text-red-100" />
                    </div>
                  </div>
                </div>

                {/* Pending Requests Section */}
                {pendingAdvances.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      Pending Requests
                    </h3>
                    <div className="space-y-4">
                      {pendingAdvances.map((advance) => (
                        <div 
                          key={advance.id}
                          className="border-2 border-yellow-300 bg-yellow-50 rounded-xl p-6"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-900 mb-1">
                                {advance.employeeName}
                              </h4>
                              <p className="text-sm text-gray-600 mb-2">
                                Employee ID: {advance.employeeEmployeeId}
                              </p>
                              <p className="text-sm text-gray-500">
                                Requested on {new Date(advance.requestDate).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600 mb-1">Advance Amount</p>
                              <p className="text-3xl font-bold text-orange-600">
                                ₹{advance.amount.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>

                          {/* Deduction Details */}
                          <div className="bg-white border border-yellow-200 rounded-lg p-4 mb-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Monthly Deduction</p>
                                <p className="text-lg font-semibold text-gray-900">
                                  ₹{advance.monthlyDeduction.toLocaleString('en-IN')}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Installments</p>
                                <p className="text-lg font-semibold text-gray-900">{advance.installments} months</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Start Month</p>
                                <p className="text-sm font-medium text-gray-900">
                                  {(() => {
                                    const [year, month] = advance.startMonth.split('-');
                                    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                                    return date.toLocaleDateString('en-US', {
                                      month: 'short',
                                      year: 'numeric'
                                    });
                                  })()}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">End Month</p>
                                <p className="text-sm font-medium text-gray-900">
                                  {(() => {
                                    const [year, month] = advance.endMonth.split('-');
                                    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                                    return date.toLocaleDateString('en-US', {
                                      month: 'short',
                                      year: 'numeric'
                                    });
                                  })()}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons - Only for Cluster Heads */}
                          {userRole === 'cluster_head' && (
                            <div className="flex gap-3">
                              <button
                                onClick={() => handleApproveAdvance(advance.id)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-md font-medium"
                              >
                                <CheckCircle className="w-5 h-5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleRejectAdvance(advance.id)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg hover:from-red-700 hover:to-rose-700 transition-all shadow-md font-medium"
                              >
                                <XCircle className="w-5 h-5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approved Requests Section */}
                {approvedAdvances.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Approved Advances
                    </h3>
                    <div className="space-y-4">
                      {approvedAdvances.map((advance) => (
                        <div 
                          key={advance.id}
                          className="border-2 border-green-300 bg-green-50 rounded-xl p-6"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-900 mb-1">
                                {advance.employeeName}
                              </h4>
                              <p className="text-sm text-gray-600 mb-1">
                                Employee ID: {advance.employeeEmployeeId}
                              </p>
                              <p className="text-sm text-gray-500">
                                Approved on {new Date(advance.approvedDate || '').toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600 mb-1">Amount</p>
                              <p className="text-2xl font-bold text-green-600">
                                ₹{advance.amount.toLocaleString('en-IN')}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                Remaining: ₹{advance.remainingAmount.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>

                          {/* Deduction Progress */}
                          <div className="bg-white border border-green-200 rounded-lg p-4">
                            <p className="text-sm font-semibold text-gray-900 mb-3">Deduction Progress</p>
                            <div className="space-y-2">
                              {advance.deductions.map((deduction: api.SalaryAdvanceDeduction, idx: number) => (
                                <div 
                                  key={idx}
                                  className={`flex items-center justify-between p-2 rounded-lg ${
                                    deduction.deducted 
                                      ? 'bg-green-100 border border-green-200' 
                                      : 'bg-gray-50 border border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {deduction.deducted ? (
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    ) : (
                                      <Clock className="w-4 h-4 text-gray-400" />
                                    )}
                                    <span className="text-sm text-gray-900">
                                      {new Date(deduction.month + '-01').toLocaleDateString('en-US', {
                                        month: 'long',
                                        year: 'numeric'
                                      })}
                                    </span>
                                  </div>
                                  <span className={`text-sm font-semibold ${
                                    deduction.deducted ? 'text-green-700' : 'text-gray-700'
                                  }`}>
                                    ₹{deduction.amount.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejected Requests Section */}
                {rejectedAdvances.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      Rejected Requests
                    </h3>
                    <div className="space-y-4">
                      {rejectedAdvances.map((advance) => (
                        <div 
                          key={advance.id}
                          className="border-2 border-red-300 bg-red-50 rounded-xl p-6"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-900 mb-1">
                                {advance.employeeName}
                              </h4>
                              <p className="text-sm text-gray-600 mb-1">
                                Employee ID: {advance.employeeEmployeeId}
                              </p>
                              <p className="text-sm text-gray-500">
                                Rejected on {new Date(advance.approvedDate || '').toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600 mb-1">Requested Amount</p>
                              <p className="text-2xl font-bold text-red-600">
                                ₹{advance.amount.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>

                          {advance.rejectionReason && (
                            <div className="bg-white border border-red-200 rounded-lg p-3">
                              <p className="text-sm font-medium text-red-800 mb-1">Rejection Reason:</p>
                              <p className="text-sm text-red-700">{advance.rejectionReason}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Requests */}
                {salaryAdvances.length === 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
                    <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium mb-2">No Salary Advance Requests</p>
                    <p className="text-sm text-gray-500">
                      Employees can apply for salary advances from their dashboard
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Salary Advance Modal for Managers */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Apply for Salary Advance</h2>
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-orange-800 font-medium mb-1">Recovery Terms</p>
                    <p className="text-sm text-orange-700">
                      The advance will be automatically deducted from your salary over the next 4 months in equal installments.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Advance Amount *</label>
                <input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="Enter amount (e.g., 10000)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              {advanceAmount && !isNaN(parseFloat(advanceAmount)) && parseFloat(advanceAmount) > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-2">Monthly Deduction Preview:</p>
                  <p className="text-2xl font-bold text-orange-600">
                    ₹{(parseFloat(advanceAmount) / 4).toLocaleString('en-IN')}/month
                  </p>
                  <p className="text-xs text-gray-600 mt-1">for 4 months</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowAdvanceModal(false);
                  setAdvanceAmount('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySalaryAdvance}
                disabled={!advanceAmount || isNaN(parseFloat(advanceAmount)) || parseFloat(advanceAmount) <= 0}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditEmployee && editingEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Employee</h2>
              <button
                onClick={() => setShowEditEmployee(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Employee ID</label>
                <input
                  type="text"
                  value={editingEmployee.employeeId}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Phone *</label>
                <input
                  type="tel"
                  value={editingEmployee.phone}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              {editingEmployee.type === 'contract' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Daily Rate (Optional)</label>
                  <input
                    type="number"
                    value={editingEmployee.dailyRate || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, dailyRate: parseFloat(e.target.value) || undefined })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}
              {editingEmployee.type === 'fulltime' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-gray-700">Salary Structure (Optional)</label>
                    <button
                      type="button"
                      onClick={() => setEditingEmployee({
                        ...editingEmployee,
                        salaryStructure: [...(editingEmployee.salaryStructure || []), { label: '', amount: 0 }],
                      })}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      + Add Component
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(editingEmployee.salaryStructure || []).map((comp, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={comp.label}
                          onChange={(e) => {
                            const updated = [...(editingEmployee.salaryStructure || [])];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setEditingEmployee({ ...editingEmployee, salaryStructure: updated });
                          }}
                          placeholder="e.g. Basic, HRA, Conveyance"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          type="number"
                          value={comp.amount || ''}
                          onChange={(e) => {
                            const updated = [...(editingEmployee.salaryStructure || [])];
                            updated[idx] = { ...updated[idx], amount: parseFloat(e.target.value) || 0 };
                            setEditingEmployee({ ...editingEmployee, salaryStructure: updated });
                          }}
                          placeholder="Amount"
                          className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (editingEmployee.salaryStructure || []).filter((_, i) => i !== idx);
                            setEditingEmployee({ ...editingEmployee, salaryStructure: updated });
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {(editingEmployee.salaryStructure || []).length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Fixed total: ₹{(editingEmployee.salaryStructure || []).reduce((sum, c) => sum + (c.amount || 0), 0).toLocaleString()}/month
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    💡 These fixed components appear on the payslip every month. A variable/incentive amount is entered separately at payout time.
                  </p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowEditEmployee(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditEmployee}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payout Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Payout</h2>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Select Employees *</label>
                <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                  {displayEmployees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={payoutData.employeeIds.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPayoutData({ ...payoutData, employeeIds: [...payoutData.employeeIds, emp.id] });
                          } else {
                            setPayoutData({ ...payoutData, employeeIds: payoutData.employeeIds.filter(id => id !== emp.id) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-900">{emp.name} ({emp.employeeId})</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">{payoutData.employeeIds.length} employee(s) selected</p>
              </div>
              {activeTab === 'contract' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Pay For *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPayoutData({ ...payoutData, periodType: 'days' })}
                      className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${payoutData.periodType === 'days' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayoutData({ ...payoutData, periodType: 'month' })}
                      className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${payoutData.periodType === 'month' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      Month
                    </button>
                  </div>
                </div>
              )}
              {activeTab === 'contract' && payoutData.periodType === 'days' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Number of Days *</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={payoutData.days}
                      onChange={(e) => setPayoutData({ ...payoutData, days: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter number of days"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Rate per Day (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={payoutData.ratePerDay}
                      onChange={(e) => setPayoutData({ ...payoutData, ratePerDay: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter rate per day"
                    />
                  </div>
                  {payoutData.days && payoutData.employeeIds.length > 0 && (
                    <div className="col-span-2 mt-1 space-y-1">
                      {payoutData.employeeIds.map((empId) => {
                        const employee = employees.find((e) => e.id === empId);
                        const rate = employee?.dailyRate || parseFloat(payoutData.ratePerDay) || 0;
                        const amount = (parseFloat(payoutData.days) || 0) * rate;
                        return (
                          <p key={empId} className="text-xs text-gray-500">
                            {employee?.name}: {payoutData.days} day(s) × ₹{rate}/day = <span className="font-medium text-gray-700">₹{amount.toLocaleString()}</span>
                            {!rate && <span className="text-amber-600"> (enter a rate per day above)</span>}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payoutData.amount}
                    onChange={(e) => setPayoutData({ ...payoutData, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="Total salary paid"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 Leave blank if you're only paying the Variable Pay amount below - it'll be used as the payout amount.
                  </p>
                </div>
              )}
              <DatePicker
                label="Date *"
                value={payoutData.date}
                onChange={(date) => setPayoutData({ ...payoutData, date, forMonth: defaultForMonth(date) })}
                className="w-full"
              />
              <div>
                <label className="block text-sm text-gray-700 mb-2">Salary For Month *</label>
                <input
                  type="month"
                  value={payoutData.forMonth}
                  onChange={(e) => setPayoutData({ ...payoutData, forMonth: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {activeTab === 'permanent'
                    ? `💡 Paid on or before the ${SALARY_PAID_BY_DAY}th? This defaults to last month's salary. Salary advance instalments are recovered for this month.`
                    : "💡 Defaults to the payment date's month - change this if paying late (e.g. paid on the 5th for last month's work)"}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Transaction ID</label>
                <input
                  type="text"
                  value={payoutData.transactionId}
                  onChange={(e) => setPayoutData({ ...payoutData, transactionId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. UTR / UPI reference number"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Bank/UPI reference for this transfer - kept on record and shown on the payslip
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Paid from</label>
                <select
                  value={payoutData.paidFrom}
                  onChange={(e) => setPayoutData({ ...payoutData, paidFrom: e.target.value as 'paytm' | 'bank' | 'cash' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="paytm">Paytm / UPI balance</option>
                  <option value="bank">Bank transfer</option>
                  <option value="cash">Cash</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  💡 Only "Paytm / UPI balance" payouts are deducted from a store's Online Cash (Paytm) reconciliation. Bank / cash are still real expenses, just settled elsewhere.
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Variable Pay (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payoutData.variablePay}
                  onChange={(e) => setPayoutData({ ...payoutData, variablePay: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Optional - this month's incentive/performance pay"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Shown as its own line on the payslip, alongside the employee's fixed salary components
                </p>
                {approvedVariablePay !== null && <p className="text-xs text-emerald-700 mt-1">Approved in Team KPIs for this month: ₹{approvedVariablePay.toLocaleString('en-IN')}</p>}
              </div>
              {payoutData.employeeIds.length > 0 && (() => {
                const payingByDays = activeTab === 'contract' && payoutData.periodType === 'days';
                const days = parseFloat(payoutData.days) || 0;
                const rows = payoutData.employeeIds
                  .map((empId) => {
                    const employee = employees.find((e) => e.id === empId);
                    const grossAmount = payingByDays ? days * (employee?.dailyRate || parseFloat(payoutData.ratePerDay) || 0) : (parseFloat(payoutData.amount) || parseFloat(payoutData.variablePay) || 0);
                    const recovery = planAdvanceRecovery(empId, salaryMonthOf({ forMonth: payoutData.forMonth, date: payoutData.date }), grossAmount);
                    return { employee, recovery, grossAmount };
                  })
                  .filter((r) => r.recovery.total > 0);
                if (rows.length === 0) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-amber-900">Salary advance deductions will apply:</p>
                    {rows.map(({ employee, recovery, grossAmount }) => (
                      <p key={employee?.id} className="text-xs text-amber-800">
                        {employee?.name}: ₹{grossAmount.toLocaleString()} − ₹{recovery.total.toLocaleString()} advance ({recovery.items.map(i => i.month).join(', ')}) = <span className="font-semibold">₹{Math.max(0, grossAmount - recovery.total).toLocaleString()} net</span>
                      </p>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowPayoutModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayout}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Payout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payout Modal */}
      {showEditPayout && editingPayout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Payout</h2>
              <button
                onClick={() => setShowEditPayout(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Employee</label>
                <input
                  type="text"
                  value={editingPayout.employeeName}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingPayout.amount}
                  onChange={(e) => setEditingPayout({ ...editingPayout, amount: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <DatePicker
                label="Date *"
                value={editingPayout.date}
                onChange={(date) => setEditingPayout({ ...editingPayout, date })}
                className="w-full"
              />
              <div>
                <label className="block text-sm text-gray-700 mb-2">Salary For Month *</label>
                <input
                  type="month"
                  value={editingPayout.forMonth || editingPayout.date.slice(0, 7)}
                  onChange={(e) => setEditingPayout({ ...editingPayout, forMonth: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Which month this salary belongs to - change this if it was paid late
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowEditPayout(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditPayout}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {showPaymentHistory && selectedEmployeeForHistory && (
        <PaymentHistoryModal
          employee={selectedEmployeeForHistory}
          payouts={payouts.filter(p => p.employeeId === selectedEmployeeForHistory.id)}
          personalExpenses={overheads.filter(o => o.category === 'personal_expense' && o.employeeId === selectedEmployeeForHistory.employeeId)}
          onClose={() => {
            setShowPaymentHistory(false);
            setSelectedEmployeeForHistory(null);
          }}
        />
      )}

    </div>
  );
}