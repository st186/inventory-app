// Team tab (People · Attendance · Pay · KPIs · Checks) and the person's own pages (My pay,
// Attendance and leave, My KPIs, Workplace photos, the crew's Pay tab).
//   Manager logins: People is EmployeeManagement; Attendance and Pay are the screens it used to
//   hold as sub-tabs, with the props it passed them.
//   Incharges on employee logins: Attendance opens on approvals (they approve their own staff,
//   owner 27 Oct 2026), Pay is PayrollManagement as an incharge.
//   Crew and riders: Pay is EmployeeDashboard (My payouts).
// WP5 owns the screens inside (WP6 the hierarchy screen).
import type { ScreenSpec } from '../navConfig';
import { useShell } from '../ShellContext';
import { getTodayIST } from '../../../utils/timezone';
import {
  AttendancePortal,
  EmployeeDashboard,
  EmployeeManagement,
  HierarchyManagement,
  MyKpis,
  PayrollManagement,
  TeamKpis,
  WorkplaceChecks,
} from './screens';

export function TeamDestination({ spec, params }: { spec: ScreenSpec; params: Record<string, string> }) {
  const { user, stores, selectedStoreId } = useShell();
  const attendanceUser = { employeeId: user.employeeId || null, name: user.name, email: user.email, role: user.role };
  switch (spec.screen) {
    case 'EmployeeManagement':
      return (
        <EmployeeManagement
          user={{ role: user.role, email: user.email, employeeId: user.employeeId || undefined, name: user.name, storeId: user.storeId || undefined, accessToken: user.accessToken }}
          selectedStoreId={selectedStoreId}
          initialAttendanceTab={null}
        />
      );
    case 'AttendancePortal':
      if (spec.mode === 'manager') {
        return <AttendancePortal user={attendanceUser} selectedStoreId={selectedStoreId} initialTab={params.tab || null} stores={stores} />;
      }
      return (
        <AttendancePortal
          user={attendanceUser}
          isIncharge={spec.isIncharge}
          inchargeDesignation={user.designation}
          initialTab={params.tab || (spec.tab === 'approvals' ? 'approve-timesheet' : null)}
          stores={stores}
        />
      );
    case 'PayrollManagement':
      if (spec.mode === 'manager') {
        return (
          <PayrollManagement
            userRole={user.role as 'manager' | 'cluster_head'}
            selectedDate={getTodayIST()}
            userEmployeeId={user.employeeId}
            userName={user.name}
            selectedStoreId={selectedStoreId}
          />
        );
      }
      return (
        <PayrollManagement
          userRole={'manager' as 'manager' | 'cluster_head'}
          selectedDate={getTodayIST()}
          userEmployeeId={user.employeeId}
          userName={user.name}
          selectedStoreId={user.storeId}
          isIncharge={true}
          inchargeDesignation={user.designation}
        />
      );
    case 'EmployeeDashboard':
      return <EmployeeDashboard employeeId={user.employeeId || ''} />;
    case 'HierarchyManagement':
      return (
        <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8">
          <HierarchyManagement userRole={user.role as 'cluster_head' | 'manager' | 'employee'} selectedStoreId={selectedStoreId} accessToken={user.accessToken} />
        </div>
      );
    case 'TeamKpis':
      return <TeamKpis />;
    case 'MyKpis':
      return <MyKpis />;
    case 'WorkplaceChecks':
      return <WorkplaceChecks initialTab={params.tab || spec.tab || null} initialLocation={params.highlight || null} />;
    default:
      return null;
  }
}
