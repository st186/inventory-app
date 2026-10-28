// Emergency contacts (server contacts.ts). Repair people are the technician list (paperworkApi.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type ContactKind = 'helpline' | 'supplier' | 'other';
export interface Entry { id: string; name: string; role?: string; phone: string }
export interface Contact extends Entry { kind: ContactKind; role: string; note?: string }
export interface Supplier extends Entry { vendor?: boolean; vendorKind?: string; kind?: ContactKind; note?: string }
export interface Directory {
  emergency: Entry[]; repairs: Entry[]; helplines: Contact[]; others: Contact[]; suppliers: Supplier[];
  canEdit: boolean; canManageVendors: boolean; canRemoveRepairs: boolean;
}
export type ContactDraft = Pick<Contact, 'kind' | 'name' | 'role' | 'phone' | 'note'>;

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

export const getDirectory = () => call<Directory>('/contacts');
export const addContact = (b: ContactDraft) => call<{ contact: Contact }>('/contacts', { method: 'POST', body: JSON.stringify(b) });
export const updateContact = (id: string, b: ContactDraft) => call<{ contact: Contact }>(`/contacts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) });
export const removeContact = (id: string) => call<{ ok: true }>(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
