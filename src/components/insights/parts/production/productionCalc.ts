// The Production tab's figures, moved out of the old ProductionTab.tsx render body as they were
// (same filters, same sums, same rounding) so the new layout can draw them in any order. Nothing
// here changes a number; scripts in the WP8 number check compare these with the old code.
import { formatDateIST, addDays } from '../../../../utils/timezone';
import { MOMO_TYPES, ALL_POOL_IDS, getPoolLabel } from '../../../../constants/momoTypes';
import { houseExpected } from '../../../stock/countMath';

type Range = { startDate: string; endDate: string };
export type ZipPrev = <T extends Record<string, any>>(current: T[], previous: T[], keys: (keyof T)[]) => any[];

/**
 * Does a production record belong to the chosen production house? Matches the record's storeId,
 * its productionHouseId, or the house of the store it was logged against (the rule every
 * section of the old tab repeated).
 */
export function makeHouseMatcher(filterById: string | null | undefined, stores: any[], contextStores: any[] | undefined) {
  return (p: any) => {
    if (!filterById) return true;
    const matchesStoreId = p.storeId === filterById;
    const matchesProductionHouseId = p.productionHouseId === filterById;
    let recordProductionHouseId = p.productionHouseId;
    if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
      const allStores = stores.length > 0 ? stores : (contextStores || []);
      recordProductionHouseId = allStores.find((s: any) => s.id === p.storeId)?.productionHouseId || undefined;
    }
    const phId = recordProductionHouseId || p.storeId;
    return matchesStoreId || matchesProductionHouseId || phId === filterById;
  };
}

const enumerateDates = (start: string, end: string): string[] => {
  const dates: string[] = [];
  let d = start;
  let guard = 0;
  while (d <= end && guard < 400) {
    dates.push(d);
    d = addDays(d, 1);
    guard++;
  }
  return dates;
};

// ---- Pieces made by momo type, this period and the one before ---------------------------------
export const SUMMARY_TYPES = [
  { key: 'chickenMomos', label: 'Chicken Momos' },
  { key: 'chickenCheeseMomos', label: 'Chicken Cheese' },
  { key: 'vegMomos', label: 'Veg Momos' },
  { key: 'cheeseCornMomos', label: 'Cheese Corn' },
  { key: 'paneerMomos', label: 'Paneer Momos' },
  { key: 'vegKurkureMomos', label: 'Veg Kurkure' },
  { key: 'chickenKurkureMomos', label: 'Chicken Kurkure' },
] as const;

export function buildPeriodSummary(productionData: any[], matches: (p: any) => boolean, range: Range, previousRange: Range) {
  const filteredProduction = productionData.filter((p) => {
    if (p.date < range.startDate || p.date > range.endDate) return false;
    return matches(p);
  });
  const previousProduction = productionData.filter((p) => {
    if (p.date < previousRange.startDate || p.date > previousRange.endDate) return false;
    return matches(p);
  });
  // Helper function to calculate percentage change
  const calcPercentChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };
  const types = SUMMARY_TYPES.map((t) => {
    const current = filteredProduction.reduce((sum, p) => sum + (p[t.key]?.final || 0), 0);
    const previous = previousProduction.reduce((sum, p) => sum + (p[t.key]?.final || 0), 0);
    return { ...t, current, previous, change: previous > 0 ? calcPercentChange(current, previous) : null };
  });
  const totalWastage = filteredProduction.reduce((sum, p) => {
    return sum +
      (p.wastage?.dough || 0) +
      (p.wastage?.stuffing || 0) +
      (p.wastage?.batter || 0) +
      (p.wastage?.coating || 0);
  }, 0);
  const approvedCount = filteredProduction.filter((p) => p.approvalStatus === 'approved').length;
  const pendingCount = filteredProduction.filter((p) => p.approvalStatus === 'pending').length;
  const total = types.reduce((s, t) => s + t.current, 0);
  const previousTotal = types.reduce((s, t) => s + t.previous, 0);
  return { types, totalWastage, approvedCount, pendingCount, total, previousTotal };
}

// ---- Day by day: pieces, yield and wastage rate --------------------------------------------------
export function buildOutput(productionData: any[], matches: (p: any) => boolean, range: Range, previousRange: Range, zipPrev: ZipPrev) {
  const buildDailySeries = (dates: string[]) => dates.map((date) => {
    const dayRecords = productionData.filter((p) => matches(p) && p.date === date);
    const row: any = { date, label: formatDateIST(date) };
    let regularFinal = 0, regularInput = 0, kurkureFinal = 0, kurkureInput = 0;
    let wastageKg = 0, totalInputKg = 0;
    MOMO_TYPES.forEach((t) => {
      const final = dayRecords.reduce((sum, p) => sum + (p[t.key]?.final || 0), 0);
      row[t.key] = final;
      if (t.group === 'regular') {
        const input = dayRecords.reduce((sum, p) => sum + (p[t.key]?.dough || 0) + (p[t.key]?.stuffing || 0), 0);
        regularFinal += final; regularInput += input; totalInputKg += input;
      } else {
        const input = dayRecords.reduce((sum, p) => sum + (p[t.key]?.batter || 0) + (p[t.key]?.coating || 0), 0);
        kurkureFinal += final; kurkureInput += input; totalInputKg += input;
      }
    });
    wastageKg = dayRecords.reduce((sum, p) => sum + (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0), 0);
    row.totalFinal = regularFinal + kurkureFinal;
    row.regularFinal = regularFinal;
    row.kurkureFinal = kurkureFinal;
    row.momoYield = regularInput > 0 ? Math.round((regularFinal / regularInput) * 10) / 10 : null;
    row.kurkureYield = kurkureInput > 0 ? Math.round((kurkureFinal / kurkureInput) * 10) / 10 : null;
    row.wastagePct = (totalInputKg + wastageKg) > 0 ? Math.round((wastageKg / (totalInputKg + wastageKg)) * 1000) / 10 : 0;
    return row;
  });

  const currentDates = enumerateDates(range.startDate, range.endDate);
  const previousDates = enumerateDates(previousRange.startDate, previousRange.endDate);
  const outputSeries = buildDailySeries(currentDates);
  const previousOutputSeries = buildDailySeries(previousDates);
  const outputChartData = zipPrev(outputSeries, previousOutputSeries, ['totalFinal', 'momoYield', 'kurkureYield', 'wastagePct']);

  const periodMix = MOMO_TYPES.map((t) => ({
    key: t.key,
    name: t.label,
    value: outputSeries.reduce((sum, r) => sum + (r[t.key] || 0), 0),
  }));
  const hasAnyOutput = periodMix.some((m) => m.value > 0);
  return { currentDates, outputSeries, previousOutputSeries, outputChartData, periodMix, hasAnyOutput };
}

// ---- Sauces and chutneys (litres a day) ---------------------------------------------------------
export const SAUCE_TYPES = [
  { key: 'panfriedSauce', label: 'Panfried Sauce' },
  { key: 'chilliChickenSauce', label: 'Chilli Chicken Sauce' },
  { key: 'spicyKoreanSauce', label: 'Spicy Korean Sauce' },
  { key: 'hotGarlicSauce', label: 'Hot Garlic Sauce' },
  { key: 'tandooriSauce', label: 'Tandoori Sauce' },
  { key: 'soupPremix', label: 'Soup Premix' },
  { key: 'greenMayoChutney', label: 'Green Mayo Chutney' },
  { key: 'spicyRedChutney', label: 'Spicy Red Chutney' },
] as const;

export function buildSauces(productionData: any[], matches: (p: any) => boolean, range: Range, previousRange: Range, zipPrev: ZipPrev, pctChange: (c: number, p: number) => number | null) {
  const buildSauceSeries = (dates: string[]) => dates.map((date) => {
    const dayRecords = productionData.filter((p) => matches(p) && p.date === date);
    const row: any = { date, label: formatDateIST(date) };
    let total = 0;
    SAUCE_TYPES.forEach((s) => {
      const litres = dayRecords.reduce((sum, p) => sum + (p.sauces?.[s.key] || 0), 0);
      row[s.key] = Math.round(litres * 100) / 100;
      total += litres;
    });
    row.totalSauce = Math.round(total * 100) / 100;
    return row;
  });

  const currentDates = enumerateDates(range.startDate, range.endDate);
  const previousDates = enumerateDates(previousRange.startDate, previousRange.endDate);
  const sauceSeries = buildSauceSeries(currentDates);
  const previousSauceSeries = buildSauceSeries(previousDates);
  const sauceChartData = zipPrev(sauceSeries, previousSauceSeries, ['totalSauce']);

  const periodTotals = SAUCE_TYPES.map((s) => ({
    key: s.key,
    name: s.label,
    value: Math.round(sauceSeries.reduce((sum, r) => sum + (r[s.key] || 0), 0) * 100) / 100,
  }));
  const previousPeriodTotals = SAUCE_TYPES.map((s) => ({
    key: s.key,
    value: previousSauceSeries.reduce((sum, r) => sum + (r[s.key] || 0), 0),
  }));
  const hasAnySauce = periodTotals.some((t) => t.value > 0);
  const rows = periodTotals
    .filter((t) => t.value > 0 || (previousPeriodTotals.find((p) => p.key === t.key)?.value || 0) > 0)
    .map((t) => {
      const prevValue = previousPeriodTotals.find((p) => p.key === t.key)?.value || 0;
      return { ...t, prevValue, change: pctChange(t.value, prevValue) };
    });
  const totalLitres = Math.round(periodTotals.reduce((s, t) => s + t.value, 0) * 100) / 100;
  return { currentDates, sauceChartData, rows, hasAnySauce, totalLitres };
}

// ---- Day of the week ------------------------------------------------------------------------------
export function buildWeekday(productionData: any[], matches: (p: any) => boolean, range: Range, previousRange: Range, zipPrev: ZipPrev) {
  // Mon..Sun display order, mapped from JS's Sun=0..Sat=6
  const WEEKDAYS = [
    { jsDay: 1, label: 'Mon' }, { jsDay: 2, label: 'Tue' }, { jsDay: 3, label: 'Wed' },
    { jsDay: 4, label: 'Thu' }, { jsDay: 5, label: 'Fri' }, { jsDay: 6, label: 'Sat' },
    { jsDay: 0, label: 'Sun' },
  ];
  const buildWeekdaySeries = (fromDate: string, toDate: string) => {
    const records = productionData.filter((p) => matches(p) && p.date >= fromDate && p.date <= toDate);
    return WEEKDAYS.map((w) => {
      const dayRecords = records.filter((p) => new Date(`${p.date}T00:00:00`).getDay() === w.jsDay);
      let totalFinal = 0, wastageKg = 0;
      MOMO_TYPES.forEach(({ key }) => {
        totalFinal += dayRecords.reduce((sum, p) => sum + (p[key]?.final || 0), 0);
      });
      dayRecords.forEach((p) => {
        wastageKg += (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0);
      });
      return { label: w.label, totalFinal, wastageKg: Math.round(wastageKg * 100) / 100 };
    });
  };
  const weekdaySeries = buildWeekdaySeries(range.startDate, range.endDate);
  const previousWeekdaySeries = buildWeekdaySeries(previousRange.startDate, previousRange.endDate);
  const weekdayChartData = zipPrev(weekdaySeries, previousWeekdaySeries, ['totalFinal']);
  const hasAnyOutput = weekdaySeries.some((r) => r.totalFinal > 0);
  return { weekdayChartData, hasAnyOutput };
}

// ---- Stock at the production house (opening + made this month - sent to stores) ---------------
export type StockRow = {
  key: string;
  camelKey: string;
  label: string;
  unit: string | undefined;
  opening: number;
  produced: number;
  sent: number;
  stock: number;
  hasData: boolean;
  thresholds: { high: number; medium: number; low: number };
  level: 'over' | 'critical' | 'low' | 'medium' | null;
};

export function buildStock(args: {
  productionData: any[];
  selectedProductionHouseId: string | null | undefined;
  stores: any[];
  context: any;
  previousMonthStock: any;
  stockAlertThresholds: Record<string, { high: number; medium: number; low: number }>;
}) {
  const { productionData, selectedProductionHouseId, stores, context, previousMonthStock, stockAlertThresholds } = args;
  // In production analytics mode, always use selectedProductionHouseId
  const effectiveProductionHouseId = selectedProductionHouseId;

  // Get all production data for the production house
  const filteredProduction = productionData.filter((p) => {
    if (!effectiveProductionHouseId) return true; // No filter selected, show all
    const matchesStoreId = p.storeId === effectiveProductionHouseId;
    const matchesProductionHouseId = p.productionHouseId === effectiveProductionHouseId;
    let recordProductionHouseId = p.productionHouseId;
    if ((!recordProductionHouseId || recordProductionHouseId.startsWith('STORE-')) && p.storeId) {
      const allStores = stores.length > 0 ? stores : (context.stores || []);
      const store = allStores.find((s: any) => s.id === p.storeId);
      recordProductionHouseId = store?.productionHouseId || undefined;
    }
    const phId = recordProductionHouseId || p.storeId; // Final fallback to storeId
    return matchesStoreId || matchesProductionHouseId || phId === effectiveProductionHouseId;
  });

  // Fixed current-month activity for this stock view. Stock Available itself remains
  // current stock, so a separate date filter would make the card misleading.
  const nowForMonth = new Date();
  const currentMonth = `${nowForMonth.getFullYear()}-${String(nowForMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthlyFilteredProduction = filteredProduction.filter((p) => p.date.startsWith(currentMonth));

  // Get all finished product inventory items FIRST (we need this for dynamic calculations)
  const finishedProductsForCalc = context.inventoryItems?.filter((item: any) =>
    item.category === 'finished_product' &&
    item.isActive &&
    (item.linkedEntityType === 'global' ||
     (item.linkedEntityType === 'production_house' && item.linkedEntityId === effectiveProductionHouseId))
  ) || [];

  // Helper function to convert snake_case to camelCase
  const snakeToCamelForCalc = (str: string) => {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  };

  // Helper to get the base name for stock lookup (remove _momo/_momos suffix)
  const getStockKey = (itemName: string) => {
    const baseName = itemName.replace(/_momo(s)?$/i, '');
    return snakeToCamelForCalc(baseName);
  };

  // Calculate approved production by momo type for the current month.
  const totalProduced: Record<string, number> = {};
  finishedProductsForCalc.forEach((item: any) => {
    const stockKey = getStockKey(item.name);
    totalProduced[stockKey] = 0;
  });

  const getProductionFieldValue = (p: any, itemName: string, stockKey: string) => {
    const data = p?.data || {};
    const baseItemName = itemName.replace(/_momo(s)?$/i, '');
    const camelItemName = snakeToCamelForCalc(itemName);
    const camelBaseItemName = snakeToCamelForCalc(baseItemName);
    const aliases = [
      itemName,
      `${itemName}s`,
      baseItemName,
      stockKey,
      camelItemName,
      `${camelItemName}s`,
      camelBaseItemName,
      `${camelBaseItemName}Momos`,
      `${stockKey}Momos`
    ];
    const normalizeValue = (value: any) => {
      if (value === undefined || value === null) return 0;
      if (typeof value === 'object') return Number(value.final ?? value.quantity ?? value.pieces ?? 0) || 0;
      return Number(value) || 0;
    };
    for (const alias of aliases) {
      if (data[alias] !== undefined && data[alias] !== null) {
        return normalizeValue(data[alias]);
      }
    }
    for (const alias of aliases) {
      if (p[alias] !== undefined && p[alias] !== null) {
        return normalizeValue(p[alias]);
      }
    }
    return 0;
  };

  const addProductionRecordToTotals = (p: any, target: Record<string, number>) => {
    finishedProductsForCalc.forEach((item: any) => {
      const stockKey = getStockKey(item.name);
      const fieldValue = getProductionFieldValue(p, item.name, stockKey);
      target[stockKey] = (target[stockKey] || 0) + fieldValue;
    });
  };

  // Entries waiting for approval are momos made all the same; only rejected ones are left out.
  const approvedMonthlyProduction = monthlyFilteredProduction
    .filter((p) => p.approvalStatus !== 'rejected');
  approvedMonthlyProduction.forEach((p) => addProductionRecordToTotals(p, totalProduced));

  // First, resolve the production house UUID. For production incharges,
  // effectiveProductionHouseId is their storeId; find the matching production house UUID.
  let productionHouseUUID = effectiveProductionHouseId;
  if (effectiveProductionHouseId && effectiveProductionHouseId.startsWith('STORE-')) {
    const userStore = context.stores?.find((s: any) => s.id === effectiveProductionHouseId);
    if (userStore?.productionHouseId) {
      productionHouseUUID = userStore.productionHouseId;
    }
  }

  const fulfilledRequests = context.productionRequests?.filter((req: any) => {
    // Count anything sent out of the production house. A request can be shipped or
    // partially-shipped before the store marks it delivered, but it has still left stock.
    const sentStatuses = ['shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
    if (!sentStatuses.includes(req.status)) return false;
    // Filter by current month only (monthly reset)
    const requestDate = req.shippedAt || req.deliveredAt || req.requestDate || req.createdAt;
    if (!requestDate || !requestDate.startsWith(currentMonth)) {
      return false;
    }
    const allStores = stores.length > 0 ? stores : (context.stores || []);
    const requestingStore = allStores.find((s: any) => s.id === req.storeId);
    if (productionHouseUUID) {
      const matches = requestingStore?.productionHouseId === productionHouseUUID;
      return matches;
    }
    return true;
  }) || [];

  // Calculate total fulfilled stock requests (sent to stores) - DYNAMIC
  const totalSentToStores: Record<string, number> = {};
  finishedProductsForCalc.forEach((item: any) => {
    const stockKey = getStockKey(item.name);
    totalSentToStores[stockKey] = 0;
  });

  const getDeliveredRequestQuantity = (req: any, itemName: string, stockKey: string) => {
    const baseItemName = itemName.replace(/_momo(s)?$/i, '');
    const camelItemName = snakeToCamelForCalc(itemName);
    const camelBaseItemName = snakeToCamelForCalc(baseItemName);
    const aliases = [
      stockKey,
      `${stockKey}Momos`,
      `${stockKey}Momo`,
      itemName,
      `${itemName}s`,
      baseItemName,
      camelItemName,
      `${camelItemName}s`,
      camelBaseItemName,
      `${camelBaseItemName}Momos`,
      `${camelBaseItemName}Momo`
    ];
    const shippedQuantities = req.shippedQuantities || {};
    for (const alias of aliases) {
      const shippedValue = shippedQuantities[alias];
      if (shippedValue !== undefined && shippedValue !== null) return Number(shippedValue) || 0;
    }
    for (const alias of aliases) {
      const value = req[alias];
      if (value !== undefined && value !== null) return Number(value) || 0;
    }
    return 0;
  };

  const addDeliveredRequestToTotals = (req: any, target: Record<string, number>) => {
    finishedProductsForCalc.forEach((item: any) => {
      const stockKey = getStockKey(item.name);
      const deliveredQty = getDeliveredRequestQuantity(req, item.name, stockKey);
      target[stockKey] = (target[stockKey] || 0) + deliveredQty;
    });
  };
  fulfilledRequests.forEach((req: any) => addDeliveredRequestToTotals(req, totalSentToStores));

  // Stock now = the last stock count that wasn't rejected + everything made and sent since
  // (stock/countMath.ts), the figure the stock count expects. `previousMonthStock` holds that count
  // and the event leftovers counted back in (useAnalyticsData); until it loads, this month only.
  // The month's own figures stay for the rows, with the opening being what that leaves.
  const allStoresForStock = stores.length > 0 ? stores : (context.stores || []);
  const now = previousMonthStock
    ? houseExpected({
      base: previousMonthStock.base ?? null,
      ids: { productionHouseUUID, effectiveStoreId: effectiveProductionHouseId, originalStoreId: effectiveProductionHouseId },
      productionData: filteredProduction,
      requests: context.productionRequests || [],
      stores: allStoresForStock,
      returns: previousMonthStock.returns || [],
    }).expected
    : null;
  const productionHouseStock: Record<string, number> = {};
  const openingBalance: Record<string, number> = {};
  finishedProductsForCalc.forEach((item: any) => {
    const stockKey = getStockKey(item.name);
    const convertedToKurkure =
      stockKey === 'chicken' ? (totalProduced.chickenKurkure || 0) :
      stockKey === 'veg' ? (totalProduced.vegKurkure || 0) :
      0;
    const monthChange = (totalProduced[stockKey] || 0) - (totalSentToStores[stockKey] || 0) - convertedToKurkure;
    productionHouseStock[stockKey] = now ? now[stockKey] || 0 : monthChange;
    openingBalance[stockKey] = productionHouseStock[stockKey] - monthChange;
  });

  const snakeToCamel = (str: string) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  const rows: StockRow[] = finishedProductsForCalc.map((item: any): StockRow => {
    const baseName = item.name.replace(/_momo(s)?$/i, '');
    const camelKey = snakeToCamel(baseName);
    const key = item.name;
    const opening = (openingBalance as any)[camelKey] || (openingBalance as any)[key] || 0;
    const produced = (totalProduced as any)[camelKey] || (totalProduced as any)[key] || 0;
    const sent = (totalSentToStores as any)[camelKey] || (totalSentToStores as any)[key] || 0;
    const stock = (productionHouseStock as any)[camelKey] || (productionHouseStock as any)[key] || 0;
    const hasData = opening > 0 || produced > 0 || sent > 0 || stock !== undefined;
    // The three-level alert thresholds for this item
    const thresholds = stockAlertThresholds[camelKey] ?? stockAlertThresholds[key] ?? { high: 600, medium: 300, low: 150 };
    const isCriticalStock = stock < thresholds.low;
    const isLowStock = stock >= thresholds.low && stock < thresholds.medium;
    const isMediumStock = stock >= thresholds.medium && stock < thresholds.high;
    const level: 'over' | 'critical' | 'low' | 'medium' | null = stock < 0 ? 'over' : isCriticalStock ? 'critical' : isLowStock ? 'low' : isMediumStock ? 'medium' : null;
    return { key, camelKey, label: item.displayName as string, unit: item.unit, opening, produced, sent, stock, hasData, thresholds, level };
  });

  const hasOpeningBalance = Object.values(openingBalance).some((v: any) => v > 0);
  const noData = filteredProduction.length === 0 && !hasOpeningBalance;
  return { rows, productionHouseStock, hasOpeningBalance, noData, effectiveProductionHouseId };
}

// ---- Production houses compared ----------------------------------------------------------------
export function buildLeaderboard(productionData: any[], productionHouses: any[], stores: any[], contextStores: any[] | undefined, range: Range) {
  const periodProduction = productionData.filter((p) => p.date >= range.startDate && p.date <= range.endDate);
  const rows = productionHouses.map((ph) => {
    const matchesHouse = makeHouseMatcher(ph.id, stores, contextStores);
    const houseRecords = periodProduction.filter(matchesHouse);
    let totalFinal = 0, totalRawKg = 0, totalWastageKg = 0;
    MOMO_TYPES.forEach((t) => {
      totalFinal += houseRecords.reduce((sum, p) => sum + (p[t.key]?.final || 0), 0);
      totalRawKg += t.group === 'regular'
        ? houseRecords.reduce((sum, p) => sum + (p[t.key]?.dough || 0) + (p[t.key]?.stuffing || 0), 0)
        : houseRecords.reduce((sum, p) => sum + (p[t.key]?.batter || 0) + (p[t.key]?.coating || 0), 0);
    });
    totalWastageKg = houseRecords.reduce((sum, p) => sum + (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0), 0);
    const yieldPcsPerKg = totalRawKg > 0 ? Math.round((totalFinal / totalRawKg) * 10) / 10 : null;
    const wastagePct = (totalRawKg + totalWastageKg) > 0 ? Math.round((totalWastageKg / (totalRawKg + totalWastageKg)) * 1000) / 10 : 0;
    return { id: ph.id, name: ph.name, totalFinal, yieldPcsPerKg, wastagePct };
  }).filter((r) => r.totalFinal > 0).sort((a, b) => b.totalFinal - a.totalFinal);
  return rows;
}

// ---- Production ledger (dough / stuffing / batter / coating pools) ----------------------------
export const PRODUCTION_LEDGER_GO_LIVE_DATE = '2026-08-23';

export function buildLedger(productionLedgerRange: any[], productionData: any[], selectedProductionHouseId: string, selectedLedgerPoolId: string | null | undefined) {
  const sortedEntries = [...productionLedgerRange].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedEntries.length === 0) return null;

  // Totals per pool across the whole range, for utilization % and days-of-cover.
  const totals: Record<string, { prepared: number; wastage: number }> = {};
  ALL_POOL_IDS.forEach((id) => { totals[id] = { prepared: 0, wastage: 0 }; });
  sortedEntries.forEach((entry) => {
    ALL_POOL_IDS.forEach((id) => {
      const pool = (entry.pools as any)?.[id];
      if (!pool) return;
      totals[id].prepared += pool.prepared || 0;
      if (typeof pool.wastage === 'number') totals[id].wastage += pool.wastage;
    });
  });
  const latestEntry = sortedEntries[sortedEntries.length - 1];
  const daysInRange = sortedEntries.length;

  // Leftover-aging: consecutive days back from the latest entry where a pool's
  // closingActual stayed above a small threshold - a rough "sitting idle" signal.
  const agingDays: Record<string, number> = {};
  ALL_POOL_IDS.forEach((id) => {
    let count = 0;
    for (let i = sortedEntries.length - 1; i >= 0; i--) {
      const pool = (sortedEntries[i].pools as any)?.[id];
      if (pool && typeof pool.closingActual === 'number' && pool.closingActual > 0.01) count++;
      else break;
    }
    agingDays[id] = count;
  });

  const utilizationRows = ALL_POOL_IDS
    .map((id) => ({
      id,
      label: getPoolLabel(id),
      prepared: totals[id].prepared,
      utilizationPct: totals[id].prepared > 0 ? Math.round((totals[id].wastage / totals[id].prepared) * 1000) / 10 : null,
      closingActual: (latestEntry.pools as any)?.[id]?.closingActual ?? null,
      avgDailyConsumption: daysInRange > 0 ? totals[id].wastage / daysInRange : 0,
    }))
    .filter((r) => r.prepared > 0 || (r.closingActual !== null && r.closingActual > 0))
    .map((r) => ({
      ...r,
      daysCover: r.avgDailyConsumption > 0.001 && r.closingActual !== null
        ? Math.round((r.closingActual / r.avgDailyConsumption) * 10) / 10
        : null,
    }));

  if (utilizationRows.length === 0) return { empty: true as const };

  const trendData = sortedEntries.map((entry) => {
    const row: any = { label: formatDateIST(entry.date) };
    ALL_POOL_IDS.forEach((id) => {
      const pool = (entry.pools as any)?.[id];
      row[`${id}_opening`] = pool?.opening ?? null;
      row[`${id}_prepared`] = pool?.prepared ?? null;
      row[`${id}_closing`] = pool?.closingActual ?? null;
    });
    return row;
  });

  const activePoolId = selectedLedgerPoolId && utilizationRows.some((r) => r.id === selectedLedgerPoolId)
    ? selectedLedgerPoolId
    : utilizationRows[0].id;

  const risky = ALL_POOL_IDS
    .map((id) => ({ id, label: getPoolLabel(id), days: agingDays[id] }))
    .filter((r) => r.days >= 3);

  // Actually-consumed material yield, per momo type with its own pool - pieces made divided
  // by kg actually drawn down from that type's own pool (the ledger's `wastage` field).
  const houseProductionInRange = productionData.filter((p: any) => {
    const matchesHouse = p.productionHouseId === selectedProductionHouseId || p.storeId === selectedProductionHouseId;
    return matchesHouse && p.date >= sortedEntries[0].date && p.date <= latestEntry.date;
  });
  const actualYieldRows = MOMO_TYPES
    .map((t) => {
      const poolId = `${t.perTypePoolField}:${t.inventoryKey}`;
      const consumedKg = totals[poolId]?.wastage || 0;
      const piecesMade = houseProductionInRange.reduce((sum: number, p: any) => sum + (p[t.key]?.final || 0), 0);
      return {
        key: t.key,
        label: t.label,
        piecesMade,
        consumedKg,
        yieldPcsPerKg: consumedKg > 0.01 ? Math.round((piecesMade / consumedKg) * 10) / 10 : null,
      };
    })
    .filter((r) => r.piecesMade > 0 || r.consumedKg > 0);

  return { empty: false as const, utilizationRows, trendData, activePoolId, risky, actualYieldRows };
}

// ---- Wastage ------------------------------------------------------------------------------------
/** The wastage sections' own matcher: also counts records logged against a store of the house. */
export function makeWastageMatcher(filterById: string | null | undefined, stores: any[]) {
  // Get stores mapped to this production house
  const mappedStoreIds = filterById
    ? stores.filter((s: any) => s.productionHouseId === filterById).map((s: any) => s.id)
    : [];
  const matchesProductionHouse = (p: any) => {
    if (!filterById) return true;
    const matchesStoreId = p.storeId === filterById;
    const matchesProductionHouseId = p.productionHouseId === filterById;
    const phId = p.productionHouseId || p.storeId;
    const matchesMappedStore = mappedStoreIds.includes(p.storeId) || mappedStoreIds.includes(p.productionHouseId);
    return matchesStoreId || matchesProductionHouseId || phId === filterById || matchesMappedStore;
  };
  return { matchesProductionHouse, mappedStoreIds, filterById };
}

export function buildWastageStatus(productionData: any[], matches: (p: any) => boolean) {
  const filteredProduction = productionData.filter(matches);
  const recordsWithWastage = filteredProduction.filter((p) =>
    (p.wastage?.dough || 0) > 0 ||
    (p.wastage?.stuffing || 0) > 0 ||
    (p.wastage?.batter || 0) > 0 ||
    (p.wastage?.coating || 0) > 0
  );
  return { recordCount: filteredProduction.length, withWastage: recordsWithWastage.length };
}

export function buildWastageTrend(productionData: any[], matches: (p: any) => boolean, range: Range, previousRange: Range, zipPrev: ZipPrev) {
  const buildWastageSeries = (dates: string[]) => dates.map((date) => {
    const dayProduction = productionData.filter((p) => matches(p) && p.date === date);
    const wastage = dayProduction.reduce((sum, p) =>
      sum + (p.wastage?.dough || 0) + (p.wastage?.stuffing || 0) + (p.wastage?.batter || 0) + (p.wastage?.coating || 0), 0);
    return { date, label: formatDateIST(date), wastage: Math.round(wastage * 100) / 100 };
  });
  const currentDates = enumerateDates(range.startDate, range.endDate);
  const previousDates = enumerateDates(previousRange.startDate, previousRange.endDate);
  const wastageSeries = buildWastageSeries(currentDates);
  const previousWastageSeries = buildWastageSeries(previousDates);
  const wastageChartData = zipPrev(wastageSeries, previousWastageSeries, ['wastage']);
  return { currentDates, wastageChartData };
}

export type WastageFilter = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export function buildWastageBreakdown(productionData: any[], matches: (p: any) => boolean, wastageTimeFilter: WastageFilter, dateRange: { from: string; to: string }) {
  const filteredProduction = productionData.filter((p) => {
    if (!matches(p)) return false;
    if (wastageTimeFilter === 'custom') {
      return p.date >= dateRange.from && p.date <= dateRange.to;
    }
    const today = new Date();
    const pDate = new Date(p.date);
    if (wastageTimeFilter === 'daily') {
      // Last 5 days
      const fiveDaysAgo = new Date(today);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      return pDate >= fiveDaysAgo;
    } else if (wastageTimeFilter === 'weekly') {
      // Last 5 weeks
      const fiveWeeksAgo = new Date(today);
      fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35);
      return pDate >= fiveWeeksAgo;
    } else if (wastageTimeFilter === 'monthly') {
      // Last 5 months
      const fiveMonthsAgo = new Date(today);
      fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);
      return pDate >= fiveMonthsAgo;
    } else if (wastageTimeFilter === 'yearly') {
      // Last 5 years
      const fiveYearsAgo = new Date(today);
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      return pDate >= fiveYearsAgo;
    }
    return true;
  });

  // Group by time period
  const grouped = new Map();
  filteredProduction.forEach((p) => {
    let key = p.date;
    let displayLabel = p.date;
    if (wastageTimeFilter === 'weekly') {
      // Monday-Sunday weeks, as on the rest of the page (date-string arithmetic, no UTC drift)
      const [py, pm, pd] = p.date.split('-').map(Number);
      const weekStartStr = addDays(p.date, -((new Date(Date.UTC(py, pm - 1, pd)).getUTCDay() + 6) % 7));
      const weekStart = new Date(`${weekStartStr}T00:00:00`);
      const weekEnd = new Date(`${addDays(weekStartStr, 6)}T00:00:00`);
      key = weekStartStr;
      displayLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else if (wastageTimeFilter === 'monthly') {
      key = p.date.substring(0, 7); // YYYY-MM
      displayLabel = key;
    } else if (wastageTimeFilter === 'yearly') {
      key = p.date.substring(0, 4); // YYYY
      displayLabel = key;
    }
    if (!grouped.has(key)) {
      grouped.set(key, { period: displayLabel, dough: 0, stuffing: 0, batter: 0, coating: 0 });
    }
    const data = grouped.get(key)!;
    data.dough += p.wastage?.dough || 0;
    data.stuffing += p.wastage?.stuffing || 0;
    data.batter += p.wastage?.batter || 0;
    data.coating += p.wastage?.coating || 0;
  });

  return Array.from(grouped.values()).sort((a: any, b: any) =>
    a.period.localeCompare(b.period)
  ).map((item: any, index: number) => ({ ...item, uniqueKey: `wastage-breakdown-${index}` }));
}

// ---- Ingredient use vs SOP for one day --------------------------------------------------------
export const SOP_NAMES: Record<string, string> = {
  chickenMomos: 'Chicken Momos',
  chickenCheeseMomos: 'Chicken Cheese Momos',
  vegMomos: 'Veg Momos',
  cheeseCornMomos: 'Cheese Corn Momos',
  paneerMomos: 'Paneer Momos',
  vegKurkure: 'Veg Kurkure',
  chickenKurkure: 'Chicken Kurkure',
};

export function buildSopCompliance(args: {
  productionData: any[];
  stores: any[];
  contextStores: any[] | undefined;
  filterById: string | null | undefined;
  dateStr: string;
  sopThresholds: any;
  sopDiversionPercent: number;
}) {
  const { productionData, stores, contextStores, filterById, dateStr, sopThresholds, sopDiversionPercent } = args;
  const dayProduction = productionData.filter((p) => {
    // Get mapped store IDs
    const allStores = stores.length > 0 ? stores : (contextStores || []);
    const mappedStoreIds = allStores
      .filter((s: any) => s.productionHouseId === filterById)
      .map((s: any) => s.id);
    const matchesStoreId = p.storeId === filterById;
    const matchesProductionHouseId = p.productionHouseId === filterById;
    const phId = p.productionHouseId || p.storeId;
    const matchesFallback = phId === filterById;
    const matchesMappedStore = p.storeId && mappedStoreIds.includes(p.storeId);
    const matchesDate = p.date === dateStr;
    const isApproved = p.approvalStatus === 'approved';
    const passesFilter = (matchesStoreId || matchesProductionHouseId || matchesFallback || matchesMappedStore);
    if (filterById && !passesFilter) {
      return false;
    }
    return matchesDate && isApproved;
  });
  if (dayProduction.length === 0) return null;

  // Map production data fields to SOP threshold keys
  const fieldMapping: any = {
    chickenMomos: 'chickenMomos',
    chickenCheeseMomos: 'chickenCheeseMomos',
    vegMomos: 'vegMomos',
    cheeseCornMomos: 'cheeseCornMomos',
    paneerMomos: 'paneerMomos',
    vegKurkureMomos: 'vegKurkure',
    chickenKurkureMomos: 'chickenKurkure'
  };
  const usageByType: any = {};
  dayProduction.forEach((p) => {
    // Regular momos (with dough and stuffing)
    ['chickenMomos', 'chickenCheeseMomos', 'vegMomos', 'cheeseCornMomos', 'paneerMomos'].forEach((field) => {
      const momoData = (p as any)[field];
      if (momoData && momoData.final > 0) {
        const sopKey = fieldMapping[field];
        if (!usageByType[sopKey]) {
          usageByType[sopKey] = { quantity: 0, totalDough: 0, totalStuffing: 0, totalBatter: 0, totalCoating: 0 };
        }
        usageByType[sopKey].quantity += momoData.final;
        usageByType[sopKey].totalDough += momoData.dough || 0;
        usageByType[sopKey].totalStuffing += momoData.stuffing || 0;
      }
    });
    // Kurkure momos (with batter and coating)
    ['vegKurkureMomos', 'chickenKurkureMomos'].forEach((field) => {
      const momoData = (p as any)[field];
      if (momoData && momoData.final > 0) {
        const sopKey = fieldMapping[field];
        if (!usageByType[sopKey]) {
          usageByType[sopKey] = { quantity: 0, totalDough: 0, totalStuffing: 0, totalBatter: 0, totalCoating: 0 };
        }
        usageByType[sopKey].quantity += momoData.final;
        usageByType[sopKey].totalBatter += momoData.batter || 0;
        usageByType[sopKey].totalCoating += momoData.coating || 0;
      }
    });
  });

  const rows = Object.entries(usageByType).map(([momoType, data]: [string, any]) => {
    if (data.quantity === 0) return null;
    // Skip Kurkure momos - SOP compliance not required
    if (momoType === 'vegKurkure' || momoType === 'chickenKurkure') return null;
    // Convert kg to g by multiplying by 1000
    const avgDough = data.quantity > 0 ? (data.totalDough * 1000) / data.quantity : 0;
    const avgStuffing = data.quantity > 0 ? (data.totalStuffing * 1000) / data.quantity : 0;
    const avgBatter = data.quantity > 0 ? (data.totalBatter * 1000) / data.quantity : 0;
    const avgCoating = data.quantity > 0 ? (data.totalCoating * 1000) / data.quantity : 0;
    const sop = sopThresholds[momoType];
    // Diversion percentages
    const doughDiversion = sop.dough > 0 ? ((avgDough - sop.dough) / sop.dough) * 100 : 0;
    const stuffingDiversion = sop.stuffing > 0 ? ((avgStuffing - sop.stuffing) / sop.stuffing) * 100 : 0;
    const batterDiversion = sop.batter > 0 ? ((avgBatter - sop.batter) / sop.batter) * 100 : 0;
    const coatingDiversion = sop.coating > 0 ? ((avgCoating - sop.coating) / sop.coating) * 100 : 0;
    // Dynamic diversion percentage - check BOTH upper and lower bounds
    const minDiversion = 1 - (sopDiversionPercent / 100);
    const maxDiversion = 1 + (sopDiversionPercent / 100);
    const doughCompliance = avgDough >= sop.dough * minDiversion && avgDough <= sop.dough * maxDiversion;
    const stuffingCompliance = avgStuffing >= sop.stuffing * minDiversion && avgStuffing <= sop.stuffing * maxDiversion;
    const batterCompliance = !sop.batter || (avgBatter >= sop.batter * minDiversion && avgBatter <= sop.batter * maxDiversion);
    const coatingCompliance = !sop.coating || (avgCoating >= sop.coating * minDiversion && avgCoating <= sop.coating * maxDiversion);
    const overallCompliance = doughCompliance && stuffingCompliance && batterCompliance && coatingCompliance;
    const parts = [
      { name: 'Dough', avg: avgDough, sop: sop.dough, diversion: doughDiversion, ok: doughCompliance, show: true },
      { name: 'Stuffing', avg: avgStuffing, sop: sop.stuffing, diversion: stuffingDiversion, ok: stuffingCompliance, show: true },
      { name: 'Batter', avg: avgBatter, sop: sop.batter, diversion: batterDiversion, ok: batterCompliance, show: !!sop.batter },
      { name: 'Coating', avg: avgCoating, sop: sop.coating, diversion: coatingDiversion, ok: coatingCompliance, show: !!sop.coating },
    ].filter((x) => x.show);
    return { momoType, name: SOP_NAMES[momoType] === 'Chicken Cheese Momos' ? 'Chicken Cheese' : SOP_NAMES[momoType] === 'Cheese Corn Momos' ? 'Cheese Corn' : SOP_NAMES[momoType], quantity: data.quantity, overallCompliance, parts };
  }).filter(Boolean) as { momoType: string; name: string; quantity: number; overallCompliance: boolean; parts: { name: string; avg: number; sop: number; diversion: number; ok: boolean }[] }[];
  return rows;
}
