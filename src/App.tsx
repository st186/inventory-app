// Bunny Momos - the data (sign-in, loading, saving) for every screen. What is on screen - the top
// bar, bottom nav / rail / sidebar, Account sheet, Inbox and each destination - is the app shell
// in components/shell (WP0b); screens load on first use from shell/destinations/screens.ts.
import type { ProductionBatch } from './utils/batches';
import { useState, useEffect, useMemo, useRef, lazy, Suspense, useCallback } from 'react';
// Sign-in is only for signed-out phones; the app reopens signed in, so its code loads on demand.
const AuthPage = lazy(() => import('./components/AuthPage').then(module => ({ default: module.AuthPage })));
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner';
import { usePasswordPolicy, PasswordExpiryBanner } from './components/PasswordSecurity';
import { setLanguageOwner } from './utils/bunnyLanguage';
import { setAppLanguageOwner } from './utils/appLanguage';
import { AppShell } from './components/shell/AppShell';
import { buildNav, type BadgeKey } from './components/shell/navConfig';
import type { LegacyTarget } from './components/shell/router';
import { apiNotificationsSource } from './components/Notifications';
import { t } from './utils/i18n';
// Note: StockRequestReminderScheduler and AttendanceReminderScheduler were removed
// from the render tree — reminders now run server-side via pg_cron (see
// supabase/migrations/20260701000000_reminder_cron_jobs.sql), so no client-side
// polling is needed. (AttendanceReminderScheduler's file has since been deleted.)
// Loaded on demand: the change-password form (blocking or as a sheet) and the audit dashboard.
const ChangePasswordDialog = lazy(() => import('./components/ChangePasswordDialog').then(module => ({ default: module.ChangePasswordDialog })));
const AuditDashboard = lazy(() => import('./components/AuditDashboard').then(module => ({ default: module.AuditDashboard })));
import { getSupabaseClient } from './utils/supabase/client';
import { projectId, publicAnonKey } from './utils/supabase/info';
import * as api from './utils/api';
import * as pushNotifications from './utils/pushNotifications';
import * as nativePushNotifications from './utils/nativePushNotifications';
import * as dataCache from './utils/dataCache';
import { startAuthTracking, currentAccessToken, peekStoredSession } from './utils/accessToken';
import { clearMemoryCache, hasFeature, loadServerFeatures, onConnectivity, requestJson, whenFeaturesKnown } from './utils/http';
import { ALL_DATASET_KEYS, DATASETS, DEDUPED_DATASETS, datasetsFor, dedupeById, keepsStaffList, loadDatasets, mergeDateWindow, needsBusinessData, profileFrom, profileFromRecord, stripEmployeeImages, type DatasetKey, type DateWindow } from './utils/startupData';
import { SyncStatus, useOutbox } from './components/SyncStatus';
import { useForegroundInterval } from './utils/appVisibility';
import * as outbox from './utils/outbox';
import { toast } from 'sonner';

import { useRiderLocationSharing } from './utils/riderLocationSharing';
import { getTodayIST } from './utils/timezone';

export type InventoryItem = {
 id: string;
 date: string;
 // Food & packaging only for new entries; older records can carry a retired key (see
 // LEGACY_CATEGORY_CANONICAL in utils/inventoryData.ts) or a cluster-head custom category.
 category: 'fresh_produce' | 'staples' | 'spices_seasonings' | 'bread_buns' | 'dairy' | 'meat' | 'packaging' | 'packaging_bulk' | 'beverages' |'cleaning_sanitation' | 'equipment_smallwares' | 'staff_welfare_ppe' | 'office_admin_supplies';
 itemName: string;
 quantity: number;
 unit: string;
 costPerUnit: number;
 totalCost: number;
 storeId?: string; // Optional storeId for multi-store filtering
 entityType?: 'store' | 'production_house'; // Which entity this expense belongs to
 productionHouseId?: string; // Set when entityType is 'production_house'
 createdBy?: string; // User ID who created this entry
 createdByName?: string; // User name who created this entry
 createdByEmail?: string; // User email who created this entry
 // Payment method fields
 paymentMethod?: 'cash' | 'online' | 'both' | 'owner'; // owner = cluster head's own money
 cashAmount?: number; // Amount paid via cash (for 'both' option)
 onlineAmount?: number; // Amount paid via online (for 'both' option)
 paidFromProductionHouseId?: string | null; // store bill paid from this production house's cash (utils/cashSource.ts)
 priceCheckOk?: boolean; // an unusual price someone confirmed is right (utils/expenseChecks.ts)
 // Beverage packaging detail (category === 'beverages') - lets Utilities stock status
 // convert a purchase into a real piece count regardless of whether it was bought by
 // the carton or loose. quantity/unit above are still set to the resulting total pieces
 // so every existing cost/report calculation keeps working unchanged.
 packageType?: 'carton' | 'pieces';
 cartonCount?: number; // Set when packageType is 'carton'
 piecesPerCarton?: number; // Set when packageType is 'carton'
 volumeMl?: number; // Volume of a single piece, in mL (e.g. 750 for a 750mL bottle, 1000 for 1L)
 // Optional weight of a single piece, in grams (e.g. a 200g packet of Aromatic Powder).
 // Only meaningful when quantity/unit is a piece count ('pcs'/'units') - deliberately
 // optional since plenty of piece-counted items (tissues, cutlery) have no useful weight.
 weightPerUnitGrams?: number;
 vendor?: string; // set when read from a scanned invoice
 invoiceRef?: string; // scanned invoice's number, if it had one
};

export type OverheadItem = {
 id: string;
 date: string;
 // Kept in sync with OVERHEAD_CATEGORY_META (src/utils/inventoryData.ts) - that's the
 // runtime source of truth for labels/grouping, this is just so a literal category value
 // written here typechecks against it. 'miscellaneous' and 'commission' are legacy
 // categories kept for backwards compatibility with old records; no longer selectable
 // in the form.
 category: 'fuel' | 'ev_charging' | 'travel' | 'transportation' | 'marketing' | 'service_charge' | 'repair' | 'renovation' | 'labour_charge' | 'puja_expense' | 'office_supplies' | 'deep_cleaning' | 'party' | 'breakfast' | 'lunch' | 'dinner' | 'evening_snacks' | 'emergency_online' | 'staff_emergency_services' | 'personal_expense' | 'utensils' | 'cleaning_supplies' | 'equipments' | 'license' | 'water_jar' | 'vehicle_maintenance' | 'donations_community' | 'staff_welfare' | 'miscellaneous' | 'commission' | 'hygiene_ppe' | 'professional_fees' | 'losses_writeoffs' | 'asset_kitchen_equipment' | 'asset_furniture' | 'asset_electrical' | 'asset_vehicle' | 'vehicle_emi';
 description: string;
 amount: number;
 storeId?: string; // Optional storeId for multi-store filtering
 entityType?: 'store' | 'production_house'; // Which entity this expense belongs to
 productionHouseId?: string; // Set when entityType is 'production_house'
 employeeId?: string; // For personal_expense category
 employeeName?: string; // For personal_expense category
 employeeIds?: string[]; // For breakfast/lunch/evening_snacks: which employees this meal covered
 expenseMonth?: string; // For personal_expense: YYYY-MM format to map expense to specific month (for backlogged salaries)
 vendor?: string; // set when read from a scanned invoice
 invoiceRef?: string;
 // Payment method fields
 paymentMethod?: 'cash' | 'online' | 'both' | 'owner'; // owner = cluster head's own money
 cashAmount?: number; // Amount paid via cash (for 'both' option)
 onlineAmount?: number; // Amount paid via online (for 'both' option)
 paidFromProductionHouseId?: string | null; // store bill paid from this production house's cash (utils/cashSource.ts)
};

export type FixedCostItem = {
 id: string;
 category: 'electricity' | 'rent' | 'internet_phone' | 'software_subscription' | 'lpg_gas';
 amount: number;
 description: string;
 date: string;
 userId: string;
 storeId?: string;
 entityType?: 'store' | 'production_house'; // Which entity this expense belongs to
 productionHouseId?: string; // Set when entityType is 'production_house'
 // Units and price per unit: cylinders for LPG, meter units for electricity
 units?: number;
 unitPrice?: number;
 forMonth?: string; // YYYY-MM the rent or electricity bill is for (components/money/BillFields.tsx)
 // Payment method fields
 paymentMethod?: 'cash' | 'online' | 'both' | 'owner'; // owner = cluster head's own money
 cashAmount?: number; // Amount paid via cash (for 'both' option)
 onlineAmount?: number; // Amount paid via online (for 'both' option)
 paidFromProductionHouseId?: string | null; // store bill paid from this production house's cash (utils/cashSource.ts)
};

export type SalesData = {
 id: string;
 date: string;
 offlineSales: number;
 paytmAmount: number;
 cashAmount: number;
 onlineSales: number;
 onlineSalesCommission?: number; // Commission charged by Swiggy/Zomato (reduces net profit)
 employeeSalary: number;
 storeId?: string; // Optional storeId for multi-store filtering
 createdBy: string;
 createdByName?: string; // User name who created this entry
 createdByEmail?: string; // User email who created this entry
 updatedBy?: string; // Stamped by the server whenever a person saves the day from the sales form
 approvalStatus: 'pending' | 'approved';
 actualCashInHand: number | null; // null = not counted yet (a POS-sync/top-up placeholder row)
 cashOffset: number;
 salesDiscrepancy?: number; // Settled discrepancy at time of sales settlement (locked value)
 approvalRequired: boolean;
 approvedBy: string | null;
 approvedAt: string | null;
 approvalRequested: boolean;
 approvalRequestedAt: string | null;
 requestedCashInHand: number | null;
 requestedOffset: number | null;
 rejectedBy: string | null;
 rejectedAt: string | null;
 rejectionReason: string | null;
 previousCashInHand?: number;
 usedOnlineMoney?: number;
 actualPaytmBalance?: number | null; // Closing Paytm balance (server-recomputed); null = not worked out yet
 paytmOffset?: number; // Paytm discrepancy/offset
 // POS integration placeholder: manually entered until the POS API is connected,
 // at which point these two fields become auto-fetched instead of typed in.
 posOnlineSales?: number;
 posOfflineSales?: number;
 // Discount/cancellation stats from the POS sync, split offline (Cash/Paytm counter
 // orders) vs online (Zomato/Swiggy) - only present on POS-synced records.
 offlineDiscount?: number;
 onlineDiscount?: number;
 offlineCancelledAmount?: number;
 offlineCancelledCount?: number;
 onlineCancelledAmount?: number;
 onlineCancelledCount?: number;
 // Raw per-payment-mode split of the day's counter sales (e.g. {Cash: 4055, Paytm: 20000,
 // PhonePe: 4540, Card: 0, ...}) - insight-only, doesn't change any total: Paytm/PhonePe/
 // Card/Google Pay/Razorpay are still all deliberately folded into one "Paytm" figure
 // everywhere else in the app. Only present on POS-synced records from this field's
 // introduction onward.
 paymentModeBreakdown?: Record<string, number>;
 // Orders Ciferon flagged IsComplimentary (comped/free) - value given away, not lost
 // revenue (these orders' BillAmount, typically 0, is still counted normally above).
 complimentaryCount?: number;
 complimentaryAmount?: number;
 // Cash Over/Short: when Cash + Paytm counted for the day doesn't match Net Offline
 // Sales, the till gap gets its own explained reason instead of being silently folded
 // into Sales. Positive amount = short (counted less than sales), negative = over.
 cashOverShortAmount?: number;
 cashOverShortReason?: 'missed_kot' | 'wrong_change' | 'tip' | 'counting_mistake' | 'other' | null;
 cashOverShortNote?: string | null;
};

export type MonthlyCommission = {
 id: string;
 month: string; // Format: "YYYY-MM" (e.g., "2025-01")
 commissionAmount: number; // Total commission for online food aggregators (Swiggy + Zomato)
 storeId?: string; // Optional storeId for multi-store filtering
 createdBy: string;
 createdByName?: string;
 createdByEmail?: string;
 createdAt: string;
 notes?: string; // Optional notes about the commission
};

export type OnlineCashRecalibration = {
 id: string;
 storeId: string;
 storeName: string;
 month: string; // Format: "YYYY-MM"
 date: string; // Actual date of recalibration
 systemBalance: number; // Calculated balance from system
 actualBalance: number; // Actual balance verified by store
 difference: number; // Difference (actual - system)
 notes: string;
 createdBy: string;
 createdAt: string;
 approvalStatus?: 'pending' | 'approved' | 'rejected';
 approvedBy?: string;
 approvedAt?: string;
};

export type ProductionData = {
 id: string;
 date: string;
 productionHouseId?: string; // Production House where production happened
 storeId?: string; // Backwards compatibility - old records might still use this
 createdBy: string;
 approvalStatus: 'pending' | 'approved';
 approvedBy: string | null;
 approvedAt: string | null;
 
 // Regular Momos (Dough + Stuffing based)
 chickenMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 chickenCheeseMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 vegMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 cheeseCornMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 paneerMomos: {
 dough: number;
 stuffing: number;
 final: number;
 };
 
 // Kurkure Momos (Batter + Coating based)
 vegKurkureMomos: {
 batter: number;
 coating: number;
 final: number;
 };
 chickenKurkureMomos: {
 batter: number;
 coating: number;
 final: number;
 };
 
 // Wastage
 wastage: {
 dough: number;
 stuffing: number;
 batter: number;
 coating: number;
 };
 
 // Pieces per stuffing batch for each type (key = chickenMomos etc.), from 25 Oct 2026.
 // Each type's `final` is the sum of its batches.
 batches?: Partial<Record<string, ProductionBatch[]>>;

 // Sauces and Chutneys
 sauces: {
 panfriedSauce: number;
 chilliChickenSauce: number;
 spicyKoreanSauce: number;
 hotGarlicSauce: number;
 tandooriSauce: number;
 soupPremix: number;
 greenMayoChutney: number;
 spicyRedChutney: number;
 };
};

export type SaveOutcome = { queued: boolean };

export type InventoryContextType = {
 inventory: InventoryItem[];
 overheads: OverheadItem[];
 fixedCosts: FixedCostItem[];
 salesData: SalesData[];
 categorySalesData: api.SalesDataRecord[]; // NEW: Detailed momo sales by type
 onlineCashRecalibrations: OnlineCashRecalibration[];
 onlineSalesData: api.OnlineSalesEntry[];
 onlinePayoutData: api.OnlinePayoutEntry[];
 aggregatorSettlements: api.AggregatorSettlement[];
 productionData: ProductionData[];
 productionHouses: api.ProductionHouse[];
 stockRequests: api.StockRequest[];
 productionRequests: api.ProductionRequest[];
 stores: api.Store[];
 managedStoreIds?: string[];
 managedProductionHouseIds?: string[];
 inventoryItems: api.DynamicInventoryItem[];
 loadInventoryItems: () => Promise<void>;
 // The adds and the day close resolve { queued: true } when the entry is waiting on the phone
 // (no signal) rather than saved - see saveViaOutbox. Older implementations resolve nothing.
 addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<void | SaveOutcome>;
 addOverheadItem: (item: Omit<OverheadItem, 'id'>) => Promise<void | SaveOutcome>;
 addFixedCostItem: (item: Omit<FixedCostItem, 'id'>) => Promise<void | SaveOutcome>;
 updateInventoryItem: (id: string, item: Omit<InventoryItem, 'id'>) => Promise<void>;
 updateOverheadItem: (id: string, item: Omit<OverheadItem, 'id'>) => Promise<void>;
 updateFixedCostItem: (id: string, item: Omit<FixedCostItem, 'id'>) => Promise<void>;
 deleteInventoryItem: (id: string) => Promise<void>;
 deleteOverheadItem: (id: string) => Promise<void>;
 deleteFixedCostItem: (id: string) => Promise<void>;
 addSalesData: (item: Omit<SalesData, 'id'>) => Promise<void | SaveOutcome>;
 updateSalesData: (id: string, item: Omit<SalesData, 'id'>) => Promise<void | SaveOutcome>;
 approveSalesData: (id: string) => Promise<void>;
 requestSalesApproval: (id: string, requestedCashInHand: number, requestedOffset: number) => Promise<void>;
 approveDiscrepancy: (id: string) => Promise<void>;
 rejectDiscrepancy: (id: string, reason: string) => Promise<void>;
 addProductionData: (item: Omit<ProductionData, 'id'>) => Promise<void>;
 updateProductionData: (id: string, item: Omit<ProductionData, 'id'>) => Promise<void>;
 approveProductionData: (id: string) => Promise<void>;
 addProductionHouse: (house: Omit<api.ProductionHouse, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
 updateProductionHouse: (id: string, updates: Partial<Omit<api.ProductionHouse, 'id' | 'createdAt'>>) => Promise<void>;
 updateProductionHouseInventory: (id: string, inventory: api.ProductionHouse['inventory']) => Promise<void>;
 deleteProductionHouse: (id: string) => Promise<void>;
 setProductionHouses: (houses: api.ProductionHouse[]) => void;
 createStockRequest: (request: Omit<api.StockRequest, 'id' | 'fulfilledQuantities' | 'status' | 'fulfilledBy' | 'fulfilledByName' | 'fulfillmentDate' | 'notes'>) => Promise<void>;
 fulfillStockRequest: (id: string, fulfilledQuantities: api.StockRequest['fulfilledQuantities'], fulfilledBy: string, fulfilledByName: string, notes?: string) => Promise<void>;
 cancelStockRequest: (id: string) => Promise<void>;
 isManager: boolean;
 user: { email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null; assignedStoreIds?: string[]; assignedProductionHouseIds?: string[] } | null;
 // Force-refreshes all context data in place (bypassing cache) - lets a child component
 // pull in fresh data after a server-side action (e.g. a manual POS sync) without a full
 // page reload, same underlying loadData() the nav bar's "Refresh data" button already uses.
 refreshData: () => Promise<void>;
 // Timestamp of the last manual "Refresh data" press - watch this in a useEffect
 // dependency array to re-fetch data a component loads independently of context (see
 // dataRefreshedAt's own comment above).
 dataRefreshedAt: number;
};

type AppUser = NonNullable<InventoryContextType['user']>;
type SessionUser = { id: string; email?: string; app_metadata?: Record<string, any>; user_metadata?: Record<string, any> };

// The signed-in person as the app uses them, from their login (role, employee id) plus their
// employee record (store, designation, assignments) when known.
function userFromSession(sessionUser: SessionUser, accessToken: string, profile: dataCache.CachedProfile | null): AppUser {
 const am = sessionUser.app_metadata || {};
 const md = sessionUser.user_metadata || {};
 const base: AppUser = {
  email: sessionUser.email || '',
  name: md.name || sessionUser.email?.split('@')[0] || 'User',
  role: (am.role ?? md.role) || 'manager',
  employeeId: (am.employeeId ?? md.employeeId) || null,
  accessToken,
  storeId: null,
  designation: (am.designation ?? md.designation) || null,
  assignedStoreIds: [],
  assignedProductionHouseIds: [],
 };
 return profile ? withProfile(base, profile) : base;
}

function withProfile(person: AppUser, profile: dataCache.CachedProfile): AppUser {
 return {
  ...person,
  storeId: profile.storeId || null,
  designation: (profile.designation || person.designation || null) as AppUser['designation'],
  assignedStoreIds: profile.assignedStoreIds || [],
  assignedProductionHouseIds: profile.assignedProductionHouseIds || [],
 };
}

export default function App() {
 // All useState hooks must be at the top, before any conditional returns. Which screen is open
 // is the shell router's business (components/shell/router.ts), not state here.
 const [user, setUser] = useState<{ email: string; name: string; role: string; employeeId: string | null; accessToken: string; storeId?: string | null; designation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null; assignedStoreIds?: string[]; assignedProductionHouseIds?: string[] } | null>(null);
 // Whose language choices apply: Bunny's language (voice, AI answers) and the App language
 // (menus, buttons) - English by default for owner/manager logins, Bengali for staff and riders.
 useEffect(() => {
  const owner = user?.employeeId || user?.email || null;
  setLanguageOwner(owner);
  setAppLanguageOwner(owner, user ? { role: user.role, designation: user.designation } : null);
 }, [user?.employeeId, user?.email, user?.role, user?.designation]);
 const [authError, setAuthError] = useState<string | null>(null);
 const [isCheckingAuth, setIsCheckingAuth] = useState(true);
 const [inventory, setInventory] = useState<InventoryItem[]>([]);
 const [overheads, setOverheads] = useState<OverheadItem[]>([]);
 const [fixedCosts, setFixedCosts] = useState<FixedCostItem[]>([]);
 const [salesData, setSalesData] = useState<SalesData[]>([]);
 const [categorySalesData, setCategorySalesData] = useState<api.SalesDataRecord[]>([]); // NEW: Detailed momo sales
 const [onlineCashRecalibrations, setOnlineCashRecalibrations] = useState<OnlineCashRecalibration[]>([]);
 // Consolidated here (Analytics page redesign) so Analytics.tsx, OnlineSalesTab.tsx, and
 // SalesData.tsx all read one shared fetch instead of three independent ones.
 const [onlineSalesData, setOnlineSalesData] = useState<api.OnlineSalesEntry[]>([]);
 const [onlinePayoutData, setOnlinePayoutData] = useState<api.OnlinePayoutEntry[]>([]);
 const [aggregatorSettlements, setAggregatorSettlements] = useState<api.AggregatorSettlement[]>([]);
 const [productionData, setProductionData] = useState<ProductionData[]>([]);
 const [isLoadingData, setIsLoadingData] = useState(false);
 // Bumped on every manual "Refresh data" press - a signal for child components that fetch
 // their OWN data independently of context (e.g. cash top-up requests in
 // SalesManagement.tsx/SalesView.tsx) to know a refresh happened and re-fetch too. Without
 // this, pressing refresh silently updated every context-driven figure (Cash in Hand,
 // Total Cash in Hand) while the Cash Top-up list/status sat stale until the next full page
 // reload or the user's own approve/reject/submit action on it.
 const [dataRefreshedAt, setDataRefreshedAt] = useState(0);
 const [stores, setStores] = useState<api.Store[]>([]);
 const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
 const [productionHouses, setProductionHouses] = useState<api.ProductionHouse[]>([]);
 const [stockRequests, setStockRequests] = useState<api.StockRequest[]>([]);
 const [productionRequests, setProductionRequests] = useState<api.ProductionRequest[]>([]);
 const [employees, setEmployees] = useState<api.Employee[]>([]);
 const [managedStoreIds, setManagedStoreIds] = useState<string[]>([]);
 const [managedProductionHouseIds, setManagedProductionHouseIds] = useState<string[]>([]);
 const [inventoryItems, setInventoryItems] = useState<api.DynamicInventoryItem[]>([]);

 // Get singleton Supabase client
 const supabaseClient = getSupabaseClient();

 // Login renewals and sign-outs that didn't come from the Logout button. user.accessToken is the
 // copy taken at login and is passed around to ~250 call sites; every request now sends the current
 // token anyway (utils/http.ts), but code that reads user.accessToken directly should see the
 // current one too. It is updated in place on purpose: setUser here would re-render the whole app
 // and re-run every effect that depends on `user` once an hour, for a value nothing renders.
 const userRef = useRef(user);
 userRef.current = user;
 const manualLogoutRef = useRef(false);
 useEffect(() => {
 startAuthTracking();
 const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
 if (event === 'TOKEN_REFRESHED' && session && userRef.current) {
 userRef.current.accessToken = session.access_token;
 }
 // Only a definite refusal gets here (the login server rejected the renewal, or the server
 // refused even a renewed token) - a renewal that failed on the network keeps the session.
 // Saved data stays on the phone: it is per person, and the outbox may hold unsent entries.
 if (event === 'SIGNED_OUT' && userRef.current && !manualLogoutRef.current) {
 console.warn('Signed out by the login server - showing the sign-in page.');
 setUser(null);
 resetLoadedData();
 dataCache.setCacheUser(null);
 outbox.setOwner(null); // kept on the phone; sent after they sign in again
 setAuthError('Your login has ended. Please sign in again.');
 }
 });
 return () => subscription.unsubscribe();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);


 // Load stores for cluster heads
 const loadStores = async () => {
 try {
 const storesData = await api.getStores();
 setStores(storesData);
 } catch (error) {
 // Silently handle authentication errors (user not logged in yet)
 if (error instanceof Error && 
 (error.message === 'Not authenticated' || error.message === 'Unauthorized')) {
 return;
 }
 console.error('Error loading stores:', error);
 }
 };

 // ============================================
 // DATA LOADING
 // ============================================
 // The app opens straight onto the copy saved on this phone (utils/dataCache.ts, IndexedDB, kept 7
 // days) and refreshes in the background (utils/startupData.ts: one /bootstrap call when the server
 // offers it, else one call per dataset, each allowed to fail on its own). It used to hold the
 // "Loading..." screen until ~20 requests in 7 rounds had finished (9-15 s), and one failed request
 // threw all the results away.

 // When the data on screen last came from the server, which parts couldn't be refreshed, and
 // whether anything was on screen at all - for the status line (components/SyncStatus.tsx).
 const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
 const [failedParts, setFailedParts] = useState<{ key: DatasetKey; offline: boolean }[]>([]);
 const [hasSavedData, setHasSavedData] = useState(false);
 // Which datasets currently hold rows (saved or loaded) - a date-range top-up needs a base to add to.
 const loadedKeysRef = useRef<Set<DatasetKey>>(new Set());
 // The arrays last written to the phone's copy, so only changed datasets are written again.
 const persistedRef = useRef<Partial<Record<DatasetKey, unknown>>>({});
 const refreshInFlightRef = useRef<Promise<void> | null>(null);

 // Puts one dataset on screen. `fromSavedCopy`: it came from the phone, so it needn't be saved again.
 const applyDataset = (key: DatasetKey, value: any, person: AppUser, fromSavedCopy = false) => {
  let rows = value;
  if (DEDUPED_DATASETS.includes(key) && Array.isArray(rows)) {
   const unique = dedupeById(rows);
   if (unique.length !== rows.length && !fromSavedCopy) duplicatesSeenRef.current = true;
   rows = unique;
  }
  if (fromSavedCopy) persistedRef.current[key] = rows;
  loadedKeysRef.current.add(key);
  const setList = LIST_SETTERS[key];
  if (setList) {
   setList(rows || []);
   return;
  }
  switch (key) {
   case 'employees': {
    if (keepsStaffList(person)) setEmployees(rows || []);
    if (!fromSavedCopy) applyProfile(profileFrom(rows, person.employeeId), person);
    break;
   }
   case 'meEmployee': {
    if (!fromSavedCopy) applyProfile(profileFromRecord(rows, person.employeeId), person);
    break;
   }
   case 'clusterInfo': {
    setManagedStoreIds(rows?.managedStoreIds || []);
    setManagedProductionHouseIds(rows?.managedProductionHouseIds || []);
    // Not a list anyone edits on this phone, so saved here rather than by the effect below.
    if (!fromSavedCopy && rows) dataCache.writeDataset('clusterInfo', rows);
    break;
   }
  }
 };

 // The list datasets and their state setters (employees and cluster info need more than a set).
 const LIST_SETTERS: Partial<Record<DatasetKey, (value: any) => void>> = {
  inventory: setInventory, overheads: setOverheads, fixedCosts: setFixedCosts, salesData: setSalesData,
  categorySales: setCategorySalesData, productionData: setProductionData, productionHouses: setProductionHouses,
  stockRequests: setStockRequests, productionRequests: setProductionRequests, inventoryItems: setInventoryItems,
  onlineCashRecalibrations: setOnlineCashRecalibrations, onlineSalesData: setOnlineSalesData,
  onlinePayoutData: setOnlinePayoutData, aggregatorSettlements: setAggregatorSettlements, stores: setStores,
 };

 // Their own store and designation, from their employee record: on screen, and saved so the next
 // open needn't wait for it.
 const applyProfile = (profile: dataCache.CachedProfile | null, person: AppUser) => {
  if (!profile) return;
  dataCache.setCachedProfile(profile);
  setUser((current) => {
   if (!current || current.employeeId !== person.employeeId) return current;
   const next = withProfile(current, profile);
   const same = next.storeId === current.storeId && next.designation === current.designation
    && JSON.stringify(next.assignedStoreIds) === JSON.stringify(current.assignedStoreIds || [])
    && JSON.stringify(next.assignedProductionHouseIds) === JSON.stringify(current.assignedProductionHouseIds || []);
   if (same) return current;
   userRef.current = next;
   return next;
  });
 };

 // Empties everything loaded for the last person (sign-out, or a different person signing in on a
 // shared phone - their lists mustn't linger in memory behind the new person's screens).
 const resetLoadedData = () => {
  setInventory([]); setOverheads([]); setFixedCosts([]); setSalesData([]); setCategorySalesData([]);
  setProductionData([]); setProductionHouses([]); setStockRequests([]); setProductionRequests([]);
  setInventoryItems([]); setOnlineCashRecalibrations([]); setOnlineSalesData([]); setOnlinePayoutData([]);
  setAggregatorSettlements([]); setStores([]); setEmployees([]); setManagedStoreIds([]); setManagedProductionHouseIds([]);
  loadedKeysRef.current = new Set();
  persistedRef.current = {};
  setLastUpdatedAt(null);
  setFailedParts([]);
  setHasSavedData(false);
 };

 // A date-range top-up: replaces the saved rows for those days with the server's.
 const applyWindow = (key: DatasetKey, window: DateWindow) => {
  const setList = LIST_SETTERS[key];
  if (!setList) return;
  loadedKeysRef.current.add(key);
  setList((prev: any[]) => dedupeById(mergeDateWindow(prev || [], window.rows || [], window.from, window.to, window.field)));
 };

 // Old duplicate rows came back from the server: the cluster head's phone quietly asks the server to
 // remove them (once per session), as before.
 const duplicatesSeenRef = useRef(false);
 const cleanDuplicatesOnce = (person: AppUser) => {
  if (!duplicatesSeenRef.current || person.role !== 'cluster_head' || sessionStorage.getItem('db_cleaned')) return;
  sessionStorage.setItem('db_cleaned', 'true');
  setTimeout(async () => {
   try {
    console.log('🧹 Silently cleaning duplicates in background...');
    const result = await api.cleanupDuplicates('');
    console.log(`✅ Cleaned ${result.removed} duplicates successfully`);
   } catch (error) {
    console.log('Auto-cleanup skipped:', error instanceof Error ? error.message : 'Unknown error');
   }
  }, 1500);
 };

 // Refreshes this person's data from the server in the background. One at a time; `force` (the
 // Refresh button) skips the memory copies, the bootstrap etag and date-range top-ups.
 const refreshData = (options: { force?: boolean } = {}): Promise<void> => {
  const person = userRef.current;
  if (!person) return Promise.resolve();
  if (refreshInFlightRef.current) return refreshInFlightRef.current;
  const run = (async () => {
   setIsLoadingData(true);
   const startedAt = Date.now();
   if (options.force) clearMemoryCache();
   const keys = datasetsFor(person);
   const result = await loadDatasets(keys, { force: options.force, hasSavedRows: (key) => loadedKeysRef.current.has(key) });
   if (userRef.current?.email !== person.email) return; // signed out or switched meanwhile
   for (const [key, value] of Object.entries(result.data)) applyDataset(key as DatasetKey, value, person);
   for (const [key, window] of Object.entries(result.windows)) applyWindow(key as DatasetKey, window!);
   // Outbox entries that may or may not have reached the server: did they? (outbox.reconcile)
   const reconcileKinds: [DatasetKey, outbox.OutboxKind][] = [['inventory', 'inventory'], ['overheads', 'overhead'], ['fixedCosts', 'fixed-cost'], ['salesData', 'sales']];
   for (const [key, kind] of reconcileKinds) {
    const window = result.windows[key];
    if (result.data[key]) outbox.reconcile(kind, result.data[key], { fetchStartedAt: startedAt });
    else if (window) outbox.reconcile(kind, window.rows, { fetchStartedAt: startedAt, from: window.from, to: window.to });
   }
   const succeeded = keys.filter((key) => !result.failed.some((f) => f.key === key));
   dataCache.markFetched(succeeded, result.hashes as Record<string, string>, {
    etag: result.etag,
    etagWindow: result.etagWindow,
    ...(result.full && result.failed.length === 0 ? { lastFullAt: Date.now() } : {}),
   });
   setFailedParts(result.failed);
   if (succeeded.length > 0 || keys.length === 0) setLastUpdatedAt(Date.now());
   cleanDuplicatesOnce(person);
  })().catch((error) => {
   console.error('Error refreshing data:', error);
  }).finally(() => {
   refreshInFlightRef.current = null;
   setIsLoadingData(false);
  });
  refreshInFlightRef.current = run;
  return run;
 };

 // Kept for AuditDashboard's onDataUpdate and older callers: (token, force) - the token is unused.
 const loadData = async (_accessToken?: string, forceRefresh = false) => refreshData({ force: forceRefresh });

 // Writes changed datasets to the phone's copy a moment after they change (a load, or an expense
 // added on this phone), so the next open shows them without waiting for the server.
 useEffect(() => {
  if (!user) return;
  const timer = setTimeout(() => {
   const current: Partial<Record<DatasetKey, unknown>> = {
    inventory, overheads, fixedCosts, salesData, categorySales: categorySalesData, productionData, productionHouses,
    stockRequests, productionRequests, inventoryItems, onlineCashRecalibrations, onlineSalesData, onlinePayoutData,
    aggregatorSettlements, stores, employees,
   };
   for (const key of datasetsFor(user)) {
    // Cluster info is saved when it loads; their own record lives in the meta (profile); the staff
    // list only for those whose screens use it.
    if (key === 'clusterInfo' || key === 'meEmployee' || !loadedKeysRef.current.has(key)) continue;
    if (key === 'employees' && !keepsStaffList(user)) continue;
    const value = current[key];
    if (persistedRef.current[key] === value) continue;
    persistedRef.current[key] = value;
    dataCache.writeDataset(key, key === 'employees' ? stripEmployeeImages((value as api.Employee[]) || []) : value);
   }
  }, 1500);
  return () => clearTimeout(timer);
 }, [user, inventory, overheads, fixedCosts, salesData, categorySalesData, productionData, productionHouses, stockRequests, productionRequests, inventoryItems, onlineCashRecalibrations, onlineSalesData, onlinePayoutData, aggregatorSettlements, stores, employees]);

 // Opens a session: the saved copy on screen at once, then a background refresh. Used at startup
 // (with the session read straight from storage - no network) and after signing in.
 const openSession = async (sessionUser: SessionUser, accessToken: string) => {
  const cacheOwner = ((sessionUser.app_metadata?.employeeId ?? sessionUser.user_metadata?.employeeId) || sessionUser.email || sessionUser.id) as string;
  // Read and write this person's own saved copy (shared phones - see dataCache.ts)
  dataCache.setCacheUser(cacheOwner);
  resetLoadedData();
  const saved = await dataCache.readCache(ALL_DATASET_KEYS);
  let person = userFromSession(sessionUser, accessToken, saved.meta?.profile ?? null);

  // Never opened on this phone (or not for 7 days): their store and designation come from their
  // employee record, which the screens need - wait for it, but not forever.
  if (person.employeeId && !saved.meta?.profile) {
   try {
    // Their own record where the server has the route (28 Oct 2026 on), else the staff list.
    await whenFeaturesKnown(3_000);
    const selfRoute = hasFeature('bootstrap-v1');
    const lean = hasFeature('lean-lists-v1') ? { 'X-Bunny-Client': '2' } : undefined;
    const json = await requestJson(`${api.API_BASE}${selfRoute ? DATASETS.meEmployee.path : DATASETS.employees.path}`, { headers: lean }, { timeoutMs: 10_000, retries: 1 });
    const profile = selfRoute
     ? profileFromRecord(DATASETS.meEmployee.pick(json), person.employeeId)
     : profileFrom(DATASETS.employees.pick(json), person.employeeId);
    if (profile) {
     dataCache.setCachedProfile(profile);
     person = userFromSession(sessionUser, accessToken, profile);
    }
   } catch (error) {
    console.error('Error fetching employee storeId on session check:', error);
   }
  }

  // Their Home's code starts loading now, alongside the data, and so does Analytics (the Insights
  // tab, and the old landing page) for managers and incharges, the rides screen for riders.
  if (person.role === 'cluster_head') import('./components/home/OwnerHome').catch(() => undefined);
  else if (person.designation === 'rider') import('./components/home/RiderHome').catch(() => undefined);
  else if (needsBusinessData(person)) import('./components/home/StaffHome').catch(() => undefined);
  else import('./components/home/CrewHome').catch(() => undefined);
  if (needsBusinessData(person)) import('./components/Analytics').catch(() => undefined);
  else if (person.designation === 'rider') import('./components/RiderTrips').catch(() => undefined);

  const wanted = datasetsFor(person);
  let shown = 0;
  let oldest = Infinity;
  for (const key of wanted) {
   if (saved.data[key] === undefined) continue;
   applyDataset(key, saved.data[key], person, true);
   shown++;
   oldest = Math.min(oldest, dataCache.getFetchedAt(key) || dataCache.getSavedAt(key) || Infinity);
  }
  setHasSavedData(shown > 0);
  setLastUpdatedAt(shown > 0 && oldest !== Infinity ? oldest : null);
  setFailedParts([]);
  userRef.current = person;
  setUser(person);
  // Their entries still waiting on this phone (and sending them, if there is a signal).
  outbox.setOwner(sessionUser.id);
  // Everything under 5 minutes old (reopened straight after closing): no refresh yet.
  const savedKinds = wanted.filter((key) => key !== 'meEmployee' && (key !== 'employees' || keepsStaffList(person)));
  if (savedKinds.length > 0 && savedKinds.every((key) => saved.data[key] !== undefined && dataCache.isCacheFresh(key))) {
   console.log('✅ Saved data is fresh - skipping API calls');
   return;
  }
  console.log(shown > 0 ? `⚡ Showing ${shown} saved datasets - refreshing in background` : '🔄 Nothing saved on this phone - loading');
  refreshData();
 };

 // Check for an existing session on mount. The session is read straight from storage (no network),
 // so the app opens on saved data at once; supabase-js renews the token in the background. (This
 // used to force a renewal first and then wait for all the data.)
 useEffect(() => {
  // Clear any stale redirect flags from previous sessions
  sessionStorage.removeItem('logout_redirect_in_progress');
  // Old copies (7 days) and the old localStorage copies
  dataCache.clearOldCaches();
  loadServerFeatures();
  startAuthTracking();

  const checkSession = async () => {
   try {
    const stored = peekStoredSession();
    if (stored) {
     await openSession(stored.user as SessionUser, stored.access_token);
     return;
    }
    // Not readable from storage (older supabase-js format): ask supabase-js.
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) await openSession(session.user as SessionUser, session.access_token);
   } catch (error) {
    console.log('Session check error:', error);
   } finally {
    setIsCheckingAuth(false);
   }
  };
  checkSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []); // Empty dependency array - only run once on mount

 // Load inventory items metadata
 const loadInventoryItems = async () => {
 try {
 const items = await api.fetchInventoryItems();
 // Writing the item list is for the cluster head and managers only (the server refuses
 // anyone else), so nobody else tries the set-up writes below.
 const canEditItems = user?.role === 'cluster_head' || user?.role === 'manager';
 
 // If no items exist, initialize defaults
 if (items.length === 0 && canEditItems) {
 console.log('📦 No inventory items found, initializing defaults...');
 try {
 await api.initializeDefaultInventoryItems();
 // Reload after initialization
 const reloadedItems = await api.fetchInventoryItems();
 setInventoryItems(reloadedItems);
 console.log(`✅ Initialized ${reloadedItems.length} default inventory items`);
 return;
 } catch (initError) {
 console.error('Error initializing default items:', initError);
 // Continue with empty array
 setInventoryItems([]);
 return;
 }
 }
 
 setInventoryItems(items);
 
 // Auto-migrate: Ensure the 7 core momo types exist as inventory items
 if (canEditItems) await ensureCoreMomosExist(items);
 } catch (error) {
 console.error('Error loading inventory items:', error);
 setInventoryItems([]);
 }
 };

 // Ensure the 7 core momo types exist as inventory items (migration/setup)
 const ensureCoreMomosExist = async (existingItems: api.DynamicInventoryItem[]) => {
 const coreMomos = [
 { name: 'chicken', displayName: 'Chicken Momos', variations: ['chicken momo', 'chicken momos'] },
 { name: 'chickenCheese', displayName: 'Chicken Cheese Momos', variations: ['chicken cheese momo', 'chicken cheese momos', 'chicken cheese'] },
 { name: 'veg', displayName: 'Veg Momos', variations: ['veg momo', 'veg momos', 'vegetable momos'] },
 { name: 'cheeseCorn', displayName: 'Cheese Corn Momos', variations: ['cheese corn momo', 'cheese corn momos', 'corn cheese'] },
 { name: 'paneer', displayName: 'Paneer Momos', variations: ['paneer momo', 'paneer momos'] },
 { name: 'vegKurkure', displayName: 'Veg Kurkure Momos', variations: ['veg kurkure momo', 'veg kurkure momos', 'veg kurkure'] },
 { name: 'chickenKurkure', displayName: 'Chicken Kurkure Momos', variations: ['chicken kurkure momo', 'chicken kurkure momos', 'chicken kurkure'] },
 ];

 try {
 let needsReload = false;
 
 for (const momo of coreMomos) {
 // Find existing item by name match (exact)
 let existingItem = existingItems.find(item => 
 item.name.toLowerCase() === momo.name.toLowerCase()
 );

 // If not found by name, try to find by displayName or variations
 if (!existingItem) {
 existingItem = existingItems.find(item => {
 const itemNameLower = item.displayName.toLowerCase();
 const momoNameLower = momo.displayName.toLowerCase();
 
 // Check if display names match (with or without "Momos")
 if (itemNameLower === momoNameLower) return true;
 if (itemNameLower.replace(/\s*momos?\s*/i, '').trim() === momoNameLower.replace(/\s*momos?\s*/i, '').trim()) return true;
 
 // Check variations
 return momo.variations.some(v => itemNameLower.includes(v.toLowerCase()));
 });
 }

 if (existingItem) {
 // Item exists but might have wrong name field - update it
 if (existingItem.name !== momo.name) {
 console.log(`🔧 Updating inventory item name: "${existingItem.displayName}" from "${existingItem.name}" to "${momo.name}"`);
 await api.updateInventoryItem(existingItem.id, {
 name: momo.name,
 displayName: momo.displayName,
 });
 needsReload = true;
 }
 } else {
 // Item doesn't exist - create it
 console.log(`📦 Creating core inventory item: ${momo.displayName}`);
 await api.addInventoryItem({
 name: momo.name,
 displayName: momo.displayName,
 category: 'finished_product',
 unit: 'pieces',
 linkedEntityType: 'global',
 createdBy: 'system'
 });
 needsReload = true;
 }
 }
 
 // Reload items after migration if changes were made
 if (needsReload) {
 const updatedItems = await api.fetchInventoryItems();
 setInventoryItems(updatedItems);
 }
 } catch (error) {
 console.error('Error ensuring core momos exist:', error);
 }
 };


 // Shared by both the web-push (service worker) and native (Capacitor/FCM) navigation paths,
 // and by the in-app notification bell (Notifications.tsx) - one resolver, so every entry
 // point lands on the same place.
 // The old { view, tab, highlightRequestId } targets go to the shell's router, which maps them to
 // where each screen lives now (router.ts LEGACY_ALIASES). A tap that arrives before the shell is
 // on screen (cold start from a notification) waits until it registers.
 const navigatorRef = useRef<((target: LegacyTarget) => void) | null>(null);
 const pendingTargetRef = useRef<LegacyTarget | null>(null);
 const registerNavigator = useCallback((open: ((target: LegacyTarget) => void) | null) => {
  navigatorRef.current = open;
  if (open && pendingTargetRef.current) {
   const pending = pendingTargetRef.current;
   pendingTargetRef.current = null;
   open(pending);
  }
 }, []);
 const applyNavigationTarget = useCallback((target: { view: string; tab?: string; highlightRequestId?: string }) => {
 console.log('🔔 [nav] applyNavigationTarget called with:', target);
 if (!target?.view) return;
 if (navigatorRef.current) navigatorRef.current(target);
 else pendingTargetRef.current = target;
 }, []);

 // Riders share their live location for the whole active ride, whichever screen is open
 // (it used to stop when they left the Riders screen mid-delivery).
 useRiderLocationSharing(user?.designation === 'rider');

 // Initialize push notifications when user logs in
 useEffect(() => {
 if (user) {
 const userId = user.employeeId || user.email;

 // Native (Android) push goes through Capacitor + FCM, not the web-push/VAPID flow below.
 if (nativePushNotifications.isNativePushSupported()) {
 nativePushNotifications.initializeNativePushNotifications(userId, applyNavigationTarget);
 return;
 }

 const setupPushNotifications = async () => {
 try {
 // Check if push notifications are supported
 if (!pushNotifications.isPushNotificationSupported()) {
 console.log('Push notifications not supported on this device');
 return;
 }

 // Get VAPID public key from server
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/push/vapid-public-key`,
 {
 headers: {
 'Authorization': `Bearer ${publicAnonKey}`
 }
 }
 );

 if (!response.ok) {
 console.log('Could not fetch VAPID key - push notifications disabled');
 return;
 }

 const data = await response.json();

 if (!data.configured || !data.publicKey) {
 console.log('📱 Push notifications not configured. To enable, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
 return;
 }

 // Initialize push notifications with user ID
 const success = await pushNotifications.initializePushNotifications(userId, data.publicKey);

 if (success) {
 console.log('🔔 Push notifications enabled successfully for user:', userId);
 }
 // Note: Detailed status messages are now logged by initializePushNotifications
 } catch (error) {
 console.log('ℹ️ Push notifications setup skipped:', error instanceof Error ? error.message : 'Unknown error');
 }
 };

 setupPushNotifications();
 }
 }, [user, applyNavigationTarget]); // Run when user changes

 // Periodic background refresh - without this, data loaded from cache on mount (e.g.
 // onlineSalesData/aggregatorSettlements) only ever updates again on a manual "Refresh
 // Data" click or a full page reload, so a POS sync that lands mid-session (not just the
 // nightly one) can sit stale in a tab left open for a while. Matches dataCache's own
 // 5-minute freshness window; only runs while the tab is actually visible so it doesn't
 // burn API calls in a backgrounded tab. Not forced: with the server's date ranges or
 // bootstrap etag an unchanged refresh costs almost nothing. Also refreshes when the app comes
 // back to the front or the signal returns, if the data is over two minutes old.
 const lastUpdatedRef = useRef<number | null>(null);
 lastUpdatedRef.current = lastUpdatedAt;
 useForegroundInterval(() => {
  console.log('🔄 Periodic background refresh (5 min)');
  refreshData();
 }, user ? 5 * 60 * 1000 : null);
 useEffect(() => {
 if (!user) return;
 return onConnectivity((event) => {
 if (event === 'offline') return;
 const age = Date.now() - (lastUpdatedRef.current || 0);
 if (age > 2 * 60 * 1000) refreshData();
 });
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [user?.email]);

 // Deep-link handling for push notification clicks (see public/sw.js).
 // Two delivery paths depending on whether a tab was already open when clicked:
 // 1. Tab already open: service worker postMessages this window directly.
 // 2. No tab open: service worker opens a new window with ?view=&tab=&highlightRequestId= params.
 useEffect(() => {
 console.log('🔔 [nav] Registering service worker message listener');

 // Case 1: tab was already open, service worker messages us directly
 const handleServiceWorkerMessage = (event: MessageEvent) => {
 console.log('🔔 [nav] Received message from service worker:', event.data);
 if (event.data?.type === 'notification-navigate' && event.data.target) {
 applyNavigationTarget(event.data.target);
 }
 };
 navigator.serviceWorker?.addEventListener?.('message', handleServiceWorkerMessage);

 // Case 2: a new window was opened with the target encoded in the URL
 const params = new URLSearchParams(window.location.search);
 const viewParam = params.get('view');
 const tabParam = params.get('tab');
 const highlightParam = params.get('highlightRequestId');
 if (viewParam) {
 console.log('🔔 [nav] Found navigation params in URL:', { viewParam, tabParam, highlightParam });
 applyNavigationTarget({ view: viewParam, tab: tabParam || undefined, highlightRequestId: highlightParam || undefined });
 // Clean the URL so refreshing doesn't re-trigger the same navigation
 window.history.replaceState({}, '', window.location.pathname);
 }

 return () => {
 navigator.serviceWorker?.removeEventListener?.('message', handleServiceWorkerMessage);
 };
 }, [applyNavigationTarget]);

 const handleLogin = async (email: string, password: string) => {
 setAuthError(null);
 try {
 const { data, error } = await supabaseClient.auth.signInWithPassword({
 email,
 password
 });

 if (error) {
 setAuthError(error.message);
 return;
 }

 if (data.user && data.session) {
 // Same path as reopening the app: their saved copy (if this phone has one) at once, then the
 // background refresh. They used to wait for the staff list before anything showed.
 await openSession(data.user as SessionUser, data.session.access_token);
 }
 } catch (error) {
 console.log('Login error:', error);
 setAuthError('Failed to sign in. Please try again.');
 }
 };

 const handleSignup = async (email: string, password: string, name: string, role: 'manager' | 'cluster_head' | 'employee' | 'audit') => {
 setAuthError(null);
 try {
 // Use server-side signup which auto-confirms email
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/auth/signup`,
 {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${publicAnonKey}`
 },
 body: JSON.stringify({
 email,
 password,
 name,
 role,
 employeeId: role === 'cluster_head' ? 'BM001' : role === 'audit' ? 'AUDIT001' : null
 })
 }
 );

 const data = await response.json();

 if (!response.ok) {
 setAuthError(data.error || 'Failed to create account');
 return;
 }

 if (!data.user) {
 setAuthError('Failed to create account');
 return;
 }

 // Create unified employee record for cluster head or audit
 if (role === 'cluster_head' || role === 'audit') {
 try {
 const employeeId = role === 'cluster_head' ? 'BM001' : 'AUDIT001';
 await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/unified-employees`,
 {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${publicAnonKey}`
 },
 body: JSON.stringify({
 employeeId: employeeId,
 name: name,
 email: email,
 role: role,
 employmentType: 'fulltime',
 joiningDate: getTodayIST(),
 createdBy: 'system',
 status: 'active',
 authUserId: data.user.id
 })
 }
 );
 } catch (err) {
 console.log('Error creating unified employee record:', err);
 }
 }

 // After successful signup, sign in the user
 await handleLogin(email, password);
 } catch (error) {
 console.log('Signup error:', error);
 setAuthError('Failed to create account. Please try again.');
 }
 };

 const handleLogout = async () => {
 // Entries still waiting to send stay on the phone and go out the next time this person signs
 // in - but they should know before leaving.
 const waiting = outbox.waitingCount();
 if (waiting > 0) {
  // The confirm dialog's code loads only when it's needed.
  const { confirm: ask } = await import('./components/ui/confirm');
  const ok = await ask({
   title: t('account.logoutWaitingTitle'),
   body: t('account.logoutWaitingBody', { n: waiting }),
   confirmLabel: t('account.logout'),
   tone: 'danger',
  });
  if (!ok) return;
 }
 // Tell the server this phone no longer belongs to this account, so their notifications (and the
 // rider's loud ride-request alert) stop arriving here after sign-out.
 try {
 if (user && nativePushNotifications.isNativePushSupported()) {
 await nativePushNotifications.unsubscribeNativePushNotifications(user.employeeId || user.email);
 } else if (user && pushNotifications.isPushNotificationSupported()) {
 // Same for the browser's web-push subscription, or the next person to sign in on this
 // browser keeps receiving this person's notifications.
 await pushNotifications.unsubscribeFromPushNotifications(user.employeeId || user.email);
 }
 } catch (error) {
 console.log('Could not unsubscribe push on logout:', error);
 }
 manualLogoutRef.current = true;
 try {
 // Offline, the server-side sign-out fails and supabase-js then keeps the session (the next
 // open would sign straight back in) - end it on this phone regardless.
 const { error } = await supabaseClient.auth.signOut();
 if (error) await supabaseClient.auth.signOut({ scope: 'local' });
 } finally {
 manualLogoutRef.current = false;
 }
 setUser(null);
 resetLoadedData();
 outbox.setOwner(null);
 // The next person to sign in on this phone starts on their own Home, not this person's page.
 window.history.replaceState(null, '', window.location.pathname);
 dataCache.invalidateAllCaches(); // Clear all caches on logout
 dataCache.setCacheUser(null);
 };

 const handleRefreshData = async () => {
 if (!user) return;
 console.log('🔄 Manual refresh triggered');
 await loadData(user.accessToken, true); // Force refresh bypasses cache
 setDataRefreshedAt(Date.now());
 };

 // DIAGNOSTIC: Check inventory database status
 const checkInventoryStatus = async () => {
 try {
 console.log('🔍 [DIAGNOSTIC] Checking inventory database status...');
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/diagnostic/inventory-status`,
 {
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${await currentAccessToken()}`
 }
 }
 );
 
 const data = await response.json();
 console.log('📊 [DIAGNOSTIC] Database status:', data);
 console.log(`📊 [DIAGNOSTIC] Total items in DB: ${data.totalInventoryCount}`);
 console.log(`📊 [DIAGNOSTIC] March 17 items: ${data.march17Count}`);
 if (data.march17Items && data.march17Items.length > 0) {
 console.table(data.march17Items);
 }
 console.log('📊 [DIAGNOSTIC] Latest 10 items:', data.latestItemIds);
 return data;
 } catch (error) {
 console.error('❌ [DIAGNOSTIC] Error:', error);
 }
 };

 // DIAGNOSTIC: Check all database key prefixes
 const checkAllKeys = async () => {
 try {
 console.log('🔍 [DIAGNOSTIC] Checking all database keys...');
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/diagnostic/all-keys`,
 {
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${await currentAccessToken()}`
 }
 }
 );
 
 const data = await response.json();
 console.log('📊 [DIAGNOSTIC] All keys result:', data);
 console.log('📊 [DIAGNOSTIC] Total sampled:', data.totalSampled);
 console.log('📊 [DIAGNOSTIC] Prefix summary:');
 console.table(data.prefixSummary);
 console.log('📊 [DIAGNOSTIC] Sample keys:', data.sampleKeys);
 return data;
 } catch (error) {
 console.error('❌ [DIAGNOSTIC] Error:', error);
 }
 };

 // DIAGNOSTIC: Search for backup keys
 const checkBackups = async () => {
 try {
 console.log('🔍 [DIAGNOSTIC] Searching for backup data...');
 const response = await fetch(
 `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/diagnostic/search-backups`,
 {
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${await currentAccessToken()}`
 }
 }
 );
 
 const data = await response.json();
 console.log('📊 [DIAGNOSTIC] Backup search result:', data);
 if (data.backups && data.backups.length > 0) {
 console.log('✅ Found backups:');
 console.table(data.backups);
 } else {
 console.log('❌ No backups found');
 }
 return data;
 } catch (error) {
 console.error('❌ [DIAGNOSTIC] Error:', error);
 }
 };

 // Expose diagnostic function globally for debugging
 (window as any).checkInventoryStatus = checkInventoryStatus;
 (window as any).checkAllKeys = checkAllKeys;
 (window as any).checkBackups = checkBackups;

 // New expenses and the day close are saved through the outbox (utils/outbox.ts): on the phone
 // first, then to the server. With no signal (or a signal that drops mid-save) the entry waits on
 // the phone, shows in the lists at once, and sends by itself later - instead of "Failed to save"
 // and the entry gone. A refusal from the server still throws, so the form shows the reason.
 // The saved row goes on screen from the outbox's onSent (one path for the first try and later
 // sends alike).
 const saveViaOutbox = async (input: outbox.OutboxInput): Promise<SaveOutcome> => {
  const result = await outbox.submit(input);
  if (result.status === 'sent') return { queued: false };
  if (result.entry.state === 'unsure') {
   toast.warning(`Weak signal - couldn't confirm "${input.label}" reached the server. It is kept on this phone: check "waiting to send" at the top before entering it again.`, { duration: 8000 });
  } else {
   toast.message(`No signal - "${input.label}" is saved on this phone and will send by itself when the signal is back.`, { duration: 6000 });
  }
  return { queued: true };
 };

 const money = (amount: number | undefined) => `₹${Math.round((amount || 0) * 100) / 100}`;

 const addInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
 if (!user) {
 console.error('❌ [ADD INVENTORY] No user found');
 return;
 }
 // The item's own storeId wins; the user's storeId only fills it in when missing (this
 // used to overwrite the store an operations manager or cluster head picked). Never for a
 // production-house-tagged item, which is identified by productionHouseId, not storeId.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 console.log('📤 [ADD INVENTORY] Saving inventory item:', { date: itemWithStore.date, itemName: itemWithStore.itemName, totalCost: itemWithStore.totalCost, storeId: itemWithStore.storeId });
 return saveViaOutbox({ kind: 'inventory', method: 'POST', path: '/inventory', body: itemWithStore, label: `${money(item.totalCost)} · ${item.itemName}` });
 };

 const addOverheadItem = async (item: Omit<OverheadItem, 'id'>) => {
 if (!user) return;
 console.log('💰 Adding Expense/Overhead item:', item.category, item.description);
 // The item's own storeId wins; the user's storeId only fills it in when missing (this
 // used to overwrite the store an operations manager or cluster head picked). Never for a
 // production-house-tagged item, which is identified by productionHouseId, not storeId.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 return saveViaOutbox({ kind: 'overhead', method: 'POST', path: '/overheads', body: itemWithStore, label: `${money(item.amount)} · ${item.description || item.category}` });
 };

 const addFixedCostItem = async (item: Omit<FixedCostItem, 'id'>) => {
 if (!user) return;
 // The item's own storeId wins; the user's storeId only fills it in when missing (this
 // used to overwrite the store an operations manager or cluster head picked). Never for a
 // production-house-tagged item, which is identified by productionHouseId, not storeId.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 return saveViaOutbox({ kind: 'fixed-cost', method: 'POST', path: '/fixed-costs', body: itemWithStore, label: `${money(item.amount)} · ${item.description || item.category}` });
 };

 // An entry sent from the outbox (first try or later): its saved row onto the screen. The
 // provisional row disappears with the outbox entry in the same render.
 useEffect(() => outbox.onSent((entry, response) => {
  const saved = response?.item;
  if (!saved?.id) return;
  const upsert = <T extends { id: string }>(prev: T[]) => prev.some((row) => row.id === saved.id)
   ? prev.map((row) => row.id === saved.id ? saved as T : row)
   : [...prev, saved as T];
  if (entry.kind === 'inventory') { setInventory(upsert); dataCache.invalidateCache('inventory'); }
  if (entry.kind === 'overhead') { setOverheads(upsert); dataCache.invalidateCache('overheads'); }
  if (entry.kind === 'fixed-cost') { setFixedCosts(upsert); dataCache.invalidateCache('fixedCosts'); }
  // The server saves onto the day's existing row (e.g. the nightly POS sync's) when there is one,
  // so this can come back as a row already in the list.
  if (entry.kind === 'sales') { setSalesData(upsert); dataCache.invalidateCache('salesData'); dataCache.invalidateCache('categorySales'); }
 }), []);

 // An expense still waiting in the outbox (its provisional row was edited or deleted on screen)
 // changes or removes the waiting entry - there is nothing on the server to change yet.
 const fillStore = <T extends { entityType?: string; storeId?: string }>(item: T): T => item.entityType === 'production_house' ? item : { ...item, storeId: item.storeId || user?.storeId || undefined };

 const updateInventoryItem = async (id: string, item: Omit<InventoryItem, 'id'>) => {
 if (!user) return;
 if (outbox.isPendingId(id)) return outbox.updateBody(outbox.entryIdOf(id), fillStore(item));
 try {
 // Keep the item's own storeId (editing someone else's entry used to move it to the
 // editor's store); only fill it in when missing. Never for a production-house-tagged item.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const updatedItem = await api.updateInventory(user.accessToken, id, itemWithStore);
 setInventory((prev) => prev.map(inv => inv.id === id ? updatedItem : inv));
 dataCache.invalidateCache('inventory');
 } catch (error) {
 console.error('Error updating inventory item:', error);
 throw error;
 }
 };

 const updateOverheadItem = async (id: string, item: Omit<OverheadItem, 'id'>) => {
 if (!user) return;
 if (outbox.isPendingId(id)) return outbox.updateBody(outbox.entryIdOf(id), fillStore(item));
 try {
 console.log('💰 Updating Expense/Overhead item:', id, item.category);
 // Keep the item's own storeId (editing someone else's entry used to move it to the
 // editor's store); only fill it in when missing. Never for a production-house-tagged item.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const updatedItem = await api.updateOverhead(user.accessToken, id, itemWithStore);
 setOverheads((prev) => prev.map(ovh => ovh.id === id ? updatedItem : ovh));
 dataCache.invalidateCache('overheads');
 console.log('✅ Expense/Overhead item updated successfully');
 } catch (error) {
 console.error('❌ Error updating expense/overhead item:', error);
 throw error;
 }
 };

 const updateFixedCostItem = async (id: string, item: Omit<FixedCostItem, 'id'>) => {
 if (!user) return;
 if (outbox.isPendingId(id)) return outbox.updateBody(outbox.entryIdOf(id), fillStore(item));
 try {
 // Keep the item's own storeId (editing someone else's entry used to move it to the
 // editor's store); only fill it in when missing. Never for a production-house-tagged item.
 const itemWithStore = item.entityType === 'production_house'
 ? item
 : { ...item, storeId: item.storeId || user.storeId || undefined };
 const updatedItem = await api.updateFixedCost(user.accessToken, id, itemWithStore);
 setFixedCosts((prev) => prev.map(fc => fc.id === id ? updatedItem : fc));
 dataCache.invalidateCache('fixedCosts');
 } catch (error) {
 console.error('Error updating fixed cost item:', error);
 throw error;
 }
 };

 const deleteInventoryItem = async (id: string) => {
 if (!user) return;
 if (outbox.isPendingId(id)) return outbox.removeEntry(outbox.entryIdOf(id));
 try {
 await api.deleteInventory(user.accessToken, id);
 setInventory((prev) => prev.filter(inv => inv.id !== id));
 dataCache.invalidateCache('inventory');
 console.log('✅ Inventory item deleted successfully');
 } catch (error: any) {
 // If item not found, it was already deleted - update UI anyway
 if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
 console.log('⚠️ Item was already deleted, updating UI');
 setInventory((prev) => prev.filter(inv => inv.id !== id));
 dataCache.invalidateCache('inventory');
 } else {
 console.error('Error deleting inventory item:', error);
 throw error;
 }
 }
 };

 const deleteOverheadItem = async (id: string) => {
 if (!user) return;
 if (outbox.isPendingId(id)) return outbox.removeEntry(outbox.entryIdOf(id));
 try {
 console.log('🗑️ Deleting Expense/Overhead item:', id);
 await api.deleteOverhead(user.accessToken, id);
 setOverheads((prev) => prev.filter(ovh => ovh.id !== id));
 dataCache.invalidateCache('overheads');
 console.log('✅ Expense/Overhead item deleted successfully');
 } catch (error: any) {
 // If item not found, it was already deleted - update UI anyway
 if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
 console.log('⚠️ Expense/Overhead item was already deleted, updating UI');
 setOverheads((prev) => prev.filter(ovh => ovh.id !== id));
 dataCache.invalidateCache('overheads');
 } else {
 console.error('❌ Error deleting expense/overhead item:', error);
 throw error;
 }
 }
 };

 const deleteFixedCostItem = async (id: string) => {
 if (!user) return;
 if (outbox.isPendingId(id)) return outbox.removeEntry(outbox.entryIdOf(id));
 try {
 await api.deleteFixedCost(user.accessToken, id);
 setFixedCosts((prev) => prev.filter(fc => fc.id !== id));
 dataCache.invalidateCache('fixedCosts');
 console.log('✅ Fixed cost item deleted successfully');
 } catch (error: any) {
 // If item not found, it was already deleted - update UI anyway
 if (error?.message?.includes('not found') || error?.message?.includes('already deleted')) {
 console.log('⚠️ Item was already deleted, updating UI');
 setFixedCosts((prev) => prev.filter(fc => fc.id !== id));
 dataCache.invalidateCache('fixedCosts');
 } else {
 console.error('Error deleting fixed cost item:', error);
 throw error;
 }
 }
 };

 // The day close goes through the outbox too. It is safe to send again (the server saves onto the
 // day's row either way), so a newer save for the same store and date replaces one still waiting,
 // and a save for a day that only exists on this phone so far (provisional row) is sent as new.
 const saveDayClose = (id: string | null, item: Omit<SalesData, 'id'>) => {
 // Auto-add storeId if user has one
 const itemWithStore = {
 ...item,
 storeId: user?.storeId || item.storeId
 };
 const existsOnServer = !!id && !outbox.isPendingId(id);
 return saveViaOutbox({
 kind: 'sales',
 method: existsOnServer ? 'PUT' : 'POST',
 path: existsOnServer ? `/sales/${id}` : '/sales',
 body: itemWithStore,
 label: `Day close ${item.date}`,
 coalesceKey: `sales:${itemWithStore.storeId || ''}:${item.date}`,
 });
 };

 const addSalesData = async (item: Omit<SalesData, 'id'>) => {
 if (!user) return;
 return saveDayClose(null, item);
 };

 const updateSalesData = async (id: string, item: Omit<SalesData, 'id'>) => {
 if (!user) return;
 return saveDayClose(id, item);
 };

 const approveSalesData = async (id: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.approveSalesData(user.accessToken, id);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error approving sales data:', error);
 throw error;
 }
 };

 const requestSalesApproval = async (id: string, requestedCashInHand: number, requestedOffset: number) => {
 if (!user) return;
 try {
 const updatedItem = await api.requestSalesApproval(user.accessToken, id, requestedCashInHand, requestedOffset);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error requesting sales approval:', error);
 throw error;
 }
 };

 const approveDiscrepancy = async (id: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.approveDiscrepancy(user.accessToken, id);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error approving discrepancy:', error);
 throw error;
 }
 };

 const rejectDiscrepancy = async (id: string, reason: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.rejectDiscrepancy(user.accessToken, id, reason);
 setSalesData((prev) => prev.map(sd => sd.id === id ? updatedItem : sd));
 dataCache.invalidateCache('salesData');
 } catch (error) {
 console.error('Error rejecting discrepancy:', error);
 throw error;
 }
 };

 const addProductionData = async (item: Omit<ProductionData, 'id'>) => {
 if (!user) return;
 try {
 const itemWithStore = {
 ...item,
 storeId: user.storeId || item.storeId
 };
 const newItem = await api.addProductionData(itemWithStore);
 setProductionData((prev) => [...prev, newItem]);
 dataCache.invalidateCache('productionData');
 } catch (error) {
 console.error('Error adding production data:', error);
 throw error;
 }
 };

 const updateProductionData = async (id: string, item: Omit<ProductionData, 'id'>) => {
 if (!user) return;
 try {
 const itemWithStore = {
 ...item,
 storeId: user.storeId || item.storeId
 };
 const updatedItem = await api.updateProductionData(id, itemWithStore);
 setProductionData((prev) => prev.map(pd => pd.id === id ? updatedItem : pd));
 dataCache.invalidateCache('productionData');
 } catch (error) {
 console.error('Error updating production data:', error);
 throw error;
 }
 };

 const approveProductionData = async (id: string) => {
 if (!user) return;
 try {
 const updatedItem = await api.approveProductionData(id);
 setProductionData((prev) => prev.map(pd => pd.id === id ? updatedItem : pd));
 dataCache.invalidateCache('productionData');
 } catch (error) {
 console.error('Error approving production data:', error);
 throw error;
 }
 };

 // Production House functions
 const addProductionHouse = async (house: Omit<api.ProductionHouse, 'id' | 'createdAt' | 'updatedAt'>) => {
 if (!user) return;
 try {
 const newHouse = await api.createProductionHouse(user.accessToken, house);
 setProductionHouses([...productionHouses, newHouse]);
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error creating production house:', error);
 throw error;
 }
 };

 const updateProductionHouse = async (id: string, updates: Partial<Omit<api.ProductionHouse, 'id' | 'createdAt'>>) => {
 if (!user) return;
 try {
 const updated = await api.updateProductionHouse(user.accessToken, id, updates);
 setProductionHouses(productionHouses.map(h => h.id === id ? updated : h));
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error updating production house:', error);
 throw error;
 }
 };

 const updateProductionHouseInventory = async (id: string, inventory: api.ProductionHouse['inventory']) => {
 if (!user) return;
 try {
 const updated = await api.updateProductionHouseInventory(user.accessToken, id, inventory);
 setProductionHouses(productionHouses.map(h => h.id === id ? updated : h));
 } catch (error) {
 console.error('Error updating production house inventory:', error);
 throw error;
 }
 };

 const deleteProductionHouse = async (id: string) => {
 if (!user) return;
 try {
 await api.deleteProductionHouse(user.accessToken, id);
 setProductionHouses(productionHouses.filter(h => h.id !== id));
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error deleting production house:', error);
 throw error;
 }
 };

 // Stock Request functions
 const createStockRequest = async (request: Omit<api.StockRequest, 'id' | 'fulfilledQuantities' | 'status' | 'fulfilledBy' | 'fulfilledByName' | 'fulfillmentDate' | 'notes'>) => {
 if (!user) return;
 try {
 console.log('📦 Creating stock request:', request);
 const newRequest = await api.createStockRequest(user.accessToken, request);
 console.log('✅ Stock request created successfully:', newRequest);
 setStockRequests((prev) => [...prev, newRequest]);
 console.log('📦 Updated stock requests count:', stockRequests.length + 1);
 dataCache.invalidateCache('stockRequests');
 } catch (error) {
 console.error('❌ Error creating stock request:', error);
 throw error;
 }
 };

 const fulfillStockRequest = async (id: string, fulfilledQuantities: api.StockRequest['fulfilledQuantities'], fulfilledBy: string, fulfilledByName: string, notes?: string) => {
 if (!user) return;
 try {
 const updated = await api.fulfillStockRequest(user.accessToken, id, fulfilledQuantities, fulfilledBy, fulfilledByName, notes);
 setStockRequests((prev) => prev.map(r => r.id === id ? updated : r));
 // Reload production houses to get updated inventory
 const houses = await api.getProductionHouses();
 setProductionHouses(houses);
 dataCache.invalidateCache('stockRequests');
 dataCache.invalidateCache('productionHouses');
 } catch (error) {
 console.error('Error fulfilling stock request:', error);
 throw error;
 }
 };

 const cancelStockRequest = async (id: string) => {
 if (!user) return;
 try {
 const updated = await api.cancelStockRequest(user.accessToken, id);
 setStockRequests((prev) => prev.map(r => r.id === id ? updated : r));
 dataCache.invalidateCache('stockRequests');
 } catch (error) {
 console.error('Error cancelling stock request:', error);
 throw error;
 }
 };

 // Entries waiting in the outbox show in the lists at once as provisional rows (id
 // 'pending:<entry id>'), so figures such as the day's cash in hand include them and nobody enters
 // them twice. Refused entries are left out (listed under "waiting to send" with the reason).
 // Edits and deletes of these rows change the waiting entry (see fillStore above).
 const outboxEntries = useOutbox();
 const pendingRows = useMemo(() => {
  const rows = { inventory: [] as InventoryItem[], overheads: [] as OverheadItem[], fixedCosts: [] as FixedCostItem[], sales: [] as outbox.OutboxEntry[] };
  for (const entry of outboxEntries) {
   if (entry.state === 'failed') continue;
   const row = { ...entry.body, id: outbox.PENDING_PREFIX + entry.id, createdBy: user?.employeeId || user?.email, createdByName: user?.name } as any;
   if (entry.kind === 'inventory') rows.inventory.push(row);
   else if (entry.kind === 'overhead') rows.overheads.push(row);
   else if (entry.kind === 'fixed-cost') rows.fixedCosts.push(row);
   else rows.sales.push(entry);
  }
  return rows;
 }, [outboxEntries, user?.employeeId, user?.email, user?.name]);
 const inventoryShown = useMemo(() => pendingRows.inventory.length ? [...inventory, ...pendingRows.inventory] : inventory, [inventory, pendingRows.inventory]);
 const overheadsShown = useMemo(() => pendingRows.overheads.length ? [...overheads, ...pendingRows.overheads] : overheads, [overheads, pendingRows.overheads]);
 const fixedCostsShown = useMemo(() => pendingRows.fixedCosts.length ? [...fixedCosts, ...pendingRows.fixedCosts] : fixedCosts, [fixedCosts, pendingRows.fixedCosts]);
 // A waiting day close is laid over the day's row (by id for an edit, by store and date for a new
 // save - the server saves onto that row too), or added when the day has no row yet.
 const salesShown = useMemo(() => {
  if (!pendingRows.sales.length) return salesData;
  const next = [...salesData];
  for (const entry of pendingRows.sales) {
   const body = entry.body as Partial<SalesData>;
   const targetId = entry.method === 'PUT' ? entry.path.split('/').pop() : null;
   const index = next.findIndex((row) => targetId ? row.id === targetId : (row.storeId === body.storeId && row.date === body.date));
   if (index >= 0) next[index] = { ...next[index], ...body, id: next[index].id };
   else next.push({ ...body, id: outbox.PENDING_PREFIX + entry.id } as SalesData);
  }
  return next;
 }, [salesData, pendingRows.sales]);

 // The actions close over the latest state, so they are new functions on every render; screens get
 // stable wrappers instead, and the context only changes when the data does - which is what lets
 // React.memo on Analytics skip the re-renders (every App render used to re-render it).
 const actions = {
  loadInventoryItems, addInventoryItem, addOverheadItem, addFixedCostItem, updateInventoryItem, updateOverheadItem,
  updateFixedCostItem, deleteInventoryItem, deleteOverheadItem, deleteFixedCostItem, addSalesData, updateSalesData,
  approveSalesData, requestSalesApproval, approveDiscrepancy, rejectDiscrepancy, addProductionData, updateProductionData,
  approveProductionData, addProductionHouse, updateProductionHouse, updateProductionHouseInventory, deleteProductionHouse,
  createStockRequest, fulfillStockRequest, cancelStockRequest, refreshData: handleRefreshData,
 };
 const actionsRef = useRef(actions);
 actionsRef.current = actions;
 const stableActions = useMemo(() => {
  const stable = {} as typeof actions;
  for (const name of Object.keys(actionsRef.current) as (keyof typeof actions)[]) {
   (stable as any)[name] = (...args: any[]) => (actionsRef.current[name] as (...a: any[]) => any)(...args);
  }
  return stable;
 }, []);

 const contextValue: InventoryContextType = useMemo(() => ({
 inventory: inventoryShown,
 overheads: overheadsShown,
 fixedCosts: fixedCostsShown,
 salesData: salesShown,
 categorySalesData, // NEW: Detailed category sales data
 onlineCashRecalibrations,
 onlineSalesData,
 onlinePayoutData,
 aggregatorSettlements,
 productionData,
 productionHouses,
 stockRequests,
 productionRequests,
 stores,
 managedStoreIds,
 managedProductionHouseIds,
 inventoryItems,
 ...stableActions,
 setProductionHouses,
 isManager: user?.role === 'manager',
 user,
 dataRefreshedAt
 }), [inventoryShown, overheadsShown, fixedCostsShown, salesShown, categorySalesData, onlineCashRecalibrations, onlineSalesData, onlinePayoutData, aggregatorSettlements, productionData, productionHouses, stockRequests, productionRequests, stores, managedStoreIds, managedProductionHouseIds, inventoryItems, stableActions, user, dataRefreshedAt]);

 // What each login can open and where it sits (components/shell/navConfig.ts - the permission
 // predicates that used to be spread through this file's four menus and two render chains).
 // MUST stay above the conditional returns below (hooks run on every render).
 const today = getTodayIST();
 const nav = useMemo(
  () => (user ? buildNav(user, { today, storeCount: stores.length }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [user?.role, user?.designation, user?.storeId, user?.employeeId, today, stores.length],
 );

 // Counts on the tabs, from data already loaded here: day closes waiting for the owner or
 // operations manager, production days waiting for approval, store requests the production
 // house hasn't accepted yet.
 const badges = useMemo<Partial<Record<BadgeKey, number>>>(() => {
  if (!nav) return {};
  const p = nav.perms;
  const approvers = p.isClusterHead || p.isOperationsManager;
  return {
   salesApprovals: approvers ? salesData.filter((s) => s.approvalRequested && s.approvalStatus !== 'approved' && !s.rejectedBy).length : 0,
   productionApprovals: approvers ? productionData.filter((d) => d.approvalStatus === 'pending').length : 0,
   requestsToAccept: p.isProductionIncharge ? productionRequests.filter((r) => r.status === 'pending').length : 0,
  };
 }, [nav, salesData, productionData, productionRequests]);

 // Password rotation: status, the blocking change-password screen and the expiry banner
 // (components/PasswordSecurity.tsx). A hook, so it sits above the conditional returns too.
 const passwordPolicy = usePasswordPolicy(user);

 // Stable across renders, so the shell's context (and the screens under it) only changes with the
 // data. loadStores only calls the api and setStores.
 const loadStoresRef = useRef(loadStores);
 loadStoresRef.current = loadStores;
 const refreshStores = useCallback(() => loadStoresRef.current(), []);

 // Checking the saved session: the same plain screen as index.html's start-up splash (the
 // session is read from the phone, so this lasts a moment).
 if (isCheckingAuth) {
  return (
   <div className="flex min-h-dvh flex-col items-center justify-center bg-bg" role="progressbar" aria-label="Loading Bunny Momos">
    <img src="/bunny-logo.png" alt="" className="size-[88px] object-contain" />
   </div>
  );
 }

 // Show auth page if not logged in
 if (!user || !nav) {
  return (
   <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
   <AuthPage
    onLogin={handleLogin}
    onSignup={handleSignup}
    error={authError}
   />
   </Suspense>
  );
 }

 // Password expired or reset by the owner: nothing else works until a new one is set (the server
 // refuses every other route with PASSWORD_EXPIRED), so this screen replaces the whole app.
 if (passwordPolicy.blocking) {
  return (
   <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
    <ChangePasswordDialog policy={passwordPolicy} user={user} onLogout={handleLogout} />
   </Suspense>
  );
 }

 // The status line under the top bar: "Updated 10 min ago · Refreshing…", offline, or what
 // couldn't be refreshed (with Retry). Crew and riders load no business lists, so for them it only
 // speaks up when something is wrong.
 const syncStatus = (
 <SyncStatus
 lastUpdatedAt={lastUpdatedAt}
 refreshing={isLoadingData}
 failed={failedParts.map((f) => DATASETS[f.key].label)}
 offline={failedParts.length > 0 && failedParts.every((f) => f.offline)}
 hasData={hasSavedData || lastUpdatedAt !== null}
 onRetry={() => refreshData()}
 quiet={!needsBusinessData(user)}
 />
 );

 // Ask Bunny reads the business of the store in view: the owner's chosen store, else the store
 // with a production house, else the first.
 const askBunnyStoreId = selectedStoreId || (stores || []).find((st) => st.productionHouseId)?.id || stores[0]?.id || null;

 return (
  <>
   {/* The change-password sheet (from the Account sheet or the expiry banner); loaded when opened. */}
   {passwordPolicy.dialogOpen && (
    <Suspense fallback={null}>
     <ChangePasswordDialog policy={passwordPolicy} user={user} onLogout={handleLogout} />
    </Suspense>
   )}
   <AppShell
    nav={nav}
    user={user}
    context={contextValue}
    stores={stores}
    employees={employees}
    selectedStoreId={nav.chrome.storeSwitcher ? selectedStoreId : null}
    onStoreChange={setSelectedStoreId}
    refreshStores={refreshStores}
    banners={
     <>
      <UpdateAvailableBanner />
      <PasswordExpiryBanner policy={passwordPolicy} />
      {syncStatus}
     </>
    }
    badges={badges}
    notificationsSource={apiNotificationsSource}
    askBunnyStoreId={askBunnyStoreId}
    passwordDaysLeft={passwordPolicy.status?.daysLeft ?? null}
    onChangePassword={passwordPolicy.openDialog}
    onLogout={handleLogout}
    onRefresh={needsBusinessData(user) ? handleRefreshData : undefined}
    refreshing={isLoadingData}
    onEnableNativePush={() => nativePushNotifications.initializeNativePushNotifications(user.employeeId || user.email, applyNavigationTarget)}
    onRegisterNavigator={registerNavigator}
    renderAudit={nav.kind === 'auditor' ? (view) => (
     <AuditDashboard
      user={user}
      inventory={inventory}
      overheads={overheads}
      fixedCosts={fixedCosts}
      salesData={salesData}
      categorySalesData={categorySalesData}
      productionData={productionData}
      productionHouses={productionHouses}
      stockRequests={stockRequests}
      productionRequests={productionRequests}
      employees={employees}
      stores={stores}
      inventoryItems={inventoryItems}
      onLogout={handleLogout}
      onChangePassword={passwordPolicy.openDialog}
      onDataUpdate={loadData}
      view={view}
      hideNav
     />
    ) : undefined}
   />
  </>
 );
}
