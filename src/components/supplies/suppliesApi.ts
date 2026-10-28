// Running low and shopping lists (server supplies.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';

export type PlaceKind = 'store' | 'production';
export type EntryKind = 'inventory' | 'overhead';
export interface PlaceRef { kind: PlaceKind; id: string; name: string }

export interface SupplyAlert {
  id: string; placeKind: PlaceKind; placeId: string; placeName: string;
  item: string; itemBn?: string; entryType?: EntryKind; category?: string;
  level: 'low' | 'out'; qty?: number | null; unit?: string | null; note?: string;
  raisedBy: { id: string; name: string; at: string }[];
  status: 'open' | 'listed' | 'done' | 'dropped'; listId?: string | null;
  createdAt: string; updatedAt: string; closedByName?: string; closedAt?: string; closedNote?: string;
  canClose: boolean; mine: boolean;
}
export interface AlertList { alerts: SupplyAlert[]; canManage: boolean; myPlace: PlaceRef | null; places?: PlaceRef[] }

export interface ShoppingLine {
  id: string; item: string; itemBn?: string; entryType: EntryKind; category: string;
  qty: number; unit: string; placeKind: PlaceKind; placeId: string; placeName?: string; note?: string; alertIds?: string[];
  got?: { qty: number; at: string } | null; missing?: boolean;
  logged?: { kind: EntryKind; id: string; at: string } | null; skipped?: boolean;
}
export interface ShoppingList {
  id: string; date: string; assigneeId: string; assigneeName: string; createdById: string; createdByName: string; createdAt: string;
  status: 'draft' | 'sent' | 'shopping' | 'bought' | 'logged' | 'cancelled';
  note?: string; lines: ShoppingLine[]; bills?: { path: string; at: string }[];
  sentAt?: string; notifyAt?: string; notifiedAt?: string; boughtAt?: string; loggedAt?: string;
  progress: { total: number; got: number; missing: number; left: number; toLog: number };
  canEdit: boolean; canShop: boolean;
}
export interface Lists {
  lists: ShoppingList[]; canManage: boolean; today: string;
  people?: { id: string; name: string; designation: string | null }[]; places?: PlaceRef[];
}
// A line as the editor sends it (the server keeps what was got on lines it already has).
export type LineDraft = Pick<ShoppingLine, 'item' | 'itemBn' | 'entryType' | 'category' | 'qty' | 'unit' | 'placeKind' | 'placeId' | 'note' | 'alertIds'> & { id?: string };

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
const at = (id: string, what: string) => `/shopping-lists/${encodeURIComponent(id)}/${what}`;
const one = (r: { list: ShoppingList }) => r.list;

export const listAlerts = () => call<AlertList>('/supply-alerts');
export const raiseAlert = (b: { item: string; itemBn?: string; entryType?: EntryKind; category?: string; level: 'low' | 'out'; qty?: number | null; unit?: string | null; note?: string; placeKind?: PlaceKind; placeId?: string }) =>
  call<{ alert: SupplyAlert; merged: boolean }>('/supply-alerts', post(b));
export const closeAlert = (id: string, outcome: 'done' | 'dropped', note?: string) =>
  call<{ alert: SupplyAlert }>(`/supply-alerts/${encodeURIComponent(id)}/close`, post({ outcome, note }));

export const listShopping = () => call<Lists>('/shopping-lists');
export const createList = (b: { date: string; assigneeId: string; note?: string; lines: LineDraft[]; send: boolean }) => call<{ list: ShoppingList }>('/shopping-lists', post(b)).then(one);
export const updateList = (id: string, b: { date?: string; assigneeId?: string; note?: string; lines?: LineDraft[]; send?: boolean }) =>
  call<{ list: ShoppingList }>(`/shopping-lists/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }).then(one);
export const cancelList = (id: string) => call<{ list: ShoppingList }>(at(id, 'cancel'), post({})).then(one);
export const markGot = (id: string, lineId: string, b: { qty?: number | null; missing?: boolean }) => call<{ list: ShoppingList }>(at(id, 'got'), post({ lineId, ...b })).then(one);
export const addBill = (id: string, path: string) => call<{ list: ShoppingList }>(at(id, 'bill'), post({ path })).then(one);
export const finishShopping = (id: string) => call<{ list: ShoppingList }>(at(id, 'done'), post({})).then(one);
export const markLogged = (id: string, lineId: string, b: { kind?: EntryKind; recordId?: string; qty?: number; skip?: boolean }) =>
  call<{ list: ShoppingList }>(at(id, 'logged'), post({ lineId, ...b })).then(one);
