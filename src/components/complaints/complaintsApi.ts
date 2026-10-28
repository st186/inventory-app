// Customer complaints (server complaints.ts): log one with photos, Bunny's reading of it, asking
// people to explain, their explanations, and the owner's decision.
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { getSupabaseClient } from '../../utils/supabase/client';
import { regionHeaders } from '../../utils/http';

export type ComplaintSource = 'zomato' | 'swiggy' | 'google' | 'walk_in' | 'phone' | 'other';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type LikelySource = 'production' | 'store' | 'delivery' | 'unclear';
export type PlaceHygiene = { photos: number; avgScore: number | null; needsCleaning: number; severe: number; worst: string[] };
export interface Complaint {
  id: string; createdAt: string; createdBy: string; source: ComplaintSource; rating: number | null; orderDate: string; storeId: string;
  customerText: string; ownerNote: string; photoUrls: (string | null)[];
  status: 'open' | 'awaiting' | 'closed';
  evidence: {
    storeName: string; storeHygiene: PlaceHygiene; productionHygiene: PlaceHygiene;
    ledgerDays: { date: string; carriedOver: string[]; leftoverReasons: string[]; lateCheck: number }[];
    productionChecks: string[]; machines: string[];
    storeOnShift: { id: string; name: string }[]; productionOnShift: { id: string; name: string }[];
  };
  ai: {
    status: 'done' | 'failed'; summary?: string; issues?: { kind: string; note: string }[]; severity?: Severity; likelySource?: LikelySource;
    confidence?: 'low' | 'medium' | 'high'; reasoning?: string; questionsForStaff?: string[]; recommendedActions?: string[]; error?: string;
  };
  proposed: { id: string; name: string; why: string }[];
  asked: { id: string; name: string; askedAt: string }[];
  explanations: Record<string, { text: string; at: string; name: string }>;
  decision?: { upheld: boolean; penalties: Record<string, number>; note: string; by: string; at: string };
}

async function call<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const token = await currentAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...regionHeaders(), ...(init?.headers || {}) },
  });
  if (res.status === 401 && !retried) {
    await getSupabaseClient().auth.refreshSession().catch(() => null);
    return call<T>(path, init, true);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

export const listComplaints = () => call<{ complaints: Complaint[]; canManage: boolean; me: string | null }>('/complaints');
export const createComplaint = (b: { source: ComplaintSource; rating: number | null; orderDate: string; storeId: string; customerText: string; ownerNote: string; photos: string[] }) =>
  call<{ complaint: Complaint }>('/complaints', post(b)).then((r) => r.complaint);
export const analyseAgain = (id: string) => call<{ complaint: Complaint }>(`/complaints/${encodeURIComponent(id)}/analyse`, post({})).then((r) => r.complaint);
export const askToExplain = (id: string, employeeIds: string[], note?: string) =>
  call<{ complaint: Complaint }>(`/complaints/${encodeURIComponent(id)}/ask`, post({ employeeIds, note })).then((r) => r.complaint);
export const explain = (id: string, text: string) => call<{ ok: boolean }>(`/complaints/${encodeURIComponent(id)}/explain`, post({ text }));
export const decide = (id: string, b: { upheld: boolean; penalties: Record<string, number>; note: string }) =>
  call<{ complaint: Complaint }>(`/complaints/${encodeURIComponent(id)}/decide`, post(b)).then((r) => r.complaint);

export const SOURCE_LABEL: Record<ComplaintSource, string> = { zomato: 'Zomato', swiggy: 'Swiggy', google: 'Google review', walk_in: 'Walk-in', phone: 'Phone call', other: 'Other' };
export const ISSUE_LABEL: Record<string, string> = {
  foreign_object: 'Foreign object', hair: 'Hair', insect_pest: 'Insect / pest', raw_undercooked: 'Raw / undercooked', rotten_spoiled: 'Rotten / spoiled',
  foul_smell: 'Foul smell', unclean_premises: 'Unclean place', unclean_packaging: 'Dirty packaging', cold_food: 'Cold food', taste_quality: 'Taste / quality',
  wrong_missing_item: 'Wrong / missing item', staff_behaviour: 'Staff behaviour', delay: 'Delay', other: 'Other',
};
export const SOURCE_PLACE: Record<LikelySource, string> = { production: 'Production house', store: 'Store', delivery: 'Delivery', unclear: 'Not clear' };
export const PENALTY_BY_SEVERITY: Record<Severity, number> = { low: 5, medium: 10, high: 20, critical: 30 };
export const headline = (c: Complaint) => `${c.rating ? `${c.rating}★ ` : ''}${SOURCE_LABEL[c.source] || 'Customer'}`;
