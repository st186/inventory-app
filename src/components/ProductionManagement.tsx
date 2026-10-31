import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType, ProductionData } from '../App';
import { ArrowLeft, CheckSquare, Eraser } from 'lucide-react';
import * as api from '../utils/api';
import { toast } from './ui/sonner';
import { confirm } from './ui/confirm';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { DateStrip } from './ui/date-strip';
import { Field } from './ui/field';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { Progress } from './ui/progress';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { SkeletonListRows } from './ui/skeleton';
import { StatusChip } from './ui/status-chip';
import { t as tSaved, useT } from '../utils/i18n';
import { logger } from '../utils/logger';
import { getTodayIST } from '../utils/timezone';
import { productionInchargeHouseId } from '../utils/entityAccess';
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
import { WeeklyGoalCard } from './production/WeeklyGoalCard';
import { ProductionApprovals } from './production/ProductionApprovals';
import { ProductionFlagsBanner } from './production/ProductionFlags';
import { useProductionPlan } from './production/useProductionPlan';
import { KITCHEN_DAY_FROM, KitchenDay, sauceId } from './production/KitchenDay';
import { ALL_ITEMS, itemDay } from './production/kitchenDayMath';
import { CollapsibleCard, StickyActions, StockPage, bagsText, dayLabel, formatCount, momoName } from './stock/stockShared';

// Matches the backend's PRODUCTION_LEDGER_GO_LIVE_DATE (index.ts) exactly - dates before
// this keep using the old write-only dough/stuffing/batter/coating fields on `production:`
// (still collected nowhere in this UI once the ledger is live, but the field stays on the
// type for backward compatibility with old records - see the plan for why no backfill).
const PRODUCTION_LEDGER_GO_LIVE_DATE = '2026-08-23';

// The 8 sauces/chutneys this kitchen actually makes - same names/order as
// AdditionalWastageForm's KNOWN_SAUCES, each given its own tint purely so this grid reads
// like the Final Pieces grid above (one glance per card) instead of a flat, undifferentiated
// list of look-alike inputs. Sauces and chutneys are made in litres, soup premix in kg (owner,
// 29 Oct 2026).
const SAUCE_ITEMS: { key: 'panfriedSauce' | 'chilliChickenSauce' | 'spicyKoreanSauce' | 'hotGarlicSauce' | 'tandooriSauce' | 'soupPremix' | 'greenMayoChutney' | 'spicyRedChutney'; label: string; unit: 'L' | 'kg' }[] = [
  { key: 'panfriedSauce', label: 'Panfried Sauce', unit: 'L' },
  { key: 'chilliChickenSauce', label: 'Chilli Chicken Sauce', unit: 'L' },
  { key: 'spicyKoreanSauce', label: 'Spicy Korean Sauce', unit: 'L' },
  { key: 'hotGarlicSauce', label: 'Hot Garlic Sauce', unit: 'L' },
  { key: 'tandooriSauce', label: 'Tandoori Sauce', unit: 'L' },
  { key: 'soupPremix', label: 'Soup Premix', unit: 'kg' },
  { key: 'greenMayoChutney', label: 'Green Mayo Chutney', unit: 'L' },
  { key: 'spicyRedChutney', label: 'Spicy Red Chutney', unit: 'L' },
];

/**
 * A number box that takes decimals as they're typed. Turning every keystroke into a number lost
 * the point ("2." became 2, so 2.260 was saved as 2260 on 28 Oct); this keeps the text while
 * typing and passes the number on.
 */
function DecimalInput({ value, onChange, unit, className, ...rest }: { value: number; onChange: (n: number) => void; unit?: string } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? String(value) : '');
  // A new day or a reload brings a different number: show it (but not while it matches what's typed).
  useEffect(() => {
    setText((cur) => ((parseFloat(cur) || 0) === (value || 0) ? cur : value ? String(value) : ''));
  }, [value]);
  return (
    <span className="flex items-center gap-2">
      <Input
        {...rest}
        type="text"
        inputMode="decimal"
        placeholder="0"
        className={className}
        value={text}
        onChange={(e) => {
          const clean = e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
          setText(clean);
          onChange(parseFloat(clean) || 0);
        }}
      />
      {unit && <span className="w-6 text-body-sm text-text-2">{unit}</span>}
    </span>
  );
}

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
  const { t, lang } = useT();
  // The send-production summary sheet, and which momo row has its batches open.
  const [sendOpen, setSendOpen] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
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

  // The production house this entry tab's ledger belongs to, and the one handleSubmit saves
  // entries under. A production incharge's comes from their assigned house (not their raw
  // storeId, which can hold a store's id - see productionInchargeHouseId); for anyone else
  // (operations manager/cluster head), resolve properly through whichever real store is
  // selected (or their own assigned store as a fallback), via that store's own
  // productionHouseId link.
  const resolvedProductionHouseId = useMemo(() => {
    if (isProductionIncharge) {
      const own = productionInchargeHouseId(context.user, context.stores || []);
      if (own) return own;
    }
    const candidateStoreId = selectedStoreId || context.user?.storeId;
    if (candidateStoreId) {
      const store = context.stores?.find(s => s.id === candidateStoreId);
      if (store?.productionHouseId) return store.productionHouseId;
    }
    return null;
  }, [isProductionIncharge, context.user, selectedStoreId, context.stores]);

  // Pending entries for the approvals tab. Entries are matched on their production house (older
  // ones carry it only in storeId); operations managers and the cluster head see every house's.
  // This compared entries with the viewer's own storeId, so an operations manager who has a
  // store saw an empty list.
  const isPendingForViewer = (p: ProductionData) =>
    p.approvalStatus === 'pending' &&
    (isOperationsManager || isClusterHead || !resolvedProductionHouseId ||
      p.productionHouseId === resolvedProductionHouseId || p.storeId === resolvedProductionHouseId);

  const [ledgerEntry, setLedgerEntry] = useState<api.ProductionLedgerEntry | null>(null);
  const [ledgerLive, setLedgerLive] = useState<api.ProductionLedgerLive | null>(null);
  const [ledgerItems, setLedgerItems] = useState<api.ProductionLedgerItem[]>([]);
  const [ledgerHasAnyPriorRecord, setLedgerHasAnyPriorRecord] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerItemSubmitting, setLedgerItemSubmitting] = useState(false);
  const [ledgerCloseSubmitting, setLedgerCloseSubmitting] = useState(false);
  const [wastageNotes, setWastageNotes] = useState<api.ProductionWastageNote[]>([]);
  const [morning, setMorning] = useState<api.MorningWeighIn | null>(null);
  const [lastCounted, setLastCounted] = useState<api.LastCounted>({});


  const ledgerTrackingLive = selectedDate >= PRODUCTION_LEDGER_GO_LIVE_DATE;
  const plan = useProductionPlan(
    context.user?.accessToken,
    resolvedProductionHouseId ? (context.stores || []).filter((st) => st.productionHouseId === resolvedProductionHouseId).map((st) => st.id) : [],
    selectedDate,
    context.inventoryItems,
  );

  const fetchLedger = async () => {
    if (!resolvedProductionHouseId || !context.user?.accessToken || !ledgerTrackingLive) return;
    setLedgerLoading(true);
    try {
      const [{ entry, live, items, hasAnyPriorRecord, morning: weighIn, lastCounted: counted }, notes] = await Promise.all([
        api.getProductionLedger(context.user.accessToken, resolvedProductionHouseId, selectedDate),
        api.getProductionWastageNotes(context.user.accessToken, resolvedProductionHouseId, selectedDate),
      ]);
      setLedgerEntry(entry);
      setLedgerLive(live);
      setLedgerItems(items);
      setLedgerHasAnyPriorRecord(hasAnyPriorRecord);
      setWastageNotes(notes);
      setMorning(weighIn);
      setLastCounted(counted);
    } catch (error) {
      console.error('Failed to load production ledger:', error);
      setLedgerEntry(null);
      setLedgerLive(null);
      setLedgerItems([]);
      setWastageNotes([]);
      setMorning(null);
      setLastCounted({});
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
  // Who was in and when, and the house's machines, for the leftover reasons at the close.
  const [dayContext, setDayContext] = useState<api.LedgerDayContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDayContext(null);
    if (!resolvedProductionHouseId || !context.user?.accessToken || !ledgerTrackingLive || !(canEditLedger || isClusterHead)) return;
    api.getLedgerDayContext(context.user.accessToken, resolvedProductionHouseId, selectedDate)
      .then((ctx) => { if (!cancelled) setDayContext(ctx); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [resolvedProductionHouseId, selectedDate, context.user?.accessToken, ledgerTrackingLive, canEditLedger, isClusterHead]);

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

  const handleAddLedgerItem = async (momoKey: string, globalPoolQty: number, perTypePoolQty: number, withLeftover?: api.WithLeftoverReason) => {
    if (!context.user?.accessToken || !resolvedProductionHouseId) return;
    setLedgerItemSubmitting(true);
    try {
      await api.addProductionLedgerItem(context.user.accessToken, resolvedProductionHouseId, selectedDate, momoKey, globalPoolQty, perTypePoolQty, withLeftover);
      toast.success(tSaved('stock.prod.batchLogged'));
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || tSaved('stock.prod.actionFailed'));
    } finally {
      setLedgerItemSubmitting(false);
    }
  };

  const handleDeleteLedgerItem = async (id: string) => {
    if (!context.user?.accessToken) return;
    if (!(await confirm({ title: t('stock.prod.removeBatchTitle'), confirmLabel: t('stock.prod.remove'), tone: 'danger' }))) return;
    try {
      await api.deleteProductionLedgerItem(context.user.accessToken, id);
      toast.success(tSaved('stock.prod.batchRemoved'));
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || tSaved('stock.prod.actionFailed'));
    }
  };

  const handleCloseLedgerDay = async (closingActuals: Record<string, number>, manualOpeningOverride?: Record<string, number>, wastageOverrides?: Record<string, number>, leftoverReport?: api.LeftoverReport, sauceLeft?: Record<string, number>) => {
    if (!context.user?.accessToken || !resolvedProductionHouseId) return;
    setLedgerCloseSubmitting(true);
    try {
      await api.closeProductionLedgerDay(context.user.accessToken, resolvedProductionHouseId, selectedDate, closingActuals, manualOpeningOverride, wastageOverrides, leftoverReport, sauceLeft);
      toast.success(tSaved('stock.prod.dayClosedToast'));
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || tSaved('stock.prod.actionFailed'));
    } finally {
      setLedgerCloseSubmitting(false);
    }
  };

  const handleAddWastageNote = async (description: string, quantity: number, unit: string, reason: string) => {
    if (!context.user?.accessToken || !resolvedProductionHouseId) return;
    try {
      await api.addProductionWastageNote(context.user.accessToken, resolvedProductionHouseId, selectedDate, description, quantity, unit, reason);
      toast.success(tSaved('stock.prod.wastageLogged'));
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || tSaved('stock.prod.actionFailed'));
    }
  };

  const handleDeleteWastageNote = async (id: string) => {
    if (!context.user?.accessToken) return;
    try {
      await api.deleteProductionWastageNote(context.user.accessToken, id);
      toast.success(tSaved('stock.prod.removed'));
      await fetchLedger();
    } catch (error: any) {
      toast.error(error?.message || tSaved('stock.prod.actionFailed'));
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

  const handleSubmit = async (e?: React.FormEvent): Promise<boolean> => {
    e?.preventDefault();

    // Prevent duplicate submissions
    if (submitting) {
      logger.warn('Submission already in progress, ignoring duplicate request');
      return false;
    }

    const productionData: Omit<ProductionData, 'id'> = {
      ...formData,
      batches: Object.fromEntries(Object.entries(formData.batches || {}).map(([key, list]) => [key, (list || []).filter((b) => b.pieces > 0)])),
      date: selectedDate,
      createdBy: context.user?.employeeId || context.user?.email || 'unknown',
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      storeId: resolvedProductionHouseId || context.user?.storeId || undefined,
      productionHouseId: resolvedProductionHouseId || context.user?.storeId || undefined
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
        toast.success(tSaved('stock.prod.updated'));
      } else {
        await context.addProductionData(productionData);
        toast.success(tSaved('stock.prod.saved'));
      }
      return true;
    } catch (error) {
      console.error('Error saving production data:', error);
      toast.error(tSaved('stock.prod.failed'));
      return false;
    } finally {
      setSubmitting(false);
      setSendOpen(false);
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
      toast.success('Production approved. Stock updated.');
    } catch (error) {
      console.error('Error approving production:', error);
      toast.error("Couldn't approve. Try again.");
    } finally {
      setApproving(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    const ok = await confirm({
      title: 'Clean up duplicate entries?',
      body: 'Removes duplicate pending production entries and keeps the first entry for each date.',
      confirmLabel: 'Clean up',
      tone: 'danger',
    });
    if (!ok) return;

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

  // ---- The new look (Production -> Batches) ----
  const batchTracking = selectedDate >= BATCH_TRACKING_FROM;
  const madeTotal = MOMO_TYPES.reduce((sum, m) => sum + ((formData as any)[m.key]?.final || 0), 0);
  const plannedTotal = plan ? MOMO_TYPES.reduce((sum, m) => sum + (plan[m.inventoryKey as keyof typeof plan] || 0), 0) : 0;
  const pendingCount = context.productionData.filter(isPendingForViewer).length;
  const statusChip = !productionForDate
    ? <StatusChip status="dayClose.draft" />
    : productionForDate.approvalStatus === 'approved'
      ? <StatusChip status="approval.approved" />
      : <StatusChip status="approval.pending" />;
  // Momos entered today by inventory key, and what each kitchen item should have left (the guided day).
  const piecesToday = useMemo(() => Object.fromEntries(MOMO_TYPES.map((m) => [m.inventoryKey, Number((formData as any)[m.key]?.final) || 0])), [formData]);
  const expectedLeft = useMemo(() => {
    const out: Record<string, number> = {};
    for (const it of ALL_ITEMS) {
      const d = itemDay(it, (ledgerPools as Record<string, api.ProductionLedgerPoolState>)[it.id], plan as Record<string, number> | null, piecesToday, dayContext?.perKg || {});
      if (d.shouldLeft !== null) out[it.id] = d.shouldLeft;
    }
    return out;
  }, [ledgerPools, plan, piecesToday, dayContext]);

  // Momos and sauces typed but not yet sent (closing the day sends them first). Batch codes compare
  // the way the form loads them: an entry saved without codes is one uncoded row per type.
  const batchSig = (batches: ProductionData['batches'] | undefined, finals: any) => JSON.stringify(MOMO_TYPES.map((m) => {
    const list = batches?.[m.key]?.length ? batches[m.key]! : (finals?.[m.key]?.final || 0) > 0 ? [{ code: '', pieces: finals[m.key].final }] : [];
    return list.filter((b) => b.pieces > 0).map((b) => `${b.code || ''}:${b.pieces}`);
  }));
  const productionDirty = !productionForDate
    || MOMO_TYPES.some((m) => ((formData as any)[m.key]?.final || 0) !== ((productionForDate as any)[m.key]?.final || 0))
    || SAUCE_ITEMS.some((x) => (formData.sauces[x.key] || 0) !== (productionForDate.sauces?.[x.key] || 0))
    || batchSig(formData.batches, formData) !== batchSig(productionForDate.batches, productionForDate);
  const kitchenDay = !!resolvedProductionHouseId && ledgerTrackingLive && selectedDate >= KITCHEN_DAY_FROM;
  const saucesToCount = SAUCE_ITEMS
    .filter((x) => (morning?.counts?.[sauceId(x.key)] || 0) > 0 || (formData.sauces[x.key] || 0) > 0 || typeof ledgerEntry?.sauceLeft?.[sauceId(x.key)] === 'number')
    .map((x) => ({ id: sauceId(x.key), label: x.label, unit: x.unit }));
  // Closing the day first sends the momos and sauces made (the production incharge's own entry).
  const saveMadeFirst = async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (madeTotal === 0) return confirm({ title: t('kd.noMomosTitle'), body: t('kd.noMomosBody'), confirmLabel: t('kd.closeAnyway') });
    return productionDirty ? handleSubmit() : true;
  };
  const setFinal = (m: typeof MOMO_TYPES[number], final: number) =>
    setFormData((prev) => ({ ...prev, [m.key]: { ...(prev as any)[m.key], final } } as typeof prev));
  const legacyFields = (m: typeof MOMO_TYPES[number]) => (m.group === 'kurkure' ? (['batter', 'coating'] as const) : (['dough', 'stuffing'] as const));

  const momoRows = (
    <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
      {MOMO_TYPES.map((m) => {
        const typeData = (formData as any)[m.key];
        const planned = plan ? plan[m.inventoryKey as keyof typeof plan] : null;
        const name = momoName(lang, m.inventoryKey, m.label);
        // (The ledger's day "wastage" is everything used, not waste, so it isn't shown here.)
        const sub = [planned ? t('stock.prod.plan', { n: formatCount(planned) }) : null, typeData.final > 0 ? bagsText(lang, typeData.final, m.inventoryKey) : null].filter(Boolean).join(' · ');
        if (batchTracking) {
          const isOpen = openType === m.key;
          return (
            <div key={m.key} className="flex flex-col">
              <ListRow
                title={name}
                subtitle={sub || undefined}
                trailing={<span className="num text-body-md font-semibold text-text">{formatCount(typeData.final || 0)}</span>}
                chevron="down"
                aria-expanded={isOpen}
                onClick={() => setOpenType(isOpen ? null : m.key)}
              />
              {isOpen && (
                <div className="border-t border-border bg-surface-2/60 px-4 py-3">
                  <BatchPiecesCard
                    momoType={m}
                    date={selectedDate}
                    batches={formData.batches?.[m.key] || []}
                    earlierBatchCodes={earlierBatchCodes[m.key] || []}
                    disabled={!canEdit}
                    onChange={(next: ProductionBatch[]) => setFormData((prev) => ({
                      ...prev,
                      batches: { ...(prev.batches || {}), [m.key]: next },
                      [m.key]: { ...(prev as any)[m.key], final: next.reduce((sum, b) => sum + (b.pieces || 0), 0) },
                    } as typeof prev))}
                  />
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={m.key} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-md font-medium text-text">{name}</span>
                {sub && <span className="text-label text-text-3">{sub}</span>}
              </span>
              <Input
                type="text"
                inputMode="numeric"
                value={String(typeData.final || 0)}
                onChange={(e) => setFinal(m, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 0)}
                disabled={!canEdit}
                aria-label={`${name} · ${t('stock.prod.finalPieces')}`}
                className="num w-24 text-right"
              />
            </div>
            {!ledgerTrackingLive && (
              <div className="grid grid-cols-2 gap-3">
                {legacyFields(m).map((field) => (
                  <Field key={field} label={`${field[0].toUpperCase()}${field.slice(1)} (kg)`}>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="num"
                      value={String(typeData[field] ?? 0)}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [m.key]: { ...(prev as any)[m.key], [field]: parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0 } } as typeof prev))}
                      disabled={!canEdit}
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const sauceRows = (
    <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
      {SAUCE_ITEMS.map((item) => (
        <ListRow
          key={item.key}
          density="compact"
          title={item.label}
          trailing={
            <DecimalInput
              className="num w-24 text-right"
              aria-label={`${item.label} (${item.unit === 'L' ? 'litres' : 'kg'})`}
              unit={item.unit}
              value={formData.sauces[item.key]}
              onChange={(n) => setFormData((f) => ({ ...f, sauces: { ...f.sauces, [item.key]: n } }))}
              disabled={!canEdit}
            />
          }
        />
      ))}
    </div>
  );

  // Step 3 of the production day: momos of each type and sauces made, sent for approval.
  const madeForm = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h4 className="mx-1 text-label font-semibold text-text-2">{t('stock.prod.momos')}</h4>
        {batchTracking && <p className="mx-1 text-caption text-text-3">{t('stock.prod.batchesNote')}</p>}
        {momoRows}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="mx-1 text-label font-semibold text-text-2">{t('stock.prod.sauces')}</h4>
        <p className="mx-1 text-caption text-text-3">{t('stock.prod.saucesHint')}</p>
        {sauceRows}
      </div>
      {canEdit && (productionDirty || !productionForDate) && (
        <Button variant="secondary" className="self-start" leadingIcon={<CheckSquare />} disabled={madeTotal === 0 && !productionForDate} onClick={() => setSendOpen(true)}>
          {productionForDate ? t('stock.prod.update') : t('stock.prod.send')}
        </Button>
      )}
      {productionForDate && !productionDirty && (
        <p className="text-caption text-text-3">
          {productionForDate.approvalStatus === 'approved' ? t('stock.prod.approvedBy', { name: productionForDate.approvedBy || '' }) : t('stock.prod.waiting')}
        </p>
      )}
    </div>
  );

  const entry = (
    <div className="flex flex-col gap-6">
      <DateStrip value={selectedDate} onChange={setSelectedDate} max={getTodayIST()} showMonthLabel />

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={dayLabel(lang, selectedDate)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h2 className="text-subtitle font-semibold text-text">{dayLabel(lang, selectedDate)}</h2>
            {productionForDate?.approvalStatus === 'pending' && <span className="text-label text-text-3">{t('stock.prod.waiting')}</span>}
            {productionForDate?.approvalStatus === 'approved' && <span className="text-label text-text-3">{t('stock.prod.approvedBy', { name: productionForDate.approvedBy || '' })}</span>}
          </div>
          {statusChip}
        </div>
        <p className="flex items-baseline gap-2">
          <span className="num text-display font-semibold text-text">{formatCount(madeTotal)}</span>
          <span className="text-body-sm text-text-2">
            {plannedTotal > 0 ? t('stock.prod.ofPlanned', { planned: formatCount(plannedTotal) }) : t('stock.prod.piecesMade')}
          </span>
        </p>
        {plannedTotal > 0 && (
          <Progress value={Math.min(100, (madeTotal / plannedTotal) * 100)} tone={madeTotal >= plannedTotal ? 'success' : 'primary'} aria-label={t('stock.prod.made', { made: formatCount(madeTotal), planned: formatCount(plannedTotal) })} />
        )}
        {plannedTotal > 0 && <span className="text-caption text-text-3">{t('stock.prod.planNote')}</span>}
      </section>

      {canApprove && productionForDate && productionForDate.approvalStatus === 'pending' && (
        <Callout tone="info" icon={CheckSquare} title={`Sent by ${productionForDate.createdBy} and waiting for you`} action={<Button size="sm" loading={approving} onClick={handleApprove}>Approve</Button>} />
      )}

      {!kitchenDay && (
        <section className="flex flex-col gap-2">
          <h3 className="overline-label mx-1">{t('stock.prod.momos')}</h3>
          {batchTracking && <p className="mx-1 text-label text-text-3">{t('stock.prod.batchesNote')}</p>}
          {momoRows}
        </section>
      )}

      {!resolvedProductionHouseId ? (
        <Callout tone="neutral" title={t('stock.prod.noHouse')} />
      ) : !ledgerTrackingLive ? (
        <Callout tone="warning" title={t('stock.prod.ledgerFrom', { date: PRODUCTION_LEDGER_GO_LIVE_DATE })} />
      ) : ledgerLoading ? (
        <SkeletonListRows count={3} leading="none" />
      ) : selectedDate >= KITCHEN_DAY_FROM ? (
        <div className="flex flex-col gap-3">
          <KitchenDay
            date={selectedDate} houseId={resolvedProductionHouseId} accessToken={context.user?.accessToken || ''}
            pools={ledgerPools as Record<string, api.ProductionLedgerPoolState>} morning={morning} lastCounted={lastCounted}
            plan={plan as Record<string, number> | null} pieces={piecesToday} perKg={dayContext?.perKg || {}}
            sauces={SAUCE_ITEMS} saucesMade={formData.sauces as Record<string, number>} sauceLeft={ledgerEntry?.sauceLeft || null}
            madeDone={!!productionForDate && !productionDirty && madeTotal > 0}
            closed={ledgerClosed} canEdit={canEditLedger} onWeighed={fetchLedger}
            makeForm={(
              <div className="flex flex-col gap-5">
                {canEditLedger && !ledgerClosed && (!!morning || ledgerClosed) && (
                  <PrepareLineItemForm
                    disabled={!canEditLedger} submitting={ledgerItemSubmitting} onAdd={handleAddLedgerItem}
                    leftoverKg={Object.fromEntries(Object.entries(ledgerPools || {}).map(([id, p]) => [id, (p as api.ProductionLedgerPoolState | undefined)?.opening || 0]))}
                    plan={plan as Record<string, number> | null} perKg={dayContext?.perKg}
                  />
                )}
                <PreparedLineItemsList items={ledgerItems} disabled={!canEditLedger || ledgerClosed} onDelete={handleDeleteLedgerItem} />
              </div>
            )}
            madeForm={madeForm}
            nightForm={(
              <EndOfDayCloseForm
                simple sauces={saucesToCount} savedSauceLeft={ledgerEntry?.sauceLeft || null} beforeSubmit={saveMadeFirst}
                pools={ledgerPools} isFirstEverDay={!ledgerHasAnyPriorRecord} closed={ledgerClosed} submitting={ledgerCloseSubmitting || submitting} dayContext={dayContext}
                savedReport={ledgerEntry?.leftoverReport || null} readOnly={!canEditLedger} disabled={!canEditLedger} expectedLeft={expectedLeft}
                closedBy={ledgerEntry?.closedAt ? `${ledgerEntry.closedByName ? `${ledgerEntry.closedByName}, ` : ''}${new Date(ledgerEntry.closedAt).toLocaleString(lang === 'en' ? 'en-IN' : lang, { timeZone: 'UTC', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : null}
                onSubmit={handleCloseLedgerDay}
              />
            )}
          />
          <CollapsibleCard title={t('stock.prod.otherWastage')} subtitle={t('stock.prod.otherWastageHint')} chip={wastageNotes.length ? <StatusChip tone="neutral">{wastageNotes.length}</StatusChip> : undefined}>
            <div className="p-4">
              <AdditionalWastageForm productionHouseId={resolvedProductionHouseId} date={selectedDate} disabled={!canEditLedger} notes={wastageNotes} onAdd={handleAddWastageNote} onDelete={handleDeleteWastageNote} />
            </div>
          </CollapsibleCard>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <CollapsibleCard title={t('stock.prod.shared')} subtitle={t('stock.prod.sharedHint')}>
            <div className="flex flex-col gap-5 p-4">
              <LedgerOpeningBalanceSummary pools={ledgerPools} />
              {canEditLedger && !ledgerClosed && (
                <LogSharedPoolForm disabled={!canEditLedger} submitting={ledgerItemSubmitting} onAdd={(poolKey, qty) => handleAddLedgerItem(poolKey, qty, 0)} />
              )}
            </div>
          </CollapsibleCard>
          <CollapsibleCard title={t('stock.prod.prepared')} subtitle={t('stock.prod.preparedHint')} chip={ledgerItems.length ? <StatusChip tone="neutral">{ledgerItems.length}</StatusChip> : undefined}>
            <div className="flex flex-col gap-5 p-4">
              {canEditLedger && !ledgerClosed && (
                <PrepareLineItemForm
                  disabled={!canEditLedger} submitting={ledgerItemSubmitting} onAdd={handleAddLedgerItem}
                  leftoverKg={Object.fromEntries(Object.entries(ledgerPools || {}).map(([id, p]) => [id, (p as api.ProductionLedgerPoolState | undefined)?.opening || 0]))}
                  plan={plan as Record<string, number> | null} perKg={dayContext?.perKg}
                />
              )}
              <PreparedLineItemsList items={ledgerItems} disabled={!canEditLedger || ledgerClosed} onDelete={handleDeleteLedgerItem} />
            </div>
          </CollapsibleCard>
          {(canEditLedger || isClusterHead) && (
            <CollapsibleCard title={t('stock.prod.leftover')} subtitle={t('stock.prod.leftoverHint')} chip={ledgerClosed ? <StatusChip status="task.done" /> : undefined}>
              <div className="p-4">
                <EndOfDayCloseForm
                  pools={ledgerPools} isFirstEverDay={!ledgerHasAnyPriorRecord} closed={ledgerClosed} submitting={ledgerCloseSubmitting} dayContext={dayContext}
                  savedReport={ledgerEntry?.leftoverReport || null} readOnly={!canEditLedger} disabled={!canEditLedger}
                  closedBy={ledgerEntry?.closedAt ? `${ledgerEntry.closedByName ? `${ledgerEntry.closedByName}, ` : ''}${new Date(ledgerEntry.closedAt).toLocaleString(lang === 'en' ? 'en-IN' : lang, { timeZone: 'UTC', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : null}
                  onSubmit={handleCloseLedgerDay}
                />
              </div>
            </CollapsibleCard>
          )}
          <CollapsibleCard title={t('stock.prod.otherWastage')} subtitle={t('stock.prod.otherWastageHint')} chip={wastageNotes.length ? <StatusChip tone="neutral">{wastageNotes.length}</StatusChip> : undefined}>
            <div className="p-4">
              <AdditionalWastageForm productionHouseId={resolvedProductionHouseId} date={selectedDate} disabled={!canEditLedger} notes={wastageNotes} onAdd={handleAddWastageNote} onDelete={handleDeleteWastageNote} />
            </div>
          </CollapsibleCard>
        </div>
      )}

      {!ledgerTrackingLive && (
        <CollapsibleCard title="Wastage (kg)" subtitle="Dough, stuffing, batter and coating">
          <div className="grid grid-cols-2 gap-3 p-4">
            {(['dough', 'stuffing', 'batter', 'coating'] as const).map((field) => (
              <Field key={field} label={`${field[0].toUpperCase()}${field.slice(1)} (kg)`}>
                <DecimalInput
                  className="num"
                  value={formData.wastage[field]}
                  onChange={(n) => setFormData((f) => ({ ...f, wastage: { ...f.wastage, [field]: n } }))}
                  disabled={!canEdit}
                />
              </Field>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {!kitchenDay && (
        <CollapsibleCard title={t('stock.prod.sauces')} subtitle={t('stock.prod.saucesHint')}>
          {sauceRows}
        </CollapsibleCard>
      )}

      <WeeklyGoalCard context={context} resolvedProductionHouseId={resolvedProductionHouseId} isClusterHead={isClusterHead} isOperationsManager={isOperationsManager} />

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

      {canEdit && !kitchenDay && (
        <StickyActions>
          <Button size="lg" className="flex-1" onClick={() => setSendOpen(true)}>{productionForDate ? t('stock.prod.update') : t('stock.prod.send')}</Button>
        </StickyActions>
      )}

      <ResponsiveModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={t('stock.prod.sheetTitle', { date: dayLabel(lang, selectedDate) })}
        description={t('stock.prod.sheetBody')}
        footer={<Button size="lg" className="flex-1" loading={submitting} onClick={() => handleSubmit()}>{productionForDate ? t('stock.prod.update') : t('stock.prod.send')}</Button>}
      >
        <div className="flex flex-col gap-5" lang={lang}>
          <ListGroup overline={t('stock.prod.momos')} footer={<span className="num">{t('stock.detail.totalPieces', { n: formatCount(madeTotal) })}{plannedTotal > 0 ? ` · ${t('stock.prod.plan', { n: formatCount(plannedTotal) })}` : ''}</span>}>
            {MOMO_TYPES.map((m) => (
              <ListRow
                key={m.key}
                density="compact"
                title={momoName(lang, m.inventoryKey, m.label)}
                subtitle={plan ? t('stock.prod.plan', { n: formatCount(plan[m.inventoryKey as keyof typeof plan] || 0) }) : undefined}
                trailing={<span className="num text-body-md font-semibold text-text">{formatCount((formData as any)[m.key]?.final || 0)}</span>}
              />
            ))}
          </ListGroup>
          {ledgerTrackingLive && canEditLedger && !ledgerClosed && <Callout tone="neutral" title={t('stock.prod.leftover')}>{t('stock.prod.leftoverHint')}</Callout>}
        </div>
      </ResponsiveModal>
    </div>
  );

  return (
    <StockPage lang={lang}>
      {onBack && !isProductionIncharge && (
        <Button variant="link" size="sm" className="self-start" leadingIcon={<ArrowLeft />} onClick={onBack}>{t('common.back')}</Button>
      )}
      {/* What the production checks found (owner, operations managers, the production incharge). */}
      <ProductionFlagsBanner enabled={isClusterHead || isOperationsManager || isProductionIncharge} accessToken={context.user?.accessToken} />
      {canViewApprovals && (
        <div className="flex items-center gap-3">
          <SegmentedControl
            aria-label="Production"
            className="flex-1"
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'entry' | 'approvals')}
            options={[
              { value: 'entry', label: t('shell.batches') },
              { value: 'approvals', label: pendingCount > 0 ? `Approvals · ${pendingCount}` : 'Approvals' },
            ]}
          />
          {isClusterHead && activeTab === 'approvals' && (
            <IconButton label={cleaning ? 'Cleaning up duplicates' : 'Clean up duplicate entries'} icon={<Eraser />} disabled={cleaning} onClick={handleCleanupDuplicates} />
          )}
        </div>
      )}
      {activeTab === 'approvals' && canViewApprovals ? <ProductionApprovals context={context} isPendingForViewer={isPendingForViewer} /> : entry}
    </StockPage>
  );
}
