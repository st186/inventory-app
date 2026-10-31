// Tests for rushInsights.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/rushInsights.test.ts
import assert from 'node:assert/strict';
import { forecastDays, ordersOfDay, parseDish, plateBuffer, rushMix, rushWindows, slotLabel, slotOf, SLOTS, steamerPlan, steamNudges, trendFactor, weekdayProfiles } from './rushInsights.ts';

// The plan's times before the owner gave the real ones (1 Nov 2026), so these numbers stay put.
const OLD = { steamMin: 12, steamMinFull: 12, fullAbove: 99, holdMin: 15, serviceLevel: 0.8 };
let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

test('slots of 15 minutes from 3 PM to 11 PM', () => {
  assert.equal(SLOTS, 32);
  assert.equal(slotLabel(0), '15:00');
  assert.equal(slotLabel(17), '19:15');
  assert.equal(slotOf(19 * 60 + 20), 17);
  assert.equal(slotOf(14 * 60), -1);
  assert.equal(slotOf(23 * 60), -1);
});

test('dishes from the real bill names (Sep-Oct 2026)', () => {
  const d = (n: string) => parseDish(n);
  assert.deepEqual(d('Steamed Chicken Momos'), { pieces: { chicken: 6 }, style: 'steamed', steamer: true, kind: 'momos' });
  assert.deepEqual(d('Chicken Steamed Momos [6 Pieces] -O')?.pieces, { chicken: 6 });
  assert.equal(d('Chicken Kurkure Momos [6 Pieces] -O')?.steamer, false);
  assert.equal(d('Chicken Pan Fried Momos')?.style, 'pan_fried');
  assert.equal(d('Chicken Pan Fried Momos')?.steamer, false); // fried, then tossed (owner, 1 Nov 2026)
  assert.equal(d('Chicken Butter Fried Momos [6 Pieces] -O')?.style, 'fried');
  assert.equal(d('Chicken Momos In Butter Makhni Sauce')?.style, 'makhni');
  assert.equal(d('Chicken Momos In Afghani Sauce')?.steamer, true);
  assert.equal(d('Corn Cheese Peri Per Fried Momos')?.style, 'peri_peri');
  assert.equal(d('Chilli Chicken Momos')?.steamer, false);
  assert.deepEqual(d('Steamed Corn Cheese Momos')?.pieces, { corn_cheese: 6 });
  assert.deepEqual(d('Chicken Cheese Steamed Momos [6 Pieces] -O')?.pieces, { chicken_cheese: 6 });
  assert.deepEqual(d('Fried Momo Meal (Chicken Cheese) -O'), { pieces: { chicken_cheese: 6 }, style: 'fried', steamer: false, kind: 'meal' });
  assert.deepEqual(d('Steamed Momo Meal (Veg) -O')?.pieces, { veg: 6 });
  assert.deepEqual(d('Steamed Momos Platter - Veg Mix (12Pc) -O')?.pieces, { veg: 4, paneer: 4, corn_cheese: 4 });
  assert.deepEqual(d('Steamed Momos Platter- Non Veg')?.pieces, { chicken: 6, chicken_cheese: 6 });
  assert.deepEqual(d('Chicken Cheese Steamed Momos Mania Combo (8Pc Momos + 2 Burgers) -O'), { pieces: { chicken_cheese: 8 }, style: 'steamed', steamer: true, kind: 'combo' });
  assert.deepEqual(d('Chicken Steamed Momos (8 pcs) - A')?.pieces, { chicken: 8 });
  assert.equal(d('Kurkure Chicken Meal')?.style, 'kurkure');
  assert.equal(d('Chicken Momo Burger'), null);
  assert.equal(d('Campa Cola 500Ml'), null);
});

// Four Saturdays: a rush 7-8:30 PM, mostly steamed chicken.
const order = (min: number, items: [string, number][], type = 'TakeAway', paymentMode = 'Cash', orderId?: number) => ({
  orderId, orderHourIST: Math.floor(min / 60), entryMin: min, orderType: type, paymentMode, rawItems: items.map(([productName, quantity]) => ({ productName, quantity })),
});
function saturday(date: string, extra = 0) {
  const orders: any[] = [];
  for (let m = 15 * 60; m < 22 * 60; m += 30) orders.push(order(m + 5, [['Chicken Fried Momos', 1]]));
  for (let m = 19 * 60; m < 20 * 60 + 30; m += 5) orders.push(order(m, [['Steamed Chicken Momos', 2], ['Steamed Veg Momos', 1]], 'HomeDelivery', 'Zomato'));
  for (let i = 0; i < extra; i++) orders.push(order(19 * 60 + 2, [['Steamed Chicken Momos', 1]]));
  return { date, orders };
}
const days = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24'].map((d, i) => ordersOfDay(saturday(d, i === 3 ? 6 : 0)));

test('a stored day as orders; exact minutes where they are known', () => {
  const day = ordersOfDay({ date: '2026-10-31', orders: [
    { orderId: 7, orderHourIST: 19, orderType: 'TakeAway', rawItems: [{ productName: 'Steamed Chicken Momos', quantity: 1 }] }, // order-times has it
    { orderHourIST: 20, orderType: 'DineIn', rawItems: [] }, // only the hour: the middle of it
    { orderHourIST: 19, entryMin: 1172, orderType: 'HomeDelivery', paymentMode: 'Swiggy', rawItems: [] }, // Step D's own minute
  ] }, { '7': 1150 });
  assert.equal(day.weekday, 6);
  assert.deepEqual(day.orders.map((o) => [o.min, o.exact, o.channel]), [[1150, true, 'counter'], [1230, false, 'counter'], [1172, true, 'swiggy']]);
});

test('rush windows: busier than 1.4 times the usual slot and 1.5 orders', () => {
  const flat = new Array(SLOTS).fill(1);
  assert.deepEqual(rushWindows(flat), []);
  const busy = flat.map((x, i) => (i >= 16 && i < 22 ? 6 : x));
  assert.deepEqual(rushWindows(busy), [{ from: '19:00', to: '20:30', ordersPerHour: 24 }]);
});

test('Saturday profile: the rush, steamer plates, channels', () => {
  const p = weekdayProfiles(days)[6];
  assert.equal(p.days, 4);
  assert.deepEqual(p.rush.map((r) => [r.from, r.to]), [['19:00', '20:30']]);
  assert.equal(p.orders[16], 3 + 1 + 6 / 4); // 7:00-7:15: 3 online orders, the 7:05 fried one, and 6 more on one of the four days
  assert.ok(Math.abs(p.steamer.chicken[17] - 6) < 1e-9); // 3 orders x 2 plates
  assert.ok(Math.abs(p.steamer.veg[17] - 3) < 1e-9);
  assert.equal(p.steamer.chicken[2], 0); // fried: not the steamer
  assert.ok(p.channels.zomato[17] > p.channels.counter[17]);
  assert.equal(weekdayProfiles(days)[1].days, 0);
});

test('an order known only to the hour is spread over its four 15 minutes', () => {
  const hourOnly = ['2026-09-06', '2026-09-13'].map((date) => ordersOfDay({ date, orders: Array.from({ length: 8 }, () => ({ orderHourIST: 19, orderType: 'DineIn', rawItems: [{ productName: 'Steamed Chicken Momos', quantity: 1 }] })) }));
  const p = weekdayProfiles(hourOnly)[0];
  assert.deepEqual(p.orders.slice(16, 20), [2, 2, 2, 2]);
  assert.equal(p.orders[15], 0);
  assert.deepEqual(p.steamer.chicken.slice(16, 20), [2, 2, 2, 2]);
});

test('what goes out in the rush', () => {
  const profiles = weekdayProfiles(days);
  const mix = rushMix(days, profiles);
  assert.ok(mix.rush.steamerPieces / mix.rush.pieces > 0.9); // the fried ones at 7:05, 7:35 and 8:05 are in it too
  assert.equal(mix.other.steamerPieces, 0);
  assert.equal(mix.top[0].name, 'Steamed Chicken Momos');
});

test('trend and forecast', () => {
  assert.equal(trendFactor(days, 6), Math.min(1.4, Math.max(0.7, ((32 + 32 + 38) / 3) / ((32 * 3 + 38) / 4))));
  const [f] = forecastDays(days, weekdayProfiles(days), ['2026-11-07']);
  assert.equal(f.weekday, 6);
  assert.deepEqual(f.rush.map((r) => r.from), ['19:00']);
});

test('the plates to keep ready', () => {
  assert.equal(plateBuffer(0, 0.8), 0);
  assert.equal(plateBuffer(1, 0.8), 2);
  assert.equal(plateBuffer(6, 0.8), 8);
  const plan = steamerPlan(weekdayProfiles(days)[6], 1, OLD);
  const chicken = plan.runs.find((r) => r.filling === 'chicken')!;
  assert.deepEqual([chicken.from, chicken.to, chicken.firstBatchAt], ['19:00', '20:30', '18:48']);
  assert.equal(chicken.keep, plateBuffer(6 + 6 / 4, 0.8)); // the 7:00 slot: 7.5 plates expected -> 10 ready
  assert.equal(plan.slots[2].keep.chicken, 0); // 3:30 PM: steam to order
  assert.deepEqual([chicken.peakFrom, chicken.peakTo], ['19:00', '20:30']); // the whole rush needs 70% or more of the most
  assert.equal(chicken.peakLow, plateBuffer(6, 0.8));
  assert.ok(chicken.usual < chicken.keep);
  // One quiet 15 minutes between busy ones stays one stretch.
  const gappy = { ...weekdayProfiles(days)[6] };
  gappy.steamer = { ...gappy.steamer, veg: gappy.steamer.veg.map((v, i) => (i === 18 ? 0 : v)) };
  const veg = steamerPlan(gappy, 1, OLD).runs.filter((r) => r.filling === 'veg');
  assert.equal(veg.length, 1);
  assert.deepEqual([veg[0].from, veg[0].to], ['19:00', '20:30']);
  assert.equal(chicken.batches, 6);
  // Momos that stay good for 30 minutes: twice the window, bigger batches, half as many.
  const longer = steamerPlan(weekdayProfiles(days)[6], 1, { ...OLD, holdMin: 30 });
  assert.equal(longer.runs.find((r) => r.filling === 'chicken')!.batches, 3);
});

test('steam now: the rush push, and getting ready only when well ahead', () => {
  const plan = steamerPlan(weekdayProfiles(days)[6], 1, OLD);
  const nudges = steamNudges(plan);
  assert.equal(nudges.length, 1); // chicken's stretch starts with the rush: one push
  assert.equal(nudges[0].at, '18:48');
  assert.equal(nudges[0].title, 'Rush at 7:00 PM: steam now');
  assert.match(nudges[0].message, /^Put 10 chicken, \d veg plates in the steamer now, ready by 7:00 PM\. A fresh batch every 15 min till 8:30 PM/);
  // A stretch that starts an hour before the rush adds a getting-ready push first.
  const early = { ...plan, runs: plan.runs.map((r) => (r.filling === 'chicken' ? { ...r, from: '18:00', usual: 2 } : r)) };
  assert.deepEqual(steamNudges(early).map((n) => n.at), ['17:48', '18:48']);
  // No real rush: nothing.
  assert.deepEqual(steamNudges({ ...plan, runs: plan.runs.map((r) => ({ ...r, keep: 1 })) }), []);
});

test("the owner's steamer: steamed and Afghani only, 10 min (15 when a can has more than 6 plates), good for 10 min", () => {
  assert.equal(parseDish('Chicken Pan Fried Momos')?.steamer, false);
  assert.equal(parseDish('Chicken Momos In Butter Makhni Sauce')?.steamer, false);
  assert.equal(parseDish('Chicken Momos In Afghani Sauce')?.steamer, true);
  assert.equal(parseDish('Steamed Chicken Momos')?.steamer, true);
  const plan = steamerPlan(weekdayProfiles(days)[6], 1);
  assert.equal(plan.settings.holdMin, 10); // no longer rounded up to 15
  const peak = plan.slots[16]; // 7:00 PM: more than 6 plates together -> 15 minutes
  const total = Object.values(peak.keep).reduce((a, b) => a + b, 0);
  assert.ok(total > 6);
  assert.deepEqual([peak.steamMin, peak.startAt], [15, '18:45']);
  const quiet = plan.slots.find((x) => { const t = Object.values(x.keep).reduce((a, b) => a + b, 0); return t > 0 && t <= 6; });
  if (quiet) assert.equal(quiet.steamMin, 10);
  const [rushPush] = steamNudges(plan).slice(-1);
  assert.equal(rushPush.at, '18:45');
  assert.match(rushPush.message, /more than 6 plates: in one can they take 15 min; split over two cans of 6 or fewer and they're ready in 10\. A fresh batch every 10 min/);
});

console.log(`rushInsights: ${passed} tests passed`);
