// Shared helpers for the rider screens: a ride's stops and legs, labels, and the past-rides periods.
import type { RiderStop, RiderTrip, RiderTripStatus, RiderTripType } from '../../utils/api';

// A ride is a list of stops worked through one leg at a time: production -> store, store ->
// production, store -> production -> store (round trip), or any two places (custom ride).
export const stopsOf = (t: RiderTrip): RiderStop[] => {
  if (t.stops && t.stops.length >= 2) return t.stops;
  const production: RiderStop = { kind: 'production', id: t.productionHouseId, name: t.productionHouseName || 'the production house' };
  const store: RiderStop = { kind: 'store', id: t.storeId, name: t.storeName };
  return t.direction === 'to_production' ? [store, production] : [production, store];
};
export const legOf = (t: RiderTrip) => Math.min(Math.max(0, t.legIndex || 0), stopsOf(t).length - 2);
export const pickupStop = (t: RiderTrip) => stopsOf(t)[legOf(t)];
export const dropStop = (t: RiderTrip) => stopsOf(t)[legOf(t) + 1];
export const pickupName = (t: RiderTrip) => pickupStop(t).name;
export const dropName = (t: RiderTrip) => dropStop(t).name;
export const routeLabel = (t: RiderTrip) => stopsOf(t).map((s) => s.name).join(' → ');
export const legCount = (t: RiderTrip) => stopsOf(t).length - 1;

export const TRIP_TYPE_LABEL: Record<RiderTripType, string> = {
  to_store: 'Production → Store',
  to_production: 'Store → Production',
  round_trip: 'Store → Production → Store',
  custom: 'Custom ride',
};
export const tripTypeLabel = (t: RiderTrip) => TRIP_TYPE_LABEL[t.tripType || (t.direction === 'to_production' ? 'to_production' : 'to_store')];

export const stopLabel = (s: RiderStop) => (s.kind === 'production' ? 'production house' : s.kind === 'store' ? 'the store' : s.name);
export const statusLabel = (t: RiderTrip): string => {
  switch (t.status) {
    case 'called': return 'Called';
    case 'on_the_way': return `On the way to ${stopLabel(pickupStop(t))}`;
    case 'arrived': return `At ${stopLabel(pickupStop(t))}`;
    case 'picked_up': return `On the way to ${stopLabel(dropStop(t))}`;
    case 'delivered': return 'Delivered';
    default: return 'Cancelled';
  }
};

export const rupees = (n: number | null | undefined) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

export const STATUS_PILL: Record<RiderTripStatus, string> = {
  called: 'bg-amber-100 text-amber-800',
  on_the_way: 'bg-blue-100 text-blue-800',
  arrived: 'bg-indigo-100 text-indigo-800',
  picked_up: 'bg-orange-100 text-orange-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null;

export const isActive = (t: RiderTrip) => t.status !== 'delivered' && t.status !== 'cancelled';

// While a ride is in one of these stages the rider's phone shares its position.
export const TRACKED_STATUSES: RiderTripStatus[] = ['on_the_way', 'arrived', 'picked_up'];

export const ageLabel = (iso: string | null | undefined) => {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
};

// ---- Past rides (rider): a collapsible list of finished and cancelled rides for a chosen period.
export type PastPeriod = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom';

export const PAST_PERIOD_LABEL: Record<PastPeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Previous week',
  this_month: 'This month',
  last_month: 'Previous month',
  this_year: 'This year',
  last_year: 'Previous year',
  custom: 'Custom range',
};

export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const shiftIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
};

// Inclusive [from, to] in India time; weeks run Sunday to Saturday like the rest of the app.
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
