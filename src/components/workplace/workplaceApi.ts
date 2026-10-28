// Calls for Workplace checks (server workplace.ts). Kept beside the screens rather than in
// utils/api.ts so this feature stays in its own files. Every call uses the current session token
// (refreshed by the Supabase client), since photo uploads can come long after the screen opened.
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type LocationKind = 'store' | 'production';
export type CheckStatus = 'done' | 'done_late' | 'upcoming' | 'due' | 'late' | 'missed';
export type AiStatus = 'pending' | 'scored' | 'failed' | 'off';
export type AiVerdict = 'clean' | 'needs_cleaning' | 'unclear_photo';

export interface WorkplaceFlag { status: 'ok' | 'needs_cleaning'; note: string; by: string; at: string; auto?: boolean; fixedAt?: string }

// One photo of a check. A check can hold several (walls, shelves, stacks of crates); the check's
// own AI fields are the worst of them.
export interface CheckPhoto {
  id: string; uploadedAt: string; aiStatus: AiStatus; aiScore: number | null; aiVerdict: AiVerdict | null;
  aiIssues: string[]; aiIssuesBengali: string[]; aiShown: string; aiSevere: boolean;
}
export const MAX_PHOTOS = 6; // per check, as the server allows (workplace.ts)

// What a screen gets about a photo (no storage ids).
export interface PhotoView {
  hasPhoto: boolean;
  uploadedAt?: string;
  late?: boolean;
  retakes?: number;
  onBehalf?: boolean;
  uploadedByName?: string;
  flag?: WorkplaceFlag | null;
  aiStatus?: AiStatus;
  aiScore?: number | null;
  aiVerdict?: AiVerdict | null;
  aiIssues?: string[];
  aiIssuesBengali?: string[];
  aiShown?: string;
  photos?: CheckPhoto[];
}

// The check's photos; a server from before several were allowed sends none, so its one photo stands in.
export function photosOfView(v: PhotoView): CheckPhoto[] {
  if (v.photos?.length) return v.photos;
  if (!v.hasPhoto) return [];
  return [{ id: 'p0', uploadedAt: v.uploadedAt || '', aiStatus: v.aiStatus || 'off', aiScore: v.aiScore ?? null, aiVerdict: v.aiVerdict ?? null, aiIssues: v.aiIssues || [], aiIssuesBengali: v.aiIssuesBengali || [], aiShown: v.aiShown || '', aiSevere: false }];
}

// coverId: who takes the photo on a day the assignee is on leave (empty: their incharge, or someone else there).
// from: the first day it's due (a check added after the day's window starts the next day).
export interface TemplateItem { id: string; name: string; nameBn: string; hint?: string; assigneeId: string | null; coverId?: string | null; start: string; end: string; days: number[]; from?: string }

export interface MyCheck extends PhotoView {
  id: string; name: string; nameBn: string; hint?: string; start: string; end: string;
  locationKind: LocationKind; locationId: string; locationName: string; status: CheckStatus;
  coveringForName?: string; // standing in for someone on leave
}
export interface MyChecks { date: string; earlyMinutes: number; employeeId?: string; items: MyCheck[] }

export interface WorkplaceLocation { kind: LocationKind; id: string; name: string }
export interface WorkplaceSettings { aiEnabled: boolean; aiThreshold: number }
export interface WorkplaceAccess {
  canSetup: boolean;
  locations: WorkplaceLocation[];
  settings: WorkplaceSettings;
  storage?: 'drive' | 'bucket';
  aiConfigured?: boolean;
}

export interface Person { id: string; name: string; designation: string | null; here: boolean }
export interface TemplateResponse { template: { items: TemplateItem[]; updatedAt?: string; updatedBy?: string }; isDefault: boolean; people?: Person[] }

export interface ReviewItem extends PhotoView {
  date: string; employeeId: string; personName: string; itemId: string; name: string; nameBn: string; hint: string;
  start: string; end: string; status: CheckStatus;
  coveringForName?: string;
}
export interface ReviewResponse { from: string; to: string; location: WorkplaceLocation; items: ReviewItem[] }

export interface SummaryPerson { employeeId: string; name: string; required: number; done: number; onTime: number; needsCleaning: number; avgScore: number | null }
export interface SummaryResponse { from: string; to: string; people: SummaryPerson[] }

async function call<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentAccessToken()}`, ...regionHeaders(), ...(init?.headers || {}) },
    });
  } catch {
    // One retry for reads on a network blip (cold start, patchy mobile data).
    if (retry && (!init?.method || init.method === 'GET')) return call<T>(path, init, false);
    throw new Error('No connection - try again · নেটওয়ার্ক নেই, আবার চেষ্টা করুন');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (retry && res.status >= 500 && (!init?.method || init.method === 'GET')) return call<T>(path, init, false);
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

const q = (params: Record<string, string | undefined>) =>
  Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export const getAccess = () => call<WorkplaceAccess>('/workplace/locations');
export const saveSettings = (s: Partial<WorkplaceSettings>) => call<{ settings: WorkplaceSettings }>('/workplace/settings', { method: 'PUT', body: JSON.stringify(s) });
export const getTemplate = (kind: LocationKind, id: string) => call<TemplateResponse>(`/workplace/template?${q({ kind, id })}`);
export const saveTemplate = (kind: LocationKind, id: string, items: TemplateItem[]) =>
  call<TemplateResponse>(`/workplace/template?${q({ kind, id })}`, { method: 'PUT', body: JSON.stringify({ items }) });
export const getMyChecks = () => call<MyChecks>('/workplace/my');
// add: another photo next to the ones already sent; replacePhotoId: a retake of that one. The
// answer comes once the photo is saved - the AI looks at it afterwards.
export const uploadPhoto = (p: { itemId: string; image: string; thumb?: string; forEmployeeId?: string; add?: boolean; replacePhotoId?: string }) =>
  call<{ success: boolean; flagged: boolean; item: MyCheck }>('/workplace/upload', { method: 'POST', body: JSON.stringify(p) });
export const removePhoto = (p: { itemId: string; photoId: string; forEmployeeId?: string }) =>
  call<{ success: boolean; item: MyCheck }>('/workplace/photo-remove', { method: 'POST', body: JSON.stringify(p) });
export const rescorePhoto = (p: { date: string; employeeId: string; itemId: string; photoId?: string }) =>
  call<PhotoView & { success: boolean; flagged: boolean }>('/workplace/rescore', { method: 'POST', body: JSON.stringify(p) });
export const getReview = (kind: LocationKind, id: string, from: string, to: string) => call<ReviewResponse>(`/workplace/review?${q({ kind, id, from, to })}`);
export const setFlag = (p: { date: string; employeeId: string; itemId: string; status: 'ok' | 'needs_cleaning'; note: string }) =>
  call<{ success: boolean; flag: WorkplaceFlag }>('/workplace/flag', { method: 'POST', body: JSON.stringify(p) });
export const getSummary = (kind: LocationKind, id: string) => call<SummaryResponse>(`/workplace/summary?${q({ kind, id })}`);
// Garbage dumps and filth the AI found in the last three days, still not cleaned or marked OK.
export interface WorkplaceAlert { date: string; employeeId: string; personName: string; itemId: string; name: string; locationKind: LocationKind; locationId: string; locationName: string; aiScore: number | null; issues: string[]; uploadedAt: string }
export const getAlerts = () => call<{ alerts: WorkplaceAlert[] }>('/workplace/alerts');

// Photos come through the server with the sign-in token (no public links), so an <img> can't load
// them directly: fetch as a blob and hand back an object URL. Thumbnails are cached for the session.
const blobCache = new Map<string, Promise<string>>();
export function photoPath(date: string, employeeId: string, itemId: string, thumb: boolean, photoId?: string) {
  const query = q({ size: thumb ? 'thumb' : undefined, photo: photoId });
  return `/workplace/photo/${date}/${encodeURIComponent(employeeId)}/${encodeURIComponent(itemId)}${query ? `?${query}` : ''}`;
}
export function loadPhotoUrl(path: string, version = ''): Promise<string> {
  const key = `${path}#${version}`;
  const hit = blobCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${await currentAccessToken()}`, ...regionHeaders() } });
    if (!res.ok) throw new Error(res.status === 404 ? 'Photo no longer kept' : 'Could not load the photo');
    return URL.createObjectURL(await res.blob());
  })();
  p.catch(() => blobCache.delete(key));
  blobCache.set(key, p);
  // Keep memory bounded on long gallery sessions.
  if (blobCache.size > 400) {
    const oldest = blobCache.keys().next().value as string;
    blobCache.get(oldest)?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    blobCache.delete(oldest);
  }
  return p;
}
