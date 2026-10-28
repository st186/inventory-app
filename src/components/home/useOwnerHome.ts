// Everything the owner's and operations manager's Home reads: App's shared data (from the shell)
// plus the few lists Insights and Money > Sales used to fetch on their landing page (payouts,
// staff, loans, cash top-ups, leave), and the small lookups behind "Needs your attention".
// Each request may fail on its own; the tile or row it feeds is then left out or says so.
import { useEffect, useMemo, useState } from 'react';
import type * as api from '../../utils/api';
import type * as kpi from '../kpi/kpiApi';
import type { ReviewItem } from '../workplace/workplaceApi';
import type { StockOutEntry } from '../../utils/stockOuts';
import { getAssignedStoreIds } from '../../utils/entityAccess';
import { addDays } from '../../utils/timezone';
import { useShell } from '../shell/ShellContext';
import { useHomeData } from './homeData';
import {
  ownerMonthProfit, paytmKnownBalance, salesForDay, salesScopeFor, spentOnDay, storeCashToday, type MonthProfit,
} from './homeFigures';

type Settled<T> = { data: T | null; error: string | null; loading: boolean };
const pending = <T,>(): Settled<T> => ({ data: null, error: null, loading: true });

export type OwnerExtras = {
  money: Settled<{ payouts: api.Payout[]; employees: api.Employee[]; loans: api.OnlineLoan[] }>;
  topups: api.CashTopupRequest[];
  leaves: api.LeaveApplication[] | null;
  recalibrations: number | null;
  variablePay: { month: string; count: number } | null;
  stockOuts: StockOutEntry[];
  photosToReview: ReviewItem[];
  /** Production's cash today (counted, else expected) for the scoped stores' production houses; null without one. */
  productionCash: { amount: number; counted: boolean } | null;
  loading: boolean;
};

export function useOwnerHome(today: string) {
  const { user, context, stores, selectedStoreId, nav } = useShell();
  const data = useHomeData();
  const token = user.accessToken || '';
  const perms = nav.perms;
  const [attempt, setAttempt] = useState(0);
  const [extras, setExtras] = useState<OwnerExtras>({
    money: pending(), topups: [], leaves: null, recalibrations: null, variablePay: null, stockOuts: [], photosToReview: [], productionCash: null, loading: true,
  });

  // Sales and cash scope: Money > Sales' store list for this login.
  const scope = useMemo(() => salesScopeFor({
    selectedStoreId,
    isClusterHead: perms.isClusterHead,
    managedStoreIds: context.managedStoreIds,
    assignedStoreIds: getAssignedStoreIds(user as any, stores as any),
  }), [selectedStoreId, perms.isClusterHead, context.managedStoreIds, user, stores]);
  const scopeStoreIds = useMemo(() => scope ?? stores.map((s) => s.id), [scope, stores]);
  const scopeKey = scopeStoreIds.join(',');

  useEffect(() => {
    let cancelled = false;
    const set = (patch: Partial<OwnerExtras>) => { if (!cancelled) setExtras((e) => ({ ...e, ...patch })); };
    setExtras((e) => ({ ...e, money: { ...e.money, loading: true, error: null }, loading: true }));

    const money = Promise.all([
      data.getPayouts(),
      data.getEmployees(),
      data.getArchivedEmployees().catch(() => [] as api.Employee[]),
      data.getOnlineLoans(token),
    ]).then(([payouts, active, archived, loans]) => {
      set({ money: { data: { payouts: payouts || [], employees: [...(active || []), ...(archived || [])], loans: loans || [] }, error: null, loading: false } });
    }).catch((e: any) => set({ money: { data: null, error: e?.message || 'Could not load', loading: false } }));

    const topups = data.fetchCashTopupRequests(token).then((list) => set({ topups: list || [] })).catch(() => undefined);
    const leaves = data.getAllLeaves(token).then((list) => set({ leaves: list || [] })).catch(() => undefined);
    const recal = data.getAllRecalibrationsForApproval(token)
      .then((r: any) => set({ recalibrations: (r?.recalibrations || []).length }))
      .catch(() => undefined);
    // Last month's variable pay is decided in the first ten days of the next month.
    const day = Number(today.slice(8, 10));
    const lastMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    const variable = day <= 10 && nav.destinations['team/kpis']
      ? data.getTeamKpis(lastMonth).then((r: kpi.TeamKpisResponse) => {
        if (!r.canApprove) return;
        set({ variablePay: { month: lastMonth, count: r.people.filter((p) => p.settings.hasVariablePay && !p.approval).length } });
      }).catch(() => undefined)
      : Promise.resolve();
    const stockOuts = Promise.all(scopeStoreIds.map((id) => data.getStockOuts(token, id, today, today).catch(() => [] as StockOutEntry[])))
      .then((lists) => set({ stockOuts: lists.flat().filter((e) => !e.endAt) }));
    const photos = nav.destinations['team/checks']
      ? data.getWorkplaceAccess()
        .then((access) => Promise.all(access.locations.map((loc) => data.getWorkplaceReview(loc.kind, loc.id, today, today).catch(() => null))))
        .then((reviews) => set({ photosToReview: reviews.flatMap((r) => r?.items || []).filter((i) => i.hasPhoto && !i.flag) }))
        .catch(() => undefined)
      : Promise.resolve();

    // The store hands its cash to production every night, so the business's cash sits mostly with
    // production: the same figure Money > Sales' "Right now" adds to the store's (owner, 28 Oct).
    const houseIds = [...new Set(stores.filter((s) => scopeStoreIds.includes(s.id) && s.productionHouseId).map((s) => s.productionHouseId as string))];
    const productionCash = houseIds.length === 0 ? Promise.resolve() : Promise.all(houseIds.map((id) => data.getProductionCashEntry(token, id, today)))
      .then((rows) => set({
        productionCash: {
          amount: rows.reduce((sum, { entry, live }) => sum + (entry?.actualCashInHand ?? entry?.expectedClosingCashInHand ?? live?.expectedClosingCashInHand ?? 0), 0),
          counted: rows.every(({ entry }) => entry?.actualCashInHand !== null && entry?.actualCashInHand !== undefined),
        },
      }))
      .catch(() => undefined);

    Promise.allSettled([money, topups, leaves, recal, variable, stockOuts, photos, productionCash]).then(() => set({ loading: false }));
    return () => { cancelled = true; };
    // Re-read after the top bar's "Refresh" (App bumps dataRefreshedAt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, today, scopeKey, data, attempt, context.dataRefreshedAt]);

  const yesterday = addDays(today, -1);
  const salesData = useMemo(() => ({
    salesData: context.salesData || [], onlineSalesData: context.onlineSalesData || [], categorySalesData: context.categorySalesData || [],
  }), [context.salesData, context.onlineSalesData, context.categorySalesData]);
  const concrete = !!selectedStoreId;
  const salesToday = useMemo(() => salesForDay(salesData, today, scope, concrete), [salesData, today, scope, concrete]);
  const salesYesterday = useMemo(() => salesForDay(salesData, yesterday, scope, concrete), [salesData, yesterday, scope, concrete]);

  // Money > Expenses: the owner's picked store (or everything) and the production house's own.
  const spentToday = useMemo(() => spentOnDay(
    { inventory: context.inventory || [], overheads: context.overheads || [], fixedCosts: context.fixedCosts || [] },
    today,
    selectedStoreId || user.storeId || null,
    context.productionHouses?.[0]?.id || null,
  ), [context.inventory, context.overheads, context.fixedCosts, context.productionHouses, today, selectedStoreId, user.storeId]);

  const cash = useMemo(() => storeCashToday({
    storeIds: scopeStoreIds,
    date: today,
    salesData: context.salesData || [],
    expenses: [...(context.inventory || []), ...(context.overheads || []), ...(context.fixedCosts || [])],
    topups: extras.topups,
  }), [scopeStoreIds, today, context.salesData, context.inventory, context.overheads, context.fixedCosts, extras.topups]);

  const paytm = useMemo(() => paytmKnownBalance(context.salesData || [], scopeStoreIds, today), [context.salesData, scopeStoreIds, today]);

  const profit: Settled<MonthProfit> = useMemo(() => {
    if (!extras.money.data) return { data: null, error: extras.money.error, loading: extras.money.loading };
    return {
      data: ownerMonthProfit({
        today,
        storeId: perms.isClusterHead ? selectedStoreId : null,
        salesData: context.salesData || [],
        inventory: context.inventory || [],
        overheads: context.overheads || [],
        fixedCosts: context.fixedCosts || [],
        onlineSalesData: context.onlineSalesData || [],
        onlinePayoutData: context.onlinePayoutData || [],
        aggregatorSettlements: context.aggregatorSettlements || [],
        stores,
        payouts: extras.money.data.payouts,
        employees: extras.money.data.employees,
        loans: extras.money.data.loans,
      }),
      error: null,
      loading: false,
    };
  }, [extras.money, today, perms.isClusterHead, selectedStoreId, context.salesData, context.inventory, context.overheads, context.fixedCosts, context.onlineSalesData, context.onlinePayoutData, context.aggregatorSettlements, stores]);

  return {
    scope, scopeStoreIds, salesToday, salesYesterday, spentToday, cash, paytm, profit, extras,
    retry: () => setAttempt((n) => n + 1),
  };
}
