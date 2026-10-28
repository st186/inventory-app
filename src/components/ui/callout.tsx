import * as React from "react";
import type { LucideIcon } from "lucide-react@0.487.0";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Lightbulb } from "lucide-react@0.487.0";

import { cn } from "./utils";

// A short message in the flow of a screen: soft background, matching 1 px border, an icon, a
// bold one-line title and an optional body and action. Replaces emoji-led paragraphs and
// gradient info banners. Long explanations go behind a link that opens a sheet.
//
//   <Callout tone="warning" title="2 prices look wrong" href="#/money/price-check">Cabbage ₹800 a bundle? Tap to check</Callout>
//   <Callout tone="danger" title="Chicken cheese momo is out of stock">Marked 6:40 pm</Callout>
//   <Callout tone="neutral" icon={<img src="/bunny-logo.png" alt="" />} title="Bunny filled this in">...</Callout>

export type CalloutTone = "neutral" | "info" | "warning" | "danger" | "success";

const toneClasses: Record<CalloutTone, { box: string; icon: string; title: string }> = {
  neutral: { box: "border-border bg-surface", icon: "text-text-2", title: "text-text" },
  info: { box: "border-info-border bg-info-soft", icon: "text-info", title: "text-text" },
  warning: { box: "border-warning-border bg-warning-soft", icon: "text-warning", title: "text-text" },
  danger: { box: "border-danger-border bg-danger-soft", icon: "text-danger", title: "text-danger" },
  success: { box: "border-success-border bg-success-soft", icon: "text-success", title: "text-text" },
};

const defaultIcons: Record<CalloutTone, LucideIcon> = {
  neutral: Lightbulb,
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
  success: CheckCircle2,
};

export type CalloutProps = {
  tone?: CalloutTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** A lucide icon component, any element (e.g. the bunny logo), or false for none. */
  icon?: LucideIcon | React.ReactElement | false;
  /** A link or button shown under the body. */
  action?: React.ReactNode;
  /** Makes the whole callout a link (with a chevron). */
  href?: string;
  onClick?: () => void;
  /** Announce it when it appears (alerts that arrive while the screen is open). */
  live?: boolean;
  className?: string;
};

function Callout({ tone = "neutral", title, children, icon, action, href, onClick, live, className }: CalloutProps) {
  const styles = toneClasses[tone];
  const interactive = Boolean(href || onClick);
  let iconNode: React.ReactNode = null;
  if (icon !== false) {
    if (React.isValidElement(icon)) iconNode = <span className="flex size-7 shrink-0 items-center justify-center [&_img]:size-7 [&_img]:object-contain">{icon}</span>;
    else {
      const Icon = (icon as LucideIcon | undefined) ?? defaultIcons[tone];
      iconNode = <Icon className={cn("mt-px size-5 shrink-0", styles.icon)} aria-hidden="true" />;
    }
  }

  const content = (
    <>
      {iconNode}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <span className={cn("text-body-sm font-semibold", styles.title)}>{title}</span>}
        {children && <span className="text-label text-text-2">{children}</span>}
        {action && <span className="mt-1.5 flex flex-wrap gap-2">{action}</span>}
      </span>
      {interactive && <ChevronRight className={cn("size-5 shrink-0 self-center", styles.icon)} aria-hidden="true" />}
    </>
  );

  const classes = cn(
    "flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-text no-underline",
    styles.box,
    interactive && "cursor-pointer outline-none transition-[filter] duration-(--dur-fast) hover:brightness-[0.98] active:brightness-95 focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const role = live ? (tone === "danger" || tone === "warning" ? "alert" : "status") : undefined;

  if (href) {
    return (
      <a data-slot="callout" href={href} onClick={onClick} className={classes} role={role}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button data-slot="callout" type="button" onClick={onClick} className={classes} role={role}>
        {content}
      </button>
    );
  }
  return (
    <div data-slot="callout" className={classes} role={role}>
      {content}
    </div>
  );
}

export { Callout };
