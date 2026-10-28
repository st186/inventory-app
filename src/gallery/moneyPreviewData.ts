// Made-up data for the Money preview (money-preview.html). Names, stores and figures are invented.
import type { InventoryContextType } from '../App';
import { addDays, getTodayIST } from '../utils/timezone';

export const TODAY = getTodayIST();
export const YESTERDAY = addDays(TODAY, -1);
const DAY2 = addDays(TODAY, -2);

export const STORES = [
  { id: 'STORE-1', name: 'Store A', location: 'Demo street', managerId: null, productionHouseId: 'PH-1' },
];
export const PRODUCTION_HOUSES = [{ id: 'PH-1', name: 'Kitchen A' }];

let n = 0;
const inv = (date: string, itemName: string, category: string, quantity: number, unit: string, totalCost: number, extra: Record<string, unknown> = {}) => ({
  id: `inv-${++n}`, date, category, itemName, quantity, unit, costPerUnit: Math.round((totalCost / quantity) * 100) / 100, totalCost,
  paymentMethod: 'cash', cashAmount: totalCost, onlineAmount: 0, storeId: 'STORE-1', entityType: 'store', ...extra,
});
const oh = (date: string, description: string, category: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id: `oh-${++n}`, date, category, description, amount, paymentMethod: 'cash', cashAmount: amount, onlineAmount: 0, storeId: 'STORE-1', entityType: 'store', ...extra,
});

// Usual prices: a few older chicken / cabbage purchases so the price check has history.
const history = [5, 6, 7, 8, 9, 10].flatMap((d) => [
  inv(addDays(TODAY, -d), 'Chicken', 'meat', 3, 'kg', 585 + d * 2),
  inv(addDays(TODAY, -d), 'Cabbage', 'fresh_produce', 4, 'bundle', 160),
]);

export const INVENTORY = [
  inv(TODAY, 'Chicken', 'meat', 3, 'kg', 600),
  inv(TODAY, 'Flour (maida)', 'staples', 25, 'kg', 1150, { paymentMethod: 'online', cashAmount: 0, onlineAmount: 1150 }),
  inv(TODAY, 'Cabbage', 'fresh_produce', 4, 'g', 800),
  inv(TODAY, 'Cheese slices', 'dairy', 100, 'pcs', 480, { paymentMethod: 'both', cashAmount: 200, onlineAmount: 280, packageType: 'carton', cartonCount: 5, piecesPerCarton: 20 }),
  inv(TODAY, 'Momo boxes', 'packaging', 200, 'pcs', 900, { entityType: 'production_house', storeId: null, productionHouseId: 'PH-1' }),
  inv(YESTERDAY, 'Chicken', 'meat', 4, 'kg', 780),
  ...history,
];
export const OVERHEADS = [
  oh(TODAY, 'Packaging boxes top-up', 'cleaning_supplies', 520, { paymentMethod: 'online', cashAmount: 0, onlineAmount: 520 }),
  oh(TODAY, 'Rider fuel, production to store', 'fuel', 300),
  oh(TODAY, 'Phenyl and scrubbers', 'cleaning_supplies', 250),
  oh(YESTERDAY, 'Staff lunch', 'lunch', 420),
];
export const FIXED = [
  { id: 'fc-1', date: DAY2, category: 'electricity', description: 'Electricity bill', amount: 3200, paymentMethod: 'online', cashAmount: 0, onlineAmount: 3200, storeId: 'STORE-1', entityType: 'store' },
];

export function salesFor(state: 'notStarted' | 'submitted' | 'approved' | 'rejected') {
  const today: Record<string, unknown> = {
    id: 'sale-today', date: TODAY, storeId: 'STORE-1', offlineSales: 6120, onlineSales: 0, cashAmount: 0, paytmAmount: 0,
    createdBy: 'pos-sync', approvalStatus: 'pending', syncedAt: `${TODAY}T22:34:00.000Z`, eventCashIn: 400,
    offlineDiscount: 120, offlineCancelledAmount: 0, offlineCancelledCount: 0, onlineDiscount: 80,
  };
  if (state !== 'notStarted') {
    Object.assign(today, {
      createdBy: 'DEMO-21', createdByName: 'Store Incharge Demo', cashAmount: 2380, paytmAmount: 3500, actualCashInHand: 2400,
      actualPaytmBalance: 18240, previousCashInHand: 0, usedOnlineMoney: 0, cashOffset: -240, salesDiscrepancy: -240,
      cashOverShortAmount: 240, cashOverShortReason: 'wrong_change',
      approvalStatus: state === 'approved' ? 'approved' : 'pending', approvalRequired: true,
      approvalRequested: state === 'submitted', requestedCashInHand: 2400, requestedOffset: -240,
      approvedBy: state === 'approved' ? 'Owner Demo' : undefined, approvedAt: state === 'approved' ? `${TODAY}T17:20:00.000Z` : undefined,
      rejectedBy: state === 'rejected' ? 'Owner Demo' : undefined, rejectionReason: state === 'rejected' ? 'Count again, the drawer was checked at 11 pm' : undefined,
    });
  }
  return [
    today,
    { id: 'sale-y', date: YESTERDAY, storeId: 'STORE-1', offlineSales: 7210, onlineSales: 0, cashAmount: 3100, paytmAmount: 4110, actualCashInHand: 2950, actualPaytmBalance: 16800, usedOnlineMoney: 800, cashOffset: 0, createdBy: 'DEMO-21', createdByName: 'Store Incharge Demo', approvalStatus: 'approved', approvedBy: 'DEMO-21', syncedAt: `${YESTERDAY}T22:31:00.000Z` },
  ];
}

export const ONLINE_SALES = [
  { id: 'os-1', date: TODAY, storeId: 'STORE-1', zomatoSales: 2890, swiggySales: 1744, createdAt: '' },
  { id: 'os-2', date: YESTERDAY, storeId: 'STORE-1', zomatoSales: 3120, swiggySales: 1610, createdAt: '' },
];

export const TOPUPS = [
  { id: 'TOPUP-000000A1B2C3', date: TODAY, storeId: 'STORE-1', requestedAmount: 1500, reason: 'store_inventory', status: 'pending', requestedByName: 'Store Incharge Demo', requestedByEntityName: 'Store A', requestedByEntityType: 'store', requestDate: `${TODAY}T08:10:00.000Z` },
  { id: 'TOPUP-000000D4E5F6', date: TODAY, storeId: 'STORE-1', requestedAmount: 3000, reason: 'event_cash', note: 'Float for the winter fair stall', status: 'pending', requestedByName: 'Event Lead Demo', requestedByEntityName: 'Winter fair stall', requestedByEntityType: 'store', requestDate: `${TODAY}T09:40:00.000Z` },
  { id: 'TOPUP-000000G7H8I9', date: YESTERDAY, storeId: 'STORE-1', requestedAmount: 800, reason: 'store_inventory', status: 'approved', requestedByName: 'Store Incharge Demo', requestedByEntityName: 'Store A', requestedByEntityType: 'store', requestDate: `${YESTERDAY}T10:00:00.000Z`, approvedAt: `${YESTERDAY}T10:30:00.000Z` },
];

export const LOANS = [
  { id: 'LOAN-1', storeId: 'STORE-1', storeName: 'Store A', loanAmount: 20000, repaidAmount: 5000, loanDate: addDays(TODAY, -20), status: 'active', interestRate: 1.5, repayments: [{ date: addDays(TODAY, -6), amount: 5000 }], createdBy: 'owner@example.test' },
];

export const CUSTOM_ITEMS = [
  { id: 'ci-1', category: 'meat', itemName: 'Chicken', entryType: 'inventory', entity: 'both' },
  { id: 'ci-2', category: 'fresh_produce', itemName: 'Cabbage', entryType: 'inventory', entity: 'production_house' },
  { id: 'ci-3', category: 'beverages', itemName: 'Coke', entryType: 'inventory', entity: 'store' },
];

export function mockContext(user: NonNullable<InventoryContextType['user']>, saleState: Parameters<typeof salesFor>[0]): InventoryContextType {
  const noop = async () => undefined;
  const base: Record<string, unknown> = {
    inventory: INVENTORY, overheads: OVERHEADS, fixedCosts: FIXED, salesData: salesFor(saleState), categorySalesData: [],
    onlineCashRecalibrations: [
      { id: 'rc1', storeId: 'STORE-1', storeName: 'Store A', month: addDays(TODAY, -4).slice(0, 7), date: addDays(TODAY, -4), systemBalance: 24455.9773, actualBalance: 56657.91, difference: 32201.9327, notes: 'Owner count', createdBy: 'owner', createdAt: `${addDays(TODAY, -4)}T07:31:09.440Z` },
      { id: 'rc2', storeId: 'STORE-1', storeName: 'Store A', month: addDays(TODAY, -11).slice(0, 7), date: addDays(TODAY, -11), systemBalance: 5790.29, actualBalance: 5810.19, difference: 19.9, notes: '', createdBy: 'owner', createdAt: `${addDays(TODAY, -11)}T03:10:00.000Z` },
    ], onlineSalesData: ONLINE_SALES, onlinePayoutData: [],
    aggregatorSettlements: [{ id: 'set-1', aggregator: 'zomato', storeId: 'STORE-1', settlementDate: TODAY, netPayout: 2410 }],
    productionData: [], productionHouses: PRODUCTION_HOUSES, stockRequests: [], productionRequests: [], stores: STORES,
    managedStoreIds: ['STORE-1'], managedProductionHouseIds: ['PH-1'], inventoryItems: [], isManager: user.role === 'manager',
    user, dataRefreshedAt: 0, setProductionHouses: () => undefined,
    refreshData: noop,
  };
  return new Proxy(base, { get: (target, key: string) => (key in target ? target[key] : noop) }) as unknown as InventoryContextType;
}

/** Answers the app's API calls from the data above (no network). */
export function installMockFetch() {
  const realFetch = window.fetch.bind(window);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/functions/v1/')) return realFetch(input, init);
    const path = url.split('/make-server-c2dd9b9d')[1] || '';
    const method = (init?.method || 'GET').toUpperCase();
    await new Promise((r) => setTimeout(r, 120));
    if (method !== 'GET') {
      if (path.startsWith('/pos-sync')) return json({ success: false, skipped: true, status: 423, message: 'Ciferon shows unreliable figures between 11:50 PM and 6:10 AM, so syncing is paused then. Please try again after 6:10 AM.' }, 423);
      let body: Record<string, unknown> = {};
      try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { /* form data */ }
      return json({ success: true, item: { ...body, id: `mock-${Date.now()}` } });
    }
    if (path.startsWith('/app-version')) return json({ latestVersion: null, features: [] });
    if (path.startsWith('/payouts')) return json({ payouts: [{ id: 'p-1', date: TODAY, storeId: 'STORE-1', amount: 1200, paidFrom: 'paytm' }] });
    if (path.startsWith('/online-sales')) return json({ sales: ONLINE_SALES });
    if (path.startsWith('/online-payouts')) return json({ payouts: [] });
    if (path.startsWith('/online-loans')) return json({ loans: LOANS });
    if (path.startsWith('/cash-topup-requests')) return json({ requests: TOPUPS });
    if (path.startsWith('/online-cash-recalibration/latest')) return json({ recalibration: null });
    if (path.startsWith('/online-cash-recalibration/history')) return json({ history: [] });
    if (path.startsWith('/custom-items')) return json({ customItems: CUSTOM_ITEMS });
    if (path.startsWith('/custom-categories')) return json({ categories: [] });
    if (path.startsWith('/production-cash')) return json({ entry: null, live: { openingBalance: 2950, productionExpenses: 900, cashTopupCredited: 800, expectedClosingCashInHand: 2850 } });
    if (path.startsWith('/investors')) return json({ investors: [{ id: 'inv-1', name: 'Investor Demo' }] });
    return json({});
  };
}
