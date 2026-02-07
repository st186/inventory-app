import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Save, Smartphone, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import * as api from '../utils/api';
import { formatDateTimeIST, getTodayIST } from '../utils/timezone';
import { InventoryContextType } from '../App';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate?: string; // Add selectedDate prop
  systemBalance: number; // Pre-calculated balance from SalesManagement
  onClose: () => void;
  onSaveSuccess?: () => void;
};

export function OnlineCashRecalibration({ 
  context,
  selectedStoreId,
  selectedDate, // Add selectedDate to destructuring
  systemBalance,
  onClose,
  onSaveSuccess
}: Props) {
  const [actualBalance, setActualBalance] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [discrepancyType, setDiscrepancyType] = useState<'none' | 'mistake' | 'loan'>('none');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastRecalibration, setLastRecalibration] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [manualDate, setManualDate] = useState<string>(''); // Add state for manual date selection
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const store = context.stores?.find(s => s.id === effectiveStoreId);
  const storeName = store?.name || 'Unknown Store';
  
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentMonthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const today = getTodayIST();
  // Use manualDate if set, otherwise use selectedDate or today
  const recalibrationDate = manualDate || selectedDate || today;

  useEffect(() => {
    checkLastRecalibration();
  }, []);

  async function checkLastRecalibration() {
    try {
      setLoading(true);
      if (!effectiveStoreId || !context.user?.accessToken) return;
      
      const response = await api.getLastOnlineCashRecalibration(
        context.user.accessToken,
        effectiveStoreId
      );
      
      // Extract the recalibration data from the response
      const recalibration = response?.recalibration || null;
      
      if (recalibration && recalibration.month === currentMonthKey) {
        setLastRecalibration(recalibration);
        setActualBalance(recalibration.actualBalance.toString());
        setNotes(recalibration.notes || '');
        setDiscrepancyType(recalibration.discrepancyType || 'none');
        setLoanAmount(recalibration.loanAmount?.toString() || '');
        setManualDate(recalibration.date || ''); // Load the recalibration date
      }
    } catch (err) {
      console.error('Error fetching last recalibration:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context.user?.accessToken || !effectiveStoreId) {
      setError('Missing authentication or store information');
      return;
    }

    const actualBalanceNum = parseFloat(actualBalance);
    if (isNaN(actualBalanceNum)) {
      setError('Please enter a valid actual balance');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const recalibrationData = {
        storeId: effectiveStoreId,
        storeName,
        month: currentMonthKey,
        date: recalibrationDate,
        systemBalance: systemBalance,
        actualBalance: actualBalanceNum,
        difference: actualBalanceNum - systemBalance,
        notes: notes,
        createdBy: context.user.email,
        approvalStatus: 'approved' as const, // Auto-approved for now
        discrepancyType: discrepancyType,
        loanAmount: discrepancyType === 'loan' ? parseFloat(loanAmount) : null,
      };

      console.log('💾 ===== SUBMITTING RECALIBRATION =====');
      console.log('📊 Recalibration data being saved:', recalibrationData);
      console.log('🏪 Store ID:', effectiveStoreId);
      console.log('📅 Month:', currentMonthKey);
      console.log('📅 Date:', recalibrationDate);
      console.log('💰 System Balance:', systemBalance);
      console.log('💰 Actual Balance:', actualBalanceNum);
      console.log('💰 Difference:', actualBalanceNum - systemBalance);

      await api.submitOnlineCashRecalibration(
        context.user.accessToken,
        recalibrationData
      );

      console.log('✅ Recalibration saved successfully!');
      console.log('💾 ===== END SUBMITTING RECALIBRATION =====\n');

      setSuccess(true);
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('❌ Error submitting recalibration:', err);
      setError(err.message || 'Failed to submit recalibration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            <p className="text-gray-700">Loading recalibration data...</p>
          </div>
        </div>
      </div>
    );
  }

  const difference = actualBalance ? parseFloat(actualBalance) - systemBalance : 0;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Smartphone className="w-6 h-6" />
                Online Cash Recalibration
              </h2>
              <p className="text-purple-100 mt-1">
                {storeName} - {currentMonth}
              </p>
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
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Recalibration Saved Successfully!</p>
              <p className="text-sm text-green-700">Your online cash balance has been updated.</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="m-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <p className="text-red-900">{error}</p>
          </div>
        )}

        {/* Last Recalibration Info */}
        {lastRecalibration && (
          <div className="m-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm text-blue-900">
                  <strong>Current Recalibration for {currentMonth}:</strong>
                  <br />
                  <strong>Created:</strong> {lastRecalibration.createdAt ? formatDateTimeIST(lastRecalibration.createdAt) : 'N/A'}
                  <br />
                  <strong>Date:</strong> {lastRecalibration.date ? new Date(lastRecalibration.date).toLocaleDateString('en-IN') : 'N/A'}
                  <br />
                  System Balance: ₹{lastRecalibration.systemBalance.toLocaleString()} | 
                  Actual Balance: ₹{lastRecalibration.actualBalance.toLocaleString()} | 
                  Difference: <span className={lastRecalibration.difference >= 0 ? 'text-green-700' : 'text-red-700'}>
                    {lastRecalibration.difference >= 0 ? '+' : ''}₹{lastRecalibration.difference.toLocaleString()}
                  </span>
                  <br />
                  <span className="text-xs text-blue-700 mt-1 inline-block">
                    ℹ️ You can edit the date, balance, and notes below. Saving will update this recalibration.
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('Are you sure you want to delete this recalibration? This will recalculate the balance from the beginning of time.')) {
                    try {
                      console.log('🗑️ [CLIENT] Deleting recalibration:', lastRecalibration.id);
                      const response = await api.deleteOnlineCashRecalibration(context.user!.accessToken, lastRecalibration.id);
                      console.log('✅ [CLIENT] Delete response:', response);
                      alert('Recalibration deleted successfully! The page will reload.');
                      // Force a full page reload to clear all caches
                      window.location.reload();
                    } catch (err) {
                      console.error('❌ [CLIENT] Delete failed:', err);
                      alert('Failed to delete recalibration: ' + (err as Error).message);
                    }
                  }
                }}
                className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors whitespace-nowrap"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* System Balance (Read-only) */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border-2 border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <label className="text-sm font-semibold text-purple-900 uppercase tracking-wide">
                System Calculated Balance
              </label>
            </div>
            <p className="text-4xl font-bold text-purple-900">
              ₹{systemBalance.toLocaleString()}
            </p>
            <p className="text-xs text-purple-700 mt-2">
              This is the balance calculated from all your Paytm receipts, online sales, expenses, and commissions up to today.
            </p>
          </div>

          {/* Actual Balance Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Actual Balance (Verified) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">₹</span>
              <input
                type="number"
                step="0.01"
                value={actualBalance}
                onChange={(e) => setActualBalance(e.target.value)}
                className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                placeholder="Enter actual balance from Paytm app"
                required
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Check your actual Paytm/online wallet balance and enter it here
            </p>
          </div>

          {/* Recalibration Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Recalibration Date *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="date"
                value={manualDate || today}
                onChange={(e) => setManualDate(e.target.value)}
                max={today}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                required
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Select the date for this recalibration (defaults to today)
            </p>
          </div>

          {/* Difference Display */}
          {actualBalance && (
            <div className={`p-4 rounded-lg border-2 ${
              difference >= 0 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <p className="text-sm font-semibold mb-1">
                Difference (Actual - System):
              </p>
              <p className={`text-3xl font-bold ${
                difference >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {difference >= 0 ? '+' : ''}₹{difference.toLocaleString()}
              </p>
              {Math.abs(difference) > 0 && (
                <p className="text-xs mt-2 text-gray-700">
                  {difference > 0 
                    ? '✅ You have more cash than the system expected (surplus)'
                    : '⚠️ You have less cash than the system expected (shortage)'}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes / Explanation
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Optional: Explain any discrepancies or special situations..."
            />
          </div>

          {/* Discrepancy Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Discrepancy Type
            </label>
            <select
              value={discrepancyType}
              onChange={(e) => setDiscrepancyType(e.target.value as 'none' | 'mistake' | 'loan')}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="none">None</option>
              <option value="mistake">Mistake</option>
              <option value="loan">Loan</option>
            </select>
          </div>

          {/* Loan Amount */}
          {discrepancyType === 'loan' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Loan Amount
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
                />
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <p className="font-semibold mb-1">📅 Monthly Recalibration</p>
                <p>
                  Recalibrate your online cash balance at the end of each month to ensure accuracy. 
                  This helps catch any missed entries, fees, or discrepancies.
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
              disabled={saving || !actualBalance}
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
                  Save Recalibration
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}