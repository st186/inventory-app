// Shared pieces of the momo stock maths (countMath.ts puts them together): momos made (net of
// the regular momos folded into kurkure), momos that left a production house (shipped requests),
// and which records belong to a house.
//
// Leftover momos an event stall sends back (event_momo_return rows) are back on the house's
// stock once production counts them in (status 'received', in production's own count). They
// were shipped out like any request, so without this they showed as stock that had left.
import { shippedPieces, toISTTimestamp } from '../../utils/requestStock';

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

export const zero = (): MomoCounts => Object.fromEntries(MOMO_STOCK_KEYS.map((k) => [k, 0]));

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

export function rawProduction(records: Row[]): MomoCounts {
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
export function netOfKurkure(raw: MomoCounts): MomoCounts {
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

export const minus = (a: MomoCounts, b: MomoCounts): MomoCounts => Object.fromEntries(MOMO_STOCK_KEYS.map((k) => [k, (a[k] || 0) - (b[k] || 0)]));

export const matchesHouseRecord = (p: Row, ids: HouseIds) =>
  p.storeId === ids.productionHouseUUID || p.storeId === ids.effectiveStoreId || p.storeId === ids.originalStoreId ||
  p.productionHouseId === ids.productionHouseUUID || p.productionHouseId === ids.effectiveStoreId || p.productionHouseId === ids.originalStoreId;

// A request this house shipped: its store is supplied by the house, or (an event stall's
// request, events.ts) it names the house itself.
export function shippedFromHouse(req: Row, stores: StoreLink[], houseA: string | null | undefined, houseB: string | null | undefined): boolean {
  if (req.eventId) return req.productionHouseId === houseA || req.productionHouseId === houseB;
  const requestingStore = stores.find((s) => s.id === req.storeId);
  return requestingStore?.productionHouseId === houseA || requestingStore?.productionHouseId === houseB;
}
