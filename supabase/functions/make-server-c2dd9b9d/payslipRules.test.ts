// Tests for payslipRules.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/payslipRules.test.ts
import assert from 'node:assert/strict';
import {
  DEFAULT_CHECKLIST, averageOf, buildPayslip, cleanItems, isStaff, managerOf, payoutMonth, payslipReady, personalExpensesFor, rupeesInWords,
} from './payslipRules.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

// Rohan's structure (28 Oct 2026) plus the food allowance from November.
const structure = [
  { label: 'Basic', amount: 4500 }, { label: 'HRA', amount: 1800 }, { label: 'Conveyance', amount: 900 },
  { label: 'DA', amount: 1350 }, { label: 'Special Allowance', amount: 450 }, { label: 'Food Allowance', amount: 500, fromMonth: '2026-11' },
];

test('a full month: parts once, variable pay, advance recovered; net = transfers - personal expenses', () => {
  const slip = buildPayslip({
    month: '2026-10', structure,
    payouts: [{ date: '2026-11-07', forMonth: '2026-10', amount: 10460, variablePay: 2460, advanceDeduction: 1000, paidFrom: 'paytm', transactionId: 'T 4312 8891' }],
    personalExpenses: 0, kpi: { score: 82, max: 3000 },
  });
  assert.deepEqual(slip.earnings.map((l) => [l.key, l.amount]), [['basic', 4500], ['hra', 1800], ['conveyance', 900], ['da', 1350], ['special', 450], ['vp', 2460]]);
  assert.deepEqual(slip.deductions.map((l) => [l.key, l.amount]), [['advance', 1000]]);
  assert.equal(slip.totalEarnings, 11460);
  assert.equal(slip.totalDeductions, 1000);
  assert.equal(slip.net, 10460);
  assert.equal(slip.totalEarnings - slip.totalDeductions, slip.net);
  assert.equal(slip.payments[0].ref, '8891');
  assert.deepEqual(slip.kpi, { score: 82, max: 3000 });
});

test('food allowance only from November; paid short shows as a deduction; personal expenses come off', () => {
  const nov = buildPayslip({ month: '2026-11', structure, payouts: [{ date: '2026-12-05', forMonth: '2026-11', amount: 9000 }], personalExpenses: 300 });
  assert.equal(nov.earnings.find((l) => l.key === 'food')?.amount, 500);
  assert.deepEqual(nov.deductions.map((l) => [l.key, l.amount]), [['personal', 300], ['short', 500]]);
  assert.equal(nov.net, 8700);
  assert.equal(nov.totalEarnings - nov.totalDeductions, nov.net);
});

test('paid more than the parts: an "Other payment" line; no structure: one line', () => {
  const extra = buildPayslip({ month: '2026-10', structure, payouts: [{ date: '2026-11-03', forMonth: '2026-10', amount: 9500 }], personalExpenses: 0 });
  assert.equal(extra.earnings.at(-1)?.key, 'other');
  assert.equal(extra.earnings.at(-1)?.amount, 500);
  const rider = buildPayslip({ month: '2026-10', structure: [], payouts: [{ date: '2026-10-20', amount: 400 }, { date: '2026-10-27', amount: 600 }], personalExpenses: 0 });
  assert.deepEqual(rider.earnings, [{ key: 'pay', label: 'Pay for the month', amount: 1000 }]);
  assert.equal(rider.net, 1000);
});

test('ready: after the month, salary fully paid; partly paid only after the 10th; a bonus alone is not salary', () => {
  const salary = 9000;
  const full = [{ date: '2026-11-07', forMonth: '2026-10', amount: 9000 }];
  assert.equal(payslipReady({ month: '2026-10', today: '2026-10-31', salary, payouts: full }), false);
  assert.equal(payslipReady({ month: '2026-10', today: '2026-11-07', salary, payouts: full }), true);
  const part = [{ date: '2026-11-03', forMonth: '2026-10', amount: 5000 }];
  assert.equal(payslipReady({ month: '2026-10', today: '2026-11-08', salary, payouts: part }), false);
  assert.equal(payslipReady({ month: '2026-10', today: '2026-11-11', salary, payouts: part }), true);
  const bonusOnly = [{ date: '2026-10-19', forMonth: '2026-10', amount: 1000, bonus: 1000 }];
  assert.equal(payslipReady({ month: '2026-10', today: '2026-11-15', salary, payouts: bonusOnly }), false);
  assert.equal(payslipReady({ month: '2026-10', today: '2026-11-01', salary: 0, payouts: [{ date: '2026-10-20', amount: 400 }] }), true);
  assert.equal(payoutMonth({ date: '2026-11-07' }), '2026-11');
});

test('who gets notes, and who writes them', () => {
  const owner = { employeeId: 'BM005', role: 'cluster_head', status: 'active' };
  const aniket = { employeeId: 'BM004', role: 'manager', status: 'active', managerId: 'BM005' };
  const rohan = { employeeId: 'BM008', role: 'manager', status: 'active', managerId: 'BM004' };
  const saniya = { employeeId: 'BM003', role: 'employee', status: 'active', managerId: 'BM008' };
  const all = [owner, aniket, rohan, saniya];
  assert.equal(isStaff(owner), false);
  assert.equal(isStaff({ employeeId: 'X', role: 'employee', designation: 'site_auditor' }), false);
  assert.equal(isStaff(saniya), true);
  assert.equal(managerOf(saniya, all)?.employeeId, 'BM008');
  assert.equal(managerOf(rohan, all)?.employeeId, 'BM004');
  assert.equal(managerOf(aniket, all), null); // the owner writes the only note
});

test('checklist scores: every point 1-5', () => {
  const all = DEFAULT_CHECKLIST.map((c) => ({ key: c.key, score: 4 }));
  assert.equal(cleanItems(DEFAULT_CHECKLIST, all).items?.length, 6);
  assert.match(cleanItems(DEFAULT_CHECKLIST, all.slice(1)).error || '', /Punctuality/);
  assert.match(cleanItems(DEFAULT_CHECKLIST, [...all.slice(1), { key: 'punctuality', score: 6 }]).error || '', /1 to 5/);
  assert.equal(averageOf([{ score: 4 }, { score: 5 }, { score: 3 }]), 4);
});

test('personal expenses and amount in words', () => {
  const rows = [
    { category: 'personal_expense', employeeId: 'BM003', date: '2026-10-12', amount: 200 },
    { category: 'personal_expense', employeeId: 'BM003', date: '2026-11-02', expenseMonth: '2026-10', amount: 100 },
    { category: 'personal_expense', employeeId: 'BM010', date: '2026-10-12', amount: 999 },
    { category: 'repair', employeeId: 'BM003', date: '2026-10-12', amount: 999 },
  ];
  assert.equal(personalExpensesFor(rows, 'BM003', '2026-10'), 300);
  assert.equal(rupeesInWords(10460), 'Rupees Ten Thousand Four Hundred Sixty Only');
  assert.equal(rupeesInWords(125000), 'Rupees One Lakh Twenty Five Thousand Only');
  assert.equal(rupeesInWords(9000.5), 'Rupees Nine Thousand and Fifty Paise Only');
});

console.log(`payslipRules: ${passed} tests passed`);
