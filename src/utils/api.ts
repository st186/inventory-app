import { projectId, publicAnonKey } from './supabase/info';
import { getSupabaseClient } from './supabase/client';
import { InventoryItem, OverheadItem, SalesData } from '../App';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d`;

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
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
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

export async function clearAllData(accessToken: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/clear-data`, accessToken, {
    method: 'DELETE',
  });
}

// Employee Management
export async function getEmployees(): Promise<any[]> {
  console.log('API: Fetching employees...');
  const response = await fetch(`${API_BASE}/employees`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  console.log('API: getEmployees response status:', response.status);
  
  if (!response.ok) {
    console.error('API: Failed to fetch employees');
    throw new Error('Failed to fetch employees');
  }
  
  const data = await response.json();
  console.log('API: getEmployees raw response:', data);
  console.log('API: getEmployees employees array:', data.employees);
  return data.employees || [];
}

export async function addEmployee(employee: any) {
  console.log('API: addEmployee called with:', employee);
  const response = await fetch(`${API_BASE}/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(employee),
  });
  
  console.log('API: addEmployee response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API: addEmployee error:', errorText);
    throw new Error('Failed to add employee');
  }
  
  const result = await response.json();
  console.log('API: addEmployee result:', result);
  return result;
}

export async function updateEmployee(id: string, updates: any) {
  console.log('API: updateEmployee called with id:', id);
  console.log('API: updateEmployee updates:', updates);
  
  const response = await fetch(`${API_BASE}/employees/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(updates),
  });
  
  console.log('API: updateEmployee response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API: updateEmployee error response:', errorText);
    
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(`Failed to update employee: ${errorJson.error || errorText}`);
    } catch (parseError) {
      throw new Error(`Failed to update employee: ${errorText}`);
    }
  }
  
  const result = await response.json();
  console.log('API: updateEmployee success result:', result);
  return result;
}

export async function deleteEmployee(id: string) {
  const response = await fetch(`${API_BASE}/employees/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete employee');
  }
  
  return response.json();
}

// Payout Management
export async function getPayouts(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/payouts`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch payouts');
  }
  
  const data = await response.json();
  return data.payouts || [];
}

export async function addPayouts(payouts: any[]): Promise<any> {
  console.log('API: addPayouts called with:', payouts);
  
  const response = await fetch(`${API_BASE}/payouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ payouts }),
  });
  
  console.log('API: Response status:', response.status);
  
  const responseData = await response.json();
  console.log('API: Response data:', responseData);
  
  if (!response.ok) {
    console.error('API: Failed to add payouts:', responseData);
    throw new Error(responseData.error || 'Failed to add payouts');
  }
  
  return responseData;
}

export async function updatePayout(id: string, updates: any) {
  const response = await fetch(`${API_BASE}/payouts/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update payout');
  }
  
  return response.json();
}

export async function deletePayout(id: string) {
  const response = await fetch(`${API_BASE}/payouts/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete payout');
  }
  
  return response.json();
}

// Item Sales Management
export async function getItemSalesData(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/item-sales`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch item sales data');
  }
  
  const data = await response.json();
  return data.itemSales || [];
}

export async function uploadItemSalesData(salesData: any[], period: string): Promise<any> {
  const response = await fetch(`${API_BASE}/item-sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ salesData, period }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Upload error response:', errorData);
    throw new Error(errorData.error || errorData.details || 'Failed to upload item sales data');
  }
  
  return response.json();
}

export async function clearItemSalesData(): Promise<void> {
  const response = await fetch(`${API_BASE}/item-sales`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to clear item sales data');
  }
}

// Timesheet Management
export async function getTimesheets(employeeId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE}/timesheets/${employeeId}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch timesheets');
  }
  
  const data = await response.json();
  return data.timesheets || [];
}

export async function saveTimesheet(timesheet: any): Promise<any> {
  const response = await fetch(`${API_BASE}/timesheets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(timesheet),
  });
  
  if (!response.ok) {
    throw new Error('Failed to save timesheet');
  }
  
  return response.json();
}

export async function saveTimesheetBulk(timesheets: any[]): Promise<any> {
  const response = await fetch(`${API_BASE}/timesheets/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ timesheets }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to save timesheets');
  }
  
  return response.json();
}

export async function approveTimesheet(timesheetId: string, managerId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/timesheets/${timesheetId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ managerId }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to approve timesheet');
  }
  
  return response.json();
}

export async function rejectTimesheet(timesheetId: string, managerId: string, reason: string): Promise<any> {
  const response = await fetch(`${API_BASE}/timesheets/${timesheetId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ managerId, reason }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to reject timesheet');
  }
  
  return response.json();
}

// Leave Management
export async function getLeaves(employeeId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE}/leaves/${employeeId}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch leaves');
  }
  
  const data = await response.json();
  return data.leaves || [];
}

export async function getLeaveBalance(employeeId: string, joiningDate: string): Promise<number> {
  const response = await fetch(`${API_BASE}/leaves/${employeeId}/balance?joiningDate=${joiningDate}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch leave balance');
  }
  
  const data = await response.json();
  return data.balance || 0;
}

export async function applyLeave(leave: any): Promise<any> {
  const response = await fetch(`${API_BASE}/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(leave),
  });
  
  if (!response.ok) {
    throw new Error('Failed to apply leave');
  }
  
  return response.json();
}

export async function approveLeave(leaveId: string, managerId: string, managerName: string): Promise<any> {
  const response = await fetch(`${API_BASE}/leaves/${leaveId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ managerId, managerName }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to approve leave');
  }
  
  return response.json();
}

export async function rejectLeave(leaveId: string, managerId: string, managerName: string, reason: string): Promise<any> {
  const response = await fetch(`${API_BASE}/leaves/${leaveId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({ managerId, managerName, reason }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to reject leave');
  }
  
  return response.json();
}

// ===== Unified Employee Management API =====

export async function getAllEmployees(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/unified-employees`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch employees');
  }
  
  const data = await response.json();
  return data.employees || [];
}

export async function createUnifiedEmployee(employee: any): Promise<any> {
  const response = await fetch(`${API_BASE}/unified-employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(employee),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create employee');
  }
  
  return response.json();
}

// Alias for createUnifiedEmployee for backward compatibility
export async function createEmployee(employee: any): Promise<any> {
  return createUnifiedEmployee(employee);
}

export async function deleteUnifiedEmployee(employeeId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/unified-employees/${employeeId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete employee');
  }
  
  return response.json();
}

export async function updateUnifiedEmployee(employeeId: string, updates: any): Promise<any> {
  console.log('API: updateUnifiedEmployee called with employeeId:', employeeId);
  console.log('API: updateUnifiedEmployee updates:', updates);
  console.log('API: API_BASE:', API_BASE);
  console.log('API: Full URL:', `${API_BASE}/unified-employees/${employeeId}`);
  
  const response = await fetch(`${API_BASE}/unified-employees/${employeeId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(updates),
  });
  
  console.log('API: updateUnifiedEmployee response status:', response.status);
  console.log('API: updateUnifiedEmployee response ok:', response.ok);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API: updateUnifiedEmployee error response:', errorText);
    
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(`Failed to update employee: ${errorJson.error || errorJson.details || errorText}`);
    } catch (parseError) {
      throw new Error(`Failed to update employee: ${errorText}`);
    }
  }
  
  const result = await response.json();
  console.log('API: updateUnifiedEmployee success result:', result);
  return result;
}

export async function getEmployeesByManager(managerId: string): Promise<any[]> {
  console.log('API: getEmployeesByManager called with managerId:', managerId);
  
  const response = await fetch(`${API_BASE}/unified-employees/manager/${managerId}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });
  
  console.log('API: getEmployeesByManager response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API: getEmployeesByManager error:', errorText);
    throw new Error('Failed to fetch employees by manager');
  }
  
  const data = await response.json();
  console.log('API: getEmployeesByManager response data:', data);
  console.log('API: getEmployeesByManager employees array:', data.employees);
  
  return data.employees || [];
}

export async function getManagersByClusterHead(clusterHeadId: string) {
  console.log('API: Fetching managers for cluster head:', clusterHeadId);
  const response = await fetch(`${API_BASE}/unified-employees/cluster-head/${clusterHeadId}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`
    }
  });
  console.log('API: getManagersByClusterHead response status:', response.status);
  const data = await response.json();
  console.log('API: getManagersByClusterHead response data:', data);
  return data.managers || [];
}

// Assign manager to employee
export async function assignManagerToEmployee(employeeId: string, managerId: string) {
  const session = await getSupabaseClient().auth.getSession();
  const accessToken = session.data.session?.access_token;
  
  console.log('API: Assigning manager', managerId, 'to employee', employeeId);
  
  const response = await fetch(`${API_BASE}/unified-employees/${employeeId}/assign-manager`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ managerId })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign manager');
  }
  
  const data = await response.json();
  console.log('API: Manager assignment successful');
  return data.employee;
}

// Assign cluster head to manager
export async function assignClusterHeadToManager(managerId: string, clusterHeadId: string) {
  const session = await getSupabaseClient().auth.getSession();
  const accessToken = session.data.session?.access_token;
  
  console.log('API: Assigning cluster head', clusterHeadId, 'to manager', managerId);
  
  const response = await fetch(`${API_BASE}/unified-employees/${managerId}/assign-cluster-head`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ clusterHeadId })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign cluster head');
  }
  
  const data = await response.json();
  console.log('API: Cluster head assignment successful');
  return data.manager;
}

// Get organizational hierarchy
export async function getOrganizationalHierarchy() {
  const session = await getSupabaseClient().auth.getSession();
  const accessToken = session.data.session?.access_token;
  
  console.log('API: Fetching organizational hierarchy');
  
  const response = await fetch(`${API_BASE}/organizational-hierarchy`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch organizational hierarchy');
  }
  
  const data = await response.json();
  console.log('API: Organizational hierarchy fetched:', data);
  return data;
}

// Get all cluster heads
export async function getAllClusterHeads() {
  const session = await getSupabaseClient().auth.getSession();
  const accessToken = session.data.session?.access_token;
  
  console.log('API: Fetching all cluster heads');
  
  const response = await fetch(`${API_BASE}/cluster-heads`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch cluster heads');
  }
  
  const data = await response.json();
  console.log('API: Cluster heads fetched:', data);
  return data.clusterHeads || [];
}

// Delete cluster head by email
export async function deleteClusterHeadByEmail(email: string) {
  console.log('API: Deleting cluster head with email:', email);
  
  const response = await fetch(`${API_BASE}/cluster-heads/by-email/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete cluster head');
  }
  
  const data = await response.json();
  console.log('API: Cluster head deleted:', data);
  return data;
}