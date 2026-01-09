import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Package, Clock, CheckCircle, Truck, Calendar, User, Store, Send, ArrowRight, Filter, TrendingUp, ChevronDown, ChevronUp, Settings, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getSupabaseClient } from '../utils/supabase/client';
import { DatePicker } from './DatePicker';
import { MonthlyStockRecalibration } from './MonthlyStockRecalibration';
import { StockThresholdSettings } from './StockThresholdSettings';

interface ProductionRequestsProps {
  context: InventoryContextType;
  highlightRequestId?: string | null;
  selectedStoreId?: string | null;
  onNavigateToManageItems?: () => void;
}

export function ProductionRequests({ context, highlightRequestId, selectedStoreId, onNavigateToManageItems }: ProductionRequestsProps) {
  const [requests, setRequests] = useState<api.ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [chartTimeFilter, setChartTimeFilter] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('daily');
  const [chartCustomRange, setChartCustomRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [salesData, setSalesData] = useState<any[]>([]);
  
  // Form state for new request - DYNAMIC for all finished products
  const [momoQuantities, setMomoQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  // Always default to today (no time restriction)
  const getDefaultRequestDate = () => {
    return new Date().toISOString().split('T')[0];
  };
  const [requestDate, setRequestDate] = useState(getDefaultRequestDate());
  const [lastReminderDate, setLastReminderDate] = useState<string | null>(null);

  // Kitchen Utilities state (item -> {quantity, unit})
  const [kitchenUtilities, setKitchenUtilities] = useState<Record<string, { quantity: number; unit: string }>>({});
  
  // Sauces state (sauce name -> boolean)
  const [sauces, setSauces] = useState<Record<string, boolean>>({});
  
  // Utilities state (utility name -> quantity)
  const [utilities, setUtilities] = useState<Record<string, number>>({});

  // Expanded dates state (date -> boolean)
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  
  // Store recalibration modal state
  const [showStoreRecalibration, setShowStoreRecalibration] = useState(false);
  
  // Store opening balance state
  const [storeOpeningBalance, setStoreOpeningBalance] = useState<any>(null);
  
  // Stock alert thresholds state - DYNAMIC
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [stockThresholds, setStockThresholds] = useState<Record<string, { high: number; medium: number; low: number }>>({});

  // Plate Conversion Settings - Shared with Production Analytics
  const [momosPerPlate, setMomosPerPlate] = useState<number>(() => {
    const saved = localStorage.getItem('momosPerPlate');
    return saved ? parseInt(saved, 10) : 6; // Default 6 momos per plate
  });

  // Kitchen Utilities list with specific units
  const kitchenUtilityItems = [
    { name: 'Chaat Masala', unit: 'pkt' },
    { name: 'Peri-Peri Masala', unit: 'pkt' },
    { name: 'Black Salt', unit: 'pkt' },
    { name: 'Butter', unit: 'pkt' },
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
    { name: 'Tomato Ketchup', unit: 'pkt' }
  ];

  // Sauces list
  const sauceItems = [
    'Pan-Fried Sauce', 'Butter Makhani Sauce', 'Chilli Chicken Sauce',
    'Korean Sauce', 'Red Sauce', 'Green Sauce', 'Soup Premix', 'Tandoori Sauce'
  ];

  // Utilities list
  const utilityItems = ['KOT Roll', 'Parcel Box', 'Table Box', 'Zomato Tape'];

  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isProductionHead = context.user?.designation === 'production_incharge';
  const isOperationsHead = context.user?.role === 'manager';
  const isClusterHead = context.user?.role === 'cluster_head';
  const canViewAll = isOperationsHead || isClusterHead || isProductionHead;

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
      canViewAll
    });
  }, [context.user, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, canViewAll]);

  useEffect(() => {
    loadRequests();
    loadSalesData();
    loadStockThresholds();
  }, [context.user, selectedStoreId]);

  // Load opening balance after salesData is loaded
  useEffect(() => {
    if (salesData.length >= 0 && context.inventoryItems && context.inventoryItems.length > 0) {
      loadStoreOpeningBalance();
    }
  }, [salesData, context.user, selectedStoreId, context.inventoryItems]);

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
          req.requestDate === tomorrowDate &&
          req.status !== 'cancelled'
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
      const effectiveStoreId = selectedStoreId || context.user.storeId;
      if (!effectiveStoreId) return;
      
      const accessToken = await getFreshAccessToken();
      if (!accessToken) return;
      
      const saved = await api.getStockThresholds(accessToken, effectiveStoreId);
      if (saved) {
        setStockThresholds(saved);
      }
    } catch (error) {
      console.log('No saved thresholds, using defaults');
    }
  };

  const loadRequests = async () => {
    if (!context.user) return;
    
    try {
      setLoading(true);
      // Get fresh access token
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        console.error('No valid access token available');
        return;
      }
      
      const data = await api.fetchProductionRequests(accessToken);
      
      // Determine effective store ID for filtering
      const effectiveStoreId = selectedStoreId || context.user.storeId;
      
      // Filter requests based on role and selected store
      let filteredRequests = data;
      
      if (effectiveStoreId) {
        // If a store is selected (either via dropdown or user's assigned store), filter by it
        filteredRequests = data.filter(req => req.storeId === effectiveStoreId);
      } else if (isStoreIncharge && context.user.storeId) {
        // Store In-Charge sees only their store's requests (fallback)
        filteredRequests = data.filter(req => req.storeId === context.user.storeId);
      } else if (isOperationsHead && context.user.storeId && !isClusterHead) {
        // Operations Managers see their store's requests (unless they're also cluster head)
        filteredRequests = data.filter(req => req.storeId === context.user.storeId);
      }
      // Cluster heads and Production heads see all requests (when no store is selected)
      
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
      
      // Filter by store if needed
      const effectiveStoreId = selectedStoreId || context.user.storeId;
      if (effectiveStoreId) {
        records = records.filter((r: any) => r?.storeId === effectiveStoreId);
      }
      
      setSalesData(records);
    } catch (error) {
      console.error('Error loading sales data:', error);
    }
  };

  const loadStoreOpeningBalance = async () => {
    const effectiveStoreId = selectedStoreId || context.user?.storeId;
    // For "All Stores" view, we need to aggregate across all stores
    const isAllStores = !effectiveStoreId || effectiveStoreId === 'all';
    
    if (!context.user?.accessToken) return;
    
    console.log('🏪 loadStoreOpeningBalance called');
    console.log('  effectiveStoreId:', effectiveStoreId);
    console.log('  isAllStores:', isAllStores);
    console.log('  Current salesData length:', salesData.length);
    
    try {
      const currentMonth = new Date().toISOString().substring(0, 7); // "2026-01"
      
      if (isAllStores) {
        // For "All Stores", aggregate opening balance across all stores
        console.log('  📊 Calculating aggregate opening balance for all stores');
        
        const allStores = context.stores || [];
        let aggregatedBalance: Record<string, number> = {};
        finishedProducts.forEach(({ camelKey }) => {
          aggregatedBalance[camelKey] = 0;
        });
        
        for (const store of allStores) {
          // Try to get recalibration for each store
          const recalResponse = await api.getLastRecalibration(
            context.user.accessToken,
            store.id,
            'store'
          );
          
          if (recalResponse?.record) {
            const recalDate = recalResponse.record.date.substring(0, 7);
            
            if (recalDate === currentMonth) {
              // Use current month recalibration
              recalResponse.record.items.forEach((item: any) => {
                // Map itemId to camelKey - itemId can be either UUID or snake_case name
                const inventoryItem = context.inventoryItems?.find(invItem => 
                  invItem.id === item.itemId || invItem.name === item.itemId
                );
                if (inventoryItem) {
                  const camelKey = inventoryItem.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                  aggregatedBalance[camelKey as keyof typeof aggregatedBalance] += item.actualQuantity;
                }
              });
            } else {
              // Calculate from previous month for this store
              const balance = await calculatePreviousMonthStoreStock(store.id, currentMonth);
              Object.keys(balance).forEach(key => {
                aggregatedBalance[key as keyof typeof aggregatedBalance] += balance[key];
              });
            }
          } else {
            // No recalibration - calculate from previous month
            const balance = await calculatePreviousMonthStoreStock(store.id, currentMonth);
            Object.keys(balance).forEach(key => {
              aggregatedBalance[key as keyof typeof aggregatedBalance] += balance[key];
            });
          }
        }
        
        console.log('  ✅ Aggregated opening balance for all stores:', aggregatedBalance);
        setStoreOpeningBalance(aggregatedBalance);
        return;
      }
      
      // Single store logic (existing code)
      // Try to fetch last recalibration for STORE (not production house)
      if (!effectiveStoreId) {
        console.log('  ⚠️ No effectiveStoreId available, skipping recalibration fetch');
        setStoreOpeningBalance({});
        return;
      }
      
      const recalResponse = await api.getLastRecalibration(
        context.user.accessToken,
        effectiveStoreId,
        'store'
      );
      
      console.log('🔄 Recalibration Check:');
      console.log('  Recalibration response:', recalResponse);
      
      if (recalResponse?.record) {
        const recalDate = recalResponse.record.date.substring(0, 7);
        
        console.log('  Recalibration date:', recalResponse.record.date);
        console.log('  Recalibration month:', recalDate);
        console.log('  Recalibration locationType:', recalResponse.record.locationType);
        console.log('  Recalibration locationName:', recalResponse.record.locationName);
        console.log('  Current month:', currentMonth);
        
        if (recalDate === currentMonth) {
          // Recalibration from current month - use it as opening balance
          const balance: any = {};
          console.log('  📝 Processing recalibration items:', recalResponse.record.items.length);
          console.log('  📝 Available inventory items:', context.inventoryItems?.length || 0);
          
          recalResponse.record.items.forEach((item: any) => {
            console.log('    Processing item:', { itemId: item.itemId, actualQuantity: item.actualQuantity });
            // Map itemId to camelKey - itemId can be either UUID or snake_case name
            const inventoryItem = context.inventoryItems?.find(invItem => 
              invItem.id === item.itemId || invItem.name === item.itemId
            );
            console.log('    Found inventory item:', inventoryItem ? { name: inventoryItem.name, displayName: inventoryItem.displayName } : 'NOT FOUND');
            if (inventoryItem) {
              const camelKey = inventoryItem.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
              balance[camelKey] = item.actualQuantity;
              console.log('    Mapped to camelKey:', camelKey, '=', item.actualQuantity);
            } else {
              console.log('    ⚠️ Could not find inventory item for itemId:', item.itemId);
            }
          });
          console.log('  ✅ Using current month recalibration as opening balance:', balance);
          setStoreOpeningBalance(balance);
          return;
        } else {
          console.log('  ❌ Recalibration is from', recalDate, '- calculating from previous month instead');
        }
      } else {
        console.log('  ❌ No recalibration record found');
      }
      
      // No current month recalibration - calculate from previous month
      const balance = await calculatePreviousMonthStoreStock(effectiveStoreId, currentMonth);
      setStoreOpeningBalance(balance);
    } catch (error) {
      console.error('Error loading opening balance:', error);
      // Set to zero balance on error
      const zeroBalance: Record<string, number> = {};
      finishedProducts.forEach(({ camelKey }) => {
        zeroBalance[camelKey] = 0;
      });
      setStoreOpeningBalance(zeroBalance);
    }
  };

  const calculatePreviousMonthStoreStock = async (storeId: string, currentMonth: string): Promise<any> => {
    // Return zero balance if storeId is not provided
    if (!storeId) {
      console.warn('  ⚠️ calculatePreviousMonthStoreStock called with empty storeId');
      const zeroBalance: Record<string, number> = {};
      finishedProducts.forEach(({ camelKey }) => {
        zeroBalance[camelKey] = 0;
      });
      return zeroBalance;
    }
    
    // Get previous month
    const [year, month] = currentMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    const previousMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    
    console.log('📊 Store Opening Balance Calculation:');
    console.log('  Store ID:', storeId);
    console.log('  Previous Month:', previousMonthStr);
    
    // First, try to get recalibration from the previous month
    let prevMonthOpeningBalance: Record<string, number> = {};
    
    try {
      const prevRecalResponse = await api.getLastRecalibration(
        context.user.accessToken,
        storeId,
        'store'
      );
      
      if (prevRecalResponse?.record) {
        const recalMonth = prevRecalResponse.record.date.substring(0, 7);
        console.log('  📦 Found recalibration from:', recalMonth);
        
        if (recalMonth === previousMonthStr) {
          // Perfect! We have recalibration from the previous month
          prevRecalResponse.record.items.forEach((item: any) => {
            // Map itemId to camelKey - itemId can be either UUID or snake_case name
            const inventoryItem = context.inventoryItems?.find(invItem => 
              invItem.id === item.itemId || invItem.name === item.itemId
            );
            if (inventoryItem) {
              const camelKey = inventoryItem.name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
              prevMonthOpeningBalance[camelKey] = item.actualQuantity;
            }
          });
          console.log('  ✅ Using previous month recalibration as opening:', prevMonthOpeningBalance);
        } else {
          console.log('  ⚠️ Recalibration is from different month, assuming zero opening balance');
          finishedProducts.forEach(({ camelKey }) => {
            prevMonthOpeningBalance[camelKey] = 0;
          });
        }
      } else {
        console.log('  ⚠️ No recalibration found, assuming zero opening balance');
        finishedProducts.forEach(({ camelKey }) => {
          prevMonthOpeningBalance[camelKey] = 0;
        });
      }
    } catch (error) {
      console.error('  ❌ Error fetching recalibration:', error);
      finishedProducts.forEach(({ camelKey }) => {
        prevMonthOpeningBalance[camelKey] = 0;
      });
    }
    
    // Calculate from previous month's deliveries and sales
    const prevReceived = (context.productionRequests || [])
      .filter(req => {
        if (req.status !== 'delivered') return false;
        if (req.storeId !== storeId) return false;
        const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
        return requestDate && requestDate.startsWith(previousMonthStr);
      })
      .reduce((acc, req) => {
        // Dynamically accumulate all finished product quantities
        // Support both new format (chickenMomo) and old format (chickenMomos with 's')
        finishedProducts.forEach(({ camelKey }) => {
          const newFormat = (req as any)[camelKey] || 0;
          const oldFormat = (req as any)[camelKey + 's'] || 0; // Old requests have 's' at end
          acc[camelKey] = (acc[camelKey] || 0) + newFormat + oldFormat;
        });
        return acc;
      }, {} as Record<string, number>);
    
    const prevSalesFiltered = (salesData || [])
      .filter(sale => {
        if (sale.storeId !== storeId) return false;
        return sale.date && sale.date.startsWith(previousMonthStr);
      });
    
    const prevSold = prevSalesFiltered
      .reduce((acc, sale) => {
        // Dynamically accumulate sales for all finished products
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
    
    // Calculate closing stock = Opening Balance + Received - Sold (FIXED!)
    const closingStock: Record<string, number> = {};
    finishedProducts.forEach(({ camelKey }) => {
      closingStock[camelKey] = (prevMonthOpeningBalance[camelKey] || 0) + (prevReceived[camelKey] || 0) - (prevSold[camelKey] || 0);
    });
    
    console.log('  Previous Month Opening Balance:', prevMonthOpeningBalance);
    console.log('  Previous Month Received:', prevReceived);
    console.log('  Previous Month Sold:', prevSold);
    console.log('  Calculated Closing Stock (= Opening + Received - Sold):', closingStock);
    
    return closingStock;
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      });

      console.log('✅ Request submitted successfully');
      toast.success('Production request submitted successfully');
      
      // Reset form
      setMomoQuantities({});
      setKitchenUtilities({});
      setSauces({});
      setUtilities({});
      setNotes('');
      setRequestDate(getDefaultRequestDate());
      
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
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'accepted': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'in-preparation': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'prepared': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'shipped': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'delivered': return 'bg-green-100 text-green-800 border-green-300';
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
    if (filterDate && req.requestDate !== filterDate) return false;
    if (filterStatus !== 'all' && req.status !== filterStatus) return false;
    return true;
  });

  // Group requests by status for the flow view
  const groupedByStatus = {
    pending: filteredRequests.filter(r => r.status === 'pending'),
    accepted: filteredRequests.filter(r => r.status === 'accepted'),
    'in-preparation': filteredRequests.filter(r => r.status === 'in-preparation'),
    prepared: filteredRequests.filter(r => r.status === 'prepared'),
    shipped: filteredRequests.filter(r => r.status === 'shipped'),
    delivered: filteredRequests.filter(r => r.status === 'delivered'),
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

  // Calculate chart data based on time filter
  const getChartData = () => {
    const now = new Date();
    let periods: string[] = [];
    let startDate: Date;
    let endDate: Date = now;

    // Helper to format date
    const formatDate = (date: Date, format: string) => {
      if (format === 'day') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (format === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      } else if (format === 'month') {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      } else if (format === 'year') {
        return date.getFullYear().toString();
      }
      return date.toLocaleDateString();
    };

    // Helper to get period key for grouping (using local dates to avoid timezone issues)
    const getPeriodKey = (date: Date, format: string) => {
      const getLocalDateString = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      if (format === 'day') {
        return getLocalDateString(date);
      } else if (format === 'week') {
        const weekStart = new Date(date);
        const dayOfWeek = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - dayOfWeek); // Move to Sunday
        return getLocalDateString(weekStart);
      } else if (format === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (format === 'year') {
        return date.getFullYear().toString();
      }
      return getLocalDateString(date);
    };

    // Generate periods based on filter
    if (chartTimeFilter === 'daily') {
      // Last 5 days including today
      for (let i = 4; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        periods.push(getPeriodKey(date, 'day'));
      }
    } else if (chartTimeFilter === 'weekly') {
      // Last 5 weeks including current week
      for (let i = 4; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - (i * 7));
        const periodKey = getPeriodKey(date, 'week');
        // Avoid duplicates
        if (!periods.includes(periodKey)) {
          periods.push(periodKey);
        }
      }
    } else if (chartTimeFilter === 'monthly') {
      // Last 5 months including current month
      for (let i = 4; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(now.getMonth() - i);
        periods.push(getPeriodKey(date, 'month'));
      }
    } else if (chartTimeFilter === 'yearly') {
      // Last 5 years including current year
      for (let i = 4; i >= 0; i--) {
        const date = new Date(now);
        date.setFullYear(now.getFullYear() - i);
        periods.push(getPeriodKey(date, 'year'));
      }
    } else if (chartTimeFilter === 'custom') {
      startDate = new Date(chartCustomRange.from);
      endDate = new Date(chartCustomRange.to);
      // For custom, use daily grouping
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      for (let i = 0; i <= daysDiff; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        periods.push(getPeriodKey(date, 'day'));
      }
    }

    console.log('📊 Chart Periods:', { 
      filter: chartTimeFilter, 
      periods,
      today: now.toISOString().split('T')[0]
    });

    console.log('📊 Requests for chart:', {
      totalRequests: requests.length,
      requestDates: requests.map(r => ({ date: r.requestDate, id: r.id.slice(0, 8), chickenMomo: (r as any).chickenMomo, chickenMomos: (r as any).chickenMomos }))
    });

    // Group requests by period - DYNAMIC
    const periodData: Record<string, any> = {};
    periods.forEach(period => {
      const entry: any = { period };
      // Initialize all finished products to 0
      finishedProducts.forEach(({ label }) => {
        entry[label] = 0;
      });
      periodData[period] = entry;
    });

    // Aggregate requests into periods
    requests.forEach(req => {
      const reqDate = new Date(req.requestDate);
      let periodKey: string;
      
      if (chartTimeFilter === 'daily' || chartTimeFilter === 'custom') {
        periodKey = getPeriodKey(reqDate, 'day');
      } else if (chartTimeFilter === 'weekly') {
        periodKey = getPeriodKey(reqDate, 'week');
      } else if (chartTimeFilter === 'monthly') {
        periodKey = getPeriodKey(reqDate, 'month');
      } else if (chartTimeFilter === 'yearly') {
        periodKey = getPeriodKey(reqDate, 'year');
      }

      if (periodData[periodKey]) {
        // Dynamically accumulate all finished product quantities
        // Support both new format (chickenMomo) and old format (chickenMomos with 's')
        finishedProducts.forEach(({ camelKey, label }) => {
          const newFormat = (req as any)[camelKey] || 0;
          const oldFormat = (req as any)[camelKey + 's'] || 0;
          periodData[periodKey][label] = (periodData[periodKey][label] || 0) + newFormat + oldFormat;
        });
      } else {
        console.log('⚠️ Request not matching any period:', {
          requestDate: req.requestDate,
          periodKey,
          availablePeriods: periods
        });
      }
    });

    console.log('📊 Aggregated Period Data:', periodData);

    // Convert to array with formatted labels
    const chartData = periods.map(period => {
      const data = periodData[period];
      const date = new Date(period);
      let label: string;
      
      if (chartTimeFilter === 'daily' || chartTimeFilter === 'custom') {
        label = formatDate(date, 'day');
      } else if (chartTimeFilter === 'weekly') {
        label = formatDate(date, 'week');
      } else if (chartTimeFilter === 'monthly') {
        label = formatDate(date, 'month');
      } else if (chartTimeFilter === 'yearly') {
        label = formatDate(date, 'year');
      }

      return {
        name: label,
        ...data,
      };
    });

    console.log('📊 Final Chart Data:', chartData);

    return chartData;
  };

  // Auto-scroll to highlighted request when loaded
  useEffect(() => {
    if (highlightRequestId && !loading) {
      const element = document.getElementById(`request-${highlightRequestId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [highlightRequestId, loading]);

  // Auto-expand the first (most recent) date
  useEffect(() => {
    if (sortedDates.length > 0 && Object.keys(expandedDates).length === 0) {
      setExpandedDates({ [sortedDates[0]]: true });
    }
  }, [sortedDates, expandedDates]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg shadow-lg p-4 sm:p-6 text-white">
        <h1 className="text-2xl sm:text-3xl mb-2">Daily Stock Requests</h1>
        <p className="text-sm sm:text-base text-purple-100">
          {isStoreIncharge && 'Submit your daily stock requirements before 9:00 AM'}
          {isProductionHead && 'Manage incoming stock requests and track fulfillment'}
          {(isOperationsHead || isClusterHead) && 'Monitor stock request workflow across stores'}
        </p>
      </div>

      {/* Stock Status Overview */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 border-2 border-green-200">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl text-gray-900 mb-1 flex items-center gap-2">
              <Package className="w-6 h-6 text-green-600" />
              Store Stock Status
            </h2>
            <p className="text-sm text-gray-600">
              Total inventory received from production house - Stock sold
            </p>
          </div>
          {isStoreIncharge && (() => {
            const today = new Date();
            const dayOfMonth = today.getDate();
            const isRecalibrationPeriod = dayOfMonth >= 1 && dayOfMonth <= 5;
            
            return (
              <button
                onClick={() => setShowStoreRecalibration(true)}
                disabled={!isRecalibrationPeriod}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                  isRecalibrationPeriod
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-700 hover:to-emerald-700 shadow-lg'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                title={!isRecalibrationPeriod ? 'Recalibration only available from 1st to 5th of each month' : 'Recalibrate store stock'}
              >
                <CheckCircle className="w-5 h-5" />
                Recalibrate Stock
              </button>
            );
          })()}
        </div>

        {/* Currently Viewing Banner */}
        {(() => {
          const today = new Date();
          const effectiveStoreId = selectedStoreId || context.user?.storeId;
          
          return (
            <div className="bg-gradient-to-r from-green-100 to-green-50 border-l-4 border-green-600 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-700" />
                    <p className="text-sm font-semibold text-green-900">
                      Store Stock Status (Current Month)
                    </p>
                  </div>
                  <p className="text-xs text-green-700 ml-7">
                    Opening balance + Current month received - Current month sold
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowThresholdSettings(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition-all"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-sm font-semibold">Alert Settings</span>
                  </button>
                  {onNavigateToManageItems && (isOperationsHead || isClusterHead) && (
                    <button
                      onClick={onNavigateToManageItems}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md hover:shadow-lg"
                    >
                      <Package className="w-4 h-4" />
                      <span className="text-sm font-semibold">Manage Items</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          // Calculate Store Stock Status (MONTHLY)
          // Store Stock = Opening Balance + Current Month Received - Current Month Sold
          
          const effectiveStoreId = selectedStoreId || context.user?.storeId;
          
          // Get current month in IST (UTC+5:30)
          const now = new Date();
          const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
          const istDate = new Date(now.getTime() + istOffset);
          const currentMonth = istDate.toISOString().substring(0, 7); // "2026-01"
          
          // Get current month's delivered production requests for this store
          console.log('📦 Stock Status Calculation Debug:', {
            currentMonth,
            totalRequests: context.productionRequests?.length || 0,
            deliveredRequests: context.productionRequests?.filter(r => r.status === 'delivered').length || 0,
            requestStatuses: context.productionRequests?.map(r => ({ id: r.id.slice(0, 8), status: r.status, date: r.requestDate })) || []
          });
          
          const deliveredRequests = context.productionRequests?.filter(req => {
            // Count both delivered and pending requests (pending means delivery confirmation is pending, but stock was received)
            if (req.status !== 'delivered' && req.status !== 'pending') return false;
            
            // Filter by current month
            const deliveryDate = req.deliveredDate || req.requestDate || req.createdAt;
            const matchesMonth = deliveryDate && deliveryDate.startsWith(currentMonth);
            
            // Debug log for chicken momo discrepancies
            console.log('🔍 Delivered Request:', {
              id: req.id.slice(0, 8),
              status: req.status,
              chicken: (req as any).chicken,
              chickenMomo: (req as any).chickenMomo,
              chickenMomos: (req as any).chickenMomos,
              chickenKurkure: (req as any).chickenKurkure,
              chickenKurkureMomo: (req as any).chickenKurkureMomo,
              chickenKurkureMomos: (req as any).chickenKurkureMomos,
              deliveryDate,
              matchesMonth
            });
            
            if (!matchesMonth) return false;
            
            if (!effectiveStoreId || effectiveStoreId === 'all') {
              // Show all stores
              return true;
            }
            // Show specific store
            return req.storeId === effectiveStoreId;
          }) || [];
          
          // Aggregate current month's received quantities
          const totalReceived = deliveredRequests.reduce((acc, req) => {
            // Dynamically accumulate all finished product quantities
            // Support both new format (chickenMomo) and old format (chickenMomos with 's')
            finishedProducts.forEach(({ camelKey }) => {
              const newFormat = (req as any)[camelKey] || 0;
              const oldFormat = (req as any)[camelKey + 's'] || 0; // Old requests have 's' at end
              acc[camelKey] = (acc[camelKey] || 0) + newFormat + oldFormat;
            });
            return acc;
          }, {} as Record<string, number>);
          
          console.log('📊 After aggregation - deliveredRequests count:', deliveredRequests.length);
          console.log('📊 After aggregation - totalReceived:', totalReceived);
          
          // Get current month's sales data for this store
          const storeSales = salesData.filter((s: any) => {
            // Filter by current month
            if (!s.date || !s.date.startsWith(currentMonth)) return false;
            
            if (!effectiveStoreId || effectiveStoreId === 'all') {
              // Show all stores
              return true;
            }
            // Show specific store
            return s.storeId === effectiveStoreId;
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
          
          // Calculate store stock = Opening Balance + Received - Sold (dynamically)
          const storeStock: Record<string, number> = {};
          finishedProducts.forEach(({ camelKey }) => {
            storeStock[camelKey] = (openingBalance[camelKey] || 0) + (totalReceived[camelKey] || 0) - (totalSales[camelKey] || 0);
          });
          
          console.log('  storeStock calculated:', storeStock);
          
          // Color palette for momo cards
          const colorPalette = ['purple', 'pink', 'green', 'yellow', 'blue', 'teal', 'red', 'indigo', 'orange', 'cyan'];
          
          const totalReceivedSum = Object.values(totalReceived).reduce((sum, val) => sum + val, 0);
          const totalOpeningBalanceSum = Object.values(openingBalance).reduce((sum, val) => sum + val, 0);
          const totalStockSum = totalReceivedSum + totalOpeningBalanceSum;
          
          console.log('  totalReceivedSum:', totalReceivedSum);
          console.log('  totalOpeningBalanceSum:', totalOpeningBalanceSum);
          console.log('  totalStockSum:', totalStockSum);
          
          if (totalStockSum === 0) {
            return (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No inventory available for {currentMonth}</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                
                // Show all momo types
                
                const stockPercentage = totalAvailable > 0 ? ((stock / totalAvailable) * 100).toFixed(0) : '0';
                const isLowStock = stock < totalAvailable * 0.2 && totalAvailable > 0; // Less than 20%
                
                return (
                  <div key={camelKey} className={`bg-gradient-to-br from-${color}-50 to-${color}-100 border-2 border-${color}-200 rounded-xl p-4 hover:shadow-lg transition-all duration-300 relative`}>
                    {/* Stock Alert Badge */}
                    {stockLevel !== 'high' && (
                      <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg ${alertBgColor} border ${alertBorderColor}`}>
                        <AlertTriangle className={`w-4 h-4 ${alertTextColor}`} />
                        <span className={`text-xs font-semibold ${alertTextColor} uppercase`}>{alertLabel}</span>
                      </div>
                    )}
                    
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 pr-20">{label}</h3>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">Total Received:</span>
                        <span className={`text-lg font-bold text-${color}-600`}>{received}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">Total Sold:</span>
                        <span className={`text-lg font-bold text-${color}-700`}>{sold}</span>
                      </div>
                      
                      <div className="border-t-2 border-gray-300 pt-2 mt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-gray-700">Stock Available:</span>
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${isLowStock ? 'text-red-600' : stock < 0 ? 'text-red-600' : `text-${color}-800`}`}>
                              {stock} pcs / {Math.round(stock / momosPerPlate)} plates
                            </div>
                          </div>
                        </div>
                        {totalAvailable > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>{stockPercentage}% remaining</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${isLowStock || stock < 0 ? 'bg-red-500' : `bg-${color}-500`}`}
                                style={{ width: `${Math.min(100, Math.max(0, Number(stockPercentage)))}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {(isLowStock || stock < 0) && (
                        <div className="bg-red-100 border border-red-300 rounded-lg px-2 py-1 mt-2">
                          <p className="text-xs text-red-800 font-semibold">
                            {stock < 0 ? '⚠️ Oversold' : '⚠️ Low Stock'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Store In-Charge Request Form */}
      {isStoreIncharge && (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl text-gray-900 mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-600" />
            Submit Stock Request
          </h2>
          
          {/* Info banner for after 9 AM */}
          {new Date().getHours() >= 9 && (
            <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-900 font-semibold mb-1">
                    It's past 9:00 AM
                  </p>
                  <p className="text-xs text-blue-800">
                    Same-day production requests are no longer accepted. The request date has been automatically set to tomorrow. You can also select any future date for advance orders.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmitRequest} className="space-y-6">
            <div>
              <DatePicker
                label="Request Date"
                value={requestDate}
                onChange={setRequestDate}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Same-day requests must be submitted before 9:00 AM. After 9 AM, please select tomorrow or a future date for advance orders.
              </p>
            </div>

            <div>
              <h3 className="text-base text-gray-900 mb-3 flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                Momos Quantities
              </h3>
              <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0 lg:grid-cols-3">
                {finishedProducts.map(({ camelKey, label }) => {
                  // Quick preset values based on typical order sizes
                  const presetValues = camelKey === 'chicken' 
                    ? [150, 300, 450, 600] 
                    : [60, 120, 180, 300];
                  
                  return (
                    <div key={camelKey}>
                      <label className="block text-sm text-gray-700 mb-2">{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={momoQuantities[camelKey] || 0}
                        onChange={(e) => setMomoQuantities({
                          ...momoQuantities,
                          [camelKey]: parseInt(e.target.value) || 0
                        })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-base"
                      />
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {presetValues.map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setMomoQuantities({
                              ...momoQuantities,
                              [camelKey]: val
                            })}
                            className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm transition-colors"
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

            {/* Kitchen Utilities Section */}
            <div className="border-t pt-6">
              <h3 className="text-base text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                Kitchen Utilities (Optional)
              </h3>
              <div className="space-y-3">
                {kitchenUtilityItems.map((item) => (
                  <div key={item.name}>
                    <label className="block text-sm text-gray-700 mb-2">
                      {item.name} <span className="text-gray-500 text-xs">(in {item.unit})</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={kitchenUtilities[item.name]?.quantity !== undefined ? kitchenUtilities[item.name].quantity : ''}
                        onChange={(e) => {
                          const quantity = parseFloat(e.target.value) || 0;
                          if (quantity > 0) {
                            setKitchenUtilities({
                              ...kitchenUtilities,
                              [item.name]: { quantity, unit: item.unit }
                            });
                          } else {
                            const newUtils = { ...kitchenUtilities };
                            delete newUtils[item.name];
                            setKitchenUtilities(newUtils);
                          }
                        }}
                        className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-base"
                        placeholder={`Quantity in ${item.unit}`}
                      />
                      <div className="flex items-center px-4 py-3 bg-gray-100 border-2 border-gray-300 rounded-lg text-gray-700 text-base font-medium min-w-[80px] justify-center">
                        {item.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sauces Section */}
            <div className="border-t pt-6">
              <h3 className="text-base text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-pink-600" />
                Sauces (Select Required Sauces)
              </h3>
              <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                {sauceItems.map((sauce) => (
                  <label
                    key={sauce}
                    className="flex items-center gap-3 p-3 border-2 border-gray-300 rounded-lg hover:border-purple-500 cursor-pointer transition-colors active:bg-purple-50"
                  >
                    <input
                      type="checkbox"
                      checked={sauces[sauce] || false}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSauces({ ...sauces, [sauce]: true });
                        } else {
                          const newSauces = { ...sauces };
                          delete newSauces[sauce];
                          setSauces(newSauces);
                        }
                      }}
                      className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700">{sauce}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Utilities Section */}
            <div className="border-t pt-6">
              <h3 className="text-base text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                Utilities (Quantity in Pieces)
              </h3>
              <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                {utilityItems.map((item) => (
                  <div key={item}>
                    <label className="block text-sm text-gray-700 mb-2">{item}</label>
                    <input
                      type="number"
                      min="0"
                      value={utilities[item] !== undefined ? utilities[item] : ''}
                      onChange={(e) => {
                        const quantity = parseInt(e.target.value) || 0;
                        if (quantity > 0) {
                          setUtilities({ ...utilities, [item]: quantity });
                        } else {
                          const newUtils = { ...utilities };
                          delete newUtils[item];
                          setUtilities(newUtils);
                        }
                      }}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-base"
                      placeholder="Pieces"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Additional Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none resize-none"
                placeholder="Any special requirements or notes..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base font-medium shadow-lg active:scale-95"
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
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3">
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
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none text-base"
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
                className="w-full sm:w-auto px-4 py-3 sm:py-2 text-sm text-purple-600 hover:text-purple-900 underline font-medium"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Flow View for Operations Head & Cluster Head */}
      {canViewAll && (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl text-gray-900 mb-4 sm:mb-6">Production Request Workflow</h2>
          
          <div className="relative">
            {/* Connection Line */}
            <div className="absolute top-8 left-0 right-0 h-1 bg-gray-200" style={{ zIndex: 0 }}></div>
            
            {/* Status Cards */}
            <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" style={{ zIndex: 1 }}>
              {/* Pending */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-yellow-500 text-white flex items-center justify-center shadow-lg mb-3">
                  <div className="text-center">
                    <div className="text-2xl">{groupedByStatus.pending.length}</div>
                  </div>
                </div>
                <div className="w-full bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="w-3 h-3 text-yellow-600" />
                    <p className="text-xs text-yellow-800">Pending</p>
                  </div>
                </div>
              </div>

              {/* Accepted */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg mb-3">
                  <div className="text-center">
                    <div className="text-2xl">{groupedByStatus.accepted.length}</div>
                  </div>
                </div>
                <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-blue-600" />
                    <p className="text-xs text-blue-800">Accepted</p>
                  </div>
                </div>
              </div>

              {/* In Preparation */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg mb-3">
                  <div className="text-center">
                    <div className="text-2xl">{groupedByStatus['in-preparation'].length}</div>
                  </div>
                </div>
                <div className="w-full bg-purple-50 border-2 border-purple-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Package className="w-3 h-3 text-purple-600" />
                    <p className="text-xs text-purple-800">In Prep</p>
                  </div>
                </div>
              </div>

              {/* Prepared */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg mb-3">
                  <div className="text-center">
                    <div className="text-2xl">{groupedByStatus.prepared.length}</div>
                  </div>
                </div>
                <div className="w-full bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-indigo-600" />
                    <p className="text-xs text-indigo-800">Prepared</p>
                  </div>
                </div>
              </div>

              {/* Shipped */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg mb-3">
                  <div className="text-center">
                    <div className="text-2xl">{groupedByStatus.shipped.length}</div>
                  </div>
                </div>
                <div className="w-full bg-orange-50 border-2 border-orange-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Truck className="w-3 h-3 text-orange-600" />
                    <p className="text-xs text-orange-800">Shipped</p>
                  </div>
                </div>
              </div>

              {/* Delivered */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg mb-3">
                  <div className="text-center">
                    <div className="text-2xl">{groupedByStatus.delivered.length}</div>
                  </div>
                </div>
                <div className="w-full bg-green-50 border-2 border-green-200 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="w-3 h-3 text-green-600" />
                    <p className="text-xs text-green-800">Delivered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
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
              <p className="text-2xl text-purple-600">
                {groupedByStatus.accepted.length + groupedByStatus['in-preparation'].length + groupedByStatus.prepared.length}
              </p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-2xl text-green-600">{groupedByStatus.delivered.length}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>
      )}

      {/* Momo Orders Chart */}
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg sm:text-xl text-gray-900">Momo Orders by Type</h2>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {[
              { filter: 'daily', label: '5 Days' },
              { filter: 'weekly', label: '5 Weeks' },
              { filter: 'monthly', label: '5 Months' },
              { filter: 'yearly', label: '5 Years' },
              { filter: 'custom', label: 'Custom' }
            ].map(({ filter, label }) => (
              <button
                key={filter}
                onClick={() => setChartTimeFilter(filter as any)}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm transition-colors flex-1 sm:flex-none ${
                  chartTimeFilter === filter
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartTimeFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mb-6">
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

        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={getChartData()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {finishedProducts.map((product, index) => {
              const colors = ['#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#14b8a6', '#ef4444', '#f97316'];
              return (
                <Bar 
                  key={product.label} 
                  dataKey={product.label} 
                  name={product.label} 
                  fill={colors[index % colors.length]} 
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Requests List - Grouped by Date */}
      <div className="space-y-4">
        <h2 className="text-xl text-gray-900">
          {sortedDates.length} Date{sortedDates.length !== 1 ? 's' : ''} with Requests
        </h2>
        
        {sortedDates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
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
              <div key={date} className="bg-white rounded-lg shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                {/* Collapsible Date Header */}
                <button
                  onClick={() => setExpandedDates({ ...expandedDates, [date]: !isExpanded })}
                  className="w-full p-4 sm:p-6 text-left flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Calendar className="w-6 h-6 text-purple-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg text-gray-900 truncate">
                        {new Date(date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
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
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 sm:p-4">
                    <h4 className="text-xs sm:text-sm text-gray-700 mb-3">Total Quantities for this Day</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 sm:gap-3">
                        {totalQuantities.chicken > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-purple-600">{totalQuantities.chicken}</p>
                            <p className="text-xs text-gray-600">Chicken</p>
                          </div>
                        )}
                        {totalQuantities.chickenCheese > 0 && (
                          <div className="text-center bg-white rounded-lg p-2 sm:p-3">
                            <p className="text-lg sm:text-xl text-pink-600">{totalQuantities.chickenCheese}</p>
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
                      <h4 className="text-sm text-gray-700">Requests by Store</h4>
                      {dateRequests.map((request) => {
                        const isHighlighted = highlightRequestId === request.id;
                        return (
                          <div 
                            key={request.id} 
                            id={`request-${request.id}`}
                            className={`border rounded-lg p-4 transition-all duration-300 ${
                              isHighlighted 
                                ? 'border-purple-500 bg-purple-50 shadow-lg ring-2 ring-purple-300' 
                                : 'border-gray-200'
                            }`}
                          >
                            {/* Request ID Badge */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="bg-gray-100 px-3 py-1 rounded-full">
                                <span className="text-xs text-gray-700">
                                  <strong>Request ID:</strong> {request.id.slice(0, 8).toUpperCase()}
                                </span>
                              </div>
                              {isHighlighted && (
                                <div className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs animate-pulse">
                                  New Notification
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-3 mb-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                  <div className={`px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center gap-2 border-2 ${getStatusColor(request.status)} w-fit`}>
                                    {getStatusIcon(request.status)}
                                    <span className="capitalize">{request.status.replace('-', ' ')}</span>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                                    <Store className="w-4 h-4 flex-shrink-0" />
                                    <span className="truncate">{request.storeName || 'Unknown Store'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                                {/* Production Head Actions */}
                                {isProductionHead && request.status === 'pending' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'accepted')}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium"
                                  >
                                    Accept Request
                                  </button>
                                )}
                                
                                {isProductionHead && request.status === 'accepted' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'in-preparation')}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 active:bg-purple-800 transition-colors text-sm font-medium"
                                  >
                                    Start Preparation
                                  </button>
                                )}
                                
                                {isProductionHead && request.status === 'in-preparation' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'prepared')}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors text-sm font-medium"
                                  >
                                    Mark as Prepared
                                  </button>
                                )}
                                
                                {isProductionHead && request.status === 'prepared' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'shipped')}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 active:bg-orange-800 transition-colors text-sm font-medium"
                                  >
                                    Mark as Shipped
                                  </button>
                                )}
                                
                                {/* Store In-Charge Actions */}
                                {isStoreIncharge && request.status === 'shipped' && (
                                  <button
                                    onClick={() => handleStatusUpdate(request.id, 'delivered')}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 transition-colors text-sm font-medium"
                                  >
                                    Confirm Delivery
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                              <User className="w-4 h-4" />
                              <span>Requested by: {request.requestedByName || request.requestedBy}</span>
                            </div>

                            {/* Momos Quantities - DYNAMIC */}
                            <div className="bg-gray-50 rounded-lg p-3 mb-3">
                              <h5 className="text-xs sm:text-sm text-gray-600 mb-3">Momos Quantities</h5>
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 sm:gap-3">
                                {finishedProducts.map(({ camelKey, label }) => {
                                  const quantity = (request as any)[camelKey];
                                  if (!quantity || quantity === 0) return null;
                                  
                                  return (
                                    <div key={camelKey} className="text-center">
                                      <p className="text-gray-900">{quantity}</p>
                                      <p className="text-xs text-gray-600">{label.replace(' Momos', '')}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Kitchen Utilities */}
                            {request.kitchenUtilities && Object.keys(request.kitchenUtilities).length > 0 && (
                              <div className="bg-purple-50 rounded-lg p-3 mb-3">
                                <h5 className="text-xs sm:text-sm text-purple-700 mb-3">Kitchen Utilities</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                                  {Object.entries(request.kitchenUtilities).map(([item, data]) => (
                                    <div key={item} className="text-sm">
                                      <p className="text-gray-900">{data.quantity} {data.unit}</p>
                                      <p className="text-xs text-gray-600">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sauces */}
                            {request.sauces && Object.keys(request.sauces).length > 0 && (
                              <div className="bg-pink-50 rounded-lg p-3 mb-3">
                                <h5 className="text-xs sm:text-sm text-pink-700 mb-3">Sauces Requested</h5>
                                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                  {Object.keys(request.sauces).map((sauce) => (
                                    <span key={sauce} className="px-3 py-1 bg-pink-200 text-pink-900 rounded-full text-xs">
                                      {sauce}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Utilities */}
                            {request.utilities && Object.keys(request.utilities).length > 0 && (
                              <div className="bg-indigo-50 rounded-lg p-3 mb-3">
                                <h5 className="text-xs sm:text-sm text-indigo-700 mb-3">Utilities</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                  {Object.entries(request.utilities).map(([item, quantity]) => (
                                    <div key={item} className="text-sm">
                                      <p className="text-gray-900">{quantity} pcs</p>
                                      <p className="text-xs text-gray-600">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {request.notes && (
                              <div className="bg-blue-50 border-l-4 border-blue-400 p-2 rounded mb-3">
                                <p className="text-xs text-gray-700"><strong>Notes:</strong> {request.notes}</p>
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
      
      {/* Store Stock Recalibration Modal */}
      {showStoreRecalibration && (
        <MonthlyStockRecalibration
          context={context}
          selectedStoreId={selectedStoreId || context.user?.storeId}
          onClose={() => setShowStoreRecalibration(false)}
          isProductionHouse={false}
          isStoreFinishedProducts={true}
        />
      )}
      
      {/* Stock Threshold Settings Modal */}
      {showThresholdSettings && (
        <StockThresholdSettings
          storeId={selectedStoreId || context.user?.storeId || ''}
          accessToken={context.user?.accessToken || ''}
          thresholds={stockThresholds}
          onClose={() => setShowThresholdSettings(false)}
          onSave={(newThresholds) => {
            setStockThresholds(newThresholds);
            setShowThresholdSettings(false);
          }}
        />
      )}
    </div>
  );
}
