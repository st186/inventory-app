"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox@1.1.4";
import { CheckIcon, MinusIcon } from "lucide-react@0.487.0";

import { cn } from "./utils";

// Checkbox: a 20 px box in a 44 px touch area (negative margin keeps the layout at 20 px).
// Best inside a row whose whole <label> is tappable.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative -m-3 inline-flex size-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 items-center justify-center rounded-xs border-[1.5px] border-border-strong bg-surface text-on-primary transition-colors duration-(--dur-fast)",
          "group-data-[state=checked]/checkbox:border-primary group-data-[state=checked]/checkbox:bg-primary",
          "group-data-[state=indeterminate]/checkbox:border-primary group-data-[state=indeterminate]/checkbox:bg-primary",
          "group-aria-[invalid=true]/checkbox:border-danger",
          "group-focus-visible/checkbox:ring-2 group-focus-visible/checkbox:ring-ring group-focus-visible/checkbox:ring-offset-2 group-focus-visible/checkbox:ring-offset-surface",
        )}
      >
        <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center">
          {props.checked === "indeterminate" ? <MinusIcon className="size-3.5" strokeWidth={3} /> : <CheckIcon className="size-3.5" strokeWidth={3} />}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
