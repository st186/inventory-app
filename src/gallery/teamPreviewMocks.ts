// Dev-only: made-up answers for the Team screens (team-preview.html). Every name, id, phone and
// amount here is invented. Imported first by teamPreviewMain.tsx so team/teamApi.ts finds it.
import type { TeamPreviewMock } from '../components/team/teamApi';

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const day = (offset: number) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const month = (offset: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const thisMonth = month(0);
const lastMonth = month(-1);
const today = day(0);
const wait = <T,>(value: T, ms = 250) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const salary = (basic: number, hra: number) => [{ label: 'Basic', amount: basic }, { label: 'HRA', amount: hra }];
const person = (id: string, name: string, extra: Record<string, unknown>): Record<string, any> & { id: string; name: string } => ({
  id,
  employeeId: id,
  name,
  email: `${id.toLowerCase()}@example.test`,
  phone: '9800000000',
  status: 'active',
  createdAt: '2026-01-05',
  joiningDate: '2026-01-05',
  createdBy: 'owner@example.test',
  ...extra,
});

export const EMPLOYEES = [
  person('DEMO-10', 'Ops Manager Demo', { role: 'manager', employmentType: 'fulltime', type: 'fulltime', designation: null, clusterHeadId: 'DEMO-01', salaryStructure: salary(18000, 4000) }),
  person('DEMO-21', 'Store Incharge Demo', { role: 'employee', employmentType: 'fulltime', type: 'fulltime', designation: 'store_incharge', department: 'store_operations', storeId: 'STORE-1', managerId: 'DEMO-10', salaryStructure: salary(11000, 3000), dob: '1996-04-12', hasAadharImages: true }),
  person('DEMO-31', 'Kitchen Head Demo', { role: 'employee', employmentType: 'fulltime', type: 'fulltime', designation: 'production_incharge', department: 'production', storeId: 'PH-1', managerId: 'DEMO-10', salaryStructure: salary(12000, 3000) }),
  person('DEMO-41', 'Counter Crew Demo', { role: 'employee', employmentType: 'fulltime', type: 'fulltime', designation: 'store_ops', storeId: 'STORE-1', inchargeId: 'DEMO-21', salaryStructure: salary(8000, 2000), hasAadharImages: true }),
  person('DEMO-42', 'Steamer Crew Demo', { role: 'employee', employmentType: 'contract', type: 'contract', designation: 'store_ops', storeId: 'STORE-1', inchargeId: 'DEMO-21', dailyRate: 450 }),
  person('DEMO-51', 'Kitchen Crew Demo', { role: 'employee', employmentType: 'contract', type: 'contract', designation: 'production_ops', storeId: 'PH-1', inchargeId: 'DEMO-31', dailyRate: 500 }),
  person('DEMO-52', 'Dough Crew Demo', { role: 'employee', employmentType: 'fulltime', type: 'fulltime', designation: 'production_ops', storeId: 'PH-1', inchargeId: 'DEMO-31', salaryStructure: salary(9000, 2000) }),
  person('DEMO-61', 'Rider Demo', { role: 'employee', employmentType: 'contract', type: 'contract', designation: 'rider', storeId: null, dailyRate: 600 }),
  person('DEMO-43', 'Weekend Crew Demo', { role: 'employee', employmentType: 'contract', type: 'contract', designation: 'store_ops', storeId: 'STORE-2', status: 'inactive', dailyRate: 400 }),
];
const ARCHIVED = [person('DEMO-39', 'Former Crew Demo', { role: 'employee', employmentType: 'contract', type: 'contract', storeId: 'STORE-1', releasedAt: '2026-08-31', totalEarnings: 46500 })];
const STORES = [
  { id: 'STORE-1', name: 'Store A', location: 'Demo street', productionHouseId: 'PH-1' },
  { id: 'STORE-2', name: 'Store B', location: 'Demo road' },
];
const HOUSES = [{ id: 'PH-1', name: 'Kitchen A', location: 'Demo lane' }];

let n = 0;
const payout = (employeeId: string, amount: number, date: string, extra: Record<string, unknown> = {}) => ({
  id: `pay-${++n}`,
  employeeId,
  employeeName: EMPLOYEES.find((e) => e.id === employeeId)?.name || ARCHIVED.find((e) => e.id === employeeId)?.name || employeeId,
  amount,
  date,
  createdAt: date,
  ...extra,
});
const PAYOUTS = [
  payout('DEMO-42', 1350, day(-10), { paidFrom: 'cash' }),
  payout('DEMO-42', 900, day(-3), { paidFrom: 'paytm', transactionId: 'UPI-DEMO-1' }),
  payout('DEMO-51', 2500, day(-5), { paidFrom: 'paytm' }),
  payout('DEMO-61', 1800, day(-2), { paidFrom: 'cash' }),
  payout('DEMO-39', 1200, `${thisMonth}-02`, { paidFrom: 'cash' }),
  payout('DEMO-41', 7500, `${thisMonth}-05`, { forMonth: lastMonth, advanceDeduction: 2500, transactionId: 'UTR-DEMO-7', paidFrom: 'bank' }),
  payout('DEMO-41', 4000, day(-1), { forMonth: thisMonth, paidFrom: 'bank' }),
  payout('DEMO-21', 14000, `${thisMonth}-04`, { forMonth: lastMonth, paidFrom: 'bank' }),
  payout('DEMO-31', 15000, `${thisMonth}-06`, { forMonth: lastMonth, paidFrom: 'bank' }),
  payout('DEMO-52', 11000, `${thisMonth}-06`, { forMonth: thisMonth, paidFrom: 'bank' }),
  payout('DEMO-10', 22000, `${thisMonth}-05`, { forMonth: lastMonth, paidFrom: 'bank', transactionId: 'UTR-DEMO-9' }),
  payout('DEMO-41', 10000, `${lastMonth}-05`, { forMonth: month(-2), paidFrom: 'bank' }),
];
const OVERHEADS = [
  { id: 'oh-1', category: 'personal_expense', description: 'Cash advance', amount: 1000, date: day(-8), employeeId: 'DEMO-41' },
  { id: 'oh-2', category: 'rent', description: 'Rent', amount: 20000, date: `${thisMonth}-01` },
];
const ADVANCES = [
  { id: 'adv-1', employeeId: 'DEMO-41', employeeName: 'Counter Crew Demo', employeeEmployeeId: 'DEMO-41', amount: 10000, requestDate: `${lastMonth}-12T09:00:00Z`, status: 'approved', approvedBy: 'Owner Demo', approvedDate: `${lastMonth}-13T09:00:00Z`, installments: 4, monthlyDeduction: 2500, remainingAmount: 7500, startMonth: lastMonth, endMonth: month(2), createdAt: `${lastMonth}-12`, deductions: [
    { month: lastMonth, amount: 2500, deducted: true, recovered: 2500 },
    { month: thisMonth, amount: 2500, deducted: false },
    { month: month(1), amount: 2500, deducted: false },
    { month: month(2), amount: 2500, deducted: false },
  ] },
  { id: 'adv-2', employeeId: 'DEMO-52', employeeName: 'Dough Crew Demo', employeeEmployeeId: 'DEMO-52', amount: 6000, requestDate: `${day(-1)}T09:00:00Z`, status: 'pending', installments: 4, monthlyDeduction: 1500, remainingAmount: 6000, startMonth: thisMonth, endMonth: month(3), createdAt: day(-1), deductions: [] },
  { id: 'adv-3', employeeId: 'DEMO-31', employeeName: 'Kitchen Head Demo', employeeEmployeeId: 'DEMO-31', amount: 15000, requestDate: `${day(-2)}T09:00:00Z`, status: 'pending', installments: 4, monthlyDeduction: 3750, remainingAmount: 15000, startMonth: thisMonth, endMonth: month(3), createdAt: day(-2), deductions: [] },
];

const sheet = (employeeId: string, offset: number, start: string, end: string, status: string, extra: Record<string, unknown> = {}) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return { id: `ts-${employeeId}-${offset}`, employeeId, date: day(offset), startTime: start, endTime: end, totalHours: (eh * 60 + em - sh * 60 - sm) / 60, status, isLeave: false, ...extra };
};
const TIMESHEETS: Record<string, unknown[]> = {
  'DEMO-41': [sheet('DEMO-41', 0, '10:02', '', 'pending'), sheet('DEMO-41', -1, '10:00', '19:00', 'pending'), sheet('DEMO-41', -2, '10:05', '18:30', 'approved'), sheet('DEMO-41', -3, '11:00', '19:00', 'rejected', { rejectionReason: 'Left at 6 pm' })],
  'DEMO-42': [sheet('DEMO-42', 0, '09:55', '', 'pending'), sheet('DEMO-42', -1, '10:00', '18:00', 'pending'), sheet('DEMO-42', -2, '10:00', '18:00', 'pending')],
  'DEMO-21': [sheet('DEMO-21', -1, '09:30', '21:00', 'pending'), sheet('DEMO-21', -2, '09:30', '21:30', 'approved')],
  'DEMO-31': [sheet('DEMO-31', -1, '07:00', '15:00', 'approved')],
  'DEMO-51': [sheet('DEMO-51', 0, '07:10', '', 'pending')],
  'DEMO-52': [],
  'DEMO-10': [sheet('DEMO-10', -1, '10:00', '20:00', 'pending')],
};
const leave = (employeeId: string, offset: number, status: string, extra: Record<string, unknown> = {}) => ({
  id: `lv-${employeeId}-${offset}`,
  employeeId,
  leaveDate: day(offset),
  leaveType: 'full',
  reason: 'Family function',
  status,
  appliedAt: `${day(-2)}T08:00:00Z`,
  ...extra,
});
const LEAVES: Record<string, unknown[]> = {
  'DEMO-41': [leave('DEMO-41', 3, 'pending'), leave('DEMO-41', 4, 'pending'), leave('DEMO-41', -9, 'approved', { approvedBy: 'Store Incharge Demo', leaveType: 'half', reason: 'Doctor' })],
  'DEMO-42': [leave('DEMO-42', 0, 'approved', { reason: 'Fever', approvedBy: 'Store Incharge Demo' })],
  'DEMO-21': [leave('DEMO-21', 6, 'pending', { reason: 'Wedding', isAdvanceLeave: true, advanceDaysRequested: 2, approverRole: 'manager' })],
  'DEMO-52': [leave('DEMO-52', -15, 'rejected', { reason: 'Trip', rejectedBy: 'Kitchen Head Demo', rejectionReason: 'Festival week' })],
};

const kpi = (id: string, label: string, score: number | null, weight: number, explanation: string, tip: string) => ({ id, label, score, weight, explanation, tip });
const KPIS = {
  month: thisMonth,
  from: `${thisMonth}-01`,
  to: day(-1),
  scheduledDays: 22,
  kpis: [
    kpi('attendance', 'Attendance', 92, 30, '22 of 24 working days present.', 'Tell your incharge a day ahead when you will be off.'),
    kpi('punctuality', 'On time', 71, 25, 'Checked in within grace on 15 of 21 days.', 'Aim to check in by 10:00.'),
    kpi('workplace', 'Workplace photos', 84, 20, '38 of 45 photos sent on time.', 'Send the counter photo before 11 am.'),
    kpi('hygiene', 'Hygiene (AI)', 58, 15, 'Average AI score 6.4 / 10.', 'Wipe the steamer before the photo.'),
    kpi('timesheet', 'Timesheet', null, 10, 'No timesheets this month.', 'Send your timesheet every day.'),
  ],
  total: 78.4,
  coverage: 0.9,
  notes: ['Weekly offs and approved leave are left out.'],
  flags: { outside: 2 },
};
const settings = (employeeId: string, extra: Record<string, unknown> = {}) => ({ employeeId, shiftStart: '10:00', shiftEnd: '19:00', weeklyOff: [2], graceMin: 10, hasVariablePay: false, variablePayMax: 0, weights: { attendance: 30, punctuality: 25, workplace: 20, hygiene: 15, timesheet: 10 }, ...extra });

const photo = (label: string, shade: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="${shade}"/><text x="160" y="170" font-family="sans-serif" font-size="22" text-anchor="middle" fill="rgb(87,83,78)">${label}</text></svg>`)}`;
const reviewItem = (date: string, employeeId: string, personName: string, itemId: string, name: string, nameBn: string, extra: Record<string, unknown>) => ({
  date, employeeId, personName, itemId, name, nameBn, hint: '', start: '10:00', end: '11:30', status: 'done', hasPhoto: true, uploadedAt: `${date}T05:10:00Z`, aiStatus: 'scored', aiScore: 8, aiVerdict: 'clean', ...extra,
});
const shot = (id: string, at: string, extra: Record<string, unknown> = {}) => ({ id, uploadedAt: `${today}T${at}:00Z`, aiStatus: 'scored', aiScore: 8, aiVerdict: 'clean', aiIssues: [], aiIssuesBengali: [], aiShown: '', aiSevere: false, ...extra });
const MY_CHECKS: Record<string, any>[] = [
  { id: 'counter', name: 'Counter top', nameBn: 'কাউন্টার', hint: 'Whole counter, lights on', start: '00:00', end: '23:59', locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'done', hasPhoto: true, uploadedAt: `${today}T05:12:00Z`, aiStatus: 'pending', aiScore: 8, aiVerdict: 'clean',
    photos: [shot('p1', '05:10'), shot('p2', '05:12', { aiStatus: 'pending', aiScore: null, aiVerdict: null })] },
  { id: 'steamer', name: 'Steamer area', nameBn: 'স্টিমারের জায়গা', start: '00:00', end: '23:59', locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'done', hasPhoto: true, uploadedAt: `${today}T06:40:00Z`, aiStatus: 'scored', aiScore: 4, aiVerdict: 'needs_cleaning', aiIssues: ['Oil marks on the steel'], aiIssuesBengali: ['স্টিলে তেলের দাগ'], flag: { status: 'needs_cleaning', note: 'AI score 4/10', by: 'AI check', at: `${today}T06:41:00Z`, auto: true },
    photos: [shot('p3', '06:40', { aiScore: 4, aiVerdict: 'needs_cleaning', aiIssues: ['Oil marks on the steel'], aiIssuesBengali: ['স্টিলে তেলের দাগ'] }), shot('p4', '06:41', { aiVerdict: 'unclear_photo', aiScore: 3 })] },
  { id: 'crates', name: 'Crates and containers', nameBn: 'ক্রেট ও কন্টেনার', hint: 'Washed, dry, stacked, lids on', start: '00:00', end: '23:59', locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'due', hasPhoto: false },
  { id: 'floor', name: 'Floor', nameBn: 'মেঝে', start: '23:58', end: '23:59', locationKind: 'store', locationId: 'STORE-1', locationName: 'Store A', status: 'upcoming', hasPhoto: false },
];
const REVIEW = [
  reviewItem(today, 'DEMO-41', 'Counter Crew Demo', 'counter', 'Counter top', 'কাউন্টার', {}),
  reviewItem(today, 'DEMO-42', 'Steamer Crew Demo', 'steamer', 'Steamer area', 'স্টিমারের জায়গা', { photos: [shot('p3', '06:40', { aiScore: 4, aiVerdict: 'needs_cleaning', aiIssues: ['Oil marks on the steel'] }), shot('p4', '06:42')], aiScore: 4, aiVerdict: 'needs_cleaning', aiIssues: ['Oil marks on the steel'], aiIssuesBengali: ['স্টিলে তেলের দাগ'], flag: { status: 'needs_cleaning', note: 'Wipe the steel', by: 'Store Incharge Demo', at: `${today}T06:00:00Z` } }),
  reviewItem(today, 'DEMO-41', 'Counter Crew Demo', 'floor', 'Floor', 'মেঝে', { hasPhoto: false, status: 'late', aiStatus: undefined, aiScore: null, aiVerdict: null, start: '09:00', end: '10:00' }),
  reviewItem(today, 'DEMO-42', 'Steamer Crew Demo', 'sink', 'Wash basin', 'বেসিন', { aiScore: 9, uploadedAt: `${today}T06:40:00Z`, late: true, status: 'done_late' }),
];

export const TEAM_PREVIEW_MOCK: TeamPreviewMock = {
  api: {
    getAllEmployees: () => wait(EMPLOYEES),
    getEmployees: () => wait(EMPLOYEES),
    getEmployeesByManager: () => wait(EMPLOYEES.filter((e) => e.role === 'employee')),
    getEmployeesByIncharge: (id: never) => wait(EMPLOYEES.filter((e) => e.inchargeId === (id as unknown as string))),
    getManagersByClusterHead: () => wait(EMPLOYEES.filter((e) => e.role === 'manager')),
    getArchivedEmployees: () => wait(ARCHIVED),
    getEmployeeDocuments: () => wait({ aadharFront: photo('Aadhaar front (sample)', 'rgb(245,243,240)'), aadharBack: photo('Aadhaar back (sample)', 'rgb(236,233,228)') }, 600),
    getStores: () => wait(STORES),
    getProductionHouses: () => wait(HOUSES),
    getPayouts: () => wait(PAYOUTS),
    getSalaryAdvances: () => wait(ADVANCES),
    getOverheads: () => wait(OVERHEADS),
    getTimesheets: (id: never) => wait(TIMESHEETS[id as unknown as string] || []),
    getLeaves: (id: never) => wait(LEAVES[id as unknown as string] || []),
    getAllLeaves: () => wait([...Object.values(LEAVES).flat(), leave('DEMO-51', 8, 'pending', { isAdvanceLeave: true, advanceDaysRequested: 6, approverRole: 'cluster_head', reason: 'Village visit' })]),
    getTeamLeaveCalendar: () => wait({
      today, from: today, to: day(34), people: 8, myPlaceKey: 'store:STORE-1',
      places: [
        { key: 'store:STORE-1', kind: 'store', id: 'STORE-1', name: 'Store A', people: 3 },
        { key: 'production:PH-1', kind: 'production', id: 'PH-1', name: 'Kitchen A', people: 2 },
        { key: 'riders', kind: 'riders', id: null, name: '', people: 1 },
        { key: 'managers', kind: 'managers', id: null, name: '', people: 2 },
      ],
      leaves: [
        { leaveDate: day(2), employeeId: 'DEMO-42', name: 'Steamer Crew Demo', placeKey: 'store:STORE-1', leaveType: 'full', status: 'approved' },
        { leaveDate: day(3), employeeId: 'DEMO-51', name: 'Store Lead Demo', placeKey: 'store:STORE-1', leaveType: 'half', status: 'pending' },
      ],
    }),
    getLeaveBalance: () => wait({ balance: 7, pendingDays: 2 }),
    createUnifiedEmployee: () => wait({ employee: { employeeId: 'DEMO-77' } }),
    approveTimesheet: () => wait(undefined),
    rejectTimesheet: () => wait(undefined),
    approveLeave: () => wait(undefined),
    rejectLeave: () => wait(undefined),
    updateSalaryAdvance: () => wait({}),
    addPayouts: () => wait([]),
  },
  kpi: {
    getMyKpis: () => wait({ required: true, month: thisMonth, today, roleLabel: 'Store crew', workplace: 'store', settings: settings('DEMO-41'), kpis: KPIS, money: { max: 2000, estimate: 1140, approved: null }, reviewed: false, lastMonth }),
    getTeamKpis: () =>
      wait({
        month: thisMonth,
        today,
        monthComplete: false,
        config: { radiusM: 150, showMoneyToStaff: true, punchSince: '2026-10-01' },
        canEditMoney: true,
        canApprove: true,
        people: [
          { employeeId: 'DEMO-21', name: 'Store Incharge Demo', roleLabel: 'Store incharge', group: 'store', workplace: 'store', pinMissing: false, settings: settings('DEMO-21', { hasVariablePay: true, variablePayMax: 3000 }), kpis: KPIS, formula: { amount: 1700, explanation: 'total 78 → 57% of ₹3,000' }, review: { suggestedAmount: 1800, aiAskedFor: 1850, keptWithinLimits: true, allowedRange: [1450, 1950], adjustmentReason: 'Strong attendance, hygiene slipping.', oneLineSummary: 'Reliable month; the steamer area needs attention.', strengths: ['Attendance'], concerns: ['Hygiene score'], whatToImproveNextMonth: ['Clean the steamer before photos'], formulaAmount: 1700, total: 78.4, max: 3000, monthComplete: false, model: 'demo', generatedAt: `${today}T06:00:00Z` }, approval: null },
          { employeeId: 'DEMO-41', name: 'Counter Crew Demo', roleLabel: 'Store crew', group: 'store', workplace: 'store', pinMissing: true, settings: settings('DEMO-41', { isDefault: true }), kpis: { ...KPIS, total: 64 }, formula: null, review: null, approval: null },
        ],
      }),
  },
  workplace: {
    getAccess: () => wait({ canSetup: true, locations: [{ kind: 'store', id: 'STORE-1', name: 'Store A' }, { kind: 'production', id: 'PH-1', name: 'Kitchen A' }], settings: { aiEnabled: true, aiThreshold: 6 } }),
    getMyChecks: () => wait({ date: today, earlyMinutes: 30, employeeId: 'DEMO-41', items: MY_CHECKS.map((x) => ({ ...x })) }),
    // Uploads answer at once with the photo waiting for the AI, as the server does.
    uploadPhoto: (p: never) => {
      const { itemId, replacePhotoId } = p as { itemId: string; replacePhotoId?: string };
      const it = MY_CHECKS.find((x) => x.id === itemId)!;
      const shot = { id: `p${Date.now()}`, uploadedAt: new Date().toISOString(), aiStatus: 'pending', aiScore: null, aiVerdict: null, aiIssues: [], aiIssuesBengali: [], aiShown: '', aiSevere: false };
      const photos = (it.photos as any[]) || [];
      it.photos = replacePhotoId ? photos.map((x) => (x.id === replacePhotoId ? shot : x)) : [...photos, shot];
      Object.assign(it, { hasPhoto: true, status: 'done', uploadedAt: shot.uploadedAt, aiStatus: 'pending' });
      return wait({ success: true, flagged: false, item: { ...it } }, 700);
    },
    removePhoto: (p: never) => {
      const { itemId, photoId } = p as { itemId: string; photoId: string };
      const it = MY_CHECKS.find((x) => x.id === itemId)!;
      it.photos = ((it.photos as any[]) || []).filter((x) => x.id !== photoId);
      return wait({ success: true, item: { ...it } });
    },
    getReview: () => wait({ from: today, to: today, location: { kind: 'store', id: 'STORE-1', name: 'Store A' }, items: REVIEW }),
    getSummary: () => wait({ from: day(-6), to: today, people: [{ employeeId: 'DEMO-41', name: 'Counter Crew Demo', required: 21, done: 19, onTime: 17, needsCleaning: 1, avgScore: 7.8 }, { employeeId: 'DEMO-42', name: 'Steamer Crew Demo', required: 14, done: 12, onTime: 9, needsCleaning: 3, avgScore: 5.9 }] }),
    loadPhotoUrl: (path: never) => wait(photo(String(path).includes('steamer') ? 'Steamer area' : String(path).includes('sink') ? 'Wash basin' : 'Counter top', String(path).includes('steamer') ? 'rgb(236,233,228)' : 'rgb(245,243,240)'), 200),
  },
};

(globalThis as { __BUNNY_TEAM_PREVIEW__?: TeamPreviewMock }).__BUNNY_TEAM_PREVIEW__ = TEAM_PREVIEW_MOCK;
