// Sales: one row per event day - the day close status, typed or POS figures, the cash count.
import * as React from 'react';
import { CalendarDays, CheckCircle2, Clock, MonitorSmartphone, PenLine } from 'lucide-react';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Button } from '../ui/button';
import { Money } from '../ui/money';
import { Callout } from '../ui/callout';
import { useT } from '../../utils/i18n';
import type { EventBundle, EventDayRow } from '../../utils/eventsApi';
import { EventDayCloseSheet } from './EventDayCloseSheet';
import { dayNumber, localNum, shortDate, weekday } from './eventsShared';

export function EventSalesTab({ bundle, onChanged, waiting }: { bundle: EventBundle; onChanged: () => void; waiting: number }) {
  const { t, lang } = useT();
  const [open, setOpen] = React.useState<EventDayRow | null>(null);
  const ev = bundle.event;
  const today = bundle.today;
  const total = bundle.days.length;
  const todayRow = bundle.days.find((d) => d.date === today);
  const canEnter = bundle.permissions.canEnter;
  // Past and today's days, newest first; later days are listed after, greyed.
  const done = bundle.days.filter((d) => d.date <= today).reverse();
  const later = bundle.days.filter((d) => d.date > today);

  const chip = (d: EventDayRow) => {
    if (d.day?.submitted) return <StatusChip tone="success" icon={CheckCircle2} size="sm">{t('status.sent')}</StatusChip>;
    if (d.day?.manual) return <StatusChip tone="neutral" icon={PenLine} size="sm">{t('status.draft')}</StatusChip>;
    if (d.day?.pos?.ok !== false && d.day?.pos) return <StatusChip tone="info" icon={MonitorSmartphone} size="sm">POS</StatusChip>;
    return <StatusChip tone="warning" icon={Clock} size="sm">{t('status.notSent')}</StatusChip>;
  };
  // The day's state as the row's icon and first words, so the row keeps room for the amount.
  const state = (d: EventDayRow) => {
    if (d.day?.submitted) return { icon: CheckCircle2, tone: 'success' as const, word: t('status.sent') };
    if (d.day?.manual) return { icon: PenLine, tone: 'neutral' as const, word: t('status.draft') };
    if (d.day?.pos?.ok !== false && d.day?.pos) return { icon: MonitorSmartphone, tone: 'info' as const, word: 'POS' };
    return { icon: Clock, tone: 'warning' as const, word: t('status.notSent') };
  };
  const sub = (d: EventDayRow) => {
    const parts = [state(d).word, t('event.dayOf', { n: localNum(dayNumber(ev.startDate, d.date), lang), total: localNum(total, lang) })];
    if (typeof d.day?.cashDiff === 'number' && Math.abs(d.day.cashDiff) >= 1) parts.push(`${d.day.cashDiff < 0 ? 'Cash short' : 'Cash over'} ₹${Math.abs(d.day.cashDiff).toLocaleString('en-IN')}`);
    return parts.join(' · ');
  };

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      {waiting > 0 && <Callout tone="info" title={t('event.waitingToSend', { n: waiting })}>{t('event.savedOnPhone')}</Callout>}
      {todayRow && canEnter && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-label text-text-2">{t('event.salesToday')}</span>
              <Money value={todayRow.sales.total} className="text-display font-semibold" />
            </div>
            {chip(todayRow)}
          </div>
          <Button size="lg" onClick={() => setOpen(todayRow)}>{todayRow.day?.submitted ? t('event.dayClose') : t('event.sendDayClose')}</Button>
        </div>
      )}

      <ListGroup title="Event days" empty={t('event.nothingYet')}>
        {done.map((d) => (
          <ListRow
            key={d.date}
            icon={state(d).icon}
            iconTone={state(d).tone}
            title={`${weekday(d.date)} ${shortDate(d.date, lang)}`}
            subtitle={sub(d)}
            amount={d.sales.total}
            onClick={canEnter ? () => setOpen(d) : undefined}
          />
        ))}
        {later.map((d) => (
          <ListRow key={d.date} muted icon={CalendarDays} title={`${weekday(d.date)} ${shortDate(d.date, lang)}`} subtitle={t('event.dayOf', { n: localNum(dayNumber(ev.startDate, d.date), lang), total: localNum(total, lang) })} />
        ))}
      </ListGroup>

      {open && (
        <EventDayCloseSheet
          open={!!open}
          onOpenChange={(o) => { if (!o) setOpen(null); }}
          bundle={bundle}
          row={open}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
