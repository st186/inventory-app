// Dev-only preview of the Team screens (team-preview.html): the real app shell and the real Team
// screens for a made-up login, with made-up answers from teamPreviewMocks.ts. Not in the build.
//
//   /team-preview.html                                 links to every screen
//   /team-preview.html?role=owner#/team/pay            one screen (roles: owner, ops-manager,
//                                                       store-incharge, store-crew)
//     &lang=bn          App language                  &click=Add person|Next   tap buttons by text
import * as React from 'react';
import type { InventoryContextType } from '../App';
import type * as api from '../utils/api';
import { AppShell } from '../components/shell/AppShell';
import { buildNav } from '../components/shell/navConfig';
import type { NotificationsSource } from '../components/Notifications';
import { setAppLanguage, setAppLanguageOwner, type AppLanguage } from '../utils/appLanguage';
import { PREVIEW_PERSONAS } from './ShellPreview';

const STORES = [
  { id: 'STORE-1', name: 'Store A', location: 'Demo street', managerId: null, productionHouseId: 'PH-1' },
  { id: 'STORE-2', name: 'Store B', location: 'Demo road', managerId: null },
] as unknown as api.Store[];

const ROLES = ['owner', 'ops-manager', 'store-incharge', 'store-crew'];

export const TEAM_SCREENS: { role: string; route: string; label: string; click?: string }[] = [
  { role: 'owner', route: 'team/people', label: 'People (owner)' },
  { role: 'owner', route: 'team/people?person=DEMO-41', label: 'Person page (owner)' },
  { role: 'owner', route: 'team/people', label: 'Add person (owner)', click: 'Add person' },
  { role: 'owner', route: 'team/pay', label: 'Pay (owner)' },
  { role: 'owner', route: 'team/pay', label: 'Payslip sheet', click: 'Counter Crew Demo' },
  { role: 'owner', route: 'team/pay', label: 'Add payout in the payslip', click: 'Counter Crew Demo|Add payout' },
  { role: 'owner', route: 'team/pay', label: 'Salary advances', click: 'salary advance' },
  { role: 'owner', route: 'team/attendance', label: 'Attendance approvals (owner)' },
  { role: 'owner', route: 'team/kpis', label: 'Team KPIs' },
  { role: 'owner', route: 'team/checks', label: 'Checks review' },
  { role: 'ops-manager', route: 'team/attendance', label: 'Attendance (ops manager)' },
  { role: 'ops-manager', route: 'team/pay', label: 'Pay (ops manager)' },
  { role: 'store-incharge', route: 'team/attendance', label: 'Approvals (store incharge)' },
  { role: 'store-incharge', route: 'team/attendance', label: 'Leave request sheet', click: 'Counter Crew Demo' },
  { role: 'store-incharge', route: 'team/pay', label: 'Pay (store incharge)' },
  { role: 'store-incharge', route: 'my-pay', label: 'My pay (incharge)' },
  { role: 'store-crew', route: 'pay', label: 'My pay (crew)' },
  { role: 'store-crew', route: 'my-attendance', label: 'Attendance and leave (crew)' },
  { role: 'store-crew', route: 'my-attendance', label: 'Apply for leave', click: 'Apply for leave' },
  { role: 'store-crew', route: 'my-kpis', label: 'My KPIs (crew)' },
  { role: 'store-crew', route: 'my-checks', label: 'My checks (crew)' },
];

function mockContext(user: NonNullable<InventoryContextType['user']>): InventoryContextType {
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

const source: NotificationsSource = {
  list: async () => ({ notifications: [], unreadCount: 0 }),
  markRead: async () => undefined,
  markAllRead: async () => undefined,
};

function RoleShell({ role }: { role: string }) {
  const persona = PREVIEW_PERSONAS.find((p) => p.id === role)!;
  const nav = React.useMemo(() => buildNav(persona.user, { today: '2026-11-01', storeCount: STORES.length }), [persona]);
  const context = React.useMemo(() => mockContext(persona.user), [persona]);
  const [store, setStore] = React.useState<string | null>(null);
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
      badges={{}}
      notificationsSource={source}
      askBunnyStoreId="STORE-1"
      passwordDaysLeft={null}
      onChangePassword={() => undefined}
      onLogout={() => undefined}
    />
  );
}

/** Taps buttons / rows whose text contains each part of ?click=a|b, one after another. */
export function useAutoClick(steps: string[]) {
  React.useEffect(() => {
    if (!steps.length) return;
    let cancelled = false;
    const run = async () => {
      for (const step of steps) {
        let target: HTMLElement | null = null;
        for (let tries = 0; tries < 40 && !target && !cancelled; tries++) {
          await new Promise((r) => setTimeout(r, 150));
          const all = [...document.querySelectorAll<HTMLElement>('button, a, [role="button"], label')];
          target = all.reverse().find((el) => el.getClientRects().length > 0 &&(el.textContent || '').toLowerCase().includes(step.toLowerCase())) || null;
        }
        if (cancelled || !target) return;
        target.click();
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.join('|')]);
}

export function TeamPreview() {
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const role = params.get('role') || '';
  const lang = params.get('lang') as AppLanguage | null;
  const persona = PREVIEW_PERSONAS.find((p) => p.id === role);
  const [ready, setReady] = React.useState(false);
  useAutoClick(ready ? (params.get('click') || '').split('|').filter(Boolean) : []);

  React.useEffect(() => {
    if (!persona) return;
    setAppLanguageOwner(`team-preview-${persona.id}`, persona.user);
    setAppLanguage(lang === 'bn' || lang === 'hi' ? lang : 'en');
    setReady(true);
  }, [persona, lang]);

  if (persona && ROLES.includes(role)) return ready ? <RoleShell role={role} /> : null;

  return (
    <div className="min-h-dvh bg-bg px-4 py-6 text-text">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4">
        <div className="flex flex-col">
          <h1 className="text-title font-semibold">Team screens · preview</h1>
          <p className="text-body-sm text-text-2">Dev only. The real shell and Team screens with made-up data.</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {TEAM_SCREENS.map((s) => {
            const base = `?role=${s.role}${s.click ? `&click=${encodeURIComponent(s.click)}` : ''}`;
            return (
              <div key={s.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="w-72 text-body-md font-medium">{s.label}</span>
                <a className="text-body-sm font-medium text-primary" href={`${base}#/${s.route}`}>English</a>
                <a className="text-body-sm font-medium text-primary" href={`${base}&lang=bn#/${s.route}`}>বাংলা</a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
