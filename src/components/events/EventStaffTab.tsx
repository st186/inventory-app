// Staff: who is assigned (and who is the incharge), and today's check-ins at the stall (the shift
// clock verifies them against the event's pin on event days) and stall photo checks.
import * as React from 'react';
import { Camera, CheckCircle2, Clock, MapPin, ShieldCheck } from 'lucide-react';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { InitialsAvatar } from '../ui/avatar';
import { Callout } from '../ui/callout';
import { ErrorState } from '../ui/error-state';
import { SkeletonListRows } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import type { EventBundle } from '../../utils/eventsApi';
import { useEventsApi, useLoad } from './eventsShared';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function EventStaffTab({ bundle }: { bundle: EventBundle }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const ev = bundle.event;
  const live = ev.status === 'live';
  const today = useLoad(() => (live ? api.staffToday(ev.id) : Promise.resolve(null)), [ev.id, live]);
  const byId = new Map((today.data?.staff || []).map((s) => [s.employeeId, s]));

  return (
    <div className="flex flex-col gap-5" lang={lang}>
      <Callout tone="neutral" icon={MapPin} title={t('event.checkInHint')}>
        {ev.lat == null ? 'No pin on the map yet - check-ins are saved but not verified at the stall.' : `Check-in radius ${ev.radiusM} m.`}
      </Callout>

      {live && today.loading && !today.data && <SkeletonListRows count={3} leading="avatar" />}
      {live && today.error && <ErrorState onRetry={today.reload} />}

      <ListGroup title={live ? t('event.staffToday') : t('event.tab.staff')} empty="Nobody assigned yet">
        {bundle.staff.map((s) => {
          const d = byId.get(s.employeeId);
          const chips: React.ReactNode[] = [];
          if (s.isIncharge) chips.push(<StatusChip key="i" tone="brand" icon={ShieldCheck} size="sm">Incharge</StatusChip>);
          let subtitle = [s.designation?.replace(/_/g, ' '), s.phone].filter(Boolean).join(' · ');
          if (live && d) {
            const parts: string[] = [];
            parts.push(d.checkIn ? t('event.checkedIn', { time: time(d.checkIn.at) }) : d.pendingArrival ? 'Arrival waiting to confirm' : t('event.notCheckedIn'));
            if (d.checkOut) parts.push(`out ${time(d.checkOut.at)}`);
            if (d.photos) parts.push(t('event.photosToday', { done: d.photos.done, total: d.photos.required }));
            subtitle = parts.join(' · ');
          }
          const trailing = live && d
            ? d.checkIn
              ? (d.checkIn.atEvent && d.checkIn.verified ? <StatusChip tone="success" icon={CheckCircle2} size="sm">At stall</StatusChip> : <StatusChip tone="warning" size="sm">Not verified</StatusChip>)
              : <StatusChip tone="neutral" icon={Clock} size="sm">{t('event.notCheckedIn')}</StatusChip>
            : chips[0];
          return (
            <ListRow
              key={s.employeeId}
              leading={<InitialsAvatar name={s.name} size={40} />}
              title={s.name}
              subtitle={subtitle}
              chip={live && d ? chips[0] : undefined}
              trailing={trailing}
            />
          );
        })}
      </ListGroup>

      {live && (
        <ListGroup title="Stall photos">
          <ListRow density="compact" icon={Camera} title="Daily stall checklist" subtitle="Stall front, steamer, serving area, gas / fryer area and bins - sent by the incharge between 4 and 5 pm" />
        </ListGroup>
      )}
    </div>
  );
}
