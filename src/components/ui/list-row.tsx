import * as React from "react";
import type { LucideIcon } from "lucide-react@0.487.0";
import { ChevronDown, ChevronRight } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { Money } from "./money";
import { isIndicText } from "../../utils/i18n";

// The default way to show records on phones (instead of tables or a card per record).
//
//   <ListGroup title="Needs your attention" action={<Button variant="link">See all (7)</Button>}>
//     <ListRow icon={Wallet} title="Cash short by ₹240" subtitle="Yesterday's day close"
//              trailing={<StatusChip tone="danger">1</StatusChip>} href="#/money" />
//     <ListRow title="Chicken" subtitle="3 kg · ₹200 a kg" chip={<Badge>Cash</Badge>} amount={600} onClick={edit} />
//   </ListGroup>
//
// A row with href or onClick is one big tap target with a press state and a chevron.

const wellTones = {
  neutral: "bg-surface-2 text-text-2",
  primary: "bg-primary-soft text-primary",
  brand: "bg-brand-saffron-soft text-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
} as const;

export type IconWellTone = keyof typeof wellTones;

/** 36 px rounded square holding an icon in text-2. Coloured only when the icon is the status. */
function IconWell({
  icon: Icon,
  tone = "neutral",
  size = 36,
  className,
  children,
}: {
  icon?: LucideIcon;
  tone?: IconWellTone;
  size?: 36 | 40;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md [&_svg]:size-5",
        size === 36 ? "size-9" : "size-10",
        wellTones[tone],
        className,
      )}
    >
      {Icon ? <Icon /> : children}
    </span>
  );
}

export type ListRowProps = {
  title: React.ReactNode;
  /** One or two lines under the title (13 px text-3). */
  subtitle?: React.ReactNode;
  /** Icon shorthand: renders an IconWell. */
  icon?: LucideIcon;
  iconTone?: IconWellTone;
  /** Anything on the left: <InitialsAvatar/>, <IconWell/>, an image. Wins over `icon`. */
  leading?: React.ReactNode;
  /** A chip before the amount (e.g. "Cash"). */
  chip?: React.ReactNode;
  /** Amount in rupees, right-aligned, 15 px semibold tabular. */
  amount?: number | null;
  /** Anything on the right (a chip, a stepper, a switch). */
  trailing?: React.ReactNode;
  /** Chevron: defaults to true for rows with href/onClick and no `trailing`; "down" for expanders. */
  chevron?: boolean | "down";
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  /** 60 px rows by default; "compact" is 52 px (read-only figures in a card). */
  density?: "default" | "compact";
  /** Renders the title in text-2 (e.g. a "Done today (3)" collapse row). */
  muted?: boolean;
  className?: string;
  /** Accessible name when the visible title isn't enough. */
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  /** Element id (e.g. for scrolling to a row). */
  id?: string;
};

function ListRow({
  title,
  subtitle,
  icon,
  iconTone = "neutral",
  leading,
  chip,
  amount,
  trailing,
  chevron,
  href,
  onClick,
  disabled,
  density = "default",
  muted,
  className,
  ...aria
}: ListRowProps) {
  const interactive = Boolean(href || onClick) && !disabled;
  const showChevron = chevron ?? (interactive && !trailing);
  const lead = leading ?? (icon ? <IconWell icon={icon} tone={iconTone} /> : null);

  const body = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-body-md font-medium", muted ? "text-text-2" : "text-text")}>{title}</span>
        {subtitle && <span className="line-clamp-2 text-label text-text-3">{subtitle}</span>}
      </span>
      {chip}
      {amount !== undefined && <Money value={amount} className="text-body-md font-semibold text-text" />}
      {trailing}
      {showChevron &&
        (showChevron === "down" ? (
          <ChevronDown className="size-5 shrink-0 text-text-disabled" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-text-disabled" aria-hidden="true" />
        ))}
    </>
  );

  const classes = cn(
    "flex w-full items-center gap-3 px-4 text-left text-text no-underline",
    density === "default" ? "min-h-15 py-2.5" : "min-h-13 py-2",
    interactive &&
      "cursor-pointer outline-none transition-colors duration-(--dur-fast) hover:bg-surface-2/60 active:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    disabled && "opacity-50",
    className,
  );

  if (href && !disabled) {
    return (
      <a data-slot="list-row" href={href} onClick={onClick} className={classes} {...aria}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button data-slot="list-row" type="button" onClick={onClick} disabled={disabled} className={classes} {...aria}>
        {body}
      </button>
    );
  }
  return (
    <div data-slot="list-row" className={classes} {...aria}>
      {body}
    </div>
  );
}

export type ListGroupProps = {
  /** Uppercase section label above the card (More / Settings style). */
  overline?: string;
  /** Section title above the card (16 px semibold, Home style). */
  title?: React.ReactNode;
  /** Small text next to the title, e.g. "2 of 6 done". */
  meta?: React.ReactNode;
  /** Right side of the title row, e.g. a "See all (7)" link button. */
  action?: React.ReactNode;
  /** Shown inside the card when there are no rows. */
  empty?: React.ReactNode;
  /** Text or controls under the card. */
  footer?: React.ReactNode;
  className?: string;
  /** Class for the card itself. */
  cardClassName?: string;
  /** id for the section heading (also used as aria-labelledby). */
  id?: string;
  children?: React.ReactNode;
};

/** A card of ListRows with dividers between them, plus an optional header. */
function ListGroup({ overline, title, meta, action, empty, footer, className, cardClassName, id, children }: ListGroupProps) {
  const autoId = React.useId();
  const headingId = id ?? `list-${autoId.replace(/:/g, "")}`;
  const rows = React.Children.toArray(children).filter(Boolean);
  const hasHeading = Boolean(overline || title);

  return (
    <section data-slot="list-group" aria-labelledby={hasHeading ? headingId : undefined} className={cn("flex flex-col", className)}>
      {overline && (
        <h2 id={headingId} className={cn("overline-label mx-1 mb-2", isIndicText(overline) && "tracking-normal normal-case")}>
          {overline}
        </h2>
      )}
      {title && !overline && (
        <div className="mb-2.5 flex min-h-6 items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id={headingId} className="text-subtitle font-semibold text-text">
              {title}
            </h2>
            {meta && <span className="text-label text-text-3">{meta}</span>}
          </div>
          {action}
        </div>
      )}
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border",
          cardClassName,
        )}
      >
        {rows.length > 0 ? rows : empty}
      </div>
      {footer && <div className="mt-2 px-1 text-label text-text-3">{footer}</div>}
    </section>
  );
}

export { ListRow, ListGroup, IconWell };
