// Overview: the event's P&L so far (server-computed), a day-by-day chart, the stall's cash and
// digital account, and what still needs doing.
import * as React from 'react';
import { AlertTriangle, Banknote, Boxes, Package, Receipt, Smartphone, Store, Truck } from 'lucide-react';
import { StatGrid, StatSplit, StatTile } from '../ui/stat-tile';
import { Money, formatCompactINR } from '../ui/money';
import { ListGroup, ListRow } from '../ui/list-row';
import { Callout } from '../ui/callout';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { StatusChip } from '../ui/status-chip';
import { ChartTooltipCard, chartAxisProps, chartGridProps, chartCursor } from '../ui/chart-theme';
import {
  Bar, CartesianGrid, ComposedChart, LazyChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from '../charts/lazyRecharts';
import { useT } from '../../utils/i18n';
import type { EventBundle } from '../../utils/eventsApi';
import { assetsStillOut } from '../../utils/eventRules';
import { momoLabel, shortDate } from './eventsShared';

const CATEGORY_LABEL: Record<string, string> = {
  electricity: 'Electricity', purchase: 'Purchases', transport: 'Transport', staff: 'Staff food / pay',
  marketing: 'Banner / marketing', overhead: 'Other running costs', other: 'Other',
};

export function EventOverviewTab({ bundle }: { bundle: EventBundle }) {
  const { t, lang } = useT();
  const { pnl, event: ev } = bundle;
  const loss = pnl.profit < 0;
  const out = assetsStillOut(bundle.assets);
  const inTransit = bundle.requests.filter((r) => r.status === 'shipped' || r.status === 'partially-shipped').length;
  const pendingTopups = bundle.topups.filter((x) => x.status === 'pending').length;
  const chartData = pnl.days.map((d) => ({ label: shortDate(d.date, lang), Sales: d.sales, Costs: d.costs, Profit: d.cumulativeProfit }));
  const separate = bundle.digitalAccount.mode === 'separate';

  return (
    <div className="flex flex-col gap-5">
      {pnl.warnings.map((w) => <Callout key={w} tone="warning" title={w} />)}
      {(ev.status === 'ended' && (out.length > 0 || inTransit > 0)) && (
        <Callout tone="warning" title="Before closing">
          {[out.length ? `${out.length} equipment item${out.length === 1 ? '' : 's'} still out` : '', inTransit ? `${inTransit} delivery still on the way` : ''].filter(Boolean).join(' · ')}
        </Callout>
      )}

      <StatTile
        hero
        tone={loss ? 'danger' : 'default'}
        label={loss ? 'Loss so far' : 'Profit so far'}
        value={<Money value={pnl.profit} />}
        headerChip={pnl.marginPct !== null ? <StatusChip tone={loss ? 'danger' : 'success'} icon={loss ? AlertTriangle : undefined}>{`${pnl.marginPct}% of sales`}</StatusChip> : undefined}
        caption={ev.status === 'closed' ? 'Final figures' : 'Sales less momos, items from the store, expenses and rent'}
      >
        <StatSplit items={[
          { label: 'Sales', value: <Money value={pnl.sales} /> },
          { label: 'Costs', value: <Money value={pnl.costs} /> },
          { label: 'Momos', value: <span className="num">{pnl.momoPieces.toLocaleString('en-IN')} pcs</span> },
        ]} />
      </StatTile>

      <StatGrid>
        <StatTile label={t('event.cashInHand')} value={<Money value={bundle.cash.inHand} />} caption="Expected from sales, expenses and top-ups" />
        {separate
          ? <StatTile label={bundle.digitalAccount.name} value={<Money value={bundle.digital.balance} />} caption="Separate account balance" />
          : <StatTile label="Digital collections" value={<Money value={pnl.digital} />} caption={`In ${bundle.store?.name || 'the store'}'s Paytm`} />}
        <StatTile label="Cash sales" value={<Money value={pnl.cash} />} />
        <StatTile label={separate ? `${bundle.digitalAccount.name} sales` : 'Paytm sales'} value={<Money value={pnl.digital} />} />
      </StatGrid>

      <Card>
        <CardHeader><CardTitle>Day by day</CardTitle></CardHeader>
        {chartData.some((d) => d.Sales || d.Costs) ? (
          <div aria-label={`Sales ${formatCompactINR(pnl.sales)}, costs ${formatCompactINR(pnl.costs)} over ${pnl.days.length} days`}>
            <div className="mb-2 flex flex-wrap gap-3 text-caption text-text-2">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs bg-chart-1" aria-hidden="true" />Sales</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs bg-chart-5" aria-hidden="true" />Costs</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-chart-2" aria-hidden="true" />Profit so far</span>
            </div>
            <LazyChart height={220}>
              {() => (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid {...chartGridProps} />
                    <XAxis dataKey="label" {...chartAxisProps} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis {...chartAxisProps} tickFormatter={(v: number) => formatCompactINR(v)} width={56} />
                    <Tooltip cursor={chartCursor} content={<ChartTooltipCard money />} />
                    <Bar dataKey="Sales" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="Costs" fill="var(--chart-5)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    <Line dataKey="Profit" stroke="var(--chart-2)" strokeWidth={2} dot={false} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </LazyChart>
          </div>
        ) : (
          <p className="text-body-sm text-text-2">The chart fills in as day closes come in.</p>
        )}
      </Card>

      <ListGroup title="Where the money went">
        <ListRow density="compact" icon={Package} title="Momos from production" subtitle={Object.entries(pnl.momoByType).map(([k, v]) => `${momoLabel(k as any, lang)} ${v?.pieces}`).join(' · ') || 'None sent yet'} amount={pnl.momoCost} />
        <ListRow density="compact" icon={Store} title="Items from the store" subtitle="Sauces, packaging, supplies at cost" amount={pnl.itemsCost} />
        {Object.entries(pnl.expensesByCategory).map(([k, v]) => (
          <ListRow key={k} density="compact" icon={Receipt} title={CATEGORY_LABEL[k] || k} amount={v} />
        ))}
        <ListRow density="compact" icon={Banknote} title="Rent" subtitle={ev.rent.amount ? `${ev.rent.mode === 'per_day' ? `₹${ev.rent.amount.toLocaleString('en-IN')} a day` : 'Total for the event'} · paid ₹${pnl.rentPaid.toLocaleString('en-IN')}` : 'From rent payments'} amount={pnl.rent} />
        {pnl.commission > 0 && <ListRow density="compact" icon={Smartphone} title="Online commission" amount={pnl.commission} />}
        <ListRow density="compact" title="Total costs" trailing={<Money value={pnl.costs} className="text-body-md font-semibold" />} />
      </ListGroup>

      {(out.length > 0 || inTransit > 0 || pendingTopups > 0) && (
        <ListGroup title="Open items">
          {out.length > 0 && <ListRow density="compact" icon={Boxes} title={`${out.length} equipment item${out.length === 1 ? '' : 's'} at the event`} subtitle={out.map((a) => a.assetName).join(', ')} />}
          {inTransit > 0 && <ListRow density="compact" icon={Truck} title={t('event.incoming', { n: inTransit })} />}
          {pendingTopups > 0 && <ListRow density="compact" icon={Banknote} title={`${pendingTopups} cash request${pendingTopups === 1 ? '' : 's'} waiting`} />}
        </ListGroup>
      )}
    </div>
  );
}
