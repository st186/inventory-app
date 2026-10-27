import { projectId, publicAnonKey } from './supabase/info';
import { getSupabaseClient } from './supabase/client';
import { InventoryItem, OverheadItem, FixedCostItem, SalesData, ProductionData } from '../App';
import type { DispatchInfo, DeliveryReceipt } from './batches';
import type { StockOutEntry } from './stockOuts';
import type { AccuracySummary, BacktestDay, CalendarEvent, DayRecord, EffectLearning, ForecastDay, ForecastSettings } from './forecast';
import { currentAccessToken } from './accessToken';
import { invalidateAllCaches, setCacheUser } from './dataCache';

export const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d`;

// Helper to create Supabase client for browser
function createBrowserSupabase() {
  return getSupabaseClient();
}

// Helper to get current session with automatic token refresh
export async function getSession() {
  const supabase = createBrowserSupabase();
  
  // First check if there's an existing session
  const { data: { session: existingSession } } = await supabase.auth.getSession();
  
  if (!existingSession) {
    // No session at all
    return null;
  }
  
  // Try to refresh the session to get a fresh token
  const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
  
  if (refreshError || !refreshedSession) {
    console.warn('Token refresh failed, using existing session:', refreshError?.message || 'No session returned');
    // Fall back to existing session
    return existingSession;
  }
  
  return refreshedSession;
}

// Global flag to prevent multiple logout redirects
let isHandlingUnauthorized = false;

// Fired on window when the server answers 403 PASSWORD_EXPIRED (password past 90 days, or the
// owner forced a reset - see passwords.ts on the server). App.tsx listens and shows the blocking
// change-password screen; the event detail is the error body ({ error, code, reason }).
export const PASSWORD_EXPIRED_EVENT = 'bunny:password-expired';

// Supabase refresh tokens are single-use/rotating: if several requests 401 at once
// (e.g. loadData's ~14 parallel fetches after the token expired while the app was
// backgrounded) and each independently calls refreshSession(), only the first actually
// succeeds - the rest get an "already used" error and used to force-logout the user
// even though the session was perfectly fine. Sharing one in-flight refresh across all
// concurrent callers fixes that false-logout race.
let inFlightRefresh: ReturnType<typeof _doRefresh> | null = null;

async function _doRefresh() {
  const supabase = createBrowserSupabase();
  return supabase.auth.refreshSession();
}

async function refreshAccessTokenShared() {
  if (!inFlightRefresh) {
    inFlightRefresh = _doRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

async function fetchWithAuth(url: string, accessToken: string, options?: RequestInit, _retryCount = 0, _refreshed = false): Promise<any> {
  const MAX_RETRIES = 2;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = 'Request failed';
      let isWarning = false;
      let errorBody: any = null;
      try {
        const error = await response.json();
        errorBody = error;
        errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
        // Check if this is a warning (non-critical error)
        isWarning = !!error.warning;
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      // Retry on 5xx server errors (cold start, temporary unavailability)
      if (response.status >= 500 && _retryCount < MAX_RETRIES) {
        console.warn(`Server error [${url}] (attempt ${_retryCount + 1}/${MAX_RETRIES + 1}):`, errorMessage, '- retrying...');
        await new Promise(r => setTimeout(r, 1000 * (_retryCount + 1)));
        return fetchWithAuth(url, accessToken, options, _retryCount + 1, _refreshed);
      }

      // A 401 here often just means the access token expired while the app was
      // backgrounded (mobile) or idle in a tab - not that the session is truly gone.
      // Try refreshing it once before concluding the user needs to log back in;
      // this was force-logging people out on ordinary token expiry.
      if (response.status === 401 && !_refreshed) {
        console.warn(`[${url}] Got 401, attempting a token refresh before giving up...`);
        const { data: { session: refreshedSession }, error: refreshError } = await refreshAccessTokenShared();
        if (!refreshError && refreshedSession?.access_token) {
          console.log('Token refresh succeeded, retrying request');
          return fetchWithAuth(url, refreshedSession.access_token, options, _retryCount, true);
        }
        console.warn('Token refresh failed:', refreshError?.message || 'no session returned');
      }

      console.error(`API Error [${url}]:`, errorMessage);

      if (response.status === 403 && errorBody?.code === 'PASSWORD_EXPIRED' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PASSWORD_EXPIRED_EVENT, { detail: errorBody }));
      }

      // If unauthorized and a refresh was already tried (or isn't possible), force logout
      // (but only once to prevent reload loops)
      if (response.status === 401 && !isHandlingUnauthorized) {
        isHandlingUnauthorized = true;
        console.error('Session expired or invalid. Please log in again.');

        // Clear the session, and the signed-out person's cached data so it isn't shown to
        // whoever signs in next on this device
        const supabase = createBrowserSupabase();
        await supabase.auth.signOut();
        invalidateAllCaches();
        setCacheUser(null);

        // Use a flag to ensure we only reload once
        if (!sessionStorage.getItem('logout_redirect_in_progress')) {
          sessionStorage.setItem('logout_redirect_in_progress', 'true');

          // Small delay to allow other pending requests to fail gracefully
          setTimeout(() => {
            sessionStorage.removeItem('logout_redirect_in_progress');
            window.location.reload();
          }, 100);
        }
      }

      // status and the error body ride along (e.g. the AI allowance's limit / retryAfterMinutes).
      throw Object.assign(new Error(errorMessage), { status: response.status, details: errorBody });
    }

    const jsonData = await response.json();
    
    // Check for database unavailability warnings in successful responses
    if (jsonData.warning) {
      console.warn(`API Warning [${url}]:`, jsonData.warning);
      // You could emit a toast notification here if needed
    }
    
    return jsonData;
  } catch (error) {
    // Catch network errors like "Failed to fetch" and retry
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      if (_retryCount < MAX_RETRIES) {
        console.warn(`Network error [${url}] (attempt ${_retryCount + 1}/${MAX_RETRIES + 1}) - retrying in ${(_retryCount + 1)}s...`);
        await new Promise(r => setTimeout(r, 1000 * (_retryCount + 1)));
        return fetchWithAuth(url, accessToken, options, _retryCount + 1);
      }
      console.error(`Network Error [${url}]: Failed to fetch after ${MAX_RETRIES + 1} attempts`);
      console.error('Request details:', { url, method: options?.method || 'GET' });
      throw new Error('Network error: Unable to connect to server. Please check your internet connection.');
    }
    // Re-throw other errors
    throw error;
  }
}

export async function fetchInventory(accessToken: string): Promise<InventoryItem[]> {
  const data = await fetchWithAuth(`${API_BASE}/inventory`, accessToken);
  return data.inventory || [];
}

export async function addInventory(accessToken: string, item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
  console.log('🌐 [API] addInventory called with:', { date: item.date, itemName: item.itemName, totalCost: item.totalCost });
  console.log('🌐 [API] Making POST request to:', `${API_BASE}/inventory`);
  
  try {
    const data = await fetchWithAuth(`${API_BASE}/inventory`, accessToken, {
      method: 'POST',
      body: JSON.stringify(item),
    });
    console.log('🌐 [API] Response received:', data);
    
    if (!data || !data.item) {
      console.error('❌ [API] Invalid response from server:', data);
      throw new Error('Invalid response from server');
    }
    
    console.log('✅ [API] Successfully added inventory item:', { id: data.item.id, itemName: data.item.itemName });
    return data.item;
  } catch (error) {
    console.error('❌ [API] Error in addInventory:', error);
    throw error;
  }
}

export async function updateInventory(accessToken: string, id: string, item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
  const data = await fetchWithAuth(`${API_BASE}/inventory/${id}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function deleteInventory(accessToken: string, id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/inventory/${id}`, accessToken, {
    method: 'DELETE',
  });
}

export async function fetchOverheads(accessToken: string): Promise<OverheadItem[]> {
  const data = await fetchWithAuth(`${API_BASE}/overheads`, accessToken);
  return data.overheads || [];
}

export async function addOverhead(accessToken: string, item: Omit<OverheadItem, 'id'>): Promise<OverheadItem> {
  const data = await fetchWithAuth(`${API_BASE}/overheads`, accessToken, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateOverhead(accessToken: string, id: string, item: Omit<OverheadItem, 'id'>): Promise<OverheadItem> {
  const data = await fetchWithAuth(`${API_BASE}/overheads/${id}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function deleteOverhead(accessToken: string, id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/overheads/${id}`, accessToken, {
    method: 'DELETE',
  });
}

// Get overheads (wrapper for fetchOverheads)
export async function getOverheads(): Promise<OverheadItem[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return fetchOverheads(session.access_token);
}

export async function fetchFixedCosts(accessToken: string): Promise<FixedCostItem[]> {
  const data = await fetchWithAuth(`${API_BASE}/fixed-costs`, accessToken);
  return data.fixedCosts || [];
}

export async function addFixedCost(accessToken: string, item: Omit<FixedCostItem, 'id'>): Promise<FixedCostItem> {
  const data = await fetchWithAuth(`${API_BASE}/fixed-costs`, accessToken, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateFixedCost(accessToken: string, id: string, item: Omit<FixedCostItem, 'id'>): Promise<FixedCostItem> {
  const data = await fetchWithAuth(`${API_BASE}/fixed-costs/${id}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function deleteFixedCost(accessToken: string, id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/fixed-costs/${id}`, accessToken, {
    method: 'DELETE',
  });
}

// Cleanup duplicate entries in the database
export async function cleanupDuplicates(accessToken: string): Promise<{ removed: number; details: any }> {
  const data = await fetchWithAuth(`${API_BASE}/cleanup-duplicates`, accessToken, {
    method: 'POST',
  });
  return data;
}

// Migrate sales discrepancy values (cluster head only)
export async function migrateSalesDiscrepancy(accessToken: string): Promise<{ updated: number; total: number; message: string }> {
  const data = await fetchWithAuth(`${API_BASE}/sales/migrate-discrepancy`, accessToken, {
    method: 'POST',
  });
  return data;
}

// Migrate stock request IDs to include timestamps (cluster head only)
export async function migrateStockRequestTimestamps(accessToken: string): Promise<{ updated: number; skipped: number; total: number; message: string }> {
  const data = await fetchWithAuth(`${API_BASE}/migrate-stock-request-timestamps`, accessToken, {
    method: 'POST',
  });
  return data;
}


// Fix orphaned data with null storeId
export async function fixOrphanedStoreData(
  accessToken: string, 
  targetStoreId: string, 
  dataType?: 'sales' | 'inventory' | 'overhead',
  recordIds?: string[]
): Promise<{ fixedCount: number; fixed: any[] }> {
  const data = await fetchWithAuth(`${API_BASE}/fix-orphaned-store-data`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ targetStoreId, dataType, recordIds }),
  });
  return data;
}

export async function fetchSalesData(accessToken: string): Promise<SalesData[]> {
  const data = await fetchWithAuth(`${API_BASE}/sales`, accessToken);
  return data.sales || [];
}

export async function addSalesData(accessToken: string, item: Omit<SalesData, 'id'>): Promise<SalesData> {
  const data = await fetchWithAuth(`${API_BASE}/sales`, accessToken, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateSalesData(accessToken: string, id: string, item: Omit<SalesData, 'id'>): Promise<SalesData> {
  const data = await fetchWithAuth(`${API_BASE}/sales/${id}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function approveSalesData(accessToken: string, id: string): Promise<SalesData> {
  const data = await fetchWithAuth(`${API_BASE}/sales/${id}/approve`, accessToken, {
    method: 'POST',
  });
  return data.item;
}

export async function requestSalesApproval(accessToken: string, id: string, requestedCashInHand: number, requestedOffset: number): Promise<SalesData> {
  const data = await fetchWithAuth(`${API_BASE}/sales/${id}/request-approval`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requestedCashInHand, requestedOffset }),
  });
  return data.item;
}

export async function approveDiscrepancy(accessToken: string, id: string): Promise<SalesData> {
  const data = await fetchWithAuth(`${API_BASE}/sales/${id}/approve-discrepancy`, accessToken, {
    method: 'POST',
  });
  return data.item;
}

export async function rejectDiscrepancy(accessToken: string, id: string, reason: string): Promise<SalesData> {
  const data = await fetchWithAuth(`${API_BASE}/sales/${id}/reject-discrepancy`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return data.item;
}

// ============================================
// CASH TOP-UP REQUEST API
// ============================================

export type CashTopupReason = 'store_inventory' | 'production_inventory' | 'other';

export interface CashTopupRequest {
  id: string;
  storeId: string;
  // Set only when reason is 'production_inventory' - the approved amount credits this
  // production house's own cash ledger (see ProductionCashEntry below) instead of the
  // store's usedOnlineMoney. Undefined on requests made before this field existed, and on
  // ordinary store_inventory/other requests, which still credit the store as before.
  productionHouseId?: string;
  date: string;
  requestedAmount: number;
  reason: CashTopupReason;
  requestedByEntityType: 'store' | 'production_house';
  requestedByEntityName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByName: string;
  requestedByUserId: string;
  requestDate: string;
  approvedBy: string | null;
  approvedAt: string | null;
  // true = approvedAt is real UTC. Older approvals stored IST wall-clock time with a 'Z'
  // suffix instead (see topupApprovedAtMs in utils/paytmRules.ts).
  approvedAtIsUtc?: boolean;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

export async function fetchCashTopupRequests(accessToken: string): Promise<CashTopupRequest[]> {
  const data = await fetchWithAuth(`${API_BASE}/cash-topup-requests`, accessToken);
  return data.requests || [];
}

// targetStoreId is required only for production incharges (who have no cash-in-hand ledger
// of their own) - store incharges and operations managers credit their own store automatically.
// A cluster head names the store (targetStoreId) or production house (targetProductionHouseId);
// their request comes back already approved.
export async function requestCashTopup(accessToken: string, date: string, requestedAmount: number, reason: CashTopupReason, targetStoreId?: string, targetProductionHouseId?: string): Promise<CashTopupRequest> {
  const data = await fetchWithAuth(`${API_BASE}/cash-topup-requests`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ date, requestedAmount, reason, targetStoreId, targetProductionHouseId }),
  });
  return data.request;
}

export async function approveCashTopup(accessToken: string, id: string): Promise<CashTopupRequest> {
  const data = await fetchWithAuth(`${API_BASE}/cash-topup-requests/${id}/approve`, accessToken, {
    method: 'POST',
  });
  return data.request;
}

export async function rejectCashTopup(accessToken: string, id: string, reason: string): Promise<CashTopupRequest> {
  const data = await fetchWithAuth(`${API_BASE}/cash-topup-requests/${id}/reject`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return data.request;
}

// ============================================
// PRODUCTION CASH IN HAND
// ============================================
// Separate from the store's own sales:-based cash reconciliation above - previously a
// production house's spending was silently folded into the store's own "expected cash"
// figure, so the store incharge's physical count could show a discrepancy caused entirely
// by production's own activity. This is production's own ledger, reconciled by whoever
// actually holds and spends that cash (see PRODUCTION_CASH_GO_LIVE_DATE server-side -
// dates before it aren't tracked here, the old blended calculation still applies to them).

export interface ProductionCashEntry {
  id: string;
  productionHouseId: string;
  date: string;
  openingBalance: number;
  cashTopupCredited: number;
  productionExpenses: number;
  expectedClosingCashInHand: number;
  actualCashInHand: number | null;
  discrepancy: number | null;
  approvalRequired: boolean;
  approvalStatus: 'approved' | 'pending' | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalRequested: boolean;
  approvalRequestedAt: string | null;
  requestedCashInHand: number | null;
  requestedOffset: number | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  manualOpeningOverride?: number;
  createdBy: string;
  createdByName: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

// A "live" (never-saved) preview of what a date's entry would compute to, returned instead
// of `entry` when nothing has been saved for that date yet - lets the UI always show
// opening balance / expenses / topup / expected closing even before anyone submits a count.
export interface ProductionCashLive {
  productionHouseId: string;
  date: string;
  openingBalance: number;
  cashTopupCredited: number;
  productionExpenses: number;
  expectedClosingCashInHand: number;
}

export async function getProductionCashEntry(accessToken: string, productionHouseId: string, date: string): Promise<{ entry: ProductionCashEntry | null; live: ProductionCashLive | null }> {
  const data = await fetchWithAuth(`${API_BASE}/production-cash?productionHouseId=${encodeURIComponent(productionHouseId)}&date=${encodeURIComponent(date)}`, accessToken);
  return { entry: data.entry || null, live: data.live || null };
}

export async function getProductionCashRange(accessToken: string, productionHouseId: string, from: string, to: string): Promise<ProductionCashEntry[]> {
  const data = await fetchWithAuth(`${API_BASE}/production-cash?productionHouseId=${encodeURIComponent(productionHouseId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, accessToken);
  return data.entries || [];
}

export async function saveProductionCashEntry(accessToken: string, productionHouseId: string, date: string, actualCashInHand: number, manualOpeningOverride?: number): Promise<ProductionCashEntry> {
  const data = await fetchWithAuth(`${API_BASE}/production-cash`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ productionHouseId, date, actualCashInHand, ...(manualOpeningOverride !== undefined ? { manualOpeningOverride } : {}) }),
  });
  return data.entry;
}

export async function requestProductionCashApproval(accessToken: string, id: string, requestedCashInHand: number, requestedOffset: number): Promise<ProductionCashEntry> {
  const data = await fetchWithAuth(`${API_BASE}/production-cash/${id}/request-approval`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requestedCashInHand, requestedOffset }),
  });
  return data.entry;
}

export async function approveProductionCashDiscrepancy(accessToken: string, id: string): Promise<ProductionCashEntry> {
  const data = await fetchWithAuth(`${API_BASE}/production-cash/${id}/approve-discrepancy`, accessToken, {
    method: 'POST',
  });
  return data.entry;
}

export async function rejectProductionCashDiscrepancy(accessToken: string, id: string, reason: string): Promise<ProductionCashEntry> {
  const data = await fetchWithAuth(`${API_BASE}/production-cash/${id}/reject-discrepancy`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return data.entry;
}

// Stock Wastage - daily, store-side, in pieces per momo type (all 7 canonical MOMO_TYPES,
// including both kurkure varieties). Store Incharge-entered; tracked from this feature's
// launch (2026-08-30) forward only, no historical backfill.
export interface StockWastageEntry {
  id: string;
  storeId: string;
  date: string; // YYYY-MM-DD
  wastage: Record<string, number>; // momo type key -> pieces wasted, zero entries omitted
  reasons?: Record<string, Record<string, number>>; // type key -> SOP reason code -> pieces
  notes?: string;
  submittedBy: string;
  submittedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getStockWastageEntry(accessToken: string, storeId: string, date: string): Promise<StockWastageEntry | null> {
  const data = await fetchWithAuth(`${API_BASE}/stock-wastage?storeId=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`, accessToken);
  return data.entry || null;
}

export async function getStockWastageRange(accessToken: string, storeId: string, from: string, to: string): Promise<StockWastageEntry[]> {
  const data = await fetchWithAuth(`${API_BASE}/stock-wastage?storeId=${encodeURIComponent(storeId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, accessToken);
  return data.entries || [];
}

export async function saveStockWastageEntry(accessToken: string, storeId: string, date: string, wastage: Record<string, number>, notes?: string, reasons?: Record<string, Record<string, number>>): Promise<StockWastageEntry> {
  const data = await fetchWithAuth(`${API_BASE}/stock-wastage`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ storeId, date, wastage, ...(notes !== undefined ? { notes } : {}), ...(reasons ? { reasons } : {}) }),
  });
  return data.entry;
}

// Insights: festival calendar, demand forecast and the Claude-written parts (server
// insights.ts). The forecast numbers come from utils/forecast.ts, run on the server.
export interface InsightsOverview {
  today: string;
  storeId: string | null;
  history: DayRecord[];
  events: CalendarEvent[];
  forecast: ForecastDay[];
  yesterday: { date: string; actual: number | null; actualPieces: DayRecord['pieces']; expected: ForecastDay };
  learned: Record<string, EffectLearning>;
  accuracy?: ForecastAccuracy; // missing until the server is redeployed
}

// How the forecast has done: each past day forecast again from earlier data only (forecast.ts backtest).
export interface ForecastAccuracy {
  date: string;
  settings: ForecastSettings;
  tuned: boolean;
  tuningGain: number;
  last28: AccuracySummary;
  weeks: (AccuracySummary & { week: string })[];
  misses: BacktestDay[];
}

export async function getInsightsOverview(accessToken: string, storeId?: string | null): Promise<InsightsOverview> {
  return fetchWithAuth(`${API_BASE}/insights/overview${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`, accessToken);
}

export async function getStoreCalendar(accessToken: string, from: string, to: string): Promise<CalendarEvent[]> {
  const data = await fetchWithAuth(`${API_BASE}/store-calendar?from=${from}&to=${to}`, accessToken);
  return data.events || [];
}

export async function saveCalendarDay(accessToken: string, event: CalendarEvent): Promise<CalendarEvent> {
  const data = await fetchWithAuth(`${API_BASE}/store-calendar/${event.date}`, accessToken, { method: 'PUT', body: JSON.stringify(event) });
  return data.event;
}

export async function deleteCalendarDay(accessToken: string, date: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/store-calendar/${date}`, accessToken, { method: 'DELETE' });
}

export interface AiStatus { configured: boolean; model: string; spentThisMonthUsd: number; capUsd: number; canManage: boolean }

export async function getAiStatus(accessToken: string): Promise<AiStatus> {
  return fetchWithAuth(`${API_BASE}/ai/status`, accessToken);
}

export interface AiBrief { text: string; generatedAt: string; model: string; storeId: string | null; date: string; refreshes: number }

export async function getAiBrief(accessToken: string, storeId: string | null, refresh = false): Promise<{ brief: AiBrief | null; note?: string }> {
  return fetchWithAuth(`${API_BASE}/ai/brief`, accessToken, { method: 'POST', body: JSON.stringify({ storeId, refresh }) });
}

export interface GrowthIdea {
  id: string;
  storeId: string;
  title: string;
  why: string;
  action: string;
  expectedImpact: string;
  effort: 'low' | 'medium' | 'high';
  category: string;
  status: 'new' | 'trying' | 'done' | 'dropped';
  note?: string;
  createdAt: string;
}

export async function getGrowthIdeas(accessToken: string, storeId: string | null): Promise<GrowthIdea[]> {
  const data = await fetchWithAuth(`${API_BASE}/growth-ideas?storeId=${encodeURIComponent(storeId || 'all')}`, accessToken);
  return data.ideas || [];
}

export async function generateGrowthIdeas(accessToken: string, storeId: string | null): Promise<GrowthIdea[]> {
  const data = await fetchWithAuth(`${API_BASE}/ai/growth`, accessToken, { method: 'POST', body: JSON.stringify({ storeId }) });
  return data.ideas || [];
}

export async function updateGrowthIdea(accessToken: string, storeId: string, id: string, status: GrowthIdea['status'], note?: string): Promise<GrowthIdea> {
  const data = await fetchWithAuth(`${API_BASE}/growth-ideas/${encodeURIComponent(storeId)}/${encodeURIComponent(id)}`, accessToken, { method: 'PUT', body: JSON.stringify({ status, note }) });
  return data.idea;
}

// Days Claude drafted, waiting for the owner side to add or skip (drafted every Monday, or on tap).
export interface CalendarSuggestion { date: string; name: string; effect: CalendarEvent['effect']; reason: string; confidence: 'high' | 'medium'; drafted?: 'weekly' | 'manual' }
export interface CalendarDraftRun { at: string; drafted: 'weekly' | 'manual'; added: number }

export async function draftCalendar(accessToken: string, from: string, to: string): Promise<{ added: number; suggestions: CalendarSuggestion[] }> {
  const data = await fetchWithAuth(`${API_BASE}/ai/calendar-draft`, accessToken, { method: 'POST', body: JSON.stringify({ from, to }) });
  return { added: data.added || 0, suggestions: data.suggestions || [] };
}

export async function getCalendarSuggestions(accessToken: string): Promise<{ suggestions: CalendarSuggestion[]; lastRun: CalendarDraftRun | null }> {
  const data = await fetchWithAuth(`${API_BASE}/calendar-suggestions`, accessToken);
  return { suggestions: data.suggestions || [], lastRun: data.lastRun || null };
}

export async function acceptCalendarSuggestion(accessToken: string, date: string): Promise<CalendarEvent> {
  const data = await fetchWithAuth(`${API_BASE}/calendar-suggestions/${date}/accept`, accessToken, { method: 'POST' });
  return data.event;
}

export async function dismissCalendarSuggestion(accessToken: string, date: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/calendar-suggestions/${date}/dismiss`, accessToken, { method: 'POST' });
}

// Shortens the older part of a long Bunny chat into a summary (server /ai/summarize-chat).
export async function summarizeChat(accessToken: string, summary: string, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  const data = await fetchWithAuth(`${API_BASE}/ai/summarize-chat`, accessToken, { method: 'POST', body: JSON.stringify({ summary, messages }) });
  return data.summary || summary;
}

// "Complete your profile" (server profile.ts): the signed-in person's own Aadhaar photos, phone
// and personal email.
export interface MyProfileStatus { required: boolean; complete: boolean; missing: ('aadharFront' | 'aadharBack' | 'phone' | 'contactEmail')[]; phone?: string; contactEmail?: string }

export async function getMyProfile(accessToken: string): Promise<MyProfileStatus> {
  return fetchWithAuth(`${API_BASE}/me/profile`, accessToken);
}

export async function updateMyProfile(accessToken: string, updates: { phone?: string; contactEmail?: string; aadharFront?: string; aadharBack?: string }): Promise<MyProfileStatus> {
  return fetchWithAuth(`${API_BASE}/me/profile`, accessToken, { method: 'PUT', body: JSON.stringify(updates) });
}

// Voice entry: one spoken sentence read into form fields (server /ai/voice-fill, Haiku).
export interface VoiceSalesFields { paytm: number | null; cash: number | null; cashInHand: number | null; unclear: string }
export interface VoiceExpenseItem { name: string; quantity: number | null; unit: string | null; packs?: number | null; perPack?: number | null; amount: number | null; pricePerPack?: number | null }
export interface VoiceExpenseFields { items: VoiceExpenseItem[]; paidWith: 'cash' | 'online' | 'unknown'; unclear: string }

export async function voiceFill(accessToken: string, kind: 'sales', text: string): Promise<VoiceSalesFields>;
export async function voiceFill(accessToken: string, kind: 'expense', text: string): Promise<VoiceExpenseFields>;
export async function voiceFill(accessToken: string, kind: 'sales' | 'expense', text: string) {
  const data = await fetchWithAuth(`${API_BASE}/ai/voice-fill`, accessToken, { method: 'POST', body: JSON.stringify({ kind, text }) });
  return data.fields;
}

// Ask Bunny (the floating chat): answers in the person's language about the screen they're on.
export async function askBunny(
  accessToken: string,
  storeId: string | null,
  messages: { role: 'user' | 'assistant'; content: string }[],
  options: { language: 'en' | 'bn' | 'hi'; screen?: { page: string; tab?: string; text?: string }; summary?: string },
): Promise<{ answer: string; followUps: string[]; toolsUsed: string[] }> {
  const data = await fetchWithAuth(`${API_BASE}/ai/ask`, accessToken, { method: 'POST', body: JSON.stringify({ storeId, messages, ...options }) });
  return { answer: data.answer, followUps: data.followUps || [], toolsUsed: data.toolsUsed || [] };
}

export interface ScannedInvoiceLine { asWritten: string; englishName: string; quantity: number; unit: string; rate: number; amount: number; unsure: boolean }
export interface ScannedInvoice { readable: boolean; vendor: string; invoiceDate: string; invoiceNumber: string; language: string; items: ScannedInvoiceLine[]; billTotal: number; note: string }

export async function readInvoice(accessToken: string, dataUrl: string): Promise<ScannedInvoice> {
  const data = await fetchWithAuth(`${API_BASE}/ai/invoice-read`, accessToken, { method: 'POST', body: JSON.stringify({ dataUrl }) });
  return data.invoice;
}

// Out-of-stock log (store SOP ST-28) - see utils/stockOuts.ts.
export async function getStockOuts(accessToken: string, storeId: string, from: string, to: string): Promise<StockOutEntry[]> {
  const data = await fetchWithAuth(`${API_BASE}/stock-outs?storeId=${encodeURIComponent(storeId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, accessToken);
  return data.entries || [];
}

export async function createStockOut(
  accessToken: string,
  entry: Pick<StockOutEntry, 'storeId' | 'item' | 'category' | 'reason' | 'reasonNote' | 'startAt' | 'endAt' | 'offOnline' | 'backOnline'>
): Promise<StockOutEntry> {
  const data = await fetchWithAuth(`${API_BASE}/stock-outs`, accessToken, { method: 'POST', body: JSON.stringify(entry) });
  return data.entry;
}

export async function updateStockOut(
  accessToken: string,
  storeId: string,
  id: string,
  changes: Partial<Pick<StockOutEntry, 'item' | 'category' | 'reason' | 'reasonNote' | 'startAt' | 'endAt' | 'offOnline' | 'backOnline'>>
): Promise<StockOutEntry> {
  const data = await fetchWithAuth(`${API_BASE}/stock-outs/${encodeURIComponent(storeId)}/${encodeURIComponent(id)}`, accessToken, { method: 'PUT', body: JSON.stringify(changes) });
  return data.entry;
}

export async function deleteStockOut(accessToken: string, storeId: string, id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/stock-outs/${encodeURIComponent(storeId)}/${encodeURIComponent(id)}`, accessToken, { method: 'DELETE' });
}

// Production Ledger - the raw-stock counterpart to Production Cash above. Dough/stuffing/
// batter/coating used to be write-only numbers entered fresh every day with no shared pool
// and no leftover carried forward; this tracks each as its own running "pool" per
// production house, carried day to day the same way Production Cash's actualCashInHand is
// (see PRODUCTION_LEDGER_GO_LIVE_DATE server-side - dates before it aren't tracked here).
// Pool ids: 'dough'/'batter' (shared across every momo type in that group) and
// 'stuffing:{inventoryKey}'/'coating:{inventoryKey}' (one per momo type) - see
// src/constants/momoTypes.ts for the canonical list these are derived from.
export interface ProductionLedgerPoolState {
  opening: number;
  prepared: number;
  closingActual: number | null;
  wastage: number | null;
  // A human-confirmed wastage figure, distinct from the raw opening+prepared-closing gap -
  // wastage is never assumed here, only ever suggested. When set, `wastage` above equals
  // this value and sticks even through a later backdated correction; when null, `wastage`
  // falls back to the computed gap.
  wastageOverride?: number | null;
}

// Weekly Production Goal - a cluster head/operations manager sets a per-momo-type piece
// target for one Monday-start week; progress is computed live from real production:
// records' .final counts, not tracked separately here.
export interface ProductionWeeklyGoal {
  id: string;
  productionHouseId: string;
  weekStart: string; // YYYY-MM-DD, a Monday
  goals: Partial<Record<string, number>>; // momo type key (e.g. 'chickenMomos') -> piece target
  setBy: string;
  setByName?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getProductionWeeklyGoal(accessToken: string, productionHouseId: string, weekStart: string): Promise<ProductionWeeklyGoal | null> {
  const data = await fetchWithAuth(`${API_BASE}/production-weekly-goal?productionHouseId=${encodeURIComponent(productionHouseId)}&weekStart=${encodeURIComponent(weekStart)}`, accessToken);
  return data.goal || null;
}

export async function saveProductionWeeklyGoal(accessToken: string, productionHouseId: string, weekStart: string, goals: Partial<Record<string, number>>): Promise<ProductionWeeklyGoal> {
  const data = await fetchWithAuth(`${API_BASE}/production-weekly-goal`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ productionHouseId, weekStart, goals }),
  });
  return data.goal;
}

export interface ProductionLedgerEntry {
  id: string;
  productionHouseId: string;
  date: string;
  pools: Record<string, ProductionLedgerPoolState>;
  closed: boolean;
  closedBy?: string;
  closedByName?: string;
  closedByUserId?: string;
  closedAt?: string;
  manualOpeningOverride?: Record<string, number>;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// A "live" (never-saved) preview of what a date's ledger would show - returned instead of
// `entry` when the day hasn't been closed yet, so the entry screen always has an opening
// balance + prepared-so-far to render even before anyone submits a closing count.
export interface ProductionLedgerLive {
  productionHouseId: string;
  date: string;
  pools: Record<string, ProductionLedgerPoolState>;
}

export interface ProductionLedgerItem {
  id: string;
  productionHouseId: string;
  date: string;
  momoKey: string;
  globalPoolQty: number;
  perTypePoolQty: number;
  loggedBy: string;
  loggedByName: string;
  loggedByUserId?: string;
  loggedAt: string;
  updatedAt?: string;
}

export async function getProductionLedger(accessToken: string, productionHouseId: string, date: string): Promise<{ entry: ProductionLedgerEntry | null; live: ProductionLedgerLive | null; items: ProductionLedgerItem[]; hasAnyPriorRecord: boolean }> {
  const data = await fetchWithAuth(`${API_BASE}/production-ledger?productionHouseId=${encodeURIComponent(productionHouseId)}&date=${encodeURIComponent(date)}`, accessToken);
  return { entry: data.entry || null, live: data.live || null, items: data.items || [], hasAnyPriorRecord: !!data.hasAnyPriorRecord };
}

export async function getProductionLedgerRange(accessToken: string, productionHouseId: string, from: string, to: string): Promise<ProductionLedgerEntry[]> {
  const data = await fetchWithAuth(`${API_BASE}/production-ledger?productionHouseId=${encodeURIComponent(productionHouseId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, accessToken);
  return data.entries || [];
}

export async function addProductionLedgerItem(accessToken: string, productionHouseId: string, date: string, momoKey: string, globalPoolQty: number, perTypePoolQty: number): Promise<ProductionLedgerItem> {
  const data = await fetchWithAuth(`${API_BASE}/production-ledger-item`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ productionHouseId, date, momoKey, globalPoolQty, perTypePoolQty }),
  });
  return data.item;
}

export async function updateProductionLedgerItem(accessToken: string, id: string, globalPoolQty: number, perTypePoolQty: number): Promise<ProductionLedgerItem> {
  const data = await fetchWithAuth(`${API_BASE}/production-ledger-item/${id}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ globalPoolQty, perTypePoolQty }),
  });
  return data.item;
}

export async function deleteProductionLedgerItem(accessToken: string, id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/production-ledger-item/${id}`, accessToken, { method: 'DELETE' });
}

// Free-text wastage note - something wasted that isn't one of the tracked ledger pools
// (a sauce, a chutney, a raw ingredient). unit is whatever the caller picked ('kg'/'g' for
// something solid, 'L'/'ml' for something liquid) - not fed into the pool cascade.
export interface ProductionWastageNote {
  id: string;
  productionHouseId: string;
  date: string;
  description: string;
  quantity: number;
  unit: string;
  reason?: string; // SOP 1.7 waste reason code
  loggedBy: string;
  loggedByName: string;
  loggedAt: string;
}

export async function getProductionWastageNotes(accessToken: string, productionHouseId: string, date: string): Promise<ProductionWastageNote[]> {
  const data = await fetchWithAuth(`${API_BASE}/production-wastage-notes?productionHouseId=${encodeURIComponent(productionHouseId)}&date=${encodeURIComponent(date)}`, accessToken);
  return data.notes || [];
}

export async function addProductionWastageNote(accessToken: string, productionHouseId: string, date: string, description: string, quantity: number, unit: string, reason?: string): Promise<ProductionWastageNote> {
  const data = await fetchWithAuth(`${API_BASE}/production-wastage-notes`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ productionHouseId, date, description, quantity, unit, ...(reason ? { reason } : {}) }),
  });
  return data.note;
}

export async function deleteProductionWastageNote(accessToken: string, id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/production-wastage-notes/${id}`, accessToken, { method: 'DELETE' });
}

export async function closeProductionLedgerDay(accessToken: string, productionHouseId: string, date: string, closingActuals: Record<string, number>, manualOpeningOverride?: Record<string, number>, wastageOverrides?: Record<string, number>): Promise<ProductionLedgerEntry> {
  const data = await fetchWithAuth(`${API_BASE}/production-ledger/${encodeURIComponent(productionHouseId)}/${encodeURIComponent(date)}/close`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ closingActuals, ...(manualOpeningOverride ? { manualOpeningOverride } : {}), ...(wastageOverrides ? { wastageOverrides } : {}) }),
  });
  return data.entry;
}

// Manually triggers today's Ciferon POS sync early, instead of waiting for the 10:30 PM
// cron job. Operations-manager/cluster-head only (enforced server-side).
export async function triggerPosSync(accessToken: string): Promise<any> {
  return fetchWithAuth(`${API_BASE}/pos-sync/trigger`, accessToken, {
    method: 'POST',
  });
}

// Re-pulls a specific already-closed day's Ciferon SaleDetails and overwrites that day's
// cash/Paytm/online totals - for correcting a historical record written before a sync bug
// was fixed. Cluster-head only (enforced server-side).
export async function backfillPosSync(accessToken: string, date: string): Promise<any> {
  return fetchWithAuth(`${API_BASE}/pos-sync/backfill`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
}

// ============================================
// PRODUCTION DATA API
// ============================================

export async function fetchProductionData(): Promise<ProductionData[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production`, session.access_token);
  return data.production || [];
}

export async function addProductionData(item: Omit<ProductionData, 'id'>): Promise<ProductionData> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production`, session.access_token, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateProductionData(id: string, item: Omit<ProductionData, 'id'>): Promise<ProductionData> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production/${id}`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function approveProductionData(id: string): Promise<ProductionData> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production/${id}/approve`, session.access_token, {
    method: 'POST',
  });
  return data.item;
}

export async function migrateProductionNotifications(): Promise<{ message: string }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production/migrate-notifications`, session.access_token, {
    method: 'POST',
  });
  return data;
}

export async function cleanupDuplicateProduction(): Promise<{ 
  success: boolean; 
  message: string; 
  duplicatesFound: number;
  totalDeleted: number;
  details: any[];
}> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production/cleanup-duplicates`, session.access_token, {
    method: 'POST',
  });
  return data;
}

export async function clearAllData(): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/clear-data`, session.access_token, {
    method: 'DELETE',
  });
}

// Selective cleanup for production launch - removes only transactional data
export async function cleanupProductionData(): Promise<{
  success: boolean;
  message: string;
  stats: any;
  totalDeleted: number;
}> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/cleanup-production-data`, session.access_token, {
    method: 'POST',
  });
  return data;
}

// ============================================
// NOTIFICATION API
// ============================================

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedId: string | null;
  relatedDate: string | null;
  read: boolean;
  createdAt: string;
}

export async function getNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    // Return empty instead of throwing error - notifications are non-critical
    return { notifications: [], unreadCount: 0 };
  }

  try {
    const data = await fetchWithAuth(`${API_BASE}/notifications`, session.access_token);
    // unreadCount reflects the FULL backlog server-side, not just the 100 most recent
    // notifications returned below - falls back to counting the visible list for older
    // deployments of this route that don't send it yet.
    return {
      notifications: data.notifications,
      unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : data.notifications.filter((n: Notification) => !n.read).length,
    };
  } catch (error) {
    // Return empty on error (auth failure, network issue, etc.)
    console.log('Unable to fetch notifications:', error instanceof Error ? error.message : 'Unknown error');
    return { notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationAsRead(id: string): Promise<Notification> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/notifications/${id}/read`, session.access_token, {
    method: 'PUT',
  });
  return data.notification;
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/notifications/read-all`, session.access_token, {
    method: 'PUT',
  });
}

// ============================================
// APP VERSION CHECK
// ============================================

// No-login-required by design - see GET /app-version. Never throws; a stale/offline
// build should just quietly skip the update nudge, not break anything else on load.
export async function getLatestAppVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/app-version`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.latestVersion || null;
  } catch {
    return null;
  }
}

// ============================================
// STORE API
// ============================================

export interface Store {
  id: string;
  name: string;
  location: string;
  managerId: string | null;
  productionHouseId: string | null; // Map store to production house
  ciferonStoreId?: string | null; // Maps to the store's numeric StoreId in the Ciferon POS, for nightly auto-sync
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export async function getStores(): Promise<Store[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/stores`, session.access_token);
  return data.stores;
}

export async function createStore(name: string, location: string): Promise<Store> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/stores`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ name, location }),
  });
  return data.store;
}

export async function assignManagerToStore(storeId: string, managerId: string): Promise<Store> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/stores/${storeId}/assign-manager`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify({ managerId }),
  });
  return data.store;
}

export async function assignProductionHouseToStore(storeId: string, productionHouseId: string | null): Promise<Store> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/stores/${storeId}/assign-production-house`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify({ productionHouseId }),
  });
  return data.store;
}

export async function updateStore(storeId: string, name: string, location: string, ciferonStoreId?: string | null): Promise<Store> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const data = await fetchWithAuth(`${API_BASE}/stores/${storeId}`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify({ name, location, ciferonStoreId }),
  });
  return data.store;
}

export async function migrateDataToStore(storeId: string): Promise<any> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/stores/${storeId}/migrate-data`, session.access_token, {
    method: 'POST',
  });
  return data;
}

export async function cleanDuplicates(accessToken: string): Promise<any> {
  const data = await fetchWithAuth(`${API_BASE}/cleanup-duplicates`, accessToken, {
    method: 'POST',
  });
  return data;
}

// ============================================
// PRODUCTION HOUSE API
// ============================================

export interface ProductionHouse {
  id: string;
  name: string;
  location: string;
  productionHeadId: string | null; // The production incharge
  inventory: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================
// STOCK REQUEST API
// ============================================

export interface StockRequest {
  id: string;
  storeId: string;
  storeName?: string; // For display
  productionHouseId: string;
  productionHouseName?: string; // For display
  requestedBy: string; // Employee ID of store incharge
  requestedByName?: string; // For display
  requestDate: string;
  
  // Requested quantities
  requestedQuantities: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  };
  
  // Fulfilled quantities (can be less than requested)
  fulfilledQuantities: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  } | null;
  
  status: 'pending' | 'fulfilled' | 'partially_fulfilled' | 'cancelled';
  fulfilledBy: string | null; // Employee ID of production head
  fulfilledByName?: string | null; // For display
  fulfillmentDate: string | null;
  notes: string | null; // Optional notes from production head
}

// ============================================
// MIGRATION API FUNCTIONS
// ============================================

export async function migrateProductionHouseSystem(accessToken: string): Promise<{ success: boolean; message: string; details: any }> {
  const data = await fetchWithAuth(`${API_BASE}/migrate-production-house-system`, accessToken, {
    method: 'POST',
  });
  return data;
}

// ============================================
// EMPLOYEE API
// ============================================

export interface Employee {
  id?: string;
  employeeId: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'cluster_head';
  managerId?: string;
  clusterHeadId?: string;
  type?: 'full_time' | 'contract';
  employmentType?: 'fulltime' | 'contract';
  joiningDate?: string;
  dob?: string;
  phone?: string;
  aadharFront?: string;
  aadharBack?: string;
  // Set by the server instead of the images for anyone but the owner and the person themself.
  hasAadharImages?: boolean;
  authUserId?: string;
  createdBy?: string;
  createdAt?: string;
  status?: 'active' | 'inactive';
  storeId?: string | null;
  designation?: 'store_incharge' | 'production_incharge' | 'operations_incharge' | 'store_ops' | 'production_ops' | 'operations_manager' | 'rider' | null;
  department?: 'store_operations' | 'production' | null;
  inchargeId?: string;
  // Explicit multi-entity access, replacing the old assumption that storeId alone
  // identifies "the one store/production house this person belongs to" - that field is
  // ambiguous (it holds a real store id for a store incharge but a production house id
  // for a production incharge) and broke every screen that read it as a plain store id.
  // These arrays are the source of truth going forward; storeId is kept for backward
  // compatibility with older records/code that hasn't been migrated to read these yet.
  assignedStoreIds?: string[];
  assignedProductionHouseIds?: string[];
  // Fixed monthly salary breakdown (Basic, HRA, Conveyance, etc.) - drives the payslip's
  // itemized breakdown instead of a single lump "Basic Salary" line. Deliberately doesn't
  // include the variable component - that's entered per-payout (see Payout.variablePay)
  // since it changes month to month (incentive/performance pay), unlike these fixed lines.
  salaryStructure?: SalaryComponent[];
}

export interface SalaryComponent {
  label: string; // e.g. "Basic", "HRA", "Conveyance", "Special Allowance"
  amount: number; // fixed monthly amount for this component
}

export async function getAllEmployees(accessToken?: string): Promise<Employee[]> {
  // If accessToken is provided, use it directly
  if (accessToken) {
    const data = await fetchWithAuth(`${API_BASE}/employees`, accessToken);
    return data.employees || [];
  }
  
  // Otherwise, get session from Supabase
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/employees`, session.access_token);
  return data.employees || [];
}

export async function getEmployees(): Promise<Employee[]> {
  // Alias for getAllEmployees for backward compatibility
  return getAllEmployees();
}

export async function getArchivedEmployees(): Promise<Employee[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/archived-employees`, session.access_token);
  return data.employees || [];
}

export async function createUnifiedEmployee(employeeData: any) {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}/unified-employees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(employeeData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create employee');
  }
  
  return await response.json();
}

export async function deleteUnifiedEmployee(employeeId: string) {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}/unified-employees/${employeeId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete employee');
  }
  
  return await response.json();
}

// Owner only: brings a past employee back and switches their login back on.
export async function restoreArchivedEmployee(employeeId: string): Promise<{ success: boolean; loginRestored: boolean | null }> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}/archived-employees/${employeeId}/restore`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to restore employee');
  }

  return await response.json();
}

export async function deleteEmployee(employeeId: string) {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}/employees/${employeeId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete employee');
  }
  
  return await response.json();
}

export async function resetEmployeePassword(employeeId: string, newPassword: string) {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}/unified-employees/${employeeId}/reset-password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ newPassword })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reset password');
  }
  
  return await response.json();
}

export async function getEmployeesByManager(managerId: string, accessToken?: string): Promise<Employee[]> {
  // If accessToken is provided, use it directly
  if (accessToken) {
    const data = await fetchWithAuth(`${API_BASE}/unified-employees/manager/${managerId}`, accessToken);
    return data.employees || [];
  }
  
  // Otherwise, get session from Supabase
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/unified-employees/manager/${managerId}`, session.access_token);
  return data.employees || [];
}

export async function getManagersByClusterHead(clusterHeadId: string): Promise<Employee[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/unified-employees/cluster-head/${clusterHeadId}`, session.access_token);
  return data.managers || [];
}

// Migration utility: Assign storeIds to existing employees
export async function migrateEmployeeStores() {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}/migrate-employee-stores`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to run migration');
  }
  
  return await response.json();
}

// Assign manager to employee (updates managerId and storeId to match manager's store)
export async function assignManagerToEmployee(employeeId: string, managerId: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/assign-manager-to-employee`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ employeeId, managerId })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign manager');
  }
  
  return await response.json();
}

// Update employee role (for fixing custom roles)
export async function updateEmployeeRole(employeeId: string, newRole: 'employee' | 'manager' | 'cluster_head') {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/employee/${employeeId}/role`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ newRole })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update role');
  }
  
  return await response.json();
}

// Update employee store assignment
export async function updateEmployeeStore(employeeId: string, newStoreId: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/employee/${employeeId}/store`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ newStoreId })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update store');
  }
  
  return await response.json();
}

// Explicit multi-store/multi-production-house access for an employee (manager/incharge
// roles especially) - the real fix for the ambiguous single storeId field, which can't
// represent "this person covers 2 stores" or "store incharge who is also backup for the
// production house" at all.
export async function updateEmployeeAssignments(
  employeeId: string,
  assignedStoreIds: string[],
  assignedProductionHouseIds: string[]
) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}/employee/${employeeId}/assignments`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ assignedStoreIds, assignedProductionHouseIds })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update assignments');
  }

  return await response.json();
}

// Update employee designation (Store Incharge / Production Incharge)
export async function updateEmployeeDesignation(
  employeeId: string, 
  designation: 'store_incharge' | 'production_incharge' | null,
  department: 'store_operations' | 'production' | null
) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/employee/${employeeId}/designation`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ designation, department })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update designation');
  }
  
  return await response.json();
}

// Assign incharge to employee
export async function assignInchargeToEmployee(employeeId: string, inchargeId: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/employee/${employeeId}/assign-incharge`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ inchargeId })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign incharge');
  }
  
  return await response.json();
}

// Get employees by incharge (for Store/Production Incharge)
export async function getEmployeesByIncharge(inchargeId: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/employees/by-incharge/${inchargeId}`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch employees');
  }
  
  return await response.json();
}

// Sync all employee designations to auth metadata
export async function syncDesignations() {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}/sync-designations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to sync designations');
  }
  
  return await response.json();
}

// Update unified employee (role, managerId, clusterHeadId, etc.)
// Alias for updateUnifiedEmployee to match callers expecting a generic name
export async function updateEmployee(employeeId: string, updates: any) {
  return updateUnifiedEmployee(employeeId, updates);
}

export async function assignClusterHeadToManager(managerId: string, clusterHeadId: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}/unified-employees/${managerId}/assign-cluster-head`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ clusterHeadId })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign cluster head');
  }

  return await response.json();
}

export async function updateUnifiedEmployee(employeeId: string, updates: any) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  
  const response = await fetch(`${API_BASE}/unified-employees/${employeeId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update employee');
  }
  
  return await response.json();
}

// ============================================
// PAYOUT API
// ============================================

export interface Payout {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  storeId?: string; // Optional for backward compatibility with existing data
  createdAt?: string;
  forMonth?: string; // Format "YYYY-MM" - which month this payout covers, for late/backlogged salaries (e.g. paid on the 5th for the prior month)
  // Bank/UPI reference for this specific digital payment, kept as a paper trail alongside
  // the payout record - shown on the payslip so the employee has proof of the transfer.
  transactionId?: string;
  // This month's variable/incentive pay, entered fresh per payout since (unlike the
  // employee's fixed salaryStructure) it isn't the same every month. Shown on the payslip
  // as its own line alongside the fixed components.
  variablePay?: number;
  variablePayLabel?: string; // defaults to "Variable Pay" if omitted
  // Which balance this payout actually came out of. Only 'paytm' payouts are subtracted
  // from the store's Online Cash (Paytm) balance - 'bank' and 'cash' payouts are settled
  // from elsewhere and must NOT drain the Paytm figure. Undefined (legacy records) is
  // treated as 'paytm', which was the implicit assumption before this field existed.
  paidFrom?: 'paytm' | 'bank' | 'cash';
  // Salary-advance instalment(s) recovered from this payout: `amount` above is what was
  // transferred, after this. advanceRecovery says which instalments, so deleting the
  // payout can hand them back to the advance.
  advanceDeduction?: number;
  advanceRecovery?: { advanceId: string; month: string; amount: number }[];
}

export async function getPayouts(): Promise<Payout[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/payouts`, session.access_token);
  return data.payouts || [];
}

export async function addPayouts(payouts: Omit<Payout, 'id'>[]): Promise<Payout[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/payouts`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ payouts }),
  });
  return data.payouts || [];
}

export async function updatePayout(id: string, updates: Partial<Payout>): Promise<Payout> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/payouts/${id}`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.payout;
}

export async function deletePayout(id: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/payouts/${id}`, session.access_token, {
    method: 'DELETE',
  });
}

// ============================================
// UTILITIES CONSUMPTION (packaging box/tray + beverage stock, from real POS order data)
// ============================================

export interface UtilitiesConsumption {
  success: boolean;
  startDate: string;
  endDate: string;
  daysWithData: number;
  boxesUsed: number;
  traysUsed: number;
  unattributedOrders: number;
  beverageConsumption: Record<string, number>;
}

export async function getUtilitiesConsumption(accessToken: string, storeId?: string | null, startDate?: string, endDate?: string): Promise<UtilitiesConsumption> {
  const params = new URLSearchParams();
  if (storeId) params.set('storeId', storeId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return await fetchWithAuth(`${API_BASE}/utilities-consumption?${params.toString()}`, accessToken);
}

// ============================================
// ONLINE SALES (SWIGGY/ZOMATO) API
// ============================================

export interface OnlineSalesEntry {
  id: string;
  date: string;
  swiggySales: number;
  zomatoSales: number;
  storeId?: string;
  createdAt: string;
}

export interface OnlinePayoutEntry {
  id: string;
  date: string;
  swiggyPayout: number;
  zomatoPayout: number;
  storeId?: string;
  createdAt: string;
}

export async function getOnlineSalesData(accessToken: string): Promise<OnlineSalesEntry[]> {
  try {
    const data = await fetchWithAuth(`${API_BASE}/online-sales`, accessToken);
    return data.sales || [];
  } catch (error) {
    console.error('Error fetching online sales data:', error);
    return [];
  }
}

export async function saveOnlineSalesData(accessToken: string, entry: OnlineSalesEntry): Promise<OnlineSalesEntry> {
  const data = await fetchWithAuth(`${API_BASE}/online-sales`, accessToken, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
  return data.entry;
}

export async function getOnlinePayoutData(accessToken: string): Promise<OnlinePayoutEntry[]> {
  try {
    const data = await fetchWithAuth(`${API_BASE}/online-payouts`, accessToken);
    return data.payouts || [];
  } catch (error) {
    console.error('Error fetching online payout data:', error);
    return [];
  }
}

export async function saveOnlinePayoutData(accessToken: string, entry: OnlinePayoutEntry): Promise<OnlinePayoutEntry> {
  const data = await fetchWithAuth(`${API_BASE}/online-payouts`, accessToken, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
  return data.entry;
}

// ============================================
// AGGREGATOR SETTLEMENT API (document-upload payout reconciliation - replaces the
// online-payouts daily-entry mechanism above)
// ============================================

export type AggregatorSettlementOrder = {
  orderId: string; // matches Ciferon's OrderList[].ExternalId for the join
  grossValue: number;
  netPayout: number;
  orderDate?: string; // YYYY-MM-DD sales/order date from the settlement report
  // Zomato-only, from the settlement's own "Order Level" sheet (Swiggy's equivalent
  // columns haven't been inspected yet - stays undefined for Swiggy settlements). All
  // optional so settlements uploaded before these were added keep reading fine.
  itemSubtotal?: number;      // "Subtotal (items total)" - pre-discount, pre-GST dish total
  promoDiscount?: number;     // "Restaurant discount [Promo]"
  flatOffDiscount?: number;   // "Restaurant discount [Flat offs, Freebies, Gold, Brand pack & others]"
  gstCollected?: number;      // "Total GST collected from customers"
  discountConstruct?: string; // the promo code itself, e.g. "SmartPromos TAKEOFF40ON149"
};

export type AggregatorSettlement = {
  id: string;
  storeId: string;
  storeName: string;
  aggregator: 'zomato' | 'swiggy';
  settlementDate: string; // YYYY-MM-DD
  // Sales/order period covered by this settlement. This can differ from settlementDate
  // when a July report is paid out by the aggregator in August.
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string; // YYYY-MM-DD
  bankUTR: string;
  grossSales: number; // "Net Order Value" in Zomato's own terms - post-discount, pre-payout. NOT the same as Online Revenue (that comes from POS billing) - see the Discounts/Channel Economics sections in Analytics for how this is used.
  netPayout: number;
  netCommission: number;
  orderCount: number;
  orders: AggregatorSettlementOrder[];
  // Ad spend for this settlement period (Zomato's "Investment in growth services" or
  // Swiggy's "Unlimited Ads" deduction, from the Payout Breakup sheet). Undefined on
  // settlements uploaded before this was parsed, or reports missing that sheet.
  adSpend?: number;
  // Summed from the per-order fields above (Zomato only) - undefined whenever none of the
  // underlying orders carried these fields, so "not captured" reads differently from "0".
  itemSubtotal?: number;    // "Menu Subtotal" in the UI - pre-discount dish-price total
  promoDiscount?: number;
  flatOffDiscount?: number;
  totalDiscount?: number;   // promoDiscount + flatOffDiscount, precomputed for convenience
  gstCollected?: number;
  sourceFileName: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type OrderItemDetailItem = {
  productId: number | null;
  productName: string;
  category: string | null;
  quantity: number;
  rate: number;
  total: number;
};

export type OrderItemDetailOrder = {
  orderId: number | string;
  externalId: string | null;
  paymentMode: string;
  grandTotal: number;
  subtotal: number;
  discount: number;
  items: OrderItemDetailItem[];
  // Hour of day (0-23, IST) the order was placed, when Ciferon's raw timestamp for this
  // order actually carried a time component - null/undefined for orders synced before this
  // was captured, or whose raw date field turned out to be date-only. Powers the hourly
  // order-volume chart in Analytics; days with no hour data simply won't appear there
  // (they're unaffected everywhere else, like the daily order-count chart).
  orderHourIST?: number | null;
 // 'DineIn' | 'TakeAway' | 'HomeDelivery' from Ciferon's SaleOrderType - already captured
 // by the sync (used for box/tray counting in /utilities-consumption) but not previously
 // typed here or surfaced in any chart.
 orderType?: string | null;
};

export type OrderItemDetailRecord = {
  storeId: string;
  date: string; // YYYY-MM-DD
  orders: OrderItemDetailOrder[];
  syncedAt: string;
};

export async function getOrderItemDetail(
  accessToken: string,
  opts?: { storeId?: string; startDate?: string; endDate?: string }
): Promise<OrderItemDetailRecord[]> {
  try {
    const params = new URLSearchParams();
    if (opts?.storeId) params.set('storeId', opts.storeId);
    if (opts?.startDate) params.set('startDate', opts.startDate);
    if (opts?.endDate) params.set('endDate', opts.endDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await fetchWithAuth(`${API_BASE}/order-item-detail${query}`, accessToken);
    return data.records || [];
  } catch (error) {
    console.error('Error fetching order item detail:', error);
    return [];
  }
}

export async function getAggregatorSettlements(accessToken: string, storeId?: string): Promise<AggregatorSettlement[]> {
  try {
    const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
    const data = await fetchWithAuth(`${API_BASE}/aggregator-settlements${query}`, accessToken);
    return data.settlements || [];
  } catch (error) {
    console.error('Error fetching aggregator settlements:', error);
    return [];
  }
}

export async function createAggregatorSettlement(
  accessToken: string,
  entry: Omit<AggregatorSettlement, 'id' | 'uploadedBy' | 'uploadedAt'> & { replace?: boolean }
): Promise<AggregatorSettlement> {
  const data = await fetchWithAuth(`${API_BASE}/aggregator-settlements`, accessToken, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
  return data.settlement;
}

export async function deleteAggregatorSettlement(accessToken: string, id: string): Promise<any> {
  return fetchWithAuth(`${API_BASE}/aggregator-settlements/${id}`, accessToken, {
    method: 'DELETE',
  });
}

// ============================================
// SALARY ADVANCE API
// ============================================

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmployeeId: string;
  amount: number;
  requestDate: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedDate?: string;
  rejectionReason?: string;
  installments: number; // Always 4
  monthlyDeduction: number; // amount / 4
  remainingAmount: number;
  startMonth: string; // YYYY-MM format
  endMonth: string; // YYYY-MM format
  deductions: SalaryAdvanceDeduction[];
  createdAt: string;
}

export interface SalaryAdvanceDeduction {
  month: string; // YYYY-MM format
  amount: number;
  deducted: boolean; // fully recovered
  deductedDate?: string;
  payoutId?: string;
  // How much of this instalment has been recovered so far - a payout too small to cover it
  // recovers part (net pay never goes below zero) and the rest stays due.
  recovered?: number;
}

export async function getSalaryAdvances(): Promise<SalaryAdvance[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/salary-advances`, session.access_token);
  return data.salaryAdvances || [];
}

export async function createSalaryAdvance(advance: Omit<SalaryAdvance, 'id' | 'createdAt'>): Promise<SalaryAdvance> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/salary-advances`, session.access_token, {
    method: 'POST',
    body: JSON.stringify(advance),
  });
  return data.salaryAdvance;
}

export async function updateSalaryAdvance(id: string, updates: Partial<SalaryAdvance>): Promise<SalaryAdvance> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/salary-advances/${id}`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.salaryAdvance;
}

export async function deleteSalaryAdvance(id: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/salary-advances/${id}`, session.access_token, {
    method: 'DELETE',
  });
}

// ============================================
// INVENTORY ITEMS API (Dynamic Product Types)
// ============================================

export interface DynamicInventoryItem {
  id: string;
  name: string;
  displayName: string;
  category: 'finished_product' | 'raw_material' | 'sauce_chutney';
  unit: string;
  linkedEntityType: 'store' | 'production_house' | 'global';
  linkedEntityId?: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

export async function fetchInventoryItems(
  entityType?: string,
  entityId?: string,
  category?: string
): Promise<DynamicInventoryItem[]> {
  try {
    const params = new URLSearchParams();
    if (entityType) params.append('entityType', entityType);
    if (entityId) params.append('entityId', entityId);
    if (category) params.append('category', category);

    const response = await fetch(
      `${API_BASE}/inventory-items?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${await currentAccessToken()}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error fetching inventory items:', errorText);
      // Return empty array instead of throwing to prevent app crashes
      return [];
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('❌ Error fetching inventory items:', error);
    // Return empty array on any error
    return [];
  }
}

export async function addInventoryItem(
  item: Omit<DynamicInventoryItem, 'id' | 'createdAt' | 'isActive'>
): Promise<DynamicInventoryItem> {
  const response = await fetch(`${API_BASE}/inventory-items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await currentAccessToken()}`
    },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create inventory item');
  }

  const data = await response.json();
  return data.item;
}

// Alias matching (accessToken, item) call order, used by backup/restore.
// The endpoint itself doesn't require a user token (uses the public anon key),
// so accessToken is accepted for signature compatibility but unused.
export async function createInventoryItem(
  _accessToken: string,
  item: Omit<DynamicInventoryItem, 'id' | 'createdAt' | 'isActive'>
): Promise<DynamicInventoryItem> {
  return addInventoryItem(item);
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<DynamicInventoryItem>
): Promise<DynamicInventoryItem> {
  const response = await fetch(`${API_BASE}/inventory-items/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await currentAccessToken()}`
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update inventory item');
  }

  const data = await response.json();
  return data.item;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/inventory-items/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${await currentAccessToken()}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete inventory item');
  }
}

export async function initializeDefaultInventoryItems(): Promise<DynamicInventoryItem[]> {
  const response = await fetch(`${API_BASE}/inventory-items/initialize-defaults`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await currentAccessToken()}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to initialize default items');
  }

  const data = await response.json();
  return data.items || [];
}

// ============================================
// CLUSTER HEAD API
// ============================================

export interface ClusterHead {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  authUserId?: string;
  createdAt?: string;
}

export async function deleteClusterHeadByEmail(email: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/cluster-heads/by-email/${encodeURIComponent(email)}`, session.access_token, {
    method: 'DELETE',
  });
}

// ============================================
// ORGANIZATIONAL HIERARCHY API
// ============================================

export interface HierarchyNode {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: 'cluster_head' | 'manager' | 'employee';
  clusterHeadId?: string;
  managerId?: string;
  storeId?: string | null;
  designation?: 'store_incharge' | 'production_incharge' | null;
  department?: 'store_operations' | 'production' | null;
  inchargeId?: string;
  managers?: HierarchyNode[];
  employees?: HierarchyNode[];
}

export interface OrganizationalHierarchy {
  hierarchy: HierarchyNode[];
  unassignedManagers: HierarchyNode[];
  unassignedEmployees: HierarchyNode[];
  stats: {
    totalClusterHeads: number;
    totalManagers: number;
    totalEmployees: number;
  };
}

export async function getOrganizationalHierarchy(storeId?: string | null): Promise<OrganizationalHierarchy> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const url = storeId 
    ? `${API_BASE}/organizational-hierarchy?storeId=${encodeURIComponent(storeId)}`
    : `${API_BASE}/organizational-hierarchy`;
  
  const data = await fetchWithAuth(url, session.access_token);
  return {
    hierarchy: data.hierarchy || [],
    unassignedManagers: data.unassignedManagers || [],
    unassignedEmployees: data.unassignedEmployees || [],
    stats: data.stats || { totalClusterHeads: 0, totalManagers: 0, totalEmployees: 0 }
  };
}

// ============================================
// ATTENDANCE & LEAVE API
// ============================================

export interface Timesheet {
  id?: string;
  employeeId: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  hoursWorked?: number;
  // True when the day was logged as leave rather than worked hours.
  isLeave?: boolean;
  approvedBy?: string;
  approvedAt?: string;
  // Set server-side on save (POST /timesheets, /timesheets/bulk) - when the employee
  // actually submitted this entry, used by the 5-day auto-approve-stale cron to tell how
  // long it's been waiting on a manager. Records saved before this field existed won't
  // have it.
  submittedAt?: string;
}

export interface LeaveApplication {
  id?: string;
  employeeId: string;
  leaveDate: string;
  leaveType?: 'full' | 'half'; // Leave type (optional for backward compatibility)
  isAdvanceLeave?: boolean; // Whether this is an advance leave (borrowed from next month)
  advanceDaysRequested?: number; // Total days in the advance-leave application this record belongs to
  approverRole?: 'manager' | 'cluster_head'; // Who this advance leave routes to for approval
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export async function getTimesheets(employeeId: string): Promise<Timesheet[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/timesheets/${employeeId}`, session.access_token);
  return data.timesheets || [];
}

// Every employee's timesheets, org-wide - powers the Staff Attendance Compliance section
// on the Store-Production SLA Analysis page.
export async function getAllTimesheets(): Promise<Timesheet[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const data = await fetchWithAuth(`${API_BASE}/timesheets/all`, session.access_token);
  return data.timesheets || [];
}

export async function saveTimesheet(entry: Timesheet): Promise<{ success: boolean; id: string }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return fetchWithAuth(`${API_BASE}/timesheets`, session.access_token, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export async function saveTimesheetBulk(entries: Timesheet[]): Promise<{ success: boolean; count: number }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return fetchWithAuth(`${API_BASE}/timesheets/bulk`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ timesheets: entries }),
  });
}

export async function approveTimesheet(timesheetId: string, managerId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  await fetchWithAuth(`${API_BASE}/timesheets/${timesheetId}/approve`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ managerId }),
  });
}

export async function rejectTimesheet(timesheetId: string, managerId: string, reason?: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  await fetchWithAuth(`${API_BASE}/timesheets/${timesheetId}/reject`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ managerId, reason }),
  });
}

export async function getLeaves(employeeId: string, accessToken?: string): Promise<LeaveApplication[]> {
  // If accessToken is provided, use it directly
  if (accessToken) {
    const data = await fetchWithAuth(`${API_BASE}/leaves/${employeeId}`, accessToken);
    return data.leaves || [];
  }
  
  // Otherwise, get session from Supabase
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/leaves/${employeeId}`, session.access_token);
  return data.leaves || [];
}

export async function getAllLeaves(accessToken?: string): Promise<LeaveApplication[]> {
  // If accessToken is provided, use it directly
  if (accessToken) {
    const data = await fetchWithAuth(`${API_BASE}/leaves/all`, accessToken);
    return data.leaves || [];
  }
  
  // Otherwise, get session from Supabase
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/leaves/all`, session.access_token);
  return data.leaves || [];
}

export async function applyLeave(leave: LeaveApplication): Promise<LeaveApplication> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/leaves`, session.access_token, {
    method: 'POST',
    body: JSON.stringify(leave),
  });
  return data.leave;
}

// Applies for a multi-day leave in one call - saves one record per day like applyLeave,
// but sends a single notification summarizing the whole date range instead of one per
// day (see the /leaves/bulk route for why: looping applyLeave floods the approver).
export async function applyLeaveBulk(leaves: LeaveApplication[]): Promise<{ success: boolean; ids: string[] }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return fetchWithAuth(`${API_BASE}/leaves/bulk`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ leaves }),
  });
}

// Deletes a still-pending leave application - e.g. the employee applied for the wrong
// date and wants to redo it. The server rejects this once a manager has already
// approved/rejected it (see DELETE /leaves/:leaveId).
export async function deleteLeave(leaveId: string): Promise<{ success: boolean }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return fetchWithAuth(`${API_BASE}/leaves/${leaveId}`, session.access_token, {
    method: 'DELETE',
  });
}

// This leave year's balance (approved leave deducted) and the days still waiting for a
// decision. The server takes the joining date from the employee's own record.
export async function getLeaveBalance(employeeId: string): Promise<{ balance: number; pendingDays: number }> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const data = await fetchWithAuth(`${API_BASE}/leaves/${employeeId}/balance`, session.access_token);
  return { balance: data.balance || 0, pendingDays: data.pendingDays || 0 };
}

// Leave approval and rejection functions
export async function approveLeave(leaveId: string, approverId: string, approverName: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/leaves/${leaveId}/approve`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ managerId: approverId, managerName: approverName }),
  });
}

export async function rejectLeave(leaveId: string, approverId: string, approverName: string, reason?: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  await fetchWithAuth(`${API_BASE}/leaves/${leaveId}/reject`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ managerId: approverId, managerName: approverName, reason }),
  });
}

// ============================================
// CUSTOM ITEMS API
// ============================================

export interface CustomItem {
  id: string;
  category: string;
  itemName: string;
  itemNameBengali?: string;
  emoji?: string;
  // Which quick-add flow this item belongs to, and which entity it's normally logged
  // against - remembered so the smart quick-add can auto-classify it next time.
  entryType?: 'inventory' | 'overhead' | 'fixedcost';
  entityType?: 'store' | 'production_house' | 'both';
  createdAt?: string;
}

export async function getCustomItems(): Promise<CustomItem[]> {
  try {
    const response = await fetch(`${API_BASE}/custom-items`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await currentAccessToken()}`
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch custom items:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    return data.customItems || [];
  } catch (error) {
    console.error('Error fetching custom items:', error);
    return [];
  }
}

export async function addCustomItem(
  category: string,
  itemName: string,
  entryType?: 'inventory' | 'overhead' | 'fixedcost',
  entityType?: 'store' | 'production_house' | 'both'
): Promise<CustomItem> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const data = await fetchWithAuth(`${API_BASE}/custom-items`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ category, itemName, entryType, entityType }),
  });
  return data.customItem;
}

export async function updateCustomItem(id: string, updates: Partial<Omit<CustomItem, 'id'>>): Promise<CustomItem> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const data = await fetchWithAuth(`${API_BASE}/custom-items/${id}`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.customItem;
}

export async function deleteCustomItem(id: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  await fetchWithAuth(`${API_BASE}/custom-items/${id}`, session.access_token, {
    method: 'DELETE',
  });
}

// Cluster-head-created inventory categories, separate for store vs. production-house
// purchases - see the "Manage Categories & Items" modal and the backend's
// getValidInventoryCategoryKeys (supabase/functions/make-server-c2dd9b9d/index.ts).
export interface CustomCategory {
  key: string;
  scope: 'store' | 'production';
  label: string;
  emoji: string;
  createdBy?: string;
  createdAt?: string;
}

export async function getCustomCategories(): Promise<CustomCategory[]> {
  try {
    const response = await fetch(`${API_BASE}/custom-categories`, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await currentAccessToken()}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.categories || [];
  } catch (error) {
    console.error('Error fetching custom categories:', error);
    return [];
  }
}

export async function addCustomCategory(scope: 'store' | 'production', label: string, emoji?: string): Promise<CustomCategory> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  const data = await fetchWithAuth(`${API_BASE}/custom-categories`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ scope, label, emoji }),
  });
  return data.category;
}

export async function deleteCustomCategory(key: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  await fetchWithAuth(`${API_BASE}/custom-categories/${key}`, session.access_token, {
    method: 'DELETE',
  });
}

// ============================================
// PRODUCTION REQUESTS API
// ============================================

export interface ProductionRequest {
  id: string;
  requestDate: string;
  storeId: string;
  storeName?: string;
  requestedBy: string; // Store In-Charge employee ID
  requestedByName?: string;
  status: 'pending' | 'accepted' | 'in-preparation' | 'prepared' | 'shipped' | 'partially-shipped' | 'delivered' | 'partially-delivered';
  // Momos
  chickenMomos: number;
  chickenCheeseMomos: number;
  vegMomos: number;
  cheeseCornMomos: number;
  paneerMomos: number;
  vegKurkureMomos: number;
  chickenKurkureMomos: number;
  // Kitchen Utilities (with quantity and unit)
  kitchenUtilities?: Record<string, { quantity: number; unit: string }>;
  // Sauces (boolean - requested or not)
  sauces?: Record<string, boolean>;
  // Utilities (with quantity in pieces)
  utilities?: Record<string, number>;
  notes?: string;
  acceptedAt?: string;
  acceptedBy?: string; // Production Head employee ID
  preparedAt?: string;
  shippedAt?: string;
  shippedQuantities?: Record<string, number>; // Actual quantities shipped
  shippedSauces?: Record<string, boolean>; // Which requested sauces were actually included
  shippingNotes?: Record<string, string>; // Notes for items with different quantities
  deliveredAt?: string;
  deliveredBy?: string; // Store In-Charge employee ID
  dispatch?: DispatchInfo; // bags, batch codes, boxes - set when shipped from app 1.15.17
  receipt?: DeliveryReceipt; // the store's count - set when received from app 1.15.17
  createdAt: string;
  updatedAt: string;
}

export async function fetchProductionRequests(accessToken: string, fromDate?: string, toDate?: string): Promise<ProductionRequest[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set('from', fromDate);
  if (toDate) params.set('to', toDate);
  const query = params.toString();
  const data = await fetchWithAuth(`${API_BASE}/production-requests${query ? `?${query}` : ''}`, accessToken);
  return data.requests || [];
}

export async function createProductionRequest(
  accessToken: string, 
  request: Omit<ProductionRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>
): Promise<ProductionRequest> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests`, accessToken, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return data.request;
}

export async function updateProductionRequestStatus(
  accessToken: string,
  id: string,
  status: ProductionRequest['status'],
  updatedBy: string
): Promise<ProductionRequest> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/${id}/status`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ status, updatedBy }),
  });
  return data.request;
}

export async function shipProductionRequest(
  accessToken: string,
  id: string,
  shippedQuantities: Record<string, number>,
  shippingNotes: Record<string, string>,
  shippedBy: string,
  shippedSauces?: Record<string, boolean>,
  dispatch?: DispatchInfo
): Promise<ProductionRequest> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/${id}/ship`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ shippedQuantities, shippingNotes, shippedBy, shippedSauces, dispatch }),
  });
  return data.request;
}

// The store's count of a shipped request - any store login (crew included) can send it.
export async function receiveProductionRequest(
  accessToken: string,
  id: string,
  receipt: Omit<DeliveryReceipt, 'receivedBy' | 'receivedByName' | 'receivedAt'>
): Promise<ProductionRequest> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/${id}/receive`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ receipt }),
  });
  return data.request;
}

export async function uploadReceiptPhoto(accessToken: string, requestId: string, dataUrl: string): Promise<string> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/${requestId}/receipt-photos`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
  return data.photoId;
}

export async function getReceiptPhotos(accessToken: string, requestId: string): Promise<{ id: string; dataUrl: string; uploadedBy?: string; uploadedAt?: string }[]> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/${requestId}/receipt-photos`, accessToken);
  return data.photos || [];
}

export async function checkPendingProductionRequests(accessToken: string): Promise<{
  checked: boolean;
  oldPendingCount: number;
  newPendingCount: number;
  notificationsSent: number;
}> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/check-pending`, accessToken, {
    method: 'POST'
  });
  return data;
}

// Sales Data API functions
export interface SalesDataRecord {
  id: string;
  date: string;
  storeId: string;
  storeName?: string;
  data: {
    'Chicken Momos': number;
    'Chicken Cheese Momos': number;
    'Veg Momos': number;
    'Paneer Momos': number;
    'Corn Cheese Momos': number;
    'Chicken Kurkure Momos': number;
    'Veg Kurkure Momos': number;
  };
  channelBreakdown?: {
    'Chicken Momos': Record<string, { pieces: number; revenue: number }>;
    'Chicken Cheese Momos': Record<string, { pieces: number; revenue: number }>;
    'Veg Momos': Record<string, { pieces: number; revenue: number }>;
    'Paneer Momos': Record<string, { pieces: number; revenue: number }>;
    'Corn Cheese Momos': Record<string, { pieces: number; revenue: number }>;
    'Chicken Kurkure Momos': Record<string, { pieces: number; revenue: number }>;
    'Veg Kurkure Momos': Record<string, { pieces: number; revenue: number }>;
  };
  // Per-menu-item (not rolled up to category) channel split - real product name ->
  // piecesPerUnit (this item's plate size, e.g. 6) + channel name (POS/Zomato/Swiggy/...) ->
  // pieces/revenue. Only present on pos-sync records from 2026-08-23 onward (see
  // classifyAndSumProductsByItemAndChannel) - older records only have the category-level
  // channelBreakdown above.
  itemChannelBreakdown?: Record<string, { piecesPerUnit: number; channels: Record<string, { pieces: number; revenue: number }> }>;
  uploadedBy: string;
  uploadedAt: string;
}

export async function getSalesData(accessToken: string): Promise<{ data: SalesDataRecord[] }> {
  const response = await fetchWithAuth(`${API_BASE}/sales-data`, accessToken);
  return response;
}

export async function saveSalesData(record: SalesDataRecord, accessToken: string): Promise<SalesDataRecord> {
  const data = await fetchWithAuth(`${API_BASE}/sales-data`, accessToken, {
    method: 'POST',
    body: JSON.stringify(record),
  });
  return data.record;
}

export async function deleteSalesData(recordId: string, accessToken: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/sales-data/${recordId}`, accessToken, {
    method: 'DELETE',
  });
}

// Alias matching (accessToken, record) call order, used by backup/restore
export async function addCategorySalesData(accessToken: string, record: SalesDataRecord): Promise<SalesDataRecord> {
  return saveSalesData(record, accessToken);
}

// ============================================
// PRODUCTION HOUSE API FUNCTIONS
// ============================================

export async function getProductionHouses(): Promise<ProductionHouse[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/production-houses`, session.access_token);
  return data.productionHouses || [];
}

export async function createProductionHouse(
  accessToken: string,
  house: Omit<ProductionHouse, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProductionHouse> {
  const data = await fetchWithAuth(`${API_BASE}/production-houses`, accessToken, {
    method: 'POST',
    body: JSON.stringify(house),
  });
  return data.productionHouse;
}

export async function updateProductionHouse(
  accessToken: string,
  id: string,
  updates: Partial<Omit<ProductionHouse, 'id' | 'createdAt'>>
): Promise<ProductionHouse> {
  const data = await fetchWithAuth(`${API_BASE}/production-houses/${id}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.productionHouse;
}

export async function updateProductionHouseInventory(
  accessToken: string,
  id: string,
  inventory: ProductionHouse['inventory']
): Promise<ProductionHouse> {
  const data = await fetchWithAuth(`${API_BASE}/production-houses/${id}/inventory`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ inventory }),
  });
  return data.productionHouse;
}

export async function assignProductionHeadToHouse(
  accessToken: string,
  productionHouseId: string,
  productionHeadId: string
): Promise<ProductionHouse> {
  const data = await fetchWithAuth(`${API_BASE}/production-houses/${productionHouseId}/assign-head`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ productionHeadId }),
  });
  return data.productionHouse;
}

export async function assignStoreToProductionHouse(
  accessToken: string,
  storeId: string,
  productionHouseId: string
): Promise<Store> {
  const data = await fetchWithAuth(`${API_BASE}/stores/${storeId}/assign-production-house`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ productionHouseId }),
  });
  return data.store;
}

export async function fixProductionRecords(
  accessToken: string,
  productionHouseId: string,
  oldStoreId: string
): Promise<{ success: boolean; updatedCount: number; message: string }> {
  const data = await fetchWithAuth(`${API_BASE}/production-houses/${productionHouseId}/fix-records`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ oldStoreId }),
  });
  return data;
}

export async function deleteProductionHouse(
  accessToken: string,
  id: string
): Promise<void> {
  await fetchWithAuth(`${API_BASE}/production-houses/${id}`, accessToken, {
    method: 'DELETE',
  });
}

export async function transferInventoryBetweenHouses(
  accessToken: string,
  fromHouseId: string,
  toHouseId: string,
  quantities?: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  }
): Promise<{ fromHouse: ProductionHouse; toHouse: ProductionHouse }> {
  const data = await fetchWithAuth(`${API_BASE}/production-houses/transfer-inventory`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ fromHouseId, toHouseId, quantities }),
  });
  return { fromHouse: data.fromHouse, toHouse: data.toHouse };
}

// ============================================
// STOCK REQUEST API FUNCTIONS
// ============================================

export async function getStockRequests(accessToken: string): Promise<StockRequest[]> {
  const data = await fetchWithAuth(`${API_BASE}/stock-requests`, accessToken);
  return data.stockRequests || [];
}

export async function createStockRequest(
  accessToken: string,
  request: Omit<StockRequest, 'id' | 'fulfilledQuantities' | 'status' | 'fulfilledBy' | 'fulfilledByName' | 'fulfillmentDate' | 'notes'>
): Promise<StockRequest> {
  const data = await fetchWithAuth(`${API_BASE}/stock-requests`, accessToken, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return data.stockRequest;
}

export async function fulfillStockRequest(
  accessToken: string,
  id: string,
  fulfilledQuantities: StockRequest['fulfilledQuantities'],
  fulfilledBy: string,
  fulfilledByName: string,
  notes?: string
): Promise<StockRequest> {
  const data = await fetchWithAuth(`${API_BASE}/stock-requests/${id}/fulfill`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ fulfilledQuantities, fulfilledBy, fulfilledByName, notes }),
  });
  return data.stockRequest;
}

export async function cancelStockRequest(
  accessToken: string,
  id: string
): Promise<StockRequest> {
  const data = await fetchWithAuth(`${API_BASE}/stock-requests/${id}/cancel`, accessToken, {
    method: 'PUT',
  });
  return data.stockRequest;
}

export async function fixStockRequests(accessToken: string): Promise<{ success: boolean; message: string; fixed: any[]; totalChecked: number }> {
  const data = await fetchWithAuth(`${API_BASE}/fix-stock-requests`, accessToken, {
    method: 'POST',
  });
  return data;
}

// ============================================
// STOCK RECALIBRATION API
// ============================================

export type StockRecalibrationData = {
  locationId: string;
  locationType: 'store' | 'production_house';
  locationName: string;
  items: {
    itemId: string;
    itemName: string;
    category: string;
    unit: string;
    systemQuantity: number;
    actualQuantity: number;
    difference: number;
    adjustmentType: 'wastage' | 'counting_error' | null;
    notes: string;
  }[];
};

export async function submitStockRecalibration(accessToken: string, data: StockRecalibrationData) {
  const response = await fetchWithAuth(`${API_BASE}/stock-recalibration`, accessToken, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}

export async function getLastRecalibration(accessToken: string, locationId: string, locationType?: string) {
  // Add cache-busting timestamp to ensure fresh data
  const timestamp = new Date().getTime();
  const url = locationType 
    ? `${API_BASE}/stock-recalibration/latest/${locationId}?locationType=${locationType}&_t=${timestamp}`
    : `${API_BASE}/stock-recalibration/latest/${locationId}?_t=${timestamp}`;
  const response = await fetchWithAuth(url, accessToken);
  return response;
}

// Alias for convenience
export const fetchLatestRecalibration = getLastRecalibration;
export const getRecalibrationByLocation = getLastRecalibration;

export async function getRecalibrationHistory(accessToken: string, locationId: string, locationType?: string) {
  const url = locationType 
    ? `${API_BASE}/stock-recalibration/history/${locationId}?locationType=${locationType}`
    : `${API_BASE}/stock-recalibration/history/${locationId}`;
  const response = await fetchWithAuth(url, accessToken);
  return response;
}

export async function getAllRecalibrationsForApproval(accessToken: string) {
  const response = await fetchWithAuth(`${API_BASE}/stock-recalibration/pending-approval`, accessToken);
  return response;
}

export async function approveRecalibration(accessToken: string, recalibrationId: string) {
  const response = await fetchWithAuth(`${API_BASE}/stock-recalibration/${recalibrationId}/approve`, accessToken, {
    method: 'POST',
  });
  return response;
}

export async function rejectRecalibration(accessToken: string, recalibrationId: string, reason: string) {
  const response = await fetchWithAuth(`${API_BASE}/stock-recalibration/${recalibrationId}/reject`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return response;
}

// ============================================
// ONLINE CASH RECALIBRATION API
// ============================================

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
  discrepancyType?: 'none' | 'mistake' | 'loan';
  loanAmount?: number | null;
};

export async function submitOnlineCashRecalibration(
  accessToken: string, 
  data: Omit<OnlineCashRecalibration, 'id' | 'createdAt'>
) {
  const response = await fetchWithAuth(`${API_BASE}/online-cash-recalibration`, accessToken, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}

export async function getLastOnlineCashRecalibration(accessToken: string, storeId: string) {
  const timestamp = new Date().getTime();
  const response = await fetchWithAuth(
    `${API_BASE}/online-cash-recalibration/latest/${storeId}?_t=${timestamp}`, 
    accessToken
  );
  return response;
}

export async function getOnlineCashRecalibrationHistory(accessToken: string, storeId: string) {
  const response = await fetchWithAuth(
    `${API_BASE}/online-cash-recalibration/history/${storeId}`, 
    accessToken
  );
  return response;
}

// Update an existing online cash recalibration
export async function updateOnlineCashRecalibration(
  accessToken: string,
  recalibrationId: string,
  data: { date?: string; actualBalance?: number; notes?: string; discrepancyType?: string; loanAmount?: number | null }
) {
  const response = await fetchWithAuth(
    `${API_BASE}/online-cash-recalibration/${recalibrationId}`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
  return response;
}

// Delete an online cash recalibration
export async function deleteOnlineCashRecalibration(accessToken: string, recalibrationId: string) {
  const response = await fetchWithAuth(
    `${API_BASE}/online-cash-recalibration/${recalibrationId}`,
    accessToken,
    {
      method: 'DELETE',
    }
  );
  return response;
}

// Fetch all online cash recalibrations (for all stores)
export async function fetchOnlineCashRecalibrations(accessToken: string): Promise<OnlineCashRecalibration[]> {
  const response = await fetchWithAuth(`${API_BASE}/online-cash-recalibration/all`, accessToken);
  return response?.data || [];
}

// ============================================
// ONLINE LOANS (Paytm/Online Cash Loans)
// ============================================

export type OnlineLoan = {
  id: string;
  storeId: string;
  storeName: string;
  loanAmount: number;
  loanDate: string; // Date when loan was taken
  // 'pending' = raised, awaiting cluster-head approval; 'active' = approved and outstanding
  // (added to Paytm on approval); 'repaid' = fully repaid; 'rejected' = declined.
  status: 'pending' | 'active' | 'repaid' | 'rejected';
  repaidAmount: number;
  repaymentDate: string | null; // Date when fully repaid
  // Each repayment on its own date, partial ones included, so Paytm moves on the day the money
  // went out. Missing on loans not repaid since this was added (see loanRepayments in
  // utils/paytmRules.ts for how those are read).
  repayments?: { date: string; amount: number; recordedAt?: string }[];
  notes: string;
  createdBy: string;
  createdAt: string;
  investorId?: string; // ID of the investor who provided the loan
  investorName?: string; // Name of the investor
  interestRate?: number; // Interest rate as percentage (e.g., 5 for 5%)
  repaymentType?: 'partial' | 'full'; // Type of last repayment
  requestedByName?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
};

export async function applyOnlineLoan(
  accessToken: string,
  data: Omit<OnlineLoan, 'id' | 'createdAt' | 'status' | 'repaidAmount' | 'repaymentDate' | 'repaymentType'>
) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans`, accessToken, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.loan;
}

export async function approveOnlineLoan(accessToken: string, loanId: string) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans/${loanId}/approve`, accessToken, {
    method: 'POST',
  });
  return response.loan;
}

export async function rejectOnlineLoan(accessToken: string, loanId: string, reason: string) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans/${loanId}/reject`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return response.loan;
}

export async function getOnlineLoans(accessToken: string, storeId?: string) {
  const url = storeId 
    ? `${API_BASE}/online-loans?storeId=${storeId}`
    : `${API_BASE}/online-loans`;
  const response = await fetchWithAuth(url, accessToken);
  return response.loans || [];
}

export async function repayOnlineLoan(
  accessToken: string,
  loanId: string,
  repaymentData: {
    repaymentAmount: number;
    repaymentDate: string;
    notes?: string;
  }
) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans/${loanId}/repay`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(repaymentData),
  });
  return response.loan;
}

// ============================================
// STOCK THRESHOLD SETTINGS
// ============================================

export async function getStockThresholds(accessToken: string, storeId: string) {
  const response = await fetchWithAuth(`${API_BASE}/stock-thresholds/${storeId}`, accessToken);
  return response.thresholds;
}

export async function saveStockThresholds(accessToken: string, storeId: string, thresholds: any) {
  const response = await fetchWithAuth(`${API_BASE}/stock-thresholds/${storeId}`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ thresholds }),
  });
  return response;
}

// ============================================
// MOMO PLATE CONFIG (pieces + selling price per plate, shared across the business)
// ============================================

export type MomoPlateConfig = Record<string, { piecesPerPlate: number; pricePerPlate: number }>;

export async function getMomoPlateConfig(accessToken: string): Promise<MomoPlateConfig> {
  const response = await fetchWithAuth(`${API_BASE}/momo-plate-config`, accessToken);
  return response.config;
}

export async function saveMomoPlateConfig(accessToken: string, config: MomoPlateConfig): Promise<any> {
  return fetchWithAuth(`${API_BASE}/momo-plate-config`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

// ============================================
// MENU ITEM PRICES (real per-item Offline vs Online price, keyed by Ciferon's ProductId -
// the same ID that appears on Step D's order-item-detail line items)
// ============================================

export type MenuItemPrice = {
  productId: string;
  productName: string;
  momoCategory: string | null;
  piecesPerUnit: number;
  offlinePrice: number;
  onlinePrice: number;
  updatedBy: string;
  updatedAt: string;
};

export async function getMenuItemPrices(accessToken: string): Promise<MenuItemPrice[]> {
  try {
    const data = await fetchWithAuth(`${API_BASE}/menu-item-prices`, accessToken);
    return data.items || [];
  } catch (error) {
    console.error('Error fetching menu item prices:', error);
    return [];
  }
}

export async function saveMenuItemPrice(
  accessToken: string,
  item: Omit<MenuItemPrice, 'updatedBy' | 'updatedAt'>
): Promise<MenuItemPrice> {
  const data = await fetchWithAuth(`${API_BASE}/menu-item-prices`, accessToken, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function getMonthlyWastageReport(accessToken: string, month: string, locationId?: string, locationType?: string) {
  let url = `${API_BASE}/stock-recalibration/wastage-report?month=${month}`;
  if (locationId) {
    url += `&locationId=${locationId}`;
  }
  if (locationType) {
    url += `&locationType=${locationType}`;
  }
  const response = await fetchWithAuth(url, accessToken);
  return response;
}

// ============================================
// CLUSTER MANAGEMENT API
// ============================================

export async function getClusterInfo(accessToken: string) {
  const response = await fetchWithAuth(`${API_BASE}/cluster/info`, accessToken);
  return response;
}

export async function updateClusterAssignments(
  accessToken: string, 
  employeeId: string, 
  managedStoreIds: string[], 
  managedProductionHouseIds: string[]
) {
  const response = await fetchWithAuth(`${API_BASE}/cluster/update-assignments`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ employeeId, managedStoreIds, managedProductionHouseIds }),
  });
  return response;
}

export async function getAllClusterHeads(accessToken: string) {
  const response = await fetchWithAuth(`${API_BASE}/cluster/all-cluster-heads`, accessToken);
  return response;
}

// ============================================
// INVESTOR MANAGEMENT API
// ============================================

export type Investor = {
  id: string;
  name: string;
  contactNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
};

export async function createInvestor(
  accessToken: string,
  data: Omit<Investor, 'id' | 'createdAt'>
) {
  const response = await fetchWithAuth(`${API_BASE}/investors`, accessToken, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.investor;
}

export async function getInvestors(accessToken: string) {
  const response = await fetchWithAuth(`${API_BASE}/investors`, accessToken);
  return response.investors || [];
}

export async function updateInvestor(
  accessToken: string,
  investorId: string,
  data: Partial<Omit<Investor, 'id' | 'createdAt' | 'createdBy'>>
) {
  const response = await fetchWithAuth(`${API_BASE}/investors/${investorId}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.investor;
}

export async function deleteInvestor(accessToken: string, investorId: string) {
  const response = await fetchWithAuth(`${API_BASE}/investors/${investorId}`, accessToken, {
    method: 'DELETE',
  });
  return response;
}

export async function getAllOnlineLoans(accessToken: string) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans/all`, accessToken);
  return response.loans || [];
}

export async function getAllLoanRepayments(accessToken: string) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans/repayments`, accessToken);
  return response.repayments || [];
}

// ============================================
// RIDER TRIPS (production house -> store logistics)
// ============================================

export type RiderTripStatus = 'called' | 'on_the_way' | 'arrived' | 'picked_up' | 'delivered' | 'cancelled';

export type RiderDirection = 'to_store' | 'to_production';
// Production -> store, store -> production, store -> production -> store, or any two places.
export type RiderTripType = 'to_store' | 'to_production' | 'round_trip' | 'custom';

// One place on a ride. A custom stop (e.g. an event stall) carries its own coordinates;
// production/store stops use their map pin.
export interface RiderStop {
  kind: 'production' | 'store' | 'custom';
  id: string | null;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}
export type RiderFareStatus = 'agreed' | 'proposed' | 'needs_rate';

export interface RiderTrip {
  id: string;
  date: string;
  tripNumber: number;
  // 'to_store' = production house -> store; 'to_production' = store -> production house.
  direction: RiderDirection;
  tripType: RiderTripType;
  // The ride's stops in order, and which leg (stop -> next stop) the rider is on (0-based).
  stops: RiderStop[];
  legIndex: number;
  // Set once the receiving end has confirmed the delivery or reported a problem.
  receipt?: { status: 'confirmed' | 'issue'; note: string; byName: string; at: string; requestsDelivered?: number; viaRequests?: boolean } | null;
  // Stock requests this ride carries; confirming the ride's delivery marks them delivered (and
  // marking them delivered in Stock Requests confirms the ride).
  requestIds?: string[];
  productionHouseName: string | null;
  // Fare for the ride: the agreed amount, and (while the rider has asked for a different rate and
  // production hasn't answered) the amount being proposed.
  fare: number;
  defaultFare: number;
  proposedFare: number | null;
  fareStatus: RiderFareStatus;
  riderEmployeeId: string;
  riderName: string;
  storeId: string;
  storeName: string;
  productionHouseId: string | null;
  note: string;
  status: RiderTripStatus;
  calledAt: string;
  calledByName: string;
  onTheWayAt: string | null;
  arrivedAt: string | null;
  readyAt: string | null;
  readyByName: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

async function riderToken(): Promise<string> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

export async function getRiderTrips(date?: string): Promise<{ trips: RiderTrip[]; maxTripsPerDay: number }> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips${date ? `?date=${encodeURIComponent(date)}` : ''}`, token);
  return { trips: data.trips || [], maxTripsPerDay: data.maxTripsPerDay || 4 };
}

export interface RiderListItem {
  employeeId: string;
  name: string;
  available: boolean;
  unavailableReason: string | null;
  defaultRate: number | null;
  aadhaarMasked: string | null;
  aadhaarFull: string | null; // cluster head only
  hasProfile: boolean;
}

// Rides within an inclusive date range (YYYY-MM-DD), for the Past rides view.
export async function getRiderTripsRange(from: string, to: string): Promise<RiderTrip[]> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token);
  return data.trips || [];
}

export async function getRiders(): Promise<RiderListItem[]> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/riders`, token);
  return data.riders || [];
}

export async function callRider(input: {
  riderEmployeeId: string;
  storeId?: string;
  note?: string;
  direction?: RiderDirection;
  tripType?: RiderTripType;
  // For custom rides: where it starts and ends. riderEmployeeId/storeId rules are in the server route.
  pickup?: { kind: 'production' | 'store' | 'custom'; id?: string; name?: string; latitude?: number; longitude?: number };
  drop?: { kind: 'production' | 'store' | 'custom'; id?: string; name?: string; latitude?: number; longitude?: number };
  fare?: number;
  force?: boolean;
  requestIds?: string[];
}): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips`, token, { method: 'POST', body: JSON.stringify(input) });
  return data.trip;
}

export async function markRiderTripReady(id: string): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips/${id}/ready`, token, { method: 'POST' });
  return data.trip;
}

// `override` lets dispatch roles confirm a step for the rider (e.g. the rider's GPS isn't working);
// the server skips the "are you actually there" location check for those and records who did it.
export async function advanceRiderTrip(id: string, status: RiderTripStatus, override = false): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips/${id}/advance`, token, { method: 'POST', body: JSON.stringify({ status, ...(override ? { override: true } : {}) }) });
  return data.trip;
}

// The receiving end confirms the delivery arrived (ok) or reports a problem (with a note).
export async function confirmRiderReceipt(id: string, ok: boolean, note?: string): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips/${id}/receipt`, token, { method: 'POST', body: JSON.stringify({ ok, note }) });
  return data.trip;
}

export async function cancelRiderTrip(id: string): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips/${id}/cancel`, token, { method: 'POST' });
  return data.trip;
}

export interface RiderPin {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RiderMapPlace {
  kind: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface RiderTripLocation {
  status: RiderTripStatus;
  places: RiderMapPlace[];
  // Names of stops with no map location yet (a production house / store that hasn't been pinned).
  missingPins: string[];
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    updatedAt: string;
    track: [number, number, string][];
  } | null;
  production: RiderPin | null;
  store: RiderPin | null;
}

export async function getRiderTripLocation(id: string): Promise<RiderTripLocation> {
  const token = await riderToken();
  return fetchWithAuth(`${API_BASE}/rider/trips/${id}/location`, token);
}

export interface RiderPlace {
  kind: 'production' | 'store';
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  setByName: string | null;
  setAt: string | null;
}

export async function getRiderPlaces(): Promise<RiderPlace[]> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/places`, token);
  return data.places || [];
}

export async function setRiderPlace(input: { kind: 'production' | 'store'; id: string; latitude: number; longitude: number }): Promise<void> {
  const token = await riderToken();
  await fetchWithAuth(`${API_BASE}/rider/places`, token, { method: 'POST', body: JSON.stringify(input) });
}

export async function proposeRiderFare(id: string, amount: number): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips/${id}/fare`, token, { method: 'POST', body: JSON.stringify({ amount }) });
  return data.trip;
}

export async function decideRiderFare(id: string, approve: boolean): Promise<RiderTrip> {
  const token = await riderToken();
  const data = await fetchWithAuth(`${API_BASE}/rider/trips/${id}/fare-decision`, token, { method: 'POST', body: JSON.stringify({ approve }) });
  return data.trip;
}

export type RiderDaySchedule = { enabled: boolean; from: string; to: string };
export type RiderWeekSchedule = Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', RiderDaySchedule>;

export interface RiderProfile {
  name: string;
  aadhaar: string;
  defaultRate: number | null;
  availability: Partial<RiderWeekSchedule> | null;
  unavailableUntil: string | null;
}

export interface RiderProfileResponse {
  profile: RiderProfile;
  available: boolean;
  unavailableReason: string | null;
}

export async function getRiderProfile(): Promise<RiderProfileResponse> {
  const token = await riderToken();
  return fetchWithAuth(`${API_BASE}/rider/profile`, token);
}

export async function saveRiderProfile(input: { name: string; aadhaar: string; defaultRate: number | null; availability: Partial<RiderWeekSchedule> }): Promise<void> {
  const token = await riderToken();
  await fetchWithAuth(`${API_BASE}/rider/profile`, token, { method: 'PUT', body: JSON.stringify(input) });
}

export type RiderUnavailableFor = 'hour' | 'three_hours' | 'rest_of_day' | 'until_back';

export async function setRiderAvailability(input: { unavailable: boolean; duration?: RiderUnavailableFor }): Promise<{ available: boolean; unavailableReason: string | null; unavailableUntil: string | null }> {
  const token = await riderToken();
  return fetchWithAuth(`${API_BASE}/rider/availability`, token, { method: 'POST', body: JSON.stringify(input) });
}

export interface RiderSummary {
  today: { rides: number; earned: number };
  month: { rides: number; earned: number; paid: number; balance: number };
}

export async function getRiderSummary(): Promise<RiderSummary> {
  const token = await riderToken();
  return fetchWithAuth(`${API_BASE}/rider/summary`, token);
}

export interface RiderTripEta {
  leg: 'pickup' | 'drop' | null;
  targetName?: string;
  // Present when no estimate can be given yet.
  unavailable?: 'waiting_for_location' | 'destination_not_pinned';
  distanceMeters?: number;
  etaSeconds?: number;
  etaAt?: string;
  traffic?: { level: 'light' | 'moderate' | 'heavy' | 'unknown'; observedKmh: number | null; freeFlowKmh: number };
  timing?: 'late' | 'early' | 'on_time';
  deltaMinutes?: number;
  expectedMinutes?: number;
  source?: 'osrm' | 'estimate';
}

export async function getRiderTripEta(id: string): Promise<RiderTripEta> {
  const token = await riderToken();
  return fetchWithAuth(`${API_BASE}/rider/trips/${id}/eta`, token);
}

// ---- Password rotation (server: supabase/functions/make-server-c2dd9b9d/passwords.ts) ----

export interface PasswordStatus {
  changedAt: string;
  expiresAt: string;
  // Whole IST calendar days until the expiry day (0 = expires today).
  daysLeft: number;
  mustChange: boolean;
  reason: 'expired' | 'reset' | null;
  changedBy: 'self' | 'owner' | null;
  assumed?: boolean;
}

export async function getPasswordStatus(accessToken: string): Promise<PasswordStatus> {
  return fetchWithAuth(`${API_BASE}/auth/password-status`, accessToken);
}

// Errors carry details.code: WRONG_CURRENT_PASSWORD, WEAK_PASSWORD (with details.problems),
// TOO_MANY_TRIES, AUTH_BUSY or MISSING_FIELDS.
export async function changePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<PasswordStatus & { success: boolean; otherSessionsSignedOut: boolean }> {
  return fetchWithAuth(`${API_BASE}/auth/change-password`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export interface ForcedPasswordReset {
  success: boolean;
  employeeId: string;
  name: string;
  email: string;
  // Shown once to the owner; the server never stores it.
  temporaryPassword: string;
  signedOutEverywhere: boolean;
}

// Owner only: sets a temporary password, signs the person out everywhere and makes them choose a
// new password at their next sign-in.
export async function forcePasswordReset(employeeId: string): Promise<ForcedPasswordReset> {
  return fetchWithAuth(`${API_BASE}/admin/employees/${encodeURIComponent(employeeId)}/force-password-reset`, await currentAccessToken(), {
    method: 'POST',
    cache: 'no-store',
  });
}
