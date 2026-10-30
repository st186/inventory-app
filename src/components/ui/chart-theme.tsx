import * as React from "react";

import { cn } from "./utils";
import { formatINR, formatNumberIN } from "./money";

// Chart look shared by ui/chart.tsx (ChartContainer) and screens that draw Recharts through the
// lazy loader in components/charts/lazyRecharts.tsx. No Recharts import here, so using these
// doesn't pull the chart library into a screen's first load.
//
//   <Line dataKey="sales" stroke={CHART_COLORS.primary} strokeWidth={2.5} dot={false} />
//   <Line dataKey="lastMonth" stroke={CHART_COLORS.previous} strokeDasharray="4 4" />
//   <CartesianGrid {...chartGridProps} />   <XAxis {...chartAxisProps} />
//   <Tooltip content={<ChartTooltipCard money />} cursor={chartCursor} />
//   <ChartLegendChips items={[{ label: "Sales", color: CHART_COLORS.primary }, { label: "Last month", color: CHART_COLORS.previous, dashed: true }]} />
//
// Colours come only from --chart-* and --channel-*. Previous period = dashed chart-5. No
// gradient fills (at most a 12 % flat fill on area charts).

export const CHART_COLORS = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  tertiary: "var(--chart-3)",
  quaternary: "var(--chart-4)",
  previous: "var(--chart-5)",
  other: "var(--chart-5)",
  grid: "var(--chart-grid)",
} as const;

/** Series colours in order, for charts with several series. */
export const CHART_SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

/** Channel identity colours. Always label the bar too - colour alone isn't enough. */
export const CHANNEL_COLORS = {
  counter: "var(--channel-counter)",
  zomato: "var(--channel-zomato)",
  swiggy: "var(--channel-swiggy)",
} as const;

/** The same colours resolved to real values, for canvas/SVG code that can't read CSS vars. */
export function readChartColor(cssVar: string): string {
  if (typeof window === "undefined") return cssVar;
  const name = cssVar.replace(/^var\((--[^)]+)\)$/, "$1");
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || cssVar;
}

/** <XAxis {...chartAxisProps} /> - 12 px text-3 labels, no axis or tick lines. */
export const chartAxisProps = {
  tick: { fill: "var(--text-3)", fontSize: 12 },
  axisLine: false,
  tickLine: false,
  tickMargin: 8,
} as const;

/** <CartesianGrid {...chartGridProps} /> - horizontal lines only. */
export const chartGridProps = {
  stroke: "var(--chart-grid)",
  vertical: false,
} as const;

/** Tooltip cursor: a light band for bars, a thin line for lines. */
export const chartCursor = { fill: "var(--surface-2)", stroke: "var(--border-strong)" } as const;

/** Flat fill for an area chart (never a gradient). */
export const chartAreaFillOpacity = 0.12;

type TooltipEntry = {
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  stroke?: string;
  fill?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: Record<string, unknown>;
};

export type ChartTooltipCardProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: React.ReactNode;
  /** Format values as rupees with Indian grouping. */
  money?: boolean;
  /** Custom value formatter (wins over `money`). */
  formatValue?: (value: number, name: string) => React.ReactNode;
  /** Custom label formatter. */
  formatLabel?: (label: React.ReactNode) => React.ReactNode;
  className?: string;
};

/** Recharts tooltip content: a surface card with elevation 2 and tabular figures. */
export function ChartTooltipCard({ active, payload, label, money, formatValue, formatLabel, className }: ChartTooltipCardProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className={cn("min-w-[9rem] rounded-md border border-border bg-surface px-3 py-2 text-label text-text shadow-e2", className)}>
      {label !== undefined && label !== null && label !== "" && (
        <div className="mb-1 font-semibold text-text">{formatLabel ? formatLabel(label) : label}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const raw = Array.isArray(entry.value) ? entry.value[entry.value.length - 1] : entry.value;
          const n = typeof raw === "number" ? raw : Number(raw);
          const name = String(entry.name ?? entry.dataKey ?? "");
          const shown = formatValue && Number.isFinite(n) ? formatValue(n, name) : Number.isFinite(n) ? (money ? formatINR(n) : formatNumberIN(n)) : String(raw ?? "");
          return (
            <div key={`${name}-${i}`} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} aria-hidden="true" />
              <span className="flex-1 text-text-2">{name}</span>
              <span className="num font-semibold text-text">{shown}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type LegendChip = { label: React.ReactNode; color: string; dashed?: boolean; shape?: "line" | "square" };

/** Always-visible legend as neutral chips above the chart. */
export function ChartLegendChips({ items, className }: { items: LegendChip[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Legend">
      {items.map((item, i) => (
        <li key={i} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-caption font-medium text-text-2">
          {item.shape === "square" ? (
            <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} aria-hidden="true" />
          ) : item.dashed ? (
            <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: item.color }} aria-hidden="true" />
          ) : (
            <span className="h-[3px] w-3 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * This period against the last, one row each: a coloured bar for now and a grey one under it for
 * the last period, on the same scale, with both numbers and the change (owner, 30 Oct 2026: a day by
 * day stack hid the comparison).
 */
export function CompareBars({
  items,
  format = (n: number) => String(n),
  thisLabel = "This period",
  lastLabel = "Last period",
  className,
}: {
  items: { label: React.ReactNode; now: number; last: number | null; color: string }[];
  format?: (n: number) => string;
  thisLabel?: string;
  lastLabel?: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.flatMap((i) => [i.now, i.last ?? 0]));
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {items.map((item, i) => {
        const change = item.last ? Math.round(((item.now - item.last) / item.last) * 100) : null;
        return (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="font-medium text-text">{item.label}</span>
              <span className="num text-text-2">
                <span className="font-semibold text-text">{format(item.now)}</span>
                {item.last !== null && <> · {lastLabel.toLowerCase()} {format(item.last)}</>}
                {change !== null && change !== 0 && (
                  <span className={cn("ml-1.5 font-semibold", change > 0 ? "text-success" : "text-danger")}>{change > 0 ? "+" : ""}{change}%</span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1" role="img" aria-label={`${typeof item.label === "string" ? item.label : ""} ${thisLabel} ${format(item.now)}${item.last !== null ? `, ${lastLabel} ${format(item.last)}` : ""}`}>
              <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${(Math.max(0, item.now) / max) * 100}%`, backgroundColor: item.color }} />
              </div>
              {item.last !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-text-3/60" style={{ width: `${(Math.max(0, item.last) / max) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal share bars (channel mix): label, ₹ and % above a 10 px track. */
export function ShareBars({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: number; color: string; valueText?: React.ReactNode }[];
  className?: string;
}) {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {items.map((item, i) => {
        const pct = Math.round((Math.max(0, item.value) / total) * 100);
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="text-text">{item.label}</span>
              <span className="num font-semibold text-text">
                {item.valueText ?? formatINR(item.value)} · {pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
