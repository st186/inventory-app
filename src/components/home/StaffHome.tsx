// Stub (WP0b) for Home of the operations manager, store incharge and production incharge (either
// login): the cards that sat above their Analytics landing page - profile, workplace photos due,
// the shift card - plus the brief and forecast that opened Store Analytics, and shortcuts to the
// day's places (Stock requests / production queue, day close, expenses, approvals).
// WP1 owns this file and builds "Today": shift card, checklist in due-time order, alerts.
import { Suspense, lazy } from 'react';
import { useShell } from '../shell/ShellContext';
import { WorkplaceDueCard } from '../workplace/WorkplaceDueCard';
import { useInsightsOverview } from '../insights/useInsightsOverview';
import { HomeShortcuts, useFocusProfile } from './HomeShortcuts';

const ProfileCompletionCard = lazy(() => import('../ProfileCompletionCard').then((m) => ({ default: m.ProfileCompletionCard })));
const ShiftClockCard = lazy(() => import('../kpi/ShiftClockCard').then((m) => ({ default: m.ShiftClockCard })));
const DailyBriefCard = lazy(() => import('../insights/DailyBriefCard').then((m) => ({ default: m.DailyBriefCard })));
const ForecastCard = lazy(() => import('../insights/ForecastCard').then((m) => ({ default: m.ForecastCard })));

export function StaffHome() {
  const { user, stores, nav, router } = useShell();
  const profileRef = useFocusProfile();
  // Production incharges opened Analytics on Production, which has no brief or forecast.
  const showBrief = !nav.perms.isProductionIncharge;
  const insightsStoreId: string | null = !showBrief
    ? null
    : (user.storeId && String(user.storeId).startsWith('STORE-') ? user.storeId : null)
      || stores.find((s) => s.productionHouseId)?.id || stores[0]?.id || null;
  const overview = useInsightsOverview(insightsStoreId ? user.accessToken : undefined, insightsStoreId);
  const checksPath = nav.destinations['my-checks'] ? 'my-checks' : 'team/checks';
  return (
    <div className="pb-6">
      <div ref={profileRef}>
        <Suspense fallback={null}><ProfileCompletionCard accessToken={user.accessToken || ''} /></Suspense>
      </div>
      <WorkplaceDueCard onOpen={() => router.push(checksPath)} />
      <Suspense fallback={null}><ShiftClockCard isLead /></Suspense>
      {insightsStoreId && (
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 pt-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Suspense fallback={null}>
            <DailyBriefCard accessToken={user.accessToken || ''} storeId={insightsStoreId} canManage={nav.perms.isOperationsManager} />
            <ForecastCard data={overview.data} loading={overview.loading} error={overview.error} />
          </Suspense>
        </div>
      )}
      <HomeShortcuts extra={['team/attendance', 'insights']} />
    </div>
  );
}
