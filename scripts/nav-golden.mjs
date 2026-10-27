#!/usr/bin/env node
// Golden role x destination test for the app shell (design review e2, WP0b).
//
//   node scripts/nav-golden.mjs --capture   writes scripts/nav-golden.snapshot.json from LEGACY below
//   node scripts/nav-golden.mjs             checks src/components/shell/navConfig.ts against it
//
// LEGACY is a line-by-line transcription of src/App.tsx as it was before the new shell (commit
// 8cf4e613, app 1.15.22, including the 27 Oct change def3526a): the permission predicates, the
// four hand-built menus, the staff/rider redirect effect and both render chains. It records, for
// each test login, which old views ("activeView") render a real screen - by any route: menu,
// in-screen button, notification or typed URL - and with which component/props, plus which views
// sit in that login's menu.
//
// The check builds the new navigation for the same logins and asserts:
//   1. exactly the same set of old views is reachable (nothing lost, nothing gained), each with
//      the same component and permission props (SalesManagement vs SalesView, canDelete, ...);
//   2. everything that was in a menu is still in the navigation (tabs, sub-tabs, More / Me);
//   3. Ask Bunny and the store switcher go to the same people.
// New names map to old views through each destination's `legacy` field (design review b4,
// "Where today's things go").

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'scripts', 'nav-golden.snapshot.json');

// ---------------------------------------------------------------------------------------------
// Test logins. Store and production-house ids only matter for "has a store".
// ---------------------------------------------------------------------------------------------
export const PERSONAS = [
  { id: 'owner', user: { role: 'cluster_head', designation: null, storeId: null } },
  { id: 'ops-manager', user: { role: 'manager', designation: null, storeId: null } },
  { id: 'ops-incharge-manager-login', user: { role: 'manager', designation: 'operations_incharge', storeId: null } },
  { id: 'store-incharge-employee-login', user: { role: 'employee', designation: 'store_incharge', storeId: 'STORE-1' } },
  { id: 'store-incharge-employee-login-no-store', user: { role: 'employee', designation: 'store_incharge', storeId: null } },
  { id: 'store-incharge-manager-login', user: { role: 'manager', designation: 'store_incharge', storeId: 'STORE-1' } },
  { id: 'production-incharge-employee-login', user: { role: 'employee', designation: 'production_incharge', storeId: 'PH-1' } },
  { id: 'production-incharge-manager-login', user: { role: 'manager', designation: 'production_incharge', storeId: 'PH-1' } },
  { id: 'ops-incharge-employee-login', user: { role: 'employee', designation: 'operations_incharge', storeId: 'STORE-1' } },
  { id: 'store-crew', user: { role: 'employee', designation: 'store_ops', storeId: 'STORE-1' } },
  { id: 'store-crew-no-designation', user: { role: 'employee', designation: null, storeId: 'STORE-1' } },
  { id: 'crew-no-store', user: { role: 'employee', designation: null, storeId: null } },
  { id: 'kitchen-crew', user: { role: 'employee', designation: 'production_ops', storeId: 'PH-1' } },
  { id: 'rider', user: { role: 'employee', designation: 'rider', storeId: null } },
  { id: 'auditor', user: { role: 'audit', designation: null, storeId: null } },
];
// The Receive Stock switch (utils/batches.ts PHASE1_GO_LIVE = 2026-11-01).
export const DATES = ['2026-10-31', '2026-11-01'];

const ALL_VIEWS = ['inventory', 'sales', 'payroll', 'analytics', 'export', 'attendance', 'employees', 'assets', 'production', 'stock-requests', 'advanced-inventory', 'inventory-items', 'backup', 'riders', 'rider-profile', 'receive-stock', 'stock-outs', 'workplace', 'team-kpis', 'my-kpis'];

// ---------------------------------------------------------------------------------------------
// LEGACY: src/App.tsx before WP0b. Keep this exactly as it was - it is the reference.
// ---------------------------------------------------------------------------------------------
export function legacy(user, today) {
  const isPhase1Live = (date) => date >= '2026-11-01';
  // App.tsx 1910-1939
  const isClusterHead = user.role === 'cluster_head';
  const isEmployee = user.role === 'employee';
  const isAudit = user.role === 'audit';
  const isStoreIncharge = user.role === 'employee' && user.designation === 'store_incharge';
  const isProductionIncharge = user.designation === 'production_incharge';
  const isAnyIncharge = isStoreIncharge || isProductionIncharge;
  const isRider = user.designation === 'rider';
  const canReceiveStock = user.role === 'employee' && !isRider && !isAnyIncharge && user.designation !== 'production_ops' && !!user.storeId && isPhase1Live(today);
  const canDispatchRiders = user.role === 'cluster_head' || user.designation === 'production_incharge' || (user.role === 'manager' && user.designation !== 'store_incharge');
  const isOperationsManager = user.role === 'manager' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
  const isManager = user.role === 'manager';
  const isStoreInchargeManager = user.role === 'manager' && user.designation === 'store_incharge';
  const canViewProduction = isProductionIncharge || isOperationsManager || isClusterHead;
  const canLogStockOuts = !!user.storeId && !isRider && user.designation !== 'production_ops' && user.designation !== 'production_incharge' && (user.role === 'employee' || isStoreInchargeManager);
  const canViewStockOuts = canLogStockOuts || isProductionIncharge || isOperationsManager || isClusterHead;
  const canAskBunny = isClusterHead || user.role === 'manager';
  const stockOutScope = canLogStockOuts && user.storeId ? 'own-store' : 'all-stores';

  if (isAudit) {
    // App.tsx 1959-1986: the separate audit dashboard and its own five tabs.
    return {
      shell: 'audit',
      chrome: { askBunny: false, storeSwitcher: false },
      menu: ['audit:analytics', 'audit:inventory', 'audit:sales', 'audit:production', 'audit:payroll'],
      views: {
        'audit:analytics': 'Analytics',
        'audit:inventory': 'InventoryView',
        'audit:sales': 'SalesTable',
        'audit:production': 'ProductionManagement(read-only)',
        'audit:payroll': 'PayrollManagement(audit)',
      },
    };
  }

  if (isEmployee) {
    // The redirect effect (App.tsx 1798-1810) plus the retired stock-requests page (438-441).
    const effective = (view) => {
      let v = view === 'stock-requests' ? 'analytics' : view;
      if (user.designation === 'rider') {
        return ['riders', 'payroll', 'rider-profile', 'my-kpis'].includes(v) ? v : 'riders';
      }
      const isPlainEmployee = user.role === 'employee' && user.designation !== 'store_incharge' && user.designation !== 'production_incharge';
      const restrictedViews = ['analytics', 'sales', 'inventory', 'production', 'export', 'backup', 'employees', 'stock-requests', 'advanced-inventory', 'inventory-items', 'assets'];
      if (isPlainEmployee && restrictedViews.includes(v)) v = 'payroll';
      return v;
    };
    // Staff render chain (App.tsx 2502-2597); null = the EmployeeDashboard fallback.
    const render = (v) => {
      if (v === 'rider-profile' && isRider) return 'RiderProfile';
      if (v === 'my-kpis') return 'MyKpis';
      if (v === 'receive-stock' && canReceiveStock) return 'IncomingDeliveries';
      if (v === 'stock-outs' && canViewStockOuts) return `StockOutLog(${stockOutScope},canDelete=${isAnyIncharge})`;
      if (v === 'workplace' && !isRider) return 'WorkplaceChecks';
      if (v === 'riders' && (isRider || isAnyIncharge)) return `RiderTrips(${isRider ? 'rider' : 'staff'},canDispatch=${canDispatchRiders})`;
      if (v === 'analytics') return 'Analytics';
      if (v === 'inventory' && isAnyIncharge) return 'InventoryManagement';
      if (v === 'sales' && isAnyIncharge) return 'SalesManagement';
      if (v === 'production' && canViewProduction) return 'ProductionManagement';
      if (v === 'payroll') return isAnyIncharge ? 'PayrollManagement(incharge)' : 'EmployeeDashboard';
      if (v === 'attendance') return `AttendancePortal(isIncharge=${isAnyIncharge})`;
      if (v === 'export' && isAnyIncharge) return 'ExportData(manager)';
      if (v === 'assets' && isAnyIncharge) return 'AssetsManagement';
      if (v === 'advanced-inventory' && isManager) return 'AdvancedInventoryManagement';
      if (v === 'inventory-items' && (isManager || isAnyIncharge)) return 'InventoryItemsManagement';
      return null;
    };
    const views = {};
    for (const v of ALL_VIEWS) {
      if (v === 'stock-requests') continue; // an alias of analytics > Stock Requests
      if (effective(v) !== v) continue;
      const screen = render(v);
      if (screen) views[v] = screen;
    }
    // Staff menus (desktop 2034-2237 and mobile 2243-2483 list the same items).
    const menu = [
      isAnyIncharge && 'analytics',
      isAnyIncharge && 'inventory',
      isAnyIncharge && 'sales',
      isManager && 'advanced-inventory',
      isManager && 'inventory-items',
      (isRider || isAnyIncharge) && 'riders',
      isRider && 'rider-profile',
      canReceiveStock && 'receive-stock',
      canLogStockOuts && 'stock-outs',
      !isRider && 'workplace',
      'my-kpis',
      'payroll',
      !isRider && 'attendance',
      isAnyIncharge && 'export',
      isAnyIncharge && 'assets',
    ].filter(Boolean).filter((v) => views[v]);
    return { shell: 'staff', chrome: { askBunny: false, storeSwitcher: false }, menu, views };
  }

  // Manager shell (cluster_head, manager). Render chain App.tsx 3142-3237; null = ClusterDashboard.
  const render = (v) => {
    if (v === 'stock-outs' && canViewStockOuts) return `StockOutLog(${stockOutScope},canDelete=${isStoreInchargeManager || isOperationsManager || isClusterHead})`;
    if (v === 'workplace') return 'WorkplaceChecks';
    if (v === 'team-kpis' && (isClusterHead || isOperationsManager)) return 'TeamKpis';
    if (v === 'my-kpis' && !isClusterHead) return 'MyKpis';
    if (v === 'riders') return `RiderTrips(staff,canDispatch=${canDispatchRiders})`;
    if (v === 'sales') return isStoreInchargeManager ? 'SalesManagement' : 'SalesView';
    if (v === 'inventory') return user.role === 'manager' || user.role === 'cluster_head' ? 'InventoryManagement' : 'InventoryView';
    if (v === 'analytics') return 'Analytics';
    if (v === 'export') return `ExportData(${user.role})`;
    if (v === 'backup' && isClusterHead) return 'BackupRestore';
    if (v === 'employees') return 'EmployeeManagement';
    if (v === 'assets') return 'AssetsManagement';
    if (v === 'production' && canViewProduction) return 'ProductionManagement';
    if (v === 'advanced-inventory') return 'AdvancedInventoryManagement';
    if (v === 'inventory-items') return 'InventoryItemsManagement';
    return null;
  };
  const views = {};
  for (const v of ALL_VIEWS) {
    if (v === 'stock-requests') continue;
    // applyNavigationTarget sends 'attendance' to 'employees' (its Attendance tab) for these logins.
    if (v === 'attendance') continue;
    const screen = render(v);
    if (screen) views[v] = screen;
  }
  // Manager menus (desktop 2654-2863, mobile 2868-3111).
  const menu = [
    'riders',
    'workplace',
    ...(isClusterHead
      ? ['analytics', 'inventory', 'sales', canLogStockOuts && 'stock-outs', 'employees', 'assets', 'export', 'backup']
      : ['analytics', 'sales', canLogStockOuts && 'stock-outs', 'inventory', 'employees', 'export', 'assets']),
    (isClusterHead || isOperationsManager) && 'team-kpis',
    !isClusterHead && 'my-kpis',
  ].filter(Boolean).filter((v) => views[v]);
  // Store picker: owner only (App.tsx 3119). Bunny chat: owner and every manager login (1939).
  return { shell: 'manager', chrome: { askBunny: canAskBunny, storeSwitcher: isClusterHead }, menu, views };
}

function captureAll() {
  const out = {};
  for (const date of DATES) {
    for (const p of PERSONAS) out[`${p.id}@${date}`] = legacy(p.user, date);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CHECK: the new navigation (src/components/shell/navConfig.ts) against the snapshot.
// ---------------------------------------------------------------------------------------------

// Screens that used to live inside another screen: a destination showing one of these maps to
// the old view of its host (e.g. Stock > Requests was Analytics > Stock Requests).
const EMBEDDED_IN = {
  ProductionRequests: ['Analytics'],
  'Analytics(cash-reconciliation)': ['Analytics'],
  'Analytics(trends)': ['Analytics'],
  'AttendancePortal(manager)': ['EmployeeManagement'],
  'PayrollManagement(manager)': ['EmployeeManagement'],
  HierarchyManagement: ['EmployeeManagement'],
  'SalesView(payout)': ['SalesView'],
  'SalesView(loans)': ['SalesView'],
  'SalesManagement(payout)': ['SalesManagement'],
  'SalesManagement(loans)': ['SalesManagement'],
  'AssetsManagement(assets)': ['AssetsManagement'],
  'AssetsManagement(investments)': ['AssetsManagement'],
  'ExportData(audit)': ['ExportData(manager)', 'ExportData(cluster_head)'],
  'WorkplaceChecks(review)': ['WorkplaceChecks'],
  'WorkplaceChecks(setup)': ['WorkplaceChecks'],
  'WorkplaceChecks(mine)': ['WorkplaceChecks'],
  'AttendancePortal(isIncharge=true,approvals)': ['AttendancePortal(isIncharge=true)'],
};

async function loadNavConfig() {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/components/shell/navConfig.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const tmp = path.join(ROOT, 'node_modules', '.cache', 'nav-golden');
  fs.mkdirSync(tmp, { recursive: true });
  const file = path.join(tmp, `navConfig-${process.pid}.mjs`);
  fs.writeFileSync(file, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function check(snapshot, nav) {
  const failures = [];
  const rows = [];
  for (const [key, old] of Object.entries(snapshot)) {
    const [id, date] = key.split('@');
    const persona = PERSONAS.find((p) => p.id === id);
    const model = nav.buildNav({ ...persona.user, name: 'Test', email: 't@example.test', employeeId: 'E1' }, { today: date, storeCount: 2 });

    // 1. Reachable old views (+ the screen each shows).
    const got = {};
    for (const dest of Object.values(model.destinations)) {
      if (!dest.legacy) continue;
      const { view, screen } = dest.legacy;
      const shown = nav.describeSpec(dest.spec);
      const hosts = EMBEDDED_IN[shown];
      if (shown !== screen && !(hosts && hosts.includes(screen))) {
        failures.push(`${key}: ${dest.path} shows ${shown} but claims old ${view} = ${screen}`);
      }
      if (got[view] && got[view] !== screen) failures.push(`${key}: old view ${view} reached as both ${got[view]} and ${screen}`);
      got[view] = screen;
    }
    const oldViews = Object.keys(old.views).sort();
    const newViews = Object.keys(got).sort();
    for (const v of oldViews) {
      if (!got[v]) failures.push(`${key}: LOST ${v} (${old.views[v]})`);
      else if (got[v] !== old.views[v]) failures.push(`${key}: ${v} was ${old.views[v]}, now ${got[v]}`);
    }
    for (const v of newViews) if (!old.views[v]) failures.push(`${key}: GAINED ${v} (${got[v]})`);

    // 2. Everything that was in the menu is still in the navigation.
    const navViews = new Set(model.discoverable.map((p) => model.destinations[p]?.legacy?.view).filter(Boolean));
    for (const v of old.menu) if (!navViews.has(v)) failures.push(`${key}: menu item ${v} is no longer in the navigation`);

    // 3. Chrome.
    if (model.chrome.askBunny !== old.chrome.askBunny) failures.push(`${key}: Ask Bunny ${old.chrome.askBunny} -> ${model.chrome.askBunny}`);
    if (model.chrome.storeSwitcher !== old.chrome.storeSwitcher) failures.push(`${key}: store switcher ${old.chrome.storeSwitcher} -> ${model.chrome.storeSwitcher}`);

    rows.push({ key, tabs: model.tabs.map((t) => t.path).join(' · '), views: oldViews.length });
  }
  return { failures, rows };
}

// --- CLI ---
const args = process.argv.slice(2);
if (args.includes('--capture')) {
  fs.writeFileSync(SNAPSHOT, JSON.stringify(captureAll(), null, 2) + '\n');
  console.log(`Wrote ${path.relative(ROOT, SNAPSHOT)} (${PERSONAS.length} logins x ${DATES.length} dates).`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  // The transcription must still produce the snapshot (guards against edits to LEGACY).
  const fresh = captureAll();
  if (JSON.stringify(fresh) !== JSON.stringify(snapshot)) {
    console.error('LEGACY no longer matches nav-golden.snapshot.json - the reference was edited.');
    process.exit(1);
  }
  const nav = await loadNavConfig();
  const { failures, rows } = check(snapshot, nav);
  for (const r of rows) console.log(`${r.key.padEnd(48)} ${String(r.views).padStart(2)} old views  tabs: ${r.tabs}`);
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
  }
  console.log(`\nOK: ${rows.length} login/date combinations reach exactly the same screens as before.`);
}
