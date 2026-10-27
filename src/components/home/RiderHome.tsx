// Home of the rider (design review b4): the current ride first - from, to, what's in it, the big
// button for its next step, the live-location chip and call buttons - then the profile row while
// details are missing, the shift card, availability, today's earnings and today's rides
// (RiderTrips in rider mode, variant "home"; components/riders).
import { Suspense, lazy, useEffect } from 'react';
import { IdCard } from 'lucide-react';
import { useShell } from '../shell/ShellContext';
import { ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Skeleton } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import { ShiftClockCard } from '../kpi/ShiftClockCard';
import { useProfileCompletion } from '../ProfileCompletionCard';
import { HomePage, useOpen } from './HomeParts';
import { useHomeData } from './homeData';
import { useFocusProfile } from './HomeShortcuts';

const RiderTrips = lazy(() => import('../RiderTrips').then((m) => ({ default: m.RiderTrips })));

export function RiderHome() {
  const { user, context, stores, employees, nav } = useShell();
  const { t } = useT();
  const data = useHomeData();
  const { open, has } = useOpen();
  const profile = useProfileCompletion(user.accessToken || '');
  const focusProfile = useFocusProfile();
  useEffect(() => { if (focusProfile && profile.needed) profile.openSheet(); }, [focusProfile, profile.needed, profile.openSheet]);
  const tripsProps = {
    stockRequests: context.productionRequests,
    canDispatch: nav.perms.canDispatchRiders,
    stores: (stores || []).map((st) => ({ id: st.id, name: st.name })),
    defaultStoreId: user.storeId || null,
  };
  const homeSlot = (
    <>
      {profile.needed && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <ListRow icon={IdCard} iconTone="warning" title={t('home.task.profile')} subtitle={t('home.task.profileMeta')} trailing={<StatusChip status="task.due" />} chevron onClick={profile.openSheet} />
        </div>
      )}
      <ShiftClockCard isLead={false} framed={false} />
    </>
  );
  if (data.renderRiderTrips) {
    // Home preview (home-preview.html): a placeholder instead of the rides, which poll the server.
    return (
      <>
        <HomePage className="pb-0">{homeSlot}</HomePage>
        {data.renderRiderTrips(tripsProps)}
        {profile.sheet}
      </>
    );
  }
  return (
    <>
      <HomePage>
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
          <RiderTrips
            mode="rider"
            variant="home"
            {...tripsProps}
            people={employees || []}
            homeSlot={homeSlot}
            // A Trips tab for riders (route "trips") opens there; until the shell has one, Home
            // shows History and Payments in a sheet.
            onOpenTrips={has('trips') ? (tab) => open('trips', { tab }) : undefined}
            onOpenProfile={has('rider-profile') ? () => open('rider-profile') : undefined}
          />
        </Suspense>
      </HomePage>
      {profile.sheet}
    </>
  );
}
