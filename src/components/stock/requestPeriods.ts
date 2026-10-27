// Date ranges for the stock request screens (moved out of ProductionRequests.tsx unchanged).

export type StockFilterPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

// Shared with the "Stock Requests by Momo Type" filter below - returns YYYY-MM-DD bounds.
export function getStockFilterRange(preset: StockFilterPreset, customRange: { from: string; to: string }): { start: string; end: string } {
  const now = new Date();
  // toISOString() converts to UTC first - for a positive-offset timezone (IST, +5:30) that
  // rolls "today" back to "yesterday" for the ~5.5 hours after local midnight, which made
  // "This Month"/"This Week" silently collapse to a single day right after midnight IST and
  // exclude a same-day recalibration from being picked up as the new baseline. Use local
  // date components instead so the boundary matches the business's actual IST calendar day.
  const toISO = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const startOfWeek = (d: Date) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  };

  switch (preset) {
    case 'today':
      return { start: toISO(now), end: toISO(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: toISO(y), end: toISO(y) };
    }
    case 'thisWeek':
      return { start: toISO(startOfWeek(now)), end: toISO(now) };
    case 'lastWeek': {
      const thisWeekStart = startOfWeek(now);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      return { start: toISO(lastWeekStart), end: toISO(lastWeekEnd) };
    }
    case 'thisMonth':
      return { start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: toISO(now) };
    case 'lastMonth':
      return {
        start: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { start: customRange.from, end: customRange.to };
  }
}
