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
      { ...person('teal', 'Vijay Das', { folding: 95, machine: 120, cooking: 40, cleaning: 15, phone: 20, idle: 25 }, 30, 4, 82, '09:10', '16:40'), notInKitchenMinutes: 35, away: [{ date: '2026-10-30', from: '13:24', to: '14:29', minutes: 35 }] },
      person('p3', null, { folding: 210, packing: 45, idle: 15, phone: 10 }, 10, 2, 95, '10:05', '16:30'),
    ],
    kitchen: { foldingHours: 5.1, phoneMinutes: 40, idleMinutes: 40, piecesMade: 3120, piecesPerFoldingHour: 612, stills: 240, bursts: 12, folding: { from: '10:35', to: '16:20', mostPeople: 3 } },
    perDay: [{ date: '2026-10-30', foldingHours: 5.1, phoneMinutes: 40, idleMinutes: 40, piecesMade: 3120, piecesPerFoldingHour: 612, stills: 240, bursts: 12, folding: { from: '10:35', to: '16:20', mostPeople: 3 } }],
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

export function installPerfPreviewMock() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/cctv/activity')) return json(activity);
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
