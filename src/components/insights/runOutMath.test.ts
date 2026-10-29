// Sample days through runOutMath.ts. Run with plain node:
//   node src/components/insights/runOutMath.test.ts
import assert from 'node:assert/strict';
import { kindKey, salesLost, spottedRunOuts, usualSales, type Day } from './runOutMath.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const order = (hour: number, category: string, q = 1, price = 100) => ({ orderHourIST: hour, items: [{ productName: category, category, quantity: q, total: q * price }] });
// A usual evening: 2 chicken plates every hour 3-10 PM (16 a day), 1 veg plate an hour (8 a day).
const normal = (date: string): Day => ({ date, orders: [15, 16, 17, 18, 19, 20, 21, 22].flatMap((h) => [order(h, 'Chicken Momos', 2), order(h, 'Veg Momos', 1, 80)]) });

test('kinds match across the stock-out list and the till', () => {
  assert.equal(kindKey('Cheese Corn momos'), kindKey('Corn Cheese Momos'));
  assert.equal(kindKey('Chicken momos'), 'chicken');
});

test('usual sales a day and an hour', () => {
  const u = usualSales([normal('2026-10-20'), normal('2026-10-21')]);
  assert.equal(u.get('chicken')!.perDay, 16);
  assert.equal(u.get('chicken')!.perHour[18], 2);
  assert.equal(u.get('chicken')!.price, 100);
});

test('chicken stops after 6 PM while orders carry on: spotted, 4 hours x 2 plates x Rs 100', () => {
  const day: Day = { date: '2026-10-28', orders: [15, 16, 17, 18, 19, 20, 21, 22].flatMap((h) => [...(h <= 18 ? [order(h, 'Chicken Momos', 2)] : []), order(h, 'Veg Momos', 1, 80), order(h, 'Veg Momos', 1, 80)]) };
  const history = [normal('2026-10-20'), normal('2026-10-21'), normal('2026-10-22')];
  const u = usualSales(history);
  const r = spottedRunOuts([day], u);
  assert.equal(r.length, 1);
  assert.deepEqual({ kind: r[0].kind, from: r[0].fromHour, plates: r[0].plates, rupees: r[0].rupees }, { kind: 'chicken', from: 19, plates: 8, rupees: 800 });
});

test('a normal day is not flagged; a quiet late hour is not a run-out', () => {
  const u = usualSales([normal('2026-10-20')]);
  assert.deepEqual(spottedRunOuts([normal('2026-10-21')], u), []);
  // Chicken's last sale at 9 PM: only the 10 PM hour (2 plates) missed - under the bar.
  const late: Day = { date: '2026-10-22', orders: normal('2026-10-22').orders.filter((o) => !(o.orderHourIST === 22 && o.items[0].category === 'Chicken Momos')) };
  assert.deepEqual(spottedRunOuts([late], u), []);
});

test('a logged stock-out counts once, and replaces the spotted one for that day', () => {
  const day: Day = { date: '2026-10-28', orders: [15, 16, 17, 18, 19, 20, 21, 22].flatMap((h) => [...(h <= 18 ? [order(h, 'Chicken Momos', 2)] : []), order(h, 'Veg Momos', 1, 80), order(h, 'Veg Momos', 1, 80)]) };
  const history = [normal('2026-10-20'), normal('2026-10-21')];
  // Logged out from 7 PM to 9 PM (back for the 9 PM hour): 19 and 20 = 4 plates.
  const s = salesLost([day], history, [{ item: 'Chicken momos', category: 'momo', startAt: '2026-10-28T13:30:00Z', endAt: '2026-10-28T15:30:00Z' }]);
  assert.equal(s.logged, 1);
  assert.equal(s.spotted, 0);
  assert.equal(s.runOuts[0].source, 'logged');
  assert.ok(s.runOuts[0].plates >= 3 && s.runOuts[0].plates <= 4);
});

console.log(`runOutMath: ${passed} tests passed`);
