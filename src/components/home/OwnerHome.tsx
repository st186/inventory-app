// Home for the owner and - as the "ops" variant - the operations manager (design review d2, d3;
// wireframe Main): the team, sales today, the four tiles (profit with rent and salaries spread
// through the month first), what needs them, today's brief and the next days' forecast.
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarCheck, Camera, ClipboardCheck, Clock3, Factory, IdCard, MessageSquareWarning, PackageCheck, ReceiptText, Scale, Trash2, Truck, Wallet, Wrench,
} from 'lucide-react';
import { ExpenseFlagsSheet, useExpenseFlags } from '../money/ExpenseFlags';
import { ProductionFlagsSheet, useProductionFlags } from '../production/ProductionFlags';
import { RepairAlertsSheet, repairLine, useRepairAlerts } from '../production/RepairAlerts';
import { ExtraHoursSheet, hoursText, useExtraHours } from '../kpi/ExtraHours';
import { alertMeta, alertTitle, useWorkplaceAlerts } from '../workplace/useWorkplaceAlerts';
import { StoreCoverCard, StoreCoverNotice } from '../kpi/StoreCover';
import { OpeningChecklistCard, OpeningOverview } from '../opening/OpeningChecklist';
import { RunningLowCard } from '../supplies/RunningLow';
import { ShoppingCard } from '../supplies/Shopping';
import { ExplainComplaintSheet, useComplaintsToDecide, useComplaintsToExplain } from '../complaints/ExplainComplaint';
import type { Complaint as ComplaintT } from '../complaints/complaintsApi';
import { useShell } from '../shell/ShellContext';
import { formatINR } from '../ui/money';
import { useT } from '../../utils/i18n';
import { useInsightsOverview } from '../insights/useInsightsOverview';
import { DailyBriefCard } from '../insights/DailyBriefCard';
import { ForecastCard } from '../insights/ForecastCard';
import { useProfileCompletion } from '../ProfileCompletionCard';
import { AttentionInbox, type AttentionItem } from './AttentionInbox';
import { SalesTodayHero } from './SalesTodayHero';
import { OwnerKpis } from './OwnerKpis';
import { HomePage, timeOf, useClock, useDateWords, useOpen } from './HomeParts';
import { useOwnerHome } from './useOwnerHome';
import { useFocusProfile } from './HomeShortcuts';
import { TeamLeaveRow } from './TeamLeaveRow';
import { productionApprovalsPending, salesApprovalsPending } from './homeFigures';

export function OwnerHome({ variant = 'owner' }: { variant?: 'owner' | 'ops' }) {
  const { user, context, stores, selectedStoreId, nav, openBunny } = useShell();
  const { t } = useT();
  const words = useDateWords();
  const clock = useClock();
  const { open, has } = useOpen();
  const token = user.accessToken || '';
  const home = useOwnerHome(clock.today);
  const profile = useProfileCompletion(token);
  const focusProfile = useFocusProfile();
  useEffect(() => { if (focusProfile && profile.needed) profile.openSheet(); }, [focusProfile, profile.needed, profile.openSheet]);

  // The same store Insights uses for its brief and forecast ("All stores": the main store).
  const insightsStoreId: string | null = selectedStoreId
    || (user.storeId && String(user.storeId).startsWith('STORE-') ? user.storeId : null)
    || stores.find((s) => s.productionHouseId)?.id || stores[0]?.id || null;
  const overview = useInsightsOverview(insightsStoreId ? token : undefined, insightsStoreId);
  const canManageInsights = nav.perms.isClusterHead || nav.perms.isOperationsManager;
  // The forecast is for one store; it only describes the sales figure when that's the same store.
  const forecastApplies = !!insightsStoreId && (home.scope
    ? home.scope.length === 1 && home.scope[0] === insightsStoreId
    : stores.length === 1 && stores[0].id === insightsStoreId);

  const storeName = (id?: string | null) => stores.find((s) => s.id === id)?.name || '';
  // Expense entries the checks flagged (server expenseReview.ts).
  const expenseFlags = useExpenseFlags(nav.perms.isClusterHead || nav.perms.isOperationsManager, token);
  const [flagsOpen, setFlagsOpen] = useState(false);
  // Production entries the checks flagged (server productionReview.ts).
  const productionFlags = useProductionFlags(nav.perms.isClusterHead || nav.perms.isOperationsManager, token);
  const [productionFlagsOpen, setProductionFlagsOpen] = useState(false);
  // Machines down (server repairs.ts).
  const repairs = useRepairAlerts(nav.perms.isClusterHead || nav.perms.isOperationsManager, token);
  const [repairsOpen, setRepairsOpen] = useState(false);
  // Extra hours waiting for a word (kpi.ts /kpi/extra-hours).
  const extraHours = useExtraHours(nav.perms.isClusterHead || nav.perms.isOperationsManager);
  const [extraOpen, setExtraOpen] = useState(false);
  // Garbage dumps and filth the photo AI found (workplace.ts /workplace/alerts).
  const dirtAlerts = useWorkplaceAlerts(nav.perms.isClusterHead || nav.perms.isOperationsManager);
  // Customer complaints: to decide (owner, operations managers), and to explain if asked.
  const complaintsToDecide = useComplaintsToDecide(nav.perms.isClusterHead || nav.perms.isOperationsManager);
  const complaintsToExplain = useComplaintsToExplain(!nav.perms.isClusterHead);
  const [explaining, setExplaining] = useState<ComplaintT | null>(null);
  const x = home.extras;

  const attention = useMemo(() => {
    const items: AttentionItem[] = [];
    const approver = nav.perms.isClusterHead || nav.perms.isOperationsManager;
    if (approver) {
      const waiting = salesApprovalsPending(context.salesData || []).sort((a, b) => b.date.localeCompare(a.date));
      if (waiting.length) {
        const first = waiting[0] as any;
        const offset = first.requestedOffset ?? first.cashOffset ?? 0;
        items.push({
          key: 'day-close',
          icon: Wallet,
          tone: 'danger',
          rank: 0,
          title: waiting.length === 1 && offset ? t(offset < 0 ? 'home.att.cashShort' : 'home.att.cashOver', { amount: formatINR(Math.abs(Math.round(offset))) }) : t('home.att.dayClose'),
          meta: [storeName(first.storeId), words.short(first.date)].filter(Boolean).join(' · '),
          count: waiting.length,
          onOpen: () => open('money/sales'),
        });
      }
    }
    if (x.stockOuts.length) {
      const first = [...x.stockOuts].sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
      items.push({
        key: 'stock-outs',
        icon: AlertTriangle,
        tone: 'danger',
        rank: 1,
        title: t('home.att.stockOut'),
        meta: x.stockOuts.length === 1
          ? t('home.att.stockOutMeta', { item: first.item, time: timeOf(first.startAt) })
          : t('home.att.stockOutMore', { item: first.item, n: x.stockOuts.length - 1 }),
        count: x.stockOuts.length > 1 ? x.stockOuts.length : undefined,
        onOpen: () => open(has('stock/out-of-stock') ? 'stock/out-of-stock' : 'stock/requests'),
      });
    }
    if (approver && has('stock/production')) {
      const n = productionApprovalsPending(context.productionData || []).length;
      if (n) items.push({ key: 'production', icon: Factory, rank: 2, title: t('home.att.production'), count: n, onOpen: () => open('stock/production') });
    }
    if (variant === 'ops') {
      const todays = (context.productionRequests || []).filter((r) => r.requestDate === clock.today && (!home.scope || home.scope.includes(r.storeId)));
      const packedLike = ['prepared', 'shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
      const waitingRider = (context.productionRequests || []).filter((r) => r.status === 'prepared' && (!home.scope || home.scope.includes(r.storeId)));
      if (waitingRider.length && has('stock/riders')) {
        items.push({ key: 'riders', icon: Truck, tone: 'warning', rank: 3, title: t('home.att.riders'), count: waitingRider.length, onOpen: () => open('stock/riders') });
      }
      if (todays.length && has('stock/requests')) {
        items.push({
          key: 'pipeline',
          icon: PackageCheck,
          rank: 4,
          title: t('home.att.pipeline'),
          meta: t('home.att.pipelineMeta', {
            asked: todays.length,
            packed: todays.filter((r) => packedLike.includes(r.status)).length,
            delivered: todays.filter((r) => r.status === 'delivered' || r.status === 'partially-delivered').length,
          }),
          onOpen: () => open('stock/requests'),
        });
      }
    }
    if (expenseFlags.flags.length) {
      items.push({
        key: 'expense-flags', icon: ReceiptText, tone: 'warning', rank: 2.5,
        title: expenseFlags.flags.length === 1 ? '1 expense entry to check' : `${expenseFlags.flags.length} expense entries to check`,
        meta: expenseFlags.flags.slice(0, 2).map((f) => f.title).join(' · '),
        count: expenseFlags.flags.length,
        onOpen: () => setFlagsOpen(true),
      });
    }
    if (complaintsToExplain.items.length) {
      items.push({
        key: 'complaint-explain', icon: MessageSquareWarning, tone: 'danger', rank: 1.1,
        title: complaintsToExplain.items.length === 1 ? 'Explain a customer complaint' : `Explain ${complaintsToExplain.items.length} customer complaints`,
        meta: `${complaintsToExplain.items[0].orderDate} · ${complaintsToExplain.items[0].ai?.summary || complaintsToExplain.items[0].customerText || 'Customer complaint'}`.slice(0, 90),
        count: complaintsToExplain.items.length,
        onOpen: () => setExplaining(complaintsToExplain.items[0]),
      });
    }
    if (complaintsToDecide.length) {
      items.push({
        key: 'complaints', icon: MessageSquareWarning, tone: 'warning', rank: 1.3,
        title: complaintsToDecide.length === 1 ? '1 customer complaint to decide' : `${complaintsToDecide.length} customer complaints to decide`,
        meta: complaintsToDecide.slice(0, 2).map((c) => c.ai?.summary || c.customerText).filter(Boolean).join(' · ').slice(0, 90),
        count: complaintsToDecide.length,
        onOpen: () => open('complaints'),
      });
    }
    if (dirtAlerts.length) {
      items.push({
        key: 'dirt-alerts', icon: Trash2, tone: 'danger', rank: 1.2,
        title: alertTitle(dirtAlerts), meta: alertMeta(dirtAlerts), count: dirtAlerts.length,
        onOpen: () => open('team/checks'),
      });
    }
    if (repairs.alerts.length) {
      items.push({
        key: 'repairs', icon: Wrench, tone: 'danger', rank: 1.5,
        title: repairs.alerts.length === 1 ? `Machine down: ${repairs.alerts[0].machine}` : `${repairs.alerts.length} machines to repair`,
        meta: repairs.alerts.length === 1 ? repairLine(repairs.alerts[0]) : repairs.alerts.slice(0, 3).map((a) => a.machine).join(' · '),
        count: repairs.alerts.length,
        onOpen: () => setRepairsOpen(true),
      });
    }
    if (extraHours.days.length) {
      items.push({
        key: 'extra-hours', icon: Clock3, tone: 'neutral', rank: 3.5,
        title: extraHours.days.length === 1 ? '1 day of extra hours to confirm' : `${extraHours.days.length} days of extra hours to confirm`,
        meta: extraHours.days.slice(0, 2).map((d) => `${d.name} +${hoursText(d.minutes)}`).join(' · '),
        count: extraHours.days.length,
        onOpen: () => setExtraOpen(true),
      });
    }
    if (productionFlags.flags.length) {
      items.push({
        key: 'production-flags', icon: Factory, tone: 'warning', rank: 2.4,
        title: productionFlags.flags.length === 1 ? '1 production entry to check' : `${productionFlags.flags.length} production entries to check`,
        meta: productionFlags.flags.slice(0, 2).map((f) => f.title).join(' · '),
        count: productionFlags.flags.length,
        onOpen: () => setProductionFlagsOpen(true),
      });
    }
    if (x.recalibrations) items.push({ key: 'recal', icon: Scale, rank: 5, title: t('home.att.recalibration'), count: x.recalibrations, onOpen: () => open('insights') });
    const leavesWaiting = (x.leaves || []).filter((l) => l.status === 'pending').length;
    if (leavesWaiting && has('team/attendance')) {
      items.push({ key: 'leaves', icon: CalendarCheck, rank: 6, title: t('home.att.leaves'), meta: t('home.att.waiting'), count: leavesWaiting, onOpen: () => open('team/attendance') });
    }
    if (x.variablePay?.count) {
      items.push({
        key: 'variable-pay', icon: ClipboardCheck, rank: 7, title: t('home.att.variablePay'),
        meta: t('home.att.variablePayMeta', { month: words.month(`${x.variablePay.month}-01`) }),
        count: x.variablePay.count, onOpen: () => open('team/kpis'),
      });
    }
    if (x.photosToReview.length) {
      items.push({ key: 'photos', icon: Camera, rank: 8, title: t('home.att.photos'), meta: t('home.att.photosMeta'), count: x.photosToReview.length, onOpen: () => open('team/checks') });
    }
    if (profile.needed) {
      items.push({ key: 'profile', icon: IdCard, tone: 'warning', rank: 9, title: t('home.task.profile'), meta: t('home.task.profileMeta'), onOpen: profile.openSheet });
    }
    return items;
  }, [nav.perms, context.salesData, context.productionData, context.productionRequests, x, variant, clock.today, home.scope, profile.needed, profile.openSheet, open, has, t, words, expenseFlags.flags, productionFlags.flags, repairs.alerts, extraHours.days, dirtAlerts, complaintsToDecide, complaintsToExplain.items]);

  const teamPath = has('team/attendance') ? 'team/attendance' : has('team/people') ? 'team/people' : null;

  return (
    <HomePage wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* The team first (owner, 28 Oct 2026): who's in today before the money. */}
        <div className="flex flex-col gap-3 lg:col-span-12">
          {/* Store cover: the operations incharge's own evening at the store, and who covers today. */}
          <StoreCoverCard />
          <StoreCoverNotice />
          {/* The store opening checklist: theirs to tick on a cover day; every store's progress. */}
          <OpeningChecklistCard />
          <OpeningOverview />
          {/* Running low (anyone can flag; the owner hears too). Shopping lists are written by operations
              and bought by the production incharge, so the owner's Home leaves them out (owner, 28 Oct 2026). */}
          <RunningLowCard />
          {variant === 'ops' && <ShoppingCard />}
          <TeamLeaveRow onOpenAttendance={teamPath ? () => open(teamPath) : undefined} />
        </div>
        <div className="lg:col-span-8">
          <SalesTodayHero
            today={clock.today}
            nowMinutes={clock.minutes}
            sales={home.salesToday}
            yesterdaySales={home.salesYesterday}
            overview={overview.data}
            forecastApplies={forecastApplies}
            onOpen={has('money/sales') ? () => open('money/sales') : undefined}
          />
        </div>
        <div className="lg:col-span-4">
          <OwnerKpis
            today={clock.today}
            profit={home.profit}
            onRetryProfit={home.retry}
            spent={home.spentToday}
            cash={home.cash}
            productionCash={home.extras.productionCash}
            paytm={home.paytm}
            canOpenInsights={has('insights')}
            onOpen={(what) => {
              if (what === 'insights') open('insights');
              else if (what === 'expenses') open('money/expenses');
              else if (what === 'paytm') open(has('money/cash') ? 'money/cash' : 'money/sales');
              else open('money/sales');
            }}
          />
        </div>

        <div className="lg:col-span-6">
          <AttentionInbox items={attention} loading={x.loading && attention.length === 0} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-6">
          {insightsStoreId && (
            <DailyBriefCard
              accessToken={token}
              storeId={insightsStoreId}
              canManage={canManageInsights}
              compact
              onAskBunny={nav.chrome.askBunny ? openBunny : undefined}
            />
          )}
        </div>

        {insightsStoreId && (
          <div className="lg:col-span-12">
            <ForecastCard
              compact
              data={overview.data}
              loading={overview.loading}
              error={overview.error}
              onRetry={overview.reload}
              onSeeAll={has('insights') ? () => open('insights', { tab: 'trends' }) : undefined}
            />
          </div>
        )}
      </div>
      {profile.sheet}
      <ExpenseFlagsSheet open={flagsOpen} onOpenChange={setFlagsOpen} flags={expenseFlags.flags} onChanged={expenseFlags.reload} />
      <ProductionFlagsSheet open={productionFlagsOpen} onOpenChange={setProductionFlagsOpen} flags={productionFlags.flags} onChanged={productionFlags.reload} />
      <RepairAlertsSheet open={repairsOpen} onOpenChange={setRepairsOpen} alerts={repairs.alerts} onChanged={repairs.reload} />
      <ExtraHoursSheet open={extraOpen} onOpenChange={setExtraOpen} days={extraHours.days} onChanged={extraHours.reload} />
      <ExplainComplaintSheet complaint={explaining} onClose={() => setExplaining(null)} onDone={complaintsToExplain.reload} />
    </HomePage>
  );
}
