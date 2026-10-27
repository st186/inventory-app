import * as React from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { Skeleton } from "./skeleton";
import { StatusChip } from "./status-chip";
import { tintClasses, tintForLabel, type Tint } from "./tints";

// A number with its label, on the pastel of its kind (sales mint, cash peach, Paytm sky, ...;
// see tints.ts), worked out from the label unless `tint` says otherwise. Red (danger) when the
// figure is bad.
//
//   <StatGrid>
//     <StatTile label="Net profit · Oct" value={<Money value={48200} />} delta={{ value: 6, label: "vs Sep" }} />
//     <StatTile label="Cash in hand" value={<Money value={3000} />} chip={<StatusChip tone="warning">Not counted</StatusChip>} />
//   </StatGrid>
//
//   <StatTile hero label="Sales today" value={<Money value={10754} />} chip={...} caption="Usual for a Friday: ₹9,700–11,800">
//     <StatSplit items={[{ label: "Counter", value: <Money value={6120} /> }, ...]} />
//   </StatTile>
//
// While loading, pass `loading` - never show "0" as a placeholder.

export type StatDelta = {
  /** Percent change, e.g. 6 or -3.5. */
  value: number;
  /** What it's compared with: "vs Sep", "vs last week". */
  label?: string;
  /** Which direction is good (default up). Decides green or red. */
  goodWhen?: "up" | "down";
  /** Text for the number part; default "+6%" / "−3.5%". */
  text?: string;
};

export type StatTileProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Bigger value (32 px) for the one headline figure on a screen. */
  hero?: boolean;
  delta?: StatDelta;
  /** A status chip under the value (e.g. "Not counted"). */
  chip?: React.ReactNode;
  /** Status chip on the label row (hero cards, e.g. "On track"). */
  headerChip?: React.ReactNode;
  caption?: React.ReactNode;
  /** Tint the tile when the figure is bad. Pair with an icon and a word. */
  tone?: "default" | "danger";
  /** Pastel for this kind of figure; by default from the label. "none" keeps it white. */
  tint?: Tint | "none";
  /** Optional 40 px trend line under the value (chart-1, no fill). */
  sparkline?: number[];
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  /** Extra content under a divider (e.g. StatSplit). */
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

function formatDeltaText(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

function DeltaChip({ delta }: { delta: StatDelta }) {
  const up = delta.value >= 0;
  const good = (delta.goodWhen ?? "up") === "up" ? up : !up;
  const flat = Math.round(delta.value * 10) / 10 === 0;
  return (
    <StatusChip tone={flat ? "neutral" : good ? "success" : "danger"} icon={flat ? undefined : up ? ArrowUp : ArrowDown}>
      <span className="num">{delta.text ?? formatDeltaText(delta.value)}</span>
      {delta.label && <span>{delta.label}</span>}
    </StatusChip>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 100;
  const h = 40;
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * w).toFixed(2)},${(h - 2 - ((p - min) / span) * (h - 4)).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true">
      <polyline points={d} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function StatTile({
  label,
  value,
  hero,
  delta,
  chip,
  headerChip,
  caption,
  tone = "default",
  tint,
  sparkline,
  href,
  onClick,
  loading,
  children,
  className,
  ...aria
}: StatTileProps) {
  const interactive = Boolean(href || onClick);
  const danger = tone === "danger";
  const tintKey = danger || tint === "none" ? null : tint ?? tintForLabel(label);
  const tinted = tintKey ? tintClasses[tintKey] : null;
  const classes = cn(
    "flex min-w-0 flex-col rounded-lg border text-left text-text no-underline",
    hero ? "gap-3 p-4" : "gap-1.5 p-3.5",
    danger ? "border-danger-border bg-danger-soft" : tinted ? tinted.tile : "border-border bg-surface",
    interactive &&
      "cursor-pointer outline-none transition-[filter,background-color] duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    interactive && (tinted || danger ? "hover:brightness-[0.97] active:brightness-[0.94]" : "hover:bg-surface-2/60 active:bg-surface-2"),
    className,
  );

  const content = loading ? (
    <>
      <Skeleton className="h-4 w-24" />
      <Skeleton className={cn(hero ? "h-9 w-40" : "h-7 w-28")} />
      <Skeleton className="h-4 w-20" />
    </>
  ) : (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className={cn("text-label font-medium", danger ? "text-danger" : tinted ? tinted.label : "text-text-2")}>{label}</span>
        {headerChip}
        {interactive && !headerChip && <ChevronRight className="size-4 shrink-0 text-text-disabled" aria-hidden="true" />}
      </div>
      <div className={cn("num font-semibold", hero ? "text-display" : "text-title-lg", danger ? "text-danger" : tinted?.value)}>{value}</div>
      {sparkline && <Sparkline points={sparkline} />}
      {(delta || chip) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {delta && <DeltaChip delta={delta} />}
          {chip}
        </div>
      )}
      {caption && <span className={cn("text-label", tinted ? tinted.label : "text-text-3")}>{caption}</span>}
      {children && <div className={cn("border-t pt-3", tinted ? "border-black/10" : "border-border")}>{children}</div>}
    </>
  );

  if (href) {
    return (
      <a data-slot="stat-tile" href={href} onClick={onClick} className={classes} aria-busy={loading || undefined} {...aria}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button data-slot="stat-tile" type="button" onClick={onClick} className={classes} aria-busy={loading || undefined} {...aria}>
        {content}
      </button>
    );
  }
  return (
    <div data-slot="stat-tile" className={classes} aria-busy={loading || undefined} {...aria}>
      {content}
    </div>
  );
}

/** Two tiles per row on phones, up to four on wide screens. */
function StatGrid({ className, children, columns = 2 }: { className?: string; children: React.ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <div
      data-slot="stat-grid"
      className={cn(
        "grid grid-cols-2 gap-3",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Inline split under a hero figure: Counter ₹6,120 · Zomato ₹2,890 · Swiggy ₹1,744. */
function StatSplit({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl
      data-slot="stat-split"
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-col">
          <dt className="text-label text-text-3">{item.label}</dt>
          <dd className="num text-body-md font-semibold text-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { StatTile, StatGrid, StatSplit, DeltaChip };
