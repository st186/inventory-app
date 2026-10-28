// One food or packaging line from Insights > Costs (Meat & Dairy, Vegetables, ...): what each
// item's price did across every purchase, in plain words, with a one-day jump that goes
// straight back called out as a likely typing slip; then the items by money spent.
import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import { ResponsiveModal } from './ui/responsive-modal';
import { Callout } from './ui/callout';
import { ChoiceChips } from './ui/chip';
import { EmptyState } from './ui/empty-state';
import { ListGroup, ListRow } from './ui/list-row';
import { formatINR } from './ui/money';
import { StatusChip } from './ui/status-chip';
import { SectionHeading } from './insights/parts/common';
import { CHART_COLORS, TrendChart } from './insights/tabs/shared';

type Props = {
  category: string;
  // Accepts a mix of inventory items (itemName/costPerUnit/totalCost) and
  // overhead items (description/amount) — see field fallbacks below.
  items: any[];
  totalAmount: number;
  onClose: () => void;
};

type PurchasePoint = { date: string; price: number };

type ItemAnalysis = {
  itemName: string;
  totalSpent: number;
  quantity: number; // in canonicalUnit
  canonicalUnit: string; // 'kg' | 'L' | the item's own raw unit (pcs/units/etc.)
  mixedUnits: boolean; // true if this item's own purchases used more than one raw unit (e.g. some in g, some in kg)
  avgUnitPrice: number;
  transactionCount: number;
  history: PurchasePoint[]; // one point per distinct date, chronological, price per canonicalUnit
  firstUnitPrice: number;
  lastUnitPrice: number;
  netChangePercent: number; // first purchase -> latest purchase, for context alongside the curve
  maxJump: { fromDate: string; toDate: string; fromPrice: number; toPrice: number; percent: number } | null;
};

// A jump under this threshold is normal day-to-day market noise, not something worth
// flagging as a "sudden change" - this is the one number that decides what counts as
// an anomaly throughout this modal.
const SUDDEN_CHANGE_THRESHOLD_PERCENT = 15;
const MAX_TREND_CHARTS = 6;

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Purchases of the same item are logged in whatever unit was convenient that day - g one
// day, kg the next (CONFIRMED real case, found 2026-09-01: 300g of chicken for ₹70 logged
// with unit 'g', sitting alongside other days logged in 'kg' - comparing costPerUnit
// directly across those is comparing ₹/gram to ₹/kilogram, a 1000x scale mismatch that
// shows up as a fake "sudden price change"). Every purchase is converted to a canonical
// unit (kg for g/kg, L for mL/L, passthrough for count-based units) before anything is
// compared, and price-per-canonical-unit is derived from totalCost ÷ canonical quantity -
// the actual money paid divided by the real amount bought - rather than trusting whatever
// costPerUnit was stored, which is only ever correct within its own original unit.
function toCanonicalQuantity(quantity: number, unit: string | undefined): { qty: number; canonicalUnit: string } {
  const u = (unit || '').trim().toLowerCase();
  if (u === 'g') return { qty: quantity / 1000, canonicalUnit: 'kg' };
  if (u === 'kg') return { qty: quantity, canonicalUnit: 'kg' };
  if (u === 'ml') return { qty: quantity / 1000, canonicalUnit: 'L' };
  if (u === 'l') return { qty: quantity, canonicalUnit: 'L' };
  return { qty: quantity, canonicalUnit: unit || 'unit' };
}

export function ExpenseBreakdownModal({ category, items, totalAmount, onClose }: Props) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Group by item name, then by date within each item (same-day repeat purchases are
  // combined into one quantity-weighted point) - this is what actually makes "cost over
  // time" meaningful: a real chronological price curve per item, not just a first-vs-last
  // snapshot, and not distorted by unit mismatches between purchases.
  const itemAnalysis: ItemAnalysis[] = useMemo(() => {
    const byName: Record<string, {
      itemName: string; totalSpent: number; canonicalQty: number; transactionCount: number;
      rawUnits: Set<string>; canonicalUnit: string;
      byDate: Record<string, { cost: number; qty: number }>;
    }> = {};

    items.forEach((item) => {
      const rawName = item.itemName || item.description || 'Unknown';
      const name = rawName.trim().toLowerCase();
      const rawUnit = item.unit as string | undefined;
      const { qty: canonicalQty, canonicalUnit } = toCanonicalQuantity(item.quantity || 1, rawUnit);
      const totalPrice = item.totalCost ?? item.totalPrice ?? item.amount ?? 0;
      const date = (item.date || '').substring(0, 10);

      if (!byName[name]) {
        byName[name] = { itemName: rawName.trim(), totalSpent: 0, canonicalQty: 0, transactionCount: 0, rawUnits: new Set(), canonicalUnit, byDate: {} };
      }
      const bucket = byName[name];
      bucket.totalSpent += totalPrice;
      bucket.canonicalQty += canonicalQty;
      bucket.transactionCount += 1;
      if (rawUnit) bucket.rawUnits.add(rawUnit.trim().toLowerCase());
      if (date) {
        if (!bucket.byDate[date]) bucket.byDate[date] = { cost: 0, qty: 0 };
        bucket.byDate[date].cost += totalPrice;
        bucket.byDate[date].qty += canonicalQty;
      }
    });

    return Object.values(byName).map((bucket) => {
      // Price per canonical unit for a date = that date's total ₹ spent ÷ that date's
      // total canonical quantity bought - a quantity-weighted average, not a naive
      // average of possibly-mismatched per-purchase rates.
      const history: PurchasePoint[] = Object.keys(bucket.byDate)
        .sort()
        .filter((date) => bucket.byDate[date].qty > 0)
        .map((date) => ({ date, price: bucket.byDate[date].cost / bucket.byDate[date].qty }));

      const firstUnitPrice = history[0]?.price ?? 0;
      const lastUnitPrice = history[history.length - 1]?.price ?? 0;
      const netChangePercent = firstUnitPrice > 0 ? ((lastUnitPrice - firstUnitPrice) / firstUnitPrice) * 100 : 0;

      // The real "sudden change" signal: the single biggest consecutive-purchase jump
      // anywhere in the history, not just where the curve happened to end up. A price
      // that spiked mid-month and came back down by the last purchase would show 0%
      // net change but was still a real, worth-flagging event.
      let maxJump: ItemAnalysis['maxJump'] = null;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        if (prev.price <= 0) continue;
        const percent = ((curr.price - prev.price) / prev.price) * 100;
        if (!maxJump || Math.abs(percent) > Math.abs(maxJump.percent)) {
          maxJump = { fromDate: prev.date, toDate: curr.date, fromPrice: prev.price, toPrice: curr.price, percent };
        }
      }

      return {
        itemName: bucket.itemName,
        totalSpent: bucket.totalSpent,
        quantity: bucket.canonicalQty,
        canonicalUnit: bucket.canonicalUnit,
        mixedUnits: bucket.rawUnits.size > 1,
        avgUnitPrice: bucket.canonicalQty > 0 ? bucket.totalSpent / bucket.canonicalQty : 0,
        transactionCount: bucket.transactionCount,
        history,
        firstUnitPrice,
        lastUnitPrice,
        netChangePercent,
        maxJump,
      };
    });
  }, [items]);

  // Sort by total spent
  const topItems = [...itemAnalysis].sort((a, b) => b.totalSpent - a.totalSpent);

  // Items with an actual sudden jump, worst first - this is what used to be "Biggest
  // Price Fluctuations" but based on the real max single-purchase jump instead of a
  // first-vs-last comparison that could mask a mid-period spike entirely.
  const suddenChanges = [...itemAnalysis]
    .filter((item) => item.maxJump && Math.abs(item.maxJump.percent) >= SUDDEN_CHANGE_THRESHOLD_PERCENT)
    .sort((a, b) => Math.abs(b.maxJump!.percent) - Math.abs(a.maxJump!.percent));

  // Items worth charting: enough distinct purchase dates to draw a real line, ranked by
  // spend since that's what actually matters to the business.
  const chartableItems = topItems.filter((item) => item.history.length >= 2).slice(0, MAX_TREND_CHARTS);
  const activeChartItem = chartableItems.find((i) => i.itemName === selectedItem) || chartableItems[0] || null;

  const rupees = (n: number) => formatINR(Math.round(n * 100) / 100);
  const jumpOf = (item: ItemAnalysis | null) => (item?.maxJump && Math.abs(item.maxJump.percent) >= SUDDEN_CHANGE_THRESHOLD_PERCENT ? item.maxJump : null);
  // A jump that comes straight back on the next purchase is more often a typing slip (quantity
  // or price) than a real price change.
  const bouncedBack = (item: ItemAnalysis, jump: NonNullable<ItemAnalysis['maxJump']>) => {
    const i = item.history.findIndex((p) => p.date === jump.toDate);
    const next = item.history[i + 1];
    return next && jump.fromPrice > 0 && Math.abs(next.price - jump.fromPrice) / jump.fromPrice < 0.1 ? next : null;
  };
  const changeWords = (pct: number) => (Math.abs(pct) < 0.5 ? 'no change' : `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}%`);
  const active = activeChartItem;
  const activeJump = jumpOf(active);
  const activeBack = active && activeJump ? bouncedBack(active, activeJump) : null;

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={category}
      description={`Spent ${formatINR(Math.round(totalAmount))} · ${items.length} purchases · ${topItems.length} items`}
      size="detail"
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="price-trend-title">
          <SectionHeading id="price-trend-title" as="h3" title="Price over time" caption="What it cost per kg, litre or piece on each day it was bought" />
          {!active ? (
            <div className="rounded-lg border border-border bg-surface">
              <EmptyState compact icon={Activity} title="Not enough purchases to show a trend" body="An item needs purchases on at least 2 different days." />
            </div>
          ) : (
            <>
              {chartableItems.length > 1 && (
                <ChoiceChips
                  aria-label="Item"
                  value={active.itemName}
                  onValueChange={setSelectedItem}
                  options={chartableItems.map((item) => ({ value: item.itemName, label: item.itemName }))}
                />
              )}
              <p className="text-body-sm text-text-2">
                <span className="font-semibold text-text">{active.itemName}</span>:{' '}
                <span className="num">{rupees(active.firstUnitPrice)}</span> per {active.canonicalUnit} on {formatShortDate(active.history[0].date)},{' '}
                <span className="num">{rupees(active.lastUnitPrice)}</span> on {formatShortDate(active.history[active.history.length - 1].date)} ({changeWords(active.netChangePercent)}), over {active.history.length} purchase days.
                {active.mixedUnits && ' Logged in a mix of units (g and kg, mL and L), converted to the same unit first.'}
              </p>
              {activeJump && (
                <Callout tone="warning" icon={AlertTriangle} title={`${activeJump.percent > 0 ? '+' : '−'}${Math.abs(activeJump.percent).toFixed(0)}% on ${formatShortDate(activeJump.toDate)}`}>
                  {rupees(activeJump.fromPrice)} on {formatShortDate(activeJump.fromDate)}, {rupees(activeJump.toPrice)} on {formatShortDate(activeJump.toDate)}.
                  {activeBack
                    ? ` Back to ${rupees(activeBack.price)} on ${formatShortDate(activeBack.date)}, so check the ${formatShortDate(activeJump.toDate)} entry for a slip in the quantity or price.`
                    : ' The price stayed there afterwards.'}
                </Callout>
              )}
              <div className="rounded-lg border border-border bg-surface p-3">
                <TrendChart
                  data={active.history.map((p) => ({ period: formatShortDate(p.date), price: Math.round(p.price * 100) / 100 }))}
                  series={[{ key: 'price', name: `Price per ${active.canonicalUnit}`, color: CHART_COLORS.primary }]}
                  height={200}
                  ariaLabel={`${active.itemName} price per ${active.canonicalUnit} on each purchase day`}
                />
              </div>
            </>
          )}
        </section>

        <ListGroup title="Items" meta="by money spent">
          {topItems.slice(0, 15).map((item) => {
            const share = totalAmount > 0 ? (item.totalSpent / totalAmount) * 100 : 0;
            const pct = item.netChangePercent;
            return (
              <ListRow
                key={item.itemName}
                title={item.itemName}
                subtitle={`${item.quantity.toFixed(item.quantity < 10 ? 2 : 0)} ${item.canonicalUnit} · ${item.transactionCount} purchases · ${rupees(item.avgUnitPrice)}/${item.canonicalUnit} on average · ${share.toFixed(0)}% of the line`}
                trailing={
                  <span className="flex flex-col items-end gap-1">
                    <span className="num text-body-md font-semibold text-text">{formatINR(Math.round(item.totalSpent))}</span>
                    {item.history.length >= 2 && Math.abs(pct) >= 5 && (
                      <StatusChip tone={pct > 0 ? 'danger' : 'success'} icon={pct > 0 ? ArrowUp : ArrowDown}><span className="num">{Math.abs(pct).toFixed(0)}%</span></StatusChip>
                    )}
                  </span>
                }
              />
            );
          })}
        </ListGroup>

        {suddenChanges.length > 0 && (
          <ListGroup title="Sudden price changes" footer={`A change of ${SUDDEN_CHANGE_THRESHOLD_PERCENT}% or more between two purchase days. One that goes straight back is often a typing slip.`}>
            {suddenChanges.map((item) => {
              const jump = item.maxJump!;
              const back = bouncedBack(item, jump);
              return (
                <ListRow
                  key={`jump-${item.itemName}`}
                  icon={AlertTriangle}
                  iconTone="warning"
                  title={item.itemName}
                  subtitle={`${rupees(jump.fromPrice)} → ${rupees(jump.toPrice)} per ${item.canonicalUnit}, ${formatShortDate(jump.fromDate)} to ${formatShortDate(jump.toDate)}${back ? ` · back to ${rupees(back.price)} on ${formatShortDate(back.date)}` : ''}`}
                  trailing={<StatusChip tone={jump.percent > 0 ? 'danger' : 'success'}><span className="num">{jump.percent > 0 ? '+' : '−'}{Math.abs(jump.percent).toFixed(0)}%</span></StatusChip>}
                  onClick={chartableItems.some((c) => c.itemName === item.itemName) ? () => setSelectedItem(item.itemName) : undefined}
                />
              );
            })}
          </ListGroup>
        )}
      </div>
    </ResponsiveModal>
  );
}
