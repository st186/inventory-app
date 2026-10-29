// Cameras: PPE checks in working hours and unauthorised entry after them (server cctv.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type PpeItem = 'cap' | 'gloves' | 'apron';
export type Camera = {
  id: string; name: string; placeKind: 'production' | 'store'; placeId: string; place: string; checks: PpeItem[];
  from: string; to: string; everyMin: number; active: boolean; afterHours?: boolean; keyHint: string; online: boolean; lastSeenAt?: string;
  week: { checks: number; alerts: number; falseAlarms: number; unmarked: number };
  lastCheck: { at: string; kind: string; peopleCount: number; alert: string | null; note: string } | null;
};
export type Alert = {
  id: string; cameraId: string; cameraName: string; kind: 'ppe' | 'intruder'; at: string; text: string; note: string;
  peopleCount: number; onShift?: string[]; seen?: string[]; unknownFaces?: number; photoUrl: string | null; mark?: 'correct' | 'false' | 'staff'; markedBy?: string;
};
// Kitchen activity (server cctv.ts + activityRules.ts).
export type PersonRow = {
  slot: string; name: string | null; minutes: Record<string, number>; seenMinutes: number; foldingMinutes: number;
  phoneMinutes: number; phoneTimes: number; idleMinutes: number; ppePercent: number | null; first: string; last: string;
};
export type KitchenTotals = { foldingHours: number; phoneMinutes: number; idleMinutes: number; piecesMade: number; piecesPerFoldingHour: number | null; stills: number };
export type Activity = {
  from: string; to: string; labels: Record<string, string>;
  cameras: { camera: { id: string; name: string; everyMin: number; place: string }; people: PersonRow[]; kitchen: KitchenTotals; perDay: (KitchenTotals & { date: string })[] }[];
};
export type WhoIs = {
  date: string; staff: string[];
  cameras: { cameraId: string; cameraName: string; date: string; slots: { slot: string; name: string | null; first: string; last: string; photoUrl: string | null }[] }[];
};
export type CameraDraft = { name: string; placeKind: 'production' | 'store'; placeId: string; checks: PpeItem[]; from: string; to: string; everyMin: number; active?: boolean; afterHours?: boolean };

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

export const getCameras = () => call<{ cameras: Camera[]; canManage: boolean }>('/cctv/cameras');
export const getAlerts = () => call<{ alerts: Alert[] }>('/cctv/alerts').then((r) => r.alerts);
export const markAlert = (id: string, mark: 'correct' | 'false' | 'staff') => call<{ alert: Alert }>(`/cctv/alerts/${id}/mark`, { method: 'POST', body: JSON.stringify({ mark }) });
export const addCamera = (d: CameraDraft) => call<{ camera: Camera; key: string }>('/cctv/cameras', { method: 'POST', body: JSON.stringify(d) });
export const updateCamera = (id: string, d: Partial<CameraDraft>) => call<{ camera: Camera }>(`/cctv/cameras/${id}`, { method: 'PUT', body: JSON.stringify(d) });
export const getActivity = (from: string, to: string) => call<Activity>(`/cctv/activity?from=${from}&to=${to}`);
export const getWhoIs = (date: string) => call<WhoIs>(`/cctv/whois?date=${date}`);
export const setWhoIs = (b: { cameraId: string; date: string; slot: string; name: string }) => call<{ names: Record<string, string> }>('/cctv/whois', { method: 'POST', body: JSON.stringify(b) });
export const newKey = (id: string) => call<{ key: string }>(`/cctv/cameras/${id}/key`, { method: 'POST', body: '{}' });
