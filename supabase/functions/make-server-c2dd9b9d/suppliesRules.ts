// Running low and shopping lists (supplies.ts): where someone works, who hears about a flag, when a
// list reaches the shopper, and how far a list has got. No Deno or network here, so plain node can
// test it (suppliesRules.test.ts).
import { inQuietHours } from './notificationRules.ts';

export type PlaceKind = 'store' | 'production';
export type Place = { kind: PlaceKind; id: string };
export type SupplyLevel = 'low' | 'out';
export type EntryKind = 'inventory' | 'overhead';

export type SupplyAlert = {
  id: string; placeKind: PlaceKind; placeId: string; placeName: string;
  item: string; itemBn?: string; entryType?: EntryKind; category?: string;
  level: SupplyLevel; qty?: number | null; unit?: string | null; note?: string;
  raisedBy: { id: string; name: string; at: string }[];
  status: 'open' | 'listed' | 'done' | 'dropped'; listId?: string | null;
  createdAt: string; updatedAt: string; closedByName?: string; closedAt?: string; closedNote?: string;
};

export type ShoppingLine = {
  id: string; item: string; itemBn?: string; entryType: EntryKind; category: string;
  qty: number; unit: string; placeKind: PlaceKind; placeId: string; placeName?: string; note?: string; alertIds?: string[];
  vendorId?: string | null; vendorName?: string;
  // Packs (packet, bottle, jar, bag, box, carton, tin) say the size of each: 2 packets x 1 L.
  packSize?: number | null; packUnit?: string | null;
  got?: { qty: number; at: string } | null; missing?: boolean;
  logged?: { kind: EntryKind; id: string; at: string } | null; skipped?: boolean;
};

export type ShoppingList = {
  id: string; date: string; assigneeId: string; assigneeName: string;
  createdById: string; createdByName: string; createdByUserId: string; createdAt: string; updatedAt: string;
  status: 'draft' | 'sent' | 'shopping' | 'bought' | 'logged' | 'cancelled';
  note?: string; lines: ShoppingLine[]; bills?: { path: string; at: string }[];
  sentAt?: string; notifyAt?: string; notifiedAt?: string; boughtAt?: string; loggedAt?: string;
  // Each vendor's part sent on WhatsApp: when, by whom, and what it said (to spot later changes).
  vendorOrders?: Record<string, { at: string; byName: string; sig: string }>;
};

// A shop that gets its part of the list on WhatsApp, and the items it usually supplies.
export type VendorKind = 'vegetables' | 'grocery' | 'dairy' | 'meat' | 'other';
export type Vendor = { id: string; name: string; kind?: VendorKind; phone?: string; items: string[]; createdAt: string; updatedAt: string };
// How each item was last written on a list (unit, pack size), so the next list starts from it.
export type ItemSpec = { item: string; qty: number; unit: string; packSize?: number | null; packUnit?: string | null; at: string };

export const PACK_UNITS = new Set(['packet', 'bottle', 'jar', 'bag', 'box', 'carton', 'tin']);
const MEASURES = new Set(['g', 'kg', 'L', 'mL']);
const unitWord = (unit: string, n: number) => (n === 1 || MEASURES.has(unit) || unit === 'pcs' ? unit : unit === 'box' ? 'boxes' : `${unit}s`);
// "2 packets x 1 L", "400 g" (the app's quantityNorms.ts qtyLabel, kept in step).
export function qtyLabel(l: Pick<ShoppingLine, 'qty' | 'unit' | 'packSize' | 'packUnit'>): string {
  if (!l.qty) return '';
  const head = `${l.qty} ${unitWord(l.unit, l.qty)}`;
  return PACK_UNITS.has(l.unit) && l.packSize && l.packUnit ? `${head} × ${l.packSize} ${l.packUnit}` : head;
}

// Two names are the same item when they match ignoring case, spaces and punctuation.
export const itemKey = (s: string) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const PRODUCTION_DESIGNATIONS = new Set(['production_incharge', 'production_ops']);

// Where someone works: production staff at their production house, everyone else at their store.
// Some production logins carry a store id (or the house id in storeId), so each is tried in turn.
export function placeOf(
  emp: any,
  places: { stores: Set<string>; houses: Set<string>; storeHouse: Map<string, string | null> },
): Place | null {
  if (!emp) return null;
  const storeId = emp.storeId ? String(emp.storeId) : null;
  if (PRODUCTION_DESIGNATIONS.has(emp.designation)) {
    const assigned = (Array.isArray(emp.assignedProductionHouseIds) ? emp.assignedProductionHouseIds : []).map(String).find((h: string) => places.houses.has(h));
    const house = assigned || (storeId && places.houses.has(storeId) ? storeId : null) || (storeId ? places.storeHouse.get(storeId) || null : null)
      || (places.houses.size === 1 ? [...places.houses][0] : null);
    return house ? { kind: 'production', id: house } : null;
  }
  if (storeId && places.stores.has(storeId)) return { kind: 'store', id: storeId };
  return null;
}

// The incharge of a place: the store incharge of that store, the production incharge of that house.
export function isInchargeOf(emp: any, place: Place): boolean {
  if (!emp) return false;
  if (place.kind === 'store') return emp.designation === 'store_incharge' && String(emp.storeId) === place.id;
  return emp.designation === 'production_incharge'
    && ((Array.isArray(emp.assignedProductionHouseIds) && emp.assignedProductionHouseIds.map(String).includes(place.id)) || String(emp.storeId) === place.id);
}

export const isOwnerEmp = (e: any) => e?.role === 'cluster_head';
// Operations managers: managers who are not a store or production incharge.
export const isOpsEmp = (e: any) => e?.role === 'manager' && e.designation !== 'store_incharge' && e.designation !== 'production_incharge';

// Who hears about a flag: the owner, the operations managers and that place's incharge - not the
// person who raised it.
export function alertRecipients(employees: any[], place: Place, raiserId: string | null): any[] {
  return employees.filter((e) => e?.authUserId && e.status !== 'inactive' && String(e.employeeId) !== raiserId
    && (isOwnerEmp(e) || isOpsEmp(e) || isInchargeOf(e, place)));
}

// When a list sent at nowMs should reach the shopper: now, or the moment their quiet hours end.
export function deliverAt(prefs: { quietOn?: boolean; quietFrom?: string; quietTo?: string } | null, nowMs: number): number {
  if (!inQuietHours(prefs, nowMs)) return nowMs;
  const m = /^(\d{2}):(\d{2})$/.exec(prefs?.quietTo || '');
  if (!m) return nowMs;
  const to = Number(m[1]) * 60 + Number(m[2]);
  const d = new Date(nowMs + 330 * 60000);
  const now = d.getUTCHours() * 60 + d.getUTCMinutes();
  const wait = (to - now + 1440) % 1440;
  return nowMs + wait * 60000 - d.getUTCSeconds() * 1000 - d.getUTCMilliseconds();
}

// How far a list has got: lines got, not found, still to mark, and got lines still to log.
export function listProgress(list: Pick<ShoppingList, 'lines'>) {
  const lines = list.lines || [];
  const got = lines.filter((l) => l.got && l.got.qty > 0);
  return {
    total: lines.length,
    got: got.length,
    missing: lines.filter((l) => l.missing).length,
    left: lines.filter((l) => !(l.got && l.got.qty > 0) && !l.missing).length,
    toLog: got.filter((l) => !l.logged && !l.skipped).length,
  };
}

// "Onion 5 kg, Tomato 3 kg (+9 more)" for a notification.
export function linesPreview(lines: Pick<ShoppingLine, 'item' | 'qty' | 'unit' | 'packSize' | 'packUnit'>[], max = 4): string {
  const head = lines.slice(0, max).map((l) => `${l.item}${l.qty ? ` ${qtyLabel(l)}` : ''}`).join(', ');
  return lines.length > max ? `${head} (+${lines.length - max} more)` : head;
}

// The vendor an item usually comes from.
export function vendorForItem(vendors: Pick<Vendor, 'id' | 'items'>[], item: string): string | null {
  const k = itemKey(item);
  return vendors.find((v) => v.items.some((i) => itemKey(i) === k))?.id || null;
}

// A list saved with a vendor on a line teaches the app: the item moves to that vendor (and off any
// other). A line with no vendor changes nothing. Returns the vendors whose items changed.
export function learnVendorItems(vendors: Vendor[], lines: Pick<ShoppingLine, 'item' | 'vendorId'>[]): Vendor[] {
  const byId = new Map(vendors.map((v) => [v.id, { ...v, items: [...v.items] }]));
  const changed = new Set<string>();
  for (const l of lines) {
    if (!l.vendorId || !byId.has(l.vendorId)) continue;
    const k = itemKey(l.item);
    for (const v of byId.values()) {
      const has = v.items.some((i) => itemKey(i) === k);
      if (v.id === l.vendorId && !has) { v.items.push(l.item); changed.add(v.id); }
      if (v.id !== l.vendorId && has) { v.items = v.items.filter((i) => itemKey(i) !== k); changed.add(v.id); }
    }
  }
  return [...changed].map((id) => byId.get(id)!);
}

// The latest way each item was written, from a saved list (the newest 400 items are kept).
export function learnSpecs(specs: Record<string, ItemSpec>, lines: Pick<ShoppingLine, 'item' | 'qty' | 'unit' | 'packSize' | 'packUnit'>[], at: string): Record<string, ItemSpec> {
  const next = { ...specs };
  for (const l of lines) {
    const k = itemKey(l.item);
    if (!k || !l.qty) continue;
    const pack = PACK_UNITS.has(l.unit) && l.packSize && l.packUnit;
    next[k] = { item: l.item, qty: l.qty, unit: l.unit, ...(pack ? { packSize: l.packSize, packUnit: l.packUnit } : {}), at };
  }
  const keys = Object.keys(next);
  if (keys.length <= 400) return next;
  return Object.fromEntries(keys.map((k) => [k, next[k]] as const).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 400));
}
