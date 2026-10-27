// Home of the rider: the profile row while details are missing, the shift card, and the rides
// screen in rider mode, which already leads with the current ride, its next-step button and the
// live-location status (RiderTrips belongs to the riders package; see the WP1 report for the
// changes that would put the current ride above everything else).
import { Suspense, lazy, useEffect } from 'react';
import { IdCard } from 'lucide-react';
import { useShell } from '../shell/ShellContext';
import { ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { useT } from '../../utils/i18n';
import { ShiftClockCard } from '../kpi/ShiftClockCard';
import { useProfileCompletion } from '../ProfileCompletionCard';
import { HomePage } from './HomeParts';
import { useHomeData } from './homeData';
import { useFocusProfile } from './HomeShortcuts';

const RiderTrips = lazy(() => import('../RiderTrips').then((m) => ({ default: m.RiderTrips })));

export function RiderHome() {
  const { user, context, stores, nav } = useShell();
  const { t } = useT();
  const data = useHomeData();
  const profile = useProfileCompletion(user.accessToken || '');
  const focusProfile = useFocusProfile();
  useEffect(() => { if (focusProfile && profile.needed) profile.openSheet(); }, [focusProfile, profile.needed, profile.openSheet]);
  const tripsProps = {
    stockRequests: context.productionRequests,
    canDispatch: nav.perms.canDispatchRiders,
    stores: (stores || []).map((st) => ({ id: st.id, name: st.name })),
    defaultStoreId: user.storeId || null,
  };
  return (
    <>
      <HomePage className="pb-0">
        {profile.needed && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <ListRow icon={IdCard} iconTone="warning" title={t('home.task.profile')} subtitle={t('home.task.profileMeta')} trailing={<StatusChip status="task.due" />} chevron onClick={profile.openSheet} />
          </div>
        )}
        <ShiftClockCard isLead={false} framed={false} />
      </HomePage>
      {data.renderRiderTrips ? data.renderRiderTrips(tripsProps) : (
        <Suspense fallback={null}>
          <RiderTrips mode="rider" {...tripsProps} />
        </Suspense>
      )}
      {profile.sheet}
    </>
  );
}
