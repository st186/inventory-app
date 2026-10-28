// Running low and shopping lists (server supplies.ts).
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { regionHeaders } from '../../utils/http';
import type { VendorKind } from './quantityNorms';

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
  vendorId?: string | null; vendorName?: string;
  // Packs (packet, bottle, jar, bag, box, carton, tin) say the size of each: 2 packets × 1 L.
  packSize?: number | null; packUnit?: string | null;
  got?: { qty: number; at: string } | null; missing?: boolean;
  logged?: { kind: EntryKind; id: string; at: string } | null; skipped?: boolean;
}
export interface ShoppingList {
  id: string; date: string; assigneeId: string; assigneeName: string; createdById: string; createdByName: string; createdAt: string;
  status: 'draft' | 'sent' | 'shopping' | 'bought' | 'logged' | 'cancelled';
  note?: string; lines: ShoppingLine[]; bills?: { path: string; at: string }[];
  sentAt?: string; notifyAt?: string; notifiedAt?: string; boughtAt?: string; loggedAt?: string;
  vendorOrders?: Record<string, { at: string; byName: string; sig: string }>;
  progress: { total: number; got: number; missing: number; left: number; toLog: number };
  canEdit: boolean; canShop: boolean;
}
export interface Lists {
  lists: ShoppingList[]; canManage: boolean; today: string;
  people?: { id: string; name: string; designation: string | null }[]; places?: PlaceRef[];
}
// A line as the editor sends it (the server keeps what was got on lines it already has).
export type LineDraft = Pick<ShoppingLine, 'item' | 'itemBn' | 'entryType' | 'category' | 'qty' | 'unit' | 'placeKind' | 'placeId' | 'note' | 'alertIds' | 'vendorId' | 'packSize' | 'packUnit'> & { id?: string };
// A shop that gets its part of a list on WhatsApp, and the items it usually supplies.
export interface Vendor { id: string; name: string; kind?: VendorKind; phone?: string; items: string[]; createdAt: string; updatedAt: string }
export type VendorDraft = Pick<Vendor, 'name' | 'kind' | 'phone' | 'items'>;
// How an item was last written on a list, to start the next line from.
export interface ItemSpec { item: string; qty: number; unit: string; packSize?: number | null; packUnit?: string | null; at: string }
// Bunny's check of a list: a line that is unclear, and the amount to write instead (if it can tell).
export interface QtyFix { qty: number; unit: string; packSize?: number | null; packUnit?: string | null }
export interface QtyIssue { key: string; problem: string; fix: QtyFix | null }

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
export const vendorSent = (id: string, vendorId: string, sig: string) => call<{ list: ShoppingList }>(at(id, 'vendor-sent'), post({ vendorId, sig })).then(one);

export const listVendors = () => call<{ vendors: Vendor[]; specs: Record<string, ItemSpec> }>('/supply-vendors');
export const checkList = (lines: { key: string; item: string; amount: string; vendorKind?: VendorKind | null; before?: string }[]) =>
  call<{ issues: QtyIssue[] }>('/shopping-lists/check', post({ lines })).then((r) => r.issues);
export const createVendor = (b: VendorDraft) => call<{ vendor: Vendor }>('/supply-vendors', post(b)).then((r) => r.vendor);
export const updateVendor = (id: string, b: VendorDraft) =>
  call<{ vendor: Vendor }>(`/supply-vendors/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }).then((r) => r.vendor);
export const deleteVendor = (id: string) => call<{ ok: true }>(`/supply-vendors/${encodeURIComponent(id)}`, { method: 'DELETE' });
