"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs@1.1.3";

import { cn } from "./utils";

// Underline tabs: 44 px, 14 px medium; the active tab is ink with a 2 px primary underline.
// One row only (never tabs inside tabs). The row scrolls sideways with faded edges when it
// doesn't fit, and keeps the active tab in view. Counts go in `badge`.
//
//   <Tabs value={tab} onValueChange={setTab}>
//     <TabsList aria-label="Money sections">
//       <TabsTrigger value="close">Day close</TabsTrigger>
//       <TabsTrigger value="expenses" badge={2}>Expenses</TabsTrigger>
//     </TabsList>
//     <TabsContent value="close">...</TabsContent>
//   </Tabs>

const ActiveTabContext = React.createContext<string | undefined>(undefined);

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  return (
    <ActiveTabContext.Provider value={current}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col", className)}
        value={current}
        onValueChange={(next) => {
          setInner(next);
          onValueChange?.(next);
        }}
        {...props}
      />
    </ActiveTabContext.Provider>
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "no-scrollbar scroll-fade-x flex h-11 w-full items-stretch gap-5 overflow-x-auto overflow-y-hidden border-b border-border bg-surface px-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  children,
  badge,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /** Count shown after the label (pending approvals etc.); hidden when 0. */
  badge?: number | string;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const active = React.useContext(ActiveTabContext) === value;

  // Keep the active tab inside the scrolling row (moves the row only, never the page).
  React.useEffect(() => {
    const el = ref.current;
    const list = el?.parentElement;
    if (!active || !el || !list || list.scrollWidth <= list.clientWidth) return;
    const edge = 24;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.left < lr.left + edge) list.scrollLeft -= lr.left + edge - er.left;
    else if (er.right > lr.right - edge) list.scrollLeft += er.right - (lr.right - edge);
  }, [active]);

  const showBadge = badge !== undefined && badge !== 0 && badge !== "";
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      data-slot="tabs-trigger"
      className={cn(
        "relative -mb-px inline-flex h-11 min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 border-b-2 border-transparent text-body-sm font-medium whitespace-nowrap text-text-2",
        "outline-none transition-colors duration-(--dur-fast) hover:text-text",
        "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-text",
        "disabled:pointer-events-none disabled:text-text-disabled",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {showBadge && (
        <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-2 px-1.5 text-caption font-semibold text-text-2">
          {badge}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
