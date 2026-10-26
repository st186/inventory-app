import { useState } from 'react';
import { DollarSign, Plus, Loader2, CreditCard, CheckCircle, XCircle, Clock, Ban } from 'lucide-react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { ApplyLoanModal } from './ApplyLoanModal';
import { RepayLoanModal } from './RepayLoanModal';

type Props = {
  context: InventoryContextType;
  effectiveStoreId?: string | null;
  selectedDate: string;
  loans: api.OnlineLoan[];
  isLoading: boolean;
  onReload: () => Promise<void>;
  canApply: boolean; // operations manager or cluster head - can raise a loan request and repay it
  canApprove: boolean; // cluster head - can approve/reject a pending request
};

const STATUS_STYLES: Record<api.OnlineLoan['status'], { label: string; badge: string; bar: string }> = {
  pending: { label: 'Pending approval', badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  active: { label: 'Active', badge: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
  repaid: { label: 'Repaid', badge: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-700', bar: 'bg-red-400' },
};

export function LoanManagementSection({
  context,
  effectiveStoreId,
  selectedDate,
  loans,
  isLoading,
  onReload,
  canApply,
  canApprove,
}: Props) {
  const [showApplyLoanModal, setShowApplyLoanModal] = useState(false);
  const [showRepayLoanModal, setShowRepayLoanModal] = useState(false);
  const [selectedLoanForRepayment, setSelectedLoanForRepayment] = useState<api.OnlineLoan | null>(null);
  const [decidingLoanId, setDecidingLoanId] = useState<string | null>(null);
  const [rejectingLoanId, setRejectingLoanId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleApprove = async (loan: api.OnlineLoan) => {
    if (!context.user?.accessToken) return;
    setDecidingLoanId(loan.id);
    try {
      await api.approveOnlineLoan(context.user.accessToken, loan.id);
      await onReload();
    } catch (error: any) {
      alert(error?.message || 'Failed to approve loan');
    } finally {
      setDecidingLoanId(null);
    }
  };

  const handleReject = async (loan: api.OnlineLoan) => {
    if (!context.user?.accessToken) return;
    setDecidingLoanId(loan.id);
    try {
      await api.rejectOnlineLoan(context.user.accessToken, loan.id, rejectionReason);
      setRejectingLoanId(null);
      setRejectionReason('');
      await onReload();
    } catch (error: any) {
      alert(error?.message || 'Failed to reject loan');
    } finally {
      setDecidingLoanId(null);
    }
  };

  const activeLoans = loans.filter(l => l.status === 'active');
  const pendingLoans = loans.filter(l => l.status === 'pending');
  const totalActiveLoans = activeLoans.reduce((sum, l) => sum + l.loanAmount, 0);
  const totalRepaid = activeLoans.reduce((sum, l) => sum + l.repaidAmount, 0);
  const totalRemaining = activeLoans.reduce((sum, l) => sum + (l.loanAmount - l.repaidAmount), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 flex-shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Loan management</h2>
            <p className="text-xs text-gray-500">Loans over ₹5,000, approved by a cluster head, credited/deducted from Paytm</p>
          </div>
        </div>
        {canApply && (
          <button
            onClick={() => setShowApplyLoanModal(true)}
            className="flex-shrink-0 px-3.5 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Request loan
          </button>
        )}
      </div>

      {pendingLoans.length > 0 && canApprove && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            {pendingLoans.length} loan request{pendingLoans.length !== 1 ? 's' : ''} awaiting your approval
          </p>
        </div>
      )}

      {(activeLoans.length > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-500">Active loans</p>
            <p className="text-base font-semibold text-gray-900 mt-0.5">₹{totalActiveLoans.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-500">Repaid</p>
            <p className="text-base font-semibold text-green-700 mt-0.5">₹{totalRepaid.toLocaleString()}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-500">Remaining</p>
            <p className="text-base font-semibold text-red-600 mt-0.5">₹{totalRemaining.toLocaleString()}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="ml-2 text-sm">Loading loans...</span>
        </div>
      ) : loans.length === 0 ? (
        <div className="text-center py-8">
          <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No loans recorded yet</p>
          {canApply && <p className="text-xs text-gray-400 mt-0.5">Tap "Request loan" to raise one</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {loans.map(loan => {
            const remaining = loan.loanAmount - loan.repaidAmount;
            const progress = loan.loanAmount > 0 ? (loan.repaidAmount / loan.loanAmount) * 100 : 0;
            const style = STATUS_STYLES[loan.status] || STATUS_STYLES.pending;

            return (
              <div key={loan.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(loan.loanDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{loan.notes || 'No notes'}</p>
                    {loan.requestedByName && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Requested by {loan.requestedByName}</p>
                    )}
                    {loan.status === 'rejected' && loan.rejectionReason && (
                      <p className="text-[11px] text-red-500 mt-0.5">Reason: {loan.rejectionReason}</p>
                    )}
                  </div>
                  <p className="text-base font-semibold text-gray-900 flex-shrink-0">₹{loan.loanAmount.toLocaleString()}</p>
                </div>

                {(loan.status === 'active' || loan.status === 'repaid') && (
                  <div className="mb-2.5">
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                      <span>Repaid ₹{loan.repaidAmount.toLocaleString()}</span>
                      <span>Remaining ₹{remaining.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${style.bar}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {loan.status === 'pending' && canApprove && (
                  rejectingLoanId === loan.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Reason for rejecting (optional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejectingLoanId(null); setRejectionReason(''); }}
                          className="flex-1 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReject(loan)}
                          disabled={decidingLoanId === loan.id}
                          className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRejectingLoanId(loan.id)}
                        disabled={decidingLoanId === loan.id}
                        className="flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(loan)}
                        disabled={decidingLoanId === loan.id}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        {decidingLoanId === loan.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Approve
                      </button>
                    </div>
                  )
                )}

                {loan.status === 'pending' && !canApprove && (
                  <div className="flex items-center justify-center gap-1 text-xs text-amber-700">
                    <Clock className="w-3.5 h-3.5" />
                    Waiting for cluster head approval
                  </div>
                )}

                {loan.status === 'active' && canApply && (
                  <button
                    onClick={() => {
                      setSelectedLoanForRepayment(loan);
                      setShowRepayLoanModal(true);
                    }}
                    className="w-full px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Repay loan
                  </button>
                )}

                {loan.status === 'repaid' && loan.repaymentDate && (
                  <div className="flex items-center justify-center gap-1 text-xs text-green-700">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Fully repaid on {new Date(loan.repaymentDate).toLocaleDateString('en-IN')}
                  </div>
                )}

                {loan.status === 'rejected' && (
                  <div className="flex items-center justify-center gap-1 text-xs text-red-600">
                    <XCircle className="w-3.5 h-3.5" />
                    Rejected{loan.rejectedBy ? ` by ${loan.rejectedBy}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showApplyLoanModal && (
        <ApplyLoanModal
          context={context}
          selectedStoreId={effectiveStoreId}
          selectedDate={selectedDate}
          onClose={() => setShowApplyLoanModal(false)}
          onSaveSuccess={async () => {
            await onReload();
          }}
        />
      )}

      {showRepayLoanModal && selectedLoanForRepayment && (
        <RepayLoanModal
          context={context}
          loan={selectedLoanForRepayment}
          selectedDate={selectedDate}
          onClose={() => {
            setShowRepayLoanModal(false);
            setSelectedLoanForRepayment(null);
          }}
          onSaveSuccess={async () => {
            await onReload();
          }}
        />
      )}
    </div>
  );
}
