// Attendance: Team → Attendance for whoever approves (the owner approves managers; managers and
// incharges on either login type approve their own staff - owner decision 27 Oct 2026), and Me →
// Attendance and leave for everyone's own timesheet and leave.
//
//   cluster_head            → Today · Approvals · Leave for their managers
//   manager                 → the same for their staff, plus "My attendance and leave"
//   employee + incharge     → Team → Attendance opens on Approvals (initialTab approve-*);
//                             Me → Attendance and leave is their own
//   employee                → their own attendance and leave
//
// The org-structure tabs (Hierarchy, My team, Manager overview, Assign managers) moved to
// More → Setup → Org structure.
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import type { Store } from '../utils/api';
import { useT } from '../utils/i18n';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { ListGroup, ListRow } from './ui/list-row';
import { useSubPage } from './team/shared';
import { useTeamAttendance } from './team/attendance/useTeamAttendance';
import { TeamAttendanceView, type AttendanceSegment } from './team/attendance/TeamAttendanceView';
import { MyAttendanceView } from './team/attendance/MyAttendanceView';

interface AttendancePortalProps {
  user: {
    employeeId: string | null;
    name: string;
    email: string;
    role: string;
    joiningDate?: string;
  };
  selectedStoreId?: string | null;
  isIncharge?: boolean;
  inchargeDesignation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null;
  initialTab?: string | null;
  // So the approval lists can match "this store's own production incharge" (whose storeId holds
  // their production house's id - entityAccess.ts).
  stores?: Store[];
}

export function AttendancePortal({ user, selectedStoreId, isIncharge = false, initialTab = null, stores = [] }: AttendancePortalProps) {
  const isEmployee = user.role === 'employee';
  const isManager = user.role === 'manager';
  const isClusterHead = user.role === 'cluster_head';
  const approver = isClusterHead || isManager || (isEmployee && isIncharge && !!initialTab && initialTab.startsWith('approve'));
  const me = { employeeId: user.employeeId || '', name: user.name, email: user.email, joiningDate: user.joiningDate };

  if (!approver) {
    return <MyAttendanceView user={me} top={!user.employeeId ? <NoEmployeeId user={user} /> : undefined} />;
  }
  return <ApproverAttendance user={user} isIncharge={isIncharge} selectedStoreId={selectedStoreId} stores={stores} initialTab={initialTab} />;
}

function ApproverAttendance({
  user,
  isIncharge,
  selectedStoreId,
  stores,
  initialTab,
}: {
  user: AttendancePortalProps['user'];
  isIncharge: boolean;
  selectedStoreId?: string | null;
  stores: Store[];
  initialTab: string | null;
}) {
  const { t } = useT();
  const isManager = user.role === 'manager';
  const isClusterHead = user.role === 'cluster_head';
  const [segment, setSegment] = useState<AttendanceSegment>('approvals');
  const [sub, openSub, closeSub] = useSubPage('mine');
  // A manager's own timesheet / leave notification opens their own page.
  const [mineFromLink, setMineFromLink] = useState(isManager && (initialTab === 'timesheet' || initialTab === 'leave'));
  useEffect(() => {
    if (initialTab?.startsWith('approve')) setSegment('approvals');
    if (isManager && (initialTab === 'timesheet' || initialTab === 'leave')) setMineFromLink(true);
  }, [initialTab, isManager]);

  const team = useTeamAttendance({ managerId: user.employeeId || '', managerName: user.name, role: user.role, isIncharge, selectedStoreId, stores });
  const canLogOwn = isManager && !!user.employeeId;

  if (canLogOwn && (sub === 'yes' || mineFromLink)) {
    return (
      <MyAttendanceView
        user={{ employeeId: user.employeeId || '', name: user.name, email: user.email, joiningDate: user.joiningDate }}
        top={
          <div className="-mx-2 -mt-2">
            <Button
              variant="ghost"
              leadingIcon={<ArrowLeft />}
              className="px-2"
              onClick={() => {
                if (mineFromLink) setMineFromLink(false);
                else closeSub();
              }}
            >
              {t('shell.attendance')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <TeamAttendanceView
      team={team}
      segment={segment}
      onSegment={setSegment}
      isClusterHead={isClusterHead}
      top={
        <>
          {!user.employeeId && <NoEmployeeId user={user} />}
          {canLogOwn && (
            <ListGroup>
              <ListRow icon={CalendarClock} title={t('team.att.mine')} subtitle={t('team.att.mineHint')} onClick={() => openSub('yes')} />
            </ListGroup>
          )}
        </>
      }
    />
  );
}

function NoEmployeeId({ user }: { user: AttendancePortalProps['user'] }) {
  const { t } = useT();
  return (
    <Callout tone="warning" title={t('team.att.noEmployeeId')}>
      {t('team.att.noEmployeeIdBody')} ({user.email} · {user.role})
    </Callout>
  );
}

