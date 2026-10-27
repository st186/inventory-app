import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Upload, Calendar, TrendingUp, Package, Trash2, Download, FileSpreadsheet, CheckCircle, AlertCircle, BarChart3, Settings, TrendingDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { DatePicker } from './DatePicker';
import { getAssignedStoreIds } from '../utils/entityAccess';
import { getTodayIST } from '../utils/timezone';

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
  const pcsMatch = productName.match(/(\d+)\s*(?:pcs|pieces|piece)/i);

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
        const pcsMatch = itemName.match(/(\d+)\s*(?:pcs|pieces|piece)/i);
        if (pcsMatch) {
          burgersPerPlate = parseInt(pcsMatch[1]);
        }
        
        piecesPerUnit = burgersPerPlate * momosPerBurger;
      } else {
        // Standard items: check for explicit counts like "8 pcs"
        const pcsMatch = itemName.match(/(\d+)\s*(?:pcs|pieces|piece)/i);
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
      toast.success(`📅 Using date from filename: ${extractedDate}`, { duration: 2000 });
    } else {
      console.log(`📅 Using manually selected date: ${selectedDate}`);
      toast.info(`📅 Using manually selected date: ${selectedDate}`, { duration: 2000 });
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
      
      toast.success(`✅ Sales data uploaded for ${finalDate}!`);
      
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
    if (!window.confirm('Are you sure you want to delete this sales record?')) {
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

  const getChartColor = (index: number): string => {
    const colors = [
      '#ef4444', // red - Chicken Momos
      '#f97316', // orange - Chicken Cheese Momos
      '#22c55e', // green - Veg Momos
      '#3b82f6', // blue - Paneer Momos
      '#eab308', // yellow - Corn Cheese Momos
      '#14b8a6', // purple - Chicken Kurkure Momos
      '#06b6d4'  // cyan - Veg Kurkure Momos
    ];
    return colors[index % colors.length];
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-2">Loading sales data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Upload Section */}
      <div className="bg-primary-soft rounded-2xl shadow-lg p-6 border border-border-strong">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-surface border border-border flex items-center justify-center shadow-lg flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-text" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text tracking-tight">
                Daily Sales Data
              </h2>
              <p className="text-sm text-text-3">
                Upload daily sales XLSX files to track momo sales by category
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              max={getTodayIST()}
            />
            
            <button
              onClick={() => setShowPlateConfig(!showPlateConfig)}
              className="px-6 py-2.5 bg-primary text-on-primary rounded-xl   transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">Plate Config</span>
            </button>

            <button
              onClick={() => setShowMenuItemPrices(!showMenuItemPrices)}
              className="px-6 py-2.5 bg-primary text-on-primary rounded-xl   transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform"
              title="Offline vs Online price per real menu item (Zomato/Swiggy share one Online price via Ciferon's Online Submenu)"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">Menu Item Prices</span>
            </button>

            {isClusterHead && (
              <button
                onClick={handleSyncFromPOS}
                disabled={isSyncingCategoryData}
                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl   transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                title="Pull momo category counts for the selected period straight from Ciferon POS, instead of uploading an XLSX for each day"
              >
                <Package className="w-4 h-4" />
                <span className="font-medium">{isSyncingCategoryData ? 'Syncing...' : 'Sync from POS'}</span>
              </button>
            )}

            <label className={`px-6 py-2.5 bg-primary   text-on-primary rounded-xl   transition-all duration-300 cursor-pointer flex items-center gap-2 shadow-lg hover:shadow-xl transform ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Upload className="w-4 h-4" />
              <span className="font-medium">{uploading ? 'Uploading...' : 'Upload XLSX'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
        
        {/* Info Banner */}
        <div className="mt-4 bg-info-soft border border-info-border rounded-xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
            <div className="text-sm text-info">
              <p className="font-medium mb-1">File Format Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-info">
                <li>Must contain columns: <code className="bg-info-soft px-1 rounded">Item</code> and <code className="bg-info-soft px-1 rounded">Total Quantity</code></li>
                <li>Item names should include momo type (e.g., "Chicken Pan-Fried Momos (8 pcs)")</li>
                <li>Quantity should be the number of plates/items sold</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Plate Configuration Modal */}
      {showPlateConfig && (
        <div className="fixed inset-0 bg-scrim flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-surface border border-border p-6 text-text rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Plate Configuration</h3>
                  <p className="text-sm text-text-2">Set how many pieces are in each plate for each momo type</p>
                </div>
                <button
                  onClick={() => setShowPlateConfig(false)}
                  className="p-2 hover:bg-surface-2 rounded-lg transition-colors"
                >
                  <AlertCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {(Object.keys(piecesPerPlate) as Array<keyof CategoryData>).map((category, index) => (
                <div key={category} className="flex items-center justify-between p-4 bg-surface-2 rounded-xl border-2 border-border">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: getChartColor(index) }}
                    />
                    <label className="text-text font-medium">{category}</label>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={piecesPerPlate[category]}
                        onChange={(e) => updatePlateConfig(category, parseInt(e.target.value) || 6)}
                        className="w-20 px-3 py-2 border-2 border-border-strong rounded-lg focus:border-info focus:outline-none text-center font-semibold"
                      />
                      <span className="text-text-2 text-sm">pcs/plate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-2 text-sm">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={pricePerPlate[category]}
                        onChange={(e) => updatePriceConfig(category, parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 border-2 border-border-strong rounded-lg focus:border-info focus:outline-none text-center font-semibold"
                      />
                      <span className="text-text-2 text-sm">/plate</span>
                    </div>
                  </div>
                </div>
              ))}
              {isSavingPlateConfig && <p className="text-xs text-text-3">Saving...</p>}
            </div>
            
            <div className="p-6 bg-info-soft border-t-2 border-info-border">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
                <div className="text-sm text-info">
                  <p className="font-medium mb-1">How it works:</p>
                  <p>
                    This configuration determines how pieces are converted to plates in the display.
                    For example, if Chicken Momos has 6 pieces/plate and you sold 262 pieces,
                    it will show as <span className="font-mono bg-surface px-2 py-1 rounded">262 pcs / 44 plates</span>.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-surface-2 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowPlateConfig(false)}
                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl   transition-all shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Item Prices Modal - real Offline vs Online price per menu item, keyed by
          Ciferon's ProductId. Zomato and Swiggy share one Online price (Ciferon pushes the
          same "Online Submenu" price list to both). Seeded from the store's real POS export
          + Online Submenu export; editable here since menu prices change over time. */}
      {showMenuItemPrices && (() => {
        const categories = Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>;
        const grouped = categories.map(cat => ({
          category: cat,
          items: menuItemPrices
            .filter(i => i.momoCategory === cat)
            .sort((a, b) => a.productName.localeCompare(b.productName)),
        })).filter(g => g.items.length > 0);

        return (
          <div className="fixed inset-0 bg-scrim flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-surface border border-border p-6 text-text rounded-t-2xl sticky top-0 z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">Menu Item Prices</h3>
                    <p className="text-sm text-text-2">
                      Offline (in-store) and Online (Zomato/Swiggy) list price per real menu item
                      {!isClusterHead && ' - view only'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowMenuItemPrices(false)}
                    className="p-2 hover:bg-surface-2 rounded-lg transition-colors"
                  >
                    <AlertCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {isClusterHead && (
                  <div className="border border-dashed border-success-border rounded-xl p-4 bg-success-soft">
                    {!showAddMenuItem ? (
                      <button
                        onClick={() => setShowAddMenuItem(true)}
                        className="text-sm font-medium text-success hover:text-success flex items-center gap-1.5"
                      >
                        <span className="text-lg leading-none">+</span> Add New Item
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-text">Add New Item</h4>
                          <p className="text-xs text-text-3">
                            For a menu item Ciferon hasn't sent a price for yet (e.g. an alternate-portion SKU) - find its Product ID and Name in Ciferon's own order export, or from an "unmatched item" note elsewhere in the app.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-text-2 mb-1">Product ID (Ciferon's)</label>
                            <input
                              type="text"
                              value={newMenuItem.productId}
                              onChange={(e) => setNewMenuItem(prev => ({ ...prev, productId: e.target.value }))}
                              placeholder="e.g. 1108056"
                              className="w-full px-3 py-1.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-text-2 mb-1">Product Name</label>
                            <input
                              type="text"
                              value={newMenuItem.productName}
                              onChange={(e) => setNewMenuItem(prev => ({ ...prev, productName: e.target.value }))}
                              placeholder="e.g. Chicken Steamed Momos (8 pcs) - A"
                              className="w-full px-3 py-1.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-text-2 mb-1">Category</label>
                            <select
                              value={newMenuItem.momoCategory}
                              onChange={(e) => setNewMenuItem(prev => ({ ...prev, momoCategory: e.target.value as keyof CategoryData }))}
                              className="w-full px-3 py-1.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                            >
                              {(Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-text-2 mb-1">Pieces Per Unit</label>
                            <input
                              type="number"
                              value={newMenuItem.piecesPerUnit}
                              onChange={(e) => setNewMenuItem(prev => ({ ...prev, piecesPerUnit: e.target.value }))}
                              className="w-full px-3 py-1.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-text-2 mb-1">Offline Price (₹)</label>
                            <input
                              type="number"
                              value={newMenuItem.offlinePrice}
                              onChange={(e) => setNewMenuItem(prev => ({ ...prev, offlinePrice: e.target.value }))}
                              className="w-full px-3 py-1.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-text-2 mb-1">Online Price (₹)</label>
                            <input
                              type="number"
                              value={newMenuItem.onlinePrice}
                              onChange={(e) => setNewMenuItem(prev => ({ ...prev, onlinePrice: e.target.value }))}
                              className="w-full px-3 py-1.5 border border-border-strong rounded-lg text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setShowAddMenuItem(false)}
                            className="px-4 py-1.5 text-sm text-text-2 hover:bg-surface-2 rounded-lg transition-colors"
                            disabled={isSavingNewMenuItem}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddMenuItem}
                            disabled={isSavingNewMenuItem}
                            className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
                          >
                            {isSavingNewMenuItem ? 'Saving...' : 'Save Item'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {menuItemPrices.length === 0 ? (
                  <p className="text-sm text-text-3">No menu items configured yet.</p>
                ) : (
                  grouped.map(({ category, items }) => (
                    <div key={category}>
                      <h4 className="text-lg font-semibold text-text mb-2">{category}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-border">
                              <th className="text-left py-2 px-3 font-semibold text-text-2">Menu Item</th>
                              <th className="text-right py-2 px-3 font-semibold text-text-2">Offline Price</th>
                              <th className="text-right py-2 px-3 font-semibold text-text-2">Online Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(item => (
                              <tr key={item.productId} className="border-b border-border">
                                <td className="py-2 px-3 text-text">{item.productName}</td>
                                <td className="py-2 px-3 text-right">
                                  {isClusterHead ? (
                                    <input
                                      type="number"
                                      value={item.offlinePrice}
                                      onChange={(e) => handleMenuPriceChange(item, 'offlinePrice', parseFloat(e.target.value) || 0)}
                                      className="w-24 px-2 py-1 text-right border border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
                                      disabled={isSavingMenuPrice === item.productId}
                                    />
                                  ) : (
                                    <span className="text-text-2">₹{item.offlinePrice.toFixed(2)}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {isClusterHead ? (
                                    <input
                                      type="number"
                                      value={item.onlinePrice}
                                      onChange={(e) => handleMenuPriceChange(item, 'onlinePrice', parseFloat(e.target.value) || 0)}
                                      className="w-24 px-2 py-1 text-right border border-border-strong rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
                                      disabled={isSavingMenuPrice === item.productId}
                                    />
                                  ) : (
                                    <span className="text-text-2">₹{item.onlinePrice.toFixed(2)}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 bg-surface-2 rounded-b-2xl flex justify-end sticky bottom-0">
                <button
                  onClick={() => setShowMenuItemPrices(false)}
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl   transition-all shadow-lg"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sales Analytics Charts */}
      {salesRecords.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg p-6 border border-border">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shadow-md flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-text" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text tracking-tight">Sales Trends by Category</h2>
                <p className="text-sm text-text-3">Analyze momo sales patterns across different time periods</p>
              </div>
            </div>
            
            {/* Time Filter */}
            <div className="flex gap-2 flex-wrap">
              {(['today', 'yesterday', 'thisWeek', 'previousWeek', 'thisMonth', 'previousMonth', 'thisYear', 'lastYear', 'custom'] as TimeFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform ${
                    timeFilter === filter
                      ? 'bg-surface border border-border   text-text shadow-lg'
                      : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                  }`}
                >
                  {getFilterLabel(filter)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {timeFilter === 'custom' && (
            <div className="mb-6 bg-info-soft border border-info-border rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DatePicker
                  label="From Date"
                  value={dateRange.from}
                  onChange={(date) => setDateRange({ ...dateRange, from: date })}
                />
                <DatePicker
                  label="To Date"
                  value={dateRange.to}
                  onChange={(date) => setDateRange({ ...dateRange, to: date })}
                />
              </div>
            </div>
          )}

          {/* Metrics Grid with Comparisons */}
          {(() => {
            const categories = ['Chicken Momos', 'Chicken Cheese Momos', 'Veg Momos', 'Paneer Momos', 'Corn Cheese Momos', 'Chicken Kurkure Momos', 'Veg Kurkure Momos'];
            
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
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {categories.map((category, index) => {
                  const current = currentTotals[category] || 0;
                  const previous = comparisonTotals[category] || 0;
                  
                  // Calculate percentage change
                  let percentChange = 0;
                  if (previous > 0) {
                    percentChange = ((current - previous) / previous) * 100;
                  } else if (current > 0) {
                    percentChange = 100; // If no previous data but we have current, it's 100% increase
                  }
                  
                  const isIncrease = percentChange > 0;
                  const isDecrease = percentChange < 0;
                  const color = getChartColor(index);
                  
                  return (
                    <div 
                      key={category}
                      className="bg-surface-2 rounded-xl p-5 border-2 border-border hover:shadow-lg transition-all duration-300"
                      style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-sm font-semibold text-text-2">{category}</h3>
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: color }}
                        />
                      </div>
                      
                      <div className="mb-3">
                        <p className="text-4xl font-bold text-text mb-1">
                          {current.toLocaleString()}
                        </p>
                        <p className="text-xs text-text-3">pieces sold</p>
                      </div>
                      
                      {previous > 0 && (
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                            isIncrease ? 'bg-success-soft' : isDecrease ? 'bg-danger-soft' : 'bg-surface-2'
                          }`}>
                            {isIncrease && <ArrowUp className="w-3 h-3 text-success" />}
                            {isDecrease && <ArrowDown className="w-3 h-3 text-danger" />}
                            <span className={`text-xs font-semibold ${
                              isIncrease ? 'text-success' : isDecrease ? 'text-danger' : 'text-text-2'
                            }`}>
                              {Math.abs(percentChange).toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-xs text-text-3">
                            vs previous
                          </span>
                        </div>
                      )}
                      
                      {previous === 0 && current > 0 && (
                        <div className="text-xs text-info font-medium">
                          New sales in this period
                        </div>
                      )}
                      
                      {previous === 0 && current === 0 && (
                        <div className="text-xs text-text-3">
                          No data for both periods
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const categoryTotals: Record<string, number> = {
                'Chicken Momos': 0,
                'Chicken Cheese Momos': 0,
                'Veg Momos': 0,
                'Paneer Momos': 0,
                'Corn Cheese Momos': 0,
                'Chicken Kurkure Momos': 0,
                'Veg Kurkure Momos': 0
              };

              // Same date-range function the category cards above use - this used to
              // recompute its own cutoff date by hand (no upper bound at all outside
              // 'custom', and plain local Date mutations instead of getDateRange's
              // IST-safe string handling), so it silently disagreed with the cards
              // whenever "today" landed near a month/week boundary.
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

              return (
                <>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                    <p className="text-xs uppercase tracking-wide text-text-2 mb-1">Total Sales</p>
                    <p className="text-2xl font-semibold">
                      {grandTotal.toLocaleString()}
                    </p>
                    <p className="text-xs text-text-2 mt-1">pieces</p>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                    <p className="text-xs uppercase tracking-wide text-text-2 mb-1">Top Category</p>
                    <p className="text-lg font-semibold">
                      {topCategory?.[0]?.split(' ')[0] || 'N/A'}
                    </p>
                    <p className="text-xs text-text-2 mt-1">{topCategory?.[1]?.toLocaleString() || 0} pcs</p>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                    <p className="text-xs uppercase tracking-wide text-text-2 mb-1">Avg per Period</p>
                    <p className="text-2xl font-semibold">
                      {filteredRecords.length > 0 ? Math.round(grandTotal / filteredRecords.length).toLocaleString() : 0}
                    </p>
                    <p className="text-xs text-text-2 mt-1">pieces</p>
                  </div>
                  <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                    <p className="text-xs uppercase tracking-wide text-text-2 mb-1">Data Points</p>
                    <p className="text-2xl font-semibold">
                      {filteredRecords.length}
                    </p>
                    <p className="text-xs text-text-2 mt-1">records</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Revenue Per Item By Channel - real per-menu-item price (not rolled up to just the 7
          momo categories), split Offline vs Zomato vs Swiggy, from Ciferon's per-order item
          detail (Step D). Offline revenue is the item's real POS price (no commission to
          remove). Zomato/Swiggy revenue is each order's real net payout (from an uploaded
          settlement) split across its items proportional to their value share - i.e. already
          net of that order's discount and aggregator commission, not gross sale price. */}
      {(() => {
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

        // Product-type grouping (separate from momo category) so the table reads as
        // sections: Momos, Meals, Mania Combos, Platter, Extras (burgers + anything else -
        // drinks, desserts, addon lines).
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

        type ChannelKey = 'Offline' | 'Zomato' | 'Swiggy';
        const CHANNELS: ChannelKey[] = ['Offline', 'Zomato', 'Swiggy'];
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
        // independently within each group so the sort buttons don't scramble the sections.
        const groupedRows = GROUP_ORDER
          .map(group => ({
            group,
            rows: allRows
              .filter(row => row.group === group)
              .sort((a, b) => itemChannelSort.dir === 'desc' ? sortValue(b) - sortValue(a) : sortValue(a) - sortValue(b)),
          }))
          .filter(g => g.rows.length > 0);

        const toggleSort = (col: typeof itemChannelSort.col) => {
          setItemChannelSort(prev => prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' });
        };
        const sortArrow = (col: typeof itemChannelSort.col) => itemChannelSort.col === col ? (itemChannelSort.dir === 'desc' ? ' ▼' : ' ▲') : '';

        return (
          <div className="bg-surface rounded-2xl shadow-lg p-6 border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shadow-md flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-text" />
                </div>
                <h2 className="text-xl font-bold text-text tracking-tight">Revenue Per Item By Channel</h2>
              </div>
              {isClusterHead && (
                <button
                  onClick={handleSyncFromPOS}
                  disabled={isSyncingCategoryData}
                  className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm   transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {isSyncingCategoryData ? 'Syncing...' : 'Sync from POS'}
                </button>
              )}
            </div>
            <p className="text-sm text-text-2 mb-4">
              Every menu item, not rolled up to the 7 momo categories. Offline is the real POS price. Zomato/Swiggy
              are the real effective price after that order's discount and commission - only orders matched to an
              uploaded settlement count ({matchedOnlineOrders} of {totalOnlineOrders} online orders in this period
              matched so far; upload the settlement covering these dates in the Aggregator Payout tab to fill in the rest).
            </p>
            {hasData && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs text-text-3">Sort by:</span>
                {(['pcs', 'offline', 'zomato', 'swiggy'] as const).map(col => (
                  <button
                    key={col}
                    onClick={() => toggleSort(col)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                      itemChannelSort.col === col ? 'bg-primary text-white' : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                    }`}
                  >
                    {col === 'pcs' ? 'Total Pcs' : col}{sortArrow(col)}
                  </button>
                ))}
              </div>
            )}
            {!hasData ? (
              <p className="text-sm text-text-3">
                No POS-synced item detail in this period yet - {isClusterHead ? 'use "Sync from POS" above.' : 'ask a cluster head to sync from POS for this period.'}
              </p>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-2 px-3 font-semibold text-text-2">Menu Item</th>
                      <th className="text-left py-2 px-3 font-semibold text-text-2">Category</th>
                      {CHANNELS.map(ch => (
                        <th key={ch} colSpan={2} className="text-right py-2 px-3 font-semibold text-text-2 border-l border-border">{ch}</th>
                      ))}
                    </tr>
                    <tr className="border-b-2 border-border text-xs text-text-3">
                      <th className="py-1 px-3"></th>
                      <th className="py-1 px-3"></th>
                      {CHANNELS.map(ch => (
                        <React.Fragment key={ch}>
                          <th className="text-right py-1 px-3 font-normal border-l border-border">Pcs</th>
                          <th className="text-right py-1 px-3 font-normal">₹/Pc</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map(({ group, rows: groupRows }) => (
                      <React.Fragment key={group}>
                        <tr className="bg-success-soft">
                          <td colSpan={2 + CHANNELS.length * 2} className="py-1.5 px-3 font-semibold text-success text-xs uppercase tracking-wide">
                            {group}
                          </td>
                        </tr>
                        {groupRows.map(row => (
                          <tr key={row.productName} className="border-b border-border hover:bg-surface-2">
                            <td className="py-2 px-3 text-text">{row.productName}</td>
                            <td className="py-2 px-3 text-text-2">{row.category || '-'}</td>
                            {CHANNELS.map(ch => {
                              const v = row[ch];
                              return (
                                <React.Fragment key={ch}>
                                  <td className="py-2 px-3 text-right text-text-2 border-l border-border">{v.pieces > 0 ? v.pieces.toLocaleString() : '-'}</td>
                                  <td className="py-2 px-3 text-right font-semibold text-success">{v.pieces > 0 ? `₹${(v.revenue / v.pieces).toFixed(2)}` : '-'}</td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Real Order-Level Effective Price - exact (not estimated) figures, joining Ciferon's
          per-order item detail (Step D, OrderReport/Sale) to an uploaded settlement's own
          per-order payout via ExternalId = the settlement's Order ID. Each order's real net
          payout is split across its line items proportional to their share of the order's
          value, then aggregated per momo type - replacing the channel-blended and
          Plate-Config-price estimates with a real, commission-and-discount-adjusted number. */}
      {orderItemDetail.length > 0 && (() => {
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

        const hasMatches = matchedOrders > 0;

        return (
          <div className="bg-surface rounded-2xl shadow-lg p-6 border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shadow-md flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-text" />
              </div>
              <h2 className="text-xl font-bold text-text tracking-tight">Real Order-Level Effective Price</h2>
            </div>
            <p className="text-sm text-text-2 mb-4">
              Exact, not an estimate - each Zomato/Swiggy order's real payout (from an uploaded settlement) is matched
              to that same order's real momo content (from Ciferon) via its Order ID, then split across items
              proportional to their share of the order's value. {matchedOrders} of {totalOnlineOrders} online orders
              in this period matched an uploaded settlement ({offlineOrders} offline orders excluded - nothing to join them to).
            </p>
            {!hasMatches ? (
              <p className="text-sm text-text-3">
                No online orders in this period matched an uploaded settlement yet - upload the Zomato/Swiggy
                settlement covering these dates in the Aggregator Payout tab, then check back here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-2 px-3 font-semibold text-text-2">Momo Type</th>
                      <th className="text-right py-2 px-3 font-semibold text-text-2">Pieces (matched orders)</th>
                      <th className="text-right py-2 px-3 font-semibold text-text-2">Gross Value</th>
                      <th className="text-right py-2 px-3 font-semibold text-text-2">Net Payout</th>
                      <th className="text-right py-2 px-3 font-semibold text-text-2">Effective ₹/Momo</th>
                      <th className="text-right py-2 px-3 font-semibold text-text-2">Effective Plate Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(cat => {
                      const s = catStats[cat];
                      if (s.pieces === 0) return null;
                      const effectivePerMomo = s.netPayout / s.pieces;
                      const plates = piecesPerPlate[cat] || 6;
                      return (
                        <tr key={cat} className="border-b border-border hover:bg-surface-2">
                          <td className="py-2 px-3 text-text">{cat}</td>
                          <td className="py-2 px-3 text-right text-text-2">{s.pieces.toFixed(0)}</td>
                          <td className="py-2 px-3 text-right text-text-2">₹{s.grossValue.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-text-2">₹{s.netPayout.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-text">₹{effectivePerMomo.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-info">₹{(effectivePerMomo * plates).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Day of Week Analysis */}
      {salesRecords.length > 0 && (() => {
        // Group sales by day of week
        const dayOfWeekData: Record<string, { counts: Record<string, number[]>, dayName: string }> = {
          '0': { dayName: 'Sunday', counts: {} },
          '1': { dayName: 'Monday', counts: {} },
          '2': { dayName: 'Tuesday', counts: {} },
          '3': { dayName: 'Wednesday', counts: {} },
          '4': { dayName: 'Thursday', counts: {} },
          '5': { dayName: 'Friday', counts: {} },
          '6': { dayName: 'Saturday', counts: {} }
        };

        // Initialize category arrays for each day
        const categories = ['Chicken Momos', 'Chicken Cheese Momos', 'Veg Momos', 'Paneer Momos', 'Corn Cheese Momos', 'Chicken Kurkure Momos', 'Veg Kurkure Momos'];
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

        // Get data for selected day only - restructure so each category is its own row
        const selectedDayData = allDaysData.find(d => d.dayNum === selectedDayOfWeek);
        
        // Transform data: instead of one row with 7 columns, create 7 rows with category and average
        const chartData = selectedDayData ? categories.map((category, index) => ({
          category,
          average: selectedDayData[category],
          fill: getChartColor(index)
        })) : [];

        // Days of week for toggle buttons
        const daysOfWeek = [
          { num: 0, name: 'Sun', fullName: 'Sunday' },
          { num: 1, name: 'Mon', fullName: 'Monday' },
          { num: 2, name: 'Tue', fullName: 'Tuesday' },
          { num: 3, name: 'Wed', fullName: 'Wednesday' },
          { num: 4, name: 'Thu', fullName: 'Thursday' },
          { num: 5, name: 'Fri', fullName: 'Friday' },
          { num: 6, name: 'Sat', fullName: 'Saturday' }
        ];

        return (
          <div className="bg-surface rounded-2xl shadow-lg p-6 border border-border">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shadow-md flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-text" />
                </div>
                <h2 className="text-xl font-bold text-text tracking-tight">Weekly Pattern Analysis</h2>
              </div>
              <p className="text-sm text-text-2 mb-4">
                Average momo sales by day of the week across all records
              </p>
              
              {/* Day Toggle Buttons */}
              <div className="flex gap-2 flex-wrap">
                {daysOfWeek.map((day) => (
                  <button
                    key={day.num}
                    onClick={() => setSelectedDayOfWeek(day.num)}
                    className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform ${
                      selectedDayOfWeek === day.num
                        ? 'bg-surface border border-border   text-text shadow-lg'
                        : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                    }`}
                  >
                    {day.name}
                  </button>
                ))}
              </div>
            </div>

{/* Metrics Grid for Selected Day */}
            {(() => {
              // Find best day for each category (across all days) for comparison
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
              
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {categories.map((category, index) => {
                    const current = selectedDayFullData?.[category] || 0;
                    const bestDay = bestDays[category];
                    
                    // Calculate percentage compared to best day
                    let percentDiff = 0;
                    const isBestDay = selectedDayFullData?.day === bestDay.day;
                    
                    if (bestDay.avg > 0 && current > 0) {
                      percentDiff = ((current - bestDay.avg) / bestDay.avg) * 100;
                    }
                    
                    const color = getChartColor(index);
                    
                    return (
                      <div 
                        key={category}
                        className="bg-surface-2 rounded-xl p-5 border-2 border-border hover:shadow-lg transition-all duration-300"
                        style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-sm font-semibold text-text-2">{category}</h3>
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: color }}
                          />
                        </div>
                        
                        <div className="mb-3">
                          <p className="text-4xl font-bold text-text mb-1">
                            {Math.round(current).toLocaleString()}
                          </p>
                          <p className="text-xs text-text-3">avg pieces/day</p>
                        </div>
                        
                        {isBestDay ? (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-warning-soft">
                            <span className="text-xs font-semibold text-warning">
                              🏆 Best day
                            </span>
                          </div>
                        ) : current > 0 && bestDay.avg > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                                percentDiff >= 0 ? 'bg-success-soft' : 'bg-danger-soft'
                              }`}>
                                {percentDiff >= 0 ? <ArrowUp className="w-3 h-3 text-success" /> : <ArrowDown className="w-3 h-3 text-danger" />}
                                <span className={`text-xs font-semibold ${
                                  percentDiff >= 0 ? 'text-success' : 'text-danger'
                                }`}>
                                  {Math.abs(percentDiff).toFixed(1)}%
                                </span>
                              </div>
                              <span className="text-xs text-text-3">
                                vs {bestDay.day.slice(0, 3)}
                              </span>
                            </div>
                            <p className="text-xs text-text-3">
                              Best: {Math.round(bestDay.avg)} on {bestDay.day}
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs text-text-3">
                            No sales data
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Day of Week Insights */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(() => {
                // Find best day for each category (across all days)
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

                // Find overall busiest day
                const busiestDay = allDaysData.reduce((prev, curr) => {
                  const prevTotal = categories.reduce((sum, cat) => sum + (prev[cat] || 0), 0);
                  const currTotal = categories.reduce((sum, cat) => sum + (curr[cat] || 0), 0);
                  return currTotal > prevTotal ? curr : prev;
                });
                
                const busiestDayTotal = categories.reduce((sum, cat) => sum + (busiestDay[cat] || 0), 0);

                // Find quietest day
                const quietestDay = allDaysData.reduce((prev, curr) => {
                  const prevTotal = categories.reduce((sum, cat) => sum + (prev[cat] || 0), 0);
                  const currTotal = categories.reduce((sum, cat) => sum + (curr[cat] || 0), 0);
                  return currTotal < prevTotal ? curr : prev;
                });
                
                const quietestDayTotal = categories.reduce((sum, cat) => sum + (quietestDay[cat] || 0), 0);

                // Find most popular item on the CURRENTLY SELECTED day
                const selectedDayFullData = allDaysData.find(d => d.dayNum === selectedDayOfWeek);
                const topItemOnSelectedDay = selectedDayFullData ? 
                  Object.entries(selectedDayFullData)
                    .filter(([key]) => categories.includes(key))
                    .sort((a, b) => (b[1] as number) - (a[1] as number))[0]
                  : null;

                return (
                  <>
                    <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                      <p className="text-xs uppercase tracking-wide text-text-2 mb-1">🔥 Busiest Day</p>
                      <p className="text-xl font-semibold">
                        {busiestDay.day}
                      </p>
                      <p className="text-xs text-text-2 mt-1">{busiestDayTotal.toLocaleString()} pcs avg</p>
                    </div>
                    <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                      <p className="text-xs uppercase tracking-wide text-text-2 mb-1">📉 Quietest Day</p>
                      <p className="text-xl font-semibold">
                        {quietestDay.day}
                      </p>
                      <p className="text-xs text-text-2 mt-1">{quietestDayTotal.toLocaleString()} pcs avg</p>
                    </div>
                    <div className="bg-surface border border-border rounded-xl p-4 shadow-lg text-text">
                      <p className="text-xs uppercase tracking-wide text-text-2 mb-1">⭐ Top Seller Today</p>
                      <p className="text-base font-semibold">
                        {topItemOnSelectedDay?.[0] || 'N/A'}
                      </p>
                      <p className="text-xs text-text-2 mt-1">
                        {topItemOnSelectedDay ? `${(topItemOnSelectedDay[1] as number).toLocaleString()} pcs avg` : 'No data'}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Sales Records - date filter (collapsed by default) so this doesn't render every
          record ever uploaded, all expanded, in one indefinitely-scrolling list. */}
      {salesRecords.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRecordsFilter(!showRecordsFilter)}
            className="w-full flex items-center justify-between gap-2 px-4 sm:px-6 py-3 text-left"
          >
            <span className="text-sm font-semibold text-text-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-3" />
              Filter by Date
              <span className="text-xs font-normal text-text-3">
                ({filteredSalesRecords.length} of {salesRecords.length} record{salesRecords.length !== 1 ? 's' : ''})
              </span>
            </span>
            {showRecordsFilter ? <ChevronUp className="w-5 h-5 text-text-3" /> : <ChevronDown className="w-5 h-5 text-text-3" />}
          </button>
          {showRecordsFilter && (
            <div className="px-4 sm:px-6 pb-4">
              <select
                value={recordsDateFilter}
                onChange={(e) => setRecordsDateFilter(e.target.value as TimeFilter)}
                className="sm:hidden w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface text-text mb-2"
              >
                {(['today', 'yesterday', 'thisWeek', 'previousWeek', 'thisMonth', 'previousMonth', 'custom'] as TimeFilter[]).map((f) => (
                  <option key={f} value={f}>{f === 'previousWeek' ? 'Last Week' : f === 'previousMonth' ? 'Last Month' : f.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</option>
                ))}
              </select>
              <div className="hidden sm:flex gap-2 flex-wrap">
                {(['today', 'yesterday', 'thisWeek', 'previousWeek', 'thisMonth', 'previousMonth', 'custom'] as TimeFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRecordsDateFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                      recordsDateFilter === f ? 'bg-primary text-white' : 'bg-surface-2 text-text-2 hover:bg-surface-3'
                    }`}
                  >
                    {f === 'previousWeek' ? 'Last Week' : f === 'previousMonth' ? 'Last Month' : f.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}
                  </button>
                ))}
              </div>
              {recordsDateFilter === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <DatePicker
                    label="From Date"
                    value={recordsCustomRange.from}
                    onChange={(date) => setRecordsCustomRange({ ...recordsCustomRange, from: date })}
                  />
                  <DatePicker
                    label="To Date"
                    value={recordsCustomRange.to}
                    onChange={(date) => setRecordsCustomRange({ ...recordsCustomRange, to: date })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {filteredSalesRecords.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-lg p-12 text-center border border-border">
          <FileSpreadsheet className="w-16 h-16 text-text-disabled mx-auto mb-4" />
          <h3 className="text-xl font-bold text-text mb-2">{salesRecords.length === 0 ? 'No Sales Data Yet' : 'No records in this date range'}</h3>
          <p className="text-text-2">{salesRecords.length === 0 ? 'Upload your first sales file to get started' : 'Try a wider date range above.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSalesRecords.map((record, idx) => {
            const totalPieces = getTotalPieces(record.data);
            const recordDate = new Date(record.date);
            const isCollapsed = collapsedRecords.has(record.id);
            
            // Resolve store name - fallback to context.stores if record.storeName is missing or "Unknown Store"
            const displayStoreName = record.storeName && record.storeName !== 'Unknown Store'
              ? record.storeName
              : (context.stores?.find(s => s.id === record.storeId)?.name || record.storeName || 'Unknown Store');
            
            return (
              <div key={record.id} className="bg-surface rounded-2xl shadow-lg border border-border overflow-hidden hover:shadow-xl transition-shadow duration-300">
                {/* Header */}
                <div 
                  className="bg-surface border border-border p-4 text-text cursor-pointer"
                  onClick={() => toggleRecordCollapse(record.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5" />
                      <div>
                        <h3 className="font-semibold">
                          {recordDate.toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h3>
                        <p className="text-sm text-text-2">
                          {displayStoreName} • Total: {totalPieces.toLocaleString()} pieces
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(record.id);
                        }}
                        className="p-2 hover:bg-surface rounded-lg transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        className="p-2 hover:bg-surface rounded-lg transition-all duration-300"
                        title={isCollapsed ? "Expand" : "Collapse"}
                      >
                        <svg 
                          className={`w-5 h-5 transform transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Category Grid */}
                {!isCollapsed && (
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {Object.entries(record.data).map(([category, count], index) => {
                        const safeCount = count || 0;
                        const percentage = totalPieces > 0 ? ((safeCount / totalPieces) * 100).toFixed(1) : '0';
                        const color = getChartColor(index);
                        const piecesPerPlateValue = piecesPerPlate[category as keyof CategoryData] || 6;
                        const plates = Math.floor(safeCount / piecesPerPlateValue);
                        
                        return (
                          <div 
                            key={category} 
                            className="bg-surface-2 rounded-xl p-4 border-2 border-border hover:shadow-md transition-all duration-300"
                            style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Package className="w-5 h-5 text-text-3" />
                              <span className="text-xs font-semibold text-text-3 bg-surface-3 px-2 py-1 rounded-full">
                                {percentage}%
                              </span>
                            </div>
                            <h4 className="text-sm text-text-2 mb-1">{category}</h4>
                            <p className="text-2xl text-text" style={{ fontWeight: '700' }}>
                              {safeCount.toLocaleString()}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-text-3">pieces</p>
                              <span className="text-xs text-text-3">•</span>
                              <p className="text-xs text-text-2 font-semibold">{plates} plates</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Upload Info */}
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm text-text-3">
                      {record.uploadedBy === 'pos-sync' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-info-soft text-info text-xs font-medium rounded-full border border-info-border">
                          ✓ Auto-synced from Ciferon POS
                        </span>
                      ) : (
                        <span>Uploaded by {record.uploadedBy}</span>
                      )}
                      <span>{new Date(record.uploadedAt).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
