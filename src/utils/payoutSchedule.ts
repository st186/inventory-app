// When Zomato and Swiggy pay for one day's orders. Both rules match every settlement uploaded
// from Jul to Oct 2026, apart from a bank holiday (Zomato's 2 Oct payout came on 3 Oct).
//
// Zomato: 3 days after the order day, Monday to Friday only. A payout that would land on a
// Saturday or Sunday moves to Monday, so Wednesday, Thursday and Friday orders are paid
// together the next Monday (Sat -> Tue, Sun -> Wed, Mon -> Thu, Tue -> Fri).
//
// Swiggy: weekly. Sunday-Saturday orders are paid the next Tuesday (the date on Swiggy's own
// report; the money shows in the bank on Wednesday). A cycle never crosses a month end: the
// month's last days, including a week whose Tuesday falls in the next month, are paid on
// their own 3 days after the month ends. A month starting on a Saturday has that lone day
// rolled into the next week (1 Aug 2026 was paid with 2-8 Aug).

import { addDays } from './timezone';

export type PayoutAggregator = 'zomato' | 'swiggy';

// A settlement report usually reaches the app the day after the payout, and a bank holiday
// pushes a payout back a day - so a day only counts as missing from the second day after.
export const UPLOAD_GRACE_DAYS = 1;

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat

function lastDayOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function payoutDateFor(aggregator: PayoutAggregator, orderDate: string): string {
  if (aggregator === 'zomato') {
    const day = addDays(orderDate, 3);
    const w = weekday(day);
    return w === 6 ? addDays(day, 2) : w === 0 ? addDays(day, 1) : day;
  }
  const saturday = addDays(orderDate, 6 - weekday(orderDate));
  const monthEnd = lastDayOfMonth(orderDate);
  if (orderDate.endsWith('-01') && weekday(orderDate) === 6) return addDays(saturday, 10);
  const tuesday = addDays(saturday, 3);
  return tuesday > monthEnd ? addDays(monthEnd, 3) : tuesday;
}

// The last day a day's settlement can arrive before it counts as missing.
export function settlementDueBy(aggregator: PayoutAggregator, orderDate: string): string {
  return addDays(payoutDateFor(aggregator, orderDate), UPLOAD_GRACE_DAYS);
}
