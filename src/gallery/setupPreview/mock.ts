// Dev-only mock server for setup-preview.html: a made-up signed-in session (a fake token string,
// never a real credential) and a window.fetch that answers every call to the app's server from
// the made-up data below. Nothing leaves the browser; writes are answered and dropped. Every name,
// id, email and place is invented.
import { AUTH_STORAGE_KEY } from '../../utils/supabase/client';

export type PreviewRole = 'owner' | 'incharge' | 'staff';

const params = new URLSearchParams(window.location.search);
export const PREVIEW_ROLE: PreviewRole = (['owner', 'incharge', 'staff'].includes(params.get('role') || '') ? params.get('role') : 'owner') as PreviewRole;
const EMAIL = { owner: 'owner@example.test', incharge: 'store@example.test', staff: 'crew@example.test' }[PREVIEW_ROLE];

// A session supabase-js reads from storage without a network call (expires tomorrow).
const now = Math.floor(Date.now() / 1000);
localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
  access_token: 'preview-token-not-real',
  refresh_token: 'preview-refresh-not-real',
  token_type: 'bearer',
  expires_in: 86400,
  expires_at: now + 86400,
  user: { id: `preview-${PREVIEW_ROLE}`, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { role: PREVIEW_ROLE === 'owner' ? 'cluster_head' : 'employee' } },
}));

const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const month = today.slice(0, 7);
const daysAgo = (n: number) => new Date(Date.now() + 5.5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);

export const STORES = [
  { id: 'STORE-1', name: 'Store A', location: 'Demo Street', managerId: 'DEMO-10', productionHouseId: 'PH-1', ciferonStoreId: '1001', createdBy: 'DEMO-01', createdAt: '2026-01-01' },
  { id: 'STORE-2', name: 'Store B', location: 'Sample Road', managerId: null, productionHouseId: null, ciferonStoreId: null, createdBy: 'DEMO-01', createdAt: '2026-06-01' },
];
export const HOUSES = [
  { id: 'PH-1', name: 'Kitchen One', location: 'Market Lane', productionHeadId: 'DEMO-31', inventory: { chicken: 420, chickenCheese: 180, veg: 260, cheeseCorn: 90, paneer: 120, vegKurkure: 60, chickenKurkure: 75 }, createdBy: 'DEMO-01', createdAt: '2026-01-01' },
  { id: 'PH-2', name: 'Kitchen Two', location: 'Station Road', productionHeadId: null, inventory: { chicken: 40, chickenCheese: 0, veg: 30, cheeseCorn: 0, paneer: 10, vegKurkure: 0, chickenKurkure: 0 }, createdBy: 'DEMO-01', createdAt: '2026-08-01' },
];
export const EMPLOYEES = [
  { employeeId: 'DEMO-01', name: 'Owner Demo', email: 'owner@example.test', role: 'cluster_head', joiningDate: '2025-01-01' },
  { employeeId: 'DEMO-10', name: 'Ops Manager Demo', email: 'ops@example.test', role: 'manager', clusterHeadId: 'DEMO-01', designation: 'operations_manager', joiningDate: '2025-03-01' },
  { employeeId: 'DEMO-11', name: 'Area Lead Demo', email: 'lead@example.test', role: 'manager', clusterHeadId: 'DEMO-01', managerId: 'DEMO-10', designation: 'operations_incharge', joiningDate: '2025-05-01' },
  { employeeId: 'DEMO-21', name: 'Store Incharge Demo', email: 'store@example.test', role: 'employee', managerId: 'DEMO-10', designation: 'store_incharge', storeId: 'STORE-1', joiningDate: '2025-04-01' },
  { employeeId: 'DEMO-31', name: 'Kitchen Head Demo', email: 'kitchen@example.test', role: 'employee', managerId: 'DEMO-10', designation: 'production_incharge', storeId: 'PH-1', joiningDate: '2025-04-10' },
  { employeeId: 'DEMO-41', name: 'Counter Crew Demo', email: 'crew@example.test', role: 'employee', managerId: 'DEMO-21', designation: 'store_ops', storeId: 'STORE-1', joiningDate: '2025-07-01' },
  { employeeId: 'DEMO-42', name: 'Steamer Crew Demo', email: 'crew2@example.test', role: 'employee', managerId: 'DEMO-31', designation: 'production_ops', storeId: 'PH-1', joiningDate: '2025-08-01' },
  { employeeId: 'DEMO-55', name: 'New Joiner Demo', email: 'new@example.test', role: 'employee', designation: 'store_ops', storeId: 'STORE-2', joiningDate: daysAgo(6) },
];

const asset = (id: string, name: string, category: string, loc: string, qty: number, cost: number | null, extra: Record<string, unknown> = {}) => {
  const [kind, lid] = loc.split(':');
  return {
    id, name, category, locationKind: kind, locationId: lid || '', quantity: qty, unitCost: cost && cost / qty, totalCost: cost,
    purchaseDate: '2026-09-12', condition: 'good', notes: '', source: { kind: 'opening' }, needsReview: false,
    createdAt: '2026-10-27T08:00:00Z', updatedAt: '2026-10-27T08:00:00Z', updatedBy: 'Owner Demo', photoUrl: null, ...extra,
  };
};
const ASSETS = [
  asset('A1', 'Momo steamer (5 tier)', 'cooking_equipment', 'store:STORE-1', 2, 9000, { atEvents: [{ eventId: 'E1', eventName: 'Winter Fair', quantity: 1, since: daysAgo(2) }] }),
  asset('A2', 'Deep freezer 300 L', 'refrigeration', 'production_house:PH-1', 1, 28500),
  asset('A3', 'Steel container 20 L', 'storage_bins', 'production_house:PH-1', 6, 3600, { missing: { reportedAt: `${today}T05:00:00Z`, by: 'Kitchen Incharge Demo', count: 2, lastSeen: daysAgo(3), where: 'Rack by the back door', note: 'Two missing after the Sunday wash', policeRef: '', source: 'report', prevCondition: 'good' } }),
  asset('A4', 'Kadai large', 'utensils_pans', 'production_house:PH-1', 3, 2400, { condition: 'needs_repair' }),
  asset('A5', 'Counter table', 'furniture', 'store:STORE-1', 1, null),
  asset('A6', 'Tube light', 'electrical_lighting', 'store:STORE-1', 4, 1200),
  asset('A7', 'Delivery scooter', 'vehicle', 'production_house:PH-1', 1, 72000, { condition: 'broken' }),
  asset('A8', 'Dustbin 60 L', 'cleaning', 'store:STORE-1', 2, 1100, { needsReview: true, source: { kind: 'expense', expenseId: 'X1' }, purchaseDate: daysAgo(1) }),
  asset('A9', 'Mixer grinder', 'cooking_equipment', 'production_house:PH-1', 1, 3400, { expenseChanged: { at: daysAgo(1), kind: 'changed', expense: { name: 'Mixer grinder 750 W', quantity: 1, totalCost: 3900, purchaseDate: daysAgo(3), locationKind: 'production_house', locationId: 'PH-1' } } }),
];

const ROUTES: [RegExp, (m: RegExpMatchArray, url: URL, init?: RequestInit) => unknown][] = [
  [/^\/assets$/, () => ({
    assets: PREVIEW_ROLE === 'owner' ? ASSETS : ASSETS.filter((a) => a.locationId === 'STORE-1'),
    locations: PREVIEW_ROLE === 'owner'
      ? [{ kind: 'store', id: 'STORE-1', name: 'Store A' }, { kind: 'store', id: 'STORE-2', name: 'Store B' }, { kind: 'production_house', id: 'PH-1', name: 'Kitchen One' }]
      : [{ kind: 'store', id: 'STORE-1', name: 'Store A' }],
    permissions: PREVIEW_ROLE === 'owner'
      ? { canEditAll: true, editableLocations: ['store:STORE-1', 'store:STORE-2', 'production_house:PH-1'], canDelete: true, canImport: true }
      : { canEditAll: false, editableLocations: ['store:STORE-1'], canDelete: false, canImport: false },
    lastReconcile: { at: `${today}T03:10:00Z`, added: 1 },
  })],
  // Lost equipment and the 3-monthly check (assets.ts, owner 30 Oct 2026).
  [/^\/assets\/check$/, (_m, url, init) => (init?.method === 'POST'
    ? { success: true, record: { period: '2026-10', at: `${today}T10:00:00Z`, by: 'Owner Demo', items: 4, notFound: [], short: [], broken: [] } }
    : { open: true, period: '2026-10', done: false, canCheck: true, record: null,
      items: ASSETS.filter((a: any) => a.locationKind === url.searchParams.get('locationKind') && a.locationId === url.searchParams.get('locationId') && !a.needsReview)
        .map((a: any) => ({ ...a, needsPhoto: (a.unitCost ?? 0) > 2000 })) })],
  [/^\/assets\/([^/]+)\/missing$/, (m, _url, init) => { const a: any = ASSETS.find((x) => x.id === m[1]); const r = JSON.parse(String(init?.body || '{}')); return { asset: { ...a, missing: { ...r, reportedAt: new Date().toISOString(), by: 'Owner Demo', source: 'report', prevCondition: a.condition, count: r.count || a.quantity }, condition: (r.count || a.quantity) >= a.quantity ? 'missing' : a.condition } }; }],
  [/^\/assets\/([^/]+)\/(found|write-off)$/, (m) => ({ asset: { ...ASSETS.find((x) => x.id === m[1]), missing: null } })],
  [/^\/assets\/([^/]+)\/photo$/, (m) => ({ asset: { ...ASSETS.find((x) => x.id === m[1]), photo: { path: 'x', uploadedAt: new Date().toISOString() } } })],
  [/^\/stores$/, () => ({ stores: STORES })],
  [/^\/production-houses$/, () => ({ productionHouses: HOUSES })],
  [/^\/employees$/, () => ({ employees: EMPLOYEES })],
  [/^\/archived-employees$/, () => ({ employees: [] })],
  [/^\/investors$/, () => ({ investors: [
    { id: 'INV-1', name: 'Family Investor Demo', contactNumber: '90000 00000', email: 'investor@example.test', notes: 'Monthly interest on the 5th.', createdBy: 'owner', createdAt: '2026-02-01' },
    { id: 'INV-2', name: 'Friend Investor Demo', createdBy: 'owner', createdAt: '2026-05-01' },
  ] })],
  [/^\/online-loans\/all$/, () => ({ loans: [
    { id: 'L1', investorId: 'INV-1', loanAmount: 200000, repaidAmount: 50000, interestRate: 12, loanDate: '2026-02-10', status: 'active' },
    { id: 'L2', investorId: 'INV-1', loanAmount: 50000, repaidAmount: 50000, interestRate: 10, loanDate: '2026-04-01', status: 'repaid' },
    { id: 'L3', investorId: 'INV-2', loanAmount: 75000, repaidAmount: 12500.5, interestRate: 9.5, loanDate: '2026-06-15', status: 'active' },
  ] })],
  [/^\/online-loans\/repayments$/, () => ({ repayments: [] })],
  [/^\/rider\/places$/, () => ({ places: [
    { kind: 'production', id: 'PH-1', name: 'Kitchen One', latitude: 23.2, longitude: 87.8, setByName: 'Owner Demo', setAt: '2026-10-01' },
    { kind: 'store', id: 'STORE-1', name: 'Store A', latitude: 23.21, longitude: 87.81, setByName: 'Store Incharge Demo', setAt: '2026-10-02' },
    { kind: 'store', id: 'STORE-2', name: 'Store B', latitude: null, longitude: null, setByName: null, setAt: null },
  ] })],
  [/^\/kpi\/team/, () => ({ month, today, monthComplete: false, config: { radiusM: 150, showMoneyToStaff: false, punchSince: '2026-10-28' }, canEditMoney: true, canApprove: true, people: [] })],
  [/^\/organizational-hierarchy/, () => ({
    hierarchy: [{
      employeeId: 'DEMO-01', name: 'Owner Demo', email: 'owner@example.test', role: 'cluster_head', joiningDate: '2025-01-01',
      managers: [{ ...EMPLOYEES[1], managers: [{ ...EMPLOYEES[2], employees: [] }], employees: [EMPLOYEES[3], EMPLOYEES[4]] }],
    }],
    unassignedManagers: [],
    unassignedEmployees: [EMPLOYEES[7]],
    stats: { totalClusterHeads: 1, totalManagers: 2, totalEmployees: 5 },
  })],
  [/^\/cluster\/all-cluster-heads$/, () => [EMPLOYEES[0]]],
  [/^\/unified-employees\/manager\/(.+)$/, () => ({ employees: [EMPLOYEES[3], EMPLOYEES[4], EMPLOYEES[5]] })],
  [/^\/timesheets\/(.+)$/, (m) => ({ timesheets: m[1] === 'DEMO-21' ? [{ status: 'pending' }, { status: 'approved' }, { status: 'approved' }] : [{ status: 'approved' }] })],
  [/^\/leaves\/(.+)$/, (m) => ({ leaves: m[1] === 'DEMO-41' ? [{ status: 'pending' }, { status: 'approved' }] : [] })],
  [/^\/inventory-items$/, () => ({ items: [
    { id: 'I1', name: 'chicken_momo', displayName: 'Chicken momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'DEMO-01', createdAt: '2026-01-02', isActive: true },
    { id: 'I2', name: 'veg_momo', displayName: 'Veg momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'DEMO-01', createdAt: '2026-01-02', isActive: true },
    { id: 'I3', name: 'schezwan_sauce', displayName: 'Schezwan sauce', category: 'sauce_chutney', unit: 'kg', linkedEntityType: 'store', linkedEntityId: 'STORE-1', createdBy: 'DEMO-21', createdAt: '2026-03-14', isActive: true },
    { id: 'I4', name: 'maida', displayName: 'Maida', category: 'raw_material', unit: 'kg', linkedEntityType: 'production_house', linkedEntityId: 'PH-1', createdBy: 'DEMO-31', createdAt: '2026-02-20', isActive: true },
    { id: 'I5', name: 'red_chutney', displayName: 'Red chutney', category: 'sauce_chutney', unit: 'liters', linkedEntityType: 'global', createdBy: 'DEMO-01', createdAt: '2026-04-01', isActive: true },
  ] })],
  [/^\/custom-categories$/, () => ({ categories: [{ key: 'puja_items', scope: 'store', label: 'Puja items', emoji: '\u{1F4E6}' }] })],
  [/^\/custom-items$/, () => ({ customItems: [
    { id: 'C1', category: 'fresh_produce', itemName: 'Onion ', entityType: 'both', createdAt: '2026-05-01' },
    { id: 'C2', category: 'dairy', itemName: 'Curd', entityType: 'store', createdAt: '2026-05-02' },
    { id: 'C3', category: 'puja_items', itemName: 'Incense sticks', entityType: 'store', createdAt: '2026-06-02' },
  ] })],
  [/^\/admin\/backup\/status$/, () => ({
    passphraseSet: true, passphraseOk: true, driveConnected: true, schedule: 'Every night from 2:30 AM IST',
    last: { at: `${today}T21:00:00.000Z`.replace(today, daysAgo(1)), ok: true, rows: 48213, bytes: 18_400_000, fileName: `bunny-backup-${daysAgo(1)}.bunnybak` },
    lastDownload: { at: `${daysAgo(9)}T10:00:00Z`, rows: 47110, bytes: 18_000_000 },
    running: null,
    restores: [{ run: 'R1', startedAt: `${daysAgo(30)}T11:00:00Z`, finishedAt: `${daysAgo(30)}T11:02:00Z`, by: 'Owner Demo', mode: 'missing-only', prefixes: ['leave:'], added: 3, overwritten: 0, snapshots: [] }],
  })],
  [/^\/workplace\/template/, () => ({
    template: { items: [
      { id: 'W1', name: 'Steamer area', nameBn: 'স্টিমারের জায়গা', hint: 'Steamer tops wiped, no flour on the floor', assigneeId: 'DEMO-41', start: '15:00', end: '16:00', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'W2', name: 'Counter', nameBn: 'কাউন্টার', hint: '', assigneeId: 'DEMO-21', start: '11:00', end: '12:00', days: [1, 2, 3, 4, 5, 6] },
      { id: 'W3', name: 'Dustbins', nameBn: 'ডাস্টবিন', hint: 'Lids closed', assigneeId: null, start: '21:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
    ], updatedAt: `${daysAgo(4)}T09:30:00Z`, updatedBy: 'Owner Demo' },
    isDefault: false,
    people: [
      { id: 'DEMO-21', name: 'Store Incharge Demo', designation: 'store_incharge', here: true },
      { id: 'DEMO-41', name: 'Counter Crew Demo', designation: 'store_ops', here: true },
      { id: 'DEMO-42', name: 'Steamer Crew Demo', designation: 'production_ops', here: false },
    ],
  })],
  [/^\/sales$/, () => ({ sales: Array.from({ length: 20 }, (_, i) => ({
    id: `S${i}`, date: daysAgo(i), storeId: 'STORE-1', offlineSales: 8000 + ((i * 1370) % 4200), paytmAmount: 2000, cashAmount: 6000,
    actualCashInHand: i % 6 === 3 ? 0 : 5800, approvalRequired: i === 4, approvalStatus: i === 4 ? 'pending' : 'approved', approvalRequestedAt: daysAgo(4),
    salesDiscrepancy: i === 4 ? -240 : 0, cashOverShortAmount: i === 2 ? 120 : i === 9 ? -60 : 0, cashOverShortReason: i === 2 ? 'wrong_change' : null,
  })) })],
];

function answer(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } }));
}

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
  if (url.origin === window.location.origin) return realFetch(input, init);
  // Anything else stays in the browser: the app's server is answered from the data above.
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const path = url.pathname.replace(/^\/functions\/v1\/make-server-c2dd9b9d/, '');
  if (url.pathname.startsWith('/auth/v1/')) return answer({});
  // Backup dry run: the plan and the file check are answered here (made-up counts); the restore
  // itself is never sent anywhere.
  if (method === 'POST' && path === '/admin/restore/plan') {
    return answer({
      manifest: { createdAt: `${daysAgo(3)}T21:00:00Z`, finishedAt: `${daysAgo(3)}T21:02:00Z`, appVersion: '1.15.22', kind: 'drive', totalRows: 48000, authUsers: 9, prefixes: {}, skippedRows: 0, payloadSha256: '', calls: 4, sections: [{ i: 0, type: 1, rows: 48000, raw: 1000 }] },
      prefixes: {
        'leave:': { inBackup: 120, missing: 3, changed: 0, same: 117, newSinceBackup: 2 },
        'inventory:': { inBackup: 9000, missing: 0, changed: 4, same: 8996, newSinceBackup: 41 },
        'sales:': { inBackup: 700, missing: 0, changed: 0, same: 700, newSinceBackup: 3 },
      },
      sections: [{ i: 0, prefixes: ['leave:', 'inventory:'] }],
    });
  }
  if (method === 'POST' && path === '/admin/restore/apply') {
    console.info('[preview] restore NOT sent (preview)');
    return answer({ error: 'Preview: restore is never run here' }, 400);
  }
  if (method !== 'GET') {
    console.info('[preview] write answered and dropped:', method, path);
    return answer({ success: true });
  }
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) return new Promise((resolve) => setTimeout(() => resolve(answer(fn(m, url, init))), 250));
  }
  console.info('[preview] no mock for', path);
  return answer({});
};
