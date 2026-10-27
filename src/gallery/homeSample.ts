// Made-up business data for the Home preview (home-preview.html) and the Home number check
// (src/components/home/homeFigures.check.mjs). Dev only - not part of the production build.
// One store with its production house, about two months of days so the loss carry-forward,
// the day-by-day rent and salaries and the spread equipment all have something to work on.
import { addDays } from '../utils/timezone';

const STORE = 'STORE-1';
const HOUSE = 'PH-1';

/** IST wall-clock time on a date as a UTC ISO string ("2026-10-27", "18:30"). */
export const istIso = (date: string, hhmm: string) => new Date(Date.parse(`${date}T${hhmm}:00+05:30`)).toISOString();

export function buildHomeSample(today: string) {
  const month = today.slice(0, 7);
  const prevMonthEnd = addDays(`${month}-01`, -1);
  const prev = prevMonthEnd.slice(0, 7);
  const start = `${prev}-01`;
  // Two months back, so September exists for the loss carry-forward from October.
  const prev2End = addDays(start, -1);
  const prev2Start = `${prev2End.slice(0, 7)}-01`;
  const days: string[] = [];
  for (let d = prev2Start; d <= today; d = addDays(d, 1)) days.push(d);

  const salesData: any[] = [];
  const onlineSalesData: any[] = [];
  const inventory: any[] = [];
  const overheads: any[] = [];
  const fixedCosts: any[] = [];
  days.forEach((date, i) => {
    const wave = 1 + 0.25 * Math.sin(i / 2.3);
    const isToday = date === today;
    const isYesterday = date === addDays(today, -1);
    const offline = Math.round(5200 * wave);
    const cash = Math.round(offline * 0.42);
    salesData.push({
      id: `S-${date}`, date, storeId: STORE,
      offlineSales: isToday ? 6120 : offline, cashAmount: isToday ? 2570 : cash, paytmAmount: isToday ? 3550 : offline - cash, onlineSales: 0,
      employeeSalary: 0, createdBy: isToday ? 'pos-sync' : 'demo-incharge', approvalStatus: isToday || isYesterday ? 'pending' : 'approved',
      actualCashInHand: isToday ? null : cash - 120, cashOffset: isYesterday ? -240 : 0, salesDiscrepancy: isYesterday ? undefined : (i % 9 === 0 ? -150 : 0),
      approvalRequired: isYesterday, approvedBy: isToday || isYesterday ? null : 'owner', approvedAt: null,
      approvalRequested: isYesterday, approvalRequestedAt: isYesterday ? istIso(date, '23:10') : null,
      requestedCashInHand: isYesterday ? cash - 360 : null, requestedOffset: isYesterday ? -240 : null,
      rejectedBy: null, rejectedAt: null, rejectionReason: null, usedOnlineMoney: i % 6 === 0 ? 500 : 0,
      actualPaytmBalance: isToday ? null : 8000 + (i % 11) * 410,
      syncedAt: isToday ? istIso(date, '18:30') : undefined,
    });
    onlineSalesData.push({ id: `O-${date}`, date, storeId: STORE, zomatoSales: isToday ? 2890 : Math.round(2600 * wave), swiggySales: isToday ? 1744 : Math.round(1500 * wave) });
    // Food every day, packaging now and then, a production-house purchase every other day.
    inventory.push({ id: `I-${date}`, date, storeId: STORE, entityType: 'store', category: 'vegetables', itemName: 'Cabbage', quantity: 6, unit: 'kg', costPerUnit: 40, totalCost: isToday ? 860 : 240 + (i % 5) * 30, paymentMethod: 'cash' });
    if (i % 2 === 0) inventory.push({ id: `IP-${date}`, date, productionHouseId: HOUSE, entityType: 'production_house', category: 'chicken', itemName: 'Chicken', quantity: 12, unit: 'kg', costPerUnit: 210, totalCost: 2520, paymentMethod: 'online' });
    if (i % 7 === 3) overheads.push({ id: `OH-${date}`, date, storeId: STORE, entityType: 'store', category: 'transportation', description: 'Auto fare', amount: 180, paymentMethod: 'cash' });
    if (isToday) {
      overheads.push({ id: `OH-T1`, date, storeId: STORE, entityType: 'store', category: 'cleaning', description: 'Phenyl', amount: 120, paymentMethod: 'cash' });
      inventory.push({ id: `I-T2`, date, productionHouseId: HOUSE, entityType: 'production_house', category: 'flour', itemName: 'Maida', quantity: 25, unit: 'kg', costPerUnit: 38, totalCost: 950, paymentMethod: 'cash' });
    }
  });
  // Rent and electricity on the 5th of each month (this month's rent not paid yet if before the 5th).
  for (const ym of [prev2Start.slice(0, 7), prev, month]) {
    const fifth = `${ym}-05`;
    if (fifth > today) continue;
    fixedCosts.push({ id: `RENT-${ym}`, date: fifth, storeId: STORE, entityType: 'store', category: 'rent', amount: 20000, paymentMethod: 'online' });
    fixedCosts.push({ id: `ELEC-${ym}`, date: addDays(fifth, 2) <= today ? addDays(fifth, 2) : fifth, storeId: STORE, entityType: 'store', category: 'electricity', amount: 3400, paymentMethod: 'online' });
  }
  // A fryer bought last month, spread over its life.
  inventory.push({ id: 'FRYER', date: `${prev}-12`, storeId: STORE, entityType: 'store', category: 'equipment', itemName: 'Fryer', quantity: 1, unit: 'pc', costPerUnit: 18000, totalCost: 18000, paymentMethod: 'online' });

  const employees: any[] = [
    { id: 'E-1', employeeId: 'DEMO-21', name: 'Store Incharge Demo', role: 'employee', designation: 'store_incharge', storeId: STORE, employmentType: 'fulltime', status: 'active' },
    { id: 'E-2', employeeId: 'DEMO-41', name: 'Counter Crew Demo', role: 'employee', designation: 'store_ops', storeId: STORE, inchargeId: 'DEMO-21', employmentType: 'fulltime', status: 'active' },
    { id: 'E-3', employeeId: 'DEMO-31', name: 'Kitchen Head Demo', role: 'employee', designation: 'production_incharge', storeId: HOUSE, employmentType: 'fulltime', status: 'active' },
    { id: 'E-4', employeeId: 'DEMO-51', name: 'Kitchen Crew Demo', role: 'employee', designation: 'production_ops', storeId: HOUSE, inchargeId: 'DEMO-31', type: 'contract', status: 'active' },
    { id: 'E-5', employeeId: 'DEMO-61', name: 'Rider Demo', role: 'employee', designation: 'rider', storeId: null, type: 'contract', status: 'active' },
  ];
  const archived: any[] = [
    { id: 'E-9', employeeId: 'DEMO-99', name: 'Former Crew Demo', role: 'employee', designation: 'store_ops', storeId: STORE, employmentType: 'fulltime', status: 'inactive', isActive: false, releasedAt: `${prev}-20` },
  ];
  const payouts: any[] = [];
  for (const ym of [prev2Start.slice(0, 7), prev]) {
    // Salaries go out early the next month (a week after the 28th), never after today.
    const nextWeek = addDays(`${ym}-28`, 7);
    const paidOn = nextWeek <= today ? nextWeek : `${ym}-28`;
    payouts.push({ id: `P1-${ym}`, employeeId: 'E-1', date: paidOn, forMonth: ym, amount: 14000, paidFrom: 'paytm' });
    payouts.push({ id: `P2-${ym}`, employeeId: 'E-2', date: paidOn, forMonth: ym, amount: 9500, variablePay: 500, paidFrom: 'paytm' });
    payouts.push({ id: `P3-${ym}`, employeeId: 'E-3', date: paidOn, forMonth: ym, amount: 15000, paidFrom: 'paytm' });
    payouts.push({ id: `P9-${ym}`, employeeId: 'E-9', date: paidOn, forMonth: ym, amount: 7000, paidFrom: 'cash' });
  }
  // Contract pay through this month (daily wages logged as payouts).
  days.filter((d) => d >= `${month}-01`).forEach((d, i) => {
    if (i % 3 === 0) payouts.push({ id: `PC-${d}`, employeeId: 'E-4', date: d, amount: 1500, paidFrom: 'cash' });
  });
  const loans: any[] = [
    { id: 'L-1', storeId: STORE, loanAmount: 100000, loanDate: `${prev2Start.slice(0, 7)}-10`, status: 'active', interestRate: 1.5 },
  ];
  const productionData: any[] = [
    { id: `PD-${today}`, date: today, productionHouseId: HOUSE, createdBy: 'DEMO-31', approvalStatus: 'pending', approvedBy: null, approvedAt: null,
      chickenMomos: { dough: 0, stuffing: 0, final: 600 }, chickenCheeseMomos: { dough: 0, stuffing: 0, final: 80 }, vegMomos: { dough: 0, stuffing: 0, final: 160 },
      cheeseCornMomos: { dough: 0, stuffing: 0, final: 40 }, paneerMomos: { dough: 0, stuffing: 0, final: 40 }, vegKurkureMomos: { final: 20 }, chickenKurkureMomos: { final: 40 } },
  ];
  const request = (id: string, status: string, extra: Record<string, any> = {}) => ({
    id, requestDate: today, storeId: STORE, storeName: 'Store A', requestedBy: 'DEMO-21', status,
    chickenMomos: 300, chickenCheeseMomos: 40, vegMomos: 100, cheeseCornMomos: 20, paneerMomos: 20, vegKurkureMomos: 0, chickenKurkureMomos: 20,
    createdAt: istIso(today, '08:40'), updatedAt: istIso(today, '14:10'), ...extra,
  });
  const productionRequests: any[] = [
    request('PR-1', 'shipped', { shippedAt: istIso(today, '14:10') }),
    request('PR-2', 'prepared', { preparedAt: istIso(today, '13:30') }),
  ];

  return {
    stores: [{ id: STORE, name: 'Store A', location: 'Demo street', managerId: null, productionHouseId: HOUSE }],
    productionHouses: [{ id: HOUSE, name: 'Production House' }],
    salesData, onlineSalesData, categorySalesData: [] as any[], inventory, overheads, fixedCosts,
    onlinePayoutData: [] as any[], aggregatorSettlements: [] as any[], onlineCashRecalibrations: [] as any[],
    productionData, productionRequests, employees, archived, payouts, loans,
    topups: [{ id: 'T-1', storeId: STORE, date: today, status: 'approved', reason: 'store_inventory', requestedAmount: 500 }] as any[],
  };
}
