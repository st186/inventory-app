// Day review for everyone but the store incharge (owner, operations, production incharge): the
// day close read-only, approvals for the cluster head, and the Cash & Paytm pieces (top-ups,
// Paytm ledger, weekly reconciliation). Payouts and loans open on their own Money tabs.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { InventoryContextType, SalesData } from '../App';
import { OnlineSalesTab } from './OnlineSalesTab';
import { LoanManagementSection } from './LoanManagementSection';
import { CashTopupHistory } from './CashTopupHistory';
import { addDays, formatDateIST, getTodayIST } from '../utils/timezone';
import { getAssignedStoreIds, getDefaultStoreId } from '../utils/entityAccess';
import { getChannelRevenueFromCategorySales } from '../utils/salesRevenue';
import { computeExpectedPaytmBalance } from '../utils/paytmBalance';
import { approvedAfterCount } from '../utils/paytmRules';
import { paidOutsideStoreTill } from '../utils/cashSource';
import { PaytmLedger } from './PaytmLedger';
import { Check, Clock, Factory, Plus, RefreshCw, Smartphone, Wallet } from 'lucide-react';
import { PaytmWeeklyReconciliation } from './PaytmWeeklyReconciliation';
import * as api from '../utils/api';
import { toast } from 'sonner';
import { useT } from '../utils/i18n';
import { confirm, promptText } from './ui/confirm';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { Money, MoneyInput, formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { SkeletonListRows } from './ui/skeleton';
import { StatGrid, StatSplit, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { FigureCard, FigureRow, MoneyPage, Section, StickyFooter } from './money/MoneyLayout';
import { DayBand, DayStatusBanner, DiffChip, FormulaSheet, TopupRow, TopupSheet, type DayStatus, type FormulaLine } from './money/DayCloseParts';
import { PRODUCTION_CASH_GO_LIVE_DATE, viewLiveCashReconciliation, viewStoreCashCard } from './money/dayCloseMath';
import { toastPosSyncError, toastPosSyncResult, useShellHasMoneyTab } from './money/moneyShell';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  /** The tab to open on (the shell's Money > Payouts / Loans). */
  initialTab?: 'entry' | 'payout' | 'loans' | 'cash';
};



const getSalesAmountTotal = (sale: SalesData) =>
  (sale.offlineSales || 0) +
  (sale.cashAmount || 0) +
  (sale.paytmAmount || 0) +
  (sale.onlineSales || 0);

const getOnlineEntryTotal = (sale: api.OnlineSalesEntry) =>
  (sale.zomatoSales || 0) + (sale.swiggySales || 0);

export function SalesView({ context, selectedStoreId, initialTab = 'entry' }: Props) {
  const { t } = useT();
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
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
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
  const [activeTab, setActiveTab] = useState<'entry' | 'payout' | 'loans' | 'cash'>(initialTab);

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
    if (!(await confirm({ title: 'Ask for approval?', body: `The production cash is off by ${formatINR(Math.abs(productionCashDiscrepancy))}. The cluster head will be asked to approve it.`, confirmLabel: 'Ask for approval' }))) return;
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
    if (!(await confirm({ title: 'Approve this production cash difference?', confirmLabel: 'Approve' }))) return;
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
    const reason = await promptText({ title: 'Reject this production cash difference?', label: 'Reason', confirmLabel: 'Reject', tone: 'danger' });
    if (reason === null) return;
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
      if (!result?.skipped && result?.success) await context.refreshData();
      // Between 11:50 PM and 6:10 AM the server pauses syncs and says so - a calm notice, not an error.
      toastPosSyncResult(result, isViewingPastDate ? `Re-synced ${selectedDate}` : 'POS sync complete');
    } catch (error: any) {
      toastPosSyncError(error);
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
    const amount = topupAmount ?? 0;
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
      setTopupAmount(null);
      setTopupReason(defaultTopupReason);
      setTopupTargetStoreId('');
      loadTopupRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send cash top-up request');
    } finally {
      setIsSubmittingTopup(false);
    }
  };

  // An event stall's request (events.ts) is approved from the store's Paytm or the production
  // house's cash - the button pressed says which.
  const handleApproveTopup = async (id: string, fundingSource?: 'store_paytm' | 'production_cash') => {
    if (!context.user?.accessToken) return;
    const question = fundingSource === 'production_cash'
      ? "Approve this event cash? It comes out of the production house's cash in hand."
      : fundingSource === 'store_paytm'
        ? "Approve this event cash? It comes off the store's Paytm balance."
        : 'Approve this cash top-up? The amount will move from Online to Offline Cash in Hand.';
    if (!(await confirm({ title: fundingSource ? 'Approve this event cash?' : 'Approve this cash top-up?', body: question.replace(/^Approve this (event cash|cash top-up)\? /, ''), confirmLabel: fundingSource === 'production_cash' ? 'From production cash' : fundingSource === 'store_paytm' ? 'From store Paytm' : 'Approve' }))) return;
    setResolvingTopupId(id);
    try {
      await api.approveCashTopup(context.user.accessToken, id, fundingSource);
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
    const reason = await promptText({ title: 'Reject this top-up request?', label: 'Reason', confirmLabel: 'Reject', tone: 'danger' });
    if (reason === null) return;
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
    if (!(await confirm({ title: 'Approve this difference?', body: 'The reported cash amount will be accepted.', confirmLabel: 'Approve' }))) return;
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
    const reason = await promptText({ title: 'Reject this day close?', label: 'Reason', helper: 'The store incharge sees this and pays the difference.', confirmLabel: 'Reject', tone: 'danger' });
    if (reason === null) return;
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
  const viewScope = {
    inventory: context.inventory,
    overheads: context.overheads,
    fixedCosts: context.fixedCosts,
    selectedDate,
    effectiveStoreId,
    matchesStoreScope,
    salesData: context.salesData,
    carriedCash: carriedBalancesForDisplay.cash,
  };
  // Same formula as the "Store Cash in Hand" card (money/dayCloseMath.ts); null until counted.
  const liveCashReconciliation = useMemo(
    () => viewLiveCashReconciliation({ ...viewScope, entry }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, selectedDate, effectiveStoreId, context.salesData, context.stores, context.inventory, context.overheads, context.fixedCosts, scopedStoreIdsForDisplay, carriedBalancesForDisplay]
  );
  const storeCashCard = entry ? viewStoreCashCard({ ...viewScope, entry }) : null;

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

  // ---- Day review (owner / operations / production incharge), wireframe DayClose read-only ----
  const shellHasTab = {
    entry: useShellHasMoneyTab('SalesView', 'entry'),
    payout: useShellHasMoneyTab('SalesView', 'payout'),
    loans: useShellHasMoneyTab('SalesView', 'loans'),
    cash: useShellHasMoneyTab('SalesView', 'cash'),
  };
  const [formulaOpen, setFormulaOpen] = useState(false);
  // The Money tab's own sub-tabs replace this screen's tab row when the shell has them.
  const tabOptions = [
    { value: 'entry' as const, label: 'Sales' },
    ...(canManagePayouts ? [{ value: 'payout' as const, label: 'Payouts' }] : []),
    ...((isOperationsManager || isClusterHead) ? [{ value: 'loans' as const, label: 'Loans' }] : []),
  ];
  const showInnerTabs = tabOptions.length > 1 && !shellHasTab[activeTab === 'cash' ? 'cash' : activeTab];
  // Paytm ledger, weekly reconciliation and top-ups: their own tab once the shell routes
  // Money > Cash & Paytm here; until then they follow the day review, as before.
  const cashOnOwnTab = shellHasTab.cash;
  const showCashContent = activeTab === 'cash' || (activeTab === 'entry' && !cashOnOwnTab);
  const canSync = isOperationsManager || isClusterHead || isStoreIncharge || isProductionIncharge;

  const reviewStatus: DayStatus | null = !entry ? null
    : entry.createdBy === 'pos-sync' ? { kind: 'notStarted' }
    : entry.rejectedBy ? { kind: 'rejected', by: entry.rejectedBy, at: entry.rejectedAt, reason: entry.rejectionReason }
    : entry.approvalStatus === 'approved' ? { kind: 'approved', by: entry.approvedBy || entry.createdByName || entry.createdBy, at: entry.approvedAt }
    : { kind: 'submitted', asked: !!entry.approvalRequested, needsApproval: true };
  // The viewed day's own discrepancy request: the cluster head decides it from the sticky bar.
  const pendingThisDay = isClusterHead && singleStoreEntry && singleStoreEntry.approvalRequested && !singleStoreEntry.approvedBy && !singleStoreEntry.rejectedBy ? singleStoreEntry : null;

  // The day's Paytm figure (same formula as the store incharge's form, utils/paytmBalance.ts).
  const paytmCard = (() => {
    if (!entry) return null;
    const isAggregateEntry = entry.storeId === 'all';
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
    const previousPaytm = expectedResult.startingBalance;
    const todaysPaytm = entry.paytmAmount || 0;
    const hasActualPaytm = entry.actualPaytmBalance !== undefined && entry.actualPaytmBalance !== null && entry.createdBy !== 'pos-sync';
    const contractPayouts = employeePayouts
      .filter((p) => p.date === selectedDate && (p.paidFrom == null || p.paidFrom === 'paytm') && (isAggregateEntry || !effectiveStoreId ? true : (!p.storeId || p.storeId === effectiveStoreId)))
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    const aggregatorPayout = (context.aggregatorSettlements || [])
      .filter((s) => s.settlementDate === selectedDate && (isAggregateEntry || !effectiveStoreId ? true : s.storeId === effectiveStoreId))
      .reduce((sum, s) => sum + (s.netPayout || 0), 0);
    // A same-day Paytm reconciliation is ground truth; a top-up approved after its count is the
    // one thing it couldn't have accounted for (both top-up reasons drain the same Paytm).
    const todaysRecalibration = !isAggregateEntry && effectiveStoreId
      ? (context.onlineCashRecalibrations || []).find((r) => r.storeId === effectiveStoreId && r.date === selectedDate)
      : null;
    if (todaysRecalibration) {
      const recalTs = todaysRecalibration.createdAt;
      const lateTopups = topupRequests
        .filter((t) => t.storeId === effectiveStoreId && t.status === 'approved' && t.date === selectedDate && approvedAfterCount(t, todaysRecalibration))
        .reduce((sum, t) => sum + (t.requestedAmount || 0), 0);
      const reconciledPaytm = todaysRecalibration.actualBalance + todaysPaytm + aggregatorPayout - contractPayouts - lateTopups;
      return {
        label: 'Reconciled Paytm',
        value: reconciledPaytm,
        chip: <StatusChip tone="success" icon={Check}>Counted</StatusChip>,
        caption: `Counted ${formatINR(todaysRecalibration.actualBalance)} + Paytm received ${formatINR(todaysPaytm)}${aggregatorPayout > 0 ? ` + aggregator payout ${formatINR(aggregatorPayout)}` : ''}${contractPayouts > 0 ? ` − salary paid ${formatINR(contractPayouts)}` : ''}${lateTopups > 0 ? ` − ${formatINR(lateTopups)} top-up approved after the count` : ''} = ${formatINR(reconciledPaytm)}${recalTs ? ` · counted ${new Date(recalTs).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}`,
        drift: null as string | null,
      };
    }
    if (!hasActualPaytm) {
      return {
        label: 'Estimated Paytm',
        value: expectedPaytm,
        chip: <StatusChip tone="neutral">Not counted yet</StatusChip>,
        caption: expectedResult.source === 'recalibration' && expectedResult.startDate === selectedDate
          ? `Physically counted at ${formatINR(previousPaytm)} today, then today's later Paytm receipts, aggregator payouts and Paytm-paid salary applied on top.`
          : `Anchored to ${expectedResult.startDate ?? 'a clean start'} (${formatINR(previousPaytm)}), then Paytm receipts, aggregator payouts, cash top-ups, commission, loans and Paytm-paid salary since - same formula as the store incharge's form.`,
        drift: null,
      };
    }
    const savedPaytm = entry.actualPaytmBalance as number;
    const drift = savedPaytm - expectedPaytm;
    return {
      label: 'Paytm in hand',
      value: savedPaytm,
      chip: <StatusChip tone="success" icon={Check}>Saved with the day close</StatusChip>,
      caption: 'Saved by the store incharge - kept in step with the same formula the day close uses.',
      drift: Math.abs(drift) > 1 ? `The live figure is now ${formatINR(expectedPaytm)} (${formatINR(drift, { sign: true })} against the saved one) - something changed after it was saved, e.g. a later settlement upload. Re-saving the day close brings it back in step.` : null,
    };
  })();

  const formulaLines: FormulaLine[] = storeCashCard ? [
    { label: t('dc.f.prev'), amount: storeCashCard.prevCash, sign: '' as const },
    { label: t('dc.f.topup'), amount: storeCashCard.cashTopup, sign: '+' as const },
    { label: t('dc.f.collected'), amount: storeCashCard.cashReceived, sign: '+' as const },
    { label: t('dc.f.spent'), amount: storeCashCard.todaysExpenses, sign: '−' as const },
  ] : [];

  const productionAmountForTotal = productionCashEntry?.actualCashInHand ?? productionCashEntry?.expectedClosingCashInHand ?? productionCashLive?.expectedClosingCashInHand;
  const productionIsActual = productionCashEntry?.actualCashInHand !== undefined && productionCashEntry?.actualCashInHand !== null;
  const ownerDestinations = [
    ...(context.stores || []).map((st) => ({ value: `store:${st.id}`, label: st.name, description: 'Store cash' })),
    ...(context.productionHouses || []).map((h) => ({ value: `ph:${h.id}`, label: h.name, description: 'Production cash' })),
  ];
  const openTopup = () => {
    // No real choice to make when a production incharge only supplies one store.
    if (isProductionIncharge && suppliedStores.length === 1) setTopupTargetStoreId(suppliedStores[0].id);
    if (isClusterHead && !topupDestination) {
      const firstStore = effectiveStoreId && effectiveStoreId !== 'all' ? effectiveStoreId : context.stores?.[0]?.id;
      if (firstStore) setTopupDestination(`store:${firstStore}`);
    }
    setTopupDate(selectedDate);
    setShowTopupModal(true);
  };

  const offlineGap = entry ? (entry.offlineSales || 0) - ((entry.cashAmount || 0) + (entry.paytmAmount || 0)) : 0;
  const reasonLabel: Record<string, string> = { missed_kot: 'Missed KOT', wrong_change: 'Wrong change', tip: 'Tip', counting_mistake: 'Counting mistake', other: 'Other' };

  return (
    <MoneyPage>
      {showInnerTabs && (
        <SegmentedControl aria-label="Sales sections" value={activeTab === 'cash' ? 'entry' : activeTab} onValueChange={(v) => setActiveTab(v)} options={tabOptions} />
      )}

      {activeTab === 'entry' && (
        <>
          <DayBand value={selectedDate} onChange={setSelectedDate} />

          {/* Day closes waiting for the cluster head (all dates); tapping one opens that day. */}
          {isClusterHead && pendingDiscrepancyApprovals.length > 0 && (
            <ListGroup title="Waiting for your approval" meta={`${pendingDiscrepancyApprovals.length}`}>
              {pendingDiscrepancyApprovals.map((sale) => {
                const expectedCash = (sale.actualCashInHand || 0) - (sale.cashOffset || 0);
                const requestedDiscrepancy = (sale.requestedCashInHand || 0) - expectedCash;
                const store = (context.stores || []).find((s) => s.id === sale.storeId)?.name;
                return (
                  <div key={sale.id} className="flex flex-col">
                    <ListRow
                      title={`${formatDateIST(sale.date)}${store ? ` · ${store}` : ''}`}
                      subtitle={`Expected ${formatINR(expectedCash)} · counted ${formatINR(sale.requestedCashInHand || 0)}`}
                      trailing={<DiffChip diff={requestedDiscrepancy} />}
                      onClick={() => setSelectedDate(sale.date)}
                    />
                    <div className="flex gap-2 px-4 pb-3">
                      <Button variant="danger-ghost" size="sm" disabled={resolvingDiscrepancyId === sale.id} onClick={() => handleRejectDiscrepancy(sale.id)}>Reject</Button>
                      <Button variant="secondary" size="sm" leadingIcon={<Check />} loading={resolvingDiscrepancyId === sale.id} onClick={() => handleApproveDiscrepancy(sale.id)}>Approve</Button>
                    </div>
                  </div>
                );
              })}
            </ListGroup>
          )}

          {reviewStatus && <DayStatusBanner status={reviewStatus} readOnly />}

          {!hasSalesEntries && liveCashPosition && (
            <Section title="Right now">
              <p className="-mt-1 text-body-sm text-text-2">
                No day close for {formatDateIST(selectedDate)} yet - where things stand now{liveCashPosition.storeCount > 1 ? ` across ${liveCashPosition.storeCount} stores` : ''}. Today's sales come in with the day close.
              </p>
              {!liveCashPosition.hasCarriedData && (
                <Callout tone="warning" title={`No cash or Paytm balance saved for ${formatDateIST(liveCashPosition.prevDateStr)}`}>The carried-forward figures start at ₹0.</Callout>
              )}
              <StatGrid>
                <StatTile
                  label="Cash in hand (estimate)"
                  value={<Money value={liveCashPosition.liveCash} />}
                  caption={liveCashPosition.isPostGoLive
                    ? (liveCashPosition.storeCash !== 0 ? `${formatINR(liveCashPosition.storeCash)} store + ${formatINR(liveCashPosition.productionAmount)} production` : 'All in production cash - the store hands over nightly')
                    : `${formatINR(liveCashPosition.carriedCash)} carried + ${formatINR(liveCashPosition.approvedTopupsToday)} top-ups − ${formatINR(liveCashPosition.cashExpenses)} spent`}
                />
                <StatTile
                  label="Paytm (estimate)"
                  value={<Money value={liveCashPosition.livePaytm} />}
                  caption={`${formatINR(Math.round(liveCashPosition.paytmOpening))} ${liveCashPosition.recalibratedToday ? "from today's count" : 'carried'} − ${formatINR(liveCashPosition.onlineExpenses)} spent${(liveCashPosition.approvedTopupsToday > 0 || liveCashPosition.productionTopupsToday > 0) ? ` · ${formatINR(liveCashPosition.approvedTopupsToday + liveCashPosition.productionTopupsToday)} top-ups already taken off` : ''}`}
                />
              </StatGrid>
            </Section>
          )}

          {!hasSalesEntries && !liveCashPosition && !onlineSalesTotal && (
            <EmptyState icon={Wallet} title={`No sales for ${formatDateIST(selectedDate)}`} body="The day close shows here once the store sends it." />
          )}

          {(hasSalesEntries || onlineSalesTotal > 0) && (
            <Section
              title={t('dc.posTitle')}
              action={(canSync || isClusterHead) ? (
                <div className="flex items-center gap-2">
                  {isClusterHead && <Button variant="ghost" size="sm" onClick={() => setShowBulkSync(true)}>Re-sync days</Button>}
                  {canSync && (
                    <Button variant="secondary" size="sm" leadingIcon={<RefreshCw className={isSyncingPos ? 'animate-spin' : undefined} />} onClick={handleSyncPosNow} disabled={isSyncingPos || syncDisabledForTiming}>
                      {isSyncingPos ? t('dc.syncing') : isClusterHead && isViewingPastDate ? 'Re-sync' : t('dc.syncNow')}
                    </Button>
                  )}
                </div>
              ) : undefined}
            >
              {canSync && syncDisabledForTiming && <p className="-mt-1 text-label text-text-3">{t('dc.syncOpensAt3')}</p>}
              <StatTile
                hero
                label="Total sales"
                value={<Money value={totalRevenue} />}
                caption={entry?.syncedAt
                  // syncedAt digits are already IST (written with a "Z"), so read them as UTC.
                  ? t('dc.syncedAt', { time: new Date(entry.syncedAt).toLocaleString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) })
                  : undefined}
              >
                <StatSplit items={[
                  { label: t('dc.counter'), value: formatINR(offlineSalesTotal) },
                  { label: 'Zomato', value: formatINR(displayedOnlineSplit.zomato) },
                  { label: 'Swiggy', value: formatINR(displayedOnlineSplit.swiggy) },
                ]} />
              </StatTile>
            </Section>
          )}

          {entry && (
            <>
              <Section title="Counter (cash and Paytm)">
                <FigureCard>
                  {(entry.offlineDiscount !== undefined || entry.offlineCancelledAmount !== undefined) && (
                    <FigureRow label="Gross sales" value={formatINR((entry.offlineSales || 0) + (entry.offlineDiscount || 0) + (entry.complimentaryAmount || 0))} />
                  )}
                  {(entry.offlineDiscount ?? 0) > 0 && <FigureRow label="Discounts" value={`− ${formatINR(entry.offlineDiscount)}`} />}
                  {(entry.offlineCancelledCount ?? 0) > 0 && <FigureRow label={`Cancelled orders (${entry.offlineCancelledCount})`} caption="Not counted" value={formatINR(entry.offlineCancelledAmount || 0)} />}
                  {(entry.complimentaryCount ?? 0) > 0 && <FigureRow label={`Complimentary (${entry.complimentaryCount})`} caption="Not counted" value={formatINR(entry.complimentaryAmount || 0)} />}
                  <FigureRow label="Counter sales" caption="Net, from the POS" value={formatINR(entry?.offlineSales || 0)} emphasis />
                  <FigureRow label={t('money.cash')} value={formatINR(entry.cashAmount || 0)} />
                  <FigureRow label={t('money.paytm')} value={formatINR(entry.paytmAmount || 0)} />
                  <div className="flex min-h-13 items-center gap-3 px-4 py-2">
                    <span className="flex-1 text-body-md font-medium text-text">Cash + Paytm against counter sales</span>
                    <DiffChip diff={-offlineGap} tolerance={0.99} />
                  </div>
                </FigureCard>
                {/* Cash + Paytm can drift from the POS figure: a duplicate KOT, cash lost at the
                    counter, an order that walked out unpaid. Shown with the incharge's reason. */}
                {Math.abs(offlineGap) >= 1 && (
                  <Callout
                    tone="warning"
                    title={`${formatINR((entry.cashAmount || 0) + (entry.paytmAmount || 0))} counted is ${offlineGap > 0 ? 'short of' : 'over'} ${formatINR(entry.offlineSales || 0)} by ${formatINR(Math.abs(offlineGap))}`}
                  >
                    {entry.cashOverShortReason
                      ? <>Reason from the store incharge: {reasonLabel[entry.cashOverShortReason]}{entry.cashOverShortNote ? ` - "${entry.cashOverShortNote}"` : ''}</>
                      : <>{offlineGap > 0 ? 'Possibly a duplicate KOT, cash lost at the counter, or an order that went unpaid during rush hour.' : 'Possibly an extra or duplicate payment, or a KOT cancelled after payment.'} No reason recorded yet - booked as Cash Over/Short until explained.</>}
                  </Callout>
                )}
              </Section>

              <Section title="Zomato and Swiggy">
                <FigureCard>
                  {(entry.onlineDiscount !== undefined || entry.onlineCancelledAmount !== undefined) && (
                    <FigureRow label="Gross sales" value={formatINR(onlineSalesTotal + (entry.onlineDiscount || 0))} />
                  )}
                  {(entry.onlineDiscount ?? 0) > 0 && <FigureRow label="Discounts" value={`− ${formatINR(entry.onlineDiscount)}`} />}
                  {(entry.onlineCancelledCount ?? 0) > 0 && <FigureRow label={`Cancelled orders (${entry.onlineCancelledCount})`} caption="Not counted" value={formatINR(entry.onlineCancelledAmount || 0)} />}
                  <FigureRow label="Online sales" caption="Net" value={formatINR(onlineSalesTotal)} emphasis />
                  <FigureRow label="Zomato" value={formatINR(displayedOnlineSplit.zomato)} />
                  <FigureRow label="Swiggy" value={formatINR(displayedOnlineSplit.swiggy)} />
                </FigureCard>
              </Section>

              {storeCashCard && (
                <Section title={t('dc.matchTitle')}>
                  <FigureCard>
                    <div className="flex min-h-13 items-center gap-3 px-4 py-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-md font-medium text-text">{t('dc.expectedDrawer')}</span>
                        <Button variant="link" size="sm" className="self-start text-label" onClick={() => setFormulaOpen(true)}>{t('dc.howWorkedOut')}</Button>
                      </span>
                      <span className="num text-body-md font-semibold text-text">{formatINR(storeCashCard.expectedCash)}</span>
                    </div>
                    <FigureRow
                      label={storeCashCard.notYetReconciled ? 'Cash in hand (estimate)' : 'Counted in the drawer'}
                      caption={storeCashCard.notYetReconciled ? 'Not counted by the store incharge yet' : undefined}
                      value={storeCashCard.notYetReconciled ? '–' : formatINR(storeCashCard.actualCashInHand)}
                    />
                    <div className="flex min-h-13 items-center gap-3 px-4 py-2">
                      <span className="flex-1 text-body-md font-medium text-text">{t('dc.difference')}</span>
                      {/* Only once a real count is saved: ₹0 then means "counted and it matched". */}
                      <DiffChip diff={discrepancy} notCounted={!liveCashReconciliation} />
                    </div>
                  </FigureCard>
                </Section>
              )}

              {paytmCard && (
                <Section title={t('dc.paytmTitle')}>
                  <StatTile label={paytmCard.label} value={<Money value={paytmCard.value} />} chip={paytmCard.chip} caption={paytmCard.caption} />
                  {paytmCard.drift && <Callout tone="warning" title="Paytm has moved since it was saved">{paytmCard.drift}</Callout>}
                </Section>
              )}

              {/* Store + production, for visibility only (nobody reconciles this total). */}
              {productionHouseIdForTotal && selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE && storeCashForTotal && (
                <Section title="All cash in hand">
                  <FigureCard>
                    <FigureRow label={`Store cash${!storeCashForTotal.isActual ? ' (estimate)' : ''}`} value={formatINR(storeCashForTotal.amount)} />
                    {productionAmountForTotal === undefined ? (
                      <FigureRow label="Production cash" caption="Not logged for this day yet, so there's no combined total" value="–" />
                    ) : (
                      <>
                        <FigureRow label={`Production cash${!productionIsActual ? ' (estimate)' : ''}`} value={formatINR(productionAmountForTotal)} />
                        <FigureRow label="Total cash in hand" value={formatINR(storeCashForTotal.amount + productionAmountForTotal)} emphasis />
                      </>
                    )}
                  </FigureCard>
                </Section>
              )}

              <FigureCard>
                <FigureRow label="Logged by" value={<span className="font-medium">{entry.createdByName || entry.createdByEmail || entry.createdBy}</span>} />
              </FigureCard>
            </>
          )}
        </>
      )}

      {showCashContent && (
        <>
          {/* Production cash in hand: counted by the production incharge / operations manager,
              approved by the cluster head; read-only for everyone else. Lives with the other
              cash figures (Cash & Paytm), and doesn't wait for the store's day close - it sat
              inside the day review, so it couldn't be counted until the store had closed. */}
          {productionHouseIdForTotal && selectedDate >= PRODUCTION_CASH_GO_LIVE_DATE && (
            <Section title="Production cash in hand">
              {productionCashLoading ? (
                <SkeletonListRows count={4} />
              ) : (
                <>
                  <FigureCard>
                    <FigureRow label="Opening balance" value={formatINR(productionCashOpening)} />
                    <FigureRow label="Today's cash top-up" value={formatINR(productionCashTopup)} />
                    <FigureRow
                      label="Today's production spend"
                      caption={productionCashStoreBills > 0 ? `incl. ${formatINR(productionCashStoreBills)} of store bills paid from production cash` : undefined}
                      value={formatINR(productionCashExpenses)}
                    />
                    <FigureRow label="Expected closing" value={formatINR(productionCashExpectedClosing)} emphasis />
                    {!canReconcileProductionCash && (
                      <FigureRow label="Counted" value={productionCashEntry?.actualCashInHand != null ? formatINR(productionCashEntry.actualCashInHand) : 'Not counted yet'} />
                    )}
                    <div className="flex min-h-13 items-center gap-3 px-4 py-2">
                      <span className="flex-1 text-body-md font-medium text-text">{t('dc.difference')}</span>
                      <DiffChip diff={productionCashSavedDiscrepancy ?? 0} notCounted={productionCashSavedDiscrepancy === null} />
                    </div>
                  </FigureCard>

                  {canReconcileProductionCash && (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                      <Field label="Cash counted" helper={productionCashInput ? (productionCashDiscrepancy === 0 ? 'Matches exactly' : `${productionCashDiscrepancy > 0 ? 'Excess' : 'Short'} of ${formatINR(Math.abs(productionCashDiscrepancy))}`) : 'Count the physical cash and enter it'}>
                        <MoneyInput value={productionCashInput} onValueChange={(_, raw) => setProductionCashInput(raw)} disabled={!!productionCashEntry?.approvedBy} />
                      </Field>
                      {productionCashNeedsApproval && <Callout tone="warning" title={t('dc.needsApproval')} />}
                      {productionCashEntry?.approvalRequested && !productionCashEntry.approvedBy && !productionCashEntry.rejectedBy && (
                        <StatusChip tone="warning" icon={Clock}>Approval asked - waiting for the cluster head</StatusChip>
                      )}
                      {productionCashEntry?.approvedBy && <StatusChip tone="success" icon={Check}>Approved by {productionCashEntry.approvedBy}</StatusChip>}
                      {productionCashEntry?.rejectedBy && (
                        <Callout tone="danger" title={`Rejected by ${productionCashEntry.rejectedBy}`}>{productionCashEntry.rejectionReason || ''}</Callout>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {productionCashEntry && productionCashNeedsApproval && !productionCashEntry.approvedBy && !productionCashEntry.approvalRequested && (
                          <Button variant="secondary" onClick={handleRequestProductionCashApproval} disabled={productionCashSubmitting}>Ask for approval</Button>
                        )}
                        {!productionCashEntry?.approvedBy && (
                          <Button variant="secondary" onClick={handleSaveProductionCash} loading={productionCashSubmitting} disabled={!productionCashInput}>
                            {productionCashEntry ? 'Update production cash' : 'Save production cash'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* The cluster head decides a pending production cash difference here. */}
                  {isClusterHead && productionCashEntry?.approvalRequested && !productionCashEntry.approvedBy && !productionCashEntry.rejectedBy && (
                    <div className="flex gap-2">
                      <Button variant="danger-ghost" onClick={() => handleRejectProductionCash(productionCashEntry.id)}>Reject</Button>
                      <Button variant="secondary" leadingIcon={<Check />} onClick={() => handleApproveProductionCash(productionCashEntry.id)}>Approve</Button>
                    </div>
                  )}
                </>
              )}
            </Section>
          )}
          {/* Cash top-ups: operations manager / production incharge request, the cluster head
              adds straight away and decides requests (event stall cash: from store Paytm or
              from production cash). */}
          {(isOperationsManager || isProductionIncharge || isClusterHead) && (
            <ListGroup
              title={isClusterHead ? 'Cash top-ups' : t('topup.title')}
              meta={isClusterHead && clusterHeadPendingTopups.length > 0 ? `${clusterHeadPendingTopups.length} waiting` : undefined}
              action={<Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={openTopup}>{isClusterHead ? 'Add top-up' : t('topup.request')}</Button>}
              empty={<p className="px-4 py-4 text-body-sm text-text-2">{t('topup.none')}</p>}
            >
              {isClusterHead
                ? clusterHeadPendingTopups.map((r) => (
                    <TopupRow key={r.id} request={r} showRequester>
                      {r.reason === 'event_cash' ? (
                        <>
                          <Button variant="secondary" size="sm" leadingIcon={<Smartphone />} disabled={resolvingTopupId === r.id} onClick={() => handleApproveTopup(r.id, 'store_paytm')}>From store Paytm</Button>
                          <Button variant="secondary" size="sm" leadingIcon={<Factory />} disabled={resolvingTopupId === r.id} onClick={() => handleApproveTopup(r.id, 'production_cash')}>From production cash</Button>
                        </>
                      ) : (
                        <Button variant="secondary" size="sm" leadingIcon={<Check />} disabled={resolvingTopupId === r.id} onClick={() => handleApproveTopup(r.id)}>Approve</Button>
                      )}
                      <Button variant="danger-ghost" size="sm" disabled={resolvingTopupId === r.id} onClick={() => handleRejectTopup(r.id)}>Reject</Button>
                    </TopupRow>
                  ))
                : myPendingTopups.map((r) => <TopupRow key={r.id} request={r} />)}
            </ListGroup>
          )}
          {(isOperationsManager || isProductionIncharge || isClusterHead) && <CashTopupHistory requests={topupRequests} />}

          {entry && (
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
          )}

          {isClusterHead && (
            <PaytmWeeklyReconciliation context={context} initialStoreId={effectiveStoreId} initialDate={selectedDate} />
          )}
        </>
      )}

      {/* Loan management - operations manager can request, cluster head can approve/reject */}
      {activeTab === 'loans' && (isOperationsManager || isClusterHead) && (
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
      )}

      {/* Aggregator payout reconciliation - operations manager / cluster head only */}
      {activeTab === 'payout' && canManagePayouts && (
        <OnlineSalesTab
          context={context}
          selectedStoreId={selectedStoreId}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      )}

      {activeTab === 'entry' && pendingThisDay && (
        <StickyFooter>
          <Button variant="danger-ghost" size="lg" disabled={resolvingDiscrepancyId === pendingThisDay.id} onClick={() => handleRejectDiscrepancy(pendingThisDay.id)}>Reject</Button>
          <Button size="lg" className="flex-1" loading={resolvingDiscrepancyId === pendingThisDay.id} onClick={() => handleApproveDiscrepancy(pendingThisDay.id)}>Approve</Button>
        </StickyFooter>
      )}

      <FormulaSheet
        open={formulaOpen}
        onOpenChange={setFormulaOpen}
        title={t('dc.formulaTitle')}
        lines={formulaLines}
        totalLabel={t('dc.expectedDrawer')}
        total={storeCashCard?.expectedCash ?? 0}
        note={storeCashCard?.notYetReconciled ? 'Not counted by the store incharge yet - this is an estimate, not the counted cash.' : t('dc.formulaNote')}
      />

      <TopupSheet
        open={showTopupModal}
        onOpenChange={setShowTopupModal}
        mode={isClusterHead ? 'owner' : 'request'}
        destinations={ownerDestinations}
        stores={isProductionIncharge && suppliedStores.length > 1 ? suppliedStores.map((s) => ({ id: s.id, name: s.name })) : undefined}
        singleStoreName={isProductionIncharge && suppliedStores.length === 1 ? suppliedStores[0].name : undefined}
        value={{ date: topupDate, amount: topupAmount, reason: topupReason, destination: topupDestination, storeId: topupTargetStoreId }}
        onChange={(v) => { setTopupDate(v.date); setTopupAmount(v.amount); setTopupReason(v.reason); setTopupDestination(v.destination); setTopupTargetStoreId(v.storeId); }}
        onSubmit={handleRequestTopup}
        submitting={isSubmittingTopup}
        reasonChoices={isClusterHead ? ['store_inventory', 'other'] : ['store_inventory', 'production_inventory', 'other']}
      />

      {/* Cluster head: re-pull a range of past days from the POS, one day at a time. */}
      <ResponsiveModal
        open={showBulkSync}
        onOpenChange={(open) => { if (!isBulkSyncing) setShowBulkSync(open); }}
        title="Re-sync days from the POS"
        description="Re-pulls each day's real totals from Ciferon and overwrites those records."
        footer={
          <Button size="lg" fullWidth leadingIcon={<RefreshCw />} loading={isBulkSyncing} onClick={handleBulkSync}>
            {isBulkSyncing && bulkSyncProgress ? `Syncing ${bulkSyncProgress.done}/${bulkSyncProgress.total}` : 'Re-sync these days'}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input type="date" value={bulkSyncStart} max={getTodayIST()} onChange={(e) => setBulkSyncStart(e.target.value)} disabled={isBulkSyncing} />
          </Field>
          <Field label="To">
            <Input type="date" value={bulkSyncEnd} max={getTodayIST()} onChange={(e) => setBulkSyncEnd(e.target.value)} disabled={isBulkSyncing} />
          </Field>
        </div>
      </ResponsiveModal>
    </MoneyPage>
  );
}
