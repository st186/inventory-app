// Repairs, labour and equipment (server expensePaperwork.ts): the technician list, bill photos,
// and the rules the Add expense sheet shows before saving.
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';
import { isEquipmentExpense } from '../../utils/assetRules';

export const BILL_PHOTO_ABOVE = 500;
export const APPROVAL_ABOVE = 2000;
const SERVICE_CATEGORIES = ['repair', 'labour_charge'];

// The entries the bill photo and the owner's OK apply to (same as the server's needsPaperwork).
export function needsPaperwork(source: 'inventory' | 'overhead', item: { category: string; itemName?: string; description?: string }) {
  return (source === 'overhead' && SERVICE_CATEGORIES.includes(item.category)) || isEquipmentExpense(item, source);
}
export const isRepairCategory = (category: string) => category === 'repair';
export const isLabourCategory = (category: string) => category === 'labour_charge';

export interface Technician { id: string; name: string; phone: string; trade: string }
// What a repair or labour entry records (server: entry.repair).
export interface RepairInfo { assetId: string | null; machine: string; fault: string; technicianId: string | null; technicianName: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentAccessToken()}`, ...regionHeaders(), ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('No connection - try again · নেটওয়ার্ক নেই, আবার চেষ্টা করুন');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

export const listTechnicians = () => call<{ technicians: Technician[] }>('/technicians').then((r) => r.technicians);
export const addTechnician = (t: Omit<Technician, 'id'>) => call<{ technician: Technician }>('/technicians', post(t)).then((r) => r.technician);
export const updateTechnician = (id: string, t: Omit<Technician, 'id'>) => call<{ technician: Technician }>(`/technicians/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(t) }).then((r) => r.technician);
export const removeTechnician = (id: string) => call<{ success: boolean }>(`/technicians/${encodeURIComponent(id)}`, { method: 'DELETE' });

// A bill photo is stored first; its path then goes with the expense (or onto a flagged entry).
export const uploadBill = (image: string) => call<{ path: string }>('/expense-bills', post({ image })).then((r) => r.path);
export const billLink = (path: string) => call<{ url: string }>(`/expense-bills/link?path=${encodeURIComponent(path)}`).then((r) => r.url);
export const attachBill = (flagId: string, path: string) => call<{ flag: unknown }>(`/expense-flags/${encodeURIComponent(flagId)}/bill`, post({ path }));
