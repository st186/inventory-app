import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, SalesData } from '../App';
import { DateSelector } from './DateSelector';
import { DatePicker } from './DatePicker';
import { MonthlyCommissionEntry } from './MonthlyCommissionEntry';
import { OnlineCashRecalibration } from './OnlineCashRecalibration';
import { LoanManagementSection } from './LoanManagementSection';
import { OnlineSalesTab } from './OnlineSalesTab';
import { CashTopupHistory } from './CashTopupHistory';
import { DollarSign, Wallet, ShoppingBag, CheckCircle, Smartphone, AlertTriangle, CheckSquare, X, Loader2, Calendar, CreditCard, ArrowRightLeft, IndianRupee, PlusCircle, Clock, RefreshCw, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import * as api from '../utils/api';
import { addDays, getTodayIST, formatDateIST, formatDateTimeIST } from '../utils/timezone';
import { getChannelRevenueFromCategorySales } from '../utils/salesRevenue';
import { computeExpectedPaytmBalance } from '../utils/paytmBalance';
import { paidOutsideStoreTill } from '../utils/cashSource';
import { PaytmLedger } from './PaytmLedger';
import { toast } from 'sonner';

type Props = {
 context: InventoryContextType;
 selectedStoreId?: string | null;
};

const TOPUP_REASON_LABELS: Record<api.CashTopupReason, string> = {
 store_inventory: 'Store Inventory',
 production_inventory: 'Production House Inventory',
 other: 'Other',
};

// Matches the backend's PRODUCTION_CASH_GO_LIVE_DATE (index.ts) exactly - from this date
// onward, production house spend has its own cash ledger (ProductionManagement.tsx's
// "Cash in Hand" tab) instead of being folded into the store's own expected-cash figure.
// Dates before it keep the old blended calculation untouched - historical data was never
// captured split, so it isn't retroactively re-split.
const PRODUCTION_CASH_GO_LIVE_DATE = '2026-08-21';

export function SalesManagement({ context, selectedStoreId }: Props) {
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
 actualPaytmBalance: '',
 cashOverShortReason: '' as '' | NonNullable<SalesData['cashOverShortReason']>,
 cashOverShortNote: ''
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

 // Cash Top-up Request State - store incharge asking the cluster head for more physical
 // cash when the offline till is running low (see plan: "give all managers the liberty").
 const [topupRequests, setTopupRequests] = useState<api.CashTopupRequest[]>([]);
 const [showTopupModal, setShowTopupModal] = useState(false);
 // Defaults to whatever date the page happens to be on, but is independently editable in
 // the modal - confirmed real mistake: a topup requested a day (or more) after the date it
 // should count toward (a late vendor settlement, forgetting to switch the page's own
 // DateSelector first) used to silently apply to whatever date the page was showing.
 const [topupDate, setTopupDate] = useState(selectedDate);
 const [topupAmount, setTopupAmount] = useState('');
 const [isSubmittingTopup, setIsSubmittingTopup] = useState(false);
 const [isSyncingPos, setIsSyncingPos] = useState(false);
 const [activeTab, setActiveTab] = useState<'entry' | 'payout' | 'loans'>('entry');
 
 const isClusterHead = context.user?.role === 'cluster_head';
 const isManager = context.user?.role === 'manager';
 const isStoreIncharge = context.user?.designation === 'store_incharge';
 const isProductionIncharge = context.user?.designation === 'production_incharge';
 const isOperationsManager = isManager && !isStoreIncharge && !isProductionIncharge; // Operations manager (not store/production incharge)
 const isShopManager = isStoreIncharge || isProductionIncharge; // Store or production incharge
 // Aniket (operations incharge) and Vijay (production incharge) between them handle almost
 // every production-side top-up request, but the reason field defaulted to "Store
 // Inventory" regardless of who was asking - an easy one-click mistake for the exact people
 // requesting production top-ups most often (confirmed against a real mis-tagged ₹3,806
 // request). Defaults to "Production Inventory" for that pair of roles now; still
 // changeable in the dropdown for the rarer genuine store top-up either of them needs.
 // Store incharges keep the original "Store Inventory" default.
 const defaultTopupReason: api.CashTopupReason = (isProductionIncharge || isOperationsManager) ? 'production_inventory' : 'store_inventory';
 const [topupReason, setTopupReason] = useState<api.CashTopupReason>(defaultTopupReason);
 const canEditSales = isManager && isStoreIncharge; // Store incharge validates the day's sales (POS-reported once live) against the cash they counted
 const canReconcileCash = isStoreIncharge; // Store incharge owns cash reconciliation as part of the same validation workflow
 const canApproveSales = isOperationsManager || isClusterHead; // Operations manager and cluster head can approve
 
 // Use selectedStoreId prop (from store selector) OR fallback to user's storeId
 // This allows cluster heads to view data for any selected store
 const effectiveStoreId = selectedStoreId || context.user?.storeId;

 // The production house that supplies this store - its expenses now count against this
 // store's cash-in-hand too (reversing an earlier decision that kept them P&L-only),
 // since the store's till/Paytm is what actually funds production house purchases in practice.
 const effectiveProductionHouseId = context.stores?.find(s => s.id === effectiveStoreId)?.productionHouseId || null;

 // Local draft of the Cash Count / Actual Cash in Hand fields - cash reconciliation
 // takes a while (counting a till), and switching to another app or tab used to wipe
 // out whatever had been typed so far since it only ever lived in component state.
 // Persisted to localStorage instead, keyed per store+date, so it survives navigating
 // away and back. Cleared once the entry actually saves successfully.
 const draftKey = effectiveStoreId ? `sales-draft:${effectiveStoreId}:${selectedDate}` : null;
 const loadDraft = (): (Partial<Record<'paytmAmount' | 'cashAmount' | 'actualCashInHand' | 'cashOverShortNote', string>> & { cashOverShortReason?: '' | NonNullable<SalesData['cashOverShortReason']> }) | null => {
 if (!draftKey) return null;
 try {
 const raw = localStorage.getItem(draftKey);
 return raw ? JSON.parse(raw) : null;
 } catch {
 return null;
 }
 };
 const clearDraft = () => {
 if (draftKey) localStorage.removeItem(draftKey);
 };

 // Employee payouts data (for all employees - used in online cash calculation)
 const [employeePayouts, setEmployeePayouts] = useState<any[]>([]);

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
 // Legacy daily-typed-in payouts (kept for historical months) plus the new
 // document-upload aggregator settlements, merged into the same shape so every
 // existing calculatePaytmBalance/paytmDailyBreakdown call site downstream keeps
 // working unchanged. Multiple settlements can land on the same date (e.g. a
 // Zomato and a Swiggy payout both settling that day), so settlements are summed
 // per date first.
 const [payouts, settlements] = await Promise.all([
 api.getOnlinePayoutData(context.user.accessToken),
 api.getAggregatorSettlements(context.user.accessToken),
 ]);
 const byDateAndStore = new Map<string, { date: string; storeId?: string; swiggyPayout: number; zomatoPayout: number }>();
 for (const s of settlements) {
 const key = `${s.storeId || ''}|${s.settlementDate}`;
 const existing = byDateAndStore.get(key) || { date: s.settlementDate, storeId: s.storeId, swiggyPayout: 0, zomatoPayout: 0 };
 if (s.aggregator === 'swiggy') existing.swiggyPayout += s.netPayout;
 else existing.zomatoPayout += s.netPayout;
 byDateAndStore.set(key, existing);
 }
 const settlementDerived: api.OnlinePayoutEntry[] = Array.from(byDateAndStore.values()).map((v, i) => ({
 id: `SETTLEMENT-DERIVED-${i}`,
 date: v.date,
 storeId: v.storeId,
 swiggyPayout: v.swiggyPayout,
 zomatoPayout: v.zomatoPayout,
 createdAt: '',
 }));
 setOnlinePayoutData([...payouts, ...settlementDerived]);
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

 const loadTopupRequests = async () => {
 if (!context.user?.accessToken) return;
 try {
 const requests = await api.fetchCashTopupRequests(context.user.accessToken);
 setTopupRequests(requests);
 } catch (error) {
 console.error('Error loading cash top-up requests:', error);
 }
 };

 useEffect(() => {
 loadTopupRequests();
 // Also re-fetch on every manual "Refresh data" press - this list is fetched
 // independently of context (unlike Cash in Hand, which reads context.salesData and so
 // already picked up fresh data on refresh), so without watching this it silently stayed
 // stale - still showing yesterday's status - until the user's own approve/reject/submit
 // action on it, or a full page reload.
 }, [context.user?.accessToken, context.dataRefreshedAt]);

 const myPendingTopups = topupRequests.filter(
 (r) => r.status === 'pending' && (!effectiveStoreId || r.storeId === effectiveStoreId)
 );

 const handleSyncPosNow = async () => {
 if (!context.user?.accessToken) return;
 setIsSyncingPos(true);
 try {
 const isViewingPastDate = selectedDate < getTodayIST();
 // Cluster head viewing a past, already-closed date: re-pull that day's real totals
 // instead of triggering "today"'s sync.
 const result = (isClusterHead && isViewingPastDate)
 ? await api.backfillPosSync(context.user.accessToken, selectedDate)
 : await api.triggerPosSync(context.user.accessToken);
 if (result?.skipped) {
 alert(result.message || "Skipped - store hasn't opened yet");
 } else if (result?.success) {
 await context.refreshData();
 alert(isViewingPastDate ? `Re-synced ${selectedDate}` : 'POS sync complete');
 } else {
 alert(result?.error || 'POS sync ran but reported an error - check the results');
 }
 } catch (error: any) {
 alert(error?.message || 'Failed to trigger POS sync');
 } finally {
 setIsSyncingPos(false);
 }
 };

 const handleRequestTopup = async () => {
 const amount = parseFloat(topupAmount);
 if (!amount || amount <= 0) {
 alert('Please enter a valid amount');
 return;
 }
 if (!context.user?.accessToken) return;

 setIsSubmittingTopup(true);
 try {
 await api.requestCashTopup(context.user.accessToken, topupDate, amount, topupReason);
 alert('Cash top-up request sent to the cluster head');
 setShowTopupModal(false);
 setTopupAmount('');
 setTopupReason(defaultTopupReason);
 loadTopupRequests();
 } catch (error: any) {
 alert(error?.message || 'Failed to send cash top-up request');
 } finally {
 setIsSubmittingTopup(false);
 }
 };

 // Contract worker payouts are now paid entirely from the Payroll page,
 // not entered here - this stays 0 so the existing offline-cash formula below
 // (contract payouts never come from offline cash) is unaffected.
 const totalContractPayout = 0;

 // Real employee payouts (from the Payroll page) made ON the selected date that
 // actually came out of the Paytm balance - only these get deducted from the Paytm
 // reconciliation. A payout marked "paid from" bank or cash is a real expense but
 // doesn't touch this figure. Undefined paidFrom = a legacy record, assumed Paytm.
 const todaysEmployeePayoutsReal = useMemo(() => {
 const storeFiltered = effectiveStoreId
 ? employeePayouts.filter(p => !p.storeId || p.storeId === effectiveStoreId)
 : employeePayouts;
 return storeFiltered
 .filter(p => p.date === selectedDate && (p.paidFrom == null || p.paidFrom === 'paytm'))
 .reduce((sum, p) => sum + (p.amount || 0), 0);
 }, [employeePayouts, effectiveStoreId, selectedDate]);

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

 const previousDateStr = useMemo(() => addDays(selectedDate, -1), [selectedDate]);

 // Get previous date's sales to carry forward balances
 const previousDateSales = useMemo(() => {
 const storeFilteredSales = effectiveStoreId
 ? context.salesData.filter(s => s.storeId === effectiveStoreId)
 : context.salesData;
 return storeFilteredSales.find(s => s.date === previousDateStr);
 }, [context.salesData, previousDateStr, effectiveStoreId]);

 const latestPriorCashSales = useMemo(() => {
 const storeFilteredSales = effectiveStoreId
 ? context.salesData.filter(s => s.storeId === effectiveStoreId)
 : context.salesData;
 return [...storeFilteredSales]
 .filter(s => s.date < selectedDate && s.actualCashInHand !== undefined && s.actualCashInHand !== null)
 .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
 }, [context.salesData, selectedDate, effectiveStoreId]);

 const latestPriorPaytmSalesForDisplay = useMemo(() => {
 const storeFilteredSales = effectiveStoreId
 ? context.salesData.filter(s => s.storeId === effectiveStoreId)
 : context.salesData;
 return [...storeFilteredSales]
 .filter(s => s.date < selectedDate && s.actualPaytmBalance !== undefined && s.actualPaytmBalance !== null)
 .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
 }, [context.salesData, selectedDate, effectiveStoreId]);

 // Calculate total expenses for the day
 const totalExpenses = useMemo(() => {
 // Production house spend used to count against the store's own cash too, since the
 // store's till/Paytm is what actually funds it in practice - but that meant a store
 // incharge's physical count got flagged as "discrepancy" for money they never touched,
 // caused entirely by the production house's own spending. From PRODUCTION_CASH_GO_LIVE_DATE
 // onward, production has its OWN cash ledger (see ProductionManagement.tsx's "Cash in
 // Hand" tab, backed by production-cash: records) - so the store's own expected-cash
 // calculation goes back to being strictly the store's own spend, full stop. Dates before
 // go-live keep the old blended behavior exactly as-is (historical data was never captured
 // split, so it isn't retroactively re-split here).
 const includeProductionSpend = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;
 // Paid with the cluster head's own money, or out of production's cash: a store cost, but
 // never out of this store's own cash.
 const fromStoreMoney = (item: { paymentMethod?: string; paidFromProductionHouseId?: string | null }) => !paidOutsideStoreTill(item);

 const inventoryCost = context.inventory
 .filter(item => {
 if (!fromStoreMoney(item)) return false;
 const dateMatch = item.date === selectedDate;
 const isThisStoresProductionHouseSpend = includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
 const storeMatch = effectiveStoreId ? (item.storeId === effectiveStoreId || isThisStoresProductionHouseSpend) : true;
 return dateMatch && storeMatch;
 })
 .reduce((sum, item) => sum + item.totalCost, 0);

 // Include ALL overhead costs (both cash and online/paytm) for the current store
 const allOverheadCosts = context.overheads
 .filter(item => {
 if (!fromStoreMoney(item)) return false;
 const dateMatch = item.date === selectedDate;
 const isThisStoresProductionHouseSpend = includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
 const storeMatch = effectiveStoreId ? (item.storeId === effectiveStoreId || isThisStoresProductionHouseSpend) : true;
 return dateMatch && storeMatch;
 })
 .reduce((sum, item) => sum + item.amount, 0);

 // Include ALL fixed costs (both cash and online/paytm) for the current store
 const allFixedCosts = context.fixedCosts
 .filter(item => {
 if (!fromStoreMoney(item)) return false;
 const dateMatch = item.date === selectedDate;
 const isThisStoresProductionHouseSpend = includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
 const storeMatch = effectiveStoreId ? (item.storeId === effectiveStoreId || isThisStoresProductionHouseSpend) : true;
 return dateMatch && storeMatch;
 })
 .reduce((sum, item) => sum + item.amount, 0);

 return inventoryCost + allOverheadCosts + allFixedCosts;
 }, [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, effectiveProductionHouseId]);

 // Same totalExpenses figure, but split by who actually spent it - the store's own
 // purchases vs. production house spend that's charged against this store's cash. Feeds
 // the compact expense breakdown popover instead of one lumped "all expenses" number.
 // production stays 0 from PRODUCTION_CASH_GO_LIVE_DATE onward, matching totalExpenses
 // above no longer including it - see that useMemo's comment for why.
 const expenseBreakdownByEntity = useMemo(() => {
 const includeProductionSpend = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;
 const isProdHouseSpend = (item: { entityType?: string; productionHouseId?: string }) =>
 includeProductionSpend && !!effectiveProductionHouseId && item.entityType === 'production_house' && item.productionHouseId === effectiveProductionHouseId;
 const belongsToday = (item: { date: string; storeId?: string; paymentMethod?: string; entityType?: string; productionHouseId?: string; paidFromProductionHouseId?: string | null }) =>
 !paidOutsideStoreTill(item) && item.date === selectedDate && (effectiveStoreId ? (item.storeId === effectiveStoreId || isProdHouseSpend(item)) : true);

 const split = (list: any[], amountKey: 'totalCost' | 'amount') => {
 let store = 0;
 let production = 0;
 list.forEach((item) => {
 if (!belongsToday(item)) return;
 const amt = item[amountKey] || 0;
 if (isProdHouseSpend(item)) production += amt; else store += amt;
 });
 return { store, production };
 };

 const inventory = split(context.inventory, 'totalCost');
 const overhead = split(context.overheads, 'amount');
 const fixed = split(context.fixedCosts, 'amount');

 return {
 rows: [
 { label: 'Inventory', ...inventory },
 { label: 'Overhead', ...overhead },
 { label: 'Fixed costs', ...fixed },
 ],
 storeTotal: inventory.store + overhead.store + fixed.store,
 productionTotal: inventory.production + overhead.production + fixed.production,
 };
 }, [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, effectiveProductionHouseId]);


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

 const needsApproval = Math.abs(cashDiscrepancy) > 200;

 // Calculate cumulative Paytm/Online balance from all days up to selected date
 // IMPORTANT: this deliberately still anchors on the previous day's *saved*
 // actualPaytmBalance rather than recomputing everything from scratch since account
 // inception. A from-scratch recompute was tried and reverted - this store's historical
 // data has real unexplained resets (an entire flat-zero month, a balance dropping to 0
 // between two days with no matching loan/withdrawal record) with no recalibration ever
 // logged to anchor against, so summing every transaction back to day one produced a
 // wildly wrong (large negative) number instead of the real balance. Trusting the last
 // saved snapshot avoids that - it only goes stale when a fact predating it changes
 // (like a settlement uploaded after the fact), which the aggregator-payout term below
 // now accounts for going forward. If the historical snapshot chain itself needs
 // correcting, that's a job for the "Online Cash Recalibration" feature (a fresh,
 // physically-verified anchor point), not a blind formula rewrite.
 const calculatePaytmBalance = useMemo(() => {
 // Single source of truth - see src/utils/paytmBalance.ts. SalesView's owner-facing
 // "Online Cash (Paytm)" card calls the exact same function, so the two screens can't
 // drift apart the way they used to (they disagreed by ₹27,000 on 31 Aug).
 return computeExpectedPaytmBalance({
 salesData: context.salesData,
 overheads: context.overheads,
 aggregatorSettlements: context.aggregatorSettlements || [],
 onlinePayoutData,
 onlineLoans,
 employeePayouts,
 topupRequests,
 onlineCashRecalibrations: context.onlineCashRecalibrations || [],
 selectedDate,
 effectiveStoreId,
 todaysPaytmReceived: parseFloat(formData.paytmAmount) || 0,
 todaysUsedOnlineMoney: parseFloat(formData.usedOnlineMoney) || 0,
 lastOnlineRecalibration,
 }).balance;
 }, [context.salesData, context.overheads, context.aggregatorSettlements, context.onlineCashRecalibrations, onlinePayoutData, onlineLoans, employeePayouts, topupRequests, selectedDate, effectiveStoreId, lastOnlineRecalibration, formData.paytmAmount, formData.usedOnlineMoney]);

 // Paytm balance only ever moves through tracked mechanisms (cash top-ups drawn from
 // it, salary/rent payouts drawn from it) - unlike physical cash, there's no way for it
 // to go missing or be miscounted, so it's auto-synced from the computed balance instead
 // of asking the store incharge to manually "count" and enter it (which used to also
 // produce a meaningless discrepancy warning whenever they typed a slightly different
 // number than what was already fully determined by logged transactions).
 useEffect(() => {
 const computed = calculatePaytmBalance.toFixed(2);
 if (formData.actualPaytmBalance !== computed) {
 setFormData((prev) => ({ ...prev, actualPaytmBalance: computed }));
 }
 }, [calculatePaytmBalance]);

 // Always 0 now that actualPaytmBalance is auto-synced above - kept as a real
 // computation (not hardcoded) so nothing downstream needs special-casing.
 const paytmDiscrepancy = useMemo(() => {
 const actual = parseFloat(formData.actualPaytmBalance) || 0;
 if (actual === 0) return 0;
 return actual - calculatePaytmBalance;
 }, [formData.actualPaytmBalance, calculatePaytmBalance]);

 const needsPaytmApproval = Math.abs(paytmDiscrepancy) > 200;

 // Calculate today's actual online payout (Swiggy + Zomato)
 const todaysActualOnlinePayout = useMemo(() => {
 const storeFilteredPayouts = effectiveStoreId 
 ? onlinePayoutData.filter(p => p.storeId === effectiveStoreId)
 : onlinePayoutData;
 const todaysPayoutData = storeFilteredPayouts.find(p => p.date === selectedDate);
 return todaysPayoutData 
 ? (todaysPayoutData.swiggyPayout ?? 0) + (todaysPayoutData.zomatoPayout ?? 0)
 : 0;
 }, [onlinePayoutData, selectedDate, effectiveStoreId]);

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
 
 // "Used online money" is driven entirely by approved cash top-ups (stored directly
 // on the sales record), not by inventory/overhead/fixed-cost payment method flags,
 // which are now just a placeholder with no effect on any balance.
 const usedOnlineMoney = salesForDay?.usedOnlineMoney ?? 0;

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
 .filter(p => p.date === date && (p.paidFrom == null || p.paidFrom === 'paytm'))
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
 console.log(` ${dailyData[i].date}: prev(${dailyData[i-1].runningBalance.toFixed(2)}) + net(${dailyData[i].netChange.toFixed(2)}) = ${dailyData[i].runningBalance.toFixed(2)}`);
 }
 
 // Calculate backwards from recalibration date
 console.log('⬅️ Calculating BACKWARD from recalibration date...');
 for (let i = recalibrationIndex - 1; i >= 0; i--) {
 dailyData[i].runningBalance = dailyData[i + 1].runningBalance - dailyData[i + 1].netChange;
 console.log(` ${dailyData[i].date}: next(${dailyData[i+1].runningBalance.toFixed(2)}) - nextNet(${dailyData[i+1].netChange.toFixed(2)}) = ${dailyData[i].runningBalance.toFixed(2)}`);
 }
 
 console.log('✅ Final balances for all dates:');
 dailyData.forEach(d => {
 console.log(` ${d.date}: ₹${d.runningBalance.toFixed(2)} (net change: ₹${d.netChange.toFixed(2)})`);
 });
 } else {
 console.log('⚠️ Recalibration date not found in daily data range!');
 console.log('⚠️ Starting from zero...');
 // Recalibration date not in range, start from beginning
 let balance = 0;
 dailyData.forEach(day => {
 balance += day.netChange;
 day.runningBalance = balance;
 console.log(` ${day.date}: ₹${balance.toFixed(2)}`);
 });
 }
 } else {
 console.log('📊 No recalibration - calculating normally from zero');
 // No recalibration, calculate normally from start
 let balance = 0;
 dailyData.forEach(day => {
 balance += day.netChange;
 day.runningBalance = balance;
 console.log(` ${day.date}: ₹${balance.toFixed(2)}`);
 });
 }
 console.log('💰 ===== END RUNNING BALANCE CALCULATION =====\n');
 
 return dailyData;
 }, [context.salesData, context.fixedCosts, context.overheads, context.inventory, onlinePayoutData, employeePayouts, onlineLoans, selectedDate, effectiveStoreId, lastOnlineRecalibration]);

 // Note: inventory/overhead/fixed-cost "payment method" (cash/online) splits no longer
 // drive any calculation here - "Used Online Money" is now sourced entirely from
 // approved cash top-ups (see calculatePaytmBalance and the usedOnlineMoney field).

 // Load existing data when date changes
 useEffect(() => {
 if (salesForDate) {
 // A record can exist for this date without ever having gotten a
 // previousCashInHand (e.g. the nightly POS auto-sync creates it with just
 // offline/online totals, before the store incharge does their own count) - in
 // that case previousCashInHand sits at null/undefined and used to silently
 // default to 0 instead of carrying yesterday's real closing balance forward.
 // Only trust that blank field as "really zero" once the day has actually been
 // reconciled (actualCashInHand set) - before that, recompute it live the same
 // way a brand-new entry below does, so today's card is never a stale zero.
 const isReconciled = salesForDate.actualCashInHand !== undefined && salesForDate.actualCashInHand !== null;
 const hasStoredPrevCash = salesForDate.previousCashInHand !== undefined && salesForDate.previousCashInHand !== null;
 let prevCashForExisting = salesForDate.previousCashInHand ?? 0;
 if (!isReconciled && !hasStoredPrevCash) {
 if (previousDateSales) {
 prevCashForExisting = previousDateSales.actualCashInHand ?? 0;
 } else if (latestPriorCashSales) {
 prevCashForExisting = latestPriorCashSales.actualCashInHand ?? 0;
 }
 }
 // From PRODUCTION_CASH_GO_LIVE_DATE onward, the store's leftover cash is assumed fully
 // handed over each night (it becomes production's opening balance instead - see
 // ProductionManagement.tsx's Cash in Hand tab) - so the store's own carry-forward chain
 // stops here and every day starts fresh at 0, overriding whatever the logic above found.
 if (selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE) {
 prevCashForExisting = 0;
 }

 setFormData({
 offlineSales: (salesForDate.offlineSales ?? 0).toString(),
 paytmAmount: (salesForDate.paytmAmount ?? 0).toString(),
 cashAmount: (salesForDate.cashAmount ?? 0).toString(),
 employeeSalary: (salesForDate.employeeSalary ?? 0).toString(),
 previousCashInHand: prevCashForExisting.toString(),
 // Driven entirely by approved cash top-ups now, not manually entered or
 // auto-calculated from inventory/overhead/fixed-cost payment method splits.
 usedOnlineMoney: (salesForDate.usedOnlineMoney ?? 0).toString(),
 actualCashInHand: (salesForDate.actualCashInHand ?? 0).toString(),
 actualPaytmBalance: (salesForDate.actualPaytmBalance ?? 0).toString(),
 cashOverShortReason: salesForDate.cashOverShortReason ?? '',
 cashOverShortNote: salesForDate.cashOverShortNote ?? ''
 });
 setIsEditing(true);
 setEditingId(salesForDate.id);
 } else {
 // Auto-fill previous cash balance from yesterday
 let prevCash = 0;

 if (selectedDate < PRODUCTION_CASH_GO_LIVE_DATE) {
 if (previousDateSales) {
 // Use the actual cash in hand from previous day (which includes any offset)
 prevCash = previousDateSales.actualCashInHand ?? 0;
 } else if (latestPriorCashSales) {
 // If yesterday has not been reconciled yet, keep carrying the last known close
 // instead of resetting the next day to zero.
 prevCash = latestPriorCashSales.actualCashInHand ?? 0;
 }
 }
 // Else (on/after go-live): stays 0 - see the comment on the "existing record" branch
 // above for why the store's carry-forward chain stops at PRODUCTION_CASH_GO_LIVE_DATE.

 setFormData({
 offlineSales: '',
 paytmAmount: '',
 cashAmount: '',
 employeeSalary: '0',
 previousCashInHand: prevCash.toString(),
 usedOnlineMoney: '0', // No cash top-up approved yet for this date
 actualCashInHand: '',
 actualPaytmBalance: '',
 cashOverShortReason: '',
 cashOverShortNote: ''
 });
 setIsEditing(false);
 setEditingId(null);
 }

 // A saved draft for this exact store+date means there's still-unsaved typing to
 // restore - overlay it on top of whatever was just loaded above (existing record or
 // blank), since it's always more recent than either.
 const draft = loadDraft();
 if (draft) {
 setFormData((prev) => ({
 ...prev,
 ...(draft.paytmAmount !== undefined ? { paytmAmount: draft.paytmAmount } : {}),
 ...(draft.cashAmount !== undefined ? { cashAmount: draft.cashAmount } : {}),
 ...(draft.actualCashInHand !== undefined ? { actualCashInHand: draft.actualCashInHand } : {}),
 ...(draft.cashOverShortReason !== undefined ? { cashOverShortReason: draft.cashOverShortReason } : {}),
 ...(draft.cashOverShortNote !== undefined ? { cashOverShortNote: draft.cashOverShortNote } : {}),
 }));
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [selectedDate, salesForDate, previousDateSales, latestPriorCashSales]);

 // Explicit "save my progress" action for the Cash Count fields - counting a till takes
 // a while, and this doesn't submit the form or trigger any discrepancy/approval checks,
 // it just protects what's been typed so far from getting wiped out by a navigation away.
 const handleSaveDraft = () => {
 if (!draftKey) return;
 try {
 localStorage.setItem(draftKey, JSON.stringify({
 paytmAmount: formData.paytmAmount,
 cashAmount: formData.cashAmount,
 actualCashInHand: formData.actualCashInHand,
 cashOverShortReason: formData.cashOverShortReason,
 cashOverShortNote: formData.cashOverShortNote,
 }));
 toast.success('Progress saved - safe to switch apps, it\'ll be here when you\'re back.');
 } catch (err) {
 console.error('Failed to save draft:', err);
 toast.error('Could not save progress');
 }
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 // Cash+Paytm vs Net Offline Sales gap - the store incharge must say why before this
 // can be saved, so it never just silently disappears into (or inflates) Sales.
 if (paymentMismatch && !formData.cashOverShortReason) {
 toast.error(`Please pick a reason for the ₹${Math.abs(offlinePaymentDiscrepancy).toFixed(2)} cash/Paytm ${offlinePaymentDiscrepancy > 0 ? 'shortage' : 'excess'} before saving.`);
 return;
 }

 // A significant cash/Paytm discrepancy needs cluster head approval either way - stop
 // here and make the store incharge explicitly acknowledge it rather than letting the
 // warning banner sit there unread while they hit Save.
 if (needsApproval || needsPaytmApproval) {
 const parts: string[] = [];
 if (needsApproval) parts.push(`cash ${cashDiscrepancy > 0 ? 'excess' : 'shortage'} of ₹${Math.abs(cashDiscrepancy).toFixed(2)}`);
 if (needsPaytmApproval) parts.push(`Paytm ${paytmDiscrepancy > 0 ? 'excess' : 'shortage'} of ₹${Math.abs(paytmDiscrepancy).toFixed(2)}`);
 const proceed = confirm(`There's a ${parts.join(' and ')}. This will need cluster head approval before it's final. Submit anyway?`);
 if (!proceed) return;
 }

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
 if (!canEditSales && !canReconcileCash && !isClusterHead) {
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
 // BUG FIX: approvedBy/approvalStatus below used to be gated on needsManagerApproval
 // alone, so a store incharge (not an operations manager) with a genuinely high cash or
 // Paytm discrepancy still got auto-approved as themselves in the same save -
 // approvalRequired came out true (that field was computed correctly) while approvedBy
 // was simultaneously set to the submitter, so the record self-contradicted and never
 // showed up in any "Pending Approvals" list for a cluster head to actually see it.
 // Any of the three conditions that can require a cluster head's sign-off must block
 // auto-approval, not just the role-based one.
 const needsAnyApproval = needsManagerApproval || needsApproval || needsPaytmApproval;

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
 // No longer a form field (Total Offline Sales is now read-only, POS-derived) - preserve
 // whatever the last sync wrote rather than parsing a field that no longer exists here.
 posOnlineSales: salesForDate?.posOnlineSales ?? 0,
 posOfflineSales: salesForDate?.posOfflineSales ?? 0,
 // CRITICAL: Preserve the original salesDiscrepancy if it exists (locked at first settlement), otherwise set to current offset
 // This ensures that once a discrepancy is locked (either at initial settlement or after approval), it NEVER changes
 salesDiscrepancy: salesForDate?.salesDiscrepancy !== undefined 
 ? salesForDate.salesDiscrepancy 
 : offset,
 approvalRequired: needsApproval || needsPaytmApproval,
 approvalStatus: needsAnyApproval ? 'pending' : 'approved', // Auto-approve only when nothing requires a cluster head's sign-off
 createdBy: context.user?.employeeId || context.user?.email || 'unknown',
 approvedBy: !needsAnyApproval ? (context.user?.employeeId || context.user?.email || 'self') : salesForDate?.approvedBy || null,
 approvedAt: !needsAnyApproval ? new Date().toISOString() : salesForDate?.approvedAt || null,
 approvalRequested: salesForDate?.approvalRequested || false,
 approvalRequestedAt: salesForDate?.approvalRequestedAt || null,
 requestedCashInHand: salesForDate?.requestedCashInHand || null,
 requestedOffset: salesForDate?.requestedOffset || null,
 rejectedBy: salesForDate?.rejectedBy || null,
 rejectedAt: salesForDate?.rejectedAt || null,
 rejectionReason: salesForDate?.rejectionReason || null,
 storeId: selectedStoreId || context.user?.storeId || undefined,
 // Cash Over/Short - only booked when there's an actual Cash+Paytm vs Net Offline
 // Sales gap; cleared when the day reconciles cleanly (e.g. after re-entering amounts).
 cashOverShortAmount: paymentMismatch ? offlinePaymentDiscrepancy : 0,
 cashOverShortReason: paymentMismatch && formData.cashOverShortReason ? formData.cashOverShortReason : null,
 cashOverShortNote: paymentMismatch && formData.cashOverShortNote ? formData.cashOverShortNote : null,
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
 console.log('🔄 Step 2: Reloading employee payouts...');
 await loadEmployeePayouts();
 console.log('✅ Employee payouts reloaded');

 console.log('═══════════════════════════════════════════════════════════════');
 console.log('🎉 ALL SAVES COMPLETED SUCCESSFULLY!');
 console.log('═══════════════════════════════════════════════════════════════');
 clearDraft();
 alert('Sales data saved successfully!');
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
 const rawOnlineSalesEntryForDate = useMemo(() => {
 const filtered = effectiveStoreId
 ? onlineSalesData.filter(s => s.storeId === effectiveStoreId)
 : onlineSalesData;
 return filtered.find(s => s.date === selectedDate);
 }, [onlineSalesData, selectedDate, effectiveStoreId]);

 const categorySalesChannelRevenue = useMemo(() => {
 const storeIds = effectiveStoreId && effectiveStoreId !== 'all' ? [effectiveStoreId] : null;
 return getChannelRevenueFromCategorySales(context.categorySalesData, selectedDate, storeIds);
 }, [context.categorySalesData, selectedDate, effectiveStoreId]);

 const onlineSalesEntryForDate = useMemo(() => {
 const primaryOnlineTotal = rawOnlineSalesEntryForDate
 ? (rawOnlineSalesEntryForDate.swiggySales || 0) + (rawOnlineSalesEntryForDate.zomatoSales || 0)
 : 0;
 const fallbackOnlineTotal = categorySalesChannelRevenue.zomato + categorySalesChannelRevenue.swiggy;
 if (primaryOnlineTotal > 0 || fallbackOnlineTotal <= 0) return rawOnlineSalesEntryForDate;
 return {
 ...(rawOnlineSalesEntryForDate || {}),
 id: rawOnlineSalesEntryForDate?.id || `category-channel-${selectedDate}-${effectiveStoreId || 'all'}`,
 date: selectedDate,
 storeId: effectiveStoreId || undefined,
 swiggySales: categorySalesChannelRevenue.swiggy,
 zomatoSales: categorySalesChannelRevenue.zomato,
 createdAt: rawOnlineSalesEntryForDate?.createdAt || '',
 } as api.OnlineSalesEntry;
 }, [rawOnlineSalesEntryForDate, categorySalesChannelRevenue, selectedDate, effectiveStoreId]);

 const onlineSalesTotal = useMemo(() => {
 const primaryOnlineTotal = onlineSalesEntryForDate
 ? (onlineSalesEntryForDate.swiggySales || 0) + (onlineSalesEntryForDate.zomatoSales || 0)
 : 0;
 return primaryOnlineTotal || categorySalesChannelRevenue.zomato + categorySalesChannelRevenue.swiggy;
 }, [onlineSalesEntryForDate, categorySalesChannelRevenue]);

 // "Total Offline Sales" is read-only - it's the real figure Ciferon synced overnight
 // (formData.offlineSales is populated from salesForDate.offlineSales, written by Step A of
 // the nightly pos-sync). Cash and Paytm below are the store incharge's own physical count
 // of how that total was actually received - the discrepancy compares the two.
 const offlineSalesTotal = parseFloat(formData.offlineSales) || categorySalesChannelRevenue.offline || 0;
 const paytm = parseFloat(formData.paytmAmount) || 0;
 const cash = parseFloat(formData.cashAmount) || 0;
 const offlinePaymentTotal = paytm + cash;
 // Signed: positive means the counted cash+paytm is SHORT of the real offline total,
 // negative means it's OVER (matches "can be positive or negative" from the requested behavior).
 const offlinePaymentDiscrepancy = offlineSalesTotal - offlinePaymentTotal;
 const paymentMismatch = Math.abs(offlinePaymentDiscrepancy) > 0.01;

 // Total POS-reported sales (online + offline, both now read-only/synced figures) must
 // match the total cash the store incharge actually counted at end of day. Online/offline
 // split can differ - only the combined total is enforced.
 const posTotal = offlineSalesTotal + onlineSalesTotal;
 const actualCountedTotal = (parseFloat(formData.actualCashInHand) || 0) + (parseFloat(formData.actualPaytmBalance) || 0);
 const hasPosData = posTotal > 0;
 const posTotalMismatch = hasPosData && Math.abs(posTotal - actualCountedTotal) > 0.01;

 const previousPaytmOpening = useMemo(() => {
 const previousDaySales = effectiveStoreId
 ? context.salesData.find(s => s.date === previousDateStr && s.storeId === effectiveStoreId)
 : context.salesData.find(s => s.date === previousDateStr);

 if (previousDaySales?.actualPaytmBalance !== undefined && previousDaySales.actualPaytmBalance !== null) {
 return { amount: previousDaySales.actualPaytmBalance, label: previousDaySales.date };
 }
 if (latestPriorPaytmSalesForDisplay?.actualPaytmBalance !== undefined && latestPriorPaytmSalesForDisplay.actualPaytmBalance !== null) {
 return { amount: latestPriorPaytmSalesForDisplay.actualPaytmBalance, label: latestPriorPaytmSalesForDisplay.date };
 }

 const latestRecalibration = context.onlineCashRecalibrations
 .filter(r => (!effectiveStoreId || r.storeId === effectiveStoreId) && r.date < selectedDate)
 .sort((a, b) => b.date.localeCompare(a.date))[0];
 if (latestRecalibration) {
 return { amount: latestRecalibration.actualBalance || 0, label: latestRecalibration.date };
 }

 return { amount: 0, label: previousDateStr };
 }, [context.salesData, context.onlineCashRecalibrations, effectiveStoreId, previousDateStr, selectedDate, latestPriorPaytmSalesForDisplay]);

 const todaysOnlineLoansReceived = useMemo(() => {
 const storeFilteredLoans = effectiveStoreId
 ? onlineLoans.filter(l => l.storeId === effectiveStoreId)
 : onlineLoans;
 return storeFilteredLoans
 .filter(l => l.loanDate === selectedDate && (l.status === 'active' || l.status === 'repaid'))
 .reduce((sum, l) => sum + l.loanAmount, 0);
 }, [onlineLoans, effectiveStoreId, selectedDate]);

 const todaysLoanRepayments = useMemo(() => {
 const storeFilteredLoans = effectiveStoreId
 ? onlineLoans.filter(l => l.storeId === effectiveStoreId)
 : onlineLoans;
 return storeFilteredLoans
 .filter(l => l.status === 'repaid' && l.repaymentDate === selectedDate)
 .reduce((sum, l) => sum + l.repaidAmount, 0);
 }, [onlineLoans, effectiveStoreId, selectedDate]);

 const todaysOnlineCommission = useMemo(() => {
 const storeFilteredOverheads = effectiveStoreId
 ? context.overheads.filter(o => o.storeId === effectiveStoreId)
 : context.overheads;
 return storeFilteredOverheads
 .filter(o => isCommissionEntry(o) && o.date === selectedDate)
 .reduce((sum, o) => {
 const paymentMethod = o.paymentMethod || 'online';
 if (paymentMethod === 'online') return sum + (o.amount || 0);
 if (paymentMethod === 'both') return sum + (o.onlineAmount || 0);
 return sum;
 }, 0);
 }, [context.overheads, effectiveStoreId, selectedDate]);

 const cashTopupsUsedToday = parseFloat(formData.usedOnlineMoney) || 0;
 const actualCashCount = parseFloat(formData.actualCashInHand) || 0;
 const actualPaytmBalance = parseFloat(formData.actualPaytmBalance) || calculatePaytmBalance;

 return (
 <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-rose-50/30">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
 {/* Page header */}
 <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
 <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
 <DollarSign className="w-6 h-6 text-white" />
 </div>
 <div>
 <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Sales Management</h1>
 <p className="text-sm sm:text-base text-gray-500">Log daily sales, reconcile cash/Paytm, and manage payouts</p>
 </div>
 </div>

 {/* Sync Now - store incharge lives on this page, not SalesView.tsx, so the sync
 button needs to be here too (not just on the read-only view others land on). */}
 {canEditSales && (
 <div className="flex justify-end mb-3">
 {(() => {
 // Stores open at 3 PM IST - keep in sync with server-side STORE_OPENING_HOUR_IST.
 // Computed via Intl so it's correct regardless of the browser's own timezone.
 const istHourNow = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit' }), 10);
 const isViewingPastDate = selectedDate < getTodayIST();
 // Backfilling a past, already-closed date is always allowed regardless of time of
 // day - only "today"'s sync needs to wait for the store to actually open.
 const syncDisabledForTiming = !isViewingPastDate && istHourNow < 15;
 return (
 <button
 onClick={handleSyncPosNow}
 disabled={isSyncingPos || syncDisabledForTiming}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-full text-xs hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 title={syncDisabledForTiming ? "Stores open at 3 PM IST - sync isn't available before then" : "Fetch today's sales from Ciferon POS right now, instead of waiting for the 10:30 PM automatic sync"}
 >
 <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPos ? 'animate-spin' : ''}`} />
 {isSyncingPos ? 'Syncing...' : syncDisabledForTiming ? 'Opens at 3 PM' : 'Sync POS Now'}
 </button>
 );
 })()}
 </div>
 )}

 <div className="flex items-center gap-1.5 mb-4 bg-white/70 p-1 rounded-full w-fit border border-orange-200/50">
 <button
 onClick={() => setActiveTab('entry')}
 className={`px-4 py-1.5 rounded-full text-sm transition-colors ${activeTab === 'entry' ? 'bg-orange-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
 >
 Sales Entry
 </button>
 <button
 onClick={() => setActiveTab('payout')}
 className={`px-4 py-1.5 rounded-full text-sm transition-colors ${activeTab === 'payout' ? 'bg-orange-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
 >
 Aggregator Payout
 </button>
 <button
 onClick={() => setActiveTab('loans')}
 className={`px-4 py-1.5 rounded-full text-sm transition-colors ${activeTab === 'loans' ? 'bg-orange-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
 >
 Loans
 </button>
 </div>

 {activeTab === 'payout' && (
 <OnlineSalesTab
 context={context}
 selectedStoreId={effectiveStoreId}
 selectedDate={selectedDate}
 onDateChange={setSelectedDate}
 />
 )}

 {activeTab === 'entry' && (
 <>
 {/* Date Selector */}
 <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />

 {/* Friday Weekly Reporting Reminder */}
 {isFriday && context.isManager && (
 <div className="mt-6 bg-gradient-to-br from-blue-50/80 to-blue-100/50 border border-blue-300/50 rounded-2xl p-6 shadow-sm">
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
 <div className="bg-gradient-to-br from-orange-50/80 to-orange-100/50 border border-orange-300/50 rounded-2xl p-6 shadow-sm">
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
 <h2 className="text-gray-900 font-bold">Pending Approvals</h2>
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
 <div className="mt-6 bg-gradient-to-br from-green-50/80 to-green-100/50 border border-green-300/50 rounded-2xl p-5 shadow-sm">
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

 {/* Single-column stack, matching SalesView.tsx's structure (the read-only view
 everyone else on this date sees) - previously a two-column layout with a "Summary
 Cards" column that re-displayed the same Expected Cash / Actual Cash / Paytm Balance
 figures shown in Cash Reconciliation and Paytm Reconciliation below in 5 separate
 cards (Total Sales, Payment Breakdown, Cash Status, Online Cash in Hand, Total Cash),
 plus a second repeat further down (Offline/Online Cash Status). Consolidated so the
 store incharge's editable screen doesn't just look inconsistent with everyone else's
 view of the same data, but actually has the same information architecture. */}
 <div className="space-y-4 mt-6">
 <div className="flex items-center gap-2 mb-2">
 <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-md shadow-green-500/20 flex-shrink-0">
 <DollarSign className="w-5 h-5 text-white" />
 </div>
 <h2 className="text-base font-bold text-gray-900 tracking-tight">Sales Entry</h2>
 </div>

 {/* Today's Sales - total up top with the Online/Offline split right beneath it,
 since both figures are read-only and need no action - just a glance. */}
 <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 shadow-sm">
 <p className="text-xs text-green-100 uppercase tracking-wide">Today's Sales</p>
 <p className="text-white text-2xl font-semibold mt-1">₹{(offlineSalesTotal + onlineSalesTotal).toFixed(2)}</p>
 <div className="grid grid-cols-2 gap-3 mt-3">
 <div className="bg-white/15 rounded-xl px-3 py-2">
 <p className="text-[11px] text-green-100 uppercase tracking-wide">Online</p>
 <p className="text-white text-sm font-semibold">₹{onlineSalesTotal.toFixed(2)}</p>
 </div>
 <div className="bg-white/15 rounded-xl px-3 py-2">
 <p className="text-[11px] text-green-100 uppercase tracking-wide">Offline</p>
 <p className="text-white text-sm font-semibold">₹{offlineSalesTotal.toFixed(2)}</p>
 </div>
 </div>
 <details className="mt-3">
 <summary className="text-xs text-green-100 cursor-pointer hover:underline">▸ View Zomato / Swiggy split</summary>
 <div className="mt-2 text-xs text-white/90 bg-white/10 rounded-lg p-2 space-y-1">
 <div className="flex justify-between"><span>Zomato</span><span>₹{(onlineSalesEntryForDate?.zomatoSales || 0).toFixed(2)}</span></div>
 <div className="flex justify-between"><span>Swiggy</span><span>₹{(onlineSalesEntryForDate?.swiggySales || 0).toFixed(2)}</span></div>
 </div>
 </details>
 </div>

 <form onSubmit={handleSubmit} className="space-y-4">
 {/* Cash Count - the one thing the store incharge actually has to type each day.
 Offline Sales stays visible here (read-only) since it's what Paytm+Cash is checked against. */}
 <div className="bg-gradient-to-br from-amber-50/80 to-orange-100/50 rounded-2xl p-5 border border-orange-200/50 shadow-sm hover:shadow-md transition-all">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-md shadow-orange-500/20 flex-shrink-0">
 <CreditCard className="w-5 h-5 text-white" />
 </div>
 <h3 className="text-sm font-bold text-gray-900 tracking-tight">Cash Count</h3>
 </div>
 {offlineSalesTotal > 0 && (
 paymentMismatch ? (
 <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100/80 px-2.5 py-1 rounded-full">
 <AlertTriangle className="w-3 h-3" /> {offlinePaymentDiscrepancy > 0 ? 'short' : 'over'} ₹{Math.abs(offlinePaymentDiscrepancy).toFixed(2)}
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100/80 px-2.5 py-1 rounded-full">
 <CheckCircle className="w-3 h-3" /> matched
 </span>
 )
 )}
 </div>

 {/* Bengali+English instructions - what he actually needs to do here, in his own
 mixed language rather than English-only jargon. */}
 <p className="text-xs text-gray-700 bg-white/70 rounded-lg px-3 py-2 mb-3 leading-relaxed">
 👉 দোকান বন্ধ করার আগে ক্যাশ বক্স আর Paytm-এ যা <b>সত্যিই</b> আছে, সেটা গুনে এখানে লিখুন — আন্দাজে না, একদম আসল সংখ্যা। এটা POS-এর sales-এর সাথে মিলিয়ে check হবে।
 </p>

 <div className="grid grid-cols-2 gap-3 mb-1">
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
 placeholder="Enter Paytm amount"
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
 placeholder="Enter cash amount"
 />
 </div>
 </div>

 <details className="mt-2">
 <summary className="text-xs text-orange-700 cursor-pointer hover:underline">▸ View offline sales total</summary>
 <div className="mt-2 bg-white/70 rounded-lg p-2.5 text-xs text-gray-600 flex justify-between">
 <span>Total Offline Sales (auto-synced from POS)</span>
 <span className="font-semibold text-gray-800">₹{offlineSalesTotal.toFixed(2)}</span>
 </div>
 </details>

 {/* Cash+Paytm doesn't match Net Offline Sales - this is real business money that went
 missing or came in extra (missed KOT, wrong change, a tip, a counting slip), not just
 a data-entry gap. Book it with a reason instead of letting it silently vanish into -
 or inflate - Sales; it rolls up separately as its own "Cash Over/Short" line. */}
 {paymentMismatch && (
 <div className="mt-3 bg-red-50/80 border border-red-200 rounded-xl p-3">
 <p className="text-xs font-semibold text-red-800 mb-1 flex items-center gap-1">
 <AlertTriangle className="w-3.5 h-3.5" /> Why the {offlinePaymentDiscrepancy > 0 ? 'shortage' : 'excess'} of ₹{Math.abs(offlinePaymentDiscrepancy).toFixed(2)}?
 </p>
 <p className="text-[11px] text-red-700 mb-2 leading-relaxed">
 এই টাকাটা কোথায় গেল/এল বলুন — এটা Sales-এ যোগ হবে না, আলাদা "Cash Over/Short" হিসেবে রাখা হবে যাতে আমরা ট্র্যাক করতে পারি।
 </p>
 <div className="flex flex-wrap gap-1.5 mb-2">
 {([
 { key: 'missed_kot', label: 'Missed KOT' },
 { key: 'wrong_change', label: 'Wrong change' },
 { key: 'tip', label: 'Tip' },
 { key: 'counting_mistake', label: 'Counting mistake' },
 { key: 'other', label: 'Other' },
 ] as const).map((r) => (
 <button
 key={r.key}
 type="button"
 disabled={!canEditSales}
 onClick={() => setFormData({ ...formData, cashOverShortReason: r.key })}
 className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
 formData.cashOverShortReason === r.key
 ? 'bg-red-600 text-white'
 : 'bg-white text-red-700 border border-red-300 hover:bg-red-100'
 }`}
 >
 {r.label}
 </button>
 ))}
 </div>
 <textarea
 value={formData.cashOverShortNote}
 onChange={(e) => setFormData({ ...formData, cashOverShortNote: e.target.value })}
 disabled={!canEditSales}
 placeholder="Optional note - কী হয়েছিল একটু লিখুন (optional)"
 rows={2}
 className="w-full text-xs px-2.5 py-2 border border-red-200 rounded-lg bg-white/90 focus:outline-none focus:ring-1 focus:ring-red-400"
 />
 </div>
 )}

 {/* Cash reconciliation takes a while (physically counting a till) - save progress
 here so switching apps or tabs mid-count doesn't wipe it out. Doesn't submit the
 form, just protects what's typed so far until Update/Save Sales Data below. */}
 {canEditSales && (
 <button
 type="button"
 onClick={handleSaveDraft}
 className="mt-3 w-full px-3 py-2 bg-white/80 border border-orange-300 text-orange-700 rounded-xl text-xs font-semibold hover:bg-white transition-colors flex items-center justify-center gap-1.5"
 >
 💾 Save Progress
 </button>
 )}
 </div>

 {/* Cash Reconciliation Section - shown right after Payment Mode Distribution */}
 <div className="bg-gradient-to-br from-teal-50/80 to-teal-100/50 rounded-2xl p-5 border border-teal-200/50 shadow-sm hover:shadow-md transition-all">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md shadow-teal-500/20 flex-shrink-0">
 <Wallet className="w-5 h-5 text-white" />
 </div>
 <h3 className="text-sm font-bold text-gray-900 tracking-tight">Cash Reconciliation</h3>
 </div>
 <div className="flex items-center gap-2 flex-wrap justify-end">
 {cashDiscrepancy !== 0 && parseFloat(formData.actualCashInHand) > 0 && (
 <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cashDiscrepancy > 0 ? 'text-green-700 bg-green-100/80' : 'text-red-700 bg-red-100/80'}`}>
 <AlertTriangle className="w-3 h-3" /> {cashDiscrepancy > 0 ? 'excess' : 'short'} ₹{Math.abs(cashDiscrepancy).toFixed(2)}
 </span>
 )}
 {expectedCashInHand > 0 && (
 <button
 type="button"
 onClick={() => setShowCashConversion(true)}
 className="flex items-center gap-1 px-2.5 py-1 bg-teal-600/10 hover:bg-teal-600/20 rounded-lg text-xs font-semibold transition-colors text-teal-700"
 title="Convert Offline Cash to Online Cash (Paytm)"
 >
 <ArrowRightLeft className="w-3 h-3" />
 Convert to Online
 </button>
 )}
 </div>
 </div>
 
 <div className="space-y-4">
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-2">Expected Cash</label>
 <div className="bg-white/70 rounded-xl p-4 border border-teal-200/50">
 <p className="text-4xl font-bold text-gray-900">₹{expectedCashInHand.toFixed(2)}</p>
 <p className="text-xs text-gray-600 mt-2">
 Previous day's cash ₹{(parseFloat(formData.previousCashInHand) || 0).toFixed(2)} + cash top-up ₹{(parseFloat(formData.usedOnlineMoney) || 0).toFixed(2)} + today's cash collection ₹{(parseFloat(formData.cashAmount) || 0).toFixed(2)} − expenses ₹{totalExpenses.toFixed(2)} = expected ₹{expectedCashInHand.toFixed(2)}
 </p>
 <details className="mt-2">
 <summary className="text-xs text-blue-600 cursor-pointer hover:underline flex items-center gap-1">
 ▸ View expense breakdown (store vs production house)
 </summary>
 <div className="mt-2 text-xs bg-white rounded border border-teal-200 overflow-hidden">
 <div className="grid grid-cols-3 gap-2 px-2.5 py-1.5 bg-teal-50 text-teal-700 font-semibold">
 <span>Category</span>
 <span className="text-right">Store</span>
 <span className="text-right">Prod. House</span>
 </div>
 {expenseBreakdownByEntity.rows.map((row) => (
 <div key={row.label} className="grid grid-cols-3 gap-2 px-2.5 py-1.5 text-gray-700 border-t border-teal-100">
 <span>{row.label}</span>
 <span className="text-right tabular-nums">₹{row.store.toFixed(2)}</span>
 <span className="text-right tabular-nums">₹{row.production.toFixed(2)}</span>
 </div>
 ))}
 <div className="grid grid-cols-3 gap-2 px-2.5 py-1.5 font-semibold text-teal-800 border-t border-teal-200 bg-teal-50/60">
 <span>Total</span>
 <span className="text-right tabular-nums">₹{expenseBreakdownByEntity.storeTotal.toFixed(2)}</span>
 <span className="text-right tabular-nums">₹{expenseBreakdownByEntity.productionTotal.toFixed(2)}</span>
 </div>
 </div>
 </details>
 </div>
 </div>

 <div>
 <label className="block text-xs font-medium text-gray-600 mb-2">
 Actual Cash in Hand (₹) <span className="text-red-500">*</span>
 {!canReconcileCash && <span className="text-gray-400 font-normal"> - entered by store incharge</span>}
 </label>
 <input
 type="number"
 step="0.01"
 value={formData.actualCashInHand}
 onChange={(e) => setFormData({ ...formData, actualCashInHand: e.target.value })}
 className="w-full px-4 py-3 border border-teal-300 rounded-xl bg-white/70 text-lg font-semibold focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
 required
 disabled={!canReconcileCash}
 placeholder="Count and enter actual physical cash"
 />
 <p className="text-xs text-gray-500 mt-1">Count and enter actual physical cash</p>
 <p className="text-xs text-gray-700 bg-white/70 rounded-lg px-3 py-2 mt-2 leading-relaxed">
 👉 উপরে "Expected Cash"-এ যা দেখাচ্ছে, সেটার সাথে হাতে থাকা cash মিলিয়ে দেখুন। মিললেও, না মিললেও — যা <b>সত্যিই</b> হাতে আছে (physically count করে) সেই সংখ্যাটাই এখানে লিখুন, বেশি হোক বা কম।
 </p>
 </div>

 {/* Cash discrepancy note - the pill up top already flags it; this just adds the
 one detail that matters (whether approval will be required). */}
 {cashDiscrepancy !== 0 && parseFloat(formData.actualCashInHand) > 0 && Math.abs(cashDiscrepancy) > 200 && (
 <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
 ⚠️ High discrepancy - you can save, but cluster head approval will be required.
 </p>
 )}
 </div>
 </div>

 {/* Payment-mismatch and high-discrepancy warnings live as inline pills on the
 Cash Count / Cash Reconciliation / Paytm Reconciliation cards above, plus a confirm
 prompt on submit for anything that needs approval - no need to repeat them here.
 Placed right after Actual Cash in Hand / Paytm Reconciliation since that's the last
 manual entry in the normal flow - everything below (opening balance on day 1/month
 1, read-only status summaries) either doesn't apply most days or needs no action. */}
 {(canEditSales || canReconcileCash) && (
 <div className="space-y-3">
 <button
 type="submit"
 disabled={isSubmitting}
 className="w-full px-6 py-3.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm"
 >
 {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
 {isSubmitting ? 'Saving...' : isEditing ? 'Update Sales Data' : 'Save Sales Data'}
 </button>

 {/* Request Approval Button - Only show when editing with high discrepancy */}
 {isEditing && editingId && (needsApproval || needsPaytmApproval || posTotalMismatch) && !salesForDate?.approvedBy && !salesForDate?.approvalRequested && (
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

 {/* Paytm balance - auto-tracked, no action needed from the store incharge. Kept
     small and below the save button on purpose: it is informational, not something
     they count or reconcile. "Breakdown" opens the full day's math. */}
 <div className="mt-4 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
 <div className="flex items-center gap-2.5 min-w-0">
 <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 flex-shrink-0">
 <Smartphone className="w-4 h-4" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-semibold text-gray-700">Paytm balance <span className="font-normal text-gray-400">&middot; auto-tracked</span></p>
 <p className="text-[11px] text-gray-400 truncate">Moves only through logged top-ups &amp; payouts &mdash; no count needed</p>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <span className="text-base font-bold text-gray-900 tabular-nums">&#8377;{calculatePaytmBalance.toFixed(2)}</span>
 <button
 type="button"
 onClick={() => setShowPaytmBreakdown(true)}
 className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 hover:underline whitespace-nowrap"
 >
 Breakdown
 </button>
 </div>
 </div>

 <PaytmLedger input={{
 salesData: context.salesData,
 overheads: context.overheads,
 aggregatorSettlements: context.aggregatorSettlements || [],
 onlinePayoutData,
 onlineLoans,
 employeePayouts,
 topupRequests,
 onlineCashRecalibrations: context.onlineCashRecalibrations || [],
 effectiveStoreId: effectiveStoreId ?? null,
 }} />


 {/* Previous Cash Balance - Only show on day 1 or 1st of month */}
 {(isFirstDay || isFirstOfMonth) && (
 <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/50 rounded-2xl p-5 border border-amber-200/50 shadow-sm hover:shadow-md transition-all">
 <div className="flex items-center gap-2 mb-4">
 <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/20 flex-shrink-0">
 <Wallet className="w-5 h-5 text-white" />
 </div>
 <h3 className="text-sm font-bold text-gray-900 tracking-tight">{isFirstDay ? 'Opening Cash Balance (Day 1)' : 'Cash Left from Previous Month'}</h3>
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
 {salesForDate.approvedAt && (
 <p className="text-sm">Date: {new Date(salesForDate.approvedAt).toLocaleString()}</p>
 )}
 </div>
 )}
 
 {salesForDate.rejectedBy && (
 <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-lg">
 <div>
 <p className="font-semibold">❌ Rejected</p>
 <p className="mt-1">Rejected by: {salesForDate.rejectedBy}</p>
 {salesForDate.rejectedAt && (
 <p className="text-sm">Date: {new Date(salesForDate.rejectedAt).toLocaleString()}</p>
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

 {/* Save/Update button moved up to right after Cash Reconciliation + Paytm
 Reconciliation, since everything below that point is read-only summary/status -
 no reason to make someone scroll past it to find the button that finishes the form. */}
 </form>
 </div>

 {/* Cash Top-up Request - store incharge can ask the cluster head for more physical
 cash when the offline till is running low. Shown before Loan Management per request. */}
 <div className="mt-6">
 <div className="bg-white rounded-2xl border border-gray-100 p-5">
 <div className="flex items-center justify-between gap-3 mb-5">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
 <IndianRupee className="w-4 h-4" />
 </div>
 <div className="min-w-0">
 <h2 className="text-sm font-semibold text-gray-900">Cash top-up</h2>
 <p className="text-xs text-gray-500">Ask the cluster head for more physical cash</p>
 </div>
 </div>
 <button
 onClick={() => {
 setTopupDate(selectedDate);
 setShowTopupModal(true);
 }}
 className="flex-shrink-0 px-3.5 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors flex items-center gap-1.5 text-xs font-medium"
 >
 <PlusCircle className="w-3.5 h-3.5" />
 Request Top-up
 </button>
 </div>
 {myPendingTopups.length === 0 ? (
 <p className="text-sm text-gray-500">No pending top-up requests.</p>
 ) : (
 <div className="space-y-2">
 {myPendingTopups.map((r) => (
 <div key={r.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2">
 <p className="text-sm text-gray-900">₹{r.requestedAmount.toLocaleString()} for {r.date}</p>
   <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">#{r.id.slice(-6).toUpperCase()}</span>
 </div>
 <p className="text-xs text-gray-500">{TOPUP_REASON_LABELS[r.reason]}</p>
 <p className="text-xs text-gray-400 mt-0.5">Requested {formatDateTimeIST(r.requestDate, false)}</p>
 </div>
 <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
 <Clock className="w-3.5 h-3.5" /> Pending
 </span>
 </div>
 ))}
 </div>
 )}

 {/* Global top-up ledger - every requester sees the full history across all
 stores/production house, same as what a cluster head sees, not just their own. */}
 <CashTopupHistory requests={topupRequests} />
 </div>
 </div>

 {/* Cash Top-up Request Modal */}
 {showTopupModal && (
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
 <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-gray-200">
 <h3 className="text-gray-900 mb-4 font-semibold">Request Cash Top-up</h3>
 <label className="block text-xs font-medium text-gray-600 mb-1">Date this top-up is for</label>
 <DatePicker
 value={topupDate}
 onChange={setTopupDate}
 max={getTodayIST()}
 className="w-full mb-3"
 />
 <p className="text-xs text-gray-500 mb-3">
 Defaults to the date you're viewing - change this if the top-up is for an earlier day (e.g. a late vendor settlement).
 </p>
 <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
 <input
 type="number"
 step="0.01"
 value={topupAmount}
 onChange={(e) => setTopupAmount(e.target.value)}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
 placeholder="Enter amount needed"
 autoFocus
 />
 <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
 <select
 value={topupReason}
 onChange={(e) => setTopupReason(e.target.value as api.CashTopupReason)}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
 >
 <option value="store_inventory">Store Inventory</option>
 <option value="production_inventory">Production House Inventory</option>
 <option value="other">Other</option>
 </select>
 <div className="flex gap-2">
 <button
 onClick={() => setShowTopupModal(false)}
 className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleRequestTopup}
 disabled={isSubmittingTopup}
 className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:opacity-50"
 >
 {isSubmittingTopup ? 'Sending...' : 'Send Request'}
 </button>
 </div>
 </div>
 </div>
 )}
 </>
 )}

 {/* Loan Management Section */}
 {activeTab === 'loans' && (
 <div>
 <LoanManagementSection
 context={context}
 effectiveStoreId={effectiveStoreId}
 selectedDate={selectedDate}
 loans={onlineLoans}
 isLoading={isLoadingLoans}
 onReload={loadOnlineLoans}
 canApply={isOperationsManager || isClusterHead}
 canApprove={isClusterHead}
 />
 </div>
 )}

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
 <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white">
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-2xl font-bold">Paytm Daily Breakdown</h2>
 <p className="text-orange-100 mt-1">Complete transaction history</p>
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
 <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
 <p className="text-sm text-orange-600 font-medium">Current Balance</p>
 <p className="text-2xl font-bold text-orange-700">
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
 isToday ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
 }`}
 >
 <div className="flex items-center justify-between mb-3">
 <div>
 <p className="font-semibold text-gray-900">
 {formatDateIST(day.date)}
 {isToday && <span className="ml-2 text-xs bg-orange-500 text-white px-2 py-1 rounded-full">Today</span>}
 </p>
 </div>
 <div className="text-right">
 <p className="text-xs text-gray-500">Running Balance</p>
 <p className="text-lg font-bold text-orange-600">₹{dayBalance.toLocaleString()}</p>
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
 <h2 className="text-gray-900 font-bold">Sales Pending Approval</h2>
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
 await (context as any).rejectSalesData(sale.id);
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
 <h2 className="text-gray-900 font-bold">Sales Pending Approval</h2>
 </div>
 <p className="text-gray-600">No pending sales at the moment.</p>
 </div>
 )}
 </div>
 )}

 {/* Cash Conversion Modal */}
 {showCashConversion && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
 <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
 <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 rounded-t-2xl">
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
 <div className="bg-gradient-to-br from-orange-50 to-rose-50 rounded-lg p-4 border border-orange-200">
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
 <p className="text-lg font-bold text-orange-600">₹{calculatePaytmBalance.toFixed(2)}</p>
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
 className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-lg"
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
 <span className="font-bold text-orange-600">
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
 className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-rose-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
 <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 rounded-t-2xl">
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
 </div>
 </div>

 {/* Cash Discrepancy - the one number the store incharge actually needs to act on,
 so it gets its own large, unmissable card instead of sitting as just another row
 in the list above. Paytm is deliberately not shown here at all (see the removed
 Expected/Actual Paytm rows above) - Paytm is auto-tracked and not something he
 counts or is responsible for; showing it here only invited confusion about which
 number he's actually confirming. */}
 <div className={`rounded-2xl p-5 border-2 text-center ${
 cashDiscrepancy === 0
 ? 'bg-green-50 border-green-400'
 : Math.abs(cashDiscrepancy) > 200
 ? 'bg-red-50 border-red-500 animate-pulse'
 : 'bg-amber-50 border-amber-400'
 }`}>
 <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${
 cashDiscrepancy === 0 ? 'text-green-700' : Math.abs(cashDiscrepancy) > 200 ? 'text-red-700' : 'text-amber-700'
 }`}>
 {cashDiscrepancy === 0 ? '✅ Cash Matched' : cashDiscrepancy > 0 ? '⚠️ Cash Discrepancy — Excess' : '⚠️ Cash Discrepancy — Short'}
 </p>
 <p className={`text-4xl font-extrabold tabular-nums ${
 cashDiscrepancy === 0 ? 'text-green-600' : cashDiscrepancy > 0 ? 'text-blue-600' : 'text-red-600'
 }`}>
 {cashDiscrepancy === 0 ? '₹0' : `${cashDiscrepancy > 0 ? '+' : '−'}₹${Math.abs(cashDiscrepancy).toFixed(2)}`}
 </p>
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
 className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
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
 ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-rose-600'
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
