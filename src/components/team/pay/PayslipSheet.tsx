// A person's payslip for the chosen period (Team → Pay → a person). The same sheet swaps to
// "Add payout", "Edit payout", "Edit pay details" or the full history, with a back arrow - never
// a sheet on a sheet.
import * as React from 'react';
import { Banknote, History, Pencil, Trash2, UserMinus } from 'lucide-react';
import { Button } from '../../ui/button';
import { Field } from '../../ui/field';
import { IconButton } from '../../ui/icon-button';
import { Input } from '../../ui/input';
import { ListGroup, ListRow } from '../../ui/list-row';
import { Money, MoneyInput, formatINR } from '../../ui/money';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { StatusChip } from '../../ui/status-chip';
import { DatePicker } from '../../DatePicker';
import { PaymentHistoryContent } from '../../PaymentHistoryModal';
import { useT } from '../../../utils/i18n';
import { DetailList, formatDay } from '../shared';
import { SalaryStructureEditor } from '../people/PersonForms';
import type { PayEmployee, PayOverhead, PayPayout } from '../payrollMath';
import type { PayRow } from './payView';
import { PayoutForm, type PayoutDraft } from './PayoutForm';
import { PayStatusChip } from './PayParts';

export type SlipView = 'slip' | 'history' | 'payout' | 'editPayout' | 'editEmployee';

export function PayslipSheet({
  row,
  open,
  onOpenChange,
  view,
  onView,
  periodLabel,
  allPayouts,
  allOverheads,
  canAddPayout,
  canManage,
  payout,
  onSavePayout,
  saving,
  onSaveEditedPayout,
  onDeletePayout,
  onSaveEmployee,
  onArchive,
}: {
  row: PayRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: SlipView;
  onView: (view: SlipView) => void;
  periodLabel: string;
  allPayouts: PayPayout[];
  allOverheads: PayOverhead[];
  canAddPayout: boolean;
  /** Edit / delete payouts and edit / archive the person (contract: not audit; permanent: owner). */
  canManage: boolean;
  payout: {
    draft: PayoutDraft;
    onChange: (d: PayoutDraft) => void;
    choices: PayEmployee[];
    planRecovery: React.ComponentProps<typeof PayoutForm>['planRecovery'];
    approvedVariablePay: number | null;
  };
  onSavePayout: () => void;
  saving: boolean;
  onSaveEditedPayout: (p: PayPayout) => Promise<boolean>;
  onDeletePayout: (p: PayPayout) => void;
  onSaveEmployee: (e: PayEmployee) => Promise<boolean>;
  onArchive: (e: PayEmployee) => void;
}) {
  const { t, lang } = useT();
  const [editingPayout, setEditingPayout] = React.useState<PayPayout | null>(null);
  const [editingEmployee, setEditingEmployee] = React.useState<PayEmployee | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!row) return null;
  const emp = row.employee;
  const isContract = row.type === 'contract';
  const back = () => onView('slip');
  const paidFromLabel = (p: PayPayout) => (p.paidFrom === 'bank' ? t('team.payout.fromBank') : p.paidFrom === 'cash' ? t('team.payout.fromCash') : p.paidFrom === 'paytm' ? t('team.payout.fromPaytm') : '');

  let title: string = row.name;
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  let dirty = false;
  const description = view === 'slip' ? [isContract ? t('team.type.contract') : t('team.type.fulltime'), emp?.employeeId].filter(Boolean).join(' · ') : row.name;

  if (view === 'history') {
    title = t('team.history.title');
    body = (
      <PaymentHistoryContent
        payouts={allPayouts.filter((p) => p.employeeId === row.key)}
        personalExpenses={allOverheads.filter((o) => o.category === 'personal_expense' && o.employeeId === emp?.employeeId)}
      />
    );
  } else if (view === 'payout') {
    title = t('team.pay.addPayout');
    dirty = !!(payout.draft.amount || payout.draft.days || payout.draft.variablePay || payout.draft.transactionId);
    body = <PayoutForm {...payout} kind={row.type} locked />;
    footer = (
      <Button size="lg" className="flex-1" loading={saving} onClick={onSavePayout}>
        {t('team.payout.save')}
      </Button>
    );
  } else if (view === 'editPayout' && editingPayout) {
    title = t('team.payout.editTitle');
    body = (
      <div className="flex flex-col gap-4">
        <Field label={t('team.payout.amount')} required>
          <MoneyInput value={editingPayout.amount} onValueChange={(n) => setEditingPayout({ ...editingPayout, amount: n ?? 0 })} />
        </Field>
        <DatePicker label={t('team.payout.date')} value={editingPayout.date} onChange={(date) => setEditingPayout({ ...editingPayout, date })} className="w-full" />
        <Field label={t('team.payout.forMonth')} required helper={t('team.payout.forMonthHelpEdit')}>
          <Input type="month" value={editingPayout.forMonth || editingPayout.date.slice(0, 7)} onChange={(e) => setEditingPayout({ ...editingPayout, forMonth: e.target.value })} />
        </Field>
      </div>
    );
    footer = (
      <Button
        size="lg"
        className="flex-1"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await onSaveEditedPayout(editingPayout);
          setBusy(false);
          if (ok) back();
        }}
      >
        {t('team.payout.update')}
      </Button>
    );
  } else if (view === 'editEmployee' && editingEmployee) {
    title = t('team.payEdit.title');
    body = (
      <div className="flex flex-col gap-4">
        <Field label={t('team.payEdit.employeeId')}>
          <Input value={editingEmployee.employeeId} readOnly className="num" />
        </Field>
        <Field label={t('team.payEdit.name')} required>
          <Input value={editingEmployee.name} onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })} />
        </Field>
        <Field label={t('team.payEdit.phone')} required>
          <Input type="tel" inputMode="tel" value={editingEmployee.phone || ''} onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })} />
        </Field>
        {editingEmployee.type === 'contract' && (
          <Field label={t('team.pay.dailyRate')} optional>
            <MoneyInput value={editingEmployee.dailyRate ?? null} onValueChange={(n) => setEditingEmployee({ ...editingEmployee, dailyRate: n || undefined })} />
          </Field>
        )}
        {editingEmployee.type === 'fulltime' && (
          <SalaryStructureEditor value={editingEmployee.salaryStructure || []} onChange={(v) => setEditingEmployee({ ...editingEmployee, salaryStructure: v })} />
        )}
      </div>
    );
    footer = (
      <Button
        size="lg"
        className="flex-1"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await onSaveEmployee(editingEmployee);
          setBusy(false);
          if (ok) back();
        }}
      >
        {t('team.payEdit.save')}
      </Button>
    );
  } else {
    const advanceRecovered = row.payouts.reduce((s, p) => s + (p.advanceDeduction || 0), 0);
    body = (
      <div className="flex flex-col gap-4" data-ai-private>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-col">
            <span className="text-label text-text-2">{isContract ? t('team.pay.paidIn', { period: periodLabel }) : t('team.pay.netIn', { period: periodLabel })}</span>
            <Money value={row.amount} className="text-display font-semibold text-text" />
          </div>
          {row.status && <PayStatusChip status={row.status} />}
          {row.former && <StatusChip tone="neutral">{t('team.pay.former')}</StatusChip>}
        </div>
        <DetailList
          rows={
            isContract
              ? [
                  { label: t('team.pay.dailyRate'), value: emp?.dailyRate ? <Money value={emp.dailyRate} /> : t('team.pay.noRate') },
                  { label: t('team.pay.daysPaid'), value: <span className="num">{row.daysWorked}</span> },
                  { label: t('team.pay.paid'), value: <Money value={row.paid} /> },
                ]
              : [
                  { label: t('team.pay.salary'), value: row.salary ? <Money value={row.salary} /> : t('team.pay.noSalary') },
                  { label: t('team.pay.paid'), value: <Money value={row.paid} /> },
                  { label: t('team.pay.advanceRecovered'), value: <Money value={advanceRecovered} />, hidden: !advanceRecovered },
                  { label: t('team.pay.personalExpenses'), value: <Money value={-row.personalExpenses} />, hidden: !row.personalExpenses },
                  { label: t('team.pay.net'), value: <Money value={row.amount} className="font-semibold" /> },
                  { label: t('team.pay.stillDue'), value: <Money value={row.due} className="font-semibold text-warning" />, hidden: !row.due },
                ]
          }
        />
        <ListGroup overline={t('team.pay.payouts')} empty={<p className="px-4 py-3 text-body-sm text-text-3">{t('team.pay.noPayouts')}</p>}>
          {[...row.payouts]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((p) => (
              <ListRow
                key={p.id}
                icon={Banknote}
                title={<Money value={p.amount} className="font-semibold" />}
                subtitle={[
                  formatDay(p.date, lang),
                  p.forMonth && p.forMonth !== p.date.slice(0, 7) ? t('team.pay.forMonthShort', { month: p.forMonth }) : '',
                  paidFromLabel(p),
                  p.transactionId ? t('team.pay.ref', { id: p.transactionId }) : '',
                  p.advanceDeduction ? t('team.pay.advanceOff', { amount: formatINR(p.advanceDeduction) }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  canManage ? (
                    <span className="flex">
                      <IconButton
                        label={t('team.payout.editTitle')}
                        icon={<Pencil />}
                        onClick={() => {
                          setEditingPayout(p);
                          onView('editPayout');
                        }}
                      />
                      <IconButton label={t('team.payout.delete')} icon={<Trash2 />} variant="danger-ghost" onClick={() => onDeletePayout(p)} />
                    </span>
                  ) : undefined
                }
              />
            ))}
        </ListGroup>
        <ListGroup>
          <ListRow icon={History} title={t('team.history.title')} subtitle={t('team.history.hint')} onClick={() => onView('history')} />
          {canManage && emp && !row.former && (
            <ListRow
              icon={Pencil}
              title={t('team.payEdit.title')}
              subtitle={isContract ? t('team.payEdit.hintContract') : t('team.payEdit.hintPermanent')}
              onClick={() => {
                setEditingEmployee(emp);
                onView('editEmployee');
              }}
            />
          )}
        </ListGroup>
        {canManage && emp && !row.former && (
          <ListGroup>
            <ListRow icon={UserMinus} iconTone="danger" title={<span className="text-danger">{t('team.pay.archive')}</span>} subtitle={t('team.pay.archiveHint')} onClick={() => onArchive(emp)} />
          </ListGroup>
        )}
      </div>
    );
    footer = canAddPayout && emp && !row.former ? (
      <Button size="lg" className="flex-1" leadingIcon={<Banknote />} onClick={() => onView('payout')}>
        {t('team.pay.addPayout')}
      </Button>
    ) : null;
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="detail"
      dirty={dirty}
      onBack={view !== 'slip' ? back : undefined}
      footer={footer}
      onClosed={() => {
        setEditingPayout(null);
        setEditingEmployee(null);
      }}
    >
      {body}
    </ResponsiveModal>
  );
}
