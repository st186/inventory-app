import { useState, useEffect, useRef } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { SkeletonListRows, SkeletonStatTiles } from './ui/skeleton';
import { StatTile } from './ui/stat-tile';
import { t as tSaved, useT } from '../utils/i18n';
import { momoName } from './stock/stockShared';
import * as api from '../utils/api';
import { formatDateTimeIST } from '../utils/timezone';
import { InventoryContextType } from '../App';
import { RECEIVED_STATUSES, receivedAtIST } from '../utils/requestStock';
import { eventsApi } from '../utils/eventsApi';
import { sumShippedPieces, productionMonthMovement, productionMovementSince, productionPreviousMonthClosing } from './stock/recalibrationMath';

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
 const { t, lang } = useT();
 const [open, setOpen] = useState(true);
 // What is typed in a count box (kept as text while typing, e.g. "12.").
 const [drafts, setDrafts] = useState<Record<string, string>>({});
 const [items, setItems] = useState<RecalibrationItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [lastRecalibration, setLastRecalibration] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState(false);
 const eventReturnsRef = useRef<any[]>([]);
 
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
 setError(tSaved('stock.count.loadFailed'));
 } finally {
 setLoading(false);
 }
 }

 async function loadProductionHouseStock() {
 // NEW: Fetch fresh, unfiltered production data directly from API
 // instead of using context.productionData which may be date-filtered
 let productionData: any[] = [];
 try {
 productionData = await api.fetchProductionData();
 console.log('🔄 Fetched raw production data for recalibration:', {
 totalRecords: productionData.length,
 sampleRecord: productionData[0]
 });
 } catch (error) {
 console.error('❌ Failed to fetch production data for recalibration:', error);
 // Fallback to context data if fetch fails
 productionData = context.productionData || [];
 }
 // Leftover momos production has counted back in from event stalls (events.ts) are back on
 // the house's stock.
 let eventReturns: any[] = [];
 if (!isStoreFinishedProducts) {
 try {
 eventReturns = await eventsApi.momoReturns('received');
 } catch {
 eventReturns = [];
 }
 }
 eventReturnsRef.current = eventReturns;
 
 // Get current month for filtering. .toISOString() converts to UTC first, which rolls
 // the month back for the ~5.5 hours after midnight IST on the 1st - use local components.
 const now = new Date();
 const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // "2025-12"
 
 // CRITICAL FIX: effectiveStoreId might be a UUID, we need to find the actual STORE- ID
 let actualStoreId = effectiveStoreId;
 let productionHouseUUID = effectiveStoreId;
 let locationIdForRecalibration = effectiveStoreId;
 
 // Check if effectiveStoreId is a UUID (doesn't start with 'STORE-')
 if (effectiveStoreId && !effectiveStoreId.startsWith('STORE-')) {
 // It's a UUID, find the production house with this UUID
 const productionHouse = context.productionHouses?.find(ph => ph.id === effectiveStoreId);
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
 productionHouseUUID = productionHouse.id;
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
 // Total Received = shipped amounts of requests delivered (or part delivered) TO this store
 // in current month, by the IST delivery date
 const receivedRequests = (context.productionRequests || []).filter(req => {
 if (!RECEIVED_STATUSES.includes(req.status)) return false;
 if (req.storeId !== effectiveStoreId) return false;

 const receivedAt = receivedAtIST(req);
 return !!receivedAt && receivedAt.startsWith(currentMonth);
 });

 totalProduced = sumShippedPieces(receivedRequests);
 
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
 // FOR PRODUCTION HOUSES: made this month (net of kurkure, which is folded from regular
 // momos) and sent to stores and event stalls (shipped requests, by IST ship date), less event
 // leftovers production counted back in (stock/recalibrationMath.ts).
 const movement = productionMonthMovement({
 productionData,
 requests: context.productionRequests || [],
 stores: context.stores || [],
 returns: eventReturns,
 ids: { productionHouseUUID, effectiveStoreId, originalStoreId },
 month: currentMonth,
 });
 totalProduced = movement.produced;
 totalSent = movement.sent;
 }
 
 // Get previous month's closing stock or last recalibration as opening balance
 // For stores: fetch opening balance from last recalibration or calculate from previous month
 const openingBalance = await fetchOpeningBalance(locationIdForRecalibration ?? null, currentMonth, isStoreFinishedProducts);
 
 // CRITICAL FIX: Check for MID-MONTH recalibration in the current month
 // If there's a recent recalibration (not on the 1st), use it as the baseline instead of opening balance
 let midMonthRecalStock: Record<string, number> | null = null;
 let recalibrationDate: string | null = null;
 
 try {
 const locationType = isStoreFinishedProducts ? 'store' : 'production_house';
 const latestRecal = await api.getLastRecalibration(
 context.user?.accessToken || '',
 locationIdForRecalibration || '',
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
 console.log(` 📦 Recal stock: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
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
 // Made and sent after the count, less event leftovers counted back in since (stock/recalibrationMath.ts).
 const movement = productionMovementSince({
 productionData,
 requests: context.productionRequests || [],
 stores: context.stores || [],
 returns: eventReturns,
 ids: { productionHouseUUID, effectiveStoreId, originalStoreId },
 since: recalibrationDate,
 });
 totalProduced = movement.produced;
 totalSent = movement.sent;
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
 console.log(' No recalibration found with UUID, checking with mapped store ID...');
 
 // Find all stores that map to this production house
 const mappedStores = context.stores?.filter(s => s.productionHouseId === productionHouseUUID) || [];
 console.log(' Stores mapped to this production house:', mappedStores.map(s => s.id));
 
 // Try each mapped store ID
 for (const store of mappedStores) {
 console.log(` Trying to fetch recalibration with store ID: ${store.id}`);
 recalResponse = await api.getLastRecalibration(
 context.user?.accessToken || '', 
 store.id,
 locationType
 );
 
 if (recalResponse?.record) {
 console.log(` ✅ Found recalibration using store ID: ${store.id}`);
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
 console.log(' Recalibration items:', recalResponse.record.items);
 } else if (recalDate === previousMonthStr) {
 console.log('✅ Using previous month recalibration as opening balance');
 } else {
 console.log('⚠️ Using older recalibration as opening balance from:', recalDate);
 }
 
 recalResponse.record.items.forEach((item: any) => {
 // Convert itemId to stockKey format
 const stockKey = getStockKey(item.itemId);
 balance[stockKey] = item.actualQuantity;
 console.log(` 📦 Opening balance mapping: ${item.itemId} -> ${stockKey} = ${item.actualQuantity}`);
 });
 
 console.log(' Parsed opening balance:', balance);
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
 const prevReceived = sumShippedPieces((context.productionRequests || [])
 .filter(req => {
 if (!RECEIVED_STATUSES.includes(req.status)) return false;
 if (req.storeId !== locationUUID) return false;
 const receivedAt = receivedAtIST(req);
 return !!receivedAt && receivedAt.startsWith(previousMonthStr);
 }));
 
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
 // FOR PRODUCTION HOUSES: last month's production (net of kurkure) less what was shipped,
 // less event leftovers production counted back in (stock/recalibrationMath.ts).
 return productionPreviousMonthClosing({
 productionData: context.productionData || [],
 requests: context.productionRequests || [],
 stores: context.stores || [],
 returns: eventReturnsRef.current,
 locationId: locationUUID,
 effectiveStoreId,
 previousMonth: previousMonthStr,
 });
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
 setError(tSaved('stock.count.pickWhy'));
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
 locationId: effectiveLocationId || '',
 locationType: (isProductionHouse ? 'production_house' : 'store') as 'store' | 'production_house',
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
 setOpen(false);
 if (onSaveSuccess) onSaveSuccess();
 }, 2000);
 
 } catch (err) {
 console.error('Error submitting recalibration:', err);
 setError(err instanceof Error ? err.message : tSaved('stock.count.failed'));
 } finally {
 setSaving(false);
 }
 }

 const totalItems = items.length;
 const itemsWithDifference = items.filter(item => item.difference !== 0).length;
 const totalWastage = items
 .filter(item => item.adjustmentType === 'wastage' && item.difference < 0)
 .reduce((sum, item) => sum + Math.abs(item.difference), 0);

 const dirty = items.some((item) => item.actualQuantity !== item.systemQuantity || item.notes !== '');

 return (
 <ResponsiveModal
 open={open}
 onOpenChange={(o) => { if (!o) setOpen(false); }}
 onClosed={onClose}
 dirty={dirty && !saving && !success}
 title={t('stock.count.sheetTitle')}
 description={`${locationName || store?.name || ''} · ${currentMonth}`}
 size="detail"
 footer={success ? undefined : (
 <Button size="lg" className="flex-1" loading={saving} disabled={loading} onClick={handleSubmit}>{t('stock.count.submit')}</Button>
 )}
 >
 <div className="flex flex-col gap-5" lang={lang}>
 {success ? (
 <Callout tone="success" title={t('stock.count.sent')} live>{t('stock.count.sentBody')}</Callout>
 ) : loading ? (
 <>
 <SkeletonStatTiles count={2} />
 <SkeletonListRows count={5} leading="none" />
 </>
 ) : (
 <>
 <div className="grid grid-cols-3 gap-3">
 <StatTile label={t('stock.count.items')} value={<span className="num">{totalItems}</span>} />
 <StatTile label={t('stock.count.withDiff')} value={<span className="num">{itemsWithDifference}</span>} />
 <StatTile label={t('stock.count.wasted')} value={<span className="num">{totalWastage.toFixed(2)}</span>} tone={totalWastage > 0 ? 'danger' : 'default'} />
 </div>
 {lastRecalibration && <p className="text-label text-text-3">{t('stock.count.last', { when: formatDateTimeIST(lastRecalibration, true) })}</p>}
 <Callout tone="info" title={t('stock.count.approvalNote')} />

 {items.length === 0 ? (
 <EmptyState compact icon={ClipboardList} title={t('stock.onHand.emptyTitle')} />
 ) : (
 <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
 {items.map((item) => (
 <div key={item.itemId} className="flex flex-col gap-3 px-4 py-3">
 <div className="flex items-center gap-3">
 <span className="flex min-w-0 flex-1 flex-col">
 <span className="text-body-md font-medium text-text">{momoName(lang, item.itemId.replace(/_momos?$/i, '').replace(/_([a-z])/g, (g) => g[1].toUpperCase()), item.itemName)}</span>
 <span className="num text-label text-text-3">{t('stock.count.expected', { n: `${item.systemQuantity} ${item.unit}` })}</span>
 {item.difference !== 0 && (
 <span className={`num text-label font-semibold ${item.difference < 0 ? 'text-danger' : 'text-success'}`}>
 {t('stock.count.diff', { n: `${item.difference > 0 ? '+' : ''}${item.difference.toFixed(2)}` })}
 </span>
 )}
 </span>
 <Input
 type="text"
 inputMode="decimal"
 aria-label={`${item.itemName} · ${t('stock.count.counted')}`}
 value={drafts[item.itemId] ?? String(item.actualQuantity)}
 onChange={(e) => {
 const v = e.target.value.replace(/[^\d.-]/g, '');
 setDrafts((d) => ({ ...d, [item.itemId]: v }));
 handleActualQuantityChange(item.itemId, v);
 }}
 onBlur={() => setDrafts((d) => { const next = { ...d }; delete next[item.itemId]; return next; })}
 className="num w-24 text-right"
 />
 </div>
 {item.difference !== 0 && (
 <>
 <SegmentedControl
 aria-label={t('stock.count.why')}
 size="sm"
 value={item.adjustmentType || ''}
 onValueChange={(v) => handleAdjustmentTypeChange(item.itemId, v as 'wastage' | 'counting_error')}
 options={[{ value: 'wastage', label: t('stock.count.wastage') }, { value: 'counting_error', label: t('stock.count.countingError') }]}
 />
 <Field label={t('stock.count.notes')} optional>
 <Input value={item.notes} onChange={(e) => handleNotesChange(item.itemId, e.target.value)} />
 </Field>
 </>
 )}
 </div>
 ))}
 </div>
 )}

 {error && <ErrorState title={t('stock.count.failed')} body={error} />}
 </>
 )}
 </div>
 </ResponsiveModal>
 );
}
