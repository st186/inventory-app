// The real app shell and screens for one persona on made-up data (mock.ts). Used by the how-to
// guides' screenshots (guide-preview.html) and by practice mode in the app (components/practice):
// the same screens, nothing sent to the server.
import { HOUSE_MY_CHECKS, STORE_MY_CHECKS, addDays, renamed, today } from './mock';
import * as React from 'react';
import type { InventoryContextType } from '../../App';
import type * as api from '../../utils/api';
import { AppShell } from '../../components/shell/AppShell';
import { buildNav } from '../../components/shell/navConfig';
import type { NotificationsSource } from '../../components/Notifications';
import { HomeDataProvider, realHomeData, type HomeData } from '../../components/home/homeData';
import { EventsApiProvider } from '../../components/events';
import { RiderApiProvider } from '../../components/riders/riderApi';
import { mockRiderApi, type TripStage } from '../ridersPreview/mock';
import { RecipesApiProvider } from '../../utils/recipesApi';
import { createMockRecipesApi } from '../../components/recipes/preview/mockApi';
import { eventsApi } from '../../utils/eventsApi';
import { setAppLanguage, setAppLanguageOwner, type AppLanguage } from '../../utils/appLanguage';
import { PREVIEW_PERSONAS } from '../ShellPreview';
import { mockHomeData } from '../HomePreview';
import { buildHomeSample } from '../homeSample';
import { useAutoClick } from '../TeamPreview';
import { mockContext as moneyContext, salesFor } from '../moneyPreviewData';
import { inventoryItems, productionData, seedRequests } from '../stockPreview/mockServer';

export type PreviewOptions = {
  personaId: string;
  /** null: keep the language this phone already uses (practice mode). */
  lang: AppLanguage | null;
  /** The name shown as "you" (practice mode uses the person's own). */
  name?: string;
  dayClose?: Parameters<typeof salesFor>[0];
  shiftOn?: boolean;
  trip?: string;
  /** Dev: tap buttons whose text contains each part, in turn. */
  click?: string[];
  banner?: React.ReactNode;
  /** Rendered beside the shell, inside its data providers (the practice tour). */
  children?: React.ReactNode;
};

// Each guide's login: a preview persona (ShellPreview) with the real team's role and designation.
type Setup = { base: string; name: string; user?: Partial<NonNullable<InventoryContextType['user']>>; unsentTomorrow?: boolean };
export const PREVIEW_SETUPS: Record<string, Setup> = {
  // Shows tomorrow's request as not sent yet: it goes the night before.
  'store-incharge': { base: 'store-incharge-manager', name: 'Store Incharge', unsentTomorrow: true },
  'production-incharge': { base: 'production-incharge-manager', name: 'Production Incharge', user: { assignedStoreIds: ['STORE-1', 'STORE-2'], assignedProductionHouseIds: ['PH-1'] } },
  operations: { base: 'ops-manager', name: 'Ops Manager', user: { designation: 'operations_incharge', assignedStoreIds: ['STORE-1', 'STORE-2'], assignedProductionHouseIds: ['PH-1'] } },
  'store-crew': { base: 'store-crew', name: 'Counter Crew' },
  'kitchen-crew': { base: 'kitchen-crew', name: 'Kitchen Crew' },
  rider: { base: 'rider', name: 'Rider' },
  owner: { base: 'owner', name: 'Owner' },
};

const STORES = [
  { id: 'STORE-1', name: 'Bunny Momos 1', location: 'Store road', managerId: null, productionHouseId: 'PH-1' },
  { id: 'STORE-2', name: 'Bunny Momos 2', location: 'Market road', managerId: null, productionHouseId: 'PH-1' },
] as unknown as api.Store[];
const HOUSES = [{ id: 'PH-1', name: 'Production house', inventory: {} }];

const clone = <T,>(value: T): T => (value && typeof value === 'object' ? JSON.parse(renamed(JSON.stringify(value))) : value);
const wrapAll = <T,>(raw: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(raw)) out[k] = typeof f === 'function' ? (...a: unknown[]) => { const r = (f as (...x: unknown[]) => unknown)(...a); return r instanceof Promise ? r.then(clone) : r; } : f;
  return out as unknown as T;
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const NOTIFICATIONS = [
  { id: 'n1', userId: 'u', type: 'production_request_shipped', category: 'update', title: 'Stock request shipped', message: 'Packed and on the way to Bunny Momos 1.', relatedId: 'PR-1', relatedDate: null, read: false, createdAt: minutesAgo(20) },
  { id: 'n2', userId: 'u', type: 'workplace_due', category: 'reminder', title: 'Workplace photos due', message: 'Counter, fryer and steamer by 4 PM.', relatedId: null, relatedDate: null, read: false, createdAt: minutesAgo(50) },
  { id: 'n3', userId: 'u', type: 'leave_pending', category: 'action', title: 'Leave request', message: 'Counter Crew asked for 1 day next week.', relatedId: 'L-1', relatedDate: null, read: true, createdAt: minutesAgo(140) },
] as unknown as api.Notification[];
const notifications: NotificationsSource = {
  list: async () => ({ notifications: NOTIFICATIONS, unreadCount: 2 }),
  markRead: async () => undefined,
  markAllRead: async () => undefined,
};

export function PreviewShell(o: PreviewOptions) {
  const personaId = PREVIEW_SETUPS[o.personaId] ? o.personaId : 'store-incharge';
  const setup = PREVIEW_SETUPS[personaId];
  const base = PREVIEW_PERSONAS.find((p) => p.id === setup.base)!;
  const user = React.useMemo(() => ({ ...base.user, ...setup.user, name: o.name || setup.name }), [base, setup, o.name]);
  const sample = React.useMemo(() => buildHomeSample(today), []);
  const nav = React.useMemo(() => buildNav(user, { today, storeCount: STORES.length }), [user]);

  // The stock requests every screen shares (the fetch answers use the same list), and recipes on
  // the recipes preview's in-memory server, as this role.
  const { requests, recipes } = React.useMemo(() => {
    const list = seedRequests('');
    if (setup.unsentTomorrow) {
      const tomorrow = addDays(today, 1);
      for (let i = list.length - 1; i >= 0; i--) if (list[i].storeId === 'STORE-1' && list[i].requestDate === tomorrow) list.splice(i, 1);
    }
    const r = createMockRecipesApi();
    r.setRole(personaId === 'kitchen-crew' ? 'crew' : personaId === 'production-incharge' ? 'head' : personaId === 'owner' ? 'owner' : 'ops');
    return { requests: list, recipes: r };
  }, [personaId, setup]);

  const context = React.useMemo(() => {
    const money = moneyContext(user, o.dayClose || 'notStarted') as unknown as Record<string, unknown>;
    const noop = async () => undefined;
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(money)) data[key] = typeof money[key] === 'function' ? money[key] : clone(money[key]);
    Object.assign(data, {
      stores: STORES, productionHouses: HOUSES, inventoryItems, productionData: clone(productionData),
      productionRequests: clone(requests), managedStoreIds: user.storeId?.startsWith('STORE') ? [user.storeId] : ['STORE-1', 'STORE-2'],
      managedProductionHouseIds: ['PH-1'], isManager: user.role !== 'employee', user,
    });
    return new Proxy(data, { get: (target, key: string) => (key in target ? target[key] : noop) }) as unknown as InventoryContextType;
  }, [user, requests, o.dayClose]);

  const homeData = React.useMemo(() => {
    const raw = mockHomeData(setup.base, { role: setup.base, lang: o.lang, event: false, shiftOn: !!o.shiftOn, empty: false }, sample) as unknown as Record<string, unknown>;
    const out = wrapAll<Record<string, unknown>>(raw);
    // Home's photo card: each place's own list (none for the kitchen crew).
    if (personaId === 'production-incharge') out.getMyChecks = async () => clone(HOUSE_MY_CHECKS);
    if (personaId === 'kitchen-crew') out.getMyChecks = async () => ({ date: today, earlyMinutes: 30, items: [] });
    if (personaId === 'store-crew') out.getMyChecks = async () => clone(STORE_MY_CHECKS);
    // Operations' own shift: the production house, 8 AM to 7 PM (Aniket's settings).
    if (personaId === 'operations') {
      const shift = raw.getShiftToday as (...a: unknown[]) => Promise<Record<string, unknown>>;
      out.getShiftToday = async (...a: unknown[]) => {
        const r = await shift(...a);
        return { ...r, workplace: 'production', punch: null, settings: { shiftStart: '08:00', shiftEnd: '19:00', graceMin: 10, weeklyOff: [] }, pins: [{ kind: 'production', id: 'PH-1', name: 'Production house', lat: 0, lng: 0 }] };
      };
    }
    // The rider's Home is the real rides screen, on the rider preview's made-up rides.
    if (personaId === 'rider') out.renderRiderTrips = realHomeData.renderRiderTrips;
    return out as unknown as HomeData;
  }, [sample, setup, personaId, o.lang, o.shiftOn]);

  const events = React.useMemo(() => ({ ...eventsApi, mine: async () => ({ today, events: [] }) }) as unknown as typeof eventsApi, []);
  // Rides: the rider preview's made-up riders and trips (trip picks the rider's current ride).
  const riderApi = React.useMemo(() => {
    const rider = personaId === 'rider';
    return wrapAll<ReturnType<typeof mockRiderApi>>(mockRiderApi({ stage: (o.trip || (rider ? 'on_the_way' : 'none')) as TripStage, loc: rider ? 'active' : null, ring: false, android: false, staff: !rider, unavailable: false, empty: false }) as unknown as Record<string, unknown>);
  }, [personaId, o.trip]);

  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    if (o.lang) {
      setAppLanguageOwner(`guide-preview-${personaId}`, user);
      setAppLanguage(o.lang);
    }
    setReady(true);
  }, [user, personaId, o.lang]);
  useAutoClick(ready ? o.click || [] : []);
  if (!ready) return null;
  return (
    <EventsApiProvider value={events}>
      <RiderApiProvider value={riderApi}>
        <RecipesApiProvider api={recipes.api}>
          <HomeDataProvider value={homeData}>
            <AppShell
              nav={nav}
              user={user}
              context={context}
              stores={STORES}
              employees={clone(sample.employees) as api.Employee[]}
              selectedStoreId={null}
              onStoreChange={() => undefined}
              refreshStores={async () => undefined}
              banners={o.banner}
              badges={{}}
              notificationsSource={notifications}
              askBunnyStoreId="STORE-1"
              passwordDaysLeft={null}
              onChangePassword={() => undefined}
              onLogout={() => undefined}
            />
            {o.children}
          </HomeDataProvider>
        </RecipesApiProvider>
      </RiderApiProvider>
    </EventsApiProvider>
  );
}
