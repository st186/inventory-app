import { useState } from 'react';
import { CreditCard, X, AlertCircle, Clock, CheckCircle, XCircle } from 'lucide-react';
import * as api from '../utils/api';

interface ManagerAdvanceProps {
  userEmployeeId: string;
  employees: any[];
  salaryAdvances: any[];
  onRefresh: () => void;
}

export function ManagerAdvance({ userEmployeeId, employees, salaryAdvances, onRefresh }: ManagerAdvanceProps) {
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');

  const currentEmployee = employees.find(e => e.employeeId === userEmployeeId);
  const myAdvances = salaryAdvances.filter(a => a.employeeId === currentEmployee?.id);

  const handleApplySalaryAdvance = async () => {
    if (!advanceAmount || !userEmployeeId) return;

    const amount = parseFloat(advanceAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      if (!currentEmployee) {
        alert('Employee not found');
        return;
      }

      if (currentEmployee.type !== 'fulltime') {
        alert('Only permanent employees can apply for salary advance');
        return;
      }

      const hasActiveAdvance = myAdvances.some(adv =>
        adv.status === 'pending' || (adv.status === 'approved' && adv.remainingAmount > 0)
      );

      if (hasActiveAdvance) {
        alert('You already have an active or pending salary advance');
        return;
      }

      const monthlyDeduction = amount / 4;
      const newAdvance = {
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        employeeEmployeeId: currentEmployee.employeeId,
        amount,
        monthlyDeduction,
        remainingAmount: amount,
        status: 'pending',
        requestDate: new Date().toISOString(),
      };

      await api.createSalaryAdvance(newAdvance);
      alert('Salary advance request submitted successfully!');
      setShowAdvanceModal(false);
      setAdvanceAmount('');
      onRefresh();
    } catch (error) {
      console.error('Error applying for salary advance:', error);
      alert('Failed to submit salary advance request. Please try again.');
    }
  };

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Apply for Advance Button */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg text-gray-900 font-semibold">Salary Advance</h3>
            <p className="text-sm text-gray-600 mt-1">
              Apply for salary advance with automatic 4-month recovery
            </p>
          </div>
          {currentEmployee?.type === 'fulltime' && (
            <button
              onClick={() => setShowAdvanceModal(true)}
              disabled={myAdvances.some(adv => 
                adv.status === 'pending' || (adv.status === 'approved' && adv.remainingAmount > 0)
              )}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-5 h-5" />
              <span>Apply for Advance</span>
            </button>
          )}
        </div>

        {currentEmployee?.type !== 'fulltime' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-yellow-800 font-medium">Not Available</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Salary advance is only available for permanent employees
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Salary Advances List */}
        {myAdvances.length > 0 ? (
          <div className="space-y-4">
            {myAdvances.map((advance) => (
              <div 
                key={advance.id}
                className={`border-2 rounded-xl p-6 ${
                  advance.status === 'pending' ? 'border-yellow-300 bg-yellow-50' :
                  advance.status === 'approved' ? 'border-green-300 bg-green-50' :
                  'border-red-300 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-lg font-semibold text-gray-900">
                        ₹{advance.amount.toLocaleString('en-IN')} Advance
                      </h4>
                      {advance.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                          <Clock className="w-3 h-3" />
                          Pending Approval
                        </span>
                      )}
                      {advance.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                          <CheckCircle className="w-3 h-3" />
                          Approved
                        </span>
                      )}
                      {advance.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      Applied on {new Date(advance.requestDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                {advance.status === 'rejected' && advance.rejectionReason && (
                  <div className="bg-red-100 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-sm font-medium text-red-800 mb-1">Rejection Reason:</p>
                    <p className="text-sm text-red-700">{advance.rejectionReason}</p>
                  </div>
                )}

                {advance.status === 'approved' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Monthly Deduction</p>
                        <p className="text-lg font-semibold text-gray-900">
                          ₹{advance.monthlyDeduction.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Remaining Amount</p>
                        <p className="text-lg font-semibold text-orange-600">
                          ₹{advance.remainingAmount.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Recovery Period</p>
                        <p className="text-lg font-semibold text-gray-900">4 Months</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Approved By</p>
                        <p className="text-sm font-semibold text-gray-900">{advance.approvedBy}</p>
                      </div>
                    </div>

                    <div className="bg-white border border-green-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="text-green-800 font-medium mb-1">Advance Approved</p>
                          <p className="text-sm text-green-700">
                            The advance amount will be deducted in 4 equal monthly installments of ₹{advance.monthlyDeduction.toLocaleString('en-IN')} starting from your next salary payout.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium mb-2">No Salary Advances</p>
            <p className="text-sm text-gray-500">
              You haven't applied for any salary advances yet
            </p>
          </div>
        )}
      </div>

      {/* Manager Salary Advance Application Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl text-gray-900 font-semibold">Apply for Salary Advance</h2>
              </div>
              <button
                onClick={() => {
                  setShowAdvanceModal(false);
                  setAdvanceAmount('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-purple-800 font-medium mb-1">Recovery Terms</p>
                    <p className="text-sm text-purple-700">
                      The advance will be automatically deducted from your salary over the next 4 months in equal installments.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Advance Amount *</label>
                <input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="Enter amount (e.g., 10000)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {advanceAmount && !isNaN(parseFloat(advanceAmount)) && parseFloat(advanceAmount) > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 mb-2">Monthly Deduction Preview:</p>
                  <p className="text-2xl font-bold text-purple-600">
                    ₹{(parseFloat(advanceAmount) / 4).toLocaleString('en-IN')}/month
                  </p>
                  <p className="text-xs text-gray-600 mt-1">for 4 months</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowAdvanceModal(false);
                  setAdvanceAmount('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySalaryAdvance}
                disabled={!advanceAmount || isNaN(parseFloat(advanceAmount)) || parseFloat(advanceAmount) <= 0}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
