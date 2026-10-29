// Who can open what, and where it sits in the navigation (design review b4).
//
// Pure data, no React: scripts/nav-golden.mjs runs it in Node and checks it against a snapshot of
// what each login could reach before the new shell (no screen lost or gained). The permission
// predicates in `permissionsFor` are moved verbatim from App.tsx - change them only together
// with the golden test.
//
// Every destination has a stable path (`money/expenses`, `items`, ...) used by the hash router,
// the sidebar, the More / Me lists and the notification alias table, plus a `spec` saying which
// of today's screens it shows and with which permission props. The destination wrappers in
// ./destinations render the spec; screen packages (WP1-WP6) change the screens inside, not this
// file or App.tsx.
import type { I18nKey } from '../../utils/i18n';

export type NavUser = {
  role: string;
  designation?: string | null;
  storeId?: string | null;
  employeeId?: string | null;
  name?: string;
  email?: string;
};

const isPhase1Live = (date: string) => date >= '2026-11-01'; // utils/batches.ts PHASE1_GO_LIVE

/** The permission predicates App.tsx used before the new shell (App.tsx 1910-1939, 1798-1810). */
export function permissionsFor(user: NavUser, today: string) {
  const isClusterHead = user.role === 'cluster_head';
  const isEmployee = user.role === 'employee';
  const isAudit = user.role === 'audit';
  // An independent auditor for surprise visits (siteAudits.ts): their audits and nothing else.
  const isSiteAuditor = isAudit && user.designation === 'site_auditor';
  const isStoreIncharge = user.role === 'employee' && user.designation === 'store_incharge';
  // Production incharge can be either employee OR manager with production_incharge designation
  const isProductionIncharge = user.designation === 'production_incharge';
  const isAnyIncharge = isStoreIncharge || isProductionIncharge;
  const isRider = user.designation === 'rider';
  // Store crew (any plain employee at a store, not a rider or production crew) can receive
  // and count deliveries - the incharge does it from Stock Requests.
  const canReceiveStock = user.role === 'employee' && !isRider && !isAnyIncharge && user.designation !== 'production_ops' && !!user.storeId && isPhase1Live(today);
  // Production incharge, operations manager and cluster head can call riders / mark orders ready.
  const canDispatchRiders = user.role === 'cluster_head' || user.designation === 'production_incharge' || (user.role === 'manager' && user.designation !== 'store_incharge');
  const isOperationsManager = user.role === 'manager' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
  const isManager = user.role === 'manager';
  const isStoreInchargeManager = user.role === 'manager' && user.designation === 'store_incharge';
  const canViewProduction = isProductionIncharge || isOperationsManager || isClusterHead;
  // Out-of-stock log (store SOP ST-28): whoever bills at the store - crew and the store incharge -
  // logs it; production incharge, operations manager and cluster head can open it to see what's out.
  const canLogStockOuts = !!user.storeId && !isRider && user.designation !== 'production_ops' && user.designation !== 'production_incharge' && (user.role === 'employee' || isStoreInchargeManager);
  const canViewStockOuts = canLogStockOuts || isProductionIncharge || isOperationsManager || isClusterHead;
  // The Bunny chat (AI explanations of any screen): the cluster head and every manager login.
  const canAskBunny = isClusterHead || user.role === 'manager';
  // A plain employee (contract worker, or role 'employee' with no incharge designation).
  const isPlainEmployee = user.role === 'employee' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
  const shell: 'audit' | 'staff' | 'manager' = isAudit ? 'audit' : isEmployee ? 'staff' : 'manager';
  return {
    shell,
    isClusterHead,
    isEmployee,
    isAudit,
    isStoreIncharge,
    isProductionIncharge,
    isAnyIncharge,
    isRider,
    canReceiveStock,
    canDispatchRiders,
    isOperationsManager,
    isManager,
    isStoreInchargeManager,
    canViewProduction,
    canLogStockOuts,
    canViewStockOuts,
    canAskBunny,
    isPlainEmployee,
    isSiteAuditor,
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;

export type RoleKind = 'owner' | 'ops' | 'store-incharge' | 'production-incharge' | 'crew' | 'rider' | 'auditor' | 'site-auditor';
export type HomeKind = 'owner' | 'staff' | 'crew' | 'rider';

/** Lucide icon names, mapped to components in the UI layer (shell/icons.ts). */
export type IconKey =
  | 'home' | 'insights' | 'money' | 'stock' | 'production' | 'team' | 'more' | 'me' | 'pay' | 'inbox'
  | 'sales' | 'expenses' | 'cash' | 'payouts' | 'loans' | 'requests' | 'batches' | 'on-hand' | 'out-of-stock'
  | 'riders' | 'receive' | 'people' | 'attendance' | 'kpis' | 'checks' | 'equipment' | 'investments' | 'items'
  | 'stores' | 'hierarchy' | 'reports' | 'audit' | 'backup' | 'profile' | 'events' | 'recipes' | 'complaints' | 'contacts';

export type ScreenSpec =
  | { screen: 'Home'; home: HomeKind; embeds?: ScreenSpec }
  | { screen: 'Analytics'; tab?: 'cash-reconciliation' | null }
  | { screen: 'ProductionRequests' }
  | { screen: 'SalesManagement' | 'SalesView'; tab?: 'entry' | 'payout' | 'loans' | 'cash' }
  | { screen: 'InventoryManagement' }
  | { screen: 'ProductionManagement' }
  | { screen: 'AdvancedInventoryManagement' }
  | { screen: 'StockOutLog'; scope: 'own-store' | 'all-stores'; canDelete: boolean }
  | { screen: 'RiderTrips'; mode: 'rider' | 'staff'; canDispatch: boolean; variant?: 'home' | 'trips' }
  | { screen: 'IncomingDeliveries' }
  | { screen: 'EmployeeManagement' }
  | { screen: 'AttendancePortal'; mode: 'manager' }
  | { screen: 'AttendancePortal'; mode: 'staff'; isIncharge: boolean; tab?: 'approvals' | 'mine' }
  | { screen: 'PayrollManagement'; mode: 'manager' | 'incharge' }
  | { screen: 'EmployeeDashboard' }
  | { screen: 'HierarchyManagement' }
  | { screen: 'TeamKpis' }
  | { screen: 'MyKpis' }
  | { screen: 'WorkplaceChecks'; tab?: 'mine' | 'review' | 'setup' }
  | { screen: 'AssetsManagement'; tab?: 'equipment' | 'assets' | 'investments' }
  | { screen: 'InventoryItemsManagement' }
  | { screen: 'ExportData'; userRole: string; tab?: 'export' | 'audit' }
  | { screen: 'BackupRestore' }
  | { screen: 'RiderProfile' }
  | { screen: 'More' }
  | { screen: 'Inbox' }
  | { screen: 'Events' }
  | { screen: 'Recipes'; mode: 'capture' | 'review' }
  | { screen: 'Complaints' }
  | { screen: 'SiteAudits' }
  | { screen: 'OpeningChecklist' }
  | { screen: 'Contacts' }
  | { screen: 'ShoppingLists' }
  | { screen: 'AuditDashboard'; view: 'analytics' | 'inventory' | 'sales' | 'production' | 'payroll' };

/** Counts shown on a tab (only where the data is already loaded by App.tsx). */
export type BadgeKey = 'salesApprovals' | 'productionApprovals' | 'requestsToAccept';

export type Destination = {
  path: string;
  label: I18nKey;
  icon: IconKey;
  spec: ScreenSpec;
  /** The view this replaced in the old App.tsx (golden test, alias table, Bunny's privacy list). */
  legacy: { view: string; screen: string } | null;
  /** Bunny chat page name (utils/screenContext.ts) - the old view name, so private pages stay private. */
  screenPage: string;
};

export type NavTab = { path: string; label: I18nKey; icon: IconKey; subs: string[]; badge?: BadgeKey };
export type MoreGroup = { title: I18nKey; items: string[] };

export type NavModel = {
  kind: RoleKind;
  home: HomeKind;
  perms: Permissions;
  tabs: NavTab[];
  /** The More (owners, managers) or Me (staff) page lists. */
  more: MoreGroup[];
  destinations: Record<string, Destination>;
  /** Every destination someone can find in the navigation (tabs, sub-tabs, More / Me rows). */
  discoverable: string[];
  chrome: { askBunny: boolean; storeSwitcher: boolean };
};

/** The component and permission props a spec stands for (golden test, debugging). */
export function describeSpec(spec: ScreenSpec): string {
  switch (spec.screen) {
    case 'Home':
      return spec.embeds ? describeSpec(spec.embeds) : `Home(${spec.home})`;
    case 'Analytics':
      return spec.tab ? `Analytics(${spec.tab})` : 'Analytics';
    case 'SalesManagement':
    case 'SalesView':
      return spec.tab && spec.tab !== 'entry' ? `${spec.screen}(${spec.tab})` : spec.screen;
    case 'StockOutLog':
      return `StockOutLog(${spec.scope},canDelete=${spec.canDelete})`;
    case 'RiderTrips':
      return `RiderTrips(${spec.mode},canDispatch=${spec.canDispatch})`;
    case 'AttendancePortal':
      return spec.mode === 'manager' ? 'AttendancePortal(manager)' : `AttendancePortal(isIncharge=${spec.isIncharge})`;
    case 'PayrollManagement':
      return `PayrollManagement(${spec.mode})`;
    case 'WorkplaceChecks':
      return spec.tab ? `WorkplaceChecks(${spec.tab})` : 'WorkplaceChecks';
    case 'AssetsManagement':
      return spec.tab && spec.tab !== 'equipment' ? `AssetsManagement(${spec.tab})` : 'AssetsManagement';
    case 'ExportData':
      return spec.tab === 'audit' ? 'ExportData(audit)' : `ExportData(${spec.userRole})`;
    case 'AuditDashboard':
      return ({ analytics: 'Analytics', inventory: 'InventoryView', sales: 'SalesTable', production: 'ProductionManagement(read-only)', payroll: 'PayrollManagement(audit)' } as const)[spec.view];
    default:
      return spec.screen;
  }
}

/** The role a login works as in the new navigation. */
export function roleKindFor(perms: Permissions): RoleKind {
  if (perms.isSiteAuditor) return 'site-auditor';
  if (perms.isAudit) return 'auditor';
  if (perms.isRider) return 'rider';
  if (perms.isEmployee) {
    if (perms.isStoreIncharge) return 'store-incharge';
    if (perms.isProductionIncharge) return 'production-incharge';
    return 'crew';
  }
  if (perms.isClusterHead) return 'owner';
  if (perms.isStoreInchargeManager) return 'store-incharge';
  if (perms.isProductionIncharge) return 'production-incharge';
  return 'ops';
}

export function buildNav(user: NavUser, options: { today: string; storeCount: number }): NavModel {
  const p = permissionsFor(user, options.today);
  const kind = roleKindFor(p);
  const destinations: Record<string, Destination> = {};
  const add = (path: string, label: I18nKey, icon: IconKey, spec: ScreenSpec, legacy: Destination['legacy'], screenPage?: string) => {
    destinations[path] = { path, label, icon, spec, legacy, screenPage: screenPage ?? legacy?.view ?? path };
    return path;
  };
  const chrome = { askBunny: p.canAskBunny, storeSwitcher: p.isClusterHead };

  // --- Site auditor: their surprise audits (Home) and the inbox; the account is the avatar sheet --
  if (kind === 'site-auditor') {
    add('home', 'nav.audits', 'audit', { screen: 'SiteAudits' }, null, 'audits');
    add('inbox', 'nav.inbox', 'inbox', { screen: 'Inbox' }, null);
    const tabs: NavTab[] = [{ path: 'home', label: 'nav.audits', icon: 'audit', subs: [] }, { path: 'inbox', label: 'nav.inbox', icon: 'inbox', subs: [] }];
    return { kind, home: 'owner', perms: p, tabs, more: [], destinations, discoverable: ['home', 'inbox'], chrome: { ...chrome, askBunny: false } };
  }

  // --- Auditor: the read-only audit dashboard's five views, one per tab (Insights is their Home) --
  if (kind === 'auditor') {
    const views = [
      ['home', 'nav.insights', 'insights', 'analytics'],
      ['audit/expenses', 'shell.expenses', 'expenses', 'inventory'],
      ['audit/sales', 'shell.sales', 'sales', 'sales'],
      ['audit/production', 'shell.production', 'production', 'production'],
      ['audit/pay', 'shell.pay', 'pay', 'payroll'],
    ] as const;
    const tabs: NavTab[] = views.map(([path, label, icon, view]) => {
      const spec: ScreenSpec = { screen: 'AuditDashboard', view };
      add(path, label, icon, spec, { view: `audit:${view}`, screen: describeSpec(spec) }, view === 'analytics' ? 'analytics' : view === 'payroll' ? 'payroll' : view);
      return { path, label, icon, subs: [] };
    });
    add('inbox', 'nav.inbox', 'inbox', { screen: 'Inbox' }, null);
    return { kind, home: 'owner', perms: p, tabs, more: [], destinations, discoverable: tabs.map((t) => t.path), chrome };
  }

  // --- Spec builders: the props each old render branch passed (App.tsx 2502-2597, 3142-3237) ---
  const staff = p.shell === 'staff';
  const stockOutSpec: ScreenSpec = {
    screen: 'StockOutLog',
    scope: p.canLogStockOuts && user.storeId ? 'own-store' : 'all-stores',
    canDelete: staff ? p.isAnyIncharge : p.isStoreInchargeManager || p.isOperationsManager || p.isClusterHead,
  };
  const ridersSpec: ScreenSpec = { screen: 'RiderTrips', mode: staff && p.isRider ? 'rider' : 'staff', canDispatch: p.canDispatchRiders };
  const salesScreen = staff ? 'SalesManagement' : p.isStoreInchargeManager ? 'SalesManagement' : 'SalesView';
  const exportRole = staff ? 'manager' : user.role;

  // What renders a real screen today (the render chains, after the staff/rider redirect).
  const can = {
    analytics: staff ? p.isAnyIncharge : true,
    inventory: staff ? p.isAnyIncharge : true,
    sales: staff ? p.isAnyIncharge : true,
    production: p.canViewProduction && (staff ? p.isAnyIncharge : true),
    payroll: staff, // manager logins reach payroll inside Employees
    attendance: staff && !p.isRider,
    export: staff ? p.isAnyIncharge : true,
    backup: !staff && p.isClusterHead,
    employees: !staff,
    assets: staff ? p.isAnyIncharge : true,
    advancedInventory: !staff,
    inventoryItems: staff ? p.isAnyIncharge : true,
    riders: staff ? p.isRider || p.isAnyIncharge : true,
    riderProfile: staff && p.isRider,
    receiveStock: staff && p.canReceiveStock,
    stockOuts: p.canViewStockOuts && !(staff && p.isRider),
    workplace: staff ? !p.isRider : true,
    teamKpis: !staff && (p.isClusterHead || p.isOperationsManager),
    myKpis: staff ? !p.isRider : !p.isClusterHead,
  };

  const L = (view: string, spec: ScreenSpec, screen?: string) => ({ view, screen: screen ?? describeSpec(spec) });
  const analyticsSpec: ScreenSpec = { screen: 'Analytics' };
  const salesSpec: ScreenSpec = { screen: salesScreen };
  const assetsSpec: ScreenSpec = { screen: 'AssetsManagement' };
  const exportSpec: ScreenSpec = { screen: 'ExportData', userRole: exportRole };

  // --- Destinations this login can open ---------------------------------------------------------
  const homeSpec: ScreenSpec = kind === 'rider'
    ? { screen: 'Home', home: 'rider', embeds: ridersSpec }
    : { screen: 'Home', home: kind === 'owner' ? 'owner' : kind === 'crew' ? 'crew' : 'staff' };
  add('home', 'nav.today', 'home', homeSpec,
    kind === 'rider' ? L('riders', ridersSpec) : null, kind === 'rider' ? 'riders' : 'analytics');
  add('inbox', 'nav.inbox', 'inbox', { screen: 'Inbox' }, null);

  const stockTab = kind === 'production-incharge' ? 'production' : 'stock';
  if (can.analytics) {
    add('insights', 'nav.insights', 'insights', analyticsSpec, L('analytics', analyticsSpec));
    add(`${stockTab}/requests`, kind === 'owner' ? 'more.stockRequests' : 'shell.requests', 'requests', { screen: 'ProductionRequests' }, L('analytics', analyticsSpec), 'analytics');
    if (kind === 'owner' || kind === 'ops') {
      // Cash & Paytm lives in the sales overview's own Cash tab now (top-ups, Paytm ledger, weekly
      // reconciliation); Insights keeps the cash trend.
      add('money/cash', 'shell.cashPaytm', 'cash', { screen: 'SalesView', tab: 'cash' }, L('sales', { screen: 'SalesView' }));
    }
  }
  if (can.sales) {
    const salesLabel: I18nKey = kind === 'store-incharge' ? 'shell.dayClose' : kind === 'production-incharge' && !staff ? 'shell.cash' : 'shell.sales';
    add('money/sales', salesLabel, 'sales', salesSpec, L('sales', salesSpec));
    // Aggregator payouts and loans: their own tabs where the old Sales screen gave them a tab
    // of their own (owner and operations manager: SalesView canManagePayouts).
    if (kind === 'owner' || kind === 'ops') {
      add('money/payouts', 'shell.payouts', 'payouts', { screen: salesScreen, tab: 'payout' }, L('sales', salesSpec));
      add('money/loans', 'shell.loans', 'loans', { screen: salesScreen, tab: 'loans' }, L('sales', salesSpec));
    }
  }
  if (can.inventory) add('money/expenses', 'shell.expenses', 'expenses', { screen: 'InventoryManagement' }, L('inventory', { screen: 'InventoryManagement' }));
  if (can.production) {
    const spec: ScreenSpec = { screen: 'ProductionManagement' };
    add(kind === 'production-incharge' ? 'production/batches' : 'stock/production', kind === 'production-incharge' ? 'shell.batches' : 'shell.production', 'batches', spec, L('production', spec));
  }
  if (can.advancedInventory) {
    const spec: ScreenSpec = { screen: 'AdvancedInventoryManagement' };
    add(`${stockTab}/on-hand`, kind === 'owner' ? 'more.stockOnHand' : 'shell.onHand', 'on-hand', spec, L('advanced-inventory', spec));
  }
  if (can.stockOuts) add(`${stockTab}/out-of-stock`, kind === 'owner' ? 'more.outOfStockLog' : 'shell.outOfStock', 'out-of-stock', stockOutSpec, L('stock-outs', stockOutSpec));
  if (can.riders && kind !== 'rider') add(`${stockTab}/riders`, 'shell.riders', 'riders', ridersSpec, L('riders', ridersSpec));
  if (can.receiveStock) add('stock/receive', 'shell.receive', 'receive', { screen: 'IncomingDeliveries' }, L('receive-stock', { screen: 'IncomingDeliveries' }));

  if (can.employees) {
    const em: ScreenSpec = { screen: 'EmployeeManagement' };
    add('team/people', 'shell.people', 'people', em, L('employees', em));
    add('team/attendance', 'shell.attendance', 'attendance', { screen: 'AttendancePortal', mode: 'manager' }, L('employees', em), 'attendance');
    add('team/pay', 'shell.pay', 'pay', { screen: 'PayrollManagement', mode: 'manager' }, L('employees', em), 'payroll');
    add('hierarchy', 'more.hierarchy', 'hierarchy', { screen: 'HierarchyManagement' }, L('employees', em));
  }
  if (can.payroll) {
    if (p.isAnyIncharge) {
      const spec: ScreenSpec = { screen: 'PayrollManagement', mode: 'incharge' };
      add('team/pay', 'shell.pay', 'pay', spec, L('payroll', spec));
      add('my-pay', 'more.myPay', 'pay', spec, L('payroll', spec));
    } else {
      const spec: ScreenSpec = { screen: 'EmployeeDashboard' };
      add('pay', 'nav.pay', 'pay', spec, L('payroll', spec));
    }
  }
  if (can.attendance) {
    const legacySpec: ScreenSpec = { screen: 'AttendancePortal', mode: 'staff', isIncharge: p.isAnyIncharge };
    if (p.isAnyIncharge) {
      // Incharges approve their staff's timesheets and leave from Attendance (owner, 27 Oct 2026).
      add('team/attendance', 'shell.attendance', 'attendance', { ...legacySpec, tab: 'approvals' }, L('attendance', legacySpec));
    }
    add('my-attendance', 'more.myAttendance', 'attendance', { ...legacySpec, tab: 'mine' }, L('attendance', legacySpec));
  }
  if (can.teamKpis) add('team/kpis', 'shell.kpis', 'kpis', { screen: 'TeamKpis' }, L('team-kpis', { screen: 'TeamKpis' }));
  if (can.myKpis) add('my-kpis', 'more.myKpis', 'kpis', { screen: 'MyKpis' }, L('my-kpis', { screen: 'MyKpis' }));
  if (can.workplace) {
    const wc: ScreenSpec = { screen: 'WorkplaceChecks' };
    if (kind === 'crew') {
      add('my-checks', 'more.myChecks', 'checks', { screen: 'WorkplaceChecks', tab: 'mine' }, L('workplace', wc));
    } else {
      add('team/checks', 'shell.checks', 'checks', { screen: 'WorkplaceChecks', tab: 'review' }, L('workplace', wc));
      if (p.isAnyIncharge && staff) add('my-checks', 'more.myChecks', 'checks', { screen: 'WorkplaceChecks', tab: 'mine' }, L('workplace', wc));
      if (kind === 'owner' || kind === 'ops') add('workplace-setup', 'more.workplaceSetup', 'checks', { screen: 'WorkplaceChecks', tab: 'setup' }, L('workplace', wc));
    }
  }
  if (can.assets) {
    add('equipment', 'more.equipment', 'equipment', assetsSpec, L('assets', assetsSpec));
    if (p.isClusterHead) {
      add('investments', 'more.investments', 'investments', { screen: 'AssetsManagement', tab: 'investments' }, L('assets', assetsSpec));
      add('stores', 'more.stores', 'stores', { screen: 'AssetsManagement', tab: 'assets' }, L('assets', assetsSpec));
    }
  }
  if (can.inventoryItems) add('items', 'more.items', 'items', { screen: 'InventoryItemsManagement' }, L('inventory-items', { screen: 'InventoryItemsManagement' }));
  if (can.export) {
    add('reports', 'more.reports', 'reports', exportSpec, L('export', exportSpec));
    add('audit-report', 'more.audit', 'audit', { screen: 'ExportData', userRole: exportRole, tab: 'audit' }, L('export', exportSpec));
  }
  if (can.backup) add('backup', 'more.backup', 'backup', { screen: 'BackupRestore' }, L('backup', { screen: 'BackupRestore' }));
  if (can.riderProfile) add('rider-profile', 'more.riderProfile', 'profile', { screen: 'RiderProfile' }, L('rider-profile', { screen: 'RiderProfile' }));
  // Event stalls (owner, 27 Oct 2026): the owner and managers find them under More; staff assigned
  // to an event open it from their Home card. Which events anyone may see is the server's call.
  if (kind !== 'rider') add('events', 'event.events', 'events', { screen: 'Events' }, null, 'events');
  // SOP recipe sheets (owner, 27 Oct 2026): the production head (and the kitchen crew he picks)
  // fills them in; the owner and operations managers review them and set the standards and costs.
  // The server decides who may enter, review or see costs.
  if (kind === 'production-incharge') add('production/recipes', 'recipes.title', 'recipes', { screen: 'Recipes', mode: 'capture' }, null, 'recipes');
  if (kind === 'crew' && (user.designation || '').startsWith('production')) add('recipes', 'recipes.title', 'recipes', { screen: 'Recipes', mode: 'capture' }, null, 'recipes');
  if (kind === 'owner' || kind === 'ops') add('recipes-costs', 'recipes.costsTitle', 'recipes', { screen: 'Recipes', mode: 'review' }, null, 'recipes');
  // Customer complaints (owner, 28 Oct 2026): logged and decided by the owner and operations managers;
  // people asked to explain answer from their Home.
  if (kind === 'owner' || kind === 'ops') add('complaints', 'more.complaints', 'complaints', { screen: 'Complaints' }, null, 'complaints');
  // Surprise audits (owner, 28 Oct 2026): set up by the owner and ops, done by them or an auditor.
  if (kind === 'owner' || kind === 'ops') add('audits', 'more.audits', 'audit', { screen: 'SiteAudits' }, null, 'audits');
  // Store opening checklist: progress, picking who opens, and Set up (owner, 28 Oct 2026).
  if (kind === 'owner' || kind === 'ops') add('opening', 'more.opening', 'audit', { screen: 'OpeningChecklist' }, null, 'opening');
  // Emergency contacts (owner, 29 Oct 2026): everyone can find and call a number; the owner, ops and incharges keep it up to date.
  add('contacts', 'more.contacts', 'contacts', { screen: 'Contacts' }, null, 'contacts');
  // Shopping lists: each list's timeline - sent, reached the shopper, vendors, shopping, prices (owner, 29 Oct 2026).
  if (kind === 'owner' || kind === 'ops') add('shopping', 'more.shopping', 'expenses', { screen: 'ShoppingLists' }, null, 'shopping');

  // --- Tabs and the More / Me lists (design review b4) -----------------------------------------
  const has = (path: string) => !!destinations[path];
  const subs = (...paths: string[]) => paths.filter(has);
  const tab = (path: string, label: I18nKey, icon: IconKey, children: string[], badge?: BadgeKey): NavTab | null => {
    if (children.length === 0 && !has(path)) return null;
    return { path, label, icon, subs: children, badge };
  };
  const group = (title: I18nKey, ...items: string[]): MoreGroup | null => {
    const present = items.filter(has);
    return present.length ? { title, items: present } : null;
  };
  const moreSpec: ScreenSpec = { screen: 'More' };
  let tabs: (NavTab | null)[] = [];
  let more: (MoreGroup | null)[] = [];

  if (kind === 'owner') {
    add('more', 'nav.more', 'more', moreSpec, null);
    tabs = [
      tab('home', 'nav.home', 'home', []),
      tab('insights', 'nav.insights', 'insights', []),
      tab('money', 'nav.money', 'money', subs('money/sales', 'money/expenses', 'money/cash', 'money/payouts', 'money/loans'), 'salesApprovals'),
      tab('team', 'nav.team', 'team', subs('team/people', 'team/attendance', 'team/pay', 'team/kpis', 'team/checks')),
      tab('more', 'nav.more', 'more', []),
    ];
    more = [
      group('more.dailyOps', 'stock/requests', 'stock/production', 'stock/on-hand', 'stock/out-of-stock', 'stock/riders', 'shopping', 'events', 'complaints', 'audits', 'opening'),
      group('more.assets', 'equipment', 'investments'),
      group('more.setup', 'items', 'stores', 'hierarchy', 'workplace-setup', 'recipes-costs'),
      group('more.data', 'reports', 'audit-report', 'backup'),
      group('more.help', 'contacts'),
    ];
  } else if (kind === 'ops') {
    add('more', 'nav.more', 'more', moreSpec, null);
    tabs = [
      tab('home', 'nav.home', 'home', []),
      tab('stock', 'nav.stock', 'stock', subs('stock/requests', 'stock/production', 'stock/on-hand', 'stock/out-of-stock', 'stock/riders'), 'productionApprovals'),
      tab('money', 'nav.money', 'money', subs('money/sales', 'money/expenses', 'money/cash', 'money/payouts', 'money/loans'), 'salesApprovals'),
      tab('team', 'nav.team', 'team', subs('team/people', 'team/attendance', 'team/pay', 'team/kpis', 'team/checks')),
      tab('more', 'nav.more', 'more', []),
    ];
    more = [
      group('more.business', 'insights', 'shopping', 'events', 'recipes-costs', 'complaints', 'audits', 'opening', 'my-kpis'),
      group('more.assets', 'equipment'),
      group('more.setup', 'items', 'hierarchy', 'workplace-setup'),
      group('more.data', 'reports', 'audit-report'),
      group('more.help', 'contacts'),
    ];
  } else if (kind === 'store-incharge' || kind === 'production-incharge') {
    add('me', 'nav.me', 'me', moreSpec, null);
    tabs = [
      tab('home', 'nav.home', 'home', []),
      kind === 'store-incharge'
        ? tab('stock', 'nav.stock', 'stock', subs('stock/requests', 'stock/on-hand', 'stock/out-of-stock', 'stock/riders'))
        : tab('production', 'nav.production', 'production', subs('production/requests', 'production/batches', 'production/recipes', 'production/on-hand', 'production/riders', 'production/out-of-stock'), 'requestsToAccept'),
      tab('money', 'nav.money', 'money', kind === 'store-incharge' ? subs('money/sales', 'money/expenses') : subs('money/expenses', 'money/sales')),
      tab('team', 'nav.team', 'team', subs('team/people', 'team/attendance', 'team/pay', 'team/checks')),
      tab('me', 'nav.me', 'me', []),
    ];
    more = [
      group('more.myWork', 'my-pay', 'my-attendance', 'my-kpis', 'my-checks'),
      // Manage Items stays reachable by link only on employee logins, as before.
      group('more.business', 'insights', ...(staff ? [] : ['items']), 'equipment', 'reports', ...(staff ? [] : ['audit-report'])),
      group('more.help', 'contacts'),
    ];
  } else if (kind === 'crew') {
    add('me', 'nav.me', 'me', moreSpec, null);
    tabs = [
      tab('home', 'nav.home', 'home', []),
      tab('stock', 'nav.stock', 'stock', subs('stock/receive', 'stock/out-of-stock')),
      tab('pay', 'nav.pay', 'pay', []),
      tab('me', 'nav.me', 'me', []),
    ];
    more = [group('more.myWork', 'my-attendance', 'my-kpis', 'my-checks', 'recipes'), group('more.help', 'contacts')];
  } else if (kind === 'rider') {
    add('me', 'nav.me', 'me', moreSpec, null);
    // Rides: history and payments (WP7); Home keeps the current ride.
    add('trips', 'rider.trips.title', 'riders', { ...ridersSpec, variant: 'trips' } as ScreenSpec, null);
    tabs = [
      tab('home', 'nav.home', 'home', []),
      tab('trips', 'rider.trips.title', 'riders', []),
      tab('pay', 'nav.pay', 'pay', []),
      tab('me', 'nav.me', 'me', []),
    ];
    // Riders are paid per trip: no KPIs (owner, 28 Oct 2026).
    more = [group('more.myWork', 'rider-profile'), group('more.help', 'contacts')];
  }

  const finalTabs = tabs.filter((t): t is NavTab => !!t);
  const finalMore = more.filter((g): g is MoreGroup => !!g);
  const discoverable = [
    ...finalTabs.flatMap((t) => (t.subs.length ? t.subs : [t.path])),
    ...finalMore.flatMap((g) => g.items),
  ].filter((path, i, all) => has(path) && all.indexOf(path) === i);
  return {
    kind,
    home: homeSpec.screen === 'Home' ? homeSpec.home : 'staff',
    perms: p,
    tabs: finalTabs,
    more: finalMore,
    destinations,
    discoverable,
    chrome,
  };
}

/** The tab a destination belongs to (for the active pill), or the More / Me tab for its rows. */
export function tabForPath(nav: NavModel, path: string): string | null {
  const top = nav.tabs.find((t) => t.path === path || t.subs.includes(path));
  if (top) return top.path;
  if (nav.more.some((g) => g.items.includes(path))) return nav.tabs.find((t) => t.path === 'more' || t.path === 'me')?.path ?? null;
  return null;
}

/** A tab's own path opens its first sub-tab. */
export function resolveTabPath(nav: NavModel, path: string): string {
  const tab = nav.tabs.find((t) => t.path === path);
  if (tab && tab.subs.length) return tab.subs[0];
  return path;
}

/** "Owner", "Store incharge"... for the account sheet and sidebar. */
export function roleLabelKey(kind: RoleKind): I18nKey {
  switch (kind) {
    case 'owner':
      return 'role.owner';
    case 'ops':
      return 'role.opsManager';
    case 'store-incharge':
      return 'role.storeIncharge';
    case 'production-incharge':
      return 'role.productionIncharge';
    case 'rider':
      return 'role.rider';
    case 'auditor':
      return 'role.auditor';
    case 'site-auditor':
      return 'role.siteAuditor';
    default:
      return 'role.staff';
  }
}
