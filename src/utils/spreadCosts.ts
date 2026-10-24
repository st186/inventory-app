// Equipment purchases (kitchen equipment, furniture, electrical, vehicle) and yearly
// subscriptions are counted in profit a little each month over their life, instead of all
// in the month they were paid - see SPREAD_MONTHS in inventoryData.ts. A purchase counts
// from the month it was bought (a full month's share, whatever the day), for SPREAD_MONTHS
// months; within a month the share is spread evenly over its days, so any date window -
// a week, a month, "this month so far" - gets its exact portion. Bulk stock (SPREAD_DAYS)
// instead counts an even daily share from the day it was bought.

import { spreadMonthsFor, spreadDaysFor, canonicalCategory } from './inventoryData';
import { monthAdd } from './salaryBreakdown';
import { addDays } from './timezone';

export type SpreadSourceRecord = { date: string; amount: number; category: string; id?: string; name?: string };

export type SpreadCosts = {
  total: number;
  byDate: Record<string, number>;
  byCategory: Record<string, number>; // canonical category -> amount in the window
};

const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function buildSpreadCosts(records: SpreadSourceRecord[], windowStart: string, windowEnd: string): SpreadCosts {
  const result: SpreadCosts = { total: 0, byDate: {}, byCategory: {} };
  if (!windowStart || !windowEnd || windowStart > windowEnd) return result;

  const add = (date: string, category: string, amount: number) => {
    result.byCategory[category] = (result.byCategory[category] || 0) + amount;
    result.byDate[date] = (result.byDate[date] || 0) + amount;
    result.total += amount;
  };

  // month -> canonical category -> monthly share
  const perMonth = new Map<string, Map<string, number>>();
  const firstWindowMonth = windowStart.slice(0, 7);
  const lastWindowMonth = windowEnd.slice(0, 7);
  for (const r of records) {
    if (!r.date || !r.amount) continue;
    const days = spreadDaysFor(r.category);
    if (days) {
      const daily = r.amount / days;
      const category = canonicalCategory(r.category);
      const lastDay = addDays(r.date, days - 1);
      const from = r.date > windowStart ? r.date : windowStart;
      const to = lastDay < windowEnd ? lastDay : windowEnd;
      for (let d = from; d <= to; d = nextDay(d)) add(d, category, daily);
      continue;
    }
    const months = spreadMonthsFor(r.category);
    if (!months) continue;
    const share = r.amount / months;
    const category = canonicalCategory(r.category);
    const start = r.date.slice(0, 7);
    const end = monthAdd(start, months - 1);
    for (let m = start > firstWindowMonth ? start : firstWindowMonth; m <= end && m <= lastWindowMonth; m = monthAdd(m, 1)) {
      const cats = perMonth.get(m) || new Map<string, number>();
      cats.set(category, (cats.get(category) || 0) + share);
      perMonth.set(m, cats);
    }
  }
  if (perMonth.size === 0) return result;

  for (let d = windowStart; d <= windowEnd; d = nextDay(d)) {
    const m = d.slice(0, 7);
    const cats = perMonth.get(m);
    if (!cats) continue;
    const dim = daysInMonth(m);
    for (const [category, monthly] of cats) add(d, category, monthly / dim);
  }
  return result;
}
