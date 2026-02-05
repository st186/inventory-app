import { useState } from 'react';
import { DollarSign, Calendar, FileText, Save, XCircle, AlertCircle } from 'lucide-react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate?: string;
  onClose: () => void;
  onSaveSuccess?: () => void;
};

export function ApplyLoanModal({ 
  context,
  selectedStoreId,
  selectedDate,
  onClose,
  onSaveSuccess
}: Props) {
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loanDate, setLoanDate] = useState(selectedDate || getTodayIST());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const store = context.stores?.find(s => s.id === effectiveStoreId);
  const storeName = store?.name || 'Unknown Store';

  // Check for missing store info on mount
  if (!effectiveStoreId || !store) {
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
        <div 
          className="bg-white rounded-xl max-w-lg w-full shadow-2xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Store Not Selected</h3>
            <p className="text-gray-600 mb-4">
              Please select a store from the dropdown at the top of the page before applying for a loan.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context.user?.accessToken || !effectiveStoreId) {
      setError('Missing authentication or store information');
      return;
    }

    const loanAmountNum = parseFloat(loanAmount);
    if (isNaN(loanAmountNum) || loanAmountNum <= 0) {
      setError('Please enter a valid loan amount');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const loanData = {
        storeId: effectiveStoreId,
        storeName,
        loanAmount: loanAmountNum,
        loanDate,
        notes,
        createdBy: context.user.email,
      };

      await api.applyOnlineLoan(context.user.accessToken, loanData);

      setSuccess(true);
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error applying for loan:', err);
      setError(err.message || 'Failed to apply for loan');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <DollarSign className="w-6 h-6" />
                Apply for Loan
              </h2>
              <p className="text-purple-100 mt-1">{storeName}</p>
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
            <DollarSign className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Loan Applied Successfully!</p>
              <p className="text-sm text-green-700">The loan amount has been added to your Online Cash in Hand.</p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Loan Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Loan Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">₹</span>
              <input
                type="number"
                step="0.01"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                placeholder="Enter loan amount"
                required
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              This amount will be added to your Online Cash in Hand (Paytm)
            </p>
          </div>

          {/* Loan Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Loan Date *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="date"
                value={loanDate}
                onChange={(e) => setLoanDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes / Purpose
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-gray-500 w-5 h-5" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Purpose of loan, source, repayment terms, etc."
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">💡 How Loans Work</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Loan amount is <strong>added</strong> to Online Cash in Hand (Paytm)</li>
                  <li>Track active loans in the loan section below</li>
                  <li>Use "Repay Loan" to pay back (reduces Online Cash in Hand)</li>
                  <li>Supports partial and full repayments</li>
                </ul>
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
              disabled={saving || !loanAmount}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Apply for Loan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}