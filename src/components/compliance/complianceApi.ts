// Compliance calendar (server compliance.ts): licences, safety checks and certificates with due dates.
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type Repeat = 'none' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'two_yearly';
export type Kind = 'licence' | 'safety' | 'hygiene' | 'staff' | 'tax' | 'property' | 'other';
export interface Done { date: string; by: string; note?: string; photoPath?: string; at: string }
export interface Item {
  id: string; starter?: string; title: string; kind: Kind; place: string; dueDate: string | null; repeat: Repeat;
  handledBy?: string; notes?: string; history: Done[]; createdBy: string; createdAt: string; updatedAt: string;
  daysLeft: number | null;
}
export interface Starter { key: string; title: string; kind: Kind; repeat: Repeat; hint: string }
export interface Calendar { today: string; items: Item[]; starters: Starter[] }
export type Draft = { title: string; kind: Kind; place: string; dueDate: string; repeat: Repeat; handledBy?: string; notes?: string; starter?: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentAccessToken()}`, ...regionHeaders(), ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('No connection - try again');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const getCalendar = () => call<Calendar>('/compliance');
export const addItem = (b: Draft) => call<{ item: Item }>('/compliance', { method: 'POST', body: JSON.stringify(b) });
export const updateItem = (id: string, b: Draft) => call<{ item: Item }>(`/compliance/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) });
export const removeItem = (id: string) => call<{ ok: true }>(`/compliance/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const markDone = (id: string, b: { date: string; note?: string; photoPath?: string }) =>
  call<{ item: Item }>(`/compliance/${encodeURIComponent(id)}/done`, { method: 'POST', body: JSON.stringify(b) });

export const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'half_yearly', label: 'Every 6 months' },
  { value: 'yearly', label: 'Every year' },
  { value: 'two_yearly', label: 'Every 2 years' },
  { value: 'none', label: 'Once' },
];
export const KINDS: { value: Kind; label: string }[] = [
  { value: 'licence', label: 'Licence' },
  { value: 'safety', label: 'Safety' },
  { value: 'hygiene', label: 'Hygiene' },
  { value: 'staff', label: 'Staff' },
  { value: 'tax', label: 'Tax' },
  { value: 'property', label: 'Property' },
  { value: 'other', label: 'Other' },
];
