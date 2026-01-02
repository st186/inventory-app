import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import * as api from '../utils/api';
import { InventoryContextType } from '../App';

type RecalibrationItem = {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  systemQuantity: number;
  actualQuantity: number;
  difference: number;
  adjustmentType: 'wastage' | 'counting_error' | null;
  notes: string;
};

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  onClose: () => void;
  isProductionHouse?: boolean; // Flag to indicate if this is for production house stock
  isStoreFinishedProducts?: boolean; // NEW: Flag to indicate if this is for store's finished momo products
};

export function MonthlyStockRecalibration({ 
  context,
  selectedStoreId,
  onClose,
  isProductionHouse,
  isStoreFinishedProducts = false
}: Props) {
  const [items, setItems] = useState<RecalibrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastRecalibration, setLastRecalibration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const store = context.stores?.find(s => s.id === effectiveStoreId);
  
  // NEW: Handle production house lookup separately
  const effectiveLocationId = selectedStoreId || context.user?.storeId;
  const location = isProductionHouse 
    ? context.productionHouses?.find(ph => ph.id === effectiveLocationId)
    : context.stores?.find(s => s.id === effectiveLocationId);
  const locationName = isProductionHouse 
    ? (location as any)?.name 
    : (location as any)?.name;
    
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentDay = new Date().getDate();
  const isRecalibrationWindow = currentDay >= 1 && currentDay <= 5;

  useEffect(() => {
    loadInventoryData();
    checkLastRecalibration();
  }, []);

  async function loadInventoryData() {
    try {
      setLoading(true);
      
      if (isProductionHouse || isStoreFinishedProducts) {
        // Load finished momo products stock (for production houses OR stores)
        await loadProductionHouseStock();
      } else {
        // Load regular inventory (raw materials)
        const inventory = await api.fetchInventory(context.user?.accessToken || '');
        
        // Filter based on store or production house
        const filteredInventory = inventory.filter(item => {
          if (effectiveStoreId) return item.storeId === effectiveStoreId;
          return false;
        });

        // Deduplicate items by itemId (keep only unique items)
        const uniqueItemsMap = new Map<string, typeof filteredInventory[0]>();
        filteredInventory.forEach(item => {
          // If item doesn't exist in map, or this item is more recent, keep it
          if (!uniqueItemsMap.has(item.id)) {
            uniqueItemsMap.set(item.id, item);
          }
        });

        // Convert to recalibration items
        const recalItems: RecalibrationItem[] = Array.from(uniqueItemsMap.values()).map(item => ({
          itemId: item.id,
          itemName: item.itemName,
          category: item.category,
          unit: item.unit,
          systemQuantity: item.quantity,
          actualQuantity: item.quantity, // Default to system quantity
          difference: 0,
          adjustmentType: null,
          notes: ''
        }));

        setItems(recalItems);
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  }

  async function loadProductionHouseStock() {
    // Get production data
    const productionData = context.productionData || [];
    
    // Get current month for filtering
    const currentMonth = new Date().toISOString().substring(0, 7); // "2025-12"
    
    let productionHouseUUID = effectiveStoreId;
    let locationIdForRecalibration = effectiveStoreId; // The ID to use for recalibration lookups
    
    // Determine if we're working with a store or production house
    if (isStoreFinishedProducts) {
      // For store finished products, use the store ID directly
      locationIdForRecalibration = effectiveStoreId;
    } else if (effectiveStoreId && effectiveStoreId.startsWith('STORE-')) {
      // For production houses accessed via store (backwards compatibility)
      const userStore = context.stores?.find(s => s.id === effectiveStoreId);
      if (userStore?.productionHouseId) {
        productionHouseUUID = userStore.productionHouseId;
        locationIdForRecalibration = productionHouseUUID;
      }
    } else {
      // Direct production house ID
      locationIdForRecalibration = effectiveStoreId;
    }
    
    let totalProduced: any;
    let totalSent: any;
    
    if (isStoreFinishedProducts) {
      // FOR STORES: Calculate stock received and sold (CURRENT MONTH ONLY)
      // Total Received = Delivered production requests TO this store in current month
      const receivedRequests = (context.productionRequests || []).filter(req => {
        if (req.status !== 'delivered') return false;
        if (req.storeId !== effectiveStoreId) return false;
        
        const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
        return requestDate && requestDate.startsWith(currentMonth);
      });
      
      totalProduced = receivedRequests.reduce((acc, req) => ({
        chicken: acc.chicken + (req.chickenMomos || 0),
        chickenCheese: acc.chickenCheese + (req.chickenCheeseMomos || 0),
        veg: acc.veg + (req.vegMomos || 0),
        cheeseCorn: acc.cheeseCorn + (req.cheeseCornMomos || 0),
        paneer: acc.paneer + (req.paneerMomos || 0),
        vegKurkure: acc.vegKurkure + (req.vegKurkureMomos || 0),
        chickenKurkure: acc.chickenKurkure + (req.chickenKurkureMomos || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
      
      // Total Sold = Sales from this store in current month
      const storeSales = (context.salesData || []).filter(sale => {
        if (sale.storeId !== effectiveStoreId) return false;
        return sale.date && sale.date.startsWith(currentMonth);
      });
      
      totalSent = storeSales.reduce((acc, sale) => ({
        chicken: acc.chicken + ((sale as any).chickenMomos || 0),
        chickenCheese: acc.chickenCheese + ((sale as any).chickenCheeseMomos || 0),
        veg: acc.veg + ((sale as any).vegMomos || 0),
        cheeseCorn: acc.cheeseCorn + ((sale as any).cheeseCornMomos || 0),
        paneer: acc.paneer + ((sale as any).paneerMomos || 0),
        vegKurkure: acc.vegKurkure + ((sale as any).vegKurkureMomos || 0),
        chickenKurkure: acc.chickenKurkure + ((sale as any).chickenKurkureMomos || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
    } else {
      // FOR PRODUCTION HOUSES: Calculate production and deliveries
      // Filter production data for this production house and current month
      const filteredProduction = productionData.filter(p => {
        if (!p.date.startsWith(currentMonth)) return false;
        
        // Match on storeId OR productionHouseId
        const matchesStoreId = p.storeId === productionHouseUUID || p.storeId === effectiveStoreId;
        const matchesProductionHouseId = p.productionHouseId === productionHouseUUID;
        
        return matchesStoreId || matchesProductionHouseId;
      });
      
      // Calculate total produced for each momo type
      totalProduced = filteredProduction.reduce((acc, p) => ({
        chicken: acc.chicken + (p.chickenMomos?.final || 0),
        chickenCheese: acc.chickenCheese + (p.chickenCheeseMomos?.final || 0),
        veg: acc.veg + (p.vegMomos?.final || 0),
        cheeseCorn: acc.cheeseCorn + (p.cheeseCornMomos?.final || 0),
        paneer: acc.paneer + (p.paneerMomos?.final || 0),
        vegKurkure: acc.vegKurkure + (p.vegKurkureMomos?.final || 0),
        chickenKurkure: acc.chickenKurkure + (p.chickenKurkureMomos?.final || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
      
      // Calculate total sent to stores (delivered production requests)
      const fulfilledRequests = (context.productionRequests || []).filter(req => {
        if (req.status !== 'delivered') return false;
        
        const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
        if (!requestDate || !requestDate.startsWith(currentMonth)) return false;
        
        // Filter by production house
        const requestingStore = context.stores?.find(s => s.id === req.storeId);
        return requestingStore?.productionHouseId === productionHouseUUID;
      });
      
      totalSent = fulfilledRequests.reduce((acc, req) => ({
        chicken: acc.chicken + (req.chickenMomos || 0),
        chickenCheese: acc.chickenCheese + (req.chickenCheeseMomos || 0),
        veg: acc.veg + (req.vegMomos || 0),
        cheeseCorn: acc.cheeseCorn + (req.cheeseCornMomos || 0),
        paneer: acc.paneer + (req.paneerMomos || 0),
        vegKurkure: acc.vegKurkure + (req.vegKurkureMomos || 0),
        chickenKurkure: acc.chickenKurkure + (req.chickenKurkureMomos || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
    }
    
    // Get previous month's closing stock or last recalibration as opening balance
    // For stores: fetch opening balance from last recalibration or calculate from previous month
    const openingBalance = await fetchOpeningBalance(locationIdForRecalibration, currentMonth, isStoreFinishedProducts);
    
    console.log('🔄 Recalibration - Location ID:', locationIdForRecalibration);
    console.log('🔄 Recalibration - Is Store Finished Products:', isStoreFinishedProducts);
    console.log('🔄 Recalibration - Opening Balance:', openingBalance);
    console.log('🔄 Recalibration - Total Received/Produced:', totalProduced);
    console.log('🔄 Recalibration - Total Sent/Sold:', totalSent);
    
    // Get finished product inventory items from context
    const finishedProducts = context.inventoryItems?.filter(item => 
      item.category === 'finished_product' && 
      item.isActive &&
      (item.linkedEntityType === 'global' || 
       (item.linkedEntityType === 'production_house' && item.linkedEntityId === locationIdForRecalibration) ||
       (item.linkedEntityType === 'store' && item.linkedEntityId === effectiveStoreId))
    ) || [];
    
    console.log('🔄 Recalibration - Finished Products from Context:', finishedProducts.length);
    
    // Helper to convert snake_case to camelCase for stock lookups
    const snakeToCamel = (str: string) => {
      return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    };
    
    const recalItems: RecalibrationItem[] = finishedProducts.map(item => {
      // Stock = Opening Balance + Received/Produced - Sent/Sold
      // Try both snake_case and camelCase versions for backwards compatibility
      const camelKey = snakeToCamel(item.name);
      const opening = openingBalance[camelKey] || openingBalance[item.name] || 0;
      const produced = totalProduced[camelKey] || totalProduced[item.name] || 0;
      const sent = totalSent[camelKey] || totalSent[item.name] || 0;
      const stockAvailable = opening + produced - sent;
      
      console.log(`📊 ${item.displayName}: Opening=${opening}, Produced=${produced}, Sent=${sent}, Stock=${stockAvailable}`);
      
      return {
        itemId: item.name, // Use the name field as itemId for matching with production data
        itemName: item.displayName,
        category: item.category,
        unit: item.unit,
        systemQuantity: stockAvailable,
        actualQuantity: stockAvailable, // Default to system quantity
        difference: 0,
        adjustmentType: null,
        notes: ''
      };
    });
    
    setItems(recalItems);
  }

  async function fetchOpeningBalance(productionHouseUUID: string | null, currentMonth: string, isStoreFinishedProducts: boolean): Promise<any> {
    if (!productionHouseUUID) {
      return {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      };
    }
    
    try {
      // Determine the correct location type
      const locationType = isStoreFinishedProducts ? 'store' : 'production_house';
      
      // Calculate previous month
      const [year, month] = currentMonth.split('-').map(Number);
      let prevYear = year;
      let prevMonth = month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
      }
      const previousMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
      
      console.log('🔄 fetchOpeningBalance - Location ID:', productionHouseUUID);
      console.log('🔄 fetchOpeningBalance - Location Type:', locationType);
      console.log('🔄 fetchOpeningBalance - Current Month:', currentMonth);
      console.log('🔄 fetchOpeningBalance - Looking for recalibration from:', previousMonthStr);
      
      // Fetch latest recalibration with correct location type
      const recalResponse = await api.getLastRecalibration(
        context.user?.accessToken || '', 
        productionHouseUUID,
        locationType
      );
      
      if (recalResponse?.record) {
        const recalDate = recalResponse.record.date.substring(0, 7);
        
        console.log('🔄 fetchOpeningBalance - Found recalibration from:', recalDate);
        console.log('🔄 fetchOpeningBalance - Recalibration data:', recalResponse.record);
        
        // Check if recalibration is from CURRENT month (opening balance) or LAST month (closing = this month's opening)
        // A recalibration for the current month IS the opening balance (done at start of month)
        if (recalDate === currentMonth || recalDate === previousMonthStr || recalDate < previousMonthStr) {
          // Use the recalibration's actual quantity as opening balance
          const balance: any = {};
          recalResponse.record.items.forEach((item: any) => {
            balance[item.itemId] = item.actualQuantity;
          });
          
          console.log('🔄 fetchOpeningBalance - Using recalibration as opening balance:', balance);
          console.log('🔄 fetchOpeningBalance - Recalibration was from:', recalDate === currentMonth ? 'CURRENT month (opening balance set)' : 'PREVIOUS month (closing = opening)');
          return balance;
        }
      }
      
      console.log('🔄 fetchOpeningBalance - No suitable recalibration found, calculating from transactions');
      
      // No suitable recalibration - calculate from previous month's transactions
      return await calculatePreviousMonthStock(productionHouseUUID, currentMonth, isStoreFinishedProducts);
    } catch (err) {
      console.error('Error fetching opening balance:', err);
      return {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      };
    }
  }

  async function calculatePreviousMonthStock(locationUUID: string, currentMonth: string, isStoreFinishedProducts: boolean): Promise<any> {
    // Get previous month - properly handle year boundaries
    const [year, month] = currentMonth.split('-').map(Number);
    
    // Calculate previous month
    let prevYear = year;
    let prevMonth = month - 1;
    
    // Handle year boundary (if current month is January)
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    // Format as YYYY-MM
    const previousMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    
    console.log('🔄 calculatePreviousMonthStock - Previous Month:', previousMonthStr);
    console.log('🔄 calculatePreviousMonthStock - Is Store:', isStoreFinishedProducts);
    
    if (isStoreFinishedProducts) {
      // FOR STORES: Calculate from previous month's deliveries and sales
      const prevReceived = (context.productionRequests || [])
        .filter(req => {
          if (req.status !== 'delivered') return false;
          if (req.storeId !== locationUUID) return false;
          const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
          return requestDate && requestDate.startsWith(previousMonthStr);
        })
        .reduce((acc, req) => ({
          chicken: acc.chicken + (req.chickenMomos || 0),
          chickenCheese: acc.chickenCheese + (req.chickenCheeseMomos || 0),
          veg: acc.veg + (req.vegMomos || 0),
          cheeseCorn: acc.cheeseCorn + (req.cheeseCornMomos || 0),
          paneer: acc.paneer + (req.paneerMomos || 0),
          vegKurkure: acc.vegKurkure + (req.vegKurkureMomos || 0),
          chickenKurkure: acc.chickenKurkure + (req.chickenKurkureMomos || 0),
        }), {
          chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
          paneer: 0, vegKurkure: 0, chickenKurkure: 0
        });
      
      console.log('🔄 calculatePreviousMonthStock - Previous Received:', prevReceived);
      console.log('🔄 calculatePreviousMonthStock - Context categorySalesData length:', (context.categorySalesData || []).length);
      
      // NOW USE THE DETAILED CATEGORY SALES DATA!
      // Filter category sales for previous month and this store
      const prevSold = (context.categorySalesData || [])
        .filter(sale => {
          if (sale.storeId !== locationUUID) return false;
          return sale.date && sale.date.startsWith(previousMonthStr);
        })
        .reduce((acc, sale) => ({
          chicken: acc.chicken + (sale.data['Chicken Momos'] || 0),
          chickenCheese: acc.chickenCheese + (sale.data['Chicken Cheese Momos'] || 0),
          veg: acc.veg + (sale.data['Veg Momos'] || 0),
          cheeseCorn: acc.cheeseCorn + (sale.data['Corn Cheese Momos'] || 0),
          paneer: acc.paneer + (sale.data['Paneer Momos'] || 0),
          vegKurkure: acc.vegKurkure + (sale.data['Veg Kurkure Momos'] || 0),
          chickenKurkure: acc.chickenKurkure + (sale.data['Chicken Kurkure Momos'] || 0),
        }), {
          chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
          paneer: 0, vegKurkure: 0, chickenKurkure: 0
        });
      
      console.log('🔄 calculatePreviousMonthStock - Previous Sold:', prevSold);
      
      // Calculate closing stock = received - sold
      // (We assume opening balance was 0 for the first calculation without a recalibration)
      const closingStock = {
        chicken: prevReceived.chicken - prevSold.chicken,
        chickenCheese: prevReceived.chickenCheese - prevSold.chickenCheese,
        veg: prevReceived.veg - prevSold.veg,
        cheeseCorn: prevReceived.cheeseCorn - prevSold.cheeseCorn,
        paneer: prevReceived.paneer - prevSold.paneer,
        vegKurkure: prevReceived.vegKurkure - prevSold.vegKurkure,
        chickenKurkure: prevReceived.chickenKurkure - prevSold.chickenKurkure,
      };
      
      console.log('🔄 calculatePreviousMonthStock - Calculated Closing Stock:', closingStock);
      return closingStock;
    } else {
      // FOR PRODUCTION HOUSES: Calculate from previous month's production and deliveries
      const productionData = context.productionData || [];
      
      // Get previous month's production
      const prevProduction = productionData
        .filter(p => {
          if (!p.date.startsWith(previousMonthStr)) return false;
          return p.storeId === locationUUID || p.productionHouseId === locationUUID;
        })
        .reduce((acc, p) => ({
          chicken: acc.chicken + (p.chickenMomos?.final || 0),
          chickenCheese: acc.chickenCheese + (p.chickenCheeseMomos?.final || 0),
          veg: acc.veg + (p.vegMomos?.final || 0),
          cheeseCorn: acc.cheeseCorn + (p.cheeseCornMomos?.final || 0),
          paneer: acc.paneer + (p.paneerMomos?.final || 0),
          vegKurkure: acc.vegKurkure + (p.vegKurkureMomos?.final || 0),
          chickenKurkure: acc.chickenKurkure + (p.chickenKurkureMomos?.final || 0),
        }), {
          chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
          paneer: 0, vegKurkure: 0, chickenKurkure: 0
        });
      
      // Get previous month's deliveries
      const prevDeliveries = (context.productionRequests || [])
        .filter(req => {
          if (req.status !== 'delivered') return false;
          const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
          if (!requestDate || !requestDate.startsWith(previousMonthStr)) return false;
          const requestingStore = context.stores?.find(s => s.id === req.storeId);
          return requestingStore?.productionHouseId === locationUUID;
        })
        .reduce((acc, req) => ({
          chicken: acc.chicken + (req.chickenMomos || 0),
          chickenCheese: acc.chickenCheese + (req.chickenCheeseMomos || 0),
          veg: acc.veg + (req.vegMomos || 0),
          cheeseCorn: acc.cheeseCorn + (req.cheeseCornMomos || 0),
          paneer: acc.paneer + (req.paneerMomos || 0),
          vegKurkure: acc.vegKurkure + (req.vegKurkureMomos || 0),
          chickenKurkure: acc.chickenKurkure + (req.chickenKurkureMomos || 0),
        }), {
          chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
          paneer: 0, vegKurkure: 0, chickenKurkure: 0
        });
      
      // Calculate closing stock
      return {
        chicken: prevProduction.chicken - prevDeliveries.chicken,
        chickenCheese: prevProduction.chickenCheese - prevDeliveries.chickenCheese,
        veg: prevProduction.veg - prevDeliveries.veg,
        cheeseCorn: prevProduction.cheeseCorn - prevDeliveries.cheeseCorn,
        paneer: prevProduction.paneer - prevDeliveries.paneer,
        vegKurkure: prevProduction.vegKurkure - prevDeliveries.vegKurkure,
        chickenKurkure: prevProduction.chickenKurkure - prevDeliveries.chickenKurkure,
      };
    }
  }

  async function checkLastRecalibration() {
    try {
      const locationId = effectiveStoreId;
      if (!locationId) return;

      // Determine the location type based on the component props
      const locationType = isProductionHouse ? 'production_house' : 'store';
      
      const result = await api.getLastRecalibration(context.user?.accessToken || '', locationId, locationType);
      if (result.lastRecalibration) {
        setLastRecalibration(result.lastRecalibration);
      }
    } catch (err) {
      console.error('Error checking last recalibration:', err);
    }
  }

  function handleActualQuantityChange(itemId: string, value: string) {
    const actualQty = parseFloat(value) || 0;
    
    setItems(items.map(item => {
      if (item.itemId === itemId) {
        const diff = actualQty - item.systemQuantity;
        return {
          ...item,
          actualQuantity: actualQty,
          difference: diff,
          // Reset adjustment type if difference is 0
          adjustmentType: diff === 0 ? null : item.adjustmentType
        };
      }
      return item;
    }));
  }

  function handleAdjustmentTypeChange(itemId: string, type: 'wastage' | 'counting_error') {
    setItems(items.map(item => 
      item.itemId === itemId ? { ...item, adjustmentType: type } : item
    ));
  }

  function handleNotesChange(itemId: string, notes: string) {
    setItems(items.map(item => 
      item.itemId === itemId ? { ...item, notes } : item
    ));
  }

  async function handleSubmit() {
    // Validate: items with difference must have adjustment type selected
    const invalidItems = items.filter(item => item.difference !== 0 && !item.adjustmentType);
    
    if (invalidItems.length > 0) {
      setError(`Please select adjustment type (Wastage or Counting Error) for all items with differences`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      console.log(`📊 Submitting recalibration:
        - locationId: ${effectiveLocationId}
        - locationType: ${isProductionHouse ? 'production_house' : 'store'}
        - locationName: ${locationName}
        - isProductionHouse: ${isProductionHouse}`);

      const recalibrationData = {
        locationId: effectiveLocationId,
        locationType: isProductionHouse ? 'production_house' : 'store',
        locationName: locationName,
        items: items.map(item => ({
          itemId: item.itemId,
          itemName: item.itemName,
          category: item.category,
          unit: item.unit,
          systemQuantity: item.systemQuantity,
          actualQuantity: item.actualQuantity,
          difference: item.difference,
          adjustmentType: item.adjustmentType,
          notes: item.notes
        }))
      };

      await api.submitStockRecalibration(context.user?.accessToken || '', recalibrationData);
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (err) {
      console.error('Error submitting recalibration:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit recalibration');
    } finally {
      setSaving(false);
    }
  }

  const totalItems = items.length;
  const itemsWithDifference = items.filter(item => item.difference !== 0).length;
  const totalWastage = items
    .filter(item => item.adjustmentType === 'wastage' && item.difference < 0)
    .reduce((sum, item) => sum + Math.abs(item.difference), 0);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
            <span className="text-gray-700">Loading inventory data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl text-gray-900">Recalibration Submitted!</h3>
            <p className="text-gray-600 text-center">Your recalibration has been submitted for approval.</p>
            <p className="text-sm text-gray-500 text-center">A manager or cluster head will review and approve it.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full my-8">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 p-6 rounded-t-2xl">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-white/30">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl text-white">Monthly Stock Recalibration</h2>
                <p className="text-white/80 text-sm">
                  {locationName || store?.name} - {currentMonth}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-2 border-white/30 hover:bg-white/30 transition-all"
            >
              <XCircle className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-purple-200">
              <div className="text-sm text-gray-600 mb-1">Total Items</div>
              <div className="text-2xl text-purple-600">{totalItems}</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-orange-200">
              <div className="text-sm text-gray-600 mb-1">Items with Difference</div>
              <div className="text-2xl text-orange-600">{itemsWithDifference}</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-red-200">
              <div className="text-sm text-gray-600 mb-1">Total Wastage</div>
              <div className="text-2xl text-red-600">{totalWastage.toFixed(2)}</div>
            </div>
          </div>

          {lastRecalibration && (
            <div className="mt-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-blue-900">Last recalibration was performed on:</div>
                <div className="text-sm text-blue-700">
                  {new Date(lastRecalibration).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </div>
              </div>
            </div>
          )}

          {!isRecalibrationWindow && (
            <div className="mt-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                Stock recalibration is typically performed on the 1st to 5th day of each month. You can still perform it now if needed.
              </div>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="p-6 max-h-[500px] overflow-y-auto">
          <div className="space-y-4">
            {items.map((item, index) => (
              <div 
                key={item.itemId}
                className={`bg-gradient-to-r ${
                  item.difference !== 0 
                    ? 'from-red-50 to-orange-50 border-red-200' 
                    : 'from-gray-50 to-gray-100 border-gray-200'
                } border-2 rounded-xl p-4`}
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  {/* Item Info */}
                  <div className="md:col-span-3">
                    <div className="text-sm text-gray-500">Item {index + 1}</div>
                    <div className="text-gray-900">{item.itemName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {item.category.replace(/_/g, ' ')} • {item.unit}
                    </div>
                  </div>

                  {/* System Quantity */}
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">System Stock</div>
                    <div className="text-gray-900">{item.systemQuantity} {item.unit}</div>
                  </div>

                  {/* Actual Quantity Input */}
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Actual Count</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.actualQuantity}
                      onChange={(e) => handleActualQuantityChange(item.itemId, e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter count"
                    />
                  </div>

                  {/* Difference */}
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Difference</div>
                    <div className={`text-lg ${
                      item.difference > 0 ? 'text-green-600' : 
                      item.difference < 0 ? 'text-red-600' : 
                      'text-gray-600'
                    }`}>
                      {item.difference > 0 ? '+' : ''}{item.difference.toFixed(2)}
                    </div>
                  </div>

                  {/* Adjustment Type */}
                  <div className="md:col-span-3">
                    {item.difference !== 0 && (
                      <div>
                        <label className="text-xs text-gray-500 mb-2 block">Adjustment Type *</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAdjustmentTypeChange(item.itemId, 'wastage')}
                            className={`px-3 py-1.5 rounded-lg text-sm border-2 transition-all ${
                              item.adjustmentType === 'wastage'
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-red-400'
                            }`}
                          >
                            Wastage
                          </button>
                          <button
                            onClick={() => handleAdjustmentTypeChange(item.itemId, 'counting_error')}
                            className={`px-3 py-1.5 rounded-lg text-sm border-2 transition-all ${
                              item.adjustmentType === 'counting_error'
                                ? 'bg-orange-600 text-white border-orange-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-orange-400'
                            }`}
                          >
                            Counting Error
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {item.difference !== 0 && (
                  <div className="mt-3">
                    <label className="text-xs text-gray-500 mb-1 block">Notes (Optional)</label>
                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => handleNotesChange(item.itemId, e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Add any additional notes..."
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 pb-4">
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">{error}</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 bg-gray-50 rounded-b-2xl border-t-2 border-gray-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl hover:from-purple-700 hover:to-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Recalibration
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}