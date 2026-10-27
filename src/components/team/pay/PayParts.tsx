// Small pieces of Team → Pay: the pay status chip, the period chip (this month / last month /
// custom dates) and a person's row.
import * as React from 'react';
import { CalendarDays, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { InitialsAvatar } from '../../ui/avatar';
import { ListRow } from '../../ui/list-row';
import { Money, formatINR } from '../../ui/money';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { SelectChip } from '../../ui/chip';
import { StatusChip } from '../../ui/status-chip';
import { DatePicker } from '../../DatePicker';
import { cn } from '../../ui/utils';
import { useT } from '../../../utils/i18n';
import { formatDay, formatMonth } from '../shared';
import type { MonthBounds, PayStatus, ViewMode } from '../payrollMath';
import type { PayRow } from './payView';

export function PayStatusChip({ status }: { status: PayStatus }) {
  const { t } = useT();
  if (status === 'paid') return <StatusChip status="pay.paid" />;
  if (status === 'partlyPaid') return <StatusChip tone="neutral">{t('status.partlyPaid')}</StatusChip>;
  if (status === 'due') return <StatusChip status="pay.due" />;
  return <StatusChip tone="neutral">{t('team.pay.noSalary')}</StatusChip>;
}

export type PeriodState = { viewMode: ViewMode; customStart: string; customEnd: string };

export function periodLabel(state: PeriodState, current: MonthBounds, last: MonthBounds, lang: Parameters<typeof formatMonth>[1], t: (k: 'team.pay.pickDates') => string) {
  if (state.viewMode === 'current') return formatMonth(current.start.slice(0, 7), lang);
  if (state.viewMode === 'last') return formatMonth(last.start.slice(0, 7), lang);
  if (state.customStart && state.customEnd) return `${formatDay(state.customStart, lang, { short: true })} – ${formatDay(state.customEnd, lang, { short: true })}`;
  return t('team.pay.pickDates');
}

/** "October ▾" chip opening This month / Last month / Custom dates (the same sheet swaps to the dates). */
export function PeriodChip({ value, onChange, current, last }: { value: PeriodState; onChange: (v: PeriodState) => void; current: MonthBounds; last: MonthBounds }) {
  const { t, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const [custom, setCustom] = React.useState(false);
  const [from, setFrom] = React.useState(value.customStart);
  const [to, setTo] = React.useState(value.customEnd);

  const pick = (viewMode: ViewMode) => {
    if (viewMode === 'custom') {
      setFrom(value.customStart);
      setTo(value.customEnd);
      setCustom(true);
      return;
    }
    onChange({ ...value, viewMode });
    setOpen(false);
  };

  const option = (mode: ViewMode, label: string, sub?: string) => (
    <button
      key={mode}
      type="button"
      onClick={() => pick(mode)}
      aria-pressed={value.viewMode === mode}
      className={cn(
        'flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2',
        value.viewMode === mode && 'bg-primary-soft',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('text-body-md font-medium', value.viewMode === mode ? 'text-primary' : 'text-text')}>{label}</span>
        {sub && <span className="text-label text-text-3">{sub}</span>}
      </span>
      {mode === 'custom' ? <ChevronRight className="size-5 text-text-3" aria-hidden="true" /> : value.viewMode === mode ? <Check className="size-5 text-primary" aria-hidden="true" /> : null}
    </button>
  );

  return (
    <>
      <SelectChip leadingIcon={<CalendarDays />} trailingIcon={<ChevronDown />} onClick={() => { setCustom(false); setOpen(true); }} aria-haspopup="dialog">
        {periodLabel(value, current, last, lang, t)}
      </SelectChip>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={custom ? t('date.custom') : t('date.rangeTitle')}
        onBack={custom ? () => setCustom(false) : undefined}
        footer={
          custom ? (
            <Button
              size="lg"
              className="flex-1"
              disabled={!from || !to}
              onClick={() => {
                onChange({ viewMode: 'custom', customStart: from, customEnd: to });
                setOpen(false);
              }}
            >
              {t('common.apply')}
            </Button>
          ) : undefined
        }
      >
        {custom ? (
          <div className="flex flex-col gap-4">
            <DatePicker label={t('date.from')} value={from} onChange={setFrom} className="w-full" />
            <DatePicker label={t('date.to')} value={to} onChange={setTo} min={from || undefined} className="w-full" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
            {option('current', t('date.thisMonth'), formatMonth(current.start.slice(0, 7), lang))}
            {option('last', t('date.lastMonth'), formatMonth(last.start.slice(0, 7), lang))}
            {option('custom', t('date.custom'))}
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}

/** One person in Team → Pay: name, how they're paid, amount and a status chip. */
export function PayRowItem({ row, onOpen }: { row: PayRow; onOpen: () => void }) {
  const { t } = useT();
  const emp = row.employee;
  let subtitle: string;
  if (row.former) subtitle = t('team.pay.former');
  else if (row.type === 'contract') {
    subtitle = emp?.dailyRate
      ? t('team.pay.daysAtRate', { n: row.daysWorked, rate: formatINR(emp.dailyRate) })
      : t('team.pay.daysPaidN', { n: row.daysWorked });
  } else {
    subtitle = row.salary ? t('team.pay.salaryAmount', { amount: formatINR(row.salary) }) : t('team.pay.monthlySalary');
    if (row.personalExpenses) subtitle += ` · ${t('team.pay.lessPersonal', { amount: formatINR(row.personalExpenses) })}`;
  }
  return (
    <ListRow
      leading={<InitialsAvatar name={row.name} />}
      title={row.name}
      subtitle={subtitle}
      onClick={onOpen}
      chevron={false}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <Money value={row.amount} className="text-body-md font-semibold text-text" />
          {row.status ? <PayStatusChip status={row.status} /> : row.type === 'contract' && row.paid > 0 ? <StatusChip status="pay.paid" /> : null}
        </span>
      }
    />
  );
}
