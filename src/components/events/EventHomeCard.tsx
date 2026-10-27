// Home card for staff assigned to an event, on the event days: where they're working, today's day
// close, the stall's cash, deliveries on the way, and a way in. Renders nothing for anyone else.
import * as React from 'react';
import { CalendarDays, CheckCircle2, Clock, Truck } from 'lucide-react';
import { Card, CardAction, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { StatusChip } from '../ui/status-chip';
import { Money } from '../ui/money';
import { StatSplit } from '../ui/stat-tile';
import { useT } from '../../utils/i18n';
import type { MyEvent } from '../../utils/eventsApi';
import { EventStatusChip, dateRange, dayNumber, localNum, useEventsToday } from './eventsShared';
import { useActiveEventsForUser } from './useActiveEventsForUser';

export function EventHomeCard({ onOpen, events: given }: {
  onOpen: (eventId: string, tab?: 'sales' | 'stock' | 'money') => void;
  events?: MyEvent[]; // the shell may pass what it already loaded
}) {
  const { t, lang } = useT();
  const loaded = useActiveEventsForUser({ enabled: !given });
  const today = useEventsToday();
  const events = given || loaded.events;
  if (!events.length) return null;

  return (
    <div className="flex flex-col gap-3" lang={lang}>
      {events.map((ev) => {
        const total = dayNumber(ev.startDate, ev.endDate);
        const n = ev.status === 'live' ? dayNumber(ev.startDate, today) : null;
        return (
          <Card key={ev.id}>
            <CardHeader>
              <CalendarDays className="size-5 text-text-2" aria-hidden="true" />
              <CardTitle>{ev.name}</CardTitle>
              <CardAction><EventStatusChip status={ev.status} size="sm" /></CardAction>
            </CardHeader>
            <p className="text-body-sm text-text-2">
              {[t('event.atStall'), dateRange(ev.startDate, ev.endDate, lang), n && n >= 1 && n <= total ? t('event.dayOf', { n: localNum(n, lang), total: localNum(total, lang) }) : null, ev.myRole === 'incharge' ? t('event.youIncharge') : null].filter(Boolean).join(' · ')}
            </p>
            <StatSplit items={[
              { label: t('event.salesToday'), value: <Money value={ev.today.sales} /> },
              { label: t('event.cashInHand'), value: <Money value={ev.cashInHand} /> },
            ]} />
            <div className="flex flex-wrap items-center gap-2">
              {ev.today.submitted
                ? <StatusChip tone="success" icon={CheckCircle2}>{t('event.dayCloseSent')}</StatusChip>
                : <StatusChip tone="warning" icon={Clock}>{t('event.dayCloseDue')}</StatusChip>}
              {ev.incoming > 0 && <StatusChip tone="info" icon={Truck}>{t('event.incoming', { n: ev.incoming })}</StatusChip>}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => onOpen(ev.id, 'sales')}>{ev.myRole === 'incharge' && !ev.today.submitted ? t('event.sendDayClose') : t('event.open')}</Button>
              {ev.incoming > 0 && <Button variant="secondary" onClick={() => onOpen(ev.id, 'stock')}>{t('event.countDelivery')}</Button>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
