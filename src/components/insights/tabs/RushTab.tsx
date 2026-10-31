// Insights > Rush hours (owner, 1 Nov 2026: "which time of the day we have the most running orders,
// demand of certain momos during rush hours, defining rush hours and predicting future rush hours and
// i want steam momos to be served within 2 minutes of order ... at the right time if we get the insight
// we can plan better"). Everything comes from GET /insights/rush (server rushInsights.ts): the last
// 12 weeks of bills by 15 minutes, the rush windows, what sells in them, the next 7 days and the
// steamer plan; plus the live-orders looks for orders open at once.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, Settings2, Soup, Timer } from 'lucide-react';
import * as api from '../../../utils/api';
import { useRefreshSignal } from '../../shell/refreshSignal';
import { Button } from '../../ui/button';
import { ChoiceChips } from '../../ui/chip';
import { EmptyState } from '../../ui/empty-state';
import { ErrorState } from '../../ui/error-state';
import { NumberStepper } from '../../ui/number-stepper';
import { ResponsiveModal } from '../../ui/responsive-modal';
import { SkeletonChart, SkeletonStatTiles } from '../../ui/skeleton';
import { StatGrid, StatTile } from '../../ui/stat-tile';
import { StatusChip } from '../../ui/status-chip';
import { toast } from '../../ui/sonner';
import { CHANNEL_COLORS } from '../../ui/chart-theme';
import { type AnalyticsData } from '../useAnalyticsData';
import { CHART_COLORS, CHART_SERIES, ChartCard, FigureRow, TrendChart, legendFor } from './shared';

const FILLINGS: api.RushFilling[] = ['chicken', 'veg', 'chicken_cheese', 'paneer', 'corn_cheese'];
const FILLING_WORD: Record<api.RushFilling, string> = { chicken: 'Chicken', chicken_cheese: 'Chicken cheese', veg: 'Veg', paneer: 'Paneer', corn_cheese: 'Corn cheese' };
const STYLE_WORD: Record<string, string> = {
  steamed: 'Steamed', pan_fried: 'Pan fried', afghani: 'Afghani', makhni: 'Butter makhni', fried: 'Fried', kurkure: 'Kurkure',
  peri_peri: 'Peri peri', chilli: 'Chilli', korean: 'Korean', garlic: 'Hot garlic', other: 'Other',
};
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "19:15" -> "7:15 PM" */
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const shortClock = (hhmm: string) => clock(hhmm).replace(':00', '').replace(' PM', 'pm').replace(' AM', 'am');
const windowWords = (w: api.RushWindow) => `${clock(w.from)}–${clock(w.to)}`;
const one = (x: number) => (Math.round(x * 10) / 10).toString();

function useRush(storeId: string | null, date: string | undefined, token?: string) {
  const [data, setData] = useState<api.RushInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.getRushInsights(storeId, date, token).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, [storeId, date, token]);
  useEffect(() => { load(); }, [load]);
  useRefreshSignal(load);
  return { data, error, reload: load };
}

export function RushTab({ d }: { d: AnalyticsData }) {
  const token = d.context.user?.accessToken;
  const canSet = !!(d.isClusterHead || d.isOperationsManager);
  const [date, setDate] = useState<string | undefined>(undefined);
  const { data, error, reload } = useRush(d.effectiveStoreId || null, date, token);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (error) return <ErrorState title="Couldn't load the rush hours" body={error} onRetry={reload} />;
  if (!data) return <div className="flex flex-col gap-4"><SkeletonStatTiles count={4} /><SkeletonChart /></div>;
  if (!data.days) return <EmptyState icon={Flame} title="No orders to look at yet" body="Once the POS has synced a few weeks of bills for this store, the rush hours show here." />;

  const day = data.forecast.find((f) => f.date === data.plan.date) || data.forecast[0];
  const shownWeekday = weekday ?? day.weekday;
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <Summary data={data} />
      <DayPicker data={data} value={data.plan.date} onChange={(v) => { setDate(v); setWeekday(null); }} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <RushDayCard data={data} day={day} />
        <SteamerCard data={data} canSet={canSet} onSettings={() => setSettingsOpen(true)} />
      </div>
      <Heatmap data={data} selected={shownWeekday} onSelect={setWeekday} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <RushWindowsCard data={data} />
        <MixCard data={data} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ChannelsCard data={data} weekday={shownWeekday} />
        <OpenAtOnceCard data={data} />
      </div>
      <p className="text-label text-text-3">
        {data.orders.toLocaleString('en-IN')} orders from the last {data.weeks} weeks ({data.days} open days) at {data.storeName}.{' '}
        {data.exactShare >= 0.9 ? 'Times are to the minute.' : `${Math.round(data.exactShare * 100)}% of orders have the exact minute; the rest count from the middle of their hour, so 15-minute detail sharpens as the minutes fill in.`}{' '}
        Steamer dishes: {data.steamerStyles.map((s) => STYLE_WORD[s] || s).join(', ').toLowerCase()}. Pan fried, butter makhni, chilli, Korean, hot garlic, peri peri, fried and kurkure are fried, so they're left out.
      </p>
      {canSet && <SteamerSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} storeId={data.storeId} settings={data.plan.settings} token={token} onSaved={reload} />}
    </div>
  );
}

function Summary({ data }: { data: api.RushInsights }) {
  const busiest = [...data.profiles].filter((p) => p.days).sort((a, b) => b.ordersPerDay - a.ordersPerDay)[0];
  let peak = { weekday: 0, slot: 0, value: 0 };
  for (const p of data.profiles) p.orders.forEach((v, i) => { if (v > peak.value) peak = { weekday: p.weekday, slot: i, value: v }; });
  const today = data.forecast[0];
  const perDay = data.profiles.filter((p) => p.days);
  const avg = perDay.length ? perDay.reduce((s, p) => s + p.ordersPerDay * p.days, 0) / perDay.reduce((s, p) => s + p.days, 0) : 0;
  return (
    <StatGrid columns={4}>
      <StatTile label="Orders a day" value={Math.round(avg)} caption={`last ${data.weeks} weeks`} />
      <StatTile label="Busiest day" value={busiest ? DAY[busiest.weekday] : '–'} caption={busiest ? `${Math.round(busiest.ordersPerDay)} orders on average` : undefined} />
      <StatTile label="Busiest 15 minutes" value={peak.value ? `${DAY[peak.weekday].slice(0, 3)} ${clock(data.slots[peak.slot])}` : '–'} caption={peak.value ? `${one(peak.value)} orders on average` : undefined} />
      <StatTile label="Rush today" value={today.rush.length ? windowWords(today.rush[0]) : 'No clear rush'} caption={today.rush.length > 1 ? `and ${today.rush.slice(1).map(windowWords).join(', ')}` : `about ${today.totalOrders} orders expected`} />
    </StatGrid>
  );
}

function DayPicker({ data, value, onChange }: { data: api.RushInsights; value: string; onChange: (v: string) => void }) {
  return (
    <ChoiceChips
      aria-label="Day to plan"
      value={value}
      onValueChange={onChange}
      options={data.forecast.map((f, i) => ({ value: f.date, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY[f.weekday].slice(0, 3) }))}
    />
  );
}

function RushDayCard({ data, day }: { data: api.RushInsights; day: api.RushInsights['forecast'][number] }) {
  const inRush = (slot: string) => day.rush.some((r) => slot >= r.from && slot < r.to);
  const rows = data.slots.map((s, i) => ({ period: shortClock(s), orders: day.orders[i] }));
  const name = day.date === data.today ? 'today' : DAY[day.weekday];
  return (
    <ChartCard
      title={`Orders expected ${name === 'today' ? 'today' : `on ${name}`}`}
      caption={`Every 15 minutes · about ${day.totalOrders} orders${day.factor >= 1.05 ? ` · ${Math.round((day.factor - 1) * 100)}% busier lately` : day.factor <= 0.95 ? ` · ${Math.round((1 - day.factor) * 100)}% quieter lately` : ''}`}
      legend={[{ label: 'Rush', color: CHART_COLORS.primary, shape: 'square' }, { label: 'Other times', color: CHART_COLORS.previous, shape: 'square' }]}
      footer={day.rush.length ? <>Rush: <span className="font-medium text-text">{day.rush.map(windowWords).join(', ')}</span> · up to {Math.round(Math.max(...day.rush.map((r) => r.ordersPerHour)))} orders an hour</> : 'No clear rush expected: orders spread through the evening.'}
    >
      <TrendChart
        data={rows}
        series={[{ key: 'orders', name: 'Orders', kind: 'bar', color: CHART_COLORS.primary, cellColors: data.slots.map((s) => (inRush(s) ? CHART_COLORS.primary : CHART_COLORS.previous)) }]}
        format="number"
        height={220}
        ariaLabel={`Orders expected every 15 minutes ${name}`}
      />
    </ChartCard>
  );
}

function SteamerCard({ data, canSet, onSettings }: { data: api.RushInsights; canSet: boolean; onSettings: () => void }) {
  const [all, setAll] = useState(false);
  const { runs, settings, slots } = data.plan;
  // One block a filling, the busiest first: "Chicken - 5:00-9:00 PM, usually 3 plates, up to 7 at 7-8:30".
  const groups = useMemo(() => {
    const byFilling = new Map<api.RushFilling, api.SteamerRun[]>();
    for (const r of runs) byFilling.set(r.filling, [...(byFilling.get(r.filling) || []), r]);
    return [...byFilling.entries()].sort((a, b) => Math.max(...b[1].map((r) => r.keep)) - Math.max(...a[1].map((r) => r.keep)));
  }, [runs]);
  const plates = (n: number) => `${n} plate${n > 1 ? 's' : ''}`;
  const busySlots = slots.filter((s) => FILLINGS.some((f) => s.keep[f] > 0));
  return (
    <ChartCard
      title="Steamer plan"
      caption={`Steamed momos out within 2 minutes: keep this many plates (6 pcs) ready. Frozen momos take ${settings.steamMin} min in a can of up to ${settings.fullAbove} plates (${settings.steamMinFull} min with more); they stay good ${settings.holdMin} min, so a fresh batch every ${settings.holdMin} min.`}
      actions={canSet ? <Button size="sm" variant="ghost" leadingIcon={<Settings2 />} onClick={onSettings}>Settings</Button> : undefined}
    >
      {groups.length === 0 ? (
        <EmptyState compact icon={Soup} title="Steam to order" body="No 15 minutes of this day is busy enough to keep plates waiting without them losing shape." />
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map(([filling, list]) => (
            <li key={filling} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Timer className="size-4" aria-hidden="true" /></span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-body-sm font-semibold text-text">{FILLING_WORD[filling]} momos</span>
                {list.map((r) => (
                  <span key={r.from} className="num text-body-sm text-text-2">
                    <span className="font-medium text-text">{clock(r.from)}–{clock(r.to)}</span>
                    {': '}{r.keep > r.usual
                      ? `usually ${plates(r.usual)} ready; ${r.peakLow < r.keep ? `${r.peakLow}–${r.keep}` : r.keep} plates at ${clock(r.peakFrom)}–${clock(r.peakTo)}`
                      : `${plates(r.keep)} ready`}
                    {' · first batch in at '}{clock(r.firstBatchAt)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {busySlots.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setAll(!all)}>{all ? 'Hide the 15-minute detail' : 'Every 15 minutes'}</Button>
          {all && (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="num w-full min-w-[420px] text-label">
                <thead>
                  <tr className="text-left text-text-3">
                    <th className="py-1 pr-2 font-medium">Time</th>
                    <th className="py-1 pr-2 font-medium">Orders</th>
                    {FILLINGS.map((f) => <th key={f} className="py-1 pr-2 font-medium">{FILLING_WORD[f]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {busySlots.map((s) => (
                    <tr key={s.slot} className="border-t border-border">
                      <td className="py-1.5 pr-2 text-text">{clock(s.slot)}</td>
                      <td className="py-1.5 pr-2 text-text-2">{one(s.orders)}</td>
                      {FILLINGS.map((f) => <td key={f} className={s.keep[f] ? 'py-1.5 pr-2 font-semibold text-text' : 'py-1.5 pr-2 text-text-3'}>{s.keep[f] || '–'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pt-1 text-label text-text-3">Plates to have ready in that 15 minutes; steam each batch {settings.steamMin} min before.</p>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}

function Heatmap({ data, selected, onSelect }: { data: api.RushInsights; selected: number; onSelect: (w: number) => void }) {
  // By the hour on a phone (8 columns), from 3 PM to 11 PM.
  const hours = Array.from({ length: data.slots.length / 4 }, (_, i) => data.slots[i * 4]);
  const cell = (p: api.RushProfile, h: number) => p.orders.slice(h * 4, h * 4 + 4).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...data.profiles.flatMap((p) => hours.map((_, h) => cell(p, h))));
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <ChartCard title="Busy times by day" caption="Average orders an hour. Tap a day to see its counter and online split below.">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="grid min-w-[340px] gap-1" style={{ gridTemplateColumns: `3rem repeat(${hours.length}, minmax(0, 1fr))` }}>
          <span />
          {hours.map((h) => <span key={h} className="text-center text-label text-text-3">{shortClock(h)}</span>)}
          {order.map((w) => {
            const p = data.profiles[w];
            return [
              <button key={`l${w}`} type="button" onClick={() => onSelect(w)} className={`text-left text-label ${selected === w ? 'font-semibold text-text' : 'text-text-2'}`} aria-pressed={selected === w}>
                {DAY[w].slice(0, 3)}
              </button>,
              ...hours.map((h, i) => {
                const v = p.days ? cell(p, i) : 0;
                const pct = Math.round((v / max) * 85);
                return (
                  <button
                    key={`${w}-${h}`}
                    type="button"
                    onClick={() => onSelect(w)}
                    title={`${DAY[w]} ${clock(h)}: ${one(v)} orders an hour`}
                    aria-label={`${DAY[w]} ${clock(h)}: ${one(v)} orders an hour`}
                    className={`num flex h-9 items-center justify-center rounded-md text-label ${pct > 50 ? 'text-on-primary' : 'text-text-2'} ${selected === w ? 'ring-1 ring-border-strong' : ''}`}
                    style={{ background: v ? `color-mix(in oklab, var(--chart-1) ${Math.max(8, pct)}%, var(--surface))` : 'var(--surface-2)' }}
                  >
                    {v >= 0.5 ? Math.round(v) : ''}
                  </button>
                );
              }),
            ];
          })}
        </div>
      </div>
    </ChartCard>
  );
}

function RushWindowsCard({ data }: { data: api.RushInsights }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <ChartCard title="Rush hours" caption="A rush is 15 minutes with at least 1.4 times the day's usual orders (and 1.5 or more). Next-door ones join up.">
      <ul className="flex flex-col divide-y divide-border">
        {order.map((w) => {
          const p = data.profiles[w];
          return (
            <li key={w} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="text-body-sm font-medium text-text">{DAY[w]}</span>
              <span className="num text-right text-body-sm text-text-2">
                {!p.days ? 'No data' : p.rush.length ? p.rush.map((r) => `${windowWords(r)} (${Math.round(r.ordersPerHour)}/hr)`).join(', ') : 'No clear rush'}
              </span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

function MixCard({ data }: { data: api.RushInsights }) {
  const { rush, other, top } = data.mix;
  const share = (side: api.RushMixSide, n: number) => (side.pieces ? Math.round((n / side.pieces) * 100) : 0);
  const rows = FILLINGS.map((f) => ({ period: FILLING_WORD[f], rush: share(rush, rush.byFilling[f]), other: share(other, other.byFilling[f]) }));
  const styles = Object.keys({ ...rush.byStyle, ...other.byStyle }).sort((a, b) => (rush.byStyle[b] || 0) - (rush.byStyle[a] || 0)).slice(0, 6);
  return (
    <ChartCard
      title="What sells in the rush"
      caption="Share of momos by filling, in the rush and at other times."
      legend={legendFor([{ key: 'rush', name: 'Rush', color: CHART_SERIES[0], kind: 'bar' }, { key: 'other', name: 'Other times', color: CHART_SERIES[4], kind: 'bar' }])}
      footer={top.length ? <>Most ordered in the rush: {top.slice(0, 5).map((t) => `${t.name} (${t.qty})`).join(', ')}</> : undefined}
    >
      <TrendChart
        data={rows}
        series={[{ key: 'rush', name: 'Rush', color: CHART_SERIES[0], kind: 'bar' }, { key: 'other', name: 'Other times', color: CHART_SERIES[4], kind: 'bar' }]}
        layout="vertical"
        format="percent"
        height={210}
        ariaLabel="Share of momos by filling in the rush and at other times"
      />
      <FigureRow items={[
        { label: 'Steamer share, rush', value: `${share(rush, rush.steamerPieces)}%` },
        { label: 'Steamer share, other', value: `${share(other, other.steamerPieces)}%` },
        { label: 'Momos an order, rush', value: rush.orders ? one(rush.pieces / rush.orders) : '–' },
      ]} />
      {styles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => <StatusChip key={s} tone="neutral" size="sm">{STYLE_WORD[s] || s} {share(rush, rush.byStyle[s] || 0)}%</StatusChip>)}
        </div>
      )}
    </ChartCard>
  );
}

function ChannelsCard({ data, weekday }: { data: api.RushInsights; weekday: number }) {
  const p = data.profiles[weekday];
  const hours = Array.from({ length: data.slots.length / 4 }, (_, i) => i);
  const sum = (xs: number[], h: number) => xs.slice(h * 4, h * 4 + 4).reduce((a, b) => a + b, 0);
  const rows = hours.map((h) => ({ period: shortClock(data.slots[h * 4]), counter: sum(p.channels.counter, h), zomato: sum(p.channels.zomato, h), swiggy: sum(p.channels.swiggy, h) }));
  const series = [
    { key: 'counter', name: 'Counter', color: CHANNEL_COLORS.counter, kind: 'bar' as const, stack: 'c' },
    { key: 'zomato', name: 'Zomato', color: CHANNEL_COLORS.zomato, kind: 'bar' as const, stack: 'c' },
    { key: 'swiggy', name: 'Swiggy', color: CHANNEL_COLORS.swiggy, kind: 'bar' as const, stack: 'c' },
  ];
  return (
    <ChartCard title={`Counter and online, ${DAY[weekday]}s`} caption="Average orders an hour by where they came from." legend={legendFor(series)}>
      {p.days ? <TrendChart data={rows} series={series} format="number" height={220} ariaLabel={`Orders an hour by channel on ${DAY[weekday]}s`} /> : <EmptyState compact icon={Flame} title={`No ${DAY[weekday]}s yet`} />}
    </ChartCard>
  );
}

function OpenAtOnceCard({ data }: { data: api.RushInsights }) {
  const today = new Map<number, number>();
  for (const [m, n] of data.live.today) {
    const i = Math.floor((m - 15 * 60) / 15);
    if (i >= 0 && i < data.slots.length) today.set(i, Math.max(today.get(i) || 0, n));
  }
  const rows = data.slots.map((s, i) => ({ period: shortClock(s), today: today.has(i) ? today.get(i)! : null, usual: data.live.avgOpen[i] }));
  const hasAny = data.live.today.length > 0 || data.live.daysWithLooks > 0;
  const peak = data.live.today.reduce((best, [m, n]) => (n > best.n ? { m, n } : best), { m: 0, n: 0 });
  return (
    <ChartCard
      title="Orders open at once"
      caption="From Ciferon's running orders, every 3 minutes from 3 PM - how many the kitchen is working on together."
      legend={[{ label: 'Today', color: CHART_COLORS.primary, shape: 'line' }, ...(data.live.daysWithLooks ? [{ label: `Last ${data.live.daysWithLooks} days`, color: CHART_COLORS.previous, shape: 'line' as const }] : [])]}
      footer={peak.n ? <>Most open together today: <span className="font-medium text-text">{peak.n}</span> at {clock(`${String(Math.floor(peak.m / 60)).padStart(2, '0')}:${String(peak.m % 60).padStart(2, '0')}`)}</> : undefined}
    >
      {hasAny ? (
        <TrendChart
          data={rows}
          series={[{ key: 'today', name: 'Today', color: CHART_COLORS.primary, kind: 'line' }, ...(data.live.daysWithLooks ? [{ key: 'usual', name: 'Usual', color: CHART_COLORS.previous, kind: 'line' as const, dashed: true }] : [])]}
          format="number"
          height={200}
          ariaLabel="Orders open at once through the evening"
        />
      ) : (
        <EmptyState compact icon={Timer} title="Starts with today's orders" body="The running-orders check began on 1 Nov 2026; this line fills in from the evening." />
      )}
    </ChartCard>
  );
}

function SteamerSettingsSheet({ open, onOpenChange, storeId, settings, token, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; storeId: string; settings: api.SteamerSettings; token?: string; onSaved: () => void;
}) {
  const [steamMin, setSteamMin] = useState(settings.steamMin);
  const [steamMinFull, setSteamMinFull] = useState(settings.steamMinFull);
  const [fullAbove, setFullAbove] = useState(settings.fullAbove);
  const [holdMin, setHoldMin] = useState(settings.holdMin);
  const [level, setLevel] = useState(String(Math.round(settings.serviceLevel * 100)));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSteamMin(settings.steamMin); setSteamMinFull(settings.steamMinFull); setFullAbove(settings.fullAbove);
    setHoldMin(settings.holdMin); setLevel(String(Math.round(settings.serviceLevel * 100)));
  }, [open, settings]);
  const save = async () => {
    setBusy(true);
    try {
      await api.saveSteamerSettings(storeId, { steamMin, steamMinFull, fullAbove, holdMin, serviceLevel: Number(level) / 100 }, token);
      toast.success('Steamer plan updated');
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Steamer settings" description="How your kitchen steams. The plan uses these for every day." size="detail">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">Plates a can takes at the normal time</span>
          <span className="text-label text-text-3">More than this and the momos lie on one another, so they take longer.</span>
          <NumberStepper label="Plates a can" value={fullAbove} onChange={setFullAbove} min={1} max={30} unit="plates" editable />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">Minutes to steam, up to {fullAbove} plates</span>
            <NumberStepper label="Steam time" value={steamMin} onChange={setSteamMin} min={3} max={40} unit="min" editable />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">Minutes to steam, more than {fullAbove}</span>
            <NumberStepper label="Steam time, full can" value={steamMinFull} onChange={setSteamMinFull} min={3} max={60} unit="min" editable />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">Minutes steamed momos stay good</span>
          <span className="text-label text-text-3">After this they lose shape; the plan never keeps more ready than will go in this time.</span>
          <NumberStepper label="Stay good for" value={holdMin} onChange={setHoldMin} min={5} max={60} step={5} unit="min" editable />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">How often every steamed order should be ready</span>
          <span className="text-label text-text-3">Higher means more plates waiting; lower means a few orders wait for a batch.</span>
          <ChoiceChips aria-label="How often" value={level} onValueChange={setLevel} options={['70', '80', '90'].map((v) => ({ value: v, label: `${v}% of the time` }))} />
        </div>
        <Button loading={busy} onClick={save}>Save</Button>
      </div>
    </ResponsiveModal>
  );
}
