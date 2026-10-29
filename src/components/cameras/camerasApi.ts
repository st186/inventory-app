// Cameras: PPE checks in working hours and unauthorised entry after them (server cctv.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type PpeItem = 'cap' | 'gloves' | 'apron';
export type Camera = {
  id: string; name: string; placeKind: 'production' | 'store'; placeId: string; place: string; checks: PpeItem[];
  from: string; to: string; everyMin: number; active: boolean; keyHint: string; online: boolean; lastSeenAt?: string;
  week: { checks: number; alerts: number; falseAlarms: number; unmarked: number };
  lastCheck: { at: string; kind: string; peopleCount: number; alert: string | null; note: string } | null;
};
export type Alert = {
  id: string; cameraId: string; cameraName: string; kind: 'ppe' | 'intruder'; at: string; text: string; note: string;
  peopleCount: number; onShift?: string[]; photoUrl: string | null; mark?: 'correct' | 'false' | 'staff'; markedBy?: string;
};
export type CameraDraft = { name: string; placeKind: 'production' | 'store'; placeId: string; checks: PpeItem[]; from: string; to: string; everyMin: number; active?: boolean };

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
export const newKey = (id: string) => call<{ key: string }>(`/cctv/cameras/${id}/key`, { method: 'POST', body: '{}' });
