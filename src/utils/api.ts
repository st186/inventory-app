import { projectId, publicAnonKey } from './supabase/info';
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