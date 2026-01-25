import { useState, useEffect } from 'react';
import { Upload, Calendar, TrendingUp, Package, Trash2, Download, FileSpreadsheet, CheckCircle, AlertCircle, BarChart3, Settings } from 'lucide-react';
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

interface SalesRecord {
  id: string;
  date: string;
  storeId: string;
  storeName?: string;
  data: CategoryData;
  uploadedBy: string;
  uploadedAt: string;
}

type TimeFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

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

export function SalesData({ context, selectedStoreId }: SalesDataProps) {
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('daily');
  const [dateRange, setDateRange] = useState({ 
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(new Date().getDay()); // 0-6 for Sun-Sat
  const [showPlateConfig, setShowPlateConfig] = useState(false);
  const [piecesPerPlate, setPiecesPerPlate] = useState<Record<keyof CategoryData, number>>(DEFAULT_PIECES_PER_PLATE);
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId || null;

  // Load plate configuration from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('momoPlateConfig');
    if (savedConfig) {
      try {
        setPiecesPerPlate(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Failed to load plate config:', e);
      }
    }
  }, []);

  // Save plate configuration to localStorage whenever it changes
  const updatePlateConfig = (category: keyof CategoryData, pieces: number) => {
    const newConfig = { ...piecesPerPlate, [category]: pieces };
    setPiecesPerPlate(newConfig);
    localStorage.setItem('momoPlateConfig', JSON.stringify(newConfig));
  };

  useEffect(() => {
    loadSalesData();
  }, [effectiveStoreId]);

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
      // RULE 1: Mania Combos (Exclude)
      // -------------------------------------------------
      if (nameLower.includes('mania') && nameLower.includes('combo')) {
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
      let category: keyof CategoryData | 'Other' = 'Other';
      
      // Priority: Kurkure
      if (nameLower.includes('kurkure')) {
        if (nameLower.includes('chicken')) {
          category = 'Chicken Kurkure Momos';
        } else if (nameLower.includes('veg')) {
          category = 'Veg Kurkure Momos';
        }
      }
      // Specific Fillings
      else if (nameLower.includes('paneer')) {
        category = 'Paneer Momos';
      } else if (nameLower.includes('corn') && nameLower.includes('cheese')) {
        category = 'Corn Cheese Momos';
      } else if (nameLower.includes('chicken') && nameLower.includes('cheese')) {
        category = 'Chicken Cheese Momos';
      }
      // General Fillings
      else if (nameLower.includes('chicken')) {
        category = 'Chicken Momos';
      } else if (nameLower.includes('veg')) {
        category = 'Veg Momos';
      }
      
      // Add to total if it matches a tracked category
      if (category in result) {
        result[category as keyof CategoryData] += totalPieces;
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
    // Expected format: "Itemwise sales_StoreName_DD_MM_YYYY-DD_MM_YYYY.xlsx"
    let extractedDate = selectedDate; // Default to manually selected date
    
    const datePattern = /_(\d{2})_(\d{2})_(\d{4})-\d{2}_\d{2}_\d{4}\./;
    const match = file.name.match(datePattern);
    
    if (match) {
      const [, day, month, year] = match;
      // Convert DD_MM_YYYY to YYYY-MM-DD format
      extractedDate = `${year}-${month}-${day}`;
      console.log(`📅 Extracted date from filename: ${file.name} -> ${extractedDate}`);
      
      // Update the selected date in the UI to reflect the extracted date
      setSelectedDate(extractedDate);
    } else {
      console.warn('⚠️ Could not extract date from filename, using manually selected date:', selectedDate);
    }
    
    if (!extractedDate) {
      toast.error('Please select a date or use a filename with date format: StoreName_DD_MM_YYYY-DD_MM_YYYY.xlsx');
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
        date: extractedDate, // Use extracted date instead of selectedDate
        storeId: effectiveStoreId,
        storeName,
        data: categoryData,
        uploadedBy: context.user?.name || 'Unknown',
        uploadedAt: new Date().toISOString()
      };
      
      // Save to backend
      await api.saveSalesData(record, context.user?.accessToken || '');
      
      toast.success(`✅ Sales data uploaded for ${extractedDate}!`);
      
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
      '#8b5cf6', // purple - Chicken Kurkure Momos
      '#06b6d4'  // cyan - Veg Kurkure Momos
    ];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Upload Section */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl shadow-lg p-6 border border-purple-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl text-gray-900 mb-2 flex items-center gap-3">
              <FileSpreadsheet className="w-7 h-7 text-purple-600" />
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
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">Plate Config</span>
            </button>
            
            <label className={`px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-300 cursor-pointer flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white rounded-t-2xl">
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
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={piecesPerPlate[category]}
                      onChange={(e) => updatePlateConfig(category, parseInt(e.target.value) || 6)}
                      className="w-20 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-center font-semibold"
                    />
                    <span className="text-gray-600 text-sm">pieces/plate</span>
                  </div>
                </div>
              ))}
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
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
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
              {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTimeFilter(filter as TimeFilter)}
                  className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform hover:scale-105 ${
                    timeFilter === filter
                      ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
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

          {/* Chart */}
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={(() => {
              // Filter records based on time period
              let filteredRecords = [...salesRecords];
              
              if (timeFilter === 'custom') {
                filteredRecords = filteredRecords.filter(r => 
                  r.date >= dateRange.from && r.date <= dateRange.to
                );
              } else {
                const today = new Date();
                const cutoffDate = new Date();
                
                if (timeFilter === 'daily') {
                  cutoffDate.setDate(today.getDate() - 5);
                } else if (timeFilter === 'weekly') {
                  cutoffDate.setDate(today.getDate() - 35); // 5 weeks
                } else if (timeFilter === 'monthly') {
                  cutoffDate.setMonth(today.getMonth() - 5); // 5 months
                } else if (timeFilter === 'yearly') {
                  cutoffDate.setFullYear(today.getFullYear() - 5); // 5 years
                }
                
                filteredRecords = filteredRecords.filter(r => 
                  new Date(r.date) >= cutoffDate
                );
              }

              // Group by time period
              const grouped = new Map();
              filteredRecords.forEach(r => {
                let key = r.date;
                let displayLabel = r.date;
                
                if (timeFilter === 'weekly') {
                  const date = new Date(r.date);
                  const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  key = weekStart.toISOString().split('T')[0];
                  displayLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                } else if (timeFilter === 'monthly') {
                  key = r.date.substring(0, 7); // YYYY-MM
                  displayLabel = new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                } else if (timeFilter === 'yearly') {
                  key = r.date.substring(0, 4); // YYYY
                  displayLabel = key;
                } else if (timeFilter === 'daily') {
                  displayLabel = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }

                if (!grouped.has(key)) {
                  grouped.set(key, {
                    period: displayLabel,
                    'Chicken Momos': 0,
                    'Chicken Cheese Momos': 0,
                    'Veg Momos': 0,
                    'Paneer Momos': 0,
                    'Corn Cheese Momos': 0,
                    'Chicken Kurkure Momos': 0,
                    'Veg Kurkure Momos': 0
                  });
                }

                const periodData = grouped.get(key);
                Object.entries(r.data).forEach(([category, count]) => {
                  periodData[category] += count;
                });
              });

              // Convert to array and get last 5 periods
              const chartData = Array.from(grouped.values())
                .sort((a, b) => {
                  // Sort chronologically
                  const dateA = filteredRecords.find(r => {
                    if (timeFilter === 'weekly') {
                      const date = new Date(r.date);
                      const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
                      return a.period.includes(weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                    } else if (timeFilter === 'monthly') {
                      return a.period === new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                    } else if (timeFilter === 'yearly') {
                      return a.period === r.date.substring(0, 4);
                    } else {
                      return a.period === new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                  })?.date || a.period;
                  
                  const dateB = filteredRecords.find(r => {
                    if (timeFilter === 'weekly') {
                      const date = new Date(r.date);
                      const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
                      return b.period.includes(weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                    } else if (timeFilter === 'monthly') {
                      return b.period === new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                    } else if (timeFilter === 'yearly') {
                      return b.period === r.date.substring(0, 4);
                    } else {
                      return b.period === new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                  })?.date || b.period;
                  
                  return new Date(dateA).getTime() - new Date(dateB).getTime();
                })
                .slice(-5); // Get last 5 periods

              return chartData;
            })()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="period" 
                tick={{ fontSize: 12 }} 
                angle={-15}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="rect"
              />
              <Bar dataKey="Chicken Momos" fill="#ef4444" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Chicken Cheese Momos" fill="#f97316" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Veg Momos" fill="#22c55e" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Paneer Momos" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Corn Cheese Momos" fill="#eab308" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Chicken Kurkure Momos" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Veg Kurkure Momos" fill="#06b6d4" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

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
                
                if (timeFilter === 'daily') {
                  cutoffDate.setDate(today.getDate() - 5);
                } else if (timeFilter === 'weekly') {
                  cutoffDate.setDate(today.getDate() - 35);
                } else if (timeFilter === 'monthly') {
                  cutoffDate.setMonth(today.getMonth() - 5);
                } else if (timeFilter === 'yearly') {
                  cutoffDate.setFullYear(today.getFullYear() - 5);
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
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-2 border-purple-200">
                    <p className="text-sm text-gray-600 mb-1">Top Category</p>
                    <p className="text-lg text-gray-900" style={{ fontWeight: '600' }}>
                      {topCategory?.[0]?.split(' ')[0] || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{topCategory?.[1]?.toLocaleString() || 0} pcs</p>
                  </div>
                  <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border-2 border-pink-200">
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
                <TrendingUp className="w-7 h-7 text-indigo-600" />
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
                        ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {day.name}
                  </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="category" 
                  tick={{ fontSize: 11 }}
                  angle={-15}
                  textAnchor="end"
                  height={100}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: any) => [`${value} pcs (avg)`, 'Average']}
                  labelFormatter={(label: string) => label}
                />
                <Bar dataKey="average" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

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
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-2 border-purple-200">
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
            
            // Resolve store name - fallback to context.stores if record.storeName is missing or "Unknown Store"
            const displayStoreName = record.storeName && record.storeName !== 'Unknown Store'
              ? record.storeName
              : (context.stores?.find(s => s.id === record.storeId)?.name || record.storeName || 'Unknown Store');
            
            return (
              <div key={record.id} className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 text-white">
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
                        <p className="text-sm text-purple-100">
                          {displayStoreName} • Total: {totalPieces.toLocaleString()} pieces
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                {/* Category Grid */}
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
                    <span>Uploaded by {record.uploadedBy}</span>
                    <span>{new Date(record.uploadedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}