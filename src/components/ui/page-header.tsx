import * as React from "react";
import { ArrowLeft } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { IconButton } from "./icon-button";
import { useT } from "../../utils/i18n";

// The one header pattern for a screen (no hero banners).
//   Phone: [back] title (18 semibold) + optional caption · up to 2 icon actions. 56 px, white,
//          bottom border, sticky.
//   Desktop (>= 1024 px): title 22 semibold + subtitle 14, primary action on the right.
// Chips (store / date) and Tabs go in `children`, under the title row.
//
//   <PageHeader title="Money" actions={<IconButton label="Search" icon={<Search />} />}>
//     <Tabs ...><TabsList>...</TabsList></Tabs>
//   </PageHeader>

export type PageHeaderProps = {
  title: React.ReactNode;
  /** Phone: small line under the title ("Fri 27 Oct · Store"). Desktop: shown as the subtitle. */
  caption?: React.ReactNode;
  /** Desktop subtitle (falls back to caption). */
  subtitle?: React.ReactNode;
  /** Shows a back arrow (pushed pages). */
  onBack?: () => void;
  backLabel?: string;
  /** Left of the title, e.g. the logo on Home. */
  leading?: React.ReactNode;
  /** Up to two IconButtons (and an overflow) on the right. */
  actions?: React.ReactNode;
  /** The main action; shown in the header from 1024 px (phones use a sticky footer or FAB). */
  primaryAction?: React.ReactNode;
  /** Chip row and/or tabs under the title row. */
  children?: React.ReactNode;
  sticky?: boolean;
  className?: string;
};

function PageHeader({
  title,
  caption,
  subtitle,
  onBack,
  backLabel,
  leading,
  actions,
  primaryAction,
  children,
  sticky = true,
  className,
}: PageHeaderProps) {
  const { t } = useT();
  return (
    <header
      data-slot="page-header"
      className={cn(
        "border-b border-border bg-surface",
        sticky && "sticky top-0 z-(--z-sticky)",
        className,
      )}
    >
      <div className={cn("flex min-h-14 items-center gap-1 pr-2 lg:min-h-16 lg:px-8", onBack ? "pl-1" : "pl-4")}>
        {onBack && <IconButton label={backLabel ?? t("common.back")} icon={<ArrowLeft />} onClick={onBack} />}
        {leading && <span className="mr-1.5 flex shrink-0 items-center">{leading}</span>}
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <h1 className="truncate text-title font-semibold text-text lg:text-title-lg">{title}</h1>
          {(caption || subtitle) && (
            <>
              {caption && <span className="truncate text-caption text-text-3 lg:hidden">{caption}</span>}
              <span className="hidden truncate text-body-sm text-text-2 lg:block">{subtitle ?? caption}</span>
            </>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center">{actions}</div>}
        {primaryAction && <div className="ml-2 hidden shrink-0 lg:flex">{primaryAction}</div>}
      </div>
      {children && <div className="lg:px-4">{children}</div>}
    </header>
  );
}

export { PageHeader };
