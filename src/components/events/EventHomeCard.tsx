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

const HINTS_KEY = 'bunny:event-home-hints';
function readSeen(): { close?: boolean; receive?: boolean } {
  try { return JSON.parse(window.localStorage.getItem(HINTS_KEY) || '{}') || {}; } catch { return {}; }
}

export function EventHomeCard({ onOpen, events: given }: {
  onOpen: (eventId: string, tab?: 'sales' | 'stock' | 'money') => void;
  events?: MyEvent[]; // the shell may pass what it already loaded
}) {
  const { t, lang } = useT();
  const loaded = useActiveEventsForUser({ enabled: !given });
  const today = useEventsToday();
  const events = given || loaded.events;
  // One-line hints under the buttons until each has been used once (on this phone).
  const [seen, setSeen] = React.useState(readSeen);
  const markSeen = (k: 'close' | 'receive') => {
    const next = { ...seen, [k]: true };
    setSeen(next);
    try { window.localStorage.setItem(HINTS_KEY, JSON.stringify(next)); } catch { /* private mode: hints just stay */ }
  };
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Button className="w-full" onClick={() => { markSeen('close'); onOpen(ev.id, 'sales'); }}>{ev.myRole === 'incharge' && !ev.today.submitted ? t('event.sendDayClose') : t('event.open')}</Button>
                {ev.myRole === 'incharge' && !ev.today.submitted && !seen.close && <span className="text-caption text-text-3">{t('event.hintCloseToday')}</span>}
              </div>
              {ev.incoming > 0 && (
                <div className="flex flex-col gap-1">
                  <Button variant="secondary" className="w-full" onClick={() => { markSeen('receive'); onOpen(ev.id, 'stock'); }}>{t('event.countDelivery')}</Button>
                  {!seen.receive && <span className="text-caption text-text-3">{t('event.hintReceive')}</span>}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
