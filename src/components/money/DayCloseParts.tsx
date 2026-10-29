// Pieces of the day close (store incharge, SalesManagement) and the day review (everyone else,
// SalesView): status banner, the difference chip, the "How is this worked out?" sheet, the Paytm
// breakdown sheet, the cash top-up request sheet and rows. Figures come in ready-made; nothing
// here calculates money.
import * as React from 'react';
import { AlertTriangle, Check, Clock, CloudOff, Copy, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';
import type * as api from '../../utils/api';
import { useT } from '../../utils/i18n';
import { formatDateIST, formatDateTimeIST } from '../../utils/timezone';
import { useOutbox } from '../SyncStatus';
import type * as outbox from '../../utils/outbox';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { DateStrip } from '../ui/date-strip';
import { Field } from '../ui/field';
import { ListRow } from '../ui/list-row';
import { Money, MoneyInput, formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { StatTile, StatGrid } from '../ui/stat-tile';
import { PickerField } from '../ui/picker-sheet';
import { cn } from '../ui/utils';
import { getTodayIST } from '../../utils/timezone';
import { FigureCard, FigureRow } from './MoneyLayout';

// ------------------------------------------------------------------------------------------
// Date band and status
// ------------------------------------------------------------------------------------------

/** The 7-day strip under the shell's tabs (white band on phones, a card on wider screens). */
export function DayBand({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const { t } = useT();
  const today = getTodayIST();
  return (
    <div className="-mx-4 -mt-4 border-b border-border bg-surface px-2 pt-1 pb-2 md:mx-0 md:mt-0 md:rounded-lg md:border">
      <DateStrip
        value={value}
        onChange={onChange}
        today={today}
        max={today}
        showMonthLabel
        headerAction={value !== today ? <Button variant="ghost" size="sm" onClick={() => onChange(today)}>{t('date.today')}</Button> : undefined}
      />
    </div>
  );
}

export type DayStatus =
  | { kind: 'notStarted' }
  | { kind: 'draft' }
  | { kind: 'waiting' }
  | { kind: 'submitted'; asked: boolean; needsApproval: boolean }
  | { kind: 'approved'; by: string; at?: string | null }
  | { kind: 'rejected'; by: string; at?: string | null; reason?: string | null };

/** One line at the top of the day: where it stands, with the next step when there is one. */
export function DayStatusBanner({ status, onFix, readOnly }: { status: DayStatus; onFix?: () => void; readOnly?: boolean }) {
  const { t } = useT();
  let tone: StatusTone = 'neutral';
  let icon: LucideIcon | undefined;
  let word = '';
  let line: React.ReactNode = '';
  switch (status.kind) {
    case 'notStarted':
      word = t('status.notStarted');
      line = readOnly ? t('dc.lineNotStartedView') : t('dc.lineNotStarted');
      break;
    case 'draft':
      word = t('status.draft');
      line = t('dc.lineDraft');
      break;
    case 'waiting':
      tone = 'info';
      icon = CloudOff;
      word = t('status.waitingToSend');
      line = t('dc.lineWaiting');
      break;
    case 'submitted':
      tone = status.needsApproval || status.asked ? 'warning' : 'info';
      icon = Clock;
      word = status.needsApproval || status.asked ? t('dc.waitingApproval') : t('status.sent');
      line = status.asked ? t('dc.lineAsked') : status.needsApproval ? t('dc.lineNeedsApproval') : t('dc.lineSent');
      break;
    case 'approved':
      tone = 'success';
      icon = Check;
      word = t('status.approved');
      line = t('dc.approvedBy', { name: status.by }) + (status.at ? ` · ${formatDateTimeIST(status.at, false)}` : '');
      break;
    case 'rejected':
      tone = 'danger';
      icon = XCircle;
      word = t('status.rejected');
      line = t('dc.rejectedBy', { name: status.by });
      break;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusChip tone={tone} icon={icon}>{word}</StatusChip>
        <span className="text-label text-text-3">{line}</span>
      </div>
      {status.kind === 'rejected' && (
        <Callout
          tone="danger"
          title={status.reason ? t('dc.rejectReason', { reason: status.reason }) : t('status.rejected')}
          action={onFix && !readOnly ? <Button variant="secondary" size="sm" onClick={onFix}>{t('dc.fixResubmit')}</Button> : undefined}
        >
          {t('dc.payFromPocket')}
        </Callout>
      )}
    </div>
  );
}

/** Day close / expenses for this day still on this phone, so nobody enters them twice. */
export function MoneyWaiting({ kinds, date }: { kinds: outbox.OutboxKind[]; date?: string }) {
  const { t } = useT();
  const entries = useOutbox().filter((e) => kinds.includes(e.kind) && (!date || e.body?.date === date));
  if (entries.length === 0) return null;
  const queued = entries.every((e) => e.state === 'queued' || e.state === 'sending');
  return (
    <Callout tone="info" icon={CloudOff} title={t('status.waitingToSend')}>
      <span className="flex flex-col gap-0.5">
        {entries.map((entry) => <span key={entry.id}>{entry.label}</span>)}
        <span className="text-label text-text-2">{queued ? t('dc.waitingSendsItself') : t('dc.waitingCheck')}</span>
      </span>
    </Callout>
  );
}

// ------------------------------------------------------------------------------------------
// Figures
// ------------------------------------------------------------------------------------------

/**
 * Matched / Short ₹x / Excess ₹x. `diff` is counted minus expected (negative = short).
 * `notCounted` shows a neutral "Not counted yet" instead of a number.
 */
export function DiffChip({ diff, notCounted, tolerance = 0.01 }: { diff: number; notCounted?: boolean; tolerance?: number }) {
  const { t } = useT();
  if (notCounted) return <StatusChip tone="neutral">{t('dc.notCounted')}</StatusChip>;
  if (Math.abs(diff) <= tolerance) return <StatusChip tone="success" icon={Check}>{t('status.matched')}</StatusChip>;
  const amount = formatINR(Math.abs(diff));
  if (diff < 0) return <StatusChip tone="danger" icon={AlertTriangle}>{t('status.short', { amount })}</StatusChip>;
  return <StatusChip tone="warning" icon={AlertTriangle}>{t('status.excess', { amount })}</StatusChip>;
}

export type FormulaLine = { label: string; amount: number; sign: '+' | '−' | '' };

/** "How is this worked out?" - today's expected-cash sum, line by line. */
export function FormulaSheet({ open, onOpenChange, title, lines, totalLabel, total, note, breakdown }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  lines: FormulaLine[];
  totalLabel: string;
  total: number;
  note?: React.ReactNode;
  breakdown?: { rows: { label: string; store: number; production: number }[]; storeTotal: number; productionTotal: number };
}) {
  const { t } = useT();
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title} footer={<Button size="lg" variant="secondary" fullWidth onClick={() => onOpenChange(false)}>{t('common.close')}</Button>}>
      <div className="flex flex-col gap-4">
        <FigureCard>
          {lines.map((line) => (
            <FigureRow key={line.label} label={line.label} value={<span>{line.sign && <span className="text-text-3">{line.sign} </span>}{formatINR(line.amount)}</span>} />
          ))}
          <FigureRow label={totalLabel} value={formatINR(total)} emphasis className="bg-surface-2" />
        </FigureCard>
        {note && <p className="text-body-sm text-text-2">{note}</p>}
        {breakdown && (
          <div className="flex flex-col gap-2">
            <h3 className="text-label font-semibold text-text-2">{t('dc.spendSplit')}</h3>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="grid grid-cols-3 gap-2 bg-surface-2 px-4 py-2 text-label font-medium text-text-2">
                <span>{t('dc.type')}</span>
                <span className="text-right">{t('exp.store')}</span>
                <span className="text-right">{t('exp.productionHouse')}</span>
              </div>
              {breakdown.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-3 gap-2 border-t border-border px-4 py-2 text-body-sm text-text">
                  <span>{row.label === 'Inventory' ? t('exp.ingredients') : row.label === 'Overhead' ? t('exp.running') : t('exp.fixedCosts')}</span>
                  <Money value={row.store} className="text-right" />
                  <Money value={row.production} className="text-right" />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 border-t border-border bg-surface-2 px-4 py-2 text-body-sm font-semibold text-text">
                <span>{t('dc.total')}</span>
                <Money value={breakdown.storeTotal} className="text-right" />
                <Money value={breakdown.productionTotal} className="text-right" />
              </div>
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

export type PaytmBreakdownRow = {
  date: string;
  paytmReceived: number;
  onlinePayouts: number;
  usedOnlineMoney: number;
  commission: number;
  employeePayouts: number;
  loansTaken: number;
  loanRepayments: number;
  runningBalance: number;
};

/** The month's Paytm movements, a day per group, newest first. */
export function PaytmBreakdownSheet({ open, onOpenChange, rows, balance, selectedDate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: PaytmBreakdownRow[];
  balance: number;
  selectedDate: string;
}) {
  const { t } = useT();
  const received = rows.reduce((sum, day) => sum + day.paytmReceived + day.onlinePayouts + (day.loansTaken || 0), 0);
  const used = rows.reduce((sum, day) => sum + day.usedOnlineMoney + day.commission + (day.employeePayouts || 0) + (day.loanRepayments || 0), 0);
  const lines = (day: PaytmBreakdownRow): { label: string; amount: number; sign: '+' | '−' }[] => [
    { label: t('dc.p.paytmIn'), amount: day.paytmReceived, sign: '+' as const },
    { label: t('dc.p.payouts'), amount: day.onlinePayouts, sign: '+' as const },
    { label: t('dc.p.loan'), amount: day.loansTaken, sign: '+' as const },
    { label: t('dc.p.topups'), amount: day.usedOnlineMoney, sign: '−' as const },
    { label: t('dc.p.commission'), amount: day.commission, sign: '−' as const },
    { label: t('dc.p.salaries'), amount: day.employeePayouts, sign: '−' as const },
    { label: t('dc.p.repayment'), amount: day.loanRepayments, sign: '−' as const },
  ].filter((l) => l.amount > 0);
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t('dc.paytmBreakdown')} description={t('dc.paytmBreakdownSub')} size="detail">
      <div className="flex flex-col gap-4">
        <StatGrid columns={3}>
          <StatTile label={t('dc.p.received')} value={<Money value={received} />} />
          <StatTile label={t('dc.p.used')} value={<Money value={used} />} />
          <StatTile label={t('dc.paytmBalance')} value={<Money value={balance} />} className="col-span-2 lg:col-span-1" />
        </StatGrid>
        {rows.length === 0 && <p className="text-body-sm text-text-2">{t('dc.p.none')}</p>}
        {[...rows].reverse().map((day) => (
          <div key={day.date} className={cn('overflow-hidden rounded-lg border bg-surface', day.date === selectedDate ? 'border-primary' : 'border-border')}>
            <div className="flex items-center justify-between gap-3 bg-surface-2 px-4 py-2">
              <span className="flex items-center gap-2 text-body-sm font-semibold text-text">
                {formatDateIST(day.date)}
                {day.date === selectedDate && <StatusChip tone="brand" size="sm">{t('date.today')}</StatusChip>}
              </span>
              <span className="text-label text-text-2">{t('dc.p.balance')} <Money value={day.runningBalance} className="font-semibold text-text" /></span>
            </div>
            {lines(day).map((l) => (
              <div key={l.label} className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-body-sm">
                <span className="text-text-2">{l.label}</span>
                <span className={cn('num font-medium', l.sign === '+' ? 'text-success' : 'text-text')}>{l.sign} {formatINR(l.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ResponsiveModal>
  );
}

// ------------------------------------------------------------------------------------------
// Cash top-ups
// ------------------------------------------------------------------------------------------

export const TOPUP_REASON_LABELS: Record<api.CashTopupReason, string> = {
  store_inventory: 'Store inventory',
  production_inventory: 'Production house inventory',
  other: 'Other',
  event_cash: 'Event stall cash', // label only: event requests (events.ts) never touch this store's till
};

/** The short id the owner quotes when paying a top-up. */
export const topupCode = (r: Pick<api.CashTopupRequest, 'id'>) => `#${r.id.slice(-6).toUpperCase()}`;

/** One waiting top-up request. */
export function TopupRow({ request, showRequester, children }: { request: api.CashTopupRequest; showRequester?: boolean; children?: React.ReactNode }) {
  const r = request;
  const code = topupCode(r);
  const who = showRequester ? `${r.requestedByName}${r.requestedByEntityName ? ` (${r.requestedByEntityName})` : ''} · ` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.success(`Copied ${code}`); } catch { toast.error('Could not copy'); }
  };
  return (
    <div className="flex flex-col">
      <ListRow
        title={<span>{formatINR(r.requestedAmount)} <span className="font-normal text-text-2">for {formatDateIST(r.date)}</span></span>}
        // The id goes first (owner, 29 Oct 2026: it's what the payment needs): the line is cut
        // after two lines, and "Production house inventory" pushed it off the end.
        subtitle={<><span className="num font-medium text-text-2">{code}</span> · {who}{TOPUP_REASON_LABELS[r.reason]} · {formatDateTimeIST(r.requestDate, false)}</>}
        trailing={<StatusChip status="approval.pending" />}
      />
      {r.reason === 'event_cash' && r.note && <p className="-mt-1 px-4 pb-2 text-label text-text-2">{r.note}</p>}
      {children && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {children}
          <Button variant="ghost" size="sm" leadingIcon={<Copy />} onClick={copy}>Copy {code}</Button>
        </div>
      )}
    </div>
  );
}

export type TopupFormValue = { date: string; amount: number | null; reason: api.CashTopupReason; destination: string; storeId: string };

/** Request (or, for the owner, add) a cash top-up. */
export function TopupSheet({ open, onOpenChange, value, onChange, onSubmit, submitting, mode, destinations, stores, singleStoreName, reasonChoices }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TopupFormValue;
  onChange: (next: TopupFormValue) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** owner: added straight away to the picked store or production house. */
  mode: 'request' | 'owner';
  destinations?: { value: string; label: string; description?: string }[];
  /** Production incharge supplying several stores: which store to credit. */
  stores?: { id: string; name: string }[];
  singleStoreName?: string;
  reasonChoices: api.CashTopupReason[];
}) {
  const { t } = useT();
  const toProduction = mode === 'owner' && value.destination.startsWith('ph:');
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'owner' ? t('topup.addTitle') : t('topup.requestTitle')}
      dirty={value.amount !== null}
      footer={<Button size="lg" fullWidth loading={submitting} onClick={onSubmit}>{mode === 'owner' ? t('topup.add') : t('topup.send')}</Button>}
    >
      <div className="flex flex-col gap-4">
        {mode === 'owner' && destinations && (
          <Field label={t('topup.giveTo')} helper={t('topup.ownerHelp')}>
            <PickerField title={t('topup.giveTo')} items={destinations} value={value.destination} onValueChange={(v) => onChange({ ...value, destination: v })} placeholder={t('topup.pickPlace')} />
          </Field>
        )}
        <Field label={t('topup.dateFor')} helper={t('topup.dateHelp')}>
          <div className="rounded-md border border-border-strong bg-surface px-1 pb-1">
            <DateStrip value={value.date} onChange={(d) => onChange({ ...value, date: d })} max={getTodayIST()} hideCalendarButton={false} />
          </div>
        </Field>
        <Field label={t('money.amount')} required>
          <MoneyInput value={value.amount} onValueChange={(n) => onChange({ ...value, amount: n })} autoFocus />
        </Field>
        {!toProduction && reasonChoices.length > 1 && (
          <Field label={t('topup.reason')}>
            <SegmentedControl
              aria-label={t('topup.reason')}
              value={value.reason}
              onValueChange={(v) => onChange({ ...value, reason: v })}
              options={reasonChoices.map((r) => ({ value: r, label: r === 'store_inventory' ? t('exp.store') : r === 'production_inventory' ? t('exp.production') : t('topup.other') }))}
            />
          </Field>
        )}
        {stores && stores.length > 1 && (
          <Field label={t('topup.whichStore')}>
            <PickerField title={t('topup.whichStore')} items={stores.map((s) => ({ value: s.id, label: s.name }))} value={value.storeId} onValueChange={(v) => onChange({ ...value, storeId: v })} />
          </Field>
        )}
        {singleStoreName && <p className="text-body-sm text-text-2">{t('topup.creditsOnly', { name: singleStoreName })}</p>}
      </div>
    </ResponsiveModal>
  );
}
