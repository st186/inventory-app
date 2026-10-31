// Dev-only: made-up answers for the payslip and performance-note routes (server performance.ts), so
// the Home payslip card and More > Payslips / Performance reports can be looked at in the previews.
const checklist = [
  { key: 'punctuality', label: 'Punctuality & attendance', labelBn: 'সময়মতো আসা ও হাজিরা' },
  { key: 'quality', label: 'Quality of work', labelBn: 'কাজের মান' },
  { key: 'hygiene', label: 'Hygiene & uniform', labelBn: 'পরিচ্ছন্নতা ও ইউনিফর্ম' },
  { key: 'sops', label: 'Following SOPs & app entries', labelBn: 'নিয়ম মেনে কাজ ও অ্যাপে এন্ট্রি' },
  { key: 'teamwork', label: 'Teamwork & attitude', labelBn: 'দলের সঙ্গে কাজ ও ব্যবহার' },
  { key: 'ownership', label: 'Ownership & initiative', labelBn: 'দায়িত্ব নেওয়া ও উদ্যোগ' },
];
const scored = (scores: number[]) => checklist.map((c, i) => ({ ...c, score: scores[i] }));
const avg = (s: number[]) => Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10;
const report = (kind: 'manager' | 'owner', writerName: string, scores: number[], note: string) => ({
  month: '2026-10', employeeId: 'DEMO', kind, writerName, items: scored(scores), note, sentAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z', average: avg(scores), read: false,
});
const reports = [
  report('manager', 'Rohan Rajbanshi', [4, 4, 5, 3, 4, 4], 'Counter was always ready on time. Enter the day\'s sales before you leave, two days were missed.'),
  report('owner', 'Subham Tewari', [4, 5, 4, 4, 5, 4], 'Good month. Customers mention you by name. Next month: help Nabendu with the photo checks.'),
];
const payslip = {
  number: 'DEMO-2026-10', month: '2026-10',
  employee: { employeeId: 'DEMO', name: 'Counter Crew Demo', designation: 'store_ops', place: 'Bunny Momos 1', joiningDate: '2026-03-12' },
  earnings: [
    { key: 'basic', label: 'Basic', amount: 4500 }, { key: 'hra', label: 'HRA', amount: 1800 }, { key: 'conveyance', label: 'Conveyance', amount: 900 },
    { key: 'da', label: 'DA', amount: 1350 }, { key: 'special', label: 'Special Allowance', amount: 450 }, { key: 'vp', label: 'Variable pay', amount: 2460 },
  ],
  deductions: [{ key: 'advance', label: 'Salary advance recovery', amount: 1000 }],
  totalEarnings: 11460, totalDeductions: 1000, net: 10460, inWords: 'Rupees Ten Thousand Four Hundred Sixty Only',
  payments: [{ date: '2026-11-07', amount: 10460, paidFrom: 'paytm', ref: '8891' }], kpi: { score: 82, max: 3000 }, leaveDays: 2, advanceLeft: 2000, paid: true, ready: true,
};
const people = [
  { employeeId: 'BM003', name: 'Saniya Parvin', designation: 'store_ops', kind: 'manager', managerName: 'Rohan Rajbanshi', mine: null, manager: null },
  { employeeId: 'BM010', name: 'Nabendu', designation: 'store_ops', kind: 'manager', managerName: 'Rohan Rajbanshi', mine: reports[0], manager: null },
];

// Cameras (server cctv.ts): one kitchen camera, two alerts (photo: the app logo stands in).
const cameras = [
  { id: 'cam-kitchen1', name: 'Kitchen camera', placeKind: 'production', placeId: 'PH-1', place: 'Main Production House', checks: ['cap', 'gloves', 'apron'], from: '07:00', to: '21:00', everyMin: 35, active: true, afterHours: true, activity: true, keyHint: 'ab12', online: true, lastSeenAt: '2026-10-29T13:05:25Z', week: { checks: 8, alerts: 2, falseAlarms: 0, unmarked: 2 }, lastCheck: null },
  { id: 'cam-store-door', name: 'Entrance door', placeKind: 'store', placeId: 'S-1', place: 'Bunny Momos 1', checks: [], from: '09:00', to: '23:30', everyMin: 30, active: false, afterHours: false, keyHint: 'cd34', online: false, week: { checks: 0, alerts: 0, falseAlarms: 0, unmarked: 0 }, lastCheck: null },
];
const alerts = [
  { id: 'a1', cameraId: 'cam-kitchen1', cameraName: 'Kitchen camera', kind: 'ppe', at: '2026-10-29T13:05:25Z', text: '2 people without aprons', note: 'Two kitchen staff in hairnets at the momo station.', peopleCount: 2, onShift: ['Vijay Das'], seen: [], unknownFaces: 0, photoUrl: '/bunny-logo.png' },
  { id: 'a2', cameraId: 'cam-kitchen1', cameraName: 'Kitchen camera', kind: 'intruder', at: '2026-10-28T19:40:00Z', text: '1 in view after hours', note: '', peopleCount: 1, onShift: [], seen: [], unknownFaces: 1, photoUrl: null, mark: 'false' },
];

// Kitchen activity (server cctv.ts /cctv/activity and /cctv/whois).
const person = (slot: string, name: string | null, minutes: Record<string, number>, phoneMinutes: number, phoneTimes: number, ppePercent: number, first: string, last: string) => {
  const seenMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
  return { slot, name, minutes, seenMinutes, foldingMinutes: minutes.folding || 0, phoneMinutes, phoneTimes, idleMinutes: minutes.idle || 0, ppePercent, first, last };
};
const activity = {
  from: '2026-10-30', to: '2026-10-30',
  labels: { folding: 'Folding momos', machine: 'At the machine / dough', prep: 'Cutting veg (prep)', filling: 'Making filling', cooking: 'Steaming / frying', packing: 'Packing', cleaning: 'Cleaning', phone: 'On the phone', idle: 'Standing idle', other: 'Other' },
  cameras: [{
    camera: { id: 'cam-kitchen1', name: 'Kitchen camera', everyMin: 35, burst: { frames: 20, gapSec: 105 }, place: 'Main Production House' },
    people: [
      { ...person('teal', 'Vijay Das', { folding: 95, machine: 120, cooking: 40, cleaning: 15, phone: 20, idle: 25 }, 30, 4, 82, '09:10', '16:40'), notInKitchenMinutes: 35, away: [{ date: '2026-10-30', from: '13:24', to: '14:29', minutes: 35, phone: { atWorkMin: 10, outMin: 40, farthestM: 350, noneMin: 15 } }] },
      person('p3', null, { folding: 210, packing: 45, idle: 15, phone: 10 }, 10, 2, 95, '10:05', '16:30'),
    ],
    kitchen: { foldingHours: 5.1, phoneMinutes: 40, idleMinutes: 40, piecesMade: 3120, piecesPerFoldingHour: 612, stills: 240, bursts: 12, folding: { from: '10:35', to: '16:20', mostPeople: 3 } },
    perDay: [{ date: '2026-10-30', foldingHours: 5.1, phoneMinutes: 40, idleMinutes: 40, piecesMade: 3120, piecesPerFoldingHour: 612, stills: 240, bursts: 12, folding: { from: '10:35', to: '16:20', mostPeople: 3 }, empty: [{ date: '2026-10-30', from: '14:02', to: '15:44', minutes: 91 }] }],
  }],
};
// 31 Oct 2026 as it was: Rudra on two numbers, Aniket once with a later photo to confirm, one new person.
const whoNames: Record<string, string> = { p1: 'Rudra Mahato', p2: 'Rudra Mahato', p4: 'Aniket Prasad', p5: 'Someone else' };
const whoConfirms: Record<string, { photo?: string; at?: string; name?: string }> = { p4: { photo: '/bunny-logo.png', at: '11:45' } };
const whoSeen = [['p1', '08:50', '10:35'], ['p2', '08:50', '11:10'], ['p4', '09:25', '11:45'], ['p5', '10:00', '11:10'], ['p6', '11:45', '12:20']];
const isStaff = (n?: string) => !!n && n !== 'Someone else' && n !== 'Not a person';
function whois() {
  const slots = whoSeen.map(([slot, first, last]) => ({ slot, name: whoNames[slot] || null, first, last, photoUrl: '/bunny-logo.png' }));
  const tags: Record<string, number> = {};
  for (const s of slots) if (isStaff(s.name ?? undefined)) tags[s.name!] = (tags[s.name!] || 0) + 1 + (whoConfirms[s.slot]?.name === s.name ? 1 : 0);
  const open = slots.filter((s) => !s.name).map((s) => s.slot);
  const ask = slots.filter((s) => isStaff(s.name ?? undefined) && tags[s.name!] < 2 && whoConfirms[s.slot]?.photo && !whoConfirms[s.slot].name).map((s) => s.slot);
  const short = Object.keys(tags).filter((n) => tags[n] < 2);
  return {
    date: '2026-10-31', staff: ['Aniket Prasad', 'Nabendu', 'Rider 1', 'Rohan Rajbanshi', 'Rudra Mahato', 'Saniya Parvin', 'Vijay Das'],
    cameras: [{
      cameraId: 'cam-kitchen1', cameraName: 'Kitchen camera', date: '2026-10-31', tags, open, ask, short, complete: !open.length && !short.length,
      slots: slots.map((s) => ({ ...s, ...(whoConfirms[s.slot]?.photo ? { confirmUrl: whoConfirms[s.slot].photo, confirmAt: whoConfirms[s.slot].at, confirmed: whoConfirms[s.slot].name === s.name } : {}) })),
    }],
  };
}
function setWho(b: { slot: string; name: string; confirm?: string }) {
  if (b.confirm === 'yes') whoConfirms[b.slot] = { ...whoConfirms[b.slot], name: whoNames[b.slot] };
  else {
    if (b.name) whoNames[b.slot] = b.name; else delete whoNames[b.slot];
    if (b.confirm === 'no') whoConfirms[b.slot] = {};
  }
  return { names: whoNames };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

// The owner's "Right now" card (server liveOrders.ts): an evening with 3 open orders, one waiting
// long, and last night's closing check.
function liveNow() {
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const orders = [
    { key: 'sn:ZT-1907', type: 'HomeDelivery', serial: 'ZT-1907', table: null, placedAt: ago(31), ageMin: 31, total: 412, stuck: true, old: false,
      items: [{ name: 'Chicken Steamed Momos', qty: 2, total: 240 }, { name: 'Peri Peri Momos', qty: 1, total: 132 }, { name: 'Coke', qty: 1, total: 40 }] },
    { key: 'sn:58', type: 'DineIn', serial: '58', table: 'T3', placedAt: ago(18), ageMin: 18, total: 300, stuck: false, old: false,
      items: [{ name: 'Veg Momos', qty: 3, total: 300 }] },
    { key: 'sn:59', type: 'TakeAway', serial: '59', table: null, placedAt: ago(4), ageMin: 4, total: 180, stuck: false, old: false,
      items: [{ name: 'Chicken Kurkure Momos', qty: 1, total: 180 }] },
  ];
  const findings = [
    { kind: 'not_billed', key: 'sn:41', type: 'DineIn', serial: '41', table: 'T2', placedAt: '2026-10-31T14:40:00Z', firstSeen: '2026-10-31T14:42:00Z', lastSeen: '2026-10-31T15:21:00Z', total: 360,
      items: [{ name: 'Chicken Momos', qty: 2, total: 240 }, { name: 'Lemon Soda', qty: 2, total: 120 }] },
    { kind: 'billed_less', key: 'sn:47', type: 'TakeAway', serial: '47', table: null, placedAt: '2026-10-31T15:10:00Z', firstSeen: '2026-10-31T15:12:00Z', lastSeen: '2026-10-31T15:18:00Z', total: 250, billed: 150,
      items: [{ name: 'Paneer Momos', qty: 2, total: 250 }] },
  ];
  return {
    date: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), open: true,
    stores: [{ storeId: 'STORE-1', storeName: 'Bunny Momos 1', open: 3, openTotal: 892, stuck: 1, orders, lastPoll: ago(1), error: null,
      check: { date: '2026-10-31', at: '2026-10-31T18:15:00Z', seen: 56, matched: 55, findings,
        summary: { notBilled: 1, notBilledTotal: 360, billedLess: 1, lessBy: 100, openAtClose: 0, openTotal: 0 } },
      offOnline: { date: '2026-11-01', at: '2026-11-01T10:30:00Z', kept: 0, idle: 16, off: 40, sells: [
        { productId: '960994', name: 'Chicken Chilli Momos [6 Pieces]', category: 'Chilli Momos - O', lastOnline: '2026-10-31', lastCounter: '2026-10-27',
          offSince: '2026-10-31T13:32:40Z', offBy: 'Subham Tewari', platforms: ['Zomato', 'Swiggy'] },
        { productId: '2', name: 'Chicken Momo Burger', category: 'Momo Burgers -O', lastOnline: '2026-10-11', lastCounter: '2026-10-31', offSince: null, offBy: null },
      ] },
      outOfStock: { storeId: 'STORE-1', storeName: 'Bunny Momos 1', date: '2026-10-31', at: '2026-10-31T18:15:00Z', items: [
        { productId: '960994', name: 'Chicken Chilli Momos [6 Pieces]', category: 'Chilli Momos - O',
          periods: [{ from: '2026-10-31T13:32:10Z', to: null, by: 'Subham Tewari', platforms: ['Swiggy', 'Zomato'] }],
          explanation: { reason: 'ingredient', note: 'Chilli sauce finished, new batch tomorrow', by: 'Rohan', at: '2026-10-31T18:40:00Z' } },
        { productId: '960990', name: 'Chicken Cheese Momos', category: 'Steamed Momos - O',
          periods: [{ from: '2026-10-31T12:40:00Z', to: '2026-10-31T14:05:00Z', by: 'Subham Tewari', platforms: ['Swiggy', 'Zomato'] }], explanation: null },
      ] } }],
  };
}

// Team chat (chat/ChatScreen.tsx): the tables the phone reads straight from Supabase, and the
// server's group routes. Open home-preview.html#/chat or #/chat?room=g1.
const BUNNY = '00000000-0000-4000-8000-00000000b0b0';
const chatRooms = [
  { id: 'g1', key: 'store:S1', kind: 'place', name: 'Bunny Momos 1', last_body: 'Chilli sauce is finished 🌶️', last_kind: 'text', last_sender: 'Rohan Rajbanshi', last_at: '2026-11-01T10:05:00Z', unread: 2, members: 6 },
  { id: 'b1', key: 'bunny:me', kind: 'direct', name: 'Bunny', last_body: null, last_kind: null, last_sender: null, last_at: null, unread: 0, members: 1 },
  { id: 'g2', key: 'group:x', kind: 'custom', name: 'Evening shift', last_body: 'See you at 4', last_kind: 'text', last_sender: 'Saniya Parvin', last_at: '2026-10-31T09:00:00Z', unread: 0, members: 3 },
];
const chatMessages = [
  { id: 'm1', room_id: 'g1', sender_id: 'u-rohan', sender_name: 'Rohan Rajbanshi', kind: 'text', body: 'Delivery came, 400 chicken 👍', media_path: null, media_seconds: null, created_at: '2026-11-01T09:40:00Z', mentions: [] },
  { id: 'm2', room_id: 'g1', sender_id: 'u-saniya', sender_name: 'Saniya Parvin', kind: 'text', body: 'Counted and put in the freezer', media_path: null, media_seconds: null, created_at: '2026-11-01T09:52:00Z', mentions: [] },
  { id: 'm3', room_id: 'g1', sender_id: 'u-rohan', sender_name: 'Rohan Rajbanshi', kind: 'text', body: 'Chilli sauce is finished 🌶️', media_path: null, media_seconds: null, created_at: '2026-11-01T10:05:00Z', mentions: [] },
];
const chatMembers = [
  { user_id: 'u-owner', name: 'Subham Tewari' }, { user_id: 'u-rohan', name: 'Rohan Rajbanshi' }, { user_id: 'u-saniya', name: 'Saniya Parvin' },
  { user_id: 'u-aniket', name: 'Aniket Prasad' }, { user_id: BUNNY, name: 'Bunny' },
];
function chatMock(url: string, init?: RequestInit): Response | null {
  const method = (init?.method || 'GET').toUpperCase();
  if (url.includes('/rest/v1/rpc/chat_my_rooms')) return json(chatRooms);
  if (url.includes('/rest/v1/rpc/chat_unread_total')) return json(2);
  if (url.includes('/rest/v1/rpc/chat_mark_read')) return json(null);
  if (url.includes('/rest/v1/chat_members')) return json(chatMembers);
  if (url.includes('/rest/v1/chat_messages')) {
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body || '{}'));
      return json({ id: `m${Date.now()}`, sender_id: 'u-owner', sender_name: 'Subham Tewari', media_path: null, media_seconds: null, mentions: [], created_at: new Date().toISOString(), ...body });
    }
    const room = /room_id=eq\.([^&]+)/.exec(url)?.[1];
    return json(chatMessages.filter((m) => m.room_id === room).reverse());
  }
  if (url.includes('/chat/sync')) return json({ success: true, skipped: true });
  if (url.includes('/chat/people')) return json({ people: chatMembers.filter((m) => m.user_id !== BUNNY).map((m) => ({ userId: m.user_id, name: m.name, role: 'Team' })) });
  if (/\/chat\/groups\/[^/]+$/.test(url) && method === 'GET') {
    return json({
      id: 'g1', name: 'Bunny Momos 1', automatic: true, handPicked: false, madeBy: null, canRename: true, canChangePeople: true, canDelete: true, canLeave: false,
      members: chatMembers.filter((m) => m.user_id !== BUNNY).map((m, i) => ({ userId: m.user_id, name: m.name, role: i === 0 ? 'Owner' : 'Store', madeIt: false, me: i === 0 })),
    });
  }
  if (url.includes('/chat/groups')) return json({ success: true, roomId: 'g2', name: 'Evening shift' });
  return null;
}

export function installPerfPreviewMock() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const chatReply = chatMock(url, init);
    if (chatReply) return chatReply;
    if (url.includes('/cctv/activity')) return json(activity);
    if (url.includes('/live-orders/now')) return json(liveNow());
    if (url.includes('/stock-out-day/explain')) return json({ success: true });
    if (url.includes('/stock-out-day/mine')) return json({ reasons: [], reports: [liveNow().stores[0].outOfStock] });
    if (url.includes('/cctv/whois') && init?.method === 'POST') return json(setWho(JSON.parse(String(init.body || '{}'))));
    if (url.includes('/cctv/whois')) return json(whois());
    if (url.includes('/cctv/cameras') && !init?.method) return json({ cameras, canManage: true });
    if (url.includes('/cctv/alerts') && /\/mark$/.test(url)) return json({ alert: {} });
    if (url.includes('/cctv/alerts')) return json({ alerts });
    if (url.includes('/payslip/inbox')) return json({ items: [{ month: '2026-10', payslipReady: true, downloaded: false, reports }] });
    if (/\/payslip\/[\d-]+\/seen/.test(url)) return json({ state: {} });
    if (url.includes('/payslip/months')) return json({ months: [{ month: '2026-10', paid: 10460, ready: true }, { month: '2026-09', paid: 9000, ready: true }] });
    if (url.includes('/payslip?')) return json({ payslip });
    if (url.includes('/performance/checklist')) return json({ items: checklist });
    if (url.includes('/performance/write')) return json({ month: '2026-10', items: checklist, people });
    if (url.includes('/performance/mine')) return json({ months: [{ month: '2026-10', reports }] });
    if (/\/performance\/\d{4}-\d{2}\//.test(url) && init?.method === 'PUT') return json({ report: reports[0] });
    return real(input, init);
  };
}
