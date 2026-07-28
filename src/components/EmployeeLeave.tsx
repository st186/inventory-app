import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle, Plus } from 'lucide-react';
import * as api from '../utils/api';

interface LeaveApplication {
  id?: string;
  employeeId: string;
  leaveDate: string;
  leaveType?: 'full' | 'half'; // Leave type (optional for backward compatibility)
  isAdvanceLeave?: boolean; // Whether this is an advance leave (borrowed from next month)
  advanceDaysRequested?: number; // Total days in the advance-leave application this record belongs to
  approverRole?: 'manager' | 'cluster_head'; // Who this advance leave routes to for approval
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

const MAX_ADVANCE_DAYS_BEFORE_ESCALATION = 4;

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
  const [projectedBalance, setProjectedBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyMode, setApplyMode] = useState<'regular' | 'advance'>('regular');
  const [newLeave, setNewLeave] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'full' as 'full' | 'half',
    reason: ''
  });

  // Half day only makes sense for a single-day application
  const isSingleDay = !newLeave.endDate || newLeave.startDate === newLeave.endDate;

  const getDateRange = (start: string, end: string) => {
    const dates: string[] = [];
    const cursor = new Date(start + 'T00:00:00');
    const last = new Date((end || start) + 'T00:00:00');
    while (cursor <= last) {
      dates.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  useEffect(() => {
    loadLeaves();
    calculateLeaveBalance();
  }, []);

  useEffect(() => {
    // Calculate projected balance whenever leaves change
    calculateProjectedBalance();
  }, [leaves, leaveBalance]);

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

  const calculateProjectedBalance = () => {
    // Calculate pending leave days (including advance leaves)
    const pendingLeaves = leaves.filter(l => l.status === 'pending');
    const pendingLeaveDays = pendingLeaves.reduce((total, leave) => {
      const leaveType = leave.leaveType || 'full';
      return total + (leaveType === 'half' ? 0.5 : 1);
    }, 0);

    // Projected balance = current balance - pending leaves
    // Can be negative if advance leaves are pending
    setProjectedBalance(leaveBalance - pendingLeaveDays);
  };

  const applyLeave = async () => {
    if (!newLeave.startDate || !newLeave.reason) {
      alert('Please fill all fields, including a reason');
      return;
    }

    const endDate = newLeave.endDate || newLeave.startDate;
    if (endDate < newLeave.startDate) {
      alert('End date cannot be before start date');
      return;
    }

    const datesInRange = getDateRange(newLeave.startDate, endDate);
    // Multi-day applications are always full-day; half day only applies to a single date
    const effectiveLeaveType = datesInRange.length > 1 ? 'full' : newLeave.leaveType;

    // Check if leave already applied for any date in the range
    const conflicting = datesInRange.filter(d => leaves.find(l => l.leaveDate === d));
    if (conflicting.length > 0) {
      alert(`Leave already applied for: ${conflicting.join(', ')}`);
      return;
    }

    // Calculate total leave days for this request
    const requestedDays = datesInRange.length * (effectiveLeaveType === 'half' ? 0.5 : 1);
    const isAdvanceLeave = applyMode === 'advance';

    // Advance leave over the threshold isn't blocked - it's just escalated to the
    // cluster head instead of the employee's own manager (see approverRole below).
    const approverRole: 'manager' | 'cluster_head' = requestedDays > MAX_ADVANCE_DAYS_BEFORE_ESCALATION ? 'cluster_head' : 'manager';

    if (!isAdvanceLeave && leaveBalance < requestedDays) {
      // Regular leave - check if balance is sufficient
      alert(`Insufficient leave balance. You have ${leaveBalance} day(s) remaining. Consider applying via the Advance Leave tab instead.`);
      return;
    }

    if (isAdvanceLeave && requestedDays > MAX_ADVANCE_DAYS_BEFORE_ESCALATION) {
      const proceed = confirm(`You're requesting ${requestedDays} day(s) of advance leave, which is more than ${MAX_ADVANCE_DAYS_BEFORE_ESCALATION} days. This will be sent to the cluster head for approval instead of your manager. Continue?`);
      if (!proceed) return;
    }

    try {
      setLoading(true);
      const appliedAt = new Date().toISOString();
      for (const date of datesInRange) {
        const leaveData: LeaveApplication = {
          employeeId: user.employeeId,
          leaveDate: date,
          leaveType: effectiveLeaveType,
          isAdvanceLeave,
          ...(isAdvanceLeave ? { advanceDaysRequested: requestedDays, approverRole } : {}),
          reason: newLeave.reason,
          status: 'pending',
          appliedAt
        };
        await api.applyLeave(leaveData);
      }
      await loadLeaves();
      await calculateLeaveBalance();

      setNewLeave({ startDate: '', endDate: '', leaveType: 'full' as 'full' | 'half', reason: '' });
      setShowApplyForm(false);
      const approverLabel = isAdvanceLeave ? (approverRole === 'cluster_head' ? 'the cluster head' : 'your manager') : 'your manager';
      alert(`Leave application submitted${datesInRange.length > 1 ? ` for ${datesInRange.length} days` : ''} - sent to ${approverLabel} for approval`);
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-blue-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl text-gray-900 mb-1 sm:mb-2">Leave Management</h1>
          <p className="text-sm sm:text-base text-gray-600">Apply for leaves and track your leave balance</p>
        </div>

        {/* Leave Balance Card */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg mb-3 sm:mb-4 opacity-90">Leave Balance</h2>

              {/* Current Balance */}
              <div className="mb-4">
                <div className="text-sm opacity-75 mb-1">Current Balance</div>
                <div className={`text-4xl sm:text-5xl mb-1 ${leaveBalance < 0 ? 'text-red-200' : ''}`}>
                  {leaveBalance}
                  {leaveBalance < 0 && (
                    <span className="text-xs sm:text-sm ml-2 bg-red-500/30 px-2 py-1 rounded">
                      Negative
                    </span>
                  )}
                </div>
                <p className="text-xs opacity-75">
                  {leaveBalance < 0
                    ? 'You have taken advance leave - will be deducted next month'
                    : 'approved leaves deducted'}
                </p>
              </div>

              {/* Projected Balance - Only show if there are pending leaves */}
              {projectedBalance !== leaveBalance && (
                <div className="pt-4 border-t border-white/20">
                  <div className="text-sm opacity-75 mb-1">Projected Balance</div>
                  <div className={`text-2xl sm:text-3xl mb-1 ${projectedBalance < 0 ? 'text-red-200' : ''}`}>
                    {projectedBalance}
                  </div>
                  <p className="text-xs opacity-75">if all pending leaves are approved</p>
                </div>
              )}

              <p className="text-xs sm:text-sm opacity-75 mt-4">4 leaves/month • up to {MAX_ADVANCE_DAYS_BEFORE_ESCALATION} days advance (manager approval), more needs cluster head approval</p>
            </div>
            <div className="hidden sm:block bg-white/20 rounded-full p-6 flex-shrink-0">
              <Calendar className="w-16 h-16" />
            </div>
          </div>
        </div>

        {/* Apply Leave Button */}
        <div className="mb-4 sm:mb-6">
          <button
            onClick={() => setShowApplyForm(!showApplyForm)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Apply for Leave
          </button>
        </div>

        {/* Apply Leave Form */}
        {showApplyForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg text-gray-900 mb-4">Apply for Leave</h3>

            {/* Regular vs Advance Leave tabs */}
            <div className="flex gap-2 mb-4 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setApplyMode('regular')}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  applyMode === 'regular' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Regular Leave
              </button>
              <button
                type="button"
                onClick={() => setApplyMode('advance')}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  applyMode === 'advance' ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Advance Leave
              </button>
            </div>

            {applyMode === 'advance' && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-xs text-gray-700">
                  <AlertCircle className="w-4 h-4 inline mr-1 text-yellow-700" />
                  Advance leave borrows from next month's quota - your balance will go negative and next month's credit will absorb it (e.g. take 4 days now, next month starts at 0).
                  <br />
                  <span className="font-medium">Up to {MAX_ADVANCE_DAYS_BEFORE_ESCALATION} days needs your manager's approval. More than that is sent to the cluster head instead.</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  value={newLeave.startDate}
                  onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value, endDate: newLeave.endDate && newLeave.endDate < e.target.value ? e.target.value : newLeave.endDate })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  value={newLeave.endDate}
                  onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                  min={newLeave.startDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Leave blank for a single day</p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Leave Type</label>
                <select
                  value={isSingleDay ? newLeave.leaveType : 'full'}
                  disabled={!isSingleDay}
                  onChange={(e) => setNewLeave({ ...newLeave, leaveType: e.target.value as 'full' | 'half' })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="full">Full Day</option>
                  <option value="half">Half Day</option>
                </select>
                {!isSingleDay && (
                  <p className="text-xs text-gray-500 mt-1">Half day isn't available for multi-day leave — each day in the range is applied as Full Day.</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Reason</label>
                <input
                  type="text"
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                  placeholder="Enter reason for leave"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={applyLeave}
                disabled={loading}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:bg-gray-300"
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
          <div className="px-6 py-4 bg-gradient-to-r from-orange-100 to-amber-100 border-b border-gray-200">
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
            <div className="divide-y divide-gray-100">
              {sortedLeaves.map((leave, index) => (
                <div key={index} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(leave.leaveDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{leave.reason}</p>
                    </div>
                    {getStatusBadge(leave.status)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      (leave.leaveType || 'full') === 'full'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {(leave.leaveType || 'full') === 'full' ? 'Full Day' : 'Half Day'}
                    </span>
                    {leave.isAdvanceLeave && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Advance
                      </span>
                    )}
                    {leave.isAdvanceLeave && leave.status === 'pending' && leave.approverRole && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {leave.approverRole === 'cluster_head' ? 'Needs Cluster Head Approval' : 'Needs Manager Approval'}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Applied {leave.appliedAt ? new Date(leave.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                    </span>
                    {leave.approvedBy && (
                      <span className="text-xs text-gray-400">· by {leave.approvedBy}</span>
                    )}
                  </div>
                </div>
              ))}
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
                <li>4 leaves are credited on the 1st of each month (Aug: 4, Sep: 8, Oct: 12, etc.)</li>
                <li>Unused leaves carry forward within the year</li>
                <li>All unused leaves lapse on December 31st (reset to 0)</li>
                <li>New year starts fresh with 4 leaves on January 1st</li>
                <li>Regular leave applications require your manager's approval</li>
                <li>Advance leave up to {MAX_ADVANCE_DAYS_BEFORE_ESCALATION} days needs your manager's approval; more than that is routed to the cluster head</li>
                <li>Approved leaves will prevent timesheet entry for that day</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}