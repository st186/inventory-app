// Dev-only entry for riders-preview.html: the rider screens (WP7) on made-up data, inside the
// real app shell where they live, with no sign-in and no server. Not part of the production
// build (vite only bundles index.html).
//   ?view=home|trips|dispatch|profile   &lang=en|bn|hi
//   home:     &trip=called|needs_rate|proposed|on_the_way|arrived|ready|picked_up|round_trip|none
//             &loc=active|starting|denied|error  &ring=1 (ride-request horn)  &android=1 (alert set-up)
//             &unavailable=1  &phones=0 (no staff list, as riders get today)  &empty=1
//   trips:    &tab=history|payments
//   dispatch: &role=ops|production|store  &empty=1
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { InventoryContextType } from '../../App';
import type * as api from '../../utils/api';
import type { NotificationsSource } from '../../components/Notifications';
import { AppShell } from '../../components/shell/AppShell';
import { buildNav } from '../../components/shell/navConfig';
import { HomeDataProvider, realHomeData, type HomeData } from '../../components/home/homeData';
import { RiderApiProvider } from '../../components/riders/riderApi';
import { RiderTrips } from '../../components/RiderTrips';
import { Toaster } from '../../components/ui/sonner';
import { ConfirmProvider } from '../../components/ui/confirm';
import { setAppLanguage, setAppLanguageOwner, type AppLanguage } from '../../utils/appLanguage';
import { useT } from '../../utils/i18n';
import type { TrackingState } from '../../utils/riderTracking';
import { PEOPLE, REQUESTS, STORES, mockRiderApi, today, type TripStage } from './mock';
import '../../styles/fonts.css';
import '../../index.css';

const p = new URLSearchParams(window.location.search);
const view = (['home', 'trips', 'dispatch', 'profile'].includes(p.get('view') || p.get('screen') || '') ? p.get('view') || p.get('screen') : 'home') as 'home' | 'trips' | 'dispatch' | 'profile';
const lang = (['en', 'bn', 'hi'].includes(p.get('lang') || '') ? p.get('lang') : 'en') as AppLanguage;
const stage = (p.get('trip') || 'on_the_way') as TripStage;
const loc = (p.get('loc') || 'active') as TrackingState;
const role = (['ops', 'production', 'store'].includes(p.get('role') || '') ? p.get('role') : 'production') as 'ops' | 'production' | 'store';
const phones = p.get('phones') !== '0';
const empty = p.get('empty') === '1';

const base = { accessToken: 'preview', assignedStoreIds: [] as string[], assignedProductionHouseIds: [] as string[] };
const USERS: Record<string, NonNullable<InventoryContextType['user']>> = {
  rider: { ...base, email: 'rider@example.test', name: 'Raju Demo', role: 'employee', employeeId: 'BM-061', storeId: null, designation: 'rider' },
  ops: { ...base, email: 'ops@example.test', name: 'Ops Manager Demo', role: 'manager', employeeId: 'BM-010', storeId: null, designation: null },
  production: { ...base, email: 'prodm@example.test', name: 'Kitchen Head Demo', role: 'manager', employeeId: 'BM-031', storeId: 'PH-1', designation: 'production_incharge', assignedProductionHouseIds: ['PH-1'], assignedStoreIds: ['STORE-1', 'STORE-2'] },
  store: { ...base, email: 'store@example.test', name: 'Store Lead Demo', role: 'employee', employeeId: 'BM-021', storeId: 'STORE-1', designation: 'store_incharge' },
};
const user = view === 'dispatch' ? USERS[role] : USERS.rider;
const route = view === 'dispatch' ? (role === 'production' ? 'production/riders' : 'stock/riders') : view === 'profile' ? 'rider-profile' : 'home';
// The shell reads ?view= as an old push-notification target, so it is handed over as ?screen=
// (the address keeps working when reloaded) and the screen's route goes in the hash.
if (view !== 'trips') {
  const kept = new URLSearchParams(window.location.search);
  kept.delete('view');
  kept.set('screen', view);
  window.history.replaceState(null, '', `${window.location.pathname}?${kept.toString()}#/${route}`);
}

const riderApi = (() => {
  const api0 = mockRiderApi({ stage, loc, ring: p.get('ring') === '1', android: p.get('android') === '1', staff: view === 'dispatch', unavailable: p.get('unavailable') === '1', empty });
  if (view === 'dispatch' && role === 'store') {
    const all = api0.getRiderTrips;
    api0.getRiderTrips = async () => {
      const r = await all();
      return { ...r, trips: r.trips.filter((x) => x.stops.some((s) => s.kind === 'store' && s.id === 'STORE-1')) };
    };
  }
  return api0;
})();

const later = <T,>(value: T, ms = 200) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const homeData: HomeData = {
  ...realHomeData,
  getShiftToday: () => later({
    required: true, employeeId: user.employeeId as string, date: today, serverNow: new Date().toISOString(), exempt: true, workplace: 'none',
    punch: { employeeId: user.employeeId as string, date: today, outsideWorkplace: false, in: { at: new Date(`${today}T09:02:00+05:30`).toISOString(), source: 'manual', verified: true }, out: null },
    settings: { shiftStart: '09:00', shiftEnd: '21:00', graceMin: 10, weeklyOff: [] }, workingDay: true,
    window: { startAt: '', endAt: '', shiftStartAt: '', shiftEndAt: '' }, pins: [], radiusM: 100, consent: null,
  } as never),
  getMyProfile: () => later({ required: true, complete: true, missing: [] }),
  getTeamPending: () => later({ pending: [] }),
};

const notifications: NotificationsSource = {
  list: async () => ({ notifications: [], unreadCount: 0 }),
  markRead: async () => undefined,
  markAllRead: async () => undefined,
};

function mockContext(): InventoryContextType {
  const noop = async () => undefined;
  return new Proxy(
    {
      user, inventory: [], overheads: [], fixedCosts: [], salesData: [], categorySalesData: [], onlineCashRecalibrations: [], onlineSalesData: [],
      onlinePayoutData: [], aggregatorSettlements: [], productionData: [], productionHouses: [{ id: 'PH-1', name: 'Benachity kitchen' }], stockRequests: [],
      productionRequests: REQUESTS, stores: STORES, managedStoreIds: [], managedProductionHouseIds: [], inventoryItems: [], isManager: user.role === 'manager',
      dataRefreshedAt: 0, setProductionHouses: () => undefined,
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : noop) },
  ) as unknown as InventoryContextType;
}

function Shell() {
  const nav = React.useMemo(() => buildNav(user, { today, storeCount: STORES.length }), []);
  const context = React.useMemo(mockContext, []);
  return (
    <AppShell
      nav={nav}
      user={user}
      context={context}
      stores={STORES as unknown as api.Store[]}
      employees={(phones ? PEOPLE : []) as unknown as api.Employee[]}
      selectedStoreId={null}
      onStoreChange={() => undefined}
      refreshStores={async () => undefined}
      badges={{}}
      notificationsSource={notifications}
      askBunnyStoreId={null}
      passwordDaysLeft={null}
      onChangePassword={() => undefined}
      onLogout={() => undefined}
    />
  );
}

// Trips has no tab in the shell yet (see the WP7 report): shown on its own under a top bar.
function TripsPage() {
  const { t } = useT();
  return (
    <div className="min-h-dvh bg-bg pb-[var(--bottom-nav-h)] md:pb-0" lang={lang}>
      <header className="sticky top-0 z-(--z-sticky) flex h-14 items-center bg-surface px-4">
        <span className="text-title font-semibold text-text">{t('rider.trips.title')}</span>
      </header>
      <RiderTrips mode="rider" variant="trips" stockRequests={REQUESTS} people={phones ? PEOPLE : []} initialTab={p.get('tab') === 'payments' ? 'payments' : 'history'} />
      <nav aria-hidden="true" className="fixed inset-x-0 bottom-0 z-(--z-nav) h-(--bottom-nav-h) border-t border-border bg-surface md:hidden" />
    </div>
  );
}

function Preview() {
  React.useLayoutEffect(() => {
    setAppLanguageOwner(`riders-preview-${user.employeeId}`, user);
    setAppLanguage(lang);
  }, []);
  return (
    <RiderApiProvider value={riderApi}>
      <HomeDataProvider value={homeData}>
        {view === 'trips' ? <TripsPage /> : <Shell />}
      </HomeDataProvider>
    </RiderApiProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <Preview />
    <Toaster />
    <ConfirmProvider />
  </>,
);
