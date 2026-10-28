// "8 people in the team · 1 on leave today · 2 this month" on every Home, from the one list the
// whole team gets (GET /team/leave-calendar: names and dates, never reasons), so everyone plans
// their leave around the same numbers (owner, 28 Oct 2026). Tapping it shows who is off and when,
// day by day; leave still waiting for approval is marked.
import { useState } from 'react';
import { CalendarDays, Users } from 'lucide-react';
import { useShell } from '../shell/ShellContext';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Skeleton } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { useT } from '../../utils/i18n';
import type * as api from '../../utils/api';
import { formatDay } from '../team/shared';
import { leaveDays, placeLabel } from '../team/teamLeave';
import { useHomeData } from './homeData';
import { useLoad } from './HomeParts';
import { lastDayOfMonth, peopleOnLeave } from './homeFigures';

export function TeamLeaveRow({ onOpenAttendance }: { onOpenAttendance?: () => void }) {
  const { user } = useShell();
  const { t } = useT();
  const data = useHomeData();
  const token = user.accessToken || '';
  const cal = useLoad(token ? () => data.getTeamLeaveCalendar(token) : null, [token, data]);
  const [open, setOpen] = useState(false);

  if (cal.loading && !cal.data) return <Skeleton className="h-[72px] w-full rounded-lg" />;
  // Leave out the row rather than break Home (an older server, or no connection).
  if (!cal.data) return null;
  const { today, leaves } = cal.data;
  const leaveToday = peopleOnLeave(leaves as any, today, today);
  const leaveMonth = peopleOnLeave(leaves as any, today, lastDayOfMonth(today));
  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <ListRow
          icon={Users}
          title={t('home.team.people', { n: cal.data.people })}
          subtitle={t('home.team.leave', { today: leaveToday, month: leaveMonth })}
          onClick={() => setOpen(true)}
        />
      </div>
      <WhoIsOffSheet open={open} onOpenChange={setOpen} cal={cal.data} onOpenAttendance={onOpenAttendance ? () => { setOpen(false); onOpenAttendance(); } : undefined} />
    </>
  );
}

function WhoIsOffSheet({ open, onOpenChange, cal, onOpenAttendance }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cal: api.TeamLeaveCalendar;
  onOpenAttendance?: () => void;
}) {
  const { t, lang } = useT();
  const days = leaveDays(cal);
  const upTo = formatDay(cal.to, lang, { short: true });
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('teamLeave.title')}
      description={t('teamLeave.upTo', { date: upTo })}
      size="detail"
      footer={onOpenAttendance ? <Button variant="secondary" size="lg" className="flex-1" onClick={onOpenAttendance}>{t('teamLeave.openAttendance')}</Button> : undefined}
    >
      {days.length === 0 ? (
        <EmptyState compact icon={CalendarDays} title={t('teamLeave.none', { date: upTo })} />
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <ListGroup
              key={day.date}
              title={formatDay(day.date, lang, { weekday: true })}
              footer={day.short.length > 0
                ? <span className="text-warning">{day.short.map((s) => t('teamLeave.offOf', { place: placeLabel(cal, s.placeKey, t), off: s.off, of: s.of })).join(' · ')}</span>
                : undefined}
            >
              {day.people.map((p) => (
                <ListRow
                  key={`${p.employeeId}-${p.leaveDate}`}
                  title={p.name}
                  subtitle={[placeLabel(cal, p.placeKey, t), p.leaveType === 'half' ? t('team.att.halfDay') : ''].filter(Boolean).join(' · ')}
                  trailing={<StatusChip status={p.status === 'approved' ? 'approval.approved' : 'approval.pending'} />}
                />
              ))}
            </ListGroup>
          ))}
        </div>
      )}
    </ResponsiveModal>
  );
}
