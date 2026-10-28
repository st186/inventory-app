"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react@0.487.0";

import { cn } from "./utils";

// Tables are for desktop (>= 1024 px). On phones show the same records as ListRows.
// Header 13 px medium text-2 on surface-2 (optionally sticky), cells 14 px, figures right-
// aligned and tabular (`numeric`), rows highlight on hover. Sortable headers are buttons
// with aria-sort.

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto rounded-lg border border-border bg-surface", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-body-sm text-text", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  sticky = false,
  ...props
}: React.ComponentProps<"thead"> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-surface-2 [&_tr]:border-b [&_tr]:border-border", sticky && "sticky top-0 z-(--z-sticky)", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-surface-2 font-semibold [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-surface-2/60 data-[state=selected]:bg-primary-soft",
        className,
      )}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc" | false;

function TableHead({
  className,
  numeric = false,
  sortDirection,
  onSort,
  children,
  ...props
}: React.ComponentProps<"th"> & {
  /** Right-align (amounts, counts). */
  numeric?: boolean;
  /** Current sort on this column; pass with onSort to make the header a sort button. */
  sortDirection?: SortDirection;
  onSort?: () => void;
}) {
  const sortable = Boolean(onSort);
  const ariaSort = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : sortable ? "none" : undefined;
  return (
    <th
      data-slot="table-head"
      aria-sort={ariaSort}
      className={cn(
        "h-11 px-4 align-middle text-label font-medium whitespace-nowrap text-text-2",
        numeric ? "text-right" : "text-left",
        sortable && "px-2",
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "hit-44 inline-flex h-9 min-h-9 items-center gap-1 rounded-sm px-2 text-label font-medium text-text-2 outline-none hover:bg-surface-3 hover:text-text focus-visible:ring-2 focus-visible:ring-ring",
            numeric && "flex-row-reverse",
          )}
        >
          {children}
          {sortDirection === "asc" ? (
            <ArrowUp className="size-4" aria-hidden="true" />
          ) : sortDirection === "desc" ? (
            <ArrowDown className="size-4" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="size-4 text-text-3" aria-hidden="true" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle",
        numeric && "num text-right whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-label text-text-3", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
