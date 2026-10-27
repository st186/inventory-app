// "My pay": the signed-in person's own pay (crew and riders on Pay; managers and incharges from
// Team → Pay → My pay). Hero with what has been paid for the month so far, the last 12 months'
// payslips, the salary advance, and their details.
import * as React from 'react';
import { CalendarDays, Check, ChevronDown, CreditCard, Download, FileText, IdCard, Wallet } from 'lucide-react';
import { Button } from '../../ui/button';
import { Callout } from '../../ui/callout';
import { EmptyState } from '../../ui/empty-state';
import { Field } from '../../ui/field';
import { ListGroup, ListRow } from '../../ui/list-row';
import { Money, MoneyInput, formatINR } from '../../ui/money';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { SelectChip } from '../../ui/chip';
import { StatTile } from '../../ui/stat-tile';
import { StatusChip } from '../../ui/status-chip';
import { cn } from '../../ui/utils';
import type * as api from '../../../utils/api';
import { useT } from '../../../utils/i18n';
import { computeMonthlyPay, generatePayslip, monthlySalaryOf, payoutMonth, SALARY_PAID_BY_DAY } from '../../../utils/payslip';
import { DetailList, TeamPage, formatDay, formatMonth } from '../shared';
import { monthlySlips, recoveredSoFar, type MonthSlip, type PayOverhead, type PayPayout, type PaySalaryComponent } from '../payrollMath';

export type MyPayPerson = {
  id: string;
  employeeId: string;
  name: string;
  type: 'contract' | 'fulltime';
  salaryStructure?: PaySalaryComponent[];
  monthlySalary?: number;
};

export type ContactCard = { title: string; name: string; rows: { label: string; value: string }[] };

const pad2 = (n: number) => String(n).padStart(2, '0');
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

export function MyPay({
  person,
  payouts,
  overheads,
  advances,
  onRequestAdvance,
  details,
  contacts,
  header,
}: {
  person: MyPayPerson;
  /** This person's payouts (any month). */
  payouts: PayPayout[];
  /** Personal expenses (they're matched to this person by employee ID). */
  overheads: PayOverhead[];
  advances: api.SalaryAdvance[];
  /** Returns true when the request went in. */
  onRequestAdvance: (amount: number) => Promise<boolean>;
  /** "Your details" rows (moves to Me → Profile once the shell has it). */
  details?: { label: string; value: string }[];
  /** Manager / their manager contact cards. */
  contacts?: ContactCard[];
  header?: React.ReactNode;
}) {
  const { t, lang } = useT();
  const now = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState(() => monthKey(now));
  const [monthPicker, setMonthPicker] = React.useState(false);
  const [slip, setSlip] = React.useState<MonthSlip | null>(null);
  const [advanceOpen, setAdvanceOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1))), [now]);
  const slips = React.useMemo(() => monthlySlips(payouts, overheads, person.employeeId, now), [payouts, overheads, person.employeeId, now]);
  const monthPayouts = payouts.filter((p) => payoutMonth(p) === month);
  const monthTotal = monthPayouts.reduce((sum, p) => sum + p.amount, 0);
  const isCurrent = month === monthKey(now);
  const [y, m] = month.split('-').map(Number);
  const nextMonthKey = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  const hasActiveAdvance = advances.some((a) => a.status === 'pending' || (a.status === 'approved' && a.remainingAmount > 0));
  const latestAdvance = [...advances].sort((a, b) => (b.requestDate || '').localeCompare(a.requestDate || ''))[0];

  return (
    <TeamPage data-ai-private>
      {header}
      <StatTile
        hero
        label={isCurrent ? t('team.my.thisMonth') : t('team.my.paidFor', { month: formatMonth(month, lang) })}
        headerChip={
          <SelectChip leadingIcon={<CalendarDays />} trailingIcon={<ChevronDown />} onClick={() => setMonthPicker(true)} aria-haspopup="dialog">
            {formatMonth(month, lang)}
          </SelectChip>
        }
        value={<Money value={monthTotal} />}
        caption={
          [
            t('team.my.payments', { n: monthPayouts.length }),
            person.type === 'fulltime' ? t('team.my.nextSalary', { month: formatMonth(month, lang), date: formatDay(`${nextMonthKey}-${pad2(SALARY_PAID_BY_DAY)}`, lang, { short: true }) }) : '',
          ]
            .filter(Boolean)
            .join(' · ')
        }
      />

      <ListGroup title={t('team.my.payslips')} meta={t('team.my.last12')}>
        {slips.map((s) => {
          const has = s.payouts.length > 0 || s.personalExpenses > 0;
          return (
            <ListRow
              key={s.key}
              icon={FileText}
              title={formatMonth(s.key, lang)}
              subtitle={has ? t('team.my.payments', { n: s.payouts.length }) + (s.personalExpenses > 0 ? ` · ${t('team.my.lessAdvance', { amount: formatINR(s.personalExpenses) })}` : '') : t('team.my.noPayYet')}
              muted={!has}
              onClick={has ? () => setSlip(s) : undefined}
              chevron={has}
              trailing={has ? <span className="flex flex-col items-end gap-1"><Money value={s.total} className="text-body-md font-semibold text-text" />{s.isAvailable && <StatusChip status="pay.paid" />}</span> : undefined}
            />
          );
        })}
      </ListGroup>

      <ListGroup>
        <ListRow
          icon={CreditCard}
          title={t('team.my.advance')}
          subtitle={
            latestAdvance
              ? `${formatINR(latestAdvance.amount)} · ${latestAdvance.status === 'pending' ? t('status.pending') : latestAdvance.status === 'approved' ? t('team.adv.left', { amount: formatINR(latestAdvance.remainingAmount) }) : t('status.rejected')}`
              : person.type === 'fulltime'
                ? t('team.my.advanceHint')
                : t('team.my.advanceNotPermanent')
          }
          onClick={() => setAdvanceOpen(true)}
        />
        {(details || contacts) && <ListRow icon={IdCard} title={t('team.my.yourDetails')} subtitle={t('team.my.yourDetailsHint')} onClick={() => setDetailsOpen(true)} />}
      </ListGroup>

      <ResponsiveModal open={monthPicker} onOpenChange={setMonthPicker} title={t('team.my.pickMonth')}>
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {months.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setMonth(k);
                setMonthPicker(false);
              }}
              aria-pressed={k === month}
              className={cn('flex min-h-13 w-full items-center justify-between gap-3 px-4 text-left text-body-md outline-none hover:bg-surface-2 focus-visible:bg-surface-2', k === month && 'bg-primary-soft font-semibold text-primary')}
            >
              {formatMonth(k, lang)}
              {k === month && <Check className="size-5" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </ResponsiveModal>

      <MonthSlipSheet slip={slip} person={person} onOpenChange={(o) => !o && setSlip(null)} />

      <AdvanceSheet
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        person={person}
        advances={advances}
        hasActiveAdvance={hasActiveAdvance}
        onRequest={onRequestAdvance}
      />

      <ResponsiveModal open={detailsOpen} onOpenChange={setDetailsOpen} title={t('team.my.yourDetails')}>
        <div className="flex flex-col gap-4">
          {details && <DetailList rows={details} />}
          {contacts && contacts.length > 0 ? (
            contacts.map((c) => (
              <section key={c.title} className="flex flex-col gap-2">
                <h3 className="overline-label mx-1">{c.title}</h3>
                <DetailList rows={[{ label: t('team.details.name'), value: c.name }, ...c.rows]} />
              </section>
            ))
          ) : contacts ? (
            <Callout tone="neutral" title={t('team.details.noManager')}>{t('team.details.noManagerBody')}</Callout>
          ) : null}
        </div>
      </ResponsiveModal>
    </TeamPage>
  );
}

function MonthSlipSheet({ slip, person, onOpenChange }: { slip: MonthSlip | null; person: MyPayPerson; onOpenChange: (open: boolean) => void }) {
  const { t, lang } = useT();
  if (!slip) return null;
  const pay = computeMonthlyPay(slip.payouts, slip.personalExpenses);
  return (
    <ResponsiveModal
      open={!!slip}
      onOpenChange={onOpenChange}
      title={t('team.my.payslipFor', { month: formatMonth(slip.key, lang) })}
      description={`${person.name} · ${person.employeeId}`}
      footer={
        slip.isAvailable ? (
          <Button
            size="lg"
            className="flex-1"
            leadingIcon={<Download />}
            onClick={() => generatePayslip(person.name, person.employeeId, slip.month, slip.year, slip.payouts, person.type, slip.personalExpenses, person.salaryStructure)}
          >
            {t('team.my.download')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4" data-ai-private>
        <DetailList
          rows={[
            { label: t('team.my.gross'), value: <Money value={pay.gross} /> },
            { label: t('team.my.advanceRecovered'), value: <Money value={-pay.advanceRecovered} />, hidden: !pay.advanceRecovered },
            { label: t('team.pay.personalExpenses'), value: <Money value={-pay.personalExpenses} />, hidden: !pay.personalExpenses },
            { label: t('team.my.netPay'), value: <Money value={pay.net} className="font-semibold" /> },
          ]}
        />
        <ListGroup overline={t('team.pay.payouts')} empty={<p className="px-4 py-3 text-body-sm text-text-3">{t('team.pay.noPayouts')}</p>}>
          {[...slip.payouts]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((p, i) => (
              <ListRow
                key={`${p.date}-${i}`}
                density="compact"
                icon={Wallet}
                title={formatDay(p.date, lang)}
                subtitle={[person.type === 'fulltime' ? t('team.my.salary') : t('team.my.dailyWage'), p.transactionId ? t('team.pay.ref', { id: p.transactionId }) : ''].filter(Boolean).join(' · ')}
                amount={p.amount}
              />
            ))}
        </ListGroup>
      </div>
    </ResponsiveModal>
  );
}

function AdvanceSheet({
  open,
  onOpenChange,
  person,
  advances,
  hasActiveAdvance,
  onRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: MyPayPerson;
  advances: api.SalaryAdvance[];
  hasActiveAdvance: boolean;
  onRequest: (amount: number) => Promise<boolean>;
}) {
  const { t, lang } = useT();
  const [asking, setAsking] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const salary = monthlySalaryOf(person);
  const value = parseFloat(amount);
  const canApply = person.type === 'fulltime';

  const submit = async () => {
    setSaving(true);
    const ok = await onRequest(value);
    setSaving(false);
    if (ok) {
      setAmount('');
      setAsking(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        setAsking(false);
        setAmount('');
      }}
      dirty={asking && amount !== ''}
      title={asking ? t('team.my.applyAdvance') : t('team.my.advance')}
      onBack={asking ? () => setAsking(false) : undefined}
      footer={
        asking ? (
          <Button size="lg" className="flex-1" loading={saving} disabled={!value || value <= 0} onClick={submit}>
            {t('team.my.submitAdvance')}
          </Button>
        ) : canApply ? (
          <Button size="lg" className="flex-1" disabled={hasActiveAdvance} onClick={() => setAsking(true)}>
            {hasActiveAdvance ? t('team.my.advanceActive') : t('team.my.applyAdvance')}
          </Button>
        ) : undefined
      }
    >
      {asking ? (
        <div className="flex flex-col gap-4">
          <Callout tone="info" title={t('team.my.recoveryTitle')}>{t('team.my.recoveryBody')}</Callout>
          {salary > 0 && <p className="num text-body-sm text-text-2">{t('team.my.yourSalary', { amount: formatINR(salary) })}</p>}
          <Field label={t('team.my.advanceAmount')} required helper={value > 0 ? t('team.my.monthlyDeduction', { amount: formatINR(value / 4) }) : undefined}>
            <MoneyInput autoFocus value={amount} onValueChange={(_, raw) => setAmount(raw)} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-ai-private>
          {!canApply && <Callout tone="neutral" title={t('team.my.advanceNotPermanent')}>{t('team.my.advanceNotPermanentBody')}</Callout>}
          {advances.length === 0 ? (
            <EmptyState compact icon={CreditCard} title={t('team.my.noAdvance')} body={canApply ? t('team.my.advanceHint') : undefined} />
          ) : (
            [...advances]
              .sort((a, b) => (b.requestDate || '').localeCompare(a.requestDate || ''))
              .map((a) => (
                <section key={a.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <Money value={a.amount} className="text-title font-semibold text-text" />
                      <span className="text-label text-text-3">{t('team.adv.askedOn', { date: formatDay(a.requestDate?.slice(0, 10), lang) })}</span>
                    </div>
                    <StatusChip status={a.status === 'approved' ? 'approval.approved' : a.status === 'rejected' ? 'approval.rejected' : 'approval.pending'} />
                  </div>
                  {a.status === 'rejected' && a.rejectionReason && <p className="text-body-sm text-text-2">{t('team.my.rejectedBecause', { reason: a.rejectionReason })}</p>}
                  {a.status === 'approved' && (
                    <>
                      <DetailList
                        rows={[
                          { label: t('team.my.perMonth'), value: <Money value={a.monthlyDeduction} /> },
                          { label: t('team.my.leftToRepay'), value: <Money value={a.remainingAmount} /> },
                          { label: t('team.my.repayMonths'), value: `${formatMonth(a.startMonth, lang)} – ${formatMonth(a.endMonth, lang)}` },
                        ]}
                      />
                      <div className="flex flex-col gap-1.5">
                        {(a.deductions || []).map((d) => (
                          <div key={d.month} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-surface-2 px-3">
                            <span className="text-body-sm text-text">{formatMonth(d.month, lang)}</span>
                            <span className="flex items-center gap-2">
                              <Money value={d.amount} className="text-body-sm font-semibold" />
                              {d.deducted ? (
                                <StatusChip tone="success" icon={Check}>{t('team.my.repaid')}</StatusChip>
                              ) : recoveredSoFar(d) > 0 ? (
                                <StatusChip tone="neutral">{formatINR(recoveredSoFar(d))}</StatusChip>
                              ) : (
                                <StatusChip tone="neutral">{t('status.due')}</StatusChip>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              ))
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
