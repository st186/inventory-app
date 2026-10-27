// Everything the exports and report packs read, fetched fresh for each download, plus the
// small lookups (names, scope filters, how a bill was paid) they all share.

import * as api from '../api';
import { getSupabaseClient } from '../supabase/client';
import { getTodayIST } from '../timezone';
import type { PnlData, PnlScope } from '../pnl';
import { recordInScope, employeeInScope, linkedProductionHouseId, isProductionEmployee } from '../pnl';
import type { ReportPeriod } from '../reportPeriods';
import { generatedAtIST } from '../reportPeriods';

export type ReportData = Omit<PnlData, 'stores'> & {
  stores: api.Store[];
  productionHouses: api.ProductionHouse[];
  salaryAdvances: api.SalaryAdvance[];
  topups: api.CashTopupRequest[];
  recalibrations: any[];
  itemSales: api.SalesDataRecord[];
  production: any[];
  productionCash: api.ProductionCashEntry[];
};

export type ReportContext = {
  period: ReportPeriod;
  scope: PnlScope;
  storeId: string | null; // the store in view; null = every store
  productionHouseId: string | null; // its production house; null = every house
  data: ReportData;
  today: string;
  generatedAt: string; // "27 Oct 2026, 3:49 PM IST"
  generatedBy: string;
};

// The signed-in person's token, read at the moment of the export. Holding one from when the
// page opened breaks after an hour, when Supabase rotates it.
export async function freshAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

// Which store and production house a scope choice points at. An incharge's storeId can be their
// production house's id (see entityAccess.ts), so that resolves to the store it supplies.
export function resolveEntities(selectedId: string | null | undefined, stores: { id: string; productionHouseId?: string | null }[]) {
  if (!selectedId) return { storeId: null as string | null, productionHouseId: null as string | null, isHouse: false };
  const store = stores.find((s) => s.id === selectedId);
  if (store) return { storeId: store.id, productionHouseId: store.productionHouseId || null, isHouse: false };
  const supplied = stores.find((s) => s.productionHouseId === selectedId);
  return { storeId: supplied?.id || null, productionHouseId: selectedId, isHouse: true };
}

export async function loadReportData(token: string, opts: { from: string; to: string }): Promise<ReportData> {
  const [
    sales, inventory, overheads, fixedCosts, onlineSales, onlinePayouts, settlements,
    payouts, employees, archived, stores, productionHouses, loans, salaryAdvances, topups,
    recalibrations, itemSales, production,
  ] = await Promise.all([
    api.fetchSalesData(token),
    api.fetchInventory(token),
    api.fetchOverheads(token),
    api.fetchFixedCosts(token),
    api.getOnlineSalesData(token),
    api.getOnlinePayoutData(token),
    api.getAggregatorSettlements(token),
    api.getPayouts(),
    api.getEmployees(),
    // A released employee's salaries still count in the months they worked.
    api.getArchivedEmployees().catch(() => []),
    api.getStores(),
    api.getProductionHouses().catch(() => []),
    api.getOnlineLoans(token).catch(() => []),
    api.getSalaryAdvances().catch(() => []),
    api.fetchCashTopupRequests(token).catch(() => []),
    api.fetchOnlineCashRecalibrations(token).catch(() => []),
    api.getSalesData(token).then((r) => r.data || []).catch(() => []),
    api.fetchProductionData().catch(() => []),
  ]);
  const houseIds = Array.from(new Set([
    ...(productionHouses || []).map((h) => h.id),
    ...(stores || []).map((s) => s.productionHouseId).filter((id): id is string => !!id),
  ]));
  const productionCash = (await Promise.all(
    houseIds.map((id) => api.getProductionCashRange(token, id, opts.from, opts.to).catch(() => []))
  )).flat();
  return {
    sales: sales || [], inventory: inventory || [], overheads: overheads || [], fixedCosts: fixedCosts || [],
    onlineSales: onlineSales || [], onlinePayouts: onlinePayouts || [], settlements: settlements || [],
    payouts: payouts || [], employees: [...(employees || []), ...(archived || [])], stores: stores || [],
    loans: loans || [], productionHouses: productionHouses || [], salaryAdvances: salaryAdvances || [],
    topups: topups || [], recalibrations: recalibrations || [], itemSales: itemSales || [],
    production: production || [], productionCash,
  };
}

export function makeContext(period: ReportPeriod, scope: PnlScope, storeId: string | null, data: ReportData, generatedBy: string): ReportContext {
  return {
    period, scope, storeId,
    productionHouseId: linkedProductionHouseId(storeId, data.stores),
    data, today: getTodayIST(), generatedAt: generatedAtIST(), generatedBy,
  };
}

export const inPeriod = (ctx: ReportContext, d?: string | null) => !!d && d >= ctx.period.start && d <= ctx.period.dataEnd;
export const recordIn = (ctx: ReportContext, x: any) => recordInScope(x, ctx.storeId, ctx.scope, ctx.data.stores);
export const employeeIn = (ctx: ReportContext, e: any) => employeeInScope(e, ctx.storeId, ctx.scope, ctx.data.stores);
export const hasStoreSide = (ctx: ReportContext) => ctx.scope !== 'production';
export const storesInView = (ctx: ReportContext) => ctx.data.stores.filter((s) => !ctx.storeId || s.id === ctx.storeId);

export const storeName = (ctx: ReportContext, id?: string | null) =>
  (id ? ctx.data.stores.find((s) => s.id === id)?.name : '') || id || '';
export const houseName = (ctx: ReportContext, id?: string | null) =>
  (id && ctx.data.productionHouses.find((h) => h.id === id)?.name) || id || 'Production house';
export const entityLabel = (ctx: ReportContext, x: any) =>
  x?.entityType === 'production_house' ? `Production: ${houseName(ctx, x.productionHouseId)}` : `Store: ${storeName(ctx, x?.storeId) || 'unassigned'}`;

export const scopeLabel = (ctx: ReportContext) => {
  const store = ctx.storeId ? storeName(ctx, ctx.storeId) : 'all stores';
  const house = ctx.productionHouseId ? houseName(ctx, ctx.productionHouseId) : 'all production houses';
  if (ctx.scope === 'store') return `Store only (${store})`;
  if (ctx.scope === 'production') return `Production only (${house})`;
  return ctx.storeId ? `Store + production combined (${store} with ${house})` : 'Combined (every store and production house)';
};

export function employeeLookup(ctx: ReportContext) {
  const byId = new Map<string, any>(ctx.data.employees.map((e: any) => [e.id, e]));
  return {
    get: (id?: string) => (id ? byId.get(id) : undefined),
    code: (id?: string) => (id && (byId.get(id)?.employeeId || id)) || '',
    works: (e: any) => (e ? (isProductionEmployee(e, ctx.data.stores) ? 'Production' : 'Store') : ''),
    type: (e: any) => ((e?.type || e?.employmentType) === 'contract' ? 'Contract' : 'Permanent'),
  };
}

// How an expense was paid, split into what came from a till / the bank / the owner's pocket.
const amountOf = (x: any) => Number(x?.totalCost ?? x?.amount ?? 0) || 0;
export const ownerPart = (x: any) => (x?.paymentMethod === 'owner' ? amountOf(x) : 0);
export const onlinePart = (x: any) =>
  x?.paymentMethod === 'online' ? amountOf(x) : x?.paymentMethod === 'both' ? Number(x.onlineAmount) || 0 : 0;
export const cashPart = (x: any) =>
  x?.paymentMethod === 'owner' || x?.paymentMethod === 'online' ? 0 : x?.paymentMethod === 'both' ? Number(x.cashAmount) || 0 : amountOf(x);
export function paidFromLabel(ctx: ReportContext, x: any): string {
  if (x?.paymentMethod === 'owner') return "Owner's own money";
  const fromHouse = x?.paidFromProductionHouseId ? ` (from ${houseName(ctx, x.paidFromProductionHouseId)} cash)` : '';
  if (x?.paymentMethod === 'online') return 'Online / UPI';
  if (x?.paymentMethod === 'both') return `Cash + online${fromHouse}`;
  return `Cash${fromHouse}`;
}

export const enteredBy = (x: any) => x?.createdByName || x?.createdByEmail || x?.createdBy || '';
