import { useState } from 'react';
import { Clock, Calendar, CheckSquare, Users, UserCheck, Network } from 'lucide-react';
import { EmployeeTimesheet } from './EmployeeTimesheet';
import { EmployeeLeave } from './EmployeeLeave';
import { ApproveTimesheets } from './ApproveTimesheets';
import { ApproveLeaves } from './ApproveLeaves';
import { EmployeeHierarchy } from './EmployeeHierarchy';
import { AssignManagers } from './AssignManagers';
import { EmployeeHierarchyView } from './EmployeeHierarchyView';

interface AttendancePortalProps {
  user: {
    employeeId: string | null;
    name: string;
    email: string;
    role: string;
    joiningDate?: string;
  };
}

export function AttendancePortal({ user }: AttendancePortalProps) {
  const [activeTab, setActiveTab] = useState<string>(() => {
    // Set default tab based on role
    if (user.role === 'employee') return 'timesheet';
    if (user.role === 'manager') return 'timesheet';
    if (user.role === 'cluster_head') return 'approve-timesheet';
    return 'timesheet';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const isEmployee = user.role === 'employee';
  const isManager = user.role === 'manager';
  const isClusterHead = user.role === 'cluster_head';

  console.log('AttendancePortal: user =', user);

  const handleEmployeeCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
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
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center overflow-x-auto py-4 gap-2 scrollbar-hide">
            {/* Employee Tabs */}
            {isEmployee && (
              <>
                <button
                  onClick={() => setActiveTab('timesheet')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'timesheet'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Update Timesheet
                </button>
                <button
                  onClick={() => setActiveTab('leave')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'leave'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  Apply for Leave
                </button>
                <button
                  onClick={() => setActiveTab('hierarchy')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'hierarchy'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Network className="w-4 h-4" />
                  My Manager
                </button>
              </>
            )}

            {/* Manager Tabs */}
            {isManager && (
              <>
                <button
                  onClick={() => setActiveTab('timesheet')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'timesheet'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  My Timesheet
                </button>
                <button
                  onClick={() => setActiveTab('leave')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'leave'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  My Leave
                </button>
                <button
                  onClick={() => setActiveTab('approve-timesheet')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'approve-timesheet'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  Approve Timesheets
                </button>
                <button
                  onClick={() => setActiveTab('approve-leave')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'approve-leave'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  Approve Leaves
                </button>
                <button
                  onClick={() => setActiveTab('team')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'team'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  My Team
                </button>
              </>
            )}

            {/* Cluster Head Tabs */}
            {isClusterHead && (
              <>
                <button
                  onClick={() => setActiveTab('approve-timesheet')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'approve-timesheet'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  Approve Manager Timesheets
                </button>
                <button
                  onClick={() => setActiveTab('approve-leave')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'approve-leave'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                  Approve Manager Leaves
                </button>
                <button
                  onClick={() => setActiveTab('managers')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'managers'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Manager Overview
                </button>
                <button
                  onClick={() => setActiveTab('assign-managers')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === 'assign-managers'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  Assign Managers
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

        {activeTab === 'approve-timesheet' && (isManager || isClusterHead) && (
          <ApproveTimesheets managerId={user.employeeId || ''} role={user.role} />
        )}

        {activeTab === 'approve-leave' && (isManager || isClusterHead) && (
          <ApproveLeaves managerId={user.employeeId || ''} managerName={user.name} role={user.role} />
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