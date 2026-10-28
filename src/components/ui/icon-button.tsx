import * as React from "react";
import { Loader2 } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { useT } from "../../utils/i18n";

// Icon-only button: 44 x 44, ghost by default. A label is required (it becomes aria-label and
// the tooltip), and an optional count shows as a small badge (99+ above 99) that is read out
// as part of the label ("Notifications, 7 new").
export type IconButtonProps = Omit<React.ComponentPropsWithoutRef<"button">, "children"> & {
  /** What the button does, for screen readers and the tooltip. */
  label: string;
  /** The icon (a lucide element, an Avatar, or an <img>). */
  icon: React.ReactNode;
  variant?: "ghost" | "secondary" | "primary" | "danger-ghost";
  /** md is 44 px; sm is a 36 px visual with a 44 px touch area. */
  size?: "md" | "sm";
  /** Count badge; hidden when 0 or undefined. */
  badge?: number;
  /** Override for the spoken badge text (default "{n} new"). */
  badgeLabel?: string;
  loading?: boolean;
  /** Renders a link (<a href>) instead of a button. */
  href?: string;
};

const variantClasses: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  ghost: "bg-transparent text-text-2 hover:bg-surface-2 hover:text-text active:bg-surface-3",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-2 active:bg-surface-3",
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed",
  "danger-ghost": "bg-transparent text-danger hover:bg-danger-soft active:bg-danger-soft",
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  badge,
  badgeLabel,
  loading = false,
  href,
  className,
  disabled,
  type,
  ...props
}, ref) {
  const { t } = useT();
  const hasBadge = typeof badge === "number" && badge > 0;
  const spoken = hasBadge ? `${label}, ${badgeLabel ?? t("common.newCount", { n: badge })}` : label;
  const classes = cn(
    "relative inline-flex shrink-0 items-center justify-center rounded-full outline-none",
    "transition-colors duration-(--dur-fast) ease-standard",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
    size === "md" ? "size-11 min-h-11 min-w-11" : "hit-44 size-9 min-h-9 min-w-9",
    variantClasses[variant],
    className,
  );
  const content = (
    <>
      {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : icon}
      {hasBadge && (
        <span
          aria-hidden="true"
          className="num pointer-events-none absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-caption font-semibold leading-[18px] text-on-danger"
        >
          {(badge ?? 0) > 99 ? "99+" : badge}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a
        data-slot="icon-button"
        href={href}
        aria-label={spoken}
        title={label}
        className={classes}
        onClick={props.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      data-slot="icon-button"
      type={type ?? "button"}
      aria-label={spoken}
      title={label}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </button>
  );
});

export { IconButton };
