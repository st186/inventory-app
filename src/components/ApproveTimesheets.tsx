// Timesheets waiting for approval (Team → Attendance → Approvals): one row per day with inline
// Approve / Reject (44 px), plus "Approve all". The owner approves managers; managers and
// incharges approve their own staff.
import * as React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';
import { InitialsAvatar } from './ui/avatar';
import { ListGroup, ListRow } from './ui/list-row';
import { confirm, promptText } from './ui/confirm';
import { toast } from './ui/sonner';
import { useT } from '../utils/i18n';
import { formatDay } from './team/shared';
import type { TeamAttendance, TimesheetRow } from './team/attendance/useTeamAttendance';

export function timesheetLine(row: Pick<TimesheetRow, 'date' | 'startTime' | 'endTime' | 'totalHours'>, lang: Parameters<typeof formatDay>[1], hoursLabel: (h: string) => string) {
  const parts = [formatDay(row.date, lang, { weekday: true, short: true })];
  if (row.startTime || row.endTime) parts.push(`${row.startTime || '–'}–${row.endTime || '–'}`);
  if (typeof row.totalHours === 'number' && row.totalHours > 0) parts.push(hoursLabel(row.totalHours.toFixed(1).replace(/\.0$/, '')));
  return parts.join(' · ');
}

export function ApproveTimesheets({ team }: { team: TeamAttendance }) {
  const { t, lang } = useT();
  const [busy, setBusy] = React.useState<string | null>(null);
  const rows = [...team.pendingTimesheets].sort((a, b) => b.date.localeCompare(a.date) || team.nameOf(a.employeeId).localeCompare(team.nameOf(b.employeeId)));

  const approve = async (row: TimesheetRow) => {
    setBusy(row.id);
    try {
      await team.approveTimesheet(row);
      toast.success(t('team.att.approvedOne', { name: team.nameOf(row.employeeId) }));
    } catch (error) {
      console.error('Error approving timesheet:', error);
      toast.error(t('team.att.approveFailed'));
    } finally {
      setBusy(null);
    }
  };

  const reject = async (row: TimesheetRow) => {
    const reason = await promptText({
      title: t('team.att.rejectTimesheet'),
      body: `${team.nameOf(row.employeeId)} · ${timesheetLine(row, lang, (h) => t('team.att.hours', { h }))}`,
      label: t('team.att.rejectReason'),
      required: true,
      confirmLabel: t('team.att.reject'),
      tone: 'danger',
    });
    if (!reason) return;
    setBusy(row.id);
    try {
      await team.rejectTimesheet(row, reason);
      toast.success(t('team.att.rejectedOne'));
    } catch (error) {
      console.error('Error rejecting timesheet:', error);
      toast.error(t('team.att.rejectFailed'));
    } finally {
      setBusy(null);
    }
  };

  const approveAll = async () => {
    const ok = await confirm({ title: t('team.att.approveAllTitle', { n: rows.length }), body: t('team.att.approveAllBody'), confirmLabel: t('team.att.approveAll') });
    if (!ok) return;
    setBusy('all');
    let done = 0;
    for (const row of rows) {
      try {
        await team.approveTimesheet(row);
        done += 1;
      } catch (error) {
        console.error('Error approving timesheet:', error);
      }
    }
    setBusy(null);
    if (done === rows.length) toast.success(t('team.att.approvedAll', { n: done }));
    else toast.error(t('team.att.approvedSome', { n: done, total: rows.length }));
  };

  return (
    <ListGroup
      title={t('team.att.timesheets')}
      meta={rows.length ? String(rows.length) : undefined}
      action={rows.length > 1 ? <Button variant="secondary" size="sm" leadingIcon={<Check />} loading={busy === 'all'} disabled={!!busy && busy !== 'all'} onClick={approveAll}>{t('team.att.approveAll')}</Button> : undefined}
      empty={<ListRow density="compact" icon={Clock} muted title={t('team.att.noTimesheets')} />}
    >
      {rows.map((row) => (
        <ListRow
          key={row.id}
          leading={<InitialsAvatar name={team.nameOf(row.employeeId)} />}
          title={team.nameOf(row.employeeId)}
          subtitle={timesheetLine(row, lang, (h) => t('team.att.hours', { h }))}
          trailing={
            <span className="flex gap-1">
              <IconButton label={t('team.att.rejectFor', { name: team.nameOf(row.employeeId) })} icon={<X />} variant="danger-ghost" disabled={!!busy} onClick={() => reject(row)} />
              <IconButton label={t('team.att.approveFor', { name: team.nameOf(row.employeeId) })} icon={<Check />} variant="secondary" loading={busy === row.id} disabled={!!busy && busy !== row.id} onClick={() => approve(row)} />
            </span>
          }
        />
      ))}
    </ListGroup>
  );
}
