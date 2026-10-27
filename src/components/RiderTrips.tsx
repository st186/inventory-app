// Rides: the rider's own screens and the staff "Riders" screen (pieces in components/riders).
//   mode "rider", variant "home"  - Home: the current ride first, then availability, earnings,
//                                   today's rides (RiderHome passes its own rows in homeSlot)
//   mode "rider", variant "trips" - Trips: History · Payments, a ride in a sheet
//   mode "staff"                  - Call a rider (canDispatch), rides in progress, live map,
//                                   today's rides and fares, riders, map pins
// Same calls, timers and permissions as before the new look.
import { useState, type ReactNode } from 'react';
import type { RiderTrip } from '../utils/api';
import { DispatchView } from './riders/DispatchView';
import { RiderHomeView } from './riders/RiderHomeView';
import { RiderTripsPanel, type TripsTab } from './riders/RiderTripsPanel';
import { TripDetailSheet } from './riders/TripDetail';
import { useRiderApi } from './riders/riderApi';
import { useRiderTrips, type RiderTripsState } from './riders/useRiderTrips';
import type { PhoneBookEntry, RideRequest } from './riders/tripUtils';
import { useT } from '../utils/i18n';

type RiderTripsProps = {
  // 'rider' = the rider's own screen; 'staff' = what production / store / cluster head see.
  mode: 'rider' | 'staff';
  // Rider only: 'home' (default) or 'trips' (History · Payments).
  variant?: 'home' | 'trips';
  // Production incharge, operations manager or cluster head: may call riders and mark orders ready.
  canDispatch?: boolean;
  stores?: { id: string; name: string }[];
  // Store staff only see rides headed to their store (the server enforces this too).
  defaultStoreId?: string | null;
  // Stock requests, so a ride can carry the ones it is delivering (and the store confirms once);
  // with full requests the screens also show the bags and momos a ride carries.
  stockRequests?: RideRequest[];
  // The staff list (when the login has it) for the call buttons: the rider's phone for dispatch,
  // the store / production incharge's phone for the rider. Without it there are no call buttons.
  people?: PhoneBookEntry[];
  // Rider Home: rows shown under the current ride (profile, shift card).
  homeSlot?: ReactNode;
  // Rider Home: opens the Trips tab when the shell has one (else Home shows Trips in a sheet).
  onOpenTrips?: (tab: TripsTab) => void;
  // Rider Home: opens the rider profile (to change the hours).
  onOpenProfile?: () => void;
  // Rider Trips: which tab to open on.
  initialTab?: TripsTab;
};

export function RiderTrips({
  mode, variant = 'home', canDispatch = false, stores = [], defaultStoreId = null, stockRequests = [], people = [],
  homeSlot, onOpenTrips, onOpenProfile, initialTab,
}: RiderTripsProps) {
  const state = useRiderTrips(mode);
  const { lang } = useT();

  if (mode === 'staff') {
    return <DispatchView state={state} canDispatch={canDispatch} stores={stores} defaultStoreId={defaultStoreId} stockRequests={stockRequests} people={people} />;
  }
  if (variant === 'trips') {
    return <RiderTripsPage state={state} requests={stockRequests} people={people} initialTab={initialTab} />;
  }
  return (
    <div lang={lang}>
      <RiderHomeView state={state} requests={stockRequests} people={people} homeSlot={homeSlot} onOpenTrips={onOpenTrips} onOpenProfile={onOpenProfile} />
    </div>
  );
}

function RiderTripsPage({ state, requests, people, initialTab }: { state: RiderTripsState; requests: RideRequest[]; people: PhoneBookEntry[]; initialTab?: TripsTab }) {
  const rapi = useRiderApi();
  const { lang } = useT();
  const [trip, setTrip] = useState<RiderTrip | null>(null);
  const [open, setOpen] = useState(false);
  const { trips, busyId, run } = state;
  const finished = trips.filter((x) => x.status === 'delivered' || x.status === 'cancelled').length;
  const delivered = trips.filter((x) => x.status === 'delivered').length;
  return (
    <div lang={lang} className="mx-auto w-full max-w-[720px] pb-6">
      <RiderTripsPanel refreshKey={finished} deliveredCount={delivered} initialTab={initialTab} onOpenTrip={(x) => { setTrip(x); setOpen(true); }} />
      <TripDetailSheet
        trip={trip}
        open={open && !!trip}
        onOpenChange={setOpen}
        viewer={{ mode: 'rider', current: false, trackingState: null, onStep: () => undefined, onOpenSettings: rapi.openLocationSettings }}
        requests={requests}
        people={people}
        busy={!!trip && busyId === trip.id}
        run={run}
      />
    </div>
  );
}
