import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Package, Clock, CheckCircle, Truck, Calendar, User, Store, Send, ArrowRight, Filter, TrendingUp, ChevronDown, ChevronUp, Settings, AlertTriangle, X, Utensils, Droplet, Box, ArrowUp, ArrowDown, Minus, RefreshCw, FileText, Trash2 } from 'lucide-react';
import { getSupabaseClient } from '../utils/supabase/client';
import { DatePicker } from './DatePicker';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';
import { StockThresholdSettings } from './StockThresholdSettings';
import { RecalibrationReports } from './RecalibrationReports';
import { StockWastageModal } from './StockWastageModal';
import { getAssignedStoreIds, getDefaultStoreId } from '../utils/entityAccess';

type StockFilterPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

// Shared with the "Stock Requests by Momo Type" filter below - returns YYYY-MM-DD bounds.
function getStockFilterRange(preset: StockFilterPreset, customRange: { from: string; to: string }): { start: string; end: string } {
  const now = new Date();
  // toISOString() converts to UTC first - for a positive-offset timezone (IST, +5:30) that
  // rolls "today" back to "yesterday" for the ~5.5 hours after local midnight, which made
  // "This Month"/"This Week" silently collapse to a single day right after midnight IST and
  // exclude a same-day recalibration from being picked up as the new baseline. Use local
  // date components instead so the boundary matches the business's actual IST calendar day.
  const toISO = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const startOfWeek = (d: Date) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  };

  switch (preset) {
    case 'today':
      return { start: toISO(now), end: toISO(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: toISO(y), end: toISO(y) };
    }
    case 'thisWeek':
      return { start: toISO(startOfWeek(now)), end: toISO(now) };
    case 'lastWeek': {
      const thisWeekStart = startOfWeek(now);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      return { start: toISO(lastWeekStart), end: toISO(lastWeekEnd) };
    }
    case 'thisMonth':
      return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: toISO(now) };
    case 'lastMonth':
      return {
        start: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { start: customRange.from, end: customRange.to };
  }
}

interface ProductionRequestsProps {
  context: InventoryContextType;
  highlightRequestId?: string | null;
  selectedStoreId?: string | null;
  onNavigateToManageItems?: () => void;
}

export function ProductionRequests({ context, highlightRequestId, selectedStoreId, onNavigateToManageItems }: ProductionRequestsProps) {
  const [requests, setRequests] = useState<api.ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
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
  // Always default to today (no time restriction)
  const getDefaultRequestDate = () => {
    return getLocalDateString();
  };
  const [requestDate, setRequestDate] = useState(getDefaultRequestDate());
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
  
  // Store opening balance state
  const [storeOpeningBalance, setStoreOpeningBalance] = useState<any>(null);
  
  // Most recent recalibration state (for mid-month recalibrations)
  const [mostRecentRecalibration, setMostRecentRecalibration] = useState<any>(null);
  
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

  const handleRepeatLastRequest = () => {
    if (!lastRequest) return;
    const newQuantities: Record<string, number> = {};
    finishedProducts.forEach(({ camelKey }) => {
      newQuantities[camelKey] = getRequestedQty(lastRequest, camelKey);
    });
    setMomoQuantities(newQuantities);
    setKitchenUtilities(lastRequest.kitchenUtilities || {});
    setSauces(lastRequest.sauces || {});
    setUtilities(lastRequest.utilities || {});
    if ((lastRequest.kitchenUtilities && Object.keys(lastRequest.kitchenUtilities).length > 0)) setShowKitchenUtilities(true);
    if ((lastRequest.sauces && Object.keys(lastRequest.sauces).length > 0)) setShowSauces(true);
    if ((lastRequest.utilities && Object.keys(lastRequest.utilities).length > 0)) setShowUtilitiesSection(true);
  };

  const requestStatusMeta: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    accepted: { label: 'Accepted', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'in-preparation': { label: 'In Preparation', className: 'bg-teal-50 text-teal-700 border-teal-200' },
    prepared: { label: 'Prepared', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    shipped: { label: 'Shipped', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'partially-shipped': { label: 'Partially Shipped', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    delivered: { label: 'Delivered', className: 'bg-green-50 text-green-700 border-green-200' },
    'partially-delivered': { label: 'Partially Delivered', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  };

  // Helper function to get fresh access token
  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
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
      // Reset opening balance to null before recalculating to ensure fresh calculation
      setStoreOpeningBalance(null);
      setMostRecentRecalibration(null);
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
          toast.warning('⏰ Reminder: You haven\'t submitted a stock request for tomorrow yet!', {
            duration: 10000,
            description: 'Please submit your production request to ensure timely preparation.'
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
        filteredRequests = data.filter(req => matchesStoreScope(req.storeId));
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
    } catch (error: any) {
      console.error('Error loading production requests:', error);
      toast.error('Failed to load production requests');
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

  // Maps a recalibration record's items to a { camelKey: quantity } stock object.
  const recalToStock = (recal: any): Record<string, number> => {
    const stock: Record<string, number> = {};
    (recal.items || []).forEach((item: any) => {
      const inventoryItem = context.inventoryItems?.find(invItem =>
        invItem.id === item.itemId || invItem.name === item.itemId
      );
      if (inventoryItem) {
        const camelKey = inventoryItem.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        stock[camelKey] = item.actualQuantity;
      }
    });
    return stock;
  };

  // Opening balance for a store = the most recent recalibration on or before the range's
  // start date (zero if the store has never been recalibrated). A recalibration that falls
  // WITHIN the range (after start, on/before end) is returned separately as a mid-range
  // override, since received/sold before that point shouldn't be double-counted against it.
  const loadStoreRecalBaseline = async (storeId: string, rangeStart: string, rangeEnd: string) => {
    const zeroBalance: Record<string, number> = {};
    finishedProducts.forEach(({ camelKey }) => { zeroBalance[camelKey] = 0; });

    if (!context.user?.accessToken || !storeId) return { opening: zeroBalance, midRange: null as { date: string; stock: Record<string, number> } | null };

    try {
      const recalHistory = await api.getRecalibrationHistory(context.user.accessToken, storeId, 'store');
      const history = recalHistory?.history || [];
      if (history.length === 0) return { opening: zeroBalance, midRange: null };

      const sorted = [...history].sort((a: any, b: any) => b.date.localeCompare(a.date));
      const baseline = sorted.find((r: any) => r.date.substring(0, 10) <= rangeStart);
      const midRange = sorted.find((r: any) => r.date.substring(0, 10) > rangeStart && r.date.substring(0, 10) <= rangeEnd);

      return {
        opening: baseline ? recalToStock(baseline) : zeroBalance,
        midRange: midRange ? { date: midRange.date, stock: recalToStock(midRange) } : null,
      };
    } catch (error) {
      console.error(`Error loading recalibration history for store ${storeId}:`, error);
      return { opening: zeroBalance, midRange: null };
    }
  };

  const loadStoreOpeningBalance = async () => {
    if (!context.user?.accessToken) return;

    const { start, end } = getStockFilterRange('thisMonth', { from: '', to: '' });

    try {
      if (!singleScopedStoreId) {
        const allStores = scopedStoreIds === null
          ? (context.stores || [])
          : (context.stores || []).filter(store => scopedStoreIds.includes(store.id));
        const aggregatedBalance: Record<string, number> = {};
        finishedProducts.forEach(({ camelKey }) => { aggregatedBalance[camelKey] = 0; });

        for (const store of allStores) {
          const { opening } = await loadStoreRecalBaseline(store.id, start, end);
          Object.keys(opening).forEach(key => {
            aggregatedBalance[key] = (aggregatedBalance[key] || 0) + opening[key];
          });
        }

        setStoreOpeningBalance(aggregatedBalance);
        // Mid-range recalibration overrides aren't meaningfully aggregable across multiple
        // stores at once, so "All Stores" always uses the plain opening+received-sold path.
        setMostRecentRecalibration(null);
        return;
      }

      const { opening, midRange } = await loadStoreRecalBaseline(singleScopedStoreId, start, end);
      setStoreOpeningBalance(opening);
      setMostRecentRecalibration(midRange);
    } catch (error) {
      console.error('Error loading opening balance:', error);
      const zeroBalance: Record<string, number> = {};
      finishedProducts.forEach(({ camelKey }) => { zeroBalance[camelKey] = 0; });
      setStoreOpeningBalance(zeroBalance);
      setMostRecentRecalibration(null);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      toast.error('Missing user information. Please ensure you are assigned to a store.');
      return;
    }

    const totalQuantity = Object.values(momoQuantities).reduce((sum, qty) => sum + qty, 0);
    
    if (totalQuantity === 0) {
      console.log('❌ No quantities specified');
      toast.error('Please specify at least one item quantity');
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
      setShowDuplicateDateConfirm(true);
      return;
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
      toast.success('Production request submitted successfully');

      // Reset form
      setMomoQuantities({});
      setKitchenUtilities({});
      setSauces({});
      setUtilities({});
      setNotes('');
      setRequestDate(getDefaultRequestDate());
      setShowDuplicateDateConfirm(false);

      // Reload requests
      await loadRequests();
    } catch (error: any) {
      console.error('❌ Error submitting production request:', error);
      toast.error(error.message || 'Failed to submit request');
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

      toast.success(`Request marked as ${newStatus.replace('-', ' ')}`);
      await loadRequests();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
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
    setShowShippingDialog(true);
  };

  const handleShipRequest = async () => {
    if (!context.user?.accessToken || !context.user?.employeeId || !shippingRequest) return;
    
    // Validate responsibility checkbox
    if (!shippingResponsibility) {
      toast.error('Please confirm your responsibility for shipping these items');
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
      toast.error(`Please add notes for items with different quantities: ${missingNotes.join(', ')}`);
      return;
    }
    
    try {
      await api.shipProductionRequest(
        context.user.accessToken,
        shippingRequest.id,
        shippedQuantities,
        shippingNotes,
        context.user.employeeId,
        shippedSauces
      );
      
      toast.success('Request marked as shipped with quantities recorded');
      setShowShippingDialog(false);
      await loadRequests();
    } catch (error: any) {
      console.error('Error shipping request:', error);
      toast.error(error.message || 'Failed to ship request');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'accepted': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'in-preparation': return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'prepared': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'shipped': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'partially-shipped': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'delivered': return 'bg-green-100 text-green-800 border-green-300';
      case 'partially-delivered': return 'bg-lime-100 text-lime-800 border-lime-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'accepted': return <CheckCircle className="w-4 h-4" />;
      case 'in-preparation': return <Package className="w-4 h-4" />;
      case 'prepared': return <CheckCircle className="w-4 h-4" />;
      case 'shipped': return <Truck className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 rounded-2xl shadow-lg p-4 sm:p-6 text-white">
        <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/10 rounded-full" />
        <div className="absolute -right-2 top-10 w-16 h-16 bg-white/10 rounded-full" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold leading-tight">Daily Stock Requests</h1>
            <p className="text-xs sm:text-base text-orange-50 mt-0.5">
              {isStoreIncharge && 'Submit your daily stock requirements before 9:00 AM'}
              {isProductionHead && 'Manage incoming stock requests and track fulfillment'}
              {(isOperationsHead || isClusterHead) && 'Monitor stock request workflow across stores'}
              {storeDisplayName && ` · ${storeDisplayName}`}
            </p>
          </div>
        </div>
      </div>

      {/* Stock Wastage - logs today's momo wastage, in pieces, one number per momo type
          (including both kurkure varieties). Tracked from launch (2026-08-30) forward
          only. Placed at the top (before Store Stock Status) since it's a daily entry
          action, not a report. Visible to everyone with canViewWorkflowSummary - not
          just Store Incharge - so Operations/Cluster/Production heads can view and
          log/correct it too; shown regardless of canViewMomoTypeReport since that gate
          is for the cross-store oversight report further down, not this entry action. */}
      {canViewWorkflowSummary && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">Stock Wastage</h2>
              <p className="text-xs text-gray-500">Log today's momo wastage, in pieces, by type</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (!singleScopedStoreId) {
                toast.info('Select one store to log wastage');
                return;
              }
              setShowStockWastageModal(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-md hover:shadow-lg flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-semibold whitespace-nowrap">Log Wastage</span>
          </button>
        </div>
      )}

      {/* Stock Status Overview */}
      <div className="bg-white rounded-xl shadow-md border border-green-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 bg-gradient-to-r from-green-50 to-emerald-50">
          <button
            type="button"
            onClick={() => setShowStockStatus(!showStockStatus)}
            className="flex items-start gap-3 text-left flex-1 min-w-0"
          >
            <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-green-900 mb-0.5 flex items-center gap-2">
                Store Stock Status
                {showStockStatus ? <ChevronUp className="w-5 h-5 text-green-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-green-600 flex-shrink-0" />}
              </h2>
              <p className="text-xs sm:text-sm text-green-700">
                Total inventory received from production house - Stock sold
              </p>
            </div>
          </button>
          {isStoreIncharge && (() => {
            // CHANGED: Recalibration now enabled for entire month for Store Incharges
            // Notifications will be sent to Operations Managers and Cluster Heads
            return (
              <button
                onClick={() => setShowStoreRecalibration(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700 shadow-md font-semibold w-full sm:w-auto flex-shrink-0"
              >
                <CheckCircle className="w-5 h-5" />
                Recalibrate Stock
              </button>
            );
          })()}
        </div>

        {showStockStatus && (
        <>
        <div className="p-4 sm:p-6">
        {/* Currently Viewing Banner */}
        {(() => {
          const activeLabel = 'This Month';

          return (
            <div className="bg-gradient-to-r from-green-100 to-green-50 border-l-4 border-green-600 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-5 h-5 text-green-700 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-900">
                      Store Stock Status ({activeLabel})
                    </p>
                    <p className="text-xs text-green-700">
                      Opening balance + Received in period − Sold in period
                    </p>
                  </div>
                </div>
                {/* Small icon-only sync button, tucked in the corner rather than a big CTA */}
                <button
                  onClick={handleSyncPosNow}
                  disabled={isSyncingPos}
                  className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-sm disabled:opacity-50 flex-shrink-0"
                  title={isSyncingPos ? 'Syncing...' : "Sync Now - fetch today's sales/stock from Ciferon POS right now, instead of waiting for the 10:30 PM automatic sync"}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingPos ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {isClusterHead && (
                  <button
                    onClick={() => {
                      if (!singleScopedStoreId) {
                        toast.info('Select one store to edit alert settings');
                        return;
                      }
                      setShowThresholdSettings(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition-all flex-1 sm:flex-none"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Alert Settings</span>
                  </button>
                )}
                {isClusterHead && (
                  <button
                    onClick={() => setShowPlateConfigModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-900 transition-all shadow-md hover:shadow-lg flex-1 sm:flex-none"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Plate Config</span>
                  </button>
                )}
                {onNavigateToManageItems && isClusterHead && (
                  <button
                    onClick={onNavigateToManageItems}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg flex-1 sm:flex-none"
                  >
                    <Package className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Manage Items</span>
                  </button>
                )}
                {isClusterHead && (
                  <button
                    onClick={() => setShowRecalibrationReports(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50 transition-all flex-1 sm:flex-none"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-sm font-semibold whitespace-nowrap">Recalibration</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {(() => {
          // Calculate Store Stock Status for the current month:
          // Store Stock = Opening Balance + Received this month - Sold this month

          const { start: rangeStart, end: rangeEnd } = getStockFilterRange('thisMonth', { from: '', to: '' });
          const inRange = (dateStr: string | undefined) => !!dateStr && dateStr.substring(0, 10) >= rangeStart && dateStr.substring(0, 10) <= rangeEnd;

          const deliveredRequests = context.productionRequests?.filter(req => {
            // Only requests actually marked delivered/partially-delivered represent stock
            // that has physically reached the store. "pending" is the very first status
            // (just requested, not yet accepted/prepared/shipped) - it was previously
            // miscounted here as "received", which is not what that status means.
            if (req.status !== 'delivered' && req.status !== 'partially-delivered') return false;

            const deliveryDate = req.deliveredAt || req.requestDate || req.createdAt;
            if (!inRange(deliveryDate)) return false;

            return matchesStoreScope(req.storeId);
          }) || [];

          // Aggregate the period's received quantities. Uses shippedQuantities (the real
          // amount the production house actually shipped, entered at the ship step) rather
          // than the originally requested amount - for a partially-shipped/delivered request
          // these two differ, and the requested amount overstates what actually arrived.
          const totalReceived = deliveredRequests.reduce((acc, req) => {
            finishedProducts.forEach(({ camelKey }) => {
              const shipped = (req as any).shippedQuantities?.[camelKey];
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0; // Old requests have 's' at end
              const value = shipped !== undefined ? shipped : (newFormat + oldFormat);
              acc[camelKey] = (acc[camelKey] || 0) + value;
            });
            return acc;
          }, {} as Record<string, number>);

          // Get the period's sales data for this store
          const storeSales = salesData.filter((s: any) => {
            if (!inRange(s.date)) return false;

            return matchesStoreScope(s.storeId);
          });
          
          // Aggregate current month's sales dynamically
          const totalSales = storeSales.reduce((acc: any, sale: any) => {
            finishedProducts.forEach(({ camelKey, legacySalesKey }) => {
              // Get value from the legacySalesKey
              let salesValue = sale.data?.[legacySalesKey] || 0;
              
              // Backward compatibility: Check for old "Corn Cheese Momos" naming
              if (legacySalesKey === 'Cheese Corn Momos' && salesValue === 0) {
                salesValue = sale.data?.['Corn Cheese Momos'] || 0;
              }
              
              acc[camelKey] = (acc[camelKey] || 0) + salesValue;
            });
            return acc;
          }, {} as Record<string, number>);
          
          // Get opening balance from state (or initialize with zeros for all products)
          const openingBalance = storeOpeningBalance || 
            finishedProducts.reduce((acc, { camelKey }) => {
              acc[camelKey] = 0;
              return acc;
            }, {} as Record<string, number>);
          
          console.log('📊 Store Stock Status Calculation Debug:');
          console.log('  storeOpeningBalance from state:', storeOpeningBalance);
          console.log('  openingBalance being used:', openingBalance);
          console.log('  totalReceived:', totalReceived);
          console.log('  🐔 Chicken Momo (chicken) received:', totalReceived.chicken || 0);
          console.log('  🐔 Chicken Kurkure (chickenKurkure) received:', totalReceived.chickenKurkure || 0);
          console.log('  totalSales:', totalSales);
          console.log('  finishedProducts count:', finishedProducts.length);
          
          // CRITICAL FIX: Don't show stock status until opening balance is loaded
          // If storeOpeningBalance is null, it means it's still loading
          if (storeOpeningBalance === null) {
            console.log('  ⚠️ Opening balance not loaded yet, showing loading state');
            return (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-green-700" />
                  <p className="text-sm font-semibold text-green-900">
                    Store Stock Status
                  </p>
                </div>
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <p className="ml-3 text-sm text-green-700">Loading opening balance...</p>
                </div>
              </div>
            );
          }
          
          // Calculate store stock
          // NEW LOGIC: If there's a more recent recalibration (mid-month), use it as baseline
          // Stock = Most Recent Recalibration + (Received AFTER it) - (Sold AFTER it)
          // Otherwise: Stock = Opening Balance + Total Received - Total Sold
          
          const storeStock: Record<string, number> = {};
          
          if (mostRecentRecalibration) {
            console.log('  🔄 Using MOST RECENT recalibration as baseline:');
            console.log('    Recalibration date:', mostRecentRecalibration.date);
            console.log('    Recalibration stock:', mostRecentRecalibration.stock);
            
            // Calculate received and sold AFTER the most recent recalibration
            const recalDate = mostRecentRecalibration.date;
            // Extract just the date portion (YYYY-MM-DD) for comparison
            const recalDateOnly = recalDate.substring(0, 10);
            
            const receivedAfterRecal: Record<string, number> = {};
            const soldAfterRecal: Record<string, number> = {};
            
            // Filter received requests to only count those AFTER recalibration
            deliveredRequests.forEach(req => {
              const deliveryDate = req.deliveredAt || req.requestDate || req.createdAt;
              // Compare only the date portion (YYYY-MM-DD)
              const deliveryDateOnly = deliveryDate ? deliveryDate.substring(0, 10) : '';
              if (deliveryDateOnly && deliveryDateOnly > recalDateOnly) {
                finishedProducts.forEach(({ camelKey }) => {
                  const shipped = (req as any).shippedQuantities?.[camelKey];
                  const value = shipped !== undefined ? shipped : ((req as any)[camelKey] || 0);
                  receivedAfterRecal[camelKey] = (receivedAfterRecal[camelKey] || 0) + value;
                });
              }
            });
            
            // Filter sales to only count those AFTER recalibration date
            // For same-day sales, include them (use >=) because sales don't have timestamps
            storeSales.forEach((sale: any) => {
              const saleDate = sale.date;
              // Compare only the date portion
              const saleDateOnly = saleDate ? saleDate.substring(0, 10) : '';
              if (saleDateOnly && saleDateOnly >= recalDateOnly) {
                finishedProducts.forEach(({ camelKey, legacySalesKey }) => {
                  let salesValue = sale.data?.[legacySalesKey] || 0;
                  if (legacySalesKey === 'Cheese Corn Momos' && salesValue === 0) {
                    salesValue = sale.data?.['Corn Cheese Momos'] || 0;
                  }
                  soldAfterRecal[camelKey] = (soldAfterRecal[camelKey] || 0) + salesValue;
                });
              }
            });
            
            console.log('    Received AFTER recalibration:', receivedAfterRecal);
            console.log('    Sold AFTER recalibration:', soldAfterRecal);
            
            // Calculate stock based on most recent recalibration
            finishedProducts.forEach(({ camelKey }) => {
              const recalStock = mostRecentRecalibration.stock[camelKey] || 0;
              const receivedAfter = receivedAfterRecal[camelKey] || 0;
              const soldAfter = soldAfterRecal[camelKey] || 0;
              storeStock[camelKey] = recalStock + receivedAfter - soldAfter;
              
              console.log(`    ${camelKey}: ${recalStock} (recal) + ${receivedAfter} (received) - ${soldAfter} (sold) = ${storeStock[camelKey]}`);
            });
          } else {
            // No mid-month recalibration - use opening balance
            console.log('  📊 Using opening balance (no mid-month recalibration)');
            finishedProducts.forEach(({ camelKey }) => {
              storeStock[camelKey] = (openingBalance[camelKey] || 0) + (totalReceived[camelKey] || 0) - (totalSales[camelKey] || 0);
            });
          }
          
          console.log('  storeStock calculated:', storeStock);
          
          // Color palette for momo cards
          const colorPalette = ['violet', 'fuchsia', 'green', 'yellow', 'blue', 'teal', 'red', 'sky', 'orange', 'cyan'];
          
          const totalReceivedSum = Object.values(totalReceived).reduce((sum: number, val: any) => sum + val, 0);
          const totalOpeningBalanceSum = Object.values(openingBalance).reduce((sum: number, val: any) => sum + val, 0);
          const totalRecalibrationSum = mostRecentRecalibration
            ? Object.values(mostRecentRecalibration.stock || {}).reduce((sum: number, val: any) => sum + val, 0)
            : 0;
          const totalStockSum = totalReceivedSum + totalOpeningBalanceSum + totalRecalibrationSum;
          
          console.log('  totalReceivedSum:', totalReceivedSum);
          console.log('  totalOpeningBalanceSum:', totalOpeningBalanceSum);
          console.log('  totalRecalibrationSum:', totalRecalibrationSum);
          console.log('  totalStockSum:', totalStockSum);
          
          if (totalStockSum === 0) {
            return (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No inventory available for this period ({rangeStart} to {rangeEnd})</p>
                <p className="text-sm text-gray-500 mt-2">
                  Stock will appear here once:
                </p>
                <ul className="text-sm text-gray-500 mt-2 list-disc list-inside">
                  <li>Your requests are <strong>delivered</strong> by the production house</li>
                  <li>OR you perform a stock recalibration (1st-5th of each month)</li>
                </ul>
                <p className="text-xs text-blue-600 mt-4">
                  💡 Tip: Check if your requests have been marked as "Delivered" below
                </p>
              </div>
            );
          }
          
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {finishedProducts.map(({ camelKey, label }, index) => {
                const received = totalReceived[camelKey] || 0;
                const sold = totalSales[camelKey] || 0;
                const stock = storeStock[camelKey] || 0;
                const opening = openingBalance[camelKey] || 0;
                const totalAvailable = opening + received; // Total available = opening + received
                const color = colorPalette[index % colorPalette.length];
                
                // Get threshold levels for this momo type
                const thresholds = stockThresholds[camelKey] || { high: 600, medium: 300, low: 150 };
                
                // Determine stock level and alert
                let stockLevel: 'high' | 'medium' | 'low' | 'critical' = 'high';
                let alertBgColor = '';
                let alertTextColor = '';
                let alertBorderColor = '';
                let alertLabel = '';
                
                if (stock <= 0) {
                  stockLevel = 'critical';
                  alertBgColor = 'bg-red-100';
                  alertTextColor = 'text-red-700';
                  alertBorderColor = 'border-red-300';
                  alertLabel = 'CRITICAL';
                } else if (stock <= thresholds.low) {
                  stockLevel = 'low';
                  alertBgColor = 'bg-red-100';
                  alertTextColor = 'text-red-700';
                  alertBorderColor = 'border-red-300';
                  alertLabel = 'LOW';
                } else if (stock <= thresholds.medium) {
                  stockLevel = 'medium';
                  alertBgColor = 'bg-orange-100';
                  alertTextColor = 'text-orange-700';
                  alertBorderColor = 'border-orange-300';
                  alertLabel = 'MEDIUM';
                } else if (stock < thresholds.high) {
                  stockLevel = 'medium';
                  alertBgColor = 'bg-yellow-100';
                  alertTextColor = 'text-yellow-700';
                  alertBorderColor = 'border-yellow-300';
                  alertLabel = 'MEDIUM';
                }
                
                const isLowStock = stock < totalAvailable * 0.2 && totalAvailable > 0; // Less than 20%
                
                return (
                  <div key={camelKey} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 border-2 border-${color}-200 rounded-lg p-2.5 relative`}>
                    {/* Stock Alert Badge */}
                    {stockLevel !== 'high' && (
                      <div className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded ${alertBgColor} border ${alertBorderColor}`}>
                        <AlertTriangle className={`w-3 h-3 ${alertTextColor}`} />
                        <span className={`text-[10px] font-semibold ${alertTextColor} uppercase`}>{alertLabel}</span>
                      </div>
                    )}

                    <h3 className="text-xs font-semibold text-gray-900 mb-1.5 pr-14 truncate">{label}</h3>

                    <div className="flex justify-between items-center text-[11px] text-gray-600">
                      <span>Received: <span className={`font-semibold text-${color}-700`}>{received}</span></span>
                      <span>Sold: <span className={`font-semibold text-${color}-700`}>{sold}</span></span>
                    </div>

                    <div className="border-t border-gray-300 mt-1.5 pt-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-gray-500">Available</span>
                      <div className={`text-sm font-bold ${isLowStock ? 'text-red-600' : stock < 0 ? 'text-red-600' : `text-${color}-800`}`}>
                        {stock} pcs / {Math.round(stock / momosPerPlate)} pl
                      </div>
                    </div>

                    {(isLowStock || stock < 0) && (
                      <p className="text-[10px] text-red-700 font-semibold mt-1">
                        {stock < 0 ? '⚠️ Oversold' : '⚠️ Low'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
        </div>
        </>
        )}
      </div>

      {/* Store In-Charge Request Form */}
      {isStoreIncharge && (
        <div className="bg-white rounded-xl shadow-md border border-orange-100 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-100">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center flex-shrink-0">
              <Send className="w-4.5 h-4.5 text-white" />
            </div>
            <h2 className="text-base sm:text-xl font-bold text-gray-900">Submit Stock Request</h2>
          </div>
          <div className="p-4 sm:p-6">

          {/* Recent Requests - status at a glance, so checking on an existing request
              doesn't require scrolling past the whole form down to the history list. */}
          {myStoreRequests.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Recent Requests
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {myStoreRequests.slice(0, 3).map((req) => {
                  const meta = requestStatusMeta[req.status] || requestStatusMeta.pending;
                  const summary = finishedProducts
                    .map(({ camelKey, label }) => ({ label: label.replace(' Momo', ''), qty: getRequestedQty(req, camelKey) }))
                    .filter(p => p.qty > 0)
                    .sort((a, b) => b.qty - a.qty)
                    .slice(0, 3)
                    .map(p => `${p.qty} ${p.label}`)
                    .join(' · ');
                  const shortageKeys = req.shippingNotes ? Object.keys(req.shippingNotes) : [];
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setSelectedRecentRequest(req)}
                      className="flex-shrink-0 min-w-[190px] max-w-[220px] border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-orange-300 transition-all bg-white text-left cursor-pointer"
                    >
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-1.5 ${meta.className}`}>
                        {meta.label}
                      </span>
                      <p className="text-xs text-gray-500 mb-1">
                        {req.status === 'delivered' || req.status === 'partially-delivered'
                          ? `Delivered ${new Date(req.deliveredAt || req.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                          : `Submitted ${new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </p>
                      <p className="text-sm text-gray-900 font-medium">{summary || 'No momo items'}</p>
                      {shortageKeys.length > 0 && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          {shortageKeys.length} item{shortageKeys.length !== 1 ? 's' : ''} short
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Repeat last request - day-to-day quantities are usually very similar, so
              pre-filling from the last submission saves re-typing the same numbers. */}
          {lastRequest && (
            <div className="mb-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-3 shadow-sm flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
                <RefreshCw className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Repeat last request?</p>
                  <p className="text-xs text-gray-600 truncate">
                    {new Date(lastRequest.requestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}:{' '}
                    {finishedProducts
                      .map(({ camelKey, label }) => ({ label: label.replace(' Momo', ''), qty: getRequestedQty(lastRequest, camelKey) }))
                      .filter(p => p.qty > 0)
                      .slice(0, 3)
                      .map(p => `${p.qty} ${p.label}`)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRepeatLastRequest}
                className="flex-shrink-0 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 active:scale-95 transition-all shadow-sm"
              >
                Use this
              </button>
            </div>
          )}

          <form onSubmit={handleSubmitRequest} className="space-y-6">
            <div className="rounded-lg border-2 border-amber-100 bg-amber-50 p-3 sm:p-4">
              <label className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-amber-600 flex-shrink-0" />
                Request Date
              </label>
              <DatePicker
                label=""
                value={requestDate}
                onChange={setRequestDate}
                className="w-full"
              />
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 flex items-center gap-2 pb-2 border-b-2 border-teal-100">
                <div className="w-7 h-7 rounded-md bg-teal-600 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-white" />
                </div>
                Momo Quantities
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {finishedProducts.map(({ camelKey, label }) => {
                  // Quick preset values based on typical order sizes
                  const presetValues = camelKey === 'chicken'
                    ? [150, 300, 450, 600]
                    : [60, 120, 180, 300];
                  const have = currentStockEstimate[camelKey] ?? 0;
                  const haveClassName = have <= 0
                    ? 'bg-red-50 text-red-600'
                    : have < 60
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-green-50 text-green-700';
                  const current = momoQuantities[camelKey] || 0;
                  const step = camelKey === 'chicken' ? 30 : 15;

                  return (
                    <div key={camelKey} className="border border-gray-200 rounded-lg p-2 sm:p-3 bg-white shadow-sm hover:shadow-md hover:border-orange-200 transition-all min-w-0">
                      <div className="mb-1.5">
                        <label className="block text-sm sm:text-base font-semibold text-gray-900 leading-snug">{label}</label>
                        <span className={`inline-block mt-1 text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full ${haveClassName}`}>
                          have {have}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMomoQuantities({ ...momoQuantities, [camelKey]: Math.max(0, current - step) })}
                          className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-md text-gray-700 text-xs sm:text-sm font-bold hover:bg-gray-50"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={current}
                          onChange={(e) => setMomoQuantities({
                            ...momoQuantities,
                            [camelKey]: parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0
                          })}
                          className="w-full min-w-0 px-1 py-2.5 sm:px-2 sm:py-3 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-sm sm:text-lg text-center font-bold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setMomoQuantities({ ...momoQuantities, [camelKey]: current + step })}
                          className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-md text-gray-700 text-xs sm:text-sm font-bold hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1.5 sm:mt-2">
                        {presetValues.map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setMomoQuantities({
                              ...momoQuantities,
                              [camelKey]: val
                            })}
                            className="px-1 py-1 bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-100 rounded-md text-[10px] sm:text-[11px] font-medium transition-colors"
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Kitchen Utilities Section - collapsed by default, most days stay at zero.
                A distinct colored header bar + 2-column item grid so this doesn't read as
                one more long undifferentiated scroll of fields. */}
            <div className="rounded-lg border-2 border-teal-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowKitchenUtilities(!showKitchenUtilities)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-teal-50 text-left"
              >
                <h3 className="text-base sm:text-lg font-bold text-teal-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  Kitchen Utilities <span className="text-xs text-teal-600 font-normal">(Optional)</span>
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(kitchenUtilities).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-600 text-white">
                      {Object.keys(kitchenUtilities).length} added
                    </span>
                  )}
                  {showKitchenUtilities ? <ChevronUp className="w-5 h-5 text-teal-600" /> : <ChevronDown className="w-5 h-5 text-teal-600" />}
                </div>
              </button>
              {showKitchenUtilities && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-4 bg-white">
                {kitchenUtilityItems.map((item) => {
                  const qty = kitchenUtilities[item.name]?.quantity ?? 0;
                  const setQty = (quantity: number) => {
                    const rounded = Math.max(0, Math.round(quantity * 100) / 100);
                    if (rounded > 0) {
                      setKitchenUtilities({
                        ...kitchenUtilities,
                        [item.name]: { quantity: rounded, unit: item.unit }
                      });
                    } else {
                      const newUtils = { ...kitchenUtilities };
                      delete newUtils[item.name];
                      setKitchenUtilities(newUtils);
                    }
                  };
                  return (
                  <div key={item.name} className="border border-gray-200 rounded-lg p-2">
                    <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5 leading-snug">
                      {item.name} <span className="text-gray-500 font-normal">({item.unit})</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(qty - 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={kitchenUtilities[item.name]?.quantity !== undefined ? kitchenUtilities[item.name].quantity : ''}
                        onChange={(e) => setQty(parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                        className="w-full min-w-0 px-1 py-1.5 sm:px-2 sm:py-2 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-sm sm:text-base text-center tabular-nums"
                        placeholder="Qty"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(qty + 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* Sauces Section - collapsed by default, chip toggles instead of a long
                checkbox list */}
            <div className="rounded-lg border-2 border-rose-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSauces(!showSauces)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-rose-50 text-left"
              >
                <h3 className="text-base sm:text-lg font-bold text-rose-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  Sauces
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(sauces).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-600 text-white">
                      {Object.keys(sauces).length} selected
                    </span>
                  )}
                  {showSauces ? <ChevronUp className="w-5 h-5 text-rose-600" /> : <ChevronDown className="w-5 h-5 text-rose-600" />}
                </div>
              </button>
              {showSauces && (
              <div className="flex flex-wrap gap-2 p-3 sm:p-4 bg-white">
                {sauceItems.map((sauce) => {
                  const on = sauces[sauce] || false;
                  return (
                    <button
                      key={sauce}
                      type="button"
                      onClick={() => {
                        if (on) {
                          const newSauces = { ...sauces };
                          delete newSauces[sauce];
                          setSauces(newSauces);
                        } else {
                          setSauces({ ...sauces, [sauce]: true });
                        }
                      }}
                      className={`px-3 py-2 rounded-full text-sm border-2 transition-colors ${
                        on ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-rose-300'
                      }`}
                    >
                      {sauce}
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            {/* Utilities Section */}
            <div className="rounded-lg border-2 border-blue-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowUtilitiesSection(!showUtilitiesSection)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-blue-50 text-left"
              >
                <h3 className="text-base sm:text-lg font-bold text-blue-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  Utilities <span className="text-xs text-blue-600 font-normal">(pieces)</span>
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {Object.keys(utilities).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      {Object.keys(utilities).length} added
                    </span>
                  )}
                  {showUtilitiesSection ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5 text-blue-600" />}
                </div>
              </button>
              {showUtilitiesSection && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 p-3 sm:p-4 bg-white">
                {utilityItems.map((item) => {
                  const qty = utilities[item] ?? 0;
                  const setQty = (quantity: number) => {
                    const rounded = Math.max(0, Math.round(quantity));
                    if (rounded > 0) {
                      setUtilities({ ...utilities, [item]: rounded });
                    } else {
                      const newUtils = { ...utilities };
                      delete newUtils[item];
                      setUtilities(newUtils);
                    }
                  };
                  return (
                  <div key={item} className="border border-gray-200 rounded-lg p-2">
                    <label className="block text-xs sm:text-sm font-semibold text-gray-900 mb-1.5">{item}</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(qty - 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={utilities[item] !== undefined ? utilities[item] : ''}
                        onChange={(e) => setQty(parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                        className="w-full min-w-0 px-1 py-1.5 sm:px-2 sm:py-2 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-sm sm:text-base text-center tabular-nums"
                        placeholder="Pieces"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(qty + 1)}
                        className="w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 border-gray-300 rounded-lg text-gray-700 text-base font-bold hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              )}
            </div>

            <div className="rounded-lg border-2 border-gray-200 bg-gray-50 p-3 sm:p-4">
              <label className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                Additional Notes <span className="text-xs text-gray-500 font-normal">(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border-2 border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none resize-none bg-white text-sm sm:text-base"
                placeholder="Any special requirements or notes..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white py-4 rounded-lg hover:from-orange-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base font-medium shadow-lg active:scale-95"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </form>
          </div>
        </div>
      )}

      {/* Store incharges get a collapsed "View Full Request History" toggle instead of
          the workflow summary + full date history always sprawled below the form -
          Recent Requests and the repeat-last-request shortcut already cover the day-to-day
          need, and the full history stays one tap away for anyone who wants to dig further
          back. Other roles (production head/ops head/cluster head) still see it expanded,
          unchanged, since they rely on it for oversight. */}
      {isStoreIncharge && (
        <button
          type="button"
          onClick={() => setShowFullHistory(!showFullHistory)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-orange-200 transition-all"
        >
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            View Full Request History
          </span>
          {showFullHistory ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
      )}

      {(!isStoreIncharge || showFullHistory) && (
      <>
      {isStoreIncharge && (() => {
        const historyFilterOptions: { value: StockFilterPreset; label: string }[] = [
          { value: 'thisWeek', label: 'This Week' },
          { value: 'lastWeek', label: 'Last Week' },
          { value: 'thisMonth', label: 'This Month' },
          { value: 'lastMonth', label: 'Last Month' },
          { value: 'custom', label: 'Custom' },
        ];
        return (
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as StockFilterPreset)}
              className="sm:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 mb-2"
            >
              {historyFilterOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="hidden sm:flex gap-2 overflow-x-auto pb-1 mb-2">
              {historyFilterOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHistoryFilter(value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                    historyFilter === value ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {historyFilter === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DatePicker
                  label="From Date"
                  value={historyCustomRange.from}
                  onChange={(date) => setHistoryCustomRange({ ...historyCustomRange, from: date })}
                />
                <DatePicker
                  label="To Date"
                  value={historyCustomRange.to}
                  onChange={(date) => setHistoryCustomRange({ ...historyCustomRange, to: date })}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Live status summary + date/status filters - operations/cluster head oversight,
          production head's fulfillment queue, and the store incharge's own request status. */}
      {canViewWorkflowSummary && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setShowWorkflow(!showWorkflow)}
            className="w-full flex items-center justify-between gap-2 mb-4 sm:mb-6 text-left"
          >
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Production Request Workflow</h2>
            {showWorkflow ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
          </button>

          {showWorkflow && (
          <>
          <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3">
            <div className="flex-1 sm:min-w-[200px]">
              <DatePicker
                label="Filter by Date"
                value={filterDate}
                onChange={setFilterDate}
                className="w-full"
              />
            </div>
            <div className="flex-1 sm:min-w-[200px]">
              <label className="block text-sm text-gray-700 mb-2">Filter by Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:border-teal-500 focus:outline-none text-base"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="in-preparation">In Preparation</option>
                <option value="prepared">Prepared</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            {(filterDate || filterStatus !== 'all') && (
              <div className="flex sm:items-end">
                <button
                  onClick={() => {
                    setFilterDate('');
                    setFilterStatus('all');
                  }}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm text-teal-600 hover:text-teal-900 underline font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
          {loadingOlderData && (
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
              Loading older requests for this date...
            </div>
          )}

          <div className="relative">
            {/* Connection Line - only meaningful once the grid is a single row */}
            <div className="hidden md:block absolute top-6 left-0 right-0 h-1 bg-gray-200" style={{ zIndex: 0 }}></div>

            {/* Status Cards */}
            <div className="relative grid grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4" style={{ zIndex: 1 }}>
              {/* Pending */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.pending.length}</div>
                  </div>
                </div>
                <div className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                    <p className="text-xs text-yellow-800">Pending</p>
                  </div>
                </div>
              </div>

              {/* Accepted */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.accepted.length}</div>
                  </div>
                </div>
                <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0" />
                    <p className="text-xs text-blue-800">Accepted</p>
                  </div>
                </div>
              </div>

              {/* In Preparation */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus['in-preparation'].length}</div>
                  </div>
                </div>
                <div className="w-full bg-teal-50 border-2 border-teal-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Package className="w-3 h-3 text-teal-600 flex-shrink-0" />
                    <p className="text-xs text-teal-800">In Prep</p>
                  </div>
                </div>
              </div>

              {/* Prepared */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.prepared.length}</div>
                  </div>
                </div>
                <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0" />
                    <p className="text-xs text-blue-800">Prepared</p>
                  </div>
                </div>
              </div>

              {/* Shipped - includes partially-shipped requests (shipping has started, even
                  if not every item went out), broken out as a "(N partial)" sub-count so
                  the distinction isn't lost. */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.shipped.length + groupedByStatus.shippedPartial.length}</div>
                  </div>
                </div>
                <div className="w-full bg-orange-50 border-2 border-orange-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Truck className="w-3 h-3 text-orange-600 flex-shrink-0" />
                    <p className="text-xs text-orange-800">Shipped</p>
                  </div>
                  {groupedByStatus.shippedPartial.length > 0 && (
                    <p className="text-[10px] text-orange-600">({groupedByStatus.shippedPartial.length} partial)</p>
                  )}
                </div>
              </div>

              {/* Delivered - includes partially-delivered requests (the request has
                  reached its final resolved state, even if the full requested quantity
                  didn't arrive - matches isDeliveredStatus() elsewhere in this file). */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg mb-2 sm:mb-3">
                  <div className="text-center">
                    <div className="text-lg sm:text-2xl">{groupedByStatus.delivered.length + groupedByStatus.deliveredPartial.length}</div>
                  </div>
                </div>
                <div className="w-full bg-green-50 border-2 border-green-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                    <p className="text-xs text-green-800">Delivered</p>
                  </div>
                  {groupedByStatus.deliveredPartial.length > 0 && (
                    <p className="text-[10px] text-green-600">({groupedByStatus.deliveredPartial.length} partial)</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stats - Awaiting Action + In Progress + Completed now sum to Total
              Requests exactly (CONFIRMED FIX, 2026-08-30): 'shipped' was previously
              missing from "In Progress" entirely, and 'partially-shipped'/
              'partially-delivered' weren't counted anywhere at all. */}
          <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl text-gray-900">{filteredRequests.length}</p>
              <p className="text-sm text-gray-600">Total Requests</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-yellow-600">{groupedByStatus.pending.length}</p>
              <p className="text-sm text-gray-600">Awaiting Action</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-teal-600">
                {groupedByStatus.accepted.length + groupedByStatus['in-preparation'].length + groupedByStatus.prepared.length + groupedByStatus.shipped.length + groupedByStatus.shippedPartial.length}
              </p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-green-600">{groupedByStatus.delivered.length + groupedByStatus.deliveredPartial.length}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* Stock Requests by Momo Type - Card View. Cross-store oversight report, kept to
          operations head + cluster head only - store/production incharge each have their
          own store's/queue's requests in the section below instead. */}
      {canViewMomoTypeReport && (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setShowMomoTypeStats(!showMomoTypeStats)}
          className="w-full flex items-center justify-between gap-2 mb-4 sm:mb-6 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Stock Requests by Momo Type</h2>
          </div>
          {showMomoTypeStats ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
        </button>

        {showMomoTypeStats && (
        <>
        <div className="mb-4 sm:mb-6">
          {(() => {
            const filterOptions = [
              { filter: 'today', label: 'Today' },
              { filter: 'yesterday', label: 'Yesterday' },
              { filter: 'thisWeek', label: 'This Week' },
              { filter: 'lastWeek', label: 'Last Week' },
              { filter: 'thisMonth', label: 'This Month' },
              { filter: 'lastMonth', label: 'Last Month' },
              { filter: 'custom', label: 'Custom' }
            ];
            return (
              <>
                <select
                  value={chartTimeFilter}
                  onChange={(e) => setChartTimeFilter(e.target.value as any)}
                  className="sm:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                >
                  {filterOptions.map(({ filter, label }) => (
                    <option key={filter} value={filter}>{label}</option>
                  ))}
                </select>
                <div className="hidden sm:flex gap-2 overflow-x-auto pb-1">
                  {filterOptions.map(({ filter, label }) => (
                    <button
                      key={filter}
                      onClick={() => setChartTimeFilter(filter as any)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                        chartTimeFilter === filter
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {chartTimeFilter === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <DatePicker
              label="From Date"
              value={chartCustomRange.from}
              onChange={(date) => setChartCustomRange({ ...chartCustomRange, from: date })}
            />
            <DatePicker
              label="To Date"
              value={chartCustomRange.to}
              onChange={(date) => setChartCustomRange({ ...chartCustomRange, to: date })}
            />
          </div>
        )}

        {loadingOlderData && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
            Loading older requests for this range...
          </div>
        )}

        {/* Card-based view */}
        {(() => {
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          
          // Get start of this week (Sunday)
          const thisWeekStart = new Date(now);
          thisWeekStart.setDate(now.getDate() - now.getDay());
          thisWeekStart.setHours(0, 0, 0, 0);
          
          // Get start of last week
          const lastWeekStart = new Date(thisWeekStart);
          lastWeekStart.setDate(thisWeekStart.getDate() - 7);
          const lastWeekEnd = new Date(thisWeekStart);
          lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
          
          // Get start of this month
          const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          
          // Get start and end of last month
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
          
          // Filter requests based on selected time period
          let filteredForCards = requests;
          let periodLabel = '';
          
          const chartTimeFilterAny = chartTimeFilter as string;
          if (chartTimeFilterAny === 'today') {
            filteredForCards = requests.filter(r => r.requestDate === today);
            periodLabel = 'Today';
          } else if (chartTimeFilterAny === 'yesterday') {
            filteredForCards = requests.filter(r => r.requestDate === yesterday);
            periodLabel = 'Yesterday';
          } else if (chartTimeFilterAny === 'thisWeek') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= thisWeekStart && reqDate <= now;
            });
            periodLabel = 'This Week';
          } else if (chartTimeFilterAny === 'lastWeek') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= lastWeekStart && reqDate <= lastWeekEnd;
            });
            periodLabel = 'Last Week';
          } else if (chartTimeFilterAny === 'thisMonth') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= thisMonthStart && reqDate <= now;
            });
            periodLabel = 'This Month';
          } else if (chartTimeFilterAny === 'lastMonth') {
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= lastMonthStart && reqDate <= lastMonthEnd;
            });
            periodLabel = 'Last Month';
          } else if (chartTimeFilterAny === 'custom') {
            const customStart = new Date(chartCustomRange.from);
            const customEnd = new Date(chartCustomRange.to);
            filteredForCards = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= customStart && reqDate <= customEnd;
            });
            periodLabel = `${chartCustomRange.from} to ${chartCustomRange.to}`;
          }
          
          // Get comparison period (previous period) for percentage calculation
          let comparisonFilteredRequests: typeof requests = [];
          let comparisonLabel = '';
          
          if (chartTimeFilterAny === 'today') {
            const dayBeforeYesterday = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            comparisonFilteredRequests = requests.filter(r => r.requestDate === yesterday);
            comparisonLabel = 'vs Yesterday';
          } else if (chartTimeFilterAny === 'yesterday') {
            const dayBeforeYesterday = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            comparisonFilteredRequests = requests.filter(r => r.requestDate === dayBeforeYesterday);
            comparisonLabel = 'vs Day Before';
          } else if (chartTimeFilterAny === 'thisWeek') {
            const prevWeekStart = new Date(thisWeekStart);
            prevWeekStart.setDate(thisWeekStart.getDate() - 7);
            const prevWeekEnd = new Date(thisWeekStart);
            prevWeekEnd.setDate(thisWeekStart.getDate() - 1);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= prevWeekStart && reqDate <= prevWeekEnd;
            });
            comparisonLabel = 'vs Last Week';
          } else if (chartTimeFilterAny === 'lastWeek') {
            const weekBefore = new Date(lastWeekStart);
            weekBefore.setDate(lastWeekStart.getDate() - 7);
            const weekBeforeEnd = new Date(lastWeekStart);
            weekBeforeEnd.setDate(lastWeekStart.getDate() - 1);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= weekBefore && reqDate <= weekBeforeEnd;
            });
            comparisonLabel = 'vs Week Before';
          } else if (chartTimeFilterAny === 'thisMonth') {
            // Compare same number of days from last month
            const currentDayOfMonth = now.getDate();
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, currentDayOfMonth);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= prevMonthStart && reqDate <= prevMonthSameDay;
            });
            comparisonLabel = `vs Last Month (Day 1-${currentDayOfMonth})`;
          } else if (chartTimeFilterAny === 'lastMonth') {
            // Get the number of days in last month
            const lastMonthDays = lastMonthEnd.getDate();
            const monthBeforeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            const monthBeforeSameDay = new Date(now.getFullYear(), now.getMonth() - 2, lastMonthDays);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= monthBeforeStart && reqDate <= monthBeforeSameDay;
            });
            comparisonLabel = `vs Month Before (Day 1-${lastMonthDays})`;
          } else if (chartTimeFilterAny === 'custom') {
            const customStart = new Date(chartCustomRange.from);
            const customEnd = new Date(chartCustomRange.to);
            const daysDiff = Math.ceil((customEnd.getTime() - customStart.getTime()) / (1000 * 60 * 60 * 24));
            const comparisonStart = new Date(customStart);
            comparisonStart.setDate(customStart.getDate() - daysDiff - 1);
            const comparisonEnd = new Date(customStart);
            comparisonEnd.setDate(customStart.getDate() - 1);
            comparisonFilteredRequests = requests.filter(r => {
              const reqDate = new Date(r.requestDate);
              return reqDate >= comparisonStart && reqDate <= comparisonEnd;
            });
            comparisonLabel = 'vs Previous Period';
          }
          
          // Calculate totals for current period: requested vs delivered
          const totalsRequested: Record<string, number> = {};
          const totalsDelivered: Record<string, number> = {};
          finishedProducts.forEach(({ camelKey }) => {
            totalsRequested[camelKey] = 0;
            totalsDelivered[camelKey] = 0;
          });
          
          filteredForCards.forEach(req => {
            const isDelivered = req.status === 'delivered' || req.status === 'partially-delivered';
            finishedProducts.forEach(({ camelKey }) => {
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0;
              const requestedQty = newFormat + oldFormat;

              // All requests count as "requested" (the original ask)
              totalsRequested[camelKey] += requestedQty;

              // "Delivered" uses shippedQuantities (the real amount the production house
              // actually shipped) rather than the requested amount - for a
              // partially-shipped/delivered request these differ, and using the requested
              // amount overstated what actually arrived at the store.
              if (isDelivered) {
                const shipped = (req as any).shippedQuantities?.[camelKey];
                const deliveredQty = shipped !== undefined ? shipped : requestedQty;
                totalsDelivered[camelKey] += deliveredQty;
              }
            });
          });
          
          // Calculate totals for comparison period (for percentage)
          const comparisonTotals: Record<string, number> = {};
          finishedProducts.forEach(({ camelKey }) => {
            comparisonTotals[camelKey] = 0;
          });
          
          comparisonFilteredRequests.forEach(req => {
            finishedProducts.forEach(({ camelKey }) => {
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0;
              comparisonTotals[camelKey] += newFormat + oldFormat;
            });
          });
          
          // Accent identifies each momo type (icon badge + fulfillment-bar track tint only,
          // never a full pastel card background) - semantic color (fulfillment health) is
          // kept separate from this, same convention used in Stock Request Analysis.
          const accents = [
            { icon: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
            { icon: 'bg-fuchsia-50 text-fuchsia-600', ring: 'ring-fuchsia-100' },
            { icon: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { icon: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { icon: 'bg-blue-50 text-blue-600', ring: 'ring-blue-100' },
            { icon: 'bg-teal-50 text-teal-600', ring: 'ring-teal-100' },
            { icon: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100' },
            { icon: 'bg-sky-50 text-sky-600', ring: 'ring-sky-100' },
          ];

          const fulfillmentTone = (pct: number | null) => {
            if (pct === null) return { text: 'text-gray-400', bar: 'bg-gray-300' };
            if (pct >= 90) return { text: 'text-emerald-600', bar: 'bg-emerald-500' };
            if (pct >= 60) return { text: 'text-amber-600', bar: 'bg-amber-500' };
            return { text: 'text-red-600', bar: 'bg-red-500' };
          };

          return (
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-500">{periodLabel}</span>
                <span className="text-gray-300">•</span>
                <span className="text-gray-900 font-semibold tabular-nums">{filteredForCards.length}</span>
                <span className="text-gray-500">total requests</span>
              </div>

              {finishedProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No momo types configured yet</p>
                </div>
              ) : filteredForCards.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No stock requests for this period</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {finishedProducts.map((product, index) => {
                    const requested = totalsRequested[product.camelKey] || 0;
                    const delivered = totalsDelivered[product.camelKey] || 0;
                    const comparison = comparisonTotals[product.camelKey] || 0;
                    const accent = accents[index % accents.length];

                    // Calculate percentage change
                    let percentChange = 0;
                    let changeDirection: 'up' | 'down' | 'same' = 'same';
                    if (comparison > 0) {
                      percentChange = ((requested - comparison) / comparison) * 100;
                      if (percentChange > 0) changeDirection = 'up';
                      else if (percentChange < 0) changeDirection = 'down';
                    } else if (requested > 0) {
                      percentChange = 100;
                      changeDirection = 'up';
                    }

                    const fulfillmentPct = requested > 0 ? Math.round((delivered / requested) * 100) : null;
                    const tone = fulfillmentTone(fulfillmentPct);

                    return (
                      <div
                        key={product.camelKey}
                        className="bg-white border border-gray-200 rounded-2xl p-4 transition-all hover:shadow-md hover:border-gray-300"
                      >
                        <div className="flex flex-col gap-4">
                          {/* Header with icon and name */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ring-4 ${accent.icon} ${accent.ring}`}>
                                <Package className="w-4 h-4" />
                              </div>
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {product.label}
                              </div>
                            </div>

                            {/* Percentage badge */}
                            {comparison > 0 && (
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                                changeDirection === 'up' ? 'bg-emerald-50 text-emerald-600' :
                                changeDirection === 'down' ? 'bg-red-50 text-red-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {changeDirection === 'up' && <ArrowUp className="w-3 h-3" />}
                                {changeDirection === 'down' && <ArrowDown className="w-3 h-3" />}
                                {changeDirection === 'same' && <Minus className="w-3 h-3" />}
                                {Math.abs(percentChange).toFixed(0)}%
                              </div>
                            )}
                          </div>

                          {/* Requested vs Delivered numbers */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                              <div className="text-xl font-bold text-gray-900 tabular-nums">
                                {requested.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-gray-500 font-medium">Requested</div>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                              <div className="text-xl font-bold text-gray-900 tabular-nums">
                                {delivered.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-gray-500 font-medium">Delivered</div>
                            </div>
                          </div>

                          {/* Fulfillment bar - a single delivered/requested ratio, color-coded
                              by health, rather than two separate low-information bars. */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Fulfillment</span>
                              <span className={`font-semibold tabular-nums ${tone.text}`}>
                                {fulfillmentPct === null ? '-' : `${fulfillmentPct}%`}
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${tone.bar}`}
                                style={{ width: `${fulfillmentPct === null ? 0 : Math.min(fulfillmentPct, 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* Comparison label */}
                          {comparison > 0 && (
                            <div className="text-[11px] text-gray-400 text-center pt-2 border-t border-gray-100">
                              {comparisonLabel}: {comparison.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        </>
        )}
      </div>
      )}

      {/* Requests List - Grouped by Date */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          {sortedDates.length} Date{sortedDates.length !== 1 ? 's' : ''} with Requests
        </h2>

        {sortedDates.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No production requests found</p>
          </div>
        ) : (
          sortedDates.map((date) => {
            const dateRequests = groupedByDate[date];
            const isExpanded = expandedDates[date];
            const storeCount = new Set(dateRequests.map((r) => r.storeName)).size;
            const totalQuantities = dateRequests.reduce(
              (acc, req) => {
                // Support both new format (chickenMomo) and old format (chickenMomos with 's')
                finishedProducts.forEach(({ camelKey }) => {
                  const newFormat = (req as any)[camelKey] || 0;
                  const oldFormat = (req as any)[camelKey + 's'] || 0;
                  acc[camelKey] = (acc[camelKey] || 0) + newFormat + oldFormat;
                });
                return acc;
              },
              {} as Record<string, number>
            );

            return (
              <div key={date} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-200 hover:shadow-md">
                {/* Collapsible Date Header */}
                <button
                  onClick={() => setExpandedDates({ ...expandedDates, [date]: !isExpanded })}
                  className="w-full p-4 sm:p-6 text-left flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Calendar className="w-6 h-6 text-teal-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">
                        {(() => {
                          // Parse date as local to avoid timezone issues
                          const [year, month, day] = date.split('-').map(Number);
                          const localDate = new Date(year, month - 1, day);
                          return localDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          });
                        })()}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-600">
                        {dateRequests.length} Request{dateRequests.length !== 1 ? 's' : ''} from{' '}
                        {storeCount} Store{storeCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Total Quantities - Always Visible */}
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  <div className="bg-gradient-to-r from-teal-50 to-rose-50 rounded-lg p-3 sm:p-4">
                    <h4 className="text-xs sm:text-sm text-gray-700 mb-3">Total Quantities for this Day</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 sm:gap-3">
                        {totalQuantities.chicken > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-teal-600">{totalQuantities.chicken}</p>
                            <p className="text-xs text-gray-600">Chicken</p>
                          </div>
                        )}
                        {totalQuantities.chickenCheese > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-rose-600">{totalQuantities.chickenCheese}</p>
                            <p className="text-xs text-gray-600">Chicken Cheese</p>
                          </div>
                        )}
                        {totalQuantities.veg > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-green-600">{totalQuantities.veg}</p>
                            <p className="text-xs text-gray-600">Veg</p>
                          </div>
                        )}
                        {totalQuantities.cheeseCorn > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-orange-600">{totalQuantities.cheeseCorn}</p>
                            <p className="text-xs text-gray-600">Cheese Corn</p>
                          </div>
                        )}
                        {totalQuantities.paneer > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-blue-600">{totalQuantities.paneer}</p>
                            <p className="text-xs text-gray-600">Paneer</p>
                          </div>
                        )}
                        {totalQuantities.vegKurkure > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-teal-600">{totalQuantities.vegKurkure}</p>
                            <p className="text-xs text-gray-600">Veg Kurkure</p>
                          </div>
                        )}
                        {totalQuantities.chickenKurkure > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-red-600">{totalQuantities.chickenKurkure}</p>
                            <p className="text-xs text-gray-600">Chicken Kurkure</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Expanded Content - Store Details */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0">
                    {/* Individual Store Requests */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Package className="w-5 h-5 text-teal-600" />
                        Requests by Store
                      </h4>
                      {dateRequests.map((request) => {
                        const isHighlighted = highlightRequestId === request.id;
                        const isPending = request.status === 'pending';
                        const isUrgent = isPending;
                        
                        return (
                          <div 
                            key={request.id} 
                            id={`request-${request.id}`}
                            className={`
                              relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-[1.01]
                              ${isHighlighted 
                                ? 'border-4 border-teal-500 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 shadow-2xl ring-4 ring-teal-300/50' 
                                : isPending
                                ? 'border-4 border-yellow-400 bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-50 shadow-xl'
                                : 'border-2 border-gray-200 bg-white shadow-lg'
                              }
                            `}
                          >
                            {/* Urgency Banner for Pending Requests */}
                            {isPending && (
                              <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 h-2"></div>
                            )}
                            
                            <div className="p-5">
                              {/* Request ID Badge */}
                              <div className="flex items-center justify-between mb-4">
                                <div className={`
                                  px-4 py-2 rounded-full font-semibold shadow-md
                                  ${isPending 
                                    ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-gray-900' 
                                    : 'bg-gradient-to-r from-teal-400 to-rose-400 text-white'
                                  }
                                `}>
                                  <span className="text-sm flex items-center gap-2">
                                    <strong>Request ID:</strong> {request.id.slice(0, 8).toUpperCase()}
                                  </span>
                                </div>
                                {isHighlighted && (
                                  <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-4 py-2 rounded-full text-sm font-bold animate-bounce shadow-lg">
                                    🔔 New Notification
                                  </div>
                                )}
                                {isPending && !isHighlighted && (
                                  <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white px-4 py-2 rounded-full text-sm font-bold animate-pulse shadow-lg">
                                    ⚡ ACTION REQUIRED
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-4 mb-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                    <div className={`
                                      px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 border-3 shadow-lg
                                      ${isPending 
                                        ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-gray-900 border-orange-500' 
                                        : getStatusColor(request.status)
                                      }
                                    `}>
                                      {getStatusIcon(request.status)}
                                      <span className="capitalize text-base">{request.status.replace('-', ' ')}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 text-base font-semibold text-gray-700 bg-white px-4 py-2 rounded-lg shadow-md">
                                      <Store className="w-5 h-5 flex-shrink-0 text-teal-600" />
                                      <span className="truncate">{request.storeName || 'Unknown Store'}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                                  {/* Production Head Actions */}
                                  {isProductionHead && request.status === 'pending' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'accepted')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Accepting...' : 'Accept Request'}
                                  </button>
                                )}

                                {isProductionHead && request.status === 'accepted' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'in-preparation')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Starting...' : 'Start Preparation'}
                                  </button>
                                )}

                                {isProductionHead && request.status === 'in-preparation' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'prepared')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Updating...' : 'Mark as Prepared'}
                                  </button>
                                )}

                                {isProductionHead && request.status === 'prepared' && (
                                  <button
                                    onClick={() => openShippingDialog(request)}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 active:bg-orange-800 transition-colors text-sm font-medium"
                                  >
                                    Mark as Shipped
                                  </button>
                                )}

                                {/* Store In-Charge Actions */}
                                {isStoreIncharge && (request.status === 'shipped' || request.status === 'partially-shipped') && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, request.status === 'partially-shipped' ? 'partially-delivered' : 'delivered')}
                                    disabled={updatingRequestId === request.id}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
                                  >
                                    {updatingRequestId === request.id && (
                                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {updatingRequestId === request.id ? 'Confirming...' : 'Confirm Delivery'}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                              <User className="w-4 h-4" />
                              <span>Requested by: {request.requestedByName || request.requestedBy}</span>
                            </div>

                            {/* Fulfillment Details - shows once shipped: requested vs actually shipped, highlighting shortfalls */}
                            {request.shippedQuantities && (
                              <div
                                id={`fulfillment-${request.id}`}
                                className={`rounded-xl p-5 mb-4 border-2 shadow-lg scroll-mt-24 ${
                                  request.status === 'partially-shipped' || request.status === 'partially-delivered'
                                    ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-300'
                                    : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300'
                                } ${highlightRequestId === request.id ? 'ring-4 ring-orange-400 ring-offset-2' : ''}`}
                              >
                                <h5 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                                  <Truck className="w-5 h-5" />
                                  Fulfillment Details
                                  {(request.status === 'partially-shipped' || request.status === 'partially-delivered') && (
                                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-full">Items Missing</span>
                                  )}
                                </h5>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                  {finishedProducts.map(({ camelKey, label }) => {
                                    const requestedQty = (request as any)[camelKey] || 0;
                                    if (requestedQty === 0) return null;
                                    const shippedQty = request.shippedQuantities?.[camelKey] || 0;
                                    const isShort = shippedQty < requestedQty;
                                    return (
                                      <div key={camelKey} className={`rounded-lg p-3 border-2 ${isShort ? 'bg-red-100 border-red-400' : 'bg-white border-green-200'}`}>
                                        <p className={`text-xs font-semibold ${isShort ? 'text-red-700' : 'text-gray-600'}`}>{label.replace(' Momos', '').replace(' Momo', '')}</p>
                                        <p className={`text-lg font-bold ${isShort ? 'text-red-700' : 'text-green-700'}`}>
                                          {shippedQty} <span className="text-xs font-normal text-gray-500">/ {requestedQty} requested</span>
                                        </p>
                                        {isShort && <p className="text-xs text-red-600 font-medium">Short by {requestedQty - shippedQty}</p>}
                                      </div>
                                    );
                                  })}

                                  {request.kitchenUtilities && Object.entries(request.kitchenUtilities).map(([name, data]) => {
                                    const shippedQty = request.shippedQuantities?.[`kitchenUtility_${name}`] || 0;
                                    const isShort = shippedQty < data.quantity;
                                    return (
                                      <div key={`ku_${name}`} className={`rounded-lg p-3 border-2 ${isShort ? 'bg-red-100 border-red-400' : 'bg-white border-green-200'}`}>
                                        <p className={`text-xs font-semibold ${isShort ? 'text-red-700' : 'text-gray-600'}`}>{name}</p>
                                        <p className={`text-lg font-bold ${isShort ? 'text-red-700' : 'text-green-700'}`}>
                                          {shippedQty} <span className="text-xs font-normal text-gray-500">/ {data.quantity} {data.unit}</span>
                                        </p>
                                        {isShort && <p className="text-xs text-red-600 font-medium">Short by {data.quantity - shippedQty} {data.unit}</p>}
                                      </div>
                                    );
                                  })}

                                  {request.utilities && Object.entries(request.utilities).map(([name, requestedQty]) => {
                                    const shippedQty = request.shippedQuantities?.[`utility_${name}`] || 0;
                                    const isShort = shippedQty < requestedQty;
                                    return (
                                      <div key={`u_${name}`} className={`rounded-lg p-3 border-2 ${isShort ? 'bg-red-100 border-red-400' : 'bg-white border-green-200'}`}>
                                        <p className={`text-xs font-semibold ${isShort ? 'text-red-700' : 'text-gray-600'}`}>{name}</p>
                                        <p className={`text-lg font-bold ${isShort ? 'text-red-700' : 'text-green-700'}`}>
                                          {shippedQty} <span className="text-xs font-normal text-gray-500">/ {requestedQty} pcs</span>
                                        </p>
                                        {isShort && <p className="text-xs text-red-600 font-medium">Short by {requestedQty - shippedQty}</p>}
                                      </div>
                                    );
                                  })}
                                </div>

                                {request.sauces && Object.keys(request.sauces).length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-gray-200">
                                    <p className="text-xs font-semibold text-gray-600 mb-2">Sauces</p>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.keys(request.sauces).map((sauce) => {
                                        const wasShipped = request.shippedSauces ? request.shippedSauces[sauce] : true;
                                        return (
                                          <span
                                            key={sauce}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 ${
                                              wasShipped
                                                ? 'bg-white border-green-200 text-gray-700'
                                                : 'bg-red-100 border-red-400 text-red-700'
                                            }`}
                                          >
                                            {sauce} {!wasShipped && '— Missing'}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {request.shippingNotes && Object.keys(request.shippingNotes).length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-1">
                                    <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
                                    {Object.entries(request.shippingNotes).map(([key, note]) => (
                                      <p key={key} className="text-sm text-gray-700">
                                        <span className="font-medium">{key.replace(/_/g, ' ')}:</span> {note}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Momos Quantities - DYNAMIC */}
                            <div className="bg-gradient-to-br from-blue-50 via-teal-50 to-rose-50 rounded-xl p-4 mb-4 border-2 border-blue-200 shadow-md">
                              <h5 className="text-base font-bold text-blue-800 mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                Momos Quantities
                              </h5>
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
                                {finishedProducts.map(({ camelKey, label }) => {
                                  const quantity = (request as any)[camelKey];
                                  if (!quantity || quantity === 0) return null;
                                  
                                  return (
                                    <div key={camelKey} className="text-center bg-white rounded-lg p-3 shadow-md border-2 border-blue-200 hover:border-blue-400 transition-all transform hover:scale-105">
                                      <p className="text-2xl font-bold text-blue-600">{quantity}</p>
                                      <p className="text-xs font-semibold text-gray-700 mt-1">{label.replace(' Momos', '').replace(' Momo', '')}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Kitchen Utilities */}
                            {request.kitchenUtilities && Object.keys(request.kitchenUtilities).length > 0 && (
                              <div className="bg-gradient-to-br from-teal-100 via-teal-50 to-rose-100 rounded-xl p-5 mb-4 border-2 border-teal-300 shadow-lg">
                                <h5 className="text-base font-bold text-teal-900 mb-4 flex items-center gap-2">
                                  <Utensils className="w-6 h-6 text-teal-700" />
                                  Kitchen Utilities
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {Object.entries(request.kitchenUtilities).map(([item, data]) => (
                                    <div key={item} className="bg-white rounded-lg p-4 shadow-md border-2 border-teal-200 hover:border-teal-400 transition-all transform hover:scale-105">
                                      <p className="text-2xl font-bold text-teal-700 mb-1">{data.quantity} <span className="text-sm font-semibold text-teal-600">{data.unit}</span></p>
                                      <p className="text-sm font-semibold text-gray-800">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sauces */}
                            {request.sauces && Object.keys(request.sauces).length > 0 && (
                              <div className="bg-gradient-to-br from-rose-100 via-rose-50 to-rose-100 rounded-xl p-5 mb-4 border-2 border-rose-300 shadow-lg">
                                <h5 className="text-base font-bold text-rose-900 mb-4 flex items-center gap-2">
                                  <Droplet className="w-6 h-6 text-rose-700" />
                                  Sauces Requested
                                </h5>
                                <div className="flex flex-wrap gap-3">
                                  {Object.keys(request.sauces).map((sauce) => (
                                    <span key={sauce} className="px-5 py-3 bg-gradient-to-r from-rose-400 to-red-400 text-white rounded-xl text-base font-bold shadow-lg hover:shadow-xl transform hover:scale-110 transition-all">
                                      {sauce}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Utilities */}
                            {request.utilities && Object.keys(request.utilities).length > 0 && (
                              <div className="bg-gradient-to-br from-blue-100 via-blue-50 to-blue-100 rounded-xl p-5 mb-4 border-2 border-blue-300 shadow-lg">
                                <h5 className="text-base font-bold text-blue-900 mb-4 flex items-center gap-2">
                                  <Box className="w-6 h-6 text-blue-700" />
                                  Utilities
                                </h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {Object.entries(request.utilities).map(([item, quantity]) => (
                                    <div key={item} className="bg-white rounded-lg p-4 shadow-md border-2 border-blue-200 hover:border-blue-400 transition-all transform hover:scale-105">
                                      <p className="text-2xl font-bold text-blue-700 mb-1">{quantity} <span className="text-sm font-semibold text-blue-600">pcs</span></p>
                                      <p className="text-sm font-semibold text-gray-800">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {request.notes && (
                              <div className="bg-gradient-to-r from-blue-100 to-cyan-100 border-l-4 border-blue-500 p-4 rounded-lg mb-4 shadow-md">
                                <p className="text-base text-gray-900 font-semibold"><span className="text-blue-700">📝 Notes:</span> {request.notes}</p>
                              </div>
                            )}

                            {/* Timeline */}
                            <div className="pt-3 border-t border-gray-200">
                              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                <div>Created: {new Date(request.createdAt).toLocaleString()}</div>
                                {request.acceptedAt && <div>Accepted: {new Date(request.acceptedAt).toLocaleString()}</div>}
                                {request.preparedAt && <div>Prepared: {new Date(request.preparedAt).toLocaleString()}</div>}
                                {request.shippedAt && <div>Shipped: {new Date(request.shippedAt).toLocaleString()}</div>}
                                {request.deliveredAt && <div>Delivered: {new Date(request.deliveredAt).toLocaleString()}</div>}
                              </div>
                            </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      </>
      )}

      {/* Store Stock Recalibration Modal */}
      {showStoreRecalibration && (
        <MonthlyStockRecalibration
          context={context}
          selectedStoreId={singleScopedStoreId}
          onClose={() => setShowStoreRecalibration(false)}
          isProductionHouse={false}
          isStoreFinishedProducts={true}
        />
      )}
      
      {/* Stock Threshold Settings Modal */}
      {showThresholdSettings && (
        <StockThresholdSettings
          storeId={singleScopedStoreId || ''}
          accessToken={context.user?.accessToken || ''}
          thresholds={stockThresholds}
          onClose={() => setShowThresholdSettings(false)}
          onSave={(newThresholds) => {
            setStockThresholds(newThresholds);
            setShowThresholdSettings(false);
          }}
        />
      )}

      {/* Recalibration Reports Modal - relocated here from its own Analytics.tsx sub-tab so
          it lives beside Manage Items instead of a separate window tab. RecalibrationReports
          renders its own content banner but no overlay/close chrome of its own, so this wraps
          it the same way the other modals on this screen wrap their content. */}
      {showRecalibrationReports && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowRecalibrationReports(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end p-3 border-b border-gray-100">
              <button onClick={() => setShowRecalibrationReports(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <RecalibrationReports context={context} selectedStoreId={singleScopedStoreId} locationType="store" />
            </div>
          </div>
        </div>
      )}

      {/* Stock Wastage Modal */}
      {showStockWastageModal && singleScopedStoreId && (
        <StockWastageModal
          context={context}
          storeId={singleScopedStoreId}
          finishedProducts={finishedProducts}
          onClose={() => setShowStockWastageModal(false)}
        />
      )}

      {/* Recent Request detail popup - tapping a Recent Requests card surfaces the full
          breakdown (quantities, kitchen utilities, sauces, utilities, timeline, shortages)
          instead of the card just sitting there un-clickable. */}
      {selectedRecentRequest && (() => {
        const req = selectedRecentRequest;
        const meta = requestStatusMeta[req.status] || requestStatusMeta.pending;
        const itemRows = finishedProducts
          .map(({ camelKey, label }) => ({ label, requested: getRequestedQty(req, camelKey), shipped: (req as any).shippedQuantities?.[camelKey] }))
          .filter(r => r.requested > 0);
        const kitchenUtilEntries = Object.entries(req.kitchenUtilities || {});
        const sauceNames = Object.keys(req.sauces || {}).filter(s => (req.sauces as any)[s]);
        const utilityEntries = Object.entries(req.utilities || {});
        const shippingNoteEntries = Object.entries(req.shippingNotes || {});
        const timeline: { label: string; at?: string }[] = [
          { label: 'Created', at: req.createdAt },
          { label: 'Accepted', at: req.acceptedAt },
          { label: 'Prepared', at: req.preparedAt },
          { label: 'Shipped', at: req.shippedAt },
          { label: 'Delivered', at: req.deliveredAt },
        ].filter(t => t.at);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRecentRequest(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-600 to-red-600 p-5 text-white rounded-t-2xl flex items-start justify-between gap-3">
                <div>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-2 bg-white ${meta.className}`}>
                    {meta.label}
                  </span>
                  <h3 className="text-lg font-semibold">
                    {new Date(req.requestDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </h3>
                </div>
                <button type="button" onClick={() => setSelectedRecentRequest(null)} className="flex-shrink-0 p-1 hover:bg-white/20 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {itemRows.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Momo Quantities</h4>
                    <div className="space-y-1">
                      {itemRows.map(r => (
                        <div key={r.label} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{r.label}</span>
                          <span className="font-medium text-gray-900">
                            {r.shipped !== undefined && r.shipped !== r.requested
                              ? <span className="text-red-600">{r.shipped} / {r.requested} requested</span>
                              : `${r.requested}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {kitchenUtilEntries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Kitchen Utilities</h4>
                    <div className="space-y-1">
                      {kitchenUtilEntries.map(([name, val]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{name}</span>
                          <span className="font-medium text-gray-900">{val.quantity} {val.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sauceNames.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Sauces Requested</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {sauceNames.map(s => (
                        <span key={s} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {utilityEntries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Utilities</h4>
                    <div className="space-y-1">
                      {utilityEntries.map(([name, qty]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{name}</span>
                          <span className="font-medium text-gray-900">{qty} pcs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {req.notes && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Notes</h4>
                    <p className="text-sm text-gray-600">{req.notes}</p>
                  </div>
                )}

                {shippingNoteEntries.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-red-800 mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Shortage Notes
                    </h4>
                    <div className="space-y-0.5">
                      {shippingNoteEntries.map(([key, note]) => (
                        <p key={key} className="text-xs text-red-700"><span className="font-medium">{key}:</span> {note}</p>
                      ))}
                    </div>
                  </div>
                )}

                {timeline.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Timeline</h4>
                    <div className="space-y-1">
                      {timeline.map(t => (
                        <div key={t.label} className="flex items-center justify-between text-xs text-gray-500">
                          <span>{t.label}</span>
                          <span>{new Date(t.at!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedRecentRequest(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Review-before-submit popup - date + full summary, with a checkbox that must be
          ticked before Confirm & Submit is enabled. Runs before the duplicate-date check
          and the actual API call, both handled in handleConfirmAndSubmit. */}
      {showSubmitConfirm && isStoreIncharge && (() => {
        const itemRows = finishedProducts
          .map(({ camelKey, label }) => ({ label, qty: momoQuantities[camelKey] || 0 }))
          .filter(r => r.qty > 0);
        const kitchenUtilEntries = Object.entries(kitchenUtilities);
        const sauceNames = Object.keys(sauces).filter(s => sauces[s]);
        const utilityEntries = Object.entries(utilities);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-orange-600 to-red-600 p-5 text-white rounded-t-2xl">
                <p className="text-xs uppercase tracking-wide text-orange-100 mb-1">Review before submitting</p>
                <h3 className="text-lg font-semibold">
                  {new Date(requestDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </h3>
                {storeDisplayName && <p className="text-sm text-orange-50 mt-0.5">{storeDisplayName}</p>}
              </div>

              <div className="p-5 space-y-3">
                <div className="rounded-lg border-2 border-teal-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-teal-900 bg-teal-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    Momo Quantities
                  </h4>
                  <div className="p-3 bg-white">
                    {itemRows.length > 0 ? (
                      <div className="space-y-1">
                        {itemRows.map(r => (
                          <div key={r.label} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{r.label}</span>
                            <span className="font-semibold text-gray-900">{r.qty}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None added</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-teal-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-teal-900 bg-teal-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    Kitchen Utilities
                  </h4>
                  <div className="p-3 bg-white">
                    {kitchenUtilEntries.length > 0 ? (
                      <div className="space-y-1">
                        {kitchenUtilEntries.map(([name, val]) => (
                          <div key={name} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{name}</span>
                            <span className="font-semibold text-gray-900">{val.quantity} {val.unit}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None added</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-rose-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-rose-900 bg-rose-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    Sauces
                  </h4>
                  <div className="p-3 bg-white">
                    {sauceNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {sauceNames.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None selected</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-blue-100 overflow-hidden">
                  <h4 className="text-sm font-bold text-blue-900 bg-blue-50 px-3 py-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    Utilities
                  </h4>
                  <div className="p-3 bg-white">
                    {utilityEntries.length > 0 ? (
                      <div className="space-y-1">
                        {utilityEntries.map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{name}</span>
                            <span className="font-semibold text-gray-900">{qty} pcs</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">None added</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border-2 border-gray-200 overflow-hidden">
                  <h4 className="text-sm font-bold text-gray-800 bg-gray-50 px-3 py-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    Notes
                  </h4>
                  <div className="p-3 bg-white">
                    <p className="text-sm text-gray-600">{notes || <span className="text-gray-400 italic">No notes added</span>}</p>
                  </div>
                </div>

                <label className="flex items-start gap-3 p-3 bg-gray-50 border-2 border-gray-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={submitConfirmChecked}
                    onChange={(e) => setSubmitConfirmChecked(e.target.checked)}
                    className="w-5 h-5 mt-0.5 text-orange-600 rounded focus:ring-orange-500 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700">I've checked the date and quantities above and they're correct.</span>
                </label>
              </div>

              <div className="p-4 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  disabled={!submitConfirmChecked || submitting}
                  onClick={handleConfirmAndSubmit}
                  className="px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-semibold"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirm & Submit
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Duplicate Same-Date Request Confirmation */}
      {showDuplicateDateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-amber-500 p-6 text-white rounded-t-2xl flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <h3 className="text-xl font-bold">Duplicate Request Date</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700">
                You already have a stock request submitted for{' '}
                <span className="font-semibold">
                  {new Date(requestDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                . Are you sure you want to submit another request for the same date?
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-b-2xl flex flex-col sm:flex-row justify-end gap-2">
              <button
                onClick={() => setShowDuplicateDateConfirm(false)}
                disabled={submitting}
                className="px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={performSubmitRequest}
                disabled={submitting}
                className="px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Yes, Submit Anyway'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plate Configuration Modal */}
      {showPlateConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-stone-800 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Plate Configuration</h3>
                  <p className="text-sm text-blue-100">Set how many momos are in each plate</p>
                </div>
                <button
                  onClick={() => setShowPlateConfigModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Explanation */}
            <div className="p-6 bg-blue-50 border-b-2 border-blue-200">
              <h3 className="text-gray-900 font-semibold mb-2">How it works:</h3>
              <p className="text-sm text-gray-700">
                Stock will be displayed as both pieces and plates. For example, if you have 170 momos and each plate contains 6 momos, 
                it will show as <span className="font-mono bg-white px-2 py-1 rounded">170 pcs / 28 plates</span>.
              </p>
            </div>

            {/* Input */}
            <div className="p-6">
              <label className="text-gray-900 font-semibold mb-3 block">
                Momos Per Plate
              </label>
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-4">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={momosPerPlate}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 6;
                    setMomosPerPlate(value);
                    localStorage.setItem('momosPerPlate', value.toString());
                  }}
                  className="w-full px-4 py-3 border-2 border-blue-400 rounded-lg focus:border-blue-600 focus:outline-none text-center text-2xl font-bold text-blue-900"
                />
                <p className="text-center text-sm text-blue-700 mt-2">pieces per plate</p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowPlateConfigModal(false)}
                className="px-6 py-2.5 bg-stone-800 text-white rounded-xl hover:bg-stone-900 transition-all shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Confirmation Dialog */}
      {showShippingDialog && shippingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-orange-500 to-rose-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Truck className="w-6 h-6" />
                    Confirm Shipping Details
                  </h2>
                  <p className="text-orange-100 mt-1">
                    Verify quantities and add notes for any changes
                  </p>
                </div>
                <button
                  onClick={() => setShowShippingDialog(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-220px)]">
              <div className="space-y-6">
                {/* Momos Section */}
                {Object.entries(shippedQuantities).filter(([key]) => 
                  !key.startsWith('kitchenUtility_') && !key.startsWith('utility_')
                ).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Momos</h3>
                    <div className="space-y-3">
                      {Object.entries(shippedQuantities)
                        .filter(([key]) => !key.startsWith('kitchenUtility_') && !key.startsWith('utility_'))
                        .map(([key, qty]) => {
                          const requestedQty = (shippingRequest as any)[key] || 0;
                          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                          const isDifferent = qty !== requestedQty;
                          
                          return (
                            <div key={key} className={`border rounded-lg p-4 ${isDifferent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-4">
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {label}
                                    <span className="ml-2 text-xs text-gray-500">(Requested: {requestedQty})</span>
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={qty}
                                    onChange={(e) => setShippedQuantities({
                                      ...shippedQuantities,
                                      [key]: parseInt(e.target.value) || 0
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  />
                                </div>
                                {isDifferent && (
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-amber-700 mb-1">
                                      Reason for difference *
                                    </label>
                                    <input
                                      type="text"
                                      value={shippingNotes[key] || ''}
                                      onChange={(e) => setShippingNotes({
                                        ...shippingNotes,
                                        [key]: e.target.value
                                      })}
                                      placeholder="e.g., Insufficient stock"
                                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Kitchen Utilities Section */}
                {Object.entries(shippedQuantities).filter(([key]) => 
                  key.startsWith('kitchenUtility_')
                ).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Kitchen Utilities</h3>
                    <div className="space-y-3">
                      {Object.entries(shippedQuantities)
                        .filter(([key]) => key.startsWith('kitchenUtility_'))
                        .map(([key, qty]) => {
                          const utilityName = key.replace('kitchenUtility_', '');
                          const requestedQty = shippingRequest.kitchenUtilities?.[utilityName]?.quantity || 0;
                          const unit = shippingRequest.kitchenUtilities?.[utilityName]?.unit || '';
                          const isDifferent = qty !== requestedQty;
                          
                          return (
                            <div key={key} className={`border rounded-lg p-4 ${isDifferent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-4">
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {utilityName}
                                    <span className="ml-2 text-xs text-gray-500">(Requested: {requestedQty} {unit})</span>
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="number"
                                      min="0"
                                      value={qty}
                                      onChange={(e) => setShippedQuantities({
                                        ...shippedQuantities,
                                        [key]: parseFloat(e.target.value) || 0
                                      })}
                                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                    <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                                      {unit}
                                    </span>
                                  </div>
                                </div>
                                {isDifferent && (
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-amber-700 mb-1">
                                      Reason for difference *
                                    </label>
                                    <input
                                      type="text"
                                      value={shippingNotes[key] || ''}
                                      onChange={(e) => setShippingNotes({
                                        ...shippingNotes,
                                        [key]: e.target.value
                                      })}
                                      placeholder="e.g., Insufficient stock"
                                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Utilities Section */}
                {Object.entries(shippedQuantities).filter(([key]) => 
                  key.startsWith('utility_')
                ).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Utilities</h3>
                    <div className="space-y-3">
                      {Object.entries(shippedQuantities)
                        .filter(([key]) => key.startsWith('utility_'))
                        .map(([key, qty]) => {
                          const utilityName = key.replace('utility_', '');
                          const requestedQty = shippingRequest.utilities?.[utilityName] || 0;
                          const isDifferent = qty !== requestedQty;
                          
                          return (
                            <div key={key} className={`border rounded-lg p-4 ${isDifferent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                              <div className="flex items-start gap-4">
                                <div className="flex-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {utilityName}
                                    <span className="ml-2 text-xs text-gray-500">(Requested: {requestedQty} pcs)</span>
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={qty}
                                    onChange={(e) => setShippedQuantities({
                                      ...shippedQuantities,
                                      [key]: parseInt(e.target.value) || 0
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  />
                                </div>
                                {isDifferent && (
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium text-amber-700 mb-1">
                                      Reason for difference *
                                    </label>
                                    <input
                                      type="text"
                                      value={shippingNotes[key] || ''}
                                      onChange={(e) => setShippingNotes({
                                        ...shippingNotes,
                                        [key]: e.target.value
                                      })}
                                      placeholder="e.g., Insufficient stock"
                                      className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-white"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Sauces Section */}
                {shippingRequest.sauces && Object.keys(shippingRequest.sauces).length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 mb-3">Sauces</h3>
                    <p className="text-sm text-gray-500 mb-3">Untick any sauce that could not be included in this shipment.</p>
                    <div className="flex flex-wrap gap-3">
                      {Object.keys(shippingRequest.sauces).map((sauce) => {
                        const isIncluded = shippedSauces[sauce] ?? true;
                        return (
                          <label
                            key={sauce}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                              isIncluded ? 'border-gray-200 bg-white' : 'border-red-300 bg-red-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={(e) => setShippedSauces({
                                ...shippedSauces,
                                [sauce]: e.target.checked
                              })}
                              className="w-4 h-4 text-rose-600 rounded"
                            />
                            <span className={`text-sm font-medium ${isIncluded ? 'text-gray-700' : 'text-red-700'}`}>
                              {sauce}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Responsibility Checkbox */}
                <div className="border-t border-gray-200 pt-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shippingResponsibility}
                      onChange={(e) => setShippingResponsibility(e.target.checked)}
                      className="mt-1 w-5 h-5 text-orange-600 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">
                      <strong className="text-gray-900">I confirm that I am responsible for shipping these items</strong> and have verified the quantities above. I understand that any discrepancies must be documented with a valid reason.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowShippingDialog(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleShipRequest}
                disabled={!shippingResponsibility}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-lg hover:from-orange-600 hover:to-rose-600 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Shipping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
