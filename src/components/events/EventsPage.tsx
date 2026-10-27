// Events (More → Events): every event this person may see - live and upcoming first, then past -
// with sales and profit; the cluster head creates events here and sets event momo costs. Opening
// an event shows EventDetail in place (or the shell can route to EventDetail itself).
import * as React from 'react';
import { CalendarDays, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../ui/page-header';
import { SegmentedControl } from '../ui/segmented-control';
import { ListGroup, ListRow } from '../ui/list-row';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { SkeletonListRows } from '../ui/skeleton';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Field } from '../ui/field';
import { MoneyInput } from '../ui/money';
import { Input } from '../ui/input';
import { Callout } from '../ui/callout';
import { useT } from '../../utils/i18n';
import type { EventListRow } from '../../utils/eventsApi';
import type { EventMomoKey } from '../../utils/eventRules';
import { MOMO_KEYS, dateRange, momoLabel, useEventsApi, useLoad } from './eventsShared';
import { EventFormSheet } from './EventFormSheet';
import { EventDetail, type EventTab } from './EventDetail';

export function EventsPage({ onBack, initialEventId, initialTab, onOpenEvent }: {
  onBack?: () => void;
  initialEventId?: string | null;
  initialTab?: EventTab;
  // When set, the shell routes to the event itself; otherwise the event opens in place.
  onOpenEvent?: (eventId: string) => void;
}) {
  const { t, lang } = useT();
  const api = useEventsApi();
  const list = useLoad(() => api.list(), []);
  const [view, setView] = React.useState<'current' | 'past'>('current');
  const [creating, setCreating] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(initialEventId || null);

  if (openId) {
    return <EventDetail eventId={openId} initialTab={initialTab} onBack={() => { setOpenId(null); list.reload(); }} />;
  }

  const events = list.data?.events || [];
  const current = events.filter((e) => e.status === 'live' || e.status === 'planned' || e.status === 'ended')
    .sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || a.startDate.localeCompare(b.startDate));
  const past = events.filter((e) => e.status === 'closed');
  const shown = view === 'current' ? current : past;
  const canCreate = !!list.data?.canCreate;
  const open = (id: string) => (onOpenEvent ? onOpenEvent(id) : setOpenId(id));

  const row = (e: EventListRow) => (
    <ListRow
      key={e.id}
      icon={CalendarDays}
      title={e.name}
      subtitle={[dateRange(e.startDate, e.endDate, lang), e.venue, e.status === 'planned' ? null : `Profit ₹${Math.round(e.profit).toLocaleString('en-IN')}`].filter(Boolean).join(' · ')}
      // The group heading says live / upcoming; a closed event's row needs no chip either.
      amount={e.status === 'planned' ? undefined : e.sales}
      trailing={e.status === 'planned' ? <span className="num text-label text-text-2">{`${e.dayCount} days`}</span> : undefined}
      chevron
      onClick={() => open(e.id)}
    />
  );

  return (
    <div className="flex min-h-full flex-col bg-bg text-text" lang={lang}>
      <PageHeader
        title={t('event.events')}
        caption="Stalls at fairs and festivals"
        subtitle="Stalls at fairs and festivals, each with its own stock, cash and P&L"
        onBack={onBack}
        actions={canCreate ? <IconButton label="Event costs" icon={<Settings2 />} onClick={() => setSettingsOpen(true)} /> : undefined}
        primaryAction={canCreate ? <Button leadingIcon={<Plus />} onClick={() => setCreating(true)}>{t('event.new')}</Button> : undefined}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 lg:p-6">
        {canCreate && <Button size="lg" leadingIcon={<Plus />} className="lg:hidden" onClick={() => setCreating(true)}>{t('event.new')}</Button>}
        <SegmentedControl
          aria-label="Which events" value={view}
          onValueChange={setView}
          options={[
            { value: 'current', label: `Live and upcoming${current.length ? ` (${current.length})` : ''}` },
            { value: 'past', label: `Closed${past.length ? ` (${past.length})` : ''}` },
          ]}
        />
        {list.loading && !list.data && <SkeletonListRows count={4} />}
        {list.error && !list.data && <ErrorState body={list.error} onRetry={list.reload} />}
        {list.data && shown.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title={view === 'current' ? 'No events coming up' : 'No closed events yet'}
            body={canCreate ? 'Create an event for a fair or festival stall: its own rent, stock, staff and sales.' : 'Events you are assigned to show here.'}
            action={canCreate && view === 'current' ? <Button leadingIcon={<Plus />} onClick={() => setCreating(true)}>{t('event.new')}</Button> : undefined}
          />
        )}
        {shown.length > 0 && view === 'current' && (
          <>
            {current.some((e) => e.status === 'live') && <ListGroup title={t('event.status.live')}>{current.filter((e) => e.status === 'live').map(row)}</ListGroup>}
            {current.some((e) => e.status === 'ended') && <ListGroup title="Waiting to be closed">{current.filter((e) => e.status === 'ended').map(row)}</ListGroup>}
            {current.some((e) => e.status === 'planned') && <ListGroup title={t('event.status.planned')}>{current.filter((e) => e.status === 'planned').map(row)}</ListGroup>}
          </>
        )}
        {shown.length > 0 && view === 'past' && <ListGroup>{past.map(row)}</ListGroup>}
      </main>

      <EventFormSheet open={creating} onOpenChange={setCreating} onSaved={(ev) => { list.reload(); setOpenId(ev.id); }} />
      {canCreate && <EventCostSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </div>
  );
}

// Momo production cost per piece (what each momo sent to an event costs in its P&L) and the online
// commission %. One setting for every event; an event can override it.
function EventCostSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { lang } = useT();
  const api = useEventsApi();
  const data = useLoad(async () => (open ? api.settings() : null), [open]);
  const [cost, setCost] = React.useState<Partial<Record<EventMomoKey, number | null>>>({});
  const [pct, setPct] = React.useState('0');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (data.data) { setCost({ ...data.data.settings.momoCostPerPiece }); setPct(String(data.data.settings.onlineCommissionPct || 0)); }
  }, [data.data]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const momoCostPerPiece: Partial<Record<EventMomoKey, number>> = {};
      for (const k of MOMO_KEYS) if (cost[k]) momoCostPerPiece[k] = cost[k]!;
      await api.saveSettings({ momoCostPerPiece, onlineCommissionPct: Number(pct) || 0 });
      toast.success('Event costs saved');
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Event costs" description="Used in every event's P&L" footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>Save</Button>}>
      <div className="flex flex-col gap-4">
        {error && <Callout tone="danger" title={error} live />}
        <Callout tone="info" title="Production cost of one momo">Momos sent to an event are charged to it at this cost per piece.</Callout>
        {MOMO_KEYS.map((k) => (
          <Field key={k} label={momoLabel(k, lang)}>
            <MoneyInput value={cost[k] ?? null} decimals={2} onValueChange={(n) => setCost((c) => ({ ...c, [k]: n }))} />
          </Field>
        ))}
        <Field label="Online commission" helper="Only if a stall sells on Zomato / Swiggy">
          <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} trailing={<span className="text-text-3">%</span>} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
