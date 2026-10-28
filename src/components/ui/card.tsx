import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";

import { cn } from "./utils";

// Flat white card: 1 px border, 14 px corners, 16 px padding, no shadow, no coloured header.
// `asChild` makes a whole card a link or button (it then gets a press state).
//
//   <Card>
//     <CardHeader><CardTitle>Today's brief</CardTitle><CardAction>...</CardAction></CardHeader>
//     ...
//   </Card>

type CardProps = React.ComponentProps<"div"> & {
  asChild?: boolean;
  /** Tinted only when its status is bad (with an icon and a word inside). */
  tone?: "default" | "danger" | "warning" | "success" | "info";
  /** Remove the padding (for cards that hold a ListGroup or a table). */
  flush?: boolean;
};

const toneClasses: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "border-border bg-surface",
  danger: "border-danger-border bg-danger-soft",
  warning: "border-warning-border bg-warning-soft",
  success: "border-success-border bg-success-soft",
  info: "border-info-border bg-info-soft",
};

function Card({ className, asChild = false, tone = "default", flush = false, ...props }: CardProps) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-lg border text-text",
        !flush && "p-4",
        toneClasses[tone],
        asChild &&
          "text-left no-underline outline-none transition-colors duration-(--dur-fast) hover:bg-surface-2/60 active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex min-w-0 items-center gap-2", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("min-w-0 flex-1 text-subtitle font-semibold text-text", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-body-sm text-text-2", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("ml-auto flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
