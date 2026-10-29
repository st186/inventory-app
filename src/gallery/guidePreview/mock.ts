// Dev-only (guide-preview.html): a stand-in session and made-up answers for every server call the
// guide's screens make, so the real app can be photographed for the how-to guides without signing
// in. Built on the other previews' made-up data (money, stock, team); calls none of them answer are
// answered here, and anything still unknown gets {} and a console line ("[guide] no answer").
// Every name, number and amount is invented.
import { projectId } from '../../utils/supabase/info';
import { installMockFetch } from '../moneyPreviewData';
import { routes as stockRoutes } from '../stockPreview/mockServer';
import '../teamPreviewMocks';
import { addDays, getTodayIST } from '../../utils/timezone';
import { istIso } from '../homeSample';

export const today = getTodayIST();

// One cast of places and people across the borrowed data.
const RENAME: [RegExp, string][] = [
  [/Bidhan Nagar|Store A\b/g, 'Bunny Momos 1'], [/City Centre|Store B\b/g, 'Bunny Momos 2'],
  [/Benachity kitchen|Kitchen A\b/g, 'Production house'],
  [/Nabendu|Store Lead Demo|Store Incharge Demo/g, 'Store Incharge'], [/Tumpa/g, 'Counter Crew'], [/Sohel/g, 'Kitchen Head'],
  [/Rina/g, 'Kitchen Crew'], [/Bablu/g, 'Kitchen Helper'], [/Subrata/g, 'Ops Manager'],
  [/ Demo\b/g, ''],
];
export const renamed = (text: string) => RENAME.reduce((s, [re, to]) => s.replace(re, to), text);
const cloneRenamed = (value: unknown) => (value && typeof value === 'object' ? JSON.parse(renamed(JSON.stringify(value))) : value);

// The Team screens' made-up answers (teamPreviewMocks.ts) come straight from functions: rename those too.
const teamMock = (globalThis as { __BUNNY_TEAM_PREVIEW__?: Record<string, Record<string, (...a: unknown[]) => unknown>> }).__BUNNY_TEAM_PREVIEW__ || {};
for (const group of Object.values(teamMock)) {
  for (const [name, fn] of Object.entries(group || {})) {
    group[name] = (...a: unknown[]) => { const r = fn(...a); return r instanceof Promise ? r.then(cloneRenamed) : cloneRenamed(r); };
  }
}

const AUTH_KEY = `sb-${projectId}-auth-token`;
if (!localStorage.getItem(AUTH_KEY)) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    access_token: 'preview-token', refresh_token: 'preview-refresh', token_type: 'bearer', expires_in: 7 * 86400, expires_at: exp,
    user: { id: 'preview-user', aud: 'authenticated', role: 'authenticated', email: 'store@example.test', app_metadata: {}, user_metadata: { role: 'manager', designation: 'store_incharge', name: 'Store Incharge', storeId: 'STORE-1' } },
  }));
}

type Route = { method: string; re: RegExp; reply: (m: RegExpMatchArray, body: any, url: URL) => unknown };
const at = (hhmm: string, date = today) => istIso(date, hhmm);

const STORE = { kind: 'store', id: 'STORE-1', name: 'Bunny Momos 1' };
const ME = { id: 'DEMO-22', name: 'Store Incharge' };

// The store's opening checklist (the real list's items), half ticked.
const OPENING_ITEMS = [
  ['oil', 'Oil refilled and clean', 'তেল ভরা ও পরিষ্কার'], ['butter', 'Butter stock checked', 'মাখনের স্টক দেখা'], ['soup', 'Soup ready', 'স্যুপ তৈরি'],
  ['sauces', 'Sauces ready and filled', 'সস তৈরি ও ভরা'], ['kot', 'KOT machine checked', 'KOT মেশিন দেখা'], ['pos', 'Laptop and POS machine set', 'ল্যাপটপ ও POS মেশিন সেট'],
  ['seating', 'Lights, fans, tables and chairs set up', 'লাইট, পাখা, টেবিল-চেয়ার সাজানো'], ['fryer', 'Fryer working', 'ফ্রায়ার চালু', 'Equipment working', 'যন্ত্রপাতি চালু'],
  ['griller', 'Griller working', 'গ্রিলার চালু', 'Equipment working', 'যন্ত্রপাতি চালু'], ['porch', 'Front porch clean, drain clear', 'সামনের জায়গা পরিষ্কার, নালা খোলা'],
  ['dustbin', 'Dustbin set up', 'ডাস্টবিন রাখা'], ['drinks', 'Water and cold drinks stocked', 'জল ও কোল্ড ড্রিংকসের স্টক'],
];
const opening = () => {
  const items = OPENING_ITEMS.map(([id, name, nameBn, group, groupBn], i) => ({
    id, name, nameBn, ...(group ? { group, groupBn } : {}),
    tick: i < 5 ? { at: at(`14:${String(40 + i * 2).padStart(2, '0')}`), byId: ME.id, byName: ME.name } : null,
  }));
  return {
    date: today, storeId: 'STORE-1', storeName: STORE.name, doerId: ME.id, doerName: ME.name, doerAs: 'assignee', dueBy: '16:00',
    assigneeName: ME.name, coverName: 'Ops Manager', items, done: items.filter((x) => x.tick).length, total: items.length, score: null,
  };
};

const ALERTS = [
  { id: 'al1', placeKind: 'store', placeId: 'STORE-1', placeName: STORE.name, item: 'Momo boxes (8 pcs)', entryType: 'inventory', category: 'packaging', level: 'low', qty: 200, unit: 'pcs', note: 'About 2 days left', raisedBy: [{ id: 'DEMO-41', name: 'Counter Crew', at: at('13:10') }], status: 'open', createdAt: at('13:10'), updatedAt: at('13:10'), canClose: true, mine: false },
  { id: 'al2', placeKind: 'store', placeId: 'STORE-1', placeName: STORE.name, item: 'Mayonnaise', entryType: 'inventory', category: 'dairy', level: 'out', qty: 2, unit: 'kg', raisedBy: [{ id: ME.id, name: ME.name, at: at('11:40') }], status: 'listed', listId: 'L-1', createdAt: at('11:40'), updatedAt: at('12:05'), canClose: true, mine: true },
];

// One check on an expense: tandoori masala logged for the store, which buys it for the production house.
const FLAGS = [
  {
    id: 'x1:place', expenseId: 'x1', expenseKey: 'inventory:u:x1', source: 'inventory', kind: 'place', date: addDays(today, -1), place: 'store:STORE-1',
    title: 'Not usually bought here', message: 'Tandoori masala is bought for Production house (4 times in 90 days), never for Bunny Momos 1. If it was bought for Production house, delete it here and log it there.',
    status: 'open', createdAt: at('12:10', addDays(today, -1)), loggedBy: 'Ops Manager', canDecide: true,
    entry: { id: 'x1', date: addDays(today, -1), itemName: 'Tandoori masala', quantity: 1, unit: 'packet', totalCost: 305, category: 'spices_seasonings', storeId: 'STORE-1' },
  },
];

// A store incharge's KPIs (the real list and weights; the scores are made up).
const row = (id: string, label: string, score: number | null, weight: number, explanation: string, tip: string) => ({ id, label, score, weight, explanation, tip });
const INCHARGE_KPIS = {
  month: today.slice(0, 7), from: `${today.slice(0, 7)}-01`, to: addDays(today, -1), scheduledDays: 24,
  kpis: [
    row('attendance', 'Attendance', 92, 20, '22 of 24 working days present.', 'Plan leave in the app a few days ahead.'),
    row('punctuality', 'On time', 83, 10, 'Shift started within grace on 19 of 23 days.', 'Tap Start shift by 3:10 PM.'),
    row('fullShift', 'Full shift', 87, 10, 'Stayed the full shift on 20 of 23 days.', 'Tap End shift when you leave, after closing.'),
    row('timesheet', 'Timesheet on time', 61, 10, 'Timesheet sent by the next day on 14 of 23 days.', 'Send the timesheet every day you work.'),
    row('salesOnTime', 'Sales saved on time', 74, 20, 'Sales and cash saved by 1:00 AM on 17 of 23 days.', 'Send the day close before you leave.'),
    row('expensesOnTime', 'Expenses entered on time', 88, 15, 'Most expenses entered on the day they were paid.', 'Add each expense as soon as it is paid.'),
    row('requestOnTime', 'Stock request sent on time', 91, 15, 'Stock request sent by 9:00 AM on 21 of 23 days.', 'Use Fill in for me, check it, and send by 9 AM.'),
    row('placeClean', 'Place kept clean (all photos)', 80, 20, '2 photos needed cleaning this month.', 'Check the back area before the photos are taken.'),
    row('cashAccuracy', 'Store cash matches', 96, 20, 'Cash matched within ₹100 on 22 of 23 days.', 'Count the drawer twice before sending.'),
    row('storeReadiness', 'Store ready on time', 70, 20, 'Opening checklist done by 4 PM on 7 of 10 days.', 'Tick each item as soon as it is ready.'),
    row('expenseAccuracy', 'Expenses entered correctly', null, 8, 'Counted from 1 Nov 2026.', 'Write the pack size and pick the right place and category.'),
  ],
  total: 83.2, coverage: 0.95, notes: ['Weekly offs and approved leave are left out.'], flags: {},
};
const kpiGroup = (teamMock as Record<string, Record<string, (...a: unknown[]) => unknown>>).kpi;
if (kpiGroup) {
  kpiGroup.getMyKpis = async () => ({
    required: true, month: today.slice(0, 7), today, roleLabel: 'Store incharge', workplace: 'store',
    settings: { employeeId: ME.id, shiftStart: '15:00', shiftEnd: '22:30', weeklyOff: [], graceMin: 10, hasVariablePay: true, variablePayMax: 3000, weights: Object.fromEntries(INCHARGE_KPIS.kpis.map((k) => [k.id, k.weight])) },
    kpis: INCHARGE_KPIS, money: { max: 3000, estimate: 2160, approved: null }, reviewed: false, lastMonth: null,
  });
}

const CONTACTS = {
  emergency: [
    { id: 'e112', name: 'Emergency (all services)', role: 'Police, fire, ambulance', phone: '112' }, { id: 'e100', name: 'Police', phone: '100' },
    { id: 'e101', name: 'Fire brigade', phone: '101' }, { id: 'e108', name: 'Ambulance', phone: '108' },
  ],
  repairs: [
    { id: 'r1', name: 'Electrician', role: 'Wiring, fans, lights', phone: '9800000001' }, { id: 'r2', name: 'Plumber', role: 'Taps, drains', phone: '9800000002' },
    { id: 'r3', name: 'Mason', role: 'Walls, floor', phone: '9800000003' },
  ],
  helplines: [
    { id: 'h1', kind: 'helpline', name: 'Ciferon POS helpline', role: 'Billing machine and POS', phone: '9800000004' },
    { id: 'h2', kind: 'helpline', name: 'Zomato partner helpline', role: 'Orders, payouts', phone: '9800000005' },
  ],
  others: [],
  suppliers: [
    { id: 's1', name: 'Packaging vendor', vendor: true, vendorKind: 'packaging', phone: '9800000006' },
    { id: 's2', name: 'Vegetable vendor', vendor: true, vendorKind: 'vegetables', phone: '9800000007' },
  ],
  canEdit: false, canManageVendors: false, canRemoveRepairs: false,
};

// The store's photo checks, as the photo guide lists them (no sample photos are set yet).
const shotsOf = (...pairs: [string, string][]) => pairs.map(([label, labelBn]) => ({ label, labelBn }));
const GUIDE = {
  canSetup: false,
  places: [{
    kind: 'store', id: 'STORE-1', name: STORE.name, items: [
      { id: 'fryer', name: 'Fryer', nameBn: 'ফ্রায়ার', hint: 'Oil filtered, outside and stand wiped · তেল ছাঁকা, বাইরে মোছা', start: '15:00', end: '16:00', need: 1, shots: [], samples: [], mine: false },
      { id: 'steamer', name: 'Steamer', nameBn: 'স্টিমার', hint: 'Trays and water area clean · ট্রে ও জলের জায়গা পরিষ্কার', start: '15:00', end: '16:00', need: 2, shots: shotsOf(['Top', 'ওপর থেকে'], ['Inside', 'ভেতরে']), samples: [], mine: false },
      { id: 'crates', name: 'Momo crates', nameBn: 'মোমোর ক্রেট', hint: 'Washed, dry, stacked · ধোয়া, শুকনো, সাজানো', start: '15:00', end: '16:00', need: 1, shots: [], samples: [], mine: false },
      { id: 'back', name: 'Garbage / back area', nameBn: 'ময়লা রাখার পিছনের জায়গা', hint: 'Bins covered, floor swept · ডাস্টবিন ঢাকা, মেঝে ঝাঁট দেওয়া', start: '15:00', end: '16:00', need: 2, shots: [], samples: [], mine: false },
    ],
  }],
};

// Answers for the guide's screens that the other previews don't cover.
export const guideRoutes: Route[] = [
  { method: 'GET', re: /\/contacts$/, reply: () => CONTACTS },
  { method: 'GET', re: /\/workplace\/guide$/, reply: () => GUIDE },
  { method: 'GET', re: /\/app-version$/, reply: () => ({ latestVersion: null, features: [] }) },
  { method: 'GET', re: /\/opening-checklist\/today$/, reply: () => ({ date: today, mine: [opening()] }) },
  { method: 'GET', re: /\/shift\/cover-today$/, reply: () => ({ setUp: false, date: today, cover: false, reasons: [] }) },
  { method: 'GET', re: /\/shift\/cover-team$/, reply: () => ({ covers: [] }) },
  { method: 'GET', re: /\/shopping-lists$/, reply: () => ({ lists: [], canManage: false, today }) },
  { method: 'GET', re: /\/supply-alerts$/, reply: () => ({ alerts: ALERTS, canManage: false, myPlace: STORE }) },
  { method: 'GET', re: /\/complaints$/, reply: () => ({ complaints: [] }) },
  { method: 'GET', re: /\/expense-flags$/, reply: () => ({ flags: FLAGS }) },
  { method: 'GET', re: /\/repair-alerts$/, reply: () => ({ alerts: [] }) },
];

const json = (body: unknown, status = 200) => new Response(renamed(JSON.stringify(body)), { status, headers: { 'Content-Type': 'application/json' } });

export function installGuideMock() {
  installMockFetch();
  const moneyFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!href.includes('/functions/v1/')) {
      if (href.includes('/auth/v1/')) return json({});
      return moneyFetch(input, init);
    }
    const url = new URL(href, location.href);
    const path = url.pathname.replace(/^.*make-server-c2dd9b9d/, '');
    const method = (init?.method || 'GET').toUpperCase();
    let body: any = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { body = null; }
    for (const route of [...guideRoutes, ...stockRoutes]) {
      const m = path.match(route.re);
      if (m && route.method === method) {
        await new Promise((r) => setTimeout(r, 120));
        return json(route.reply(m, body, url));
      }
    }
    const res = await moneyFetch(input, init);
    const text = await res.text();
    if (text === '{}' || method !== 'GET') console.info('[guide] no answer', method, path);
    return new Response(renamed(text), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };
}

export { addDays, at };
