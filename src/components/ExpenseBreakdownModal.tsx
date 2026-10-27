import { useMemo, useState } from 'react';
import { X, TrendingUp, TrendingDown, Package, DollarSign, BarChart3, AlertTriangle, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

  const renderAnomalyDot = (color: string, jump: ItemAnalysis['maxJump']) => (props: any) => {
    const { cx, cy, payload } = props;
    const isAnomaly = !!jump && Math.abs(jump.percent) >= SUDDEN_CHANGE_THRESHOLD_PERCENT && payload.rawDate === jump.toDate;
    if (isAnomaly) {
      return <circle key={`dot-${payload.rawDate}`} cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />;
    }
    return <circle key={`dot-${payload.rawDate}`} cx={cx} cy={cy} r={3} fill={color} />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 via-rose-500 to-orange-600 text-white p-6 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 flex-shrink-0">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                {category} Breakdown
              </h2>
              <p className="text-orange-100 mt-1 text-sm">
                Total Spent: ₹{totalAmount.toFixed(2)} • {items.length} transactions • {topItems.length} unique items
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors flex-shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Cost Trend Over Time - the actual point of this modal: what has each item's
              price done across every purchase, not just where it started and ended. */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-4.5 h-4.5 text-rose-600" />
                Cost Trend Over Time
              </h3>
              {chartableItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {chartableItems.map((item) => (
                    <button
                      key={item.itemName}
                      onClick={() => setSelectedItem(item.itemName)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        activeChartItem?.itemName === item.itemName
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {item.itemName}{item.mixedUnits ? ' *' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!activeChartItem ? (
              <div className="text-center py-10 text-gray-500">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No item in this category has enough purchases yet to plot a trend.</p>
                <p className="text-xs text-gray-400 mt-1">Needs at least 2 purchases on different dates.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{activeChartItem.itemName}</p>
                    <p className="text-xs text-gray-500">
                      ₹{activeChartItem.firstUnitPrice.toFixed(2)} → ₹{activeChartItem.lastUnitPrice.toFixed(2)} per {activeChartItem.canonicalUnit} across {activeChartItem.history.length} purchase dates
                      {activeChartItem.mixedUnits && (
                        <span className="text-amber-600"> (normalized - logged in a mix of units)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeChartItem.maxJump && Math.abs(activeChartItem.maxJump.percent) >= SUDDEN_CHANGE_THRESHOLD_PERCENT && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        {activeChartItem.maxJump.percent > 0 ? '+' : ''}{activeChartItem.maxJump.percent.toFixed(0)}% on {formatShortDate(activeChartItem.maxJump.toDate)}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      activeChartItem.netChangePercent > 0.5 ? 'bg-red-50 text-red-600' : activeChartItem.netChangePercent < -0.5 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {activeChartItem.netChangePercent > 0.5 ? <TrendingUp className="w-3 h-3" /> : activeChartItem.netChangePercent < -0.5 ? <TrendingDown className="w-3 h-3" /> : null}
                      {activeChartItem.netChangePercent >= 0 ? '+' : ''}{activeChartItem.netChangePercent.toFixed(1)}% overall
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={activeChartItem.history.map((p) => ({ date: formatShortDate(p.date), rawDate: p.date, price: p.price }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} width={50} />
                    <Tooltip
                      formatter={(value: number) => [`₹${value.toFixed(2)}`, `Cost/${activeChartItem.canonicalUnit}`]}
                      labelFormatter={(label: string) => label}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#e11d48"
                      strokeWidth={2}
                      dot={renderAnomalyDot('#e11d48', activeChartItem.maxJump)}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-500 mt-2">
                  Each point is that purchase date's total spend ÷ total quantity bought, in ₹/{activeChartItem.canonicalUnit}
                  {activeChartItem.mixedUnits && ' - purchases logged in g/mL are converted to kg/L first, so a day bought in grams and a day bought in kilos are actually comparable'}.
                  {activeChartItem.maxJump && Math.abs(activeChartItem.maxJump.percent) >= SUDDEN_CHANGE_THRESHOLD_PERCENT && (
                    <> The <span className="inline-block w-2 h-2 rounded-full bg-red-500 align-middle mx-1" /> marks the biggest single jump - {formatShortDate(activeChartItem.maxJump.fromDate)} (₹{activeChartItem.maxJump.fromPrice.toFixed(2)}) to {formatShortDate(activeChartItem.maxJump.toDate)} (₹{activeChartItem.maxJump.toPrice.toFixed(2)}).</>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Items by Spend */}
            <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-2xl p-6 border-2 border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Top Items by Spend
              </h3>
              <div className="space-y-3">
                {topItems.slice(0, 10).map((item, index) => {
                  const percentage = totalAmount > 0 ? (item.totalSpent / totalAmount) * 100 : 0;
                  return (
                    <div key={`top-${item.itemName}-${index}`} className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                              {index + 1}
                            </span>
                            <span className="font-medium text-gray-900">{item.itemName}</span>
                            {item.mixedUnits && (
                              <span className="text-[10px] text-amber-600 font-normal" title="Logged in a mix of units (e.g. g and kg) - quantity/price shown are unit-normalized">* mixed units</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1 ml-8">
                            {item.quantity.toFixed(2)} {item.canonicalUnit} • ₹{item.avgUnitPrice.toFixed(2)}/{item.canonicalUnit} avg
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-bold text-gray-900">₹{item.totalSpent.toFixed(2)}</div>
                          <div className="text-xs text-blue-600 font-medium">{percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-sky-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sudden Price Changes - the biggest single-purchase jump per item, not a
                first-vs-last comparison that can hide a mid-period spike entirely. */}
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border-2 border-orange-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                Sudden Price Changes
              </h3>
              {suddenChanges.length === 0 ? (
                <div className="bg-white rounded-lg p-8 text-center text-gray-500">
                  <TrendingDown className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No purchase-to-purchase jump over {SUDDEN_CHANGE_THRESHOLD_PERCENT}% detected</p>
                  <p className="text-sm mt-1">Every item's price has moved gradually this period</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suddenChanges.slice(0, 10).map((item, index) => {
                    const jump = item.maxJump!;
                    const isIncrease = jump.percent > 0;
                    return (
                      <div key={`fluc-${item.itemName}-${index}`} className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 flex items-center gap-1.5">
                              {item.itemName}
                              {item.mixedUnits && (
                                <span className="text-[10px] text-amber-600 font-normal" title="Logged in a mix of units - prices below are unit-normalized">* mixed units</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {formatShortDate(jump.fromDate)} → {formatShortDate(jump.toDate)}
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                            isIncrease
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {isIncrease ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            {isIncrease ? '+' : ''}{jump.percent.toFixed(1)}%
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-xs text-gray-600">{formatShortDate(jump.fromDate)}</div>
                            <div className="font-semibold text-gray-900">₹{jump.fromPrice.toFixed(2)}/{item.canonicalUnit}</div>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-xs text-gray-600">{formatShortDate(jump.toDate)}</div>
                            <div className="font-semibold text-gray-900">₹{jump.toPrice.toFixed(2)}/{item.canonicalUnit}</div>
                          </div>
                        </div>
                        <div className={`mt-2 text-xs font-medium ${
                          isIncrease ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {isIncrease ? 'Jumped up' : 'Dropped'} ₹{Math.abs(jump.toPrice - jump.fromPrice).toFixed(2)}/{item.canonicalUnit} in one purchase
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="mt-6 bg-gradient-to-br from-orange-50 to-rose-50 rounded-2xl p-6 border-2 border-orange-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-orange-600" />
              Summary Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
                <div className="text-xs uppercase tracking-wide text-blue-100">Total Items</div>
                <div className="text-2xl font-semibold">{topItems.length}</div>
              </div>
              <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl p-4 shadow-lg shadow-sky-500/20 text-white">
                <div className="text-xs uppercase tracking-wide text-sky-100">Transactions</div>
                <div className="text-2xl font-semibold">{items.length}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 shadow-lg shadow-emerald-500/20 text-white">
                <div className="text-xs uppercase tracking-wide text-emerald-100">Avg per Item</div>
                <div className="text-2xl font-semibold">
                  {topItems.length > 0 ? `₹${(totalAmount / topItems.length).toFixed(0)}` : '₹0'}
                </div>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
                <div className="text-xs uppercase tracking-wide text-amber-100">Items with Price Jumps</div>
                <div className="text-2xl font-semibold">
                  {suddenChanges.length}
                  <span className="text-sm font-normal ml-1">/ {topItems.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
