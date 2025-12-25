import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, User, Calendar, AlertCircle } from 'lucide-react';
import * as api from '../utils/api';
import { RouteDebugger } from './RouteDebugger';

interface ApproveTimesheetsProps {
  managerId: string;
}

export function ApproveTimesheets({ managerId }: ApproveTimesheetsProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  console.log('ApproveTimesheets: managerId prop =', managerId);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployee) {
      loadTimesheets();
    }
  }, [selectedEmployee]);

  const loadEmployees = async () => {
    try {
      console.log('ApproveTimesheets: Calling getEmployeesByManager with managerId:', managerId);
      const data = await api.getEmployeesByManager(managerId);
      console.log('ApproveTimesheets: Received employees:', data);
      setEmployees(data);
      if (data.length > 0) {
        setSelectedEmployee(data[0].employeeId);
      } else {
        console.log('ApproveTimesheets: No employees found for this manager');
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      const data = await api.getTimesheets(selectedEmployee);
      setTimesheets(data.filter((t: any) => t.status === 'pending'));
    } catch (error) {
      console.error('Error loading timesheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (timesheetId: string) => {
    try {
      setLoading(true);
      await api.approveTimesheet(timesheetId, managerId);
      await loadTimesheets();
      alert('Timesheet approved successfully');
    } catch (error) {
      console.error('Error approving timesheet:', error);
      alert('Error approving timesheet');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (timesheetId: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      setLoading(true);
      await api.rejectTimesheet(timesheetId, managerId, reason);
      await loadTimesheets();
      alert('Timesheet rejected');
    } catch (error) {
      console.error('Error rejecting timesheet:', error);
      alert('Error rejecting timesheet');
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = timesheets.length;
  const selectedEmployeeData = employees.find(e => e.employeeId === selectedEmployee);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">Approve Timesheets</h1>
          <p className="text-gray-600">Review and approve employee timesheet entries</p>
        </div>

        {/* Error/Warning if no managerId */}
        {!managerId && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-red-900 font-medium">Manager ID Not Found</p>
                <p className="text-sm text-red-700">
                  Your account doesn't have an employee ID set. Please contact the administrator or log out and log back in.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No employees message */}
        {managerId && employees.length === 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-blue-900 font-medium">No Employees Found</p>
                <p className="text-sm text-blue-700">
                  You don't have any employees assigned to you yet. Employees created through Employee Management will appear here.
                </p>
                <p className="text-xs text-blue-600 mt-1">Manager ID: {managerId}</p>
              </div>
            </div>
          </div>
        )}

        {/* Route Debugger - Only show when there are no employees */}
        {managerId && employees.length === 0 && (
          <RouteDebugger managerId={managerId} />
        )}

        {/* Pending Count Badge */}
        {pendingCount > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-yellow-900 font-medium">
                  {pendingCount} timesheet{pendingCount > 1 ? 's' : ''} pending approval
                </p>
                <p className="text-sm text-yellow-700">Review and take action on pending requests</p>
              </div>
            </div>
          </div>
        )}

        {/* Employee Selector */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <label className="block text-sm text-gray-700 mb-2">Select Employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full md:w-1/3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">-- Select Employee --</option>
            {employees.map(emp => (
              <option key={emp.employeeId} value={emp.employeeId}>
                {emp.name} ({emp.employeeId})
              </option>
            ))}
          </select>
        </div>

        {/* Employee Info Card */}
        {selectedEmployeeData && (
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl shadow-lg p-6 mb-6 text-white">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <User className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl mb-1">{selectedEmployeeData.name}</h2>
                <p className="text-sm opacity-90">Employee ID: {selectedEmployeeData.employeeId}</p>
                <p className="text-sm opacity-90">Email: {selectedEmployeeData.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Timesheets Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b border-gray-200">
            <h3 className="text-lg text-gray-900">Pending Timesheets</h3>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading...</div>
          ) : timesheets.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No pending timesheets for this employee</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Date</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Day</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Start Time</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">End Time</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Total Hours</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {timesheets.map((timesheet, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {new Date(timesheet.date).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {new Date(timesheet.date).toLocaleDateString('en-US', { weekday: 'short' })}
                      </td>
                      <td className="px-6 py-4 text-gray-900">{timesheet.startTime}</td>
                      <td className="px-6 py-4 text-gray-900">{timesheet.endTime}</td>
                      <td className="px-6 py-4">
                        <span className={`${timesheet.totalHours >= 8 ? 'text-green-700' : timesheet.totalHours >= 4 ? 'text-yellow-700' : 'text-red-700'}`}>
                          {timesheet.totalHours.toFixed(2)} hrs
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                          <Clock className="w-4 h-4" />
                          Pending
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(timesheet.id)}
                            disabled={loading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(timesheet.id)}
                            disabled={loading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}