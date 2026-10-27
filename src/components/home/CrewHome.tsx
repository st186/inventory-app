// Home of store crew and kitchen crew (design review d3; wireframe CrewHome): the shift card,
// today's few jobs (workplace photos, receiving the delivery and logging out-of-stock items for
// store crew, the profile), and what this month's pay comes to so far. Labels follow the App
// language, which is Bengali for crew unless they change it.
import { useEffect, useMemo } from 'react';
import { AlertTriangle, Camera, IdCard, PackageCheck, Wallet } from 'lucide-react';
import { useShell } from '../shell/ShellContext';
import { ListRow } from '../ui/list-row';
import { Money } from '../ui/money';
import { Skeleton } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import { EventHomeCard } from '../events';
import { ShiftClockCard } from '../kpi/ShiftClockCard';
import { useWorkplaceDue } from '../workplace/WorkplaceDueCard';
import { fmt12 } from '../workplace/workplaceUtils';
import { useProfileCompletion } from '../ProfileCompletionCard';
import { computeMonthlyPay, payoutMonth, personalExpensesForMonth } from '../../utils/payslip';
import { TodayChecklist, type ChecklistTask } from './TodayChecklist';
import { HomePage, toMinutes, useClock, useFirstPath, useLoad, useOpen } from './HomeParts';
import { useHomeData } from './homeData';
import { useFocusProfile } from './HomeShortcuts';

/** This month's net pay so far - the same sum as the current month on the Pay tab (EmployeeDashboard). */
function useMonthPay(employeeId: string | null, month: string, enabled: boolean) {
  const data = useHomeData();
  return useLoad(enabled && employeeId ? async () => {
    const employees = await data.getEmployees();
    const me = employees.find((e) => e.employeeId === employeeId);
    if (!me) return null;
    const payouts = (await data.getPayouts()).filter((p: any) => p.employeeId === me.id);
    const overheads = await data.getOverheads().catch(() => []);
    const mine = (overheads as any[]).filter((o) => o.category === 'personal_expense' && o.employeeId === me.employeeId);
    const monthPayouts = payouts.filter((p: any) => payoutMonth(p) === month);
    return computeMonthlyPay(monthPayouts as any, personalExpensesForMonth(mine, me.employeeId, month)).net;
  } : null, [employeeId, month, enabled, data]);
}

export function CrewHome() {
  const { user, nav, router } = useShell();
  const { t } = useT();
  const clock = useClock();
  const { open, has } = useOpen();
  const token = user.accessToken || '';
  const profile = useProfileCompletion(token);
  const focusProfile = useFocusProfile();
  useEffect(() => { if (focusProfile && profile.needed) profile.openSheet(); }, [focusProfile, profile.needed, profile.openSheet]);
  const photos = useWorkplaceDue();
  const checksPath = useFirstPath('my-checks', 'team/checks');
  const payPath = useFirstPath('pay', 'my-pay');
  const pay = useMonthPay(user.employeeId, clock.today.slice(0, 7), !!payPath);

  const tasks = useMemo(() => {
    const list: ChecklistTask[] = [];
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
    // Store crew receive and count deliveries from 1 Nov (navConfig canReceiveStock).
    if (has('stock/receive')) {
      list.push({ key: 'receive', icon: PackageCheck, title: t('home.task.receive'), meta: t('home.task.receiveCrew'), due: 900, status: 'none', onOpen: () => open('stock/receive') });
    }
    if (nav.perms.canLogStockOuts && has('stock/out-of-stock')) {
      list.push({ key: 'out-of-stock', icon: AlertTriangle, title: t('home.task.outOfStock'), meta: t('home.task.outOfStockMeta'), due: 1300, status: 'none', onOpen: () => open('stock/out-of-stock') });
    }
    if (profile.needed) {
      list.push({ key: 'profile', icon: IdCard, title: t('home.task.profile'), meta: t('home.task.profileMeta'), due: 1439, status: 'due', onOpen: profile.openSheet });
    }
    return list;
  }, [photos, checksPath, has, open, nav.perms.canLogStockOuts, profile.needed, profile.openSheet, t]);

  return (
    <HomePage>
      {has('events') && <EventHomeCard onOpen={(id, tab) => router.push('events', tab ? { id, tab } : { id })} />}
      <ShiftClockCard isLead={false} framed={false} />
      <TodayChecklist title={t('home.todo')} tasks={tasks} loading={!photos.loaded || !profile.loaded} />
      {payPath && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface" data-ai-private>
          <ListRow
            icon={Wallet}
            title={(
              <span className="flex flex-col">
                <span className="text-label font-normal text-text-3">{t('home.payMonth')}</span>
                {pay.loading
                  ? <Skeleton className="my-1 h-6 w-24" />
                  : <span className="text-title font-semibold text-text">{pay.data !== null ? <Money value={pay.data} /> : '–'}</span>}
              </span>
            )}
            subtitle={t('home.payHint')}
            onClick={() => open(payPath)}
          />
        </div>
      )}
      {profile.sheet}
    </HomePage>
  );
}
