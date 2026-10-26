import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, ProductionData } from '../App';
import { Factory, ChefHat, Soup, Trash2, CheckCircle, AlertTriangle, CheckSquare, Eraser, ArrowLeft, Target, Pencil, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateSelector } from './DateSelector';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { logger } from '../utils/logger';
import { getTodayIST } from '../utils/timezone';
import { LedgerOpeningBalanceSummary } from './production/LedgerOpeningBalanceSummary';
import { LogSharedPoolForm } from './production/LogSharedPoolForm';
import { PrepareLineItemForm } from './production/PrepareLineItemForm';
import { PreparedLineItemsList } from './production/PreparedLineItemsList';
import { EndOfDayCloseForm } from './production/EndOfDayCloseForm';
import { AdditionalWastageForm } from './production/AdditionalWastageForm';
import { MOMO_TYPES } from '../constants/momoTypes';
import { ProductionCoverage } from './ProductionCoverage';
import { BatchPiecesCard } from './production/BatchPiecesCard';
import { BATCH_TRACKING_FROM, ProductionBatch } from '../utils/batches';
import { ProductionPlanCards } from './insights/ProductionPlanCards';

// Matches the backend's PRODUCTION_LEDGER_GO_LIVE_DATE (index.ts) exactly - dates before
// this keep using the old write-only dough/stuffing/batter/coating fields on `production:`
// (still collected nowhere in this UI once the ledger is live, but the field stays on the
// type for backward compatibility with old records - see the plan for why no backfill).
const PRODUCTION_LEDGER_GO_LIVE_DATE = '2026-08-23';

// The 8 sauces/chutneys this kitchen actually makes - same names/order as
// AdditionalWastageForm's KNOWN_SAUCES, each given its own tint purely so this grid reads
// like the Final Pieces grid above (one glance per card) instead of a flat, undifferentiated
// list of look-alike inputs.
const SAUCE_ITEMS: { key: 'panfriedSauce' | 'chilliChickenSauce' | 'spicyKoreanSauce' | 'hotGarlicSauce' | 'tandooriSauce' | 'soupPremix' | 'greenMayoChutney' | 'spicyRedChutney'; label: string; color: string }[] = [
  { key: 'panfriedSauce', label: 'Panfried Sauce', color: '#f43f5e' },
  { key: 'chilliChickenSauce', label: 'Chilli Chicken Sauce', color: '#ef4444' },
  { key: 'spicyKoreanSauce', label: 'Spicy Korean Sauce', color: '#dc2626' },
  { key: 'hotGarlicSauce', label: 'Hot Garlic Sauce', color: '#f97316' },
  { key: 'tandooriSauce', label: 'Tandoori Sauce', color: '#ea580c' },
  { key: 'soupPremix', label: 'Soup Premix', color: '#fb7185' },
  { key: 'greenMayoChutney', label: 'Green Mayo Chutney', color: '#16a34a' },
  { key: 'spicyRedChutney', label: 'Spicy Red Chutney', color: '#e11d48' },
];

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  // Notification deep-link: 'approvals' jumps straight to the Pending Approvals tab.
  initialTab?: string | null;
  // Lets this screen return the user to wherever they navigated in from (e.g. Analytics'
  // "Production Management" button) instead of leaving them stuck with no way back.
  onBack?: () => void;
};

export function ProductionManagement({ context, selectedStoreId, initialTab = null, onBack }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    getTodayIST()
  );
  const [activeTab, setActiveTab] = useState<'entry' | 'approvals'>(initialTab === 'approvals' ? 'approvals' : 'entry');

  // A notification click arriving while this component is already mounted should still switch tabs
  useEffect(() => {
    if (initialTab === 'approvals') {
      setActiveTab('approvals');
    }
  }, [initialTab]);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isOperationsManager = context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge';
  const isClusterHead = context.user?.role === 'cluster_head';
  const canEdit = isProductionIncharge;
  const canApprove = isOperationsManager; // Only Operations Managers can approve (Cluster Heads can only view)
  const canViewApprovals = isOperationsManager || isClusterHead; // Both can view approvals tab
  // The production ledger (dough/stuffing/batter/coating carry-forward) is reconciled by
  // whoever actually does the prep - production incharge or operations manager. Cluster
  // heads view it read-only, same split Production Cash in Hand uses (now on the Sales
  // page, see SalesView.tsx).
  const canEditLedger = isProductionIncharge || isOperationsManager;

  // The production house this entry tab's ledger belongs to. A production incharge's own
  // context.user.storeId IS their production house's real id (a legacy naming quirk
  // already relied on elsewhere in this file, e.g. handleSubmit's productionHouseId save
  // below) - for anyone else (operations manager/cluster head), resolve properly through
  // whichever real store is selected (or their own assigned store as a fallback), via that
  // store's own productionHouseId link.
  const resolvedProductionHouseId = useMemo(() => {
    if (isProductionIncharge && context.user?.storeId) return context.user.storeId;
    const candidateStoreId = selectedStoreId || context.user?.storeId;
    if (candidateStoreId) {
      const store = context.stores?.find(s => s.id === candidateStoreId);
      if (store?.productionHouseId) return store.productionHouseId;
    }
    return null;
  }, [isProductionIncharge, context.user?.storeId, selectedStoreId, context.stores]);

  const [ledgerEntry, setLedgerEntry] = useState<api.ProductionLedgerEntry | null>(null);
  const [ledgerLive, setLedgerLive] = useState<api.ProductionLedgerLive | null>(null);
  const [ledgerItems, setLedgerItems] = useState<api.ProductionLedgerItem[]>([]);
  const [ledgerHasAnyPriorRecord, setLedgerHasAnyPriorRecord] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerItemSubmitting, setLedgerItemSubmitting] = useState(false);
  const [ledgerCloseSubmitting, setLedgerCloseSubmitting] = useState(false);
  const [wastageNotes, setWastageNotes] = useState<api.ProductionWastageNote[]>([]);

  // ---- Weekly Production Goal - a per-momo-type piece target for any Monday-start week,
  // navigable independently of the Production Entry date selector above (a goal is usually
  // set ahead of time, for a week that hasn't started yet, or reviewed after it's over -
  // tying it to whatever single day is selected for entry made every other week
  // unreachable). Progress is computed live from real production: records (.final counts)
  // rather than a separately-tracked number. ----
  const [weeklyGoal, setWeeklyGoal] = useState<api.ProductionWeeklyGoal | null>(null);
  const [weeklyGoalLoading, setWeeklyGoalLoading] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState<Record<string, string>>({});
  const [goalSaving, setGoalSaving] = useState(false);

  const canSetWeeklyGoal = isClusterHead || isOperationsManager;

  const mondayOfWeek = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0=Sun .. 6=Sat
    const diffToMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diffToMonday);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const addDaysToDateStr = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayMonday = mondayOfWeek(getTodayIST());
  // Which week the goal card is showing/editing - starts on the current week, then moves
  // freely via the Prev/Next buttons. Deliberately not derived from `selectedDate`.
  const [goalWeekStart, setGoalWeekStart] = useState(todayMonday);
  const goalWeekEnd = useMemo(() => addDaysToDateStr(goalWeekStart, 6), [goalWeekStart]);
  const isGoalWeekCurrent = goalWeekStart === todayMonday;
  const isGoalWeekFuture = goalWeekStart > todayMonday;

  useEffect(() => {
    let cancelled = false;
    if (!resolvedProductionHouseId || !context.user?.accessToken) {
      setWeeklyGoal(null);
      return;
    }
    setWeeklyGoalLoading(true);
    api.getProductionWeeklyGoal(context.user.accessToken, resolvedProductionHouseId, goalWeekStart)
      .then((g) => { if (!cancelled) setWeeklyGoal(g); })
      .catch(() => { if (!cancelled) setWeeklyGoal(null); })
      .finally(() => { if (!cancelled) setWeeklyGoalLoading(false); });
    return () => { cancelled = true; };
  }, [resolvedProductionHouseId, goalWeekStart, context.user?.accessToken]);

  // Sum of each type's .final pieces across the viewed week - the whole week once it's
  // over, only through today while it's still in progress, and nothing yet for a week
  // that hasn't started. Matched defensively on either productionHouseId or the legacy
  // storeId field, since older records only ever populated one or the other (see
  // resolvedProductionHouseId's own comment above on this naming quirk).
  const weekProgress = useMemo(() => {
    const totals: Record<string, number> = {};
    MOMO_TYPES.forEach((t) => { totals[t.key] = 0; });
    if (!resolvedProductionHouseId || isGoalWeekFuture) return totals;
    const progressThroughDate = isGoalWeekCurrent ? getTodayIST() : goalWeekEnd;
    context.productionData
      .filter((p) =>
        (p.productionHouseId === resolvedProductionHouseId || p.storeId === resolvedProductionHouseId) &&
        p.date >= goalWeekStart && p.date <= progressThroughDate
      )
      .forEach((p) => {
        MOMO_TYPES.forEach((t) => {
          totals[t.key] += (p as any)[t.key]?.final || 0;
        });
      });
    return totals;
  }, [context.productionData, resolvedProductionHouseId, goalWeekStart, goalWeekEnd, isGoalWeekCurrent, isGoalWeekFuture]);

  const openEditGoal = () => {
    const draft: Record<string, string> = {};
    MOMO_TYPES.forEach((t) => { draft[t.key] = weeklyGoal?.goals?.[t.key] ? String(weeklyGoal.goals[t.key]) : ''; });
    setGoalDraft(draft);
    setShowEditGoal(true);
  };

  const handleSaveGoal = async () => {
    if (!resolvedProductionHouseId || !context.user?.accessToken) return;
    setGoalSaving(true);
    try {
      const goals: Record<string, number> = {};
      MOMO_TYPES.forEach((t) => {
        const n = parseInt(goalDraft[t.key] || '0', 10);
        if (n > 0) goals[t.key] = n;
      });
      const saved = await api.saveProductionWeeklyGoal(context.user.accessToken, resolvedProductionHouseId, goalWeekStart, goals);
      setWeeklyGoal(saved);
      setShowEditGoal(false);
      toast.success('Weekly goal saved');
    } catch (error) {
      console.error('Error saving weekly production goal:', error);
      toast.error('Failed to save weekly goal');
    } finally {
      setGoalSaving(false);
    }
  };

  const ledgerTrackingLive = selectedDate >= PRODUCTION_LEDGER_GO_LIVE_DATE;

  const fetchLedger = async () => {
    if (!resolvedProductionHouseId || !context.user?.accessToken || !ledgerTrackingLive) return;
    setLedgerLoading(true);
    try {
      const [{ entry, live, items, hasAnyPriorRecord }, notes] = await Promise.all([
        api.getProductionLedger(context.user.accessToken, resolvedProductionHouseId, selectedDate),
        api.getProductionWastageNotes(context.user.accessToken, resolvedProductionHouseId, selectedDate),
      ]);
      setLedgerEntry(entry);
      setLedgerLive(live);
      setLedgerItems(items);
      setLedgerHasAnyPriorRecord(hasAnyPriorRecord);
      setWastageNotes(notes);
    } catch (error) {
      console.error('Failed to load production ledger:', error);
      setLedgerEntry(null);
      setLedgerLive(null);
      setLedgerItems([]);
      setWastageNotes([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchLedger();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedProductionHouseId, selectedDate, context.user?.accessToken, ledgerTrackingLive]);

  const ledgerPools = ledgerEntry?.pools ?? ledgerLive?.pools ?? {};
  const ledgerClosed = !!ledgerEntry?.closed;

  // Rolls today's per-pool ledger wastage (dough, batter, every stuffing:*/coating:* pool)
  // back up into the same 4-field shape the old manual "Wastage Tracking" inputs used to
  // collect - ProductionHouseStockStatus.tsx's "Today's Wastage" tile reads exactly this
  // shape off the saved `production:` record, so it must keep getting real numbers even
  // after the manual entry fields below are replaced by this computed rollup.
  const derivedLedgerWastage = useMemo(() => {
    const totals = { dough: 0, stuffing: 0, batter: 0, coating: 0 };
    for (const [poolId, pool] of Object.entries(ledgerPools)) {
      const w = (pool as api.ProductionLedgerPoolState | undefined)?.wastage;
      if (typeof w !== 'number') continue;
      if (poolId === 'dough' || poolId.startsWith('dough:')) totals.dough += w;
      else if (poolId === 'batter' || poolId.startsWith('batter:')) totals.batter += w;
      else if (poolId.startsWith('stuffing:')) totals.stuffing += w;
      else if (poolId.startsWith('coating:')) totals.coating += w;
    }
    return totals;
  }, [ledgerPools]);

  const handleAddLedgerItem = async (momoKey: string, globalPoolQty: number, perTypePoolQty: number) => {
    if (!context.user?.accessToken || !resolvedProductionHouseId) return;
    setLedgerItemSubmitting(true);
    try {
      await api.addProductionLedgerItem(context.user.accessToken, resolvedProductionHouseId, selectedDate, momoKey, globalPoolQty, perTypePoolQty);
      toast.success('Batch logged');
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to log batch');
    } finally {
      setLedgerItemSubmitting(false);
    }
  };

  const handleDeleteLedgerItem = async (id: string) => {
    if (!context.user?.accessToken) return;
    if (!confirm('Remove this logged batch?')) return;
    try {
      await api.deleteProductionLedgerItem(context.user.accessToken, id);
      toast.success('Batch removed');
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove batch');
    }
  };

  const handleCloseLedgerDay = async (closingActuals: Record<string, number>, manualOpeningOverride?: Record<string, number>, wastageOverrides?: Record<string, number>) => {
    if (!context.user?.accessToken || !resolvedProductionHouseId) return;
    setLedgerCloseSubmitting(true);
    try {
      await api.closeProductionLedgerDay(context.user.accessToken, resolvedProductionHouseId, selectedDate, closingActuals, manualOpeningOverride, wastageOverrides);
      toast.success('Production day closed - leftover counts carry forward to tomorrow');
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to close production day');
    } finally {
      setLedgerCloseSubmitting(false);
    }
  };

  const handleAddWastageNote = async (description: string, quantity: number, unit: string, reason: string) => {
    if (!context.user?.accessToken || !resolvedProductionHouseId) return;
    try {
      await api.addProductionWastageNote(context.user.accessToken, resolvedProductionHouseId, selectedDate, description, quantity, unit, reason);
      toast.success('Wastage logged');
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to log wastage');
    }
  };

  const handleDeleteWastageNote = async (id: string) => {
    if (!context.user?.accessToken) return;
    try {
      await api.deleteProductionWastageNote(context.user.accessToken, id);
      toast.success('Removed');
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove');
    }
  };

  // Get production data for selected date (filtered by selected store, not user's store).
  // BUG FIX: this used to compare against `selectedStoreId` directly - but that's a STORE
  // id (e.g. "Bunny Momos 1"'s own id), while production records are tagged with the
  // PRODUCTION HOUSE's id (`p.storeId`/`p.productionHouseId` - see resolvedProductionHouseId's
  // comment above for the same legacy naming quirk). Those are different id namespaces, so
  // picking a specific store here always came up empty even when that store's linked
  // production house had real entries - "All stores" only ever appeared to work because an
  // empty/falsy effectiveStoreId skipped the filter entirely, showing every house's data
  // unfiltered. Resolve through the store's actual productionHouseId link instead, matching
  // either field a record might have used.
  const productionForDate = useMemo(() => {
    logger.debugProduction('ProductionManagement - resolvedProductionHouseId:', resolvedProductionHouseId);
    const filteredProduction = resolvedProductionHouseId
      ? context.productionData.filter(p => p.productionHouseId === resolvedProductionHouseId || p.storeId === resolvedProductionHouseId)
      : context.productionData;
    logger.debugProduction('ProductionManagement - filtered production count:', filteredProduction.length);
    return filteredProduction.find(p => p.date === selectedDate);
  }, [context.productionData, selectedDate, resolvedProductionHouseId]);

  // Batch codes this house made in the 3 days before the selected date, per type - offered
  // when momos are folded from a batch's leftover stuffing.
  const earlierBatchCodes = useMemo(() => {
    const codes: Record<string, string[]> = {};
    const from = new Date(`${selectedDate}T00:00:00`);
    from.setDate(from.getDate() - 3);
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const houseProduction = resolvedProductionHouseId
      ? context.productionData.filter(p => p.productionHouseId === resolvedProductionHouseId || p.storeId === resolvedProductionHouseId)
      : context.productionData;
    houseProduction
      .filter((p) => p.date >= fromStr && p.date < selectedDate)
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((p) => {
        MOMO_TYPES.forEach((t) => {
          (p.batches?.[t.key] || []).forEach((b) => {
            if (b.code && !b.code.endsWith('-L')) codes[t.key] = [...(codes[t.key] || []), b.code];
          });
        });
      });
    return codes;
  }, [context.productionData, selectedDate, resolvedProductionHouseId]);

  // Initialize form data
  const [formData, setFormData] = useState<Omit<ProductionData, 'id' | 'createdBy' | 'approvalStatus' | 'approvedBy' | 'approvedAt' | 'storeId'>>({
    date: selectedDate,
    chickenMomos: { dough: 0, stuffing: 0, final: 0 },
    chickenCheeseMomos: { dough: 0, stuffing: 0, final: 0 },
    vegMomos: { dough: 0, stuffing: 0, final: 0 },
    cheeseCornMomos: { dough: 0, stuffing: 0, final: 0 },
    paneerMomos: { dough: 0, stuffing: 0, final: 0 },
    vegKurkureMomos: { batter: 0, coating: 0, final: 0 },
    chickenKurkureMomos: { batter: 0, coating: 0, final: 0 },
    wastage: { dough: 0, stuffing: 0, batter: 0, coating: 0 },
    batches: {},
    sauces: {
      panfriedSauce: 0,
      chilliChickenSauce: 0,
      spicyKoreanSauce: 0,
      hotGarlicSauce: 0,
      tandooriSauce: 0,
      soupPremix: 0,
      greenMayoChutney: 0,
      spicyRedChutney: 0,
    }
  });

  // Load existing data when date changes
  useEffect(() => {
    if (productionForDate) {
      setFormData({
        date: productionForDate.date,
        chickenMomos: productionForDate.chickenMomos,
        chickenCheeseMomos: productionForDate.chickenCheeseMomos,
        vegMomos: productionForDate.vegMomos,
        cheeseCornMomos: productionForDate.cheeseCornMomos,
        paneerMomos: productionForDate.paneerMomos,
        vegKurkureMomos: productionForDate.vegKurkureMomos,
        chickenKurkureMomos: productionForDate.chickenKurkureMomos,
        wastage: productionForDate.wastage,
        // An entry saved before batch codes keeps its pieces as one uncoded row, so editing
        // it never silently drops them.
        batches: Object.fromEntries(MOMO_TYPES.map((t) => {
          const saved = productionForDate.batches?.[t.key];
          const final = (productionForDate as any)[t.key]?.final || 0;
          return [t.key, saved && saved.length > 0 ? saved : final > 0 ? [{ code: '', pieces: final }] : []];
        })),
        sauces: productionForDate.sauces,
      });
    } else {
      setFormData({
        date: selectedDate,
        chickenMomos: { dough: 0, stuffing: 0, final: 0 },
        chickenCheeseMomos: { dough: 0, stuffing: 0, final: 0 },
        vegMomos: { dough: 0, stuffing: 0, final: 0 },
        cheeseCornMomos: { dough: 0, stuffing: 0, final: 0 },
        paneerMomos: { dough: 0, stuffing: 0, final: 0 },
        vegKurkureMomos: { batter: 0, coating: 0, final: 0 },
        chickenKurkureMomos: { batter: 0, coating: 0, final: 0 },
        wastage: { dough: 0, stuffing: 0, batter: 0, coating: 0 },
        batches: {},
        sauces: {
          panfriedSauce: 0,
          chilliChickenSauce: 0,
          spicyKoreanSauce: 0,
          hotGarlicSauce: 0,
          tandooriSauce: 0,
          soupPremix: 0,
          greenMayoChutney: 0,
          spicyRedChutney: 0,
        }
      });
    }
  }, [selectedDate, productionForDate]);

  // Once the ledger is tracking wastage per pool, stop asking for the same number a second
  // time in the manual grid below - keep formData.wastage (still submitted on the
  // `production:` record) in sync with the computed rollup instead.
  useEffect(() => {
    if (!ledgerTrackingLive) return;
    setFormData((prev) => {
      const same = prev.wastage.dough === derivedLedgerWastage.dough &&
        prev.wastage.stuffing === derivedLedgerWastage.stuffing &&
        prev.wastage.batter === derivedLedgerWastage.batter &&
        prev.wastage.coating === derivedLedgerWastage.coating;
      return same ? prev : { ...prev, wastage: derivedLedgerWastage };
    });
  }, [ledgerTrackingLive, derivedLedgerWastage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (submitting) {
      logger.warn('Submission already in progress, ignoring duplicate request');
      return;
    }

    const productionData: Omit<ProductionData, 'id'> = {
      ...formData,
      batches: Object.fromEntries(Object.entries(formData.batches || {}).map(([key, list]) => [key, (list || []).filter((b) => b.pieces > 0)])),
      date: selectedDate,
      createdBy: context.user?.employeeId || context.user?.email || 'unknown',
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      storeId: context.user?.storeId || undefined,
      productionHouseId: context.user?.storeId || undefined // Production heads' storeId is actually their production house ID
    };
    
    console.log('🏭 Saving Production Data:');
    console.log('  - User storeId:', context.user?.storeId);
    console.log('  - Production data storeId:', productionData.storeId);
    console.log('  - Production data productionHouseId:', productionData.productionHouseId);
    console.log('  - Full production data:', productionData);

    try {
      setSubmitting(true);
      if (productionForDate) {
        await context.updateProductionData(productionForDate.id, productionData);
        alert('Production data updated successfully!');
      } else {
        await context.addProductionData(productionData);
        alert('Production data saved successfully!');
      }
    } catch (error) {
      console.error('Error saving production data:', error);
      alert('Failed to save production data. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!productionForDate) return;

    // Prevent duplicate approvals
    if (approving) {
      console.log('⚠️ Approval already in progress, ignoring duplicate request');
      return;
    }

    try {
      setApproving(true);
      // Production house inventory crediting now happens server-side (in
      // /production/:id/approve itself), so it fires exactly once regardless of which
      // approval path is used - this used to also credit inventory client-side here,
      // which the inline pending-approvals button and the 24h auto-approve cron both
      // skipped entirely (confirmed bug), and would now double-credit if left in.
      await context.approveProductionData(productionForDate.id);
      alert('Production data approved successfully! Inventory updated.');
    } catch (error) {
      console.error('Error approving production:', error);
      alert('Failed to approve production data. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm('This will remove duplicate pending production entries, keeping only the original entry for each date. Continue?')) {
      return;
    }

    setCleaning(true);
    try {
      const result = await api.cleanupDuplicateProduction();
      
      if (result.success) {
        toast.success(result.message);
        
        // Show details if any duplicates were found
        if (result.duplicatesFound > 0) {
          console.log('🧹 Cleanup Details:', result.details);
          
          // Automatically reload the page to refresh data
          toast.info('Refreshing data...', { duration: 2000 });
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          toast.info('No duplicate entries found!');
          setCleaning(false);
        }
      }
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      toast.error('Failed to clean up duplicates. Please try again.');
      setCleaning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-4 sm:mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0">
              <Factory className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Production Management</h1>
              <p className="text-sm sm:text-base text-gray-500">Log daily production data for momos, sauces, and track wastage</p>
            </div>
          </div>
        </div>

        {/* Cleanup button for Cluster Heads */}
        {isClusterHead && activeTab === 'approvals' && (
          <button
            onClick={handleCleanupDuplicates}
            disabled={cleaning}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
          >
            <Eraser className="w-4 h-4" />
            {cleaning ? 'Cleaning...' : 'Clean Duplicates'}
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      {canViewApprovals && (
        <div className="bg-gray-100 rounded-xl p-1 mb-6 flex gap-1">
          <button
            onClick={() => setActiveTab('entry')}
            className={`flex-1 px-6 py-3 rounded-lg transition-all font-medium ${
              activeTab === 'entry'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Production Entry
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex-1 px-6 py-3 rounded-lg transition-all flex items-center justify-center gap-2 font-medium ${
              activeTab === 'approvals'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pending Approvals
            {(() => {
              const pendingCount = context.productionData.filter(p =>
                p.approvalStatus === 'pending' &&
                (!context.user?.storeId || p.storeId === context.user.storeId)
              ).length;
              return pendingCount > 0 && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  activeTab === 'approvals' ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-700'
                }`}>
                  {pendingCount}
                </span>
              );
            })()}
          </button>
        </div>
      )}

      {/* Pending Approvals View */}
      {activeTab === 'approvals' && canViewApprovals && (
        <div className="space-y-4">
          {(() => {
            const pendingProduction = context.productionData
              .filter(p => 
                p.approvalStatus === 'pending' && 
                (!context.user?.storeId || p.storeId === context.user.storeId)
              )
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (pendingProduction.length === 0) {
              return (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2">All Caught Up!</h3>
                  <p className="text-gray-600">No pending production approvals at this time.</p>
                </div>
              );
            }

            return pendingProduction.map((production) => {
              const totalProduction = 
                production.chickenMomos.final +
                production.chickenCheeseMomos.final +
                production.vegMomos.final +
                production.cheeseCornMomos.final +
                production.paneerMomos.final +
                production.vegKurkureMomos.final +
                production.chickenKurkureMomos.final;

              const totalWastage =
                production.wastage.dough +
                production.wastage.stuffing +
                production.wastage.batter +
                production.wastage.coating;

              return (
                <div key={production.id} className="bg-white rounded-2xl shadow-sm border-2 border-yellow-300 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                          {new Date(production.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600">Submitted by: {production.createdBy}</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await context.approveProductionData(production.id);
                          alert('Production data approved successfully!');
                        } catch (error) {
                          alert('Failed to approve production data. Please try again.');
                        }
                      }}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <CheckSquare className="w-5 h-5" />
                      Approve
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Total Production</div>
                      <div className="text-2xl font-semibold">{totalProduction} pcs</div>
                    </div>
                    <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-red-100 mb-1">Total Wastage</div>
                      <div className="text-2xl font-semibold">{totalWastage.toFixed(2)} kg</div>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-amber-100 mb-1">Kurkure Production</div>
                      <div className="text-2xl font-semibold">
                        {production.vegKurkureMomos.final + production.chickenKurkureMomos.final} pcs
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-blue-100 mb-1">Regular Momos</div>
                      <div className="text-2xl font-semibold">
                        {production.chickenMomos.final +
                          production.chickenCheeseMomos.final +
                          production.vegMomos.final +
                          production.cheeseCornMomos.final +
                          production.paneerMomos.final}{' '}
                        pcs
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm text-gray-700 mb-3">Production Breakdown:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                      {production.chickenMomos.final > 0 && (
                        <div className="bg-red-50 p-2 rounded">
                          <p className="text-gray-600">Chicken</p>
                          <p className="text-gray-900">{production.chickenMomos.final} pcs</p>
                        </div>
                      )}
                      {production.chickenCheeseMomos.final > 0 && (
                        <div className="bg-yellow-50 p-2 rounded">
                          <p className="text-gray-600">Chk Cheese</p>
                          <p className="text-gray-900">{production.chickenCheeseMomos.final} pcs</p>
                        </div>
                      )}
                      {production.vegMomos.final > 0 && (
                        <div className="bg-green-50 p-2 rounded">
                          <p className="text-gray-600">Veg</p>
                          <p className="text-gray-900">{production.vegMomos.final} pcs</p>
                        </div>
                      )}
                      {production.cheeseCornMomos.final > 0 && (
                        <div className="bg-amber-50 p-2 rounded">
                          <p className="text-gray-600">Cheese Corn</p>
                          <p className="text-gray-900">{production.cheeseCornMomos.final} pcs</p>
                        </div>
                      )}
                      {production.paneerMomos.final > 0 && (
                        <div className="bg-blue-50 p-2 rounded">
                          <p className="text-gray-600">Paneer</p>
                          <p className="text-gray-900">{production.paneerMomos.final} pcs</p>
                        </div>
                      )}
                      {production.vegKurkureMomos.final > 0 && (
                        <div className="bg-lime-50 p-2 rounded">
                          <p className="text-gray-600">Veg Kurkure</p>
                          <p className="text-gray-900">{production.vegKurkureMomos.final} pcs</p>
                        </div>
                      )}
                      {production.chickenKurkureMomos.final > 0 && (
                        <div className="bg-orange-50 p-2 rounded">
                          <p className="text-gray-600">Chk Kurkure</p>
                          <p className="text-gray-900">{production.chickenKurkureMomos.final} pcs</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Production Entry View */}
      {activeTab === 'entry' && (
        <>
      {/* Date Selector */}
      <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* This week's plan and today's purchases, from the forecast of every store this house supplies */}
      {resolvedProductionHouseId && context.user?.accessToken && (context.stores || []).some((st) => st.productionHouseId === resolvedProductionHouseId) && (
        <ProductionPlanCards
          accessToken={context.user.accessToken}
          storeIds={(context.stores || []).filter((st) => st.productionHouseId === resolvedProductionHouseId).map((st) => st.id)}
        />
      )}

      {/* Which days this month have no production logged (same idea as the settlement check) */}
      {resolvedProductionHouseId && (
        <ProductionCoverage
          productionData={context.productionData}
          productionRequests={context.productionRequests}
          stores={context.stores || []}
          productionHouseId={resolvedProductionHouseId}
          selectedDate={selectedDate}
          onPickDate={setSelectedDate}
        />
      )}

      {/* Weekly Production Goal - navigable Monday-start week, independent of the
          Production Entry date selector above. Progress is computed live from real
          production: records, not a separately tracked counter, so it can never drift
          out of sync with what was actually made. */}
      {resolvedProductionHouseId && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                  {isGoalWeekCurrent ? "This Week's Production Goal" : isGoalWeekFuture ? 'Upcoming Week\'s Goal' : "Past Week's Goal"}
                </h2>
                <p className="text-xs text-gray-500">
                  {new Date(goalWeekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {' – '}
                  {new Date(goalWeekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {isGoalWeekFuture ? ' · hasn\'t started yet' : isGoalWeekCurrent ? ` · progress through ${new Date(getTodayIST() + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ' · week complete'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setGoalWeekStart((w) => addDaysToDateStr(w, -7))}
                  className="p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {!isGoalWeekCurrent && (
                  <button
                    onClick={() => setGoalWeekStart(todayMonday)}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 border-x border-gray-300 transition-colors"
                  >
                    This week
                  </button>
                )}
                <button
                  onClick={() => setGoalWeekStart((w) => addDaysToDateStr(w, 7))}
                  className="p-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                  aria-label="Next week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {canSetWeeklyGoal && (
                <button
                  onClick={openEditGoal}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {weeklyGoal ? 'Edit Goal' : 'Set Goal'}
                </button>
              )}
            </div>
          </div>

          {weeklyGoalLoading ? (
            <div className="text-center py-6 text-gray-500 text-sm">Loading this week's goal…</div>
          ) : !weeklyGoal || Object.keys(weeklyGoal.goals || {}).length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No goal set for this week yet.
              {!canSetWeeklyGoal && ' Ask your cluster head or operations manager to set one.'}
            </div>
          ) : (
            <div className="space-y-3">
              {MOMO_TYPES.filter((t) => (weeklyGoal.goals?.[t.key] || 0) > 0).map((t) => {
                const goal = weeklyGoal.goals?.[t.key] || 0;
                const achieved = weekProgress[t.key] || 0;
                const pct = goal > 0 ? Math.round((achieved / goal) * 100) : 0;
                const barPct = Math.min(pct, 100);
                const met = pct >= 100;
                return (
                  <div key={t.key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        {t.label}
                      </span>
                      <span className="tabular-nums text-gray-600">
                        {achieved.toLocaleString()} / {goal.toLocaleString()}
                        <span className={`ml-1.5 font-semibold ${met ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {pct}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${met ? 'bg-emerald-500' : 'bg-orange-500'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Weekly Goal Modal */}
      {showEditGoal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full my-8">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                Weekly Goal &middot; {new Date(goalWeekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(goalWeekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </h3>
              <button onClick={() => setShowEditGoal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {MOMO_TYPES.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-3">
                  <label htmlFor={`goal-${t.key}`} className="text-sm text-gray-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </label>
                  <input
                    id={`goal-${t.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={goalDraft[t.key] || ''}
                    onChange={(e) => setGoalDraft((prev) => ({ ...prev, [t.key]: e.target.value }))}
                    className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => setShowEditGoal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGoal}
                disabled={goalSaving}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all text-sm font-semibold disabled:opacity-50"
              >
                {goalSaving ? 'Saving…' : 'Save Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Status Banner */}
      {productionForDate && productionForDate.approvalStatus === 'pending' && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <p className="text-gray-900">
              Production data for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} is awaiting approval from Operations Manager.
            </p>
          </div>
        </div>
      )}

      {productionForDate && productionForDate.approvalStatus === 'approved' && (
        <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-gray-900">
              ✓ Production data approved by {productionForDate.approvedBy}
            </p>
          </div>
        </div>
      )}

      {/* Operations Manager Approval Section */}
      {canApprove && productionForDate && productionForDate.approvalStatus === 'pending' && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-4 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-blue-600" />
            Approval Required
          </h2>
          <p className="text-gray-700 mb-4">
            Production data submitted by {productionForDate.createdBy} is awaiting your approval.
          </p>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckSquare className="w-5 h-5" />
            {approving ? 'Approving...' : 'Approve Production Data'}
          </button>
        </div>
      )}

      {/* Production Ledger - dough/stuffing/batter/coating, carried forward day to day.
          Separate from the production: record below (which only tracks finished pieces,
          wastage, and sauces) - see the Production Ledger + Analytics plan. */}
      {!resolvedProductionHouseId ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 text-center text-gray-500 text-sm">
          No production house is linked to the selected store yet - dough/stuffing/batter/coating carry-forward isn't available.
        </div>
      ) : !ledgerTrackingLive ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6 text-sm text-amber-800">
          Dough/stuffing/batter/coating carry-forward tracking starts {PRODUCTION_LEDGER_GO_LIVE_DATE}. Earlier dates still use the plain quantity fields below.
        </div>
      ) : ledgerLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-6 text-center text-gray-500">Loading ledger…</div>
      ) : (
        <div className="space-y-4 mb-6">
          <LedgerOpeningBalanceSummary pools={ledgerPools} />
          {canEditLedger && !ledgerClosed && (
            <LogSharedPoolForm
              disabled={!canEditLedger}
              submitting={ledgerItemSubmitting}
              onAdd={(poolKey, qty) => handleAddLedgerItem(poolKey, qty, 0)}
            />
          )}
          {canEditLedger && !ledgerClosed && (
            <PrepareLineItemForm disabled={!canEditLedger} submitting={ledgerItemSubmitting} onAdd={handleAddLedgerItem} />
          )}
          <PreparedLineItemsList items={ledgerItems} disabled={!canEditLedger || ledgerClosed} onDelete={handleDeleteLedgerItem} />
          {canEditLedger && (
            <EndOfDayCloseForm
              pools={ledgerPools}
              isFirstEverDay={!ledgerHasAnyPriorRecord}
              closed={ledgerClosed}
              submitting={ledgerCloseSubmitting}
              onSubmit={handleCloseLedgerDay}
            />
          )}
          {resolvedProductionHouseId && (
            <AdditionalWastageForm
              productionHouseId={resolvedProductionHouseId}
              date={selectedDate}
              disabled={!canEditLedger}
              notes={wastageNotes}
              onAdd={handleAddWastageNote}
              onDelete={handleDeleteWastageNote}
            />
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Final Pieces - once the ledger tracks dough/stuffing/batter/coating above, the
            "Regular (Dough+Stuffing)" vs "Kurkure (Batter+Coating)" split down here no
            longer means anything - both group headings were describing fields that are now
            hidden, leaving a heading like "Kurkure Momos (Batter + Coating)" over a card
            that only asks for a piece count. Clubbed into one grid instead, using each
            type's own color as a quiet visual grouping cue rather than a separate section
            and heading per dough-type. */}
        {ledgerTrackingLive ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
              <ChefHat className="w-6 h-6 text-orange-600" />
              Final Pieces
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {selectedDate >= BATCH_TRACKING_FROM
                ? 'Pieces from each stuffing batch today. One mix = one batch, coded date-type-batch (2510-CHK-B2) - the same code that goes on the tray card and bag labels.'
                : 'How many finished pieces of each type came out today'}
            </p>
            <div className={`grid gap-4 ${selectedDate >= BATCH_TRACKING_FROM ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
              {MOMO_TYPES.map((t) => {
                const typeData = (formData as any)[t.key];
                if (selectedDate >= BATCH_TRACKING_FROM) {
                  return (
                    <BatchPiecesCard
                      key={t.key}
                      momoType={t}
                      date={selectedDate}
                      batches={formData.batches?.[t.key] || []}
                      earlierBatchCodes={earlierBatchCodes[t.key] || []}
                      disabled={!canEdit}
                      onChange={(next: ProductionBatch[]) => setFormData((prev) => ({
                        ...prev,
                        batches: { ...(prev.batches || {}), [t.key]: next },
                        [t.key]: { ...(prev as any)[t.key], final: next.reduce((sum, b) => sum + (b.pieces || 0), 0) },
                      } as typeof prev))}
                    />
                  );
                }
                return (
                  <div
                    key={t.key}
                    className="rounded-xl p-4 border-2"
                    style={{ backgroundColor: `${t.color}0d`, borderColor: `${t.color}40` }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                        {t.label} {t.group === 'kurkure' ? 'Kurkure' : ''} Momos
                      </h3>
                    </div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Final Pieces (pcs)</label>
                    <input
                      type="number"
                      value={typeData.final}
                      onChange={(e) => setFormData({
                        ...formData,
                        [t.key]: { ...typeData, final: parseInt(e.target.value) || 0 }
                      } as typeof formData)}
                      className="w-full px-3 py-2.5 text-base border-2 border-gray-300 rounded-lg bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-200 disabled:bg-gray-100"
                      disabled={!canEdit}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        <>
        {/* Regular Momos Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-6 flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-orange-600" />
            Regular Momos (Dough + Stuffing)
          </h2>

          <div className="space-y-6">
            {/* Chicken Momos */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Chicken Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenMomos: { ...formData.chickenMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenMomos: { ...formData.chickenMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.chickenMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenMomos: { ...formData.chickenMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Chicken Cheese Momos */}
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Chicken Cheese Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenCheeseMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenCheeseMomos: { ...formData.chickenCheeseMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenCheeseMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenCheeseMomos: { ...formData.chickenCheeseMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.chickenCheeseMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenCheeseMomos: { ...formData.chickenCheeseMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Veg Momos */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Veg Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegMomos: { ...formData.vegMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegMomos: { ...formData.vegMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.vegMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegMomos: { ...formData.vegMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Cheese Corn Momos */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Cheese Corn Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cheeseCornMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      cheeseCornMomos: { ...formData.cheeseCornMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cheeseCornMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      cheeseCornMomos: { ...formData.cheeseCornMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.cheeseCornMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      cheeseCornMomos: { ...formData.cheeseCornMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Paneer Momos */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Paneer Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dough (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paneerMomos.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      paneerMomos: { ...formData.paneerMomos, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stuffing (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paneerMomos.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      paneerMomos: { ...formData.paneerMomos, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Momos (pcs)</label>
                  <input
                    type="number"
                    value={formData.paneerMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      paneerMomos: { ...formData.paneerMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Kurkure Momos Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-6 flex items-center gap-2">
            <Factory className="w-6 h-6 text-orange-600" />
            Kurkure Momos (Batter + Coating)
          </h2>

          <div className="space-y-6">
            {/* Veg Kurkure Momos */}
            <div className="bg-gradient-to-br from-lime-50 to-lime-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Veg Kurkure Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Batter (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegKurkureMomos.batter}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegKurkureMomos: { ...formData.vegKurkureMomos, batter: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Coating Mix (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vegKurkureMomos.coating}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegKurkureMomos: { ...formData.vegKurkureMomos, coating: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Kurkure (pcs)</label>
                  <input
                    type="number"
                    value={formData.vegKurkureMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      vegKurkureMomos: { ...formData.vegKurkureMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Chicken Kurkure Momos */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4">
              <h3 className="text-gray-900 mb-4 font-semibold">Chicken Kurkure Momos</h3>
              <div className={`grid grid-cols-1 gap-4 ${ledgerTrackingLive ? 'md:grid-cols-1 max-w-xs' : 'md:grid-cols-3'}`}>
                {!ledgerTrackingLive && (
                <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Batter (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenKurkureMomos.batter}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenKurkureMomos: { ...formData.chickenKurkureMomos, batter: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Coating Mix (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.chickenKurkureMomos.coating}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenKurkureMomos: { ...formData.chickenKurkureMomos, coating: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
                </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Final Kurkure (pcs)</label>
                  <input
                    type="number"
                    value={formData.chickenKurkureMomos.final}
                    onChange={(e) => setFormData({
                      ...formData,
                      chickenKurkureMomos: { ...formData.chickenKurkureMomos, final: parseInt(e.target.value) || 0 }
                    })}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        </>
        )}

        {/* Wastage Section - once the ledger is live, this card would only ever repeat
            numbers already visible in the Leftover Snapshot's Wastage column above (rolled
            into 4 buckets instead of per-pool) - pure duplication, not new information, so it
            no longer renders at all for ledger-tracked dates. The rollup still happens
            silently (see the useEffect syncing formData.wastage above) purely so the
            `production:` record keeps carrying a real number for ProductionHouseStockStatus's
            "Today's Wastage" tile to read - it just has no reason to take up space twice on
            this page. Below go-live, or for a house with no ledger, there's no Leftover
            Snapshot to read this from, so the manual grid stays exactly as it was. */}
        {!ledgerTrackingLive && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-6 flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-red-600" />
              Wastage Tracking
            </h2>
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Dough Wastage (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.wastage.dough}
                    onChange={(e) => setFormData({
                      ...formData,
                      wastage: { ...formData.wastage, dough: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Stuffing Wastage (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.wastage.stuffing}
                    onChange={(e) => setFormData({
                      ...formData,
                      wastage: { ...formData.wastage, stuffing: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Batter Wastage (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.wastage.batter}
                    onChange={(e) => setFormData({
                      ...formData,
                      wastage: { ...formData.wastage, batter: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Coating Wastage (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.wastage.coating}
                    onChange={(e) => setFormData({
                      ...formData,
                      wastage: { ...formData.wastage, coating: parseFloat(e.target.value) || 0 }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sauces and Chutneys Section - same per-item tinted-card treatment as the Final
            Pieces grid above, instead of the old flat single-color block, so the page reads
            as one consistent design rather than half redesigned. */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-1 flex items-center gap-2">
            <Soup className="w-6 h-6 text-rose-600" />
            Sauces & Chutneys
          </h2>
          <p className="text-sm text-gray-500 mb-6">How much of each was made today</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {SAUCE_ITEMS.map((item) => (
              <div
                key={item.key}
                className="rounded-xl p-4 border-2"
                style={{ backgroundColor: `${item.color}0d`, borderColor: `${item.color}40` }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <h3 className="text-sm font-semibold text-gray-900 leading-tight">{item.label}</h3>
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity (L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sauces[item.key]}
                  onChange={(e) => setFormData({
                    ...formData,
                    sauces: { ...formData.sauces, [item.key]: parseFloat(e.target.value) || 0 }
                  })}
                  className="w-full px-3 py-2.5 text-base border-2 border-gray-300 rounded-lg bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-200 disabled:bg-gray-100"
                  disabled={!canEdit}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : (productionForDate ? 'Update Production Data' : 'Save Production Data')}
            </button>
          </div>
        )}
      </form>
        </>
      )}
    </div>
  );
}