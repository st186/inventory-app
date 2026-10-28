// Tests for the KPI / shift-clock rules. Run with plain node (22.6+ strips the types):
//   node supabase/functions/make-server-c2dd9b9d/kpiCore.test.ts
// (also runs under `deno test`-style execution, since it only uses node:assert).
import assert from 'node:assert/strict';
import {
  addDays, atWorkplace, checkApprovedAmount, clampAiAmount, cleanSettingsInput, computeMonthKpis, haversineM, istDate,
  extraMinutesOf, istMidnightMs, minutesOfDay, monthDays, nearestPin, resolveSettings, roleGroupOf, shiftWindow, suspicionFlags,
  variablePayFormula, weightedTotal, workplaceKindOf, workplacePins, type MonthInput, type PunchRecord,
} from './kpiCore.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; }
};

// IST wall-clock time on a date -> real UTC ISO string.
const at = (date: string, hhmm: string) => new Date(istMidnightMs(date) + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60000).toISOString();
const places = { stores: new Set(['STORE-1']), houses: new Set(['PH-1']) };

test('IST dates and minutes', () => {
  assert.equal(istDate(Date.parse('2026-10-26T19:00:00Z')), '2026-10-27'); // 00:30 IST next day
  assert.equal(minutesOfDay(at('2026-10-05', '15:07'), '2026-10-05'), 907);
  assert.equal(minutesOfDay(at('2026-10-06', '00:30'), '2026-10-05'), 1470); // after midnight counts on the shift's day
  assert.equal(monthDays('2026-02').length, 28);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('distance and geofence', () => {
  const d = haversineM(23.2324, 87.8615, 23.2333, 87.8615); // ~100 m north
  assert.ok(d > 95 && d < 105, `distance ${d}`);
  assert.equal(atWorkplace(140, 10), true);
  assert.equal(atWorkplace(190, 80), true); // 150 + up to 50 m of GPS error
  assert.equal(atWorkplace(210, 80), false);
  const near = nearestPin(23.2324, 87.8615, [
    { kind: 'store', id: 'STORE-1', lat: 23.30, lng: 87.90 },
    { kind: 'production', id: 'PH-1', lat: 23.2325, lng: 87.8615 },
  ]);
  assert.equal(near?.pin.id, 'PH-1');
});

test('workplace kind, role group, default shift, pins', () => {
  const crew = { employeeId: 'BM010', role: 'employee', storeId: 'STORE-1' };
  const kind = workplaceKindOf(crew, places);
  assert.equal(kind, 'store');
  assert.equal(roleGroupOf(crew, kind), 'store_staff');
  const s = resolveSettings(null, 'BM010', kind, 'store_staff');
  assert.equal(s.shiftStart, '15:00');
  assert.equal(s.shiftEnd, '22:30');
  assert.equal(s.isDefault, true);
  const maker = { employeeId: 'BM011', role: 'employee', storeId: 'PH-1' };
  assert.equal(workplaceKindOf(maker, places), 'production');
  assert.equal(roleGroupOf(maker, 'production'), 'production_staff');
  assert.equal(resolveSettings(null, 'BM011', 'production', 'production_staff').shiftStart, '08:00');
  const ops = { employeeId: 'BM002', role: 'manager', designation: 'operations_manager' };
  assert.equal(roleGroupOf(ops, workplaceKindOf(ops, places)), 'operations');
  const rider = { employeeId: 'BM020', role: 'employee', designation: 'rider' };
  assert.equal(workplaceKindOf(rider, places), 'none');
  const pins = [{ kind: 'store' as const, id: 'STORE-1', lat: 1, lng: 1 }, { kind: 'production' as const, id: 'PH-1', lat: 2, lng: 2 }];
  assert.deepEqual(workplacePins(crew, 'store', pins).map((p) => p.id), ['STORE-1']);
  assert.equal(workplacePins(ops, 'none', pins).length, 2);
  assert.equal(workplacePins(rider, 'none', pins).length, 0);
});

test('settings input checks', () => {
  assert.equal(cleanSettingsInput({ shiftStart: '25:00' }, true).ok, false);
  const r = cleanSettingsInput({ shiftStart: '15:00', weeklyOff: [2, 2], graceMin: 10, variablePayMax: 3000, hasVariablePay: true }, false);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value.weeklyOff, [2]);
    assert.equal('variablePayMax' in r.value, false); // operations managers can't change money fields
  }
});

test('shift window pads an hour each side and handles overnight shifts', () => {
  const w = shiftWindow('2026-10-05', { shiftStart: '15:00', shiftEnd: '22:30' });
  assert.equal(new Date(w.startMs).toISOString(), at('2026-10-05', '14:00'));
  assert.equal(new Date(w.endMs).toISOString(), at('2026-10-05', '23:30'));
  const n = shiftWindow('2026-10-05', { shiftStart: '20:00', shiftEnd: '02:00' });
  assert.equal(new Date(n.endMs).toISOString(), at('2026-10-06', '03:00'));
});

test('suspicion flags', () => {
  assert.deepEqual(suspicionFlags({ detectedAtMs: 0, confirmedAtMs: 4 * 3600000 }), ['late_confirm']);
  assert.deepEqual(suspicionFlags({ detectedAtMs: 0, confirmedAtMs: 3600000, clockSkewMs: -20 * 60000, simulated: true }), ['clock_skew', 'mock_location']);
  assert.deepEqual(suspicionFlags({ detectedAtMs: 0, confirmedAtMs: 60000, clockSkewMs: 30000 }), []);
});

// A store crew member in October 2026, Tuesdays off, report run on 11 Oct (counts 1-10 Oct).
function crewMonth(overrides: Partial<MonthInput> = {}): MonthInput {
  const settings = resolveSettings({ shiftStart: '15:00', shiftEnd: '22:30', weeklyOff: [2], graceMin: 10 }, 'BM010', 'store', 'store_staff');
  const punches: PunchRecord[] = [];
  // Oct 2026: the 6th is a Tuesday (off). Present 1-5 and 7-9, absent on the 10th; leave on the 8th.
  const worked = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', '2026-10-09'];
  for (const d of worked) {
    const late = d === '2026-10-03';
    punches.push({
      employeeId: 'BM010', date: d, outsideWorkplace: false,
      in: { at: at(d, late ? '15:40' : '15:05'), source: 'geofence', verified: true },
      out: d === '2026-10-04' ? null : { at: at(d, d === '2026-10-05' ? '21:00' : '22:31'), source: 'manual', verified: true },
    });
  }
  return {
    month: '2026-10', today: '2026-10-11', emp: { employeeId: 'BM010', joiningDate: '2025-01-01' },
    group: 'store_staff', kind: 'store', settings, punchSince: '2026-10-01', punches,
    timesheets: worked.map((d) => ({ date: d, totalHours: 7, status: 'approved', submittedAt: d === '2026-10-07' ? at('2026-10-10', '12:00') : at(d, '23:00') })),
    hasTimesheetHistory: true,
    leaves: [{ employeeId: 'BM010', leaveDate: '2026-10-08', status: 'approved', leaveType: 'full' }],
    workplaceChecks: [
      { date: '2026-10-01', row: { required: 3, done: 3, onTime: 3, items: { counter: { aiScore: 8 }, floor: { aiScore: 6 }, fridge: { aiScore: 10 } } } },
      { date: '2026-10-02', row: { required: 3, done: 2, onTime: 1, items: { counter: { aiScore: 4, needsCleaning: true } } } },
    ],
    ...overrides,
  };
}

test('monthly KPIs for store crew', () => {
  const r = computeMonthKpis(crewMonth());
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(r.from, '2026-10-01');
  assert.equal(r.to, '2026-10-10');
  // 10 days - 1 weekly off (6th) - 1 leave (8th) = 8 working days; present on 7 of them.
  assert.equal(r.scheduledDays, 8);
  assert.equal(k.attendance.score, 87.5);
  // On time 6 of 7 (the 3rd was 30 min late).
  assert.equal(k.punctuality.score, 85.7);
  assert.match(k.punctuality.explanation, /Late 1 day, 40 min/);
  // Full shift 5 of 7 (the 4th had no check-out, the 5th left at 9 PM).
  assert.equal(k.fullShift.score, 71.4);
  // Timesheet: 6 of 7 on time (the 7th was sent on the 10th).
  assert.equal(k.timesheet.score, 85.7);
  // Photo checks: 4 of 6 on time = 66.7, minus 5 for one needs-cleaning photo.
  assert.equal(k.workplace.score, 61.7);
  // Hygiene: (8 + 6 + 10 + 4) / 4 = 7 -> 70.
  assert.equal(k.hygiene.score, 70);
  assert.ok(r.total !== null && r.total > 70 && r.total < 85, `total ${r.total}`);
  assert.equal(r.coverage, 1);
});

test('punch KPIs wait for the shift clock to start', () => {
  const r = computeMonthKpis(crewMonth({ punchSince: null }));
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.punctuality.score, null);
  assert.equal(k.fullShift.score, null);
  assert.ok(r.coverage < 1);
});

test('check-ins away from the workplace are not on time, and flags are counted', () => {
  const input = crewMonth();
  input.punches[0].in = { at: at('2026-10-01', '15:00'), source: 'manual', verified: false, outside: true, flags: ['clock_skew'] };
  const r = computeMonthKpis(input);
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.punctuality.score, 71.4); // 5 of 7
  assert.equal(r.flags.outside, 1);
  assert.equal(r.flags.clock_skew, 1);
});

test('store incharge cash and stock-out KPIs', () => {
  const base = crewMonth();
  const settings = resolveSettings({ shiftStart: '15:00', shiftEnd: '22:30', weeklyOff: [2] }, 'BM003', 'store', 'store_incharge');
  const sales = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d, i) => ({ date: d, createdBy: 'BM003', salesDiscrepancy: i === 3 ? -350 : 40 }));
  sales.push({ date: '2026-10-05', createdBy: 'pos-sync', salesDiscrepancy: 0 }); // placeholder, not a count
  const r = computeMonthKpis({
    ...base, group: 'store_incharge', settings, sales,
    stockOuts: [
      { startAt: at('2026-10-02', '18:00'), reason: 'sold_out' },
      { startAt: at('2026-10-03', '18:00'), reason: 'short_delivery' },
      { startAt: at('2026-10-20', '18:00'), reason: 'sold_out' }, // outside the counted days
    ],
  });
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.cashCount.score, 50); // 4 of 8 working days
  assert.equal(k.cashAccuracy.score, 75); // 3 of 4 within ₹100
  assert.match(k.cashAccuracy.explanation, /₹350/);
  assert.equal(k.stockOuts.score, 85);
});

test('production KPIs', () => {
  const base = crewMonth();
  const settings = resolveSettings({ weeklyOff: [2] }, 'BM004', 'production', 'production_incharge');
  const production = ['2026-10-01', '2026-10-02'].map((d) => ({
    date: d, chickenMomos: { dough: 20, stuffing: 30, final: 900 }, vegMomos: { dough: 10, stuffing: 10, final: 300 },
    wastage: { dough: 1, stuffing: 1.4, batter: 0, coating: 0 },
  }));
  const requests = [
    { requestDate: '2026-10-01', shippedAt: at('2026-10-01', '14:30') },
    { requestDate: '2026-10-02', shippedAt: at('2026-10-02', '16:10') },
    { requestDate: '2026-10-03', shippedAt: at('2026-10-02', '19:00') }, // shipped the day before
    { requestDate: '2026-10-04' }, // not shipped yet - not counted
  ];
  const r = computeMonthKpis({ ...base, group: 'production_incharge', kind: 'production', settings, production, requests });
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.productionLogged.score, 25); // 2 of 8
  // Wastage 4.8 kg of 140 kg = 3.43% -> (10 - 3.43) / 8 = 82.1
  assert.equal(k.wastage.score, 82.1);
  assert.equal(k.shippedOnTime.score, 66.7);
});

test('per-person KPI lists and the store-duty KPIs', () => {
  const base = crewMonth();
  // A picked list replaces the role's; a KPI outside the role's list starts at 10.
  const settings = resolveSettings({ weeklyOff: [2], kpis: ['attendance', 'salesOnTime', 'expensesOnTime', 'requestOnTime', 'productionApproved', 'bogus'], weights: { attendance: 40 } }, 'BM008', 'store', 'store_incharge');
  assert.deepEqual(settings.kpis, ['attendance', 'salesOnTime', 'expensesOnTime', 'requestOnTime', 'productionApproved']);
  assert.equal(settings.weights.attendance, 40);
  assert.equal(settings.weights.requestOnTime, 10);
  assert.equal(settings.weights.stockOuts, undefined);
  assert.equal(cleanSettingsInput({ kpis: [] }, true).ok, false);
  assert.deepEqual((cleanSettingsInput({ kpis: ['hygiene', 'x', 'hygiene'] }, true) as any).value.kpis, ['hygiene']);
  const sales = [
    { date: '2026-10-01', createdBy: 'BM008', firstSavedAt: at('2026-10-01', '23:40') },
    { date: '2026-10-02', createdBy: 'BM008', firstSavedAt: at('2026-10-03', '00:50') }, // 12:50 AM: on time
    { date: '2026-10-03', createdBy: 'BM008', approvedAt: at('2026-10-04', '01:30') }, // older day, saved 1:30 AM: late
    { date: '2026-10-04', createdBy: 'pos-sync' }, // never saved by a person
    { date: '2026-10-05', createdBy: 'BM008' }, // no save time: not counted
  ];
  const ms = (d: string, hhmm: string) => Date.parse(at(d, hhmm));
  const expenses = [
    { date: '2026-10-01', id: `${ms('2026-10-01', '18:00')}-abc` }, // time taken from the id
    { date: '2026-10-02', createdAt: at('2026-10-05', '10:00') }, // days late
    { date: '2026-10-20', id: `${ms('2026-10-20', '18:00')}-xyz` }, // after the counted days
  ];
  const storeRequests = [
    { requestDate: '2026-10-02', createdAt: at('2026-10-02', '01:05') },
    { requestDate: '2026-10-03', createdAt: at('2026-10-03', '09:30') }, // after 8 AM
  ];
  const approvals = [
    { date: '2026-10-01', approvalStatus: 'approved', approvedBy: 'Ops person' },
    { date: '2026-10-02', approvalStatus: 'approved', approvedBy: 'Auto-approved (no action within 24 hours)' },
    { date: '2026-10-03', approvalStatus: 'pending' },
  ];
  const r = computeMonthKpis({ ...base, group: 'store_incharge', settings, sales, expenses, storeRequests, approvals });
  assert.deepEqual(r.kpis.map((x) => x.id), settings.kpis);
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.salesOnTime.score, 50); // 2 of 4 counted days
  assert.match(k.salesOnTime.explanation, /1 day not saved/);
  assert.equal(k.expensesOnTime.score, 50);
  assert.equal(k.requestOnTime.score, 50);
  assert.equal(k.productionApproved.score, 50);
  assert.match(k.productionApproved.explanation, /approved themselves/);
  // An operations incharge in the production department is operations, not production staff.
  assert.equal(roleGroupOf({ role: 'manager', designation: 'operations_incharge', department: 'production' }, 'mixed'), 'operations');
});

test('extra hours: confirmed time adds points (capped), the rest waits; production break', () => {
  const prod = resolveSettings(null, 'BM013', 'production', 'production_staff');
  assert.equal(prod.shiftEnd, '19:00');
  assert.equal(prod.breakMin, 60);
  assert.equal(resolveSettings(null, 'BM010', 'store', 'store_staff').breakMin, 0);
  assert.equal(cleanSettingsInput({ breakMin: 200 }, true).ok, false);
  const base = crewMonth(); // shift 15:00-22:30
  const p = (d: string, i: string, o: string): PunchRecord => ({ employeeId: 'BM010', date: d, outsideWorkplace: false, in: { at: at(d, i), source: 'manual', verified: true }, out: { at: at(d, o), source: 'manual', verified: true } });
  assert.equal(extraMinutesOf(p('2026-10-01', '13:00', '22:30'), '2026-10-01', base.settings), 120);
  assert.equal(extraMinutesOf(p('2026-10-01', '15:20', '23:40'), '2026-10-01', base.settings), 70); // late in doesn't take away from staying on
  assert.equal(extraMinutesOf({ ...p('2026-10-01', '13:00', '22:30'), out: null }, '2026-10-01', base.settings), 0); // no check-out, no extra
  const plain = computeMonthKpis(base);
  assert.equal(plain.extra, null);
  const punches = [...base.punches.filter((x) => x.date !== '2026-10-02'), p('2026-10-02', '15:00', '23:45')];
  const r = computeMonthKpis({ ...base, punches, extraHours: [
    { date: '2026-10-01', minutes: 600, status: 'confirmed' },
    { date: '2026-10-03', minutes: 420, status: 'confirmed' },
    { date: '2026-10-04', minutes: 0, status: 'declined' },
  ] });
  assert.deepEqual(r.extra, { points: 4, hours: 17, days: 2, pendingDays: 1 }); // 17 h -> 4 points; 2 Oct still to confirm
  assert.match(r.notes.join(' '), /\+4 points/);
  const withoutExtra = computeMonthKpis({ ...base, punches });
  assert.equal(r.total, Math.min(100, Math.round((withoutExtra.total! + 4) * 10) / 10));
  const many = computeMonthKpis({ ...base, extraHours: ['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => ({ date: d, minutes: 900, status: 'confirmed' as const })) });
  assert.equal(many.extra!.points, 5); // 45 h, capped at +5
});

test('rider rides', () => {
  const base = crewMonth();
  const settings = resolveSettings(null, 'BM020', 'none', 'rider');
  const trips = [
    { date: '2026-10-01', status: 'delivered' }, { date: '2026-10-01', status: 'delivered' },
    { date: '2026-10-02', status: 'cancelled' }, { date: '2026-10-03', status: 'picked_up' },
  ];
  const r = computeMonthKpis({ ...base, group: 'rider', kind: 'none', settings, trips, timesheets: [], hasTimesheetHistory: false });
  const k = Object.fromEntries(r.kpis.map((x) => [x.id, x]));
  assert.equal(k.trips.score, 66.7);
  assert.equal('timesheet' in k, false);
});

test('joining mid-month and month in progress', () => {
  const r = computeMonthKpis(crewMonth({ emp: { employeeId: 'BM010', joiningDate: '2026-10-07' } }));
  assert.equal(r.from, '2026-10-07');
  assert.ok(r.notes.some((n) => n.includes('Joined')));
  const none = computeMonthKpis(crewMonth({ today: '2026-10-01' }));
  assert.equal(none.total, null);
  assert.equal(none.from, null);
});

test('weighted total skips KPIs without data', () => {
  assert.deepEqual(weightedTotal([{ score: 80, weight: 30 }, { score: null, weight: 20 }, { score: 40, weight: 10 }]), { total: 70, coverage: 0.67 });
  assert.deepEqual(weightedTotal([{ score: null, weight: 20 }]), { total: null, coverage: 0 });
});

test('variable pay formula and AI limits', () => {
  assert.equal(variablePayFormula(45, 3000).amount, 0);
  assert.equal(variablePayFormula(50, 3000).amount, 0);
  assert.equal(variablePayFormula(75, 3000).amount, 1500);
  assert.equal(variablePayFormula(100, 3000).amount, 3000);
  assert.equal(variablePayFormula(83.3, 2500).amount, 1670);
  assert.equal(variablePayFormula(null, 3000).amount, 0);
  assert.equal(variablePayFormula(90, 0).amount, 0);
  assert.equal(clampAiAmount(1500, 2000, 3000).amount, 1725); // +15% at most
  assert.equal(clampAiAmount(1500, 100, 3000).amount, 1275); // -15% at most
  assert.equal(clampAiAmount(3000, 3400, 3000).amount, 3000); // never above the maximum
  assert.equal(clampAiAmount(0, 500, 3000).amount, 0); // nothing to move when the formula gives ₹0
  assert.equal(clampAiAmount(1500, 'abc', 3000).amount, 1500);
  assert.equal(checkApprovedAmount(3500, 3000).ok, false);
  assert.equal(checkApprovedAmount(-1, 3000).ok, false);
  assert.deepEqual(checkApprovedAmount(1499.6, 3000), { ok: true, value: 1500 });
});

console.log(`kpiCore: ${passed} tests passed`);
