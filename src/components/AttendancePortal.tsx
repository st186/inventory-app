import { useState, useEffect } from 'react';
import { Clock, Calendar, CheckSquare, Users, UserCheck, Network } from 'lucide-react';
import { EmployeeTimesheet } from './EmployeeTimesheet';
import { EmployeeLeave } from './EmployeeLeave';
import { ApproveTimesheets } from './ApproveTimesheets';
import { ApproveLeaves } from './ApproveLeaves';
import { EmployeeHierarchy } from './EmployeeHierarchy';
import { AssignManagers } from './AssignManagers';
import { EmployeeHierarchyView } from './EmployeeHierarchyView';
import type { Store } from '../utils/api';

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
  // Needed so ApproveTimesheets/ApproveLeaves can resolve "this store's own production
  // incharge" (whose employee record's storeId actually holds their production house's
  // id, not a real store id - see entityAccess.ts) instead of silently dropping them from
  // a specific store's queue.
  stores?: Store[];
}

export function AttendancePortal({ user, selectedStoreId, isIncharge = false, inchargeDesignation = null, initialTab = null, stores = [] }: AttendancePortalProps) {
  const [activeTab, setActiveTab] = useState<string>(() => {
    // A notification deep-link takes priority over the role-based default
    if (initialTab) return initialTab;
    // Set default tab based on role
    if (user.role === 'employee') return 'timesheet';
    if (user.role === 'manager') return 'timesheet';
    if (user.role === 'cluster_head') return 'approve-timesheet';
    return 'timesheet';
  });

  // If a new notification click arrives while this component is already mounted, switch tabs
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const isEmployee = user.role === 'employee';
  const isManager = user.role === 'manager';
  const isClusterHead = user.role === 'cluster_head';

  console.log('AttendancePortal: user =', user);

  const handleEmployeeCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const tabButtonClass = (tab: string) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
      activeTab === tab
        ? 'bg-primary text-primary-foreground'
        : 'bg-secondary text-foreground hover:opacity-80'
    }`;

  return (
    <div className="min-h-screen bg-background">
      {/* Debug Info Banner (only for managers/cluster heads without employeeId) */}
      {(isManager || isClusterHead) && !user.employeeId && (
        <div className="bg-red-50 border-b border-red-200 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-sm">!</div>
              <div className="flex-1">
                <h3 className="text-red-900 font-medium">Employee ID Not Found</h3>
                <p className="text-sm text-red-700 mt-1">
                  Your account doesn't have an employee ID associated with it. This means:
                </p>
                <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-1">
                  <li>You won't be able to see employees assigned to you</li>
                  <li>Approval workflows won't work properly</li>
                  <li>Employees you create won't be linked to your account</li>
                </ul>
                <p className="text-sm text-red-800 mt-2 font-medium">
                  <strong>Solution:</strong> Log out and log back in. If the problem persists, your account needs to be recreated through the Employee Management system.
                </p>
                <p className="text-xs text-red-600 mt-2">
                  Debug Info: email={user.email}, role={user.role}, employeeId={user.employeeId || 'NULL'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center flex-wrap py-4 gap-2">
            {/* Employee Tabs */}
            {isEmployee && (
              <>
                <button onClick={() => setActiveTab('timesheet')} className={tabButtonClass('timesheet')}>
                  <Clock className="w-4 h-4" />
                  Update timesheet
                </button>
                <button onClick={() => setActiveTab('leave')} className={tabButtonClass('leave')}>
                  <Calendar className="w-4 h-4" />
                  Apply for leave
                </button>
                <button onClick={() => setActiveTab('hierarchy')} className={tabButtonClass('hierarchy')}>
                  <Network className="w-4 h-4" />
                  Hierarchy
                </button>
              </>
            )}

            {/* Incharges on employee logins approve their own staff from here, not only from the
                notification (owner, 27 Oct 2026). Plain staff never see these. */}
            {isEmployee && isIncharge && (
              <>
                <button onClick={() => setActiveTab('approve-timesheet')} className={tabButtonClass('approve-timesheet')}>
                  <CheckSquare className="w-4 h-4" />
                  Approve timesheets
                </button>
                <button onClick={() => setActiveTab('approve-leave')} className={tabButtonClass('approve-leave')}>
                  <CheckSquare className="w-4 h-4" />
                  Approve leaves
                </button>
              </>
            )}

            {/* Manager Tabs */}
            {isManager && (
              <>
                <button onClick={() => setActiveTab('timesheet')} className={tabButtonClass('timesheet')}>
                  <Clock className="w-4 h-4" />
                  My timesheet
                </button>
                <button onClick={() => setActiveTab('leave')} className={tabButtonClass('leave')}>
                  <Calendar className="w-4 h-4" />
                  My leave
                </button>
                <button onClick={() => setActiveTab('approve-timesheet')} className={tabButtonClass('approve-timesheet')}>
                  <CheckSquare className="w-4 h-4" />
                  Approve timesheets
                </button>
                <button onClick={() => setActiveTab('approve-leave')} className={tabButtonClass('approve-leave')}>
                  <CheckSquare className="w-4 h-4" />
                  Approve leaves
                </button>
                <button onClick={() => setActiveTab('team')} className={tabButtonClass('team')}>
                  <Users className="w-4 h-4" />
                  My team
                </button>
              </>
            )}

            {/* Cluster Head Tabs */}
            {isClusterHead && (
              <>
                <button onClick={() => setActiveTab('approve-timesheet')} className={tabButtonClass('approve-timesheet')}>
                  <CheckSquare className="w-4 h-4" />
                  Approve manager timesheets
                </button>
                <button onClick={() => setActiveTab('approve-leave')} className={tabButtonClass('approve-leave')}>
                  <CheckSquare className="w-4 h-4" />
                  Approve manager leaves
                </button>
                <button onClick={() => setActiveTab('managers')} className={tabButtonClass('managers')}>
                  <Users className="w-4 h-4" />
                  Manager overview
                </button>
                <button onClick={() => setActiveTab('assign-managers')} className={tabButtonClass('assign-managers')}>
                  <UserCheck className="w-4 h-4" />
                  Assign managers
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'timesheet' && (
          <EmployeeTimesheet 
            user={{
              employeeId: user.employeeId || '',
              name: user.name,
              email: user.email
            }}
          />
        )}

        {activeTab === 'leave' && (
          <EmployeeLeave
            user={{
              employeeId: user.employeeId || '',
              name: user.name,
              email: user.email,
              joiningDate: user.joiningDate
            }}
          />
        )}

        {activeTab === 'approve-timesheet' && (isManager || isClusterHead || isIncharge) && (
          <ApproveTimesheets managerId={user.employeeId || ''} role={user.role} selectedStoreId={selectedStoreId} isIncharge={isIncharge} inchargeDesignation={inchargeDesignation} stores={stores} />
        )}

        {activeTab === 'approve-leave' && (isManager || isClusterHead || isIncharge) && (
          <ApproveLeaves managerId={user.employeeId || ''} managerName={user.name} role={user.role} selectedStoreId={selectedStoreId} isIncharge={isIncharge} inchargeDesignation={inchargeDesignation} stores={stores} />
        )}

        {activeTab === 'team' && isManager && (
          <EmployeeHierarchy managerId={user.employeeId || ''} role="manager" key={refreshKey} />
        )}

        {activeTab === 'hierarchy' && isEmployee && (
          <EmployeeHierarchyView 
            currentUser={{
              employeeId: user.employeeId || '',
              role: user.role,
              email: user.email,
              name: user.name
            }} 
            key={refreshKey} 
          />
        )}

        {activeTab === 'managers' && isClusterHead && (
          <EmployeeHierarchyView 
            currentUser={{
              employeeId: user.employeeId || '',
              role: user.role,
              email: user.email,
              name: user.name
            }} 
            key={refreshKey} 
          />
        )}

        {activeTab === 'assign-managers' && isClusterHead && (
          <AssignManagers clusterHeadId={user.employeeId || ''} key={refreshKey} />
        )}
      </div>
    </div>
  );
}