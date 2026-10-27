// Dev-only preview of the WP6 screens (More > Setup, Data, Assets) on mock data, inside a stand-in
// top bar, so they can be looked at without signing in. Not in the production build.
//
//   /setup-preview.html                                     list of screens
//   /setup-preview.html?screen=equipment&lang=bn&role=owner one screen (role: owner | incharge | staff)
import * as React from 'react';
import type { InventoryContextType } from '../../App';
import type * as api from '../../utils/api';
import { LanguageOverride, useT, type Lang, type I18nKey } from '../../utils/i18n';
import { PageHeader } from '../../components/ui/page-header';
import { ListGroup, ListRow } from '../../components/ui/list-row';
import { AssetsManagement } from '../../components/AssetsManagement';
import { HierarchyManagement } from '../../components/HierarchyManagement';
import { EmployeeHierarchy } from '../../components/EmployeeHierarchy';
import { EmployeeHierarchyView } from '../../components/EmployeeHierarchyView';
import { InventoryItemsManagement } from '../../components/InventoryItemsManagement';
import { CategoryManagerModal } from '../../components/CategoryManagerModal';
import { QuickAddInventoryItem } from '../../components/QuickAddInventoryItem';
import { ExportData } from '../../components/ExportData';
import { BackupRestore } from '../../components/BackupRestore';
import { WorkplaceSetup } from '../../components/workplace/WorkplaceSetup';
import { SetupPage } from '../../components/setup/SetupPage';
import type { WorkplaceAccess } from '../../components/workplace/workplaceApi';
import { EMPLOYEES, HOUSES, PREVIEW_ROLE, STORES } from './mock';

type Screen = {
  id: string;
  title: I18nKey | string;
  role: 'owner' | 'incharge' | 'staff';
  render: (ctx: InventoryContextType) => React.ReactNode;
};

const USERS = {
  owner: { email: 'owner@example.test', name: 'Owner Demo', role: 'cluster_head', employeeId: 'DEMO-01', storeId: null, designation: null },
  incharge: { email: 'store@example.test', name: 'Store Incharge Demo', role: 'employee', employeeId: 'DEMO-21', storeId: 'STORE-1', designation: 'store_incharge' },
  staff: { email: 'crew@example.test', name: 'Counter Crew Demo', role: 'employee', employeeId: 'DEMO-41', storeId: 'STORE-1', designation: 'store_ops' },
} as const;

function mockContext(role: keyof typeof USERS): InventoryContextType {
  const noop = async () => undefined;
  return new Proxy(
    {
      inventory: [], overheads: [], fixedCosts: [], salesData: [], categorySalesData: [], onlineCashRecalibrations: [],
      onlineSalesData: [], onlinePayoutData: [], aggregatorSettlements: [], productionData: [], productionHouses: HOUSES,
      stockRequests: [], productionRequests: [], stores: STORES, managedStoreIds: ['STORE-1', 'STORE-2'], managedProductionHouseIds: ['PH-1'],
      inventoryItems: [], isManager: false, dataRefreshedAt: 0, setProductionHouses: () => undefined,
      user: { ...USERS[role], accessToken: 'preview-token-not-real', assignedStoreIds: [], assignedProductionHouseIds: [] },
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : noop) },
  ) as unknown as InventoryContextType;
}

const ACCESS: WorkplaceAccess = {
  canSetup: true,
  locations: [{ kind: 'store', id: 'STORE-1', name: 'Store A' }, { kind: 'store', id: 'STORE-2', name: 'Store B' }, { kind: 'production', id: 'PH-1', name: 'Kitchen One' }],
  settings: { aiEnabled: true, aiThreshold: 6 },
  storage: 'drive',
  aiConfigured: true,
};

function WorkplaceDemo() {
  const [access, setAccess] = React.useState(ACCESS);
  return <SetupPage><WorkplaceSetup access={access} onSettings={(settings) => setAccess({ ...access, settings })} /></SetupPage>;
}

function CategoriesDemo() {
  const [open, setOpen] = React.useState(true);
  return (
    <SetupPage>
      <button type="button" className="min-h-11 text-left text-body-md text-primary underline" onClick={() => setOpen(true)}>Open purchase categories</button>
      {open && <CategoryManagerModal onClose={() => setOpen(false)} />}
    </SetupPage>
  );
}

const SCREENS: Screen[] = [
  { id: 'equipment', title: 'more.equipment', role: 'owner', render: (c) => <AssetsManagement context={c} stores={STORES as unknown as api.Store[]} employees={EMPLOYEES as unknown as api.Employee[]} onRefreshStores={() => undefined} initialTab="equipment" /> },
  { id: 'equipment-incharge', title: 'more.equipment', role: 'incharge', render: (c) => <AssetsManagement context={c} stores={STORES as unknown as api.Store[]} employees={[]} onRefreshStores={() => undefined} /> },
  { id: 'investments', title: 'more.investments', role: 'owner', render: (c) => <AssetsManagement context={c} stores={[]} employees={[]} onRefreshStores={() => undefined} initialTab="investments" /> },
  { id: 'stores', title: 'more.stores', role: 'owner', render: (c) => <AssetsManagement context={c} stores={STORES as unknown as api.Store[]} employees={EMPLOYEES as unknown as api.Employee[]} onRefreshStores={() => undefined} initialTab="assets" /> },
  { id: 'hierarchy', title: 'more.hierarchy', role: 'owner', render: () => <HierarchyManagement userRole="cluster_head" accessToken="preview-token-not-real" currentEmployeeId="DEMO-01" /> },
  { id: 'my-team', title: 'My team', role: 'owner', render: () => <EmployeeHierarchy managerId="DEMO-10" role="manager" /> },
  { id: 'chain', title: 'more.myAttendance', role: 'staff', render: () => <EmployeeHierarchyView currentUser={{ employeeId: 'DEMO-41', role: 'employee', email: 'crew@example.test', name: 'Counter Crew Demo' }} /> },
  { id: 'items', title: 'more.items', role: 'owner', render: (c) => <InventoryItemsManagement context={c} /> },
  { id: 'items-incharge', title: 'more.items', role: 'incharge', render: (c) => <InventoryItemsManagement context={c} /> },
  { id: 'categories', title: 'items.categories', role: 'owner', render: () => <CategoriesDemo /> },
  { id: 'quick-add', title: 'items.quick.add', role: 'incharge', render: () => <SetupPage><QuickAddInventoryItem entityType="store" entityId="STORE-1" entityName="Store A" /></SetupPage> },
  { id: 'workplace', title: 'more.workplaceSetup', role: 'owner', render: () => <WorkplaceDemo /> },
  { id: 'reports', title: 'more.reports', role: 'owner', render: (c) => <ExportData userRole="cluster_head" selectedStoreId={null} currentUserId="owner@example.test" context={c} /> },
  { id: 'reports-incharge', title: 'more.reports', role: 'incharge', render: (c) => <ExportData userRole="manager" selectedStoreId="STORE-1" currentUserId="store@example.test" context={c} /> },
  { id: 'audit', title: 'more.audit', role: 'owner', render: (c) => <ExportData userRole="cluster_head" selectedStoreId={null} context={c} initialView="audit" /> },
  { id: 'backup', title: 'more.backup', role: 'owner', render: (c) => <BackupRestore context={c} /> },
];

function Frame({ screen }: { screen: Screen }) {
  const { t } = useT();
  const context = React.useMemo(() => mockContext(screen.role), [screen.role]);
  const title = screen.title.includes('.') ? t(screen.title as I18nKey) : screen.title;
  return (
    <div className="min-h-dvh bg-bg text-text">
      <PageHeader title={title} onBack={() => { window.location.search = ''; }} />
      <main className="pb-8">{screen.render(context)}</main>
    </div>
  );
}

export function SetupPreview() {
  const p = new URLSearchParams(window.location.search);
  const lang = (['en', 'bn', 'hi'].includes(p.get('lang') || '') ? p.get('lang') : 'en') as Lang;
  const screen = SCREENS.find((s) => s.id === p.get('screen'));

  if (screen) {
    if (screen.role !== PREVIEW_ROLE) {
      // The mock server answers for the role in the address; reload with the screen's own role.
      const next = new URLSearchParams(window.location.search);
      next.set('role', screen.role);
      window.location.search = next.toString();
      return null;
    }
    return (
      <LanguageOverride lang={lang}>
        <Frame screen={screen} />
      </LanguageOverride>
    );
  }

  return (
    <div className="min-h-dvh bg-bg px-4 py-6 text-text">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-semibold">Setup, data and assets preview</h1>
          <p className="text-body-sm text-text-2">Dev only. Made-up data, no sign-in, nothing is sent anywhere.</p>
        </div>
        {(['en', 'bn'] as Lang[]).map((l) => (
          <ListGroup key={l} overline={l === 'en' ? 'English' : 'Bengali'}>
            {SCREENS.map((s) => (
              <ListRow key={s.id} title={s.id} subtitle={s.role} href={`?screen=${s.id}&lang=${l}&role=${s.role}`} />
            ))}
          </ListGroup>
        ))}
      </div>
    </div>
  );
}
