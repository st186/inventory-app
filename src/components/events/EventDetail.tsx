// One event: header with status and dates, and tabs - Overview (P&L), Sales (day closes),
// Stock, Expenses & cash, Equipment, Staff. The cluster head edits, closes and reopens it here.
import * as React from 'react';
import { Lock, MoreVertical, Pencil, RefreshCw, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { IconButton } from '../ui/icon-button';
import { Button } from '../ui/button';
import { ErrorState } from '../ui/error-state';
import { SkeletonStatTiles, SkeletonListRows } from '../ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { confirm } from '../ui/confirm';
import { useT } from '../../utils/i18n';
import type { EventBundle, EventRecord } from '../../utils/eventsApi';
import { eventOutboxEntries, subscribeEventOutbox } from '../../utils/eventOutbox';
import { EventStatusChip, dateRange, dayNumber, localNum, useEventsApi, useLoad } from './eventsShared';
import { EventOverviewTab } from './EventOverviewTab';
import { EventSalesTab } from './EventSalesTab';
import { EventStockTab } from './EventStockTab';
import { EventMoneyTab } from './EventMoneyTab';
import { EventAssetsTab } from './EventAssetsTab';
import { EventStaffTab } from './EventStaffTab';
import { EventFormSheet } from './EventFormSheet';

export type EventTab = 'overview' | 'sales' | 'stock' | 'money' | 'assets' | 'staff';

function useWaiting(eventId: string) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const read = () => setN(eventOutboxEntries().filter((e) => e.eventId === eventId).length);
    read();
    return subscribeEventOutbox(read);
  }, [eventId]);
  return n;
}

export function EventDetail({ eventId, onBack, initialTab }: { eventId: string; onBack?: () => void; initialTab?: EventTab }) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const data = useLoad(() => api.get(eventId), [eventId]);
  const bundle = data.data;
  const waiting = useWaiting(eventId);
  // Staff land on Sales (their day close); managers on the P&L.
  const [tab, setTab] = React.useState<EventTab>(initialTab || 'overview');
  const [chosen, setChosen] = React.useState(!!initialTab);
  React.useEffect(() => {
    if (!chosen && bundle && !bundle.permissions.canRunStock && !bundle.permissions.canManage) setTab('sales');
  }, [bundle, chosen]);
  const [editing, setEditing] = React.useState(false);

  const closeEvent = async (ev: EventRecord) => {
    const ok = await confirm({ title: `Close ${ev.name}?`, body: 'Its figures become read-only and the final P&L is kept.', confirmLabel: 'Close event', tone: 'primary' });
    if (!ok) return;
    try {
      await api.close(ev.id);
      toast.success('Event closed');
      data.reload();
    } catch (e: any) {
      const d = e?.details;
      if (d?.code === 'EVENT_OPEN_ITEMS') {
        const lines = [
          d.assetsOut?.length ? `${d.assetsOut.length} equipment item(s) not returned: ${d.assetsOut.map((a: any) => a.assetName).join(', ')}` : '',
          d.unsubmittedDays?.length ? `${d.unsubmittedDays.length} day close(s) not sent` : '',
          d.inTransit ? `${d.inTransit} delivery still on the way` : '',
          d.momosLeft ? `${d.momosLeft} momos still at the stall - send them back or write them off (Stock, Leftover momos)` : '',
          d.returnsOnTheWay ? `${d.returnsOnTheWay} leftover return(s) not yet counted in by production` : '',
        ].filter(Boolean).join('. ');
        const force = await confirm({ title: 'There are open items', body: `${lines}. Close anyway?`, confirmLabel: 'Close anyway', tone: 'danger' });
        if (!force) return;
        try { await api.close(ev.id, true); toast.success('Event closed'); data.reload(); } catch (e2: any) { toast.error(e2?.message || 'Could not close'); }
      } else toast.error(e?.message || 'Could not close');
    }
  };
  const reopen = async (ev: EventRecord) => {
    const ok = await confirm({ title: `Reopen ${ev.name}?`, body: 'Figures can be changed again until it is closed.', confirmLabel: 'Reopen' });
    if (!ok) return;
    try { await api.reopen(ev.id); toast.success('Event reopened'); data.reload(); } catch (e: any) { toast.error(e?.message || 'Could not reopen'); }
  };

  const ev = bundle?.event;
  const caption = ev ? [dateRange(ev.startDate, ev.endDate, lang), ev.venue].filter(Boolean).join(' · ') : undefined;
  const days = bundle?.days.length || 0;
  const dayN = ev && bundle && ev.status === 'live' ? dayNumber(ev.startDate, bundle.today) : null;

  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      <PageHeader
        title={ev?.name || t('event.event')}
        caption={caption}
        subtitle={caption}
        onBack={onBack}
        actions={(
          <>
            <IconButton label="Refresh" icon={<RefreshCw />} onClick={data.reload} loading={data.loading && !!bundle} />
            {bundle?.permissions.canManage && ev && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton label={t('common.moreActions')} icon={<MoreVertical />} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ev.status !== 'closed' && <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil className="size-4" aria-hidden="true" />Edit event</DropdownMenuItem>}
                  {ev.status !== 'closed' && ev.status !== 'planned' && <DropdownMenuItem onSelect={() => closeEvent(ev)}><Lock className="size-4" aria-hidden="true" />Close event</DropdownMenuItem>}
                  {ev.status === 'closed' && <DropdownMenuItem onSelect={() => reopen(ev)}><Unlock className="size-4" aria-hidden="true" />Reopen</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
        primaryAction={bundle?.permissions.canManage && ev && ev.status !== 'closed' ? <Button variant="secondary" leadingIcon={<Pencil />} onClick={() => setEditing(true)}>Edit event</Button> : undefined}
      >
        {ev && (
          <div className="flex items-center gap-2 px-4 pb-2 lg:px-4">
            <EventStatusChip status={ev.status} size="sm" />
            {dayN && <span className="text-label text-text-2">{t('event.dayOf', { n: localNum(dayN, lang), total: localNum(days, lang) })}</span>}
            {bundle?.permissions.isIncharge && <span className="text-label text-text-3">· {t('event.youIncharge')}</span>}
          </div>
        )}
      </PageHeader>

      {data.error && !bundle && <div className="p-4"><ErrorState body={data.error} onRetry={data.reload} /></div>}
      {!bundle && !data.error && (
        <div className="flex flex-col gap-4 p-4"><SkeletonStatTiles count={4} /><SkeletonListRows count={5} /></div>
      )}

      {bundle && ev && (
        <Tabs value={tab} onValueChange={(v) => { setTab(v as EventTab); setChosen(true); }} className="flex flex-col">
          <TabsList aria-label={t('event.event')} className="sticky top-0 z-(--z-sticky) bg-surface">
            <TabsTrigger value="overview">{t('event.tab.overview')}</TabsTrigger>
            <TabsTrigger value="sales" badge={waiting || undefined}>{t('event.tab.sales')}</TabsTrigger>
            <TabsTrigger value="stock" badge={bundle.requests.filter((r) => r.status === 'shipped' || r.status === 'partially-shipped').length || undefined}>{t('event.tab.stock')}</TabsTrigger>
            <TabsTrigger value="money" badge={bundle.topups.filter((x) => x.status === 'pending').length || undefined}>{t('event.tab.expenses')}</TabsTrigger>
            <TabsTrigger value="assets">{t('event.tab.assets')}</TabsTrigger>
            <TabsTrigger value="staff">{t('event.tab.staff')}</TabsTrigger>
          </TabsList>
          <div className="mx-auto w-full max-w-3xl p-4 lg:p-6">
            <TabsContent value="overview"><EventOverviewTab bundle={bundle} /></TabsContent>
            <TabsContent value="sales"><EventSalesTab bundle={bundle} onChanged={data.reload} waiting={waiting} /></TabsContent>
            <TabsContent value="stock"><EventStockTab bundle={bundle} onChanged={data.reload} /></TabsContent>
            <TabsContent value="money"><EventMoneyTab bundle={bundle} onChanged={data.reload} /></TabsContent>
            <TabsContent value="assets"><EventAssetsTab bundle={bundle} onChanged={data.reload} /></TabsContent>
            <TabsContent value="staff"><EventStaffTab bundle={bundle} /></TabsContent>
          </div>
        </Tabs>
      )}

      {bundle && <EventFormSheet open={editing} onOpenChange={setEditing} event={bundle.event} onSaved={() => data.reload()} />}
    </div>
  );
}

export type { EventBundle };
