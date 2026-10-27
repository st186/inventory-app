import * as React from "react";

import { cn } from "./utils";

// 2-4 equal options for peer views and filters: Store / Production, Today / Week / Month,
// Cash / Paytm / Split. A radiogroup: arrow keys move the choice, only the selected option is
// in the tab order. 44 px tall track; the selected option is white with elevation 1.
//
//   <SegmentedControl aria-label="Paid from" value={paidFrom} onValueChange={setPaidFrom}
//     options={[{ value: "cash", label: "Cash" }, { value: "paytm", label: "Paytm" }, { value: "split", label: "Split" }]} />

export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Language of the label, e.g. "bn" for বাংলা in a language picker. */
  lang?: string;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentOption<T>[];
  "aria-label": string;
  /** "md" 44 px track (forms), "sm" 40 px visual (filter rows). */
  size?: "md" | "sm";
  /** Selected label colour: ink (default) or primary (language picker). */
  selectedTone?: "neutral" | "primary";
  className?: string;
  disabled?: boolean;
};

function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  selectedTone = "neutral",
  className,
  disabled,
  ...aria
}: SegmentedControlProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o) => !(disabled || o.disabled));

  const move = (from: number, step: number) => {
    const n = options.length;
    for (let i = 1; i <= n; i++) {
      const next = (from + step * i + n * n) % n;
      if (enabled[next]) {
        onValueChange(options[next].value);
        refs.current[next]?.focus();
        return;
      }
    }
  };

  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(-1, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      move(options.length, -1);
    }
  };

  const selectedIndex = options.findIndex((o) => o.value === value);

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      aria-disabled={disabled || undefined}
      data-slot="segmented-control"
      className={cn("grid gap-0.5 rounded-md bg-surface-2 p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const focusable = selected || (selectedIndex === -1 && index === 0);
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={option.lang}
            disabled={!enabled[index]}
            tabIndex={focusable ? 0 : -1}
            onClick={() => !selected && onValueChange(option.value)}
            onKeyDown={onKeyDown(index)}
            className={cn(
              "hit-44 inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm px-2 font-semibold whitespace-nowrap",
              "outline-none transition-[background-color,color,box-shadow] duration-(--dur-fast) ease-standard",
              "focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:text-text-disabled",
              "[&_svg]:size-4 [&_svg]:shrink-0",
              size === "md" ? "min-h-[38px] text-body-sm" : "min-h-[34px] text-label",
              selected
                ? cn("bg-surface shadow-e1", selectedTone === "primary" ? "text-primary" : "text-text")
                : "text-text-2 hover:text-text",
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
