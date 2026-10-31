// State, loading and actions of the stock requests screen: the store incharge's request, the
// production queue (accept, pack, ship) and the oversight views. The screen and its sections read
// everything from what this returns.
import { useState, useEffect, useMemo, useRef } from 'react';
import type * as React from 'react';
import { InventoryContextType } from '../../App';
import * as api from '../../utils/api';
import { toast } from '../ui/sonner';
import { confirm } from '../ui/confirm';
import { getSupabaseClient } from '../../utils/supabase/client';
import { getAssignedProductionHouseIds, getAssignedStoreIds, getDefaultStoreId } from '../../utils/entityAccess';
import { bagSize, roundUpToBags, isPhase1Live } from '../../utils/batches';
import { addDays, getNowIST, getTodayIST } from '../../utils/timezone';
import type { ForecastDay } from '../../utils/forecast';
import type { PlanRow } from '../../utils/requestPlan';
import { PLAN_KEYS, loadStorePlanData, planForStore } from '../../utils/requestPlanLoad';
import { planSupplies, type SupplyPick } from './supplyPlan';
import { listAlerts } from '../supplies/suppliesApi';
import { t } from '../../utils/i18n';
import { getAppLanguage } from '../../utils/appLanguage';
import { DispatchDraft, emptyDispatchDraft, buildDispatchInfo } from '../dispatch/ShipDialogBags';
import { getStockFilterRange, type StockFilterPreset } from './requestPeriods';
import type { QueueBucket } from './stockShared';
import { lastCount } from './countMath';
import { countHistory, storeWastageSince } from './countData';
import type { StoreBase } from './stockMath';
import { dayLabel, requestStatusWord } from './stockShared';

export interface StockRequestsProps {
  context: InventoryContextType;
  highlightRequestId?: string | null;
  /** A month-end count reminder was tapped (route tab=count): open the count once loaded. */
  openCount?: boolean;
  selectedStoreId?: string | null;
  onNavigateToManageItems?: () => void;
}

export function useStockRequests({ context, highlightRequestId, selectedStoreId, onNavigateToManageItems }: StockRequestsProps) {
  const [requests, setRequests] = useState<api.ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Production queue filter (To pack / Packed / Sent).
  const [queueFilter, setQueueFilter] = useState<QueueBucket>('toPack');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDuplicateDateConfirm, setShowDuplicateDateConfirm] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [chartTimeFilter, setChartTimeFilter] = useState<'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'>('today');
  const [showStockStatus, setShowStockStatus] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showMomoTypeStats, setShowMomoTypeStats] = useState(false);
  
  // Helper function to get local date string without timezone conversion
  const getLocalDateString = (date: Date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Matches the backend's default range (start of last month) - see production-requests GET route.
  const getDefaultLoadFrom = () => {
    const now = new Date();
    return getLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  };
  
  const [chartCustomRange, setChartCustomRange] = useState({
    from: getLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    to: getLocalDateString(),
  });
  // Tracks how far back the currently-loaded `requests` data reaches. The backend defaults
  // to "start of last month" so the page never loads the entire history of requests; this
  // gets pushed further back (and the data re-fetched) only when a filter actually needs it.
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [loadingOlderData, setLoadingOlderData] = useState(false);
  const [salesData, setSalesData] = useState<any[]>([]);
  
  // Form state for new request - DYNAMIC for all finished products
  const [momoQuantities, setMomoQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  // Tomorrow: each day's request is sent the night before, by midnight (owner, 29 Oct 2026). A day
  // that began with no request takes it until noon, as Home shows it late: on 30 Oct Rohan sent
  // that day's request at 3:10 AM and the screen had put it down for the next day.
  const getDefaultRequestDate = (list: api.ProductionRequest[] = requests) => {
    const today = getTodayIST();
    const morning = Number(getNowIST().slice(11, 13)) < 12;
    const sent = list.some((r) => r.storeId === context.user?.storeId && r.requestDate === today);
    return morning && !sent ? today : addDays(today, 1);
  };
  const [requestDate, setRequestDateState] = useState(() => getDefaultRequestDate([]));
  const dateTouched = useRef(false);
  const setRequestDate = (date: string) => { dateTouched.current = true; setRequestDateState(date); };
  useEffect(() => {
    if (!loading && !dateTouched.current) setRequestDateState(getDefaultRequestDate(requests));
  }, [loading, requests]);
  const [lastReminderDate, setLastReminderDate] = useState<string | null>(null);

  // Kitchen Utilities state (item -> {quantity, unit})
  const [kitchenUtilities, setKitchenUtilities] = useState<Record<string, { quantity: number; unit: string }>>({});
  
  // Sauces state (sauce name -> boolean)
  const [sauces, setSauces] = useState<Record<string, boolean>>({});
  
  // Utilities state (utility name -> quantity)
  const [utilities, setUtilities] = useState<Record<string, number>>({});

  // Kitchen Utilities and Sauces start open - real request history shows these are filled
  // in on nearly every submission, so collapsing them by default risked the store incharge
  // forgetting to check them (flagged directly during review). Utilities (KOT Roll etc.)
  // stays collapsed since it's genuinely used far less often.
  const [showKitchenUtilities, setShowKitchenUtilities] = useState(true);
  const [showSauces, setShowSauces] = useState(true);
  const [showUtilitiesSection, setShowUtilitiesSection] = useState(false);

  // Which "Recent Requests" card is open in the detail popup (null = closed).
  const [selectedRecentRequest, setSelectedRecentRequest] = useState<api.ProductionRequest | null>(null);

  // Review-before-submit popup - shows the date + full summary and requires a checked
  // confirmation before the request actually goes out, so a tired end-of-day submission
  // gets one last look instead of firing on the first tap.
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitConfirmChecked, setSubmitConfirmChecked] = useState(false);

  // Store incharges already have Recent Requests + the repeat-last-request shortcut for
  // their day-to-day need; the full workflow summary and complete per-date history below
  // are collapsed behind this toggle for them (still expanded by default for production
  // head/ops head/cluster head, who actually rely on it for oversight).
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<StockFilterPreset>('thisMonth');
  const [historyCustomRange, setHistoryCustomRange] = useState({ from: '', to: '' });

  // Expanded dates state (date -> boolean)
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  
  // Store recalibration modal state
  const [showStoreRecalibration, setShowStoreRecalibration] = useState(false);
  // The production house's month-end count (owner, 31 Oct 2026: from the stock jobs, like the store's).
  const [showHouseRecalibration, setShowHouseRecalibration] = useState(false);
  
  // Each store in scope: its last stock count that wasn't rejected and the wastage logged since
  // (stock/countMath.ts). null while loading.
  const [storeBases, setStoreBases] = useState<StoreBase[] | null>(null);
  
  // Stock alert thresholds state - DYNAMIC
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [stockThresholds, setStockThresholds] = useState<Record<string, { high: number; medium: number; low: number }>>({});

  // Manual POS sync trigger state - lets the store incharge/cluster head force tonight's
  // sync early instead of waiting for the 10:30 PM cron (mirrors SalesView.tsx's button).
  const [isSyncingPos, setIsSyncingPos] = useState(false);

  // Shipping dialog state
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [shippingRequest, setShippingRequest] = useState<api.ProductionRequest | null>(null);
  const [shippedQuantities, setShippedQuantities] = useState<Record<string, number>>({});
  const [shippedSauces, setShippedSauces] = useState<Record<string, boolean>>({});
  const [shippingNotes, setShippingNotes] = useState<Record<string, string>>({});
  const [shippingResponsibility, setShippingResponsibility] = useState(false);
  const [dispatchDraft, setDispatchDraft] = useState<DispatchDraft>(() => emptyDispatchDraft(''));
  // Dispatch slip shown after shipping (and from a request card); the store's receive dialog.
  const [slipRequest, setSlipRequest] = useState<api.ProductionRequest | null>(null);
  const [receivingRequest, setReceivingRequest] = useState<api.ProductionRequest | null>(null);

  // Plate Conversion Settings - Shared with Production Analytics
  const [momosPerPlate, setMomosPerPlate] = useState<number>(() => {
    const saved = localStorage.getItem('momosPerPlate');
    return saved ? parseInt(saved, 10) : 6; // Default 6 momos per plate
  });
  const [showPlateConfigModal, setShowPlateConfigModal] = useState(false);
  const [showRecalibrationReports, setShowRecalibrationReports] = useState(false);
  const [showStockWastageModal, setShowStockWastageModal] = useState(false);

  // Kitchen Utilities list with specific units
  const kitchenUtilityItems = [
    { name: 'Chaat Masala', unit: 'pkt' },
    { name: 'Peri-Peri Masala', unit: 'pkt' },
    { name: 'Black Salt', unit: 'pkt' },
    { name: 'Butter', unit: 'pkt' },
    { name: 'Burger', unit: 'pkt' },
    { name: 'Oil', unit: 'litre' },
    { name: 'Capsicum', unit: 'pieces' },
    { name: 'Onion', unit: 'piece' },
    { name: 'Fresh Cream', unit: 'pkt' },
    { name: 'Liquid Cheese', unit: 'pkt' },
    { name: 'Milk', unit: 'pkt' },
    { name: 'Lemon', unit: 'pieces' },
    { name: 'Coriander', unit: 'bundle' },
    { name: 'Tandoori Masala', unit: 'pkt' },
    { name: 'Sesame Seeds (Til)', unit: 'pkt' },
    { name: 'Chilli Flakes', unit: 'pkt' },
    { name: 'Tomato Ketchup', unit: 'pkt' },
    { name: 'Coke', unit: 'cartons' }
  ];

  // Sauces list
  const sauceItems = [
    'Pan-Fried Sauce', 'Butter Makhani Sauce', 'Chilli Chicken Sauce',
    'Korean Sauce', 'Red Sauce', 'Green Sauce', 'Soup Premix', 'Tandoori Sauce',
    'Jhol Momo Gravy', 'Hot Garlic Sauce'
  ];

  // Utilities list
  const utilityItems = ['KOT Roll', 'Parcel Box', 'Table Box', 'Zomato Tape'];

  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isProductionHead = context.user?.designation === 'production_incharge';
  // Was previously `role === 'manager'` with no designation check, which meant a store
  // incharge or production head account (both role: 'manager' with a specialized
  // designation) was incorrectly treated as "operations head" everywhere in this file -
  // e.g. it made "Stock Requests by Momo Type" visible to everyone instead of just the
  // true operations/cluster-head oversight roles. Narrowed to match the equivalent check
  // in App.tsx (isOperationsManager).
  const isOperationsHead = context.user?.role === 'manager' && context.user?.designation !== 'store_incharge' && context.user?.designation !== 'production_incharge';
  const isClusterHead = context.user?.role === 'cluster_head';
  // Workflow summary (status counts + date/status filters) - useful to anyone who
  // actually uses this page, including the store incharge checking their own request's
  // live status, not just cross-store oversight roles.
  const canViewWorkflowSummary = isOperationsHead || isClusterHead || isProductionHead || isStoreIncharge;
  // "Stock Requests by Momo Type" is a cross-store oversight report - kept to operations
  // head and cluster head only, per explicit product decision (not store/production
  // incharge, who each only need their own store's/queue's requests).
  const canViewMomoTypeReport = isOperationsHead || isClusterHead;

  const selectedConcreteStoreId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : null;
  const defaultStoreId = useMemo(() => getDefaultStoreId(context.user, context.stores || []), [context.user, context.stores]);

  // Production incharge users can have `user.storeId` set to a production-house id. Resolve
  // their actual store scope through assignedStoreIds/assignedProductionHouseIds before any
  // store-stock filtering, otherwise the status panel filters every row out for them.
  const scopedStoreIds = useMemo<string[] | null>(() => {
    if (selectedConcreteStoreId) return [selectedConcreteStoreId];
    if (!context.user) return [];

    if (isClusterHead) return null;

    if (isStoreIncharge || isProductionHead || isOperationsHead) {
      const assigned = getAssignedStoreIds(context.user, context.stores || []);
      return assigned.length > 0 ? assigned : [];
    }

    return null;
  }, [selectedConcreteStoreId, context.user, context.stores, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead]);

  const singleScopedStoreId = scopedStoreIds && scopedStoreIds.length === 1 ? scopedStoreIds[0] : null;
  const scopedStoreIdSet = useMemo(() => scopedStoreIds ? new Set(scopedStoreIds) : null, [scopedStoreIds]);
  const storeScopeKey = scopedStoreIds === null ? 'all' : scopedStoreIds.join('|');
  const matchesStoreScope = (storeId?: string | null) => !scopedStoreIdSet || (!!storeId && scopedStoreIdSet.has(storeId));
  // Event stall requests (events.ts) carry the event as their storeId, so no store scope matches
  // them: the production side of the event's production house sees and ships them (operations
  // and the owner see all; a store filter shows that store's events). Store incharges don't.
  const myHouseIds = useMemo(() => getAssignedProductionHouseIds(context.user, context.productionHouses || []), [context.user, context.productionHouses]);
  const matchesRequestScope = (req: { storeId?: string | null; eventId?: string; productionHouseId?: string; parentStoreId?: string }) => {
    if (!req.eventId) return matchesStoreScope(req.storeId);
    if (selectedConcreteStoreId) return req.parentStoreId === selectedConcreteStoreId;
    if (isClusterHead || isOperationsHead) return true;
    return isProductionHead && (myHouseIds.length === 0 || (!!req.productionHouseId && myHouseIds.includes(req.productionHouseId)));
  };

  // Name of the store this view is scoped to, shown in the header so it's clear at a
  // glance whose stock requests you're looking at.
  const storeDisplayName = useMemo(() => {
    if (singleScopedStoreId) {
      return context.stores?.find(s => s.id === singleScopedStoreId)?.name || null;
    }
    if (scopedStoreIds && scopedStoreIds.length > 1) return `${scopedStoreIds.length} Assigned Stores`;
    if (selectedStoreId === 'all' || scopedStoreIds === null) return 'All Stores';
    return null;
  }, [singleScopedStoreId, scopedStoreIds, selectedStoreId, context.stores]);

  // Get dynamic finished products from inventory items
  const finishedProducts = useMemo(() => {
    return (context.inventoryItems?.filter(item => 
      item.category === 'finished_product' && item.isActive
    ) || []).map(item => {
      // Legacy mapping for old sales data (hardcoded names with 's' at end)
      const legacySalesKey = item.displayName.endsWith('Momo') 
        ? item.displayName + 's' 
        : item.displayName;
      
      return {
        key: item.name, // snake_case key for backend
        camelKey: item.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase()), // camelCase for frontend
        label: item.displayName,
        legacySalesKey, // For matching old sales data
        unit: item.unit
      };
    });
  }, [context.inventoryItems]);

  // Store incharge's own requests, most recent first - backs the "Repeat last request"
  // shortcut and the "Recent Requests" strip. Reads a field defensively under both the
  // current camelKey format (e.g. "chicken") and the legacy "camelKeys" format (e.g.
  // "chickens") some older requests were saved under.
  const myStoreRequests = useMemo(() => {
    if (!isStoreIncharge) return [];
    const sid = selectedConcreteStoreId || defaultStoreId;
    if (!sid) return [];
    return requests
      .filter(r => r.storeId === sid)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [isStoreIncharge, selectedConcreteStoreId, defaultStoreId, requests]);

  const lastRequest = myStoreRequests[0] || null;

  const getRequestedQty = (req: any, camelKey: string) => (req[camelKey] ?? req[camelKey + 's']) || 0;

  // Rough "have X" estimate for the quantity cards - last delivered/partially-delivered
  // amount (shipped quantity if recorded, else what was requested) minus a rough recent
  // daily-sales draw-down. This mirrors the lightweight estimate used elsewhere in the app
  // (Store Stock Status uses a more precise opening-balance calculation); this one is
  // intentionally simpler since it's just an at-a-glance hint next to the input, not the
  // authoritative stock figure.
  const currentStockEstimate = useMemo(() => {
    const stock: Record<string, number> = {};
    if (!isStoreIncharge) return stock;
    const sid = selectedConcreteStoreId || defaultStoreId;
    if (!sid) return stock;

    // Only the most recent delivery, not a sum across every delivery ever made - summing
    // the full history meant the estimate only ever climbed and was never drawn back down
    // by consumption, producing nonsense numbers in the thousands.
    const lastDelivered = myStoreRequests.find(r => r.status === 'delivered' || r.status === 'partially-delivered');

    const storeSales = (context.salesData || []).filter((s: any) => s.storeId === sid);
    const avgPerType = storeSales.length > 0 ? Math.floor(storeSales.length / 7) : 0;

    finishedProducts.forEach(({ camelKey }) => {
      if (!lastDelivered) {
        stock[camelKey] = 0;
        return;
      }
      const shipped = (lastDelivered as any).shippedQuantities?.[camelKey];
      const base = shipped !== undefined ? shipped : getRequestedQty(lastDelivered, camelKey);
      stock[camelKey] = Math.max(0, base - avgPerType);
    });
    return stock;
  }, [isStoreIncharge, selectedConcreteStoreId, defaultStoreId, myStoreRequests, finishedProducts, context.salesData]);

  // Bunny's fill (owner, 30 Oct 2026). Momos: what the store still has (the last deliveries, oldest
  // first, less sales and wastage, nothing past 4 days) against the forecast, in bags of 50
  // (utils/requestPlan.ts). Sauces, kitchen supplies and boxes: how often each is asked for, and
  // the running-low flags (supplyPlan.ts). Supplies are added to what's picked, never taken off.
  const [suggestion, setSuggestion] = useState<{ day: ForecastDay; rows: PlanRow[]; supplies: SupplyPick[] } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const handleSuggest = async () => {
    const sid = selectedConcreteStoreId || defaultStoreId;
    const token = context.user?.accessToken;
    if (!token || !sid) return;
    setSuggesting(true);
    try {
      const [store] = await loadStorePlanData(token, [sid], { items: context.inventoryItems });
      const day = store.overview.forecast.find((f) => f.date === requestDate);
      if (!day) {
        toast.error(t('stock.req.forecastRange'));
        return;
      }
      const [plan] = planForStore(store, requestDate, requestDate, false);
      const rows = PLAN_KEYS.map((k) => plan.rows[k]).filter(Boolean);
      const revenue: Record<string, number> = {};
      for (const f of store.overview.forecast) revenue[f.date] = f.revenue;
      for (const h of store.overview.history) if (h.revenue) revenue[h.date] = h.revenue;
      const alerts = await listAlerts()
        .then((r) => r.alerts
          .filter((a) => a.placeKind === 'store' && a.placeId === sid && (a.status === 'open' || a.status === 'listed'))
          .map((a) => ({ item: a.item, level: a.level, qty: a.qty, unit: a.unit, by: a.raisedBy[a.raisedBy.length - 1]?.name })))
        .catch(() => []);
      const supplies = planSupplies({
        requestDate, requests: myStoreRequests, revenue, alerts,
        catalog: { sauces: sauceItems, kitchen: kitchenUtilityItems, utilities: utilityItems },
      });
      const known = new Set(finishedProducts.map((p) => p.camelKey));
      setMomoQuantities((prev) => {
        const next = { ...prev };
        for (const r of rows) if (known.has(r.key)) next[r.key] = r.pieces;
        return next;
      });
      const of = (section: SupplyPick['section']) => supplies.filter((p) => p.section === section);
      if (of('sauce').length) {
        setSauces((prev) => ({ ...prev, ...Object.fromEntries(of('sauce').map((p) => [p.name, true])) }));
        setShowSauces(true);
      }
      if (of('kitchen').length) {
        setKitchenUtilities((prev) => {
          const next = { ...prev };
          for (const p of of('kitchen')) if (!next[p.name]) next[p.name] = { quantity: p.quantity, unit: p.unit || '' };
          return next;
        });
        setShowKitchenUtilities(true);
      }
      if (of('utility').length) {
        setUtilities((prev) => {
          const next = { ...prev };
          for (const p of of('utility')) if (!next[p.name]) next[p.name] = p.quantity;
          return next;
        });
        setShowUtilitiesSection(true);
      }
      setSuggestion({ day, rows, supplies });
      toast.success(t('stock.req.filledToast'));
    } catch (e: any) {
      toast.error(e?.message || t('stock.req.forecastFailed'));
    } finally {
      setSuggesting(false);
    }
  };

  const handleRepeatLastRequest = () => {
    if (!lastRequest) return;
    const newQuantities: Record<string, number> = {};
    let rounded = false;
    const wholeBags = isPhase1Live(requestDate);
    finishedProducts.forEach(({ camelKey }) => {
      const qty = getRequestedQty(lastRequest, camelKey);
      newQuantities[camelKey] = wholeBags ? roundUpToBags(qty, camelKey) : qty;
      if (newQuantities[camelKey] !== qty) rounded = true;
    });
    setMomoQuantities(newQuantities);
    if (rounded) toast.info(t('stock.req.roundedCopy'));
    setKitchenUtilities(lastRequest.kitchenUtilities || {});
    setSauces(lastRequest.sauces || {});
    setUtilities(lastRequest.utilities || {});
    if ((lastRequest.kitchenUtilities && Object.keys(lastRequest.kitchenUtilities).length > 0)) setShowKitchenUtilities(true);
    if ((lastRequest.sauces && Object.keys(lastRequest.sauces).length > 0)) setShowSauces(true);
    if ((lastRequest.utilities && Object.keys(lastRequest.utilities).length > 0)) setShowUtilitiesSection(true);
  };

  // Helper function to get fresh access token
  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      // The signed-in session's token (requests use the current token anyway - see utils/http.ts).
      return session?.access_token || context.user?.accessToken || null;
    } catch (error) {
      console.error('Error getting fresh token:', error);
      return null;
    }
  };

  // Debug logging
  useEffect(() => {
    console.log('ProductionRequests - User Info:', {
      role: context.user?.role,
      designation: context.user?.designation,
      isStoreIncharge,
      isProductionHead,
      isOperationsHead,
      isClusterHead,
      canViewWorkflowSummary,
      canViewMomoTypeReport
    });
  }, [context.user, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewWorkflowSummary, canViewMomoTypeReport]);

  useEffect(() => {
    loadRequests();
    loadSalesData();
    loadStockThresholds();
  }, [context.user, selectedStoreId, storeScopeKey, singleScopedStoreId]);

  // Spin up (fetch) older history on demand: only when a selected filter actually reaches
  // further back than what's currently loaded, not on every render.
  useEffect(() => {
    if (!hasLoadedOnce) return;

    let neededFrom: string | null = null;

    if (filterDate) {
      neededFrom = filterDate;
    }

    if (chartTimeFilter === 'lastMonth') {
      // Comparison stats look one further month back (month-before-last)
      const now = new Date();
      neededFrom = getLocalDateString(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    } else if (chartTimeFilter === 'custom') {
      const customStart = new Date(chartCustomRange.from);
      const customEnd = new Date(chartCustomRange.to);
      const daysDiff = Math.max(0, Math.ceil((customEnd.getTime() - customStart.getTime()) / (1000 * 60 * 60 * 24)));
      const comparisonStart = new Date(customStart);
      comparisonStart.setDate(customStart.getDate() - daysDiff - 1);
      const customNeededFrom = getLocalDateString(comparisonStart);
      neededFrom = neededFrom && neededFrom < customNeededFrom ? neededFrom : customNeededFrom;
    }

    if (neededFrom) {
      ensureFromLoaded(neededFrom);
    }
  }, [filterDate, chartTimeFilter, chartCustomRange.from, chartCustomRange.to, hasLoadedOnce]);

  // Load opening balance after salesData is loaded
  useEffect(() => {
    if (salesData.length >= 0 && context.inventoryItems && context.inventoryItems.length > 0) {
      setStoreBases(null);
      loadStoreOpeningBalance();
    }
  }, [salesData, context.user, selectedStoreId, storeScopeKey, singleScopedStoreId, context.stores, context.inventoryItems]);

  // Daily 3 PM reminder to submit stock request
  useEffect(() => {
    // Only run for store in-charges
    if (!isStoreIncharge || !context.user?.storeId) return;

    const checkAndNotify = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const today = now.toISOString().split('T')[0];
      
      // Check if it's 3:00 PM (15:00) and we haven't sent a reminder today
      if (currentHour === 15 && currentMinute === 0 && lastReminderDate !== today) {
        // Calculate tomorrow's date
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().split('T')[0];
        
        // Check if user has already submitted a request for tomorrow
        const hasTomorrowRequest = requests.some(req =>
          req.storeId === context.user?.storeId &&
          req.requestDate === tomorrowDate
        );
        
        if (!hasTomorrowRequest) {
          console.log('📅 3 PM Reminder: No stock request found for tomorrow');
          toast.warning(t('stock.req.reminderTitle'), {
            duration: 10000,
            description: t('stock.req.reminderBody'),
          });
          
          // Update last reminder date
          setLastReminderDate(today);
        }
      }
    };

    // Check immediately
    checkAndNotify();

    // Then check every minute
    const interval = setInterval(checkAndNotify, 60000);

    return () => clearInterval(interval);
  }, [isStoreIncharge, context.user, requests, lastReminderDate]);

  // Periodic check for pending requests > 12 hours (only for authorized roles)
  useEffect(() => {
    // Only run for Cluster Heads, Production Incharge, and Operations Manager
    if (!isClusterHead && !isProductionHead && !isOperationsHead) return;

    const checkPendingRequests = async () => {
      try {
        const accessToken = await getFreshAccessToken();
        if (!accessToken) return;

        const result = await api.checkPendingProductionRequests(accessToken);
        
        if (result.notificationsSent > 0) {
          console.log(`🚨 Sent ${result.notificationsSent} notifications for ${result.newPendingCount} delayed pending requests`);
        }
      } catch (error) {
        // Silently fail - this is a background task
        console.log('Background pending request check failed:', error);
      }
    };

    // Check immediately on mount
    checkPendingRequests();

    // Then check every 30 minutes
    const interval = setInterval(checkPendingRequests, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isClusterHead, isProductionHead, isOperationsHead]);

  const loadStockThresholds = async () => {
    if (!context.user) return;
    
    try {
      const effectiveStoreId = singleScopedStoreId;
      if (!effectiveStoreId) {
        setStockThresholds({});
        return;
      }
      
      const accessToken = await getFreshAccessToken();
      if (!accessToken) return;
      
      const saved = await api.getStockThresholds(accessToken, effectiveStoreId);
      setStockThresholds(saved || {});
    } catch (error) {
      console.log('No saved thresholds, using defaults');
      setStockThresholds({});
    }
  };

  const loadRequests = async (fromOverride?: string) => {
    if (!context.user) return;

    try {
      // Only show the full-page spinner on the very first load. Subsequent
      // refreshes (after accepting/shipping/etc.) update the list in place so
      // the page doesn't collapse and reset the user's scroll position.
      if (!hasLoadedOnce) {
        setLoading(true);
      }
      // Get fresh access token
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        console.error('No valid access token available');
        return;
      }

      // Reuse whatever range is already loaded on plain refreshes (after accepting/shipping/etc.)
      // so those don't silently shrink a window a filter previously extended further back.
      // Mirrors the backend's own default (start of last month) on the very first load.
      const effectiveFrom = fromOverride ?? loadedFrom ?? getDefaultLoadFrom();
      const data = await api.fetchProductionRequests(accessToken, effectiveFrom);
      setLoadedFrom(effectiveFrom);

      // Filter requests based on role and selected store
      let filteredRequests = data;
      
      if (scopedStoreIds !== null) {
        filteredRequests = data.filter(req => matchesRequestScope(req as any));
      }
      // Cluster heads see all requests when no store is selected. Production incharges use
      // the stores supplied by their assigned production house(s).
      
      console.log('Production Requests loaded:', {
        totalRequests: data.length,
        filteredRequests: filteredRequests.length,
        userRole: context.user.role,
        userDesignation: context.user.designation
      });
      
      setRequests(filteredRequests);
      setLoadError(null);
    } catch (error: any) {
      console.error('Error loading production requests:', error);
      setLoadError(error?.message || t('error.body'));
      toast.error(t('stock.queue.loadFailed'));
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  // Extends the loaded window backward (re-fetching) only when a filter actually needs
  // history older than what's already in memory - e.g. picking a Custom range that reaches
  // further back than "last month". Never shrinks the window back down once extended.
  const ensureFromLoaded = async (neededFrom: string) => {
    if (loadedFrom && neededFrom >= loadedFrom) return;
    setLoadingOlderData(true);
    try {
      await loadRequests(neededFrom);
    } finally {
      setLoadingOlderData(false);
    }
  };

  const loadSalesData = async () => {
    if (!context.user) return;
    
    try {
      // Get fresh access token
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        console.error('No valid access token available');
        return;
      }
      
      const response = await api.getSalesData(accessToken);
      let records = response.data || [];
      
      // Filter by resolved store scope if needed
      if (scopedStoreIds !== null) {
        records = records.filter((r: any) => matchesStoreScope(r?.storeId));
      }
      
      setSalesData(records);
    } catch (error) {
      console.error('Error loading sales data:', error);
    }
  };

  const handleSyncPosNow = async () => {
    const accessToken = await getFreshAccessToken();
    if (!accessToken) return;
    setIsSyncingPos(true);
    try {
      const result = await api.triggerPosSync(accessToken);
      if (result?.success) {
        await Promise.all([loadRequests(), loadSalesData(), loadStoreOpeningBalance()]);
        toast.success('POS sync complete');
      } else {
        toast.error(result?.error || 'POS sync ran but reported an error - check the results');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to trigger POS sync');
    } finally {
      setIsSyncingPos(false);
    }
  };

  // What "On hand" starts from for each store in scope: its last stock count that wasn't rejected
  // (at any date - the old opening balance only looked at counts up to the 1st and dropped
  // every month in between) and the wastage logged since.
  const loadStoreOpeningBalance = async () => {
    const token = context.user?.accessToken;
    if (!token) return;
    const storeIds = singleScopedStoreId
      ? [singleScopedStoreId]
      : (context.stores || []).filter(store => scopedStoreIds === null || scopedStoreIds.includes(store.id)).map(store => store.id);
    try {
      const bases = await Promise.all(storeIds.map(async (storeId) => {
        const base = lastCount(await countHistory(token, [storeId], 'store'), context.inventoryItems || []);
        const wastage = await storeWastageSince(token, storeId, base).catch(() => []);
        return { storeId, base, wastage };
      }));
      setStoreBases(bases);
    } catch (error) {
      // No figures rather than figures from the wrong starting point.
      console.error('Error loading the last stock counts:', error);
      setStoreBases([]);
    }
  };

  const handleSubmitRequest = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // Prevent duplicate submissions
    if (submitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate request');
      return;
    }
    
    console.log('🚀 handleSubmitRequest called');
    console.log('  User info:', {
      hasAccessToken: !!context.user?.accessToken,
      hasEmployeeId: !!context.user?.employeeId,
      hasStoreId: !!context.user?.storeId,
      user: context.user
    });
    console.log('  Form data:', {
      momoQuantities,
      totalQuantity: Object.values(momoQuantities).reduce((sum, qty) => sum + qty, 0),
      requestDate,
      notes
    });
    
    if (!context.user?.accessToken || !context.user?.employeeId || !context.user?.storeId) {
      console.error('❌ Missing user information:', {
        hasAccessToken: !!context.user?.accessToken,
        hasEmployeeId: !!context.user?.employeeId,
        hasStoreId: !!context.user?.storeId,
        user: context.user
      });
      toast.error(t('stock.req.noStore'));
      return;
    }

    const totalQuantity = Object.values(momoQuantities).reduce((sum, qty) => sum + qty, 0);

    // Requests go out in whole bags of 50 (from Phase 1 go-live).
    const notWholeBags = isPhase1Live(requestDate)
      ? Object.entries(momoQuantities).filter(([key, qty]) => qty > 0 && qty % bagSize(key) !== 0)
      : [];
    if (notWholeBags.length > 0) {
      setMomoQuantities((prev) => {
        const next = { ...prev };
        notWholeBags.forEach(([key, qty]) => { next[key] = roundUpToBags(qty, key); });
        return next;
      });
      toast.error(t('stock.req.rounded'));
      return;
    }
    
    if (totalQuantity === 0) {
      console.log('❌ No quantities specified');
      toast.error(t('stock.req.addSomething'));
      return;
    }

    // Time restriction removed - requests can be submitted anytime
    console.log('📝 Submitting request for date:', requestDate);

    // Show the review-before-submit popup instead of submitting straight away - the
    // duplicate-date check and actual submission happen once the store incharge confirms.
    setSubmitConfirmChecked(false);
    setShowSubmitConfirm(true);
  };

  const handleConfirmAndSubmit = async () => {
    setShowSubmitConfirm(false);

    // Warn if this store already has a request for the same date
    const existingSameDateRequest = requests.some(
      (req) => req.storeId === context.user?.storeId && req.requestDate === requestDate
    );
    if (existingSameDateRequest) {
      const date = dayLabel(getAppLanguage(), requestDate);
      const ok = await confirm({
        title: t('stock.req.duplicateTitle', { date }),
        body: t('stock.req.duplicateBody'),
        confirmLabel: t('stock.req.duplicateConfirm'),
      });
      if (!ok) return;
    }

    await performSubmitRequest();
  };

  const performSubmitRequest = async () => {
    if (!context.user?.accessToken || !context.user?.employeeId || !context.user?.storeId) return;

    try {
      setSubmitting(true);
      console.log('✅ Validation passed, submitting request...');

      // Backend will automatically fetch and populate storeName from storeId
      // Spread dynamic momo quantities into the request
      await api.createProductionRequest(context.user.accessToken, {
        requestDate,
        storeId: context.user.storeId,
        storeName: undefined, // Let backend populate this
        requestedBy: context.user.employeeId,
        requestedByName: context.user.name || context.user.email,
        ...momoQuantities, // Spread all dynamic momo quantities
        kitchenUtilities: Object.keys(kitchenUtilities).length > 0 ? kitchenUtilities : undefined,
        sauces: Object.keys(sauces).length > 0 ? sauces : undefined,
        utilities: Object.keys(utilities).length > 0 ? utilities : undefined,
        notes,
      } as Omit<api.ProductionRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>);

      console.log('✅ Request submitted successfully');
      toast.success(t('stock.req.sentToast'));

      // Reset form
      setMomoQuantities({});
      setKitchenUtilities({});
      setSauces({});
      setUtilities({});
      setNotes('');
      dateTouched.current = false; // the reload below moves the screen on to the next day due

      // Reload requests
      await loadRequests();
    } catch (error: any) {
      console.error('❌ Error submitting production request:', error);
      toast.error(error.message || t('stock.req.sendFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (requestId: string, newStatus: api.ProductionRequest['status']) => {
    if (!context.user?.accessToken || !context.user?.employeeId) return;
    if (updatingRequestId) return; // already processing a click somewhere, avoid double-submits

    setUpdatingRequestId(requestId);
    try {
      await api.updateProductionRequestStatus(
        context.user.accessToken,
        requestId,
        newStatus,
        context.user.employeeId
      );

      toast.success(t('stock.queue.statusSaved', { status: requestStatusWord(getAppLanguage(), newStatus) }));
      await loadRequests();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(t('stock.queue.statusFailed'));
    } finally {
      setUpdatingRequestId(null);
    }
  };

  const openShippingDialog = (request: api.ProductionRequest) => {
    setShippingRequest(request);
    
    // Initialize shipped quantities with requested quantities
    const initialQuantities: Record<string, number> = {};

    // Add momos — use the same dynamic finished-product list (from configured
    // inventory items) that the request form and request card use, instead of
    // a hardcoded field list, so newly added/renamed momo types aren't missed.
    finishedProducts.forEach(({ camelKey }) => {
      const qty = (request as any)[camelKey];
      if (qty > 0) {
        initialQuantities[camelKey] = qty;
      }
    });

    // Add kitchen utilities
    if (request.kitchenUtilities) {
      Object.entries(request.kitchenUtilities).forEach(([name, data]) => {
        initialQuantities[`kitchenUtility_${name}`] = data.quantity;
      });
    }
    
    // Add utilities
    if (request.utilities) {
      Object.entries(request.utilities).forEach(([name, qty]) => {
        initialQuantities[`utility_${name}`] = qty;
      });
    }

    // Sauces default to "shipped" (checked) unless the production head unchecks them
    const initialSauces: Record<string, boolean> = {};
    if (request.sauces) {
      Object.keys(request.sauces).forEach(name => {
        initialSauces[name] = true;
      });
    }

    setShippedQuantities(initialQuantities);
    setShippedSauces(initialSauces);
    setShippingNotes({});
    setShippingResponsibility(false);
    setDispatchDraft(emptyDispatchDraft(context.user?.name || ''));
    setShowShippingDialog(true);
  };

  const handleShipRequest = async () => {
    if (!context.user?.accessToken || !context.user?.employeeId || !shippingRequest) return;
    
    // Validate responsibility checkbox
    if (!shippingResponsibility) {
      toast.error(t('stock.ship.confirmFirst'));
      return;
    }
    
    // Check if quantities differ and notes are required
    const missingNotes: string[] = [];
    Object.entries(shippedQuantities).forEach(([key, shippedQty]) => {
      // Get requested quantity
      let requestedQty = 0;
      if (key.startsWith('kitchenUtility_')) {
        const utilityName = key.replace('kitchenUtility_', '');
        requestedQty = shippingRequest.kitchenUtilities?.[utilityName]?.quantity || 0;
      } else if (key.startsWith('utility_')) {
        const utilityName = key.replace('utility_', '');
        requestedQty = shippingRequest.utilities?.[utilityName] || 0;
      } else {
        requestedQty = (shippingRequest as any)[key] || 0;
      }
      
      // Check if sauce (sauces don't need notes)
      const isSauce = key.toLowerCase().includes('sauce') || 
                      key.toLowerCase().includes('mayo') ||
                      key.toLowerCase().includes('schezwan');
      
      if (shippedQty !== requestedQty && !isSauce && !shippingNotes[key]) {
        missingNotes.push(key.replace('_', ' '));
      }
    });
    
    if (missingNotes.length > 0) {
      toast.error(t('stock.ship.reasonNeeded', { items: missingNotes.join(', ') }));
      return;
    }

    // Any sauce the production head unticked needs its own reason, same requirement as
    // a quantity shortfall above - this used to be the one shortfall type nobody had to
    // explain, so a missing sauce showed up on the store's end with no way to tell why.
    const missingSauceReasons = Object.entries(shippedSauces)
      .filter(([, included]) => !included)
      .filter(([sauce]) => !shippingNotes[`sauce_${sauce}`]?.trim())
      .map(([sauce]) => sauce);
    if (missingSauceReasons.length > 0) {
      toast.error(t('stock.ship.sauceReasonNeeded', { items: missingSauceReasons.join(', ') }));
      return;
    }

    const momoKeys = finishedProducts.map((p) => p.camelKey).filter((k) => k in shippedQuantities);
    const shipsMomos = momoKeys.some((k) => (shippedQuantities[k] || 0) > 0);
    if (shipsMomos && isPhase1Live(getTodayIST()) && !(parseInt(dispatchDraft.boxes, 10) > 0)) {
      toast.error(t('stock.ship.boxesNeeded'));
      return;
    }

    try {
      const shipped = await api.shipProductionRequest(
        context.user.accessToken,
        shippingRequest.id,
        shippedQuantities,
        shippingNotes,
        context.user.employeeId,
        shippedSauces,
        shipsMomos && isPhase1Live(getTodayIST()) ? buildDispatchInfo(dispatchDraft, shippedQuantities, momoKeys) : undefined
      );

      setShowShippingDialog(false);
      if (shipped?.dispatch) {
        toast.success(t('stock.ship.shippedSlip'));
        setSlipRequest(shipped);
      } else {
        toast.success(t('stock.ship.shipped'));
      }
      await loadRequests();
    } catch (error: any) {
      console.error('Error shipping request:', error);
      toast.error(error.message || t('stock.ship.failed'));
    }
  };

  // Filter requests
  const filteredRequests = requests.filter(req => {
    // Store incharge's "View Full Request History" uses a date-range filter instead of
    // the single-date/status filter the oversight roles use above.
    if (isStoreIncharge) {
      const { start, end } = getStockFilterRange(historyFilter, historyCustomRange);
      if (!start || !end) return true;
      return req.requestDate >= start && req.requestDate <= end;
    }
    if (filterDate && req.requestDate !== filterDate) return false;
    if (filterStatus !== 'all' && req.status !== filterStatus) return false;
    return true;
  });

  // Group requests by status for the flow view. 'partially-shipped'/'partially-delivered'
  // are folded into the Shipped/Delivered pills respectively (CONFIRMED BUG, found
  // 2026-08-30: these two statuses used to have no bucket at all here, so they were
  // invisible to every pill AND to the Awaiting Action/In Progress/Completed summary -
  // only "Total Requests" counted them, which made the pills silently undercount by up to
  // ~80% of all requests in a real check against live data). shipped/delivered each carry
  // their own array (fully-shipped/delivered only, for anything that reads .length
  // expecting the exact-status count) plus a `partial` sub-array so the pill can show a
  // "(N partial)" breakdown without losing the distinction between full and partial.
  const groupedByStatus = {
    pending: filteredRequests.filter(r => r.status === 'pending'),
    accepted: filteredRequests.filter(r => r.status === 'accepted'),
    'in-preparation': filteredRequests.filter(r => r.status === 'in-preparation'),
    prepared: filteredRequests.filter(r => r.status === 'prepared'),
    shipped: filteredRequests.filter(r => r.status === 'shipped'),
    delivered: filteredRequests.filter(r => r.status === 'delivered'),
    shippedPartial: filteredRequests.filter(r => r.status === 'partially-shipped'),
    deliveredPartial: filteredRequests.filter(r => r.status === 'partially-delivered'),
  };

  // Group requests by date
  const groupedByDate = filteredRequests.reduce((acc, request) => {
    const date = request.requestDate;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(request);
    return acc;
  }, {} as Record<string, api.ProductionRequest[]>);

  // Sort dates in descending order
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  // Auto-scroll to highlighted request when loaded. Prefer scrolling straight
  // to the Fulfillment Details subsection (what a store manager clicking a
  // "shipped"/"partially-shipped" notification actually wants to see) if it
  // exists on this request; fall back to the request card itself otherwise.
  useEffect(() => {
    if (highlightRequestId && !loading) {
      const element =
        document.getElementById(`fulfillment-${highlightRequestId}`) ||
        document.getElementById(`request-${highlightRequestId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [highlightRequestId, loading, requests]);

  // Auto-expand the first (most recent) date
  useEffect(() => {
    if (sortedDates.length > 0 && Object.keys(expandedDates).length === 0) {
      setExpandedDates({ [sortedDates[0]]: true });
    }
  }, [sortedDates, expandedDates]);
  return {
    loadError,
    setLoadError,
    queueFilter,
    setQueueFilter,
    context,
    highlightRequestId,
    selectedStoreId,
    onNavigateToManageItems,
    requests,
    setRequests,
    loading,
    setLoading,
    hasLoadedOnce,
    setHasLoadedOnce,
    submitting,
    setSubmitting,
    showDuplicateDateConfirm,
    setShowDuplicateDateConfirm,
    updatingRequestId,
    setUpdatingRequestId,
    filterDate,
    setFilterDate,
    filterStatus,
    setFilterStatus,
    chartTimeFilter,
    setChartTimeFilter,
    showStockStatus,
    setShowStockStatus,
    showWorkflow,
    setShowWorkflow,
    showMomoTypeStats,
    setShowMomoTypeStats,
    getLocalDateString,
    getDefaultLoadFrom,
    chartCustomRange,
    setChartCustomRange,
    loadedFrom,
    setLoadedFrom,
    loadingOlderData,
    setLoadingOlderData,
    salesData,
    setSalesData,
    momoQuantities,
    setMomoQuantities,
    notes,
    setNotes,
    getDefaultRequestDate,
    requestDate,
    setRequestDate,
    lastReminderDate,
    setLastReminderDate,
    kitchenUtilities,
    setKitchenUtilities,
    sauces,
    setSauces,
    utilities,
    setUtilities,
    showKitchenUtilities,
    setShowKitchenUtilities,
    showSauces,
    setShowSauces,
    showUtilitiesSection,
    setShowUtilitiesSection,
    selectedRecentRequest,
    setSelectedRecentRequest,
    showSubmitConfirm,
    setShowSubmitConfirm,
    submitConfirmChecked,
    setSubmitConfirmChecked,
    showFullHistory,
    setShowFullHistory,
    historyFilter,
    setHistoryFilter,
    historyCustomRange,
    setHistoryCustomRange,
    expandedDates,
    setExpandedDates,
    showStoreRecalibration,
    setShowStoreRecalibration,
    showHouseRecalibration,
    setShowHouseRecalibration,
    storeBases,
    showThresholdSettings,
    setShowThresholdSettings,
    stockThresholds,
    setStockThresholds,
    isSyncingPos,
    setIsSyncingPos,
    showShippingDialog,
    setShowShippingDialog,
    shippingRequest,
    setShippingRequest,
    shippedQuantities,
    setShippedQuantities,
    shippedSauces,
    setShippedSauces,
    shippingNotes,
    setShippingNotes,
    shippingResponsibility,
    setShippingResponsibility,
    dispatchDraft,
    setDispatchDraft,
    slipRequest,
    setSlipRequest,
    receivingRequest,
    setReceivingRequest,
    momosPerPlate,
    setMomosPerPlate,
    showPlateConfigModal,
    setShowPlateConfigModal,
    showRecalibrationReports,
    setShowRecalibrationReports,
    showStockWastageModal,
    setShowStockWastageModal,
    kitchenUtilityItems,
    sauceItems,
    utilityItems,
    isStoreIncharge,
    isProductionHead,
    isOperationsHead,
    isClusterHead,
    canViewWorkflowSummary,
    canViewMomoTypeReport,
    selectedConcreteStoreId,
    defaultStoreId,
    scopedStoreIds,
    singleScopedStoreId,
    scopedStoreIdSet,
    storeScopeKey,
    matchesStoreScope,
    myHouseIds,
    matchesRequestScope,
    storeDisplayName,
    finishedProducts,
    myStoreRequests,
    lastRequest,
    getRequestedQty,
    currentStockEstimate,
    suggestion,
    setSuggestion,
    suggesting,
    setSuggesting,
    handleSuggest,
    handleRepeatLastRequest,
    getFreshAccessToken,
    loadStockThresholds,
    loadRequests,
    ensureFromLoaded,
    loadSalesData,
    handleSyncPosNow,
    loadStoreOpeningBalance,
    handleSubmitRequest,
    handleConfirmAndSubmit,
    performSubmitRequest,
    handleStatusUpdate,
    openShippingDialog,
    handleShipRequest,
    filteredRequests,
    groupedByStatus,
    groupedByDate,
    sortedDates,
  };
}

export type StockRequestsVM = ReturnType<typeof useStockRequests>;
