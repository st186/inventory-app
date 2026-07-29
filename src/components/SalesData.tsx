import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Calendar, TrendingUp, Package, Trash2, Download, FileSpreadsheet, CheckCircle, AlertCircle, BarChart3, Settings, TrendingDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { DatePicker } from './DatePicker';

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
function classifyMomoCategory(nameLower: string): keyof CategoryData | null {
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

interface SalesRecord {
  id: string;
  date: string;
  storeId: string;
  storeName?: string;
  data: CategoryData;
  channelBreakdown?: ChannelBreakdown;
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
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [dateRange, setDateRange] = useState({ 
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(new Date().getDay()); // 0-6 for Sun-Sat
  const [showPlateConfig, setShowPlateConfig] = useState(false);
  const [piecesPerPlate, setPiecesPerPlate] = useState<Record<keyof CategoryData, number>>(DEFAULT_PIECES_PER_PLATE);
  const [pricePerPlate, setPricePerPlate] = useState<Record<keyof CategoryData, number>>(DEFAULT_PRICE_PER_PLATE);
  const [isSavingPlateConfig, setIsSavingPlateConfig] = useState(false);
  const [collapsedRecords, setCollapsedRecords] = useState<Set<string>>(new Set());
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId || null;

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
  }, [effectiveStoreId]);

  // Aggregator settlements - used to work out a blended commission rate for whatever
  // period is currently selected, for the profitability-after-commission breakdown below.
  const [aggregatorSettlements, setAggregatorSettlements] = useState<api.AggregatorSettlement[]>([]);
  useEffect(() => {
    if (!context.user?.accessToken) return;
    const storeIdParam = effectiveStoreId || undefined;
    api.getAggregatorSettlements(context.user.accessToken, storeIdParam).then(setAggregatorSettlements).catch(() => {});
  }, [context.user?.accessToken, effectiveStoreId]);

  // Pulls momo-category sales for the selected period straight from Ciferon (via the same
  // POS sync used for cash/Paytm figures elsewhere), instead of requiring a manual XLSX
  // upload for every day. Cluster-head only (matches the backfill route's own gate).
  const [isSyncingCategoryData, setIsSyncingCategoryData] = useState(false);
  const isClusterHead = context.user?.role === 'cluster_head';
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
      await loadSalesData();
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
      
      // Filter by store if needed
      if (effectiveStoreId) {
        records = records.filter(r => r.storeId === effectiveStoreId);
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
  const processXLSXFile = (file: File): Promise<CategoryData> => {
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
      if (['drink', 'cola', 'campa', 'water', 'beverage', 'soup'].some(x => nameLower.includes(x))) {
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
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Upload Section */}
      <div className="bg-gradient-to-br from-orange-50 to-rose-50 rounded-2xl shadow-lg p-6 border border-orange-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl text-gray-900 mb-2 flex items-center gap-3">
              <FileSpreadsheet className="w-7 h-7 text-orange-600" />
              Daily Sales Data
            </h2>
            <p className="text-sm text-gray-600">
              Upload daily sales XLSX files to track momo sales by category
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              max={new Date().toISOString().split('T')[0]}
            />
            
            <button
              onClick={() => setShowPlateConfig(!showPlateConfig)}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-xl hover:from-blue-700 hover:to-blue-700 transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">Plate Config</span>
            </button>

            {isClusterHead && (
              <button
                onClick={handleSyncFromPOS}
                disabled={isSyncingCategoryData}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                title="Pull momo category counts for the selected period straight from Ciferon POS, instead of uploading an XLSX for each day"
              >
                <Package className="w-4 h-4" />
                <span className="font-medium">{isSyncingCategoryData ? 'Syncing...' : 'Sync from POS'}</span>
              </button>
            )}

            <label className={`px-6 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl hover:from-orange-700 hover:to-red-700 transition-all duration-300 cursor-pointer flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">File Format Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Must contain columns: <code className="bg-blue-100 px-1 rounded">Item</code> and <code className="bg-blue-100 px-1 rounded">Total Quantity</code></li>
                <li>Item names should include momo type (e.g., "Chicken Pan-Fried Momos (8 pcs)")</li>
                <li>Quantity should be the number of plates/items sold</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Plate Configuration Modal */}
      {showPlateConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-sky-600 p-6 text-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Plate Configuration</h3>
                  <p className="text-sm text-blue-100">Set how many pieces are in each plate for each momo type</p>
                </div>
                <button
                  onClick={() => setShowPlateConfig(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <AlertCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {(Object.keys(piecesPerPlate) as Array<keyof CategoryData>).map((category, index) => (
                <div key={category} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: getChartColor(index) }}
                    />
                    <label className="text-gray-900 font-medium">{category}</label>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={piecesPerPlate[category]}
                        onChange={(e) => updatePlateConfig(category, parseInt(e.target.value) || 6)}
                        className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-center font-semibold"
                      />
                      <span className="text-gray-600 text-sm">pcs/plate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 text-sm">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={pricePerPlate[category]}
                        onChange={(e) => updatePriceConfig(category, parseFloat(e.target.value) || 0)}
                        className="w-24 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-center font-semibold"
                      />
                      <span className="text-gray-600 text-sm">/plate</span>
                    </div>
                  </div>
                </div>
              ))}
              {isSavingPlateConfig && <p className="text-xs text-gray-400">Saving...</p>}
            </div>
            
            <div className="p-6 bg-blue-50 border-t-2 border-blue-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-1">How it works:</p>
                  <p>
                    This configuration determines how pieces are converted to plates in the display.
                    For example, if Chicken Momos has 6 pieces/plate and you sold 262 pieces,
                    it will show as <span className="font-mono bg-white px-2 py-1 rounded">262 pcs / 44 plates</span>.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowPlateConfig(false)}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-xl hover:from-blue-700 hover:to-blue-700 transition-all shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Analytics Charts */}
      {salesRecords.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl text-gray-900 mb-2 flex items-center gap-3">
                <BarChart3 className="w-7 h-7 text-teal-600" />
                Sales Trends by Category
              </h2>
              <p className="text-sm text-gray-600">
                Analyze momo sales patterns across different time periods
              </p>
            </div>
            
            {/* Time Filter */}
            <div className="flex gap-2 flex-wrap">
              {(['today', 'yesterday', 'thisWeek', 'previousWeek', 'thisMonth', 'previousMonth', 'thisYear', 'lastYear', 'custom'] as TimeFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform hover:scale-105 ${
                    timeFilter === filter
                      ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {getFilterLabel(filter)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {timeFilter === 'custom' && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
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
                      className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-5 border-2 border-gray-200 hover:shadow-lg transition-all duration-300 hover:scale-102"
                      style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">{category}</h3>
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: color }}
                        />
                      </div>
                      
                      <div className="mb-3">
                        <p className="text-4xl font-bold text-gray-900 mb-1">
                          {current.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">pieces sold</p>
                      </div>
                      
                      {previous > 0 && (
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                            isIncrease ? 'bg-green-100' : isDecrease ? 'bg-red-100' : 'bg-gray-100'
                          }`}>
                            {isIncrease && <ArrowUp className="w-3 h-3 text-green-600" />}
                            {isDecrease && <ArrowDown className="w-3 h-3 text-red-600" />}
                            <span className={`text-xs font-semibold ${
                              isIncrease ? 'text-green-700' : isDecrease ? 'text-red-700' : 'text-gray-700'
                            }`}>
                              {Math.abs(percentChange).toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            vs previous
                          </span>
                        </div>
                      )}
                      
                      {previous === 0 && current > 0 && (
                        <div className="text-xs text-blue-600 font-medium">
                          New sales in this period
                        </div>
                      )}
                      
                      {previous === 0 && current === 0 && (
                        <div className="text-xs text-gray-400">
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

              let filteredRecords = [...salesRecords];
              
              if (timeFilter === 'custom') {
                filteredRecords = filteredRecords.filter(r => 
                  r.date >= dateRange.from && r.date <= dateRange.to
                );
              } else {
                const today = new Date();
                const cutoffDate = new Date();
                
                if (timeFilter === 'today') {
                  cutoffDate.setDate(today.getDate());
                } else if (timeFilter === 'yesterday') {
                  cutoffDate.setDate(today.getDate() - 1);
                } else if (timeFilter === 'thisWeek') {
                  cutoffDate.setDate(today.getDate() - today.getDay());
                } else if (timeFilter === 'previousWeek') {
                  cutoffDate.setDate(today.getDate() - today.getDay() - 7);
                } else if (timeFilter === 'thisMonth') {
                  cutoffDate.setMonth(today.getMonth());
                  cutoffDate.setDate(1);
                } else if (timeFilter === 'previousMonth') {
                  cutoffDate.setMonth(today.getMonth() - 1);
                  cutoffDate.setDate(1);
                } else if (timeFilter === 'thisYear') {
                  cutoffDate.setFullYear(today.getFullYear());
                  cutoffDate.setMonth(0);
                  cutoffDate.setDate(1);
                } else if (timeFilter === 'lastYear') {
                  cutoffDate.setFullYear(today.getFullYear() - 1);
                  cutoffDate.setMonth(0);
                  cutoffDate.setDate(1);
                }
                
                filteredRecords = filteredRecords.filter(r => 
                  new Date(r.date) >= cutoffDate
                );
              }

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
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-4 border-2 border-teal-200">
                    <p className="text-sm text-gray-600 mb-1">Total Sales</p>
                    <p className="text-2xl text-gray-900" style={{ fontWeight: '700' }}>
                      {grandTotal.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">pieces</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-2 border-orange-200">
                    <p className="text-sm text-gray-600 mb-1">Top Category</p>
                    <p className="text-lg text-gray-900" style={{ fontWeight: '600' }}>
                      {topCategory?.[0]?.split(' ')[0] || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{topCategory?.[1]?.toLocaleString() || 0} pcs</p>
                  </div>
                  <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl p-4 border-2 border-rose-200">
                    <p className="text-sm text-gray-600 mb-1">Avg per Period</p>
                    <p className="text-2xl text-gray-900" style={{ fontWeight: '700' }}>
                      {filteredRecords.length > 0 ? Math.round(grandTotal / filteredRecords.length).toLocaleString() : 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">pieces</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200">
                    <p className="text-sm text-gray-600 mb-1">Data Points</p>
                    <p className="text-2xl text-gray-900" style={{ fontWeight: '700' }}>
                      {filteredRecords.length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">records</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Momos Sold Per Day - same period filter as the trends above */}
      {salesRecords.length > 0 && (() => {
        const { start, end } = getDateRange(timeFilter, timeFilter === 'custom' ? dateRange : undefined);
        const rows = [...salesRecords]
          .filter(r => r.date >= start && r.date <= end)
          .sort((a, b) => b.date.localeCompare(a.date));
        const categories = Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>;

        return (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl text-gray-900 mb-4 flex items-center gap-3">
              <Package className="w-7 h-7 text-teal-600" />
              Momos Sold Per Day
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">No records in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Date</th>
                      {categories.map(cat => (
                        <th key={cat} className="text-right py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">{cat.replace(' Momos', '')}</th>
                      ))}
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const rowTotal = categories.reduce((sum, cat) => sum + (r.data[cat] || 0), 0);
                      return (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-700">{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                          {categories.map(cat => (
                            <td key={cat} className="py-2 px-3 text-right text-gray-700">{(r.data[cat] || 0).toLocaleString()}</td>
                          ))}
                          <td className="py-2 px-3 text-right font-semibold text-gray-900">{rowTotal.toLocaleString()}</td>
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

      {/* Revenue Per Momo By Channel - real per-item, per-channel figures from Ciferon's
          SaleCount PlatformList (POS/Zomato/Swiggy/...), not an estimate. Only covers dates
          synced via "Sync from POS" - manually-uploaded XLSX records have no channel detail
          (Item/Total Quantity columns only), so they're excluded here. */}
      {salesRecords.length > 0 && (() => {
        const { start, end } = getDateRange(timeFilter, timeFilter === 'custom' ? dateRange : undefined);
        const periodRecords = salesRecords.filter(r => r.date >= start && r.date <= end && r.channelBreakdown);
        const categories = Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>;

        // channel -> category -> { pieces, revenue, dailyAvg[] } (dailyAvg tracks each day's
        // own revenue/piece so we can show the variance across the period, not just one
        // blended number for the whole range)
        const channelSet = new Set<string>();
        const agg: Record<string, Record<string, { pieces: number; revenue: number; dailyAvgs: number[] }>> = {};
        categories.forEach(cat => { agg[cat] = {}; });

        periodRecords.forEach(r => {
          categories.forEach(cat => {
            const byChannel = r.channelBreakdown?.[cat] || {};
            Object.entries(byChannel).forEach(([channel, v]) => {
              channelSet.add(channel);
              if (!agg[cat][channel]) agg[cat][channel] = { pieces: 0, revenue: 0, dailyAvgs: [] };
              agg[cat][channel].pieces += v.pieces;
              agg[cat][channel].revenue += v.revenue;
              if (v.pieces > 0) agg[cat][channel].dailyAvgs.push(v.revenue / v.pieces);
            });
          });
        });

        const channels = Array.from(channelSet);
        const hasData = periodRecords.length > 0 && channels.length > 0;

        return (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl text-gray-900 mb-2 flex items-center gap-3">
              <TrendingUp className="w-7 h-7 text-teal-600" />
              Revenue Per Momo By Channel
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Real per-item revenue from Ciferon (not an estimate) - only covers dates synced via "Sync from POS" above.
              Multiply by pieces/plate in Plate Config to get a real plate price per channel.
            </p>
            {!hasData ? (
              <p className="text-sm text-gray-500">No POS-synced data with channel detail in this period yet - use "Sync from POS" above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Momo Type</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Channel</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Pieces</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Revenue</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Avg ₹/Momo</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Daily Range (₹/Momo)</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Suggested Plate Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(cat => channels.map(channel => {
                      const v = agg[cat][channel];
                      if (!v || v.pieces === 0) return null;
                      const avg = v.revenue / v.pieces;
                      const dailyMin = Math.min(...v.dailyAvgs);
                      const dailyMax = Math.max(...v.dailyAvgs);
                      const plates = piecesPerPlate[cat] || 6;
                      return (
                        <tr key={`${cat}-${channel}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-900">{cat}</td>
                          <td className="py-2 px-3 text-gray-700">{channel}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{v.pieces.toFixed(0)}</td>
                          <td className="py-2 px-3 text-right text-gray-700">₹{v.revenue.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-gray-900">₹{avg.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right text-gray-500">
                            {v.dailyAvgs.length > 1 ? `₹${dailyMin.toFixed(2)} - ₹${dailyMax.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-teal-700">₹{(avg * plates).toFixed(2)}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Profitability After Commission - estimated, using the plate config's selling price
          and a blended commission rate (this period's total netCommission / grossSales from
          uploaded aggregator settlements) applied per type. Item-level commission isn't
          available from Swiggy/Zomato's settlement reports (order-level only, no per-item
          breakdown), so this is a period-wide rate applied uniformly, not an exact figure. */}
      {salesRecords.length > 0 && (() => {
        const { start, end } = getDateRange(timeFilter, timeFilter === 'custom' ? dateRange : undefined);
        const periodRecords = salesRecords.filter(r => r.date >= start && r.date <= end);
        const categoryTotals: Record<string, number> = {};
        (Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>).forEach(cat => { categoryTotals[cat] = 0; });
        periodRecords.forEach(r => {
          Object.entries(r.data).forEach(([category, count]) => {
            if (category in categoryTotals) categoryTotals[category] += count;
          });
        });

        const periodSettlements = aggregatorSettlements.filter(s => s.settlementDate >= start && s.settlementDate <= end);
        const totalGross = periodSettlements.reduce((sum, s) => sum + s.grossSales, 0);
        const totalCommission = periodSettlements.reduce((sum, s) => sum + s.netCommission, 0);
        const blendedCommissionRate = totalGross > 0 ? totalCommission / totalGross : 0;

        const hasAnyPrice = Object.values(pricePerPlate).some(p => p > 0);

        return (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl text-gray-900 mb-2 flex items-center gap-3">
              <TrendingUp className="w-7 h-7 text-orange-600" />
              Profitability After Commission
            </h2>
            <p className="text-sm text-gray-600 mb-1">
              Estimated - {periodSettlements.length > 0
                ? `blended commission rate for this period: ${(blendedCommissionRate * 100).toFixed(1)}%`
                : 'no aggregator settlements uploaded for this period yet, so commission is assumed to be 0%'}
            </p>
            {!hasAnyPrice && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                Set a selling price per plate in Plate Config to see real revenue and profit figures below - they're ₹0 until then.
              </p>
            )}
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Momo Type</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Plates Sold</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Price/Plate</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Est. Revenue</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Est. Commission</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Profit/Plate</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(DEFAULT_PIECES_PER_PLATE) as Array<keyof CategoryData>).map(cat => {
                    const pieces = categoryTotals[cat] || 0;
                    const plates = piecesPerPlate[cat] > 0 ? pieces / piecesPerPlate[cat] : 0;
                    const price = pricePerPlate[cat] || 0;
                    const revenue = plates * price;
                    const commission = revenue * blendedCommissionRate;
                    const profitPerPlate = price - (price * blendedCommissionRate);
                    return (
                      <tr key={cat} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-900">{cat}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{plates.toFixed(1)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">₹{price.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">₹{revenue.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-red-600">₹{commission.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-green-700">₹{profitPerPlate.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="mb-6">
              <h2 className="text-2xl text-gray-900 mb-2 flex items-center gap-3">
                <TrendingUp className="w-7 h-7 text-blue-600" />
                Weekly Pattern Analysis
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Average momo sales by day of the week across all records
              </p>
              
              {/* Day Toggle Buttons */}
              <div className="flex gap-2 flex-wrap">
                {daysOfWeek.map((day) => (
                  <button
                    key={day.num}
                    onClick={() => setSelectedDayOfWeek(day.num)}
                    className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform hover:scale-105 ${
                      selectedDayOfWeek === day.num
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                        className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-5 border-2 border-gray-200 hover:shadow-lg transition-all duration-300 hover:scale-102"
                        style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700">{category}</h3>
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: color }}
                          />
                        </div>
                        
                        <div className="mb-3">
                          <p className="text-4xl font-bold text-gray-900 mb-1">
                            {Math.round(current).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">avg pieces/day</p>
                        </div>
                        
                        {isBestDay ? (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-100">
                            <span className="text-xs font-semibold text-yellow-700">
                              🏆 Best day
                            </span>
                          </div>
                        ) : current > 0 && bestDay.avg > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                                percentDiff >= 0 ? 'bg-green-100' : 'bg-red-100'
                              }`}>
                                {percentDiff >= 0 ? <ArrowUp className="w-3 h-3 text-green-600" /> : <ArrowDown className="w-3 h-3 text-red-600" />}
                                <span className={`text-xs font-semibold ${
                                  percentDiff >= 0 ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {Math.abs(percentDiff).toFixed(1)}%
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                vs {bestDay.day.slice(0, 3)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">
                              Best: {Math.round(bestDay.avg)} on {bestDay.day}
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">
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
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-200">
                      <p className="text-sm text-gray-600 mb-1">🔥 Busiest Day</p>
                      <p className="text-xl text-gray-900" style={{ fontWeight: '700' }}>
                        {busiestDay.day}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{busiestDayTotal.toLocaleString()} pcs avg</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-2 border-orange-200">
                      <p className="text-sm text-gray-600 mb-1">📉 Quietest Day</p>
                      <p className="text-xl text-gray-900" style={{ fontWeight: '700' }}>
                        {quietestDay.day}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{quietestDayTotal.toLocaleString()} pcs avg</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-2 border-orange-200">
                      <p className="text-sm text-gray-600 mb-1">⭐ Top Seller Today</p>
                      <p className="text-base text-gray-900" style={{ fontWeight: '600' }}>
                        {topItemOnSelectedDay?.[0] || 'N/A'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
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

      {/* Sales Records */}
      {salesRecords.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-100">
          <FileSpreadsheet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl text-gray-900 mb-2">No Sales Data Yet</h3>
          <p className="text-gray-600">Upload your first sales file to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {salesRecords.map((record, idx) => {
            const totalPieces = getTotalPieces(record.data);
            const recordDate = new Date(record.date);
            const isCollapsed = collapsedRecords.has(record.id);
            
            // Resolve store name - fallback to context.stores if record.storeName is missing or "Unknown Store"
            const displayStoreName = record.storeName && record.storeName !== 'Unknown Store'
              ? record.storeName
              : (context.stores?.find(s => s.id === record.storeId)?.name || record.storeName || 'Unknown Store');
            
            return (
              <div key={record.id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300">
                {/* Header */}
                <div 
                  className="bg-gradient-to-r from-orange-500 to-amber-500 p-4 text-white cursor-pointer"
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
                        <p className="text-sm text-orange-100">
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
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        className="p-2 hover:bg-white/20 rounded-lg transition-all duration-300"
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
                            className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border-2 border-gray-200 hover:shadow-md transition-all duration-300 hover:scale-105"
                            style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <Package className="w-5 h-5 text-gray-400" />
                              <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                                {percentage}%
                              </span>
                            </div>
                            <h4 className="text-sm text-gray-600 mb-1">{category}</h4>
                            <p className="text-2xl text-gray-900" style={{ fontWeight: '700' }}>
                              {safeCount.toLocaleString()}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-gray-500">pieces</p>
                              <span className="text-xs text-gray-400">•</span>
                              <p className="text-xs text-gray-600 font-semibold">{plates} plates</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Upload Info */}
                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
                      {record.uploadedBy === 'pos-sync' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full border border-purple-300/50">
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