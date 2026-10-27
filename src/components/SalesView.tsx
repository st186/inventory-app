import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { InventoryContextType, SalesData } from '../App';
import { DateSelector } from './DateSelector';
import { DatePicker } from './DatePicker';
import { OnlineSalesTab } from './OnlineSalesTab';
import { LoanManagementSection } from './LoanManagementSection';
import { CashTopupHistory } from './CashTopupHistory';
import { addDays, formatDateIST, formatDateTimeIST, getTodayIST } from '../utils/timezone';
import { getAssignedStoreIds, getDefaultStoreId } from '../utils/entityAccess';
import { getChannelRevenueFromCategorySales } from '../utils/salesRevenue';
import { computeExpectedPaytmBalance } from '../utils/paytmBalance';
import { approvedAfterCount } from '../utils/paytmRules';
import { paidOutsideStoreTill } from '../utils/cashSource';
import { PaytmLedger } from './PaytmLedger';
import { Eye, Lock, Banknote, Smartphone, Wallet, CheckCircle, Clock, PlusCircle, XCircle, IndianRupee, RefreshCw, FileSpreadsheet, HandCoins, AlertTriangle, TrendingUp, Factory } from 'lucide-react';
import { PaytmWeeklyReconciliation } from './PaytmWeeklyReconciliation';
import * as api from '../utils/api';
import { toast } from 'sonner';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  /** The tab to open on (the shell's Money > Payouts / Loans). */
  initialTab?: 'entry' | 'payout' | 'loans';
};

const TOPUP_REASON_LABELS: Record<api.CashTopupReason, string> = {
  store_inventory: 'Store Inventory',
  production_inventory: 'Production House Inventory',
  other: 'Other',
};

// Matches the backend's PRODUCTION_CASH_GO_LIVE_DATE (index.ts) and
// SalesManagement.tsx's own copy of the same constant exactly - see either for why.
const PRODUCTION_CASH_GO_LIVE_DATE = '2026-08-21';

const getSalesAmountTotal = (sale: SalesData) =>
  (sale.offlineSales || 0) +
  (sale.cashAmount || 0) +
  (sale.paytmAmount || 0) +
  (sale.onlineSales || 0);

const getOnlineEntryTotal = (sale: api.OnlineSalesEntry) =>
  (sale.zomatoSales || 0) + (sale.swiggySales || 0);

export function SalesView({ context, selectedStoreId, initialTab = 'entry' }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    getTodayIST()
  );
  const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
  const [employeePayouts, setEmployeePayouts] = useState<api.Payout[]>([]);
  const [topupRequests, setTopupRequests] = useState<api.CashTopupRequest[]>([]);
  const [showTopupModal, setShowTopupModal] = useState(false);
  // Defaults to whatever date the page happens to be on, but is independently editable in
  // the modal - confirmed real mistake: a topup requested a day (or more) after the date it
  // should count toward (a late vendor settlement, forgetting to switch the page's own
  // DateSelector first) used to silently apply to whatever date the page was showing, not
  // the date the requester actually meant.
  const [topupDate, setTopupDate] = useState(selectedDate);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupTargetStoreId, setTopupTargetStoreId] = useState('');
  // Cluster head only: where the cash goes - 'store:<id>' or 'ph:<productionHouseId>'.
  const [topupDestination, setTopupDestination] = useState('');
  const [isSubmittingTopup, setIsSubmittingTopup] = useState(false);
  const [resolvingTopupId, setResolvingTopupId] = useState<string | null>(null);
  const [resolvingDiscrepancyId, setResolvingDiscrepancyId] = useState<string | null>(null);
  const [isSyncingPos, setIsSyncingPos] = useState(false);
  const [showBulkSync, setShowBulkSync] = useState(false);
  const [bulkSyncStart, setBulkSyncStart] = useState(getTodayIST());
  const [bulkSyncEnd, setBulkSyncEnd] = useState(getTodayIST());
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [bulkSyncProgress, setBulkSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [onlineLoans, setOnlineLoans] = useState<api.OnlineLoan[]>([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);
  const [activeTab, setActiveTab] = useState<'entry' | 'payout' | 'loans'>(initialTab);

  const isOperationsManager =
    context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isClusterHead = context.user?.role === 'cluster_head';
  // Aniket (operations incharge) and Vijay (production incharge) between them handle almost
  // every production-side top-up request, but the reason field defaulted to "Store
  // Inventory" regardless of who was asking - an easy one-click mistake for the exact people
  // requesting production top-ups most often (confirmed against a real mis-tagged ₹3,806
  // request). Defaults to "Production Inventory" for that pair of roles now; still
  // changeable in the dropdown for the rarer genuine store top-up either of them needs.
  const defaultTopupReason: api.CashTopupReason = (isProductionIncharge || isOperationsManager) ? 'production_inventory' : 'store_inventory';
  const [topupReason, setTopupReason] = useState<api.CashTopupReason>(defaultTopupReason);
  // Production incharge has no store cash ledger of their own - they pick which store to
  // credit. Resolved via the explicit assignedStoreIds/assignedProductionHouseIds mapping
  // (falling back to the legacy single-storeId guess for employees not yet migrated) -
  // see src/utils/entityAccess.ts for why context.user.storeId alone can't be trusted here.
  const assignedStoreIds = useMemo(() => getAssignedStoreIds(context.user, context.stores || []), [context.user, context.stores]);
  const suppliedStores = context.stores?.filter(s => assignedStoreIds.includes(s.id)) || [];

  const selectedConcreteStoreId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : null;
  const scopedStoreIds = useMemo<string[] | null>(() => {
    if (selectedConcreteStoreId) return [selectedConcreteStoreId];
    if (isClusterHead) return context.managedStoreIds?.length ? context.managedStoreIds : null;
    if (assignedStoreIds.length > 0) return assignedStoreIds;
    return null;
  }, [selectedConcreteStoreId, isClusterHead, context.managedStoreIds, assignedStoreIds]);
  const scopedStoreIdSet = useMemo(() => scopedStoreIds ? new Set(scopedStoreIds) : null, [scopedStoreIds]);
  const matchesStoreScope = (storeId?: string | null) => !scopedStoreIdSet || (!!storeId && scopedStoreIdSet.has(storeId));
  const singleScopedStoreId = scopedStoreIds && scopedStoreIds.length === 1 ? scopedStoreIds[0] : null;
  const effectiveStoreId = singleScopedStoreId || getDefaultStoreId(context.user, context.stores || []);

  // Can this user manage aggregator payout reconciliation? (operations manager / cluster head only)
  const canManagePayouts = isOperationsManager || isClusterHead;

  useEffect(() => {
    if (!context.user?.accessToken) return;
    api.getOnlineSalesData(context.user.accessToken).then(setOnlineSalesData).catch(() => {});
  }, [context.user?.accessToken]);

  // Production Cash in Hand - relocated here from ProductionManagement.tsx's old "Cash in
  // Hand" tab (moved onto the Sales page instead, next to the store's own cash
  // reconciliation, where every other cash-in-hand figure already lives). Backend is
  // unchanged - same /production-cash routes, same PRODUCTION_CASH_GO_LIVE_DATE gate.
  //
  // Resolved for a single concrete store the same way as always (via that store's own
  // productionHouseId link). For the "all stores" aggregate view - confirmed bug: this
  // used to return null outright, so a cluster head landing on their default "All Stores
  // (Combined View)" never saw this card at all unless they first picked one specific
  // store - instead resolve every distinct production house linked to a store currently
  // in scope (scopedStoreIds, or every store if unrestricted) and use the first one. Only
  // one production house exists in practice today, so "the first" is unambiguous; a
  // second production house down the line would need this to show more than one card,
  // not silently pick one and hide the rest.
  const productionHouseIdForTotal = useMemo(() => {
    if (effectiveStoreId && effectiveStoreId !== 'all') {
      return context.stores?.find((s) => s.id === effectiveStoreId)?.productionHouseId || null;
    }
    const inScopeStoreIds = scopedStoreIds || (context.stores || []).map((s) => s.id);
    const linkedHouseIds = (context.stores || [])
      .filter((s) => inScopeStoreIds.includes(s.id) && s.productionHouseId)
      .map((s) => s.productionHouseId as string);
    return linkedHouseIds[0] || null;
  }, [effectiveStoreId, context.stores, scopedStoreIds]);

  // Can this user reconcile (edit) production cash, vs. just view it? Same split
  // Production Cash used on its old page: production incharge / operations manager
  // reconcile the physical count, cluster head approves a flagged discrepancy. Editing
  // itself still requires a single concrete store selected - saving from the ambiguous
  // "all stores" aggregate view isn't offered, same as every other edit action on this page.
  const canReconcileProductionCash = (isProductionIncharge || isOperationsManager) && effectiveStoreId !== 'all' && !!effectiveStoreId;

  const [productionCashEntry, setProductionCashEntry] = useState<api.ProductionCashEntry | null>(null);
  const [productionCashLive, setProductionCashLive] = useState<api.ProductionCashLive | null>(null);
  const [productionCashLoading, setProductionCashLoading] = useState(false);
  const [productionCashInput, setProductionCashInput] = useState('');
  const [productionCashSubmitting, setProductionCashSubmitting] = useState(false);

  // Confirmed real bug: switching the date selector never cleared the OLD date's
  // productionCashEntry/productionCashLive before the new fetch resolved, so "Live Cash
  // Position" (and every other card reading these) kept showing yesterday's number the
  // whole time the new one was loading - and, if two date switches happened close together,
  // an in-flight fetch for the FIRST date could resolve after the SECOND one and silently
  // overwrite it with stale data (no guard against out-of-order async resolution). Verified
  // against the live server directly: for 2026-08-25 it correctly returns 1345 (store's
  // 24 Aug actual ₹1,270 + production's own last-reconciled carry ₹75 from 22 Aug), so the
  // backend was never wrong - only the UI was still showing 24 Aug's ₹1,640.
  const productionCashRequestRef = useRef(0);
  const fetchProductionCash = async () => {
    const requestId = ++productionCashRequestRef.current;
    if (!context.user?.accessToken || !productionHouseIdForTotal || selectedDate < PRODUCTION_CASH_GO_LIVE_DATE) {
      setProductionCashEntry(null);
      setProductionCashLive(null);
      return;
    }
    // Clear the previous date's values immediately, before the new fetch even starts -
    // a loading/blank state is honest; a stale number from a different date is not.
    setProductionCashEntry(null);
    setProductionCashLive(null);
    setProductionCashLoading(true);
    try {
      const { entry, live } = await api.getProductionCashEntry(context.user.accessToken, productionHouseIdForTotal, selectedDate);
      if (requestId !== productionCashRequestRef.current) return; // a newer date/store change fired while this was in flight - discard
      setProductionCashEntry(entry);
      setProductionCashLive(live);
      setProductionCashInput(entry?.actualCashInHand != null ? String(entry.actualCashInHand) : '');
    } catch (error) {
      console.error('Failed to load production cash entry:', error);
      if (requestId !== productionCashRequestRef.current) return;
      setProductionCashEntry(null);
      setProductionCashLive(null);
    } finally {
      if (requestId === productionCashRequestRef.current) setProductionCashLoading(false);
    }
  };

  useEffect(() => {
    fetchProductionCash();
    // Also re-fetch on every manual "Refresh data" press - same gap as topupRequests above
    // had before that fix: this reads from its own api.getProductionCashEntry call, not
    // context.salesData, so approving/rejecting a discrepancy elsewhere and then pressing
    // the header refresh button never updated this card - only a date/store change did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.user?.accessToken, productionHouseIdForTotal, selectedDate, context.dataRefreshedAt]);

  const productionCashOpening = productionCashEntry?.openingBalance ?? productionCashLive?.openingBalance ?? 0;
  const productionCashExpenses = productionCashEntry?.productionExpenses ?? productionCashLive?.productionExpenses ?? 0;
  // The part of those expenses that was store bills paid out of production's cash (the
  // server already counts them in productionExpenses; this only explains the figure).
  const productionCashStoreBills = useMemo(() => {
    if (!productionHouseIdForTotal) return 0;
    return [...context.inventory, ...context.overheads, ...context.fixedCosts]
      .filter((item: any) => item.date === selectedDate && item.paidFromProductionHouseId === productionHouseIdForTotal)
      .reduce((sum: number, item: any) => sum + (item.totalCost ?? item.amount ?? 0), 0);
  }, [context.inventory, context.overheads, context.fixedCosts, selectedDate, productionHouseIdForTotal]);
  const productionCashTopup = productionCashEntry?.cashTopupCredited ?? productionCashLive?.cashTopupCredited ?? 0;
  const productionCashExpectedClosing = productionCashEntry?.expectedClosingCashInHand ?? productionCashLive?.expectedClosingCashInHand ?? 0;
  const productionCashDiscrepancy = productionCashInput ? (parseFloat(productionCashInput) || 0) - productionCashExpectedClosing : 0;
  const productionCashNeedsApproval = Math.abs(productionCashDiscrepancy) > 200;
  // Same "Cash discrepancy" concept as the Store Cash in Hand card above, but based on the
  // actually-saved count (productionCashEntry.actualCashInHand) rather than
  // productionCashDiscrepancy above, which only reflects whatever's currently typed into the
  // live input and is 0 (not "not yet reconciled") for anyone who hasn't typed anything -
  // including every read-only viewer, who never has an input to type into at all.
  const productionCashSavedDiscrepancy = productionCashEntry?.actualCashInHand != null
    ? productionCashEntry.actualCashInHand - productionCashExpectedClosing
    : null;

  const handleSaveProductionCash = async () => {
    if (!context.user?.accessToken || !productionHouseIdForTotal) return;
    const actualCashInHand = parseFloat(productionCashInput);
    if (isNaN(actualCashInHand) || actualCashInHand < 0) {
      toast.error('Enter the physical cash counted');
      return;
    }
    setProductionCashSubmitting(true);
    try {
      const entry = await api.saveProductionCashEntry(context.user.accessToken, productionHouseIdForTotal, selectedDate, actualCashInHand);
      setProductionCashEntry(entry);
      toast.success(entry.approvalRequired
        ? `Saved - discrepancy of ₹${Math.abs(entry.discrepancy || 0).toFixed(2)} may need cluster head approval`
        : 'Production cash saved');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save production cash');
    } finally {
      setProductionCashSubmitting(false);
    }
  };

  const handleRequestProductionCashApproval = async () => {
    if (!context.user?.accessToken || !productionCashEntry) return;
    if (!confirm(`Request cluster head approval for a ₹${Math.abs(productionCashDiscrepancy).toFixed(2)} discrepancy?`)) return;
    setProductionCashSubmitting(true);
    try {
      const actualCashInHand = parseFloat(productionCashInput) || 0;
      const entry = await api.requestProductionCashApproval(context.user.accessToken, productionCashEntry.id, actualCashInHand, productionCashDiscrepancy);
      setProductionCashEntry(entry);
      toast.success('Approval request sent to cluster head');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to request approval');
    } finally {
      setProductionCashSubmitting(false);
    }
  };

  const handleApproveProductionCash = async (id: string) => {
    if (!context.user?.accessToken) return;
    if (!confirm('Approve this production cash discrepancy?')) return;
    try {
      const entry = await api.approveProductionCashDiscrepancy(context.user.accessToken, id);
      if (productionCashEntry?.id === id) setProductionCashEntry(entry);
      toast.success('Discrepancy approved');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to approve');
    }
  };

  const handleRejectProductionCash = async (id: string) => {
    if (!context.user?.accessToken) return;
    const reason = prompt('Reason for rejecting this discrepancy:') || '';
    try {
      const entry = await api.rejectProductionCashDiscrepancy(context.user.accessToken, id, reason);
      if (productionCashEntry?.id === id) setProductionCashEntry(entry);
      toast.success('Discrepancy rejected');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject');
    }
  };

  // Contract/salary payouts are made from the Payroll page now, not the sales form -
  // entry.employeeSalary on a sales record is a vestigial field that's always 0 (see
  // SalesManagement.tsx's totalContractPayout), so the Cash Reconciliation card below
  // needs the real payout records to show what actually went out that day.
  useEffect(() => {
    if (!context.user?.accessToken) return;
    api.getPayouts().then(setEmployeePayouts).catch(() => {});
  }, [context.user?.accessToken]);

  const loadTopupRequests = useCallback(() => {
    if (!context.user?.accessToken) return;
    api.fetchCashTopupRequests(context.user.accessToken).then(setTopupRequests).catch(() => {});
  }, [context.user?.accessToken]);

  useEffect(() => {
    if (isOperationsManager || isClusterHead || isProductionIncharge) {
      loadTopupRequests();
    }
    // Also re-fetch on every manual "Refresh data" press - this list is fetched
    // independently of context (unlike Cash in Hand, which reads context.salesData and so
    // already picked up fresh data on refresh), so without watching this it silently stayed
    // stale - still showing yesterday's status - until the user's own approve/reject/submit
    // action on it, or a full page reload.
  }, [isOperationsManager, isClusterHead, isProductionIncharge, loadTopupRequests, context.dataRefreshedAt]);

  const loadOnlineLoans = useCallback(async () => {
    if (!context.user?.accessToken) return;
    setIsLoadingLoans(true);
    try {
      const storeIdParam = (!effectiveStoreId || effectiveStoreId === 'all') ? undefined : effectiveStoreId;
      const loans = await api.getOnlineLoans(context.user.accessToken, storeIdParam);
      setOnlineLoans(loans);
    } catch (error) {
      console.error('Error loading online loans:', error);
    } finally {
      setIsLoadingLoans(false);
    }
  }, [context.user?.accessToken, effectiveStoreId]);

  useEffect(() => {
    if (isOperationsManager || isClusterHead) {
      loadOnlineLoans();
    }
  }, [isOperationsManager, isClusterHead, loadOnlineLoans]);

  const myPendingTopups = topupRequests.filter((r) => {
    if (r.status !== 'pending') return false;
    if (isProductionIncharge) return r.requestedByEntityType === 'production_house' && r.requestedByName === context.user?.name;
    return matchesStoreScope(r.storeId);
  });
  const clusterHeadPendingTopups = topupRequests.filter((r) => r.status === 'pending');

  const todayIST = getTodayIST();
  const isViewingPastDate = selectedDate < todayIST;
  // Stores open at 3 PM IST - keep this in sync with STORE_OPENING_HOUR_IST server-side.
  // Computed via Intl so it's correct regardless of the browser's own timezone.
  const istHourNow = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit' }), 10);
  const isBeforeStoreOpening = istHourNow < 15;
  // Backfilling a past, already-closed date is always allowed regardless of time of day -
  // only "today"'s sync needs to wait for the store to actually open.
  const syncDisabledForTiming = !isViewingPastDate && isBeforeStoreOpening;

  const handleSyncPosNow = async () => {
    if (!context.user?.accessToken) return;
    setIsSyncingPos(true);
    try {
      // Cluster head viewing a past, already-closed date: re-pull that day's real totals
      // instead of triggering "today"'s sync - fixes a record written before a sync bug fix.
      const result = (isClusterHead && isViewingPastDate)
        ? await api.backfillPosSync(context.user.accessToken, selectedDate)
        : await api.triggerPosSync(context.user.accessToken);
      if (result?.skipped) {
        toast(result.message || "Skipped - store hasn't opened yet");
      } else if (result?.success) {
        await context.refreshData();
        toast.success(isViewingPastDate ? `Re-synced ${selectedDate}` : 'POS sync complete');
      } else {
        toast.error(result?.error || 'POS sync ran but reported an error - check the results');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to trigger POS sync');
    } finally {
      setIsSyncingPos(false);
    }
  };

  // Re-syncs every day in [bulkSyncStart, bulkSyncEnd] one at a time, instead of making a
  // cluster head click "Re-sync" once per day - e.g. to backfill a stretch of days whose
  // item-wise data was captured before a sync fix and needs re-pulling from Ciferon.
  const handleBulkSync = async () => {
    if (!context.user?.accessToken) return;
    if (bulkSyncStart > bulkSyncEnd) {
      toast.error('Start date must be on or before end date');
      return;
    }

    const dates: string[] = [];
    for (let d = bulkSyncStart; d <= bulkSyncEnd; d = addDays(d, 1)) {
      dates.push(d);
    }

    setIsBulkSyncing(true);
    setBulkSyncProgress({ done: 0, total: dates.length });
    let successCount = 0;
    let failCount = 0;
    try {
      for (let i = 0; i < dates.length; i++) {
        try {
          const result = await api.backfillPosSync(context.user.accessToken, dates[i]);
          if (result?.success) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
        setBulkSyncProgress({ done: i + 1, total: dates.length });
      }
      await context.refreshData();
      if (failCount === 0) {
        toast.success(`Re-synced ${successCount} day(s) (${bulkSyncStart} to ${bulkSyncEnd})`);
      } else {
        toast.error(`Synced ${successCount} day(s), ${failCount} failed - try again for the failed days`);
      }
      setShowBulkSync(false);
    } finally {
      setIsBulkSyncing(false);
      setBulkSyncProgress(null);
    }
  };

  const handleRequestTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!context.user?.accessToken) return;
    if (isProductionIncharge && !topupTargetStoreId) {
      toast.error('Please select which store to credit');
      return;
    }
    if (isClusterHead && !topupDestination) {
      toast.error('Pick where the cash goes');
      return;
    }

    setIsSubmittingTopup(true);
    try {
      if (isClusterHead) {
        // A cluster head's top-up needs no approval - it is credited straight away.
        const [kind, targetId] = topupDestination.split(':');
        const toProduction = kind === 'ph';
        await api.requestCashTopup(
          context.user.accessToken,
          topupDate,
          amount,
          toProduction ? 'production_inventory' : (topupReason === 'production_inventory' ? 'store_inventory' : topupReason),
          toProduction ? undefined : targetId,
          toProduction ? targetId : undefined
        );
        const name = toProduction
          ? (context.productionHouses || []).find((h) => h.id === targetId)?.name || 'production house'
          : (context.stores || []).find((st) => st.id === targetId)?.name || 'store';
        toast.success(`₹${amount.toLocaleString('en-IN')} added to ${name} cash`);
      } else {
      await api.requestCashTopup(
        context.user.accessToken,
        topupDate,
        amount,
        topupReason,
        isProductionIncharge ? topupTargetStoreId : undefined
      );
      toast.success('Cash top-up request sent to the cluster head');
      }
      setShowTopupModal(false);
      setTopupAmount('');
      setTopupReason(defaultTopupReason);
      setTopupTargetStoreId('');
      loadTopupRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send cash top-up request');
    } finally {
      setIsSubmittingTopup(false);
    }
  };

  const handleApproveTopup = async (id: string) => {
    if (!context.user?.accessToken) return;
    if (!confirm('Approve this cash top-up? The amount will move from Online to Offline Cash in Hand.')) return;
    setResolvingTopupId(id);
    try {
      await api.approveCashTopup(context.user.accessToken, id);
      toast.success('Cash top-up approved');
      loadTopupRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to approve cash top-up');
    } finally {
      setResolvingTopupId(null);
    }
  };

  const handleRejectTopup = async (id: string) => {
    if (!context.user?.accessToken) return;
    const reason = prompt('Reason for rejecting this cash top-up request:') || '';
    setResolvingTopupId(id);
    try {
      await api.rejectCashTopup(context.user.accessToken, id, reason);
      toast.success('Cash top-up rejected');
      loadTopupRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject cash top-up');
    } finally {
      setResolvingTopupId(null);
    }
  };

   // High cash/Paytm discrepancy approvals - the actual approve/reject actions for these
  // live on context.approveDiscrepancy/rejectDiscrepancy (App.tsx), same functions
  // SalesManagement.tsx uses, but that queue's UI only ever rendered inside
  // SalesManagement.tsx - which a cluster head never sees (App.tsx routes them to this
  // component instead, per isStoreInchargeManager). That made the whole discrepancy
  // approval workflow unreachable for the only role that can act on it. Mirrors the
  // Cash Top-up Approval Queue pattern below.
  const pendingDiscrepancyApprovals = useMemo(() => {
    return context.salesData
      .filter((sale) => sale.approvalRequested && !sale.approvedBy && !sale.rejectedBy && matchesStoreScope(sale.storeId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [context.salesData, matchesStoreScope]);

  const handleApproveDiscrepancy = async (id: string) => {
    if (!confirm('Approve this discrepancy? The reported cash amount will be accepted.')) return;
    setResolvingDiscrepancyId(id);
    try {
      await context.approveDiscrepancy(id);
      toast.success('Discrepancy approved');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to approve discrepancy');
    } finally {
      setResolvingDiscrepancyId(null);
    }
  };

  const handleRejectDiscrepancy = async (id: string) => {
    const reason = prompt('Reason for rejecting this discrepancy:') || '';
    setResolvingDiscrepancyId(id);
    try {
      await context.rejectDiscrepancy(id, reason);
      toast.success('Discrepancy rejected');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject discrepancy');
    } finally {
      setResolvingDiscrepancyId(null);
    }
  };

 const scopedSalesEntriesForDate = useMemo(() => {
    const strictRows = context.salesData.filter((sale) => sale.date === selectedDate && matchesStoreScope(sale.storeId));
    const legacyUnscopedRows = context.salesData.filter((sale) => sale.date === selectedDate && !sale.storeId);
    const strictSalesTotal = strictRows.reduce((sum, sale) => sum + getSalesAmountTotal(sale), 0);
    const legacySalesTotal = legacyUnscopedRows.reduce((sum, sale) => sum + getSalesAmountTotal(sale), 0);

    // Older records may be missing storeId. If a selected-store cluster view only has
    // a scoped zero placeholder, use the legacy amount-bearing row for display.
    if (selectedConcreteStoreId) {
      return strictSalesTotal > 0 || legacySalesTotal <= 0 ? strictRows : legacyUnscopedRows;
    }

    if (!scopedStoreIdSet) return strictRows;

    const byKey = new Map<string, SalesData>();
    for (const row of strictRows) byKey.set(row.id || `${row.storeId || 'legacy'}-${row.date}`, row);
    for (const row of legacyUnscopedRows) byKey.set(row.id || `legacy-${row.date}`, row);
    return Array.from(byKey.values());
  }, [context.salesData, selectedDate, scopedStoreIdSet, selectedConcreteStoreId]);
  const hasSalesEntries = scopedSalesEntriesForDate.length > 0;
  const singleStoreEntry = singleScopedStoreId ? scopedSalesEntriesForDate.find((sale) => sale.storeId === singleScopedStoreId) : null;

  const effectiveOnlineSalesData = useMemo(() => {
    const byKey = new Map<string, api.OnlineSalesEntry>();
    for (const sale of context.onlineSalesData || []) {
      byKey.set(sale.id || `${sale.storeId || 'all'}-${sale.date}`, sale);
    }
    for (const sale of onlineSalesData) {
      byKey.set(sale.id || `${sale.storeId || 'all'}-${sale.date}`, sale);
    }
    return Array.from(byKey.values());
  }, [context.onlineSalesData, onlineSalesData]);

  const scopedOnlineSalesForDate = useMemo(() => {
    const strictRows = effectiveOnlineSalesData.filter((s) => s.date === selectedDate && matchesStoreScope(s.storeId));
    const legacyUnscopedRows = effectiveOnlineSalesData.filter((s) => s.date === selectedDate && !s.storeId);

    // Older online-sales records may not have storeId. In a selected-store cluster view,
    // use those rows when the properly scoped rows are only zero placeholders.
    if (selectedConcreteStoreId) {
      const strictTotal = strictRows.reduce((sum, sale) => sum + getOnlineEntryTotal(sale), 0);
      const legacyTotal = legacyUnscopedRows.reduce((sum, sale) => sum + getOnlineEntryTotal(sale), 0);
      return strictTotal > 0 || legacyTotal <= 0 ? strictRows : legacyUnscopedRows;
    }

    const byKey = new Map<string, api.OnlineSalesEntry>();
    for (const row of strictRows) byKey.set(row.id || `${row.storeId || 'legacy'}-${row.date}`, row);
    for (const row of legacyUnscopedRows) byKey.set(row.id || `legacy-${row.date}`, row);
    return Array.from(byKey.values());
  }, [effectiveOnlineSalesData, selectedDate, scopedStoreIdSet, selectedConcreteStoreId]);

  const onlineSplit = useMemo(() => {
    return scopedOnlineSalesForDate.reduce(
      (totals, sale) => ({
        zomato: totals.zomato + (sale.zomatoSales || 0),
        swiggy: totals.swiggy + (sale.swiggySales || 0),
      }),
      { zomato: 0, swiggy: 0 }
    );
  }, [scopedOnlineSalesForDate]);

  const platformOnlineSalesTotal = useMemo(() => {
    return onlineSplit.zomato + onlineSplit.swiggy;
  }, [onlineSplit]);

  const aggregatedSales = useMemo(() => {
    return scopedSalesEntriesForDate.reduce(
      (totals, sale) => ({
        offlineSales: totals.offlineSales + (sale.offlineSales || 0),
        cashAmount: totals.cashAmount + (sale.cashAmount || 0),
        paytmAmount: totals.paytmAmount + (sale.paytmAmount || 0),
        onlineSales: totals.onlineSales + (sale.onlineSales || 0),
        offlineDiscount: totals.offlineDiscount + (sale.offlineDiscount || 0),
        offlineCancelledAmount: totals.offlineCancelledAmount + (sale.offlineCancelledAmount || 0),
        offlineCancelledCount: totals.offlineCancelledCount + (sale.offlineCancelledCount || 0),
        onlineDiscount: totals.onlineDiscount + (sale.onlineDiscount || 0),
        onlineCancelledAmount: totals.onlineCancelledAmount + (sale.onlineCancelledAmount || 0),
        onlineCancelledCount: totals.onlineCancelledCount + (sale.onlineCancelledCount || 0),
        previousCashInHand: totals.previousCashInHand + (sale.previousCashInHand || 0),
        usedOnlineMoney: totals.usedOnlineMoney + (sale.usedOnlineMoney || 0),
        employeeSalary: totals.employeeSalary + (sale.employeeSalary || 0),
        actualCashInHand: totals.actualCashInHand + (sale.actualCashInHand || 0),
        actualPaytmBalance: totals.actualPaytmBalance + (sale.actualPaytmBalance || 0),
        cashOffset: totals.cashOffset + (sale.cashOffset || 0),
        paytmOffset: totals.paytmOffset + (sale.paytmOffset || 0),
        discrepancy: totals.discrepancy + (sale.salesDiscrepancy !== undefined ? sale.salesDiscrepancy : (sale.cashOffset || 0)),
      }),
      {
        offlineSales: 0,
        cashAmount: 0,
        paytmAmount: 0,
        onlineSales: 0,
        offlineDiscount: 0,
        offlineCancelledAmount: 0,
        offlineCancelledCount: 0,
        onlineDiscount: 0,
        onlineCancelledAmount: 0,
        onlineCancelledCount: 0,
        previousCashInHand: 0,
        usedOnlineMoney: 0,
        employeeSalary: 0,
        actualCashInHand: 0,
        actualPaytmBalance: 0,
        cashOffset: 0,
        paytmOffset: 0,
        discrepancy: 0,
      }
    );
  }, [scopedSalesEntriesForDate]);

  const entry = useMemo(() => {
    if (singleStoreEntry) return singleStoreEntry;
    if (scopedSalesEntriesForDate.length === 0) return null;
    const allPosSync = scopedSalesEntriesForDate.every((sale) => sale.createdBy === 'pos-sync');
    const allApproved = scopedSalesEntriesForDate.every((sale) => sale.approvalStatus === 'approved');
    return {
      id: `aggregate-${selectedDate}`,
      storeId: singleScopedStoreId || 'all',
      date: selectedDate,
      offlineSales: aggregatedSales.offlineSales,
      cashAmount: aggregatedSales.cashAmount,
      paytmAmount: aggregatedSales.paytmAmount,
      onlineSales: aggregatedSales.onlineSales,
      offlineDiscount: aggregatedSales.offlineDiscount,
      offlineCancelledAmount: aggregatedSales.offlineCancelledAmount,
      offlineCancelledCount: aggregatedSales.offlineCancelledCount,
      onlineDiscount: aggregatedSales.onlineDiscount,
      onlineCancelledAmount: aggregatedSales.onlineCancelledAmount,
      onlineCancelledCount: aggregatedSales.onlineCancelledCount,
      previousCashInHand: aggregatedSales.previousCashInHand,
      usedOnlineMoney: aggregatedSales.usedOnlineMoney,
      employeeSalary: aggregatedSales.employeeSalary,
      actualCashInHand: aggregatedSales.actualCashInHand,
      actualPaytmBalance: aggregatedSales.actualPaytmBalance,
      cashOffset: aggregatedSales.cashOffset,
      paytmOffset: aggregatedSales.paytmOffset,
      salesDiscrepancy: aggregatedSales.discrepancy,
      approvalStatus: allApproved ? 'approved' : 'pending',
      createdBy: allPosSync ? 'pos-sync' : 'aggregate',
      createdByName: `${scopedSalesEntriesForDate.length} store${scopedSalesEntriesForDate.length === 1 ? '' : 's'}`,
      // Oldest sync among the aggregated stores, not the newest - a combined total is only
      // as fresh as its stalest contributor, and this was missing entirely from this object
      // (unlike singleStoreEntry above, which is the raw record and already carries it).
      syncedAt: scopedSalesEntriesForDate.map((s) => (s as any).syncedAt).filter(Boolean).sort()[0],
    } as any;
  }, [singleStoreEntry, scopedSalesEntriesForDate, selectedDate, singleScopedStoreId, aggregatedSales]);

  const scopedStoreIdsForDisplay = useMemo(() => {
    if (scopedStoreIds) return scopedStoreIds;
    return (context.stores || []).map((store) => store.id);
  }, [scopedStoreIds, context.stores]);

  const categorySalesChannelRevenue = useMemo(() => {
    return getChannelRevenueFromCategorySales(context.categorySalesData, selectedDate, scopedStoreIdsForDisplay);
  }, [context.categorySalesData, selectedDate, scopedStoreIdsForDisplay]);

  const carriedBalancesForDisplay = useMemo(() => {
    return scopedStoreIdsForDisplay.reduce(
      (totals, storeId) => {
        const priorSales = context.salesData
          .filter((sale) => sale.storeId === storeId && sale.date < selectedDate)
          .sort((a, b) => b.date.localeCompare(a.date));
        const cashEntry = priorSales.find((sale) => sale.actualCashInHand !== undefined && sale.actualCashInHand !== null);
        const paytmEntry = priorSales.find((sale) => sale.actualPaytmBalance !== undefined && sale.actualPaytmBalance !== null);
        return {
          cash: totals.cash + (cashEntry?.actualCashInHand ?? 0),
          paytm: totals.paytm + (paytmEntry?.actualPaytmBalance ?? 0),
        };
      },
      { cash: 0, paytm: 0 }
    );
  }, [scopedStoreIdsForDisplay, context.salesData, selectedDate]);

  const primaryOfflineSalesTotal = entry ? (entry.offlineSales || 0) : aggregatedSales.offlineSales;
  const offlineSalesTotal = primaryOfflineSalesTotal || categorySalesChannelRevenue.offline;
  const fallbackOnlineSalesTotal = entry ? (entry.onlineSales || 0) : aggregatedSales.onlineSales;
  const categoryOnlineSalesTotal = categorySalesChannelRevenue.zomato + categorySalesChannelRevenue.swiggy;
  const onlineSalesTotal = platformOnlineSalesTotal || fallbackOnlineSalesTotal || categoryOnlineSalesTotal;
  const displayedOnlineSplit = platformOnlineSalesTotal > 0
    ? onlineSplit
    : fallbackOnlineSalesTotal > 0
      ? { zomato: fallbackOnlineSalesTotal, swiggy: 0 }
      : { zomato: categorySalesChannelRevenue.zomato, swiggy: categorySalesChannelRevenue.swiggy };
  const totalRevenue = offlineSalesTotal + onlineSalesTotal;

  // Live cash discrepancy - recomputed from today's actual figures rather than trusting
  // entry.salesDiscrepancy, which is a snapshot taken when the sales entry was last saved.
  // If inventory/overhead data for the day gets corrected afterwards (e.g. a missed
  // expense gets logged), that stored snapshot goes stale and silently disagrees with the
  // "expected" figure shown just above it. Recomputing here - the exact same formula the
  // "Actual cash in hand" card below already uses - keeps the two numbers in sync and
  // lets the sign (+over / -short) come through instead of an always-positive magnitude.
  const liveCashReconciliation = useMemo(() => {
    // entry.actualCashInHand is never null/undefined here - the aggregate-entry builder
    // above sums it with `|| 0`, so an all-pos-sync (nothing reconciled yet) day still
    // comes out as a real 0, not a missing value. createdBy === 'pos-sync' is the actual
    // "hasn't been counted yet" signal (same check the "Estimated cash in hand" card uses).
    if (!entry || entry.createdBy === 'pos-sync' || entry.actualCashInHand === undefined || entry.actualCashInHand === null) return null;
    const isAggregateEntry = entry.storeId === 'all';
    const previousDateStr = addDays(selectedDate, -1);
    const previousDayEntry = isAggregateEntry
      ? null
      : context.salesData.find((s) => s.date === previousDateStr && (effectiveStoreId ? s.storeId === effectiveStoreId : true));
    const previousEntry = previousDayEntry?.actualCashInHand !== undefined && previousDayEntry.actualCashInHand !== null
      ? previousDayEntry
      : [...context.salesData]
        .filter((s) => s.date < selectedDate && (effectiveStoreId ? s.storeId === effectiveStoreId : true) && s.actualCashInHand !== undefined && s.actualCashInHand !== null)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
    // From PRODUCTION_CASH_GO_LIVE_DATE onward, production has its own cash ledger (see
    // ProductionManagement.tsx's Cash in Hand tab) - the store's own expected-cash figure
    // goes back to being strictly the store's own spend, and its carry-forward chain stops
    // (every day on/after go-live starts fresh at 0, matching SalesManagement.tsx's own
    // gate on this same date). Dates before go-live keep the old blended behavior as-is.
    const includeProductionSpend = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;
    const prevCash = selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE
      ? 0
      : isAggregateEntry
        ? carriedBalancesForDisplay.cash
        : previousEntry?.actualCashInHand ?? entry.previousCashInHand ?? 0;
    const cashTopup = entry.usedOnlineMoney ?? 0;
    const cashReceived = entry.cashAmount || 0;
    // THIS STORE's own cash expenses only - see the identical fix and its full comment on
    // the "Store Cash in Hand" card's own inline todaysExpenses just below. This is a
    // separate, duplicate copy of that same formula (drives "Cash discrepancy" instead of
    // the "Actual cash in hand" line directly above it) that was missed when the other one
    // was fixed - confirmed real bug: it kept including production-house spend (pre-go-live)
    // and, with no store resolved, every other store's expenses too, so "Cash discrepancy"
    // silently disagreed with the "expected" figure shown one row above it.
    const todaysExpenses = [...context.inventory, ...context.overheads, ...context.fixedCosts]
      .filter((item: any) => {
        if (item.date !== selectedDate) return false;
        if (item.entityType === 'production_house') return false;
        if (isAggregateEntry) return matchesStoreScope(item.storeId);
        if (!effectiveStoreId) return true;
        return item.storeId === effectiveStoreId;
      })
      .reduce((sum: number, item: any) => {
        const amount = item.totalCost ?? item.amount ?? 0;
        if (paidOutsideStoreTill(item)) return sum; // own money, or paid from production's cash
        if (item.paymentMethod === 'both') return sum + (item.cashAmount || 0);
        if (item.paymentMethod === 'online') return sum;
        return sum + amount; // default/'cash'
      }, 0);
    const expectedCash = prevCash + cashTopup + cashReceived - todaysExpenses;
    const actualCashInHand = entry.actualCashInHand ?? 0;
    return { expectedCash, actualCashInHand, discrepancy: actualCashInHand - expectedCash };
  }, [entry, selectedDate, effectiveStoreId, context.salesData, context.stores, context.inventory, context.overheads, context.fixedCosts, scopedStoreIdsForDisplay, carriedBalancesForDisplay]);

  // Store half of the composite "Total Cash in Hand" card (Phase 3, below) - same formula
  // liveCashReconciliation uses, but returns an estimate instead of null on a day nobody's
  // reconciled yet, since the composite card should still show a number to add production's
  // side to. Only computed from go-live onward, where prevCash is always 0 and production
  // spend no longer counts against the store's own figure - see liveCashReconciliation above.
  const storeCashForTotal = useMemo(() => {
    if (!entry || selectedDate < PRODUCTION_CASH_GO_LIVE_DATE) return null;
    if (liveCashReconciliation) return { amount: liveCashReconciliation.actualCashInHand, isActual: true };
    const isAggregateEntry = entry.storeId === 'all';
    const cashTopup = entry.usedOnlineMoney ?? 0;
    const cashReceived = entry.cashAmount || 0;
    // Same store-only scoping as liveCashReconciliation above - no falling back to "every
    // store" when effectiveStoreId isn't resolved.
    const todaysExpenses = [...context.inventory, ...context.overheads, ...context.fixedCosts]
      .filter((item: any) => item.date === selectedDate && item.entityType !== 'production_house' && (isAggregateEntry ? matchesStoreScope(item.storeId) : item.storeId === effectiveStoreId))
      .reduce((sum: number, item: any) => {
        const amount = item.totalCost ?? item.amount ?? 0;
        if (paidOutsideStoreTill(item)) return sum; // own money, or paid from production's cash
        if (item.paymentMethod === 'both') return sum + (item.cashAmount || 0);
        if (item.paymentMethod === 'online') return sum;
        return sum + amount;
      }, 0);
    return { amount: cashTopup + cashReceived - todaysExpenses, isActual: false };
  }, [entry, selectedDate, effectiveStoreId, liveCashReconciliation, context.inventory, context.overheads, context.fixedCosts]);

  const discrepancy = liveCashReconciliation
    ? liveCashReconciliation.discrepancy
    : entry
      ? (entry.salesDiscrepancy !== undefined ? entry.salesDiscrepancy : (entry.cashOffset || 0))
      : aggregatedSales.discrepancy;

  // Live running cash/Paytm position for when the day's own sales entry hasn't been
  // submitted yet (normally happens at day's end) - carries forward yesterday's actual
  // balances and layers in whatever's already been logged today (approved top-ups,
  // inventory/overhead/fixed-cost expenses), so a cluster head can plan today's
  // purchases without waiting on the store incharge's end-of-day reconciliation.
  const liveCashPosition = useMemo(() => {
    if (hasSalesEntries) return null;

    const prevDateStr = addDays(selectedDate, -1);
    const scopeStoreIds = scopedStoreIds === null
      ? (context.stores || []).map((store) => store.id)
      : scopedStoreIds;

    if (scopeStoreIds.length === 0) return null;

    // From PRODUCTION_CASH_GO_LIVE_DATE onward the store's own cash formula no longer
    // carries its own prior-day figure forward (see the same gate in liveCashReconciliation
    // above and SalesManagement.tsx) - by then it's all been handed to production, not
    // sitting idle in the store's own till. That doesn't mean the store's OWN cash is zero
    // today, though - today's own top-ups and collections still land in the store's till
    // independently of production. Confirmed bug: this preview used to REPLACE the store
    // figure with production's opening balance entirely (silently dropping the store's own
    // today-so-far cash), instead of showing store + production combined, the same way the
    // "Total Cash in Hand" composite card above already correctly does.
    const includeCarriedCash = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;
    const includeProductionSpend = selectedDate < PRODUCTION_CASH_GO_LIVE_DATE;

    const carriedBalances = scopeStoreIds.map((storeId) => {
      const priorSales = context.salesData
        .filter((s) => s.storeId === storeId && s.date < selectedDate)
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        cash: priorSales.find((s) => s.actualCashInHand !== undefined && s.actualCashInHand !== null),
        paytm: priorSales.find((s) => s.actualPaytmBalance !== undefined && s.actualPaytmBalance !== null),
      };
    });
    const carriedCash = includeCarriedCash
      ? carriedBalances.reduce((sum, item) => sum + (item.cash?.actualCashInHand ?? 0), 0)
      : 0;
    const recalibratedToday = (context.onlineCashRecalibrations || []).some((r) => scopeStoreIds.includes(r.storeId) && r.date === selectedDate);
    const hasCarriedData = carriedBalances.some((item) => item.cash || item.paytm) || recalibratedToday;

    // Excludes production_inventory top-ups - those fund the production house's own till,
    // not the store's, and already count toward productionAmount below via the production
    // cash entry's own cashTopupCredited. A cash-topup record always carries the store's
    // storeId even when it's tagged for production (see the request form), so without this
    // filter a production top-up would be counted twice in the combined total.
    const approvedTopupsToday = topupRequests
      .filter((r) => !!r.storeId && scopeStoreIds.includes(r.storeId) && r.date === selectedDate && r.status === 'approved' && r.reason !== 'production_inventory')
      .reduce((sum, r) => sum + r.requestedAmount, 0);
    // Confirmed with the business owner: BOTH reasons drain the same Paytm/bank balance -
    // only the destination till differs. approvedTopupsToday above is deliberately
    // store-reason-only (it feeds storeCash, which a production-bound top-up must not
    // touch), so production-reason top-ups need their own separate subtraction against
    // Paytm below instead of being folded into that variable.
    const productionTopupsToday = topupRequests
      .filter((r) => !!r.storeId && scopeStoreIds.includes(r.storeId) && r.date === selectedDate && r.status === 'approved' && r.reason === 'production_inventory')
      .reduce((sum, r) => sum + r.requestedAmount, 0);

    // Production-house spend linked to the scoped stores also counts against their cash
    // (the store till/Paytm is what actually funds it in practice), same as
    // SalesManagement.tsx's real totalExpenses calculation - only before go-live.
    const scopedProductionHouseIds = new Set(
      (context.stores || [])
        .filter((s) => scopeStoreIds.includes(s.id) && s.productionHouseId)
        .map((s) => s.productionHouseId as string)
    );
    const todaysStoreExpenses = [...context.inventory, ...context.overheads, ...context.fixedCosts].filter((item: any) => {
      if (item.date !== selectedDate) return false;
      const isScopedProductionHouseSpend = includeProductionSpend && item.entityType === 'production_house' && item.productionHouseId && scopedProductionHouseIds.has(item.productionHouseId);
      return scopeStoreIds.includes(item.storeId) || isScopedProductionHouseSpend;
    });
    let cashExpenses = 0;
    let onlineExpenses = 0;
    for (const item of todaysStoreExpenses as any[]) {
      // Aggregator commission entries are already taken off inside the Paytm formula below.
      if ((item.category === 'service_charge' && item.description?.includes('Aggregator Commission')) || item.category === 'commission') continue;
      const amount = item.totalCost ?? item.amount ?? 0;
      if (paidOutsideStoreTill(item)) {
        // Cluster head's own money (neither the store's cash nor Paytm), or a store bill paid
        // from production's cash (already inside productionAmount below).
      } else if (item.paymentMethod === 'both') {
        cashExpenses += item.cashAmount || 0;
        onlineExpenses += item.onlineAmount || 0;
      } else if (item.paymentMethod === 'online') {
        onlineExpenses += amount;
      } else {
        cashExpenses += amount; // default/'cash'
      }
    }

    // Production side, from go-live onward - same formula the "Total Cash in Hand" card
    // above already uses (actual count if reconciled, else the live-computed expected
    // closing balance), added to the store side rather than replacing it.
    const productionAmount = includeCarriedCash
      ? 0
      : (productionCashEntry?.actualCashInHand ?? productionCashEntry?.expectedClosingCashInHand ?? productionCashLive?.expectedClosingCashInHand ?? 0);
    const storeCash = carriedCash + approvedTopupsToday - cashExpenses;

    // Paytm uses the same formula as the main Paytm card and the entry form
    // (utils/paytmBalance.ts), so a recalibration, settlements, payouts and loans since the
    // last saved day all count. Carrying forward only the last sales record's balance used
    // to ignore a recalibration logged after it (24 Oct: showed ₹24,456 against a ₹56,658
    // recalibration). Today's sales aren't in yet, so todaysPaytmReceived is 0. Today's
    // store-reason top-ups go in as used online money: the formula takes them off, and both
    // top-up reasons on a recalibration day only when approved after the count.
    const paytmOpening = scopeStoreIds.reduce((sum, storeId, i) => {
      // A store with no Paytm history at all (no saved balance, no recalibration) counts as
      // ₹0, as before: the formula's from-scratch branch would sum every untagged payout ever.
      if (!carriedBalances[i].paytm && !(context.onlineCashRecalibrations || []).some((r) => r.storeId === storeId)) return sum;
      const storeTopupsToday = topupRequests
        .filter((r) => r.storeId === storeId && r.date === selectedDate && r.status === 'approved' && r.reason !== 'production_inventory')
        .reduce((s, r) => s + r.requestedAmount, 0);
      return sum + computeExpectedPaytmBalance({
        salesData: context.salesData,
        overheads: context.overheads,
        aggregatorSettlements: context.aggregatorSettlements || [],
        onlinePayoutData: [], // legacy manual payout table not loaded here; effectively dead
        onlineLoans,
        employeePayouts,
        topupRequests,
        onlineCashRecalibrations: context.onlineCashRecalibrations || [],
        selectedDate,
        effectiveStoreId: storeId,
        todaysPaytmReceived: 0,
        todaysUsedOnlineMoney: storeTopupsToday,
      }).balance;
    }, 0);

    return {
      carriedCash, paytmOpening, recalibratedToday, hasCarriedData, approvedTopupsToday, productionTopupsToday, cashExpenses, onlineExpenses, prevDateStr,
      storeCount: scopeStoreIds.length,
      storeCash, productionAmount, isPostGoLive: !includeCarriedCash,
      liveCash: storeCash + productionAmount,
      livePaytm: paytmOpening - onlineExpenses,
    };
  }, [hasSalesEntries, scopedStoreIds, selectedDate, context.stores, context.salesData, context.inventory, context.overheads, context.fixedCosts, context.aggregatorSettlements, context.onlineCashRecalibrations, onlineLoans, employeePayouts, topupRequests, productionCashEntry, productionCashLive]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Read-Only Badge */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
            <Eye className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Sales overview</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(isOperationsManager || isClusterHead || isStoreIncharge || isProductionIncharge) && (
            <button
              onClick={handleSyncPosNow}
              disabled={isSyncingPos || syncDisabledForTiming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-full text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                syncDisabledForTiming
                  ? "Stores open at 3 PM IST - sync isn't available before then"
                  : isClusterHead && isViewingPastDate
                  ? `Re-pull ${selectedDate}'s real totals from Ciferon and overwrite this record`
                  : "Fetch today's sales from Ciferon POS right now, instead of waiting for the 10:30 PM automatic sync"
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPos ? 'animate-spin' : ''}`} />
              {isSyncingPos ? 'Syncing...' : syncDisabledForTiming ? 'Opens at 3 PM' : (isClusterHead && isViewingPastDate ? `Re-sync ${selectedDate}` : 'Sync POS Now')}
            </button>
          )}
          {isClusterHead && (
            <button
              onClick={() => setShowBulkSync(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium hover:bg-purple-200 transition-colors"
              title="Re-sync a whole range of past days from Ciferon at once, instead of one at a time"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Bulk Sync
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200/70 rounded-full">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span className="text-xs text-amber-800 font-medium">View only</span>
          </div>
        </div>
      </div>

      {showBulkSync && (
        <div className="mb-6 p-4 rounded-xl border-2 border-purple-200 bg-purple-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-purple-900">Bulk Re-sync from POS</h3>
            <button
              onClick={() => setShowBulkSync(false)}
              disabled={isBulkSyncing}
              className="text-purple-700 hover:text-purple-900 text-xs disabled:opacity-50"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-purple-700 mb-3">
            Re-pulls each day's real totals from Ciferon and overwrites those records - use this to fix a stretch of days at once instead of re-syncing day by day.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-purple-800 mb-1">From</label>
              <input
                type="date"
                value={bulkSyncStart}
                max={getTodayIST()}
                onChange={(e) => setBulkSyncStart(e.target.value)}
                disabled={isBulkSyncing}
                className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-purple-800 mb-1">To</label>
              <input
                type="date"
                value={bulkSyncEnd}
                max={getTodayIST()}
                onChange={(e) => setBulkSyncEnd(e.target.value)}
                disabled={isBulkSyncing}
                className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm"
              />
            </div>
            <button
              onClick={handleBulkSync}
              disabled={isBulkSyncing}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBulkSyncing ? 'animate-spin' : ''}`} />
              {isBulkSyncing
                ? bulkSyncProgress
                  ? `Syncing ${bulkSyncProgress.done}/${bulkSyncProgress.total}...`
                  : 'Syncing...'
                : 'Run Bulk Sync'}
            </button>
          </div>
        </div>
      )}

      {canManagePayouts && (
        <div className="flex items-center gap-1.5 mb-6 bg-secondary/60 p-1 rounded-full w-fit">
          <button
            onClick={() => setActiveTab('entry')}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-colors ${activeTab === 'entry' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Wallet className="w-3.5 h-3.5" /> Sales Entry
          </button>
          {canManagePayouts && (
            <button
              onClick={() => setActiveTab('payout')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-colors ${activeTab === 'payout' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Aggregator Payout
            </button>
          )}
          {(isOperationsManager || isClusterHead) && (
            <button
              onClick={() => setActiveTab('loans')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm transition-colors ${activeTab === 'loans' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <HandCoins className="w-3.5 h-3.5" /> Loans
            </button>
          )}
        </div>
      )}

      {activeTab === 'entry' && (
      <>
      <DateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {!hasSalesEntries && liveCashPosition && (
          <div className="bg-gradient-to-br from-orange-50/80 to-orange-100/50 rounded-2xl p-5 border border-orange-200/50 mt-6">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-semibold text-orange-800">Live Cash Position</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              No sales entry logged for {selectedDate} yet - here's where things stand right now
              {liveCashPosition.storeCount > 1 ? ` across ${liveCashPosition.storeCount} stores` : ''}.
            </p>
            {!liveCashPosition.hasCarriedData && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                No actual cash/Paytm balance recorded for {liveCashPosition.prevDateStr} - carried-forward figures below start at ₹0.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 shadow-lg shadow-emerald-500/20 text-white">
                <p className="text-xs text-emerald-100">Estimated Cash in Hand</p>
                <p className="text-xl font-semibold">₹{liveCashPosition.liveCash.toLocaleString()}</p>
                <p className="text-[11px] text-emerald-100/90 mt-1">
                  {liveCashPosition.isPostGoLive ? (
                    // Store cash fully consolidates into production overnight (confirmed) -
                    // "₹0 store + ₹X production" every single morning is just noise, not
                    // information. Only surface the split once the store side actually has
                    // something in it today (a same-day top-up or expense moved it off zero).
                    liveCashPosition.storeCash !== 0 ? (
                      <>₹{liveCashPosition.storeCash.toLocaleString()} store + ₹{liveCashPosition.productionAmount.toLocaleString()} production</>
                    ) : (
                      <>all in production cash - store hands off nightly</>
                    )
                  ) : (
                    <>₹{liveCashPosition.carriedCash.toLocaleString()} carried + ₹{liveCashPosition.approvedTopupsToday.toLocaleString()} top-ups − ₹{liveCashPosition.cashExpenses.toLocaleString()} expenses</>
                  )}
                </p>
              </div>
              <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl p-3 shadow-lg shadow-sky-500/20 text-white">
                <p className="text-xs text-sky-100">Estimated Paytm Balance</p>
                <p className="text-xl font-semibold">₹{liveCashPosition.livePaytm.toLocaleString()}</p>
                <p className="text-[11px] text-sky-100/90 mt-1">
                  ₹{Math.round(liveCashPosition.paytmOpening).toLocaleString()} {liveCashPosition.recalibratedToday ? "from today's recalibration" : 'carried'} − ₹{liveCashPosition.onlineExpenses.toLocaleString()} expenses
                  {(liveCashPosition.approvedTopupsToday > 0 || liveCashPosition.productionTopupsToday > 0)
                    ? ` · ₹${(liveCashPosition.approvedTopupsToday + liveCashPosition.productionTopupsToday).toLocaleString()} top-ups already taken off`
                    : ''}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Updates live as expenses are logged and top-ups are approved. Doesn't include today's sales yet - those land once the store incharge submits the day's entry.
            </p>
          </div>
      )}

      {!hasSalesEntries && !liveCashPosition && !onlineSalesTotal && (
          <div className="bg-card rounded-2xl border border-border p-10 mt-6 text-center">
            <Wallet className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No sales entry logged for this date</p>
          </div>
      )}

      {(hasSalesEntries || onlineSalesTotal > 0) && (
        <>
          {/* Total Sales - shown first */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 mt-6 mb-4 shadow-lg shadow-emerald-500/20 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-emerald-100 uppercase tracking-wide font-medium">Total Sales</p>
                <p className="text-3xl font-semibold mt-1 tabular-nums">₹{totalRevenue.toLocaleString()}</p>
                {entry?.syncedAt && (
                  <p className="text-[11px] text-emerald-100/80 mt-1">
                    {/* syncedAt is written server-side via getNowIST(), which shifts the
                        real UTC instant forward by +5:30 and THEN calls toISOString() -
                        so its digits already ARE the IST wall-clock time, just mislabeled
                        with a "Z" (UTC) suffix. Formatting with the viewer's local/en-IN
                        timezone re-adds +5:30 on top of that, double-shifting the display
                        forward by 5.5 hours (confirmed bug, found 2026-08-31: "22:37"
                        showed as "1 Sept, 4:00 am"). timeZone: 'UTC' reads the string's
                        digits as-is instead of converting them again. */}
                    Last synced {new Date(entry.syncedAt).toLocaleString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                )}
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/20">
              <div>
                <p className="text-xs text-emerald-100">Offline Sales</p>
                <p className="text-sm font-medium mt-0.5 tabular-nums">₹{offlineSalesTotal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-100">Online Sales</p>
                <p className="text-sm font-medium mt-0.5 tabular-nums">₹{onlineSalesTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {entry && (
            <>
              {/* Offline Sales: gross → discount/cancellations → net, then Cash/Paytm split */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground font-bold">Offline Sales</h2>
                      <p className="text-xs text-muted-foreground">Counter orders - Cash & Paytm</p>
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-primary tabular-nums">₹{(entry?.offlineSales || 0).toLocaleString()}</span>
                </div>

                {(entry.offlineDiscount !== undefined || entry.offlineCancelledAmount !== undefined) && (
                  <div className="rounded-xl border border-border overflow-hidden mb-3">
                    <div className="flex items-center justify-between px-3 py-2 text-sm bg-background">
                      <span className="text-muted-foreground">Gross sales</span>
                      <span className="text-foreground">₹{((entry.offlineSales || 0) + (entry.offlineDiscount || 0) + (entry.complimentaryAmount || 0)).toLocaleString()}</span>
                    </div>
                    {(entry.offlineDiscount ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-sm bg-background border-t border-border/60">
                        <span className="text-muted-foreground">Discounts</span>
                        <span className="text-red-600">− ₹{entry.offlineDiscount!.toLocaleString()}</span>
                      </div>
                    )}
                    {(entry.offlineCancelledCount ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-sm bg-background border-t border-border/60">
                        <span className="text-muted-foreground">Cancelled orders ({entry.offlineCancelledCount})</span>
                        <span className="text-red-600">₹{(entry.offlineCancelledAmount || 0).toLocaleString()} excluded</span>
                      </div>
                    )}
                    {(entry.complimentaryCount ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-sm bg-background border-t border-border/60">
                        <span className="text-muted-foreground">Complimentary / free ({entry.complimentaryCount})</span>
                        <span className="text-red-600">₹{(entry.complimentaryAmount || 0).toLocaleString()} excluded</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-sm bg-secondary/40 border-t border-border/60 font-medium">
                      <span className="text-foreground">Net offline sales</span>
                      <span className="text-primary">₹{(entry?.offlineSales || 0).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Banknote className="w-3.5 h-3.5 text-green-600" /> Cash
                    </span>
                    <p className="text-sm font-medium text-foreground mt-1 tabular-nums">₹{(entry.cashAmount || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Smartphone className="w-3.5 h-3.5 text-primary" /> Paytm
                    </span>
                    <p className="text-sm font-medium text-foreground mt-1 tabular-nums">₹{(entry.paytmAmount || 0).toLocaleString()}</p>
                  </div>
                </div>

                {/* Cash + Paytm is entered separately from the POS-reported net offline
                    sales figure above, so they can drift apart - duplicate KOTs, cash lost
                    at the counter, or an order that walked out unpaid during rush hour.
                    Surface that gap instead of leaving it for someone to notice by hand. */}
                {(() => {
                  const cashPaytmSum = (entry.cashAmount || 0) + (entry.paytmAmount || 0);
                  const netOffline = entry.offlineSales || 0;
                  const gap = netOffline - cashPaytmSum;
                  if (Math.abs(gap) < 1) return null;
                  const reasonLabel: Record<string, string> = {
                    missed_kot: 'Missed KOT',
                    wrong_change: 'Wrong change',
                    tip: 'Tip',
                    counting_mistake: 'Counting mistake',
                    other: 'Other',
                  };
                  const recordedReason = entry.cashOverShortReason ? reasonLabel[entry.cashOverShortReason] : null;
                  return (
                    <div className="mt-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-800">
                        <p>
                          Cash + Paytm (₹{cashPaytmSum.toLocaleString()}) is {gap > 0 ? 'short of' : 'over'} Net offline sales (₹{netOffline.toLocaleString()}) by ₹{Math.abs(gap).toLocaleString()}.
                          {!recordedReason && (gap > 0 ? ' Possibly a duplicate KOT, cash lost at the counter, or an order that went unpaid during rush hour.' : ' Possibly an extra/duplicate payment or a KOT that was cancelled after payment.')}
                        </p>
                        {recordedReason ? (
                          <p className="mt-1.5 pt-1.5 border-t border-amber-300/50">
                            <span className="font-semibold">Reason (from store incharge):</span> {recordedReason}
                            {entry.cashOverShortNote ? <span className="italic"> — "{entry.cashOverShortNote}"</span> : null}
                          </p>
                        ) : (
                          <p className="mt-1.5 pt-1.5 border-t border-amber-300/50 text-amber-700/80 italic">No reason recorded yet - booked as Cash Over/Short until explained.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Online Sales: gross → discount/cancellations → net, then Zomato/Swiggy split */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground font-bold">Online Sales</h2>
                      <p className="text-xs text-muted-foreground">Zomato & Swiggy</p>
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-primary tabular-nums">₹{onlineSalesTotal.toLocaleString()}</span>
                </div>

                {(entry.onlineDiscount !== undefined || entry.onlineCancelledAmount !== undefined) && (
                  <div className="rounded-xl border border-border overflow-hidden mb-3">
                    <div className="flex items-center justify-between px-3 py-2 text-sm bg-background">
                      <span className="text-muted-foreground">Gross sales</span>
                      <span className="text-foreground">₹{(onlineSalesTotal + (entry.onlineDiscount || 0)).toLocaleString()}</span>
                    </div>
                    {(entry.onlineDiscount ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-sm bg-background border-t border-border/60">
                        <span className="text-muted-foreground">Discounts</span>
                        <span className="text-red-600">− ₹{entry.onlineDiscount!.toLocaleString()}</span>
                      </div>
                    )}
                    {(entry.onlineCancelledCount ?? 0) > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-sm bg-background border-t border-border/60">
                        <span className="text-muted-foreground">Cancelled orders ({entry.onlineCancelledCount})</span>
                        <span className="text-red-600">₹{(entry.onlineCancelledAmount || 0).toLocaleString()} excluded</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-sm bg-secondary/40 border-t border-border/60 font-medium">
                      <span className="text-foreground">Net online sales</span>
                      <span className="text-primary">₹{onlineSalesTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <span className="text-xs text-muted-foreground">Zomato</span>
                    <p className="text-sm font-medium text-foreground mt-1 tabular-nums">₹{displayedOnlineSplit.zomato.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <span className="text-xs text-muted-foreground">Swiggy</span>
                    <p className="text-sm font-medium text-foreground mt-1 tabular-nums">₹{displayedOnlineSplit.swiggy.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Cash Reconciliation: expected-vs-actual formula breakdown, kept separate from
                  the raw sales figures above so each card stays focused on one concern. */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-foreground font-bold">Store Cash in Hand</h2>
                    <p className="text-xs text-muted-foreground">Expected vs. actual physical cash for this store</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-background p-3">
                    {(() => {
                      // Carried forward dynamically from yesterday's actual, same as the
                      // Paytm section below - entry.previousCashInHand is a stored field
                      // that the POS auto-sync hardcodes to 0 when it creates today's
                      // placeholder record (before the store incharge has reconciled),
                      // so it stays stale until they manually open and save the form.
                      const isAggregateEntry = entry.storeId === 'all';
                      const previousDateStr = addDays(selectedDate, -1);
                      const previousDayEntry = isAggregateEntry
                        ? null
                        : context.salesData.find((s) => s.date === previousDateStr && (effectiveStoreId ? s.storeId === effectiveStoreId : true));
                      const previousEntry = previousDayEntry?.actualCashInHand !== undefined && previousDayEntry.actualCashInHand !== null
                        ? previousDayEntry
                        : [...context.salesData]
                          .filter((s) => s.date < selectedDate && (effectiveStoreId ? s.storeId === effectiveStoreId : true) && s.actualCashInHand !== undefined && s.actualCashInHand !== null)
                          .sort((a, b) => b.date.localeCompare(a.date))[0];
                      // From PRODUCTION_CASH_GO_LIVE_DATE onward the store's own cash no longer
                      // carries forward (see liveCashReconciliation above, same gate) - confirmed
                      // bug: this specific inline copy was missed when that gate was added
                      // elsewhere, so this card kept showing "Previous day's cash ₹X" and a
                      // caption total that silently disagreed with the Cash discrepancy row
                      // right below it (which does use the correctly-gated liveCashReconciliation).
                      const prevCash = selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE
                        ? 0
                        : isAggregateEntry
                          ? carriedBalancesForDisplay.cash
                          : previousEntry?.actualCashInHand ?? entry.previousCashInHand ?? 0;
                      // A cash topup is money moved OUT of the Paytm/online balance and handed
                      // to the store as physical cash - it increases cash on hand (here) and is
                      // deducted from the Paytm side below, not from cash.
                      const cashTopup = entry.usedOnlineMoney ?? 0;
                      const cashReceived = entry.cashAmount || 0;
                      const notYetReconciled = entry.createdBy === 'pos-sync';

                      // Cash-portion (not online) of today's logged inventory/overhead/fixed-cost
                      // expenses for THIS STORE ONLY - computed the same way regardless of
                      // whether the store incharge has reconciled yet, so this breakdown always
                      // shows the real expense figure rather than a number backed out
                      // algebraically from whatever was last saved. Confirmed real bug: this used
                      // to also fold in production-house spend linked to the store (paid from the
                      // production house's own till, not this store's) - a card explicitly titled
                      // "Store Cash in Hand" showing a number inflated by a different till's
                      // expenses was never right, going forward or (once
                      // PRODUCTION_CASH_GO_LIVE_DATE's own split existed) even historically.
                      // Production spend has its own dedicated cash-in-hand card elsewhere on
                      // this page - it never belongs in this one.
                      const todaysExpenses = [...context.inventory, ...context.overheads, ...context.fixedCosts]
                        .filter((item: any) => {
                          if (item.date !== selectedDate) return false;
                          if (item.entityType === 'production_house') return false;
                          if (isAggregateEntry) return matchesStoreScope(item.storeId);
                          if (!effectiveStoreId) return true;
                          return item.storeId === effectiveStoreId;
                        })
                        .reduce((sum: number, item: any) => {
                          const amount = item.totalCost ?? item.amount ?? 0;
                          if (paidOutsideStoreTill(item)) return sum; // own money, or paid from production's cash
                          if (item.paymentMethod === 'both') return sum + (item.cashAmount || 0);
                          if (item.paymentMethod === 'online') return sum;
                          return sum + amount; // default/'cash'
                        }, 0);
                      // Contract/salary payouts are paid out of the Paytm/online balance, not
                      // physical cash - they don't belong in this formula at all (see the Paytm
                      // card below, where they're deducted instead).
                      const expectedCash = prevCash + cashTopup + cashReceived - todaysExpenses;

                      if (notYetReconciled) {
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-foreground">Estimated cash in hand</span>
                              <span className="text-sm font-medium text-primary">₹{expectedCash.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-amber-700 mt-2 pt-2 border-t border-border/70">
                              Previous day's cash ₹{prevCash.toLocaleString()} + Cash Topup (Online) ₹{cashTopup.toLocaleString()} + Today's cash collection ₹{cashReceived.toLocaleString()} − Today's cash expenses ₹{todaysExpenses.toLocaleString()} = estimated ₹{expectedCash.toLocaleString()}. Not yet reconciled by the store incharge - this is an estimate, not the actual counted cash.
                            </p>
                          </>
                        );
                      }

                      const actualCashInHand = entry.actualCashInHand ?? 0;
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground">Actual cash in hand</span>
                            <span className="text-sm font-medium text-primary">₹{actualCashInHand.toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/70">
                            Previous day's cash ₹{prevCash.toLocaleString()} + Cash Topup (Online) ₹{cashTopup.toLocaleString()} + Today's cash collection ₹{cashReceived.toLocaleString()} − Today's cash expenses ₹{todaysExpenses.toLocaleString()} = expected ₹{expectedCash.toLocaleString()}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="text-sm text-foreground">Cash discrepancy</span>
                    {liveCashReconciliation ? (
                      // Reconciled - liveCashReconciliation is only non-null once a real
                      // physical count has been saved (see its own gate above), so ₹0 here
                      // means "counted and it matched exactly," not "nothing counted yet."
                      // Called out explicitly so it can never be misread as the latter.
                      <span className={`text-sm font-medium ${discrepancy === 0 ? 'text-emerald-600' : discrepancy > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {discrepancy === 0 ? '✓ Matched (₹0)' : `${discrepancy > 0 ? '+' : '−'}₹${Math.abs(discrepancy).toLocaleString()}`}
                      </span>
                    ) : (
                      // Nothing's been counted and reconciled yet - "estimated vs actual" cash
                      // above already says as much, so a number here would just read as a real
                      // discrepancy and confuse the store incharge before they've even counted.
                      <span className="text-sm font-medium text-muted-foreground">Not yet reconciled</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Online Cash (Paytm): split out into its own card, separate from Store Cash
                  in Hand above - two different tills (physical cash vs. the Paytm/UPI
                  balance), each worth reading on its own rather than buried as a third row
                  inside a card about the other one. */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-foreground font-bold">Online Cash (Paytm)</h2>
                    <p className="text-xs text-muted-foreground">Expected vs. actual Paytm/UPI balance</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-background p-3">
                      {(() => {
                        const isAggregateEntry = entry.storeId === 'all';

                        // Single source of truth - the exact formula the store-incharge entry form
                        // uses (src/utils/paytmBalance.ts). This card and that form can no longer
                        // disagree the way they did (they were 27,000 apart on 31 Aug).
                        const expectedResult = computeExpectedPaytmBalance({
                          salesData: context.salesData,
                          overheads: context.overheads,
                          aggregatorSettlements: context.aggregatorSettlements || [],
                          onlinePayoutData: [], // legacy manual payout table not loaded here; effectively dead
                          onlineLoans,
                          employeePayouts,
                          topupRequests,
                          onlineCashRecalibrations: context.onlineCashRecalibrations || [],
                          selectedDate,
                          effectiveStoreId: effectiveStoreId ?? null,
                          todaysPaytmReceived: entry.paytmAmount || 0,
                          todaysUsedOnlineMoney: entry.usedOnlineMoney ?? 0,
                        });
                        const expectedPaytm = expectedResult.balance;

                        // For the explanatory text only - the figure above is authoritative.
                        const previousPaytm = expectedResult.startingBalance;
                        const todaysPaytm = entry.paytmAmount || 0;
                        const hasActualPaytm = entry.actualPaytmBalance !== undefined && entry.actualPaytmBalance !== null && entry.createdBy !== 'pos-sync';
                        const contractPayouts = employeePayouts
                          .filter((p) => p.date === selectedDate && (p.paidFrom == null || p.paidFrom === 'paytm') && (isAggregateEntry || !effectiveStoreId ? true : (!p.storeId || p.storeId === effectiveStoreId)))
                          .reduce((sum, p) => sum + (p.amount || 0), 0);
                        const aggregatorPayout = (context.aggregatorSettlements || [])
                          .filter((s) => s.settlementDate === selectedDate && (isAggregateEntry || !effectiveStoreId ? true : s.storeId === effectiveStoreId))
                          .reduce((sum, s) => sum + (s.netPayout || 0), 0);

                        // A same-day Paytm reconciliation is ground truth and takes priority
                        // over the formula below entirely - the formula has no way to know
                        // about it (it only ever looks at the PRIOR day's balance), so without
                        // this check, reconciling today never actually changes what this card
                        // shows: it just keeps re-deriving its own guess and re-subtracting
                        // today's cash top-up on top of an anchor that predates the
                        // reconciliation, silently ignoring the physically-verified figure the
                        // incharge just entered. A top-up approved AFTER the reconciliation's
                        // own timestamp (same day) is the one thing that reconciliation
                        // couldn't have already accounted for, so it's still subtracted here.
                        const todaysRecalibration = !isAggregateEntry && effectiveStoreId
                          ? (context.onlineCashRecalibrations || []).find((r) => r.storeId === effectiveStoreId && r.date === selectedDate)
                          : null;
                        if (todaysRecalibration) {
                          const recalTs = todaysRecalibration.createdAt;
                          // Both reasons drain the same Paytm balance (see productionTopup
                          // above), so a late-approved top-up of either reason must still be
                          // subtracted from the physically-verified snapshot - not just a
                          // store-reason one. Compared as real moments, not strings: older
                          // approvals were saved as IST time with a 'Z' (see paytmRules.ts).
                          const lateTopups = topupRequests
                            .filter((t) => t.storeId === effectiveStoreId && t.status === 'approved' && t.date === selectedDate && approvedAfterCount(t, todaysRecalibration))
                            .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);
                          // Confirmed with the business owner: a recalibration is a
                          // point-in-time count, not automatically "today's final answer" -
                          // a count taken early (e.g. 4 AM, before today's own Paytm
                          // receipts land) is really an OPENING-balance-style anchor, and
                          // today's own paytmAmount/aggregator payout/contract payouts still
                          // need layering on top of it, same as any other day - only cash
                          // top-ups get the individual before/after-the-count treatment
                          // (via lateTopups above), since they're the one thing with a real
                          // timestamp to compare against the recalibration's own.
                          const reconciledPaytm = todaysRecalibration.actualBalance + todaysPaytm + aggregatorPayout - contractPayouts - lateTopups;
                          return (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-foreground">Reconciled online cash (Paytm)</span>
                                <span className="text-sm font-medium text-emerald-600">₹{reconciledPaytm.toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/70">
                                Physically verified balance ₹{todaysRecalibration.actualBalance.toLocaleString()} + Today's Paytm received ₹{todaysPaytm.toLocaleString()}{aggregatorPayout > 0 ? ` + Aggregator payout ₹${aggregatorPayout.toLocaleString()}` : ''}{contractPayouts > 0 ? ` − Contract/Salary Payout ₹${contractPayouts.toLocaleString()}` : ''}
                                {lateTopups > 0 ? ` − ₹${lateTopups.toLocaleString()} cash top-up approved after the reconciliation` : ''} = ₹{reconciledPaytm.toLocaleString()}
                                {recalTs && (
                                  <span className="block mt-1">
                                    Counted {new Date(recalTs).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                )}
                              </p>
                            </>
                          );
                        }

                        if (!hasActualPaytm) {
                          return (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-foreground">Estimated online cash (Paytm)</span>
                                <span className="text-sm font-medium text-primary">₹{expectedPaytm.toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-amber-700 mt-2 pt-2 border-t border-border/70">
                                {expectedResult.source === 'recalibration' && expectedResult.startDate === selectedDate
                                  ? <>Physically counted at ₹{previousPaytm.toLocaleString()} today, then today's later Paytm receipts, aggregator payouts and Paytm-paid salary applied on top.</>
                                  : <>Anchored to {expectedResult.startDate ?? 'a clean start'} (₹{previousPaytm.toLocaleString()}), then Paytm receipts, aggregator payouts, cash top-ups, commission, loans and Paytm-paid salary since applied — same formula as the store incharge's form.</>}
                                {' '}Not yet reconciled by the store incharge.
                              </p>
                            </>
                          );
                        }

                        // Reconciled: show the store incharge's saved balance, not a re-derived guess.
                        // Flag only when the live formula has since drifted from it (e.g. a settlement
                        // uploaded after the entry was saved).
                        const savedPaytm = entry.actualPaytmBalance as number;
                        const drift = savedPaytm - expectedPaytm;
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-foreground">Online cash in hand (Paytm)</span>
                              <span className="text-sm font-medium text-primary">₹{savedPaytm.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/70">
                              Reconciled by the store incharge — auto-synced from the same formula the entry form uses.
                              {Math.abs(drift) > 1 && (
                                <span className="block mt-1 text-amber-700">
                                  Live figure is now ₹{expectedPaytm.toLocaleString()} ({drift > 0 ? '+' : '−'}₹{Math.abs(drift).toLocaleString()} vs saved) — data changed since it was saved (e.g. a later settlement upload). Re-open and re-save the sales entry to re-sync.
                                </span>
                              )}
                            </p>
                          </>
                        );
                      })()}
                  </div>
                  <PaytmLedger input={{
                    salesData: context.salesData,
                    overheads: context.overheads,
                    aggregatorSettlements: context.aggregatorSettlements || [],
                    onlinePayoutData: [],
                    onlineLoans,
                    employeePayouts,
                    topupRequests,
                    onlineCashRecalibrations: context.onlineCashRecalibrations || [],
                    effectiveStoreId: effectiveStoreId ?? null,
                  }} />
                </div>
              </div>

              {/* Production Cash in Hand - relocated from ProductionManagement.tsx's old
                  "Cash in Hand" tab. Editable by production incharge/operations manager,
                  approve/reject by cluster head; read-only for anyone else who can see
                  this page. Same backend routes as before this moved, untouched. */}
              {productionHouseIdForTotal && selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE && (
                <div className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                      <Factory className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground font-bold">Production Cash in Hand</h2>
                      <p className="text-xs text-muted-foreground">Reconciled separately from the store's own cash above</p>
                    </div>
                  </div>

                  {productionCashLoading ? (
                    <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-border bg-background p-3 space-y-2 mb-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Opening balance</span>
                          <span className="text-foreground font-medium">₹{productionCashOpening.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Today's cash top-up</span>
                          <span className="text-foreground font-medium">₹{productionCashTopup.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Today's production expenses</span>
                          <span className="text-foreground font-medium">₹{productionCashExpenses.toLocaleString('en-IN')}</span>
                        </div>
                        {productionCashStoreBills > 0 && (
                          <p className="text-xs text-muted-foreground -mt-1">
                            incl. ₹{productionCashStoreBills.toLocaleString('en-IN')} of store bills paid from production cash
                          </p>
                        )}
                        <div className="flex items-center justify-between text-sm pt-2 border-t border-border/70">
                          <span className="text-foreground font-semibold">Expected closing</span>
                          <span className="text-primary font-bold">₹{productionCashExpectedClosing.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {canReconcileProductionCash ? (
                        <div className="rounded-xl border border-border bg-background p-3">
                          <label className="block text-xs font-medium text-muted-foreground mb-2">Actual Cash Counted (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={productionCashInput}
                            onChange={(e) => setProductionCashInput(e.target.value)}
                            disabled={!!productionCashEntry?.approvedBy}
                            placeholder="Count and enter the physical cash"
                            className="w-full px-4 py-3 border border-border rounded-xl text-base font-semibold bg-card focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all disabled:opacity-60"
                          />
                          {productionCashInput && (
                            <p className={`text-sm mt-2 font-medium ${productionCashDiscrepancy === 0 ? 'text-emerald-600' : productionCashDiscrepancy > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {productionCashDiscrepancy === 0 ? 'Matches exactly' : `${productionCashDiscrepancy > 0 ? 'Excess' : 'Short'} of ₹${Math.abs(productionCashDiscrepancy).toFixed(2)}`}
                            </p>
                          )}
                          {productionCashNeedsApproval && (
                            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                              ⚠️ High discrepancy - you can save, but cluster head approval will be required.
                            </p>
                          )}

                          {!productionCashEntry?.approvedBy && (
                            <button
                              onClick={handleSaveProductionCash}
                              disabled={productionCashSubmitting || !productionCashInput}
                              className="w-full mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all shadow-md disabled:opacity-50 font-semibold text-sm"
                            >
                              {productionCashSubmitting ? 'Saving…' : productionCashEntry ? 'Update Production Cash' : 'Save Production Cash'}
                            </button>
                          )}

                          {productionCashEntry && productionCashNeedsApproval &&
                            !productionCashEntry.approvedBy && !productionCashEntry.approvalRequested && (
                            <button
                              onClick={handleRequestProductionCashApproval}
                              disabled={productionCashSubmitting}
                              className="w-full mt-2 px-6 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all shadow-md disabled:opacity-50 font-semibold text-sm"
                            >
                              Request Approval from Cluster Head
                            </button>
                          )}

                          {productionCashEntry?.approvalRequested && !productionCashEntry.approvedBy && !productionCashEntry.rejectedBy && (
                            <div className="w-full mt-3 px-4 py-3 bg-amber-100 border border-amber-300 text-amber-800 rounded-xl text-center text-sm font-medium">
                              ⏳ Approval request sent - waiting for cluster head
                            </div>
                          )}
                          {productionCashEntry?.approvedBy && (
                            <div className="w-full mt-3 px-4 py-3 bg-green-50 border border-green-300 text-green-700 rounded-xl text-sm">
                              ✅ Approved by {productionCashEntry.approvedBy}
                            </div>
                          )}
                          {productionCashEntry?.rejectedBy && (
                            <div className="w-full mt-3 px-4 py-3 bg-red-50 border border-red-300 text-red-700 rounded-xl text-sm">
                              ❌ Rejected by {productionCashEntry.rejectedBy}{productionCashEntry.rejectionReason ? ` - ${productionCashEntry.rejectionReason}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                          <span className="text-sm text-foreground">Actual cash in hand</span>
                          <span className="text-sm font-medium text-primary">
                            {productionCashEntry?.actualCashInHand != null ? `₹${productionCashEntry.actualCashInHand.toLocaleString('en-IN')}` : 'Not yet reconciled'}
                          </span>
                        </div>
                      )}

                      <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between mt-3">
                        <span className="text-sm text-foreground">Cash discrepancy</span>
                        {productionCashSavedDiscrepancy !== null ? (
                          <span className={`text-sm font-medium ${productionCashSavedDiscrepancy === 0 ? 'text-emerald-600' : productionCashSavedDiscrepancy > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {productionCashSavedDiscrepancy === 0 ? '✓ Matched (₹0)' : `${productionCashSavedDiscrepancy > 0 ? '+' : '−'}₹${Math.abs(productionCashSavedDiscrepancy).toLocaleString('en-IN')}`}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">Not yet reconciled</span>
                        )}
                      </div>

                      {/* Cluster-head approve/reject, shown regardless of the
                          canReconcileProductionCash branch above - confirmed bug: this used
                          to be nested inside that branch, which is never true for a cluster
                          head (neither production incharge nor operations manager), so a
                          cluster head could never actually see or act on a pending
                          discrepancy request here at all. */}
                      {isClusterHead && productionCashEntry?.approvalRequested && !productionCashEntry.approvedBy && !productionCashEntry.rejectedBy && (
                        <div className="rounded-xl border border-border bg-background p-3 flex gap-2">
                          <button
                            onClick={() => handleApproveProductionCash(productionCashEntry.id)}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleRejectProductionCash(productionCashEntry.id)}
                            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors"
                          >
                            ✗ Reject
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Total Cash in Hand (Store + Production House): informational composite,
                  not itself reconciled by anyone - see the Store/Production Cash-in-Hand
                  split plan. Only shown for a single linked store from go-live onward;
                  silently omitted otherwise (no production house, aggregate view, or a
                  historical date that predates the split). */}
              {productionHouseIdForTotal && selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE && storeCashForTotal && (
                <div className="bg-card rounded-2xl border border-border p-5 mb-4 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground font-bold">Total Cash in Hand</h2>
                      <p className="text-xs text-muted-foreground">Store + production house, combined for visibility only</p>
                    </div>
                  </div>
                  {(() => {
                    const productionAmount = productionCashEntry?.actualCashInHand ?? productionCashEntry?.expectedClosingCashInHand ?? productionCashLive?.expectedClosingCashInHand;
                    const productionIsActual = productionCashEntry?.actualCashInHand !== undefined && productionCashEntry?.actualCashInHand !== null;
                    if (productionAmount === undefined) {
                      return (
                        <div className="rounded-xl border border-border bg-background p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-foreground">Store cash in hand</span>
                            <span className="text-sm font-medium text-primary">₹{storeCashForTotal.amount.toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/70">
                            Production house hasn't logged its cash for this day yet, so a combined total isn't available.
                          </p>
                        </div>
                      );
                    }
                    const total = storeCashForTotal.amount + productionAmount;
                    return (
                      <div className="space-y-2">
                        <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                          <span className="text-sm text-foreground">Store cash in hand{!storeCashForTotal.isActual ? ' (estimated)' : ''}</span>
                          <span className="text-sm font-medium text-foreground">₹{storeCashForTotal.amount.toLocaleString()}</span>
                        </div>
                        <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                          <span className="text-sm text-foreground">Production cash in hand{!productionIsActual ? ' (estimated)' : ''}</span>
                          <span className="text-sm font-medium text-foreground">₹{productionAmount.toLocaleString()}</span>
                        </div>
                        <div className="rounded-xl border border-primary/30 bg-secondary/40 p-3 flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">Total cash in hand</span>
                          <span className="text-sm font-bold text-primary">₹{total.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Status */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Logged by</p>
                    <p className="text-sm text-foreground mt-0.5">{entry.createdByName || entry.createdByEmail || entry.createdBy}</p>
                  </div>
                  {entry.approvalStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                      <CheckCircle className="w-4 h-4" /> Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                      <Clock className="w-4 h-4" /> Pending approval
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Info Message */}
      <div className="mt-4 bg-secondary rounded-2xl p-4">
        <div className="flex gap-3">
          <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            You're viewing sales data in read-only mode. Only the operations manager can log or edit sales entries.
          </p>
        </div>
      </div>

      {/* Cash Top-up Request - operations manager/production incharge can ask the cluster
          head for more physical cash when the offline till is running low. (Store incharge
          has the same section on their own Sales page, SalesManagement.tsx.) */}
      {(isOperationsManager || isProductionIncharge || isClusterHead) && (
        <div className="mt-6 bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                <IndianRupee className="w-4 h-4" />
              </div>
              <h2 className="text-foreground font-bold">Cash top-up</h2>
            </div>
            <button
              onClick={() => {
                // No real choice to make when a production incharge only supplies one
                // store - pre-select it instead of forcing a manual pick every time.
                if (isProductionIncharge && suppliedStores.length === 1) {
                  setTopupTargetStoreId(suppliedStores[0].id);
                }
                if (isClusterHead && !topupDestination) {
                  const firstStore = effectiveStoreId && effectiveStoreId !== 'all' ? effectiveStoreId : context.stores?.[0]?.id;
                  if (firstStore) setTopupDestination(`store:${firstStore}`);
                }
                setTopupDate(selectedDate);
                setShowTopupModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              <PlusCircle className="w-4 h-4" /> {isClusterHead ? 'Add Top-up' : 'Request Top-up'}
            </button>
          </div>
          {myPendingTopups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending top-up requests.</p>
          ) : (
            <div className="space-y-2">
              {myPendingTopups.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground">₹{r.requestedAmount.toLocaleString()} for {r.date}</p>
                      {/* Short reference so a specific request can be pointed to in conversation - */}
                      <span className="text-[10px] font-mono text-muted-foreground/60 bg-secondary rounded px-1.5 py-0.5">#{r.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{TOPUP_REASON_LABELS[r.reason]}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Requested {formatDateTimeIST(r.requestDate, false)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                    <Clock className="w-3.5 h-3.5" /> Pending
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Global ledger - every requester sees the full history across all
              stores/production house, same as what a cluster head sees. */}
          <CashTopupHistory requests={topupRequests} />
        </div>
      )}

      {/* Discrepancy Approval Queue - cluster head only. High cash/Paytm discrepancies a
          store incharge has requested approval for. Only rendered when there's something
          pending, unlike the top-up queue below - there's no useful "history" view for
          this yet, so an empty state has nothing to anchor. */}
      {isClusterHead && pendingDiscrepancyApprovals.length > 0 && (
        <div className="mt-6 bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="text-foreground font-bold">Discrepancy approval requests</h2>
          </div>
          <div className="space-y-2">
            {pendingDiscrepancyApprovals.map((sale) => {
              const expectedCash = (sale.actualCashInHand || 0) - (sale.cashOffset || 0);
              const requestedDiscrepancy = (sale.requestedCashInHand || 0) - expectedCash;
              return (
                <div key={sale.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="mb-2">
                    <p className="text-sm text-foreground">{formatDateIST(sale.date)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Expected cash: ₹{expectedCash.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Actual cash reported: ₹{(sale.requestedCashInHand || 0).toFixed(2)}</p>
                    <p className={`text-xs font-semibold mt-0.5 ${requestedDiscrepancy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Discrepancy: {requestedDiscrepancy >= 0 ? '+' : ''}₹{requestedDiscrepancy.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveDiscrepancy(sale.id)}
                      disabled={resolvingDiscrepancyId === sale.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => handleRejectDiscrepancy(sale.id)}
                      disabled={resolvingDiscrepancyId === sale.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cash Top-up Approval Queue - cluster head only. Kept visible even with 0
          pending so the history below stays reachable. */}
      {isClusterHead && (
        <div className="mt-6 bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
              <IndianRupee className="w-4 h-4" />
            </div>
            <h2 className="text-foreground font-bold">Cash top-up requests</h2>
          </div>
          {clusterHeadPendingTopups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending top-up requests.</p>
          ) : (
          <div className="space-y-2">
            {clusterHeadPendingTopups.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground">₹{r.requestedAmount.toLocaleString()} for {r.date}</p>
                      <span className="text-[10px] font-mono text-muted-foreground/60 bg-secondary rounded px-1.5 py-0.5">#{r.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Requested by {r.requestedByName} ({r.requestedByEntityName}) — {TOPUP_REASON_LABELS[r.reason]}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Requested {formatDateTimeIST(r.requestDate, false)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveTopup(r.id)}
                    disabled={resolvingTopupId === r.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => handleRejectTopup(r.id)}
                    disabled={resolvingTopupId === r.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}
          <CashTopupHistory requests={topupRequests} />
        </div>
      )}

      {isClusterHead && (
        <PaytmWeeklyReconciliation context={context} initialStoreId={effectiveStoreId} initialDate={selectedDate} />
      )}

      {/* Cash Top-up Request Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 border border-border">
            <h3 className="text-foreground font-bold mb-4">{isClusterHead ? 'Add Cash Top-up' : 'Request Cash Top-up'}</h3>
            {isClusterHead && (
              <>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Give cash to</label>
                <select
                  value={topupDestination}
                  onChange={(e) => setTopupDestination(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg mb-1 bg-background text-foreground"
                >
                  <option value="">Pick a store or production house...</option>
                  {(context.stores || []).map((st) => (
                    <option key={st.id} value={`store:${st.id}`}>{st.name} (store cash)</option>
                  ))}
                  {(context.productionHouses || []).map((h) => (
                    <option key={h.id} value={`ph:${h.id}`}>{h.name} (production cash)</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mb-3">Added straight away - no approval needed. The money comes off the business Paytm, like any approved top-up.</p>
              </>
            )}
            <label className="block text-xs font-medium text-muted-foreground mb-1">Date this top-up is for</label>
            <DatePicker
              value={topupDate}
              onChange={setTopupDate}
              max={getTodayIST()}
              className="w-full mb-3"
            />
            <p className="text-xs text-muted-foreground mb-3">
              Defaults to the date you're viewing - change this if the top-up is for an earlier day (e.g. a late vendor settlement).
            </p>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg mb-3 bg-background text-foreground"
              placeholder="Enter amount needed"
              autoFocus
            />
            {!(isClusterHead && topupDestination.startsWith('ph:')) && (
              <>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
                <select
                  value={topupReason}
                  onChange={(e) => setTopupReason(e.target.value as api.CashTopupReason)}
                  className="w-full px-3 py-2 border border-border rounded-lg mb-3 bg-background text-foreground"
                >
                  <option value="store_inventory">Store Inventory</option>
                  {!isClusterHead && <option value="production_inventory">Production House Inventory</option>}
                  <option value="other">Other</option>
                </select>
              </>
            )}
            {isProductionIncharge && suppliedStores.length > 1 && (
              <>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Which store to credit</label>
                <select
                  value={topupTargetStoreId}
                  onChange={(e) => setTopupTargetStoreId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg mb-4 bg-background text-foreground"
                >
                  <option value="">Select a store...</option>
                  {suppliedStores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </>
            )}
            {isProductionIncharge && suppliedStores.length === 1 && (
              <p className="text-xs text-muted-foreground mb-4">
                Credits <strong>{suppliedStores[0].name}</strong> (the only store this production house supplies).
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowTopupModal(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestTopup}
                disabled={isSubmittingTopup}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmittingTopup ? (isClusterHead ? 'Adding...' : 'Sending...') : (isClusterHead ? 'Add top-up' : 'Send Request')}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Loan management - operations manager can request, cluster head can approve/reject */}
      {activeTab === 'loans' && (isOperationsManager || isClusterHead) && (
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

      {/* Aggregator payout reconciliation - operations manager / cluster head only */}
      {activeTab === 'payout' && canManagePayouts && (
        <div>
          <OnlineSalesTab
            context={context}
            selectedStoreId={selectedStoreId}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        </div>
      )}
    </div>
  );
}
