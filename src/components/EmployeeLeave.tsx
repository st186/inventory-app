import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle, Plus } from 'lucide-react';
import * as api from '../utils/api';

interface LeaveApplication {
  id?: string;
  employeeId: string;
  leaveDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

interface EmployeeLeaveProps {
  user: {
    employeeId: string;
    name: string;
    email: string;
    joiningDate?: string;
  };
}

export function EmployeeLeave({ user }: EmployeeLeaveProps) {
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [leaveBalance, setLeaveBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [newLeave, setNewLeave] = useState({
    leaveDate: '',
    reason: ''
  });

  useEffect(() => {
    loadLeaves();
    calculateLeaveBalance();
  }, []);

  const loadLeaves = async () => {
    try {
      setLoading(true);
      const data = await api.getLeaves(user.employeeId);
      setLeaves(data);
    } catch (error) {
      console.error('Error loading leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateLeaveBalance = async () => {
    try {
      const balance = await api.getLeaveBalance(user.employeeId, user.joiningDate || '2024-01-01');
      setLeaveBalance(balance);
    } catch (error) {
      console.error('Error calculating leave balance:', error);
    }
  };

  const applyLeave = async () => {
    if (!newLeave.leaveDate || !newLeave.reason) {
      alert('Please fill all fields');
      return;
    }

    // Check if leave already applied for this date
    const existingLeave = leaves.find(l => l.leaveDate === newLeave.leaveDate);
    if (existingLeave) {
      alert('Leave already applied for this date');
      return;
    }

    // Check leave balance
    if (leaveBalance <= 0) {
      alert('Insufficient leave balance');
      return;
    }

    try {
      setLoading(true);
      const leaveData: LeaveApplication = {
        employeeId: user.employeeId,
        leaveDate: newLeave.leaveDate,
        reason: newLeave.reason,
        status: 'pending',
        appliedAt: new Date().toISOString()
      };
      
      await api.applyLeave(leaveData);
      await loadLeaves();
      await calculateLeaveBalance();
      
      setNewLeave({ leaveDate: '', reason: '' });
      setShowApplyForm(false);
      alert('Leave application submitted successfully');
    } catch (error) {
      console.error('Error applying leave:', error);
      alert('Error applying leave');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
            <CheckCircle className="w-4 h-4" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
            <XCircle className="w-4 h-4" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
            <Clock className="w-4 h-4" />
            Pending
          </span>
        );
    }
  };

  const sortedLeaves = [...leaves].sort((a, b) => 
    new Date(b.leaveDate).getTime() - new Date(a.leaveDate).getTime()
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">Leave Management</h1>
          <p className="text-gray-600">Apply for leaves and track your leave balance</p>
        </div>

        {/* Leave Balance Card */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl shadow-lg p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg mb-2 opacity-90">Available Leave Balance</h2>
              <div className="text-5xl mb-2">{leaveBalance}</div>
              <p className="text-sm opacity-90">leaves remaining (4 leaves/month, resets yearly)</p>
            </div>
            <div className="bg-white/20 rounded-full p-6">
              <Calendar className="w-16 h-16" />
            </div>
          </div>
        </div>

        {/* Apply Leave Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowApplyForm(!showApplyForm)}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Apply for Leave
          </button>
        </div>

        {/* Apply Leave Form */}
        {showApplyForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg text-gray-900 mb-4">Apply for Leave</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Leave Date</label>
                <input
                  type="date"
                  value={newLeave.leaveDate}
                  onChange={(e) => setNewLeave({ ...newLeave, leaveDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-2">Reason</label>
                <input
                  type="text"
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                  placeholder="Enter reason for leave"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={applyLeave}
                disabled={loading}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300"
              >
                Submit Application
              </button>
              <button
                onClick={() => setShowApplyForm(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Leave History */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b border-gray-200">
            <h3 className="text-lg text-gray-900">Leave History</h3>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading...</div>
          ) : sortedLeaves.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No leave applications yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Date</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Reason</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Applied On</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm text-gray-700">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedLeaves.map((leave, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {new Date(leave.leaveDate).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </td>
                      <td className="px-6 py-4 text-gray-700">{leave.reason}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {leave.appliedAt ? new Date(leave.appliedAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        }) : '-'}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(leave.status)}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">
                        {leave.approvedBy || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Leave Policy Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="mb-2"><strong>Leave Policy:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>4 leaves are credited on the 1st of each month</li>
                <li>Unused leaves do not carry forward to the next year</li>
                <li>Leave balance resets to 0 on January 1st each year</li>
                <li>All leave applications require manager approval</li>
                <li>Approved leaves will prevent timesheet entry for that day</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}