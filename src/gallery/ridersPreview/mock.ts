// Dev-only (riders-preview.html): made-up riders, rides, places and money for the rider screens,
// served through the RiderApiProvider instead of the server. Names, phones and Aadhaar numbers
// are invented.
import type * as api from '../../utils/api';
import type { RiderApi } from '../../components/riders/riderApi';
import type { TrackingState } from '../../utils/riderTracking';
import { addDays, getTodayIST } from '../../utils/timezone';

export const today = getTodayIST();
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();
const later = <T,>(value: T, ms = 250) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const STORES = [
  { id: 'STORE-1', name: 'Bidhan Nagar' },
  { id: 'STORE-2', name: 'City Centre' },
];
const PH = { kind: 'production' as const, id: 'PH-1', name: 'Benachity kitchen', latitude: 23.5204, longitude: 87.3119 };
const S1 = { kind: 'store' as const, id: 'STORE-1', name: 'Bidhan Nagar', latitude: 23.5352, longitude: 87.2966 };
const S2 = { kind: 'store' as const, id: 'STORE-2', name: 'City Centre', latitude: 23.5468, longitude: 87.3002 };

// People with phone numbers (managers see these; riders don't get the staff list today).
export const PEOPLE = [
  { employeeId: 'BM-021', name: 'Store Lead Demo', phone: '9000000021', designation: 'store_incharge', storeId: 'STORE-1', assignedStoreIds: ['STORE-1'] },
  { employeeId: 'BM-031', name: 'Kitchen Head Demo', phone: '9000000031', designation: 'production_incharge', storeId: 'PH-1', assignedProductionHouseIds: ['PH-1'] },
  { employeeId: 'BM-061', name: 'Raju Demo', phone: '9000000061', designation: 'rider', storeId: null },
  { employeeId: 'BM-062', name: 'Bapi Demo', phone: '9000000062', designation: 'rider', storeId: null },
];

// Stock requests (a shipped one with bags, one still being packed).
export const REQUESTS = [
  {
    id: 'req-shipped', storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestDate: today, status: 'shipped',
    chickenMomos: 300, chickenCheeseMomos: 100, vegMomos: 80, cheeseCornMomos: 0, paneerMomos: 40, vegKurkureMomos: 0, chickenKurkureMomos: 60,
    shippedQuantities: { chicken: 300, chickenCheese: 100, veg: 80, paneer: 40, chickenKurkure: 60 },
    dispatch: { bags: { chicken: 6, chickenCheese: 5, veg: 4, paneer: 2, chickenKurkure: 3 }, boxes: 2 },
  },
  {
    id: 'req-packing', storeId: 'STORE-1', storeName: 'Bidhan Nagar', requestDate: addDays(today, 1), status: 'in-preparation',
    chickenMomos: 250, chickenCheeseMomos: 80, vegMomos: 60, cheeseCornMomos: 40, paneerMomos: 40, vegKurkureMomos: 20, chickenKurkureMomos: 40,
  },
];

type TripOverrides = Partial<api.RiderTrip>;
function trip(id: string, o: TripOverrides): api.RiderTrip {
  return {
    id, date: today, tripNumber: 1, direction: 'to_store', tripType: 'to_store', stops: [PH, S1], legIndex: 0, receipt: null, requestIds: [],
    productionHouseName: PH.name, fare: 300, defaultFare: 300, proposedFare: null, fareStatus: 'agreed',
    riderEmployeeId: 'BM-061', riderName: 'Raju Demo', storeId: 'STORE-1', storeName: 'Bidhan Nagar', productionHouseId: 'PH-1',
    note: '', status: 'called', calledAt: at(today, '10:05'), calledByName: 'Kitchen Head Demo',
    onTheWayAt: null, arrivedAt: null, readyAt: null, readyByName: null, pickedUpAt: null, deliveredAt: null, cancelledAt: null,
    ...o,
  };
}

// The rider's current ride at each stage (?trip=...).
export type TripStage = 'called' | 'needs_rate' | 'proposed' | 'on_the_way' | 'arrived' | 'ready' | 'picked_up' | 'round_trip' | 'none';
export function currentRide(stage: TripStage): api.RiderTrip | null {
  const base = { id: 'ride-now', tripNumber: 3, requestIds: ['req-shipped'], note: 'Extra red sauce for the evening rush', calledAt: at(today, '15:40') };
  switch (stage) {
    case 'none': return null;
    case 'called': return trip('ride-now', { ...base });
    case 'needs_rate': return trip('ride-now', { ...base, fare: 0, fareStatus: 'needs_rate' });
    case 'proposed': return trip('ride-now', { ...base, fareStatus: 'proposed', proposedFare: 350 });
    case 'on_the_way': return trip('ride-now', { ...base, status: 'on_the_way', onTheWayAt: at(today, '15:44') });
    case 'arrived': return trip('ride-now', { ...base, status: 'arrived', onTheWayAt: at(today, '15:44'), arrivedAt: at(today, '15:58') });
    case 'ready': return trip('ride-now', { ...base, status: 'arrived', onTheWayAt: at(today, '15:44'), arrivedAt: at(today, '15:58'), readyAt: at(today, '16:02'), readyByName: 'Kitchen Head Demo' });
    case 'picked_up': return trip('ride-now', { ...base, status: 'picked_up', onTheWayAt: at(today, '15:44'), arrivedAt: at(today, '15:58'), readyAt: at(today, '16:02'), pickedUpAt: at(today, '16:06') });
    case 'round_trip': return trip('ride-now', {
      ...base, tripType: 'round_trip', stops: [S1, PH, S1], legIndex: 1, fare: 450, defaultFare: 450, requestIds: [],
      status: 'picked_up', onTheWayAt: at(today, '15:44'), arrivedAt: at(today, '15:58'), readyAt: at(today, '16:02'), pickedUpAt: at(today, '16:06'),
    });
  }
}

// Today's finished rides for the rider.
const riderDone = [
  trip('ride-2', { tripNumber: 2, status: 'delivered', calledAt: at(today, '12:10'), onTheWayAt: at(today, '12:12'), arrivedAt: at(today, '12:30'), readyAt: at(today, '12:31'), pickedUpAt: at(today, '12:35'), deliveredAt: at(today, '12:58'), receipt: { status: 'confirmed', note: '', byName: 'Store Lead Demo', at: at(today, '13:02') } }),
  trip('ride-1', { tripNumber: 1, status: 'delivered', stops: [PH, S2], storeId: 'STORE-2', storeName: 'City Centre', calledAt: at(today, '09:20'), onTheWayAt: at(today, '09:22'), arrivedAt: at(today, '09:40'), readyAt: at(today, '09:38'), pickedUpAt: at(today, '09:44'), deliveredAt: at(today, '10:12') }),
];

// Staff: rides in progress and done today.
export const staffTrips: api.RiderTrip[] = [
  trip('s-ontheway', { tripNumber: 3, status: 'on_the_way', requestIds: ['req-shipped'], onTheWayAt: at(today, '15:44'), calledAt: at(today, '15:40') }),
  trip('s-proposed', { tripNumber: 1, riderEmployeeId: 'BM-062', riderName: 'Bapi Demo', tripType: 'custom', stops: [PH, { kind: 'custom', id: null, name: 'College fest stall', latitude: 23.55, longitude: 87.29 }], fare: 300, proposedFare: 400, fareStatus: 'proposed', calledAt: at(today, '16:05') }),
  trip('s-await', { tripNumber: 2, status: 'delivered', requestIds: ['req-old'], calledAt: at(today, '12:10'), onTheWayAt: at(today, '12:12'), arrivedAt: at(today, '12:30'), readyAt: at(today, '12:31'), pickedUpAt: at(today, '12:35'), deliveredAt: at(today, '12:58') }),
  trip('s-confirmed', { tripNumber: 1, status: 'delivered', stops: [PH, S2], storeId: 'STORE-2', storeName: 'City Centre', calledAt: at(today, '09:20'), onTheWayAt: at(today, '09:22'), arrivedAt: at(today, '09:40'), readyAt: at(today, '09:38'), pickedUpAt: at(today, '09:44'), deliveredAt: at(today, '10:12'), receipt: { status: 'confirmed', note: '', byName: 'Store Lead Demo', at: at(today, '10:20'), requestsDelivered: 1 } }),
  trip('s-cancel', { tripNumber: 2, riderEmployeeId: 'BM-062', riderName: 'Bapi Demo', status: 'cancelled', fare: 300, calledAt: at(today, '11:00'), cancelledAt: at(today, '11:15') }),
];

const RIDERS: api.RiderListItem[] = [
  { employeeId: 'BM-061', name: 'Raju Demo', available: true, unavailableReason: null, defaultRate: 300, aadhaarMasked: 'XXXX XXXX 0000', aadhaarFull: null, hasProfile: true },
  { employeeId: 'BM-062', name: 'Bapi Demo', available: false, unavailableReason: 'Off until 6:00 pm', defaultRate: 300, aadhaarMasked: 'XXXX XXXX 0001', aadhaarFull: null, hasProfile: true },
];

const PLACES: api.RiderPlace[] = [
  { kind: 'production', id: 'PH-1', name: 'Benachity kitchen', latitude: PH.latitude, longitude: PH.longitude, setByName: 'Kitchen Head Demo', setAt: at(addDays(today, -20), '10:00') },
  { kind: 'store', id: 'STORE-1', name: 'Bidhan Nagar', latitude: S1.latitude, longitude: S1.longitude, setByName: 'Store Lead Demo', setAt: at(addDays(today, -20), '11:00') },
  { kind: 'store', id: 'STORE-2', name: 'City Centre', latitude: null, longitude: null, setByName: null, setAt: null },
];

function pastRides(from: string, to: string): api.RiderTrip[] {
  const out: api.RiderTrip[] = [];
  for (let i = 0; i <= 40; i++) {
    const d = addDays(today, -i);
    if (d < from || d > to) continue;
    const n = i === 0 ? 0 : (i % 3) + 1;
    for (let k = 1; k <= n; k++) {
      const cancelled = (i + k) % 7 === 0;
      out.push(trip(`past-${i}-${k}`, {
        date: d, tripNumber: k, stops: k % 2 ? [PH, S1] : [PH, S2], storeName: k % 2 ? 'Bidhan Nagar' : 'City Centre', fare: k === 3 ? 350 : 300,
        status: cancelled ? 'cancelled' : 'delivered', calledAt: at(d, `1${k}:00`), onTheWayAt: at(d, `1${k}:02`), arrivedAt: at(d, `1${k}:20`), readyAt: at(d, `1${k}:21`),
        pickedUpAt: cancelled ? null : at(d, `1${k}:25`), deliveredAt: cancelled ? null : at(d, `1${k}:48`), cancelledAt: cancelled ? at(d, `1${k}:10`) : null,
      }));
    }
  }
  return [...riderDone.filter((x) => x.date >= from && x.date <= to), ...out];
}

const schedule = (): api.RiderWeekSchedule => ({
  mon: { enabled: true, from: '09:00', to: '21:00' }, tue: { enabled: true, from: '09:00', to: '21:00' }, wed: { enabled: true, from: '09:00', to: '21:00' },
  thu: { enabled: true, from: '09:00', to: '21:00' }, fri: { enabled: true, from: '10:00', to: '22:00' }, sat: { enabled: true, from: '10:00', to: '22:00' },
  sun: { enabled: false, from: '09:00', to: '21:00' },
});

export type MockOptions = { stage: TripStage; loc: TrackingState | null; ring: boolean; android: boolean; staff: boolean; unavailable: boolean; empty: boolean };

export function mockRiderApi(o: MockOptions): RiderApi {
  let trips: api.RiderTrip[] = o.staff ? (o.empty ? [] : staffTrips) : [...(currentRide(o.stage) ? [currentRide(o.stage) as api.RiderTrip] : []), ...(o.empty ? [] : riderDone)];
  let ringing = o.ring;
  const update = (id: string, patch: Partial<api.RiderTrip>) => {
    trips = trips.map((x) => (x.id === id ? { ...x, ...patch } : x));
    return later(trips.find((x) => x.id === id) as api.RiderTrip);
  };
  const profile: api.RiderProfileResponse = {
    profile: { name: 'Raju Demo', aadhaar: '000000000000', defaultRate: 300, availability: schedule(), unavailableUntil: o.unavailable ? 'indefinite' : null },
    available: !o.unavailable,
    unavailableReason: o.unavailable ? 'Marked unavailable until you switch back' : null,
  };
  return {
    getRiderTrips: () => later({ trips, maxTripsPerDay: 4 }),
    getRiderTripsRange: (from, to) => later(pastRides(from, to), 400),
    getRiders: () => later(RIDERS),
    callRider: async (input) => {
      const r = RIDERS.find((x) => x.employeeId === input.riderEmployeeId);
      const created = trip(`new-${Date.now()}`, { tripNumber: 4, riderEmployeeId: input.riderEmployeeId, riderName: r?.name || 'Rider', fare: input.fare || r?.defaultRate || 0, note: input.note || '', calledAt: new Date().toISOString() });
      trips = [created, ...trips];
      return later(created);
    },
    markRiderTripReady: (id) => update(id, { readyAt: new Date().toISOString(), readyByName: 'You' }),
    advanceRiderTrip: (id, status) => update(id, { status, ...(status === 'on_the_way' ? { onTheWayAt: new Date().toISOString() } : status === 'arrived' ? { arrivedAt: new Date().toISOString() } : status === 'picked_up' ? { pickedUpAt: new Date().toISOString() } : { deliveredAt: new Date().toISOString() }) }),
    confirmRiderReceipt: (id, ok, note) => update(id, { receipt: { status: ok ? 'confirmed' : 'issue', note: note || '', byName: 'You', at: new Date().toISOString() } }),
    cancelRiderTrip: (id) => update(id, { status: 'cancelled', cancelledAt: new Date().toISOString() }),
    getRiderTripLocation: (id) => {
      const x = trips.find((t) => t.id === id);
      const places = (x?.stops || [PH, S1]).filter((s) => typeof s.latitude === 'number').map((s) => ({ kind: s.kind, name: s.name, latitude: s.latitude as number, longitude: s.longitude as number }));
      return later({
        status: x?.status || 'on_the_way', places, missingPins: [],
        location: { latitude: 23.5262, longitude: 87.3061, accuracy: 8, speed: 6, updatedAt: new Date(Date.now() - 12000).toISOString(), track: [[23.5204, 87.3119, ''], [23.5230, 87.3090, ''], [23.5262, 87.3061, '']] },
        production: null, store: null,
      });
    },
    getRiderTripEta: () => later({ leg: 'drop', targetName: 'Bidhan Nagar', distanceMeters: 2400, etaSeconds: 540, etaAt: new Date(Date.now() + 540000).toISOString(), traffic: { level: 'moderate', observedKmh: 18, freeFlowKmh: 30 }, timing: 'on_time', deltaMinutes: 0, expectedMinutes: 22, source: 'osrm' }),
    getRiderPlaces: () => later(PLACES),
    setRiderPlace: async () => { await later(null); },
    proposeRiderFare: (id, amount) => update(id, { fareStatus: 'proposed', proposedFare: amount }),
    decideRiderFare: (id, approve) => {
      const x = trips.find((t) => t.id === id);
      return update(id, approve ? { fareStatus: 'agreed', fare: x?.proposedFare || x?.fare || 0, proposedFare: null } : { fareStatus: 'agreed', proposedFare: null });
    },
    getRiderProfile: () => later(profile),
    saveRiderProfile: async (input) => { profile.profile = { ...profile.profile, ...input, availability: input.availability }; await later(null); },
    setRiderAvailability: async (input) => {
      profile.available = !input.unavailable;
      profile.profile.unavailableUntil = input.unavailable ? 'indefinite' : null;
      profile.unavailableReason = input.unavailable ? 'Marked unavailable until you switch back' : null;
      return later({ available: profile.available, unavailableReason: profile.unavailableReason, unavailableUntil: profile.profile.unavailableUntil });
    },
    getRiderSummary: () => later({ today: { rides: 2, earned: 600 }, month: { rides: 31, earned: 9350, paid: 6000, balance: 3350 } }),
    useTrackingState: () => o.loc,
    refreshLocationSharing: () => undefined,
    openLocationSettings: () => undefined,
    alertSupported: () => o.android,
    getAlertStatus: async () => ({ notifications: true, fullScreen: false, doNotDisturb: false, battery: true, lastReceivedAt: Date.now() - 3600000, lastPostedAt: Date.now() - 3600000, lastError: '', lastPath: 'ringing-service', ringing }),
    openAlertSetting: { notifications: async () => undefined, fullScreen: async () => undefined, doNotDisturb: async () => undefined, battery: async () => undefined } as unknown as RiderApi['openAlertSetting'],
    testAlert: async () => ({ posted: true, error: '' }),
    isAlertRinging: async () => ringing,
    stopAlert: async () => { ringing = false; },
    getCurrentPosition: async () => ({ latitude: 23.5352, longitude: 87.2966 }),
  };
}
