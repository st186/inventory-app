// Team → Pay (owner, managers, incharges, audit) and My pay for managers and incharges.
//
// Same data and rules as before (the arithmetic is in team/payrollMath.ts and team/pay/payView.ts):
//   - who can see what: permanent staff and salary advances for the owner and audit; contract
//     staff for everyone here; an incharge sees contract staff in scope and the permanent staff
//     who report to them;
//   - who can pay: managers and incharges contract staff, the owner permanent staff, audit nobody;
//   - a payout is the net amount actually transferred, after any salary-advance instalment due for
//     the salary month; a salary paid on or before the 10th is last month's.
import { useEffect, useMemo, useState } from 'react';
import * as api from '../utils/api';
import { salaryMonthOf } from '../utils/payslip';
import { useT } from '../utils/i18n';
import { ErrorState } from './ui/error-state';
import { formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { Button } from './ui/button';
import { SkeletonListRows, SkeletonStatTiles, Skeleton } from './ui/skeleton';
import { confirm, promptText } from './ui/confirm';
import { toast } from './ui/sonner';
import { useApprovedVariablePay } from './kpi/useApprovedVariablePay';
import { teamApi } from './team/teamApi';
import { TeamPage, errorText, formatDay, useOptionalShell, useSubPage } from './team/shared';
import {
  advanceRequestProblem,
  advanceUpdatesFor,
  buildAdvanceRequest,
  currentMonthBounds,
  lastMonthBounds,
  planAdvanceRecovery,
  recoveredSoFar,
  type PayEmployee,
  type PayOverhead,
  type PayPayout,
} from './team/payrollMath';
import { buildPayView, type PayRow } from './team/pay/payView';
import { PayTeamView, type Segment } from './team/pay/PayTeamView';
import { PayslipSheet, type SlipView } from './team/pay/PayslipSheet';
import { PayoutForm, blankPayout, defaultForMonth, type PayoutDraft } from './team/pay/PayoutForm';
import { AdvancesSheet } from './team/pay/AdvancesSheet';
import { MyPay } from './team/pay/MyPay';
import { periodLabel, type PeriodState } from './team/pay/PayParts';
import { ArrowLeft } from 'lucide-react';

interface PayrollManagementProps {
  userRole: 'manager' | 'cluster_head' | 'audit';
  selectedDate: string;
  userEmployeeId?: string | null;
  userName?: string;
  selectedStoreId?: string | null;
  isIncharge?: boolean;
  inchargeDesignation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null;
}

export function PayrollManagement({ userRole, selectedDate, userEmployeeId, userName, selectedStoreId, isIncharge = false }: PayrollManagementProps) {
  const { t, lang } = useT();
  const [employees, setEmployees] = useState<PayEmployee[]>([]);
  // Past staff: only to name their old payouts; never offered for paying or editing.
  const [archivedEmployees, setArchivedEmployees] = useState<PayEmployee[]>([]);
  const [stores, setStores] = useState<api.Store[]>([]);
  const [payouts, setPayouts] = useState<PayPayout[]>([]);
  const [salaryAdvances, setSalaryAdvances] = useState<api.SalaryAdvance[]>([]);
  const [overheads, setOverheads] = useState<PayOverhead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isClusterHead = userRole === 'cluster_head';
  const canSeePermanent = userRole === 'cluster_head' || userRole === 'audit';
  const [segment, setSegment] = useState<Segment>(canSeePermanent ? 'all' : 'contract');
  const [period, setPeriod] = useState<PeriodState>({ viewMode: 'current', customStart: '', customEnd: '' });
  const currentMonth = useMemo(() => currentMonthBounds(), []);
  const lastMonth = useMemo(() => lastMonthBounds(), []);

  // The person's own pay: the shell's My pay page, or Team → Pay → My pay.
  const shell = useOptionalShell();
  const [sub, openSub, closeSub] = useSubPage('view');
  const onMyPayRoute = shell?.router.route.path === 'my-pay';
  const showMine = !!userEmployeeId && (onMyPayRoute || sub === 'mine');

  const [slip, setSlip] = useState<{ key: string; view: SlipView } | null>(null);
  const [payoutSheet, setPayoutSheet] = useState<'contract' | 'fulltime' | null>(null);
  const [advancesOpen, setAdvancesOpen] = useState(false);
  const [payoutData, setPayoutData] = useState<PayoutDraft>(() => blankPayout(selectedDate));

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [employeesData, archivedData, payoutsData, advancesData, overheadsData, storesData] = await Promise.all([
        teamApi.getEmployees(),
        teamApi.getArchivedEmployees(),
        teamApi.getPayouts(),
        teamApi.getSalaryAdvances(),
        teamApi.getOverheads(),
        teamApi.getStores(),
      ]);
      setEmployees((employeesData as unknown as PayEmployee[]) || []);
      setArchivedEmployees((archivedData as unknown as PayEmployee[]) || []);
      setPayouts((payoutsData as unknown as PayPayout[]) || []);
      setStores(storesData || []);
      setSalaryAdvances(advancesData || []);
      setOverheads((overheadsData as unknown as PayOverhead[]) || []);
    } catch (error) {
      console.error('Error loading payroll data:', error);
      setLoadError(errorText(error, t('team.pay.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodSpec = { viewMode: period.viewMode, current: currentMonth, last: lastMonth, customStart: period.customStart, customEnd: period.customEnd };
  const view = useMemo(
    () => buildPayView({ employees, archivedEmployees, payouts, overheads, stores, selectedStoreId, isIncharge, userEmployeeId, period: periodSpec }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, archivedEmployees, payouts, overheads, stores, selectedStoreId, isIncharge, userEmployeeId, period, currentMonth, lastMonth],
  );

  const canAddPayoutFor = (kind: 'contract' | 'fulltime') => {
    if (userRole === 'audit') return false; // audit only reads
    if (kind === 'contract' && userRole === 'manager') return true;
    if (kind === 'fulltime' && userRole === 'cluster_head') return true;
    return false;
  };
  const canManage = (kind: 'contract' | 'fulltime') => (kind === 'contract' ? userRole !== 'audit' : userRole === 'cluster_head');

  // The payout form's kind (Days only for contract; salary-month default for permanent).
  const payoutKind: 'contract' | 'fulltime' | null = slip?.view === 'payout' ? (allRows().find((r) => r.key === slip.key)?.type ?? null) : payoutSheet;
  function allRows(): PayRow[] {
    return [...view.permanent.rows, ...view.contract.rows, ...view.former];
  }
  const slipRow = slip ? allRows().find((r) => r.key === slip.key) ?? null : null;
  const choicesFor = (kind: 'contract' | 'fulltime') => view.filteredEmployees.filter((e) => e.type === kind);

  // Variable pay approved in Team KPIs fills an empty Variable pay field when one person is picked.
  const approvedVariablePay = useApprovedVariablePay(
    payoutKind !== null,
    payoutData.employeeIds.map((id) => employees.find((e) => e.id === id)?.employeeId || id),
    payoutData.forMonth,
    (amount) => setPayoutData((d) => (d.variablePay ? d : { ...d, variablePay: String(amount) })),
  );

  const planRecovery = (employeeId: string, salaryMonth: string, grossAmount: number) => planAdvanceRecovery(salaryAdvances, employeeId, salaryMonth, grossAmount);

  const openPayoutFor = (kind: 'contract' | 'fulltime', employeeIds: string[]) => {
    setPayoutData((prev) => ({ ...blankPayout(selectedDate), date: prev.date || selectedDate, employeeIds, forMonth: defaultForMonth(kind, prev.date || selectedDate) }));
  };

  // ---- Salary advances ------------------------------------------------------------------------

  const handleApproveAdvance = async (advanceId: string) => {
    try {
      const advance = salaryAdvances.find((a) => a.id === advanceId);
      if (!advance) return;
      await teamApi.updateSalaryAdvance(advanceId, {
        ...advance,
        status: 'approved',
        approvedBy: userName || userEmployeeId || 'Cluster Head',
        approvedDate: new Date().toISOString(),
      });
      toast.success(t('team.adv.approvedToast'));
      loadData();
    } catch (error) {
      console.error('Error approving salary advance:', error);
      toast.error(t('team.adv.failed'));
    }
  };

  const handleRejectAdvance = async (advanceId: string) => {
    const reason = await promptText({ title: t('team.adv.rejectTitle'), label: t('team.att.rejectReason'), required: true, confirmLabel: t('team.att.reject'), tone: 'danger', multiline: true });
    if (!reason) return;
    try {
      const advance = salaryAdvances.find((a) => a.id === advanceId);
      if (!advance) return;
      await teamApi.updateSalaryAdvance(advanceId, {
        ...advance,
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: userName || userEmployeeId || 'Cluster Head',
        approvedDate: new Date().toISOString(),
      });
      toast.success(t('team.adv.rejectedToast'));
      loadData();
    } catch (error) {
      console.error('Error rejecting salary advance:', error);
      toast.error(t('team.adv.failed'));
    }
  };

  const handleApplySalaryAdvance = async (amount: number): Promise<boolean> => {
    if (!userEmployeeId) return false;
    const currentEmployee = employees.find((e) => e.employeeId === userEmployeeId);
    const problem = advanceRequestProblem(currentEmployee, amount, salaryAdvances, { requirePermanent: true });
    if (problem) {
      toast.error(problem.code === 'overSalary' ? t('team.my.err.overSalary', { amount: problem.salary?.toLocaleString('en-IN') || '' }) : t(`team.my.err.${problem.code}`));
      return false;
    }
    try {
      await teamApi.createSalaryAdvance(buildAdvanceRequest(currentEmployee!, amount));
      toast.success(t('team.my.advanceSent'));
      loadData();
      return true;
    } catch (error) {
      console.error('Error applying for salary advance:', error);
      toast.error(t('team.my.advanceFailed'));
      return false;
    }
  };

  // ---- Payouts ----------------------------------------------------------------------------------

  const handleAddPayout = async (kind: 'contract' | 'fulltime') => {
    const payingByDays = kind === 'contract' && payoutData.periodType === 'days';
    if (payoutData.employeeIds.length === 0) {
      toast.error(t('team.payout.pickPeople'));
      return;
    }
    if (payingByDays ? !payoutData.days : !payoutData.amount && !payoutData.variablePay && !payoutData.bonus) {
      toast.error(payingByDays ? t('team.payout.needDays') : t('team.payout.needAmount'));
      return;
    }
    if (payingByDays) {
      const missingRate = payoutData.employeeIds.some((empId) => {
        const employee = employees.find((e) => e.id === empId);
        return !(employee?.dailyRate || parseFloat(payoutData.ratePerDay) || 0);
      });
      if (missingRate) {
        toast.error(t('team.payout.missingRate'));
        return;
      }
    }
    if (submitting) return; // no double submission
    try {
      setSubmitting(true);
      // A blank amount falls back to the variable pay and bonus (a pure incentive or bonus payout).
      const grossAmount = parseFloat(payoutData.amount) || ((parseFloat(payoutData.variablePay) || 0) + (parseFloat(payoutData.bonus) || 0));
      const days = parseFloat(payoutData.days) || 0;
      const advanceUpdates: ReturnType<typeof advanceUpdatesFor> = [];
      const newPayouts: PayPayout[] = payoutData.employeeIds.map((empId) => {
        const employee = employees.find((e) => e.id === empId);
        const payoutId = crypto.randomUUID();
        const forMonth = salaryMonthOf({ forMonth: payoutData.forMonth, date: payoutData.date });
        const empGrossAmount = payingByDays ? days * (employee?.dailyRate || parseFloat(payoutData.ratePerDay) || 0) : grossAmount;
        const recovery = planAdvanceRecovery(salaryAdvances, empId, forMonth, empGrossAmount);
        const netAmount = Math.max(0, empGrossAmount - recovery.total); // never below zero
        advanceUpdates.push(...advanceUpdatesFor(salaryAdvances, recovery.items, payoutId, 1));
        return {
          id: payoutId,
          employeeId: empId,
          employeeName: employee?.name || '',
          amount: netAmount, // what is transferred, after the advance instalment(s)
          date: payoutData.date,
          storeId: selectedStoreId || undefined,
          createdAt: new Date().toISOString(),
          forMonth,
          transactionId: payoutData.transactionId || undefined,
          variablePay: payoutData.variablePay ? parseFloat(payoutData.variablePay) : undefined,
          bonus: payoutData.bonus ? parseFloat(payoutData.bonus) : undefined,
          paidFrom: payoutData.paidFrom,
          advanceDeduction: recovery.total > 0 ? recovery.total : undefined,
          advanceRecovery: recovery.items.length > 0 ? recovery.items : undefined,
        };
      });
      await teamApi.addPayouts(newPayouts as unknown as Omit<api.Payout, 'id'>[]);
      for (const update of advanceUpdates) {
        await teamApi.updateSalaryAdvance(update.advanceId, { deductions: update.deductions, remainingAmount: update.remainingAmount });
      }
      if (advanceUpdates.length > 0) await loadData();
      setPayouts((list) => [...list, ...newPayouts]);
      setPayoutData(blankPayout(selectedDate));
      setPayoutSheet(null);
      setSlip((s) => (s ? { ...s, view: 'slip' } : s));
      toast.success(advanceUpdates.length > 0 ? t('team.payout.savedAdvance', { n: advanceUpdates.length }) : t('team.payout.saved'));
    } catch (error) {
      console.error('Error adding payout:', error);
      toast.error(t('team.payout.failed', { error: errorText(error, 'unknown error') }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPayout = async (edited: PayPayout): Promise<boolean> => {
    try {
      await teamApi.updatePayout(edited.id, { amount: edited.amount, date: edited.date, forMonth: edited.forMonth || edited.date.slice(0, 7) });
      setPayouts((list) => list.map((p) => (p.id === edited.id ? edited : p)));
      toast.success(t('team.payout.updated'));
      return true;
    } catch (error) {
      console.error('Error updating payout:', error);
      toast.error(t('team.payout.updateFailed'));
      return false;
    }
  };

  const handleDeletePayout = async (payout: PayPayout) => {
    const ok = await confirm({
      title: t('team.payout.deleteConfirm'),
      body: t('team.payout.deleteBody', { amount: formatINR(payout.amount), date: formatDay(payout.date, lang) }),
      confirmLabel: t('team.payout.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await teamApi.deletePayout(payout.id);
      setPayouts((list) => list.filter((p) => p.id !== payout.id));
      // Give back any salary-advance instalment this payout recovered, so it is due again. Older
      // payouts without advanceRecovery are found by the payoutId on the instalment.
      const recovery = payout.advanceRecovery?.length
        ? payout.advanceRecovery
        : salaryAdvances.flatMap((a) =>
            (a.deductions || []).filter((d) => d.payoutId === payout.id).map((d) => ({ advanceId: a.id, month: d.month, amount: recoveredSoFar(d) })),
          );
      const updates = advanceUpdatesFor(salaryAdvances, recovery, payout.id, -1);
      for (const update of updates) {
        await teamApi.updateSalaryAdvance(update.advanceId, { deductions: update.deductions, remainingAmount: update.remainingAmount });
      }
      if (updates.length > 0) await loadData();
      toast.success(updates.length > 0 ? t('team.payout.deletedAdvance') : t('team.payout.deleted'));
    } catch (error) {
      console.error('Error deleting payout:', error);
      toast.error(t('team.payout.deleteFailed'));
    }
  };

  // ---- People's pay details -----------------------------------------------------------------------

  const handleEditEmployee = async (edited: PayEmployee): Promise<boolean> => {
    try {
      // Only what this form edits (never the role).
      await teamApi.updateEmployee(edited.id, { name: edited.name, phone: edited.phone, dailyRate: edited.dailyRate, salaryStructure: edited.salaryStructure });
      setEmployees((list) => list.map((e) => (e.id === edited.id ? edited : e)));
      toast.success(t('team.payEdit.saved'));
      return true;
    } catch (error) {
      console.error('PayrollManagement: Error updating employee:', error);
      toast.error(t('team.payEdit.failed', { error: errorText(error, 'unknown error') }));
      return false;
    }
  };

  const handleArchiveEmployee = async (emp: PayEmployee) => {
    const ok = await confirm({ title: t('team.pay.archiveConfirm', { name: emp.name }), body: t('team.pay.archiveBody'), confirmLabel: t('team.pay.archive'), tone: 'danger' });
    if (!ok) return;
    try {
      // Archives server-side; payout history is kept and still named from the past-staff list.
      const result = await teamApi.deleteEmployee(emp.id);
      setEmployees((list) => list.filter((e) => e.id !== emp.id));
      if (result?.archived) setArchivedEmployees((list) => [...list, result.archived]);
      setSlip(null);
      toast.success(result?.loginRevoked === false ? t('team.pay.archivedNoBan') : t('team.pay.archived'));
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error(t('team.pay.archiveFailed'));
    }
  };

  // ---- Render -------------------------------------------------------------------------------------

  if (loading && employees.length === 0 && payouts.length === 0) {
    return (
      <TeamPage aria-busy="true">
        <Skeleton className="h-9 w-64 rounded-full" />
        <SkeletonStatTiles count={3} className="sm:grid-cols-3" />
        <SkeletonListRows count={5} leading="avatar" />
      </TeamPage>
    );
  }
  if (loadError) {
    return (
      <TeamPage>
        <ErrorState body={loadError} onRetry={loadData} retrying={loading} />
      </TeamPage>
    );
  }

  if (showMine && userEmployeeId) {
    const currentEmployee = employees.find((e) => e.employeeId === userEmployeeId);
    return (
      <MyPay
        person={{
          id: currentEmployee?.id || userEmployeeId,
          employeeId: userEmployeeId,
          name: userName || 'Employee',
          type: currentEmployee?.type || 'fulltime',
          salaryStructure: currentEmployee?.salaryStructure,
          monthlySalary: currentEmployee?.monthlySalary,
        }}
        payouts={payouts.filter((p) => p.employeeId === userEmployeeId)}
        overheads={overheads}
        advances={salaryAdvances.filter((a) => a.employeeId === currentEmployee?.id)}
        onRequestAdvance={handleApplySalaryAdvance}
        header={
          onMyPayRoute ? undefined : (
            <div className="-mx-2 -mt-2">
              <Button variant="ghost" leadingIcon={<ArrowLeft />} onClick={closeSub} className="px-2">
                {t('shell.pay')}
              </Button>
            </div>
          )
        }
      />
    );
  }

  const label = periodLabel(period, currentMonth, lastMonth, lang, t);
  // The page-level Add payout pays several people of one kind: contract for managers and incharges,
  // permanent for the owner (All shows the owner's permanent form).
  const segKind: 'contract' | 'fulltime' | null = !canSeePermanent || segment === 'contract' ? 'contract' : segment === 'fulltime' || isClusterHead ? 'fulltime' : null;
  const pagePayoutKind = segKind && canAddPayoutFor(segKind) ? segKind : null;

  return (
    <>
      <PayTeamView
        view={view}
        segment={segment}
        onSegment={setSegment}
        canSeePermanent={canSeePermanent}
        period={period}
        onPeriod={setPeriod}
        bounds={{ current: currentMonth, last: lastMonth }}
        pendingAdvances={canSeePermanent ? salaryAdvances.filter((a) => a.status === 'pending').length : null}
        onOpenAdvances={canSeePermanent ? () => setAdvancesOpen(true) : undefined}
        showMyPay={userRole === 'manager' && !!userEmployeeId}
        onOpenMyPay={() => openSub('mine')}
        onOpenRow={(row) => setSlip({ key: row.key, view: 'slip' })}
        addPayout={{
          visible: !!pagePayoutKind,
          onClick: () => {
            if (!pagePayoutKind) return;
            openPayoutFor(pagePayoutKind, []);
            setPayoutSheet(pagePayoutKind);
          },
        }}
      />

      <PayslipSheet
        row={slipRow}
        open={!!slip && !!slipRow}
        onOpenChange={(o) => !o && setSlip(null)}
        view={slip?.view ?? 'slip'}
        onView={(v) => {
          if (v === 'payout' && slipRow) openPayoutFor(slipRow.type, [slipRow.key]);
          setSlip((s) => (s ? { ...s, view: v } : s));
        }}
        periodLabel={label}
        allPayouts={payouts}
        allOverheads={overheads}
        canAddPayout={!!slipRow && canAddPayoutFor(slipRow.type)}
        canManage={!!slipRow && canManage(slipRow.type)}
        payout={{ draft: payoutData, onChange: setPayoutData, choices: slipRow ? choicesFor(slipRow.type) : [], planRecovery, approvedVariablePay }}
        onSavePayout={() => slipRow && handleAddPayout(slipRow.type)}
        saving={submitting}
        onSaveEditedPayout={handleEditPayout}
        onDeletePayout={handleDeletePayout}
        onSaveEmployee={handleEditEmployee}
        onArchive={handleArchiveEmployee}
      />

      <ResponsiveModal
        open={payoutSheet !== null}
        onOpenChange={(o) => !o && setPayoutSheet(null)}
        title={t('team.pay.addPayout')}
        description={payoutSheet === 'fulltime' ? t('team.type.fulltime') : t('team.type.contract')}
        dirty={payoutData.employeeIds.length > 0 || !!payoutData.amount || !!payoutData.days}
        onClosed={() => setPayoutData(blankPayout(selectedDate))}
        footer={
          <Button size="lg" className="flex-1" loading={submitting} onClick={() => payoutSheet && handleAddPayout(payoutSheet)}>
            {t('team.payout.save')}
          </Button>
        }
      >
        {payoutSheet && (
          <PayoutForm draft={payoutData} onChange={setPayoutData} kind={payoutSheet} choices={choicesFor(payoutSheet)} planRecovery={planRecovery} approvedVariablePay={approvedVariablePay} />
        )}
      </ResponsiveModal>

      {canSeePermanent && (
        <AdvancesSheet
          open={advancesOpen}
          onOpenChange={setAdvancesOpen}
          advances={salaryAdvances}
          canDecide={userRole === 'cluster_head'}
          onApprove={handleApproveAdvance}
          onReject={handleRejectAdvance}
        />
      )}
    </>
  );
}
