// Insights > Events: the business totals across events for the period (GET /events/summary, from
// the Events feature). Same template as the other tabs: profit → sales vs costs by day → the cost
// lines and the events themselves, each event opening its own figures.
import { memo, useMemo, useState } from 'react';
import { CalendarDays, Coins, Home, Package, Percent, Receipt, Soup, Trash2 } from 'lucide-react';
import { ListGroup, ListRow } from '../../ui/list-row';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { StatGrid, StatTile, StatSplit } from '../../ui/stat-tile';
import { StatusChip, type StatusTone } from '../../ui/status-chip';
import { EmptyState } from '../../ui/empty-state';
import { useT } from '../../../utils/i18n';
import type { EventSummary, EventSummaryRow } from '../eventsSummary';
import { CHART_COLORS, ChartCard, ChartEmpty, TrendChart, inr, legendFor, pct, type SeriesSpec } from './shared';

// EventStatus in utils/eventRules.ts: planned | live | ended | closed.
const STATUS_TONE: Record<string, StatusTone> = { live: 'success', planned: 'info', ended: 'warning', closed: 'neutral' };
const shortDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

export const EventsTab = memo(function EventsTab({ summary, periodLabel }: { summary: EventSummary; periodLabel: string }) {
  const { t, lang } = useT();
  const [open, setOpen] = useState<EventSummaryRow | null>(null);
  const chart = useMemo(() => summary.byDate.map((r) => ({ ...r, period: shortDate(r.date) })), [summary.byDate]);
  const series: SeriesSpec[] = [
    { key: 'sales', name: t('insights.sales'), color: CHART_COLORS.primary },
    { key: 'costs', name: t('insights.costs'), color: CHART_COLORS.secondary },
  ];

  if (summary.events.length === 0) {
    return <EmptyState icon={CalendarDays} title={t('insights.noEvents')} body={t('insights.noEventsBody')} />;
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-6" lang={lang}>
      <StatTile
        hero
        label={`${t('insights.eventProfit')} · ${periodLabel}`}
        value={inr(summary.profit)}
        caption={`${pct(summary.profit, summary.sales)} of sales · ${summary.events.length} event${summary.events.length === 1 ? '' : 's'}`}
      />
      <StatGrid columns={4}>
        <StatTile label={t('insights.sales')} value={inr(summary.sales)} />
        <StatTile label={t('insights.costs')} value={inr(summary.costs)} caption={`${pct(summary.costs, summary.sales)} of sales`} />
        <StatTile label="Momos from production" value={inr(summary.momoCost)} caption={`${pct(summary.momoCost, summary.costs)} of costs`} />
        <StatTile label="Stall rent" value={inr(summary.rent)} caption={`${pct(summary.rent, summary.costs)} of costs`} />
      </StatGrid>

      <ChartCard title={t('insights.salesVsCosts')} legend={legendFor(series)}>
        {chart.length === 0 ? <ChartEmpty /> : <TrendChart data={chart} series={series} height={220} ariaLabel={`Event sales ${inr(summary.sales)} and costs ${inr(summary.costs)} by day`} />}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ListGroup title={t('insights.whereMoneyWent')} meta={inr(summary.costs)}>
          <ListRow icon={Soup} title="Momos from production" subtitle="Sent, less those taken back, at the cost per piece" amount={Math.round(summary.momoCost)} />
          {summary.wastage > 0 && <ListRow icon={Trash2} iconTone="danger" title="Momos wasted" subtitle="Written off at the stall" amount={Math.round(summary.wastage)} />}
          <ListRow icon={Package} title="Items from the store" subtitle="Moved to the stall, less what came back" amount={Math.round(summary.itemsCost)} />
          <ListRow icon={Receipt} title="Event expenses" amount={Math.round(summary.expenses)} />
          <ListRow icon={Home} title="Stall rent" subtitle="Agreed rent, a share for each day" amount={Math.round(summary.rent)} />
          {summary.commission > 0 && <ListRow icon={Percent} title={t('insights.commission')} amount={Math.round(summary.commission)} />}
        </ListGroup>

        <ListGroup title={t('insights.events')}>
          {summary.events.map((ev) => (
            <ListRow
              key={ev.id}
              icon={CalendarDays}
              title={ev.name}
              subtitle={`${shortDate(ev.startDate)}${ev.endDate && ev.endDate !== ev.startDate ? ` – ${shortDate(ev.endDate)}` : ''} · sales ${inr(ev.sales)}`}
              chip={ev.status ? <StatusChip tone={STATUS_TONE[ev.status] || 'neutral'}>{ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}</StatusChip> : undefined}
              amount={Math.round(ev.profit)}
              onClick={() => setOpen(ev)}
            />
          ))}
        </ListGroup>
      </div>

      <ResponsiveModal open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} title={open?.name || ''} description={open ? `${shortDate(open.startDate)}${open.endDate && open.endDate !== open.startDate ? ` – ${shortDate(open.endDate)}` : ''} · in ${periodLabel.toLowerCase()}` : undefined}>
        {open && (
          <div className="flex flex-col gap-4">
            <StatTile hero label="Profit" value={inr(open.profit)} caption={`${pct(open.profit, open.sales)} of sales`} />
            <StatSplit items={[{ label: t('insights.sales'), value: inr(open.sales) }, { label: t('insights.costs'), value: inr(open.costs) }]} />
            <p className="flex items-center gap-2 text-body-sm text-text-2">
              <Coins className="size-4 shrink-0" aria-hidden="true" />
              Day closes, stock and staff for this event are on its own page under Events.
            </p>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
});
