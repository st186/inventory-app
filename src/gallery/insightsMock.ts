// Made-up business data for the dev-only Insights preview (insights-preview.html) and the WP2
// number checks. Two stores and one kitchen, March to today, from a seeded random generator so
// every run gives the same figures. No real names, ids or amounts.
import type { InventoryContextType, InventoryItem, OverheadItem, FixedCostItem, SalesData, ProductionData } from '../App';
import type * as api from '../utils/api';

export type InsightsMock = {
  context: InventoryContextType;
  payouts: api.Payout[];
  employees: api.Employee[];
  loans: api.OnlineLoan[];
  stores: api.Store[];
  orderItemDetail: (from: string, to: string, storeId?: string) => api.OrderItemDetailRecord[];
  productionLedger: (from: string, to: string) => api.ProductionLedgerEntry[];
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
function addDaysISO(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

export const MOCK_STORES = [
  { id: 'STORE-1', name: 'Store A', location: 'Demo street', managerId: null, productionHouseId: 'PH-1', createdBy: 'demo', createdAt: '2026-01-01' },
  { id: 'STORE-2', name: 'Store B', location: 'Demo road', managerId: null, productionHouseId: null, createdBy: 'demo', createdAt: '2026-01-01' },
] as unknown as api.Store[];

const PRODUCTION_HOUSES = [
  {
    id: 'PH-1', name: 'Kitchen One', location: 'Demo lane', productionHeadId: 'EMP-05',
    inventory: { chicken: 900, chickenCheese: 420, veg: 380, cheeseCorn: 260, paneer: 240, vegKurkure: 180, chickenKurkure: 210 },
    createdBy: 'demo', createdAt: '2026-01-01',
  },
] as api.ProductionHouse[];

const EMPLOYEES: api.Employee[] = [
  { id: 'EMP-01', employeeId: 'EMP-01', name: 'Asha Demo', email: 'asha@example.test', role: 'employee', type: 'full_time', storeId: 'STORE-1', designation: 'store_incharge', joiningDate: '2025-06-01' },
  { id: 'EMP-02', employeeId: 'EMP-02', name: 'Bikram Demo', email: 'bikram@example.test', role: 'employee', type: 'full_time', storeId: 'STORE-1', designation: 'store_ops', joiningDate: '2025-07-01' },
  { id: 'EMP-03', employeeId: 'EMP-03', name: 'Chandan Demo', email: 'chandan@example.test', role: 'employee', type: 'contract', employmentType: 'contract', storeId: 'STORE-1', designation: 'store_ops', joiningDate: '2026-02-01' },
  { id: 'EMP-04', employeeId: 'EMP-04', name: 'Dipa Demo', email: 'dipa@example.test', role: 'employee', type: 'full_time', storeId: 'STORE-2', designation: 'store_incharge', joiningDate: '2025-09-01' },
  { id: 'EMP-05', employeeId: 'EMP-05', name: 'Esha Demo', email: 'esha@example.test', role: 'employee', type: 'full_time', storeId: 'PH-1', designation: 'production_incharge', joiningDate: '2025-05-01' },
  { id: 'EMP-06', employeeId: 'EMP-06', name: 'Farhan Demo', email: 'farhan@example.test', role: 'employee', type: 'contract', employmentType: 'contract', storeId: 'PH-1', designation: 'production_ops', joiningDate: '2026-01-15' },
  { id: 'EMP-07', employeeId: 'EMP-07', name: 'Gita Demo', email: 'gita@example.test', role: 'employee', type: 'full_time', storeId: 'STORE-2', designation: 'store_ops', joiningDate: '2026-03-01' },
];
const SALARY: Record<string, number> = { 'EMP-01': 16000, 'EMP-02': 11000, 'EMP-03': 9000, 'EMP-04': 15000, 'EMP-05': 18000, 'EMP-06': 9500, 'EMP-07': 10500 };

const MOMO_NAMES = ['Chicken Momos', 'Chicken Cheese Momos', 'Veg Momos', 'Paneer Momos', 'Corn Cheese Momos', 'Chicken Kurkure Momos', 'Veg Kurkure Momos'] as const;
const MENU = [
  { name: 'Chicken Steamed Momo', rate: 120 }, { name: 'Chicken Fried Momo', rate: 140 }, { name: 'Veg Steamed Momo', rate: 100 },
  { name: 'Paneer Momo', rate: 130 }, { name: 'Chicken Cheese Momo', rate: 160 }, { name: 'Chicken Kurkure Momo', rate: 170 },
  { name: 'Veg Kurkure Momo', rate: 150 }, { name: 'Corn Cheese Momo', rate: 140 }, { name: 'Chicken Thukpa', rate: 150 },
];

export function buildInsightsMock(today: string, start = '2026-03-01'): InsightsMock {
  const r = rng(20261027);
  const days = daysBetween(start, today);
  const sales: SalesData[] = [];
  const onlineSales: api.OnlineSalesEntry[] = [];
  const categorySales: api.SalesDataRecord[] = [];
  const inventory: InventoryItem[] = [];
  const overheads: OverheadItem[] = [];
  const fixedCosts: FixedCostItem[] = [];
  const production: ProductionData[] = [];
  const requests: api.ProductionRequest[] = [];
  const settlements: api.AggregatorSettlement[] = [];
  const payouts: api.Payout[] = [];
  let id = 1;
  const nid = (p: string) => `${p}-${id++}`;

  for (const date of days) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.35 : 1;
    for (const store of MOCK_STORES) {
      const scale = store.id === 'STORE-1' ? 1 : 0.62;
      const offline = Math.round((5200 + r() * 2600) * weekend * scale);
      const cash = Math.round(offline * (0.35 + r() * 0.1));
      const short = r() < 0.08 ? Math.round(80 + r() * 300) : 0;
      const paytm = offline - cash - short;
      const approved = short > 0 && r() < 0.7;
      sales.push({
        id: nid('S'), date, storeId: store.id, offlineSales: offline, paytmAmount: paytm, cashAmount: cash, onlineSales: 0,
        employeeSalary: 0, createdBy: 'demo', approvalStatus: 'approved', actualCashInHand: cash, cashOffset: short ? -short : 0,
        salesDiscrepancy: short ? -short : 0, approvalRequired: short > 0 && !approved, approvedBy: approved ? 'Owner Demo' : null, approvedAt: null,
        approvalRequested: short > 0, approvalRequestedAt: null, requestedCashInHand: null, requestedOffset: null, rejectedBy: null, rejectedAt: null,
        rejectionReason: null, paytmOffset: r() < 0.05 ? -Math.round(50 + r() * 150) : 0, posOfflineSales: offline,
        offlineDiscount: Math.round(offline * 0.03), onlineDiscount: Math.round(offline * 0.05),
        offlineCancelledCount: r() < 0.3 ? 1 : 0, offlineCancelledAmount: r() < 0.3 ? 140 : 0,
        onlineCancelledCount: r() < 0.2 ? 1 : 0, onlineCancelledAmount: r() < 0.2 ? 260 : 0,
        paymentModeBreakdown: { Cash: cash, Paytm: Math.round(paytm * 0.7), PhonePe: Math.round(paytm * 0.2), Card: paytm - Math.round(paytm * 0.7) - Math.round(paytm * 0.2) },
      });
      const zomato = Math.round((1800 + r() * 1400) * weekend * scale);
      const swiggy = Math.round((1100 + r() * 1000) * weekend * scale);
      onlineSales.push({ id: nid('OS'), date, storeId: store.id, zomatoSales: zomato, swiggySales: swiggy, createdAt: date });
      const data: Record<string, number> = {};
      MOMO_NAMES.forEach((n, i) => { data[n] = Math.round((30 - i * 3 + r() * 12) * weekend * scale); });
      categorySales.push({ id: nid('CS'), date, storeId: store.id, data } as unknown as api.SalesDataRecord);

      // Purchases: food every other day, packaging weekly, supplies now and then.
      for (let p = 0; p < 2; p++) {
        const cat = (['meat', 'fresh_produce', 'staples', 'dairy'] as const)[Math.floor(r() * 4)];
        const qty = Math.round((4 + r() * 6) * scale);
        const cpu = cat === 'meat' ? 260 : cat === 'dairy' ? 380 : 70 + Math.round(r() * 40);
        inventory.push({ id: nid('I'), date, category: cat, itemName: cat === 'meat' ? 'Chicken' : cat === 'dairy' ? 'Paneer' : cat === 'staples' ? 'Flour' : 'Cabbage', quantity: qty, unit: 'kg', costPerUnit: cpu, totalCost: qty * cpu, storeId: store.id, entityType: 'store' });
      }
      if (dow === 1) inventory.push({ id: nid('I'), date, category: 'packaging', itemName: 'Boxes', quantity: 200, unit: 'pcs', costPerUnit: 4, totalCost: 800, storeId: store.id, entityType: 'store' });
      if (r() < 0.3) overheads.push({ id: nid('O'), date, category: 'fuel', description: 'Scooter fuel', amount: Math.round(200 + r() * 300), storeId: store.id, entityType: 'store' });
      if (r() < 0.05) overheads.push({ id: nid('O'), date, category: 'repair', description: 'Steamer repair', amount: Math.round(400 + r() * 900), storeId: store.id, entityType: 'store' });
      if (r() < 0.04) overheads.push({ id: nid('O'), date, category: 'marketing', description: 'Flyers', amount: Math.round(500 + r() * 800), storeId: store.id, entityType: 'store' });
      if (r() < 0.6) overheads.push({ id: nid('O'), date, category: 'lunch', description: 'Staff lunch', amount: Math.round(150 + r() * 150), storeId: store.id, entityType: 'store' });
      if (date.endsWith('-05')) {
        fixedCosts.push({ id: nid('F'), date, category: 'rent', description: 'Shop rent', amount: store.id === 'STORE-1' ? 20000 : 12000, userId: 'demo', storeId: store.id, entityType: 'store' });
        fixedCosts.push({ id: nid('F'), date, category: 'electricity', description: 'Electricity bill', amount: Math.round(3500 + r() * 1800), userId: 'demo', storeId: store.id, entityType: 'store' });
        fixedCosts.push({ id: nid('F'), date, category: 'internet_phone', description: 'Wi-Fi', amount: 600, userId: 'demo', storeId: store.id, entityType: 'store' });
      }
      // Requests from the store to the kitchen (Store A only has the kitchen).
      if (store.id === 'STORE-1' && date < today) {
        const created = `${date}T03:${pad(Math.floor(r() * 50))}:00.000Z`;
        requests.push({
          id: nid('PR'), requestDate: date, storeId: store.id, storeName: store.name, requestedBy: 'EMP-01', status: 'delivered',
          chickenMomos: 300, chickenCheeseMomos: 120, vegMomos: 100, cheeseCornMomos: 60, paneerMomos: 60, vegKurkureMomos: 40, chickenKurkureMomos: 50,
          acceptedAt: `${date}T04:10:00.000Z`, preparedAt: `${date}T06:30:00.000Z`, shippedAt: `${date}T07:${pad(Math.floor(r() * 50))}:00.000Z`,
          deliveredAt: `${date}T08:${pad(Math.floor(r() * 50))}:00.000Z`, createdAt: created, updatedAt: created,
        });
      }
    }
    // Kitchen purchases and the day's production.
    if (r() < 0.5) inventory.push({ id: nid('I'), date, category: 'meat', itemName: 'Chicken mince', quantity: 12, unit: 'kg', costPerUnit: 250, totalCost: 3000, entityType: 'production_house', productionHouseId: 'PH-1' });
    if (date.endsWith('-06')) fixedCosts.push({ id: nid('F'), date, category: 'rent', description: 'Kitchen rent', amount: 9000, userId: 'demo', entityType: 'production_house', productionHouseId: 'PH-1' });
    if (date === '2026-07-14') inventory.push({ id: nid('I'), date, category: 'equipment_smallwares', itemName: 'Steamer', quantity: 1, unit: 'pcs', costPerUnit: 18000, totalCost: 18000, storeId: 'STORE-1', entityType: 'store' });
    const m = (base: number) => ({ dough: +(base * 0.03).toFixed(1), stuffing: +(base * 0.035).toFixed(1), final: Math.round(base) });
    const k = (base: number) => ({ batter: +(base * 0.02).toFixed(1), coating: +(base * 0.01).toFixed(1), final: Math.round(base) });
    production.push({
      id: nid('P'), date, productionHouseId: 'PH-1', createdBy: 'EMP-05', approvalStatus: date < today ? 'approved' : 'pending', approvedBy: 'Owner Demo', approvedAt: null,
      chickenMomos: m(300 + r() * 80), chickenCheeseMomos: m(120 + r() * 40), vegMomos: m(100 + r() * 30), cheeseCornMomos: m(60 + r() * 20), paneerMomos: m(60 + r() * 20),
      vegKurkureMomos: k(40 + r() * 15), chickenKurkureMomos: k(50 + r() * 15),
      wastage: { dough: +(r() * 0.6).toFixed(2), stuffing: +(r() * 0.5).toFixed(2), batter: +(r() * 0.2).toFixed(2), coating: +(r() * 0.1).toFixed(2) },
      sauces: { panfriedSauce: 2, chilliChickenSauce: 1.5, spicyKoreanSauce: 1, hotGarlicSauce: 1, tandooriSauce: 0.5, soupPremix: 0.5, greenMayoChutney: 2, spicyRedChutney: 2 },
    });
  }

  // Weekly Zomato / Swiggy settlements (orders Mon-Sun, paid the Wednesday after).
  for (const store of MOCK_STORES) {
    for (let monday = '2026-03-02'; addDaysISO(monday, 6) < today; monday = addDaysISO(monday, 7)) {
      const sunday = addDaysISO(monday, 6);
      for (const aggregator of ['zomato', 'swiggy'] as const) {
        const gross = onlineSales.filter((s) => s.storeId === store.id && s.date >= monday && s.date <= sunday)
          .reduce((sum, s) => sum + (aggregator === 'zomato' ? s.zomatoSales : s.swiggySales), 0);
        const commission = Math.round(gross * (aggregator === 'zomato' ? 0.24 : 0.22));
        const ads = Math.round(gross * 0.04);
        settlements.push({
          id: nid('AS'), storeId: store.id, storeName: store.name, aggregator, settlementDate: addDaysISO(sunday, 3), periodStart: monday, periodEnd: sunday,
          bankUTR: `UTR${id}`, grossSales: gross, netPayout: gross - commission - ads, netCommission: commission, orderCount: Math.round(gross / 320), orders: [],
          adSpend: ads, sourceFileName: 'demo.xlsx', uploadedBy: 'demo', uploadedAt: sunday,
        });
      }
    }
  }

  // Salaries: paid on the 3rd for the month before (variable pay now and then).
  for (let month = '2026-03'; month <= today.slice(0, 7); ) {
    const payDay = `${month}-03`;
    if (payDay <= today) {
      const forMonth = (() => { const [y, mm] = month.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 2, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; })();
      for (const e of EMPLOYEES) {
        if ((e.joiningDate || '') > payDay) continue;
        const variable = e.type === 'contract' ? 0 : Math.round(r() * 1500);
        payouts.push({ id: nid('PAY'), employeeId: e.id!, employeeName: e.name, date: payDay, amount: SALARY[e.id!] + variable, forMonth, variablePay: variable || undefined, paidFrom: 'bank' });
      }
    }
    const [y, mm] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y, mm, 1));
    month = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
  }
  overheads.push({ id: nid('O'), date: `${today.slice(0, 7)}-02`, category: 'personal_expense', description: 'Salary advance', amount: 2000, storeId: 'STORE-1', employeeId: 'EMP-02', employeeName: 'Bikram Demo', expenseMonth: today.slice(0, 7) });

  const loans: api.OnlineLoan[] = [
    { id: 'LOAN-1', storeId: 'STORE-1', storeName: 'Store A', loanAmount: 50000, loanDate: '2026-06-10', status: 'active', repaidAmount: 0, repaymentDate: null, notes: '', createdBy: 'demo', createdAt: '2026-06-10', interestRate: 1.5, investorName: 'Demo Investor' },
  ];

  const inventoryItems = MOMO_NAMES.map((n, i) => ({
    id: `II-${i}`, name: n.toLowerCase().replace(/ /g, '_').replace(/s$/, ''), displayName: n.replace(/s$/, ''), category: 'finished_product', unit: 'pcs',
    linkedEntityType: 'global', createdBy: 'demo', createdAt: '2026-01-01', isActive: true,
  })) as api.DynamicInventoryItem[];

  const noop = async () => undefined;
  const context = {
    inventory, overheads, fixedCosts, salesData: sales, categorySalesData: categorySales, onlineCashRecalibrations: [],
    onlineSalesData: onlineSales, onlinePayoutData: [], aggregatorSettlements: settlements, productionData: production,
    productionHouses: PRODUCTION_HOUSES, stockRequests: [], productionRequests: requests, stores: MOCK_STORES, inventoryItems,
    loadInventoryItems: noop, addInventoryItem: noop, addOverheadItem: noop, addFixedCostItem: noop, updateInventoryItem: noop,
    updateOverheadItem: noop, updateFixedCostItem: noop, deleteInventoryItem: noop, deleteOverheadItem: noop, deleteFixedCostItem: noop,
    addSalesData: noop, updateSalesData: noop, approveSalesData: noop, requestSalesApproval: noop, approveDiscrepancy: noop,
    rejectDiscrepancy: noop, addProductionData: noop, updateProductionData: noop, approveProductionData: noop, addProductionHouse: noop,
    updateProductionHouse: noop, updateProductionHouseInventory: noop, deleteProductionHouse: noop, setProductionHouses: () => undefined,
    createStockRequest: noop, fulfillStockRequest: noop, cancelStockRequest: noop, isManager: true,
    user: { email: 'owner@example.test', name: 'Owner Demo', role: 'cluster_head', employeeId: 'DEMO-01', accessToken: 'preview', storeId: null, designation: null, assignedStoreIds: [], assignedProductionHouseIds: [] },
    refreshData: noop, dataRefreshedAt: 0,
  } as unknown as InventoryContextType;

  const orderItemDetail = (from: string, to: string, storeId?: string): api.OrderItemDetailRecord[] => {
    const rr = rng(Number(from.replace(/-/g, '')) + (storeId ? 7 : 0));
    const out: api.OrderItemDetailRecord[] = [];
    for (const date of daysBetween(from, to > today ? today : to)) {
      for (const store of MOCK_STORES) {
        if (storeId && store.id !== storeId) continue;
        const orders: api.OrderItemDetailOrder[] = [];
        const n = Math.round(18 + rr() * 14);
        for (let i = 0; i < n; i++) {
          const online = rr() < 0.35;
          const items = Array.from({ length: 1 + Math.floor(rr() * 3) }, () => {
            const it = MENU[Math.floor(rr() * MENU.length)];
            const quantity = 1 + Math.floor(rr() * 2);
            return { productId: null, productName: it.name, category: 'Momos', quantity, rate: it.rate, total: quantity * it.rate };
          });
          const subtotal = items.reduce((s, x) => s + x.total, 0);
          const discount = rr() < 0.2 ? Math.round(subtotal * 0.1) : 0;
          orders.push({
            orderId: `${date}-${store.id}-${i}`, externalId: online ? `EXT${i}` : null, paymentMode: online ? (rr() < 0.6 ? 'Zomato' : 'Swiggy') : rr() < 0.4 ? 'Cash' : 'Paytm',
            grandTotal: subtotal - discount, subtotal, discount, items, orderHourIST: 15 + Math.floor(rr() * 8),
            orderType: online ? 'HomeDelivery' : rr() < 0.5 ? 'DineIn' : 'TakeAway',
          });
        }
        out.push({ storeId: store.id, date, orders, syncedAt: `${date}T23:00:00.000Z` });
      }
    }
    return out;
  };

  const productionLedger = (from: string, to: string): api.ProductionLedgerEntry[] =>
    daysBetween(from, to > today ? today : to).map((date, i) => ({
      id: `PL-${date}`, productionHouseId: 'PH-1', date, closed: date < today, createdBy: 'demo', createdByName: 'Esha Demo', createdAt: date, updatedAt: date,
      pools: {
        chicken_dough: { opening: 4 + (i % 3), prepared: 9, used: 9.5 + (i % 2) * 0.4, closing: 3.5 + (i % 3), wastage: 0.2 },
        chicken_stuffing: { opening: 3, prepared: 10, used: 10.2, closing: 2.8, wastage: 0.1 },
      } as unknown as api.ProductionLedgerEntry['pools'],
    }));

  return { context, payouts, employees: EMPLOYEES, loans, stores: MOCK_STORES, orderItemDetail, productionLedger };
}
