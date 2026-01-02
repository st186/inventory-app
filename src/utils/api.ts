import { projectId, publicAnonKey } from './supabase/info';
import { getSupabaseClient } from './supabase/client';
import { InventoryItem, OverheadItem, FixedCostItem, SalesData, ProductionData } from '../App';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d`;

// Helper to create Supabase client for browser
function createBrowserSupabase() {
  return getSupabaseClient();
}

// Helper to get current session
async function getSession() {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

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
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    console.error(`API Error [${url}]:`, errorMessage);
    
    // If unauthorized, force logout
    if (response.status === 401) {
      console.error('Session expired or invalid. Please log in again.');
      // Clear the session
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
      // Reload the page to show login screen
      window.location.reload();
    }
    
    throw new Error(errorMessage);
  }

  return response.json();
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
  status: 'pending' | 'accepted' | 'in-preparation' | 'prepared' | 'shipped' | 'delivered';
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