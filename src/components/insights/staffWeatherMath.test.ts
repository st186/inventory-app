// Sample days through staffWeatherMath.ts. Run with plain node:
//   node src/components/insights/staffWeatherMath.test.ts
import assert from 'node:assert/strict';
import { rainEffect, staffing, upcomingWeather } from './staffWeatherMath.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const hours = (spec: Record<number, number>) => Array.from({ length: 24 }, (_, h) => spec[h] || 0);
const orders = (date: string, perHour: Record<number, number>, value = 200) => ({ date, orders: Object.entries(perHour).flatMap(([h, n]) => Array.from({ length: n }, () => ({ orderHourIST: Number(h), grandTotal: value }))) });

test('two people from 3 to 11 PM: stretched at 8 PM (14 orders), spare at 3 PM (1 order)', () => {
  const staff = [{ date: '2026-10-29', staffHours: 16, wages: 1000, byHour: hours({ 15: 2, 16: 2, 17: 2, 18: 2, 19: 2, 20: 2, 21: 2, 22: 2 }) }];
  const o = [orders('2026-10-29', { 15: 1, 16: 3, 17: 5, 18: 8, 19: 10, 20: 14, 21: 6, 22: 3 })];
  const s = staffing(staff, o);
  assert.equal(s.daysCounted, 1);
  assert.equal(s.days[0].sales, 10000); // 50 orders at Rs 200
  assert.equal(s.days[0].labourPct, 10);
  assert.equal(s.days[0].salesPerStaffHour, 625);
  assert.equal(s.hours.find((h) => h.hour === 20)!.flag, 'stretched');
  assert.equal(s.hours.find((h) => h.hour === 15)!.flag, 'spare');
  assert.equal(s.hours.find((h) => h.hour === 18)!.flag, null);
});

test('orders with nobody checked in that hour are flagged; days without check-ins are left out', () => {
  const staff = [
    { date: '2026-10-29', staffHours: 4, wages: 500, byHour: hours({ 18: 1, 19: 1, 20: 1, 21: 1 }) },
    { date: '2026-10-28', staffHours: 0, wages: 500, byHour: hours({}) },
  ];
  const s = staffing(staff, [orders('2026-10-29', { 16: 4, 19: 3 }), orders('2026-10-28', { 19: 9 })]);
  assert.equal(s.daysCounted, 1);
  assert.equal(s.hours.find((h) => h.hour === 16)!.flag, 'nobody');
});

const w = (date: string, rainMm: number) => ({ date, rainMm, rainChance: null, maxC: 30 });
const day = (date: string, counter: number, online: number) => ({ date, counter, online });

test('rain: counter down, apps up, each rainy day against dry days of its weekday', () => {
  // Three rainy Mondays and Tuesdays against their dry weeks: counter 7,000 -> 5,600 (-20%), online 3,000 -> 3,600 (+20%).
  const weather = [w('2026-09-07', 0), w('2026-09-14', 12), w('2026-09-08', 0), w('2026-09-15', 20), w('2026-09-21', 0), w('2026-09-28', 8), w('2026-09-29', 0.5)];
  const sales = [day('2026-09-07', 7000, 3000), day('2026-09-14', 5600, 3600), day('2026-09-08', 7000, 3000), day('2026-09-15', 5600, 3600), day('2026-09-21', 7000, 3000), day('2026-09-28', 5600, 3600), day('2026-09-29', 7000, 3000)];
  assert.deepEqual(rainEffect(weather, sales, '2026-10-30'), { rainyDays: 3, dryDays: 4, counter: -20, online: 20 });
});

test('too few rainy days: no claim', () => {
  assert.equal(rainEffect([w('2026-09-07', 0), w('2026-09-14', 12)], [day('2026-09-07', 7000, 3000), day('2026-09-14', 5600, 3600)], '2026-10-30'), null);
});

test('the coming week: rainy from 5 mm or a 60% chance', () => {
  const up = upcomingWeather([w('2026-10-29', 9), { ...w('2026-10-30', 1), rainChance: 70 }, { ...w('2026-10-31', 0), rainChance: 20 }], '2026-10-30');
  assert.deepEqual(up.map((x) => [x.date, x.rainy]), [['2026-10-30', true], ['2026-10-31', false]]);
});

console.log(`staffWeatherMath: ${passed} tests passed`);
