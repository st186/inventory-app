import * as React from "react";

import { cn } from "./utils";

// Selectable pill chips (36 px visual, 44 px touch area).
//   FilterChips - one active filter (ink when on): All · Store · Production · Contract
//   ChoiceChips - a pick from a short set inside a form (primary-soft when on): kg · g · piece
// A row of chips scrolls sideways on narrow screens instead of wrapping.

export type ChipOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Count shown after the label: "To pack · 2". */
  count?: number;
  disabled?: boolean;
};

type ChipsProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: ChipOption<T>[];
  "aria-label": string;
  className?: string;
  /** Wrap onto more lines instead of scrolling sideways. */
  wrap?: boolean;
};

function ChipRow<T extends string>({
  value,
  onValueChange,
  options,
  className,
  wrap,
  selectedClasses,
  ...aria
}: ChipsProps<T> & { selectedClasses: string }) {
  return (
    <div
      role="group"
      aria-label={aria["aria-label"]}
      data-slot="chip-row"
      className={cn(
        "flex gap-2",
        wrap ? "flex-wrap" : "no-scrollbar -mx-4 overflow-x-auto px-4 py-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "hit-44 inline-flex h-9 min-h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-label font-medium whitespace-nowrap",
              "outline-none transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected ? selectedClasses : "border-border-strong bg-surface text-text hover:bg-surface-2",
            )}
          >
            {option.label}
            {typeof option.count === "number" && <span className="num">· {option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Filter row: the active chip is ink with white text. */
function FilterChips<T extends string>(props: ChipsProps<T>) {
  return <ChipRow {...props} selectedClasses="border-text bg-text text-surface font-semibold" />;
}

/** In-form choice (units, quick amounts): the active chip is primary-soft with a primary border. */
function ChoiceChips<T extends string>(props: ChipsProps<T>) {
  return <ChipRow {...props} wrap={props.wrap ?? true} selectedClasses="border-primary bg-primary-soft text-primary font-semibold" />;
}

/** A chip that opens something (date, store): 36 px pill with optional icons, like a select. */
const SelectChip = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { leadingIcon?: React.ReactNode; trailingIcon?: React.ReactNode }
>(function SelectChip({ className, leadingIcon, trailingIcon, children, type, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      data-slot="select-chip"
      className={cn(
        "hit-44 inline-flex h-9 min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 text-label font-medium whitespace-nowrap text-text",
        "outline-none transition-colors duration-(--dur-fast) hover:bg-surface-2 active:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});

export { FilterChips, ChoiceChips, SelectChip };
