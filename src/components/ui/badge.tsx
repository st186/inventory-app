import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";
import { cva, type VariantProps } from "class-variance-authority@0.7.1";

import { cn } from "./utils";

// Small label pill (24 px, 12 px medium, fully rounded), same shape as StatusChip. Prefer
// StatusChip for statuses; Badge suits counts and plain tags ("Incharge", "4").
// Older variant names still work: default/secondary = neutral, destructive = danger.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 text-caption font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-2 text-text-2",
        brand: "border-brand-saffron-border bg-brand-saffron-soft text-text",
        primary: "border-transparent bg-primary text-on-primary",
        success: "border-success-border bg-success-soft text-success",
        warning: "border-warning-border bg-warning-soft text-warning",
        danger: "border-danger-border bg-danger-soft text-danger",
        info: "border-info-border bg-info-soft text-info",
        outline: "border-border-strong bg-surface text-text",
        // legacy aliases
        default: "border-border bg-surface-2 text-text-2",
        secondary: "border-border bg-surface-2 text-text-2",
        destructive: "border-danger-border bg-danger-soft text-danger",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
