// Stub (WP0b) for the owner's Home: the cards that used to sit above Analytics (workplace photos
// due; the profile card hides itself for the owner), today's AI brief and the 7-day forecast from
// the top of Analytics > Overview, and shortcuts. Analytics itself is the Insights tab now.
// WP1 owns this file and builds the real "Today" (profit that accrues rent and salaries through
// the month first, then needs-attention, brief, forecast, team strip).
import { Suspense, lazy } from 'react';
import { useShell } from '../shell/ShellContext';
import { WorkplaceDueCard } from '../workplace/WorkplaceDueCard';
import { useInsightsOverview } from '../insights/useInsightsOverview';
import { HomeShortcuts, useFocusProfile } from './HomeShortcuts';

const ProfileCompletionCard = lazy(() => import('../ProfileCompletionCard').then((m) => ({ default: m.ProfileCompletionCard })));
const DailyBriefCard = lazy(() => import('../insights/DailyBriefCard').then((m) => ({ default: m.DailyBriefCard })));
const ForecastCard = lazy(() => import('../insights/ForecastCard').then((m) => ({ default: m.ForecastCard })));

export function OwnerHome() {
  const { user, stores, selectedStoreId, nav, router } = useShell();
  const profileRef = useFocusProfile();
  // The same store Analytics used for its brief and forecast.
  const insightsStoreId: string | null = selectedStoreId
    || (user.storeId && String(user.storeId).startsWith('STORE-') ? user.storeId : null)
    || stores.find((s) => s.productionHouseId)?.id || stores[0]?.id || null;
  const overview = useInsightsOverview(user.accessToken, insightsStoreId);
  const canManage = nav.perms.isClusterHead || nav.perms.isOperationsManager;
  const checksPath = nav.destinations['team/checks'] ? 'team/checks' : 'my-checks';
  return (
    <div className="pb-6">
      <div ref={profileRef}>
        <Suspense fallback={null}><ProfileCompletionCard accessToken={user.accessToken || ''} /></Suspense>
      </div>
      <WorkplaceDueCard onOpen={() => router.push(checksPath)} />
      {insightsStoreId && (
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 pt-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Suspense fallback={null}>
            <DailyBriefCard accessToken={user.accessToken || ''} storeId={insightsStoreId} canManage={canManage} />
            <ForecastCard data={overview.data} loading={overview.loading} error={overview.error} />
          </Suspense>
        </div>
      )}
      <HomeShortcuts extra={['stock/requests']} />
    </div>
  );
}
