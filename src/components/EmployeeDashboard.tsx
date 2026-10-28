// Pay (crew and riders): their own pay - what has been paid this month, payslips for the last
// 12 months, the salary advance, and their details and manager (those move to Me → Profile once
// the shell has that page). Same data as before: their payouts, salary advances and personal
// expenses, matched to their staff record.
import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import * as api from '../utils/api';
import { useT } from '../utils/i18n';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Skeleton, SkeletonListRows, SkeletonStatTile } from './ui/skeleton';
import { toast } from './ui/sonner';
import { formatINR } from './ui/money';
import { teamApi } from './team/teamApi';
import { TeamPage, errorText } from './team/shared';
import { advanceRequestProblem, buildAdvanceRequest, type PayOverhead, type PayPayout } from './team/payrollMath';
import { MyPay, type ContactCard } from './team/pay/MyPay';
import type { I18nKey } from '../utils/i18n';

interface EmployeeDashboardProps {
  employeeId: string;
}

type Person = Omit<api.Employee, 'type'> & { id: string; type?: 'contract' | 'fulltime'; dailyRate?: number; monthlySalary?: number };

const DESIGNATION_KEYS: Record<string, I18nKey> = {
  operations_incharge: 'team.designation.operations_incharge',
  store_incharge: 'team.designation.store_incharge',
  production_incharge: 'team.designation.production_incharge',
  operations_manager: 'team.designation.operations_manager',
  store_ops: 'team.designation.store_ops',
  production_ops: 'team.designation.production_ops',
  rider: 'team.designation.rider',
};

export function EmployeeDashboard({ employeeId }: EmployeeDashboardProps) {
  const { t } = useT();
  const [employee, setEmployee] = useState<Person | null>(null);
  const [payouts, setPayouts] = useState<PayPayout[]>([]);
  const [salaryAdvances, setSalaryAdvances] = useState<api.SalaryAdvance[]>([]);
  // Personal expenses (advance cash handed over) come off net pay, as in Payroll.
  const [overheads, setOverheads] = useState<PayOverhead[]>([]);
  const [manager, setManager] = useState<Person | null>(null);
  const [seniorManager, setSeniorManager] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadEmployeeData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const employees = (await teamApi.getEmployees()) as Person[];
      const current = employees.find((emp) => emp.employeeId === employeeId) || null;
      setEmployee(current);
      if (!current) return;
      const allPayouts = (await teamApi.getPayouts()) as unknown as PayPayout[];
      setPayouts(allPayouts.filter((p) => p.employeeId === current.id));
      const allAdvances = await teamApi.getSalaryAdvances();
      setSalaryAdvances(allAdvances.filter((a) => a.employeeId === current.id));
      try {
        const allOverheads = (await teamApi.getOverheads()) as unknown as PayOverhead[];
        setOverheads(allOverheads.filter((o) => o.category === 'personal_expense' && o.employeeId === current.employeeId));
      } catch (overheadError) {
        console.error('Error loading personal expenses:', overheadError);
      }
      // Their incharge, and the incharge's own incharge.
      const boss = current.inchargeId ? employees.find((e) => e.id === current.inchargeId) || null : null;
      setManager(boss);
      setSeniorManager(boss?.inchargeId ? employees.find((e) => e.id === boss.inchargeId) || null : null);
    } catch (error) {
      console.error('Error loading employee data:', error);
      setLoadError(errorText(error, t('team.pay.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const handleApplySalaryAdvance = async (amount: number): Promise<boolean> => {
    if (!employee) return false;
    const problem = advanceRequestProblem(employee, amount, salaryAdvances, { requirePermanent: false });
    if (problem) {
      toast.error(problem.code === 'overSalary' ? t('team.my.err.overSalary', { amount: problem.salary?.toLocaleString('en-IN') || '' }) : t(`team.my.err.${problem.code}` as I18nKey));
      return false;
    }
    try {
      await teamApi.createSalaryAdvance(buildAdvanceRequest(employee, amount));
      toast.success(t('team.my.advanceSent'));
      loadEmployeeData();
      return true;
    } catch (error) {
      console.error('Error applying for salary advance:', error);
      toast.error(t('team.my.advanceFailed'));
      return false;
    }
  };

  if (loading && !employee) {
    return (
      <TeamPage aria-busy="true">
        <SkeletonStatTile hero />
        <Skeleton className="h-5 w-32" />
        <SkeletonListRows count={5} />
      </TeamPage>
    );
  }
  if (loadError) {
    return (
      <TeamPage>
        <ErrorState body={loadError} onRetry={loadEmployeeData} retrying={loading} />
      </TeamPage>
    );
  }
  if (!employee) {
    return (
      <TeamPage>
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={UserX} title={t('team.my.notFound')} body={t('team.my.notFoundBody')} />
        </div>
      </TeamPage>
    );
  }

  const designation = (d?: string | null, role?: string) =>
    d && DESIGNATION_KEYS[d] ? t(DESIGNATION_KEYS[d]) : role === 'cluster_head' ? t('role.owner') : role === 'manager' ? t('team.details.manager') : role ? t('role.staff') : '–';
  const contact = (title: string, p: Person): ContactCard => ({
    title,
    name: p.name,
    rows: [
      { label: t('team.details.phone'), value: p.phone || '–' },
      { label: t('team.details.email'), value: p.email || '–' },
      { label: t('team.details.role'), value: designation(p.designation, p.role) },
      { label: t('team.details.employeeId'), value: p.employeeId || '–' },
    ],
  });
  const type = employee.type === 'fulltime' ? 'fulltime' : 'contract';

  return (
    <MyPay
      person={{ id: employee.id, employeeId: employee.employeeId, name: employee.name, type, salaryStructure: employee.salaryStructure, monthlySalary: employee.monthlySalary }}
      payouts={payouts}
      overheads={overheads}
      advances={salaryAdvances}
      onRequestAdvance={handleApplySalaryAdvance}
      details={[
        { label: t('team.details.employeeId'), value: employee.employeeId },
        { label: t('team.details.type'), value: type === 'fulltime' ? t('team.type.fulltime') : t('team.type.contract') },
        { label: t('team.details.role'), value: designation(employee.designation, employee.role) },
        { label: t('team.details.phone'), value: employee.phone || '–' },
        { label: t('team.details.email'), value: employee.email || '–' },
        ...(employee.dailyRate ? [{ label: t('team.pay.dailyRate'), value: formatINR(employee.dailyRate) }] : []),
      ]}
      contacts={[...(manager ? [contact(t('team.details.yourManager'), manager)] : []), ...(seniorManager ? [contact(t('team.details.seniorManager'), seniorManager)] : [])]}
    />
  );
}
