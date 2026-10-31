// Copy of src/utils/onlineCosts.ts for the edge function (it can't import from src/), so Ask
// Bunny's Zomato/Swiggy commission matches the Analytics cards. Only the two imports differ: keep
// the rest in step with the app's copy.

// Zomato/Swiggy costs (commission and ads) for any date window. Every profit figure in
// Analytics - the cards, the daily chart, last month's carry-forward, Unit Economics - goes
// through onlineCostsForRange so they all agree. Three sources, in this order per day and
// platform:
//   1. Settlement files - exact. Each settlement's commission, ads and GST are spread over
//      its orders' dates (by order value), so a weekly file that straddles a month end
//      lands in the right month instead of being counted whole in both.
//   2. Old manual payout entries (from before settlement uploads) - commission = that day's
//      sales minus the payout, only on days no settlement covers.
//   3. Days with online sales but no settlement yet (usually the last few days) - estimated
//      at the last 60 days' rate, so profit doesn't look better just because the platform
//      hasn't paid out yet.
//
// Commission here excludes GST. The platform collects 5% GST from the customer and pays it
// to the government on our behalf; our revenue (POS online sales) already leaves that GST
// out, so counting it as commission overstated costs by about 5% of online sales.

import { getSettlementPeriod, type SettlementPeriodSource } from './settlementPeriod.ts';
import { addDaysISO as addDays } from './forecast.ts';

export type Aggregator = 'zomato' | 'swiggy';
const AGGREGATORS: Aggregator[] = ['zomato', 'swiggy'];

export type OnlineCostSettlement = SettlementPeriodSource & {
  aggregator: string;
  storeId?: string;
  grossSales: number;
  netCommission: number;
  adSpend?: number;
  gstCollected?: number;
  totalDiscount?: number;
  orders?: { orderDate?: string; grossValue?: number }[];
};

type DayAmounts = { commission: number; ads: number; gst: number; discount: number; sales: number };

export type OnlineCostIndex = {
  settled: Record<Aggregator, Map<string, DayAmounts>>;
  covered: Record<Aggregator, Set<string>>; // every date some settlement covers
};

export type OnlineCosts = {
  commission: number; // settled + legacy + estimated, ex-GST
  ads: number; // settled + estimated
  settledCommission: number;
  legacyCommission: number;
  estimatedCommission: number;
  estimatedAds: number;
  estimatedDays: number; // dates with at least one estimated platform
  gstExcluded: number; // GST the platforms collected and paid on our behalf - not our cost
  discounts: number; // restaurant-funded discounts on settled orders (already out of revenue)
  commissionBase: number; // online sales the commission figure covers, for "% of online"
  rates: Record<Aggregator, { commission: number; ads: number }>;
  byDate: Record<string, { commission: number; ads: number }>;
  byAggregator: Record<Aggregator, { commission: number; ads: number; sales: number }>;
};

const emptyDay = (): DayAmounts => ({ commission: 0, ads: 0, gst: 0, discount: 0, sales: 0 });
const asAggregator = (value: string): Aggregator | null =>
  value === 'zomato' || value === 'swiggy' ? value : null;

// How a settlement's amounts are split over dates. Weight each date by its orders' value, and
// treat those dates as the ones the file covers - the stored period isn't reliable (July's
// daily Zomato files all say 1-31 Jul). Files without dated orders cover their period, split
// evenly.
function settlementDayWeights(s: OnlineCostSettlement): { weights: Map<string, number>; totalWeight: number } {
  const weights = new Map<string, number>();
  for (const o of s.orders || []) {
    if (o.orderDate) weights.set(o.orderDate, (weights.get(o.orderDate) || 0) + Math.max(0, o.grossValue || 0));
  }
  let totalWeight = [...weights.values()].reduce((t, w) => t + w, 0);
  if (totalWeight <= 0) {
    const period = getSettlementPeriod(s);
    weights.clear();
    for (let d = period.start; d <= period.end; d = addDays(d, 1)) weights.set(d, 1);
    totalWeight = weights.size;
  }
  return { weights, totalWeight };
}

// The part (0-1) of a settlement that falls on dates from start to end - the same per-day
// split onlineCostsForRange counts, so a breakdown built from it adds up to the cards.
export function settlementShareInRange(s: OnlineCostSettlement, start: string, end: string): number {
  const { weights, totalWeight } = settlementDayWeights(s);
  if (totalWeight <= 0) return 0;
  let inRange = 0;
  for (const [d, w] of weights) if (d >= start && d <= end) inRange += w;
  return inRange / totalWeight;
}

export function buildOnlineCostIndex(settlements: OnlineCostSettlement[], storeId?: string | null): OnlineCostIndex {
  const index: OnlineCostIndex = {
    settled: { zomato: new Map(), swiggy: new Map() },
    covered: { zomato: new Set(), swiggy: new Set() },
  };
  for (const s of settlements || []) {
    const agg = asAggregator(s.aggregator);
    if (!agg || (storeId && s.storeId !== storeId)) continue;
    const { weights, totalWeight } = settlementDayWeights(s);

    // Older files without the GST column: 5% GST on the food, i.e. 5/105 of what the customer paid.
    const gst = s.gstCollected ?? ((s.grossSales || 0) * 5) / 105;
    const commission = (s.netCommission || 0) - gst;
    for (const [d, w] of weights) {
      const share = w / totalWeight;
      const day = index.settled[agg].get(d) || emptyDay();
      day.commission += commission * share;
      day.ads += (s.adSpend || 0) * share;
      day.gst += gst * share;
      day.discount += (s.totalDiscount || 0) * share;
      day.sales += ((s.grossSales || 0) - gst) * share;
      index.settled[agg].set(d, day);
      index.covered[agg].add(d);
    }
  }
  return index;
}

const RATE_DAYS = 60;

function trailingRates(index: OnlineCostIndex, asOf: string): Record<Aggregator, { commission: number; ads: number }> {
  const from = addDays(asOf, -(RATE_DAYS - 1));
  const rates = {} as Record<Aggregator, { commission: number; ads: number }>;
  for (const agg of AGGREGATORS) {
    const sumOver = (inWindow: boolean) => {
      let commission = 0, ads = 0, sales = 0;
      for (const [d, day] of index.settled[agg]) {
        if (inWindow && (d < from || d > asOf)) continue;
        commission += day.commission;
        ads += day.ads;
        sales += day.sales;
      }
      return { commission, ads, sales };
    };
    let t = sumOver(true);
    if (t.sales <= 0) t = sumOver(false); // nothing settled lately - use everything we have
    rates[agg] = t.sales > 0 ? { commission: t.commission / t.sales, ads: t.ads / t.sales } : { commission: 0, ads: 0 };
  }
  return rates;
}

type OnlineSaleLike = { date: string; zomatoSales?: number; swiggySales?: number };
type OnlinePayoutLike = { date: string; zomatoPayout?: number; swiggyPayout?: number };

// `onlineSales` / `onlinePayouts` must already be scoped to the same store as the index.
export function onlineCostsForRange(
  index: OnlineCostIndex,
  onlineSales: OnlineSaleLike[],
  onlinePayouts: OnlinePayoutLike[],
  start: string,
  end: string,
  today: string
): OnlineCosts {
  const last = end > today ? today : end;
  const result: OnlineCosts = {
    commission: 0, ads: 0, settledCommission: 0, legacyCommission: 0, estimatedCommission: 0, estimatedAds: 0,
    estimatedDays: 0, gstExcluded: 0, discounts: 0, commissionBase: 0,
    rates: trailingRates(index, last),
    byDate: {},
    byAggregator: { zomato: { commission: 0, ads: 0, sales: 0 }, swiggy: { commission: 0, ads: 0, sales: 0 } },
  };
  if (!start || !last || start > last) return result;

  const salesByDate = new Map<string, Record<Aggregator, number>>();
  for (const s of onlineSales || []) {
    if (!s?.date || s.date < start || s.date > last) continue;
    const day = salesByDate.get(s.date) || { zomato: 0, swiggy: 0 };
    day.zomato += s.zomatoSales || 0;
    day.swiggy += s.swiggySales || 0;
    salesByDate.set(s.date, day);
  }
  const payoutsByDate = new Map<string, Record<Aggregator, number>>();
  for (const p of onlinePayouts || []) {
    if (!p?.date || p.date < start || p.date > last) continue;
    const day = payoutsByDate.get(p.date) || { zomato: 0, swiggy: 0 };
    day.zomato += p.zomatoPayout || 0;
    day.swiggy += p.swiggyPayout || 0;
    payoutsByDate.set(p.date, day);
  }

  for (let d = start; d <= last; d = addDays(d, 1)) {
    let dayCommission = 0, dayAds = 0, estimated = false;
    for (const agg of AGGREGATORS) {
      const sales = salesByDate.get(d)?.[agg] || 0;
      const byAgg = result.byAggregator[agg];
      if (index.covered[agg].has(d)) {
        const settled = index.settled[agg].get(d);
        if (!settled) continue;
        result.settledCommission += settled.commission;
        result.gstExcluded += settled.gst;
        result.discounts += settled.discount;
        result.commissionBase += settled.sales;
        dayCommission += settled.commission;
        dayAds += settled.ads;
        byAgg.commission += settled.commission;
        byAgg.ads += settled.ads;
        byAgg.sales += sales;
      } else if (payoutsByDate.has(d)) {
        const commission = sales - (payoutsByDate.get(d)![agg] || 0);
        result.legacyCommission += commission;
        result.commissionBase += sales;
        dayCommission += commission;
        byAgg.commission += commission;
        byAgg.sales += sales;
      } else if (sales > 0) {
        const rate = result.rates[agg];
        const commission = sales * rate.commission;
        const ads = sales * rate.ads;
        result.estimatedCommission += commission;
        result.estimatedAds += ads;
        result.commissionBase += sales;
        dayCommission += commission;
        dayAds += ads;
        byAgg.commission += commission;
        byAgg.ads += ads;
        byAgg.sales += sales;
        estimated = true;
      }
    }
    if (estimated) result.estimatedDays += 1;
    if (dayCommission || dayAds) result.byDate[d] = { commission: dayCommission, ads: dayAds };
    result.commission += dayCommission;
    result.ads += dayAds;
  }
  return result;
}
