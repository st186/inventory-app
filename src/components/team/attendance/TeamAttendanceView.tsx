// Team → Attendance for whoever approves: Today (who logged, who is on leave, who hasn't logged),
// Approvals (timesheets with inline approve / reject, then leave requests) and Leave (upcoming
// leave and past decisions).
import * as React from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Clock, UserCheck, Users } from 'lucide-react';
import { EmptyState } from '../../ui/empty-state';
import { ErrorState } from '../../ui/error-state';
import { InitialsAvatar } from '../../ui/avatar';
import { ListGroup, ListRow } from '../../ui/list-row';
import { SegmentedControl } from '../../ui/segmented-control';
import { SkeletonListRows } from '../../ui/skeleton';
import { StatusChip } from '../../ui/status-chip';
import { useT } from '../../../utils/i18n';
import { getTodayIST } from '../../../utils/timezone';
import { ApproveTimesheets, timesheetLine } from '../../ApproveTimesheets';
import { ApproveLeaves, leaveTypeLabel } from '../../ApproveLeaves';
import { TeamPage, formatDay } from '../shared';
import type { TeamAttendance } from './useTeamAttendance';

export type AttendanceSegment = 'today' | 'approvals' | 'leave';

export function TeamAttendanceView({
  team,
  segment,
  onSegment,
  isClusterHead,
  top,
}: {
  team: TeamAttendance;
  segment: AttendanceSegment;
  onSegment: (s: AttendanceSegment) => void;
  isClusterHead: boolean;
  /** Extra rows above the segments (e.g. My attendance and leave for manager logins). */
  top?: React.ReactNode;
}) {
  const { t } = useT();
  const pending = team.pendingTimesheets.length + team.pendingLeaves.length + team.escalated.filter((l) => !team.pendingLeaves.some((p) => p.id === l.id)).length;

  return (
    <TeamPage data-ai-private>
      {top}
      <SegmentedControl
        aria-label={t('shell.attendance')}
        value={segment}
        onValueChange={onSegment}
        options={[
          { value: 'today', label: t('team.att.today') },
          { value: 'approvals', label: pending ? `${t('team.att.approvals')} (${pending})` : t('team.att.approvals') },
          { value: 'leave', label: t('team.att.leave') },
        ]}
      />
      {team.error ? (
        <ErrorState body={team.error} onRetry={team.reload} />
      ) : team.loading || team.loadingPeople ? (
        <SkeletonListRows count={5} leading="avatar" />
      ) : team.people.length === 0 && !(isClusterHead && team.escalated.length) ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Users} title={isClusterHead ? t('team.att.noManagers') : t('team.att.noTeam')} body={t('team.att.noTeamBody')} />
        </div>
      ) : segment === 'today' ? (
        <TodayView team={team} />
      ) : segment === 'approvals' ? (
        pending === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState icon={UserCheck} title={t('empty.allCaughtUp')} body={t('team.att.nothingPendingBody')} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <ApproveTimesheets team={team} />
            <ApproveLeaves team={team} />
          </div>
        )
      ) : (
        <LeaveView team={team} />
      )}
    </TeamPage>
  );
}

function TodayView({ team }: { team: TeamAttendance }) {
  const { t, lang } = useT();
  const today = getTodayIST();
  const logged: React.ReactNode[] = [];
  const onLeave: React.ReactNode[] = [];
  const notYet: React.ReactNode[] = [];
  for (const p of team.people) {
    const data = team.byPerson[p.employeeId];
    const sheet = data?.timesheets.find((x) => x.date === today);
    const leave = data?.leaves.find((l) => l.leaveDate === today && l.status !== 'rejected');
    if (leave) {
      onLeave.push(
        <ListRow
          key={p.employeeId}
          leading={<InitialsAvatar name={p.name} status="warning" />}
          title={p.name}
          subtitle={[leaveTypeLabel(leave, t), leave.reason].filter(Boolean).join(' · ')}
          trailing={<StatusChip status={leave.status === 'approved' ? 'approval.approved' : 'approval.pending'} />}
        />,
      );
    } else if (sheet && (sheet.startTime || sheet.endTime)) {
      logged.push(
        <ListRow
          key={p.employeeId}
          leading={<InitialsAvatar name={p.name} status="success" />}
          title={p.name}
          subtitle={timesheetLine(sheet, lang, (h) => t('team.att.hours', { h }))}
          trailing={<StatusChip status={sheet.status === 'approved' ? 'approval.approved' : sheet.status === 'rejected' ? 'approval.rejected' : 'approval.pending'} />}
        />,
      );
    } else {
      notYet.push(<ListRow key={p.employeeId} leading={<InitialsAvatar name={p.name} status="neutral" />} title={p.name} subtitle={data?.error ? t('team.att.couldNotLoad') : t('team.att.notLogged')} />);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <p className="text-label text-text-3">{formatDay(today, lang, { weekday: true })} · {t('team.att.todayHint')}</p>
      {logged.length > 0 && <ListGroup title={t('team.att.loggedToday', { n: logged.length })}>{logged}</ListGroup>}
      {onLeave.length > 0 && <ListGroup title={t('team.att.onLeaveToday', { n: onLeave.length })}>{onLeave}</ListGroup>}
      {notYet.length > 0 && <ListGroup title={t('team.att.notLoggedN', { n: notYet.length })}>{notYet}</ListGroup>}
    </div>
  );
}

function LeaveView({ team }: { team: TeamAttendance }) {
  const { t, lang } = useT();
  const [showPast, setShowPast] = React.useState(false);
  const today = getTodayIST();
  const upcoming = team.allLeaves.filter((l) => l.leaveDate >= today && l.status !== 'rejected').sort((a, b) => a.leaveDate.localeCompare(b.leaveDate));
  const past = team.allLeaves
    .filter((l) => l.status === 'approved' || l.status === 'rejected')
    .sort((a, b) => b.leaveDate.localeCompare(a.leaveDate))
    .slice(0, 30);

  const byDate = new Map<string, typeof upcoming>();
  for (const l of upcoming) byDate.set(l.leaveDate, [...(byDate.get(l.leaveDate) || []), l]);

  return (
    <div className="flex flex-col gap-5">
      {upcoming.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={CalendarDays} title={t('team.att.noUpcoming')} body={t('team.att.noUpcomingBody')} />
        </div>
      ) : (
        [...byDate.entries()].map(([date, list]) => (
          <ListGroup key={date} title={formatDay(date, lang, { weekday: true })} meta={date === today ? t('date.today') : undefined}>
            {list.map((l) => (
              <ListRow
                key={l.id}
                leading={<InitialsAvatar name={team.nameOf(l.employeeId)} />}
                title={team.nameOf(l.employeeId)}
                subtitle={[leaveTypeLabel(l, t), l.reason].filter(Boolean).join(' · ')}
                trailing={<StatusChip status={l.status === 'approved' ? 'approval.approved' : 'approval.pending'} />}
              />
            ))}
          </ListGroup>
        ))
      )}
      {past.length > 0 && (
        <ListGroup>
          <ListRow
            icon={Clock}
            title={t('team.att.pastDecisions')}
            subtitle={t('team.att.pastDecisionsHint', { n: past.length })}
            chevron={false}
            trailing={showPast ? <ChevronUp className="size-5 text-text-3" aria-hidden="true" /> : <ChevronDown className="size-5 text-text-3" aria-hidden="true" />}
            aria-expanded={showPast}
            onClick={() => setShowPast((v) => !v)}
          />
          {showPast &&
            past.map((l) => (
              <ListRow
                key={l.id}
                density="compact"
                title={`${team.nameOf(l.employeeId)} · ${formatDay(l.leaveDate, lang, { short: true })}`}
                subtitle={[
                  leaveTypeLabel(l, t),
                  l.status === 'approved' && l.approvedBy ? t('team.att.by', { name: l.approvedBy }) : '',
                  l.status === 'rejected' && l.rejectedBy ? t('team.att.by', { name: l.rejectedBy }) : '',
                  l.status === 'rejected' && l.rejectionReason ? l.rejectionReason : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<StatusChip status={l.status === 'approved' ? 'approval.approved' : 'approval.rejected'} />}
              />
            ))}
        </ListGroup>
      )}
    </div>
  );
}
