// Dev-only role preview (shell-preview.html): the app shell for every role with made-up data, so
// the navigation can be checked without signing in. Not in the production build.
//
//   /shell-preview.html                         all roles, links to each
//   /shell-preview.html?role=owner&embed=1      one role, full screen (for screenshots)
//     &route=money/expenses   open a destination     &account=1   open the Account sheet
//     &lang=bn                App language            &today=2026-10-31  before Receive Stock
//     &history=1              use the real browser history / hash, to try Back by hand
//
// Screens inside show a labelled placeholder (no data, no network); the shell itself - top bar,
// bottom nav / rail / sidebar, More / Me, Inbox, Account sheet - is the real thing.
import * as React from 'react';
import type { InventoryContextType } from '../App';
import type * as api from '../utils/api';
import { AppShell } from '../components/shell/AppShell';
import { buildNav } from '../components/shell/navConfig';
import { normalizeRoute } from '../components/shell/router';
import type { NotificationsSource } from '../components/Notifications';
import { setAppLanguage, setAppLanguageOwner, type AppLanguage } from '../utils/appLanguage';

type Persona = { id: string; label: string; user: NonNullable<InventoryContextType['user']> };

const base = { accessToken: 'preview', assignedStoreIds: [], assignedProductionHouseIds: [] };
export const PREVIEW_PERSONAS: Persona[] = [
  { id: 'owner', label: 'Owner', user: { ...base, email: 'owner@example.test', name: 'Owner Demo', role: 'cluster_head', employeeId: 'DEMO-01', storeId: null, designation: null } },
  { id: 'ops-manager', label: 'Operations manager', user: { ...base, email: 'ops@example.test', name: 'Ops Manager Demo', role: 'manager', employeeId: 'DEMO-10', storeId: null, designation: null } },
  { id: 'store-incharge', label: 'Store incharge', user: { ...base, email: 'store@example.test', name: 'Store Incharge Demo', role: 'employee', employeeId: 'DEMO-21', storeId: 'STORE-1', designation: 'store_incharge' } },
  { id: 'store-incharge-manager', label: 'Store incharge (manager login)', user: { ...base, email: 'storem@example.test', name: 'Store Lead Demo', role: 'manager', employeeId: 'DEMO-22', storeId: 'STORE-1', designation: 'store_incharge' } },
  { id: 'production-incharge', label: 'Production incharge', user: { ...base, email: 'prod@example.test', name: 'Kitchen Head Demo', role: 'employee', employeeId: 'DEMO-31', storeId: 'PH-1', designation: 'production_incharge' } },
  { id: 'production-incharge-manager', label: 'Production incharge (manager login)', user: { ...base, email: 'prodm@example.test', name: 'Kitchen Lead Demo', role: 'manager', employeeId: 'DEMO-32', storeId: 'PH-1', designation: 'production_incharge' } },
  { id: 'store-crew', label: 'Store crew', user: { ...base, email: 'crew@example.test', name: 'Counter Crew Demo', role: 'employee', employeeId: 'DEMO-41', storeId: 'STORE-1', designation: 'store_ops' } },
  { id: 'kitchen-crew', label: 'Kitchen crew', user: { ...base, email: 'kitchen@example.test', name: 'Kitchen Crew Demo', role: 'employee', employeeId: 'DEMO-51', storeId: 'PH-1', designation: 'production_ops' } },
  { id: 'rider', label: 'Rider', user: { ...base, email: 'rider@example.test', name: 'Rider Demo', role: 'employee', employeeId: 'DEMO-61', storeId: null, designation: 'rider' } },
  { id: 'auditor', label: 'Auditor', user: { ...base, email: 'audit@example.test', name: 'Audit Desk', role: 'audit', employeeId: 'AUDIT001', storeId: null, designation: null } },
];

const STORES = [
  { id: 'STORE-1', name: 'Store A', location: 'Demo street', managerId: null, productionHouseId: 'PH-1' },
  { id: 'STORE-2', name: 'Store B', location: 'Demo road', managerId: null },
] as unknown as api.Store[];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const NOTIFICATIONS: api.Notification[] = [
  { id: 'n0', userId: 'u', type: 'repair_alert', category: 'urgent', title: 'Steamer down at the production house', message: 'Reported 10:20 am. Prep is on the backup steamer.', relatedId: 'R-1', relatedDate: null, read: false, createdAt: minutesAgo(4) },
  { id: 'n1', userId: 'u', type: 'discrepancy_request', category: 'action', title: 'Cash short by ₹240', message: "Yesterday's day close at Store A needs your approval.", relatedId: null, relatedDate: null, read: false, createdAt: minutesAgo(12) },
  { id: 'n2', userId: 'u', type: 'leave_pending', category: 'action', title: 'Leave request', message: 'A crew member asked for 2 days next week.', relatedId: 'L-1', relatedDate: null, read: false, createdAt: minutesAgo(95) },
  { id: 'n6', userId: 'u', type: 'expense_flag', category: 'action', title: 'Expense looks off', message: 'Gas refill ₹1,900 is twice the usual.', relatedId: null, relatedDate: null, read: false, createdAt: minutesAgo(30), count: 3, items: ['Two bills for the same vegetables on Monday.', 'Cleaning supplies bought at both places.'] },
  { id: 'n7', userId: 'u', type: 'timesheet_pending', category: 'action', title: 'Timesheet to approve', message: 'Monday at Store A.', relatedId: 'T-1', relatedDate: null, read: true, createdAt: minutesAgo(140), resolvedAt: minutesAgo(100), resolvedBy: 'Store incharge', resolvedVerb: 'approved' },
  { id: 'n3', userId: 'u', type: 'stock_out', category: 'urgent', title: 'Chicken cheese momo is out of stock', message: 'Marked 6:40 pm at Store A.', relatedId: null, relatedDate: null, read: true, createdAt: minutesAgo(200) },
  { id: 'n8', userId: 'u', type: 'workplace_due', category: 'reminder', title: 'Opening photos due', message: 'Counter, dustbin and back area by 11 am.', relatedId: null, relatedDate: null, read: false, createdAt: minutesAgo(50) },
  { id: 'n4', userId: 'u', type: 'production_request_shipped', category: 'update', title: 'Stock request shipped', message: 'Packed and on the way to Store A.', relatedId: 'PR-1', relatedDate: null, read: true, createdAt: minutesAgo(60 * 30) },
  { id: 'n5', userId: 'u', type: 'salary_credited', category: 'update', title: 'October salary paid', message: 'Sent to your account.', relatedId: null, relatedDate: null, read: true, createdAt: minutesAgo(60 * 50) },
];

function mockSource(): NotificationsSource {
  let items = NOTIFICATIONS.map((n) => ({ ...n }));
  return {
    list: async () => ({ notifications: items, unreadCount: items.filter((n) => !n.read).length }),
    markRead: async (id) => { items = items.map((n) => (n.id === id ? { ...n, read: true } : n)); },
    markAllRead: async () => { items = items.map((n) => ({ ...n, read: true })); },
  };
}

function mockContext(user: Persona['user']): InventoryContextType {
  const noop = async () => undefined;
  return new Proxy(
    {
      inventory: [], overheads: [], fixedCosts: [], salesData: [], categorySalesData: [], onlineCashRecalibrations: [],
      onlineSalesData: [], onlinePayoutData: [], aggregatorSettlements: [], productionData: [], productionHouses: [],
      stockRequests: [], productionRequests: [], stores: STORES, managedStoreIds: [], managedProductionHouseIds: [],
      inventoryItems: [], isManager: user.role === 'manager', user, dataRefreshedAt: 0, setProductionHouses: () => undefined,
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : noop) },
  ) as unknown as InventoryContextType;
}

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const lang = p.get('lang');
  return {
    role: p.get('role') || '',
    embed: p.get('embed') === '1',
    route: p.get('route') || 'home',
    account: p.get('account') === '1',
    history: p.get('history') === '1',
    today: p.get('today') || '2026-11-01',
    lang: (lang === 'bn' || lang === 'hi' || lang === 'en' ? lang : null) as AppLanguage | null,
  };
}

function RolePreview({ persona, route, account, today, history }: { persona: Persona; route: string; account: boolean; today: string; history: boolean }) {
  const nav = React.useMemo(() => buildNav(persona.user, { today, storeCount: STORES.length }), [persona, today]);
  const source = React.useMemo(mockSource, []);
  const context = React.useMemo(() => mockContext(persona.user), [persona]);
  const [store, setStore] = React.useState<string | null>(null);
  const [path, query = ''] = route.split('?');
  const initialRoute = normalizeRoute({ path, params: Object.fromEntries(new URLSearchParams(query)) }, nav);
  const badges = nav.kind === 'owner' || nav.kind === 'ops' ? { salesApprovals: 1, productionApprovals: 2 } : nav.kind === 'production-incharge' ? { requestsToAccept: 3 } : {};
  return (
    <AppShell
      nav={nav}
      user={persona.user}
      context={context}
      stores={STORES}
      employees={[]}
      selectedStoreId={nav.chrome.storeSwitcher ? store : null}
      onStoreChange={setStore}
      refreshStores={async () => undefined}
      badges={badges}
      notificationsSource={source}
      askBunnyStoreId="STORE-1"
      passwordDaysLeft={12}
      onChangePassword={() => undefined}
      onLogout={() => undefined}
      onRefresh={nav.perms.isPlainEmployee || nav.perms.isRider || nav.perms.isAudit ? undefined : () => undefined}
      preview={{ initialRoute, history, accountOpen: account, profileComplete: persona.id === 'store-incharge', latestVersion: persona.id === 'ops-manager' ? '1.16.0' : null }}
    />
  );
}

export function ShellPreview() {
  const params = React.useMemo(readParams, []);
  const persona = PREVIEW_PERSONAS.find((p) => p.id === params.role);

  React.useEffect(() => {
    if (!persona) return;
    setAppLanguageOwner(`preview-${persona.id}`, persona.user);
    if (params.lang) setAppLanguage(params.lang);
  }, [persona, params.lang]);

  if (persona && params.embed) {
    return <RolePreview persona={persona} route={params.route} account={params.account} today={params.today} history={params.history} />;
  }

  return (
    <div className="min-h-dvh bg-bg px-4 py-6 text-text">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4">
        <div className="flex items-center gap-3">
          <img src="/bunny-logo.png" alt="" className="size-10 object-contain" />
          <div className="flex flex-col">
            <h1 className="text-title font-semibold">App shell · role preview</h1>
            <p className="text-body-sm text-text-2">Dev only. Every role with made-up data; screens inside are placeholders.</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {PREVIEW_PERSONAS.map((p) => {
            const nav = buildNav(p.user, { today: params.today, storeCount: STORES.length });
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
                <span className="w-64 text-body-md font-semibold">{p.label}</span>
                <span className="flex-1 text-body-sm text-text-2">{nav.tabs.map((t) => t.path).join(' · ')}</span>
                <a className="text-body-sm font-medium text-primary" href={`?role=${p.id}&embed=1`}>Open</a>
                <a className="text-body-sm font-medium text-primary" href={`?role=${p.id}&embed=1&account=1`}>Account</a>
                <a className="text-body-sm font-medium text-primary" href={`?role=${p.id}&embed=1&route=${nav.tabs.some((t) => t.path === 'me') ? 'me' : 'more'}`}>More / Me</a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
