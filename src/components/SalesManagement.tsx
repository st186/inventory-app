import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, SalesData } from '../App';
import { DateSelector } from './DateSelector';
import { DollarSign, TrendingUp, Wallet, Users, ShoppingBag, CheckCircle, Smartphone, ArrowDownCircle, AlertTriangle, CheckSquare, X, Plus, Loader2 } from 'lucide-react';
import * as api from '../utils/api';
import { getTodayIST, formatDateIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

export function SalesManagement({ context, selectedStoreId }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    getTodayIST()
  );

  const [formData, setFormData] = useState({
    offlineSales: '',
    paytmAmount: '',
    cashAmount: '',
    onlineSales: '',
    employeeSalary: '',
    previousCashInHand: '',
    usedOnlineMoney: '',
    actualCashInHand: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isClusterHead = context.user?.role === 'cluster_head';
  const isManager = context.user?.role === 'manager';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isOperationsManager = isManager && !isStoreIncharge && !isProductionIncharge; // Operations manager (not store/production incharge)
  const canEditSales = isOperationsManager; // Only operations manager can enter/edit sales
  const canApproveSales = isOperationsManager || isClusterHead; // Operations manager and cluster head can approve
  
  // Contract worker payout state
  const [contractWorkers, setContractWorkers] = useState<any[]>([]);
  const [contractPayouts, setContractPayouts] = useState<Array<{employeeId: string, amount: string}>>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Load contract workers
  useEffect(() => {
    loadContractWorkers();
  }, []);

  const loadContractWorkers = async () => {
    setLoadingEmployees(true);
    try {
      const employees = await api.getEmployees();
      const contractOnly = employees.filter(emp => emp.type === 'contract');
      setContractWorkers(contractOnly);
    } catch (error) {
      console.error('Error loading contract workers:', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Load existing payouts for the selected date
  useEffect(() => {
    loadPayoutsForDate();
  }, [selectedDate, contractWorkers]); // Add contractWorkers as dependency

  const loadPayoutsForDate = async () => {
    if (contractWorkers.length === 0) return; // Wait for workers to load first
    
    try {
      const allPayouts = await api.getPayouts();
      const payoutsForDate = allPayouts.filter(p => p.date === selectedDate);
      
      // Filter to only include contract workers (not full-time employees)
      const contractWorkerIds = contractWorkers.map(w => w.id);
      const contractPayoutsOnly = payoutsForDate.filter(p => 
        contractWorkerIds.includes(p.employeeId)
      );
      
      // Group by employeeId to avoid duplicates - take the most recent one
      const payoutMap = new Map<string, typeof contractPayoutsOnly[0]>();
      contractPayoutsOnly.forEach(payout => {
        const existing = payoutMap.get(payout.employeeId);
        if (!existing || new Date(payout.createdAt) > new Date(existing.createdAt)) {
          payoutMap.set(payout.employeeId, payout);
        }
      });
      
      // Convert to format for form
      const formattedPayouts = Array.from(payoutMap.values()).map(p => ({
        employeeId: p.employeeId,
        amount: p.amount.toString()
      }));
      
      setContractPayouts(formattedPayouts);
    } catch (error) {
      console.error('Error loading payouts for date:', error);
    }
  };

  const handleAddContractWorker = () => {
    setContractPayouts([...contractPayouts, { employeeId: '', amount: '' }]);
  };

  const handleRemoveContractWorker = (index: number) => {
    setContractPayouts(contractPayouts.filter((_, i) => i !== index));
  };

  const handleContractPayoutChange = (index: number, field: 'employeeId' | 'amount', value: string) => {
    const updated = [...contractPayouts];
    updated[index][field] = value;
    setContractPayouts(updated);
  };

  // Calculate total contract worker payout
  const totalContractPayout = useMemo(() => {
    return contractPayouts.reduce((sum, payout) => {
      return sum + (parseFloat(payout.amount) || 0);
    }, 0);
  }, [contractPayouts]);

  // Get sales data for selected date (filtered by selected store, not user's store)
  const salesForDate = useMemo(() => {
    // Use selectedStoreId prop (from store selector) instead of user's storeId
    // This allows cluster heads to view data for any selected store
    const effectiveStoreId = selectedStoreId || context.user?.storeId;
    console.log('🏪 SalesManagement - effectiveStoreId:', effectiveStoreId);
    console.log('🏪 SalesManagement - selectedStoreId prop:', selectedStoreId);
    console.log('🏪 SalesManagement - user storeId:', context.user?.storeId);
    console.log('🏪 SalesManagement - selectedDate:', selectedDate);
    console.log('🏪 SalesManagement - all sales data:', context.salesData.map(s => ({ 
      id: s.id.substring(0, 8), 
      date: s.date, 
      storeId: s.storeId,
      offlineSales: s.offlineSales
    })));
    const filteredSales = effectiveStoreId 
      ? context.salesData.filter(s => s.storeId === effectiveStoreId)
      : context.salesData;
    console.log('🏪 SalesManagement - filtered sales:', filteredSales.map(s => ({ 
      id: s.id.substring(0, 8), 
      date: s.date, 
      storeId: s.storeId 
    })));
    const result = filteredSales.find(s => s.date === selectedDate);
    console.log('🏪 SalesManagement - salesForDate result:', result ? { 
      id: result.id.substring(0, 8), 
      date: result.date, 
      storeId: result.storeId 
    } : 'NOT FOUND');
    return result;
  }, [context.salesData, selectedDate, selectedStoreId, context.user?.storeId]);

  // Check if this is day 1 (first sales entry ever)
  const isFirstDay = useMemo(() => {
    return context.salesData.length === 0 || (!salesForDate && context.salesData.every(s => s.date > selectedDate));
  }, [context.salesData, selectedDate, salesForDate]);
  
  // Check if this is the 1st of the month
  const isFirstOfMonth = useMemo(() => {
    const date = new Date(selectedDate);
    return date.getDate() === 1;
  }, [selectedDate]);
  
  // Check if this is a Friday (for weekly cash verification)
  const isFriday = useMemo(() => {
    const date = new Date(selectedDate);
    return date.getDay() === 5; // Friday is day 5
  }, [selectedDate]);

  // Get previous date's sales to carry forward balances
  const previousDateSales = useMemo(() => {
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];
    return context.salesData.find(s => s.date === prevDateStr);
  }, [context.salesData, selectedDate]);

  // Calculate total expenses for the day
  const totalExpenses = useMemo(() => {
    const inventoryCost = context.inventory
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => sum + item.totalCost, 0);
    
    // Include ALL overhead costs (both cash and online/paytm)
    const allOverheadCosts = context.overheads
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => sum + item.amount, 0);
    
    // Include ALL fixed costs (both cash and online/paytm)
    const allFixedCosts = context.fixedCosts
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => sum + item.amount, 0);
    
    return inventoryCost + allOverheadCosts + allFixedCosts;
  }, [context.inventory, context.overheads, context.fixedCosts, selectedDate]);

  // Calculate fixed costs paid via cash (to deduct from Expected Cash in Hand)
  const fixedCostsCash = useMemo(() => {
    return context.fixedCosts
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'cash') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.cashAmount) {
          return sum + item.cashAmount;
        }
        return sum;
      }, 0);
  }, [context.fixedCosts, selectedDate]);

  // Calculate fixed costs paid via online/Paytm (to deduct from Online Cash in Hand)
  const fixedCostsOnline = useMemo(() => {
    return context.fixedCosts
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
  }, [context.fixedCosts, selectedDate]);

  // Calculate overhead costs paid via cash (to deduct from Expected Cash in Hand)
  const overheadCostsCash = useMemo(() => {
    return context.overheads
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'cash' || !item.paymentMethod) {
          // Default to cash if no payment method specified (backward compatibility)
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.cashAmount) {
          return sum + item.cashAmount;
        }
        return sum;
      }, 0);
  }, [context.overheads, selectedDate]);

  // Calculate overhead costs paid via online/Paytm (to deduct from Online Cash in Hand)
  const overheadCostsOnline = useMemo(() => {
    return context.overheads
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
  }, [context.overheads, selectedDate]);

  // Calculate expected closing cash balance
  const calculateCashInHand = (prevCash: number, cashReceived: number, expenses: number, salary: number, paytmAmount: number) => {
    // Fixed costs and overhead costs are already included in expenses, so don't subtract them separately
    return prevCash + paytmAmount + cashReceived - expenses - salary;
  };

  // Calculate expected cash for current form data
  const expectedCashInHand = useMemo(() => {
    const prevCash = parseFloat(formData.previousCashInHand) || 0;
    const cashReceived = parseFloat(formData.cashAmount) || 0;
    const salary = totalContractPayout; // Use total from contract workers
    const paytmAmount = parseFloat(formData.usedOnlineMoney) || 0;
    return calculateCashInHand(prevCash, cashReceived, totalExpenses, salary, paytmAmount);
  }, [formData.previousCashInHand, formData.cashAmount, totalContractPayout, totalExpenses, formData.usedOnlineMoney]);

  // Calculate cash discrepancy
  const cashDiscrepancy = useMemo(() => {
    const actual = parseFloat(formData.actualCashInHand) || 0;
    if (actual === 0) return 0;
    return actual - expectedCashInHand;
  }, [formData.actualCashInHand, expectedCashInHand]);

  const needsApproval = Math.abs(cashDiscrepancy) > 500; // Changed from 200 to 500

  // Calculate cumulative Paytm balance from all days up to selected date
  const calculatePaytmBalance = useMemo(() => {
    // Get all sales data up to and including selected date
    const allPaytmReceived = context.salesData
      .filter(s => s.date <= selectedDate)
      .reduce((sum, s) => sum + (s.paytmAmount ?? 0), 0);
    
    // Subtract all used online money up to and including selected date
    const allUsedOnlineMoney = context.salesData
      .filter(s => s.date <= selectedDate)
      .reduce((sum, s) => sum + (s.usedOnlineMoney ?? 0), 0);
    
    // Subtract all fixed costs paid via online up to and including selected date
    const allFixedCostsOnline = context.fixedCosts
      .filter(item => item.date <= selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
    
    // Subtract all overhead costs paid via online up to and including selected date
    const allOverheadCostsOnline = context.overheads
      .filter(item => item.date <= selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
    
    return allPaytmReceived - allUsedOnlineMoney - allFixedCostsOnline - allOverheadCostsOnline;
  }, [context.salesData, context.fixedCosts, context.overheads, selectedDate]);

  // Load existing data when date changes
  useEffect(() => {
    if (salesForDate) {
      setFormData({
        offlineSales: (salesForDate.offlineSales ?? 0).toString(),
        paytmAmount: (salesForDate.paytmAmount ?? 0).toString(),
        cashAmount: (salesForDate.cashAmount ?? 0).toString(),
        onlineSales: (salesForDate.onlineSales ?? 0).toString(),
        employeeSalary: (salesForDate.employeeSalary ?? 0).toString(),
        previousCashInHand: (salesForDate.previousCashInHand ?? 0).toString(),
        usedOnlineMoney: (salesForDate.usedOnlineMoney ?? 0).toString(),
        actualCashInHand: (salesForDate.actualCashInHand ?? 0).toString()
      });
      setIsEditing(true);
      setEditingId(salesForDate.id);
    } else {
      // Auto-fill previous cash balance from yesterday
      let prevCash = 0;

      if (previousDateSales) {
        // Use the actual cash in hand from previous day (which includes any offset)
        prevCash = previousDateSales.actualCashInHand ?? 0;
      }
      
      setFormData({
        offlineSales: '',
        paytmAmount: '',
        cashAmount: '',
        onlineSales: '',
        employeeSalary: '0',
        previousCashInHand: prevCash.toString(),
        usedOnlineMoney: '0',
        actualCashInHand: ''
      });
      setIsEditing(false);
      setEditingId(null);
    }
  }, [selectedDate, salesForDate, previousDateSales]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate request');
      return;
    }
    
    setIsSubmitting(true);

    const actualCash = parseFloat(formData.actualCashInHand) || 0;
    const offset = actualCash - expectedCashInHand;

    // Operations manager entries need approval from cluster head if there's high discrepancy
    // Cluster head can directly approve their own entries
    const needsManagerApproval = isOperationsManager;
    
    // Don't block saving if discrepancy is high - allow requesting approval
    const salesData: Omit<SalesData, 'id'> = {
      date: selectedDate,
      offlineSales: parseFloat(formData.offlineSales) || 0,
      paytmAmount: parseFloat(formData.paytmAmount) || 0,
      cashAmount: parseFloat(formData.cashAmount) || 0,
      onlineSales: parseFloat(formData.onlineSales) || 0,
      employeeSalary: totalContractPayout, // Store total contract payout
      previousCashInHand: parseFloat(formData.previousCashInHand) || 0,
      usedOnlineMoney: parseFloat(formData.usedOnlineMoney) || 0,
      actualCashInHand: actualCash,
      cashOffset: offset,
      // CRITICAL: Preserve the original salesDiscrepancy if it exists (locked at first settlement), otherwise set to current offset
      // This ensures that once a discrepancy is locked (either at initial settlement or after approval), it NEVER changes
      salesDiscrepancy: salesForDate?.salesDiscrepancy !== undefined 
        ? salesForDate.salesDiscrepancy 
        : offset,
      approvalRequired: needsApproval,
      approvalStatus: needsManagerApproval ? 'pending' : 'approved', // Auto-approve for operations manager
      createdBy: context.user?.employeeId || context.user?.email || 'unknown',
      approvedBy: !needsManagerApproval ? (context.user?.employeeId || context.user?.email || 'self') : salesForDate?.approvedBy || null,
      approvedAt: !needsManagerApproval ? new Date().toISOString() : salesForDate?.approvedAt || null,
      approvalRequested: salesForDate?.approvalRequested || false,
      approvalRequestedAt: salesForDate?.approvalRequestedAt || null,
      requestedCashInHand: salesForDate?.requestedCashInHand || null,
      requestedOffset: salesForDate?.requestedOffset || null,
      rejectedBy: salesForDate?.rejectedBy || null,
      rejectedAt: salesForDate?.rejectedAt || null,
      rejectionReason: salesForDate?.rejectionReason || null,
      storeId: selectedStoreId || context.user?.storeId || undefined
    };

    try {
      // Save sales data
      if (isEditing && editingId) {
        await context.updateSalesData(editingId, salesData);
      } else {
        await context.addSalesData(salesData);
      }
      
      // Sync contract worker payouts to payroll system
      if (contractPayouts.length > 0) {
        // First, get all payouts for this date to find and delete old ones
        const allPayouts = await api.getPayouts();
        const contractWorkerIds = contractWorkers.map(w => w.id);
        const existingPayoutsForDate = allPayouts.filter(p => 
          p.date === selectedDate && contractWorkerIds.includes(p.employeeId)
        );
        
        // Delete existing contract worker payouts for this date to avoid duplicates
        for (const payout of existingPayoutsForDate) {
          await api.deletePayout(payout.id);
          console.log('Deleted old payout:', payout.id);
        }
        
        // Now save the new payouts
        const payoutsToSave = contractPayouts
          .filter(p => p.employeeId && p.amount) // Only save valid payouts
          .map(payout => {
            const worker = contractWorkers.find(w => w.id === payout.employeeId);
            return {
              id: crypto.randomUUID(),
              employeeId: payout.employeeId,
              employeeName: worker?.name || '',
              amount: parseFloat(payout.amount),
              date: selectedDate,
              createdAt: new Date().toISOString()
            };
          });
        
        if (payoutsToSave.length > 0) {
          await api.addPayouts(payoutsToSave);
          console.log('Contract worker payouts synced to payroll:', payoutsToSave);
        }
      } else {
        // If no payouts entered, delete any existing ones for this date
        const allPayouts = await api.getPayouts();
        const contractWorkerIds = contractWorkers.map(w => w.id);
        const existingPayoutsForDate = allPayouts.filter(p => 
          p.date === selectedDate && contractWorkerIds.includes(p.employeeId)
        );
        
        for (const payout of existingPayoutsForDate) {
          await api.deletePayout(payout.id);
          console.log('Deleted payout (no workers entered):', payout.id);
        }
      }
      
      alert('Sales data and contract worker payouts saved successfully!');
    } catch (error) {
      console.error('Error saving sales data:', error);
      alert('Failed to save sales data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!editingId) return;
    try {
      await context.approveSalesData(editingId);
      alert('Sales data approved successfully!');
    } catch (error) {
      alert('Failed to approve sales data. Please try again.');
    }
  };

  const handleRequestApproval = async () => {
    if (!editingId) return;
    const actualCash = parseFloat(formData.actualCashInHand) || 0;
    const offset = actualCash - expectedCashInHand;
    
    if (!confirm(`Request approval for cash discrepancy of ₹${Math.abs(offset).toFixed(2)}?\n\nThis will notify the cluster head for approval.`)) {
      return;
    }
    
    try {
      await context.requestSalesApproval(editingId, actualCash, offset);
      alert('Approval request sent successfully!');
    } catch (error) {
      alert('Failed to request approval. Please try again.');
    }
  };

  const handleApproveDiscrepancy = async (saleId: string) => {
    if (!confirm('Approve this discrepancy? The new cash amount will be accepted.')) {
      return;
    }
    try {
      await context.approveDiscrepancy(saleId);
      alert('Discrepancy approved successfully!');
    } catch (error) {
      alert('Failed to approve discrepancy. Please try again.');
    }
  };

  const handleRejectDiscrepancy = async (saleId: string) => {
    const reason = prompt('Please enter reason for rejection:');
    if (!reason) return;
    
    try {
      await context.rejectDiscrepancy(saleId, reason);
      alert('Discrepancy rejected. Manager must pay the difference.');
    } catch (error) {
      alert('Failed to reject discrepancy. Please try again.');
    }
  };

  const onlineSalesTotal = parseFloat(formData.onlineSales) || 0;
  const offlineSalesTotal = parseFloat(formData.offlineSales) || 0;
  const paytm = parseFloat(formData.paytmAmount) || 0;
  const cash = parseFloat(formData.cashAmount) || 0;
  const offlinePaymentTotal = paytm + cash;
  const paymentMismatch = Math.abs(offlineSalesTotal - offlinePaymentTotal) > 0.01;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Date Selector */}
      <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
      
      {/* Friday Weekly Reporting Reminder */}
      {isFriday && context.isManager && (
        <div className="mt-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-6 h-6 text-blue-600" />
            <h2 className="text-gray-900">Weekly Cash Reporting - Friday</h2>
          </div>
          <p className="text-gray-700 mb-3">
            Today is Friday! Please report the actual cash left with you after entering today's sales data.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-gray-700">
              <strong>Important:</strong> If the cash discrepancy exceeds ₹500, cluster head approval will be required before saving.
            </p>
          </div>
        </div>
      )}

      {/* Pending Approvals for Cluster Head */}
      {isClusterHead && (
        <div className="mt-6 space-y-4">
          {/* Discrepancy Approval Requests */}
          {context.salesData.filter(s => s.approvalRequested && !s.approvedBy && !s.rejectedBy).length > 0 && (
            <div className="bg-[#FFF4E6] border-2 border-[#FFE4C4] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                <h2 className="text-gray-900">Discrepancy Approval Requests</h2>
              </div>
              
              <div className="space-y-3">
                {context.salesData
                  .filter(s => s.approvalRequested && !s.approvedBy && !s.rejectedBy)
                  .map(sale => (
                    <div key={sale.id} className="bg-white rounded-lg p-4 border border-orange-300">
                      <div className="mb-3">
                        <p className="text-gray-900 font-medium">
                          {formatDateIST(sale.date)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Expected Cash: ₹{(sale.actualCashInHand - sale.cashOffset).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Requested Cash: ₹{(sale.requestedCashInHand || 0).toFixed(2)}
                        </p>
                        <p className="text-sm mt-1">
                          Discrepancy: <span className={(sale.requestedOffset || 0) > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {(sale.requestedOffset || 0) > 0 ? '+' : ''}₹{(sale.requestedOffset || 0).toFixed(2)}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveDiscrepancy(sale.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <CheckSquare className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectDiscrepancy(sale.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Regular Pending Approvals (Legacy) */}
          {context.salesData.filter(s => s.approvalRequired && !s.approvedBy && !s.approvalRequested).length > 0 && (
            <div className="bg-[#FFF4E6] border-2 border-[#FFE4C4] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-6 h-6 text-[#E8A87C]" />
                <h2 className="text-gray-900">Pending Approvals</h2>
              </div>
              
              <div className="space-y-3">
                {context.salesData
                  .filter(s => s.approvalRequired && !s.approvedBy && !s.approvalRequested)
                  .map(sale => (
                    <div key={sale.id} className="bg-white rounded-lg p-4 flex items-center justify-between border border-yellow-300">
                      <div>
                        <p className="text-gray-900">
                          {formatDateIST(sale.date)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Cash Discrepancy: <span className={sale.cashOffset > 0 ? 'text-green-600' : 'text-red-600'}>
                            {sale.cashOffset > 0 ? '+' : ''}₹{sale.cashOffset.toFixed(2)}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Expected: ₹{(sale.actualCashInHand - sale.cashOffset).toFixed(2)} | 
                          Actual: ₹{sale.actualCashInHand.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await context.approveSalesData(sale.id);
                            alert('Approved successfully!');
                          } catch (error) {
                            alert('Failed to approve');
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckSquare className="w-4 h-4" />
                        Approve
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* No pending approvals message */}
          {context.salesData.filter(s => (s.approvalRequired && !s.approvedBy) || (s.approvalRequested && !s.approvedBy && !s.rejectedBy)).length === 0 && (
            <div className="bg-[#FFF4E6] border-2 border-[#FFE4C4] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-6 h-6 text-[#E8A87C]" />
                <h2 className="text-gray-900">Pending Approvals</h2>
              </div>
              <p className="text-gray-600">No pending approvals at the moment.</p>
            </div>
          )}
        </div>
      )}

      {/* Pending Approvals for Operations Manager */}
      {isOperationsManager && (
        <div className="mt-6 space-y-4">
          {/* Sales Pending Approval */}
          {context.salesData.filter(s => s.approvalStatus === 'pending' && s.createdBy !== context.user?.employeeId).length > 0 && (
            <div className="bg-[#E8F5E9] border-2 border-[#A5D6A7] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-6 h-6 text-green-600" />
                <h2 className="text-gray-900">Sales Pending Approval</h2>
              </div>
              
              <div className="space-y-3">
                {context.salesData
                  .filter(s => s.approvalStatus === 'pending' && s.createdBy !== context.user?.employeeId)
                  .map(sale => (
                    <div key={sale.id} className="bg-white rounded-lg p-4 border border-green-300">
                      <div className="mb-3">
                        <p className="text-gray-900 font-medium">
                          {formatDateIST(sale.date)}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Submitted by: {sale.createdBy}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-600">Total Sales:</span>
                            <span className="ml-1 font-medium">₹{(sale.offlineSales + sale.onlineSales).toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Cash in Hand:</span>
                            <span className="ml-1 font-medium">₹{sale.actualCashInHand.toFixed(2)}</span>
                          </div>
                        </div>
                        {Math.abs(sale.cashOffset) > 0 && (
                          <p className="text-sm mt-1">
                            Cash Offset: <span className={sale.cashOffset > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {sale.cashOffset > 0 ? '+' : ''}₹{sale.cashOffset.toFixed(2)}
                            </span>
                          </p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm(`Approve sales data for ${formatDateIST(sale.date)}?`)) return;
                          try {
                            await context.approveSalesData(sale.id);
                            alert('Sales data approved successfully!');
                          } catch (error) {
                            alert('Failed to approve sales data');
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <CheckSquare className="w-4 h-4" />
                        Approve Sales Data
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* No pending sales message */}
          {context.salesData.filter(s => s.approvalStatus === 'pending' && s.createdBy !== context.user?.employeeId).length === 0 && (
            <div className="bg-[#E8F5E9] border-2 border-[#A5D6A7] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-6 h-6 text-green-600" />
                <h2 className="text-gray-900">Sales Pending Approval</h2>
              </div>
              <p className="text-gray-600">No pending sales at the moment.</p>
            </div>
          )}
        </div>
      )}

      {/* Operations Manager - Show if sales is pending approval */}
      {isOperationsManager && salesForDate && salesForDate.approvalStatus === 'pending' && (
        <div className="mt-6 bg-[#FFF9E6] border-2 border-[#FFD54F] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
            <h2 className="text-gray-900">Sales Pending Approval</h2>
          </div>
          <p className="text-gray-700">
            Your sales entry for {formatDateIST(salesForDate.date)} is awaiting approval from the Cluster Head.
          </p>
        </div>
      )}

      {/* Operations Manager - Show if sales is approved */}
      {isOperationsManager && salesForDate && salesForDate.approvalStatus === 'approved' && (
        <div className="mt-6 bg-[#E8F5E9] border-2 border-[#A5D6A7] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h2 className="text-gray-900">Sales Approved</h2>
          </div>
          <p className="text-gray-700">
            ✓ Your sales entry for {formatDateIST(salesForDate.date)} has been approved by {salesForDate.approvedBy}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Sales Entry Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="w-6 h-6 text-green-600" />
            <h2 className="text-gray-900">Sales Entry</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Offline Sales Section */}
            <div className="bg-gradient-to-br from-[#D4E6F1] to-[#AED6F1] rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#5499C7]" />
                Offline Sales
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Total Offline Sales (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.offlineSales}
                    onChange={(e) => setFormData({ ...formData, offlineSales: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                    disabled={!canEditSales}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Paytm (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.paytmAmount}
                      onChange={(e) => setFormData({ ...formData, paytmAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                      disabled={!canEditSales}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Cash (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.cashAmount}
                      onChange={(e) => setFormData({ ...formData, cashAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                      disabled={!canEditSales}
                    />
                  </div>
                </div>

                {paymentMismatch && (
                  <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm">
                    ⚠️ Payment mode total (₹{offlinePaymentTotal.toFixed(2)}) doesn't match offline sales (₹{offlineSalesTotal.toFixed(2)})
                  </div>
                )}

                {!paymentMismatch && offlineSalesTotal > 0 && (
                  <div className="bg-green-100 border border-green-300 text-green-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Payment modes match total sales
                  </div>
                )}
              </div>
            </div>

            {/* Online Sales Section */}
            <div className="bg-gradient-to-br from-[#FFE6CC] to-[#FFDAB9] rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#E8A87C]" />
                Online Sales
              </h3>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Total Online Sales (Zomato + Swiggy) (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.onlineSales}
                  onChange={(e) => setFormData({ ...formData, onlineSales: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                  disabled={!canEditSales}
                />
              </div>
            </div>

            {/* Used Online Money Section */}
            <div className="bg-gradient-to-br from-[#E0F2F7] to-[#B3E5FC] rounded-lg p-4">
              <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                <ArrowDownCircle className="w-5 h-5 text-[#4FC3F7]" />
                Used Online Money
              </h3>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Amount Used from Paytm ()</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.usedOnlineMoney}
                  onChange={(e) => setFormData({ ...formData, usedOnlineMoney: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  disabled={!canEditSales}
                />
                <p className="text-xs text-gray-500 mt-1">Enter amount if Paytm balance was used for expenses</p>
              </div>
            </div>

            {/* Contract Worker Payout Section */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  Contract Worker Payouts
                </h3>
                {context.isManager && (
                  <button
                    type="button"
                    onClick={handleAddContractWorker}
                    className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Worker
                  </button>
                )}
              </div>
              
              {loadingEmployees ? (
                <p className="text-sm text-gray-500">Loading workers...</p>
              ) : contractWorkers.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700">
                  <p>No contract workers found. Please add contract workers in the Payroll tab first.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contractPayouts.length === 0 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                      No payouts entered for today. Click "Add Worker" to record a payout.
                    </div>
                  ) : (
                    contractPayouts.map((payout, index) => {
                      const worker = contractWorkers.find(w => w.id === payout.employeeId);
                      return (
                        <div key={index} className="bg-white border border-purple-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 space-y-2">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Select Worker</label>
                                <select
                                  value={payout.employeeId}
                                  onChange={(e) => handleContractPayoutChange(index, 'employeeId', e.target.value)}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                                  disabled={!context.isManager}
                                  required
                                >
                                  <option value="">Choose a worker...</option>
                                  {contractWorkers.map(worker => (
                                    <option key={worker.id} value={worker.id}>
                                      {worker.name} ({worker.employeeId})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Amount Paid (₹)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={payout.amount}
                                  onChange={(e) => handleContractPayoutChange(index, 'amount', e.target.value)}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                                  placeholder={worker?.dailyRate ? `Suggested: ₹${worker.dailyRate}` : 'Enter amount'}
                                  disabled={!context.isManager}
                                  required
                                />
                                {worker?.dailyRate && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Daily rate: ₹{worker.dailyRate}
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {context.isManager && (
                              <button
                                type="button"
                                onClick={() => handleRemoveContractWorker(index)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors mt-5"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  
                  {contractPayouts.length > 0 && (
                    <div className="bg-purple-600 text-white rounded-lg p-3 flex justify-between items-center">
                      <span className="text-sm">Total Contract Payouts:</span>
                      <span className="text-lg">₹{totalContractPayout.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-3 bg-purple-50 p-2 rounded border border-purple-200">
                💡 <strong>Note:</strong> Payouts entered here will automatically sync with the Payroll page. For permanent employees, use the Payroll tab.
              </p>
              
              {totalContractPayout > 0 && (
                <p className="text-xs text-purple-700 mt-2 bg-purple-100 p-2 rounded border border-purple-300 flex items-center gap-1">
                  💰 <strong>Cash Impact:</strong> ₹{totalContractPayout.toFixed(2)} will be deducted from offline cash when calculating cash in hand.
                </p>
              )}
            </div>

            {/* Previous Cash Balance - Only show on day 1 or 1st of month */}
            {(isFirstDay || isFirstOfMonth) && (
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4">
                <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-amber-600" />
                  {isFirstDay ? 'Opening Cash Balance (Day 1)' : 'Cash Left from Previous Month'}
                </h3>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Cash Left (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.previousCashInHand}
                    onChange={(e) => setFormData({ ...formData, previousCashInHand: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    disabled={!canEditSales}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {isFirstDay 
                      ? 'Enter starting cash for the first day' 
                      : 'Enter cash left from previous month (after deducting all expenses and salaries)'
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Display auto-calculated cash left for other days */}
            {!isFirstDay && !isFirstOfMonth && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border-2 border-gray-300">
                <h3 className="text-gray-900 mb-2 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-gray-600" />
                  Cash Left from Previous Day (Auto-Calculated)
                </h3>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-2xl text-gray-900">₹{(parseFloat(formData.previousCashInHand) || 0).toFixed(2)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    💡 This is automatically calculated from previous day's cash left after deducting expenses and salaries.
                    {isFirstOfMonth && " You can edit this only on the 1st of the month."}
                  </p>
                </div>
              </div>
            )}

            {/* Cash Reconciliation */}
            {!isFirstDay && (
              <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4">
                <h3 className="text-gray-900 mb-4 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-teal-600" />
                  Cash Reconciliation
                </h3>
                
                <div className="space-y-3">
                  <div className="bg-white rounded-lg p-3 border border-teal-200">
                    <p className="text-sm text-gray-600">Expected Cash in Hand</p>
                    <p className="text-2xl text-gray-900">₹{expectedCashInHand.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Previous Cash: ₹{(parseFloat(formData.previousCashInHand) || 0).toFixed(2)} + 
                      Amount Used from Paytm: ₹{(parseFloat(formData.usedOnlineMoney) || 0).toFixed(2)} + 
                      Cash Received: ₹{cash.toFixed(2)} - 
                      Expenses: ₹{totalExpenses.toFixed(2)} - 
                      Contract Payouts: ₹{totalContractPayout.toFixed(2)}
                    </p>
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                        View expense breakdown
                      </summary>
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <p>Inventory Cost: ₹{context.inventory.filter(item => item.date === selectedDate).reduce((sum, item) => sum + item.totalCost, 0).toFixed(2)} ({context.inventory.filter(item => item.date === selectedDate).length} items)</p>
                        <p>Overhead Cost: ₹{context.overheads.filter(item => item.date === selectedDate).reduce((sum, item) => sum + item.amount, 0).toFixed(2)} ({context.overheads.filter(item => item.date === selectedDate).length} items)</p>
                        <p>Fixed Costs: ₹{context.fixedCosts.filter(item => item.date === selectedDate).reduce((sum, item) => sum + item.amount, 0).toFixed(2)} ({context.fixedCosts.filter(item => item.date === selectedDate).length} items)</p>
                        <p className="font-medium mt-1">Total: ₹{totalExpenses.toFixed(2)}</p>
                      </div>
                    </details>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Actual Cash in Hand (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.actualCashInHand}
                      onChange={(e) => setFormData({ ...formData, actualCashInHand: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                      disabled={!canEditSales}
                    />
                    <p className="text-xs text-gray-500 mt-1">Count and enter actual physical cash</p>
                  </div>

                  {formData.actualCashInHand && (
                    <div className={`rounded-lg p-3 border-2 ${
                      Math.abs(cashDiscrepancy) === 0 
                        ? 'bg-green-100 border-green-300' 
                        : needsApproval 
                        ? 'bg-red-100 border-red-300'
                        : 'bg-yellow-100 border-yellow-300'
                    }`}>
                      <p className="text-sm font-medium">
                        {Math.abs(cashDiscrepancy) === 0 ? (
                          <span className="text-green-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Perfect Match! No discrepancy.
                          </span>
                        ) : needsApproval ? (
                          <span className="text-red-700 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            High Discrepancy: {cashDiscrepancy > 0 ? '+' : ''}₹{cashDiscrepancy.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-yellow-700">
                            Small Offset: {cashDiscrepancy > 0 ? '+' : ''}₹{cashDiscrepancy.toFixed(2)}
                          </span>
                        )}
                      </p>
                      {needsApproval && !salesForDate?.approvedBy && !salesForDate?.approvalRequested && (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Exceeds ₹500 limit - Save first, then request cluster head approval
                        </p>
                      )}
                      {salesForDate?.approvalRequested && !salesForDate?.approvedBy && !salesForDate?.rejectedBy && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Approval pending from cluster head
                        </p>
                      )}
                      {salesForDate?.approvedBy && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <CheckSquare className="w-3 h-3" />
                          Approved by: {salesForDate.approvedBy}
                        </p>
                      )}
                      {salesForDate?.rejectedBy && (
                        <div className="text-xs text-red-600 mt-1">
                          <p className="flex items-center gap-1">
                            <X className="w-3 h-3" />
                            Rejected by: {salesForDate.rejectedBy}
                          </p>
                          {salesForDate.rejectionReason && (
                            <p className="mt-1 italic">Reason: {salesForDate.rejectionReason}</p>
                          )}
                          <p className="mt-1 font-medium">You must pay the discrepancy from your pocket.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {canEditSales && (
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={paymentMismatch || isSubmitting}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                  {isSubmitting ? 'Saving...' : isEditing ? 'Update Sales Data' : 'Save Sales Data'}
                </button>
                
                {/* Request Approval Button - Only show when editing with high discrepancy */}
                {isEditing && editingId && needsApproval && !salesForDate?.approvedBy && !salesForDate?.approvalRequested && (
                  <button
                    type="button"
                    onClick={handleRequestApproval}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    Request Approval from Cluster Head
                  </button>
                )}
                
                {/* Show if approval is pending */}
                {isEditing && salesForDate?.approvalRequested && !salesForDate?.approvedBy && !salesForDate?.rejectedBy && (
                  <div className="w-full px-6 py-3 bg-orange-100 border-2 border-orange-300 text-orange-800 rounded-lg text-center">
                    ⏳ Approval request sent - Waiting for cluster head response
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Summary Cards */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-[#B8E6B8] to-[#A3D9A5] rounded-xl shadow-lg p-6 text-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-6 h-6" />
              <p className="text-sm uppercase tracking-wide">Total Sales</p>
            </div>
            <p className="text-4xl">₹{(offlineSalesTotal + onlineSalesTotal).toLocaleString()}</p>
            <div className="mt-4 pt-4 border-t border-gray-700/20 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Offline Sales:</span>
                <span>₹{offlineSalesTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Online Sales:</span>
                <span>₹{onlineSalesTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#A8D8EA] to-[#93C5FD] rounded-xl shadow-lg p-6 text-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-6 h-6" />
              <p className="text-sm uppercase tracking-wide">Payment Breakdown</p>
            </div>
            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center">
                <span>Cash Received:</span>
                <span className="text-2xl">₹{cash.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Paytm Received:</span>
                <span className="text-2xl">₹{paytm.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-700/20">
                <span>Online Sales:</span>
                <span className="text-xl">₹{onlineSalesTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Expected vs Actual Cash */}
          {!isFirstDay && (
            <div className="bg-gradient-to-br from-[#D8B5FF] to-[#C7A7FF] rounded-xl shadow-lg p-6 text-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-6 h-6" />
                <p className="text-sm uppercase tracking-wide">Cash Status</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm">Expected Cash</p>
                  <p className="text-3xl">₹{expectedCashInHand.toFixed(2)}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    ₹{(parseFloat(formData.previousCashInHand) || 0).toFixed(2)} + 
                    ₹{(parseFloat(formData.usedOnlineMoney) || 0).toFixed(2)} + 
                    ₹{cash.toFixed(2)} - 
                    ₹{totalExpenses.toFixed(2)} - 
                    ₹{fixedCostsCash.toFixed(2)} - 
                    ₹{overheadCostsCash.toFixed(2)} - 
                    ₹{totalContractPayout.toFixed(2)}
                  </p>
                </div>
                {formData.actualCashInHand && (
                  <>
                    <div className="pt-3 border-t border-gray-700/20">
                      <p className="text-sm">Actual Cash</p>
                      <p className="text-3xl">₹{(parseFloat(formData.actualCashInHand) || 0).toFixed(2)}</p>
                    </div>
                    {Math.abs(cashDiscrepancy) > 0 && (
                      <div className="pt-3 border-t border-gray-700/20">
                        <p className="text-sm">Difference</p>
                        <p className={`text-2xl ${cashDiscrepancy > 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {cashDiscrepancy > 0 ? '+' : ''}₹{cashDiscrepancy.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Online Cash in Hand (Paytm) */}
          <div className="bg-gradient-to-br from-[#C7A7FF] to-[#B794F4] rounded-xl shadow-lg p-6 text-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-6 h-6" />
              <p className="text-sm uppercase tracking-wide">Online Cash in Hand (Paytm)</p>
            </div>
            <p className="text-4xl mb-4">₹{calculatePaytmBalance.toLocaleString()}</p>
            <div className="space-y-2 text-sm bg-gray-800/10 rounded-lg p-3">
              <div className="flex justify-between text-green-700">
                <span>Total Paytm Received:</span>
                <span>₹{context.salesData.filter(s => s.date <= selectedDate).reduce((sum, s) => sum + (s.paytmAmount ?? 0), 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-700">
                <span>- Total Used:</span>
                <span>₹{context.salesData.filter(s => s.date <= selectedDate).reduce((sum, s) => sum + (s.usedOnlineMoney ?? 0), 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-700">
                <span>- Fixed Costs (Online):</span>
                <span>₹{context.fixedCosts.filter(item => item.date <= selectedDate).reduce((sum, item) => {
                  if (item.paymentMethod === 'online') return sum + item.amount;
                  if (item.paymentMethod === 'both' && item.onlineAmount) return sum + item.onlineAmount;
                  return sum;
                }, 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-red-700">
                <span>- Overhead Costs (Online):</span>
                <span>₹{context.overheads.filter(item => item.date <= selectedDate).reduce((sum, item) => {
                  if (item.paymentMethod === 'online') return sum + item.amount;
                  if (item.paymentMethod === 'both' && item.onlineAmount) return sum + item.onlineAmount;
                  return sum;
                }, 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-700 pt-2 border-t border-gray-700/20">
                <span>Used Today:</span>
                <span>₹{(parseFloat(formData.usedOnlineMoney) || 0).toLocaleString()}</span>
              </div>
              {fixedCostsOnline > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Fixed Costs Today (Online):</span>
                  <span>₹{fixedCostsOnline.toLocaleString()}</span>
                </div>
              )}
              {overheadCostsOnline > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Overhead Costs Today (Online):</span>
                  <span>₹{overheadCostsOnline.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}