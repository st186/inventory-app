import { useState, useEffect } from 'react';
import { DollarSign, Calendar, FileText, Save, XCircle, AlertCircle, User, Percent } from 'lucide-react';
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
  const [investorId, setInvestorId] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [investors, setInvestors] = useState<api.Investor[]>([]);
  const [loadingInvestors, setLoadingInvestors] = useState(true);
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const store = context.stores?.find(s => s.id === effectiveStoreId);
  const storeName = store?.name || 'Unknown Store';

  useEffect(() => {
    loadInvestors();
  }, [context.user]);

  const loadInvestors = async () => {
    if (!context.user?.accessToken) return;
    try {
      setLoadingInvestors(true);
      const data = await api.getInvestors(context.user.accessToken);
      setInvestors(data);
    } catch (error) {
      console.error('Error loading investors:', error);
    } finally {
      setLoadingInvestors(false);
    }
  };

  // Check for missing store info on mount
  if (!effectiveStoreId || !store) {
    return (
      <div 
        className="fixed inset-0 bg-scrim flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
        <div
          className="bg-surface rounded-2xl max-w-lg w-full shadow-2xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
            <h3 className="text-xl font-bold text-text tracking-tight mb-2">Store Not Selected</h3>
            <p className="text-text-3 mb-4">
              Please select a store from the dropdown at the top of the page before applying for a loan.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-surface border border-border-strong text-text-2 rounded-lg hover:bg-surface-2 transition-colors"
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
    if (loanAmountNum <= 5000) {
      setError('Loans must be for more than ₹5,000 - this is meant for heavy expenses, not routine top-ups');
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
        investorId,
        interestRate: parseFloat(interestRate) || 0,
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
      className="fixed inset-0 bg-scrim flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-surface border border-border p-6 text-text">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-surface-2 rounded-xl flex items-center justify-center border border-border flex-shrink-0">
                <DollarSign className="w-6 h-6 text-text" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  Request Loan
                </h2>
                <p className="text-text-2 mt-1 text-sm">{storeName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-2 rounded-lg transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="m-6 p-4 bg-success-soft border-2 border-success-border rounded-lg flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-success flex-shrink-0" />
            <div>
              <p className="font-semibold text-success">Loan Request Sent!</p>
              <p className="text-sm text-success">A cluster head will review it. Once approved, it's added to Online Cash in Hand (Paytm).</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="m-6 p-4 bg-danger-soft border-2 border-danger-border rounded-lg flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-danger flex-shrink-0" />
            <p className="text-danger">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Loan Amount */}
          <div>
            <label className="block text-sm font-semibold text-text-2 mb-2">
              Loan Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 text-lg">₹</span>
              <input
                type="number"
                step="0.01"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 border-2 border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-primary text-lg"
                placeholder="Enter loan amount"
                required
              />
            </div>
            <p className="text-xs text-text-2 mt-1">
              Must be more than ₹5,000. Once a cluster head approves this request, it's added to Online Cash in Hand (Paytm).
            </p>
          </div>

          {/* Loan Date */}
          <div>
            <label className="block text-sm font-semibold text-text-2 mb-2">
              Loan Date *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 w-5 h-5" />
              <input
                type="date"
                value={loanDate}
                onChange={(e) => setLoanDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-text-2 mb-2">
              Notes / Purpose
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-text-3 w-5 h-5" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full pl-10 pr-4 py-3 border-2 border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-primary"
                placeholder="Purpose of loan, source, repayment terms, etc."
              />
            </div>
          </div>

          {/* Investor Selection */}
          <div>
            <label className="block text-sm font-semibold text-text-2 mb-2">
              Investor *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 w-5 h-5" />
              <select
                value={investorId}
                onChange={(e) => setInvestorId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-primary"
                required
              >
                <option value="">Select Investor</option>
                {loadingInvestors ? (
                  <option value="">Loading...</option>
                ) : (
                  investors.map(investor => (
                    <option key={investor.id} value={investor.id}>
                      {investor.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Interest Rate */}
          <div>
            <label className="block text-sm font-semibold text-text-2 mb-2">
              Interest Rate *
            </label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 w-5 h-5" />
              <input
                type="number"
                step="0.01"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-primary"
                placeholder="Enter interest rate"
                required
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-info-soft border-2 border-info-border rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
              <div className="text-sm text-info">
                <p className="font-semibold mb-1">💡 How Loans Work</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Only requests over ₹5,000 can be raised, for heavy expenses</li>
                  <li>A cluster head must approve the request first</li>
                  <li>Once approved, the amount is <strong>added</strong> to Online Cash in Hand (Paytm)</li>
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
              className="flex-1 px-6 py-3 border-2 border-border-strong text-text-2 rounded-lg hover:bg-surface-2 transition-colors font-medium"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !loanAmount}
              className="flex-1 px-6 py-3 bg-primary text-on-primary rounded-lg   transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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