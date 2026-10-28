// Surprise audits (server siteAudits.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type Verdict = 'ok' | 'issue' | 'na';
export type AuditStatus = 'assigned' | 'in_progress' | 'submitted' | 'reported' | 'cancelled';
export interface AuditPhoto { path: string; at: string }
export interface AuditSummary {
  id: string; placeKind: 'store' | 'production'; placeName: string; auditorName: string; byOwner: boolean;
  from: string; to: string; payout: number; status: AuditStatus; startedAt?: string; submittedAt?: string;
  checked: number; total: number; problems: number; score: number | null; rating: string | null;
  paid: { at: string; amount: number; by?: string } | null;
}
export interface AuditReport {
  status: 'pending' | 'done' | 'failed'; at?: string; error?: string;
  score?: number; rating?: 'good' | 'fair' | 'poor' | 'critical'; summary?: string; goodPoints?: string[];
  problems?: { section: string; item: string; severity: 'low' | 'medium' | 'high' | 'critical'; note: string }[];
  actions?: { action: string; who: string; byWhen: string }[];
}
export interface Audit {
  id: string; placeKind: 'store' | 'production'; placeId: string; placeName: string; auditorName: string; byOwner: boolean;
  from: string; to: string; payout: number; notes: string; status: AuditStatus;
  items: { id: string; section: string; text: string }[];
  results: Record<string, { verdict?: Verdict; note?: string; photos?: AuditPhoto[]; at?: string }>;
  observations: { id: string; note: string; photos: AuditPhoto[]; at: string }[];
  createdBy: string; createdAt: string; startedAt?: string; startGeo?: { distanceM: number | null; atPlace: boolean | null };
  submittedAt?: string; report?: AuditReport; paid?: { at: string; by: string; amount: number } | null;
  photoLinks: Record<string, string>;
}
export interface AuditList {
  audits: AuditSummary[]; canManage: boolean; isOwner?: boolean;
  places?: { kind: 'store' | 'production'; id: string; name: string }[];
  auditors?: { id: string; name: string; phone: string }[];
}

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
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body ?? {}) });
const at = (id: string, what: string) => `/site-audits/${encodeURIComponent(id)}/${what}`;

export const listAudits = () => call<AuditList>('/site-audits');
export const getAudit = (id: string) => call<{ audit: Audit; canManage: boolean; canRun: boolean }>(`/site-audits/${encodeURIComponent(id)}`);
export const createAudit = (b: { placeKind: string; placeId: string; auditorId: string; from: string; to: string; payout: number; notes: string; extraItems: string[] }) =>
  call<{ audit: AuditSummary }>('/site-audits', post(b)).then((r) => r.audit);
export const addAuditor = (b: { name: string; email: string; phone: string; password: string }) => call<{ auditor: { id: string; name: string } }>('/site-audits/auditors', post(b));
export const cancelAudit = (id: string) => call<{ audit: AuditSummary }>(at(id, 'cancel'), post({}));
export const startAudit = (id: string, pos: { lat: number; lng: number } | null) =>
  call<{ audit: Audit }>(at(id, 'start'), post(pos ? { latitude: pos.lat, longitude: pos.lng } : {})).then((r) => r.audit);
export const saveItem = (id: string, itemId: string, patch: { verdict?: Verdict; note?: string }) => call<{ result: Audit['results'][string] }>(at(id, 'item'), post({ itemId, ...patch }));
export const addObservation = (id: string, note: string) => call<{ observation: Audit['observations'][number] }>(at(id, 'observation'), post({ note })).then((r) => r.observation);
export const addPhoto = (id: string, target: string, image: string) => call<{ photo: AuditPhoto; url: string | null }>(at(id, 'photo'), post({ target, image }));
export const submitAudit = (id: string) => call<{ audit: AuditSummary }>(at(id, 'submit'), post({}));
export const rewriteReport = (id: string) => call<{ audit: Audit }>(at(id, 'report'), post({})).then((r) => r.audit);
export const markPaid = (id: string, amount: number) => call<{ audit: AuditSummary }>(at(id, 'paid'), post({ amount }));
