import { useState, useEffect, useMemo, useCallback } from 'react';
import { InventoryContextType } from '../App';
import { DateSelector } from './DateSelector';
import { OnlineSalesTab } from './OnlineSalesTab';
import { LoanManagementSection } from './LoanManagementSection';
import { Eye, Lock, Banknote, Smartphone, Wallet, CheckCircle, Clock, PlusCircle, XCircle, IndianRupee, RefreshCw, FileSpreadsheet, HandCoins } from 'lucide-react';
import * as api from '../utils/api';
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

export function SalesView({ context, selectedStoreId }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
  const [topupRequests, setTopupRequests] = useState<api.CashTopupRequest[]>([]);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupReason, setTopupReason] = useState<api.CashTopupReason>('store_inventory');
  const [topupTargetStoreId, setTopupTargetStoreId] = useState('');
  const [isSubmittingTopup, setIsSubmittingTopup] = useState(false);
  const [resolvingTopupId, setResolvingTopupId] = useState<string | null>(null);
  const [isSyncingPos, setIsSyncingPos] = useState(false);
  const [onlineLoans, setOnlineLoans] = useState<api.OnlineLoan[]>([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);
  const [activeTab, setActiveTab] = useState<'entry' | 'payout' | 'loans'>('entry');

  const effectiveStoreId = selectedStoreId || context.user?.storeId;

  const isOperationsManager =
    context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isClusterHead = context.user?.role === 'cluster_head';
  // Production incharge has no store cash ledger of their own - they pick which store to credit.
  const suppliedStores = context.stores?.filter(s => s.productionHouseId === context.user?.storeId) || [];

  // Can this user manage aggregator payout reconciliation? (operations manager / cluster head only)
  const canManagePayouts = isOperationsManager || isClusterHead;

  useEffect(() => {
    if (!context.user?.accessToken) return;
    api.getOnlineSalesData(context.user.accessToken).then(setOnlineSalesData).catch(() => {});
  }, [context.user?.accessToken]);

  const loadTopupRequests = useCallback(() => {
    if (!context.user?.accessToken) return;
    api.fetchCashTopupRequests(context.user.accessToken).then(setTopupRequests).catch(() => {});
  }, [context.user?.accessToken]);

  useEffect(() => {
    if (isOperationsManager || isClusterHead || isProductionIncharge) {
      loadTopupRequests();
    }
  }, [isOperationsManager, isClusterHead, isProductionIncharge, loadTopupRequests]);

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
    return !effectiveStoreId || r.storeId === effectiveStoreId;
  });
  const clusterHeadPendingTopups = topupRequests.filter((r) => r.status === 'pending');

  const todayIST = new Date().toISOString().split('T')[0];
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

    setIsSubmittingTopup(true);
    try {
      await api.requestCashTopup(
        context.user.accessToken,
        selectedDate,
        amount,
        topupReason,
        isProductionIncharge ? topupTargetStoreId : undefined
      );
      toast.success('Cash top-up request sent to the cluster head');
      setShowTopupModal(false);
      setTopupAmount('');
      setTopupReason('store_inventory');
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

  const entry = context.salesData.find((sale) => {
    const dateMatch = sale.date === selectedDate;
    const storeMatch = effectiveStoreId ? sale.storeId === effectiveStoreId : true;
    return dateMatch && storeMatch;
  });

  const onlineSalesTotal = useMemo(() => {
    const filtered = effectiveStoreId
      ? onlineSalesData.filter((s) => s.storeId === effectiveStoreId)
      : onlineSalesData;
    const forDate = filtered.find((s) => s.date === selectedDate);
    return forDate ? (forDate.swiggySales || 0) + (forDate.zomatoSales || 0) : 0;
  }, [onlineSalesData, selectedDate, effectiveStoreId]);

  const totalRevenue = entry ? entry.offlineSales + onlineSalesTotal : onlineSalesTotal;
  const discrepancy = entry?.salesDiscrepancy !== undefined ? entry.salesDiscrepancy : (entry?.cashOffset || 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Read-Only Badge */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-primary" />
          <h1 className="text-xl text-foreground">Sales overview</h1>
        </div>
        <div className="flex items-center gap-2">
          {(isOperationsManager || isClusterHead || isStoreIncharge || isProductionIncharge) && (
            <button
              onClick={handleSyncPosNow}
              disabled={isSyncingPos || syncDisabledForTiming}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-full text-xs hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span className="text-xs text-amber-800">View only</span>
          </div>
        </div>
      </div>

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

      {!entry && !onlineSalesTotal ? (
        <div className="bg-card rounded-2xl border border-border p-10 mt-6 text-center">
          <Wallet className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No sales entry logged for this date</p>
        </div>
      ) : (
        <>
          {/* Total Sales - shown first */}
          <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-2xl p-5 mt-6 mb-4">
            <p className="text-xs text-green-800 uppercase tracking-wide">Total Sales</p>
            <p className="text-2xl text-foreground mt-1">₹{totalRevenue.toLocaleString()}</p>
            <div className="flex justify-between text-sm mt-3 pt-3 border-t border-green-200/70">
              <span className="text-muted-foreground">Offline Sales</span>
              <span className="text-foreground">₹{(entry?.offlineSales || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Online Sales</span>
              <span className="text-foreground">₹{onlineSalesTotal.toLocaleString()}</span>
            </div>
          </div>

          {entry && (
            <>
              {/* Offline Sales: total, then Cash/Paytm split */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <h2 className="text-foreground">Offline Sales</h2>
                  </div>
                  <span className="text-sm text-primary">₹{(entry?.offlineSales || 0).toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <Banknote className="w-4 h-4 text-green-600" /> Cash received
                    </span>
                    <span className="text-sm text-primary">₹{entry.cashAmount.toLocaleString()}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <Smartphone className="w-4 h-4 text-primary" /> Paytm received
                    </span>
                    <span className="text-sm text-primary">₹{entry.paytmAmount.toLocaleString()}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Actual cash in hand</span>
                      <span className="text-sm text-primary">₹{entry.actualCashInHand.toLocaleString()}</span>
                    </div>
                    {(() => {
                      const prevCash = entry.previousCashInHand ?? 0;
                      const usedOnlineMoney = entry.usedOnlineMoney ?? 0;
                      const cashReceived = entry.cashAmount;
                      const contractPayouts = entry.employeeSalary ?? 0;
                      const expectedCash = entry.actualCashInHand - entry.cashOffset;
                      const expenses = prevCash + usedOnlineMoney + cashReceived - contractPayouts - expectedCash;
                      return (
                        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/70">
                          Previous day's cash ₹{prevCash.toLocaleString()} + used from Paytm ₹{usedOnlineMoney.toLocaleString()} + cash received ₹{cashReceived.toLocaleString()} − expenses ₹{expenses.toLocaleString()} − contract payouts ₹{contractPayouts.toLocaleString()} = expected ₹{expectedCash.toLocaleString()}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                    <span className="text-sm text-foreground">Cash discrepancy</span>
                    <span className={`text-sm ${Math.abs(discrepancy) > 0 ? 'text-red-600' : 'text-primary'}`}>
                      ₹{Math.abs(discrepancy).toLocaleString()}
                    </span>
                  </div>
                  {entry.actualPaytmBalance !== undefined && (
                    <div className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">Actual online cash in hand (Paytm)</span>
                        <span className="text-sm text-primary">₹{entry.actualPaytmBalance.toLocaleString()}</span>
                      </div>
                      {(() => {
                        const previousDate = new Date(selectedDate);
                        previousDate.setDate(previousDate.getDate() - 1);
                        const previousDateStr = previousDate.toISOString().split('T')[0];
                        const previousEntry = context.salesData.find((s) => s.date === previousDateStr && (effectiveStoreId ? s.storeId === effectiveStoreId : true));
                        const previousPaytm = previousEntry?.actualPaytmBalance ?? 0;
                        const todaysPaytm = entry.paytmAmount;
                        const expectedPaytm = entry.actualPaytmBalance! - (entry.paytmOffset ?? 0);
                        const netOther = expectedPaytm - previousPaytm - todaysPaytm;
                        return (
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/70">
                            Previous Paytm balance ₹{previousPaytm.toLocaleString()} + today's Paytm ₹{todaysPaytm.toLocaleString()} {netOther >= 0 ? '+' : '−'} payouts/loans net of expenses ₹{Math.abs(netOther).toLocaleString()} = expected ₹{expectedPaytm.toLocaleString()}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Online Sales: Zomato/Swiggy split */}
              <div className="bg-card rounded-2xl border border-border p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <h2 className="text-foreground">Online Sales</h2>
                  </div>
                  <span className="text-sm text-primary">₹{onlineSalesTotal.toLocaleString()}</span>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const filtered = effectiveStoreId ? onlineSalesData.filter((s) => s.storeId === effectiveStoreId) : onlineSalesData;
                    const forDate = filtered.find((s) => s.date === selectedDate);
                    return (
                      <>
                        <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                          <span className="text-sm text-foreground">Zomato</span>
                          <span className="text-sm text-primary">₹{(forDate?.zomatoSales || 0).toLocaleString()}</span>
                        </div>
                        <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                          <span className="text-sm text-foreground">Swiggy</span>
                          <span className="text-sm text-primary">₹{(forDate?.swiggySales || 0).toLocaleString()}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

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
      {(isOperationsManager || isProductionIncharge) && (
        <div className="mt-6 bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
                <IndianRupee className="w-4 h-4" />
              </div>
              <h2 className="text-foreground">Cash top-up</h2>
            </div>
            <button
              onClick={() => setShowTopupModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              <PlusCircle className="w-4 h-4" /> Request Top-up
            </button>
          </div>
          {myPendingTopups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending top-up requests.</p>
          ) : (
            <div className="space-y-2">
              {myPendingTopups.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-background p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">₹{r.requestedAmount.toLocaleString()} for {r.date}</p>
                    <p className="text-xs text-muted-foreground">{TOPUP_REASON_LABELS[r.reason]}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                    <Clock className="w-3.5 h-3.5" /> Pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cash Top-up Approval Queue - cluster head only */}
      {isClusterHead && clusterHeadPendingTopups.length > 0 && (
        <div className="mt-6 bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
              <IndianRupee className="w-4 h-4" />
            </div>
            <h2 className="text-foreground">Cash top-up requests</h2>
          </div>
          <div className="space-y-2">
            {clusterHeadPendingTopups.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm text-foreground">₹{r.requestedAmount.toLocaleString()} for {r.date}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {r.requestedByName} ({r.requestedByEntityName}) — {TOPUP_REASON_LABELS[r.reason]}
                    </p>
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
        </div>
      )}

      {/* Cash Top-up Request Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 border border-border">
            <h3 className="text-foreground mb-4">Request Cash Top-up</h3>
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
            <select
              value={topupReason}
              onChange={(e) => setTopupReason(e.target.value as api.CashTopupReason)}
              className="w-full px-3 py-2 border border-border rounded-lg mb-3 bg-background text-foreground"
            >
              <option value="store_inventory">Store Inventory</option>
              <option value="production_inventory">Production House Inventory</option>
              <option value="other">Other</option>
            </select>
            {isProductionIncharge && (
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
                {isSubmittingTopup ? 'Sending...' : 'Send Request'}
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
