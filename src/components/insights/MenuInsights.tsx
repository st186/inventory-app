// Insights > Items: the menu (owner, 30 Oct 2026: "menu engineering + combos" and "sales lost to
// stock-outs"). Best sellers and how they moved, the dishes that hardly sell, how momos are made,
// what is bought together and how often a drink or soup goes with an order, Bunny's ideas on all
// of it, and the sales lost to running out (logged stock-outs and run-outs spotted in the sales).
// The sums are menuMath.ts and runOutMath.ts.
import { useEffect, useMemo, useState } from 'react';
import { Ban, Lightbulb, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import * as api from '../../utils/api';
import type { StockOutEntry } from '../../utils/stockOuts';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { ShareBars } from '../ui/chart-theme';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';
import { CHART_COLORS, ChartCard, ChartEmpty, inr } from './tabs/shared';
import { buildMenu, TAIL_PLATES } from './menuMath';
import { salesLost } from './runOutMath';

const STYLE_COLORS = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary, CHART_COLORS.quaternary, '#94a3b8', '#a78bfa', '#f472b6', '#22d3ee'];
const hourText = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

type Props = {
  accessToken: string;
  storeIds: string[];          // the store(s) in view, for the logged stock-outs
  storeId: string | null;      // for Bunny's cache
  range: { startDate: string; endDate: string };
  orders: api.OrderItemDetailRecord[];
  previousOrders: api.OrderItemDetailRecord[];
  canManage: boolean;
};

export function MenuInsights({ accessToken, storeIds, storeId, range, orders, previousOrders, canManage }: Props) {
  const { lang } = useT();
  const menu = useMemo(() => buildMenu(orders as any, previousOrders as any), [orders, previousOrders]);
  const [logged, setLogged] = useState<StockOutEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(storeIds.map((id) => api.getStockOuts(accessToken, id, range.startDate, range.endDate).catch(() => [])))
      .then((lists) => { if (!cancelled) setLogged(lists.flat()); });
    return () => { cancelled = true; };
  }, [accessToken, storeIds.join(','), range.startDate, range.endDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = useMemo(() => salesLost(orders as any, previousOrders as any, logged as any), [orders, previousOrders, logged]);

  const [ideas, setIdeas] = useState<api.MenuIdea[] | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { setIdeas(null); }, [range.startDate, range.endDate, storeId]);
  const facts = () => ({
    period: `${range.startDate} to ${range.endDate}`, orders: menu.totals.orders, dishesSold: menu.totals.dishes, itemsPerOrder: menu.totals.avgItems,
    best: menu.dishes.slice(0, 12).map((d) => ({ dish: d.name, plates: d.plates, sales: d.revenue, appsShare: d.onlineShare, changePct: d.change })),
    rising: menu.rising.map((d) => `${d.name} +${d.change}%`), falling: menu.falling.map((d) => `${d.name} ${d.change}%`),
    hardlySell: { dishes: menu.tail.dishes, salesShare: menu.tail.revenueShare, examples: menu.tail.names },
    styles: menu.styles.map((s) => ({ style: s.style, plates: s.plates, sales: s.revenue })),
    ordersWithDrinkPct: menu.attach.drinks, ordersWithSoupPct: menu.attach.soup,
    boughtTogether: menu.pairs.map((p) => ({ pair: `${p.a} + ${p.b}`, orders: p.orders, sharePct: p.share, lift: p.lift })),
    salesLostToRunningOut: lost.total,
  });
  const ask = async () => {
    setAsking(true);
    try { setIdeas(await api.getMenuIdeas(accessToken, storeId, lang, facts())); } catch (e: any) { toast.error(e?.message || 'Bunny could not help just now'); } finally { setAsking(false); }
  };

  if (!menu.totals.orders) return <ChartCard title="Menu"><ChartEmpty title="No orders from the till in this period" /></ChartCard>;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <ChartCard title="Menu" caption="From the till's orders: the counter and app version of a dish count as one">
        <StatGrid columns={4}>
          <StatTile label="Dishes sold" value={menu.totals.dishes} caption={`${menu.totals.orders.toLocaleString('en-IN')} orders`} />
          <StatTile label="Hardly sell" value={menu.tail.dishes} caption={`under ${TAIL_PLATES} plates · ${menu.tail.revenueShare}% of sales`} />
          <StatTile label="Orders with a drink" value={`${menu.attach.drinks}%`} caption={menu.attach.soup ? `with soup ${menu.attach.soup}%` : 'no soup sold'} />
          <StatTile label="Items an order" value={menu.totals.avgItems} caption={`${menu.totals.multiShare}% buy more than one kind`} />
        </StatGrid>
        <p className="text-label text-text-3">Profit per plate shows here once recipe costs are approved in Recipes &amp; costs; until then it is left out rather than guessed.</p>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ListGroup title="Best sellers" meta="plates · change vs last period">
          {menu.dishes.slice(0, 8).map((d) => (
            <ListRow key={d.key} title={d.name} subtitle={`${d.plates.toLocaleString('en-IN')} plates · ${inr(d.revenue)}${d.onlineShare ? ` · ${d.onlineShare}% through the apps` : ''}`}
              trailing={d.change === null ? undefined : <StatusChip tone={d.change >= 0 ? 'success' : 'danger'}>{d.change > 0 ? '+' : ''}{d.change}%</StatusChip>} />
          ))}
        </ListGroup>
        <ChartCard title="How it's made" caption="Plates by style">
          <ShareBars items={menu.styles.slice(0, 8).map((s, i) => ({ label: s.style, value: s.plates, color: STYLE_COLORS[i % STYLE_COLORS.length], valueText: `${s.plates.toLocaleString('en-IN')} plates` }))} />
        </ChartCard>
      </div>

      {(menu.rising.length > 0 || menu.falling.length > 0) && (
        <ListGroup title="Moving" meta="30% or more vs last period">
          {[...menu.rising.map((d) => ({ ...d, up: true })), ...menu.falling.map((d) => ({ ...d, up: false }))].map((d) => (
            <ListRow key={d.key} icon={d.up ? TrendingUp : TrendingDown} iconTone={d.up ? 'success' : 'warning'} title={d.name}
              subtitle={`${d.plates} plates, last period ${d.prevPlates}`} trailing={<StatusChip tone={d.up ? 'success' : 'danger'}>{d.change > 0 ? '+' : ''}{d.change}%</StatusChip>} />
          ))}
        </ListGroup>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <ListGroup title="Bought together" meta="share of orders · times more than chance"
          empty={<p className="px-4 py-4 text-body-sm text-text-2">Orders here are mostly one kind of momo.</p>}>
          {menu.pairs.map((p) => (
            <ListRow key={`${p.a}|${p.b}`} title={`${p.a} + ${p.b}`} subtitle={`${p.orders.toLocaleString('en-IN')} orders · ${p.share}% of orders`}
              trailing={p.lift >= 1.2 ? <StatusChip tone="success">{p.lift}×</StatusChip> : <span className="num text-label text-text-3">{p.lift}×</span>} />
          ))}
        </ListGroup>
        <ListGroup title="Hardly sell" meta={`under ${TAIL_PLATES} plates in the period`}
          empty={<p className="px-4 py-4 text-body-sm text-text-2">Every dish sold at least {TAIL_PLATES} plates.</p>}>
          {menu.tail.dishes > 0 && (
            <ListRow icon={Ban} iconTone="neutral" title={`${menu.tail.dishes} dishes, ${menu.tail.plates} plates`} subtitle={`${menu.tail.revenueShare}% of sales: ${menu.tail.names.slice(0, 8).join(', ')}${menu.tail.dishes > 8 ? '…' : ''}`} />
          )}
        </ListGroup>
      </div>

      <ChartCard title="Sales lost to running out" caption="Logged stock-outs, and momo kinds that stopped selling early on a busy evening"
        footer={lost.runOuts.length ? `${lost.logged} logged, ${lost.spotted} spotted from the sales. Each is what that kind usually sells in those hours, at its usual price.` : undefined}>
        {lost.runOuts.length === 0 ? (
          <ChartEmpty title="Nothing ran out in this period" body="None logged, and no momo stopped selling early. Log stock-outs in Stock > Out of stock to count them." />
        ) : (
          <>
            <StatGrid columns={2}>
              <StatTile label="Sales lost" value={inr(lost.total)} caption={`${lost.plates} plates`} />
              <StatTile label="Times" value={lost.runOuts.length} />
            </StatGrid>
            <ul className="flex flex-col divide-y divide-border">
              {lost.runOuts.slice(0, 10).map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-body-sm">
                  <span className="min-w-0 text-text">{new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {r.name} · from {hourText(r.fromHour)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusChip tone={r.source === 'logged' ? 'neutral' : 'warning'}>{r.source === 'logged' ? 'Logged' : 'Spotted'}</StatusChip>
                    <span className="num font-semibold text-text">{inr(r.rupees)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ChartCard>

      {canManage && (
        <ChartCard title={<span className="inline-flex items-center gap-2"><Sparkles className="size-5 text-primary" aria-hidden="true" />Bunny's menu ideas</span>}
          caption="Combos, prices and what to push or drop, from the numbers above"
          actions={<Button size="sm" variant={ideas ? 'ghost' : 'primary'} loading={asking} onClick={ask}>{ideas ? 'Ask again' : 'Get ideas'}</Button>}>
          {!ideas ? <p className="text-body-sm text-text-2">Tap Get ideas: Bunny reads this period's menu numbers and suggests what to try.</p> : (
            <ul className="flex flex-col gap-3">
              {ideas.map((x, i) => (
                <li key={i} className="flex gap-3">
                  <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body-md font-semibold text-text">{x.title}</span>
                    <span className="text-body-sm text-text-2">{x.why}</span>
                    <span className="text-body-sm font-medium text-text">{x.action}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      )}
    </div>
  );
}
