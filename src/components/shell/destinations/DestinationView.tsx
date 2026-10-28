// Renders the destination the router is on: Home for the role, a tab's wrapper, a More / Me page,
// the Inbox. Each screen loads on first use behind a skeleton, and a screen that crashes shows an
// error card in place instead of taking the whole app down.
import { Component, Suspense, lazy, memo, type ErrorInfo, type ReactNode } from 'react';
import type { Destination } from '../navConfig';
import { describeSpec } from '../navConfig';
import { useShell } from '../ShellContext';
import { CompactLoadingSkeleton, LoadingSkeleton } from '../../LoadingSkeleton';
import { ErrorState } from '../../ui/error-state';
import { Callout } from '../../ui/callout';
import { MoneyDestination } from './MoneyDestination';
import { StockDestination } from './StockDestination';
import { TeamDestination } from './TeamDestination';
import { InsightsDestination } from './InsightsDestination';
import { MoreDestinations } from './MoreDestinations';
import { EventsDestination } from './EventsDestination';
import { RecipesDestination } from './RecipesDestination';

const OwnerHome = lazy(() => import('../../home/OwnerHome').then((m) => ({ default: m.OwnerHome })));
const StaffHome = lazy(() => import('../../home/StaffHome').then((m) => ({ default: m.StaffHome })));
const CrewHome = lazy(() => import('../../home/CrewHome').then((m) => ({ default: m.CrewHome })));
const RiderHome = lazy(() => import('../../home/RiderHome').then((m) => ({ default: m.RiderHome })));
const ComplaintsScreen = lazy(() => import('../../complaints/ComplaintsScreen').then((m) => ({ default: m.ComplaintsScreen })));
const OpeningOverview = lazy(() => import('../../opening/OpeningChecklist').then((m) => ({ default: m.OpeningOverview })));
const SiteAuditsScreen = lazy(() => import('../../audits/SiteAuditsScreen').then((m) => ({ default: m.SiteAuditsScreen })));

class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-[720px] px-4 py-6">
          <ErrorState
            title="This screen hit an error"
            body={this.state.error.message || 'Try again, or open another tab.'}
            onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
          />
        </div>
      );
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

export const screenFallback = (
  <>
    <div className="md:hidden"><CompactLoadingSkeleton /></div>
    <div className="hidden md:block"><LoadingSkeleton /></div>
  </>
);

/** Role preview: a labelled box instead of the real screen (no data, no network). */
function PreviewScreen({ dest }: { dest: Destination }) {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 py-4 lg:px-8 lg:py-6">
      <Callout tone="info" title={`Today's screen: ${describeSpec(dest.spec)}`}>
        Route #/{dest.path}
        {dest.legacy ? ` · replaces the old "${dest.legacy.view}" view` : ''}. The role preview shows the shell only.
      </Callout>
      <div className="h-40 rounded-lg border border-dashed border-border-strong bg-surface" />
      <div className="h-24 rounded-lg border border-dashed border-border-strong bg-surface" />
    </div>
  );
}

const PREVIEW_HOME_CARDS: Record<string, string> = {
  owner: 'Profile card (hidden for the owner) · Workplace photos due · Today\'s brief · Next 7 days forecast · Shortcuts',
  staff: 'Profile card · Workplace photos due · Shift card · Today\'s brief and forecast (not production incharge) · Shortcuts',
  crew: 'Shift card · Workplace photos due · Profile card · Shortcuts',
  rider: 'Profile card · Shift card · My rides (rider mode)',
};

/** Role preview of a Home stub: which of today's cards it shows, and the real shortcuts. */
function PreviewHome({ home }: { home: string }) {
  return (
    <div className="pb-6">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <Callout tone="info" title={`Home stub (${home}) - WP1 builds "Today"`}>{PREVIEW_HOME_CARDS[home]}</Callout>
      </div>
      {home !== 'rider' && (
        <Suspense fallback={null}>
          <PreviewShortcuts />
        </Suspense>
      )}
    </div>
  );
}
const PreviewShortcuts = lazy(() => import('../../home/HomeShortcuts').then((m) => ({ default: () => <m.HomeShortcuts extra={['stock/requests', 'team/attendance']} /> })));

export const DestinationView = memo(function DestinationView({ dest, params, renderShellPage }: { dest: Destination; params: Record<string, string>; renderShellPage: (dest: Destination) => ReactNode }) {
  const shell = useShell();
  const spec = dest.spec;
  let content: ReactNode;
  if (spec.screen === 'More' || spec.screen === 'Inbox') {
    content = renderShellPage(dest);
  } else if (shell.preview) {
    content = spec.screen === 'Home' ? <PreviewHome home={spec.home} /> : <PreviewScreen dest={dest} />;
  } else {
    switch (spec.screen) {
      case 'Home':
        content = spec.home === 'owner' ? <OwnerHome /> : spec.home === 'crew' ? <CrewHome /> : spec.home === 'rider' ? <RiderHome /> : <StaffHome />;
        break;
      case 'Analytics':
        content = dest.path === 'insights' ? <InsightsDestination params={params} /> : <MoneyDestination spec={spec} params={params} />;
        break;
      case 'SalesManagement':
      case 'SalesView':
      case 'InventoryManagement':
        content = <MoneyDestination spec={spec} params={params} />;
        break;
      case 'ProductionRequests':
      case 'ProductionManagement':
      case 'AdvancedInventoryManagement':
      case 'StockOutLog':
      case 'RiderTrips':
      case 'IncomingDeliveries':
        content = <StockDestination spec={spec} params={params} />;
        break;
      case 'EmployeeManagement':
      case 'AttendancePortal':
      case 'PayrollManagement':
      case 'EmployeeDashboard':
      case 'HierarchyManagement':
      case 'TeamKpis':
      case 'MyKpis':
      case 'WorkplaceChecks':
        content = <TeamDestination spec={spec} params={params} />;
        break;
      case 'AssetsManagement':
      case 'InventoryItemsManagement':
      case 'ExportData':
      case 'BackupRestore':
      case 'RiderProfile':
        content = <MoreDestinations spec={spec} />;
        break;
      case 'AuditDashboard':
        content = shell.renderAudit?.(spec.view) ?? null;
        break;
      case 'Events':
        content = <EventsDestination params={params} />;
        break;
      case 'Recipes':
        content = <RecipesDestination mode={spec.mode} params={params} withHeader={!dest.path.startsWith('production/')} />;
        break;
      case 'Complaints':
        content = <ComplaintsScreen onBack={() => shell.router.back()} />;
        break;
      case 'SiteAudits':
        content = <SiteAuditsScreen />;
        break;
      case 'OpeningChecklist':
        content = <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8"><OpeningOverview /></div>;
        break;
      default:
        content = null;
    }
  }
  return (
    <ScreenBoundary key={dest.path}>
      <Suspense fallback={screenFallback}>{content}</Suspense>
    </ScreenBoundary>
  );
});
