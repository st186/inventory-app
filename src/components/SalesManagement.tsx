// Day close (store incharge, either login type): POS sales, the cash/Paytm count, does it match,
// then Save draft / Send. Wireframe DayClose. The calculations live in money/dayCloseMath.ts; the
// offline outbox (App.tsx saveViaOutbox) keeps a day close made without signal on the phone.
import { useState, useMemo, useEffect, useRef } from 'react';
import { InventoryContextType, SalesData } from '../App';
import { LoanManagementSection } from './LoanManagementSection';
import { OnlineSalesTab } from './OnlineSalesTab';
import { CashTopupHistory } from './CashTopupHistory';
import { AlertTriangle, ArrowLeft, Check, CheckCircle, FileSpreadsheet, HandCoins, Plus, RefreshCw, Smartphone } from 'lucide-react';
import * as api from '../utils/api';
import { addDays, getTodayIST, formatDateIST } from '../utils/timezone';
import { getChannelRevenueFromCategorySales } from '../utils/salesRevenue';
import { computeExpectedPaytmBalance } from '../utils/paytmBalance';
import { countedCashInHand } from '../utils/paytmRules';
import { PaytmLedger } from './PaytmLedger';
import { toast } from 'sonner';
import { VoiceButton } from './VoiceButton';
import { useOutbox } from './SyncStatus';
import { isPendingId } from '../utils/outbox';
import {
 PRODUCTION_CASH_GO_LIVE_DATE,
 dayCloseCashDiscrepancy,
 dayCloseExpectedCash,
 dayCloseExpenseBreakdown,
 dayCloseTotalExpenses,
 isCommissionEntry,
 offlinePaymentCheck,
 paytmDailyBreakdown as computePaytmDailyBreakdown,
} from './money/dayCloseMath';
import { useT, type I18nKey } from '../utils/i18n';
import { confirm, promptText } from './ui/confirm';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Checkbox } from './ui/checkbox';
import { ChoiceChips } from './ui/chip';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { IconWell, ListGroup, ListRow } from './ui/list-row';
import { MoneyInput, formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { StatusChip } from './ui/status-chip';
import { Textarea } from './ui/textarea';
import { cn } from './ui/utils';
import { FigureCard, FigureRow, MoneyPage, Section, StickyFooter } from './money/MoneyLayout';
import { DayBand, DayStatusBanner, DiffChip, FormulaSheet, MoneyWaiting, PaytmBreakdownSheet, TopupRow, TopupSheet, type DayStatus, type FormulaLine } from './money/DayCloseParts';
import { posSyncTooEarly, toastPosSyncError, toastPosSyncResult, useShellHasMoneyTab } from './money/moneyShell';

type Props = {
 context: InventoryContextType;
 selectedStoreId?: string | null;
 /** The tab to open on (the shell's Money > Payouts / Loans). */
 initialTab?: 'entry' | 'payout' | 'loans';
};



export function SalesManagement({ context, selectedStoreId, initialTab = 'entry' }: Props) {
 const { t, lang } = useT();
 const [selectedDate, setSelectedDate] = useState<string>(
 getTodayIST()
 );

 // State for online payout data
 const [onlinePayoutData, setOnlinePayoutData] = useState<api.OnlinePayoutEntry[]>([]);
 const [isLoadingPayouts, setIsLoadingPayouts] = useState(false);
 
 // State for online sales data (to display in summary cards)
 const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
 const [isLoadingOnlineSales, setIsLoadingOnlineSales] = useState(false);


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
 const [topupAmount, setTopupAmount] = useState<number | null>(null);
 const [isSubmittingTopup, setIsSubmittingTopup] = useState(false);
 const [isSyncingPos, setIsSyncingPos] = useState(false);
 const [activeTab, setActiveTab] = useState<'entry' | 'payout' | 'loans'>(initialTab);
 
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
 // Store incharge validates the day's sales (POS-reported once live) against the cash they
 // counted, on either login type - not only manager logins (owner, 27 Oct 2026).
 const canEditSales = isStoreIncharge;
 const canReconcileCash = isStoreIncharge; // Store incharge owns cash reconciliation as part of the same validation workflow
 const canApproveSales = isOperationsManager || isClusterHead; // Operations manager and cluster head can approve
 
 // Use selectedStoreId prop (from store selector) OR fallback to user's storeId
 // This allows cluster heads to view data for any selected store
 const effectiveStoreId = selectedStoreId || context.user?.storeId;

 // This day's close still waiting to send from this phone (utils/outbox.ts - saved without signal,
 // or the signal dropped). The form already shows it as saved; approvals wait until it has gone.
 const outboxEntries = useOutbox();
 const pendingDayClose = outboxEntries.find((e) => e.kind === 'sales' && e.body?.date === selectedDate && (!effectiveStoreId || !e.body?.storeId || e.body.storeId === effectiveStoreId));
 const blockedByPendingSave = () => {
 if (!pendingDayClose && !isPendingId(editingId)) return false;
 toast.info('This day close is still waiting to send from this phone. Try again once it has been sent.');
 return true;
 };

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
 // Legacy daily-typed-in payouts only (kept for historical months). Uploaded
 // aggregator settlements reach the Paytm balance through context.aggregatorSettlements;
 // they used to be copied in here as well, which counted every settlement twice.
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
 if (!result?.skipped && result?.success) await context.refreshData();
 // Between 11:50 PM and 6:10 AM the server pauses syncs and says so - a calm notice, not an error.
 toastPosSyncResult(result, isViewingPastDate ? `Re-synced ${selectedDate}` : t('dc.syncedToast'));
 } catch (error: any) {
 toastPosSyncError(error);
 } finally {
 setIsSyncingPos(false);
 }
 };

 const handleRequestTopup = async () => {
 const amount = topupAmount ?? 0;
 if (!amount || amount <= 0) {
 toast.error('Please enter a valid amount');
 return;
 }
 if (!context.user?.accessToken) return;

 setIsSubmittingTopup(true);
 try {
 await api.requestCashTopup(context.user.accessToken, topupDate, amount, topupReason);
 toast.success(t('topup.sentToast'));
 setShowTopupModal(false);
 setTopupAmount(null);
 setTopupReason(defaultTopupReason);
 loadTopupRequests();
 } catch (error: any) {
 toast.error(error?.message || 'Failed to send cash top-up request');
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
 const filteredSales = effectiveStoreId
 ? context.salesData.filter(s => s.storeId === effectiveStoreId)
 : context.salesData;
 return filteredSales.find(s => s.date === selectedDate);
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
 // Skips POS-sync/top-up placeholder rows: their blank (or old 0) count isn't a count.
 return [...storeFilteredSales]
 .filter(s => s.date < selectedDate && countedCashInHand(s) !== null)
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

 // Calculate total expenses for the day (money/dayCloseMath.ts)
 const totalExpenses = useMemo(() => dayCloseTotalExpenses({
 inventory: context.inventory, overheads: context.overheads, fixedCosts: context.fixedCosts,
 selectedDate, effectiveStoreId, effectiveProductionHouseId,
 }), [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, effectiveProductionHouseId]);

 // Same totalExpenses figure, but split by who actually spent it - the store's own
 // purchases vs. production house spend that's charged against this store's cash. Feeds
 // the compact expense breakdown popover instead of one lumped "all expenses" number.
 // production stays 0 from PRODUCTION_CASH_GO_LIVE_DATE onward, matching totalExpenses
 // above no longer including it - see that useMemo's comment for why.
 const expenseBreakdownByEntity = useMemo(() => dayCloseExpenseBreakdown({
 inventory: context.inventory, overheads: context.overheads, fixedCosts: context.fixedCosts,
 selectedDate, effectiveStoreId, effectiveProductionHouseId,
 }), [context.inventory, context.overheads, context.fixedCosts, selectedDate, effectiveStoreId, effectiveProductionHouseId]);


 // Calculate expected cash for current form data (incl. event stall cash in / out)
 const expectedCashInHand = useMemo(() => dayCloseExpectedCash({
 previousCashInHand: formData.previousCashInHand,
 cashAmount: formData.cashAmount,
 usedOnlineMoney: formData.usedOnlineMoney,
 totalExpenses,
 totalContractPayout,
 salesForDate,
 }), [formData.previousCashInHand, formData.cashAmount, totalExpenses, formData.usedOnlineMoney, totalContractPayout, salesForDate]);

 // Calculate cash discrepancy
 const cashDiscrepancy = useMemo(() => dayCloseCashDiscrepancy(formData.actualCashInHand, expectedCashInHand), [formData.actualCashInHand, expectedCashInHand]);

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
 }).balance;
 }, [context.salesData, context.overheads, context.aggregatorSettlements, context.onlineCashRecalibrations, onlinePayoutData, onlineLoans, employeePayouts, topupRequests, selectedDate, effectiveStoreId, formData.paytmAmount, formData.usedOnlineMoney]);

 // Paytm balance only ever moves through tracked mechanisms (cash top-ups drawn from
 // it, salary/rent payouts drawn from it) - unlike physical cash, there's no way for it
 // to go missing or be miscounted, so it's auto-synced from the computed balance instead
 // of asking the store incharge to manually "count" and enter it (which used to also
 // produce a meaningless discrepancy warning whenever they typed a slightly different
 // number than what was already fully determined by logged transactions).
 // Watches the field too, not just the computed figure: the load effect below runs after
 // this one and puts the day's SAVED balance back into the form, and when reopening a saved
 // day leaves the computed figure unchanged nothing re-synced it - a stale saved balance then
 // showed as a Paytm shortage needing approval.
 useEffect(() => {
 const computed = calculatePaytmBalance.toFixed(2);
 if (formData.actualPaytmBalance !== computed) {
 setFormData((prev) => ({ ...prev, actualPaytmBalance: computed }));
 }
 }, [calculatePaytmBalance, formData.actualPaytmBalance]);

 // Always 0 now that actualPaytmBalance is auto-synced above - kept as a real
 // computation (not hardcoded) so nothing downstream needs special-casing.
 const paytmDiscrepancy = useMemo(() => {
 const actual = parseFloat(formData.actualPaytmBalance) || 0;
 if (actual === 0) return 0;
 return actual - calculatePaytmBalance;
 }, [formData.actualPaytmBalance, calculatePaytmBalance]);

 const needsPaytmApproval = Math.abs(paytmDiscrepancy) > 200;

 // Display only (the daily breakdown below): Swiggy/Zomato money in per day - the old
 // hand-typed payouts plus uploaded settlements. Never fed into calculatePaytmBalance,
 // which takes settlements from context.aggregatorSettlements itself.
 const payoutsForDisplay = useMemo(() => {
 const settlementPayouts: api.OnlinePayoutEntry[] = (context.aggregatorSettlements || []).map((s) => ({
 id: `SETTLEMENT-${s.id}`,
 date: s.settlementDate,
 storeId: s.storeId,
 swiggyPayout: s.aggregator === 'swiggy' ? (s.netPayout || 0) : 0,
 zomatoPayout: s.aggregator === 'swiggy' ? 0 : (s.netPayout || 0),
 createdAt: '',
 }));
 return [...onlinePayoutData, ...settlementPayouts];
 }, [onlinePayoutData, context.aggregatorSettlements]);

 // Calculate today's actual online payout (Swiggy + Zomato)
 const todaysActualOnlinePayout = useMemo(() => {
 const storeFilteredPayouts = effectiveStoreId
 ? payoutsForDisplay.filter(p => p.storeId === effectiveStoreId)
 : payoutsForDisplay;
 return storeFilteredPayouts
 .filter(p => p.date === selectedDate)
 .reduce((sum, p) => sum + (p.swiggyPayout ?? 0) + (p.zomatoPayout ?? 0), 0);
 }, [payoutsForDisplay, selectedDate, effectiveStoreId]);

 // Calculate daily breakdown for Paytm/Online Cash
 const paytmDailyBreakdown = useMemo(() => computePaytmDailyBreakdown({
 salesData: context.salesData,
 fixedCosts: context.fixedCosts,
 overheads: context.overheads,
 inventory: context.inventory,
 payoutsForDisplay,
 employeePayouts,
 onlineLoans,
 selectedDate,
 effectiveStoreId,
 lastOnlineRecalibration,
 }), [context.salesData, context.fixedCosts, context.overheads, context.inventory, payoutsForDisplay, employeePayouts, onlineLoans, selectedDate, effectiveStoreId, lastOnlineRecalibration]);

 // Note: inventory/overhead/fixed-cost "payment method" (cash/online) splits don't drive
 // the Paytm figure - "Used Online Money" is sourced entirely from approved cash top-ups
 // (see calculatePaytmBalance and the usedOnlineMoney field). They do decide how much of a
 // bill came out of the till (totalExpenses above).

 // What the load below last put into the form, and for which store+date. The 5-minute
 // background refresh (App.tsx) hands this page fresh salesData, which re-runs the load;
 // for the same day it now only refreshes the fields nobody has changed since the last
 // load, instead of wiping a half-typed count.
 const lastLoadedRef = useRef<{ key: string; values: typeof formData } | null>(null);
 const formKey = `${effectiveStoreId || ''}|${selectedDate}`;

 // Load existing data when date changes
 useEffect(() => {
 const applyLoaded = (loaded: typeof formData) => {
 const last = lastLoadedRef.current;
 lastLoadedRef.current = { key: formKey, values: loaded };
 setFormData((prev) => {
 if (!last || last.key !== formKey) return loaded;
 const merged = { ...loaded };
 (Object.keys(loaded) as (keyof typeof loaded)[]).forEach((field) => {
 // actualPaytmBalance is never typed - the auto-sync effect above owns it.
 if (field !== 'actualPaytmBalance' && prev[field] !== last.values[field]) {
 (merged as Record<string, unknown>)[field] = prev[field];
 }
 });
 return merged;
 });
 };

 if (salesForDate) {
 // A record can exist for this date without ever having gotten a
 // previousCashInHand (e.g. the nightly POS auto-sync creates it with just
 // offline/online totals, before the store incharge does their own count) - in
 // that case previousCashInHand sits at null/undefined and used to silently
 // default to 0 instead of carrying yesterday's real closing balance forward.
 // Only trust that blank field as "really zero" once the day has actually been
 // reconciled (a real count saved) - before that, recompute it live the same
 // way a brand-new entry below does, so today's card is never a stale zero.
 // A POS-sync/top-up placeholder's blank (or old 0) count is not a count.
 const countedToday = countedCashInHand(salesForDate);
 const isReconciled = countedToday !== null;
 const hasStoredPrevCash = salesForDate.previousCashInHand !== undefined && salesForDate.previousCashInHand !== null;
 let prevCashForExisting = salesForDate.previousCashInHand ?? 0;
 if (!isReconciled && !hasStoredPrevCash) {
 prevCashForExisting = countedCashInHand(previousDateSales) ?? countedCashInHand(latestPriorCashSales) ?? 0;
 }
 // From PRODUCTION_CASH_GO_LIVE_DATE onward, the store's leftover cash is assumed fully
 // handed over each night (it becomes production's opening balance instead - see
 // ProductionManagement.tsx's Cash in Hand tab) - so the store's own carry-forward chain
 // stops here and every day starts fresh at 0, overriding whatever the logic above found.
 if (selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE) {
 prevCashForExisting = 0;
 }

 applyLoaded({
 offlineSales: (salesForDate.offlineSales ?? 0).toString(),
 paytmAmount: (salesForDate.paytmAmount ?? 0).toString(),
 cashAmount: (salesForDate.cashAmount ?? 0).toString(),
 employeeSalary: (salesForDate.employeeSalary ?? 0).toString(),
 previousCashInHand: prevCashForExisting.toString(),
 // Driven entirely by approved cash top-ups now, not manually entered or
 // auto-calculated from inventory/overhead/fixed-cost payment method splits.
 usedOnlineMoney: (salesForDate.usedOnlineMoney ?? 0).toString(),
 // Left blank until someone has really counted - a placeholder's 0 used to pre-fill
 // the required box and could be saved as a real "₹0 in hand".
 actualCashInHand: countedToday !== null ? countedToday.toString() : '',
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
 // Yesterday's real count (which includes any offset); if yesterday hasn't been
 // reconciled yet, keep carrying the last known close instead of resetting to zero.
 prevCash = countedCashInHand(previousDateSales) ?? countedCashInHand(latestPriorCashSales) ?? 0;
 }
 // Else (on/after go-live): stays 0 - see the comment on the "existing record" branch
 // above for why the store's carry-forward chain stops at PRODUCTION_CASH_GO_LIVE_DATE.

 applyLoaded({
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
 }, [formKey, salesForDate, previousDateSales, latestPriorCashSales]);

 // Keeps the draft up to date on every change to the count fields (typed or voice-filled),
 // not only when "Save Progress" is pressed: just the fields that differ from what was
 // loaded, so a field changed back to the saved figure stops overriding it. Skips the run
 // where the day changes - the form still holds the previous day's figures at that point.
 const draftForKeyRef = useRef<string | null>(null);
 useEffect(() => {
 const last = lastLoadedRef.current;
 const dayChanged = draftForKeyRef.current !== formKey;
 draftForKeyRef.current = formKey;
 if (dayChanged || !draftKey || !last || last.key !== formKey) return;
 const edited = (['paytmAmount', 'cashAmount', 'actualCashInHand', 'cashOverShortReason', 'cashOverShortNote'] as const)
 .filter((field) => formData[field] !== last.values[field]);
 try {
 if (edited.length === 0) {
 localStorage.removeItem(draftKey);
 } else {
 localStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(edited.map((field) => [field, formData[field]]))));
 }
 } catch {
 // Storage blocked or full - the form still works, the draft just isn't kept.
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [formKey, formData.paytmAmount, formData.cashAmount, formData.actualCashInHand, formData.cashOverShortReason, formData.cashOverShortNote]);

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
 const proceed = await confirm({
 title: t('dc.bigDiffTitle'),
 body: `There's a ${parts.join(' and ')}. This will need cluster head approval before it's final.`,
 confirmLabel: t('dc.sendAnyway'),
 });
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
 toast.error('You do not have permission to save sales data.');
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
 toast.error(t('dc.confirmCheckFirst'));
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
 
 // With no signal (or one that drops mid-save) the day close waits on this phone and sends by
 // itself later (App.tsx saveViaOutbox, which also says so) - `queued` then.
 let outcome: Awaited<ReturnType<typeof context.addSalesData>>;
 if (isEditing && editingId) {
 console.log('📝 Mode: UPDATING existing sales data');
 console.log('🆔 Editing ID:', editingId);
 console.log('⏱️ Calling context.updateSalesData...');
 outcome = await context.updateSalesData(editingId, salesData);
 console.log('✅ Update successful');
 } else {
 console.log('➕ Mode: ADDING new sales data');
 console.log('⏱️ Calling context.addSalesData...');
 outcome = await context.addSalesData(salesData);
 console.log('✅ Add successful');
 }

 // Not awaited: on a weak signal this read could hold the "saved" message for a minute.
 console.log('─────────────────────────────────────────────────────────────');
 console.log('🔄 Step 2: Reloading employee payouts...');
 loadEmployeePayouts();

 console.log('═══════════════════════════════════════════════════════════════');
 console.log('🎉 ALL SAVES COMPLETED SUCCESSFULLY!');
 console.log('═══════════════════════════════════════════════════════════════');
 clearDraft();
 if (!outcome?.queued) toast.success(t('dc.sentToast'));
 } catch (error) {
 console.log('═══════════════════════════════════════════════════════════════');
 console.log('❌ ERROR DURING SAVE PROCESS');
 console.log('═══════════════════════════════════════════════════════════════');
 console.error('💥 Error details:', error);
 console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
 console.error('💥 Error message:', error instanceof Error ? error.message : String(error));
 toast.error(t('dc.sendFailed'));
 } finally {
 console.log('🔓 Resetting isSubmitting to false');
 setIsSubmitting(false);
 }
 };

 const handleApprove = async () => {
 if (!editingId) return;
 if (blockedByPendingSave()) return;
 try {
 await context.approveSalesData(editingId);
 toast.success('Sales data approved');
 } catch (error) {
 toast.error('Failed to approve sales data. Please try again.');
 }
 };

 const handleRequestApproval = async () => {
 if (!editingId) return;
 if (blockedByPendingSave()) return;
 const actualCash = parseFloat(formData.actualCashInHand) || 0;
 const offset = actualCash - expectedCashInHand;
 const actualPaytm = parseFloat(formData.actualPaytmBalance) || 0;
 const paytmOffset = actualPaytm - calculatePaytmBalance;
 
 if (!(await confirm({ title: t('dc.askApprovalTitle', { amount: formatINR(Math.abs(offset)) }), body: t('dc.askApprovalBody'), confirmLabel: t('dc.askApproval') }))) {
 return;
 }
 
 try {
 await context.requestSalesApproval(editingId, actualCash, offset);
 toast.success(t('dc.askedToast'));
 } catch (error) {
 toast.error('Failed to request approval. Please try again.');
 }
 };

 const handleApproveDiscrepancy = async (saleId: string) => {
 if (!(await confirm({ title: 'Approve this difference?', body: 'The new cash amount will be accepted.', confirmLabel: 'Approve' }))) {
 return;
 }
 try {
 await context.approveDiscrepancy(saleId);
 toast.success('Difference approved');
 } catch (error) {
 toast.error('Failed to approve discrepancy. Please try again.');
 }
 };

 const handleRejectDiscrepancy = async (saleId: string) => {
 const reason = await promptText({ title: 'Reject this difference?', label: 'Reason', required: true, confirmLabel: 'Reject', tone: 'danger' });
 if (!reason) return;
 
 try {
 await context.rejectDiscrepancy(saleId, reason);
 toast.success('Rejected - the incharge pays the difference.');
 } catch (error) {
 toast.error('Failed to reject discrepancy. Please try again.');
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
 const { offlineSalesTotal, offlinePaymentDiscrepancy, paymentMismatch } = offlinePaymentCheck({
 offlineSales: formData.offlineSales,
 categoryOffline: categorySalesChannelRevenue.offline,
 paytmAmount: formData.paytmAmount,
 cashAmount: formData.cashAmount,
 });

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

 // Voice cash count: "ajke cash 3400, ar paytm 3500, ar cash in hand ache 3000" fills Cash, Paytm
 // and Actual Cash in Hand (only the boxes this person may edit), to check before saving.
 const [voiceBusy, setVoiceBusy] = useState(false);
 const [voiceHeard, setVoiceHeard] = useState<string | null>(null);
 const fillSalesFromVoice = async (text: string) => {
 const token = context.user?.accessToken;
 if (!token) return;
 setVoiceBusy(true);
 try {
 const f = await api.voiceFill(token, 'sales', text);
 const updates: Partial<typeof formData> = {};
 const filled: string[] = [];
 if (f.paytm !== null && canEditSales) { updates.paytmAmount = String(f.paytm); filled.push(`Paytm ₹${f.paytm.toLocaleString('en-IN')}`); }
 if (f.cash !== null && canEditSales) { updates.cashAmount = String(f.cash); filled.push(`Cash ₹${f.cash.toLocaleString('en-IN')}`); }
 if (f.cashInHand !== null && canReconcileCash) { updates.actualCashInHand = String(f.cashInHand); filled.push(`Cash in hand ₹${f.cashInHand.toLocaleString('en-IN')}`); }
 setFormData((prev) => ({ ...prev, ...updates }));
 setVoiceHeard(`"${text}"${f.unclear ? ` - not used: ${f.unclear}` : ''}`);
 if (filled.length) toast.success(`Filled ${filled.join(', ')} - check, then save`);
 else toast.error('No amounts found in that. Try: "cash 3400, paytm 3500, cash in hand 3000"');
 } catch (e: any) {
 toast.error(e?.message || 'Could not read that');
 } finally {
 setVoiceBusy(false);
 }
 };

 // ---- Day close screen (wireframe DayClose) ----------------------------------------------
 const [formulaOpen, setFormulaOpen] = useState(false);
 const paytmInputRef = useRef<HTMLInputElement>(null);
 const showPayoutsTab = useShellHasMoneyTab('SalesManagement', 'payout');
 const showLoansTab = useShellHasMoneyTab('SalesManagement', 'loans');
 const canEnter = canEditSales || canReconcileCash;
 const syncTooEarly = posSyncTooEarly(selectedDate, getTodayIST());
 const countedToday = salesForDate ? countedCashInHand(salesForDate) : null;
 const eventCashIn = (salesForDate as any)?.eventCashIn || 0;
 const eventCashOut = (salesForDate as any)?.eventCashOut || 0;
 const syncedAt: string | undefined = (salesForDate as any)?.syncedAt;
 // syncedAt digits are already IST wall-clock time (written with a "Z"), so read them as UTC.
 const syncedLabel = syncedAt ? new Date(syncedAt).toLocaleString('en-IN', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true }) : null;
 const lastLoaded = lastLoadedRef.current;
 const editedNow = !!lastLoaded && lastLoaded.key === formKey
 && (['paytmAmount', 'cashAmount', 'actualCashInHand', 'cashOverShortReason', 'cashOverShortNote'] as const).some((f) => formData[f] !== lastLoaded.values[f]);
 const dayStatus: DayStatus = pendingDayClose
 ? { kind: 'waiting' }
 : salesForDate?.rejectedBy
 ? { kind: 'rejected', by: salesForDate.rejectedBy, at: salesForDate.rejectedAt, reason: salesForDate.rejectionReason }
 : salesForDate?.approvedBy
 ? { kind: 'approved', by: salesForDate.approvedBy, at: salesForDate.approvedAt }
 : isEditing && countedToday !== null
 ? { kind: 'submitted', asked: !!salesForDate?.approvalRequested, needsApproval: salesForDate?.approvalStatus === 'pending' }
 : editedNow
 ? { kind: 'draft' }
 : { kind: 'notStarted' };
 const fixAndResubmit = () => {
 paytmInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
 paytmInputRef.current?.focus();
 };
 const reasonOptions = (['missed_kot', 'wrong_change', 'tip', 'counting_mistake', 'other'] as const).map((key) => ({ value: key, label: t(`dc.reason.${key}` as I18nKey) }));
 const prevCashNum = parseFloat(formData.previousCashInHand) || 0;
 const topupNum = parseFloat(formData.usedOnlineMoney) || 0;
 const cashNum = parseFloat(formData.cashAmount) || 0;
 const formulaLines: FormulaLine[] = [
 { label: t('dc.f.prev'), amount: prevCashNum, sign: '' as const },
 { label: t('dc.f.topup'), amount: topupNum, sign: '+' as const },
 { label: t('dc.f.collected'), amount: cashNum, sign: '+' as const },
 ...(eventCashIn ? [{ label: t('dc.f.eventIn'), amount: eventCashIn, sign: '+' as const }] : []),
 ...(eventCashOut ? [{ label: t('dc.f.eventOut'), amount: eventCashOut, sign: '−' as const }] : []),
 { label: t('dc.f.spent'), amount: totalExpenses, sign: '−' as const },
 ];
 const pendingRequests = context.salesData.filter(s => s.approvalRequested && !s.approvedBy && !s.rejectedBy);
 const legacyPending = context.salesData.filter(s => s.approvalRequired && !s.approvedBy && !s.approvalRequested);
 const opsPending = context.salesData.filter(s => s.approvalStatus === 'pending' && s.createdBy !== context.user?.employeeId);
 const backToDayClose = (
 <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft />} onClick={() => setActiveTab('entry')} className="self-start">{t('dc.backToDayClose')}</Button>
 );

 return (
 <MoneyPage lang={lang}>
 {activeTab === 'entry' && (
 <>
 <DayBand value={selectedDate} onChange={setSelectedDate} />

 <MoneyWaiting kinds={['sales']} date={selectedDate} />
 <DayStatusBanner status={dayStatus} onFix={canEnter ? fixAndResubmit : undefined} readOnly={!canEnter} />

 {/* Friday weekly cash count - the same day close records it, so it queues offline the same way. */}
 {isFriday && context.isManager && (
 <Callout tone="info" title={t('dc.fridayTitle')}>{t('dc.fridayBody')}</Callout>
 )}

 {/* Cluster head: discrepancy approval requests (the owner normally reviews in SalesView). */}
 {isClusterHead && pendingRequests.length > 0 && (
 <ListGroup title={t('dc.approvalRequests')}>
 {pendingRequests.map((sale) => {
 const expected = (sale.actualCashInHand ?? 0) - sale.cashOffset;
 const requested = sale.requestedCashInHand || 0;
 return (
 <div key={sale.id} className="flex flex-col">
 <ListRow title={formatDateIST(sale.date)} subtitle={`Expected ${formatINR(expected)} · counted ${formatINR(requested)}`} trailing={<DiffChip diff={requested - expected} />} />
 <div className="flex gap-2 px-4 pb-3">
 <Button variant="danger-ghost" size="sm" onClick={() => handleRejectDiscrepancy(sale.id)}>Reject</Button>
 <Button variant="secondary" size="sm" leadingIcon={<Check />} onClick={() => handleApproveDiscrepancy(sale.id)}>Approve</Button>
 </div>
 </div>
 );
 })}
 </ListGroup>
 )}
 {isClusterHead && legacyPending.length > 0 && (
 <ListGroup title={t('dc.pendingApprovals')}>
 {legacyPending.map((sale) => (
 <ListRow
 key={sale.id}
 title={formatDateIST(sale.date)}
 subtitle={`Expected ${formatINR((sale.actualCashInHand ?? 0) - sale.cashOffset)} · counted ${formatINR(sale.actualCashInHand ?? 0)}`}
 trailing={canApproveSales ? (
 <Button variant="secondary" size="sm" leadingIcon={<Check />} onClick={async () => {
 try {
 await context.approveSalesData(sale.id);
 toast.success('Approved');
 } catch (error) {
 toast.error('Failed to approve. Please try again.');
 }
 }}>Approve</Button>
 ) : <StatusChip status="approval.pending" />}
 />
 ))}
 </ListGroup>
 )}

 <Section
 title={t('dc.posTitle')}
 action={canEditSales ? (
 <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className={isSyncingPos ? 'animate-spin' : undefined} />} onClick={handleSyncPosNow} disabled={isSyncingPos || syncTooEarly}>
 {isSyncingPos ? t('dc.syncing') : t('dc.syncNow')}
 </Button>
 ) : undefined}
 >
 {canEditSales && syncTooEarly && <p className="-mt-1 text-label text-text-3">{t('dc.syncOpensAt3')}</p>}
 <FigureCard>
 <FigureRow label={t('dc.posTotal')} caption={syncedLabel ? t('dc.syncedAt', { time: syncedLabel }) : t('dc.notSynced')} value={formatINR(offlineSalesTotal + onlineSalesTotal)} emphasis />
 <FigureRow label={t('dc.counter')} caption={t('dc.counterSub')} value={formatINR(offlineSalesTotal)} />
 <FigureRow label="Zomato" value={formatINR(onlineSalesEntryForDate?.zomatoSales || 0)} />
 <FigureRow label="Swiggy" value={formatINR(onlineSalesEntryForDate?.swiggySales || 0)} />
 </FigureCard>
 </Section>

 <form id="day-close-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
 <Section
 title={t('dc.countTitle')}
 action={canEnter ? <VoiceButton onText={fillSalesFromVoice} busy={voiceBusy} label={t('voice.speak')} prompt="যেমন: আজকে ক্যাশ ৩৪০০, পেটিএম ৩৫০০, হাতে আছে ৩০০০" /> : undefined}
 >
 {voiceHeard && <p className="-mt-1 text-label text-text-2">{t('dc.heard', { text: voiceHeard })}</p>}
 <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
 {canEnter && <p className="text-body-sm text-text-2">{t('dc.countHint')}</p>}
 <Field label={t('dc.paytmReceived')} required disabled={!canEditSales}>
 <MoneyInput ref={paytmInputRef} value={formData.paytmAmount} onValueChange={(_, raw) => setFormData({ ...formData, paytmAmount: raw })} required disabled={!canEditSales} />
 </Field>
 <Field label={t('dc.cashCollected')} required disabled={!canEditSales}>
 <MoneyInput value={formData.cashAmount} onValueChange={(_, raw) => setFormData({ ...formData, cashAmount: raw })} required disabled={!canEditSales} />
 </Field>
 <Field label={t('dc.cashInDrawer')} required disabled={!canReconcileCash} helper={!canReconcileCash ? t('dc.enteredByIncharge') : t('dc.drawerHelp')}>
 <MoneyInput value={formData.actualCashInHand} onValueChange={(_, raw) => setFormData({ ...formData, actualCashInHand: raw })} required disabled={!canReconcileCash} />
 </Field>
 {/* Day 1 or the 1st of the month: the cash carried in, typed once. */}
 {(isFirstDay || isFirstOfMonth) && (
 <Field label={isFirstDay ? t('dc.openingDay1') : t('dc.openingMonth')} required disabled={!canEditSales} helper={isFirstDay ? t('dc.openingDay1Help') : t('dc.openingMonthHelp')}>
 <MoneyInput value={formData.previousCashInHand} onValueChange={(_, raw) => setFormData({ ...formData, previousCashInHand: raw })} required disabled={!canEditSales} />
 </Field>
 )}
 </div>
 </Section>

 <Section title={t('dc.matchTitle')}>
 <FigureCard>
 <FigureRow label={t('dc.counterSales')} caption={t('dc.fromPos')} value={formatINR(offlineSalesTotal)} />
 <FigureRow label={t('dc.youCounted')} caption={t('dc.paytmPlusCash')} value={formatINR((parseFloat(formData.paytmAmount) || 0) + (parseFloat(formData.cashAmount) || 0))} />
 <div className="flex min-h-13 items-center gap-3 px-4 py-2">
 <span className="flex-1 text-body-md font-medium text-text">{t('dc.difference')}</span>
 <DiffChip diff={-offlinePaymentDiscrepancy} notCounted={offlineSalesTotal <= 0} />
 </div>
 </FigureCard>

 {/* Cash + Paytm doesn't match the counter sales: real money that went missing or came in
 extra - booked with a reason as its own Cash Over/Short line, never into Sales. */}
 {paymentMismatch && (
 <div className="flex flex-col gap-3 rounded-lg border border-warning-border bg-warning-soft p-4">
 <p className="text-body-sm font-semibold text-text">
 {offlinePaymentDiscrepancy > 0 ? t('dc.whyShort', { amount: formatINR(Math.abs(offlinePaymentDiscrepancy)) }) : t('dc.whyExcess', { amount: formatINR(Math.abs(offlinePaymentDiscrepancy)) })}
 </p>
 <p className="text-label text-text-2">{t('dc.overShortNote')}</p>
 <ChoiceChips
 aria-label={t('dc.reason')}
 value={formData.cashOverShortReason || ('' as never)}
 onValueChange={(v) => canEditSales && setFormData({ ...formData, cashOverShortReason: v })}
 options={reasonOptions.map((o) => ({ ...o, disabled: !canEditSales }))}
 />
 <Field label={t('dc.reasonNote')} optional disabled={!canEditSales}>
 <Textarea value={formData.cashOverShortNote} onChange={(e) => setFormData({ ...formData, cashOverShortNote: e.target.value })} disabled={!canEditSales} rows={2} />
 </Field>
 </div>
 )}

 <FigureCard>
 <div className="flex min-h-13 items-center gap-3 px-4 py-2">
 <span className="flex min-w-0 flex-1 flex-col">
 <span className="text-body-md font-medium text-text">{t('dc.expectedDrawer')}</span>
 <Button variant="link" size="sm" className="self-start text-label" onClick={() => setFormulaOpen(true)}>{t('dc.howWorkedOut')}</Button>
 </span>
 <span className="num text-body-md font-semibold text-text">{formatINR(expectedCashInHand)}</span>
 </div>
 <FigureRow label={t('dc.inDrawer')} caption={t('dc.youCounted')} value={formData.actualCashInHand ? formatINR(parseFloat(formData.actualCashInHand) || 0) : '–'} />
 <div className="flex min-h-13 items-center gap-3 px-4 py-2">
 <span className="flex-1 text-body-md font-medium text-text">{t('dc.difference')}</span>
 <DiffChip diff={cashDiscrepancy} notCounted={!(parseFloat(formData.actualCashInHand) > 0)} />
 </div>
 </FigureCard>
 {cashDiscrepancy !== 0 && parseFloat(formData.actualCashInHand) > 0 && Math.abs(cashDiscrepancy) > 200 && (
 <Callout tone="warning" title={t('dc.needsApproval')} />
 )}

 {/* Ask for approval once a big difference is saved (until someone approves or it's asked). */}
 {canEnter && isEditing && editingId && countedToday !== null && (needsApproval || needsPaytmApproval || posTotalMismatch) && !salesForDate?.approvedBy && !salesForDate?.approvalRequested && (
 <Button variant="secondary" leadingIcon={<AlertTriangle />} onClick={handleRequestApproval} className="self-start">{t('dc.askApproval')}</Button>
 )}
 </Section>

 {/* Paytm moves only through logged top-ups and payouts, so nobody counts it. */}
 <Section title={t('dc.paytmTitle')}>
 <FigureCard>
 <div className="flex min-h-15 items-center gap-3 px-4 py-2.5">
 <IconWell icon={Smartphone} />
 <span className="flex min-w-0 flex-1 flex-col">
 <span className="text-body-md font-medium text-text">{t('dc.paytmBalance')}</span>
 <span className="text-label text-text-3">{t('dc.autoTracked')}</span>
 </span>
 <span className="num text-body-md font-semibold text-text">{formatINR(calculatePaytmBalance)}</span>
 </div>
 <div className="px-2 py-1">
 <Button variant="ghost" size="sm" onClick={() => setShowPaytmBreakdown(true)}>{t('dc.breakdown')}</Button>
 </div>
 </FigureCard>
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
 </Section>
 </form>

 {/* Cash top-up: ask the cluster head for more physical cash when the till runs low. */}
 <ListGroup
 title={t('topup.title')}
 action={<Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => { setTopupDate(selectedDate); setShowTopupModal(true); }}>{t('topup.request')}</Button>}
 empty={<p className="px-4 py-4 text-body-sm text-text-2">{t('topup.none')}</p>}
 footer={t('topup.sub')}
 >
 {myPendingTopups.map((r) => <TopupRow key={r.id} request={r} />)}
 </ListGroup>
 <CashTopupHistory requests={topupRequests} />

 {/* Payouts and loans: their own tabs where the shell has them, otherwise one tap from here. */}
 {(!showPayoutsTab || !showLoansTab) && (
 <ListGroup overline={t('dc.more')}>
 {!showPayoutsTab && <ListRow icon={FileSpreadsheet} title={t('dc.payouts')} subtitle={t('dc.payoutsSub')} onClick={() => setActiveTab('payout')} />}
 {!showLoansTab && <ListRow icon={HandCoins} title={t('dc.loans')} subtitle={t('dc.loansSub')} onClick={() => setActiveTab('loans')} />}
 </ListGroup>
 )}

 {/* Operations manager: sales waiting for approval. */}
 {isOperationsManager && (
 <ListGroup title="Sales waiting for approval" empty={<EmptyState compact icon={CheckCircle} title={t('empty.allCaughtUp')} />}>
 {opsPending.map((sale) => (
 <div key={sale.id} className="flex flex-col">
 <ListRow
 title={formatDateIST(sale.date)}
 subtitle={`By ${sale.createdBy} · sales ${formatINR(sale.offlineSales + sale.onlineSales)} · ${countedCashInHand(sale) !== null ? `cash ${formatINR(sale.actualCashInHand ?? 0)}` : 'not counted yet'}`}
 />
 <div className="flex gap-2 px-4 pb-3">
 <Button variant="danger-ghost" size="sm" onClick={async () => {
 try {
 await (context as any).rejectSalesData(sale.id);
 toast.success('Sales rejected');
 } catch (error) {
 toast.error('Failed to reject sales');
 }
 }}>Reject</Button>
 <Button variant="secondary" size="sm" leadingIcon={<Check />} onClick={async () => {
 try {
 await context.approveSalesData(sale.id);
 toast.success('Sales approved');
 } catch (error) {
 toast.error('Failed to approve sales');
 }
 }}>Approve</Button>
 </div>
 </div>
 ))}
 </ListGroup>
 )}

 {canEnter && (
 <StickyFooter>
 <Button variant="secondary" size="lg" onClick={handleSaveDraft}>{t('dayClose.saveDraft')}</Button>
 <Button type="submit" form="day-close-form" size="lg" className="flex-1" loading={isSubmitting}>
 {isEditing && countedToday !== null ? t('dc.sendAgain') : t('dayClose.send')}
 </Button>
 </StickyFooter>
 )}
 </>
 )}

 {activeTab === 'payout' && (
 <>
 {!showPayoutsTab && backToDayClose}
 <OnlineSalesTab
 context={context}
 selectedStoreId={effectiveStoreId}
 selectedDate={selectedDate}
 onDateChange={setSelectedDate}
 />
 </>
 )}

 {activeTab === 'loans' && (
 <>
 {!showLoansTab && backToDayClose}
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
 </>
 )}

 <FormulaSheet
 open={formulaOpen}
 onOpenChange={setFormulaOpen}
 title={t('dc.formulaTitle')}
 lines={formulaLines}
 totalLabel={t('dc.expectedDrawer')}
 total={expectedCashInHand}
 note={t('dc.formulaNote')}
 breakdown={expenseBreakdownByEntity}
 />

 <PaytmBreakdownSheet
 open={showPaytmBreakdown}
 onOpenChange={setShowPaytmBreakdown}
 rows={paytmDailyBreakdown}
 balance={calculatePaytmBalance}
 selectedDate={selectedDate}
 />

 <TopupSheet
 open={showTopupModal}
 onOpenChange={setShowTopupModal}
 mode="request"
 value={{ date: topupDate, amount: topupAmount, reason: topupReason, destination: '', storeId: '' }}
 onChange={(v) => { setTopupDate(v.date); setTopupAmount(v.amount); setTopupReason(v.reason); }}
 onSubmit={handleRequestTopup}
 submitting={isSubmittingTopup}
 reasonChoices={['store_inventory', 'production_inventory', 'other']}
 />

 {/* Send: what is being confirmed, and the responsibility tick. */}
 <ResponsiveModal
 open={showConfirmDialog}
 onOpenChange={(open) => { if (!open) handleCancelDialog(); }}
 title={t('dc.confirmTitle')}
 footer={
 <>
 <Button variant="secondary" size="lg" onClick={handleCancelDialog}>{t('common.cancel')}</Button>
 <Button size="lg" className="flex-1" onClick={handleConfirmSubmit} disabled={!confirmationChecked}>{t('dayClose.send')}</Button>
 </>
 }
 >
 <div className="flex flex-col gap-4">
 <FigureCard>
 <FigureRow label={t('dc.counterSales')} value={formatINR(parseFloat(formData.offlineSales) || 0)} />
 <FigureRow label={t('dc.expectedDrawer')} value={formatINR(expectedCashInHand)} />
 <FigureRow label={t('dc.inDrawer')} value={formatINR(parseFloat(formData.actualCashInHand) || 0)} />
 </FigureCard>
 <div className={cn('flex flex-col items-center gap-1 rounded-lg border p-4 text-center', cashDiscrepancy === 0 ? 'border-success-border bg-success-soft' : Math.abs(cashDiscrepancy) > 200 ? 'border-danger-border bg-danger-soft' : 'border-warning-border bg-warning-soft')}>
 <DiffChip diff={cashDiscrepancy} />
 <span className={cn('num text-display font-semibold', cashDiscrepancy === 0 ? 'text-success' : cashDiscrepancy > 0 ? 'text-warning' : 'text-danger')}>
 {cashDiscrepancy === 0 ? formatINR(0) : formatINR(cashDiscrepancy, { sign: true })}
 </span>
 </div>
 {(calculatePaytmBalance < 0 || (expectedCashInHand + calculatePaytmBalance) < 0) && (
 <Callout tone="danger" title={t('dc.negativeTitle')}>
 {calculatePaytmBalance < 0 && <span className="block">Paytm is negative: {formatINR(calculatePaytmBalance)}</span>}
 {(expectedCashInHand + calculatePaytmBalance) < 0 && <span className="block">Cash and Paytm together are negative: {formatINR(expectedCashInHand + calculatePaytmBalance)}</span>}
 </Callout>
 )}
 <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg bg-surface-2 p-4">
 <Checkbox checked={confirmationChecked} onCheckedChange={(v) => setConfirmationChecked(v === true)} className="mt-0.5" aria-label={t('dc.confirmCheck')} />
 <span className="text-body-sm text-text">{t('dc.confirmCheck')}</span>
 </label>
 </div>
 </ResponsiveModal>
 </MoneyPage>
 );
}
