"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch@1.1.3";

import { cn } from "./utils";

// On/off switch: a 44 x 24 track (primary when on) inside a 48 x 44 touch area. Give it a
// visible label (<label htmlFor> or aria-label).
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch peer relative inline-flex h-11 min-h-11 w-12 min-w-12 shrink-0 items-center justify-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none flex h-6 w-11 items-center rounded-full bg-border-strong p-0.5 transition-colors duration-(--dur-fast) ease-standard",
          "group-data-[state=checked]/switch:bg-primary",
          "group-focus-visible/switch:ring-2 group-focus-visible/switch:ring-ring group-focus-visible/switch:ring-offset-2 group-focus-visible/switch:ring-offset-surface",
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className="pointer-events-none block size-5 rounded-full bg-surface shadow-e1 transition-transform duration-(--dur-fast) ease-standard data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
