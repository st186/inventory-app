// The payout form (Team → Pay → Add payout, or a person's payslip → Add payout). Amounts are what
// is actually transferred; a salary-advance instalment due for the salary month comes off first,
// and the preview says so. Contract staff can be paid by days (days × their daily rate) or a flat
// amount; permanent staff by salary month (paid on or before the 10th = last month's salary).
import * as React from 'react';
import { Callout } from '../../ui/callout';
import { Checkbox } from '../../ui/checkbox';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { MoneyInput, formatINR } from '../../ui/money';
import { SegmentedControl } from '../../ui/segmented-control';
import { DatePicker } from '../../DatePicker';
import { useT } from '../../../utils/i18n';
import { SALARY_PAID_BY_DAY, defaultSalaryMonth, salaryMonthOf } from '../../../utils/payslip';
import type { PayEmployee, RecoveryItem } from '../payrollMath';

export type PayoutDraft = {
  employeeIds: string[];
  amount: string;
  date: string;
  periodType: 'days' | 'month';
  days: string;
  ratePerDay: string;
  forMonth: string;
  transactionId: string;
  variablePay: string;
  paidFrom: 'paytm' | 'bank' | 'cash';
};

export const blankPayout = (selectedDate: string): PayoutDraft => ({
  employeeIds: [],
  amount: '',
  date: selectedDate,
  periodType: 'month',
  days: '',
  ratePerDay: '',
  forMonth: selectedDate.slice(0, 7),
  transactionId: '',
  variablePay: '',
  paidFrom: 'paytm',
});

/** The form's default "Salary for month": permanent salary paid early = last month's; contract = the payment month. */
export const defaultForMonth = (kind: 'contract' | 'fulltime', date: string) => (kind === 'fulltime' ? defaultSalaryMonth(date) : date.slice(0, 7));

export function PayoutForm({
  draft,
  onChange,
  kind,
  choices,
  locked,
  planRecovery,
  approvedVariablePay,
}: {
  draft: PayoutDraft;
  onChange: (next: PayoutDraft) => void;
  kind: 'contract' | 'fulltime';
  /** People who can be picked (the roster in scope). */
  choices: PayEmployee[];
  /** Paying one person from their payslip: no picker. */
  locked?: boolean;
  planRecovery: (employeeId: string, salaryMonth: string, grossAmount: number) => { items: RecoveryItem[]; total: number };
  approvedVariablePay: number | null;
}) {
  const { t } = useT();
  const set = <K extends keyof PayoutDraft>(key: K, value: PayoutDraft[K]) => onChange({ ...draft, [key]: value });
  const payingByDays = kind === 'contract' && draft.periodType === 'days';
  const days = parseFloat(draft.days) || 0;
  const byId = (id: string) => choices.find((e) => e.id === id);

  const recoveryRows = draft.employeeIds
    .map((empId) => {
      const employee = byId(empId);
      const grossAmount = payingByDays ? days * (employee?.dailyRate || parseFloat(draft.ratePerDay) || 0) : parseFloat(draft.amount) || parseFloat(draft.variablePay) || 0;
      const recovery = planRecovery(empId, salaryMonthOf({ forMonth: draft.forMonth, date: draft.date }), grossAmount);
      return { employee, recovery, grossAmount };
    })
    .filter((r) => r.recovery.total > 0);

  return (
    <div className="flex flex-col gap-4">
      {!locked && (
        <Field label={t('team.payout.people')} required helper={t('team.payout.selected', { n: draft.employeeIds.length })}>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
            {choices.length === 0 ? (
              <p className="px-4 py-3 text-body-sm text-text-3">{t('team.payout.nobody')}</p>
            ) : (
              choices.map((emp) => (
                <label key={emp.id} className="flex min-h-13 cursor-pointer items-center gap-3 px-4 py-2">
                  <Checkbox
                    checked={draft.employeeIds.includes(emp.id)}
                    onCheckedChange={(c) => set('employeeIds', c === true ? [...draft.employeeIds, emp.id] : draft.employeeIds.filter((id) => id !== emp.id))}
                    aria-label={emp.name}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body-md font-medium text-text">{emp.name}</span>
                    <span className="num text-label text-text-3">{emp.employeeId}{emp.dailyRate ? ` · ${formatINR(emp.dailyRate)}/${t('team.pay.dayShort')}` : ''}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </Field>
      )}

      {kind === 'contract' && (
        <Field label={t('team.payout.payFor')}>
          <SegmentedControl
            aria-label={t('team.payout.payFor')}
            value={draft.periodType}
            onValueChange={(v) => set('periodType', v)}
            options={[
              { value: 'days', label: t('team.payout.days') },
              { value: 'month', label: t('team.payout.month') },
            ]}
          />
        </Field>
      )}

      {payingByDays ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('team.payout.numDays')} required>
              <Input type="number" inputMode="numeric" min={0} step={1} value={draft.days} onChange={(e) => set('days', e.target.value)} className="num" />
            </Field>
            <Field label={t('team.payout.ratePerDay')}>
              <MoneyInput value={draft.ratePerDay} onValueChange={(_, raw) => set('ratePerDay', raw)} />
            </Field>
          </div>
          {draft.days && draft.employeeIds.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3.5 py-3">
              {draft.employeeIds.map((empId) => {
                const employee = byId(empId);
                const rate = employee?.dailyRate || parseFloat(draft.ratePerDay) || 0;
                return (
                  <p key={empId} className="num text-body-sm text-text">
                    {t('team.payout.dayCalc', { name: employee?.name || empId, days: draft.days, rate: formatINR(rate), amount: formatINR(days * rate) })}
                    {!rate && <span className="text-danger"> · {t('team.payout.needRate')}</span>}
                  </p>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <Field label={t('team.payout.amount')} helper={t('team.payout.amountHelp')}>
          <MoneyInput value={draft.amount} onValueChange={(_, raw) => set('amount', raw)} />
        </Field>
      )}

      <DatePicker
        label={t('team.payout.date')}
        value={draft.date}
        onChange={(date) => onChange({ ...draft, date, forMonth: defaultForMonth(kind, date) })}
        className="w-full"
      />

      <Field
        label={t('team.payout.forMonth')}
        required
        helper={kind === 'fulltime' ? t('team.payout.forMonthHelpPermanent', { day: SALARY_PAID_BY_DAY }) : t('team.payout.forMonthHelpContract')}
      >
        <Input type="month" value={draft.forMonth} onChange={(e) => set('forMonth', e.target.value)} />
      </Field>

      <Field label={t('team.payout.txnId')} optional helper={t('team.payout.txnHelp')}>
        <Input value={draft.transactionId} autoComplete="off" onChange={(e) => set('transactionId', e.target.value)} />
      </Field>

      <Field label={t('team.payout.paidFrom')} helper={t('team.payout.paidFromHelp')}>
        <SegmentedControl
          aria-label={t('team.payout.paidFrom')}
          value={draft.paidFrom}
          onValueChange={(v) => set('paidFrom', v)}
          options={[
            { value: 'paytm', label: t('team.payout.fromPaytm') },
            { value: 'bank', label: t('team.payout.fromBank') },
            { value: 'cash', label: t('team.payout.fromCash') },
          ]}
        />
      </Field>

      <Field label={t('team.payout.variablePay')} optional helper={t('team.payout.variableHelp')}>
        <MoneyInput value={draft.variablePay} onValueChange={(_, raw) => set('variablePay', raw)} />
      </Field>
      {approvedVariablePay !== null && (
        <p className="num -mt-2 text-label font-medium text-success">{t('team.payout.approvedKpi', { amount: formatINR(approvedVariablePay) })}</p>
      )}

      {recoveryRows.length > 0 && (
        <Callout tone="warning" title={t('team.payout.advanceTitle')}>
          {recoveryRows.map(({ employee, recovery, grossAmount }) => (
            <span key={employee?.id} className="num block">
              {t('team.payout.advanceLine', {
                name: employee?.name || '',
                gross: formatINR(grossAmount),
                advance: formatINR(recovery.total),
                months: recovery.items.map((i) => i.month).join(', '),
                net: formatINR(Math.max(0, grossAmount - recovery.total)),
              })}
            </span>
          ))}
        </Callout>
      )}
    </div>
  );
}
