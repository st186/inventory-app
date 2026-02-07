import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, SalesData } from '../App';
import { DateSelector } from './DateSelector';
import { MonthlyCommissionEntry } from './MonthlyCommissionEntry';
import { OnlineCashRecalibration } from './OnlineCashRecalibration';
import { OnlineSalesTab } from './OnlineSalesTab';
import { ApplyLoanModal } from './ApplyLoanModal';
import { RepayLoanModal } from './RepayLoanModal';
import { DollarSign, TrendingUp, Wallet, Users, ShoppingBag, CheckCircle, Smartphone, ArrowDownCircle, AlertTriangle, CheckSquare, X, Plus, Loader2, Calendar, CreditCard, ArrowRightLeft } from 'lucide-react';
import * as api from '../utils/api';
import { getTodayIST, formatDateIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
};

export function SalesManagement({ context, selectedStoreId }: Props) {
  const [activeTab, setActiveTab] = useState<'offline' | 'online'>('offline');
  const [selectedDate, setSelectedDate] = useState<string>(
    getTodayIST()
  );
  
  // State for online payout data
  const [onlinePayoutData, setOnlinePayoutData] = useState<api.OnlinePayoutEntry[]>([]);
  const [isLoadingPayouts, setIsLoadingPayouts] = useState(false);
  
  // State for online sales data (to display in summary cards)
  const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
  const [isLoadingOnlineSales, setIsLoadingOnlineSales] = useState(false);

  // Helper function to identify commission entries
  // Commission entries are stored as overhead items with category 'service_charge' and description containing 'Aggregator Commission'
  // Legacy entries may have category 'commission'
  const isCommissionEntry = (item: any) => {
    return (
      (item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) ||
      item.category === 'commission' // Legacy format
    );
  };

  const [formData, setFormData] = useState({
    offlineSales: '',
    paytmAmount: '',
    cashAmount: '',
    employeeSalary: '',
    previousCashInHand: '',
    usedOnlineMoney: '',
    actualCashInHand: '',
    actualPaytmBalance: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [pendingSubmitEvent, setPendingSubmitEvent] = useState<React.FormEvent | null>(null);
  const [showPaytmBreakdown, setShowPaytmBreakdown] = useState(false);
  
  // Cash Conversion Modal State
  const [showCashConversion, setShowCashConversion] = useState(false);
  const [conversionAmount, setConversionAmount] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  
  // Load last online cash recalibration for the current month (kept for backward compatibility with old data)
  const [lastOnlineRecalibration, setLastOnlineRecalibration] = useState<any>(null);
  
  // Loan Management State
  const [onlineLoans, setOnlineLoans] = useState<api.OnlineLoan[]>([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);
  const [showApplyLoanModal, setShowApplyLoanModal] = useState(false);
  const [showRepayLoanModal, setShowRepayLoanModal] = useState(false);
  const [selectedLoanForRepayment, setSelectedLoanForRepayment] = useState<api.OnlineLoan | null>(null);
  
  const isClusterHead = context.user?.role === 'cluster_head';
  const isManager = context.user?.role === 'manager';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isOperationsManager = isManager && !isStoreIncharge && !isProductionIncharge; // Operations manager (not store/production incharge)
  const isShopManager = isStoreIncharge || isProductionIncharge; // Store or production incharge
  const canEditSales = isOperationsManager; // Only operations manager can enter/edit sales
  const canApproveSales = isOperationsManager || isClusterHead; // Operations manager and cluster head can approve
  
  // Use selectedStoreId prop (from store selector) OR fallback to user's storeId
  // This allows cluster heads to view data for any selected store
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  
  // Contract worker payout state
  const [contractWorkers, setContractWorkers] = useState<any[]>([]);
  const [contractPayouts, setContractPayouts] = useState<Array<{employeeId: string, amount: string}>>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  
  // Employee payouts data (for all employees - used in online cash calculation)
  const [employeePayouts, setEmployeePayouts] = useState<any[]>([]);

  // Load contract workers
  useEffect(() => {
    loadContractWorkers();
  }, []);
  
  // Load employee payouts (for online cash calculation)
  useEffect(() => {
    loadEmployeePayouts();
  }, [context.user]);
  
  const loadEmployeePayouts = async () => {
    if (!context.user?.accessToken) return;
    
    try {
      const payouts = await api.getPayouts();
      setEmployeePayouts(payouts);
    } catch (error) {
      console.error('Error loading employee payouts:', error);
    }
  };
  
  // Load online payout data
  useEffect(() => {
    loadOnlinePayoutData();
  }, [context.user]);
  
  const loadOnlinePayoutData = async () => {
    if (!context.user?.accessToken) return;
    
    setIsLoadingPayouts(true);
    try {
      const payouts = await api.getOnlinePayoutData(context.user.accessToken);
      setOnlinePayoutData(payouts);
    } catch (error) {
      console.error('Error loading online payout data:', error);
    } finally {
      setIsLoadingPayouts(false);
    }
  };
  
  // Load online sales data
  useEffect(() => {
    loadOnlineSalesData();
  }, [context.user]);
  
  const loadOnlineSalesData = async () => {
    if (!context.user?.accessToken) return;
    
    setIsLoadingOnlineSales(true);
    try {
      const sales = await api.getOnlineSalesData(context.user.accessToken);
      setOnlineSalesData(sales);
    } catch (error) {
      console.error('Error loading online sales data:', error);
    } finally {
      setIsLoadingOnlineSales(false);
    }
  };
  
  // Load online loans
  useEffect(() => {
    loadOnlineLoans();
  }, [context.user, effectiveStoreId]);
  
  const loadOnlineLoans = async () => {
    if (!context.user?.accessToken) return;
    
    setIsLoadingLoans(true);
    try {
      // For "All Stores" view, pass undefined to get all loans
      const storeIdParam = (!effectiveStoreId || effectiveStoreId === 'all') ? undefined : effectiveStoreId;
      const loans = await api.getOnlineLoans(context.user.accessToken, storeIdParam);
      setOnlineLoans(loans);
    } catch (error) {
      console.error('Error loading online loans:', error);
    } finally {
      setIsLoadingLoans(false);
    }
  };

  // Handle ESC key to close confirmation dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showConfirmDialog) {
        handleCancelDialog();
      }
    };

    if (showConfirmDialog) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showConfirmDialog]);

  // Load last online cash recalibration (kept for backward compatibility with old data)
  useEffect(() => {
    loadLastOnlineRecalibration();
  }, [context.user, effectiveStoreId]);

  const loadLastOnlineRecalibration = async () => {
    // For "All Stores" view, we don't use recalibration
    if (!effectiveStoreId || effectiveStoreId === 'all') {
      setLastOnlineRecalibration(null);
      return;
    }
    
    if (!context.user?.accessToken) {
      return;
    }
    
    try {
      const response = await api.getLastOnlineCashRecalibration(
        context.user.accessToken,
        effectiveStoreId
      );
      
      const lastRecalibration = response?.recalibration || null;
      setLastOnlineRecalibration(lastRecalibration);
    } catch (error) {
      console.error('Error loading online recalibration:', error);
    }
  };

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
  
  // Check if this is the last day (31st, 30th, 29th, or 28th) of the month
  const isLastDayOfMonth = useMemo(() => {
    const date = new Date(selectedDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    // Get the last day of the month
    const lastDay = new Date(year, month + 1, 0).getDate();
    return date.getDate() === lastDay;
  }, [selectedDate]);
  
  // Check if this is the first day of the month
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
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => sum + item.totalCost, 0);
    
    // Include ALL overhead costs (both cash and online/paytm) for the current store
    const allOverheadCosts = context.overheads
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => sum + item.amount, 0);
    
    // Include ALL fixed costs (both cash and online/paytm) for the current store
    const allFixedCosts = context.fixedCosts
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => sum + item.amount, 0);
    
    return inventoryCost + allOverheadCosts + allFixedCosts;
  }, [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId]);

  // Calculate fixed costs paid via cash (to deduct from Expected Cash in Hand)
  const fixedCostsCash = useMemo(() => {
    return context.fixedCosts
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => {
        if (item.paymentMethod === 'cash') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.cashAmount) {
          return sum + item.cashAmount;
        }
        return sum;
      }, 0);
  }, [context.fixedCosts, selectedDate, effectiveStoreId]);

  // Calculate fixed costs paid via online/Paytm (to deduct from Online Cash in Hand)
  const fixedCostsOnline = useMemo(() => {
    return context.fixedCosts
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
  }, [context.fixedCosts, selectedDate, effectiveStoreId]);

  // Calculate overhead costs paid via cash (to deduct from Expected Cash in Hand)
  const overheadCostsCash = useMemo(() => {
    return context.overheads
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => {
        if (item.paymentMethod === 'cash' || !item.paymentMethod) {
          // Default to cash if no payment method specified (backward compatibility)
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.cashAmount) {
          return sum + item.cashAmount;
        }
        return sum;
      }, 0);
  }, [context.overheads, selectedDate, effectiveStoreId]);

  // Calculate overhead costs paid via online/Paytm (to deduct from Online Cash in Hand)
  const overheadCostsOnline = useMemo(() => {
    return context.overheads
      .filter(item => {
        const dateMatch = item.date === selectedDate;
        const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
        return dateMatch && storeMatch;
      })
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
  }, [context.overheads, selectedDate, effectiveStoreId]);

  // Calculate expected closing cash balance
  const calculateCashInHand = (prevCash: number, cashReceived: number, expenses: number, paytmAmount: number, contractPayouts: number) => {
    // "Amount Used from Paytm" now INCLUDES contract payouts in the total
    // Contract payouts are withdrawn from Paytm (included in paytmAmount) and then paid out to employees
    // So: Expected Cash = prevCash + paytmAmount + cashReceived - expenses - contractPayouts
    return prevCash + paytmAmount + cashReceived - expenses - contractPayouts;
  };

  // Calculate expected cash for current form data
  const expectedCashInHand = useMemo(() => {
    const prevCash = parseFloat(formData.previousCashInHand) || 0;
    const cashReceived = parseFloat(formData.cashAmount) || 0;
    const paytmAmount = parseFloat(formData.usedOnlineMoney) || 0;
    return calculateCashInHand(prevCash, cashReceived, totalExpenses, paytmAmount, totalContractPayout);
  }, [formData.previousCashInHand, formData.cashAmount, totalExpenses, formData.usedOnlineMoney, totalContractPayout]);

  // Calculate cash discrepancy
  const cashDiscrepancy = useMemo(() => {
    const actual = parseFloat(formData.actualCashInHand) || 0;
    if (actual === 0) return 0;
    return actual - expectedCashInHand;
  }, [formData.actualCashInHand, expectedCashInHand]);

  const needsApproval = Math.abs(cashDiscrepancy) > 500; // Changed from 200 to 500

  // Calculate cumulative Paytm/Online balance from all days up to selected date
  const calculatePaytmBalance = useMemo(() => {
    // Check if there's a previous day's sales data with actualPaytmBalance
    const previousDate = new Date(selectedDate);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateStr = previousDate.toISOString().split('T')[0];
    
    const previousDaySales = effectiveStoreId 
      ? context.salesData.find(s => s.date === previousDateStr && s.storeId === effectiveStoreId)
      : context.salesData.find(s => s.date === previousDateStr);
    
    // If there's NO previous day data at all AND we're not on a recalibration date,
    // check if there's a recalibration for the exact previous day
    if (!previousDaySales) {
      // Check if there's a recalibration specifically for the previous day
      const previousDayRecalibration = context.onlineCashRecalibrations.find(
        r => r.date === previousDateStr && r.storeId === effectiveStoreId
      );
      
      // If no previous day data and no recalibration for previous day, return 0
      // This prevents carrying forward old balances when there's a data gap
      if (!previousDayRecalibration) {
        console.log('⚠️ No previous day data found. Starting from 0. Fill in previous day or create recalibration.');
        return 0;
      }
    }
    
    // If previous day has actualPaytmBalance, use it as starting point (like offline cash)
    if (previousDaySales && previousDaySales.actualPaytmBalance !== undefined && previousDaySales.actualPaytmBalance !== null) {
      // Start from previous day's actual balance
      const startingBalance = previousDaySales.actualPaytmBalance;
      
      // Add today's Paytm received
      const todaysPaytm = parseFloat(formData.paytmAmount) || 0;
      
      // Add today's Online Payouts (Swiggy + Zomato)
      const todaysOnlinePayouts = parseFloat(formData.onlineSales) || 0;
      
      // Subtract today's used online money
      const todaysUsedOnlineMoney = parseFloat(formData.usedOnlineMoney) || 0;
      
      // Subtract today's employee payouts (contract workers)
      const todaysEmployeePayouts = totalContractPayout;
      
      const finalBalance = startingBalance + todaysPaytm + todaysOnlinePayouts - todaysUsedOnlineMoney - todaysEmployeePayouts;
      
      console.log('📊 ONLINE CASH BALANCE (from previous day actual):', {
        effectiveStoreId,
        selectedDate,
        previousDate: previousDateStr,
        startingBalance,
        todaysPaytm,
        todaysOnlinePayouts,
        todaysUsedOnlineMoney,
        todaysEmployeePayouts,
        finalBalance
      });
      
      return finalBalance;
    }
    
    // Otherwise, calculate from recalibration (existing logic)
    // Check if there's a recalibration for the current month
    const selectedMonth = selectedDate.slice(0, 7); // "YYYY-MM"
    const hasRecalibrationThisMonth = lastOnlineRecalibration && lastOnlineRecalibration.month === selectedMonth;
    
    // Filter data by store
    const storeFilteredSales = effectiveStoreId 
      ? context.salesData.filter(s => s.storeId === effectiveStoreId)
      : context.salesData;
    const storeFilteredInventory = effectiveStoreId 
      ? context.inventory.filter(i => i.storeId === effectiveStoreId)
      : context.inventory;
    const storeFilteredOverhead = effectiveStoreId 
      ? context.overheads.filter(o => o.storeId === effectiveStoreId)
      : context.overheads;
    const storeFilteredFixed = effectiveStoreId 
      ? context.fixedCosts.filter(f => f.storeId === effectiveStoreId)
      : context.fixedCosts;
    
    // If there's a recalibration for this month, use it as the starting balance
    // and only calculate transactions AFTER the recalibration date
    const startDate = hasRecalibrationThisMonth ? lastOnlineRecalibration.date : '2000-01-01';
    const startingBalance = hasRecalibrationThisMonth ? lastOnlineRecalibration.actualBalance : 0;
    
    console.log('📊 ONLINE CASH BALANCE CALCULATION:', {
      effectiveStoreId,
      selectedDate,
      selectedMonth,
      hasRecalibration: hasRecalibrationThisMonth,
      recalibrationDate: hasRecalibrationThisMonth ? lastOnlineRecalibration.date : 'none',
      startingBalance,
      startDate,
      totalSalesRecords: context.salesData.length,
      filteredSalesRecords: storeFilteredSales.length,
      totalInventoryRecords: context.inventory.length,
      filteredInventoryRecords: storeFilteredInventory.length
    });
    
    // Get all historical Paytm received FROM recalibration date onwards and BEFORE today (not including today)
    const paytmTransactions = storeFilteredSales.filter(s => s.date >= startDate && s.date < selectedDate);
    const historicalPaytmReceived = paytmTransactions.reduce((sum, s) => sum + (s.paytmAmount ?? 0), 0);
    // Add today's form value
    const todaysPaytm = parseFloat(formData.paytmAmount) || 0;
    const allPaytmReceived = historicalPaytmReceived + todaysPaytm;
    
    console.log('💰 Paytm transactions included:', {
      count: paytmTransactions.length,
      historicalTransactions: paytmTransactions.map(s => ({ date: s.date, amount: s.paytmAmount })),
      historicalTotal: historicalPaytmReceived,
      todaysPaytm,
      totalIncludingToday: allPaytmReceived
    });
    
    // Get all Online Payouts (Swiggy + Zomato) FROM recalibration date onwards and BEFORE today (not including today)
    // This is what actually gets deposited into Online Cash in Hand (Paytm)
    const storeFilteredPayouts = effectiveStoreId 
      ? onlinePayoutData.filter(p => p.storeId === effectiveStoreId)
      : onlinePayoutData;
    
    const historicalOnlinePayoutTransactions = storeFilteredPayouts.filter(p => p.date >= startDate && p.date < selectedDate);
    const historicalOnlinePayouts = historicalOnlinePayoutTransactions.reduce((sum, p) => sum + (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0), 0);
    // Add today's form value
    const todaysOnlinePayouts = parseFloat(formData.onlineSales) || 0;
    const allOnlinePayouts = historicalOnlinePayouts + todaysOnlinePayouts;
    
    console.log('💰 Online payout transactions included:', {
      count: historicalOnlinePayoutTransactions.length,
      historicalTransactions: historicalOnlinePayoutTransactions.map(p => ({ 
        date: p.date, 
        swiggy: p.swiggyPayout, 
        zomato: p.zomatoPayout 
      })),
      historicalTotal: historicalOnlinePayouts,
      todaysOnlinePayouts,
      totalIncludingToday: allOnlinePayouts
    });
    
    // Recalculate all used online money from actual data FROM recalibration date onwards and BEFORE today (not including today)
    const allInventoryOnline = storeFilteredInventory
      .filter(i => i.date >= startDate && i.date < selectedDate)
      .reduce((sum, i) => {
        if (i.paymentMethod === 'online') return sum + i.totalCost;
        if (i.paymentMethod === 'both' && i.onlineAmount) return sum + i.onlineAmount;
        return sum;
      }, 0);
    
    const allOverheadOnline = storeFilteredOverhead
      .filter(o => o.date >= startDate && o.date < selectedDate && !isCommissionEntry(o))
      .reduce((sum, o) => {
        if (o.paymentMethod === 'online') return sum + o.amount;
        if (o.paymentMethod === 'both' && o.onlineAmount) return sum + o.onlineAmount;
        return sum;
      }, 0);
    
    const allFixedOnline = storeFilteredFixed
      .filter(f => f.date >= startDate && f.date < selectedDate)
      .reduce((sum, f) => {
        if (f.paymentMethod === 'online') return sum + f.amount;
        if (f.paymentMethod === 'both' && f.onlineAmount) return sum + f.onlineAmount;
        return sum;
      }, 0);
    
    // Calculate commission separately (FROM recalibration date onwards and BEFORE today, not including today)
    const allCommission = storeFilteredOverhead
      .filter(o => isCommissionEntry(o) && o.date >= startDate && o.date < selectedDate)
      .reduce((sum, o) => {
        const paymentMethod = o.paymentMethod || 'online';
        if (paymentMethod === 'online') return sum + (o.amount || 0);
        if (paymentMethod === 'both') return sum + (o.onlineAmount || 0);
        return sum;
      }, 0);
    
    const historicalUsedOnlineMoney = allInventoryOnline + allOverheadOnline + allFixedOnline;
    // Add today's form value
    const todaysUsedOnlineMoney = parseFloat(formData.usedOnlineMoney) || 0;
    const allUsedOnlineMoney = historicalUsedOnlineMoney + todaysUsedOnlineMoney;
    
    // Calculate loans FROM recalibration date onwards and BEFORE today (not including today)
    const storeFilteredLoans = effectiveStoreId 
      ? onlineLoans.filter(l => l.storeId === effectiveStoreId)
      : onlineLoans;
    
    // Loans received (adds to balance) - FROM recalibration date onwards and BEFORE today (not including today)
    const loansReceived = storeFilteredLoans
      .filter(l => l.loanDate >= startDate && l.loanDate < selectedDate)
      .reduce((sum, l) => sum + l.loanAmount, 0);
    
    // Loan repayments (reduces balance) - FROM recalibration date onwards and BEFORE today (not including today)
    // For loans that were taken AND fully/partially repaid in the period
    const loanRepayments = storeFilteredLoans
      .filter(l => {
        // Only include repayments made in the date range
        // If loan was taken before startDate, include all its repayments in range
        // If loan was taken in range, include repayments after loan date
        const loanStarted = l.loanDate < startDate ? startDate : l.loanDate;
        return l.repaidAmount > 0 && l.loanDate < selectedDate;
      })
      .reduce((sum, l) => {
        // If the loan was taken in this period, we need to calculate repayments carefully
        // For now, we include the full repaid amount if the loan was started before or in this period
        if (l.loanDate >= startDate && l.loanDate < selectedDate) {
          // Loan started in this period - include all repayments
          return sum + l.repaidAmount;
        } else if (l.loanDate < startDate) {
          // Loan started before this period - include full repaid amount
          // (This is a simplification - ideally we'd track each repayment date)
          return sum + l.repaidAmount;
        }
        return sum;
      }, 0);
    
    // Calculate balance: Starting Balance + Paytm Received + Online Payouts + Loans Received - Used - Commission - Loan Repayments - Employee Payouts
    
    // Get all employee payouts FROM recalibration date onwards and BEFORE today (not including today)
    const storeFilteredEmployeePayouts = effectiveStoreId 
      ? employeePayouts.filter(p => !p.storeId || p.storeId === effectiveStoreId) // Include payouts without storeId for backward compatibility
      : employeePayouts;
    
    const historicalEmployeePayouts = storeFilteredEmployeePayouts
      .filter(p => p.date >= startDate && p.date < selectedDate)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Add today's employee payouts (contract workers entered in form)
    const todaysEmployeePayouts = totalContractPayout;
    const allEmployeePayouts = historicalEmployeePayouts + todaysEmployeePayouts;
    
    const finalBalance = startingBalance + allPaytmReceived + allOnlinePayouts + loansReceived - allUsedOnlineMoney - allCommission - loanRepayments - allEmployeePayouts;
    
    console.log('📊 Balance breakdown:', {
      startingBalance,
      allPaytmReceived,
      allOnlinePayouts,
      loansReceived,
      allUsedOnlineMoney,
      allCommission,
      loanRepayments,
      allEmployeePayouts,
      finalBalance
    });
    
    return finalBalance;
  }, [context.salesData, context.inventory, context.overheads, context.fixedCosts, onlinePayoutData, onlineLoans, employeePayouts, totalContractPayout, selectedDate, effectiveStoreId, lastOnlineRecalibration, formData.paytmAmount, formData.onlineSales, formData.usedOnlineMoney]);

  // Calculate Paytm discrepancy (similar to cash discrepancy)
  const paytmDiscrepancy = useMemo(() => {
    const actual = parseFloat(formData.actualPaytmBalance) || 0;
    if (actual === 0) return 0;
    return actual - calculatePaytmBalance;
  }, [formData.actualPaytmBalance, calculatePaytmBalance]);
  
  const needsPaytmApproval = Math.abs(paytmDiscrepancy) > 500;

  // Calculate daily breakdown for Paytm/Online Cash
  const paytmDailyBreakdown = useMemo(() => {
    // Check if there's a recalibration for the current month
    const selectedMonth = selectedDate.slice(0, 7);
    const hasRecalibrationThisMonth = lastOnlineRecalibration && lastOnlineRecalibration.month === selectedMonth;
    const recalibrationDate = hasRecalibrationThisMonth ? lastOnlineRecalibration.date : '2000-01-01';
    
    // Always show from the 1st of the selected month for better visibility
    // But use recalibration for balance calculations
    const displayStartDate = `${selectedMonth}-01`;
    
    // Filter by store
    const storeFilteredSales = effectiveStoreId 
      ? context.salesData.filter(s => s.storeId === effectiveStoreId)
      : context.salesData;
    const storeFilteredFixed = effectiveStoreId 
      ? context.fixedCosts.filter(i => i.storeId === effectiveStoreId)
      : context.fixedCosts;
    const storeFilteredOverhead = effectiveStoreId 
      ? context.overheads.filter(i => i.storeId === effectiveStoreId)
      : context.overheads;
    const storeFilteredInventory = effectiveStoreId 
      ? context.inventory.filter(i => i.storeId === effectiveStoreId)
      : context.inventory;
    
    // Get all unique dates FROM display start date (1st of month) onwards, up to selected date
    const allDates = new Set<string>();
    
    storeFilteredSales
      .filter(s => s.date >= displayStartDate && s.date <= selectedDate)
      .forEach(s => allDates.add(s.date));
    
    storeFilteredFixed
      .filter(item => item.date >= displayStartDate && item.date <= selectedDate)
      .forEach(item => allDates.add(item.date));
    
    storeFilteredOverhead
      .filter(item => item.date >= displayStartDate && item.date <= selectedDate)
      .forEach(item => allDates.add(item.date));
    
    storeFilteredInventory
      .filter(item => item.date >= displayStartDate && item.date <= selectedDate)
      .forEach(item => allDates.add(item.date));
    
    // Add commission dates (commission entries identified by description pattern)
    storeFilteredOverhead
      .filter(item => isCommissionEntry(item) && item.date >= displayStartDate && item.date <= selectedDate)
      .forEach(item => allDates.add(item.date));
    
    // Add loan dates (loans taken add money to Paytm)
    const storeFilteredLoans = effectiveStoreId
      ? onlineLoans.filter(l => l.storeId === effectiveStoreId)
      : onlineLoans;
    
    storeFilteredLoans
      .filter(l => l.loanDate >= displayStartDate && l.loanDate <= selectedDate)
      .forEach(l => allDates.add(l.loanDate));
    
    // Add loan repayment dates (repayments deduct money from Paytm)
    storeFilteredLoans
      .filter(l => l.repaymentDate && l.repaymentDate >= displayStartDate && l.repaymentDate <= selectedDate)
      .forEach(l => allDates.add(l.repaymentDate!));
    
    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort();
    
    // Calculate running balance for each day
    // If there's a recalibration, we need to handle dates before and after it differently
    // For dates BEFORE recalibration: work backwards from recalibration balance
    // For dates ON/AFTER recalibration: work forwards from recalibration balance
    
    console.log('📊 Daily Breakdown Calculation:', {
      hasRecalibration: hasRecalibrationThisMonth,
      recalibrationDate,
      displayStartDate,
      numberOfDays: sortedDates.length
    });
    
    // First pass: calculate all daily changes
    const dailyData = sortedDates.map(date => {
      const salesForDay = storeFilteredSales.find(s => s.date === date);
      const paytmReceived = salesForDay?.paytmAmount ?? 0;
      
      // Use the "Amount Used from Paytm" field from sales form if it exists
      // Otherwise calculate from actual inventory/overhead/fixed cost entries
      const usedOnlineMoneyFromForm = salesForDay?.usedOnlineMoney ?? 0;
      
      // Calculate all costs paid via online/Paytm for this day
      const fixedCostsForDay = storeFilteredFixed
        .filter(item => item.date === date)
        .reduce((sum, item) => {
          // Handle legacy entries where paymentMethod might be undefined
          const paymentMethod = item.paymentMethod;
          if (paymentMethod === 'online') return sum + item.amount;
          if (paymentMethod === 'both' && item.onlineAmount) return sum + item.onlineAmount;
          return sum;
        }, 0);
      
      const overheadCostsForDay = storeFilteredOverhead
        .filter(item => item.date === date && !isCommissionEntry(item)) // Exclude commission from regular overheads
        .reduce((sum, item) => {
          // Handle legacy entries where paymentMethod might be undefined
          const paymentMethod = item.paymentMethod || 
            (item.description?.includes('Commission') ? 'online' : undefined);
          if (paymentMethod === 'online') return sum + item.amount;
          if (paymentMethod === 'both' && item.onlineAmount) return sum + item.onlineAmount;
          return sum;
        }, 0);
      
      // Calculate inventory costs paid via online/Paytm
      const inventoryForDay = storeFilteredInventory
        .filter(item => item.date === date)
        .reduce((sum, item) => {
          if (item.paymentMethod === 'online') return sum + item.totalCost;
          if (item.paymentMethod === 'both' && item.onlineAmount) return sum + item.onlineAmount;
          return sum;
        }, 0);
      
      // Check if there's a commission entry for this date (from overheads)
      // Sum all commissions for this date (in case there are multiple entries)
      // Commission is PAID via Paytm to aggregators (Swiggy/Zomato)
      // If payment method is 'both', only include the online portion
      const commission = storeFilteredOverhead
        .filter(item => isCommissionEntry(item) && item.date === date)
        .reduce((sum, item) => {
          // Handle legacy entries where paymentMethod might be undefined (assume 'online' for commission)
          const paymentMethod = item.paymentMethod || 'online';
          // For 'online' payment method, include full amount
          if (paymentMethod === 'online') return sum + (item.amount || 0);
          // For 'both' payment method, only include the online portion
          if (paymentMethod === 'both') return sum + (item.onlineAmount || 0);
          // For 'cash' payment method, don't include in online money
          return sum;
        }, 0);
      
      // TOTAL used online money:
      // If the sales form has a usedOnlineMoney value, use that (user manually entered it)
      // Otherwise calculate from inventory + overheads + fixed costs (EXCLUDING commission)
      // Commission is shown separately in its own column, so don't include it here
      const calculatedUsedOnlineMoney = inventoryForDay + overheadCostsForDay + fixedCostsForDay;
      const usedOnlineMoney = usedOnlineMoneyFromForm > 0 ? usedOnlineMoneyFromForm : calculatedUsedOnlineMoney;
      
      // Get online payouts for the day (what Swiggy/Zomato actually pay us)
      const storeFilteredPayouts = effectiveStoreId
        ? onlinePayoutData.filter(p => p.storeId === effectiveStoreId)
        : onlinePayoutData;
      
      const payoutForDay = storeFilteredPayouts.find(p => p.date === date);
      const onlinePayouts = payoutForDay 
        ? (payoutForDay.swiggyPayout ?? 0) + (payoutForDay.zomatoPayout ?? 0)
        : 0;
      
      // Get employee payouts for the day (paid from Online Cash in Hand)
      const storeFilteredEmployeePayouts = effectiveStoreId
        ? employeePayouts.filter(p => !p.storeId || p.storeId === effectiveStoreId) // Include payouts without storeId for backward compatibility
        : employeePayouts;
      
      const employeePayoutsForDay = storeFilteredEmployeePayouts
        .filter(p => p.date === date)
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      
      // Get loans taken on this day (adds money to Paytm)
      const loansForDay = storeFilteredLoans
        .filter(l => l.loanDate === date)
        .reduce((sum, l) => sum + l.loanAmount, 0);
      
      // Get loan repayments made on this day (reduces money from Paytm)
      // Note: Currently loans only store the total repaidAmount and last repaymentDate
      // So we show the full repaidAmount on the repaymentDate
      const repaymentForDay = storeFilteredLoans
        .filter(l => l.repaymentDate === date && l.repaidAmount > 0)
        .reduce((sum, l) => sum + l.repaidAmount, 0);
      
      // Net change = Paytm Received + Online Payouts + Loans Taken - Used - Commission - Employee Payouts - Loan Repayments
      // Commission, Employee Payouts, Loans, and Repayments are shown in their own columns
      const netChange = paytmReceived + onlinePayouts + loansForDay - usedOnlineMoney - commission - employeePayoutsForDay - repaymentForDay;
      
      return {
        date,
        paytmReceived,
        onlinePayouts, // Changed from onlineSales to onlinePayouts
        usedOnlineMoney,
        commission,
        employeePayouts: employeePayoutsForDay, // Add employee payouts to breakdown
        loansTaken: loansForDay, // Add loans taken
        loanRepayments: repaymentForDay, // Add loan repayments
        inventoryCosts: inventoryForDay,
        fixedCosts: fixedCostsForDay,
        overheadCosts: overheadCostsForDay,
        netChange,
        runningBalance: 0 // Will be calculated in second pass
      };
    });
    
    // Second pass: Calculate running balances
    console.log('💰 ===== CALCULATING RUNNING BALANCES =====');
    console.log('📊 Has recalibration this month?', hasRecalibrationThisMonth);
    console.log('📅 Recalibration date:', recalibrationDate);
    console.log('📊 Number of daily data entries:', dailyData.length);
    console.log('📊 Daily data dates:', dailyData.map(d => d.date));
    
    if (hasRecalibrationThisMonth) {
      // Find the recalibration date index
      const recalibrationIndex = dailyData.findIndex(d => d.date === recalibrationDate);
      
      console.log('🔍 Recalibration index in daily data:', recalibrationIndex);
      console.log('💰 Recalibration actual balance:', lastOnlineRecalibration.actualBalance);
      
      if (recalibrationIndex >= 0) {
        // Set the recalibration date's balance
        dailyData[recalibrationIndex].runningBalance = lastOnlineRecalibration.actualBalance;
        
        console.log(`✅ Set ${recalibrationDate} balance to ₹${lastOnlineRecalibration.actualBalance}`);
        
        // Calculate forwards from recalibration date
        console.log('➡️ Calculating FORWARD from recalibration date...');
        for (let i = recalibrationIndex + 1; i < dailyData.length; i++) {
          dailyData[i].runningBalance = dailyData[i - 1].runningBalance + dailyData[i].netChange;
          console.log(`  ${dailyData[i].date}: prev(${dailyData[i-1].runningBalance.toFixed(2)}) + net(${dailyData[i].netChange.toFixed(2)}) = ${dailyData[i].runningBalance.toFixed(2)}`);
        }
        
        // Calculate backwards from recalibration date
        console.log('⬅️ Calculating BACKWARD from recalibration date...');
        for (let i = recalibrationIndex - 1; i >= 0; i--) {
          dailyData[i].runningBalance = dailyData[i + 1].runningBalance - dailyData[i + 1].netChange;
          console.log(`  ${dailyData[i].date}: next(${dailyData[i+1].runningBalance.toFixed(2)}) - nextNet(${dailyData[i+1].netChange.toFixed(2)}) = ${dailyData[i].runningBalance.toFixed(2)}`);
        }
        
        console.log('✅ Final balances for all dates:');
        dailyData.forEach(d => {
          console.log(`  ${d.date}: ₹${d.runningBalance.toFixed(2)} (net change: ₹${d.netChange.toFixed(2)})`);
        });
      } else {
        console.log('⚠️ Recalibration date not found in daily data range!');
        console.log('⚠️ Starting from zero...');
        // Recalibration date not in range, start from beginning
        let balance = 0;
        dailyData.forEach(day => {
          balance += day.netChange;
          day.runningBalance = balance;
          console.log(`  ${day.date}: ₹${balance.toFixed(2)}`);
        });
      }
    } else {
      console.log('📊 No recalibration - calculating normally from zero');
      // No recalibration, calculate normally from start
      let balance = 0;
      dailyData.forEach(day => {
        balance += day.netChange;
        day.runningBalance = balance;
        console.log(`  ${day.date}: ₹${balance.toFixed(2)}`);
      });
    }
    console.log('💰 ===== END RUNNING BALANCE CALCULATION =====\n');
    
    return dailyData;
  }, [context.salesData, context.fixedCosts, context.overheads, context.inventory, onlinePayoutData, employeePayouts, onlineLoans, selectedDate, effectiveStoreId, lastOnlineRecalibration]);

  // Calculate total inventory purchases paid via online for the selected date
  const inventoryOnlineTotal = useMemo(() => {
    const total = context.inventory
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.totalCost;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
    console.log(`💰 Inventory Online Total for ${selectedDate}:`, total, 'items:', context.inventory.filter(item => item.date === selectedDate).map(i => ({name: i.itemName, payment: i.paymentMethod, total: i.totalCost})));
    return total;
  }, [context.inventory, selectedDate]);

  // Calculate total overhead costs paid via online for the selected date
  const overheadOnlineTotal = useMemo(() => {
    // Get all overheads for the selected date
    const dailyOverheads = context.overheads.filter(item => item.date === selectedDate);
    
    // Also check for monthly commission entries (they're stored on last day of month but apply to whole month)
    const selectedMonth = selectedDate.substring(0, 7); // e.g., "2026-01"
    
    // Debug logging
    const serviceCharges = context.overheads.filter(item => 
      item.category === 'service_charge' && item.date?.startsWith(selectedMonth)
    );
    console.log(`🔍 [OH] Month: ${selectedMonth}, Service charges:`, serviceCharges.length, serviceCharges.map(s => ({desc: s.description, amt: s.amount, payment: s.paymentMethod})));
    
    // Find ALL commission entries for this month (there might be duplicates from migration)
    const monthlyCommissions = context.overheads.filter(item =>
      ((item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) ||
       item.category === 'commission') && // Legacy format
      item.date?.startsWith(selectedMonth)
    );
    
    console.log(`🔍 [OH] Commission entries found:`, monthlyCommissions.length, monthlyCommissions.map(c => ({category: c.category, desc: c.description, amt: c.amount, payment: c.paymentMethod})));
    
    // Calculate total from daily overheads (EXCLUDING commission entries - they're handled separately)
    let total = dailyOverheads.reduce((sum, item) => {
      // SKIP commission entries - they should be handled separately as monthly prorated amounts
      const isCommission = item.category === 'commission' || 
        (item.category === 'service_charge' && item.description?.includes('Aggregator Commission'));
      
      if (isCommission) {
        console.log(`⏭️ [OH] Skipping commission in daily loop:`, {category: item.category, desc: item.description, amount: item.amount});
        return sum; // Skip this item
      }
      
      // Handle legacy entries where paymentMethod might be undefined
      const paymentMethod = item.paymentMethod || undefined;
      
      if (paymentMethod === 'online') {
        return sum + item.amount;
      } else if (paymentMethod === 'both' && item.onlineAmount) {
        return sum + item.onlineAmount;
      }
      return sum;
    }, 0);
    
    // Add FULL monthly commission ONLY on the last day of the month
    // Note: We skip commission entries in the dailyOverheads loop above, so we handle them here
    if (monthlyCommissions.length > 0) {
      const dateObj = new Date(selectedDate);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const dayOfMonth = dateObj.getDate();
      
      // Check if this is the LAST day of the month
      const isLastDayOfMonth = dayOfMonth === daysInMonth;
      
      if (isLastDayOfMonth) {
        // Sum up all commission amounts (handling duplicates if they exist)
        const totalMonthlyCommission = monthlyCommissions.reduce((sum, commission) => {
          const paymentMethod = commission.paymentMethod || 'online';
          if (paymentMethod === 'online') {
            return sum + commission.amount;
          } else if (paymentMethod === 'both' && commission.onlineAmount) {
            return sum + commission.onlineAmount;
          }
          return sum;
        }, 0);
        
        console.log(`💰 [OH] Adding FULL monthly commission (last day of month): ₹${totalMonthlyCommission.toFixed(2)} (entries: ${monthlyCommissions.length})`);
        total += totalMonthlyCommission;
      } else {
        console.log(`⏭️ [OH] Skipping commission (not last day): Day ${dayOfMonth}/${daysInMonth}`);
      }
    }
    
    console.log(`💰 Overhead Online Total for ${selectedDate}:`, total, 'items:', dailyOverheads.map(i => ({category: i.category, payment: i.paymentMethod, total: i.amount})), 'commissions:', monthlyCommissions.map(c => ({amount: c.amount, payment: c.paymentMethod, category: c.category})));
    return total;
  }, [context.overheads, selectedDate]);

  // Calculate total fixed costs paid via online for the selected date
  const fixedCostOnlineTotal = useMemo(() => {
    const total = context.fixedCosts
      .filter(item => item.date === selectedDate)
      .reduce((sum, item) => {
        if (item.paymentMethod === 'online') {
          return sum + item.amount;
        } else if (item.paymentMethod === 'both' && item.onlineAmount) {
          return sum + item.onlineAmount;
        }
        return sum;
      }, 0);
    console.log(`💰 Fixed Cost Online Total for ${selectedDate}:`, total, 'items:', context.fixedCosts.filter(item => item.date === selectedDate).map(i => ({category: i.category, payment: i.paymentMethod, total: i.amount})));
    return total;
  }, [context.fixedCosts, selectedDate]);

  // Calculate total online expenses (inventory + overhead + fixed costs + contract payouts)
  // Contract payouts are paid directly from Paytm and must be included in "Amount Used from Paytm"
  const totalOnlineExpenses = useMemo(() => {
    const total = inventoryOnlineTotal + overheadOnlineTotal + fixedCostOnlineTotal + totalContractPayout;
    console.log(`💳 TOTAL Online Expenses for ${selectedDate}:`, {
      inventory: inventoryOnlineTotal,
      overhead: overheadOnlineTotal,
      fixedCost: fixedCostOnlineTotal,
      contractPayouts: totalContractPayout,
      note: 'Contract payouts ARE included in Amount Used from Paytm',
      total: total
    });
    return total;
  }, [inventoryOnlineTotal, overheadOnlineTotal, fixedCostOnlineTotal, totalContractPayout, selectedDate]);

  // Daily online expenses breakdown object (for expense breakdown display)
  const dailyOnlineExpenses = useMemo(() => ({
    inventory: inventoryOnlineTotal,
    overhead: overheadOnlineTotal,
    fixedCost: fixedCostOnlineTotal,
    total: totalOnlineExpenses
  }), [inventoryOnlineTotal, overheadOnlineTotal, fixedCostOnlineTotal, totalOnlineExpenses]);

  // Load existing data when date changes
  useEffect(() => {
    if (salesForDate) {
      setFormData({
        offlineSales: (salesForDate.offlineSales ?? 0).toString(),
        paytmAmount: (salesForDate.paytmAmount ?? 0).toString(),
        cashAmount: (salesForDate.cashAmount ?? 0).toString(),
        employeeSalary: (salesForDate.employeeSalary ?? 0).toString(),
        previousCashInHand: (salesForDate.previousCashInHand ?? 0).toString(),
        usedOnlineMoney: totalOnlineExpenses.toString(), // Always use calculated value (includes contract payouts)
        actualCashInHand: (salesForDate.actualCashInHand ?? 0).toString(),
        actualPaytmBalance: (salesForDate.actualPaytmBalance ?? 0).toString()
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
        employeeSalary: '0',
        previousCashInHand: prevCash.toString(),
        usedOnlineMoney: totalOnlineExpenses.toString(), // Auto-populate from inventory + overhead + fixed costs
        actualCashInHand: '',
        actualPaytmBalance: ''
      });
      setIsEditing(false);
      setEditingId(null);
    }
  }, [selectedDate, salesForDate, previousDateSales, totalOnlineExpenses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔵 SAVE BUTTON CLICKED - Starting validation checks');
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log('📊 Form Data:', formData);
    console.log('💰 Financial Values:', {
      offlineSales: parseFloat(formData.offlineSales) || 0,
      paytmAmount: parseFloat(formData.paytmAmount) || 0,
      cashAmount: parseFloat(formData.cashAmount) || 0,
      previousCashInHand: parseFloat(formData.previousCashInHand) || 0,
      usedOnlineMoney: parseFloat(formData.usedOnlineMoney) || 0,
      actualCashInHand: parseFloat(formData.actualCashInHand) || 0,
      actualPaytmBalance: parseFloat(formData.actualPaytmBalance) || 0,
      expectedCashInHand,
      cashDiscrepancy: (parseFloat(formData.actualCashInHand) || 0) - expectedCashInHand,
      expectedPaytmBalance: calculatePaytmBalance,
      paytmDiscrepancy,
      onlineCashBalance: calculatePaytmBalance,
      totalContractPayout,
      totalExpenses,
      totalCombinedCash: expectedCashInHand + calculatePaytmBalance
    });
    
    console.log('🚦 Validation Flags:', {
      paymentMismatch,
      isSubmitting,
      canEditSales,
      isOperationsManager,
      isClusterHead,
      needsApproval,
      needsPaytmApproval,
      hasPermission: (canEditSales || isOperationsManager || isClusterHead)
    });
    
    console.log('🏪 Store Context:', {
      selectedStoreId,
      effectiveStoreId,
      userStoreId: context.user?.storeId,
      userRole: context.user?.role
    });
    
    console.log('👤 User Info:', {
      userId: context.user?.id,
      userEmail: context.user?.email,
      employeeId: context.user?.employeeId,
      role: context.user?.role
    });
    
    // Check if form is complete
    const isFormComplete = formData.offlineSales && formData.actualCashInHand && formData.actualPaytmBalance;
    console.log('📝 Form Completeness:', {
      hasOfflineSales: !!formData.offlineSales,
      hasActualCash: !!formData.actualCashInHand,
      hasActualPaytm: !!formData.actualPaytmBalance,
      isComplete: isFormComplete
    });
    
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('⚠️⚠️⚠️ BLOCKED: Submission already in progress');
      return;
    }
    
    // Check permissions
    if (!canEditSales && !isOperationsManager && !isClusterHead) {
      console.log('⚠️⚠️⚠️ BLOCKED: User does not have permission to save sales data');
      alert('You do not have permission to save sales data.');
      return;
    }
    
    // Check for negative values
    if (calculatePaytmBalance < 0) {
      console.log('⚠️ WARNING: Online Cash (Paytm) is NEGATIVE:', calculatePaytmBalance);
      console.log('💡 This might indicate insufficient funds in Paytm account');
    }
    
    const totalCombinedCash = expectedCashInHand + calculatePaytmBalance;
    if (totalCombinedCash < 0) {
      console.log('⚠️ WARNING: Total Combined Cash is NEGATIVE:', totalCombinedCash);
      console.log('💡 This indicates business is running at a loss or data entry issues');
    }
    
    // Show confirmation dialog before proceeding
    console.log('✅ All validation checks passed - Showing confirmation dialog...');
    setPendingSubmitEvent(e);
    setShowConfirmDialog(true);
    setConfirmationChecked(false);
  };

  const handleCancelDialog = () => {
    setShowConfirmDialog(false);
    setConfirmationChecked(false);
    setPendingSubmitEvent(null);
  };

  const handleConfirmSubmit = async () => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🟢 CONFIRMATION DIALOG - Submit Confirmed');
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log('✅ Confirmation checkbox checked:', confirmationChecked);
    
    if (!confirmationChecked) {
      console.log('⚠️⚠️⚠️ BLOCKED: Confirmation checkbox not checked');
      alert('⚠️ Please confirm that you take responsibility for this sales data.');
      return;
    }
    
    console.log('🔒 Closing dialog and setting submitting state...');
    setShowConfirmDialog(false);
    setIsSubmitting(true);

    const actualCash = parseFloat(formData.actualCashInHand) || 0;
    const offset = actualCash - expectedCashInHand;
    
    const actualPaytm = parseFloat(formData.actualPaytmBalance) || 0;
    const paytmOffset = actualPaytm - calculatePaytmBalance;
    
    console.log('💰 Cash calculation:', {
      actualCash,
      expectedCashInHand,
      offset,
      actualPaytm,
      expectedPaytmBalance: calculatePaytmBalance,
      paytmOffset,
      formData
    });

    // Operations manager entries need approval from cluster head if there's high discrepancy
    // Cluster head can directly approve their own entries
    const needsManagerApproval = isOperationsManager;
    
    // Don't block saving if discrepancy is high - allow requesting approval
    const salesData: Omit<SalesData, 'id'> = {
      date: selectedDate,
      offlineSales: parseFloat(formData.offlineSales) || 0,
      paytmAmount: parseFloat(formData.paytmAmount) || 0,
      cashAmount: parseFloat(formData.cashAmount) || 0,
      onlineSales: 0, // Online sales now tracked separately in Online Sales tab
      onlineSalesCommission: 0, // Commission now handled separately
      employeeSalary: totalContractPayout, // Store total contract payout (deducted from Online Cash, not offline cash)
      previousCashInHand: parseFloat(formData.previousCashInHand) || 0,
      usedOnlineMoney: parseFloat(formData.usedOnlineMoney) || 0,
      actualCashInHand: actualCash,
      cashOffset: offset,
      actualPaytmBalance: actualPaytm,
      paytmOffset: paytmOffset,
      // CRITICAL: Preserve the original salesDiscrepancy if it exists (locked at first settlement), otherwise set to current offset
      // This ensures that once a discrepancy is locked (either at initial settlement or after approval), it NEVER changes
      salesDiscrepancy: salesForDate?.salesDiscrepancy !== undefined 
        ? salesForDate.salesDiscrepancy 
        : offset,
      approvalRequired: needsApproval || needsPaytmApproval,
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
    
    console.log('📤 Saving sales data:', salesData);

    try {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('💾 STARTING SAVE PROCESS');
      console.log('═══════════════════════════════════════════════════════════════');
      
      // Save sales data
      console.log('🔄 Step 1: Calling save API...');
      console.log('📋 Sales data to save:', salesData);
      
      if (isEditing && editingId) {
        console.log('📝 Mode: UPDATING existing sales data');
        console.log('🆔 Editing ID:', editingId);
        console.log('⏱️ Calling context.updateSalesData...');
        await context.updateSalesData(editingId, salesData);
        console.log('✅ Update successful');
      } else {
        console.log('➕ Mode: ADDING new sales data');
        console.log('⏱️ Calling context.addSalesData...');
        await context.addSalesData(salesData);
        console.log('✅ Add successful');
      }
      
      console.log('─────────────────────────────────────────────────────────────');
      console.log('🔄 Step 2: Syncing contract worker payouts...');
      console.log('👷 Contract payouts count:', contractPayouts.length);
      console.log('👷 Contract payouts:', contractPayouts);
      
      // Sync contract worker payouts to payroll system
      if (contractPayouts.length > 0) {
        console.log('⏱️ Fetching all payouts to check for duplicates...');
        // First, get all payouts for this date to find and delete old ones
        const allPayouts = await api.getPayouts();
        console.log('📦 Total payouts in system:', allPayouts.length);
        
        const contractWorkerIds = contractWorkers.map(w => w.id);
        console.log('👤 Contract worker IDs:', contractWorkerIds);
        
        const existingPayoutsForDate = allPayouts.filter(p => 
          p.date === selectedDate && contractWorkerIds.includes(p.employeeId)
        );
        
        console.log('🗑️ Existing payouts for this date:', existingPayoutsForDate.length, existingPayoutsForDate);
        
        // Delete existing contract worker payouts for this date to avoid duplicates
        console.log('⏱️ Deleting old payouts...');
        for (const payout of existingPayoutsForDate) {
          console.log('🗑️ Deleting payout:', payout.id, payout);
          await api.deletePayout(payout.id);
          console.log('✅ Deleted old payout:', payout.id);
        }
        
        // Now save the new payouts
        console.log('⏱️ Preparing new payouts to save...');
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
              storeId: effectiveStoreId, // Add storeId for proper filtering in online cash calculation
              createdAt: new Date().toISOString()
            };
          });
        
        console.log('💾 Payouts to save:', payoutsToSave.length, payoutsToSave);
        
        if (payoutsToSave.length > 0) {
          console.log('⏱��� Saving payouts to API...');
          await api.addPayouts(payoutsToSave);
          console.log('✅ Contract worker payouts synced to payroll:', payoutsToSave);
        } else {
          console.log('⏭️ No valid payouts to save');
        }
      } else {
        console.log('⏭️ No contract payouts entered, checking for old ones to delete...');
        // If no payouts entered, delete any existing ones for this date
        const allPayouts = await api.getPayouts();
        console.log('📦 Total payouts in system:', allPayouts.length);
        
        const contractWorkerIds = contractWorkers.map(w => w.id);
        const existingPayoutsForDate = allPayouts.filter(p => 
          p.date === selectedDate && contractWorkerIds.includes(p.employeeId)
        );
        
        console.log('🗑️ Existing payouts for this date to delete:', existingPayoutsForDate.length);
        
        for (const payout of existingPayoutsForDate) {
          console.log('🗑️ Deleting payout:', payout.id);
          await api.deletePayout(payout.id);
          console.log('✅ Deleted payout (no workers entered):', payout.id);
        }
      }
      
      console.log('─────────────────────────────────────────────────────────────');
      console.log('🔄 Step 3: Reloading employee payouts...');
      await loadEmployeePayouts();
      console.log('✅ Employee payouts reloaded');
      
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('🎉 ALL SAVES COMPLETED SUCCESSFULLY!');
      console.log('═══════════════════════════════════════════════════════════════');
      alert('Sales data and contract worker payouts saved successfully!');
    } catch (error) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('❌ ERROR DURING SAVE PROCESS');
      console.log('═══════════════════════════════════════════════════════════════');
      console.error('💥 Error details:', error);
      console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('💥 Error message:', error instanceof Error ? error.message : String(error));
      alert('Failed to save sales data. Please try again.');
    } finally {
      console.log('🔓 Resetting isSubmitting to false');
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
    const actualPaytm = parseFloat(formData.actualPaytmBalance) || 0;
    const paytmOffset = actualPaytm - calculatePaytmBalance;
    
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

  const handleCashConversion = async () => {
    const amount = parseFloat(conversionAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid amount to convert');
      return;
    }

    const maxConvertible = expectedCashInHand;
    if (amount > maxConvertible) {
      alert(`Cannot convert more than ₹${maxConvertible.toFixed(2)} (your current expected cash in hand)`);
      return;
    }

    if (!confirm(`Convert ₹${amount.toFixed(2)} from Offline Cash to Online Cash (Paytm)?\n\nExpected Cash: ₹${expectedCashInHand.toFixed(2)} → ₹${(expectedCashInHand - amount).toFixed(2)}\nOnline Cash: ₹${calculatePaytmBalance.toFixed(2)} → ₹${(calculatePaytmBalance + amount).toFixed(2)}`)) {
      return;
    }

    setIsConverting(true);
    try {
      await api.convertCashToOnline(
        context.user!.accessToken,
        effectiveStoreId!,
        selectedDate,
        amount,
        context.user?.name || context.user?.email || 'Unknown User'
      );
      
      // Refresh the data
      await context.loadSalesData();
      
      setShowCashConversion(false);
      setConversionAmount('');
      alert('Cash converted successfully!');
    } catch (error: any) {
      console.error('Error converting cash:', error);
      alert(error.message || 'Failed to convert cash. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  // Calculate online sales total from actual online sales data
  const onlineSalesTotal = useMemo(() => {
    const filtered = effectiveStoreId
      ? onlineSalesData.filter(s => s.storeId === effectiveStoreId)
      : onlineSalesData;
    const salesForDate = filtered.find(s => s.date === selectedDate);
    if (!salesForDate) return 0;
    return (salesForDate.swiggySales || 0) + (salesForDate.zomatoSales || 0);
  }, [onlineSalesData, selectedDate, effectiveStoreId]);
  
  const offlineSalesTotal = parseFloat(formData.offlineSales) || 0;
  const paytm = parseFloat(formData.paytmAmount) || 0;
  const cash = parseFloat(formData.cashAmount) || 0;
  const offlinePaymentTotal = paytm + cash;
  const paymentMismatch = Math.abs(offlineSalesTotal - offlinePaymentTotal) > 0.01;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/30 to-pink-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Date Selector */}
        <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
      
      {/* Tabs for Offline and Online Sales */}
      <div className="flex gap-3 mb-6 mt-4 bg-white/50 backdrop-blur-sm p-1.5 rounded-2xl border border-purple-200/50">
        <button
          onClick={() => setActiveTab('offline')}
          className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'offline'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-white/80'
          }`}
        >
          <ShoppingBag className="inline-block w-4 h-4 mr-2" />
          Offline Sales
        </button>
        <button
          onClick={() => setActiveTab('online')}
          className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'online'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-white/80'
          }`}
        >
          <Smartphone className="inline-block w-4 h-4 mr-2" />
          Online Sales (Swiggy/Zomato)
        </button>
      </div>

      {/* Show Online Sales Tab */}
      {activeTab === 'online' && (
        <OnlineSalesTab 
          context={context}
          selectedStoreId={selectedStoreId}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onDataUpdate={loadOnlineSalesData}
        />
      )}

      {/* Show Offline Sales Tab (existing content) */}
      {activeTab === 'offline' && (
        <>
      
      {/* Friday Weekly Reporting Reminder */}
      {isFriday && context.isManager && (
        <div className="mt-6 bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm border border-blue-300/50 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Weekly Cash Reporting - Friday</h2>
          </div>
          <p className="text-sm text-gray-700 mb-3">
            Today is Friday! Please report the actual cash left with you after entering today's sales data.
          </p>
          <div className="bg-blue-50/70 border border-blue-200/50 rounded-xl p-3 text-xs">
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
            <div className="bg-gradient-to-br from-orange-50/80 to-orange-100/50 backdrop-blur-sm border border-orange-300/50 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                <h2 className="text-sm font-semibold text-gray-900">Discrepancy Approval Requests</h2>
              </div>
              
              <div className="space-y-3">
                {context.salesData
                  .filter(s => s.approvalRequested && !s.approvedBy && !s.rejectedBy)
                  .map(sale => (
                    <div key={sale.id} className="bg-white/80 rounded-xl p-4 border border-orange-300/50 shadow-sm">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatDateIST(sale.date)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Expected Cash: ₹{(sale.actualCashInHand - sale.cashOffset).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Actual Cash: ₹{sale.requestedCashInHand?.toFixed(2)}
                        </p>
                        <p className="text-xs font-semibold text-orange-600 mt-1">
                          Discrepancy: ₹{((sale.requestedCashInHand || 0) - (sale.actualCashInHand - sale.cashOffset)).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveDiscrepancy(sale.id)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-semibold transition-all text-sm shadow-sm"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleRejectDiscrepancy(sale.id)}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold transition-all text-sm shadow-sm"
                        >
                          ✗ Reject
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
                            alert('Failed to approve. Please try again.');
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold transition-all"
                      >
                        ✓ Approve
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approved Sales Message */}
      {salesForDate && salesForDate.approvedBy && (
        <div className="mt-6 bg-gradient-to-br from-green-50/80 to-green-100/50 backdrop-blur-sm border border-green-300/50 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Sales Approved</h2>
          </div>
          <p className="text-sm text-gray-700">
            ✓ Your sales entry for {formatDateIST(salesForDate.date)} has been approved by {salesForDate.approvedBy}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        {/* Sales Entry Form */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-800">Sales Entry</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Offline Sales Section */}
            <div className="bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm rounded-2xl p-5 border border-blue-200/50 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <ShoppingBag className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Offline Sales</h3>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Total Offline Sales (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.offlineSales}
                  onChange={(e) => setFormData({ ...formData, offlineSales: e.target.value })}
                  className="w-full px-4 py-3 border border-blue-200 bg-white/70 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                  required
                  disabled={!canEditSales}
                  placeholder="4155"
                />
              </div>
            </div>

            {/* Payment Mode Distribution */}
            <div className="bg-gradient-to-br from-amber-50/80 to-orange-100/50 backdrop-blur-sm rounded-2xl p-5 border border-orange-200/50 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <CreditCard className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Payment Mode Distribution</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white/70 p-3 rounded-xl border border-orange-200/50">
                  <label className="block text-xs font-medium text-gray-600 mb-2">Paytm (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paytmAmount}
                    onChange={(e) => setFormData({ ...formData, paytmAmount: e.target.value })}
                    className="w-full px-2 py-1 border-0 bg-transparent text-base font-semibold focus:ring-0 focus:outline-none"
                    required
                    disabled={!canEditSales}
                    placeholder="2025"
                  />
                </div>
                
                <div className="bg-white/70 p-3 rounded-xl border border-orange-200/50">
                  <label className="block text-xs font-medium text-gray-600 mb-2">Cash (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cashAmount}
                    onChange={(e) => setFormData({ ...formData, cashAmount: e.target.value })}
                    className="w-full px-2 py-1 border-0 bg-transparent text-base font-semibold focus:ring-0 focus:outline-none"
                    required
                    disabled={!canEditSales}
                    placeholder="2130"
                  />
                </div>
              </div>

              {paymentMismatch && (
                <div className="bg-red-100/80 border border-red-300/50 text-red-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Payment mode total (₹{offlinePaymentTotal.toFixed(2)}) doesn't match offline sales (₹{offlineSalesTotal.toFixed(2)})
                </div>
              )}

              {!paymentMismatch && offlineSalesTotal > 0 && (
                <div className="bg-green-100/80 border border-green-300/50 text-green-700 px-3 py-2 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="text-xs">✓ Payment modes match total sales</span>
                </div>
              )}
            </div>

            {/* Contract Worker Payout Section */}
            <div className="bg-gradient-to-br from-purple-50/80 to-purple-100/50 backdrop-blur-sm rounded-2xl p-5 border border-purple-200/50 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700">Contract Worker Payouts</h3>
                </div>
                {context.isManager && (
                  <button
                    type="button"
                    onClick={handleAddContractWorker}
                    className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-medium shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Worker
                  </button>
                )}
              </div>
              
              <div className="bg-blue-50/70 border border-blue-200/50 rounded-xl p-3 mb-3 text-xs text-blue-800">
                <p className="flex items-center gap-2">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>💡 Employee payouts are deducted from <strong>Online Cash in Hand (Paytm)</strong>, not from Expected Cash.</span>
                </p>
              </div>
              
              {loadingEmployees ? (
                <p className="text-sm text-gray-500">Loading workers...</p>
              ) : contractWorkers.length === 0 ? (
                <div className="bg-yellow-50/70 border border-yellow-200/50 rounded-xl p-3 text-xs text-gray-700">
                  <p>No contract workers found. Please add contract workers in the Payroll tab first.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {contractPayouts.length === 0 ? (
                    <div className="bg-white/70 border border-gray-200/50 rounded-xl p-3 text-xs text-gray-600">
                      No payouts entered for today. Click "Add Worker" to record a payout.
                    </div>
                  ) : (
                    contractPayouts.map((payout, index) => {
                      const worker = contractWorkers.find(w => w.id === payout.employeeId);
                      return (
                        <div key={index} className="bg-white/70 border border-purple-200/50 rounded-xl p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Select Worker</label>
                                <select
                                  value={payout.employeeId}
                                  onChange={(e) => handleContractPayoutChange(index, 'employeeId', e.target.value)}
                                  className="w-full px-3 py-2 border border-purple-200 bg-white rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
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
                                <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid (₹)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={payout.amount}
                                  onChange={(e) => handleContractPayoutChange(index, 'amount', e.target.value)}
                                  className="w-full px-3 py-2 border border-purple-200 bg-white rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
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
                    <div className="bg-purple-600 text-white rounded-xl p-3 flex justify-between items-center shadow-sm">
                      <span className="text-xs font-medium">Total Contract Payouts:</span>
                      <span className="text-lg font-bold">₹{totalContractPayout.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              
              <p className="text-xs text-gray-500 mt-3 bg-purple-50/70 p-2 rounded-xl border border-purple-200/50">
                💡 <strong>Note:</strong> Payouts entered here will automatically sync with the Payroll page. For permanent employees, use the Payroll tab.
              </p>
              
              {totalContractPayout > 0 && (
                <p className="text-xs text-purple-700 mt-2 bg-purple-100/70 p-2 rounded-xl border border-purple-300/50 flex items-center gap-1">
                  💰 <strong>Cash Impact:</strong> ₹{totalContractPayout.toFixed(2)} will be deducted from Online Cash in Hand (Paytm).
                </p>
              )}
            </div>

            {/* Used Online Money Section */}
            <div className="bg-gradient-to-br from-cyan-50/80 to-cyan-100/50 backdrop-blur-sm rounded-2xl p-5 border border-cyan-200/50 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-cyan-500/10 rounded-lg">
                  <ArrowDownCircle className="w-5 h-5 text-cyan-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Used Online Money</h3>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Amount Used from Paytm (₹)
                  {totalOnlineExpenses > 0 && (
                    <span className="ml-2 text-xs bg-blue-100/70 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200/50">
                      Auto: ₹{inventoryOnlineTotal.toFixed(2)}(Inv) + ₹{overheadOnlineTotal.toFixed(2)}(OH) + ₹{fixedCostOnlineTotal.toFixed(2)}(FC) + ₹{totalContractPayout.toFixed(2)}(CP)
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.usedOnlineMoney}
                  onChange={(e) => setFormData({ ...formData, usedOnlineMoney: e.target.value })}
                  className="w-full px-4 py-3 border border-cyan-200 bg-white/70 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                  required
                  disabled={!canEditSales}
                />
              </div>
            </div>

            {/* Previous Cash Balance - Only show on day 1 or 1st of month */}
            {(isFirstDay || isFirstOfMonth) && (
              <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/50 backdrop-blur-sm rounded-2xl p-5 border border-amber-200/50 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Wallet className="w-5 h-5 text-amber-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700">{isFirstDay ? 'Opening Cash Balance (Day 1)' : 'Cash Left from Previous Month'}</h3>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Cash Left (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.previousCashInHand}
                    onChange={(e) => setFormData({ ...formData, previousCashInHand: e.target.value })}
                    className="w-full px-4 py-3 border border-amber-200 bg-white/70 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
                    disabled={!canEditSales}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {isFirstDay 
                      ? 'Enter starting cash for the first day' 
                      : 'Enter cash left from previous month (after deducting all expenses and salaries)'}
                  </p>
                </div>
              </div>
            )}

            {/* Display auto-calculated cash left for other days */}
            {!isFirstDay && !isFirstOfMonth && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Offline Cash Left */}
                <div className="bg-gradient-to-br from-gray-50/80 to-gray-100/50 backdrop-blur-sm rounded-2xl p-5 border border-gray-200/50 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-gray-500/10 rounded-lg">
                      <Wallet className="w-5 h-5 text-gray-600" />
                    </div>
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Offline Cash Left from Previous Day</h3>
                  </div>
                  <div className="bg-white/70 rounded-xl p-4 border border-gray-200/50">
                    <p className="text-3xl font-bold text-gray-900">₹{(parseFloat(formData.previousCashInHand) || 0).toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                      <span className="text-yellow-500">💡</span>
                      <span>Auto-calculated from previous day's offline cash left after deducting expenses (not including employee payouts).</span>
                    </p>
                  </div>
                </div>

                {/* Online Cash (Paytm) Left */}
                <div className="bg-gradient-to-br from-purple-50/80 to-pink-100/50 backdrop-blur-sm rounded-2xl p-5 border border-purple-200/50 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Wallet className="w-5 h-5 text-purple-600" />
                    </div>
                    <h3 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Online Cash (Paytm) Left from Previous Day</h3>
                  </div>
                  <div className="bg-white/70 rounded-xl p-4 border border-purple-200/50">
                    <p className="text-3xl font-bold text-gray-900">₹{(() => {
                      const previousDate = new Date(selectedDate);
                      previousDate.setDate(previousDate.getDate() - 1);
                      const previousDateStr = previousDate.toISOString().split('T')[0];
                      
                      const previousDaySales = effectiveStoreId 
                        ? context.salesData.find(s => s.date === previousDateStr && s.storeId === effectiveStoreId)
                        : context.salesData.find(s => s.date === previousDateStr);
                      
                      if (previousDaySales && previousDaySales.actualPaytmBalance !== undefined && previousDaySales.actualPaytmBalance !== null) {
                        return previousDaySales.actualPaytmBalance.toFixed(2);
                      }
                      
                      // If no previous day data, check if there's a recalibration for the previous day
                      if (!previousDaySales) {
                        const previousDayRecalibration = context.onlineCashRecalibrations.find(
                          r => r.date === previousDateStr && r.storeId === effectiveStoreId
                        );
                        
                        // If no data and no recalibration for previous day, return 0
                        if (!previousDayRecalibration) {
                          return '0.00';
                        }
                      }
                      
                      const latestRecalibration = context.onlineCashRecalibrations
                        .filter(r => r.storeId === effectiveStoreId && r.date < selectedDate)
                        .sort((a, b) => b.date.localeCompare(a.date))[0];
                      
                      if (!latestRecalibration) return '0.00';
                      
                      const startDate = latestRecalibration.date;
                      
                      const relevantSales = context.salesData.filter(s => 
                        (effectiveStoreId ? s.storeId === effectiveStoreId : true) &&
                        s.date > startDate && s.date < selectedDate
                      );
                      
                      const totalPaytm = relevantSales.reduce((sum, s) => sum + (s.paytmAmount || 0), 0);
                      const totalOnline = relevantSales.reduce((sum, s) => sum + (s.onlineSales || 0), 0);
                      const totalUsedOnline = relevantSales.reduce((sum, s) => sum + (s.usedOnlineMoney || 0), 0);
                      const totalEmployeePayouts = relevantSales.reduce((sum, s) => sum + (s.contractPayouts?.reduce((pSum, p) => pSum + p.amount, 0) || 0), 0);
                      
                      return (latestRecalibration.balance + totalPaytm + totalOnline - totalUsedOnline - totalEmployeePayouts).toFixed(2);
                    })()}</p>
                    <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                      <span className="text-yellow-500">💡</span>
                      <span>Auto-calculated from previous day's Paytm balance after accounting for online sales, expenses, and payouts.</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Cash Reconciliation Section */}
            <div className="bg-gradient-to-br from-teal-50/80 to-teal-100/50 backdrop-blur-sm rounded-2xl p-5 border border-teal-200/50 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-teal-500/10 rounded-lg">
                  <Wallet className="w-5 h-5 text-teal-600" />
                </div>
                <h3 className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Cash Status</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Expected Cash</label>
                  <div className="bg-white/70 rounded-xl p-4 border border-teal-200/50">
                    <p className="text-4xl font-bold text-gray-900">₹{expectedCashInHand.toFixed(2)}</p>
                    <details className="mt-2">
                      <summary className="text-xs text-blue-600 cursor-pointer hover:underline flex items-center gap-1">
                        ▸ View expense breakdown (all expenses incl. commission)
                      </summary>
                    <div className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border border-teal-200">
                      <p className="font-semibold text-teal-700 mb-1">Inventory Cost:</p>
                      <p className="ml-2">₹{(() => {
                        // Only count CASH inventory items, not ALL inventory
                        const cashInventory = context.inventory.filter(item => {
                          const dateMatch = item.date === selectedDate;
                          const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
                          return dateMatch && storeMatch;
                        }).reduce((sum, item) => {
                          if (item.paymentMethod === 'cash' || !item.paymentMethod) {
                            return sum + item.totalCost;
                          } else if (item.paymentMethod === 'both' && item.cashAmount) {
                            return sum + item.cashAmount;
                          }
                          return sum;
                        }, 0);
                        return (cashInventory + dailyOnlineExpenses.inventory).toFixed(2);
                      })()} (cash: ₹{(() => {
                        const cashInventory = context.inventory.filter(item => {
                          const dateMatch = item.date === selectedDate;
                          const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
                          return dateMatch && storeMatch;
                        }).reduce((sum, item) => {
                          if (item.paymentMethod === 'cash' || !item.paymentMethod) {
                            return sum + item.totalCost;
                          } else if (item.paymentMethod === 'both' && item.cashAmount) {
                            return sum + item.cashAmount;
                          }
                          return sum;
                        }, 0);
                        return cashInventory.toFixed(2);
                      })()}, online: ₹{dailyOnlineExpenses.inventory.toFixed(2)})</p>
                      
                      <p className="font-semibold text-teal-700 mt-2 mb-1">Overhead Cost:</p>
                      <p className="ml-2">₹{(() => {
                        // Only count CASH overheads, not ALL overheads
                        const cashOverheads = context.overheads.filter(item => {
                          const dateMatch = item.date === selectedDate;
                          const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
                          return dateMatch && storeMatch;
                        }).reduce((sum, item) => {
                          if (item.paymentMethod === 'cash' || !item.paymentMethod) {
                            return sum + item.amount;
                          } else if (item.paymentMethod === 'both' && item.cashAmount) {
                            return sum + item.cashAmount;
                          }
                          return sum;
                        }, 0);
                        return (cashOverheads + dailyOnlineExpenses.overhead).toFixed(2);
                      })()} (cash: ₹{(() => {
                        const cashOverheads = context.overheads.filter(item => {
                          const dateMatch = item.date === selectedDate;
                          const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
                          return dateMatch && storeMatch;
                        }).reduce((sum, item) => {
                          if (item.paymentMethod === 'cash' || !item.paymentMethod) {
                            return sum + item.amount;
                          } else if (item.paymentMethod === 'both' && item.cashAmount) {
                            return sum + item.cashAmount;
                          }
                          return sum;
                        }, 0);
                        return cashOverheads.toFixed(2);
                      })()}, online: ₹{dailyOnlineExpenses.overhead.toFixed(2)})</p>
                      
                      <p className="font-semibold text-teal-700 mt-2 mb-1">Fixed Costs:</p>
                      <p className="ml-2">₹{(() => {
                        // Only count CASH fixed costs, not ALL fixed costs
                        const cashFixed = context.fixedCosts.filter(item => {
                          const dateMatch = item.date === selectedDate;
                          const storeMatch = effectiveStoreId ? item.storeId === effectiveStoreId : true;
                          return dateMatch && storeMatch;
                        }).reduce((sum, item) => {
                          if (item.paymentMethod === 'cash' || !item.paymentMethod) {
                            return sum + item.amount;
                          } else if (item.paymentMethod === 'both' && item.cashAmount) {
                            return sum + item.cashAmount;
                          }
                          return sum;
                        }, 0);
                        return (cashFixed + dailyOnlineExpenses.fixedCost).toFixed(2);
                      })()} (cash + online)</p>
                      
                      <p className="font-semibold text-teal-700 mt-2 mb-1">Total Expenses:</p>
                      <p className="ml-2 font-medium">₹{totalExpenses.toFixed(2)}</p>
                      </div>
                    </details>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    Actual Cash in Hand (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.actualCashInHand}
                    onChange={(e) => setFormData({ ...formData, actualCashInHand: e.target.value })}
                    className="w-full px-4 py-3 border border-teal-300 rounded-xl bg-white/70 text-lg font-semibold focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
                    required
                    disabled={!canEditSales}
                    placeholder="Count and enter actual physical cash"
                  />
                  <p className="text-xs text-gray-500 mt-1">Count and enter actual physical cash</p>
                </div>

                {/* Cash discrepancy display */}
                {cashDiscrepancy !== 0 && parseFloat(formData.actualCashInHand) > 0 && (
                  <div className={`p-3 rounded-lg border-2 ${
                    cashDiscrepancy > 0 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-red-50 border-red-300'
                  }`}>
                    <p className={`font-semibold ${
                      cashDiscrepancy > 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {cashDiscrepancy > 0 ? 'Cash Excess' : 'Cash Shortage'}: ₹{Math.abs(cashDiscrepancy).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {Math.abs(cashDiscrepancy) > 500 
                        ? '⚠️ High discrepancy - requires approval from cluster head' 
                        : 'Discrepancy will be noted in records'}
                    </p>
                  </div>
                )}

                {/* Online Cash (Paytm) Reconciliation */}
                <div className="col-span-2 mt-4">
                  <div className="bg-gradient-to-br from-purple-50/80 to-purple-100/50 backdrop-blur-sm rounded-2xl p-5 border border-purple-200/50 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Smartphone className="w-5 h-5 text-purple-600" />
                      </div>
                      <h3 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Online Cash (Paytm) Reconciliation</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">Expected Paytm Balance (₹)</label>
                        <div className="bg-white/70 rounded-xl p-4 border border-purple-200/50">
                          <p className="text-3xl font-bold text-gray-900">₹{calculatePaytmBalance.toFixed(2)}</p>
                          <p className="text-xs text-gray-600 mt-2">
                            Previous Paytm: ₹{(() => {
                              const previousDate = new Date(selectedDate);
                              previousDate.setDate(previousDate.getDate() - 1);
                              const previousDateStr = previousDate.toISOString().split('T')[0];
                              const previousDaySales = effectiveStoreId 
                                ? context.salesData.find(s => s.date === previousDateStr && s.storeId === effectiveStoreId)
                                : context.salesData.find(s => s.date === previousDateStr);
                              return (previousDaySales?.actualPaytmBalance || 0).toFixed(2);
                            })()} + 
                            Paytm Received: ₹{(parseFloat(formData.paytmAmount) || 0).toFixed(2)} + 
                            Online Payouts: ₹{(parseFloat(formData.onlineSales) || 0).toFixed(2)} - 
                            Used for Expenses: ₹{(parseFloat(formData.usedOnlineMoney) || 0).toFixed(2)} - 
                            Employee Payouts: ₹{totalContractPayout.toFixed(2)}
                          </p>
                          <details className="mt-2">
                            <summary className="text-xs text-blue-600 cursor-pointer hover:underline flex items-center gap-1">
                              ▸ View Paytm usage breakdown
                            </summary>
                            <div className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border border-purple-200">
                              <p className="font-semibold text-purple-700 mb-1">Paytm Used for Expenses (from sales form):</p>
                              <p className="ml-2">Amount Used from Paytm: ₹{(parseFloat(formData.usedOnlineMoney) || 0).toFixed(2)}</p>
                              
                              <p className="font-semibold text-purple-700 mt-2 mb-1">Employee Payouts (all from Paytm):</p>
                              <p className="ml-2">Contract Workers: ₹{totalContractPayout.toFixed(2)}</p>
                              
                              <p className="font-semibold text-purple-700 mt-2 mb-1">Total Paytm Deductions:</p>
                              <p className="ml-2 font-medium">₹{((parseFloat(formData.usedOnlineMoney) || 0) + totalContractPayout).toFixed(2)}</p>
                              
                              <p className="font-semibold text-purple-700 mt-2 mb-1">Paytm Additions:</p>
                              <p className="ml-2">Paytm Received: ₹{(parseFloat(formData.paytmAmount) || 0).toFixed(2)}</p>
                              <p className="ml-2">Online Payouts (Swiggy+Zomato): ₹{(parseFloat(formData.onlineSales) || 0).toFixed(2)}</p>
                              <p className="ml-2 font-medium">Total Additions: ₹{((parseFloat(formData.paytmAmount) || 0) + (parseFloat(formData.onlineSales) || 0)).toFixed(2)}</p>
                            </div>
                          </details>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">
                          Actual Paytm Balance (₹) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.actualPaytmBalance}
                          onChange={(e) => setFormData({ ...formData, actualPaytmBalance: e.target.value })}
                          className="w-full px-4 py-3 border border-purple-300 rounded-xl bg-white/70 text-lg font-semibold focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all"
                          required
                          disabled={!canEditSales}
                          placeholder="Check and enter actual paytm balance"
                        />
                        <p className="text-xs text-gray-500 mt-1">📱 Check your Paytm wallet balance</p>
                      </div>

                      {/* Paytm discrepancy display */}
                      {paytmDiscrepancy !== 0 && parseFloat(formData.actualPaytmBalance) > 0 && (
                        <div className={`p-3 rounded-lg border-2 ${
                          paytmDiscrepancy > 0 
                            ? 'bg-green-50 border-green-300' 
                            : 'bg-red-50 border-red-300'
                        }`}>
                          <p className={`font-semibold ${
                            paytmDiscrepancy > 0 ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {paytmDiscrepancy > 0 ? 'Paytm Excess' : 'Paytm Shortage'}: ₹{Math.abs(paytmDiscrepancy).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            {Math.abs(paytmDiscrepancy) > 500 
                              ? '⚠️ High discrepancy - requires approval from cluster head' 
                              : 'Discrepancy will be noted in records'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Approval status display */}
            {isEditing && salesForDate && (
              <div className="bg-white border border-gray-300 rounded-lg p-4">
                <div className="space-y-3">
                  {(needsApproval || needsPaytmApproval) && salesForDate.approvalRequested && !salesForDate.approvedBy && (
                    <div className="bg-yellow-50 border-2 border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg">
                      <p className="font-semibold">⏳ Pending Approval</p>
                      <p className="mt-1">This entry is waiting for cluster head approval due to high {needsApproval && needsPaytmApproval ? 'cash and Paytm discrepancy' : needsApproval ? 'cash discrepancy' : 'Paytm discrepancy'}.</p>
                    </div>
                  )}
                  
                  {salesForDate.approvedBy && (
                    <div className="bg-green-50 border-2 border-green-300 text-green-700 px-4 py-3 rounded-lg">
                      <p className="font-semibold">✅ Approved</p>
                      <p className="mt-1">Approved by: {salesForDate.approvedBy}</p>
                      {salesForDate.approvalDate && (
                        <p className="text-sm">Date: {new Date(salesForDate.approvalDate).toLocaleString()}</p>
                      )}
                    </div>
                  )}
                  
                  {salesForDate.rejectedBy && (
                    <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-lg">
                      <div>
                        <p className="font-semibold">❌ Rejected</p>
                        <p className="mt-1">Rejected by: {salesForDate.rejectedBy}</p>
                        {salesForDate.rejectionDate && (
                          <p className="text-sm">Date: {new Date(salesForDate.rejectionDate).toLocaleString()}</p>
                        )}
                        {salesForDate.rejectionReason && (
                          <p className="mt-1 italic">Reason: {salesForDate.rejectionReason}</p>
                        )}
                        <p className="mt-1 font-medium">You must pay the discrepancy from your pocket.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {canEditSales && (
              <div className="space-y-3">
                {paymentMismatch && (
                  <div className="bg-red-100/80 border border-red-400/50 text-red-800 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Cannot Save: Payment Mismatch</div>
                      <div className="text-xs mt-1">
                        Payment total (₹{offlinePaymentTotal.toFixed(2)}) must match offline sales (₹{offlineSalesTotal.toFixed(2)})
                      </div>
                    </div>
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={paymentMismatch || isSubmitting}
                  className="w-full px-6 py-3.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm"
                >
                  {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                  {isSubmitting ? 'Saving...' : isEditing ? 'Update Sales Data' : 'Save Sales Data'}
                </button>
                
                {/* Request Approval Button - Only show when editing with high discrepancy */}
                {isEditing && editingId && (needsApproval || needsPaytmApproval) && !salesForDate?.approvedBy && !salesForDate?.approvalRequested && (
                  <button
                    type="button"
                    onClick={handleRequestApproval}
                    className="w-full px-6 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 font-semibold text-sm"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    Request Approval from Cluster Head
                  </button>
                )}
                
                {/* Show if approval is pending */}
                {isEditing && salesForDate?.approvalRequested && !salesForDate?.approvedBy && !salesForDate?.rejectedBy && (
                  <div className="w-full px-6 py-3 bg-orange-100/80 border border-orange-300/50 text-orange-800 rounded-xl text-center text-sm font-medium shadow-sm">
                    ⏳ Approval request sent - Waiting for cluster head response
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Summary Cards */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-green-50/80 to-green-100/50 backdrop-blur-sm rounded-2xl p-5 border border-green-200/50 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-green-500/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Sales</p>
            </div>
            <p className="text-4xl font-bold text-gray-900">₹{(offlineSalesTotal + onlineSalesTotal).toLocaleString()}</p>
            <div className="mt-4 pt-3 border-t border-green-200/50 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Offline Sales:</span>
                <span className="font-semibold text-gray-900">₹{offlineSalesTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Online Sales:</span>
                <span className="font-semibold text-gray-900">₹{onlineSalesTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50/80 to-blue-100/50 backdrop-blur-sm rounded-2xl p-5 border border-blue-200/50 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <Wallet className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Breakdown</p>
            </div>
            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Cash Received:</span>
                <span className="text-2xl font-bold text-gray-900">₹{cash.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Paytm Received:</span>
                <span className="text-2xl font-bold text-gray-900">₹{paytm.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-blue-200/50">
                <span className="text-sm text-gray-600">Online Sales:</span>
                <span className="text-xl font-bold text-gray-900">₹{onlineSalesTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Expected vs Actual Cash */}
          {!isFirstDay && (
            <div className="bg-gradient-to-br from-violet-50/80 to-purple-100/50 backdrop-blur-sm rounded-2xl p-5 border border-purple-200/50 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg">
                    <Wallet className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cash Status</p>
                </div>
                {expectedCashInHand > 0 && (
                  <button
                    onClick={() => setShowCashConversion(true)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600/10 hover:bg-purple-600/20 rounded-lg text-xs font-semibold transition-colors text-purple-700"
                    title="Convert Offline Cash to Online Cash (Paytm)"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    Convert to Online
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Expected Cash</p>
                  <p className="text-3xl font-bold text-gray-900">₹{expectedCashInHand.toFixed(2)}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Previous Cash: ₹{(parseFloat(formData.previousCashInHand) || 0).toFixed(2)} + 
                    Amount Used from Paytm: ₹{(parseFloat(formData.usedOnlineMoney) || 0).toFixed(2)} + 
                    Cash Received: ₹{cash.toFixed(2)} - 
                    Expenses: ₹{totalExpenses.toFixed(2)} - 
                    Contract Payouts: ₹{totalContractPayout.toFixed(2)}
                  </p>
                </div>
                {formData.actualCashInHand && (
                  <>
                    <div className="pt-3 border-t border-purple-200/50">
                      <p className="text-xs text-gray-600 mb-1">Actual Cash</p>
                      <p className="text-3xl font-bold text-gray-900">₹{(parseFloat(formData.actualCashInHand) || 0).toFixed(2)}</p>
                    </div>
                    {Math.abs(cashDiscrepancy) > 0 && (
                      <div className="pt-3 border-t border-purple-200/50">
                        <p className="text-xs text-gray-600 mb-1">Difference</p>
                        <p className={`text-2xl font-bold ${cashDiscrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
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
          <div className="bg-gradient-to-br from-purple-50/80 to-violet-100/50 backdrop-blur-sm rounded-2xl p-5 border border-purple-200/50 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-purple-500/10 rounded-lg">
                <Smartphone className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Online Cash in Hand (Paytm)</p>
            </div>
            <p className="text-4xl font-bold text-gray-900 mb-4">₹{calculatePaytmBalance.toLocaleString()}</p>
            <div className="space-y-2 text-sm bg-gray-800/10 rounded-lg p-3">
              <div className="flex justify-between text-green-700">
                <span>+ Paytm In:</span>
                <span>₹{(() => {
                  // Find the latest recalibration on or before the selected date
                  const latestRecalibration = context.onlineCashRecalibrations
                    .filter(r => r.storeId === effectiveStoreId && r.date <= selectedDate)
                    .sort((a, b) => b.date.localeCompare(a.date))[0];
                  
                  const startDate = latestRecalibration?.date || '0000-00-00';
                  
                  // Get all sales AFTER recalibration and BEFORE today
                  const historicalPaytm = (effectiveStoreId 
                    ? context.salesData.filter(s => s.storeId === effectiveStoreId && s.date > startDate && s.date < selectedDate)
                    : context.salesData.filter(s => s.date > startDate && s.date < selectedDate)
                  ).reduce((sum, s) => sum + (s.paytmAmount ?? 0), 0);
                  // Always use today's form value for the selected date
                  const todaysPaytm = paytm;
                  return (historicalPaytm + todaysPaytm).toLocaleString();
                })()}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>+ Online Payouts:</span>
                <span>₹{(() => {
                  // Find the latest recalibration on or before the selected date
                  const latestRecalibration = context.onlineCashRecalibrations
                    .filter(r => r.storeId === effectiveStoreId && r.date <= selectedDate)
                    .sort((a, b) => b.date.localeCompare(a.date))[0];
                  
                  const startDate = latestRecalibration?.date || '0000-00-00';
                  
                  // Get all sales AFTER recalibration and BEFORE today
                  const historicalOnline = (effectiveStoreId 
                    ? context.salesData.filter(s => s.storeId === effectiveStoreId && s.date > startDate && s.date < selectedDate)
                    : context.salesData.filter(s => s.date > startDate && s.date < selectedDate)
                  ).reduce((sum, s) => sum + (s.onlineSales ?? 0), 0);
                  // Always use today's form value for the selected date
                  const todaysOnline = onlineSalesTotal;
                  return (historicalOnline + todaysOnline).toLocaleString();
                })()}</span>
              </div>
              <div className="flex justify-between text-red-700">
                <span>- Used for Expenses:</span>
                <span>₹{(() => {
                  // Find the latest recalibration on or before the selected date
                  const latestRecalibration = context.onlineCashRecalibrations
                    .filter(r => r.storeId === effectiveStoreId && r.date <= selectedDate)
                    .sort((a, b) => b.date.localeCompare(a.date))[0];
                  
                  const startDate = latestRecalibration?.date || '0000-00-00';
                  
                  // Filter breakdown to only include entries after recalibration
                  return paytmDailyBreakdown
                    .filter(day => day.date > startDate)
                    .reduce((sum, day) => sum + day.usedOnlineMoney, 0)
                    .toLocaleString();
                })()}</span>
              </div>
              <div className="flex justify-between text-orange-700">
                <span>- Employee Payouts:</span>
                <span>₹{(() => {
                  // Find the latest recalibration on or before the selected date
                  const latestRecalibration = context.onlineCashRecalibrations
                    .filter(r => r.storeId === effectiveStoreId && r.date <= selectedDate)
                    .sort((a, b) => b.date.localeCompare(a.date))[0];
                  
                  const startDate = latestRecalibration?.date || '0000-00-00';
                  
                  // Filter breakdown to only include entries after recalibration
                  return paytmDailyBreakdown
                    .filter(day => day.date > startDate)
                    .reduce((sum, day) => sum + (day.employeePayouts || 0), 0)
                    .toLocaleString();
                })()}</span>
              </div>
              <div className="flex justify-between text-gray-700 pt-2 border-t border-gray-700/20">
                <span>Used Today:</span>
                <span>₹{(parseFloat(formData.usedOnlineMoney) || 0).toLocaleString()}</span>
              </div>
              {totalContractPayout > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Employee Payouts Today:</span>
                  <span>₹{totalContractPayout.toLocaleString()}</span>
                </div>
              )}
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
            
            <div className="mt-4">
              <button
                onClick={() => setShowPaytmBreakdown(true)}
                className="w-full px-4 py-2 bg-white/20 hover:bg-white/30 text-gray-800 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <TrendingUp className="w-4 h-4" />
                Daily Breakdown
              </button>
            </div>
          </div>

          {/* Total Cash (Offline + Paytm) */}
          <div className="bg-gradient-to-br from-yellow-50/80 to-orange-100/50 backdrop-blur-sm rounded-2xl p-5 border border-yellow-300/50 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-yellow-500/10 rounded-lg">
                <Wallet className="w-5 h-5 text-yellow-700" />
              </div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Cash (Offline + Paytm)</p>
            </div>
            <p className="text-4xl font-bold text-gray-900 mb-4">
              ₹{(expectedCashInHand + calculatePaytmBalance).toLocaleString()}
            </p>
            <div className="space-y-2 text-sm bg-white/70 rounded-xl p-3 border border-yellow-200/50">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-600">Expected Cash (Offline):</span>
                <span className="text-xl font-semibold text-gray-900">₹{expectedCashInHand.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-yellow-200/50">
                <span className="font-medium text-gray-600">Online Cash (Paytm):</span>
                <span className="text-xl font-semibold text-gray-900">₹{calculatePaytmBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loan Management Section */}
      <div className="mt-6">
        <div className="bg-gradient-to-br from-white/80 to-gray-50/50 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Loan Management</h2>
                <p className="text-xs text-gray-600 mt-0.5">Track loans taken and repayments made</p>
              </div>
            </div>
            <button
              onClick={() => setShowApplyLoanModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 shadow-md"
            >
              <Plus className="w-4 h-4" />
              Apply Loan
            </button>
          </div>

          {/* Active Loans Summary */}
          {(() => {
            const activeLoans = onlineLoans.filter(l => l.status === 'active');
            const totalActiveLoans = activeLoans.reduce((sum, l) => sum + l.loanAmount, 0);
            const totalRepaid = activeLoans.reduce((sum, l) => sum + l.repaidAmount, 0);
            const totalRemaining = activeLoans.reduce((sum, l) => sum + (l.loanAmount - l.repaidAmount), 0);

            return activeLoans.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-600 font-medium">Total Active Loans</p>
                  <p className="text-2xl font-bold text-blue-700">₹{totalActiveLoans.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">Total Repaid</p>
                  <p className="text-2xl font-bold text-green-700">₹{totalRepaid.toLocaleString()}</p>
                </div>
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-600 font-medium">Remaining to Pay</p>
                  <p className="text-2xl font-bold text-red-700">₹{totalRemaining.toLocaleString()}</p>
                </div>
              </div>
            );
          })()}

          {/* Loans List */}
          {isLoadingLoans ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              <span className="ml-2 text-gray-600">Loading loans...</span>
            </div>
          ) : onlineLoans.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">No loans recorded yet</p>
              <p className="text-sm text-gray-500 mt-1">Click "Apply Loan" to add a loan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {onlineLoans.map(loan => {
                const remaining = loan.loanAmount - loan.repaidAmount;
                const progress = (loan.repaidAmount / loan.loanAmount) * 100;
                
                return (
                  <div 
                    key={loan.id}
                    className={`border-2 rounded-lg p-4 ${
                      loan.status === 'active' 
                        ? 'border-blue-200 bg-blue-50' 
                        : 'border-green-200 bg-green-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            loan.status === 'active' 
                              ? 'bg-blue-200 text-blue-800' 
                              : 'bg-green-200 text-green-800'
                          }`}>
                            {loan.status === 'active' ? 'Active' : 'Repaid'}
                          </span>
                          <span className="text-sm text-gray-600">
                            {new Date(loan.loanDate).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{loan.notes || 'No notes'}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xs text-gray-600">Loan Amount</p>
                        <p className="text-xl font-bold text-gray-900">₹{loan.loanAmount.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Repaid: ₹{loan.repaidAmount.toLocaleString()}</span>
                        <span>Remaining: ₹{remaining.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            loan.status === 'repaid' ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1 text-center">{progress.toFixed(0)}% repaid</p>
                    </div>

                    {/* Repay Button */}
                    {loan.status === 'active' && (
                      <button
                        onClick={() => {
                          setSelectedLoanForRepayment(loan);
                          setShowRepayLoanModal(true);
                        }}
                        className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                      >
                        <CreditCard className="w-4 h-4" />
                        Repay Loan
                      </button>
                    )}

                    {loan.status === 'repaid' && loan.repaymentDate && (
                      <div className="text-center text-xs text-green-700 mt-2">
                        ✅ Fully repaid on {new Date(loan.repaymentDate).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Paytm Daily Breakdown Modal */}
      {showPaytmBreakdown && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowPaytmBreakdown(false)}
        >
          <div 
            className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Paytm Daily Breakdown</h2>
                  <p className="text-purple-100 mt-1">Complete transaction history</p>
                </div>
                <button
                  onClick={() => setShowPaytmBreakdown(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Summary Cards at top */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">Total Received</p>
                  <p className="text-2xl font-bold text-green-700">
                    ₹{(paytmDailyBreakdown.reduce((sum, day) => sum + day.paytmReceived + day.onlinePayouts + (day.loansTaken || 0), 0)).toLocaleString()}
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-600 font-medium">Total Used</p>
                  <p className="text-2xl font-bold text-red-700">
                    ₹{(paytmDailyBreakdown.reduce((sum, day) => sum + day.usedOnlineMoney + day.commission + (day.employeePayouts || 0) + (day.loanRepayments || 0), 0)).toLocaleString()}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm text-purple-600 font-medium">Current Balance</p>
                  <p className="text-2xl font-bold text-purple-700">
                    ₹{calculatePaytmBalance.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Daily breakdown table */}
              <div className="space-y-2">
                {paytmDailyBreakdown.map((day, index) => {
                  const dayBalance = day.runningBalance;
                  const isToday = day.date === selectedDate;
                  
                  return (
                    <div 
                      key={day.date} 
                      className={`border rounded-lg p-4 ${
                        isToday ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {formatDateIST(day.date)}
                            {isToday && <span className="ml-2 text-xs bg-purple-500 text-white px-2 py-1 rounded-full">Today</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Running Balance</p>
                          <p className="text-lg font-bold text-purple-600">₹{dayBalance.toLocaleString()}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {day.paytmReceived > 0 && (
                          <div className="flex justify-between items-center bg-green-50 px-3 py-2 rounded">
                            <span className="text-green-700">+ Paytm In:</span>
                            <span className="font-semibold text-green-800">₹{day.paytmReceived.toLocaleString()}</span>
                          </div>
                        )}
                        {day.onlinePayouts > 0 && (
                          <div className="flex justify-between items-center bg-emerald-50 px-3 py-2 rounded">
                            <span className="text-emerald-700">+ Online Payouts:</span>
                            <span className="font-semibold text-emerald-800">₹{day.onlinePayouts.toLocaleString()}</span>
                          </div>
                        )}
                        {day.usedOnlineMoney > 0 && (
                          <div className="flex justify-between items-center bg-red-50 px-3 py-2 rounded">
                            <span className="text-red-700">- Used for Expenses:</span>
                            <span className="font-semibold text-red-800">₹{day.usedOnlineMoney.toLocaleString()}</span>
                          </div>
                        )}
                        {day.commission > 0 && (
                          <div className="flex justify-between items-center bg-rose-50 px-3 py-2 rounded">
                            <span className="text-rose-700">- Commission:</span>
                            <span className="font-semibold text-rose-800">₹{day.commission.toLocaleString()}</span>
                          </div>
                        )}
                        {day.employeePayouts > 0 && (
                          <div className="flex justify-between items-center bg-orange-50 px-3 py-2 rounded">
                            <span className="text-orange-700">- Employee Payouts:</span>
                            <span className="font-semibold text-orange-800">₹{day.employeePayouts.toLocaleString()}</span>
                          </div>
                        )}
                        {day.loansTaken > 0 && (
                          <div className="flex justify-between items-center bg-blue-50 px-3 py-2 rounded">
                            <span className="text-blue-700">+ Loan Received:</span>
                            <span className="font-semibold text-blue-800">₹{day.loansTaken.toLocaleString()}</span>
                          </div>
                        )}
                        {day.loanRepayments > 0 && (
                          <div className="flex justify-between items-center bg-amber-50 px-3 py-2 rounded">
                            <span className="text-amber-700">- Loan Repayment:</span>
                            <span className="font-semibold text-amber-800">₹{day.loanRepayments.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await context.approveSalesData(sale.id);
                              alert('Sales approved successfully!');
                            } catch (error) {
                              alert('Failed to approve sales');
                            }
                          }}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold transition-all"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await context.rejectSalesData(sale.id);
                              alert('Sales rejected successfully!');
                            } catch (error) {
                              alert('Failed to reject sales');
                            }
                          }}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-all"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* No Pending Sales Message */}
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
      </>
      )}
      
      {/* Apply Loan Modal */}
      {showApplyLoanModal && (
        <ApplyLoanModal
          context={context}
          selectedStoreId={effectiveStoreId}
          selectedDate={selectedDate}
          onClose={() => setShowApplyLoanModal(false)}
          onSaveSuccess={async () => {
            await loadOnlineLoans();
          }}
        />
      )}

      {/* Repay Loan Modal */}
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
            await loadOnlineLoans();
          }}
        />
      )}

      {/* Cash Conversion Modal */}
      {showCashConversion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <ArrowRightLeft className="w-6 h-6" />
                  <h2 className="text-xl font-bold">Convert Cash to Online</h2>
                </div>
                <button
                  onClick={() => {
                    setShowCashConversion(false);
                    setConversionAmount('');
                  }}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                <p className="text-sm text-gray-700 mb-3">
                  Convert offline cash in hand to online cash (Paytm). This is useful when you transfer physical cash to your Paytm account.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Current Expected Cash</p>
                    <p className="text-lg font-bold text-gray-900">₹{expectedCashInHand.toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Current Online Cash</p>
                    <p className="text-lg font-bold text-purple-600">₹{calculatePaytmBalance.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Amount to Convert (₹)
                </label>
                <input
                  type="number"
                  value={conversionAmount}
                  onChange={(e) => setConversionAmount(e.target.value)}
                  placeholder="Enter amount"
                  step="0.01"
                  min="0"
                  max={expectedCashInHand}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                  disabled={isConverting}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max: ₹{expectedCashInHand.toFixed(2)}
                </p>
              </div>

              {parseFloat(conversionAmount) > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm font-semibold text-gray-700 mb-2">After Conversion:</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Expected Cash:</span>
                      <span className="font-bold text-gray-900">
                        ₹{expectedCashInHand.toFixed(2)} → ₹{(expectedCashInHand - parseFloat(conversionAmount)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Online Cash:</span>
                      <span className="font-bold text-purple-600">
                        ₹{calculatePaytmBalance.toFixed(2)} → ₹{(calculatePaytmBalance + parseFloat(conversionAmount)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCashConversion(false);
                    setConversionAmount('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold transition-colors"
                  disabled={isConverting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCashConversion}
                  disabled={!conversionAmount || parseFloat(conversionAmount) <= 0 || isConverting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isConverting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      Convert
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6" />
                  <h2 className="text-xl font-bold">Confirm Sales Data</h2>
                </div>
                <button
                  onClick={handleCancelDialog}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg p-4 border border-yellow-200">
                <p className="text-sm text-gray-700 mb-3 font-semibold">
                  You are about to save sales data with the following values:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Offline Sales:</span>
                    <span className="font-semibold">₹{parseFloat(formData.offlineSales) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected Cash:</span>
                    <span className="font-semibold">₹{expectedCashInHand.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Actual Cash:</span>
                    <span className="font-semibold">₹{parseFloat(formData.actualCashInHand) || 0}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Cash Discrepancy:</span>
                    <span className={`font-bold ${cashDiscrepancy === 0 ? 'text-green-600' : cashDiscrepancy > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      ₹{cashDiscrepancy.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600">Expected Paytm:</span>
                    <span className="font-semibold">₹{calculatePaytmBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Actual Paytm:</span>
                    <span className="font-semibold">₹{parseFloat(formData.actualPaytmBalance) || 0}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Paytm Discrepancy:</span>
                    <span className={`font-bold ${paytmDiscrepancy === 0 ? 'text-green-600' : paytmDiscrepancy > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      ₹{paytmDiscrepancy.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {(calculatePaytmBalance < 0 || (expectedCashInHand + calculatePaytmBalance) < 0) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <p className="font-semibold mb-1">⚠️ Warning: Negative Balance Detected</p>
                      {calculatePaytmBalance < 0 && (
                        <p className="mb-1">• Online Cash (Paytm) is negative: ₹{calculatePaytmBalance.toFixed(2)}</p>
                      )}
                      {(expectedCashInHand + calculatePaytmBalance) < 0 && (
                        <p>• Total Combined Cash is negative: ₹{(expectedCashInHand + calculatePaytmBalance).toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                <input
                  type="checkbox"
                  id="confirm-responsibility"
                  checked={confirmationChecked}
                  onChange={(e) => setConfirmationChecked(e.target.checked)}
                  className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="confirm-responsibility" className="text-sm text-gray-700 cursor-pointer">
                  I confirm that I have verified this sales data and take responsibility for its accuracy. I understand that this data will be used for financial reporting and analysis.
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelDialog}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={!confirmationChecked}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                    confirmationChecked
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Save Sales Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}