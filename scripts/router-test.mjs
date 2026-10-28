#!/usr/bin/env node
// Unit tests for src/components/shell/router.ts (WP0b):
//   1. hash routes parse and print back the same;
//   2. Back walks the ladder: close sheet -> close dialog -> pop page -> Home -> exit (only from Home);
//   3. every old notification target resolves - each type in utils/notificationNavigation.ts,
//      public/sw.js and the server's notify calls, for every test login - and lands on the screen
//      that replaced its old view whenever that login could open it.
//
//   node scripts/router-test.mjs

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PERSONAS, DATES } from './nav-golden.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function bundle(entrySource) {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    stdin: { contents: entrySource, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    external: ['@capacitor/*'],
  });
  const dir = path.join(ROOT, 'node_modules', '.cache', 'router-test');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bundle-${process.pid}.mjs`);
  fs.writeFileSync(file, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const mod = await bundle(`
  export * from './src/components/shell/router.ts';
  export { buildNav } from './src/components/shell/navConfig.ts';
  export { getNavigationTarget } from './src/utils/notificationNavigation.ts';
`);
const { parseHash, formatHash, NavStack, applyBack, decideBack, resolveLegacyTarget, normalizeRoute, LEGACY_ALIASES, HOME, buildNav, getNavigationTarget } = mod;

let failures = 0;
let passes = 0;
function expect(name, actual, wanted) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (ok) passes++;
  else {
    failures++;
    console.error(`FAIL ${name}\n  got:    ${JSON.stringify(actual)}\n  wanted: ${JSON.stringify(wanted)}`);
  }
}

// --- 1. Hash routes -----------------------------------------------------------------------------
expect('parse simple', parseHash('#/money/expenses'), { path: 'money/expenses', params: {} });
expect('parse params', parseHash('#/money/expenses?date=2026-10-27&tab=x'), { path: 'money/expenses', params: { date: '2026-10-27', tab: 'x' } });
expect('parse trailing slash', parseHash('#/more/'), { path: 'more', params: {} });
expect('parse empty', parseHash(''), null);
expect('parse non-route hash', parseHash('#section'), null);
expect('format round trip', formatHash(parseHash('#/stock/requests?highlight=PR-1')), '#/stock/requests?highlight=PR-1');

// --- 2. Back ladder -----------------------------------------------------------------------------
const owner = buildNav({ role: 'cluster_head', designation: null, storeId: null }, { today: '2026-10-27', storeCount: 2 });
const nothingOpen = { overlayOpen: false, dialogOpen: false };
{
  const s = new NavStack(HOME);
  expect('home: exit', applyBack(s, nothingOpen), 'exit');
  expect('home stays home', s.current.path, 'home');
}
{
  const s = new NavStack(HOME);
  s.go(normalizeRoute({ path: 'money', params: {} }, owner)); // a tab opens its first sub-tab
  expect('tab opens first sub', s.current.path, 'money/sales');
  s.replace(normalizeRoute({ path: 'money/expenses', params: {} }, owner)); // sub-tab switch
  expect('tab -> back goes Home', applyBack(s, nothingOpen), 'home');
  expect('now at Home', s.current.path, 'home');
  expect('then exit', applyBack(s, nothingOpen), 'exit');
}
{
  const s = new NavStack(HOME);
  s.go(normalizeRoute({ path: 'more', params: {} }, owner));
  s.push(normalizeRoute({ path: 'items', params: {} }, owner));
  expect('pushed page depth', s.depth, 1);
  expect('sheet open: close it first', applyBack(s, { overlayOpen: true, dialogOpen: true }), 'close-overlay');
  expect('sheet close keeps page', s.current.path, 'items');
  expect('dialog open: close it', applyBack(s, { overlayOpen: false, dialogOpen: true }), 'close-dialog');
  expect('dialog close keeps page', s.current.path, 'items');
  expect('pop page', applyBack(s, nothingOpen), 'pop');
  expect('back on More', s.current.path, 'more');
  expect('More -> Home', applyBack(s, nothingOpen), 'home');
  expect('exit from Home only', applyBack(s, nothingOpen), 'exit');
}
{
  const s = new NavStack(HOME);
  s.push(normalizeRoute({ path: 'inbox', params: {} }, owner));
  expect('inbox over Home pops back to Home', applyBack(s, nothingOpen), 'pop');
  expect('at Home after inbox', s.current.path, 'home');
}
{
  const s = new NavStack(HOME);
  s.push({ path: 'items', params: {} });
  s.push({ path: 'items', params: {} });
  expect('same page is not pushed twice', s.depth, 1);
}
expect('decideBack order', [
  decideBack({ overlayOpen: true, dialogOpen: true, depth: 2, atHome: false }),
  decideBack({ overlayOpen: false, dialogOpen: true, depth: 2, atHome: false }),
  decideBack({ overlayOpen: false, dialogOpen: false, depth: 2, atHome: false }),
  decideBack({ overlayOpen: false, dialogOpen: false, depth: 0, atHome: false }),
  decideBack({ overlayOpen: false, dialogOpen: false, depth: 0, atHome: true }),
], ['close-overlay', 'close-dialog', 'pop', 'home', 'exit']);
expect('unknown path -> Home', normalizeRoute({ path: 'nope', params: {} }, owner).path, 'home');
expect('crew cannot open backup -> Home', normalizeRoute({ path: 'backup', params: {} }, buildNav({ role: 'employee', designation: 'store_ops', storeId: 'STORE-1' }, { today: '2026-11-01', storeCount: 1 })).path, 'home');

// --- 3. Notification targets ----------------------------------------------------------------------
function mapKeys(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const block = src.slice(src.indexOf('NOTIFICATION_VIEW_MAP'), src.indexOf('};', src.indexOf('NOTIFICATION_VIEW_MAP')));
  return [...block.matchAll(/^\s*([a-z_]+):\s*\{\s*view:\s*'([a-z-]+)'/gm)].map((m) => ({ type: m[1], view: m[2] }));
}
const appMap = mapKeys('src/utils/notificationNavigation.ts');
const swMap = mapKeys('public/sw.js');
expect('sw.js and notificationNavigation.ts list the same types', swMap.map((x) => `${x.type}=${x.view}`).sort(), appMap.map((x) => `${x.type}=${x.view}`).sort());

// Every notification type the server sends (2nd argument of its notify helpers).
const serverDir = path.join(ROOT, 'supabase', 'functions', 'make-server-c2dd9b9d');
const serverTypes = new Set();
for (const f of fs.readdirSync(serverDir).filter((n) => n.endsWith('.ts'))) {
  const src = fs.readFileSync(path.join(serverDir, f), 'utf8');
  for (const m of src.matchAll(/(?:notifyUser|safeNotify|notifyEmployeeIds|createNotification)\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*'([a-z]+(?:_[a-z]+)+)'/g)) serverTypes.add(m[1]);
  for (const m of src.matchAll(/notifyClusterHeads\(\s*'([a-z]+(?:_[a-z]+)+)'/g)) serverTypes.add(m[1]);
  for (const m of src.matchAll(/notifyUser\([^;]*?'(backup_failed)'/g)) serverTypes.add(m[1]);
  // production_request_${status} (a template), with every request status
  if (/`production_request_\$\{/.test(src)) for (const st of ['accepted', 'in-preparation', 'prepared', 'shipped', 'partially-shipped', 'delivered', 'partially-delivered']) serverTypes.add(`production_request_${st}`);
}
const allTypes = [...new Set([...appMap.map((x) => x.type), ...swMap.map((x) => x.type), ...serverTypes])].sort();

const unmapped = [];
let resolutions = 0;
for (const type of allTypes) {
  const target = getNavigationTarget({ type, relatedId: 'REL-1' });
  if (!target) {
    unmapped.push(type);
    continue;
  }
  if (!LEGACY_ALIASES[target.view]) {
    failures++;
    console.error(`FAIL ${type}: old view "${target.view}" has no entry in LEGACY_ALIASES`);
    continue;
  }
  for (const date of DATES) {
    for (const p of PERSONAS) {
      const nav = buildNav({ ...p.user, name: 'Test' }, { today: date, storeCount: 2 });
      const route = resolveLegacyTarget(target, nav);
      resolutions++;
      if (route.path !== 'home' && !nav.destinations[route.path]) {
        failures++;
        console.error(`FAIL ${type} for ${p.id}: resolved to ${route.path}, which this login can't open`);
        continue;
      }
      // When this login could open the old view, the link must land on what replaced it.
      const oldView = target.view === 'stock-requests' ? 'analytics' : target.view;
      const viaEmployees = oldView === 'attendance' && p.user.role !== 'employee' ? 'employees' : oldView;
      const replacements = Object.values(nav.destinations).filter((d) => d.legacy?.view === viaEmployees);
      if (replacements.length && route.path === 'home' && !replacements.some((d) => d.path === 'home')) {
        failures++;
        console.error(`FAIL ${type} for ${p.id}: went Home although ${replacements.map((d) => d.path).join(', ')} replaced ${viaEmployees}`);
      } else passes++;
    }
  }
}
// Spot checks: the exact landing places.
const crew = buildNav({ role: 'employee', designation: 'store_ops', storeId: 'STORE-1' }, { today: '2026-11-01', storeCount: 1 });
const storeInc = buildNav({ role: 'employee', designation: 'store_incharge', storeId: 'STORE-1' }, { today: '2026-11-01', storeCount: 1 });
const prodInc = buildNav({ role: 'employee', designation: 'production_incharge', storeId: 'PH-1' }, { today: '2026-11-01', storeCount: 1 });
const ops = buildNav({ role: 'manager', designation: null, storeId: null }, { today: '2026-11-01', storeCount: 2 });
const rider = buildNav({ role: 'employee', designation: 'rider', storeId: null }, { today: '2026-11-01', storeCount: 1 });
const to = (type, nav) => resolveLegacyTarget(getNavigationTarget({ type, relatedId: 'REL-1' }), nav);
expect('production request -> owner stock requests, highlighted', to('production_request_new', owner), { path: 'stock/requests', params: { highlight: 'REL-1' } });
expect('production request -> production incharge queue', to('production_request_new', prodInc).path, 'production/requests');
expect('stock request -> store incharge requests', to('stock_request_new', storeInc), { path: 'stock/requests', params: { tab: 'production-requests', highlight: 'REL-1' } });
expect('calendar -> insights trends', to('calendar_suggestions', owner), { path: 'insights', params: { tab: 'trends', highlight: 'REL-1' } });
expect('timesheet pending -> incharge team attendance', to('timesheet_pending', storeInc).path, 'team/attendance');
expect('timesheet approved -> incharge own attendance', to('timesheet_approved', storeInc).path, 'my-attendance');
expect('timesheet pending -> manager team attendance', to('timesheet_pending', ops).path, 'team/attendance');
expect('leave approved -> crew own attendance', to('leave_approved', crew).path, 'my-attendance');
expect('production pending -> ops stock production, approvals tab', to('production_pending', ops), { path: 'stock/production', params: { tab: 'approvals', highlight: 'REL-1' } });
expect('production pending -> store incharge goes Home (no access)', to('production_pending', storeInc).path, 'home');
expect('delivery incoming -> crew receive', to('delivery_incoming', crew).path, 'stock/receive');
expect('stock out -> owner out-of-stock log', to('stock_out', owner).path, 'stock/out-of-stock');
expect('rider called -> rider home', to('rider_called', rider).path, 'home');
expect('rider ready -> ops riders', to('rider_ready', ops).path, 'stock/riders');
expect('workplace due -> crew my checks', to('workplace_due', crew).path, 'my-checks');
expect('workplace flag -> owner checks review', to('workplace_flag', owner), { path: 'team/checks', params: { tab: 'review', highlight: 'REL-1' } });
expect('kpi ready -> crew my KPIs', to('kpi_ready', crew).path, 'my-kpis');
expect('kpi ready -> owner Home (no My KPIs)', to('kpi_ready', owner).path, 'home');
expect('password expiring -> crew Home', to('password_expiring', crew).path, 'home');
expect('salary credited -> crew pay', to('salary_credited', crew).path, 'pay');
expect('backup failed -> owner backup', to('backup_failed', owner).path, 'backup');
expect('inventory logged -> ops expenses', to('inventory_logged', ops).path, 'money/expenses');
expect('sales pending -> store incharge day close', to('sales_pending', storeInc).path, 'money/sales');
expect('legacy URL ?view=attendance&tab=approve-leave', resolveLegacyTarget({ view: 'attendance', tab: 'approve-leave' }, storeInc), { path: 'team/attendance', params: { tab: 'approve-leave' } });

console.log(`Notification types checked: ${allTypes.length} (${appMap.length} in the app map, ${swMap.length} in sw.js, ${serverTypes.size} sent by the server); ${resolutions} type x login resolutions.`);
if (unmapped.length) console.log(`No deep link (open in the Inbox, as before): ${unmapped.join(', ')}`);
console.log(`${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
