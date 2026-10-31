// Insights > Items > daily sales data: momo pieces sold by type (from the POS sync or an
// uploaded sales file), the price each channel really pays per piece, the weekly pattern and
// the day records. Layout: one primary action (Sync from POS for the cluster head, Upload for
// everyone else) with the rest in the overflow menu, a period chip, then headline → chart →
// breakdown list. Long explanations sit behind "How it works"; tables only from 1024 px.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Card } from './ui/card';
import { confirm } from './ui/confirm';
import { FilterChips } from './ui/chip';
import { EmptyState } from './ui/empty-state';
import { Field, controlClasses } from './ui/field';
import { ListGroup, ListRow } from './ui/list-row';
import { formatNumberIN } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { Delayed, SkeletonListRows, SkeletonStatTile } from './ui/skeleton';
import { StatGrid, StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { cn } from './ui/utils';
import { addDaysISO, friendlyDateLabel, presetLabel, shortDateLabel, type RangePreset } from './ui/date-utils';
import { Upload, Calendar, TrendingUp, Trash2, FileSpreadsheet, Settings, ArrowUp, ArrowDown, RefreshCw, Plus, Tags, Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { getAssignedStoreIds } from '../utils/entityAccess';
import { getTodayIST } from '../utils/timezone';
import { useT } from '../utils/i18n';
import { HowItWorks, MiniFigures, OverflowMenu, PeriodChip, SectionHeading } from './insights/parts/common';
import { CHART_COLORS, ChartCard, TrendChart, legendFor } from './insights/tabs/shared';

interface SalesDataProps {
  context: InventoryContextType;
  selectedStoreId?: string | null;
}

interface CategoryData {
  'Chicken Momos': number;
  'Chicken Cheese Momos': number;
  'Veg Momos': number;
  'Paneer Momos': number;
  'Corn Cheese Momos': number;
  'Chicken Kurkure Momos': number;
  'Veg Kurkure Momos': number;
}

// Shared between RULE 1 (Mania Combo) and RULE 4 (standard items) below, so both classify
// an item's momo filling the exact same way.
const NON_MOMO_KEYWORDS = ['drink', 'cola', 'campa', 'water', 'beverage', 'soup', 'samosa', 'nugget', 'popcorn', 'fries', 'mojito', 'mocktail', 'cake'];

function classifyMomoCategory(nameLower: string): keyof CategoryData | null {
  if (NON_MOMO_KEYWORDS.some((x) => nameLower.includes(x))) return null;
  if (nameLower.includes('kurkure')) {
    if (nameLower.includes('chicken')) return 'Chicken Kurkure Momos';
    if (nameLower.includes('veg')) return 'Veg Kurkure Momos';
    return null;
  }
  if (nameLower.includes('paneer')) return 'Paneer Momos';
  if (nameLower.includes('corn') && nameLower.includes('cheese')) return 'Corn Cheese Momos';
  if (nameLower.includes('chicken') && nameLower.includes('cheese')) return 'Chicken Cheese Momos';
  if (nameLower.includes('chicken')) return 'Chicken Momos';
  // "Non Veg" holds "veg" (31 Oct 2026 stock check; posItemClassifier.tsx the same).
  if (/non[\s-]*veg/.test(nameLower)) return 'Chicken Momos';
  if (nameLower.includes('veg')) return 'Veg Momos';
  return null;
}

// Per-channel (POS/Zomato/Swiggy/...) pieces + real revenue for a momo category, straight
// from Ciferon's per-product PlatformList - only present on pos-sync-originated records.
type ChannelBreakdown = Record<keyof CategoryData, Record<string, { pieces: number; revenue: number }>>;

// Mirrors the backend's posItemClassifier.tsx extractPiecesPerUnit exactly, so per-order
// item detail (Step D) is turned into piece counts the same way Step B's category totals are.
function extractPiecesPerUnit(productName: string): number {
  const nameLower = productName.toLowerCase();
  const pcsMatch = productName.match(/(\d+)\s*(?:pcs|pieces|piece|pc)\b/i);

  if (nameLower.includes('mania') && nameLower.includes('combo')) {
    // Every Mania Combo unit (bracketed "[N Pieces, Pack Of 2]" naming or plain) is the
    // same composition: 8 direct momos + 2 moburgers x 2 momos each = 12 momos of that
    // type. The leading number in "[N Pieces, ...]" describes something else about the
    // combo's packaging, not a repeat-multiplier of the whole combo - one combo unit is
    // always 12 momos regardless of that bracket text.
    return 8 + 2 * 2;
  }
  if (nameLower.includes('burger')) {
    const burgersPerPlate = pcsMatch ? parseInt(pcsMatch[1]) : 1;
    return burgersPerPlate * 2;
  }
  if (pcsMatch) {
    let count = parseInt(pcsMatch[1]);
    const packMatch = productName.match(/pack of\s*(\d+)/i);
    if (packMatch) count *= parseInt(packMatch[1]);
    return count;
  }
  return 6;
}

// Per-menu-item detail (e.g. "Chicken Steamed Momos" kept separate from "Chicken Afghani
// Momos", not collapsed into "Chicken Momos") - only present on pos-sync-originated records.
type ProductBreakdownEntry = { productName: string; category: keyof CategoryData | null; quantity: number; pieces: number };

interface SalesRecord {
  id: string;
  date: string;
  storeId: string;
  storeName?: string;
  data: CategoryData;
  channelBreakdown?: ChannelBreakdown;
  productBreakdown?: ProductBreakdownEntry[];
  uploadedBy: string;
  uploadedAt: string;
}

type TimeFilter = 'today' | 'yesterday' | 'thisWeek' | 'previousWeek' | 'thisMonth' | 'previousMonth' | 'thisYear' | 'lastYear' | 'custom';

// The shared period chip's presets mapped onto this screen's own filter keys (the screen keeps
// its own date maths). "Previous week" and "Last year" aren't chip presets; a custom range
// covers them.
const SALES_PERIOD_OPTIONS: Partial<Record<RangePreset, TimeFilter>> = {
  today: 'today', yesterday: 'yesterday', thisWeek: 'thisWeek', thisMonth: 'thisMonth', lastMonth: 'previousMonth', thisYear: 'thisYear', custom: 'custom',
};
const RECORDS_SHOWN = 10;
const RECORDS_PERIOD_OPTIONS: Partial<Record<RangePreset, TimeFilter>> = {
  today: 'today', yesterday: 'yesterday', thisWeek: 'thisWeek', thisMonth: 'thisMonth', lastMonth: 'previousMonth', custom: 'custom',
};

// Default pieces per plate for each momo type
const DEFAULT_PIECES_PER_PLATE: Record<keyof CategoryData, number> = {
  'Chicken Momos': 6,
  'Chicken Cheese Momos': 6,
  'Veg Momos': 6,
  'Paneer Momos': 6,
  'Corn Cheese Momos': 6,
  'Chicken Kurkure Momos': 6,
  'Veg Kurkure Momos': 6
};

const DEFAULT_PRICE_PER_PLATE: Record<keyof CategoryData, number> = {
  'Chicken Momos': 0,
  'Chicken Cheese Momos': 0,
  'Veg Momos': 0,
  'Paneer Momos': 0,
  'Corn Cheese Momos': 0,
  'Chicken Kurkure Momos': 0,
  'Veg Kurkure Momos': 0
};

export function SalesData({ context, selectedStoreId }: SalesDataProps) {
  const { t, lang } = useT();
  const [showUpload, setShowUpload] = useState(false);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIST());
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: getTodayIST()
  });
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(new Date().getDay()); // 0-6 for Sun-Sat
  const [showPlateConfig, setShowPlateConfig] = useState(false);
  const [showMenuItemPrices, setShowMenuItemPrices] = useState(false);
  // Sort control for the "Revenue Per Item By Channel" table below - by total pieces or
  // by one channel's own pieces, either direction.
  const [itemChannelSort, setItemChannelSort] = useState<{ col: 'pcs' | 'offline' | 'zomato' | 'swiggy'; dir: 'asc' | 'desc' }>({ col: 'pcs', dir: 'desc' });
  const [piecesPerPlate, setPiecesPerPlate] = useState<Record<keyof CategoryData, number>>(DEFAULT_PIECES_PER_PLATE);
  const [pricePerPlate, setPricePerPlate] = useState<Record<keyof CategoryData, number>>(DEFAULT_PRICE_PER_PLATE);
  const [isSavingPlateConfig, setIsSavingPlateConfig] = useState(false);
  const [collapsedRecords, setCollapsedRecords] = useState<Set<string>>(new Set());
  const hasSeededCollapse = useRef(false);
  // Date filter for the "Sales Records" list below - without this it rendered every record
  // ever uploaded, expanded, in one indefinitely-scrolling list.
  const [recordsDateFilter, setRecordsDateFilter] = useState<TimeFilter>('thisMonth');
  const [recordsCustomRange, setRecordsCustomRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: getTodayIST(),
  });
  const [showRecordsFilter, setShowRecordsFilter] = useState(false);

  const selectedConcreteStoreId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : null;
  const isClusterHead = context.user?.role === 'cluster_head';
  const isAudit = context.user?.role === 'audit';
  const isProductionIncharge = context.user?.designation === 'production_incharge';
  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isOperationsManager = context.user?.role === 'manager' && !isProductionIncharge && !isStoreIncharge;

  // Production incharges can have user.storeId set to a production-house id. This module
  // displays store sales, so resolve a real store scope before filtering records/detail.
  const scopedStoreIds = useMemo<string[] | null>(() => {
    if (selectedConcreteStoreId) return [selectedConcreteStoreId];
    const assigned = getAssignedStoreIds(context.user, context.stores || []);
    if (assigned.length > 0) return assigned;
    if (isClusterHead || isAudit || isOperationsManager) return null;
    return [];
  }, [selectedConcreteStoreId, context.user, context.stores, isClusterHead, isAudit, isOperationsManager]);

  const scopedStoreIdSet = useMemo(() => scopedStoreIds ? new Set(scopedStoreIds) : null, [scopedStoreIds]);
  const storeScopeKey = scopedStoreIds === null ? 'all' : scopedStoreIds.join('|');
  const matchesStoreScope = (storeId?: string | null) => !scopedStoreIdSet || (!!storeId && scopedStoreIdSet.has(storeId));
  const effectiveStoreId = scopedStoreIds && scopedStoreIds.length === 1 ? scopedStoreIds[0] : null;

  // Toggle collapse state for a record
  const toggleRecordCollapse = (recordId: string) => {
    setCollapsedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  // Load plate configuration (pieces + selling price per plate) from the backend on mount -
  // shared across everyone (store incharge here, Analytics' Category Sales elsewhere),
  // not per-browser like the old localStorage version was.
  useEffect(() => {
    if (!context.user?.accessToken) return;
    api.getMomoPlateConfig(context.user.accessToken).then((config) => {
      const pieces = { ...DEFAULT_PIECES_PER_PLATE };
      const price = { ...DEFAULT_PRICE_PER_PLATE };
      (Object.keys(pieces) as Array<keyof CategoryData>).forEach((category) => {
        if (config[category]) {
          pieces[category] = config[category].piecesPerPlate ?? pieces[category];
          price[category] = config[category].pricePerPlate ?? price[category];
        }
      });
      setPiecesPerPlate(pieces);
      setPricePerPlate(price);
    }).catch((e) => console.error('Failed to load plate config:', e));
  }, [context.user?.accessToken]);

  const savePlateConfigToBackend = async (pieces: typeof piecesPerPlate, price: typeof pricePerPlate) => {
    if (!context.user?.accessToken) return;
    setIsSavingPlateConfig(true);
    try {
      const config: Record<string, { piecesPerPlate: number; pricePerPlate: number }> = {};
      (Object.keys(pieces) as Array<keyof CategoryData>).forEach((category) => {
        config[category] = { piecesPerPlate: pieces[category], pricePerPlate: price[category] };
      });
      await api.saveMomoPlateConfig(context.user.accessToken, config);
    } catch (e) {
      console.error('Failed to save plate config:', e);
      toast.error('Failed to save plate configuration');
    } finally {
      setIsSavingPlateConfig(false);
    }
  };

  const updatePlateConfig = (category: keyof CategoryData, pieces: number) => {
    const newConfig = { ...piecesPerPlate, [category]: pieces };
    setPiecesPerPlate(newConfig);
    savePlateConfigToBackend(newConfig, pricePerPlate);
  };

  const updatePriceConfig = (category: keyof CategoryData, price: number) => {
    const newConfig = { ...pricePerPlate, [category]: price };
    setPricePerPlate(newConfig);
    savePlateConfigToBackend(piecesPerPlate, newConfig);
  };

  useEffect(() => {
    loadSalesData();
  }, [storeScopeKey]);

  // Collapse every record the first time data loads, so the list opens compact instead of
  // fully expanded. Only seeds once - doesn't fight the user's own expand/collapse choices
  // on later refreshes.
  useEffect(() => {
    if (!hasSeededCollapse.current && salesRecords.length > 0) {
      setCollapsedRecords(new Set(salesRecords.map(r => r.id)));
      hasSeededCollapse.current = true;
    }
  }, [salesRecords]);

  // Real per-item Offline vs Online prices, keyed by Ciferon's ProductId - lets profitability
  // figures use each item's actual price per channel instead of one manual price per momo
  // category. Seeded from the store's real Ciferon POS export + Online Submenu export;
  // editable here since menu prices change and a few items needed manual correction.
  const [menuItemPrices, setMenuItemPrices] = useState<api.MenuItemPrice[]>([]);
  const [isSavingMenuPrice, setIsSavingMenuPrice] = useState<string | null>(null);
  // New-item form for a productId Ciferon has never sent a price catalog entry for yet -
  // the modal below only ever showed items that already had a menuItemPrices record, with
  // no way to add one that didn't exist (e.g. a "-A" alternate-portion SKU Zomato/Ciferon
  // introduced after the catalog was first seeded), so Channel Economics would silently
  // exclude every order containing it forever with no way to fix it from this page.
  const [showAddMenuItem, setShowAddMenuItem] = useState(false);
  const [newMenuItem, setNewMenuItem] = useState({
    productId: '', productName: '', momoCategory: 'Chicken Momos' as keyof CategoryData, piecesPerUnit: '6', offlinePrice: '', onlinePrice: '',
  });
  const [isSavingNewMenuItem, setIsSavingNewMenuItem] = useState(false);
  const loadMenuItemPrices = useCallback(async () => {
    if (!context.user?.accessToken) return;
    try {
      const items = await api.getMenuItemPrices(context.user.accessToken);
      setMenuItemPrices(items);
    } catch {
      // leave existing state as-is
    }
  }, [context.user?.accessToken]);
  useEffect(() => { loadMenuItemPrices(); }, [loadMenuItemPrices]);

  const handleMenuPriceChange = async (item: api.MenuItemPrice, field: 'offlinePrice' | 'onlinePrice', value: number) => {
    if (!context.user?.accessToken) return;
    const updated = { ...item, [field]: value };
    setMenuItemPrices(prev => prev.map(i => i.productId === item.productId ? updated : i));
    setIsSavingMenuPrice(item.productId);
    try {
      await api.saveMenuItemPrice(context.user.accessToken, {
        productId: updated.productId,
        productName: updated.productName,
        momoCategory: updated.momoCategory,
        piecesPerUnit: updated.piecesPerUnit,
        offlinePrice: updated.offlinePrice,
        onlinePrice: updated.onlinePrice,
      });
    } catch (e) {
      console.error('Failed to save menu item price:', e);
      toast.error(`Failed to save price for ${item.productName}`);
    } finally {
      setIsSavingMenuPrice(null);
    }
  };

  const handleAddMenuItem = async () => {
    if (!context.user?.accessToken) return;
    const productId = newMenuItem.productId.trim();
    const productName = newMenuItem.productName.trim();
    if (!productId || !productName) {
      toast.error('Product ID and Product Name are required');
      return;
    }
    if (menuItemPrices.some(i => i.productId === productId)) {
      toast.error(`Product ID ${productId} already exists - edit it in the list below instead`);
      return;
    }
    setIsSavingNewMenuItem(true);
    try {
      const saved = await api.saveMenuItemPrice(context.user.accessToken, {
        productId,
        productName,
        momoCategory: newMenuItem.momoCategory,
        piecesPerUnit: parseInt(newMenuItem.piecesPerUnit, 10) || 6,
        offlinePrice: parseFloat(newMenuItem.offlinePrice) || 0,
        onlinePrice: parseFloat(newMenuItem.onlinePrice) || 0,
      });
      setMenuItemPrices(prev => [...prev, saved]);
      setNewMenuItem({ productId: '', productName: '', momoCategory: newMenuItem.momoCategory, piecesPerUnit: '6', offlinePrice: '', onlinePrice: '' });
      setShowAddMenuItem(false);
      toast.success(`Added ${productName}`);
    } catch (e) {
      console.error('Failed to add menu item:', e);
      toast.error(`Failed to add ${productName}`);
    } finally {
      setIsSavingNewMenuItem(false);
    }
  };

  // Aggregator settlements - used to work out a blended commission rate for whatever
  // period is currently selected, for the profitability-after-commission breakdown below.
  // Now sourced from shared context (see the Analytics page redesign) instead of an
  // independent fetch, scoped to this store client-side.
  const aggregatorSettlements = useMemo(
    () => scopedStoreIds !== null
      ? context.aggregatorSettlements.filter(s => matchesStoreScope(s.storeId))
      : context.aggregatorSettlements,
    [context.aggregatorSettlements, scopedStoreIdSet]
  );

  // Per-order item detail synced by Step D of runPosSync (Ciferon's OrderReport/Sale) -
  // real momo content of every order, keyed to ExternalId, so it can be joined against an
  // uploaded aggregator settlement's own per-order payout for an exact (not estimated)
  // effective price per momo type. Loaded for the currently selected period.
  const [orderItemDetail, setOrderItemDetail] = useState<api.OrderItemDetailRecord[]>([]);
  const loadOrderItemDetail = useCallback(async () => {
    if (!context.user?.accessToken) return;
    const { start, end } = getDateRange(timeFilter, timeFilter === 'custom' ? dateRange : undefined);
    try {
      const records = await api.getOrderItemDetail(context.user.accessToken, {
        storeId: effectiveStoreId || undefined,
        startDate: start,
        endDate: end,
      });
      setOrderItemDetail(scopedStoreIds !== null ? records.filter(r => matchesStoreScope(r.storeId)) : records);
    } catch {
      // leave existing state as-is
    }
  }, [context.user?.accessToken, effectiveStoreId, storeScopeKey, timeFilter, dateRange]);
  useEffect(() => { loadOrderItemDetail(); }, [loadOrderItemDetail]);

  // Pulls momo-category sales for the selected period straight from Ciferon (via the same
  // POS sync used for cash/Paytm figures elsewhere), instead of requiring a manual XLSX
  // upload for every day. Cluster-head only (matches the backfill route's own gate).
  const [isSyncingCategoryData, setIsSyncingCategoryData] = useState(false);
  const handleSyncFromPOS = async () => {
    if (!context.user?.accessToken) return;
    const { start, end } = getDateRange(timeFilter, timeFilter === 'custom' ? dateRange : undefined);
    if (!start || !end) return;
    setIsSyncingCategoryData(true);
    try {
      let cursor = new Date(`${start}T00:00:00Z`);
      const last = new Date(`${end}T00:00:00Z`);
      let successCount = 0;
      while (cursor <= last) {
        const date = cursor.toISOString().substring(0, 10);
        try {
          await api.backfillPosSync(context.user.accessToken, date);
          successCount++;
        } catch (e) {
          console.error(`Failed to sync category data for ${date}:`, e);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      toast.success(`Synced ${successCount} day(s) from POS`);
      await Promise.all([loadSalesData(), loadOrderItemDetail()]);
    } finally {
      setIsSyncingCategoryData(false);
    }
  };

  const loadSalesData = async () => {
    try {
      setLoading(true);
      const response = await api.getSalesData(context.user?.accessToken || '');

      let records: SalesRecord[] = response.data || [];

      // Filter out null/undefined records and ensure storeId exists
      records = records.filter(r => !!r && !!r.storeId);

      // Filter by resolved store scope if needed
      if (scopedStoreIds !== null) {
        records = records.filter(r => matchesStoreScope(r.storeId));
      }

      // Sort by date descending
      records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setSalesRecords(records);
    } catch (error) {
      console.error('Error loading sales data:', error);
      toast.error('Failed to load sales data');
    } finally {
      setLoading(false);
    }
  };

  // Process XLSX file using the Python logic
  const processXLSXFile = async (file: File): Promise<CategoryData> => {
    // The spreadsheet library (~420 KB) loads only when a file is actually uploaded - it
    // used to be part of the Analytics home screen's code for everyone.
    const XLSX = await import('xlsx');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

          // Process the data using the Python logic
          const processedData = processItemData(jsonData);
          resolve(processedData);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  // Process item data with NEW V2 logic
  const processItemData = (jsonData: any[]): CategoryData => {
    const result: CategoryData = {
      'Chicken Momos': 0,
      'Chicken Cheese Momos': 0,
      'Veg Momos': 0,
      'Paneer Momos': 0,
      'Corn Cheese Momos': 0,
      'Chicken Kurkure Momos': 0,
      'Veg Kurkure Momos': 0
    };

    jsonData.forEach(item => {
      const itemName = String(item['Item'] || '');
      const qty = Number(item['Total Quantity'] || item['Total Qua'] || 0);

      // Skip invalid or empty rows
      if (!qty || qty === 0 || !itemName) {
        return;
      }

      const nameLower = itemName.toLowerCase();

      // -------------------------------------------------
      // RULE 1: Mania Combos - 8 momos direct + 2 moburgers (2 momos each, so 4 more) of
      // that same momo type, plus a coke - 12 momos total per combo unit sold.
      // -------------------------------------------------
      if (nameLower.includes('mania') && nameLower.includes('combo')) {
        const category = classifyMomoCategory(nameLower);
        if (category) {
          result[category] += 12 * qty;
        }
        return;
      }

      // -------------------------------------------------
      // RULE 2: Platters (Split Logic)
      // -------------------------------------------------
      if (nameLower.includes('platter')) {
        if (nameLower.includes('non veg')) {
          // 6 Chicken + 6 Chicken Cheese
          result['Chicken Momos'] += (6 * qty);
          result['Chicken Cheese Momos'] += (6 * qty);
        } else if (nameLower.includes('veg')) {
          // 4 Paneer + 4 Veg + 4 Corn Cheese
          result['Paneer Momos'] += (4 * qty);
          result['Veg Momos'] += (4 * qty);
          result['Corn Cheese Momos'] += (4 * qty);
        }
        return; // Done processing this row
      }

      // -------------------------------------------------
      // RULE 3: Determine Piece Count for Standard Items
      // -------------------------------------------------
      let piecesPerUnit = 6; // Default plate size

      if (nameLower.includes('burger')) {
        // Base: 1 burger = 2 momos
        const momosPerBurger = 2;
        let burgersPerPlate = 1;

        // Check for multi-burger plates (e.g., "2 pcs")
        const pcsMatch = itemName.match(/(\d+)\s*(?:pcs|pieces|piece|pc)\b/i);
        if (pcsMatch) {
          burgersPerPlate = parseInt(pcsMatch[1]);
        }

        piecesPerUnit = burgersPerPlate * momosPerBurger;
      } else {
        // Standard items: check for explicit counts like "8 pcs"
        const pcsMatch = itemName.match(/(\d+)\s*(?:pcs|pieces|piece|pc)\b/i);
        if (pcsMatch) {
          let count = parseInt(pcsMatch[1]);

          // Check for "pack of" multiplier
          const packMatch = itemName.match(/pack of\s*(\d+)/i);
          if (packMatch) {
            count *= parseInt(packMatch[1]);
          }

          piecesPerUnit = count;
        }
      }

      const totalPieces = qty * piecesPerUnit;

      // -------------------------------------------------
      // RULE 4: Categorize Standard Items
      // -------------------------------------------------
      // Filter out beverages/extras
      if (['drink', 'cola', 'campa', 'water', 'beverage', 'soup', 'samosa', 'nugget', 'popcorn', 'fries', 'mojito', 'mocktail', 'cake'].some(x => nameLower.includes(x))) {
        return;
      }

      // Identify Category
      const category = classifyMomoCategory(nameLower);

      // Add to total if it matches a tracked category
      if (category) {
        result[category] += totalPieces;
      }
    });

    return result;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    // Try to extract date from filename
    // Supported formats:
    // 1. "Itemwise sales_StoreName_DD_MM_YYYY-DD_MM_YYYY.xlsx"
    // 2. "StoreName_DD_MM_YYYY.xlsx"
    // 3. "DD_MM_YYYY.xlsx"
    // 4. "YYYY-MM-DD.xlsx"
    let extractedDate = ''; // Start with empty, will fall back to selectedDate if no match
    let dateSource = '';

    // Pattern 1: DD_MM_YYYY-DD_MM_YYYY (range format)
    const rangePattern = /_(\d{2})_(\d{2})_(\d{4})-\d{2}_\d{2}_\d{4}\./;
    let match = file.name.match(rangePattern);

    if (match) {
      const [, day, month, year] = match;
      extractedDate = `${year}-${month}-${day}`;
      dateSource = 'range format';
    } else {
      // Pattern 2: DD_MM_YYYY (single date)
      const singlePattern = /_(\d{2})_(\d{2})_(\d{4})\./;
      match = file.name.match(singlePattern);

      if (match) {
        const [, day, month, year] = match;
        extractedDate = `${year}-${month}-${day}`;
        dateSource = 'single date format';
      } else {
        // Pattern 3: YYYY-MM-DD (ISO format)
        const isoPattern = /(\d{4})-(\d{2})-(\d{2})/;
        match = file.name.match(isoPattern);

        if (match) {
          extractedDate = match[0]; // Already in YYYY-MM-DD format
          dateSource = 'ISO date format';
        }
      }
    }

    // Use extracted date if found, otherwise fall back to manually selected date
    const finalDate = extractedDate || selectedDate;

    if (extractedDate) {
      console.log(`📅 Extracted date from filename (${dateSource}): ${file.name} -> ${extractedDate}`);
      setSelectedDate(extractedDate);
      toast.success(`Using the date from the file name: ${extractedDate}`, { duration: 2000 });
    } else {
      console.log(`📅 Using manually selected date: ${selectedDate}`);
      toast.info(`Using the date you picked: ${selectedDate}`, { duration: 2000 });
    }

    if (!finalDate) {
      toast.error('Please select a date before uploading');
      return;
    }

    if (!effectiveStoreId) {
      toast.error('Store ID not found');
      return;
    }

    try {
      setUploading(true);
      toast.info('Processing file...', { duration: 2000 });

      // Process the file
      const categoryData = await processXLSXFile(file);

      toast.info('Uploading to server...', { duration: 2000 });

      // Get store name - safely handle undefined stores array
      const storeName = context.stores?.find(s => s.id === effectiveStoreId)?.name || 'Unknown Store';

      // Create sales record with the extracted date
      const record: SalesRecord = {
        id: `SALES-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        date: finalDate, // Use extracted date instead of selectedDate
        storeId: effectiveStoreId,
        storeName,
        data: categoryData,
        uploadedBy: context.user?.name || 'Unknown',
        uploadedAt: new Date().toISOString()
      };

      // Save to backend
      await api.saveSalesData(record, context.user?.accessToken || '');

      toast.success(`Sales data uploaded for ${finalDate}`);
      setShowUpload(false);

      // Reload data
      await loadSalesData();

      // Reset file input
      event.target.value = '';

    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!(await confirm({ title: 'Delete this sales record?', confirmLabel: 'Delete record', tone: 'danger' }))) {
      return;
    }

    try {
      await api.deleteSalesData(recordId, context.user?.accessToken || '');
      toast.success('Sales record deleted');
      await loadSalesData();
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('Failed to delete record');
    }
  };

  const getTotalPieces = (data: CategoryData): number => {
    return Object.values(data).reduce((sum, val) => sum + val, 0);
  };

  // Helper to get readable filter label
  const getFilterLabel = (filter: TimeFilter): string => {
    const labels: Record<TimeFilter, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This Week',
      previousWeek: 'Previous Week',
      thisMonth: 'This Month',
      previousMonth: 'Previous Month',
      thisYear: 'This Year',
      lastYear: 'Last Year',
      custom: 'Custom'
    };
    return labels[filter];
  };

  // Helper to get date ranges for a time period
  const getDateRange = (filter: TimeFilter, customRange?: { from: string; to: string }): { start: string; end: string } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date;

    switch (filter) {
      case 'today':
        start = new Date(today);
        end = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'thisWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay()); // Sunday
        end = new Date(today);
        break;
      case 'previousWeek':
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() - 7); // Previous Sunday
        end = new Date(start);
        end.setDate(start.getDate() + 6); // Previous Saturday
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today);
        break;
      case 'previousMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
        break;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today);
        break;
      case 'lastYear':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
      case 'custom':
        return {
          start: customRange?.from || today.toISOString().split('T')[0],
          end: customRange?.to || today.toISOString().split('T')[0]
        };
      default:
        start = new Date(today);
        end = new Date(today);
    }

    // .toISOString() converts to UTC first, which rolls the date back a day for the ~5.5
    // hours after midnight in a positive-offset timezone (IST) - use local components instead.
    const toLocalDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    return {
      start: toLocalDateStr(start),
      end: toLocalDateStr(end)
    };
  };

  // Date range for the "Sales Records" list - reuses the same local-date-safe getDateRange
  // helper as the rest of the page.
  const recordsDateRange = getDateRange(recordsDateFilter, recordsDateFilter === 'custom' ? recordsCustomRange : undefined);
  const filteredSalesRecords = salesRecords.filter(r => r.date >= recordsDateRange.start && r.date <= recordsDateRange.end);

  // Helper to get comparison period
  const getComparisonRange = (filter: TimeFilter, customRange?: { from: string; to: string }): { start: string; end: string } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date;

    switch (filter) {
      case 'today':
        // Compare with yesterday
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
        break;
      case 'yesterday':
        // Compare with day before yesterday
        start = new Date(today);
        start.setDate(today.getDate() - 2);
        end = new Date(start);
        break;
      case 'thisWeek':
        // Compare with same days in previous week (Sun of current week to today of previous week)
        const currentWeekStart = new Date(today);
        currentWeekStart.setDate(today.getDate() - today.getDay());
        const daysIntoWeek = today.getDay(); // How many days into the week we are

        start = new Date(currentWeekStart);
        start.setDate(currentWeekStart.getDate() - 7); // Previous week's Sunday
        end = new Date(start);
        end.setDate(start.getDate() + daysIntoWeek); // Same day of week in previous week
        break;
      case 'previousWeek':
        // Compare with 2 weeks ago (full week)
        start = new Date(today);
        start.setDate(today.getDate() - today.getDay() - 14);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'thisMonth':
        // Compare with same date range in previous month (e.g., Feb 1-4 compares with Jan 1-4)
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const daysIntoMonth = today.getDate(); // How many days into the month we are

        start = new Date(today.getFullYear(), today.getMonth() - 1, 1); // 1st of previous month
        end = new Date(today.getFullYear(), today.getMonth() - 1, daysIntoMonth); // Same date in previous month
        break;
      case 'previousMonth':
        // Compare with same full month 2 months ago
        start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        end = new Date(today.getFullYear(), today.getMonth() - 1, 0);
        break;
      case 'thisYear':
        // Compare with same date range in previous year (e.g., Jan 1-Feb 4 2025 compares with Jan 1-Feb 4 2024)
        const currentYearStart = new Date(today.getFullYear(), 0, 1);
        const daysIntoYear = Math.floor((today.getTime() - currentYearStart.getTime()) / (1000 * 60 * 60 * 24));

        start = new Date(today.getFullYear() - 1, 0, 1); // Jan 1 of previous year
        end = new Date(start);
        end.setDate(start.getDate() + daysIntoYear); // Same number of days into previous year
        break;
      case 'lastYear':
        // Compare with 2 years ago
        start = new Date(today.getFullYear() - 2, 0, 1);
        end = new Date(today.getFullYear() - 2, 11, 31);
        break;
      case 'custom':
        if (customRange) {
          const fromDate = new Date(customRange.from);
          const toDate = new Date(customRange.to);
          const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

          const compStart = new Date(fromDate);
          compStart.setDate(fromDate.getDate() - daysDiff - 1);
          const compEnd = new Date(fromDate);
          compEnd.setDate(fromDate.getDate() - 1);

          return {
            start: compStart.toISOString().split('T')[0],
            end: compEnd.toISOString().split('T')[0]
          };
        }
        return { start: '', end: '' };
      default:
        start = new Date(today);
        start.setDate(today.getDate() - 1);
        end = new Date(start);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  // ---- Figures for the screen: the same calculations as before, worked out once here --------
  const CATEGORY_LIST = ['Chicken Momos', 'Chicken Cheese Momos', 'Veg Momos', 'Paneer Momos', 'Corn Cheese Momos', 'Chicken Kurkure Momos', 'Veg Kurkure Momos'];
  const presetOfFilter = (Object.entries(SALES_PERIOD_OPTIONS) as [RangePreset, TimeFilter][]).find(([, f]) => f === timeFilter)?.[0];
  const periodName = timeFilter === 'custom'
    ? `${shortDateLabel(dateRange.from, lang)} – ${shortDateLabel(dateRange.to, lang)}`
    : presetOfFilter ? presetLabel(presetOfFilter, lang) : getFilterLabel(timeFilter);

  // Sales trends by category: this period vs the matching period before.
  const trend = (() => {
    const categories = CATEGORY_LIST;

    // Get date ranges for current and comparison periods
    const currentRange = getDateRange(timeFilter, dateRange);
    const comparisonRange = getComparisonRange(timeFilter, dateRange);

    // Calculate totals for current period
    const currentTotals: Record<string, number> = {};
    categories.forEach(cat => currentTotals[cat] = 0);

    salesRecords.forEach(r => {
      if (r.date >= currentRange.start && r.date <= currentRange.end) {
        Object.entries(r.data).forEach(([category, count]) => {
          if (category in currentTotals) {
            currentTotals[category] += count;
          }
        });
      }
    });

    // Calculate totals for comparison period
    const comparisonTotals: Record<string, number> = {};
    categories.forEach(cat => comparisonTotals[cat] = 0);

    salesRecords.forEach(r => {
      if (r.date >= comparisonRange.start && r.date <= comparisonRange.end) {
        Object.entries(r.data).forEach(([category, count]) => {
          if (category in comparisonTotals) {
            comparisonTotals[category] += count;
          }
        });
      }
    });

    const rows = categories.map((category) => {
      const current = currentTotals[category] || 0;
      const previous = comparisonTotals[category] || 0;

      // Calculate percentage change
      let percentChange = 0;
      if (previous > 0) {
        percentChange = ((current - previous) / previous) * 100;
      } else if (current > 0) {
        percentChange = 100; // If no previous data but we have current, it's 100% increase
      }
      return { category, current, previous, percentChange };
    });

    return { currentRange, comparisonRange, rows };
  })();

  // Summary: total pieces, top category, average per record and the number of records.
  const summary = (() => {
    const categoryTotals: Record<string, number> = {
      'Chicken Momos': 0,
      'Chicken Cheese Momos': 0,
      'Veg Momos': 0,
      'Paneer Momos': 0,
      'Corn Cheese Momos': 0,
      'Chicken Kurkure Momos': 0,
      'Veg Kurkure Momos': 0
    };

    // Same date-range function the category figures use.
    const { start, end } = getDateRange(timeFilter, dateRange);
    const filteredRecords = salesRecords.filter(r => r.date >= start && r.date <= end);

    filteredRecords.forEach(r => {
      Object.entries(r.data).forEach(([category, count]) => {
        categoryTotals[category] += count;
      });
    });

    const grandTotal = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
    const topCategory = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])[0];
    const avgPerRecord = filteredRecords.length > 0 ? Math.round(grandTotal / filteredRecords.length) : 0;
    const previousTotal = trend.rows.reduce((s, r) => s + r.previous, 0);
    return { grandTotal, topCategory, avgPerRecord, recordCount: filteredRecords.length, filteredRecords, previousTotal };
  })();

  // Pieces a day for the chart (whole months when the period is longer than two months), with
  // the matching day of the period before as the dashed line.
  const dailyChart = (() => {
    const piecesOn = (date: string) => salesRecords
      .filter(r => r.date === date)
      .reduce((s, r) => s + Object.values(r.data).reduce((a, b) => a + (b || 0), 0), 0);
    const days = (start: string, end: string) => {
      const out: string[] = [];
      let d = start;
      let guard = 0;
      while (d && d <= end && guard < 400) {
        out.push(d);
        d = addDaysISO(d, 1);
        guard++;
      }
      return out;
    };
    const current = days(trend.currentRange.start, trend.currentRange.end);
    if (current.length < 2) return { data: [] as any[], monthly: false };
    if (current.length > 62) {
      const byMonth = new Map<string, number>();
      current.forEach(d => byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) || 0) + piecesOn(d)));
      return { data: [...byMonth.entries()].map(([m, pieces]) => ({ period: shortDateLabel(`${m}-01`, lang).replace(/^1 /, ''), pieces })), monthly: true };
    }
    const previous = days(trend.comparisonRange.start, trend.comparisonRange.end);
    return {
      data: current.map((d, i) => ({ period: shortDateLabel(d, lang), pieces: piecesOn(d), prev_pieces: previous[i] ? piecesOn(previous[i]) : null })),
      monthly: false,
    };
  })();

  // Revenue per item by channel - real per-menu-item price (not rolled up to just the 7 momo
  // categories), split Offline vs Zomato vs Swiggy, from Ciferon's per-order item detail
  // (Step D). Offline revenue is the item's real POS price (no commission to remove).
  // Zomato/Swiggy revenue is each order's real net payout (from an uploaded settlement) split
  // across its items proportional to their value share - i.e. already net of that order's
  // discount and aggregator commission, not gross sale price.
  type ChannelKey = 'Offline' | 'Zomato' | 'Swiggy';
  const CHANNELS: ChannelKey[] = ['Offline', 'Zomato', 'Swiggy'];
  const channelTable = (() => {
    const settlementOrderMap = new Map<string, { grossValue: number; netPayout: number }>();
    aggregatorSettlements.forEach(s => {
      (s.orders || []).forEach(o => {
        if (o.orderId) settlementOrderMap.set(String(o.orderId), { grossValue: o.grossValue, netPayout: o.netPayout });
      });
    });

    // Ciferon's own OrderItemWrapperList names the SAME dish inconsistently - different
    // word order ("Veg Steamed Momos" vs "Steamed Veg Momos"), different piece-count
    // notation ("[6 Pieces]" vs "(6 Pieces)" vs none), and different channel/variant
    // suffixes ("-O Normal" vs "-O Butter Brushed") - sometimes even under different
    // underlying ProductIds for what's conceptually one dish, so catalog/ID-based
    // matching alone can't unify them. For a plain style+filling momo (steamed, fried,
    // peri peri, etc. - not a burger/platter/meal/combo, which are genuinely different
    // products), rebuild the name from its classified category plus an
    // order-independent style keyword search, so naming drift collapses to one name.
    const isSpecialProduct = (name: string) =>
      /burger|platter|meal|combo|mania|samosa|nugget|popcorn|fries|drink|cola|water|beverage|soup|mojito|mocktail|cake/i.test(name);

    const extractMomoStyle = (nameLower: string): string | null => {
      if (nameLower.includes('makhni') || nameLower.includes('makhani')) return 'Butter Makhni';
      if (nameLower.includes('afghani')) return 'Afghani';
      if (nameLower.includes('hot garlic')) return 'Hot Garlic';
      if (nameLower.includes('korean')) return 'Spicy Korean';
      if (nameLower.includes('chilli')) return 'Chilli';
      if (nameLower.includes('peri peri')) return 'Peri Peri Fried';
      if (nameLower.includes('pan fried')) return 'Pan Fried';
      if (nameLower.includes('butter fried')) return 'Butter Fried';
      if (nameLower.includes('jhol')) return 'Jhol';
      if (nameLower.includes('kurkure')) return null; // already baked into the category name
      if (nameLower.includes('fried')) return 'Fried';
      if (nameLower.includes('steamed')) return 'Steamed';
      return null;
    };

    // Product-type grouping (separate from momo category) so the list reads as sections:
    // Momos, Meals, Mania Combos, Platter, Extras (burgers + anything else - drinks,
    // desserts, addon lines).
    type ItemGroup = 'Momos' | 'Meals' | 'Mania Combos' | 'Platter' | 'Extras';
    const GROUP_ORDER: ItemGroup[] = ['Momos', 'Meals', 'Mania Combos', 'Platter', 'Extras'];
    const classifyItemGroup = (productName: string): ItemGroup => {
      const n = productName.toLowerCase();
      if (n.includes('mania') && n.includes('combo')) return 'Mania Combos';
      if (n.includes('meal')) return 'Meals';
      if (n.includes('platter')) return 'Platter';
      if (/burger|drink|cola|water|beverage|soup|mojito|mocktail|cake|samosa|nugget|popcorn|fries/i.test(n)) return 'Extras';
      return 'Momos';
    };

    const nameByProductId = new Map(menuItemPrices.map(m => [String(m.productId), m.productName]));
    const normalizeItemName = (productId: number | null, productName: string, category: string | null): string => {
      if (category && !isSpecialProduct(productName)) {
        const style = extractMomoStyle(productName.toLowerCase());
        return style ? `${style} ${category}` : category;
      }
      if (productId !== null && nameByProductId.has(String(productId))) {
        return nameByProductId.get(String(productId))!;
      }
      return productName
        .replace(/\s*-\s*A$/i, '')
        .replace(/\s*-\s*O\b.*$/i, '')
        .replace(/\s*\[\s*\d+\s*pieces?\s*\]/i, '')
        .replace(/\s*\(\s*\d+\s*pieces?\s*\)/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const itemStats = new Map<string, { category: string | null; group: ItemGroup } & Record<ChannelKey, { pieces: number; revenue: number }>>();
    const ensure = (displayName: string, category: string | null, group: ItemGroup) => {
      let entry = itemStats.get(displayName);
      if (!entry) {
        entry = { category, group, Offline: { pieces: 0, revenue: 0 }, Zomato: { pieces: 0, revenue: 0 }, Swiggy: { pieces: 0, revenue: 0 } };
        itemStats.set(displayName, entry);
      }
      return entry;
    };

    let totalOnlineOrders = 0, matchedOnlineOrders = 0;

    orderItemDetail.forEach(rec => {
      rec.orders.forEach(order => {
        const items = order.items.filter(i => i.category);
        if (!order.externalId) {
          // Offline - the item's own `total` is the real price paid, no commission involved.
          items.forEach(item => {
            const displayName = normalizeItemName(item.productId, item.productName, item.category);
            const entry = ensure(displayName, item.category, classifyItemGroup(item.productName));
            entry.Offline.pieces += item.quantity * extractPiecesPerUnit(item.productName);
            entry.Offline.revenue += item.total;
          });
          return;
        }

        totalOnlineOrders++;
        const settlementOrder = settlementOrderMap.get(order.externalId);
        if (!settlementOrder) return; // no uploaded settlement covers this order yet
        matchedOnlineOrders++;

        const channel: ChannelKey = order.paymentMode === 'Swiggy' ? 'Swiggy' : 'Zomato';
        const itemsWithValue = items.filter(i => i.total > 0);
        const orderSubtotal = itemsWithValue.reduce((sum, i) => sum + i.total, 0);
        if (orderSubtotal <= 0) return;

        itemsWithValue.forEach(item => {
          const displayName = normalizeItemName(item.productId, item.productName, item.category);
          const entry = ensure(displayName, item.category, classifyItemGroup(item.productName));
          const share = item.total / orderSubtotal;
          entry[channel].pieces += item.quantity * extractPiecesPerUnit(item.productName);
          entry[channel].revenue += settlementOrder.netPayout * share; // after discount + commission
        });
      });
    });

    const sortValue = (row: { Offline: { pieces: number }; Zomato: { pieces: number }; Swiggy: { pieces: number } }) => {
      switch (itemChannelSort.col) {
        case 'offline': return row.Offline.pieces;
        case 'zomato': return row.Zomato.pieces;
        case 'swiggy': return row.Swiggy.pieces;
        default: return row.Offline.pieces + row.Zomato.pieces + row.Swiggy.pieces;
      }
    };

    const allRows = Array.from(itemStats.entries())
      .map(([productName, v]) => ({ productName, ...v }))
      .filter(row => CHANNELS.some(ch => row[ch].pieces > 0));
    const hasData = allRows.length > 0;

    // Grouped into sections (Momos, Meals, Mania Combos, Platter, Extras), sorted
    // independently within each group so the sort choice doesn't scramble the sections.
    const groupedRows = GROUP_ORDER
      .map(group => ({
        group,
        rows: allRows
          .filter(row => row.group === group)
          .sort((a, b) => itemChannelSort.dir === 'desc' ? sortValue(b) - sortValue(a) : sortValue(a) - sortValue(b)),
      }))
      .filter(g => g.rows.length > 0);

    return { hasData, groupedRows, totalOnlineOrders, matchedOnlineOrders };
  })();

  const toggleSort = (col: typeof itemChannelSort.col) => {
    setItemChannelSort(prev => prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' });
  };

  // Real order-level effective price - exact (not estimated) figures, joining Ciferon's
  // per-order item detail (Step D, OrderReport/Sale) to an uploaded settlement's own per-order
  // payout via ExternalId = the settlement's Order ID. Each order's real net payout is split
  // across its line items proportional to their share of the order's value, then aggregated
  // per momo type.
  const orderLevel = (() => {
    const categories = Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>;

    const settlementOrderMap = new Map<string, { grossValue: number; netPayout: number }>();
    aggregatorSettlements.forEach(s => {
      (s.orders || []).forEach(o => {
        if (o.orderId) settlementOrderMap.set(String(o.orderId), { grossValue: o.grossValue, netPayout: o.netPayout });
      });
    });

    const catStats: Record<string, { pieces: number; grossValue: number; netPayout: number }> = {};
    categories.forEach(cat => { catStats[cat] = { pieces: 0, grossValue: 0, netPayout: 0 }; });
    let totalOnlineOrders = 0, matchedOrders = 0, offlineOrders = 0;

    orderItemDetail.forEach(rec => {
      rec.orders.forEach(order => {
        if (!order.externalId) { offlineOrders++; return; } // offline order, no aggregator payout to join
        totalOnlineOrders++;
        const settlementOrder = settlementOrderMap.get(order.externalId);
        if (!settlementOrder) return; // this order's aggregator settlement hasn't been uploaded yet
        matchedOrders++;

        const itemsWithValue = order.items.filter(i => i.category && i.total > 0);
        const orderSubtotal = itemsWithValue.reduce((sum, i) => sum + i.total, 0);
        if (orderSubtotal <= 0) return;

        itemsWithValue.forEach(item => {
          const cat = item.category as string;
          if (!(cat in catStats)) return;
          const share = item.total / orderSubtotal;
          const pieces = item.quantity * extractPiecesPerUnit(item.productName);
          catStats[cat].pieces += pieces;
          catStats[cat].grossValue += settlementOrder.grossValue * share;
          catStats[cat].netPayout += settlementOrder.netPayout * share;
        });
      });
    });

    const rows = categories
      .filter(cat => catStats[cat].pieces !== 0)
      .map(cat => {
        const s = catStats[cat];
        const effectivePerMomo = s.netPayout / s.pieces;
        const plates = piecesPerPlate[cat] || 6;
        return { cat, ...s, effectivePerMomo, platePrice: effectivePerMomo * plates };
      });
    return { rows, totalOnlineOrders, matchedOrders, offlineOrders, hasMatches: matchedOrders > 0 };
  })();

  // Weekly pattern: average pieces by day of the week across all records.
  const weekly = (() => {
    const dayOfWeekData: Record<string, { counts: Record<string, number[]>, dayName: string }> = {
      '0': { dayName: 'Sunday', counts: {} },
      '1': { dayName: 'Monday', counts: {} },
      '2': { dayName: 'Tuesday', counts: {} },
      '3': { dayName: 'Wednesday', counts: {} },
      '4': { dayName: 'Thursday', counts: {} },
      '5': { dayName: 'Friday', counts: {} },
      '6': { dayName: 'Saturday', counts: {} }
    };
    const categories = CATEGORY_LIST;
    Object.keys(dayOfWeekData).forEach(day => {
      categories.forEach(cat => {
        dayOfWeekData[day].counts[cat] = [];
      });
    });

    // Collect all sales for each day of the week
    salesRecords.forEach(record => {
      const date = new Date(record.date);
      const dayOfWeek = date.getDay().toString();

      Object.entries(record.data).forEach(([category, count]) => {
        if (dayOfWeekData[dayOfWeek].counts[category]) {
          dayOfWeekData[dayOfWeek].counts[category].push(count);
        }
      });
    });

    // Calculate averages for all days
    const allDaysData = Object.entries(dayOfWeekData).map(([dayNum, day]) => {
      const avgData: any = { day: day.dayName, dayNum: parseInt(dayNum) };
      categories.forEach(category => {
        const values = day.counts[category];
        const avg = values.length > 0
          ? Math.round(values.reduce((sum, val) => sum + val, 0) / values.length)
          : 0;
        avgData[category] = avg;
      });
      return avgData;
    });

    // Best day for each category (across all days)
    const bestDays: Record<string, { day: string, avg: number }> = {};
    categories.forEach(category => {
      let maxAvg = 0;
      let bestDay = '';
      allDaysData.forEach(dayData => {
        if (dayData[category] > maxAvg) {
          maxAvg = dayData[category];
          bestDay = dayData.day;
        }
      });
      bestDays[category] = { day: bestDay, avg: maxAvg };
    });

    const selectedDayFullData = allDaysData.find(d => d.dayNum === selectedDayOfWeek);
    const rows = categories.map(category => {
      const current = selectedDayFullData?.[category] || 0;
      const bestDay = bestDays[category];
      let percentDiff = 0;
      const isBestDay = selectedDayFullData?.day === bestDay.day;
      if (bestDay.avg > 0 && current > 0) {
        percentDiff = ((current - bestDay.avg) / bestDay.avg) * 100;
      }
      return { category, current, bestDay, isBestDay, percentDiff };
    });

    // Busiest and quietest day overall
    const busiestDay = allDaysData.reduce((prev, curr) => {
      const prevTotal = categories.reduce((sum, cat) => sum + (prev[cat] || 0), 0);
      const currTotal = categories.reduce((sum, cat) => sum + (curr[cat] || 0), 0);
      return currTotal > prevTotal ? curr : prev;
    });
    const busiestDayTotal = categories.reduce((sum, cat) => sum + (busiestDay[cat] || 0), 0);
    const quietestDay = allDaysData.reduce((prev, curr) => {
      const prevTotal = categories.reduce((sum, cat) => sum + (prev[cat] || 0), 0);
      const currTotal = categories.reduce((sum, cat) => sum + (curr[cat] || 0), 0);
      return currTotal < prevTotal ? curr : prev;
    });
    const quietestDayTotal = categories.reduce((sum, cat) => sum + (quietestDay[cat] || 0), 0);

    // Most popular item on the selected day
    const topItemOnSelectedDay = selectedDayFullData ?
      Object.entries(selectedDayFullData)
        .filter(([key]) => categories.includes(key))
        .sort((a, b) => (b[1] as number) - (a[1] as number))[0]
      : null;

    return { rows, busiestDay, busiestDayTotal, quietestDay, quietestDayTotal, topItemOnSelectedDay };
  })();

  const daysOfWeek = [
    { num: 0, name: 'Sun' }, { num: 1, name: 'Mon' }, { num: 2, name: 'Tue' }, { num: 3, name: 'Wed' },
    { num: 4, name: 'Thu' }, { num: 5, name: 'Fri' }, { num: 6, name: 'Sat' },
  ];

  const openRecord = salesRecords.find(r => r.id === openRecordId) || null;
  const storeNameFor = (record: SalesRecord) => record.storeName && record.storeName !== 'Unknown Store'
    ? record.storeName
    : (context.stores?.find(s => s.id === record.storeId)?.name || record.storeName || 'Unknown Store');
  const fmt = (n: number) => formatNumberIN(n);
  const rupees2 = (n: number) => `₹${n.toFixed(2)}`;
  const channelLabel = (ch: ChannelKey) => (ch === 'Offline' ? 'Counter' : ch);
  const changeChip = (row: { current: number; previous: number; percentChange: number }) => {
    if (row.previous > 0) {
      const up = row.percentChange > 0;
      const down = row.percentChange < 0;
      return (
        <StatusChip tone={up ? 'success' : down ? 'danger' : 'neutral'} icon={up ? ArrowUp : down ? ArrowDown : undefined}>
          <span className="num">{Math.abs(row.percentChange).toFixed(1)}%</span>
        </StatusChip>
      );
    }
    if (row.current > 0) return <StatusChip tone="info">{t('wp8.new')}</StatusChip>;
    return <StatusChip tone="neutral">–</StatusChip>;
  };

  // ---- Sheets ----------------------------------------------------------------------------------
  const uploadSheet = (
    <ResponsiveModal
      open={showUpload}
      onOpenChange={(open) => { if (!uploading) setShowUpload(open); }}
      title={t('wp8.sales.uploadTitle')}
      description="An item-wise sales export (.xlsx, .xls or .csv) from the POS"
      size="form"
      footer={
        <Button asChild size="lg" fullWidth loading={uploading} aria-disabled={uploading || undefined}>
          <label className={uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
            {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {uploading ? t('wp8.sales.uploading') : t('wp8.sales.chooseFile')}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={uploading} className="sr-only" />
          </label>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t('wp8.sales.fileDate')} helper={t('wp8.sales.fileDateHelp')}>
          <input
            type="date"
            value={selectedDate}
            max={getTodayIST()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={controlClasses}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <h3 className="text-subtitle font-semibold text-text">What the file needs</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-text-2">
            <li>Columns named <span className="font-medium text-text">Item</span> and <span className="font-medium text-text">Total Quantity</span></li>
            <li>Item names that include the momo type, e.g. "Chicken Pan-Fried Momos (8 pcs)"</li>
            <li>Quantity as the number of plates or items sold</li>
          </ul>
        </div>
        <Callout tone="neutral" title="The date can come from the file name">
          A name like "Itemwise sales_Store_27_10_2026.xlsx" or "2026-10-27.xlsx" uses that date; otherwise the sales date above is used.
        </Callout>
      </div>
    </ResponsiveModal>
  );

  const plateSheet = (
    <ResponsiveModal
      open={showPlateConfig}
      onOpenChange={setShowPlateConfig}
      title="Plate configuration"
      description="How many pieces make a plate, and a plate's price, for each momo type"
      size="detail"
      footer={<Button size="lg" variant="secondary" fullWidth onClick={() => setShowPlateConfig(false)}>{t('common.done')}</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {(Object.keys(piecesPerPlate) as Array<keyof CategoryData>).map((category) => (
            <div key={category} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1 text-body-md font-medium text-text">{category}</span>
              <div className="grid grid-cols-2 gap-3 sm:w-64">
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-3">
                  Pieces a plate
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={piecesPerPlate[category]}
                    onChange={(e) => updatePlateConfig(category, parseInt(e.target.value) || 6)}
                    className={cn(controlClasses, 'num h-11 text-right')}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-3">
                  Price a plate (₹)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pricePerPlate[category]}
                    onChange={(e) => updatePriceConfig(category, parseFloat(e.target.value) || 0)}
                    className={cn(controlClasses, 'num h-11 text-right')}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        {isSavingPlateConfig && <p className="text-caption text-text-3">Saving…</p>}
        <Callout tone="info" title={t('wp8.howItWorks')}>
          Pieces are shown as plates with this. With 6 pieces a plate, 262 chicken momos sold show as 262 pcs / 44 plates.
        </Callout>
      </div>
    </ResponsiveModal>
  );

  // Menu item prices - real Offline vs Online price per menu item, keyed by Ciferon's
  // ProductId. Zomato and Swiggy share one Online price (Ciferon pushes the same "Online
  // Submenu" price list to both). Editable here since menu prices change over time.
  const menuGroups = (Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>).map(cat => ({
    category: cat,
    items: menuItemPrices
      .filter(i => i.momoCategory === cat)
      .sort((a, b) => a.productName.localeCompare(b.productName)),
  })).filter(g => g.items.length > 0);

  const menuSheet = (
    <ResponsiveModal
      open={showMenuItemPrices}
      onOpenChange={(open) => { if (!open) { setShowMenuItemPrices(false); setShowAddMenuItem(false); } }}
      onBack={showAddMenuItem ? () => setShowAddMenuItem(false) : undefined}
      title={showAddMenuItem ? 'Add a menu item' : 'Menu item prices'}
      description={showAddMenuItem
        ? "For a menu item Ciferon hasn't sent a price for yet (e.g. an alternate-portion SKU) - find its Product ID and Name in Ciferon's own order export, or from an \"unmatched item\" note elsewhere in the app."
        : `Counter and online (Zomato / Swiggy) price for each menu item${!isClusterHead ? ' - view only' : ''}`}
      size="detail"
      footer={showAddMenuItem ? (
        <>
          <Button size="lg" variant="secondary" onClick={() => setShowAddMenuItem(false)} disabled={isSavingNewMenuItem}>{t('common.cancel')}</Button>
          <Button size="lg" className="flex-1" loading={isSavingNewMenuItem} onClick={handleAddMenuItem}>Save item</Button>
        </>
      ) : (
        <Button size="lg" variant="secondary" fullWidth onClick={() => setShowMenuItemPrices(false)}>{t('common.done')}</Button>
      )}
    >
      {showAddMenuItem ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Product ID (Ciferon's)">
            <input type="text" value={newMenuItem.productId} onChange={(e) => setNewMenuItem(prev => ({ ...prev, productId: e.target.value }))} placeholder="e.g. 1108056" className={controlClasses} />
          </Field>
          <Field label="Product name">
            <input type="text" value={newMenuItem.productName} onChange={(e) => setNewMenuItem(prev => ({ ...prev, productName: e.target.value }))} placeholder="e.g. Chicken Steamed Momos (8 pcs) - A" className={controlClasses} />
          </Field>
          <Field label="Category">
            <select value={newMenuItem.momoCategory} onChange={(e) => setNewMenuItem(prev => ({ ...prev, momoCategory: e.target.value as keyof CategoryData }))} className={controlClasses}>
              {(Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </Field>
          <Field label="Pieces a unit">
            <input type="number" inputMode="numeric" value={newMenuItem.piecesPerUnit} onChange={(e) => setNewMenuItem(prev => ({ ...prev, piecesPerUnit: e.target.value }))} className={cn(controlClasses, 'num')} />
          </Field>
          <Field label="Counter price (₹)">
            <input type="number" inputMode="decimal" value={newMenuItem.offlinePrice} onChange={(e) => setNewMenuItem(prev => ({ ...prev, offlinePrice: e.target.value }))} className={cn(controlClasses, 'num')} />
          </Field>
          <Field label="Online price (₹)">
            <input type="number" inputMode="decimal" value={newMenuItem.onlinePrice} onChange={(e) => setNewMenuItem(prev => ({ ...prev, onlinePrice: e.target.value }))} className={cn(controlClasses, 'num')} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {isClusterHead && (
            <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setShowAddMenuItem(true)} className="self-start">Add a menu item</Button>
          )}
          {menuItemPrices.length === 0 ? (
            <EmptyState compact icon={FileSpreadsheet} title="No menu items set up yet" />
          ) : (
            menuGroups.map(({ category, items }) => (
              <ListGroup key={category} title={category} meta={`${items.length}`}>
                {items.map(item => (
                  <div key={item.productId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1 text-body-sm font-medium text-text">{item.productName}</span>
                    <div className="grid grid-cols-2 gap-3 sm:w-64">
                      {(['offlinePrice', 'onlinePrice'] as const).map(field => (
                        <label key={field} className="flex min-w-0 flex-col gap-1 text-caption text-text-3">
                          {field === 'offlinePrice' ? 'Counter' : 'Online'}
                          {isClusterHead ? (
                            <input
                              type="number"
                              value={item[field]}
                              onChange={(e) => handleMenuPriceChange(item, field, parseFloat(e.target.value) || 0)}
                              className={cn(controlClasses, 'num h-11 text-right')}
                              disabled={isSavingMenuPrice === item.productId}
                            />
                          ) : (
                            <span className="num text-body-sm font-semibold text-text">₹{item[field].toFixed(2)}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </ListGroup>
            ))
          )}
        </div>
      )}
    </ResponsiveModal>
  );

  const recordSheet = (
    <ResponsiveModal
      open={!!openRecord}
      onOpenChange={(open) => { if (!open) setOpenRecordId(null); }}
      title={openRecord ? friendlyDateLabel(openRecord.date, lang) : ''}
      description={openRecord ? `${storeNameFor(openRecord)} · ${fmt(getTotalPieces(openRecord.data))} pieces` : undefined}
      size="form"
      footer={openRecord ? (
        <Button
          size="lg"
          variant="danger-ghost"
          fullWidth
          leadingIcon={<Trash2 />}
          onClick={async () => { const id = openRecord.id; setOpenRecordId(null); await handleDelete(id); }}
        >
          {t('wp8.sales.deleteRecord')}
        </Button>
      ) : undefined}
    >
      {openRecord && (() => {
        const totalPieces = getTotalPieces(openRecord.data);
        return (
          <div className="flex flex-col gap-4">
            <ListGroup>
              {Object.entries(openRecord.data).map(([category, count]) => {
                const safeCount = count || 0;
                const percentage = totalPieces > 0 ? ((safeCount / totalPieces) * 100).toFixed(1) : '0';
                const piecesPerPlateValue = piecesPerPlate[category as keyof CategoryData] || 6;
                const plates = Math.floor(safeCount / piecesPerPlateValue);
                return (
                  <ListRow
                    key={category}
                    density="compact"
                    title={category}
                    subtitle={`${plates} plates · ${percentage}%`}
                    trailing={<span className="num text-body-md font-semibold text-text">{fmt(safeCount)}</span>}
                  />
                );
              })}
            </ListGroup>
            <p className="text-caption text-text-3">
              {openRecord.uploadedBy === 'pos-sync' ? 'Synced from the POS' : `Uploaded by ${openRecord.uploadedBy}`} · {new Date(openRecord.uploadedAt).toLocaleString()}
            </p>
          </div>
        );
      })()}
    </ResponsiveModal>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Delayed>
          <SkeletonStatTile hero />
          <SkeletonListRows count={5} />
        </Delayed>
      </div>
    );
  }

  const sortOptions: { value: typeof itemChannelSort.col; label: string }[] = [
    { value: 'pcs', label: 'Total pcs' },
    { value: 'offline', label: 'Counter' },
    { value: 'zomato', label: 'Zomato' },
    { value: 'swiggy', label: 'Swiggy' },
  ];
  const SortIcon = itemChannelSort.dir === 'desc' ? ArrowDown : ArrowUp;

  return (
    <div className="flex flex-col gap-6" lang={lang}>
      {/* Daily sales data: one primary action, the rest in the overflow menu, the file help in the upload sheet */}
      <section className="flex flex-col gap-4" aria-labelledby="sales-data-title">
        <SectionHeading
          id="sales-data-title"
          title={t('wp8.sales.title')}
          caption={t('wp8.sales.caption')}
          actions={
            <OverflowMenu
              items={[
                isClusterHead && { label: t('wp8.sales.upload'), icon: <Upload className="size-4" aria-hidden="true" />, onSelect: () => setShowUpload(true) },
                { label: t('wp8.sales.plateConfig'), icon: <Settings className="size-4" aria-hidden="true" />, onSelect: () => setShowPlateConfig(true) },
                { label: t('wp8.sales.menuPrices'), icon: <Tags className="size-4" aria-hidden="true" />, onSelect: () => setShowMenuItemPrices(true) },
              ]}
            />
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PeriodChip
            value={timeFilter}
            options={SALES_PERIOD_OPTIONS}
            custom={dateRange}
            onChange={(f, custom) => { setTimeFilter(f); if (custom) setDateRange(custom); }}
          />
          {isClusterHead ? (
            <Button leadingIcon={<RefreshCw />} loading={isSyncingCategoryData} onClick={handleSyncFromPOS}>
              {isSyncingCategoryData ? t('wp8.sales.syncing') : t('wp8.sales.sync')}
            </Button>
          ) : (
            <Button leadingIcon={<Upload />} onClick={() => setShowUpload(true)}>{t('wp8.sales.upload')}</Button>
          )}
        </div>

        {salesRecords.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon={FileSpreadsheet}
              title={t('wp8.sales.empty')}
              body={t('wp8.sales.emptyBody')}
            />
          </Card>
        ) : (
          <>
            <StatTile
              hero
              label={`${t('wp8.sales.piecesSold')} · ${periodName}`}
              value={fmt(summary.grandTotal)}
              delta={summary.previousTotal > 0 ? { value: ((summary.grandTotal - summary.previousTotal) / summary.previousTotal) * 100, label: 'vs the period before' } : undefined}
              caption={summary.recordCount > 0
                ? `Most sold: ${summary.topCategory?.[0] || 'N/A'} · ${fmt(summary.topCategory?.[1] || 0)} pcs · ${summary.recordCount === 1 ? t('wp8.record') : t('wp8.records', { n: summary.recordCount })}, avg ${fmt(summary.avgPerRecord)} pcs each`
                : t('wp8.sales.noRecordsRange')}
            />

            {dailyChart.data.length > 0 && (
              <ChartCard
                title={t('wp8.sales.perDay')}
                caption={periodName}
                legend={legendFor([
                  { key: 'pieces', name: t('wp8.sales.piecesSold'), color: CHART_COLORS.primary, kind: 'bar' },
                  ...(dailyChart.monthly ? [] : [{ key: 'prev_pieces', name: 'Last period', color: CHART_COLORS.previous, dashed: true }]),
                ], t('insights.lastPeriod'))}
              >
                <TrendChart
                  data={dailyChart.data}
                  series={[
                    { key: 'pieces', name: t('wp8.sales.piecesSold'), color: CHART_COLORS.primary, kind: 'bar' },
                    ...(dailyChart.monthly ? [] : [{ key: 'prev_pieces', name: t('insights.lastPeriod'), color: CHART_COLORS.previous, dashed: true }]),
                  ]}
                  format="number"
                  height={220}
                  ariaLabel={`Momo pieces sold a day, ${periodName}: ${fmt(summary.grandTotal)} in all`}
                />
              </ChartCard>
            )}

            <ListGroup title={t('wp8.sales.byType')} meta={periodName}>
              {trend.rows.map((row) => (
                <ListRow
                  key={row.category}
                  title={row.category}
                  subtitle={row.previous > 0
                    ? `${fmt(row.previous)} pcs the period before`
                    : row.current > 0 ? 'New sales in this period' : 'No data for both periods'}
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      <span className="num text-body-md font-semibold text-text">{fmt(row.current)}</span>
                      {changeChip(row)}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </>
        )}
      </section>

      {/* Price per piece by channel */}
      <Card className="gap-4 lg:p-5">
        <SectionHeading
          as="h3"
          title={t('wp8.sales.channelPrice')}
          caption={`${channelTable.matchedOnlineOrders} of ${channelTable.totalOnlineOrders} online orders in this period matched a settlement`}
        />
        <HowItWorks title={t('wp8.sales.channelPrice')}>
          <p>Every menu item, not rolled up to the 7 momo categories. Counter is the real POS price.</p>
          <p>Zomato and Swiggy are the real effective price after that order's discount and commission - only orders matched to an uploaded settlement count ({channelTable.matchedOnlineOrders} of {channelTable.totalOnlineOrders} online orders in this period matched so far).</p>
          <p>Upload the settlement covering these dates in Money → Payouts to fill in the rest.</p>
        </HowItWorks>
        {!channelTable.hasData ? (
          <EmptyState
            compact
            icon={FileSpreadsheet}
            title="No item detail from the POS in this period"
            body={isClusterHead ? 'Use "Sync from POS" above.' : 'Ask a cluster head to sync from the POS for this period.'}
          />
        ) : (
          <>
            <FilterChips
              aria-label="Sort by"
              value={itemChannelSort.col}
              onValueChange={toggleSort}
              options={sortOptions.map(o => ({
                value: o.value,
                label: (
                  <span className="inline-flex items-center gap-1">
                    {o.label}
                    {itemChannelSort.col === o.value && <SortIcon className="size-3.5" aria-label={itemChannelSort.dir === 'desc' ? 'most first' : 'fewest first'} />}
                  </span>
                ),
              }))}
            />
            {/* Phones and tablets: a list per section */}
            <div className="flex flex-col gap-4 lg:hidden">
              {channelTable.groupedRows.map(({ group, rows }) => (
                <ListGroup key={group} overline={group}>
                  {rows.map(row => (
                    <div key={row.productName} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-body-md font-medium text-text">{row.productName}</span>
                        <span className="text-label text-text-3">{row.category || '-'}</span>
                      </div>
                      <MiniFigures
                        items={CHANNELS.map(ch => {
                          const v = row[ch];
                          return {
                            label: channelLabel(ch),
                            value: v.pieces > 0 ? `${rupees2(v.revenue / v.pieces)}/pc` : '–',
                            sub: v.pieces > 0 ? `${fmt(v.pieces)} pcs` : 'none',
                            tone: v.pieces > 0 ? 'default' : 'muted',
                          };
                        })}
                      />
                    </div>
                  ))}
                </ListGroup>
              ))}
            </div>
            {/* Desktop: the full table */}
            <div className="hidden lg:block">
              <Table containerClassName="max-h-[600px] overflow-y-auto">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead rowSpan={2}>Menu item</TableHead>
                    <TableHead rowSpan={2}>Category</TableHead>
                    {CHANNELS.map(ch => <TableHead key={ch} colSpan={2} numeric className="border-l border-border">{channelLabel(ch)}</TableHead>)}
                  </TableRow>
                  <TableRow>
                    {CHANNELS.map(ch => (
                      <React.Fragment key={ch}>
                        <TableHead numeric className="border-l border-border">Pcs</TableHead>
                        <TableHead numeric>₹ a pc</TableHead>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelTable.groupedRows.map(({ group, rows }) => (
                    <React.Fragment key={group}>
                      <TableRow className="bg-surface-2 hover:bg-surface-2">
                        <TableCell colSpan={2 + CHANNELS.length * 2} className="overline-label py-2">{group}</TableCell>
                      </TableRow>
                      {rows.map(row => (
                        <TableRow key={row.productName}>
                          <TableCell>{row.productName}</TableCell>
                          <TableCell className="text-text-2">{row.category || '-'}</TableCell>
                          {CHANNELS.map(ch => {
                            const v = row[ch];
                            return (
                              <React.Fragment key={ch}>
                                <TableCell numeric className="border-l border-border text-text-2">{v.pieces > 0 ? v.pieces.toLocaleString() : '-'}</TableCell>
                                <TableCell numeric className="font-semibold">{v.pieces > 0 ? rupees2(v.revenue / v.pieces) : '-'}</TableCell>
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {/* Real price from settled orders */}
      {orderItemDetail.length > 0 && (
        <Card className="gap-4 lg:p-5">
          <SectionHeading
            as="h3"
            title={t('wp8.sales.orderPrice')}
            caption={`${orderLevel.matchedOrders} of ${orderLevel.totalOnlineOrders} online orders matched an uploaded settlement`}
          />
          <HowItWorks title={t('wp8.sales.orderPrice')}>
            <p>Exact, not an estimate. Each Zomato or Swiggy order's real payout (from an uploaded settlement) is matched to that same order's momos (from the POS) by its order ID, then split across the items by their share of the order's value.</p>
            <p>{orderLevel.matchedOrders} of {orderLevel.totalOnlineOrders} online orders in this period matched an uploaded settlement. {orderLevel.offlineOrders} counter orders are left out - there is no payout to match them to.</p>
          </HowItWorks>
          {!orderLevel.hasMatches ? (
            <EmptyState
              compact
              icon={FileSpreadsheet}
              title="No settled orders in this period yet"
              body="Upload the Zomato or Swiggy settlement covering these dates in Money → Payouts, then check back here."
            />
          ) : (
            <>
              <div className="lg:hidden">
                <ListGroup>
                  {orderLevel.rows.map(r => (
                    <ListRow
                      key={r.cat}
                      title={r.cat}
                      subtitle={`${r.pieces.toFixed(0)} pcs · gross ${rupees2(r.grossValue)} · payout ${rupees2(r.netPayout)}`}
                      trailing={
                        <span className="flex flex-col items-end">
                          <span className="num text-body-md font-semibold text-text">{rupees2(r.effectivePerMomo)}</span>
                          <span className="num text-caption text-text-3">{rupees2(r.platePrice)} a plate</span>
                        </span>
                      }
                    />
                  ))}
                </ListGroup>
              </div>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Momo type</TableHead>
                      <TableHead numeric>Pieces (matched orders)</TableHead>
                      <TableHead numeric>Gross value</TableHead>
                      <TableHead numeric>Net payout</TableHead>
                      <TableHead numeric>Effective ₹ a momo</TableHead>
                      <TableHead numeric>Effective plate price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderLevel.rows.map(r => (
                      <TableRow key={r.cat}>
                        <TableCell>{r.cat}</TableCell>
                        <TableCell numeric className="text-text-2">{r.pieces.toFixed(0)}</TableCell>
                        <TableCell numeric className="text-text-2">{rupees2(r.grossValue)}</TableCell>
                        <TableCell numeric className="text-text-2">{rupees2(r.netPayout)}</TableCell>
                        <TableCell numeric className="font-semibold">{rupees2(r.effectivePerMomo)}</TableCell>
                        <TableCell numeric className="font-semibold">{rupees2(r.platePrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Weekly pattern */}
      {salesRecords.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="sales-weekly-title">
          <SectionHeading as="h3" id="sales-weekly-title" title={t('wp8.sales.weekly')} caption="Average momo pieces sold by day of the week, across all records" />
          <FilterChips
            aria-label="Day of the week"
            value={String(selectedDayOfWeek)}
            onValueChange={(v) => setSelectedDayOfWeek(Number(v))}
            options={daysOfWeek.map(d => ({ value: String(d.num), label: d.name }))}
          />
          <StatGrid columns={3}>
            <StatTile label={t('wp8.sales.busiest')} value={weekly.busiestDay.day} caption={`${fmt(weekly.busiestDayTotal)} pcs avg`} />
            <StatTile label={t('wp8.sales.quietest')} value={weekly.quietestDay.day} caption={`${fmt(weekly.quietestDayTotal)} pcs avg`} />
            <StatTile
              className="col-span-2 lg:col-span-1"
              label={`${t('wp8.sales.topSeller')} · ${daysOfWeek[selectedDayOfWeek]?.name}`}
              value={<span className="text-title">{weekly.topItemOnSelectedDay?.[0] || 'N/A'}</span>}
              caption={weekly.topItemOnSelectedDay ? `${(weekly.topItemOnSelectedDay[1] as number).toLocaleString()} pcs avg` : 'No data'}
            />
          </StatGrid>
          <ListGroup>
            {weekly.rows.map(r => (
              <ListRow
                key={r.category}
                title={r.category}
                subtitle={r.bestDay.avg > 0 ? `Best: ${Math.round(r.bestDay.avg)} on ${r.bestDay.day}` : 'No sales data'}
                trailing={
                  <span className="flex flex-col items-end gap-1">
                    <span className="num text-body-md font-semibold text-text">{fmt(Math.round(r.current))} <span className="text-caption font-normal text-text-3">a day</span></span>
                    {r.isBestDay ? (
                      <StatusChip tone="brand" icon={TrendingUp}>{t('wp8.bestDay')}</StatusChip>
                    ) : r.current > 0 && r.bestDay.avg > 0 ? (
                      <StatusChip tone={r.percentDiff >= 0 ? 'success' : 'danger'} icon={r.percentDiff >= 0 ? ArrowUp : ArrowDown}>
                        <span className="num">{Math.abs(r.percentDiff).toFixed(1)}%</span> vs {r.bestDay.day.slice(0, 3)}
                      </StatusChip>
                    ) : null}
                  </span>
                }
              />
            ))}
          </ListGroup>
        </section>
      )}

      {/* Sales records: a list; a record opens a sheet with its momo types */}
      {salesRecords.length > 0 && (
        <ListGroup
          title={t('wp8.sales.records')}
          meta={`${filteredSalesRecords.length} of ${salesRecords.length}`}
          action={
            <PeriodChip
              value={recordsDateFilter}
              options={RECORDS_PERIOD_OPTIONS}
              custom={recordsCustomRange}
              onChange={(f, custom) => { setRecordsDateFilter(f); if (custom) setRecordsCustomRange(custom); }}
            />
          }
          empty={<EmptyState compact icon={Calendar} title={t('wp8.sales.noRecordsRange')} body="Try a wider date range." />}
        >
          {filteredSalesRecords.slice(0, showAllRecords ? undefined : RECORDS_SHOWN).map((record) => (
            <ListRow
              key={record.id}
              title={friendlyDateLabel(record.date, lang)}
              subtitle={`${storeNameFor(record)} · ${fmt(getTotalPieces(record.data))} pieces`}
              chip={<StatusChip tone={record.uploadedBy === 'pos-sync' ? 'info' : 'neutral'}>{record.uploadedBy === 'pos-sync' ? t('wp8.sales.fromPos') : t('wp8.sales.fromFile')}</StatusChip>}
              onClick={() => setOpenRecordId(record.id)}
              chevron
            />
          ))}
          {!showAllRecords && filteredSalesRecords.length > RECORDS_SHOWN && (
            <ListRow
              muted
              title={t('common.seeAll', { n: filteredSalesRecords.length })}
              onClick={() => setShowAllRecords(true)}
              chevron="down"
            />
          )}
        </ListGroup>
      )}

      {uploadSheet}
      {plateSheet}
      {menuSheet}
      {recordSheet}
    </div>
  );
}
