// The production-house side of Monthly Stock Recalibration's expected stock: momos made (net of
// the regular momos folded into kurkure) and momos that left the house (shipped requests), over
// the current month, since a mid-month count, or over last month for an opening balance worked
// out from transactions. Moved out of MonthlyStockRecalibration.tsx so it can be tested.
//
// Leftover momos an event stall sends back (event_momo_return rows) are back on the house's
// stock once production counts them in (status 'received', in production's own count). They
// were shipped out like any request, so without this they showed as stock that had left.
import { SENT_STATUSES, shippedAtIST, shippedPieces, toISTTimestamp } from '../../utils/requestStock';

export const MOMO_STOCK_KEYS = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'];

export type MomoCounts = Record<string, number>;

type Row = Record<string, any>;
type StoreLink = { id: string; productionHouseId?: string | null };

/** The ids a production house goes by on records (its own id, or a store id on older ones). */
export type HouseIds = {
  productionHouseUUID?: string | null;
  effectiveStoreId?: string | null;
  originalStoreId?: string | null;
};

const zero = (): MomoCounts => Object.fromEntries(MOMO_STOCK_KEYS.map((k) => [k, 0]));

// Pieces per momo type that a set of stock requests moved: the shipped amounts, read under the
// short keys requests use (with the old long keys as fallback).
export function sumShippedPieces(requests: Row[]): MomoCounts {
  const totals: MomoCounts = {};
  MOMO_STOCK_KEYS.forEach((key) => {
    totals[key] = requests.reduce((sum, req) => sum + shippedPieces(req, key), 0);
  });
  return totals;
}

/** Event leftovers production counted back in, per type, whose IST receive time passes `inWindow`. */
export function eventReturnsBack(returns: Row[], houseIds: (string | null | undefined)[], inWindow: (istTimestamp: string) => boolean): MomoCounts {
  const ids = new Set(houseIds.filter(Boolean) as string[]);
  const totals = zero();
  for (const r of returns || []) {
    if (r?.status !== 'received' || !r.productionHouseId || !ids.has(r.productionHouseId)) continue;
    const at = r.receivedAt ? toISTTimestamp(r.receivedAt) : null;
    if (!at || !inWindow(at)) continue;
    for (const key of MOMO_STOCK_KEYS) totals[key] += Number(r.receivedQuantities?.[key]) || 0;
  }
  return totals;
}

function rawProduction(records: Row[]): MomoCounts {
  return records.reduce((acc, p) => ({
    chicken: acc.chicken + (p.chickenMomos?.final || 0),
    chickenCheese: acc.chickenCheese + (p.chickenCheeseMomos?.final || 0),
    veg: acc.veg + (p.vegMomos?.final || 0),
    cheeseCorn: acc.cheeseCorn + (p.cheeseCornMomos?.final || 0),
    paneer: acc.paneer + (p.paneerMomos?.final || 0),
    vegKurkure: acc.vegKurkure + (p.vegKurkureMomos?.final || 0),
    chickenKurkure: acc.chickenKurkure + (p.chickenKurkureMomos?.final || 0),
  }), zero());
}

// Kurkure momos are made FROM regular momos: chicken kurkure uses chicken momos, veg kurkure veg.
function netOfKurkure(raw: MomoCounts): MomoCounts {
  return {
    chicken: raw.chicken - raw.chickenKurkure,
    chickenCheese: raw.chickenCheese,
    veg: raw.veg - raw.vegKurkure,
    cheeseCorn: raw.cheeseCorn,
    paneer: raw.paneer,
    vegKurkure: raw.vegKurkure,
    chickenKurkure: raw.chickenKurkure,
  };
}

const minus = (a: MomoCounts, b: MomoCounts): MomoCounts => Object.fromEntries(MOMO_STOCK_KEYS.map((k) => [k, (a[k] || 0) - (b[k] || 0)]));

const matchesHouseRecord = (p: Row, ids: HouseIds) =>
  p.storeId === ids.productionHouseUUID || p.storeId === ids.effectiveStoreId || p.storeId === ids.originalStoreId ||
  p.productionHouseId === ids.productionHouseUUID || p.productionHouseId === ids.effectiveStoreId || p.productionHouseId === ids.originalStoreId;

// A request this house shipped: its store is supplied by the house, or (an event stall's
// request, events.ts) it names the house itself.
function shippedFromHouse(req: Row, stores: StoreLink[], houseA: string | null | undefined, houseB: string | null | undefined): boolean {
  if (req.eventId) return req.productionHouseId === houseA || req.productionHouseId === houseB;
  const requestingStore = stores.find((s) => s.id === req.storeId);
  return requestingStore?.productionHouseId === houseA || requestingStore?.productionHouseId === houseB;
}

export type Movement = { produced: MomoCounts; sent: MomoCounts };

type MovementInput = {
  productionData: Row[];
  requests: Row[];
  stores: StoreLink[];
  /** Event leftovers (eventsApi.momoReturns('received')); [] leaves the old figures. */
  returns: Row[];
  ids: HouseIds;
};

/** Made and sent this month ("YYYY-MM"): production by date, shipments by IST ship date. */
export function productionMonthMovement({ productionData, requests, stores, returns, ids, month }: MovementInput & { month: string }): Movement {
  const records = productionData.filter((p) => {
    const productionDate = p.date || '';
    const dateMatch = productionDate.startsWith(month) || productionDate.substring(0, 7) === month;
    return dateMatch && matchesHouseRecord(p, ids);
  });
  const shipped = requests.filter((req) => {
    if (!SENT_STATUSES.includes(req.status)) return false;
    const shippedAt = shippedAtIST(req);
    if (!shippedAt || !shippedAt.startsWith(month)) return false;
    return shippedFromHouse(req, stores, ids.productionHouseUUID, ids.effectiveStoreId);
  });
  const back = eventReturnsBack(returns, [ids.productionHouseUUID, ids.effectiveStoreId], (at) => at.startsWith(month));
  return { produced: netOfKurkure(rawProduction(records)), sent: minus(sumShippedPieces(shipped), back) };
}

/**
 * Made and sent since a mid-month count (`since` is the count's IST time): production from the
 * day after (that day's could be either side of the count), shipments and returns from then on.
 */
export function productionMovementSince({ productionData, requests, stores, returns, ids, since }: MovementInput & { since: string }): Movement {
  const sinceDay = since.substring(0, 10);
  const records = productionData.filter((p) => (p.date || '') > sinceDay && matchesHouseRecord(p, ids));
  const shipped = requests.filter((req) => {
    if (!SENT_STATUSES.includes(req.status)) return false;
    const shippedAt = shippedAtIST(req);
    if (!shippedAt || shippedAt < since) return false;
    return shippedFromHouse(req, stores, ids.productionHouseUUID, ids.effectiveStoreId);
  });
  const back = eventReturnsBack(returns, [ids.productionHouseUUID, ids.effectiveStoreId], (at) => at >= since);
  return { produced: netOfKurkure(rawProduction(records)), sent: minus(sumShippedPieces(shipped), back) };
}

/** Last month's closing stock from transactions alone (no count to start from): made − sent. */
export function productionPreviousMonthClosing({ productionData, requests, stores, returns, locationId, effectiveStoreId, previousMonth }: {
  productionData: Row[];
  requests: Row[];
  stores: StoreLink[];
  returns: Row[];
  locationId: string;
  effectiveStoreId?: string | null;
  previousMonth: string;
}): MomoCounts {
  const records = productionData.filter((p) => (p.date || '').startsWith(previousMonth) && (p.storeId === locationId || p.productionHouseId === locationId));
  const shipped = requests.filter((req) => {
    if (!SENT_STATUSES.includes(req.status)) return false;
    const shippedAt = shippedAtIST(req);
    if (!shippedAt || !shippedAt.startsWith(previousMonth)) return false;
    return shippedFromHouse(req, stores, locationId, effectiveStoreId);
  });
  const back = eventReturnsBack(returns, [locationId, effectiveStoreId], (at) => at.startsWith(previousMonth));
  return minus(netOfKurkure(rawProduction(records)), minus(sumShippedPieces(shipped), back));
}

/** Expected stock per type: opening + made − sent. */
export function expectedStock(opening: MomoCounts, movement: Movement): MomoCounts {
  return Object.fromEntries(MOMO_STOCK_KEYS.map((k) => [k, (opening[k] || 0) + (movement.produced[k] || 0) - (movement.sent[k] || 0)]));
}
