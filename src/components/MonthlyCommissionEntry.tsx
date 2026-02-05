import { useState, useEffect } from 'react';
import { DollarSign, AlertCircle, CheckCircle, Percent } from 'lucide-react';
import * as api from '../utils/api';

type Props = {
  selectedDate: string;
  accessToken: string;
  userEmail: string;
  userName: string;
  storeId?: string | null;
  onCommissionSaved: () => void;
};

export function MonthlyCommissionEntry({ 
  selectedDate, 
  accessToken, 
  userEmail, 
  userName, 
  storeId,
  onCommissionSaved 
}: Props) {
  const [commissionAmount, setCommissionAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash' | 'both'>('online');
  const [cashAmount, setCashAmount] = useState('');
  const [onlineAmount, setOnlineAmount] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [existingCommission, setExistingCommission] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get current month in YYYY-MM format
  const getCurrentMonth = () => {
    const date = new Date(selectedDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const currentMonth = getCurrentMonth();
  const currentMonthLabel = new Date(currentMonth + '-01').toLocaleDateString('default', { 
    month: 'long', 
    year: 'numeric' 
  });

  // Check if commission already exists for current month (where previous month's commission is recorded)
  useEffect(() => {
    const loadExistingCommission = async () => {
      try {
        setIsLoading(true);
        const overheads = await api.fetchOverheads(accessToken);
        
        // Extract current month from selectedDate
        const currentMonth = selectedDate.substring(0, 7); // e.g., "2026-01"
        
        console.log('🔍 Looking for commission for currentMonth:', currentMonth);
        console.log('🔍 All overhead items:', overheads.length);
        
        // Find commission entry by description pattern (contains "Aggregator Commission" or old "commission" category)
        // Check BOTH current month (new format) and previous month (old format)
        const commission = overheads.find(item => 
          (
            // New format: service_charge category with "Aggregator Commission" in description
            (item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) ||
            // Legacy format: commission category (for backward compatibility)
            item.category === 'commission'
          ) &&
          (item.date?.startsWith(currentMonth)) &&
          (storeId ? item.storeId === storeId : true)
        );
        
        console.log('��� Found commission:', commission);
        
        if (commission) {
          setExistingCommission(commission);
          setCommissionAmount(commission.amount.toString());
          setNotes(commission.description || '');
          setPaymentMethod(commission.paymentMethod || 'online');
          if (commission.paymentMethod === 'both') {
            setCashAmount(commission.cashAmount?.toString() || '');
            setOnlineAmount(commission.onlineAmount?.toString() || '');
          }
        }
      } catch (error) {
        console.error('Error loading commission:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadExistingCommission();
  }, [selectedDate, currentMonth, accessToken, storeId]);

  const handleSave = async () => {
    if (!commissionAmount || parseFloat(commissionAmount) <= 0) {
      alert('Please enter a valid commission amount');
      return;
    }

    // Validate 'both' payment method
    if (paymentMethod === 'both') {
      const cash = parseFloat(cashAmount) || 0;
      const online = parseFloat(onlineAmount) || 0;
      const total = parseFloat(commissionAmount);
      
      if (cash + online !== total) {
        alert(`Cash (₹${cash}) + Online (₹${online}) must equal Total (₹${total})`);
        return;
      }
    }

    try {
      setIsSaving(true);

      // Get the last day of the CURRENT month for the commission date
      // On Jan 31st, we're entering commission for January, so date = 2026-01-31
      const currentMonthDate = new Date(currentMonth + '-01');
      const year = currentMonthDate.getFullYear();
      const month = currentMonthDate.getMonth() + 1;
      
      // Get last day of current month
      const lastDayOfCurrentMonth = new Date(year, month, 0);
      const lastDay = String(lastDayOfCurrentMonth.getDate()).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const commissionDate = `${year}-${monthStr}-${lastDay}`;

      const commissionData: any = {
        category: 'service_charge' as const,
        description: notes || `Aggregator Commission (Swiggy + Zomato) - ${currentMonthLabel}`,
        amount: parseFloat(commissionAmount),
        date: commissionDate, // Store as LAST day of the CURRENT month
        storeId: storeId || undefined,
        createdBy: userEmail,
        createdByName: userName,
        createdByEmail: userEmail,
        paymentMethod: paymentMethod as const
      };

      if (paymentMethod === 'both') {
        commissionData.cashAmount = parseFloat(cashAmount) || 0;
        commissionData.onlineAmount = parseFloat(onlineAmount) || 0;
      }

      console.log('💾 SAVING COMMISSION:', commissionData);

      if (existingCommission) {
        // Update existing commission
        console.log('💾 Updating existing commission ID:', existingCommission.id);
        await api.updateOverhead(accessToken, existingCommission.id, commissionData);
        alert(`Commission for ${currentMonthLabel} updated successfully!`);
      } else {
        // Create new commission entry
        console.log('💾 Creating new commission entry');
        const result = await api.addOverhead(accessToken, commissionData);
        console.log('💾 Commission saved successfully:', result);
        alert(`Commission for ${currentMonthLabel} saved successfully!`);
      }

      onCommissionSaved();
    } catch (error) {
      console.error('❌ Error saving commission:', error);
      alert('Failed to save commission. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border-2 border-purple-200">
        <div className="flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border-2 border-purple-200 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-purple-500 rounded-full p-2">
          <Percent className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Monthly Commission Entry
          </h3>
          <p className="text-sm text-gray-600">
            {existingCommission ? 'Update' : 'Enter'} aggregator commission for {currentMonthLabel}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 mb-4">
        <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg p-3 mb-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Monthly Commission Policy</p>
            <p className="text-xs">
              Enter the total commission charged by online food aggregators (Swiggy + Zomato) for <strong>{currentMonthLabel}</strong>.
              This will be added to your expenses and reduce net profit accordingly.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Commission Amount for {currentMonthLabel} (₹) *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="number"
                step="0.01"
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Enter total commission amount"
                disabled={isSaving}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Typically 20-25% of your total online sales for the month
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'cash' | 'both')}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              disabled={isSaving}
            >
              <option value="online">Online (Paytm)</option>
              <option value="cash">Cash</option>
              <option value="both">Both</option>
            </select>
          </div>

          {paymentMethod === 'both' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cash Amount (₹)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="number"
                    step="0.01"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter cash amount"
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Online Amount (₹)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="number"
                    step="0.01"
                    value={onlineAmount}
                    onChange={(e) => setOnlineAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Enter online amount"
                    disabled={isSaving}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="Add any notes about this commission"
              rows={2}
              disabled={isSaving}
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving || !commissionAmount}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
      >
        {isSaving ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Saving...</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            <span>{existingCommission ? 'Update' : 'Save'} Commission</span>
          </>
        )}
      </button>

      {existingCommission && (
        <p className="text-xs text-green-600 text-center mt-2 flex items-center justify-center gap-1">
          <CheckCircle className="w-4 h-4" />
          Commission already recorded for {currentMonthLabel}. You can update it above.
        </p>
      )}
    </div>
  );
}