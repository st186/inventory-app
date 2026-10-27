// Salary advance requests (owner approves; audit reads): waiting, approved with their
// instalments, and rejected.
import * as React from 'react';
import { Check, CreditCard, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty-state';
import { InitialsAvatar } from '../../ui/avatar';
import { ListGroup, ListRow } from '../../ui/list-row';
import { Money, formatINR } from '../../ui/money';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { StatusChip } from '../../ui/status-chip';
import type * as api from '../../../utils/api';
import { useT } from '../../../utils/i18n';
import { formatDay, formatMonth } from '../shared';
import { recoveredSoFar } from '../payrollMath';

export function AdvancesSheet({
  open,
  onOpenChange,
  advances,
  canDecide,
  onApprove,
  onReject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advances: api.SalaryAdvance[];
  canDecide: boolean;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const { t, lang } = useT();
  const [busy, setBusy] = React.useState<string | null>(null);
  const pending = advances.filter((a) => a.status === 'pending');
  const approved = advances.filter((a) => a.status === 'approved');
  const rejected = advances.filter((a) => a.status === 'rejected');

  const run = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    try {
      await fn(id);
    } finally {
      setBusy(null);
    }
  };

  const terms = (a: api.SalaryAdvance) =>
    `${t('team.adv.instalments', { amount: formatINR(a.monthlyDeduction), n: a.installments })} · ${formatMonth(a.startMonth, lang)} – ${formatMonth(a.endMonth, lang)}`;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t('team.adv.title')} description={t('team.adv.summary', { pending: pending.length, approved: approved.length, rejected: rejected.length })} size="detail">
      {advances.length === 0 ? (
        <EmptyState icon={CreditCard} title={t('team.adv.none')} body={t('team.adv.noneBody')} />
      ) : (
        <div className="flex flex-col gap-5" data-ai-private>
          {pending.length > 0 && (
            <ListGroup overline={t('team.adv.waiting', { n: pending.length })}>
              {pending.map((a) => (
                <div key={a.id} className="flex flex-col gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={a.employeeName} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-md font-medium text-text">{a.employeeName}</span>
                      <span className="text-label text-text-3">{a.employeeEmployeeId} · {t('team.adv.askedOn', { date: formatDay(a.requestDate?.slice(0, 10), lang) })}</span>
                    </span>
                    <Money value={a.amount} className="text-body-md font-semibold text-text" />
                  </div>
                  <p className="num text-label text-text-2">{terms(a)}</p>
                  {canDecide && (
                    <div className="flex gap-2.5">
                      <Button variant="ghost" className="flex-1" leadingIcon={<X />} disabled={!!busy} onClick={() => run(a.id, onReject)}>
                        {t('team.att.reject')}
                      </Button>
                      <Button variant="secondary" className="flex-1" leadingIcon={<Check />} loading={busy === a.id} disabled={!!busy && busy !== a.id} onClick={() => run(a.id, onApprove)}>
                        {t('team.att.approve')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </ListGroup>
          )}
          {approved.length > 0 && (
            <ListGroup overline={t('team.adv.approvedN', { n: approved.length })}>
              {approved.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={a.employeeName} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-md font-medium text-text">{a.employeeName}</span>
                      <span className="text-label text-text-3">{t('team.adv.approvedOn', { date: formatDay((a.approvedDate || '').slice(0, 10), lang) })}</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <Money value={a.amount} className="text-body-md font-semibold text-text" />
                      <span className="num text-label text-text-3">{t('team.adv.left', { amount: formatINR(a.remainingAmount) })}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(a.deductions || []).map((d) => {
                      const done = d.deducted;
                      const part = !done && recoveredSoFar(d) > 0;
                      return (
                        <StatusChip key={d.month} tone={done ? 'success' : 'neutral'} icon={done ? Check : undefined}>
                          <span className="num">{formatMonth(d.month, lang)} · {formatINR(d.amount)}{part ? ` (${formatINR(recoveredSoFar(d))})` : ''}</span>
                        </StatusChip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </ListGroup>
          )}
          {rejected.length > 0 && (
            <ListGroup overline={t('team.adv.rejectedN', { n: rejected.length })}>
              {rejected.map((a) => (
                <ListRow
                  key={a.id}
                  leading={<InitialsAvatar name={a.employeeName} />}
                  title={a.employeeName}
                  subtitle={[t('team.adv.rejectedOn', { date: formatDay((a.approvedDate || '').slice(0, 10), lang) }), a.rejectionReason].filter(Boolean).join(' · ')}
                  amount={a.amount}
                />
              ))}
            </ListGroup>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
