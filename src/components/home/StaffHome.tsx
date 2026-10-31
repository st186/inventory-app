// Home of the store incharge and production incharge (either login), and of the operations
// manager, who gets the owner's Home in its "ops" variant (design review d3; wireframe StaffHome):
// the shift card pinned on top, today's checklist in due-time order, alerts, and two figures.
import { useEffect, useMemo, useState } from 'react';
import {
  Camera, ClipboardList, ClipboardPlus, Clock3, Factory, IdCard, PackageCheck, PackageOpen, Receipt, ReceiptText, Trash2, Truck, UserCheck, Wrench,
  MessageSquareWarning, ListChecks,
} from 'lucide-react';
import { getLastRecalibration } from '../../utils/api';
import { ExplainComplaintSheet, useComplaintsToExplain } from '../complaints/ExplainComplaint';
import { StockOutExplainSheet, dayWord, useStockOutsToExplain } from '../stock/StockOutExplain';
import type { Complaint as ComplaintT } from '../complaints/complaintsApi';
import { useShell } from '../shell/ShellContext';
import { Callout } from '../ui/callout';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { Money } from '../ui/money';
import { useT } from '../../utils/i18n';
import { EventHomeCard } from '../events';
import { ShiftClockCard } from '../kpi/ShiftClockCard';
import { useWorkplaceDue } from '../workplace/WorkplaceDueCard';
import { fmt12 } from '../workplace/workplaceUtils';
import { useProfileCompletion } from '../ProfileCompletionCard';
import { housePlan, loadStorePlanData } from '../../utils/requestPlanLoad';
import { getAssignedProductionHouseIds, getAssignedStoreIds } from '../../utils/entityAccess';
import { countedCashInHand, isPlaceholderSale } from '../../utils/paytmRules';
import type { StockOutEntry } from '../../utils/stockOuts';
import { OwnerHome } from './OwnerHome';
import { TodayChecklist, type ChecklistTask } from './TodayChecklist';
import { HomePage, istMinutes, posSyncTimeOf, timeOf, toMinutes, useClock, useDateWords, useFirstPath, useLoad, useOpen } from './HomeParts';
import { useHomeData } from './homeData';
import { useFocusProfile } from './HomeShortcuts';
import { TeamLeaveRow } from './TeamLeaveRow';
import { ExpenseFlagsSheet, useExpenseFlags } from '../money/ExpenseFlags';
import { ProductionFlagsSheet, useProductionFlags } from '../production/ProductionFlags';
import { RepairAlertsSheet, repairLine, useRepairAlerts } from '../production/RepairAlerts';
import { ExtraHoursSheet, hoursText, useExtraHours } from '../kpi/ExtraHours';
import { alertMeta, alertTitle, useWorkplaceAlerts } from '../workplace/useWorkplaceAlerts';
import { StoreCoverCard, StoreCoverNotice } from '../kpi/StoreCover';
import { OpeningChecklistCard } from '../opening/OpeningChecklist';
import { RunningLowCard } from '../supplies/RunningLow';
import { ShoppingCard } from '../supplies/Shopping';
import { istDate, piecesMadeOn, salesForDay, spentOnDay } from './homeFigures';
import { DeliveryChecksCard } from './DeliveryChecks';
import { addDays } from '../../utils/timezone';

const OPEN_REQUEST = ['pending', 'accepted', 'in-preparation'];
const ON_THE_WAY = ['shipped', 'partially-shipped'];

export function StaffHome() {
  const { nav } = useShell();
  if (nav.kind === 'ops') return <OwnerHome variant="ops" />;
  return <InchargeHome />;
}

/** Timesheets waiting for this incharge's team (the same lists Attendance > Approvals reads). */
function useTimesheetsWaiting(enabled: boolean, employeeId: string | null) {
  const data = useHomeData();
  return useLoad(enabled && employeeId ? async () => {
    const team = ((await data.getEmployeesByIncharge(employeeId)) || []).filter((e: any) => e.inchargeId === employeeId);
    const lists = await Promise.all(team.slice(0, 20).map((e: any) => data.getTimesheets(e.employeeId).catch(() => [])));
    return lists.flat().filter((ts: any) => ts.status === 'pending').length;
  } : null, [enabled, employeeId, data]);
}

// The month-end momo count (owner, 29 Oct 2026: due on the month's last day; reminders from 6 PM
// the day before, server send-stock-count-reminders). Shown from 6 PM the day before until it is
// in; the store's latest count is fetched only on those two days.
// `place`: the store, or the production house (owner, 31 Oct 2026: the production house counts too).
function useMonthEndCount(place: string | null, today: string, now: number, token: string, kind: 'store' | 'production_house' = 'store') {
  const nextMonth = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) + 32 * 86400000).toISOString().slice(0, 7);
  const last = new Date(Date.parse(`${nextMonth}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const eve = new Date(Date.parse(`${last}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const show = !!place && (today === last || (today === eve && now >= 18 * 60));
  const [countedAt, setCountedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!show || !place || !token) return;
    let alive = true;
    getLastRecalibration(token, place, kind)
      .then((r: any) => { if (alive) setCountedAt(typeof r?.lastRecalibration === 'string' ? r.lastRecalibration : null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [show, place, token, kind]);
  return { show, isLastDay: today === last, last, done: !!countedAt && countedAt >= `${eve}T18:00` };
}

function InchargeHome() {
  const { user, context, stores, nav, router } = useShell();
  const { t } = useT();
  const words = useDateWords();
  const clock = useClock();
  const { open, has } = useOpen();
  const data = useHomeData();
  const token = user.accessToken || '';
  const isProduction = nav.kind === 'production-incharge';
  const store = !isProduction ? user.storeId || null : null;
  const houseIds = useMemo(() => (isProduction ? getAssignedProductionHouseIds(user as any, context.productionHouses || []) : []), [isProduction, user, context.productionHouses]);
  const suppliedStoreIds = useMemo(() => (isProduction ? getAssignedStoreIds(user as any, stores as any) : []), [isProduction, user, stores]);
  const today = clock.today;
  const now = clock.minutes;
  const monthEnd = useMonthEndCount(isProduction ? houseIds[0] || null : store, today, now, token, isProduction ? 'production_house' : 'store');

  const profile = useProfileCompletion(token);
  const focusProfile = useFocusProfile();
  useEffect(() => { if (focusProfile && profile.needed) profile.openSheet(); }, [focusProfile, profile.needed, profile.openSheet]);
  const photos = useWorkplaceDue();
  const checksPath = useFirstPath('my-checks', 'team/checks');
  const reviewPath = useFirstPath('team/checks', 'my-checks');
  const timesheets = useTimesheetsWaiting(nav.perms.isEmployee && nav.perms.isAnyIncharge, user.employeeId);
  const stockOuts = useLoad(store ? () => data.getStockOuts(token, store, today, today) : null, [store, today, token, data]);
  const wastage = useLoad(store ? () => data.getStockWastageEntry(token, store, today) : null, [store, today, token, data]);
  // Tomorrow's bags for the stores this kitchen supplies (utils/requestPlan.ts, same as the Production page).
  const plan = useLoad(isProduction && suppliedStoreIds.length
    ? async () => {
      const tomorrow = addDays(today, 1);
      const list = await loadStorePlanData(token, suppliedStoreIds, { getOverview: data.getInsightsOverview, items: context.inventoryItems });
      return housePlan(list, tomorrow, tomorrow)[0] || null;
    }
    : null, [isProduction, suppliedStoreIds.join(','), token, data, today]);

  const requests = context.productionRequests || [];
  const mine = requests.filter((r) => (isProduction ? suppliedStoreIds.includes(r.storeId) : r.storeId === store));

  // Expense entries the checks flagged for this incharge's store or kitchen.
  const expenseFlags = useExpenseFlags(true, token);
  const [flagsOpen, setFlagsOpen] = useState(false);
  // Production entries the checks flagged for this incharge's house.
  const productionFlags = useProductionFlags(isProduction, token);
  const [productionFlagsOpen, setProductionFlagsOpen] = useState(false);
  // Machines down at this incharge's place (server repairs.ts).
  const repairs = useRepairAlerts(nav.perms.isAnyIncharge, token);
  const [repairsOpen, setRepairsOpen] = useState(false);
  // Extra hours of this incharge's people waiting for their word.
  const extraHours = useExtraHours(nav.perms.isAnyIncharge);
  const [extraOpen, setExtraOpen] = useState(false);
  // Garbage dumps and filth the photo AI found at this incharge's place.
  const dirtAlerts = useWorkplaceAlerts(nav.perms.isAnyIncharge);
  // Customer complaints the owner asked this person to explain (complaints.ts).
  const complaintsToExplain = useComplaintsToExplain(true);
  const [explaining, setExplaining] = useState<ComplaintT | null>(null);
  // Items switched off on Zomato and Swiggy during the day: the store incharge says why (onlineStock.ts).
  const stockOutsToExplain = useStockOutsToExplain(nav.perms.isStoreIncharge || nav.perms.isStoreInchargeManager, token);
  const [stockOutsOpen, setStockOutsOpen] = useState(false);
  const tasks = useMemo(() => {
    const list: ChecklistTask[] = [];
    if (stockOutsToExplain.waiting.length) {
      const n = stockOutsToExplain.waiting.length;
      list.push({
        key: 'stock-outs-explain', icon: PackageOpen, title: n === 1 ? t('stock.oos.taskOne') : t('stock.oos.taskMany', { n }),
        meta: `${dayWord(stockOutsToExplain.waiting[0].report.date)} · ${stockOutsToExplain.waiting.slice(0, 3).map((w) => w.item.name).join(', ')}`.slice(0, 90),
        status: 'late', count: n, due: 0,
        onOpen: () => setStockOutsOpen(true),
      });
    }
    if (complaintsToExplain.items.length) {
      list.push({
        key: 'complaints', icon: MessageSquareWarning, title: complaintsToExplain.items.length === 1 ? 'Explain a customer complaint' : `Explain ${complaintsToExplain.items.length} customer complaints`,
        meta: `${complaintsToExplain.items[0].orderDate} · ${complaintsToExplain.items[0].ai?.summary || complaintsToExplain.items[0].customerText || 'Customer complaint'}`.slice(0, 90), status: 'late', count: complaintsToExplain.items.length, due: 0,
        onOpen: () => setExplaining(complaintsToExplain.items[0]),
      });
    }

    if (dirtAlerts.length && reviewPath) {
      list.push({
        key: 'dirt-alerts', icon: Trash2, title: alertTitle(dirtAlerts), meta: alertMeta(dirtAlerts), status: 'late', count: dirtAlerts.length, due: 0,
        onOpen: () => open(reviewPath),
      });
    }
    if (extraHours.days.length) {
      list.push({
        key: 'extra-hours', icon: Clock3, title: extraHours.days.length === 1 ? '1 day of extra hours to confirm' : `${extraHours.days.length} days of extra hours to confirm`,
        meta: `${extraHours.days[0].name} +${hoursText(extraHours.days[0].minutes)}`, status: 'late', count: extraHours.days.length, due: 0,
        onOpen: () => setExtraOpen(true),
      });
    }
    if (repairs.alerts.length) {
      list.push({
        key: 'repairs', icon: Wrench, title: repairs.alerts.length === 1 ? `Machine down: ${repairs.alerts[0].machine}` : `${repairs.alerts.length} machines to repair`,
        meta: repairLine(repairs.alerts[0]), status: 'late', count: repairs.alerts.length, due: 0,
        onOpen: () => setRepairsOpen(true),
      });
    }
    if (productionFlags.flags.length) {
      list.push({
        key: 'production-flags', icon: Factory, title: productionFlags.flags.length === 1 ? '1 production entry to check' : `${productionFlags.flags.length} production entries to check`,
        meta: productionFlags.flags[0].title, status: 'late', count: productionFlags.flags.length, due: 0,
        onOpen: () => setProductionFlagsOpen(true),
      });
    }
    if (expenseFlags.flags.length) {
      list.push({
        key: 'expense-flags', icon: ReceiptText, title: expenseFlags.flags.length === 1 ? '1 expense entry to check' : `${expenseFlags.flags.length} expense entries to check`,
        meta: expenseFlags.flags[0].title, status: 'late', count: expenseFlags.flags.length, due: 0,
        onOpen: () => setFlagsOpen(true),
      });
    }
    if (monthEnd.show) {
      list.push({
        key: 'stock-count', icon: ListChecks, title: t('home.task.stockCount'), due: monthEnd.isLastDay ? 1320 : 1439,
        meta: monthEnd.done ? t('home.task.stockCountDone') : monthEnd.isLastDay ? t('home.task.stockCountToday') : t('home.task.stockCountTomorrow'),
        status: monthEnd.done ? 'done' : monthEnd.isLastDay ? (now >= 20 * 60 ? 'late' : 'due') : 'later',
        onOpen: () => open(isProduction ? 'production/requests' : 'stock/requests', { tab: 'count' }),
      });
    }
    if (!isProduction && store) {
      // Each day's request goes the night before, by midnight (owner, 29 Oct 2026). A day that began
      // with no request shows as late until noon, so it can still be sent.
      const tomorrow = addDays(today, 1);
      if (now < 720 && !mine.some((r) => r.requestDate === today)) {
        list.push({
          key: 'stock-request-today', icon: ClipboardPlus, title: t('home.task.stockRequestToday'), due: 0,
          meta: t('home.task.stockRequestMissed'), status: 'late', onOpen: () => open('stock/requests'),
        });
      }
      const sentTomorrow = mine.some((r) => r.requestDate === tomorrow);
      list.push({
        key: 'stock-request', icon: ClipboardPlus, title: t('home.task.stockRequest'), due: 1439,
        meta: sentTomorrow ? t('home.task.stockRequestSent') : t('home.task.stockRequestBy'),
        status: sentTomorrow ? 'done' : 'due',
        onOpen: () => open('stock/requests'),
      });
      const onWay = mine.filter((r) => ON_THE_WAY.includes(r.status)).sort((a, b) => (a.shippedAt || '').localeCompare(b.shippedAt || ''));
      const receivedToday = mine.some((r) => (r.status === 'delivered' || r.status === 'partially-delivered') && istDate(r.deliveredAt) === today);
      list.push({
        key: 'receive', icon: Truck, title: t('home.task.receive'),
        due: onWay[0]?.shippedAt ? istMinutes(onWay[0].shippedAt) : 900,
        meta: onWay.length ? t('home.task.receiveOnWay', { time: timeOf(onWay[0].shippedAt) }) : receivedToday ? t('home.task.receiveDone') : t('home.task.receiveNone'),
        status: onWay.length ? 'due' : receivedToday ? 'done' : 'later',
        onOpen: () => open('stock/requests'),
      });
    }
    if (isProduction) {
      const toPack = mine.filter((r) => OPEN_REQUEST.includes(r.status));
      const todays = mine.filter((r) => r.requestDate === today);
      list.push({
        key: 'to-pack', icon: PackageOpen, title: t('home.task.toPack'), due: 630,
        meta: toPack.length ? t('home.task.toPackBy') : todays.length ? t('home.task.toPackDone') : t('home.task.toPackNone'),
        status: toPack.length ? (now > 630 ? 'late' : 'due') : todays.length ? 'done' : 'later',
        count: toPack.length || undefined,
        onOpen: () => open('production/requests'),
      });
      const pieces = plan.data ? Object.values(plan.data.need).reduce((s, n) => s + n, 0) : 0;
      if (has('production/batches')) {
        list.push({
          key: 'plan', icon: ClipboardList, title: t('home.task.plan'), due: 660, status: 'none',
          meta: pieces ? t('home.task.planMeta', { n: pieces }) : t('home.task.planOpen'),
          onOpen: () => open('production/batches'),
        });
        const logged = (context.productionData || []).some((d) => d.date === today && (!houseIds.length || houseIds.includes((d.productionHouseId || d.storeId) as string)));
        list.push({
          key: 'batches', icon: Factory, title: t('home.task.batches'), due: 720,
          meta: logged ? t('home.task.batchesDone') : t('home.task.batchesMeta'),
          status: logged ? 'done' : now >= 720 ? 'due' : 'later',
          onOpen: () => open('production/batches'),
        });
      }
      const packed = mine.filter((r) => r.status === 'prepared');
      const shippedToday = mine.some((r) => istDate(r.shippedAt) === today);
      list.push({
        key: 'dispatch', icon: PackageCheck, title: t('home.task.dispatch'), due: 780,
        meta: packed.length ? t('home.task.dispatchMeta', { n: packed.length }) : shippedToday ? t('home.task.dispatchDone') : t('home.task.dispatchNone'),
        status: packed.length ? 'due' : shippedToday ? 'done' : 'later',
        onOpen: () => open(has('production/riders') ? 'production/riders' : 'production/requests'),
      });
    }
    if (photos.status && checksPath) {
      list.push({
        key: 'photos', icon: Camera, title: t('home.task.photos'), due: toMinutes(photos.to) || 960,
        meta: photos.status === 'done' ? t('home.task.photosDone', { n: photos.total })
          : photos.status === 'late' ? t('home.task.photosLate', { to: fmt12(photos.to), n: photos.total - photos.sent })
            : photos.status === 'due' ? t('home.task.photosDue', { from: fmt12(photos.from), to: fmt12(photos.to), n: photos.total - photos.sent })
              : t('home.task.photosLater', { from: fmt12(photos.from), n: photos.total - photos.sent }),
        status: photos.status,
        onOpen: () => open(checksPath),
      });
    }
    if (store) {
      const logged = !!wastage.data;
      list.push({
        key: 'wastage', icon: Trash2, title: t('home.task.wastage'), due: 1320,
        meta: logged ? t('home.task.wastageDone') : t('home.task.beforeClose'),
        status: logged ? 'done' : now >= 1260 ? 'due' : 'later',
        onOpen: () => open('stock/requests'),
      });
      const row = (context.salesData || []).find((s) => s.storeId === store && s.date === today);
      const closed = !!row && !isPlaceholderSale(row) && countedCashInHand(row) !== null;
      list.push({
        key: 'close-day', icon: Receipt, title: t('home.task.closeDay'), due: 1350,
        meta: closed ? t('home.task.closeDayDone') : t('home.task.afterClose'),
        status: closed ? 'done' : now >= 1350 ? 'due' : 'later',
        onOpen: () => open('money/sales'),
      });
    }
    if (isProduction && has('production/batches')) {
      list.push({ key: 'prod-wastage', icon: Trash2, title: t('home.task.wastage'), meta: t('home.task.beforeClose'), due: 1320, status: 'none', onOpen: () => open('production/batches') });
    }
    if (has('team/attendance')) {
      const n = timesheets.data;
      list.push({
        key: 'timesheets', icon: UserCheck, title: t('home.task.timesheets'), meta: t('home.task.timesheetsMeta'), due: 1380,
        status: n === null ? 'none' : n > 0 ? 'due' : 'done',
        count: n || undefined,
        onOpen: () => open('team/attendance'),
      });
    }
    if (profile.needed) {
      list.push({ key: 'profile', icon: IdCard, title: t('home.task.profile'), meta: t('home.task.profileMeta'), due: 1439, status: 'due', onOpen: profile.openSheet });
    }
    return list;
  }, [isProduction, store, mine, today, now, t, open, has, plan.data, context.productionData, context.salesData, houseIds, photos, checksPath, wastage.data, timesheets.data, profile.needed, profile.openSheet, expenseFlags.flags, productionFlags.flags, repairs.alerts, extraHours.days, dirtAlerts, reviewPath, complaintsToExplain.items, monthEnd, stockOutsToExplain.waiting]);

  // Alerts: what's out of stock now, and the day close the owner hasn't decided on.
  const outNow: StockOutEntry[] = (stockOuts.data || []).filter((e) => !e.endAt);
  const dayCloseRows = store ? (context.salesData || []).filter((s) => s.storeId === store && s.approvalRequested && !s.approvedBy).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const waitingClose = dayCloseRows.find((s) => !s.rejectedBy);
  const rejectedClose = dayCloseRows.find((s) => s.rejectedBy);

  const salesSoFar = store ? salesForDay({ salesData: context.salesData || [], onlineSalesData: context.onlineSalesData || [], categorySalesData: context.categorySalesData || [] }, today, [store]) : null;
  const spent = store ? spentOnDay({ inventory: context.inventory || [], overheads: context.overheads || [], fixedCosts: context.fixedCosts || [] }, today, store, null).store : null;
  const piecesToday = isProduction ? piecesMadeOn(context.productionData || [], today, houseIds.length ? houseIds : null) : 0;
  const sentToday = mine.filter((r) => istDate(r.shippedAt) === today);
  const deliveredOfSent = sentToday.filter((r) => r.status === 'delivered' || r.status === 'partially-delivered').length;

  return (
    <HomePage>
      {!isProduction && store && <DeliveryChecksCard requests={mine} today={today} />}
      {has('events') && <EventHomeCard onOpen={(id, tab) => router.push('events', tab ? { id, tab } : { id })} />}
      <ShiftClockCard isLead framed={false} />
      <StoreCoverCard />
      <StoreCoverNotice />
      <OpeningChecklistCard />
      <ShoppingCard />
      <RunningLowCard />
      <TeamLeaveRow onOpenAttendance={has('team/attendance') ? () => open('team/attendance') : undefined} />
      <TodayChecklist tasks={tasks} />

      {(outNow.length > 3 ? outNow.slice(0, 2) : outNow).map((e) => (
        <Callout key={e.id} tone="danger" title={t('home.alert.outOfStock', { item: e.item })} onClick={() => open(has('stock/out-of-stock') ? 'stock/out-of-stock' : 'stock/requests')}>
          {[t('home.alert.since', { time: timeOf(e.startAt) }), e.offOnline ? t('home.alert.offOnline') : null].filter(Boolean).join(' · ')}
        </Callout>
      ))}
      {outNow.length > 3 && (
        <Callout tone="danger" title={t('home.att.stockOutMore', { item: outNow[2].item, n: outNow.length - 3 })} onClick={() => open('stock/out-of-stock')} />
      )}
      {rejectedClose && (
        <Callout tone="warning" title={t('home.alert.dayCloseRejected', { date: words.short(rejectedClose.date) })} onClick={() => open('money/sales')}>
          {rejectedClose.rejectionReason || undefined}
        </Callout>
      )}
      {waitingClose && !rejectedClose && (
        <Callout tone="info" title={t('home.alert.dayCloseWaiting', { date: words.short(waitingClose.date) })} onClick={() => open('money/sales')} />
      )}

      <section className="flex flex-col gap-2.5" aria-labelledby="glance-title">
        <h2 id="glance-title" className="text-subtitle font-semibold text-text">{t('home.atAGlance')}</h2>
        {store && salesSoFar && spent ? (
          <StatGrid>
            <StatTile
              label={t('home.salesSoFar')}
              value={<Money value={salesSoFar.total} />}
              caption={salesSoFar.syncedAt ? t('home.posSynced', { time: posSyncTimeOf(salesSoFar.syncedAt) }) : !salesSoFar.hasEntry ? t('home.noSalesYet') : undefined}
              onClick={has('money/sales') ? () => open('money/sales') : undefined}
            />
            <StatTile
              label={t('home.spentToday')}
              value={<Money value={spent.total} />}
              caption={spent.count === 0 ? t('home.noEntries') : spent.count === 1 ? t('home.entry') : t('home.entries', { n: spent.count })}
              onClick={has('money/expenses') ? () => open('money/expenses') : undefined}
            />
          </StatGrid>
        ) : (
          <StatGrid>
            <StatTile
              label={t('home.piecesMade')}
              value={<span className="num">{piecesToday.toLocaleString('en-IN')}</span>}
              onClick={has('production/batches') ? () => open('production/batches') : undefined}
            />
            <StatTile
              label={t('home.requestsSent')}
              value={<span className="num">{sentToday.length}</span>}
              caption={sentToday.length ? t('home.requestsSentMeta', { n: deliveredOfSent }) : undefined}
              onClick={() => open('production/requests')}
            />
          </StatGrid>
        )}
      </section>
      {profile.sheet}
      <ExpenseFlagsSheet open={flagsOpen} onOpenChange={setFlagsOpen} flags={expenseFlags.flags} onChanged={expenseFlags.reload} />
      <ProductionFlagsSheet open={productionFlagsOpen} onOpenChange={setProductionFlagsOpen} flags={productionFlags.flags} onChanged={productionFlags.reload} />
      <RepairAlertsSheet open={repairsOpen} onOpenChange={setRepairsOpen} alerts={repairs.alerts} onChanged={repairs.reload} />
      <ExtraHoursSheet open={extraOpen} onOpenChange={setExtraOpen} days={extraHours.days} onChanged={extraHours.reload} />
      <ExplainComplaintSheet complaint={explaining} onClose={() => setExplaining(null)} onDone={complaintsToExplain.reload} />
      <StockOutExplainSheet open={stockOutsOpen} onOpenChange={setStockOutsOpen} reports={stockOutsToExplain.reports} accessToken={token} onDone={stockOutsToExplain.reload} />
    </HomePage>
  );
}
