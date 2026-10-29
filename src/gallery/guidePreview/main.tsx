// Dev-only entry for guide-preview.html: the real app shell and screens for one persona on
// made-up data (mock.ts), so the how-to guides can show real screens. Not in the production build.
//
//   /guide-preview.html?persona=store-incharge#/stock/requests
//     &lang=bn          App language                  &shift=on   the shift already started
//     &click=a|b        tap buttons / rows whose text contains a, then b
//     &state=submitted  today's day close (notStarted | submitted | approved | rejected)
import { installGuideMock, renamed, today } from './mock';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { InventoryContextType } from '../../App';
import type * as api from '../../utils/api';
import { AppShell } from '../../components/shell/AppShell';
import { buildNav } from '../../components/shell/navConfig';
import type { NotificationsSource } from '../../components/Notifications';
import { HomeDataProvider, type HomeData } from '../../components/home/homeData';
import { EventsApiProvider } from '../../components/events';
import { eventsApi } from '../../utils/eventsApi';
import { setAppLanguage, setAppLanguageOwner, type AppLanguage } from '../../utils/appLanguage';
import { Toaster } from '../../components/ui/sonner';
import { ConfirmProvider } from '../../components/ui/confirm';
import { PREVIEW_PERSONAS } from '../ShellPreview';
import { mockHomeData } from '../HomePreview';
import { buildHomeSample } from '../homeSample';
import { useAutoClick } from '../TeamPreview';
import { mockContext as moneyContext, salesFor } from '../moneyPreviewData';
import { inventoryItems, productionData, seedRequests } from '../stockPreview/mockServer';
import '../../styles/fonts.css';
import '../../index.css';

installGuideMock();

const params = new URLSearchParams(window.location.search);
const PERSONAS: Record<string, { base: string; name: string }> = {
  'store-incharge': { base: 'store-incharge-manager', name: 'Store Incharge' },
};
const personaId = params.get('persona') || 'store-incharge';
const lang = (['bn', 'hi'].includes(params.get('lang') || '') ? params.get('lang') : 'en') as AppLanguage;
const state = (params.get('state') || 'notStarted') as Parameters<typeof salesFor>[0];

const STORES = [
  { id: 'STORE-1', name: 'Bunny Momos 1', location: 'Store road', managerId: null, productionHouseId: 'PH-1' },
  { id: 'STORE-2', name: 'Bunny Momos 2', location: 'Market road', managerId: null, productionHouseId: 'PH-1' },
] as unknown as api.Store[];
const HOUSES = [{ id: 'PH-1', name: 'Production house', inventory: {} }];

const clone = <T,>(value: T): T => (value && typeof value === 'object' ? JSON.parse(renamed(JSON.stringify(value))) : value);

function contextFor(user: NonNullable<InventoryContextType['user']>): InventoryContextType {
  const money = moneyContext(user, state) as unknown as Record<string, unknown>;
  const noop = async () => undefined;
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(money)) data[key] = typeof money[key] === 'function' ? money[key] : clone(money[key]);
  Object.assign(data, {
    stores: STORES, productionHouses: HOUSES, inventoryItems, productionData: clone(productionData),
    productionRequests: clone(seedRequests('')), managedStoreIds: ['STORE-1'], managedProductionHouseIds: [],
    isManager: true, user,
  });
  return new Proxy(data, { get: (target, key: string) => (key in target ? target[key] : noop) }) as unknown as InventoryContextType;
}

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

function GuideShell() {
  const setup = PERSONAS[personaId] || PERSONAS['store-incharge'];
  const base = PREVIEW_PERSONAS.find((p) => p.id === setup.base)!;
  const user = React.useMemo(() => ({ ...base.user, name: setup.name }), [base, setup]);
  const sample = React.useMemo(() => buildHomeSample(today), []);
  const nav = React.useMemo(() => buildNav(user, { today, storeCount: STORES.length }), [user]);
  const context = React.useMemo(() => contextFor(user), [user]);
  const homeData = React.useMemo(() => {
    const raw = mockHomeData(setup.base, { role: setup.base, lang, event: false, shiftOn: params.get('shift') === 'on', empty: false }, sample) as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(raw)) {
      out[k] = typeof f === 'function' ? (...a: unknown[]) => { const r = (f as (...x: unknown[]) => unknown)(...a); return r instanceof Promise ? r.then(clone) : r; } : f;
    }
    return out as unknown as HomeData;
  }, [setup, sample]);
  const events = React.useMemo(() => ({ ...eventsApi, mine: async () => ({ today, events: [] }) }) as unknown as typeof eventsApi, []);
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    setAppLanguageOwner(`guide-preview-${personaId}`, user);
    setAppLanguage(lang);
    setReady(true);
  }, [user]);
  useAutoClick(ready ? (params.get('click') || '').split('|').filter(Boolean) : []);
  if (!ready) return null;
  return (
    <EventsApiProvider value={events}>
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

createRoot(document.getElementById('root')!).render(
  <>
    <GuideShell />
    <Toaster />
    <ConfirmProvider />
  </>,
);
