import { useState } from 'react';
import { DollarSign, Calendar, FileText, Save, XCircle, AlertCircle, TrendingDown } from 'lucide-react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  loan: api.OnlineLoan;
  selectedDate?: string;
  onClose: () => void;
  onSaveSuccess?: () => void;
};

export function RepayLoanModal({ 
  context,
  loan,
  selectedDate,
  onClose,
  onSaveSuccess
}: Props) {
  const remainingAmount = loan.loanAmount - loan.repaidAmount;
  const [repaymentAmount, setRepaymentAmount] = useState<string>(remainingAmount.toString());
  const [repaymentDate, setRepaymentDate] = useState(selectedDate || getTodayIST());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context.user?.accessToken) {
      setError('Missing authentication');
      return;
    }

    const repaymentAmountNum = parseFloat(repaymentAmount);
    if (isNaN(repaymentAmountNum) || repaymentAmountNum <= 0) {
      setError('Please enter a valid repayment amount');
      return;
    }

    if (repaymentAmountNum > remainingAmount) {
      setError(`Repayment amount cannot exceed remaining amount (₹${remainingAmount.toLocaleString()})`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.repayOnlineLoan(
        context.user.accessToken,
        loan.id,
        {
          repaymentAmount: repaymentAmountNum,
          repaymentDate,
          notes,
        }
      );

      setSuccess(true);
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error repaying loan:', err);
      setError(err.message || 'Failed to process loan repayment');
    } finally {
      setSaving(false);
    }
  };

  const isFullRepayment = parseFloat(repaymentAmount) === remainingAmount;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <TrendingDown className="w-6 h-6" />
                Repay Loan
              </h2>
              <p className="text-green-100 mt-1">{loan.storeName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="m-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg flex items-center gap-3">
            <TrendingDown className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Loan Repayment Successful!</p>
              <p className="text-sm text-green-700">The amount has been deducted from your Online Cash in Hand.</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="m-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <p className="text-red-900">{error}</p>
          </div>
        )}

        {/* Loan Info */}
        <div className="m-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg">
          <h3 className="font-semibold text-purple-900 mb-3">Loan Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700">Original Loan:</span>
              <span className="font-semibold text-gray-900">₹{loan.loanAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Already Repaid:</span>
              <span className="font-semibold text-green-700">₹{loan.repaidAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-purple-300">
              <span className="text-gray-700 font-semibold">Remaining:</span>
              <span className="font-bold text-purple-900 text-lg">₹{remainingAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Loan Date:</span>
              <span className="text-gray-800">{new Date(loan.loanDate).toLocaleDateString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-6">
          {/* Repayment Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Repayment Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">₹</span>
              <input
                type="number"
                step="0.01"
                value={repaymentAmount}
                onChange={(e) => setRepaymentAmount(e.target.value)}
                max={remainingAmount}
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                placeholder="Enter repayment amount"
                required
              />
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-600">
                {isFullRepayment ? '✅ Full repayment' : '⚠️ Partial repayment'}
              </p>
              <button
                type="button"
                onClick={() => setRepaymentAmount(remainingAmount.toString())}
                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                Pay Full Amount
              </button>
            </div>
          </div>

          {/* Repayment Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Repayment Date *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="date"
                value={repaymentDate}
                onChange={(e) => setRepaymentDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-gray-500 w-5 h-5" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Optional notes about this repayment..."
              />
            </div>
          </div>

          {/* Warning Box */}
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <p className="font-semibold mb-1">⚠️ Important</p>
                <p>
                  This repayment amount will be <strong>deducted</strong> from your Online Cash in Hand (Paytm) balance.
                  Make sure you have sufficient funds.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !repaymentAmount}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {isFullRepayment ? 'Pay Full Amount' : 'Make Payment'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
