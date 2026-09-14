import type { SalesDataRecord } from './api';

export type ChannelRevenueTotals = {
  offline: number;
  zomato: number;
  swiggy: number;
};

const emptyTotals = (): ChannelRevenueTotals => ({ offline: 0, zomato: 0, swiggy: 0 });

export function getChannelRevenueFromCategorySales(
  records: SalesDataRecord[] = [],
  date: string,
  storeIds?: string[] | null
): ChannelRevenueTotals {
  const allowedStoreIds = storeIds && storeIds.length > 0 ? new Set(storeIds) : null;

  return records.reduce((totals, record) => {
    if (record.date !== date) return totals;
    if (allowedStoreIds && !allowedStoreIds.has(record.storeId)) return totals;

    for (const category of Object.values(record.channelBreakdown || {})) {
      for (const [channelName, value] of Object.entries(category || {})) {
        const revenue = Number(value?.revenue || 0);
        if (!revenue) continue;

        const normalized = channelName.toLowerCase();
        if (normalized.includes('zomato')) totals.zomato += revenue;
        else if (normalized.includes('swiggy')) totals.swiggy += revenue;
        else totals.offline += revenue;
      }
    }

    return totals;
  }, emptyTotals());
}
