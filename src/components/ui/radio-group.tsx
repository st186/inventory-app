"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group@1.2.3";

import { cn } from "./utils";

// Radio buttons: a 20 px circle in a 44 px touch area. For 2-4 short options side by side,
// SegmentedControl is usually better; radios suit lists (date presets, reasons).
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio peer relative -m-3 inline-flex size-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-[1.5px] border-border-strong bg-surface transition-colors duration-(--dur-fast)",
          "group-data-[state=checked]/radio:border-primary",
          "group-focus-visible/radio:ring-2 group-focus-visible/radio:ring-ring group-focus-visible/radio:ring-offset-2 group-focus-visible/radio:ring-offset-surface",
        )}
      >
        <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className="size-2.5 rounded-full bg-primary" />
      </span>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
