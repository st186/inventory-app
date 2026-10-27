import * as React from "react";

import { cn } from "./utils";
import { useT } from "../../utils/i18n";

// Grey placeholder shapes that mirror the content while it loads (never a blank spinner screen
// and never "0" as a stand-in value). Shimmer goes surface-2 -> surface-3; it is the only
// looping animation in the design and stops under reduced motion.
//
//   {loading ? <SkeletonListRows count={5} /> : <ListGroup>...</ListGroup>}
//   <Delayed when={loading}><SkeletonStatTiles count={4} /></Delayed>   // only after 300 ms

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("skeleton-shimmer rounded-md", className)} {...props} />;
}

/** Shows children only after `when` has stayed true for `delay` ms, so quick loads don't flash. */
function Delayed({ when = true, delay = 300, children }: { when?: boolean; delay?: number; children: React.ReactNode }) {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (!when) {
      setShow(false);
      return;
    }
    const id = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(id);
  }, [when, delay]);
  return show ? <>{children}</> : null;
}

/** A few lines of text. */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/** One StatTile's shape. */
function SkeletonStatTile({ hero = false, className }: { hero?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col rounded-lg border border-border bg-surface", hero ? "gap-3 p-4" : "gap-2 p-3.5", className)} aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className={hero ? "h-9 w-40" : "h-7 w-28"} />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

/** A 2-column grid of StatTile shapes. */
function SkeletonStatTiles({ count = 4, className }: { count?: number; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)} role="status" aria-label={t("common.loading")}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStatTile key={i} />
      ))}
    </div>
  );
}

/** ListRow shapes inside a list-group card. */
function SkeletonListRows({
  count = 5,
  leading = "icon",
  className,
}: {
  count?: number;
  leading?: "icon" | "avatar" | "none";
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border", className)}
      role="status"
      aria-label={t("common.loading")}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-h-15 items-center gap-3 px-4 py-2.5">
          {leading === "icon" && <Skeleton className="size-9 shrink-0" />}
          {leading === "avatar" && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-4", i % 2 ? "w-2/5" : "w-3/5")} />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/** A chart card's shape. */
function SkeletonChart({ height = 180, className }: { height?: number; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-border bg-surface p-4", className)} role="status" aria-label={t("common.loading")}>
      <Skeleton className="h-5 w-40" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

/** Stand-in for a sheet/dialog whose code is still loading: the scrim plus a sheet shape. */
function SkeletonSheet() {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-(--z-sheet) flex items-end bg-scrim md:items-center md:justify-center" role="status" aria-label={t("common.loading")} aria-busy="true">
      <div className="flex w-full flex-col gap-4 rounded-t-xl bg-bg p-4 pb-8 shadow-sheet md:max-w-[480px] md:rounded-xl md:shadow-e3">
        <div className="mx-auto h-1 w-9 rounded-full bg-border-strong md:hidden" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-13 w-full" />
      </div>
    </div>
  );
}

export { Skeleton, Delayed, SkeletonText, SkeletonStatTile, SkeletonStatTiles, SkeletonListRows, SkeletonChart, SkeletonSheet };
