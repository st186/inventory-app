// Pieces every Insights tab shares, in the warm-ledger look: the chart card and the one chart
// component the tabs draw with (colours from chart-theme only), the tooltips, the "vs last
// period" helpers and the money formatting. Charts are built inside <LazyChart> render functions
// only - a recharts element made outside one would capture the library before it has loaded.
import * as React from 'react';
import type { TooltipProps } from 'recharts';
import { LazyChart, ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from '../../charts/lazyRecharts';
import { CHART_COLORS, CHART_SERIES, ChartLegendChips, ChartTooltipCard, chartAxisProps, chartGridProps, chartCursor, type LegendChip } from '../../ui/chart-theme';
import { Card } from '../../ui/card';
import { EmptyState } from '../../ui/empty-state';
import { formatCompactINR, formatINR, formatNumberIN } from '../../ui/money';
import type { StatDelta } from '../../ui/stat-tile';
import { cn } from '../../ui/utils';
import { RANGE_PRESETS, presetLabel, type RangePreset } from '../../ui/date-utils';
import { translate, type Lang } from '../../../utils/i18n';
import { type AnalyticsData } from '../useAnalyticsData';

export { CHART_COLORS, CHART_SERIES };

/** Whole rupees, Indian grouping: ₹3,12,400. */
export const inr = (value: number | null | undefined) => formatINR(value === null || value === undefined ? value : Math.round(value));
/** "12.4%" (one decimal), or "–" when there is nothing to divide by. */
export const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '–');

/** A StatTile delta from two figures (none when there is nothing to compare with). */
export function deltaOf(current: number, previous: number, label: string, goodWhen: 'up' | 'down' = 'up'): StatDelta | undefined {
  if (!previous || !Number.isFinite(previous) || !Number.isFinite(current)) return undefined;
  return { value: ((current - previous) / Math.abs(previous)) * 100, label, goodWhen };
}
/** A point difference between two percentages ("+1.2 pts"). */
export function pointsDelta(current: number, previous: number, label: string, goodWhen: 'up' | 'down' = 'up'): StatDelta {
  const diff = current - previous;
  const rounded = Math.round(diff * 10) / 10;
  return { value: diff, label, goodWhen, text: `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)} pts` };
}

/** Short "vs …" label for the selected period (e.g. "vs last month"), in the App language. */
export function shortPrevLabel(d: AnalyticsData, lang: Lang = 'en'): string {
  switch (d.timeFilter) {
    case 'today':
    case 'yesterday':
      return translate(lang, 'insights.vs.day');
    case 'thisWeek':
    case 'lastWeek':
      return translate(lang, 'insights.vs.week');
    case 'thisMonth':
      return translate(lang, 'insights.vs.month');
    case 'lastMonth':
      return translate(lang, 'insights.vs.monthBefore');
    default:
      return translate(lang, 'insights.vs.period');
  }
}

/** The period's name ("This month") in the App language; custom ranges as the hook writes them. */
export function periodText(d: AnalyticsData, lang: Lang = 'en'): string {
  const choice = d.timeFilterChoice;
  return choice !== 'custom' && (RANGE_PRESETS as string[]).includes(choice) ? presetLabel(choice as RangePreset, lang) : d.getPeriodLabel();
}

// ---- Tooltips (recharts `content`) -------------------------------------------------------------
export const CustomTooltip = (props: TooltipProps<any, any>) => <ChartTooltipCard {...(props as any)} money />;
export const CustomPieTooltip = (props: TooltipProps<any, any>) => (
  <ChartTooltipCard {...(props as any)} formatValue={(v: number, _n: string) => `${inr(v)}${(props.payload?.[0]?.payload as any)?.percentage !== undefined ? ` · ${(props.payload?.[0]?.payload as any).percentage}%` : ''}`} />
);
export const ProductionTooltip = (props: TooltipProps<any, any>) => <ChartTooltipCard {...(props as any)} formatValue={(v: number) => `${formatNumberIN(v)} pcs`} />;
export const WastageTooltip = (props: TooltipProps<any, any>) => <ChartTooltipCard {...(props as any)} formatValue={(v: number) => `${v.toFixed(2)} kg`} />;

// ---- Chart card ---------------------------------------------------------------------------------
export function ChartCard({
  title,
  caption,
  legend,
  actions,
  children,
  footer,
  className,
}: {
  title: React.ReactNode;
  caption?: React.ReactNode;
  legend?: LegendChip[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('min-w-0 gap-3 lg:p-5', className)}>
      <div className="flex min-h-8 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-subtitle font-semibold text-text">{title}</h3>
          {caption && <p className="text-label text-text-3">{caption}</p>}
        </div>
        {actions && <div className="-mt-1.5 -mr-2 flex shrink-0 items-center">{actions}</div>}
      </div>
      {legend && legend.length > 0 && <ChartLegendChips items={legend} />}
      {children}
      {footer && <div className="border-t border-border pt-3 text-body-sm text-text-2">{footer}</div>}
    </Card>
  );
}

/** What a chart shows when the period has nothing to draw. */
export function ChartEmpty({ title = 'No data for this period', body }: { title?: string; body?: React.ReactNode }) {
  return <EmptyState compact title={title} body={body ?? 'Pick another period or store.'} />;
}

// ---- The chart ----------------------------------------------------------------------------------
export type SeriesSpec = {
  key: string;
  name: string;
  color: string;
  kind?: 'line' | 'bar';
  stack?: string;
  /** Previous-period lines are dashed. */
  dashed?: boolean;
  /** Per-bar colours (e.g. one colour a category). */
  cellColors?: string[];
};
export type ValueFormat = 'money' | 'number' | 'percent' | ((value: number) => string);

const formatterFor = (format: ValueFormat) =>
  typeof format === 'function'
    ? format
    : format === 'money'
      ? (v: number) => inr(v)
      : format === 'percent'
        ? (v: number) => `${Math.round(v * 10) / 10}%`
        : (v: number) => formatNumberIN(Math.round(v * 10) / 10);
const axisFor = (format: ValueFormat) =>
  typeof format === 'function'
    ? format
    : format === 'money'
      ? (v: number) => formatCompactINR(v)
      : format === 'percent'
        ? (v: number) => `${v}%`
        : (v: number) => formatNumberIN(v);

/** Legend chips for a series list: solid series once each, and one dashed "Last period" chip. */
export function legendFor(series: SeriesSpec[], prevLabel = 'Last period'): LegendChip[] {
  const chips: LegendChip[] = series.filter((s) => !s.dashed).map((s) => ({ label: s.name, color: s.color, shape: s.kind === 'bar' ? 'square' : 'line' }));
  if (series.some((s) => s.dashed)) chips.push({ label: prevLabel, color: CHART_COLORS.previous, dashed: true });
  return chips;
}

export function TrendChart({
  data,
  series,
  xKey = 'period',
  height = 240,
  format = 'money',
  axisFormat,
  layout = 'horizontal',
  refLines,
  ariaLabel,
  categoryWidth = 96,
}: {
  data: any[];
  series: SeriesSpec[];
  xKey?: string;
  height?: number;
  format?: ValueFormat;
  axisFormat?: ValueFormat;
  /** "vertical" = horizontal bars (category labels down the side). */
  layout?: 'horizontal' | 'vertical';
  refLines?: { y: number; color: string }[];
  ariaLabel: string;
  categoryWidth?: number;
}) {
  const fmt = formatterFor(format);
  const tick = axisFor(axisFormat ?? format);
  const vertical = layout === 'vertical';
  return (
    <div role="img" aria-label={ariaLabel} className="min-w-0">
      <LazyChart height={height}>
        {() => (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={data} layout={layout} margin={{ top: 4, right: 8, bottom: 0, left: vertical ? 0 : -4 }} barCategoryGap={vertical ? 8 : '20%'}>
              <CartesianGrid {...chartGridProps} vertical={vertical} horizontal={!vertical} />
              {vertical ? (
                <>
                  <XAxis type="number" {...chartAxisProps} tickFormatter={tick} />
                  <YAxis type="category" dataKey={xKey} {...chartAxisProps} width={categoryWidth} interval={0} tickFormatter={(v: string) => (String(v).length > 14 ? `${String(v).slice(0, 13)}…` : v)} />
                </>
              ) : (
                <>
                  <XAxis dataKey={xKey} {...chartAxisProps} minTickGap={20} interval="preserveStartEnd" />
                  <YAxis {...chartAxisProps} width={52} tickFormatter={tick} allowDecimals={format !== 'number'} />
                </>
              )}
              <Tooltip content={<ChartTooltipCard formatValue={(v: number) => fmt(v)} />} cursor={chartCursor} />
              {series.map((s) =>
                s.kind === 'bar' ? (
                  <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stack} maxBarSize={vertical ? 16 : 28} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false}>
                    {s.cellColors?.map((c, i) => <Cell key={i} fill={c} />)}
                  </Bar>
                ) : (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.dashed ? CHART_COLORS.previous : s.color}
                    strokeWidth={s.dashed ? 1.5 : 2.5}
                    strokeDasharray={s.dashed ? '4 4' : undefined}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ),
              )}
              {refLines?.map((r, i) => <ReferenceLine key={i} y={r.y} stroke={r.color} strokeDasharray="6 4" ifOverflow="extendDomain" />)}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </LazyChart>
    </div>
  );
}

// ---- Small figures row under a chart (e.g. order totals) ----------------------------------------
export function FigureRow({ items }: { items: { label: React.ReactNode; value: React.ReactNode; tone?: 'default' | 'danger' | 'success' }[] }) {
  return (
    <dl className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col">
          <dt className="truncate text-label text-text-3">{item.label}</dt>
          <dd className={cn('num text-body-md font-semibold', item.tone === 'danger' ? 'text-danger' : item.tone === 'success' ? 'text-success' : 'text-text')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Kept for the production tab: a legend that tells previous-period (dashed) series apart ---
export function makeRenderers(_d: AnalyticsData) {
  const renderPrevAwareLegend = (props: any) => {
    const { payload } = props;
    if (!payload || payload.length === 0) return null;
    const items: LegendChip[] = payload.map((entry: any) => ({
      label: entry.value,
      color: entry.color,
      dashed: typeof entry.payload?.strokeDasharray === 'string' && entry.payload.strokeDasharray.length > 0,
    }));
    return <ChartLegendChips items={items} className="mt-2 justify-center" />;
  };
  return { renderPrevAwareLegend };
}
