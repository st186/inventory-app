// Me → Attendance and leave: this month in three tiles, the week's timesheet, leave applications
// and a sticky "Apply for leave". (The shift card lives on Home.)
import * as React from 'react';
import { ErrorState } from '../../ui/error-state';
import { SkeletonListRows, SkeletonStatTiles } from '../../ui/skeleton';
import { StatTile } from '../../ui/stat-tile';
import { useT } from '../../../utils/i18n';
import { getTodayIST } from '../../../utils/timezone';
import { EmployeeTimesheet } from '../../EmployeeTimesheet';
import { EmployeeLeave } from '../../EmployeeLeave';
import { TeamPage } from '../shared';
import { useMyAttendance } from './useMyAttendance';

export function MyAttendanceView({ user, top }: { user: { employeeId: string; name: string; email: string; joiningDate?: string }; top?: React.ReactNode }) {
  const { t } = useT();
  const att = useMyAttendance(user.employeeId);
  const month = getTodayIST().slice(0, 7);

  // This month: days with both times logged (not rejected), half-day leave, and the balance.
  const present = att.timesheetData.filter((x) => x.date.startsWith(month) && x.startTime && x.endTime && x.status !== 'rejected' && !x.isLeave).length;
  const halfDays = att.leaves.filter((l) => l.leaveDate.startsWith(month) && l.leaveType === 'half' && l.status !== 'rejected').length;
  const waiting = att.timesheetData.filter((x) => x.id && x.status === 'pending').length;

  return (
    <TeamPage data-ai-private>
      {top}
      {att.error ? (
        <ErrorState body={att.error} onRetry={att.reload} retrying={att.loading} />
      ) : att.loading ? (
        <>
          <SkeletonStatTiles count={3} className="sm:grid-cols-3" />
          <SkeletonListRows count={7} leading="none" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label={t('team.my.present')} value={<span className="num">{present}</span>} caption={waiting ? t('team.my.waitingN', { n: waiting }) : t('team.my.thisMonthShort')} />
            <StatTile label={t('team.my.halfDays')} value={<span className="num">{halfDays}</span>} caption={t('team.my.thisMonthShort')} />
            <StatTile
              label={t('team.my.leavesLeft')}
              value={<span className="num">{att.leaveBalance ?? '–'}</span>}
              tone={(att.leaveBalance ?? 0) < 0 ? 'danger' : 'default'}
              caption={
                att.projectedBalance !== null && att.projectedBalance !== att.leaveBalance
                  ? t('team.my.afterPending', { n: att.projectedBalance })
                  : (att.leaveBalance ?? 0) < 0
                    ? t('team.my.negativeBalance')
                    : t('team.my.approvedTakenOff')
              }
              className="col-span-2 sm:col-span-1"
            />
          </div>
          <EmployeeTimesheet user={user} att={att} />
          <EmployeeLeave user={user} att={att} />
        </>
      )}
    </TeamPage>
  );
}
