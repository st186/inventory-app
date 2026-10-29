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
const HOUSE = { kind: 'production', id: 'PH-1', name: 'Production house' };
// Whose guide this is (main.tsx reads the same ?persona=).
export const PERSONA = new URLSearchParams(location.search).get('persona') || 'store-incharge';
const PEOPLE: Record<string, { id: string; name: string }> = {
  'store-incharge': { id: 'DEMO-22', name: 'Store Incharge' }, 'production-incharge': { id: 'DEMO-32', name: 'Production Incharge' },
  operations: { id: 'DEMO-10', name: 'Ops Manager' }, 'store-crew': { id: 'DEMO-41', name: 'Counter Crew' },
  'kitchen-crew': { id: 'DEMO-51', name: 'Kitchen Crew' }, rider: { id: 'DEMO-61', name: 'Rider' }, owner: { id: 'DEMO-01', name: 'Owner' },
};
const ME = PEOPLE[PERSONA] || PEOPLE['store-incharge'];
const AT_STORE = ['store-incharge', 'store-crew'].includes(PERSONA);
const AT_HOUSE = ['production-incharge', 'kitchen-crew'].includes(PERSONA);
const LEADS = ['operations', 'owner'].includes(PERSONA);
const INCHARGE = PEOPLE['store-incharge'];

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
    tick: i < 5 ? { at: at(`14:${String(40 + i * 2).padStart(2, '0')}`), byId: INCHARGE.id, byName: INCHARGE.name } : null,
  }));
  return {
    date: today, storeId: 'STORE-1', storeName: STORE.name, doerId: INCHARGE.id, doerName: INCHARGE.name, doerAs: 'assignee', dueBy: '16:00',
    assigneeName: INCHARGE.name, coverName: 'Ops Manager', items, done: items.filter((x) => x.tick).length, total: items.length, score: null,
  };
};

const alert = (id: string, place: { kind: string; id: string; name: string }, item: string, level: 'low' | 'out', qty: number, unit: string, by: { id: string; name: string }, time: string, extra: Record<string, unknown> = {}) => ({
  id, placeKind: place.kind, placeId: place.id, placeName: place.name, item, entryType: 'inventory', category: 'packaging', level, qty, unit,
  raisedBy: [{ ...by, at: at(time) }], status: 'open', createdAt: at(time), updatedAt: at(time), canClose: true, mine: by.id === ME.id, ...extra,
});
const STORE_ALERTS = [
  alert('al1', STORE, 'Momo boxes (8 pcs)', 'low', 200, 'pcs', PEOPLE['store-crew'], '13:10', { note: 'About 2 days left' }),
  alert('al2', STORE, 'Mayonnaise', 'out', 2, 'kg', INCHARGE, '11:40', { category: 'dairy', status: 'listed', listId: 'L-1', updatedAt: at('12:05') }),
];
const HOUSE_ALERTS = [
  alert('al3', HOUSE, 'Maida (flour)', 'low', 25, 'kg', PEOPLE['kitchen-crew'], '10:20', { category: 'staples', note: 'One bag left' }),
  alert('al4', HOUSE, 'Gas cylinder', 'out', 1, 'pcs', PEOPLE['production-incharge'], '09:05', { category: 'fuel', status: 'listed', listId: 'L-1' }),
];
const ALERTS = AT_HOUSE ? HOUSE_ALERTS : AT_STORE ? STORE_ALERTS : [...STORE_ALERTS, ...HOUSE_ALERTS];

// Tomorrow's shopping list: operations writes it at night, the production incharge buys it in the morning.
const line = (id: string, item: string, qty: number, unit: string, vendor: [string, string] | null, extra: Record<string, unknown> = {}) => ({
  id, item, entryType: 'inventory', category: 'fresh_produce', qty, unit, placeKind: 'production', placeId: 'PH-1', placeName: HOUSE.name,
  ...(vendor ? { vendorId: vendor[0], vendorName: vendor[1] } : {}), got: null, ...extra,
});
const CHICKEN: [string, string] = ['v1', 'Chicken vendor'], VEG: [string, string] = ['v2', 'Vegetable vendor'], GROCERY: [string, string] = ['v3', 'Grocery vendor'], BUTTER: [string, string] = ['v4', 'Butter vendor'];
const yesterday = addDays(today, -1);
const SHOPPING = {
  id: 'L-1', date: today, assigneeId: PEOPLE['production-incharge'].id, assigneeName: PEOPLE['production-incharge'].name,
  createdById: PEOPLE.operations.id, createdByName: PEOPLE.operations.name, createdAt: at('21:30', yesterday), status: 'sent', note: 'Chicken first, before 9',
  lines: [
    line('s1', 'Chicken (boneless)', 12, 'kg', CHICKEN, { category: 'meat', got: { qty: 12, at: at('07:40') } }),
    line('s2', 'Cabbage', 8, 'kg', VEG, { got: { qty: 8, at: at('08:05') } }),
    line('s3', 'Coriander leaves', 4, 'bundle', VEG),
    line('s4', 'Oil', 2, 'packet', GROCERY, { category: 'staples', packSize: 1, packUnit: 'L' }),
    line('s5', 'Butter', 4, 'packet', BUTTER, { category: 'dairy', packSize: 500, packUnit: 'g' }),
    line('s6', 'Mayonnaise', 2, 'kg', GROCERY, { category: 'dairy', placeKind: 'store', placeId: 'STORE-1', placeName: STORE.name, alertIds: ['al2'] }),
    line('s7', 'Gas cylinder', 1, 'pcs', null, { category: 'fuel', alertIds: ['al4'] }),
  ],
  sentAt: at('21:45', yesterday), notifyAt: at('07:00'), notifiedAt: at('07:00'),
  vendorOrders: Object.fromEntries(['v1', 'v2', 'v3', 'v4'].map((v, i) => [v, { at: at(`21:${50 + i}`, yesterday), byName: PEOPLE.operations.name, sig: v }])),
  progress: { total: 7, got: 2, missing: 0, left: 5, toLog: 0 }, canEdit: LEADS, canShop: PERSONA === 'production-incharge',
};
const VENDORS = [
  { id: 'v1', name: 'Chicken vendor', kind: 'meat', phone: '9800000011', items: ['Chicken (boneless)', 'Chicken (with bone)'] },
  { id: 'v2', name: 'Vegetable vendor', kind: 'vegetables', phone: '9800000012', items: ['Cabbage', 'Onion', 'Coriander leaves', 'Pudina'] },
  { id: 'v3', name: 'Grocery vendor', kind: 'grocery', phone: '9800000013', items: ['Oil', 'Mayonnaise', 'Tandoori masala', 'Maida (flour)'] },
  { id: 'v4', name: 'Butter vendor', kind: 'dairy', phone: '9800000014', items: ['Butter'] },
].map((v) => ({ ...v, createdAt: at('10:00', addDays(today, -20)), updatedAt: at('10:00', addDays(today, -2)) }));

// One check on an expense: tandoori masala logged for the store, which buys it for the production house.
const FLAGS = [
  {
    id: 'x1:place', expenseId: 'x1', expenseKey: 'inventory:u:x1', source: 'inventory', kind: 'place', date: addDays(today, -1), place: 'store:STORE-1',
    title: 'Not usually bought here', message: 'Tandoori masala is bought for Production house (4 times in 90 days), never for Bunny Momos 1. If it was bought for Production house, delete it here and log it there.',
    status: 'open', createdAt: at('12:10', addDays(today, -1)), loggedBy: 'Ops Manager', canDecide: true,
    entry: { id: 'x1', date: addDays(today, -1), itemName: 'Tandoori masala', quantity: 1, unit: 'packet', totalCost: 305, category: 'spices_seasonings', storeId: 'STORE-1' },
  },
];

// Each role's KPIs: the real list and weights from the team's KPI settings; the scores are made up.
const row = (id: string, label: string, score: number | null, weight: number, explanation: string, tip: string) => ({ id, label, score, weight, explanation, tip });
const att = (w: number) => row('attendance', 'Attendance', 92, w, '22 of 24 working days present.', 'Plan leave in the app a few days ahead.');
const ontime = (w: number, by: string) => row('punctuality', 'On time', 83, w, 'Shift started within grace on 19 of 23 days.', `Tap Start shift by ${by}.`);
const full = (w: number) => row('fullShift', 'Full shift', 87, w, 'Stayed the full shift on 20 of 23 days.', 'Tap End shift when you leave.');
const sheet = (w: number) => row('timesheet', 'Timesheet on time', 61, w, 'Timesheet sent by the next day on 14 of 23 days.', 'Send the timesheet every day you work.');
const KPI_SETS: Record<string, { role: string; workplace: string; shift: [string, string]; max: number; estimate: number; total: number; kpis: ReturnType<typeof row>[] }> = {
  'store-incharge': { role: 'Store incharge', workplace: 'store', shift: ['15:00', '22:30'], max: 3000, estimate: 2160, total: 83.2, kpis: [
    att(20), ontime(10, '3:10 PM'), full(10), sheet(10),
    row('salesOnTime', 'Sales saved on time', 74, 20, 'Sales and cash saved by 1:00 AM on 17 of 23 days.', 'Send the day close before you leave.'),
    row('expensesOnTime', 'Expenses entered on time', 88, 15, 'Most expenses entered on the day they were paid.', 'Add each expense as soon as it is paid.'),
    row('requestOnTime', 'Stock request sent on time', 91, 15, '21 of 23 stock requests sent by midnight before their day.', "Send tomorrow's request after closing, before midnight."),
    row('placeClean', 'Place kept clean (all photos)', 80, 20, '2 photos needed cleaning this month.', 'Check the back area before the photos are taken.'),
    row('cashAccuracy', 'Store cash matches', 96, 20, 'Cash matched within ₹100 on 22 of 23 days.', 'Count the drawer twice before sending.'),
    row('storeReadiness', 'Store ready on time', 70, 20, 'Opening checklist done by 4 PM on 7 of 10 days.', 'Tick each item as soon as it is ready.'),
    row('expenseAccuracy', 'Expenses entered correctly', null, 8, 'Counted from 1 Nov 2026.', 'Write the pack size and pick the right place and category.'),
  ] },
  'production-incharge': { role: 'Production incharge', workplace: 'production', shift: ['08:00', '19:00'], max: 3000, estimate: 2040, total: 79.6, kpis: [
    att(25), ontime(15, '8:10 AM'), full(10), sheet(10),
    row('photoChecks', 'Photo checks (on time and clean)', 72, 40, '296 of 380 photos sent by 11 AM; average photo score 7.1.', 'Clean first, then take each photo before 11 AM.'),
    row('wastage', 'Low wastage', 85, 10, 'Wastage 2.6% of what was made.', 'Weigh leftover dough and stuffing and use it the next day.'),
    row('productionLogged', 'Production logged', 90, 10, 'Production logged on 21 of 23 working days.', 'Log each batch as it is made.'),
    row('shippedOnTime', 'Shipped on time', 64, 10, '15 of 23 requests shipped by 3 PM.', 'Pack the morning request first and call the rider by 2:30 PM.'),
    row('placeClean', 'Place kept clean (all photos)', 76, 20, '3 photos needed cleaning this month.', 'Clear the back area every morning.'),
    row('requestAccepted', 'Requests accepted by 9 AM', 88, 20, '20 of 23 requests accepted by 9 AM.', 'Open Production › Requests when you arrive and accept.'),
  ] },
  operations: { role: 'Operations', workplace: 'production', shift: ['08:00', '19:00'], max: 3000, estimate: 2250, total: 81.0, kpis: [
    att(20), ontime(10, '8:10 AM'), full(10), sheet(10),
    row('salesOnTime', 'Sales saved on time', 82, 15, 'Day closes checked by 1 AM on 19 of 23 days.', 'Check each store\'s day close the same night.'),
    row('expensesOnTime', 'Expenses entered on time', 90, 15, 'Most expenses entered on the day they were paid.', 'Price the shopping list the same morning.'),
    row('productionApproved', 'Production approved on time', 78, 10, '18 of 23 production entries approved by a person.', 'Approve each day\'s production before it approves itself.'),
    row('requestOnTime', 'Stock request sent on time', 91, 10, '21 of 23 stock requests sent on time.', 'Make sure every store sends by midnight.'),
    row('productionCash', 'Production cash matches', 94, 20, 'Production cash matched within ₹100 on 21 of 23 days.', 'Record every production expense before the evening count.'),
    row('storeCover', 'Store cover kept', 100, 20, 'Both store-cover days kept.', 'On a cover day, reach the store by 5:10 PM.'),
    row('expenseAccuracy', 'Expenses entered correctly', null, 8, 'Counted from 1 Nov 2026.', 'Write the pack size and pick the right place and category.'),
    row('productionSupply', 'Production supply: full and on time', 60, 20, '14 of 23 requests shipped in full by 3 PM.', 'Have the shopping done by 9 AM so production can start.'),
    row('shoppingListOnTime', 'Shopping list sent by 7 AM', null, 10, 'Counted from 1 Nov 2026.', 'Send the list and each vendor\'s WhatsApp the night before.'),
  ] },
  'store-crew': { role: 'Store crew', workplace: 'store', shift: ['15:00', '22:30'], max: 1000, estimate: 780, total: 78.4, kpis: [
    att(25), ontime(15, '3:10 PM'), full(10), sheet(10),
    row('stockOuts', 'No stock-outs', 85, 20, 'Something ran out on 3 days.', 'Tell the incharge before a momo runs low.'),
    row('workplace', 'Photo checks on time', 84, 15, '38 of 45 photos sent on time.', 'Send the photos before 4 PM.'),
    row('hygiene', 'Hygiene (photo score)', 64, 5, 'Average photo score 6.4 / 10.', 'Wipe the steamer before the photo.'),
    row('posCash', 'POS cash matches (cashier)', 92, 20, 'Cash and Paytm matched the POS on 21 of 23 days.', 'Ring up every order on the POS.'),
  ] },
  'kitchen-crew': { role: 'Production crew', workplace: 'production', shift: ['08:00', '19:00'], max: 0, estimate: 0, total: 80.5, kpis: [
    att(40), ontime(25, '8:10 AM'), full(20), sheet(15),
    row('productionSupply', 'Production supply: full and on time', 60, 20, '14 of 23 requests shipped in full by 3 PM.', 'Pack the stores\' momos first, by 3 PM.'),
  ] },
};
const kpiSet = KPI_SETS[PERSONA];
const kpiGroup = (teamMock as Record<string, Record<string, (...a: unknown[]) => unknown>>).kpi;
if (kpiGroup && kpiSet) {
  kpiGroup.getMyKpis = async () => ({
    required: true, month: today.slice(0, 7), today, roleLabel: kpiSet.role, workplace: kpiSet.workplace,
    settings: { employeeId: ME.id, shiftStart: kpiSet.shift[0], shiftEnd: kpiSet.shift[1], weeklyOff: [], graceMin: 10, hasVariablePay: kpiSet.max > 0, variablePayMax: kpiSet.max, weights: Object.fromEntries(kpiSet.kpis.map((k) => [k.id, k.weight])) },
    kpis: { month: today.slice(0, 7), from: `${today.slice(0, 7)}-01`, to: addDays(today, -1), scheduledDays: 24, kpis: kpiSet.kpis, total: kpiSet.total, coverage: 0.95, notes: ['Weekly offs and approved leave are left out.'], flags: {} },
    money: kpiSet.max > 0 ? { max: kpiSet.max, estimate: kpiSet.estimate, approved: null } : null, reviewed: false, lastMonth: null,
  });
}

// The production house's photo list (the real one, 29 Oct 2026): 16 checks, 8-11 AM, some with named
// shots. Half done for the screenshots; photos are labelled placeholders.
const s = (...pairs: [string, string][]) => pairs.map(([label, labelBn]) => ({ label, labelBn }));
const HOUSE_CHECKS: [string, string, string, string, { label: string; labelBn: string }[], number][] = [
  ['deep-freezer-1', 'Deep freezer 1', 'ডিপ ফ্রিজার ১', 'Lid seal clean, no ice build-up, food covered', s(['Top', 'ওপর থেকে'], ['Inside', 'ভেতরে']), 1],
  ['deep-freezer-2', 'Deep freezer 2', 'ডিপ ফ্রিজার ২', 'Lid seal clean, no ice build-up, food covered', s(['Top', 'ওপর থেকে'], ['Inside', 'ভেতরে']), 1],
  ['dough-kneader', 'Dough kneader', 'আটা মাখার মেশিন', 'Bowl and blade clean, no dough stuck', s(['Inside the bowl', 'বাটির ভেতরে'], ['Full machine', 'পুরো মেশিন']), 1],
  ['sheet-machine', 'Momo sheet machine', 'মোমো শিট মেশিন', 'Rollers, cutter and belt clean', s(['Full machine', 'পুরো মেশিন'], ['Near the cut-out', 'কাটার জায়গার কাছে'], ['On the conveyor belt', 'কনভেয়ার বেল্টে']), 1],
  ['folding-table', 'Momo folding table', 'মোমো মোড়ানোর টেবিল', 'No dough or flour left', [], 1],
  ['drying-table', 'Momo drying / sorting table', 'মোমো শুকানো / বাছাইয়ের টেবিল', 'Clean and dry, no momos or bits left', [], 1],
  ['steamer', 'Steamer', 'স্টিমার', 'No stuck dough', [], 1],
  ['induction', 'Induction oven', 'ইন্ডাকশন ওভেন', 'Top wiped, no spills or burnt bits', [], 1],
  ['onion-slicer', 'Onion slicer', 'পেঁয়াজ কাটার মেশিন', 'Blades and tray clean, no peel left', [], 1],
  ['mixer', 'Mixer grinder', 'মিক্সার গ্রাইন্ডার', 'Jars and blades washed, base wiped', [], 1],
  ['surfaces', 'Work surfaces', 'কাজের জায়গা ও তাক', 'Dry, no food bits - photograph every surface', [], 3],
  ['walls', 'Walls', 'দেওয়াল', 'No stains or cobwebs - photograph every wall', [], 3],
  ['crates', 'Trays and crates', 'ট্রে ও ক্রেট', 'Washed, dry, stacked - every stack in a photo', [], 2],
  ['containers', 'Containers', 'কন্টেনার', 'Washed, dry, lids on', [], 1],
  ['back', 'Back of the production house', 'প্রোডাকশন হাউসের পিছন দিক', 'Swept, nothing piled up, drain clear - cover the whole area', [], 2],
  ['dustbin', 'Dustbin', 'ডাস্টবিন', 'Bin covered, not overflowing, bag changed', [], 1],
];
const shotPhoto = (id: string, minute: number, extra: Record<string, unknown> = {}) => ({ id, uploadedAt: at(`08:${String(minute).padStart(2, '0')}`), aiStatus: 'scored', aiScore: 8, aiVerdict: 'clean', aiIssues: [], aiIssuesBengali: [], aiShown: '', aiSevere: false, ...extra });
export const HOUSE_MY_CHECKS = {
  date: today, earlyMinutes: 30, employeeId: PEOPLE['production-incharge'].id,
  items: HOUSE_CHECKS.map(([id, name, nameBn, hint, shots, minPhotos], i) => {
    // The first two checks are done (all their photos in); the third has one of its two.
    const taken = i < 2 ? Math.max(shots.length, minPhotos) : i === 2 ? 1 : 0;
    const photos = Array.from({ length: taken }, (_, k) => shotPhoto(`${id}-p${k + 1}`, 10 + i * 4 + k));
    return {
      id, name, nameBn, hint, start: '08:00', end: '11:00', ...(minPhotos > 1 ? { minPhotos } : {}), ...(shots.length ? { shots } : {}), samples: [],
      locationKind: 'production', locationId: 'PH-1', locationName: HOUSE.name, status: taken >= Math.max(shots.length, minPhotos) ? 'done' : 'due',
      hasPhoto: taken > 0, photos, ...(taken ? { uploadedAt: photos[taken - 1].uploadedAt, aiStatus: 'scored', aiScore: 8, aiVerdict: 'clean' } : {}),
    };
  }),
};
const workplaceGroup = (teamMock as Record<string, Record<string, (...a: unknown[]) => unknown>>).workplace;
if (workplaceGroup && AT_HOUSE) {
  const names = new Map(HOUSE_CHECKS.map(([id, name]) => [id, name]));
  workplaceGroup.getMyChecks = async () => JSON.parse(JSON.stringify(PERSONA === 'production-incharge' ? HOUSE_MY_CHECKS : { date: today, earlyMinutes: 30, items: [] }));
  workplaceGroup.loadPhotoUrl = async (path: unknown) => {
    const id = [...names.keys()].find((k) => String(path).includes(k));
    const label = id ? names.get(id)! : 'Photo';
    return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="rgb(236,233,228)"/><text x="160" y="170" font-family="sans-serif" font-size="22" text-anchor="middle" fill="rgb(87,83,78)">${label}</text></svg>`)}`;
  };
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

// The photo checks, as the photo guide lists them (no sample photos are set yet).
const shotsOf = (...pairs: [string, string][]) => pairs.map(([label, labelBn]) => ({ label, labelBn }));
const crewAtStore = PERSONA === 'store-crew';
const STORE_PLACE = {
  kind: 'store', id: 'STORE-1', name: STORE.name, items: [
    { id: 'fryer', name: 'Fryer', nameBn: 'ফ্রায়ার', hint: 'Oil filtered, outside and stand wiped · তেল ছাঁকা, বাইরে মোছা', start: '15:00', end: '16:00', need: 1, shots: [], samples: [], mine: crewAtStore },
    { id: 'steamer', name: 'Steamer', nameBn: 'স্টিমার', hint: 'Trays and water area clean · ট্রে ও জলের জায়গা পরিষ্কার', start: '15:00', end: '16:00', need: 2, shots: shotsOf(['Top', 'ওপর থেকে'], ['Inside', 'ভেতরে']), samples: [], mine: crewAtStore },
    { id: 'crates', name: 'Momo crates', nameBn: 'মোমোর ক্রেট', hint: 'Washed, dry, stacked · ধোয়া, শুকনো, সাজানো', start: '15:00', end: '16:00', need: 1, shots: [], samples: [], mine: crewAtStore },
    { id: 'back', name: 'Garbage / back area', nameBn: 'ময়লা রাখার পিছনের জায়গা', hint: 'Bins covered, floor swept · ডাস্টবিন ঢাকা, মেঝে ঝাঁট দেওয়া', start: '15:00', end: '16:00', need: 2, shots: [], samples: [], mine: crewAtStore },
  ],
};
const HOUSE_PLACE = {
  kind: 'production', id: 'PH-1', name: HOUSE.name,
  items: HOUSE_CHECKS.map(([id, name, nameBn, hint, shots, minPhotos]) => ({ id, name, nameBn, hint, start: '08:00', end: '11:00', need: Math.max(shots.length, minPhotos), shots, samples: [], mine: PERSONA === 'production-incharge' })),
};
const GUIDE = { canSetup: LEADS, places: AT_HOUSE ? [HOUSE_PLACE, STORE_PLACE] : [STORE_PLACE, HOUSE_PLACE] };

// Answers for the guide's screens that the other previews don't cover.
export const guideRoutes: Route[] = [
  { method: 'GET', re: /\/contacts$/, reply: () => CONTACTS },
  { method: 'GET', re: /\/workplace\/guide$/, reply: () => GUIDE },
  { method: 'GET', re: /\/app-version$/, reply: () => ({ latestVersion: null, features: [] }) },
  { method: 'GET', re: /\/opening-checklist\/today$/, reply: () => ({ date: today, mine: PERSONA === 'store-incharge' ? [opening()] : [], ...(LEADS ? { overview: [opening()] } : {}) }) },
  { method: 'GET', re: /\/shift\/cover-today$/, reply: () => ({ setUp: false, date: today, cover: false, reasons: [] }) },
  { method: 'GET', re: /\/shift\/cover-team$/, reply: () => ({ covers: [] }) },
  {
    method: 'GET', re: /\/shopping-lists$/, reply: () => ({
      lists: LEADS || PERSONA === 'production-incharge' ? [SHOPPING] : [], canManage: LEADS, today,
      ...(LEADS ? { people: [{ id: PEOPLE['production-incharge'].id, name: PEOPLE['production-incharge'].name, designation: 'production_incharge' }], places: [STORE, HOUSE] } : {}),
    }),
  },
  { method: 'GET', re: /\/supply-vendors$/, reply: () => ({ vendors: VENDORS, specs: [] }) },
  { method: 'GET', re: /\/supply-alerts$/, reply: () => ({ alerts: ALERTS, canManage: LEADS, myPlace: AT_HOUSE ? HOUSE : AT_STORE ? STORE : null, ...(LEADS ? { places: [STORE, HOUSE] } : {}) }) },
  { method: 'GET', re: /\/events\/mine$/, reply: () => ({ today, events: [] }) },
  { method: 'GET', re: /\/kpi\/extra-hours$/, reply: () => ({ days: [] }) },
  { method: 'GET', re: /\/workplace\/alerts$/, reply: () => ({ alerts: [] }) },
  { method: 'GET', re: /\/production-flags$/, reply: () => ({ flags: [] }) },
  { method: 'GET', re: /\/complaints$/, reply: () => ({ complaints: [] }) },
  { method: 'GET', re: /\/expense-flags$/, reply: () => ({ flags: AT_HOUSE ? [] : FLAGS }) },
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
