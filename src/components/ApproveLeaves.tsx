// Leave requests waiting for approval (Team → Attendance → Approvals): one row per day; tapping
// opens a sheet with the dates, reason and the person's balance, then Approve / Reject. The owner
// also gets advance leave over 4 days, escalated past the person's own manager.
import * as React from 'react';
import { CalendarCheck, CalendarDays } from 'lucide-react';
import { Button } from './ui/button';
import { InitialsAvatar } from './ui/avatar';
import { ListGroup, ListRow } from './ui/list-row';
import { ResponsiveModal } from './ui/responsive-modal';
import { Skeleton } from './ui/skeleton';
import { StatusChip } from './ui/status-chip';
import { promptText } from './ui/confirm';
import { toast } from './ui/sonner';
import { useT } from '../utils/i18n';
import { teamApi } from './team/teamApi';
import { DetailList, formatDay } from './team/shared';
import type { LeaveRow, TeamAttendance } from './team/attendance/useTeamAttendance';

export function leaveTypeLabel(row: Pick<LeaveRow, 'leaveType' | 'isAdvanceLeave' | 'advanceDaysRequested'>, t: (k: 'team.att.fullDay' | 'team.att.halfDay' | 'team.att.advance' | 'team.att.advanceDays', v?: Record<string, string | number>) => string) {
  const parts = [(row.leaveType || 'full') === 'full' ? t('team.att.fullDay') : t('team.att.halfDay')];
  if (row.isAdvanceLeave) parts.push(row.advanceDaysRequested ? t('team.att.advanceDays', { n: row.advanceDaysRequested }) : t('team.att.advance'));
  return parts.join(' · ');
}

export function ApproveLeaves({ team }: { team: TeamAttendance }) {
  const { t, lang } = useT();
  const [open, setOpen] = React.useState<LeaveRow | null>(null);
  const rows = [...team.pendingLeaves].sort((a, b) => a.leaveDate.localeCompare(b.leaveDate));
  const ownIds = new Set(rows.map((r) => r.id));
  const escalated = team.escalated.filter((l) => !ownIds.has(l.id));

  const row = (l: LeaveRow) => (
    <ListRow
      key={l.id}
      leading={<InitialsAvatar name={team.nameOf(l.employeeId)} />}
      title={team.nameOf(l.employeeId)}
      subtitle={[formatDay(l.leaveDate, lang, { weekday: true, short: true }), leaveTypeLabel(l, t), l.reason].filter(Boolean).join(' · ')}
      onClick={() => setOpen(l)}
    />
  );

  return (
    <>
      <ListGroup title={t('team.att.leaveRequests')} meta={rows.length ? String(rows.length) : undefined} empty={<ListRow density="compact" icon={CalendarDays} muted title={t('team.att.noLeave')} />}>
        {rows.map(row)}
      </ListGroup>
      {escalated.length > 0 && (
        <ListGroup title={t('team.att.escalated')} meta={String(escalated.length)} footer={t('team.att.escalatedHint')}>
          {escalated.map(row)}
        </ListGroup>
      )}
      <LeaveDecisionSheet leave={open} team={team} onClose={() => setOpen(null)} />
    </>
  );
}

function LeaveDecisionSheet({ leave, team, onClose }: { leave: LeaveRow | null; team: TeamAttendance; onClose: () => void }) {
  const { t, lang } = useT();
  const [balance, setBalance] = React.useState<{ balance: number; pendingDays: number } | null | 'error'>(null);
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null);

  React.useEffect(() => {
    if (!leave) return;
    let cancelled = false;
    setBalance(null);
    teamApi
      .getLeaveBalance(leave.employeeId)
      .then((b: { balance: number; pendingDays: number }) => !cancelled && setBalance(b))
      .catch(() => !cancelled && setBalance('error'));
    return () => {
      cancelled = true;
    };
  }, [leave]);

  if (!leave) return null;
  const name = team.nameOf(leave.employeeId);

  const approve = async () => {
    setBusy('approve');
    try {
      await team.approveLeave(leave);
      toast.success(t('team.att.leaveApproved', { name }));
      onClose();
    } catch (error) {
      console.error('Error approving leave:', error);
      toast.error(t('team.att.approveFailed'));
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    const reason = await promptText({ title: t('team.att.rejectLeave'), body: `${name} · ${formatDay(leave.leaveDate, lang, { weekday: true })}`, label: t('team.att.rejectReason'), required: true, confirmLabel: t('team.att.reject'), tone: 'danger' });
    if (!reason) return;
    setBusy('reject');
    try {
      await team.rejectLeave(leave, reason);
      toast.success(t('team.att.rejectedOne'));
      onClose();
    } catch (error) {
      console.error('Error rejecting leave:', error);
      toast.error(t('team.att.rejectFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ResponsiveModal
      open={!!leave}
      onOpenChange={(o) => !o && onClose()}
      title={t('team.att.leaveRequest')}
      description={name}
      footer={
        <>
          <Button variant="secondary" size="lg" loading={busy === 'reject'} disabled={!!busy} onClick={reject}>
            {t('team.att.reject')}
          </Button>
          <Button size="lg" className="flex-1" loading={busy === 'approve'} disabled={!!busy} onClick={approve}>
            {t('team.att.approve')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-ai-private>
        <div className="flex items-center gap-3">
          <InitialsAvatar name={name} size={56} />
          <div className="flex min-w-0 flex-col">
            <span className="text-subtitle font-semibold text-text">{formatDay(leave.leaveDate, lang, { weekday: true })}</span>
            <span className="text-body-sm text-text-2">{leaveTypeLabel(leave, t)}</span>
          </div>
        </div>
        <DetailList
          rows={[
            { label: t('team.att.reason'), value: leave.reason || '–' },
            { label: t('team.att.asked'), value: leave.appliedAt ? formatDay(leave.appliedAt.slice(0, 10), lang) : '–' },
            {
              label: t('team.att.goesTo'),
              value: leave.approverRole === 'cluster_head' ? t('team.att.toOwner') : t('team.att.toManager'),
              hidden: !leave.isAdvanceLeave || !leave.approverRole,
            },
            {
              label: t('team.att.balance'),
              value:
                balance === null ? (
                  <Skeleton className="ml-auto h-4 w-16" />
                ) : balance === 'error' ? (
                  '–'
                ) : (
                  <span className="num">{t('team.att.balanceValue', { n: balance.balance, pending: balance.pendingDays })}</span>
                ),
            },
          ]}
        />
        {leave.isAdvanceLeave && <StatusChip tone="warning" icon={CalendarCheck}>{t('team.att.advanceNote')}</StatusChip>}
      </div>
    </ResponsiveModal>
  );
}
