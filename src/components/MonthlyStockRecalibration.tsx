import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Save, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import * as api from '../utils/api';
import { formatDateTimeIST } from '../utils/timezone';
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
  onSaveSuccess?: () => void; // NEW: Callback to trigger refresh after save
  isProductionHouse?: boolean; // Flag to indicate if this is for production house stock
  isStoreFinishedProducts?: boolean; // NEW: Flag to indicate if this is for store's finished momo products
  currentCalculatedStock?: Record<string, number>; // Pre-calculated stock from Analytics (includes mid-month recalibration)
};

export function MonthlyStockRecalibration({ 
  context,
  selectedStoreId,
  onClose,
  onSaveSuccess,
  isProductionHouse,
  isStoreFinishedProducts = false,
  currentCalculatedStock
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
  // CHANGED: Enable recalibration for the entire month for Store Incharges
  const isRecalibrationWindow = true; // Always allow recalibration

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
    // NEW: Fetch fresh, unfiltered production data directly from API
    // instead of using context.productionData which may be date-filtered
    let productionData: any[] = [];
    try {
      productionData = await api.fetchProductionData(context.user?.accessToken || '');
      console.log('🔄 Fetched raw production data for recalibration:', {
        totalRecords: productionData.length,
        sampleRecord: productionData[0]
      });
    } catch (error) {
      console.error('❌ Failed to fetch production data for recalibration:', error);
      // Fallback to context data if fetch fails
      productionData = context.productionData || [];
    }
    
    // Get current month for filtering
    const currentMonth = new Date().toISOString().substring(0, 7); // "2025-12"
    
    // CRITICAL FIX: effectiveStoreId might be a UUID, we need to find the actual STORE- ID
    let actualStoreId = effectiveStoreId;
    let productionHouseUUID = effectiveStoreId;
    let locationIdForRecalibration = effectiveStoreId;
    
    // Check if effectiveStoreId is a UUID (doesn't start with 'STORE-')
    if (effectiveStoreId && !effectiveStoreId.startsWith('STORE-')) {
      // It's a UUID, find the production house with this UUID
      const productionHouse = context.productionHouses?.find(ph => ph.uuid === effectiveStoreId);
      if (productionHouse) {
        console.log('🔄 Resolved UUID to production house:', {
          uuid: effectiveStoreId,
          storeId: productionHouse.id,
          name: productionHouse.name
        });
        actualStoreId = productionHouse.id; // This is the STORE- format ID
        productionHouseUUID = effectiveStoreId; // Keep the UUID
        locationIdForRecalibration = productionHouse.id; // Use STORE- ID for recalibration
      }
    }
    
    let originalStoreId = actualStoreId; // The STORE- format ID for filtering production records
    
    // Determine if we're working with a store or production house
    if (isStoreFinishedProducts) {
      // For store finished products, use the store ID directly
      locationIdForRecalibration = actualStoreId;
    } else if (actualStoreId && actualStoreId.startsWith('STORE-')) {
      // For production houses, we need to find the actual UUID
      // First, check if this is a production house ID
      const productionHouse = context.productionHouses?.find(ph => ph.id === actualStoreId);
      if (productionHouse) {
        // It's a production house, use its UUID for filtering production requests
        productionHouseUUID = productionHouse.uuid;
        // But keep the store ID for filtering production data
        originalStoreId = actualStoreId; // This is the actual storeId in production records
        // But use the store ID for recalibration lookups (backend uses store ID)
        locationIdForRecalibration = actualStoreId;
      } else {
        // It's a store, find its production house
        const userStore = context.stores?.find(s => s.id === actualStoreId);
        if (userStore?.productionHouseId) {
          productionHouseUUID = userStore.productionHouseId;
          locationIdForRecalibration = productionHouseUUID;
        }
      }
    } else {
      // Direct production house UUID
      locationIdForRecalibration = actualStoreId;
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
        chicken: acc.chicken + (req.chicken || 0),
        chickenCheese: acc.chickenCheese + (req.chickenCheese || 0),
        veg: acc.veg + (req.veg || 0),
        cheeseCorn: acc.cheeseCorn + (req.cheeseCorn || 0),
        paneer: acc.paneer + (req.paneer || 0),
        vegKurkure: acc.vegKurkure + (req.vegKurkure || 0),
        chickenKurkure: acc.chickenKurkure + (req.chickenKurkure || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
      
      // Total Sold = Sales from this store in current month
      // USE CATEGORY SALES DATA (same as calculatePreviousMonthStock)
      const storeSales = (context.categorySalesData || []).filter(sale => {
        if (sale.storeId !== effectiveStoreId) return false;
        return sale.date && sale.date.startsWith(currentMonth);
      });
      
      totalSent = storeSales.reduce((acc, sale) => ({
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
    } else {
      // FOR PRODUCTION HOUSES: Calculate production and deliveries
      // Filter production data for this production house and current month
      console.log('🔍 Production filtering for recalibration:', {
        currentMonth,
        productionHouseUUID,
        effectiveStoreId,
        totalProductionRecords: productionData.length,
        sampleProductionRecord: productionData[0],
        // NEW: Debug first 3 production dates
        firstProductionDates: productionData.slice(0, 3).map(p => ({ date: p.date, type: typeof p.date }))
      });
      
      const filteredProduction = productionData.filter(p => {
        // FIX: Check both the date string itself AND extract YYYY-MM format
        const productionDate = p.date || '';
        const dateMatch = productionDate.startsWith(currentMonth) || 
                         productionDate.substring(0, 7) === currentMonth;
        
        // Match on storeId OR productionHouseId
        // FIX: Also check against originalStoreId since production records use the store ID, not the UUID
        const matchesStoreId = p.storeId === productionHouseUUID || 
                              p.storeId === effectiveStoreId ||
                              p.storeId === originalStoreId;
        const matchesProductionHouseId = p.productionHouseId === productionHouseUUID ||
                                        p.productionHouseId === effectiveStoreId ||
                                        p.productionHouseId === originalStoreId;
        
        const finalMatch = dateMatch && (matchesStoreId || matchesProductionHouseId);
        
        // NEW: Log ALL checks, not just when dateMatch is true
        console.log('🔍 Checking production record:', {
          date: p.date,
          dateSubstring: productionDate.substring(0, 7),
          currentMonth,
          dateMatch,
          pStoreId: p.storeId,
          pProductionHouseId: p.productionHouseId,
          productionHouseUUID,
          effectiveStoreId,
          originalStoreId,
          matchesStoreId,
          matchesProductionHouseId,
          finalMatch
        });
        
        return finalMatch;
      });
      
      console.log('🔍 Filtered production count:', filteredProduction.length);
      console.log('🔍 Sample filtered production:', filteredProduction[0]);
      
      // Calculate total produced for each momo type
      // IMPORTANT: Kurkure momos are made FROM regular momos
      // - Chicken Kurkure is made from Chicken Momo (subtract from chicken, add to chickenKurkure)
      // - Veg Kurkure is made from Veg Momo (subtract from veg, add to vegKurkure)
      const rawProduction = filteredProduction.reduce((acc, p) => ({
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
      
      // Apply parent-child relationship: Kurkure production consumes parent momos
      totalProduced = {
        chicken: rawProduction.chicken - rawProduction.chickenKurkure, // Subtract kurkure production
        chickenCheese: rawProduction.chickenCheese,
        veg: rawProduction.veg - rawProduction.vegKurkure, // Subtract kurkure production
        cheeseCorn: rawProduction.cheeseCorn,
        paneer: rawProduction.paneer,
        vegKurkure: rawProduction.vegKurkure, // Keep as-is
        chickenKurkure: rawProduction.chickenKurkure, // Keep as-is
      };
      
      console.log('🔍 Raw production (before parent-child adjustment):', rawProduction);
      console.log('🔍 Total produced (after parent-child adjustment):', totalProduced);
      console.log(`   📊 Chicken Momo: ${rawProduction.chicken} produced - ${rawProduction.chickenKurkure} used for kurkure = ${totalProduced.chicken} net`);
      console.log(`   📊 Veg Momo: ${rawProduction.veg} produced - ${rawProduction.vegKurkure} used for kurkure = ${totalProduced.veg} net`);
      
      // Calculate total sent to stores (delivered production requests)
      console.log(`🔍 Filtering requests - productionHouseUUID: ${productionHouseUUID}, effectiveStoreId: ${effectiveStoreId}, currentMonth: ${currentMonth}`);
      console.log(`🔍 Total production requests in context: ${(context.productionRequests || []).length}`);
      
      let firstMatchLogged = false;
      
      const fulfilledRequests = (context.productionRequests || []).filter(req => {
        if (req.status !== 'delivered') return false;
        
        const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
        if (!requestDate || !requestDate.startsWith(currentMonth)) return false;
        
        // Filter by production house - check both UUID and original ID
        const requestingStore = context.stores?.find(s => s.id === req.storeId);
        const matches = requestingStore?.productionHouseId === productionHouseUUID || 
                       requestingStore?.productionHouseId === effectiveStoreId;
        
        if (req.status === 'delivered' && requestDate?.startsWith(currentMonth)) {
          console.log(`🔍 Request ${req.requestId}: storeId=${req.storeId}, store.productionHouseId=${requestingStore?.productionHouseId}, comparing to UUID=${productionHouseUUID} or storeId=${effectiveStoreId}, matches=${matches}`);
          
          // Log the first matching request to see its structure
          if (matches && !firstMatchLogged) {
            console.log(`📦 First matching request structure:`, {
              requestId: req.requestId,
              chickenMomos: req.chickenMomos,
              cheeseCornMomos: req.cheeseCornMomos,
              allKeys: Object.keys(req)
            });
            firstMatchLogged = true;
          }
        }
        
        return matches;
      });
      
      totalSent = fulfilledRequests.reduce((acc, req) => ({
        chicken: acc.chicken + (req.chicken || 0),
        chickenCheese: acc.chickenCheese + (req.chickenCheese || 0),
        veg: acc.veg + (req.veg || 0),
        cheeseCorn: acc.cheeseCorn + (req.cheeseCorn || 0),
        paneer: acc.paneer + (req.paneer || 0),
        vegKurkure: acc.vegKurkure + (req.vegKurkure || 0),
        chickenKurkure: acc.chickenKurkure + (req.chickenKurkure || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
    }
    
    // Get previous month's closing stock or last recalibration as opening balance
    // For stores: fetch opening balance from last recalibration or calculate from previous month
    const openingBalance = await fetchOpeningBalance(locationIdForRecalibration, currentMonth, isStoreFinishedProducts);
    
    // CRITICAL FIX: Check for MID-MONTH recalibration in the current month
    // If there's a recent recalibration (not on the 1st), use it as the baseline instead of opening balance
    let midMonthRecalStock: Record<string, number> | null = null;
    let recalibrationDate: string | null = null;
    
    try {
      const locationType = isStoreFinishedProducts ? 'store' : 'production_house';
      const latestRecal = await api.getLastRecalibration(
        context.user?.accessToken || '',
        locationIdForRecalibration,
        locationType
      );
      
      if (latestRecal?.record) {
        const recalDate = latestRecal.record.date;
        const recalMonth = recalDate.substring(0, 7);
        const recalDay = parseInt(recalDate.substring(8, 10));
        
        console.log('🔍 Latest recalibration check:', {
          recalDate,
          recalMonth,
          currentMonth,
          recalDay,
          isSameMonth: recalMonth === currentMonth,
          isMidMonth: recalDay > 1
        });
        
        // Use recalibration if it's in the current month AND not on the 1st (mid-month recal)
        if (recalMonth === currentMonth && recalDay > 1) {
          console.log('✅ Found mid-month recalibration - using as baseline!');
          recalibrationDate = recalDate;
          midMonthRecalStock = {};
          
          // Parse recalibration items into stock object
          const recalItems = latestRecal.record.items || [];
          for (const item of recalItems) {
            // Find the inventory item to get the proper mapping
            const inventoryItem = context.inventoryItems?.find(
              inv => inv.name === item.itemId || inv.id === item.itemId
            );
            
            if (inventoryItem) {
              const camelName = inventoryItem.name.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
              const stockKey = camelName.replace(/Momo(s)?$/i, '');
              midMonthRecalStock[stockKey] = item.actualQuantity;
              console.log(`  📦 Recal stock: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
            }
          }
          
          console.log('📦 Mid-month recalibration stock:', midMonthRecalStock);
        }
      }
    } catch (err) {
      console.error('Error fetching latest recalibration for mid-month check:', err);
    }
    
    // If mid-month recalibration exists, recalculate production/deliveries from AFTER that date
    if (midMonthRecalStock && recalibrationDate && !isStoreFinishedProducts) {
      console.log('🔄 Recalculating with mid-month recalibration baseline...');
      
      // Extract just the date part from the recalibration timestamp for comparison
      const recalDateOnly = recalibrationDate.substring(0, 10); // "2026-01-14"
      
      // Recalculate production AFTER recalibration date
      // IMPORTANT: Exclude production from the same day as recalibration since we can't tell if it happened before/after
      const productionAfterRecal = productionData.filter(p => {
        const pDate = p.date || '';
        // Only include production from AFTER the recalibration date (not same day)
        const isAfterRecalDate = pDate > recalDateOnly;
        return isAfterRecalDate &&
               (p.storeId === productionHouseUUID || p.storeId === effectiveStoreId || p.storeId === originalStoreId ||
                p.productionHouseId === productionHouseUUID || p.productionHouseId === effectiveStoreId || p.productionHouseId === originalStoreId);
      });
      
      const rawProdAfter = productionAfterRecal.reduce((acc, p) => ({
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
      
      // Apply parent-child relationship
      totalProduced = {
        chicken: rawProdAfter.chicken - rawProdAfter.chickenKurkure,
        chickenCheese: rawProdAfter.chickenCheese,
        veg: rawProdAfter.veg - rawProdAfter.vegKurkure,
        cheeseCorn: rawProdAfter.cheeseCorn,
        paneer: rawProdAfter.paneer,
        vegKurkure: rawProdAfter.vegKurkure,
        chickenKurkure: rawProdAfter.chickenKurkure,
      };
      
      // Recalculate deliveries AFTER recalibration date
      const requestsAfterRecal = (context.productionRequests || []).filter(req => {
        if (req.status !== 'delivered') return false;
        const requestDate = req.deliveredDate || req.requestDate || req.createdAt;
        if (!requestDate || requestDate < recalibrationDate) return false;
        const requestingStore = context.stores?.find(s => s.id === req.storeId);
        return requestingStore?.productionHouseId === productionHouseUUID || 
               requestingStore?.productionHouseId === effectiveStoreId;
      });
      
      totalSent = requestsAfterRecal.reduce((acc, req) => ({
        chicken: acc.chicken + (req.chicken || 0),
        chickenCheese: acc.chickenCheese + (req.chickenCheese || 0),
        veg: acc.veg + (req.veg || 0),
        cheeseCorn: acc.cheeseCorn + (req.cheeseCorn || 0),
        paneer: acc.paneer + (req.paneer || 0),
        vegKurkure: acc.vegKurkure + (req.vegKurkure || 0),
        chickenKurkure: acc.chickenKurkure + (req.chickenKurkure || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });
      
      console.log('  Production AFTER recalibration:', totalProduced);
      console.log('  Deliveries AFTER recalibration:', totalSent);
    }
    
    console.log('🔄 Recalibration - Location ID:', locationIdForRecalibration);
    console.log('🔄 Recalibration - Is Store Finished Products:', isStoreFinishedProducts);
    console.log('🔄 Recalibration - Opening Balance:', openingBalance);
    console.log('🔄 Recalibration - Mid-Month Recal Stock:', midMonthRecalStock);
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
    
    // Helper to get the base name for stock lookup (remove _momo/_momos suffix and convert to camelCase)
    const getStockKey = (itemName: string) => {
      // For items like "chicken_momo", "chicken_cheese_momo", etc.
      // Remove _momo/_momos suffix first
      const baseName = itemName.replace(/_momo(s)?$/i, '');
      // Then convert to camelCase: "chicken_cheese" -> "chickenCheese"
      return snakeToCamel(baseName);
    };
    
    const recalItems: RecalibrationItem[] = finishedProducts.map(item => {
      // Stock = Opening Balance + Received/Produced - Sent/Sold
      // Get the proper key for looking up in production/sent data
      const stockKey = getStockKey(item.name);
      
      // CRITICAL FIX: Use pre-calculated stock from Analytics if available (includes mid-month recalibration logic)
      let stockAvailable: number;
      if (currentCalculatedStock && currentCalculatedStock[stockKey] !== undefined) {
        stockAvailable = currentCalculatedStock[stockKey];
        console.log(`📊 ${item.displayName} (${item.name} -> ${stockKey}): Using pre-calculated stock from Analytics = ${stockAvailable}`);
      } else {
        const opening = openingBalance[stockKey] || 0;
        const produced = totalProduced[stockKey] || 0;
        const sent = totalSent[stockKey] || 0;
        stockAvailable = opening + produced - sent;
        console.log(`📊 ${item.displayName} (${item.name} -> ${stockKey}): Opening=${opening}, Produced=${produced}, Sent=${sent}, Stock=${stockAvailable}`);
      }
      
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
      
      // Try to fetch with the provided ID first
      let recalResponse = await api.getLastRecalibration(
        context.user?.accessToken || '', 
        productionHouseUUID,
        locationType
      );
      
      // If not found and this is a production house UUID, also try with mapped store IDs
      if (!recalResponse?.record && !isStoreFinishedProducts) {
        console.log('   No recalibration found with UUID, checking with mapped store ID...');
        
        // Find all stores that map to this production house
        const mappedStores = context.stores?.filter(s => s.productionHouseId === productionHouseUUID) || [];
        console.log('   Stores mapped to this production house:', mappedStores.map(s => s.id));
        
        // Try each mapped store ID
        for (const store of mappedStores) {
          console.log(`   Trying to fetch recalibration with store ID: ${store.id}`);
          recalResponse = await api.getLastRecalibration(
            context.user?.accessToken || '', 
            store.id,
            locationType
          );
          
          if (recalResponse?.record) {
            console.log(`   ✅ Found recalibration using store ID: ${store.id}`);
            break;
          }
        }
      }
      
      if (recalResponse?.record) {
        const recalDate = recalResponse.record.date.substring(0, 7);
        
        console.log('📦 Recalibration Response:', recalResponse.record);
        const isOpeningBalance = recalResponse.record.isOpeningBalance;
        
        console.log('📅 Recalibration date comparison:', {
          recalDate,
          currentMonth,
          previousMonthStr,
          isOpeningBalance,
          isCurrentMonth: recalDate === currentMonth,
          isPreviousMonth: recalDate === previousMonthStr,
          isOlder: recalDate < previousMonthStr
        });
        
        // CHANGED: Check if recalibration is marked as opening balance (done on 1st)
        // Use current month recalibrations if they're marked as opening balance OR undefined (old records)
        // Always use previous month recalibrations as they become this month's opening balance
        const shouldUseCurrentMonth = recalDate === currentMonth && (isOpeningBalance === true || isOpeningBalance === undefined);
        if (shouldUseCurrentMonth || recalDate === previousMonthStr || recalDate < previousMonthStr) {
          // Use the recalibration's actual quantity as opening balance
          // Helper to convert snake_case to camelCase
          const snakeToCamel = (str: string) => {
            return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          };
          
          // Helper to get the base name for stock lookup (remove _momo/_momos suffix and convert to camelCase)
          const getStockKey = (itemName: string) => {
            // For items like "chicken_momo", "chicken_cheese_momo", etc.
            // Remove _momo/_momos suffix first
            const baseName = itemName.replace(/_momo(s)?$/i, '');
            // Then convert to camelCase: "chicken_cheese" -> "chickenCheese"
            return snakeToCamel(baseName);
          };
          
          const balance: any = {};
          
          if (recalDate === currentMonth && isOpeningBalance) {
            console.log('✅ Using current month opening balance recalibration (done on 1st)');
            console.log('   Recalibration items:', recalResponse.record.items);
          } else if (recalDate === previousMonthStr) {
            console.log('✅ Using previous month recalibration as opening balance');
          } else {
            console.log('⚠️ Using older recalibration as opening balance from:', recalDate);
          }
          
          recalResponse.record.items.forEach((item: any) => {
            // Convert itemId to stockKey format
            const stockKey = getStockKey(item.itemId);
            balance[stockKey] = item.actualQuantity;
            console.log(`  📦 Opening balance mapping: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
          });
          
          console.log('   Parsed opening balance:', balance);
          console.log('💰 Opening Balance Calculated:', balance);
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
      
      console.log(' calculatePreviousMonthStock - Calculated Closing Stock:', closingStock);
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
          // Check both UUID and original ID for production house matching
          return requestingStore?.productionHouseId === locationUUID || 
                 requestingStore?.productionHouseId === effectiveStoreId;
        })
        .reduce((acc, req) => ({
          chicken: acc.chicken + (req.chickenMomos || 0),
          chickenCheese: acc.chickenCheese + (req.chickenCheeseMomos || 0),
          veg: acc.veg + (req.veg || 0),
          cheeseCorn: acc.cheeseCorn + (req.cheeseCorn || 0),
          paneer: acc.paneer + (req.paneerMomos || 0),
          vegKurkure: acc.vegKurkure + (req.vegKurkureMomos || 0),
          chickenKurkure: acc.chickenKurkure + (req.chickenKurkureMomos || 0),
        }), {
          chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0,
          paneer: 0, vegKurkure: 0, chickenKurkure: 0
        });
      
      // Apply parent-child relationship for production houses:
      // Kurkure production consumes parent momos
      const adjustedProduction = {
        chicken: prevProduction.chicken - prevProduction.chickenKurkure,
        chickenCheese: prevProduction.chickenCheese,
        veg: prevProduction.veg - prevProduction.vegKurkure,
        cheeseCorn: prevProduction.cheeseCorn,
        paneer: prevProduction.paneer,
        vegKurkure: prevProduction.vegKurkure,
        chickenKurkure: prevProduction.chickenKurkure,
      };
      
      // Calculate closing stock = adjusted production - deliveries
      return {
        chicken: adjustedProduction.chicken - prevDeliveries.chicken,
        chickenCheese: adjustedProduction.chickenCheese - prevDeliveries.chickenCheese,
        veg: adjustedProduction.veg - prevDeliveries.veg,
        cheeseCorn: adjustedProduction.cheeseCorn - prevDeliveries.cheeseCorn,
        paneer: adjustedProduction.paneer - prevDeliveries.paneer,
        vegKurkure: adjustedProduction.vegKurkure - prevDeliveries.vegKurkure,
        chickenKurkure: adjustedProduction.chickenKurkure - prevDeliveries.chickenKurkure,
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
        if (onSaveSuccess) onSaveSuccess();
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
              <div className="flex-1">
                <div className="text-sm text-blue-900 font-medium mb-1">Last recalibration was performed on:</div>
                <div className="text-sm text-blue-700">
                  {formatDateTimeIST(lastRecalibration, true)}
                </div>
                <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                  Timezone: Indian Standard Time (GMT+5:30)
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-xl p-3 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-900">
              Stock recalibration is now enabled for the entire month. Operations Managers and Cluster Heads will be notified when you submit a recalibration.
            </div>
          </div>
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

                  {/* Current Stock */}
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Current Stock</div>
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