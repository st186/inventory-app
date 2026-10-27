// Stub (WP0b) for store crew and kitchen crew Home: the shift card and workplace photos due card
// that sat on their old landing page (My Payouts, now the Pay tab), the profile card (Aadhaar and
// phone - plain crew never saw it before), and shortcuts (Receive, Out of stock, Pay).
// WP1 owns this file and builds the crew "Today" (big Start/End shift, checklist, pay snapshot).
import { Suspense, lazy } from 'react';
import { useShell } from '../shell/ShellContext';
import { WorkplaceDueCard } from '../workplace/WorkplaceDueCard';
import { HomeShortcuts, useFocusProfile } from './HomeShortcuts';

const ProfileCompletionCard = lazy(() => import('../ProfileCompletionCard').then((m) => ({ default: m.ProfileCompletionCard })));
const ShiftClockCard = lazy(() => import('../kpi/ShiftClockCard').then((m) => ({ default: m.ShiftClockCard })));

export function CrewHome() {
  const { user, router } = useShell();
  const profileRef = useFocusProfile();
  return (
    <div className="pb-6">
      <Suspense fallback={null}><ShiftClockCard isLead={false} /></Suspense>
      <WorkplaceDueCard onOpen={() => router.push('my-checks')} />
      <div ref={profileRef}>
        <Suspense fallback={null}><ProfileCompletionCard accessToken={user.accessToken || ''} /></Suspense>
      </div>
      <HomeShortcuts extra={['stock/out-of-stock', 'my-attendance']} />
    </div>
  );
}
