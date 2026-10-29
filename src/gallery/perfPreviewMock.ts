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

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

export function installPerfPreviewMock() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
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
