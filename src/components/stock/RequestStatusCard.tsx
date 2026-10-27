// The store incharge's status card: which day the request is for, the 9 AM deadline, and where
// the request is - Sent -> Packed -> On the way -> Received, with the time of each step.
import * as React from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { cn } from '../ui/utils';
import { StatusChip } from '../ui/status-chip';
import { useT, type I18nKey } from '../../utils/i18n';
import type { ProductionRequest } from '../../utils/api';
import { addDays, getTodayIST } from '../../utils/timezone';
import { RequestStatusChip, dayLabel, requestStage, timeLabel } from './stockShared';

/** IST minutes since midnight right now. */
function istMinutesNow(): number {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** No request yet and the 9 AM deadline for that day has passed. */
export function isRequestLate(requestDate: string, today = getTodayIST()): boolean {
  return requestDate < today || (requestDate === today && istMinutesNow() >= 9 * 60);
}

const STEPS: { key: I18nKey; at: (r: ProductionRequest) => string | undefined }[] = [
  { key: 'status.sent', at: (r) => r.createdAt },
  { key: 'status.packed', at: (r) => r.preparedAt },
  { key: 'status.onTheWay', at: (r) => r.shippedAt },
  { key: 'status.received', at: (r) => r.receipt?.receivedAt || r.deliveredAt },
];

/** The four steps as dots on a line, done steps filled, with each step's time underneath. */
export function RequestStepper({ request }: { request: ProductionRequest | null }) {
  const { t } = useT();
  const stage = request ? requestStage(request.status) : -1;
  return (
    <ol className="grid grid-cols-4" aria-label={t('stock.req.progress')}>
      {STEPS.map((step, i) => {
        const done = i <= stage;
        const at = request && done ? timeLabel(step.at(request)) : '';
        return (
          <li key={step.key} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={i === stage ? 'step' : undefined}>
            {i > 0 && (
              <span aria-hidden="true" className={cn('absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2', i <= stage ? 'bg-primary' : 'bg-border-strong')} />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-[1] flex size-6 items-center justify-center rounded-full border-2',
                done ? 'border-primary bg-primary text-on-primary' : 'border-border-strong bg-surface',
              )}
            >
              {done && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className={cn('text-caption', done ? 'font-medium text-text' : 'text-text-3')}>{t(step.key)}</span>
            <span className="num min-h-4 text-caption text-text-3">{at}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A chip showing the request day that opens the phone's own date picker. */
function DateChip({ value, onChange, min }: { value: string; onChange: (date: string) => void; min?: string }) {
  const { t, lang } = useT();
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <label className="relative inline-flex min-h-11 items-center">
      <span className="hit-44 inline-flex h-9 min-h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-label font-medium whitespace-nowrap text-text [&_svg]:size-4">
        <CalendarDays aria-hidden="true" />
        <span className="num">{dayLabel(lang, value)}</span>
        <ChevronDown aria-hidden="true" />
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        aria-label={t('stock.req.changeDate')}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={() => {
          try {
            ref.current?.showPicker?.();
          } catch {
            /* the input still opens on tap */
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

export function RequestStatusCard({
  requestDate,
  onRequestDateChange,
  request,
  canChangeDate = true,
}: {
  requestDate: string;
  onRequestDateChange: (date: string) => void;
  /** The latest request already sent for this day, if any. */
  request: ProductionRequest | null;
  canChangeDate?: boolean;
}) {
  const { t, lang } = useT();
  const today = getTodayIST();
  const title = requestDate === today
    ? t('stock.req.todayTitle')
    : requestDate === addDays(today, 1)
      ? t('stock.req.tomorrowTitle')
      : t('stock.req.dateTitle', { date: dayLabel(lang, requestDate) });
  const caption = request
    ? t('stock.req.sentAtBy', { time: timeLabel(request.createdAt), name: request.requestedByName || request.requestedBy })
    : requestDate === today ? t('stock.req.sendBy') : t('stock.req.sendByDay', { day: dayLabel(lang, requestDate) });
  const late = !request && isRequestLate(requestDate, today);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-subtitle font-semibold text-text">{title}</h2>
          <span className="text-label text-text-3">{caption}</span>
        </div>
        {request ? <RequestStatusChip status={request.status} /> : late ? <StatusChip status="request.late" /> : <StatusChip status="request.notSent" />}
      </div>
      <RequestStepper request={request} />
      {canChangeDate && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-label text-text-2">{t('stock.req.changeDate')}</span>
          <DateChip value={requestDate} onChange={onRequestDateChange} />
        </div>
      )}
    </section>
  );
}
