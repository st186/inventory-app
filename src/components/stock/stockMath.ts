// The figures behind the stock request screen, moved out of the JSX they used to be worked out
// in (ProductionRequests.tsx before the new look) with the same rules, so they can be checked:
// the store's stock on hand this month, and the "requests by momo type" report.
import { getStockFilterRange, type StockFilterPreset } from './requestPeriods';

export type FinishedProduct = { key: string; camelKey: string; label: string; legacySalesKey: string; unit?: string };
type Row = Record<string, any>;

// ---------------------------------------------------------------------------------------------
// Store stock on hand: opening balance (last count on or before the 1st) + received this month
// (shipped amounts of delivered requests) - sold this month; a count made during the month
// replaces the opening balance from its date on.

export type StoreStockLine = { camelKey: string; label: string; received: number; sold: number; stock: number; opening: number; totalAvailable: number };
export type StoreStockResult = {
  rangeStart: string;
  rangeEnd: string;
  lines: StoreStockLine[];
  totalStockSum: number;
};

export function computeStoreStock({
  productionRequests,
  salesData,
  finishedProducts,
  storeOpeningBalance,
  mostRecentRecalibration,
  matchesStoreScope,
}: {
  productionRequests: Row[];
  salesData: Row[];
  finishedProducts: FinishedProduct[];
  /** null while it is still loading. */
  storeOpeningBalance: Record<string, number> | null;
  mostRecentRecalibration: { date: string; stock: Record<string, number> } | null;
  matchesStoreScope: (storeId?: string | null) => boolean;
}): StoreStockResult | null {
  const { start: rangeStart, end: rangeEnd } = getStockFilterRange('thisMonth', { from: '', to: '' });
  const inRange = (dateStr: string | undefined) => !!dateStr && dateStr.substring(0, 10) >= rangeStart && dateStr.substring(0, 10) <= rangeEnd;

  const deliveredRequests = productionRequests.filter((req) => {
    // Only delivered / part delivered requests have reached the store.
    if (req.status !== 'delivered' && req.status !== 'partially-delivered') return false;
    const deliveryDate = req.deliveredAt || req.requestDate || req.createdAt;
    if (!inRange(deliveryDate)) return false;
    // Momos delivered to an event stall (events.ts) are the event's stock, not a store's.
    if (req.eventId) return false;
    return matchesStoreScope(req.storeId);
  });

  // The shipped amount when the ship step recorded one, else what was asked for.
  const totalReceived = deliveredRequests.reduce((acc: Record<string, number>, req) => {
    finishedProducts.forEach(({ camelKey }) => {
      const shipped = req.shippedQuantities?.[camelKey];
      const newFormat = req[camelKey] || 0;
      const oldFormat = req[camelKey + 's'] || 0;
      const value = shipped !== undefined ? shipped : newFormat + oldFormat;
      acc[camelKey] = (acc[camelKey] || 0) + value;
    });
    return acc;
  }, {});

  const storeSales = salesData.filter((s) => inRange(s.date) && matchesStoreScope(s.storeId));
  const salesOf = (sale: Row, legacySalesKey: string) => {
    let salesValue = sale.data?.[legacySalesKey] || 0;
    // Older records spell it "Corn Cheese Momos".
    if (legacySalesKey === 'Cheese Corn Momos' && salesValue === 0) salesValue = sale.data?.['Corn Cheese Momos'] || 0;
    return salesValue;
  };
  const totalSales = storeSales.reduce((acc: Record<string, number>, sale) => {
    finishedProducts.forEach(({ camelKey, legacySalesKey }) => {
      acc[camelKey] = (acc[camelKey] || 0) + salesOf(sale, legacySalesKey);
    });
    return acc;
  }, {});

  const openingBalance = storeOpeningBalance || finishedProducts.reduce((acc: Record<string, number>, { camelKey }) => {
    acc[camelKey] = 0;
    return acc;
  }, {});

  // Not shown until the opening balance has loaded.
  if (storeOpeningBalance === null) return null;

  const storeStock: Record<string, number> = {};
  if (mostRecentRecalibration) {
    // A count during the month: count + received after it - sold from its day on (sales have
    // no time, so the count's own day counts as after).
    const recalDateOnly = mostRecentRecalibration.date.substring(0, 10);
    const receivedAfterRecal: Record<string, number> = {};
    const soldAfterRecal: Record<string, number> = {};
    deliveredRequests.forEach((req) => {
      const deliveryDate = req.deliveredAt || req.requestDate || req.createdAt;
      const deliveryDateOnly = deliveryDate ? deliveryDate.substring(0, 10) : '';
      if (deliveryDateOnly && deliveryDateOnly > recalDateOnly) {
        finishedProducts.forEach(({ camelKey }) => {
          const shipped = req.shippedQuantities?.[camelKey];
          const value = shipped !== undefined ? shipped : req[camelKey] || 0;
          receivedAfterRecal[camelKey] = (receivedAfterRecal[camelKey] || 0) + value;
        });
      }
    });
    storeSales.forEach((sale) => {
      const saleDateOnly = sale.date ? sale.date.substring(0, 10) : '';
      if (saleDateOnly && saleDateOnly >= recalDateOnly) {
        finishedProducts.forEach(({ camelKey, legacySalesKey }) => {
          soldAfterRecal[camelKey] = (soldAfterRecal[camelKey] || 0) + salesOf(sale, legacySalesKey);
        });
      }
    });
    finishedProducts.forEach(({ camelKey }) => {
      storeStock[camelKey] = (mostRecentRecalibration.stock[camelKey] || 0) + (receivedAfterRecal[camelKey] || 0) - (soldAfterRecal[camelKey] || 0);
    });
  } else {
    finishedProducts.forEach(({ camelKey }) => {
      storeStock[camelKey] = (openingBalance[camelKey] || 0) + (totalReceived[camelKey] || 0) - (totalSales[camelKey] || 0);
    });
  }

  const totalReceivedSum = Object.values(totalReceived).reduce((sum, val) => sum + val, 0);
  const totalOpeningBalanceSum = Object.values(openingBalance).reduce((sum, val) => sum + val, 0);
  const totalRecalibrationSum = mostRecentRecalibration
    ? Object.values(mostRecentRecalibration.stock || {}).reduce((sum: number, val: any) => sum + val, 0)
    : 0;

  return {
    rangeStart,
    rangeEnd,
    totalStockSum: totalReceivedSum + totalOpeningBalanceSum + totalRecalibrationSum,
    lines: finishedProducts.map(({ camelKey, label }) => {
      const received = totalReceived[camelKey] || 0;
      const opening = openingBalance[camelKey] || 0;
      return { camelKey, label, received, sold: totalSales[camelKey] || 0, stock: storeStock[camelKey] || 0, opening, totalAvailable: opening + received };
    }),
  };
}

export type StockLevel = 'high' | 'medium' | 'low' | 'critical';
export type StockThresholds = Record<string, { high: number; medium: number; low: number }>;
export const DEFAULT_THRESHOLDS = { high: 600, medium: 300, low: 150 };

/** The alert level for a stock figure against the store's thresholds (pieces). */
export function stockLevel(stock: number, thresholds: { high: number; medium: number; low: number } = DEFAULT_THRESHOLDS): StockLevel {
  if (stock <= 0) return 'critical';
  if (stock <= thresholds.low) return 'low';
  if (stock <= thresholds.medium) return 'medium';
  if (stock < thresholds.high) return 'medium';
  return 'high';
}

/** Under 20% of what was available this month (opening + received). */
export const isLowShare = (line: StoreStockLine) => line.stock < line.totalAvailable * 0.2 && line.totalAvailable > 0;

// ---------------------------------------------------------------------------------------------
// Requests by momo type: requested (every request) vs delivered (shipped amounts of delivered
// requests) over a period, and the change in requested against the period before.

export type MomoTypeReportLine = { camelKey: string; label: string; requested: number; delivered: number; comparison: number; percentChange: number; direction: 'up' | 'down' | 'same'; fulfillmentPct: number | null };
export type MomoTypeReport = { periodLabel: string; comparisonLabel: string; requestCount: number; lines: MomoTypeReportLine[] };

export function computeMomoTypeReport({
  requests,
  finishedProducts,
  filter,
  customRange,
  now = new Date(),
}: {
  requests: Row[];
  finishedProducts: FinishedProduct[];
  filter: StockFilterPreset;
  customRange: { from: string; to: string };
  now?: Date;
}): MomoTypeReport {
  // India days (YYYY-MM-DD, like requestDate), whatever the phone's clock zone: by the UTC date it is
  // still yesterday until 5:30 AM, which showed yesterday's request as "Today" (owner, 29 Oct 2026).
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const monthStart = (back: number) => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };
  const monthEnd = (back: number) => shift(monthStart(back - 1), -1);
  const yesterday = shift(today, -1);
  const weekStart = shift(today, -new Date(`${today}T00:00:00Z`).getUTCDay()); // Sunday
  const dayOfMonth = Number(today.slice(8, 10));
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const between = (a: string, b: string) => requests.filter((r) => {
    const day = String(r.requestDate || '').slice(0, 10);
    return day >= a && day <= b;
  });

  // [period, period before] for each choice.
  const ranges: Record<StockFilterPreset, { label: string; from: string; to: string; cmpLabel: string; cmpFrom: string; cmpTo: string }> = {
    today: { label: 'Today', from: today, to: today, cmpLabel: 'vs Yesterday', cmpFrom: yesterday, cmpTo: yesterday },
    yesterday: { label: 'Yesterday', from: yesterday, to: yesterday, cmpLabel: 'vs Day Before', cmpFrom: shift(today, -2), cmpTo: shift(today, -2) },
    thisWeek: { label: 'This Week', from: weekStart, to: today, cmpLabel: 'vs Last Week', cmpFrom: shift(weekStart, -7), cmpTo: shift(weekStart, -1) },
    lastWeek: { label: 'Last Week', from: shift(weekStart, -7), to: shift(weekStart, -1), cmpLabel: 'vs Week Before', cmpFrom: shift(weekStart, -14), cmpTo: shift(weekStart, -8) },
    thisMonth: {
      label: 'This Month', from: monthStart(0), to: today, cmpLabel: `vs Last Month (Day 1-${dayOfMonth})`,
      cmpFrom: monthStart(1), cmpTo: [shift(monthStart(1), dayOfMonth - 1), monthEnd(1)].sort()[0],
    },
    lastMonth: {
      label: 'Last Month', from: monthStart(1), to: monthEnd(1), cmpLabel: `vs Month Before (Day 1-${Number(monthEnd(1).slice(8, 10))})`,
      cmpFrom: monthStart(2), cmpTo: monthEnd(2),
    },
    custom: (() => {
      const base = { label: `${customRange.from} to ${customRange.to}`, from: customRange.from, to: customRange.to, cmpLabel: 'vs Previous Period' };
      // No dates picked yet: nothing to compare (and no date maths on blanks).
      if (!DAY.test(customRange.from) || !DAY.test(customRange.to)) return { ...base, cmpFrom: '', cmpTo: '' };
      const days = Math.max(0, Math.round((Date.parse(`${customRange.to}T00:00:00Z`) - Date.parse(`${customRange.from}T00:00:00Z`)) / 86400000));
      return { ...base, cmpFrom: shift(customRange.from, -days - 1), cmpTo: shift(customRange.from, -1) };
    })(),
  };
  const range = ranges[filter];
  const filteredForCards = range ? between(range.from, range.to) : requests;
  const periodLabel = range?.label || '';
  const comparisonFilteredRequests = range ? between(range.cmpFrom, range.cmpTo) : [];
  const comparisonLabel = range?.cmpLabel || '';

  const totalsRequested: Record<string, number> = {};
  const totalsDelivered: Record<string, number> = {};
  const comparisonTotals: Record<string, number> = {};
  finishedProducts.forEach(({ camelKey }) => {
    totalsRequested[camelKey] = 0;
    totalsDelivered[camelKey] = 0;
    comparisonTotals[camelKey] = 0;
  });
  filteredForCards.forEach((req) => {
    const isDelivered = req.status === 'delivered' || req.status === 'partially-delivered';
    finishedProducts.forEach(({ camelKey }) => {
      const requestedQty = (req[camelKey] || 0) + (req[camelKey + 's'] || 0);
      totalsRequested[camelKey] += requestedQty;
      if (isDelivered) {
        const shipped = req.shippedQuantities?.[camelKey];
        totalsDelivered[camelKey] += shipped !== undefined ? shipped : requestedQty;
      }
    });
  });
  comparisonFilteredRequests.forEach((req) => {
    finishedProducts.forEach(({ camelKey }) => {
      comparisonTotals[camelKey] += (req[camelKey] || 0) + (req[camelKey + 's'] || 0);
    });
  });

  return {
    periodLabel,
    comparisonLabel,
    requestCount: filteredForCards.length,
    lines: finishedProducts.map(({ camelKey, label }) => {
      const requested = totalsRequested[camelKey] || 0;
      const delivered = totalsDelivered[camelKey] || 0;
      const comparison = comparisonTotals[camelKey] || 0;
      let percentChange = 0;
      let direction: 'up' | 'down' | 'same' = 'same';
      if (comparison > 0) {
        percentChange = ((requested - comparison) / comparison) * 100;
        if (percentChange > 0) direction = 'up';
        else if (percentChange < 0) direction = 'down';
      } else if (requested > 0) {
        percentChange = 100;
        direction = 'up';
      }
      return { camelKey, label, requested, delivered, comparison, percentChange, direction, fulfillmentPct: requested > 0 ? Math.round((delivered / requested) * 100) : null };
    }),
  };
}

/** Pieces of each type asked for across a set of requests (new and old key formats). */
export function totalsByType(requests: Row[], finishedProducts: FinishedProduct[]): Record<string, number> {
  return requests.reduce((acc: Record<string, number>, req) => {
    finishedProducts.forEach(({ camelKey }) => {
      acc[camelKey] = (acc[camelKey] || 0) + (req[camelKey] || 0) + (req[camelKey + 's'] || 0);
    });
    return acc;
  }, {});
}
