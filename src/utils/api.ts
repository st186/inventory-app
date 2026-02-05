import { projectId, publicAnonKey } from './supabase/info';
import { getSupabaseClient } from './supabase/client';
import { InventoryItem, OverheadItem, FixedCostItem, SalesData, ProductionData } from '../App';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d`;

// Helper to create Supabase client for browser
function createBrowserSupabase() {
  return getSupabaseClient();
}

// Helper to get current session with automatic token refresh
async function getSession() {
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

async function fetchWithAuth(url: string, accessToken: string, options?: RequestInit) {
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
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
      // Check if this is a warning (non-critical error)
      isWarning = !!error.warning;
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    console.error(`API Error [${url}]:`, errorMessage);
    
    // If unauthorized, force logout (but only once to prevent reload loops)
    if (response.status === 401 && !isHandlingUnauthorized) {
      isHandlingUnauthorized = true;
      console.error('Session expired or invalid. Please log in again.');
      
      // Clear the session
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
      
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
    
    throw new Error(errorMessage);
  }

  const jsonData = await response.json();
  
  // Check for database unavailability warnings in successful responses
  if (jsonData.warning) {
    console.warn(`API Warning [${url}]:`, jsonData.warning);
    // You could emit a toast notification here if needed
  }
  
  return jsonData;
}

export async function fetchInventory(accessToken: string): Promise<InventoryItem[]> {
  const data = await fetchWithAuth(`${API_BASE}/inventory`, accessToken);
  return data.inventory || [];
}

export async function addInventory(accessToken: string, item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
  const data = await fetchWithAuth(`${API_BASE}/inventory`, accessToken, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
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

export async function getNotifications(): Promise<Notification[]> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    // Return empty array instead of throwing error - notifications are non-critical
    return [];
  }
  
  try {
    const data = await fetchWithAuth(`${API_BASE}/notifications`, session.access_token);
    return data.notifications;
  } catch (error) {
    // Return empty array on error (auth failure, network issue, etc.)
    console.log('Unable to fetch notifications:', error instanceof Error ? error.message : 'Unknown error');
    return [];
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
// STORE API
// ============================================

export interface Store {
  id: string;
  name: string;
  location: string;
  managerId: string | null;
  productionHouseId: string | null; // Map store to production house
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

export async function updateStore(storeId: string, name: string, location: string): Promise<Store> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/stores/${storeId}`, session.access_token, {
    method: 'PUT',
    body: JSON.stringify({ name, location }),
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
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'cluster_head';
  managerId?: string;
  clusterHeadId?: string;
  type?: 'full_time' | 'contract';
  joiningDate?: string;
  authUserId?: string;
  createdAt?: string;
  storeId?: string | null;
  designation?: 'store_incharge' | 'production_incharge' | null;
  department?: 'store_operations' | 'production' | null;
  inchargeId?: string;
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
  deducted: boolean;
  deductedDate?: string;
  payoutId?: string;
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
          'Authorization': `Bearer ${publicAnonKey}`
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
      'Authorization': `Bearer ${publicAnonKey}`
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

export async function updateInventoryItem(
  id: string,
  updates: Partial<DynamicInventoryItem>
): Promise<DynamicInventoryItem> {
  const response = await fetch(`${API_BASE}/inventory-items/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`
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
      'Authorization': `Bearer ${publicAnonKey}`
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
      'Authorization': `Bearer ${publicAnonKey}`
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
  approvedBy?: string;
  approvedAt?: string;
}

export interface LeaveApplication {
  id?: string;
  employeeId: string;
  leaveDate: string;
  leaveType?: 'full' | 'half'; // Leave type (optional for backward compatibility)
  isAdvanceLeave?: boolean; // Whether this is an advance leave (borrowed from next month)
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

export async function getLeaveBalance(employeeId: string, joiningDate: string): Promise<number> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/leaves/${employeeId}/balance?joiningDate=${joiningDate}`, session.access_token);
  return data.balance || 0;
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
  createdAt?: string;
}

export async function getCustomItems(): Promise<CustomItem[]> {
  try {
    const response = await fetch(`${API_BASE}/custom-items`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
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

export async function addCustomItem(category: string, itemName: string): Promise<CustomItem> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  const data = await fetchWithAuth(`${API_BASE}/custom-items`, session.access_token, {
    method: 'POST',
    body: JSON.stringify({ category, itemName }),
  });
  return data.customItem;
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
  shippingNotes?: Record<string, string>; // Notes for items with different quantities
  deliveredAt?: string;
  deliveredBy?: string; // Store In-Charge employee ID
  createdAt: string;
  updatedAt: string;
}

export async function fetchProductionRequests(accessToken: string): Promise<ProductionRequest[]> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests`, accessToken);
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
  shippedBy: string
): Promise<ProductionRequest> {
  const data = await fetchWithAuth(`${API_BASE}/production-requests/${id}/ship`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ shippedQuantities, shippingNotes, shippedBy }),
  });
  return data.request;
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

// Convert offline cash to online cash (Paytm)
export async function convertCashToOnline(
  storeId: string,
  date: string,
  amount: number,
  performedBy: string
): Promise<void> {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) throw new Error('Not authenticated');
  
  await fetchWithAuth(`${API_BASE}/cash-conversion`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ storeId, date, amount, performedBy }),
  });
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
  status: 'active' | 'repaid';
  repaidAmount: number;
  repaymentDate: string | null; // Date when fully repaid
  notes: string;
  createdBy: string;
  createdAt: string;
};

export async function applyOnlineLoan(
  accessToken: string,
  data: Omit<OnlineLoan, 'id' | 'createdAt' | 'status' | 'repaidAmount' | 'repaymentDate'>
) {
  const response = await fetchWithAuth(`${API_BASE}/online-loans`, accessToken, {
    method: 'POST',
    body: JSON.stringify(data),
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