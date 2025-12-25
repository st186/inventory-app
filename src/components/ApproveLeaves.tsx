import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Calendar, User, AlertCircle } from 'lucide-react';
import * as api from '../utils/api';

interface ApproveLeavesProps {
  managerId: string;
  managerName: string;
  role?: string; // Add role to differentiate between manager and cluster_head
}

export function ApproveLeaves({ managerId, managerName, role }: ApproveLeavesProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  console.log('ApproveLeaves: managerId prop =', managerId);
  console.log('ApproveLeaves: role prop =', role);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployee) {
      loadLeaves();
    }
  }, [selectedEmployee]);

  const loadEmployees = async () => {
    try {
      console.log('ApproveLeaves: Loading employees/managers for role:', role);
      let data;
      
      if (role === 'cluster_head') {
        // Cluster heads manage managers
        console.log('ApproveLeaves: Calling getManagersByClusterHead with clusterHeadId:', managerId);
        data = await api.getManagersByClusterHead(managerId);
        console.log('ApproveLeaves: Received managers:', data);
      } else {
        // Managers manage employees
        console.log('ApproveLeaves: Calling getEmployeesByManager with managerId:', managerId);
        data = await api.getEmployeesByManager(managerId);
        console.log('ApproveLeaves: Received employees:', data);
      }
      
      setEmployees(data);
      if (data.length > 0) {
        setSelectedEmployee(data[0].employeeId);
      } else {
        console.log('ApproveLeaves: No employees/managers found');
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadLeaves = async () => {
    try {
      setLoading(true);
      const data = await api.getLeaves(selectedEmployee);
      setLeaves(data.filter((l: any) => l.status === 'pending'));
    } catch (error) {
      console.error('Error loading leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (leaveId: string) => {
    try {
      setLoading(true);
      await api.approveLeave(leaveId, managerId, managerName);
      await loadLeaves();
      alert('Leave approved successfully');
    } catch (error) {
      console.error('Error approving leave:', error);
      alert('Error approving leave');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (leaveId: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      setLoading(true);
      await api.rejectLeave(leaveId, managerId, managerName, reason);
      await loadLeaves();
      alert('Leave rejected');
    } catch (error) {
      console.error('Error rejecting leave:', error);
      alert('Error rejecting leave');
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = leaves.length;
  const selectedEmployeeData = employees.find(e => e.employeeId === selectedEmployee);
  
  // Dynamic text based on role
  const entityType = role === 'cluster_head' ? 'Manager' : 'Employee';
  const entityTypePlural = role === 'cluster_head' ? 'Managers' : 'Employees';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">Approve {entityType} Leaves</h1>
          <p className="text-gray-600">
            {role === 'cluster_head' 
              ? 'Review and approve manager leave applications. Contract workers do not require leave approval.'
              : 'Review and approve employee leave applications'
            }
          </p>
        </div>

        {/* Pending Count Badge */}
        {pendingCount > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-yellow-900 font-medium">
                  {pendingCount} leave application{pendingCount > 1 ? 's' : ''} pending approval
                </p>
                <p className="text-sm text-yellow-700">Review and take action on pending requests</p>
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
                <p className="text-blue-900 font-medium">No {entityTypePlural} Found</p>
                <p className="text-sm text-blue-700">
                  You don't have any {entityTypePlural.toLowerCase()} assigned to you yet. {entityTypePlural} created through Employee Management will appear here.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Employee Selector */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <label className="block text-sm text-gray-700 mb-2">Select {entityType}</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full md:w-1/3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">-- Select {entityType} --</option>
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

        {/* Leaves Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b border-gray-200">
            <h3 className="text-lg text-gray-900">Pending Leave Applications</h3>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading...</div>
          ) : leaves.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No pending leave applications for this employee</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Leave Date</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Reason</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Applied On</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {leaves.map((leave, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {new Date(leave.leaveDate).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric',
                          weekday: 'short'
                        })}
                      </td>
                      <td className="px-6 py-4 text-gray-700">{leave.reason}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {leave.appliedAt ? new Date(leave.appliedAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        }) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(leave.id)}
                            disabled={loading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(leave.id)}
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