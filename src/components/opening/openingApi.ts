// Store opening checklist (server openingChecklist.ts): today's list for whoever opens the store,
// every store's progress for the owner and ops, the day's pick when everyone set up is on leave,
// and who does it.
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export interface OpeningBox { id: string; name: string; nameBn: string; group?: string; groupBn?: string; tick: { at: string; byId: string; byName: string } | null }
export interface OpeningChecklist {
  date: string; storeId: string; storeName: string;
  doerId: string | null; doerName: string; doerAs: 'assignee' | 'cover' | 'backup' | 'picked' | null; dueBy: string;
  assigneeName: string; coverName: string;
  items: OpeningBox[]; done: number; total: number; score: number | null;
  needsPick?: boolean;
  /** Set up to start on this later day (the owner and ops see it before then). */
  startsOn?: string;
}
export interface OpeningTemplate { storeId: string; assigneeId: string | null; coverId: string | null; backupId: string | null; dueBy: string; coverDueBy: string; startedOn: string }
export interface OpeningSetup {
  templates: OpeningTemplate[];
  stores: { id: string; name: string }[];
  people: { id: string; name: string }[];
  history: Record<string, { date: string; doerName: string; score: number | null; done: number; total: number }[]>;
}

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

export const getOpeningToday = () => call<{ date: string; mine: OpeningChecklist[]; overview?: OpeningChecklist[] }>('/opening-checklist/today');
export const tickOpening = (storeId: string, itemId: string, done: boolean) =>
  call<{ checklist: OpeningChecklist }>('/opening-checklist/tick', { method: 'POST', body: JSON.stringify({ storeId, itemId, done }) }).then((r) => r.checklist);
export const pickOpening = (storeId: string, employeeId: string) =>
  call<{ checklist: OpeningChecklist }>('/opening-checklist/pick', { method: 'POST', body: JSON.stringify({ storeId, employeeId }) }).then((r) => r.checklist);
export const getOpeningSetup = () => call<OpeningSetup>('/opening-checklist/setup');
export const saveOpeningSetup = (t: Omit<OpeningTemplate, 'startedOn'>) =>
  call<{ template: OpeningTemplate }>('/opening-checklist/setup', { method: 'PUT', body: JSON.stringify(t) }).then((r) => r.template);
