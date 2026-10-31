// Tests for liveOrders.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/liveOrders.test.ts
import assert from 'node:assert/strict';
import { ageMin, checkSummary, ciferonTime, closeCheck, itemsLine, mergePoll, nowView, parseLive, stuckToAlert, MAX_ALERTS_A_NIGHT } from './liveOrders.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const AT = { storeId: 'STORE-1', date: '2026-11-01' };
// The shape the admin panel's Live Status page reads: Result.list[].Data, a JSON string per order.
const resp = (...orders: any[]) => ({ IsSuccess: true, Result: { list: orders.map((o) => ({ Data: JSON.stringify(o) })) } });
const zomato = { OrderSerialNo: 'ZT-1802', SaleOrderType: 'HomeDelivery', PurchaseDate: '2026-11-01T19:00:00', GrandTotal: 384, Customer: { LedgerName: 'A Customer', MobileNo: '9800000000' },
  OrderItemWrapperList: [{ ProductName: 'Chicken Steamed Momos', Quantity: 2, Rate: 120, Total: 240 }, { ProductName: 'Coke', Quantity: 1, Rate: 40, Total: 40 }] };
const table = { OrderSerialNo: '41', SaleOrderType: 'DineIn', PurchaseDate: '2026-11-01T19:10:00', GrandTotal: 300, TableName: 'T2',
  OrderItemWrapperList: [{ ProductName: 'Veg Momos', Quantity: 3, Rate: 100, Total: 300 }] };
const t = (hhmm: string) => `2026-11-01T${hhmm}:00+05:30`;
const iso = (hhmm: string) => new Date(t(hhmm)).toISOString();

test('India wall-clock and other Ciferon times', () => {
  assert.equal(ciferonTime('2026-11-01T19:00:00'), '2026-11-01T13:30:00.000Z');
  assert.equal(ciferonTime('2026-11-01T19:00:00.1234567'), '2026-11-01T13:30:00.000Z');
  assert.equal(ciferonTime('2026-11-01T13:30:00Z'), '2026-11-01T13:30:00.000Z');
  assert.equal(ciferonTime('/Date(1793539800000)/'), new Date(1793539800000).toISOString());
  assert.equal(ciferonTime('31/10/2026'), null);
  assert.equal(ciferonTime(null), null);
});

test('parses the list and keeps no customer details', () => {
  const { orders, fields } = parseLive(resp(zomato, table));
  assert.equal(orders.length, 2);
  assert.equal(orders[0].key, 'sn:ZT-1802');
  assert.equal(orders[0].type, 'HomeDelivery');
  assert.equal(orders[0].total, 384);
  assert.deepEqual(orders[0].items[0], { name: 'Chicken Steamed Momos', qty: 2, total: 240 });
  assert.equal(orders[1].table, 'T2');
  assert.ok(fields.includes('Customer'));
  assert.ok(!JSON.stringify(orders).includes('9800000000'));
  assert.equal(parseLive({ IsSuccess: false }).orders.length, 0);
  assert.equal(parseLive({ Result: { list: [{ Data: 'not json' }] } }).orders.length, 0);
});

test('an order missing from the next check is gone; a number that turns up later joins it', () => {
  let day = mergePoll(null, AT, parseLive(resp({ ...table, OrderSerialNo: null, OrderId: 0 })).orders, iso('19:12'));
  const key = Object.keys(day.orders)[0];
  // The same table, now with its serial number and a bigger total.
  day = mergePoll(day, AT, parseLive(resp({ ...table, GrandTotal: 420 })).orders, iso('19:15'));
  assert.equal(Object.keys(day.orders).length, 1);
  assert.equal(day.orders[key].maxTotal, 420);
  assert.equal(day.orders[key].serial, '41');
  day = mergePoll(day, AT, [], iso('19:18'));
  assert.equal(day.orders[key].goneAt, iso('19:18'));
  assert.equal(day.polls, 3);
});

test('stuck: online after 25 min, a table after 45, each alert once, older days left out', () => {
  const old = { ...table, OrderSerialNo: '7', PurchaseDate: '2026-10-31T22:00:00' };
  let day = mergePoll(null, AT, parseLive(resp(zomato, table, old)).orders, iso('19:20'));
  assert.deepEqual(stuckToAlert(day, Date.parse(iso('19:24'))).map((o) => o.serial), []);
  assert.deepEqual(stuckToAlert(day, Date.parse(iso('19:26'))).map((o) => o.serial), ['ZT-1802']);
  day.orders['sn:ZT-1802'].alertedAt = iso('19:26');
  assert.deepEqual(stuckToAlert(day, Date.parse(iso('19:56'))).map((o) => o.serial), ['41']);
  assert.equal(ageMin(day.orders['sn:41'], Date.parse(iso('19:56'))), 46);
  // A cap a night.
  const many = Array.from({ length: 12 }, (_, i) => ({ ...zomato, OrderSerialNo: `Z${i}` }));
  day = mergePoll(null, AT, parseLive(resp(...many)).orders, iso('19:20'));
  assert.equal(stuckToAlert(day, Date.parse(iso('20:00'))).length, MAX_ALERTS_A_NIGHT);
});

test('closing check: billed, billed for less, never billed, still open', () => {
  const takeaway = { OrderSerialNo: '42', SaleOrderType: 'TakeAway', PurchaseDate: '2026-11-01T20:00:00', GrandTotal: 250, OrderItemWrapperList: [{ ProductName: 'Paneer Momos', Quantity: 2, Total: 250 }] };
  const ghost = { OrderSerialNo: '43', SaleOrderType: 'DineIn', PurchaseDate: '2026-11-01T20:30:00', GrandTotal: 180, OrderItemWrapperList: [{ ProductName: 'Veg Momos', Quantity: 2, Total: 180 }] };
  const late = { OrderSerialNo: '44', SaleOrderType: 'DineIn', PurchaseDate: '2026-11-01T23:30:00', GrandTotal: 220, OrderItemWrapperList: [{ ProductName: 'Chicken Momos', Quantity: 2, Total: 220 }] };
  let day = mergePoll(null, AT, parseLive(resp(zomato, table, takeaway)).orders, iso('20:05'));
  day = mergePoll(day, AT, parseLive(resp(ghost)).orders, iso('20:35'));
  day = mergePoll(day, AT, parseLive(resp(late)).orders, iso('23:50'));
  const finals = [
    { orderId: 55835485, serialNo: 'ZT-1802', grandTotal: 344.32, orderType: 'HomeDelivery', entryDate: '2026-11-01T19:00:00' }, // Zomato discount: fine
    { orderId: 1, serialNo: null, grandTotal: 300, orderType: 'DineIn', entryDate: '2026-11-01T19:40:00' }, // no number: same kind and amount
    { orderId: 2, serialNo: '42', grandTotal: 150, orderType: 'TakeAway', entryDate: '2026-11-01T20:04:00' }, // Rs 100 less
  ];
  const check = closeCheck(day, finals, iso('23:55'));
  assert.equal(check.seen, 5);
  assert.equal(check.matched, 3);
  assert.deepEqual(check.findings.map((f) => `${f.kind}:${f.serial}`), ['billed_less:42', 'not_billed:43', 'open_at_close:44']);
  assert.equal(check.findings[0].billed, 150);
  assert.deepEqual(checkSummary(check.findings), { notBilled: 1, notBilledTotal: 180, billedLess: 1, lessBy: 100, openAtClose: 1, openTotal: 220 });
});

test('a bill without a number far from when the order was open is not a match', () => {
  let day = mergePoll(null, AT, parseLive(resp({ ...table, OrderSerialNo: null })).orders, iso('19:12'));
  day = mergePoll(day, AT, [], iso('19:30'));
  const check = closeCheck(day, [{ orderId: 9, grandTotal: 300, orderType: 'DineIn', entryDate: '2026-11-01T23:59:00' }], iso('23:55'));
  assert.deepEqual(check.findings.map((f) => f.kind), ['not_billed']);
});

test('Home: what is open now, longest first', () => {
  const day = mergePoll(null, AT, parseLive(resp(zomato, table)).orders, iso('19:20'));
  const v = nowView(day, Date.parse(iso('19:30')));
  assert.equal(v.open, 2);
  assert.equal(v.openTotal, 684);
  assert.equal(v.stuck, 1);
  assert.deepEqual(v.orders.map((o) => o.serial), ['ZT-1802', '41']);
  assert.equal(nowView(null, Date.now()).open, 0);
  assert.equal(itemsLine(v.orders[0].items, 1), '2 Chicken Steamed Momos +1 more');
});

console.log(`liveOrders: ${passed} tests passed`);
