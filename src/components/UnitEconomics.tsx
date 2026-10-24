// Unit Economics - the "Shark Tank" numbers (gross margin, CM1/CM2/CM3, EBITDA, net margin,
// prime cost, per-order economics, break-even) for the selected period. Every figure comes
// from the same P&L as the Analytics cards, so Net Profit here is the Net Profit card.

import { useMemo, useState, type ReactNode } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Scale, Info, ChevronRight } from 'lucide-react';

export type PnlBreakdown = {
  revenue: number;
  counterRevenue: number;
  onlineRevenue: number;
  zomatoRevenue: number;
  swiggyRevenue: number;
  onlineDiscounts: number; // restaurant-funded discounts on settled online orders (already out of revenue)
  food: number; // ingredients
  packaging: number;
  commission: number; // Zomato/Swiggy commission, excl. GST
  platformAds: number;
  marketing: number;
  staff: number; // salaries incl. personal expenses
  occupancy: number; // rent, electricity, internet & phone
  otherOpex: number; // running costs incl. the POS subscription's share
  depreciation: number; // equipment and the scooter, spread over their life
  interest: number;
  shortages: number; // approved cash shortages
  netProfit: number;
  estimatedCommission: number; // commission + ads estimated for days not settled yet
  estimatedDays: number;
  // The parts of staff and occupancy that are paid once a month (permanent salaries; rent and
  // electricity) - the normalized view swaps them for a day-by-day share.
  staffSmoothable?: number;
  occupancySmoothable?: number;
};

// Swap month-end salaries, rent and electricity for their day-by-day share of the period
// (utils/dailyCostSmoothing.ts), so a month in progress isn't flattered by bills not yet paid.
export function normalizePnl(p: PnlBreakdown, accrued: { staff: number; occupancy: number }): PnlBreakdown {
  const staff = p.staff - (p.staffSmoothable || 0) + accrued.staff;
  const occupancy = p.occupancy - (p.occupancySmoothable || 0) + accrued.occupancy;
  return { ...p, staff, occupancy, netProfit: p.netProfit - (staff - p.staff) - (occupancy - p.occupancy) };
}

// Cost lines on the ladder that open a detail view when tapped.
export type CostLineKey =
  | 'food' | 'packaging' | 'commission' | 'ads' | 'marketing' | 'staff'
  | 'occupancy' | 'otherOpex' | 'depreciation' | 'interest' | 'shortages';

export type UnitEconomicsTrendPoint = { month: string; label: string; partial: boolean; pnl: PnlBreakdown };

type Props = {
  pnl: PnlBreakdown;
  periodLabel: string;
  daysInPeriod: number;
  netRealisedProfit: number;
  carryForwardAmount: number;
  showRealised: boolean;
  netNormalizedProfit: number;
  orders: { counter: number; zomato: number; swiggy: number } | null;
  platformCut: { zomato: number; swiggy: number };
  trend: UnitEconomicsTrendPoint[];
  onOpenLine?: (line: CostLineKey) => void;
  pnlNormalized?: PnlBreakdown | null;
  normalizedEstimate?: number; // part of the day-by-day amount estimated from last month
  // Each channel's food at its own menu prices and at counter prices (utils/channelFoodValue.ts).
  foodValue?: Record<'counter' | 'zomato' | 'swiggy', { menuValue: number; counterValue: number; pricedShare: number }> | null;
  defaultBasis?: 'paid' | 'normalized';
};

const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const pctText = (v: number) => `${v.toFixed(1)}%`;

function ladderOf(p: PnlBreakdown) {
  const cm1 = p.revenue - p.food;
  const cm2 = cm1 - p.packaging - p.commission;
  const cm3 = cm2 - p.platformAds - p.marketing;
  const ebitda = cm3 - p.staff - p.occupancy - p.otherOpex;
  const net = ebitda - p.depreciation - p.interest - p.shortages;
  return { cm1, cm2, cm3, ebitda, net };
}

type Status = 'good' | 'watch' | 'high' | 'low' | 'info';
const STATUS_STYLE: Record<Status, string> = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  watch: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  low: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-slate-50 text-slate-600 border-slate-200',
};
const STATUS_LABEL: Record<Status, string> = { good: 'On target', watch: 'Watch', high: 'Too high', low: 'Too low', info: 'For info' };
// Lower-is-better ratio against a target and a "watch" ceiling.
const statusFor = (value: number, target: number, ceiling: number): Status =>
  value <= target ? 'good' : value <= ceiling ? 'watch' : 'high';
// Higher-is-better margin against a target and a "watch" floor.
const marginStatus = (value: number, target: number, floor: number): Status =>
  value >= target ? 'good' : value >= floor ? 'watch' : 'low';

// A ladder row: a button when it opens a detail view, a plain block otherwise.
function RowShell({ className, onClick, children }: { className: string; onClick?: () => void; children: ReactNode }) {
  if (!onClick) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} block w-full text-left cursor-pointer hover:bg-orange-50/60 active:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 transition-colors`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function UnitEconomics({
  pnl: pnlProp, periodLabel, daysInPeriod, netRealisedProfit, carryForwardAmount, showRealised, netNormalizedProfit,
  orders, platformCut, trend, onOpenLine, pnlNormalized, normalizedEstimate = 0, defaultBasis = 'paid', foodValue,
}: Props) {
  const pnlPaid = pnlProp;
  const [basis, setBasis] = useState<'paid' | 'normalized'>(defaultBasis);
  const normalizedOn = basis === 'normalized' && !!pnlNormalized;
  const pnl = normalizedOn ? pnlNormalized! : pnlPaid;
  const L = ladderOf(pnl);
  const rev = pnl.revenue;
  // Owed for the days so far but not paid yet (unrealised).
  const staffUnpaid = pnlNormalized ? pnlNormalized.staff - pnlPaid.staff : 0;
  const occupancyUnpaid = pnlNormalized ? pnlNormalized.occupancy - pnlPaid.occupancy : 0;
  const accruedTotal = pnlNormalized
    ? pnlNormalized.staff - (pnlPaid.staff - (pnlPaid.staffSmoothable || 0)) + pnlNormalized.occupancy - (pnlPaid.occupancy - (pnlPaid.occupancySmoothable || 0))
    : 0;
  const unpaidHint = (unpaid: number, what: string) => normalizedOn
    ? `${what} counted day by day for the period${unpaid > 0.5 ? ` · ${inr(unpaid)} of it not paid yet (unrealised)` : ''}`
    : unpaid > 0.5 ? `As paid · ${inr(unpaid)} more is owed for these days, not paid yet` : undefined;

  const ladderRows = useMemo(() => {
    type Row = { label: string; hint?: string; value: number; kind: 'start' | 'cost' | 'subtotal' | 'final'; term?: string; line?: CostLineKey };
    const rows: Row[] = [
      { label: 'Net revenue', hint: 'What customers paid us - counter plus Zomato/Swiggy, without GST', value: rev, kind: 'start' },
      { label: 'Food ingredients', value: pnl.food, kind: 'cost', line: 'food' },
      { label: 'Gross profit', term: 'CM1', value: L.cm1, kind: 'subtotal' },
      { label: 'Packaging', hint: 'Boxes, trays, bags; bulk orders counted over the ~4 months they last', value: pnl.packaging, kind: 'cost', line: 'packaging' },
      {
        label: 'Zomato/Swiggy commission',
        hint: pnl.estimatedCommission > 0.5
          ? `Excludes GST. Includes ${inr(pnl.estimatedCommission)} estimated for ${pnl.estimatedDays} day${pnl.estimatedDays === 1 ? '' : 's'} not settled yet`
          : 'Excludes the GST the platforms pay on our behalf',
        value: pnl.commission, kind: 'cost', line: 'commission',
      },
      { label: 'After food, packaging & commission', term: 'CM2', value: L.cm2, kind: 'subtotal' },
      { label: 'Zomato/Swiggy ads', value: pnl.platformAds, kind: 'cost', line: 'ads' },
      { label: 'Marketing', hint: 'Posters, offers, promotions', value: pnl.marketing, kind: 'cost', line: 'marketing' },
      { label: 'After marketing', term: 'CM3', value: L.cm3, kind: 'subtotal' },
      { label: 'Staff salaries', hint: unpaidHint(staffUnpaid, 'Salaries'), value: pnl.staff, kind: 'cost', line: 'staff' },
      { label: 'Rent, electricity & internet', hint: unpaidHint(occupancyUnpaid, 'Rent and electricity'), value: pnl.occupancy, kind: 'cost', line: 'occupancy' },
      { label: 'Other running costs', hint: 'Cleaning, supplies, repairs, the POS subscription and the rest', value: pnl.otherOpex, kind: 'cost', line: 'otherOpex' },
      { label: 'Operating profit', term: 'EBITDA', value: L.ebitda, kind: 'subtotal' },
      { label: 'Equipment & scooter', hint: 'Their cost spread over 3 years (depreciation)', value: pnl.depreciation, kind: 'cost', line: 'depreciation' },
      { label: 'Loan interest', value: pnl.interest, kind: 'cost', line: 'interest' },
      { label: 'Approved cash shortages', value: pnl.shortages, kind: 'cost', line: 'shortages' },
      { label: normalizedOn ? 'Net profit (normalized)' : 'Net profit', value: L.net, kind: 'final' },
    ];
    return rows.filter((r) => r.kind !== 'cost' || Math.abs(r.value) >= 0.5);
  }, [pnl, L.cm1, L.cm2, L.cm3, L.ebitda, L.net, rev, normalizedOn, staffUnpaid, occupancyUnpaid]);

  // Waterfall: every bar is placed on one scale running from the lowest level reached (or 0)
  // to revenue = 100.
  const waterfall = useMemo(() => {
    let level = 0;
    const steps = ladderRows.map((r) => {
      if (r.kind === 'start') { level = r.value; return { from: 0, to: r.value }; }
      if (r.kind === 'cost') { const from = level; level -= r.value; return { from: level, to: from }; }
      return { from: Math.min(0, r.value), to: Math.max(0, r.value) };
    });
    const lo = Math.min(0, ...steps.map((s) => s.from));
    const hi = Math.max(rev, ...steps.map((s) => s.to), 1);
    const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
    return { steps: steps.map((s) => ({ left: x(s.from), width: Math.max(0.4, x(s.to) - x(s.from)) })), zero: x(0) };
  }, [ladderRows, rev]);

  const cogs = pnl.food + pnl.packaging;
  const tiles = [
    { term: 'Gross margin', sub: 'CM1 - after food', value: pct(L.cm1, rev), status: marginStatus(pct(L.cm1, rev), 65, 58), target: 'QSR aim: 65%+' },
    { term: 'CM2', sub: 'after packaging & commission', value: pct(L.cm2, rev), status: marginStatus(pct(L.cm2, rev), 55, 45), target: 'Aim: 55%+' },
    { term: 'EBITDA margin', sub: 'operating profit', value: pct(L.ebitda, rev), status: marginStatus(pct(L.ebitda, rev), 20, 10), target: 'Good QSR: 15-20%+' },
    { term: 'Net margin', sub: 'what we keep', value: pct(L.net, rev), status: marginStatus(pct(L.net, rev), 20, 10), target: 'Our goal: 20%' },
  ];

  const onlineCut = pnl.commission + pnl.platformAds;
  const ratios: { label: string; value: number; status: Status; target: string; note: string }[] = [
    { label: 'Food + packaging (COGS)', value: pct(cogs, rev), status: statusFor(pct(cogs, rev), 35, 40), target: '30-35%', note: `${inr(cogs)} on ingredients and packaging` },
    { label: 'Staff (labour)', value: pct(pnl.staff, rev), status: statusFor(pct(pnl.staff, rev), 25, 30), target: 'up to 25%', note: normalizedOn ? `${inr(pnl.staff)} counted day by day · ${inr(pnlPaid.staff)} paid so far` : `${inr(pnl.staff)} paid${staffUnpaid > 0.5 ? ` · ${inr(staffUnpaid)} more owed, not paid yet` : ''}` },
    { label: 'Prime cost', value: pct(cogs + pnl.staff, rev), status: statusFor(pct(cogs + pnl.staff, rev), 60, 65), target: 'up to 60%', note: 'Food + packaging + staff - the number restaurant owners watch most' },
    { label: 'Rent & utilities', value: pct(pnl.occupancy, rev), status: statusFor(pct(pnl.occupancy, rev), 12, 15), target: 'up to 12%', note: normalizedOn ? `${inr(pnl.occupancy)} counted day by day · ${inr(pnlPaid.occupancy)} paid so far` : `${inr(pnl.occupancy)} paid${occupancyUnpaid > 0.5 ? ` · ${inr(occupancyUnpaid)} more owed, not paid yet` : ''}` },
    { label: 'Platform cut on online sales', value: pct(onlineCut, pnl.onlineRevenue), status: statusFor(pct(onlineCut, pnl.onlineRevenue), 30, 35), target: 'under 30%', note: `${inr(onlineCut)} commission + ads on ${inr(pnl.onlineRevenue)} of online sales` },
    { label: 'Online share of sales', value: pct(pnl.onlineRevenue, rev), status: 'info', target: 'kept small on purpose', note: 'Every online order gives about a third of its value to the platform' },
  ];

  // Staff, rent, running costs, equipment, interest and marketing shared equally per order, always
  // on the normalized basis, so channels compare fairly even mid-month.
  const pnlN = pnlNormalized || pnlPaid;
  const totalOrders = orders ? orders.counter + orders.zomato + orders.swiggy : 0;
  const overheadPerOrder = totalOrders > 0
    ? (pnlN.staff + pnlN.occupancy + pnlN.otherOpex + pnlN.depreciation + pnlN.interest + pnlN.marketing) / totalOrders
    : 0;
  // Per order, by channel. Food and packaging are shared out by each channel's share of sales.
  const channels = useMemo(() => {
    if (!orders) return [];
    const list = [
      { key: 'counter', name: 'Counter', revenue: pnl.counterRevenue, orders: orders.counter, cut: 0 },
      { key: 'zomato', name: 'Zomato', revenue: pnl.zomatoRevenue, orders: orders.zomato, cut: platformCut.zomato },
      { key: 'swiggy', name: 'Swiggy', revenue: pnl.swiggyRevenue, orders: orders.swiggy, cut: platformCut.swiggy },
    ].filter((c) => c.orders > 0 && c.revenue > 0);
    // Food is shared by how much food each channel sold (valued at counter prices), since an
    // online menu charges more for the same plate. Without item data, by share of sales.
    type Key = 'counter' | 'zomato' | 'swiggy';
    const byFood = !!foodValue && list.every((c) => (foodValue[c.key as Key]?.counterValue || 0) > 0);
    const weight = (c: typeof list[number]) => (byFood ? foodValue![c.key as Key].counterValue : c.revenue);
    const totalWeight = list.reduce((t, c) => t + weight(c), 0);
    return list.map((c) => {
      const aov = c.revenue / c.orders;
      const w = weight(c);
      const cogsPerOrder = totalWeight > 0 ? (cogs * (w / totalWeight)) / c.orders : 0;
      const cutPerOrder = c.cut / c.orders;
      const left = aov - cogsPerOrder - cutPerOrder;
      const menuValue = byFood ? foodValue![c.key as Key].menuValue : c.revenue;
      // Price per rupee of food at counter prices: on the menu, and after the discounts given.
      return { ...c, aov, w, byFood, cogsPerOrder, cutPerOrder, left, keptPct: pct(left, aov), listMarkup: w > 0 ? menuValue / w : 1, netMarkup: w > 0 ? c.revenue / w : 1 };
    });
  }, [orders, pnl.counterRevenue, pnl.zomatoRevenue, pnl.swiggyRevenue, platformCut, cogs, foodValue]);

  // The same food on every channel: the counter's average order, sold on each channel at that
  // channel's prices (its menu mark-up, less the discounts it gives). Same plates, so the same
  // food cost; only the price and the platform's cut differ.
  const refChannel = channels.find((c) => c.key === 'counter') || channels[0];
  const byFood = !!refChannel?.byFood;
  const sameValue = refChannel ? refChannel.aov : 0;
  const refFood = refChannel ? refChannel.cogsPerOrder : 0;
  const sameOrder = channels.map((c) => {
    // The reference order's price scaled by how much more this channel charges per rupee of food.
    const price = refChannel && refChannel.netMarkup > 0 ? sameValue * (c.netMarkup / refChannel.netMarkup) : sameValue;
    const cut = c.revenue > 0 ? price * (c.cut / c.revenue) : 0;
    const left = price - refFood - cut;
    const profit = left - overheadPerOrder;
    return { key: c.key, price, food: refFood, cut, left, profit, keptPct: pct(left, price), profitPct: pct(profit, price) };
  });
  const moreLess = (ratio: number) => { const n = Math.round((ratio - 1) * 100); return n >= 0 ? `${n}% more` : `${-n}% less`; };
  const markupNote = channels.filter((c) => c.key !== 'counter').map((c) =>
    `${c.name} charges ${moreLess(c.listMarkup / (refChannel?.listMarkup || 1))} for the same food on its menu, ${moreLess(c.netMarkup / (refChannel?.netMarkup || 1))} after the discounts you fund`).join('; ');

  // Break-even from the last complete month (the current month is still partial).
  const survival = useMemo(() => {
    const full = [...trend].reverse().find((t) => !t.partial && t.pnl.revenue > 0);
    if (!full) return null;
    const p = full.pnl;
    const l = ladderOf(p);
    const fixed = p.staff + p.occupancy + p.otherOpex + p.depreciation + p.interest;
    const cm3Ratio = p.revenue > 0 ? l.cm3 / p.revenue : 0;
    const cm1Ratio = p.revenue > 0 ? l.cm1 / p.revenue : 0;
    const cm2Ratio = p.revenue > 0 ? l.cm2 / p.revenue : 0;
    const [y, m] = full.month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      label: full.label,
      fixed,
      cm1Ratio,
      cm2Ratio,
      cm3Ratio,
      breakEvenPerDay: cm3Ratio > 0 ? fixed / cm3Ratio / days : null,
      target20PerDay: cm3Ratio > 0.2 ? fixed / (cm3Ratio - 0.2) / days : null,
    };
  }, [trend]);
  const salesPerDay = daysInPeriod > 0 ? rev / daysInPeriod : 0;

  const trendData = trend.map((t) => {
    const l = ladderOf(t.pnl);
    return {
      label: t.partial ? `${t.label} (so far)` : t.label,
      revenue: Math.round(t.pnl.revenue),
      cm2: Number(pct(l.cm2, t.pnl.revenue).toFixed(1)),
      ebitda: Number(pct(l.ebitda, t.pnl.revenue).toFixed(1)),
      net: Number(pct(l.net, t.pnl.revenue).toFixed(1)),
      cm1Amt: l.cm1, cm2Amt: l.cm2, ebitdaAmt: l.ebitda, netAmt: l.net,
    };
  });

  if (rev <= 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
        No sales in this period yet, so there's nothing to break down.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Paid so far vs normalized */}
      {pnlNormalized && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div role="group" aria-label="How salaries and rent are counted" className="inline-flex self-start rounded-lg border border-gray-200 bg-gray-50 p-1">
            {([['paid', 'Paid so far'], ['normalized', 'Normalized']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={basis === key}
                onClick={() => setBasis(key)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${basis === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600 sm:flex-1">
            {normalizedOn
              ? `Salaries, rent and electricity counted day by day for the period: ${inr(accruedTotal)}${normalizedEstimate > 0.5 ? `, of which ${inr(normalizedEstimate)} is estimated from last month until this month's figures are entered` : ''}${staffUnpaid + occupancyUnpaid > 0.5 ? `. ${inr(staffUnpaid + occupancyUnpaid)} of it is not paid yet` : ''}.`
              : `Only what has been paid so far.${staffUnpaid + occupancyUnpaid > 0.5 ? ` ${inr(staffUnpaid + occupancyUnpaid)} of salaries, rent and electricity is owed for these days but not paid yet, so profit looks better than it is.` : ''}`}
          </p>
        </div>
      )}

      {/* Headline margins */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.term} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-sm font-semibold text-gray-900">{t.term}</p>
            <p className="text-[11px] text-gray-500">{t.sub}</p>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2">
              <p className={`text-2xl font-bold tabular-nums ${t.value < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{pctText(t.value)}</p>
              <StatusPill status={t.status} />
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">{t.target}</p>
          </div>
        ))}
      </div>

      {/* The ladder */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">From revenue to net profit</h3>
          <p className="text-xs sm:text-sm text-gray-500">{periodLabel} · each step and how much of every ₹100 of sales is left{onOpenLine ? ' · tap a cost to see what is in it' : ''}</p>
        </div>
        <div className="divide-y divide-gray-50">
          {ladderRows.map((r, i) => {
            const isTotal = r.kind !== 'cost';
            const shown = r.kind === 'cost' ? -r.value : r.value;
            const share = pct(Math.abs(r.value), rev);
            const step = waterfall.steps[i];
            const barColor = r.kind === 'cost' ? 'bg-rose-300'
              : r.kind === 'start' ? 'bg-sky-400'
              : r.value < 0 ? 'bg-rose-500' : r.kind === 'final' ? 'bg-emerald-500' : 'bg-indigo-400';
            return (
              <RowShell
                key={r.label}
                className={`px-4 sm:px-5 py-2 ${isTotal ? 'bg-gray-50/70' : ''}`}
                onClick={r.line && onOpenLine ? () => onOpenLine(r.line!) : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm ${isTotal ? 'font-semibold text-gray-900' : 'text-gray-700 pl-3'}`}>
                      {r.label}
                      {r.term && <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 align-middle">{r.term}</span>}
                    </p>
                    {r.hint && <p className="text-[11px] text-gray-500 mt-0.5">{r.hint}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm tabular-nums whitespace-nowrap ${isTotal ? 'font-bold' : 'font-medium'} ${shown < 0 && isTotal ? 'text-rose-600' : 'text-gray-900'}`}>{inr(shown)}</p>
                    <p className="text-[11px] tabular-nums text-gray-500">{r.kind === 'cost' ? '' : r.value < 0 ? '-' : ''}{pctText(share)}</p>
                  </div>
                  {r.line && onOpenLine && <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 self-center" aria-hidden="true" />}
                </div>
                <div className="relative h-2 mt-1 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                  {waterfall.zero > 0.5 && <div className="absolute top-0 bottom-0 w-px bg-gray-400" style={{ left: `${waterfall.zero}%` }} />}
                  <div className={`absolute top-0 bottom-0 rounded-full ${barColor}`} style={{ left: `${step.left}%`, width: `${step.width}%` }} />
                </div>
              </RowShell>
            );
          })}
        </div>
        <div className="px-4 sm:px-5 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {showRealised && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-teal-50 px-3 py-2">
              <span className="text-teal-800">Net realised {carryForwardAmount < 0 ? `(after ${inr(carryForwardAmount)} loss brought forward)` : ''}</span>
              <span className="font-bold tabular-nums whitespace-nowrap text-teal-900">{inr(netRealisedProfit)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-indigo-50 px-3 py-2">
            <span className="text-indigo-800">Net normalized (rent & salaries spread daily)</span>
            <span className="font-bold tabular-nums whitespace-nowrap text-indigo-900">{inr(netNormalizedProfit)}</span>
          </div>
        </div>
        {pnl.onlineDiscounts > 0.5 && (
          <p className="px-4 sm:px-5 pb-3 text-[11px] text-gray-500">
            Discounts you funded on Zomato/Swiggy orders this period: {inr(pnl.onlineDiscounts)} - already taken out of revenue above (menu value of those orders was that much higher).
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ratios vs benchmarks */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900">Cost ratios vs a healthy QSR</h3>
            <p className="text-xs text-gray-500">Share of revenue, compared with what well-run quick-service restaurants aim for</p>
          </div>
          <div className="divide-y divide-gray-50">
            {ratios.map((r) => (
              <div key={r.label} className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-[11px] text-gray-500">{r.note}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center justify-end gap-2">
                    <StatusPill status={r.status} />
                    <p className="text-sm font-bold tabular-nums text-gray-900">{pctText(r.value)}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">target {r.target}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per order */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 sm:px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900">One order, by channel</h3>
            <p className="text-xs text-gray-500">What an average order brings in and what's left after food, packaging and the platform's cut</p>
          </div>
          {orders === null ? (
            <p className="p-5 text-sm text-gray-500">Loading order counts…</p>
          ) : channels.length === 0 ? (
            <p className="p-5 text-sm text-gray-500">No POS orders synced for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">Per order</th>
                    {channels.map((c) => <th key={c.key} className="px-4 py-2 text-right font-semibold text-gray-700">{c.name}</th>)}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[
                    { label: 'Orders', cell: (c: typeof channels[number]) => c.orders.toLocaleString('en-IN') },
                    { label: 'Average order value', cell: (c: typeof channels[number]) => inr(c.aov) },
                    { label: '− Food & packaging', cell: (c: typeof channels[number]) => inr(c.cogsPerOrder) },
                    { label: '− Platform cut', cell: (c: typeof channels[number]) => (c.cut ? inr(c.cutPerOrder) : '-') },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-gray-50">
                      <td className="px-4 py-2 text-gray-600">{row.label}</td>
                      {channels.map((c) => <td key={c.key} className="px-4 py-2 text-right">{row.cell(c)}</td>)}
                    </tr>
                  ))}
                  <tr className="bg-gray-50/70 font-semibold">
                    <td className="px-4 py-2 text-gray-900">Left for staff, rent & profit</td>
                    {channels.map((c) => (
                      <td key={c.key} className="px-4 py-2 text-right text-gray-900">
                        {inr(c.left)}
                        <span className="block text-[11px] font-medium text-gray-500">{pctText(c.keptPct)} of the order</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t-2 border-indigo-200 bg-indigo-50/60">
                    <td colSpan={channels.length + 1} className="px-4 py-2">
                      <span className="text-sm font-semibold text-indigo-900">{byFood ? 'Same food on every channel' : `Same order value on every channel: ${inr(sameValue)}`}</span>
                      <span className="block text-[11px] text-indigo-700">
                        {byFood
                          ? `The counter's average order (${inr(sameValue)}) sold on each channel at that channel's prices: same plates, same food cost. ${markupNote}.`
                          : "Normalized to the counter's average order, so the channels compare like for like"}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600">{byFood ? 'Price for the same food' : 'Order value'}</td>
                    {sameOrder.map((o) => <td key={o.key} className="px-4 py-2 text-right">{inr(o.price)}</td>)}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600">− Food &amp; packaging</td>
                    {sameOrder.map((o) => <td key={o.key} className="px-4 py-2 text-right">{inr(o.food)}</td>)}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600">− Platform cut</td>
                    {sameOrder.map((o) => <td key={o.key} className="px-4 py-2 text-right">{o.cut ? inr(o.cut) : '-'}</td>)}
                  </tr>
                  <tr className="border-b border-gray-50 font-semibold">
                    <td className="px-4 py-2 text-gray-900">Left for staff, rent &amp; profit</td>
                    {sameOrder.map((o) => (
                      <td key={o.key} className="px-4 py-2 text-right text-gray-900">
                        {inr(o.left)}
                        <span className="block text-[11px] font-medium text-gray-500">{pctText(o.keptPct)} of the order</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600">− Staff, rent &amp; running costs</td>
                    {sameOrder.map((o) => <td key={o.key} className="px-4 py-2 text-right">{inr(overheadPerOrder)}</td>)}
                  </tr>
                  <tr className="bg-gray-50/70 font-semibold">
                    <td className="px-4 py-2 text-gray-900">Profit per order</td>
                    {sameOrder.map((o) => (
                      <td key={o.key} className={`px-4 py-2 text-right ${o.profit < 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                        {inr(o.profit)}
                        <span className="block text-[11px] font-medium text-gray-500">{pctText(o.profitPct)} of the order</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="px-4 py-3 text-[11px] text-gray-500">{byFood ? "Food and packaging are shared out by how much food each channel sold, valued at counter prices (each dish's latest counter price in the POS), because online menus charge more for the same plates." : "Food and packaging are shared out by each channel's share of sales."} Staff, rent, electricity, running costs, equipment, interest and marketing are shared equally across all {totalOrders.toLocaleString('en-IN')} orders ({inr(overheadPerOrder)} each), with salaries, rent and electricity counted day by day. Orders come from the POS.</p>
            </div>
          )}
        </div>
      </div>

      {/* Survival numbers */}
      {survival && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-gray-900">Break-even</h3>
            <span className="text-xs text-gray-500">based on {survival.label}, the last full month</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500">Monthly fixed bill</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{inr(survival.fixed)}</p>
              <p className="text-[11px] text-gray-500">staff, rent, power, running costs, equipment, interest</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500">Kept from each ₹100 after food <span className="font-semibold text-indigo-700">CM1</span></p>
              <p className="text-lg font-bold tabular-nums text-gray-900">₹{(survival.cm1Ratio * 100).toFixed(1)}</p>
              <p className="text-[11px] text-gray-500">gross profit: sales minus ingredients</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500">After packaging and platform commission <span className="font-semibold text-indigo-700">CM2</span></p>
              <p className="text-lg font-bold tabular-nums text-gray-900">₹{(survival.cm2Ratio * 100).toFixed(1)}</p>
              <p className="text-[11px] text-gray-500">what an order really earns once it leaves the shop</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500">After ads and marketing too <span className="font-semibold text-indigo-700">CM3</span></p>
              <p className="text-lg font-bold tabular-nums text-gray-900">₹{(survival.cm3Ratio * 100).toFixed(1)}</p>
              <p className="text-[11px] text-gray-500">left to pay staff, rent and the rest; break-even uses this</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-[11px] text-amber-700">Sales needed to break even</p>
              <p className="text-lg font-bold tabular-nums text-amber-900">{survival.breakEvenPerDay ? `${inr(survival.breakEvenPerDay)}/day` : '-'}</p>
              <p className="text-[11px] text-amber-700">{periodLabel}: {inr(salesPerDay)}/day so far</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-[11px] text-emerald-700">Sales needed for 20% net</p>
              <p className="text-lg font-bold tabular-nums text-emerald-900">{survival.target20PerDay ? `${inr(survival.target20PerDay)}/day` : 'Not reachable at this margin'}</p>
              <p className="text-[11px] text-emerald-700">with the same costs and margins</p>
            </div>
          </div>
        </div>
      )}

      {/* Trend */}
      {trendData.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-base font-bold text-gray-900">Last {trendData.length} months</h3>
          <p className="text-xs text-gray-500 mb-3">Revenue (bars) and how much of it is left at each step (lines). The month in progress counts salaries, rent and electricity day by day, so it compares with full months.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis yAxisId="rev" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} width={48} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip formatter={(value: number, name: string) => (name === 'Revenue' ? [inr(value), name] : [`${value}%`, name])} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="#bae6fd" radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="cm2" name="CM2 %" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="pct" type="monotone" dataKey="ebitda" name="EBITDA %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="pct" type="monotone" dataKey="net" name="Net margin %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 px-2 text-right font-medium">Revenue</th>
                  <th className="py-2 px-2 text-right font-medium">Gross profit</th>
                  <th className="py-2 px-2 text-right font-medium">CM2</th>
                  <th className="py-2 px-2 text-right font-medium">EBITDA</th>
                  <th className="py-2 pl-2 text-right font-medium">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {trendData.map((t) => (
                  <tr key={t.label} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-700">{t.label}</td>
                    <td className="py-1.5 px-2 text-right">{inr(t.revenue)}</td>
                    <td className="py-1.5 px-2 text-right">{inr(t.cm1Amt)}</td>
                    <td className="py-1.5 px-2 text-right">{inr(t.cm2Amt)}</td>
                    <td className={`py-1.5 px-2 text-right ${t.ebitdaAmt < 0 ? 'text-rose-600' : ''}`}>{inr(t.ebitdaAmt)}</td>
                    <td className={`py-1.5 pl-2 text-right font-semibold ${t.netAmt < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{inr(t.netAmt)} <span className="font-normal text-gray-500">({t.net}%)</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Glossary */}
      <details className="bg-white rounded-xl border border-gray-200 group">
        <summary className="cursor-pointer select-none px-4 sm:px-5 py-4 flex items-center gap-2 text-base font-bold text-gray-900">
          <Info className="w-4 h-4 text-indigo-600" /> What these terms mean
        </summary>
        <dl className="px-4 sm:px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {[
            ['Revenue', 'Money customers paid us for food, without GST. On Zomato/Swiggy that\'s the order value after the discounts we funded.'],
            ['GMV', 'Gross merchandise value: orders at full menu price, before discounts. Revenue + the discounts we gave.'],
            ['Gross margin / CM1', 'Revenue minus ingredients. How much each sale earns before anything else.'],
            ['CM2 (contribution margin 2)', 'CM1 minus packaging and platform commission - what an order really earns once it has left the shop.'],
            ['CM3', 'CM2 minus ads and marketing - what\'s left to pay salaries, rent and the rest.'],
            ['EBITDA', 'Earnings before interest, tax, depreciation and amortisation: profit from running the shop, before loan interest and before spreading the cost of equipment.'],
            ['Depreciation', 'The cost of equipment and the scooter, spread over the 3 years they\'re used, instead of all in the month bought.'],
            ['Net margin', 'Net profit as a share of revenue - the bottom line. Our goal is 20%.'],
            ['Prime cost', 'Food + packaging + staff. Restaurants aim to keep it under 60% of sales.'],
            ['AOV', 'Average order value: revenue ÷ number of orders.'],
            ['Break-even', 'Sales at which profit is exactly zero: fixed bill ÷ the share of each sale left after variable costs (CM3).'],
            ['CAC, LTV, repeat rate', 'Cost to win a customer, what a customer is worth over time, and how many come back. Not tracked yet - needs a phone number on each counter order.'],
          ].map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-semibold text-gray-900">{term}</dt>
              <dd className="text-gray-600">{meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
