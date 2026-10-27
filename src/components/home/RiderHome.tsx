// Stub (WP0b) for the rider's Home: what their old landing page (My rides) showed - the profile
// card, the shift card and the rides screen in rider mode (current ride, next-step button,
// availability, earnings).
// WP1 / WP7 own this file and build the rider "Today" (current trip first, big action button).
import { Suspense, lazy } from 'react';
import { useShell } from '../shell/ShellContext';
import { useFocusProfile } from './HomeShortcuts';

const ProfileCompletionCard = lazy(() => import('../ProfileCompletionCard').then((m) => ({ default: m.ProfileCompletionCard })));
const ShiftClockCard = lazy(() => import('../kpi/ShiftClockCard').then((m) => ({ default: m.ShiftClockCard })));
const RiderTrips = lazy(() => import('../RiderTrips').then((m) => ({ default: m.RiderTrips })));

export function RiderHome() {
  const { user, context, stores, nav } = useShell();
  const profileRef = useFocusProfile();
  return (
    <div className="pb-6">
      <div ref={profileRef}>
        <Suspense fallback={null}><ProfileCompletionCard accessToken={user.accessToken || ''} /></Suspense>
      </div>
      <Suspense fallback={null}><ShiftClockCard isLead={false} /></Suspense>
      <Suspense fallback={null}>
        <RiderTrips
          mode="rider"
          stockRequests={context.productionRequests}
          canDispatch={nav.perms.canDispatchRiders}
          stores={(stores || []).map((st) => ({ id: st.id, name: st.name }))}
          defaultStoreId={user.storeId || null}
        />
      </Suspense>
    </div>
  );
}
