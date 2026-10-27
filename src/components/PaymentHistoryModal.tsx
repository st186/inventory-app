// One person's whole payment history, month by month: payouts (by the month they were paid) and
// personal expenses booked as their salary (by expenseMonth when set). Shown inside the payslip
// sheet (Team → Pay → a person → Full payment history); PaymentHistoryModal wraps it on its own.
import { Banknote, CalendarClock, Wallet } from 'lucide-react';
import { ListGroup, ListRow } from './ui/list-row';
import { EmptyState } from './ui/empty-state';
import { Money } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { StatTile, StatGrid } from './ui/stat-tile';
import { useT } from '../utils/i18n';
import { formatDay, formatMonth } from './team/shared';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
}

interface Payout {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  date: string;
}

interface OverheadItem {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  expenseMonth?: string;
}

type Entry = { type: 'payout'; data: Payout; actualDate: string } | { type: 'expense'; data: OverheadItem; actualDate: string };

const monthKeyOf = (date: string) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Month groups, newest first, with each month's total (payouts + personal expenses). */
export function groupPaymentHistory(payouts: Payout[], personalExpenses: OverheadItem[]) {
  const groups: Record<string, Entry[]> = {};
  payouts.forEach((p) => {
    (groups[monthKeyOf(p.date)] ||= []).push({ type: 'payout', data: p, actualDate: p.date });
  });
  personalExpenses.forEach((o) => {
    (groups[o.expenseMonth || monthKeyOf(o.date)] ||= []).push({ type: 'expense', data: o, actualDate: o.date });
  });
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, entries]) => ({
      monthKey,
      entries: [...entries].sort((a, b) => new Date(b.actualDate).getTime() - new Date(a.actualDate).getTime()),
      total: entries.reduce((sum, e) => sum + e.data.amount, 0),
    }));
}

export function PaymentHistoryContent({ payouts, personalExpenses }: { payouts: Payout[]; personalExpenses: OverheadItem[] }) {
  const { t, lang } = useT();
  const months = groupPaymentHistory(payouts, personalExpenses);
  const totalPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = personalExpenses.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="flex flex-col gap-4" data-ai-private>
      <StatGrid columns={3}>
        <StatTile label={t('team.history.payouts', { n: payouts.length })} value={<Money value={totalPayouts} />} />
        <StatTile label={t('team.history.personal', { n: personalExpenses.length })} value={<Money value={totalExpenses} />} />
        <StatTile label={t('team.history.totalPaid')} value={<Money value={totalPayouts + totalExpenses} />} className="col-span-2 lg:col-span-1" />
      </StatGrid>
      {months.length === 0 ? (
        <EmptyState compact icon={Wallet} title={t('team.history.empty')} />
      ) : (
        months.map((m) => (
          <ListGroup key={m.monthKey} title={formatMonth(m.monthKey, lang)} meta={t('team.history.count', { n: m.entries.length })} action={<Money value={m.total} className="text-body-md font-semibold text-text" />}>
            {m.entries.map((e) => {
              if (e.type === 'payout') {
                return <ListRow key={`p-${e.data.id}`} density="compact" icon={Banknote} title={t('team.history.payout')} subtitle={formatDay(e.data.date, lang, { weekday: true })} amount={e.data.amount} />;
              }
              const paidMonth = monthKeyOf(e.data.date);
              const mapped = !!e.data.expenseMonth && e.data.expenseMonth !== paidMonth;
              return (
                <ListRow
                  key={`e-${e.data.id}`}
                  density="compact"
                  icon={CalendarClock}
                  title={t('team.history.salaryExpense')}
                  subtitle={[mapped ? t('team.history.mapped', { date: formatDay(e.data.date, lang) }) : formatDay(e.data.date, lang), e.data.description].filter(Boolean).join(' · ')}
                  amount={e.data.amount}
                />
              );
            })}
          </ListGroup>
        ))
      )}
    </div>
  );
}

interface PaymentHistoryModalProps {
  employee: Employee;
  payouts: Payout[];
  personalExpenses: OverheadItem[];
  onClose: () => void;
}

export function PaymentHistoryModal({ employee, payouts, personalExpenses, onClose }: PaymentHistoryModalProps) {
  const { t } = useT();
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={t('team.history.title')} description={`${employee.name} · ${employee.employeeId}`} size="detail">
      <PaymentHistoryContent payouts={payouts} personalExpenses={personalExpenses} />
    </ResponsiveModal>
  );
}
