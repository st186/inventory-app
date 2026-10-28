// Shared helpers for the rider screens: a ride's stops and legs, the next step a rider takes,
// what a ride carries, the past-rides periods and the money figures. No React and no labels
// here (labels live in rideWords.ts), so the figures can be checked from a plain node script.
import type { RiderStop, RiderSummary, RiderTrip, RiderTripStatus, RiderTripType } from '../../utils/api';

// A ride is a list of stops worked through one leg at a time: production -> store, store ->
// production, store -> production -> store (round trip), or any two places (custom ride).
// An old ride without a production house name gets an empty name; the screens show
// "Production house" for it.
export const stopsOf = (t: RiderTrip): RiderStop[] => {
  if (t.stops && t.stops.length >= 2) return t.stops;
  const production: RiderStop = { kind: 'production', id: t.productionHouseId, name: t.productionHouseName || '' };
  const store: RiderStop = { kind: 'store', id: t.storeId, name: t.storeName };
  return t.direction === 'to_production' ? [store, production] : [production, store];
};
export const legOf = (t: RiderTrip) => Math.min(Math.max(0, t.legIndex || 0), stopsOf(t).length - 2);
export const pickupStop = (t: RiderTrip) => stopsOf(t)[legOf(t)];
export const dropStop = (t: RiderTrip) => stopsOf(t)[legOf(t) + 1];
export const legCount = (t: RiderTrip) => stopsOf(t).length - 1;
export const lastStop = (t: RiderTrip) => stopsOf(t)[stopsOf(t).length - 1];

export const tripTypeOf = (t: RiderTrip): RiderTripType => t.tripType || (t.direction === 'to_production' ? 'to_production' : 'to_store');
export const TRIP_TYPES: RiderTripType[] = ['to_store', 'to_production', 'round_trip', 'custom'];

export const isActive = (t: RiderTrip) => t.status !== 'delivered' && t.status !== 'cancelled';

// While a ride is in one of these stages the rider's phone shares its position
// (keep in step with utils/riderLocationSharing.ts).
export const TRACKED_STATUSES: RiderTripStatus[] = ['on_the_way', 'arrived', 'picked_up'];
export const isTracked = (t: RiderTrip) => TRACKED_STATUSES.includes(t.status);

// Who may watch a ride on the live map: production / dispatch any ride on the move; store staff
// once it is on its way to them (or, on a store -> production ride, as soon as the rider heads
// to the store).
export const canWatchLive = (t: RiderTrip, canDispatch: boolean) =>
  (canDispatch && isTracked(t)) || (!canDispatch && (pickupStop(t).kind === 'store' ? isTracked(t) : t.status === 'picked_up'));

// The rider's next step on their current ride, and why it can't be taken yet.
export type NextStepReason = 'awaitingRate' | 'enterRate' | 'awaitingReady';
export type NextStep = { status: RiderTripStatus; reason?: NextStepReason };
export function nextRiderStep(t: RiderTrip): NextStep | null {
  if (t.status === 'called') {
    if (t.fareStatus === 'proposed') return { status: 'on_the_way', reason: 'awaitingRate' };
    if (t.fareStatus === 'needs_rate') return { status: 'on_the_way', reason: 'enterRate' };
    return { status: 'on_the_way' };
  }
  if (t.status === 'on_the_way') return { status: 'arrived' };
  if (t.status === 'arrived') return t.readyAt ? { status: 'picked_up' } : { status: 'picked_up', reason: 'awaitingReady' };
  if (t.status === 'picked_up') return { status: 'delivered' };
  return null;
}

// Dispatch confirming a step for a rider whose phone can't (no location check).
export const overrideStepOf = (t: RiderTrip): RiderTripStatus | null =>
  t.status === 'on_the_way' ? 'arrived' : t.status === 'arrived' ? 'picked_up' : t.status === 'picked_up' ? 'delivered' : null;

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null;

export const ageSeconds = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));

// ---- What a ride carries: the stock requests linked to it, their momos and bags.
export const MOMO_KEYS: [shippedKey: string, requestKey: string][] = [
  ['chicken', 'chickenMomos'], ['chickenCheese', 'chickenCheeseMomos'], ['veg', 'vegMomos'], ['cheeseCorn', 'cheeseCornMomos'],
  ['paneer', 'paneerMomos'], ['vegKurkure', 'vegKurkureMomos'], ['chickenKurkure', 'chickenKurkureMomos'],
];

// The fields a linked request needs (a full ProductionRequest fits).
export type RideRequest = {
  id: string;
  storeId: string;
  requestDate: string;
  status: string;
  shippedQuantities?: Record<string, number>;
  dispatch?: { bags?: Record<string, number>; boxes?: number } | null;
};

export type RideLoad = { requests: number; momos: number | null; bags: number | null; boxes: number | null };

// Momos: what was shipped when the request has been shipped, else what was asked for. Bags and
// boxes only when production recorded them while packing (app 1.15.17 on).
export function loadOf(trip: Pick<RiderTrip, 'requestIds' | 'linkedRequests'>, requests: RideRequest[]): RideLoad | null {
  const ids = trip.requestIds || [];
  if (ids.length === 0) return null;
  const fromList = requests.filter((r) => ids.includes(r.id));
  const linked: RideRequest[] = fromList.length > 0 ? fromList : (trip.linkedRequests || []).filter((r) => ids.includes(r.id));
  if (linked.length === 0) return { requests: ids.length, momos: null, bags: null, boxes: null };
  let momos = 0;
  let bags = 0;
  let boxes = 0;
  let anyBags = false;
  let anyBoxes = false;
  for (const r of linked) {
    const shipped = MOMO_KEYS.reduce((sum, [key]) => sum + (Number(r.shippedQuantities?.[key]) || 0), 0);
    const asked = MOMO_KEYS.reduce((sum, [, key]) => sum + (Number((r as Record<string, unknown>)[key]) || 0), 0);
    momos += shipped > 0 ? shipped : asked;
    if (r.dispatch?.bags) {
      anyBags = true;
      bags += Object.values(r.dispatch.bags).reduce((sum, n) => sum + (Number(n) || 0), 0);
    }
    if (typeof r.dispatch?.boxes === 'number') {
      anyBoxes = true;
      boxes += r.dispatch.boxes;
    }
  }
  return { requests: ids.length, momos, bags: anyBags ? bags : null, boxes: anyBoxes ? boxes : null };
}

// Open stock requests for a store that a delivery ride could be carrying (Call a rider).
export const OPEN_REQUEST_STATUSES = ['accepted', 'in-preparation', 'prepared', 'shipped', 'partially-shipped'];
export const isShipped = (status: string) => status === 'shipped' || status === 'partially-shipped';
export function openRequestsFor<R extends RideRequest>(requests: R[], storeId: string, tripType: RiderTripType): R[] {
  if (!storeId || (tripType !== 'to_store' && tripType !== 'round_trip')) return [];
  return requests
    .filter((r) => r.storeId === storeId && OPEN_REQUEST_STATUSES.includes(r.status))
    .sort((a, b) => (a.requestDate < b.requestDate ? 1 : -1));
}

// ---- Money figures (old screen: RiderPastRides and RiderEarningsCard; checked by scripts in the
// WP7 report so the totals stay the same).
export const pastTotals = (rides: RiderTrip[]) => {
  const delivered = rides.filter((t) => t.status === 'delivered');
  return { rides: delivered.length, earned: delivered.reduce((sum, t) => sum + (t.fare || 0), 0), cancelled: rides.length - delivered.length };
};
export const summaryFigures = (s: RiderSummary) => ({
  todayEarned: s.today.earned,
  todayRides: s.today.rides,
  monthEarned: s.month.earned,
  monthRides: s.month.rides,
  monthPaid: s.month.paid,
  stillToPay: Math.max(0, s.month.balance),
});
// The rupee amounts the screens print are whole rupees, as before.
export const wholeRupees = (n: number | null | undefined) => Math.round(n || 0);

// Staff: fares of today's delivered rides, per rider (from the rides already on screen).
export function faresByRider(trips: RiderTrip[]) {
  const map = new Map<string, { riderEmployeeId: string; riderName: string; rides: number; fares: number }>();
  for (const t of trips) {
    if (t.status !== 'delivered') continue;
    const row = map.get(t.riderEmployeeId) || { riderEmployeeId: t.riderEmployeeId, riderName: t.riderName, rides: 0, fares: 0 };
    row.rides += 1;
    row.fares += t.fare || 0;
    map.set(t.riderEmployeeId, row);
  }
  const rows = [...map.values()].sort((a, b) => b.fares - a.fares);
  return { rows, total: rows.reduce((sum, r) => sum + r.fares, 0), rides: rows.reduce((sum, r) => sum + r.rides, 0) };
}

// ---- Past rides: a chosen period, inclusive [from, to] in India time; weeks run Sunday to
// Saturday like the rest of the rider screens.
export type PastPeriod = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom';
export const PAST_PERIODS: PastPeriod[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'custom'];

export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const shiftIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
};

export function pastRange(period: PastPeriod, custom: { from: string; to: string }): { from: string; to: string } | null {
  const today = istToday();
  const [y, m] = today.split('-').map(Number);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (period) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const d = shiftIso(today, -1); return { from: d, to: d }; }
    case 'this_week': return { from: shiftIso(today, -weekday), to: today };
    case 'last_week': { const start = shiftIso(today, -weekday - 7); return { from: start, to: shiftIso(start, 6) }; }
    case 'this_month': return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last_month': {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: `${ly}-${pad(lm)}-01`, to: shiftIso(`${y}-${pad(m)}-01`, -1) };
    }
    case 'this_year': return { from: `${y}-01-01`, to: today };
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'custom': return custom.from && custom.to && custom.from <= custom.to ? { from: custom.from, to: custom.to } : null;
  }
}

// Phone numbers for the call buttons, from the staff list the app already has (owner and
// managers see phone numbers; riders and plain staff don't get the list, so no buttons).
export type PhoneBookEntry = {
  employeeId: string;
  name: string;
  phone?: string;
  designation?: string | null;
  storeId?: string | null;
  assignedStoreIds?: string[];
  assignedProductionHouseIds?: string[];
  status?: string;
};
export type Contact = { name: string; phone: string };

const telOf = (phone?: string) => (phone || '').replace(/[^\d+]/g, '');

export function contactForStop(stop: RiderStop, people: PhoneBookEntry[]): Contact | null {
  if (!stop.id || stop.kind === 'custom') return null;
  if (stop.contact?.phone) return stop.contact;
  const wanted = stop.kind === 'store' ? 'store_incharge' : 'production_incharge';
  const at = (p: PhoneBookEntry) =>
    p.storeId === stop.id || (stop.kind === 'store' ? p.assignedStoreIds : p.assignedProductionHouseIds)?.includes(stop.id as string);
  const person = people.find((p) => p.designation === wanted && p.status !== 'inactive' && at(p) && telOf(p.phone).length >= 10);
  return person ? { name: person.name, phone: telOf(person.phone) } : null;
}

export function contactForRider(riderEmployeeId: string, people: PhoneBookEntry[]): Contact | null {
  const person = people.find((p) => p.employeeId === riderEmployeeId && telOf(p.phone).length >= 10);
  return person ? { name: person.name, phone: telOf(person.phone) } : null;
}
