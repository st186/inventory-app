import * as React from "react";

import { cn } from "./utils";
import { controlClasses, useFieldControlProps } from "./field";

// Text input: 48 px, 16 px text (phones don't zoom), white, 1 px strong border, 2 px primary
// focus. Put it inside <Field> for the label, help and error. `leading` / `trailing` add an
// icon or unit inside the box (e.g. a search icon, "kg").
export type InputProps = React.ComponentPropsWithoutRef<"input"> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Class for the outer box when `leading`/`trailing` are used (className goes on the input). */
  wrapperClassName?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, type, leading, trailing, wrapperClassName, ...rest }, ref) {
  const props = useFieldControlProps(rest);

  if (!leading && !trailing) {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          controlClasses,
          "read-only:bg-surface-2 file:mr-3 file:h-8 file:rounded-sm file:border-0 file:bg-surface-2 file:px-3 file:text-label file:font-medium file:text-text",
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <div
      data-slot="input-group"
      className={cn(
        "flex h-12 w-full min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-text",
        "transition-[border-color,box-shadow] duration-(--dur-fast)",
        "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        "has-[input[aria-invalid=true]]:border-danger has-[input:disabled]:bg-surface-2",
        "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5 [&_svg]:text-text-3",
        wrapperClassName,
      )}
    >
      {leading}
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-full w-full min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-3 disabled:cursor-not-allowed disabled:text-text-disabled",
          className,
        )}
        {...props}
      />
      {trailing}
    </div>
  );
});

export { Input };
