// Dev-only preview of the Home screens (home-preview.html) on made-up data, inside the real app
// shell, so they can be looked at without signing in. Not in the production build.
//
//   /home-preview.html                              every role, links to each
//   /home-preview.html?role=owner                   one role's Home, full screen
//     &lang=bn        App language                 &event=1   staff and crew: an event day
//     &shift=on       the shift already started    &empty=1   nothing waiting (all caught up)
//
// Only Home is wired to mock data: other tabs would talk to the server, so stay on Home.
import * as React from 'react';
import type { InventoryContextType } from '../App';
import type * as api from '../utils/api';
import type * as kpi from '../components/kpi/kpiApi';
import { AppShell } from '../components/shell/AppShell';
import { buildNav } from '../components/shell/navConfig';
import type { NotificationsSource } from '../components/Notifications';
import { HomeDataProvider, realHomeData, type HomeData } from '../components/home/homeData';
import { EventsApiProvider } from '../components/events';
import { eventsApi } from '../utils/eventsApi';
import { Callout } from '../components/ui/callout';
import { setAppLanguage, setAppLanguageOwner, type AppLanguage } from '../utils/appLanguage';
import { addDays, getTodayIST } from '../utils/timezone';
import { PREVIEW_PERSONAS } from './ShellPreview';
import { buildHomeSample, istIso } from './homeSample';

export type Params = { role: string; lang: AppLanguage | null; event: boolean; shiftOn: boolean; empty: boolean };

function readParams(): Params {
  const p = new URLSearchParams(window.location.search);
  const lang = p.get('lang');
  return {
    role: p.get('role') || '',
    lang: lang === 'bn' || lang === 'hi' || lang === 'en' ? lang : null,
    event: p.get('event') === '1',
    shiftOn: p.get('shift') === 'on',
    empty: p.get('empty') === '1',
  };
}

const later = <T,>(value: T, ms = 250) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const BRIEF = `Yesterday
- Sales came to about 13,400, a little above a usual Monday.
- Chicken cheese ran out at 8:10 pm.
Do today
- Prep about 640 chicken momos: Tuesdays after a festival weekend run busy.
- Yesterday's cash count is short by 240 and waits for your approval.
- Two leave requests need an answer before Friday.
This week
- Friday looks like the busiest day.
Watch
- Paneer stock is low at the store.`;

function forecastFor(today: string) {
  const base = [9800, 11200, 12000, 10400, 9900, 13600, 14200];
  return base.map((rev, i) => {
    const date = addDays(today, i);
    const nonVeg = Math.round(rev / 22);
    const veg = Math.round(rev / 75);
    return {
      date, revenue: rev, revenueLow: Math.round(rev * 0.9), revenueHigh: Math.round(rev * 1.1),
      vegPieces: veg, nonVegPieces: nonVeg, basis: 'the last 6 weeks',
      pieces: { chicken: Math.round(nonVeg * 0.8), chickenCheese: Math.round(nonVeg * 0.2), veg: Math.round(veg * 0.6), cheeseCorn: Math.round(veg * 0.2), paneer: Math.round(veg * 0.2), vegKurkure: 0, chickenKurkure: 0 },
      event: i === 5 ? { name: 'Local fair', effect: 'busy', confirmed: true } : null,
    };
  });
}

export function mockHomeData(personaId: string, params: Params, sample: ReturnType<typeof buildHomeSample>): HomeData {
  const today = getTodayIST();
  const workplace = personaId.startsWith('production') || personaId === 'kitchen-crew' ? 'production' : personaId === 'rider' ? 'none' : 'store';
  const punchIn = params.shiftOn || personaId.endsWith('crew');
  const shift = (): kpi.ShiftToday => ({
    required: true, employeeId: 'DEMO', date: today, serverNow: new Date().toISOString(), exempt: personaId === 'rider',
    workplace: workplace as kpi.ShiftToday['workplace'],
    punch: punchIn ? { employeeId: 'DEMO', date: today, outsideWorkplace: false, in: { at: istIso(today, workplace === 'production' ? '07:56' : '14:52'), source: 'manual', verified: true, distanceM: 18 }, out: null } : null,
    settings: workplace === 'production' ? { shiftStart: '08:00', shiftEnd: '20:00', graceMin: 10, weeklyOff: [] } : { shiftStart: '15:00', shiftEnd: '22:30', graceMin: 10, weeklyOff: [] },
    workingDay: true,
    window: { startAt: '', endAt: '', shiftStartAt: '', shiftEndAt: '' },
    pins: [{ kind: 'store', id: 'STORE-1', name: 'Store A', lat: 0, lng: 0 }],
    radiusM: 100,
    consent: null,
  });
  const checks = {
    date: today, earlyMinutes: 60,
    items: [
      { id: 'c1', name: 'Counter', nameBn: 'কাউন্টার', start: '09:00', end: '10:00', hasPhoto: true, locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'done' },
      { id: 'c2', name: 'Fryer', nameBn: 'ফ্রায়ার', start: '15:00', end: '16:00', hasPhoto: false, locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'due' },
      { id: 'c3', name: 'Steamer', nameBn: 'স্টিমার', start: '15:00', end: '16:00', hasPhoto: false, locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'due' },
    ],
  };
  const needsProfile = !params.empty && personaId !== 'owner' && personaId !== 'ops-manager';
  const overview = { forecast: forecastFor(today), yesterday: { date: addDays(today, -1), actual: 13420, expected: { revenue: 12500, event: null } } } as unknown as api.InsightsOverview;
  const reviewItems = params.empty ? [] : [1, 2, 3].map((n) => ({ date: today, employeeId: 'E-2', personName: 'Counter Crew Demo', itemId: `c${n}`, name: 'Spot', nameBn: '', hint: '', start: '09:00', end: '10:00', status: 'done', hasPhoto: true, flag: null }));
  return {
    ...realHomeData,
    getShiftToday: () => later(shift()),
    punch: async (action) => ({ punch: { employeeId: 'DEMO', date: today, outsideWorkplace: false, in: { at: new Date().toISOString(), source: 'manual', verified: true }, out: action === 'out' ? { at: new Date().toISOString(), source: 'manual', verified: true } : null } }),
    confirmDetected: async () => ({ punch: shift().punch as kpi.PunchRecord }),
    dismissDetected: async () => ({ punch: null }),
    getTeamPending: () => later({ pending: [] }),
    saveShiftConsent: async () => ({}),
    getTeamKpis: () => later({ month: '', today, monthComplete: true, config: { radiusM: 100, showMoneyToStaff: false, punchSince: null }, canEditMoney: true, canApprove: true, people: [] }),
    getMyChecks: () => later(checks as any),
    getWorkplaceAccess: () => later({ canSetup: true, locations: [{ kind: 'store', id: 'STORE-1', name: 'Store A' }], settings: { aiEnabled: true, aiThreshold: 6 } }),
    getWorkplaceReview: () => later({ from: today, to: today, location: { kind: 'store', id: 'STORE-1', name: 'Store A' }, items: reviewItems } as any),
    getMyProfile: () => later(needsProfile ? { required: true, complete: false, missing: ['aadharBack', 'contactEmail'], phone: '9800000000' } : { required: false, complete: true, missing: [] }),
    updateMyProfile: async (_t, updates) => ({ required: true, complete: true, missing: [], phone: updates.phone }),
    getAiBrief: () => later({ brief: { text: BRIEF, generatedAt: istIso(today, '01:48') } as api.AiBrief }, 400),
    getInsightsOverview: () => later(overview, 350),
    getPayouts: () => later(sample.payouts),
    getEmployees: () => later(sample.employees),
    getArchivedEmployees: () => later(sample.archived),
    getOverheads: () => later(sample.overheads),
    getOnlineLoans: () => later(sample.loans),
    fetchCashTopupRequests: () => later(sample.topups),
    getAllLeaves: () => later(params.empty ? [] : [
      { id: 'lv1', employeeId: 'DEMO-41', leaveDate: addDays(today, 3), status: 'pending' },
      { id: 'lv2', employeeId: 'DEMO-51', leaveDate: addDays(today, 4), status: 'pending' },
      { id: 'lv3', employeeId: 'DEMO-61', leaveDate: today, status: 'approved' },
      { id: 'lv4', employeeId: 'DEMO-41', leaveDate: addDays(today, 2), status: 'approved' },
    ] as any),
    getTeamLeaveCalendar: () => later({
      today, from: today, to: addDays(today, 34), people: 8,
      places: [
        { key: 'store:STORE-1', kind: 'store', id: 'STORE-1', name: 'Store A', people: 3 },
        { key: 'production:PH-1', kind: 'production', id: 'PH-1', name: 'Kitchen A', people: 2 },
        { key: 'riders', kind: 'riders', id: null, name: '', people: 1 },
        { key: 'managers', kind: 'managers', id: null, name: '', people: 2 },
      ],
      leaves: params.empty ? [] : [
        { leaveDate: today, employeeId: 'DEMO-61', name: 'Kitchen Crew Demo', placeKey: 'production:PH-1', leaveType: 'full', status: 'approved' },
        { leaveDate: addDays(today, 2), employeeId: 'DEMO-41', name: 'Counter Crew Demo', placeKey: 'store:STORE-1', leaveType: 'half', status: 'approved' },
        { leaveDate: addDays(today, 3), employeeId: 'DEMO-41', name: 'Counter Crew Demo', placeKey: 'store:STORE-1', leaveType: 'full', status: 'pending' },
        { leaveDate: addDays(today, 3), employeeId: 'DEMO-51', name: 'Store Lead Demo', placeKey: 'store:STORE-1', leaveType: 'full', status: 'pending' },
      ],
    }),
    getAllRecalibrationsForApproval: () => later({ recalibrations: params.empty ? [] : [{ id: 'r1' }] }),
    getEmployeesByIncharge: () => later(sample.employees.filter((e) => e.inchargeId)),
    getTimesheets: () => later(params.empty ? [] : [{ id: 'ts1', status: 'pending' }, { id: 'ts2', status: 'approved' }] as any),
    getStockOuts: () => later(params.empty ? [] : [{ id: 'so1', storeId: 'STORE-1', item: 'Chicken Cheese momos', category: 'momo', reason: 'sold_out', startAt: istIso(today, '18:40'), endAt: null, offOnline: true, createdBy: 'x', createdByName: 'Counter Crew Demo', createdAt: '', updatedAt: '' }] as any),
    getStockWastageEntry: () => later(null),
    getProductionCashEntry: () => later({ entry: null, live: { expectedClosingCashInHand: 1300 } as api.ProductionCashLive }),
    renderRiderTrips: () => (
      <div className="mx-auto max-w-[720px] px-4 pb-6 sm:px-6 lg:px-8">
        <Callout tone="info" title="RiderTrips (rider mode)">The rides screen: current ride with its next-step button, availability and earnings. It talks to the server, so the preview shows this box.</Callout>
      </div>
    ),
  };
}

function mockContext(user: InventoryContextType['user'], sample: ReturnType<typeof buildHomeSample>, empty: boolean): InventoryContextType {
  const noop = async () => undefined;
  const salesData = empty ? sample.salesData.map((s) => ({ ...s, approvalRequested: false })) : sample.salesData;
  return new Proxy(
    {
      inventory: sample.inventory, overheads: sample.overheads, fixedCosts: sample.fixedCosts, salesData, categorySalesData: [],
      onlineCashRecalibrations: [], onlineSalesData: sample.onlineSalesData, onlinePayoutData: [], aggregatorSettlements: [],
      productionData: empty ? [] : sample.productionData, productionHouses: sample.productionHouses, stockRequests: [], productionRequests: sample.productionRequests,
      stores: sample.stores, managedStoreIds: [], managedProductionHouseIds: [], inventoryItems: [], isManager: user?.role === 'manager', user,
      dataRefreshedAt: 0, setProductionHouses: () => undefined,
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : noop) },
  ) as unknown as InventoryContextType;
}

const notifications: NotificationsSource = {
  list: async () => ({ notifications: [], unreadCount: 2 }),
  markRead: async () => undefined,
  markAllRead: async () => undefined,
};

function RoleHome({ personaId, params }: { personaId: string; params: Params }) {
  const persona = PREVIEW_PERSONAS.find((p) => p.id === personaId)!;
  const today = getTodayIST();
  const sample = React.useMemo(() => buildHomeSample(today), [today]);
  const nav = React.useMemo(() => buildNav(persona.user, { today, storeCount: sample.stores.length }), [persona, today, sample]);
  const context = React.useMemo(() => mockContext(persona.user, sample, params.empty), [persona, sample, params.empty]);
  const homeData = React.useMemo(() => mockHomeData(persona.id, params, sample), [persona, params, sample]);
  const events = React.useMemo(() => ({
    ...eventsApi,
    mine: async () => ({
      today,
      events: params.event && (persona.id.includes('crew') || persona.id.includes('incharge')) ? [{
        id: 'EV-1', name: 'College fest stall', venue: 'Demo campus', startDate: addDays(today, -1), endDate: addDays(today, 1), status: 'live', myRole: 'staff',
        today: { submitted: false, sales: 4200, source: 'typed' }, cashInHand: 2600, digitalAccount: { mode: 'store_paytm', name: 'Store Paytm' }, incoming: 1, pendingTopups: 0,
      }] : [],
    }),
  }) as unknown as typeof eventsApi, [params.event, persona.id, today]);
  const [store, setStore] = React.useState<string | null>(null);
  return (
    <EventsApiProvider value={events}>
      <HomeDataProvider value={homeData}>
        <AppShell
          nav={nav}
          user={persona.user}
          context={context}
          stores={sample.stores as unknown as api.Store[]}
          employees={sample.employees as api.Employee[]}
          selectedStoreId={nav.chrome.storeSwitcher ? store : null}
          onStoreChange={setStore}
          refreshStores={async () => undefined}
          badges={{}}
          notificationsSource={notifications}
          askBunnyStoreId="STORE-1"
          passwordDaysLeft={null}
          onChangePassword={() => undefined}
          onLogout={() => undefined}
        />
      </HomeDataProvider>
    </EventsApiProvider>
  );
}

const ROLES = ['owner', 'ops-manager', 'store-incharge', 'production-incharge', 'store-crew', 'kitchen-crew', 'rider'];

export function HomePreview() {
  const params = React.useMemo(readParams, []);
  const persona = PREVIEW_PERSONAS.find((p) => p.id === params.role);

  React.useLayoutEffect(() => {
    if (!persona) return;
    setAppLanguageOwner(`home-preview-${persona.id}`, persona.user);
    if (params.lang) setAppLanguage(params.lang);
  }, [persona, params.lang]);

  if (persona) return <RoleHome personaId={persona.id} params={params} />;
  return (
    <div className="min-h-dvh bg-bg px-4 py-6 text-text">
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        <h1 className="text-title font-semibold">Home screens · preview</h1>
        <p className="text-body-sm text-text-2">Dev only. Made-up data; only Home is wired to it.</p>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {ROLES.map((id) => (
            <div key={id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
              <span className="w-48 text-body-md font-semibold">{PREVIEW_PERSONAS.find((p) => p.id === id)?.label}</span>
              <a className="text-body-sm font-medium text-primary" href={`?role=${id}`}>English</a>
              <a className="text-body-sm font-medium text-primary" href={`?role=${id}&lang=bn`}>বাংলা</a>
              <a className="text-body-sm font-medium text-primary" href={`?role=${id}&event=1`}>Event day</a>
              <a className="text-body-sm font-medium text-primary" href={`?role=${id}&empty=1`}>All caught up</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
