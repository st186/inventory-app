// The Expenses screen's filtering and totals, moved out of InventoryManagement.tsx unchanged so
// the list, the "Spent on" tile and the number check all use one copy.
import type { FixedCostItem, InventoryItem, OverheadItem } from '../../App';

export type ExpenseTab = 'store' | 'production' | 'combined';

type Scoped = { storeId?: string | null; productionHouseId?: string | null; entityType?: 'store' | 'production_house' };

// Items saved before this split lack entityType - treat those as store expenses.
// 'combined' matches nothing here - the combined summary computes its own totals per entity.
export const belongsToTab = (item: { entityType?: 'store' | 'production_house' }, tab: ExpenseTab) =>
  tab === 'production' ? item.entityType === 'production_house' : tab === 'store' ? item.entityType !== 'production_house' : false;

// Production-house-tagged items carry a productionHouseId, not a storeId - match each item by
// whichever id its own entityType actually uses.
export const makeScopeMatcher = (effectiveStoreId: string | null | undefined, targetProductionHouseId: string | undefined) =>
  (item: Scoped) => {
    if (!effectiveStoreId) return true;
    if (item.entityType === 'production_house') {
      return !targetProductionHouseId || item.productionHouseId === targetProductionHouseId;
    }
    return item.storeId === effectiveStoreId;
  };

export type DayExpenses = {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  inventoryTotal: number;
  overheadTotal: number;
  fixedTotal: number;
  total: number;
};

/** One entity's expenses on a date (the Store or Production list and its totals). */
export function dayExpenses(params: {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  selectedDate: string;
  tab: ExpenseTab;
  matchesScope: (item: Scoped) => boolean;
}): DayExpenses {
  const { selectedDate, tab, matchesScope } = params;
  const inventory = params.inventory.filter((item) => item.date === selectedDate && matchesScope(item) && belongsToTab(item, tab));
  const overheads = params.overheads.filter((item) => item.date === selectedDate && matchesScope(item) && belongsToTab(item, tab));
  const fixedCosts = params.fixedCosts.filter((item) => item.date === selectedDate && matchesScope(item) && belongsToTab(item, tab));
  const inventoryTotal = inventory.reduce((sum, item) => sum + item.totalCost, 0);
  const overheadTotal = overheads.reduce((sum, item) => sum + item.amount, 0);
  const fixedTotal = fixedCosts.reduce((sum, item) => sum + item.amount, 0);
  return { inventory, overheads, fixedCosts, inventoryTotal, overheadTotal, fixedTotal, total: inventoryTotal + overheadTotal + fixedTotal };
}

/** Store and production side by side for the "All" view. */
export function combinedDayExpenses(params: {
  inventory: InventoryItem[];
  overheads: OverheadItem[];
  fixedCosts: FixedCostItem[];
  selectedDate: string;
  matchesScope: (item: Scoped) => boolean;
}) {
  const forEntity = (tab: 'store' | 'production') => {
    const day = dayExpenses({ ...params, tab });
    return {
      inventory: { total: day.inventoryTotal, items: day.inventory },
      overhead: { total: day.overheadTotal, items: day.overheads },
      fixedCost: { total: day.fixedTotal, items: day.fixedCosts },
      total: day.total,
    };
  };
  return { store: forEntity('store'), production: forEntity('production') };
}
